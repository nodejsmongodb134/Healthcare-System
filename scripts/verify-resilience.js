// scripts/verify-resilience.js
// Verifies all poor-connection resilience features are implemented correctly.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const LOCAL = `http://localhost:${process.env.PORT || 3000}`;

// ANSI
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = (s) => `${G}✅ ${s}${X}`;
const fail = (s) => `${R}❌ ${s}${X}`;
const warn = (s) => `${Y}⚠️  ${s}${X}`;
const info = (s) => `${C}ℹ️  ${s}${X}`;
const head = (s) => `\n${B}═══ ${s} ═══${X}`;

let pass = 0, failCount = 0, warnCount = 0, infoCount = 0;
function record(s) {
  if (s === 'pass') pass++;
  else if (s === 'fail') failCount++;
  else if (s === 'warn') warnCount++;
  else if (s === 'info') infoCount++;
}

// ---------- HTTP helper ----------
function request(method, url, { headers = {}, body = null, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: { ...headers, 'Accept-Encoding': 'gzip, deflate, br' }
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
        const enc = res.headers['content-encoding'];
        try {
          if (enc === 'gzip') decoded = zlib.gunzipSync(raw);
          else if (enc === 'deflate') decoded = zlib.inflateSync(raw);
          else if (enc === 'br') decoded = zlib.brotliDecompressSync(raw);
        } catch (e) { /* ignore */ }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          rawLength: raw.length,
          body: decoded.toString(),
          encoding: enc || null
        });
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ============================================================
//  SECTION 1 — NEW CLIENT FILES EXIST
// ============================================================
function checkClientFiles() {
  head('1. CLIENT FILES');

  const files = [
    ['public/js/net.js',            'Resilient fetch (timeout + retry)'],
    ['public/js/network-status.js', 'Offline banner + slow loader'],
    ['public/js/upload.js',         'Upload warnings'],
    ['public/sw.js',                'Service worker (asset cache)'],
    ['public/js/csrf-inject.js',    'CSRF token injection']
  ];

  for (const [rel, label] of files) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) {
      const bytes = fs.statSync(full).size;
      console.log(ok(`${label} — ${rel} (${bytes} bytes)`));
      record('pass');
    } else {
      console.log(fail(`${label} MISSING — ${rel}`));
      record('fail');
    }
  }
}

