/**
 * OmniTools relay — Cloudflare Worker
 * ===================================
 *
 * Two jobs:
 *
 *   1. CORS relay for hosts that do not send the header (Deezer, the Piped
 *      mirrors, the audio CDN). Browsers refuse those outright; this forwards
 *      them with permissive CORS. A host allow-list keeps it from becoming an
 *      open proxy for anyone else's traffic.
 *
 *   2. /yt — a first-party audio resolver.
 *      This is the important one. The app used to depend on a single external
 *      resolver, and when that host started returning 504 on every request —
 *      including its own homepage — every song in the app stopped playing.
 *      Every public alternative was already dead too: Cobalt (3 mirrors),
 *      Piped /streams (3), Invidious (4) all 403/500/timeout.
 *
 *      So the resolver now lives here. It does what the npm packages
 *      (play-dl, ytdl-core, youtubei.js) actually do: call YouTube's own
 *      internal `youtubei` API while identifying as a mobile client. Those
 *      clients receive `streamingData` with DIRECT urls — no signature to
 *      decipher, no player JS to execute, which is what makes it small enough
 *      to run in a Worker.
 *
 *      Several client identities are tried in order, because YouTube retires
 *      them one at a time. If one starts returning LOGIN_REQUIRED the next is
 *      used, and the app keeps working.
 *
 * DEPLOY
 *   dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   paste this file, Deploy, then put the URL in the app under
 *   Music -> Library -> Speed.
 */

