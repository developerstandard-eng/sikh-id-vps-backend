/**
 * One-off migration: rewrites existing TSG-XXXXX Sikh IDs to the new
 * TSID-XXXXX format (same numeric part, prefix swap only). Run once on the
 * VPS with `node src/scripts/migrateSikhIdPrefix.js` — safe to re-run, it
 * only touches rows still starting with "TSG-".
 */
const db = require('../config/db');

async function main() {
  const [before] = await db.query("SELECT id, sikh_id FROM users WHERE sikh_id LIKE 'TSG-%'");
  console.log(`Found ${before.length} user(s) with a TSG- Sikh ID.`);
  before.forEach((u) => console.log(`  ${u.id}: ${u.sikh_id}`));

  if (before.length === 0) {
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  const [result] = await db.query("UPDATE users SET sikh_id = REPLACE(sikh_id, 'TSG-', 'TSID-') WHERE sikh_id LIKE 'TSG-%'");
  console.log(`Updated ${result.affectedRows} row(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
