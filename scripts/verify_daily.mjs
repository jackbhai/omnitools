/* Daily Challenge verification — the seed mechanism must be REAL:
 * the same date, fed through the exact generator calls the game
 * components make, produces the identical starting state twice; a
 * different date produces a different one. Also proves the rotation
 * covers all six games and the streak maths on fabricated calendars.
 * Run: npm run verify:daily
 */
import { gNewBoard, mDeal } from '../src/core/games.js';
import { mulberry32, sudokuGen, mazeGen, mathQuestion, WG_WORDS_EN } from '../src/core/games2.js';
import {
  DAILY_GAMES, dateStr, dayIndex, dateStrOfIndex, dailySeed, dailyPick,
  dailyRng, streakOf,
} from '../src/core/games-daily.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; } else { fail++; console.log('  FAIL', name); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* The starting state of each seedable game, built exactly as the
   components build it (same generator, same rng stream). */
function startState(gameId, str) {
  const rng = dailyRng(str);
  switch (gameId) {
    case 'sudoku': { const g = sudokuGen('medium', rng); return { puzzle: g.puzzle, solution: g.solution }; }
    case 'maze': { const m = mazeGen(13, 13, rng); return m.cells; }
    case 'memory': return mDeal(6, rng).map((c) => c.sym);
    case 'g2048': return gNewBoard(rng);
    case 'mathsprint': return Array.from({ length: 5 }, (_, i) => mathQuestion(rng, 1 + Math.min(2, Math.floor(i / 3))).text);
    case 'wordguess': return WG_WORDS_EN[Math.floor(rng() * WG_WORDS_EN.length)];
    default: throw new Error(gameId);
  }
}

const D1 = '2026-11-14';
const D2 = '2026-11-15';

for (const g of DAILY_GAMES) {
  const a = startState(g.id, D1);
  const b = startState(g.id, D1);
  check(`${g.id}: same date -> identical starting state`, eq(a, b));
  const c = startState(g.id, D2);
  check(`${g.id}: different date -> different starting state`, !eq(a, c));
}

/* The seed itself: stable, and date-sensitive. */
check('dailySeed stable for a date', dailySeed(D1) === dailySeed(D1));
check('dailySeed differs across dates', dailySeed(D1) !== dailySeed(D2));

/* Rotation: any six consecutive days cover all six games exactly once. */
{
  const start = dayIndex('2026-11-14');
  const picks = Array.from({ length: 6 }, (_, i) => dailyPick(dateStrOfIndex(start + i)).id);
  check('rotation covers all 6 games in 6 days', new Set(picks).size === 6);
  check('pick for a date is deterministic', dailyPick(D1).id === dailyPick(D1).id
    && dailyPick(D1).seed === dailySeed(D1));
}

/* Round-trip: dateStr(dayIndex) is the identity on real dates. */
check('date index round-trips', dateStrOfIndex(dayIndex('2026-02-28')) === '2026-02-28'
  && dateStrOfIndex(dayIndex('2026-03-01')) === '2026-03-01');

/* Streak maths on fabricated calendars (today = 2026-11-14). */
{
  const T = '2026-11-14';
  const map = (...days) => Object.fromEntries(days.map((d) => [d, 'sudoku']));
  check('streak: empty calendar -> 0', streakOf({}, T) === 0);
  check('streak: today only -> 1', streakOf(map('2026-11-14'), T) === 1);
  check('streak: today + 2 back -> 3', streakOf(map('2026-11-14', '2026-11-13', '2026-11-12'), T) === 3);
  check('streak: gap yesterday breaks a today-only run at 1',
    streakOf(map('2026-11-14', '2026-11-12'), T) === 1);
  check('streak: not played today yet, alive from yesterday -> 2',
    streakOf(map('2026-11-13', '2026-11-12'), T) === 2);
  check('streak: last played 3 days ago -> 0',
    streakOf(map('2026-11-11', '2026-11-10'), T) === 0);
  check('streak: month boundary counts through', streakOf(map('2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11', '2026-11-10', '2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31'), T) === 15);
}

console.log(`\nverify:daily — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
