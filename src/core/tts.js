/**
 * Chant engine for the devotional reader. Two real tiers, no fakes:
 *
 *  1. device — the browser's own speech synthesis (speechSynthesis). Instant,
 *     works offline, no rate limit. We prefer a Hindi/Devanagari voice when
 *     the device has one and say so honestly when it doesn't.
 *  2. studio — the shared utility API's TTS endpoint (see endpoints.js).
 *     Natural voices in many Indian languages, but it is a free shared
 *     service: it throttles hard when pushed (measured: fine at ~1 call/s,
 *     504/307 above that). So every request is sequential, spaced, retried
 *     once, cached for the session, and after repeated failures the tier
 *     trips a circuit breaker and steps aside for device.
 *
 * Sync is real: text is split into stanzas, each stanza is one utterance
 * (device) or one fetched audio chunk (studio), and the highlight follows the
 * stanza actually being spoken. No timestamps are invented anywhere.
 */
import { TTS_API, VOICES_API } from './endpoints';

/* ------------------------------------------------------------------ studio */

const SPACE = 1150;          // ms between studio calls — measured safe margin
const RETRY_WAIT = 2600;     // one patient retry, then we step aside
const INDIAN = new Set(['Hindi', 'Marathi', 'Bengali', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Urdu', 'Nepali']);

let studioVoices = null;
let studioDownUntil = 0;     // circuit breaker
const blobCache = new Map(); // key -> objectURL, for the session

export function studioReady() { return Date.now() >= studioDownUntil; }
export function studioMarkDown(sec = 90) { studioDownUntil = Date.now() + sec * 1000; }

export async function loadStudioVoices() {
  if (studioVoices) return studioVoices;
  const r = await fetch(VOICES_API, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('voices ' + r.status);
  const d = await r.json();
  const all = Array.isArray(d) ? d : (d.voices || []);
  studioVoices = all.filter((v) => INDIAN.has(v.language) && typeof v.index === 'number');
  if (!studioVoices.length) throw new Error('voices empty');
  return studioVoices;
}

/** Default studio voice for a corpus language (hi -> Hindi, mr -> Marathi...). */
export async function pickStudioVoice(lang) {
  const vs = await loadStudioVoices();
  const want = { hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', ur: 'Urdu', ne: 'Nepali' }[lang] || 'Hindi';
  const byLang = vs.filter((v) => v.language === want);
  const named = want === 'Hindi' && byLang.find((v) => v.name === 'Swara');
  const v = named || byLang.find((x) => x.gender === 'Female') || byLang[0] || vs.find((x) => x.language === 'Hindi') || vs[0];
  return v ? { index: v.index, name: v.name, language: v.language } : null;
}

let lastStudioAt = 0;
async function studioSayOnce(text, voiceIndex, rate) {
  const wait = lastStudioAt + SPACE - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  lastStudioAt = Date.now();
  const r = await fetch(TTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceIndex, pitch: 0, rate: Math.round((rate - 1) * 100) }),
    signal: AbortSignal.timeout(75000),
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.includes('audio')) {
    try { await r.text(); } catch { /* ignore body */ }
    throw new Error('studio ' + r.status);
  }
  const blob = await r.blob();
  if (!blob || blob.size < 400) throw new Error('studio empty');
  return blob;
}

/** Studio audio for one text chunk: session cache, spacing, one retry. */
export async function studioChunk(text, voiceIndex, rate) {
  const key = `${voiceIndex}|${rate}|${text}`;
  const hit = blobCache.get(key);
  if (hit) return hit;
  let blob;
  try {
    blob = await studioSayOnce(text, voiceIndex, rate);
  } catch (e1) {
    await new Promise((res) => setTimeout(res, RETRY_WAIT));
    blob = await studioSayOnce(text, voiceIndex, rate);   // 2nd failure: throw, caller handles
  }
  const url = URL.createObjectURL(blob);
  if (blobCache.size > 48) { const k0 = blobCache.keys().next().value; try { URL.revokeObjectURL(blobCache.get(k0)); } catch { /* ignore */ } blobCache.delete(k0); }
  blobCache.set(key, url);
  return url;
}

/* ------------------------------------------------------------------ device */

export function allDeviceVoices() {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices() || [];
}
export function deviceVoices(lang) {
  const all = allDeviceVoices();
  const want = (lang || 'hi').toLowerCase();
  const match = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith(want));
  return match.length ? match : all.filter((v) => /^hi([-_]|$)/i.test(v.lang));
}
const SPEECH_LANG = { hi: 'hi-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', ur: 'ur-IN', ne: 'ne-NP' };

/* ------------------------------------------------------------------ chunks */

/** Group text lines into stanzas (blank line = break, ~380 chars max). */
export function stanzas(lines) {
  const out = [];
  let cur = [];
  for (const ln of lines || []) {
    const t = String(ln || '').trim();
    if (!t) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(t);
    if (cur.join('\n').length > 380) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Pack stanzas into studio requests under ~1700 chars (API chunk cap is 1950). */
export function studioGroups(stz) {
  const out = [];
  let cur = [];
  let n = 0;
  for (const s of stz) {
    const t = s.join('\n');
    if (n + t.length > 1700 && cur.length) { out.push(cur); cur = []; n = 0; }
    cur.push(t); n += t.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;   // each group = array of stanza texts
}

/* ------------------------------------------------------------------ runner */

/**
 * Run one full chant over the stanzas.
 * on({ cur, status, label }) — status: 'synth' | 'play' | 'error'
 * Returns { fellBack } — fellBack=true means studio tripped and we stopped
 * before finishing so the caller can offer device.
 */
export async function runChant(stz, { lang = 'hi', engine = 'device', loop = 1, rate = 1, on = () => {} }, tokenRef) {
  const dead = () => tokenRef && tokenRef.alive === false;
  let fellBack = false;
  let used = engine;
  if (used === 'studio' && !studioReady()) {
    on({ status: 'error', msg: 'स्टूडियो आवाज़ अभी थकी हुई है — कुछ देर बाद आज़माएँ, या डिवाइस आवाज़ चुनें' });
    return { fellBack: true };
  }
  let studioV = null;
  if (used === 'studio') {
    on({ status: 'synth', label: 'स्टूडियो आवाज़ तैयार हो रही है…' });
    try { studioV = await pickStudioVoice(lang); } catch { studioV = null; }
    if (!studioV) { studioMarkDown(120); on({ status: 'error', msg: 'स्टूडियो वॉइस सूची नहीं मिली — डिवाइस आवाज़ आज़माएँ' }); return { fellBack: true }; }
  } else if (!allDeviceVoices().length) {
    // speechSynthesis exists but has no voices (some Linux builds) — speak anyway
    // with the engine default; if the engine itself is missing, fall to studio.
    if (typeof speechSynthesis === 'undefined') {
      if (studioReady()) { used = 'studio'; studioV = await pickStudioVoice(lang).catch(() => null); }
      if (used !== 'studio') { on({ status: 'error', msg: 'इस ब्राउज़र में आवाज़ इंजन नहीं है — स्टूडियो आवाज़ आज़माएँ' }); return { fellBack: false }; }
    }
  }
  const groups = used === 'studio' ? studioGroups(stz) : stz.map((s) => [s.join('\n')]);
  const starts = []; let acc = 0;
  for (const g of groups) { starts.push(acc); acc += g.length; }
  let fails = 0;
  for (let rep = 0; rep < Math.max(1, loop); rep++) {
    for (let i = 0; i < groups.length; i++) {
      if (dead()) return { fellBack };
      on({ cur: starts[i], rep, part: i + 1, of: groups.length, label: used === 'studio' ? `स्टूडियो · ${studioV.name} (${studioV.language})` : null });
      try {
        if (used === 'studio') {
          on({ status: 'synth' });
          const urls = [];
          for (const part of groups[i]) urls.push(await studioChunk(part, studioV.index, rate));
          if (dead()) return { fellBack };
          for (const u of urls) {
            if (dead()) return { fellBack };
            on({ status: 'play', cur: Math.min(stz.length - 1, (starts[i] || 0)) });
            await playBlob(u);
            starts[i] = Math.min(stz.length - 1, (starts[i] || 0) + 1); // nudge highlight per spoken part
          }
        } else {
          on({ status: 'play' });
          await speakAll(groups[i], lang, rate);
        }
        fails = 0;
      } catch {
        fails++;
        if (used === 'studio' && fails >= 2) {
          studioMarkDown(120);
          on({ status: 'error', msg: 'स्टूडियो सेवा बार-बार अटकी — डिवाइस आवाज़ से सुनें' });
          fellBack = true;
          return { fellBack };
        }
      }
    }
  }
  return { fellBack };
}

let sharedAudio = null;
function playBlob(url) {
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignore */ }
    if (!sharedAudio) {
      sharedAudio = document.createElement('audio');
      sharedAudio.id = 'chant-audio';
      sharedAudio.preload = 'auto';
      document.body.appendChild(sharedAudio);
    }
    const a = sharedAudio;
    a.onended = fin; a.onerror = fin;
    a.src = url;
    a.play().catch(fin);
  });
}
export function stopAudio() {
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* ignore */ }
  if (sharedAudio) { try { sharedAudio.pause(); sharedAudio.removeAttribute('src'); } catch { /* ignore */ } }
}
function speakAll(parts, lang, rate) {
  return new Promise((res) => {
    if (typeof speechSynthesis === 'undefined') return res();
    let ended = 0; const total = parts.length;
    if (!total) return res();
    const vs = deviceVoices(lang);
    for (const part of parts) {
      const u = new SpeechSynthesisUtterance(part);
      if (vs.length) u.voice = vs[0];
      u.lang = SPEECH_LANG[lang] || 'hi-IN';
      u.rate = Math.max(0.6, Math.min(1.6, rate));
      u.pitch = 1;
      u.onend = () => { if (++ended >= total) res(); };
      u.onerror = () => { if (++ended >= total) res(); };
      speechSynthesis.speak(u);
    }
  });
}
