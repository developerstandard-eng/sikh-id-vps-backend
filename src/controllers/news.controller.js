const db = require('../config/db');

/** GET /api/v1/admin/news */
async function adminList(req, res) {
  const [rows] = await db.query('SELECT * FROM news_updates ORDER BY published_at DESC');
  res.json(rows);
}

/** POST /api/v1/admin/news */
async function adminCreate(req, res) {
  const { title, body, category, image_url, cta_label, cta_url, status, published_at } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'missing_fields', message: 'title and body are required' });

  const [result] = await db.query(
    `INSERT INTO news_updates (title, body, category, image_url, cta_label, cta_url, status, published_at)
     VALUES (:title, :body, :category, :image_url, :cta_label, :cta_url, :status, :published_at)`,
    {
      title, body, category: category || 'news', image_url: image_url || null,
      cta_label: cta_label || null, cta_url: cta_url || null, status: status || 'published',
      published_at: published_at || new Date(),
    }
  );
  res.status(201).json({ id: result.insertId });
}

/** PATCH /api/v1/admin/news/:id */
async function adminUpdate(req, res) {
  const { id } = req.params;
  const fields = ['title', 'body', 'category', 'image_url', 'cta_label', 'cta_url', 'status', 'published_at'];
  const updates = [];
  const params = { id };
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = :${f}`);
      params[f] = req.body[f];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'no_fields' });

  await db.query(`UPDATE news_updates SET ${updates.join(', ')} WHERE id = :id`, params);
  res.json({ updated: true });
}

/** DELETE /api/v1/admin/news/:id */
async function adminRemove(req, res) {
  await db.query('DELETE FROM news_updates WHERE id = :id', { id: req.params.id });
  res.status(204).send();
}

/** GET /api/v1/content/news — the dashboard "news corner", published only, newest first */
async function publicList(req, res) {
  const { category, limit = 10 } = req.query;
  const where = ["status = 'published'"];
  const params = {};
  if (category) {
    where.push('category = :category');
    params.category = category;
  }

  const [rows] = await db.query(
    `SELECT id, title, body, category, image_url, cta_label, cta_url, published_at
     FROM news_updates WHERE ${where.join(' AND ')} ORDER BY published_at DESC LIMIT ${Math.min(Number(limit) || 10, 50)}`,
    params
  );
  res.json(rows);
}

module.exports = { adminList, adminCreate, adminUpdate, adminRemove, publicList };
