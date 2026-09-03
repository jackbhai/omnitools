/**
 * Combined metro + bus journey planner.
 *
 * Takes any two points in Delhi and compares real options:
 *   - metro only        (289 stations, 27 interchanges, DMRC fares)
 *   - bus only          (383 routes, 1,036 stops, DTC fares)
 *   - bus → metro → bus (walk to the nearest stop/station of each mode)
 *
 * Then ranks them by FASTEST, CHEAPEST and FEWEST CHANGES so the user can see
 * the trade-off, which is what "sab tarah se dekh sake" asks for.
 * Every number comes from the same verified datasets used by the single-mode
 * planners — nothing is estimated except walking time (5 km/h, stated).
 */
import React, { useMemo, useState } from 'react';
import { useLoc } from '../core/geo';
import * as M from '../core/metro-route';
import * as B from '../core/bus-route';
import { Card, Empty, Spin } from '../ui/kit';
import { StationBuses } from './metro-planner';
import { Icon } from '../ui/icons';
import { trackOfCombo, stepsOf } from '../core/trip';
import { TripKit } from './trip-ui.jsx';

const WALK_KMH = 5;
const walkMin = (km) => Math.round((km / WALK_KMH) * 60);
const MAX_WALK_KM = 1.6;   // ~20 min; beyond this an interchange is unrealistic

/* Search across BOTH datasets so the user can type any landmark. */
function searchAll(q, limit = 8) {
  if (!q?.trim()) return [];
  const s = q.toLowerCase().trim();
  const out = [];
  for (const n of M.stationNames) {
    if (n.toLowerCase().includes(s)) out.push({ n, kind: 'metro' });
    if (out.length >= limit) break;
  }
  for (const n of B.stopNames) {
    if (out.length >= limit * 2) break;
    if (n.toLowerCase().includes(s)) out.push({ n, kind: 'bus' });
  }
  return out.slice(0, limit * 2);
}

const coordOf = (p) => {
  if (p.kind === 'metro') {
    const s = M.STATIONS.find((x) => x.n === p.n);
    return s ? { lat: s.lat, lon: s.lon } : null;
  }
  const s = B.STOPS.find((x) => x.n === p.n);
  return s ? { lat: s.lat, lon: s.lon } : null;
};

/** What the timetable says about this option at this minute. */
function TimingNote({ o }) {
  const d = o?.detail;
  if (!d) return null;
  const metro = o.mode === 'Metro' || o.mode === 'Bus + Metro';
  const lastGone = metro && d.canMakeIt === false;
  const tight = metro && d.lastTrainLeftIn != null && d.lastTrainLeftIn >= 0 && d.lastTrainLeftIn < 30;
  const busStopped = !metro && d.running === false;
  return (
    <Card>
      <div className="chead"><Icon n="clock" size={16} /> This option right now</div>
      <div className="dim sm">
        {metro
          ? <>Trains on the {d.legs?.[0]?.line} run every {d.wait?.[0] ? `${d.wait[0].lo}-${d.wait[0].hi}` : '—'} min{' '}
              {d.wait?.[0]?.peak ? 'at this hour (peak)' : 'at this hour'}, so expect to wait about {d.nextIn} min —
              about {d.minutesWithWait} min for the trip including that wait.</>
          : <>Distance measured along the route each bus drives; {d.changes ? 'two tickets, one per bus.' : 'one ticket.'}</>}
      </div>
      {lastGone && <div className="note">The last train from {d.lastTrainAt} towards {d.lastTrainFrom} has already
        left ({M.fmtTime(d.lastTrain)}). Take a bus or an auto for this one.</div>}
      {tight && <div className="note">Only {d.lastTrainLeftIn} min before the last train leaves {d.lastTrainAt}
        — leave now.</div>}
      {busStopped && <div className="note">One of these buses is outside its published service window right now;
        the first departure is shown in the bus tool.</div>}
    </Card>);
}

