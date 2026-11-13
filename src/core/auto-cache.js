/**
 * Auto-cache — the last 50 songs you actually played, kept on the device.
 *
 * The manual offline store (offline-store.js) saves what the user taps the
 * download button on. This is its automatic sibling: when a track really
 * starts playing, its bytes are fetched quietly in the background and kept
 * here, so the recent rotation plays with no network at all. The two stores
 * are separate on purpose — a manual save is the user's property and is
 * NEVER evicted by this cache, and a track already saved manually is never
 * duplicated here.
 *
 * Honesty rules, same as the manual store:
 *   · Only bytes the browser will actually hand over are kept. A host that
 *     refuses cross-origin reads (CORS) is skipped and counted, never faked.
 *   · Previews are never cached as if they were the song.
 *   · Live radio is never cached — it has no end and no fixed bytes.
 *   · Save-Data mode (the app's switch or the device's own) stops all
 *     background fetching, and so does the Auto-cache setting itself.
 *
 * Recency is by last PLAY, not by when the bytes landed: replaying a cached
 * song refreshes its place in line without downloading it again. On the
 * 51st distinct song the least-recently-played one is evicted.
 */
import { offlineHas, offlineGet } from './offline-store';
import { getSettings } from './settings';

export const AUTO_CACHE_CAP = 50;
/* One song is a few MB. Anything past this is not a song — a mislabelled
   video or a broken length header — and is not worth the device's space. */
const MAX_BYTES = 48e6;
const DB_NAME = 'omni-autocache';
const STORE = 'tracks';

const keyOf = (t) => t?.id ?? t?.url ?? t?.stream ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The fetch starts a few seconds into playback, not at the tap: the playing
   track owns the bandwidth first. Tests shrink this to zero. */
let START_DELAY = 5000;
export const __setStartDelay = (ms) => { START_DELAY = ms; };

/* ------------------------------------------------------------ IndexedDB */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function op(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let out;
    const req = run(store);
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('storage aborted'));
  }));
}

const put = (rec) => op('readwrite', (s) => s.put(rec));
const del = (key) => op('readwrite', (s) => s.delete(key));
const getAll = () => op('readonly', (s) => s.getAll()).then((r) => r || []);
const getOne = (key) => op('readonly', (s) => s.get(key));