const ALLOWED = [
  // audio resolution + the utility API family
  'ahm7xmakki.com',
  'c.ymcdn.org',
  'ymcdn.org',

  // YouTube front-ends (search / playlists / channels)
  'api.piped.private.coffee',
  'pipedapi.kavin.rocks',
  'pipedapi.adminforge.de',
  'pipedapi.drgns.space',
  'api.piped.projectsegfau.lt',
  'pipedapi.orangenet.cc',
  'pipedapi.ducks.party',
  'pipedapi.leptons.xyz',
  'piped-api.lunar.icu',
  'pipedapi.reallyaweso.me',
  'inv.nadeko.net',
  'yewtu.be',
  'invidious.f5.si',
  'invidious.nerdvpn.de',
  'invidious.privacyredirect.com',
  'iv.datura.network',

  // Deezer — large catalogue, no CORS header of its own
  'api.deezer.com',
  'cdn-preview-a.dzcdn.net',
  'cdns-preview-a.dzcdn.net',
  'e-cdn-preview.dzcdn.net',
  'e-cdns-preview-a.dzcdn.net',

  // Audius — free and decentralised, direct streams
  'discoveryprovider.audius.co',
  'discoveryprovider2.audius.co',
  'discoveryprovider3.audius.co',
  'audius-discovery-1.altego.net',
  'audius-discovery-2.altego.net',

  // YouTube media hosts, for /yt playback
  'googlevideo.com',
  'youtube.com',

  // Radio + lyrics
  'de1.api.radio-browser.info',
  'nl1.api.radio-browser.info',
  'at1.api.radio-browser.info',
  'lrclib.net',

  // News aggregators + publisher feeds. None of these send CORS themselves.
  'news.google.com',
  'api.gdeltproject.org',
  'feeds.bbci.co.uk',
  'aljazeera.com',
  'rss.cnn.com',
  'feeds.skynews.com',
  'theguardian.com',
  'thehindubusinessline.com',
  'feeds.washingtonpost.com',
  'moxie.foxnews.com',
  'feeds.nbcnews.com',
  'abcnews.go.com',
  'cbsnews.com',
  'feeds.reuters.com',
  'thehindu.com',
  'timesofindia.indiatimes.com',
  'economictimes.indiatimes.com',
  'indianexpress.com',
  'ndtv.com',
  'feeds.feedburner.com',
  'hindustantimes.com',
  'zeenews.india.com',
  'news18.com',
  'livemint.com',
  'business-standard.com',
  'firstpost.com',
  'scroll.in',
  'dawn.com',
  'thedailystar.net',
  'channelnewsasia.com',
  'nhk.or.jp',
  'rss.dw.com',
  'france24.com',
  'rt.com',
  'news.yahoo.com',
  'techcrunch.com',
  'theverge.com',
  'arstechnica.com',
  'wired.com',
  'espn.com',
  'espncricinfo.com',
  'static.espncricinfo.com',

  // Film / TV metadata
  'v3-cinemeta.strem.io',
  'cinemeta-catalogs.strem.io',
  'cinemeta-live.strem.io',
  'images.metahub.space',
  'api.tvmaze.com',
  'static.tvmaze.com',
  'api.jikan.moe',
  'omdbapi.com',
  'api.themoviedb.org',
  'api.watchmode.com',

  // Air quality + weather fallbacks
  'api.waqi.info',
  'api.openaq.org',
  'data.sensor.community',
  'api.data.gov.in',
  'airquality.cpcb.gov.in',

  // publisher feeds verified after the first allow-list pass
  'skynews.com',
  'news.ycombinator.com',
  'hn.algolia.com',
  'api.spaceflightnewsapi.net',
  'spaceflightnewsapi.net',
  'deccanherald.com',
  'telegraphindia.com',
  'tribuneindia.com',
  'newindianexpress.com',
  'indiatoday.in',
  'opindia.com',
  'thewire.in',
  'theprint.in',

  // search back-ends, used when the primary aggregator refuses a query
  'bing.com',
  'news.search.yahoo.com',
  'search.yahoo.com',
  'moneycontrol.com',
  'r.jina.ai',

  // name & surname directory
  'query.wikidata.org',
  'wikidata.org',
  'en.wikipedia.org',
  'wikipedia.org',
  'api.agify.io',
  'api.genderize.io',
  'api.nationalize.io',
  'agify.io',
  'genderize.io',
  'nationalize.io',

  // surname & given-name census
  'forebears.io',

  // hosts the audit found missing from this list
  'api.worldbank.org',
  'worldbank.org',
  'themealdb.com',
  'll.thespacedevs.com',
  'thespacedevs.com',
  'api.coingecko.com',
  'coingecko.com',
  'api.coinpaprika.com',
  'coinpaprika.com',
  'api.coinlore.net',
  'coinlore.net',
  'ipwho.is',
  'get.geojs.io',
  'geojs.io',
  'ipinfo.io',
  'ipapi.co',

  // second, independent music catalogue with its own CDN
  'jiosaavn.com',
  'saavncdn.com',
  'aac.saavncdn.com',
  'c.saavncdn.com',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/* ------------------------------------------------------------------ /yt ---
   Client identities, tried in order. YouTube disables these one at a time, so
   the list matters more than any single entry. */
const YT_CLIENTS = [
  { name: 'ANDROID_VR', version: '1.60.19', id: '28',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; GB) gzip',
    extra: { androidSdkVersion: 32, deviceMake: 'Oculus', deviceModel: 'Quest 3',
             osName: 'Android', osVersion: '12' } },
  { name: 'IOS', version: '19.45.4', id: '5',
    ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2',
             osName: 'iPhone', osVersion: '18.1.0.22B83' } },
  { name: 'ANDROID', version: '19.44.38', id: '3',
    ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' } },
  { name: 'MWEB', version: '2.20241202.07.00', id: '2',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    extra: {} },
  { name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', version: '2.0', id: '85',
    ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15',
    extra: {} },
];

