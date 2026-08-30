/**
 * Utility tool suite.
 *
 * Every endpoint below was live-probed with the CORRECT parameter names before
 * being included (many need ?action=..., which is why an earlier naive probe
 * showed them as failing). Endpoints that still fail from a browser Origin
 * (websnap, n8n, tempmail, tts/tti which are POST-only) are deliberately NOT
 * shown rather than rendered as dead tiles.
 */
import { MEDIA_API, mediaAsset } from '../core/endpoints';
import React, { useState } from 'react';
import { jget } from '../core/engine';
import { useData, Spin, Err, Empty, Src, Search, Card, Chips, Copy, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';


/* ------------------------------------------------------------- MANGA */
const mangaPool = [
  { id: 'manga-lib', label: 'Manga library', async run({ q }) {
      const d = await jget(`${MEDIA_API}manga?action=${q ? 'search&q=' + encodeURIComponent(q) : 'latest'}`, { ms: 20000 });
      const r = d.results || d.data || [];
      if (!r.length) throw new Error('no manga found');
      return r.map((m) => ({ name: m.name || m.title, cover: mediaAsset(m.cover),
        id: m.sourceId || m.path, status: m.status || '', desc: m.description || '' })); } },
];
export function Manga() {
  const [q, setQ] = useState('');
  const m = useData('manga', mangaPool, { q }, { ttl: 6e5 });
  return (<><Search value={q} onChange={setQ} onSubmit={() => m.run({ q: q.trim() })} ph="Search manga… (blank = latest)" /><div className="btnrow">{['naruto','one piece','solo leveling','jujutsu'].map((x) =><button key={x} className="cat" onClick={() => { setQ(x); m.run({ q: x }); }}>{x}</button>)}</div>
    {m.loading && <Spin t="Loading manga" />}
    {m.error && <Err error={m.error} retry={() => m.run({ q })} />}
    {m.data && (<><div className="dim sm" style={{ margin: '10px 0 8px' }}>{m.data.length} titles</div><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>
        {m.data.map((x, i) => (
          <div className="tile" key={i} style={{ padding: 0, minHeight: 0, display: 'block', overflow: 'hidden' }}>
            {x.cover ? <img src={x.cover} alt="" loading="lazy"
                style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover' }}
                onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ aspectRatio: '2/3', display: 'grid', placeItems: 'center', fontSize: 28, background: 'var(--s2)' }}><Icon n="book" size={20} /></div>}
            <div style={{ padding: 8, textAlign: 'left' }}><b style={{ fontSize: 11.5, display: 'block' }}>{String(x.name).slice(0, 40)}</b>
              {x.status && <span className="dim" style={{ fontSize: 10 }}>{x.status}</span>}
            </div></div>))}
      </div><Src meta={m.meta} /></>)}
  </>);
}

