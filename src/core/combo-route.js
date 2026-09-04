/**
 * combo-route.js — one graph, two modes, and an answer that is a *journey*.
 *
 * The combined planner used to bolt a feeder bus onto a metro plan when one
 * happened to exist, and otherwise print "Metro: 26 min" next to "Bus: 58 min"
 * and leave the choice to the reader. That is not a combined planner: it never
 * looked for the bus that beats the metro by ₹28, or the one that drops you at a
 * station two stops earlier.
 *
 * So this builds one graph out of the two published datasets and searches it.
 *
 *   node  b#<stop index>     one of the physical bus stops in bus-delhi.json
 *   node  m#<station name>   one of the metro stations in metro-delhi.json — a station
 *                            served by three lines is ONE node, so a change of line is
 *                            a costed event at that node and not a mystery detour
 *   edge  bus hop            consecutive stops of a published direction. km comes from that
 *                            route's own shape via journeyKm(), minutes from its own average
 *                            speed (published km ÷ published minutes) — the same two calls
 *                            the bus planner makes, so a leg measured here IS the leg the
 *                            bus tool prints, not an estimate of it
 *   edge  metro hop          consecutive stations of a line, haversine km at 0.55 km/min
 *   edge  walk               a station's published `b` list (the bus stops near it with
 *                            metres the scraper measured) and the documented foot transfers.
 *                            No invented corridors: where the data does not say two places
 *                            can be walked, this graph has no edge between them
 *
 * Costs, and their sources: a metro chain costs Σkm/0.55 + (runs−1)×CHANGE_MIN + ACCESS_MIN,
 * which is the metro planner's own headline formula, so the two tools cannot drift. A bus
 * ride costs its km ÷ its route's speed. A change of vehicle costs BOARD_MIN (getting off,
 * walking, getting on) and — importantly — that penalty is charged even when the rider walks
 * between the two platforms, because walking around a transfer does not make it free.
 * Fares are the slabs: DMRC once per continuous metro chain, DTC per bus ride (no free
 * transfer is modelled because DTC publishes none in this dataset), and a chain that includes
 * a line outside DMRC is flagged `separateTicket` instead of being quietly priced.
 *
 * "Best" is a person's business, so the same graph is searched by minutes and by rupees, and
 * the panel ranks the union by `value` = minutes + ₹/VOT_RPM (VOT_RPM is stated in the UI,
 * not hidden in the code). Journeys that walk more than MAX_WALK_MIN, or that are slower AND
 * dearer than another journey found, are dropped — and `dropped` says how many, so the panel
 * can say it out loud instead of pretending there was nothing to choose from.
 */

import {
  ROUTES, STOPS, nameOf, journeyKm, routeSpeed, busFare, haversine, nearestStops, minutesOfDay,
  serviceWindow,
} from './bus-route.js';
import * as M from './metro-route.js';

export const WALK_KMH = 5;
export const METRO_KMPM = 0.55;
export const CHANGE_MIN = 7;          // metro line change: the planner's own figure
export const BOARD_MIN = 8;           // changing vehicle: alight + walk + board
export const ACCESS_MIN = 2;          // down to the platform, inside the metro headline
export const VOT_RPM = 2;            // `value` treats one saved minute as worth ₹2
export const BUS_KMPM = 0.28;         // the bus planner's fallback speed
export const MAX_WALK_KM = 2.0;       // how far either end is worth walking to a vehicle
export const MAX_LINK_WALK_M = 1200;  // the furthest station↔stop link the data measured
export const MAX_WALK_MIN = 20;       // and no journey is offered that walks more in total
export const MAX_LEGS = 7;            // than this many legs of any kind
export const MAX_MINUTES = 6 * 60;    // a search that only finds a 6-hour journey found nothing

export const walkMin = (km) => Math.max(1, Math.round((km / WALK_KMH) * 60));
const BID = (i) => `b#${i}`;
const MID = (n) => `m#${n}`;

/* ------------------------------------------------------------------ the graph */

let G = null;
export function graphInfo() { return G ? { ...G.size, nodes: G.count } : null; }

/**
 * Build once: ~5.6k nodes, ~90k directed edges, all of it from JSON that is
 * already in memory. Measured at ~100 ms in node and 200-400 ms on a mid-range
 * phone, so it happens on the first search and is kept afterwards.
 */
