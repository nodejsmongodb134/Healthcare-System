// scripts/patch-double-slash.js
const fs = require('fs');
const path = require('path');

const AUTH = path.resolve(__dirname, '..', 'routes', 'auth.js');
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

// Backup
fs.copyFileSync(AUTH, `${AUTH}.bak-${ts}`);
console.log(`Backed up: routes/auth.js.bak-${ts}`);

let src = fs.readFileSync(AUTH, 'utf8');
let patches = 0;

// --- Patch 1: add buildUrl helper after the crypto require ---
if (!src.includes('function buildUrl')) {
  const anchor = "const crypto = require('crypto');";
  const helper = anchor + `

// Build a URL from the configured base, safely stripping any trailing slash
function buildUrl(p) {
  const base = (process.env.BASE_URL || 'https://palmvalleymedicalcenter.africa.com').replace(/\\/+$/, '');
  const cleanPath = p.startsWith('/') ? p : '/' + p;
  return base + cleanPath;
}`;

  if (src.includes(anchor)) {
    src = src.replace(anchor, helper);
    patches++;
    console.log('  + Added buildUrl() helper');
  } else {
    console.log('  ! Could not find crypto require anchor');
  }
}

// --- Patch 2 & 3: verification URLs (2 occurrences) ---
const verifyOld = /`\$\{process\.env\.BASE_URL \|\| 'https:\/\/palmvalleymedicalcenter\.africa\.com\/'\}\/auth\/verify\/\$\{verificationToken\}`/g;
const verifyNew = "buildUrl(`/auth/verify/${verificationToken}`)";
const verifyCount = (src.match(verifyOld) || []).length;
if (verifyCount > 0) {
  src = src.replace(verifyOld, verifyNew);
  patches += verifyCount;
  console.log(`  + Replaced ${verifyCount} verification URL(s)`);
}

// --- Patch 4: reset URL (1 occurrence) ---
const resetOld = /`\$\{process\.env\.BASE_URL \|\| 'https:\/\/palmvalleymedicalcenter\.africa\.com\/'\}\/auth\/reset\/\$\{token\}`/g;
const resetNew = "buildUrl(`/auth/reset/${token}`)";
const resetCount = (src.match(resetOld) || []).length;
if (resetCount > 0) {
  src = src.replace(resetOld, resetNew);
  patches += resetCount;
  console.log(`  + Replaced ${resetCount} reset URL(s)`);
}

if (patches === 0) {
  console.log('  ! Nothing patched - file may already be fixed');
  process.exit(0);
}

fs.writeFileSync(AUTH, src, 'utf8');
console.log('');
console.log(`OK - ${patches} change(s) applied to routes/auth.js`);
