/**
 * verify_trip.mjs — gates for the get-off-alert engine, the turn-by-turn model
 * and the map layer.
 *
 * Nothing here is a per-route opinion: the checks run over a deterministic
 * sample of whatever the shipped data actually contains, so a re-scrape cannot
 * quietly break the trip model.  Run with the JSON loader, like the other cores:
 *
 *   node --experimental-loader ./scripts/_json_loader.mjs scripts/verify_trip.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROUTES, STOPS, nameOf, nextAtStop, haversine, minutesOfDay, planBus } from '../src/core/bus-route.js';
import { STATIONS, stationAt, planRoutes, lineRecords } from '../src/core/metro-route.js';
import {
  trackOfBus, trackOfRoute, trackOfMetro, trackOfLine, trackOfCombo, stepsOf, judge,
  metresBetween, bearing, compass, walkMins, lineDirection,
  ARRIVE_M, NEAR_M, MISSED_M, ACCURACY_MAX,
} from '../src/core/trip.js';
import { armTrip, getTripState, gateCheck, resumeTrip, subscribe, tick } from '../src/core/trip-state.js';
import { clockOf, departures, latestFor, dateFor, fmt as cfmt, walkMin, METRO_KMPM, ACCESS_MIN, CHANGE_MIN } from '../src/core/journey-clock.js';

let pass = 0, fail = 0;
const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('=== 1. geometry, the units every alert is measured in ===');
{
  const a = STOPS[0], b = STOPS[1];
  const mine = metresBetween(a, b), theirs = haversine(a, b) * 1000;
  chk('metresBetween agrees with the core haversine', Math.abs(mine - theirs) < Math.max(3, theirs * 0.02),
    `${mine} m vs ${theirs.toFixed(0)} m`);
  chk('a missing coordinate answers null, never 0', metresBetween(a, null) === null && metresBetween({ lat: NaN, lon: 0 }, b) === null);
  const north = { lat: 28.6, lon: 77.2 }, due = { lat: 28.7, lon: 77.2 };
  chk('due north reads 0°', Math.abs(bearing(north, due)) < 0.5, `${bearing(north, due).toFixed(2)}°`);
  chk('due east reads 90°', Math.abs(bearing(north, { lat: 28.6, lon: 77.3 }) - 90) < 1);
  chk('due south reads 180°', Math.abs(bearing(north, { lat: 28.5, lon: 77.2 }) - 180) < 1);
  chk('compass labels come straight from the bearing',
    compass(0) === 'N' && compass(90) === 'E' && compass(180) === 'S' && compass(270) === 'W'
    && compass(45) === 'NE' && compass(355) === 'N' && compass(340) === 'NNW',
    [0, 45, 90, 180, 270, 340, 355].map((d) => `${d}°=${compass(d)}`).join(' '));
  chk('walkMins never returns 0 for a real distance', walkMins(50) === 1 && walkMins(800) >= 8 && walkMins(800) <= 12,
    `800 m → ${walkMins(800)} min`);
  chk('thresholds are ordered', ARRIVE_M < NEAR_M && NEAR_M < MISSED_M && ACCURACY_MAX > ARRIVE_M,
    `${ARRIVE_M}/${NEAR_M}/${MISSED_M}/${ACCURACY_MAX}`);
}

console.log('\n=== 2. a bus journey becomes a track of real, ordered stops ===');
/* Every 55th published direction with a timetable and at least a dozen stops,
   plus a deliberate set of the handful whose page carried no polyline — the
   fallback path has to be exercised, not just the majority one. */
const shaped = [], shapeless = [];
ROUTES.forEach((r, i) => {
  if (!r.tt?.d?.length || r.s.length < 12) return;
  if (i % 55 === 0 && shaped.length < 30) shaped.push(r);
  // sm:0 is the builder's own mark for "this page published no polyline, so the
  // metres along the route are a straight-line estimate" — that is the path to test
  if (r.sm === 0 && shapeless.length < 10) shapeless.push(r);
});
const sample = [...shaped, ...shapeless];
let seen = 0, bad = [], shapedSeen = 0, fallbackSeen = 0;
for (const r of sample) {
  const from = nameOf(r.s[0]), to = nameOf(r.s[Math.min(r.s.length - 1, 12)]);
  let opt;
  try { opt = planBus(from, to)[0]; } catch { continue; }
  if (!opt) continue;
  const tr = trackOfBus(opt, { boardMin: 600 });
  seen++;
  if (r.sm === 0) fallbackSeen++; else shapedSeen++;
  if (tr.points.length < 2) bad.push('too few points');
  if (!tr.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) bad.push('non-finite coordinate');
  if (!tr.points[0].isBoard || !tr.points.at(-1).isAlight) bad.push('board/alight flags');
  if (tr.points.some((p) => !p.name || p.name === 'undefined')) bad.push('unnamed point');
  if (tr.points.some((p, i) => i && p.whenMin != null && tr.points[i - 1].whenMin != null && p.whenMin < tr.points[i - 1].whenMin))
    bad.push('arrival minutes went backwards');
  const total = opt.legs.reduce((s, l) => s + Math.abs(l.i1 - l.i0) + 1, 0);
  if (tr.points.length !== total) bad.push(`point count ${tr.points.length} ≠ stops on legs ${total}`);
}
chk('sampled bus journeys all became valid tracks', seen >= 30 && !bad.length,
    `${seen} journeys, ${bad.length ? [...new Set(bad)].join('; ') : 'no defects'}`);
chk('both the measured and the estimated length paths produce tracks', shapedSeen >= 20 && fallbackSeen >= 5,
    `${shapedSeen} along a polyline, ${fallbackSeen} straight-line`);
chk('a shape-less direction says so in its own words', (() => {
  const r = shapeless[0];
  const o = planBus(nameOf(r.s[0]), nameOf(r.s[Math.min(11, r.s.length - 1)]))[0];
  if (!o) return false;
  const mine = /straight-line/.test(trackOfRoute(r, { boardMin: 600 }).timing);
  return mine && (o.exact === false || /straight/.test(o.src || '') || o.shape === true);
})());
{
  const tr = trackOfBus(planBus(nameOf(sample[0].s[0]), nameOf(sample[0].s[10]))[0], { boardMin: null });
  chk('no departure time still gives a map-able track', tr.points.length > 2 && tr.points.every((p) => p.whenMin === null));
  chk('the timing label admits what it is', /published|straight|no departure/.test(tr.timing), tr.timing);
  const steps = stepsOf(tr);
  chk('steps start at a board and end at an alight', steps[0].kind === 'board' && steps.at(-1).kind === 'alight',
    steps.map((s) => s.kind).join(','));
  chk('no step prints undefined', !JSON.stringify(steps).includes('undefined'));
}

console.log('\n=== 3. the right-now route view watches a whole direction ===');
{
  const r = ROUTES.find((x) => x.s.length > 40 && x.m && x.tt?.d?.length);
  const tr = trackOfRoute(r, { boardMin: 570 });
  chk('full direction produces every stop', tr.points.length === r.s.length, `${tr.points.length}/${r.s.length}`);
  const cut = trackOfRoute(r, { boardMin: 570, upTo: 9 });
  chk('upTo cuts the ride and marks the new end', cut.points.length === 10 && cut.points.at(-1).isAlight,
    `${cut.points.length} points, ends at ${cut.points.at(-1).name}`);
  chk('cut keeps the earlier stops identical', cut.points.every((p, i) => p.name === tr.points[i].name));
}

console.log('\n=== 4. metro journeys, including transfers and the Noida walk ===');
{
  const pairs = [];
  for (let i = 0; i < STATIONS.length && pairs.length < 24; i += 9) {
    const a = STATIONS[i].n, b = STATIONS[(i + 37) % STATIONS.length].n;
    if (a !== b) pairs.push([a, b]);
  }
  pairs.push(['Noida Sector 51', 'Rajiv Chowk'], ['Rithala', 'Shaheed Sthal (New Bus Adda)'], ['IGI Airport T3', 'New Delhi']);
  let n = 0, bad = [];
  for (const [a, b] of pairs) {
    let o;
    try { o = planRoutes(a, b, { k: 2 })[0]; } catch { continue; }
    if (!o) continue;
    n++;
    const tr = trackOfMetro(o, { boardMin: 570 });
    if (tr.points.length < 2) bad.push(`${a}>${b}: ${tr.points.length} points`);
    if (!tr.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) bad.push(`${a}>${b}: bad coord`);
    if (tr.points.some((p) => { const s = stationAt(p.name); return !s || Math.abs(s.lat - p.lat) > 1e-6; }))
      bad.push(`${a}>${b}: coordinate not the station record`);
    if (o.legs.length > 1 && !tr.points.some((p) => p.kind === 'walk') && !tr.points.some((p) => p.leg > 0))
      bad.push(`${a}>${b}: a change produced one flat ride`);
    const steps = stepsOf(tr);
    if (JSON.stringify(steps).includes('undefined')) bad.push(`${a}>${b}: undefined in steps`);
    if (steps.at(-1).text.includes(o.to) === false) bad.push(`${a}>${b}: last step is not the destination`);
  }
  chk('sampled metro journeys became valid tracks', n >= 18 && !bad.length, `${n} journeys${bad.length ? '; ' + bad.slice(0, 3).join(' | ') : ''}`);
  const line = trackOfLine('Yellow Line');
  const uniq = new Set(lineRecords('Yellow Line').flatMap((L) => L.s));
  chk('a line map carries every station of that line once', line.points.length === uniq.size,
    `${line.points.length} vs ${uniq.size}`);
  const upto = trackOfLine('Yellow Line', { upToName: 'Hauz Khas' });
  chk('cutting a line at a station shortens it and ends there',
    upto.points.length < line.points.length && upto.points.at(-1).name === 'Hauz Khas' && upto.points.at(-1).isAlight,
    `${upto.points.length} points → ${upto.to}`);
  chk('direction comes from the line order', (() => {
    const d = lineDirection('Yellow Line', 'Rajiv Chowk', 'Hauz Khas');
    const L = lineRecords('Yellow Line')[0];
    return d === L.s.at(-1) || d === L.s[0];
  })(), String(lineDirection('Yellow Line', 'Rajiv Chowk', 'Hauz Khas')));
  chk('an unplaceable pair answers null, not a guess', lineDirection('Yellow Line', 'Rajiv Chowk', 'Not A Station') === null);
}

console.log('\n=== 5. combined metro + bus legs stay one track ===');
{
  const busFrom = STOPS.find((s) => /ISBT/i.test(s.n));
  const bopt = planBus(busFrom.n, nameOf(ROUTES[0].s[6]))[0];
  const mopt = planRoutes('Rajiv Chowk', 'Hauz Khas')[0];
  if (!bopt || !mopt) { chk('a combined option could be built from the shipped data', false, 'missing fixture'); }
  else {
    const combo = {
      from: busFrom.n, to: 'Hauz Khas', minutes: 34, km: 12.4,
      legs: [
        { kind: 'walk', text: 'Walk to the terminal', km: 0.2, from: busFrom.n, to: mopt.legs[0].from },
        { kind: 'metro', line: mopt.legs[0].line, colour: mopt.legs[0].colour,
          from: mopt.legs[0].from, to: mopt.legs[0].to, stops: mopt.legs[0].stops, count: mopt.legs[0].count },
        { kind: 'bus', ref: bopt.legs[0].ref, from: bopt.legs[0].from, to: bopt.legs[0].to,
          count: bopt.legs[0].stops, km: bopt.legs[0].km, bus: bopt },
      ],
    };
    const tr = trackOfCombo(combo);
    chk('a combo leg list becomes one ordered track', tr.points.length > 4 && tr.mode === 'combo', `${tr.points.length} points`);
    chk('the last point of a combo is the alight point', tr.points.at(-1).isAlight === true, tr.points.at(-1).name);
    chk('every combo point has a coordinate', tr.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));
    chk('combo keeps the bus stop indices the alert needs',
      tr.points.some((p) => p.kind === 'ride' && p.ref), 'ref carried on ride points');
    const steps = stepsOf(tr);
    chk('combo steps read as English, not keys', steps.every((s) => typeof s.text === 'string' && s.text.length > 6)
      && !JSON.stringify(steps).includes('undefined'), steps[1]?.text);
    // A leg that names only its two ends is the shape the combined planner used to
    // hand over; the track must still cover every station in between.
    const bare = trackOfCombo({ from: 'Rajiv Chowk', to: 'Hauz Khas', minutes: 22, km: 8, legs: [
      { kind: 'metro', line: 'Yellow Line', from: 'Rajiv Chowk', to: 'Hauz Khas', count: 5, km: 7.4 }] });
    chk('a metro leg naming only its ends still yields every station between them',
      bare.points.length >= 5 && bare.points[0].name === 'Rajiv Chowk'
      && bare.points.at(-1).name === 'Hauz Khas' && bare.points.filter((p) => p.isAlight).length === 1,
      `${bare.points.length} points · ${bare.points.map((p) => p.name).slice(0, 3).join(' , ')}`);
    chk('the combined planner hands the stations over, not just the ends',
      /stops:\s*l\.stops/.test(src('src/tools/multimodal.jsx')));
  }
}

