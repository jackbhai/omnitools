/**
 * Arcade — Classic group. Five original canvas games over the state
 * machines in core/games-canvas.js (Breakout, Pong, Space Dodge,
 * Wall Ball, Pinball-lite), proven headlessly by verify_games.mjs.
 * (Snake, the sixth classic, predates the arcade and lives in the hub.)
 */
import React, { useRef, useState } from 'react';
import { GameShell, Stage, useBest, useCanvasLoop, usePhase, themeColors, canvasPos, sfxPlay } from './games-kit.jsx';
import { bkNew, bkStep, pgNew, pgStep, spNew, spStep, wbNew, wbStep, pbNew, pbStep, PB_BUMPERS } from '../core/games-canvas.js';

const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

/* ---------------------------------------------------------------- breakout */
const BK_COLS = ['var(--err)', 'var(--warn)', 'var(--green)', 'var(--cyan)', 'color-mix(in srgb, var(--err) 55%, var(--cyan))'];
function drawBreakout(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  const bw = (340 - 16) / 8, bh = 15;
  st.bricks.forEach((v, i) => {
    if (!v) return;
    const r = Math.floor(i / 8), c = i % 8;
    ctx.fillStyle = BK_COLS[r];
    rr(ctx, 8 + c * bw + 1.5, 42 + r * (bh + 5), bw - 6, bh, 3); ctx.fill();
  });
  ctx.fillStyle = C.green;
  rr(ctx, st.paddle.x, 314, st.paddle.w, 10, 5); ctx.fill();
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, 8, 0, 7); ctx.fill();
  ctx.fillStyle = C.err;
  for (let i = 0; i < st.lives; i++) { ctx.beginPath(); ctx.arc(320 - i * 17, 18, 5, 0, 7); ctx.fill(); }
}
export function Breakout() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = bkNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('breakout');
  const totalRef = useRef(0);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const before = st.score;
      const ev = bkStep(st, dt);
      if (ev.brick) { totalRef.current += st.score - before; setScore(totalRef.current); sfxPlay('add'); }
      if (ev.bounced) sfxPlay('pop');
      if (ev.lost) sfxPlay('error');
      if (st.cleared) {
        sfxPlay('success');
        const keepScore = st.score, keepLives = st.lives, fast = st.fast + 0.18;
        stRef.current = bkNew(fast);
        stRef.current.score = keepScore;
        stRef.current.lives = keepLives;
      }
      if (st.over) { setPhase('over'); report(totalRef.current); }
    }
    drawBreakout(ctx, stRef.current);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = bkNew(); totalRef.current = 0; setScore(0); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.paddle.x = Math.max(0, Math.min(340 - stRef.current.paddle.w, canvasPos(e, cv).x - stRef.current.paddle.w / 2)); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Slide the paddle to keep the ball up and smash every brick. Clear the wall and it rebuilds — faster. Three balls per game." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* -------------------------------------------------------------------- pong */
