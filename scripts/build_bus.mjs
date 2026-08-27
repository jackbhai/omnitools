/**
 * Build a REAL Delhi bus network graph from OpenStreetMap.
 *
 * KEY DISCOVERY (found by probing, not assumed):
 *   Delhi bus relations store their stops as `platform` members (48-60 per
 *   route), NOT as `stop` members like the metro does. Querying role=stop
 *   returned almost nothing — which is why an earlier attempt looked empty.
 *
 * Overpass is rate-limited (2 slots) and drops heavy queries with a TLS reset,
 * so this fetches in small geographic tiles with backoff and merges the result.
 */
import fs from 'node:fs';

const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'OmniTools/1.0 transit-graph-builder (github.com/jackbhai/omnitools)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Delhi split into tiles so no single query is too heavy. */
const TILES = [
  [28.40, 76.83, 28.62, 77.12], [28.40, 77.12, 28.62, 77.40],
  [28.62, 76.83, 28.90, 77.12], [28.62, 77.12, 28.90, 77.40],
];

async function overpass(query, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ep = EPS[attempt % EPS.length];
    try {
      const body = new URLSearchParams({ data: query }).toString();
      const r = await fetch(ep, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      });
      if (r.status === 429 || r.status === 504) throw new Error('busy ' + r.status);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      console.log(`  ${label}: ${j.elements?.length ?? 0} elements`);
      return j;
    } catch (e) {
      const wait = 20000 * (attempt + 1);
      console.log(`  ${label}: ${e.message} — waiting ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  console.log(`  ${label}: giving up`);
  return { elements: [] };
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

const routes = new Map();      // ref|from|to -> { ref, from, to, op, stops[] }
const stopPos = new Map();     // name -> {lat,lon}

for (let i = 0; i < TILES.length; i++) {
  const [s, w, n, e] = TILES[i];
  const q = `[out:json][timeout:150];rel["route"="bus"](${s},${w},${n},${e})->.r;` +
            `.r out body;node(r.r);out body;`;
  const d = await overpass(q, `tile ${i + 1}/${TILES.length}`);

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
      const clean = norm(nm);
      if (!seq.length || seq[seq.length - 1] !== clean) seq.push(clean);
      if (!stopPos.has(clean)) stopPos.set(clean, { lat: +nd.lat.toFixed(5), lon: +nd.lon.toFixed(5) });
    }
    if (seq.length < 3) continue;

    const key = `${ref}|${seq[0]}|${seq[seq.length - 1]}`;
    const prev = routes.get(key);
    if (!prev || prev.stops.length < seq.length) {
      routes.set(key, {
        ref,
        from: t.from ? norm(t.from) : seq[0],
        to: t.to ? norm(t.to) : seq[seq.length - 1],
        op: t.operator || '',
        stops: seq,
      });
    }
  }
  if (i < TILES.length - 1) await sleep(8000);   // be polite between tiles
}

const list = [...routes.values()].sort((a, b) =>
  a.ref.localeCompare(b.ref, undefined, { numeric: true }));

const out = {
  built: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass API (route=bus relations, Delhi NCR)',
  note: 'Delhi bus relations expose their stops as platform members; both platform and stop roles are read.',
  routes: list.map((r) => ({ r: r.ref, f: r.from, t: r.to, o: r.op, s: r.stops })),
  stops: [...stopPos.entries()].map(([n, p]) => ({ n, lat: p.lat, lon: p.lon })),
};

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/bus-delhi.json', JSON.stringify(out));

const uniqRefs = new Set(list.map((r) => r.ref));
console.log(`\nroutes      : ${list.length} (${uniqRefs.size} distinct numbers)`);
console.log(`stops       : ${out.stops.length}`);
console.log(`file size   : ${(fs.statSync('src/data/bus-delhi.json').size / 1024).toFixed(1)} KB`);
console.log(`avg stops   : ${Math.round(list.reduce((s, r) => s + r.stops.length, 0) / (list.length || 1))}`);
console.log('\nsample routes:');
for (const r of list.slice(0, 10)) {
  console.log(`  ${r.ref.padEnd(7)} ${String(r.stops.length).padStart(3)} stops  ${r.from.slice(0, 26)} -> ${r.to.slice(0, 26)}`);
}
