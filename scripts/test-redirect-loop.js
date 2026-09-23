// scripts/test-redirect-loop.js
// Verifies the redirect-loop fix in server.js and routes/auth.js
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = (s) => `${G}[PASS] ${s}${X}`;
const fail = (s) => `${R}[FAIL] ${s}${X}`;
const warn = (s) => `${Y}[WARN] ${s}${X}`;
const info = (s) => `${C}[INFO] ${s}${X}`;
const head = (s) => `\n${B}=== ${s} ===${X}`;

let passCount = 0, failCount = 0;
function pass(m)    { console.log(ok(m));    passCount++; }
function failMsg(m) { console.log(fail(m));  failCount++; }
function warnMsg(m) { console.log(warn(m)); }

// ---------- HTTP helper ----------
function request(method, urlPath, opts = {}) {
  const { cookies = {}, body = null } = opts;
  return new Promise((resolve, reject) => {
    const jar = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const headers = {};
    if (jar) headers.Cookie = jar;

    let data = null;
    if (body) {
      data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request({ method, hostname: HOST, port: PORT, path: urlPath, headers }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location || null,
        setCookies: res.headers['set-cookie'] || [],
        body: buf
      }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function mergeCookies(jar, setCookies) {
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const val  = pair.slice(eq + 1).trim();
    if (val === '' || sc.includes('Expires=Thu, 01 Jan 1970')) {
      delete jar[name];                 // cleared
    } else {
      jar[name] = val;
    }
  }
  return jar;
}

async function followRedirects(startPath, cookies, maxHops = 10) {
  const chain = [];
  let jar = { ...cookies };
  let p = startPath;

  for (let i = 0; i < maxHops; i++) {
    const res = await request('GET', p, { cookies: jar });
    chain.push({ path: p, status: res.status, location: res.location });
    jar = mergeCookies(jar, res.setCookies);

    if (res.status >= 300 && res.status < 400 && res.location) {
      p = res.location.startsWith('http') ? new URL(res.location).pathname : res.location;
      continue;
    }
    break;
  }
  return chain;
}

// ---------- Cookie signer (matches express-session) ----------
function signSid(sid, secret) {
  const sig = crypto.createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  return `s:${sid}.${sig}`;
}

// ---------- Test 1: static code check ----------
function testStaticCode() {
  head('TEST 1 - Static code check');

  const authSrc   = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  const authPatches   = (authSrc.match(/Stale session for user id/g) || []).length;
  const serverPatches = (serverSrc.match(/Homepage session verify failed/g) || []).length;
  const oldFlash      = (authSrc.match(/req\.flash\('error_msg', 'User not found'\);/g) || []).length;

  if (authPatches === 2)   pass(`routes/auth.js has ${authPatches}/2 dashboard patches`);
  else                     failMsg(`routes/auth.js has ${authPatches}/2 dashboard patches`);

  if (serverPatches === 1) pass(`server.js has ${serverPatches}/1 homepage patch`);
  else                     failMsg(`server.js has ${serverPatches}/1 homepage patch`);

  if (oldFlash === 0)      pass(`Old "User not found" flash has been removed`);
  else                     failMsg(`Old "User not found" flash still present (${oldFlash})`);
}

// ---------- Test 2: server reachable ----------
async function testServerReachable() {
  head('TEST 2 - Server reachable');
  try {
    const res = await request('GET', '/health');
    if (res.status === 200) pass('GET /health -> 200');
    else                    failMsg(`GET /health -> ${res.status}`);
  } catch (err) {
    failMsg(`Server unreachable at http://${HOST}:${PORT} - ${err.message}`);
    info('Start the server with: npm start');
    throw err;
  }
}

// ---------- Test 3: anonymous visit ----------
async function testAnonymousVisit() {
  head('TEST 3 - Anonymous visit to /');
  const chain = await followRedirects('/', {});
  chain.forEach((h, i) => {
    const loc = h.location ? ` -> ${h.location}` : '';
    console.log(`   ${i + 1}. GET ${h.path} -> ${h.status}${loc}`);
  });

  if (chain.length === 1 && chain[0].status === 200) {
    pass('Anonymous visit renders index page (no redirect)');
  } else if (chain.length === 2 && chain[chain.length - 1].status === 200) {
    pass(`Anonymous visit redirects cleanly (chain length ${chain.length})`);
  } else if (chain.length >= 10) {
    failMsg(`Anonymous visit chain length ${chain.length} - LOOP DETECTED`);
  } else {
    warnMsg(`Anonymous visit chain length ${chain.length} - review manually`);
  }
}

// ---------- Test 4: stale session ----------
async function testStaleSession() {
  head('TEST 4 - Stale session (user does not exist in DB)');

  if (mongoose.connection.readyState !== 1) {
    warnMsg('Skipping - MongoDB not connected');
    return;
  }

  const secret = process.env.SESSION_SECRET || 'your-secret-key';
  const sid = crypto.randomBytes(24).toString('hex');
  const fakeUserId = new mongoose.Types.ObjectId().toString();

  const sessionData = {
    cookie: {
      originalMaxAge: 3600000,
      expires: new Date(Date.now() + 3600000).toISOString(),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false
    },
    user: {
      id: fakeUserId,
      name: 'Ghost Patient',
      email: 'ghost@test.local',
      role: 'patient',
      isVerified: true,
      profileComplete: true,
      isActive: true
    }
  };

  const coll = mongoose.connection.collection('sessions');
  await coll.insertOne({
    _id: sid,
    session: JSON.stringify(sessionData),
    expires: new Date(Date.now() + 3600000)
  });

  console.log(`   Injected session : ${sid.substring(0, 16)}...`);
  console.log(`   Fake user ID     : ${fakeUserId}`);

  const cookieValue = signSid(sid, secret);
  const cookies = { 'connect.sid': cookieValue };

  const chain = await followRedirects('/', cookies, 10);
  chain.forEach((h, i) => {
    const loc = h.location ? ` -> ${h.location}` : '';
    console.log(`   ${i + 1}. GET ${h.path} -> ${h.status}${loc}`);
  });

  await coll.deleteOne({ _id: sid });

  if (chain.length === 1 && chain[0].status === 200) {
    pass(`Stale session handled in one request (index rendered after destroying session)`);
  } else if (chain.length === 2 && chain[1].path === '/auth/login' && chain[1].status === 200) {
    pass(`Stale session redirected to /auth/login once (chain length 2)`);
  } else if (chain.length >= 10) {
    failMsg(`Stale session chain length ${chain.length} - LOOP STILL EXISTS`);
  } else {
    warnMsg(`Stale session chain length ${chain.length} - review manually`);
  }
}

// ---------- Test 5: login page ----------
async function testLoginPage() {
  head('TEST 5 - /auth/login renders for anonymous');
  const res = await request('GET', '/auth/login');
  if (res.status === 200) pass('GET /auth/login -> 200');
  else                    failMsg(`GET /auth/login -> ${res.status}`);
}

// ---------- Main ----------
(async () => {
  console.log(`\n${B}=== REDIRECT-LOOP TEST SUITE ===${X}`);
  console.log(`   Target: http://${HOST}:${PORT}\n`);

  testStaticCode();

  try {
    await testServerReachable();
  } catch {
    console.log(`\n${R}Aborting - server must be running.${X}\n`);
    process.exit(1);
  }

  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log(info('Connected to MongoDB (for stale-session test)'));
    } catch (err) {
      warnMsg(`MongoDB connect failed: ${err.message}`);
    }
  } else {
    warnMsg('MONGODB_URI not set - stale-session test will skip');
  }

  await testAnonymousVisit();
  await testStaleSession();
  await testLoginPage();

  console.log(`\n${B}=== SUMMARY ===${X}`);
  console.log(`   ${G}Passed: ${passCount}${X}`);
  console.log(`   ${R}Failed: ${failCount}${X}`);
  console.log('');

  if (mongoose.connection.readyState === 1) await mongoose.connection.close();
  process.exit(failCount > 0 ? 1 : 0);
})().catch(err => {
  console.error(`\n${R}FATAL:${X}`, err);
  process.exit(1);
});
