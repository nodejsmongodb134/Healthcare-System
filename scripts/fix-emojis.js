const fs = require('fs');
const path = require('path');

// Project root (one level up from scripts/)
const ROOT = path.join(__dirname, '..');

const files = [
  'routes/message.js',
  'routes/nurse-message.js',
  'routes/nurse-order.js',
  'routes/order.js',
  'routes/nurse-patients.js'
];

const emojiFix = [
  ['âœ…', '✅'],
  ['âŒ', '❌'],
  ['ðŸ“¦', '📦'],
  ['ðŸ”§', '🔧'],
  ['ðŸ—‘ï¸', '🗑️'],
  ['ðŸ“', '📬'],
  ['ðŸ“Ž', '📎'],
  ['Г°ЕёвЂњВќ', '📬'],
  ['ГўВќЕ’', '❌'],
  ['ГўЕѕВЎГЇВёВЏ', '↩️'],
  ['ðŸ–¼ï¸', '🖼️'],
  ['âš ï¸', '⚠️'],
  ['ðŸ‘¤', '👤'],
  ['ðŸ§‘', '🧑'],
  ['ðŸ“‹', '📋'],
  ['ðŸ“…', '📅'],
  ['ðŸŽ‰', '🎉']
];

console.log('🔧 Fixing emoji encoding...\n');

let totalChanges = 0;

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.log(`⏭️  Skip (not found): ${rel}`);
    continue;
  }

  let content = fs.readFileSync(full, 'utf8');
  let changes = 0;

  for (const [bad, good] of emojiFix) {
    while (content.includes(bad)) {
      content = content.split(bad).join(good);
      changes++;
    }
  }

  if (changes > 0) {
    fs.writeFileSync(full, content, 'utf8');
  }
  console.log(`✅ ${rel} — ${changes} replacement(s)`);
  totalChanges += changes;
}

console.log(`\n🎉 Done. Total: ${totalChanges} replacements.`);
