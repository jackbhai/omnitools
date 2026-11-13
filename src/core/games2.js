/**
 * Pure logic for the mini-games arcade (part 2) — no DOM, no React.
 *
 * Same bargain as core/games.js: every rule that can be wrong lives here
 * where a plain script can prove it — mine counts and first-tap safety,
 * a sudoku whose solution is valid and unique, maze solvability by BFS,
 * win detection on the board games, mastermind peg scoring, hanoi rules.
 * The screens in tools/games-*.jsx stay thin renderers over these.
 */

/* ------------------------------------------------------------------- rng */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const ri = (rng, n) => Math.floor(rng() * n);
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ----------------------------------------------------------- minesweeper */
export const MS_R = 9, MS_C = 9, MS_MINES = 10;

export function msNew(safeIdx, rng = Math.random) {
  const total = MS_R * MS_C;
  const banned = new Set([safeIdx]);
  const sr = Math.floor(safeIdx / MS_C), sc = safeIdx % MS_C;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = sr + dr, c = sc + dc;
    if (r >= 0 && r < MS_R && c >= 0 && c < MS_C) banned.add(r * MS_C + c);
  }
  const spots = [];
  for (let i = 0; i < total; i++) if (!banned.has(i)) spots.push(i);
  const mines = new Set(shuffle(spots, rng).slice(0, MS_MINES));
  const cells = [];
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / MS_C), c = i % MS_C;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < MS_R && cc >= 0 && cc < MS_C && mines.has(rr * MS_C + cc)) n++;
    }
    cells.push({ mine: mines.has(i), n, open: false, flag: false });
  }
  return { cells, mines: MS_MINES, over: false, won: false, started: true };
}

export function msOpen(st, idx) {
  const cell = st.cells[idx];
  if (st.over || st.won || !cell || cell.open || cell.flag) return st;
  const cells = st.cells.map((c) => ({ ...c }));
  if (cells[idx].mine) {
    cells.forEach((c) => { if (c.mine) c.open = true; });
    return { ...st, cells, over: true };
  }
  const stack = [idx];
  cells[idx].open = true;
  while (stack.length) {
    const i = stack.pop();
    if (cells[i].n !== 0) continue;
    const r = Math.floor(i / MS_C), c = i % MS_C;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= MS_R || cc < 0 || cc >= MS_C) continue;
      const j = rr * MS_C + cc;
      if (!cells[j].open && !cells[j].mine && !cells[j].flag) { cells[j].open = true; stack.push(j); }
    }
  }
  const opened = cells.filter((c) => c.open).length;
  const won = opened === MS_R * MS_C - st.mines;
  return { ...st, cells, won };
}

export function msFlag(st, idx) {
  if (st.over || st.won || st.cells[idx].open) return st;
  const cells = st.cells.map((c, i) => (i === idx ? { ...c, flag: !c.flag } : c));
  return { ...st, cells };
}

/* ------------------------------------------------------------- block fall */
export const BF_C = 10, BF_R = 18;
const BF_SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
export const BF_KEYS = Object.keys(BF_SHAPES);

function bfCollide(grid, shape, px, py) {
  for (let y = 0; y < shape.length; y++) for (let x = 0; x < shape[y].length; x++) {
    if (!shape[y][x]) continue;
    const gx = px + x, gy = py + y;
    if (gx < 0 || gx >= BF_C || gy >= BF_R) return true;
    if (gy >= 0 && grid[gy][gx]) return true;
  }
  return false;
}

export function bfSpawn(st, rng = Math.random) {
  const key = BF_KEYS[ri(rng, BF_KEYS.length)];
  const shape = BF_SHAPES[key].map((r) => [...r]);
  const piece = { key, shape, x: Math.floor((BF_C - shape[0].length) / 2), y: key === 'I' ? -1 : 0 };
  if (bfCollide(st.grid, shape, piece.x, piece.y)) return { ...st, over: true, piece: null };
  return { ...st, piece };
}

export function bfNew(rng = Math.random) {
  const grid = Array.from({ length: BF_R }, () => new Array(BF_C).fill(0));
  return bfSpawn({ grid, score: 0, lines: 0, over: false, piece: null }, rng);
}

export function bfShift(st, dx) {
  if (!st.piece || st.over) return st;
  const p = st.piece;
  if (bfCollide(st.grid, p.shape, p.x + dx, p.y)) return st;
  return { ...st, piece: { ...p, x: p.x + dx } };
}

