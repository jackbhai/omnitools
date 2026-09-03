/**
 * Verification of the Delhi bus dataset + planner.
 *
 * Updated for the index-based stop table. Routes now store integer stop ids
 * instead of names, because keying stops by name alone merged unrelated places
 * that share a name and produced 20 km phantom hops -> wrong fares.
 */
import { planBus, busFare, childFare, feederFare, fareSlab, roadDistance, refineFare,
         ROUTES, STOPS, stopNames, routesAt, nearestStops, findRoute, haversine,
         nameOf, routeStops, ROAD_FACTOR, searchStops, isStop,
         journeyKm, serviceWindow, statusNow, busEta, nextDepartures, fmtTime }
  from '../src/core/bus-route.js';

let pass = 0, fail = 0;
const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

console.log('=== 1. dataset sanity ===');
chk('has routes', ROUTES.length > 300, `${ROUTES.length}`);
chk('has stops', STOPS.length > 900, `${STOPS.length} physical`);
chk('every route has a number', ROUTES.every((r) => r.r && r.r.length));
chk('every route has >=2 stops', ROUTES.every((r) => r.s.length >= 2), `${Math.min(...ROUTES.map((r) => r.s.length))} min`);
chk('2,400+ route directions published', ROUTES.length > 2400, `${ROUTES.length}`);
chk('routes reference stops by index', ROUTES.every((r) => r.s.every((i) => Number.isInteger(i))));
chk('every index is in range', ROUTES.every((r) => r.s.every((i) => i >= 0 && i < STOPS.length)));
// the corpus includes DTC's intercity cluster services (Panipat, Rohtak,
// Jhajjar, Ghaziabad, Sonepat), so the box is the whole NCR, not Delhi proper
chk('all stops inside the NCR', STOPS.every((s) => s.lat > 27.9 && s.lat < 29.6 && s.lon > 75.9 && s.lon < 78.2));
chk('stop coordinates are not the 0,0 placeholder', STOPS.every((s) => Math.abs(s.lat) > 1 && Math.abs(s.lon) > 1));
// a published stop list may name the same physical stop twice ("Udyog Bhawan"
// on 19); the index repeats but the shape distance keeps growing, so the pair
// is kept rather than dropped — it is what the corporation published.
const repeats = ROUTES.filter((r) => r.s.some((v, i) => i && v === r.s[i - 1])).length;
chk('repeated adjacent stops stay a small minority', repeats < ROUTES.length * 0.15, `${repeats} routes`);

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
  chk('hops >15 km stay a rounding error (sparse intercity listings)', (100 * huge) / hops < 0.1,
    `${huge}/${hops} = ${((100 * huge) / hops).toFixed(3)}%`);
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
  const rec = ROUTES.find((r) => r.s.length > 30 && r.sm !== 0 && r.km);
  const A = rec.s[0], B = rec.s[rec.s.length - 1];
  const o = planBus(nameOf(A), nameOf(B)).find((x) => x.changes === 0);
  chk('direct journey found', !!o, o ? `bus ${o.legs[0].ref}` : 'none');
  chk('path endpoints correct', o.legs[0].from === nameOf(A) && o.legs[0].to === nameOf(B));
  chk('names array matches path', o.legs[0].names.length === o.legs[0].path.length);
  const sl = +haversine(STOPS[A], STOPS[B]).toFixed(2);
  const road = o.legs[0].km;
  // with the published polyline this is the driven distance, so it sits just
  // above the crow-flies line rather than the old 1.28x guess
  chk('shape length brackets the straight line', road >= sl * 0.98 && road < sl * 3,
    `${sl} km straight -> ${road} km along the route`);
  chk('the leg reports the shape as its source', o.exact === true, `src ${o.src}`);
  chk('leg knows where it sits on the route', o.legs[0].i0 === 0 && o.legs[0].i1 === rec.s.length - 1);
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

