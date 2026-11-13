/**
 * Games — a 50-game offline arcade in one tool.
 *
 * The hub below is a registry, not a hard-coded count: fifty entries
 * across Reflex, Puzzle, Brain, Arcade and Cards & Luck, each rendered
 * from its group module (lazy-loaded per group so the hub stays light).
 * A Daily Challenge card sits on top of the hub: one seeded game per
 * calendar day (core/games-daily.js), rotating over the six games whose
 * generators take an rng, with a local streak calendar.
 * The original three games — 2048, Snake, Memory Match — predate the
 * arcade and live in this file; everything else sits in
 * tools/games-{reflex,puzzle,brain,arcade,cards}.jsx over the pure
 * logic in core/games.js + core/games2.js + core/games-canvas.js,
 * all proven by scripts/verify_games.mjs. Best scores live on-device
 * in omni:games:best; no network, no assets, no ads.
 */
import React, { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { gNewBoard, gMove, gCanMove, gWon } from '../core/games';
import { S_COLS, S_ROWS, sNewState, sStep, sTurn } from '../core/games';
import { mDeal } from '../core/games';
import { Card, Spin, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';
import { mulberry32 } from '../core/games2.js';
import { dateStr, dailyPick, dailyStats, stampDaily } from '../core/games-daily.js';
import { loadBest } from './games-kit.jsx';
import { useCallback, useEffect } from 'react';

const BKEY = 'omni:games:best';
const saveBest = (patch) => {
  try { localStorage.setItem(BKEY, JSON.stringify({ ...loadBest(), ...patch })); } catch { /* storage off */ }
};

/* ------------------------------------------------------------------- 2048 */
function Game2048({ seed, onComplete } = {}) {
  const daily = seed != null;
  const rngRef = useRef(null);
  const doneRef = useRef(false);
  const [board, setBoard] = useState(() => {
    if (daily) rngRef.current = mulberry32(seed);
    return gNewBoard(rngRef.current || undefined);
  });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => loadBest().g2048 || 0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const touch = useRef(null);

  const restart = () => {
    if (daily) { rngRef.current = mulberry32(seed); doneRef.current = false; }
    setBoard(gNewBoard(rngRef.current || undefined)); setScore(0); setOver(false); setWon(false);
  };

  const move = useCallback((dir) => {
    if (over) return;
    setBoard((b) => {
      const r = gMove(b, dir, rngRef.current || undefined);
      if (!r.moved) return b;
      sfxPlay(r.gained ? 'add' : 'pop');
      if (daily && !doneRef.current && (r.board.some((v) => v >= 512) || !gCanMove(r.board))) {
        doneRef.current = true;
        onComplete?.();
      }
      setScore((s) => {
        const ns = s + r.gained;
        if (ns > best) { setBest(ns); saveBest({ g2048: ns }); }
        return ns;
      });
      if (!won && gWon(r.board)) { setWon(true); sfxPlay('success'); }
      if (!gCanMove(r.board)) { setOver(true); sfxPlay('error'); }
      return r.board;
    });
  }, [over, best, won]);

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [move]);

  const onTouchEnd = (e) => {
    const t0 = touch.current;
    if (!t0) return;
    const dx = e.changedTouches[0].clientX - t0.x;
    const dy = e.changedTouches[0].clientY - t0.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    touch.current = null;
  };

  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div className="stat" style={{ flex: 1 }}><div className="v">{score}</div><div className="l">Score</div></div>
      <div className="stat" style={{ flex: 1 }}><div className="v">{best}</div><div className="l">Best</div></div>
      <button className="btn" onClick={restart}><Icon n="refresh" size={15} /> New game</button>
    </div>
    <div className="g2048" role="application" aria-label="2048 board"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={onTouchEnd}>
      {board.map((v, i) => (
        <div key={i} className={`g2048-cell v${v}`}>{v || ''}</div>))}
      {over && (
        <div className="g2048-over">
          <b>Game over</b>
          <span className="dim sm">No moves left · score {score}</span>
          <button className="btn" onClick={restart}>Play again</button>
        </div>)}
      {won && !over && (
        <div className="g2048-over" style={{ background: 'color-mix(in srgb, var(--green) 14%, transparent)' }}>
          <b>You made 2048</b>
          <span className="dim sm">Keep going for a bigger score</span>
          <button className="btn" onClick={() => setWon(false)}>Continue</button>
        </div>)}
    </div>
    <div className="gpad">
      <span />
      <button className="btn ghost" aria-label="Up" onClick={() => move('up')}><Icon n="up" size={18} /></button>
      <span />
      <button className="btn ghost" aria-label="Left" onClick={() => move('left')}><Icon n="back" size={18} /></button>
      <button className="btn ghost" aria-label="Down" onClick={() => move('down')}><Icon n="down" size={18} /></button>
      <button className="btn ghost" aria-label="Right" onClick={() => move('right')}><Icon n="chevron" size={18} /></button>
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>Swipe the board or use the arrows. Matching tiles merge — reach 2048.</p>
  </>);
}

