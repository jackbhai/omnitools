/**
 * Arcade — Reflex group. Seventeen original mini games.
 *
 * Canvas titles run on the core state machines in core/games-canvas.js
 * (proven headlessly by scripts/verify_games.mjs); the DOM titles run on
 * the small machines in core/games2.js. This file only renders + inputs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GameShell, Stage, useBest, useCanvasLoop, usePhase, themeColors, canvasPos, sfxPlay } from './games-kit.jsx';
import { flNew, flStep, dnNew, dnStep, hpNew, hpStep, cdNew, cdStep, heNew, heStep, rcNew, rcHop, rcStep, gfNew, gfFlip, gfStep, stNew, stStep, stDrop, cbNew, cbStep, bbNew, bbStep, bbPop, frNew, frStep, frSlice } from '../core/games-canvas.js';
import { rxPress, rxReady, stroopRound, STROOP_WORDS, aimTarget } from '../core/games2.js';
import { Icon } from '../ui/icons';

const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

/* ------------------------------------------------------------------ flappy */
function drawFlappy(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = C.line;
  for (const p of st.pipes) {
    ctx.fillRect(p.x, 0, 46, p.gap - 52);
    ctx.fillRect(p.x, p.gap + 52, 46, 340 - p.gap - 52);
    ctx.fillStyle = C.green;
    ctx.fillRect(p.x - 3, p.gap - 64, 52, 12);
    ctx.fillRect(p.x - 3, p.gap + 52, 52, 12);
    ctx.fillStyle = C.line;
  }
  ctx.fillStyle = C.warn;
  ctx.beginPath(); ctx.arc(70, st.y, 12, 0, 7); ctx.fill();
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(74, st.y - 3, 3.4, 0, 7); ctx.fill();
  ctx.fillStyle = C.err;
  ctx.beginPath(); ctx.moveTo(80, st.y); ctx.lineTo(90, st.y + 3); ctx.lineTo(80, st.y + 6); ctx.fill();
}
export function PipeDodge() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = flNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('flappy');
  const tapRef = useRef(false);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = flStep(st, tapRef.current, dt);
      tapRef.current = false;
      if (ev.scored) { setScore(st.score); sfxPlay('add'); }
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawFlappy(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = flNew(); setScore(0); tapRef.current = true; setPhase('play'); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Tap anywhere on the field to flap. Thread the bird through the gaps — one touch ends the run." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={() => { if (phaseRef.current === 'play') tapRef.current = true; }} />
  </>);
}

/* -------------------------------------------------------------------- dino */
function drawDino(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 328); ctx.lineTo(340, 328); ctx.stroke();
  ctx.fillStyle = C.fg3;
  for (let i = 0; i < 9; i++) { const x = ((i * 53 - st.dist % 53) + 340) % 340; ctx.fillRect(x, 333, 16, 2); }
  ctx.fillStyle = C.green;
  rr(ctx, 42, 328 - 34 - st.y, 34, 34, 7); ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.beginPath(); ctx.arc(66, 328 - 26 - st.y, 3, 0, 7); ctx.fill();
  ctx.fillStyle = C.err;
  for (const o of st.obs) { rr(ctx, o.x, 328 - o.h, o.w, o.h, 4); ctx.fill(); }
}
export function DinoRunner() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = dnNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('dino');
  const jumpRef = useRef(false);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = dnStep(st, jumpRef.current, dt);
      jumpRef.current = false;
      setScore(st.score);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawDino(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = dnNew(); setScore(0); jumpRef.current = true; setPhase('play'); };
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jumpRef.current = true; } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Tap the field (or press Space) to jump the blocks. The run speeds up the longer you last." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={() => { if (phaseRef.current === 'play') jumpRef.current = true; }} />
  </>);
}

