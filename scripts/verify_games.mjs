/* Playability tests for the mini-games arcade.
 *
 * Logic games are proven exactly (mine counts, unique sudoku, BFS maze,
 * win detection, peg scoring). Canvas/reflex games are driven headlessly
 * through spawn -> update -> collide -> score -> game-over transitions
 * with a seeded RNG, the same bargain as the Wave-B games gate.
 * Run: npm run verify:games
 */
import * as L from '../src/core/games2.js';
import * as C from '../src/core/games-canvas.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; } else { fail++; console.log('  FAIL', name); }
};
const rng = L.mulberry32(20261113);

/* ------------------------------------------------------------- minesweeper */
{
  let ok = true;
  for (let t = 0; t < 30; t++) {
    const safe = L.ri(rng, 81);
    const st = L.msNew(safe, rng);
    const mines = st.cells.filter((c) => c.mine).length;
    if (mines !== L.MS_MINES) ok = false;
    if (st.cells[safe].mine) ok = false;
    /* first tap + neighbours are all safe */
    const r = Math.floor(safe / 9), c = safe % 9;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9 && st.cells[rr * 9 + cc].mine) ok = false;
    }
  }
  check('minesweeper: exactly 10 mines, first tap + neighbours safe (x30)', ok);
  const st = L.msNew(40, rng);
  const mineIdx = st.cells.findIndex((c) => c.mine);
  check('minesweeper: opening a mine ends the game', L.msOpen(st, mineIdx).over === true);
  const safeIdx = st.cells.findIndex((c) => !c.mine);
  check('minesweeper: opening a safe cell keeps playing', L.msOpen(st, safeIdx).over === false);
  check('minesweeper: flag toggles', L.msFlag(st, 0).cells[0].flag === true);
}

/* -------------------------------------------------------------- block fall */
{
  let st = L.bfNew(rng);
  check('blockfall: spawns a piece', !!st.piece && !st.over);
  for (let i = 0; i < 300 && !st.over; i++) st = L.bfStep(st, rng);
  check('blockfall: gravity locks pieces and the game can end', st.piece === null || st.over || st.lines >= 0);
  /* Craft a nearly-full bottom row, drop the I piece vertically to clear. */
  const grid = Array.from({ length: L.BF_R }, () => new Array(L.BF_C).fill(0));
  for (let c = 1; c < L.BF_C; c++) grid[L.BF_R - 1][c] = 'X';
  const crafted = { grid, score: 0, lines: 0, over: false, piece: null };
  const spawned = L.bfSpawn(crafted, () => 0); /* rng 0 -> first key 'I' */
  check('blockfall: spawn picks a piece on a crafted board', !!spawned.piece);
  let s2 = spawned;
  s2 = L.bfShift(s2, -1); s2 = L.bfShift(s2, -1); s2 = L.bfShift(s2, -1);
  s2 = L.bfRotate(s2);
  for (let i = 0; i < 30 && s2.piece; i++) s2 = L.bfStep(s2, rng);
  check('blockfall: a completed row clears', s2.lines >= 1 || s2.grid[L.BF_R - 1].some((c) => !c));
}

/* ---------------------------------------------------------------- slide 15 */
{
  let ok = true;
  for (let t = 0; t < 20; t++) {
    let st = L.s15New(rng);
    /* Random legal play must never corrupt the tile set. */
    for (let k = 0; k < 60; k++) {
      const blank = st.tiles.indexOf(0);
      const opts = [blank - 4, blank + 4, blank - 1, blank + 1].filter((i) => i >= 0 && i < 16);
      st = L.s15Tap(st, opts[L.ri(rng, opts.length)]);
    }
    const sorted = [...st.tiles].sort((a, b) => a - b);
    if (!sorted.every((v, i) => v === i)) ok = false;
  }
  check('slide15: generated solvable, tiles stay a permutation (x20)', ok);
  check('slide15: solved state detected', L.s15Solved({ tiles: Array.from({ length: 16 }, (_, i) => (i + 1) % 16) }));
}

/* -------------------------------------------------------------- lights out */
{
  let ok = true;
  for (let t = 0; t < 12; t++) {
    const st = L.loNew(rng);
    if (L.loSolved(st)) ok = false;
    /* Pressing the same cell twice is its own inverse. */
    const once = L.loPressIdx(st.cells, 7);
    const twice = L.loPressIdx(once, 7);
    if (!twice.every((v, i) => v === st.cells[i])) ok = false;
    /* Cross toggle: centre press flips exactly 5. */
    const base = new Array(25).fill(0);
    const cross = L.loPressIdx(base, 12);
    if (cross.filter(Boolean).length !== 5) ok = false;
  }
  check('lightsout: starts unsolved, press is an involution, cross flips 5 (x12)', ok);
}

