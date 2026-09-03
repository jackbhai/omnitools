/* Service worker — NETWORK-FIRST for the app shell.
 *
 * The previous version was cache-first for everything, which meant a returning
 * visitor kept getting an OLD index.html (and therefore an old JS bundle) even
 * after a successful deploy. That made new features look like they never
 * shipped. Now:
 *   - navigations / index.html  -> network first, cache only as offline fallback
 *   - hashed assets (immutable) -> cache first (safe: filename changes per build)
 *   - everything cross-origin   -> never touched
 */
const V = 'omni-v5';
const MED = 'omni-med-v1';        // medicine shards, cached only once used

/* The medicine index is 253,802 brands across 752 shards (24 MB). Precaching
   that would burn a user's data for nothing, so shards are cached the first
   time they are actually fetched — after one search for "Levosiz" that shard
   answers offline forever, and the other 751 are never downloaded. */
const MED_KEEP = 40;              // most-recent shards to retain

async function cacheMedShard(req, res) {
  try {
    const c = await caches.open(MED);
    await c.put(req, res);
    const keys = await c.keys();
    if (keys.length > MED_KEEP) {
      for (const k of keys.slice(0, keys.length - MED_KEEP)) await c.delete(k);
    }
  } catch {}
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== V && k !== MED).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // API calls untouched

  const isShell = req.mode === 'navigate' || url.pathname.endsWith('/') ||
                  url.pathname.endsWith('index.html');
  /* The hash Vite appends is base64url, so it can contain '-' as well as
     letters, digits and '_'. Excluding '-' silently dropped any chunk whose
     hash happened to include one - measured on a real build, 2 of 8 assets
     missed, and one of them was the 1.46 MB main bundle. The app therefore
     re-downloaded itself on every visit and could not open offline at all,
     while the tool grid went on promising that half the tools work without
     internet. */
  const isHashed = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname);
  const isMed = /\/med\/[^/]+\.json$/.test(url.pathname);

  if (isShell) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((h) => h || caches.match('./index.html')))
    );
    return;
  }

  if (isHashed) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  /* Medicine shards: serve from cache instantly when we have them, otherwise
     fetch and keep a copy so the same search works with no signal. */
  if (isMed) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) cacheMedShard(req, res.clone());
          return res;
        });
        return hit || net;
      }).catch(() => fetch(req))
    );
    return;
  }

  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
