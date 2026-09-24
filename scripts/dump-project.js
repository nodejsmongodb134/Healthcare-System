// scripts/dump-project.js
// Produces a single text file with every source file in the project.
// Usage:
//   node scripts/dump-project.js                    -> writes project-dump.txt
//   node scripts/dump-project.js --out dump2.txt    -> custom output name
//   node scripts/dump-project.js --include-hidden   -> also include dotfiles (.env, .gitignore, etc.)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

let OUT_NAME = 'project-dump.txt';
const outIdx = args.indexOf('--out');
if (outIdx !== -1 && args[outIdx + 1]) OUT_NAME = args[outIdx + 1];
const INCLUDE_HIDDEN = args.includes('--include-hidden');

// --- Directories to skip entirely ---
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'coverage',
  '.nyc_output',
  'tmp',
  'temp',
  'tiles',
  'uploads',
  'models_backup_20260914_032946'
]);

// --- Filenames to skip ---
const SKIP_FILES = new Set([
  'project-dump.txt',
  'package-lock.json',
  'yarn.lock'
]);

// --- Extensions to include ---
const KEEP_EXT = new Set([
  '.js', '.json', '.ejs', '.css', '.html', '.md', '.yml', '.yaml',
  '.txt', '.env', '.example', '.xml', '.svg'
]);

// --- Files with no extension but worth keeping ---
const KEEP_NO_EXT = new Set([
  '.gitignore', '.gitattributes', '.env.example', '.env'
]);

// --- Hidden files (start with .) ---
const HIDDEN_EXCEPTIONS = new Set([
  '.env.example', '.gitignore', '.gitattributes'
]);

// --- Binary / huge extensions to skip ---
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.webm',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.lock', '.map'
]);

// --- Skip files starting with these prefixes (backups) ---
const SKIP_PREFIXES = ['server.js.bak', 'auth.js.bak', 'profile.js.bak'];
const SKIP_SUFFIXES = ['.bak', '.tmp', '.swp', '.log'];

// --- Max file size (5 MB) ---
const MAX_SIZE = 5 * 1024 * 1024;

// --- Stats ---
const stats = {
  included: 0,
  skippedSize: 0,
  skippedBinary: 0,
  skippedDir: 0,
  totalBytes: 0
};

// --- Recursively walk ---
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }

  // Sort for deterministic output
  entries.sort(function (a, b) {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        stats.skippedDir++;
        continue;
      }
      // Skip any .bak-style directory (models_backup_*)
      if (entry.name.match(/^models_backup_/) || entry.name.match(/\.bak$/)) {
        stats.skippedDir++;
        continue;
      }
      walk(full, out);
      continue;
    }

    if (!entry.isFile()) continue;

    const name = entry.name;

    // Skip listed files
    if (SKIP_FILES.has(name)) continue;

    // Skip backups and temp files
    if (SKIP_SUFFIXES.some(function (s) { return name.endsWith(s); })) continue;
    if (SKIP_PREFIXES.some(function (p) { return name.startsWith(p); })) continue;

    // Skip hidden unless allowed
    if (name.startsWith('.')) {
      if (!INCLUDE_HIDDEN && !HIDDEN_EXCEPTIONS.has(name)) continue;
      if (!HIDDEN_EXCEPTIONS.has(name) && !INCLUDE_HIDDEN) continue;
    }

    const ext = path.extname(name).toLowerCase();
    const base = name.toLowerCase();

    // Skip binary extensions
    if (SKIP_EXT.has(ext)) {
      stats.skippedBinary++;
      continue;
    }

    // Must be a keepable extension OR a keepable no-ext name
    const keepExt = KEEP_EXT.has(ext);
    const keepName = KEEP_NO_EXT.has(base) || HIDDEN_EXCEPTIONS.has(name);
    if (!keepExt && !keepName) continue;

    // Size guard
    let stat;
    try { stat = fs.statSync(full); } catch (e) { continue; }
    if (stat.size > MAX_SIZE) {
      stats.skippedSize++;
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch (e) {
      continue;
    }

    out.push({
      rel: rel,
      content: content,
      size: stat.size
    });

    stats.included++;
    stats.totalBytes += stat.size;
  }
}

// --- Write the dump ---
function writeDump(files) {
  const now = new Date();
  const ts = now.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const bar = '='.repeat(100);

  let out = '';
  out += 'PROJECT DUMP - ' + ROOT + '\n';
  out += 'Generated: ' + ts + '\n';
  out += 'Files: ' + files.length + '\n';
  out += '\n';

  for (const f of files) {
    out += bar + '\n';
    out += 'FILE: ' + f.rel + '\n';
    out += bar + '\n';

    // Ensure content ends with newline
    out += f.content;
    if (!out.endsWith('\n')) out += '\n';
    out += '\n';
  }

  const outPath = path.join(ROOT, OUT_NAME);
  fs.writeFileSync(outPath, out, 'utf8');
  return outPath;
}

// --- Main ---
(function () {
  console.log('');
  console.log('==============================================');
  console.log('  Project Dump Generator');
  console.log('==============================================');
  console.log('Root       : ' + ROOT);
  console.log('Output     : ' + OUT_NAME);
  console.log('Hidden     : ' + (INCLUDE_HIDDEN ? 'included' : 'only .env.example / .gitignore'));
  console.log('');

  const files = [];
  walk(ROOT, files);

  console.log('Collected ' + files.length + ' files');
  console.log('Total size: ' + (stats.totalBytes / 1024).toFixed(1) + ' KB');
  console.log('Skipped dirs    : ' + stats.skippedDir);
  console.log('Skipped binary  : ' + stats.skippedBinary);
  console.log('Skipped (large) : ' + stats.skippedSize);
  console.log('');

  const outPath = writeDump(files);

  const outSize = fs.statSync(outPath).size;
  console.log('Wrote: ' + outPath);
  console.log('Size : ' + (outSize / 1024).toFixed(1) + ' KB');
  console.log('');
  console.log('Done.');
  console.log('');
})();
