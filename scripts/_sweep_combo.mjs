/**
 * _sweep_combo.mjs — the named-pair sweep the combined planner is measured with.
 *
 * Run it after any change to src/core/combo-route.js:
 *
 *   node --experimental-loader ./scripts/_json_loader.mjs scripts/_sweep_combo.mjs
 *
 * It puts eighteen pairs a Delhi rider would actually type through plan() and prints, for
 * each, how many journeys came back, what the best one is, how far the last walk goes and
 * how long the whole thing took. Two things here have caught real bugs: an answer whose
 * kilometre total is far under the distance between the two places (a leg that was stitched
 * from two route records looked exactly like that), and a pair where the metro answer
 * disappeared behind a bus one (Pareto deletes the correct answer when a wrong one is
 * cheaper, so the count of options matters as much as the first one).
 *
 * "MISSING PLACE" lines are the sweep's own fault: those six names are how a person writes
 * the place, not how dtcbusroutes.in and DMRC spell it, and the pair is skipped rather than
 * guessed at. The UI never hits this, because its pickers offer the spellings we ship.
 */
/* Sweep real OD pairs through the combined planner and look for the two things that
 * would embarrass it: an option that asks someone to walk most of a kilometre at
 * either end, and a pair that returns nothing when something obvious exists. Times
 * every answer. Run with: node --experimental-loader ./scripts/_json_loader.mjs scripts/_sweep_combo.mjs
 */
import { plan } from '../src/core/combo-route.js';
import * as M from '../src/core/metro-route.js';
import { STOPS } from '../src/core/bus-route.js';

const at = 8 * 60 + 15;   // 08:15, morning peak, everything running
const pos = (n) => {
  const s = M.STATIONS.find((x) => x.n === n);
  if (s) return { n, kind: 'metro', lat: s.lat, lon: s.lon };
  const b = STOPS.find((x) => x.n === n);
  return b ? { n, kind: 'bus', lat: b.lat, lon: b.lon } : null;
};
const NAMED = [
  ['Rajiv Chowk', 'Hauz Khas'], ['Kashmere Gate', 'AIIMS'], ['Samaypur Badli', 'Rajiv Chowk'],
  ['AIIMS', 'Noida Sector 52'], ['Anand Vihar ISBT', 'Nehru Place'], ['Dwarka Sector 21', 'Connaught Place'],
  ['Janakpuri West', 'Botanical Garden'], ['IGI Airport T3', 'Shahdara'], ['Mayur Vihar I', 'Rohini West'],
  ['Pitampura', 'South Extension'], ['Noida City Centre', 'Barakhamba Road'], ['Okhla Vihar', 'Paschim Vihar'],
  ['Azadpur', 'Vasant Kunj'], ['Lajpat Nagar', 'GTB Nagar'], ['Shiv Vihar', 'Noida Sector 18'],
  ['Netaji Subhash Place', 'AIIMS'], ['Vishwavidyalaya', 'Hauz Khas'], ['Raj Ghat', 'Noida Electronic City'],
];

let worstWalk = 0, worstPair = '', slowest = 0, slowPair = '', empty = 0, mixed = 0, two = 0;
const rows = [];
for (const [a, b] of NAMED) {
  const pa = pos(a), pb = pos(b);
  if (!pa || !pb) { rows.push(`MISSING PLACE ${a} / ${b}`); continue; }
  const t0 = Date.now();
  const r = plan(pa, pb, { atMin: at });
  const ms = Date.now() - t0;
  const o = r.options || [];
  if (ms > slowest) { slowest = ms; slowPair = `${a}→${b} (${r.tried} tried)`; }
  if (!o.length) { empty++; rows.push(`EMPTY  ${a} → ${b}  [${ms} ms]  note: ${r.note || 'none'}`); continue; }
  if (o.some((x) => x.mix === 'Metro + Bus')) mixed++;
  if (o.length >= 2) two++;
  let maxEnd = 0, maxWalk = 0;
  for (const x of o) {
    maxWalk = Math.max(maxWalk, x.walkMin);
    const first = x.legs[0], last = x.legs[x.legs.length - 1];
    if (first && first.kind === 'walk') maxEnd = Math.max(maxEnd, first.km || 0);
    if (last && last.kind === 'walk' && last !== first) maxEnd = Math.max(maxEnd, last.km || 0);
  }
  if (maxEnd > worstWalk) { worstWalk = maxEnd; worstPair = `${a}→${b} ${o[0].mix} ${o[0].minutes}m`; }
  rows.push(`${o.length} opt · best ${o[0].mix} ${o[0].minutes}m ₹${o[0].fare} ch${o[0].changes} `
    + `· walk ${maxWalk}m end ${maxEnd}km · ${ms} ms · dropped ${r.dropped}  (${a}→${b})`);
}
console.log(rows.join('\n'));
console.log(`\npairs ${NAMED.length} · with a mixed option ${mixed} · 2+ options ${two} · empty ${empty}`);
console.log(`worst end walk ${worstWalk} km (${worstPair || '—'}) · slowest ${slowest} ms (${slowPair})`);
