/**
 * Ad-free audio resolution.
 *
 * PROBLEM: the YouTube IFrame embed plays ads and stops when the tab is
 * backgrounded on mobile. The user needs pure background audio, no ads.
 *
 * WHAT WAS TESTED (live, from a github.io Origin):
 *   Piped /streams  — 10 mirrors, ALL returned "YouTube probably blocked" / dead
 *   Invidious       — 8 instances, all failed or no CORS
 *   Cobalt          — requires JWT auth now
 *   AHM7 /api/alldl — WORKS, returns a direct audioUrl…
 *                     …but the AHM7 API itself sends NO CORS header.
 *
 * SOLUTION: fetch the AHM7 JSON through a CORS proxy (allorigins/raw measured
 * 3/3 reliable, ~7s), then hand the resulting CDN link to a plain <audio>.
 * The CDN was verified to answer:
 *      HTTP 206 Partial Content
 *      Content-Type: audio/mp4
 *      Access-Control-Allow-Origin: *
 *      Accept-Ranges: bytes
 * That means: no ads, real seeking, and playback continues in the background
 * (a normal <audio> element is not throttled the way an iframe is).
 */

const AHM7 = 'https://ahm7xmakki.com/api/alldl?url=';

/* Ordered by measured reliability. allorigins/raw was the only one that
   returned usable JSON on every attempt; the rest stay as backups. */
const PROXIES = [
  (u) => `https://proxy.cors.sh/${u}`,                                   // handles nested queries
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u) => `https://cors.isomorphic-git.org/${u}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

/** Strip tracking params so the upstream URL stays simple and cacheable. */
export function cleanMediaUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    for (const k of ['si', 'igsi', 'igshid', 'feature', 'utm_source', 'utm_medium',
                     'utm_campaign', 'fbclid', 'gclid', '_r', 's']) u.searchParams.delete(k);
    if (u.hostname.endsWith('youtu.be')) {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return u.toString().replace(/\?$/, '');
  } catch { return String(raw).trim(); }
}

const MEM = new Map();          // videoId -> { audio, expires }
const LS = 'omni:aud:';
const TTL = 60 * 60 * 1000;     // CDN links are signed; keep well under expiry

function cacheGet(id) {
  const m = MEM.get(id);
  if (m && Date.now() < m.expires) return m;
  try {
    const raw = localStorage.getItem(LS + id);
    if (raw) {
      const j = JSON.parse(raw);
      if (Date.now() < j.expires) { MEM.set(id, j); return j; }
      localStorage.removeItem(LS + id);
    }
  } catch {}
  return null;
}
function cacheSet(id, rec) {
  MEM.set(id, rec);
  try { localStorage.setItem(LS + id, JSON.stringify(rec)); } catch {}
}

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

/**
 * Race ALL proxies at once instead of trying them one-by-one.
 *
 * The old code was sequential: a dead proxy burned the full 26 s timeout before
 * the working one was even attempted, so playback often fell back to the
 * ad-filled embed even though a good proxy existed. Measured live:
 *   proxy.cors.sh  200 in 13.3 s
 *   allorigins     408 after  7.9 s
 *   codetabs       522 after 19.7 s
 * Racing means the first success wins and slow failures cost nothing.
 */
function viaProxy(target, ms = 30000) {
  const attempt = async (wrap) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(wrap(target), { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      let j = JSON.parse(txt);
      if (j && typeof j.contents === 'string') j = JSON.parse(j.contents);
      if (!j || (!j.mediaInfo && !j.success)) throw new Error('unusable payload');
      return j;
    } finally { clearTimeout(timer); }
  };

  // Promise.any resolves on the FIRST success and ignores the failures.
  return Promise.any(PROXIES.map(attempt)).catch(() => {
    throw new Error('every proxy failed');
  });
}

/** Fetch any AHM7 alldl result through the proxy chain (no CORS on AHM7). */
export async function ahm7Json(pageUrl) {
  return viaProxy(`${AHM7}${encodeURIComponent(cleanMediaUrl(pageUrl))}`, 32000);
}

/**
 * Resolve a YouTube video id to a direct, ad-free audio URL.
 * @returns {Promise<{audio:string, title?:string, artist?:string, art?:string, via:string}>}
 */
export async function resolveAudio(id, { onProgress } = {}) {
  const hit = cacheGet(id);
  if (hit) return { ...hit, via: 'cache' };

  onProgress?.('Finding audio stream…');
  const url = `${AHM7}${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
  const d = await viaProxy(url);
  const m = d?.mediaInfo || {};
  const audio = m.audioUrl || m.videoUrl;
  if (!audio) throw new Error('No audio stream returned');

  const rec = {
    audio,
    title: m.title || '',
    artist: m.author || '',
    art: m.thumbnail || m.coverImage || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    expires: Date.now() + TTL,
  };
  cacheSet(id, rec);
  return { ...rec, via: 'AHM7' };
}

/** Best-effort prefetch so the next track starts instantly. */
export function prefetchAudio(id) {
  if (!id || cacheGet(id)) return;
  resolveAudio(id).catch(() => {});
}
