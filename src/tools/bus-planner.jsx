/**
 * Delhi bus journey planner + route explorer.
 * Same treatment as the metro: pick two stops, get every option with fare,
 * stop-by-stop path and the interchange marked.
 */
import React, { useMemo, useState } from 'react';
import { useLoc } from '../core/geo';
import { planBus, searchStops, isStop, routesAt, nearestStops, findRoute,
         ROUTES, STOPS, BUILT } from '../core/bus-route';
import { Card, Empty } from '../ui/kit';

function StopPicker({ label, value, onPick, onNear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchStops(q, 8), [q]);
  return (
    <div className="fld" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={open ? q : value} placeholder="Search bus stop…"
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)} />
        <button className="btn ghost sm" style={{ flex: '0 0 auto' }}
          onMouseDown={(e) => e.preventDefault()} onClick={onNear}>📍</button>
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

  const options = useMemo(() => {
    if (!isStop(from) || !isStop(to) || from === to) return null;
    try { return planBus(from, to); } catch { return null; }
  }, [from, to]);

  const o = options?.[sel];
  const useNear = (setter) => {
    const n = nearestStops(loc.lat, loc.lon, 1)[0];
    if (n) setter(n.n);
  };

  return (<>
    <StopPicker label="From" value={from} onPick={(v) => { setFrom(v); setSel(0); }}
      onNear={() => useNear(setFrom)} />
    <div style={{ textAlign: 'center', margin: '-4px 0 4px' }}>
      <button className="btn ghost sm" onClick={() => { const a = from; setFrom(to); setTo(a); setSel(0); }}>⇅ Swap</button>
    </div>
    <StopPicker label="To" value={to} onPick={(v) => { setTo(v); setSel(0); }}
      onNear={() => useNear(setTo)} />
    <div className="btnrow">
      <button className={`cat ${ac ? 'on' : ''}`} onClick={() => setAc(!ac)}>❄️ AC bus fare</button>
    </div>

    {(!from || !to) && <Empty t="Pick a start and destination stop" />}
    {from && to && !options && <Empty t="No direct or one-change bus found between these stops" />}

    {options?.length > 0 && (<>
      {options.length > 1 && (
        <div className="cats" style={{ marginTop: 12 }}>
          {options.map((x, i) => (
            <button key={i} className={`cat ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}>
              {x.changes === 0 ? `🚌 ${x.legs[0].ref}` : `${x.legs.map((l) => l.ref).join(' + ')}`}
            </button>))}
        </div>)}

      <Card>
        <div className="chead">{o.legs[0].from} → {o.legs.at(-1).to}</div>
        <div className="big gradtext">₹{ac ? o.fareAc : o.fare}</div>
        <div className="g3" style={{ marginTop: 12 }}>
          <div className="stat"><div className="v">{o.minutes}</div><div className="l">Minutes</div></div>
          <div className="stat"><div className="v">{o.stops}</div><div className="l">Stops</div></div>
          <div className="stat"><div className="v">{o.changes}</div><div className="l">Changes</div></div>
        </div>
        <div className="g2" style={{ marginTop: 8 }}>
          <div className="stat"><div className="v">{o.km}</div><div className="l">km</div></div>
          <div className="stat"><div className="v">₹{ac ? o.fare : o.fareAc}</div>
            <div className="l">{ac ? 'Non-AC' : 'AC bus'}</div></div>
        </div>
        <div className="src"><span className="dot" />
          <span>Women travel free on DTC &amp; cluster buses with the pink ticket.</span></div>
      </Card>

      <div className="chead" style={{ marginTop: 16 }}>Your journey</div>
      <div className="list">
        {o.legs.map((leg, i) => (
          <div className="col" key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--s3)',
                color: 'var(--green)', fontWeight: 800, fontSize: 13, flex: '0 0 auto' }}>{leg.ref}</span>
              <span className="dim sm" style={{ flex: 1 }}>{leg.dir}</span>
              <span className="tag">{leg.stops} stops</span>
            </div>
            <div style={{ marginTop: 6, paddingLeft: 4 }}>
              <div style={{ fontSize: 13.5 }}><b>{leg.from}</b></div>
              <div className="dim sm" style={{ margin: '3px 0' }}>↓ {leg.km} km</div>
              <div style={{ fontSize: 13.5 }}><b>{leg.to}</b></div>
            </div>
            {i < o.legs.length - 1 && (
              <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 9,
                background: 'rgba(255,209,102,.1)', border: '1px solid rgba(255,209,102,.28)' }}>
                <span style={{ color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}>
                  🔄 Change at {leg.to}</span>
              </div>)}
          </div>))}
      </div>

      <button className="btn ghost" style={{ width: '100%', marginTop: 12 }}
        onClick={() => setExpand(!expand)}>
        {expand ? '▲ Hide' : '▼ Show'} every stop
      </button>
      {expand && o.legs.map((leg, li) => (
        <div key={li}>
          <div className="chead" style={{ marginTop: 10 }}>Bus {leg.ref}</div>
          <div className="list">
            {leg.path.map((s, i) => (
              <div className="row" key={i} style={{ padding: '8px 14px' }}>
                <span style={{ width: 20, textAlign: 'center', flex: '0 0 auto',
                  color: i === 0 || i === leg.path.length - 1 ? 'var(--green)' : 'var(--fg3)' }}>
                  {i === 0 || i === leg.path.length - 1 ? '◉' : '•'}</span>
                <div className="main"><b style={{ fontSize: 12.5 }}>{s}</b></div>
                <span className="dim sm">{i}</span>
              </div>))}
          </div>
        </div>))}

      <div className="src"><span className="dot" />
        <span>{ROUTES.length} routes · {STOPS.length} stops from OpenStreetMap (built {BUILT}).
          DTC fare slabs: non-AC ₹5/10/15, AC ₹10/15/20/25.</span></div>
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
      <div className="chead">📍 Bus stops near you</div>
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
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Route number or terminal, e.g. 764" />
    </div>

    <div className="list">
      {list.map((r, i) => (
        <div key={i}>
          <button className="col" style={{ background: 'none', border: 0, width: '100%',
            textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setOpen(open === i ? null : i)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ minWidth: 54, padding: '4px 8px', borderRadius: 8, textAlign: 'center',
                background: 'var(--s3)', color: 'var(--green)', fontWeight: 800, fontSize: 12.5 }}>
                {r.r}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 12.5, display: 'block' }}>{r.f} → {r.t}</b>
                <span className="dim sm">{r.s.length} stops{r.o ? ` · ${r.o}` : ''}</span>
              </div>
              <span className="dim">{open === i ? '▲' : '▼'}</span>
            </div>
          </button>
          {open === i && (
            <div style={{ padding: '0 14px 12px' }}>
              {r.s.map((s, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
                  <span className="dim" style={{ width: 22 }}>{j + 1}</span>
                  <span>{s}</span>
                </div>))}
            </div>)}
        </div>))}
    </div>
  </>);
}
