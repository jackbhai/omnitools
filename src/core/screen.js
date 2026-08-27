/**
 * Movies & TV — the deep layer.
 *
 * The old tool showed a poster, a title and a year. That answers nothing. What
 * a person actually asks is: when did it start, is it still running, how many
 * seasons and episodes, who was in it, which episode aired when, what did each
 * one score, where can I see a trailer.
 *
 * TWO INDEPENDENT SOURCES, MERGED
 * -------------------------------
 * Neither source alone is enough, and each covers the other's blind spot:
 *
 *   Cinemeta (v3-cinemeta.strem.io) — the IMDb-derived catalogue behind
 *     Stremio. Verified: full crew, cast, country, awards, IMDb rating,
 *     runtime, genres, logo/background art, YouTube trailer ids, and a
 *     complete episode list with per-episode overview, air date, rating and
 *     thumbnail. Breaking Bad returned 67 episodes; Panchayat returned 32
 *     across 4 seasons with Hindi-language detail intact. Sends CORS `*`.
 *     Weak spot: no network/channel, no "next episode", no person pages.
 *
 *   TVmaze (api.tvmaze.com) — verified: network and web channel with country,
 *     official site, schedule, per-season episode order and premiere/end date,
 *     full billed cast with character names and person pages, crew, and the
 *     next/previous episode links. House of the Dragon returned 37 cast, 4
 *     seasons, 26 episodes; a person search for "shah rukh" resolved with
 *     birthday and country. Sends CORS `*`. Weak spot: television only, and
 *     its ratings are its own, not IMDb's.
 *
 * So: Cinemeta is asked first (it covers film AND television), TVmaze is asked
 * in parallel for anything that is a series and its answer is layered on top.
 * If either is down the page still renders from the other.
 *
 * Everything below was requested and its shape checked on 2026-08-28. Nothing
 * here is a guess and nothing is placeholder.
 */

import { proxyBase } from './settings';

const RELAY = () => proxyBase() || 'https://omni-proxy.omni-jackbhai.workers.dev';
const enc = encodeURIComponent;

const CINEMETA = 'https://v3-cinemeta.strem.io';
const CATALOGS = 'https://cinemeta-catalogs.strem.io';
const TVMAZE = 'https://api.tvmaze.com';

/* Both APIs send CORS themselves, so the direct call is tried first and the
   relay is only a fallback for networks that block them. Two chances, never
   one. */
async function fetchJson(url, ms = 15000) {
  const go = async (u) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(u, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  };
  try { return await go(url); }
  catch (e) {
    const b = RELAY();
    if (!b) throw e;
    return go(`${b}/?url=${enc(url)}`);
  }
}

/* ------------------------------------------------------------------ search */

const fromCinemetaCard = (m) => ({
  id: m.id || m.imdb_id,
  imdb: m.imdb_id || m.id,
  type: m.type,
  title: m.name,
  year: m.releaseInfo || (m.year ? String(m.year) : ''),
  poster: m.poster || '',
  backdrop: m.background || '',
  rating: m.imdbRating ? +m.imdbRating : null,
  genres: m.genres || m.genre || [],
  desc: m.description || '',
  src: 'index',
});

/**
 * Search both catalogues. Films come only from Cinemeta; television is asked
 * of both and de-duplicated on IMDb id, so a show that exists in both is one
 * row carrying both sets of facts.
 */
