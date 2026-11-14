/**
 * Verification of the other-city transit expansion: 12 metro shards built
 * from OpenStreetMap relations and cross-checked against published line
 * tables, plus 4 bus shards converted from community GTFS feeds.
 * Every number below is a KNOWN-GOOD fact from the build report
 * (scratch-transit, 2026-11-14). Any mismatch is printed loudly.
 */
import { readFileSync } from 'node:fs';
import { planCityMetro, cityIndex } from '../src/core/metro-city.js';
import { initBusData, findRoute, planBus, nameOf, ROUTES } from '../src/core/bus-route.js';

let pass = 0, fail = 0;
const chk = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const J = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));

console.log('=== 1. manifests match shards ===');
const mMan = J('transit-manifest-metro.json');
const bMan = J('transit-manifest-bus.json');
chk('12 metro cities in manifest', mMan.length === 12, `${mMan.length}`);
chk('4 bus cities in manifest', bMan.length === 4, `${bMan.length}`);

/* city: [lines, stations, interchanges, lineStations] — verified at build */
const METRO_FACTS = {
  kolkata:   [5, 55, 3, 58],
  mumbai:    [7, 94, 3, 98],
  navimumbai:[1, 11, 0, 11],
  bengaluru: [4, 88, 3, 91],
  chennai:   [2, 41, 2, 43],
  hyderabad: [3, 56, 3, 59],
  kochi:     [1, 25, 0, 25],
  lucknow:   [1, 21, 0, 21],
  jaipur:    [1, 11, 0, 11],
  ahmedabad: [4, 53, 3, 56],
  pune:      [3, 44, 1, 46],
  kanpur:    [1, 14, 0, 14],
};
const shards = {};
for (const c of mMan) {
  const d = J(c.file);
  shards[c.id] = d;
  const f = METRO_FACTS[c.id];
  chk(`${c.id}: manifest = shard stats`,
    c.lines === d.stats.lines && c.stations === d.stats.stations);
  chk(`${c.id}: lines/stations/interchanges/line-stations`,
    f && d.stats.lines === f[0] && d.stats.stations === f[1] &&
    d.stats.interchanges === f[2] && d.stats.lineStations === f[3],
    `${d.stats.lines}/${d.stats.stations}/${d.stats.interchanges}/${d.stats.lineStations}`);
  const names = new Set(d.stations.map((s) => s.n));
  chk(`${c.id}: every line stop is a station with coords`,
    d.lines.every((L) => L.s.every((n) => names.has(n))) &&
    d.stations.every((s) => s.lat > 5 && s.lat < 38 && s.lon > 65 && s.lon < 100));
  chk(`${c.id}: station line refs match lines`,
    d.stations.every((s) => s.l.every((lab) =>
      d.lines.some((L) => L.n === lab && L.s.includes(s.n)))));
}

console.log('\n=== 2. famous metro rides plan correctly ===');
const ride = (id, a, b, stops, changes) => {
  const p = planCityMetro(shards[id], a, b);
  chk(`${id}: ${a} → ${b}`, p.totalStops === stops && p.changes === changes,
    `${p.totalStops} stops, ${p.changes} changes`);
};
ride('kolkata', 'Kavi Subhash', 'Dakshineshwar', 25, 0);
ride('kolkata', 'Howrah Maidan', 'Salt Lake Sector V', 11, 0);
ride('mumbai', 'Aarey JVLR', 'Cuffe Parade', 26, 0);
ride('mumbai', 'Chembur', 'Sant Gadge Maharaj Chowk', 17, 0);
ride('bengaluru', 'Whitefield (Kadugodi)', 'Challaghatta', 36, 0);
ride('bengaluru', 'Silk Institute', 'Madavara', 31, 0);
ride('hyderabad', 'Nagole', 'Raidurg', 22, 0);
ride('hyderabad', 'Miyapur', 'Parade Grounds', 15, 1);
ride('lucknow', 'Chaudhary Charan Singh International Airport', 'Munshipulia', 20, 0);
ride('chennai', 'Chennai International Airport', 'Wimco Nagar Depot', 25, 0);
ride('pune', 'PCMC Bhavan', 'Swargate', 12, 0);
ride('ahmedabad', 'Thaltej Gam', 'Motera Stadium', 14, 1);

console.log('\n=== 3. bus shards: schema + famous routes ===');
/* city: [unique route numbers, route records, physical stops, famous ref, min stops] */
const BUS_FACTS = {
  bengaluru: [2766, 5108, 5001, 'KIA-9', 20],
  mumbai:    [429, 850, 2395, '66', 35],
  pune:      [315, 628, 3951, '103', 30],
  ahmedabad: [362, 540, 3087, '101sh', 40],
};
for (const c of bMan) {
  const d = J(c.file);
  const f = BUS_FACTS[c.id];
  chk(`${c.id}: stats`, f && d.stats.unique_route_numbers === f[0] &&
    d.stats.route_records === f[1] && d.stats.physical_stops === f[2],
    `${d.stats.unique_route_numbers}/${d.stats.route_records}/${d.stats.physical_stops}`);
  chk(`${c.id}: no fare table shipped (feed publishes none)`, d.fare === null);
  chk(`${c.id}: timetables on >90% of records`,
    d.stats.with_timetable > d.stats.route_records * 0.9, `${d.stats.with_timetable}`);
  initBusData(d);
  const recs = findRoute(f[3]);
  chk(`${c.id}: famous route ${f[3]} exists`, recs.length > 0 && recs[0].s.length >= f[4],
    recs.length ? `${recs[0].f} → ${recs[0].t}, ${recs[0].s.length} stops` : 'MISSING');
  const r = recs[0];
  const plan = planBus(nameOf(r.s[0]), nameOf(r.s[r.s.length - 1]));
  chk(`${c.id}: plan along ${f[3]} is direct`,
    plan.some((o) => o.changes === 0 && o.legs.some((l) => l.ref === f[3])),
    `${plan.length} options`);
  chk(`${c.id}: engine routes loaded`, ROUTES.length === f[1], `${ROUTES.length}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
