/**
 * SUPERSEDED — do not run.
 *
 * scripts/build_transit_data.py is now the single builder for BOTH datasets and
 * writes src/data/bus-delhi.json + metro-delhi.json in the v2 schema (published
 * timetables, per-stop distances along the driven polyline, metro line timings).
 * Running this older script would overwrite that with the smaller OSM-only
 * build.  It is kept only because it contains the OpenStreetMap fetch, which
 * build_transit_data.py needs as scripts/osm-sources/{bus,metro}-osm.json.
 */
/**
 * Build a REAL Delhi Metro graph from OpenStreetMap (Overpass).
 *
 * Why prebuild instead of querying at runtime: the full relation download is
 * ~400 KB and takes ~17 s. Baking a compact graph into the bundle makes the
 * route planner instant AND immune to Overpass downtime — while still being
 * 100% genuine OSM data (no invented stations, no placeholder fares).
 *
 * Correctness notes discovered while testing:
 *  - Every line exists as TWO relations (A→B and B→A). Counting both made
 *    every station look like an interchange (289 "interchanges" — nonsense).
 *  - Simply keeping the longest direction DROPPED real branches: the Blue Line
 *    Yamuna Bank→Vaishali spur, Green Line Kirti Nagar spur, Magenta Line
 *    Majlis Park spur and the RRTS Duhai branch all disappeared.
 *    Fix: keep every DISTINCT stop-sequence (ignoring pure reversals).
 */
import fs from 'node:fs';

const BBOX = '28.30,76.70,28.95,77.60';
const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const Q = `[out:json][timeout:180];rel["route"="subway"](${BBOX})->.r;` +
          `.r out body;` +
          `node(r.r);out body;`;

const norm = (s) => s.replace(/\s*\(.*?\)\s*/g, ' ')
  .replace(/\s+Metro Station$/i, '')
  .replace(/\s+/g, ' ').trim();

const baseName = (t) => {
  let n = (t.name || '').replace(/\s*[([:].*$/, '');      // drop "(A → B)" / ": A → B"
  n = n.replace(/\s+[=-]?[>→].*$/, '');                    // drop " → B" style suffixes
  return n.trim() || t.ref || 'Line';
};

async function fetchOverpass() {
  let last;
  for (const ep of EPS) {
    for (let a = 0; a < 2; a++) {
      try {
        const r = await fetch(ep, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(Q),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'OmniTools/1.0 metro-graph-builder (github.com/jackbhai/omnitools)',
          },
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if ((j.elements || []).length > 100) return j;
        throw new Error('too few elements');
      } catch (e) { last = e; console.error(`  retry ${ep}: ${e.message}`); }
    }
  }
  throw last;
}

const raw = await fetchOverpass();
const nodes = new Map();
for (const e of raw.elements) if (e.type === 'node') nodes.set(e.id, e);
const rels = raw.elements.filter((e) => e.type === 'relation');
console.log(`fetched: ${rels.length} relations, ${nodes.size} nodes`);

/* ---- collect every distinct branch, keyed by line name ---- */
const byLine = new Map();
for (const r of rels) {
  const t = r.tags || {};
  const seq = [];
  for (const m of r.members || []) {
    if (m.type !== 'node' || !String(m.role || '').startsWith('stop')) continue;
    const n = nodes.get(m.ref);
    const nm = n?.tags?.name;
    if (nm) seq.push({ n: norm(nm), lat: +n.lat.toFixed(5), lon: +n.lon.toFixed(5) });
  }
  const ded = [];
  for (const s of seq) if (!ded.length || ded[ded.length - 1].n !== s.n) ded.push(s);
  if (ded.length < 3) continue;

  const key = baseName(t).toLowerCase();
  if (!byLine.has(key)) byLine.set(key, { name: baseName(t), colour: t.colour || t.color || '#00FF9C', branches: [] });
  const bucket = byLine.get(key);
  const sig = ded.map((s) => s.n).join('|');
  const rev = [...ded].reverse().map((s) => s.n).join('|');
  // keep only genuinely different branches (a reversed duplicate is the same line)
  if (!bucket.branches.some((b) => b.sig === sig || b.sig === rev)) {
    bucket.branches.push({ sig, stops: ded });
  }
  if (t.colour && bucket.colour === '#00FF9C') bucket.colour = t.colour;
}

/* ---- flatten to segments ---- */
const lines = [];
for (const [, v] of byLine) {
  v.branches.sort((a, b) => b.stops.length - a.stops.length);
  v.branches.forEach((b, i) => {
    lines.push({
      name: v.name + (i ? ` (${b.stops[0].n} branch)` : ''),
      line: v.name,
      colour: v.colour,
      stops: b.stops,
    });
  });
}

/* ---- station index + coordinates ---- */
const stations = new Map();
lines.forEach((L, li) => {
  for (const s of L.stops) {
    if (!stations.has(s.n)) stations.set(s.n, { name: s.n, lat: s.lat, lon: s.lon, lines: new Set() });
    stations.get(s.n).lines.add(L.line);
  }
});

const out = {
  built: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass API (route=subway relations)',
  fares: {
    note: 'DMRC fares effective 25 Aug 2025 — cross-checked against 4 independent reports',
    weekday: [[2, 11], [5, 21], [12, 32], [21, 43], [32, 54], [Infinity, 64]],
    holiday: [[2, 11], [5, 21], [12, 32], [21, 43], [32, 54], [Infinity, 54]],
    smartcardDiscount: 0.10,
    airportExpress: [[2, 11], [5, 21], [12, 32], [21, 43], [32, 54], [Infinity, 70]],
  },
  lines: lines.map((L) => ({ n: L.name, l: L.line, c: L.colour, s: L.stops.map((x) => x.n) })),
  stations: [...stations.values()].map((s) => ({
    n: s.name, lat: s.lat, lon: s.lon, l: [...s.lines],
  })),
};

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/metro-delhi.json', JSON.stringify(out));

const inter = out.stations.filter((s) => s.l.length > 1);
console.log(`\nlines/branches : ${out.lines.length}`);
console.log(`stations       : ${out.stations.length}`);
console.log(`interchanges   : ${inter.length}`);
console.log(`file size      : ${(fs.statSync('src/data/metro-delhi.json').size / 1024).toFixed(1)} KB`);
console.log('\nbranches kept:');
for (const L of out.lines) console.log(`  ${L.n.padEnd(42)} ${String(L.s.length).padStart(3)} stops  ${L.c}`);
console.log('\ninterchanges:');
for (const s of inter.sort((a, b) => b.l.length - a.l.length)) console.log(`  ${s.n.padEnd(28)} ${s.l.join(' + ')}`);
