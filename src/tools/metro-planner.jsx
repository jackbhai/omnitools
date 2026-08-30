/**
 * Delhi Metro journey planner UI — "kahan se kahan jana hai" with fare,
 * every interchange, all stations en route, and multiple route options.
 */
import React, { useMemo, useState } from 'react';
import { useLoc } from '../core/geo';
import { planRoutes, searchStations, nearestStations, isStation, STATIONS, LINES, BUILT }
  from '../core/metro-route';
import { Card, Empty } from '../ui/kit';
import { Icon } from '../ui/icons';

function Picker({ label, value, onPick, placeholder, nearBtn, onNear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchStations(q, 8), [q]);
  return (
    <div className="fld" style={{ position: 'relative' }}><label>{label}</label><div style={{ display: 'flex', gap: 6 }}><input
          value={open ? q : value}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
        {nearBtn && <button className="btn ghost sm" style={{ flex: '0 0 auto' }}
          onMouseDown={(e) => e.preventDefault()} onClick={onNear}><Icon n="pin" size={17} /></button>}
      </div>
      {open && hits.length > 0 && (
        <div className="list" style={{ position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 40, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
          {hits.map((h) => {
            const st = STATIONS.find((s) => s.n === h);
            return (
              <button key={h} className="col" style={{ background: 'none', border: 0,
                textAlign: 'left', width: '100%', cursor: 'pointer' }}
                onMouseDown={(e) => { e.preventDefault(); onPick(h); setOpen(false); setQ(''); }}><b style={{ fontSize: 13.5 }}>{h}</b><span className="dim sm">{st?.l.join(' · ')}</span></button>);
          })}
        </div>)}
    </div>);
}

export function MetroPlanner() {
  const { loc } = useLoc();
  const [from, setFrom] = useState('Rajiv Chowk');
  const [to, setTo] = useState('Hauz Khas');
  const [holiday, setHoliday] = useState(false);
  const [smart, setSmart] = useState(false);
  const [sel, setSel] = useState(0);
  const [expand, setExpand] = useState(false);

  const routes = useMemo(() => {
    if (!isStation(from) || !isStation(to) || from === to) return null;
    try { return planRoutes(from, to, { holiday, smartcard: smart, k: 4 }); }
    catch { return null; }
  }, [from, to, holiday, smart]);

  const r = routes?.[sel];
  const useNear = (setter) => {
    const n = nearestStations(loc.lat, loc.lon, 1)[0];
    if (n) setter(n.n);
  };

  return (<><Picker label="From" value={from} onPick={(v) => { setFrom(v); setSel(0); }}
      placeholder="Search station…" nearBtn onNear={() => useNear(setFrom)} /><div style={{ textAlign: 'center', margin: '-4px 0 4px' }}><button className="btn ghost sm" onClick={() => { const a = from; setFrom(to); setTo(a); setSel(0); }}>⇅ Swap</button></div><Picker label="To" value={to} onPick={(v) => { setTo(v); setSel(0); }}
      placeholder="Search station…" nearBtn onNear={() => useNear(setTo)} /><div className="btnrow"><button className={`cat ${smart ? 'on' : ''}`} onClick={() => setSmart(!smart)}> Smart card</button><button className={`cat ${holiday ? 'on' : ''}`} onClick={() => setHoliday(!holiday)}><Icon n="sparkle" size={17} /> Sunday/holiday</button></div>

    {!routes && <Empty t={from === to ? 'Pick two different stations' : 'Pick both stations'} />}

    {routes && (<>
      {routes.length > 1 && (
        <div className="cats" style={{ marginTop: 12 }}>
          {routes.map((x, i) => (
            <button key={i} className={`cat ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}>
              {i === 0 ? ' Fastest' : x.changes === 0 ? <><Icon n="train" size={17} /> Direct</> : `${x.changes} change${x.changes > 1 ? 's' : ''}`}
              {' · '}{x.minutes}m
            </button>))}
        </div>)}

      <Card><div className="chead">{r.from} → {r.to}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><div className="big gradtext">₹{r.fare}</div>
          {smart && <span className="dim sm">smart-card price</span>}
        </div><div className="g3" style={{ marginTop: 12 }}><div className="stat"><div className="v">{r.minutes}</div><div className="l">Minutes</div></div><div className="stat"><div className="v">{r.stations}</div><div className="l">Stations</div></div><div className="stat"><div className="v">{r.changes}</div><div className="l">Changes</div></div></div><div className="g2" style={{ marginTop: 8 }}><div className="stat"><div className="v">{r.km}</div><div className="l">km</div></div><div className="stat"><div className="v">₹{r.fareSmart}</div><div className="l">With smart card</div></div></div></Card>

      {/* journey legs */}
      <div className="chead" style={{ marginTop: 16 }}>Your journey</div><div className="list">
        {r.legs.map((leg, i) => (
          <div className="col" key={i}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 12, height: 12, borderRadius: 3, flex: '0 0 auto',
                background: leg.colour || 'var(--green)' }} /><b style={{ flex: 1 }}>{leg.line}</b><span className="tag">{leg.count} stops</span></div><div style={{ marginTop: 6, paddingLeft: 21 }}><div style={{ fontSize: 13.5 }}><b>{leg.from}</b></div><div className="dim sm" style={{ margin: '3px 0' }}>↓ {leg.km} km</div><div style={{ fontSize: 13.5 }}><b>{leg.to}</b></div></div>
            {i < r.legs.length - 1 && (
              <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 9,
                background: 'rgba(255,209,102,.1)', border: '1px solid rgba(255,209,102,.28)' }}><span style={{ color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}><Icon n="refresh" size={15} /> Change at {leg.to}</span></div>)}
          </div>))}
      </div>

      {/* every station */}
      <button className="btn ghost" style={{ width: '100%', marginTop: 12 }}
        onClick={() => setExpand(!expand)}>
        {expand ? '▲ Hide' : '▼ Show'} all {r.stations + 1} stations
      </button>
      {expand && (
        <div className="list" style={{ marginTop: 8 }}>
          {r.path.map((n, i) => {
            const isChange = r.interchanges.includes(n);
            const isEnd = i === 0 || i === r.path.length - 1;
            return (
              <div className="row" key={i} style={{ padding: '9px 14px' }}><span style={{ width: 22, textAlign: 'center', flex: '0 0 auto',
                  color: isEnd ? 'var(--green)' : isChange ? 'var(--warn)' : 'var(--fg3)',
                  fontSize: isEnd ? 13 : 11 }}>
                  {isEnd ? '◉' : isChange ? <><Icon n="refresh" size={15} /></> : '•'}</span><div className="main"><b style={{ fontSize: 13, color: isChange ? 'var(--warn)' : '' }}>{n}</b>
                  {isChange && <span className="dim sm">interchange</span>}
                </div><span className="dim sm">{i}</span></div>);
          })}
        </div>)}

      <div className="src"><span className="dot" /><span>Route from OpenStreetMap DMRC data ({STATIONS.length} stations, {LINES.length} line
          branches, built {BUILT}). Fares are the official DMRC slabs effective 25 Aug 2025.</span></div></>)}
  </>);
}

/* ------------------------------------------------------------- network map */
export function MetroNetwork() {
  const { loc } = useLoc();
  const [q, setQ] = useState('');
  const near = useMemo(() => nearestStations(loc.lat, loc.lon, 3), [loc.lat, loc.lon]);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return STATIONS.filter((x) => !s || x.n.toLowerCase().includes(s))
      .sort((a, b) => a.n.localeCompare(b.n));
  }, [q]);
  return (<><Card><div className="chead"><Icon n="pin" size={17} /> Nearest to you</div>
      {near.map((s) => (
        <div className="kv" key={s.n}><span>{s.n}</span><b style={{ color: 'var(--green)' }}>{s.km < 1 ? `${Math.round(s.km * 1000)} m` : `${s.km.toFixed(1)} km`}</b></div>))}
    </Card><div className="chead" style={{ marginTop: 14 }}>Lines ({LINES.length})</div><div className="list">
      {LINES.map((L, i) => (
        <div className="row" key={i}><span style={{ width: 12, height: 12, borderRadius: 3, background: L.c, flex: '0 0 auto' }} /><div className="main"><b>{L.n}</b><span className="dim sm">{L.s[0]} → {L.s[L.s.length - 1]}</span></div><span className="tag">{L.s.length}</span></div>))}
    </div><div className="fld" style={{ marginTop: 14 }}><label>All {STATIONS.length} stations</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search station…" /></div><div className="list">
      {list.slice(0, 80).map((s) => (
        <a className="row" key={s.n} target="_blank" rel="noreferrer"
          href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`}><div className="main"><b style={{ fontSize: 13 }}>{s.n}</b><span className="dim sm">{s.l.join(' · ')}</span></div>
          {s.l.length > 1 && <span className="tag w"><Icon n="refresh" size={15} /> {s.l.length}</span>}
        </a>))}
    </div></>);
}
