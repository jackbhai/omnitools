import React, { useEffect, useRef, useState } from 'react';
import { usePlayer, PRESETS, chain } from '../core/player';

const mmss = (s) => (!s || !isFinite(s)) ? '0:00'
  : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ------------------------------------------------------------- mini bar */
export function MiniPlayer() {
  const p = usePlayer();
  if (!p?.track) return null;
  // When collapsed, the IFrame must stay mounted (off-screen) so playback
  // continues while the user browses other tools.
  const hidden = p.yt && !p.full ? (
    <div className="yt-hidden">
      <iframe id="yt-frame" title="player" allow="autoplay; encrypted-media"
        src={`https://www.youtube-nocookie.com/embed/${p.yt}?autoplay=1&enablejsapi=1&playsinline=1&rel=0`} />
    </div>) : null;
  const pct = p.dur ? (p.pos / p.dur) * 100 : 0;
  return (<>
    {hidden}
    <div className="mini" onClick={() => p.setFull(true)}>
      <div className="mini-prog"><i style={{ width: pct + '%' }} /></div>
      <div className="mini-row">
        {p.track.art
          ? <img src={p.track.art} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
          : <div className="mini-ph">🎵</div>}
        <div className="mini-txt">
          <b>{p.track.title || p.track.name}</b>
          <span>{p.err ? <em style={{ color: 'var(--bad)' }}>{p.err}</em>
            : p.loading ? 'Loading…' : (p.track.artist || p.track.country || '')}</span>
        </div>
        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); p.step(-1); }}>⏮</button>
        <button className="mini-btn play" onClick={(e) => { e.stopPropagation(); p.toggle(); }}>
          {p.loading ? '⋯' : p.playing ? '⏸' : '▶'}</button>
        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); p.step(1); }}>⏭</button>
      </div>
    </div>
  </>);
}

