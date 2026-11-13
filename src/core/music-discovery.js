/**
 * Music Discovery - Best of 9 APIs
 * 
 * Integrates:
 * - Jamendo full (tracks/albums/artists/radios/playlists/tags) - https://developer.jamendo.com/v3.0/docs
 * - Last.fm (track.search, artist.search, track.getSimilar, artist.getTopTracks) - https://www.last.fm/api
 * - Deezer (search, track, album, artist, chart) - https://developers.deezer.com/api
 * - Discogs (database search, release, artist) - https://www.discogs.com/developers
 * - Freesound (text search, sound, packs) - https://freesound.org/docs/api/
 * - Mixcloud (search cloudcast/user/tag, popular, hot) - https://www.mixcloud.com/developers/
 * - Genrenator (random genre, story) - https://binaryjazz.us/genrenator-api/
 * - GaanaAPI (search, song, album) - https://github.com/cyberboysumanjay/GaanaAPI
 * - JioSaavnAPI (search, song, album, playlist, lyrics) - https://github.com/cyberboysumanjay/JioSaavnAPI
 * 
 * All free for non-commercial use, generous limits, CORS via relay
 * No breaking changes to existing music features - only additive
 */

import { proxyBase } from './settings';
import { getJson, sourceReady, restSource } from './sources';
import { JAMENDO_IDS, JAMENDO_API, LASTFM_KEY } from './music-engines.js';

const enc = encodeURIComponent;
const clean = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/* ------------------------------------------------------------- Jamendo Full
 * https://developer.jamendo.com/v3.0/docs - 20+ read methods
 * client_id free, non-commercial free
 * Endpoints: /tracks/, /albums/, /artists/, /radios/, /playlists/, /tags/, /feeds/
 */

const JAMENDO_ID = JAMENDO_IDS[0];
const JAMENDO_BASE = JAMENDO_API;

async function jamendoTracks(q, { limit = 10, order = 'popularity_total' } = {}) {
  if (!sourceReady('jamendo-tracks')) return [];
  try {
    const d = await getJson(`${JAMENDO_BASE}/tracks/?client_id=${JAMENDO_ID}&format=json&limit=${limit}&search=${enc(q)}&include=musicinfo&audioformat=mp32&order=${order}`, 12000);
    return (d.results || []).map(t => ({
      id: `jamendo-track:${t.id}`,
      title: clean(t.name),
      artist: clean(t.artist_name),
      album: clean(t.album_name),
      art: t.album_image || t.image || '',
      dur: t.duration || 0,
      stream: t.audio || '',
      streams: t.audio ? [{ q: '320k', url: t.audio }] : [],
      licence: t.license_ccurl || 'CC',
      tags: t.tags || [],
      src: 'jamendo-tracks',
      exact: false,
      approximate: true,
    })).filter(r => r.stream && r.title);
  } catch { restSource('jamendo-tracks'); return []; }
}



async function jamendoRadios(q = '', { limit = 8 } = {}) {
  if (!sourceReady('jamendo-radios')) return [];
  try {
    const url = q ? `${JAMENDO_BASE}/radios/?client_id=${JAMENDO_ID}&format=json&limit=${limit}&search=${enc(q)}` : `${JAMENDO_BASE}/radios/?client_id=${JAMENDO_ID}&format=json&limit=${limit}`;
    const d = await getJson(url, 10000);
    return (d.results || []).map(r => ({
      id: `jamendo-radio:${r.id}`,
      title: clean(r.dispname || r.name),
      artist: 'Jamendo Radio',
      art: r.image || '',
      stream: r.stream || `https://prod-1.storage.jamendo.com/?trackid=${r.id}&format=mp32&from=app-${JAMENDO_ID}`,
      src: 'jamendo-radios',
      kind: 'station',
      exact: false,
    })).filter(r => r.title);
  } catch { restSource('jamendo-radios'); return []; }
}


/* ------------------------------------------------------------- Last.fm
 * https://www.last.fm/api - free API key, generous limits
 * Methods: track.search, artist.search, album.search, track.getSimilar, artist.getTopTracks, chart.getTopTracks
 * No stream, but rich metadata: listeners, playcount, wiki, tags, similar
 * Use as query generator + metadata enrichment
 */

// LASTFM_KEY comes from music-engines.js (public demo key, fallback via relay)