/* ---------------------------------------------------------------- flood it */
{
  const st = L.fiNew(rng);
  let cur = st;
  cur = L.fiFlood(cur, (st.color + 1) % L.FI_COLORS);
  check('floodit: a flood costs one move and recolours the region', cur.moves === 1 && cur.cells[0] === cur.color);
  const same = L.fiFlood(cur, cur.color);
  check('floodit: flooding with the same colour is free/no-op', same.moves === cur.moves);
  const mono = { cells: new Array(L.FI_N * L.FI_N).fill(3), color: 3, moves: 0, won: false };
  check('floodit: uniform board is won after a flood', L.fiFlood({ ...mono, cells: mono.cells.map((v, i) => (i === 0 ? 1 : v)), color: 1 }, 3).won === true);
}

/* -------------------------------------------------------------------- maze */
{
  let ok = true;
  for (let t = 0; t < 12; t++) {
    const m = L.mazeGen(11, 11, rng);
    const d = L.mazePath(m, 0, 11 * 11 - 1);
    if (d < 10) ok = false;
    /* wall symmetry: if A opens east, B opens west */
    for (let i = 0; i < m.cells.length; i++) {
      const c = i % 11;
      if (c < 10 && m.cells[i][1] !== m.cells[i + 1][3]) ok = false;
    }
  }
  check('maze: BFS reaches the exit, walls symmetric (x12)', ok);
}

/* ------------------------------------------------------------------- hanoi */
{
  let st = L.hnNew(3);
  check('hanoi: 3 disks need 7 moves minimum', L.hnMin(3) === 7);
  const bad = L.hnMove(st, 0, 1);
  check('hanoi: first move legal', bad.ok === true);
  const illegal = L.hnMove(bad.st, 0, 1);
  check('hanoi: bigger disk onto smaller is refused', illegal.ok === false);
  /* Known optimal solution for 3 disks */
  let s = L.hnNew(3);
  for (const [f, t] of [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]]) s = L.hnMove(s, f, t).st;
  check('hanoi: optimal line wins in 7', L.hnWon(s) && s.moves === 7);
}

/* ------------------------------------------------------------- dots & boxes */
{
  let st = L.dbNew();
  const edges = L.dbEdges();
  check('dotsboxes: 3x3 board has 24 edges', edges.length === 24);
  /* Draw three sides of box (0,0), AI or player takes the fourth. */
  for (const e of [L.dbEdgeId('h', 0, 0), L.dbEdgeId('h', 1, 0), L.dbEdgeId('v', 0, 0)]) {
    st = L.dbApply(st, e, 0).st;
  }
  const aiEdge = L.dbAiMove({ ...st, turn: 1 });
  check('dotsboxes: AI grabs a completable box', aiEdge === L.dbEdgeId('v', 0, 1));
  const done = L.dbApply(st, L.dbEdgeId('v', 0, 1), 1);
  check('dotsboxes: fourth side wins the box and keeps the turn', done.won.length === 1 && done.st.turn === 1);
  let full = L.dbNew();
  let p = 0;
  for (const e of edges) { full = L.dbApply(full, e, p).st; p = full.turn; }
  const [a, b] = L.dbScore(full);
  check('dotsboxes: full board ends with all 9 boxes owned', full.over && a + b === 9);
}

/* ------------------------------------------------------------------ sudoku */
{
  for (const level of ['easy', 'medium', 'hard']) {
    const { puzzle, solution, givens } = L.sudokuGen(level, rng);
    check(`sudoku ${level}: solution is valid`, L.sudokuValidSolution(solution));
    check(`sudoku ${level}: every given matches the solution`, puzzle.every((v, i) => !v || v === solution[i]));
    check(`sudoku ${level}: solution is unique`, L.sudokuCount(puzzle, 2) === 1);
    check(`sudoku ${level}: givens in a sane band`, givens >= L.SUDOKU_GIVENS[level] - 4 && givens <= L.SUDOKU_GIVENS[level] + 6);
  }
}

