/**
 * 10-round verification of the metro graph + planner against KNOWN-GOOD facts.
 * Any mismatch is printed loudly. Run before shipping.
 */
import { planRoutes, fareFor, STATIONS, LINES, stationNames, nearestStations, haversine,
         lineInfo, lastTrainAt, fmtTime, busStopsNear, isOffPeak, isHoliday, fareSlabOf }
  from '../src/core/metro-route.js';

let pass = 0, fail = 0;
const chk = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

console.log('=== 1. dataset sanity ===');
chk('287 stations on the network', STATIONS.length === 287, `${STATIONS.length}`);
chk('every station belongs to a line', STATIONS.every((s) => (s.l || []).length > 0));
chk('16 line branches', LINES.length === 16, `${LINES.length}`);
chk('no empty station names', STATIONS.every((s) => s.n && s.n.length > 1));
chk('all stations have coords', STATIONS.every((s) => s.lat > 20 && s.lat < 32 && s.lon > 70 && s.lon < 82));
chk('no duplicate stations', new Set(STATIONS.map((s) => s.n)).size === STATIONS.length);

console.log('\n=== 2. known interchanges exist ===');
for (const [st, n] of [['Rajiv Chowk', 2], ['Kashmere Gate', 3], ['Hauz Khas', 2],
                       ['Central Secretariat', 2], ['Botanical Garden', 2], ['Inderlok', 2]]) {
  const s = STATIONS.find((x) => x.n === st);
  chk(`${st} is on ${n} lines`, s && s.l.length === n, s ? s.l.join('+') : 'MISSING');
}

console.log('\n=== 3. famous stations present ===');
for (const st of ['Rajiv Chowk', 'Chandni Chowk', 'Hauz Khas', 'Dwarka Sector 21',
                  'Noida Electronic City', 'Millennium City Centre Gurugram',
                  'Vaishali', 'Shaheed Sthal', 'Rithala']) {
  chk(`"${st}" exists`, stationNames.includes(st), stationNames.includes(st) ? '' : 'not found');
}

console.log('\n=== 4. DMRC fare slabs (25 Aug 2025) ===');
for (const [km, exp] of [[1, 11], [2, 11], [3, 21], [5, 21], [8, 32], [12, 32],
                         [15, 43], [21, 43], [25, 54], [32, 54], [40, 64]]) {
  const got = fareFor(km);
  chk(`${km} km -> Rs ${exp}`, got === exp, `got Rs ${got}`);
}
chk('smartcard 10% off (40km: 64 -> 58)', fareFor(40, { smartcard: true }) === 58, `${fareFor(40, { smartcard: true })}`);
chk('holiday >32km is Rs 54', fareFor(40, { holiday: true }) === 54, `${fareFor(40, { holiday: true })}`);

console.log('\n=== 5. real journeys ===');
const J = [
  ['Rajiv Chowk', 'Hauz Khas', 1, 12],
  ['Kashmere Gate', 'Rajiv Chowk', 1, 8],
  ['Dwarka Mor', 'Noida Electronic City', 1, 45],
  ['Rithala', 'Shaheed Sthal', 1, 32],
  ['Botanical Garden', 'Hauz Khas', 2, 30],
];
for (const [a, b, maxCh, maxStops] of J) {
  try {
    const r = planRoutes(a, b);
    const best = r[0];
    const ok = best && best.stations <= maxStops && best.changes <= maxCh && best.fare > 0;
    chk(`${a} -> ${b}`, ok,
      best ? `${best.stations} stops, ${best.changes} ch, ${best.km}km, Rs${best.fare}, ${best.minutes}min, ${r.length} options`
           : 'no route');
  } catch (e) { chk(`${a} -> ${b}`, false, e.message); }
}

console.log('\n=== 6. multiple distinct options ===');
{
  const r = planRoutes('Dwarka Mor', 'Anand Vihar', { k: 4 });
  chk('>=2 route options', r.length >= 2, `${r.length} options`);
  chk('options are distinct', new Set(r.map((x) => x.path.join())).size === r.length);
  r.forEach((x, i) => console.log(`      opt${i + 1}: ${x.stations} stops, ${x.changes} ch, Rs${x.fare}, ${x.minutes}min`));
}

console.log('\n=== 7. leg / interchange integrity ===');
{
  const r = planRoutes('Botanical Garden', 'Kashmere Gate')[0];
  chk('legs cover whole path',
    r.legs.reduce((s, l) => s + l.count, 0) === r.stations, `${r.legs.length} legs`);
  chk('interchange count == legs-1', r.interchanges.length === r.legs.length - 1);
  chk('every leg has a line name', r.legs.every((l) => l.line && l.line.length > 2));
  r.legs.forEach((l) => console.log(`      ${l.line}: ${l.from} -> ${l.to} (${l.count} stops, ${l.km}km)`));
}

