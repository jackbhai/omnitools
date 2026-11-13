/**
 * Kanoon — the penal codes, section by section.
 *
 * The Bharatiya Nyaya Sanhita (in force since July 2024) with the full
 * Gazette text of all 358 sections, and the Indian Penal Code it replaced
 * — 575 sections, still what older cases are argued under. Search by
 * section number or by words in the title, browse by chapter, or search
 * the full text. Everything is on-device: the codes work offline once a
 * chapter has been opened.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as K from '../core/bigdata';
import { Icon } from '../ui/icons';
import { Card, Spin, Err, Empty, Search, fmt } from '../ui/kit';

let CHAPMAP = { bns: {}, ipc: {} };

function SectionView({ act, index, pos, onBack, onNav }) {
  const [sec, setSec] = useState(null);
  const [err, setErr] = useState('');
  const entry = index[pos];
  useEffect(() => {
    let alive = true;
    setSec(null); setErr('');
    K.kanoonChapter(act, CHAPMAP[act][entry[2]]).then((rows) => {
      if (!alive) return;
      setSec(rows.find((r) => String(r.n) === String(entry[0])) || 'none');
    }).catch((e) => { if (alive) setErr(e.message || 'Could not load that section'); });
    return () => { alive = false; };
  }, [act, pos, entry]);
  if (err) return <Err error={err} retry={onBack} />;
  if (!sec) return <Spin t="Loading section" />;
  if (sec === 'none') return <Empty t="Section text not found" />;
  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> {act === 'bns' ? 'BNS' : 'IPC'} sections</button>
    <Card style={{ marginTop: 10 }}>
      <div className="chead">{act === 'bns' ? 'Bharatiya Nyaya Sanhita' : 'Indian Penal Code'} · Section {sec.n}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 19 }} className="gradtext">{sec.title}</div>
      <div className="dim sm" style={{ marginTop: 2 }}>{sec.chapter}</div>
      <div style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{sec.text}</div>
    </Card>
    <div className="btnrow" style={{ marginTop: 10 }}>
      <button className="btn ghost" style={{ flex: 1 }} disabled={pos <= 0} onClick={() => onNav(pos - 1)}>‹ Previous section</button>
      <button className="btn ghost" style={{ flex: 1 }} disabled={pos >= index.length - 1} onClick={() => onNav(pos + 1)}>Next section ›</button>
    </div>
    <div className="src"><span className="dot" /><span>Reference only — not legal advice</span></div>
  </>);
}

export function Kanoon() {
  const [act, setAct] = useState('bns');
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(-1);
  const [chapOpen, setChapOpen] = useState('');
  const [textHits, setTextHits] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    K.kanoonIndex().then((d) => {
      setIdx(d);
      CHAPMAP = { bns: Object.fromEntries(d.bns.chapters.map((c, i) => [c, i])),
                  ipc: Object.fromEntries(d.ipc.chapters.map((c, i) => [c, i])) };
    }).catch((e) => setErr(e.message || 'Could not load the codes'));
  }, []);

  const data = idx ? idx[act] : null;
  const titleHits = useMemo(() => {
    if (!data || !q.trim()) return null;
    const v = q.trim().toLowerCase();
    if (/^\d+[a-z]?$/i.test(v)) {
      const p = data.index.findIndex((r) => String(r[0]).toLowerCase() === v);
      return p >= 0 ? [{ pos: p, via: 'number' }] : [];
    }
    return data.index.map((r, pos) => ({ r, pos }))
      .filter(({ r }) => r[1].toLowerCase().includes(v)).slice(0, 40)
      .map(({ r, pos }) => ({ pos, via: 'title', r }));
  }, [data, q]);

  const fullTextSearch = async () => {
    if (!data || q.trim().length < 3) return;
    setSearching(true); setTextHits(null);
    const v = q.trim().toLowerCase();
    const hits = [];
    try {
      for (let i = 0; i < data.chapters.length && hits.length < 40; i++) {
        const rows = await K.kanoonChapter(act, i);
        for (const r of rows) {
          const at = r.text.toLowerCase().indexOf(v);
          if (at >= 0) {
            const pos = data.index.findIndex((x) => String(x[0]) === String(r.n) && x[2] === r.chapter);
            hits.push({ pos, r, snip: r.text.slice(Math.max(0, at - 60), at + 90) });
            if (hits.length >= 40) break;
          }
        }
      }
      setTextHits(hits);
    } catch { setTextHits([]); }
    setSearching(false);
  };

  if (!idx && !err) return <Spin t="Loading the codes" />;
  if (err) return <Err error={err} retry={() => { setErr(''); K.kanoonIndex().then(setIdx).catch((e) => setErr(e.message)); }} />;
  if (open >= 0 && data) return <SectionView act={act} index={data.index} pos={open} onBack={() => setOpen(-1)} onNav={setOpen} />;

  return (<>
    <div className="btnrow" style={{ marginTop: 2 }}>
      <button className={`cat ${act === 'bns' ? 'on' : ''}`} onClick={() => { setAct('bns'); setOpen(-1); setTextHits(null); }}>
        BNS 2023 · {fmt(idx.bns.count)} sections</button>
      <button className={`cat ${act === 'ipc' ? 'on' : ''}`} onClick={() => { setAct('ipc'); setOpen(-1); setTextHits(null); }}>
        IPC 1860 · {fmt(idx.ipc.count)} sections</button>
    </div>
    <Search value={q} onChange={(v) => { setQ(v); setTextHits(null); }} onSubmit={fullTextSearch}
      ph={act === 'bns' ? 'Section number (103) or title (murder)' : 'Section number (302) or title (theft)'} />
    <div className="dim sm" style={{ marginTop: 2 }}>
      {act === 'bns' ? 'Current penal code, in force since 1 July 2024.' : 'Repealed for new cases since 1 July 2024 — still used for older cases.'}
    </div>

    {titleHits && (<div className="list" style={{ marginTop: 8 }}>
      {titleHits.length === 0 && <Empty t="No section matches — try the full-text search below" />}
      {titleHits.map((h) => {
        const r = data.index[h.pos];
        return (<button key={h.pos} className="row uni-row" onClick={() => setOpen(h.pos)}>
          <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 44 }}>{r[0]}</span>
          <div className="main"><b style={{ fontSize: 13.5 }}>{r[1]}</b><span className="dim sm">{r[2]}</span></div>
        </button>);
      })}
    </div>)}
    {q.trim().length >= 3 && !textHits && (
      <button className="btn ghost" style={{ marginTop: 10, width: '100%' }} disabled={searching} onClick={fullTextSearch}>
        {searching ? 'Searching full text…' : 'Search in the full text of every section'}</button>)}
    {textHits && (<div className="list" style={{ marginTop: 8 }}>
      {textHits.length === 0 && <Empty t="No section text contains that phrase" />}
      {textHits.map((h, i) => (
        <button key={i} className="row uni-row" onClick={() => h.pos >= 0 && setOpen(h.pos)}>
          <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 44 }}>{h.r.n}</span>
          <div className="main"><b style={{ fontSize: 13.5 }}>{h.r.title}</b>
            <span className="dim sm">…{h.snip}…</span></div>
        </button>))}
    </div>)}

    {!q.trim() && (<>
      <div className="dim sm" style={{ margin: '12px 0 6px' }}>Browse by chapter</div>
      {data.chapters.map((c, ci) => {
        const secs = data.index.map((r, pos) => ({ r, pos })).filter(({ r }) => r[2] === c);
        const isOpen = chapOpen === c;
        return (<div key={c} style={{ marginBottom: 6 }}>
          <button className="row uni-row" style={{ width: '100%' }} onClick={() => setChapOpen(isOpen ? '' : c)}>
            <div className="main"><b style={{ fontSize: 13.5 }}>{c.charAt(0) + c.slice(1).toLowerCase()}</b>
              <span className="dim sm">{secs.length} sections</span></div>
            <Icon n={isOpen ? 'up' : 'down'} size={15} />
          </button>
          {isOpen && (<div className="list" style={{ marginTop: 4 }}>
            {secs.map(({ r, pos }) => (
              <button key={pos} className="row uni-row" onClick={() => setOpen(pos)}>
                <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5, width: 44 }}>{r[0]}</span>
                <div className="main"><b style={{ fontSize: 13.5 }}>{r[1]}</b></div>
              </button>))}
          </div>)}
        </div>);
      })}
    </>)}
    <div className="src"><span className="dot" /><span>{act === 'bns' ? 'Full official Gazette text' : 'Section text as published'} · works offline after first use · reference only, not legal advice</span></div>
  </>);
}

export default Kanoon;
