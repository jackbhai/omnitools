/**
 * City bus for Bengaluru, Mumbai, Pune and Ahmedabad, from community GTFS
 * feeds converted to the same shard schema as the Delhi dataset, so the
 * one bus engine (core/bus-route.js) plans all five cities.  Selecting a
 * city installs its dataset into the engine; selecting Delhi reinstalls
 * the Delhi dataset before the Delhi tabs render, so no tab ever reads
 * another city's data.
 *
 * The feeds publish stops, routes and timetables but no usable fare
 * table — fares are therefore not shown for these cities (the engine's
 * Delhi slab fallback is never displayed against another city's data).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Spin, Err, Search, Card } from '../ui/kit';
import { Icon } from '../ui/icons';
import { transitManifestBus, busCityData, dataUrl } from '../core/bigdata';
import {
  initBusData, searchStops, planBus, searchRoutes, routeStops, serviceWindow,
  nextDepartures, routeLength, fmtTime, ROUTES,
} from '../core/bus-route';

let installed = 'none';   // which dataset the engine currently holds

async function offlineReady(file) {
  try {
    const c = await caches.open('omni-data-v1');
    return !!(await c.match(dataUrl(file)));
  } catch { return false; }
}

export function CityBusHub({ children }) {
  const [man, setMan] = useState(null);
  const [city, setCity] = useState('delhi');
  const [restoring, setRestoring] = useState(false);
  const [ready, setReady] = useState({});
  useEffect(() => {
    transitManifestBus().then((m) => {
      setMan(m);
      m.forEach((c) => offlineReady(c.file).then((ok) =>
        setReady((r) => ({ ...r, [c.id]: ok }))));
    }).catch(() => setMan([]));
  }, []);
  const pick = (id) => {
    if (id === 'delhi' && installed !== 'none' && installed !== 'delhi') {
      setRestoring(true);
      busCityData('delhi').then((j) => { initBusData(j); installed = 'delhi'; setRestoring(false); })
        .catch(() => setRestoring(false));
    }
    setCity(id);
  };
  const meta = (man || []).find((c) => c.id === city);
  return (<>
    <div className="cats" style={{ marginBottom: 10 }}>
      <button className={`cat ${city === 'delhi' ? 'on' : ''}`} onClick={() => pick('delhi')}>
        Delhi</button>
      {(man || []).map((c) => (
        <button key={c.id} className={`cat ${city === c.id ? 'on' : ''}`} onClick={() => pick(c.id)}>
          {c.name}{ready[c.id] ? ' · offline' : ''}</button>))}
    </div>
    {city === 'delhi'
      ? (restoring ? <Spin t="Loading Delhi data" /> : children)
      : meta && <BusCityView key={meta.id} meta={meta}
          onReady={() => setReady((r) => ({ ...r, [meta.id]: true }))} />}
  </>);
}

function StopPicker({ label, value, onPick }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => (open && q.trim() ? searchStops(q, 7) : []), [q, open]);
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div className="dim sm">{label}</div>
      <input className="inp" value={q} placeholder="Bus stop name"
        onChange={(e) => { setQ(e.target.value); setOpen(true); onPick(null); }}
        onFocus={() => setOpen(true)} />
      {open && sugg.length > 0 && (
        <div className="list" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0,
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }}>
          {sugg.map((n) => (
            <button className="row" key={n} onClick={() => { setQ(n); onPick(n); setOpen(false); }}>
              <span><Icon n="bus" size={15} /></span>
              <div className="main"><b>{n}</b></div>
            </button>))}
        </div>)}
    </div>);
}

function BusCityView({ meta, onReady }) {
  const [shard, setShard] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('plan');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState(null);
  const [rq, setRq] = useState('');
  const [openRoute, setOpenRoute] = useState(null);
  useEffect(() => {
    busCityData(meta.id).then((j) => { initBusData(j); installed = meta.id; setShard(j); onReady(); })
      .catch((e) => setErr(e));
  }, [meta.id]);
  if (err) return <Err error={err} retry={() => location.reload()} />;
  if (!shard) return <Spin t={`Loading ${meta.name} bus data (${meta.kb} KB)`} />;
  const st = shard.stats;
  const doPlan = () => {
    setPlanErr(null);
    try { setPlan(planBus(from, to)); }
    catch (e) { setPlan(null); setPlanErr(e.message); }
  };
  const routes = tab === 'routes' ? searchRoutes(rq, 80) : [];
  return (<>
    <Card>
      <div className="chead"><Icon n="bus" size={17} /> {meta.name} Bus · {meta.agency}
        <span className="dim sm" style={{ marginLeft: 'auto' }}>
          {st.unique_route_numbers.toLocaleString('en-IN')} routes · {st.physical_stops.toLocaleString('en-IN')} stops</span></div>
      <div className="cats">
        {[['plan', 'Plan trip'], ['routes', 'Routes']].map(([id, n]) => (
          <button key={id} className={`cat ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{n}</button>))}
      </div>

      {tab === 'plan' && (<>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <StopPicker label="From" value={from} onPick={setFrom} />
          <StopPicker label="To" value={to} onPick={setTo} />
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={!from || !to} onClick={doPlan}>
          Plan trip</button>
        {planErr && <div className="dim" style={{ marginTop: 8 }}>{planErr}</div>}
        {plan && plan.length === 0 && <div className="dim" style={{ marginTop: 8 }}>
          No direct or one-change bus route found between these stops.</div>}
        {plan && plan.map((o, i) => {
          const first = o.legs[0];
          const nd = first ? nextDepartures(ROUTES[first.ri]) : null;
          return (
            <div key={i} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span><b>{o.stops}</b> stops</span>
                <span><b>{o.km} km</b></span>
                <span><b>{o.changes}</b> change{o.changes === 1 ? '' : 's'}</span>
                {nd && nd.labels.length > 0 && (
                  <span className="dim sm">next from origin: {nd.labels.join(' · ')}</span>)}
              </div>
              {o.legs.map((leg, j) => (
                <div key={j} style={{ marginTop: 8 }}>
                  <span className="tag">{leg.ref}</span>{' '}
                  <b>{leg.from}</b> → <b>{leg.to}</b>
                  <div className="dim sm" style={{ marginTop: 2 }}>
                    {leg.dir} · {leg.stops} stops · {leg.km} km
                    {leg.first != null && <> · first {fmtTime(leg.first)} · last {fmtTime(leg.last)}</>}
                  </div>
                  {j < o.legs.length - 1 && (
                    <div className="dim sm" style={{ marginTop: 4 }}>
                      Change at <b style={{ color: 'var(--text)' }}>{o.interchange}</b></div>)}
                </div>))}
            </div>);
        })}
        <div className="dim sm" style={{ marginTop: 10 }}>
          Departures are this feed's published timetable. The feed publishes no usable fare
          table, so fares are not shown for {meta.name}.
        </div>
      </>)}

      {tab === 'routes' && (<>
        <Search value={rq} onChange={setRq} ph="Route number or terminal…" />
        <div className="list" style={{ marginTop: 8 }}>
          {routes.map((r) => {
            const ri = ROUTES.indexOf(r);
            const win = serviceWindow(r);
            const open = openRoute === ri;
            return (
              <div key={ri}>
                <button className="row" style={{ width: '100%' }}
                  onClick={() => setOpenRoute(open ? null : ri)}>
                  <span className="tag">{r.r}</span>
                  <div className="main"><b>{r.f} → {r.t}</b>
                    <span className="dim sm">{r.o} · {r.s.length} stops · {routeLength(r)} km
                      {win ? ` · ${fmtTime(win[0])}–${fmtTime(win[1])}` : ''}</span></div>
                </button>
                {open && (
                  <div className="dim sm" style={{ margin: '4px 0 8px 14px', lineHeight: 1.8 }}>
                    {routeStops(r).map((n, j) => (
                      <span key={j}>{j > 0 && ' → '}<span style={j === 0 || j === r.s.length - 1
                        ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{n}</span></span>))}
                    {r.tt?.d?.length > 0 && (
                      <div>{r.tt.d.length} scheduled departures a day in this direction.</div>)}
                  </div>)}
              </div>);
          })}
        </div>
      </>)}
    </Card>
    <div className="dim sm" style={{ marginTop: 8 }}>
      Source: {shard.source}. Converted {shard.built}. {shard.note}
    </div>
  </>);
}
