/**
 * Build src/data/arti.json from the scraped devotional corpus.
 * Quality-gated: only full, clean Devanagari texts survive. Nothing is padded,
 * nothing is truncated, and a failed check drops the item instead of shipping
 * it fixed-up by guesswork.
 *
 * Layers:
 *  - hinduaarti.com sangrah (hinduaarti.ndjson) — aarti chalisa mantra stotra bhajan
 *  - Wikimedia Marathi layer (arti_raw.ndjson)   — aarti/bhupal full wikitext pages
 *
 * Usage: node scripts/build_arti.mjs [input.ndjson]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN = process.argv[2] || '/home/user/scrape/arti/hinduaarti.ndjson';
const WIKI = '/home/user/scrape/arti/arti_raw.ndjson';
const OUT = resolve(ROOT, 'src/data/arti.json');

const KIND = { aartis: 'aarti', chalisa: 'chalisa', mantras: 'mantra', stotrams: 'stotra', bhajans: 'bhajan' };
const MIN_CHARS = { aarti: 120, chalisa: 200, mantra: 25, stotra: 140, bhajan: 140 };
const NAV = /^(©|स्रोत|टिप्पणी|होम|खोजें|अधिक|Quick|Share|Read also)/i;
const deva = (s) => (s.match(/[\u0900-\u097F]/g) || []).length;
const core = (s) => s.replace(/\s+/g, '').length;

const rows = readFileSync(IN, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const seen = new Set();
const out = [];
const drop = { fail: 0, short: 0, dup: 0, dirty: 0, ellipsed: 0 };
for (const r of rows) {
  if (!r.lines || r.fail) { drop.fail++; continue; }
  const k = KIND[r.section];
  if (!k) { drop.fail++; continue; }
  let lines = r.lines.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  lines = lines.filter((x) => !NAV.test(x) && !/[<>{}|\\[\]#*_~=]/.test(x) && !/…|\.\.\./.test(x));
  const body = lines.join('\n');
  const chars = core(body);
  if (!lines.length || chars < MIN_CHARS[k] || (k !== 'mantra' && lines.length < 4)) { drop.short++; continue; }
  // a "mantra" whose whole text is just the sidebar list of popular items is
  // not a mantra — kill it here so no future scrape revives it
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
    s: 'hinduaarti.com',
  });
}

/* ------------------------------------------------------------------ wiki layer */
/* Cached raw wikitext pages (see scrape/arti/fetch_wiki.py). Anything an editor
   ellipsised — the refrain written as "ॐ जय शिव…" — is dropped, not repaired
   from memory. Zero guesswork beats zero gaps. */
function stripWikitext(w) {
  w = w.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^/]*\/>/g, ' ');
  w = w.replace(/<noinclude>[\s\S]*?<\/noinclude>/gi, ' ');
  for (let a = 0; a < 8; a++) {
    const n = w.replace(/\{\{[^{}]*\}\}/g, ' ');
    if (n === w) break; w = n;
  }
  const pm = w.match(/<poem[^>]*>([\s\S]*?)<\/poem>/i);
  let text = pm ? pm[1] : w.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '\n');
  text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');
  text = text.replace(/'''?|''/g, ' ').replace(/&nbsp;|&mdash;|&ndash;|&amp;/gi, (e) => ({ '&nbsp;': ' ', '&mdash;': '-', '&ndash;': '-', '&amp': '&' }[e.toLowerCase()] || ' '));
  return text;
}
const wikiSrcName = { 'mr.wikisource.org': 'मराठी विकिस्रोत', 'hi.wikibooks.org': 'हिंदी विकिबुक्स' };
const WIKI_DATE = '2026-09-05';
const addWiki = [];
try {
  const raw = readFileSync(WIKI, 'utf-8');
  for (const ln of raw.split('\n').filter(Boolean)) {
    const j = JSON.parse(ln);
    if (!j.wikitext || j.wikitext.length < 150) continue;
    const clean = stripWikitext(j.wikitext);
    const secs = clean.split(/^==+\s*([^=\n]+?)\s*==+\s*$/m);
    const parts = [];
    if (secs.length > 2) for (let i = 1; i < secs.length; i += 2) parts.push([secs[i].trim(), secs[i + 1] || '']);
    else parts.push([null, clean]);
    for (const [head, blockRaw] of parts) {
      const page = j.page || '';
      const isAarti = /आरती|आरत्या/.test((head || '') + page);
      const kind = isAarti ? 'aarti' : /भूपाळ|भजन|पाळण/.test((head || '') + page) ? 'bhajan' : 'stotra';
      const rawLines = blockRaw.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (rawLines.some((x) => /…|\.\.\./.test(x))) continue;   // abridged by the page itself — skip, never splice
      let lines = rawLines.filter((x) =>
        !/^[=*#:;|{}\[\]]/.test(x) &&
        !/मागील|पुढील|शीर्षक|साहित्यिक|आढावा|संपादन|Transclude|CitePage|विकिस्रोत|अर्थ\s*[:\-]/.test(x) &&
        !/[{}<>|#*_~=\[\]]/.test(x));
      if (lines.length && head === null && lines[0] === page.split('/').pop()) lines = lines.slice(1);
      if (lines.length && lines[0] === head) lines = lines.slice(1);
      const body = lines.join('\n');
      const chars = core(body);
      if (!lines.length || chars < MIN_CHARS[kind] || lines.length < 4) continue;
      if (deva(body) / Math.max(1, chars) < 0.62) continue;
      addWiki.push({
        id: 'wk-' + Math.abs([...page + (head || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36),
        k: kind,
        t: (head || page.split('/').pop()).slice(0, 90),
        d: null,
        ln: body, c: chars,
        u: j.url, f: WIKI_DATE,
        s: wikiSrcName[j.host] || 'Wikimedia',
        lic: j.license || 'CC BY-SA 4.0',
      });
    }
  }
} catch (e) { console.log('wiki layer skipped:', String(e).slice(0, 90)); }
let wkAdded = 0;
for (const w of addWiki) {
  if (out.some((x) => x.ln === w.ln) || out.some((x) => x.id === w.id)) continue;
  out.push(w); wkAdded++;
}
out.sort((a, b) => (a.k === b.k ? a.t.localeCompare(b.t) : 0));
const n = (k) => out.filter((x) => x.k === k).length;
const payload = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    src: 'hinduaarti.com + Wikimedia (मराठी स्तर)',
    note: 'Full-text aarti chalisa mantra stotra bhajan sangrah as published by the listed sources; Devanagari only; nothing truncated, nothing repaired by guessing.',
    n: out.length,
  },
  items: out,
};
writeFileSync(OUT, JSON.stringify(payload) + '\n');
const bytes = JSON.stringify(payload).length;
console.log(`arti.json: ${out.length} items [aarti ${n('aarti')} | chalisa ${n('chalisa')} | mantra ${n('mantra')} | stotra ${n('stotra')} | bhajan ${n('bhajan')}] · ${Math.round(bytes / 1024)} KB raw · dropped ${JSON.stringify(drop)} · wiki +${wkAdded}/${addWiki.length}`);
const tot = out.reduce((s, x) => s + x.c, 0);
console.log(`total text: ${tot} chars · avg ${Math.round(tot / Math.max(1, out.length))}/item · min ${Math.min(...out.map((x) => x.c))}`);
if (out.length < 300) { console.error('FAIL: corpus too small — check scrape runs'); process.exit(1); }