async function lastFmTrackSearch(q, { limit = 10 } = {}) {
  if (!sourceReady('lastfm-track')) return [];
  try {
    const b = proxyBase();
    const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${enc(q)}&api_key=${LASTFM_KEY}&format=json&limit=${limit}`;
    const fetchUrl = b ? `${b}/?url=${enc(url)}` : url;
    const d = await getJson(fetchUrl, 10000);
    const tracks = d.results?.trackmatches?.track || [];
    const arr = Array.isArray(tracks) ? tracks : [tracks];
    return arr.slice(0, limit).map((t, i) => ({
      id: `lastfm-track:${t.mbid || i}`,
      title: clean(t.name || ''),
      artist: clean(t.artist || ''),
      art: Array.isArray(t.image) ? (t.image[t.image.length-1]?.['#text'] || '') : '',
      listeners: +(t.listeners || 0),
      url: t.url || '',
      src: 'lastfm-track',
      metaOnly: true,
      exact: false,
    })).filter(r => r.title);
  } catch { restSource('lastfm-track', 60000); return []; }
}




/* ------------------------------------------------------------- Deezer Full
 * https://developers.deezer.com/api - free, most read endpoints no auth
 * Endpoints: /search, /track/:id, /album/:id, /artist/:id, /chart, /genre
 * Returns 30s preview: preview field is mp3 url, CORS via relay
 */

async function deezerFullSearch(q, { limit = 10 } = {}) {
  if (!sourceReady('deezer-full')) return [];
  try {
    const d = await getJson(`https://api.deezer.com/search?q=${enc(q)}&limit=${limit}`, 12000);
    return (d.data || []).slice(0, limit).map(t => ({
      id: `deezer-full:${t.id}`,
      title: clean(t.title || ''),
      artist: clean(t.artist?.name || ''),
      album: clean(t.album?.title || ''),
      art: t.album?.cover_medium || t.album?.cover || '',
      dur: t.duration || 0,
      preview: t.preview || '',
      stream: t.preview || '',
      streams: t.preview ? [{ q: 'preview', url: t.preview }] : [],
      rank: t.rank || 0,
      src: 'deezer-full',
      exact: false,
      approximate: true,
      isPreview: true,
    })).filter(r => r.title && r.stream);
  } catch { restSource('deezer-full', 60000); return []; }
}



/* ------------------------------------------------------------- Discogs Full
 * https://www.discogs.com/developers - free with API key, unauth 25/min with User-Agent
 * Endpoints: /database/search, /releases/:id, /artists/:id, /labels/:id
 * Rich metadata: year, genre, style, tracklist, cover_image, community ratings
 */

async function discogsFullSearch(q, { limit = 8, type = 'release' } = {}) {
  if (!sourceReady('discogs-full')) return [];
  try {
    const b = proxyBase();
    const url = `https://api.discogs.com/database/search?q=${enc(q)}&type=${type}&per_page=${limit}`;
    const fetchUrl = b ? `${b}/?url=${enc(url)}` : url;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'OmniTools/1.0 +https://jackbhai.github.io/omnitools/',
        'Accept': 'application/vnd.discogs.v2.json',
      },
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return (d.results || []).slice(0, limit).map((x, i) => ({
      id: `discogs-full:${x.id || i}`,
      title: clean(x.title?.split(' - ').slice(1).join(' - ') || x.title || ''),
      artist: clean(x.title?.split(' - ')[0] || ''),
      art: x.cover_image || x.thumb || '',
      year: x.year ? String(x.year) : '',
      genre: (x.genre || []).join(', '),
      style: (x.style || []).join(', '),
      country: x.country || '',
      src: 'discogs-full',
      metaOnly: true,
      exact: false,
    })).filter(r => r.title);
  } catch { restSource('discogs-full', 60000); return []; }
}


/* ------------------------------------------------------------- Freesound Full
 * https://freesound.org/docs/api/ - free, community sound library
 * Endpoints: /apiv2/search/text/, /apiv2/sounds/:id/, /apiv2/packs/:id/
 * Fields: previews (hq mp3), images (waveform, spectral), tags, license
 * Use for sound effects, loops, but also music snippets
 */


/* ------------------------------------------------------------- Mixcloud Full
 * https://www.mixcloud.com/developers/ - free, public endpoints open, CORS enabled
 * Endpoints: /search/?q=&type=cloudcast|user|tag, /popular/, /new/, /:user/cloudcasts/
 * Returns mixes, DJ sets, radio shows - often 1-2 hours full
 */