/* ------------------------------------------------------------------ hopper */
function drawHopper(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = C.green;
  for (const p of st.plats) { const y = p.y - st.camY; if (y > -14 && y < 354) { rr(ctx, p.x, y, p.w, 9, 4); ctx.fill(); } }
  ctx.fillStyle = C.warn;
  ctx.beginPath(); ctx.arc(st.x, st.y - st.camY, 13, 0, 7); ctx.fill();
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(st.x + 4, st.y - st.camY - 3, 3, 0, 7); ctx.fill();
}
export function VerticalHopper() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = hpNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('hopper');
  const dirRef = useRef(0);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = hpStep(st, dirRef.current, dt);
      setScore(st.score);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawHopper(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = hpNew(); setScore(0); setPhase('play'); };
  const steer = (e) => {
    const cv = cvRef.current; if (!cv) return;
    const p = canvasPos(e, cv);
    const st = stRef.current;
    dirRef.current = p.x < st.x - 8 ? -1 : p.x > st.x + 8 ? 1 : 0;
  };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="You bounce on your own — drag or hold left/right of the ball to steer. Climb as high as you can; falling below the screen ends it." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Height score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} onUp={() => { dirRef.current = 0; }} />
    <div className="gpad" style={{ marginTop: 8 }}>
      <button className="btn ghost" aria-label="Left" onPointerDown={() => { dirRef.current = -1; }} onPointerUp={() => { dirRef.current = 0; }}><Icon n="back" size={18} /></button>
      <span />
      <button className="btn ghost" aria-label="Right" onPointerDown={() => { dirRef.current = 1; }} onPointerUp={() => { dirRef.current = 0; }}><Icon n="chevron" size={18} /></button>
    </div>
  </>);
}

/* --------------------------------------------------------------- car dodge */
function drawCar(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.setLineDash([16, 18]);
  ctx.lineDashOffset = -(st.dist % 34);
  for (const x of [113, 226]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 340); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const f of st.foes) { ctx.fillStyle = C.err; rr(ctx, f.x, f.y, 30, 50, 8); ctx.fill(); ctx.fillStyle = C.bg; rr(ctx, f.x + 6, f.y + 10, 18, 12, 3); ctx.fill(); }
  ctx.fillStyle = C.green; rr(ctx, st.px, 274, 30, 50, 8); ctx.fill();
  ctx.fillStyle = C.bg; rr(ctx, st.px + 6, 274 + 12, 18, 12, 3); ctx.fill();
}
export function CarDodge() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = cdNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('cardodge');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = cdStep(st, dt);
      setScore(st.score);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawCar(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = cdNew(); setScore(0); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.tx = Math.max(8, Math.min(302, canvasPos(e, cv).x - 15)); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Drag to steer your car through traffic. Near misses are free — touching a car is not." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* -------------------------------------------------------------- helicopter */
function drawHeli(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = C.line;
  for (const p of st.pillars) {
    ctx.fillRect(p.x, 0, 40, p.gap - 56);
    ctx.fillRect(p.x, p.gap + 56, 40, 340 - p.gap - 56);
  }
  ctx.fillStyle = C.cyan;
  rr(ctx, 48, st.y - 10, 36, 20, 8); ctx.fill();
  ctx.strokeStyle = C.fg; ctx.lineWidth = 2.4;
  const wob = Math.sin(performance.now() / 28) * 3;
  ctx.beginPath(); ctx.moveTo(44, st.y - 14); ctx.lineTo(88, st.y - 14 + wob * 0.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, st.y + 2); ctx.lineTo(34, st.y - 6); ctx.stroke();
}
export function HelicopterHold() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = heNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('heli');
  const holdRef = useRef(false);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = heStep(st, holdRef.current, dt);
      if (ev.scored) { setScore(st.score); sfxPlay('add'); }
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawHeli(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = heNew(); setScore(0); setPhase('play'); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Press and hold to climb, let go to sink. Feather the hold to slip through every gap." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Gaps cleared ${score}`} onStart={start}
      onDown={() => { holdRef.current = true; }} onUp={() => { holdRef.current = false; }} />
  </>);
}

