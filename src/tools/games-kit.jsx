/**
 * Shared kit for the mini-games arcade.
 *
 * One shell (title, how-to, score/best, restart), one best-score store
 * (the same omni:games:best object the first three games used), and one
 * canvas loop: requestAnimationFrame with a clamped dt, DPR-aware
 * scaling onto a 340x340 logical field, paused when the tab hides or
 * the game unmounts. Games own rules in core/games*.js; this file only
 * owns the frame and the furniture.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

export const BKEY = 'omni:games:best';
export const loadBest = () => { try { return JSON.parse(localStorage.getItem(BKEY) || '{}'); } catch { return {}; } };
export const saveBestKey = (key, val) => {
  try { localStorage.setItem(BKEY, JSON.stringify({ ...loadBest(), [key]: val })); } catch { /* storage off */ }
};

/** Best score for one game. low=true when smaller wins (times, moves). */
export function useBest(key, low = false) {
  const [best, setBest] = useState(() => loadBest()[key]);
  const report = useCallback((val) => {
    if (val === undefined || val === null || Number.isNaN(val)) return;
    setBest((prev) => {
      const better = prev === undefined || (low ? val < prev : val > prev);
      if (better) { saveBestKey(key, val); return val; }
      return prev;
    });
  }, [key, low]);
  return [best, report];
}

export const fmtBest = (v) => (v === undefined || v === null ? '—' : v);

/** Score / best / restart strip + how-to line, the shell of every game. */
export function GameShell({ how, score, scoreLabel = 'Score', best, bestLabel = 'Best', onRestart, children, extra }) {
  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      {score !== undefined && (
        <div className="stat" style={{ flex: 1 }}><div className="v">{score}</div><div className="l">{scoreLabel}</div></div>)}
      {best !== undefined && (
        <div className="stat" style={{ flex: 1 }}><div className="v">{fmtBest(best)}</div><div className="l">{bestLabel}</div></div>)}
      {extra}
      {onRestart && (
        <button className="btn" onClick={() => { sfxPlay('refresh'); onRestart(); }}>
          <Icon n="refresh" size={15} /> Restart
        </button>)}
    </div>
    {children}
    {how && <p className="dim sm" style={{ marginTop: 8 }}>{how}</p>}
  </>);
}

/** Full-canvas overlay for start / game-over states. */
export function CanvasOverlay({ title, sub, btn, onBtn }) {
  return (
    <div className="g2048-over" style={{ borderRadius: 16 }}>
      <b>{title}</b>
      {sub && <span className="dim sm">{sub}</span>}
      {btn && <button className="btn" onClick={onBtn}>{btn}</button>}
    </div>);
}

/**
 * Canvas frame: sets up a 340-logical canvas at 2x for crispness and
 * runs `tick(dt)` while `running` is true. Pauses on visibilitychange.
 * Returns the canvas ref; draw inside tick or a separate draw fn.
 */
export function useCanvasLoop(tick, running) {
  const cvRef = useRef(null);
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== 340 * dpr) { cv.width = 340 * dpr; cv.height = 340 * dpr; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) { tickRef.current(0, ctx); return undefined; }
    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!document.hidden) tickRef.current(dt, ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return cvRef;
}

/** Theme colours for canvas drawing, refreshed per draw call. */
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fb) => css.getPropertyValue(name).trim() || fb;
  return {
    bg: v('--s2', '#12241c'), line: v('--line', '#244434'),
    green: v('--green', '#00e08a'), cyan: v('--cyan', '#22c8e5'),
    warn: v('--warn', '#f5b83d'), err: v('--err', '#ff6b5e'),
    fg: v('--fg', '#eaf5ee'), fg3: v('--fg3', '#7d9484'),
  };
}

/** Pointer position on a canvas, in logical 340 coordinates. */
export function canvasPos(e, cv) {
  const r = cv.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return {
    x: ((t.clientX - r.left) / r.width) * 340,
    y: ((t.clientY - r.top) / r.height) * 340,
  };
}

/** Phase state ('ready' | 'play' | 'over') with a ref twin for loops. */
export function usePhase(init = 'ready') {
  const [phase, setPhaseState] = useState(init);
  const ref = useRef(init);
  const set = useCallback((p) => { ref.current = p; setPhaseState(p); }, []);
  return [phase, ref, set];
}

/** Canvas wrapper: relative box, canvas, start/over overlay, handlers. */
export function Stage({ cvRef, phase, overTitle, overSub, onStart, onDown, onUp, onMove, children }) {
  return (
    <div className="cvwrap" style={{ marginTop: 10 }}
      onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={onUp} onPointerMove={onMove}
      onTouchStart={(e) => e.preventDefault()}>
      <canvas ref={cvRef} className="gcv" aria-label="Game field" />
      {children}
      {phase === 'ready' && <CanvasOverlay title="Ready" sub={overSub} btn="Start" onBtn={onStart} />}
      {phase === 'over' && <CanvasOverlay title={overTitle || 'Game over'} sub={overSub} btn="Play again" onBtn={onStart} />}
    </div>);
}

export { sfxPlay };