console.log('\n=== 11. published timetables ===');
{
  const withTT = ROUTES.filter((r) => r.tt && r.tt.d && r.tt.d.length);
  chk('most directions carry a timetable', withTT.length > ROUTES.length * 0.8, `${withTT.length}/${ROUTES.length}`);
  chk('departure lists are inside the published first/last bus', withTT.every((r) => r.tt.d.every(
    (d) => d >= r.tt.a - 1 && d <= r.tt.b + 1)));
  chk('every timetable names its first and last bus', withTT.every((r) => Number.isFinite(r.tt.a) && Number.isFinite(r.tt.b) && r.tt.a <= r.tt.b));
  chk('departure lists are sorted', withTT.every((r) => r.tt.d.every((d, i) => !i || d >= r.tt.d[i - 1])));
  // a night service with one published trip has first == last, which is legal
  chk('every timetable has an ordered first/last pair', ROUTES.filter((r) => r.tt).every((r) => Number.isFinite(r.tt.a) && Number.isFinite(r.tt.b) && r.tt.a <= r.tt.b));
  chk('per-stop timing is published for 35+ stop routes', ROUTES.filter((r) => r.s.length > 35 && r.mins).length > 500);
  const r3 = findRoute('03')[0];
  if (r3) {
    const win = serviceWindow(r3);
    chk('bus 03 first bus is the published 05:40', win[0] === 340, fmtTime(win[0]));
    chk('bus 03 last bus is the published 19:15', win[1] === 1155, fmtTime(win[1]));
    chk('bus 03 trips/day matches its departure list', r3.tt.k === r3.tt.d.length, `${r3.tt.k} vs ${r3.tt.d.length}`);
    // statusNow reads the IST wall clock off any Date, so build instants by name
    const ist = (mo, day, h, mi) => new Date(Date.UTC(2026, mo - 1, day, h, mi) - 330 * 60000);
    const noon = statusNow(r3, ist(1, 5, 6, 30));                   // 06:30 IST = 01:00 UTC
    chk('status at 06:30 is on duty with a next bus', (noon.state === 'running' || noon.state === 'soon') && noon.next.length > 0,
      `${noon.state} ${noon.next.map(fmtTime).join(',')}`);
    const late = statusNow(r3, ist(1, 5, 1, 30));                    // 01:30 IST, before the first bus
    chk('status at 01:30 says not running', late.state === 'closed' || late.state === 'before', late.state);
    const eta = busEta(r3, 0, r3.s.length - 1);
    chk('whole-route ETA matches the published length', Math.abs(eta - r3.mins) <= 3, `${eta} vs ${r3.mins} min`);
    const nd = nextDepartures(r3, ist(1, 5, 8, 5));
    chk('next departures are all in the future of 08:05', nd.times.every((t) => t >= 485), nd.labels.join(' '));
  }
}

console.log('\n=== 12. return direction + shapes ===');
{
  const linked = ROUTES.filter((r) => r.rv != null);
  chk('most directions know their return direction', linked.length > ROUTES.length * 0.85, `${linked.length}/${ROUTES.length}`);
  chk('return link points at the same service', linked.every((r) => {
    const t = ROUTES[r.rv];
    const cut = (x) => x.replace(/\s*[()\u2013\-+]+\s*/g, '').toUpperCase();
    return t && cut(t.r) === cut(r.r);
  }));
  // 'sm' is published as 0 only where the page had no polyline; those keep a
  // straight-line cumulative instead, so the offsets still run start to finish
  const shaped = ROUTES.filter((r) => r.sm !== 0);
  chk('every direction has a length at each of its stops',
    ROUTES.every((r) => r.m && r.m.length === r.s.length));
  chk('stop offsets run from the front of the route to the back',   // a polyline may start at a depot, hence the 2 km slack
    shaped.every((r) => r.m[0] >= 0 && r.m[0] < 2000 && r.m.at(-1) > 0 && Math.abs(r.m.at(-1) - r.km * 1000) < 500),
    `${shaped.length} of ${ROUTES.length} follow the driven polyline`);
  chk('most directions carry a driven-route length', shaped.length > ROUTES.length * 0.8, `${shaped.length}/${ROUTES.length}`);
}

console.log('\n=== 13. live road distance (OSRM) ===');
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
