/* Wave A verification — panchang cross-checks, ambient-sound RMS,
   Saraiki spot checks, Verse-of-the-Day pool integrity.
   Run: node --experimental-loader ./scripts/_json_loader.mjs scripts/verify_wave_a.mjs
   Every check prints both values it compared. Exit 1 on any failure. */
let pass = 0, fail = 0;
const chk = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

/* ============================================================ PANCHANG */
console.log('\n=== Panchang cross-checks (Delhi 28.6139, 77.2090, IST +330) ===');
const { computePanchang, sunTimes, tzOffsetMinutes } = await import('../src/core/panchang.js');
const DELHI = { lat: 28.6139, lon: 77.2090, tzMin: 330 };
const fmtT = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

const today = await computePanchang({ y: 2026, m: 11, d: 13, ...DELHI });
console.log(`2026-11-13 sunrise ${fmtT(today.sunrise)} · sunset ${fmtT(today.sunset)}`);
console.log(`tithi ${today.tithi.paksha} ${today.tithi.name} (no. ${today.tithi.number}) ends ${fmtT(today.tithi.ends)}`);
console.log(`nakshatra ${today.nakshatra.name} pada ${today.nakshatra.pada} ends ${fmtT(today.nakshatra.ends)}`);
console.log(`yoga ${today.yoga.name} · karana ${today.karana.name} · ayanamsa ${today.ayanamsa.toFixed(3)}`);
console.log(`rahu ${fmtT(today.kaal.rahu.start)}–${fmtT(today.kaal.rahu.end)} · abhijit ${fmtT(today.abhijit.start)}–${fmtT(today.abhijit.end)}`);
console.log(`hindu month ${today.hindu?.month} · VS ${today.hindu?.vikramSamvat}`);

/* Independent reference 1: sunrise-sunset.org API (UTC answers). */
try {
  const r = await fetch('https://api.sunrise-sunset.org/json?lat=28.6139&lng=77.2090&date=2026-11-13&formatted=0');
  const j = await r.json();
  const apiRise = new Date(j.results.sunrise), apiSet = new Date(j.results.sunset);
  const dRise = Math.abs(apiRise - today.sunrise) / 60000, dSet = Math.abs(apiSet - today.sunset) / 60000;
  chk('sunrise vs sunrise-sunset.org', dRise <= 3, `engine ${fmtT(today.sunrise)} vs API ${fmtT(apiRise)} (Δ ${dRise.toFixed(1)} min)`);
  chk('sunset vs sunrise-sunset.org', dSet <= 3, `engine ${fmtT(today.sunset)} vs API ${fmtT(apiSet)} (Δ ${dSet.toFixed(1)} min)`);
} catch (e) { chk('sunrise-sunset.org reachable', false, e.message); }

/* Independent reference 2: a separate low-precision ephemeris written
   here from Meeus (Astronomical Algorithms, low-precision Appendix III)
   — no code shared with the app engine. Moon is good to ~0.3°, which is
   enough to confirm the tithi/nakshatra unless the true value sits right
   on a boundary; boundary distance is printed either way. */
function meeusSunMoon(date) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360 + 360) % 360;
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * Math.PI / 180;
  const C = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M) * (0.019993 - 0.000101 * T) + Math.sin(3 * M) * 0.000289;
  const sunLon = L0 + C - 0.00569;
  const Lp = ((218.3164477 + T * (481267.88123421)) % 360 + 360) % 360;
  const D = ((297.8501921 + T * (445267.1114034)) % 360) * Math.PI / 180;
  const Mp = (134.9633964 + T * 477198.8675055) * Math.PI / 180;
  const F = (93.2720950 + T * 483202.0175233) * Math.PI / 180;
  const moonLon = Lp + 6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp)
    + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mp) - 0.186 * Math.sin(M)
    - 0.114 * Math.sin(2 * F);
  return { sun: ((sunLon % 360) + 360) % 360, moon: ((moonLon % 360) + 360) % 360 };
}
{
  const { sun, moon } = meeusSunMoon(today.sunrise);
  const el = ((moon - sun) % 360 + 360) % 360;
  const tIdx = Math.floor(el / 12);
  const ayApprox = 23.856 + (2026.87 - 2000) * 0.01396; // Lahiri, independently stated
  const moonSid = ((moon - ayApprox) % 360 + 360) % 360;
  const nakIdx = Math.floor(moonSid / (360 / 27));
  const distTithiBoundary = Math.min(el % 12, 12 - (el % 12));
  const distNakBoundary = Math.min(moonSid % (360 / 27), (360 / 27) - (moonSid % (360 / 27)));
  chk('tithi vs independent ephemeris', tIdx === today.tithi.idx || distTithiBoundary < 0.35,
    `engine idx ${today.tithi.idx} vs Meeus idx ${tIdx} (elongation ${el.toFixed(2)}°, boundary distance ${distTithiBoundary.toFixed(2)}°)`);
  chk('nakshatra vs independent ephemeris', nakIdx === today.nakshatra.idx || distNakBoundary < 0.35,
    `engine idx ${today.nakshatra.idx} vs Meeus idx ${nakIdx} (moon sidereal ${moonSid.toFixed(2)}°, boundary distance ${distNakBoundary.toFixed(2)}°)`);
}

