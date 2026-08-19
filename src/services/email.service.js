const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'email');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function renderTemplate(templateKey, vars = {}) {
  const filePath = path.join(TEMPLATE_DIR, `${templateKey}.html`);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v ?? '');
  }
  return html;
}

// Gmail SMTP always sends from the authenticated account (GMAIL_USER) —
// unlike SES it won't let you send as an arbitrary verified domain address.
async function sendEmail({ to, subject, templateKey, vars }) {
  const html = renderTemplate(templateKey, vars);

  return transporter.sendMail({
    from: `${process.env.EMAIL_FROM_NAME || 'The Sikh ID'} <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail, renderTemplate };
