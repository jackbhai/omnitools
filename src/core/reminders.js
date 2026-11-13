/**
 * reminders.js — Path & Aarti reminders.
 *
 * A reminder points at a text the app already carries (a bundled Gurbani
 * path, or one of the well-known sangrah texts) and a time of day. When
 * the time comes — or when the app is next opened later the same day —
 * the shell shows a banner (and a system notification where the user
 * has allowed one) that deep-links to the exact text: the reader's own
 * saved-position keys are written first, so the reader opens on the
 * page, not at its home.
 *
 * Honest limit, also stated in the tool: a web app has no alarm while
 * it is fully closed. Reminders fire while the app is open (including
 * in the background with notifications allowed); a missed one surfaces
 * on the next open the same day instead of ringing late at night.
 */

export const REM_KEY = 'omni:reminders';

/* Reader-position keys, written in exactly readerkit's format so the
   readers restore from them (ui/readerkit.jsx: omni:read:<tool>). */
function writePos(tool, pos, label) {
  try {
    localStorage.setItem(`omni:read:${tool}`, JSON.stringify({ ...pos, at: Date.now() }));
    if (label) localStorage.setItem('omni:read:last', JSON.stringify({ tool, label, at: Date.now() }));
  } catch { /* storage off — the route still opens the tool */ }
}

const path = (token, name, en) => ({
  id: `path-${token}`, name, sub: `${en} · Gurbani path, bundled in the app`,
  route: 'gurbani',
  apply: () => writePos('gurbani', { tab: 'paths', path: token }, { t: 'Gurbani', s: name }),
});
const sangrah = (tab, itemId, name, kind) => ({
  id: `sg-${itemId}`, name, sub: `${kind} · Aarti & Mantra library`,
  route: 'devotional',
  apply: () => writePos('devotional', { tab, id: itemId, in: 0 }, { t: name, s: kind }),
});

export const REM_TARGETS = [
  path('japji', 'Japji Sahib', 'Morning path'),
  path('sukhmani', 'Sukhmani Sahib', 'Path of peace'),
  path('anand', 'Anand Sahib', 'Path of bliss'),
  path('rehras', 'Rehras Sahib', 'Evening path'),
  path('sohila', 'Kirtan Sohila', 'Night path'),
  sangrah('chalisa', 'ha-chalisa-hanuman-chalisa', 'Hanuman Chalisa', 'Chalisa'),
  sangrah('chalisa', 'ha-chalisa-durga-chalisa', 'Durga Chalisa', 'Chalisa'),
  sangrah('chalisa', 'ha-chalisa-shiv-chalisa', 'Shiv Chalisa', 'Chalisa'),
  sangrah('aarti', 'ha-aarti-om-jai-jagdish-hare', 'Om Jai Jagdish Hare', 'Aarti'),
  sangrah('aarti', 'ha-aarti-om-jai-shiv-omkara', 'Om Jai Shiv Omkara', 'Aarti'),
  sangrah('aarti', 'ha-aarti-jai-ambe-gauri', 'Jai Ambe Gauri', 'Aarti'),
  sangrah('aarti', 'ha-aarti-om-jai-lakshmi-mata', 'Om Jai Lakshmi Mata', 'Aarti'),
  sangrah('mantra', 'ha-mantra-gayatri-mantra', 'Gayatri Mantra', 'Mantra'),
];
export const targetById = (id) => REM_TARGETS.find((t) => t.id === id);

export function loadReminders() {
  try {
    const r = JSON.parse(localStorage.getItem(REM_KEY) || '[]');
    return Array.isArray(r) ? r.filter((x) => x && targetById(x.targetId)) : [];
  } catch { return []; }
}
export function saveReminders(list) {
  try { localStorage.setItem(REM_KEY, JSON.stringify(list)); } catch { /* storage off */ }
}

export const dayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Reminders due at `now`: switched on, today is one of its days, the
 *  time has come, and it has not already fired today. */
export function dueReminders(list, now = new Date()) {
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return list.filter((r) => r.on !== false
    && (!r.days || r.days.includes(now.getDay()))
    && r.time <= hm
    && r.lastFired !== dayStr(now));
}

export function markFired(list, id, now = new Date()) {
  return list.map((r) => (r.id === id ? { ...r, lastFired: dayStr(now) } : r));
}

/** Open the reminder's text: position the reader, then route to it. */
export function openTarget(target) {
  if (!target) return;
  target.apply();
  location.hash = target.route;
}
