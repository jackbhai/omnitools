/**
 * YouTube-backed music search + stream resolution.
 *
 * WHY: Audius has almost no Punjabi/Pakistani catalogue — verified live:
 *   "touchwood babbu maan" → 0 results,  "ishq murshid" → 0 results.
 * The same queries on YouTube return the exact tracks. So search runs through
 * Piped (an open-source YouTube front-end API), and playback is resolved to a
 * direct audio stream.
 *
 * Verified from a github.io Origin:
 *   api.piped.private.coffee/search  → 200, CORS: *, 20 items
 *   ahm7xmakki.com/api/alldl         → 200, returns audioUrl
 *   c.ymcdn.org (the audio CDN)      → 206 Partial Content, audio/mp4, CORS: *
 * 206 + CORS means the <audio> element can stream AND seek it.
 */
import { jget } from './engine';

/* Multiple Piped mirrors — if one dies the pool moves on. */
const PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
];

const secs = (t) => (typeof t === 'number' && t > 0 ? t : null);

function mapItems(items) {
  return (items || [])
    .filter((v) => v.url && (v.type === 'stream' || v.url.includes('watch')))
    .map((v) => ({
      id: (v.url.split('v=')[1] || '').split('&')[0],
      title: v.title,
      artist: v.uploaderName || v.uploader || '',
      dur: secs(v.duration),
      art: (v.thumbnail || '').replace(/^\/\//, 'https://'),
      views: v.views,
      src: 'YouTube',
      needsResolve: true,          // stream URL fetched on play
    }))
    .filter((x) => x.id);
}

/** One provider per mirror so the engine can round-robin + circuit-break them. */
export const ytSearch = PIPED.map((base, i) => ({
  id: 'piped-' + i,
  label: 'Piped ' + new URL(base).hostname.split('.')[1],
  async run({ q, filter = 'music_songs' }) {
    const d = await jget(`${base}/search?q=${encodeURIComponent(q)}&filter=${filter}`, { ms: 14000 });
    const out = mapItems(d.items);
    if (!out.length) throw new Error('no results');
    return out;
  },
}));

/* ---------------------------------------------------------------- streams */
const AHM7 = 'https://ahm7xmakki.com/api/alldl';

/** Resolve a YouTube id to { audio, video, qualities, meta } for playback. */
export async function resolveStream(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;

  // 1) AHM7 — verified to return a CORS-enabled, range-capable audio URL.
  try {
    const d = await jget(`${AHM7}?url=${encodeURIComponent(url)}`, { ms: 25000 });
    const m = d.mediaInfo || {};
    if (m.audioUrl || m.videoUrl) {
      return {
        audio: m.audioUrl || m.videoUrl,
        video: m.videoUrl || null,
        title: m.title, artist: m.author, art: m.thumbnail || m.coverImage,
        qualities: [], via: 'AHM7',
      };
    }
  } catch { /* fall through */ }

  // 2) Piped streams endpoint on any healthy mirror.
  for (const base of PIPED) {
    try {
      const d = await jget(`${base}/streams/${id}`, { ms: 15000 });
      const a = (d.audioStreams || []).sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0));
      if (a.length) {
        return {
          audio: a[0].url,
          video: (d.videoStreams || [])[0]?.url || null,
          title: d.title, artist: d.uploader, art: d.thumbnailUrl,
          qualities: (d.videoStreams || []).map((v) => ({ q: v.quality, url: v.url, mime: v.mimeType })),
          audioOptions: a.map((x) => ({ q: `${Math.round((x.bitrate || 0) / 1000)} kbps`, url: x.url, mime: x.mimeType })),
          via: 'Piped',
        };
      }
    } catch { /* next mirror */ }
  }
  throw new Error('No playable stream found for this track');
}

/* ---------------------------------------------------------------- lyrics */
export const lyricsPool = [
  {
    id: 'lrclib', label: 'LRCLIB',
    async run({ title, artist }) {
      const d = await jget(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist || ''} ${title}`.trim())}`, { ms: 12000 });
      const hit = (d || []).find((x) => x.syncedLyrics || x.plainLyrics);
      if (!hit) throw new Error('no lyrics');
      return {
        synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null,
        plain: hit.plainLyrics || '',
        title: hit.trackName, artist: hit.artistName,
      };
    },
  },
  {
    id: 'lyricsovh', label: 'lyrics.ovh',
    async run({ title, artist }) {
      if (!artist) throw new Error('artist required');
      const d = await jget(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { ms: 12000 });
      if (!d.lyrics) throw new Error('no lyrics');
      return { synced: null, plain: d.lyrics, title, artist };
    },
  },
];

/** "[mm:ss.xx] line" → [{ t: seconds, line }] for karaoke-style highlighting. */
function parseLrc(lrc) {
  const out = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/\[(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)/);
    if (!m) continue;
    const t = +m[1] * 60 + +m[2] + (m[3] ? +('0.' + m[3]) : 0);
    const line = m[4].trim();
    if (line) out.push({ t, line });
  }
  return out.length ? out : null;
}
