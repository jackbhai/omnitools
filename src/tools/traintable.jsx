/**
 * Train Time Table — the full published schedule, offline after first use.
 *
 * The other Train tabs answer "where is it now" from live feeds; this one
 * answers the question people actually plan with — every station the train
 * passes, the scheduled arrival and departure, the days it runs, and the
 * total distance — for 5,208 trains, with no network needed once a route
 * has been opened once. Passing stations (where the train does not halt)
 * are shown under "All stops"; "Halts only" keeps the booked stops.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as R from '../core/bigdata';
import { Icon } from '../ui/icons';
import { Card, Spin, Err, Empty, Search, fmt } from '../ui/kit';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function Days({ mask }) {
  return (<div className="btnrow" style={{ marginTop: 8 }}>
    {DAYS.map((d, i) => (
      <span key={d} className={`tag ${mask & (1 << i) ? 'g' : ''}`}
        style={{ opacity: mask & (1 << i) ? 1 : .45 }}>{d}</span>))}
  </div>);
}

function RouteView({ t, onBack }) {
  const [stops, setStops] = useState(null);
  const [err, setErr] = useState('');
  const [haltsOnly, setHaltsOnly] = useState(true);
  const [names, setNames] = useState(null);

  useEffect(() => {
    let alive = true;
    setStops(null); setErr('');
    R.railRoute(t[0]).then((r) => { if (alive) setStops(r || []); })
      .catch((e) => { if (alive) setErr(e.message || 'Could not load the route'); });
    R.railStations().then((s) => { if (alive) setNames(s); }).catch(() => {});
    return () => { alive = false; };
  }, [t]);

  const nm = (code) => (names && names[code]) || code;
  const info = useMemo(() => {
    if (!stops || !stops.length) return null;
    const dep = toMin(stops[0][2]);
    const last = stops[stops.length - 1];
    const arr = toMin(last[1]);
    const mins = dep != null && arr != null ? (last[3] - 1) * 1440 + arr - dep : null;
    const halts = stops.filter((s, i) => i === 0 || i === stops.length - 1 || s[1] !== s[2]).length;
    return { mins, halts };
  }, [stops]);

  const shown = stops ? (haltsOnly
    ? stops.filter((s, i) => i === 0 || i === stops.length - 1 || s[1] !== s[2])
    : stops) : [];

  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> All trains</button>
    <Card style={{ marginTop: 10 }}>
      <div className="chead"><span className="mono" style={{ color: 'var(--green)' }}>{t[0]}</span>{t[2] ? ` · ${t[2]}` : ''}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, letterSpacing: .4 }} className="gradtext">{t[1]}</div>
      <div className="dim sm" style={{ marginTop: 4 }}>{nm(t[3])} ({t[3]}) → {nm(t[4])} ({t[4]})</div>
      <Days mask={t[5]} />
      {info && (<div className="g3" style={{ marginTop: 12 }}>
        <div className="stat"><div className="v">{fmt(t[6])}</div><div className="l">km</div></div>
        <div className="stat"><div className="v">{info.mins != null ? `${Math.floor(info.mins / 60)}h ${String(info.mins % 60).padStart(2, '0')}m` : '—'}</div><div className="l">Duration</div></div>
        <div className="stat"><div className="v">{info.halts}</div><div className="l">Halts</div></div>
      </div>)}
    </Card>

    {err && <Err error={err} retry={() => { setErr(''); setStops(null); R.railRoute(t[0]).then(setStops).catch((e) => setErr(e.message)); }} />}
    {!stops && !err && <Spin t="Loading route" />}
    {stops && (<>
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className={`cat ${haltsOnly ? 'on' : ''}`} onClick={() => setHaltsOnly(true)}>Halts only</button>
        <button className={`cat ${!haltsOnly ? 'on' : ''}`} onClick={() => setHaltsOnly(false)}>All stops · {stops.length}</button>
      </div>
      <div className="list" style={{ marginTop: 8 }}>
        {shown.map((s, i) => {
          const first = s === stops[0]; const last = s === stops[stops.length - 1];
          const halt = first || last || s[1] !== s[2];
          const haltMin = !first && !last && s[1] && s[2] ? toMin(s[2]) - toMin(s[1]) : null;
          return (<div className="row" key={i} style={halt ? null : { opacity: .62 }}>
            <span className="dim mono" style={{ width: 30, fontSize: 11 }}>{stops.indexOf(s) + 1}</span>
            <div className="main">
              <b style={{ fontSize: 13.5 }}>{nm(s[0])} <span className="dim mono" style={{ fontSize: 11 }}>{s[0]}</span></b>
              <span className="dim sm">{first ? 'Starts' : last ? 'Ends' : halt ? `Halt ${haltMin}m` : 'Passes through'}{s[3] > 1 ? ` · Day ${s[3]}` : ''}</span>
            </div>
            <div className="end" style={{ textAlign: 'right' }}>
              <b className="mono" style={{ fontSize: 12.5 }}>{first ? '—' : (s[1] || '—')} / {last ? '—' : (s[2] || '—')}</b>
              <br /><span className="dim" style={{ fontSize: 10.5 }}>arr / dep</span>
            </div>
          </div>);
        })}
      </div>
      <div className="src"><span className="dot" /><span>Scheduled timetable · works offline once opened · for today's running position use the Live status tab</span></div>
    </>)}
  </>);
}

export function TrainTimeTable() {
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [stationHits, setStationHits] = useState(null);
  const [stationTrains, setStationTrains] = useState(null);

  useEffect(() => {
    R.railIndex().then(setIdx).catch((e) => setErr(e.message || 'Could not load the train index'));
  }, []);

  const results = useMemo(() => {
    if (!idx || !q.trim()) return null;
    const v = q.trim().toLowerCase();
    if (/^\d{2,5}$/.test(v)) return idx.trains.filter((t) => t[0].startsWith(v)).slice(0, 60);
    const toks = v.split(/\s+/);
    return idx.trains.filter((t) => {
      const hay = t[1].toLowerCase();
      return toks.every((x) => hay.includes(x));
    }).slice(0, 60);
  }, [idx, q]);

  const findStation = async () => {
    const v = q.trim().toLowerCase();
    if (!v || /^\d+$/.test(v)) return;
    const st = await R.railStations().catch(() => null);
    if (!st) return;
    const hits = Object.entries(st).filter(([, n]) => n.toLowerCase().includes(v)).slice(0, 10);
    setStationHits(hits);
  };

  const openStation = async (code, name) => {
    setStationHits(null); setStationTrains(null);
    const nos = await R.railByStation(code).catch(() => []);
    const byNo = new Map((idx?.trains || []).map((t) => [t[0], t]));
    setStationTrains({ code, name, trains: nos.map((n) => byNo.get(n)).filter(Boolean) });
  };

  if (open) return <RouteView t={open} onBack={() => setOpen(null)} />;

  return (<>
    <Search value={q} onChange={(v) => { setQ(v); setStationHits(null); setStationTrains(null); }}
      onSubmit={findStation} ph="Train number, name, or station" />
    <div className="btnrow">
      <span className="dim sm">Try:</span>
      {['12301', '12951', '12627', 'Rajdhani', 'Shatabdi'].map((x) => (
        <button key={x} className="cat" onClick={() => setQ(x)}>{x}</button>))}
      {q.trim() && !/^\d+$/.test(q.trim()) && (
        <button className="cat" onClick={findStation}><Icon n="pin" size={13} /> Search as station</button>)}
    </div>

    {err && <Err error={err} retry={() => { setErr(''); R.railIndex().then(setIdx).catch((e) => setErr(e.message)); }} />}
    {!idx && !err && <Spin t="Loading train index" />}

    {stationHits && (<div className="list" style={{ marginTop: 8 }}>
      {stationHits.length === 0 && <Empty t="No station matches that name" />}
      {stationHits.map(([code, name]) => (
        <button key={code} className="row uni-row" onClick={() => openStation(code, name)}>
          <Icon n="pin" size={16} />
          <div className="main"><b>{name}</b><span className="dim sm mono">{code}</span></div>
        </button>))}
    </div>)}

    {stationTrains && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>
        {stationTrains.trains.length} trains through {stationTrains.name} ({stationTrains.code})
      </div>
      <div className="list">
        {stationTrains.trains.slice(0, 80).map((t) => (
          <button key={t[0]} className="row uni-row" onClick={() => setOpen(t)}>
            <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 46 }}>{t[0]}</span>
            <div className="main"><b style={{ fontSize: 13.5 }}>{t[1]}</b>
              <span className="dim sm">{t[3]} → {t[4]} · {fmt(t[6])} km</span></div>
          </button>))}
      </div>
    </>)}

    {idx && !q.trim() && !stationTrains && (
      <Empty icon="train" t={`${fmt(idx.count)} trains with full routes — search by number, name, or station`} />)}
    {results && !stationTrains && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>{results.length} train(s)</div>
      <div className="list">
        {results.map((t) => (
          <button key={t[0]} className="row uni-row" onClick={() => setOpen(t)}>
            <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 46 }}>{t[0]}</span>
            <div className="main"><b style={{ fontSize: 13.5 }}>{t[1]}</b>
              <span className="dim sm">{t[3]} → {t[4]} · {fmt(t[6])} km · {t[7]} stops</span></div>
          </button>))}
      </div>
      {results.length === 0 && <Empty t="No train matches that search" />}
    </>)}
  </>);
}

export default TrainTimeTable;
