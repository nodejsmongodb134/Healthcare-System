// scripts/diagnose-csrf.js
// Runs a login flow and prints session IDs at each step.
require('dotenv').config();
const http = require('http');
const https = require('https');

const REMOTE = process.argv.includes('--remote');
const BASE = REMOTE
  ? (process.env.BASE_URL || 'https://palmvalleymedicalcenter.africa.com').replace(/\/+$/, '')
  : ('http://localhost:' + (process.env.PORT || 3000));

const EMAIL = 'nodejsmongodb12@gmail.com';
const PASSWORD = 'Nurse@1234';

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
      method, hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, headers
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
    r.on('error', function (e) { resolve({ error: e.message }); });
    if (body) r.write(body);
    r.end();
  });
}

(async function () {
  console.log('BASE = ' + BASE);
  console.log('');

  // Step 1: GET login
  const r1 = await req('GET', '/auth/login');
  console.log('=== GET /auth/login ===');
  console.log('status  : ' + r1.status);
  r1.setCookies.forEach(function (sc) {
    const name = sc.split('=')[0];
    const val = sc.split(';')[0].split('=').slice(1).join('=');
    if (name === 'connect.sid') {
      const m = val.match(/^s%3A([^.]+)\./);
      console.log('connect.sid sessionId = ' + (m ? decodeURIComponent(m[1]) : val.substring(0, 24) + '...'));
    } else {
      console.log(name + ' = ' + val.substring(0, 24) + '...');
    }
  });

  const csrfMatch = (r1.body || '').match(/name="csrf-token"\s+content="([^"]+)"/);
  const token = csrfMatch ? csrfMatch[1] : null;
  console.log('csrf meta token : ' + (token ? token.substring(0, 32) + '...' : 'MISSING'));
  console.log('');

  const cookieHdr = r1.setCookies.map(function (sc) { return sc.split(';')[0]; }).join('; ');

  // Step 2: POST login
  const r2 = await req('POST', '/auth/login', {
    cookie: cookieHdr,
    body: { email: EMAIL, password: PASSWORD, _csrf: token }
  });
  console.log('=== POST /auth/login ===');
  console.log('status   : ' + r2.status);
  console.log('location : ' + (r2.location || '(none)'));
  console.log('set-cookie:');
  r2.setCookies.forEach(function (sc) {
    const name = sc.split('=')[0];
    const val = sc.split(';')[0].split('=').slice(1).join('=');
    if (name === 'connect.sid') {
      const m = val.match(/^s%3A([^.]+)\./);
      console.log('  connect.sid sessionId = ' + (m ? decodeURIComponent(m[1]) : val.substring(0, 24) + '...'));
    } else {
      console.log('  ' + name + ' = ' + val.substring(0, 24) + '...');
    }
  });
  console.log('');

  if (r2.status === 403) {
    console.log('*** CSRF REJECTED ***');
  } else if (r2.status === 302) {
    console.log('OK — login succeeded');
  }
})();
