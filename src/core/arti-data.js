/**
 * Aarti / sangrah corpus loader.
 *
 * The corpus (public/data/arti.json, ~1.3 MB) used to be a dynamic JS
 * import, so every phone paid full JS parse cost for what is pure data.
 * It is fetched as JSON on first use instead — the same fetch-on-demand
 * pattern as the names and medicine datasets — and the service worker
 * keeps a copy after the first fetch, so repeat opens work offline.
 */
const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '');

let artiPromise = null;
export function loadArti() {
  if (artiPromise) return artiPromise;
  artiPromise = fetch(`${BASE}/data/arti.json`)
    .then((r) => { if (!r.ok) throw new Error(`arti data HTTP ${r.status}`); return r.json(); })
    .catch((e) => { artiPromise = null; throw e; });
  return artiPromise;
}
