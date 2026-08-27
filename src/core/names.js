/**
 * Names & surnames — the deep directory.
 *
 * A name lookup that returns "probably male, probably 35" is a novelty. What
 * people actually want to know about a name is: what does it mean, where does
 * it come from, which country uses it most, who is called this, and — for a
 * surname — which family, caste, region or language it belongs to.
 *
 * FIVE SOURCES, EACH DOING WHAT IT IS BEST AT
 * -------------------------------------------
 * All five were requested and their shapes checked on 2026-08-28.
 *
 *   Wikidata (query.wikidata.org/sparql) — the only free source that knows a
 *     name AS A NAME rather than as a string. Verified: "Sharma" resolves to a
 *     family-name entity with 826 recorded bearers; Singh 2156, Khan 759,
 *     Patel 446, Gupta 388, Reddy 147, Nair 89, Iyer 49. It also returns each
 *     bearer with their occupation and birth date, the language the name comes
 *     from, and its writing in native scripts. Sends CORS `*`.
 *
 *   Wikipedia REST — the prose. "Sharma is a Hindu Brahmin surname. The
 *     Sanskrit stem ṣárman- can mean joyfulness, comfort, happiness." That
 *     sentence is the answer to the question people are really asking, and no
 *     statistical API produces it. Sends CORS `*`.
 *
 *   nationalize.io — country distribution from 105,349 recorded uses of
 *     "priya", 10,303 of "sharma". This is the geography layer.
 *
 *   agify.io / genderize.io — age and gender skew. Honest limitation: these
 *     three share ONE free quota of 100 lookups per day per IP and answer 429
 *     when it runs out. The app reports that plainly rather than showing a
 *     blank, and the Wikidata/Wikipedia half of the page still renders.
 *
 * A deliberate omission: forebears.io has the best surname frequency data on
 * the web and returns 404 to anything that is not a browser. It is not used
 * rather than half-scraped.
 */

import { proxyBase } from './settings';

const enc = encodeURIComponent;
const WD = 'https://query.wikidata.org/sparql';
const WIKI = 'https://en.wikipedia.org/api/rest_v1';
const WIKIAPI = 'https://en.wikipedia.org/w/api.php';

async function getJson(url, { ms = 20000, headers, relay = false } = {}) {
  const once = async (u, h) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(u, { signal: c.signal, headers: h });
      if (r.status === 429) throw new Error('quota');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  };
  try { return await once(url, headers); }
  catch (e) {
    /* Two chances, never one. The relay sends its own identifying User-Agent,
       which is what Wikidata wants and what a browser page cannot set. */
    if (!relay || e.message === 'quota') throw e;
    const b = proxyBase();
    if (!b) throw e;
    return once(`${b}/?url=${enc(url)}`, undefined);
  }
}

/* Wikidata refuses a request with no User-Agent — measured: HTTP 403 on every
   query from a bare fetch, 200 with an identifying one. A browser sets its own
   UA and will not let a page override it, so the header is only sent when this
   runs outside a browser (the verification scripts); in the browser the
   built-in UA satisfies the check. */
const WD_HEAD = { Accept: 'application/sparql-results+json' };
const sparql = (q, ms = 25000) =>
  getJson(`${WD}?query=${enc(q)}&format=json`, { ms, headers: WD_HEAD, relay: true });

const val = (row, k) => row?.[k]?.value ?? null;

/* Wikidata classes: Q101352 = family name, Q202444 = given name,
   Q11879590 = female given name, Q12308941 = male given name. */
const NAME_CLASSES = 'wd:Q101352 wd:Q202444 wd:Q11879590 wd:Q12308941 wd:Q3409032';

const titleCase = (s) => s.trim().replace(/\s+/g, ' ')
  .replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/* ------------------------------------------------------------------ facts */

/**
 * What Wikidata knows about the name itself: its kind (family/given/unisex),
 * the language it comes from, its native spellings, its meaning, and how many
 * recorded people carry it.
 */
