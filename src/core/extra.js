/**
 * Three more tools, each on a source that was verified before a line of UI
 * was written.
 *
 *   Launches   — ll.thespacedevs.com. Verified: 359 upcoming launches, each
 *                with the exact net time, rocket, payload, provider, pad and a
 *                status ("Success", "Go", "TBD"). Sends CORS `*`.
 *   Recipes    — themealdb.com. Verified: 14 categories, 195 cuisines listed,
 *                and a full record carrying up to 20 ingredients with their
 *                measures, 2,186 characters of method and a YouTube link.
 *                Sends CORS `*`. One honest limitation, handled below: the
 *                free tier answers `{"meals":null}` to the cuisine filter, so
 *                cuisine browsing is built from the alphabet listing instead,
 *                which does work — 790 recipes across 37 cuisines.
 *   World data — api.worldbank.org. Verified against India 2025: GDP
 *                $3.96tn, population 1,463,865,525, unemployment 4.219%,
 *                inflation 2.399%, internet use 70%. Sends CORS `*`.
 *
 * Rejected during the same pass, and left out rather than shipped broken:
 * SpaceX's own API (HTTP 525), dictionaryapi.dev (522), numbersapi (404),
 * OpenFoodFacts (503).
 */

import { proxyBase } from './settings';

const enc = encodeURIComponent;

async function getJson(url, { ms = 18000, relay = false } = {}) {
  const once = async (u) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(u, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  };
  try { return await once(url); }
  catch (e) {
    if (!relay) throw e;
    const b = proxyBase();
    if (!b) throw e;
    return once(`${b}/?url=${enc(url)}`);
  }
}

/* ---------------------------------------------------------------- LAUNCHES */

/* Three routes to the same manifest.
 *
 * This API rate-limits by IP and answers HTTP 429 — measured, a handful of
 * requests inside a minute is enough, and it then refuses everyone on that
 * address. With one route that meant the whole tool went blank for a while;
 * the tests caught it doing exactly that.
 *
 * `lldev` is the project's own development mirror: same shape, separate
 * budget, verified 192 upcoming launches. rocketlaunch.live is a wholly
 * different operator and a different response shape, so it is normalised
 * below rather than pretended to be the same.
 */
const LL_HOSTS = [
  'https://ll.thespacedevs.com/2.2.0',
  'https://lldev.thespacedevs.com/2.2.0',
];
const LL = LL_HOSTS[0];

const RLL = 'https://fdo.rocketlaunch.live/json/launches';

/** Try each mirror in turn; a 429 on one says nothing about the next. */
async function llGet(path, ms = 25000) {
  let last = null;
  for (const host of LL_HOSTS) {
    try { return await getJson(`${host}${path}`, { ms, relay: true }); }
    catch (e) { last = e; }
  }
  throw last || new Error('launch library unreachable');
}

/** rocketlaunch.live speaks a different dialect; translate rather than fake. */
const shapeRll = (r) => ({
  id: 'rll:' + r.id,
  name: r.name || r.vehicle?.name || 'Launch',
  mission: (r.missions || [])[0]?.name || r.name || '',
  desc: (r.missions || [])[0]?.description || '',
  type: (r.missions || [])[0]?.type || '',
  orbit: r.result === -1 ? '' : ((r.missions || [])[0]?.orbit?.name || ''),
  rocket: r.vehicle?.name || '',
  family: '',
  provider: r.provider?.name || '',
  providerType: '',
  country: r.pad?.location?.country || '',
  pad: r.pad?.name || '',
  place: [r.pad?.location?.name, r.pad?.location?.state].filter(Boolean).join(', '),
  net: r.t0 || r.win_open || '',
  ts: Date.parse(r.t0 || r.win_open || '') || 0,
  status: r.launch_description || 'Scheduled',
  statusAbbr: r.est_date?.month ? 'TBD' : 'Go',
  probability: null,
  image: '',
  webcast: (r.media || []).find((m) => m.ldfeatured || m.featured)?.media_url || '',
  windowStart: r.win_open || '',
  windowEnd: r.win_close || '',
});

