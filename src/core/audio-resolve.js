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
/**
 * Fallback pool, used only when the app's own relay is unreachable.
 *
 * corsproxy.io was REMOVED, not merely reordered. Its free plan blocks
 * server-side requests but still answers a browser with HTTP 200 and an error
 * body, so it won the race with a fake success and aborted every other proxy
 * — the direct cause of tracks that never played. A source that lies about
 * success is worse than one that is simply down.
 */
/* Re-measured 2026-11-12: of the six relays that used to be here, four are
   gone — codetabs answered 522 (origin down) on every target all day,
   isomorphic returns a 403 Cloudflare page, cors.lol is rate-limited (429),
   and whateverorigin now returns its own homepage HTML instead of the
   payload. allorigins is the one survivor: flaky (5.7 s success, then a
   522 on retest) but real. cors.sh cannot be reached from the audit
   sandbox at all, but it was this pool's leader from real browsers and a
   dead entry now costs milliseconds, not a stage — every attempt is
   hard-capped by the deadline in viaProxy below, and 401/403/429 still
   benches a relay that starts refusing. */
const PROXIES = [
  { id: 'cors.sh', delay: 0,
    url: (u) => `https://proxy.cors.sh/${u}` },
  { id: 'allorigins', delay: 400,
    url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
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
/** The pool as it stands right now: benched relays skipped, unless all are. */
const publicPool = () => (PROXIES.filter(usable).length ? PROXIES.filter(usable) : PROXIES);

/** Strip tracking params so the upstream URL stays simple and cacheable. */
export function cleanMediaUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    for (const k of ['si', 'igsi', 'igshid', 'igsh', 'obrf', 'dlrf', 'feature', 'utm_source', 'utm_medium',
                     'utm_campaign', 'fbclid', 'gclid', '_r', 's']) u.searchParams.delete(k);
    /* Instagram media identity lives entirely in the path — every query
       param on an IG link is share junk, and some of it (a pasted ?dlrf=
       token) makes the resolver return an empty body instead of media.
       Drop the whole query string for IG hosts. */
    if (/(^|\.)instagram\.com$/i.test(u.hostname) || /(^|\.)instagr\.am$/i.test(u.hostname)) {
      u.search = '';
    }
    if (u.hostname.endsWith('youtu.be')) {
      const id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    // Instagram resolver needs trailing slash for reels — measured: without slash it returns success:false
    if (/instagram\.com$/i.test(u.hostname) || /instagram\.com$/i.test(u.hostname.replace(/^www\./,''))) {
      if (/\/reel\/[^/]+$/i.test(u.pathname) || /\/p\/[^/]+$/i.test(u.pathname)) {
        if (!u.pathname.endsWith('/')) u.pathname += '/';
      }
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

/**
 * Validate a proxied response.
 *
 * THIS IS WHERE "some songs just don't play" came from.
 *   corsproxy.io's free plan refuses server-side requests, but it answers the
 *   BROWSER with HTTP 200 and puts the refusal in the body:
 *     {"error":"Server-side requests are not allowed on your plan..."}
 *   The old check only looked at `r.ok`, so that 200 won the Promise.any race,
 *   every other proxy was aborted mid-flight, and the track failed — even
 *   though the real resolver answers fine in 6-9 s. Whether a given track
 *   failed came down to which proxy replied first, which is exactly why it
 *   looked random.
 *
 * So: a payload is only accepted if it actually carries a playable URL.
 */
function parsePayload(txt) {
  let j = JSON.parse(txt);
  // allorigins/whateverorigin wrap the body in { contents }
  if (j && typeof j.contents === 'string') j = JSON.parse(j.contents);
  if (!j) throw new Error('empty payload');

  // an explicit error from the proxy or the upstream, whatever the status was
  if (j.error) throw new Error(String(j.error).slice(0, 80));

  const m = j.mediaInfo || {};
  const playable = m.audioUrl || m.videoUrl || j.url;
  if (!playable) throw new Error('no playable url in payload');
  return j;
}

/**
 * The relay's own first-party resolver.
 *
 * GET {relay}/yt?v=<id> answers with the SAME mediaInfo shape the external
 * resolver returns, from infrastructure this app controls, CORS included.
 * Measured 2026-11-12: 0.9 s and a direct googlevideo audio URL for one
 * video, a fast 502 ("no client returned a playable stream") for three
 * others. Intermittent, but it fails in about a second — so it is always
 * tried FIRST and never trusted alone.
 */
async function ytViaRelay(id, capMs = 7000) {
  const b = proxyBase();
  if (!b || !id) throw new Error('no relay');
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), capMs);
  try {
    const r = await fetch(`${b}/yt?v=${encodeURIComponent(id)}`, { signal: c.signal });
    if (!r.ok) throw new Error('relay resolver HTTP ' + r.status);
    return parsePayload(await r.text());
  } finally { clearTimeout(timer); }
}

/**
 * One direct draw at the relay's own resolver, for a caller that already
 * holds a poorer answer and wants a short second chance at the rich one
 * (the downloader's quality list). The relay's draw is a race of player
 * identities and can miss once, then land a second later — a fresh draw
 * is a genuinely new chance, not a repeat of the same one. Null on any
 * miss; never throws.
 */
export async function ytRelayJson(id, capMs = 3000) {
  try { return await ytViaRelay(id, capMs); } catch { return null; }
}

/**
 * Resolve one URL through every route there is, inside ONE hard deadline.
 *
 * WHAT WAS WRONG (the "stuck on Reading the link\u2026" hang, measured
 * 2026-11-12): every stage used to get the FULL timer for itself — the
 * relay twice at 26-30 s, then the public pool at 26 s, then a whole retry
 * round. Worst case past 100 s, so the downloader's spinner never came
 * back. The pool had also rotted (four of six relays dead or lying), and
 * the relay currently refuses the resolver's host outright (403, its
 * allow-list predates the host switch) — fast, but useless until the
 * Worker is updated.
 *
 * THE DISCIPLINE NOW
 *   stage 0  direct fetch of the target (6 s cap). The day the resolver
 *            sends a CORS header this is the fastest route of all; today
 *            the browser refuses it in well under a second.
 *   stage 1  the app's own relay, once (8 s cap).
 *   stage 2  the verified public pool, raced with small staggers.
 *   stage 3  one retry (bench cleared), only if \u22655 s of budget remain.
 * Every attempt is capped at the time actually left, and the total budget
 * is min(ms, cap): the caller ALWAYS gets data or an error inside it.
 * The cap defaults to 20 s; only the downloader's Instagram leg raises it.
 */
function viaProxy(target, { ms = 20000, cap = 20000, onProgress, retry = true } = {}) {
  /* `cap` is the hard ceiling on the budget. It defaults to 20 s, which is
     what keeps music resolution snappy; the downloader raises it for
     Instagram, whose resolver leg legitimately needs ~30 s — under the
     old fixed cap that leg could never succeed, however patient the
     caller asked to be. */
  const BUDGET = Math.max(4000, Math.min(ms || 20000, cap));
  const deadline = Date.now() + BUDGET;
  const left = () => deadline - Date.now();

  const attemptUrl = async (url, capMs, stageCtrl, proxyId) => {
    const t = Math.min(capMs, left());
    if (t < 800) throw new Error('out of budget');
    const own = new AbortController();
    const onAbort = () => own.abort();
    stageCtrl.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => own.abort(), t);
    try {
      const r = await fetch(url, { signal: own.signal });
      if (!r.ok) {
        // 401/403/429 = rate limited. Bench it so it stops winning the race
        // with an instant failure on every subsequent track.
        if (proxyId && (r.status === 401 || r.status === 403 || r.status === 429)) bench(proxyId);
        throw new Error((proxyId || 'route') + ' HTTP ' + r.status);
      }
      const j = parsePayload(await r.text());
      // Never name the proxy in the UI — the user should not be shown the
      // plumbing. The id stays in the console for debugging only.
      onProgress?.('Stream ready');
      return j;
    } finally {
      clearTimeout(timer);
      stageCtrl.signal.removeEventListener('abort', onAbort);
    }
  };

  /* One stage: race its jobs, abort the losers when it settles. Each stage
     gets its own controller so an aborted stage never poisons the next. */
  const stage = async (jobs) => {
    const c = new AbortController();
    const runs = jobs.map(async (j) => {
      if (j.delay) await sleep(Math.min(j.delay, Math.max(0, left() - 1200)));
      if (c.signal.aborted) throw new Error('superseded');
      return attemptUrl(j.url, j.cap, c, j.proxyId);
    });
    try { return await Promise.any(runs); }
    finally { c.abort(); }
  };

  const relayJob = (own, cap) => ({ url: `${own}/?url=${encodeURIComponent(target)}`, cap });
  const publicJobs = () => publicPool().map((p) => ({
    url: p.url(target), cap: left(), proxyId: p.id, delay: p.delay }));

  return (async () => {
    /* Stage 0: direct. Costs ~nothing when CORS refuses, wins outright
       the day the upstream starts sending the header. */
    if (left() > 1200) {
      try { return await stage([{ url: target, cap: 6000 }]); } catch { /* fall through */ }
    }
    /* Stage 1: the relay alone, once. It has no rate limit but is NOT
       always fast (0.07 s warm, 6-13 s cold) — inside a 20 s budget it
       gets one honest chance, not two. On a raised-cap call (Instagram)
       it gets a proportionally longer chance, since it is the only leg
       that can carry a ~30 s upstream answer end to end. */
    const own = proxyBase();
    if (own && left() > 1500) {
      try { return await stage([relayJob(own, cap > 20000 ? 40000 : 8000)]); } catch { /* fall through */ }
    }
    /* Stage 2: the public pool. */
    if (left() > 1500) {
      try { return await stage(publicJobs()); } catch { /* fall through */ }
    }
    /* Stage 3: one bounded retry. Usually the failures above were a burst
       of rate limits rather than a real outage, so clear the bench and
       race everything once more — inside whatever budget is left. */
    if (retry && left() > 5000) {
      onProgress?.('Retrying\u2026');
      COOLDOWN.clear();
      const jobs = publicJobs();
      if (own) jobs.unshift(relayJob(own, left()));
      try { return await stage(jobs); } catch { /* give up */ }
    }
    throw new Error('Could not reach the audio source — tap retry');
  })();
}

/** Fetch any the resolver result through the proxy chain (no CORS on the resolver). */
export async function resolveJson(pageUrl, opts = {}) {
  const clean = cleanMediaUrl(pageUrl);
  /* YouTube links go to the relay's own resolver first (~1 s when it
     works, ~1 s to fail when it doesn't). Everything else — and YouTube
     when the relay misses — takes the budgeted resolver chain. */
  const yt = clean.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (yt) {
    try { return await ytViaRelay(yt[1], 7000); } catch { /* fall through */ }
  }
  return viaProxy(`${RESOLVE_API}${encodeURIComponent(clean)}`, { ms: 20000, ...opts });
}

/**
 * Resolve a YouTube video id to a direct, ad-free audio URL.
 * Concurrent calls for the same id share one network request.
 * @returns {Promise<{audio:string, title?:string, artist?:string, art?:string, via:string}>}
 */

/* ------------------------------------------------------------- track hints
 * The fallback catalogue has no id in common with the primary one, so it can
 * only be searched by name. The list screens already know the title and
 * artist of everything they render, so they hand that over here. Without it a
 * fallback is impossible — there is nothing to look up.
 */
const META = new Map();

export function rememberTrack(id, { title, artist, art, dur } = {}) {
  if (!id || !title) return;
  const prev = META.get(id) || {};
  META.set(id, { title, artist: artist || prev.artist, art: art || prev.art, dur: dur || prev.dur });
  if (META.size > 600) META.delete(META.keys().next().value);
}

const trackMeta = (id) => META.get(id) || null;

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

    let rec = null;
    try {
      let d = null;
      try { d = await ytViaRelay(id, 7000); } catch { /* relay resolver missed — use the chain */ }
      if (!d) d = await viaProxy(url, { onProgress });
      const m = d?.mediaInfo || {};
      const audio = m.audioUrl || m.videoUrl;
      if (!audio) throw new Error('No audio stream returned');
      rec = {
        audio,
        title: m.title || '',
        artist: m.author || '',
        art: m.thumbnail || m.coverImage || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        dur: m.duration || 0,
        expires: Date.now() + TTL,
        via: 'resolver',
      };
    } catch (primaryErr) {
      /* SECOND SOURCE.
         Everything used to hang off one upstream. An audit re-tested every
         published alternative — 5 Cobalt instances, 9 Piped mirrors, 8
         Invidious mirrors, SoundCloud and three community front-ends — and
         not one returned a playable stream. A commercial catalogue's own web
         API does, and its CDN sends `Access-Control-Allow-Origin: *`, so the
         browser plays it directly with no relay in the audio path at all.

         It is matched on title and artist, never on id: the two catalogues
         share nothing. A weak match is refused rather than played, because
         silently playing the wrong song is worse than failing. */
      const meta = trackMeta(id);
      if (!meta?.title) throw primaryErr;
      onProgress?.('Primary source down — trying the second catalogue…');
      let alt = null;
      try {
        const { matchTrack } = await import('./saavn');
        alt = await matchTrack(meta);
      } catch { /* the fallback is allowed to fail too */ }
      if (!alt?.stream) throw primaryErr;
      if (alt.approximate) onProgress?.('Found a close match on an open network…');
      rec = {
        audio: alt.stream,
        title: alt.title || meta.title,
        artist: alt.artist || meta.artist || '',
        art: alt.art || meta.art || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        dur: alt.dur || meta.dur || 0,
        /* The catalogue knows the album, the year and the language. These were
           being thrown away here, so the player had nothing to show and the
           track-detail chips rendered a duration and nothing else. Carried
           through only when the source actually supplied them — a missing
           album must stay missing, never become an empty chip. */
        album: alt.album || '',
        year: alt.year || '',
        lang: alt.lang || '',
        expires: Date.now() + TTL,
        via: alt.approximate ? 'open network (close match)' : 'second catalogue',
        alt: true,
        approximate: !!alt.approximate,
      };
    }

    cacheSet(id, rec);
    notifyWarm(id);
    return rec;
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

/** How many of these ids are ready to play instantly. */

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
