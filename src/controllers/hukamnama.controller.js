const db = require('../config/db');
const { fetchAndStoreTodayHukamnama } = require('../services/hukamnama.service');

/**
 * POST /api/v1/admin/hukamnama
 * Publishes (or overwrites) the entry for a given date. This is a
 * publishing tool, not a generator — admin pastes in the day's actual
 * reading, normally sourced from Sri Darbar Sahib's own daily broadcast/
 * publication, so what flashes on member dashboards is always the real
 * Hukamnama and never fabricated text.
 */
async function adminUpsert(req, res) {
  const { hukam_date, gurmukhi_text, transliteration, english_translation, source_name, source_url, is_active } = req.body;
  if (!hukam_date) return res.status(400).json({ error: 'missing_fields', message: 'hukam_date is required' });
  if (!gurmukhi_text && !english_translation) {
    return res.status(400).json({ error: 'missing_fields', message: 'Provide at least the Gurmukhi text or an English translation' });
  }

  await db.query(
    `INSERT INTO hukamnama (hukam_date, gurmukhi_text, transliteration, english_translation, source_name, source_url, is_active)
     VALUES (:hukam_date, :gurmukhi_text, :transliteration, :english_translation, :source_name, :source_url, :is_active)
     ON DUPLICATE KEY UPDATE
       gurmukhi_text = VALUES(gurmukhi_text), transliteration = VALUES(transliteration),
       english_translation = VALUES(english_translation), source_name = VALUES(source_name),
       source_url = VALUES(source_url), is_active = VALUES(is_active)`,
    {
      hukam_date,
      gurmukhi_text: gurmukhi_text || null,
      transliteration: transliteration || null,
      english_translation: english_translation || null,
      source_name: source_name || 'Sri Darbar Sahib, Amritsar',
      source_url: source_url || null,
      is_active: is_active === false ? 0 : 1,
    }
  );

  res.status(201).json({ saved: true, hukam_date });
}

/** GET /api/v1/admin/hukamnama — recent entries for the admin publishing history view */
async function adminList(req, res) {
  const [rows] = await db.query('SELECT * FROM hukamnama ORDER BY hukam_date DESC LIMIT 60');
  res.json(rows);
}

/** DELETE /api/v1/admin/hukamnama/:id */
async function adminRemove(req, res) {
  await db.query('DELETE FROM hukamnama WHERE id = :id', { id: req.params.id });
  res.status(204).send();
}

/**
 * GET /api/v1/content/hukamnama/today
 * Powers the flashing banner on the member dashboard. Falls back to the
 * most recent active entry if today's hasn't been posted yet, so the
 * banner never shows blank.
 */
async function publicToday(req, res) {
  const [[today]] = await db.query(
    'SELECT * FROM hukamnama WHERE hukam_date = CURDATE() AND is_active = 1 LIMIT 1'
  );
  if (today) return res.json(today);

  // Nobody's posted today's entry yet (admin or otherwise) — pull it live
  // from Sri Darbar Sahib's public feed so the banner still shows the real
  // day's reading instead of yesterday's.
  try {
    await fetchAndStoreTodayHukamnama();
    const [[justFetched]] = await db.query(
      'SELECT * FROM hukamnama WHERE hukam_date = CURDATE() AND is_active = 1 LIMIT 1'
    );
    if (justFetched) return res.json(justFetched);
  } catch (err) {
    console.error('publicToday: auto-fetch failed', err);
  }

  const [[latest]] = await db.query(
    'SELECT * FROM hukamnama WHERE is_active = 1 ORDER BY hukam_date DESC LIMIT 1'
  );
  res.json(latest || null);
}

module.exports = { adminUpsert, adminList, adminRemove, publicToday };
