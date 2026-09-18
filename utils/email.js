// utils/email.js
// Brevo transactional email sender - works on Render free tier (HTTPS, not SMTP)

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail(mailOptions) {
  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY missing - cannot send email');
    return { success: false, error: 'BREVO_API_KEY missing' };
  }

  let sender;
  if (typeof mailOptions.from === 'string') {
    sender = { email: mailOptions.from, name: process.env.BREVO_SENDER_NAME || 'Healthcare System' };
  } else if (mailOptions.from && mailOptions.from.email) {
    sender = { email: mailOptions.from.email, name: mailOptions.from.name || process.env.BREVO_SENDER_NAME || 'Healthcare System' };
  } else {
    sender = { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'Healthcare System' };
  }

  let recipients;
  if (typeof mailOptions.to === 'string') {
    recipients = [{ email: mailOptions.to }];
  } else if (Array.isArray(mailOptions.to)) {
    recipients = mailOptions.to.map(t => typeof t === 'string' ? { email: t } : { email: t.email, name: t.name });
  } else if (mailOptions.to && mailOptions.to.email) {
    recipients = [{ email: mailOptions.to.email, name: mailOptions.to.name }];
  } else {
    console.error('sendEmail: no recipient specified');
    return { success: false, error: 'No recipient' };
  }

  const body = {
    sender,
    to: recipients,
    subject: mailOptions.subject,
    htmlContent: mailOptions.html || '<p>' + (mailOptions.text || '') + '</p>',
    textContent: mailOptions.text || undefined
  };

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Brevo send failed:', res.status, data);
      return { success: false, error: data.message || ('HTTP ' + res.status) };
    }
    console.log('Email sent via Brevo:', data.messageId || '(no id)');
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('Brevo network error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail };
