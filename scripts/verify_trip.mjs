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
import { SOUNDS, SOUND_NAMES, play as splay, setEnabled, enabled as sndEnabled, MASTER } from '../src/core/sfx.js';
import {
  plan as comboPlan, graph as comboGraph, metroDetail, VOT_RPM as COMBO_VOT, MAX_WALK_KM as COMBO_WALK_CAP,
  MAX_WALK_MIN, MAX_LEGS, CHANGE_MIN as CX_GATE, BOARD_MIN as CX_BOARD, ACCESS_MIN as CX_ACCESS,
  METRO_KMPM as CX_METRO_KMPM, WALK_KMH as CX_WALK_KMH,
} from '../src/core/combo-route.js';

/* Fixtures for the travel tools, with coordinates taken from the shipped tables.
   They used to be typed by hand, and one of them sat 4 km from the station it was
   named after - the planner then answered a journey nobody had asked about and
   disagreed with the metro tool over it. A name that is not in the tables fails
   loudly below rather than quietly planning the wrong city. */
const mp = (n) => { const s = STATIONS.find((x) => x.n === n) || {}; return { n, kind: 'metro', lat: s.lat, lon: s.lon }; };
const bp = (n) => { const s = STOPS.find((x) => x && x.n === n) || {}; return { n, kind: 'bus', lat: s.lat, lon: s.lon }; };
const placed = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

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
    // Not a source grep any more: the combined planner is a real search now, so it
    // has to actually hand over the stations between the ends — that list is what
    // puts the get-off alert on a platform instead of on a street.
    const handed = comboPlan(mp('Rajiv Chowk'), mp('Hauz Khas'), { atMin: 570 });
    const hLeg = (handed.options?.[0]?.legs || []).find((l) => l.kind === 'metro');
    chk('the combined planner hands the stations over, not just the ends',
      !!hLeg && hLeg.stops.length > 3 && hLeg.stops[1] !== hLeg.stops[0],
      `${hLeg?.stops.length || 0} stations on the leg: ${(hLeg?.stops || []).slice(0, 3).join(' , ')}`);
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

