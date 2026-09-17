// public/js/network-status.js
// Global network status banner + slow-request loader + service worker registration
(function () {
  let banner = null;
  let slowCount = 0;
  let loader = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'net-status-banner';
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;
      padding:8px 16px;text-align:center;font-size:0.82rem;font-weight:500;
      z-index:99999;display:none;color:white;
      transition:transform 0.3s;
    `;
    document.body.appendChild(banner);
    return banner;
  }

  function ensureLoader() {
    if (loader) return loader;
    loader = document.createElement('div');
    loader.id = 'net-loader';
    loader.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:60px;height:60px;border-radius:50%;
      border:5px solid rgba(102,126,234,0.2);
      border-top-color:#667eea;
      animation:netSpin 1s linear infinite;
      z-index:99998;display:none;
      pointer-events:none;
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes netSpin{to{transform:translate(-50%,-50%) rotate(360deg);}}';
    document.head.appendChild(style);
    document.body.appendChild(loader);
    return loader;
  }

  function showBanner(msg, color) {
    const b = ensureBanner();
    b.textContent = msg;
    b.style.background = color;
    b.style.display = 'block';
  }

  function hideBanner() {
    if (banner) banner.style.display = 'none';
  }

  function showLoader() {
    ensureLoader().style.display = 'block';
  }

  function hideLoader() {
    if (loader) loader.style.display = 'none';
  }

  // ---------- Online/offline detection ----------
  function updateOnline() {
    if (navigator.onLine) {
      hideBanner();
    } else {
      showBanner('📡 You are offline — some features will not work', '#dc3545');
    }
  }

  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);

  // ---------- Detect slow requests ----------
  const origFetch = window.fetch;

  window.fetch = async function (input, init) {
    // Show loader after 3s of waiting
    const loaderTimer = setTimeout(() => {
      slowCount++;
      showLoader();
    }, 3000);

    try {
      const res = await origFetch.call(this, input, init);
      clearTimeout(loaderTimer);
      slowCount = Math.max(0, slowCount - 1);
      if (slowCount === 0) hideLoader();
      return res;
    } catch (err) {
      clearTimeout(loaderTimer);
      slowCount = Math.max(0, slowCount - 1);
      if (slowCount === 0) hideLoader();
      throw err;
    }
  };

  // ---------- Page navigation slow detection ----------
  window.addEventListener('beforeunload', () => {
    showBanner('⏳ Loading…', '#667eea');
  });

  // ---------- Initial ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateOnline);
  } else {
    updateOnline();
  }

  // ---------- Register service worker for offline caching ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('✅ [SW] Registered:', reg.scope))
        .catch(err => console.warn('⚠️ [SW] Registration failed:', err.message));
    });
  }
})();