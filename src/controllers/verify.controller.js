const db = require('../config/db');

/**
 * GET /api/v1/verify/:sikhId — public, unauthenticated. Backs the QR code
 * printed on a member's Sikh ID card, so anyone scanning it can confirm the
 * card is genuine without needing to log in. Only non-sensitive fields.
 */
async function verifyPublic(req, res) {
  const { sikhId } = req.params;
  const [[user]] = await db.query(
    'SELECT sikh_id, full_name, status, created_at FROM users WHERE sikh_id = :sikhId',
    { sikhId }
  );

  if (!user) return res.status(404).json({ valid: false });

  res.json({
    valid: user.status === 'active',
    sikh_id: user.sikh_id,
    full_name: user.full_name,
    member_since: new Date(user.created_at).getFullYear(),
  });
}

module.exports = { verifyPublic };
