const db = require('../config/db');

/** GET /api/v1/content/activity — powers the My Activity page */
async function list(req, res) {
  const [rows] = await db.query(
    'SELECT icon, description, created_at FROM activity_log WHERE user_id = :userId ORDER BY created_at DESC LIMIT 50',
    { userId: req.user.id }
  );
  res.json(rows);
}

module.exports = { list };
