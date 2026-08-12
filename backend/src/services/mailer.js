// Real email delivery via Resend's HTTP API. Requires two env vars on Render
// (Settings -> Environment, on the courtiq-web/backend service):
//   RESEND_API_KEY   from https://resend.com/api-keys
//   MAIL_FROM        e.g. "CourtIQ <onboarding@resend.dev>" for the test
//                     domain, or "CourtIQ <you@yourdomain.com>" once you
//                     verify a real domain in Resend
//
// Uses HTTPS, not SMTP, so it works on Render's free tier (which blocks
// outbound SMTP ports 25/465/587).

async function sendMail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    const err = new Error('Email is not configured: set RESEND_API_KEY and MAIL_FROM env vars.');
    err.code = 'MAILER_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Resend send failed (${res.status}): ${body}`);
    err.code = 'MAILER_SEND_FAILED';
    throw err;
  }

  return res.json();
}

module.exports = { sendMail };