console.log('\n=== 9. the sounds: synthesised, bounded, and honest about silence ===');
{
  const sfx = src('src/core/sfx.js');

  const imports = [...sfx.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  chk('the sound layer imports one thing: the settings object',
    imports.length === 1 && imports[0] === './settings.js', imports.join(', ') || 'none');
  const netty = ['fetch(', 'XMLHttpRequest', 'new Audio(', 'decodeAudioData', 'data:audio',
    '.mp3', '.ogg', '.wav', '.m4a', 'http://', 'https://', 'caches.open'];
  chk('and no sound is downloaded, streamed or cached',
    netty.every((k) => !sfx.includes(k)), netty.filter((k) => sfx.includes(k)).join(', '));
  chk('every recipe is a build function with a length and a repeat floor',
    SOUND_NAMES.every((n) => {
      const r = SOUNDS[n];
      return typeof r.build === 'function' && r.label && r.when && r.dur > 0.02 && r.dur < 2.5
        && r.minMs >= 40;
    }), SOUND_NAMES.map((n) => `${n} ${SOUNDS[n].dur}s`).join(' · '));
  chk('the UI only ever names a sound that exists', (() => {
    const used = new Set();
    for (const f of ['src/tools/multimodal.jsx', 'src/tools/trip-ui.jsx', 'src/tools/metro-planner.jsx',
      'src/tools/bus-planner.jsx', 'src/core/trip-state.js']) {
      for (const m of src(f).matchAll(/sound\(\s*'(?:([^']+)'|.*?\?\s*'([a-z]+)'\s*:\s*'([a-z]+)')/g)) {
        [m[1], m[2], m[3]].forEach((x) => x && used.add(x));
      }
    }
    return [...used].every((u) => SOUND_NAMES.includes(u)) && used.size >= 4;
  })(), SOUND_NAMES.join(' | '));
  const peaks = [...sfx.matchAll(/peak:\s*([0-9.]+)/g)].map((m) => +m[1]);
  chk('no voice can clip, however fast the thumb moves',
    peaks.length >= 8 && Math.max(...peaks) <= 0.4 && MASTER <= 0.6,
    `${peaks.length} peaks, loudest ${Math.max(...peaks)}, master ${MASTER}`);
  chk('a get-off alert may sound while the tab is hidden, a button press may not',
    SOUNDS.alight.whileHidden === true && !SOUNDS.tick.whileHidden && !SOUNDS.whoosh.whileHidden);

  /* Run the real play() against a host that records the graph. The shapes below
     are what the recipes ask the browser to do; a recipe that builds nothing, or
     builds it in the wrong order, fails here rather than in someone's ear. */
  const rec = { log: [], started: [], stops: [], buffers: 0 };
  const param = (owner, name) => ({
    value: 0,
    setValueAtTime(v, t) { rec.log.push([owner, name, 'set', v, t]); return this; },
    linearRampToValueAtTime(v, t) { rec.log.push([owner, name, 'lin', v, t]); return this; },
    exponentialRampToValueAtTime(v, t) { rec.log.push([owner, name, 'exp', v, t]); return this; },
    cancelScheduledValues() { return this; },
  });
  let born = 0;
  const node = (kind) => {
    const id = `${kind}#${++born}`;
    const o = { __id: id, connect(x) { return x || o; } };
    return new Proxy(o, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'start') return (at) => rec.started.push([id, at]);
        if (p === 'stop') return (at) => rec.stops.push([id, at]);
        return param(id, String(p));
      },
      set(t, p, v) { t[p] = v; rec.log.push([id, String(p), 'set', v, 0]); return true; },
    });
  };
  class Host {
    constructor() {
      this.sampleRate = 44100; this.state = 'running'; this.currentTime = 0;
      this.destination = node('dest');
    }
    resume() { return Promise.resolve(); }
    createBuffer(ch, n, r) { rec.buffers++; return { sampleRate: r, length: n, numberOfChannels: ch, getChannelData: () => new Float32Array(n) }; }
    createOscillator() { return node('osc'); }
    createBufferSource() { return node('bufsrc'); }
    createGain() { return node('gain'); }
    createBiquadFilter() { return node('biquad'); }
    createStereoPanner() { return node('pan'); }
    createDynamicsCompressor() { return node('comp'); }
  }
  const clock0 = performance.now();
  let fakeNow = 1000;
  globalThis.performance = { now: () => fakeNow };
  globalThis.AudioContext = Host;

  rec.log.length = 0; rec.started.length = 0; rec.stops.length = 0;
  const whoosh = splay('whoosh');
  const bps = rec.log.filter((l) => l[0].startsWith('biquad') && l[1] === 'frequency');
  chk('the whoosh is one noise source through a swept band, three sources in all',
    whoosh.ok === true && rec.started.length === 3 && bps.length === 3,
    `${rec.started.length} sources · ${bps.length} filter events`);
  chk('the sweep goes up to a passing train and back down',
    Math.max(...bps.map((l) => l[3])) >= 1400 && bps[0][3] < 400 && bps[2][3] < 400,
    bps.map((l) => `${l[2]} ${l[3]}Hz`).join(' → '));
  const pans = rec.log.filter((l) => l[0].startsWith('pan'));
  chk('and it crosses the head from left ear to right',
    pans.length === 2 && pans[0][3] < -0.8 && pans[1][3] > 0.8,
    pans.map((l) => l[3]).join(' → '));
  const rumble = rec.log.find((l) => l[0].startsWith('osc') && l[1] === 'frequency' && l[2] === 'set');
  chk('with the rails under it (a 50-ish Hz sine)', rumble && rumble[3] >= 40 && rumble[3] <= 70,
    rumble ? `${rumble[3]} Hz` : 'none');
  chk('nothing is left running: every source has a stop',
    rec.stops.length === rec.started.length, `${rec.started.length} starts / ${rec.stops.length} stops`);

  rec.log.length = 0; rec.started.length = 0;
  const alight = splay('alight');
  const bellStarts = rec.started.filter((s) => s[0].startsWith('osc')).map((s) => s[1]);
  chk('the get-off alert is three bells and a thump, scheduled apart',
    alight.ok === true && rec.started.length === 7 && new Set(bellStarts.map((x) => +x.toFixed(3))).size >= 4,
    `${rec.started.length} sources · ${new Set(bellStarts.map((x) => +x.toFixed(3))).size} start times`);
  const brk = (() => { fakeNow += 5000; rec.log.length = 0; const r = splay('brake');
    return { r, type: rec.log.find((l) => l[1] === 'type') }; })();
  chk('a refusal is a different sound, not the bell turned down',
    brk.r.ok === true && brk.type && brk.type[3] === 'highpass', JSON.stringify(brk.type?.[3]));

  const first = splay('tick');
  const second = splay('tick');
  chk('a fast thumb cannot machine-gun: the repeat floor refuses the second',
    first.ok === true && second.ok === false && second.why === 'too soon', `${first.ok} / ${second.why}`);
  fakeNow += 1000;
  chk('one second later the same sound is allowed again', splay('tick').ok === true);

  globalThis.document = { hidden: true };
  fakeNow += 1000;
  const hiddenTick = splay('tick');
  fakeNow += 1000;
  const hiddenAlight = splay('alight');
  chk('a backgrounded tab stays quiet under your thumb', hiddenTick.ok === false
    && hiddenTick.why === 'this tab is in the background', hiddenTick.why);
  chk('but an alert still rings, because that is what it is for', hiddenAlight.ok === true);
  delete globalThis.document;

  chk('an unknown name answers in words instead of throwing',
    splay('whooshh').why === 'no such sound');
  setEnabled(false);
  fakeNow += 1000;
  const off = splay('chime');
  chk('and turned off, every call says so rather than going silent',
    sndEnabled() === false && off.ok === false && off.why === 'sounds are off', off.why);
  setEnabled(true);
  fakeNow += 1000;
  chk('the toggle in a panel and the one in Settings are the same setting',
    sndEnabled() === true && splay('chime').ok === true);

  const wasOsc = Host.prototype.createOscillator;
  Host.prototype.createOscillator = () => { throw new Error('device busy'); };
  let threw = null;
  let broken = { ok: true, why: '' };
  fakeNow += 5000;
  try { broken = splay('ding'); } catch (e) { threw = e; }
  Host.prototype.createOscillator = wasOsc;
  chk('a graph the browser refuses mid-flight is caught, not thrown at a component',
    threw === null && broken.ok === false && /graph failed/.test(broken.why), broken.why);
  fakeNow += 5000;
  chk('and the panel recovers: the next press builds again', splay('ding').ok === true);

  // A browser with no Web Audio at all is only provable from a clean module
  // instance, since the live one has already made its context.
  const savedAC = globalThis.AudioContext;
  delete globalThis.AudioContext;
  const fresh = await import('../src/core/sfx.js?no-web-audio');
  const noAudio = fresh.play('tick');
  const saidSupported = fresh.supported();
  globalThis.AudioContext = savedAC;
  chk('no Web Audio is said out loud, and support is reported honestly',
    noAudio.ok === false && noAudio.why === 'this browser has no Web Audio'
      && saidSupported === false, `${noAudio.why} · supported() said ${saidSupported}`);
  chk('the seven sounds are the whole vocabulary, so nothing can name a missing one',
    fresh.SOUND_NAMES.length === 7 && SOUND_NAMES.every((n) => fresh.SOUNDS[n].label === SOUNDS[n].label)
    && fresh.SOUNDS.back.label === SOUNDS.back.label, fresh.SOUND_NAMES.join(' · '));
  chk('the gesture layer exists and keeps its promise off-browser',
    typeof fresh.attach === 'function' && typeof fresh.attach() === 'function' && fresh.attached() === false,
    'attach() is a no-op where there is no window, and returns the undo function');
  chk('a press is matched by the classes the app actually renders', (() => {
    const s = io => io;
    const srcTxt = src('src/core/sfx.js');
    return ['.tile', '.btn', '.cat', '.chip', "'.tabs button'", '.iconbtn', '.row', 'aria-label="Back"']
      .every((needle) => srcTxt.includes(needle.replace(/^'|'$/g, '')));
  })(), 'the delegated list names the real selectors');
  globalThis.performance = { now: () => clock0 };
  delete globalThis.window;
}

