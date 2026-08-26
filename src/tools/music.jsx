/**
 * Music — Punjabi / Hindi / Pakistani, from legal CORS-clean sources.
 *
 *   Audius       full tracks, some downloadable
 *   Archive.org  public-domain & CC recordings, DOWNLOADABLE
 *   Radio        1,100+ desi live stations (Punjabi/Hindi/Urdu)
 *   iTunes       catalog + 30s preview (play only, never download)
 *
 * Download button appears ONLY when the source genuinely permits it.
 * Player: 10-band EQ, bass/treble shelves, compressor, visualizer,
 * background playback (MediaSession), offline cache (IndexedDB).
 */
import React, { useEffect, useRef, useState } from 'react';
import * as P from '../core/providers';
import { useData, Spin, Err, Empty, Src, Search, Card, Chips, fmt } from '../ui/kit';

/* --------------------------------------------------------- audio engine */
const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PRESETS = {
  Flat:       [0,0,0,0,0,0,0,0,0,0],
  'Bass Boost':[9,8,6,3,0,0,0,0,0,0],
  'Punjabi Beat':[8,7,3,0,-1,1,3,4,3,2],
  Vocal:      [-3,-2,0,3,5,5,3,1,0,-1],
  Treble:     [0,0,0,0,0,2,4,6,7,7],
  'Lo-Fi':    [5,4,2,0,-2,-3,-5,-7,-8,-9],
  Party:      [7,6,3,0,-1,0,3,5,6,6],
};

class Engine {
  constructor() { this.ready = false; }
  attach(el) {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.src = this.ctx.createMediaElementSource(el);
    this.filters = BANDS.map((f, i) => {
      const b = this.ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0;
      return b;
    });
    this.bass = this.ctx.createBiquadFilter();
    this.bass.type = 'lowshelf'; this.bass.frequency.value = 200;
    this.treble = this.ctx.createBiquadFilter();
    this.treble.type = 'highshelf'; this.treble.frequency.value = 3000;
    this.comp = this.ctx.createDynamicsCompressor();
    this.pan = this.ctx.createStereoPanner();
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;

    let node = this.src;
    for (const f of this.filters) { node.connect(f); node = f; }
    node.connect(this.bass); this.bass.connect(this.treble);
    this.treble.connect(this.comp); this.comp.connect(this.pan);
    this.pan.connect(this.gain); this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.ready = true;
  }
  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }
  setBand(i, v) { this.filters?.[i] && (this.filters[i].gain.value = v); }
  setBass(v) { this.bass && (this.bass.gain.value = v); }
  setTreble(v) { this.treble && (this.treble.gain.value = v); }
  setPan(v) { this.pan && (this.pan.pan.value = v); }
  setComp(on) { if (this.comp) { this.comp.threshold.value = on ? -30 : 0; this.comp.ratio.value = on ? 12 : 1; } }
}
const engine = new Engine();

/* --------------------------------------------------------- offline cache */
const DB = 'omni-audio';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saveOffline(id, blob, meta) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').put({ blob, meta, t: Date.now() }, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function listOffline() {
  const db = await idb();
  return new Promise((res) => {
    const tx = db.transaction('tracks', 'readonly').objectStore('tracks');
    const keys = tx.getAllKeys(), vals = tx.getAll();
    tx.transaction.oncomplete = () =>
      res(keys.result.map((k, i) => ({ id: k, ...vals.result[i] })));
  });
}

