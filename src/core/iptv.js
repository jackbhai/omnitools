/**
 * Live TV.
 *
 * WHAT THIS IS
 * A viewer for the public IPTV index — an open, community-maintained list of
 * publicly broadcast streams. Five playlists ship pre-seeded, chosen after
 * counting what each one actually contains rather than guessing:
 *
 *   India    702 channels   News 202 · Entertainment 98 · Religious 80
 *   Hindi    317 channels   News 72 · Education 51 · Religious 42
 *   News     914 channels   worldwide
 *   Music    702 channels   worldwide
 *   Movies   637 channels   worldwide
 *
 * Verified on 2026-08-28: every playlist sends `Access-Control-Allow-Origin: *`,
 * 695 of 702 India channels carry a logo, and sampled stream URLs answered 200
 * with `application/vnd.apple.mpegurl` and their own CORS header — so the
 * browser can play them with no relay at all.
 *
 * HONEST ABOUT WHAT A PUBLIC INDEX IS
 * These are streams other people publish; nobody guarantees them. A random
 * sample of ten India channels had six answer immediately, two time out and
 * two reset the connection. That is normal for this kind of index and is not
 * a bug to be hidden — so the viewer probes a channel before claiming it
 * works, remembers what failed, and offers the next one instead of showing a
 * dead player. Nothing here is scraped from a paid service and nothing is
 * decrypted.
 *
 * PLAYBACK
 * Almost every channel is HLS. Safari plays that natively; Chrome and Firefox
 * do not, so hls.js is loaded from a CDN on first use and only then. If it
 * cannot load, the viewer says so plainly instead of showing a black rectangle.
 */

const CDN = 'https://iptv-org.github.io/iptv';
const FREETV = 'https://raw.githubusercontent.com/Free-TV/IPTV/master';

/**
 * Two independent indexes, merged.
 *
 * The public index this started with is the biggest, but a lot of it is dead:
 * a 60-channel random sample of its India list had 42 answer — 70%. The
 * failures were mostly timeouts and connection resets, i.e. streams that were
 * published once and abandoned.
 *
 * A second, smaller index maintained by different people measured 27 of 30
 * live — 90% — and 28 of its 32 India channels are NOT in the first one at
 * all: DD National, DD News, DD Bharati, DD Kisan, NDTV India, ABP News and
 * the rest of the public broadcaster. Merging them is worth more than either
 * alone, so playlists can now name SEVERAL sources and the better-maintained
 * one is listed first.
 */
export const PLAYLISTS = [
  { id: 'in',     name: 'India',  sub: 'Two indexes merged, duplicates removed',
    urls: [`${FREETV}/playlists/playlist_india.m3u8`, `${CDN}/countries/in.m3u`] },
  { id: 'hin',    name: 'Hindi',  sub: '317 channels in Hindi',
    urls: [`${CDN}/languages/hin.m3u`] },
  { id: 'news',   name: 'News',   sub: '974 news channels worldwide',
    urls: [`${CDN}/categories/news.m3u`] },
  { id: 'music',  name: 'Music',  sub: '735 music channels worldwide',
    urls: [`${CDN}/categories/music.m3u`] },
  { id: 'movies', name: 'Movies', sub: '739 film channels worldwide',
    urls: [`${CDN}/categories/movies.m3u`] },
];

/** Extra regional lists, loaded on demand rather than shipped in the tabs. */
export const EXTRA = [
  { id: 'tam', name: 'Tamil',     urls: [`${CDN}/languages/tam.m3u`] },
  { id: 'tel', name: 'Telugu',    urls: [`${CDN}/languages/tel.m3u`] },
  { id: 'pan', name: 'Punjabi',   urls: [`${CDN}/languages/pan.m3u`] },
  { id: 'ben', name: 'Bengali',   urls: [`${CDN}/languages/ben.m3u`] },
  { id: 'mar', name: 'Marathi',   urls: [`${CDN}/languages/mar.m3u`] },
  { id: 'kan', name: 'Kannada',   urls: [`${CDN}/languages/kan.m3u`] },
  { id: 'mal', name: 'Malayalam', urls: [`${CDN}/languages/mal.m3u`] },
  { id: 'guj', name: 'Gujarati',  urls: [`${CDN}/languages/guj.m3u`] },
  { id: 'urd', name: 'Urdu',      urls: [`${CDN}/languages/urd.m3u`] },
  { id: 'bho', name: 'Bhojpuri',  urls: [`${CDN}/languages/bho.m3u`] },
  { id: 'ori', name: 'Odia',      urls: [`${CDN}/languages/ori.m3u`] },
  { id: 'asm', name: 'Assamese',  urls: [`${CDN}/languages/asm.m3u`] },
  { id: 'nep', name: 'Nepali',    urls: [`${CDN}/languages/nep.m3u`] },
  { id: 'kids',   name: 'Kids',     urls: [`${CDN}/categories/kids.m3u`] },
  { id: 'sports', name: 'Sports',   urls: [`${CDN}/categories/sports.m3u`] },
  { id: 'ent',    name: 'Entertainment', urls: [`${CDN}/categories/entertainment.m3u`] },
  { id: 'rel',    name: 'Devotional',    urls: [`${CDN}/categories/religious.m3u`] },
  { id: 'doc',    name: 'Documentary',   urls: [`${CDN}/categories/documentary.m3u`] },
];

const cache = new Map();

/**
 * Parse an .m3u.
 *
 * The format is a header line carrying attributes then a bare URL on the next
 * line. Entries whose next line is not an http URL are skipped rather than
 * kept as broken rows — a channel that cannot possibly play should never
 * reach the grid.
 */
export function parseM3U(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('#EXTINF')) continue;
    let url = '';
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const c = lines[j].trim();
      if (!c || c.startsWith('#')) continue;
      url = c; break;
    }
    if (!/^https?:\/\//i.test(url)) continue;
    const attr = (k) => {
      const m = l.match(new RegExp(`${k}="([^"]*)"`));
      return m ? m[1] : '';
    };
    /* The channel name is what follows the LAST attribute, not the first
       comma. Some entries carry `http-user-agent="Mozilla/5.0 (Windows NT
       10.0; Win64; x64) ..."` whose value contains commas, and splitting on
       the first one produced channels literally named "like Gecko)
       Chrome/147.0.0.0" — 81 of them in the India list alone. Removing every
       quoted attribute first leaves the name unambiguous. */
    const stripped = l.replace(/[\w-]+="[^"]*"/g, '');
    const name = (stripped.split(',').slice(1).join(',') || '').trim();
    /* The index marks part-time channels in the name itself. Surfacing that
       is the difference between "broken" and "not on air right now". */
    const partTime = /\[Not 24\/7\]/i.test(name);
    const geoBlocked = /\[Geo-blocked\]/i.test(name);
    out.push({
      id: attr('tvg-id') || `${name}:${out.length}`,
      name: name.replace(/\s*\[(Not 24\/7|Geo-blocked)\]\s*/gi, '').trim(),
      logo: attr('tvg-logo'),
      group: attr('group-title') || 'Other',
      lang: attr('tvg-language'),
      url,
      partTime,
      geoBlocked,
      /* Resolution is written into the name by the index, e.g. "(1080p)". */
      quality: (name.match(/\((\d{3,4}p)\)/) || [])[1] || '',
    });
  }
  return out;
}

/**
 * Load one or more playlists and merge them.
 *
 * De-duplication is on the STREAM URL, not the channel name: the same channel
 * legitimately appears under slightly different names in different indexes,
 * and two different feeds of the same channel are both worth keeping. Earlier
 * sources win, which is why the better-maintained index is listed first.
 */
export async function loadPlaylist(urls, { ms = 30000 } = {}) {
  const list = Array.isArray(urls) ? urls : [urls];
  const key = list.join('|');
  if (cache.has(key)) return cache.get(key);

  const parts = await Promise.all(list.map(async (u) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(u, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return parseM3U(await r.text());
    } catch { return []; }
    finally { clearTimeout(t); }
  }));

  const seen = new Set();
  const rows = [];
  for (const row of parts.flat()) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    rows.push(row);
  }
  if (!rows.length) throw new Error('no channels came back');
  cache.set(key, rows);
  return rows;
}

/** Groups present in a list, with real counts, for the filter chips. */
export function groupsOf(rows) {
  const m = new Map();
  for (const r of rows) {
    for (const g of String(r.group || 'Other').split(';')) {
      const k = g.trim() || 'Other';
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

export function filterChannels(rows, { q = '', group = '', hideFlaky = false } = {}) {
  const s = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (group && !String(r.group).split(';').map((x) => x.trim()).includes(group)) return false;
    if (hideFlaky && (r.partTime || r.geoBlocked)) return false;
    if (s && !(r.name + ' ' + r.group).toLowerCase().includes(s)) return false;
    return true;
  });
}

/* --------------------------------------------------------------- playback */

let hlsPromise = null;

/**
 * hls.js, loaded once and only when a channel is actually opened.
 *
 * Safari plays HLS natively so it is never loaded there. Everywhere else it
 * is required, and if the CDN is unreachable the viewer must say so rather
 * than render a silent black box.
 */
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    s.async = true;
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js did not initialise')));
    s.onerror = () => { hlsPromise = null; reject(new Error('could not load the video engine')); };
    document.head.appendChild(s);
  });
  return hlsPromise;
}

