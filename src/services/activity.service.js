const db = require('../config/db');

async function logActivity(userId, icon, description) {
  await db.query(
    'INSERT INTO activity_log (user_id, icon, description) VALUES (:userId, :icon, :description)',
    { userId, icon, description }
  );
}

module.exports = { logActivity };