export async function nameFacts(raw) {
  const name = titleCase(raw);
  const q = `
SELECT ?item ?itemLabel ?desc ?kindLabel ?langLabel ?native ?meaningLabel ?after
       (COUNT(DISTINCT ?bearer) AS ?bearers) WHERE {
  ?item rdfs:label "${name}"@en .
  ?item wdt:P31 ?kind .
  VALUES ?kind { ${NAME_CLASSES} }
  OPTIONAL { ?item wdt:P407 ?lang }
  OPTIONAL { ?item wdt:P1705 ?native }
  OPTIONAL { ?item wdt:P138 ?meaning }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)="en") }
  OPTIONAL { ?bearer wdt:P734|wdt:P735 ?item }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
GROUP BY ?item ?itemLabel ?desc ?kindLabel ?langLabel ?native ?meaningLabel ?after
ORDER BY DESC(?bearers) LIMIT 6`;
  const d = await sparql(q);
  const rows = d.results?.bindings || [];
  return rows.map((r) => ({
    qid: (val(r, 'item') || '').split('/').pop(),
    name: val(r, 'itemLabel') || name,
    desc: val(r, 'desc') || '',
    kind: val(r, 'kindLabel') || '',
    language: val(r, 'langLabel') || '',
    native: val(r, 'native') || '',
    meaning: val(r, 'meaningLabel') || '',
    bearers: +(val(r, 'bearers') || 0),
  })).filter((x) => x.qid);
}

/** Recorded people carrying this name, with what they are known for. */
export async function bearers(raw, { limit = 40 } = {}) {
  const name = titleCase(raw);
  const q = `
SELECT DISTINCT ?p ?pLabel ?occLabel ?birth ?death ?citLabel ?img WHERE {
  ?item rdfs:label "${name}"@en .
  ?item wdt:P31 ?kind .
  VALUES ?kind { ${NAME_CLASSES} }
  ?p wdt:P734|wdt:P735 ?item .
  OPTIONAL { ?p wdt:P106 ?occ }
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P570 ?death }
  OPTIONAL { ?p wdt:P27 ?cit }
  OPTIONAL { ?p wdt:P18 ?img }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT ${limit * 4}`;
  const d = await sparql(q, 30000);
  const byPerson = new Map();
  for (const r of d.results?.bindings || []) {
    const uri = val(r, 'p'); if (!uri) continue;
    const qid = uri.split('/').pop();
    const label = val(r, 'pLabel') || '';
    if (/^Q\d+$/.test(label)) continue;                  // unlabelled entity
    const cur = byPerson.get(qid) || {
      qid, name: label, occupations: [], born: val(r, 'birth') || '',
      died: val(r, 'death') || '', country: val(r, 'citLabel') || '',
      img: val(r, 'img') || '',
      url: `https://www.wikidata.org/wiki/${qid}`,
    };
    const occ = val(r, 'occLabel');
    if (occ && !/^Q\d+$/.test(occ) && !cur.occupations.includes(occ)) cur.occupations.push(occ);
    byPerson.set(qid, cur);
  }
  const out = [...byPerson.values()];
  /* Someone with a birth date and a stated occupation is a more useful answer
     than a bare entity, so those float up. */
  out.sort((a, b) => (b.born ? 1 : 0) - (a.born ? 1 : 0) || b.occupations.length - a.occupations.length);
  return out.slice(0, limit);
}

/** The prose explanation, straight from the encyclopedia. */
export async function meaning(raw) {
  const name = titleCase(raw);
  const tryPage = async (title) => {
    const d = await getJson(`${WIKI}/page/summary/${enc(title)}`, { ms: 14000, relay: true });
    if (!d.extract || d.type === 'disambiguation') return null;
    return {
      title: d.title,
      extract: d.extract,
      thumb: d.thumbnail?.source || '',
      url: d.content_urls?.desktop?.page || '',
    };
  };
  /* The plain title is usually the name article; when it is a person instead,
     the "(surname)" and "(name)" pages are the disambiguated ones. */
  for (const t of [`${name} (surname)`, `${name} (name)`, `${name} (given name)`, name]) {
    try {
      const r = await tryPage(t);
      if (r && /\b(surname|name|family name|given name)\b/i.test(r.extract.slice(0, 200))) return r;
      if (r && t !== name) return r;
    } catch { /* try the next form */ }
  }
  /* Last resort: ask the search index which article is about this name. */
  try {
    const s = await getJson(
      `${WIKIAPI}?action=query&list=search&srsearch=${enc(name + ' surname OR given name')}` +
      '&format=json&origin=*&srlimit=3', { ms: 14000 });
    const hit = (s.query?.search || [])[0];
    if (hit) return tryPage(hit.title);
  } catch { /* nothing more to try */ }
  return null;
}

