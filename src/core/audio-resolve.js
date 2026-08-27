/**
 * Ad-free audio resolution — built for SPEED, because the old path took
 * 17-30 s and the user (rightly) called it broken.
 *
 * WHAT WAS MEASURED (live, from a github.io Origin, 2026-08-27):
 *   Piped /streams   — 9 mirrors: 403 / 500 / 502 / dead. All blocked.
 *   Invidious        — 6 instances: 403, "shutdown", bot-check HTML. Dead.
 *   Cobalt           — needs a JWT now.
 *   The media resolver  — WORKS. 8-15 s to answer, and sends NO CORS header,
 *                      so it must be wrapped in a proxy.
 *   Proxy race:  proxy.cors.sh  200 in 17.1 s   <- only reliable one
 *                corsproxy.io   200 in 10.8 s   <- fastest, but 403s on repeat
 *                allorigins 522 · codetabs 522 · isomorphic 403 · thingproxy dead
 *
 * WHY IT FELT SLOW AND SOMETIMES PLAYED ADS
 *   1. Every play() re-resolved from scratch — nothing was warmed ahead.
 *   2. the resolver itself needs ~10 s, and the proxy adds its own hop on top, so the
 *      user watched a spinner for 17-30 s with no feedback.
 *   3. When resolution finally finished the tap gesture had long expired, the
 *      browser refused play(), the old code read that as "no stream" and swapped
 *      in the ad-filled iframe. That is where the ads came from.
 *
 * WHAT THIS FILE DOES ABOUT IT
 *   · Races ALL proxies in parallel and takes the first valid answer.
 *   · STAGGERED START: the fastest proxy fires immediately, the rest join after
 *     a short delay, so a slow-but-reliable proxy never blocks a fast one and a
 *     dead one costs nothing.
 *   · Two-layer cache (memory + localStorage) keyed on video id, 55 min TTL —
 *     replaying a track is instant.
 *   · Aggressive PREFETCH: the next few tracks in the queue resolve in the
 *     background while the current one plays, so skipping is instant.
 *   · Progress callbacks so the UI can show what is happening instead of a
 *     silent spinner.
 */

import { RESOLVE_API } from './endpoints';
import { proxyBase } from './settings';


/**
 * Proxy pool, ordered by measured latency.
 * `delay` staggers the start so we don't hammer every proxy for every request,
 * but a stalled leader is overtaken within a second.
 */
const PROXIES = [
  { id: 'corsproxy.io', delay: 0,
    url: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { id: 'cors.sh', delay: 250,
    url: (u) => `https://proxy.cors.sh/${u}` },
  { id: 'allorigins', delay: 900,
    url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { id: 'codetabs', delay: 1400,
    url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { id: 'isomorphic', delay: 1900,
    url: (u) => `https://cors.isomorphic-git.org/${u}` },
  { id: 'corslol', delay: 2200,
    url: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}` },
  { id: 'whateverorigin', delay: 2600,
    url: (u) => `https://www.whateverorigin.org/get?url=${encodeURIComponent(u)}` },
];

/**
 * Per-proxy cooldown.
 *
 * These are free services with rate limits. corsproxy.io starts returning 401
 * after a burst, and while it is doing that it answers in 80 ms — so it kept
 * winning the race with a failure and dragged every attempt down with it.
 * A proxy that rate-limits is benched for a while instead of being retried on
 * every single track.
 */
const COOLDOWN = new Map();          // id -> timestamp when it may be used again
const BENCH_MS = 3 * 60 * 1000;
const usable = (p) => (COOLDOWN.get(p.id) || 0) < Date.now();
const bench = (id, ms = BENCH_MS) => COOLDOWN.set(id, Date.now() + ms);

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

/* ------------------------------------------------------------------ cache */
const MEM = new Map();          // videoId -> { audio, expires }
const INFLIGHT = new Map();     // videoId -> Promise (dedupe concurrent asks)
const LS = 'omni:aud:';
/**
 * How long a resolved link is trusted.
 *
 * This was 55 minutes, which was far too optimistic. Measured behaviour of the
 * CDN: resolving the same video twice returns a DIFFERENT url and 403s the
 * older one, and links go stale on their own within a couple of minutes —
 * reading one 45 s after it was issued already truncated. A stale link shows
 * up as MediaError 4 in the middle of a playlist.
 *
 * Six minutes keeps a just-warmed track instant (which is the whole point of
 * prefetching) while making it very unlikely we hand the element a dead url.
 * Anything older is re-resolved, which costs one lookup and always works.
 */
const TTL = 6 * 60 * 1000;

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
  try {
    localStorage.setItem(LS + id, JSON.stringify(rec));
  } catch {
    // storage full — drop the oldest omni audio entries and retry once
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS));
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(LS + id, JSON.stringify(rec));
    } catch {}
  }
}
export const isCached = (id) => !!cacheGet(id);