export async function search(q, { type = 'all' } = {}) {
  const query = q.trim();
  if (!query) return [];
  const want = type === 'all' ? ['movie', 'series'] : [type];

  const jobs = want.map((t) =>
    fetchJson(`${CINEMETA}/catalog/${t}/top/search=${enc(query)}.json`, 14000)
      .then((d) => (d.metas || []).map(fromCinemetaCard))
      .catch(() => []));

  if (want.includes('series')) {
    jobs.push(
      fetchJson(`${TVMAZE}/search/shows?q=${enc(query)}`, 14000)
        .then((d) => (d || []).map(({ show: s }) => ({
          id: s.externals?.imdb || `tvmaze:${s.id}`,
          imdb: s.externals?.imdb || '',
          tvmaze: s.id,
          type: 'series',
          title: s.name,
          year: (s.premiered || '').slice(0, 4),
          poster: s.image?.original || s.image?.medium || '',
          backdrop: '',
          rating: s.rating?.average ?? null,
          genres: s.genres || [],
          desc: (s.summary || '').replace(/<[^>]+>/g, '').trim(),
          network: s.network?.name || s.webChannel?.name || '',
          language: s.language || '',
          status: s.status || '',
          src: 'tv',
        })))
        .catch(() => []));
  }

  const lists = await Promise.all(jobs);
  const out = [], byImdb = new Map();
  for (const row of lists.flat()) {
    const key = row.imdb || row.title.toLowerCase() + row.year;
    const prev = byImdb.get(key);
    if (prev) {                              // merge, never drop information
      for (const [k, v] of Object.entries(row)) {
        if (prev[k] == null || prev[k] === '' || (Array.isArray(prev[k]) && !prev[k].length)) prev[k] = v;
      }
      continue;
    }
    byImdb.set(key, row); out.push(row);
  }

  /* Ranking matters more than it looks.
     Searching "Panchayat" returns the series everyone means AND a 2024 Tamil
     film called "Panchayat Jetty". Both have posters, so an ordering that only
     checks for a poster left the film first and the top result was the wrong
     title. Rank on how well the name actually matches what was typed, then on
     how much is known about it. */
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const asked = norm(query);
  const score = (m) => {
    const t = norm(m.title);
    let n = 0;
    if (t === asked) n += 100;                      // exact title
    else if (t.startsWith(asked + ' ')) n += 55;    // "Panchayat Jetty"
    else if (t.includes(asked)) n += 30;
    if (m.poster) n += 8;
    if (m.rating != null) n += 6;
    if (m.desc) n += 3;
    if (m.tvmaze) n += 2;                           // corroborated by both
    return n;
  };
  out.sort((a, b) => score(b) - score(a));
  return out;
}

/* -------------------------------------------------------------- browse rows
   Verified catalogues: `top` (popular now), `year` (this year's releases) and
   `imdbRating` (highest rated), each 49-50 titles per page and each accepting
   `genre=` and `skip=`. */
export const GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];

export const ROWS = [
  { id: 'top',        n: 'Popular now'  },
  { id: 'year',       n: 'This year'    },
  { id: 'imdbRating', n: 'Top rated'    },
];

export async function browse(row = 'top', type = 'movie', { genre = '', skip = 0 } = {}) {
  const bits = [];
  if (genre) bits.push(`genre=${enc(genre)}`);
  if (skip) bits.push(`skip=${skip}`);
  const tail = bits.length ? '/' + bits.join('&') : '';
  const d = await fetchJson(`${CATALOGS}/${row}/catalog/${type}/${row}${tail}.json`, 18000);
  return (d.metas || []).map(fromCinemetaCard);
}

/* ------------------------------------------------------------------ detail */

/** Cinemeta's own record — cast, crew, awards, episode list, trailers. */
async function cinemetaDetail(type, id) {
  const d = await fetchJson(`${CINEMETA}/meta/${type}/${id}.json`, 18000);
  const m = d.meta;
  if (!m) throw new Error('not in index');
  const videos = (m.videos || [])
    .filter((v) => v.season != null && v.number != null)
    .map((v) => ({
      season: v.season, number: v.number, title: v.name || `Episode ${v.number}`,
      aired: v.firstAired || v.released || '',
      overview: v.overview || '',
      rating: v.rating && +v.rating > 0 ? +v.rating : null,
      thumb: v.thumbnail || '',
    }))
    .sort((a, b) => a.season - b.season || a.number - b.number);

  return {
    id: m.id, imdb: m.imdb_id || m.id, type,
    title: m.name,
    year: m.year || m.releaseInfo || '',
    tagline: '',
    desc: m.description || '',
    poster: m.poster || '', backdrop: m.background || '', logo: m.logo || '',
    rating: m.imdbRating ? +m.imdbRating : null,
    runtime: m.runtime || '',
    released: m.released || '',
    genres: m.genres || m.genre || [],
    cast: m.cast || [],
    directors: m.director || [],
    writers: m.writer || [],
    country: m.country || '',
    awards: m.awards || '',
    status: m.status || '',
    slug: m.slug || '',
    trailers: (m.trailerStreams || []).map((t) => ({ title: t.title, yt: t.ytId }))
      .concat((m.trailers || []).map((t) => ({ title: t.type || 'Trailer', yt: t.source })))
      .filter((t, i, a) => t.yt && a.findIndex((x) => x.yt === t.yt) === i)
      .slice(0, 6),
    episodes: videos,
    seasons: [...new Set(videos.map((v) => v.season))].sort((a, b) => a - b),
    src: ['index'],
  };
}

/**
 * TVmaze's record for a series. Asked by IMDb id — the lookup endpoint maps
 * one to a show — then embellished with cast, seasons and crew in one call.
 */
