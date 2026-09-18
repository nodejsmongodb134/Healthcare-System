const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const views = [
  'views/patient/view-appointments.ejs',
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
  const original = c;

  // Replace meta-tag-based CSRF with direct EJS token
  const metaBlockRegex = /\/\/ Auto-injected CSRF token\s*var _csrfMeta = document\.querySelector\('meta\[name="csrf-token"\]'\);\s*if \(_csrfMeta\) \{\s*var _csrfInput = document\.createElement\('input'\);\s*_csrfInput\.type = 'hidden';\s*_csrfInput\.name = '_csrf';\s*_csrfInput\.value = _csrfMeta\.getAttribute\('content'\);\s*form\.appendChild\(_csrfInput\);\s*\}/g;

  const replacement = `// CSRF token embedded directly from EJS
                var _csrfInput = document.createElement('input');
                _csrfInput.type = 'hidden';
                _csrfInput.name = '_csrf';
                _csrfInput.value = '<%= csrfToken %>';
                form.appendChild(_csrfInput);`;

  const matches = (c.match(metaBlockRegex) || []).length;
  if (matches > 0) {
    c = c.replace(metaBlockRegex, replacement);
    fs.writeFileSync(file, c, 'utf8');
    console.log('FIXED: ' + rel + ' (' + matches + ' block(s))');
    totalFixed += matches;
  } else {
    console.log('OK: ' + rel + ' (no meta-based block found)');
  }
}

console.log('\nTotal blocks fixed: ' + totalFixed);