/* ------------------------------------------------------------------ snake */
function GameSnake() {
  const cvRef = useRef(null);
  const stRef = useRef(null);
  const timerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => loadBest().snake || 0);
  const [dead, setDead] = useState(false);
  const touch = useRef(null);

  const draw = useCallback(() => {
    const cv = cvRef.current, st = stRef.current;
    if (!cv || !st) return;
    const ctx = cv.getContext('2d');
    const cs = cv.width / S_COLS;
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--s2') || '#122';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (st.food) {
      ctx.fillStyle = css.getPropertyValue('--warn') || '#f5b83d';
      ctx.beginPath();
      ctx.arc((st.food.x + 0.5) * cs, (st.food.y + 0.5) * cs, cs * 0.32, 0, 7);
      ctx.fill();
    }
    st.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0
        ? (css.getPropertyValue('--green') || '#00e08a')
        : `color-mix(in srgb, ${css.getPropertyValue('--green') || '#00e08a'} ${Math.max(35, 90 - i * 4)}%, transparent)`;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(seg.x * cs + pad, seg.y * cs + pad, cs - pad * 2, cs - pad * 2, 4);
      ctx.fill();
    });
  }, []);

  const stopLoop = () => { clearInterval(timerRef.current); timerRef.current = null; setRunning(false); };

  const start = () => {
    stRef.current = sNewState();
    setScore(0); setDead(false);
    draw();
    stopLoop();
    setRunning(true);
    timerRef.current = setInterval(() => {
      const before = stRef.current.score;
      stRef.current = sStep(stRef.current);
      const st = stRef.current;
      if (st.score !== before) { setScore(st.score); sfxPlay('add'); }
      if (!st.alive) {
        stopLoop(); setDead(true); sfxPlay('error');
        if (st.score > best) { setBest(st.score); saveBest({ snake: st.score }); }
      }
      draw();
    }, 130);
  };

  useEffect(() => { stRef.current = sNewState(); draw(); return () => stopLoop(); }, [draw]);

  const turn = (dx, dy) => { if (stRef.current) stRef.current = sTurn(stRef.current, dx, dy); };

  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div className="stat" style={{ flex: 1 }}><div className="v">{score}</div><div className="l">Score</div></div>
      <div className="stat" style={{ flex: 1 }}><div className="v">{best}</div><div className="l">Best</div></div>
      <button className="btn" onClick={start}><Icon n="play" size={15} /> {dead || score ? 'Restart' : 'Start'}</button>
    </div>
    <div style={{ position: 'relative', marginTop: 10 }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t0 = touch.current; if (!t0) return;
        const dx = e.changedTouches[0].clientX - t0.x;
        const dy = e.changedTouches[0].clientY - t0.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
        touch.current = null;
      }}>
      <canvas ref={cvRef} width={340} height={340} className="snake-cv" aria-label="Snake board" />
      {dead && (
        <div className="g2048-over" style={{ borderRadius: 16 }}>
          <b>Game over</b>
          <span className="dim sm">Score {score}</span>
          <button className="btn" onClick={start}>Play again</button>
        </div>)}
      {!running && !dead && (
        <div className="g2048-over" style={{ borderRadius: 16 }}>
          <b>Snake</b>
          <span className="dim sm">Eat the dots, do not bite yourself</span>
          <button className="btn" onClick={start}>Start</button>
        </div>)}
    </div>
    <div className="gpad">
      <span />
      <button className="btn ghost" aria-label="Up" onClick={() => turn(0, -1)}><Icon n="up" size={18} /></button>
      <span />
      <button className="btn ghost" aria-label="Left" onClick={() => turn(-1, 0)}><Icon n="back" size={18} /></button>
      <button className="btn ghost" aria-label="Down" onClick={() => turn(0, 1)}><Icon n="down" size={18} /></button>
      <button className="btn ghost" aria-label="Right" onClick={() => turn(1, 0)}><Icon n="chevron" size={18} /></button>
    </div>
  </>);
}

