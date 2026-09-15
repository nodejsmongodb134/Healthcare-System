// scripts/diagnose-routes.js
const { app } = require('../server');
const request = require('supertest');

(async () => {
  console.log('🔍 Diagnostics...');

  // Check if app is exported
  if (!app) {
    console.error('❌ app is undefined. Check module.exports in server.js.');
    process.exit(1);
  }
  console.log('✅ app is exported.');

  // Check if app._router exists
  if (!app._router) {
    console.error('❌ app._router is undefined. Routes might not be mounted yet.');
    process.exit(1);
  }
  console.log('✅ app._router exists.');

  // Try to count routes using simple traversal
  let routeCount = 0;
  function countRoutes(stack, base = '') {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join('/');
        console.log(`   ${methods.toUpperCase()} ${base}${layer.route.path}`);
        routeCount++;
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        const base2 = base + layer.regexp.source.replace(/\\\//g, '/').replace(/\^/,'').replace(/\$/, '');
        countRoutes(layer.handle.stack, base2);
      }
    }
  }
  countRoutes(app._router.stack);
  console.log(`📊 Total routes found: ${routeCount}`);

  // Now test a few known routes with GET
  console.log('\n🧪 Testing key routes...');
  const testRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot',
    '/driver/login',
    '/patient/dashboard',
    '/nurse/dashboard',
    '/admin/dashboard',
    '/admin/patients',
    '/admin/nurses',
    '/admin/orders'
  ];

  for (const path of testRoutes) {
    try {
      const res = await request(app).get(path);
      console.log(`   ${res.status} ${path}`);
    } catch (err) {
      console.log(`   ❌ ${path} → ${err.message}`);
    }
  }
})();