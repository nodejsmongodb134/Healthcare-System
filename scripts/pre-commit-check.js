// scripts/pre-commit-check.js
// Pre-commit verification: routes + security + latency + RBAC + CSRF.
//
// Usage:
//   $env:TEST_ADMIN_PASSWORD="Admin@1234"
//   $env:TEST_NURSE_PASSWORD="Nurse@1234"
//   $env:TEST_PATIENT_PASSWORD="Patient@1234"
//   $env:TEST_DRIVER_PASSWORD="Driver@1234"
//   node scripts\pre-commit-check.js
//
// Flags:
//   --remote     test BASE_URL from .env instead of localhost
//   --no-color   plain output (for CI logs)

require('dotenv').config();
const http  = require('http');
const https = require('https');

// ── Config ───────────────────────────────────────────────────

const NO_COLOR = process.argv.includes('--no-color');
const REMOTE   = process.argv.includes('--remote');

const BASE = REMOTE
  ? (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '')
  : 'http://localhost:' + (process.env.PORT || 3000);

if (REMOTE && !BASE) {
  console.error('BASE_URL not set in .env');
  process.exit(1);
}

// Latency thresholds (ms) — warn above, fail above fail
const IS_REMOTE_EARLY = process.argv.includes('--remote');
const LAT = IS_REMOTE_EARLY ? {
  fast:   { warn: 1200, fail: 2000 },
  normal: { warn: 1500, fail: 3000 },
  heavy:  { warn: 2500, fail: 5000 },
} : {
  fast:   { warn: 150, fail: 400 },
  normal: { warn: 300, fail: 800 },
  heavy:  { warn: 800, fail: 2000 },
};

const ROLES = [
  {
    name: 'admin',
    loginPath: '/auth/login',
    email:    process.env.TEST_ADMIN_EMAIL    || 'valley.palm@yahoo.com',
    password: process.env.TEST_ADMIN_PASSWORD || null,
    routes: [
      ['/admin/dashboard',         'normal'],
      ['/admin/appointments',      'normal'],
      ['/admin/messages',          'normal'],
      ['/admin/orders',            'normal'],
      ['/admin/patients',          'normal'],
      ['/admin/drivers',           'normal'],
      ['/admin/nurses',            'normal'],
      ['/admin/patients/manage',   'normal'],
      ['/admin/nurses/manage',     'normal'],
      ['/admin/nurses/create',     'fast'],
      ['/admin/drivers/create',    'fast'],
      ['/admin/orders/manage',     'normal'],
      ['/admin/messages/manage',   'normal'],
      ['/admin/announcements',     'normal'],
      ['/admin/analytics',         'heavy'],
      ['/admin/export',            'fast'],
      ['/admin/audit',             'normal'],
      ['/admin/notifications',     'fast'],
      ['/admin/change-password',   'fast'],
    ],
    forbidden: [
      ['/nurse/nurse-patients',       'nurse area'],
      ['/patient/appointment',        'patient area'],
      ['/driver/dashboard',           'driver area'],
    ],
  },
  {
    name: 'nurse',
    loginPath: '/auth/login',
    email:    process.env.TEST_NURSE_EMAIL    || 'nodejsmongodb12@gmail.com',
    password: process.env.TEST_NURSE_PASSWORD || null,
    routes: [
      ['/auth/nurse-dashboard',       'normal'],
      ['/nurse/profile',              'fast'],
      ['/nurse/nurse-appointments',   'normal'],
      ['/nurse/nurse-messages',       'normal'],
      ['/nurse/nurse-patients',       'normal'],
      ['/nurse/nurse-orders',         'normal'],
      ['/nurse/drivers',              'normal'],
      ['/nurse/create-driver',        'fast'],
      ['/nurse/track-drivers',        'fast'],
      ['/nurse/announcement',         'fast'],
      ['/nurse/change-password',      'fast'],
    ],
    forbidden: [
      ['/admin/dashboard',  'admin area'],
      ['/patient/appointment', 'patient area'],
    ],
  },
  {
    name: 'patient',
    loginPath: '/auth/login',
    email:    process.env.TEST_PATIENT_EMAIL    || 'kevinnngondo@gmail.com',
    password: process.env.TEST_PATIENT_PASSWORD || null,
    routes: [
      ['/auth/patient-dashboard',      'normal'],
      ['/patient/profile',             'fast'],
      ['/patient/appointment',         'normal'],
      ['/patient/view-appointments',   'normal'],
      ['/patient/message',             'normal'],
      ['/patient/order',               'normal'],
      ['/patient/change-password',     'fast'],
    ],
    forbidden: [
      ['/admin/dashboard',       'admin area'],
      ['/nurse/nurse-patients',  'nurse area'],
      ['/driver/dashboard',      'driver area'],
    ],
  },
  {
    name: 'driver',
    loginPath: '/driver/login',
    email:    process.env.TEST_DRIVER_EMAIL    || 'driver@test.com',
    password: process.env.TEST_DRIVER_PASSWORD || null,
    routes: [
      ['/driver/dashboard',         'normal'],
      ['/driver/change-password',   'fast'],
    ],
    forbidden: [
      ['/admin/dashboard',    'admin area'],
      ['/nurse/nurse-patients', 'nurse area'],
      ['/patient/appointment',  'patient area'],
    ],
  },
];

