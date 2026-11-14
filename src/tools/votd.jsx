/**
 * Verse of the Day — one verse a day, rotating across the Gita, the
 * Quran, the Guru Granth Sahib and the Bible, drawn only from texts the
 * app itself carries (src/data/votd-pool.js). The same verse all day,
 * chosen by the date alone. The share card is drawn on a canvas at
 * 1080×1350 — text is wrapped and shrunk until it provably fits.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Spin, Err, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { savePos } from '../ui/readerkit';
import { votdPick, votdKind } from '../core/votd';

const KIND_HEAD = { gita: 'Verse of the Day', quran: 'Ayat of the Day', gurbani: 'Shabad of the Day', bible: 'Verse of the Day' };
const SCRIPT_FONT = {
  dev: '"Noto Sans Devanagari", sans-serif',
  ar: '"Noto Naskh Arabic", serif',
  pa: '"Noto Sans Gurmukhi", sans-serif',
  en: 'Georgia, "Times New Roman", serif',
};
const SCRIPT_CLS = { dev: 'f-dev', ar: 'f-ar', pa: 'f-pa', en: '' };
const SCRIPT_LANG = { dev: 'sa', ar: 'ar', pa: 'pa', en: 'en' };

function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const trial = line ? line + ' ' + w : w;
      if (ctx.measureText(trial).width > maxWidth && line) { out.push(line); line = w; }
      else line = trial;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Draw the card; returns the canvas. Throws if a font is missing. */
