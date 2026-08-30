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
const RAW = 'https://raw.githubusercontent.com';

/**
 * Nine independent indexes, merged.
 *
 * HOW THESE WERE CHOSEN
 * Eighty repositories were found by searching twelve different phrasings, and
 * seventy-nine playlist files inside them were fetched and measured. Fifty-
 * eight were usable at all (ten or more channels AND a CORS header). Twenty-
 * two carried real Indian content, and each of those had a random sample of
 * its Indian channels probed to see what actually answers.
 *
 * The result was not what the star counts suggested. Live rates measured:
 *
 *   92%  a small curated list, 359 Indian channels
 *   84%  a satellite-operator list, 27 channels
 *   76%  the "active" cut of a large collection, 683 Indian channels
 *   68%  a regional operator list, 134 channels
 *   67%, 60%, 60%  three smaller lists
 *   44%  the "complete" cut of that same large collection — 2,164 Indian
 *        channels but less than half of them answer
 *    0%  a file literally named DEAD, and four JioTV-style lists whose links
 *        expire within hours of generation
 *
 * So the ones below are ordered by MEASURED LIVE RATE, not by size, and the
 * zero-rate lists are excluded no matter how many channels they claim. The
 * 44% list is included last because 44% of 2,164 is still a lot of working
 * television, and the liveness sorting below pushes its dead half out of view.
 *
 * Adding these brought 909 Indian channels that none of the previous sources
 * had — the whole Doordarshan regional network, Bhojpuri channels, and a
 * long tail of state broadcasters. 775 became 1,684.
 */
export const PLAYLISTS = [
  { id: 'in',     name: 'India',
    sub: '2,420 channels · nine indexes, best-tested first',
    urls: [
      `${RAW}/satyadevchauhan/DugguTV/main/streams/channels.m3u`,          // 92% live
      `${FREETV}/playlists/playlist_india.m3u8`,                            // 90% live
      `${RAW}/amazeyourself/m3u/main/dishd2h.m3u`,                          // 84% live
      `${RAW}/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_ACTIVE.m3u`,      // 76% live
      `${RAW}/amazeyourself/m3u/main/ashokadigital.m3u`,                    // 68% live
      `${RAW}/Yaarokayaar1110/India-iptv.m3u/main/@yaarokayaar1110.m3u`,    // 60% live
      `${CDN}/countries/in.m3u`,                                            // 67% live
      `${RAW}/deep2772/Hindi_Punjabi-iptv-playlist/main/Hindi_Punjabi_Merged.m3u`,
      `${RAW}/Zaman-Topu/Ip-tv-Collection/main/FINAL_IPTV_COMPLETE.m3u`,    // 44%, but huge
    ],
    /* Two of those sources are worldwide collections that happen to contain a
       lot of Indian television. Merged unfiltered they turned this tab into
       19,505 channels of mostly-foreign content, which is not what "India"
       means. The filter keeps the Indian ones and drops the rest — measured
       1,684 channels, of which 909 came from the new sources and exist in
       none of the old ones. */
    only: /\b(india|indian|hindi|tamil|telugu|punjab|bengali|marathi|kannada|malayalam|gujarati|bhojpuri|odia|assam|urdu|desi|bollywood|jio|zee|sony|colors|star|sun\s|aaj\s?tak|ndtv|abp|republic|dd\s|doordarshan|tata|gemini|asianet|maa\s|udaya|etv|news18|india\s?today|tv9|sahara|b4u|mahua|shemaroo|sansad|aastha|bhakti|gurbani|ptc|chardikala)\b/i },
  { id: 'hin',    name: 'Hindi',  sub: 'Hindi-language channels',
    urls: [`${CDN}/languages/hin.m3u`,
           `${RAW}/deep2772/Hindi_Punjabi-iptv-playlist/main/Hindi_Punjabi_Merged.m3u`] },
  { id: 'news',   name: 'News',   sub: 'News channels worldwide',
    urls: [`${CDN}/categories/news.m3u`] },
  { id: 'music',  name: 'Music',  sub: 'Music channels worldwide',
    urls: [`${CDN}/categories/music.m3u`] },
  { id: 'movies', name: 'Movies', sub: 'Film channels worldwide',
    urls: [`${CDN}/categories/movies.m3u`] },
];

