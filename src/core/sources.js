/**
 * Every way this app can find a playable stream, in one place.
 *
 * WHY A REGISTRY AND NOT MORE if/else
 * ------------------------------------
 * The player used to know about one resolver. Then two. Adding a third by
 * hand each time is how a fallback chain rots: the ordering lives in one
 * function, the health of each source is invisible, and nobody can tell which
 * tier actually answered. So every source is declared here as data — what it
 * is, whose infrastructure it runs on, whether it needs the relay, and how
 * exact a match it can promise — and the chain is just "walk the list".
 *
 * THE RULE THAT MATTERS: INDEPENDENCE
 * A fallback is only worth having if it fails for different reasons than the
 * thing it backs up. Five mirrors of one API are ONE plan, not five. So each
 * tier below sits on genuinely separate infrastructure:
 *
 *   A  primary resolver          one vendor's API              relay: yes
 *   B  catalogue mirrors ×4      community forks, CORS-open    relay: NO
 *   C  catalogue direct          the catalogue's own API       relay: optional
 *   D  open music network        decentralised, own nodes      relay: NO
 *   E  public-domain archive     a library, not a business     relay: NO
 *   G  open-licence pool         three commons platforms       relay: NO
 *   H  open catalogue            a CC music label              relay: NO
 *   F  live radio                thousands of stations         relay: NO
 *
 * B, D, E, G, H and F need no relay at all. Blocking this app's Worker — or the
 * Worker being taken down — cannot stop them.
 *
 * WHAT EACH TIER HONESTLY PROMISES
 * Tiers A-C return THE recording you asked for. Tier D usually returns a cover
 * or a remix. Tier E returns whatever a public archive happens to hold. Tier F
 * returns a station playing that kind of music, not that song. The player must
 * say which it got — a "close match" presented as the original is the kind of
 * quiet lie this project treats as a bug — so every result carries `exact`.
 *
 * Everything below was requested and checked on 2026-08-28. Sources that did
 * not answer are recorded in the notes rather than silently dropped, so nobody
 * re-tests them next month: Free Music Archive (404), ccMixter and openwhyd
 * (no CORS), 9 of 10 additional catalogue forks (404/451), and every Cobalt,
 * Piped and Invidious instance (22 tested, 0 alive).
 */

import { proxyBase } from './settings';

const enc = encodeURIComponent;

/* A source that fails is rested, so a dead one never costs the user two
   timeouts in a row. Recovery is automatic. */
const COOLDOWN = new Map();
export const sourceReady = (id) => (COOLDOWN.get(id) || 0) < Date.now();
export const restSource = (id, ms = 5 * 60000) => COOLDOWN.set(id, Date.now() + ms);

export async function getJson(url, ms = 14000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new Error('not JSON'); }
  } finally { clearTimeout(t); }
}

const clean = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/* ------------------------------------------------------------- TIER E
 * A public library's audio collection. Not a music service — nobody can
 * revoke it, rate-limit it commercially or take it private.
 *
 * Verified holdings: punjabi 7,398 items · bollywood 2,894 · indian classical
 * 2,181 · hindi songs 1,696 · ghazal 996 · qawwali 456.
 *
 * Honest limit, measured: only about one item in four yields a file the
 * browser can actually fetch — some are restricted (401), some have no MP3,
 * and some metadata records are too large to parse. It is therefore a late
 * fallback, and every candidate is probed before being offered rather than
 * handed to the player on faith.
 */
const ARCHIVE = 'https://archive.org';