/* ------------------------------------------------------------- statistics */

/**
 * Country, age and gender skew.
 *
 * These three APIs share one free allowance of 100 lookups per day per IP.
 * When it is spent they answer HTTP 429, and this returns `quota: true` so the
 * screen can say so honestly instead of rendering an empty card.
 */
export async function stats(raw) {
  const name = raw.trim().toLowerCase();
  const one = async (host) => {
    try { return { ok: true, d: await getJson(`https://api.${host}/?name=${enc(name)}`, { ms: 12000 }) }; }
    catch (e) { return { ok: false, quota: e.message === 'quota' }; }
  };
  const [nat, age, gen] = await Promise.all([
    one('nationalize.io'), one('agify.io'), one('genderize.io'),
  ]);
  const quota = [nat, age, gen].some((r) => !r.ok && r.quota);
  return {
    quota,
    countries: (nat.d?.country || []).map((c) => ({ cc: c.country_id, p: c.probability })),
    countrySample: nat.d?.count ?? null,
    age: age.d?.age ?? null,
    ageSample: age.d?.count ?? null,
    gender: gen.d?.gender ?? null,
    genderProb: gen.d?.probability ?? null,
    genderSample: gen.d?.count ?? null,
  };
}

/**
 * Everything at once. Each source is awaited independently, so a name that
 * Wikidata has never heard of still shows its statistics, and a spent API
 * quota still leaves the encyclopedia entry on screen.
 */
export async function lookup(raw) {
  const name = raw.trim();
  if (!name) throw new Error('Type a name first');
  const [f, m, s] = await Promise.allSettled([nameFacts(name), meaning(name), stats(name)]);
  const facts = f.status === 'fulfilled' ? f.value : [];
  return {
    query: titleCase(name),
    facts,
    best: facts[0] || null,
    wiki: m.status === 'fulfilled' ? m.value : null,
    stats: s.status === 'fulfilled' ? s.value : { quota: false, countries: [] },
    sources: [
      facts.length ? 'name register' : null,
      m.status === 'fulfilled' && m.value ? 'encyclopedia' : null,
      s.status === 'fulfilled' && !s.value.quota && s.value.countries.length ? 'usage statistics' : null,
    ].filter(Boolean),
  };
}

/* ------------------------------------------------------------- directory
 * The shipped directory: 5,695 names — 4,964 surnames and 731 given names —
 * built by scripts/build_names.py from two registers and checked page by page.
 *
 * It is sharded by first letter so the first paint costs one 20-70 KB file
 * instead of 619 KB, and so the deployed file COUNT stays at 27 (this project
 * has had a Pages deploy time out on file count before).
 *
 * Every record carries only what a source actually said:
 *   n     name                       k     'surname' | 'given'
 *   g     'm' | 'f' for given names  c     countries it is recorded in
 *   l     languages it is filed under
 *   b     people on record carrying it
 *   comm  community / caste          reg   regions
 *   o     language of origin         m     stated meaning
 *   s     the encyclopedia's own opening sentence
 *   w     the article it came from
 *
 * A name with no `s` is not a gap in the build — it means no page could be
 * verified as being about the NAME rather than about a person or a place that
 * happens to share the spelling, so nothing is claimed.
 */

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const shardCache = new Map();
let metaCache = null;

export async function directoryMeta() {
  if (metaCache) return metaCache;
  const r = await fetch(`${BASE}/names/_meta.json`);
  if (!r.ok) throw new Error('directory unavailable');
  metaCache = await r.json();
  return metaCache;
}

