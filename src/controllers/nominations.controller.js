const db = require('../config/db');
const { sendEmail } = require('../services/email.service');

const FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'date', 'select', 'url'];

// mysql2 returns JSON columns already parsed on some driver/column configs
// and as a raw string on others — same defensive check segments.controller.js
// uses for filter_json.
function asJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// Nomination field values are free text from a public form — escape before
// dropping them into the notification email's HTML.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizeFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw Object.assign(new Error('fields must be a non-empty array'), { status: 400 });
  }

  const seenKeys = new Set();
  return fields.map((f, i) => {
    const key = String(f.key || '').trim();
    const label = String(f.label || '').trim();
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';

    if (!key || !label) {
      throw Object.assign(new Error(`field[${i}] needs both a key and a label`), { status: 400 });
    }
    if (seenKeys.has(key)) {
      throw Object.assign(new Error(`duplicate field key "${key}"`), { status: 400 });
    }
    seenKeys.add(key);

    const field = { key, label, type, required: !!f.required };
    if (type === 'select') {
      field.options = Array.isArray(f.options) ? f.options.map(String).filter(Boolean) : [];
    }
    return field;
  });
}

/**
 * GET /api/v1/nomination-form
 * Called by the WP plugin (site-secret only, no user token needed yet) right
 * after a successful sign-up to decide whether to show the nomination step
 * at all, and which fields to render. 404 means this site hasn't had a form
 * configured in the admin panel — the plugin should skip straight to the
 * dashboard redirect in that case.
 */
async function getForm(req, res) {
  const [[form]] = await db.query(
    'SELECT id, title, fields_json FROM nomination_forms WHERE site_domain = :siteDomain AND is_active = 1',
    { siteDomain: req.siteDomain }
  );

  if (!form) {
    return res.status(404).json({ error: 'no_form_for_site', message: 'No nomination form is configured for this site' });
  }

  res.json({ id: form.id, title: form.title, fields: asJson(form.fields_json) });
}

/**
 * POST /api/v1/nominations
 * Called by the WP plugin once the member submits the nomination form,
 * carrying the access token issued at sign-up so we know who submitted it.
 * Body: { data: { <field key>: <value>, ... } }
 */
async function submit(req, res) {
  const { data } = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'missing_fields', message: 'data object is required' });
  }

  const [[form]] = await db.query(
    'SELECT id, title, fields_json FROM nomination_forms WHERE site_domain = :siteDomain AND is_active = 1',
    { siteDomain: req.siteDomain }
  );
  if (!form) {
    return res.status(404).json({ error: 'no_form_for_site', message: 'No nomination form is configured for this site' });
  }
  const fields = asJson(form.fields_json);

  const missing = fields.filter((f) => f.required && !String(data[f.key] ?? '').trim()).map((f) => f.label);
  if (missing.length) {
    return res.status(400).json({ error: 'missing_fields', message: `Please fill in: ${missing.join(', ')}` });
  }

  // Only keep values for keys the form actually defines, in the form's own field order.
  const cleanData = {};
  for (const f of fields) {
    if (data[f.key] != null && data[f.key] !== '') cleanData[f.key] = String(data[f.key]).trim();
  }

  const [result] = await db.query(
    `INSERT INTO nominations (user_id, form_id, site_domain, data) VALUES (:userId, :formId, :siteDomain, :data)`,
    { userId: req.user.id, formId: form.id, siteDomain: req.siteDomain, data: JSON.stringify(cleanData) }
  );

  const notifyTo = process.env.NOMINATION_NOTIFY_EMAIL;
  if (notifyTo) {
    try {
      const rowsHtml = fields
        .filter((f) => cleanData[f.key])
        .map((f) => `<tr><td style="padding:6px 12px;color:#888;font-size:13px;white-space:nowrap;">${escapeHtml(f.label)}</td><td style="padding:6px 12px;color:#0d1b3d;font-size:13px;">${escapeHtml(cleanData[f.key])}</td></tr>`)
        .join('');

      const [[submitter]] = await db.query('SELECT full_name, email, sikh_id FROM users WHERE id = :id', { id: req.user.id });

      await sendEmail({
        to: notifyTo,
        subject: `New Nomination — ${form.title} (${req.siteDomain})`,
        templateKey: 'nomination-notification',
        vars: {
          form_title: form.title,
          site_domain: req.siteDomain,
          submitter_name: submitter?.full_name || '',
          submitter_email: submitter?.email || '',
          submitter_sikh_id: submitter?.sikh_id || '',
          fields_rows: rowsHtml,
        },
      });
    } catch (err) {
      console.error('nominations.submit: sendEmail failed', err); // delivery failure doesn't block submission
    }
  }

  res.status(201).json({ id: result.insertId, submitted: true });
}

