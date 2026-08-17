// PM2 process file — runs the API and both background workers.
// Start everything with: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'sikh-id-api',
      script: 'src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'sikh-id-reminder-worker',
      script: 'src/queue/reminderWorker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'sikh-id-campaign-worker',
      script: 'src/queue/campaignWorker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
  ],
};
