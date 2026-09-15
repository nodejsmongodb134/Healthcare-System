// scripts/debug-router.js
const { app } = require('../server');
const request = require('supertest');

(async () => {
  console.log('🔍 Debugging router...');

  // Check if app is a function
  console.log('typeof app:', typeof app);

  // Inspect app properties
  console.log('app._router:', app._router);
  console.log('app.router:', app.router);
  console.log('app.stack:', app.stack);

  // Try to access _router as a getter
  if (app._router === undefined) {
    // Maybe the router is lazily created? Access it via a route?
    console.log('🔄 Attempting to trigger router creation...');
    // Mount a dummy route temporarily (not ideal but for testing)
    app.get('/debug-test', (req, res) => res.send('ok'));
    console.log('After adding route, app._router:', app._router);
  }

  // Try a simple request using supertest
  console.log('\n🧪 Testing supertest request...');
  try {
    const res = await request(app).get('/auth/login');
    console.log('Response status:', res.status);
    console.log('Response headers:', res.headers);
  } catch (err) {
    console.error('Error making request:', err.message);
  }

  // Directly access the router stack (if possible)
  if (app._router && app._router.stack) {
    console.log('\n✅ Router stack found. Layers:', app._router.stack.length);
    app._router.stack.forEach(layer => {
      if (layer.route) {
        console.log(`   Route: ${layer.route.path} (${Object.keys(layer.route.methods).join('/')})`);
      } else if (layer.name === 'router') {
        console.log(`   Router: ${layer.regexp.toString()}`);
      }
    });
  } else {
    console.log('❌ No router stack found. This suggests routes are not mounted correctly.');
  }
})();