/**
 * Generic metro engine for the other-city shards (public/data/metro-*.json).
 *
 * Delhi has its own engine (metro-route.js) with DMRC fares and timetables;
 * these cities publish neither in the sources used, so this engine plans by
 * stops and distance only.  Travel time is an estimate from distance at a
 * stated average speed — labelled as an estimate everywhere it is shown.
 */
const rad = (d) => (d * Math.PI) / 180;
export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371, p1 = rad(a.lat), p2 = rad(b.lat);
  const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const idxCache = new WeakMap();
export function cityIndex(data) {
  if (idxCache.has(data)) return idxCache.get(data);
  const byStation = new Map();   // name -> [{li, pos}]
  const station = new Map();     // name -> station record
  data.stations.forEach((s) => station.set(s.n, s));
  data.lines.forEach((L, li) => {
    L.s.forEach((n, pos) => {
      if (!byStation.has(n)) byStation.set(n, []);
      byStation.get(n).push({ li, pos });
    });
  });
  const ix = { byStation, station, names: [...byStation.keys()].sort() };
  idxCache.set(data, ix);
  return ix;
}

export function searchCityStations(data, q, limit = 8) {
  if (!q?.trim()) return [];
  const s = q.toLowerCase().trim();
  const { names } = cityIndex(data);
  const a = [], b = [];
  for (const n of names) {
    const l = n.toLowerCase();
    if (l.startsWith(s)) a.push(n);
    else if (l.includes(s)) b.push(n);
    if (a.length >= limit * 2) break;
  }
  return [...a, ...b].slice(0, limit);
}

/**
 * Fewest-changes-then-fewest-stops route via Dijkstra over (station, line)
 * states.  Returns segments with the full stop list of each leg.
 */
export function planCityMetro(data, from, to) {
  const { byStation, station } = cityIndex(data);
  if (!byStation.has(from) || !byStation.has(to)) throw new Error('Unknown station');
  if (from === to) throw new Error('Origin and destination are the same');
  const key = (n, li) => `${li}${n}`;
  const dist = new Map(), prev = new Map();
  const pq = [];
  const push = (item) => { pq.push(item); pq.sort((x, y) => x.cost - y.cost); };
  for (const { li } of byStation.get(from)) {
    dist.set(key(from, li), 0);
    push({ n: from, li, cost: 0, stops: 0, changes: 0 });
  }
  let goal = null;
  while (pq.length) {
    const cur = pq.shift();
    const ck = key(cur.n, cur.li);
    if (dist.get(ck) < cur.cost) continue;
    if (cur.n === to) { goal = cur; break; }
    const L = data.lines[cur.li];
    const pos = L.s.indexOf(cur.n);
    for (const nb of [pos - 1, pos + 1]) {
      if (nb < 0 || nb >= L.s.length) continue;
      const nn = L.s[nb];
      const cost = cur.cost + 1 + 0.001 * haversineKm(station.get(cur.n), station.get(nn));
      const nk = key(nn, cur.li);
      if (cost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, cost);
        prev.set(nk, { pk: ck, n: cur.n, li: cur.li });
        push({ n: nn, li: cur.li, cost, stops: cur.stops + 1, changes: cur.changes });
      }
    }
    for (const alt of byStation.get(cur.n)) {
      if (alt.li === cur.li) continue;
      const cost = cur.cost + 3;             // interchange penalty
      const nk = key(cur.n, alt.li);
      if (cost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, cost);
        prev.set(nk, { pk: ck, n: cur.n, li: cur.li, change: true });
        push({ n: cur.n, li: alt.li, cost, stops: cur.stops, changes: cur.changes + 1 });
      }
    }
  }
  if (!goal) throw new Error('No route connects these stations');
  const path = [];
  let ck = key(goal.n, goal.li);
  path.push({ n: goal.n, li: goal.li });
  while (prev.has(ck)) {
    const p = prev.get(ck);
    path.push({ n: p.n, li: p.li });
    ck = p.pk;
  }
  path.reverse();
  const segments = [];
  for (const step of path) {
    const last = segments[segments.length - 1];
    if (last && last.li === step.li) last.stops.push(step.n);
    else segments.push({ li: step.li, stops: [step.n] });
  }
  const legs = segments.filter((s) => s.stops.length > 1).map((s) => {
    const L = data.lines[s.li];
    let km = 0;
    for (let i = 1; i < s.stops.length; i++) {
      km += haversineKm(station.get(s.stops[i - 1]), station.get(s.stops[i]));
    }
    return { line: L.n, colour: L.c, from: s.stops[0], to: s.stops[s.stops.length - 1],
             stops: s.stops, count: s.stops.length - 1, km: +km.toFixed(1) };
  });
  const totalStops = legs.reduce((s, l) => s + l.count, 0);
  const km = +legs.reduce((s, l) => s + l.km, 0).toFixed(1);
  const changes = legs.length - 1;
  // Estimate: ~30 km/h commercial speed incl. dwells, + 4 min per change.
  const mins = Math.max(2, Math.round((km / 30) * 60) + changes * 4);
  return { legs, totalStops, changes, km, mins, est: true };
}
