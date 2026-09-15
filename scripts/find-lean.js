// scripts/find-lean.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Models with encrypted fields — .lean() breaks decryption for these
const ENCRYPTED_MODELS = [
  'User', 'Patient', 'Nurse', 'Driver',
  'Appointment', 'Order', 'Message', 'AuditLog'
];

// Safe to .lean() — no encrypted fields
const SAFE_MODELS = ['DriverLocation'];

const SEARCH_DIRS = [
  path.join(__dirname, '..', 'routes'),
  path.join(__dirname, '..', 'services'),
  path.join(__dirname, '..', 'middleware'),
  path.join(__dirname, '..', 'cron'),
  path.join(__dirname, '..', 'utils')
];

const ROOT_FILES = [
  path.join(__dirname, '..', 'server.js')
];

// ─────────────────────────────────────────────
//  RECURSIVELY FIND ALL .js FILES
// ─────────────────────────────────────────────
function findJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// ─────────────────────────────────────────────
//  DETECT WHICH MODEL IS IN A QUERY
// ─────────────────────────────────────────────
function detectModel(line, previousLines) {
  // Look back up to 5 lines for the model name
  const context = [...previousLines, line].join(' ');

  for (const m of ENCRYPTED_MODELS) {
    const re = new RegExp('\\b' + m + '\\s*\\.\\s*(find|findOne|findById|findOneAndUpdate)', 'g');
    if (re.test(context)) return { model: m, encrypted: true };
  }
  for (const m of SAFE_MODELS) {
    const re = new RegExp('\\b' + m + '\\s*\\.\\s*(find|findOne|findById|findOneAndUpdate)', 'g');
    if (re.test(context)) return { model: m, encrypted: false };
  }
  return { model: null, encrypted: false };
}

// ─────────────────────────────────────────────
//  SCAN A SINGLE FILE
// ─────────────────────────────────────────────
function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const hits = [];

  lines.forEach((line, i) => {
    if (!line.includes('.lean()')) return;

    const previousLines = lines.slice(Math.max(0, i - 5), i);
    const { model, encrypted } = detectModel(line, previousLines);

    hits.push({
      line: i + 1,
      text: line.trim(),
      model: model || '?',
      encrypted
    });
  });

  return hits;
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
(async () => {
  console.log('');
  console.log('🔍 SCANNING FOR .lean() CALLS');
  console.log('═'.repeat(70));
  console.log('');

  const files = [];
  for (const dir of SEARCH_DIRS) findJsFiles(dir, files);
  for (const f of ROOT_FILES) if (fs.existsSync(f)) files.push(f);

  let totalHits = 0;
  let criticalHits = 0;
  let safeHits = 0;
  let unknownHits = 0;

  const criticalFiles = new Set();

  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length === 0) continue;

    totalHits += hits.length;
    const relPath = path.relative(path.join(__dirname, '..'), file);

    console.log(`📄 ${relPath}`);

    for (const h of hits) {
      let icon, tag;
      if (h.encrypted) {
        icon = '🔴';
        tag = 'CRITICAL — encrypted model';
        criticalHits++;
        criticalFiles.add(relPath);
      } else if (h.model && h.model !== '?') {
        icon = '🟢';
        tag = `safe (${h.model})`;
        safeHits++;
      } else {
        icon = '🟡';
        tag = 'unknown model — review';
        unknownHits++;
      }

      console.log(`   ${icon} line ${h.line}: ${tag}`);
      console.log(`      ${h.text.length > 100 ? h.text.slice(0, 100) + '...' : h.text}`);
    }
    console.log('');
  }

  console.log('═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`   Total .lean() calls   : ${totalHits}`);
  console.log(`   🔴 Critical (encrypted): ${criticalHits}`);
  console.log(`   🟢 Safe (no encryption): ${safeHits}`);
  console.log(`   🟡 Unknown — review   : ${unknownHits}`);
  console.log('');

  if (criticalHits > 0) {
    console.log('🚨 FILES REQUIRING FIX (remove .lean()):');
    console.log('');
    [...criticalFiles].sort().forEach(f => console.log(`   → ${f}`));
    console.log('');
    console.log('   ⚠️  Every entry above MUST have .lean() removed.');
    console.log('       Otherwise those endpoints return ciphertext.');
  } else {
    console.log('✅ No critical .lean() calls found — all encrypted-model queries are safe!');
  }

  console.log('');
  console.log('═'.repeat(70));
  process.exit(0);
})();
