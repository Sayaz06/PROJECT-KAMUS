// ============================================================
// PROJECT KAMUS — Service Worker
// Strategy: Cache-first for static assets, Network-first for API
// ============================================================

const CACHE_NAME    = 'kamus-v2';
const OFFLINE_URL   = './index.html';

// Files to pre-cache on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching assets...');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase, Google APIs — always network
  const isExternal =
    url.hostname.includes('firebasestorage') ||
    url.hostname.includes('firestore.googleapis') ||
    url.hostname.includes('firebase.googleapis') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('accounts.google');

  if (isExternal) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Strategy: Cache-first → Network fallback → Offline page
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Only cache successful same-origin responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
