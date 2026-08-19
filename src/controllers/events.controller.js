const db = require('../config/db');
const { logActivity } = require('../services/activity.service');
const { notifyAllActiveUsers } = require('../services/notification.service');

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

  if ((status || 'published') === 'published') {
    await notifyAllActiveUsers('📅', `New event: ${title}`);
  }

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
  const params = { userId: req.user.id };

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
    `SELECT e.id, e.title, e.description, e.event_type, e.location, e.is_virtual, e.event_date, e.event_time,
            e.image_url, e.cta_label, e.cta_url,
            (r.user_id IS NOT NULL) AS going, (s.user_id IS NOT NULL) AS saved
     FROM events e
     LEFT JOIN event_rsvps r ON r.event_id = e.id AND r.user_id = :userId
     LEFT JOIN saved_items s ON s.item_type = 'event' AND s.item_id = e.id AND s.user_id = :userId
     WHERE ${where.join(' AND ')} ORDER BY e.event_date ASC LIMIT 200`,
    params
  );
  res.json(rows);
}

/** POST /api/v1/content/events/:id/rsvp */
async function rsvp(req, res) {
  const userId = req.user.id;
  const eventId = req.params.id;

  const [[event]] = await db.query('SELECT id, title FROM events WHERE id = :id', { id: eventId });
  if (!event) return res.status(404).json({ error: 'not_found' });

  await db.query('INSERT IGNORE INTO event_rsvps (user_id, event_id) VALUES (:userId, :eventId)', { userId, eventId });
  await logActivity(userId, '🎉', `RSVP'd going to "${event.title}"`);
  res.json({ going: true });
}

/** DELETE /api/v1/content/events/:id/rsvp */
async function unrsvp(req, res) {
  await db.query('DELETE FROM event_rsvps WHERE user_id = :userId AND event_id = :eventId', { userId: req.user.id, eventId: req.params.id });
  res.json({ going: false });
}

module.exports = { adminList, adminCreate, adminUpdate, adminRemove, publicList, rsvp, unrsvp };
