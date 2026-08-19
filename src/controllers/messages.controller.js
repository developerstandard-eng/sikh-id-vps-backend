const db = require('../config/db');
const { notifyUser } = require('../services/notification.service');

/** GET /api/v1/messages/conversations */
async function listConversations(req, res) {
  const userId = req.user.id;
  const [rows] = await db.query(
    `SELECT c.id, c.last_message_at,
            IF(c.user_a_id = :userId, c.user_b_id, c.user_a_id) AS other_user_id,
            u.full_name AS other_full_name, u.sikh_id AS other_sikh_id,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != :userId AND m.read_at IS NULL) AS unread
     FROM conversations c
     JOIN users u ON u.id = IF(c.user_a_id = :userId, c.user_b_id, c.user_a_id)
     WHERE c.user_a_id = :userId OR c.user_b_id = :userId
     ORDER BY c.last_message_at DESC`,
    { userId }
  );
  res.json(rows);
}

/** POST /api/v1/messages/conversations — body: { sikh_id }, starts (or reuses) a conversation with that member */
async function startConversation(req, res) {
  const userId = req.user.id;
  const { sikh_id } = req.body;
  if (!sikh_id) return res.status(400).json({ error: 'missing_fields' });

  const [[target]] = await db.query(
    'SELECT id, full_name, sikh_id, allow_direct_messages FROM users WHERE sikh_id = :sikh_id AND status = "active"',
    { sikh_id }
  );
  if (!target) return res.status(404).json({ error: 'user_not_found', message: 'No member found with that Sikh ID' });
  if (target.id === userId) return res.status(400).json({ error: 'cannot_message_self' });
  if (!target.allow_direct_messages) {
    return res.status(403).json({ error: 'messages_not_allowed', message: `${target.full_name} isn't accepting direct messages` });
  }

  const a = Math.min(userId, target.id);
  const b = Math.max(userId, target.id);

  await db.query('INSERT IGNORE INTO conversations (user_a_id, user_b_id) VALUES (:a, :b)', { a, b });
  const [[conv]] = await db.query('SELECT id FROM conversations WHERE user_a_id = :a AND user_b_id = :b', { a, b });

  res.status(201).json({ conversation_id: conv.id, other_full_name: target.full_name, other_sikh_id: target.sikh_id });
}

/** GET /api/v1/messages/conversations/:id/messages */
async function listMessages(req, res) {
  const userId = req.user.id;
  const convId = req.params.id;

  const [[conv]] = await db.query(
    'SELECT * FROM conversations WHERE id = :id AND (user_a_id = :userId OR user_b_id = :userId)',
    { id: convId, userId }
  );
  if (!conv) return res.status(404).json({ error: 'not_found' });

  const [rows] = await db.query(
    'SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = :convId ORDER BY created_at ASC LIMIT 200',
    { convId }
  );
  res.json(rows);
}

/** POST /api/v1/messages/conversations/:id/messages — body: { body } */
async function sendMessage(req, res) {
  const userId = req.user.id;
  const convId = req.params.id;
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'missing_body' });

  const [[conv]] = await db.query(
    'SELECT * FROM conversations WHERE id = :id AND (user_a_id = :userId OR user_b_id = :userId)',
    { id: convId, userId }
  );
  if (!conv) return res.status(404).json({ error: 'not_found' });

  const trimmed = body.trim();
  const [result] = await db.query(
    'INSERT INTO messages (conversation_id, sender_id, body) VALUES (:convId, :userId, :body)',
    { convId, userId, body: trimmed }
  );
  await db.query('UPDATE conversations SET last_message_at = NOW() WHERE id = :convId', { convId });

  const otherUserId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id;
  const [[me]] = await db.query('SELECT full_name FROM users WHERE id = :id', { id: userId });
  await notifyUser(otherUserId, '💬', `New message from ${me.full_name}`, '/dashboard/messages');

  res.status(201).json({ id: result.insertId, sender_id: userId, body: trimmed, created_at: new Date() });
}

/** POST /api/v1/messages/conversations/:id/read */
async function markRead(req, res) {
  await db.query(
    `UPDATE messages m
     JOIN conversations c ON c.id = m.conversation_id
     SET m.read_at = NOW()
     WHERE m.conversation_id = :convId AND m.sender_id != :userId AND m.read_at IS NULL
       AND (c.user_a_id = :userId OR c.user_b_id = :userId)`,
    { convId: req.params.id, userId: req.user.id }
  );
  res.json({ read: true });
}

/** GET /api/v1/messages/unread-count — lightweight, for the sidebar badge */
async function unreadCount(req, res) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE (c.user_a_id = :userId OR c.user_b_id = :userId) AND m.sender_id != :userId AND m.read_at IS NULL`,
    { userId: req.user.id }
  );
  res.json({ unread: row.total });
}

module.exports = { listConversations, startConversation, listMessages, sendMessage, markRead, unreadCount };
