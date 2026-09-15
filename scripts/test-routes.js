const request = require('supertest');
const mongoose = require('mongoose');
const { app, server } = require('../server');

const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'Admin@123';
const NURSE_EMAIL = 'nodejsmongodb12@gmail.com';
const NURSE_PASSWORD = 'Nurse@123';
const PATIENT_EMAIL = 'kevinnngondo@gmail.com';
const PATIENT_PASSWORD = 'Patient@123';

const PUBLIC_ROUTES = ['/', '/auth/login', '/auth/register', '/auth/forgot', '/driver/login', '/api/tiles/status'];
const PATIENT_ROUTES = ['/auth/patient-dashboard', '/patient/profile', '/patient/appointment', '/patient/view-appointments', '/patient/message', '/patient/order', '/patient/change-password'];
const NURSE_ROUTES = ['/auth/nurse-dashboard', '/nurse/profile', '/nurse/nurse-appointments', '/nurse/nurse-messages', '/nurse/nurse-orders', '/nurse/nurse-patients', '/nurse/create-driver', '/nurse/drivers', '/nurse/track-drivers', '/nurse/announcement', '/nurse/change-password'];
const ADMIN_ROUTES = ['/admin/dashboard', '/admin/appointments', '/admin/messages', '/admin/orders', '/admin/patients', '/admin/patients/manage', '/admin/nurses', '/admin/nurses/manage', '/admin/nurses/create', '/admin/drivers', '/admin/drivers/create', '/admin/orders/manage', '/admin/messages/manage', '/admin/announcements', '/admin/analytics', '/admin/export', '/admin/audit', '/admin/notifications', '/admin/change-password'];
const DRIVER_ROUTES = ['/driver/dashboard', '/driver/change-password'];

async function testGroup(label, agent, paths) {
  console.log('');
  console.log('--- ' + label + ' ---');
  let pass = 0, fail = 0;
  for (const p of paths) {
    let status = 'ERR';
    try { const res = await agent.get(p); status = res.status; } catch (e) {}
    const ok = status >= 200 && status < 400;
    if (ok) pass++; else fail++;
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + status + '  ' + p);
  }
  console.log('  => ' + pass + ' pass, ' + fail + ' fail');
  return { pass, fail };
}

(async () => {
  console.log('ROUTE TEST SUITE');
  console.log('================');

  let totalPass = 0, totalFail = 0;

  const pub = await testGroup('PUBLIC', request.agent(app), PUBLIC_ROUTES);
  totalPass += pub.pass; totalFail += pub.fail;

  const pa = request.agent(app);
  await pa.post('/auth/login').send({ email: PATIENT_EMAIL, password: PATIENT_PASSWORD });
  const pat = await testGroup('PATIENT', pa, PATIENT_ROUTES);
  totalPass += pat.pass; totalFail += pat.fail;

  const na = request.agent(app);
  await na.post('/auth/login').send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });
  const nur = await testGroup('NURSE', na, NURSE_ROUTES);
  totalPass += nur.pass; totalFail += nur.fail;

  const aa = request.agent(app);
  await aa.post('/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const adm = await testGroup('ADMIN', aa, ADMIN_ROUTES);
  totalPass += adm.pass; totalFail += adm.fail;

  const da = request.agent(app);
  await da.post('/driver/login').send({ email: 'driver@test.com', password: 'Driver@123' });
  const drv = await testGroup('DRIVER', da, DRIVER_ROUTES);
  totalPass += drv.pass; totalFail += drv.fail;

  console.log('');
  console.log('================');
  console.log('TOTAL: ' + totalPass + ' pass, ' + totalFail + ' fail');
  console.log('================');

  try { server.close(); } catch (e) {}
  try { await mongoose.connection.close(); } catch (e) {}
  process.exit(0);
})();
