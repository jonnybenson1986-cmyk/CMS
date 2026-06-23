const CACHE_NAME = 'wg-cms-v8';
const ASSETS = [
  './',
  './index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only intercept same-origin navigation requests — let external scripts (Firebase CDN etc.) pass through directly
  const url = new URL(e.request.url);
  const isNavigation = e.request.mode === 'navigate';
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    // External request (Firebase, ipify, etc.) — fetch directly, no cache fallback
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).catch(() => {
        // Only fall back to index.html for page navigations, not assets
        if (isNavigation) return caches.match('./index.html');
      });
    })
  );
});
