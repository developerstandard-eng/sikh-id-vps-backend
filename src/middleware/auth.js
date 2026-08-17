const jwt = require('jsonwebtoken');

/**
 * Validates the Bearer access token issued by /auth/register or /auth/login.
 * Attaches { id, sikh_id, email } to req.user on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'missing_token', message: 'Authorization header must be: Bearer <token>' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.sub, sikh_id: payload.sikh_id, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', message: 'Access token is invalid or expired' });
  }
}

/**
 * Confirms the request is coming from a WordPress site we trust — every
 * site's Sikh ID Connector plugin sends this header, configured in its
 * settings page alongside the site's own domain.
 */
function requireSiteSecret(req, res, next) {
  const secret = req.headers['x-site-secret'];
  const domain = req.headers['x-site-domain'];

  if (!secret || secret !== process.env.SITE_SHARED_SECRET) {
    return res.status(403).json({ error: 'invalid_site_secret' });
  }

  const allowed = (process.env.ALLOWED_SITE_DOMAINS || '').split(',').map((d) => d.trim());
  if (!domain || !allowed.includes(domain)) {
    return res.status(403).json({ error: 'site_not_allowed', message: `Domain ${domain} is not in ALLOWED_SITE_DOMAINS` });
  }

  req.siteDomain = domain;
  next();
}

/**
 * Protects the admin endpoints (segments, campaigns). Simple shared-secret
 * check for v1 — swap for a proper admin JWT/role system once you have
 * more than one person sending campaigns.
 */
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'admin_only' });
  }
  next();
}

module.exports = { requireAuth, requireSiteSecret, requireAdmin };