console.log('\n=== 6. judge(): what the bar and the notification will say ===');
{
  const r = ROUTES.find((x) => x.m && x.tt?.d?.length && x.s.length > 24);
  const tr = trackOfRoute(r, { boardMin: 570, upTo: 14 });
  const at0 = tr.points[0];
  const a = judge(tr, at0, 570, new Set());
  chk('standing at the boarding stop says board', a.state === 'at-board' && /Board/.test(a.alert.title), a.alert?.title);
  chk('the same tick twice does not repeat an alert', judge(tr, at0, 570, a.fired).alert === null);
  const far = { lat: at0.lat + 0.02, lon: at0.lon };
  const b = judge(tr, far, 570, new Set());
  chk('2 km away is still "head to your stop", never "board"', b.state === 'to-stop' && b.distanceM > 1500,
    `${b.state} · ${b.distanceM} m ${b.bearingTo || ''}`);
  const c = judge(tr, tr.points[tr.points.length - 1], 640, new Set());
  chk('at the alight stop it says this is your stop', /This is your stop/.test(c.alert?.title || ''), c.alert?.title);
  const walk = [];
  let fired = new Set();
  for (const p of tr.points) { const j = judge(tr, p, null, fired); if (j.alert) walk.push(j.alert.title); }
  chk('riding the whole route announces the countdown', walk.length >= 3 && walk[0].startsWith('Board')
    && /This is your stop/.test(walk.at(-1)), `${walk.length} alerts: ${walk[1] || ''}`);
  const g = judge(tr, { lat: tr.points[3].lat, lon: tr.points[3].lon, accuracy: 900 }, null, new Set());
  chk('a 900 m-accurate fix is refused, and with no clock it says so',
    g.state === 'no-signal' && !g.alert, `${g.state}: ${g.hint || ''}`);
  const g2 = judge(tr, { lat: tr.points[3].lat, lon: tr.points[3].lon, accuracy: 900 }, 572, new Set());
  chk('a bad fix plus a published departure falls back to the clock',
    g2.clockBased === true && g2.trusting === false && g2.state !== 'no-signal', g2.state);
  const clock = judge(tr, null, 572, new Set());
  chk('with no fix the clock takes over and admits it', clock.clockBased === true && clock.state !== 'no-signal',
    `${clock.state} · ${clock.timing}`);
  chk('no fix and no published minute refuses to guess', judge(tr, null, null, new Set()).state === 'no-signal');
  // the bug this guards: a direction whose stops sit 0-60 m apart used to "advance"
  // to the next stop while you were still standing at the first one, which then
  // read as arrived-and-finished
  {
    const dense = ROUTES.filter((r) => r.m && r.s.length > 6)
      .map((r) => ({ r, gaps: r.m.slice(1).map((m, i) => m - r.m[i]) }))
      .filter((x) => Math.min(...x.gaps) < 60)
      .sort((a, b) => Math.min(...a.gaps) - Math.min(...b.gaps))[0];
    if (!dense) chk('a dense-stop route exists to test', false);
    else {
      const rec = ROUTES[ROUTES.indexOf(dense.r)];
      const dt = trackOfRoute(rec, { boardMin: 600 });
      const d0 = judge(dt, { lat: dt.points[0].lat, lon: dt.points[0].lon, accuracy: 0 }, 600, new Set());
      chk('stops 60 m apart do not fake an advance', d0.reached === 0 && d0.state === 'at-board',
        `${rec.r}: min gap ${Math.round(Math.min(...dense.gaps))} m → ${d0.state} at ${d0.reached}`);
      const mid = judge(dt, { lat: dt.points[3].lat, lon: dt.points[3].lon, accuracy: 5 }, 600, new Set());
      chk('a fix at the 4th stop reads as the 4th stop', mid.reached === 3 || mid.state === 'riding',
        `reached ${mid.reached}`);
    }
  }
  chk('an empty track answers "empty" instead of crashing', judge({ points: [], legs: [] }, null, null, new Set()).state === 'empty');
  const done = judge(tr, tr.points.at(-1), 700, new Set());
  chk('a finished trip reports done', ['done', 'alight'].includes(done.state), done.state);
}

console.log('\n=== 7. the store keeps its promises without a browser ===');
{
  chk('arming outside a browser is refused, with a reason', armTrip({ points: [{ lat: 1, lon: 1 }] }).ok === false,
    armTrip({ points: [{ lat: 1, lon: 1 }] }).why);
  chk('no trip is armed in a headless import', getTripState().armed === false);
  chk('resume with nothing stored says so', resumeTrip() === false);
  chk('tick() without a trip is a no-op', (() => { try { tick(); return true; } catch { return false; } })());
  chk('gateCheck with no fix tells the caller it is clock-only', gateCheck({ points: [{ name: 'x', lat: 28.6, lon: 77.2 }] }, null).clockOnly === true);
  chk('an unsubscribe is idempotent', (() => { const off = subscribe(() => {}); off(); off(); return true; })());
}