async function ytPlayer(videoId, client) {
  const body = {
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        hl: 'en', gl: 'IN',
        ...client.extra,
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.ua,
      'X-YouTube-Client-Name': client.id,
      'X-YouTube-Client-Version': client.version,
      'Accept-Language': 'en-IN,en;q=0.9',
      Origin: 'https://www.youtube.com',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${client.name} HTTP ${r.status}`);
  return r.json();
}

/** Pick the best DIRECT audio url — anything needing a cipher is unusable here. */
function pickAudio(data) {
  const sd = data?.streamingData || {};
  const all = [...(sd.adaptiveFormats || []), ...(sd.formats || [])];
  const audio = all.filter((f) => (f.mimeType || '').startsWith('audio/') && f.url);
  if (!audio.length) return null;
  audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  // prefer m4a: it seeks reliably in a plain <audio> element
  const m4a = audio.find((f) => (f.mimeType || '').includes('mp4'));
  return m4a || audio[0];
}

async function resolveYouTube(videoId) {
  const tried = [];
  for (const client of YT_CLIENTS) {
    try {
      const data = await ytPlayer(videoId, client);
      const status = data?.playabilityStatus?.status;
      const fmt = pickAudio(data);
      if (!fmt) { tried.push(`${client.name}:${status || 'no-audio'}`); continue; }
      const d = data.videoDetails || {};
      return {
        success: true,
        via: client.name,
        mediaInfo: {
          audioUrl: fmt.url,
          videoUrl: null,
          title: d.title || '',
          author: d.author || '',
          duration: +(d.lengthSeconds || 0),
          thumbnail: (d.thumbnail?.thumbnails || []).slice(-1)[0]?.url || '',
          bitrate: fmt.bitrate || 0,
          mime: fmt.mimeType || '',
        },
        tried,
      };
    } catch (e) {
      tried.push(`${client.name}:${String(e.message).slice(0, 40)}`);
    }
  }
  return { success: false, error: 'no client returned a playable stream', tried };
}

/* ----------------------------------------------------------------- /rss ---
   News needs many feeds at once. Doing that from the browser means one relay
   round-trip per feed and an XML parse per feed on the main thread. This does
   the fan-out here — every feed fetched in parallel, parsed, merged, sorted —
   so the app makes ONE request and gets ready-to-render JSON.

   A dead feed never fails the batch: its error is reported alongside the
   items that did arrive. */

const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ')
  .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (block, name, a) => {
  const m = block.match(new RegExp(`<${name}[^>]*\\b${a}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
};

function parseFeed(xml, feedUrl) {
  const out = [];
  const feedTitle = strip(tag(xml.slice(0, 4000), 'title'));
  const isAtom = /<feed[\s>]/i.test(xml.slice(0, 600));
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, 'title'));
    if (!title) continue;
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href') || strip(tag(b, 'guid'));
    if (!/^https?:/i.test(link)) link = attr(b, 'link', 'href') || '';
    const rawDesc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content');
    const img = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') ||
      attr(b, 'enclosure', 'url') || (rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    const pub = strip(tag(b, 'pubDate')) || strip(tag(b, 'published')) ||
      strip(tag(b, 'updated')) || strip(tag(b, 'dc:date'));
    const src = strip(tag(b, 'source')) || attr(b, 'source', 'url') || feedTitle;
    const t = pub ? Date.parse(pub) : NaN;
    out.push({
      title, link,
      desc: strip(rawDesc).slice(0, 320),
      img: /^https?:/i.test(img) ? img : '',
      pub, ts: Number.isFinite(t) ? t : 0,
      source: src, feed: feedTitle, feedUrl,
      cats: (b.match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi) || [])
        .map((c) => strip(c.replace(/<\/?category[^>]*>/gi, ''))).filter(Boolean).slice(0, 4),
    });
  }
  return out;
}

/**
 * Fetch one feed, retrying the failures that are worth retrying.
 *
 * Google rate-limits Cloudflare's egress ranges hard: the same topic URL that
 * returns 70 articles on one request returns HTTP 503 on the next, from the
 * same Worker, seconds apart. Measured over eight topics, roughly a quarter
 * got through on the first try. That is a transient refusal, not a dead feed,
 * and the correct response is to ask again rather than to show the user an
 * empty page. 404 and 403 are NOT retried — those are permanent.
 */
