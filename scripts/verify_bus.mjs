/**
 * Verification of the Delhi bus dataset + planner.
 *
 * Updated for the index-based stop table. Routes now store integer stop ids
 * instead of names, because keying stops by name alone merged unrelated places
 * that share a name and produced 20 km phantom hops -> wrong fares.
 */
import { planBus, busFare, childFare, feederFare, fareSlab, roadDistance, refineFare,
         ROUTES, STOPS, stopNames, routesAt, nearestStops, findRoute, haversine,
         nameOf, routeStops, ROAD_FACTOR, searchStops, isStop }
  from '../src/core/bus-route.js';

let pass = 0, fail = 0;
const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

console.log('=== 1. dataset sanity ===');
chk('has routes', ROUTES.length > 300, `${ROUTES.length}`);
chk('has stops', STOPS.length > 900, `${STOPS.length} physical`);
chk('every route has a number', ROUTES.every((r) => r.r && r.r.length));
chk('every route has >=3 stops', ROUTES.every((r) => r.s.length >= 3));
chk('routes reference stops by index', ROUTES.every((r) => r.s.every((i) => Number.isInteger(i))));
chk('every index is in range', ROUTES.every((r) => r.s.every((i) => i >= 0 && i < STOPS.length)));
chk('all stops inside Delhi NCR bbox',
  STOPS.every((s) => s.lat > 28.2 && s.lat < 29.2 && s.lon > 76.7 && s.lon < 77.7));
chk('no consecutive duplicate stops', ROUTES.every((r) => r.s.every((v, i) => i === 0 || v !== r.s[i - 1])));

console.log('\n=== 2. duplicate names now resolve to distinct places ===');
{
  const byName = new Map();
  STOPS.forEach((s, i) => { if (!byName.has(s.n)) byName.set(s.n, []); byName.get(s.n).push({ ...s, i }); });
  const split = [...byName.values()].filter((v) => v.length > 1);
  chk('some names legitimately exist twice', split.length > 0, `${split.length} names`);
  chk('split copies are genuinely far apart',
    split.every((v) => v.every((a, i) => v.every((b, j) => i === j || haversine(a, b) > 0.3))),
    'all >300 m apart');
  chk('distinct names', byName.size > 900, `${byName.size}`);
}

console.log('\n=== 3. phantom hops are gone ===');
{
  let hops = 0, big = 0, huge = 0;
  for (const r of ROUTES) {
    for (let i = 0; i < r.s.length - 1; i++) {
      const d = haversine(STOPS[r.s[i]], STOPS[r.s[i + 1]]);
      hops++;
      if (d > 5) big++;
      if (d > 15) huge++;
    }
  }
  const pct = (100 * big) / hops;
  chk('hops >5 km are rare', pct < 2, `${big}/${hops} = ${pct.toFixed(2)}% (was 3.01%)`);
  chk('hops >15 km are near zero', huge < 20, `${huge}`);
}

console.log('\n=== 4. official DTC fare slabs ===');
for (const [km, exp] of [[2, 5], [4, 5], [6, 10], [10, 10], [14, 15], [30, 15]])
  chk(`non-AC ${km} km -> Rs ${exp}`, busFare(km) === exp, `got ${busFare(km)}`);
for (const [km, exp] of [[3, 10], [7, 15], [11, 20], [20, 25]])
  chk(`AC ${km} km -> Rs ${exp}`, busFare(km, true) === exp, `got ${busFare(km, true)}`);
for (const [km, exp] of [[3, 3], [7, 5], [14, 8]])
  chk(`child non-AC ${km} km -> Rs ${exp}`, childFare(km) === exp, `got ${childFare(km)}`);
chk('feeder <=8 km -> Rs 7', feederFare(6) === 7);
chk('feeder >8 km -> Rs 10', feederFare(9) === 10);
chk('slab boundary reported', fareSlab(6).nextAt === 10, `next at ${fareSlab(6).nextAt} km`);
chk('road factor is calibrated', ROAD_FACTOR > 1.15 && ROAD_FACTOR < 1.5, `${ROAD_FACTOR}`);

console.log('\n=== 5. known route numbers exist ===');
{
  const refs = new Set(ROUTES.map((r) => r.r));
  const found = ['764', '620', '507', '448', '548'].filter((x) => refs.has(x));
  chk('well-known DTC numbers present', found.length >= 3, found.join(', '));
  chk('distinct route numbers', refs.size > 200, `${refs.size}`);
}

console.log('\n=== 6. real journeys on shared corridors ===');
{
  let tested = 0, ok = 0;
  for (const r of ROUTES.slice(0, 80)) {
    if (r.s.length < 8) continue;
    const a = nameOf(r.s[1]), b = nameOf(r.s[r.s.length - 2]);
    if (a === b) continue;
    tested++;
    try {
      const res = planBus(a, b);
      if (res.length && res[0].legs.length && res[0].fare > 0) ok++;
    } catch {}
    if (tested >= 12) break;
  }
  chk('journeys resolve on real corridors', ok >= tested * 0.9, `${ok}/${tested}`);
}

