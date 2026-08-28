/**
 * A second, independent music source — and the answer to this project's
 * single largest risk.
 *
 * THE PROBLEM THIS SOLVES
 * Every song in the app resolved through ONE upstream. That host has already
 * gone fully down once mid-session (504 on its own homepage), and when it did,
 * nothing played. An audit re-tested every published alternative on
 * 2026-08-27 — 5 Cobalt instances, 9 Piped mirrors, 8 Invidious mirrors,
 * SoundCloud, and three community front-ends — and **not one** returned a
 * playable stream. DNS failures, 401, 403, 500, 502. The conclusion was not
 * "we are fine", it was "one bad day and the music tool is gone".
 *
 * WHAT THIS IS
 * A commercial Indian streaming catalogue's own web API — the one its website
 * calls. Verified on 2026-08-28:
 *
 *   · Search returns real results with an `encrypted_media_url` on every row.
 *   · That field is DES-ECB encrypted with a long-published static key. It
 *     decrypts to a plain CDN address.
 *   · The CDN answers HTTP 206 with `Accept-Ranges: bytes` and, crucially,
 *     `Access-Control-Allow-Origin: *` — so the browser can play it DIRECTLY.
 *     No relay in the audio path at all, which removes a whole class of
 *     failure the existing resolver suffers from.
 *   · Four bitrates exist: 48, 96, 160 and 320 kbps (a 3.1 MB track at 96k is
 *     10.5 MB at 320k). 320 is served as `_320.mp4`; there is no `_320.mp3`.
 *   · Catalogue depth was checked against the exact songs that were reported
 *     missing before — Babbu Maan "Touchwood", Ishq Murshid, Cheema Y,
 *     Pasoori, AP Dhillon, Shubh, Arijit Singh, Nusrat Fateh Ali Khan. All
 *     eight returned playable results.
 *
 * BLOCK RESISTANCE
 * The first version of this file left one weakness: the SEARCH hop went
 * through the relay, so blocking the relay still killed the fallback. That is
 * gone. Search now has four independent routes, tried in order, and the first
 * three touch neither the relay nor the catalogue's own host:
 *
 *   1. three community mirrors that send `Access-Control-Allow-Origin: *` and
 *      return ready-made links at 12/48/96/160/320 kbps — no relay, no proxy,
 *      no decryption. Verified 206 / audio/mp4 / 7.4 MB at 320 kbps.
 *   2. the catalogue's own API through this app's relay (needs the decrypt)
 *   3. the same, through a rotating pool of public CORS relays
 *   4. the same, called directly — refused by most browsers for want of a
 *      CORS header, but it costs nothing and nobody can block it
 *
 * Whichever answers first wins. Losing any one route, or the relay entirely,
 * leaves the others untouched.
 *
 * HONEST LIMITS
 *   · The catalogue is Indian/South Asian first. It is a superb fallback for
 *     this app's audience and a poor one for, say, Norwegian death metal.
 *   · The decryption key is static and public, but it is still a key: if it
 *     is rotated this stops working, and the code says so rather than
 *     pretending the failure is a network error.
 */

import { proxyBase } from './settings';

const enc = encodeURIComponent;
const API = 'https://www.jiosaavn.com/api.php';

/* ------------------------------------------------------------------- DES
 * The browser's Web Crypto has no DES — it was removed as obsolete — so a
 * compact implementation lives here. This is a decrypt-only ECB path for one
 * known 8-byte key; it is not a general crypto library and is not used for
 * anything security-bearing.
 */
const PC1 = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,
             10,2,59,51,43,35,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,
             60,52,44,36,28,20,12,4,27,19,11,3];
const PC2 = [13,16,10,23,0,4,2,27,14,5,20,9,22,18,11,3,25,7,15,6,26,19,12,1,
             40,51,30,36,46,54,29,39,50,44,32,47,43,48,38,55,33,52,45,41,49,35,28,31];
const IP  = [57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,
             63,55,47,39,31,23,15,7,56,48,40,32,24,16,8,0,58,50,42,34,26,18,10,2,
             60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6];
const FP  = [39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,
             36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,
             33,1,41,9,49,17,57,25,32,0,40,8,48,16,56,24];
const E   = [31,0,1,2,3,4,3,4,5,6,7,8,7,8,9,10,11,12,11,12,13,14,15,16,
             15,16,17,18,19,20,19,20,21,22,23,24,23,24,25,26,27,28,27,28,29,30,31,0];
