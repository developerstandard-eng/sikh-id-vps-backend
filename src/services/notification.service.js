const db = require('../config/db');

/**
 * Fans a notification out to every active user in one query rather than
 * one INSERT per user — matters once the member base grows past a
 * handful of test accounts.
 */
async function notifyAllActiveUsers(icon, title, linkUrl = null) {
  await db.query(
    `INSERT INTO notifications (user_id, icon, title, link_url)
     SELECT id, :icon, :title, :linkUrl FROM users WHERE status = 'active'`,
    { icon, title, linkUrl }
  );
}

async function notifyUser(userId, icon, title, linkUrl = null) {
  await db.query(
    'INSERT INTO notifications (user_id, icon, title, link_url) VALUES (:userId, :icon, :title, :linkUrl)',
    { userId, icon, title, linkUrl }
  );
}

module.exports = { notifyAllActiveUsers, notifyUser };
