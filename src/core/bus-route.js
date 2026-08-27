/**
 * Delhi bus journey planner.
 *
 * Data: src/data/bus-delhi.json — 383 real DTC/cluster routes and 1,036 named
 * stops from OpenStreetMap route=bus relations. Nothing invented.
 *
 * Fares: DTC published slabs. Non-AC ₹5/10/15, AC ₹10/15/20/25 by distance.
 * DEVC (Delhi women) travel free on DTC/cluster buses via the pink ticket.
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

export const ROUTES = DATA.routes;
export const STOPS = DATA.stops;
export const BUILT = DATA.built;

const POS = new Map(STOPS.map((s) => [s.n, s]));
/** stop -> Set(route index) */
const AT = new Map();
ROUTES.forEach((r, i) => {
  for (const s of r.s) {
    if (!AT.has(s)) AT.set(s, new Set());
    AT.get(s).add(i);
  }
});

export const stopNames = [...POS.keys()].sort();
export const isStop = (n) => POS.has(n);

export function searchStops(q, limit = 8) {
  if (!q?.trim()) return [];
  const s = q.toLowerCase().trim();
  const a = [], b = [];
  for (const n of stopNames) {
    const l = n.toLowerCase();
    if (l.startsWith(s)) a.push(n);
    else if (l.includes(s)) b.push(n);
    if (a.length >= limit) break;
  }
  return [...a, ...b].slice(0, limit);
}

/** DTC fare slabs (distance in km). */
export function busFare(km, ac = false) {
  if (ac) return km <= 4 ? 10 : km <= 8 ? 15 : km <= 12 ? 20 : 25;
  return km <= 4 ? 5 : km <= 10 ? 10 : 15;
}

const routeKm = (r, i, j) => {
  let km = 0;
  for (let k = Math.min(i, j); k < Math.max(i, j); k++) {
    const a = POS.get(r.s[k]), b = POS.get(r.s[k + 1]);
    if (a && b) km += haversine(a, b);
  }
  return km;
};

/**
 * Find journeys from A to B.
 *  - direct: one bus
 *  - one-change: bus 1 to a shared stop, then bus 2
 * Returns options sorted by (changes, stops).
 */
export function planBus(from, to, { max = 6 } = {}) {
  if (!POS.has(from) || !POS.has(to)) throw new Error('Unknown stop');
  if (from === to) throw new Error('Origin and destination are the same');

  const A = AT.get(from) || new Set();
  const B = AT.get(to) || new Set();
  const out = [];

  /* ---- direct routes ---- */
  for (const ri of A) {
    if (!B.has(ri)) continue;
    const r = ROUTES[ri];
    const i = r.s.indexOf(from), j = r.s.indexOf(to);
    if (i < 0 || j < 0 || i === j) continue;
    const km = routeKm(r, i, j);
    out.push({
      changes: 0,
      legs: [{ ref: r.r, from, to, stops: Math.abs(j - i), km: +km.toFixed(2),
               op: r.o, dir: `${r.f} → ${r.t}`,
               path: (i < j ? r.s.slice(i, j + 1) : r.s.slice(j, i + 1).reverse()) }],
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
      const i1 = r1.s.indexOf(from);
      for (const mid of r1.s) {
        if (mid === from || mid === to) continue;
        const via = AT.get(mid);
        if (!via) continue;
        for (const r2i of via) {
          if (r2i === r1i || !B.has(r2i)) continue;
          const r2 = ROUTES[r2i];
          const m1 = r1.s.indexOf(mid), m2 = r2.s.indexOf(mid), j2 = r2.s.indexOf(to);
          if (m1 < 0 || m2 < 0 || j2 < 0 || m2 === j2) continue;
          const key = `${r1.r}>${r2.r}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const km1 = routeKm(r1, i1, m1), km2 = routeKm(r2, m2, j2);
          cand.push({
            changes: 1,
            legs: [
              { ref: r1.r, from, to: mid, stops: Math.abs(m1 - i1), km: +km1.toFixed(2),
                op: r1.o, dir: `${r1.f} → ${r1.t}`,
                path: (i1 < m1 ? r1.s.slice(i1, m1 + 1) : r1.s.slice(m1, i1 + 1).reverse()) },
              { ref: r2.r, from: mid, to, stops: Math.abs(j2 - m2), km: +km2.toFixed(2),
                op: r2.o, dir: `${r2.f} → ${r2.t}`,
                path: (m2 < j2 ? r2.s.slice(m2, j2 + 1) : r2.s.slice(j2, m2 + 1).reverse()) },
            ],
            interchange: mid,
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
    o.fare = busFare(o.km, false);
    o.fareAc = busFare(o.km, true);
    o.minutes = Math.round(o.km / 0.28 + o.changes * 8 + 3);   // ~17 km/h in traffic
  }
  out.sort((a, b) => a.changes - b.changes || a.stops - b.stops);
  return out.slice(0, max);
}

/** All routes serving a stop. */
export function routesAt(stop) {
  const ids = AT.get(stop);
  if (!ids) return [];
  return [...ids].map((i) => ROUTES[i])
    .sort((a, b) => a.r.localeCompare(b.r, undefined, { numeric: true }));
}

export function nearestStops(lat, lon, n = 5) {
  return STOPS.map((s) => ({ ...s, km: haversine({ lat, lon }, s) }))
    .sort((a, b) => a.km - b.km).slice(0, n);
}

/** Look up a route by its number. */
export function findRoute(ref) {
  const q = String(ref).toUpperCase().trim();
  return ROUTES.filter((r) => r.r.toUpperCase() === q);
}
