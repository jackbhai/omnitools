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
 * Build a REAL Delhi bus network graph from OpenStreetMap.
 *
 * KEY DISCOVERY (found by probing, not assumed):
 *   Delhi bus relations store their stops as `platform` members (48-60 per
 *   route), NOT as `stop` members like the metro does. Querying role=stop
 *   returned almost nothing — which is why an earlier attempt looked empty.
 *
 * BUG THIS VERSION FIXES — the cause of wrong bus fares:
 *   v1 kept `stopPos` as a Map keyed on the stop NAME alone. Delhi reuses the
 *   same name in completely different places ("ESI Hospital" exists in Punjabi
 *   Bagh AND in Basaidarapur; "Prahladpur" exists in both south and outer
 *   Delhi). Every duplicate collapsed onto the FIRST coordinate seen, which
 *   teleported the route across the city: route 34 measured 63 km of hops for
 *   a 16 km ride, and 220 of 7,321 hops (3.0%) were bogus >5 km jumps.
 *   Distance drives the fare slab, so fares were wrong.
 *
 *   Fix: stops are now identified by NAME + LOCATION. Nodes within ~350 m of
 *   each other with the same name are one physical stop; the same name far
 *   away becomes a separate stop that carries its own coordinates. Routes
 *   store integer indices into the stop table, so the file is also smaller.
 *
 * Overpass is rate-limited (2 slots) and drops heavy queries with a TLS reset,
 * so this fetches in small geographic tiles with backoff and merges the result.
 */
import fs from 'node:fs';

const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const UA = 'OmniTools/1.0 transit-graph-builder (github.com/jackbhai/omnitools)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Delhi + immediate NCR split into tiles so no single query is too heavy. */
const TILES = [
  [28.40, 76.83, 28.62, 77.12], [28.40, 77.12, 28.62, 77.40],
  [28.62, 76.83, 28.90, 77.12], [28.62, 77.12, 28.90, 77.40],
];

/* Tiles are cached on disk: Overpass regularly 504s/502s for minutes at a
   time, and re-downloading the tiles that already succeeded wastes its rate
   limit and our patience. Delete /tmp/ovp-bus-*.json to force a refresh. */
