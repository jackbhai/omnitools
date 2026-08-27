/** 10-round verification of the train data sources before shipping. */
const RR = 'https://railradar.in/api/v1';
let pass = 0, fail = 0;
const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const get = async (u) => (await fetch(u, { headers: { 'User-Agent': 'OmniTools/1.0' } })).json();
const getText = async (u) => (await fetch(u, { headers: { 'User-Agent': 'OmniTools/1.0' } })).text();

console.log('=== 1. schedule endpoint returns REAL per-train data ===');
const KNOWN = [
  ['12013', 'Amritsar Shatabdi', 'NDLS', 'ASR'],
  ['12951', 'Rajdhani', 'MMCT', 'NDLS'],
  ['12002', 'Shatabdi', 'NDLS', 'RKMP'],
  ['12259', 'Duronto', null, null],
];
const cache = {};
for (const [no, nameHint, src, dst] of KNOWN) {
  try {
    const d = await get(`${RR}/trains/${no}`);
    cache[no] = d;
    const t = d?.data?.train;
    const nameOk = t && new RegExp(nameHint, 'i').test(t.name);
    const srcOk = !src || t.source?.code === src;
    const dstOk = !dst || t.destination?.code === dst;
    chk(`${no} = ${nameHint}`, !!(nameOk && srcOk && dstOk),
      t ? `${t.name} (${t.source?.code}->${t.destination?.code})` : 'no data');
  } catch (e) { chk(`${no} = ${nameHint}`, false, e.message); }
}

console.log('\n=== 2. responses actually DIFFER per train (no cached fixture) ===');
{
  const names = Object.values(cache).map((d) => d?.data?.train?.name).filter(Boolean);
  chk('train names all distinct', new Set(names).size === names.length, names.join(' | ').slice(0, 90));
  const routes = Object.values(cache).map((d) => (d?.data?.route || []).length);
  chk('route lengths differ', new Set(routes).size > 1, routes.join(', '));
}

console.log('\n=== 3. eRail TRAINROUTE is correctly REJECTED ===');
{
  const a = await getText('https://erail.in/data.aspx?Action=TRAINROUTE&Password=2012&Data1=12013&Data2=0&Cache=true');
  const wrong = /Karjat|Neral|Bhivpuri/i.test(a);
  chk('eRail TRAINROUTE confirmed unreliable (not used)', wrong,
    wrong ? 'returns Mumbai locals for 12013 — correctly excluded' : 'unexpectedly looks right');
}

console.log('\n=== 4. schedule integrity ===');
{
  const d = cache['12013'];
  const t = d.data.train, r = d.data.route;
  chk('has >=2 stations', r.length >= 2, `${r.length}`);
  chk('sequence is strictly increasing',
    r.every((x, i) => i === 0 || x.sequence > r[i - 1].sequence));
  chk('distance is non-decreasing',
    r.every((x, i) => i === 0 || x.distance >= r[i - 1].distance));
  const code = (x) => x.station?.code ?? x.stationCode;
  chk('first station == source', code(r[0]) === t.source.code, `${code(r[0])}`);
  chk('last station == destination', code(r.at(-1)) === t.destination.code, `${code(r.at(-1))}`);
  chk('total distance matches route end', Math.abs(r.at(-1).distance - t.distance) < 5,
    `${r.at(-1).distance} vs ${t.distance}`);
  chk('runDays has 7 entries', (t.runDays || []).length === 7, JSON.stringify(t.runDays));
  chk('coach position present', !!t.coachPosition, String(t.coachPosition).slice(0, 40));
  chk('halts <= total stations', t.totalHalts <= r.length, `${t.totalHalts}/${r.length}`);
}