export function graph() {
  if (G) return G;
  const t0 = Date.now();
  const nid = new Map();          // 'm#AIIMS' → integer
  const label = [];               // integer → 'm#AIIMS'
  const pos = [];                 // integer → {lat, lon}
  const edges = [];               // flat edge list, adjacency holds indices
  const adj = [];                 // integer → [edge index…]
  const vehIds = new Map();       // 'b22A' / 'mYellow Line' → integer (0 = on foot)
  const size = { bus: 0, metro: 0, walk: 0 };

  const idOf = (s) => {
    let i = nid.get(s);
    if (i == null) { i = label.length; nid.set(s, i); label.push(s); adj.push([]); pos.push(null); }
    return i;
  };
  const vehKind = [0];               // 0 on foot · 1 bus · 2 metro, indexed by vehicle id
  const vehOf = (k, kind = 0) => {
    if (!k) return 0;
    let v = vehIds.get(k);
    if (v == null) { vehIds.set(k, v = vehIds.size + 1); vehKind[kind] = kind; vehKind[v] = kind; }
    return v;
  };

  const byName = new Map();
  STOPS.forEach((s, i) => {
    const n = s && s.n != null ? String(s.n) : null;
    if (!n) return;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(i);
  });
  const idxOf = (v) => (typeof v === 'number' ? v : (byName.get(String(v)) || [])[0] ?? null);
  const push = (from, e) => { adj[from].push(edges.push(e) - 1); };

  for (let ri = 0; ri < ROUTES.length; ri++) {
    const r = ROUTES[ri];
    const seq = r && r.s;
    if (!Array.isArray(seq) || seq.length < 2) continue;
    const speed = routeSpeed(r);
    const ids = seq.map(idxOf);
    for (let k = 0; k + 1 < ids.length; k++) {
      const a = ids[k], b = ids[k + 1];
      if (a == null || b == null || a === b) continue;
      const { km } = journeyKm(r, k, k + 1);
      if (!(km > 0)) continue;
      const min = speed ? Math.max(1, Math.round((km / speed) * 60)) : Math.max(1, Math.round(km / BUS_KMPM));
      const from = idOf(BID(a)), to = idOf(BID(b));
      pos[from] = pos[from] || STOPS[a]; pos[to] = pos[to] || STOPS[b];
      push(from, { to, from, mode: 'bus', veh: vehOf(`b${r.r}`, 1), ri, i0: k, i1: k + 1, km, min, ref: r.r });
      size.bus++;
    }
  }

  const POS = new Map(M.STATIONS.map((s) => [s.n, s]));
  for (const L of M.LINES) {
    for (let i = 0; i + 1 < (L.s || []).length; i++) {
      const a = L.s[i], b = L.s[i + 1];
      const pa = POS.get(a), pb = POS.get(b);
      if (!pa || !pb) continue;
      const km = haversine(pa, pb);
      if (!(km > 0)) continue;
      const min = Math.max(1, Math.round(km / METRO_KMPM));
      const veh = vehOf(`m${L.l}`, 2);
      const ia = idOf(MID(a)), ib = idOf(MID(b));
      pos[ia] = pos[ia] || pa; pos[ib] = pos[ib] || pb;
      push(ia, { to: ib, from: ia, mode: 'metro', veh, line: L.l, colour: L.c, net: L.net || 'DMRC', km, min,
        toName: b, fromName: a });
      push(ib, { to: ia, from: ib, mode: 'metro', veh, line: L.l, colour: L.c, net: L.net || 'DMRC', km, min,
        toName: a, fromName: b });
      size.metro += 2;
    }
  }
  for (const w of M.WALKS || []) {
    if (!POS.has(w.a) || !POS.has(w.b)) continue;
    const km = (w.m || 300) / 1000, min = walkMin(km);
    const ia = idOf(MID(w.a)), ib = idOf(MID(w.b));
    push(ia, { to: ib, from: ia, mode: 'walk', veh: 0, km, min, transfer: true, note: w.note || null, toName: w.b });
    push(ib, { to: ia, from: ib, mode: 'walk', veh: 0, km, min, transfer: true, note: w.note || null, toName: w.a });
    size.walk += 2;
  }
  for (const s of M.STATIONS) {
    for (const b of s.b || []) {
      if (!(b.m > 0) || b.m > MAX_LINK_WALK_M) continue;
      const ids = byName.get(b.n);
      if (!ids || !ids.length) continue;
      const km = +(b.m / 1000).toFixed(3), min = walkMin(km);
      const im = idOf(MID(s.n));
      pos[im] = pos[im] || s;
      for (const i of ids) {
        const ib = idOf(BID(i));
        pos[ib] = pos[ib] || STOPS[i];
        push(im, { to: ib, from: im, mode: 'walk', veh: 0, km, min, stopName: b.n, toName: b.n });
        push(ib, { to: im, from: ib, mode: 'walk', veh: 0, km, min, stopName: s.n, toName: s.n });
        size.walk += 2;
      }
    }
  }

  G = { nid, label, pos, edges, adj, byName, idxOf, idOf, vehKind, vehCount: vehIds.size + 1,
    count: label.length, size, ms: Date.now() - t0 };
  return G;
}

