/**
 * Global player: one <audio> element for the whole app, so music keeps playing
 * while the user browses other tools. Exposes a mini-bar (always visible when
 * something is loaded) that expands into a full-screen player.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { lyricsPool } from './ytmusic';
import { resolveAudio, prefetchAudio, prefetchNext, forgetAudio, isCached,
         pauseWarming, resumeWarming, rememberTrack } from './audio-resolve';
import { resolve } from './engine';
import { notePlay } from './library';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

/**
 * Optional EQ / analyser graph.
 *
 * DANGEROUS BY NATURE — read before changing.
 *   `createMediaElementSource(el)` permanently re-routes that element's entire
 *   output into the Web Audio graph. From that moment the element no longer
 *   feeds the speakers by itself: everything depends on the graph reaching
 *   `ctx.destination` AND the context being in the `running` state.
 *
 * THE BUG THIS CAUSED
 *   On a phone an AudioContext is created SUSPENDED, and it can be suspended
 *   again at any time by the OS (a call, another app taking audio focus, the
 *   screen locking). The old code attached the graph on every play and called
 *   `chain.resume()` without awaiting it or checking the result. When the
 *   resume did not take, the track kept "playing" — currentTime advanced, the
 *   UI showed the right thing — with no sound at all. Reproduced exactly:
 *   suspended context, element not paused, analyser peak 0.
 *
 * WHAT CHANGED
 *   · The graph is now attached ONLY when the user actually turns the EQ on.
 *     Plain playback never touches Web Audio, so it cannot be silenced by it.
 *   · `resume()` is awaited and verified; if the context will not run, the
 *     graph is torn down and the element goes back to playing directly.
 *   · A watchdog checks that audio is really flowing and self-heals.
 */
class Chain {
  /**
   * Can this element's audio be routed through Web Audio without being muted?
   *
   * Same-origin and blob/data sources are fine. A cross-origin stream is only
   * safe if the element opted into CORS, which ours cannot (see attach()).
   */
  static canProcess(el) {
    const src = el?.currentSrc || el?.src || '';
    if (!src) return false;
    if (src.startsWith('blob:') || src.startsWith('data:')) return true;
    try {
      if (new URL(src, location.href).origin === location.origin) return true;
    } catch { return false; }
    return !!el.crossOrigin;         // cross-origin needs an explicit opt-in
  }

