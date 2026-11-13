/**
 * Big reference datasets — full directories people otherwise open two or
 * three other apps for, served as shards from public/data and fetched on
 * demand (the medicine pattern): a lookup downloads one small file, the
 * service worker keeps it, and the same lookup answers offline forever.
 *
 *   Rail timetable   5,208 trains · every station, scheduled arr/dep, days
 *   PIN directory    157,126 post offices across 19,300 PIN codes
 *   IFSC directory   183,214 bank branches of 1,367 banks
 *   Blood banks      2,820 banks, state/district, address + phone
 *   Kanoon           BNS 358 sections (Gazette text) + IPC 575 sections
 *   Cricket archive  1,243 IPL matches, full computed scorecards + records
 *
 * Shard files are flat arrays with positional fields; each loader below
 * documents its row shape once, here, so the tools stay readable.
 */

const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
const DATA = `${BASE}/data`;

const cache = new Map();
function jget(file, ms = 20000) {
  if (cache.has(file)) return cache.get(file);
  const p = (async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(`${DATA}/${file}`, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  })();
  cache.set(file, p);
  p.catch(() => cache.delete(file));
  return p;
}

export const slug = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* ------------------------------------------------------------------ rail
   index.trains rows: [no, name, type, fromCode, toCode, daysMask, km, stops]
   daysMask bits: Mon=1 Tue=2 Wed=4 Thu=8 Fri=16 Sat=32 Sun=64
   route rows:        [stationCode, arr 'HH:MM'|null, dep|null, journeyDay] */
export const railIndex = () => jget('rail-index.json');
export const railStations = () => jget('rail-stations.json');
export async function railRoute(no) {
  const all = await jget(`rail-r${String(no).slice(0, 2)}.json`);
  return all[no] || null;
}
export async function railByStation(code) {
  const all = await jget(`rail-bs-${code[0].toLowerCase()}.json`);
  return all[code] || [];
}

/* ------------------------------------------------------------------- pin
   by-PIN rows:  [office, type, delivery, district, state, taluk, division, lat, lng]
   district rows:[office, pin, type, delivery]
   name rows:    [office, pin, district, state] */
export const pinMeta = () => jget('pin-meta.json');
export const pinDistTree = () => jget('pin-dist.json');
export async function pinByPin(pin) {
  const all = await jget(`pin-p${pin.slice(0, 3)}.json`);
  return all[pin] || [];
}
export const pinDistrict = (state, district) =>
  jget(`pin-bd-${slug(state)}-${slug(district)}.json`);
export const pinByName = (letter) => jget(`pin-nm-${letter.toLowerCase()}.json`);

/* ------------------------------------------------------------------ ifsc
   detail: { IFSC: [bankIdx, branch, centre, district, state, address,
                    contact, city, micr, swift, flags] }
   flags bits: IMPS=1 RTGS=2 NEFT=4 UPI=8
   browse rows: [ifsc, branch, city, district, state] */
export const ifscMeta = () => jget('ifsc-meta.json');
export const ifscBanks = () => jget('ifsc-banks.json');
export async function ifscDetail(ifsc) {
  const all = await jget(`ifsc-d-${ifsc.slice(0, 2).toLowerCase()}.json`);
  const rec = all[ifsc];
  if (!rec) return null;
  const banks = await ifscBanks();
  return { ifsc, bank: (banks[rec[0]] || [ifsc.slice(0, 4)])[0], branch: rec[1],
    centre: rec[2], district: rec[3], state: rec[4], address: rec[5],
    contact: rec[6], city: rec[7], micr: rec[8], swift: rec[9],
    imps: !!(rec[10] & 1), rtgs: !!(rec[10] & 2), neft: !!(rec[10] & 4), upi: !!(rec[10] & 8) };
}
export const ifscBrowse = (bankIdx) => jget(`ifsc-b${bankIdx}.json`);

/* ----------------------------------------------------------------- blood
   rows: [name, district, city, address, pin, phone, category, components] */
export const bloodIndex = () => jget('blood-index.json');
export const bloodState = (state) => jget(`blood-s-${slug(state)}.json`);

/* ---------------------------------------------------------------- kanoon
   index: { bns: {count, chapters[], index[[no, title, chapter]]}, ipc: same }
   chapter files: [{n, title, chapter, text}] */
export const kanoonIndex = () => jget('kanoon-index.json');
export const kanoonChapter = (act, i) => jget(`kanoon-${act}-${i}.json`);

/* --------------------------------------------------------------- cricket
   season rows: [matchId, date, [team1, team2], result, scoreSummary, [pom]]
   stats.bat rows:  [name, matches, innings, notOuts, runs, balls, highScore,
                     hsNotOut, hundreds, fifties, fours, sixes]
   stats.bowl rows: [name, matches, balls, runs, wickets, best]            */
export const cricketIndex = () => jget('cricket-index.json');
export const cricketSeason = (s) => jget(`cricket-s${String(s).replace('/', '-')}.json`);
export const cricketMatch = (id) => jget(`cricket-m${id}.json`);
export const cricketStats = () => jget('cricket-stats.json');