async function overpass(query, label, cacheKey) {
  const cache = `/tmp/ovp-bus-${cacheKey}.json`;
  if (fs.existsSync(cache)) {
    const j = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (j.elements?.length) { console.log(`  ${label}: ${j.elements.length} elements (cached)`); return j; }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const ep = EPS[attempt % EPS.length];
    try {
      const body = new URLSearchParams({ data: query }).toString();
      const r = await fetch(ep, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        signal: AbortSignal.timeout(200000),
      });
      if (r.status === 429 || r.status === 504) throw new Error('busy ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.elements?.length) throw new Error('empty response');
      console.log(`  ${label}: ${j.elements.length} elements`);
      fs.writeFileSync(cache, JSON.stringify(j));
      return j;
    } catch (e) {
      const wait = Math.min(20000 + 12000 * attempt, 75000);
      console.log(`  ${label}: ${e.message} — retry ${attempt + 1}/10 in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  console.log(`  ${label}: giving up`);
  return { elements: [] };
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const R = 6371, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* ---- physical stop table: same name + within 350 m = the same stop ------- */
const CLUSTER_KM = 0.35;
const byName = new Map();     // name -> [{lat,lon,idx,n}]
const stops = [];             // final table

function stopId(name, lat, lon) {
  const list = byName.get(name) || [];
  for (const s of list) {
    if (hav(s, { lat, lon }) <= CLUSTER_KM) {
      // keep a running mean so the coordinate is the centre of the platforms
      s.k += 1;
      s.lat += (lat - s.lat) / s.k;
      s.lon += (lon - s.lon) / s.k;
      return s.idx;
    }
  }
  const rec = { n: name, lat, lon, k: 1, idx: stops.length };
  stops.push(rec);
  list.push(rec);
  byName.set(name, list);
  return rec.idx;
}

const routes = new Map();     // ref|firstIdx|lastIdx -> route

for (let i = 0; i < TILES.length; i++) {
  const [s, w, n, e] = TILES[i];
  const q = `[out:json][timeout:180];rel["route"="bus"](${s},${w},${n},${e})->.r;` +
            `.r out body;node(r.r);out body;`;
  const d = await overpass(q, `tile ${i + 1}/${TILES.length}`, i);

  const nodes = new Map();
  for (const el of d.elements || []) if (el.type === 'node') nodes.set(el.id, el);

  for (const rel of (d.elements || []).filter((x) => x.type === 'relation')) {
    const t = rel.tags || {};
    const ref = (t.ref || '').trim();
    if (!ref) continue;

    const seq = [];
    for (const m of rel.members || []) {
      if (m.type !== 'node') continue;
      const role = String(m.role || '');
      // Delhi uses `platform`; keep `stop*` too for routes that use it.
      if (!(role.startsWith('stop') || role.includes('platform'))) continue;
      const nd = nodes.get(m.ref);
      const nm = nd?.tags?.name;
      if (!nm) continue;
      const id = stopId(norm(nm), nd.lat, nd.lon);
      if (seq[seq.length - 1] !== id) seq.push(id);
    }
    if (seq.length < 3) continue;

    const key = `${ref}|${seq[0]}|${seq[seq.length - 1]}`;
    const prev = routes.get(key);
    if (!prev || prev.stops.length < seq.length) {
      routes.set(key, {
        ref,
        from: t.from ? norm(t.from) : stops[seq[0]].n,
        to: t.to ? norm(t.to) : stops[seq[seq.length - 1]].n,
        op: t.operator || '',
        stops: seq,
      });
    }
  }
  if (i < TILES.length - 1) await sleep(6000);   // be polite between tiles
}

/* ---- post-pass: undo centroid drift -------------------------------------
   Clustering is incremental, so two clusters of the same name can drift
   toward each other as their means update and end up closer than the 350 m
   threshold that was supposed to separate them (Mandi House ended 178 m
   apart). Merge any same-name pair that finished within MERGE_KM and remap
   every route that referenced the loser.                                   */
const MERGE_KM = 0.30;
{
  const remap = new Map();
  for (const list of byName.values()) {
    for (let i = 0; i < list.length; i++) {
      if (remap.has(list[i].idx)) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (remap.has(list[j].idx)) continue;
        if (hav(list[i], list[j]) <= MERGE_KM) {
          // weighted mean of the two platform groups
          const tot = list[i].k + list[j].k;
          list[i].lat = (list[i].lat * list[i].k + list[j].lat * list[j].k) / tot;
          list[i].lon = (list[i].lon * list[i].k + list[j].lon * list[j].k) / tot;
          list[i].k = tot;
          remap.set(list[j].idx, list[i].idx);
        }
      }
    }
  }
  if (remap.size) {
    // rebuild the stop table without the merged-away entries
    const keep = stops.filter((s) => !remap.has(s.idx));
    const newIdx = new Map(keep.map((s, i) => [s.idx, i]));
    const resolve = (i) => newIdx.get(remap.has(i) ? remap.get(i) : i);
    for (const r of routes.values()) {
      const seq = [];
      for (const s of r.stops) {
        const n = resolve(s);
        if (n != null && seq[seq.length - 1] !== n) seq.push(n);
      }
      r.stops = seq;
    }
    stops.length = 0;
    keep.forEach((s, i) => { s.idx = i; stops.push(s); });
    console.log(`\nmerged ${remap.size} drifted duplicate stop(s) within ${MERGE_KM * 1000} m`);
  }
  // drop routes that collapsed below the minimum after the merge
  for (const [k, r] of routes) if (r.stops.length < 3) routes.delete(k);
}

const list = [...routes.values()].sort((a, b) =>
  a.ref.localeCompare(b.ref, undefined, { numeric: true }));

/* ---------------------------------------------- quality report before write */
let hops = 0, big = 0, worst = [];
for (const r of list) {
  for (let i = 0; i < r.stops.length - 1; i++) {
    const d = hav(stops[r.stops[i]], stops[r.stops[i + 1]]);
    hops++;
    if (d > 5) { big++; worst.push([d, r.ref, stops[r.stops[i]].n, stops[r.stops[i + 1]].n]); }
  }
}
worst.sort((a, b) => b[0] - a[0]);

const dupNames = [...byName.values()].filter((v) => v.length > 1);

const out = {
  built: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass API (route=bus relations, Delhi NCR)',
  note: 'Stops are identified by name AND location: the same name more than 350 m away is a separate physical stop. Routes reference stops by index.',
  routes: list.map((r) => ({ r: r.ref, f: r.from, t: r.to, o: r.op, s: r.stops })),
  stops: stops.map((s) => ({ n: s.n, lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5) })),
};

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/bus-delhi.json', JSON.stringify(out));

const uniqRefs = new Set(list.map((r) => r.ref));
console.log(`\nroutes        : ${list.length} (${uniqRefs.size} distinct numbers)`);
console.log(`stops         : ${stops.length} physical (${byName.size} distinct names)`);
console.log(`split names   : ${dupNames.length} names exist at 2+ locations`);
console.log(`file size     : ${(fs.statSync('src/data/bus-delhi.json').size / 1024).toFixed(1)} KB`);
console.log(`avg stops/rt  : ${Math.round(list.reduce((s, r) => s + r.stops.length, 0) / (list.length || 1))}`);
console.log(`bogus hops>5km: ${big}/${hops} (${(100 * big / hops).toFixed(2)}%)   <- was 3.01% before the fix`);
if (worst.length) {
  console.log('worst remaining hops:');
  for (const w of worst.slice(0, 5)) console.log(`  ${w[0].toFixed(1)} km  ${w[1]}  ${w[2]} -> ${w[3]}`);
}
console.log('\nnames that were being merged (now separate):');
for (const v of dupNames.slice(0, 8)) {
  console.log(`  ${v[0].n} x${v.length}  ` +
    v.map((s) => `(${s.lat.toFixed(3)},${s.lon.toFixed(3)})`).join(' '));
}
