// scripts/find-timestamps.js
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');

console.log('\n🔍 Scanning models for manual timestamp fields...\n');

const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.js'));
let needsFix = 0;
let alreadyFixed = 0;
let specialCase = 0;

for (const file of files) {
  const full = path.join(MODELS_DIR, file);
  const content = fs.readFileSync(full, 'utf8');

  const hasManualCreated = /createdAt\s*:\s*\{[^}]*default\s*:\s*Date\.now/.test(content);
  const hasManualUpdated = /updatedAt\s*:\s*\{[^}]*default\s*:\s*Date\.now/.test(content);
  const hasTimestamps    = /\{\s*timestamps\s*:\s*true\s*\}/.test(content);
  const hasTtlIndex      = /expires\s*:|ttl/i.test(content);
  const hasOwnTimestamp  = /timestamp\s*:\s*\{/.test(content);

  let status = '';
  let icon = '';

  if (hasTtlIndex || hasOwnTimestamp) {
    icon = '⚠️ ';
    status = 'SPECIAL CASE (TTL / custom timestamp)';
    specialCase++;
  } else if (hasTimestamps && !hasManualCreated && !hasManualUpdated) {
    icon = '✅';
    status = 'Already correct';
    alreadyFixed++;
  } else if (hasManualCreated || hasManualUpdated) {
    icon = '🔴';
    status = 'NEEDS FIX';
    needsFix++;
  } else {
    icon = '🟡';
    status = 'No timestamps at all — add them';
    needsFix++;
  }

  console.log(`${icon} ${file}`);
  console.log(`     ${status}`);
  if (hasManualCreated) console.log(`     └─ manual createdAt: YES`);
  if (hasManualUpdated) console.log(`     └─ manual updatedAt: YES`);
  if (hasTimestamps)    console.log(`     └─ timestamps: true: YES`);
  console.log('');
}

console.log('═'.repeat(60));
console.log(`🔴 Needs fix        : ${needsFix}`);
console.log(`✅ Already correct  : ${alreadyFixed}`);
console.log(`⚠️  Special case     : ${specialCase}`);
console.log('═'.repeat(60));
