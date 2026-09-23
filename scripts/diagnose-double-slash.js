// scripts/diagnose-double-slash.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');
const AUTH = path.join(ROOT, 'routes', 'auth.js');

console.log('');
console.log('════════════════════════════════════════');
console.log('  Double-Slash Diagnostic');
console.log('════════════════════════════════════════');
console.log('');

// ---- Check routes/auth.js ----
const authSrc = fs.readFileSync(AUTH, 'utf8');
const hasBuildUrl = authSrc.includes('function buildUrl');
const oldPatternCount = (authSrc.match(/palmvalleymedicalcenter\.africa\.com\/'\}/g) || []).length;

console.log('routes/auth.js');
console.log('  buildUrl helper     :', hasBuildUrl ? '✅ present' : '❌ MISSING');
console.log('  old broken pattern  :', oldPatternCount === 0 ? '✅ gone' : `❌ still ${oldPatternCount} times`);

// ---- Check server.js ----
const serverSrc = fs.readFileSync(SERVER, 'utf8');
const hasNormalizer = serverSrc.includes('COLLAPSE DOUBLE SLASHES');

// Check if it's positioned BEFORE route mounting
const normalizerIdx = serverSrc.indexOf('COLLAPSE DOUBLE SLASHES');
const routeMountIdx = serverSrc.indexOf("app.post('/auth/login'");
const positionOK = hasNormalizer && routeMountIdx > 0 && normalizerIdx < routeMountIdx;

console.log('');
console.log('server.js');
console.log('  normalizer present  :', hasNormalizer ? '✅ present' : '❌ MISSING');
console.log('  positioned before   :', positionOK ? '✅ correct' : '❌ WRONG POSITION (must be before routes)');
console.log('  trust proxy line    :', serverSrc.includes("app.set('trust proxy', 1)") ? '✅ found' : '❌ missing');

console.log('');
console.log('════════════════════════════════════════');

if (!hasNormalizer) {
  console.log('');
  console.log('👉 ACTION: You still need to patch server.js.');
  console.log('   Run: node scripts/patch-slash-normalizer.js');
} else if (!positionOK) {
  console.log('');
  console.log('👉 ACTION: The normalizer exists but is in the wrong spot.');
  console.log('   It must be BEFORE any route mounting.');
} else {
  console.log('');
  console.log('✅ Both patches are in place.');
  console.log('   If the issue still persists, restart the server:');
  console.log('     Ctrl+C, then: npm start');
}

console.log('');
console.log('════════════════════════════════════════');
console.log('');
