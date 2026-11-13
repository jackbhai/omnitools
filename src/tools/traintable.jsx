/**
 * Train Time Table — the full published schedule, offline after first use.
 *
 * The other Train tabs answer "where is it now" from live feeds; this one
 * answers the question people actually plan with — every station the train
 * passes, the scheduled arrival and departure, the days it runs, and the
 * total distance — for 5,208 trains, with no network needed once a route
 * has been opened once. Passing stations (where the train does not halt)
 * are shown under "All stops"; "Halts only" keeps the booked stops.
 *
 * The "Between stations" mode answers the other planning question — every
 * direct train from A to B, by departure — from two small positional
 * shards (rail-bsp-<xx>.json), never by downloading whole routes.
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

/* ------------------------------------------------------- between stations
   From + To pickers over the 8,990-station list; the query itself reads the
   two positional shards of the two station codes (rail-bsp-<xx>.json) and
   intersects them — no route files are fetched until one train is opened. */
function StationPicker({ label, value, onPick, stations }) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const hits = useMemo(() => {
    if (!stations || !focus || text.trim().length < 2 || value) return null;
    const v = text.trim().toLowerCase();
    return Object.entries(stations)
      .filter(([c, n]) => c.toLowerCase() === v || n.toLowerCase().includes(v) || c.toLowerCase().startsWith(v))
      .slice(0, 8);
  }, [stations, text, focus, value]);
  return (<div style={{ flex: 1, minWidth: 0 }}>
    <div className="dim sm" style={{ marginBottom: 4 }}>{label}</div>
    {value ? (
      <button className="fld" style={{ textAlign: 'left', width: '100%' }}
        onClick={() => { onPick(null); setText(''); }}>
        <b>{value.name}</b> <span className="dim mono" style={{ fontSize: 11 }}>{value.code}</span>
        <span className="dim" style={{ float: 'right' }}>change</span>
      </button>
    ) : (<>
      <input className="fld" style={{ width: '100%' }} placeholder="Station name or code"
        value={text} onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
      {hits && (<div className="list" style={{ marginTop: 4 }}>
        {hits.length === 0 && <Empty t="No station matches that" />}
        {hits.map(([code, name]) => (
          <button key={code} className="row uni-row" onClick={() => onPick({ code, name })}>
            <Icon n="pin" size={15} />
            <div className="main"><b style={{ fontSize: 13 }}>{name}</b><span className="dim sm mono">{code}</span></div>
          </button>))}
      </div>)}
    </>)}
  </div>);
}

function BetweenStations({ idx, onOpen }) {
  const [stations, setStations] = useState(null);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { R.railStations().then(setStations).catch(() => {}); }, []);

  const run = async (a, b) => {
    if (!a || !b) return;
    if (a.code === b.code) { setErr('Pick two different stations'); setRes(null); return; }
    setBusy(true); setErr(''); setRes(null);
    try {
      const [rowsA, rowsB] = await Promise.all([R.railByStationPos(a.code), R.railByStationPos(b.code)]);
      const byNo = new Map((idx?.trains || []).map((t) => [t[0], t]));
      const bByTrain = new Map();
      rowsB.forEach((r) => { if (!bByTrain.has(r[0])) bByTrain.set(r[0], []); bByTrain.get(r[0]).push(r); });
      const best = new Map();
      rowsA.forEach((ra) => {
        (bByTrain.get(ra[0]) || []).forEach((rb) => {
          if (ra[1] >= rb[1]) return;
          const dep = ra[3] || ra[2]; const arr = rb[2] || rb[3];
          if (!dep || !arr) return;
          const mins = (rb[4] - ra[4]) * 1440 + toMin(arr) - toMin(dep);
          if (mins <= 0) return;
          const prev = best.get(ra[0]);
          if (!prev || mins < prev.mins) best.set(ra[0], { ra, rb, dep, arr, mins });
        });
      });
      const out = [...best.entries()].map(([no, v]) => {
        const t = byNo.get(no);
        if (!t) return null;
        const off = v.ra[4] - 1;
        let maskFrom = 0;
        for (let i = 0; i < 7; i++) if (t[5] & (1 << i)) maskFrom |= 1 << ((i + off) % 7);
        return { t, ...v, maskFrom, depMin: toMin(v.dep) };
      }).filter(Boolean).sort((x, y) => x.depMin - y.depMin || x.mins - y.mins);
      setRes(out);
    } catch (e) { setErr(e.message || 'Could not run that search'); }
    setBusy(false);
  };

  useEffect(() => { if (from && to) run(from, to); /* eslint-disable-next-line */ }, [from, to]);

  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
      <StationPicker label="From" value={from} onPick={setFrom} stations={stations} />
      <button className="btn ghost sm" style={{ marginTop: 22 }} aria-label="Swap stations"
        onClick={() => { setFrom(to); setTo(from); }}>
        <Icon n="swap" size={14} /></button>
      <StationPicker label="To" value={to} onPick={setTo} stations={stations} />
    </div>
    {err && <Err error={err} retry={() => run(from, to)} />}
    {busy && <Spin t="Finding trains" />}
    {res && !busy && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>
        {res.length} direct train(s) · {from.name} → {to.name} · by departure</div>
      {res.length === 0 && <Empty icon="train" t="No direct trains between these stations in the timetable" />}
      <div className="list">
        {res.map(({ t, dep, arr, mins, rb, maskFrom }) => (
          <button key={t[0]} className="row uni-row" onClick={() => onOpen(t)}>
            <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 46 }}>{t[0]}</span>
            <div className="main"><b style={{ fontSize: 13.5 }}>{t[1]}</b>
              <span className="dim sm">{dep} → {arr}{rb[4] > 1 ? ` · +${rb[4] - 1}d` : ''} · {Math.floor(mins / 60)}h {String(mins % 60).padStart(2, '0')}m</span>
              <span className="dim sm">{DAYS.filter((_, i) => maskFrom & (1 << i)).join(' ') || 'Daily'}</span></div>
          </button>))}
      </div>
      <div className="src"><span className="dot" /><span>Scheduled timetable · days shown are the days the train is at {from.name}</span></div>
    </>)}
    {!res && !busy && !err && (
      <Empty icon="train" t="Pick both stations — every direct train between them, by departure time" />)}
  </>);
}

export function TrainTimeTable() {
  const [mode, setMode] = useState('trains');
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
    <div className="btnrow" style={{ marginTop: 2 }}>
      <button className={`cat ${mode === 'trains' ? 'on' : ''}`} onClick={() => setMode('trains')}>Trains</button>
      <button className={`cat ${mode === 'between' ? 'on' : ''}`} onClick={() => setMode('between')}>Between stations</button>
    </div>
    {mode === 'between' && <BetweenStations idx={idx} onOpen={setOpen} />}
    {mode === 'trains' && (<>
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
    </>)}
  </>);
}

export default TrainTimeTable;