const PUBLIC_ROUTES = [
  ['/',                        'fast'],
  ['/health',                  'fast'],
  ['/auth/login',              'fast'],
  ['/auth/register',           'fast'],
  ['/auth/forgot',             'fast'],
  ['/auth/resend-verification','fast'],
  ['/driver/login',            'fast'],
];

// ── Colors ───────────────────────────────────────────────────

const C = NO_COLOR ? {
  g: s => s, r: s => s, y: s => s, c: s => s, b: s => s, dim: s => s, x: ''
} : {
  g: s => '\x1b[32m' + s + '\x1b[0m',
  r: s => '\x1b[31m' + s + '\x1b[0m',
  y: s => '\x1b[33m' + s + '\x1b[0m',
  c: s => '\x1b[36m' + s + '\x1b[0m',
  b: s => '\x1b[1m' + s + '\x1b[0m',
  dim: s => '\x1b[2m' + s + '\x1b[0m',
  x: '',
};

// ── Results accumulator ──────────────────────────────────────

const results = {
  routes:      { pass: 0, warn: 0, fail: 0, items: [] },
  security:    { pass: 0, warn: 0, fail: 0, items: [] },
  rbac:        { pass: 0, fail: 0, items: [] },
  csrf:        { pass: 0, fail: 0, items: [] },
  latency:     { samples: [] },
};

// ── HTTP helpers ─────────────────────────────────────────────

