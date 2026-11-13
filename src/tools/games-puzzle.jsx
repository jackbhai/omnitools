/**
 * Arcade — Puzzle group. Ten original mini games over core/games2.js
 * logic (plus the sequence machines shared with the Brain group).
 * DOM renderers only; every rule lives in the core file and is proven
 * by scripts/verify_games.mjs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GameShell, useBest, useCanvasLoop, usePhase, themeColors, sfxPlay } from './games-kit.jsx';
import {
  msNew, msOpen, msFlag, MS_MINES,
  bfNew, bfStep, bfShift, bfRotate, bfDrop, BF_C, BF_R,
  s15New, s15Tap, s15Solved, loNew, loPressIdx, loSolved,
  fiNew, fiFlood, FI_COLORS, FI_MAX,
  mazeGen, mazeCanMove, hnNew, hnMove, hnWon, hnMin,
  dbNew, dbApply, dbAiMove, dbScore, dbEdgeId, DB_N, seqNext,
} from '../core/games2.js';
import { Icon } from '../ui/icons';

/* ------------------------------------------------------------ minesweeper */
export function Minesweeper() {
  const [st, setSt] = useState(null);
  const [flagMode, setFlagMode] = useState(false);
  const [secs, setSecs] = useState(0);
  const [best, report] = useBest('mines', true);
  useEffect(() => {
    if (!st || st.over || st.won) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [st]);
  useEffect(() => { if (st && st.won) { sfxPlay('success'); report(secs); } }, [st]); // eslint-disable-line
  const tap = (i) => {
    if (!st) { setSt(msOpen(msNew(i), i)); setSecs(0); sfxPlay('pop'); return; }
    if (st.over || st.won) return;
    if (flagMode) { setSt(msFlag(st, i)); sfxPlay('pop'); return; }
    const next = msOpen(st, i);
    setSt(next);
    if (next.over) sfxPlay('error'); else sfxPlay('pop');
  };
  const flags = st ? st.cells.filter((c) => c.flag).length : 0;
  const NUMC = ['', 'var(--cyan)', 'var(--green)', 'var(--err)', 'var(--warn)'];
  return (<>
    <GameShell score={st ? `${MS_MINES - flags} mines` : `${MS_MINES} mines`} scoreLabel="Left"
      best={best} bestLabel="Best (sec)" onRestart={() => { setSt(null); setSecs(0); }}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{secs}s</div><div className="l">Time</div></div>}
      how="First tap is always safe. Numbers say how many mines touch that square. Long-press a square — or switch on Flag mode — to mark a mine." />
    <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
      <button className={`cat ${!flagMode ? 'on' : ''}`} onClick={() => setFlagMode(false)}>Dig</button>
      <button className={`cat ${flagMode ? 'on' : ''}`} onClick={() => setFlagMode(true)}><Icon n="flag" size={13} /> Flag</button>
      {st && st.won && <span className="pill" style={{ marginLeft: 'auto' }}>Cleared in {secs}s</span>}
      {st && st.over && <span className="pill" style={{ marginLeft: 'auto' }}>Boom — mine hit</span>}
    </div>
    <div className="ms-grid">
      {(st ? st.cells : Array.from({ length: 81 }, () => ({ open: false, flag: false, n: 0, mine: false }))).map((c, i) => (
        <button key={i} className={`ms-cell ${c.open ? 'open' : ''} ${c.mine && c.open ? 'mine' : ''}`}
          onClick={() => tap(i)}
          onContextMenu={(e) => { e.preventDefault(); if (st && !st.over && !st.won) setSt(msFlag(st, i)); }}
          aria-label={c.open ? (c.mine ? 'Mine' : `Square, ${c.n} nearby`) : 'Covered square'}>
          {c.open
            ? (c.mine ? <Icon n="disc" size={15} /> : (c.n ? <span style={{ color: NUMC[c.n] || 'var(--fg)', fontWeight: 700 }}>{c.n}</span> : ''))
            : (c.flag ? <Icon n="flag" size={13} /> : '')}
        </button>))}
    </div>
    {(!st) && <p className="dim sm" style={{ marginTop: 8 }}>Tap any square to start — the first one can never be a mine.</p>}
  </>);
}

