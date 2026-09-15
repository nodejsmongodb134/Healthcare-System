// scripts/fix-timestamps.js
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');

// Files to fix
const TARGETS = [
  'Appointment.js',
  'Driver.js',
  'Message.js',
  'Nurse.js',
  'order.js',
  'Patient.js',
  'User.js'                     // ← ADDED
];

// Files to leave alone (with reason)
const SKIP = [
  'DriverLocation.js',          // has TTL index + custom timestamp
  'AuditLog.js'                 // append-only, uses custom `timestamp` by design
];

const DRY_RUN = !process.argv.includes('--apply');

console.log('');
console.log(DRY_RUN ? '🔎 DRY RUN — no files will change' : '🛠️  APPLYING CHANGES');
console.log('═'.repeat(60));
console.log('');

let totalFiles = 0;
let totalLinesRemoved = 0;

for (const file of TARGETS) {
  if (SKIP.includes(file)) {
    console.log(`⏭️  ${file} — SKIPPED (special case)`);
    continue;
  }

  const full = path.join(MODELS_DIR, file);
  if (!fs.existsSync(full)) {
    console.log(`⚠️  ${file} — FILE NOT FOUND`);
    continue;
  }

  const original = fs.readFileSync(full, 'utf8');
  let updated = original;

  const createdRegex = /^\s*createdAt\s*:\s*\{\s*type\s*:\s*Date\s*,\s*default\s*:\s*Date\.now\s*\}\s*,?\s*$/gm;
  updated = updated.replace(createdRegex, '');

  const updatedRegex = /^\s*updatedAt\s*:\s*\{\s*type\s*:\s*Date\s*,\s*default\s*:\s*Date\.now\s*\}\s*,?\s*$/gm;
  updated = updated.replace(updatedRegex, '');

  const closingRegex = /^(\s*)\}\s*(,\s*\{[^}]*\})?\s*\);/m;
  const match = updated.match(closingRegex);

  if (match) {
    if (match[2]) {
      const options = match[2];
      const merged = options.replace(/\{\s*/, '{ timestamps: true, ');
      updated = updated.replace(closingRegex, `${match[1]}}${merged});`);
    } else {
      updated = updated.replace(closingRegex, `${match[1]}}, { timestamps: true });`);
    }
  }

  const linesRemoved =
    (original.match(createdRegex) || []).length +
    (original.match(updatedRegex) || []).length;

  if (original === updated) {
    console.log(`⏭️  ${file} — NO CHANGE NEEDED`);
    continue;
  }

  console.log(`✏️  ${file}`);
  console.log(`     Lines removed   : ${linesRemoved}`);
  console.log(`     timestamps added: YES`);

  if (!DRY_RUN) {
    fs.writeFileSync(full, updated, 'utf8');
  }

  totalFiles++;
  totalLinesRemoved += linesRemoved;
}

console.log('');
console.log('═'.repeat(60));
console.log(`  Files changed  : ${totalFiles}`);
console.log(`  Lines removed  : ${totalLinesRemoved}`);

if (DRY_RUN) {
  console.log('');
  console.log('  ℹ️  This was a DRY RUN. Nothing was written.');
  console.log('  👉  To apply the changes, run:');
  console.log('      node scripts\\fix-timestamps.js --apply');
} else {
  console.log('');
  console.log('  ✅ Changes applied. Restart the server.');
}

console.log('═'.repeat(60));
console.log('');
