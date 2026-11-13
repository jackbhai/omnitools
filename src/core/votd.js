/**
 * votd.js — the Verse of the Day rotation, kept pool-free on purpose:
 * the home shelf imports this to name today's source without pulling
 * the verse pool (src/data/votd-pool.js) into the shell bundle. The
 * tool itself loads the pool lazily and applies the same rotation.
 *
 * Rotation: one source per day, cycling Gita → Quran → Gurbani →
 * Bible by epoch day; the tool picks within the day's source by
 * floor(day / 4), so a full pass through every source happens before
 * any verse repeats.
 */
export const VOTD_KINDS = [
  { k: 'gita', label: 'Bhagavad Gita', tool: 'gita' },
  { k: 'quran', label: 'Quran', tool: 'quran' },
  { k: 'gurbani', label: 'Guru Granth Sahib', tool: 'gurbani' },
  { k: 'bible', label: 'Holy Bible', tool: 'bible' },
];

export function votdDayNumber(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(d.getTime() / 86400000);
}

export function votdKind(date = new Date()) {
  return VOTD_KINDS[votdDayNumber(date) % VOTD_KINDS.length];
}

/** The entry for a date from a loaded pool (array of pool entries). */
export function votdPick(pool, date = new Date()) {
  const n = votdDayNumber(date);
  const kind = VOTD_KINDS[n % VOTD_KINDS.length].k;
  const ofKind = pool.filter((p) => p.k === kind);
  if (!ofKind.length) return pool[n % pool.length];
  return ofKind[Math.floor(n / VOTD_KINDS.length) % ofKind.length];
}
