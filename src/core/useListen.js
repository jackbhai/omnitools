/* Shared read-aloud hook for every reading surface (Gita, Gurbani, Bible,
 * Rashifal, Quran translations). One behaviour everywhere: play-all,
 * tap-an-item to speak from that item, tap-a-WORD to speak from that word,
 * current item + current word highlighted by the caller, stop on
 * unmount/navigation, honest errors.
 *
 * Word sync is an ESTIMATE by design: for studio MP3 chunks the real chunk
 * duration is known, and position inside the chunk is distributed across
 * words weighted by word length; for the device voice, boundary events
 * are used when the device offers them. Never frame-exact — callers must
 * not claim otherwise.
 *
 * Voices ride the app's existing studio TTS module (freeapi voices):
 * Hindi (Swara) + Urdu (Gul) via pickStudioVoice, English via the same
 * catalogue — all curl-verified audio/mpeg. The catalogue has NO Punjabi
 * voice (verified), so lang 'pa' uses a device Punjabi voice when the
 * device offers one, else the Hindi studio voice reading the Devanagari
 * transliteration. Any studio failure falls back to the device voice. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickStudioVoice, studioChunk } from './tts';
import { VOICES_API } from './endpoints';

let extraVoices = null;
async function catalogueVoice(languageName) {
  if (!extraVoices) {
    const r = await fetch(VOICES_API, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('voices ' + r.status);
    const d = await r.json();
    extraVoices = Array.isArray(d) ? d : (d.voices || []);
  }
  const byLang = extraVoices.filter((v) => v.language === languageName && typeof v.index === 'number');
  const v = byLang.find((x) => x.country === 'India' && x.gender === 'Female') || byLang.find((x) => x.country === 'India') || byLang[0];
  return v ? { index: v.index, name: v.name } : null;
}

export function chunkText(text, max = 420) {
  const parts = String(text || '').split(/(?<=[।.!?؟؛])\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).length > max && cur) { out.push(cur); cur = p; }
    else cur = cur ? cur + ' ' + p : p;
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out.length ? out : [String(text || '')];
}

/* char offset inside `text` reached at fraction `frac` of its playback,
 * distributing time across words weighted by word length (+1 for space). */
export function charAtFraction(text, frac) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  let target = frac * total;
  let pos = 0;
  const src = String(text || '');
  for (const w of words) {
    const at = src.indexOf(w, pos);
    if (target <= w.length + 1) return at < 0 ? pos : at;
    target -= w.length + 1;
    pos = (at < 0 ? pos : at) + w.length;
  }
  return src.length;
}

const DEVICE_LANG = { hi: 'hi-IN', ur: 'ur-PK', en: 'en-IN', pa: 'pa-IN', sa: 'hi-IN' };

export function useListen() {
  const [active, setActive] = useState(-1);
  const [wordAt, setWordAt] = useState(0); // char offset of the spoken word inside the active item
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState('');
  const tokRef = useRef({ alive: false });
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const stop = useCallback(() => {
    tokRef.current.alive = false;
    clearTimer();
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setPlaying(false);
    setActive(-1);
    setWordAt(0);
  }, []);

  useEffect(() => () => {
    tokRef.current.alive = false;
    clearTimer();
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  /* items: array of string, or { s, d } (s = studio text, d = device text).
   * opts.charAt: start this many chars into the FIRST item (word tap). */
  const playFrom = useCallback(async (items, start = 0, { lang = 'hi', charAt = 0 } = {}) => {
    if (!items || !items.length) return;
    stop();
    setMsg('');
    const tok = { alive: true };
    tokRef.current = tok;
    const dead = () => !tok.alive;
    setPlaying(true);
    const el = audioRef.current || (audioRef.current = new Audio());
    const studioText = (it, idx) => {
      const t = typeof it === 'string' ? it : (it.s || it.d || '');
      return idx === start && charAt > 0 ? t.slice(charAt) : t;
    };
    const deviceText = (it, idx) => {
      const t = typeof it === 'string' ? it : (it.d || it.s || '');
      return idx === start && charAt > 0 ? t.slice(charAt) : t;
    };
    const baseAt = (idx) => (idx === start ? charAt : 0);

    const deviceFrom = (idx) => {
      if (dead()) return;
      if (idx >= items.length) { stop(); return; }
      const text = deviceText(items[idx], idx);
      if (!text) { deviceFrom(idx + 1); return; }
      setActive(idx);
      setWordAt(baseAt(idx));
      const chunks = chunkText(text);
      let ci = 0;
      let chunkStart = 0;
      const next = () => {
        if (dead()) return;
        if (ci >= chunks.length) { deviceFrom(idx + 1); return; }
        const chunk = chunks[ci];
        const myStart = chunkStart;
        chunkStart += chunk.length + 1;
        ci += 1;
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = DEVICE_LANG[lang] || 'en-IN';
        u.onboundary = (ev) => { if (!dead() && typeof ev.charIndex === 'number') setWordAt(baseAt(idx) + myStart + ev.charIndex); };
        u.onend = next;
        u.onerror = next;
        window.speechSynthesis.speak(u);
      };
      next();
    };

    let voice = null;
    try {
      if (lang === 'hi' || lang === 'ur' || lang === 'sa') voice = await pickStudioVoice(lang === 'sa' ? 'hi' : lang);
      else if (lang === 'en') voice = await catalogueVoice('English');
      else if (lang === 'pa') {
        const hasPa = (window.speechSynthesis?.getVoices() || []).some((v) => (v.lang || '').toLowerCase().startsWith('pa'));
        if (hasPa) { deviceFrom(start); return; }
        voice = await pickStudioVoice('hi'); // Devanagari transliteration read by the Hindi voice
      }
    } catch { voice = null; }
    if (dead()) return;
    if (!voice) { deviceFrom(start); return; }

    const step = async (idx) => {
      if (dead()) return;
      if (idx >= items.length) { stop(); return; }
      const text = studioText(items[idx], idx);
      if (!text) { step(idx + 1); return; }
      setActive(idx);
      setWordAt(baseAt(idx));
      try {
        let itemCharBase = baseAt(idx);
        for (const chunk of chunkText(text)) {
          if (dead()) return;
          const url = await studioChunk(chunk, voice.index, 1);
          if (dead()) return;
          const myBase = itemCharBase;
          itemCharBase += chunk.length + 1;
          await new Promise((res) => {
            el.src = url;
            el.onended = () => { clearTimer(); res(); };
            el.onerror = () => { clearTimer(); res(); };
            el.onloadedmetadata = () => {
              clearTimer();
              timerRef.current = setInterval(() => {
                if (dead() || !el.duration || !isFinite(el.duration)) return;
                setWordAt(myBase + charAtFraction(chunk, Math.min(1, el.currentTime / el.duration)));
              }, 110);
            };
            el.play().catch(res);
          });
        }
      } catch {
        if (!dead()) { setMsg('Studio voice interrupted — switching to device voice.'); deviceFrom(idx); }
        return;
      }
      step(idx + 1);
    };
    step(start);
  }, [stop]);

  return { active, wordAt, playing, msg, setMsg, playFrom, stop, reducedMotion };
}
