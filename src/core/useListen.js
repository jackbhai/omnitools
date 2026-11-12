/* Shared read-aloud hook for every reading surface (Gita, Gurbani, Bible,
 * Rashifal, and any list of text items). One behaviour everywhere:
 * play-all, tap-an-item to speak from that item, current item highlighted
 * by the caller via `active`, stop on unmount/navigation, honest errors.
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

const DEVICE_LANG = { hi: 'hi-IN', ur: 'ur-PK', en: 'en-IN', pa: 'pa-IN', sa: 'hi-IN' };

export function useListen() {
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState('');
  const tokRef = useRef({ alive: false });
  const audioRef = useRef(null);

  const stop = useCallback(() => {
    tokRef.current.alive = false;
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setPlaying(false);
    setActive(-1);
  }, []);

  useEffect(() => () => {
    tokRef.current.alive = false;
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  /* items: array of string, or { s, d } (s = studio text, d = device text) */
  const playFrom = useCallback(async (items, start = 0, { lang = 'hi' } = {}) => {
    if (!items || !items.length) return;
    stop();
    setMsg('');
    const tok = { alive: true };
    tokRef.current = tok;
    const dead = () => !tok.alive;
    setPlaying(true);
    const el = audioRef.current || (audioRef.current = new Audio());
    const studioText = (it) => (typeof it === 'string' ? it : (it.s || it.d || ''));
    const deviceText = (it) => (typeof it === 'string' ? it : (it.d || it.s || ''));

    const deviceFrom = (idx) => {
      if (dead()) return;
      if (idx >= items.length) { stop(); return; }
      const text = deviceText(items[idx]);
      if (!text) { deviceFrom(idx + 1); return; }
      setActive(idx);
      const chunks = chunkText(text);
      let ci = 0;
      const next = () => {
        if (dead()) return;
        if (ci >= chunks.length) { deviceFrom(idx + 1); return; }
        const u = new SpeechSynthesisUtterance(chunks[ci++]);
        u.lang = DEVICE_LANG[lang] || 'en-IN';
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
      const text = studioText(items[idx]);
      if (!text) { step(idx + 1); return; }
      setActive(idx);
      try {
        for (const chunk of chunkText(text)) {
          if (dead()) return;
          const url = await studioChunk(chunk, voice.index, 1);
          if (dead()) return;
          await new Promise((res) => { el.src = url; el.onended = res; el.onerror = res; el.play().catch(res); });
        }
      } catch {
        if (!dead()) { setMsg('Studio voice interrupted — switching to device voice.'); deviceFrom(idx); }
        return;
      }
      step(idx + 1);
    };
    step(start);
  }, [stop]);

  return { active, playing, msg, setMsg, playFrom, stop };
}
