/* Tiny IndexedDB key-value cache for reader data (e.g. Guru Granth Sahib
 * Ang pages): anything stored here survives offline forever on the device.
 * All failures are swallowed — the cache is an enhancement, never a blocker. */
const DB = 'omni-reader-cache';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      t.onsuccess = () => resolve(t.result || null);
      t.onerror = () => reject(t.error);
    });
  } catch { return null; }
}

export async function idbSet(key, val) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
      t.onsuccess = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch { /* storage unavailable — ignore */ }
}
