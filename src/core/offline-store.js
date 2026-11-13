/**
 * Offline songs — full audio saved on the device in IndexedDB.
 *
 * The library (library.js) deliberately never stores a stream URL: those are
 * signed and expire in minutes. This store is the opposite trade — it saves
 * the actual bytes, so a saved song plays with no network at all and keeps
 * playing months later. Bytes live in IndexedDB because localStorage cannot
 * hold audio; only this file knows that.
 *
 * A download resolves the track exactly the way the player does, then fetches
 * the audio as a blob. Some hosts refuse cross-origin reads; when that
 * happens the download fails honestly and says so — the track row in the
 * player still offers the plain browser download for those.
 */
import { resolveAudio } from './audio-resolve';

const DB_NAME = 'omni-offline';
const STORE = 'tracks';

const keyOf = (t) => t?.id ?? t?.url ?? t?.stream ?? null;

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

/* ------------------------------------------------------------- queries */
export async function offlineHas(key) {
  if (!key) return false;
  try { return !!(await getOne(key)); } catch { return false; }
}

/** Saved songs, newest first, without the audio bytes attached. */
async function offlineList() {
  try {
    const all = await getAll();
    return all
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch { return []; }
}

/** One saved song WITH its bytes — for playback. */

/** Every saved song WITH bytes, newest first — builds the offline queue. */
export async function offlineAll() {
  try {
    const all = await getAll();
    return all.sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch { return []; }
}

export async function offlineDelete(key) {
  try { await del(key); return true; } catch { return false; }
}


/* ------------------------------------------------------------ download */
/**
 * Save a track's audio on the device. `onProgress` receives 0..1 while the
 * bytes arrive (or -1 when the host does not report a length).
 * Returns { size } or { already: true }. Throws with a readable message.
 */
export async function downloadTrack(track, onProgress) {
  const key = keyOf(track);
  if (!key) throw new Error('This track has nothing downloadable');
  if (await offlineHas(key)) return { already: true };

  let url = track.stream || track.url || track.dlUrl || '';
  if (!url && track.id) {
    const r = await resolveAudio(track.id);
    url = r?.audio || '';
  }
  if (!url) throw new Error('No audio source for this track');
  /* A preview is 30 seconds of the song, not the song — saving one under
     the track's name would be a quiet lie, so refuse it plainly. */
  if (track.preview && url === track.preview && !track.stream) {
    throw new Error('Only a short preview is available for this track');
  }

  let resp;
  try { resp = await fetch(url); }
  catch { throw new Error('The source would not let the app read this audio'); }
  if (!resp.ok) throw new Error(`The source answered ${resp.status}`);

  const total = +resp.headers.get('content-length') || 0;
  let blob;
  if (resp.body && typeof resp.body.getReader === 'function') {
    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress) onProgress(total ? loaded / total : -1);
    }
    blob = new Blob(chunks, { type: resp.headers.get('content-type') || 'audio/mpeg' });
  } else {
    blob = await resp.blob();
    if (onProgress) onProgress(1);
  }
  if (!blob.size) throw new Error('The source sent an empty file');

  await put({
    key, id: track.id || null,
    title: track.title || track.name || 'Untitled',
    artist: track.artist || '', art: track.art || '',
    dur: track.dur || track.duration || null,
    size: blob.size, mime: blob.type || 'audio/mpeg',
    at: Date.now(), blob,
  });
  return { size: blob.size };
}
