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

/** The five that ship. Counts are measured, not estimated. */
export const PLAYLISTS = [
  { id: 'in',     name: 'India',  sub: '702 channels · news, films, devotional',
    url: `${CDN}/countries/in.m3u`,      n: 702 },
  { id: 'hin',    name: 'Hindi',  sub: '317 channels in Hindi',
    url: `${CDN}/languages/hin.m3u`,     n: 317 },
  { id: 'news',   name: 'News',   sub: '914 news channels worldwide',
    url: `${CDN}/categories/news.m3u`,   n: 914 },
  { id: 'music',  name: 'Music',  sub: '702 music channels worldwide',
    url: `${CDN}/categories/music.m3u`,  n: 702 },
  { id: 'movies', name: 'Movies', sub: '637 film channels worldwide',
    url: `${CDN}/categories/movies.m3u`, n: 637 },
];

/** Extra regional lists, loaded on demand rather than shipped in the tabs. */
export const EXTRA = [
  { id: 'tam', name: 'Tamil',   url: `${CDN}/languages/tam.m3u` },
  { id: 'tel', name: 'Telugu',  url: `${CDN}/languages/tel.m3u` },
  { id: 'pan', name: 'Punjabi', url: `${CDN}/languages/pan.m3u` },
  { id: 'ben', name: 'Bengali', url: `${CDN}/languages/ben.m3u` },
  { id: 'mar', name: 'Marathi', url: `${CDN}/languages/mar.m3u` },
  { id: 'kan', name: 'Kannada', url: `${CDN}/languages/kan.m3u` },
  { id: 'mal', name: 'Malayalam', url: `${CDN}/languages/mal.m3u` },
  { id: 'guj', name: 'Gujarati', url: `${CDN}/languages/guj.m3u` },
  { id: 'urd', name: 'Urdu',    url: `${CDN}/languages/urd.m3u` },
  { id: 'kids', name: 'Kids',   url: `${CDN}/categories/kids.m3u` },
  { id: 'sports', name: 'Sports', url: `${CDN}/categories/sports.m3u` },
  { id: 'doc',  name: 'Documentary', url: `${CDN}/categories/documentary.m3u` },
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

export async function loadPlaylist(url, { ms = 30000 } = {}) {
  if (cache.has(url)) return cache.get(url);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = parseM3U(await r.text());
    if (!rows.length) throw new Error('playlist had no channels');
    cache.set(url, rows);
    return rows;
  } finally { clearTimeout(t); }
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

/* Channels that failed recently are pushed down the list rather than removed,
   because a stream that was down an hour ago is often back. */
const FAILED = new Map();
export const noteChannelFail = (id) => FAILED.set(id, Date.now());
export const recentlyFailed = (id) => (Date.now() - (FAILED.get(id) || 0)) < 10 * 60000;

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
