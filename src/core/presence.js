/**
 * Presence — how many people are using the app right now.
 *
 * The relay keeps the count: this device pings it once a minute with a
 * random per-install id, and every ping answers with the current count.
 * The number is approximate by nature (a 60-second heartbeat cannot be
 * exact), and the UI words it that way. When the relay cannot be reached
 * the badge hides rather than showing a stale number as fact; the last
 * real count may be shown greyed for up to two minutes, marked as the
 * older reading it is.
 */
import { useEffect, useState } from 'react';
import { proxyBase } from './settings';

const SID_KEY = 'omni:sid';
const LAST_KEY = 'omni:presence';
const STALE_MS = 2 * 60 * 1000;

function sid() {
  try {
    let s = localStorage.getItem(SID_KEY);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID_KEY, s);
    }
    return s;
  } catch { return 'anon'; }
}

let lastGood = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    return v && typeof v.n === 'number' ? v : null;
  } catch { return null; }
})();

const subs = new Set();

function snapshot() {
  if (!lastGood) return null;
  const age = Date.now() - (lastGood.at || 0);
  if (age > STALE_MS) return null;
  return { n: lastGood.n, at: lastGood.at, fresh: age <= 75000 };
}

function notify() {
  const s = snapshot();
  subs.forEach((f) => { try { f(s); } catch {} });
}

async function fetchCount(path) {
  const base = proxyBase().replace(/\/+$/, '');
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error('presence ' + r.status);
  const d = await r.json();
  if (typeof d?.online !== 'number') throw new Error('presence shape');
  lastGood = { n: d.online, at: Date.now() };
  try { localStorage.setItem(LAST_KEY, JSON.stringify(lastGood)); } catch {}
}

async function ping() {
  try { await fetchCount(`/presence/ping?sid=${encodeURIComponent(sid())}`); }
  catch { /* unreachable relay: keep the last real count, greyed, or hide */ }
  notify();
}

let started = false;
export function startPresence() {
  if (started) return;
  started = true;
  /* First paint can use the read-only count while the first ping flies. */
  fetchCount('/presence').then(notify).catch(() => {});
  ping();
  setInterval(ping, 60000);
}

/** { n, at, fresh } or null when there is nothing honest to show. */
export function usePresence() {
  const [v, setV] = useState(snapshot);
  useEffect(() => {
    subs.add(setV);
    setV(snapshot());
    return () => subs.delete(setV);
  }, []);
  return v;
}