/* -------------------------------------------------------------- road cross */
function drawRoad(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = 'color-mix(in srgb, var(--green) 16%, transparent)';
  ctx.fillRect(0, 0, 340, 34); ctx.fillRect(0, 5 * 34, 340, 34); ctx.fillRect(0, 9 * 34, 340, 34);
  ctx.strokeStyle = C.line; ctx.setLineDash([10, 12]); ctx.lineWidth = 2;
  for (let r = 1; r <= 8; r++) { if (r === 5) continue; ctx.beginPath(); ctx.moveTo(0, r * 34 + 34); ctx.lineTo(340, r * 34 + 34); ctx.stroke(); }
  ctx.setLineDash([]);
  const carCols = [C.err, C.warn, C.cyan];
  for (const lane of st.lanes) lane.cars.forEach((car, i) => {
    ctx.fillStyle = carCols[(lane.row + i) % 3];
    rr(ctx, car.x, lane.row * 34 + 5, car.len * 34, 24, 6); ctx.fill();
  });
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(st.px * 34 + 17, st.py * 34 + 17, 11, 0, 7); ctx.fill();
  ctx.fillStyle = C.green;
  ctx.beginPath(); ctx.arc(st.px * 34 + 17, st.py * 34 + 17, 6, 0, 7); ctx.fill();
}
export function RoadCross() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = rcNew(1);
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('roadcross');
  const [, setTickN] = useState(0);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = rcStep(st, dt);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
      if (st.won) {
        sfxPlay('success');
        const lvl = st.level + 1;
        const keep = st.score + 100;
        stRef.current = rcNew(lvl);
        stRef.current.score = keep;
        setScore(keep);
      }
    }
    drawRoad(ctx, stRef.current);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = rcNew(1); setScore(0); setPhase('play'); };
  const hop = (dx, dy) => {
    if (phaseRef.current !== 'play') return;
    rcHop(stRef.current, dx, dy);
    sfxPlay('pop');
    setScore(stRef.current.score);
    setTickN((n) => n + 1);
  };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Hop with the pad (or arrow keys) across eight lanes of traffic to the far side. Every crossing raises the speed and pays 100." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start} />
    <div className="gpad">
      <span />
      <button className="btn ghost" aria-label="Up" onClick={() => hop(0, -1)}><Icon n="up" size={18} /></button>
      <span />
      <button className="btn ghost" aria-label="Left" onClick={() => hop(-1, 0)}><Icon n="back" size={18} /></button>
      <button className="btn ghost" aria-label="Down" onClick={() => hop(0, 1)}><Icon n="down" size={18} /></button>
      <button className="btn ghost" aria-label="Right" onClick={() => hop(1, 0)}><Icon n="chevron" size={18} /></button>
    </div>
  </>);
}

/* ------------------------------------------------------------ gravity flip */
function drawFlip(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, 0, 340, 26); ctx.fillRect(0, 314, 340, 26);
  ctx.fillStyle = C.err;
  for (const s of st.spikes) {
    ctx.beginPath();
    if (s.ceil) { ctx.moveTo(s.x, 26); ctx.lineTo(s.x + 22, 26); ctx.lineTo(s.x + 11, 48); }
    else { ctx.moveTo(s.x, 314); ctx.lineTo(s.x + 22, 314); ctx.lineTo(s.x + 11, 292); }
    ctx.fill();
  }
  ctx.fillStyle = C.green;
  rr(ctx, 56, st.y - 13, 26, 26, 6); ctx.fill();
}
export function GravityFlip() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = gfNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('gravflip');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = gfStep(st, dt);
      setScore(st.score);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawFlip(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = gfNew(); setScore(0); setPhase('play'); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Tap to flip gravity between floor and ceiling. Land on the wrong side of a spike and the run ends." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={() => { if (phaseRef.current === 'play') { gfFlip(stRef.current); sfxPlay('pop'); } }} />
  </>);
}

