// scripts/fix-patient-navbar.js
// Rewrites navbar in all patient views + ensures CSS + Bootstrap JS.

const fs = require('fs');
const path = require('path');

const PATIENT_DIR = path.join(__dirname, '..', 'views', 'patient');
const DRY_RUN = !process.argv.includes('--apply');

const NEW_NAV = `    <!-- ========== NAVBAR (mobile-friendly) ========== -->
    <nav class="navbar navbar-expand-lg navbar-dark">
        <div class="container">
            <a class="navbar-brand" href="/auth/patient-dashboard">
                <i class="bi bi-heart-pulse"></i> Patient Portal
            </a>

            <button class="navbar-toggler" type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarNav"
                    aria-controls="navbarNav"
                    aria-expanded="false"
                    aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarNav">
                <div class="patient-welcome">
                    <i class="bi bi-person-circle"></i>
                    Welcome, <strong><%= user.name %></strong>
                    <span class="badge bg-light text-dark ms-1"><%= user.role %></span>
                </div>

                <ul class="navbar-nav ms-auto align-items-lg-center patient-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="/auth/patient-dashboard">
                            <i class="bi bi-house-door"></i> Dashboard
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/patient/appointment">
                            <i class="bi bi-calendar-plus"></i> Book Appointment
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/patient/view-appointments">
                            <i class="bi bi-calendar-check"></i> My Appointments
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/patient/message">
                            <i class="bi bi-envelope"></i> Messages
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/patient/order">
                            <i class="bi bi-prescription"></i> Order
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/patient/profile">
                            <i class="bi bi-person-badge"></i> Profile
                        </a>
                    </li>
                    <li class="nav-item patient-logout">
                        <a class="nav-link" href="/auth/logout">
                            <i class="bi bi-box-arrow-right"></i> Logout
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>`;

const NEW_CSS = `        /* ========== MOBILE-FRIENDLY PATIENT NAVBAR ========== */
        .patient-welcome {
            color: rgba(255,255,255,0.92);
            font-size: 0.85rem;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255,255,255,0.15);
            margin-bottom: 8px;
        }
        .patient-welcome i { margin-right: 4px; }
        .patient-nav .nav-link {
            color: rgba(255,255,255,0.9);
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.15s;
            margin: 2px 0;
        }
        .patient-nav .nav-link i { font-size: 1.05rem; width: 20px; text-align: center; }
        .patient-nav .nav-link:hover,
        .patient-nav .nav-link.active { background: rgba(255,255,255,0.15); color: white; }
        .patient-logout .nav-link { color: #ffb3b3; }
        .patient-logout .nav-link:hover { background: rgba(220,53,69,0.25); color: white; }
        @media (min-width: 992px) {
            .patient-welcome {
                border-bottom: none;
                border-right: 1px solid rgba(255,255,255,0.2);
                margin-bottom: 0;
                margin-right: 8px;
                padding: 6px 14px 6px 0;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .patient-nav .nav-link { padding: 8px 12px; font-size: 0.85rem; }
            .patient-logout {
                margin-left: 8px;
                padding-left: 8px;
                border-left: 1px solid rgba(255,255,255,0.2);
            }
        }
        @media (max-width: 991.98px) {
            .navbar-collapse {
                background: rgba(255,255,255,0.08);
                border-radius: 12px;
                padding: 10px;
                margin-top: 10px;
            }
            .patient-welcome { color: white; }
            .patient-nav .nav-link { padding: 12px 14px; font-size: 0.95rem; min-height: 44px; }
            .patient-nav .nav-link i { font-size: 1.15rem; }
        }
`;

// ---------- Helpers ----------
function hasMobileCss(c) {
  return c.includes('MOBILE-FRIENDLY PATIENT NAVBAR');
}
function hasNewNav(c) {
  return c.includes('patient-nav') && c.includes('patient-welcome');
}
function hasBootstrapJs(c) {
  return /bootstrap\.bundle(\.min)?\.js/.test(c);
}
function hasNavBlock(c) {
  return /<nav[\s\S]*?<\/nav>/i.test(c);
}

// ---------- Fix one file ----------
function fixFile(filePath) {
  const rel = path.relative(path.join(__dirname, '..'), filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const changes = [];

  // 1. Replace <nav> block
  const navRegex = /<nav[\s\S]*?<\/nav>/i;
  if (navRegex.test(content)) {
    // Only replace if it's not already the new one
    const existingNav = content.match(navRegex)[0];
    if (!existingNav.includes('patient-nav')) {
      content = content.replace(navRegex, NEW_NAV);
      changes.push('replaced <nav>');
    } else if (!existingNav.includes('Book Appointment')) {
      // Partial match — force replace
      content = content.replace(navRegex, NEW_NAV);
      changes.push('replaced partial <nav>');
    } else {
      changes.push('nav already correct');
    }
  } else {
    changes.push('NO <nav> FOUND');
  }

  // 2. Inject CSS before </style> (only if missing)
  if (!hasMobileCss(content)) {
    if (/<\/style>/.test(content)) {
      content = content.replace(/<\/style>/, NEW_CSS + '\n    </style>');
      changes.push('injected CSS');
    } else {
      changes.push('NO <\/style> FOUND');
    }
  } else {
    changes.push('CSS already present');
  }

  // 3. Ensure Bootstrap JS is loaded before </body>
  if (!hasBootstrapJs(content)) {
    if (/<\/body>/.test(content)) {
      content = content.replace(
        '</body>',
        '    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>\n</body>'
      );
      changes.push('added Bootstrap JS');
    } else {
      changes.push('NO </body> FOUND');
    }
  } else {
    changes.push('Bootstrap JS already present');
  }

  if (content !== original && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return {
    file: rel,
    changed: content !== original,
    changes
  };
}

// ---------- Main ----------
(async () => {
  console.log('');
  console.log(DRY_RUN ? '🔎 DRY RUN — no files will be written' : '🔧 APPLYING FIXES');
  console.log('='.repeat(70));

  if (!fs.existsSync(PATIENT_DIR)) {
    console.log('❌ views/patient folder not found');
    process.exit(1);
  }

  const files = fs.readdirSync(PATIENT_DIR).filter(f => f.endsWith('.ejs'));
  console.log(`Found ${files.length} patient views\n`);

  let fixedCount = 0;

  for (const file of files) {
    const result = fixFile(path.join(PATIENT_DIR, file));

    const icon = result.changed ? (DRY_RUN ? '🔍' : '✏️ ') : '✅';
    console.log(`${icon} ${result.file}`);

    result.changes.forEach(c => {
      const bullet = c.startsWith('NO ') ? '  ❌' : '  •';
      console.log(`${bullet} ${c}`);
    });
    console.log('');

    if (result.changed) fixedCount++;
  }

  console.log('='.repeat(70));
  console.log(`Files touched: ${fixedCount} / ${files.length}`);

  if (DRY_RUN) {
    console.log('');
    console.log('ℹ️  This was a DRY RUN. To apply changes:');
    console.log('    node scripts\\fix-patient-navbar.js --apply');
  } else {
    console.log('');
    console.log('✅ All fixes applied. Restart server:');
    console.log('    Ctrl+C (in server terminal)');
    console.log('    npm start');
  }

  console.log('='.repeat(70));
  console.log('');
  process.exit(0);
})();
