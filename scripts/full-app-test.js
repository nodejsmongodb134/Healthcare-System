// scripts/full-app-test.js
// Comprehensive smoke test for the whole app.
// Usage:
//   node scripts/full-app-test.js                 -> tests localhost:3000
//   node scripts/full-app-test.js --remote        -> tests BASE_URL from .env

require('dotenv').config();
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REMOTE = process.argv.includes('--remote');
const ROOT = path.resolve(__dirname, '..');

let BASE;
if (REMOTE) {
  BASE = (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (!BASE) {
    console.error('BASE_URL / RENDER_EXTERNAL_URL not set in .env');
    process.exit(1);
  }
} else {
  BASE = 'http://localhost:' + (process.env.PORT || 3000);
}

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const results = { passed: 0, failed: 0, warned: 0, info: 0 };
const pass = (s) => { console.log(G + '[PASS]' + X + ' ' + s); results.passed++; };
const fail = (s) => { console.log(R + '[FAIL]' + X + ' ' + s); results.failed++; };
const warn = (s) => { console.log(Y + '[WARN]' + X + ' ' + s); results.warned++; };
const info = (s) => { console.log(C + '[INFO]' + X + ' ' + s); results.info++; };
const head = (s) => { console.log(''); console.log(B + '--- ' + s + ' ---' + X); };

// ------------------------------------------------------------
// HTTP helper
// ------------------------------------------------------------
function req(method, urlPath, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(BASE + urlPath); } catch (e) { return reject(e); }
    const lib = url.protocol === 'https:' ? https : http;
    const headers = Object.assign({}, opts.headers || {});
    const jar = opts.cookies
      ? Object.entries(opts.cookies).map(function (e) { return e[0] + '=' + e[1]; }).join('; ')
      : '';
    if (jar) headers.Cookie = jar;

    let body = null;
    if (opts.body) {
      body = typeof opts.body === 'string' ? opts.body : new URLSearchParams(opts.body).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const r = lib.request({
      method: method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: headers
    }, function (res) {
      let buf = '';
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          location: res.headers.location || null,
          setCookies: res.headers['set-cookie'] || [],
          headers: res.headers,
          body: buf
        });
      });
    });

    r.setTimeout(20000, function () { r.destroy(new Error('timeout')); });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function mergeCookies(jar, setCookies) {
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === '' || sc.indexOf('Expires=Thu, 01 Jan 1970') !== -1) {
      delete jar[name];
    } else {
      jar[name] = value;
    }
  }
  return jar;
}

function extractCsrf(html) {
  const m = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/);
  return m ? m[1] : null;
}

// ------------------------------------------------------------
// 1. STATIC FILE CHECKS
// ------------------------------------------------------------
function testStatic() {
  head('1. Static file checks');

  const checks = [
    ['server.js',                'server'],
    ['routes/auth.js',           'auth route'],
    ['routes/profile.js',        'profile route'],
    ['views/nurse/change-password.ejs', 'nurse pw page'],
    ['views/driver/dashboard.ejs', 'driver dashboard'],
    ['middleware/csrf.js',       'CSRF middleware'],
    ['middleware/encryption.js', 'encryption middleware']
  ];

  for (const [rel, label] of checks) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) pass(label + ' exists: ' + rel);
    else fail(label + ' MISSING: ' + rel);
  }

  // routes/profile.js must have the auto-create fix
  const prof = fs.readFileSync(path.join(ROOT, 'routes/profile.js'), 'utf8');
  if (prof.indexOf('Auto-creating Patient profile') !== -1) pass('profile.js has auto-create fix');
  else fail('profile.js is MISSING the auto-create fix');
  if (prof.indexOf('profileComplete = true') !== -1) pass('profile.js sets profileComplete=true');
  else fail('profile.js does NOT set profileComplete');

  // routes/auth.js must use buildUrl helper
  const auth = fs.readFileSync(path.join(ROOT, 'routes/auth.js'), 'utf8');
  if (auth.indexOf('function buildUrl') !== -1) pass('auth.js has buildUrl helper');
  else fail('auth.js MISSING buildUrl helper');

  // nurse change-password must not have PowerShell wrapper
  const nurse = fs.readFileSync(path.join(ROOT, 'views/nurse/change-password.ejs'), 'utf8');
  if (nurse.indexOf("Set-Content") === -1 && nurse.indexOf("$content") === -1) pass('nurse change-password.ejs is clean');
  else fail('nurse change-password.ejs still has PowerShell wrapper');
}

