const db = require('../config/db');

/**
 * A segment's filter_json looks like:
 * {
 *   "completion_min": 0, "completion_max": 60,
 *   "industries": ["Technology", "Finance"],
 *   "interests": ["Business & Entrepreneurship", "Investment"],
 *   "group_preferences": ["The Sikh Directory"],
 *   "countries": ["United Kingdom"],
 *   "signup_after": "2026-01-01",
 *   "signup_before": null,
 *   "wants_directory_listing": true
 * }
 * Every key is optional — omit a key to not filter on it.
 * This builds a parameterised SQL query from that definition and always
 * re-evaluates live against current data (segments are saved definitions,
 * not frozen snapshots).
 */
function buildSegmentQuery(filter) {
  const where = ["u.status = 'active'"];
  const params = {};

  if (filter.completion_min != null) {
    where.push('u.profile_completion >= :completion_min');
    params.completion_min = filter.completion_min;
  }
  if (filter.completion_max != null) {
    where.push('u.profile_completion <= :completion_max');
    params.completion_max = filter.completion_max;
  }
  if (filter.countries?.length) {
    where.push(`u.country IN (${filter.countries.map((_, i) => `:country${i}`).join(',')})`);
    filter.countries.forEach((c, i) => { params[`country${i}`] = c; });
  }
  if (filter.signup_after) {
    where.push('u.created_at >= :signup_after');
    params.signup_after = filter.signup_after;
  }
  if (filter.signup_before) {
    where.push('u.created_at <= :signup_before');
    params.signup_before = filter.signup_before;
  }
  if (filter.source_sites?.length) {
    where.push(`u.source_site IN (${filter.source_sites.map((_, i) => `:site${i}`).join(',')})`);
    filter.source_sites.forEach((s, i) => { params[`site${i}`] = s; });
  }
  if (filter.wants_directory_listing != null) {
    where.push('EXISTS (SELECT 1 FROM directory_listing d WHERE d.user_id = u.id AND d.wants_listing = :wantsListing)');
    params.wantsListing = filter.wants_directory_listing ? 1 : 0;
  }

  let joins = '';

  if (filter.industries?.length) {
    joins += ' JOIN profile_professional pp ON pp.user_id = u.id';
    where.push(`pp.industry IN (${filter.industries.map((_, i) => `:industry${i}`).join(',')})`);
    filter.industries.forEach((v, i) => { params[`industry${i}`] = v; });
  }

  if (filter.interests?.length) {
    joins += ' JOIN user_interests ui ON ui.user_id = u.id';
    where.push(`ui.interest_tag IN (${filter.interests.map((_, i) => `:interest${i}`).join(',')})`);
    filter.interests.forEach((v, i) => { params[`interest${i}`] = v; });
  }

  if (filter.group_preferences?.length) {
    joins += ' JOIN user_group_preferences ugp ON ugp.user_id = u.id AND ugp.subscribed = 1';
    where.push(`ugp.platform_name IN (${filter.group_preferences.map((_, i) => `:platform${i}`).join(',')})`);
    filter.group_preferences.forEach((v, i) => { params[`platform${i}`] = v; });
  }

  const sql = `
    SELECT DISTINCT u.id, u.sikh_id, u.full_name, u.email, u.profile_completion, u.country, u.created_at
    FROM users u
    ${joins}
    WHERE ${where.join(' AND ')}
  `;

  return { sql, params };
}

async function previewSegment(filter) {
  const { sql, params } = buildSegmentQuery(filter);
  const [rows] = await db.query(sql, params);
  return rows;
}

async function createSegment({ name, description, filter }) {
  const [result] = await db.query(
    'INSERT INTO segments (name, description, filter_json) VALUES (:name, :description, :filter)',
    { name, description: description || null, filter: JSON.stringify(filter) }
  );
  return result.insertId;
}

async function listSegments() {
  const [rows] = await db.query('SELECT id, name, description, filter_json, created_at, updated_at FROM segments ORDER BY created_at DESC');
  return rows;
}

async function getSegment(id) {
  const [[row]] = await db.query('SELECT * FROM segments WHERE id = :id', { id });
  return row;
}

async function deleteSegment(id) {
  await db.query('DELETE FROM segments WHERE id = :id', { id });
}

module.exports = { buildSegmentQuery, previewSegment, createSegment, listSegments, getSegment, deleteSegment };
