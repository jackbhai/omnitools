/**
 * Names & Surnames — the full directory.
 *
 * 5,695 names ship with the app: 4,964 surnames and 731 given names, built from
 * the citizenship register and 23 encyclopedia categories, sharded by first
 * letter so opening the tool costs one small file rather than 619 KB.
 *
 * Search is instant and works offline. Tapping any name opens its deep record,
 * which adds the live layers — the register's bearer list and the usage
 * statistics — on top of what shipped.
 *
 * Filters are real facets counted from the data, not a hand-written list:
 * community (Khatri, Brahmin, Jat, Rajput, Sikh…), region (Punjab, Sindh,
 * Bengal, Tamil Nadu…), language, and country.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as N from '../core/names';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty, fmt } from '../ui/kit';

const TABS = [
  { id: 'all',     n: 'All names',  i: 'list',  kind: '' },
  { id: 'surname', n: 'Surnames',   i: 'badge', kind: 'surname' },
  { id: 'given',   n: 'First names',i: 'smile', kind: 'given' },
  { id: 'look',    n: 'Deep record',i: 'search' },
];

const CC_NAME = { IN: 'India', PK: 'Pakistan', NP: 'Nepal' };

const Bar = ({ p, tone = 'var(--green)' }) => (
  <span style={{ display: 'block', height: 4, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden' }}>
    <span style={{ display: 'block', height: '100%', width: `${Math.round(p * 100)}%`, background: tone }} />
  </span>
);

/* ------------------------------------------------------------- deep record */
function Record({ name, onBack }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [people, setPeople] = useState(null);
  const [busyP, setBusyP] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setD(null); setPeople(null);
    /* Render each layer the moment it lands. The census answers in a tenth of
       a second while the encyclopedia registers can take half a minute, and
       making the fast answer wait for the slow one was the whole problem. */
    N.deepLookup(name, (partial) => {
      if (!alive) return;
      if (partial.entry || partial.census || partial.facts.length || partial.wiki) {
        setD(partial);
        setBusy(false);
      }
    })
      .then((r) => { if (alive) setD(r); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [name]);

  if (busy) return (<><button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
    <Spin t="Reading every register" /></>);
  if (err || !d) return (<><button className="btn ghost sm" onClick={onBack}>&larr; Back</button>
    <div className="err" style={{ marginTop: 12 }}><h4>Nothing found</h4><p>{err}</p></div></>);

  const e = d.entry || {};
  const s = d.stats || {};
  const best = d.best;
  const cen = d.census || null;
  /* The census counts everyone, not only the notable — this is the number that
     answers "is this a real name?" for an ordinary surname. */
  const censusMain = cen ? ((cen.surname?.people || 0) >= (cen.given?.people || 0) ? cen.surname : cen.given) : null;
  const carriers = censusMain?.people || 0;
  const kindLabel = e.k === 'given'
    ? (e.g === 'm' ? 'First name · usually male' : e.g === 'f' ? 'First name · usually female' : 'First name')
    : (e.k === 'surname' ? 'Surname' : best?.kind || '');

  const loadPeople = async () => {
    setBusyP(true);
    try { setPeople(await N.bearers(d.query, { limit: 40 })); }
    catch { setPeople([]); }
    finally { setBusyP(false); }
  };

  return (<>
    <button className="btn ghost sm" onClick={onBack}>&larr; Back</button>

    <Card style={{ marginTop: 10 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: .8, margin: 0 }}
        className="gradtext">{d.query}</h2>
      {(e.nat || best?.native) && (e.nat || best.native) !== d.query && (
        <div style={{ fontSize: 19, marginTop: 4, color: 'var(--cyan)' }}>{e.nat || best.native}</div>)}
      <div className="btnrow" style={{ marginTop: 8 }}>
        {kindLabel && <span className="pill on">{kindLabel}</span>}
        {carriers > 0 && <span className="pill">{fmt(carriers)} people carry it</span>}
        {(e.b || best?.bearers) > 0 && <span className="pill">{fmt(e.b || best.bearers)} notable</span>}
        {(e.c || []).map((c) => <span className="pill" key={c}>{CC_NAME[c] || c}</span>)}
        {s.gender && <span className="pill">{s.gender === 'male' ? 'Mostly male' : 'Mostly female'}
          {s.genderProb ? ` ${Math.round(s.genderProb * 100)}%` : ''}</span>}
      </div>
    </Card>

    {(e.comm?.length || e.reg?.length || e.l?.length || e.o?.length || e.m) && (
      <Card>
        <div className="chead"><Icon n="info" size={15} /> Where it belongs</div>
        {e.comm?.length > 0 && <div className="kv"><span>Community</span>
          <b style={{ fontSize: 12.5 }}>{e.comm.join(', ')}</b></div>}
        {e.reg?.length > 0 && <div className="kv"><span>Region</span>
          <b style={{ fontSize: 12.5 }}>{e.reg.join(', ')}</b></div>}
        {e.l?.length > 0 && <div className="kv"><span>Language</span>
          <b style={{ fontSize: 12.5 }}>{e.l.join(', ')}</b></div>}
        {e.o?.length > 0 && <div className="kv"><span>Root language</span>
          <b style={{ fontSize: 12.5 }}>{e.o.join(', ')}</b></div>}
        {e.m && <div className="kv"><span>Meaning</span>
          <b style={{ fontSize: 12, textAlign: 'right' }}>{e.m}</b></div>}
      </Card>)}

    {(e.s || d.wiki) && (
      <Card>
        <div className="chead"><Icon n="book" size={15} /> What it means</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, color: 'var(--fg2)' }}>
          {d.wiki?.extract || e.s}</p>
        {(d.wiki?.url || e.w) && (
          <a className="btn ghost sm" style={{ display: 'block', textAlign: 'center', marginTop: 10, textDecoration: 'none' }}
            href={d.wiki?.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(e.w)}`}
            target="_blank" rel="noreferrer">Read the full article</a>)}
      </Card>)}

    {!e.s && !d.wiki && (
      <div className="note" style={{ marginTop: 12 }}>
        {carriers > 0
          ? `No encyclopedia article could be confirmed as being about this name rather than
             about a person or place that shares the spelling, so no origin story is invented.
             The count below is a census figure and is exact.`
          : `Nothing is recorded for this spelling in any register or in the population
             census. Check the spelling, or try it without a prefix.`}
      </div>)}

    {censusMain && (
      <Card>
        <div className="chead"><Icon n="numbers" size={15} /> How many people carry it</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="big" style={{ fontSize: 30 }}>{fmt(censusMain.people)}</div>
          <div className="dim sm">worldwide{censusMain.rank ? ` · ${fmt(censusMain.rank)}th commonest` : ''}</div>
        </div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <span className="pill on">{censusMain.kind === 'given' ? 'Used as a first name' : 'Used as a surname'}</span>
          {censusMain.top && <span className="pill">Most people in {censusMain.top}</span>}
          {censusMain.dense && censusMain.dense !== censusMain.top &&
            <span className="pill">Densest in {censusMain.dense}</span>}
        </div>
        {censusMain.meaning && (
          <p className="dim sm" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>{censusMain.meaning}</p>)}
        {cen.surname && cen.given && (
          <div className="g2" style={{ marginTop: 10 }}>
            <div className="stat"><div className="v">{fmt(cen.surname.people)}</div><div className="l">as a surname</div></div>
            <div className="stat"><div className="v">{fmt(cen.given.people)}</div><div className="l">as a first name</div></div>
          </div>)}
        {censusMain.places?.length > 0 && (<>
          <div className="chead" style={{ marginTop: 14 }}>By country</div>
          {censusMain.places.slice(0, 12).map((pl) => (
            <div className="kv" key={pl.place}>
              <span>{pl.place}</span>
              <b>{fmt(pl.n)}
                {pl.per ? <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}> · 1 in {fmt(pl.per)}</span> : null}
                {/* the census reports the share of bearers who are female */}
                {pl.female != null && (
                  <span className="dim" style={{ fontWeight: 400, fontSize: 11 }}>
                    {' · '}{pl.female >= 60 ? `${pl.female}% female`
                      : pl.female <= 40 ? `${100 - pl.female}% male` : 'mixed'}</span>)}
              </b>
            </div>))}
        </>)}
      </Card>)}

    {s.countries?.length > 0 && (
      <Card>
        <div className="chead"><Icon n="earth" size={15} /> Where it is used</div>
        {s.countries.slice(0, 8).map((c) => (
          <div key={c.cc} style={{ marginBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
              <b>{N.countryName(c.cc)}</b><span className="dim">{(c.p * 100).toFixed(1)}%</span>
            </div>
            <Bar p={c.p} />
          </div>))}
        {s.countrySample != null && (
          <div className="dim" style={{ fontSize: 10.5, marginTop: 6 }}>
            from {fmt(s.countrySample)} recorded uses</div>)}
      </Card>)}

    {(s.age != null || s.gender) && (
      <div className="g2" style={{ marginTop: 12 }}>
        {s.age != null && <div className="stat"><div className="v">{s.age}</div><div className="l">Median age</div>
          {s.ageSample ? <div className="s">{fmt(s.ageSample)} samples</div> : null}</div>}
        {s.gender && <div className="stat">
          <div className="v" style={{ fontSize: 17 }}>{s.gender === 'male' ? 'Male' : 'Female'}</div>
          <div className="l">Usually</div>
          {s.genderProb ? <div className="s">{Math.round(s.genderProb * 100)}% confident</div> : null}</div>}
      </div>)}

    {s.quota && (
      <div className="note warn" style={{ marginTop: 12 }}>
        The free usage-statistics allowance for today is spent — a shared limit of
        100 lookups a day, not a fault. Country, age and gender return tomorrow.
        Everything above is from the directory and the register.
      </div>)}

    <Card>
      <div className="chead"><Icon n="smile" size={15} /> People with this name</div>
      {!people && !busyP && (
        <button className="btn" style={{ width: '100%' }} onClick={loadPeople}>
          Show recorded people{(e.b || best?.bearers) ? ` · ${fmt(e.b || best.bearers)}` : ''}</button>)}
      {busyP && <Spin t="Reading the register" />}
      {people?.length > 0 && (
        <div className="list" style={{ marginTop: 4 }}>
          {people.map((p) => (
            <a className="row" key={p.qid} href={p.url} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none' }}>
              {p.img
                ? <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer"
                    onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                    style={{ width: 40, height: 40, borderRadius: 11, objectFit: 'cover', flex: '0 0 auto' }} />
                : <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--s2)',
                    display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg3)' }}>
                    <Icon n="smile" size={16} /></span>}
              <div className="main" style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{p.name}</b>
                <span className="dim sm">
                  {[p.occupations.slice(0, 2).join(', '), p.country].filter(Boolean).join(' · ') || '—'}</span>
                {p.born && <span className="dim" style={{ fontSize: 10.5 }}>
                  b. {p.born.slice(0, 4)}{p.died ? ` – d. ${p.died.slice(0, 4)}` : ''}</span>}
              </div>
            </a>))}
        </div>)}
      {people?.length === 0 && <Empty t="The register lists no people under this name" />}
    </Card>

    {d.pending > 0 && (
      <div className="dim sm" style={{ textAlign: 'center', marginTop: 10 }}>
        <span className="spin-sm" style={{ marginRight: 7, verticalAlign: '-2px' }} />
        still reading {d.pending} more source{d.pending > 1 ? 's' : ''}…
      </div>)}

    <div className="src"><span className="dot" />
      <span>{[d.entry && 'shipped directory', d.facts?.length && 'name register',
        d.wiki && 'encyclopedia', cen && 'population census']
        .filter(Boolean).join(' · ') || 'no source recognised this name'}</span></div>
  </>);
}

/* ------------------------------------------------------------------ shell */
export function Names() {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ total: 0, rows: [] });
  const [meta, setMeta] = useState(null);
  const [fac, setFac] = useState(null);
  const [filters, setFilters] = useState({ cc: '', lang: '', comm: '', reg: '' });
  const [showF, setShowF] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  /* When the shipped directory has nothing, the census is asked automatically.
     Without this the tool answered "No name matches" for Rakheja and
     Mangatram — real names carried by 1,033 and 586 people — unless the user
     happened to switch to another tab first. Nobody should have to know that. */
  const [fallback, setFallback] = useState(null);
  const [busyFb, setBusyFb] = useState(false);
  const token = useRef(0);

  const kind = TABS.find((t) => t.id === tab)?.kind ?? '';
  const anyFilter = Object.values(filters).some(Boolean);

  useEffect(() => { N.directoryMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { if (showF && !fac) N.facets().then(setFac).catch(() => {}); }, [showF]);  // eslint-disable-line

  useEffect(() => {
    if (tab === 'look') return;
    const my = ++token.current;
    setBusy(true); setErr(''); setFallback(null); setBusyFb(false);
    const t = setTimeout(() => {
      N.searchDirectory(q, { kind, ...filters, limit: 400 })
        .then((r) => {
          if (token.current !== my) return;
          setRes(r);
          if (r.rows.length) return;
          const term = q.trim();
          if (!term) { setErr('No name matches those filters.'); return; }
          /* Nothing shipped carries this spelling. Ask the census before
             telling the user it does not exist — that is the whole difference
             between "we have not heard of it" and "it is not a name". */
          setBusyFb(true);
          return N.census(term)
            .then((c) => {
              if (token.current !== my) return;
              if (c) setFallback({ name: term, census: c });
              else setErr(`Nothing anywhere has "${term}" — not the directory, not the population census.`);
            })
            .catch(() => { if (token.current === my) setErr(`No name matches "${term}".`); })
            .finally(() => { if (token.current === my) setBusyFb(false); });
        })
        .catch((e) => { if (token.current === my) { setRes({ total: 0, rows: [] }); setErr(e.message); } })
        .finally(() => { if (token.current === my) setBusy(false); });
    }, q.trim() ? 320 : 0);
    return () => clearTimeout(t);
  }, [q, tab, filters.cc, filters.lang, filters.comm, filters.reg]);   // eslint-disable-line

  if (open) return <Record name={open} onBack={() => setOpen(null)} />;

  const chip = (key, value, label, n) => (
    <button key={key + value} className={`cat ${filters[key] === value ? 'on' : ''}`}
      onClick={() => setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value }))}>
      {label}{n ? ` · ${n}` : ''}</button>);

  return (<>
    <div className="cats">
      {TABS.map((t) => (
        <button key={t.id} className={`cat ${tab === t.id ? 'on' : ''}`}
          onClick={() => { setTab(t.id); setErr(''); }}>
          <Icon n={t.i} size={13} /> {t.n}</button>))}
    </div>

    {tab === 'look' ? (<>
      <form className="search" onSubmit={(e) => {
        e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
        if (q.trim()) setOpen(q.trim());
      }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Any name, even one not in the directory…" autoComplete="off" spellCheck="false" />
      </form>
      <div className="btnrow">
        {['Rakheja', 'Mangatram', 'Raheja', 'Manchanda', 'Saluja', 'Grover'].map((x) => (
          <button key={x} className="cat" onClick={() => { setQ(x); setOpen(x); }}>{x}</button>))}
      </div>
      <div className="note" style={{ marginTop: 12 }}>
        This looks a name up live against the population census as well as the
        registers, so it works for ordinary names the directory does not carry —
        Rakheja is carried by 1,033 people, Mangatram by 586. If nothing has it,
        the page says so rather than inventing an answer.
      </div>
    </>) : (<>
      <div className="search">
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder={meta ? `Search ${fmt(meta.total)} names…` : 'Search names…'}
          autoComplete="off" spellCheck="false" />
        <button onClick={() => setShowF((v) => !v)} aria-label="Filters"
          style={{ background: 'none', border: 0, color: anyFilter ? 'var(--green)' : 'var(--fg3)',
            display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon n="filter" size={17} /></button>
      </div>

      {showF && (<>
        {!fac && <Spin t="Counting the directory" />}
        {fac && (<>
          <div className="dim sm" style={{ margin: '2px 0 6px' }}>Country</div>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className={`cat ${!filters.cc ? 'on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, cc: '' }))}>Any</button>
            {fac.cc.map((x) => chip('cc', x.k, CC_NAME[x.k] || x.k, x.n))}
          </div>
          <div className="dim sm" style={{ margin: '10px 0 6px' }}>Community</div>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className={`cat ${!filters.comm ? 'on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, comm: '' }))}>Any</button>
            {fac.comm.slice(0, 18).map((x) => chip('comm', x.k, x.k, x.n))}
          </div>
          <div className="dim sm" style={{ margin: '10px 0 6px' }}>Region</div>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className={`cat ${!filters.reg ? 'on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, reg: '' }))}>Any</button>
            {fac.reg.slice(0, 20).map((x) => chip('reg', x.k, x.k, x.n))}
          </div>
          <div className="dim sm" style={{ margin: '10px 0 6px' }}>Language</div>
          <div className="btnrow" style={{ marginTop: 0 }}>
            <button className={`cat ${!filters.lang ? 'on' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, lang: '' }))}>Any</button>
            {fac.lang.slice(0, 16).map((x) => chip('lang', x.k, x.k, x.n))}
          </div>
          {anyFilter && (
            <button className="btn ghost sm" style={{ marginTop: 10, width: '100%' }}
              onClick={() => setFilters({ cc: '', lang: '', comm: '', reg: '' })}>Clear all filters</button>)}
        </>)}
      </>)}

      {busy && <Spin t="Searching the directory" />}
      {!busy && busyFb && <Spin t={`"${q.trim()}" is not in the directory — checking the census`} />}

      {!busy && !busyFb && fallback && (() => {
        const c = fallback.census;
        const main = (c.surname?.people || 0) >= (c.given?.people || 0) ? c.surname : c.given;
        return (
          <Card style={{ marginTop: 10, borderColor: 'rgba(0,255,156,.3)' }}>
            <div className="chead"><Icon n="check" size={15} /> Found in the population census</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 20 }}>{fallback.name}</b>
              <span className="dim sm">{fmt(main.people)} people carry it
                {main.top ? ` · mostly in ${main.top}` : ''}</span>
            </div>
            <p className="dim sm" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
              This name is not in the shipped directory, because no encyclopedia
              lists it — that only happens when nobody notable carries it, not
              when the name is rare or invented.
            </p>
            <button className="btn" style={{ width: '100%', marginTop: 10 }}
              onClick={() => setOpen(fallback.name)}>Open the full record</button>
          </Card>);
      })()}

      {!busy && !busyFb && err && <div className="state"><span>{err}</span></div>}
      {!busy && res.rows.length > 0 && (<>
        <div className="dim sm" style={{ margin: '10px 0 8px' }}>
          {res.total > res.rows.length
            ? `${fmt(res.rows.length)} of ${fmt(res.total)} names`
            : `${fmt(res.total)} name${res.total === 1 ? '' : 's'}`}
          {meta && !q.trim() && !anyFilter && ` · ${fmt(meta.surnames)} surnames, ${fmt(meta.given)} first names`}
        </div>
        <div className="list">
          {res.rows.map((r) => (
            <button className="row" key={r.n} onClick={() => setOpen(r.n)}
              style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%' }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--s2)',
                display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--green)',
                fontWeight: 800, fontSize: 14 }}>{r.n[0]}</span>
              <div className="main" style={{ minWidth: 0 }}>
                <b>{r.n}</b>
                <span className="dim sm">
                  {[r.k === 'given' ? (r.g === 'm' ? 'first name, male' : r.g === 'f' ? 'first name, female' : 'first name') : 'surname',
                    (r.comm || [])[0], (r.reg || []).slice(0, 2).join(' & '), (r.l || [])[0]]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>
              {r.b > 0 && <span className="dim" style={{ fontSize: 10.5, flex: '0 0 auto' }}>{fmt(r.b)}</span>}
              <Icon n="chevron" size={15} style={{ color: 'var(--fg3)', flex: '0 0 auto' }} />
            </button>))}
        </div>
        {res.total > res.rows.length && (
          <div className="dim sm" style={{ marginTop: 10, textAlign: 'center' }}>
            Narrow the search to see the rest.</div>)}
      </>)}

      {meta && (
        <div className="src"><span className="dot" />
          <span>{fmt(meta.total)} names · {fmt(meta.withProse)} with a sourced description ·
            {' '}{fmt(meta.withCommunity)} with community · {fmt(meta.withRegion)} with region</span></div>)}
    </>)}
  </>);
}

export default Names;
