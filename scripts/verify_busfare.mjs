/**
 * How wrong is the bus fare?  Measure, don't guess.
 *
 * The planner sums HAVERSINE hops between consecutive stops. Buses follow
 * roads, so the real distance is longer and journeys near a slab boundary get
 * billed at the cheaper slab.
 *
 * MEASUREMENT NOTE (learned the hard way): feeding OSRM every single stop as a
 * waypoint inflates the answer 3-4x. Bus stops snap to the kerb on opposite
 * sides of a divided road, so the driving profile inserts a U-turn at every
 * pair. Ratios of 4.19x were an artifact, not reality — the stop sequences
 * themselves are clean (verified: zigzag 1.08-1.8x, 1.3% duplicate hops).
 * Correct method: route origin -> destination with a FEW mid anchors, which is
 * what a bus actually drives.
 *
 * Official DTC slabs — delhitourism.gov.in/transport/city_bus.html:
 *   ordinary : <=4 km Rs5 · 4-10 km Rs10 · >10 km Rs15
 *   AC       : <=4 km Rs10 · 4-8 km Rs15 · 8-12 km Rs20 · >12 km Rs25
 */
import DATA from '../src/data/bus-delhi.json' with { type: 'json' };

const R = 6371, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fareOrd = (km) => (km <= 4 ? 5 : km <= 10 ? 10 : 15);
const fareAc = (km) => (km <= 4 ? 10 : km <= 8 ? 15 : km <= 12 ? 20 : 25);
const POS = new Map(DATA.stops.map((s) => [s.n, s]));

/** Road distance with a handful of anchors (never every stop — see note). */
async function osrm(seq, anchors = 3) {
  const pick = [seq[0]];
  for (let i = 1; i <= anchors; i++) {
    const j = Math.round((i * (seq.length - 1)) / (anchors + 1));
    if (j > 0 && j < seq.length - 1) pick.push(seq[j]);
  }
  pick.push(seq.at(-1));
  const coords = pick.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const u = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'OmniTools/1.0' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.code !== 'Ok') throw new Error(j.code);
      return j.routes[0].distance / 1000;
    } catch { if (a === 2) return null; await new Promise((s) => setTimeout(s, 1000 * (a + 1))); }
  }
}

const samples = [];
const step = Math.max(1, Math.floor(DATA.routes.length / 26));
for (let i = 0; i < DATA.routes.length && samples.length < 26; i += step) {
  const r = DATA.routes[i];
  if (r.s.length < 12) continue;
  const a = 2, b = Math.min(r.s.length - 1, 2 + 7 + (i % 22));
  const seq = r.s.slice(a, b + 1).map((n) => POS.get(n)).filter(Boolean);
  if (seq.length >= 6) samples.push({ ref: r.r, seq, n: b - a });
}

console.log(`Comparing ${samples.length} real journeys (0 / 3 anchor waypoints)\n`);
console.log('route    stops  straight  road-0  road-3   ratio   fare straight -> road   ');
console.log('-'.repeat(80));

const ratios = []; let wrongOrd = 0, wrongAc = 0, ok = 0;
for (const s of samples) {
  let h = 0;
  for (let i = 0; i < s.seq.length - 1; i++) h += hav(s.seq[i], s.seq[i + 1]);
  const [r0, r3] = [await osrm(s.seq, 0), await osrm(s.seq, 3)];
  if (r3 == null) { console.log(`${s.ref.padEnd(8)} OSRM failed`); continue; }
  ok++;
  const ratio = r3 / h;
  ratios.push(ratio);
  const [fo1, fo2, fa1, fa2] = [fareOrd(h), fareOrd(r3), fareAc(h), fareAc(r3)];
  if (fo1 !== fo2) wrongOrd++;
  if (fa1 !== fa2) wrongAc++;
  console.log(
    `${s.ref.padEnd(8)} ${String(s.n).padEnd(6)} ${h.toFixed(2).padStart(7)} ${(r0 ?? 0).toFixed(2).padStart(7)} ` +
    `${r3.toFixed(2).padStart(7)}  ${ratio.toFixed(3).padStart(6)}   ` +
    `Rs${fo1}/Rs${fa1} -> Rs${fo2}/Rs${fa2}  ${fo1 === fo2 && fa1 === fa2 ? '' : 'MISMATCH'}`);
  await new Promise((r) => setTimeout(r, 300));
}

ratios.sort((a, b) => a - b);
const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
const med = ratios[Math.floor(ratios.length / 2)];
const p25 = ratios[Math.floor(ratios.length * 0.25)];
const p75 = ratios[Math.floor(ratios.length * 0.75)];
console.log('\n' + '-'.repeat(80));
console.log(`journeys=${ok}  ratio mean=${mean.toFixed(3)} median=${med.toFixed(3)} ` +
            `p25=${p25?.toFixed(3)} p75=${p75?.toFixed(3)} min=${ratios[0]?.toFixed(3)} max=${ratios.at(-1)?.toFixed(3)}`);
console.log(`ordinary fare differs on ${wrongOrd}/${ok} · AC fare differs on ${wrongAc}/${ok}`);
console.log(`\n=> road factor to apply offline: ${med.toFixed(2)}`);
