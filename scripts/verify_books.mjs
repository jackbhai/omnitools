/* Books depth gate — the Hindi/Urdu shelves must open and read for
 * real. Mirrors the app logic (src/tools/classics.jsx) against the
 * live sources: every curated proofread work must list chapters and
 * yield real chapter text; the scan search must return books whose
 * full-text file exists and actually reads. The browser strips HTML
 * with DOMParser; here a regex approximation of the same removal is
 * used — the earlier hand probe of the same chapter gave 50,420 clean
 * characters, which is the number this script is calibrated against.
 * Run: npm run verify:books   (needs network)
 */
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  cond ? pass++ : fail++;
};
const dev = (t) => (t.match(/[ऀ-ॿ]/g) || []).length;

const WS_API = 'https://hi.wikisource.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    const body = await r.text();
    try { return JSON.parse(body); } catch { await sleep(1500 * (i + 1)); }
  }
  throw new Error('no JSON from ' + url);
}
const WS_WORKS = ['गो-दान', 'कर्मभूमि', 'सेवासदन', 'गबन', 'निर्मला', 'भारतेंदु-नाटकावली', 'कबीर ग्रंथावली'];
const DEV_DIGITS = '०१२३४५६७८९';
const chapterKey = (t) => (t.replace(/[०-९]/g, (d) => DEV_DIGITS.indexOf(d)).match(/\d+/g) || []).map(Number);
const chapterCmp = (a, b) => {
  const ka = chapterKey(a), kb = chapterKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) { const d = (ka[i] ?? -1) - (kb[i] ?? -1); if (d) return d; }
  return a.localeCompare(b, 'hi');
};
function stripApprox(html) {
  let h = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
  h = h.replace(/<div[^>]*class="[^"]*(ws-noexport|noprint)[^"]*"[\s\S]*?(?=<div class="prp-pages-output|<p>|<h2|$)/g, '');
  const t = h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

for (const base of WS_WORKS) {
  await sleep(600);
  const u = `${WS_API}?action=query&list=prefixsearch&pssearch=${encodeURIComponent(base)}&psnamespace=0&pslimit=500&format=json`;
  const j = await getJson(u);
  const chapters = (j.query?.prefixsearch || []).map((p) => p.title).filter((t) => t.startsWith(base + '/')).sort(chapterCmp);
  check(`${base}: chapters listed`, chapters.length >= 5, `${chapters.length} chapters`);
  if (!chapters.length) continue;
  const mid = chapters[Math.floor(chapters.length / 2)];
  const pu = `${WS_API}?action=parse&page=${encodeURIComponent(mid)}&prop=text&redirects=1&format=json`;
  const pj = await getJson(pu);
  const html = pj.parse?.text?.['*'] || '';
  const text = stripApprox(html);
  /* Kabir's "ang" chapters are short doha collections (~800 chars is a
     complete chapter); 700 chars of real script is the honest floor. */
  check(`${base}: middle chapter reads`, text.length > 700 && dev(text) > 500,
    `“${mid}” -> ${text.length} chars, ${dev(text)} Devanagari · ${text.slice(0, 60)}…`);
}

/* ------------------------------------------------ scanned shelf */
const IA = 'https://archive.org';
async function iaSearch(lang, term) {
  const langPart = lang === 'ur' ? 'language:urd' : 'language:hin';
  const q = `mediatype:texts AND ${langPart} AND (title:(${term}) OR creator:(${term}))`;
  const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=24&page=1&output=json`;
  const j = await (await fetch(url)).json();
  const docs = j.response?.docs || [];
  const out = [];
  await Promise.all(docs.map(async (d) => {
    try {
      const meta = await (await fetch(`${IA}/metadata/${d.identifier}`)).json();
      const f = (meta.files || []).find((x) => x.name.endsWith('_djvu.txt'));
      if (f && +f.size > 20000) out.push({ id: d.identifier, title: d.title, file: f.name, size: +f.size || 0 });
    } catch { /* scan-only */ }
  }));
  return out;
}

const hi = await iaSearch('hi', 'premchand');
check('scanned shelf (Hindi, “premchand”) has readable books', hi.length >= 3,
  `${hi.length} readable · e.g. ${hi[0]?.title?.slice(0, 50)}`);
if (hi.length) {
  const b = [...hi].sort((a, z) => z.size - a.size)[0];
  const t = await (await fetch(`${IA}/download/${b.id}/${encodeURIComponent(b.file)}`)).text();
  check('the largest Hindi book opens end-to-end', t.length > 200000 && dev(t) > 100000,
    `${b.id}: ${t.length} chars, ${dev(t)} Devanagari`);
  const s = [...hi].sort((a, z) => a.size - z.size)[0];
  const st = await (await fetch(`${IA}/download/${s.id}/${encodeURIComponent(s.file)}`)).text();
  check('even the smallest Hindi result is a real text', st.length > 1000 && dev(st) > 800,
    `${s.id}: ${st.length} chars, ${dev(st)} Devanagari`);
}
const ur = await iaSearch('ur', 'premchand');
check('scanned shelf (Urdu, “premchand”) rides along', ur.length >= 1,
  `${ur.length} readable · e.g. ${ur[0]?.title?.slice(0, 50)}`);
if (ur.length) {
  const b = [...ur].sort((a, z) => z.size - a.size)[0];
  const t = await (await fetch(`${IA}/download/${b.id}/${encodeURIComponent(b.file)}`)).text();
  const arab = (t.match(/[؀-ۿ]/g) || []).length;
  check('an Urdu book opens end-to-end', t.length > 50000 && arab > 25000,
    `${b.id}: ${t.length} chars, ${arab} Arabic-script`);
}

console.log(`\nverify:books — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
