/**
 * Daily Challenge — one seeded game per day for the arcade.
 *
 * The pick and the seed both derive from the local calendar date, so
 * everyone who opens the arcade on the same day gets the same game in
 * the same starting state, and a different one tomorrow. The games
 * themselves take the seed through the mulberry32 stream already used
 * by core/games2.js — sudokuGen / mazeGen / mDeal / gNewBoard /
 * mathQuestion all accept an rng, so a seeded run is built from the
 * exact same generators as free play, never a parallel copy.
 *
 * Stamps live in localStorage `omni:games:daily` (registered in
 * core/keys.js): { done: { 'YYYY-MM-DD': gameId } }. Streak and total
 * are computed from that map, never stored, so they cannot drift.
 */
import { mulberry32 } from './games2.js';

export const DAILY_KEY = 'omni:games:daily';

/* The curated rotation — only games whose starting state is fully
   determined by an rng stream belong here. `goal` is the completion
   rule the hub shows before the run starts. */
export const DAILY_GAMES = [
  { id: 'sudoku', n: 'Sudoku of the Day', goal: 'Solve today’s medium puzzle' },
  { id: 'maze', n: 'Maze of the Day', goal: 'Reach the far corner of today’s maze' },
  { id: 'memory', n: 'Memory of the Day', goal: 'Find all 6 pairs in today’s layout' },
  { id: 'g2048', n: '2048 of the Day', goal: 'Make a 512 tile on today’s board — or play it out to the end' },
  { id: 'mathsprint', n: 'Math Sprint of the Day', goal: 'Finish a 60-second run with 10 or more right' },
  { id: 'wordguess', n: 'Word of the Day', goal: 'Guess today’s hidden word' },
];

/** Local calendar date as YYYY-MM-DD (the day the player experiences). */
export function dateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days since the epoch for a YYYY-MM-DD string, timezone-free. */
export function dayIndex(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

const DAY_MS = 86400000;
export function dateStrOfIndex(idx) {
  const d = new Date(idx * DAY_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** FNV-1a over the date string — small, stable, platform-independent. */
export function dailySeed(str) {
  let h = 0x811c9dc5;
  const s = 'omni-daily:' + str;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The game + seed for a date string. Same input, same output, always. */
export function dailyPick(str) {
  const game = DAILY_GAMES[((dayIndex(str) % DAILY_GAMES.length) + DAILY_GAMES.length) % DAILY_GAMES.length];
  return { ...game, seed: dailySeed(str), date: str };
}

export const dailyRng = (str) => mulberry32(dailySeed(str));

/* ------------------------------------------------------------- stamps */
export function loadDaily() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    return { done: raw && typeof raw.done === 'object' && raw.done ? raw.done : {} };
  } catch { return { done: {} }; }
}

export function stampDaily(str, gameId) {
  const st = loadDaily();
  if (st.done[str]) return st;
  st.done[str] = gameId;
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(st)); } catch { /* storage off */ }
  return st;
}

/**
 * Current streak from a done-map: consecutive days ending today, or
 * ending yesterday when today is still unplayed (the streak is alive
 * until the day ends). A gap of two or more days resets it to zero.
 */
export function streakOf(done, todayStr) {
  let idx = dayIndex(todayStr);
  if (!done[dateStrOfIndex(idx)]) idx -= 1;
  let streak = 0;
  while (done[dateStrOfIndex(idx)]) { streak++; idx--; }
  return streak;
}

/** { doneToday, streak, total } for display on the hub card. */
export function dailyStats(todayStr, done = loadDaily().done) {
  return {
    doneToday: !!done[todayStr],
    streak: streakOf(done, todayStr),
    total: Object.keys(done).length,
  };
}