/* ----------------------------------------------------------------- memory */
function GameMemory({ seed, onComplete } = {}) {
  const daily = seed != null;
  const deal = () => (daily ? mDeal(6, mulberry32(seed)) : mDeal(6));
  const [deck, setDeck] = useState(deal);
  const [picked, setPicked] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matched, setMatched] = useState(0);
  const [lock, setLock] = useState(false);
  const [best, setBest] = useState(() => loadBest().memory || 0);
  const done = matched === 6;

  const restart = () => { setDeck(deal()); setPicked([]); setMoves(0); setMatched(0); setLock(false); };

  const flip = (card) => {
    if (lock || card.up || card.done || picked.length === 2) return;
    sfxPlay('pop');
    const up = deck.map((c) => (c.id === card.id ? { ...c, up: true } : c));
    const np = [...picked, card.id];
    setDeck(up); setPicked(np);
    if (np.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = np.map((id) => up.find((c) => c.id === id));
    if (a.sym === b.sym) {
      setDeck(up.map((c) => (c.sym === a.sym ? { ...c, done: true } : c)));
      setPicked([]);
      const nm = matched + 1;
      setMatched(nm);
      sfxPlay('success');
      if (nm === 6 && daily) onComplete?.();
      if (nm === 6) {
        setMoves((m) => {
          if (!best || m < best) { setBest(m); saveBest({ memory: m }); }
          return m;
        });
      }
    } else {
      setLock(true);
      setTimeout(() => {
        setDeck((d) => d.map((c) => (np.includes(c.id) ? { ...c, up: false } : c)));
        setPicked([]); setLock(false);
      }, 750);
    }
  };

  return (<>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div className="stat" style={{ flex: 1 }}><div className="v">{moves}</div><div className="l">Moves</div></div>
      <div className="stat" style={{ flex: 1 }}><div className="v">{best || '—'}</div><div className="l">Best (fewest)</div></div>
      <div className="stat" style={{ flex: 1 }}><div className="v">{matched}/6</div><div className="l">Pairs</div></div>
      <button className="btn" onClick={restart}><Icon n="refresh" size={15} /> Shuffle</button>
    </div>
    <div className="mem-grid">
      {deck.map((c) => (
        <button key={c.id} className={`mem-card ${c.up || c.done ? 'up' : ''} ${c.done ? 'done' : ''}`}
          onClick={() => flip(c)} aria-label={c.up || c.done ? c.sym : 'Hidden card'}>
          {(c.up || c.done) ? <Icon n={c.sym} size={26} /> : <Icon n="sparkle" size={18} />}
        </button>))}
    </div>
    {done && (
      <Card style={{ marginTop: 12, textAlign: 'center' }}>
        <b>All pairs found in {moves} moves</b>
        <div className="btnrow" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn" onClick={restart}>Play again</button>
        </div>
      </Card>)}
    <p className="dim sm" style={{ marginTop: 8 }}>Tap two cards — if the pictures match, they stay. Clear the board in as few moves as you can.</p>
  </>);
}

/* ------------------------------------------------------- arcade registry */
const lazyGame = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const R = () => import('./games-reflex.jsx');
const P = () => import('./games-puzzle.jsx');
const B = () => import('./games-brain.jsx');
const A = () => import('./games-arcade.jsx');
const K = () => import('./games-cards.jsx');