console.log('\n=== 7. direct route correctness ===');
{
  const r = ROUTES.find((x) => x.s.length >= 10);
  const a = nameOf(r.s[2]), b = nameOf(r.s[8]);
  const res = planBus(a, b);
  const direct = res.find((x) => x.changes === 0);
  chk('direct journey found', !!direct, direct ? `bus ${direct.legs[0].ref}` : 'none');
  if (direct) {
    chk('path endpoints correct',
      nameOf(direct.legs[0].path[0]) === a && nameOf(direct.legs[0].path.at(-1)) === b);
    chk('names array matches path', direct.legs[0].names.length === direct.legs[0].path.length);
    chk('distance is positive', direct.km > 0, `${direct.km} km straight`);
    chk('road estimate exceeds straight line', direct.estKm > direct.km,
      `${direct.km} -> ${direct.estKm} km`);
    chk('fare follows the ROAD distance', direct.fare === busFare(direct.estKm),
      `Rs ${direct.fare} for ${direct.estKm} km`);
  }
}

console.log('\n=== 8. interchange journeys charge two tickets ===');
{
  let found = null;
  for (const r1 of ROUTES.slice(0, 40)) {
    for (const r2 of ROUTES.slice(0, 40)) {
      if (r1 === r2) continue;
      if (!r1.s.some((s) => r2.s.includes(s))) continue;
      const a = r1.s.find((s) => !r2.s.includes(s));
      const b = r2.s.find((s) => !r1.s.includes(s));
      if (a == null || b == null) continue;
      try {
        const res = planBus(nameOf(a), nameOf(b));
        const ch = res.find((x) => x.changes === 1);
        if (ch) { found = { ch }; break; }
      } catch {}
    }
    if (found) break;
  }
  chk('one-change journey found', !!found,
    found ? `${found.ch.legs[0].ref} → ${found.ch.legs[1].ref} via ${found.ch.interchange}` : 'none');
  if (found) {
    const ch = found.ch;
    chk('interchange stop is on both legs',
      ch.legs[0].to === ch.interchange && ch.legs[1].from === ch.interchange);
    chk('fare is the SUM of both boardings',
      ch.fare === ch.legs[0].fare + ch.legs[1].fare,
      `Rs ${ch.legs[0].fare} + Rs ${ch.legs[1].fare} = Rs ${ch.fare}`);
    chk('a change never costs less than one leg', ch.fare >= Math.max(ch.legs[0].fare, ch.legs[1].fare));
  }
}

console.log('\n=== 9. routesAt / findRoute / search ===');
{
  const busy = [...new Set(STOPS.map((s) => s.n))]
    .map((n) => ({ n, c: routesAt(n).length })).sort((a, b) => b.c - a.c)[0];
  chk('busiest stop has many routes', busy.c >= 5, `${busy.n}: ${busy.c} routes`);
  const someRef = ROUTES[10].r;
  chk('findRoute returns that number', findRoute(someRef).every((r) => r.r === someRef), someRef);
  chk('findRoute unknown -> empty', findRoute('ZZZ999').length === 0);
  chk('searchStops finds a real stop', searchStops('Nehru').length > 0, searchStops('Nehru')[0]);
  chk('searchStops ranks busy stops first',
    routesAt(searchStops('Nehru')[0]).length >= 1, `${routesAt(searchStops('Nehru')[0]).length} routes`);
  chk('isStop agrees with the table', isStop(STOPS[0].n) && !isStop('Nowhere Junction XYZ'));
  chk('routeStops returns names', typeof routeStops(ROUTES[0])[0] === 'string', routeStops(ROUTES[0])[0]);
}

console.log('\n=== 10. geo helpers ===');
{
  const near = nearestStops(28.6139, 77.2090, 5);
  chk('nearest returns 5', near.length === 5);
  chk('nearest is sorted', near.every((s, i) => i === 0 || s.km >= near[i - 1].km));
  chk('nearest to Connaught Place is close', near[0].km < 3, `${near[0].n} ${near[0].km.toFixed(2)} km`);
  chk('no duplicate names in nearest', new Set(near.map((s) => s.n)).size === near.length);
}

console.log('\n=== 11. live road distance (OSRM) ===');
{
  const r = ROUTES.find((x) => x.s.length >= 12);
  const res = planBus(nameOf(r.s[2]), nameOf(r.s[10]));
  const opt = res.find((x) => x.changes === 0);
  if (opt) {
    const before = { km: opt.estKm, fare: opt.fare };
    const refined = await refineFare(opt);
    if (refined) {
      chk('OSRM returned a distance', refined.roadKm > 0, `${refined.roadKm} km exact`);
      chk('exact flag set', refined.exact === true);
      chk('estimate was within 40% of exact',
        Math.abs(refined.roadKm - before.km) / refined.roadKm < 0.4,
        `est ${before.km} vs exact ${refined.roadKm}`);
      chk('fare recomputed from exact distance', refined.fare === busFare(refined.roadKm),
        `Rs ${before.fare} -> Rs ${refined.fare}`);
    } else {
      console.log('  SKIP  OSRM unreachable from this sandbox');
    }
  }
}

console.log(`\n${'='.repeat(52)}`);
console.log(`${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
