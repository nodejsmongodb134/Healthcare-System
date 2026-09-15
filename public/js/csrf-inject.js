// public/js/csrf-inject.js
// Auto-injects CSRF tokens into forms and fetch() calls
(function () {
  function getToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') || '' : '';
  }

  function injectIntoForms() {
    const token = getToken();
    if (!token) return;

    document.querySelectorAll('form').forEach(function (form) {
      const method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method !== 'POST') return;

      const enctype = (form.getAttribute('enctype') || '').toLowerCase();
      const isMultipart = enctype.indexOf('multipart') !== -1;

      if (isMultipart) {
        // For multipart/form-data, add token to the URL query string
        // (the body isn't parsed until multer runs, so query is more reliable)
        let action = form.getAttribute('action') || window.location.pathname;
        if (action.indexOf('_csrf=') === -1) {
          const sep = action.indexOf('?') === -1 ? '?' : '&';
          form.setAttribute('action', action + sep + '_csrf=' + encodeURIComponent(token));
        }
      } else {
        // For urlencoded/json forms, inject a hidden field
        if (!form.querySelector('input[name="_csrf"]')) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = '_csrf';
          input.value = token;
          form.appendChild(input);
        }
      }
    });
  }

  // ---- Patch window.fetch to auto-add CSRF header ----
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].indexOf(method) !== -1) {
      const token = getToken();
      if (token) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const sameOrigin = !/^https?:\/\//i.test(url) || url.indexOf(window.location.origin) === 0;

        if (sameOrigin) {
          init.headers = init.headers || {};
          if (init.headers instanceof Headers) {
            init.headers.set('x-csrf-token', token);
          } else if (Array.isArray(init.headers)) {
            init.headers.push(['x-csrf-token', token]);
          } else {
            init.headers['x-csrf-token'] = token;
          }
        }
      }
    }

    return originalFetch.call(this, input, init);
  };

  // ---- Run on page load ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectIntoForms);
  } else {
    injectIntoForms();
  }

  // ---- Re-run whenever DOM changes (for dynamically added forms) ----
  document.addEventListener('DOMContentLoaded', function () {
    const observer = new MutationObserver(function () {
      injectIntoForms();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