/* ------------------------------------------------------------- NOVELS */
const novelPool = [
  { id: 'novel-lib', label: 'Novel library', async run({ q }) {
      const d = await jget(`${MEDIA_API}novel?action=search&q=${encodeURIComponent(q || 'love')}`, { ms: 20000 });
      const r = d.novels || d.results || [];
      if (!r.length) throw new Error('no novels found');
      return r.map((n) => ({ title: n.title, id: n.novelId,
        cover: n.cover?.url || '', author: n.authorName || n.author || '',
        desc: (n.introduction || n.description || '').slice(0, 140) })); } },
];
export function Novels() {
  const [q, setQ] = useState('love');
  const n = useData('novel', novelPool, { q }, { ttl: 6e5 });
  return (<><Search value={q} onChange={setQ} onSubmit={() => n.run({ q: q.trim() })} ph="Search novels…" /><div className="btnrow">{['love','revenge','ceo','fantasy','urdu'].map((x) =><button key={x} className="cat" onClick={() => { setQ(x); n.run({ q: x }); }}>{x}</button>)}</div>
    {n.loading && <Spin t="Loading novels" />}
    {n.error && <Err error={n.error} retry={() => n.run({ q })} />}
    {n.data && (<><div className="dim sm" style={{ margin: '10px 0 8px' }}>{n.data.length} novels</div><div className="list">
        {n.data.map((x, i) => (
          <div className="row" key={i}>
            {x.cover ? <img src={x.cover} alt="" loading="lazy"
                style={{ width: 44, height: 60, borderRadius: 7, objectFit: 'cover', flex: '0 0 auto' }}
                onError={(e) => { e.target.style.visibility = 'hidden'; }} />
              : <div style={{ width: 44, height: 60, borderRadius: 7, background: 'var(--s3)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon n="books" size={20} /></div>}
            <div className="main"><b style={{ fontSize: 13 }}>{x.title}</b>
              {x.author && <span className="dim sm">{x.author}</span>}
              {x.desc && <span className="dim sm">{x.desc}</span>}</div></div>))}
      </div><Src meta={n.meta} /></>)}
  </>);
}

/* ------------------------------------------------------------- MEDICINE */
const medPool = [
  { id: 'med-price', label: 'Medicine price index', async run({ q }) {
      const d = await jget(`${MEDIA_API}search?q=${encodeURIComponent(q)}`, { ms: 20000 });
      const r = d.results || [];
      if (!r.length) throw new Error('medicine not found');
      return r; } },
];
export function Medicine() {
  const [q, setQ] = useState('');
  const m = useData('med', medPool, { q }, { auto: false });
  return (<><Search value={q} onChange={setQ} onSubmit={() => q.trim() && m.run({ q: q.trim() })}
      ph="Medicine name, e.g. paracetamol" /><div className="btnrow">{['paracetamol','azithromycin','crocin','dolo 650'].map((x) =><button key={x} className="cat" onClick={() => { setQ(x); m.run({ q: x }); }}>{x}</button>)}</div>
    {m.loading && <Spin t="Searching medicine database" />}
    {m.error && <Err error={m.error} retry={() => m.run({ q })} />}
    {m.data && (<><div className="dim sm" style={{ margin: '10px 0 8px' }}>{m.data.length} results</div>
      {m.data.slice(0, 20).map((x, i) => (
        <Card key={i}><div className="chead">{x.name || x.medicine || x.title || 'Medicine'}</div>
          {Object.entries(x).filter(([k, v]) =>
            v && typeof v !== 'object' && !['name','medicine','title'].includes(k)).slice(0, 8).map(([k, v]) => (
            <div className="kv" key={k}><span>{k.replace(/_/g, ' ')}</span><b style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{String(v).slice(0, 120)}</b></div>))}
        </Card>))}
      <div className="src"><span className="dot warn" /><span>Reference only — always consult a doctor or pharmacist.</span></div><Src meta={m.meta} /></>)}
  </>);
}

/* ------------------------------------------------------------- COURSES */
const coursePool = [
  { id: 'course-cat', label: 'Course catalogue', async run() {
      const d = await jget(`${MEDIA_API}courses`, { ms: 25000 });
      const r = d.courses || d.results || [];
      if (!r.length) throw new Error('no courses');
      return r; } },
];
export function Courses() {
  const c = useData('courses', coursePool, {}, { ttl: 864e5 });
  const [q, setQ] = useState('');
  const list = (c.data || []).filter((x) =>
    !q || String(x.name || x.title).toLowerCase().includes(q.toLowerCase()));
  return (<>
    {c.loading && <Spin t="Loading courses" />}
    {c.error && <Err error={c.error} retry={() => c.run()} />}
    {c.data && (<><Search value={q} onChange={setQ} ph={`Filter ${c.data.length} courses…`} /><div className="dim sm" style={{ marginBottom: 8 }}>{list.length} courses</div><div className="list">
        {list.slice(0, 100).map((x, i) => (
          <a className="col" key={i} href={x.url || x.link} target="_blank" rel="noreferrer"><b style={{ fontSize: 13 }}>{x.name || x.title}</b>
            {x.category && <span className="dim sm">{x.category}</span>}
          </a>))}
      </div><Src meta={c.meta} /></>)}
  </>);
}

/* ------------------------------------------------------------- TELENOR QUIZ */
const telenorPool = [
  { id: 'quiz-feed', label: 'Quiz feed', async run() {
      const d = await jget(`${MEDIA_API}telenor`, { ms: 20000 });
      if (!d.questions?.length) throw new Error('no quiz today');
      return d; } },
];
export function Telenor() {
  const t = useData('telenor', telenorPool, {}, { ttl: 36e5 });
  return (<>
    {t.loading && <Spin t="Loading today's quiz" />}
    {t.error && <Err error={t.error} retry={() => t.run()} />}
    {t.data && (<><Card><div className="chead">{t.data.title || 'My Telenor Quiz'}</div><div className="dim sm">{t.data.date}</div></Card>
      {t.data.questions.map((q, i) => (
        <Card key={i}><b style={{ fontSize: 13.5 }}>Q{i + 1}. {q.question || q.q}</b><div style={{ marginTop: 8, padding: 10, borderRadius: 10,
            background: 'rgba(0,255,156,.08)', border: '1px solid rgba(0,255,156,.25)' }}><span className="dim sm">Answer</span><b style={{ display: 'block', color: 'var(--green)', fontSize: 14 }}>{q.answer || q.a}</b></div></Card>))}
      <Src meta={t.meta} /></>)}
  </>);
}

/* ------------------------------------------------------------- TEMP MAIL */
export function TempMail() {
  const [box, setBox] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const d = await jget(`${MEDIA_API}mail?action=create`, { ms: 20000 });
      if (!d.email) throw new Error('could not create address');
      setBox(d); setInbox([]);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const refresh = async () => {
    if (!box?.email) return;
    setBusy(true);
    try {
      const d = await jget(`${MEDIA_API}mail?action=inbox&mail=${encodeURIComponent(box.email)}` +
        (box.password ? `&password=${encodeURIComponent(box.password)}` : ''), { ms: 20000 });
      setInbox(d.messages || d.inbox || d.data || []);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (<>
    {!box && (
      <Card><div className="chead"><Icon n="mail" size={18} /> Disposable email</div><p className="dim sm">Generate a throwaway address to receive verification mails
          without giving away your real inbox.</p><button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={create}>
          {busy ? 'Creating…' : <><Icon n="mail" size={18} /> Create address</>}</button></Card>)}
    {err && <div className="err"><p>{err}</p></div>}
    {box && (<><Card><div className="chead">Your temporary address</div><div className="out" style={{ fontSize: 14 }}>{box.email}</div><div className="btnrow"><Copy text={box.email} label="Copy address" /><button className="btn ghost sm" disabled={busy} onClick={refresh}>
            {busy ? '…' : ' Check inbox'}</button><button className="btn ghost sm" onClick={create}>New</button></div></Card><div className="dim sm" style={{ margin: '10px 0 6px' }}>{inbox.length} message(s)</div>
      {inbox.length === 0
        ? <Empty t="Inbox empty — tap Check inbox after sending a mail" />
        : <div className="list">
            {inbox.map((m, i) => (
              <div className="col" key={i}><b style={{ fontSize: 13 }}>{m.subject || '(no subject)'}</b><span className="dim sm">{m.from || m.sender}</span><span className="dim sm">{(m.intro || m.body || '').slice(0, 140)}</span></div>))}
          </div>}
    </>)}
  </>);
}

/* ------------------------------------------------------------- WIKI → PDF */
export function WikiPdf() {
  const [q, setQ] = useState('Delhi');
  return (<><div className="fld"><label>Wikipedia article</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Babar Azam" /></div><div className="btnrow">{['Delhi','Punjab','Cricket','ISRO'].map((x) =><button key={x} className="cat" onClick={() => setQ(x)}>{x}</button>)}</div><a className="btn" style={{ display: 'block', textAlign: 'center', marginTop: 12, textDecoration: 'none' }}
      href={`${MEDIA_API}wikipdf?query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer"><Icon n="doc" size={18} /> Generate &amp; open PDF</a><div className="src"><span className="dot" /><span>Opens a real, printable PDF</span></div></>);
}

/* ------------------------------------------------------------- HANDWRITING */
export function Handwriting() {
  const [text, setText] = useState('OmniTools handwriting demo');
  const [url, setUrl] = useState('');
  return (<><div className="fld"><label>Text to convert</label><textarea value={text} onChange={(e) => setText(e.target.value)} /></div><button className="btn" style={{ width: '100%' }} disabled={!text.trim()}
      onClick={() => setUrl(`${MEDIA_API}hand?text=${encodeURIComponent(text)}&_=${Date.now()}`)}><Icon n="pen" size={17} /> Convert to handwriting</button>
    {url && (
      <Card style={{ marginTop: 12 }}><img src={url} alt="handwriting" style={{ width: '100%', borderRadius: 10, background: '#fff' }} /><a className="btn sm" style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none' }}
          href={url} download="handwriting.png" target="_blank" rel="noreferrer"><Icon n="download" size={16} /> Download PNG</a></Card>)}
  </>);
}

/* ------------------------------------------------------------- SCREENSHOT */
export function WebSnap() {
  const [u, setU] = useState('https://example.com');
  const [shot, setShot] = useState('');
  return (<><div className="fld"><label>Website URL</label><input value={u} onChange={(e) => setU(e.target.value)} placeholder="https://…" /></div><button className="btn" style={{ width: '100%' }} disabled={!u.trim()}
      onClick={() => setShot(`${MEDIA_API}websnap?action=screenshot&url=${encodeURIComponent(u)}&_=${Date.now()}`)}><Icon n="camera" size={17} /> Capture screenshot</button>
    {shot && (
      <Card style={{ marginTop: 12 }}><img src={shot} alt="screenshot" style={{ width: '100%', borderRadius: 10 }} /><a className="btn sm" style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none' }}
          href={shot} download="screenshot.jpg" target="_blank" rel="noreferrer"><Icon n="download" size={16} /> Download</a></Card>)}
    <div className="src"><span className="dot" /><span>Full-page capture of any public site</span></div></>);
}

/* ------------------------------------------------------------- CERTIFICATE */
const certPool = [
  { id: 'cert-lib', label: 'Certificate templates', async run() {
      const d = await jget(`${MEDIA_API}certificate?action=templates`, { ms: 20000 });
      const t = d.templates || [];
      if (!t.length) throw new Error('no templates');
      return t; } },
];
export function Certificates() {
  const c = useData('cert', certPool, {}, { ttl: 864e5 });
  return (<>
    {c.loading && <Spin t="Loading templates" />}
    {c.error && <Err error={c.error} retry={() => c.run()} />}
    {c.data && (<><div className="dim sm" style={{ marginBottom: 8 }}>{c.data.length} certificate templates</div><div className="list">
        {c.data.map((t, i) => (
          <div className="row" key={i}><span style={{ fontSize: 20 }}><Icon n="badge" size={18} /></span><div className="main"><b>{t.name || t.id || `Template ${i + 1}`}</b>
              {t.description && <span className="dim sm">{t.description}</span>}</div></div>))}
      </div><div className="src"><span className="dot warn" /><span>Browse the available templates here.</span></div><Src meta={c.meta} /></>)}
  </>);
}