export function bfRotate(st) {
  if (!st.piece || st.over) return st;
  const p = st.piece;
  const n = p.shape.length;
  const rot = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => p.shape[n - 1 - x][y]));
  for (const off of [0, -1, 1, -2, 2]) {
    if (!bfCollide(st.grid, rot, p.x + off, p.y)) return { ...st, piece: { ...p, shape: rot, x: p.x + off } };
  }
  return st;
}

export function bfStep(st, rng = Math.random) {
  if (!st.piece || st.over) return st;
  const p = st.piece;
  if (!bfCollide(st.grid, p.shape, p.x, p.y + 1)) {
    return { ...st, piece: { ...p, y: p.y + 1 } };
  }
  const grid = st.grid.map((r) => [...r]);
  p.shape.forEach((row, y) => row.forEach((v, x) => {
    if (v && p.y + y >= 0) grid[p.y + y][p.x + x] = p.key;
  }));
  const kept = grid.filter((r) => r.some((c) => !c));
  const cleared = BF_R - kept.length;
  while (kept.length < BF_R) kept.unshift(new Array(BF_C).fill(0));
  const pts = [0, 100, 300, 500, 800][cleared] || 0;
  return bfSpawn({ ...st, grid: kept, score: st.score + pts, lines: st.lines + cleared, piece: null }, rng);
}

export function bfDrop(st, rng = Math.random) {
  let cur = st, guard = 0;
  while (cur.piece && !cur.over && guard++ < BF_R + 4) {
    const before = cur.piece;
    cur = bfStep(cur, rng);
    if (cur.piece !== before && cur.piece && cur.piece.y === before.y) break;
    if (!cur.piece) break;
  }
  return cur;
}

/* -------------------------------------------------------------- slide 15 */
export function s15New(rng = Math.random) {
  let tiles = Array.from({ length: 16 }, (_, i) => (i + 1) % 16);
  /* Walk the blank with legal moves from solved: always solvable. */
  let blank = 15;
  let last = -1;
  for (let k = 0; k < 120; k++) {
    const r = Math.floor(blank / 4), c = blank % 4;
    const opts = [];
    if (r > 0) opts.push(blank - 4);
    if (r < 3) opts.push(blank + 4);
    if (c > 0) opts.push(blank - 1);
    if (c < 3) opts.push(blank + 1);
    const pickFrom = opts.filter((o) => o !== last);
    const pick = pickFrom[ri(rng, pickFrom.length)];
    last = blank;
    [tiles[blank], tiles[pick]] = [tiles[pick], tiles[blank]];
    blank = pick;
  }
  return { tiles, moves: 0 };
}
export function s15Tap(st, idx) {
  const blank = st.tiles.indexOf(0);
  const r = Math.floor(idx / 4), c = idx % 4, br = Math.floor(blank / 4), bc = blank % 4;
  if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return st;
  const tiles = [...st.tiles];
  [tiles[blank], tiles[idx]] = [tiles[idx], tiles[blank]];
  return { tiles, moves: st.moves + 1 };
}
export const s15Solved = (st) => st.tiles.every((v, i) => v === (i + 1) % 16);

/* ------------------------------------------------------------- lights out */
export const LO_N = 5;
export function loPressIdx(cells, idx) {
  const out = [...cells];
  const r = Math.floor(idx / LO_N), c = idx % LO_N;
  const flip = (i) => { out[i] = out[i] ? 0 : 1; };
  flip(idx);
  if (r > 0) flip(idx - LO_N);
  if (r < LO_N - 1) flip(idx + LO_N);
  if (c > 0) flip(idx - 1);
  if (c < LO_N - 1) flip(idx + 1);
  return out;
}
export function loNew(rng = Math.random) {
  /* Press random cells onto a dark board: solvable by construction. */
  let cells = new Array(LO_N * LO_N).fill(0);
  const presses = 8 + ri(rng, 5);
  for (let k = 0; k < presses; k++) cells = loPressIdx(cells, ri(rng, LO_N * LO_N));
  if (cells.every((v) => !v)) return loNew(rng);
  return { cells, moves: 0 };
}
export const loSolved = (st) => st.cells.every((v) => !v);