/* -------------------------------------------------------------- block fall */
const BF_COLS = { I: 'var(--cyan)', O: 'var(--warn)', T: 'color-mix(in srgb, var(--err) 55%, var(--cyan))', S: 'var(--green)', Z: 'var(--err)', J: 'var(--cyan)', L: 'var(--warn)' };
export function BlockFall() {
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = bfNew();
  const [phase, phaseRef, setPhase] = usePhase();
  const [hud, setHud] = useState({ score: 0, lines: 0 });
  const [best, report] = useBest('blockfall');
  const dropT = useRef(0);
  const tick = (dt, ctx) => {
    const st = stRef.current;
    if (phaseRef.current === 'play') {
      dropT.current += dt;
      const interval = Math.max(0.14, 0.62 - st.lines * 0.012);
      if (dropT.current >= interval) {
        dropT.current = 0;
        stRef.current = bfStep(st);
        const ns = stRef.current;
        setHud({ score: ns.score, lines: ns.lines });
        if (ns.over) { setPhase('over'); sfxPlay('error'); report(ns.score); }
      }
    }
    const C = themeColors();
    const s = stRef.current;
    const cw = 340 / BF_C, ch = 340 / BF_R;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 340, 340);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let x = 1; x < BF_C; x++) { ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, 340); ctx.stroke(); }
    s.grid.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      ctx.fillStyle = BF_COLS[v] || C.green;
      ctx.fillRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3);
    }));
    if (s.piece) {
      ctx.fillStyle = BF_COLS[s.piece.key] || C.green;
      s.piece.shape.forEach((row, y) => row.forEach((v, x) => {
        if (v && s.piece.y + y >= 0) ctx.fillRect((s.piece.x + x) * cw + 1.5, (s.piece.y + y) * ch + 1.5, cw - 3, ch - 3);
      }));
    }
  };
  const cvRef = useCanvasLoop(tick, true);
  const start = () => { stRef.current = bfNew(); setHud({ score: 0, lines: 0 }); dropT.current = 0; setPhase('play'); };
  const act = (fn) => { if (phaseRef.current !== 'play') return; stRef.current = fn(stRef.current); sfxPlay('pop'); };
  return (<>
    <GameShell score={hud.score} best={best} onRestart={start}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{hud.lines}</div><div className="l">Lines</div></div>}
      how="Stack the falling blocks and complete rows to clear them. The fall speeds up with every line." />
    <div className="cvwrap" style={{ marginTop: 10 }}>
      <canvas ref={cvRef} className="gcv" aria-label="Block stack field" />
      {phase !== 'play' && (
        <div className="g2048-over" style={{ borderRadius: 16 }}>
          <b>{phase === 'over' ? 'Topped out' : 'Block Fall'}</b>
          <span className="dim sm">Score {hud.score} · {hud.lines} lines</span>
          <button className="btn" onClick={start}>{phase === 'over' ? 'Play again' : 'Start'}</button>
        </div>)}
    </div>
    <div className="gpad" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 8 }}>
      <button className="btn ghost" aria-label="Left" onClick={() => act((s) => bfShift(s, -1))}><Icon n="back" size={18} /></button>
      <button className="btn ghost" aria-label="Rotate" onClick={() => act((s) => bfRotate(s))}><Icon n="refresh" size={18} /></button>
      <button className="btn ghost" aria-label="Right" onClick={() => act((s) => bfShift(s, 1))}><Icon n="chevron" size={18} /></button>
      <button className="btn ghost" aria-label="Drop" onClick={() => act((s) => { const n = bfDrop(s); setHud({ score: n.score, lines: n.lines }); if (n.over) { setPhase('over'); report(n.score); } return n; })}><Icon n="down" size={18} /></button>
    </div>
  </>);
}

/* --------------------------------------------------------------- slide 15 */
export function SlidePuzzle() {
  const [st, setSt] = useState(() => s15New());
  const [best, report] = useBest('slide15', true);
  const solved = s15Solved(st);
  useEffect(() => { if (solved && st.moves > 0) { sfxPlay('success'); report(st.moves); } }, [solved]); // eslint-disable-line
  return (<>
    <GameShell score={st.moves} scoreLabel="Moves" best={best} bestLabel="Best (moves)"
      onRestart={() => setSt(s15New())}
      how="Tap a tile next to the empty space to slide it. Put the numbers back in order, 1 to 15." />
    <div className="s15-grid">
      {st.tiles.map((v, i) => (
        <button key={i} className={`s15-tile ${v === 0 ? 'blank' : ''} ${solved && v ? 'done' : ''}`}
          onClick={() => { if (!solved) { setSt(s15Tap(st, i)); sfxPlay('pop'); } }}>
          {v || ''}
        </button>))}
    </div>
    {solved && <p style={{ marginTop: 10 }}><b>Solved in {st.moves} moves.</b></p>}
  </>);
}

