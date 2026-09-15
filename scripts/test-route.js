@'
// scripts/test-routes.js
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const { app, server } = require('../server');

// ============================================================
//  CONFIGURATION
// ============================================================
const ADMIN_EMAIL    = 'admin@test.com';
const ADMIN_PASSWORD = 'Admin@123';

const NURSE_EMAIL    = 'nodejsmongodb12@gmail.com';
const NURSE_PASSWORD = 'Nurse@123';

const PATIENT_EMAIL    = 'kevinnngondo@gmail.com';
const PATIENT_PASSWORD = 'Patient@123';

const DRIVER_EMAIL    = 'driver@test.com';
const DRIVER_PASSWORD = 'Driver@123';

// ============================================================
//  ROUTE LISTS
// ============================================================
const PUBLIC_ROUTES = [
  { path: '/',                          expect: [200, 302] },
  { path: '/auth/login',                expect: [200] },
  { path: '/auth/register',             expect: [200] },
  { path: '/auth/forgot',               expect: [200] },
  { path: '/auth/resend-verification',  expect: [200] },
  { path: '/driver/login',              expect: [200] },
  { path: '/api/tiles/status',          expect: [200] }
];

const PATIENT_ROUTES = [
  { path: '/auth/patient-dashboard',       expect: [200, 302] },
  { path: '/patient/profile',              expect: [200, 302] },
  { path: '/patient/appointment',          expect: [200, 302] },
  { path: '/patient/view-appointments',    expect: [200, 302] },
  { path: '/patient/message',              expect: [200, 302] },
  { path: '/patient/order',                expect: [200, 302] },
  { path: '/patient/change-password',      expect: [200, 302] }
];

const NURSE_ROUTES = [
  { path: '/auth/nurse-dashboard',       expect: [200, 302] },
  { path: '/nurse/profile',              expect: [200, 302] },
  { path: '/nurse/nurse-appointments',   expect: [200, 302] },
  { path: '/nurse/nurse-messages',       expect: [200, 302] },
  { path: '/nurse/nurse-orders',         expect: [200, 302] },
  { path: '/nurse/nurse-patients',       expect: [200, 302] },
  { path: '/nurse/create-driver',        expect: [200, 302] },
  { path: '/nurse/drivers',              expect: [200, 302] },
  { path: '/nurse/track-drivers',        expect: [200, 302] },
  { path: '/nurse/announcement',         expect: [200, 302] },
  { path: '/nurse/change-password',      expect: [200, 302] }
];

const ADMIN_ROUTES = [
  { path: '/admin/dashboard',            expect: [200, 302] },
  { path: '/admin/appointments',         expect: [200, 302] },
  { path: '/admin/messages',             expect: [200, 302] },
  { path: '/admin/orders',               expect: [200, 302] },
  { path: '/admin/patients',             expect: [200, 302] },
  { path: '/admin/patients/manage',      expect: [200, 302] },
  { path: '/admin/nurses',               expect: [200, 302] },
  { path: '/admin/nurses/manage',        expect: [200, 302] },
  { path: '/admin/nurses/create',        expect: [200, 302] },
  { path: '/admin/drivers',              expect: [200, 302] },
  { path: '/admin/drivers/create',       expect: [200, 302] },
  { path: '/admin/orders/manage',        expect: [200, 302] },
  { path: '/admin/messages/manage',      expect: [200, 302] },
  { path: '/admin/announcements',        expect: [200, 302] },
  { path: '/admin/analytics',            expect: [200, 302] },
  { path: '/admin/export',               expect: [200, 302] },
  { path: '/admin/audit',                expect: [200, 302] },
  { path: '/admin/notifications',        expect: [200, 302] },
  { path: '/admin/change-password',      expect: [200, 302] }
];

const DRIVER_ROUTES = [
  { path: '/driver/dashboard',           expect: [200, 302] },
  { path: '/driver/change-password',     expect: [200, 302] }
];

// ============================================================
//  HELPERS
// ============================================================
function padRight(str, len) {
  return String(str).padEnd(len, ' ');
}

function statusEmoji(status, expected) {
  if (status === null) return '❌';
  if (expected.includes(status)) return '✅';
  if (status >= 300 && status < 400) return '🔄';
  if (status === 401 || status === 403) return '🔒';
  if (status >= 500) return '💥';
  return '⚠️';
}