/* Published anchors (Drik Panchang, New Delhi, from published calendars):
   Diwali 8 Nov 2026 — Amavasya tithi began 11:27 AM that day, so at
   sunrise the tithi was Chaturdashi (idx 28); on 9 Nov Amavasya ran
   until 12:31 PM, so sunrise tithi = Amavasya (idx 29).
   Kartik Purnima (Guru Nanak Gurpurab) 24 Nov 2026 — sunrise tithi must
   be Purnima (14) or Chaturdashi (13) if Purnima starts during the day. */
const d8 = await computePanchang({ y: 2026, m: 11, d: 8, ...DELHI });
chk('Diwali morning tithi is Chaturdashi', d8.tithi.idx === 28, `engine idx ${d8.tithi.idx} (${d8.tithi.name}), ends ${fmtT(d8.tithi.ends)}`);
const d9 = await computePanchang({ y: 2026, m: 11, d: 9, ...DELHI });
chk('9 Nov sunrise tithi is Amavasya', d9.tithi.idx === 29, `engine idx ${d9.tithi.idx} (${d9.tithi.name}), ends ${fmtT(d9.tithi.ends)}`);
const d24 = await computePanchang({ y: 2026, m: 11, d: 24, ...DELHI });
chk('Kartik Purnima morning tithi is Purnima/Chaturdashi', d24.tithi.idx === 14 || d24.tithi.idx === 13,
  `engine idx ${d24.tithi.idx} (${d24.tithi.name})`);
chk('13 Nov 2026 is Kartik month, VS 2083', today.hindu?.month === 'Kartik' && today.hindu?.vikramSamvat === 2083,
  `engine says ${today.hindu?.month} / ${today.hindu?.vikramSamvat}`);
chk('Rahu Kaal Friday = segment 4 of daylight', today.kaal.rahu.seg === 4
  && Math.abs((today.kaal.rahu.start - today.sunrise) - 3 * today.dayLengthMs / 8) < 60000,
  `${fmtT(today.kaal.rahu.start)}–${fmtT(today.kaal.rahu.end)}`);
chk('tzOffsetMinutes knows IST', tzOffsetMinutes(new Date('2026-11-13T00:00:00Z'), 'Asia/Kolkata') === 330);

/* ================================================== AMBIENT SOUND RMS */
console.log('\n=== Ambient generators — OfflineAudioContext-equivalent RMS ===');
{
  const { RECIPES, RECIPE_IDS, renderRecipe, rms } = await import('../src/core/ambient.js');
  for (const id of RECIPE_IDS) {
    const buf = renderRecipe(id, 14, 44100);
    const r = rms(buf);
    let peak = 0; for (const v of buf) { const a = Math.abs(v); if (a > peak) peak = a; }
    chk(`RMS ${id} (${RECIPES[id].name})`, r > 0.02, `RMS ${r.toFixed(4)} · peak ${peak.toFixed(3)}`);
    chk(`no clipping ${id}`, peak <= 1.0, `peak ${peak.toFixed(3)}`);
  }
}

/* ==================================================== VOTD INTEGRITY */
console.log('\n=== Verse of the Day pool ===');
{
  const { POOL: VOTD_POOL } = await import('../src/data/votd-pool.js');
  const { votdKind, votdPick } = await import('../src/core/votd.js');
  const kinds = {};
  for (const e of VOTD_POOL) kinds[e.k] = (kinds[e.k] || 0) + 1;
  chk('pool size 47', VOTD_POOL.length === 47, JSON.stringify(kinds));
  chk('every entry complete', VOTD_POOL.every((e) => e.k && e.ref && e.text && e.meaning && e.go));
  chk('each kind >= 6', Object.values(kinds).every((n) => n >= 6), JSON.stringify(kinds));
  const d = new Date(2026, 10, 13);
  const p1 = votdPick(VOTD_POOL, d), p2 = votdPick(VOTD_POOL, d);
  chk('today deterministic', p1 === p2 && p1.k === votdKind(d).k, `${p1.k} — ${p1.ref}`);
  // 4 consecutive days cover all 4 kinds
  const seen = new Set([0, 1, 2, 3].map((i) => votdKind(new Date(2026, 10, 13 + i)).k));
  chk('rotation covers all kinds in 4 days', seen.size === 4, [...seen].join(','));
}

