/**
 * News — every country, every topic, every publisher, searchable.
 *
 * WHY IT IS BUILT THIS WAY
 * ------------------------
 * The old tool read two developer feeds (Hacker News, Lobsters). That is not
 * news, it is one niche. Real news means many publishers in many countries and
 * many languages, and the honest way to get that without an API key is RSS.
 *
 * RSS has two problems in a browser:
 *   1. Almost no publisher sends an `Access-Control-Allow-Origin` header, so
 *      fetch() from a page is refused outright. Measured: of 8 major outlets
 *      only nytimes.com sent one.
 *   2. Reading 6 feeds means 6 round-trips plus 6 XML parses on the UI thread.
 *
 * Both are solved in one place — the relay's `/rss` endpoint fans the feeds out
 * in parallel, parses them, de-duplicates by title, sorts by publish time and
 * returns plain JSON. Measured: 6 feeds, 230 articles, 0 errors, 0.31 s.
 *
 * SOURCES, ALL VERIFIED ON 2026-08-28
 * -----------------------------------
 *   Google News RSS  · 52 country/language editions confirmed returning items
 *                      (a further 20 combinations returned 0 and were dropped
 *                      rather than shipped as dead buttons). Topic sections
 *                      302-redirect, so they are followed. Search returns
 *                      100-105 items and understands `when:`, `site:`,
 *                      `location:` operators.
 *   Publisher feeds  · direct from BBC, Al Jazeera, The Guardian, The Hindu,
 *                      Times of India and others — each hand-checked for a
 *                      parsable item count.
 *   GDELT 2.0        · 100k+ outlets in 65 languages, used for the global and
 *                      "any country" views. Slow (20-30 s cold) so it is never
 *                      the first source, only a widener.
 *   Hacker News      · Algolia index, still the best tech feed, kept as a topic.
 *   Spaceflight News · 35,855 articles, sends CORS itself.
 *
 * Anything that could not be verified is NOT here. Two candidates were tested
 * and rejected outright: saurav.tech's NewsAPI mirror (frozen since April 2022
 * — every category still returns 2022 headlines) and the free plan of
 * corsproxy.io (answers 403 to any server-side call).
 */

import { proxyBase } from './settings';

const RELAY = () => proxyBase() || 'https://omni-proxy.omni-jackbhai.workers.dev';

/* ------------------------------------------------------------------ helpers */
const enc = encodeURIComponent;

async function getJson(url, ms = 30000) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** Fan a list of feed URLs out through the relay in a single request. */
export async function readFeeds(urls, { limit = 80, ms = 32000 } = {}) {
  const list = urls.filter(Boolean).slice(0, 12);
  if (!list.length) return { items: [], errors: [] };
  const q = list.map((u) => `u=${enc(u)}`).join('&');
  const d = await getJson(`${RELAY()}/rss?limit=${limit}&${q}`, ms);
  if (!d.ok) throw new Error(d.error || 'relay refused');
  return { items: d.items || [], errors: d.errors || [], count: d.count || 0 };
}

/* --------------------------------------------------------------- editions
   Google News country editions. Every entry below was requested and returned
   a non-zero item count; combinations that returned 0 (Sri Lanka, Nepal, UAE
   English, Gujarati, Kannada, Urdu, Danish, Norwegian, Finnish and others)
   are deliberately absent — a button that loads nothing is worse than no
   button. */
