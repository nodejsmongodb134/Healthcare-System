const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Skip these folders
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'public', 'logs', 'iisnode']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

// Patterns to detect
const patterns = [
  { name: 'require nodemailer', regex: /require\(['"]nodemailer['"]\)/g },
  { name: 'nodemailer.createTransport', regex: /nodemailer\.createTransport/g },
  { name: 'createTransport', regex: /createTransport\s*\(/g },
  { name: 'transporter.sendMail', regex: /transporter\.sendMail/g },
  { name: 'sendMail call', regex: /\.sendMail\s*\(/g },
  { name: 'EMAIL_USER env', regex: /process\.env\.EMAIL_USER/g },
  { name: 'EMAIL_PASS env', regex: /process\.env\.EMAIL_PASS/g },
  { name: 'SMTP config', regex: /smtp\./g },
];

let total = 0;
const fileMap = {};

for (const file of files) {
  const c = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  for (const p of patterns) {
    p.regex.lastIndex = 0;
    const matches = [...c.matchAll(p.regex)];
    if (matches.length === 0) continue;

    if (!fileMap[rel]) fileMap[rel] = [];

    for (const m of matches) {
      const lineNumber = c.substring(0, m.index).split('\n').length;
      const lineText = c.split('\n')[lineNumber - 1].trim().slice(0, 100);
      fileMap[rel].push({
        line: lineNumber,
        type: p.name,
        text: lineText
      });
      total++;
    }
  }
}

console.log('\n========== Nodemailer Usage Report ==========\n');

if (Object.keys(fileMap).length === 0) {
  console.log('No nodemailer references found.');
} else {
  for (const [file, hits] of Object.entries(fileMap)) {
    console.log('📧 ' + file);
    for (const h of hits) {
      console.log('   Line ' + h.line + ' [' + h.type + ']');
      console.log('     ' + h.text);
    }
    console.log('');
  }
}

console.log('=============================================');
console.log('Total matches: ' + total);
console.log('Files affected: ' + Object.keys(fileMap).length);
console.log('=============================================\n');
