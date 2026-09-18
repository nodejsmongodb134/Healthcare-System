require('dotenv').config();
const path = require('path');
// ⬇️ FIXED: go up one level from scripts/
const { sendEmail } = require('../utils/email');

(async () => {
  console.log('\n=== Brevo Email Test ===\n');

  console.log('Config:');
  console.log('  BREVO_API_KEY     :', process.env.BREVO_API_KEY
    ? process.env.BREVO_API_KEY.substring(0, 12) + '...'
    : 'MISSING');
  console.log('  BREVO_SENDER_EMAIL:', process.env.BREVO_SENDER_EMAIL || 'MISSING');
  console.log('  BREVO_SENDER_NAME :', process.env.BREVO_SENDER_NAME || 'MISSING');
  console.log('');

  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY missing - check .env');
    process.exit(1);
  }

  const recipient = process.argv[2] || process.env.BREVO_SENDER_EMAIL;
  console.log('Sending test email to:', recipient);
  console.log('');

  const result = await sendEmail({
    to: recipient,
    subject: 'Healthcare System - Brevo Test ' + new Date().toISOString(),
    html: '<h2>Brevo Email Working</h2><p>If you see this, Brevo works on Render free tier.</p>',
    text: 'Brevo email test - integration works.'
  });

  console.log('');
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('');

  if (result.success) {
    console.log('EMAIL SENT SUCCESSFULLY');
    console.log('   Message ID:', result.messageId);
    console.log('   Check inbox:', recipient);
  } else {
    console.log('SEND FAILED');
    console.log('   Error:', result.error);
  }

  process.exit(result.success ? 0 : 1);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