/* --------------------------------------------------------- main */
export function Music() {
  const [tab, setTab] = useState('radio');
  const [q, setQ] = useState('punjabi');
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showEq, setShowEq] = useState(false);
  const [eq, setEq] = useState([...PRESETS.Flat]);
  const [preset, setPreset] = useState('Flat');
  const [bass, setBass] = useState(0), [treble, setTreble] = useState(0);
  const [comp, setComp] = useState(false), [rate, setRate] = useState(1);
  const [pos, setPos] = useState(0), [dur, setDur] = useState(0);
  const [offline, setOffline] = useState([]);
  const [saving, setSaving] = useState('');
  const audio = useRef(null);
  const canvas = useRef(null);

  const pool = tab === 'radio' ? P.radio : tab === 'archive' ? [P.musicSearch[1]]
    : tab === 'itunes' ? P.itunes : [P.musicSearch[0]];
  const params = tab === 'radio' ? { q, mode: 'lang' } : { q };
  const s = useData('music-' + tab, pool, params, { auto: true, ttl: 6e5, deps: [tab] });

  useEffect(() => { listOffline().then(setOffline).catch(() => {}); }, []);

  /* visualizer */
  useEffect(() => {
    if (!playing || !engine.analyser || !canvas.current) return;
    const cv = canvas.current, cx = cv.getContext('2d');
    const buf = new Uint8Array(engine.analyser.frequencyBinCount);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      engine.analyser.getByteFrequencyData(buf);
      const w = cv.width = cv.offsetWidth * 2, h = cv.height = 96;
      cx.clearRect(0, 0, w, h);
      const bw = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const bh = (buf[i] / 255) * h;
        const g = cx.createLinearGradient(0, h, 0, h - bh);
        g.addColorStop(0, '#00FF9C'); g.addColorStop(1, '#00E5FF');
        cx.fillStyle = g;
        cx.fillRect(i * bw, h - bh, bw - 2, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const play = async (t) => {
    const el = audio.current; if (!el) return;
    const url = t.stream || t.url || t.preview || t.archiveUrl;
    if (!url) return;
    setTrack(t);
    el.src = url; el.playbackRate = rate;
    try {
      engine.attach(el); engine.resume();
      await el.play(); setPlaying(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title || t.name || 'Unknown',
          artist: t.artist || t.country || 'OmniTools',
          album: t.src || 'Radio',
          artwork: (t.art || t.fav) ? [{ src: t.art || t.fav, sizes: '512x512' }] : [],
        });
        navigator.mediaSession.setActionHandler('play', () => { el.play(); setPlaying(true); });
        navigator.mediaSession.setActionHandler('pause', () => { el.pause(); setPlaying(false); });
      }
    } catch (e) { setPlaying(false); }
  };

  const toggle = () => {
    const el = audio.current; if (!el?.src) return;
    engine.resume();
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  };

  const applyPreset = (name) => {
    setPreset(name); const v = PRESETS[name]; setEq([...v]);
    v.forEach((g, i) => engine.setBand(i, g));
  };

  /* Archive.org: resolve the actual audio file before playing/downloading */
  const openArchive = async (t) => {
    try {
      const meta = await fetch(`https://archive.org/metadata/${t.archiveId}`).then((r) => r.json());
      const f = (meta.files || []).find((x) => /\.(mp3|ogg|flac|m4a)$/i.test(x.name));
      if (!f) throw new Error('no audio file');
      const url = `https://archive.org/download/${t.archiveId}/${encodeURIComponent(f.name)}`;
      play({ ...t, stream: url, dlUrl: url, fmt: f.name.split('.').pop().toUpperCase() });
    } catch { alert('Could not load this recording — try another.'); }
  };

  const cacheTrack = async (t) => {
    const url = t.dlUrl || t.download;
    if (!url || url === 'archive') return;
    setSaving(t.id);
    try {
      const blob = await fetch(url).then((r) => r.blob());
      await saveOffline(String(t.id), blob, { title: t.title, artist: t.artist, art: t.art });
      setOffline(await listOffline());
    } catch { alert('Could not save offline.'); }
    setSaving('');
  };

  const TABS = [
    { v: 'radio', l: '📻 Radio' }, { v: 'audius', l: '🎵 Tracks' },
    { v: 'archive', l: '💿 Archive' }, { v: 'itunes', l: '🍎 Catalog' },
    { v: 'offline', l: '⬇ Offline' },
  ];
  const LANGS = ['punjabi', 'hindi', 'urdu', 'bhojpuri', 'tamil', 'bengali'];

  return (<>
    <audio ref={audio} crossOrigin="anonymous" preload="none"
      onTimeUpdate={(e) => { setPos(e.target.currentTime); setDur(e.target.duration || 0); }}
      onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />

    <div className="cats">{TABS.map((t) =>
      <button key={t.v} className={`cat ${tab === t.v ? 'on' : ''}`} onClick={() => setTab(t.v)}>{t.l}</button>)}</div>

    {tab === 'radio' && (
      <div className="btnrow">{LANGS.map((l) =>
        <button key={l} className={`cat ${q === l ? 'on' : ''}`}
          onClick={() => { setQ(l); s.run({ q: l, mode: 'lang' }); }}>{l}</button>)}</div>)}

    {tab !== 'radio' && tab !== 'offline' && (<>
      <Search value={q} onChange={setQ} onSubmit={() => s.run({ q })} ph="Search songs, artists…" />
      <div className="btnrow">{['punjabi','bollywood','pakistani','sufi','ghazal'].map((x) =>
        <button key={x} className="cat" onClick={() => { setQ(x); s.run({ q: x }); }}>{x}</button>)}</div>
    </>)}

    {/* ---------------- now playing ---------------- */}
    {track && (
      <Card style={{ marginTop: 12, position: 'sticky', top: 64, zIndex: 30 }}>
        <canvas ref={canvas} style={{ width: '100%', height: 48, display: playing ? 'block' : 'none' }} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: playing ? 8 : 0 }}>
          {(track.art || track.fav)
            ? <img src={track.art || track.fav} alt="" style={{ width: 54, height: 54, borderRadius: 11, objectFit: 'cover' }}
                onError={(e) => { e.target.style.display = 'none'; }} />
            : <div style={{ width: 54, height: 54, borderRadius: 11, background: 'var(--s3)', display: 'grid', placeItems: 'center', fontSize: 22 }}>🎵</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {track.title || track.name}</b>
            <span className="dim sm">{track.artist || track.country || track.src}</span>
          </div>
          <button className="iconbtn" onClick={toggle} style={{ background: 'var(--grad)', color: '#000', border: 0 }}>
            {playing ? '⏸' : '▶'}</button>
        </div>
        {dur > 0 && isFinite(dur) && (
          <input type="range" min="0" max={dur} value={pos} style={{ width: '100%', marginTop: 10 }}
            onChange={(e) => { audio.current.currentTime = +e.target.value; }} />)}
        <div className="btnrow">
          <button className="btn ghost sm" onClick={() => setShowEq((v) => !v)}>🎛 Equalizer</button>
          {(track.dlUrl || (track.download && track.download !== 'archive')) && (<>
            <a className="btn sm" href={track.dlUrl || track.download} download target="_blank" rel="noreferrer">⬇ Download</a>
            <button className="btn ghost sm" disabled={saving === track.id} onClick={() => cacheTrack(track)}>
              {saving === track.id ? 'Saving…' : '💾 Save offline'}</button>
          </>)}
          {track.src === 'iTunes' && <span className="tag w">preview only</span>}
          {tab === 'radio' && <span className="tag c">live stream</span>}
        </div>
      </Card>)}

    {/* ---------------- equalizer ---------------- */}
    {showEq && (
      <Card style={{ marginTop: 12 }}>
        <div className="chead">🎛 10-band equalizer</div>
        <div className="btnrow" style={{ marginBottom: 12 }}>
          {Object.keys(PRESETS).map((p) =>
            <button key={p} className={`cat ${preset === p ? 'on' : ''}`} onClick={() => applyPreset(p)}>{p}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {BANDS.map((f, i) => (
            <div key={f} style={{ flex: 1, textAlign: 'center' }}>
              <input type="range" min="-12" max="12" step="1" value={eq[i]}
                onChange={(e) => { const v = +e.target.value; const n = [...eq]; n[i] = v; setEq(n);
                  engine.setBand(i, v); setPreset('Custom'); }}
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 20, height: 84, accentColor: '#00FF9C' }} />
              <div style={{ fontSize: 8.5, color: 'var(--fg3)', marginTop: 4 }}>
                {f >= 1000 ? f / 1000 + 'k' : f}</div>
              <div style={{ fontSize: 8.5, color: 'var(--green)' }}>{eq[i] > 0 ? '+' : ''}{eq[i]}</div>
            </div>))}
        </div>
        <div className="hr" />
        <label className="dim sm">Bass {bass > 0 ? '+' : ''}{bass} dB</label>
        <input type="range" min="-15" max="15" value={bass} style={{ width: '100%', accentColor: '#00FF9C' }}
          onChange={(e) => { setBass(+e.target.value); engine.setBass(+e.target.value); }} />
        <label className="dim sm">Treble {treble > 0 ? '+' : ''}{treble} dB</label>
        <input type="range" min="-15" max="15" value={treble} style={{ width: '100%', accentColor: '#00E5FF' }}
          onChange={(e) => { setTreble(+e.target.value); engine.setTreble(+e.target.value); }} />
        <label className="dim sm">Speed {rate}×</label>
        <input type="range" min="0.5" max="2" step="0.05" value={rate} style={{ width: '100%', accentColor: '#00FF9C' }}
          onChange={(e) => { setRate(+e.target.value); if (audio.current) { audio.current.playbackRate = +e.target.value;
            audio.current.preservesPitch = true; } }} />
        <div className="btnrow">
          <button className={`cat ${comp ? 'on' : ''}`} onClick={() => { setComp(!comp); engine.setComp(!comp); }}>
            🔊 Loudness</button>
          <button className="cat" onClick={() => { applyPreset('Flat'); setBass(0); setTreble(0);
            engine.setBass(0); engine.setTreble(0); setRate(1); }}>↺ Reset</button>
        </div>
      </Card>)}

    {/* ---------------- offline library ---------------- */}
    {tab === 'offline' && (
      offline.length === 0 ? <Empty t="No saved tracks yet. Download from Archive or Audius." />
      : <div className="list" style={{ marginTop: 12 }}>
          {offline.map((o) => (
            <div className="row" key={o.id}>
              <div className="main"><b>{o.meta?.title || o.id}</b>
                <span className="dim sm">{o.meta?.artist} · {(o.blob.size / 1048576).toFixed(1)} MB</span></div>
              <button className="iconbtn" onClick={() => {
                const url = URL.createObjectURL(o.blob);
                play({ ...o.meta, id: o.id, stream: url, src: 'Offline' });
              }}>▶</button>
            </div>))}
        </div>)}

    {/* ---------------- results ---------------- */}
    {tab !== 'offline' && (<>
      {s.loading && <Spin t="Finding music" />}
      {s.error && <Err error={s.error} retry={() => s.run()} />}
      {s.data?.length === 0 && <Empty />}
      {s.data?.length > 0 && (<>
        <div className="list" style={{ marginTop: 12 }}>
          {s.data.map((t, i) => (
            <div className="row" key={t.id || i} onClick={() =>
              tab === 'archive' ? openArchive(t) : play({ ...t, dlUrl: t.download && t.download !== 'archive' ? t.download : null })}
              style={{ cursor: 'pointer' }}>
              {(t.art || t.fav)
                ? <img src={t.art || t.fav} alt="" loading="lazy"
                    style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto', background: 'var(--s3)' }}
                    onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                : <div style={{ width: 42, height: 42, borderRadius: 9, background: 'var(--s3)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                    {tab === 'radio' ? '📻' : '🎵'}</div>}
              <div className="main">
                <b style={{ fontSize: 13.5 }}>{(t.title || t.name || '').slice(0, 48)}</b>
                <span className="dim sm">
                  {t.artist || t.country || ''}
                  {t.bitrate ? ` · ${t.bitrate}kbps ${t.codec}` : ''}
                  {t.dur ? ` · ${Math.floor(t.dur / 60)}:${String(t.dur % 60).padStart(2, '0')}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                {t.download && t.download !== 'archive' && <span className="tag g">⬇</span>}
                {tab === 'archive' && <span className="tag g">⬇</span>}
                {tab === 'itunes' && <span className="tag w">30s</span>}
                <span style={{ fontSize: 17 }}>▶</span>
              </div>
            </div>))}
        </div>
        <Src meta={s.meta} />
      </>)}
    </>)}

    <div className="src" style={{ marginTop: 14 }}>
      <span className="dot" />
      <span>Legal sources only. ⬇ shows where the licence permits download; live radio &amp; previews are play-only.</span>
    </div>
  </>);
}
