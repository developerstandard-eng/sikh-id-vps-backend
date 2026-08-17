const { Queue } = require('bullmq');
const connection = require('../config/redis');

const reminderQueue = new Queue('reminder-emails', { connection });
const campaignQueue = new Queue('campaign-emails', { connection });

module.exports = { reminderQueue, campaignQueue };