console.log('\n=== 8. the journey clock: wall times, from published data only ===');
{
  const pad = (n) => String(n).padStart(2, '0');
  chk('the clock prints 24-hour IST', cfmt(0) === '00:00' && cfmt(750) === '12:30' && cfmt(1439) === '23:59',
    `${cfmt(750)} · ${cfmt(1439)}`);
  chk('a minute of day survives the trip into a Date and back',
    minutesOfDay(dateFor(750)) === 12 * 60 + 30 && minutesOfDay(dateFor(0)) === 0,
    `${minutesOfDay(dateFor(750))}`);

  /* ---- the metro side has to agree with the metro planner's own number ---- */
  // The third pair changes lines twice, so it also proves what a change costs.
  const pairs = [['Rajiv Chowk', 'Hauz Khas'], ['Kashmere Gate', 'AIIMS'], ['Samaypur Badli', 'Huda City Centre'],
    ['AIIMS', 'Noida Sector 52']];
  let worst = 0, checked = 0;
  for (const [a, b] of pairs) {
    let r = null;
    try { r = planRoutes(a, b, { k: 1, atMin: 8 * 60 + 15 })[0]; } catch { /* pair not in data */ }
    if (!r) continue;
    const opt = { mode: 'Metro', minutes: r.minutes, km: r.km, fare: r.fare, changes: r.changes, detail: r,
      legs: r.legs.map((l) => (l.walk
        ? { kind: 'walk', text: `Walk ${l.from} to ${l.to}`, km: l.km, min: walkMin(l.km) }
        : { kind: 'metro', line: l.line, colour: l.colour, from: l.from, to: l.to, stops: l.stops,
          count: l.count, km: l.km })) };
    const c = clockOf(opt, 8 * 60 + 15);
    checked++;
    worst = Math.max(worst, Math.abs(c.noWaitMin - r.minutes));
    chk(`the ${a} → ${b} bar adds up to the headline plus the waiting it excludes`,
      c.agrees === true && c.noWaitMin + (c.allowanceMin || 0) === c.publishedMinutes,
      `rides+walk ${c.noWaitMin} + allowance ${c.allowanceMin} = ${c.publishedMinutes}; with waits ${c.minutes}`);
    const rides = c.legs.filter((l) => l.kind === 'ride');
    if (rides.length > 1) {
      const allow = c.legs.find((l) => l.kind === 'allowance');
      chk(`and the ${a} → ${b} change is drawn as allowance, never a second wait`,
        allow != null && allow.mins >= CHANGE_MIN && !c.legs.some((l) => l.kind === 'wait' && /Change to/.test(l.label)),
        allow ? `allowance ${allow.mins}m for ${rides.length - 1} change${rides.length - 1 === 1 ? '' : 's'}` : 'no allowance segment');
    }
    if (r.minutesWithWait != null) {
      chk(`and the same total the metro tool prints for ${a} → ${b} (${r.minutesWithWait} min with the wait)`,
        c.minutes === r.minutesWithWait, `${c.minutes} min · waits ${c.waitMin}m`);
    }
    chk('its waits are headway and platform time, not a guess',
      c.legs.filter((l) => l.kind === 'wait').every((l) => /headway|platform|opens|min at this hour/.test(l.why || '')),
      c.legs.filter((l) => l.kind === 'wait').map((l) => l.why).join(' | ').slice(0, 70));
    chk('the clock is monotone and ends where the journey ends',
      c.legs.every((l, i) => i === 0 || l.from >= c.legs[i - 1].to) && c.legs.at(-1)?.to === c.arriveMin,
      `${c.legs.length} legs · arrive ${cfmt(c.arriveMin)}`);
  }
  chk('every metro pair was checked', checked >= 2, `${checked} pairs · worst drift ${worst} min`);

  /* ---- a closed line waits for its published first train, it does not start ---- */
  {
    let r = null;
    try { r = planRoutes('Rajiv Chowk', 'Hauz Khas', { k: 1, atMin: 60 })[0]; } catch {}
    const opt = { mode: 'Metro', minutes: r?.minutes ?? 0, detail: r, legs: (r?.legs || []).map((l) => ({
      kind: 'metro', line: l.line, colour: l.colour, from: l.from, to: l.to, stops: l.stops, count: l.count, km: l.km })) };
    const c = clockOf(opt, 60);
    const closed = c.risk.find((x) => x.kind === 'closed');
    chk('at 01:00 it says the line is closed instead of inventing a train', !!closed, closed?.text?.slice(0, 70));
    const info = (await import('../src/core/metro-route.js')).lineInfo('Yellow Line', 60);
    chk('and the ride is placed at the line’s published first minute',
      !info || c.boardMin === info.first, `board ${cfmt(c.boardMin)} · first train ${pad(Math.floor(info.first / 60))}:${pad(info.first % 60)}`);
  }

  /* ---- the bus side may only ever use a printed departure ---- */
  {
    let o = null;
    try { o = planBus('Savda JJ Colony', 'Ghevra Village')[0]; } catch {}
    if (!o) chk('a bus pair could be clocked', false, 'fixture pair missing');
    else {
      const opt = { mode: 'Bus', minutes: o.minutes, km: o.km, fare: o.fare, changes: o.changes, detail: o,
        legs: o.legs.map((l, i) => ({ kind: 'bus', ref: l.ref, from: l.from, to: l.to, count: l.stops,
          km: l.km, bus: o, busIndex: i })) };
      const ask = 8 * 60 + 3;
      const c = clockOf(opt, ask);
      const w = c.legs.find((l) => l.kind === 'wait');
      const bl = o.legs[0];
      const real = nextAtStop(ROUTES[bl.ri], bl.i0, dateFor(ask), 1)[0];
      chk('the wait at a bus stop is exactly the published departure',
        real ? (w && w.mins === real.at - ask && w.to === real.at) : !w,
        real ? `asked ${cfmt(ask)} · bus at ${cfmt(real.at)} · wait ${w?.mins}m` : 'no departure that late');
      chk('the ride minutes are the direction’s own', c.legs.some((l) => l.mins === bl.minutes),
        `ride ${c.legs.find((l) => l.kind === 'ride')?.mins}m vs ${bl.minutes}m`);
      chk('and a bus-only bar is the published ride plus that printed wait',
        c.legs.reduce((s, l) => s + (l.mins || 0), 0) === o.minutes + c.waitMin,
        `Σ ${c.legs.reduce((s, l) => s + (l.mins || 0), 0)} = ${o.minutes} + ${c.waitMin}m waited`);
      chk('so the alert can be armed against that minute', c.boardMin === (real ? real.at : ask),
        cfmt(c.boardMin));
      // a departure grid must never wrap into tomorrow's timetable
      const g = departures(opt, 1400, 6, 15);
      chk('the departure grid stops at midnight', g.length > 0 && g.every((x) => x.departMin <= 1439),
        g.map((x) => cfmt(x.departMin)).join(' '));
    }
  }

  /* ---- arriving by a time is solved backwards or refused ---- */
  {
    let r = null;
    try { r = planRoutes('Rajiv Chowk', 'Hauz Khas', { k: 1, atMin: 9 * 60 })[0]; } catch {}
    const opt = { mode: 'Metro', minutes: r?.minutes ?? 0, detail: r, legs: (r?.legs || []).map((l) => ({
      kind: 'metro', line: l.line, colour: l.colour, from: l.from, to: l.to, stops: l.stops, count: l.count, km: l.km })) };
    const target = 9 * 60 + 40;
    const s = latestFor(opt, target);
    chk('an arrive-by request finds a departure that makes it', !!s && s.arriveMin <= target,
      s ? `leave ${cfmt(s.departMin)} arrive ${cfmt(s.arriveMin)} slack ${s.slack}m` : 'nothing found');
    chk('and it really does: the clock for that minute agrees', s ? clockOf(opt, s.departMin).arriveMin <= target : true);
    chk('a request that cannot be met is refused, not rounded down',
      latestFor(opt, 5) === null || latestFor(opt, 5).arriveMin <= 5, '00:05 target');
  }

  /* ---- a combo carries every leg’s wait ---- */
  {
    const bus = (() => { try { return planBus(nameOf(ROUTES[0].s[0]), nameOf(ROUTES[0].s[6]))[0]; } catch { return null; } })();
    const met = (() => { try { return planRoutes('Rajiv Chowk', 'Hauz Khas', { k: 1, atMin: 8 * 60 + 30 })[0]; } catch { return null; } })();
    if (bus && met) {
      const opt = { mode: 'Bus + Metro', minutes: bus.minutes + met.minutes, detail: met, legs: [
        { kind: 'walk', text: `Walk to ${bus.legs[0].from}`, km: 0.4, min: 5 },
        { kind: 'bus', ref: bus.legs[0].ref, from: bus.legs[0].from, to: bus.legs[0].to,
          count: bus.legs[0].stops, km: bus.legs[0].km, bus, busIndex: 0 },
        { kind: 'metro', line: met.legs[0].line, colour: met.legs[0].colour, from: 'Rajiv Chowk',
          to: 'Hauz Khas', stops: met.legs[0].stops, count: met.legs[0].count, km: met.legs[0].km },
      ] };
      const c = clockOf(opt, 8 * 60 + 30);
      const metroIdx = c.legs.findIndex((l) => l.kind === 'ride' && l.mode === 'metro');
      chk('a metro leg after a bus leg is preceded by a wait, never a free transfer',
        metroIdx > 0 && c.legs[metroIdx - 1]?.kind === 'wait', c.legs.map((l) => `${l.kind}:${l.mins}`).join(' '));
      chk('and the whole thing lands after every leg started', c.arriveMin > c.departMin && c.minutes > 0,
        `${cfmt(c.departMin)} → ${cfmt(c.arriveMin)} · ${c.minutes}m`);
      chk('the combined planner hands that minute to the alert',
        /boardMin: clk\?\.boardMin/.test(src('src/tools/multimodal.jsx'))
        && /trackOfCombo\(o, \{ boardMin: clk\?\.boardMin/.test(src('src/tools/multimodal.jsx')));
      chk('the clock is on screen for every option, not just the selected one',
        /clock\(clockOf\(x, runMin\)\.arriveMin\)/.test(src('src/tools/multimodal.jsx')));
    } else chk('a combo clock could be built from the shipped data', false, 'fixture missing');
  }
}

console.log('\n=== 9. the map stays behind its button ===');
{
  const files = ['src/tools/trip-ui.jsx', 'src/tools/trip-map.jsx', 'src/core/trip-state.js',
                 'src/core/trip.js', 'src/core/alerts.js', 'src/tools/transit-live.jsx',
                 'src/tools/bus-planner.jsx', 'src/tools/metro-planner.jsx', 'src/tools/multimodal.jsx'];
  const all = files.map((f) => src(f)).join('\n');
  chk('leaflet is never imported statically', !/^\s*import .*['"]leaflet/m.test(all));
  chk('leaflet is loaded by dynamic import in the map component',
    /import\(['"]leaflet['"]\)/.test(src('src/tools/trip-map.jsx'))
    && /import\(['"]leaflet\/dist\/leaflet\.css['"]\)/.test(src('src/tools/trip-map.jsx')));
  chk('the map is closed until pressed',
    /const \[map, setMap\] = useState\(false\)/.test(src('src/tools/trip-ui.jsx'))
    && /const \[own, setOwn\] = useState\(false\)/.test(src('src/tools/trip-ui.jsx')));
  chk('the map component is lazy, so its chunk is on demand',
    /lazy\(\(\) => import\(['"]\.\/trip-map\.jsx['"]\)\)/.test(src('src/tools/trip-ui.jsx')));
  {
    const m = src('src/tools/trip-map.jsx');
    const hosts = [...new Set([...m.matchAll(/url: 'https:\/\/(?:\{s\}\.)?([^/']+)/g)].map((x) => x[1]))];
    chk('three or more tile operators, so no single one can take the map away',
      hosts.length >= 3, hosts.join(' · '));
  }
  chk('an offline fallback exists and uses no network', /export function Sketch/.test(src('src/tools/trip-map.jsx'))
    && /onLine === false/.test(src('src/tools/trip-map.jsx')));
  chk('attribution is kept for the tile data', /attribution: p\.attr/.test(src('src/tools/trip-map.jsx'))
    && /© OpenStreetMap contributors/.test(src('src/tools/trip-map.jsx')));
  {
    const m = src('src/tools/trip-map.jsx');
    const prov = m.slice(m.indexOf('export const PROVIDERS'), m.indexOf('];', m.indexOf('export const PROVIDERS')));
    const urls = [...prov.matchAll(/url: '([^']+)'/g)].map((x) => x[1]);
    const attrs = [...prov.matchAll(/attr: '([^']+)'/g)].map((x) => x[1]);
    chk('every tile source is a public key-free https endpoint',
      urls.length >= 3 && urls.every((u) => /^https:\/\//.test(u) && !/[?&](api_)?key=/.test(u)),
      `${urls.length} sources`);
    chk('no tile source is the CDN that watermarks keyless apps', !/cartocdn/.test(m));
    chk('each source is attributed in the map', attrs.length === urls.length
      && attrs.every((a) => /©/.test(a)), attrs.join(' | ').slice(0, 60));
    chk('the sources are different organisations',
      new Set(urls.map((u) => u.replace(/^https:\/\/(?:\{s\}\.)?/, '').split('/')[0]))
        .size === urls.length, urls.length + ' hosts');
    chk('the bar escapes its card with a portal', /createPortal\(/.test(src('src/tools/trip-ui.jsx'))
      && /typeof document === 'undefined'/.test(src('src/tools/trip-ui.jsx')));
  {
    // React counts hooks per render: a useState or useEffect placed after an
    // early `return null` throws the moment the component starts rendering, and
    // the whole panel — trip bar included — vanishes instead of warning.
    const s = src('src/tools/trip-ui.jsx');
    const offenders = [];
    for (const m of s.matchAll(/function ([A-Z]\w+)\([^)]*\) \{/g)) {
      const nx = s.indexOf('\nexport ', m.index);
      const body = s.slice(m.index, nx > -1 ? nx : s.length);
      const ret = body.indexOf('return null;');
      if (ret > 0 && /\buse[A-Z]\w*\(/.test(body.slice(ret))) offenders.push(m[1]);
    }
    chk('no hook sits below an early return in the trip UI', !offenders.length,
      offenders.length ? `after return in ${offenders.join(', ')}` : 'every hook runs on every render');
  }
  chk('the fine print is folded away but never deleted',
    /const \[why, setWhy\] = useState\(false\)/.test(src('src/tools/trip-ui.jsx'))
    && /\{why && <span className="dim sm">/.test(src('src/tools/trip-ui.jsx'))
    && /how it knows/.test(src('src/tools/trip-ui.jsx')));
  }
  const css = src('src/styles/theme.css');
  const used = ['mapbox', 'mapleaf', 'mapnote', 'mapswap', 'mapsketchwrap', 'sketch', 'steps2', 'stp', 'tripbar', 'tbmeta', 'tbwhy', 'tripctl', 'armwrap', 'mapslot', 'act', 'trow', 'tinp', 'tl', 'tlseg', 'tlkeys', 'tlkey'];
  const missing = used.filter((c) => !new RegExp('\\.' + c + '[\\s{.,:]').test(css));
  chk('every class the new UI uses exists in theme.css', !missing.length, missing.length ? missing.join(', ') : `${used.length} classes`);
  chk('no emoji crept into the new UI', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all));
  chk('the scrape site is not named in any shipped file', !/dtcbusroutes/.test(all));
  chk('notifications are SW-first with a page fallback',
    /showNotification/.test(src('src/core/alerts.js')) && /new Notification/.test(src('src/core/alerts.js'))
    && /return 'none'/.test(src('src/core/alerts.js')));
  {
    const lines = [];
    for (const f of files) {
      src(f).split('\n').forEach((l, i) => {
        if (/(live|real-?time)\s+(bus|vehicle|train|gps)\s*(position|tracking|feed)/i.test(l)) lines.push(`${f}:${i + 1}: ${l.trim()}`);
      });
    }
    const lying = lines.filter((l) => !/\bno\b|\bnot\b|nothing|never|without|cannot|absent|none is/i.test(l));
    chk('every mention of a live feed is a disclaimer, never a claim', !lying.length,
      lying.length ? lying[0] : `${lines.length} disclaimers, 0 claims`);
  }
}

console.log('\n=== 10. what actually ships ===');
{
  const dist = path.join(ROOT, 'dist/assets');
  if (!fs.existsSync(dist)) console.log('  SKIP  dist not built yet — run npx vite build first');
  else {
    const files = fs.readdirSync(dist);
    const shell = files.find((f) => /^index-.*\.js$/.test(f));
    const buf = fs.readFileSync(path.join(dist, shell));
    chk('the start shell does not contain leaflet', !buf.includes('leaflet'), `${shell} ${(buf.length / 1024).toFixed(0)} kB`);
    chk('the start shell does not contain the bus dataset', !buf.includes('route_records'), shell);
    chk('a leaflet chunk exists separately', files.some((f) => /leaflet.*\.js$/.test(f)) && files.some((f) => /leaflet.*\.css$/.test(f)));
    chk('the map component is its own chunk', files.some((f) => /^trip-map-.*\.js$/.test(f)));
    const hub = files.find((f) => /^metro-planner-.*\.js$/.test(f)) || files.find((f) => /bus-route|travel-hubs/.test(f));
    chk('the transit chunk carries the trip engine', fs.readFileSync(path.join(dist, hub)).includes('at-board'), hub);
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
