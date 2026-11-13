/**
 * Cricket Archive — every IPL match plus the men's international archive
 * (ODI · T20I · Test), with full scorecards.
 *
 * Built from the open ball-by-ball record (1,243 IPL + 7,165 international
 * matches): batting and bowling figures, extras, fall of wickets and career
 * records are computed from the balls themselves, not copied from a summary
 * feed — so a match card here shows exactly what the deliveries say happened.
 * The source's ball-by-ball coverage starts in 2001–2005 depending on the
 * format (each format's Records tab states its window), and fixtures the
 * source withholds (Afghanistan matches) are absent — the numbers are the
 * record's, labelled as such. Works offline once a season or match opened.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as C from '../core/bigdata';
import { Icon } from '../ui/icons';
import { Card, Spin, Err, Empty, fmt } from '../ui/kit';

const sr = (r, b) => (b ? (100 * r / b).toFixed(1) : '—');
const econ = (r, balls) => (balls ? (r / (balls / 6)).toFixed(2) : '—');
const bov = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const ballsOf = (ov) => { const o = parseFloat(ov); const w = Math.floor(o); return w * 6 + Math.round((o - w) * 10); };
const FMT_LABEL = { odi: 'ODI', t20: 'T20I', test: 'Test' };
const fmtLabel = (f) => (f === 'T20' ? 'T20I' : f || '');

function Scorecard({ id, onBack }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setD(null); setErr('');
    C.cricketMatch(id).then((r) => { if (alive) setD(r); })
      .catch((e) => { if (alive) setErr(e.message || 'Could not load that match'); });
    return () => { alive = false; };
  }, [id]);
  if (err) return <Err error={err} retry={onBack} />;
  if (!d) return <Spin t="Loading scorecard" />;
  const m = d.meta;
  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> Matches</button>
    <Card style={{ marginTop: 10 }}>
      <div className="chead">{m.teams.join(' vs ')}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }} className="gradtext">{m.result}</div>
      <div className="dim sm" style={{ marginTop: 4 }}>
        {m.date}{m.dateEnd ? ` – ${m.dateEnd}` : ''} · {m.venue}{m.city ? `, ${m.city}` : ''} · {m.event ? `${fmtLabel(m.fmt)} · ${m.event}` : `IPL ${m.season}`}
      </div>
      <div className="dim sm">{m.summ}</div>
      {m.toss?.winner && <div className="dim sm">Toss: {m.toss.winner} chose to {m.toss.decision}</div>}
      {m.pom?.length > 0 && <div className="dim sm">Player of the match: {m.pom.join(', ')}</div>}
    </Card>
    {d.inns.map((inn, ii) => (
      <Card key={ii} style={{ marginTop: 10 }}>
        <div className="chead">{inn.team} — {inn.total}/{inn.wk} ({inn.ov} ov){inn.so ? ' · Super Over' : ''}</div>
        <div className="list">
          {inn.bat.map((b, i) => (
            <div className="row" key={i}>
              <div className="main"><b style={{ fontSize: 13 }}>{b[0]}</b>
                <span className="dim sm">{b[1] || 'not out'}</span></div>
              <div className="end" style={{ textAlign: 'right' }}>
                <b>{b[2]}</b> <span className="dim sm">({b[3]}b {b[4]}×4 {b[5]}×6 · SR {sr(b[2], b[3])})</span>
              </div>
            </div>))}
        </div>
        {inn.dnb?.length > 0 && <div className="dim sm" style={{ marginTop: 6 }}>Did not bat: {inn.dnb.join(', ')}</div>}
        <div className="dim sm" style={{ marginTop: 4 }}>Extras: {inn.ex}</div>
        {inn.fow?.length > 0 && (
          <div className="dim sm" style={{ marginTop: 4 }}>
            Fall of wickets: {inn.fow.map((f) => `${f[0]}-${f[1]} (${f[2]}, ${f[3]} ov)`).join(' · ')}
          </div>)}
        <div className="chead" style={{ marginTop: 10, fontSize: 12 }}>Bowling</div>
        <div className="list">
          {inn.bowl.map((b, i) => (
            <div className="row" key={i}>
              <div className="main"><b style={{ fontSize: 13 }}>{b[0]}</b></div>
              <div className="end"><b>{b[3]}/{b[2]}</b> <span className="dim sm">({b[1]} ov · econ {econ(b[2], ballsOf(b[1]))})</span></div>
            </div>))}
        </div>
      </Card>))}
    <div className="src"><span className="dot" /><span>Figures computed from the ball-by-ball record</span></div>
  </>);
}

function Records({ load, batTitle, bowlTitle, note }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setS(null); setErr('');
    load().then((r) => { if (alive) setS(r); }).catch((e) => { if (alive) setErr(e.message || 'Could not load records'); });
    return () => { alive = false; };
  }, [load]);
  if (err) return <Err error={err} retry={() => { setErr(''); load().then(setS).catch((e) => setErr(e.message)); }} />;
  if (!s) return <Spin t="Loading records" />;
  return (<>
    <Card>
      <div className="chead">{batTitle}</div>
      <div className="list">
        {s.bat.slice(0, 25).map((p, i) => (
          <div className="row" key={i}>
            <span className="dim mono" style={{ width: 24, fontSize: 11 }}>{i + 1}</span>
            <div className="main"><b style={{ fontSize: 13.5 }}>{p[0]}</b>
              <span className="dim sm">{p[1]} matches · {p[2]} inns · HS {p[6]}{p[7] ? '*' : ''} · {p[8]}×100 {p[9]}×50</span></div>
            <div className="end"><b>{fmt(p[4])}</b><br /><span className="dim" style={{ fontSize: 10.5 }}>SR {sr(p[4], p[5])}</span></div>
          </div>))}
      </div>
    </Card>
    <Card style={{ marginTop: 10 }}>
      <div className="chead">{bowlTitle}</div>
      <div className="list">
        {s.bowl.slice(0, 25).map((p, i) => (
          <div className="row" key={i}>
            <span className="dim mono" style={{ width: 24, fontSize: 11 }}>{i + 1}</span>
            <div className="main"><b style={{ fontSize: 13.5 }}>{p[0]}</b>
              <span className="dim sm">{p[1]} matches · best {p[5]} · {bov(p[2])} ov</span></div>
            <div className="end"><b>{p[4]}</b><br /><span className="dim" style={{ fontSize: 10.5 }}>econ {econ(p[3], p[2])}</span></div>
          </div>))}
      </div>
    </Card>
    {note && <div className="src"><span className="dot" /><span>{note}</span></div>}
  </>);
}

export function CricketArchive() {
  const [tab, setTab] = useState('matches');
  const [format, setFormat] = useState('ipl');
  const [idx, setIdx] = useState(null);
  const [iidx, setIidx] = useState(null);
  const [err, setErr] = useState('');
  const [season, setSeason] = useState('');
  const [matches, setMatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState('');
  const [teamQ, setTeamQ] = useState('');

  useEffect(() => { C.cricketIndex().then(setIdx).catch((e) => setErr(e.message || 'Could not load the archive')); }, []);
  useEffect(() => { C.cricketIntlIndex().then(setIidx).catch(() => {}); }, []);
  const pickSeason = async (s) => {
    setSeason(s); setBusy(true); setMatches(null);
    try {
      setMatches(format === 'ipl' ? await C.cricketSeason(s) : await C.cricketIntlSeason(format, s));
    } catch (e) { setErr(e.message || 'Could not load that season'); }
    setBusy(false);
  };
  const pickFormat = (f) => { setFormat(f); setSeason(''); setMatches(null); setTeamQ(''); };
  const shown = useMemo(() => {
    if (!matches) return null;
    const v = teamQ.trim().toLowerCase();
    return v ? matches.filter((m) => m[2].join(' ').toLowerCase().includes(v)) : matches;
  }, [matches, teamQ]);

  if (open) return <Scorecard id={open} onBack={() => setOpen('')} />;

  const fi = format !== 'ipl' && iidx ? iidx[format] : null;
  const covNote = fi ? `Computed from the ball-by-ball record · ${FMT_LABEL[format]} coverage ${fi.coverage[0].slice(0, 4)}–${fi.coverage[1].slice(0, 4)} · ${fmt(fi.matches)} matches` : null;

  return (<>
    <div className="btnrow" style={{ marginTop: 2 }}>
      {[['ipl', 'IPL'], ['odi', 'ODI'], ['t20', 'T20I'], ['test', 'Test']].map(([f, label]) => (
        <button key={f} className={`cat ${format === f ? 'on' : ''}`} onClick={() => pickFormat(f)}>{label}</button>))}
    </div>
    <div className="btnrow" style={{ marginTop: 6 }}>
      <button className={`cat ${tab === 'matches' ? 'on' : ''}`} onClick={() => setTab('matches')}>Matches</button>
      <button className={`cat ${tab === 'records' ? 'on' : ''}`} onClick={() => setTab('records')}>Records</button>
    </div>
    {tab === 'records' && (format === 'ipl'
      ? <Records key="ipl" load={C.cricketStats} batTitle="Most runs — all IPL seasons" bowlTitle="Most wickets — all IPL seasons" />
      : fi && <Records key={format} load={() => C.cricketIntlStats(format)}
          batTitle={`Most runs — ${FMT_LABEL[format]}`} bowlTitle={`Most wickets — ${FMT_LABEL[format]}`} note={covNote} />)}
    {tab === 'records' && format !== 'ipl' && !fi && <Spin t="Loading formats" />}
    {tab === 'matches' && (<>
      {err && <Err error={err} retry={() => { setErr(''); C.cricketIndex().then(setIdx).catch((e) => setErr(e.message)); }} />}
      {format === 'ipl' && (<>
        {!idx && !err && <Spin t="Loading archive" />}
        {idx && (<>
          <div className="dim sm" style={{ margin: '8px 0 6px' }}>{fmt(idx.matches)} matches · {idx.seasons.length} seasons · full scorecards</div>
          <div className="btnrow">
            {[...idx.seasons].reverse().map((s) => (
              <button key={s} className={`cat ${season === s ? 'on' : ''}`} onClick={() => pickSeason(s)}>IPL {s}</button>))}
          </div>
        </>)}
      </>)}
      {format !== 'ipl' && (<>
        {!iidx && !err && <Spin t="Loading archive" />}
        {fi && (<>
          <div className="dim sm" style={{ margin: '8px 0 6px' }}>{fmt(fi.matches)} matches · {fi.coverage[0].slice(0, 4)}–{fi.coverage[1].slice(0, 4)} · full scorecards</div>
          <div className="btnrow">
            {fi.wc.map((y) => (
              <button key={`wc${y}`} className={`cat ${season === `wc${y}` ? 'on' : ''}`}
                onClick={() => pickSeason(`wc${y}`)}>World Cup {y}</button>))}
            {format === 'test' && fi.wtc > 0 && (
              <button className={`cat ${season === 'wtc' ? 'on' : ''}`} onClick={() => pickSeason('wtc')}>WTC Finals</button>)}
            {fi.years.map((y) => (
              <button key={y} className={`cat ${season === y ? 'on' : ''}`} onClick={() => pickSeason(y)}>{y}</button>))}
          </div>
        </>)}
      </>)}
      {busy && <Spin t="Loading season" />}
      {shown && (<>
        <input className="fld" style={{ marginTop: 10 }} placeholder="Filter by team" value={teamQ}
          onChange={(e) => setTeamQ(e.target.value)} />
        <div className="list" style={{ marginTop: 8 }}>
          {shown.map((m) => (
            <button key={m[0]} className="row uni-row" onClick={() => setOpen(m[0])}>
              <div className="main"><b style={{ fontSize: 13.5 }}>{m[2].join(' vs ')}</b>
                {m[6] ? <span className="dim sm">{m[6]}</span> : null}
                <span className="dim sm">{m[5] || m[4]}</span>
                <span className="dim sm">{m[3]}</span></div>
              <span className="dim sm" style={{ whiteSpace: 'nowrap' }}>{m[1]}</span>
            </button>))}
        </div>
        {shown.length === 0 && <Empty t="No matches for that team in this season" />}
      </>)}
      {!season && format === 'ipl' && idx && <Empty icon="chart" t="Pick a season to browse its matches" />}
      {!season && format !== 'ipl' && fi && <Empty icon="chart" t="Pick a year or a World Cup to browse its matches" />}
    </>)}
  </>);
}

export default CricketArchive;
