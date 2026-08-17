const fs = require('fs');
const path = require('path');
const { SendEmailCommand } = require('@aws-sdk/client-ses');
const ses = require('../config/ses');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'email');

function renderTemplate(templateKey, vars = {}) {
  const filePath = path.join(TEMPLATE_DIR, `${templateKey}.html`);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v ?? '');
  }
  return html;
}

async function sendEmail({ to, subject, templateKey, vars }) {
  const html = renderTemplate(templateKey, vars);

  const command = new SendEmailCommand({
    Source: `${process.env.SES_FROM_NAME} <${process.env.SES_FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });

  return ses.send(command);
}

module.exports = { sendEmail, renderTemplate };
