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
 *   media resolver /alldl               → 200, returns audioUrl
 *   c.ymcdn.org (the audio CDN)      → 206 Partial Content, audio/mp4, CORS: *
 * 206 + CORS means the <audio> element can stream AND seek it.
 */
import { jget } from './engine';
import { resolveJson } from './audio-resolve';

/* Multiple Piped mirrors — if one dies the pool moves on.
 * Re-measured 2026-11-12: of eleven public instances tested, three answer.
 * wireway.ch is the only one whose /streams returns audio streams at all
 * (private.coffee and ducks.party return video-only lists now), so it is
 * load-bearing for the stream fallback below. kavin.rocks (526),
 * adminforge (parked), drgns.space, projectsegfau.lt ("Piped has
 * shutdown"), orangenet, leptons, libre and five more were removed. */
const PIPED = [
  'https://api.piped.private.coffee',   // search + suggestions
  'https://pipedapi.wireway.ch',        // search + suggestions + audio streams
  'https://pipedapi.ducks.party',       // search only
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

/* ---------------------------------------------------------------- streams */

/** Resolve a YouTube id to { audio, video, qualities, meta } for playback. */

/* ---------------------------------------------------------------- lyrics */
export const lyricsPool = [
  {
    /* Exact match first: lrclib's /api/get wants the same title, artist and
       duration we already know. If that answers, the words are for THIS
       recording, not some live version that happens to share the name. */
    id: 'lrclib-get', label: 'LRCLIB',
    async run({ title, artist, album, length }) {
      if (!title || !artist || !length) throw new Error('need title + artist + duration');
      const q = new URLSearchParams({ track_name: title, artist_name: artist, length: String(length) });
      if (album) q.set('album_name', album);
      const d = await jget(`https://lrclib.net/api/get?${q}`, { ms: 12000 });
      if (!d || (!d.syncedLyrics && !d.plainLyrics)) throw new Error('no lyrics');
      return {
        synced: d.syncedLyrics ? parseLrc(d.syncedLyrics) : null,
        plain: d.plainLyrics || '',
        title: d.trackName, artist: d.artistName, exact: true,
      };
    },
  },
  {
    id: 'lrclib', label: 'LRCLIB',
    async run({ title, artist, length }) {
      const d = await jget(
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist || ''} ${title}`.trim())}`, { ms: 12000 });
      const rows = (d || []).filter((x) => x.syncedLyrics || x.plainLyrics);
      // A fuzzy hit is only usable when its length is within a few seconds of
      // what is playing; anything else is a different recording and we would
      // rather show nothing than the wrong words.
      const hit = rows.find((x) => !length || Math.abs((+x.duration || 0) - length) <= 4) || null;
      if (!hit) throw new Error('no lyrics');
      return {
        synced: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null,
        plain: hit.plainLyrics || '',
        title: hit.trackName, artist: hit.artistName, exact: false,
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