/* -------------------------------------------------------------- stack tower */
function drawStack(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  const h = 22;
  const camLayers = Math.max(0, st.layers.length - 11);
  const yOf = (i) => 340 - (i - camLayers + 1) * h;
  st.layers.forEach((l, i) => {
    if (i < camLayers) return;
    ctx.fillStyle = i % 2 ? C.cyan : C.green;
    rr(ctx, l.x, yOf(i) - h + 2, l.w, h - 3, 3); ctx.fill();
  });
  if (st.alive) {
    ctx.fillStyle = C.warn;
    const topY = yOf(st.layers.length - 1) - h;
    rr(ctx, st.cur.x, topY - h + 2, st.cur.w, h - 3, 3); ctx.fill();
  }
}
export function StackTower() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = stNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('stack');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') stStep(st, dt);
    drawStack(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = stNew(); setScore(0); setPhase('play'); };
  const drop = () => {
    if (phaseRef.current !== 'play') return;
    const r = stDrop(stRef.current);
    setScore(stRef.current.score);
    if (!r.ok) { setPhase('over'); sfxPlay('error'); report(stRef.current.score); }
    else sfxPlay(r.perfect ? 'success' : 'add');
  };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Tap to drop the sliding block. Whatever hangs over the edge falls away — line it up perfectly to keep the full width." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Tower height ${score}`} onStart={start} onDown={drop} />
  </>);
}

/* ------------------------------------------------------------ catch basket */
function drawCatch(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  for (const it of st.items) {
    if (it.bomb) { ctx.fillStyle = C.fg; ctx.beginPath(); ctx.arc(it.x, it.y, 11, 0, 7); ctx.fill(); ctx.fillStyle = C.err; ctx.beginPath(); ctx.arc(it.x + 4, it.y - 10, 3, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = C.warn; ctx.beginPath(); ctx.arc(it.x, it.y, 11, 0, 7); ctx.fill(); ctx.fillStyle = C.green; ctx.fillRect(it.x - 2, it.y - 16, 4, 6); }
  }
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.moveTo(st.bx - 8, 306); ctx.lineTo(st.bx + 38, 306); ctx.lineTo(st.bx + 31, 330); ctx.lineTo(st.bx - 1, 330);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.err;
  for (let i = 0; i < st.lives; i++) { ctx.beginPath(); ctx.arc(320 - i * 18, 18, 5, 0, 7); ctx.fill(); }
}
export function CatchBasket() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = cbNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [best, report] = useBest('catch');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = cbStep(st, dt);
      if (ev.caught) { setScore(st.score); sfxPlay('add'); }
      if (ev.hurt) { setLives(st.lives); sfxPlay('error'); }
      if (st.over) { setPhase('over'); report(st.score); }
    }
    drawCatch(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = cbNew(); setScore(0); setLives(3); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.tx = canvasPos(e, cv).x - 15; };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{lives}</div><div className="l">Lives</div></div>}
      how="Slide the basket under the falling fruit. Bombs and dropped fruit each cost a life — you have three." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* --------------------------------------------------------------- bubbles */
function drawBubbles(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  for (const b of st.bubbles) {
    const x = b.x + Math.sin(b.ph) * 5;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'color-mix(in srgb, var(--fg) 55%, transparent)';
    ctx.beginPath(); ctx.arc(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.38, 3.6, 5.4); ctx.stroke();
  }
  ctx.fillStyle = C.fg;
  ctx.font = '700 15px system-ui';
  ctx.fillText(`${Math.ceil(st.time)}s`, 12, 24);
}
export function BubblePop() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = bbNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('bubbles');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      bbStep(st, dt);
      if (st.over) { setPhase('over'); sfxPlay('timer'); report(st.score); }
    }
    drawBubbles(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = bbNew(); setScore(0); setPhase('play'); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Sixty seconds: tap bubbles to pop them. Small bubbles are worth more than big ones." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Popped for ${score} points`} onStart={start}
      onDown={(e) => {
        if (phaseRef.current !== 'play') return;
        const cv = cvRef.current; if (!cv) return;
        const p = canvasPos(e, cv);
        const pts = bbPop(stRef.current, p.x, p.y);
        if (pts) { setScore(stRef.current.score); sfxPlay('pop'); }
      }} />
  </>);
}