async function fetchFeed(u, tries = 3, budgetMs = 9000) {
  let last = 'unknown';
  const deadline = Date.now() + budgetMs;
  for (let i = 0; i < tries; i++) {
    if (i) {
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 180 * i));
    }
    try {
      const ctl = new AbortController();
      const per = setTimeout(() => ctl.abort(), Math.max(1500, deadline - Date.now()));
      const r = await fetch(u, {
        signal: ctl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        redirect: 'follow',
        cf: { cacheTtl: 120, cacheEverything: true },
      });
      clearTimeout(per);
      if (r.ok) return { ok: true, xml: await r.text() };
      last = 'HTTP ' + r.status;
      if (r.status !== 503 && r.status !== 429 && r.status < 500) break;
    } catch (e) { last = String(e.message).slice(0, 60); }
  }
  return { ok: false, error: last };
}

async function rssBatch(urls, limit) {
  const errors = [];
  const lists = await Promise.all(urls.map(async (u) => {
    try {
      const t = new URL(u);
      const host = t.hostname.replace(/^www\./, '');
      if (!ALLOWED.some((h) => host === h || host.endsWith('.' + h))) {
        errors.push({ url: u, error: 'host not allowed' }); return [];
      }
      /* Desktop identity, deliberately. Several search back-ends answer a
         mobile user-agent with a rendered HTML page instead of the RSS they
         were asked for — measured on Bing News, which returned 168 KB of
         markup to a mobile UA and clean XML to a desktop one. */
      const got = await fetchFeed(u);
      if (!got.ok) { errors.push({ url: u, error: got.error }); return []; }
      const items = parseFeed(got.xml, u);
      if (!items.length) errors.push({ url: u, error: 'no items' });
      return items;
    } catch (e) {
      errors.push({ url: u, error: String(e.message).slice(0, 80) });
      return [];
    }
  }));

  const seen = new Set(), merged = [];
  for (const it of lists.flat()) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
    if (!k || seen.has(k)) continue;
    seen.add(k); merged.push(it);
  }
  merged.sort((a, b) => b.ts - a.ts);
  return { ok: true, count: merged.length, items: merged.slice(0, limit), errors };
}


/* ------------------------------------------------------------ topic ids ---
   Google News topic sections live at /rss/headlines/section/topic/<NAME>,
   which answers 302 -> /rss/topics/<opaque id>. Following that redirect from
   here is unreliable: measured, the redirect target succeeds but the
   /section/topic/ URL itself returns 503 from datacentre IPs often enough to
   break the page.

   The id is not opaque. It is base64 of a small protobuf holding the topic's
   Knowledge Graph mid, the language and (sometimes) the country. Decoding the
   eight known ids showed the structure, and rebuilding them from the mid
   reproduced ALL EIGHT byte-for-byte — six with a country field, two without.
   So the app builds the id itself and requests the stable /rss/topics/ URL
   directly. No redirect, no 503, and it works for every language edition.  */

const TOPIC_MID = {
  WORLD: '/m/09nm_', NATION: '/m/03rk0', BUSINESS: '/m/09s1f',
  TECHNOLOGY: '/m/07c1v', ENTERTAINMENT: '/m/02jjt', SPORTS: '/m/06ntj',
  SCIENCE: '/m/06mq7', HEALTH: '/m/0kt51',
};
/* The two that carry no country field in Google's own ids. */
const TOPIC_NO_GL = new Set(['NATION', 'HEALTH']);

const varint = (n) => {
  const out = [];
  for (;;) { const b = n & 0x7f; n >>>= 7; out.push(n ? b | 0x80 : b); if (!n) return new Uint8Array(out); }
};
const cat = (...parts) => {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const field = (num, bytes) => cat(new Uint8Array([(num << 3) | 2]), varint(bytes.length), bytes);
const utf8 = (s) => new TextEncoder().encode(s);
const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };

function topicId(topic, hl, gl) {
  const mid = TOPIC_MID[topic];
  if (!mid) return null;
  const useGl = gl && !TOPIC_NO_GL.has(topic);
  const sub = useGl
    ? cat(field(1, utf8(mid)), field(2, utf8(hl)), field(3, utf8(gl)))
    : cat(field(1, utf8(mid)), field(2, utf8(hl)));
  const inner = cat(new Uint8Array([0x08, 0x10]), field(2, sub), new Uint8Array([0x28, 0x00]));
  const innerB64 = b64(inner).replace(/=+$/, '');
  const payload = cat(new Uint8Array([0x08, 0x0a]), field(4, utf8(innerB64)), new Uint8Array([0x50, 0x01]));
  const outer = cat(new Uint8Array([0x08, 0x00]), field(5, payload));
  return b64(outer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ------------------------------------------------------------- /search ---
   News search, with the primary aggregator's own search deliberately NOT the
   only route.

   Measured from this Worker: `news.google.com/rss/search` returns HTTP 503 on
   effectively every request from Cloudflare egress — Google rate-limits the
   whole range — while the SAME host's country and topic feeds answer 200. So
   search cannot lean on it.

   Bing News RSS does answer: 10-12 articles per query, correct XML, verified
   across eight unrelated queries and four markets. It is the primary. The
   aggregator's search is still attempted (it works from residential IPs, and
   costs nothing to try), and publisher feeds are searched client-side by the
   caller. Whatever answers, answers.  */
async function searchNews(q, hl, gl, ceid, limit) {
  const urls = [
    `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=RSS` +
      `&cc=${gl}&setmkt=${hl}`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}` +
      `&hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`,
  ];
  const out = await rssBatch(urls, limit);
  out.query = q;
  return out;
}


/* ------------------------------------------------------------- /surname ---
 * How many people actually carry a name, and where.
 *
 * WHY THIS EXISTS
 * The encyclopedia registers only know a name if somebody notable has it.
 * They had never heard of "Rakheja" or "Mangatram", so the app told the user
 * those names did not exist. They plainly do: the surname census has Rakheja
 * at 1,033 people worldwide (964 of them in India) and Mangatram at 586 as a
 * GIVEN name. That is the gap this closes — real people, counted, rather than
 * only the famous ones.
 *
 * WHY IT IS SERVER-SIDE
 * The census is a web page, not an API. It sends no CORS header, needs a
 * desktop user-agent, and redirects /forenames/<x> to /x/forenames/<x>. All
 * three are handled here so the browser sees plain JSON.
 *
 * A name is looked up BOTH ways — as a surname and as a given name — because
 * which one it is cannot be assumed: Mangatram returns nothing as a surname
 * and 586 people as a forename.
 */

const censusUA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

const unent = (x) => String(x || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function flatten(htmlText) {
  let t = htmlText.replace(/<script[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[\s\S]*?<\/style>/gi, '');
  return unent(t.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const num = (x) => parseInt(String(x).replace(/,/g, ''), 10);

function parseCensus(htmlText, kind) {
  const f = flatten(htmlText);
  const out = { kind };
  let m = f.match(/Approximately ([\d,]+) people bear this (?:surname|name)/i);
  if (!m) return null;                       // no record for this spelling
  out.people = num(m[1]);
  m = f.match(/([\d,]+)\s*(?:st|nd|rd|th)\s*Most Common (?:surname|name) in the World/i);
  if (m) out.rank = num(m[1]);
  m = f.match(/Most prevalent in:\s*([A-Za-z .&'-]+?)\s+Highest density/i);
  if (m) out.top = m[1].trim();
  /* "Highest density in: United Arab Emirates" was truncated to "United"
     because the pattern stopped at the next capital. The field is followed by
     the page's own "<Name> Surname" / "<Name> Forename" heading, so stop there. */
  m = f.match(/Highest density in:\s*(.+?)\s+\S+\s+(?:Surname|Forename)\b/i);
  if (!m) m = f.match(/Highest density in:\s*(.+?)\s+(?:The meaning|Definition:|Distribution)/i);
  if (m && m[1].trim().length < 40) out.dense = m[1].trim();
  m = f.match(/Definition:\s*([^.]{3,180}\.)/i);
  if (m) out.meaning = m[1].trim();
  else {
    m = f.match(/The meaning of this surname is ([^.]{3,180})\./i);
    if (m && !/not listed/i.test(m[1])) out.meaning = m[1].trim();
  }
  /* The distribution table: "India 964 1:795,711 35,763" for surnames, and
     "India F 102,691 1:8,616 66" for forenames — the extra column is gender.
     The table is preceded by its own header row, and matching from the top of
     the page swallowed those words into the first country's name, producing
     "Frequency Rank in Area India". So start reading AFTER the header, and
     reject any place that still contains a header word. */
  const hm = f.match(/Place\s+(?:Gender\s+)?Incidence\s+Frequency\s+Rank in Area\s+/i);
  const table = hm ? f.slice(hm.index + hm[0].length) : f;
  const places = [];
  /* Two shapes. A surname row is
       "India 964 1:795,711 35,763"
     and a forename row carries an extra column that is NOT M/F — it is the
     share of bearers who are female, written as a percentage or as "-" when
     unknown:
       "India 100% 404,486 1:3,004 315"
       "Sri Lanka - 13,091 1:1,589 294"
     Matching M/F left that column stuck to the country ("Sri Lanka -") and
     dropped every row that had a percentage. Both are accepted now. */
  const re = /([A-Z][A-Za-z.&'\u2019-]*(?:[ -][A-Za-z.&'\u2019-]+){0,3}?)\s+(?:(\d{1,3})%\s+|-\s+)?([\d,]+)\s+1:([\d,]+)\s+([\d,]+)/g;
  let r;
  while ((r = re.exec(table)) && places.length < 24) {
    const place = r[1].trim();
    if (/(place|rank|area|sort|incidence|frequency|gender|results|alphabetic|fullscreen)/i.test(place)) continue;
    if (place.length < 3) continue;
    const row = { place, n: num(r[3]), per: num(r[4]), rank: num(r[5]) };
    if (r[2] != null) row.female = +r[2];
    places.push(row);
  }
  if (places.length) out.places = places;
  return out;
}

async function census(name, kind) {
  const slug = encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, '-'));
  const path = kind === 'given' ? 'forenames' : 'surnames';
  const r = await fetch(`https://forebears.io/${path}/${slug}`, {
    headers: censusUA, redirect: 'follow', cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!r.ok) return null;
  return parseCensus(await r.text(), kind);
}