/* --------------------------------------------------------------- flood it */
export const FI_N = 12, FI_COLORS = 6, FI_MAX = 25;
export function fiNew(rng = Math.random) {
  const cells = Array.from({ length: FI_N * FI_N }, () => ri(rng, FI_COLORS));
  return { cells, color: cells[0], moves: 0, won: false };
}
export function fiFlood(st, color) {
  if (st.won || color === st.color || st.moves >= FI_MAX) return st;
  const cells = [...st.cells];
  const from = st.color;
  const stack = [0];
  const seen = new Set([0]);
  while (stack.length) {
    const i = stack.pop();
    cells[i] = color;
    const r = Math.floor(i / FI_N), c = i % FI_N;
    const nb = [];
    if (r > 0) nb.push(i - FI_N);
    if (r < FI_N - 1) nb.push(i + FI_N);
    if (c > 0) nb.push(i - 1);
    if (c < FI_N - 1) nb.push(i + 1);
    for (const j of nb) if (!seen.has(j) && st.cells[j] === from) { seen.add(j); stack.push(j); }
  }
  const moves = st.moves + 1;
  return { cells, color, moves, won: cells.every((v) => v === color) };
}

/* ------------------------------------------------------------------- maze */
export function mazeGen(cols, rows, rng = Math.random) {
  /* Cells carry walls [N,E,S,W]; recursive backtracker carves a perfect maze. */
  const cells = Array.from({ length: cols * rows }, () => [1, 1, 1, 1]);
  const seen = new Array(cols * rows).fill(false);
  const stack = [0];
  seen[0] = true;
  const DIRS = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cx = cur % cols, cy = Math.floor(cur / cols);
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && nx < cols && ny >= 0 && ny < rows && !seen[ny * cols + nx];
    });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, wall] = opts[ri(rng, opts.length)];
    const nxt = (cy + dy) * cols + (cx + dx);
    cells[cur][wall] = 0;
    cells[nxt][(wall + 2) % 4] = 0;
    seen[nxt] = true;
    stack.push(nxt);
  }
  return { cols, rows, cells };
}
export function mazePath(maze, from, to) {
  /* BFS — also the solvability proof. Returns step count or -1. */
  const { cols, rows, cells } = maze;
  const dist = new Array(cols * rows).fill(-1);
  dist[from] = 0;
  const q = [from];
  const DIRS = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) return dist[cur];
    const cx = cur % cols, cy = Math.floor(cur / cols);
    for (const [dx, dy, wall] of DIRS) {
      if (cells[cur][wall]) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const n = ny * cols + nx;
      if (dist[n] === -1) { dist[n] = dist[cur] + 1; q.push(n); }
    }
  }
  return -1;
}
export function mazeCanMove(maze, pos, dir) {
  /* dir: 0 N, 1 E, 2 S, 3 W */
  return maze.cells[pos][dir] === 0;
}

/* ------------------------------------------------------------------ hanoi */
export function hnNew(disks = 4) { return { pegs: [Array.from({ length: disks }, (_, i) => disks - i), [], []], moves: 0, disks }; }
export function hnMove(st, from, to) {
  if (from === to) return { st, ok: false };
  const pegs = st.pegs.map((p) => [...p]);
  const disk = pegs[from][pegs[from].length - 1];
  if (disk === undefined) return { st, ok: false };
  const top = pegs[to][pegs[to].length - 1];
  if (top !== undefined && top < disk) return { st, ok: false };
  pegs[to].push(pegs[from].pop());
  return { st: { ...st, pegs, moves: st.moves + 1 }, ok: true };
}
export const hnWon = (st) => st.pegs[2].length === st.disks;
export const hnMin = (disks) => 2 ** disks - 1;

