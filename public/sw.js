/* MED offline shell — versioned */
const V = 'med-v2';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // App shell: cache-first, fallback to index.html offline
  if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html'))));
    return;
  }
  // CDN (leaflet/fonts/tiles): network-first, silent offline fail
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
