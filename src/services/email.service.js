const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'email');

// Plain SMTP transport so the email provider (Brevo, Gmail, SES's SMTP
// interface, etc.) is just an env var swap — no code change to switch.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
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

async function sendEmail({ to, subject, templateKey, vars }) {
  const html = renderTemplate(templateKey, vars);

  return transporter.sendMail({
    from: `${process.env.EMAIL_FROM_NAME || 'The Sikh ID'} <${process.env.EMAIL_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail, renderTemplate };