/* ------------------------------------------------------------ dots & boxes */
export const DB_N = 3; /* 3x3 boxes */
export const dbEdgeId = (t, r, c) => `${t}${r},${c}`;
export function dbEdges() {
  const out = [];
  for (let r = 0; r <= DB_N; r++) for (let c = 0; c < DB_N; c++) out.push(dbEdgeId('h', r, c));
  for (let r = 0; r < DB_N; r++) for (let c = 0; c <= DB_N; c++) out.push(dbEdgeId('v', r, c));
  return out;
}
export function dbNew() { return { taken: {}, boxes: {}, turn: 0, over: false }; }
function dbBoxEdges(br, bc) {
  return [dbEdgeId('h', br, bc), dbEdgeId('h', br + 1, bc), dbEdgeId('v', br, bc), dbEdgeId('v', br, bc + 1)];
}
export function dbApply(st, edge, player) {
  if (st.taken[edge] || st.over) return { st, won: [] };
  const taken = { ...st.taken, [edge]: player };
  const boxes = { ...st.boxes };
  const won = [];
  for (let br = 0; br < DB_N; br++) for (let bc = 0; bc < DB_N; bc++) {
    const k = br + ',' + bc;
    if (boxes[k] !== undefined) continue;
    if (dbBoxEdges(br, bc).every((e) => taken[e] !== undefined)) { boxes[k] = player; won.push(k); }
  }
  const over = Object.keys(boxes).length === DB_N * DB_N;
  return { st: { taken, boxes, turn: won.length ? player : 1 - player, over }, won };
}
export function dbAiMove(st) {
  const free = dbEdges().filter((e) => st.taken[e] === undefined);
  if (!free.length) return null;
  for (const e of free) { const { won } = dbApply(st, e, 1); if (won.length) return e; }
  const safe = free.filter((e) => {
    /* An edge is safe if it never leaves a box one edge from done for the rival. */
    const taken = { ...st.taken, [e]: 1 };
    for (let br = 0; br < DB_N; br++) for (let bc = 0; bc < DB_N; bc++) {
      if (st.boxes[br + ',' + bc] !== undefined) continue;
      const n = dbBoxEdges(br, bc).filter((x) => taken[x] !== undefined).length;
      if (n === 3) return false;
    }
    return true;
  });
  const pool = safe.length ? safe : free;
  return pool[Math.floor(Math.random() * pool.length)];
}
export const dbScore = (st) => {
  let a = 0, b = 0;
  Object.values(st.boxes).forEach((p) => { if (p === 0) a++; else b++; });
  return [a, b];
};

/* ----------------------------------------------------------------- sudoku */
function sudokuFull(rng) {
  const b = new Array(81).fill(0);
  const ok = (i, v) => {
    const r = Math.floor(i / 9), c = i % 9;
    for (let k = 0; k < 9; k++) {
      if (b[r * 9 + k] === v || b[k * 9 + c] === v) return false;
      const br = Math.floor(r / 3) * 3 + Math.floor(k / 3), bc = Math.floor(c / 3) * 3 + (k % 3);
      if (b[br * 9 + bc] === v) return false;
    }
    return true;
  };
  const fill = (i) => {
    if (i === 81) return true;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (ok(i, v)) { b[i] = v; if (fill(i + 1)) return true; b[i] = 0; }
    }
    return false;
  };
  fill(0);
  return b;
}
export function sudokuCount(board, limit = 2) {
  const b = [...board];
  let count = 0;
  const ok = (i, v) => {
    const r = Math.floor(i / 9), c = i % 9;
    for (let k = 0; k < 9; k++) {
      if (b[r * 9 + k] === v || b[k * 9 + c] === v) return false;
      const br = Math.floor(r / 3) * 3 + Math.floor(k / 3), bc = Math.floor(c / 3) * 3 + (k % 3);
      if (b[br * 9 + bc] === v) return false;
    }
    return true;
  };
  const go = (i) => {
    if (count >= limit) return;
    if (i === 81) { count++; return; }
    if (b[i]) { go(i + 1); return; }
    for (let v = 1; v <= 9; v++) {
      if (ok(i, v)) { b[i] = v; go(i + 1); b[i] = 0; if (count >= limit) return; }
    }
  };
  go(0);
  return count;
}
export const SUDOKU_GIVENS = { easy: 42, medium: 34, hard: 28 };
export function sudokuGen(level = 'easy', rng = Math.random) {
  const solution = sudokuFull(rng);
  const puzzle = [...solution];
  const target = SUDOKU_GIVENS[level] ?? 38;
  let givens = 81;
  for (const i of shuffle([...Array(81).keys()], rng)) {
    if (givens <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (sudokuCount(puzzle, 2) !== 1) { puzzle[i] = keep; continue; }
    givens--;
  }
  return { puzzle, solution, givens };
}
export const sudokuValidSolution = (b) => {
  const want = '123456789';
  const norm = (arr) => [...arr].sort().join('');
  for (let k = 0; k < 9; k++) {
    if (norm(b.slice(k * 9, k * 9 + 9)) !== want) return false;
    if (norm(Array.from({ length: 9 }, (_, i) => b[i * 9 + k])) !== want) return false;
    const br = Math.floor(k / 3) * 3, bc = (k % 3) * 3;
    const box = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) box.push(b[(br + dr) * 9 + bc + dc]);
    if (norm(box) !== want) return false;
  }
  return true;
};

