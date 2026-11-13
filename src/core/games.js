/**
 * Pure game logic for the offline Games tool — no DOM, no React.
 *
 * Kept separate from the screens on purpose: every rule (a 2048 merge,
 * a snake eating and growing, a memory deck holding exact pairs) is
 * testable in a plain script, and the screens stay thin renderers.
 */

/* ------------------------------------------------------------------ 2048 */
export const G_SIZE = 4;

export function gNewBoard(rng = Math.random) {
  const b = new Array(16).fill(0);
  gSpawn(b, rng); gSpawn(b, rng);
  return b;
}

export function gSpawn(board, rng = Math.random) {
  const empty = [];
  board.forEach((v, i) => { if (!v) empty.push(i); });
  if (!empty.length) return board;
  const at = empty[Math.floor(rng() * empty.length)];
  board[at] = rng() < 0.9 ? 2 : 4;
  return board;
}

function slideRow(row) {
  const tiles = row.filter(Boolean);
  let gained = 0;
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] === tiles[i + 1]) {
      tiles[i] *= 2; gained += tiles[i];
      tiles.splice(i + 1, 1);
    }
  }
  while (tiles.length < 4) tiles.push(0);
  return { row: tiles, gained };
}

/* dir: 'left' | 'right' | 'up' | 'down' */
export function gMove(board, dir, rng = Math.random) {
  const out = new Array(16).fill(0);
  let gained = 0;
  for (let line = 0; line < 4; line++) {
    let idxs;
    if (dir === 'left') idxs = [0, 1, 2, 3].map((c) => line * 4 + c);
    else if (dir === 'right') idxs = [3, 2, 1, 0].map((c) => line * 4 + c);
    else if (dir === 'up') idxs = [0, 1, 2, 3].map((r) => r * 4 + line);
    else idxs = [3, 2, 1, 0].map((r) => r * 4 + line);
    const { row, gained: g } = slideRow(idxs.map((i) => board[i]));
    gained += g;
    idxs.forEach((bi, k) => { out[bi] = row[k]; });
  }
  const moved = out.some((v, i) => v !== board[i]);
  if (moved) gSpawn(out, rng);
  return { board: out, gained, moved };
}

export function gCanMove(board) {
  if (board.some((v) => !v)) return true;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = board[r * 4 + c];
      if (c < 3 && board[r * 4 + c + 1] === v) return true;
      if (r < 3 && board[(r + 1) * 4 + c] === v) return true;
    }
  }
  return false;
}

export const gWon = (board) => board.some((v) => v >= 2048);

/* ------------------------------------------------------------------ snake */
export const S_COLS = 17, S_ROWS = 17;

export function sNewState(rng = Math.random) {
  const mid = { x: 8, y: 8 };
  const st = {
    snake: [mid, { x: 7, y: 8 }, { x: 6, y: 8 }],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: null, score: 0, alive: true, won: false,
  };
  sPlaceFood(st, rng);
  return st;
}

export function sPlaceFood(st, rng = Math.random) {
  const taken = new Set(st.snake.map((s) => s.x + ',' + s.y));
  const free = [];
  for (let y = 0; y < S_ROWS; y++) for (let x = 0; x < S_COLS; x++) {
    if (!taken.has(x + ',' + y)) free.push({ x, y });
  }
  st.food = free.length ? free[Math.floor(rng() * free.length)] : null;
  if (!st.food) st.won = true;
  return st;
}

export function sStep(st, rng = Math.random) {
  if (!st.alive || st.won) return st;
  st.dir = st.nextDir;
  const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
  if (head.x < 0 || head.y < 0 || head.x >= S_COLS || head.y >= S_ROWS) {
    return { ...st, alive: false };
  }
  const eats = st.food && head.x === st.food.x && head.y === st.food.y;
  const body = eats ? st.snake : st.snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) {
    return { ...st, alive: false };
  }
  const nxt = { ...st, snake: [head, ...body], score: st.score + (eats ? 1 : 0) };
  if (eats) sPlaceFood(nxt, rng);
  return nxt;
}

export function sTurn(st, dx, dy) {
  /* No reversing into your own neck. */
  if (st.dir.x === -dx && st.dir.y === -dy) return st;
  if (st.dir.x === dx && st.dir.y === dy) return st;
  return { ...st, nextDir: { x: dx, y: dy } };
}

/* ----------------------------------------------------------------- memory */
export const M_SYMBOLS = ['sun', 'heart', 'star', 'music', 'train', 'moon', 'bolt', 'globe'];

export function mDeal(pairs = 6, rng = Math.random) {
  const picks = M_SYMBOLS.slice(0, pairs);
  const deck = [...picks, ...picks].map((sym, i) => ({ id: i, sym, up: false, done: false }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