/* --------------------------------------------------------------------- search */

function heap() {
  const a = [];
  const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
  const down = (i) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < a.length && a[l][0] < a[m][0]) m = l;
      if (r < a.length && a[r][0] < a[m][0]) m = r;
      if (m === i) break;
      const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
    }
  };
  return {
    get size() { return a.length; },
    peek() { return a[0]; },
    push(x) { a.push(x); up(a.length - 1); },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; down(0); } return top; },
  };
}

/** ₹-cost of boarding a bus: the slab the rider actually pays for that hop. */
const busFareOf = (e) => (e.mode === 'bus' ? busFare(e.km) : 0);

/**
 * What an edge costs each search. Minutes and rupees are never mixed inside one
 * search except through `value`, where the rate is the stated VOT_RPM. A walk is
 * 1/1000 of a rupee per minute in the money search: enough to break ties, not
 * enough to make a 9 km wander look free.
 */
function edgeCost(obj, e) {
  /* money: rides cost their ticket, and walking costs a token amount so the
     search prefers to walk a short way rather than a long one — a search that
     treats walking as free answers "₹32" with an hour on foot. */
  if (obj === 'fare') return e.mode === 'walk' ? 0.05 * e.min : e.mode === 'bus' ? busFareOf(e) : 0.02;
  if (obj === 'value') return e.min + (e.mode === 'bus' ? busFareOf(e) : 0) / VOT_RPM
    + (e.mode === 'metro' ? 0.02 : 0);
  return e.min;
}
const changeCost = (obj) => (obj === 'fare' ? 1 : obj === 'few' ? 8 : BOARD_MIN);
const vehName = (e) => (e.mode === 'bus' ? `b${e.ri}` : e.mode === 'metro' ? `m${e.line}` : '');

/**
 * Dijkstra over (node, vehicle) states: staying on the same bus or the same
 * line is free, boarding anything else costs a change. A walk keeps the rider
 * "on" the vehicle they came off — otherwise walking off a platform and back on
 * would dodge the transfer penalty, and the search happily found that route.
 *
 * @param sources Map<int, {min}>  where the rider can start, with its walk cost
 * @param targets Set<int>        where they can get out; the search stops once
 *                                every one is settled and the heap can no longer
 *                                beat the best of them by more than a 15% slack
 */
/**
 * A* over the same graph. The heuristic is the straight-line distance to the goal
 * divided by the fastest thing on the network (the metro's 0.55 km/min), which no
 * real path can beat — so it prunes the map without ever cutting the answer. For
 * the money search the heuristic is 0, because rupees do not care about distance.
 */