/* ------------------------------------------------------------- mastermind */
export const MM_COLORS = 6, MM_PEGS = 4;
export function mmSecret(rng = Math.random) {
  return Array.from({ length: MM_PEGS }, () => ri(rng, MM_COLORS));
}
export function mmScore(secret, guess) {
  let black = 0;
  const sLeft = [], gLeft = [];
  secret.forEach((v, i) => { if (v === guess[i]) black++; else { sLeft.push(v); gLeft.push(guess[i]); } });
  let white = 0;
  const pool = [...sLeft];
  for (const v of gLeft) {
    const at = pool.indexOf(v);
    if (at >= 0) { white++; pool.splice(at, 1); }
  }
  return { black, white };
}

/* ------------------------------------------------------------- word guess */
export const WG_WORDS_EN = ['planet', 'guitar', 'window', 'bridge', 'garden', 'silver', 'monkey', 'pocket', 'rocket', 'market', 'yellow', 'purple', 'winter', 'summer', 'camera', 'banana', 'orange', 'school', 'friend', 'travel', 'jungle', 'pencil', 'hammer', 'castle', 'dragon', 'forest', 'river', 'mountain', 'picture', 'kitchen', 'blanket', 'thunder', 'village', 'captain', 'diamond', 'harbour', 'lantern', 'morning', 'evening', 'bicycle'];
export const WG_WORDS_HINGLISH = ['mohabbat', 'zindagi', 'khushboo', 'baarish', 'chaandni', 'sitara', 'duniya', 'safar', 'manzil', 'raasta', 'mohalla', 'bazaar', 'khana', 'paani', 'chawal', 'mithaas', 'dosti', 'yaadein', 'sapna', 'ummeed', 'roshni', 'hawa', 'baadal', 'nadiya', 'pahad', 'gaon', 'shehar', 'daftar', 'kitab', 'kalam', 'tasveer', 'awaaz', 'geet', 'naach', 'khushi', 'muskurahat', 'chunri', 'pagdi', 'angoothi', 'payal'];
export const WG_MAX_MISS = 7;
export function wgGuess(st, letter) {
  if (st.over || st.guessed.includes(letter)) return st;
  const guessed = [...st.guessed, letter];
  const hit = st.word.includes(letter);
  const misses = st.misses + (hit ? 0 : 1);
  const won = [...st.word].every((ch) => guessed.includes(ch));
  return { ...st, guessed, misses, over: won || misses >= WG_MAX_MISS, won };
}
export const wgNew = (word) => ({ word, guessed: [], misses: 0, over: false, won: false });

/* ------------------------------------------------------------ math sprint */
export function mathQuestion(rng = Math.random, level = 1) {
  const ops = ['+', '-', 'x', '/'];
  const op = ops[ri(rng, level >= 3 ? 4 : 3)];
  let a, b, ans;
  if (op === '+') { a = ri(rng, 40 * level) + 2; b = ri(rng, 40 * level) + 2; ans = a + b; }
  else if (op === '-') { a = ri(rng, 50 * level) + 5; b = ri(rng, a); ans = a - b; }
  else if (op === 'x') { a = ri(rng, 9 + level * 2) + 2; b = ri(rng, 9) + 2; ans = a * b; }
  else { b = ri(rng, 9) + 2; ans = ri(rng, 12) + 2; a = b * ans; }
  const opts = new Set([ans]);
  while (opts.size < 3) opts.add(ans + (ri(rng, 11) - 5 || 3));
  return { text: `${a} ${op} ${b}`, ans, opts: shuffle([...opts], rng) };
}

/* ----------------------------------------------------------------- typing */
export const TYPIING_LINES = [
  'the quick brown fox jumps over the lazy dog',
  'practice makes a person perfect in every skill',
  'a journey of a thousand miles begins with one step',
  'honesty is the best policy in life and work',
  'the sun rises in the east and sets in the west',
  'knowledge grows when shared with good friends',
  'small steps every day lead to big changes',
  'time and tide wait for no one in this world',
];
export function typingStats(target, typed, seconds) {
  let right = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) right++;
  const acc = typed.length ? Math.round((right / typed.length) * 100) : 100;
  const wpm = seconds > 0 ? Math.round((right / 5) / (seconds / 60)) : 0;
  return { wpm, acc, right };
}