console.log('\n=== 5. live endpoint ===');
{
  const d = await get(`${RR}/trains/12013/live`);
  const L = d?.data;
  chk('live responds', !!L && d.success);
  chk('has trainNumber', L?.trainNumber === '12013', L?.trainNumber);
  chk('has status', !!L?.status, L?.status);
  chk('has lastUpdatedAt', !!L?.lastUpdatedAt, L?.lastUpdatedAt);
  chk('route rows present', (L?.route || []).length > 10, `${L?.route?.length}`);
  chk('per-station status values valid',
    (L?.route || []).every((r) => ['at-station', 'upcoming', 'departed', 'crossed', 'arrived', 'skipped'].includes(r.status)),
    [...new Set((L?.route || []).map((r) => r.status))].join(','));
  chk('timestamp is recent (< 2h)',
    Math.abs(Date.now() - new Date(L.lastUpdatedAt).getTime()) < 7200e3,
    L.lastUpdatedAt);
}

console.log('\n=== 6. live data differs across trains ===');
{
  const a = await get(`${RR}/trains/12013/live`);
  const b = await get(`${RR}/trains/12951/live`);
  chk('different train numbers',
    a.data.trainNumber !== b.data.trainNumber, `${a.data.trainNumber} vs ${b.data.trainNumber}`);
  chk('different route lengths or names',
    a.data.route.length !== b.data.route.length || a.data.trainName !== b.data.trainName,
    `${a.data.route.length} vs ${b.data.route.length}`);
}

console.log('\n=== 7. trains-between-stations (eRail) ===');
for (const [f, t, min] of [['NDLS', 'ASR', 10], ['NDLS', 'BCT', 10], ['HWH', 'NDLS', 5]]) {
  const txt = await getText(
    `https://erail.in/rail/getTrains.aspx?Station_From=${f}&Station_To=${t}&DataSource=0&Language=0&Cache=true`);
  const rows = txt.split('^').slice(1).filter(Boolean)
    .map((r) => r.split('~').filter((x) => x !== '')).filter((x) => x.length >= 14);
  chk(`${f}->${t} lists trains`, rows.length >= min, `${rows.length} trains, first ${rows[0]?.[0]} ${rows[0]?.[1]}`);
  chk(`${f}->${t} numbers look valid`, rows.every((r) => /^\d{5}$/.test(r[0])),
    rows.slice(0, 3).map((r) => r[0]).join(','));
}

console.log('\n=== 8. cross-source agreement ===');
{
  const txt = await getText(
    'https://erail.in/rail/getTrains.aspx?Station_From=NDLS&Station_To=ASR&DataSource=0&Language=0&Cache=true');
  const rows = txt.split('^').slice(1).filter(Boolean)
    .map((r) => r.split('~').filter((x) => x !== ''));
  const first = rows.find((r) => r.length >= 14);
  const d = await get(`${RR}/trains/${first[0]}`);
  chk(`eRail train ${first[0]} exists in RailRadar`, d?.success === true,
    `${first[1].trim()} vs ${d?.data?.train?.name}`);
  chk('both agree it starts at NDLS', d?.data?.train?.source?.code === 'NDLS',
    d?.data?.train?.source?.code);
}

console.log('\n=== 9. error handling ===');
for (const [no, why] of [['99999', 'nonexistent train'], ['abc', 'non-numeric']]) {
  try {
    const d = await get(`${RR}/trains/${no}`);
    chk(`rejects ${why}`, d?.success === false, JSON.stringify(d?.error || {}).slice(0, 60));
  } catch { chk(`rejects ${why}`, true, 'threw'); }
}

console.log('\n=== 10. CORS from a browser origin ===');
for (const u of [`${RR}/trains/12013`, `${RR}/trains/12013/live`,
  'https://erail.in/rail/getTrains.aspx?Station_From=NDLS&Station_To=ASR&DataSource=0&Language=0&Cache=true']) {
  const r = await fetch(u, { headers: { Origin: 'https://jackbhai.github.io', 'User-Agent': 'OmniTools/1.0' } });
  const acao = r.headers.get('access-control-allow-origin');
  chk(`CORS ok: ${u.replace(/https:\/\//, '').slice(0, 42)}`, !!acao, acao || 'none');
}

console.log(`\n${'='.repeat(62)}\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
