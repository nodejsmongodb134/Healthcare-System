// scripts/patch-nurse-navbars.js
// Replaces the navbar in every views/nurse/*.ejs with the mobile-friendly
// nurse navbar (stacked menu on mobile, compact horizontal on desktop).
//
// Usage:
//   node scripts/patch-nurse-navbars.js            -> dry run (no changes)
//   node scripts/patch-nurse-navbars.js --apply    -> apply changes

const fs = require('fs');
const path = require('path');

const NURSE_DIR = path.join(__dirname, '..', 'views', 'nurse');
const DRY_RUN = !process.argv.includes('--apply');

const NEW_NAV = [
'<nav class="navbar navbar-expand-lg navbar-dark">',
'        <div class="container">',
'            <a class="navbar-brand" href="/auth/nurse-dashboard">',
'                <i class="bi bi-heart-pulse"></i> Nurse Portal',
'            </a>',
'',
'            <button class="navbar-toggler" type="button"',
'                    data-bs-toggle="collapse"',
'                    data-bs-target="#navbarNav"',
'                    aria-controls="navbarNav"',
'                    aria-expanded="false"',
'                    aria-label="Toggle navigation">',
'                <span class="navbar-toggler-icon"></span>',
'            </button>',
'',
'            <div class="collapse navbar-collapse" id="navbarNav">',
'                <div class="nurse-welcome">',
'                    <i class="bi bi-person-circle"></i>',
'                    Welcome, <strong><%= user.name %></strong>',
'                    <span class="badge bg-light text-dark ms-1"><%= user.role %></span>',
'                </div>',
'',
'                <ul class="navbar-nav ms-auto align-items-lg-center nurse-nav">',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/nurse-appointments">',
'                            <i class="bi bi-calendar-check"></i> Appointments',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/nurse-messages">',
'                            <i class="bi bi-envelope"></i> Messages',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/nurse-patients">',
'                            <i class="bi bi-people"></i> Patients',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/drivers">',
'                            <i class="bi bi-truck"></i> Drivers',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/nurse-orders">',
'                            <i class="bi bi-prescription"></i> Orders',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/auth/nurse-dashboard#sms-campaigns">',
'                            <i class="bi bi-megaphone"></i> SMS Campaigns',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/nurse/profile">',
'                            <i class="bi bi-person-badge"></i> Profile',
'                        </a>',
'                    </li>',
'                    <li class="nav-item nurse-logout">',
'                        <a class="nav-link" href="/auth/logout">',
'                            <i class="bi bi-box-arrow-right"></i> Logout',
'                        </a>',
'                    </li>',
'                </ul>',
'            </div>',
'        </div>',
'    </nav>'
].join('\n');

const NEW_CSS = [
'',
'        /* ========== MOBILE-FRIENDLY NURSE NAVBAR (matches patient.ejs) ========== */',
'        .nurse-welcome {',
'            color: rgba(255,255,255,0.92);',
'            font-size: 0.85rem;',
'            padding: 10px 12px;',
'            border-bottom: 1px solid rgba(255,255,255,0.15);',
'            margin-bottom: 8px;',
'        }',
'        .nurse-welcome i { margin-right: 4px; }',
'        .nurse-nav .nav-link {',
'            color: rgba(255,255,255,0.9);',
'            padding: 10px 14px;',
'            border-radius: 8px;',
'            font-size: 0.9rem;',
'            font-weight: 500;',
'            display: flex;',
'            align-items: center;',
'            gap: 10px;',
'            transition: all 0.15s;',
'            margin: 2px 0;',
'        }',
'        .nurse-nav .nav-link i { font-size: 1.05rem; width: 20px; text-align: center; }',
'        .nurse-nav .nav-link:hover,',
'        .nurse-nav .nav-link.active { background: rgba(255,255,255,0.15); color: white; }',
'        .nurse-logout .nav-link { color: #ffb3b3; }',
'        .nurse-logout .nav-link:hover { background: rgba(220,53,69,0.25); color: white; }',
'        @media (min-width: 992px) {',
'            .nurse-welcome {',
'                border-bottom: none;',
'                border-right: 1px solid rgba(255,255,255,0.2);',
'                margin-bottom: 0;',
'                margin-right: 8px;',
'                padding: 6px 14px 6px 0;',
'                display: flex;',
'                align-items: center;',
'                gap: 4px;',
'            }',
'            .nurse-nav .nav-link { padding: 6px 8px; font-size: 0.78rem; }',
'            .nurse-nav .nav-link i { font-size: 0.9rem; width: 16px; }',
'            .nurse-logout {',
'                margin-left: 4px;',
'                padding-left: 4px;',
'                border-left: 1px solid rgba(255,255,255,0.2);',
'            }',
'        }',
'        @media (max-width: 991.98px) {',
'            .navbar-collapse {',
'                background: rgba(255,255,255,0.08);',
'                border-radius: 12px;',
'                padding: 10px;',
'                margin-top: 10px;',
'            }',
'            .nurse-welcome { color: white; }',
'            .nurse-nav .nav-link { padding: 12px 14px; font-size: 0.95rem; min-height: 44px; }',
'            .nurse-nav .nav-link i { font-size: 1.15rem; }',
'        }',
''
].join('\n');

// ─────────────────────────────────────────────────────────────
if (!fs.existsSync(NURSE_DIR)) {
  console.error('Nurse views directory not found:', NURSE_DIR);
  process.exit(1);
}

const files = fs.readdirSync(NURSE_DIR).filter(function (f) { return f.endsWith('.ejs'); });

console.log('');
console.log(DRY_RUN ? 'DRY RUN — nothing will be changed' : 'APPLYING CHANGES');
console.log('='.repeat(60));
console.log('');

let patched = 0;
let skipped = 0;

for (const file of files) {
  const full = path.join(NURSE_DIR, file);
  let src = fs.readFileSync(full, 'utf8');
  let changed = false;

  // 1. Replace the first <nav ...>...</nav> block
  const navRegex = /<nav[\s\S]*?<\/nav>/;
  if (navRegex.test(src)) {
    if (src.indexOf('nurse-nav') !== -1) {
      console.log('  [SKIP] ' + file + ' — already patched');
      skipped++;
      continue;
    }
    src = src.replace(navRegex, NEW_NAV);
    changed = true;
  } else {
    console.log('  [SKIP] ' + file + ' — no navbar found');
    skipped++;
    continue;
  }

  // 2. Inject CSS before </style> (only if not already present)
  if (changed && src.indexOf('</style>') !== -1 && src.indexOf('.nurse-welcome') === -1) {
    src = src.replace('</style>', NEW_CSS + '\n    </style>');
  }

  if (changed) {
    if (!DRY_RUN) {
      fs.writeFileSync(full, src, 'utf8');
    }
    console.log('  [' + (DRY_RUN ? 'DRY ' : 'PATCH') + '] ' + file);
    patched++;
  }
}

console.log('');
console.log('='.repeat(60));
console.log('  Files found   : ' + files.length);
console.log('  Patched       : ' + patched);
console.log('  Skipped       : ' + skipped);
console.log('');

if (DRY_RUN) {
  console.log('This was a DRY RUN. Nothing was modified.');
  console.log('To apply the changes, run:');
  console.log('  node scripts\\patch-nurse-navbars.js --apply');
} else {
  console.log('All nurse views updated.');
  console.log('Restart the server and check each page on mobile.');
}
console.log('');
