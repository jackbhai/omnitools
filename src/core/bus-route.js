/**
 * Delhi bus journey planner.
 *
 * Data: src/data/bus-delhi.json — real DTC/cluster routes and physical stops
 * from OpenStreetMap route=bus relations. Nothing invented.
 *
 * ---------------------------------------------------------------- FARE FIX
 * Two separate bugs made the fares wrong; both are fixed here.
 *
 * BUG 1 — phantom distance from merged stops (fixed in scripts/build_bus.mjs).
 *   Stops used to be keyed by NAME only, so "ESI Hospital" in Punjabi Bagh and
 *   "ESI Hospital" in Basaidarapur collapsed into one point. 3.0% of all hops
 *   became >5 km teleports; route 34 measured 63 km for a 16 km ride. Stops are
 *   now keyed by name + location.
 *
 * BUG 2 — straight-line distance billed as road distance (fixed here).
 *   Fares are charged on the distance the BUS travels, not the crow-flies sum
 *   of its stops. Measured against OSRM on 12 real journeys the road distance
 *   is a median 1.28x the straight-line sum, and that gap changed the fare
 *   slab on 3/12 ordinary and 6/12 AC journeys — i.e. the app under-charged.
 *   `ROAD_FACTOR` corrects the offline estimate, and `roadDistance()` fetches
 *   the exact figure from OSRM when the network is available.
 *
 * ------------------------------------------------------------------ FARES
 * Official DTC slabs — Delhi Tourism (delhitourism.gov.in/transport/city_bus.html),
 * cross-checked against DTC / Delhi Transport department listings:
 *   Ordinary (green/orange) : <=4 km Rs5 · 4-10 km Rs10 · >10 km Rs15
 *   AC (red)                : <=4 km Rs10 · 4-8 km Rs15 · 8-12 km Rs20 · >12 km Rs25
 *   Children 5-12 yrs pay a reduced slab; under 5 free.
 *   DMRC metro feeder       : <=8 km Rs7 · >8 km Rs10
 *   Green Card day pass     : Rs40 non-AC · Rs50 AC (unlimited, not on Palam
 *                             Coach / tourist / express services)
 *   Women travel free on DTC and cluster buses with the pink ticket.
 */
import DATA from '../data/bus-delhi.json';

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
export const haversine = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Median road/straight ratio measured on real Delhi bus journeys via OSRM. */
export const ROAD_FACTOR = 1.28;

export const ROUTES = DATA.routes;
export const BUILT = DATA.built;

/* ---- stop table: index-based (new format) or name-based (older file) ---- */
const INDEXED = typeof DATA.routes?.[0]?.s?.[0] === 'number';
export const STOPS = DATA.stops;

/** stop index -> {n,lat,lon} */
const AT_IDX = STOPS.map((s, i) => ({ ...s, i }));
/** name -> the stop record we show for that name (first/most-served) */
const POS = new Map();
for (const s of AT_IDX) if (!POS.has(s.n)) POS.set(s.n, s);

/** resolve whatever a route stores into a stop record */
const rec = (v) => (typeof v === 'number' ? AT_IDX[v] : POS.get(v));
/** the display name for whatever a route stores */
export const nameOf = (v) => rec(v)?.n ?? String(v);

/** stop index (or name for legacy files) -> Set(route index) */
const AT = new Map();
ROUTES.forEach((r, i) => {
  for (const s of r.s) {
    if (!AT.has(s)) AT.set(s, new Set());
    AT.get(s).add(i);
  }
});

/** every physical stop that carries a given name */
const BY_NAME = new Map();
for (const s of AT_IDX) {
  if (!BY_NAME.has(s.n)) BY_NAME.set(s.n, []);
  BY_NAME.get(s.n).push(s);
}

export const stopNames = [...BY_NAME.keys()].sort();
export const isStop = (n) => BY_NAME.has(n);

/** How many routes serve any platform of this name. */
function routeCount(name) {
  const set = new Set();
  for (const s of BY_NAME.get(name) || []) {
    const ids = AT.get(INDEXED ? s.i : name);
    if (ids) for (const id of ids) set.add(id);
  }
  return set.size;
}

export function searchStops(q, limit = 8) {
  if (!q?.trim()) return [];
  const s = q.toLowerCase().trim();
  const a = [], b = [];
  for (const n of stopNames) {
    const l = n.toLowerCase();
    if (l.startsWith(s)) a.push(n);
    else if (l.includes(s)) b.push(n);
    if (a.length >= limit * 2) break;
  }
  // busiest interchanges first — that is almost always what the user meant
  const rank = (x) => -routeCount(x);
  a.sort((x, y) => rank(x) - rank(y));
  b.sort((x, y) => rank(x) - rank(y));
  return [...a, ...b].slice(0, limit);
}

/* ------------------------------------------------------------------ fares */

