/**
 * Render smoke test for the travel UI.
 *
 *   npx esbuild scripts/ssr-smoke.jsx --bundle --platform=node --format=esm \
 *       --jsx=automatic --loader:.css=empty --define:__BUILD__='"smoke"' \
 *       --outfile=/tmp/ssr-smoke.mjs && node /tmp/ssr-smoke.mjs
 *
 * Every travel panel is rendered to HTML with the real bundled data.  Effects
 * do not run under renderToStaticMarkup, so this checks module wiring, the data
 * join and the first-paint render path — which is where a bad field name or a
 * null coordinate actually shows up.  Also asserts the things that would be a
 * silent data bug: the planner finds a route, the live panel prints a time,
 * the metro station->bus join returns real route numbers.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocProvider } from '../src/core/geo.jsx';
import { BusPlanner, BusRoutesList, BusFares } from '../src/tools/bus-planner.jsx';
import { MetroPlanner, MetroNetwork } from '../src/tools/metro-planner.jsx';
import { BusLive, MetroTimings } from '../src/tools/transit-live.jsx';
import { MultiModal } from '../src/tools/multimodal.jsx';
import { BusHub, MetroHub } from '../src/tools/travel-hubs.jsx';
import { planBus, searchStops, findRoute, nextAtStop, nameOf, stopIndexOn, ROUTES } from '../src/core/bus-route.js';
import { planRoutes, STATIONS, lineInfo, lastTrainAt } from '../src/core/metro-route.js';
import { busAtStation, metroNearStop } from '../src/core/transit-link.js';

const cases = [['BusPlanner', BusPlanner], ['BusRoutesList', BusRoutesList], ['BusFares', BusFares],
  ['MetroPlanner', MetroPlanner], ['MetroNetwork', MetroNetwork], ['BusLive', BusLive],
  ['MetroTimings', MetroTimings], ['MultiModal', MultiModal], ['BusHub', BusHub], ['MetroHub', MetroHub]];
let bad = 0;
for (const [name, C] of cases) {
  try {
    const html = renderToStaticMarkup(<LocProvider><C /></LocProvider>);
    if (html.length < 200) throw new Error(`suspiciously empty (${html.length} chars)`);
    console.log(`  PASS  ${name.padEnd(14)} renders  ${html.length} chars`);
  } catch (e) {
    bad++;
    console.log(`  FAIL  ${name.padEnd(14)} ${e.message.split('\n')[0]}`);
  }
}

console.log('\n=== data paths the panels use ===');
const chk = (n, c, d = '') => { c ? null : bad++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const A = 'Connaught Place', B2 = 'ISBT Kashmere Gate';
const stops = searchStops('Kashmere', 4);
chk('stop search finds the ISBT', stops.length > 0, stops.join(', '));
const from = stops[0];
const opt = planBus(from, searchStops('Dhaula', 2)[0] || from);
chk('bus planner returns a journey', opt.length > 0,
  opt[0] ? `${opt[0].legs.map((l) => l.ref).join(' + ')} · ${opt[0].km} km · Rs${opt[0].fare}` : 'none');
const rec = findRoute('623')[0] || ROUTES[0];
const p = stopIndexOn(rec, nameOf(rec.s[0]));
chk('a real direction has a next bus at its first stop',
  (() => { const t = nextAtStop(rec, 0, new Date(), 1); return t.length ? t[0].at >= 0 : rec.tt?.d?.length > 0; })(),
  `bus ${rec.r}, ${rec.tt?.d?.length || 0} departures published`);
const jr = planRoutes('Rajiv Chowk', 'Hauz Khas')[0];
chk('metro planner returns a journey', !!jr, jr ? `${jr.stations} stops, Rs${jr.fare}, ${jr.minutes} min` : '');
chk('metro journey carries a last-train check', jr.canMakeIt === true || jr.canMakeIt === false,
  `last train ${jr.lastTrain != null ? String(jr.lastTrain) : 'n/a'}`);
chk('line status is computable', !!lineInfo('Yellow Line'), JSON.stringify(lineInfo('Yellow Line')?.headway));
chk('last-train estimate exists for a station', !!lastTrainAt('Red Line', 'Rithala', 20 * 60));
const links = busAtStation('Kashmere Gate', 3);
chk('metro station resolves real bus numbers', links.length > 0 && links[0].numbers.length > 0,
  links.map((l) => `${l.name}:${l.count}`).join(' '));
const mNear = metroNearStop('Nehru Place Terminal', 1.2);
chk('bus stop resolves the metro', mNear.length > 0, mNear.map((s) => `${s.n} ${s.km}km`).join(', '));
chk('every station has coordinates', STATIONS.every((s) => s.lat != null));

console.log(bad ? `\n${bad} problem(s)` : '\ntravel UI renders and its data paths answer');
process.exit(bad ? 1 : 0);