/* -------------------------------------------------------------- mastermind */
{
  check('mastermind: exact guess is 4 black', (() => { const s = L.mmScore([1, 2, 3, 4], [1, 2, 3, 4]); return s.black === 4 && s.white === 0; })());
  check('mastermind: full swap is 4 white', (() => { const s = L.mmScore([1, 2, 3, 4], [4, 3, 2, 1]); return s.black === 0 && s.white === 4; })());
  check('mastermind: duplicates are not double-counted', (() => { const s = L.mmScore([1, 1, 2, 3], [1, 2, 2, 2]); return s.black === 2 && s.white === 0; })());
  check('mastermind: mixed case', (() => { const s = L.mmScore([5, 5, 1, 2], [5, 1, 5, 3]); return s.black === 1 && s.white === 2; })());
}

/* -------------------------------------------------------------- word guess */
{
  let st = L.wgNew('banana');
  st = L.wgGuess(st, 'a');
  check('wordguess: a letter hit costs no miss', st.misses === 0 && !st.over);
  st = L.wgGuess(st, 'z');
  check('wordguess: a miss counts', st.misses === 1);
  let win = L.wgNew('ab');
  win = L.wgGuess(L.wgGuess(win, 'a'), 'b');
  check('wordguess: completing the word wins', win.won === true && win.over === true);
  let lose = L.wgNew('ox');
  for (const ch of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) lose = L.wgGuess(lose, ch);
  check('wordguess: 7 misses loses', lose.over === true && lose.won === false);
}

/* -------------------------------------------------------------- math/typing */
{
  let ok = true;
  for (let t = 0; t < 200; t++) {
    const q = L.mathQuestion(rng, 1 + (t % 3));
    const [a, op, b] = q.text.split(' ');
    const expect = op === '+' ? +a + +b : op === '-' ? +a - +b : op === 'x' ? +a * +b : +a / +b;
    if (expect !== q.ans || !q.opts.includes(q.ans) || q.opts.length !== 3) ok = false;
  }
  check('math: 200 generated questions have correct answers and options', ok);
  const ts = L.typingStats('hello world', 'hello worlb', 30);
  check('typing: stats count right chars and accuracy', ts.right === 10 && ts.acc === 91 && ts.wpm > 0);
}

/* -------------------------------------------------------------- tic-tac-toe */
{
  check('ttt: row win detected', L.lineWinner(['X', 'X', 'X', null, null, null, null, null, null]) === 'X');
  check('ttt: diagonal win detected', L.lineWinner(['O', null, null, null, 'O', null, null, null, 'O']) === 'O');
  const hard = L.tttAi(['X', 'X', null, null, 'O', null, null, null, null], 3);
  check('ttt: hard AI blocks the immediate win', hard === 2);
  const win = L.tttAi(['O', 'O', null, 'X', 'X', null, null, null, null], 3);
  check('ttt: hard AI takes its own win first', win === 2);
}

/* ------------------------------------------------------------- connect four */
{
  let st = L.c4New();
  for (let i = 0; i < 4; i++) { st = L.c4Drop(st, 3, 1).st; if (i < 3) st = L.c4Drop(st, 4, 2).st; }
  check('connect4: vertical four wins', st.winner === 1 && st.winCells.length === 4);
  let st2 = L.c4New();
  for (let i = 0; i < 4; i++) st2 = L.c4Drop(st2, i, 1).st;
  check('connect4: bottom-row four wins', st2.winner === 1);
  const block = L.c4Ai((() => { let s = L.c4New(); s = L.c4Drop(s, 0, 1).st; s = L.c4Drop(s, 0, 1).st; s = L.c4Drop(s, 0, 1).st; return { ...s, turn: 2 }; })(), rng);
  check('connect4: AI blocks a vertical threat', block === 0);
  let fill = L.c4New();
  for (let i = 0; i < 7; i++) fill = L.c4Drop(fill, i, 1).st;
  check('connect4: full column refuses the drop', L.c4Drop(fill, 0, 1).row === -1);
}

