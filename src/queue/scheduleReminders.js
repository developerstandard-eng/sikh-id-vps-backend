/**
 * Run this on a daily cron (e.g. via crontab or node-cron) — it finds every
 * user due for a nudge and enqueues one job per user onto the reminder
 * queue. The actual sending happens in reminderWorker.js so a slow SES call
 * never blocks the scan, and failures retry independently per user.
 *
 * Example crontab entry (runs daily at 9am server time):
 *   0 9 * * * cd /path/to/vps-backend && node src/queue/scheduleReminders.js >> /var/log/sikh-id-reminders.log 2>&1
 */
require('dotenv').config();
const { reminderQueue } = require('./queue');
const { findEligibleUsers } = require('../services/reminder.service');

(async () => {
  const users = await findEligibleUsers();
  console.log(`[scheduleReminders] ${users.length} users eligible for a reminder`);

  for (const user of users) {
    await reminderQueue.add(
      'send-reminder',
      { userId: user.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 }
    );
  }

  console.log('[scheduleReminders] done, exiting');
  process.exit(0);
})().catch((err) => {
  console.error('[scheduleReminders] failed', err);
  process.exit(1);
});