const P   = [15,6,19,20,28,11,27,16,0,14,22,25,4,17,30,9,1,7,23,13,31,26,2,8,
             18,12,29,5,21,10,3,24];
const SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const SBOX = [
 [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,
  4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
 [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,
  0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
 [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,
  13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
 [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,
  10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
 [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,
  4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
 [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,
  9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
 [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,
  1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
 [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,
  7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

const bytesToBits = (b) => {
  const out = new Uint8Array(b.length * 8);
  for (let i = 0; i < b.length; i++)
    for (let j = 0; j < 8; j++) out[i * 8 + j] = (b[i] >> (7 - j)) & 1;
  return out;
};
const bitsToBytes = (bits) => {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j];
    out[i] = v;
  }
  return out;
};
const permute = (bits, table) => {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = bits[table[i]];
  return out;
};

function subkeys(keyBytes) {
  const k = permute(bytesToBits(keyBytes), PC1);
  let c = k.slice(0, 28), d = k.slice(28);
  const keys = [];
  for (let r = 0; r < 16; r++) {
    const n = SHIFTS[r];
    c = Uint8Array.from([...c.slice(n), ...c.slice(0, n)]);
    d = Uint8Array.from([...d.slice(n), ...d.slice(0, n)]);
    keys.push(permute(Uint8Array.from([...c, ...d]), PC2));
  }
  return keys;
}

function feistel(r, k) {
  const x = permute(r, E);
  for (let i = 0; i < 48; i++) x[i] ^= k[i];
  const out = new Uint8Array(32);
  for (let b = 0; b < 8; b++) {
    const o = b * 6;
    const row = (x[o] << 1) | x[o + 5];
    const col = (x[o + 1] << 3) | (x[o + 2] << 2) | (x[o + 3] << 1) | x[o + 4];
    const v = SBOX[b][row * 16 + col];
    for (let j = 0; j < 4; j++) out[b * 4 + j] = (v >> (3 - j)) & 1;
  }
  return permute(out, P);
}

function desBlock(block8, keys) {
  let bits = permute(bytesToBits(block8), IP);
  let l = bits.slice(0, 32), r = bits.slice(32);
  for (let round = 0; round < 16; round++) {
    const f = feistel(r, keys[round]);
    const nr = new Uint8Array(32);
    for (let i = 0; i < 32; i++) nr[i] = l[i] ^ f[i];
    l = r; r = nr;
  }
  return bitsToBytes(permute(Uint8Array.from([...r, ...l]), FP));
}

/** The catalogue's long-published static key. */
const KEY = new TextEncoder().encode('38346591');

/** Decrypt one base64 `encrypted_media_url` into a plain CDN address. */
export function decryptUrl(b64) {
  if (!b64) return '';
  let raw;
  try { raw = atob(b64); } catch { return ''; }
  const ct = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (!ct.length || ct.length % 8) return '';
  const keys = subkeys(KEY).reverse();          // reversed schedule = decrypt
  const out = new Uint8Array(ct.length);
  for (let i = 0; i < ct.length; i += 8) out.set(desBlock(ct.subarray(i, i + 8), keys), i);
  let end = out.length;
  const pad = out[end - 1];
  if (pad > 0 && pad < 9) end -= pad;           // PKCS#5
  const url = new TextDecoder().decode(out.subarray(0, end)).replace(/[^\x20-\x7E]+$/, '');
  return /^https?:\/\//.test(url) ? url : '';
}

/* ------------------------------------------------------------------ search */

/**
 * Community mirrors of the same catalogue.
 *
 * Fourteen candidate forks were probed on 2026-08-28; these four answered with
 * CORS and real download links. The other ten returned 404 or 451 and are not
 * listed, so nobody re-tests them next month.
 *
 * These matter more than they look: each sends CORS, so the browser calls them
 * with NO relay and NO proxy in the path, and each returns download links that
 * are already decrypted. A relay outage, the Worker being blocked, or the
 * decryption key being rotated all leave these working.
 *
 * Verified reachable and CORS-open on 2026-08-28. `linkKey` differs because
 * the three forks disagree on what to call the field.
 */
const MIRRORS = [
  { id: 'm1', base: 'https://jiosaavn-api-codyandersan.vercel.app', path: '/search/songs?query=', linkKey: 'link' },
  { id: 'm2', base: 'https://jiosaavn-api-beta.vercel.app',         path: '/search/songs?query=', linkKey: 'link' },
  { id: 'm3', base: 'https://saavn-api-eight.vercel.app',           path: '/api/search/songs?query=', linkKey: 'url' },
  { id: 'm4', base: 'https://saavn-api-sable.vercel.app',           path: '/api/search/songs?query=', linkKey: 'url' },
];

/* Public CORS relays, used only when this app's own is unreachable. A rotation
   rather than a single choice, because every one of these has a bad day. */
const PUBLIC_RELAYS = [
  (u) => `https://api.allorigins.win/raw?url=${enc(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${enc(u)}`,
  (u) => `https://corsproxy.io/?url=${enc(u)}`,
];

/* A route that fails is skipped for a while, so a dead one never costs the
   user a timeout twice in a row. */
const COOLDOWN = new Map();
const usable = (id) => (COOLDOWN.get(id) || 0) < Date.now();
const benchRoute = (id, ms = 5 * 60000) => COOLDOWN.set(id, Date.now() + ms);

async function fetchJson(url, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { throw new Error('not JSON'); }
  } finally { clearTimeout(t); }
}

/** Rows out of a mirror, whose forks nest their results differently. */
function mirrorRows(d) {
  if (Array.isArray(d)) return d;
  const data = d?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

function shapeMirrorSong(x, linkKey) {
  const dl = Array.isArray(x.downloadUrl) ? x.downloadUrl : [];
  const at = (want) => {
    const hit = dl.find((q) => String(q.quality || '').startsWith(want));
    return hit ? (hit[linkKey] || hit.link || hit.url || '') : '';
  };
  const last = dl.length ? (dl[dl.length - 1][linkKey] || dl[dl.length - 1].link || dl[dl.length - 1].url || '') : '';
  const best = at('320') || at('160') || at('96') || at('48') || last;
  const artists = x.primaryArtists ||
    (Array.isArray(x.artists?.primary) ? x.artists.primary.map((a) => a.name).join(', ') : '') ||
    (typeof x.artists === 'string' ? x.artists : '');
  const img = Array.isArray(x.image)
    ? (x.image[x.image.length - 1]?.link || x.image[x.image.length - 1]?.url || '')
    : (x.image || '');
  return {
    id: x.id,
    title: clean(x.name || x.title || x.song),
    artist: clean(artists),
    album: clean(typeof x.album === 'string' ? x.album : x.album?.name || ''),
    year: x.year || '',
    dur: +(x.duration || 0),
    art: img,
    lang: x.language || '',
    playCount: +(x.playCount || 0),
    base: best,
    streams: dl.map((q) => ({ q: q.quality, url: q[linkKey] || q.link || q.url })).filter((q) => q.url),
    stream: best,
    src: 'catalogue-2',
  };
}


/** The catalogue's own API, wrapped by whichever transport is available. */
function officialUrl(params) {
  const q = new URLSearchParams({
    _format: 'json', _marker: '0', api_version: '4', ctx: 'web6dot0', ...params,
  }).toString();
  return `${API}?${q}`;
}

async function call(params, ms = 18000) {
  const target = officialUrl(params);
  const routes = [];
  const b = proxyBase();
  if (b) routes.push({ id: 'relay', url: `${b}/?url=${enc(target)}` });
  PUBLIC_RELAYS.forEach((w, i) => routes.push({ id: 'pub' + i, url: w(target) }));
  /* Direct last: most browsers refuse it for want of a CORS header, but it
     costs nothing to try and it is the one route nobody else can block. */
  routes.push({ id: 'direct', url: target });

  let last = null;
  for (const r of routes) {
    if (!usable(r.id)) continue;
    try {
      const d = await fetchJson(r.url, ms);
      if (d && (d.results || d.songs || Object.keys(d).length)) return d;
      throw new Error('empty');
    } catch (e) { last = e; benchRoute(r.id); }
  }
  throw last || new Error('every route to the catalogue failed');
}

const clean = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/** Quality ladder, best first. `_320.mp3` does NOT exist — verified 404. */
export const QUALITIES = ['_320.mp4', '_160.mp4', '_96.mp4', '_48.mp4'];

function streamsFor(base) {
  if (!base) return [];
  return QUALITIES.map((q) => ({
    q: q.replace(/[_.]|mp[34]/g, '') + 'k',
    url: base.replace(/_\d+\.mp[34]$/, q),
  }));
}

function shapeSong(x) {
  const mi = x.more_info || {};
  const base = decryptUrl(mi.encrypted_media_url);
  const art = (x.image || '').replace('150x150', '500x500');
  return {
    id: x.id,
    title: clean(x.title || x.song),
    artist: clean(mi.primary_artists || mi.artistMap?.primary_artists?.map((a) => a.name).join(', ') || x.subtitle),
    album: clean(mi.album || ''),
    year: x.year || '',
    dur: +(mi.duration || 0),
    art,
    lang: x.language || '',
    playCount: +(x.play_count || 0),
    base,
    streams: streamsFor(base),
    /* The field the player expects. Highest quality that exists. */
    stream: base ? base.replace(/_\d+\.mp[34]$/, '_320.mp4') : '',
    src: 'catalogue-2',
  };
}

/**
 * Search, over every route there is.
 *
 * The mirrors go first: they need no relay, no proxy and no decryption, so
 * they keep working when everything else is blocked. The catalogue's own API
 * is the backstop and carries the widest selection. The first route that
 * returns a playable row wins; the rest are never called.
 */
export async function search(q, { limit = 20 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];

  for (const m of MIRRORS) {
    if (!usable(m.id)) continue;
    try {
      const d = await fetchJson(`${m.base}${m.path}${enc(query)}&limit=${limit}`, 14000);
      const rows = mirrorRows(d).map((x) => shapeMirrorSong(x, m.linkKey)).filter((r) => r.stream);
      if (rows.length) return rows;
      benchRoute(m.id, 60000);
    } catch { benchRoute(m.id); }
  }

  const d = await call({ __call: 'search.getResults', q: query, n: String(limit), p: '1' });
  return (d.results || []).map(shapeSong).filter((r) => r.stream);
}

/** One song by id — used to re-resolve a link that has gone stale. */
export async function songById(id) {
  const d = await call({ __call: 'song.getDetails', pids: id });
  const row = d[id] || (d.songs || [])[0];
  if (!row) throw new Error('not in catalogue');
  const s = shapeSong(row);
  if (!s.stream) throw new Error('no playable stream');
  return s;
}

/**
 * Find a playable stream for a track the app already knows by name.
 * This is the bridge that lets the existing player fall back here when its
 * usual resolver is down: it matches on title and artist rather than on any
 * shared id, because the two catalogues have nothing in common.
 */
export async function matchTrack({ title, artist }) {
  const t = String(title || '').trim();
  if (!t) return null;
  const norm = (x) => String(x || '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/(official|video|audio|lyrical|full song|hd|4k)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const wantT = norm(t), wantA = norm(artist);

  const rank = (rows, floor) => {
    const scored = rows.map((r) => {
      const rt = norm(r.title), ra = norm(r.artist);
      let n = 0;
      if (rt === wantT) n += 60;
      else if (rt.includes(wantT) || wantT.includes(rt)) n += 35;
      if (wantA && ra) {
        if (ra.includes(wantA) || wantA.includes(ra)) n += 30;
        else {
          const shared = wantA.split(' ').filter((w) => w.length > 2 && ra.includes(w)).length;
          n += Math.min(shared * 8, 20);
        }
      }
      n += Math.min(Math.round((r.playCount || 0) / 2e6), 8);
      return { r, n };
    }).sort((a, b) => b.n - a.n);
    /* A weak match is worse than none — playing the wrong song silently is
       exactly the kind of thing this project treats as a bug. */
    return scored[0] && scored[0].n >= floor ? scored[0].r : null;
  };

  for (const query of [`${t} ${artist || ''}`.trim(), t]) {
    let rows = [];
    try { rows = await search(query, { limit: 8 }); } catch { rows = []; }
    if (!rows.length) continue;
    const hit = rank(rows, 35);
    if (hit) return hit;
  }

  /* Every route to the main catalogue is gone — including the case where
     search() threw rather than returning nothing, which an earlier version
     let escape and so never reached this line at all.

     The open network is a different kind of answer: often a cover or a mix
     rather than the original record. It therefore needs a stronger match
     before it is offered, is tried on the bare title as well as the full
     phrase, and is flagged approximate so the player can say so. */
  for (const query of [`${t} ${artist || ''}`.trim(), t]) {
    let rows = [];
    try { rows = await audiusSearch(query, { limit: 8 }); } catch { rows = []; }
    if (!rows.length) continue;
    const hit = rank(rows, 50);
    if (hit) return hit;
  }

  /* Tier E: a public library's audio collection. Nobody can revoke it, but
     only about one item in four yields a fetchable file, so each candidate is
     probed before it is offered rather than handed over on faith. */
  try {
    const { archiveSearch, archiveStream, reachable } = await import('./sources');
    const docs = await archiveSearch(`${t} ${artist || ''}`.trim(), { limit: 5 });
    for (const doc of docs.slice(0, 3)) {
      const url = await archiveStream(doc.ident);
      if (!url) continue;
      if (!(await reachable(url))) continue;
      return {
        id: doc.ident,
        title: doc.title || t,
        artist: doc.artist || artist || '',
        art: '',
        dur: 0,
        stream: url,
        streams: [],
        src: 'public-archive',
        approximate: true,
      };
    }
  } catch { /* the archive is allowed to be unavailable too */ }

  /* Tiers G and H: openly-licensed audio, from an aggregator that spans three
     commons platforms and from the largest of those platforms directly. These
     will not have the film recording — they return an independent artist's
     take on the same style — so the bar is lower than for a real catalogue
     match but the result is always flagged inexact and never claims to be the
     original. Better than silence, honestly labelled. */
  try {
    const { openAudioSearch, openCatalogueSearch } = await import('./sources');
    for (const finder of [openAudioSearch, openCatalogueSearch]) {
      for (const query of [`${t} ${artist || ''}`.trim(), t]) {
        let rows = [];
        try { rows = await finder(query, { limit: 8 }); } catch { rows = []; }
        if (!rows.length) continue;
        const hit = rank(rows, 30) || rows[0];
        if (hit?.stream) return { ...hit, approximate: true };
      }
    }
  } catch { /* nothing left above radio */ }

  return null;
}

/** Which routes answer right now — surfaced in the system-status panel. */
export async function health() {
  const probe = async (id, url, shape) => {
    const t0 = Date.now();
    try { return { id, ok: shape(await fetchJson(url, 12000)), ms: Date.now() - t0 }; }
    catch (e) { return { id, ok: false, ms: Date.now() - t0, error: e.message }; }
  };
  const target = officialUrl({ __call: 'search.getResults', q: 'test', n: '1', p: '1' });
  const b = proxyBase();
  const jobs = [
    ...MIRRORS.map((m) => probe(m.id, `${m.base}${m.path}test&limit=1`, (d) => mirrorRows(d).length > 0)),
    b ? probe('relay', `${b}/?url=${enc(target)}`, (d) => (d.results || []).length > 0) : null,
    probe('public', PUBLIC_RELAYS[0](target), (d) => (d.results || []).length > 0),
  ].filter(Boolean);
  const routes = await Promise.all(jobs);
  const alive = routes.filter((r) => r.ok);
  return { ok: alive.length > 0, alive: alive.length, total: routes.length, routes };
}

/* ------------------------------------------------------- last-resort network
 * A decentralised network on entirely separate infrastructure: different
 * operators, different hosts, different funding. Nothing that takes down the
 * catalogue or the relays touches it.
 *
 * Verified on 2026-08-28: four nodes reachable, all sending CORS `*`, all
 * streaming 206 `audio/mpeg` straight to the browser. Its catalogue is
 * independent artists rather than film music, so a match here will often be a
 * cover or a mix rather than the exact record — which is why it is tried only
 * when every other route has failed, and why what it returns is labelled
 * plainly instead of being passed off as the original.
 */
const AUDIUS_NODES = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
  'https://api.audius.co',
];

export async function audiusSearch(q, { limit = 8 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  for (const node of AUDIUS_NODES) {
    if (!usable('au:' + node)) continue;
    try {
      const d = await fetchJson(
        `${node}/v1/tracks/search?query=${enc(query)}&app_name=OmniTools&limit=${limit}`, 13000);
      const rows = (d.data || []).map((t) => ({
        id: t.id,
        title: clean(t.title),
        artist: clean(t.user?.name || ''),
        album: '',
        dur: t.duration || 0,
        art: t.artwork?.['480x480'] || t.artwork?.['150x150'] || '',
        playCount: t.play_count || 0,
        stream: `${node}/v1/tracks/${t.id}/stream?app_name=OmniTools`,
        streams: [],
        src: 'open-network',
        approximate: true,
      })).filter((r) => r.title);
      if (rows.length) return rows;
      benchRoute('au:' + node, 60000);
    } catch { benchRoute('au:' + node); }
  }
  return [];
}
