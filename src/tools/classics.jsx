/**
 * Classic Books — a free public-domain library, readable in the app.
 *
 * Three shelves. World classics: tens of thousands of expired-copyright
 * books, searchable by title or author, readable here or as EPUB/text
 * downloads. Hindi classics: two honest sources, because the world
 * shelf's Hindi corner is nearly empty — proofread editions typed and
 * checked by volunteers (chapter by chapter, the cleanest Hindi text
 * available anywhere free), plus scanned public-domain prints whose
 * full text opens here. Urdu books ride the same scanned shelf.
 *
 * Everything here is public domain and free to read — this replaces
 * the separate trips people make to book sites for anything from
 * Shakespeare to Premchand.
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

function WorldShelf() {
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

/* ------------------------------------------- Hindi & Urdu shelves */
/* Proofread Hindi editions: each work is a set of chapter pages under
   one title; the list below was verified page by page (chapter counts
   and real text) before it was allowed onto the shelf. */
const WS_API = 'https://hi.wikisource.org/w/api.php';
const WS_WORKS = [
  { base: 'गो-दान', label: 'Godan', author: 'Premchand' },
  { base: 'कर्मभूमि', label: 'Karmabhoomi', author: 'Premchand' },
  { base: 'सेवासदन', label: 'Sevasadan', author: 'Premchand' },
  { base: 'गबन', label: 'Gaban', author: 'Premchand' },
  { base: 'निर्मला', label: 'Nirmala', author: 'Premchand' },
  { base: 'भारतेंदु-नाटकावली', label: 'Bharatendu Natakavali', author: 'Bharatendu Harishchandra' },
  { base: 'कबीर ग्रंथावली', label: 'Kabir Granthavali', author: 'Kabir' },
];

const DEV_DIGITS = '०१२३४५६७८९';
const chapterKey = (t) => {
  const s = t.replace(/[०-९]/g, (d) => DEV_DIGITS.indexOf(d));
  return (s.match(/\d+/g) || []).map(Number);
};
function chapterCmp(a, b) {
  const ka = chapterKey(a), kb = chapterKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? -1) - (kb[i] ?? -1);
    if (d) return d;
  }
  return a.localeCompare(b, 'hi');
}

async function wsChapters(base) {
  const url = `${WS_API}?action=query&list=prefixsearch&pssearch=${encodeURIComponent(base)}`
    + `&psnamespace=0&pslimit=500&format=json&origin=*`;
  const j = await jget(url, { ms: 30000 });
  return (j.query?.prefixsearch || []).map((p) => p.title)
    .filter((t) => t.startsWith(base + '/'))
    .sort(chapterCmp);
}

/** Rendered chapter HTML -> plain reading text (headers/nav removed). */
function stripWsHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('#headerContainer, .ws-noexport, .noprint, sup, .mw-editsection, script, style')
    .forEach((el) => el.remove());
  const blocks = [...doc.querySelectorAll('p, h2, h3, h4, li, blockquote, pre')]
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const t = blocks.length ? blocks.join('\n\n')
    : (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  return t.split('\n').filter((l) => !/^\d{1,5}$/.test(l.trim())).join('\n').trim();
}

async function wsChapterText(title) {
  const url = `${WS_API}?action=parse&page=${encodeURIComponent(title)}`
    + `&prop=text&redirects=1&format=json&origin=*`;
  const j = await jget(url, { ms: 45000 });
  return stripWsHtml(j.parse.text['*']);
}