export function search(sources, { mask = 'all', obj = 'min', targets = null, exits = null, goal = null, slack = 0 } = {}) {
  const g = graph();
  const H = goal && goal.lat != null && obj !== 'fare'
    ? (node) => { const p = g.pos[node]; return p ? haversine(p, goal) / METRO_KMPM : 0; }
    : () => 0;
  const NV = g.vehCount;
  const dist = new Map();
  const par = new Map();
  const settled = new Set();
  const q = heap();
  const want = targets && targets.size ? new Set(targets) : null;
  const CC = changeCost(obj);
  const KIND = g.vehKind;
  const VX = -7;                       // the virtual node every finished journey ends at
  let bestTarget = Infinity, done = null;
  const atKey = new Map();          // node → the state key that settled it
  for (const [node, s] of sources) {
    const key = node * NV;
    dist.set(key, s.min);
    par.set(key, { start: s });
    q.push([s.min + H(node), s.min, key]);
  }
  let pops = 0;
  const CAP = 260000;                        // a search that needs more than this found nothing good
  while (q.size && pops++ < CAP) {
    const [f, d, key] = q.pop();
    if (dist.get(key) !== d) continue;
    const node = Math.floor(key / NV);
    if (!settled.has(node)) {
      settled.add(node);
      atKey.set(node, key);
      if (node === VX) {
        done = d;                                   // a whole journey, walks included
        /* `slack` is how much worse than the best a rival may be and still be
           worth returning. A pure-mode champion needs none — it exists to be the
           best of its mode. The mixed search takes a few minutes, because a rider
           comparing two ways through the city wants the second choice too. */
        const next = q.peek();
        if (!next || slack <= 0 || next[0] > done + slack) break;
      }
      if (want && want.has(node)) {
        want.delete(node);
        if (d < bestTarget) bestTarget = d;
        /* an unsettled heap front that cannot beat the best settled exit means the
           answer is complete for minutes; money keeps a stated slack so the second
           and third cheapest exits can still be seen */

      }
    }
    if (node === VX) continue;                  // the journey ended; nothing to relax
    const prevVeh = (par.get(key) || {}).veh || 0;
    for (const ei of g.adj[node] || []) {
      const e = g.edges[ei];
      if (mask !== 'all' && e.mode !== 'walk' && e.mode !== mask) continue;
      const nv = e.veh;
      let add = edgeCost(obj, e);
      /* station-to-station on the metro costs what the metro planner charges for it
         (CHANGE_MIN); anything else is a real boarding (BOARD_MIN). Pricing the two
         the same is what made a two-change ride look worse than it is, and the
         search then never offered the route the metro tool itself would find. */
      if (nv && prevVeh && nv !== prevVeh) {
        add += (KIND[nv] === 2 && KIND[prevVeh] === 2) ? (obj === 'fare' ? 0.05 : CHANGE_MIN) : CC;
      }
      const nk = e.to * NV + (nv || prevVeh);          // a walk keeps the vehicle on record
      const nd = d + add;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        par.set(nk, { prev: key, ei, d: nd, veh: nv || prevVeh });
        q.push([nd + H(e.to), nd, nk]);
      }
      /* Getting off is not free: the walk from the stop to the place you asked for
         belongs to the journey, so it is priced here and not hoped for afterwards.
         Without this the search happily stopped one station early. */
      /* A journey has to contain a ride. Without that rule the very first thing
         the search can finish is "walk to a station, walk to a stop near your
         destination" — free, so it settles the sink, and the search stops there
         without ever looking at the metro. */
      if (exits && exits.has(e.to) && (nv || prevVeh)) {
        const ex = exits.get(e.to);
        const vk = VX * NV;
        const vd = nd + (obj === 'fare' ? 0.001 * ex.min : ex.min);
        if (vd < (dist.get(vk) ?? Infinity)) {
          dist.set(vk, vd);
          par.set(vk, { prev: nk, ei: null, d: vd, veh: 0, exit: e.to });
          q.push([vd, vd, vk]);
        }
      }
    }
  }
  return { settled, atKey, par, dist, pops, g, states: dist.size };
}

/** Hop indices that reached `node`, oldest first. */
function chainTo(run, node) {
  const key = run.atKey.get(node);
  if (key == null) return null;
  const out = [];
  let cur = key;
  while (cur != null) {
    const l = run.par.get(cur);
    if (!l) break;
    if (l.ei != null) out.push(l.ei);
    cur = l.prev;
  }
  return out.length ? out.reverse() : null;
}

/**
 * Turn hop indices into legs: consecutive hops of one vehicle become one leg,
 * and that leg is then priced over its whole span the way the planners price it
 * (journeyKm for the full i0→i1, the route's own speed), so a leg shown here
 * reads the same as the same leg in the bus or metro tool.
 */
