// public/js/csrf-inject.js — extended version with dynamic form support
(function () {
  // Get CSRF token from meta tag
  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  // Inject hidden _csrf input into a form if not already present
  function injectCsrf(form) {
    if (!form || form.tagName !== 'FORM') return;
    if (form.querySelector('input[name="_csrf"]')) return;
    var token = getCsrfToken();
    if (!token) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = '_csrf';
    input.value = token;
    form.appendChild(input);
  }

  // 1. Inject into existing forms when the page loads
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form').forEach(injectCsrf);
  });

  // 2. Patch native form.submit() — catches dynamically created forms
  var originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    injectCsrf(this);
    return originalSubmit.call(this);
  };

  // 3. Also catch programmatic clicks on submit buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[type="submit"], input[type="submit"]');
    if (btn && btn.form) injectCsrf(btn.form);
  }, true);

  // 4. Expose globally so any inline script can inject manually
  window.injectCsrf = injectCsrf;
})();
