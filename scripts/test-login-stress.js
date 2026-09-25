// scripts/test-login-stress.js
// 5x (login -> logout). Fixed classifier for /patient-dashboard URLs.
require('dotenv').config();
const http = require('http');
const https = require('https');

const REMOTE = process.argv.includes('--remote');
const BASE = REMOTE
  ? (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://palmvalleymedicalcenter.africa.com').replace(/\/+$/, '')
  : ('http://localhost:' + (process.env.PORT || 3000));

const EMAIL = 'kevinnngondo@gmail.com';
const PASSWORD = 'Patient@1234';
const ATTEMPTS = 5;

// Where a successful login may land.
// Matches: /auth/patient-dashboard, /auth/nurse-dashboard,
//          /admin/dashboard, /patient/profile, /nurse/profile
const SUCCESS_DESTINATIONS = [
  '/auth/patient-dashboard',
  '/auth/nurse-dashboard',
  '/admin/dashboard',
  '/patient/profile',
  '/nurse/profile'
];

function isSuccessDestination(loc) {
  if (!loc) return false;
  return SUCCESS_DESTINATIONS.some(function (d) { return loc === d || loc.indexOf(d + '?') === 0; });
}

function req(method, path, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const u = new URL(BASE + path);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = {};
    if (opts.cookie) headers.Cookie = opts.cookie;
    let body = null;
    if (opts.body) {
      body = new URLSearchParams(opts.body).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = lib.request({
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: headers
    }, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          location: res.headers.location || null,
          setCookies: res.headers['set-cookie'] || [],
          body: b
        });
      });
    });
    r.on('error', function (e) { resolve({ error: e.message || String(e), code: e.code }); });
    r.setTimeout(20000, function () { r.destroy(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

function cookieHeaderFrom(setCookies) {
  const jar = {};
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    const cleared = val === '' || /Max-Age=0(?!\d)/i.test(sc);
    if (cleared) delete jar[name];
    else jar[name] = val;
  }
  return Object.entries(jar).map(function (e) { return e[0] + '=' + e[1]; }).join('; ');
}

function mergeCookies(existingHeader, setCookies) {
  const jar = {};
  existingHeader.split(';').forEach(function (part) {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const n = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (n) jar[n] = v;
  });
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    const cleared = val === '' || /Max-Age=0(?!\d)/i.test(sc);
    if (cleared) delete jar[name];
    else jar[name] = val;
  }
  return Object.entries(jar).map(function (e) { return e[0] + '=' + e[1]; }).join('; ');
}

(async function () {
  console.log('');
  console.log('==================================================');
  console.log('  Login Stress Test - ' + ATTEMPTS + ' cycles');
  console.log('  Target : ' + BASE);
  console.log('  Account: ' + EMAIL);
  console.log('==================================================');

  let firstTry = 0;
  let csrfCleared = 0;
  let rateLimited = false;

  for (let i = 1; i <= ATTEMPTS; i++) {
    console.log('');
    console.log('--- Attempt ' + i + '/' + ATTEMPTS + ' ---');

    const r1 = await req('GET', '/auth/login');
    if (r1.error) { console.log('  ERROR on GET: ' + r1.error); continue; }
    if (r1.status !== 200) { console.log('  FAIL: GET /auth/login -> ' + r1.status); continue; }

    let cookieHdr = cookieHeaderFrom(r1.setCookies);
    const m = (r1.body || '').match(/name="csrf-token"\s+content="([^"]+)"/);
    const token = m ? m[1] : null;
    if (!token) { console.log('  FAIL: no CSRF meta tag on login page'); continue; }

    const r2 = await req('POST', '/auth/login', {
      cookie: cookieHdr,
      body: { email: EMAIL, password: PASSWORD, _csrf: token }
    });

    if (r2.error) { console.log('  ERROR on POST: ' + r2.error); continue; }

    const loc = r2.location || '(none)';
    const didClearCsrf = (r2.setCookies || []).some(function (sc) {
      return sc.split(';')[0].trim() === 'x-csrf-token=';
    });

    console.log('  POST /auth/login -> ' + r2.status + '  Location: ' + loc);

    if (r2.status === 429) {
      console.log('  WARN: HTTP 429 - hit the login rate limiter');
      rateLimited = true;
      break;
    }

    if (r2.status === 302 && isSuccessDestination(loc)) {
      console.log('  PASS: logged in on first try');
      firstTry++;
    } else if (r2.status === 403) {
      console.log('  FAIL: CSRF rejected the POST');
    } else if (r2.status === 302 && loc === '/auth/login') {
      console.log('  FAIL: wrong credentials or account state');
    } else {
      console.log('  FAIL: unexpected outcome (status=' + r2.status + ', loc=' + loc + ')');
    }

    if (didClearCsrf) {
      console.log('  PASS: x-csrf-token cookie was cleared');
      csrfCleared++;
    } else {
      console.log('  WARN: x-csrf-token cookie NOT cleared');
    }

    cookieHdr = mergeCookies(cookieHdr, r2.setCookies);
    const r3 = await req('GET', '/auth/logout', { cookie: cookieHdr });
    console.log('  GET /auth/logout -> ' + r3.status);

    if (i < ATTEMPTS) await new Promise(function (res) { setTimeout(res, 1000); });
  }

  console.log('');
  console.log('==================================================');
  console.log('  Summary');
  console.log('==================================================');
  console.log('  Attempts                     : ' + ATTEMPTS);
  console.log('  First-try successes          : ' + firstTry + '/' + ATTEMPTS);
  console.log('  CSRF cookie cleared on login : ' + csrfCleared + '/' + ATTEMPTS);
  console.log('');

  if (rateLimited) {
    console.log('  RESULT: INCONCLUSIVE - rate limiter kicked in');
    console.log('  Restart the server or wait 15 minutes and re-run.');
  } else if (firstTry === ATTEMPTS && csrfCleared === ATTEMPTS) {
    console.log('  RESULT: FIX CONFIRMED - every login worked on first try, CSRF cleared each time');
  } else if (firstTry === ATTEMPTS && csrfCleared === 0) {
    console.log('  RESULT: login works but CSRF never cleared - verify clearCsrfCookie() in routes/auth.js');
  } else {
    console.log('  RESULT: some attempts failed - see details above');
  }
  console.log('');
})();