async function login(agent, email, password, endpoint) {
  try {
    const res = await agent.post(endpoint).send({ email, password });
    return res.status;
  } catch (err) {
    return null;
  }
}

async function testRoutes(label, agent, routes) {
  console.log('');
  console.log('━━━ ' + label + ' (' + routes.length + ' routes) ━━━');

  let pass = 0;
  let fail = 0;

  for (const route of routes) {
    let status = null;
    try {
      const res = await agent.get(route.path);
      status = res.status;
    } catch (err) {
      status = null;
    }

    const emoji = statusEmoji(status, route.expect);
    const statusText = status === null ? 'ERR' : status;
    console.log('  ' + emoji + ' ' + padRight(statusText, 5) + ' ' + route.path);

    if (route.expect.includes(status)) {
      pass++;
    } else {
      fail++;
    }
  }

  console.log('  ─── ' + pass + ' pass, ' + fail + ' fail');
  return { pass, fail };
}

// ============================================================
//  MAIN
// ============================================================
(async () => {
  console.log('');
  console.log('🧪 ROUTE TEST SUITE');
  console.log('════════════════════════════════════════════════════════════');

  let totalPass = 0;
  let totalFail = 0;

  // 1. PUBLIC
  const publicAgent = request.agent(app);
  const pub = await testRoutes('PUBLIC ROUTES', publicAgent, PUBLIC_ROUTES);
  totalPass += pub.pass;
  totalFail += pub.fail;

  // 2. PATIENT
  const patientAgent = request.agent(app);
  const patientLogin = await login(patientAgent, PATIENT_EMAIL, PATIENT_PASSWORD, '/auth/login');
  if (patientLogin === 302) {
    const pat = await testRoutes('PATIENT ROUTES', patientAgent, PATIENT_ROUTES);
    totalPass += pat.pass;
    totalFail += pat.fail;
  } else {
    console.log('');
    console.log('━━━ PATIENT ROUTES (skipped) ━━━');
    console.log('  ⚠️  Patient login failed (status: ' + patientLogin + ')');
  }

  // 3. NURSE
  const nurseAgent = request.agent(app);
  const nurseLogin = await login(nurseAgent, NURSE_EMAIL, NURSE_PASSWORD, '/auth/login');
  if (nurseLogin === 302) {
    const nur = await testRoutes('NURSE ROUTES', nurseAgent, NURSE_ROUTES);
    totalPass += nur.pass;
    totalFail += nur.fail;
  } else {
    console.log('');
    console.log('━━━ NURSE ROUTES (skipped) ━━━');
    console.log('  ⚠️  Nurse login failed (status: ' + nurseLogin + ')');
  }

  // 4. ADMIN
  const adminAgent = request.agent(app);
  const adminLogin = await login(adminAgent, ADMIN_EMAIL, ADMIN_PASSWORD, '/auth/login');
  if (adminLogin === 302) {
    const adm = await testRoutes('ADMIN ROUTES', adminAgent, ADMIN_ROUTES);
    totalPass += adm.pass;
    totalFail += adm.fail;
  } else {
    console.log('');
    console.log('━━━ ADMIN ROUTES (skipped) ━━━');
    console.log('  ⚠️  Admin login failed (status: ' + adminLogin + ')');
  }

  // 5. DRIVER
  const driverAgent = request.agent(app);
  const driverLogin = await login(driverAgent, DRIVER_EMAIL, DRIVER_PASSWORD, '/driver/login');
  if (driverLogin === 302) {
    const drv = await testRoutes('DRIVER ROUTES', driverAgent, DRIVER_ROUTES);
    totalPass += drv.pass;
    totalFail += drv.fail;
  } else {
    console.log('');
    console.log('━━━ DRIVER ROUTES (skipped) ━━━');
    console.log('  ⚠️  Driver login failed (status: ' + driverLogin + ')');
  }

  // SUMMARY
  const total = totalPass + totalFail;
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  📊 FINAL SUMMARY');
  console.log('     Total routes tested : ' + total);
  console.log('     ✅ Passed           : ' + totalPass);
  console.log('     ❌ Failed           : ' + totalFail);
  console.log('     Pass rate           : ' + (total > 0 ? ((totalPass / total) * 100).toFixed(1) : 0) + '%');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  try { server.close(); } catch (e) {}
  try { await mongoose.connection.close(); } catch (e) {}
  process.exit(totalFail === 0 ? 0 : 1);
})();
'@ | Out-File -FilePath .\scripts\test-routes.js -Encoding UTF8