/* --------------------------------------------------------------- fruit slice */
function drawFruit(ctx, st, trail) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  for (const f of st.fruits) {
    if (f.bomb) { ctx.fillStyle = C.fg; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill(); ctx.fillStyle = C.err; ctx.beginPath(); ctx.arc(f.x + 5, f.y - f.r - 2, 3.4, 0, 7); ctx.fill(); continue; }
    ctx.fillStyle = f.sliced ? 'color-mix(in srgb, var(--warn) 45%, transparent)' : C.warn;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    if (f.sliced) { ctx.strokeStyle = C.bg; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(f.x - f.r, f.y); ctx.lineTo(f.x + f.r, f.y); ctx.stroke(); }
  }
  if (trail && trail.length > 1) {
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 3; ctx.beginPath();
    trail.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
  }
  ctx.fillStyle = C.err;
  for (let i = 0; i < st.lives; i++) { ctx.beginPath(); ctx.arc(320 - i * 18, 18, 5, 0, 7); ctx.fill(); }
}
export function FruitSlice() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = frNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('fruit');
  const trailRef = useRef([]);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = frStep(st, dt);
      if (ev.missed) sfxPlay('error');
      if (st.over) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawFruit(ctx, st, trailRef.current);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = frNew(); setScore(0); trailRef.current = []; setPhase('play'); };
  const swipe = (e) => {
    if (phaseRef.current !== 'play') return;
    const cv = cvRef.current; if (!cv) return;
    const p = canvasPos(e, cv);
    trailRef.current = [...trailRef.current.slice(-9), p];
    const hits = frSlice(stRef.current, trailRef.current);
    if (hits) { setScore(stRef.current.score); sfxPlay('add'); }
    if (stRef.current.bombed) { setPhase('over'); sfxPlay('error'); report(stRef.current.score); }
  };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Swipe through the tossed fruit to slice it. Miss three fruit and the round ends — slice a bomb and it ends at once." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={(e) => { trailRef.current = []; swipe(e); }}
      onMove={(e) => { if (e.buttons) swipe(e); }}
      onUp={() => { trailRef.current = []; }} />
  </>);
}

/* ============================================================ DOM reflex */

/* ------------------------------------------------------------- whack-a-mole */
export function WhackAMole() {
  const [active, setActive] = useState(-1);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(30);
  const [run, setRun] = useState(false);
  const [best, report] = useBest('whack');
  const stateRef = useRef({ run: false });
  const start = () => {
    setScore(0); setTime(30); setRun(true); stateRef.current.run = true;
    sfxPlay('open');
  };
  useEffect(() => {
    if (!run) return undefined;
    let last = -1;
    const spawn = setInterval(() => {
      let n = Math.floor(Math.random() * 9);
      if (n === last) n = (n + 3) % 9;
      last = n;
      setActive(n);
    }, 620);
    const clock = setInterval(() => {
      setTime((t) => {
        if (t <= 0.25) {
          clearInterval(spawn); clearInterval(clock);
          setRun(false); setActive(-1); stateRef.current.run = false;
          setScore((s) => { report(s); return s; });
          sfxPlay('timer');
          return 0;
        }
        return +(t - 0.25).toFixed(2);
      });
    }, 250);
    return () => { clearInterval(spawn); clearInterval(clock); };
  }, [run]); // eslint-disable-line
  const whack = (i) => {
    if (!run) return;
    if (i === active) { setScore((s) => s + 1); setActive(-1); sfxPlay('add'); }
  };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{Math.ceil(time)}s</div><div className="l">Time</div></div>}
      how="Thirty seconds. Bonk every mole the moment it pops up — they get shy as the clock runs down." />
    {!run && score === 0 && time === 30 && (
      <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={start}><Icon n="play" size={15} /> Start</button>)}
    <div className="mole-grid">
      {Array.from({ length: 9 }, (_, i) => (
        <button key={i} className={`mole ${i === active ? 'up' : ''}`} onClick={() => whack(i)}
          aria-label={i === active ? 'Mole — whack it' : 'Hole'}>
          {i === active ? <Icon n="smile" size={30} /> : <span className="mole-hole" />}
        </button>))}
    </div>
    {!run && (score > 0 || time === 0) && (
      <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={start}>Play again</button>)}
  </>);
}

