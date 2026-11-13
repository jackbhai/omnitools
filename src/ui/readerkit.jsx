import React, { useEffect, useState } from 'react';
import { getSettings, setSetting, onSettings } from '../core/settings';

/* ---------------------------------------------------------- positions
   Every long reader (Gita, Quran, Bible, Gurbani, Aarti & Mantra,
   Novels, Manga) remembers where it was left — per tool, on this
   device only. Each save also refreshes one shared "last read" record
   so the home shelf can offer a Continue card without knowing any
   reader's internals. */
const posKey = (tool) => `omni:read:${tool}`;
const LAST_KEY = 'omni:read:last';

export function readPos(tool) {
  try { return JSON.parse(localStorage.getItem(posKey(tool)) || 'null'); }
  catch { return null; }
}

export function savePos(tool, pos, label) {
  try {
    localStorage.setItem(posKey(tool), JSON.stringify({ ...pos, at: Date.now() }));
    if (label) localStorage.setItem(LAST_KEY, JSON.stringify({ tool, label, at: Date.now() }));
  } catch { /* storage off/full — reading simply won't resume */ }
}

export function lastRead() {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); }
  catch { return null; }
}

/* ---------------------------------------------------------- settings
   One subscription shape for the three reading preferences, so every
   reader and the Settings page always agree. */
export function useSetting(key, fallback) {
  const [v, setV] = useState(() => {
    const s = getSettings();
    return s[key] === undefined ? fallback : s[key];
  });
  useEffect(() => onSettings((s) => {
    if (s[key] !== undefined) setV(s[key]);
  }), [key]);
  return v;
}

export const useTextScale = () => useSetting('textSize', 1);
export const useReaderPaper = () => useSetting('readerPaper', false);
export const useLowData = () => useSetting('lowData', false);

/** True when save-data is on — the user's own switch, or the device
    asking every site to save data on its behalf. */
export function lowDataOn() {
  try {
    return !!getSettings().lowData || !!navigator.connection?.saveData;
  } catch { return false; }
}

/* ---------------------------------------------------------- controls
   A− / A+ step the one shared text size; the page button toggles the
   paper surface. Both write through core/settings, so a change made
   inside one reader is the change every reader (and Settings) sees. */
export function TextSizeCtl() {
  const scale = useTextScale();
  const paper = useReaderPaper();
  const step = (d) => {
    const next = Math.min(1.35, Math.max(0.85, Math.round((scale + d) * 100) / 100));
    setSetting('textSize', next);
  };
  return (
    <span className="txtctl">
      <button className="cat" onClick={() => step(-0.05)} aria-label="Smaller text" title="Smaller text">A−</button>
      <span className="pct">{Math.round(scale * 100)}%</span>
      <button className="cat" onClick={() => step(0.05)} aria-label="Bigger text" title="Bigger text">A+</button>
      <button className={`cat ${paper ? 'on' : ''}`} aria-pressed={paper}
        onClick={() => setSetting('readerPaper', !paper)}
        title="Paper reading surface — warm light page inside the readers">
        Paper</button>
    </span>
  );
}

/** Class for a reader's outermost wrapper: applies the paper surface. */
export const readerCls = (paper) => (paper ? 'reader-paper' : undefined);