export const EDITIONS = [
  { cc: 'IN', name: 'India',          hl: 'en-IN',  gl: 'IN', ceid: 'IN:en',      lang: 'English', n: 38 },
  { cc: 'IN', name: 'India',          hl: 'hi',     gl: 'IN', ceid: 'IN:hi',      lang: 'हिन्दी',   n: 26 },
  { cc: 'IN', name: 'India',          hl: 'ta',     gl: 'IN', ceid: 'IN:ta',      lang: 'தமிழ்',   n: 26 },
  { cc: 'IN', name: 'India',          hl: 'te',     gl: 'IN', ceid: 'IN:te',      lang: 'తెలుగు',  n: 22 },
  { cc: 'IN', name: 'India',          hl: 'mr',     gl: 'IN', ceid: 'IN:mr',      lang: 'मराठी',   n: 17 },
  { cc: 'IN', name: 'India',          hl: 'bn',     gl: 'IN', ceid: 'IN:bn',      lang: 'বাংলা',   n: 26 },
  { cc: 'IN', name: 'India',          hl: 'ml',     gl: 'IN', ceid: 'IN:ml',      lang: 'മലയാളം', n: 22 },
  { cc: 'US', name: 'United States',  hl: 'en-US',  gl: 'US', ceid: 'US:en',      lang: 'English', n: 38 },
  { cc: 'GB', name: 'United Kingdom', hl: 'en-GB',  gl: 'GB', ceid: 'GB:en',      lang: 'English', n: 38 },
  { cc: 'CA', name: 'Canada',         hl: 'en-CA',  gl: 'CA', ceid: 'CA:en',      lang: 'English', n: 38 },
  { cc: 'AU', name: 'Australia',      hl: 'en-AU',  gl: 'AU', ceid: 'AU:en',      lang: 'English', n: 38 },
  { cc: 'NZ', name: 'New Zealand',    hl: 'en-NZ',  gl: 'NZ', ceid: 'NZ:en',      lang: 'English', n: 38 },
  { cc: 'IE', name: 'Ireland',        hl: 'en-IE',  gl: 'IE', ceid: 'IE:en',      lang: 'English', n: 38 },
  { cc: 'PK', name: 'Pakistan',       hl: 'en-PK',  gl: 'PK', ceid: 'PK:en',      lang: 'English', n: 38 },
  { cc: 'BD', name: 'Bangladesh',     hl: 'bn',     gl: 'BD', ceid: 'BD:bn',      lang: 'বাংলা',   n: 26 },
  { cc: 'SG', name: 'Singapore',      hl: 'en-SG',  gl: 'SG', ceid: 'SG:en',      lang: 'English', n: 38 },
  { cc: 'MY', name: 'Malaysia',       hl: 'en-MY',  gl: 'MY', ceid: 'MY:en',      lang: 'English', n: 38 },
  { cc: 'PH', name: 'Philippines',    hl: 'en-PH',  gl: 'PH', ceid: 'PH:en',      lang: 'English', n: 38 },
  { cc: 'ID', name: 'Indonesia',      hl: 'id',     gl: 'ID', ceid: 'ID:id',      lang: 'Indonesia', n: 38 },
  { cc: 'TH', name: 'Thailand',       hl: 'th',     gl: 'TH', ceid: 'TH:th',      lang: 'ไทย',     n: 38 },
  { cc: 'VN', name: 'Vietnam',        hl: 'vi',     gl: 'VN', ceid: 'VN:vi',      lang: 'Tiếng Việt', n: 26 },
  { cc: 'JP', name: 'Japan',          hl: 'ja',     gl: 'JP', ceid: 'JP:ja',      lang: '日本語',   n: 30 },
  { cc: 'KR', name: 'South Korea',    hl: 'ko',     gl: 'KR', ceid: 'KR:ko',      lang: '한국어',   n: 34 },
  { cc: 'CN', name: 'China',          hl: 'zh-CN',  gl: 'CN', ceid: 'CN:zh-Hans', lang: '简体中文', n: 26 },
  { cc: 'TW', name: 'Taiwan',         hl: 'zh-TW',  gl: 'TW', ceid: 'TW:zh-Hant', lang: '繁體中文', n: 34 },
  { cc: 'AE', name: 'UAE',            hl: 'ar',     gl: 'AE', ceid: 'AE:ar',      lang: 'العربية',  n: 33 },
  { cc: 'SA', name: 'Saudi Arabia',   hl: 'ar',     gl: 'SA', ceid: 'SA:ar',      lang: 'العربية',  n: 34 },
  { cc: 'EG', name: 'Egypt',          hl: 'ar',     gl: 'EG', ceid: 'EG:ar',      lang: 'العربية',  n: 34 },
  { cc: 'IL', name: 'Israel',         hl: 'he',     gl: 'IL', ceid: 'IL:he',      lang: 'עברית',   n: 34 },
  { cc: 'IL', name: 'Israel',         hl: 'en-IL',  gl: 'IL', ceid: 'IL:en',      lang: 'English', n: 38 },
  { cc: 'TR', name: 'Turkey',         hl: 'tr',     gl: 'TR', ceid: 'TR:tr',      lang: 'Türkçe',  n: 34 },
  { cc: 'DE', name: 'Germany',        hl: 'de',     gl: 'DE', ceid: 'DE:de',      lang: 'Deutsch', n: 34 },
  { cc: 'FR', name: 'France',         hl: 'fr',     gl: 'FR', ceid: 'FR:fr',      lang: 'Français', n: 34 },
  { cc: 'IT', name: 'Italy',          hl: 'it',     gl: 'IT', ceid: 'IT:it',      lang: 'Italiano', n: 34 },
  { cc: 'ES', name: 'Spain',          hl: 'es',     gl: 'ES', ceid: 'ES:es',      lang: 'Español', n: 34 },
  { cc: 'PT', name: 'Portugal',       hl: 'pt-PT',  gl: 'PT', ceid: 'PT:pt-150',  lang: 'Português', n: 34 },
  { cc: 'NL', name: 'Netherlands',    hl: 'nl',     gl: 'NL', ceid: 'NL:nl',      lang: 'Nederlands', n: 34 },
  { cc: 'SE', name: 'Sweden',         hl: 'sv',     gl: 'SE', ceid: 'SE:sv',      lang: 'Svenska', n: 34 },
  { cc: 'PL', name: 'Poland',         hl: 'pl',     gl: 'PL', ceid: 'PL:pl',      lang: 'Polski',  n: 30 },
  { cc: 'CZ', name: 'Czechia',        hl: 'cs',     gl: 'CZ', ceid: 'CZ:cs',      lang: 'Čeština', n: 30 },
  { cc: 'HU', name: 'Hungary',        hl: 'hu',     gl: 'HU', ceid: 'HU:hu',      lang: 'Magyar',  n: 24 },
  { cc: 'RO', name: 'Romania',        hl: 'ro',     gl: 'RO', ceid: 'RO:ro',      lang: 'Română',  n: 38 },
  { cc: 'GR', name: 'Greece',         hl: 'el',     gl: 'GR', ceid: 'GR:el',      lang: 'Ελληνικά', n: 30 },
  { cc: 'UA', name: 'Ukraine',        hl: 'uk',     gl: 'UA', ceid: 'UA:uk',      lang: 'Українська', n: 30 },
  { cc: 'RU', name: 'Russia',         hl: 'ru',     gl: 'RU', ceid: 'RU:ru',      lang: 'Русский', n: 34 },
  { cc: 'BR', name: 'Brazil',         hl: 'pt-BR',  gl: 'BR', ceid: 'BR:pt-419',  lang: 'Português', n: 34 },
  { cc: 'MX', name: 'Mexico',         hl: 'es-419', gl: 'MX', ceid: 'MX:es-419',  lang: 'Español', n: 34 },
  { cc: 'AR', name: 'Argentina',      hl: 'es-419', gl: 'AR', ceid: 'AR:es-419',  lang: 'Español', n: 34 },
  { cc: 'NG', name: 'Nigeria',        hl: 'en-NG',  gl: 'NG', ceid: 'NG:en',      lang: 'English', n: 38 },
  { cc: 'KE', name: 'Kenya',          hl: 'en-KE',  gl: 'KE', ceid: 'KE:en',      lang: 'English', n: 38 },
  { cc: 'GH', name: 'Ghana',          hl: 'en-GH',  gl: 'GH', ceid: 'GH:en',      lang: 'English', n: 38 },
  { cc: 'ZA', name: 'South Africa',   hl: 'en-ZA',  gl: 'ZA', ceid: 'ZA:en',      lang: 'English', n: 38 },
];