/* =================================================== REMINDERS LOGIC */
console.log('\n=== Path reminder due-logic ===');
{
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const R = await import('../src/core/reminders.js');
  chk('targets cover 5 paths + 8 texts', R.REM_TARGETS.length === 13, `${R.REM_TARGETS.length} targets`);
  const base = [{ id: 'x', target: 'japji', time: '05:00', days: [0, 1, 2, 3, 4, 5, 6], on: true, lastFired: '' }];
  const fri6 = new Date(2026, 10, 13, 6, 0);            // Friday 13 Nov 2026, 06:00
  chk('due after time passes', R.dueReminders(base, fri6).length === 1);
  chk('not due before time', R.dueReminders(base, new Date(2026, 10, 13, 4, 59)).length === 0);
  const fired = R.markFired(base, 'x', fri6);
  chk('not due twice in a day', R.dueReminders(fired, new Date(2026, 10, 13, 21, 0)).length === 0);
  chk('due again next day', R.dueReminders(fired, new Date(2026, 10, 14, 6, 0)).length === 1);
  const weekdayOnly = [{ ...base[0], days: [1] }];       // Mondays only
  chk('day filter honoured', R.dueReminders(weekdayOnly, fri6).length === 0
    && R.dueReminders(weekdayOnly, new Date(2026, 10, 16, 6, 0)).length === 1);
  chk('off switch honoured', R.dueReminders([{ ...base[0], on: false }], fri6).length === 0);
}

/* ================================================ SARAIKI SPOT CHECKS */
console.log('\n=== Saraiki course — structure + authenticity markers ===');
{
  const S = await import('../src/data/saraiki.js');
  chk('100 numbers, in order', S.NUMBERS.length === 100 && S.NUMBERS.every((row, i) => row[0] === i + 1));
  chk('2 is Saraiki ݙُو (du), not Punjabi do',
    S.NUMBERS[1][1].includes('ݙ') && S.NUMBERS[1][2] === 'dū', `${S.NUMBERS[1][1]} · ${S.NUMBERS[1][2]}`);
  chk('10 is ݙَاہ (dah)', S.NUMBERS[9][2] === 'ḍāh', S.NUMBERS[9][1]);
  const allText = JSON.stringify(S.SABAK) + JSON.stringify(S.VERBS);
  chk('meda / teda used (my / your)', allText.includes('مِیݙا') && allText.includes('تِیݙا'));
  const vocabOnly = JSON.stringify(S.SABAK.flatMap((x) => x.items.map((i) => i.s))) + JSON.stringify(S.VERBS);
  chk('NO Punjabi میرا / تیرا in any vocabulary line', !vocabOnly.includes('میرا') && !vocabOnly.includes('تیرا'));
  chk('kithan (where) present', allText.includes('کِتھَاں'));
  chk('ghinna (to take/buy) verb present', S.VERBS.some((v) => v.inf.r === 'ghinṇā'));
  chk('future -san forms present', allText.includes('کرِیساں') && allText.includes('وِیساں'));
  chk('past strong forms present', allText.includes('کِیتا') && allText.includes('کھَادھا'));
  chk('Saraiki implosive letters used (ݙ ٻ)',
    (allText.match(/ݙ/g) || []).length > 30 && (allText.match(/ٻ/g) || []).length > 8,
    `ݙ ×${(allText.match(/ݙ/g) || []).length} · ٻ ×${(allText.match(/ٻ/g) || []).length}`);
  chk('14 Sabaq, 1–9 revision + 10–14 new',
    S.SABAK.length === 14 && S.SABAK.filter((s) => s.kind === 'review').length === 9
    && S.SABAK.filter((s) => s.kind === 'new').length === 5,
    S.SABAK.map((s) => s.n).join(','));
  chk('100+ phrase lines', S.PHRASE_COUNT >= 100, `${S.PHRASE_COUNT} lines`);
  chk('proverbs Sabaq 14 has 6', S.SABAK[13].items.length === 6);
  // 15 deterministic-random entry spot print for the human report
  const flat = [];
  for (const sb of S.SABAK) for (const it of sb.items) flat.push([`S${sb.n}`, it]);
  for (const v of S.VERBS) flat.push(['VERB', v.pres]);
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  console.log('— 15 random entries (spot check) —');
  const picked = new Set();
  while (picked.size < 15) picked.add(Math.floor(rnd() * flat.length));
  for (const i of [...picked].sort((a, b) => a - b)) {
    const [where, it] = flat[i];
    console.log(`  [${where}] ${it.s} · ${it.r} · ${it.en}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