/* id, name, group, icon, best key (+unit), component */
export const GAMES = [
  /* Reflex */
  { id: 'flappy', n: 'Pipe Dodge', g: 'Reflex', i: 'film', k: 'flappy', C: lazyGame(R, 'PipeDodge') },
  { id: 'dino', n: 'Dino Runner', g: 'Reflex', i: 'train', k: 'dino', C: lazyGame(R, 'DinoRunner') },
  { id: 'whack', n: 'Whack-a-Mole', g: 'Reflex', i: 'smile', k: 'whack', C: lazyGame(R, 'WhackAMole') },
  { id: 'reaction', n: 'Reaction Time', g: 'Reflex', i: 'timer', k: 'reaction', u: ' ms', C: lazyGame(R, 'ReactionTime') },
  { id: 'aim', n: 'Aim Trainer', g: 'Reflex', i: 'signal', k: 'aim', C: lazyGame(R, 'AimTrainer') },
  { id: 'stroop', n: 'Color Match', g: 'Reflex', i: 'palette', k: 'stroop', C: lazyGame(R, 'ColorMatch') },
  { id: 'quickdraw', n: 'Quick Draw', g: 'Reflex', i: 'star', k: 'quickdraw', u: ' ms', C: lazyGame(R, 'QuickDraw') },
  { id: 'bubbles', n: 'Bubble Pop', g: 'Reflex', i: 'disc', k: 'bubbles', C: lazyGame(R, 'BubblePop') },
  { id: 'catch', n: 'Catch the Basket', g: 'Reflex', i: 'box', k: 'catch', C: lazyGame(R, 'CatchBasket') },
  { id: 'cardodge', n: 'Car Dodge', g: 'Reflex', i: 'route', k: 'cardodge', C: lazyGame(R, 'CarDodge') },
  { id: 'heli', n: 'Helicopter Hold', g: 'Reflex', i: 'wind', k: 'heli', C: lazyGame(R, 'HelicopterHold') },
  { id: 'hopper', n: 'Vertical Hopper', g: 'Reflex', i: 'up', k: 'hopper', C: lazyGame(R, 'VerticalHopper') },
  { id: 'roadcross', n: 'Road Cross', g: 'Reflex', i: 'walk', k: 'roadcross', C: lazyGame(R, 'RoadCross') },
  { id: 'stack', n: 'Stack Tower', g: 'Reflex', i: 'list', k: 'stack', C: lazyGame(R, 'StackTower') },
  { id: 'fruit', n: 'Fruit Slice', g: 'Reflex', i: 'wheat', k: 'fruit', C: lazyGame(R, 'FruitSlice') },
  { id: 'gravflip', n: 'Gravity Flip', g: 'Reflex', i: 'swap', k: 'gravflip', C: lazyGame(R, 'GravityFlip') },
  { id: 'tapstar', n: 'Tap the Star', g: 'Reflex', i: 'staron', k: 'tapstar', C: lazyGame(R, 'TapTheStar') },
  /* Puzzle */
  { id: 'mines', n: 'Minesweeper', g: 'Puzzle', i: 'grid', k: 'mines', u: 's', C: lazyGame(P, 'Minesweeper') },
  { id: 'blockfall', n: 'Block Fall', g: 'Puzzle', i: 'box', k: 'blockfall', C: lazyGame(P, 'BlockFall') },
  { id: 'slide15', n: 'Sliding Puzzle', g: 'Puzzle', i: 'numbers', k: 'slide15', u: ' moves', C: lazyGame(P, 'SlidePuzzle') },
  { id: 'lightsout', n: 'Lights Out', g: 'Puzzle', i: 'sun', k: 'lightsout', u: ' moves', C: lazyGame(P, 'LightsOut') },
  { id: 'floodit', n: 'Flood It', g: 'Puzzle', i: 'drop', k: 'floodit', u: ' moves', C: lazyGame(P, 'FloodIt') },
  { id: 'maze', n: 'Maze Runner', g: 'Puzzle', i: 'map', k: 'maze', u: 's', C: lazyGame(P, 'MazeRunner') },
  { id: 'hanoi', n: 'Tower of Hanoi', g: 'Puzzle', i: 'list', k: 'hanoi', u: ' moves', C: lazyGame(P, 'TowerOfHanoi') },
  { id: 'dotsboxes', n: 'Dots & Boxes', g: 'Puzzle', i: 'grid', k: 'dotsboxes', C: lazyGame(P, 'DotsAndBoxes') },
  { id: 'simon', n: 'Simon Sequence', g: 'Puzzle', i: 'disc', k: 'simon', C: lazyGame(P, 'Simon') },
  { id: 'gridseq', n: 'Grid Sequence', g: 'Puzzle', i: 'sparkle', k: 'gridseq', C: lazyGame(P, 'GridSequence') },
  { id: 'g2048', n: '2048', g: 'Puzzle', i: 'numbers', k: 'g2048', C: Game2048 },
  /* Brain */
  { id: 'sudoku', n: 'Sudoku', g: 'Brain', i: 'grid', k: 'sudoku-easy', u: 's', C: lazyGame(B, 'Sudoku') },
  { id: 'mathsprint', n: 'Math Sprint', g: 'Brain', i: 'percent', k: 'mathsprint', C: lazyGame(B, 'MathSprint') },
  { id: 'typing', n: 'Typing Speed', g: 'Brain', i: 'type', k: 'typing', u: ' wpm', C: lazyGame(B, 'TypingSpeed') },
  { id: 'wordguess', n: 'Word Guess', g: 'Brain', i: 'pen', k: 'wordguess', C: lazyGame(B, 'WordGuess') },
  { id: 'numguess', n: 'Number Guess', g: 'Brain', i: 'hash', k: 'numguess', u: ' guesses', C: lazyGame(B, 'NumberGuess') },
  { id: 'mastermind', n: 'Mastermind', g: 'Brain', i: 'key', k: 'mastermind', u: ' guesses', C: lazyGame(B, 'Mastermind') },
  { id: 'memory', n: 'Memory Match', g: 'Brain', i: 'sparkle', k: 'memory', u: ' moves', C: GameMemory },
  /* Arcade */
  { id: 'breakout', n: 'Breakout', g: 'Arcade', i: 'box', k: 'breakout', C: lazyGame(A, 'Breakout') },
  { id: 'pong', n: 'Pong', g: 'Arcade', i: 'swap', k: 'pong', C: lazyGame(A, 'Pong') },
  { id: 'space', n: 'Space Dodge', g: 'Arcade', i: 'satellite', k: 'space', C: lazyGame(A, 'SpaceDodge') },
  { id: 'wallball', n: 'Wall Ball', g: 'Arcade', i: 'disc', k: 'wallball', C: lazyGame(A, 'WallBall') },
  { id: 'pinball', n: 'Pinball Lite', g: 'Arcade', i: 'bolt', k: 'pinball', C: lazyGame(A, 'PinballLite') },
  { id: 'snake', n: 'Snake', g: 'Arcade', i: 'route', k: 'snake', C: GameSnake },
  /* Cards & Luck */
  { id: 'ttt', n: 'Tic-Tac-Toe', g: 'Cards & Luck', i: 'grid', k: 'ttt', C: lazyGame(K, 'TicTacToe') },
  { id: 'connect4', n: 'Connect Four', g: 'Cards & Luck', i: 'disc', k: 'connect4', C: lazyGame(K, 'ConnectFour') },
  { id: 'reversi', n: 'Reversi', g: 'Cards & Luck', i: 'repeat', k: 'reversi', C: lazyGame(K, 'Reversi') },
  { id: 'highlow', n: 'Higher or Lower', g: 'Cards & Luck', i: 'swap', k: 'highlow', C: lazyGame(K, 'HigherLower') },
  { id: 'twentyone', n: 'Twenty-One', g: 'Cards & Luck', i: 'coin', k: 'twentyone', C: lazyGame(K, 'TwentyOne') },
  { id: 'rps', n: 'Rock Paper Scissors', g: 'Cards & Luck', i: 'shuffle', k: 'rps', C: lazyGame(K, 'RockPaperScissors') },
  { id: 'dice', n: 'Dice Duel', g: 'Cards & Luck', i: 'dice', k: 'dice', C: lazyGame(K, 'DiceDuel') },
  { id: 'wheel', n: 'Spin Wheel', g: 'Cards & Luck', i: 'refresh', k: 'wheel', C: lazyGame(K, 'SpinWheel') },
  { id: 'coin', n: 'Coin Toss', g: 'Cards & Luck', i: 'coin', k: 'coin', C: lazyGame(K, 'CoinToss') },
];
export const GAME_GROUPS = ['Reflex', 'Puzzle', 'Brain', 'Arcade', 'Cards & Luck'];
export { Game2048, GameSnake, GameMemory };
const ALIASES = {
  flappy: 'bird chidiya', snake: 'saanp samp', mines: 'bomb surang', sudoku: 'ank ganit',
  ttt: 'zero kata', rps: 'pathar kagaz kainchi', dice: 'pasa ludo', coin: 'sikka toss',
  wordguess: 'shabd akshar hangman', typing: 'keyboard type', maze: 'bhul bhulaiya rasta',
  car: 'gaadi', cardodge: 'gaadi car traffic', pong: 'table tennis', fruit: 'phal',
};