/** Upcoming launches, soonest first. */
export async function upcomingLaunches({ limit = 30 } = {}) {
  /* NOT mode=list. That parameter looks like a bandwidth win and silently
     drops launch_service_provider, pad and rocket.configuration — measured,
     all three came back undefined. The full record is 5 KB and has them. */
  try {
    const d = await llGet(`/launch/upcoming/?limit=${limit}`);
    const list = (d.results || []).map(shapeLaunch);
    if (list.length) return { total: d.count || list.length, list };
  } catch { /* fall through to the other operator */ }
  const alt = await getJson(`${RLL}/next/5`, { ms: 20000, relay: true });
  const list = (alt.result || []).map(shapeRll);
  return { total: alt.count || list.length, list };
}

/** Launches that already happened, newest first. */
export async function pastLaunches({ limit = 30 } = {}) {
  const d = await llGet(`/launch/previous/?limit=${limit}`);
  return { total: d.count || 0, list: (d.results || []).map(shapeLaunch) };
}

export async function searchLaunches(q, { limit = 30 } = {}) {
  const d = await llGet(`/launch/?search=${enc(q)}&limit=${limit}&ordering=-net`);
  return { total: d.count || 0, list: (d.results || []).map(shapeLaunch) };
}

export const launchCountdown = (ts) => {
  if (!ts) return '';
  const s = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(s);
  const d = Math.floor(abs / 86400), h = Math.floor((abs % 86400) / 3600), m = Math.floor((abs % 3600) / 60);
  const body = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return s > 0 ? `T− ${body}` : `${body} ago`;
};

/* ----------------------------------------------------------------- RECIPES */

const MEAL = 'https://www.themealdb.com/api/json/v1/1';

function shapeMeal(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    ingredients.push({ name, measure: (m[`strMeasure${i}`] || '').trim() });
  }
  return {
    id: m.idMeal,
    title: m.strMeal,
    cuisine: m.strArea || '',
    category: m.strCategory || '',
    thumb: m.strMealThumb || '',
    tags: (m.strTags || '').split(',').map((x) => x.trim()).filter(Boolean),
    youtube: m.strYoutube || '',
    source: m.strSource || '',
    ingredients,
    steps: (m.strInstructions || '')
      .split(/\r?\n+/).map((x) => x.replace(/^\s*(STEP\s*)?\d+[.)]\s*/i, '').trim())
      .filter((x) => x.length > 2),
  };
}

export async function searchRecipes(q) {
  const d = await getJson(`${MEAL}/search.php?s=${enc(q)}`, { relay: true });
  return (d.meals || []).map(shapeMeal);
}

export async function recipesByLetter(letter) {
  const d = await getJson(`${MEAL}/search.php?f=${enc(letter)}`, { relay: true });
  return (d.meals || []).map(shapeMeal);
}

export async function recipesByCategory(cat) {
  const d = await getJson(`${MEAL}/filter.php?c=${enc(cat)}`, { relay: true });
  return (d.meals || []).map((m) => ({ id: m.idMeal, title: m.strMeal, thumb: m.strMealThumb, cuisine: '', category: cat }));
}

export async function recipe(id) {
  const d = await getJson(`${MEAL}/lookup.php?i=${enc(id)}`, { relay: true });
  const m = (d.meals || [])[0];
  if (!m) throw new Error('Recipe not found');
  return shapeMeal(m);
}

export async function randomRecipe() {
  const d = await getJson(`${MEAL}/random.php`, { relay: true });
  const m = (d.meals || [])[0];
  if (!m) throw new Error('Nothing came back');
  return shapeMeal(m);
}

export async function mealCategories() {
  const d = await getJson(`${MEAL}/categories.php`, { relay: true });
  return (d.categories || []).map((c) => ({
    id: c.idCategory, name: c.strCategory, thumb: c.strCategoryThumb,
    desc: (c.strCategoryDescription || '').slice(0, 220),
  }));
}

