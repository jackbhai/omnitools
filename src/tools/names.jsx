/**
 * Names & surnames directory.
 *
 * Search any name and get the whole picture: what kind of name it is, what it
 * means, the language and script it comes from, which countries use it, its
 * age and gender skew, and the recorded people who carry it.
 *
 * Or browse: 60 Indian surnames with their community and region, 32 Indian
 * first names with their meanings, 41 world surnames. Every entry in those
 * lists is one the deep lookup can actually answer for.
 */
import React, { useMemo, useRef, useState } from 'react';
import * as N from '../core/names';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty, fmt } from '../ui/kit';

const TABS = [
  { id: 'look',  n: 'Look up',   i: 'search' },
  { id: 'in-sur',n: 'Surnames',  i: 'list'   },
  { id: 'in-name',n: 'First names', i: 'smile' },
  { id: 'world', n: 'World',     i: 'earth'  },
];

const Bar = ({ p, tone = 'var(--green)' }) => (
  <span style={{ display: 'block', height: 4, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden' }}>
    <span style={{ display: 'block', height: '100%', width: `${Math.round(p * 100)}%`, background: tone }} />
  </span>
);

function Result({ d, onPick }) {
  const s = d.stats || {};
  const best = d.best;
  const [showAll, setShowAll] = useState(false);
  const [people, setPeople] = useState(null);
  const [busyP, setBusyP] = useState(false);

  const loadPeople = async () => {
    setBusyP(true);
    try { setPeople(await N.bearers(d.query, { limit: 40 })); }
    catch { setPeople([]); }
    finally { setBusyP(false); }
  };

  return (<>
    <Card style={{ marginTop: 12 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: .8, margin: 0 }}
        className="gradtext">{d.query}</h2>
      {best?.native && best.native !== d.query && (
        <div style={{ fontSize: 19, marginTop: 4, color: 'var(--cyan)' }}>{best.native}</div>)}
      <div className="btnrow" style={{ marginTop: 8 }}>
        {best?.kind && <span className="pill on">{best.kind}</span>}
        {best?.language && <span className="pill">{best.language}</span>}
        {best?.bearers > 0 && <span className="pill">{fmt(best.bearers)} recorded people</span>}
        {s.gender && <span className="pill">{s.gender === 'male' ? 'Mostly male' : 'Mostly female'}
          {s.genderProb ? ` ${Math.round(s.genderProb * 100)}%` : ''}</span>}
      </div>
      {best?.desc && <p className="dim sm" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>{best.desc}</p>}
      {best?.meaning && <div className="kv" style={{ marginTop: 8 }}>
        <span>Meaning</span><b>{best.meaning}</b></div>}
    </Card>

    {d.wiki && (
      <Card>
        <div className="chead"><Icon n="book" size={15} /> What it means</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, color: 'var(--fg2)' }}>{d.wiki.extract}</p>
        {d.wiki.url && (
          <a className="btn ghost sm" style={{ display: 'block', textAlign: 'center', marginTop: 10, textDecoration: 'none' }}
            href={d.wiki.url} target="_blank" rel="noreferrer">Read the full article</a>)}
      </Card>)}

    {s.countries?.length > 0 && (
      <Card>
        <div className="chead"><Icon n="earth" size={15} /> Where it is used</div>
        {s.countries.slice(0, 8).map((c) => (
          <div key={c.cc} style={{ marginBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
              <b>{N.countryName(c.cc)}</b>
              <span className="dim">{(c.p * 100).toFixed(1)}%</span>
            </div>
            <Bar p={c.p} />
          </div>))}
        {s.countrySample != null && (
          <div className="dim" style={{ fontSize: 10.5, marginTop: 6 }}>
            from {fmt(s.countrySample)} recorded uses</div>)}
      </Card>)}

    {(s.age != null || s.gender) && (
      <div className="g2" style={{ marginTop: 12 }}>
        {s.age != null && (
          <div className="stat"><div className="v">{s.age}</div><div className="l">Median age</div>
            {s.ageSample ? <div className="s">{fmt(s.ageSample)} samples</div> : null}</div>)}
        {s.gender && (
          <div className="stat">
            <div className="v" style={{ fontSize: 17 }}>{s.gender === 'male' ? 'Male' : 'Female'}</div>
            <div className="l">Usually</div>
            {s.genderProb ? <div className="s">{Math.round(s.genderProb * 100)}% confident</div> : null}</div>)}
      </div>)}

    {s.quota && (
      <div className="note warn" style={{ marginTop: 12 }}>
        The free usage-statistics allowance for today is spent — that is a shared
        limit of 100 lookups per day, not a fault. Country, age and gender will
        return tomorrow. Everything above still comes from the name register and
        the encyclopedia.
      </div>)}

    {d.facts.length > 1 && (
      <Card>
        <div className="chead">This name is registered {d.facts.length} ways</div>
        {(showAll ? d.facts : d.facts.slice(0, 3)).map((f) => (
          <div className="kv" key={f.qid}>
            <span>{f.kind || 'name'}</span>
            <b style={{ fontSize: 12 }}>{f.language || '—'}{f.bearers ? ` · ${fmt(f.bearers)} people` : ''}</b>
          </div>))}
        {d.facts.length > 3 && (
          <button className="btn ghost sm" style={{ marginTop: 8, width: '100%' }}
            onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : 'Show all'}</button>)}
      </Card>)}

    <Card>
      <div className="chead"><Icon n="smile" size={15} /> People with this name</div>
      {!people && !busyP && (
        <button className="btn" style={{ width: '100%' }} onClick={loadPeople}>
          Show recorded people{best?.bearers ? ` · ${fmt(best.bearers)}` : ''}</button>)}
      {busyP && <Spin t="Reading the register" />}
      {people?.length > 0 && (
        <div className="list" style={{ marginTop: 4 }}>
          {people.map((p) => (
            <a className="row" key={p.qid} href={p.url} target="_blank" rel="noreferrer"
              style={{ textDecoration: 'none' }}>
              {p.img
                ? <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
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

    <div className="src"><span className="dot" />
      <span>{d.sources.length ? `Merged from ${d.sources.length}: ${d.sources.join(', ')}`
        : 'No source recognised this name'}</span></div>
  </>);
}

export function Names() {
  const [tab, setTab] = useState('look');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const token = useRef(0);

  const run = async (name) => {
    const my = ++token.current;
    setBusy(true); setErr(''); setD(null); setTab('look'); setQ(name);
    try {
      const r = await N.lookup(name);
      if (token.current !== my) return;
      if (!r.facts.length && !r.wiki && !r.stats.countries.length) {
        setErr(`Nothing is recorded for "${name}". Check the spelling, or try the surname on its own.`);
      } else setD(r);
    } catch (e) {
      if (token.current !== my) return;
      setErr(e.message === 'Failed to fetch'
        ? 'Could not reach the name register. Check your connection and retry.' : e.message);
    } finally { if (token.current === my) setBusy(false); }
  };

  const dir = N.DIRECTORIES.find((x) => x.id === tab);
  const list = useMemo(() => {
    if (!dir) return [];
    const s = filter.trim().toLowerCase();
    return s ? dir.list.filter((x) => (x.n + ' ' + x.note).toLowerCase().includes(s)) : dir.list;
  }, [dir, filter]);

  return (<>
    <div className="cats">
      {TABS.map((t) => (
        <button key={t.id} className={`cat ${tab === t.id ? 'on' : ''}`}
          onClick={() => { setTab(t.id); setFilter(''); }}>
          <Icon n={t.i} size={13} /> {t.n}</button>))}
    </div>

    {tab === 'look' && (<>
      <form className="search" onSubmit={(e) => {
        e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
        if (q.trim()) run(q.trim());
      }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Any first name or surname…" autoComplete="off" spellCheck="false" />
      </form>
      <div className="btnrow">
        {['Sharma', 'Singh', 'Patel', 'Priya', 'Aarav', 'Khan', 'Nair'].map((x) => (
          <button key={x} className="cat" onClick={() => run(x)}>{x}</button>))}
      </div>
    </>)}

    {dir && (<>
      <div className="search" style={{ marginTop: 4 }}>
        <Icon n="search" size={17} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${dir.list.length} names…`} autoComplete="off" spellCheck="false" />
      </div>
      <div className="dim sm" style={{ margin: '0 0 8px' }}>
        {list.length === dir.list.length ? `${list.length} names` : `${list.length} of ${dir.list.length}`}
        {' · tap any for the full record'}
      </div>
      {list.length === 0
        ? <Empty t="No name matches that" />
        : <div className="list">
            {list.map((x) => (
              <button className="row" key={x.n} onClick={() => run(x.n)}
                style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%' }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--s2)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--green)',
                  fontWeight: 800, fontSize: 14 }}>{x.n[0]}</span>
                <div className="main"><b>{x.n}</b><span className="dim sm">{x.note}</span></div>
                <Icon n="chevron" size={15} style={{ color: 'var(--fg3)' }} />
              </button>))}
          </div>}
    </>)}

    {busy && <Spin t="Reading the name register" />}
    {!busy && err && (
      <div className="err" style={{ marginTop: 12 }}>
        <h4>Nothing found</h4><p>{err}</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => run(q)}>Retry</button>
      </div>)}
    {!busy && d && tab === 'look' && <Result d={d} onPick={run} />}
  </>);
}

export default Names;
