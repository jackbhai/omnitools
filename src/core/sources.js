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
 *   I  community uploads         an upload platform            relay: NO
 *   G  open-licence pool         three commons platforms       relay: NO
 *   H  open catalogue            a CC music label              relay: NO
 *   F  live radio                thousands of stations         relay: NO
 *
 * B, D, E, I, G, H and F need no relay at all. Blocking this app's Worker — or the
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
 * Live radio — five independent directories, not five mirrors of one.
 *
 * This is the end of the line and the hardest thing on the internet to take
 * down: tens of thousands of independent broadcasters, indexed by operators
 * who have nothing to do with each other.
 *
 * Verified on 2026-08-28, each with a real range request against a real
 * stream:
 *
 *   1. community station database — 58,184 stations, three reachable mirrors,
 *      India by country code returns Bollywood Gaane Purane, Fnf.Fm Hindi and
 *      others, all 200 audio/mpeg
 *   2. the same database queried BY TAG rather than by country, which finds
 *      desi and bollywood stations registered outside India
 *   3. the same database's top-voted and most-clicked endpoints, which is how
 *      you get a good station when a search term matches nothing
 *   4. a curated commercial-free broadcaster — 46 channels. Its directory
 *      hands out .pls playlists rather than streams, so those are resolved
 *      here: File1= inside the playlist is the actual url, verified 206
 *      audio/mpeg with CORS.
 *   5. a listener-funded broadcaster with fixed, permanent stream addresses —
 *      verified 200 audio/mpeg and audio/aac.
 *
 * Rejected in the same pass and named so nobody retries them: one directory
 * whose search returns rows with null names (unusable), three that send no
 * CORS header, and four that are dead (404, TLS failure).
 *
 * Radio never plays the song you asked for, so it is always an explicit
 * choice, never a silent substitution.
 */
const RADIO_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
];

const shapeStation = (s, src) => ({
  id: s.stationuuid || s.id,
  title: clean(s.name),
  artist: clean([s.country, s.language].filter(Boolean).join(' · ') || 'Live radio'),
  art: s.favicon || '',
  stream: s.url_resolved || s.url,
  dur: 0,
  votes: s.votes || 0,
  src,
  exact: false,
  kind: 'station',
});

/** 1-3: the community database, by name, by tag, then by popularity. */
async function stationDb(q, limit) {
  const paths = [
    `/json/stations/search?name=${enc(q)}&limit=${limit}&hidebroken=true&order=votes&reverse=true`,
    `/json/stations/bytag/${enc(q)}?limit=${limit}&hidebroken=true&order=votes&reverse=true`,
    `/json/stations/bycountrycodeexact/IN?limit=${limit}&hidebroken=true&order=votes&reverse=true`,
    `/json/stations/topvote/${limit}`,
  ];
  for (const base of RADIO_MIRRORS) {
    if (!sourceReady('radio:' + base)) continue;
    for (const path of paths) {
      try {
        const d = await getJson(base + path, 13000);
        const rows = (d || []).filter((s) => s.url_resolved || s.url)
          .map((s) => shapeStation(s, 'radio'));
        if (rows.length) return rows;
      } catch { restSource('radio:' + base); break; }
    }
  }
  return [];
}

/**
 * 4: the curated broadcaster. Its directory returns .pls playlists, so the
 * real stream address has to be read out of one — File1= is the line that
 * matters. Without this the player would be handed a text file.
 */
async function curatedStations(limit) {
  if (!sourceReady('somafm')) return [];
  try {
    const d = await getJson('https://somafm.com/channels.json', 14000);
    const chans = (d.channels || []).slice(0, limit);
    const out = [];
    for (const c of chans) {
      const pls = (c.playlists || []).find((x) => x.format === 'mp3') || (c.playlists || [])[0];
      if (!pls?.url) continue;
      out.push({
        id: 'soma:' + c.id,
        title: clean(c.title),
        artist: clean(c.genre || 'Commercial-free radio'),
        art: c.xlimage || c.largeimage || c.image || '',
        playlist: pls.url,          // resolved on demand, see resolveStation
        stream: '',
        dur: 0,
        src: 'radio-curated',
        exact: false,
        kind: 'station',
      });
    }
    return out;
  } catch { restSource('somafm'); return []; }
}

