/** Why is road/straight 4x on some routes?  Inspect the raw stop sequence. */
import DATA from '../src/data/bus-delhi.json' with { type: 'json' };
const R = 6371, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const POS = new Map(DATA.stops.map((s) => [s.n, s]));

for (const ref of ['620', '356', '442', '85']) {
  const r = DATA.routes.find((x) => x.r === ref);
  if (!r) { console.log(ref, 'not found'); continue; }
  console.log(`\n=== ${ref}: ${r.f} -> ${r.t} · ${r.s.length} stops ===`);
  const seq = r.s.slice(2, 20);
  let tot = 0, back = 0, dup = 0;
  for (let i = 0; i < seq.length - 1; i++) {
    const a = POS.get(seq[i]), b = POS.get(seq[i + 1]);
    if (!a || !b) continue;
    const d = hav(a, b);
    tot += d;
    if (d < 0.05) dup++;
    if (i < 10) console.log(`   ${seq[i].slice(0, 30).padEnd(32)} -> ${seq[i + 1].slice(0, 30).padEnd(32)} ${d.toFixed(3)} km`);
  }
  // straight-line start->end vs sum of hops: if sum >> direct, the order zigzags
  const a = POS.get(seq[0]), b = POS.get(seq.at(-1));
  const direct = a && b ? hav(a, b) : 0;
  console.log(`   hops=${tot.toFixed(2)}km  endpoint-direct=${direct.toFixed(2)}km  ` +
              `zigzag=${(tot / (direct || 1)).toFixed(2)}x  near-dup-hops=${dup}`);
}

/* Are stops ordered along the line at all?  Monotonic-progress test. */
console.log('\n=== ordering sanity across ALL routes ===');
let bad = 0, tested = 0, dupTotal = 0, hops = 0;
for (const r of DATA.routes) {
  const pts = r.s.map((n) => POS.get(n)).filter(Boolean);
  if (pts.length < 8) continue;
  tested++;
  let sum = 0, d0 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = hav(pts[i], pts[i + 1]);
    sum += d; hops++;
    if (d < 0.05) dupTotal++;
  }
  d0 = hav(pts[0], pts.at(-1));
  if (d0 > 0.4 && sum / d0 > 2.6) bad++;
}
console.log(`routes tested=${tested}  zigzag(>2.6x)=${bad}  ` +
            `near-duplicate hops=${dupTotal}/${hops} (${(100 * dupTotal / hops).toFixed(1)}%)`);
