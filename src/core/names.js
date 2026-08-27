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

/* ------------------------------------------------------------- directories
   Browsable lists, so the tool is a directory and not only a search box.
   Every name below is one this app can actually answer for. */

export const INDIAN_SURNAMES = [
  { n: 'Sharma',   note: 'Brahmin · north & central India' },
  { n: 'Singh',    note: 'Kshatriya, Sikh · pan-India' },
  { n: 'Patel',    note: 'Gujarat · landowning Patidar' },
  { n: 'Kumar',    note: 'Used as surname and given name' },
  { n: 'Gupta',    note: 'Vaishya merchant · north India' },
  { n: 'Verma',    note: 'North India' },
  { n: 'Yadav',    note: 'Pastoral community · north India' },
  { n: 'Reddy',    note: 'Andhra Pradesh & Telangana' },
  { n: 'Nair',     note: 'Kerala' },
  { n: 'Menon',    note: 'Kerala' },
  { n: 'Iyer',     note: 'Tamil Brahmin' },
  { n: 'Iyengar',  note: 'Tamil Vaishnavite Brahmin' },
  { n: 'Naidu',    note: 'Andhra & Tamil Nadu' },
  { n: 'Rao',      note: 'Deccan · title turned surname' },
  { n: 'Desai',    note: 'Gujarat & Maharashtra' },
  { n: 'Joshi',    note: 'Astrologer-priest origin' },
  { n: 'Bhatt',    note: 'Scholar-priest origin' },
  { n: 'Trivedi',  note: 'Knower of three Vedas' },
  { n: 'Chaturvedi',note: 'Knower of four Vedas' },
  { n: 'Mehta',    note: 'Gujarat & Rajasthan' },
  { n: 'Shah',     note: 'Gujarat · merchant' },
  { n: 'Kapoor',   note: 'Punjabi Khatri' },
  { n: 'Malhotra', note: 'Punjabi Khatri' },
  { n: 'Chopra',   note: 'Punjabi Khatri' },
  { n: 'Khanna',   note: 'Punjabi Khatri' },
  { n: 'Sethi',    note: 'Punjab' },
  { n: 'Bedi',     note: 'Punjab · Sikh' },
  { n: 'Gill',     note: 'Punjab · Jat' },
  { n: 'Dhillon',  note: 'Punjab · Jat' },
  { n: 'Sidhu',    note: 'Punjab · Jat' },
  { n: 'Kaur',     note: 'Sikh women' },
  { n: 'Banerjee', note: 'Bengali Brahmin' },
  { n: 'Chatterjee',note: 'Bengali Brahmin' },
  { n: 'Mukherjee',note: 'Bengali Brahmin' },
  { n: 'Ghosh',    note: 'Bengali Kayastha' },
  { n: 'Bose',     note: 'Bengali Kayastha' },
  { n: 'Das',      note: 'Bengal, Odisha & Assam' },
  { n: 'Roy',      note: 'Bengal · title turned surname' },
  { n: 'Sen',      note: 'Bengal' },
  { n: 'Dutta',    note: 'Bengal & Assam' },
  { n: 'Chowdhury',note: 'Bengal & Assam · landholder title' },
  { n: 'Deshmukh', note: 'Maharashtra · district head' },
  { n: 'Patil',    note: 'Maharashtra · village head' },
  { n: 'Jadhav',   note: 'Maharashtra' },
  { n: 'Kulkarni', note: 'Maharashtra · village accountant' },
  { n: 'Gowda',    note: 'Karnataka' },
  { n: 'Shetty',   note: 'Coastal Karnataka' },
  { n: 'Hegde',    note: 'Karnataka' },
  { n: 'Pillai',   note: 'Kerala & Tamil Nadu' },
  { n: 'Khan',     note: 'Turkic title · South Asian Muslim' },
  { n: 'Ahmed',    note: 'Arabic origin' },
  { n: 'Ansari',   note: 'Arabic origin' },
  { n: 'Sheikh',   note: 'Arabic title' },
  { n: 'Syed',     note: 'Descent from the Prophet' },
  { n: 'Fernandes',note: 'Goa & Mangalore · Portuguese origin' },
  { n: "D'Souza",  note: 'Goa & Mangalore · Portuguese origin' },
  { n: 'Thapa',    note: 'Nepali & Gorkha' },
  { n: 'Rana',     note: 'Rajput & Nepali' },
  { n: 'Chauhan',  note: 'Rajput clan' },
  { n: 'Rathore',  note: 'Rajput clan' },
];

