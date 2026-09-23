// scripts/patch-redirect-loop.js
// Fixes the stale-session redirect loop in routes/auth.js and server.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTH_FILE   = path.join(ROOT, 'routes', 'auth.js');
const SERVER_FILE = path.join(ROOT, 'server.js');

const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

function backup(file) {
  const bak = `${file}.bak-${ts}`;
  fs.copyFileSync(file, bak);
  console.log(`   📦 Backup: ${path.relative(ROOT, bak)}`);
}

// ---------- FIX 1 — routes/auth.js ----------
function patchAuth() {
  const src = fs.readFileSync(AUTH_FILE, 'utf8');
  const nl  = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const out = [];
  let patches = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const isMatch =
      trimmed === 'if (!user) {' &&
      i + 3 < lines.length &&
      lines[i + 1].trim() === "req.flash('error_msg', 'User not found');" &&
      lines[i + 2].trim() === "return res.redirect('/auth/login');" &&
      lines[i + 3].trim() === '}';

    if (isMatch) {
      const indent = (line.match(/^(\s*)/) || ['', '    '])[1];
      const inner  = indent + '  ';

      out.push(`${indent}if (!user) {`);
      out.push(`${inner}// FIX: destroy stale session instead of redirect loop`);
      out.push(`${inner}console.warn(\`Stale session for user id \${req.session.user.id} - destroying\`);`);
      out.push(`${inner}return req.session.destroy((err) => {`);
      out.push(`${inner}  if (err) console.error('Session destroy error:', err);`);
      out.push(`${inner}  res.clearCookie('connect.sid', { path: '/' });`);
      out.push(`${inner}  return res.redirect('/auth/login');`);
      out.push(`${inner}});`);
      out.push(`${indent}}`);

      i += 3;
      patches++;
      continue;
    }
    out.push(line);
  }

  if (patches === 0) {
    console.log('   ❌ Fix 1: no matching "if (!user) { req.flash(...) }" blocks found');
    return false;
  }

  fs.writeFileSync(AUTH_FILE, out.join(nl), 'utf8');
  console.log(`   ✅ Fix 1: patched ${patches} block(s) in routes/auth.js`);
  return true;
}

// ---------- FIX 3 — server.js homepage ----------
function patchServer() {
  const src = fs.readFileSync(SERVER_FILE, 'utf8');
  const nl  = src.includes('\r\n') ? '\r\n' : '\n';

  // Match the whole homepage handler: app.get('/', (req, res) => { ... });
  // Non-greedy, ends at the first res.render('index', ...) call.
  const pattern = /app\.get\('\/',\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?res\.render\('index',\s*\{\s*title:\s*'Appointment Booking'\s*\}\);\s*\}\);/;

  if (!pattern.test(src)) {
    console.log('   ❌ Fix 3: homepage handler pattern not found in server.js');
    return false;
  }

  const newHandler = [
    "app.get('/', async (req, res) => {",
    "  // Driver session - no DB check (drivers live in their own collection)",
    "  if (req.session.driver) {",
    "    return res.redirect('/driver/dashboard');",
    "  }",
    "",
    "  // User session - verify the user still exists before redirecting",
    "  if (req.session.user) {",
    "    try {",
    "      const User = require('./models/User');",
    "      const user = await User.findById(req.session.user.id);",
    "      if (user && user.isVerified) {",
    "        const dashboard =",
    "          user.role === 'nurse' ? '/auth/nurse-dashboard' :",
    "          user.role === 'admin' ? '/admin/dashboard' :",
    "          '/auth/patient-dashboard';",
    "        return res.redirect(dashboard);",
    "      }",
    "    } catch (err) {",
    "      console.warn('Homepage session verify failed:', err.message);",
    "    }",
    "    // Stale session - destroy it and show the landing page",
    "    console.warn(`Stale session (homepage) for user id ${req.session.user.id} - destroying`);",
    "    return req.session.destroy((err) => {",
    "      if (err) console.error('Session destroy error:', err);",
    "      res.clearCookie('connect.sid', { path: '/' });",
    "      res.render('index', { title: 'Appointment Booking' });",
    "    });",
    "  }",
    "",
    "  res.render('index', { title: 'Appointment Booking' });",
    "});"
  ].join(nl);

  const patched = src.replace(pattern, newHandler);
  fs.writeFileSync(SERVER_FILE, patched, 'utf8');
  console.log('   ✅ Fix 3: patched homepage handler in server.js');
  return true;
}

// ---------- Main ----------
console.log('');
console.log('========================================');
console.log('  Redirect-Loop Patch');
console.log('========================================');
console.log('');

if (!fs.existsSync(AUTH_FILE))   { console.error('Missing: routes/auth.js'); process.exit(1); }
if (!fs.existsSync(SERVER_FILE)) { console.error('Missing: server.js');       process.exit(1); }

console.log('Backing up files:');
backup(AUTH_FILE);
backup(SERVER_FILE);

console.log('');
console.log('Applying patches:');
const ok1 = patchAuth();
const ok3 = patchServer();

console.log('');
console.log('========================================');
if (ok1 && ok3) {
  console.log('  ✅ Both fixes applied');
} else if (ok1 || ok3) {
  console.log('  ⚠️  Partial - see messages above');
} else {
  console.log('  ⚠️  Nothing patched - files may already be fixed');
}
console.log('========================================');
console.log('');
console.log('Verify with:');
console.log('  node -c server.js');
console.log('  node -c routes/auth.js');
console.log('  git diff');
console.log('');