/* ------------------------------------------------------------------- shell */
export function Games() {
  const [openId, setOpenId] = useState(null);
  const [dailyMode, setDailyMode] = useState(false);
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [bests, setBests] = useState(() => loadBest());
  const [stats, setStats] = useState(() => dailyStats(dateStr()));
  const topRef = useRef(null);
  const open = GAMES.find((g) => g.id === openId) || null;
  const pick = dailyPick(dateStr());

  const shown = useMemo(() => GAMES.filter((g) => {
    if (group !== 'All' && g.g !== group) return false;
    if (!q) return true;
    const hay = (g.n + ' ' + g.g + ' ' + (ALIASES[g.id] || '')).toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [group, q]);

  const pickGame = (g) => {
    setOpenId(g.id);
    sfxPlay('open');
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const pickDaily = () => {
    setDailyMode(true);
    pickGame(GAMES.find((g) => g.id === pick.id));
  };
  const completeDaily = () => {
    stampDaily(dateStr(), pick.id);
    const s = dailyStats(dateStr());
    setStats(s);
    toast(`Daily challenge complete — ${s.streak}-day streak, ${s.total} day${s.total === 1 ? '' : 's'} in all`, 'ok');
  };
  const close = () => {
    setOpenId(null); setDailyMode(false);
    setBests(loadBest()); setStats(dailyStats(dateStr()));
    sfxPlay('back');
  };

  return (<>
    <div ref={topRef} />
    {open ? (<>
      <button className="btn ghost sm" onClick={close}><Icon n="back" size={15} /> All games</button>
      <h3 style={{ margin: '10px 0 2px' }}>{open.n}</h3>
      <span className="pill">{open.g}</span>
      {dailyMode && (
        <div className="src" style={{ marginTop: 8 }}>
          <span className="dot" />
          <span>Daily Challenge — {pick.goal}. The same setup for everyone today
            {stats.doneToday ? ' · already stamped today, replaying is just for fun' : ''}.</span>
        </div>)}
      <div style={{ marginTop: 12 }}>
        <Suspense fallback={<Spin t="Loading game" />}>
          <open.C key={open.id + (dailyMode ? ':daily' : '')}
            seed={dailyMode ? pick.seed : undefined}
            onComplete={dailyMode ? completeDaily : undefined} />
        </Suspense>
      </div>
    </>) : (<>
      <Card style={{ marginBottom: 12 }}>
        <div className="chead">Daily Challenge</div>
        <div className="sm" style={{ marginTop: 4 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — <b>{pick.n}</b>
        </div>
        <div className="dim sm" style={{ marginTop: 2 }}>{pick.goal}. One seeded setup, the same for everyone today.</div>
        <div className="dim sm" style={{ marginTop: 6 }}>
          {stats.doneToday ? 'Done today' : 'Not done yet'} · Streak {stats.streak} day{stats.streak === 1 ? '' : 's'} · {stats.total} day{stats.total === 1 ? '' : 's'} completed in all
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={pickDaily}>
          <Icon n="play" size={15} /> {stats.doneToday ? 'Play it again' : 'Play today’s challenge'}
        </button>
      </Card>
      <div className="search">
        <Icon n="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${GAMES.length} games…`}
          aria-label="Search games" autoComplete="off" spellCheck="false" />
        {q && <button onClick={() => setQ('')} aria-label="Clear search"><Icon n="x" size={15} /></button>}
      </div>
      <div className="cats" style={{ marginTop: 10 }}>
        {['All', ...GAME_GROUPS].map((g) => (
          <button key={g} className={`cat ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
            {g}{g !== 'All' ? ` · ${GAMES.filter((x) => x.g === g).length}` : ` · ${GAMES.length}`}
          </button>))}
      </div>
      {shown.length === 0
        ? <p className="dim sm" style={{ marginTop: 14 }}>No game matches that search.</p>
        : (
          <div className="arc-grid">
            {shown.map((g) => {
              const b = bests[g.k];
              return (
                <button key={g.id} className="arc-card" onClick={() => pickGame(g)}>
                  <span className="arc-ic"><Icon n={g.i} size={22} /></span>
                  <b>{g.n}</b>
                  <small>{g.g}</small>
                  {b !== undefined && b !== null && <span className="arc-best">Best {b}{g.u || ''}</span>}
                </button>);
            })}
          </div>)}
    </>)}
    <div className="src"><span className="dot" /><span>{GAMES.length} games, all original and fully offline — scores stay on this device</span></div>
  </>);
}

export default Games;
