// public/js/csrf-inject.js
(function () {
  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function addTokenToForm(form, token) {
    if (!form || form.tagName !== 'FORM') return;
    if ((form.method || 'get').toLowerCase() !== 'post') return;

    // Always add hidden input
    if (!form.querySelector('input[name="_csrf"]')) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = token;
      form.appendChild(input);
    }

    // ALWAYS add token to URL — belt and suspenders
    if (form.action.indexOf('_csrf=') === -1) {
      var sep = form.action.indexOf('?') === -1 ? '?' : '&';
      form.action = form.action + sep + '_csrf=' + encodeURIComponent(token);
    }
  }

  function processAllForms() {
    var token = getCsrfToken();
    if (!token) return;
    document.querySelectorAll('form').forEach(function (f) {
      addTokenToForm(f, token);
    });
  }

  // Layer 1: DOMContentLoaded
  document.addEventListener('DOMContentLoaded', processAllForms);

  // Layer 2: Immediate (if script loads after DOM)
  if (document.readyState !== 'loading') {
    processAllForms();
  }

  // Layer 3: Patch form.submit()
  var originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    var token = getCsrfToken();
    if (token) addTokenToForm(this, token);
    return originalSubmit.call(this);
  };

  // Layer 4: Patch requestSubmit()
  if (typeof HTMLFormElement.prototype.requestSubmit === 'function') {
    var originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function (submitter) {
      var token = getCsrfToken();
      if (token) addTokenToForm(this, token);
      return originalRequestSubmit.call(this, submitter);
    };
  }

  // Layer 5: Click on submit buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[type="submit"], input[type="submit"]');
    if (btn && btn.form) {
      var token = getCsrfToken();
      if (token) addTokenToForm(btn.form, token);
    }
  }, true);

  // Layer 6: Submit event listener
  document.addEventListener('submit', function (e) {
    var token = getCsrfToken();
    if (token) addTokenToForm(e.target, token);
  }, true);

  // Expose for manual use
  window.injectCsrf = function (form) {
    var token = getCsrfToken();
    if (token) addTokenToForm(form, token);
  };
})();