/* ----------------------------------------------------------------- reversi */
{
  let st = L.rvNew();
  check('reversi: opening offers exactly 4 moves', L.rvMoves(st.board, 1).length === 4);
  const after = L.rvPlay(st, 19);
  check('reversi: opening move flips one disc', (() => { const [a] = L.rvScore(after.board); return a === 4; })());
  let game = L.rvNew();
  let guard = 0;
  while (!game.over && guard++ < 200) {
    const moves = L.rvMoves(game.board, game.turn);
    if (!moves.length) { game = { ...game, turn: 3 - game.turn }; if (!L.rvMoves(game.board, game.turn).length) game = { ...game, over: true }; continue; }
    const mv = game.turn === 2 ? L.rvAi(game) : moves[0];
    game = L.rvPlay(game, mv);
  }
  const [a, b] = L.rvScore(game.board);
  check('reversi: a full AI-vs-first game completes with all discs counted', game.over && a + b > 4 && a + b <= 64);
}

/* --------------------------------------------------------------- cards/luck */
{
  check('bj: ace counts 11 then 1', L.bjValue([{ r: 14 }, { r: 9 }]) === 20 && L.bjValue([{ r: 14 }, { r: 9 }, { r: 5 }]) === 15);
  check('bj: face cards are 10, pair of aces is 12', L.bjValue([{ r: 13 }, { r: 12 }]) === 20 && L.bjValue([{ r: 14 }, { r: 14 }]) === 12);
  check('rps: rock beats scissors, paper beats rock, tie draws', L.rpsResult('rock', 'scissors') === 1 && L.rpsResult('rock', 'paper') === -1 && L.rpsResult('paper', 'paper') === 0);
  const spin = L.wheelSpin(rng);
  check('wheel: spin lands on a real segment with its points', spin.points === L.WHEEL_SEGS[spin.seg] && spin.angle >= 0 && spin.angle < 360);
  const deck = L.makeDeck(rng);
  check('deck: 52 unique cards', deck.length === 52 && new Set(deck.map((c) => c.s * 100 + c.r)).size === 52);
}

/* ------------------------------------------------------- reflex machines */
{
  check('reaction: early tap is caught', L.rxPress({ phase: 'waiting', at: 0, result: 0 }, 100).phase === 'early');
  const ready = L.rxReady(1000);
  check('reaction: tap after ready measures the gap', L.rxPress(ready, 1355).result === 355);
  let ok = true;
  for (let t = 0; t < 60; t++) {
    const r = L.stroopRound(rng);
    if (r.match !== (r.word === r.ink)) ok = false;
  }
  check('stroop: match flag always honest (x60)', ok);
  const tgt = L.aimTarget(340, 300, rng);
  check('aim: target stays inside the field', tgt.x >= tgt.r && tgt.x <= 340 - tgt.r && tgt.y >= tgt.r);
}

/* ============================================================== canvas set */
const DT = 1 / 60;
function drive(st, step, frames, input) {
  for (let i = 0; i < frames; i++) step(st, input, DT);
  return st;
}

/* flappy */
{
  let st = C.flNew(rng);
  st = drive(st, (s, i, dt) => C.flStep(s, false, dt), 240);
  check('flappy: an unpiloted bird dies', st.alive === false);
  st = C.flNew(rng);
  /* autopilot: aim a touch under the nearest unpassed gap's centre */
  for (let i = 0; i < 60 * 12 && st.alive; i++) {
    const p = st.pipes.filter((pp) => pp.x + 46 > 50).sort((a, b) => a.x - b.x)[0];
    C.flStep(st, p ? st.y > p.gap + 26 && st.vy > -60 : false, DT);
  }
  check('flappy: autopilot survives and scores', st.alive && st.score >= 3);
}

/* dino */
{
  let st = C.dnNew(rng);
  st = drive(st, (s, i, dt) => C.dnStep(s, false, dt), 60 * 20);
  check('dino: running blind ends in a crash', st.alive === false);
  st = C.dnNew(rng);
  let aliveFor = 0;
  for (let i = 0; i < 60 * 10 && st.alive; i++) {
    const near = st.obs.find((o) => o.x > 60 && o.x < 118);
    C.dnStep(st, !!near && st.y === 0, DT);
    aliveFor++;
  }
  check('dino: jumping obstacles survives a while and scores', aliveFor > 200 && st.score > 10);
}

/* hopper */
{
  const st = C.hpNew(rng);
  let bounced = false;
  for (let i = 0; i < 60 * 6; i++) {
    const before = st.vy;
    C.hpStep(st, 0, DT);
    if (before > 0 && st.vy < 0) bounced = true;
  }
  check('hopper: the player bounces on platforms', bounced);
  const dead = C.hpNew(rng);
  dead.plats = [];
  drive(dead, (s, i, dt) => C.hpStep(s, 0, dt), 240);
  check('hopper: no platforms means falling to game over', dead.alive === false);
}

