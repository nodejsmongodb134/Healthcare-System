const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

console.log('\n===== Nodemailer -> Brevo Migration =====\n');

// ─── 1. Ensure utils/email.js exists (Brevo helper) ─────────
const emailHelper = path.join(ROOT, 'utils', 'email.js');
if (!fs.existsSync(emailHelper)) {
  console.log('Creating utils/email.js (Brevo helper)...');
  const helperCode = `// utils/email.js
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
`;
  fs.writeFileSync(emailHelper, helperCode, 'utf8');
  console.log('   utils/email.js created');
} else {
  console.log('utils/email.js already exists - keeping it');
}

// ─── 2. Backup + migrate routes/auth.js ─────────────────────
const authFile = path.join(ROOT, 'routes', 'auth.js');
const backupFile = authFile + '.nodemailer.bak';

if (!fs.existsSync(backupFile)) {
  fs.copyFileSync(authFile, backupFile);
  console.log('Backup saved: routes/auth.js.nodemailer.bak');
}

let c = fs.readFileSync(authFile, 'utf8');
const original = c;
let changeCount = 0;

// 2a. Remove nodemailer require
const reqPattern = /const nodemailer = require\(['"]nodemailer['"]\);\s*\r?\n/;
if (reqPattern.test(c)) {
  c = c.replace(reqPattern, '');
  console.log('Removed: const nodemailer = require("nodemailer");');
  changeCount++;
}

// 2b. Remove transporter config block
const transpPattern = /const transporter = nodemailer\.createTransport\(\{[\s\S]*?\}\);\s*\r?\n?/;
if (transpPattern.test(c)) {
  c = c.replace(transpPattern, '');
  console.log('Removed: nodemailer.createTransport({...}) block');
  changeCount++;
}

// 2c. Add Brevo sendEmail import if missing
if (!/require\(['"]\.\.\/utils\/email['"]\)/.test(c)) {
  // Find first require line and add after it
  const firstReqMatch = c.match(/^(const [^\n]*require\(['"][^'"]+['"]\);)/m);
  if (firstReqMatch) {
    c = c.replace(firstReqMatch[0], firstReqMatch[0] + "\nconst { sendEmail } = require('../utils/email');");
    console.log('Added: const { sendEmail } = require("../utils/email");');
    changeCount++;
  } else {
    console.log('WARNING: could not find a require line to attach the import to');
  }
}

// 2d. Replace transporter.sendMail(...) with sendEmail(...)
const sendPattern = /await\s+transporter\.sendMail\(\s*mailOptions\s*\);/g;
const sendMatches = (c.match(sendPattern) || []).length;
if (sendMatches > 0) {
  c = c.replace(sendPattern, 'await sendEmail(mailOptions);');
  console.log('Replaced ' + sendMatches + ' transporter.sendMail() call(s) with sendEmail()');
  changeCount += sendMatches;
}

// 2e. Any remaining 'transporter' reference?
const leftover = (c.match(/transporter/g) || []).length;
if (leftover > 0) {
  console.log('WARNING: ' + leftover + ' "transporter" reference(s) still remain in auth.js');
}

if (c !== original) {
  fs.writeFileSync(authFile, c, 'utf8');
  console.log('routes/auth.js updated');
} else {
  console.log('No changes made to routes/auth.js');
}

// ─── 3. Patch test/auth.test.js (mock nodemailer -> mock utils/email) ───
const testFile = path.join(ROOT, 'test', 'auth.test.js');
if (fs.existsSync(testFile)) {
  let t = fs.readFileSync(testFile, 'utf8');
  const tOrig = t;

  // Backup once
  const tBackup = testFile + '.nodemailer.bak';
  if (!fs.existsSync(tBackup)) {
    fs.copyFileSync(testFile, tBackup);
    console.log('Backup saved: test/auth.test.js.nodemailer.bak');
  }

  // Replace nodemailer require with email helper require
  t = t.replace(/const nodemailer = require\(['"]nodemailer['"]\);/, "const { sendEmail } = require('../utils/email');");

  // Replace the mock assignment
  t = t.replace(/nodemailer\.createTransport\s*=\s*\(\)\s*=>\s*mockTransporter;/, '// email helper is a plain function - mock via jest.mock if needed');

  if (t !== tOrig) {
    fs.writeFileSync(testFile, t, 'utf8');
    console.log('test/auth.test.js updated');
  } else {
    console.log('test/auth.test.js - no matching patterns');
  }
} else {
  console.log('test/auth.test.js not found (skipped)');
}

console.log('\n===== Migration complete =====');
console.log('Summary: ' + changeCount + ' change(s) applied to routes/auth.js');
console.log('Backups:');
console.log('  routes/auth.js.nodemailer.bak');
console.log('  test/auth.test.js.nodemailer.bak (if it existed)');