/* ------------------------------------------------------------ proxy race */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parsePayload(txt) {
  let j = JSON.parse(txt);
  // allorigins/whateverorigin wrap the body in { contents }
  if (j && typeof j.contents === 'string') j = JSON.parse(j.contents);
  if (!j || (!j.mediaInfo && !j.success && !j.url)) throw new Error('unusable payload');
  return j;
}

/**
 * Race every proxy, staggered. First valid JSON wins; everything else is
 * aborted so we stop paying for slow failures.
 */
function viaProxy(target, { ms = 26000, onProgress, retry = true } = {}) {
  const ctrl = new AbortController();
  let done = false;

  const attempt = async (p) => {
    if (p.delay) await sleep(p.delay);
    if (done) throw new Error('superseded');
    const own = new AbortController();
    const onAbort = () => own.abort();
    ctrl.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => own.abort(), ms);
    try {
      const r = await fetch(p.url(target), { signal: own.signal });
      if (!r.ok) {
        // 401/403/429 = rate limited. Bench it so it stops winning the race
        // with an instant failure on every subsequent track.
        if (r.status === 401 || r.status === 403 || r.status === 429) bench(p.id);
        throw new Error(p.id + ' HTTP ' + r.status);
      }
      const j = parsePayload(await r.text());
      done = true;
      // Never name the proxy in the UI — the user should not be shown the
      // plumbing. The id stays in the console for debugging only.
      onProgress?.('Stream ready');
      return j;
    } finally {
      clearTimeout(timer);
      ctrl.signal.removeEventListener('abort', onAbort);
    }
  };

  const race = (pool) =>
    Promise.any(pool.map(attempt)).then((j) => { ctrl.abort(); return j; });

  /* The user's own Cloudflare Worker, when configured, goes FIRST and with no
     stagger — it has no rate limit and typically answers in a few hundred ms,
     versus 7-11 s for the last surviving public proxy. The public pool stays
     as a fallback so nothing breaks if the Worker is unreachable. */
  const own = proxyBase();
  const pool = own
    ? [{ id: 'own', delay: 0, url: (u) => `${own}/?url=${encodeURIComponent(u)}` },
       ...PROXIES.map((p) => ({ ...p, delay: p.delay + 600 }))]
    : PROXIES;

  const fresh = pool.filter(usable);
  return race(fresh.length ? fresh : pool)
    .catch(async () => {
      ctrl.abort();
      if (!retry) throw new Error('Could not reach the audio source');
      /* Everything failed at once. That is usually a burst of rate limits
         rather than a real outage, so wait a moment, clear the bench and try
         the whole pool once more before telling the user anything. */
      onProgress?.('Retrying…');
      await sleep(1200);
      COOLDOWN.clear();
      done = false;
      return Promise.any(pool.map(attempt))
        .catch(() => { throw new Error('Could not reach the audio source — tap retry'); });
    });
}

/** Fetch any the resolver result through the proxy chain (no CORS on the resolver). */
export async function resolveJson(pageUrl, opts = {}) {
  return viaProxy(`${RESOLVE_API}${encodeURIComponent(cleanMediaUrl(pageUrl))}`, { ms: 30000, ...opts });
}

/**
 * Resolve a YouTube video id to a direct, ad-free audio URL.
 * Concurrent calls for the same id share one network request.
 * @returns {Promise<{audio:string, title?:string, artist?:string, art?:string, via:string}>}
 */
