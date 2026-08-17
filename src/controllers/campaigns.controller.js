const segmentService = require('../services/segment.service');
const { campaignQueue } = require('../queue/queue');

/**
 * POST /api/v1/campaigns/send
 * Body: { segmentId, subject, bodyHtml, ctaLabel, ctaUrl }
 * Re-evaluates the segment live, then enqueues one email job per member.
 * This is the manual-send counterpart to the automatic reminder engine —
 * same queue infrastructure, triggered from the admin dashboard instead of cron.
 */
async function send(req, res) {
  const { segmentId, subject, bodyHtml, ctaLabel, ctaUrl } = req.body;
  if (!segmentId || !subject || !bodyHtml) {
    return res.status(400).json({ error: 'missing_fields', message: 'segmentId, subject and bodyHtml are required' });
  }

  const segment = await segmentService.getSegment(segmentId);
  if (!segment) return res.status(404).json({ error: 'segment_not_found' });

  const filter = typeof segment.filter_json === 'string' ? JSON.parse(segment.filter_json) : segment.filter_json;
  const members = await segmentService.previewSegment(filter);

  for (const member of members) {
    await campaignQueue.add(
      'send-campaign',
      { userId: member.id, segmentId, subject, bodyHtml, ctaLabel, ctaUrl },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 }
    );
  }

  res.json({ queued: members.length, segment: segment.name });
}

module.exports = { send };
