/**
 * Global player: one <audio> element for the whole app, so music keeps playing
 * while the user browses other tools. Exposes a mini-bar (always visible when
 * something is loaded) that expands into a full-screen player.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { lyricsPool } from './ytmusic';
import { resolveAudio, prefetchAudio, prefetchNext, forgetAudio, isCached } from './audio-resolve';
import { resolve } from './engine';

const Ctx = createContext(null);
export const usePlayer = () => useContext(Ctx);

const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/* 0.05s of silence — played on tap so the <audio> element is unlocked before
   the ~7s stream resolution finishes and the user gesture expires. */
const SILENCE = 'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////////////////////////8AAAA5' +
  'TEFNRTMuOTlyAc0AAAAAAAAAABSAJAJAQgAAgAAAAnGMUJAtAAAAAAAAAAAAAAAAAAAA';
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
  const retriedRef = useRef(null);      // last id we already re-resolved once
  const recoveringRef = useRef(false);  // a re-resolve is in flight
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
    if (retriedRef.current !== t.id) retriedRef.current = null;
    recoveringRef.current = false;

    // YouTube tracks -> resolve to a DIRECT audio stream (no ads, keeps
    // playing in the background). The IFrame is only a last-resort fallback
    // if every proxy path fails.
    if (t.needsResolve && t.id) {
      setYt(null);
      const cached = isCached(t.id);
      // Consume the user gesture NOW so the element is unlocked for later.
      // Skipped when the stream is already cached: we can set the real src
      // immediately and avoid the extra load cycle entirely.
      if (!cached) { try { el.src = SILENCE; el.play().catch(() => {}); } catch {} }

      // Progress that reflects reality: the resolver needs ~8-15 s, so tell the user.
      let tick = 0;
      const clock = cached ? null : setInterval(() => {
        tick += 1;
        if (tick <= 2) setStage('Finding ad-free stream…');
        else if (tick <= 6) setStage(`Finding ad-free stream… ${tick}s`);
        else if (tick <= 14) setStage(`Still working… ${tick}s (source is slow)`);
        else setStage(`Almost there… ${tick}s`);
      }, 1000);

      try {
        setLoading(true);
        if (!cached) setStage('Finding ad-free stream…');
        const r = await resolveAudio(t.id, { onProgress: setStage });
        if (clock) clearInterval(clock);
        const meta = { ...t, art: t.art || r.art, artist: t.artist || r.artist, dlUrl: r.audio };
        setTrack(meta);
        // No crossOrigin here: the CDN 302-redirects and a tainted CORS
        // handshake can kill playback. Audio first, EQ best-effort after.
        el.removeAttribute('crossorigin');
        // A cached link can already be dead. If it is, the element fires
        // `error` the moment the src is set — before play() rejects — so the
        // handler must know a recovery is possible and stay quiet. Arming
        // this BEFORE assigning src is what stops the "Stream failed" flash.
        if (cached) { recoveringRef.current = true; retriedRef.current = t.id; }
        el.src = r.audio;
        el.playbackRate = rate;
        setStage('Buffering…');
        await el.play();
        recoveringRef.current = false;
        try { chain.attach(el); chain.resume(); } catch {}
        setPlaying(true); setStage(''); setLoading(false); setErr('');
        if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: meta.title || '', artist: meta.artist || '',
              artwork: meta.art ? [{ src: meta.art, sizes: '512x512' }] : [] });
          } catch {}
        }
        // warm the next few tracks so skipping is instant
        if (list) {
          const i = list.findIndex((x) => (x.id ?? x.url) === (t.id ?? t.url));
          if (i >= 0) prefetchNext(list, i, 3);
        }
        resolve('lyrics', lyricsPool, { title: meta.title || '', artist: meta.artist || '' }, { ttl: 864e5 })
          .then((r2) => setLyrics(r2.data)).catch(() => setLyrics(null));
        return;
      } catch (e) {
        if (clock) clearInterval(clock);
        console.warn('[player] direct audio failed:', e && e.message, e);
        const blocked = e?.name === 'NotAllowedError' ||
          /gesture|interact|play\(\)|user activation/i.test(e?.message || '');
        // Autoplay refusal is NOT a stream failure — the ad-free audio is
        // loaded and one tap will start it. NEVER fall back to the ad embed.
        if (blocked && el.src && el.src !== SILENCE) {
          setStage(''); setLoading(false); setPlaying(false);
          setErr('Ready — tap play to start');
          resolve('lyrics', lyricsPool, { title: t.title || '', artist: t.artist || '' }, { ttl: 864e5 })
            .then((r2) => setLyrics(r2.data)).catch(() => setLyrics(null));
          return;
        }
        // A cached link can expire (the CDN signs them). Retry once with a
        // forced re-resolve. Note this only catches a failure that surfaces
        // through play(); a link that 404s AFTER play() resolves is handled by
        // the element's onError, which does the same thing.
        if (cached) {
          // Mute the element's onError for the duration: swapping the src
          // makes it fire, and it would print "Stream failed" over a recovery
          // that is about to succeed.
          recoveringRef.current = true;
          retriedRef.current = t.id;
          setErr(''); setStage('Link expired — refreshing…');
          try {
            const r = await resolveAudio(t.id, { fresh: true, onProgress: setStage });
            el.removeAttribute('crossorigin');
            el.src = r.audio; el.playbackRate = rate;
            await el.play();
            setPlaying(true); setStage(''); setLoading(false); setErr('');
            return;
          } catch { /* fall through to the honest error */ }
          finally { recoveringRef.current = false; }
        }
        // Everything failed. Say so — do not silently serve ads.
        setStage(''); setLoading(false); setPlaying(false);
        el.pause(); el.removeAttribute('src'); el.load();
        setErr('Could not get an ad-free stream right now. Tap retry.');
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

  /** Retry the current track from scratch, ignoring any cached (expired) link. */
  const retry = useCallback(() => {
    if (!track) return;
    if (track.id) forgetAudio(track.id);
    setErr('');
    play(track, queue.length ? queue : null);
  }, [track, queue, play]);

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
    play, toggle, step, seek, retry, setShuffle, setRepeat, setFull, setSleep, applyPreset,
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
        ref={audio} preload="none"
        onTimeUpdate={(e) => { setPos(e.target.currentTime); setDur(e.target.duration || 0); }}
        onEnded={() => { if (repeat === 'one') { audio.current.currentTime = 0; audio.current.play(); } else step(1); }}
        onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)}
        onError={() => {
          /* The CDN signs its links and they can expire while still in our
             cache, so a track that played fine an hour ago comes back 404.
             play() has already resolved by then, so the earlier try/catch
             never sees it — the element fires `error` instead and the old
             code just printed "Stream failed". Re-resolve once, silently. */
          const t = track;
          if (!t) return;
          if (!t.id) { setErr('Stream failed — tap retry'); return; }
          // `error` fires more than once while a fresh src is being swapped
          // in — the element reports the failed load, then reports again as
          // the new source attaches. Announcing a failure during a recovery
          // that is about to succeed made a working retry look broken, so the
          // message is only shown once the recovery has actually given up.
          if (recoveringRef.current) return;
          if (retriedRef.current === t.id) {
            setErr('Stream failed — tap retry');
            return;
          }
          recoveringRef.current = true;
          retriedRef.current = t.id;
          forgetAudio(t.id);
          setStage('Link expired — refreshing…');
          // Clear any stale error text: the recovery is in flight, so showing
          // "Stream failed" here made a successful retry look broken.
          setErr('');
          resolveAudio(t.id, { fresh: true })
            .then((r) => {
              const el = audio.current;
              if (!el || track?.id !== t.id) return;
              el.src = r.audio;
              el.playbackRate = rate;
              return el.play();
            })
            .then(() => { setStage(''); setErr(''); setPlaying(true); })
            .catch(() => { setStage(''); setErr('Stream failed — tap retry'); })
            .finally(() => { recoveringRef.current = false; });
        }}
      />
      {children}
    </Ctx.Provider>
  );
}