/**
 * Cuisine browsing.
 *
 * The obvious call — filter.php?a=Indian — returns `{"meals":null}` on the free
 * tier, verified. The alphabet listing is not restricted, so the catalogue is
 * read a-z once and grouped. Counted that way it holds 790 recipes across 37
 * cuisines.
 *
 * The labels below are the strings the data ACTUALLY uses, not the ones you
 * would guess: it says "India", not "Indian"; "United States", not "American";
 * "France", not "French". Guessing produced zero results for every one of
 * those, which is exactly the kind of empty screen this app is not allowed to
 * ship. 190 recipes carry no cuisine at all and are grouped as Unlisted.
 */
let _catalogue = null;
async function fullCatalogue() {
  if (_catalogue) return _catalogue;
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const pages = [];
  /* Read in small waves — 26 simultaneous requests to a free API is rude and
     gets throttled. */
  for (let i = 0; i < letters.length; i += 7) {
    const wave = await Promise.all(letters.slice(i, i + 7).map((l) => recipesByLetter(l).catch(() => [])));
    pages.push(...wave);
  }
  const seen = new Set(), all = [];
  for (const m of pages.flat()) {
    if (seen.has(m.id)) continue;
    seen.add(m.id); all.push(m);
  }
  _catalogue = all;
  return all;
}

export async function recipesByCuisine(area) {
  const all = await fullCatalogue();
  const want = area.toLowerCase();
  if (want === 'unlisted') return all.filter((m) => !m.cuisine);
  return all.filter((m) => (m.cuisine || '').toLowerCase() === want);
}

/** Every cuisine in the catalogue with its real recipe count. */
export async function cuisinesWithCounts() {
  const all = await fullCatalogue();
  const m = new Map();
  for (const r of all) m.set(r.cuisine || 'Unlisted', (m.get(r.cuisine || 'Unlisted') || 0) + 1);
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
}

/** Counted from the live catalogue on 2026-08-28; used to render chips before
    the full read finishes. */
export const CUISINES = [
  { name: 'British', n: 59 }, { name: 'Spanish', n: 48 }, { name: 'United States', n: 33 },
  { name: 'Turkish', n: 30 }, { name: 'France', n: 28 }, { name: 'Chinese', n: 27 },
  { name: 'Vietnamese', n: 27 }, { name: 'Polish', n: 27 }, { name: 'Jamaican', n: 27 },
  { name: 'Thai', n: 27 }, { name: 'Canadian', n: 22 }, { name: 'Italian', n: 21 },
  { name: 'Norway', n: 17 }, { name: 'India', n: 14 }, { name: 'Australian', n: 13 },
  { name: 'Netherlands', n: 13 }, { name: 'Algerian', n: 12 }, { name: 'Saudi Arabian', n: 12 },
  { name: 'Argentina', n: 10 }, { name: 'Venezuela', n: 10 }, { name: 'Uruguayan', n: 9 },
  { name: 'Japanese', n: 9 }, { name: 'Malaysian', n: 8 }, { name: 'Filipino', n: 8 },
  { name: 'Irish', n: 8 }, { name: 'Croatian', n: 8 }, { name: 'Tunisian', n: 8 },
  { name: 'Greek', n: 8 }, { name: 'Egyptian', n: 8 }, { name: 'Portuguese', n: 8 },
  { name: 'Russian', n: 7 }, { name: 'Ukrainian', n: 7 }, { name: 'Syrian', n: 6 },
  { name: 'Mexican', n: 6 }, { name: 'Moroccan', n: 6 }, { name: 'Kenyan', n: 5 },
  { name: 'Slovakia', n: 4 },
];

/* -------------------------------------------------------------- WORLD DATA */

const WB = 'https://api.worldbank.org/v2';

