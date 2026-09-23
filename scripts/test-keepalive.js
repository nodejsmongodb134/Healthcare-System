// scripts/test-keepalive.js
require('dotenv').config();
const https = require('https');
const http  = require('http');
const { URL } = require('url');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = (s) => `${G}OK ${s}${X}`;
const fail = (s) => `${R}FAIL ${s}${X}`;
const warn = (s) => `${Y}WARN ${s}${X}`;
const info = (s) => `${C}INFO ${s}${X}`;
const head = (s) => `\n${B}=== ${s} ===${X}`;

function resolveTarget() {
  const args = process.argv.slice(2);
  const urlFlagIdx = args.indexOf('--url');
  if (urlFlagIdx !== -1 && args[urlFlagIdx + 1]) {
    return args[urlFlagIdx + 1];
  }
  if (args.includes('--remote')) {
    const remote = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL;
    if (!remote) {
      console.log(fail('Neither RENDER_EXTERNAL_URL nor BASE_URL is set in .env'));
      process.exit(1);
    }
    return remote;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

function ping(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          body,
          elapsed: Date.now() - started
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      resolve({
        ok: false,
        error: err.message,
        elapsed: Date.now() - started
      });
    });
  });
}

(async () => {
  console.log(`\n${B}KEEP-ALIVE PING TESTER${X}`);
  console.log('='.repeat(60));

  const target = resolveTarget();
  const healthUrl = `${target.replace(/\/$/, '')}/health`;

  console.log(head('TARGET'));
  console.log(`  Base URL   : ${target}`);
  console.log(`  Health URL : ${healthUrl}`);

  console.log(head('PING 1 - Basic reachability'));
  const r1 = await ping(healthUrl);
  if (r1.ok) {
    console.log(ok(`HTTP ${r1.status} in ${r1.elapsed} ms`));
    try {
      const json = JSON.parse(r1.body);
      console.log(`  status   : ${json.status}`);
      console.log(`  uptime   : ${json.uptime}s`);
      console.log(`  timestamp: ${json.timestamp}`);
      if (json.status !== 'ok') {
        console.log(warn('Response status is not "ok" - check server.js /health handler'));
      }
    } catch (e) {
      console.log(warn(`Response is not valid JSON: ${r1.body.substring(0, 120)}`));
    }
  } else {
    console.log(fail(`Failed: ${r1.error || `HTTP ${r1.status}`}`));
    console.log(info('If testing locally, is the server running? Try: npm start'));
    console.log(info('If testing remote, check the URL and that the app is deployed.'));
    process.exit(1);
  }

  console.log(head('PING 2 - Consistency check (3 pings, 2s apart)'));
  let allOk = true;
  const timings = [];

  for (let i = 1; i <= 3; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await ping(healthUrl, 10000);
    timings.push(r.elapsed);
    if (r.ok) {
      console.log(ok(`  Ping ${i}/3 - HTTP ${r.status} in ${r.elapsed} ms`));
    } else {
      console.log(fail(`  Ping ${i}/3 - ${r.error || `HTTP ${r.status}`}`));
      allOk = false;
    }
  }

  console.log(head('SUMMARY'));
  const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
  const min = Math.min(...timings);
  const max = Math.max(...timings);

  console.log(`  Pings succeeded : ${allOk ? '3/3' : '< 3/3'}`);
  console.log(`  Latency avg     : ${avg} ms`);
  console.log(`  Latency min/max : ${min} ms / ${max} ms`);

  if (allOk) {
    console.log('');
    console.log(ok('Health endpoint is stable - keep-alive will work'));
    if (avg > 5000) {
      console.log(warn('High latency - Render may have been cold-starting'));
      console.log(info('Run the script again to see warm latency'));
    }
  } else {
    console.log('');
    console.log(fail('Health endpoint is NOT stable - keep-alive may fail'));
  }

  console.log('');
  process.exit(allOk ? 0 : 1);
})();
