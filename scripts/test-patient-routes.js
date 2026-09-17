// scripts/test-patient-routes.js
// Logs in as the test patient and hits every patient route.
// Reports: status, response time, crash indicators, ciphertext leaks.

require('dotenv').config();
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const PATIENT_EMAIL = 'kevinnngondo@gmail.com';
const PATIENT_PASSWORD = 'Patient@1234';

// All patient routes to test
const ROUTES = [
  { path: '/patient/appointment',         name: 'Appointment booking form' },
  { path: '/patient/view-appointments',   name: 'All appointments list' },
  { path: '/patient/order',               name: 'Order prescription' },
  { path: '/patient/message',             name: 'Message inbox' },
  { path: '/patient/profile',             name: 'Profile (4 tabs)' },
  { path: '/patient/change-password',     name: 'Change password' },
  { path: '/auth/patient-dashboard',      name: 'Patient dashboard' },

  // Detail pages (may 302 if no data — that's fine)
  { path: '/patient/appointment/000000000000000000000000',       name: 'Appointment detail (invalid id → 302/404)', optional: true },
  { path: '/patient/order/000000000000000000000000',             name: 'Order detail (invalid id → 302/404)', optional: true },
  { path: '/patient/message/000000000000000000000000',           name: 'Message detail (invalid id → 302/404)', optional: true },
];

// ANSI
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = (s) => `${G}✅ ${s}${X}`;
const fail = (s) => `${R}❌ ${s}${X}`;
const warn = (s) => `${Y}⚠️  ${s}${X}`;
const info = (s) => `${C}ℹ️  ${s}${X}`;
const head = (s) => `\n${B}═══ ${s} ═══${X}`;

let pass = 0, failCount = 0, warnCount = 0, infoCount = 0;
const record = (s) => {
  if (s === 'pass') pass++;
  else if (s === 'fail') failCount++;
  else if (s === 'warn') warnCount++;
  else if (s === 'info') infoCount++;
};

