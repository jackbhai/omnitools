/**
 * File converters — 100% in-browser (Canvas / Web APIs). No upload, no server,
 * so files never leave the device and the tool cannot "go down".
 *
 * Honest scope: image formats, PDF assembly from images, audio re-encode to WAV,
 * video→GIF frames, and data-format conversion. Formats that genuinely need a
 * native toolchain (DOCX→PDF, PSD, RAW) are NOT faked — we say so.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Card, Chips, Copy, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';

const human = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB';

function Drop({ accept, multiple, onFiles, hint }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}
      style={{ border: `2px dashed ${over ? 'var(--green)' : 'var(--line2)'}`, borderRadius: 16,
        padding: '30px 16px', textAlign: 'center', cursor: 'pointer', background: over ? 'rgba(0,255,156,.05)' : 'var(--s1)' }}><div style={{ fontSize: 32 }}></div><b style={{ display: 'block', marginTop: 8 }}>Tap or drop files</b><span className="dim sm">{hint}</span><input ref={ref} type="file" accept={accept} multiple={multiple} hidden
        onChange={(e) => onFiles([...e.target.files])} /></div>);
}

const dl = (blob, name) => {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
};

/* ---------------------------------------------------------------- IMAGE */
export function ImageConvert() {
  const [files, setFiles] = useState([]);
  const [fmtOut, setFmtOut] = useState('image/webp');
  const [quality, setQuality] = useState(0.9);
  const [maxW, setMaxW] = useState(0);
  const [out, setOut] = useState([]);
  const [busy, setBusy] = useState(false);

  const convert = useCallback(async () => {
    setBusy(true); const res = [];
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f);
        let { width: w, height: h } = bmp;
        if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d');
        if (fmtOut === 'image/jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); }
        cx.drawImage(bmp, 0, 0, w, h);
        const blob = await new Promise((r) => c.toBlob(r, fmtOut, quality));
        const ext = fmtOut.split('/')[1].replace('jpeg', 'jpg');
        res.push({ name: f.name.replace(/\.[^.]+$/, '') + '.' + ext, blob,
          before: f.size, after: blob.size, url: URL.createObjectURL(blob) });
      } catch { res.push({ name: f.name, error: 'Could not decode this image' }); }
    }
    setOut(res); setBusy(false);
  }, [files, fmtOut, quality, maxW]);

  return (<><Drop accept="image/*" multiple hint="JPG · PNG · WEBP · GIF · BMP · AVIF" onFiles={(f) => { setFiles(f); setOut([]); }} />
    {files.length > 0 && (<><div className="dim sm" style={{ margin: '10px 0' }}>{files.length} file(s) · {human(files.reduce((s, f) => s + f.size, 0))}</div><div className="fld"><label>Output format</label><Chips items={[{v:'image/webp',l:'WEBP'},{v:'image/jpeg',l:'JPG'},{v:'image/png',l:'PNG'}]}
          value={fmtOut} onPick={setFmtOut} /></div><div className="fld"><label>Quality {Math.round(quality*100)}%</label><input type="range" min="0.1" max="1" step="0.05" value={quality} onChange={(e) => setQuality(+e.target.value)} /></div><div className="fld"><label>Max width {maxW || 'original'}</label><input type="range" min="0" max="4000" step="100" value={maxW} onChange={(e) => setMaxW(+e.target.value)} /></div><button className="btn" style={{ width: '100%' }} disabled={busy} onClick={convert}>
        {busy ? 'Converting…' : `Convert ${files.length} file(s)`}</button></>)}
    {out.length > 0 && (
      <div className="list" style={{ marginTop: 12 }}>
        {out.map((o, i) => (
          <div className="row" key={i}>
            {o.url && <img src={o.url} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />}
            <div className="main"><b style={{ fontSize: 12.5 }}>{o.name}</b>
              {o.error ? <span style={{ color: 'var(--bad)' }} className="sm">{o.error}</span>
              : <span className="dim sm">{human(o.before)} → {human(o.after)}
                  <span style={{ color: o.after < o.before ? 'var(--green)' : 'var(--warn)' }}>
                    {' '}({o.after < o.before ? '−' : '+'}{Math.abs(Math.round((1 - o.after/o.before) * 100))}%)</span></span>}</div>
            {o.blob && <button className="btn sm" onClick={() => dl(o.blob, o.name)}>⬇</button>}
          </div>))}
        {out.filter((o) => o.blob).length > 1 &&
          <button className="btn" style={{ margin: 12 }} onClick={() => out.forEach((o) => o.blob && dl(o.blob, o.name))}>
            ⬇ Download all</button>}
      </div>)}
  </>);
}