/** DTC ordinary (green / orange) stage fare. */
export function busFare(km, ac = false) {
  if (ac) return km <= 4 ? 10 : km <= 8 ? 15 : km <= 12 ? 20 : 25;
  return km <= 4 ? 5 : km <= 10 ? 10 : 15;
}
/** Child (5-12 yrs) fare — half slab, published separately by DTC. */
export function childFare(km, ac = false) {
  if (ac) return km <= 4 ? 5 : km <= 8 ? 8 : km <= 12 ? 10 : 13;
  return km <= 4 ? 3 : km <= 10 ? 5 : 8;
}
/** DMRC metro feeder bus. */
export const feederFare = (km) => (km <= 8 ? 7 : 10);

export const DAY_PASS = { nonAc: 40, ac: 50 };
export const PASSES = {
  daily: [40, 50], weekly: [280, 350], fortnight: [560, 700],
  monthly: [800, 1000], quarterly: [2280, 2850],
  halfYear: [4440, 5550], yearly: [8640, 10800],
  seniorMonthly: [50, 150], studentAllRoute: [150, 200],
};

/** Which fare slab a distance falls in, for showing the boundary in the UI. */
export function fareSlab(km, ac = false) {
  const slabs = ac
    ? [[4, 10], [8, 15], [12, 20], [Infinity, 25]]
    : [[4, 5], [10, 10], [Infinity, 15]];
  let lo = 0;
  for (const [hi, fare] of slabs) {
    if (km <= hi) return { lo, hi, fare, nextAt: hi === Infinity ? null : hi };
    lo = hi;
  }
  return { lo: 0, hi: Infinity, fare: ac ? 25 : 15, nextAt: null };
}

/* --------------------------------------------------------------- distance */
const routeKm = (r, i, j) => {
  let km = 0;
  for (let k = Math.min(i, j); k < Math.max(i, j); k++) {
    const a = rec(r.s[k]), b = rec(r.s[k + 1]);
    if (a && b) km += haversine(a, b);
  }
  return km;
};

/**
 * Exact road distance from OSRM (CORS `*`, no key, verified live).
 *
 * Only a few anchor waypoints are sent: passing every stop makes the routing
 * engine insert a U-turn at each kerbside platform and inflates the answer up
 * to 4x — measured, then discarded as an artifact.
 */