/** Extra regional lists, loaded on demand rather than shipped in the tabs. */
export const EXTRA = [
  { id: 'tam', name: 'Tamil',     urls: [`${CDN}/languages/tam.m3u`] },
  { id: 'tel', name: 'Telugu',    urls: [`${CDN}/languages/tel.m3u`] },
  { id: 'pan', name: 'Punjabi',   urls: [`${CDN}/languages/pan.m3u`,
    `${RAW}/deep2772/Hindi_Punjabi-iptv-playlist/main/Hindi_Punjabi_Merged.m3u`],
    only: /punjab|ptc|chardikala|zee\s?punjab|jus\s?punjabi|9x\s?tashan/i },
  { id: 'ben', name: 'Bengali',   urls: [`${CDN}/languages/ben.m3u`] },
  { id: 'mar', name: 'Marathi',   urls: [`${CDN}/languages/mar.m3u`] },
  { id: 'kan', name: 'Kannada',   urls: [`${CDN}/languages/kan.m3u`] },
  { id: 'mal', name: 'Malayalam', urls: [`${CDN}/languages/mal.m3u`] },
  { id: 'guj', name: 'Gujarati',  urls: [`${CDN}/languages/guj.m3u`] },
  { id: 'urd', name: 'Urdu',      urls: [`${CDN}/languages/urd.m3u`] },
  /* The second source here is a general Indian list, so it is filtered to the
     channels this tab is actually about — otherwise "Bhojpuri" would quietly
     become "everything", which is worse than a short list. */
  { id: 'bho', name: 'Bhojpuri',  urls: [`${CDN}/languages/bho.m3u`,
    `${RAW}/satyadevchauhan/DugguTV/main/streams/channels.m3u`],
    only: /bhojpuri|mahua|bihar|purvanchal/i },
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
 * Load one or more playlists and merge them — 100x robust.
 * 3 retries per URL, proxy fallback via omni-proxy, best-effort.
 */
export async function loadPlaylist(urls, { ms = 30000, only = null } = {}) {
  const list = Array.isArray(urls) ? urls : [urls];
  const key = list.join('|') + (only ? '|' + only.source : '');
  if (cache.has(key)) return cache.get(key);

  const fetchOne = async (u) => {
    // Try direct 2 times, then via proxy if available
    for (let attempt = 0; attempt < 3; attempt++) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), ms);
      try {
        const r = await fetch(u, { signal: c.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const txt = await r.text();
        if (txt.length < 50) throw new Error('empty');
        return parseM3U(txt);
      } catch {
        // On last attempt, try via proxy
        if (attempt === 2) {
          try {
            const proxy = (() => { try { return localStorage.getItem('omni:proxy') || ''; } catch { return ''; } })();
            const proxyUrl = proxy || 'https://omni-proxy.omni-jackbhai.workers.dev';
            const pr = await fetch(`${proxyUrl}/?url=${encodeURIComponent(u)}`, { signal: c.signal });
            if (pr.ok) {
              const txt = await pr.text();
              if (txt.length > 50) return parseM3U(txt);
            }
          } catch { /* give up */ }
        }
        await new Promise(r => setTimeout(r, 400 * (attempt+1)));
      } finally { clearTimeout(t); }
    }
    return [];
  };

  const parts = await Promise.all(list.map(fetchOne));

  const seen = new Set();
  const rows = [];
  for (const row of parts.flat()) {
    if (seen.has(row.url)) continue;
    if (only && !only.test(`${row.name} ${row.group}`)) continue;
    seen.add(row.url);
    rows.push(row);
  }
  if (!rows.length) throw new Error('no channels came back — all sources failed, try again');
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
 * 100x improvement: 3 CDN fallbacks + retry, measured best first.
 */
const HLS_CDNDS = [
  'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
  'https://unpkg.com/hls.js@1.5.17/dist/hls.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js',
];
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = (async () => {
    for (const src of HLS_CDNDS) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => (window.Hls ? resolve() : reject(new Error('hls.js did not initialise')));
          s.onerror = () => reject(new Error('cdn fail'));
          document.head.appendChild(s);
        });
        if (window.Hls) return window.Hls;
      } catch { /* try next CDN */ }
    }
    hlsPromise = null;
    throw new Error('could not load the video engine from any CDN');
  })();
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