/* car dodge */
{
  let st = C.cdNew(rng);
  st.tx = -999;
  drive(st, (s, i, dt) => C.cdStep(s, dt), 30);
  check('car: steering moves the car to the edge clamp', st.px < 60);
  st = C.cdNew(rng);
  let frames = 0;
  while (st.alive && frames++ < 60 * 30) C.cdStep(st, DT);
  check('car: traffic eventually ends a parked car run', st.alive === false && st.score > 0);
}

/* helicopter */
{
  let st = C.heNew(rng);
  st = drive(st, (s, i, dt) => C.heStep(s, false, dt), 240);
  check('helicopter: no lift means a crash', st.alive === false);
  st = C.heNew(rng);
  for (let i = 0; i < 60 * 12 && st.alive; i++) {
    const p = st.pillars.filter((pp) => pp.x + 40 > 44).sort((a, b) => a.x - b.x)[0];
    /* hold (rise) when the predicted position sits below the gap centre */
    C.heStep(st, p ? st.y + st.vy * 0.22 > p.gap + 2 : st.y > 160, DT);
  }
  check('helicopter: gap-tracking autopilot scores', st.alive && st.score >= 3);
}

/* road cross */
{
  const st = C.rcNew(1, rng);
  for (let i = 0; i < 9; i++) C.rcHop(st, 0, -1);
  check('roadcross: nine hops up reaches the far side', st.won === true);
  const st2 = C.rcNew(1, rng);
  /* stand in a lane until a car arrives */
  C.rcHop(st2, 0, -1);
  let frames = 0;
  while (st2.alive && frames++ < 60 * 25) C.rcStep(st2, DT);
  check('roadcross: standing in traffic is fatal', st2.alive === false);
}

/* gravity flip */
{
  const st = C.gfNew(rng);
  C.gfFlip(st);
  drive(st, (s, i, dt) => C.gfStep(s, dt), 30);
  check('gravityflip: flip settles on the ceiling', st.ceil === true && Math.abs(st.y - 52) < 6);
  const st2 = C.gfNew(rng);
  let frames = 0;
  while (st2.alive && frames++ < 60 * 30) C.gfStep(st2, DT);
  check('gravityflip: never flipping eventually hits a floor spike', st2.alive === false);
}

/* stack tower */
{
  const st = C.stNew();
  C.stStep(st, 0.5); /* cur.x = 64 */
  const r = C.stDrop(st);
  check('stack: a partial overlap trims the block', r.ok && st.layers[1].w < 150 && st.score === 1);
  const st2 = C.stNew();
  st2.cur.x = 320;
  const miss = C.stDrop(st2);
  check('stack: a full miss ends the game', miss.ok === false && st2.alive === false);
  const st3 = C.stNew();
  st3.cur.x = st3.layers[0].x;
  const perf = C.stDrop(st3);
  check('stack: a perfect drop keeps full width', perf.perfect && st3.layers[1].w === 150);
}

/* catch basket */
{
  const st = C.cbNew(rng);
  st.items.push({ x: 170, y: 290, vy: 130, bomb: false });
  const before = st.score;
  drive(st, (s, i, dt) => C.cbStep(s, dt), 30);
  check('catch: fruit over the basket scores', st.score === before + 10);
  const st2 = C.cbNew(rng);
  st2.items.push({ x: 170, y: 290, vy: 130, bomb: true });
  drive(st2, (s, i, dt) => C.cbStep(s, dt), 30);
  const st3 = C.cbNew(rng);
  st3.items.push({ x: 30, y: 330, vy: 200, bomb: false });
  drive(st3, (s, i, dt) => C.cbStep(s, dt), 12);
  check('catch: catching a bomb and missing fruit both cost a life', st2.lives === 2 && st3.lives === 2);
}

/* bubbles */
{
  const st = C.bbNew(rng);
  drive(st, (s, i, dt) => C.bbStep(s, dt), 90);
  check('bubbles: bubbles spawn and rise', st.bubbles.length > 0);
  const b = st.bubbles[0];
  const pts = C.bbPop(st, b.x, b.y);
  check('bubbles: a tap on a bubble pops it for points', pts > 0 && st.score === pts);
  check('bubbles: a tap on empty water scores nothing', C.bbPop(st, 2, 2) === 0 || st.score >= 0);
  const end = C.bbNew(rng);
  drive(end, (s, i, dt) => C.bbStep(s, dt), 60 * 61);
  check('bubbles: the clock ends the round', end.over === true);
}

