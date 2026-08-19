const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { recalculate } = require('../services/completionScore.service');
const { sendEmail } = require('../services/email.service');

function generateSikhId(numericId) {
  return `TSG-${10000 + Number(numericId)}`;
}

function issueTokens(user) {
  const accessToken = jwt.sign(
    { sub: user.id, sikh_id: user.sikh_id, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
  );
  const refreshToken = jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_TTL || '30d',
  });
  return { accessToken, refreshToken };
}

async function storeRefreshToken(userId, refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const days = parseInt(process.env.JWT_REFRESH_TTL) || 30;
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (:userId, :tokenHash, DATE_ADD(NOW(), INTERVAL :days DAY))',
    { userId, tokenHash, days }
  );
}

/**
 * POST /api/v1/auth/register
 * Called by the WP plugin's quick sign-up form (name, email, mobile, country, password).
 * Creates the user at 15% completion (basic identity only) and returns tokens
 * so the plugin can log them straight in on the WP site they registered from.
 */
async function register(req, res) {
  const { full_name, email, mobile, country, password } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'missing_fields', message: 'full_name, email and password are required' });
  }

  const [[existing]] = await db.query('SELECT id FROM users WHERE email = :email', { email });
  if (existing) {
    return res.status(409).json({ error: 'email_exists', message: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [result] = await db.query(
    `INSERT INTO users (sikh_id, full_name, email, mobile, country, password_hash, source_site, profile_completion, last_recalculated_at)
     VALUES ('PENDING', :full_name, :email, :mobile, :country, :passwordHash, :sourceSite, 15, NOW())`,
    { full_name, email, mobile: mobile || null, country: country || null, passwordHash, sourceSite: req.siteDomain || null }
  );

  const sikhId = generateSikhId(result.insertId);
  await db.query('UPDATE users SET sikh_id = :sikhId WHERE id = :id', { sikhId, id: result.insertId });

  const [[user]] = await db.query('SELECT * FROM users WHERE id = :id', { id: result.insertId });
  const { accessToken, refreshToken } = issueTokens(user);
  await storeRefreshToken(user.id, refreshToken);

  res.status(201).json({
    sikh_id: user.sikh_id,
    full_name: user.full_name,
    email: user.email,
    profile_completion: user.profile_completion,
    accessToken,
    refreshToken,
  });
}

/** POST /api/v1/auth/login */
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const [[user]] = await db.query('SELECT * FROM users WHERE email = :email AND status = "active"', { email });
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'invalid_credentials' });

  const { accessToken, refreshToken } = issueTokens(user);
  await storeRefreshToken(user.id, refreshToken);

  res.json({
    sikh_id: user.sikh_id,
    full_name: user.full_name,
    email: user.email,
    profile_completion: user.profile_completion,
    accessToken,
    refreshToken,
  });
}

/** POST /api/v1/auth/refresh */
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid_refresh_token' });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const [[stored]] = await db.query(
    'SELECT * FROM refresh_tokens WHERE user_id = :userId AND token_hash = :tokenHash AND expires_at > NOW()',
    { userId: payload.sub, tokenHash }
  );
  if (!stored) return res.status(401).json({ error: 'refresh_token_revoked' });

  const [[user]] = await db.query('SELECT * FROM users WHERE id = :id', { id: payload.sub });
  const { accessToken } = issueTokens(user);

  res.json({ accessToken });
}

/**
 * GET /api/v1/auth/sso/authorize?site_domain=X&redirect_uri=Y
 * Step 1 of cross-domain SSO. Called when a user who is ALREADY logged in
 * on one Sikh Group site clicks through to another. Requires a valid
 * access token (the plugin sends it as a Bearer header from the first
 * site's stored session). Issues a one-time code the second site exchanges
 * for its own token — this is the same pattern as OAuth2's authorization
 * code flow, scoped down for a first-party network of sites you control.
 */
