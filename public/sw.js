/* Offline shell — cache-first for app assets so offline tools keep working. */
const C = 'omni-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin !== location.origin) return;           // never cache API calls
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(C).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