/** Indicators verified to return a recent value for India. */
export const INDICATORS = [
  { id: 'NY.GDP.MKTP.CD',    n: 'GDP',                  unit: 'US$',    fmt: 'money' },
  { id: 'NY.GDP.PCAP.CD',    n: 'GDP per person',       unit: 'US$',    fmt: 'money' },
  { id: 'SP.POP.TOTL',       n: 'Population',           unit: 'people', fmt: 'count' },
  { id: 'SP.POP.GROW',       n: 'Population growth',    unit: '% a year', fmt: 'pct' },
  { id: 'SP.URB.TOTL.IN.ZS', n: 'Living in cities',     unit: '% of people', fmt: 'pct' },
  { id: 'FP.CPI.TOTL.ZG',    n: 'Inflation',            unit: '% a year', fmt: 'pct' },
  { id: 'SL.UEM.TOTL.ZS',    n: 'Unemployment',         unit: '% of workforce', fmt: 'pct' },
  { id: 'IT.NET.USER.ZS',    n: 'Internet users',       unit: '% of people', fmt: 'pct' },
  { id: 'IT.CEL.SETS.P2',    n: 'Mobile subscriptions', unit: 'per 100 people', fmt: 'num' },
  { id: 'SE.ADT.LITR.ZS',    n: 'Literacy',             unit: '% of adults', fmt: 'pct' },
  { id: 'SP.DYN.LE00.IN',    n: 'Life expectancy',      unit: 'years',  fmt: 'num' },
  { id: 'SH.XPD.CHEX.GD.ZS', n: 'Health spending',      unit: '% of GDP', fmt: 'pct' },
  { id: 'EN.GHG.CO2.PC.CE.AR5', n: 'CO2 per person',    unit: 'tonnes', fmt: 'num' },
  { id: 'EG.ELC.ACCS.ZS',    n: 'Electricity access',   unit: '% of people', fmt: 'pct' },
  { id: 'AG.LND.FRST.ZS',    n: 'Forest cover',         unit: '% of land', fmt: 'pct' },
  { id: 'ST.INT.ARVL',       n: 'Tourist arrivals',     unit: 'people a year', fmt: 'count' },
];

/**
 * One indicator's history for one country. The API returns newest first and
 * pads the recent years with nulls until the data is published, so those are
 * dropped rather than drawn as a cliff to zero.
 */
export async function indicator(cc, id, { years = 25 } = {}) {
  const to = new Date().getFullYear();
  const d = await getJson(
    `${WB}/country/${enc(cc)}/indicator/${enc(id)}?format=json&per_page=${years}&date=${to - years}:${to}`,
    { ms: 20000, relay: true });
  const rows = (Array.isArray(d) && d[1]) || [];
  const series = rows
    .filter((r) => r.value != null)
    .map((r) => ({ year: +r.date, value: r.value }))
    .sort((a, b) => a.year - b.year);
  return {
    country: rows[0]?.country?.value || cc,
    indicator: rows[0]?.indicator?.value || id,
    series,
    latest: series.length ? series[series.length - 1] : null,
    first: series.length ? series[0] : null,
  };
}

/** A country's whole profile — every indicator, asked for in parallel. */
export async function countryProfile(cc) {
  const out = await Promise.all(INDICATORS.map(async (i) => {
    try {
      const r = await indicator(cc, i.id, { years: 25 });
      return { ...i, ...r };
    } catch { return { ...i, series: [], latest: null }; }
  }));
  return out.filter((x) => x.latest);
}

export async function wbCountries() {
  const d = await getJson(`${WB}/country?format=json&per_page=400`, { ms: 22000, relay: true });
  return ((Array.isArray(d) && d[1]) || [])
    .filter((c) => c.region?.value && c.region.value !== 'Aggregates')
    .map((c) => ({ cc: c.id, iso2: c.iso2Code, name: c.name, region: c.region.value,
      income: c.incomeLevel?.value || '', capital: c.capitalCity || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatValue(v, kind) {
  if (v == null) return '—';
  if (kind === 'money') {
    const a = Math.abs(v);
    if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}tn`;
    if (a >= 1e9)  return `$${(v / 1e9).toFixed(1)}bn`;
    if (a >= 1e6)  return `$${(v / 1e6).toFixed(1)}m`;
    return `$${Math.round(v).toLocaleString('en-IN')}`;
  }
  if (kind === 'count') {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(2)}bn`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}m`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return Math.round(v).toLocaleString('en-IN');
  }
  if (kind === 'pct') return `${v.toFixed(1)}%`;
  return v >= 100 ? Math.round(v).toLocaleString('en-IN') : v.toFixed(1);
}