/* ------------------------------------------------------------- tic-tac-toe */
export const WIN_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function lineWinner(board, lines = WIN_LINES) {
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}
export function tttAi(board, level, rng = Math.random) {
  const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return -1;
  const winMove = (who) => {
    for (const i of free) {
      const b = [...board]; b[i] = who;
      if (lineWinner(b) === who) return i;
    }
    return -1;
  };
  if (level >= 2) {
    const w = winMove('O');
    if (w >= 0) return w;
    const block = winMove('X');
    if (block >= 0) return block;
  }
  if (level >= 3) {
    const mm = (b, isMax, depth) => {
      const w = lineWinner(b);
      if (w === 'O') return 10 - depth;
      if (w === 'X') return depth - 10;
      if (b.every(Boolean)) return 0;
      let best = isMax ? -99 : 99;
      b.forEach((v, i) => {
        if (v) return;
        b[i] = isMax ? 'O' : 'X';
        const s = mm(b, !isMax, depth + 1);
        b[i] = null;
        best = isMax ? Math.max(best, s) : Math.min(best, s);
      });
      return best;
    };
    let bestI = free[0], bestS = -99;
    for (const i of free) {
      const b = [...board]; b[i] = 'O';
      const s = mm(b, false, 0);
      if (s > bestS) { bestS = s; bestI = i; }
    }
    return bestI;
  }
  if (level >= 2 && board[4] === null) return 4;
  return free[ri(rng, free.length)];
}

/* ------------------------------------------------------------ connect four */
export const C4_C = 7, C4_R = 6;
export const c4New = () => ({ grid: new Array(C4_C * C4_R).fill(0), turn: 1, over: false, winner: 0, winCells: [] });
export function c4Drop(st, col, player = st.turn) {
  if (st.over || col < 0 || col >= C4_C) return { st, row: -1 };
  let row = -1;
  for (let r = C4_R - 1; r >= 0; r--) if (!st.grid[r * C4_C + col]) { row = r; break; }
  if (row < 0) return { st, row: -1 };
  const grid = [...st.grid];
  grid[row * C4_C + col] = player;
  const winCells = c4WinFrom(grid, row, col, player);
  return {
    st: { grid, turn: player === 1 ? 2 : 1, over: !!winCells || grid.every(Boolean), winner: winCells ? player : 0, winCells: winCells || [] },
    row,
  };
}
export function c4WinFrom(grid, row, col, player) {
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [[row, col]];
    for (const sgn of [1, -1]) {
      let r = row + dr * sgn, c = col + dc * sgn;
      while (r >= 0 && r < C4_R && c >= 0 && c < C4_C && grid[r * C4_C + c] === player) {
        cells.push([r, c]); r += dr * sgn; c += dc * sgn;
      }
    }
    if (cells.length >= 4) return cells.slice(0, 4).map(([r, c]) => r * C4_C + c);
  }
  return null;
}
export function c4Ai(st, rng = Math.random) {
  const legal = [];
  for (let c = 0; c < C4_C; c++) if (!st.grid[c]) legal.push(c);
  if (!legal.length) return -1;
  for (const c of legal) { const { st: s2 } = c4Drop(st, c, 2); if (s2.winner === 2) return c; }
  for (const c of legal) { const { st: s2 } = c4Drop(st, c, 1); if (s2.winner === 1) return c; }
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => legal.includes(c));
  let best = order[0], bestScore = -1e9;
  for (const c of order) {
    const { st: s2 } = c4Drop(st, c, 2);
    let score = 0;
    for (let r = 0; r < C4_R; r++) for (let cc = 0; cc < C4_C; cc++) {
      if (!s2.grid[r * C4_C + cc]) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let mine = 0, empty = 0, theirs = 0;
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, ccc = cc + dc * k;
          if (rr < 0 || rr >= C4_R || ccc < 0 || ccc >= C4_C) { mine = -99; break; }
          const v = s2.grid[rr * C4_C + ccc];
          if (v === 2) mine++; else if (v === 1) theirs++; else empty++;
        }
        if (mine >= 0 && theirs === 0) score += mine * mine * 3;
        if (theirs >= 3 && mine === 0) score -= 40;
      }
    }
    score += rng() * 2;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/* ---------------------------------------------------------------- reversi */
