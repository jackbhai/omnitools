/** 10-round verification of the Delhi bus dataset + planner. */
import { planBus, busFare, ROUTES, STOPS, stopNames, routesAt, nearestStops, findRoute, haversine }
  from '../src/core/bus-route.js';

let pass = 0, fail = 0;
const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

console.log('=== 1. dataset sanity ===');
chk('has routes', ROUTES.length > 300, `${ROUTES.length}`);
chk('has stops', STOPS.length > 900, `${STOPS.length}`);
chk('every route has a number', ROUTES.every((r) => r.r && r.r.length));
chk('every route has >=3 stops', ROUTES.every((r) => r.s.length >= 3));
chk('no duplicate stop names', new Set(STOPS.map((s) => s.n)).size === STOPS.length);
chk('all stops inside Delhi NCR bbox',
  STOPS.every((s) => s.lat > 28.2 && s.lat < 29.0 && s.lon > 76.7 && s.lon < 77.6));

console.log('\n=== 2. no orphan stops in routes ===');
{
  const known = new Set(STOPS.map((s) => s.n));
  const orphans = new Set();
  for (const r of ROUTES) for (const s of r.s) if (!known.has(s)) orphans.add(s);
  chk('every route stop has coordinates', orphans.size === 0, `${orphans.size} orphans`);
}

console.log('\n=== 3. DTC fare slabs ===');
for (const [km, exp] of [[2, 5], [4, 5], [6, 10], [10, 10], [14, 15], [30, 15]])
  chk(`non-AC ${km} km -> Rs ${exp}`, busFare(km) === exp, `got ${busFare(km)}`);
for (const [km, exp] of [[3, 10], [7, 15], [11, 20], [20, 25]])
  chk(`AC ${km} km -> Rs ${exp}`, busFare(km, true) === exp, `got ${busFare(km, true)}`);

console.log('\n=== 4. known route numbers exist ===');
{
  const refs = new Set(ROUTES.map((r) => r.r));
  const found = ['764', '620', '507', '448', '548'].filter((x) => refs.has(x));
  chk('well-known DTC numbers present', found.length >= 3, found.join(', '));
  chk('distinct route numbers', new Set(ROUTES.map((r) => r.r)).size > 200,
    `${new Set(ROUTES.map((r) => r.r)).size}`);
}

console.log('\n=== 5. real journeys on shared corridors ===');
{
  // pick stops that genuinely share a route, from the data itself
  let tested = 0, ok = 0;
  for (const r of ROUTES.slice(0, 60)) {
    if (r.s.length < 8) continue;
    const a = r.s[1], b = r.s[r.s.length - 2];
    if (a === b) continue;
    tested++;
    try {
      const res = planBus(a, b);
      if (res.length && res[0].legs.length && res[0].fare > 0) ok++;
    } catch { /* counted as fail below */ }
    if (tested >= 12) break;
  }
  chk('journeys resolve on real corridors', ok >= tested * 0.9, `${ok}/${tested}`);
}

console.log('\n=== 6. direct route correctness ===');
{
  const r = ROUTES.find((x) => x.s.length >= 10);
  const a = r.s[2], b = r.s[8];
  const res = planBus(a, b);
  const direct = res.find((x) => x.changes === 0);
  chk('direct journey found', !!direct, direct ? `bus ${direct.legs[0].ref}` : 'none');
  if (direct) {
    chk('stop count matches index delta', direct.stops === 6, `${direct.stops}`);
    chk('path endpoints correct',
      direct.legs[0].path[0] === a && direct.legs[0].path.at(-1) === b);
    chk('distance is positive', direct.km > 0, `${direct.km} km`);
  }
}

console.log('\n=== 7. interchange journeys ===');
{
  let found = null;
  for (const r1 of ROUTES.slice(0, 40)) {
    for (const r2 of ROUTES.slice(0, 40)) {
      if (r1 === r2) continue;
      const shared = r1.s.find((s) => r2.s.includes(s));
      if (!shared) continue;
      const a = r1.s.find((s) => !r2.s.includes(s));
      const b = r2.s.find((s) => !r1.s.includes(s));
      if (!a || !b) continue;
      try {
        const res = planBus(a, b);
        const ch = res.find((x) => x.changes === 1);
        if (ch) { found = { a, b, ch }; break; }
      } catch {}
    }
    if (found) break;
  }
  chk('one-change journey found', !!found,
    found ? `${found.ch.legs[0].ref} → ${found.ch.legs[1].ref} via ${found.ch.interchange}` : 'none');
  if (found) {
    chk('interchange stop is on both legs',
      found.ch.legs[0].to === found.ch.interchange && found.ch.legs[1].from === found.ch.interchange);
  }
}

console.log('\n=== 8. routesAt / findRoute ===');
{
  const busy = STOPS.map((s) => ({ s: s.n, n: routesAt(s.n).length }))
    .sort((a, b) => b.n - a.n)[0];
  chk('busiest stop has many routes', busy.n >= 5, `${busy.s}: ${busy.n} routes`);
  const someRef = ROUTES[10].r;
  chk('findRoute returns that number', findRoute(someRef).every((r) => r.r === someRef), someRef);
  chk('findRoute unknown -> empty', findRoute('ZZZ999').length === 0);
}

console.log('\n=== 9. geo helpers ===');
{
  const near = nearestStops(28.6328, 77.2197, 3);
  chk('nearest stops returned', near.length === 3, near.map((n) => `${n.n}(${n.km.toFixed(1)}km)`).join(', '));
  chk('nearest is actually nearest', near[0].km <= near[1].km && near[1].km <= near[2].km);
  chk('distances are sane', near[0].km < 15, `${near[0].km.toFixed(2)} km`);
}

console.log('\n=== 10. error handling + symmetry ===');
{
  for (const [a, b, why] of [['NoSuchStop', stopNames[0], 'unknown origin'],
                             [stopNames[0], 'NoSuchStop', 'unknown destination'],
                             [stopNames[0], stopNames[0], 'same stop']]) {
    let threw = false;
    try { planBus(a, b); } catch { threw = true; }
    chk(`rejects ${why}`, threw);
  }
  const r = ROUTES.find((x) => x.s.length >= 10);
  const f = planBus(r.s[2], r.s[8])[0], rev = planBus(r.s[8], r.s[2])[0];
  chk('A->B and B->A same distance', Math.abs(f.km - rev.km) < 0.01, `${f.km} vs ${rev.km}`);
  chk('A->B and B->A same fare', f.fare === rev.fare, `${f.fare} vs ${rev.fare}`);
}

console.log(`\n${'='.repeat(60)}\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
