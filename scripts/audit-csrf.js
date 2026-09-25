// scripts/audit-csrf.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'middleware', 'csrf.js');
if (!fs.existsSync(FILE)) {
  console.error('middleware/csrf.js NOT FOUND');
  process.exit(1);
}

const src = fs.readFileSync(FILE, 'utf8');

const checks = [
  ['cookieOptions.maxAge present',          /maxAge\s*:/.test(src)],
  ['CSRF_COOKIE_MAX_AGE constant',          /CSRF_COOKIE_MAX_AGE\s*=/.test(src)],
  ['errorConfig block present',             /errorConfig\s*:/.test(src)],
  ['errorConfig has statusCode 403',        /statusCode\s*:\s*403/.test(src)],
  ['errorConfig has code EBADCSRFTOKEN',    /EBADCSRFTOKEN/.test(src)],
  ['cookie fallback REMOVED',               !/req\.cookies\s*&&\s*req\.cookies\[['"]x-csrf-token['"]\]/.test(src)],
  ['enhanced rejection log (sessionId)',    /sessionId.*substring|sessionId/.test(src) && /cookieSid/.test(src)],
  ['getSessionIdentifier present',          /getSessionIdentifier/.test(src)],
  ['generateCsrfToken used',                /generateCsrfToken/.test(src)],
  ['doubleCsrfProtection used',             /doubleCsrfProtection/.test(src)]
];

let pass = 0, fail = 0;
console.log('');
console.log('========================================');
console.log('  middleware/csrf.js Audit');
console.log('========================================');
console.log('');
for (const [label, ok] of checks) {
  if (ok) { console.log('  [PASS] ' + label); pass++; }
  else    { console.log('  [FAIL] ' + label); fail++; }
}
console.log('');
console.log('  Passed: ' + pass + '/' + checks.length);
console.log('  Failed: ' + fail);
console.log('');

// Also print the file's line count for context
const lines = src.split(/\r?\n/).length;
console.log('  File line count: ' + lines);
console.log('');

// Detect if the file is the OLD version
const looksOld = !/maxAge\s*:/.test(src) && /fromCookie/.test(src);
if (looksOld) {
  console.log('  >>> Looks like the OLD version is still on disk <<<');
  console.log('  >>> The recommended update was NOT saved <<<');
} else if (fail === 0) {
  console.log('  >>> Updated version confirmed <<<');
} else {
  console.log('  >>> Partial update — see FAIL entries above <<<');
}
console.log('');