async function ssoAuthorize(req, res) {
  const { site_domain, redirect_uri } = req.query;
  if (!site_domain || !redirect_uri) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const allowed = (process.env.ALLOWED_SITE_DOMAINS || '').split(',').map((d) => d.trim());
  if (!allowed.includes(site_domain)) {
    return res.status(403).json({ error: 'site_not_allowed' });
  }

  const code = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sso_codes (code, user_id, site_domain, redirect_uri, expires_at)
     VALUES (:code, :userId, :siteDomain, :redirectUri, DATE_ADD(NOW(), INTERVAL 2 MINUTE))`,
    { code, userId: req.user.id, siteDomain: site_domain, redirectUri: redirect_uri }
  );

  res.json({ redirect_url: `${redirect_uri}?sso_code=${code}` });
}

/**
 * POST /api/v1/auth/sso/exchange
 * Step 2. The destination WP site's plugin exchanges the one-time code for
 * real access + refresh tokens, then logs the user in locally.
 */
async function ssoExchange(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'missing_code' });

  const [[row]] = await db.query(
    'SELECT * FROM sso_codes WHERE code = :code AND consumed = 0 AND expires_at > NOW()',
    { code }
  );
  if (!row) return res.status(401).json({ error: 'invalid_or_expired_code' });

  await db.query('UPDATE sso_codes SET consumed = 1 WHERE code = :code', { code });

  const [[user]] = await db.query('SELECT * FROM users WHERE id = :id', { id: row.user_id });
  const { accessToken, refreshToken } = issueTokens(user);
  await storeRefreshToken(user.id, refreshToken);

  res.json({
    sikh_id: user.sikh_id,
    full_name: user.full_name,
    email: user.email,
    profile_completion: user.profile_completion,
    accessToken,
    refreshToken,
  });
}

/**
 * POST /api/v1/auth/forgot-password
 * Always responds with a generic 200 regardless of whether the email is on
 * file, so this can't be used to enumerate registered accounts.
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'missing_fields' });

  const [[user]] = await db.query('SELECT * FROM users WHERE email = :email AND status = "active"', { email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (:userId, :tokenHash, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      { userId: user.id, tokenHash }
    );

    await sendEmail({
      to: user.email,
      subject: 'Reset your Sikh ID password',
      templateKey: 'password-reset',
      vars: {
        full_name: user.full_name,
        reset_url: `${process.env.APP_BASE_URL}/reset-password?token=${rawToken}`,
      },
    });
  }

  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}

/** POST /api/v1/auth/reset-password */
async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'missing_fields' });
  if (password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [[stored]] = await db.query(
    'SELECT * FROM password_reset_tokens WHERE token_hash = :tokenHash AND consumed = 0 AND expires_at > NOW()',
    { tokenHash }
  );
  if (!stored) return res.status(401).json({ error: 'invalid_or_expired_token' });

  const passwordHash = await bcrypt.hash(password, 12);
  await db.query('UPDATE users SET password_hash = :passwordHash WHERE id = :id', { passwordHash, id: stored.user_id });
  await db.query('UPDATE password_reset_tokens SET consumed = 1 WHERE id = :id', { id: stored.id });
  // A password reset means any device holding an old refresh token should be signed out.
  await db.query('DELETE FROM refresh_tokens WHERE user_id = :id', { id: stored.user_id });

  res.json({ message: 'Password updated. Please log in with your new password.' });
}

/**
 * POST /api/v1/auth/otp/request
 * Same enumeration-safe shape as forgot-password: always 200.
 */
async function requestLoginOtp(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'missing_fields' });

  const [[user]] = await db.query('SELECT * FROM users WHERE email = :email AND status = "active"', { email });

  if (user) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    await db.query('DELETE FROM login_otps WHERE user_id = :userId AND consumed = 0', { userId: user.id });
    await db.query(
      `INSERT INTO login_otps (user_id, code_hash, expires_at)
       VALUES (:userId, :codeHash, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      { userId: user.id, codeHash }
    );

    await sendEmail({
      to: user.email,
      subject: 'Your Sikh ID login code',
      templateKey: 'login-otp',
      vars: { full_name: user.full_name, otp_code: code },
    });
  }

  res.json({ message: 'If an account exists for that email, a login code has been sent.' });
}

/** POST /api/v1/auth/otp/verify */
async function verifyLoginOtp(req, res) {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'missing_fields' });

  const [[user]] = await db.query('SELECT * FROM users WHERE email = :email AND status = "active"', { email });
  if (!user) return res.status(401).json({ error: 'invalid_or_expired_code' });

  const [[otp]] = await db.query(
    'SELECT * FROM login_otps WHERE user_id = :userId AND consumed = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
    { userId: user.id }
  );
  if (!otp) return res.status(401).json({ error: 'invalid_or_expired_code' });

  if (otp.attempts >= 5) {
    return res.status(401).json({ error: 'too_many_attempts', message: 'Request a new code' });
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  if (codeHash !== otp.code_hash) {
    await db.query('UPDATE login_otps SET attempts = attempts + 1 WHERE id = :id', { id: otp.id });
    return res.status(401).json({ error: 'invalid_or_expired_code' });
  }

  await db.query('UPDATE login_otps SET consumed = 1 WHERE id = :id', { id: otp.id });

  const { accessToken, refreshToken } = issueTokens(user);
  await storeRefreshToken(user.id, refreshToken);

  res.json({
    sikh_id: user.sikh_id,
    full_name: user.full_name,
    email: user.email,
    profile_completion: user.profile_completion,
    accessToken,
    refreshToken,
  });
}

module.exports = {
  register,
  login,
  refresh,
  ssoAuthorize,
  ssoExchange,
  forgotPassword,
  resetPassword,
  requestLoginOtp,
  verifyLoginOtp,
};
