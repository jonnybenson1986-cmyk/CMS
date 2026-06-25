const CACHE_NAME = 'wg-cms-v26';

self.addEventListener('install', e => {
  // Take control immediately — don't wait for old SW to finish
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isNavigation = e.request.mode === 'navigate';
  const isSameOrigin = url.origin === self.location.origin;

  // External requests (Firebase SDK CDN, Firestore, auth, etc.) — DO NOT touch.
  // Let the browser handle them natively. Intercepting cross-origin requests
  // here adds a failure point and can race during SW updates, which was
  // breaking the Firebase SDK from loading. Returning without respondWith
  // means the request bypasses the service worker entirely.
  if (!isSameOrigin) return;

  // index.html and navigations — always network-first so updates are instant
  if (isNavigation || url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // service-worker.js itself — always network
  if (url.pathname.endsWith('service-worker.js')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Other same-origin assets — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      });
    })
  );
});
