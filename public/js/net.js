// public/js/net.js
// Resilient fetch — timeout + retry + proper error handling for ALL pages
(function () {
  const DEFAULT_TIMEOUT = 20000;      // 20s
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [1500, 4000];  // 1.5s, then 4s

  const originalFetch = window.fetch;

  function isSameOrigin(url) {
    return url.indexOf('http') !== 0 || url.indexOf(location.origin) === 0;
  }

  window.fetch = async function (input, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : (input && input.url) || '';

    // Never retry POST (unsafe — could double-submit)
    // Retry GET/PUT/DELETE with idempotency assumptions on GET only
    const canRetry = isSameOrigin(url) && method === 'GET';
    const attempts = canRetry ? MAX_RETRIES + 1 : 1;

    let lastErr;

    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

      try {
        const res = await originalFetch.call(this, input, {
          ...init,
          signal: init.signal || controller.signal
        });
        clearTimeout(timer);

        // 5xx → retry GETs
        if (res.status >= 500 && canRetry && i < MAX_RETRIES) {
          console.warn(`⚠️ ${res.status} on ${method} ${url} — retry ${i + 1}/${MAX_RETRIES}`);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[i]));
          continue;
        }

        return res;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;

        const isTimeout = err.name === 'AbortError';
        const isNetwork = err.name === 'TypeError' && /fetch|network/i.test(err.message);

        if (canRetry && i < MAX_RETRIES && (isTimeout || isNetwork)) {
          console.warn(`⚠️ ${isTimeout ? 'Timeout' : 'Network err'} on ${method} ${url} — retry ${i + 1}`);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[i]));
          continue;
        }

        // Friendly error
        if (isTimeout) {
          showNetworkToast('⏱ Server is slow — please try again', '#dc3545');
          throw new Error('Request timed out');
        }
        if (isNetwork) {
          showNetworkToast('📡 Poor connection — check your network', '#dc3545');
        }
        throw err;
      }
    }

    throw lastErr;
  };

  function showNetworkToast(msg, color) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:${color || '#dc3545'};color:white;padding:12px 20px;border-radius:8px;
      font-size:0.85rem;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.3);
      max-width:90vw;text-align:center;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  console.log('✅ [net.js] Resilient fetch installed (20s timeout, 2 retries on GET)');
})();
