/**
 * Metro networks for 12 more Indian cities, as offline shards.
 *
 * Each city's data (lines, stations in order, interchanges) is built from
 * OpenStreetMap route relations and cross-checked against the system's
 * published line/station tables — see the shard's `source`.  A city is a
 * small file (1–10 KB) fetched on first open and kept by the service
 * worker, so planning works fully offline afterwards.  These networks
 * publish no fares or timetables in the sources used, so none are shown;
 * travel time is an estimate from distance and is labelled as one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Spin, Err, Search, Card } from '../ui/kit';
import { Icon } from '../ui/icons';
import { transitManifestMetro, metroCityData, dataUrl } from '../core/bigdata';
import { planCityMetro, searchCityStations, cityIndex } from '../core/metro-city';

async function offlineReady(file) {
  try {
    const c = await caches.open('omni-data-v1');
    return !!(await c.match(dataUrl(file)));
  } catch { return false; }
}

export function MetroCities() {
  const [man, setMan] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const [ready, setReady] = useState({});
  useEffect(() => {
    transitManifestMetro().then((m) => {
      setMan(m);
      m.forEach((c) => offlineReady(c.file).then((ok) =>
        setReady((r) => ({ ...r, [c.id]: ok }))));
    }).catch((e) => setErr(e));
  }, []);
  if (err) return <Err error={err} retry={() => location.reload()} />;
  const meta = man && man.find((c) => c.id === sel);
  return (<>
    <div className="dim sm" style={{ margin: '4px 0 10px' }}>
      Full metro networks for 12 more cities — plan a route, see every line and
      station. Each city downloads once (a few KB) and then works offline.
      Delhi is in the other tabs.
    </div>
    {!man && <Spin t="Loading city list" />}
    <div className="cats">
      {(man || []).map((c) => (
        <button key={c.id} className={`cat ${sel === c.id ? 'on' : ''}`}
          onClick={() => setSel(sel === c.id ? null : c.id)}>
          {c.name.replace(' Metro', '').replace('Namma', 'Bengaluru')}
          {ready[c.id] ? ' · offline' : ` · ${c.kb} KB`}
        </button>))}
    </div>
    {meta && <CityMetro key={meta.id} meta={meta}
      onReady={() => setReady((r) => ({ ...r, [meta.id]: true }))} />}
  </>);
}

function StationPicker({ data, label, value, onPick }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => (open ? searchCityStations(data, q, 7) : []), [data, q, open]);
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div className="dim sm">{label}</div>
      <input className="inp" value={q} placeholder="Station name"
        onChange={(e) => { setQ(e.target.value); setOpen(true); onPick(null); }}
        onFocus={() => setOpen(true)} />
      {open && sugg.length > 0 && (
        <div className="list" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0,
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }}>
          {sugg.map((n) => (
            <button className="row" key={n} onClick={() => { setQ(n); onPick(n); setOpen(false); }}>
              <span><Icon n="metro" size={15} /></span>
              <div className="main"><b>{n}</b></div>
            </button>))}
        </div>)}
    </div>);
}

function CityMetro({ meta, onReady }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('plan');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState(null);
  const [openLine, setOpenLine] = useState(null);
  const [sq, setSq] = useState('');
  useEffect(() => {
    metroCityData(meta.id).then((d) => { setData(d); onReady(); }).catch((e) => setErr(e));
  }, [meta.id]);
  if (err) return <Err error={err} retry={() => location.reload()} />;
  if (!data) return <Spin t={`Loading ${meta.name}`} />;
  const st = data.stats;
  const doPlan = () => {
    setPlanErr(null);
    try { setPlan(planCityMetro(data, from, to)); }
    catch (e) { setPlan(null); setPlanErr(e.message); }
  };
  const ix = cityIndex(data);
  const stationsShown = sq
    ? data.stations.filter((s) => s.n.toLowerCase().includes(sq.toLowerCase()))
    : data.stations;
  return (<>
    <Card>
      <div className="chead"><Icon n="metro" size={17} /> {data.city}
        <span className="dim sm" style={{ marginLeft: 'auto' }}>
          {st.lines} lines · {st.stations} stations · {st.interchanges} interchanges</span></div>
      <div className="cats">
        {[['plan', 'Plan route'], ['lines', 'Lines'], ['stations', 'Stations']].map(([id, n]) => (
          <button key={id} className={`cat ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{n}</button>))}
      </div>

      {tab === 'plan' && (<>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <StationPicker data={data} label="From" value={from} onPick={setFrom} />
          <StationPicker data={data} label="To" value={to} onPick={setTo} />
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={!from || !to} onClick={doPlan}>
          Plan route</button>
        {planErr && <div className="dim" style={{ marginTop: 8 }}>{planErr}</div>}
        {plan && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><b>{plan.totalStops}</b> stops</span>
              <span><b>{plan.km} km</b></span>
              <span><b>~{plan.mins} min</b> <span className="dim sm">(estimate)</span></span>
              <span><b>{plan.changes}</b> change{plan.changes === 1 ? '' : 's'}</span>
            </div>
            {plan.legs.map((leg, i) => (
              <div key={i} style={{ marginTop: 12 }}>
                <div>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                    background: leg.colour, marginRight: 6 }} />
                  <b>{leg.line}</b>
                  <span className="dim sm"> · {leg.count} stops · {leg.km} km</span>
                </div>
                <div className="dim sm" style={{ margin: '4px 0 0 16px', lineHeight: 1.7 }}>
                  {leg.stops.map((n, j) => (
                    <span key={j}>{j > 0 && ' → '}<span style={j === 0 || j === leg.stops.length - 1
                      ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{n}</span></span>))}
                </div>
                {i < plan.legs.length - 1 && (
                  <div className="dim sm" style={{ margin: '6px 0 0 16px' }}>
                    Change at <b style={{ color: 'var(--text)' }}>{leg.to}</b> to the {plan.legs[i + 1].line}
                  </div>)}
              </div>))}
          </div>)}
        <div className="dim sm" style={{ marginTop: 10 }}>
          No fare or timetable is published for this network in the sources used, so none is
          shown. Travel time is an estimate from distance.
        </div>
      </>)}

      {tab === 'lines' && (
        <div style={{ marginTop: 6 }}>
          {data.lines.map((L) => (
            <div key={L.n} style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <button className="row" style={{ width: '100%' }}
                onClick={() => setOpenLine(openLine === L.n ? null : L.n)}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3,
                  background: L.c }} />
                <div className="main"><b>{L.n}</b>
                  <span className="dim sm">{L.term[0]} → {L.term[1]}</span></div>
                <span className="dim sm">{L.s.length} stations · ≈{L.km} km</span>
              </button>
              {openLine === L.n && (
                <div className="dim sm" style={{ margin: '6px 0 2px 20px', lineHeight: 1.8 }}>
                  {L.s.map((n, j) => (
                    <span key={j}>{j > 0 && ' → '}<span style={ix.byStation.get(n)?.length > 1
                      ? { color: 'var(--text)', fontWeight: 600 } : undefined}>{n}</span></span>))}
                </div>)}
            </div>))}
        </div>)}

      {tab === 'stations' && (<>
        <Search value={sq} onChange={setSq} ph={`Search ${st.stations} stations…`} />
        <div className="list" style={{ marginTop: 8 }}>
          {stationsShown.slice(0, 150).map((s) => (
            <div className="row" key={s.n}>
              <span><Icon n="metro" size={15} /></span>
              <div className="main"><b>{s.n}</b>
                <span className="dim sm">{s.l.join(' · ')}</span></div>
              {s.l.length > 1 && <span className="tag">interchange</span>}
            </div>))}
        </div>
      </>)}
    </Card>
    <div className="dim sm" style={{ marginTop: 8 }}>
      Source: {data.source} Built {data.built}.
      {data.note && <> {data.note}</>}
    </div>
  </>);
}
