const db = require('../config/db');
const { sendEmail } = require('../services/email.service');

/** GET /api/v1/support/tickets — the current user's own request history */
async function list(req, res) {
  const [rows] = await db.query(
    'SELECT id, subject, status, created_at FROM support_tickets WHERE user_id = :userId ORDER BY created_at DESC',
    { userId: req.user.id }
  );
  res.json(rows);
}

/** POST /api/v1/support/tickets — body: { subject, message } */
async function create(req, res) {
  const userId = req.user.id;
  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'missing_fields' });

  const [result] = await db.query(
    'INSERT INTO support_tickets (user_id, subject, message) VALUES (:userId, :subject, :message)',
    { userId, subject, message }
  );

  if (process.env.SUPPORT_EMAIL) {
    try {
      const [[user]] = await db.query('SELECT full_name, email, sikh_id FROM users WHERE id = :id', { id: userId });
      await sendEmail({
        to: process.env.SUPPORT_EMAIL,
        subject: `[Support] ${subject}`,
        templateKey: 'support-ticket',
        vars: { full_name: user.full_name, sikh_id: user.sikh_id, email: user.email, subject, message },
      });
    } catch (err) {
      // The ticket is already saved and visible to the member either way.
      console.error('support ticket: notification email failed', err);
    }
  }

  res.status(201).json({ id: result.insertId, subject, status: 'open', created_at: new Date() });
}

module.exports = { list, create };
