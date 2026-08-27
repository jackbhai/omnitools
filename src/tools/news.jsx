/**
 * News — every country, every topic, every publisher, searchable and filterable.
 *
 * Five tabs, and each one is a different QUESTION rather than a different
 * layout of the same feed:
 *
 *   Headlines — what is happening where I am (or any of 52 editions)
 *   Topics    — one subject across Google's section AND the papers that cover it
 *   Search    — a phrase, optionally pinned to a place and a time window
 *   Sources   — pick the mastheads I trust and read only those
 *   Deep      — the same story seen through GDELT's 100k outlets, plus the
 *               two specialist feeds that beat general news at their subject
 *
 * The filter bar is shared and works on whatever is loaded, with no refetch:
 * text, publisher, freshness, has-a-picture. That is the difference between a
 * feed and a system you can actually interrogate.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as N from '../core/news';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty } from '../ui/kit';

const TABS = [
  { id: 'top',    n: 'Headlines', i: 'news'   },
  { id: 'topic',  n: 'Topics',    i: 'grid'   },
  { id: 'search', n: 'Search',    i: 'search' },
  { id: 'source', n: 'Sources',   i: 'list'   },
  { id: 'deep',   n: 'Deep',      i: 'earth'  },
];

const FRESH = [
  { v: 0,        l: 'Any time' },
  { v: 36e5,     l: 'Last hour' },
  { v: 6 * 36e5, l: '6 hours' },
  { v: 864e5,    l: '24 hours' },
  { v: 3 * 864e5,l: '3 days' },
];

/* -------------------------------------------------------------- article row */
function Article({ it }) {
  return (
    <a className="row" href={it.link} target="_blank" rel="noreferrer"
      style={{ textDecoration: 'none', alignItems: 'flex-start', gap: 11 }}>
      {it.img
        ? <img src={it.img} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ width: 78, height: 62, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto', background: 'var(--s2)' }} />
        : <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--s2)',
            display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--fg3)' }}>
            <Icon n="news" size={17} /></span>}
      <div className="main" style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13.5, lineHeight: 1.33, display: 'block' }}>{it.title}</b>
        {it.desc && <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.4, display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 3 }}>{it.desc}</span>}
        <span className="dim" style={{ fontSize: 10.5, marginTop: 4, display: 'block' }}>
          <b style={{ color: 'var(--cyan)' }}>{it.source}</b>
          {it.ts ? ` · ${N.timeAgo(it.ts)}` : ''}
          {it.points ? ` · ▲${it.points}` : ''}
          {it.comments ? ` · ${it.comments} comments` : ''}
        </span>
      </div>
    </a>
  );
}