export function legsFromChain(run, chain) {
  const g = run ? run.g : graph();
  const legs = [];
  const E = (i) => g.edges[i];
  /* a node id → the name a rider reads. m# labels hold the station name, b# labels
     hold an index into STOPS; nameOf() wants that index raw, so resolving the stop
     first and handing it over produced "[object Object]" on every walk leg. */
  const nameOfNode = (id) => {
    const lab = g.label[id] ?? '';
    if (!lab) return null;
    return lab.startsWith('m#') ? lab.slice(2) : (STOPS[+lab.slice(2)]?.n ?? nameOf(+lab.slice(2)));
  };
  let i = 0;
  while (i < chain.length) {
    const e = E(chain[i]);
    if (e.mode === 'walk') {
      let j = i;
      while (j + 1 < chain.length && E(chain[j + 1]).mode === 'walk') j++;
      const span = chain.slice(i, j + 1).map(E);
      const km = +span.reduce((s, x) => s + x.km, 0).toFixed(2);
      const min = span.reduce((s, x) => s + x.min, 0);
      const to = nameOfNode(span[span.length - 1].to);
      const from = nameOfNode(span[0].from);
      legs.push({ kind: 'walk', text: `Walk to ${to || 'the next stop'}`, km, min, from, to,
        note: span.find((x) => x.note)?.note || (span.find((x) => x.stopName) || {}).stopName || null,
        metres: Math.round(km * 1000) });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j + 1 < chain.length && E(chain[j + 1]).veh === e.veh) j++;
    const span = chain.slice(i, j + 1).map(E);
    if (e.mode === 'bus') {
      const r = ROUTES[e.ri];
      const i0 = e.i0, i1 = span[span.length - 1].i1;
      const { km, shape } = journeyKm(r, i0, i1);
      const speed = routeSpeed(r);
      const minutes = Math.max(3, speed ? Math.round((km / speed) * 60) : Math.round(km / BUS_KMPM));
      const fwd = i1 >= i0;
      const path = fwd ? r.s.slice(i0, i1 + 1) : r.s.slice(i1, i0 + 1).reverse();
      const nm = (v) => (typeof v === 'number' ? STOPS[v]?.n : v?.n ?? v) ?? '';
      const names = path.map(nm);
      const win = serviceWindow(r);
      const leg = {
        kind: 'bus', ref: r.r, from: names[0], to: names[names.length - 1], count: Math.abs(i1 - i0),
        km: +km.toFixed(2), minutes, ri: e.ri, i0: Math.min(i0, i1), i1: Math.max(i0, i1),
        boardFrom: fwd ? 'start' : 'end', dir: `${r.f} → ${r.t}`, path, names, exact: !!shape,
        fare: busFare(km), fareAc: busFare(km, true), trips: r.tt?.k ?? (r.tt?.d?.length || null),
        first: win ? win[0] : null, last: win ? win[1] : null, timed: !!(r.tt?.d?.length),
      };
      /* the shape the bus planner returns for one ride, so the journey clock and
         the trip track can be handed a combo leg unchanged — they read
         leg.bus.legs[0] and nothing else about the old planBus result.
         It is a copy on purpose: pointing back at `leg` would make the option a
         circular object, and anything that stringifies it — saving it, diffing it,
         printing it — would throw. */
      const { bus: _busless, ...once } = leg;
      leg.bus = { legs: [once], changes: 0, minutes, km: leg.km, fare: leg.fare, fareAc: leg.fareAc,
        stops: leg.count, shape: leg.exact };
      legs.push(leg);
    } else {
      const km = +span.reduce((s, x) => s + x.km, 0).toFixed(2);
      legs.push({
        kind: 'metro', line: e.line, colour: e.colour, net: e.net, km,
        from: nameOfNode(span[0].from), to: nameOfNode(span[span.length - 1].to),
        count: span.length, minutes: Math.max(1, Math.round(km / METRO_KMPM)),
        stops: [nameOfNode(span[0].from), ...span.map((x) => nameOfNode(x.to))],
      });
    }
    i = j + 1;
  }
  return legs;
}