/* ----------------------------------------------------------- reaction time */
function ReflexPanel({ kind }) {
  const isDraw = kind === 'draw';
  const [st, setSt] = useState({ phase: 'idle', at: 0, result: 0 });
  const [best, report] = useBest(isDraw ? 'quickdraw' : 'reaction', true);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const press = () => {
    const now = performance.now();
    const next = rxPress(st, now);
    if (next.phase === 'waiting') {
      sfxPlay('pop');
      timerRef.current = setTimeout(() => setSt(rxReady(performance.now())), 1200 + Math.random() * 2400);
    }
    if (next.phase === 'early') { clearTimeout(timerRef.current); sfxPlay('error'); }
    if (next.phase === 'done') { sfxPlay('success'); report(next.result); }
    setSt(next);
  };
  const look = {
    idle: ['var(--s2)', isDraw ? 'Tap to arm the draw' : 'Tap to start'],
    waiting: ['color-mix(in srgb, var(--warn) 30%, var(--s2))', 'Wait for it…'],
    ready: ['color-mix(in srgb, var(--green) 42%, var(--s2))', isDraw ? 'DRAW — tap the star' : 'TAP'],
    early: ['color-mix(in srgb, var(--err) 30%, var(--s2))', 'Too soon — tap to retry'],
    done: ['var(--s2)', `${st.result} ms — tap to go again`],
  }[st.phase];
  return (<>
    <GameShell best={best} bestLabel="Best (ms)" score={st.phase === 'done' ? st.result : undefined} scoreLabel="Last (ms)"
      how={isDraw
        ? 'Arm the draw, wait for the star, then strike it the instant it appears. Jumping early spoils the attempt.'
        : 'Tap once, wait for the panel to turn green, then tap as fast as you can. Your time is measured in milliseconds.'} />
    <button className="reflex-panel" style={{ background: look[0] }} onClick={press}>
      {st.phase === 'ready' && isDraw
        ? <Icon n="star" size={54} />
        : <b style={{ fontSize: 19 }}>{look[1]}</b>}
      {st.phase === 'ready' && isDraw && <span className="dim sm">Tap now</span>}
      {st.phase !== 'ready' && st.phase !== 'idle' && st.phase !== 'done' && <span className="dim sm">{look[1] === 'Wait for it…' ? 'Hands steady…' : ''}</span>}
    </button>
  </>);
}
export function ReactionTime() { return <ReflexPanel kind="react" />; }
export function QuickDraw() { return <ReflexPanel kind="draw" />; }

/* -------------------------------------------------------------- aim trainer */
export function AimTrainer() {
  const [tgt, setTgt] = useState(null);
  const [hits, setHits] = useState(0);
  const [shots, setShots] = useState(0);
  const [time, setTime] = useState(30);
  const [run, setRun] = useState(false);
  const [best, report] = useBest('aim');
  const boxRef = useRef(null);
  const spawn = () => {
    const box = boxRef.current;
    const w = box ? box.clientWidth : 320;
    setTgt(aimTarget(w, 264, Math.random));
  };
  useEffect(() => {
    if (!run) return undefined;
    const clock = setInterval(() => {
      setTime((t) => {
        if (t <= 0.25) {
          clearInterval(clock);
          setRun(false); setTgt(null);
          setHits((h) => { report(h); return h; });
          sfxPlay('timer');
          return 0;
        }
        return +(t - 0.25).toFixed(2);
      });
    }, 250);
    return () => clearInterval(clock);
  }, [run]); // eslint-disable-line
  const start = () => { setHits(0); setShots(0); setTime(30); setRun(true); setTimeout(spawn, 30); };
  return (<>
    <GameShell score={hits} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{shots ? Math.round((hits / shots) * 100) : 100}%</div><div className="l">Accuracy</div></div>}
      how="Thirty seconds of targets. Every hit spawns the next one somewhere else — small targets, fast hands." />
    <div className="aim-box" ref={boxRef}
      onPointerDown={() => { if (run) setShots((s) => s + 1); }}>
      {tgt && (
        <button className="aim-tgt" aria-label="Target"
          style={{ left: tgt.x - tgt.r, top: tgt.y - tgt.r, width: tgt.r * 2, height: tgt.r * 2 }}
          onPointerDown={(e) => { e.stopPropagation(); setHits((h) => h + 1); setShots((s) => s + 1); sfxPlay('add'); spawn(); }} />)}
      {!run && (
        <button className="btn aim-start" onClick={start}><Icon n="play" size={15} /> {hits || time < 30 ? 'Play again' : 'Start'}</button>)}
      {run && <span className="aim-clock">{Math.ceil(time)}s</span>}
    </div>
  </>);
}