// ============================================================
//  SECTION 2 — SERVER.JS WIRING
// ============================================================
function checkServerJs() {
  head('2. SERVER.JS CONFIG');

  const full = path.join(ROOT, 'server.js');
  if (!fs.existsSync(full)) {
    console.log(fail('server.js not found'));
    record('fail');
    return;
  }
  const c = fs.readFileSync(full, 'utf8');

  const checks = [
    ['compression module required',         /require\(['"]compression['"]\)/],
    ['compression middleware used',         /app\.use\(compression\(/],
    ['request timeout middleware',          /Request timeout:/i],
    ['trust proxy enabled',                 /app\.set\(['"]trust proxy['"],\s*1\)/],
    ['static files with maxAge',            /express\.static\([\s\S]{0,200}maxAge/],
    ['tile cache-control set',              /Cache-Control['"],\s*['"]public,\s*max-age/],
    ['session rolling: true',               /rolling\s*:\s*true/],
    ['session touchAfter set',              /touchAfter\s*:\s*\d+/],
    ['session proxy: true',                 /proxy\s*:\s*true/],
    ['session name: connect.sid',           /name\s*:\s*['"]connect\.sid['"]/],
    ['socket pingTimeout 120000',           /pingTimeout\s*:\s*120000/],
    ['socket pingInterval 30000',           /pingInterval\s*:\s*30000/],
    ['socket perMessageDeflate false',      /perMessageDeflate\s*:\s*false/],
    ['injects net.js',                      /\/js\/net\.js/],
    ['injects network-status.js',           /\/js\/network-status\.js/],
    ['injects upload.js',                   /\/js\/upload\.js/],
    ['injects csrf-inject.js',              /\/js\/csrf-inject\.js/],
    ['GPS emit rounded to 5 decimals',      /Math\.round\(latitude\s*\*\s*100000\)/],
    ['GPS emit rounded longitude',          /Math\.round\(longitude\s*\*\s*100000\)/]
  ];

  for (const [label, regex] of checks) {
    if (regex.test(c)) {
      console.log(ok(`  ${label}`));
      record('pass');
    } else {
      console.log(fail(`  ${label}`));
      record('fail');
    }
  }
}

// ============================================================
//  SECTION 3 — CLIENT SCRIPT CONTENTS
// ============================================================
function checkClientContents() {
  head('3. CLIENT SCRIPT CONTENTS');

  // ---- net.js ----
  const netPath = path.join(ROOT, 'public/js/net.js');
  if (fs.existsSync(netPath)) {
    const c = fs.readFileSync(netPath, 'utf8');
    const checks = [
      ['net.js: AbortController used',      /AbortController/],
      ['net.js: has timeout (20000 or 15s)', /20000|DEFAULT_TIMEOUT\s*=\s*\d+/],
      ['net.js: retries GET only',          /method\s*===\s*['"]GET['"]/],
      ['net.js: exponential backoff',       /RETRY_DELAYS/],
      ['net.js: patches window.fetch',      /window\.fetch\s*=/]
    ];
    for (const [label, regex] of checks) {
      if (regex.test(c)) { console.log(ok(`  ${label}`)); record('pass'); }
      else { console.log(fail(`  ${label}`)); record('fail'); }
    }
  }

  // ---- network-status.js ----
  const nsPath = path.join(ROOT, 'public/js/network-status.js');
  if (fs.existsSync(nsPath)) {
    const c = fs.readFileSync(nsPath, 'utf8');
    const checks = [
      ['network-status.js: online/offline listeners', /addEventListener\(['"]offline['"]/],
      ['network-status.js: banner created',           /net-status-banner|offline-banner/i],
      ['network-status.js: spinner after delay',      /setTimeout\([^,]+,\s*3000\)/],
      ['network-status.js: service worker register',  /serviceWorker\.register/]
    ];
    for (const [label, regex] of checks) {
      if (regex.test(c)) { console.log(ok(`  ${label}`)); record('pass'); }
      else { console.log(fail(`  ${label}`)); record('fail'); }
    }
  }

  // ---- sw.js ----
  const swPath = path.join(ROOT, 'public/sw.js');
  if (fs.existsSync(swPath)) {
    const c = fs.readFileSync(swPath, 'utf8');
    const checks = [
      ['sw.js: install event',           /addEventListener\(['"]install['"]/],
      ['sw.js: activate event',          /addEventListener\(['"]activate['"]/],
      ['sw.js: fetch handler',           /addEventListener\(['"]fetch['"]/],
      ['sw.js: caches tiles',            /\/tiles\//],
      ['sw.js: skips auth routes',       /\/auth\//],
      ['sw.js: skips API routes',        /\/api\//]
    ];
    for (const [label, regex] of checks) {
      if (regex.test(c)) { console.log(ok(`  ${label}`)); record('pass'); }
      else { console.log(fail(`  ${label}`)); record('fail'); }
    }
  }

  // ---- upload.js ----
  const upPath = path.join(ROOT, 'public/js/upload.js');
  if (fs.existsSync(upPath)) {
    const c = fs.readFileSync(upPath, 'utf8');
    const checks = [
      ['upload.js: warns on large files', /MAX_WARN|size\s*>/],
      ['upload.js: multipart forms',      /multipart\/form-data/]
    ];
    for (const [label, regex] of checks) {
      if (regex.test(c)) { console.log(ok(`  ${label}`)); record('pass'); }
      else { console.log(fail(`  ${label}`)); record('fail'); }
    }
  }
}

// ============================================================
//  SECTION 4 — LIVE HTTP CHECKS
// ============================================================
async function checkLiveServer() {
  head('4. LIVE SERVER BEHAVIOR');

  let res;
  try {
    res = await request('GET', LOCAL + '/auth/login');
  } catch (err) {
    console.log(fail(`Server unreachable at ${LOCAL}: ${err.message}`));
    console.log(info('Start with: npm start'));
    record('fail');
    return;
  }

  console.log(ok(`GET /auth/login → ${res.status}`));
  record('pass');

  // -- Compression --
  const enc = res.headers['content-encoding'];
  if (enc === 'gzip' || enc === 'deflate' || enc === 'br') {
    console.log(ok(`  Compression: ${enc} (raw: ${res.rawLength} bytes, decoded: ${res.body.length})`));
    record('pass');
  } else {
    console.log(warn('  No compression header on /auth/login (response may be < 1 KB threshold)'));
    record('warn');
  }

  // -- Global scripts injected --
  for (const src of ['/js/net.js', '/js/network-status.js', '/js/upload.js', '/js/csrf-inject.js']) {
    if (res.body.indexOf(src) !== -1) {
      console.log(ok(`  Script injected: ${src}`));
      record('pass');
    } else {
      console.log(fail(`  Script NOT injected: ${src}`));
      record('fail');
    }
  }

  // -- CSRF meta tag --
  if (/<meta\s+name=["']csrf-token["']/.test(res.body)) {
    console.log(ok('  CSRF meta tag present'));
    record('pass');
  } else {
    console.log(fail('  CSRF meta tag MISSING'));
    record('fail');
  }

  // -- Static asset caching (fetch a CSS file) --
  try {
    const cssRes = await request('GET', LOCAL + '/css/leaflet.css');
    if (cssRes.status === 200) {
      const cc = cssRes.headers['cache-control'] || '';
      if (/max-age=\d{4,}/.test(cc)) {
        console.log(ok(`  Static cache-control: ${cc}`));
        record('pass');
      } else {
        console.log(warn(`  Static cache-control weak: "${cc}"`));
        record('warn');
      }
    } else {
      console.log(info(`  /css/leaflet.css → ${cssRes.status} (may not exist)`));
      record('info');
    }
  } catch (e) {
    console.log(warn(`  Could not test CSS caching: ${e.message}`));
    record('warn');
  }

  // -- Tile cache-control (may be blank PNG, but headers should still be present) --
  try {
    const tileRes = await request('GET', LOCAL + '/tiles/10/512/512.png');
    if (tileRes.status === 200) {
      const cc = tileRes.headers['cache-control'] || '';
      if (/max-age/.test(cc)) {
        console.log(ok(`  Tile cache-control: ${cc}`));
        record('pass');
      } else {
        console.log(warn(`  Tile cache-control missing: "${cc}"`));
        record('warn');
      }
    }
  } catch (e) {
    console.log(warn(`  Tile test skipped: ${e.message}`));
    record('warn');
  }

  // -- Session cookie name --
  const setCookies = res.headers['set-cookie'] || [];
  const hasSessionCookie = setCookies.some(c => c.startsWith('connect.sid='));
  if (hasSessionCookie) {
    console.log(ok('  Session cookie named "connect.sid"'));
    record('pass');
  } else {
    console.log(warn('  No "connect.sid" cookie set on first visit'));
    record('warn');
  }

  // -- Slow endpoint timing (should respond within timeout) --
  const t0 = Date.now();
  try {
    await request('GET', LOCAL + '/auth/login');
    const elapsed = Date.now() - t0;
    if (elapsed < 5000) {
      console.log(ok(`  Response time: ${elapsed} ms (under threshold)`));
      record('pass');
    } else {
      console.log(warn(`  Response time: ${elapsed} ms (slow)`));
      record('warn');
    }
  } catch (e) {
    console.log(warn(`  Timing check failed: ${e.message}`));
    record('warn');
  }
}

// ============================================================
//  SECTION 5 — PACKAGE.JSON
// ============================================================
function checkPackageJson() {
  head('5. PACKAGE.JSON');

  const full = path.join(ROOT, 'package.json');
  if (!fs.existsSync(full)) {
    console.log(fail('package.json not found'));
    record('fail');
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(full, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const required = ['compression', 'connect-mongo', 'csrf-csrf', 'express-rate-limit'];
  for (const dep of required) {
    if (deps[dep]) {
      console.log(ok(`  ${dep}@${deps[dep]}`));
      record('pass');
    } else {
      console.log(fail(`  ${dep} NOT installed`));
      record('fail');
    }
  }
}

// ============================================================
//  MAIN
// ============================================================
(async () => {
  console.log(`\n${B}🔍 POOR-CONNECTION RESILIENCE VERIFICATION${X}`);
  console.log(`${B}═══════════════════════════════════════════${X}`);

  checkClientFiles();
  checkServerJs();
  checkClientContents();
  checkPackageJson();
  await checkLiveServer();

  console.log(head('SUMMARY'));
  console.log(`  ${G}Passed${X}:   ${pass}`);
  console.log(`  ${R}Failed${X}:   ${failCount}`);
  console.log(`  ${Y}Warnings${X}: ${warnCount}`);
  console.log(`  ${C}Info${X}:     ${infoCount}`);

  if (failCount === 0) {
    console.log(`\n${G}${B}🎉 All resilience features implemented${X}`);
    console.log(`   App is ready for poor-network conditions\n`);
    process.exit(0);
  } else {
    console.log(`\n${R}${B}❌ ${failCount} check(s) failed — see above${X}\n`);
    process.exit(1);
  }
})();
