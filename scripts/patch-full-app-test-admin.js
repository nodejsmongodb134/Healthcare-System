// scripts/patch-full-app-test-admin.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'full-app-test.js');
let src = fs.readFileSync(FILE, 'utf8');

const OLD = `    if (r.status === 302) pass('admin login -> 302');
    else fail('admin login -> ' + r.status);
    jar = mergeCookies(jar, r.setCookies);`;

const NEW = `    if (r.status === 302 && r.location === '/admin/dashboard') {
      pass('admin login -> 302 (to /admin/dashboard)');
    } else if (r.status === 302) {
      fail('admin login -> 302 but redirected to ' + r.location + ' (login failed)');
      return;
    } else {
      fail('admin login -> ' + r.status + ' (location: ' + (r.location || 'none') + ')');
      return;
    }
    jar = mergeCookies(jar, r.setCookies);`;

if (src.indexOf('admin login -> 302 (to /admin/dashboard)') !== -1) {
  console.log('Already patched — nothing to do');
  process.exit(0);
}

if (src.indexOf(OLD) === -1) {
  console.error('Anchor text not found — did the test file change?');
  process.exit(1);
}

src = src.replace(OLD, NEW);
fs.writeFileSync(FILE, src, 'utf8');
console.log('Patched scripts/full-app-test.js');
console.log('Admin login check now verifies the redirect location.');