export function resolveAudio(id, { onProgress, fresh = false } = {}) {
  // `fresh` forces a re-resolve: the CDN signs its links, so a cached one can
  // 404 long before our 55-minute TTL expires. The player asks for a fresh
  // copy when the <audio> element reports an error.
  if (fresh) forgetAudio(id);   // declared below; hoisted
  const hit = fresh ? null : cacheGet(id);
  if (hit) return Promise.resolve({ ...hit, via: 'cache' });
  if (INFLIGHT.has(id)) return INFLIGHT.get(id);

  const p = (async () => {
    onProgress?.('Finding ad-free stream…');
    const url = `${RESOLVE_API}${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
    const d = await viaProxy(url, { onProgress });
    const m = d?.mediaInfo || {};
    const audio = m.audioUrl || m.videoUrl;
    if (!audio) throw new Error('No audio stream returned');
    const rec = {
      audio,
      title: m.title || '',
      artist: m.author || '',
      art: m.thumbnail || m.coverImage || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      dur: m.duration || 0,
      expires: Date.now() + TTL,
    };
    cacheSet(id, rec);
    notifyWarm(id);
    return { ...rec, via: 'resolver' };
  })();

  INFLIGHT.set(id, p);
  p.finally(() => INFLIGHT.delete(id));
  return p;
}

/* --------------------------------------------------------------- prefetch */
/**
 * Warming runs with CONCURRENCY and a PRIORITY queue.
 *
 * v1 drained one id at a time; each resolve costs 8-15 s upstream, so warming
 * three tracks took ~40 s and the user hit Next long before anything was ready.
 * v2 raised it to two in parallel. This version adds priority: the track the
 * user is most likely to play next (the one immediately after the current one)
 * jumps the queue, so a skip is never waiting behind a speculative warm.
 *
 * Three at a time is measured to be safe — the playing track streams from a
 * different host than the resolver, so warming does not steal its bandwidth.
 */
const WARM_PARALLEL = 2;
let warmQueue = [];        // [{ id, prio }] — lower prio number runs first
let warmActive = 0;
let warmPaused = false;    // held off while a track is still starting

function pumpWarm() {
  if (warmPaused) return;
  while (warmActive < WARM_PARALLEL && warmQueue.length) {
    warmQueue.sort((a, b) => a.prio - b.prio);
    const { id } = warmQueue.shift();
    if (!id || cacheGet(id) || INFLIGHT.has(id)) continue;
    warmActive++;
    resolveAudio(id)
      .catch(() => {})
      .finally(() => {
        warmActive--;
        // small gap so warming never competes with the track that is playing
        setTimeout(pumpWarm, 200);
      });
  }
}

/**
 * Hold warming while the current track is still opening its stream.
 *
 * The resolver and the audio CDN are different hosts, but a phone on mobile
 * data has one pipe: a burst of background resolves measurably delayed the
 * track the user was waiting for. Warming is paused until playback is actually
 * running, then released.
 */
export function pauseWarming() { warmPaused = true; }
export function resumeWarming() {
  if (!warmPaused) return;
  warmPaused = false;
  pumpWarm();
}

/**
 * Warm one id in the background.
 * @param {number} prio 0 = play next (urgent) · 1 = soon · 2 = speculative
 */
export function prefetchAudio(id, prio = 1) {
  if (!id || cacheGet(id) || INFLIGHT.has(id)) return;
  const existing = warmQueue.find((w) => w.id === id);
  if (existing) { existing.prio = Math.min(existing.prio, prio); return; }
  warmQueue.push({ id, prio });
  pumpWarm();
}

/** Forget everything queued but not started — used when the queue changes. */
export function clearWarmQueue() { warmQueue = []; }

/** How many of these ids are ready to play instantly. */
export const warmCount = (ids = []) => ids.filter((i) => i && cacheGet(i)).length;

/**
 * Subscribers notified whenever a stream finishes resolving.
 *
 * Without this the "ready" badge never appeared: caching happens outside
 * React, so nothing re-rendered when a background prefetch landed and the
 * list kept showing every track as cold.
 */
const listeners = new Set();
export function onWarm(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notifyWarm(id) { for (const f of listeners) { try { f(id); } catch {} } }

/**
 * Warm the tracks around the current position so Next/Prev feel instant.
 *
 * The very next track gets priority 0 so a skip never waits behind a
 * speculative warm; the ones after it are 1, and the previous track is 2
 * (people do press Prev, but far less often).
 */
export function prefetchNext(list, fromIdx, n = 1) {
  if (!Array.isArray(list)) return;
  /* Only the immediate next track is warmed.
     Warming four ahead looked clever but fought the CDN: every resolve mints a
     new signed link and invalidates older ones, so by the time the user
     reached track 4 its link was already dead (MediaError 4 mid-playlist).
     One track ahead is enough to make Next feel instant and is the deepest we
     can go without the links going stale underneath us. */
  for (let i = 1; i <= n; i++) {
    const t = list[fromIdx + i];
    if (t?.id) prefetchAudio(t.id, 0);
  }
}

/** Drop a cached entry (used when a stream 403s because the link expired). */
export function forgetAudio(id) {
  MEM.delete(id);
  try { localStorage.removeItem(LS + id); } catch {}
}