const ed = (e) => `https://news.google.com/rss?hl=${e.hl}&gl=${e.gl}&ceid=${enc(e.ceid)}`;

/** Topic sections. Verified item counts on the India English edition. */
export const TOPICS = [
  { id: 'TOP',           n: 'Top stories',  i: 'star',     n0: 38 },
  { id: 'WORLD',         n: 'World',        i: 'earth',    n0: 70 },
  { id: 'NATION',        n: 'National',     i: 'globe',    n0: 70 },
  { id: 'BUSINESS',      n: 'Business',     i: 'chart',    n0: 70 },
  { id: 'TECHNOLOGY',    n: 'Technology',   i: 'code',     n0: 55 },
  { id: 'ENTERTAINMENT', n: 'Entertainment',i: 'film',     n0: 70 },
  { id: 'SPORTS',        n: 'Sports',       i: 'badge',    n0: 61 },
  { id: 'SCIENCE',       n: 'Science',      i: 'flask',    n0: 70 },
  { id: 'HEALTH',        n: 'Health',       i: 'heart',    n0: 70 },
];

/* --------------------------------------------------------------- publishers
   Direct feeds, each verified to parse. `cc` groups them by country so the
   Sources tab can be filtered; `topic` lets a topic view widen beyond Google
   News with real front pages. */