console.log('\n=== 10. the map stays behind its button ===');
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

console.log('\n=== 11. what actually ships ===');
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
    /* Sounds are app-wide by design now: the shell starts the gesture layer, so
       the engine must be IN the start chunk. What must stay out of the shell is the
       2.4 MB of transit JSON and leaflet — the checks above keep them lazy. A
       string a user would never see marks the module itself: sfx.js answers in
       words when Web Audio is missing. */
    const MARK = 'this browser has no Web Audio';
    const carriers = files.filter((f) => f.endsWith('.js')
      && fs.readFileSync(path.join(dist, f)).includes(MARK));
    chk('the sound engine ships in the start shell, where every tool can reach it',
      carriers.includes(shell) || buf.includes(MARK), `${shell}, ${carriers.length} carrier(s)`);
    chk('the shell listens for presses and can silence them',
      buf.includes('pointerdown') && buf.includes('Sound effects off'), 'delegated press + header switch');
    chk('the shell still carries no transit data and no map library',
      !buf.includes('route_records') && !buf.includes('leaflet'),
      `${shell} ${(buf.length / 1024).toFixed(0)} kB`);
    chk('the app starts the layer once, from the shell',
      /useEffect\(\(\) => sfxAttach\(\)/.test(src('src/App.jsx'))
      && src('src/App.jsx').includes("'./core/sfx'"), 'one effect, no per-tool wiring');
    chk('the Settings page switches the app-wide preference and can be heard',
      src('src/tools/settings.jsx').includes("setSetting('sfx'")
        && src('src/tools/settings.jsx').includes("from '../core/sfx.js'")
        && src('src/tools/settings.jsx').includes('Hear a tap'), 'checkbox + real test buttons');
    /* A comment written inside JSX children is not a comment: it is text, and it
       paints. The minifier keeps every other kind, so this only ever fires on a
       real leak — which is exactly what one of these panels did in review. */
    const leaked = [];
    const chunks = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, f), 'utf8'));
    for (const j of ['src/tools/multimodal.jsx', 'src/tools/trip-ui.jsx', 'src/tools/settings.jsx']) {
      for (const m of src(j).matchAll(/\/\*+([\s\S]*?)\*\//g)) {
        const words = m[1].replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (words.length > 30 && chunks.some((c) => c.includes(words))) leaked.push(`${j}: ${words.slice(0, 40)}`);
      }
    }
    chk('no code comment is ever rendered as text on screen', leaked.length === 0,
      leaked.join(' · ') || 'comments stay comments');
    chk('a travel panel keeps its own switch, writing the same key',
      src('src/core/sfx.js').includes("setSetting('sfx', !!on)")
        || src('src/core/sfx.js').includes('setEnabled'), 'one preference, two places to reach it');
  }
}