/* -------------------------------------------------------------- color match */
const INKS = ['var(--err)', 'var(--cyan)', 'var(--green)', 'var(--warn)', 'color-mix(in srgb, var(--err) 55%, var(--cyan))'];
export function ColorMatch() {
  const [round, setRound] = useState(() => stroopRound());
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [time, setTime] = useState(30);
  const [run, setRun] = useState(false);
  const [best, report] = useBest('stroop');
  useEffect(() => {
    if (!run) return undefined;
    const clock = setInterval(() => {
      setTime((t) => {
        if (t <= 0.25) {
          clearInterval(clock); setRun(false);
          setScore((s) => { report(s); return s; });
          sfxPlay('timer');
          return 0;
        }
        return +(t - 0.25).toFixed(2);
      });
    }, 250);
    return () => clearInterval(clock);
  }, [run]); // eslint-disable-line
  const answer = (said) => {
    if (!run) return;
    if (said === round.match) { setScore((s) => s + 1); sfxPlay('add'); }
    else { setWrong((w) => w + 1); sfxPlay('error'); }
    setRound(stroopRound());
  };
  const start = () => { setScore(0); setWrong(0); setTime(30); setRound(stroopRound()); setRun(true); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{Math.ceil(time)}s</div><div className="l">Time</div></div>}
      how="Does the WORD match the COLOUR it is printed in? Your brain will want to read the word — trust the colour. Thirty seconds." />
    <div className="stroop-card">
      <span className="stroop-word" style={{ color: INKS[round.ink] }}>{STROOP_WORDS[round.word]}</span>
      <span className="dim sm">Mistakes: {wrong}</span>
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button className="btn" style={{ flex: 1 }} disabled={!run} onClick={() => answer(true)}>Match</button>
      <button className="btn ghost" style={{ flex: 1 }} disabled={!run} onClick={() => answer(false)}>No match</button>
    </div>
    {!run && <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={start}><Icon n="play" size={15} /> {time < 30 ? 'Play again' : 'Start'}</button>}
  </>);
}

/* ------------------------------------------------------------- tap the star */
export function TapTheStar() {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [count, setCount] = useState(0);
  const [time, setTime] = useState(30);
  const [run, setRun] = useState(false);
  const [best, report] = useBest('tapstar');
  useEffect(() => {
    if (!run) return undefined;
    const clock = setInterval(() => {
      setTime((t) => {
        if (t <= 0.25) {
          clearInterval(clock); setRun(false);
          setCount((c) => { report(c); return c; });
          sfxPlay('timer');
          return 0;
        }
        return +(t - 0.25).toFixed(2);
      });
    }, 250);
    return () => clearInterval(clock);
  }, [run]); // eslint-disable-line
  const jump = () => setPos({ x: 8 + Math.random() * 84, y: 10 + Math.random() * 76 });
  const start = () => { setCount(0); setTime(30); setRun(true); jump(); };
  const size = Math.max(30, 54 - count);
  return (<>
    <GameShell score={count} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{Math.ceil(time)}s</div><div className="l">Time</div></div>}
      how="The star never sits still — every tap sends it somewhere new, and it shrinks as your count climbs. Thirty seconds." />
    <div className="aim-box">
      {run && (
        <button className="star-tgt" aria-label="Star"
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: size, height: size }}
          onClick={() => { setCount((c) => c + 1); sfxPlay('pop'); jump(); }}>
          <Icon n="staron" size={size - 8} />
        </button>)}
      {!run && <button className="btn aim-start" onClick={start}><Icon n="play" size={15} /> {count || time < 30 ? 'Play again' : 'Start'}</button>}
      {run && <span className="aim-clock">{Math.ceil(time)}s</span>}
    </div>
  </>);
}
