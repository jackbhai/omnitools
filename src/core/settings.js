/**
 * User settings that live only in this browser.
 *
 * The one that matters is the custom proxy. Audio resolution has to pass
 * through a CORS hop, and the free public ones have become unreliable —
 * measured across 25 of them: one permanent 401, four rate-limited, three
 * 403, several timeouts, and a single slow survivor. Pointing the app at a
 * personal Cloudflare Worker (worker/omni-proxy.js, free tier, 100k req/day)
 * removes that whole class of problem.
 */

const KEY = 'omni:settings';

const DEFAULTS = {
  proxyUrl: '',          // e.g. https://omni-proxy.you.workers.dev
  autoRadio: true,       // keep the queue topped up so playback never ends
};

let cache = null;

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

const subs = new Set();
export function onSettings(fn) { subs.add(fn); return () => subs.delete(fn); }

export function setSetting(k, v) {
  const s = { ...getSettings(), [k]: v };
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  for (const f of subs) { try { f(s); } catch {} }
  return s;
}

/** Normalised proxy base, or '' when the user has not set one. */
export function proxyBase() {
  const u = (getSettings().proxyUrl || '').trim();
  if (!u) return '';
  return u.replace(/\/+$/, '');
}

/** Wrap a target URL for the user's own proxy. */
export const viaOwnProxy = (target) => {
  const b = proxyBase();
  return b ? `${b}/?url=${encodeURIComponent(target)}` : '';
};

/**
 * Check that a pasted Worker URL actually works before we rely on it.
 * Returns { ok, ms, error }.
 */
export async function testProxy(base) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return { ok: false, error: 'Enter a URL first' };
  const probe = 'https://itunes.apple.com/search?term=test&limit=1';
  const t0 = Date.now();
  try {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 15000);
    const r = await fetch(`${b}/?url=${encodeURIComponent(probe)}`, { signal: c.signal });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `Proxy answered HTTP ${r.status}` };
    const j = await r.json();
    if (typeof j.resultCount !== 'number') return { ok: false, error: 'Unexpected response' };
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'Timed out' : e.message };
  }
}
