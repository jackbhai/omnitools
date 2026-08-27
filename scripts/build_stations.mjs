/**
 * Build an ALL-INDIA railway station list from OpenStreetMap.
 *
 * Why: the app only offered ~60 hardcoded station codes, so "trains between"
 * could never cover the country. Neither eRail (getStations 302-redirects) nor
 * RailRadar (no /stations route) exposes a station directory, so we derive one
 * from OSM railway=station nodes that carry a `ref` (the IR station code).
 *
 * Fetched in state-sized tiles because Overpass rate-limits (2 slots) and kills
 * heavy queries with a TLS reset.
 */
import fs from 'node:fs';

const EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'OmniTools/1.0 station-index-builder (github.com/jackbhai/omnitools)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* India split into 12 tiles: south→north, west→east. */
const TILES = [
  [ 8.0, 68.0, 15.0, 78.0], [ 8.0, 78.0, 15.0, 88.0],
  [15.0, 68.0, 21.0, 76.0], [15.0, 76.0, 21.0, 82.0], [15.0, 82.0, 21.0, 90.0],
  [21.0, 68.0, 26.0, 76.0], [21.0, 76.0, 26.0, 82.0], [21.0, 82.0, 26.0, 90.0],
  [26.0, 68.0, 31.0, 76.0], [26.0, 76.0, 31.0, 82.0], [26.0, 82.0, 31.0, 90.0],
  [31.0, 68.0, 37.0, 80.0],
];

async function overpass(query, label) {
  for (let a = 0; a < 4; a++) {
    const ep = EPS[a % EPS.length];
    try {
      const r = await fetch(ep, {
        method: 'POST',
        body: new URLSearchParams({ data: query }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      console.log(`  ${label}: ${j.elements?.length ?? 0} nodes`);
      return j;
    } catch (e) {
      const w = 15000 * (a + 1);
      console.log(`  ${label}: ${e.message} — wait ${w / 1000}s`);
      await sleep(w);
    }
  }
  return { elements: [] };
}

const title = (s) => s.replace(/\s+/g, ' ').trim();
const stations = new Map();   // code -> record

for (let i = 0; i < TILES.length; i++) {
  const [s, w, n, e] = TILES[i];
  const q = `[out:json][timeout:170];node["railway"="station"]["ref"](${s},${w},${n},${e});out body;`;
  const d = await overpass(q, `tile ${i + 1}/${TILES.length}`);
  for (const el of d.elements || []) {
    const t = el.tags || {};
    const code = String(t.ref || '').toUpperCase().trim();
    const name = title(t.name || t['name:en'] || '');
    if (!code || !name || !/^[A-Z]{2,6}$/.test(code)) continue;
    const prev = stations.get(code);
    // prefer the record with a longer/more descriptive name
    if (!prev || name.length > prev.n.length) {
      stations.set(code, {
        c: code, n: name,
        lat: +el.lat.toFixed(4), lon: +el.lon.toFixed(4),
        s: t['addr:state'] || '',
      });
    }
  }
  if (i < TILES.length - 1) await sleep(6000);
}

const list = [...stations.values()].sort((a, b) => a.n.localeCompare(b.n));
const out = {
  built: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap railway=station nodes carrying an IR `ref` code',
  count: list.length,
  stations: list,
};
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/stations-india.json', JSON.stringify(out));

console.log(`\nstations : ${list.length}`);
console.log(`file     : ${(fs.statSync('src/data/stations-india.json').size / 1024).toFixed(1)} KB`);
const must = ['NDLS', 'CSTM', 'HWH', 'MAS', 'SBC', 'ASR', 'PNBE', 'ADI', 'JP', 'LKO', 'BZA', 'TVC'];
console.log('\nkey stations present:');
for (const c of must) {
  const f = list.find((x) => x.c === c);
  console.log(`  ${c.padEnd(6)} ${f ? f.n : '*** MISSING ***'}`);
}
