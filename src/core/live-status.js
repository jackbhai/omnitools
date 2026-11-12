/**
 * Live status — the six services the user actually feels, probed for real.
 *
 * Every row is a live request against the same path the feature itself uses
 * (music search through the music engine, playback through the resolver,
 * the channel index fetched and parsed, headlines through the news relay,
 * forecast through the weather provider). Nothing here is a remembered
 * score: a row is green because a request just succeeded, amber because it
 * succeeded slowly, red because it failed. Results are cached for three
 * minutes so opening the panel twice does not hammer the sources.
 */

const CACHE_MS = 3 * 60 * 1000;
const SLOW_MS = 5000;
let cache = null;
let inflight = null;

const timed = async (fn) => {
  const t0 = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), err: e?.message || 'failed' };
  }
};

const row = (id, name, r, note = '') => ({
  id, name,
  state: !r.ok ? 'down' : r.ms > SLOW_MS ? 'slow' : 'up',
  ms: r.ms, note: r.ok ? note : (r.err || ''),
});

async function probeAll() {
  const out = [];

  /* Music search — the real engine, one ordinary query. The first hit also
     feeds the playback probe, because playback needs a real track id. */
  let firstId = null;
  const search = await timed(async () => {
    const { searchMusic } = await import('./music');
    const r = await searchMusic('arijit singh', { deep: false });
    if (!r?.tracks?.length) throw new Error('no results');
    firstId = r.tracks[0].id || null;
  });
  out.push(row('music-search', 'Music search', search));

  /* Music playback — resolve that track to a stream address. */
  const play = firstId
    ? await timed(async () => {
        const { resolveAudio } = await import('./audio-resolve');
        const r = await resolveAudio(firstId);
        if (!r?.audio) throw new Error('no stream');
      })
    : { ok: false, ms: 0, err: 'search gave nothing to play' };
  out.push(row('music-play', 'Music playback', play));

  /* Downloader — the resolver answers a well-known public video page. */
  const dl = await timed(async () => {
    const { resolveJson } = await import('./audio-resolve');
    const d = await resolveJson('https://youtu.be/dQw4w9WgXcQ', { ms: 15000 });
    const m = d?.mediaInfo || {};
    if (!m.videoUrl && !m.audioUrl && !d?.url) throw new Error('empty answer');
  });
  out.push(row('downloader', 'Downloader', dl));

  /* TV lists — fetch one channel index and check it parses as a playlist. */
  const tv = await timed(async () => {
    const TV = await import('./iptv');
    const src = TV.PLAYLISTS[0];
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    try {
      const r = await fetch(src.urls[1] || src.urls[0], { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      if (!text.includes('#EXTINF')) throw new Error('not a playlist');
    } finally { clearTimeout(t); }
  });
  out.push(row('tv', 'TV channel lists', tv));

  /* News — one headline through the same relay the News tool reads from. */
  const news = await timed(async () => {
    const { headlines } = await import('./news.js');
    const r = await headlines(null, 'TOP', { limit: 3 });
    if (!r?.items?.length) throw new Error('no headlines');
  });
  out.push(row('news', 'News', news));

  /* Weather — the forecast provider the Weather tool uses, Delhi coords. */
  const wx = await timed(async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.21&current=temperature_2m',
        { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!d?.current) throw new Error('empty answer');
    } finally { clearTimeout(t); }
  });
  out.push(row('weather', 'Weather', wx));

  return out;
}

/** { at, rows } — cached for three minutes unless `force` is set. */
export async function getLiveStatus(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await probeAll();
      cache = { at: Date.now(), rows };
      return cache;
    } finally { inflight = null; }
  })();
  return inflight;
}
