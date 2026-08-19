const db = require('../config/db');

const API_URL = 'https://api.gurbaninow.com/v2/hukamnama/today';
const FETCH_TIMEOUT_MS = 6000;

/**
 * Pulls today's actual Hukamnama from Sri Darbar Sahib's public feed
 * (GurbaniNow, sourced from the daily broadcast) and stores it — this is
 * what lets the dashboard banner "just appear" without an admin pasting
 * it in by hand. Uses INSERT IGNORE so a manual admin entry for the same
 * date is never clobbered, and is safe to call from concurrent requests
 * (hukam_date is UNIQUE — only one insert wins, the rest are no-ops).
 */
async function fetchAndStoreTodayHukamnama() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let data;
  try {
    const res = await fetch(API_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`gurbaninow responded ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timeout);
  }

  if (data.error || !Array.isArray(data.hukamnama) || data.hukamnama.length === 0) {
    throw new Error('gurbaninow returned no hukamnama for today');
  }

  const lines = data.hukamnama.map((item) => item.line);
  const gurmukhi_text = lines.map((l) => l.gurmukhi?.unicode).filter(Boolean).join('\n');
  const transliteration = lines.map((l) => l.transliteration?.english?.text).filter(Boolean).join('\n');
  const english_translation = lines.map((l) => l.translation?.english?.default).filter(Boolean).join('\n');

  const { year, monthno, date } = data.date.gregorian;
  const hukam_date = `${year}-${String(monthno).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

  const [result] = await db.query(
    `INSERT IGNORE INTO hukamnama (hukam_date, gurmukhi_text, transliteration, english_translation, source_name, source_url, is_active)
     VALUES (:hukam_date, :gurmukhi_text, :transliteration, :english_translation, :source_name, :source_url, 1)`,
    {
      hukam_date,
      gurmukhi_text,
      transliteration,
      english_translation,
      source_name: 'Sri Darbar Sahib, Amritsar',
      source_url: 'https://hukamnama.khalsa.tech',
    }
  );

  return { hukam_date, inserted: result.affectedRows > 0 };
}

module.exports = { fetchAndStoreTodayHukamnama };