/* --------------------------------------------------------------- filter bar */
function Filters({ items, f, setF }) {
  const sources = useMemo(() => N.sourceCounts(items).slice(0, 24), [items]);
  const [open, setOpen] = useState(false);
  const active = !!(f.q || f.source || f.since || f.hasImage);
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="search" style={{ marginBottom: 8 }}>
        <Icon n="search" size={17} />
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
          placeholder="Filter these headlines…" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" spellCheck="false" />
        <button onClick={() => setOpen((o) => !o)} aria-label="More filters"
          style={{ background: 'none', border: 0, color: active ? 'var(--green)' : 'var(--fg3)',
            display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon n="filter" size={17} /></button>
      </div>
      {open && (<>
        <div className="btnrow">
          {FRESH.map((x) => (
            <button key={x.v} className={`cat ${f.since === x.v ? 'on' : ''}`}
              onClick={() => setF({ ...f, since: x.v })}>{x.l}</button>))}
          <button className={`cat ${f.hasImage ? 'on' : ''}`}
            onClick={() => setF({ ...f, hasImage: !f.hasImage })}>With picture</button>
        </div>
        {sources.length > 1 && (
          <div className="btnrow">
            <button className={`cat ${!f.source ? 'on' : ''}`} onClick={() => setF({ ...f, source: '' })}>
              All sources</button>
            {sources.map(([s, n]) => (
              <button key={s} className={`cat ${f.source === s ? 'on' : ''}`}
                onClick={() => setF({ ...f, source: f.source === s ? '' : s })}>
                {s.length > 22 ? s.slice(0, 22) + '…' : s} · {n}</button>))}
          </div>)}
      </>)}
    </div>
  );
}

/* ------------------------------------------------------------------- shell */
const emptyF = { q: '', source: '', since: 0, hasImage: false };

export function News() {
  const [tab, setTab] = useState('top');
  const [edIdx, setEdIdx] = useState(() => {
    const saved = +(localStorage.getItem('omni:news:ed') || '');
    return Number.isInteger(saved) && N.EDITIONS[saved] ? saved : 0;
  });
  const [topic, setTopic] = useState('TOP');
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState(emptyF);
  const [q, setQ] = useState('');
  const [place, setPlace] = useState('');
  const [within, setWithin] = useState('');
  const [picked, setPicked] = useState(['thehindu', 'bbc', 'guardian', 'aljazeera']);
  const [deepMode, setDeepMode] = useState('gdelt');
  const [deepCC, setDeepCC] = useState('india');
  const token = useRef(0);

  const edition = N.EDITIONS[edIdx] || N.EDITIONS[0];
  useEffect(() => { localStorage.setItem('omni:news:ed', String(edIdx)); }, [edIdx]);

  const load = async (fn, label) => {
    const my = ++token.current;
    setBusy(true); setErr(''); setErrors([]);
    try {
      const r = await fn();
      if (token.current !== my) return;
      const list = Array.isArray(r) ? r : (r.items || []);
      setItems(list); setErrors(Array.isArray(r) ? [] : (r.errors || []));
      if (!list.length) setErr(`${label} returned nothing. Try another edition or topic.`);
    } catch (e) {
      if (token.current !== my) return;
      setItems([]); setErr(e.message === 'Failed to fetch'
        ? 'Could not reach the news relay. Check your connection and retry.'
        : `Could not load: ${e.message}`);
    } finally { if (token.current === my) setBusy(false); }
  };

  /* Headlines and Topics reload on their own when the knobs change. Search and
     Sources are explicit — nobody wants a fetch on every keystroke. */
  useEffect(() => {
    if (tab === 'top')   load(() => N.headlines(edition, 'TOP'), 'This edition');
    if (tab === 'topic') load(() => N.topicFeed(topic, edition), 'This topic');
  }, [tab, edIdx, topic]);   // eslint-disable-line

  const shown = useMemo(() => N.filterItems(items, f), [items, f]);

  return (<>
    <div className="cats">
      {TABS.map((t) => (
        <button key={t.id} className={`cat ${tab === t.id ? 'on' : ''}`}
          onClick={() => { setTab(t.id); setF(emptyF); if (t.id !== 'top' && t.id !== 'topic') { setItems([]); setErr(''); } }}>
          <Icon n={t.i} size={13} /> {t.n}</button>))}
    </div>

    {/* ---------------- edition picker, shared by Headlines / Topics / Search */}
    {tab !== 'deep' && tab !== 'source' && (
      <div className="btnrow" style={{ marginTop: 4 }}>
        {N.EDITIONS.map((e, i) => (
          <button key={i} className={`cat ${i === edIdx ? 'on' : ''}`} onClick={() => setEdIdx(i)}>
            {e.name}{e.lang !== 'English' ? ` · ${e.lang}` : ''}</button>))}
      </div>)}

    {tab === 'topic' && (
      <div className="btnrow">
        {N.TOPICS.map((t) => (
          <button key={t.id} className={`cat ${topic === t.id ? 'on' : ''}`} onClick={() => setTopic(t.id)}>
            <Icon n={t.i} size={13} /> {t.n}</button>))}
      </div>)}

    {/* ---------------- search controls */}
    {tab === 'search' && (
      <Card style={{ marginTop: 10 }}>
        <form className="search" style={{ marginBottom: 8 }} onSubmit={(e) => {
          e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
          if (q.trim()) load(() => N.searchNews(q, { edition, place, within }), 'That search');
        }}>
          <Icon n="search" size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
            placeholder="Any subject, person, company…" autoComplete="off" spellCheck="false" />
        </form>
        <div className="g2" style={{ gap: 8 }}>
          <div className="fld"><label>Place (optional)</label>
            <input value={place} onChange={(e) => setPlace(e.target.value)}
              placeholder="Delhi, Kerala, Lahore…" autoComplete="off" /></div>
          <div className="fld"><label>Published</label>
            <select value={within} onChange={(e) => setWithin(e.target.value)}>
              <option value="">Any time</option>
              <option value="1h">Last hour</option>
              <option value="1d">Last 24 hours</option>
              <option value="7d">Last week</option>
              <option value="1m">Last month</option>
              <option value="1y">Last year</option>
            </select></div>
        </div>
        <div className="btnrow" style={{ marginTop: 8 }}>
          {['Delhi', 'Mumbai', 'Bengaluru', 'Lucknow', 'Chandigarh', 'Kerala', 'Punjab'].map((c) => (
            <button key={c} className={`cat ${place === c ? 'on' : ''}`}
              onClick={() => setPlace(place === c ? '' : c)}>{c}</button>))}
        </div>
        <button className="btn" style={{ marginTop: 10, width: '100%' }} disabled={!q.trim() || busy}
          onClick={() => load(() => N.searchNews(q, { edition, place, within }), 'That search')}>
          {busy ? 'Searching…' : 'Search news'}</button>
        <div className="src"><span className="dot" />
          <span>Searches every publisher the index covers, in {edition.lang}</span></div>
      </Card>)}

    {/* ---------------- source picker */}
    {tab === 'source' && (
      <Card style={{ marginTop: 10 }}>
        <div className="chead">Pick your papers · {picked.length} selected</div>
        {['IN', 'GB', 'US', 'QA', 'DE', 'FR', 'SG', 'PK'].map((cc) => {
          const group = N.PUBLISHERS.filter((p) => p.cc === cc);
          if (!group.length) return null;
          const label = { IN: 'India', GB: 'United Kingdom', US: 'United States',
            QA: 'Qatar', DE: 'Germany', FR: 'France', SG: 'Singapore', PK: 'Pakistan' }[cc];
          return (
            <div key={cc} style={{ marginTop: 8 }}>
              <div className="dim sm" style={{ marginBottom: 4 }}>{label}</div>
              <div className="btnrow">
                {group.map((p) => (
                  <button key={p.id} className={`cat ${picked.includes(p.id) ? 'on' : ''}`}
                    onClick={() => setPicked((v) => v.includes(p.id)
                      ? v.filter((x) => x !== p.id) : [...v, p.id].slice(-12))}>{p.n}</button>))}
              </div>
            </div>);
        })}
        <button className="btn" style={{ marginTop: 12, width: '100%' }} disabled={!picked.length || busy}
          onClick={() => load(() => N.publisherFeed(picked), 'Those sources')}>
          {busy ? 'Reading…' : `Read ${picked.length} source${picked.length > 1 ? 's' : ''}`}</button>
        <div className="src"><span className="dot" />
          <span>Up to 12 at once · read straight from each paper's own feed</span></div>
      </Card>)}

    {/* ---------------- deep */}
    {tab === 'deep' && (
      <Card style={{ marginTop: 10 }}>
        <div className="btnrow">
          {[['gdelt', 'World monitor'], ['hn', 'Developer'], ['space', 'Spaceflight']].map(([v, l]) => (
            <button key={v} className={`cat ${deepMode === v ? 'on' : ''}`} onClick={() => setDeepMode(v)}>{l}</button>))}
        </div>
        {deepMode === 'gdelt' && (<>
          <p className="dim sm" style={{ margin: '10px 0 6px' }}>
            Reads 100,000+ outlets in 65 languages, including papers no aggregator lists.
            It is thorough rather than fast — give it up to half a minute.
          </p>
          <div className="btnrow">
            {N.GDELT_COUNTRIES.map(([v, l]) => (
              <button key={v} className={`cat ${deepCC === v ? 'on' : ''}`}
                onClick={() => setDeepCC(deepCC === v ? '' : v)}>{l}</button>))}
          </div>
          <form className="search" style={{ margin: '8px 0' }} onSubmit={(e) => {
            e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
            load(() => N.gdelt(q || '', { country: deepCC, days: 1, limit: 60 }), 'The world monitor');
          }}>
            <Icon n="search" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
              placeholder="Subject (leave blank for everything)" autoComplete="off" />
          </form>
          <button className="btn" style={{ width: '100%' }} disabled={busy}
            onClick={() => load(() => N.gdelt(q || '', { country: deepCC, days: 1, limit: 60 }), 'The world monitor')}>
            {busy ? 'Scanning the world…' : 'Scan'}</button>
        </>)}
        {deepMode === 'hn' && (<>
          <p className="dim sm" style={{ margin: '10px 0 8px' }}>
            Hacker News, newest first, with points and comment counts.</p>
          <form className="search" style={{ marginBottom: 8 }} onSubmit={(e) => {
            e.preventDefault(); load(() => N.hackerNews({ q, limit: 40 }), 'Hacker News'); }}>
            <Icon n="search" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (optional)" />
          </form>
          <button className="btn" style={{ width: '100%' }} disabled={busy}
            onClick={() => load(() => N.hackerNews({ q, limit: 40 }), 'Hacker News')}>
            {busy ? 'Loading…' : 'Load'}</button>
        </>)}
        {deepMode === 'space' && (<>
          <p className="dim sm" style={{ margin: '10px 0 8px' }}>
            Launches, missions and astronomy from 35,000+ indexed articles.</p>
          <form className="search" style={{ marginBottom: 8 }} onSubmit={(e) => {
            e.preventDefault(); load(() => N.spaceNews({ q, limit: 40 }), 'Spaceflight news'); }}>
            <Icon n="search" size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ISRO, Artemis, Mars…" />
          </form>
          <button className="btn" style={{ width: '100%' }} disabled={busy}
            onClick={() => load(() => N.spaceNews({ q, limit: 40 }), 'Spaceflight news')}>
            {busy ? 'Loading…' : 'Load'}</button>
        </>)}
      </Card>)}

    {/* ---------------- results */}
    {busy && <Spin t={tab === 'deep' && deepMode === 'gdelt' ? 'Scanning the world monitor' : 'Reading the papers'} />}

    {!busy && err && (
      <div className="err" style={{ marginTop: 12 }}>
        <h4>Nothing came back</h4><p>{err}</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => {
          if (tab === 'top') load(() => N.headlines(edition, 'TOP'), 'This edition');
          else if (tab === 'topic') load(() => N.topicFeed(topic, edition), 'This topic');
          else if (tab === 'search') load(() => N.searchNews(q, { edition, place, within }), 'That search');
          else if (tab === 'source') load(() => N.publisherFeed(picked), 'Those sources');
          else load(() => N.gdelt(q || '', { country: deepCC, days: 1, limit: 60 }), 'The world monitor');
        }}>Retry</button>
      </div>)}

    {!busy && items.length > 0 && (<>
      <Filters items={items} f={f} setF={setF} />
      <div className="dim sm" style={{ margin: '0 0 8px' }}>
        {shown.length === items.length
          ? `${items.length} stories`
          : `${shown.length} of ${items.length} stories`}
        {errors.length > 0 && ` · ${errors.length} feed${errors.length > 1 ? 's' : ''} unreachable`}
      </div>
      {shown.length === 0
        ? <Empty t="Nothing matches those filters" />
        : <div className="list">{shown.map((it, i) => <Article key={it.link + i} it={it} />)}</div>}
      <div className="src"><span className="dot" />
        <span>{tab === 'deep' && deepMode === 'gdelt' ? 'World news monitor'
          : tab === 'deep' && deepMode === 'hn' ? 'Hacker News'
          : tab === 'deep' ? 'Spaceflight index'
          : `Aggregator + publisher feeds · ${edition.name} · ${edition.lang}`}</span></div>
    </>)}
  </>);
}

export default News;
