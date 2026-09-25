// scripts/patch-patient-dashboard.js
// Replaces the navbar + injects CSS in views/dashboard/patient-dashboard.ejs
// so it matches the mobile-friendly patient navbar used in views/patient/*.ejs.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'views', 'dashboard', 'patient-dashboard.ejs');

if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

let src = fs.readFileSync(FILE, 'utf8');

if (src.indexOf('patient-nav') !== -1) {
  console.log('Already patched — nothing to do');
  process.exit(0);
}

// ---- 1. Replace the <nav> block ----
const NEW_NAV = [
'<nav class="navbar navbar-expand-lg navbar-dark">',
'        <div class="container">',
'            <a class="navbar-brand" href="/auth/patient-dashboard">',
'                <i class="bi bi-heart-pulse"></i> Patient Portal',
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
'                <div class="patient-welcome">',
'                    <i class="bi bi-person-circle"></i>',
'                    Welcome, <strong><%= user.name %></strong>',
'                    <span class="badge bg-light text-dark ms-1"><%= user.role %></span>',
'                </div>',
'',
'                <ul class="navbar-nav ms-auto align-items-lg-center patient-nav">',
'                    <li class="nav-item">',
'                        <a class="nav-link active" href="/auth/patient-dashboard">',
'                            <i class="bi bi-house-door"></i> Dashboard',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/patient/appointment">',
'                            <i class="bi bi-calendar-plus"></i> Book Appointment',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/patient/view-appointments">',
'                            <i class="bi bi-calendar-check"></i> My Appointments',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/patient/message">',
'                            <i class="bi bi-envelope"></i> Messages',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/patient/order">',
'                            <i class="bi bi-prescription"></i> Order',
'                        </a>',
'                    </li>',
'                    <li class="nav-item">',
'                        <a class="nav-link" href="/patient/profile">',
'                            <i class="bi bi-person-badge"></i> Profile',
'                        </a>',
'                    </li>',
'                    <li class="nav-item patient-logout">',
'                        <a class="nav-link" href="/auth/logout">',
'                            <i class="bi bi-box-arrow-right"></i> Logout',
'                        </a>',
'                    </li>',
'                </ul>',
'            </div>',
'        </div>',
'    </nav>'
].join('\n');

const navRegex = /<nav[\s\S]*?<\/nav>/;
if (!navRegex.test(src)) {
  console.error('No <nav> block found');
  process.exit(1);
}
src = src.replace(navRegex, NEW_NAV);

// ---- 2. Inject CSS before </style> ----
const NEW_CSS = [
'',
'        /* ========== MOBILE-FRIENDLY PATIENT NAVBAR ========== */',
'        .patient-welcome {',
'            color: rgba(255,255,255,0.92);',
'            font-size: 0.85rem;',
'            padding: 10px 12px;',
'            border-bottom: 1px solid rgba(255,255,255,0.15);',
'            margin-bottom: 8px;',
'        }',
'        .patient-welcome i { margin-right: 4px; }',
'        .patient-nav .nav-link {',
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
'        .patient-nav .nav-link i { font-size: 1.05rem; width: 20px; text-align: center; }',
'        .patient-nav .nav-link:hover,',
'        .patient-nav .nav-link.active { background: rgba(255,255,255,0.15); color: white; }',
'        .patient-logout .nav-link { color: #ffb3b3; }',
'        .patient-logout .nav-link:hover { background: rgba(220,53,69,0.25); color: white; }',
'',
'        @media (min-width: 992px) {',
'            .patient-welcome {',
'                border-bottom: none;',
'                border-right: 1px solid rgba(255,255,255,0.2);',
'                margin-bottom: 0;',
'                margin-right: 8px;',
'                padding: 6px 14px 6px 0;',
'                display: flex;',
'                align-items: center;',
'                gap: 4px;',
'            }',
'            .patient-nav .nav-link { padding: 8px 12px; font-size: 0.85rem; }',
'            .patient-logout {',
'                margin-left: 8px;',
'                padding-left: 8px;',
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
'            .patient-welcome { color: white; }',
'            .patient-nav .nav-link { padding: 12px 14px; font-size: 0.95rem; min-height: 44px; }',
'            .patient-nav .nav-link i { font-size: 1.15rem; }',
'        }',
''
].join('\n');

if (src.indexOf('.patient-welcome') === -1) {
  src = src.replace('</style>', NEW_CSS + '\n    </style>');
}

fs.writeFileSync(FILE, src, 'utf8');
console.log('Patched views/dashboard/patient-dashboard.ejs');