// ---------- HTTP helper (keeps cookies) ----------
function request(method, url, { headers = {}, body = null, cookies = {}, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        ...headers,
        ...(cookieStr ? { Cookie: cookieStr } : {}),
        'Accept-Encoding': 'gzip, deflate, br'
      },
      timeout
    };

    if (body) {
      if (typeof body === 'object') body = new URLSearchParams(body).toString();
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let raw = Buffer.concat(chunks);
        let decoded = raw;
        try {
          const enc = res.headers['content-encoding'];
          if (enc === 'gzip') decoded = zlib.gunzipSync(raw);
          else if (enc === 'deflate') decoded = zlib.inflateSync(raw);
          else if (enc === 'br') decoded = zlib.brotliDecompressSync(raw);
        } catch (e) {}

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: decoded.toString(),
          setCookies: res.headers['set-cookie'] || [],
          location: res.headers.location || null
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseCookies(setCookies) {
  const jar = {};
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function detectCrash(body) {
  const lower = body.toLowerCase();
  const signs = [
    '<pre>referenceerror', '<pre>typeerror', '<pre>syntaxerror',
    'cannot read propert', 'is not defined', 'is not a function',
    'cannot find module', 'error: connect', 'mongoserverselectionerror'
  ];
  for (const s of signs) {
    if (lower.indexOf(s) !== -1) return s;
  }
  return null;
}

function detectCiphertext(body) {
  // Look for the encryption pattern: base64|base64|base64 (min 20 chars each)
  const regex = /\b[a-f0-9]{20,}\|[a-f0-9]{10,}\|[a-f0-9]{20,}/i;
  return regex.test(body);
}

function detectRenderedPage(body) {
  // A real EJS page will have these markers
  return body.includes('<html') && body.includes('</html>') && body.length > 500;
}

// ---------- Login ----------
async function login() {
  head('AUTHENTICATION');

  // Step 1: GET login page (get CSRF meta + session cookie)
  const loginPage = await request('GET', `${BASE}/auth/login`);

  if (loginPage.status !== 200) {
    console.log(fail(`GET /auth/login → ${loginPage.status} (expected 200)`));
    record('fail');
    return null;
  }
  console.log(ok(`GET /auth/login → 200`));
  record('pass');

  // Extract CSRF token from meta tag
  const metaMatch = loginPage.body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/);
  if (!metaMatch) {
    console.log(fail('CSRF meta tag not found on login page'));
    record('fail');
    return null;
  }
  const csrfToken = metaMatch[1];
  console.log(ok(`CSRF token: ${csrfToken.substring(0, 16)}…`));
  record('pass');

  // Save session cookie
  let cookies = parseCookies(loginPage.setCookies);
  console.log(ok(`Session cookie: ${Object.keys(cookies).join(', ')}`));
  record('pass');

  // Step 2: POST login with CSRF token
  const loginRes = await request('POST', `${BASE}/auth/login`, {
    cookies,
    body: {
      email: PATIENT_EMAIL,
      password: PATIENT_PASSWORD,
      _csrf: csrfToken
    }
  });

  // Merge new cookies
  cookies = { ...cookies, ...parseCookies(loginRes.setCookies) };

  if (loginRes.status === 302) {
    const loc = loginRes.location || '';
    console.log(ok(`POST /auth/login → 302 to ${loc}`));
    record('pass');

    if (loc.includes('/auth/login')) {
      console.log(fail('  → Still redirected to login — credentials wrong or CSRF failed'));
      record('fail');
      return null;
    }
  } else if (loginRes.status === 200) {
    console.log(warn(`POST /auth/login → 200 (unusual for login)`));
    record('warn');
  } else {
    console.log(fail(`POST /auth/login → ${loginRes.status}`));
    record('fail');
    return null;
  }

  // Verify session established
  const check = await request('GET', `${BASE}/auth/patient-dashboard`, { cookies });
  if (check.status === 200 && !check.location) {
    console.log(ok('Session established — dashboard accessible'));
    record('pass');
  } else if (check.status === 302 && (check.location || '').includes('/auth/login')) {
    console.log(fail('Session not persisted — bounced back to login'));
    record('fail');
    return null;
  }

  return cookies;
}

// ---------- Test each route ----------
async function testRoutes(cookies) {
  head('PATIENT ROUTES');

  for (const route of ROUTES) {
    const t0 = Date.now();
    let res;
    try {
      res = await request('GET', BASE + route.path, { cookies, timeout: 15000 });
    } catch (err) {
      console.log(fail(`${route.name}`));
      console.log(`   ${route.path} → ERROR: ${err.message}`);
      record('fail');
      continue;
    }
    const elapsed = Date.now() - t0;
    const timing = elapsed < 500 ? `${elapsed}ms` : elapsed < 2000 ? `${elapsed}ms` : `${(elapsed/1000).toFixed(1)}s`;

    // ---- Status check ----
    const isOk = res.status === 200;
    const isRedirect = res.status === 302;
    const isClientErr = res.status >= 400 && res.status < 500;
    const isServerErr = res.status >= 500;

    let statusIcon = '✅';
    let verdict = '';

    if (isOk) {
      statusIcon = '✅';
      verdict = 'rendered';
      record('pass');
    } else if (isRedirect && route.optional) {
      statusIcon = '🔄';
      verdict = `redirect → ${res.location || '?'}`;
      record('pass');
    } else if (isRedirect) {
      statusIcon = '🔄';
      verdict = `redirect → ${res.location || '?'}`;
      record(route.optional ? 'pass' : 'warn');
    } else if (isClientErr && route.optional) {
      statusIcon = '🟡';
      verdict = `client error (expected for invalid id)`;
      record('pass');
    } else if (isClientErr) {
      statusIcon = '🟡';
      verdict = `client error ${res.status}`;
      record('warn');
    } else if (isServerErr) {
      statusIcon = '💥';
      verdict = `SERVER ERROR ${res.status}`;
      record('fail');
    } else {
      statusIcon = '⚠️ ';
      verdict = `unexpected ${res.status}`;
      record('warn');
    }

    console.log(`${statusIcon} ${route.name.padEnd(45)} ${verdict}  (${timing})`);

    // ---- Crash detection on rendered pages ----
    if (isOk && detectRenderedPage(res.body)) {
      const crash = detectCrash(res.body);
      if (crash) {
        console.log(`   ❌ CRASH SIGNATURE: "${crash}"`);
        record('fail');
        continue;
      }

      // ---- Ciphertext leak detection ----
      if (detectCiphertext(res.body)) {
        console.log(`   ⚠️  CIPHERTEXT LEAK — encrypted field not decrypted!`);
        record('warn');
      }
    }
  }
}

// ---------- Main ----------
(async () => {
  console.log(`\n${B}╔════════════════════════════════════════════════════════╗${X}`);
  console.log(`${B}║   🏥 PATIENT ROUTES CRASH TEST                          ║${X}`);
  console.log(`${B}║   Target: ${BASE.padEnd(45)} ║${X}`);
  console.log(`${B}╚════════════════════════════════════════════════════════╝${X}`);

  const cookies = await login();
  if (!cookies) {
    console.log(`\n${R}❌ Login failed — aborting${X}\n`);
    process.exit(1);
  }

  await testRoutes(cookies);

  // ---- Summary ----
  console.log(`\n${B}═══ SUMMARY ═══${X}`);
  console.log(`  ${G}Passed:  ${pass}${X}`);
  console.log(`  ${R}Failed:  ${failCount}${X}`);
  console.log(`  ${Y}Warned:  ${warnCount}${X}`);

  if (failCount === 0) {
    console.log(`\n${G}${B}🎉 ALL PATIENT ROUTES OK — no crashes${X}\n`);
    process.exit(0);
  } else {
    console.log(`\n${R}${B}❌ ${failCount} ROUTE(S) CRASHED${X}\n`);
    process.exit(1);
  }
})();