/* --------------------------------------------------------------- guards */
function saveDataOn() {
  try {
    return !!getSettings().lowData || !!navigator.connection?.saveData;
  } catch { return false; }
}
function enabled() {
  try { if (getSettings().autoCache === false) return false; } catch {}
  if (saveDataOn()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

/* -------------------------------------------------------------- queries */
export async function autoCacheHas(key) {
  if (!key) return false;
  try { return !!(await getOne(key)); } catch { return false; }
}

async function autoCacheGet(key) {
  if (!key) return null;
  try { return (await getOne(key)) || null; } catch { return null; }
}

/** Cached songs, most recently played first, without the audio bytes. */
export async function autoCacheList() {
  try {
    const all = await getAll();
    return all
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
  } catch { return []; }
}

/** Every cached song WITH bytes, most recently played first. */
export async function autoCacheAll() {
  try {
    const all = await getAll();
    return all.sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
  } catch { return []; }
}

export async function autoCacheDelete(key) {
  try { await del(key); return true; } catch { return false; }
}

export async function autoCacheClear() {
  try {
    const all = await getAll();
    for (const r of all) await del(r.key);
    return true;
  } catch { return false; }
}

let skippedCount = 0;
export async function autoCacheStats() {
  const list = await autoCacheList();
  return {
    count: list.length,
    bytes: list.reduce((a, r) => a + (r.size || 0), 0),
    skipped: skippedCount,
  };
}

/* --------------------------------------------------------- local playback */
/**
 * A saved copy of this track, if one exists — the manual store wins (it is
 * the copy the user asked for), the auto-cache is the fallback. Pure
 * storage reads: no network is touched, so this is safe to call offline.
 * Returns { blob, source: 'manual' | 'auto', rec } or null.
 */
export async function resolveLocalTrack(track) {
  const key = keyOf(track);
  if (!key) return null;
  try {
    const man = await offlineGet(key);
    if (man?.blob) return { blob: man.blob, source: 'manual', rec: man };
  } catch { /* fall through to the auto-cache */ }
  const auto = await autoCacheGet(key);
  if (auto?.blob) return { blob: auto.blob, source: 'auto', rec: auto };
  return null;
}

/* Object URLs minted for the player. The previous one is revoked on a
   delay — by the time a new track is minted, the element has long since
   moved off the old bytes, and revoking instantly could pull the source
   out from under a track that is still fading out. */
let mintedUrl = null;
export async function localObjectUrl(track) {
  const local = await resolveLocalTrack(track);
  if (!local) return null;
  const url = URL.createObjectURL(local.blob);
  if (mintedUrl) {
    const old = mintedUrl;
    setTimeout(() => { try { URL.revokeObjectURL(old); } catch {} }, 1500);
  }
  mintedUrl = url;
  return { url, source: local.source };
}

/* ------------------------------------------------------------- the engine */
/* Everything — recency refreshes and fetches alike — runs on one serial
   chain. That is the "one at a time" rule made structural: two background
   downloads can never race each other or the playing track. */
let chain = Promise.resolve();
const enqueue = (job) => { chain = chain.then(job).catch(() => {}); };
/** Resolves when every queued refresh/fetch has finished (tests + UI). */
export const __whenIdle = () => chain;

async function refreshRecency(key, at) {
  const rec = await autoCacheGet(key);
  if (!rec) return false;
  if ((rec.playedAt || 0) < at) await put({ ...rec, playedAt: at });
  return true;
}

async function prune() {
  const all = await getAll();
  if (all.length <= AUTO_CACHE_CAP) return;
  const sorted = [...all].sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
  for (const rec of sorted.slice(AUTO_CACHE_CAP)) {
    try { await del(rec.key); } catch { /* already gone */ }
  }
}

async function fetchAndStore(job) {
  const { key, track, url, at } = job;
  /* The wait is per play, counted from when the song started: a song the
     user skipped past in two seconds still played, but its bytes queue
     behind everything that is still actually wanted. */
  const wait = at + START_DELAY - Date.now();
  if (wait > 0) await sleep(wait);
  if (!enabled()) return;                       // switched off meanwhile
  if (await autoCacheHas(key)) { await refreshRecency(key, at); return; }
  if (await offlineHas(key)) return;            // saved manually meanwhile

  let resp;
  try { resp = await fetch(url); }
  catch { skippedCount++; return; }             // CORS or network refusal
  if (!resp.ok) { skippedCount++; return; }
  const declared = +resp.headers.get('content-length') || 0;
  if (declared > MAX_BYTES) {
    skippedCount++;
    try { resp.body?.cancel?.(); } catch {}
    return;
  }
  let blob;
  try { blob = await resp.blob(); } catch { skippedCount++; return; }
  if (!blob.size || blob.size > MAX_BYTES) { skippedCount++; return; }

  await put({
    key, id: track.id || null,
    title: track.title || track.name || 'Untitled',
    artist: track.artist || '', art: track.art || '',
    dur: track.dur || track.duration || null,
    size: blob.size, mime: blob.type || 'audio/mpeg',
    cachedAt: Date.now(), playedAt: at, auto: true, blob,
  });
  await prune();
}

/**
 * The player calls this the moment a track is really playing, with the
 * exact URL that is playing. Cached already → just refreshes its place in
 * line. New → its bytes are queued for a background fetch. Everything the
 * rules refuse (radio, previews, blobs, Save-Data, the setting being off)
 * is refused here, silently — playback never waits on this.
 */
export function notePlayed(track, url, at = Date.now()) {
  try {
    if (!track || track.kind === 'station') return;
    const key = keyOf(track);
    if (!key) return;
    enqueue(async () => {
      /* A replay of a kept song refreshes its place even in Save-Data
         mode — that costs no network at all. */
      if (await refreshRecency(key, at)) return;
      if (!enabled()) return;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
      /* A preview is 30 seconds of the song, not the song (same rule as
         the manual store). */
      if (track.preview && url === track.preview && !track.stream) return;
      if (await offlineHas(key)) return;        // never duplicate a manual save
      await fetchAndStore({ key, track, url, at });
    });
  } catch { /* the cache must never disturb playback */ }
}
