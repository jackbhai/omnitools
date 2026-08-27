/**
 * Global player: one <audio> element for the whole app, so music keeps playing
 * while the user browses other tools. Exposes a mini-bar (always visible when
 * something is loaded) that expands into a full-screen player.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { lyricsPool } from './ytmusic';
import { resolveAudio, prefetchAudio } from './audio-resolve';
import { resolve } from './engine';

const Ctx = createContext(null);
export const usePlayer = () => useContext(Ctx);

const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const PRESETS = {
  Flat: [0,0,0,0,0,0,0,0,0,0],
  'Bass Boost': [10,8,6,3,0,0,0,0,0,0],
  'Punjabi Beat': [9,7,4,0,-1,1,3,5,4,2],
  Vocal: [-3,-2,0,3,6,6,3,1,0,-1],
  Treble: [0,0,0,0,0,2,4,6,8,8],
  'Lo-Fi': [5,4,2,0,-2,-4,-6,-8,-9,-10],
  Party: [8,6,3,0,-1,0,3,6,7,7],
};

class Chain {
  attach(el) {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.src = this.ctx.createMediaElementSource(el);
      this.eq = BANDS.map((f, i) => {
        const b = this.ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0;
        return b;
      });
      this.bass = this.ctx.createBiquadFilter(); this.bass.type = 'lowshelf'; this.bass.frequency.value = 200;
      this.treb = this.ctx.createBiquadFilter(); this.treb.type = 'highshelf'; this.treb.frequency.value = 3200;
      this.comp = this.ctx.createDynamicsCompressor();
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 128;
      let n = this.src;
      for (const f of this.eq) { n.connect(f); n = f; }
      n.connect(this.bass); this.bass.connect(this.treb);
      this.treb.connect(this.comp); this.comp.connect(this.an);
      this.an.connect(this.ctx.destination);
      this.ready = true;
    } catch { this.ready = false; }
  }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  band(i, v) { this.eq?.[i] && (this.eq[i].gain.value = v); }
  setBass(v) { this.bass && (this.bass.gain.value = v); }
  setTreb(v) { this.treb && (this.treb.gain.value = v); }
  setComp(on) { if (this.comp) { this.comp.threshold.value = on ? -32 : 0; this.comp.ratio.value = on ? 12 : 1; } }
}
export const chain = new Chain();

export function PlayerProvider({ children }) {
  const audio = useRef(null);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(-1);
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');     // off | one | all
  const [full, setFull] = useState(false);
  const [err, setErr] = useState('');
  const [lyrics, setLyrics] = useState(null);
  const [eq, setEq] = useState([...PRESETS.Flat]);
  const [preset, setPreset] = useState('Flat');
  const [bass, setBass] = useState(0);
  const [treb, setTreb] = useState(0);
  const [comp, setComp] = useState(false);
  const [rate, setRate] = useState(1);
  const [sleep, setSleep] = useState(0);
  const [yt, setYt] = useState(null);
  const [stage, setStage] = useState('');   // active YouTube id (IFrame mode)

  /* ---- play a track (resolving the stream if needed) ---- */
  const play = useCallback(async (t, list) => {
    const el = audio.current; if (!el) return;
    setErr(''); setLyrics(null);
    if (list) { setQueue(list); setIdx(list.findIndex((x) => (x.id ?? x.url) === (t.id ?? t.url))); }
    setTrack(t); setLoading(true);

    // YouTube tracks -> resolve to a DIRECT audio stream (no ads, keeps
    // playing in the background). The IFrame is only a last-resort fallback
    // if every proxy path fails.
    if (t.needsResolve && t.id) {
      setYt(null);
      try {
        setLoading(true);
        const r = await resolveAudio(t.id, { onProgress: setStage });
        const meta = { ...t, art: t.art || r.art, artist: t.artist || r.artist, dlUrl: r.audio };
        setTrack(meta);
        el.src = r.audio;
        el.playbackRate = rate;
        chain.attach(el); chain.resume();
        await el.play();
        setPlaying(true); setStage(''); setLoading(false);
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: meta.title || '', artist: meta.artist || '',
              artwork: meta.art ? [{ src: meta.art, sizes: '512x512' }] : [] });
          } catch {}
        }
        // warm the next track so skipping feels instant
        if (list) {
          const i = list.findIndex((x) => x.id === t.id);
          if (i >= 0 && list[i + 1]?.id) prefetchAudio(list[i + 1].id);
        }
        resolve('lyrics', lyricsPool, { title: meta.title || '', artist: meta.artist || '' }, { ttl: 864e5 })
          .then((r2) => setLyrics(r2.data)).catch(() => setLyrics(null));
        return;
      } catch (e) {
        console.warn('[player] direct audio failed:', e && e.message, e);
        // If the stream resolved but autoplay was blocked, keep the audio
        // element loaded so a tap on play works - do NOT drop to the embed.
        if (el.src && (e?.name === 'NotAllowedError' || /gesture|interact/i.test(e?.message || ''))) {
          setStage(''); setLoading(false); setPlaying(false);
          setErr('Tap play to start (browser blocked autoplay)');
          return;
        }
        // Fallback: official embed. Has ads, but the song still plays.
        setStage(''); setLoading(false);
        el.pause(); el.removeAttribute('src'); el.load();
        setYt(t.id); setPlaying(true);
        setErr('Ad-free stream unavailable — using embed fallback');
        resolve('lyrics', lyricsPool, { title: t.title || '', artist: t.artist || '' }, { ttl: 864e5 })
          .then((r2) => setLyrics(r2.data)).catch(() => setLyrics(null));
        return;
      }
    }
    setYt(null);
    try {
      let url = t.stream || t.url || t.preview;
      let meta = t;
      if (!url) throw new Error('No playable source');
      el.src = url; el.playbackRate = rate;
      chain.attach(el); chain.resume();
      await el.play();
      setPlaying(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: meta.title || meta.name || 'Unknown',
          artist: meta.artist || meta.country || '',
          artwork: meta.art ? [{ src: meta.art, sizes: '512x512' }] : [],
        });
      }
      // background lyrics fetch (non-blocking)
      resolve('lyrics', lyricsPool, { title: meta.title || '', artist: meta.artist || '' }, { ttl: 864e5 })
        .then((r) => setLyrics(r.data)).catch(() => setLyrics(null));
    } catch (e) {
      setErr(e.message || 'Could not play this track');
      setPlaying(false);
    }
    setLoading(false);
  }, [rate]);

  const toggle = useCallback(() => {
    if (yt) {                       // control the IFrame player
      const f = document.getElementById('yt-frame');
      f?.contentWindow?.postMessage(JSON.stringify({ event: 'command',
        func: playing ? 'pauseVideo' : 'playVideo', args: [] }), '*');
      setPlaying((v) => !v);
      return;
    }
    const el = audio.current; if (!el?.src) return;
    chain.resume();
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  }, [yt, playing]);

  const step = useCallback((d) => {
    if (!queue.length) return;
    let n;
    if (shuffle) n = Math.floor(Math.random() * queue.length);
    else n = idx + d;
    if (n < 0) n = queue.length - 1;
    if (n >= queue.length) { if (repeat === 'off') return; n = 0; }
    setIdx(n); play(queue[n], queue);
  }, [queue, idx, shuffle, repeat, play]);

  const seek = useCallback((s) => { if (audio.current) audio.current.currentTime = s; }, []);

  /* media-session hardware / lock-screen buttons */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    } catch {}
  }, [toggle, step]);

  /* sleep timer */
  useEffect(() => {
    if (!sleep) return;
    const t = setTimeout(() => { audio.current?.pause(); setPlaying(false); setSleep(0); }, sleep * 60000);
    return () => clearTimeout(t);
  }, [sleep]);

  const applyPreset = useCallback((name) => {
    setPreset(name);
    const v = PRESETS[name] || PRESETS.Flat;
    setEq([...v]); v.forEach((g, i) => chain.band(i, g));
  }, []);

  const value = {
    audio, yt, stage, track, playing, loading, pos, dur, queue, idx, shuffle, repeat, full, err, lyrics,
    eq, preset, bass, treb, comp, rate, sleep,
    play, toggle, step, seek, setShuffle, setRepeat, setFull, setSleep, applyPreset,
    setEqBand: (i, v) => { const n = [...eq]; n[i] = v; setEq(n); chain.band(i, v); setPreset('Custom'); },
    setBassV: (v) => { setBass(v); chain.setBass(v); },
    setTrebV: (v) => { setTreb(v); chain.setTreb(v); },
    setCompV: (v) => { setComp(v); chain.setComp(v); },
    setRateV: (v) => { setRate(v); if (audio.current) { audio.current.playbackRate = v; audio.current.preservesPitch = true; } },
    BANDS,
  };

  return (
    <Ctx.Provider value={value}>
      <audio
        ref={audio} crossOrigin="anonymous" preload="none"
        onTimeUpdate={(e) => { setPos(e.target.currentTime); setDur(e.target.duration || 0); }}
        onEnded={() => { if (repeat === 'one') { audio.current.currentTime = 0; audio.current.play(); } else step(1); }}
        onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)}
        onError={() => { if (track) setErr('Stream failed — try another source'); }}
      />
      {children}
    </Ctx.Provider>
  );
}
