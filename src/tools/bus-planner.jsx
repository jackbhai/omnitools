/**
 * Delhi bus: journey planner, route explorer and fare table.
 *
 * FARE CORRECTNESS (the user reported the fares looked wrong — they were):
 *   · Distance now uses the ROAD distance, not the crow-flies sum of stops.
 *     Offline it is the straight line x 1.28 (the median ratio measured
 *     against OSRM on real Delhi journeys); online the exact figure is
 *     fetched from OSRM and the fare is recomputed.
 *   · A journey with a change is TWO tickets, so the fares are added. The
 *     old code charged a single fare for the whole trip, which was too low.
 *   · The underlying stop data was rebuilt: stops that merely share a name
 *     are no longer merged into one point, which had inflated distances.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLoc } from '../core/geo';
import { planBus, searchStops, isStop, routesAt, nearestStops, refineFare,
         fareSlab, busFare, childFare, feederFare, PASSES, ROAD_FACTOR,
         ROUTES, STOPS, BUILT, nameOf, routeStops } from '../core/bus-route';
import { Card, Empty } from '../ui/kit';
import { Icon } from '../ui/icons';

function StopPicker({ label, value, onPick, onNear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchStops(q, 8), [q]);
  return (
    <div className="fld" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <div className="ip-wrap" style={{ flex: 1 }}>
          <Icon n="search" size={16} />
          <input value={open ? q : value} placeholder="Search bus stop…"
            onFocus={() => { setOpen(true); setQ(''); }}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 180)} />
        </div>
        <button className="btn ghost sm" style={{ flex: '0 0 auto' }} title="Nearest stop"
          onMouseDown={(e) => e.preventDefault()} onClick={onNear}><Icon n="pin" size={17} /></button>
      </div>
      {open && hits.length > 0 && (
        <div className="list" style={{ position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 40, marginTop: 4, maxHeight: 250, overflowY: 'auto' }}>
          {hits.map((h) => (
            <button key={h} className="col" style={{ background: 'none', border: 0,
              textAlign: 'left', width: '100%', cursor: 'pointer' }}
              onMouseDown={(e) => { e.preventDefault(); onPick(h); setOpen(false); setQ(''); }}>
              <b style={{ fontSize: 13.5 }}>{h}</b>
              <span className="dim sm">{routesAt(h).length} routes</span>
            </button>))}
        </div>)}
    </div>);
}

export function BusPlanner() {
  const { loc } = useLoc();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sel, setSel] = useState(0);
  const [expand, setExpand] = useState(false);
  const [ac, setAc] = useState(false);
  const [exact, setExact] = useState(null);     // refined copy of the options
  const [refining, setRefining] = useState(false);

  const base = useMemo(() => {
    if (!isStop(from) || !isStop(to) || from === to) return null;
    try { return planBus(from, to); } catch { return null; }
  }, [from, to]);

  /* Fetch the exact road distance for the shown options, then recompute the
     fare from it. Estimates are shown instantly so nothing ever blocks. */
  useEffect(() => {
    setExact(null);
    if (!base?.length) return;
    let live = true;
    setRefining(true);
    (async () => {
      const copies = base.slice(0, 3).map((o) => JSON.parse(JSON.stringify(o)));
      const done = await Promise.all(copies.map((o) => refineFare(o).catch(() => null)));
      if (!live) return;
      setExact(done.map((d, i) => d || base[i]));
      setRefining(false);
    })();
    return () => { live = false; };
  }, [base]);

  const options = exact && exact.length ? [...exact, ...base.slice(exact.length)] : base;
  const o = options?.[sel];
  const useNear = (setter) => {
    const n = nearestStops(loc.lat, loc.lon, 1)[0];
    if (n) setter(n.n);
  };
  const km = o ? (o.exact ? o.roadKm : o.estKm) : 0;
  const slab = o ? fareSlab(km, ac) : null;

  return (<>
    <StopPicker label="From" value={from} onPick={(v) => { setFrom(v); setSel(0); }}
      onNear={() => useNear(setFrom)} />
    <div style={{ textAlign: 'center', margin: '-4px 0 4px' }}>
      <button className="btn ghost sm" onClick={() => { const a = from; setFrom(to); setTo(a); setSel(0); }}>
        <Icon n="swap" size={15} /> Swap</button>
    </div>
    <StopPicker label="To" value={to} onPick={(v) => { setTo(v); setSel(0); }}
      onNear={() => useNear(setTo)} />
    <div className="btnrow">
      <button className={`cat ${!ac ? 'on' : ''}`} onClick={() => setAc(false)}>Non-AC</button>
      <button className={`cat ${ac ? 'on' : ''}`} onClick={() => setAc(true)}>AC bus</button>
    </div>

    {(!from || !to) && <Empty t="Pick a start and destination stop" />}
    {from && to && !options && <Empty t="No direct or one-change bus found between these stops" />}

    {options?.length > 0 && (<>
      {options.length > 1 && (
        <div className="cats" style={{ marginTop: 12 }}>
          {options.map((x, i) => (
            <button key={i} className={`cat ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}>
              {x.legs.map((l) => l.ref).join(' + ')}
            </button>))}
        </div>)}

      <Card>
        <div className="chead">{o.legs[0].from} → {o.legs.at(-1).to}</div>
        <div className="big gradtext">₹{ac ? o.fareAc : o.fare}</div>
        <div className="dim sm" style={{ marginTop: -4 }}>
          {o.changes > 0
            ? `${o.legs.map((l) => `₹${ac ? l.fareAc : l.fare}`).join(' + ')} — one ticket per bus`
            : 'single ticket'}
          {' · '}child ₹{o.fareChild}
        </div>

        <div className="g3" style={{ marginTop: 12 }}>
          <div className="stat"><div className="v">{o.minutes}</div><div className="l">Minutes</div></div>
          <div className="stat"><div className="v">{o.stops}</div><div className="l">Stops</div></div>
          <div className="stat"><div className="v">{o.changes}</div><div className="l">Changes</div></div>
        </div>
        <div className="g2" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="v">{km.toFixed(1)}</div>
            <div className="l">km {o.exact ? 'by road' : 'estimated'}</div>
          </div>
          <div className="stat"><div className="v">₹{ac ? o.fare : o.fareAc}</div>
            <div className="l">{ac ? 'Non-AC' : 'AC bus'}</div></div>
        </div>

        {slab?.nextAt && (
          <div className="note">
            This journey is in the {slab.lo}–{slab.hi} km slab. The fare rises past {slab.nextAt} km.
          </div>)}

        <div className="src"><span className="dot" />
          <span>{o.exact
            ? 'Distance measured along the actual road route (OSRM), so the slab is exact.'
            : refining
              ? 'Showing an estimate — measuring the exact road distance…'
              : `Estimated as straight line × ${ROAD_FACTOR} (measured median for Delhi).`}
          {' '}Women travel free on DTC &amp; cluster buses with the pink ticket.</span></div>
      </Card>

      <div className="chead" style={{ marginTop: 16 }}>Your journey</div>
      <div className="list">
        {o.legs.map((leg, i) => (
          <div className="col" key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="busref">{leg.ref}</span>
              <span className="dim sm" style={{ flex: 1 }}>{leg.dir}</span>
              <span className="tag">₹{ac ? leg.fareAc : leg.fare}</span>
            </div>
            <div style={{ marginTop: 6, paddingLeft: 4 }}>
              <div style={{ fontSize: 13.5 }}><b>{leg.from}</b></div>
              <div className="dim sm" style={{ margin: '3px 0' }}>
                ↓ {(leg.roadKm ?? leg.estKm).toFixed(1)} km · {leg.stops} stops
              </div>
              <div style={{ fontSize: 13.5 }}><b>{leg.to}</b></div>
            </div>
            {i < o.legs.length - 1 && (
              <div className="changebar">
                <Icon n="swap" size={15} /> Change at {leg.to} — buy a new ticket
              </div>)}
          </div>))}
      </div>

      <button className="btn ghost" style={{ width: '100%', marginTop: 12 }}
        onClick={() => setExpand(!expand)}>
        <Icon n="list" size={16} /> {expand ? 'Hide' : 'Show'} every stop
      </button>
      {expand && o.legs.map((leg, li) => (
        <div key={li}>
          <div className="chead" style={{ marginTop: 10 }}>Bus {leg.ref}</div>
          <div className="list">
            {(leg.names || leg.path).map((s, i, arr) => (
              <div className="row" key={i} style={{ padding: '8px 14px' }}>
                <span style={{ width: 20, textAlign: 'center', flex: '0 0 auto',
                  color: i === 0 || i === arr.length - 1 ? 'var(--green)' : 'var(--fg3)' }}>
                  {i === 0 || i === arr.length - 1 ? '◉' : '•'}</span>
                <div className="main"><b style={{ fontSize: 12.5 }}>{s}</b></div>
                <span className="dim sm">{i}</span>
              </div>))}
          </div>
        </div>))}

      <div className="src"><span className="dot" />
        <span>{ROUTES.length} routes · {STOPS.length} physical stops from OpenStreetMap (built {BUILT}).</span></div>
    </>)}
  </>);
}

/* ------------------------------------------------------------ route explorer */
export function BusRoutesList() {
  const { loc } = useLoc();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const near = useMemo(() => nearestStops(loc.lat, loc.lon, 4), [loc.lat, loc.lon]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return ROUTES.slice(0, 60);
    return ROUTES.filter((r) =>
      r.r.toLowerCase().includes(s) || r.f.toLowerCase().includes(s) ||
      r.t.toLowerCase().includes(s)).slice(0, 60);
  }, [q]);

  return (<>
    <Card>
      <div className="chead"><Icon n="pin" size={16} /> Bus stops near you</div>
      {near.map((s) => (
        <div className="kv" key={s.n}>
          <span>{s.n}</span>
          <b style={{ color: 'var(--green)' }}>
            {s.km < 1 ? `${Math.round(s.km * 1000)} m` : `${s.km.toFixed(1)} km`}
            <span className="dim sm" style={{ marginLeft: 6, fontWeight: 400 }}>
              {routesAt(s.n).length} routes</span>
          </b>
        </div>))}
    </Card>

    <div className="fld" style={{ marginTop: 14 }}>
      <label>Search {ROUTES.length} routes</label>
      <div className="ip-wrap">
        <Icon n="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Route number or terminal, e.g. 764" />
      </div>
    </div>

    <div className="list">
      {list.map((r, i) => (
        <div key={i}>
          <button className="col" style={{ background: 'none', border: 0, width: '100%',
            textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setOpen(open === i ? null : i)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="busref">{r.r}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 12.5, display: 'block' }}>{r.f} → {r.t}</b>
                <span className="dim sm">{r.s.length} stops{r.o ? ` · ${r.o}` : ''}</span>
              </div>
              <Icon n="chevron" size={15} style={{ opacity: .5, transform: open === i ? 'rotate(90deg)' : '' }} />
            </div>
          </button>
          {open === i && (
            <div style={{ padding: '0 14px 12px' }}>
              {routeStops(r).map((s, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
                  <span className="dim" style={{ width: 22 }}>{j + 1}</span>
                  <span>{s}</span>
                </div>))}
            </div>)}
        </div>))}
    </div>
  </>);
}

/* ---------------------------------------------------------------- fares tab */
export function BusFares() {
  const [km, setKm] = useState(8);
  return (<>
    <Card>
      <div className="chead"><Icon n="fare" size={16} /> Fare for a distance</div>
      <div className="fld">
        <label>Distance travelled: <b style={{ color: 'var(--green)' }}>{km} km</b></label>
        <input type="range" min="1" max="40" value={km} onChange={(e) => setKm(+e.target.value)} />
      </div>
      <div className="g3">
        <div className="stat"><div className="v">₹{busFare(km)}</div><div className="l">Non-AC</div></div>
        <div className="stat"><div className="v">₹{busFare(km, true)}</div><div className="l">AC</div></div>
        <div className="stat"><div className="v">₹{childFare(km)}</div><div className="l">Child 5-12</div></div>
      </div>
      <div className="g2" style={{ marginTop: 8 }}>
        <div className="stat"><div className="v">₹{feederFare(km)}</div><div className="l">Metro feeder</div></div>
        <div className="stat"><div className="v">FREE</div><div className="l">Women (pink ticket)</div></div>
      </div>
    </Card>

    <Card>
      <div className="chead">Official slabs</div>
      <div className="chead sm" style={{ marginTop: 4 }}>Ordinary (green / orange)</div>
      <div className="kv"><span>Up to 4 km</span><b>₹5</b></div>
      <div className="kv"><span>4 – 10 km</span><b>₹10</b></div>
      <div className="kv"><span>Above 10 km</span><b>₹15</b></div>
      <div className="chead sm" style={{ marginTop: 12 }}>Air-conditioned (red)</div>
      <div className="kv"><span>Up to 4 km</span><b>₹10</b></div>
      <div className="kv"><span>4 – 8 km</span><b>₹15</b></div>
      <div className="kv"><span>8 – 12 km</span><b>₹20</b></div>
      <div className="kv"><span>Above 12 km / night</span><b>₹25</b></div>
      <div className="chead sm" style={{ marginTop: 12 }}>DMRC metro feeder</div>
      <div className="kv"><span>Up to 8 km</span><b>₹7</b></div>
      <div className="kv"><span>Above 8 km</span><b>₹10</b></div>
    </Card>

    <Card>
      <div className="chead"><Icon n="ticket" size={16} /> Passes</div>
      {[['Day pass (Green Card)', PASSES.daily], ['Weekly', PASSES.weekly],
        ['Monthly', PASSES.monthly], ['Quarterly', PASSES.quarterly],
        ['Yearly', PASSES.yearly], ['Senior citizen (monthly)', PASSES.seniorMonthly],
        ['Student all-route (monthly)', PASSES.studentAllRoute]].map(([n, [a, b]]) => (
        <div className="kv" key={n}><span>{n}</span><b>₹{a} <span className="dim sm">/ ₹{b} AC</span></b></div>))}
      <div className="src"><span className="dot" />
        <span>Source: Delhi Tourism transport listing and the DTC pass portal.
          The Green Card is not valid on Palam Coach, tourist or express services.</span></div>
    </Card>
  </>);
}
