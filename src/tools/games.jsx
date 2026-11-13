/**
 * Games — three small, polished, fully offline games in one tool.
 *
 * 2048 (swipe or arrows), Snake (canvas, swipe or pad) and Memory Match.
 * No network, no assets: tiles are styled divs, the snake is one canvas,
 * and the sounds are the app's own synthesized set. Best scores live on
 * this device only.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { gNewBoard, gMove, gCanMove, gWon } from '../core/games';
import { S_COLS, S_ROWS, sNewState, sStep, sTurn } from '../core/games';
import { mDeal } from '../core/games';
import { Card } from '../ui/kit';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

const BKEY = 'omni:games:best';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BKEY) || '{}'); } catch { return {}; } };
const saveBest = (patch) => {
  try { localStorage.setItem(BKEY, JSON.stringify({ ...loadBest(), ...patch })); } catch { /* storage off */ }
};

/* ------------------------------------------------------------------- 2048 */
function Game2048() {
  const [board, setBoard] = useState(() => gNewBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => loadBest().g2048 || 0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const touch = useRef(null);

  const restart = () => { setBoard(gNewBoard()); setScore(0); setOver(false); setWon(false); };

  const move = useCallback((dir) => {
    if (over) return;
    setBoard((b) => {
      const r = gMove(b, dir);
      if (!r.moved) return b;
      sfxPlay(r.gained ? 'add' : 'pop');
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
function GameMemory() {
  const [deck, setDeck] = useState(() => mDeal(6));
  const [picked, setPicked] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matched, setMatched] = useState(0);
  const [lock, setLock] = useState(false);
  const [best, setBest] = useState(() => loadBest().memory || 0);
  const done = matched === 6;

  const restart = () => { setDeck(mDeal(6)); setPicked([]); setMoves(0); setMatched(0); setLock(false); };

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

/* ------------------------------------------------------------------- shell */
export function Games() {
  const [tab, setTab] = useState('2048');
  return (<>
    <div className="cats">
      <button className={`cat ${tab === '2048' ? 'on' : ''}`} onClick={() => setTab('2048')}>2048</button>
      <button className={`cat ${tab === 'snake' ? 'on' : ''}`} onClick={() => setTab('snake')}>Snake</button>
      <button className={`cat ${tab === 'memory' ? 'on' : ''}`} onClick={() => setTab('memory')}>Memory Match</button>
    </div>
    <div style={{ marginTop: 12 }}>
      {tab === '2048' && <Game2048 />}
      {tab === 'snake' && <GameSnake />}
      {tab === 'memory' && <GameMemory />}
    </div>
    <div className="src"><span className="dot" /><span>Fully offline — no downloads, no ads, scores stay on this device</span></div>
  </>);
}

export default Games;