function buildOptions(a, b) {
  const pa = coordOf(a), pb = coordOf(b);
  if (!pa || !pb) return [];
  const out = [];

  /* ---------- metro only ---------- */
  try {
    const sA = M.nearestStations(pa.lat, pa.lon, 1)[0];
    const sB = M.nearestStations(pb.lat, pb.lon, 1)[0];
    if (sA && sB && sA.n !== sB.n && sA.km <= MAX_WALK_KM && sB.km <= MAX_WALK_KM) {
      const r = M.planRoutes(sA.n, sB.n, { k: 1 })[0];
      if (r) {
        const w = walkMin(sA.km) + walkMin(sB.km);
        out.push({
          mode: 'Metro', icon: <><Icon n="metro" size={17} /></>,
          minutes: r.minutes + w, fare: r.fare, changes: r.changes,
          km: +(r.km + sA.km + sB.km).toFixed(2), walkMin: w,
          legs: [
            ...(sA.km > 0.05 ? [{ kind: 'walk', text: `Walk to ${sA.n}`, km: +sA.km.toFixed(2), min: walkMin(sA.km) }] : []),
            ...r.legs.map((l) => ({ kind: 'metro', line: l.line, colour: l.colour,
              from: l.from, to: l.to, stops: l.stops, count: l.count, km: l.km })),
            ...(sB.km > 0.05 ? [{ kind: 'walk', text: `Walk to ${b.n}`, km: +sB.km.toFixed(2), min: walkMin(sB.km) }] : []),
          ],
          detail: r,
        });
      }
    }
  } catch { /* no metro option */ }

  /* ---------- bus only ---------- */
  try {
    const sA = B.nearestStops(pa.lat, pa.lon, 1)[0];
    const sB = B.nearestStops(pb.lat, pb.lon, 1)[0];
    if (sA && sB && sA.n !== sB.n && sA.km <= MAX_WALK_KM && sB.km <= MAX_WALK_KM) {
      const r = B.planBus(sA.n, sB.n)[0];
      if (r) {
        const w = walkMin(sA.km) + walkMin(sB.km);
        out.push({
          mode: 'Bus', icon: <><Icon n="bus" size={17} /></>,
          minutes: r.minutes + w, fare: r.fare, changes: r.changes,
          km: +(r.km + sA.km + sB.km).toFixed(2), walkMin: w,
          legs: [
            ...(sA.km > 0.05 ? [{ kind: 'walk', text: `Walk to ${sA.n}`, km: +sA.km.toFixed(2), min: walkMin(sA.km) }] : []),
            ...r.legs.map((l) => ({ kind: 'bus', ref: l.ref, from: l.from, to: l.to,
              count: l.stops, km: l.km })),
            ...(sB.km > 0.05 ? [{ kind: 'walk', text: `Walk to ${b.n}`, km: +sB.km.toFixed(2), min: walkMin(sB.km) }] : []),
          ],
          detail: r,
        });
      }
    }
  } catch { /* no bus option */ }

  /* ---------- bus feeder -> metro -> bus feeder ---------- */
  try {
    const mA = M.nearestStations(pa.lat, pa.lon, 3);
    const mB = M.nearestStations(pb.lat, pb.lon, 3);
    const startFar = mA[0] && mA[0].km > 0.8;
    const endFar = mB[0] && mB[0].km > 0.8;
    if ((startFar || endFar) && mA[0] && mB[0] && mA[0].n !== mB[0].n) {
      const core = M.planRoutes(mA[0].n, mB[0].n, { k: 1 })[0];
      if (core) {
        const legs = [];
        let mins = core.minutes, fare = core.fare, km = core.km, changes = core.changes;

        // feeder bus at the start
        if (startFar) {
          const bs = B.nearestStops(pa.lat, pa.lon, 1)[0];
          const bm = B.nearestStops(mA[0].lat, mA[0].lon, 1)[0];
          if (bs && bm && bs.n !== bm.n && bs.km <= MAX_WALK_KM) {
            try {
              const f = B.planBus(bs.n, bm.n)[0];
              if (f && f.changes === 0) {
                legs.push({ kind: 'walk', text: `Walk to ${bs.n}`, km: +bs.km.toFixed(2), min: walkMin(bs.km) });
                legs.push({ kind: 'bus', ref: f.legs[0].ref, from: f.legs[0].from, to: f.legs[0].to,
                  count: f.legs[0].stops, km: f.legs[0].km, bus: f });
                mins += f.minutes; fare += f.fare; km += f.km; changes += 1;
              }
            } catch {}
          }
        }
        legs.push(...core.legs.map((l) => ({ kind: 'metro', line: l.line, colour: l.colour,
          from: l.from, to: l.to, count: l.count, km: l.km })));

        if (endFar) {
          const bm = B.nearestStops(mB[0].lat, mB[0].lon, 1)[0];
          const be = B.nearestStops(pb.lat, pb.lon, 1)[0];
          if (bm && be && bm.n !== be.n && be.km <= MAX_WALK_KM) {
            try {
              const f = B.planBus(bm.n, be.n)[0];
              if (f && f.changes === 0) {
                legs.push({ kind: 'bus', ref: f.legs[0].ref, from: f.legs[0].from, to: f.legs[0].to,
                  count: f.legs[0].stops, km: f.legs[0].km, bus: f });
                mins += f.minutes; fare += f.fare; km += f.km; changes += 1;
              }
            } catch {}
          }
        }
        if (legs.some((l) => l.kind === 'bus')) {
          out.push({ mode: 'Bus + Metro', icon: <><Icon n="bus" size={17} /><Icon n="metro" size={17} /></>, minutes: mins, fare, changes,
            km: +km.toFixed(2), walkMin: legs.filter((l) => l.kind === 'walk')
              .reduce((s, l) => s + l.min, 0), legs, detail: core });
        }
      }
    }
  } catch { /* no combined option */ }

  return out;
}

