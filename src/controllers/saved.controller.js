const db = require('../config/db');
const { logActivity } = require('../services/activity.service');

/** GET /api/v1/content/saved — powers the Saved & Favourites page */
async function list(req, res) {
  const userId = req.user.id;

  const [savedEvents] = await db.query(
    `SELECT 'event' AS item_type, e.id AS item_id, e.title AS label,
            CONCAT(DATE_FORMAT(e.event_date, '%b %e'), IF(e.location IS NOT NULL, CONCAT(' · ', e.location), '')) AS meta,
            s.created_at AS saved_at
     FROM saved_items s JOIN events e ON e.id = s.item_id
     WHERE s.user_id = :userId AND s.item_type = 'event'`,
    { userId }
  );
  const [savedNews] = await db.query(
    `SELECT 'news' AS item_type, n.id AS item_id, n.title AS label, n.category AS meta, s.created_at AS saved_at
     FROM saved_items s JOIN news_updates n ON n.id = s.item_id
     WHERE s.user_id = :userId AND s.item_type = 'news'`,
    { userId }
  );

  const rows = [...savedEvents, ...savedNews].sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
  res.json(rows);
}

/** POST /api/v1/content/saved — body: { item_type: 'event'|'news', item_id } */
async function save(req, res) {
  const userId = req.user.id;
  const { item_type, item_id } = req.body;
  if (!['event', 'news'].includes(item_type) || !item_id) {
    return res.status(400).json({ error: 'invalid_item', message: 'item_type must be "event" or "news"' });
  }

  await db.query(
    'INSERT IGNORE INTO saved_items (user_id, item_type, item_id) VALUES (:userId, :item_type, :item_id)',
    { userId, item_type, item_id }
  );
  await logActivity(userId, '⭐', `Saved a ${item_type}`);
  res.status(201).json({ saved: true });
}

/** DELETE /api/v1/content/saved/:item_type/:item_id */
async function unsave(req, res) {
  const { item_type, item_id } = req.params;
  await db.query(
    'DELETE FROM saved_items WHERE user_id = :userId AND item_type = :item_type AND item_id = :item_id',
    { userId: req.user.id, item_type, item_id }
  );
  res.json({ saved: false });
}

module.exports = { list, save, unsave };
