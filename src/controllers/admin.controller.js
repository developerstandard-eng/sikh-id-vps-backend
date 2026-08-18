const db = require('../config/db');

/**
 * GET /api/v1/admin/stats
 * Powers the admin overview page: headline numbers + completion distribution
 * so you can see at a glance how the member base is trending, not just
 * individual profiles.
 */
async function getStats(req, res) {
  const [[totals]] = await db.query(
    `SELECT
       COUNT(*) AS total_users,
       ROUND(AVG(profile_completion), 1) AS avg_completion,
       SUM(CASE WHEN profile_completion = 100 THEN 1 ELSE 0 END) AS complete_count,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_last_30_days
     FROM users WHERE status = 'active'`
  );

  const [buckets] = await db.query(
    `SELECT
       CASE
         WHEN profile_completion < 30 THEN '0-29%'
         WHEN profile_completion < 60 THEN '30-59%'
         WHEN profile_completion < 100 THEN '60-99%'
         ELSE '100%'
       END AS bucket,
       COUNT(*) AS count
     FROM users WHERE status = 'active'
     GROUP BY bucket`
  );

  const [topIndustries] = await db.query(
    `SELECT industry, COUNT(*) AS count FROM profile_professional
     WHERE industry IS NOT NULL GROUP BY industry ORDER BY count DESC LIMIT 6`
  );

  const [topInterests] = await db.query(
    `SELECT interest_tag, COUNT(*) AS count FROM user_interests
     GROUP BY interest_tag ORDER BY count DESC LIMIT 6`
  );

  const [emailStats] = await db.query(
    `SELECT email_type, COUNT(*) AS count FROM email_events
     WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY email_type`
  );

  res.json({ totals, buckets, topIndustries, topInterests, emailStats });
}

/**
 * GET /api/v1/admin/users?search=&completion_min=&completion_max=&page=&pageSize=
 * Paginated, searchable member list for the admin dashboard.
 */
async function listUsers(req, res) {
  const { search, completion_min, completion_max, page = 1, pageSize = 25 } = req.query;
  const where = ["status = 'active'"];
  const params = {};

  if (search) {
    where.push('(full_name LIKE :search OR email LIKE :search OR sikh_id LIKE :search)');
    params.search = `%${search}%`;
  }
  if (completion_min != null && completion_min !== '') {
    where.push('profile_completion >= :completionMin');
    params.completionMin = Number(completion_min);
  }
  if (completion_max != null && completion_max !== '') {
    where.push('profile_completion <= :completionMax');
    params.completionMax = Number(completion_max);
  }

  const limit = Math.min(Number(pageSize) || 25, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users WHERE ${where.join(' AND ')}`, params);
  const [rows] = await db.query(
    `SELECT id, sikh_id, full_name, email, country, profile_completion, source_site, created_at
     FROM users WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  res.json({ total, page: Number(page), pageSize: limit, users: rows });
}

/**
 * DELETE /api/v1/admin/users/:id
 * Permanently removes a member and everything tied to their account
 * (profile sections, interests, sessions, refresh tokens) — those tables
 * all reference users.id with ON DELETE CASCADE. Meant for cleaning up
 * test/duplicate accounts; there's no undo.
 */
async function deleteUser(req, res) {
  const { id } = req.params;

  const [result] = await db.query('DELETE FROM users WHERE id = :id', { id });
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'not_found', message: 'No member with that id' });
  }

  res.json({ deleted: true, id: Number(id) });
}

module.exports = { getStats, listUsers, deleteUser };