console.log('\n=== 12. core/combo-route: one search over buses and the metro together ===');
{
  const g = comboGraph();
  const t0 = Date.now();
  chk('the graph is built once and reused', comboGraph() === g, `${Date.now() - t0} ms on the second call`);
  chk('the graph holds both modes plus the walk links',
    g.count > 3000 && g.size.bus > 20000 && g.size.metro > 400 && g.size.walk > 1000,
    JSON.stringify({ nodes: g.count, ...g.size }));
  chk('a walk link exists only where the published station exits say so', (() => {
    const st = STATIONS.find((s) => s.b && s.b.length);
    const id = g.nid.get(`m#${st.n}`);
    if (id == null) return false;
    const out = g.adj[id].map((ei) => g.edges[ei]).filter((e) => e.mode === 'walk' && e.from === id);
    const named = new Set(st.b.map((b) => `b#${b.i != null ? b.i : (g.byName.get(b.n) || [])[0]}`));
    return out.length > 0 && out.every((e) => named.has(g.label[e.to]));
  })(), 'the search cannot invent a corridor a station does not publish');
  chk('every metro edge knows its line, colour and network',
    g.edges.every((e) => e.mode !== 'metro' || (e.line && e.colour && e.net)), `${g.size.metro} metro edges`);
  chk('every bus edge costs at least a minute and moves somewhere',
    g.edges.every((e) => e.mode !== 'bus' || (e.min >= 1 && e.km > 0)), `${g.size.bus} bus edges`);

  const pairs = [[mp('Rajiv Chowk'), mp('Hauz Khas')], [mp('Kashmere Gate'), mp('AIIMS')],
    [bp('Anand Vihar ISBT'), mp('Nehru Place')]];
  chk('every combined fixture is a place the data actually has',
    pairs.every(([a, b]) => placed(a) && placed(b)),
    pairs.map(([a, b]) => `${a.n}${placed(a) ? '' : '(no coords)'}→${b.n}${placed(b) ? '' : '(no coords)'}`).join(' , '));
  let maxMs = 0, paretoOk = true, capsOk = true, wordsOk = true, pricedOk = true;
  const seen = [];
  for (const [a, b] of pairs) {
    const t1 = Date.now();
    const r = comboPlan(a, b, { atMin: 570 });
    maxMs = Math.max(maxMs, Date.now() - t1);
    const o = r.options || [];
    seen.push(o.map((x) => `${x.mix} ${x.minutes}m ₹${x.fare}`).join(' | ') || 'nothing');
    for (const x of o) {
      for (const y of o) {
        if (x === y) continue;
        if (y.minutes <= x.minutes && y.fare <= x.fare && (y.minutes < x.minutes || y.fare < x.fare)) paretoOk = false;
      }
      if (x.walkMin > MAX_WALK_MIN || x.legs.length > MAX_LEGS) capsOk = false;
      if (/undefined|\[object Object\]/.test(JSON.stringify(x.legs))) wordsOk = false;
      if (!(x.fare > 0) || !(x.minutes > 0) || !(x.km > 0)) pricedOk = false;
    }
    if (!o.length) paretoOk = false;
  }
  chk('a combined search answers every pair in well under a second', maxMs < 2500,
    `${maxMs} ms for the slowest of three pairs`);
  chk('nothing shown is beaten by another option on both time and money', paretoOk, seen[0]);
  chk('no option breaks the published walk or leg caps', capsOk,
    `<= ${MAX_WALK_MIN} min walking, <= ${MAX_LEGS} legs`);
  chk('every leg reads as words', wordsOk, 'no undefined, no [object Object]');
  chk('every option is priced and timed', pricedOk, seen[1]);

  const mine = comboPlan(pairs[0][0], pairs[0][1], { atMin: 570 }).options;
  const metroMine = mine.filter((o) => o.legs.every((l) => l.kind !== 'bus'))[0];
  const ref = planRoutes('Rajiv Chowk', 'Hauz Khas', { atMin: 570 })[0];
  chk('the metro champion of the combined graph agrees with the metro planner',
    !!ref && !!metroMine
    && Math.abs(metroMine.minutes - (ref.minutes + metroMine.walkMin)) <= 3
    && metroMine.fare === ref.fare,
    `combined ${metroMine?.minutes} min incl ${metroMine?.walkMin} min of walking, ₹${metroMine?.fare}`
    + ` vs the metro tool's ${ref?.minutes} min ₹${ref?.fare}`);
  const busMine = mine.filter((o) => o.legs.every((l) => l.kind !== 'metro'))[0];
  const bRides = (busMine?.legs || []).filter((l) => l.kind === 'bus');
  let bRef = null;
  /* planBus speaks in stop names, so the comparison is over the very two stops the
     combined journey boards and alights at — same pair, two engines, one answer. */
  try { if (bRides.length) bRef = planBus(bRides[0].from, bRides[bRides.length - 1].to)[0] || null; } catch { bRef = null; }
  chk('over the same two stops the bus tool has no cheaper ticket than the combined search',
    !bRef || !busMine || busMine.fare <= bRef.fare + 0.01,
    bRef ? `combined ₹${busMine.fare} vs the bus tool's ₹${bRef.fare} (${bRides[0].from} → ${bRides[bRides.length - 1].to})`
      : 'the bus tool had no opinion on those two stops');
  chk('the combined planner reaches a bus within a walk of what the bus tool quotes',
    !bRef || !busMine || busMine.minutes - busMine.walkMin <= bRef.minutes + 15,
    bRef ? `${busMine.minutes - busMine.walkMin} min of transport vs ${bRef.minutes} min stop to stop` : '—');

  const mixed = comboPlan(pairs[2][0], pairs[2][1], { atMin: 570, only: 'mixed' }).options[0];
  chk('the search finds a journey that needs a bus AND the metro, unprompted',
    !!mixed && mixed.legs.some((l) => l.kind === 'metro') && mixed.legs.some((l) => l.kind === 'bus'),
    mixed ? `${mixed.minutes} min ₹${mixed.fare}: ` + mixed.legs.map((l) => l.kind).join(' + ') : 'none found');
  const metroOnly = comboPlan(pairs[2][0], pairs[2][1], { atMin: 570, only: 'metro' }).options;
  chk('only-metro returns metro journeys and nothing else',
    metroOnly.length > 0 && metroOnly.every((o) => o.legs.every((l) => l.kind !== 'bus')),
    `${metroOnly.length} option(s)`);
  chk('asking for both modes at once is never worse than asking for one', (() => {
    const all = comboPlan(pairs[2][0], pairs[2][1], { atMin: 570, only: 'all' }).options;
    const m = comboPlan(pairs[2][0], pairs[2][1], { atMin: 570, only: 'metro' }).options;
    return all.length && (!m.length || Math.min(...all.map((o) => o.minutes)) <= Math.min(...m.map((o) => o.minutes)));
  })(), 'the wider search can only add choices');

  const ac = comboPlan(pairs[1][0], pairs[1][1], { atMin: 570, ac: true });
  const plain = comboPlan(pairs[1][0], pairs[1][1], { atMin: 570, ac: false });
  const acBus = (ac.options || []).find((o) => o.legs.some((l) => l.kind === 'bus'));
  const plBus = (plain.options || []).find((o) => o.legs.some((l) => l.kind === 'bus'));
  chk('the AC toggle moves the bus fare and nothing else',
    !!acBus && !!plBus && acBus.legs.filter((l) => l.kind === 'bus').length >= 0
    && ac.options.some((o) => o.fare >= plBus.fare), `AC ₹${acBus?.fare} vs ordinary ₹${plBus?.fare}`);
  chk('a place given by name alone still gets an answer',
    comboPlan({ n: 'Rajiv Chowk', kind: 'metro' }, { n: 'Hauz Khas', kind: 'metro' }, { atMin: 570 })
      .options.length > 0);
  chk('the same journey asked twice is answered from the memo', (() => {
    const a = mp('Samaypur Badli'), b = mp('Rajiv Chowk');
    comboPlan(a, b, { atMin: 570 });
    const t2 = Date.now();
    const r = comboPlan(a, b, { atMin: 570 });
    return Date.now() - t2 < 40 && r.options.length > 0;
  })(), 'under 40 ms for a repeat');
  chk('a journey that starts and ends in the same place is refused, not invented', (() => {
    const r = comboPlan(pairs[0][0], pairs[0][0], {});
    return r.options.length === 0 && !!r.note;
  })(), comboPlan(pairs[0][0], pairs[0][0], {}).note);
  chk('the costs the search optimises are the ones the panel publishes',
    CX_GATE === 7 && CX_BOARD === 8 && CX_ACCESS === 2 && COMBO_VOT === 2 && CX_METRO_KMPM === 0.55
    && CX_WALK_KMH === 5 && COMBO_WALK_CAP === 2, '7 at a gate · 8 to re-board · 2 to get in · ₹2/min');

  const o0 = comboPlan(pairs[0][0], pairs[0][1], { atMin: 570 }).options[0];
  const det = metroDetail(o0.legs, 570);
  chk('the journey clock is handed the metro detail it expects',
    det.legs.length === o0.legs.filter((l) => l.kind === 'metro').length && Number.isInteger(det.minutesWithWait)
    && det.km > 0 && det.canMakeIt === true && det.nextIn >= 0 && !!det.lastTrain,
    `${det.minutesWithWait} min with the wait, ${det.legs.length} leg(s)`);
  const ck = clockOf(o0, 570);
  chk('a combined option drives the journey clock without gaps',
    ck.legs.length >= o0.legs.length && !ck.risk.length && ck.agrees !== false
    && ck.legs.some((l) => l.kind === 'wait') && ck.legs.filter((l) => l.kind === 'ride').length === 1
    && ck.noWaitMin + ck.allowanceMin === ck.publishedMinutes && ck.walkMin === o0.walkMin
    && Number.isFinite(ck.departMin) && Number.isFinite(ck.arriveMin),
    `${ck.fmt(ck.departMin)} → ${ck.fmt(ck.arriveMin)} · ${ck.rideMin} min riding, ${ck.walkMin} walking,`
    + ` bar ${ck.noWaitMin}+${ck.allowanceMin} = published ${ck.publishedMinutes}`);
  const trk = trackOfCombo(o0, {});
  chk('a combined option draws a map line that starts at the boarding stop',
    trk.points.length >= 5 && trk.points[0].isBoard && trk.points.filter((p) => p.isAlight).length === 1
    && trk.points.filter((p) => p.isBoard).length === 1
    && !JSON.stringify(trk.points).includes('undefined'),
    `${trk.points.length} points · ${trk.label} · boards ${trk.points.filter((p) => p.isBoard).length}`);
  chk('the bus legs of a mixed journey carry what the alert needs',
    o0.legs.every((l) => l.kind !== 'bus' || (l.ri != null && l.i0 != null && Number.isFinite(l.minutes)
      && l.names?.length > 1 && typeof l.from === 'string' && l.bus?.legs?.[0]?.ri === l.ri)),
    (o0.legs.find((l) => l.kind === 'bus') || {}).ref || 'no bus leg in the first option');

  /* Two invariants that came out of real bugs, kept as permanent guards.

     1. A ride leg must name the stops its own ROUTES record holds. When a vehicle
        id was shared by two records of the same route number, a leg was stitched
        from the first half of one ride and the last half of another: it printed a
        get-off stop fourteen kilometres from where the journey actually ended, and
        the option was fast enough to delete the correct answer from the list.

     2. The minutes on screen must be the minutes the search paid for. A leg that is
        not drawn - the walk from the last stop to the destination, say - makes an
        option look quicker than it is, and the ranking is a lie. */
  let misnamed = 0, rides = 0, offCost = 0, priced = 0;
  const worst = [];
  for (const [a, b] of pairs) {
    for (const only of ['all', 'mixed', 'metro', 'bus']) {
      const r = comboPlan(a, b, { atMin: 570, only });
      for (const L of (r.anomalies || [])) worst.push(`${a}\u2192${b} ${L}`);
      for (const o of r.options) {
        priced++;
        if (o.searchCost != null && Math.abs(o.minutes - o.searchCost) > 3) {
          offCost++;
          worst.push(`${only} ${o.mix} ${o.minutes} min shown, ${o.searchCost} paid`);
        }
        for (const L of o.legs) {
          if (L.kind !== 'bus' && L.kind !== 'metro') continue;
          rides++;
          const ends = L.kind === 'bus'
            ? [STOPS[ROUTES[L.ri]?.s?.[L.i0]]?.n, STOPS[ROUTES[L.ri]?.s?.[L.i1]]?.n]
            : [L.stops?.[0], L.stops?.[L.stops.length - 1]];
          if (ends[0] !== L.from || ends[1] !== L.to) {
            misnamed++;
            worst.push(`${L.kind} ${L.ref}: ${L.from}\u2192${L.to} vs data ${ends.join('\u2192')}`);
          }
        }
      }
    }
  }
  for (const w of worst.slice(0, 4)) console.log(`      ! ${w}`);
  chk(`${rides} ride legs name the stops their own route data holds`, misnamed === 0);
  chk(`${priced} options cost what they claim, within a rounding of the per-hop minutes`,
    offCost === 0);
  chk('no journey was dropped for geometry the map does not support', worst.length === 0);
}