// ------------------------------------------------------------
// 2. SERVER REACHABLE
// ------------------------------------------------------------
async function testServerUp() {
  head('2. Server reachability');
  try {
    const r = await req('GET', '/health');
    if (r.status === 200) pass('GET /health -> 200');
    else { fail('GET /health -> ' + r.status); return false; }

    try {
      const j = JSON.parse(r.body);
      if (j.status === 'ok') pass('health payload has status=ok');
      else fail('health status not ok: ' + JSON.stringify(j));
      info('uptime: ' + j.uptime + 's, timestamp: ' + j.timestamp);
    } catch (e) {
      fail('health response not JSON: ' + r.body.substring(0, 80));
    }
    return true;
  } catch (err) {
    fail('Server unreachable at ' + BASE + ' - ' + err.message);
    info('Start it with: npm start');
    return false;
  }
}

// ------------------------------------------------------------
// 3. PUBLIC ROUTES
// ------------------------------------------------------------
async function testPublicRoutes() {
  head('3. Public routes');
  const routes = [
    ['/',                  'index'],
    ['/auth/login',        'login'],
    ['/auth/register',     'register'],
    ['/auth/forgot',       'forgot'],
    ['/auth/resend-verification', 'resend'],
    ['/driver/login',      'driver login']
  ];
  for (const [p, label] of routes) {
    try {
      const r = await req('GET', p);
      if (r.status === 200) pass('GET ' + p + ' -> 200 (' + label + ')');
      else fail('GET ' + p + ' -> ' + r.status);
    } catch (err) {
      fail('GET ' + p + ' threw: ' + err.message);
    }
  }
}

// ------------------------------------------------------------
// 4. URL NORMALIZATION
// ------------------------------------------------------------
async function testUrlNormalization() {
  head('4. URL normalization (double-slash heal)');
  try {
    const r = await req('GET', '//auth/reset/sometoken');
    if (r.status === 301 && r.location === '/auth/reset/sometoken') {
      pass('//auth/reset/... -> 301 Location: /auth/reset/...');
    } else {
      fail('expected 301 -> /auth/reset/sometoken, got ' + r.status + ' -> ' + r.location);
    }
  } catch (err) {
    fail('double-slash test threw: ' + err.message);
  }
}

// ------------------------------------------------------------
// 5. CSRF PROTECTION
// ------------------------------------------------------------
async function testCsrf() {
  head('5. CSRF protection');

  // Get CSRF token from login page
  let cookieJar = {};
  let token = null;
  try {
    const r = await req('GET', '/auth/login');
    cookieJar = mergeCookies(cookieJar, r.setCookies);
    token = extractCsrf(r.body);
    if (token) pass('CSRF token present in login page meta tag');
    else fail('No CSRF meta tag on /auth/login');
  } catch (err) {
    fail('Could not fetch /auth/login: ' + err.message);
    return;
  }

  // POST without token — must be rejected
  try {
    const r = await req('POST', '/auth/login', {
      cookies: cookieJar,
      body: { email: 'x@test.com', password: 'wrong' }
    });
    if (r.status === 302 || r.status === 403) pass('POST without CSRF token blocked (' + r.status + ')');
    else fail('POST without CSRF token returned ' + r.status + ' (should be 302 or 403)');
  } catch (err) {
    fail('CSRF missing-token test threw: ' + err.message);
  }

  // POST with wrong token — must be rejected
  try {
    const r = await req('POST', '/auth/login', {
      cookies: cookieJar,
      body: { email: 'x@test.com', password: 'wrong', _csrf: 'not-a-real-token' }
    });
    if (r.status === 302 || r.status === 403) pass('POST with wrong CSRF token blocked (' + r.status + ')');
    else fail('POST with wrong CSRF token returned ' + r.status);
  } catch (err) {
    fail('CSRF wrong-token test threw: ' + err.message);
  }
}

// ------------------------------------------------------------
// 6. ENCRYPTION AT REST (DB)
// ------------------------------------------------------------
async function testEncryption() {
  head('6. Encryption at rest');

  if (mongoose.connection.readyState !== 1) {
    warn('MongoDB not connected - skipping');
    return;
  }

  const User = require('../models/User');
  const { blindIndex } = require('../utils/blindIndex');

  const target = 'valley.palm@yahoo.com';
  const h = blindIndex(target);
  const u = await User.findOne({ emailHash: h });

  if (!u) {
    warn('Admin account ' + target + ' not found - skipping');
    return;
  }

  // Read the raw document without Mongoose getters
  const raw = await mongoose.connection.collection('users').findOne({ emailHash: h });
  if (!raw) { fail('raw doc not found'); return; }

  // Encrypted field should have the "iv:authTag:ciphertext" or "|"-separated format
  const rawEmail = raw.email || '';
  const looksEncrypted = rawEmail.indexOf('|') !== -1 || rawEmail.indexOf(':') !== -1;
  if (looksEncrypted) pass('email stored as ciphertext in DB');
  else fail('email appears to be plaintext in DB: ' + rawEmail.substring(0, 40));

  // Blind index should be a 64-char hex string
  if (/^[0-9a-f]{64}$/.test(raw.emailHash || '')) pass('emailHash is a valid HMAC-SHA256 hex');
  else fail('emailHash invalid: ' + raw.emailHash);

  // Mongoose getter should decrypt on read
  if (u.email === target) pass('Mongoose getter decrypts email correctly');
  else fail('Mongoose returned wrong email: ' + u.email);
}

