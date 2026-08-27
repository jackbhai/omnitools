/**
 * Delhi Metro journey planner.
 *
 * Data: src/data/metro-delhi.json — built from OpenStreetMap route=subway
 * relations (see scripts/build_metro.mjs). 289 real stations, 16 line branches,
 * 27 genuine interchanges. Nothing invented.
 *
 * Fares: DMRC slabs effective 25 Aug 2025, cross-checked against four
 * independent published reports (₹11/21/32/43/54/64 weekday).
 *
 * Algorithm: k-shortest-paths via repeated Dijkstra with edge penalties, so the
 * user sees several genuinely different options (fastest / fewest changes),
 * not one answer.
 */
// Vite inlines this JSON at build time. (The Node verification script uses a
// small loader shim so the same module works in both environments.)
import DATA from '../data/metro-delhi.json';

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const STATIONS = DATA.stations;
export const LINES = DATA.lines;
export const BUILT = DATA.built;
const POS = new Map(STATIONS.map((s) => [s.n, s]));

/* adjacency: station -> [{ to, line, colour, km }] */
const ADJ = new Map();
for (const L of LINES) {
  for (let i = 0; i < L.s.length - 1; i++) {
    const a = L.s[i], b = L.s[i + 1];
    const pa = POS.get(a), pb = POS.get(b);
    if (!pa || !pb) continue;
    const km = haversine(pa, pb);
    if (!ADJ.has(a)) ADJ.set(a, []);
    if (!ADJ.has(b)) ADJ.set(b, []);
    ADJ.get(a).push({ to: b, line: L.l, colour: L.c, km });
    ADJ.get(b).push({ to: a, line: L.l, colour: L.c, km });
  }
}

export const stationNames = [...POS.keys()].sort();
export const isStation = (n) => POS.has(n);

/* Historic / colloquial names users still type. Maps to the current OSM name. */
const ALIASES = {
  'huda city centre': 'Millennium City Centre Gurugram',
  'huda city center': 'Millennium City Centre Gurugram',
  'gurgaon city centre': 'Millennium City Centre Gurugram',
  'cp': 'Rajiv Chowk',
  'connaught place': 'Rajiv Chowk',
  'igi airport': 'Airport',
  'new delhi railway station': 'New Delhi',
  'nizamuddin': 'Hazrat Nizamuddin',
  'hkas': 'Hauz Khas',
};

export function resolveAlias(q) {
  const k = (q || '').toLowerCase().trim();
  return ALIASES[k] && POS.has(ALIASES[k]) ? ALIASES[k] : null;
}

