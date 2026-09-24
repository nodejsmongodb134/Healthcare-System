// scripts/test-password-toggle.js
// Verifies show/hide password toggles on auth pages.
// Usage:
//   node scripts/test-password-toggle.js            -> localhost:3000
//   node scripts/test-password-toggle.js --remote   -> BASE_URL from .env

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const REMOTE = process.argv.includes('--remote');
const BASE = REMOTE
  ? (process.env.BASE_URL || '').replace(/\/+$/, '')
  : ('http://localhost:' + (process.env.PORT || 3000));

const ROOT = path.resolve(__dirname, '..');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
let passed = 0, failed = 0, warned = 0;
const pass = (s) => { console.log(G + '[PASS]' + X + ' ' + s); passed++; };
const fail = (s) => { console.log(R + '[FAIL]' + X + ' ' + s); failed++; };
const warn = (s) => { console.log(Y + '[WARN]' + X + ' ' + s); warned++; };
const head = (s) => { console.log(''); console.log(B + '--- ' + s + ' ---' + X); };

// ------------------------------------------------------------
// Page spec: which pages should have toggles, and how many
// ------------------------------------------------------------
const PAGES = [
  {
    file: 'views/login.ejs',
    route: '/auth/login',
    expectedToggles: 1,
    expectedTargets: ['password']
  },
  {
    file: 'views/register.ejs',
    route: '/auth/register',
    expectedToggles: 1,
    expectedTargets: ['password']
  },
  {
    file: 'views/reset.ejs',
    route: '/auth/reset/sometoken',   // live test may redirect (no such token)
    expectedToggles: 2,
    expectedTargets: ['password', 'confirmPassword'],
    liveRoute: null                    // skip live check (needs valid token)
  },
  {
    file: 'views/forgot.ejs',
    route: '/auth/forgot',
    expectedToggles: 0,
    expectedTargets: []
  }
];

// ------------------------------------------------------------
// Static checks
// ------------------------------------------------------------
function checkStatic() {
  head('1. Static file checks');

  for (const page of PAGES) {
    const full = path.join(ROOT, page.file);
    if (!fs.existsSync(full)) {
      fail(page.file + ' — file missing');
      continue;
    }

    const src = fs.readFileSync(full, 'utf8');

    // Count toggle buttons
    const toggleRe = /data-toggle-password=["']([^"']+)["']/g;
    const targets = [];
    let m;
    while ((m = toggleRe.exec(src)) !== null) targets.push(m[1]);

    if (targets.length !== page.expectedToggles) {
      fail(page.file + ' — expected ' + page.expectedToggles +
           ' toggle(s), found ' + targets.length);
    } else {
      pass(page.file + ' — ' + targets.length + ' toggle(s) found');
    }

    // Each target should have a matching input id
    for (const t of targets) {
      const hasInput = new RegExp('id=["\']' + t + '["\']').test(src);
      if (hasInput) {
        pass('  targets input #' + t + ' (exists)');
      } else {
        fail('  targets #' + t + ' but no <input id="' + t + '"> in file');
      }
    }

    // Ensure expected targets match
    for (const t of page.expectedTargets) {
      if (!targets.includes(t)) {
        fail('  missing expected target "' + t + '"');
      }
    }

    // Generic script must be present when there are toggles
    if (page.expectedToggles > 0) {
      const hasScript = src.indexOf('[data-toggle-password]') !== -1 ||
                        src.indexOf("querySelectorAll('[data-toggle-password]')") !== -1;
      // the script iterates over the data attribute; look for the string
      const hasIterator = src.indexOf("data-toggle-password") !== -1 &&
                          src.indexOf('querySelectorAll') !== -1;
      if (hasIterator) {
        pass('  generic toggle script present');
      } else {
        fail('  toggle buttons present but no generic script');
      }
    }

    // Toggle buttons should use .btn-toggle-pw class
    if (page.expectedToggles > 0) {
      const btnCount = (src.match(/btn-toggle-pw/g) || []).length;
      if (btnCount >= page.expectedToggles) {
        pass('  uses .btn-toggle-pw class (' + btnCount + ' occurrences)');
      } else {
        fail('  missing .btn-toggle-pw class on button(s)');
      }
    }
  }
}