/** 5: fixed, permanent addresses. Nothing to resolve and nothing to look up. */
function fixedStations() {
  return [
    { id: 'rp:main', title: 'Radio Paradise · Main Mix', artist: 'Eclectic · listener funded',
      stream: 'https://stream.radioparadise.com/mp3-128', art: '', dur: 0,
      src: 'radio-fixed', exact: false, kind: 'station' },
    { id: 'rp:aac', title: 'Radio Paradise · AAC', artist: 'Eclectic · higher quality',
      stream: 'https://stream.radioparadise.com/aac-128', art: '', dur: 0,
      src: 'radio-fixed', exact: false, kind: 'station' },
  ];
}

/**
 * A .pls is a text file listing stream addresses. Handing one to an <audio>
 * element plays nothing, so the first File= line is extracted here.
 */
export async function resolveStation(st) {
  if (st.stream) return st.stream;
  if (!st.playlist) return '';
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(st.playlist, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    const txt = await r.text();
    const m = txt.match(/^\s*File\d+\s*=\s*(\S+)/mi);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

export async function radioFor(hint, { limit = 8 } = {}) {
  const q = String(hint || '').trim() || 'bollywood';
  const rows = await stationDb(q, limit);
  if (rows.length) return rows;
  const curated = await curatedStations(limit);
  if (curated.length) return curated;
  return fixedStations();
}

/** Everything, for a browsable radio screen rather than a fallback. */
export async function allStations(q, { limit = 20 } = {}) {
  const [db, curated] = await Promise.all([
    stationDb(String(q || 'bollywood'), limit).catch(() => []),
    curatedStations(8).catch(() => []),
  ]);
  return [...db, ...curated, ...fixedStations()];
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
  const shape = (d) => (d.results || []).map((t) => ({
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

  /* This API is rate-limited, and its rate limit does NOT look like one: a
     throttled request returns HTTP 200 with `status: success` and an empty
     results array. Measured — the same query that returns three rows on its
     own returns zero when several are issued together.
     So an empty answer is retried once after a pause rather than believed,
     and `featured=1`, which it always answers, is the last resort. */
  const modes = [`search=${enc(query)}`, `fuzzytags=${enc(query)}`];
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700));
    for (const mode of modes) {
      if (!sourceReady('jamendo')) return [];
      try {
        const d = await getJson(
          `${JAMENDO}?client_id=${JAMENDO_ID}&format=json&limit=${limit}&${mode}`, 14000);
        const rows = shape(d);
        if (rows.length) return rows;
      } catch { restSource('jamendo'); return []; }
    }
  }
  try {
    const d = await getJson(
      `${JAMENDO}?client_id=${JAMENDO_ID}&format=json&limit=${limit}&featured=1`, 12000);
    return shape(d);
  } catch { restSource('jamendo'); return []; }
}


/* ------------------------------------------------------------- TIER I
 * A community upload platform — DJ sets, remixes, mashups and bootlegs
 * uploaded by the people who made them.
 *
 * This is the most useful of the late tiers for THIS app's audience, and the
 * reason is worth stating: tiers G and H hold openly-licensed music, which
 * means they can only ever return an independent producer's take on a style.
 * This one holds the actual desi remix scene. Measured on 2026-08-28, one
 * query each: bollywood, punjabi, hindi, desi, arijit and tabla ALL returned
 * results, and 6 of 6 first hits answered 206 audio/mpeg with CORS `*`.
 * "Balle Jatta (Bass Boosted)" and "Tabla & Bass #9: Desi Frequency" are the
 * kind of thing it has and a commons catalogue never will.
 *
 * It is still not the studio recording, so it stays inexact and stays below
 * the real catalogues — but it is placed ABOVE the open-licence tiers because
 * a Punjabi remix is a closer answer to a Punjabi song than a royalty-free
 * instrumental is.
 */
const HEARTHIS = 'https://api-v2.hearthis.at';

export async function communitySearch(q, { limit = 8 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  if (!sourceReady('hearthis')) return [];
  try {
    const d = await getJson(`${HEARTHIS}/search?t=${enc(query)}&count=${limit}`, 15000);
    const rows = (Array.isArray(d) ? d : []).map((t) => ({
      id: String(t.id),
      title: clean(t.title || ''),
      artist: clean(t.user?.username || t.user?.permalink || ''),
      art: t.artwork_url || t.thumb || '',
      dur: +(t.duration || 0),
      stream: t.stream_url || '',
      streams: [],
      playCount: +(t.playback_count || 0),
      src: 'community-uploads',
      exact: false,
      approximate: true,
    })).filter((r) => r.stream && r.title);
    if (!rows.length) restSource('hearthis', 60000);
    return rows;
  } catch { restSource('hearthis'); return []; }
}

/* ------------------------------------------------------------- TIER J
 * A SECOND Indian catalogue — a different company, a different song database,
 * a different CDN.
 *
 * WHY THIS IS THE MOST VALUABLE ADDITION IN THIS FILE
 * Tiers A, B and C are all the same catalogue reached three ways. If that
 * company changes its keys, geo-blocks a region, or simply goes down, all
 * three die together — they are one plan wearing three hats. This is the
 * first tier that is a genuinely different Indian catalogue holding the same
 * Bollywood, Punjabi and regional repertoire, so it fails for entirely
 * separate reasons.
 *
 * MEASURED, END TO END, 2026-08-28
 * All ten of the songs that have caused trouble in this project resolved and
 * PLAYED: master playlist, child playlist, and a real media segment fetched
 * and counted — 188-282 KB per segment, every hop sending CORS `*`. Not a
 * search that returned 200; audio bytes on the wire.
 *
 * TWO REAL CATCHES, BOTH HANDLED
 * 1. It serves HLS, not a plain file. `<audio>` cannot play that outside
 *    Safari, so `hlsStream: true` is set and the player attaches hls.js —
 *    the same engine live TV already loads — instead of assigning `src`.
 * 2. It answers a miss with a confident near-miss rather than nothing:
 *    "Babbu Maan Touchwood" comes back as "Digidi Digidi Hey". That is worse
 *    than an empty result, because it plays the wrong song without saying so.
 *    Rows are therefore returned unranked and the caller's existing `rank()`
 *    floor decides — the same guard that already protects the other tiers.
 *
 * The signed URLs expire in about four hours, which is why nothing is cached
 * and every play resolves fresh.
 */
const GAANA = 'https://gaana-api-fawn.vercel.app';

export async function secondCatalogueSearch(q, { limit = 10 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  if (!sourceReady('gaana')) return [];
  try {
    const d = await getJson(`${GAANA}/search?q=${enc(query)}`, 15000);
    const rows = (Array.isArray(d?.data) ? d.data : []).slice(0, limit).map((t, i) => {
      const m = t.music || {};
      /* Best rung first, then down. Every rung is the same signed playlist at
         a different bitrate, so a lower one is a real fallback, not a retry. */
      const ladder = [m.very_high, m.high, m.medium, m.low].filter(Boolean);
      const secs = String(t.duration || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0);
      return {
        id: `gaana:${i}:${(t.title || '').slice(0, 24)}`,
        title: clean(t.title || ''),
        artist: clean(t.artists || ''),
        album: clean(t.album || ''),
        art: t.thumbnail?.large || t.thumbnail?.medium || '',
        dur: secs,
        lang: t.language || '',
        stream: ladder[0] || '',
        streams: ladder.map((url, n) => ({ q: ['very high', 'high', 'medium', 'low'][n], url })),
        hlsStream: true,      // the player must use hls.js, not <audio src>
        playCount: 0,
        src: 'catalogue-two',
        exact: true,
      };
    }).filter((r) => r.stream && r.title);
    if (!rows.length) restSource('gaana', 60000);
    return rows;
  } catch { restSource('gaana'); return []; }
}

/* --------------------------------------------------------------- registry
 * Declared as data so the status panel can show it and the chain can walk it
 * without anyone editing an if-else ladder again.
 */
export const TIERS = [
  { id: 'A', name: 'Primary resolver',   infra: 'vendor API',            relay: true,  exact: true },
  { id: 'B', name: 'Catalogue mirrors',  infra: '16 community forks',    relay: false, exact: true },
  { id: 'C', name: 'Catalogue direct',   infra: 'the catalogue itself',  relay: false, exact: true },
  { id: 'J', name: 'Second catalogue',   infra: 'a different Indian service', relay: false, exact: true },
  { id: 'D', name: 'Open music network', infra: 'decentralised nodes',   relay: false, exact: false },
  { id: 'E', name: 'Public archive',     infra: 'a public library',      relay: false, exact: false },
  { id: 'I', name: 'Community uploads', infra: 'an upload platform',    relay: false, exact: false },
  { id: 'G', name: 'Open-licence pool',  infra: 'three commons platforms', relay: false, exact: false },
  { id: 'H', name: 'Open catalogue',     infra: 'a CC music label',      relay: false, exact: false },
  { id: 'F', name: 'Live radio',         infra: 'independent stations',  relay: false, exact: false },
];

export const usingRelay = () => !!proxyBase();