export const RV_N = 8;
export function rvNew() {
  const b = new Array(64).fill(0);
  b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2;
  return { board: b, turn: 1, over: false };
}
export function rvFlips(board, idx, player) {
  if (board[idx]) return [];
  const r = Math.floor(idx / 8), c = idx % 8;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const line = [];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === 3 - player) {
      line.push(rr * 8 + cc); rr += dr; cc += dc;
    }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === player) out.push(...line);
  }
  return out;
}
export function rvMoves(board, player) {
  const out = [];
  for (let i = 0; i < 64; i++) if (rvFlips(board, i, player).length) out.push(i);
  return out;
}
export function rvPlay(st, idx) {
  const flips = rvFlips(st.board, idx, st.turn);
  if (!flips.length) return st;
  const board = [...st.board];
  board[idx] = st.turn;
  flips.forEach((i) => { board[i] = st.turn; });
  let turn = 3 - st.turn;
  let over = false;
  if (!rvMoves(board, turn).length) {
    if (!rvMoves(board, st.turn).length) over = true;
    else turn = st.turn;
  }
  return { board, turn, over };
}
export function rvAi(st) {
  const moves = rvMoves(st.board, 2);
  if (!moves.length) return -1;
  const corner = new Set([0, 7, 56, 63]);
  let best = moves[0], bestS = -1e9;
  for (const m of moves) {
    let s = rvFlips(st.board, m, 2).length * 2 + Math.random();
    if (corner.has(m)) s += 60;
    if ([1, 8, 9, 6, 14, 15, 48, 49, 57, 55, 62, 54].includes(m)) s -= 12;
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
export const rvScore = (board) => board.reduce((acc, v) => { if (v === 1) acc[0]++; else if (v === 2) acc[1]++; return acc; }, [0, 0]);

/* ------------------------------------------------------------ cards & luck */
export function makeDeck(rng = Math.random) {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ s, r });
  return shuffle(deck, rng);
}
export const cardName = (c) => `${{ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || c.r}`;
export const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
export function bjValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += c.r === 14 ? 11 : c.r > 10 ? 10 : c.r;
    if (c.r === 14) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
export const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export function rpsResult(a, b) {
  if (a === b) return 0;
  return RPS_BEATS[a] === b ? 1 : -1;
}
export const WHEEL_SEGS = [10, 50, 0, 100, 20, 0, 40, 250];
export function wheelSpin(rng = Math.random) {
  const seg = ri(rng, WHEEL_SEGS.length);
  const segDeg = 360 / WHEEL_SEGS.length;
  /* Final resting angle: pointer at top, segment centre under it, plus
     5-7 full turns baked in by the caller. */
  const angle = 360 - (seg * segDeg + segDeg / 2);
  return { seg, points: WHEEL_SEGS[seg], angle };
}

/* ------------------------------------------------- reflex state machines */
export function rxPress(st, now) {
  /* Reaction / quick-draw machine: idle -> waiting -> ready -> done | early */
  if (st.phase === 'idle' || st.phase === 'done' || st.phase === 'early') {
    return { phase: 'waiting', at: 0, result: 0 };
  }
  if (st.phase === 'waiting') return { phase: 'early', at: st.at, result: 0 };
  if (st.phase === 'ready') return { phase: 'done', at: st.at, result: Math.max(1, Math.round(now - st.at)) };
  return st;
}
export const rxReady = (now) => ({ phase: 'ready', at: now, result: 0 });

export const STROOP_WORDS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'];
export function stroopRound(rng = Math.random) {
  const word = ri(rng, STROOP_WORDS.length);
  const ink = rng() < 0.5 ? word : (word + 1 + ri(rng, STROOP_WORDS.length - 1)) % STROOP_WORDS.length;
  return { word, ink, match: word === ink };
}
export function aimTarget(w, h, rng = Math.random) {
  const r = 15 + rng() * 13;
  return { x: r + rng() * (w - r * 2), y: r + rng() * (h - r * 2), r };
}
export const seqNext = (seq, n, rng = Math.random) => [...seq, ri(rng, n)];