/* -------------------------------------------------------------- lights out */
export function LightsOut() {
  const [st, setSt] = useState(() => loNew());
  const [best, report] = useBest('lightsout', true);
  const solved = loSolved(st);
  useEffect(() => { if (solved && st.moves > 0) { sfxPlay('success'); report(st.moves); } }, [solved]); // eslint-disable-line
  return (<>
    <GameShell score={st.moves} scoreLabel="Moves" best={best} bestLabel="Best (moves)"
      onRestart={() => setSt(loNew())}
      how="Tapping a light flips it and its four neighbours. Turn every light off — think in patterns, not one light at a time." />
    <div className="lo-grid">
      {st.cells.map((v, i) => (
        <button key={i} className={`lo-cell ${v ? 'on' : ''}`} aria-label={v ? 'Lit' : 'Dark'}
          onClick={() => { if (!solved) { setSt({ cells: loPressIdx(st.cells, i), moves: st.moves + 1 }); sfxPlay('pop'); } }} />))}
    </div>
    {solved && <p style={{ marginTop: 10 }}><b>All dark in {st.moves} moves.</b></p>}
  </>);
}

/* ---------------------------------------------------------------- flood it */
const FI_HEX = ['var(--err)', 'var(--warn)', 'var(--green)', 'var(--cyan)', 'color-mix(in srgb, var(--err) 55%, var(--cyan))', 'color-mix(in srgb, var(--cyan) 50%, var(--green))'];
export function FloodIt() {
  const [st, setSt] = useState(() => fiNew());
  const [best, report] = useBest('floodit', true);
  useEffect(() => { if (st.won) { sfxPlay('success'); report(st.moves); } }, [st.won]); // eslint-disable-line
  const lost = !st.won && st.moves >= FI_MAX;
  return (<>
    <GameShell score={`${st.moves}/${FI_MAX}`} scoreLabel="Moves" best={best} bestLabel="Best (moves)"
      onRestart={() => setSt(fiNew())}
      how={`Flood the board from the top-left corner in ${FI_MAX} moves or fewer. Each colour you pick swallows every touching patch of the old colour.`} />
    <div className="fi-grid">
      {st.cells.map((v, i) => <span key={i} className="fi-cell" style={{ background: FI_HEX[v] }} />)}
    </div>
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {Array.from({ length: FI_COLORS }, (_, c) => (
        <button key={c} className="fi-btn" style={{ background: FI_HEX[c] }} aria-label={`Flood colour ${c + 1}`}
          disabled={st.won || lost || c === st.color}
          onClick={() => { setSt(fiFlood(st, c)); sfxPlay('pop'); }} />))}
    </div>
    {st.won && <p style={{ marginTop: 10 }}><b>Flooded in {st.moves} moves.</b></p>}
    {lost && <p style={{ marginTop: 10 }}><b>Out of moves — the board wins this one.</b></p>}
  </>);
}