/* ------------------------------------------------------------------ main */
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    /* ---- how many people carry this name, and where ---- */
    if (url.pathname === '/surname') {
      const n = (url.searchParams.get('n') || '').trim();
      if (!n || n.length > 40) return json({ ok: false, error: 'pass ?n=<name>' }, 400);
      try {
        /* Asked both ways at once: a spelling can be a surname, a given name,
           or both, and guessing wrong is how a real name gets reported as
           non-existent. */
        const [sur, giv] = await Promise.all([
          census(n, 'surname').catch(() => null),
          census(n, 'given').catch(() => null),
        ]);
        return json({ ok: true, name: n, surname: sur, given: giv,
                      found: !!(sur || giv) });
      } catch (e) {
        return json({ ok: false, error: String(e.message).slice(0, 120) }, 502);
      }
    }

    /* ---- news search ---- */
    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ ok: false, error: 'pass ?q=' }, 400);
      const hl = url.searchParams.get('hl') || 'en-IN';
      const gl = url.searchParams.get('gl') || 'IN';
      const ceid = url.searchParams.get('ceid') || 'IN:en';
      const limit = Math.min(+url.searchParams.get('limit') || 60, 200);
      try { return json(await searchNews(q, hl, gl, ceid, limit)); }
      catch (e) { return json({ ok: false, error: String(e.message).slice(0, 120) }, 502); }
    }

    /* ---- topic section, addressed by its stable id ---- */
    if (url.pathname === '/topic') {
      const t = (url.searchParams.get('t') || '').toUpperCase();
      const hl = url.searchParams.get('hl') || 'en-IN';
      const gl = url.searchParams.get('gl') || 'IN';
      const ceid = url.searchParams.get('ceid') || 'IN:en';
      const limit = Math.min(+url.searchParams.get('limit') || 80, 200);
      const id = topicId(t, hl, gl);
      if (!id) return json({ ok: false, error: 'unknown topic ' + t }, 400);
      const u = `https://news.google.com/rss/topics/${id}?hl=${hl}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
      try {
        const r = await rssBatch([u], limit);
        r.topic = t; r.id = id;
        return json(r);
      } catch (e) { return json({ ok: false, error: String(e.message).slice(0, 120) }, 502); }
    }

    /* ---- batched RSS -> JSON ---- */
    if (url.pathname === '/rss') {
      const urls = url.searchParams.getAll('u').filter(Boolean).slice(0, 12);
      const limit = Math.min(+url.searchParams.get('limit') || 80, 200);
      if (!urls.length) return json({ ok: false, error: 'pass one or more ?u=<encoded feed url>' }, 400);
      try {
        return json(await rssBatch(urls, limit));
      } catch (e) {
        return json({ ok: false, error: String(e.message).slice(0, 120) }, 502);
      }
    }

    /* ---- first-party audio resolver ---- */
    if (url.pathname === '/yt') {
      const v = url.searchParams.get('v') || url.searchParams.get('id');
      const raw = url.searchParams.get('url');
      let videoId = v;
      if (!videoId && raw) {
        const m = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
        videoId = m ? m[1] : null;
      }
      if (!videoId) return json({ success: false, error: 'pass ?v=<videoId>' }, 400);
      try {
        const out = await resolveYouTube(videoId);
        return json(out, out.success ? 200 : 502);
      } catch (e) {
        return json({ success: false, error: String(e.message).slice(0, 120) }, 502);
      }
    }

    /* ---- plain CORS relay ---- */
    let target = url.searchParams.get('url');
    if (!target && url.pathname.length > 1) {
      target = decodeURIComponent(url.pathname.slice(1)) + url.search;
    }
    if (!target) {
      return new Response(
        'OmniTools relay.\n\n  /?url=<encoded target>   CORS relay\n  /yt?v=<videoId>          audio resolver\n',
        { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' } });
    }

    let t;
    try { t = new URL(target); }
    catch { return new Response('Bad target URL', { status: 400, headers: CORS }); }

    const host = t.hostname.replace(/^www\./, '');
    const ok = ALLOWED.some((h) => host === h || host.endsWith('.' + h));
    if (!ok) return new Response(`Host not allowed: ${host}`, { status: 403, headers: CORS });

    const fwd = new Headers();
    const range = request.headers.get('Range');
    if (range) fwd.set('Range', range);
    /* Wikidata answers 403 to a request with no identifying User-Agent —
       measured, every time. A browser page cannot set one, so the relay does. */
    fwd.set('User-Agent', /wikidata|wikipedia/.test(host)
      ? 'OmniTools/1.0 (https://jackbhai.github.io/omnitools/) public tools app'
      : 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36');
    fwd.set('Accept', '*/*');

    try {
      const res = await fetch(t.toString(), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: fwd,
        redirect: 'follow',
        cf: { cacheTtl: 60, cacheEverything: false },
      });
      const out = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) out.set(k, v);
      out.delete('content-security-policy');
      out.delete('content-security-policy-report-only');
      out.delete('set-cookie');
      return new Response(res.body, { status: res.status, headers: out });
    } catch (e) {
      return new Response(`Upstream failed: ${e.message}`, { status: 502, headers: CORS });
    }
  },
};