// ------------------------------------------------------------
// Cross-check: forgot.ejs must NOT have a toggle
// ------------------------------------------------------------
function checkForgotHasNoToggle() {
  head('2. Confirm forgot.ejs has no toggle');
  const full = path.join(ROOT, 'views/forgot.ejs');
  if (!fs.existsSync(full)) { fail('forgot.ejs missing'); return; }
  const src = fs.readFileSync(full, 'utf8');
  if (src.indexOf('data-toggle-password') === -1) {
    pass('forgot.ejs correctly has no toggle button');
  } else {
    fail('forgot.ejs unexpectedly contains a toggle');
  }
  if (src.indexOf('name="password"') === -1) {
    pass('forgot.ejs correctly has no password input');
  } else {
    warn('forgot.ejs contains a password input?');
  }
}

// ------------------------------------------------------------
// Live HTTP check
// ------------------------------------------------------------
function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: { 'User-Agent': 'PasswordToggleTest/1.0' }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function checkLive() {
  head('3. Live HTTP checks against ' + BASE);

  for (const page of PAGES) {
    if (page.liveRoute === null) {
      warn(page.route + ' — skipped (needs valid reset token)');
      continue;
    }
    try {
      const r = await httpGet(page.route);
      if (r.status !== 200) {
        fail('GET ' + page.route + ' -> ' + r.status);
        continue;
      }

      const html = r.body;
      const buttons = (html.match(/data-toggle-password=/g) || []).length;

      if (buttons !== page.expectedToggles) {
        fail('GET ' + page.route +
             ' — expected ' + page.expectedToggles +
             ' toggle(s) in rendered HTML, found ' + buttons);
      } else {
        pass('GET ' + page.route + ' — ' + buttons + ' toggle(s) rendered');
      }

      // Button class
      if (page.expectedToggles > 0 && html.indexOf('btn-toggle-pw') === -1) {
        fail('  rendered HTML missing .btn-toggle-pw class');
      } else if (page.expectedToggles > 0) {
        pass('  rendered HTML has .btn-toggle-pw class');
      }

      // Eye icon
      if (page.expectedToggles > 0 && html.indexOf('bi-eye') === -1) {
        fail('  rendered HTML missing bi-eye icon');
      } else if (page.expectedToggles > 0) {
        pass('  rendered HTML has bi-eye icon');
      }

      // Script injected
      if (page.expectedToggles > 0 &&
          html.indexOf('data-toggle-password') !== -1 &&
          html.indexOf('querySelectorAll') !== -1) {
        pass('  rendered HTML includes toggle script');
      } else if (page.expectedToggles > 0) {
        fail('  rendered HTML missing toggle script');
      }
    } catch (err) {
      fail('GET ' + page.route + ' threw: ' + err.message);
    }
  }
}

// ------------------------------------------------------------
// Reset page: static-only check
// ------------------------------------------------------------
function checkResetStatic() {
  head('4. Reset page — static structure');
  const full = path.join(ROOT, 'views/reset.ejs');
  if (!fs.existsSync(full)) { fail('reset.ejs missing'); return; }
  const src = fs.readFileSync(full, 'utf8');

  const checks = [
    ['has password input',        /id=["']password["']/],
    ['has confirmPassword input', /id=["']confirmPassword["']/],
    ['toggle for password',       /data-toggle-password=["']password["']/],
    ['toggle for confirmPassword',/data-toggle-password=["']confirmPassword["']/],
    ['has toggle script',         /querySelectorAll\(['"]\[data-toggle-password\]['"]\)/]
  ];

  for (const [label, re] of checks) {
    if (re.test(src)) pass('  ' + label);
    else fail('  ' + label + ' — not found');
  }
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
  console.log('');
  console.log(B + '==============================================' + X);
  console.log(B + '  Password Toggle Test' + X);
  console.log(B + '  Target: ' + BASE + X);
  console.log(B + '==============================================' + X);

  checkStatic();
  checkForgotHasNoToggle();
  checkResetStatic();
  await checkLive();

  console.log('');
  console.log(B + '==============================================' + X);
  console.log(B + '  Summary' + X);
  console.log(B + '==============================================' + X);
  console.log('  ' + G + 'Passed  : ' + passed + X);
  console.log('  ' + R + 'Failed  : ' + failed + X);
  console.log('  ' + Y + 'Warned  : ' + warned + X);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('');
  console.error(R + 'FATAL: ' + X + err.message);
  process.exit(1);
});
