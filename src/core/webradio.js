/**
 * Internet radio — a global station directory, keyless and CORS-open.
 *
 * Four mirror hosts carry the same directory; the engine walks them in
 * order and benches any that stop answering, so a dead mirror costs one
 * timeout, not the tool. Every mirror was verified live from this app's
 * origin (200 + Access-Control-Allow-Origin: *).
 *
 * Mixed content is the one real trap: a large share of stations still
 * broadcast over plain http, which a secure page may not play directly.
 * Secure streams play direct; insecure ones are routed through the app's
 * own relay (the same one TV uses), so they play too.
 */
import { jget } from './engine';
import { proxyBase, BUILTIN_PROXY } from './settings';

const HOSTS = [
  'de1.api.radio-browser.info',
  'de2.api.radio-browser.info',
  'nl1.api.radio-browser.info',
  'at1.api.radio-browser.info',
];

const shape = (rows) => (rows || [])
  /* HLS (.m3u8) stations are left out: a plain audio element cannot play
     them everywhere, and this directory is overwhelmingly MP3/AAC. */
  .filter((s) => s && (s.url_resolved || s.url) && !(s.url_resolved || s.url).includes('.m3u8'))
  .map((s) => ({
    uuid: s.stationuuid,
    name: (s.name || 'Unknown station').trim(),
    url: s.url_resolved || s.url,
    codec: (s.codec || '').toUpperCase(),
    bitrate: s.bitrate || 0,
    country: s.country || '',
    language: s.language || '',
    tags: (s.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
    favicon: s.favicon || '',
    votes: s.votes || 0,
  }))
  .filter((s) => s.url && s.name);

function pathFor({ mode = 'top', value = '', limit = 60 }) {
  const lim = Math.min(100, Math.max(5, limit || 60));
  const base = '&hidebroken=true&order=votes&reverse=true';
  switch (mode) {
    case 'country': return `/json/stations/bycountry/${encodeURIComponent(value)}?limit=${lim}${base}`;
    case 'language': return `/json/stations/bylanguage/${encodeURIComponent(value)}?limit=${lim}${base}`;
    case 'tag': return `/json/stations/bytag/${encodeURIComponent(value)}?limit=${lim}${base}`;
    case 'search': return `/json/stations/search?name=${encodeURIComponent(value)}&limit=${lim}${base}`;
    default: return `/json/stations/topvote/${lim}`;
  }
}

/* One pool leg per mirror host — labels stay generic on the surface. */
export const radioPool = HOSTS.map((h, i) => ({
  id: `radio-dir-${i + 1}`,
  label: 'Station directory',
  async run(params) {
    const d = await jget(`https://${h}${pathFor(params)}`, { ms: 10000 });
    const out = shape(d);
    if (!out.length) throw new Error('empty');
    return out;
  },
}));

/** The playable URL for a station: direct when secure, relayed when not. */
export function playableUrl(url) {
  if (!url) return '';
  if (url.startsWith('https:')) return url;
  const base = proxyBase() || BUILTIN_PROXY;
  return `${base}/?url=${encodeURIComponent(url)}`;
}

/* ------------------------------------------------------------ favourites */
const FKEY = 'omni:radio:fav';

export function radioFavs() {
  try { return JSON.parse(localStorage.getItem(FKEY) || '[]'); } catch { return []; }
}

export function toggleRadioFav(station) {
  const cur = radioFavs();
  const has = cur.some((s) => s.uuid === station.uuid);
  const nxt = has ? cur.filter((s) => s.uuid !== station.uuid)
    : [{ ...station }, ...cur].slice(0, 100);
  try { localStorage.setItem(FKEY, JSON.stringify(nxt)); } catch { /* storage off */ }
  return nxt;
}

export const isRadioFav = (uuid, favs) => (favs || radioFavs()).some((s) => s.uuid === uuid);