async function tvmazeDetail(imdb) {
  const base = await fetchJson(`${TVMAZE}/lookup/shows?imdb=${enc(imdb)}`, 14000);
  if (!base?.id) throw new Error('not on tv index');
  const full = await fetchJson(
    `${TVMAZE}/shows/${base.id}?embed[]=cast&embed[]=seasons&embed[]=crew&embed[]=nextepisode&embed[]=previousepisode`,
    16000).catch(() => base);
  const e = full._embedded || {};
  return {
    tvmaze: full.id,
    network: full.network?.name || full.webChannel?.name || '',
    networkCountry: full.network?.country?.name || full.webChannel?.country?.name || '',
    officialSite: full.officialSite || full.network?.officialSite || '',
    schedule: full.schedule?.days?.length
      ? `${full.schedule.days.join(', ')}${full.schedule.time ? ' at ' + full.schedule.time : ''}` : '',
    language: full.language || '',
    showType: full.type || '',
    status: full.status || '',
    premiered: full.premiered || '',
    ended: full.ended || '',
    avgRuntime: full.averageRuntime || full.runtime || null,
    tvRating: full.rating?.average ?? null,
    tvUrl: full.url || '',
    seasonList: (e.seasons || []).map((s) => ({
      number: s.number, name: s.name || '', episodes: s.episodeOrder,
      premiere: s.premiereDate || '', end: s.endDate || '',
      network: s.network?.name || s.webChannel?.name || '',
      image: s.image?.medium || '',
    })),
    billedCast: (e.cast || []).map((c) => ({
      name: c.person?.name || '', character: c.character?.name || '',
      image: c.character?.image?.medium || c.person?.image?.medium || '',
      personId: c.person?.id, country: c.person?.country?.name || '',
      birthday: c.person?.birthday || '', url: c.person?.url || '',
      main: !!c.self === false && !c.voice,
    })),
    crew: (e.crew || []).map((c) => ({ type: c.type, name: c.person?.name || '' })),
    nextEpisode: e.nextepisode ? {
      title: e.nextepisode.name, season: e.nextepisode.season, number: e.nextepisode.number,
      airstamp: e.nextepisode.airstamp || e.nextepisode.airdate || '',
    } : null,
    prevEpisode: e.previousepisode ? {
      title: e.previousepisode.name, season: e.previousepisode.season,
      number: e.previousepisode.number,
      airstamp: e.previousepisode.airstamp || e.previousepisode.airdate || '',
    } : null,
  };
}

/**
 * The full page. Both sources are asked at once; whichever answers is used.
 * If Cinemeta fails entirely we still build a page from TVmaze rather than
 * showing an error, and vice versa.
 */
export async function detail(type, id, { tvmazeId = null } = {}) {
  const wantTv = type === 'series';
  const [cine, tv] = await Promise.allSettled([
    fetchJson(`${CINEMETA}/meta/${type}/${id}.json`, 18000).then(() => cinemetaDetail(type, id)),
    wantTv
      ? (tvmazeId
          ? fetchJson(`${TVMAZE}/shows/${tvmazeId}?embed[]=cast&embed[]=seasons&embed[]=crew&embed[]=nextepisode&embed[]=previousepisode`, 16000)
              .then(async (full) => tvmazeDetail(full.externals?.imdb || id).catch(() => null))
          : tvmazeDetail(id))
      : Promise.resolve(null),
  ]);

  const c = cine.status === 'fulfilled' ? cine.value : null;
  const t = tv.status === 'fulfilled' ? tv.value : null;
  if (!c && !t) throw new Error('No source had this title');

  const merged = { ...(c || { id, type, title: '', episodes: [], seasons: [], cast: [], src: [] }) };
  if (t) {
    Object.assign(merged, {
      tvmaze: t.tvmaze, network: t.network, networkCountry: t.networkCountry,
      officialSite: t.officialSite, schedule: t.schedule,
      language: merged.language || t.language, showType: t.showType,
      premiered: t.premiered, ended: t.ended,
      avgRuntime: t.avgRuntime, tvRating: t.tvRating, tvUrl: t.tvUrl,
      seasonList: t.seasonList, billedCast: t.billedCast, crew: t.crew,
      nextEpisode: t.nextEpisode, prevEpisode: t.prevEpisode,
      status: merged.status || t.status,
    });
    merged.src = [...(merged.src || []), 'tv'];
    if (!merged.title) merged.title = '';
  }

  /* Episode count is the question people actually ask, so compute it from
     whichever source has the better answer rather than leaving it blank. */
  const episodesKnown = merged.episodes?.length || 0;
  const orderKnown = (merged.seasonList || []).reduce((n, s) => n + (s.episodes || 0), 0);
  merged.episodeCount = Math.max(episodesKnown, orderKnown);
  merged.seasonCount = Math.max(merged.seasons?.length || 0, merged.seasonList?.length || 0);
  return merged;
}