async function mixcloudFullSearch(q, { limit = 10, type = 'cloudcast' } = {}) {
  if (!sourceReady('mixcloud-full')) return [];
  try {
    const url = `https://api.mixcloud.com/search/?q=${enc(q)}&type=${type}&limit=${limit}`;
    const d = await getJson(url, 12000);
    return (d.data || []).slice(0, limit).map(x => ({
      id: `mixcloud-full:${(x.key || '').replace(/\//g, ':')}`,
      title: clean(x.name || ''),
      artist: clean(x.user?.name || x.user?.username || ''),
      art: x.pictures?.large || x.pictures?.medium || x.pictures?.extra_large || '',
      dur: Math.round((x.audio_length || 0)),
      stream: '', // no direct mp3, but widget playable
      mixcloudUrl: x.url || '',
      mixcloudKey: x.key || '',
      playCount: +(x.play_count || 0),
      favoriteCount: +(x.favorite_count || 0),
      tags: (x.tags || []).map(t => t.name).slice(0,5),
      src: 'mixcloud-full',
      exact: false,
      approximate: true,
      isMix: true,
    })).filter(r => r.title);
  } catch { restSource('mixcloud-full', 60000); return []; }
}



/* ------------------------------------------------------------- Genrenator Full
 * https://binaryjazz.us/genrenator-api/ - free, no key needed
 * Endpoints: /wp-json/genrenator/v1/genre/, /genre/10/, /story/, /story/10/
 * Fun genre-name generator + stories, enhances radio hints + discovery UX
 */

export async function genrenatorGenres({ count = 5 } = {}) {
  if (!sourceReady('genrenator-genres')) return [];
  try {
    const url = count > 1 ? `https://binaryjazz.us/wp-json/genrenator/v1/genre/${count}/` : `https://binaryjazz.us/wp-json/genrenator/v1/genre/`;
    const d = await getJson(url, 8000);
    const genres = Array.isArray(d) ? d : [d];
    return genres.slice(0, count).map((g, i) => ({
      id: `genrenator-genre:${i}:${g.slice(0,20)}`,
      title: clean(g),
      artist: 'Random genre',
      genre: clean(g),
      art: '',
      src: 'genrenator-genre',
      isGenre: true,
      exact: false,
    })).filter(r => r.title);
  } catch { restSource('genrenator-genres', 60000); return []; }
}


/* ------------------------------------------------------------- Gaana Full
 * https://github.com/cyberboysumanjay/GaanaAPI - unofficial Python Flask
 * Endpoints: /search, /song, /album, /artist, /playlist (via mirrors)
 * We have 3 mirrors + direct web API via proxy
 * Gaana web API: https://gaana.com/apiv2?seokey=&type=search&query= (via relay)
 */

const GAANA_MIRRORS = [
  'https://gaana-api-fawn.vercel.app', // verified 2026-08-30 OK 10 results Babbu Maan/Ishq Murshid stream True
  // gaana-api.vercel.app 404 removed 2026-08-30
];