function drawPong(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = C.line; ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(170, 0); ctx.lineTo(170, 340); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.fg;
  ctx.font = '700 26px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(String(st.ps), 128, 36);
  ctx.fillText(String(st.as), 212, 36);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.green; rr(ctx, 14, st.py - 32, 10, 64, 5); ctx.fill();
  ctx.fillStyle = C.err; rr(ctx, 316, st.ay - 32, 10, 64, 5); ctx.fill();
  ctx.fillStyle = C.warn;
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, 8, 0, 7); ctx.fill();
}
export function Pong() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = pgNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState('0 – 0');
  const [best, report] = useBest('pong');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = pgStep(st, dt);
      if (ev.point) { setScore(`${st.ps} – ${st.as}`); sfxPlay(ev.point === 1 ? 'add' : 'error'); }
      if (st.over) {
        setPhase('over');
        if (st.winner === 1) { sfxPlay('success'); report(1); }
      }
    }
    drawPong(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = pgNew(); setScore('0 – 0'); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.py = Math.max(32, Math.min(308, canvasPos(e, cv).y)); };
  return (<>
    <GameShell score={score} scoreLabel="You – CPU" best={best} bestLabel="Matches won"
      onRestart={start}
      how="First to 5. Drag to move your paddle (left); the ball speeds up with every return, and where it strikes the paddle bends its angle." />
    <Stage cvRef={cvRef} phase={phase}
      overTitle={stRef.current.winner === 1 ? 'You win the match' : 'CPU wins the match'}
      overSub={`Final score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* -------------------------------------------------------------- space dodge */
function drawSpace(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.fillStyle = 'color-mix(in srgb, var(--fg) 40%, transparent)';
  for (let i = 0; i < 26; i++) {
    const x = (i * 67) % 340, y = ((i * 89 + st.t * 26) % 340);
    ctx.fillRect(x, y, 2, 2);
  }
  for (const r of st.rocks) {
    ctx.fillStyle = C.fg3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.beginPath(); ctx.arc(r.x - r.r * 0.3, r.y - r.r * 0.2, r.r * 0.32, 0, 7); ctx.fill();
  }
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.moveTo(st.px, 296); ctx.lineTo(st.px - 12, 322); ctx.lineTo(st.px + 12, 322);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.warn;
  ctx.beginPath(); ctx.arc(st.px, 318, 4, 0, 7); ctx.fill();
}
export function SpaceDodge() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = spNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('space');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = spStep(st, dt);
      setScore(st.score);
      if (ev.died) { setPhase('over'); sfxPlay('error'); report(st.score); }
    }
    drawSpace(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = spNew(); setScore(0); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.tx = Math.max(14, Math.min(326, canvasPos(e, cv).x)); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Drag to fly. The asteroid field thickens and quickens the longer you survive — your score is pure survival time." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Survived for ${score} points`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* --------------------------------------------------------------- wall ball */
function drawWall(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = C.line; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(4, 336); ctx.lineTo(4, 4); ctx.lineTo(336, 4); ctx.lineTo(336, 336); ctx.stroke();
  ctx.fillStyle = C.green;
  rr(ctx, st.paddle.x, 316, st.paddle.w, 10, 5); ctx.fill();
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, 8, 0, 7); ctx.fill();
  ctx.fillStyle = C.err;
  for (let i = 0; i < st.lives; i++) { ctx.beginPath(); ctx.arc(320 - i * 17, 20, 5, 0, 7); ctx.fill(); }
}
export function WallBall() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = wbNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('wallball');
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = wbStep(st, dt);
      if (ev.hit) { setScore(st.score); sfxPlay('add'); }
      if (ev.lost) sfxPlay('error');
      if (st.over) { setPhase('over'); report(st.score); }
    }
    drawWall(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = wbNew(); setScore(0); setPhase('play'); };
  const steer = (e) => { const cv = cvRef.current; if (cv) stRef.current.paddle.x = Math.max(0, Math.min(340 - stRef.current.paddle.w, canvasPos(e, cv).x - stRef.current.paddle.w / 2)); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="Squash against three walls: every paddle return is 10 points, and the ball gets quicker each time. Three misses end it." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={steer} onMove={(e) => { if (e.buttons) steer(e); }} />
  </>);
}

/* ------------------------------------------------------------ pinball-lite */
function drawPinball(ctx, st) {
  const C = themeColors();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = C.line; ctx.lineWidth = 3;
  rr(ctx, 2, 2, 336, 336, 14); ctx.stroke();
  for (const bp of PB_BUMPERS) {
    ctx.fillStyle = C.warn;
    ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r, 0, 7); ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r * 0.45, 0, 7); ctx.fill();
  }
  const px = 170, py = 316;
  const fx = px + Math.cos(st.flip.a) * 56, fy = py + Math.sin(st.flip.a) * 56;
  ctx.strokeStyle = C.green; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = C.fg;
  ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(st.ball.x, st.ball.y, 8, 0, 7); ctx.fill();
  ctx.fillStyle = C.cyan;
  for (let i = 0; i < st.balls; i++) { ctx.beginPath(); ctx.arc(18 + i * 17, 20, 5, 0, 7); ctx.fill(); }
}
export function PinballLite() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = pbNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [score, setScore] = useState(0);
  const [best, report] = useBest('pinball');
  const holdRef = useRef(false);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      const ev = pbStep(st, holdRef.current, dt);
      if (ev.bumper >= 0) { setScore(st.score); sfxPlay('add'); }
      if (ev.launched) sfxPlay('pop');
      if (ev.drained) sfxPlay('error');
      if (st.over) { setPhase('over'); report(st.score); }
    }
    drawPinball(ctx, st);
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = pbNew(); setScore(0); setPhase('play'); };
  return (<>
    <GameShell score={score} best={best} onRestart={start}
      how="One flipper, three balls. Press and hold anywhere to swing it — time the release of a rolling ball to launch it into the 50-point bumpers." />
    <Stage cvRef={cvRef} phase={phase} overSub={`Score ${score}`} onStart={start}
      onDown={() => { holdRef.current = true; }} onUp={() => { holdRef.current = false; }} />
  </>);
}
