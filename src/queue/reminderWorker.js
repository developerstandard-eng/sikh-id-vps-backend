/**
 * Long-running worker process — keep this alive under PM2 (see
 * ecosystem.config.js). Consumes jobs added by scheduleReminders.js and
 * actually sends the email via SES.
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const db = require('../config/db');
const { sendReminderToUser } = require('../services/reminder.service');

const worker = new Worker(
  'reminder-emails',
  async (job) => {
    const { userId } = job.data;
    const [[user]] = await db.query('SELECT * FROM users WHERE id = :id AND status = "active"', { id: userId });
    if (!user) return { skipped: true, reason: 'user_not_found' };

    const section = await sendReminderToUser(user, process.env.APP_BASE_URL);
    return { userId, section };
  },
  { connection, concurrency: 5 }
);

worker.on('completed', (job, result) => {
  console.log(`[reminderWorker] job ${job.id} done`, result);
});
worker.on('failed', (job, err) => {
  console.error(`[reminderWorker] job ${job?.id} failed`, err.message);
});

console.log('[reminderWorker] listening for jobs...');
