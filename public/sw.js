// public/sw.js
const CACHE_VERSION = 'healthcare-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const TILE_CACHE = CACHE_VERSION + '-tiles';

const PRECACHE = [
  '/css/leaflet.css',
  '/js/leaflet.js',
  '/js/net.js',
  '/js/network-status.js',
  '/js/csrf-inject.js',
  '/favicon.ico'
];

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only GET, only same-origin
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Never cache: API, auth, socket.io
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/socket.io/') ||
      url.pathname.indexOf('/uploads/') === 0) {
    return;   // fall through to network
  }

  // Map tiles — cache-first (tiles rarely change)
  if (url.pathname.startsWith('/tiles/')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => new Response('', { status: 204 }));
        })
      )
    );
    return;
  }

  // Static assets (css/js/fonts) — cache-first
  if (/\.(css|js|woff2?|ttf|eot|svg|png|jpg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(req).then(cached => cached || fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // HTML pages — network-first, cache fallback
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached =>
            cached || new Response(
              '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>📡 You are offline</h2><p>Please reconnect and refresh the page.</p></body></html>',
              { headers: { 'Content-Type': 'text/html' }, status: 503 }
            )
          )
        )
    );
    return;
  }
});