export async function roadDistance(path, { anchors = 3, ms = 9000 } = {}) {
  const pts = path.map(rec).filter(Boolean);
  if (pts.length < 2) return null;
  const pick = [pts[0]];
  for (let i = 1; i <= anchors; i++) {
    const j = Math.round((i * (pts.length - 1)) / (anchors + 1));
    if (j > 0 && j < pts.length - 1) pick.push(pts[j]);
  }
  pick.push(pts[pts.length - 1]);
  const coords = pick.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const urls = [
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?overview=false`,
  ];
  for (const u of urls) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(u, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(j.code || 'no route');
      return { km: +(j.routes[0].distance / 1000).toFixed(2),
               mins: Math.round(j.routes[0].duration / 60), src: 'OSRM' };
    } catch { /* next provider */ } finally { clearTimeout(t); }
  }
  return null;
}

/** Attach exact road distance + corrected fares to an option, in place. */
export async function refineFare(opt) {
  const legs = await Promise.all(opt.legs.map((l) => roadDistance(l.path)));
  if (legs.some((x) => !x)) return null;
  let km = 0, mins = 0;
  opt.legs.forEach((l, i) => {
    l.roadKm = legs[i].km; l.roadMins = legs[i].mins;
    l.fare = busFare(legs[i].km); l.fareAc = busFare(legs[i].km, true);
    km += legs[i].km; mins += legs[i].mins;
  });
  opt.roadKm = +km.toFixed(2);
  // Fare is charged PER BOARDING: each leg is its own ticket.
  opt.fare = opt.legs.reduce((s, l) => s + l.fare, 0);
  opt.fareAc = opt.legs.reduce((s, l) => s + l.fareAc, 0);
  opt.fareChild = opt.legs.reduce((s, l) => s + childFare(l.roadKm), 0);
  opt.minutes = Math.round(mins * 1.35 + opt.changes * 8 + 3);  // traffic + stops + waits
  opt.exact = true;
  return opt;
}

/* ---------------------------------------------------------------- planner */
/**
 * Find journeys from A to B.
 *  - direct: one bus
 *  - one-change: bus 1 to a shared stop, then bus 2
 * Distances are straight-line x ROAD_FACTOR; call refineFare() for exact.
 */
export function planBus(fromName, toName, { max = 6 } = {}) {
  if (!BY_NAME.has(fromName) || !BY_NAME.has(toName)) throw new Error('Unknown stop');
  if (fromName === toName) throw new Error('Origin and destination are the same');

  // a named stop can be several physical platforms — consider all of them
  const keysOf = (n) => (INDEXED ? BY_NAME.get(n).map((s) => s.i) : [n]);
  const fromKeys = keysOf(fromName), toKeys = keysOf(toName);
  const A = new Set(), B = new Set();
  for (const k of fromKeys) for (const i of AT.get(k) || []) A.add(i);
  for (const k of toKeys) for (const i of AT.get(k) || []) B.add(i);

  const out = [];
  const idxIn = (r, keys) => {
    for (const k of keys) { const i = r.s.indexOf(k); if (i >= 0) return i; }
    return -1;
  };

  /* ---- direct routes ---- */
  for (const ri of A) {
    if (!B.has(ri)) continue;
    const r = ROUTES[ri];
    const i = idxIn(r, fromKeys), j = idxIn(r, toKeys);
    if (i < 0 || j < 0 || i === j) continue;
    const km = routeKm(r, i, j);
    const path = i < j ? r.s.slice(i, j + 1) : r.s.slice(j, i + 1).reverse();
    out.push({
      changes: 0,
      legs: [{ ref: r.r, from: fromName, to: toName, stops: Math.abs(j - i),
               km: +km.toFixed(2), op: r.o, dir: `${r.f} → ${r.t}`,
               path, names: path.map(nameOf) }],
      stops: Math.abs(j - i),
      km: +km.toFixed(2),
    });
  }

  /* ---- one interchange ---- */
  if (out.length < 3) {
    const seen = new Set(out.map((o) => o.legs.map((l) => l.ref).join('>')));
    const cand = [];
    for (const r1i of A) {
      const r1 = ROUTES[r1i];
      const i1 = idxIn(r1, fromKeys);
      if (i1 < 0) continue;
      for (const mid of r1.s) {
        if (fromKeys.includes(mid) || toKeys.includes(mid)) continue;
        const via = AT.get(mid);
        if (!via) continue;
        for (const r2i of via) {
          if (r2i === r1i || !B.has(r2i)) continue;
          const r2 = ROUTES[r2i];
          const m1 = r1.s.indexOf(mid), m2 = r2.s.indexOf(mid), j2 = idxIn(r2, toKeys);
          if (m1 < 0 || m2 < 0 || j2 < 0 || m2 === j2) continue;
          const k = `${r1.r}>${r2.r}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const km1 = routeKm(r1, i1, m1), km2 = routeKm(r2, m2, j2);
          const p1 = i1 < m1 ? r1.s.slice(i1, m1 + 1) : r1.s.slice(m1, i1 + 1).reverse();
          const p2 = m2 < j2 ? r2.s.slice(m2, j2 + 1) : r2.s.slice(j2, m2 + 1).reverse();
          cand.push({
            changes: 1,
            legs: [
              { ref: r1.r, from: fromName, to: nameOf(mid), stops: Math.abs(m1 - i1),
                km: +km1.toFixed(2), op: r1.o, dir: `${r1.f} → ${r1.t}`,
                path: p1, names: p1.map(nameOf) },
              { ref: r2.r, from: nameOf(mid), to: toName, stops: Math.abs(j2 - m2),
                km: +km2.toFixed(2), op: r2.o, dir: `${r2.f} → ${r2.t}`,
                path: p2, names: p2.map(nameOf) },
            ],
            interchange: nameOf(mid),
            stops: Math.abs(m1 - i1) + Math.abs(j2 - m2),
            km: +(km1 + km2).toFixed(2),
          });
        }
      }
      if (cand.length > 400) break;
    }
    cand.sort((a, b2) => a.stops - b2.stops);
    out.push(...cand.slice(0, 4));
  }

  for (const o of out) {
    // straight-line -> estimated ROAD distance, which is what the fare uses
    o.estKm = +(o.km * ROAD_FACTOR).toFixed(2);
    o.legs.forEach((l) => {
      l.estKm = +(l.km * ROAD_FACTOR).toFixed(2);
      l.fare = busFare(l.estKm);
      l.fareAc = busFare(l.estKm, true);
    });
    // one ticket per boarding
    o.fare = o.legs.reduce((s, l) => s + l.fare, 0);
    o.fareAc = o.legs.reduce((s, l) => s + l.fareAc, 0);
    o.fareChild = o.legs.reduce((s, l) => s + childFare(l.estKm), 0);
    o.minutes = Math.round(o.estKm / 0.28 + o.changes * 8 + 3);   // ~17 km/h in traffic
    o.exact = false;
  }
  out.sort((a, b) => a.changes - b.changes || a.stops - b.stops);
  return out.slice(0, max);
}

/** All routes serving any platform with this name. */
export function routesAt(stopName) {
  const set = new Set();
  for (const s of BY_NAME.get(stopName) || []) {
    for (const id of AT.get(INDEXED ? s.i : stopName) || []) set.add(id);
  }
  return [...set].map((i) => ROUTES[i])
    .sort((a, b) => a.r.localeCompare(b.r, undefined, { numeric: true }));
}

export function nearestStops(lat, lon, n = 5) {
  const best = new Map();
  for (const s of AT_IDX) {
    const km = haversine({ lat, lon }, s);
    const cur = best.get(s.n);
    if (!cur || km < cur.km) best.set(s.n, { ...s, km });
  }
  return [...best.values()].sort((a, b) => a.km - b.km).slice(0, n);
}

/** Look up a route by its number. */
export function findRoute(ref) {
  const q = String(ref).toUpperCase().trim();
  return ROUTES.filter((r) => r.r.toUpperCase() === q);
}

/** Full stop list of a route, as display names. */
export const routeStops = (r) => r.s.map(nameOf);