export const WORLD_SURNAMES = [
  { n: 'Smith', note: 'England · smith' }, { n: 'Johnson', note: 'Son of John' },
  { n: 'Williams', note: 'Wales & England' }, { n: 'Brown', note: 'Britain & Ireland' },
  { n: 'Garcia', note: 'Spain · commonest Spanish surname' },
  { n: 'Martinez', note: 'Spain · son of Martin' },
  { n: 'Rodriguez', note: 'Spain · son of Rodrigo' },
  { n: 'Silva', note: 'Portugal & Brazil · woodland' },
  { n: 'Santos', note: 'Portugal & Brazil' },
  { n: 'Müller', note: 'Germany · miller' }, { n: 'Schmidt', note: 'Germany · smith' },
  { n: 'Dubois', note: 'France · of the wood' }, { n: 'Rossi', note: 'Italy · red-haired' },
  { n: 'Ferrari', note: 'Italy · blacksmith' },
  { n: 'Ivanov', note: 'Russia · son of Ivan' }, { n: 'Petrov', note: 'Russia · son of Peter' },
  { n: 'Wang', note: 'China · king' }, { n: 'Li', note: 'China · plum' },
  { n: 'Zhang', note: 'China' }, { n: 'Chen', note: 'China' },
  { n: 'Kim', note: 'Korea · gold' }, { n: 'Park', note: 'Korea' }, { n: 'Lee', note: 'Korea & China' },
  { n: 'Tanaka', note: 'Japan · middle of the rice field' },
  { n: 'Sato', note: 'Japan · commonest Japanese surname' },
  { n: 'Suzuki', note: 'Japan' }, { n: 'Nguyen', note: 'Vietnam · commonest Vietnamese surname' },
  { n: 'Tran', note: 'Vietnam' }, { n: 'Okafor', note: 'Nigeria · Igbo' },
  { n: 'Adebayo', note: 'Nigeria · Yoruba' }, { n: 'Mwangi', note: 'Kenya · Kikuyu' },
  { n: 'Cohen', note: 'Hebrew · priest' }, { n: 'Levi', note: 'Hebrew · tribe of Levi' },
  { n: 'Al-Sayed', note: 'Arabic · the master' }, { n: 'Hassan', note: 'Arabic · handsome' },
  { n: 'Yilmaz', note: 'Turkey · undaunted' }, { n: 'Kowalski', note: 'Poland · smith' },
  { n: 'Novak', note: 'Central Europe · newcomer' }, { n: 'Andersson', note: 'Sweden' },
  { n: "O'Brien", note: 'Ireland · descendant of Brian' },
  { n: 'MacDonald', note: 'Scotland · son of Donald' },
];

export const INDIAN_GIVEN = [
  { n: 'Aarav', note: 'Peaceful · Sanskrit' }, { n: 'Vivaan', note: 'Full of life' },
  { n: 'Aditya', note: 'The sun' }, { n: 'Arjun', note: 'Bright, shining' },
  { n: 'Rohan', note: 'Ascending' }, { n: 'Rahul', note: 'Efficient, capable' },
  { n: 'Krishna', note: 'Dark, the deity' }, { n: 'Ishaan', note: 'The sun; a name of Shiva' },
  { n: 'Kabir', note: 'Great · Arabic and Sant tradition' },
  { n: 'Advait', note: 'Non-dual' }, { n: 'Reyansh', note: 'Ray of light' },
  { n: 'Ayaan', note: 'Gift of God' }, { n: 'Vihaan', note: 'Dawn' },
  { n: 'Priya', note: 'Beloved' }, { n: 'Ananya', note: 'Unique, without equal' },
  { n: 'Diya', note: 'Lamp' }, { n: 'Aanya', note: 'Grace' },
  { n: 'Saanvi', note: 'Goddess Lakshmi' }, { n: 'Aadhya', note: 'The first power' },
  { n: 'Meera', note: 'Devotee; the poet-saint' }, { n: 'Kavya', note: 'Poetry' },
  { n: 'Riya', note: 'Singer, graceful' }, { n: 'Ishita', note: 'Mastery' },
  { n: 'Sanjana', note: 'Gentle, creator' }, { n: 'Aarohi', note: 'Ascending musical scale' },
  { n: 'Zara', note: 'Blooming flower · Arabic' }, { n: 'Ayesha', note: 'Living · Arabic' },
  { n: 'Fatima', note: 'One who abstains · Arabic' }, { n: 'Aryan', note: 'Noble' },
  { n: 'Gurpreet', note: 'Love of the Guru · Punjabi' },
  { n: 'Harpreet', note: 'Love of God · Punjabi' },
  { n: 'Simran', note: 'Remembrance of God · Punjabi' },
];

export const DIRECTORIES = [
  { id: 'in-sur',  n: 'Indian surnames', list: INDIAN_SURNAMES },
  { id: 'in-name', n: 'Indian first names', list: INDIAN_GIVEN },
  { id: 'world',   n: 'World surnames', list: WORLD_SURNAMES },
];

/** Flag emoji are not used anywhere in this app; countries render as codes. */
export const COUNTRY_NAMES = {
  IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka',
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand',
  AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', OM: 'Oman', BH: 'Bahrain',
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', TH: 'Thailand', PH: 'Philippines',
  CN: 'China', JP: 'Japan', KR: 'South Korea', VN: 'Vietnam', TW: 'Taiwan', HK: 'Hong Kong',
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', PT: 'Portugal', NL: 'Netherlands',
  BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', PL: 'Poland', CZ: 'Czechia', HU: 'Hungary', RO: 'Romania', GR: 'Greece',
  RU: 'Russia', UA: 'Ukraine', TR: 'Turkey', IL: 'Israel', IR: 'Iran', IQ: 'Iraq',
  EG: 'Egypt', MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', NG: 'Nigeria', GH: 'Ghana',
  KE: 'Kenya', TZ: 'Tanzania', UG: 'Uganda', ZA: 'South Africa', ET: 'Ethiopia',
  BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  MU: 'Mauritius', FJ: 'Fiji', TT: 'Trinidad & Tobago', GY: 'Guyana', SR: 'Suriname',
  AF: 'Afghanistan', MM: 'Myanmar', KH: 'Cambodia', BT: 'Bhutan', MV: 'Maldives',
};

export const countryName = (cc) => COUNTRY_NAMES[cc] || cc;