async function gaanaFullSearch(q, { limit = 10 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  for (const base of GAANA_MIRRORS) {
    if (!sourceReady('gaana-full:' + base)) continue;
    try {
      const d = await getJson(`${base}/search?q=${enc(query)}`, 12000);
      const data = Array.isArray(d?.data) ? d.data : d.results || [];
      const rows = data.slice(0, limit).map((t, i) => {
        const m = t.music || t;
        const ladder = [m.very_high, m.high, m.medium, m.low, m.url, m.link].filter(Boolean);
        const secs = String(t.duration || m.duration || '').split(':').reduce((a,b)=>a*60+(+b||0),0) || +(m.duration || 0);
        return {
          id: `gaana-full:${i}:${(t.title || m.title || '').slice(0,24)}`,
          title: clean(t.title || m.title || t.name || ''),
          artist: clean(t.artists || m.artists || t.artist || ''),
          album: clean(t.album || m.album || ''),
          art: t.thumbnail?.large || t.thumbnail?.medium || m.artwork || m.image || '',
          dur: secs,
          lang: t.language || m.language || '',
          stream: ladder[0] || '',
          streams: ladder.map((url, n) => ({ q: ['very high','high','medium','low'][n] || n+'k', url })),
          hlsStream: true,
          src: 'gaana-full',
          exact: true,
        };
      }).filter(r => r.stream && r.title);
      if (rows.length) return rows;
      restSource('gaana-full:' + base, 60000);
    } catch { restSource('gaana-full:' + base, 60000); }
  }
  return [];
}

/* ------------------------------------------------------------- JioSaavn Full
 * https://github.com/cyberboysumanjay/JioSaavnAPI - unofficial Python
 * Endpoints: /search/songs, /search/albums, /search/playlists, /song, /album, /playlist, /lyrics
 * We already have 16 mirrors, but add cyberboysumanjay original + sumit.co
 */

const SAavn_MIRRORS_EXTRA = [
  'https://saavn.sumit.co/api/search/songs?query=',
  'https://jiosaavn-api-codyandersan.vercel.app/search/songs?query=',
  'https://saavn-api-eight.vercel.app/api/search/songs?query=',
  'https://saavn-api-sable.vercel.app/api/search/songs?query=',
  'https://jiosaavn-api-ashen.vercel.app/api/search/songs?query=',
];

async function saavnFullSearch(q, { limit = 10 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  for (let i = 0; i < SAavn_MIRRORS_EXTRA.length; i += 2) {
    const wave = SAavn_MIRRORS_EXTRA.slice(i, i+2);
    const tries = wave.map(async (entry) => {
      if (!sourceReady('saavn-full:' + entry)) throw new Error('cooldown');
      try {
        const d = await getJson(`${entry}${enc(query)}&limit=${limit}`, 10000);
        const data = d?.data || d?.results || d;
        const rows = (Array.isArray(data) ? data : data.results || []).slice(0, limit).map((x) => {
          const dl = Array.isArray(x.downloadUrl) ? x.downloadUrl : [];
          const best = dl.length ? (dl[dl.length-1].link || dl[dl.length-1].url || '') : (x.url || x.link || '');
          const artists = x.primaryArtists || (Array.isArray(x.artists?.primary) ? x.artists.primary.map(a=>a.name).join(', ') : '') || x.subtitle || '';
          return {
            id: `saavn-full:${x.id || Math.random()}`,
            title: clean(x.name || x.title || x.song || ''),
            artist: clean(artists),
            album: clean(typeof x.album === 'string' ? x.album : x.album?.name || ''),
            art: Array.isArray(x.image) ? (x.image[x.image.length-1]?.link || '') : (x.image || ''),
            dur: +(x.duration || 0),
            lang: x.language || '',
            stream: best,
            streams: dl.map(q => ({ q: q.quality, url: q.link || q.url })).filter(s=>s.url),
            src: 'saavn-full',
            exact: true,
          };
        }).filter(r => r.stream && r.title);
        if (!rows.length) throw new Error('no rows');
        return rows;
      } catch (e) { restSource('saavn-full:' + entry, 60000); throw e; }
    });
    try { const won = await Promise.any(tries); if (won?.length) return won; } catch {}
  }
  return [];
}

/* ------------------------------------------------------------- Unified Discovery Search
 * Walks all discovery APIs, returns combined results with source tags
 * No breaking changes - all additive, all with try/catch
 */

export async function discoverySearch(q, { limit = 10 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  
  const all = [];
  
  // Exact tiers first (Gaana, Saavn extra)
  try { const r = await gaanaFullSearch(query, { limit: 6 }); if (r.length) all.push(...r); } catch {}
  try { const r = await saavnFullSearch(query, { limit: 6 }); if (r.length) all.push(...r); } catch {}
  
  // Preview tiers (Deezer full, chart)
  try { const r = await deezerFullSearch(query, { limit: 6 }); if (r.length) all.push(...r); } catch {}
  
  // Open CC full (Jamendo tracks + albums + radios)
  try { const r = await jamendoTracks(query, { limit: 6 }); if (r.length) all.push(...r); } catch {}
  try { const r = await jamendoRadios(query, { limit: 4 }); if (r.length) all.push(...r); } catch {}
  
  // DJ mixes (Mixcloud)
  try { const r = await mixcloudFullSearch(query, { limit: 6 }); if (r.length) all.push(...r); } catch {}
  
  // Metadata only (Last.fm, Discogs) - for enrichment, not playback
  // These return metaOnly:true, caller can use to generate queries for other tiers
  
  return all.slice(0, limit);
}

export async function discoveryMetadata(q, { limit = 8 } = {}) {
  const query = String(q || '').trim();
  if (!query) return { lastfm: [], discogs: [], genres: [] };
  
  const [lastfm, discogs, genres] = await Promise.allSettled([
    lastFmTrackSearch(query, { limit: 5 }),
    discogsFullSearch(query, { limit: 5 }),
    genrenatorGenres({ count: 5 }),
  ]);
  
  return {
    lastfm: lastfm.status === 'fulfilled' ? lastfm.value : [],
    discogs: discogs.status === 'fulfilled' ? discogs.value : [],
    genres: genres.status === 'fulfilled' ? genres.value : [],
  };
}


