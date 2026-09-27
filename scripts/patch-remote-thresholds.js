const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, 'pre-commit-check.js');

let src = fs.readFileSync(FILE, 'utf8');
if (src.includes('IS_REMOTE_EARLY')) { console.log('! already patched'); process.exit(0); }

const oldBlock =
`const LAT = {
  fast:   { warn: 150, fail: 400 },   // static, tiny pages
  normal: { warn: 300, fail: 800 },   // list / dashboard
  heavy:  { warn: 800, fail: 2000 },  // analytics, exports
};`;

const newBlock =
`const IS_REMOTE_EARLY = process.argv.includes('--remote');
const LAT = IS_REMOTE_EARLY ? {
  fast:   { warn: 1200, fail: 2000 },
  normal: { warn: 1500, fail: 3000 },
  heavy:  { warn: 2500, fail: 5000 },
} : {
  fast:   { warn: 150, fail: 400 },
  normal: { warn: 300, fail: 800 },
  heavy:  { warn: 800, fail: 2000 },
};`;

if (!src.includes(oldBlock)) { console.log('X block not found'); process.exit(1); }
src = src.replace(oldBlock, newBlock);

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(FILE + '.bak-lat-' + ts, fs.readFileSync(FILE));
fs.writeFileSync(FILE, src, 'utf8');
console.log('+ Patched thresholds');