export function searchStations(q, limit = 8) {
  const alias = resolveAlias(q);
  if (alias) return [alias];
  if (!q?.trim()) return [];
  const s = q.toLowerCase().trim();
  const starts = [], contains = [];
  for (const n of stationNames) {
    const l = n.toLowerCase();
    if (l.startsWith(s)) starts.push(n);
    else if (l.includes(s)) contains.push(n);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/* Real DMRC fare slabs. */
export function fareFor(km, { holiday = false, smartcard = false, airport = false } = {}) {
  const table = airport ? DATA.fares.airportExpress
    : holiday ? DATA.fares.holiday : DATA.fares.weekday;
  let base = table[table.length - 1][1];
  for (const [upto, amt] of table) { if (km <= upto) { base = amt; break; } }
  return smartcard ? Math.round(base * (1 - DATA.fares.smartcardDiscount)) : base;
}

/** Dijkstra where each interchange costs `changePenalty` extra minutes. */
function dijkstra(src, dst, { changePenalty = 7, banEdges = new Set() } = {}) {
  const MIN_PER_KM = 1 / 0.55;           // ~33 km/h average incl. dwell time
  const best = new Map();                // "station|line" -> cost
  const pq = [{ cost: 0, at: src, line: null, path: [{ n: src, line: null }] }];

  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift();
    const key = cur.at + '|' + cur.line;
    if (best.has(key) && best.get(key) <= cur.cost) continue;
    best.set(key, cur.cost);
    if (cur.at === dst) return cur;

    for (const e of ADJ.get(cur.at) || []) {
      const edgeId = [cur.at, e.to, e.line].sort().join('~');
      if (banEdges.has(edgeId)) continue;
      const change = cur.line !== null && e.line !== cur.line;
      const cost = cur.cost + e.km * MIN_PER_KM + (change ? changePenalty : 0);
      pq.push({
        cost, at: e.to, line: e.line,
        path: [...cur.path, { n: e.to, line: e.line, colour: e.colour, km: e.km }],
      });
    }
    if (pq.length > 9000) pq.length = 6000;   // safety valve
  }
  return null;
}

function summarise(res) {
  const path = res.path;
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    const last = legs[legs.length - 1];
    if (last && last.line === p.line) {
      last.stops.push(p.n); last.km += p.km;
    } else {
      legs.push({ line: p.line, colour: p.colour, from: path[i - 1].n, stops: [p.n], km: p.km });
    }
  }
  const km = legs.reduce((s, l) => s + l.km, 0);
  const hops = path.length - 1;
  return {
    from: path[0].n,
    to: path[path.length - 1].n,
    stations: hops,
    changes: Math.max(0, legs.length - 1),
    km: +km.toFixed(2),
    minutes: Math.round(km / 0.55 + (legs.length - 1) * 7 + 2),
    legs: legs.map((l) => ({ ...l, km: +l.km.toFixed(2), count: l.stops.length,
      to: l.stops[l.stops.length - 1] })),
    interchanges: legs.slice(1).map((l) => l.from),
    path: path.map((p) => p.n),
  };
}

/**
 * Return up to `k` genuinely different routes, sorted best-first.
 */
export function planRoutes(from, to, opts = {}) {
  if (!POS.has(from) || !POS.has(to)) throw new Error('Unknown station');
  if (from === to) throw new Error('Origin and destination are the same');

  const found = [];
  const seen = new Set();

  // 1) fastest, 2) fewest-changes (heavy penalty), 3) alternates via edge bans
  const variants = [{ changePenalty: 7 }, { changePenalty: 25 }, { changePenalty: 2 }];
  for (const v of variants) {
    const r = dijkstra(from, to, v);
    if (!r) continue;
    const s = summarise(r);
    const sig = s.path.join('>');
    if (!seen.has(sig)) { seen.add(sig); found.push(s); }
  }

  // alternates: ban one edge of the best route at a time (Yen-style)
  if (found.length && found.length < (opts.k || 4)) {
    const base = found[0].path;
    for (let i = 0; i < base.length - 1 && found.length < (opts.k || 4); i++) {
      const ban = new Set([[base[i], base[i + 1]].concat('').sort().join('~')]);
      // rebuild the exact edge id used above
      for (const e of ADJ.get(base[i]) || []) {
        if (e.to === base[i + 1]) ban.add([base[i], e.to, e.line].sort().join('~'));
      }
      const r = dijkstra(from, to, { changePenalty: 7, banEdges: ban });
      if (!r) continue;
      const s = summarise(r);
      const sig = s.path.join('>');
      if (!seen.has(sig)) { seen.add(sig); found.push(s); }
    }
  }

  const airport = found.length && found[0].legs.some((l) => /airport express/i.test(l.line));
  for (const f of found) {
    f.fare = fareFor(f.km, { ...opts, airport: f.legs.some((l) => /airport express/i.test(l.line)) });
    f.fareSmart = fareFor(f.km, { ...opts, smartcard: true,
      airport: f.legs.some((l) => /airport express/i.test(l.line)) });
  }
  found.sort((a, b) => a.minutes - b.minutes || a.changes - b.changes);
  return found.slice(0, opts.k || 4);
}

/** Nearest metro stations to a coordinate — used for "from my location". */
export function nearestStations(lat, lon, n = 5) {
  return STATIONS
    .map((s) => ({ ...s, km: haversine({ lat, lon }, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
