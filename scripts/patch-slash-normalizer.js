// scripts/patch-slash-normalizer.js
const fs = require('fs');
const path = require('path');

const SERVER = path.resolve(__dirname, '..', 'server.js');
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

fs.copyFileSync(SERVER, `${SERVER}.bak-${ts}`);
console.log(`Backed up: server.js.bak-${ts}`);

let src = fs.readFileSync(SERVER, 'utf8');

if (src.includes('COLLAPSE DOUBLE SLASHES')) {
  console.log('Already patched - skipping');
  process.exit(0);
}

const anchor = "app.set('trust proxy', 1);";
const addition = anchor + `

// ============ COLLAPSE DOUBLE SLASHES IN URLS ============
// Prevents "Cannot GET //auth/reset/..." from malformed links (old emails)
app.use((req, res, next) => {
  if (req.url.includes('//')) {
    const cleaned = req.url.replace(/\\/{2,}/g, '/');
    console.log('Collapsing double slash: ' + req.url + ' -> ' + cleaned);
    return res.redirect(301, cleaned);
  }
  next();
});`;

if (!src.includes(anchor)) {
  console.log('! Could not find trust proxy anchor');
  process.exit(1);
}

src = src.replace(anchor, addition);
fs.writeFileSync(SERVER, src, 'utf8');
console.log('OK - added double-slash normalizer to server.js');
