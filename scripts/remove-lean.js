// scripts/remove-lean.js
const fs = require('fs');
const path = require('path');

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

function findJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Remove .lean() only from real code — skip comments
function stripLeanFromLine(line) {
  const trimmed = line.trimStart();

  // Skip lines that are entirely comments
  if (trimmed.startsWith('//')) return line;
  if (trimmed.startsWith('*')) return line;         // block comment middle
  if (trimmed.startsWith('/*')) return line;        // block comment start

  // Skip if .lean() only appears after an inline // comment
  const commentIdx = line.indexOf('//');
  const leanIdx = line.indexOf('.lean()');
  if (commentIdx !== -1 && leanIdx !== -1 && leanIdx > commentIdx) {
    return line;
  }

  // Real code — remove .lean()
  return line.replace(/\.lean\(\)/g, '');
}

(async () => {
  const DRY_RUN = !process.argv.includes('--apply');

  const files = [];
  for (const dir of SEARCH_DIRS) findJsFiles(dir, files);
  for (const f of ROOT_FILES) if (fs.existsSync(f)) files.push(f);

  let totalFiles = 0;
  let totalChanges = 0;

  console.log('');
  console.log(DRY_RUN
    ? '🔎 DRY RUN — no files will be changed'
    : '🛠️  APPLYING CHANGES');
  console.log('═'.repeat(70));
  console.log('');

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const lines = original.split(/\r?\n/);
    let fileChanges = 0;

    const updatedLines = lines.map(line => {
      const updated = stripLeanFromLine(line);
      if (updated !== line) fileChanges++;
      return updated;
    });

    if (fileChanges === 0) continue;

    const updated = updatedLines.join('\n');
    const relPath = path.relative(path.join(__dirname, '..'), file);

    console.log(`  ${DRY_RUN ? '🔍' : '✏️ '} ${relPath} — ${fileChanges} line(s)`);

    if (!DRY_RUN) {
      fs.writeFileSync(file, updated, 'utf8');
    }

    totalFiles++;
    totalChanges += fileChanges;
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log(`  Files touched : ${totalFiles}`);
  console.log(`  Lines changed : ${totalChanges}`);

  if (DRY_RUN) {
    console.log('');
    console.log('  ℹ️  This was a DRY RUN. Nothing was modified.');
    console.log('  👉  To apply the changes, run:');
    console.log('      node scripts\\remove-lean.js --apply');
  } else {
    console.log('');
    console.log('  ✅ All .lean() removed from code.');
    console.log('  🔄 Restart the server (nodemon does it automatically).');
  }

  console.log('═'.repeat(70));
  console.log('');
  process.exit(0);
})();