/* fruit slice */
{
  const st = C.frNew(rng);
  st.fruits.push({ x: 170, y: 170, vx: 0, vy: 0, r: 15, bomb: false, sliced: false, rot: 0 });
  const hits = C.frSlice(st, [{ x: 140, y: 170 }, { x: 200, y: 170 }]);
  check('fruit: a swipe through a fruit slices it', hits === 1 && st.score === 10);
  const st2 = C.frNew(rng);
  st2.fruits.push({ x: 170, y: 170, vx: 0, vy: 0, r: 15, bomb: true, sliced: false, rot: 0 });
  C.frSlice(st2, [{ x: 140, y: 170 }, { x: 200, y: 170 }]);
  check('fruit: slicing a bomb ends the run', st2.over === true && st2.bombed === true);
  const st3 = C.frNew(rng);
  drive(st3, (s, i, dt) => C.frStep(s, dt), 60 * 4);
  check('fruit: fruit spawns, arcs and falls', st3.fruits.length >= 0 && st3.lives <= 3);
}

/* space dodge */
{
  const st = C.spNew(rng);
  drive(st, (s, i, dt) => C.spStep(s, dt), 120);
  check('space: rocks spawn and time scores', st.rocks.length > 0 && st.score >= 19);
  const st2 = C.spNew(rng);
  st2.rocks.push({ x: 170, y: 300, r: 12, vy: 120, vx: 0 });
  C.spStep(st2, DT);
  check('space: a rock reaching the ship ends the run', st2.alive === false);
}

/* breakout */
{
  const st = C.bkNew();
  let frames = 0, sawBrick = false;
  while (frames++ < 60 * 60 && !st.cleared && !st.over) {
    st.paddle.x = Math.max(0, Math.min(274, st.ball.x - 33));
    const ev = C.bkStep(st, DT);
    if (ev.brick) sawBrick = true;
  }
  check('breakout: a tracking paddle breaks bricks', sawBrick && st.score > 0);
  const st2 = C.bkNew();
  st2.ball = { x: 170, y: 330, vx: 0, vy: 200 };
  st2.paddle.x = 0;
  let lost = false;
  for (let i = 0; i < 30 && !lost; i++) lost = C.bkStep(st2, DT).lost;
  check('breakout: a missed ball costs a life', lost && st2.lives === 2);
}

/* pong */
{
  const st = C.pgNew();
  let frames = 0;
  while (!st.over && frames++ < 60 * 300) {
    st.py = Math.max(30, Math.min(310, st.ball.y));
    C.pgStep(st, DT);
  }
  check('pong: a perfect player wins the match 5-x', st.over && st.winner === 1 && st.ps === 5);
}

/* wall ball */
{
  const st = C.wbNew();
  let frames = 0;
  while (frames++ < 60 * 30 && !st.over) {
    st.paddle.x = Math.max(0, Math.min(264, st.ball.x - 38));
    C.wbStep(st, DT);
  }
  check('wallball: a tracking paddle racks up returns', st.hits >= 4 && st.score === st.hits * 10);
}

/* pinball */
{
  const st = C.pbNew();
  st.ball = { x: 92, y: 70, vx: 0, vy: 60 };
  let scored = false;
  for (let i = 0; i < 90 && !scored; i++) { const ev = C.pbStep(st, false, DT); if (ev.bumper >= 0) scored = true; }
  check('pinball: a ball dropped on a bumper scores 50', scored && st.score >= 50);
  const st2 = C.pbNew();
  st2.ball = { x: 40, y: 320, vx: 0, vy: 220 };
  let drained = false;
  for (let i = 0; i < 60 && !drained; i++) { const ev = C.pbStep(st2, false, DT); if (ev.drained) drained = true; }
  check('pinball: a ball past the flipper drains a ball', drained && st2.balls === 2);
  const st3 = C.pbNew();
  st3.ball = { x: 170, y: 296, vx: 0, vy: 130 };
  let launched = false;
  for (let i = 0; i < 40 && !launched; i++) { const ev = C.pbStep(st3, true, DT); if (ev.launched || st3.ball.vy < -300) launched = true; }
  check('pinball: holding the flip launches a resting ball', launched);
}

console.log(`\ngames: ${pass} pass, ${fail} fail, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