/* ------------------------------------------------------------- full screen */
export function FullPlayer() {
  const p = usePlayer();
  const [tab, setTab] = useState('art');       // art | lyrics | eq | queue
  const cv = useRef(null);
  const lyrRef = useRef(null);

  /* visualiser */
  useEffect(() => {
    if (!p?.full || tab !== 'art' || !p.playing || !chain.an || !cv.current) return;
    const c = cv.current, cx = c.getContext('2d');
    const buf = new Uint8Array(chain.an.frequencyBinCount);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      chain.an.getByteFrequencyData(buf);
      const w = c.width = c.offsetWidth * 2, h = c.height = 120;
      cx.clearRect(0, 0, w, h);
      const bw = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const bh = (buf[i] / 255) * h;
        const g = cx.createLinearGradient(0, h, 0, h - bh);
        g.addColorStop(0, '#00FF9C'); g.addColorStop(1, '#00E5FF');
        cx.fillStyle = g; cx.fillRect(i * bw, h - bh, bw - 2, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [p?.full, p?.playing, tab]);

  /* auto-scroll synced lyrics */
  const activeLine = (() => {
    const L = p?.lyrics?.synced;
    if (!L) return -1;
    let i = 0;
    while (i < L.length && L[i].t <= p.pos) i++;
    return i - 1;
  })();
  useEffect(() => {
    if (tab === 'lyrics' && activeLine >= 0 && lyrRef.current) {
      const el = lyrRef.current.querySelector(`[data-i="${activeLine}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLine, tab]);

  if (!p?.full || !p.track) return null;
  const t = p.track;

  return (
    <div className="full">
      <div className="full-top">
        <button className="iconbtn" onClick={() => p.setFull(false)}>⌄</button>
        <div className="full-ttl"><b>Now playing</b><span>{t.src || 'OmniTools'}</span></div>
        <button className="iconbtn" onClick={() => p.setSleep(p.sleep ? 0 : 30)}>
          {p.sleep ? '⏰' : '🌙'}</button>
      </div>

      <div className="full-tabs">
        {[['art','Player'],['lyrics','Lyrics'],['eq','Equalizer'],['queue','Queue']].map(([v, l]) => (
          <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}>{l}</button>))}
      </div>

      <div className="full-body">
        {tab === 'art' && (<>
          {p.yt ? (
            <div className="ytbox">
              <iframe id="yt-frame" title="player" allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                src={`https://www.youtube-nocookie.com/embed/${p.yt}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&modestbranding=1`} />
            </div>
          ) : (
            <div className="art-wrap">
              {t.art ? <img src={t.art} alt="" className="art" onError={(e) => { e.target.style.display = 'none'; }} />
                : <div className="art ph">🎵</div>}
            </div>)}
          <canvas ref={cv} className="viz" style={{ display: p.playing ? 'block' : 'none' }} />
          <h2 className="full-name">{t.title || t.name}</h2>
          <p className="dim" style={{ textAlign: 'center' }}>{t.artist || t.country || ''}</p>
          {p.err && <div className="err" style={{ marginTop: 12 }}><p>{p.err}</p></div>}
        </>)}

        {tab === 'lyrics' && (
          <div className="lyrics" ref={lyrRef}>
            {!p.lyrics && <div className="state"><span>No lyrics found for this track</span></div>}
            {p.lyrics?.synced && p.lyrics.synced.map((l, i) => (
              <p key={i} data-i={i} className={i === activeLine ? 'lyr on' : 'lyr'}
                onClick={() => p.seek(l.t)}>{l.line}</p>))}
            {p.lyrics && !p.lyrics.synced && (
              <pre className="lyr-plain">{p.lyrics.plain}</pre>)}
          </div>)}

        {tab === 'eq' && (
          <div>
            <div className="btnrow" style={{ marginBottom: 14 }}>
              {Object.keys(PRESETS).map((n) => (
                <button key={n} className={`cat ${p.preset === n ? 'on' : ''}`}
                  onClick={() => p.applyPreset(n)}>{n}</button>))}
            </div>
            <div className="eqrow">
              {p.BANDS.map((f, i) => (
                <div key={f} className="eqband">
                  <input type="range" min="-12" max="12" step="1" value={p.eq[i]}
                    onChange={(e) => p.setEqBand(i, +e.target.value)} className="vert" />
                  <span className="eqhz">{f >= 1000 ? f / 1000 + 'k' : f}</span>
                  <span className="eqdb">{p.eq[i] > 0 ? '+' : ''}{p.eq[i]}</span>
                </div>))}
            </div>
            <div className="hr" />
            <label className="dim sm">Bass {p.bass > 0 ? '+' : ''}{p.bass} dB</label>
            <input type="range" min="-15" max="15" value={p.bass} onChange={(e) => p.setBassV(+e.target.value)} />
            <label className="dim sm">Treble {p.treb > 0 ? '+' : ''}{p.treb} dB</label>
            <input type="range" min="-15" max="15" value={p.treb} onChange={(e) => p.setTrebV(+e.target.value)} />
            <label className="dim sm">Speed {p.rate}×</label>
            <input type="range" min="0.5" max="2" step="0.05" value={p.rate} onChange={(e) => p.setRateV(+e.target.value)} />
            <div className="btnrow">
              <button className={`cat ${p.comp ? 'on' : ''}`} onClick={() => p.setCompV(!p.comp)}>🔊 Loudness</button>
              <button className="cat" onClick={() => { p.applyPreset('Flat'); p.setBassV(0); p.setTrebV(0); p.setRateV(1); }}>↺ Reset</button>
            </div>
          </div>)}

        {tab === 'queue' && (
          <div className="list">
            {p.queue.length === 0 && <div className="state"><span>Queue is empty</span></div>}
            {p.queue.map((q, i) => (
              <div className="row" key={i} onClick={() => p.play(q, p.queue)}
                style={{ background: i === p.idx ? 'rgba(0,255,156,.08)' : '' }}>
                <span className="dim mono" style={{ width: 20 }}>{i + 1}</span>
                <div className="main"><b style={{ fontSize: 13 }}>{q.title || q.name}</b>
                  <span className="dim sm">{q.artist || ''}</span></div>
                {i === p.idx && <span style={{ color: 'var(--green)' }}>♪</span>}
              </div>))}
          </div>)}
      </div>

      <div className="full-ctl">
        <input type="range" className="seek" min="0" max={p.dur || 0} value={p.pos}
          onChange={(e) => p.seek(+e.target.value)} disabled={!p.dur} />
        <div className="times"><span>{mmss(p.pos)}</span><span>{mmss(p.dur)}</span></div>
        <div className="btns">
          <button className={`cbtn ${p.shuffle ? 'act' : ''}`} onClick={() => p.setShuffle(!p.shuffle)}>🔀</button>
          <button className="cbtn" onClick={() => p.step(-1)}>⏮</button>
          <button className="cbtn big" onClick={p.toggle}>{p.loading ? '⋯' : p.playing ? '⏸' : '▶'}</button>
          <button className="cbtn" onClick={() => p.step(1)}>⏭</button>
          <button className={`cbtn ${p.repeat !== 'off' ? 'act' : ''}`}
            onClick={() => p.setRepeat(p.repeat === 'off' ? 'all' : p.repeat === 'all' ? 'one' : 'off')}>
            {p.repeat === 'one' ? '🔂' : '🔁'}</button>
        </div>
        <div className="btnrow" style={{ justifyContent: 'center' }}>
          <button className="btn ghost sm" onClick={() => p.seek(Math.max(0, p.pos - 10))}>−10s</button>
          <button className="btn ghost sm" onClick={() => p.seek(p.pos + 10)}>+10s</button>
          {p.sleep > 0 && <span className="tag w">sleep {p.sleep}m</span>}
          {t.dlUrl && <a className="btn sm" href={t.dlUrl} download target="_blank" rel="noreferrer">⬇</a>}
        </div>
      </div>
    </div>);
}
