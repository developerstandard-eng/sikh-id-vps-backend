const db = require('../config/db');

/** GET /api/v1/admin/events — full list including drafts/cancelled, for the admin table */
async function adminList(req, res) {
  const [rows] = await db.query('SELECT * FROM events ORDER BY event_date DESC');
  res.json(rows);
}

/** POST /api/v1/admin/events */
async function adminCreate(req, res) {
  const { title, description, event_type, location, is_virtual, event_date, event_time, image_url, cta_label, cta_url, status } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'missing_fields', message: 'title and event_date are required' });

  const [result] = await db.query(
    `INSERT INTO events (title, description, event_type, location, is_virtual, event_date, event_time, image_url, cta_label, cta_url, status)
     VALUES (:title, :description, :event_type, :location, :is_virtual, :event_date, :event_time, :image_url, :cta_label, :cta_url, :status)`,
    {
      title, description: description || null, event_type: event_type || 'community',
      location: location || null, is_virtual: is_virtual ? 1 : 0, event_date, event_time: event_time || null,
      image_url: image_url || null, cta_label: cta_label || null, cta_url: cta_url || null, status: status || 'published',
    }
  );
  res.status(201).json({ id: result.insertId });
}

/** PATCH /api/v1/admin/events/:id */
async function adminUpdate(req, res) {
  const { id } = req.params;
  const fields = ['title', 'description', 'event_type', 'location', 'is_virtual', 'event_date', 'event_time', 'image_url', 'cta_label', 'cta_url', 'status'];
  const updates = [];
  const params = { id };
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = :${f}`);
      params[f] = f === 'is_virtual' ? (req.body[f] ? 1 : 0) : req.body[f];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'no_fields' });

  await db.query(`UPDATE events SET ${updates.join(', ')} WHERE id = :id`, params);
  res.json({ updated: true });
}

/** DELETE /api/v1/admin/events/:id */
async function adminRemove(req, res) {
  await db.query('DELETE FROM events WHERE id = :id', { id: req.params.id });
  res.status(204).send();
}

/**
 * GET /api/v1/content/events?type=&upcoming=true
 * Public-to-members read used by the dashboard's "Upcoming events" card,
 * business events section, and calendar view. Only returns published,
 * non-cancelled events, soonest first.
 */
async function publicList(req, res) {
  const { type, from, to } = req.query;
  const where = ["status = 'published'"];
  const params = {};

  if (type) {
    where.push('event_type = :type');
    params.type = type;
  }
  if (from) {
    where.push('event_date >= :from');
    params.from = from;
  } else {
    where.push('event_date >= CURDATE()'); // default to upcoming only
  }
  if (to) {
    where.push('event_date <= :to');
    params.to = to;
  }

  const [rows] = await db.query(
    `SELECT id, title, description, event_type, location, is_virtual, event_date, event_time, image_url, cta_label, cta_url
     FROM events WHERE ${where.join(' AND ')} ORDER BY event_date ASC LIMIT 200`,
    params
  );
  res.json(rows);
}

module.exports = { adminList, adminCreate, adminUpdate, adminRemove, publicList };