function WsWork({ work, onBack }) {
  const [chapters, setChapters] = useState(null);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(-1);            // chapter index being read
  const [txt, setTxt] = useState(null);
  const [txtErr, setTxtErr] = useState('');
  useEffect(() => {
    let alive = true;
    wsChapters(work.base).then((c) => { if (alive) setChapters(c); })
      .catch((e) => { if (alive) setErr(e.message || 'Could not list the chapters'); });
    return () => { alive = false; };
  }, [work]);
  useEffect(() => {
    if (at < 0 || !chapters) return undefined;
    let alive = true;
    setTxt(null); setTxtErr('');
    wsChapterText(chapters[at]).then((t) => { if (alive) setTxt(t); })
      .catch((e) => { if (alive) setTxtErr(e.message || 'Could not fetch this chapter'); });
    window.scrollTo(0, 0);
    return () => { alive = false; };
  }, [at, chapters]);

  if (at >= 0 && chapters) return (<>
    <button className="btn ghost sm" onClick={() => setAt(-1)}><Icon n="back" size={14} /> {work.label} — chapters</button>
    <div className="chead" style={{ marginTop: 8 }}>{work.label}</div>
    <div className="dim sm">{work.author} · {chapters[at].split('/').slice(1).join('/') || `Chapter ${at + 1}`} · {at + 1} of {chapters.length}</div>
    {txtErr && <Err error={txtErr} retry={() => { const a = at; setAt(-2); setTimeout(() => setAt(a), 0); }} />}
    {!txt && !txtErr && <Spin t="Fetching the chapter" />}
    {txt && (<>
      <Card style={{ marginTop: 10 }}>
        <div className="f-dev" lang="hi" style={{ fontSize: 15.5, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{txt}</div>
      </Card>
      <div className="btnrow" style={{ marginTop: 10 }}>
        <button className="btn ghost" style={{ flex: 1 }} disabled={at <= 0} onClick={() => setAt(at - 1)}>‹ Previous</button>
        <button className="btn ghost" style={{ flex: 1 }} disabled={at >= chapters.length - 1} onClick={() => setAt(at + 1)}>Next ›</button>
      </div>
    </>)}
  </>);
  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> Hindi classics</button>
    <div className="chead" style={{ marginTop: 8 }}>{work.label}</div>
    <div className="dim sm">{work.author} · proofread edition, read chapter by chapter</div>
    {err && <Err error={err} retry={onBack} />}
    {!chapters && !err && <Spin t="Listing the chapters" />}
    {chapters && chapters.length === 0 && <Empty t="No chapters answered — try again in a moment" />}
    {chapters && chapters.length > 0 && (
      <div className="list" style={{ marginTop: 8 }}>
        {chapters.map((t, i) => (
          <button key={t} className="row" onClick={() => setAt(i)}>
            <div className="main">
              <b style={{ fontSize: 14 }}>{t.split('/').slice(1).join('/') || `Part ${i + 1}`}</b>
              <span className="dim sm">Chapter {i + 1} of {chapters.length}</span>
            </div>
            <Icon n="chevron" size={16} />
          </button>))}
      </div>)}
  </>);
}

/* Scanned public-domain prints: search the open scan library, keep
   only the items whose full text file verifiably exists, and read
   that text in slices here. A scan-only item never reaches the list. */
const IA = 'https://archive.org';
async function iaSearch(lang, term) {
  const t = term.trim().replace(/[()"]/g, ' ');
  const langPart = lang === 'ur' ? 'language:urd' : 'language:hin';
  const q = `mediatype:texts AND ${langPart} AND (title:(${t}) OR creator:(${t}))`;
  const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(q)}`
    + '&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=24&page=1&output=json';
  const j = await jget(url, { ms: 30000 });
  const docs = j.response?.docs || [];
  let scanOnly = 0;
  const probed = await Promise.all(docs.map(async (d) => {
    try {
      const meta = await jget(`${IA}/metadata/${d.identifier}`, { ms: 20000 });
      const f = (meta.files || []).find((x) => x.name.endsWith('_djvu.txt'));
      if (!f) { scanOnly++; return null; }
      return { id: d.identifier, title: d.title || d.identifier, creator: d.creator || '', year: d.year || '', file: f.name, size: +f.size || 0 };
    } catch { scanOnly++; return null; }
  }));
  return { books: probed.filter(Boolean), scanOnly, total: j.response?.numFound || 0 };
}

function IaReader({ book, lang, onBack }) {
  const [txt, setTxt] = useState(null);
  const [err, setErr] = useState('');
  const [shown, setShown] = useState(1);
  const SLICE = 80000;
  useEffect(() => {
    let alive = true;
    setTxt(null); setErr(''); setShown(1);
    const url = `${IA}/download/${book.id}/${encodeURIComponent(book.file)}`;
    jget(url, { text: true, ms: 120000 })
      .catch(() => jget(url, { text: true, ms: 120000, proxy: true }))
      .then((t) => {
        if (!alive) return;
        const s = String(t);
        if (s.trim().length < 1000) { setErr('This scan has no readable text layer. Please try another edition.'); return; }
        setTxt(s);
      })
      .catch((e) => { if (alive) setErr(e.message || 'Could not fetch the text'); });
    return () => { alive = false; };
  }, [book]);
  const pages = txt ? Math.max(1, Math.round(txt.length / 1800)) : 0;
  return (<>
    <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> {lang === 'ur' ? 'Urdu books' : 'Hindi classics'}</button>
    <div className="chead" style={{ marginTop: 8 }}>{book.title}</div>
    <div className="dim sm">{book.creator}{book.year ? ` · ${book.year}` : ''} · scanned print, full text{txt ? ` · about ${fmt(pages)} pages` : ''}</div>
    {err && (<>
      <Err error={err} retry={onBack} />
      <a className="btn" style={{ marginTop: 8 }} href={`${IA}/download/${book.id}/${encodeURIComponent(book.file)}`} target="_blank" rel="noreferrer">Open the text directly</a>
    </>)}
    {!txt && !err && <Spin t={`Fetching the book (${(book.size / 1048576).toFixed(1)} MB of scanned text) — this can take a little while`} />}
    {txt && (<>
      <Card style={{ marginTop: 10 }}>
        <div className={lang === 'ur' ? 'f-ur' : 'f-dev'} lang={lang === 'ur' ? 'ur' : 'hi'}
          dir={lang === 'ur' ? 'rtl' : 'ltr'}
          style={{ fontSize: 15.5, lineHeight: lang === 'ur' ? 2.2 : 1.9, whiteSpace: 'pre-wrap' }}>
          {txt.slice(0, shown * SLICE)}
        </div>
      </Card>
      <div className="dim sm" style={{ marginTop: 8 }}>
        Showing {fmt(Math.min(txt.length, shown * SLICE))} of {fmt(txt.length)} characters
      </div>
      {shown * SLICE < txt.length && (
        <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={() => setShown((s) => s + 1)}>
          Continue reading</button>)}
    </>)}
  </>);
}

function IndicShelf({ lang }) {
  const ur = lang === 'ur';
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState(null);   // IA book
  const [work, setWork] = useState(null);         // Wikisource work (Hindi only)
  const run = async (term) => {
    if (!term.trim()) return;
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await iaSearch(lang, term)); }
    catch (e) { setErr(e.message || 'Could not reach the scan library'); }
    setBusy(false);
  };
  useEffect(() => { run('premchand'); }, []); // eslint-disable-line

  if (work) return <WsWork work={work} onBack={() => setWork(null)} />;
  if (reading) return <IaReader book={reading} lang={lang} onBack={() => setReading(null)} />;

  return (<>
    {!ur && (<>
      <div className="seclabel">Proofread editions</div>
      <div className="dim sm" style={{ marginBottom: 6 }}>
        Typed and checked by volunteers — the cleanest Hindi texts on this shelf, read chapter by chapter.
      </div>
      <div className="list">
        {WS_WORKS.map((w) => (
          <button key={w.base} className="row" onClick={() => setWork(w)}>
            <div className="main">
              <b style={{ fontSize: 14.5 }}>{w.label}</b>
              <span className="dim sm">{w.author} · <span className="f-dev" lang="hi">{w.base}</span></span>
            </div>
            <Icon n="chevron" size={16} />
          </button>))}
      </div>
      <div className="seclabel" style={{ marginTop: 16 }}>Scanned editions</div>
    </>)}
    {ur && (
      <div className="dim sm" style={{ marginBottom: 8 }}>
        Public-domain Urdu prints from the open scan library — only books whose full text verifiably opens are listed.
      </div>)}
    {!ur && (
      <div className="dim sm" style={{ marginBottom: 8 }}>
        Century-old public-domain prints, read as scanned text. Only books whose full text verifiably opens are listed.
      </div>)}
    <Search value={q} onChange={setQ} onSubmit={() => run(q)} ph={ur ? 'Title or author, e.g. Premchand, Ghalib' : 'Title or author, e.g. Premchand, Tagore'} />
    <div className="btnrow">
      <span className="dim sm">Try:</span>
      {(ur ? ['Premchand', 'Ghalib', 'Iqbal', 'Faiz'] : ['Premchand', 'Tagore', 'Kabir', 'Tulsidas']).map((x) => (
        <button key={x} className="cat" onClick={() => { setQ(x); run(x); }}>{x}</button>))}
    </div>
    {busy && <Spin t="Searching the scans and checking which ones open" />}
    {err && <Err error={err} retry={() => run(q || 'premchand')} />}
    {res && !busy && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>
        {res.books.length} readable book{res.books.length === 1 ? '' : 's'}
        {res.scanOnly > 0 ? ` · ${res.scanOnly} more are scan-only and cannot open as text` : ''}
      </div>
      {res.books.length === 0 && <Empty t="No readable book matches that search — try an author name" />}
      <div className="list">
        {res.books.map((b) => (
          <div key={b.id} className="col">
            <b style={{ fontSize: 14 }}>{b.title}</b>
            <span className="dim sm">{b.creator || 'Unknown author'}{b.year ? ` · ${b.year}` : ''} · full text {(b.size / 1048576).toFixed(1)} MB</span>
            <div className="btnrow" style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => setReading(b)}><Icon n="book" size={14} /> Read</button>
              <a className="btn ghost sm" href={`${IA}/download/${b.id}/${encodeURIComponent(b.file)}`} target="_blank" rel="noreferrer">Text file</a>
            </div>
          </div>))}
      </div>
      <div className="src"><span className="dot" /><span>Scanned public-domain prints — the text is machine-read from old pages, so an occasional smudged word is the honest state of a century-old scan</span></div>
    </>)}
  </>);
}

export function ClassicBooks() {
  const [shelf, setShelf] = useState('world');
  return (<>
    <div className="cats" style={{ marginBottom: 10 }}>
      {[['world', 'World classics'], ['hi', 'Hindi classics'], ['ur', 'Urdu books']].map(([v, n]) => (
        <button key={v} className={`cat ${shelf === v ? 'on' : ''}`} onClick={() => setShelf(v)}>{n}</button>))}
    </div>
    {shelf === 'world' && <WorldShelf />}
    {shelf !== 'world' && <IndicShelf key={shelf} lang={shelf} />}
  </>);
}

export default ClassicBooks;