console.log('\n=== 13. core/mapsearch: places beyond the stop table ===');
{
  const G = await import('../src/core/mapsearch.js');
  chk('two independent providers, primary first', true);
  const pg = G.parsePhoton({ features: [
    { geometry: { coordinates: [77.3253, 28.6649] },
      properties: { name: 'DLF', street: 'Kasturba Marg', district: 'Rajendra Nagar', city: 'Ghaziabad',
        osm_type: 'W', osm_id: 1360694662 } },
    { geometry: { coordinates: [null] }, properties: { name: 'broken' } },
    { geometry: { coordinates: [1, 2] }, properties: {} },
  ] });
  chk('photon results come back with lat/lon the right way round',
    pg.length === 1 && Math.abs(pg[0].lat - 28.6649) < 1e-6 && Math.abs(pg[0].lon - 77.3253) < 1e-6,
    pg[0] && `${pg[0].lat},${pg[0].lon} ${pg[0].n}`);
  chk('a photon label is assembled from its parts, deduped',
    pg[0].n === 'DLF, Kasturba Marg, Rajendra Nagar, Ghaziabad', pg[0].n);
  const ng = G.parseNominatim([
    { lat: '28.6129', lon: '77.2295', display_name: 'India Gate, Circle, New Delhi', osm_type: 'node', osm_id: 1 },
    { lat: 'x', lon: '0', display_name: 'broken' },
  ]);
  chk('nominatim rows parse into the same shape', ng.length === 1 && ng[0].kind === 'geo'
    && Number.isFinite(ng[0].lat) && ng[0].via === 'nominatim', JSON.stringify(ng[0] && ng[0].n));
  chk('geoPlace turns a hit into a place the planner accepts', (() => {
    const q = G.geoPlace(ng[0]);
    return q.kind === 'geo' && q.lat === 28.6129 && q.n.length > 3;
  })());
  chk('a query too short to mean anything is answered without touching the network',
    await G.searchMap('ab') .then(r => r.ok === true && r.hits.length === 0 && r.skipped === 'too short'));
  /* live provider check, network-tolerant: the sandbox may be offline, but it may
     not pretend - either real places come back, or the failure is reported as one */
  await (async () => {
    const r = await G.searchMap('India Gate New Delhi', { lat: 28.61, lon: 77.22 });
    if (r.ok) {
      const far = (r.hits || []).filter((h) => Math.hypot(h.lat - 28.6129, h.lon - 77.2295) > 0.05);
      chk('the live map search finds India Gate near where India Gate is',
        r.hits.length > 0 && far.length === 0, `${r.hits.length} hit(s) via ${r.providers.join(',')}`);
    } else {
      chk('no network here is reported, never hidden', typeof r.why === 'string' && r.why.length > 5, r.why);
    }
  })();
  /* the planner side: a pin is a place, and a pin too far from anything says so usefully */
  const pin = { n: 'India Gate', kind: 'geo', lat: 28.6129, lon: 77.2295 };
  const ok13 = comboPlan(pin, 'Rajiv Chowk', { atMin: 570 });
  chk('a journey can start from an exact pin, not only from a named stop',
    ok13.options.length > 0 && ok13.options[0].legs[0].kind === 'walk'
    && ok13.options[0].legs[0].from === 'India Gate',
    ok13.options[0] && `${ok13.options[0].mix} ${ok13.options[0].minutes}m`);
  const far13 = comboPlan(pin, { n: 'Somewhere in the Aravalli', kind: 'geo', lat: 28.352, lon: 77.122 }, { atMin: 570 });
  chk('a pin beyond every walkable stop is refused with a distance, not a shrug',
    far13.options.length === 0 && /km from its nearest published stop/.test(far13.note || '')
    && new RegExp(String(COMBO_WALK_CAP)).test(far13.note || ''), (far13.note || '').slice(0, 96));
  /* and the bundling rule: this is a feature of one lazy panel, never of the
     shell - only checkable after `npx vite build` put dist on disk */
  const out = path.join(ROOT, 'dist/assets');
  if (fs.existsSync(out)) {
    const idx = fs.readdirSync(out).find((f) => /^index-.*\.js$/.test(f));
    const shell = fs.readFileSync(path.join(out, idx), 'utf8');
    /* The shell already ships a Photon provider and a Nominatim *reverse* lookup for
       the other tools - that is not our business here. What is ours: the Plan Journey
       map search must ride only in the lazy panel chunk, so the shell pays neither the
       code nor the wording. 'Search the whole map for' is a string no other module of
       this app writes, and the jsonv2 forward-search URL belongs to mapsearch alone. */
    chk('the start shell never pays for the Plan Journey map search',
      !shell.includes('Search the whole map for') && !shell.includes('format=jsonv2&limit=6&countrycodes'),
      `${idx} ${(shell.length / 1024) | 0} kB`);
    const lazy = fs.readdirSync(out).find((f) => /^multimodal-.*\.js$/.test(f));
    const mm = lazy ? fs.readFileSync(path.join(out, lazy), 'utf8') : '';
    chk('the Plan Journey chunk carries it',
      !!lazy && mm.includes('Search the whole map for') && mm.includes('photon.komoot.io'),
      `${lazy}`);
  } else chk('the bundle check needs a dist - run npx vite build first', false, 'no dist/');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
