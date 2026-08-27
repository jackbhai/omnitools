/**
 * Three tools on sources verified before any of this was written:
 * rocket launches, recipes, and country statistics.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as E from '../core/extra';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty, fmt } from '../ui/kit';

/* ================================================================ LAUNCHES */

const STATUS_TONE = {
  Go: 'var(--green)', Success: 'var(--green)', TBC: 'var(--warn)', TBD: 'var(--fg3)',
  Hold: 'var(--warn)', 'In Flight': 'var(--cyan)', Failure: 'var(--bad)',
  'Partial Failure': 'var(--bad)',
};

function LaunchRow({ l, onOpen }) {
  const when = l.ts ? new Date(l.ts) : null;
  return (
    <button className="row" onClick={() => onOpen(l)}
      style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%',
        alignItems: 'flex-start', gap: 11 }}>
      <div style={{ width: 52, flex: '0 0 auto', textAlign: 'center' }}>
        {when && (<>
          <b style={{ display: 'block', fontSize: 15, lineHeight: 1 }}>{when.getDate()}</b>
          <span style={{ fontSize: 9, color: 'var(--fg3)', textTransform: 'uppercase' }}>
            {when.toLocaleDateString('en', { month: 'short' })}</span>
          <div style={{ fontSize: 9.5, color: 'var(--green)', marginTop: 3 }}>
            {E.launchCountdown(l.ts)}</div>
        </>)}
      </div>
      <div className="main" style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13.2 }}>{l.mission || l.name}</b>
        <span className="dim sm">{l.rocket}{l.provider ? ` · ${l.provider}` : ''}</span>
        <span className="dim" style={{ fontSize: 10.5 }}>
          {l.place || l.pad}
          {l.orbit ? ` · ${l.orbit}` : ''}
        </span>
      </div>
      <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, padding: '3px 8px',
        borderRadius: 6, background: 'var(--s3)', color: STATUS_TONE[l.status] || 'var(--fg2)' }}>
        {l.statusAbbr || l.status}</span>
    </button>);
}

function LaunchDetail({ l, onBack }) {
  return (<>
    <button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
    <Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
      {l.image && <img src={l.image} alt="" referrerPolicy="no-referrer"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />}
      <div style={{ padding: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: .6, margin: 0, lineHeight: 1.1 }}
          className="gradtext">{l.mission || l.name}</h2>
        <div className="dim sm" style={{ marginTop: 5 }}>{l.rocket} · {l.provider}</div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <span className="pill on">{E.launchCountdown(l.ts)}</span>
          <span className="pill" style={{ color: STATUS_TONE[l.status] || '' }}>{l.status}</span>
          {l.probability != null && <span className="pill">{l.probability}% weather go</span>}
        </div>
      </div>
    </Card>
    <Card>
      <div className="chead">Flight details</div>
      {l.ts > 0 && <div className="kv"><span>Lift-off</span><b style={{ fontSize: 12.5 }}>
        {new Date(l.ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b></div>}
      {l.type && <div className="kv"><span>Mission type</span><b>{l.type}</b></div>}
      {l.orbit && <div className="kv"><span>Target orbit</span><b style={{ fontSize: 12.5 }}>{l.orbit}</b></div>}
      {l.pad && <div className="kv"><span>Pad</span><b style={{ fontSize: 12.5 }}>{l.pad}</b></div>}
      {l.place && <div className="kv"><span>Location</span><b style={{ fontSize: 12.5 }}>{l.place}</b></div>}
      {l.providerType && <div className="kv"><span>Operator</span><b>{l.providerType}</b></div>}
      {l.webcast && <a className="btn" style={{ display: 'block', textAlign: 'center', marginTop: 12, textDecoration: 'none' }}
        href={l.webcast} target="_blank" rel="noreferrer">Watch the webcast</a>}
    </Card>
    {l.desc && <Card><div className="chead">The mission</div>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--fg2)' }}>{l.desc}</p></Card>}
  </>);
}

export function Launches() {
  const [tab, setTab] = useState('next');
  const [d, setD] = useState({ total: 0, list: [] });
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const token = useRef(0);

  const load = async (fn) => {
    const my = ++token.current;
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (token.current !== my) return;
      setD(r);
      if (!r.list.length) setErr('Nothing came back for that.');
    } catch (e) {
      if (token.current !== my) return;
      setD({ total: 0, list: [] }); setErr(e.message);
    } finally { if (token.current === my) setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'next') load(() => E.upcomingLaunches({ limit: 30 }));
    if (tab === 'past') load(() => E.pastLaunches({ limit: 30 }));
  }, [tab]);   // eslint-disable-line

  if (open) return <LaunchDetail l={open} onBack={() => setOpen(null)} />;

  return (<>
    <div className="cats">
      {[['next', 'Upcoming', 'timer'], ['past', 'Recent', 'clock'], ['find', 'Search', 'search']].map(([v, n, i]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}>
          <Icon n={i} size={13} /> {n}</button>))}
    </div>
    {tab === 'find' && (
      <form className="search" onSubmit={(e) => {
        e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
        if (q.trim()) load(() => E.searchLaunches(q));
      }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="ISRO, Starlink, Artemis, Chandrayaan…" autoComplete="off" />
      </form>)}
    {tab === 'find' && (
      <div className="btnrow">
        {['ISRO', 'PSLV', 'Starlink', 'Artemis', 'Falcon'].map((x) => (
          <button key={x} className="cat" onClick={() => { setQ(x); load(() => E.searchLaunches(x)); }}>{x}</button>))}
      </div>)}

    {busy && <Spin t="Reading the launch manifest" />}
    {!busy && err && <div className="err" style={{ marginTop: 12 }}><h4>Nothing came back</h4><p>{err}</p></div>}
    {!busy && d.list.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>
        {d.list.length} shown{d.total > d.list.length ? ` of ${fmt(d.total)} on record` : ''}</div>
      <div className="list">{d.list.map((l) => <LaunchRow key={l.id} l={l} onOpen={setOpen} />)}</div>
      <div className="src"><span className="dot" /><span>Launch library · every operator worldwide</span></div>
    </>)}
  </>);
}

