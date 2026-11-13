/**
 * Classic Books — a free public-domain library, readable in the app.
 *
 * Tens of thousands of classics whose copyright has expired: search by
 * title or author, filter by language, open the full text right here, or
 * download the EPUB/text file. This replaces the separate trip people
 * make to a book site for anything from Shakespeare to Premchand.
 */
import React, { useEffect, useState } from 'react';
import { jget } from '../core/engine';
import { Icon } from '../ui/icons';
import { Card, Spin, Err, Empty, Search, fmt } from '../ui/kit';

const API = 'https://gutendex.com/books';
const textUrl = (b) => b.formats['text/plain; charset=utf-8'] || b.formats['text/plain'] || '';
const epubUrl = (b) => b.formats['application/epub+zip'] || '';

function Reader({ book, onBack }) {
  const [txt, setTxt] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setTxt(null); setErr('');
    jget(textUrl(book), { text: true, proxy: true, ms: 60000 }).then((t) => {
      if (!alive) return;
      let s = String(t);
      const start = s.indexOf('*** START OF');
      if (start >= 0) s = s.slice(s.indexOf('\n', start) + 1);
      const end = s.indexOf('*** END OF');
      if (end >= 0) s = s.slice(0, end);
      setTxt(s);
    }).catch((e) => { if (alive) setErr(e.message || 'Could not fetch the text'); });
    return () => { alive = false; };
  }, [book]);
  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> Library</button>
    <div className="chead" style={{ marginTop: 8 }}>{book.title}</div>
    <div className="dim sm">{(book.authors || []).map((a) => a.name).join(', ')}</div>
    {err && (<>
      <Err error={err} retry={onBack} />
      <a className="btn" style={{ marginTop: 8 }} href={textUrl(book)} target="_blank" rel="noreferrer">Open the text directly</a>
    </>)}
    {!txt && !err && <Spin t="Fetching the book — this can take a few seconds" />}
    {txt && (<Card style={{ marginTop: 10 }}>
      <div style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {txt.slice(0, 300000)}
      </div>
      {txt.length > 300000 && (<div className="dim sm" style={{ marginTop: 10 }}>
        Showing the first part — <a href={textUrl(book)} target="_blank" rel="noreferrer" style={{ color: 'var(--green)' }}>open the full text</a> or download it below.
      </div>)}
    </Card>)}
  </>);
}

function BookCard({ b, onRead }) {
  const cover = b.formats['image/jpeg'];
  return (<div className="col">
    <div style={{ display: 'flex', gap: 10 }}>
      {cover && <img src={cover} alt="" loading="lazy" style={{ width: 46, height: 68, objectFit: 'cover', borderRadius: 5 }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="main" style={{ minWidth: 0 }}>
        <b style={{ fontSize: 14 }}>{b.title}</b>
        <span className="dim sm" style={{ display: 'block' }}>
          {(b.authors || []).map((a) => `${a.name}${a.birth_year ? ` (${a.birth_year}–${a.death_year || ''})` : ''}`).join(', ') || 'Unknown author'}
        </span>
        <span className="dim sm" style={{ display: 'block' }}>
          {(b.languages || []).join(', ').toUpperCase()} · {fmt(b.download_count)} downloads
        </span>
      </div>
    </div>
    {(b.subjects || []).length > 0 && (
      <div className="btnrow" style={{ marginTop: 6 }}>
        {b.subjects.slice(0, 3).map((s) => <span key={s} className="tag">{s.split(' -- ')[0]}</span>)}
      </div>)}
    <div className="btnrow" style={{ marginTop: 8 }}>
      {textUrl(b) && <button className="btn sm" onClick={() => onRead(b)}><Icon n="book" size={14} /> Read</button>}
      {epubUrl(b) && <a className="btn ghost sm" href={epubUrl(b)} target="_blank" rel="noreferrer"><Icon n="download" size={14} /> EPUB</a>}
      {textUrl(b) && <a className="btn ghost sm" href={textUrl(b)} target="_blank" rel="noreferrer">Text file</a>}
    </div>
  </div>);
}

export function ClassicBooks() {
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [page, setPage] = useState(null);       // {results, next, previous, count}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState(null);

  const load = async (url) => {
    setBusy(true); setErr('');
    try { setPage(await jget(url, { proxy: true, ms: 45000 })); }
    catch (e) { setErr(e.message || 'Could not reach the library'); }
    setBusy(false);
  };
  const search = (qq, ll) => {
    const p = new URLSearchParams();
    if (qq?.trim()) p.set('search', qq.trim());
    if (ll) p.set('languages', ll);
    load(`${API}?${p}`);
  };
  useEffect(() => { load(API); }, []);

  if (reading) return <Reader book={reading} onBack={() => setReading(null)} />;

  return (<>
    <Search value={q} onChange={setQ} onSubmit={() => search(q, lang)} ph="Title or author, e.g. Tagore, Austen, Premchand" />
    <div className="btnrow">
      {[['', 'All languages'], ['en', 'English'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['mr', 'Marathi'], ['ta', 'Tamil']].map(([v, n]) => (
        <button key={v} className={`cat ${lang === v ? 'on' : ''}`}
          onClick={() => { setLang(v); search(q, v); }}>{n}</button>))}
    </div>
    <div className="btnrow">
      <span className="dim sm">Popular:</span>
      {['Shakespeare', 'Tagore', 'Dickens', 'Austen', 'Premchand', 'Twain', 'Doyle'].map((x) => (
        <button key={x} className="cat" onClick={() => { setQ(x); search(x, lang); }}>{x}</button>))}
    </div>
    {busy && <Spin t="Searching the library" />}
    {err && <Err error={err} retry={() => search(q, lang)} />}
    {page && !busy && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>{fmt(page.count)} books in the library</div>
      {page.results.length === 0 && <Empty t="No book matches that search" />}
      <div className="list">
        {page.results.map((b) => <BookCard key={b.id} b={b} onRead={setReading} />)}
      </div>
      <div className="btnrow" style={{ marginTop: 10 }}>
        {page.previous && <button className="btn ghost" style={{ flex: 1 }} onClick={() => load(page.previous)}>‹ Previous</button>}
        {page.next && <button className="btn ghost" style={{ flex: 1 }} onClick={() => load(page.next)}>Next ›</button>}
      </div>
      <div className="src"><span className="dot" /><span>Public-domain classics — free to read and download, no account</span></div>
    </>)}
  </>);
}

export default ClassicBooks;
