/**
 * Auto-cache checks (src/core/auto-cache.js), fully offline:
 * IndexedDB is replaced with an in-memory fake and fetch is mocked, so the
 * LRU rules can be driven exactly: 55 plays, a replay, a CORS refusal, an
 * oversized file, a manual save that must not be duplicated, and a local
 * (offline) resolution that must not touch the network.
 */
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

/* ------------------------------------------------------- fake IndexedDB */
const later = (fn) => setTimeout(fn, 0);
function makeFakeIDB() {
  const dbs = new Map();   // name -> Map(storeName -> Map(key -> rec))
  const handle = (name) => {
    const stores = dbs.get(name);
    return {
      objectStoreNames: { contains: (s) => stores.has(s) },
      createObjectStore: (s) => { if (!stores.has(s)) stores.set(s, new Map()); },
      transaction: (sname) => {
        const data = stores.get(sname);
        const tx = { oncomplete: null, onerror: null, onabort: null };
        const req = (fn) => {
          const r = {};
          later(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); later(() => tx.oncomplete && tx.oncomplete()); });
          return r;
        };
        tx.objectStore = () => ({
          put: (rec) => req(() => { data.set(rec.key, rec); return rec.key; }),
          get: (k) => req(() => data.get(k)),
          delete: (k) => req(() => { data.delete(k); }),
          getAll: () => req(() => [...data.values()]),
        });
        return tx;
      },
    };
  };
  return {
    open(name) {
      const r = {};
      later(() => {
        const fresh = !dbs.has(name);
        if (fresh) dbs.set(name, new Map());
        r.result = handle(name);
        if (fresh && r.onupgradeneeded) r.onupgradeneeded();
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    },
  };
}
globalThis.indexedDB = makeFakeIDB();

/* ------------------------------------------------------------ mock fetch */
let fetchCount = 0;
globalThis.fetch = async (url) => {
  fetchCount++;
  const u = String(url);
  if (u.includes('bad-cors')) throw new TypeError('Failed to fetch (mock CORS refusal)');
  if (u.includes('huge')) {
    return new Response(new Uint8Array(16), { status: 200,
      headers: { 'content-type': 'audio/mpeg', 'content-length': String(80e6) } });
  }
  return new Response(new Uint8Array(2048), { status: 200,
    headers: { 'content-type': 'audio/mpeg', 'content-length': '2048' } });
};

let pass = 0, fail = 0;
const chk = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

const AC = await import('../src/core/auto-cache.js');
const OS = await import('../src/core/offline-store.js');
const { setSetting } = await import('../src/core/settings.js');
AC.__setStartDelay(0);

const T = (i) => ({ id: 't' + i, title: 'Song ' + i, artist: 'Artist ' + i, dur: 200 });
const U = (i) => `https://cdn.example/audio/t${i}.mp3`;

console.log('=== auto-cache: LRU cap of 50, by last play ===');
for (let i = 1; i <= 50; i++) AC.notePlayed(T(i), U(i), i * 1000);
await AC.__whenIdle();
let list = await AC.autoCacheList();
chk('50 distinct plays → 50 kept', list.length === 50, `got ${list.length}`);
chk('one fetch per song', fetchCount === 50, `fetchCount=${fetchCount}`);
chk('list is most-recently-played first', list[0]?.key === 't50' && list[49]?.key === 't1');

AC.notePlayed(T(3), U(3), 100000);                    // replay an old one
await AC.__whenIdle();
chk('replaying a kept song downloads nothing', fetchCount === 50, `fetchCount=${fetchCount}`);

for (let i = 51; i <= 55; i++) AC.notePlayed(T(i), U(i), (100 + i) * 1000);
await AC.__whenIdle();
list = await AC.autoCacheList();
const keys = new Set(list.map((r) => r.key));
chk('55 distinct plays → still exactly 50 kept', list.length === 50, `got ${list.length}`);
chk('the replayed song (#3) survived the eviction round', keys.has('t3'));
chk('the least-recently-played went first (t1, t2, t4 gone)',
  !keys.has('t1') && !keys.has('t2') && !keys.has('t4'));
chk('the newest plays are kept (t55, t51)', keys.has('t55') && keys.has('t51'));

console.log('=== auto-cache: honest refusals ===');
AC.notePlayed({ id: 'bad1', title: 'Refused' }, 'https://bad-cors.example/x.mp3', 200000);
await AC.__whenIdle();
chk('a CORS-refused song is NOT in the cache', !(await AC.autoCacheHas('bad1')));
chk('the refusal is counted, not hidden', (await AC.autoCacheStats()).skipped >= 1,
  `skipped=${(await AC.autoCacheStats()).skipped}`);

AC.notePlayed({ id: 'huge1', title: 'Huge' }, 'https://cdn.example/huge.mp3', 201000);
await AC.__whenIdle();
chk('an oversized file is skipped, not stored', !(await AC.autoCacheHas('huge1')));

console.log('=== auto-cache: manual saves are never duplicated ===');
const man = { id: 'man1', title: 'Manual Save', artist: 'A', dur: 100, stream: 'https://cdn.example/audio/man1.mp3' };
await OS.downloadTrack(man);
const before = fetchCount;
AC.notePlayed(man, man.stream, 202000);
await AC.__whenIdle();
chk('a manually saved song is not duplicated in the auto-cache', !(await AC.autoCacheHas('man1')));
chk('playing a manually saved song fetches nothing for the cache', fetchCount === before);

console.log('=== auto-cache: offline playback resolution ===');
const fc = fetchCount;
const local = await AC.resolveLocalTrack(T(10));
chk('a kept song resolves locally with its bytes', !!local && local.source === 'auto' && !!local.blob && local.blob.size === 2048);
chk('local resolution used the network zero times', fetchCount === fc, `fetchCount=${fetchCount}`);
const localMan = await AC.resolveLocalTrack(man);
chk('the manual copy wins local playback', !!localMan && localMan.source === 'manual');
const none = await AC.resolveLocalTrack({ id: 'never-played' });
chk('an unplayed song resolves to nothing', none === null);

console.log('=== auto-cache: Save-Data and the setting gate it ===');
setSetting('lowData', true);
AC.notePlayed(T(900), U(900), 203000);
await AC.__whenIdle();
chk('Save-Data on → nothing new is kept', !(await AC.autoCacheHas('t900')));
setSetting('lowData', false);
setSetting('autoCache', false);
AC.notePlayed(T(901), U(901), 204000);
await AC.__whenIdle();
chk('Auto-cache off → nothing new is kept', !(await AC.autoCacheHas('t901')));
setSetting('autoCache', true);
AC.notePlayed(T(902), U(902), 205000);
await AC.__whenIdle();
chk('turning it back on resumes keeping', await AC.autoCacheHas('t902'));

console.log(`\nauto-cache: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