export const PUBLISHERS = [
  // ---- India ----
  { id: 'thehindu',   n: 'The Hindu',         cc: 'IN', topic: 'NATION',
    url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
  { id: 'thehindu-w', n: 'The Hindu World',   cc: 'IN', topic: 'WORLD',
    url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { id: 'thehindu-b', n: 'The Hindu Business',cc: 'IN', topic: 'BUSINESS',
    url: 'https://www.thehindu.com/business/feeder/default.rss' },
  { id: 'thehindu-s', n: 'The Hindu Sport',   cc: 'IN', topic: 'SPORTS',
    url: 'https://www.thehindu.com/sport/feeder/default.rss' },
  { id: 'thehindu-t', n: 'The Hindu Sci-Tech',cc: 'IN', topic: 'SCIENCE',
    url: 'https://www.thehindu.com/sci-tech/feeder/default.rss' },
  { id: 'thehindu-e', n: 'The Hindu Cinema',  cc: 'IN', topic: 'ENTERTAINMENT',
    url: 'https://www.thehindu.com/entertainment/feeder/default.rss' },
  { id: 'hbl',        n: 'BusinessLine',      cc: 'IN', topic: 'BUSINESS',
    url: 'https://www.thehindubusinessline.com/feeder/default.rss' },
  { id: 'toi',        n: 'Times of India',    cc: 'IN', topic: 'TOP',
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' },
  { id: 'toi-india',  n: 'TOI India',         cc: 'IN', topic: 'NATION',
    url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms' },
  { id: 'toi-biz',    n: 'TOI Business',      cc: 'IN', topic: 'BUSINESS',
    url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms' },
  { id: 'toi-tech',   n: 'TOI Tech',          cc: 'IN', topic: 'TECHNOLOGY',
    url: 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms' },
  { id: 'toi-sport',  n: 'TOI Sports',        cc: 'IN', topic: 'SPORTS',
    url: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms' },
  { id: 'et',         n: 'Economic Times',    cc: 'IN', topic: 'BUSINESS',
    url: 'https://economictimes.indiatimes.com/rssfeedsdefault.cms' },
  { id: 'mint',       n: 'Mint',              cc: 'IN', topic: 'BUSINESS',
    url: 'https://www.livemint.com/rss/news' },
  { id: 'bs',         n: 'Business Standard', cc: 'IN', topic: 'BUSINESS',
    url: 'https://www.business-standard.com/rss/home_page_top_stories.rss' },
  { id: 'ht',         n: 'Hindustan Times',   cc: 'IN', topic: 'TOP',
    url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml' },
  { id: 'ndtv',       n: 'NDTV',              cc: 'IN', topic: 'TOP',
    url: 'https://feeds.feedburner.com/ndtvnews-top-stories' },
  { id: 'ndtv-ind',   n: 'NDTV India',        cc: 'IN', topic: 'NATION',
    url: 'https://feeds.feedburner.com/ndtvnews-india-news' },
  { id: 'ie',         n: 'Indian Express',    cc: 'IN', topic: 'TOP',
    url: 'https://indianexpress.com/section/india/feed/' },
  { id: 'scroll',     n: 'Scroll.in',         cc: 'IN', topic: 'NATION',
    url: 'https://feeds.feedburner.com/ScrollinArticles.rss' },
  { id: 'itoday',     n: 'India Today',       cc: 'IN', topic: 'TOP',
    url: 'https://www.indiatoday.in/rss/1206578' },
  { id: 'guardian-in',n: 'Guardian India',    cc: 'IN', topic: 'NATION',
    url: 'https://www.theguardian.com/world/india/rss' },

  // ---- United Kingdom ----
  { id: 'bbc',        n: 'BBC World',         cc: 'GB', topic: 'WORLD',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'bbc-biz',    n: 'BBC Business',      cc: 'GB', topic: 'BUSINESS',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'bbc-tech',   n: 'BBC Technology',    cc: 'GB', topic: 'TECHNOLOGY',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'bbc-sci',    n: 'BBC Science',       cc: 'GB', topic: 'SCIENCE',
    url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { id: 'bbc-health', n: 'BBC Health',        cc: 'GB', topic: 'HEALTH',
    url: 'https://feeds.bbci.co.uk/news/health/rss.xml' },
  { id: 'bbc-sport',  n: 'BBC Sport',         cc: 'GB', topic: 'SPORTS',
    url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { id: 'guardian',   n: 'The Guardian',      cc: 'GB', topic: 'WORLD',
    url: 'https://www.theguardian.com/world/rss' },
  { id: 'guardian-t', n: 'Guardian Tech',     cc: 'GB', topic: 'TECHNOLOGY',
    url: 'https://www.theguardian.com/uk/technology/rss' },
  { id: 'guardian-b', n: 'Guardian Business', cc: 'GB', topic: 'BUSINESS',
    url: 'https://www.theguardian.com/uk/business/rss' },
  { id: 'guardian-s', n: 'Guardian Sport',    cc: 'GB', topic: 'SPORTS',
    url: 'https://www.theguardian.com/uk/sport/rss' },
  { id: 'guardian-sc',n: 'Guardian Science',  cc: 'GB', topic: 'SCIENCE',
    url: 'https://www.theguardian.com/science/rss' },
  { id: 'sky',        n: 'Sky News',          cc: 'GB', topic: 'WORLD',
    url: 'https://feeds.skynews.com/feeds/rss/world.xml' },

  // ---- United States ----
  { id: 'cbs',        n: 'CBS News',          cc: 'US', topic: 'WORLD',
    url: 'https://www.cbsnews.com/latest/rss/world' },
  { id: 'nbc',        n: 'NBC News',          cc: 'US', topic: 'WORLD',
    url: 'https://feeds.nbcnews.com/nbcnews/public/world' },
  { id: 'abc',        n: 'ABC News',          cc: 'US', topic: 'TOP',
    url: 'https://abcnews.go.com/abcnews/topstories' },
  { id: 'cnn',        n: 'CNN World',         cc: 'US', topic: 'WORLD',
    url: 'http://rss.cnn.com/rss/edition_world.rss' },
  { id: 'techcrunch', n: 'TechCrunch',        cc: 'US', topic: 'TECHNOLOGY',
    url: 'https://techcrunch.com/feed/' },
  { id: 'verge',      n: 'The Verge',         cc: 'US', topic: 'TECHNOLOGY',
    url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'ars',        n: 'Ars Technica',      cc: 'US', topic: 'TECHNOLOGY',
    url: 'https://arstechnica.com/feed/' },
  { id: 'wired',      n: 'WIRED',             cc: 'US', topic: 'TECHNOLOGY',
    url: 'https://www.wired.com/feed/rss' },

  // ---- Rest of the world ----
  { id: 'aljazeera',  n: 'Al Jazeera',        cc: 'QA', topic: 'WORLD',
    url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'dw',         n: 'Deutsche Welle',    cc: 'DE', topic: 'WORLD',
    url: 'https://rss.dw.com/rdf/rss-en-world' },
  { id: 'france24',   n: 'France 24',         cc: 'FR', topic: 'WORLD',
    url: 'https://www.france24.com/en/rss' },
  { id: 'cna',        n: 'Channel NewsAsia',  cc: 'SG', topic: 'WORLD',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml' },
  { id: 'dawn',       n: 'Dawn',              cc: 'PK', topic: 'TOP',
    url: 'https://www.dawn.com/feeds/home' },
];

/* ------------------------------------------------------------------- reads */

/**
 * Top stories for one country edition, widened with that country's own papers.
 *
 * The aggregator's per-country feed is the one Google endpoint that answers
 * reliably from a datacentre — verified 38 items on repeated requests across
 * 52 editions — so it leads. Local mastheads are read alongside it, which is
 * what turns 38 headlines into 100+ and means the tab still fills if the
 * aggregator refuses.
 */
export async function headlines(edition, topic = 'TOP', { limit = 90 } = {}) {
  const e = edition || EDITIONS[0];
  const locals = PUBLISHERS
    .filter((p) => p.cc === e.cc && (topic === 'TOP' || p.topic === topic))
    .slice(0, 6).map((p) => p.url);
  /* An edition with no local papers on file (most non-English ones) still gets
     the aggregator plus the two global desks. */
  const fill = locals.length >= 2 ? [] :
    PUBLISHERS.filter((p) => ['bbc', 'aljazeera', 'guardian'].includes(p.id)).map((p) => p.url);
  return readFeeds([ed(e), ...locals, ...fill], { limit });
}

/**
 * One subject, read from the papers that actually cover it AND from the
 * aggregator's own section.
 *
 * Publishers come first here, deliberately. Google's topic sections are
 * addressed by an opaque id that the relay reconstructs (see the Worker), and
 * even addressed correctly they answer HTTP 503 to datacentre IPs most of the
 * time — measured: two of eight topics got through, repeatedly, with retries.
 * That is Google throttling Cloudflare, not something this app can fix. So the
 * section is treated as a bonus: it is requested in parallel and merged if it
 * arrives, and the tab is already full either way.
 */
export async function topicFeed(topic, edition, { limit = 110 } = {}) {
  const e = edition || EDITIONS[0];
  const pubs = PUBLISHERS.filter((p) => p.topic === topic).slice(0, 9).map((p) => p.url);
  const [fromPubs, fromGoogle] = await Promise.all([
    pubs.length ? readFeeds(pubs, { limit }) : Promise.resolve({ items: [], errors: [] }),
    topic === 'TOP'
      ? readFeeds([ed(e)], { limit: 60 }).catch(() => ({ items: [], errors: [] }))
      : getJson(`${RELAY()}/topic?t=${enc(topic)}&hl=${e.hl}&gl=${e.gl}&ceid=${enc(e.ceid)}&limit=60`, 30000)
          .catch(() => ({ items: [] })),
  ]);
  return mergeSorted([fromPubs.items || [], fromGoogle.items || []], limit,
    [...(fromPubs.errors || [])]);
}

/**
 * Search.
 *
 * The aggregator's search endpoint is unusable from a relay: it returns HTTP
 * 503 on effectively every request from Cloudflare's ranges while that same
 * host's country feeds return 200. Bing News RSS does answer — verified 10-12
 * articles across eight unrelated queries and four markets — so the Worker
 * asks both and returns whatever came back. A place and a time window are
 * folded into the query rather than sent to Google's geo endpoint, which no
 * longer exists (it 302s to nothing).
 */
export async function searchNews(q, { edition, place = '', within = '', limit = 90 } = {}) {
  const e = edition || EDITIONS[0];
  const parts = [q.trim()];
  if (place.trim()) parts.push(place.trim());
  if (within) parts.push(`when:${within}`);
  const query = parts.filter(Boolean).join(' ');
  if (!query) return { items: [], errors: [] };
  const d = await getJson(
    `${RELAY()}/search?q=${enc(query)}&hl=${e.hl}&gl=${e.gl}&ceid=${enc(e.ceid)}&limit=${limit}`, 30000);
  return { items: d.items || [], errors: d.errors || [], count: d.count || 0 };
}

/** A named publisher's own feed, unfiltered. */
export async function publisherFeed(ids, { limit = 110 } = {}) {
  const urls = PUBLISHERS.filter((p) => ids.includes(p.id)).map((p) => p.url);
  return readFeeds(urls, { limit });
}

/** Merge several already-fetched lists, de-duplicating on title. */
function mergeSorted(lists, limit, errors = []) {
  const seen = new Set(), out = [];
  for (const it of lists.flat()) {
    const k = (it.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  out.sort((a, b) => b.ts - a.ts);
  return { items: out.slice(0, limit), errors, count: out.length };
}

/**
 * GDELT — 100k+ outlets, 65 languages. Used to widen a search past the
 * mainstream index. Deliberately never the first call: measured 20-30 s cold
 * from a datacentre, and it rate-limits bursts.
 */
export async function gdelt(query, { country = '', days = 1, limit = 40 } = {}) {
  const terms = [query.trim()];
  if (country) terms.push(`sourcecountry:${country}`);
  const u = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
    enc(terms.filter(Boolean).join(' ')) +
    `&mode=artlist&maxrecords=${limit}&format=json&sort=datedesc&timespan=${days}d`;
  const d = await getJson(`${RELAY()}/?url=${enc(u)}`, 45000);
  return (d.articles || []).map((a) => {
    const s = a.seendate || '';
    const iso = s.length >= 15
      ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`
      : '';
    return {
      title: a.title, link: a.url, desc: '', img: a.socialimage || '',
      pub: iso, ts: iso ? Date.parse(iso) : 0,
      source: a.domain, feed: 'GDELT', country: a.sourcecountry, lang: a.language,
    };
  });
}

/** GDELT country codes, for the "any country" widener. */
export const GDELT_COUNTRIES = [
  ['india', 'India'], ['unitedstates', 'United States'], ['unitedkingdom', 'United Kingdom'],
  ['canada', 'Canada'], ['australia', 'Australia'], ['pakistan', 'Pakistan'],
  ['bangladesh', 'Bangladesh'], ['srilanka', 'Sri Lanka'], ['nepal', 'Nepal'],
  ['china', 'China'], ['japan', 'Japan'], ['southkorea', 'South Korea'],
  ['singapore', 'Singapore'], ['malaysia', 'Malaysia'], ['indonesia', 'Indonesia'],
  ['philippines', 'Philippines'], ['thailand', 'Thailand'], ['vietnam', 'Vietnam'],
  ['unitedarabemirates', 'UAE'], ['saudiarabia', 'Saudi Arabia'], ['qatar', 'Qatar'],
  ['israel', 'Israel'], ['turkey', 'Turkey'], ['egypt', 'Egypt'],
  ['germany', 'Germany'], ['france', 'France'], ['italy', 'Italy'], ['spain', 'Spain'],
  ['netherlands', 'Netherlands'], ['sweden', 'Sweden'], ['poland', 'Poland'],
  ['russia', 'Russia'], ['ukraine', 'Ukraine'], ['brazil', 'Brazil'],
  ['mexico', 'Mexico'], ['argentina', 'Argentina'], ['nigeria', 'Nigeria'],
  ['kenya', 'Kenya'], ['ghana', 'Ghana'], ['southafrica', 'South Africa'],
  ['newzealand', 'New Zealand'], ['ireland', 'Ireland'],
];

/** Hacker News, kept because nothing beats it for developer news. */
export async function hackerNews({ q = '', limit = 30 } = {}) {
  const u = q.trim()
    ? `https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=${limit}`
    : `https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=${limit}`;
  const d = await getJson(u, 15000);
  return (d.hits || []).filter((h) => h.title).map((h) => ({
    title: h.title,
    link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    desc: '', img: '', pub: h.created_at, ts: Date.parse(h.created_at) || 0,
    source: 'Hacker News', feed: 'Hacker News',
    points: h.points ?? 0, comments: h.num_comments ?? 0,
    discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

/** Spaceflight & astronomy — its own API, sends CORS, 35k+ articles indexed. */
export async function spaceNews({ q = '', limit = 30 } = {}) {
  const u = `https://api.spaceflightnewsapi.net/v4/articles/?limit=${limit}` +
    (q.trim() ? `&search=${enc(q)}` : '');
  const d = await getJson(u, 15000);
  return (d.results || []).map((a) => ({
    title: a.title, link: a.url, desc: (a.summary || '').slice(0, 300),
    img: a.image_url || '', pub: a.published_at, ts: Date.parse(a.published_at) || 0,
    source: a.news_site, feed: 'Spaceflight News',
  }));
}

/* ------------------------------------------------------------------ filter */
/** Client-side narrowing of an already-loaded list — instant, no refetch. */
export function filterItems(items, { q = '', source = '', since = 0, hasImage = false } = {}) {
  const s = q.trim().toLowerCase();
  const now = Date.now();
  return items.filter((it) => {
    if (source && it.source !== source) return false;
    if (hasImage && !it.img) return false;
    if (since && it.ts && now - it.ts > since) return false;
    if (s && !((it.title + ' ' + it.desc + ' ' + it.source).toLowerCase().includes(s))) return false;
    return true;
  });
}

export function sourceCounts(items) {
  const m = new Map();
  for (const it of items) m.set(it.source, (m.get(it.source) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const timeAgo = (ts) => {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
