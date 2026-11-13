/**
 * Document Scanner — photograph pages, clean them up, save one PDF.
 *
 * What it honestly does: captures from the camera (or takes photos you
 * already have), then cleans each page on-device — contrast stretch,
 * sharpening, and a black-&-white document mode — and binds the pages
 * into a single PDF or saves them as images. What it does NOT do is
 * magic corner detection: it will not straighten a page shot at an
 * angle, and it says so below rather than pretending.
 *
 * Everything happens on this device. No page is ever uploaded.
 */
import React, { useEffect, useRef, useState } from 'react';
import { buildImagePdf, canvasPage } from '../core/pdf';
import { Card, Empty, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

const MAXW = 1600;

const dl = (blob, name) => {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
};

/* Contrast-stretch every channel using a 1% histogram clip, then
   optionally convert to a document-style greyscale. */
function enhance(ctx, w, h, mode) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] + d[i + 1] + d[i + 2]) / 3 | 0]++;
  const total = w * h, clip = total * 0.01;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > clip) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > clip) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.min(255, Math.max(0, ((v - lo) / span) * 255));
  for (let i = 0; i < d.length; i += 4) {
    if (mode === 'doc') {
      const g = lut[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0];
      d[i] = d[i + 1] = d[i + 2] = g;
    } else {
      d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* 3x3 unsharp convolution — one honest pass, edges only get crisper. */
function sharpen(ctx, w, h) {
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, o = out.data;
  const K = [0, -0.6, 0, -0.6, 3.4, -0.6, 0, -0.6, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        o[idx] = s[idx]; o[idx + 1] = s[idx + 1]; o[idx + 2] = s[idx + 2]; o[idx + 3] = 255;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let v = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            v += s[((y + dy) * w + (x + dx)) * 4 + c] * K[k++];
          }
        }
        o[idx + c] = v;
      }
      o[idx + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function processImage(source, mode) {
  const bmp = source instanceof Blob ? await createImageBitmap(source) : source;
  let w = bmp.width, h = bmp.height;
  if (w > MAXW) { h = Math.round(h * MAXW / w); w = MAXW; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (mode !== 'orig') { enhance(ctx, w, h, mode); sharpen(ctx, w, h); }
  return c;
}

export function Scanner() {
  const [pages, setPages] = useState([]);       // [{ url, canvas }]
  const [mode, setMode] = useState('doc');      // doc | colour | orig
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState('');
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };
  useEffect(() => () => stopCam(), []);

  const startCam = async () => {
    setCamErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = stream; });
    } catch (e) {
      setCamErr(e?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in the browser, or add photos from your gallery instead.'
        : 'No camera could be opened on this device. You can still add photos from your gallery.');
    }
  };

  const addCanvas = (canvas) => {
    const url = canvas.toDataURL('image/jpeg', 0.85);
    setPages((p) => [...p, { url, canvas }]);
    sfxPlay('add');
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const shot = document.createElement('canvas');
    shot.width = v.videoWidth; shot.height = v.videoHeight;
    shot.getContext('2d').drawImage(v, 0, 0);
    setBusy(true);
    try { addCanvas(await processImage(shot, mode)); toast('Page added'); }
    catch { toast('Could not process that shot', 'err'); }
    setBusy(false);
  };

  const onFiles = async (files) => {
    setBusy(true);
    for (const f of files) {
      try { addCanvas(await processImage(f, mode)); }
      catch { toast(`Could not read ${f.name}`, 'err'); }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const rotate = async (i) => {
    const pg = pages[i];
    const c = document.createElement('canvas');
    c.width = pg.canvas.height; c.height = pg.canvas.width;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(pg.canvas, -pg.canvas.width / 2, -pg.canvas.height / 2);
    setPages((p) => p.map((x, j) => (j === i ? { canvas: c, url: c.toDataURL('image/jpeg', 0.85) } : x)));
  };

  const move = (i, dir) => setPages((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const exportPdf = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const recs = [];
      for (const pg of pages) recs.push(await canvasPage(pg.canvas, 0.9));
      dl(buildImagePdf(recs), 'scan.pdf');
      toast(`PDF saved — ${pages.length} page${pages.length === 1 ? '' : 's'}`);
      sfxPlay('success');
    } catch { toast('Could not build the PDF', 'err'); sfxPlay('error'); }
    setBusy(false);
  };

  const saveImages = async () => {
    for (let i = 0; i < pages.length; i++) {
      const blob = await new Promise((r) => pages[i].canvas.toBlob(r, 'image/jpeg', 0.9));
      if (blob) dl(blob, `scan-page-${i + 1}.jpg`);
    }
    toast('Page images saved');
  };

  return (<>
    <div className="cats">
      {[['doc', 'Document B&W'], ['colour', 'Colour clean-up'], ['orig', 'Original']].map(([id, n]) => (
        <button key={id} className={`cat ${mode === id ? 'on' : ''}`} onClick={() => setMode(id)}>{n}</button>))}
    </div>

    {camOn ? (
      <div style={{ marginTop: 12 }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: '100%', borderRadius: 16, background: '#000', display: 'block', maxHeight: '60vh', objectFit: 'cover' }} />
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn" style={{ flex: 2 }} disabled={busy} onClick={capture}>
            <Icon n="camera" size={16} /> Capture page</button>
          <button className="btn ghost" style={{ flex: 1 }} onClick={stopCam}>Close camera</button>
        </div>
      </div>
    ) : (
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn" style={{ flex: 1 }} onClick={startCam}>
          <Icon n="camera" size={16} /> Open camera</button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
          <Icon n="image" size={16} /> Add photos</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => onFiles([...e.target.files])} />
      </div>)}
    {camErr && <div className="err" style={{ marginTop: 10 }}><p>{camErr}</p></div>}

    {pages.length === 0 && !camOn && (
      <Empty icon="camera" t="No pages yet — photograph a document or add photos of it" />)}
    {pages.length > 0 && (<>
      <div className="dim sm" style={{ margin: '12px 0 8px' }}>{pages.length} page{pages.length === 1 ? '' : 's'} — in order</div>
      <div className="list">
        {pages.map((pg, i) => (
          <div className="row" key={i}>
            <img src={pg.url} alt={`Page ${i + 1}`} style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }} />
            <div className="main"><b>Page {i + 1}</b>
              <span className="dim sm">{pg.canvas.width} × {pg.canvas.height}</span></div>
            <button className="rowbtn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon n="up" size={16} /></button>
            <button className="rowbtn" aria-label="Move down" disabled={i === pages.length - 1} onClick={() => move(i, 1)}><Icon n="down" size={16} /></button>
            <button className="rowbtn" aria-label="Rotate page" onClick={() => rotate(i)}><Icon n="refresh" size={16} /></button>
            <button className="rowbtn" aria-label="Remove page" style={{ color: 'var(--bad)' }}
              onClick={() => { setPages((p) => p.filter((_, j) => j !== i)); sfxPlay('remove'); }}>
              <Icon n="trash" size={16} /></button>
          </div>))}
      </div>
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn" style={{ flex: 2 }} disabled={busy} onClick={exportPdf}>
          <Icon n="doc" size={16} /> {busy ? 'Building…' : 'Save as one PDF'}</button>
        <button className="btn ghost" style={{ flex: 1 }} disabled={busy} onClick={saveImages}>Save images</button>
      </div>
    </>)}
    <Card style={{ marginTop: 14 }}>
      <p className="dim sm" style={{ margin: 0, lineHeight: 1.55 }}>
        This is a scan <b>enhancer</b>: it stretches contrast, sharpens text and can turn a page
        into clean black &amp; white. It does not auto-detect corners or straighten a page shot
        at an angle — for the cleanest result, photograph straight-on in good light.
        Everything is processed on this device; no page is uploaded anywhere.</p>
    </Card>
  </>);
}

export default Scanner;