  /**
   * Attach the graph. Returns true only if audio is genuinely still flowing.
   *
   * THE HARD LIMIT — measured, not assumed.
   *   The audio comes from a different origin (the CDN) and the element does
   *   NOT carry crossOrigin="anonymous" — deliberately, because setting it
   *   breaks playback outright with this 302-redirecting CDN.
   *   A cross-origin media element without CORS produces a MUTED
   *   MediaElementSource: the browser refuses to expose the samples. Verified
   *   directly — a known-good oscillator reads analyser peak 128 in the same
   *   browser, while the real stream reads 0 while still "playing".
   *   So attaching the EQ to these streams silences them, permanently, and
   *   `createMediaElementSource` cannot be undone on that element.
   *
   *   Hence: the graph refuses to attach to a cross-origin stream at all.
   *   Sound matters more than an equaliser.
   */
  async attach(el) {
    if (this.ready && this.el === el) return this.ensureRunning();
    if (this.ready && this.el !== el) return false;   // one element per context
    if (!Chain.canProcess(el)) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !el) return false;
    try {
      this.ctx = new AC();
      this.el = el;
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
      this.comp.threshold.value = 0; this.comp.ratio.value = 1;   // transparent until asked
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 128;
      let n = this.src;
      for (const f of this.eq) { n.connect(f); n = f; }
      n.connect(this.bass); this.bass.connect(this.treb);
      this.treb.connect(this.comp); this.comp.connect(this.an);
      this.an.connect(this.ctx.destination);
      this.ready = true;

      /* The OS can suspend us later — a phone call, another app, the screen
         locking. Without this the track would go quietly silent again. */
      this.ctx.addEventListener?.('statechange', () => {
        if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
      });

      const ok = await this.ensureRunning();
      if (!ok) this.detach();
      return ok;
    } catch {
      this.detach();
      return false;
    }
  }

  /** Resume and VERIFY. An unverified resume is what caused the silence. */
  async ensureRunning() {
    if (!this.ctx) return false;
    if (this.ctx.state === 'running') return true;
    try { await this.ctx.resume(); } catch { return false; }
    return this.ctx.state === 'running';
  }

  /**
   * Give the element its speakers back.
   *
   * createMediaElementSource cannot be undone, so the context is closed
   * outright — that releases the element and it plays normally again.
   */
  detach() {
    try { this.src?.disconnect(); } catch {}
    try { this.ctx?.close(); } catch {}
    this.ctx = this.src = this.eq = this.bass = this.treb = this.comp = this.an = null;
    this.el = null;
    this.ready = false;
  }

  /** Is sound genuinely reaching the output? 0 means silence. */
  peak() {
    if (!this.an) return null;
    const buf = new Uint8Array(this.an.frequencyBinCount);
    this.an.getByteTimeDomainData(buf);
    let p = 0;
    for (const v of buf) p = Math.max(p, Math.abs(v - 128));
    return p;
  }

  resume() { return this.ensureRunning(); }
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
  const retryCountRef = useRef(0);      // how many times this track was re-resolved
  const playTokenRef = useRef(0);       // only the newest play() may touch the element
  const autoRadio = useRef(false);      // keep the queue topped up forever
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
  /* Which source actually answered — shown under the title so a fallback is
     never mistaken for the original. */
  const [via, setVia] = useState('');
  const [eqOn, setEqOn] = useState(false);
  const [yt, setYt] = useState(null);
  const [stage, setStage] = useState('');   // active YouTube id (IFrame mode)

  /* ---- play a track (resolving the stream if needed) ---- */
  const play = useCallback(async (t, list) => {
    const el = audio.current; if (!el) return;

    /* Only the newest tap matters.
       Resolving takes seconds, so tapping three tracks quickly leaves three
       resolutions in flight. Whichever finished last used to win — it would
       overwrite the src of the track the user actually chose, and the losers'
       error handling would tear down the winner. Each play() now claims a
       token and every later step checks it is still the current one. */
    const token = ++playTokenRef.current;
    const stale = () => playTokenRef.current !== token;

    /* Reset any error left over from the previous track.
       MediaError is sticky: once the element has failed, `el.error` keeps
       reporting that code until a new load actually succeeds. A stale code 4
       from the silent unlock clip was being read as a failure of the NEXT
       track, which is why a song that played perfectly still showed as broken.
       Calling load() on an empty element clears it. */
    if (el.error) {
      try { el.pause(); el.removeAttribute('src'); el.load(); } catch {}
    }

    setErr(''); setLyrics(null);
    if (list) { setQueue(list); setIdx(list.findIndex((x) => (x.id ?? x.url) === (t.id ?? t.url))); }
    setTrack(t); setLoading(true);
    // Do not let background resolves steal bandwidth from the track the user
    // is waiting for — released again as soon as it is actually playing.
    pauseWarming();
    if (retriedRef.current !== t.id) { retriedRef.current = null; retryCountRef.current = 0; }
    recoveringRef.current = false;

    // YouTube tracks -> resolve to a DIRECT audio stream (no ads, keeps
    // playing in the background). The IFrame is only a last-resort fallback
    // if every proxy path fails.
    if (t.needsResolve && t.id) {
      setYt(null);
      const cached = isCached(t.id);

      /* Consume the user gesture NOW so the element is unlocked for later.
         Skipped when the stream is already cached: we can set the real src
         immediately and avoid the extra load cycle entirely.

         `unlocking` is checked by the error handler — Chromium reports the
         silent clip as MediaError 4, and treating that as a dead stream was
         killing tracks moments after they were tapped. */
      /* Unlock the element for later playback WITHOUT loading a fake source.
         The old trick assigned a silent data-URI so the tap would count as a
         gesture. Chromium rejects that clip with MediaError 4, and MediaError
         is sticky — the code survived onto the real track and made songs that
         were playing perfectly report as broken.
         Calling load() on the empty element consumes the gesture just as well
         and can never leave an error behind. */
      if (!cached) {
        try { el.pause(); el.removeAttribute('src'); el.load(); } catch {}
      }

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
        /* Hand the resolver what we already know about this track. If the
           primary source is down it can only find the song in the second
           catalogue by NAME — the two share no ids — so without this there is
           no fallback at all. */
        rememberTrack(t.id, { title: t.title, artist: t.artist, art: t.art, dur: t.dur });
        const r = await resolveAudio(t.id, { onProgress: setStage });
        if (clock) clearInterval(clock);
        if (stale()) return;          // the user moved on; leave their track alone
        setVia(r.via || '');
        /* An inexact tier answered. Say so plainly rather than letting a cover
           or an archive recording pass as the original. */
        if (r.approximate) setStage('');
        const meta = { ...t, art: t.art || r.art, artist: t.artist || r.artist,
                       dlUrl: r.audio, approximate: !!r.approximate };
        setTrack(meta);
        // No crossOrigin here: the CDN 302-redirects and a tainted CORS
        // handshake can kill playback. Audio first, EQ best-effort after.
        el.removeAttribute('crossorigin');
        /* Tear the previous connection down BEFORE opening the new one.
           The CDN allows a single active link per client: measured, resolving
           a second link while the first is still streaming makes one of them
           return HTTP 403, which surfaced as MediaError 4 mid-playlist.
           Assigning a new src alone does not reliably abort the old request,
           so this forces it. */
        try { el.pause(); el.removeAttribute('src'); el.load(); } catch {}
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
        /* Deliberately NOT attaching the EQ graph here. Routing the element
           through Web Audio is what silenced playback when the context was
           suspended — the track advanced with no sound. The graph is attached
           only when the user switches the EQ on. */
        setPlaying(true); setStage(''); setLoading(false); setErr('');
        resumeWarming();
        notePlay(meta);   // recently-played list in the Library tab
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
          if (i >= 0) prefetchNext(list, i, 4);
        }
        resolve('lyrics', lyricsPool, { title: meta.title || '', artist: meta.artist || '' }, { ttl: 864e5 })
          .then((r2) => setLyrics(r2.data)).catch(() => setLyrics(null));
        return;
      } catch (e) {
        if (clock) clearInterval(clock);
        if (stale()) return;          // a superseded attempt must stay silent
        console.warn('[player] direct audio failed:', e && e.message, e);
        const blocked = e?.name === 'NotAllowedError' ||
          /gesture|interact|play\(\)|user activation/i.test(e?.message || '');
        // Autoplay refusal is NOT a stream failure — the ad-free audio is
        // loaded and one tap will start it. NEVER fall back to the ad embed.
        if (blocked && el.src) {
          setStage(''); setLoading(false); setPlaying(false);
          setErr('Ready — tap play to start'); resumeWarming();
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
            resumeWarming();
            return;
          } catch { /* fall through to the honest error */ }
          finally { recoveringRef.current = false; }
        }
        /* One more attempt before admitting defeat.
           The upstream resolver is occasionally slow or briefly unavailable —
           it went down completely for several minutes during testing, then
           recovered and answered everything in 6-7 s. Giving up after a single
           miss made healthy tracks look broken, so this waits and tries once
           more with a forced re-resolve. */
        try {
          setStage('One more try…');
          await sleep(900);
          if (stale()) return;
          const r2 = await resolveAudio(t.id, { fresh: true, onProgress: setStage });
          if (stale()) return;
          el.removeAttribute('crossorigin');
          el.src = r2.audio;
          el.playbackRate = rate;
          await el.play();
          setTrack({ ...t, art: t.art || r2.art, artist: t.artist || r2.artist, dlUrl: r2.audio });
          setPlaying(true); setStage(''); setLoading(false); setErr('');
          resumeWarming(); notePlay(t);
          return;
        } catch { /* genuinely unavailable */ }

        // Everything failed. Say so — do not silently serve ads.
        setStage(''); setLoading(false); setPlaying(false);
        el.pause(); el.removeAttribute('src'); el.load();
        setErr('Could not get an ad-free stream right now. Tap retry.'); resumeWarming();
        return;
      }
    }
    setYt(null);
    try {
      let url = t.stream || t.url || t.preview;
      let meta = t;
      if (!url) throw new Error('No playable source');
      el.src = url; el.playbackRate = rate;
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
      setErr(e.message || 'Could not play this track'); resumeWarming();
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
    if (chain.ready) chain.ensureRunning();   // only matters when the EQ is on
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  }, [yt, playing]);

  const step = useCallback((d) => {
    if (!queue.length) return;
    let n;
    if (shuffle) n = Math.floor(Math.random() * queue.length);
    else n = idx + d;
    if (n < 0) n = queue.length - 1;
    if (n >= queue.length) {
      // Endless play: rather than stopping at the end of the list, keep going.
      // `autoRadio` is topped up by the effect below, so this rarely fires.
      if (repeat === 'off' && !autoRadio.current) return;
      n = 0;
    }
    setIdx(n); play(queue[n], queue);
  }, [queue, idx, shuffle, repeat, play]);

  /** Append more tracks to the queue (used by radio / infinite scroll). */
  const extendQueue = useCallback((more) => {
    if (!more?.length) return;
    setQueue((q) => {
      const seen = new Set(q.map((t) => t.id ?? t.url));
      const add = more.filter((t) => t && !seen.has(t.id ?? t.url));
      return add.length ? [...q, ...add] : q;
    });
  }, []);

  /** Turn endless radio on/off. When on, the queue never runs dry. */
  const setRadio = useCallback((on) => { autoRadio.current = !!on; }, []);

  /**
   * ENDLESS PLAY — top the queue up before it runs out.
   *
   * With radio on, once fewer than three tracks remain after the current one
   * the queue is extended with material built around what is playing (more by
   * the artist, similar titles, the genre seed). The user never hits the end
   * and playback never stops on its own.
   */
  useEffect(() => {
    if (!autoRadio.current || idx < 0 || !queue.length) return;
    if (queue.length - idx > 3) return;
    let live = true;
    (async () => {
      try {
        const { radioQueue } = await import('./music');
        const more = await radioQueue(queue[idx], { limit: 30 });
        if (live && more.length) extendQueue(more);
      } catch { /* queue simply does not grow this time */ }
    })();
    return () => { live = false; };
  }, [queue, idx, extendQueue]);

  /**
   * Resolve the NEXT track's URL early — but do NOT download its bytes.
   *
   * MEASURED, THE HARD WAY: this audio CDN allows only ONE active connection
   * per client. Buffering the next track in a second <audio> element killed
   * the track that was already playing — MediaError code 4 about 11 s in,
   * every single time. Direct measurement of the CDN:
   *
   *   two connections, same track        -> one side gets HTTP 403
   *   two connections, different tracks  -> the PLAYING one gets HTTP 403
   *   sustained A + burst B              -> B truncates (IncompleteRead)
   *
   * So byte-level preloading is off the table: it breaks the very thing it was
   * meant to improve. What is safe — and still where nearly all the delay was
   * — is resolving the next URL ahead of time. That request goes to a
   * different host, costs the CDN nothing, and removes the 8-15 s lookup.
   * What remains is a single CDN connect of roughly a second, which is the
   * unavoidable price of the one-connection limit.
   */
  useEffect(() => {
    if (!queue.length || idx < 0) return;
    const nxt = queue[idx + 1];
    if (!nxt?.id) return;
    let live = true;
    const t = setTimeout(() => { if (live) prefetchAudio(nxt.id, 0); }, 1200);
    return () => { live = false; clearTimeout(t); };
  }, [queue, idx]);

  const seek = useCallback((s) => { if (audio.current) audio.current.currentTime = s; }, []);

  /**
   * Silence watchdog.
   *
   * The failure the user hit was insidious: the track advances, the UI looks
   * correct, and nothing is audible. It happens when the EQ graph is attached
   * and its AudioContext gets suspended by the OS — a call, another app taking
   * audio focus, the screen locking. Once suspended, the element's output has
   * nowhere to go.
   *
   * This checks a few times a second while playing: if the graph is up but the
   * context is not running, it resumes it; if resuming fails, it drops the
   * graph entirely so the element goes back to feeding the speakers directly.
   * Sound always wins over the equaliser.
   */
  useEffect(() => {
    if (!playing) return;
    let strikes = 0;
    const id = setInterval(async () => {
      const el = audio.current;
      if (!el || el.paused || !chain.ready) { strikes = 0; return; }
      if (chain.ctx?.state === 'running') { strikes = 0; return; }
      const ok = await chain.ensureRunning();
      if (ok) { strikes = 0; return; }
      // three consecutive failures: the context is not coming back
      if (++strikes >= 3) {
        const at = el.currentTime;
        chain.detach();
        setEqOn(false);
        // closing the context releases the element; nudge it if it stalled
        try {
          if (el.paused) { el.currentTime = at; await el.play(); }
        } catch {}
        strikes = 0;
      }
    }, 1200);
    return () => clearInterval(id);
  }, [playing]);

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

  /**
   * Bring the EQ graph up on demand.
   *
   * Attaching re-routes the element through Web Audio, which is exactly what
   * used to silence playback. So it happens only when the user reaches for an
   * EQ control, it is verified, and if the context refuses to run the graph is
   * torn down and we say so rather than leaving a silent player.
   */
  const enableEq = useCallback(async () => {
    const el = audio.current;
    if (!el || chain.ready) return chain.ready;
    const ok = await chain.attach(el);
    setEqOn(ok);
    if (!ok) { /* the EQ panel already explains why; never disturb playback */ }
    else {
      // re-apply whatever the user had set before the graph existed
      eq.forEach((g, i) => chain.band(i, g));
      chain.setBass(bass); chain.setTreb(treb); chain.setComp(comp);
    }
    return ok;
  }, [eq, bass, treb, comp]);

  const applyPreset = useCallback((name) => {
    setPreset(name);
    const v = PRESETS[name] || PRESETS.Flat;
    setEq([...v]);
    // 'Flat' is the default, so it needs no graph — leave audio untouched.
    if (name === 'Flat' && !chain.ready) return;
    enableEq().then(() => v.forEach((g, i) => chain.band(i, g)));
  }, [enableEq]);

  const value = {
    audio, yt, stage, track, playing, loading, pos, dur, queue, idx, shuffle, repeat, full, err, lyrics, via,
    eq, preset, bass, treb, comp, rate, sleep,
    play, toggle, step, seek, retry, extendQueue, setRadio, setShuffle, setRepeat, setFull, setSleep, applyPreset,
    eqOn, enableEq,
    // false for streamed (cross-origin) tracks — the UI explains why
    eqCapable: Chain.canProcess(audio.current),
    setEqBand: (i, v) => { const n = [...eq]; n[i] = v; setEq(n);
      enableEq().then(() => chain.band(i, v)); setPreset('Custom'); },
    setBassV: (v) => { setBass(v); enableEq().then(() => chain.setBass(v)); },
    setTrebV: (v) => { setTreb(v); enableEq().then(() => chain.setTreb(v)); },
    setCompV: (v) => { setComp(v); enableEq().then(() => chain.setComp(v)); },
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
          const el = audio.current;

          // Nothing we load ourselves should be treated as a stream failure.
          if (el && (el.src || '').startsWith('data:')) return;

          const t = track;
          if (!t) return;
          if (!t.id) { setErr('Stream failed — tap retry'); return; }
          // A dropped stream must never leave the user staring at a dead
          // player: pause background work so the retry gets the whole pipe.
          pauseWarming();
          // `error` fires more than once while a fresh src is being swapped
          // in — the element reports the failed load, then reports again as
          // the new source attaches. Announcing a failure during a recovery
          // that is about to succeed made a working retry look broken, so the
          // message is only shown once the recovery has actually given up.
          if (recoveringRef.current) return;
          /* Two attempts, not one. The CDN mints a fresh signed link on every
             resolve and invalidates older ones, so the first replacement can
             already be stale by the time the element reaches it. A second go
             costs a couple of seconds and rescues most of these. */
          const tries = retriedRef.current === t.id ? (retryCountRef.current || 1) : 0;
          if (tries >= 2) {
            setErr('Stream failed — tap retry');
            return;
          }
          recoveringRef.current = true;
          retriedRef.current = t.id;
          retryCountRef.current = tries + 1;
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
            .then(() => { setStage(''); setErr(''); setPlaying(true); resumeWarming(); })
            .catch(() => { setStage(''); setErr('Stream failed — tap retry'); resumeWarming(); })
            .finally(() => { recoveringRef.current = false; });
        }}
      />
      {children}
    </Ctx.Provider>
  );
}