/* ================================================================= RECIPES */

function RecipeDetail({ id, onBack }) {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setBusy(true);
    E.recipe(id).then((x) => alive && setR(x)).catch((e) => alive && setErr(e.message))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [id]);

  if (busy) return (<><button className="btn ghost sm" onClick={onBack}>&larr; Back</button><Spin t="Reading the recipe" /></>);
  if (err || !r) return (<><button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
    <div className="err" style={{ marginTop: 12 }}><h4>Could not open</h4><p>{err}</p></div></>);

  return (<>
    <button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
    <Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
      {r.thumb && <img src={r.thumb} alt="" referrerPolicy="no-referrer"
        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />}
      <div style={{ padding: 14 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 25, letterSpacing: .6, margin: 0, lineHeight: 1.1 }}
          className="gradtext">{r.title}</h2>
        <div className="btnrow" style={{ marginTop: 8 }}>
          {r.cuisine && <span className="pill on">{r.cuisine}</span>}
          {r.category && <span className="pill">{r.category}</span>}
          <span className="pill">{r.ingredients.length} ingredients</span>
          <span className="pill">{r.steps.length} steps</span>
        </div>
      </div>
    </Card>
    <Card>
      <div className="chead">What you need</div>
      {r.ingredients.map((i, n) => (
        <div className="kv" key={n}><span>{i.name}</span><b>{i.measure || '—'}</b></div>))}
    </Card>
    <Card>
      <div className="chead">How to make it</div>
      <ol className="steps">{r.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
    </Card>
    {(r.youtube || r.source) && (
      <div className="btnrow">
        {r.youtube && <a className="btn" style={{ textDecoration: 'none' }} href={r.youtube} target="_blank" rel="noreferrer">Watch it made</a>}
        {r.source && <a className="btn ghost" style={{ textDecoration: 'none' }} href={r.source} target="_blank" rel="noreferrer">Original recipe</a>}
      </div>)}
  </>);
}