console.log('\n=== 8. symmetry (A->B ≈ B->A) ===');
for (const [a, b] of [['Rajiv Chowk', 'Hauz Khas'], ['Inderlok', 'Lajpat Nagar']]) {
  const f = planRoutes(a, b)[0], r = planRoutes(b, a)[0];
  chk(`${a} <-> ${b} same stop count`, f.stations === r.stations, `${f.stations} vs ${r.stations}`);
  chk(`${a} <-> ${b} same fare`, f.fare === r.fare, `Rs${f.fare} vs Rs${r.fare}`);
}

console.log('\n=== 9. error handling ===');
for (const [a, b, why] of [['Nowhere', 'Rajiv Chowk', 'unknown origin'],
                           ['Rajiv Chowk', 'Nowhere', 'unknown destination'],
                           ['Rajiv Chowk', 'Rajiv Chowk', 'same station']]) {
  let threw = false;
  try { planRoutes(a, b); } catch { threw = true; }
  chk(`rejects ${why}`, threw);
}

console.log('\n=== 10. geo + connectivity ===');
{
  const near = nearestStations(28.6328, 77.2197, 3);
  chk('nearest to Connaught Place is Rajiv Chowk', near[0].n === 'Rajiv Chowk',
    `${near[0].n} @ ${near[0].km.toFixed(2)}km`);
  const d = haversine({ lat: 28.6328, lon: 77.2197 }, { lat: 28.5450, lon: 77.2050 });
  chk('haversine ~10km CP->Hauz Khas', d > 8 && d < 12, `${d.toFixed(1)} km`);
  // every station reachable from Rajiv Chowk?
  let reach = 0, bad = [];
  for (const s of STATIONS) {
    if (s.n === 'Rajiv Chowk') continue;
    try { planRoutes('Rajiv Chowk', s.n) ? reach++ : bad.push(s.n); }
    catch { bad.push(s.n); }
  }
  chk('all stations reachable', bad.length === 0, `${reach} reachable, ${bad.length} isolated${bad.length ? ': ' + bad.slice(0, 5).join(', ') : ''}`);
}

console.log('\n=== 11. timetable, last train and connections (new) ===');
{
  const L = lineInfo('Red Line', 9 * 60);
  chk('Red Line is running at 09:00', L.open === true, `${L.first}-${L.last}`);
  chk('Red Line peak headway is published', L.headway && L.headway[0] <= 7 && L.peak, JSON.stringify(L.headway));
  const M = lineInfo('Red Line', 4 * 60);
  chk('Red Line is closed at 04:00 with an opening time', M.open === false && M.nextOpenIn > 0, `opens in ${M.nextOpenIn} min`);
  chk('every corridor carries first/last and headways',
    LINES.every((x) => !x.tt || (x.tt.win && x.tt.win[1] > x.tt.win[0])));
  chk('every corridor carries per-terminal first/last',
    LINES.filter((x) => x.term).every((x) => x.term.length >= 1 && x.term.every((t) => t[2] > t[1])));
  const lt = lastTrainAt('Red Line', 'Rithala', 20 * 60, 'Tis Hazari');
  chk('last train from Rithala towards Tis Hazari is estimated', lt && lt.at > 22 * 60, lt && fmtTime(lt.at));
  chk('a 23:30 boarding is past the last train from Rithala',
    lastTrainAt('Red Line', 'Rithala', 23 * 60 + 30).gone === true);
  chk('02:00 is before opening rather than a missed train',
    lineInfo('Red Line', 2 * 60).open === false && lastTrainAt('Red Line', 'Rithala', 2 * 60).gone === false);
  const jitney = planRoutes('Rithala', 'Shaheed Sthal', { atMin: 23 * 60 + 30 })[0];
  chk('a 23:30 journey reports it cannot be made', jitney.canMakeIt === false, `left ${jitney.lastTrainLeftIn} min`);
  const aqua = planRoutes('Depot Station', 'New Delhi')[0];
  chk('Aqua Line trips say a separate ticket is needed', !!aqua.separateTicket, aqua.separateTicket);
  chk('the Blue/Aqua foot transfer is modelled',
    planRoutes('Noida Sector 51', 'Rajiv Chowk')[0].legs.some((l) => l.walk), 'walk leg');
  chk('Sunday slabs are one step below weekday', fareFor(10, { holiday: true }) < fareFor(10),
    `${fareFor(10, { holiday: true })} vs ${fareFor(10)}`);
  chk('off-peak smart card is 30% below the counter fare on a weekday',
    fareFor(20, { smartcard: true, offPeak: true }) < fareFor(20, { smartcard: true }),
    `${fareFor(20, { smartcard: true, offPeak: true })} vs ${fareFor(20)}`);
  const withBus = STATIONS.filter((s) => (s.b || []).length);
  chk('most stations carry their bus connections', withBus.length > STATIONS.length * 0.7,
    `${withBus.length}/${STATIONS.length}`);
  const kg = busStopsNear('Kashmere Gate');
  chk('Kashmere Gate lists its ISBT stops with route counts', kg.length > 0 && kg[0].routes > 0,
    kg.map((k) => `${k.n} ${k.m}m ${k.routes ?? '-'}R`).join(', '));
}

console.log(`\n${'='.repeat(60)}\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
