const nodemailer = require('nodemailer');

// Real email delivery via Gmail SMTP. Requires two env vars on Render
// (Settings -> Environment, on the courtiq-web/backend service):
//   GMAIL_USER            e.g. yourteam@gmail.com
//   GMAIL_APP_PASSWORD    a 16-character Google App Password, NOT the
//                          normal account password -- generate one at
//                          https://myaccount.google.com/apppasswords
//                          (requires 2-Step Verification enabled first)
//
// Gmail's free sending limit is ~500 emails/day, which is far more than
// this app needs for invite emails.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    const err = new Error('Email is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD env vars.');
    err.code = 'MAILER_NOT_CONFIGURED';
    throw err;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  const from = process.env.GMAIL_USER;
  return t.sendMail({ from: `CourtIQ <${from}>`, to, subject, html, text });
}

module.exports = { sendMail };