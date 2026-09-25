// scripts/diagnose-login.js
// Raw diagnostic — one login attempt, all data printed.
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:' + (process.env.PORT || 3000);
const EMAIL = 'kevinnngondo@gmail.com';
const PASSWORD = 'Patient@1234';

function req(method, path, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const u = new URL(BASE + path);
    const headers = {};
    if (opts.cookie) headers.Cookie = opts.cookie;
    let body = null;
    if (opts.body) {
      body = new URLSearchParams(opts.body).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = http.request({
      method: method,
      hostname: u.hostname,
      port: u.port,
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
    r.on('error', function (e) {
      resolve({ error: e.message, code: e.code });
    });
    if (body) r.write(body);
    r.end();
  });
}

(async function () {
  console.log('BASE = ' + BASE);
  console.log('');

  console.log('=== GET /auth/login ===');
  const r1 = await req('GET', '/auth/login');
  console.log('  status   : ' + r1.status);
  console.log('  error    : ' + (r1.error || '(none)'));
  console.log('  set-cookie:');
  (r1.setCookies || []).forEach(function (c) {
    console.log('    - ' + c.split(';')[0]);
  });

  const m = (r1.body || '').match(/name="csrf-token"\s+content="([^"]+)"/);
  const csrf = m ? m[1] : null;
  console.log('  csrf token found: ' + (csrf ? 'YES (' + csrf.substring(0, 24) + '...)' : 'NO'));
  console.log('');

  const cookieHdr = (r1.setCookies || [])
    .map(function (c) { return c.split(';')[0]; })
    .join('; ');
  console.log('Cookie header for POST: ' + cookieHdr.substring(0, 80) + '...');
  console.log('');

  console.log('=== POST /auth/login ===');
  console.log('  email    : ' + EMAIL);
  const r2 = await req('POST', '/auth/login', {
    cookie: cookieHdr,
    body: { email: EMAIL, password: PASSWORD, _csrf: csrf }
  });
  console.log('  status   : ' + r2.status);
  console.log('  error    : ' + (r2.error || '(none)'));
  console.log('  code     : ' + (r2.code || '(none)'));
  console.log('  location : ' + (r2.location || '(none)'));
  console.log('  set-cookie:');
  (r2.setCookies || []).forEach(function (c) {
    console.log('    - ' + c.split(';')[0]);
  });
  console.log('');
  console.log('  body preview (first 400 chars):');
  console.log('  ' + (r2.body || '').substring(0, 400).replace(/\n/g, '\n  '));
})();
