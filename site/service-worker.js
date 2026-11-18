const CACHE_NAME = 'wg-cms-v117';

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

  // The Microsoft sign-in return page (Outlook sync) — straight from the network,
  // untouched, so the sign-in window always gets it exactly as Netlify serves it.
  if (url.pathname === '/auth-redirect.html') return;

  // index.html and navigations — always network-first so updates are instant
  if (isNavigation || url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // The participant handbook (a large PDF for clients) — straight from the
  // network, never stored in staff devices' offline cache.
  if (url.pathname.startsWith('/handbook/')) return;

  // service-worker.js itself — always network
  if (url.pathname.endsWith('service-worker.js')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // The app's own scripts and styles (teams.js, vpr.js, the consent wording, the form styles…)
  // change with releases, and index.html is always fetched fresh — so these are too. Otherwise a
  // new index.html could run, for one load, with the last release's helpers. The stored copy is
  // only the fallback when there is no connection. The big third-party files in /vendor/ don't
  // change between releases and stay cache-first.
  if (!url.pathname.startsWith('/vendor/') && /\.(js|css)$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.ok) { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, clone)); }
        return resp;
      }).catch(() => caches.match(e.request).then(cached => cached || Response.error()))
    );
    return;
  }

  // Other same-origin assets — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || !resp.ok) return resp;          // never store an error page as if it were the file
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      });
    })
  );
});