function Picker({ label, value, onPick, onNear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchAll(q), [q]);
  return (
    <div className="fld" style={{ position: 'relative' }}><label>{label}</label><div style={{ display: 'flex', gap: 6 }}><input value={open ? q : (value?.n || '')} placeholder="Metro station or bus stop…"
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)} /><button className="btn ghost sm" style={{ flex: '0 0 auto' }}
          onMouseDown={(e) => e.preventDefault()} onClick={onNear}><Icon n="pin" size={17} /></button></div>
      {open && hits.length > 0 && (
        <div className="list" style={{ position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 40, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
          {hits.map((h, i) => (
            <button key={i} className="col" style={{ background: 'none', border: 0,
              textAlign: 'left', width: '100%', cursor: 'pointer' }}
              onMouseDown={(e) => { e.preventDefault(); onPick(h); setOpen(false); setQ(''); }}><b style={{ fontSize: 13.5 }}>{h.kind === 'metro' ? <><Icon n="metro" size={17} /></> : <><Icon n="bus" size={17} /></>} {h.n}</b></button>))}
        </div>)}
    </div>);
}

export function MultiModal() {
  const { loc } = useLoc();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [sort, setSort] = useState('fast');
  const [sel, setSel] = useState(0);

  const options = useMemo(() => {
    if (!from || !to || from.n === to.n) return null;
    const o = buildOptions(from, to);
    return o.length ? o : [];
  }, [from, to]);

  const ranked = useMemo(() => {
    if (!options?.length) return [];
    const c = [...options];
    if (sort === 'cheap') c.sort((a, b) => a.fare - b.fare || a.minutes - b.minutes);
    else if (sort === 'easy') c.sort((a, b) => a.changes - b.changes || a.minutes - b.minutes);
    else c.sort((a, b) => a.minutes - b.minutes || a.fare - b.fare);
    return c;
  }, [options, sort]);

  const o = ranked[sel] || ranked[0];
  const near = (setter, isMetro) => {
    const m = M.nearestStations(loc.lat, loc.lon, 1)[0];
    const bs = B.nearestStops(loc.lat, loc.lon, 1)[0];
    if (m && bs) setter(m.km <= bs.km ? { n: m.n, kind: 'metro' } : { n: bs.n, kind: 'bus' });
    else if (m) setter({ n: m.n, kind: 'metro' });
    else if (bs) setter({ n: bs.n, kind: 'bus' });
  };

  return (<><Picker label="From" value={from} onPick={(v) => { setFrom(v); setSel(0); }}
      onNear={() => near(setFrom)} /><div style={{ textAlign: 'center', margin: '-4px 0 4px' }}><button className="btn ghost sm" onClick={() => { const a = from; setFrom(to); setTo(a); setSel(0); }}>⇅ Swap</button></div><Picker label="To" value={to} onPick={(v) => { setTo(v); setSel(0); }}
      onNear={() => near(setTo)} />

    {(!from || !to) && <Empty t="Pick a start and destination — metro stations and bus stops both work" />}
    {options?.length === 0 && <Empty t="No metro or bus route found between these two points" />}

    {ranked.length > 0 && (<><div className="btnrow">
        {[['fast', ' Fastest'], ['cheap', ' Cheapest'], ['easy', ' Fewest changes']].map(([v, l]) => (
          <button key={v} className={`cat ${sort === v ? 'on' : ''}`}
            onClick={() => { setSort(v); setSel(0); }}>{l}</button>))}
      </div><div className="cats" style={{ marginTop: 10 }}>
        {ranked.map((x, i) => (
          <button key={i} className={`cat ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}>
            {x.icon} {x.minutes}m · ₹{x.fare}
          </button>))}
      </div><Card><div className="chead">{o.icon} {o.mode} · {from.n} → {to.n}</div><div className="g3"><div className="stat"><div className="v">{o.minutes}</div><div className="l">Minutes</div></div><div className="stat"><div className="v">₹{o.fare}</div><div className="l">Fare</div></div><div className="stat"><div className="v">{o.changes}</div><div className="l">Changes</div></div></div><div className="g2" style={{ marginTop: 8 }}><div className="stat"><div className="v">{o.km}</div><div className="l">km total</div></div><div className="stat"><div className="v">{o.walkMin}</div><div className="l">min walking</div></div></div></Card>

      <TimingNote o={o} />

      {/* comparison table */}
      {ranked.length > 1 && (
        <><div className="chead" style={{ marginTop: 14 }}>Compare all options</div><div className="list">
            {ranked.map((x, i) => (
              <button key={i} className="row" style={{ background: i === sel ? 'rgba(0,255,156,.07)' : 'none',
                border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setSel(i)}><span style={{ fontSize: 17 }}>{x.icon}</span><div className="main"><b style={{ fontSize: 13 }}>{x.mode}</b><span className="dim sm">{x.changes} change{x.changes !== 1 ? 's' : ''} · {x.km} km · {x.walkMin} min walk</span></div><div className="end"><b>{x.minutes} min</b><br /><span style={{ color: 'var(--green)', fontSize: 12 }}>₹{x.fare}</span></div></button>))}
          </div></>)}

      {o.mode === 'Metro' && <StationBuses station={from.n} />}

      {o && (() => {
        const track = trackOfCombo(o);
        return track.points.length > 1 ? (
          <Card>
            <TripKit track={track} steps={stepsOf(track)} stepsToggle={false} />
            <div className="dim sm" style={{ marginTop: 8 }}>
              The alert watches every published stop of every leg in this order, so it also
              knows when you have reached the metro station the bus leaves you at.
            </div>
          </Card>) : null;
      })()}

      <div className="chead" style={{ marginTop: 14 }}>Step by step</div><div className="list">
        {o.legs.map((l, i) => (
          <div className="col" key={i}>
            {l.kind === 'walk' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon n="walk" size={16} /><div className="main"><b style={{ fontSize: 13 }}>{l.text}</b><span className="dim sm">{l.km} km · about {l.min} min</span></div></div>
            ) : l.kind === 'metro' ? (
              <><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 12, height: 12, borderRadius: 3, flex: '0 0 auto',
                    background: l.colour || 'var(--green)' }} /><b style={{ flex: 1 }}><Icon n="metro" size={17} /> {l.line}</b><span className="tag">{l.count} stops</span></div><span className="dim sm" style={{ paddingLeft: 21 }}>{l.from} → {l.to} · {l.km} km</span></>
            ) : (
              <><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ padding: '3px 9px', borderRadius: 8, background: 'var(--s3)',
                    color: 'var(--green)', fontWeight: 800, fontSize: 12.5 }}>{l.ref}</span><b style={{ flex: 1, fontSize: 13 }}><Icon n="bus" size={17} /> Bus</b><span className="tag">{l.count} stops</span></div><span className="dim sm" style={{ paddingLeft: 4 }}>{l.from} → {l.to} · {l.km} km</span></>)}
          </div>))}
      </div><div className="src"><span className="dot" /><span>
          Metro: {M.STATIONS.length} stations on {M.LINES.length} line records, DMRC slabs and published headways.
          Bus: {B.ROUTES.length} published directions over {B.STOPS.length} physical stops, DTC slabs.
          Walking estimated at {WALK_KMH} km/h. Nothing here is a live vehicle position: the wait is the
          published headway and the bus time is the published timetable.</span></div></>)}
  </>);
}
