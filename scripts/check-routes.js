// scripts/check-routes.js
const { app } = require('../server');
const request = require('supertest');

// Helper: extract base path from a router layer's regex
function getBasePath(layer) {
  if (!layer.regexp || !layer.regexp.source) return '';
  let source = layer.regexp.source;
  // Remove leading ^ and trailing /?  and i flag
  source = source.replace(/^\^/, '').replace(/\/\?$/i, '').replace(/\/$/i, '');
  // Replace escaped slashes
  source = source.replace(/\\\//g, '/');
  // If it's something like /^\/auth\/?/i, after stripping we get "/auth"
  return source;
}

// Recursively extract all routes
function extractRoutes(stack, basePath = '') {
  const routes = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter(m => m !== '_all');
      // Replace params like :id with a sample value
      let path = layer.route.path;
      path = path.replace(/:[^/]+/g, 'test'); // e.g., :id -> test
      const fullPath = basePath + path;
      routes.push({ path: fullPath, methods });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const base = getBasePath(layer);
      const fullBase = basePath + base;
      routes.push(...extractRoutes(layer.handle.stack, fullBase));
    }
  }
  return routes;
}

// Get the router stack from app.router or app._router
function getStack(app) {
  if (app.router && app.router.stack) return app.router.stack;
  if (app._router && app._router.stack) return app._router.stack;
  console.error('❌ No router stack found.');
  process.exit(1);
}

(async () => {
  const stack = getStack(app);
  const routes = extractRoutes(stack);
  console.log(`🔍 Found ${routes.length} route definitions.\n`);

  let total = 0, success = 0, redirect = 0, fail = 0, skipped = 0;

  for (const route of routes) {
    if (!route.methods.includes('get')) {
      console.log(`⏭️  Skipped ${route.methods.join('/').toUpperCase()} ${route.path}`);
      skipped++;
      continue;
    }

    total++;
    try {
      const res = await request(app).get(route.path);
      if (res.status >= 200 && res.status < 300) {
        success++;
        console.log(`✅ GET ${route.path} → ${res.status}`);
      } else if (res.status >= 300 && res.status < 400) {
        redirect++;
        console.log(`🔄 GET ${route.path} → ${res.status} (redirect)`);
      } else {
        fail++;
        console.log(`❌ GET ${route.path} → ${res.status}`);
      }
    } catch (err) {
      fail++;
      console.log(`❌ GET ${route.path} → ${err.message}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Total: ${total}`);
  console.log(`   Success: ${success}`);
  console.log(`   Redirected: ${redirect}`);
  console.log(`   Failed: ${fail}`);
  console.log(`   Skipped: ${skipped}`);
})();