function request(method, urlPath, opts = {}) {
  const { cookies = {}, body = null, extraHeaders = {} } = opts;
  return new Promise((resolve, reject) => {
    const parsed = new URL(BASE + urlPath);
    const lib = parsed.protocol === 'https:' ? https : http;
    const hdrs = { ...extraHeaders };
    const jar = Object.entries(cookies).map(([k, v]) => k + '=' + v).join('; ');
    if (jar) hdrs.Cookie = jar;

    let payload = null;
    if (body) {
      payload = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      hdrs['Content-Type']   = 'application/x-www-form-urlencoded';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }

    const started = process.hrtime.bigint();
    const req = lib.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: hdrs,
      timeout: 20000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({
          status: res.statusCode,
          location: res.headers.location || null,
          setCookies: res.headers['set-cookie'] || [],
          headers: res.headers,
          body: buf,
          bytes: Buffer.byteLength(buf),
          ms,
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function mergeCookies(jar, setCookies) {
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const i = pair.indexOf('=');
    if (i === -1) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (!v) delete jar[k]; else jar[k] = v;
  }
  return jar;
}

function extractCsrf(html) {
  const m = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/);
  return m ? m[1] : null;
}

// ── Security header checks ───────────────────────────────────

const SECURITY_HEADERS = [
  ['x-content-type-options', 'nosniff',         'warn'],
  ['x-frame-options',        'SAMEORIGIN|DENY', 'warn'],
  ['strict-transport-security', null,           'warn'],   // prod only
  ['referrer-policy',        null,              'warn'],
];

function checkSecurityHeaders(res, label) {
  const hits = [];
  for (const [header, expect, severity] of SECURITY_HEADERS) {
    const value = res.headers[header];
    if (!value) {
      hits.push({ header, expect, severity, found: null });
    } else if (expect && !new RegExp(expect, 'i').test(value)) {
      hits.push({ header, expect, severity, found: value });
    }
  }
  return hits;
}

// ── Latency recording ────────────────────────────────────────

function latencyBucket(ms) {
  if (ms < 100)   return '  excellent';
  if (ms < 300)   return '  good';
  if (ms < 800)   return '  fair';
  if (ms < 2000)  return '  slow';
  return '  very slow';
}

function checkLatency(ms, kind) {
  const t = LAT[kind] || LAT.normal;
  if (ms >= t.fail) return 'fail';
  if (ms >= t.warn) return 'warn';
  return 'pass';
}

// ── Login ────────────────────────────────────────────────────

async function login(role) {
  if (!role.password) {
    return { skip: true, reason: 'no password set' };
  }
  let jar = {};
  let r = await request('GET', role.loginPath);
  jar = mergeCookies(jar, r.setCookies);
  const csrf = extractCsrf(r.body);
  if (!csrf) return { skip: true, reason: 'no CSRF on login page' };

  r = await request('POST', role.loginPath, {
    cookies: jar,
    body: { email: role.email, password: role.password, _csrf: csrf },
  });
  jar = mergeCookies(jar, r.setCookies);

  if (r.status !== 302) {
    return { skip: true, reason: 'login returned ' + r.status };
  }
  return { jar, csrf };
}

// ── Route sweep ──────────────────────────────────────────────

async function testRoute(jar, path, kind) {
  let res;
  try {
    res = await request('GET', path, { cookies: jar });
  } catch (err) {
    return { ok: false, reason: 'error: ' + err.message };
  }

  if (res.status !== 200) {
    return { ok: false, reason: 'HTTP ' + res.status, res };
  }

  const latency = checkLatency(res.ms, kind);
  const secHits = checkSecurityHeaders(res, path);

  return { ok: true, res, latency, secHits };
}

async function testForbidden(jar, path) {
  let res;
  try {
    res = await request('GET', path, { cookies: jar });
  } catch (err) {
    return { ok: false, reason: 'error: ' + err.message };
  }
  // Expected: redirect (302) to login. 200 = leak.
  return { ok: res.status === 302 || res.status === 403, status: res.status };
}

async function testCsrfEnforced() {
  const checks = [];

  // 1. POST without CSRF -> should fail (302 or 403)
  let jar = {};
  let r = await request('GET', '/auth/login');
  jar = mergeCookies(jar, r.setCookies);
  r = await request('POST', '/auth/login', {
    cookies: jar,
    body: { email: 'x@x.com', password: 'x' },
  });
  checks.push({
    name: 'POST /auth/login without CSRF token',
    ok: r.status === 302 || r.status === 403,
    detail: 'HTTP ' + r.status,
  });

  // 2. POST with wrong CSRF -> should fail
  jar = {};
  r = await request('GET', '/auth/login');
  jar = mergeCookies(jar, r.setCookies);
  r = await request('POST', '/auth/login', {
    cookies: jar,
    body: { email: 'x@x.com', password: 'x', _csrf: 'wrong-token-here' },
  });
  checks.push({
    name: 'POST /auth/login with wrong CSRF token',
    ok: r.status === 302 || r.status === 403,
    detail: 'HTTP ' + r.status,
  });

  return checks;
}

// ── Main ─────────────────────────────────────────────────────

(async () => {
  console.log('');
  console.log(C.b('=============================================='));
  console.log(C.b('  Pre-commit check'));
  console.log(C.b('  Target: ' + BASE));
  console.log(C.b('=============================================='));

  // 1. Public routes ----------------------------------------
  console.log('');
  console.log(C.b('── 1. Public routes ──'));
  for (const [path, kind] of PUBLIC_ROUTES) {
    const r = await testRoute({}, path, kind);
    if (r.ok) {
      const lv = r.latency;
      const mark = lv === 'pass' ? C.g('OK  ') : lv === 'warn' ? C.y('WARN') : C.r('FAIL');
      console.log('  ' + mark + ' ' + String(Math.round(r.res.ms)).padStart(5) + 'ms  ' +
                  String(r.res.bytes).padStart(7) + ' B   ' + path);
      results.routes.items.push({ path, ms: r.res.ms, status: 'pass' });
      results.latency.samples.push({ path, ms: r.res.ms });
      if (lv === 'pass') results.routes.pass++;
      else if (lv === 'warn') results.routes.warn++;
      else results.routes.fail++;
    } else {
      console.log('  ' + C.r('FAIL') + ' ' + path + '  --  ' + r.reason);
      results.routes.fail++;
    }
  }

  // 2. Per-role routes --------------------------------------
  for (const role of ROLES) {
    console.log('');
    console.log(C.b('── Role: ' + role.name + ' ──'));

    const auth = await login(role);
    if (auth.skip) {
      console.log('  ' + C.y('SKIP') + '  login -- ' + auth.reason);
      console.log('        set TEST_' + role.name.toUpperCase() + '_PASSWORD to enable');
      continue;
    }
    console.log('  ' + C.g('OK  ') + ' login');

    for (const [path, kind] of role.routes) {
      const r = await testRoute(auth.jar, path, kind);
      if (r.ok) {
        const lv = r.latency;
        const mark = lv === 'pass' ? C.g('OK  ') : lv === 'warn' ? C.y('WARN') : C.r('FAIL');
        console.log('  ' + mark + ' ' + String(Math.round(r.res.ms)).padStart(5) + 'ms  ' +
                    String(r.res.bytes).padStart(7) + ' B   ' + path);
        results.routes.items.push({ path, ms: r.res.ms, status: lv });
        results.latency.samples.push({ path, ms: r.res.ms });
        if (lv === 'pass') results.routes.pass++;
        else if (lv === 'warn') results.routes.warn++;
        else results.routes.fail++;
      } else {
        console.log('  ' + C.r('FAIL') + ' ' + path + '  --  ' + r.reason);
        results.routes.fail++;
      }

      // Security headers (only check once per role, on first route)
      if (r.ok && results.security.items.length < 4) {
        for (const hit of r.secHits) {
          results.security.items.push({ role: role.name, path, ...hit });
          if (hit.severity === 'fail') results.security.fail++;
          else if (hit.severity === 'warn') results.security.warn++;
          else results.security.pass++;
        }
      }
    }

    // RBAC: forbidden routes
    for (const [path, label] of role.forbidden) {
      const r = await testForbidden(auth.jar, path);
      if (r.ok) {
        console.log('  ' + C.g('OK  ') + ' blocked ' + path + '  (' + label + ')');
        results.rbac.pass++;
      } else {
        console.log('  ' + C.r('FAIL') + ' LEAK! ' + path + ' returned ' + r.status);
        results.rbac.fail++;
      }
    }
  }

  // 3. CSRF enforcement -------------------------------------
  console.log('');
  console.log(C.b('── 3. CSRF enforcement ──'));
  const csrfChecks = await testCsrfEnforced();
  for (const c of csrfChecks) {
    if (c.ok) {
      console.log('  ' + C.g('OK  ') + ' ' + c.name);
      results.csrf.pass++;
    } else {
      console.log('  ' + C.r('FAIL') + ' ' + c.name + '  --  ' + c.detail);
      results.csrf.fail++;
    }
  }

  // 4. Summary ----------------------------------------------
  console.log('');
  console.log(C.b('=============================================='));
  console.log(C.b('  Summary'));
  console.log(C.b('=============================================='));

  console.log('');
  console.log('  Routes      ' + C.g(String(results.routes.pass).padStart(3) + ' pass') +
              '  ' + C.y(String(results.routes.warn).padStart(3) + ' warn') +
              '  ' + C.r(String(results.routes.fail).padStart(3) + ' fail'));
  console.log('  RBAC        ' + C.g(String(results.rbac.pass).padStart(3) + ' pass') +
              '            ' + C.r(String(results.rbac.fail).padStart(3) + ' fail'));
  console.log('  CSRF        ' + C.g(String(results.csrf.pass).padStart(3) + ' pass') +
              '            ' + C.r(String(results.csrf.fail).padStart(3) + ' fail'));
  console.log('  Security    ' + C.g(String(results.security.pass).padStart(3) + ' pass') +
              '  ' + C.y(String(results.security.warn).padStart(3) + ' warn') +
              '  ' + C.r(String(results.security.fail).padStart(3) + ' fail'));

  // Latency distribution
  if (results.latency.samples.length) {
    const sorted = results.latency.samples.map(s => s.ms).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;

    console.log('');
    console.log('  Latency (n=' + sorted.length + ')');
    console.log('    avg  : ' + Math.round(avg) + ' ms');
    console.log('    p50  : ' + Math.round(p50) + ' ms');
    console.log('    p95  : ' + Math.round(p95) + ' ms');
    console.log('    max  : ' + Math.round(max) + ' ms');
    console.log('    ' + C.dim('slowest: ' +
      results.latency.samples.slice().sort((a,b) => b.ms - a.ms)[0].path));
  }

  // Verdict
  console.log('');
  const totalFail = results.routes.fail + results.rbac.fail + results.csrf.fail + results.security.fail;
  const totalWarn = results.routes.warn + results.security.warn;

  if (totalFail === 0 && totalWarn === 0) {
    console.log(C.g(C.b('  ✅ ALL CLEAR — safe to commit')));
  } else if (totalFail === 0) {
    console.log(C.y(C.b('  ⚠️  ' + totalWarn + ' warning(s) — review before committing')));
  } else {
    console.log(C.r(C.b('  ❌ ' + totalFail + ' failure(s) — DO NOT COMMIT')));
  }
  console.log('');

  process.exit(totalFail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('');
  console.error(C.r('FATAL: ') + err.message);
  console.error(err.stack);
  process.exit(1);
});