/** Minutes and rupees for a leg list, on the planners' own terms. */
export function price(legs, { ac = false, holiday = false, smartcard = false } = {}) {
  let minutes = 0, fare = 0, walk = 0, walkKm = 0, km = 0, metroKm = 0, changes = 0, extra = 0;
  let prevVeh = null, prevKind = null, chainKm = 0, chainRuns = 0, chainFare = 0;
  const vehOfLeg = (l) => (l.kind === 'bus' ? `B${l.ref}` : `M${l.line}`);
  const closeChain = () => {
    if (chainRuns > 0) {
      minutes += Math.round(chainKm / METRO_KMPM) + (chainRuns - 1) * CHANGE_MIN + ACCESS_MIN;
      fare += chainFare;
      metroKm += chainKm;
      chainKm = 0; chainRuns = 0; chainFare = 0;
    }
  };
  for (const l of legs) {
    if (l.kind === 'walk') { minutes += l.min || 0; walk += l.min || 0; walkKm += l.km || 0; continue; }
    const v = vehOfLeg(l);
    if (prevVeh && prevVeh !== v) {
      changes++;
      /* a change of metro line is not a new boarding: the chain formula below
         already charges CHANGE_MIN for it, and charging twice would bury the very
         routes with interchanges that this planner exists to find */
      if (!(prevKind === 'metro' && l.kind === 'metro')) extra += BOARD_MIN;
    }
    if (l.kind === 'metro') {
      chainRuns++; chainKm += l.km || 0;
      chainFare = M.fareFor(Math.max(chainKm, 0), { holiday, smartcard });
      km += l.km || 0;
      prevVeh = v; prevKind = l.kind;
      continue;
    }
    closeChain();
    minutes += l.minutes || 0;
    /* a second bus is a second ticket: this dataset publishes no free transfer,
       so it is charged per ride and the fine print says so */
    fare += ac ? l.fareAc : l.fare;
    km += l.km || 0;
    prevVeh = v; prevKind = l.kind;
  }
  closeChain();
  minutes += extra;
  return {
    minutes: Math.round(minutes), fare, changes, km: +km.toFixed(2), metroKm: +metroKm.toFixed(2),
    walkMin: walk, walkKm: +walkKm.toFixed(2),
    rides: legs.filter((l) => l.kind !== 'walk').length,
  };
}

/* ------------------------------------------------------------ the two ends */

const ENTRIES = 6;

/**
 * The nodes a rider can start or finish at, each with the walk that reaches it.
 * Metro stations come from metro-route's own nearestStations and bus stops from
 * bus-route's nearestStops, so "8 min walk" means the same distance everywhere
 * in this app. A place that IS a station or a stop is free to enter at.
 */
function endsAt(place, wantPos = false) {
  const g = graph();
  const out = new Map();
  const put = (idStr, km) => {
    if (!(km >= 0) || km > MAX_WALK_KM) return;
    const node = g.nid.get(idStr);
    if (node == null) return;
    const min = walkMin(km);
    const cur = out.get(node);
    if (!cur || min < cur.min) out.set(node, { node, min, km: +km.toFixed(2), id: idStr });
  };
  if (place.lat == null || place.lon == null) {
    if (place.kind === 'metro' && M.isStation(place.n)) put(MID(place.n), 0);
    else for (const i of (g.byName.get(place.n) || []).slice(0, 4)) put(BID(i), 0);
    return out;
  }
  for (const s of M.nearestStations(place.lat, place.lon, ENTRIES) || []) put(MID(s.n), s.km);
  for (const s of nearestStops(place.lat, place.lon, ENTRIES * 2 + 4) || []) {
    const i = s.i != null ? s.i : (g.byName.get(s.n) || [])[0];
    if (i != null) put(BID(i), s.km);
  }
  if (place.kind === 'metro' && M.isStation(place.n)) put(MID(place.n), 0);
  if (place.kind === 'bus') for (const i of (g.byName.get(place.n) || []).slice(0, 4)) put(BID(i), 0);
  return out;
}

export const KIND_OF = (legs) => {
  const metro = legs.some((l) => l.kind === 'metro'), bus = legs.some((l) => l.kind === 'bus');
  return metro && bus ? 'Metro + Bus' : metro ? 'Metro' : 'Bus';
};
/* Two searches reaching the same station and then walking the same last stretch are
   the same journey, so the signature is the rides. Keeping the walk out of it is
   what stops "Metro, 23 min" being offered three times over. */