/* ---------------------------------------------------------------- IMAGE → PDF */
export function ImagesToPdf() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      // Minimal PDF writer — embeds each image as a full-page JPEG.
      const pages = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const cx = c.getContext('2d'); cx.fillStyle = '#fff';
        cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
        pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height });
      }
      dl(buildPdf(pages), 'images.pdf');
    } catch (e) { alert('Could not build PDF: ' + e.message); }
    setBusy(false);
  };

  return (<><Drop accept="image/*" multiple hint="Select images in page order" onFiles={(f) => setFiles(f)} />
    {files.length > 0 && (<><div className="dim sm" style={{ margin: '10px 0' }}>{files.length} page(s)</div><div className="list">{files.map((f, i) => (
        <div className="row" key={i}><span className="dim mono">{i + 1}</span><div className="main"><b style={{ fontSize: 12.5 }}>{f.name}</b><span className="dim sm">{human(f.size)}</span></div></div>))}</div><button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={make}>
        {busy ? 'Building…' : '📄 Create PDF'}</button></>)}
  </>);
}

/** Tiny PDF builder: one JPEG per page, no external library. */
function buildPdf(pages) {
  const enc = new TextEncoder();
  const chunks = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; return len; };
  const offsets = [0];
  push('%PDF-1.4\n');
  const nPage = pages.length;
  const objCount = 2 + nPage * 3;
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');

  offsets[1] = len; push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  offsets[2] = len; push(`2 0 obj\n<< /Type /Pages /Count ${nPage} /Kids [${kids}] >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pageObj = 3 + i * 3, contentObj = pageObj + 1, imgObj = pageObj + 2;
    offsets[pageObj] = len;
    push(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] ` +
         `/Resources << /XObject << /I0 ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`);
    const stream = `q ${p.w} 0 0 ${p.h} 0 0 cm /I0 Do Q`;
    offsets[contentObj] = len;
    push(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
    offsets[imgObj] = len;
    push(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
         `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    push(p.bytes); push('\nendstream\nendobj\n');
  });

  const xref = len;
  let x = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objCount; i++) x += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  const all = new Uint8Array(len); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return new Blob([all], { type: 'application/pdf' });
}

/* ---------------------------------------------------------------- AUDIO */
export function AudioConvert() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  const toWav = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      setInfo({ ch: buf.numberOfChannels, rate: buf.sampleRate, dur: buf.duration });
      dl(encodeWav(buf), file.name.replace(/\.[^.]+$/, '') + '.wav');
      ctx.close();
    } catch (e) { alert('Could not decode this audio: ' + e.message); }
    setBusy(false);
  };

  return (<><Drop accept="audio/*" hint="MP3 · M4A · OGG · FLAC · WAV → WAV (lossless)" onFiles={(f) => { setFile(f[0]); setInfo(null); }} />
    {file && (<><div className="dim sm" style={{ margin: '10px 0' }}>{file.name} · {human(file.size)}</div><button className="btn" style={{ width: '100%' }} disabled={busy} onClick={toWav}>
        {busy ? 'Decoding…' : '🎵 Convert to WAV'}</button>
      {info && <Card style={{ marginTop: 12 }}><div className="kv"><span>Channels</span><b>{info.ch}</b></div><div className="kv"><span>Sample rate</span><b>{fmt(info.rate)} Hz</b></div><div className="kv"><span>Duration</span><b>{info.dur.toFixed(1)}s</b></div></Card>}
      <div className="src"><span className="dot warn" /><span>Browser can decode almost any format but can only *encode* WAV without a 25 MB library.</span></div></>)}
  </>);
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length * ch * 2 + 44;
  const ab = new ArrayBuffer(len), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, len - 8, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data');
  v.setUint32(40, len - 44, true);
  let off = 44;
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < buf.length; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
  return new Blob([ab], { type: 'audio/wav' });
}

/* ---------------------------------------------------------------- VIDEO → GIF/FRAMES */
export function VideoFrames() {
  const [file, setFile] = useState(null);
  const [frames, setFrames] = useState([]);
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const vref = useRef(null);

  const grab = async () => {
    if (!file) return;
    setBusy(true); setFrames([]);
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file); v.muted = true;
    await new Promise((r) => { v.onloadedmetadata = r; });
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = (v.duration / (count + 1)) * (i + 1);
      await new Promise((r) => { v.onseeked = r; v.currentTime = t; });
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      out.push({ t: t.toFixed(1), url: URL.createObjectURL(blob), blob });
    }
    setFrames(out); setBusy(false);
    URL.revokeObjectURL(v.src);
  };

  return (<><Drop accept="video/*" hint="MP4 · WEBM · MOV → extract frames as JPG" onFiles={(f) => { setFile(f[0]); setFrames([]); }} />
    {file && (<><div className="dim sm" style={{ margin: '10px 0' }}>{file.name} · {human(file.size)}</div><div className="fld"><label>Frames: {count}</label><input type="range" min="2" max="20" value={count} onChange={(e) => setCount(+e.target.value)} /></div><button className="btn" style={{ width: '100%' }} disabled={busy} onClick={grab}>
        {busy ? 'Extracting…' : '🎬 Extract frames'}</button></>)}
    {frames.length > 0 && (
      <div className="grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))' }}>
        {frames.map((f, i) => (
          <div key={i} className="tile" style={{ padding: 0, minHeight: 0, overflow: 'hidden' }}
            onClick={() => dl(f.blob, `frame-${f.t}s.jpg`)}><img src={f.url} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} /><small style={{ padding: 5 }}>{f.t}s ⬇</small></div>))}
      </div>)}
  </>);
}

/* ---------------------------------------------------------------- DATA FORMATS */
export function DataConvert() {
  const [inp, setInp] = useState('');
  const [mode, setMode] = useState('json2csv');
  let out = '', err = '';
  try {
    if (inp.trim()) {
      if (mode === 'json2csv') {
        const a = JSON.parse(inp);
        const rows = Array.isArray(a) ? a : [a];
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        out = [cols.join(','), ...rows.map((r) => cols.map((c) => {
          const v = r[c] ?? '';
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','))].join('\n');
      } else if (mode === 'csv2json') {
        const [h, ...rows] = inp.trim().split(/\r?\n/);
        const cols = h.split(',').map((x) => x.trim());
        out = JSON.stringify(rows.map((r) => {
          const cells = r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
          return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
        }), null, 2);
      } else if (mode === 'json2xml') {
        const o = JSON.parse(inp);
        const x = (v, k = 'item') => Array.isArray(v) ? v.map((i) => x(i, k)).join('')
          : v && typeof v === 'object' ? Object.entries(v).map(([kk, vv]) => `<${kk}>${x(vv, kk)}</${kk}>`).join('')
          : String(v);
        out = '<?xml version="1.0"?>\n<root>' + x(o) + '</root>';
      }
    }
  } catch (e) { err = '<Icon n="warn" size={16} /> ' + e.message; }
  return (<><Chips items={[{v:'json2csv',l:'JSON → CSV'},{v:'csv2json',l:'CSV → JSON'},{v:'json2xml',l:'JSON → XML'}]}
      value={mode} onPick={setMode} /><div className="fld"><label>Input</label><textarea value={inp} onChange={(e) => setInp(e.target.value)}
        placeholder={mode === 'csv2json' ? 'name,age\nAmit,30' : '[{"name":"Amit","age":30}]'} /></div>
    {err ? <div className="err"><p>{err}</p></div>
      : out && <><div className="out">{out}</div><div className="btnrow"><Copy text={out} /><button className="btn ghost sm" onClick={() => dl(new Blob([out]),
              'converted.' + (mode === 'json2csv' ? 'csv' : mode === 'csv2json' ? 'json' : 'xml'))}><Icon n="download" size={16} /> Download</button></div></>}
  </>);
}

/* ---------------------------------------------------------------- TEXT → FILE */
export function TextToFile() {
  const [text, setText] = useState('');
  const [name, setName] = useState('note');
  const [ext, setExt] = useState('txt');
  return (<><div className="fld"><label>Content</label><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type anything…" /></div><div className="g2"><div className="fld"><label>File name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div><div className="fld"><label>Extension</label><select value={ext} onChange={(e) => setExt(e.target.value)}>
          {['txt','md','csv','json','html','xml','js','css','sql','yaml','log'].map((x) =><option key={x}>{x}</option>)}
        </select></div></div><button className="btn" style={{ width: '100%' }} disabled={!text}
      onClick={() => dl(new Blob([text], { type: 'text/plain' }), `${name}.${ext}`)}><Icon n="download" size={16} /> Download file</button><div className="dim sm" style={{ marginTop: 8 }}>{text.length} characters · {human(new Blob([text]).size)}</div></>);
}