export function Recipes() {
  const [tab, setTab] = useState('find');
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [cats, setCats] = useState([]);
  const [cuisines, setCuisines] = useState(E.CUISINES);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const token = useRef(0);

  const load = async (fn, label) => {
    const my = ++token.current;
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (token.current !== my) return;
      setList(r);
      if (!r.length) setErr(`${label} has nothing.`);
    } catch (e) {
      if (token.current !== my) return;
      setList([]); setErr(e.message);
    } finally { if (token.current === my) setBusy(false); }
  };

  useEffect(() => {
    if (tab === 'cat' && !cats.length) E.mealCategories().then(setCats).catch(() => {});
    if (tab === 'cuisine') E.cuisinesWithCounts().then(setCuisines).catch(() => {});
  }, [tab]);   // eslint-disable-line

  if (open) return <RecipeDetail id={open} onBack={() => setOpen(null)} />;

  const Tiles = () => (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
      {list.map((m) => (
        <button className="tile" key={m.id} onClick={() => setOpen(m.id)}
          style={{ padding: 0, overflow: 'hidden', minHeight: 0, display: 'block', textAlign: 'left', cursor: 'pointer' }}>
          {m.thumb
            ? <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer"
                style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', background: 'var(--s2)' }} />
            : <div style={{ aspectRatio: '1/1', background: 'var(--s2)', display: 'grid', placeItems: 'center' }}>
                <Icon n="flask" size={20} /></div>}
          <div style={{ padding: '8px 9px 10px' }}>
            <b style={{ fontSize: 11.8, display: 'block', lineHeight: 1.25 }}>{m.title}</b>
            {(m.cuisine || m.category) && (
              <span className="dim" style={{ fontSize: 10 }}>{[m.cuisine, m.category].filter(Boolean).join(' · ')}</span>)}
          </div>
        </button>))}
    </div>);

  return (<>
    <div className="cats">
      {[['find', 'Search', 'search'], ['cuisine', 'By cuisine', 'earth'],
        ['cat', 'By course', 'grid'], ['random', 'Surprise me', 'dice']].map(([v, n, i]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`}
          onClick={() => { setTab(v); setList([]); setErr(''); }}>
          <Icon n={i} size={13} /> {n}</button>))}
    </div>

    {tab === 'find' && (<>
      <form className="search" onSubmit={(e) => {
        e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
        if (q.trim()) load(() => E.searchRecipes(q), 'That search');
      }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Biryani, curry, chicken, dal…" autoComplete="off" />
      </form>
      <div className="btnrow">
        {['Biryani', 'Curry', 'Chicken', 'Paneer', 'Dessert', 'Soup'].map((x) => (
          <button key={x} className="cat" onClick={() => { setQ(x); load(() => E.searchRecipes(x), 'That search'); }}>{x}</button>))}
      </div>
    </>)}

    {tab === 'cuisine' && (
      <div className="btnrow">
        {cuisines.map((c) => (
          <button key={c.name} className="cat"
            onClick={() => load(() => E.recipesByCuisine(c.name), c.name)}>{c.name} · {c.n}</button>))}
      </div>)}

    {tab === 'cat' && (
      <div className="btnrow">
        {cats.map((c) => (
          <button key={c.id} className="cat"
            onClick={() => load(() => E.recipesByCategory(c.name), c.name)}>{c.name}</button>))}
      </div>)}

    {tab === 'random' && (
      <button className="btn" style={{ width: '100%', marginTop: 10 }}
        onClick={async () => {
          setBusy(true); setErr('');
          try { const r = await E.randomRecipe(); setOpen(r.id); }
          catch (e) { setErr(e.message); } finally { setBusy(false); }
        }}>Pick one at random</button>)}

    {busy && <Spin t="Reading the cookbook" />}
    {!busy && err && <div className="err" style={{ marginTop: 12 }}><h4>Nothing found</h4><p>{err}</p></div>}
    {!busy && list.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{list.length} recipes</div>
      <Tiles />
    </>)}
  </>);
}

/* ============================================================== WORLD DATA */

/** A sparkline drawn as an inline SVG — no chart library, no network. */
function Spark({ series, tone = 'var(--green)' }) {
  if (!series || series.length < 2) return null;
  const w = 260, h = 44, pad = 2;
  const vals = series.map((s) => s.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = series.map((s, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s.value - lo) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block', marginTop: 6 }}
      preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={tone} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2.6" fill={tone} />
    </svg>);
}

const REGIONS = [
  { cc: 'IN', n: 'India' }, { cc: 'PK', n: 'Pakistan' }, { cc: 'BD', n: 'Bangladesh' },
  { cc: 'LK', n: 'Sri Lanka' }, { cc: 'NP', n: 'Nepal' }, { cc: 'CN', n: 'China' },
  { cc: 'US', n: 'United States' }, { cc: 'GB', n: 'United Kingdom' }, { cc: 'JP', n: 'Japan' },
  { cc: 'DE', n: 'Germany' }, { cc: 'FR', n: 'France' }, { cc: 'BR', n: 'Brazil' },
  { cc: 'RU', n: 'Russia' }, { cc: 'ZA', n: 'South Africa' }, { cc: 'AE', n: 'UAE' },
  { cc: 'SG', n: 'Singapore' }, { cc: 'AU', n: 'Australia' }, { cc: 'CA', n: 'Canada' },
  { cc: 'ID', n: 'Indonesia' }, { cc: 'NG', n: 'Nigeria' },
];

export function WorldData() {
  const [cc, setCc] = useState('IN');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [all, setAll] = useState([]);
  const [pick, setPick] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const my = ++token.current;
    setBusy(true); setErr('');
    E.countryProfile(cc)
      .then((r) => {
        if (token.current !== my) return;
        setRows(r);
        if (!r.length) setErr('No published figures for this country.');
      })
      .catch((e) => { if (token.current === my) { setRows([]); setErr(e.message); } })
      .finally(() => { if (token.current === my) setBusy(false); });
  }, [cc]);

  useEffect(() => { if (pick && !all.length) E.wbCountries().then(setAll).catch(() => {}); }, [pick]);  // eslint-disable-line

  const name = rows[0]?.country || REGIONS.find((r) => r.cc === cc)?.n || cc;

  return (<>
    <div className="btnrow">
      {REGIONS.map((r) => (
        <button key={r.cc} className={`cat ${cc === r.cc ? 'on' : ''}`} onClick={() => setCc(r.cc)}>{r.n}</button>))}
      <button className={`cat ${pick ? 'on' : ''}`} onClick={() => setPick((v) => !v)}>
        <Icon n="search" size={13} /> All countries</button>
    </div>
    {pick && all.length > 0 && (
      <div className="fld" style={{ marginTop: 10 }}><label>Any country</label>
        <select value={cc} onChange={(e) => { setCc(e.target.value); setPick(false); }}>
          {all.map((c) => <option key={c.cc} value={c.cc}>{c.name}</option>)}
        </select></div>)}

    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1, margin: '14px 0 4px' }}
      className="gradtext">{name}</h2>

    {busy && <Spin t="Reading the statistics" />}
    {!busy && err && <div className="err" style={{ marginTop: 12 }}><h4>No figures</h4><p>{err}</p></div>}
    {!busy && rows.length > 0 && (<>
      <div className="dim sm" style={{ marginBottom: 10 }}>
        {rows.length} indicators · each with its own history</div>
      {rows.map((r) => {
        const change = r.first && r.latest && r.first.value
          ? ((r.latest.value - r.first.value) / Math.abs(r.first.value)) * 100 : null;
        return (
          <Card key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="chead" style={{ marginBottom: 2 }}>{r.n}</div>
                <div className="dim" style={{ fontSize: 10.5 }}>{r.unit}</div>
              </div>
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.4 }}>
                  {E.formatValue(r.latest.value, r.fmt)}</div>
                <div className="dim" style={{ fontSize: 10.5 }}>{r.latest.year}</div>
              </div>
            </div>
            <Spark series={r.series} />
            {change != null && r.series.length > 2 && (
              <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>
                <b style={{ color: change >= 0 ? 'var(--green)' : 'var(--bad)' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(0)}%</b>
                {' '}since {r.first.year} · {r.series.length} years on record
              </div>)}
          </Card>);
      })}
      <div className="src"><span className="dot" /><span>Official development statistics</span></div>
    </>)}
  </>);
}