/** GET /api/v1/admin/nominations?site_domain=&page=&pageSize= */
async function adminList(req, res) {
  const { site_domain, page = 1, pageSize = 25 } = req.query;
  const where = [];
  const params = {};

  if (site_domain) {
    where.push('n.site_domain = :siteDomain');
    params.siteDomain = site_domain;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limit = Math.min(Number(pageSize) || 25, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM nominations n ${whereSql}`, params);
  const [rows] = await db.query(
    `SELECT n.id, n.site_domain, n.data, n.created_at, f.title AS form_title,
            u.id AS user_id, u.full_name AS submitted_by_name, u.email AS submitted_by_email, u.sikh_id AS submitted_by_sikh_id
     FROM nominations n
     JOIN nomination_forms f ON f.id = n.form_id
     JOIN users u ON u.id = n.user_id
     ${whereSql}
     ORDER BY n.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  res.json({
    total,
    page: Number(page),
    pageSize: limit,
    nominations: rows.map((r) => ({ ...r, data: asJson(r.data) })),
  });
}

/** GET /api/v1/admin/nominations/:id */
async function adminGet(req, res) {
  const [[row]] = await db.query(
    `SELECT n.id, n.site_domain, n.data, n.created_at, f.title AS form_title, f.fields_json,
            u.id AS user_id, u.full_name AS submitted_by_name, u.email AS submitted_by_email, u.sikh_id AS submitted_by_sikh_id
     FROM nominations n
     JOIN nomination_forms f ON f.id = n.form_id
     JOIN users u ON u.id = n.user_id
     WHERE n.id = :id`,
    { id: req.params.id }
  );
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ ...row, data: asJson(row.data), fields_json: asJson(row.fields_json) });
}

/** GET /api/v1/admin/nomination-forms — one row per site, for the form-builder's site picker */
async function adminListForms(req, res) {
  const [rows] = await db.query(
    `SELECT f.id, f.site_domain, f.title, f.fields_json, f.is_active, f.updated_at,
            (SELECT COUNT(*) FROM nominations n WHERE n.form_id = f.id) AS submission_count
     FROM nomination_forms f ORDER BY f.site_domain`
  );
  res.json(rows.map((r) => ({ ...r, fields_json: asJson(r.fields_json) })));
}

/** GET /api/v1/admin/nomination-forms/:site_domain */
async function adminGetForm(req, res) {
  const [[form]] = await db.query('SELECT * FROM nomination_forms WHERE site_domain = :siteDomain', {
    siteDomain: req.params.site_domain,
  });
  if (!form) return res.status(404).json({ error: 'not_found' });
  res.json({ ...form, fields_json: asJson(form.fields_json) });
}

/**
 * PUT /api/v1/admin/nomination-forms/:site_domain
 * Upsert — creates the form the first time a site is configured, updates it
 * (including re-ordering/renaming/removing fields) on every save after that.
 * Body: { title, fields: [...], is_active }
 */
async function adminUpsertForm(req, res) {
  const siteDomain = req.params.site_domain;
  const allowed = (process.env.ALLOWED_SITE_DOMAINS || '').split(',').map((d) => d.trim());
  if (!allowed.includes(siteDomain)) {
    return res.status(400).json({ error: 'site_not_allowed', message: `${siteDomain} is not in ALLOWED_SITE_DOMAINS` });
  }

  let fields;
  try {
    fields = normalizeFields(req.body.fields);
  } catch (err) {
    return res.status(err.status || 400).json({ error: 'invalid_fields', message: err.message });
  }

  const title = String(req.body.title || 'To Nominate').trim();
  const isActive = req.body.is_active !== false;

  await db.query(
    `INSERT INTO nomination_forms (site_domain, title, fields_json, is_active)
     VALUES (:siteDomain, :title, :fields, :isActive)
     ON DUPLICATE KEY UPDATE title = :title, fields_json = :fields, is_active = :isActive`,
    { siteDomain, title, fields: JSON.stringify(fields), isActive }
  );

  const [[form]] = await db.query('SELECT * FROM nomination_forms WHERE site_domain = :siteDomain', { siteDomain });
  res.json({ ...form, fields_json: asJson(form.fields_json) });
}

/** DELETE /api/v1/admin/nomination-forms/:site_domain */
async function adminDeleteForm(req, res) {
  await db.query('DELETE FROM nomination_forms WHERE site_domain = :siteDomain', { siteDomain: req.params.site_domain });
  res.status(204).send();
}

module.exports = {
  getForm,
  submit,
  adminList,
  adminGet,
  adminListForms,
  adminGetForm,
  adminUpsertForm,
  adminDeleteForm,
};
