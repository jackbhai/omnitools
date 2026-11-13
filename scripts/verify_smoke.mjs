/**
 * Smoke checks for the flows the other suites don't cover:
 *   1. the downloader resolve chain, with the network mocked out;
 *   2. player-adjacent state (library + session hand-off migration);
 *   3. reader data integrity (the bundled texts are what the census says).
 * Offline by construction: fetch is replaced before any module sees it.
 */
import { readFileSync, readdirSync } from 'node:fs';

/* ---------------------------------------------------------- browser shims */
const makeStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
};
globalThis.localStorage = makeStore();
globalThis.sessionStorage = makeStore();

let pass = 0, fail = 0;
const chk = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

/* ------------------------------------------------- 1. downloader chain */
console.log('=== downloader resolve chain (mocked endpoints) ===');
const fetched = [];
let fetchMode = 'ok';
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (fetchMode === 'ok') {
    return new Response(JSON.stringify({ success: true, title: 'Mock', url: 'https://cdn.example/v.mp4' }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('network down (mock)');
};

const { cleanMediaUrl, resolveJson } = await import('../src/core/audio-resolve.js');

chk('cleanMediaUrl strips the YouTube si tracker',
  cleanMediaUrl('https://www.youtube.com/watch?v=hoUlkj0_4Aw&si=abc123') === 'https://www.youtube.com/watch?v=hoUlkj0_4Aw');
chk('cleanMediaUrl normalises youtu.be to a watch URL',
  cleanMediaUrl('https://youtu.be/hoUlkj0_4Aw?si=x') === 'https://www.youtube.com/watch?v=hoUlkj0_4Aw');
chk('cleanMediaUrl drops the whole Instagram query string and adds the reel slash',
  cleanMediaUrl('https://www.instagram.com/reel/DfcDysKobAS?igsh=zzz') === 'https://www.instagram.com/reel/DfcDysKobAS/');

fetched.length = 0;
const got = await resolveJson('https://vimeo.com/12345');
chk('resolveJson returns the resolver payload for a non-YouTube link', !!got && got.success === true);
chk('the chain calls the alldl endpoint with the cleaned URL encoded',
  fetched.length > 0 && fetched[0].includes('alldl?url=') && fetched[0].includes(encodeURIComponent('https://vimeo.com/12345')),
  fetched[0] ? fetched[0].slice(0, 90) : 'no fetch happened');

fetchMode = 'down';
const t0 = Date.now();
let rejected = false;
try { await resolveJson('https://vimeo.com/999', { ms: 4000 }); } catch { rejected = true; }
chk('a dead chain rejects instead of hanging', rejected, `${Date.now() - t0} ms`);
fetchMode = 'ok';

/* --------------------------------------------- 2. player/library state */
console.log('=== player state basics ===');
const lib = await import('../src/core/library.js');
const track = { id: 't1', title: 'Song One', artist: 'A' };
lib.toggleFav(track);
chk('toggleFav adds a favourite', lib.isFav('t1') && lib.favourites().length === 1);
lib.toggleFav(track);
chk('toggleFav again removes it', !lib.isFav('t1') && lib.favourites().length === 0);
lib.notePlay(track); lib.notePlay({ id: 't2', title: 'Two' }); lib.notePlay(track);
chk('history dedupes and puts the latest play first',
  lib.history().length === 2 && lib.history()[0].id === 't1');
const pl = lib.createPlaylist('Smoke');
lib.addToPlaylist(pl.id, [track]);
chk('playlist create + add round-trips', lib.playlists().find((p) => p.id === pl.id)?.tracks.length === 1);
lib.deletePlaylist(pl.id);
chk('playlist delete removes it', !lib.playlists().some((p) => p.id === pl.id));

const keys = await import('../src/core/keys.js');
sessionStorage.setItem('omni:music:resume', JSON.stringify({ id: 'legacy1' }));
const migrated = keys.sessTake(keys.SESS_RESUME_MUSIC);
chk('sessTake migrates a legacy session value', migrated === JSON.stringify({ id: 'legacy1' }));
chk('the legacy key is gone after migration', sessionStorage.getItem('omni:music:resume') === null);
chk('a second take finds nothing (hand-off is single-use)', keys.sessTake(keys.SESS_RESUME_MUSIC) === null);
keys.sessSet(keys.SESS_OPEN_TV, JSON.stringify({ url: 'u' }));
chk('sessSet writes only the new session name',
  sessionStorage.getItem('omni:sess:tv:open') !== null && sessionStorage.getItem('omni:tv:open') === null);

/* ------------------------------------------------ 3. reader data integrity */
console.log('=== reader data integrity ===');
let gitaVerses = 0, gitaComplete = 0, chapters = 0;
for (let c = 1; c <= 18; c++) {
  const d = JSON.parse(readFileSync(new URL(`../src/data/gita/ch-${String(c).padStart(2, '0')}.json`, import.meta.url), 'utf8'));
  chapters++;
  for (const v of d.verses || []) {
    gitaVerses++;
    if (v.sa && v.tr && v.hi && v.en) gitaComplete++;
  }
}
chk('Gita ships all 18 chapters', chapters === 18);
chk('Gita carries exactly 701 verses', gitaVerses === 701, `${gitaVerses}`);
chk('every Gita verse has Sanskrit + transliteration + Hindi + English', gitaComplete === 701, `${gitaComplete}/701`);

const baniFiles = readdirSync(new URL('../src/data/gurbani/', import.meta.url)).filter((f) => f.endsWith('.json'));
let baniLines = 0, baniFilesOk = 0;
for (const f of baniFiles) {
  const d = JSON.parse(readFileSync(new URL(`../src/data/gurbani/${f}`, import.meta.url), 'utf8'));
  /* bani files are {lines:[…]} objects; shabads.json is a plain index list */
  if (Array.isArray(d)) continue;
  if (Array.isArray(d.lines) && d.lines.length) { baniFilesOk++; baniLines += d.lines.length; }
}
chk('Gurbani bundle: every bani file parses with lines', baniFilesOk >= 12, `${baniFilesOk} bani files`);
chk('Gurbani bundle carries the full Nitnem + Sukhmani line count', baniLines >= 5520, `${baniLines} lines`);

const arti = JSON.parse(readFileSync(new URL('../public/data/arti.json', import.meta.url), 'utf8'));
const kinds = {};
let withText = 0;
for (const it of arti.items) { kinds[it.k] = (kinds[it.k] || 0) + 1; if (it.ln && String(it.ln).trim().length > 0) withText++; }
chk('Sangrah item count matches its own manifest', arti.items.length === arti.meta.n, `${arti.items.length}`);
chk('Sangrah kinds are all present at census scale',
  kinds.aarti >= 80 && kinds.chalisa >= 50 && kinds.stotra >= 110 && kinds.mantra >= 45 && kinds.bhajan >= 300,
  JSON.stringify(kinds));
chk('every Sangrah item carries its full text', withText === arti.items.length, `${withText}/${arti.items.length}`);

const devoSrc = readFileSync(new URL('../src/tools/devotional.jsx', import.meta.url), 'utf8');
chk('Quran reader keeps all four verified editions',
  ['quran-simple', 'en.asad', 'hi.hindi', 'ur.jalandhry'].every((e) => devoSrc.includes(e)));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
