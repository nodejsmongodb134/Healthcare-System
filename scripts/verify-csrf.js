// scripts/verify-csrf.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const BASE = `http://localhost:${process.env.PORT || 3000}`;

// ANSI colors
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = (s) => `${G}✅ ${s}${X}`;
const fail = (s) => `${R}❌ ${s}${X}`;
const warn = (s) => `${Y}⚠️  ${s}${X}`;
const info = (s) => `${C}ℹ️  ${s}${X}`;
const head = (s) => `\n${B}═══ ${s} ═══${X}`;

let pass = 0, failCount = 0, warnCount = 0;

function record(status) {
  if (status === 'pass') pass++;
  else if (status === 'fail') failCount++;
  else if (status === 'warn') warnCount++;
}

// ---------- HTTP helper that keeps cookies ----------
function request(method, urlPath, { headers = {}, body = null, cookies = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    const opts = {
      method,
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: urlPath,
      headers: {
        ...headers,
        ...(cookieStr ? { Cookie: cookieStr } : {})
      }
    };

    if (body) {
      if (typeof body === 'object') {
        body = new URLSearchParams(body).toString();
      }
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        setCookies: res.headers['set-cookie'] || []
      }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------- Parse cookies from Set-Cookie headers ----------
function parseSetCookies(setCookies) {
  const jar = {};
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    jar[name] = value;
  }
  return jar;
}

// ============================================================
//  STATIC CHECKS
// ============================================================
function checkFiles() {
  console.log(head('1. FILES EXIST'));

  const files = [
    ['middleware/csrf.js',        'CSRF middleware'],
    ['public/js/csrf-inject.js',  'Client-side injector'],
  ];

  for (const [rel, label] of files) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) {
      const stats = fs.statSync(full);
      console.log(ok(`${label} — ${rel} (${stats.size} bytes)`));
      record('pass');
    } else {
      console.log(fail(`${label} MISSING — ${rel}`));
      record('fail');
    }
  }
}

function checkEnv() {
  console.log(head('2. ENV VARIABLES'));

  if (process.env.CSRF_SECRET) {
    console.log(ok(`CSRF_SECRET present (${process.env.CSRF_SECRET.length} chars)`));
    record('pass');
  } else if (process.env.SESSION_SECRET) {
    console.log(warn('CSRF_SECRET missing — falls back to SESSION_SECRET'));
    record('warn');
  } else {
    console.log(fail('Neither CSRF_SECRET nor SESSION_SECRET set'));
    record('fail');
  }
}

