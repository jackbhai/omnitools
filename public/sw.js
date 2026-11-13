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
const V = 'omni-v7';
const MED = 'omni-med-v1';        // medicine shards, cached only once used
const DATAC = 'omni-data-v1';       // public/data datasets (bus, aarti), cached once used

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

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  const stale = keys.filter((k) => k !== V && k !== MED);
  await Promise.all(stale.map((k) => caches.delete(k)));
  await self.clients.claim();
  /* SELF-HEAL for a device stuck on a poisoned shell.
     A phone that cached an index.html whose hashed bundles no longer exist
     on the server renders a blank dark page — and because the page never
     runs, no in-app recovery code ever gets a chance to run either. The
     worker is the only thing that still executes on that device. So when
     this version takes over and finds old shell caches, it reloads every
     open window itself: the navigation below is network-first, so the
     device lands on the fresh shell and the current bundles. Only done
     when a stale shell cache actually existed (a genuine upgrade), so a
     first install never reloads anything. */
  if (stale.length) {
    try {
      const wins = await self.clients.matchAll({ type: 'window' });
      for (const c of wins) { try { await c.navigate(c.url); } catch {} }
    } catch {}
  }
})()));

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
  const isData = /\/data\/[^/]+\.json$/.test(url.pathname);

  if (isShell) {
    e.respondWith((async () => {
      try {
        /* no-store is explicit: a navigation answered from the HTTP cache
           is just a slower kind of stale. Only a successful response is
           cached — the old code cached ANY response, so a 404 served
           during a deploy window became the permanent offline shell, and
           a 404 must also fall back to the last good copy rather than be
           shown to the user. */
        const res = await fetch(new Request(req.url, { cache: 'no-store' }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      } catch {
        return caches.match(req).then((h) => h || caches.match('./index.html'));
      }
    })());
    return;
  }

  if (isHashed) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  /* Fetched datasets (medicine shards, public/data JSON): serve from cache
     instantly when we have them, otherwise fetch and keep a copy so the
     same surface works with no signal. */
  if (isData) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATAC).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
        return hit || net;
      }).catch(() => fetch(req))
    );
    return;
  }

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
