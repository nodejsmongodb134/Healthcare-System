const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const views = [
  'views/patient/view-appointments.ejs',
  'views/patient/dashboard.ejs',
  'views/patient/message-details.ejs',
  'views/patient/message.ejs',
  'views/patient/order-details.ejs',
  'views/patient/order.ejs',
  'views/admin/list.ejs'
];

let totalFixed = 0;

for (const rel of views) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log('SKIP (not found): ' + rel);
    continue;
  }

  let c = fs.readFileSync(file, 'utf8');
  let fixCount = 0;

  // Match: form.action = `/xxx/${id}`; (any backtick or string assignment)
  // Insert _csrf input right after
  const regex = /(form\.action\s*=\s*[`'"][^`'"]+[`'"]\s*;)/g;

  c = c.replace(regex, function (match) {
    // Skip if the following 400 chars already contain _csrf
    const idx = arguments[arguments.length - 2];
    const after = c.substring(idx, idx + 500);
    if (after.indexOf('_csrf') !== -1) return match;

    fixCount++;
    return match + `\n                // Auto-injected CSRF token
                var _csrfMeta = document.querySelector('meta[name="csrf-token"]');
                if (_csrfMeta) {
                    var _csrfInput = document.createElement('input');
                    _csrfInput.type = 'hidden';
                    _csrfInput.name = '_csrf';
                    _csrfInput.value = _csrfMeta.getAttribute('content');
                    form.appendChild(_csrfInput);
                }`;
  });

  if (fixCount > 0) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('FIXED: ' + rel + ' (' + fixCount + ' form(s))');
    totalFixed += fixCount;
  } else {
    console.log('OK: ' + rel + ' (no changes needed)');
  }
}

console.log('\nTotal forms patched: ' + totalFixed);
