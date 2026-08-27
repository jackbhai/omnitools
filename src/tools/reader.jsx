/**
 * the resolver tools, made DEEP.
 *
 * The earlier versions only listed search results — tapping an item did
 * nothing, because the list endpoints return just titles. Probing revealed the
 * real detail endpoints, so these now drill all the way down:
 *
 *   Manga  : search → chapter list (700 for Naruto) → page images (60/chapter)
 *            /api/manga?action=chapters&id=<slug>
 *            /api/manga?action=pages&id=<slug>/c<N>
 *   Novels : search → chapter list (786) → full chapter TEXT
 *            /api/novel?action=chapters&novelId=<id>
 *            chapter.fileUrl is a plain .txt that we fetch and render
 */
import { MEDIA_API, mediaAsset } from '../core/endpoints';
import React, { useEffect, useMemo, useState } from 'react';
import { jget } from '../core/engine';
import { useData, Spin, Err, Empty, Src, Search, Card, Copy, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';


/* ================================================================= MANGA */
const mangaSearch = [
  { id: 'manga-lib', label: 'Manga library', async run({ q }) {
      const d = await jget(`${MEDIA_API}manga?action=${q ? 'search&q=' + encodeURIComponent(q) : 'latest'}`, { ms: 22000 });
      const r = d.results || d.data || [];
      if (!r.length) throw new Error('no manga found');
      return r.map((m) => ({ name: m.name || m.title, cover: mediaAsset(m.cover),
        id: m.sourceId || String(m.path || '').replace(/^\/manga\//, ''), status: m.status || '' })); } },
];
const mangaChapters = [
  { id: 'manga-ch', label: 'Chapter index', async run({ id }) {
      const d = await jget(`${MEDIA_API}manga?action=chapters&id=${encodeURIComponent(id)}`, { ms: 25000 });
      if (!d.success) throw new Error('no chapters');
      return d; } },
];
const mangaPages = [
  { id: 'manga-pg', label: 'Page reader', async run({ id }) {
      const d = await jget(`${MEDIA_API}manga?action=pages&id=${encodeURIComponent(id)}`, { ms: 25000 });
      if (!d.pages?.length) throw new Error('no pages');
      return d.pages; } },
];

export function Manga() {
  const [q, setQ] = useState('');
  const [book, setBook] = useState(null);      // { id, name }
  const [chapter, setChapter] = useState(null);
  const list = useData('manga', mangaSearch, { q }, { ttl: 6e5 });
  const chs = useData('manga-ch', mangaChapters, { id: book?.id }, { auto: false });
  const pgs = useData('manga-pg', mangaPages, { id: chapter?.chapterId }, { auto: false });

  useEffect(() => { if (book?.id) { setChapter(null); chs.run({ id: book.id }); } }, [book?.id]); // eslint-disable-line
  useEffect(() => { if (chapter?.chapterId) pgs.run({ id: chapter.chapterId }); }, [chapter?.chapterId]); // eslint-disable-line

  /* -------- reading a chapter -------- */
  if (chapter) {
    const idx = chs.data?.chapters?.findIndex((c) => c.chapterId === chapter.chapterId) ?? -1;
    const all = chs.data?.chapters || [];
    return (<>
      <div className="btnrow">
        <button className="btn ghost sm" onClick={() => setChapter(null)}>‹ Chapters</button>
        <button className="btn ghost sm" disabled={idx <= 0}
          onClick={() => setChapter(all[idx - 1])}>‹‹ Prev</button>
        <button className="btn ghost sm" disabled={idx < 0 || idx >= all.length - 1}
          onClick={() => setChapter(all[idx + 1])}>Next ››</button>
      </div>
      <div className="chead" style={{ marginTop: 10 }}>{chapter.name}</div>
      {pgs.loading && <Spin t="Loading pages" />}
      {pgs.error && <Err error={pgs.error} retry={() => pgs.run({ id: chapter.chapterId })} />}
      {pgs.data && (<>
        <div className="dim sm" style={{ marginBottom: 8 }}>{pgs.data.length} pages</div>
        {pgs.data.map((p, i) => (
          <img key={i} src={mediaAsset(p.url)} alt={`page ${i + 1}`} loading="lazy"
            style={{ width: '100%', display: 'block', borderRadius: 8, marginBottom: 6,
              background: 'var(--s2)', minHeight: 120 }} />))}
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn" style={{ flex: 1 }} disabled={idx < 0 || idx >= all.length - 1}
            onClick={() => { setChapter(all[idx + 1]); window.scrollTo(0, 0); }}>Next chapter ››</button>
        </div>
      </>)}
    </>);
  }

  /* -------- chapter list -------- */
  if (book) {
    const d = chs.data;
    return (<>
      <button className="btn ghost sm" onClick={() => setBook(null)}>‹ Back to search</button>
      {chs.loading && <Spin t="Loading chapters" />}
      {chs.error && <Err error={chs.error} retry={() => chs.run({ id: book.id })} />}
      {d && (<>
        <Card style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {d.cover && <img src={mediaAsset(d.cover)} alt="" style={{ width: 78, borderRadius: 8 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{d.title}</b>
              <div className="dim sm" style={{ marginTop: 4 }}>{d.status}</div>
              {d.authors?.length > 0 && <div className="dim sm">{d.authors.join(', ')}</div>}
            </div>
          </div>
          {d.genres?.length > 0 && (
            <div className="btnrow" style={{ marginTop: 10 }}>
              {d.genres.slice(0, 8).map((g) => <span key={g} className="tag">{g}</span>)}
            </div>)}
          {d.summary && <p className="sm" style={{ marginTop: 10, lineHeight: 1.6 }}>{d.summary}</p>}
        </Card>
        <div className="chead" style={{ marginTop: 14 }}>{d.chapters.length} chapters</div>
        <div className="list">
          {d.chapters.map((c, i) => (
            <button key={i} className="col" style={{ background: 'none', border: 0,
              width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { setChapter(c); window.scrollTo(0, 0); }}>
              <b style={{ fontSize: 13 }}>{c.name}</b>
              <span className="dim sm">{c.date}</span>
            </button>))}
        </div>
      </>)}
    </>);
  }

  /* -------- search -------- */
  return (<>
    <Search value={q} onChange={setQ} onSubmit={() => list.run({ q: q.trim() })}
      ph="Search manga… (blank = latest)" />
    <div className="btnrow">{['naruto', 'one piece', 'solo leveling', 'jujutsu'].map((x) =>
      <button key={x} className="cat" onClick={() => { setQ(x); list.run({ q: x }); }}>{x}</button>)}</div>
    {list.loading && <Spin t="Loading manga" />}
    {list.error && <Err error={list.error} retry={() => list.run({ q })} />}
    {list.data && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{list.data.length} titles · tap to read</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
        {list.data.map((x, i) => (
          <button className="tile" key={i} style={{ padding: 0, minHeight: 0, display: 'block', overflow: 'hidden' }}
            onClick={() => setBook(x)}>
            {x.cover ? <img src={x.cover} alt="" loading="lazy"
                style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover' }} />
              : <div style={{ aspectRatio: '2/3', display: 'grid', placeItems: 'center',
                  fontSize: 28, background: 'var(--s2)' }}><Icon n="book" size={20} /></div>}
            <div style={{ padding: 8, textAlign: 'left' }}>
              <b style={{ fontSize: 11.5, display: 'block' }}>{String(x.name).slice(0, 40)}</b>
              {x.status && <span className="dim" style={{ fontSize: 10 }}>{x.status}</span>}
            </div>
          </button>))}
      </div>
      <Src meta={list.meta} />
    </>)}
  </>);
}

/* ================================================================ NOVELS */
const novelSearch = [
  { id: 'novel-lib', label: 'Novel library', async run({ q }) {
      const d = await jget(`${MEDIA_API}novel?action=search&q=${encodeURIComponent(q || 'love')}`, { ms: 22000 });
      const r = d.novels || d.results || [];
      if (!r.length) throw new Error('no novels found');
      return r; } },
];
const novelChapters = [
  { id: 'novel-ch', label: 'Chapter index', async run({ id }) {
      const d = await jget(`${MEDIA_API}novel?action=chapters&novelId=${encodeURIComponent(id)}`, { ms: 25000 });
      if (!d.chapters?.length) throw new Error('no chapters');
      return d.chapters; } },
];
const novelText = [
  { id: 'novel-read', label: 'Chapter reader', async run({ fileUrl }) {
      // returns { ok, content } - not raw text
      const d = await jget(`${MEDIA_API}novel?action=read&fileUrl=${encodeURIComponent(fileUrl)}`, { ms: 25000 });
      const t = typeof d === 'string' ? d : (d.content || d.text || '');
      if (!t || t.length < 20) throw new Error('empty chapter');
      return t; } },
];

export function Novels() {
  const [q, setQ] = useState('love');
  const [novel, setNovel] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [size, setSize] = useState(16);
  const list = useData('novel', novelSearch, { q }, { ttl: 6e5 });
  const chs = useData('novel-ch', novelChapters, { id: novel?.novelId }, { auto: false });
  const txt = useData('novel-txt', novelText, { fileUrl: chapter?.fileUrl }, { auto: false });

  useEffect(() => { if (novel?.novelId) { setChapter(null); chs.run({ id: novel.novelId }); } }, [novel?.novelId]); // eslint-disable-line
  useEffect(() => { if (chapter?.fileUrl) txt.run({ fileUrl: chapter.fileUrl }); }, [chapter?.fileUrl]); // eslint-disable-line

  if (chapter) {
    const all = chs.data || [];
    const idx = all.findIndex((c) => c.chapterId === chapter.chapterId);
    return (<>
      <div className="btnrow">
        <button className="btn ghost sm" onClick={() => setChapter(null)}>‹ Chapters</button>
        <button className="btn ghost sm" disabled={idx <= 0} onClick={() => setChapter(all[idx - 1])}>‹‹</button>
        <button className="btn ghost sm" disabled={idx < 0 || idx >= all.length - 1}
          onClick={() => setChapter(all[idx + 1])}>››</button>
        <button className="btn ghost sm" onClick={() => setSize((s) => Math.max(13, s - 1))}>A−</button>
        <button className="btn ghost sm" onClick={() => setSize((s) => Math.min(24, s + 1))}>A+</button>
      </div>
      <div className="chead" style={{ marginTop: 10 }}>{chapter.chapterName}</div>
      <div className="dim sm">{fmt(chapter.totalWords)} words</div>
      {txt.loading && <Spin t="Loading chapter" />}
      {txt.error && <Err error={txt.error} retry={() => txt.run({ fileUrl: chapter.fileUrl })} />}
      {txt.data && (<>
        <Card style={{ marginTop: 10 }}>
          <div style={{ fontSize: size, lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>{txt.data}</div>
        </Card>
        <div className="btnrow" style={{ marginTop: 10 }}>
          <Copy text={txt.data} label="Copy text" />
          <button className="btn" style={{ flex: 1 }} disabled={idx < 0 || idx >= all.length - 1}
            onClick={() => { setChapter(all[idx + 1]); window.scrollTo(0, 0); }}>Next chapter ››</button>
        </div>
      </>)}
    </>);
  }

  if (novel) {
    return (<>
      <button className="btn ghost sm" onClick={() => setNovel(null)}>‹ Back to search</button>
      <Card style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {novel.cover?.url && <img src={novel.cover.url} alt=""
            style={{ width: 78, borderRadius: 8 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{novel.title}</b>
            {novel.authorName && <div className="dim sm">{novel.authorName}</div>}
          </div>
        </div>
        {novel.introduction && <p className="sm" style={{ marginTop: 10, lineHeight: 1.6 }}>
          {novel.introduction}</p>}
      </Card>
      {chs.loading && <Spin t="Loading chapters" />}
      {chs.error && <Err error={chs.error} retry={() => chs.run({ id: novel.novelId })} />}
      {chs.data && (<>
        <div className="chead" style={{ marginTop: 14 }}>{chs.data.length} chapters</div>
        <div className="list">
          {chs.data.map((c, i) => (
            <button key={i} className="col" style={{ background: 'none', border: 0,
              width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { setChapter(c); window.scrollTo(0, 0); }}>
              <b style={{ fontSize: 13 }}>{c.chapterName}</b>
              <span className="dim sm">{fmt(c.totalWords)} words</span>
            </button>))}
        </div>
      </>)}
    </>);
  }

  return (<>
    <Search value={q} onChange={setQ} onSubmit={() => list.run({ q: q.trim() })} ph="Search novels…" />
    <div className="btnrow">{['love', 'revenge', 'ceo', 'fantasy', 'urdu'].map((x) =>
      <button key={x} className="cat" onClick={() => { setQ(x); list.run({ q: x }); }}>{x}</button>)}</div>
    {list.loading && <Spin t="Loading novels" />}
    {list.error && <Err error={list.error} retry={() => list.run({ q })} />}
    {list.data && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{list.data.length} novels · tap to read</div>
      <div className="list">
        {list.data.map((x, i) => (
          <button key={i} className="row" style={{ background: 'none', border: 0,
            width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => setNovel(x)}>
            {x.cover?.url ? <img src={x.cover.url} alt="" loading="lazy"
                style={{ width: 44, height: 60, borderRadius: 7, objectFit: 'cover', flex: '0 0 auto' }} />
              : <div style={{ width: 44, height: 60, borderRadius: 7, background: 'var(--s3)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon n="books" size={20} /></div>}
            <div className="main"><b style={{ fontSize: 13 }}>{x.title}</b>
              {x.authorName && <span className="dim sm">{x.authorName}</span>}
              {x.introduction && <span className="dim sm">{String(x.introduction).slice(0, 90)}</span>}</div>
          </button>))}
      </div>
      <Src meta={list.meta} />
    </>)}
  </>);
}
