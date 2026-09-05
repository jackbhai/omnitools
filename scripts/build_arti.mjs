/**
 * Build src/data/arti.json from the scraped hinduaarti.com corpus.
 * Quality-gated: only full, clean Devanagari texts survive. Nothing is padded,
 * nothing is truncated — a failed check drops the item and says why.
 *
 * Usage: node scripts/build_arti.mjs [input.ndjson]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN = process.argv[2] || '/home/user/scrape/arti/hinduaarti.ndjson';
const OUT = resolve(ROOT, 'src/data/arti.json');

const KIND = { aartis: 'aarti', chalisa: 'chalisa', mantras: 'mantra', stotrams: 'stotra', bhajans: 'bhajan' };
const MIN_CHARS = { aarti: 120, chalisa: 200, mantra: 25, stotra: 140, bhajan: 140 };
const NAV = /^(©|स्रोत|टिप्पणी|होम|खोजें|अधिक|Quick|Share|Read also)/i;
const deva = (s) => (s.match(/[\u0900-\u097F]/g) || []).length;
const core = (s) => s.replace(/\s+/g, '').length;

const rows = readFileSync(IN, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const seen = new Set();
const out = [];
const drop = { fail: 0, short: 0, dup: 0, dirty: 0 };
const dropped_short = [];
for (const r of rows) {
  if (!r.lines || r.fail) { drop.fail++; continue; }
  const k = KIND[r.section];
  if (!k) { drop.fail++; continue; }
  let lines = r.lines.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  lines = lines.filter((x) => !NAV.test(x) && !/[<>{}|\\[\]#*_~=]/.test(x) && !/…|\.\.\./.test(x));
  const body = lines.join('\n');
  const chars = core(body);
  if (!lines.length || chars < MIN_CHARS[k] || (k !== 'mantra' && lines.length < 4)) { drop.short++; dropped_short.push(r.url + ' c=' + chars); continue; }
  if (k === 'mantra' && lines.length <= 6 && lines.every((x) => /^(हनुमान चालीसा|शिव चालीसा|गायत्री मंत्र|महामृत्युंजय मंत्र|जय गणेश देवा|ॐ जय जगदीश हरे)$/.test(x))) { drop.dirty++; continue; }
  const dr = deva(body) / Math.max(1, chars);
  if (dr < 0.62 || /html|function|window\.|__next/i.test(body)) { drop.dirty++; continue; }
  const key = k + ':' + chars + ':' + body.slice(0, 40);
  const tKey = k + ':' + (r.title || '').toLowerCase().replace(/[^a-z\u0900-\u097f]+/g, '');
  if (seen.has(key) || seen.has(tKey)) { drop.dup++; continue; }
  seen.add(key); seen.add(tKey);
  const m = /\/aartis\/([a-z0-9-]+)\//.exec(r.url || '');
  out.push({
    id: 'ha-' + r.section.replace(/s$/, '') + '-' + r.slug,
    k,
    t: (r.title || r.slug).slice(0, 90),
    d: m ? m[1].replace(/-/g, ' ') : null,
    ln: body,
    c: chars,
    u: r.url,
    f: r.fetched || '',
  });
}
out.sort((a, b) => (a.k === b.k ? a.t.localeCompare(b.t) : 0));
const n = (k) => out.filter((x) => x.k === k).length;
const payload = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    src: 'hinduaarti.com',
    note: 'Full-text aarti chalisa mantra stotra sangrah as published by the source; Devanagari only; nothing truncated.',
    n: out.length,
  },
  items: out,
};
writeFileSync(OUT, JSON.stringify(payload) + '\n');
const bytes = JSON.stringify(payload).length;
console.log(`arti.json: ${out.length} items [aarti ${n('aarti')} | chalisa ${n('chalisa')} | mantra ${n('mantra')} | stotra ${n('stotra')} | bhajan ${n('bhajan')}] · ${Math.round(bytes / 1024)} KB raw · dropped ${JSON.stringify(drop)}`);
const tot = out.reduce((s, x) => s + x.c, 0);
console.log('short-drops:', dropped_short.slice(0, 8).join(' , '));
console.log(`total text: ${tot} chars · avg ${Math.round(tot / Math.max(1, out.length))}/item · min ${Math.min(...out.map((x) => x.c))}`);
if (out.length < 250) { console.error('FAIL: corpus too small — check scrape run'); process.exit(1); }
