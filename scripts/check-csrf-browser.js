// scripts/check-csrf-browser.js
// Paste this into browser DevTools Console on any page
(function () {
  console.log('═══════════════════════════════════');
  console.log('🔍 CSRF STATE CHECK');
  console.log('═══════════════════════════════════');

  // 1. Meta tag present?
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) {
    console.log('✅ Meta tag found:', meta.getAttribute('content').substring(0, 20) + '…');
  } else {
    console.log('❌ Meta tag MISSING — CSRF injection middleware not running');
  }

  // 2. Client script loaded?
  const script = document.querySelector('script[src*="csrf-inject"]');
  if (script) {
    console.log('✅ csrf-inject.js loaded from:', script.src);
  } else {
    console.log('❌ csrf-inject.js NOT in DOM');
  }

  // 3. Hidden input in forms?
  const forms = document.querySelectorAll('form');
  console.log('📋 Forms found:', forms.length);
  forms.forEach(function (form, i) {
    const method = (form.getAttribute('method') || 'GET').toUpperCase();
    const hidden = form.querySelector('input[name="_csrf"]');
    const action = form.getAttribute('action') || '(no action)';
    console.log(`   Form ${i + 1} [${method}] ${action}`);

    if (method === 'POST') {
      if (hidden) {
        console.log(`     ✅ Hidden _csrf: ${hidden.value.substring(0, 20)}…`);
      } else {
        const action2 = form.getAttribute('action') || '';
        if (action2.includes('_csrf=')) {
          console.log(`     ✅ Token in action URL: ${action2.substring(0, 60)}…`);
        } else {
          console.log(`     ❌ NO CSRF TOKEN in this form!`);
        }
      }
    }
  });

  // 4. Cookie present?
  const hasCookie = document.cookie.split(';').some(function (c) {
    return c.trim().startsWith('x-csrf-token=');
  });
  console.log(hasCookie
    ? '✅ Cookie x-csrf-token present (or httpOnly — check DevTools → Application)'
    : '⚠️  Cookie not visible from JS (may still be httpOnly — check DevTools → Application)');

  // 5. Fetch wrapper installed?
  console.log('📡 window.fetch is CSRF-wrapped:', typeof window.fetch === 'function' ? 'YES (check Network tab to confirm)' : 'NO');

  console.log('═══════════════════════════════════');
})();