/* ------------------------------------------------------------- maze runner */
export function MazeRunner() {
  const [level, setLevel] = useState(1);
  const [maze, setMaze] = useState(() => mazeGen(11, 11));
  const [pos, setPos] = useState(0);
  const [secs, setSecs] = useState(0);
  const [run, setRun] = useState(false);
  const [total, setTotal] = useState(0);
  const [best, report] = useBest('maze', true);
  const size = 9 + level * 2;
  const goal = size * size - 1;
  useEffect(() => {
    if (!run) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [run]);
  const start = (lvl) => {
    const sz = 9 + lvl * 2;
    setMaze(mazeGen(sz, sz));
    setPos(0); setSecs(0); setRun(true);
  };
  const move = (dir) => {
    if (!run || !mazeCanMove(maze, pos, dir)) { if (run) sfxPlay('tick'); return; }
    const delta = [ -maze.cols, 1, maze.cols, -1 ][dir];
    const np = pos + delta;
    setPos(np);
    sfxPlay('pop');
    if (np === goal) {
      const t = total + secs;
      setTotal(t);
      setRun(false);
      sfxPlay('success');
      report(t + 1);
      setLevel((l) => l + 1);
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
      if (map[e.key] !== undefined && run) { e.preventDefault(); move(map[e.key]); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const cw = 340 / maze.cols;
  return (<>
    <GameShell score={`${secs}s`} scoreLabel="Level time" best={best} bestLabel="Best total (sec)"
      onRestart={() => { setLevel(1); setTotal(0); start(1); }}
      extra={<div className="stat" style={{ flex: 1 }}><div className="v">{level}</div><div className="l">Level</div></div>}
      how="Reach the far corner. Every level grows the maze — your best is the running total of seconds across levels, so keep moving." />
    <div className="cvwrap" style={{ marginTop: 10 }}>
      <svg viewBox="0 0 340 340" className="maze-svg" role="img" aria-label="Maze">
        <rect x="0" y="0" width="340" height="340" fill="var(--s2)" />
        {maze.cells.map((walls, i) => {
          const x = (i % maze.cols) * cw, y = Math.floor(i / maze.cols) * cw;
          return (
            <g key={i} stroke="var(--fg3)" strokeWidth="2">
              {walls[0] ? <line x1={x} y1={y} x2={x + cw} y2={y} /> : null}
              {walls[1] ? <line x1={x + cw} y1={y} x2={x + cw} y2={y + cw} /> : null}
              {walls[2] ? <line x1={x} y1={y + cw} x2={x + cw} y2={y + cw} /> : null}
              {walls[3] ? <line x1={x} y1={y} x2={x} y2={y + cw} /> : null}
            </g>);
        })}
        <rect x={340 - cw + 4} y={340 - cw + 4} width={cw - 8} height={cw - 8} rx="3" fill="var(--warn)" />
        <circle cx={(pos % maze.cols) * cw + cw / 2} cy={Math.floor(pos / maze.cols) * cw + cw / 2} r={cw * 0.32} fill="var(--green)" />
      </svg>
      {!run && (
        <div className="g2048-over" style={{ borderRadius: 16 }}>
          <b>{level > 1 ? `Level ${level - 1} cleared` : 'Maze Runner'}</b>
          <span className="dim sm">{level > 1 ? `Total ${total}s — mazes keep growing` : 'A fresh maze every level'}</span>
          <button className="btn" onClick={() => start(level)}>{level > 1 ? 'Next maze' : 'Start'}</button>
        </div>)}
    </div>
    <div className="gpad">
      <span />
      <button className="btn ghost" aria-label="Up" onClick={() => move(0)}><Icon n="up" size={18} /></button>
      <span />
      <button className="btn ghost" aria-label="Left" onClick={() => move(3)}><Icon n="back" size={18} /></button>
      <button className="btn ghost" aria-label="Down" onClick={() => move(2)}><Icon n="down" size={18} /></button>
      <button className="btn ghost" aria-label="Right" onClick={() => move(1)}><Icon n="chevron" size={18} /></button>
    </div>
  </>);
}

/* ------------------------------------------------------------ tower of hanoi */
export function TowerOfHanoi() {
  const [disks, setDisks] = useState(4);
  const [st, setSt] = useState(() => hnNew(4));
  const [held, setHeld] = useState(-1);
  const [best, report] = useBest('hanoi', true);
  const won = hnWon(st);
  useEffect(() => { if (won) { sfxPlay('success'); report(st.moves); } }, [won]); // eslint-disable-line
  const tapPeg = (p) => {
    if (won) return;
    if (held === -1) { if (st.pegs[p].length) { setHeld(p); sfxPlay('pop'); } return; }
    if (held === p) { setHeld(-1); return; }
    const r = hnMove(st, held, p);
    if (r.ok) { setSt(r.st); sfxPlay('add'); } else sfxPlay('error');
    setHeld(-1);
  };
  const W = [0, 34, 52, 70, 88, 106];
  return (<>
    <GameShell score={st.moves} scoreLabel="Moves" best={best} bestLabel="Best (moves)"
      onRestart={() => { setSt(hnNew(disks)); setHeld(-1); }}
      how={`Move the whole tower to the last peg. A disk may never sit on a smaller one. Perfect play takes ${hnMin(disks)} moves.`} />
    <div className="cats">
      {[3, 4, 5].map((d) => (
        <button key={d} className={`cat ${disks === d ? 'on' : ''}`}
          onClick={() => { setDisks(d); setSt(hnNew(d)); setHeld(-1); }}>{d} disks</button>))}
    </div>
    <div className="hanoi">
      {st.pegs.map((peg, p) => (
        <button key={p} className={`hanoi-peg ${held === p ? 'held' : ''}`} onClick={() => tapPeg(p)}
          aria-label={`Peg ${p + 1}`}>
          <span className="hanoi-rod" />
          {[...peg].reverse().map((d) => (
            <span key={d} className="hanoi-disk" style={{ width: `${W[d]}%` }}>{d}</span>))}
          <span className="hanoi-base" />
        </button>))}
    </div>
    {won && <p style={{ marginTop: 10 }}><b>Tower moved in {st.moves} moves</b> — perfect is {hnMin(disks)}.</p>}
  </>);
}

/* ------------------------------------------------------------- dots & boxes */
export function DotsAndBoxes() {
  const [st, setSt] = useState(() => dbNew());
  const [best, report] = useBest('dotsboxes');
  const [mine, theirs] = dbScore(st);
  useEffect(() => {
    if (st.over) {
      if (mine > theirs) { sfxPlay('success'); report(mine - theirs); }
      else sfxPlay('error');
      return undefined;
    }
    if (st.turn === 1) {
      const t = setTimeout(() => {
        const edge = dbAiMove(st);
        if (edge) { setSt(dbApply(st, edge, 1).st); sfxPlay('pop'); }
      }, 480);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [st]); // eslint-disable-line
  const play = (edge) => {
    if (st.turn !== 0 || st.taken[edge] !== undefined || st.over) return;
    setSt(dbApply(st, edge, 0).st);
    sfxPlay('add');
  };
  const rows = [];
  for (let r = 0; r <= DB_N; r++) {
    const hRow = [];
    for (let c = 0; c < DB_N; c++) {
      hRow.push(<span key={`d${r}${c}`} className="db-dot" />);
      const e = dbEdgeId('h', r, c);
      hRow.push(<button key={e} className={`db-edge h ${st.taken[e] !== undefined ? 'on' : ''}`} aria-label="Horizontal line" onClick={() => play(e)} />);
    }
    hRow.push(<span key={`de${r}`} className="db-dot" />);
    rows.push(<div key={`hr${r}`} className="db-row">{hRow}</div>);
    if (r < DB_N) {
      const vRow = [];
      for (let c = 0; c <= DB_N; c++) {
        const e = dbEdgeId('v', r, c);
        vRow.push(<button key={e} className={`db-edge v ${st.taken[e] !== undefined ? 'on' : ''}`} aria-label="Vertical line" onClick={() => play(e)} />);
        if (c < DB_N) {
          const owner = st.boxes[r + ',' + c];
          vRow.push(<span key={`b${r}${c}`} className={`db-box ${owner === 0 ? 'mine' : owner === 1 ? 'theirs' : ''}`}>{owner !== undefined ? (owner === 0 ? 'You' : 'CPU') : ''}</span>);
        }
      }
      rows.push(<div key={`vr${r}`} className="db-row">{vRow}</div>);
    }
  }
  return (<>
    <GameShell score={`${mine} – ${theirs}`} scoreLabel="You – CPU" best={best} bestLabel="Best margin"
      onRestart={() => setSt(dbNew())}
      how="Take turns drawing one side of a square. Complete a box to claim it — and go again. Most boxes wins; beware handing the CPU a chain." />
    <div className="db-wrap">{rows}</div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {st.over ? (mine > theirs ? `You win ${mine} to ${theirs}.` : mine < theirs ? `CPU wins ${theirs} to ${mine}.` : 'A draw.') : st.turn === 0 ? 'Your turn.' : 'CPU is thinking…'}
    </p>
  </>);
}

/* ------------------------------------------------------------------- simon */
const SIMON_COLS = ['var(--green)', 'var(--err)', 'var(--warn)', 'var(--cyan)'];
export function Simon() {
  const [seq, setSeq] = useState([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('idle'); /* idle | show | play | over */
  const [flash, setFlash] = useState(-1);
  const [best, report] = useBest('simon');
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const playSeq = (s) => {
    setPhase('show');
    s.forEach((v, i) => {
      timers.current.push(setTimeout(() => setFlash(v), 420 + i * 560));
      timers.current.push(setTimeout(() => setFlash(-1), 420 + i * 560 + 380));
    });
    timers.current.push(setTimeout(() => { setStep(0); setPhase('play'); }, 420 + s.length * 560));
  };
  const start = () => {
    const s = seqNext([], 4);
    setSeq(s); setShowIdx(s.length);
    playSeq(s);
  };
  const press = (i) => {
    if (phase !== 'play') return;
    setFlash(i);
    setTimeout(() => setFlash(-1), 180);
    if (i !== seq[step]) { setPhase('over'); sfxPlay('error'); report(seq.length - 1); return; }
    sfxPlay('add');
    if (step + 1 === seq.length) {
      const s = seqNext(seq, 4);
      setSeq(s);
      timers.current.push(setTimeout(() => playSeq(s), 700));
    } else setStep(step + 1);
  };
  return (<>
    <GameShell score={Math.max(0, seq.length - (phase === 'play' || phase === 'show' ? 1 : 0))} scoreLabel="Round"
      best={best} bestLabel="Best round" onRestart={start}
      how="Watch the pads light up, then repeat the pattern. One new step joins every round — one wrong pad ends it." />
    <div className="simon-grid">
      {SIMON_COLS.map((c, i) => (
        <button key={i} className={`simon-pad ${flash === i ? 'lit' : ''}`} style={{ background: c }}
          aria-label={`Pad ${i + 1}`} onClick={() => press(i)} />))}
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {phase === 'show' ? 'Watch…' : phase === 'play' ? `Your turn — step ${step + 1} of ${seq.length}` : phase === 'over' ? `Wrong pad. You reached round ${seq.length}.` : 'Press Start and watch.'}
    </p>
    {phase === 'idle' || phase === 'over' ? (
      <button className="btn" style={{ width: '100%' }} onClick={start}><Icon n="play" size={15} /> {phase === 'over' ? 'Play again' : 'Start'}</button>) : null}
  </>);
}

/* --------------------------------------------------------- grid sequence */
export function GridSequence() {
  const [seq, setSeq] = useState([]);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [flash, setFlash] = useState(-1);
  const [best, report] = useBest('gridseq');
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const playSeq = (s) => {
    setPhase('show');
    s.forEach((v, i) => {
      timers.current.push(setTimeout(() => setFlash(v), 380 + i * 520));
      timers.current.push(setTimeout(() => setFlash(-1), 380 + i * 520 + 340));
    });
    timers.current.push(setTimeout(() => { setStep(0); setPhase('play'); }, 380 + s.length * 520));
  };
  const start = () => { const s = seqNext([], 9); setSeq(s); playSeq(s); };
  const press = (i) => {
    if (phase !== 'play') return;
    setFlash(i);
    setTimeout(() => setFlash(-1), 160);
    if (i !== seq[step]) { setPhase('over'); sfxPlay('error'); report(seq.length - 1); return; }
    sfxPlay('add');
    if (step + 1 === seq.length) {
      const s = seqNext(seq, 9);
      setSeq(s);
      timers.current.push(setTimeout(() => playSeq(s), 650));
    } else setStep(step + 1);
  };
  return (<>
    <GameShell score={Math.max(0, seq.length - (phase === 'play' || phase === 'show' ? 1 : 0))} scoreLabel="Round"
      best={best} bestLabel="Best round" onRestart={start}
      how="Cells flash in an order — repeat it exactly. The chain grows by one cell every round." />
    <div className="gseq-grid">
      {Array.from({ length: 9 }, (_, i) => (
        <button key={i} className={`gseq-cell ${flash === i ? 'lit' : ''}`} aria-label={`Cell ${i + 1}`}
          onClick={() => press(i)} />))}
    </div>
    <p className="dim sm" style={{ marginTop: 8 }}>
      {phase === 'show' ? 'Memorise the order…' : phase === 'play' ? `Your turn — step ${step + 1} of ${seq.length}` : phase === 'over' ? `Wrong cell. You reached round ${seq.length}.` : 'Press Start and watch the grid.'}
    </p>
    {phase === 'idle' || phase === 'over' ? (
      <button className="btn" style={{ width: '100%' }} onClick={start}><Icon n="play" size={15} /> {phase === 'over' ? 'Play again' : 'Start'}</button>) : null}
  </>);
}