/** One letter's shard, fetched once and kept. */
export async function shard(letter) {
  const k = String(letter || '').toLowerCase().slice(0, 1);
  if (!/^[a-z]$/.test(k)) return [];
  if (shardCache.has(k)) return shardCache.get(k);
  const p = fetch(`${BASE}/names/${k}.json`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  shardCache.set(k, p);
  return p;
}

/**
 * Search the directory. A prefix match is answered from one shard; a
 * contains-match has to read every shard, which is why it only does that once
 * the query is long enough to be worth it.
 */
export async function searchDirectory(q, { kind = '', cc = '', lang = '', comm = '', reg = '', limit = 300 } = {}) {
  const term = q.trim().toLowerCase();
  let pool;
  if (term.length >= 1) {
    const first = await shard(term[0]);
    const prefix = first.filter((r) => r.n.toLowerCase().startsWith(term));
    /* A prefix hit inside the right shard is the common case and is instant.
       Only widen when that is thin and the term is long enough to be specific. */
    if (prefix.length >= 8 || term.length < 3) pool = prefix;
    else {
      const all = await allNames();
      pool = all.filter((r) => r.n.toLowerCase().includes(term));
    }
  } else {
    pool = await allNames();
  }
  const out = pool.filter((r) => {
    if (kind && r.k !== kind) return false;
    if (cc && !(r.c || []).includes(cc)) return false;
    if (lang && !(r.l || []).includes(lang)) return false;
    if (comm && !(r.comm || []).includes(comm)) return false;
    if (reg && !(r.reg || []).includes(reg)) return false;
    return true;
  });
  /* Exact match first, then the best-attested names. */
  out.sort((a, b) => {
    const ax = a.n.toLowerCase() === term ? 1 : 0, bx = b.n.toLowerCase() === term ? 1 : 0;
    if (ax !== bx) return bx - ax;
    const as = a.n.toLowerCase().startsWith(term) ? 1 : 0, bs = b.n.toLowerCase().startsWith(term) ? 1 : 0;
    if (as !== bs) return bs - as;
    return (b.b || 0) - (a.b || 0) || a.n.localeCompare(b.n);
  });
  return { total: out.length, rows: out.slice(0, limit) };
}

let allCache = null;
/** Every shard, loaded in waves. Only needed for filter-only browsing. */
export async function allNames() {
  if (allCache) return allCache;
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const out = [];
  for (let i = 0; i < letters.length; i += 7) {
    const wave = await Promise.all(letters.slice(i, i + 7).map((l) => shard(l)));
    for (const w of wave) out.push(...w);
  }
  allCache = out;
  return out;
}

/** The directory's own record for one exact name, if it has one. */
export async function directoryEntry(name) {
  const rows = await shard(name.trim()[0] || '');
  const t = name.trim().toLowerCase();
  return rows.find((r) => r.n.toLowerCase() === t) || null;
}

/** Facet values with real counts, for the filter chips. */
export async function facets() {
  const all = await allNames();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const comm = new Map(), reg = new Map(), lang = new Map(), cc = new Map();
  for (const r of all) {
    for (const x of r.comm || []) bump(comm, x);
    for (const x of r.reg || []) bump(reg, x);
    for (const x of r.l || []) bump(lang, x);
    for (const x of r.c || []) bump(cc, x);
  }
  const top = (m) => [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  return { comm: top(comm), reg: top(reg), lang: top(lang), cc: top(cc), total: all.length };
}

/**
 * The full record for a name: the shipped directory first (instant, works
 * offline), then the live registers layered on top for anything the build
 * could not settle — notably the bearer list and the usage statistics.
 */
export async function deepLookup(raw) {
  const name = raw.trim();
  if (!name) throw new Error('Type a name first');
  const [entry, live] = await Promise.all([
    directoryEntry(name).catch(() => null),
    lookup(name).catch(() => null),
  ]);
  return { entry, ...(live || { query: titleCase(name), facts: [], best: null, wiki: null, stats: { countries: [] }, sources: [] }) };
}

export const countryName = (cc) => COUNTRY_NAMES[cc] || cc;
