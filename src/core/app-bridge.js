/**
 * app-bridge.js — everything that only happens inside the Android app.
 *
 * The native shell injects `window.OmniApp` (see the omnitools-app
 * repo) before any page script runs. On the web the object never
 * exists, APP_MODE stays false, and every consumer below is inert —
 * the web experience is byte-identical with or without this module.
 *
 * Duties:
 *  - flag app-mode on <html> (CSS hides install prompts, restyles nav)
 *  - push today's verse + panchang headline to the Daily widget
 *    (OmniApp.dailyPush), re-pushed when the day rolls over
 *  - haptics passthrough for app-mode interactions
 *  - the app-mode home layout config (omni:app:home): one tiny store
 *    shared by the home's top block, its category grid and the tab
 *    bar, persisted to localStorage on every change.
 */
import { useEffect, useState } from 'react';

export const APP_MODE = typeof window !== 'undefined' && !!window.OmniApp;

/* ------------------------------------------------------------------ daily push */

let lastPushKey = '';

async function pushDaily() {
  const B = typeof window !== 'undefined' ? window.OmniApp : null;
  if (!B || typeof B.dailyPush !== 'function') return;
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateKey === lastPushKey) return;
  try {
    const [{ POOL }, votd, pan] = await Promise.all([
      import('../data/votd-pool.js'),
      import('./votd.js'),
      import('./panchang.js'),
    ]);
    const pick = votd.votdPick(POOL, now);
    const p = await pan.computePanchang({
      y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(),
      lat: 28.6139, lon: 77.209, tzMin: -now.getTimezoneOffset(),
    });
    const verseText = String(pick?.text || '')
      .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' ');
    B.dailyPush(JSON.stringify({
      date: now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      dateKey,
      verseRef: pick?.ref || '',
      verseText: verseText.slice(0, 180),
      tithi: p?.tithi ? `${p.tithi.paksha} ${p.tithi.name}` : '',
      nakshatra: p?.nakshatra?.name || '',
    }));
    lastPushKey = dateKey;
  } catch { /* the widget keeps its last values; never break the page */ }
}

/** Called once from main.jsx. Returns true when running in the app. */
export function initAppBridge() {
  if (!APP_MODE) return false;
  try { document.documentElement.classList.add('app-mode'); } catch { /* ignore */ }
  pushDaily();
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pushDaily();
    });
    setInterval(pushDaily, 15 * 60 * 1000);
  } catch { /* ignore */ }
  return true;
}

/* ------------------------------------------------------------------ haptics / wake */

export function haptic(ms = 12) {
  try { window.OmniApp?.haptic?.(ms); } catch { /* web: no-op */ }
}

export function setKeepAwake(on) {
  try { window.OmniApp?.keepAwake?.(!!on); } catch { /* web: no-op */ }
}

/* ------------------------------------------------------------------ home config
 * omni:app:home — the app-mode home layout. `order`/`hidden` name
 * categories; `tabs` are bottom-bar slots: a tool id, 'search' or
 * 'more'. Anything unknown is dropped on load, so a config written by
 * a newer build can never break an older home. */

export const HOME_CFG_KEY = 'omni:app:home';

export const DEFAULT_HOME_CFG = {
  order: [],
  hidden: [],
  sections: { myday: true, cont: true },
  myTools: [],
  tabs: ['music', 'tv', 'search', 'more'],
};

function loadCfg() {
  try {
    const raw = localStorage.getItem(HOME_CFG_KEY);
    if (!raw) return { ...DEFAULT_HOME_CFG };
    const p = JSON.parse(raw);
    return {
      order: Array.isArray(p.order) ? p.order.filter((x) => typeof x === 'string') : [],
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === 'string') : [],
      sections: {
        myday: p.sections?.myday !== false,
        cont: p.sections?.cont !== false,
      },
      myTools: Array.isArray(p.myTools) ? p.myTools.filter((x) => typeof x === 'string') : [],
      tabs: Array.isArray(p.tabs) && p.tabs.length
        ? p.tabs.filter((x) => typeof x === 'string').slice(0, 4)
        : [...DEFAULT_HOME_CFG.tabs],
    };
  } catch {
    return { ...DEFAULT_HOME_CFG };
  }
}

let cfg = loadCfg();
const listeners = new Set();

export function getHomeCfg() { return cfg; }

export function setHomeCfg(patch) {
  cfg = { ...cfg, ...patch };
  try { localStorage.setItem(HOME_CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
  for (const fn of listeners) fn(cfg);
}

export function resetHomeCfg() {
  cfg = { ...DEFAULT_HOME_CFG };
  try { localStorage.removeItem(HOME_CFG_KEY); } catch { /* ignore */ }
  for (const fn of listeners) fn(cfg);
}

export function useHomeCfg() {
  const [value, setValue] = useState(cfg);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

/* Edit mode is session state, shared by the home's two blocks. */
let editing = false;
const editListeners = new Set();

export function setEditMode(on) {
  editing = !!on;
  for (const fn of editListeners) fn(editing);
}

export function useEditMode() {
  const [value, setValue] = useState(editing);
  useEffect(() => {
    editListeners.add(setValue);
    return () => editListeners.delete(setValue);
  }, []);
  return value;
}