function checkCsrfMiddleware() {
  console.log(head('3. MIDDLEWARE/CSRF.JS'));

  const full = path.join(ROOT, 'middleware/csrf.js');
  if (!fs.existsSync(full)) {
    console.log(fail('File not found'));
    record('fail');
    return;
  }

  const content = fs.readFileSync(full, 'utf8');

  const checks = [
    ['uses csrf-csrf',             /require\(['"]csrf-csrf['"]\)/],
    ['has getSecret',              /getSecret\s*:/],
    ['has getSessionIdentifier',   /getSessionIdentifier\s*:/],
    ['has getCsrfTokenFromRequest',/getCsrfTokenFromRequest\s*:/],
    ['has cookieName',             /cookieName\s*:/],
    ['has ignoredMethods',         /ignoredMethods\s*:/],
    ['exports csrfGenerate',       /csrfGenerate/],
    ['exports csrfProtection',     /csrfProtection/],
    ['exports invalidCsrfTokenError', /invalidCsrfTokenError/]
  ];

  for (const [label, regex] of checks) {
    if (regex.test(content)) {
      console.log(ok(`  ${label}`));
      record('pass');
    } else {
      console.log(fail(`  ${label}`));
      record('fail');
    }
  }
}

function checkServerJs() {
  console.log(head('4. SERVER.JS WIRING'));

  const full = path.join(ROOT, 'server.js');
  const content = fs.readFileSync(full, 'utf8');

  const checks = [
    ['requires middleware/csrf',      /require\(['"]\.\/middleware\/csrf['"]\)/],
    ['calls csrfGenerate',            /app\.use\(csrfGenerate\)/],
    ['calls csrfProtection',          /app\.use\(csrfProtection\)/],
    ['injects meta tag',              /name="csrf-token"/],
    ['injects csrf-inject.js script', /csrf-inject\.js/],
    ['has CSRF error handler',        /invalidCsrfTokenError/],
    ['saveUninitialized: true',       /saveUninitialized\s*:\s*true/]
  ];

  for (const [label, regex] of checks) {
    if (regex.test(content)) {
      console.log(ok(`  ${label}`));
      record('pass');
    } else {
      console.log(fail(`  ${label}`));
      record('fail');
    }
  }

  // Check order: sessionMiddleware should appear before csrfGenerate
  const sessionIdx = content.indexOf('app.use(sessionMiddleware)');
  const csrfIdx    = content.indexOf('app.use(csrfGenerate)');
  if (sessionIdx !== -1 && csrfIdx !== -1 && sessionIdx < csrfIdx) {
    console.log(ok('  Middleware order: session → csrf'));
    record('pass');
  } else {
    console.log(fail('  Middleware order: csrf must come AFTER session'));
    record('fail');
  }
}

function checkClientScript() {
  console.log(head('5. PUBLIC/JS/CSRF-INJECT.JS'));

  const full = path.join(ROOT, 'public/js/csrf-inject.js');
  if (!fs.existsSync(full)) {
    console.log(fail('File not found'));
    record('fail');
    return;
  }

  const content = fs.readFileSync(full, 'utf8');

  const checks = [
    ['reads meta tag',              /name="csrf-token"/],
    ['injects into forms',          /querySelectorAll\(['"]form['"]\)/],
    ['patches window.fetch',        /window\.fetch\s*=/],
    ['handles multipart',           /multipart/i]
  ];

  for (const [label, regex] of checks) {
    if (regex.test(content)) {
      console.log(ok(`  ${label}`));
      record('pass');
    } else {
      console.log(fail(`  ${label}`));
      record('fail');
    }
  }
}

// ============================================================
//  LIVE HTTP CHECKS
// ============================================================
async function checkLiveServer() {
  console.log(head('6. LIVE SERVER — /auth/login'));

  try {
    const res = await request('GET', '/auth/login');

    if (res.status !== 200) {
      console.log(fail(`GET /auth/login returned ${res.status}`));
      record('fail');
      return null;
    }
    console.log(ok(`GET /auth/login → 200`));
    record('pass');

    // Check meta tag
    const metaMatch = res.body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/);
    if (metaMatch) {
      console.log(ok(`  Meta tag present: ${metaMatch[1].substring(0, 24)}… (len=${metaMatch[1].length})`));
      record('pass');
    } else {
      console.log(fail('  Meta tag csrf-token NOT injected into HTML'));
      record('fail');
    }

    // Check client script
    if (res.body.includes('csrf-inject.js')) {
      console.log(ok('  csrf-inject.js script tag present'));
      record('pass');
    } else {
      console.log(fail('  csrf-inject.js NOT injected'));
      record('fail');
    }

    // Extract cookies
    const cookies = parseSetCookies(res.setCookies);
    if (cookies['connect.sid']) {
      console.log(ok(`  Session cookie set: connect.sid=${cookies['connect.sid'].substring(0, 20)}…`));
      record('pass');
    } else {
      console.log(fail('  No connect.sid cookie set'));
      record('fail');
    }

    if (cookies['x-csrf-token']) {
      console.log(ok(`  CSRF cookie set: x-csrf-token=${cookies['x-csrf-token'].substring(0, 24)}…`));
      record('pass');
    } else {
      console.log(fail('  No x-csrf-token cookie set'));
      record('fail');
    }

    return { cookies, token: metaMatch ? metaMatch[1] : null };
  } catch (err) {
    console.log(fail(`Server unreachable at ${BASE}: ${err.message}`));
    console.log(info('Start the server with: npm start'));
    record('fail');
    return null;
  }
}

async function checkPostWithoutToken(session) {
  console.log(head('7. POST WITHOUT TOKEN (should FAIL)'));

  try {
    const res = await request('POST', '/auth/login', {
      cookies: session.cookies,
      body: { email: 'test@test.com', password: 'wrongpassword' }
    });

    // Possible outcomes:
    // 302 → redirect (CSRF error handler redirected back)
    // 403 → JSON response
    // 200 → ??? bad
    if (res.status === 302 || res.status === 403) {
      console.log(ok(`POST without CSRF token → ${res.status} (blocked as expected)`));
      record('pass');
    } else if (res.status === 200) {
      console.log(fail(`POST without CSRF token succeeded (200) — CSRF NOT ENFORCED`));
      record('fail');
    } else {
      console.log(warn(`POST returned ${res.status} — verify manually`));
      record('warn');
    }
  } catch (err) {
    console.log(fail(`Request failed: ${err.message}`));
    record('fail');
  }
}

async function checkPostWithWrongToken(session) {
  console.log(head('8. POST WITH WRONG TOKEN (should FAIL)'));

  try {
    const res = await request('POST', '/auth/login', {
      cookies: session.cookies,
      body: {
        email: 'test@test.com',
        password: 'wrongpassword',
        _csrf: 'this-is-not-a-valid-csrf-token-00000000000000'
      }
    });

    if (res.status === 302 || res.status === 403) {
      console.log(ok(`POST with wrong CSRF token → ${res.status} (blocked)`));
      record('pass');
    } else if (res.status === 200) {
      console.log(fail('POST with wrong token succeeded — CSRF NOT ENFORCED'));
      record('fail');
    } else {
      console.log(warn(`POST returned ${res.status} — verify manually`));
      record('warn');
    }
  } catch (err) {
    console.log(fail(`Request failed: ${err.message}`));
    record('fail');
  }
}

async function checkPostWithValidToken(session) {
  console.log(head('9. POST WITH VALID TOKEN (should SUCCEED)'));

  if (!session.token) {
    console.log(fail('No token captured — cannot test'));
    record('fail');
    return;
  }

  try {
    const res = await request('POST', '/auth/login', {
      cookies: session.cookies,
      body: {
        email: 'test@test.com',
        password: 'wrongpassword',
        _csrf: session.token
      }
    });

    // With valid CSRF + wrong credentials, expected: 302 back to /auth/login
    // (login fails, but CSRF passed)
    if (res.status === 302) {
      const loc = res.headers.location || '';
      console.log(ok(`POST with valid CSRF token → 302 redirect to ${loc}`));
      console.log(info('  (Expected — credentials were invalid, but CSRF passed)'));
      record('pass');
    } else if (res.status === 200) {
      console.log(warn('POST returned 200 — verify this is expected'));
      record('warn');
    } else if (res.status === 403) {
      console.log(fail('POST returned 403 despite valid CSRF token — validation broken'));
      record('fail');
    } else {
      console.log(warn(`POST returned ${res.status}`));
      record('warn');
    }
  } catch (err) {
    console.log(fail(`Request failed: ${err.message}`));
    record('fail');
  }
}

// ============================================================
//  RUN
// ============================================================
(async () => {
  console.log(`\n${B}🔐 CSRF VERIFICATION${X}`);
  console.log(`${B}═══════════════════════════════════════════${X}`);

  checkFiles();
  checkEnv();
  checkCsrfMiddleware();
  checkServerJs();
  checkClientScript();

  const session = await checkLiveServer();
  if (session) {
    await checkPostWithoutToken(session);
    await checkPostWithWrongToken(session);
    await checkPostWithValidToken(session);
  }

  console.log(head('SUMMARY'));
  console.log(`  ${G}Passed${X}: ${pass}`);
  console.log(`  ${R}Failed${X}: ${failCount}`);
  console.log(`  ${Y}Warned${X}: ${warnCount}`);

  if (failCount === 0) {
    console.log(`\n${G}${B}🎉 CSRF protection is fully working${X}\n`);
    process.exit(0);
  } else {
    console.log(`\n${R}${B}❌ ${failCount} checks failed — see above${X}\n`);
    process.exit(1);
  }
})();