const sigOf = (legs) => legs.filter((l) => l.kind !== 'walk')
  .map((l) => (l.kind === 'bus' ? `B${l.ref}:${l.from}>${l.to}` : `M${l.line}:${l.from}>${l.to}`)).join('|');

const MEMO = new Map();
const MEMO_MAX = 16;

/**
 * plan(from, to, opts) → the journeys worth showing, best first.
 *
 * Four goal-directed searches over the same graph: the mixed field by minutes and
 * by money, plus a pure champion of each mode by minutes, so a mixed route has to
 * beat a pure one instead of merely being offered beside it. `value` then ranks
 * what those four found.
 *
 * @param opts.ac        price bus rides as AC
 * @param opts.holiday   opts.smartcard  handed to the DMRC slab
 * @param opts.atMin     minutes of the day for the wait model (default: now)
 * @param opts.only      'all' | 'mixed' | 'metro' | 'bus'
 */
export function plan(fromPlace, toPlace, opts = {}) {
  const key = [fromPlace?.n, toPlace?.n, fromPlace?.kind, toPlace?.kind, opts.only, opts.ac,
    opts.holiday, opts.smartcard, opts.atMin == null ? 'now' : Math.round(opts.atMin / 5) * 5].join('\u0001');
  const hit = MEMO.get(key);
  if (hit) return hit;
  const made = planSearch(fromPlace, toPlace, opts);
  MEMO.set(key, made);
  if (MEMO.size > MEMO_MAX) MEMO.delete(MEMO.keys().next().value);
  return made;
}

function planSearch(fromPlace, toPlace, opts) {
  const g = graph();
  const src = endsAt(fromPlace);
  const dst = endsAt(toPlace);
  if (!src.size || !dst.size) return { options: [], note: 'nothing is within a walk of one of those places' };
  if (fromPlace.n === toPlace.n) return { options: [], note: 'same place at both ends' };
  const targets = new Set(dst.keys());
  /* Seven exact searches instead of a wide net: each is optimal for its own metric
     and stops the moment its answer is settled (~30-200 ms each). Diversity of
     *alternatives* comes from asking the graph different questions — minutes, money,
     value, and the same for each mode alone — never from a loose bound, because a
     bound of "within 6 minutes of the best" in a dense city is the whole graph. */
  const runs = opts.only === 'metro' ? [['metro', 'min'], ['metro', 'fare'], ['metro', 'value']]
    : opts.only === 'bus' ? [['bus', 'min'], ['bus', 'fare'], ['bus', 'value']]
      : [['all', 'min'], ['all', 'fare'], ['all', 'value'],
        ['metro', 'min'], ['metro', 'fare'], ['bus', 'min'], ['bus', 'fare']];

  const found = new Map();
  let pops = 0;
  for (const [mask, obj] of runs) {
    const slack = 0;
    const run = search(src, { mask, obj, targets, exits: dst, slack,
      goal: toPlace.lat != null ? toPlace : null });
    pops += run.pops;
    for (const [node, end] of dst) {
      if (!run.settled.has(node)) continue;
      const chain = chainTo(run, node);
      if (!chain) continue;
      const legs = legsFromChain(run, chain);
      if (!legs.length || !legs.some((l) => l.kind === 'bus' || l.kind === 'metro')) continue;
      /* the search starts where the rider can walk to, which is not where they
         stand: that first walk is the first leg of the journey, not a freebie */
      const s0 = src.get(run.g.edges[chain[0]].from);
      if (s0 && s0.min > 0 && legs[0].kind !== 'walk') {
        const lab = run.g.label[run.g.edges[chain[0]].from] ?? '';
        const boardAt = lab.startsWith('m#') ? lab.slice(2) : (STOPS[+lab.slice(2)]?.n ?? lab);
        legs.unshift({ kind: 'walk', text: `Walk to ${boardAt}`, km: s0.km, min: s0.min,
          from: fromPlace.n, to: boardAt, metres: Math.round(s0.km * 1000) });
      }
      if (end.min > 0 && legs[legs.length - 1].kind !== 'walk') {
        legs.push({ kind: 'walk', text: `Walk to ${toPlace.n}`, km: end.km, min: end.min,
          from: legs[legs.length - 1]?.to ?? null, to: toPlace.n, metres: Math.round(end.km * 1000) });
      }
      const p = price(legs, opts);
      if (!(p.minutes > 0) || p.minutes > MAX_MINUTES) continue;
      if (legs.length > MAX_LEGS || p.walkMin > MAX_WALK_MIN) continue;
      const sig = sigOf(legs);
      const rec = { sig, legs, mask, obj, ...p, mix: KIND_OF(legs),
        d: run.dist.get(node * g.vehCount) ?? 0 };
      const prev = found.get(sig);
      if (!prev || rec.minutes < prev.minutes || (rec.minutes === prev.minutes && rec.fare < prev.fare)) {
        found.set(sig, rec);
      }
    }
  }

  let list = [...found.values()];
  if (opts.only === 'mixed') list = list.filter((x) => x.mix === 'Metro + Bus');
  for (const x of list) {
    const other = [...new Set(x.legs.filter((l) => l.kind === 'metro' && l.net && l.net !== 'DMRC')
      .map((l) => l.line))];
    if (other.length) {
      x.separateTicket = other;
      x.fareNote = `${other.join(' + ')} sell their own ticket — the ₹${x.fare} shown prices the DMRC `
        + 'part with the DMRC slab and the bus rides with the DTC slabs, which is all this data can say.';
    }
  }

  /* Pareto: anything slower AND dearer than a journey already found is dropped */
  list.sort((a, b) => a.minutes - b.minutes || a.fare - b.fare);
  const kept = [], dropped = [];
  for (const x of list) {
    const beaten = kept.some((k) => k.minutes <= x.minutes && k.fare <= x.fare
      && (k.minutes < x.minutes || k.fare < x.fare));
    if (beaten) dropped.push(x); else kept.push(x);
  }
  for (const x of kept) {
    x.value = +(x.minutes + x.fare / VOT_RPM).toFixed(1);
    x.detail = metroDetail(x.legs, opts.atMin);
    x.icon = null;
    x.mode = x.mix;
  }
  kept.sort((a, b) => a.value - b.value);
  return {
    options: kept, dropped: dropped.length, tried: found.size, pops,
    graphSize: g.size, graphMs: g.ms, ends: { from: src.size, to: dst.size },
  };
}