export async function archiveSearch(q, { limit = 6 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const u = `${ARCHIVE}/advancedsearch.php?q=` +
    enc(`(${query}) AND mediatype:audio AND format:MP3`) +
    `&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=${limit}&output=json`;
  const d = await getJson(u, 16000);
  return (d.response?.docs || []).map((x) => ({
    ident: x.identifier,
    title: clean(Array.isArray(x.title) ? x.title[0] : x.title),
    artist: clean(Array.isArray(x.creator) ? x.creator[0] : x.creator || ''),
  })).filter((x) => x.ident);
}

/** Turn one archive item into a playable url, or null if it is not usable. */
export async function archiveStream(ident) {
  let m;
  try { m = await getJson(`${ARCHIVE}/metadata/${enc(ident)}`, 15000); }
  catch { return null; }
  const files = (m.files || []).filter((f) =>
    /\.(mp3|ogg|m4a)$/i.test(f.name || '') && +(f.size || 0) > 200000);
  if (!files.length) return null;
  files.sort((a, b) => +(a.size || 0) - +(b.size || 0));
  const f = files[Math.floor(files.length / 2)] || files[0];
  return `${ARCHIVE}/download/${enc(ident)}/${enc(f.name)}`;
}

/** Does this url actually answer? Cheap range request, no body downloaded. */
export async function reachable(url, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-1' }, signal: c.signal });
    return r.status === 206 || r.status === 200;
  } catch { return false; }
  finally { clearTimeout(t); }
}

/* ------------------------------------------------------------- TIER F
 * Live radio. The end of the line, and the one thing that is essentially
 * impossible to take down: thousands of independent broadcasters, indexed by
 * a community database whose mirrors are themselves community-run.
 *
 * This never plays the requested song, so it is offered as an explicit choice
 * — "we could not find that track, here is a station playing this kind of
 * music" — and never substituted silently.
 */
const RADIO_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
];

export async function radioFor(hint, { limit = 8 } = {}) {
  const q = String(hint || '').trim() || 'bollywood';
  for (const base of RADIO_MIRRORS) {
    if (!sourceReady('radio:' + base)) continue;
    try {
      const d = await getJson(
        `${base}/json/stations/search?name=${enc(q)}&limit=${limit}&hidebroken=true&order=votes&reverse=true`,
        13000);
      const rows = (d || []).filter((s) => s.url_resolved).map((s) => ({
        id: s.stationuuid,
        title: clean(s.name),
        artist: clean(s.country || s.language || 'Live radio'),
        art: s.favicon || '',
        stream: s.url_resolved,
        dur: 0,
        src: 'radio',
        exact: false,
        kind: 'station',
      }));
      if (rows.length) return rows;
      restSource('radio:' + base, 60000);
    } catch { restSource('radio:' + base); }
  }
  return [];
}

/**
 * Genre words for a track we could not find, so radio has something sensible
 * to search for. Deliberately simple: the point is a plausible station, not
 * a classification.
 */
export function radioHint({ title = '', artist = '' } = {}) {
  const s = `${title} ${artist}`.toLowerCase();
  if (/punjab|jatt|gurdas|diljit|sidhu|babbu|karan aujla|ap dhillon|shubh/.test(s)) return 'punjabi';
  if (/qawwal|nusrat|sabri/.test(s)) return 'qawwali';
  if (/ghazal|jagjit|mehdi/.test(s)) return 'ghazal';
  if (/arijit|shreya|atif|sonu nigam|kishore|lata|rafi|bollywood|hindi/.test(s)) return 'bollywood';
  if (/tamil|ilaiyaraaja|rahman/.test(s)) return 'tamil';
  if (/telugu/.test(s)) return 'telugu';
  if (/lofi|chill|study/.test(s)) return 'lofi';
  return 'bollywood';
}


/* ------------------------------------------------------------- TIER G
 * An aggregator of openly-licensed audio. One request reaches three separate
 * platforms at once — a music catalogue, a sound library and a media commons
 * — which is why it is worth having even though tier E already exists: those
 * three fail independently of each other AND of everything above.
 *
 * Verified on 2026-08-28: CORS open, 240 results for "punjabi", 235 for
 * "hindi", 187 for "raga", 103 for "bollywood". The rows are real recordings
 * rather than clips — the first five "bollywood" hits ran 275 to 391 seconds
 * — and 12 of 12 probed URLs answered 206 audio/mpeg.
 *
 * Honest limit: this is openly-licensed music, so it returns "Bollywood
 * Chillout Mix" by an independent producer, not the film recording. It is a
 * late tier for exactly that reason and everything it returns is marked
 * inexact.
 */
