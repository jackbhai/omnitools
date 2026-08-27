/**
 * Universal downloader — separate buttons for VIDEO (with quality picker),
 * AUDIO extraction and THUMBNAIL grabbing, exactly as requested.
 *
 * Sources: AHM7 alldl (100+ platforms) primary, Piped mirrors as fallback for
 * YouTube (they expose per-quality stream lists).
 */
import React, { useState } from 'react';
import { jget } from '../core/engine';
import { ahm7Json } from '../core/audio-resolve';
import { Card, Spin, Err, Chips, Copy, fmt } from '../ui/kit';

const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de'];
/** Filenames must not contain path or reserved characters. */
const sanitize = (t) => String(t || 'download').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const ytId = (u) => {
  const m = String(u).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

const THUMBS = [
  ['maxresdefault', 'Max (1280×720)'], ['sddefault', 'SD (640×480)'],
  ['hqdefault', 'HQ (480×360)'], ['mqdefault', 'MQ (320×180)'],
];

export function Downloader() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState(null);

  const fetchInfo = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr(''); setInfo(null);
    const id = ytId(url);
    let got = null;

    // 1) AHM7 — broadest platform coverage
    try {
      // must go through the CORS proxy - AHM7 sends no ACAO header
      const d = await ahm7Json(url.trim());
      const m = d.mediaInfo || {};
      if (m.videoUrl || m.audioUrl) {
        got = {
          title: m.title || 'Media', author: m.author || '', platform: m.platform || '',
          thumb: m.thumbnail || m.coverImage || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
          audio: m.audioUrl || null, video: m.videoUrl || null,
          qualities: [], audioOptions: [], id, via: 'AHM7',
        };
      }
    } catch { /* try piped */ }

    // 2) Piped — gives an explicit per-quality list for YouTube
    if (id) {
      for (const base of PIPED) {
        try {
          const d = await jget(`${base}/streams/${id}`, { ms: 15000 });
          const vids = (d.videoStreams || []).filter((v) => v.url);
          const auds = (d.audioStreams || []).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (vids.length || auds.length) {
            got = {
              title: d.title || got?.title || 'Video', author: d.uploader || got?.author || '',
              platform: 'YouTube', thumb: d.thumbnailUrl || got?.thumb || '',
              audio: auds[0]?.url || got?.audio || null,
              video: vids[0]?.url || got?.video || null,
              duration: d.duration,
              qualities: vids.map((v) => ({
                q: v.quality + (v.videoOnly ? ' (no audio)' : ''), url: v.url,
                mime: v.mimeType, size: v.contentLength })),
              audioOptions: auds.map((a) => ({
                q: `${Math.round((a.bitrate || 0) / 1000)} kbps ${(a.mimeType || '').split('/')[1] || ''}`,
                url: a.url, size: a.contentLength })),
              id, via: got ? 'AHM7 + Piped' : 'Piped',
            };
            break;
          }
        } catch { /* next mirror */ }
      }
    }

    if (!got) setErr('Could not fetch this link. It may be private, region-locked, or unsupported.');
    setInfo(got); setBusy(false);
  };

  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');

  /**
   * A cross-origin `<a download>` is ignored by browsers, and this CDN also
   * 302-redirects - so the old click did nothing. Fetch the bytes instead and
   * save from a blob URL, which produces a real file with a real name.
   */
  const grab = async (u, name) => {
    setSaving(name); setNote('');
    try {
      const res = await fetch(u, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = +(res.headers.get('content-length') || 0);
      const reader = res.body?.getReader();
      let blob;
      if (reader) {
        const chunks = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (total) setNote(`${Math.round((got / total) * 100)}%`);
          else setNote(`${(got / 1048576).toFixed(1)} MB`);
        }
        blob = new Blob(chunks);
      } else {
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNote('Saved');
    } catch (e) {
      // Last resort: hand the URL to the browser so the user still gets the file.
      setNote('Opening in a new tab…');
      window.open(u, '_blank', 'noopener');
    }
    setSaving('');
    setTimeout(() => setNote(''), 4000);
  };

  return (<>
    <div className="fld">
      <label>Paste any video link</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="YouTube · Instagram · TikTok · X · Facebook · Reddit…"
        enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && fetchInfo()} />
    </div>
    <div className="btnrow">
      <button className="btn" style={{ flex: 1 }} disabled={busy || !url.trim()} onClick={fetchInfo}>
        {busy ? 'Fetching…' : '🔍 Fetch'}</button>
      <button className="btn ghost" onClick={async () => {
        try { setUrl(await navigator.clipboard.readText()); } catch {} }}>📋 Paste</button>
    </div>

    {busy && <Spin t="Reading the link" />}
    {err && <div className="err" style={{ marginTop: 12 }}><h4>Couldn't fetch</h4><p>{err}</p></div>}

    {info && (<>
      <Card style={{ marginTop: 12 }}>
        {info.thumb && <img src={info.thumb} alt="" style={{ width: '100%', borderRadius: 12 }} />}
        <b style={{ display: 'block', marginTop: 10, fontSize: 15 }}>{info.title}</b>
        <span className="dim sm">{info.author}{info.platform ? ` · ${info.platform}` : ''}
          {info.duration ? ` · ${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : ''}</span>
        <div className="src"><span className="dot" /><span>resolved via {info.via}</span></div>
      </Card>

      {/* ---------------- AUDIO ---------------- */}
      <Card>
        <div className="chead">🎵 Audio only</div>
        {info.audioOptions?.length > 0 ? (
          <div className="btnrow">
            {info.audioOptions.slice(0, 6).map((a, i) => (
              <button key={i} className="btn sm" onClick={() => grab(a.url, `${sanitize(info.title)}-${a.q.replace(/\s+/g,'')}.m4a`)}>
                ⬇ {a.q}{a.size ? ` · ${(a.size / 1048576).toFixed(1)}MB` : ''}</button>))}
          </div>
        ) : info.audio ? (
          <button className="btn" style={{ width: '100%' }}
            onClick={() => grab(info.audio, `${sanitize(info.title)}.m4a`)}>
            {saving.endsWith('.m4a') ? (note || 'Downloading…') : '⬇ Download audio (M4A)'}</button>
        ) : <span className="dim sm">No separate audio track available.</span>}
        {info.audio && (
          <audio controls src={info.audio} style={{ width: '100%', marginTop: 10 }} preload="none" />)}
      </Card>

      {/* ---------------- THUMBNAIL ---------------- */}
      <Card>
        <div className="chead">🖼️ Thumbnail</div>
        {info.id ? (
          <div className="btnrow">
            {THUMBS.map(([k, l]) => (
              <button key={k} className="btn ghost sm"
                onClick={() => grab(`https://i.ytimg.com/vi/${info.id}/${k}.jpg`, `${sanitize(info.title)}-${k}.jpg`)}>
                ⬇ {l}</button>))}
          </div>
        ) : info.thumb ? (
          <button className="btn" style={{ width: '100%' }}
            onClick={() => grab(info.thumb, `${sanitize(info.title)}-thumb.jpg`)}>⬇ Download thumbnail</button>
        ) : <span className="dim sm">No thumbnail found.</span>}
        {info.thumb && <div className="btnrow"><Copy text={info.thumb} label="Copy image URL" /></div>}
      </Card>

      {/* ---------------- VIDEO + QUALITY ---------------- */}
      <Card>
        <div className="chead">🎬 Video — pick a quality</div>
        {info.qualities?.length > 0 ? (
          <div className="list" style={{ border: 0 }}>
            {info.qualities.map((v, i) => (
              <div className="row" key={i} style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div className="main">
                  <b>{v.q}</b>
                  <span className="dim sm">{(v.mime || '').split(';')[0]}
                    {v.size ? ` · ${(v.size / 1048576).toFixed(1)} MB` : ''}</span>
                </div>
                <button className="btn sm" onClick={() => grab(v.url, `${sanitize(info.title)}-${v.q}.mp4`)}>{saving.includes(v.q) ? (note || '…') : '⬇'}</button>
              </div>))}
          </div>
        ) : info.video ? (
          <button className="btn" style={{ width: '100%' }}
            onClick={() => grab(info.video, `${sanitize(info.title)}.mp4`)}>
            {saving.endsWith('.mp4') ? (note || 'Downloading…') : '⬇ Download video'}</button>
        ) : <span className="dim sm">No downloadable video stream found.</span>}
      </Card>

      <div className="src">
        <span className="dot warn" />
        <span>Download only what you have the right to save. Respect each platform's terms
          and the creator's copyright.</span>
      </div>
    </>)}
  </>);
}