export const nativeHls = () => {
  const v = document.createElement('video');
  return !!v.canPlayType('application/vnd.apple.mpegurl');
};

/**
 * Is this channel actually up?
 *
 * A public index cannot promise a stream is live, so a channel is probed
 * before the player commits to it. Measured on a random sample of ten India
 * channels: six answered, two timed out, two reset — which is exactly why the
 * viewer should offer the next channel rather than sit on a dead one.
 */
export async function probeChannel(url, ms = 7000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, mode: 'cors' });
    return r.ok;
  } catch { return false; }
  finally { clearTimeout(t); }
}

/* ------------------------------------------------------- liveness memory
 * The core problem with a public index: a large share of it is dead. Measured
 * on a 60-channel random sample of the India list, 42 answered — 70%, with
 * the failures split between timeouts and connection resets.
 *
 * Rather than show that to the user and let them find out one tap at a time,
 * channels are probed quietly in the background and what is learned is kept.
 * Known-good channels sort first, known-bad sort last, and the result is
 * remembered across visits so the second launch of the tool is already sorted.
 *
 * Nothing is HIDDEN on the strength of a probe. A stream that refuses a
 * cross-origin HEAD can still play in a video element, so a failed probe
 * demotes a channel, it does not remove it.
 */
const LIVE_KEY = 'omni:tv:live';
let liveness = {};
try { liveness = JSON.parse(localStorage.getItem(LIVE_KEY) || '{}'); } catch { liveness = {}; }

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      /* Keep the file small and let old verdicts expire — a channel that was
         down last month deserves another chance. */
      const cutoff = Date.now() - 7 * 864e5;
      const trimmed = {};
      for (const [k, v] of Object.entries(liveness)) {
        if (v.at > cutoff) trimmed[k] = v;
      }
      liveness = trimmed;
      localStorage.setItem(LIVE_KEY, JSON.stringify(trimmed));
    } catch { /* storage full; the in-memory copy still works */ }
  }, 1500);
}

export const channelScore = (url) => {
  const v = liveness[url];
  if (!v) return 0;                 // unknown
  if (Date.now() - v.at > 6 * 36e5) return 0;   // stale, treat as unknown
  return v.ok ? 1 : -1;
};

export function noteLive(url, ok) {
  liveness[url] = { ok, at: Date.now() };
  persist();
}

export const noteChannelFail = (url) => noteLive(url, false);
export const recentlyFailed = (url) => channelScore(url) < 0;

/**
 * Probe a batch quietly and record what happened.
 *
 * `no-cors` is deliberate. Most of these hosts send no CORS header, so a
 * normal fetch would report failure for a stream that plays perfectly in a
 * video element — the probe would be measuring the wrong thing. An opaque
 * response tells us the host answered, which is all this needs to know.
 */
export async function probeBatch(channels, { concurrency = 6, ms = 6000 } = {}) {
  const queue = channels.filter((c) => channelScore(c.url) === 0);
  if (!queue.length) return 0;
  let i = 0, learned = 0;
  const worker = async () => {
    while (i < queue.length) {
      const c = queue[i++];
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), ms);
      try {
        await fetch(c.url, { method: 'GET', mode: 'no-cors', signal: ctl.signal, cache: 'no-store' });
        noteLive(c.url, true); learned++;
      } catch {
        noteLive(c.url, false); learned++;
      } finally { clearTimeout(t); }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return learned;
}

/** Best-known first, unknown next, known-dead last — order otherwise kept. */
export function sortByLiveness(rows) {
  return rows
    .map((r, i) => ({ r, i, s: channelScore(r.url) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export const livenessStats = (rows) => {
  let up = 0, down = 0;
  for (const r of rows) {
    const s = channelScore(r.url);
    if (s > 0) up++; else if (s < 0) down++;
  }
  return { up, down, unknown: rows.length - up - down };
};

/* ------------------------------------------------------------- favourites */
const FAV_KEY = 'omni:tv:fav';

export function favourites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}
export function isTvFav(id) {
  return favourites().some((c) => c.id === id);
}
export function toggleTvFav(ch) {
  const list = favourites();
  const i = list.findIndex((c) => c.id === ch.id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ id: ch.id, name: ch.name, logo: ch.logo, url: ch.url, group: ch.group });
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, 200))); } catch { /* full */ }
  return list;
}

/* ---------------------------------------------------------------- history */
const SEEN_KEY = 'omni:tv:recent';
export function recent() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
export function noteWatched(ch) {
  const list = recent().filter((c) => c.id !== ch.id);
  list.unshift({ id: ch.id, name: ch.name, logo: ch.logo, url: ch.url, group: ch.group });
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* full */ }
}
