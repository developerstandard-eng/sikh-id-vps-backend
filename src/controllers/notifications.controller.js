const db = require('../config/db');

/** GET /api/v1/content/notifications */
async function list(req, res) {
  const userId = req.user.id;
  const [rows] = await db.query(
    'SELECT id, icon, title, link_url, read_at, created_at FROM notifications WHERE user_id = :userId ORDER BY created_at DESC LIMIT 50',
    { userId }
  );
  const [[{ unread }]] = await db.query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = :userId AND read_at IS NULL',
    { userId }
  );
  res.json({ items: rows, unread });
}

/** POST /api/v1/content/notifications/:id/read */
async function markRead(req, res) {
  await db.query(
    'UPDATE notifications SET read_at = NOW() WHERE id = :id AND user_id = :userId AND read_at IS NULL',
    { id: req.params.id, userId: req.user.id }
  );
  res.json({ read: true });
}

/** POST /api/v1/content/notifications/read-all */
async function markAllRead(req, res) {
  await db.query('UPDATE notifications SET read_at = NOW() WHERE user_id = :userId AND read_at IS NULL', { userId: req.user.id });
  res.json({ read: true });
}

module.exports = { list, markRead, markAllRead };