// ------------------------------------------------------------
// 7. FULL AUTH FLOW (register -> verify -> login)
// ------------------------------------------------------------
async function testAuthFlow() {
  head('7. Auth flow: register -> verify -> login -> profile');

  if (mongoose.connection.readyState !== 1) {
    warn('MongoDB not connected - skipping');
    return;
  }

  const User = require('../models/User');
  const { blindIndex } = require('../utils/blindIndex');

  const stamp = Date.now();
  const email = 'test-user-' + stamp + '@test.local';
  const password = 'Test@' + stamp;
  const name = 'Test User ' + stamp;
  const emailHash = blindIndex(email);

  // Cleanup any previous runs
  await User.deleteOne({ emailHash }).catch(function () {});

  // Get CSRF + session
  let jar = {};
  let csrf = null;
  try {
    const r = await req('GET', '/auth/register');
    jar = mergeCookies(jar, r.setCookies);
    csrf = extractCsrf(r.body);
  } catch (err) {
    fail('could not fetch /auth/register: ' + err.message);
    return;
  }

  // Register
  try {
    const r = await req('POST', '/auth/register', {
      cookies: jar,
      body: { name: name, email: email, password: password, _csrf: csrf }
    });
    if (r.status === 302) pass('POST /auth/register -> 302');
    else fail('POST /auth/register -> ' + r.status);
    jar = mergeCookies(jar, r.setCookies);
  } catch (err) {
    fail('register threw: ' + err.message);
    return;
  }

  // Verify user exists in DB
  let user = await User.findOne({ emailHash: emailHash });
  if (user) pass('User created in DB');
  else { fail('User NOT created in DB'); return; }

  if (user.isVerified === false) pass('User.isVerified = false (pending verification)');
  else fail('User.isVerified should be false before verify');

  // Verify via token
  if (!user.verificationToken) {
    fail('verificationToken missing from DB');
  } else {
    try {
      const r = await req('GET', '/auth/verify/' + user.verificationToken);
      if (r.status === 302) pass('GET /auth/verify/:token -> 302');
      else fail('GET /auth/verify/:token -> ' + r.status);
    } catch (err) {
      fail('verify threw: ' + err.message);
    }
  }

  // Confirm verified
  user = await User.findOne({ emailHash: emailHash });
  if (user && user.isVerified === true) pass('User.isVerified = true after verify');
  else fail('User was not marked verified');

  // Login
  let loginJar = {};
  let loginCsrf = null;
  try {
    const r0 = await req('GET', '/auth/login');
    loginJar = mergeCookies(loginJar, r0.setCookies);
    loginCsrf = extractCsrf(r0.body);
    const r = await req('POST', '/auth/login', {
      cookies: loginJar,
      body: { email: email, password: password, _csrf: loginCsrf }
    });
    if (r.status === 302) pass('POST /auth/login -> 302');
    else fail('POST /auth/login -> ' + r.status);
    loginJar = mergeCookies(loginJar, r.setCookies);
  } catch (err) {
    fail('login threw: ' + err.message);
    return;
  }

  // Hit profile page
  try {
    const r = await req('GET', '/patient/profile', { cookies: loginJar });
    if (r.status === 200) pass('GET /patient/profile -> 200 (authenticated)');
    else fail('GET /patient/profile -> ' + r.status);
  } catch (err) {
    fail('profile page threw: ' + err.message);
  }

  // Save profile
  try {
    const r0 = await req('GET', '/patient/profile', { cookies: loginJar });
    loginJar = mergeCookies(loginJar, r0.setCookies);
    const freshCsrf = extractCsrf(r0.body) || loginCsrf;
    const r = await req('POST', '/patient/profile/update', {
      cookies: loginJar,
      body: {
        phone: '0814725890',
        idNumber: 'TEST-' + stamp,
        dateOfBirth: '1995-05-05',
        gender: 'male',
        address: 'Test Address, Windhoek',
        _csrf: freshCsrf
      }
    });
    if (r.status === 302) pass('POST /patient/profile/update -> 302');
    else fail('POST /patient/profile/update -> ' + r.status);
  } catch (err) {
    fail('profile save threw: ' + err.message);
  }

  // Confirm profileComplete flipped
  user = await User.findOne({ emailHash: emailHash });
  if (user && user.profileComplete === true) pass('user.profileComplete = true after save');
  else fail('user.profileComplete not set to true');

  // Confirm Patient doc exists
  const Patient = require('../models/Patient');
  const pat = await Patient.findOne({ userId: user._id });
  if (pat) {
    pass('Patient document created');
    if (pat.phone === '0814725890') pass('Patient.phone saved correctly');
    else fail('Patient.phone = ' + pat.phone);
    if (pat.gender === 'male') pass('Patient.gender saved correctly');
    else fail('Patient.gender = ' + pat.gender);
    if (pat.address === 'Test Address, Windhoek') pass('Patient.address saved correctly');
    else fail('Patient.address = ' + pat.address);
  } else {
    fail('Patient document NOT created');
  }

  // Role-based access: patient cannot reach /admin or /nurse
  try {
    const rAdmin = await req('GET', '/admin/dashboard', { cookies: loginJar });
    if (rAdmin.status === 302) pass('patient blocked from /admin/dashboard');
    else fail('patient reached /admin/dashboard: ' + rAdmin.status);

    const rNurse = await req('GET', '/nurse/nurse-appointments', { cookies: loginJar });
    if (rNurse.status === 302) pass('patient blocked from /nurse/nurse-appointments');
    else fail('patient reached /nurse page: ' + rNurse.status);
  } catch (err) {
    fail('RBAC check threw: ' + err.message);
  }

  // Cleanup
  try {
    await Patient.deleteOne({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    info('Cleaned up test user ' + email);
  } catch (e) {
    warn('cleanup failed: ' + e.message);
  }
}

// ------------------------------------------------------------
// 8. ADMIN LOGIN (if account exists)
// ------------------------------------------------------------
async function testAdmin() {
  head('8. Admin login and routes');

  if (mongoose.connection.readyState !== 1) {
    warn('MongoDB not connected - skipping');
    return;
  }

  const email = 'valley.palm@yahoo.com';
  const password = process.env.TEST_ADMIN_PASSWORD || null;
  if (!password) {
    info('Set TEST_ADMIN_PASSWORD env to run this test - skipping');
    return;
  }

  let jar = {};
  let csrf = null;
  try {
    const r0 = await req('GET', '/auth/login');
    jar = mergeCookies(jar, r0.setCookies);
    csrf = extractCsrf(r0.body);
    const r = await req('POST', '/auth/login', {
      cookies: jar,
      body: { email: email, password: password, _csrf: csrf }
    });
    if (r.status === 302) pass('admin login -> 302');
    else fail('admin login -> ' + r.status);
    jar = mergeCookies(jar, r.setCookies);
  } catch (err) {
    fail('admin login threw: ' + err.message);
    return;
  }

  const pages = [
    '/admin/dashboard',
    '/admin/patients',
    '/admin/nurses',
    '/admin/drivers',
    '/admin/orders',
    '/admin/messages',
    '/admin/audit',
    '/admin/analytics',
    '/admin/announcements',
    '/admin/export'
  ];
  for (const p of pages) {
    try {
      const r = await req('GET', p, { cookies: jar });
      if (r.status === 200) pass('GET ' + p + ' -> 200');
      else fail('GET ' + p + ' -> ' + r.status);
    } catch (err) {
      fail('GET ' + p + ' threw: ' + err.message);
    }
  }
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async function () {
  console.log('');
  console.log(B + '==============================================' + X);
  console.log(B + '  Full Application Test Suite' + X);
  console.log(B + '  Target: ' + BASE + X);
  console.log(B + '==============================================' + X);

  testStatic();

  const up = await testServerUp();
  if (!up) {
    console.log('');
    console.log(R + 'Aborting - server must be running.' + X);
    process.exit(1);
  }

  // Connect to Mongo for DB tests
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      info('Connected to MongoDB');
    } catch (err) {
      warn('MongoDB connect failed: ' + err.message);
    }
  } else {
    warn('MONGODB_URI not set - skipping DB tests');
  }

  await testPublicRoutes();
  await testUrlNormalization();
  await testCsrf();
  await testEncryption();
  await testAuthFlow();
  await testAdmin();

  console.log('');
  console.log(B + '==============================================' + X);
  console.log(B + '  Summary' + X);
  console.log(B + '==============================================' + X);
  console.log('  ' + G + 'Passed  : ' + results.passed + X);
  console.log('  ' + R + 'Failed  : ' + results.failed + X);
  console.log('  ' + Y + 'Warned  : ' + results.warned + X);
  console.log('  ' + C + 'Info    : ' + results.info + X);
  console.log('');

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }

  process.exit(results.failed > 0 ? 1 : 0);
})().catch(function (err) {
  console.error('');
  console.error(R + 'FATAL: ' + X + err.stack || err.message);
  process.exit(1);
});
