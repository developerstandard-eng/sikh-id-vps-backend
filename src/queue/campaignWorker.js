/**
 * Consumes manual-campaign jobs created from the admin dashboard
 * (POST /api/v1/campaigns/send). One job per recipient, same pattern as
 * the auto-reminder worker so both share retry/backoff behaviour.
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const connection = require('../config/redis');
const db = require('../config/db');
const { sendEmail } = require('../services/email.service');

const worker = new Worker(
  'campaign-emails',
  async (job) => {
    const { userId, segmentId, subject, bodyHtml, ctaLabel, ctaUrl } = job.data;
    const [[user]] = await db.query('SELECT * FROM users WHERE id = :id AND status = "active"', { id: userId });
    if (!user) return { skipped: true, reason: 'user_not_found' };

    await sendEmail({
      to: user.email,
      subject,
      templateKey: 'campaign-generic',
      vars: {
        full_name: user.full_name,
        body_html: bodyHtml,
        cta_label: ctaLabel || 'Open Sikh ID',
        cta_url: ctaUrl || `${process.env.APP_BASE_URL}/dashboard`,
        unsubscribe_url: `${process.env.APP_BASE_URL}/preferences?uid=${user.id}`,
      },
    });

    await db.query(
      `INSERT INTO email_events (user_id, email_type, segment_id, template_key, status)
       VALUES (:userId, 'manual_campaign', :segmentId, 'campaign-generic', 'sent')`,
      { userId, segmentId: segmentId || null }
    );

    return { userId, sent: true };
  },
  { connection, concurrency: 5 }
);

worker.on('completed', (job, result) => console.log(`[campaignWorker] job ${job.id} done`, result));
worker.on('failed', (job, err) => console.error(`[campaignWorker] job ${job?.id} failed`, err.message));

console.log('[campaignWorker] listening for jobs...');