const OPENVERSE = 'https://api.openverse.org/v1/audio';

export async function openAudioSearch(q, { limit = 8 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  if (!sourceReady('openverse')) return [];
  try {
    const d = await getJson(`${OPENVERSE}/?q=${enc(query)}&page_size=${limit}`, 15000);
    const rows = (d.results || []).map((t) => ({
      id: t.id,
      title: clean(t.title || ''),
      artist: clean(t.creator || t.provider || ''),
      art: t.thumbnail || '',
      /* duration arrives in milliseconds here, seconds everywhere else */
      dur: Math.round((t.duration || 0) / 1000),
      stream: t.url || '',
      streams: [],
      provider: t.provider || '',
      licence: t.license || '',
      src: 'open-licence',
      exact: false,
      approximate: true,
    })).filter((r) => r.stream && r.title);
    if (!rows.length) restSource('openverse', 60000);
    return rows;
  } catch { restSource('openverse'); return []; }
}

/* ------------------------------------------------------------- TIER H
 * The openly-licensed catalogue that sits behind most of tier G, called
 * directly. Worth listing separately because it survives the aggregator being
 * down, and because its own tag search finds things the aggregator's
 * full-text search misses.
 *
 * Measured quirk, and the reason `fuzzytags` is used rather than `search`:
 * the plain search endpoint returned 3 rows for "indian" and ZERO for "sitar"
 * and "guitar", while fuzzytags returned results for all of them. A search
 * that silently answers nothing for common words is worse than one that
 * errors, so both are tried and whichever answers is used.
 */
const JAMENDO = 'https://api.jamendo.com/v3.0/tracks/';
const JAMENDO_ID = '2c9a11b9';

export async function openCatalogueSearch(q, { limit = 8 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const modes = [`search=${enc(query)}`, `fuzzytags=${enc(query)}`];
  for (const mode of modes) {
    if (!sourceReady('jamendo')) return [];
    try {
      const d = await getJson(
        `${JAMENDO}?client_id=${JAMENDO_ID}&format=json&limit=${limit}&${mode}`, 14000);
      const rows = (d.results || []).map((t) => ({
        id: String(t.id),
        title: clean(t.name || ''),
        artist: clean(t.artist_name || ''),
        art: t.album_image || t.image || '',
        dur: t.duration || 0,
        stream: t.audio || '',
        streams: [],
        licence: t.license_ccurl ? 'creative commons' : '',
        src: 'open-catalogue',
        exact: false,
        approximate: true,
      })).filter((r) => r.stream && r.title);
      if (rows.length) return rows;
    } catch { restSource('jamendo'); return []; }
  }
  return [];
}

/* --------------------------------------------------------------- registry
 * Declared as data so the status panel can show it and the chain can walk it
 * without anyone editing an if-else ladder again.
 */
export const TIERS = [
  { id: 'A', name: 'Primary resolver',   infra: 'vendor API',            relay: true,  exact: true },
  { id: 'B', name: 'Catalogue mirrors',  infra: 'community forks',       relay: false, exact: true },
  { id: 'C', name: 'Catalogue direct',   infra: 'the catalogue itself',  relay: false, exact: true },
  { id: 'D', name: 'Open music network', infra: 'decentralised nodes',   relay: false, exact: false },
  { id: 'E', name: 'Public archive',     infra: 'a public library',      relay: false, exact: false },
  { id: 'G', name: 'Open-licence pool',  infra: 'three commons platforms', relay: false, exact: false },
  { id: 'H', name: 'Open catalogue',     infra: 'a CC music label',      relay: false, exact: false },
  { id: 'F', name: 'Live radio',         infra: 'independent stations',  relay: false, exact: false },
];

export const usingRelay = () => !!proxyBase();