/** The published waits and the last-train guard, in the shape the journey clock reads. */
export function metroDetail(legs, atMin) {
  const rides = legs.filter((l) => l.kind === 'metro');
  if (!rides.length) return null;
  const at = (atMin != null ? atMin : minutesOfDay()) % 1440;
  const first = rides[0];
  const info = M.lineInfo(first.line, at);
  const wait = rides.map((l) => {
    const i2 = M.lineInfo(l.line, at);
    const h = i2 && i2.headway;
    return h ? { line: l.line, lo: h[0], hi: h[1], peak: i2.peak, mid: Math.round((h[0] + h[1]) / 2) } : null;
  }).filter(Boolean);
  const km = +rides.reduce((s, l) => s + (l.km || 0), 0).toFixed(2);
  const minutes = Math.round(km / METRO_KMPM) + (rides.length - 1) * CHANGE_MIN + ACCESS_MIN;
  const nextIn = wait.length ? Math.max(2, wait[0].mid) : 5;
  const board = first.stops && first.stops[0] ? first.stops[0] : first.from;
  const lt = M.lastTrainAt ? M.lastTrainAt(first.line, board, at, first.to) : null;
  const open = !info || info.open !== false;
  return {
    legs: rides.map((l) => ({ line: l.line, colour: l.colour, from: l.from, to: l.to, km: l.km,
      stops: l.stops || [l.from, l.to] })),
    line: first.line, minutes, minutesWithWait: minutes + nextIn, km,
    fare: M.fareFor(km, {}), slab: M.fareSlabOf ? M.fareSlabOf(km) : null,
    wait, nextIn, arriveMin: at + minutes + nextIn, changes: rides.length - 1,
    canMakeIt: open && (!lt || lt.ok !== false),
    lastTrain: lt ? lt.at : null, lastTrainFrom: lt ? lt.from : null, lastTrainEst: true,
    lastTrainAt: board, lastTrainToward: lt ? lt.toward : null, lastRunMin: lt ? lt.run : null,
    closed: info ? info.open === false : false,
    separateTicket: rides.filter((l) => l.net && l.net !== 'DMRC').map((l) => l.line),
  };
}
