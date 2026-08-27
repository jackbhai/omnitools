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
  { id: 'whateverorigin', delay: 2400,
    url: (u) => `https://www.whateverorigin.org/get?url=${encodeURIComponent(u)}` },
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

/* ------------------------------------------------------------------ cache */
const MEM = new Map();          // videoId -> { audio, expires }
const INFLIGHT = new Map();     // videoId -> Promise (dedupe concurrent asks)
const LS = 'omni:aud:';
const TTL = 55 * 60 * 1000;     // CDN links are signed; stay well under expiry

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
function viaProxy(target, { ms = 26000, onProgress } = {}) {
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
      if (!r.ok) throw new Error(p.id + ' HTTP ' + r.status);
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

  return Promise.any(PROXIES.map(attempt))
    .then((j) => { ctrl.abort(); return j; })
    .catch(() => { ctrl.abort(); throw new Error('Every proxy failed — try again in a moment'); });
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
 * Warming runs with a small amount of CONCURRENCY.
 *
 * The first version drained the queue one id at a time and each resolve costs
 * 8-15 s upstream, so warming three tracks took ~40 s — long enough that the
 * user pressed Next before anything was ready and saw the same 20 s wait all
 * over again. Two at a time is the sweet spot: the next track is ready within
 * one song, and we never open so many sockets that the playing track stutters.
 */
const WARM_PARALLEL = 2;
let warmQueue = [];
let warmActive = 0;

function pumpWarm() {
  while (warmActive < WARM_PARALLEL && warmQueue.length) {
    const id = warmQueue.shift();
    if (!id || cacheGet(id) || INFLIGHT.has(id)) continue;
    warmActive++;
    resolveAudio(id)
      .catch(() => {})
      .finally(() => {
        warmActive--;
        // small gap so warming never competes with the track that is playing
        setTimeout(pumpWarm, 250);
      });
  }
}

/** Warm one id in the background. */
export function prefetchAudio(id) {
  if (!id || cacheGet(id) || INFLIGHT.has(id) || warmQueue.includes(id)) return;
  warmQueue.push(id);
  pumpWarm();
}

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
 * Warm the next N tracks of a queue so Next feels instant.
 * Called right after playback starts, never before.
 */
export function prefetchNext(list, fromIdx, n = 3) {
  if (!Array.isArray(list)) return;
  for (let i = 1; i <= n; i++) {
    const t = list[fromIdx + i];
    if (t?.id) prefetchAudio(t.id);
  }
}

/** Drop a cached entry (used when a stream 403s because the link expired). */
export function forgetAudio(id) {
  MEM.delete(id);
  try { localStorage.removeItem(LS + id); } catch {}
}