async function drawCard(entry, dateLabel) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const fam = SCRIPT_FONT[entry.script];
  // Make sure the script font is really loaded before measuring with it.
  await document.fonts.load(`64px ${fam.split(',')[0].replace(/"/g, '')}`);
  await document.fonts.ready;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#06231a'); g.addColorStop(0.55, '#04150f'); g.addColorStop(1, '#020b08');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,224,138,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = 'rgba(0,224,138,0.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(52, 52, W - 104, H - 104);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ee2b8';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(KIND_HEAD[entry.k].toUpperCase(), W / 2, 128);
  ctx.fillStyle = '#e9f5ef';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText(entry.ref, W / 2, 186);

  const rtl = entry.script === 'ar';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  // Shrink the verse font until verse + meaning fit the middle band.
  let size = 58, lines = [], mLines = [];
  const meaning = entry.meaning || '';
  for (; size >= 30; size -= 4) {
    ctx.font = `${size}px ${fam}`;
    lines = wrapText(ctx, entry.text, W - 220);
    ctx.font = '34px system-ui, sans-serif';
    mLines = meaning ? wrapText(ctx, meaning, W - 240) : [];
    const need = lines.length * size * 1.55 + (mLines.length ? 46 + mLines.length * 47 : 0);
    if (need <= 800) break;
  }
  let y = 300 + Math.max(0, (800 - (lines.length * size * 1.55 + (mLines.length ? 46 + mLines.length * 47 : 0))) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${size}px ${fam}`;
  for (const ln of lines) { ctx.fillText(ln, W / 2, y); y += size * 1.55; }
  if (mLines.length) {
    y += 46;
    ctx.direction = 'ltr';  // the meaning is always a left-to-right gloss
    ctx.fillStyle = '#b9cdc4';
    ctx.font = '34px system-ui, sans-serif';
    for (const ln of mLines) { ctx.fillText(ln, W / 2, y); y += 47; }
  }
  ctx.direction = 'ltr';
  ctx.fillStyle = '#5f7a6e';
  ctx.font = '30px system-ui, sans-serif';
  ctx.fillText(dateLabel, W / 2, H - 128);
  ctx.fillStyle = '#00e08a';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText('OmniTools', W / 2, H - 82);
  return cv;
}

export function VerseOfDay() {
  const [pool, setPool] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [runId, setRunId] = useState(0);
  const today = useMemo(() => new Date(), []);
  const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    let dead = false;
    import('../data/votd-pool.js').then((m) => { if (!dead) setPool(m.POOL); })
      .catch((e) => { if (!dead) setErr(e.message || 'The verse pool could not be loaded.'); });
    return () => { dead = true; };
  }, [runId]);

  const entry = useMemo(() => (pool ? votdPick(pool, today) : null), [pool, today]);

  const openReader = () => {
    if (!entry) return;
    const go = entry.go || {};
    if (go.tool === 'gita') savePos('gita', { ch: go.ch }, { t: 'Bhagavad Gita', s: `Chapter ${go.ch}` });
    if (go.tool === 'quran') savePos('quran', { surah: go.surah, page: Math.floor((go.ayah - 1) / 10) }, { t: 'Quran', s: `Surah ${go.surah}` });
    if (go.tool === 'bible') savePos('bible', { book: go.book, chapter: go.chapter }, { t: 'Holy Bible', s: entry.ref });
    location.hash = go.tool || 'votd';
  };

  const card = async () => {
    setBusy('card');
    try { return await drawCard(entry, dateLabel); }
    finally { setBusy(''); }
  };
  const download = async () => {
    try {
      const cv = await card();
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      if (!blob) throw new Error('The card image could not be created.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `verse-of-the-day-${today.toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Card image saved', 'ok');
    } catch (e) { toast(e.message || 'Card failed', 'err'); }
  };
  const share = async () => {
    try {
      const cv = await card();
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      if (!blob) throw new Error('The card image could not be created.');
      const file = new File([blob], 'verse-of-the-day.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: KIND_HEAD[entry.k], text: `${entry.ref} — ${entry.text.slice(0, 120)}` });
      } else if (navigator.share) {
        await navigator.share({ title: KIND_HEAD[entry.k], text: `${entry.ref}\n${entry.text}` });
      } else {
        await navigator.clipboard.writeText(`${entry.ref}\n${entry.text}\n${entry.meaning || ''}`);
        toast('Sharing is not available here — the verse was copied instead', 'info');
      }
    } catch (e) { if (e.name !== 'AbortError') toast(e.message || 'Share failed', 'err'); }
  };

  if (err) return <Err error={err} retry={() => { setErr(''); setRunId((n) => n + 1); }} />;
  if (!entry) return <Spin t="Choosing today's verse" />;
  return (<>
    <Card>
      <div className="chead">{KIND_HEAD[entry.k]} · {dateLabel}</div>
      <div className="dim sm" style={{ marginBottom: 8 }}>{entry.ref}</div>
      <div className={SCRIPT_CLS[entry.script]} lang={SCRIPT_LANG[entry.script]}
        dir={entry.script === 'ar' ? 'rtl' : undefined}
        style={{ fontFamily: SCRIPT_FONT[entry.script], fontSize: entry.script === 'ar' ? 25 : 21, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
        {entry.text}
      </div>
      {entry.translit && entry.k !== 'quran' && (
        <div className="dim" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>{entry.translit}</div>)}
      {entry.meaning && (
        <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.65 }}>{entry.meaning}</div>)}
      {entry.k === 'quran' && entry.translit && (
        <div className="f-ur" lang="ur" dir="rtl" style={{ marginTop: 10, fontSize: 17 }}>{entry.translit}</div>)}
      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn" onClick={download} disabled={!!busy}><Icon n="download" size={15} /> Card image</button>
        <button className="btn" onClick={share} disabled={!!busy}><Icon n="repeat" size={15} /> Share</button>
      </div>
      {/* Own full-width row (user, 2026-11-14): inside the row above, this
          button rendered ON TOP of Share — it never shares a row again. */}
      <button className="btn ghost" onClick={openReader} style={{ width: '100%', marginTop: 8 }}>
        <Icon n="book" size={15} /> Read in context
      </button>
      <div className="dim sm" style={{ marginTop: 8 }}>
        One verse a day, the same all day, rotating through the Gita, the Quran, the Guru Granth Sahib and
        the Bible — always from the texts this app itself carries. Today's source: {votdKind(today).label}.
      </div>
    </Card>
  </>);
}

export default VerseOfDay;