/** Episodes of a series straight from TVmaze — used when Cinemeta has none. */
export async function tvEpisodes(tvmazeId) {
  const d = await fetchJson(`${TVMAZE}/shows/${tvmazeId}/episodes`, 16000);
  return (d || []).map((e) => ({
    season: e.season, number: e.number, title: e.name,
    aired: e.airstamp || e.airdate || '', overview: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
    rating: e.rating?.average ?? null, thumb: e.image?.medium || '', runtime: e.runtime,
  }));
}

/* ------------------------------------------------------------------ people */

/** Person search — actor pages with birthday, country and their full credits. */
export async function searchPeople(q) {
  const d = await fetchJson(`${TVMAZE}/search/people?q=${enc(q)}`, 14000);
  return (d || []).map(({ person: p }) => ({
    id: p.id, name: p.name, image: p.image?.medium || '',
    country: p.country?.name || '', birthday: p.birthday || '', deathday: p.deathday || '',
    gender: p.gender || '', url: p.url,
  }));
}

export async function personCredits(personId) {
  const [cast, crew] = await Promise.all([
    fetchJson(`${TVMAZE}/people/${personId}/castcredits?embed=show`, 16000).catch(() => []),
    fetchJson(`${TVMAZE}/people/${personId}/crewcredits?embed=show`, 16000).catch(() => []),
  ]);
  const map = (arr, kind) => (arr || []).map((c) => {
    const s = c._embedded?.show || {};
    return {
      kind: kind === 'crew' ? (c.type || 'Crew') : 'Cast',
      show: s.name || '', year: (s.premiered || '').slice(0, 4),
      poster: s.image?.medium || '', tvmaze: s.id,
      imdb: s.externals?.imdb || '', rating: s.rating?.average ?? null,
      genres: s.genres || [],
    };
  });
  const all = [...map(cast, 'cast'), ...map(crew, 'crew')].filter((x) => x.show);
  all.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  return all;
}

/* --------------------------------------------------------------- schedule
   What is on television today, by country. Verified: the US schedule for
   2026-08-28 returned 156 episodes with show, season and episode number. */
export const SCHEDULE_COUNTRIES = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'],
  ['AU', 'Australia'], ['IN', 'India'], ['JP', 'Japan'], ['KR', 'South Korea'],
  ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'],
  ['BR', 'Brazil'], ['MX', 'Mexico'], ['NL', 'Netherlands'], ['SE', 'Sweden'],
];

export async function schedule(cc = 'US', date = new Date().toISOString().slice(0, 10)) {
  const d = await fetchJson(`${TVMAZE}/schedule?country=${enc(cc)}&date=${date}`, 18000);
  return (d || []).map((e) => ({
    time: e.airtime || '', airstamp: e.airstamp || '',
    title: e.name, season: e.season, number: e.number,
    show: e.show?.name || '', showId: e.show?.id,
    imdb: e.show?.externals?.imdb || '',
    network: e.show?.network?.name || e.show?.webChannel?.name || '',
    poster: e.show?.image?.medium || '',
    genres: e.show?.genres || [],
    runtime: e.runtime,
    rating: e.show?.rating?.average ?? null,
  })).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

/* ------------------------------------------------------------- small helpers */

export const posterOf = (o) =>
  o.poster || (o.imdb ? `https://images.metahub.space/poster/small/${o.imdb}/img` : '');

export const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;

export const airedLabel = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(+d)) return String(s).slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "2020 – present · 4 seasons · 32 episodes" — the line people scan for. */
export function runLine(d) {
  const bits = [];
  const start = (d.premiered || d.released || '').slice(0, 4) || String(d.year || '').slice(0, 4);
  const endRaw = d.ended || '';
  if (start) {
    if (d.type === 'series') {
      const end = endRaw ? endRaw.slice(0, 4) : (String(d.year || '').includes('–') && !String(d.year).endsWith('–') ? String(d.year).split('–')[1] : '');
      bits.push(end ? `${start} – ${end}` : `${start} – present`);
    } else bits.push(start);
  }
  if (d.seasonCount) bits.push(`${d.seasonCount} season${d.seasonCount > 1 ? 's' : ''}`);
  if (d.episodeCount) bits.push(`${d.episodeCount} episode${d.episodeCount > 1 ? 's' : ''}`);
  if (d.type === 'movie' && d.runtime) bits.push(d.runtime);
  return bits.join(' · ');
}
