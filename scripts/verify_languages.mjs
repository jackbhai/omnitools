/* Languages authenticity gate — Urdu Sikho, Punjabi Sikho,
 * Gurmukhi Sikho. The correctness IS the feature here, so this
 * script machine-checks what a reader cannot afford to have wrong:
 *
 *  URDU — the haroof table is compared letter by letter (order +
 *  Unicode point) against a reference transcribed from Wikipedia's
 *  "Urdu alphabet" article (fetched 2026-11-14), and the set of
 *  letters that do not join forwards must be EXACTLY the standard
 *  non-joiners (ا د ڈ ذ ر ڑ ز ژ و) plus final-only بڑی یے.
 *  PUNJABI — must be Punjabi, not Hindi-in-Shahmukhi and not Saraiki:
 *  چاہیدا / گل / ہن / مگروں / بھلک present, میرا / تہاڈا present,
 *  Saraiki's میڈا / تیڈا / implosives (ݙ ٻ ڳ) absent, ڑ and ے in use.
 *  GURMUKHI — exactly 35 akhar in canonical order, 10 matra, and
 *  every Gurbani ladder line must exist BYTE-EXACT in the app's own
 *  shipped bani files (src/data/gurbani/*.json).
 *  ALL — script purity: Urdu/Punjabi `s` fields carry Arabic-block
 *  characters only (plus light punctuation); Gurmukhi `s` fields
 *  carry Gurmukhi-block characters only (plus the ।/॥ danda
 *  punctuation the Granth itself uses). No Devanagari inside a
 *  script field, no Latin, no cross-script leakage.
 *
 * Prints 15 seeded-random items per course for the hand spot-check.
 * Run: npm run verify:languages
 */
import { readFileSync } from 'node:fs';
import * as U from '../src/data/urdu.js';
import * as P from '../src/data/punjabi.js';
import * as G from '../src/data/gurmukhi.js';
import { mulberry32, ri } from '../src/core/games2.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  cond ? pass++ : fail++;
};

/* ------------------------------------------------------------ purity */
const inArabic = (cp) => (cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0x0750 && cp <= 0x077F)
  || (cp >= 0xFB50 && cp <= 0xFDFF) || (cp >= 0xFE70 && cp <= 0xFEFF);
const inGurmukhi = (cp) => cp >= 0x0A00 && cp <= 0x0A7F;
const PUNCT = new Set([' ', '…', ',', '?', '—', '·', '(', ')', 'ʼ']);
const badChars = (str, ok) => [...str].filter((c) => !ok(c.codePointAt(0)) && !PUNCT.has(c));
const arabicOK = (cp) => inArabic(cp);
const gurmukhiOK = (cp) => inGurmukhi(cp) || cp === 0x0964 || cp === 0x0965; // । ॥ danda

function purity(label, items, ok) {
  const bad = [];
  for (const it of items) {
    const b = badChars(it.s, ok);
    if (b.length) bad.push(`${it.s} → [${b.join(' ')}]`);
    if (it.alt) { const ba = badChars(it.alt, arabicOK); if (ba.length) bad.push(`alt ${it.alt} → [${ba.join(' ')}]`); }
  }
  check(`${label}: script fields are pure`, bad.length === 0,
    bad.length ? bad.slice(0, 4).join(' | ') : `${items.length} items scanned`);
  const empty = items.filter((it) => !it.s || !it.r || !it.hi || !it.en);
  check(`${label}: every item carries script + roman + Hindi + English`, empty.length === 0,
    empty.length ? `${empty.length} incomplete` : `${items.length} items complete`);
}

/* ---------------------------------------------------------------- URDU */
/* Reference transcribed from Wikipedia "Urdu alphabet" (2026-11-14):
 * [letter, codepoint, name]. Order is the article's dictionary order. */
const REF = [
  ['ا', 0x0627, 'alif'], ['ب', 0x0628, 'bē'], ['پ', 0x067E, 'pē'], ['ت', 0x062A, 'tē'],
  ['ٹ', 0x0679, 'ṭē'], ['ث', 0x062B, 's̱ē'], ['ج', 0x062C, 'jīm'], ['چ', 0x0686, 'cē'],
  ['ح', 0x062D, 'ḥē'], ['خ', 0x062E, 'khē'], ['د', 0x062F, 'dāl'], ['ڈ', 0x0688, 'ḍāl'],
  ['ذ', 0x0630, 'ẕāl'], ['ر', 0x0631, 'rē'], ['ڑ', 0x0691, 'ṛē'], ['ز', 0x0632, 'zē'],
  ['ژ', 0x0698, 'zhē'], ['س', 0x0633, 'sīn'], ['ش', 0x0634, 'shīn'], ['ص', 0x0635, 'ṣwād'],
  ['ض', 0x0636, 'ẓwād'], ['ط', 0x0637, 'ṭoʼē'], ['ظ', 0x0638, 'ẓoʼē'], ['ع', 0x0639, 'ain'],
  ['غ', 0x063A, 'ghain'], ['ف', 0x0641, 'fē'], ['ق', 0x0642, 'qāf'], ['ک', 0x06A9, 'kāf'],
  ['گ', 0x06AF, 'gāf'], ['ل', 0x0644, 'lām'], ['م', 0x0645, 'mīm'], ['ن', 0x0646, 'nūn'],
  ['ں', 0x06BA, 'nūn ghunnā'], ['و', 0x0648, 'wāʼo'], ['ہ', 0x06C1, 'hē'], ['ھ', 0x06BE, 'do-cashmī hē'],
  ['ی', 0x06CC, 'yē'], ['ے', 0x06D2, 'baṛī yē'],
];
check('Urdu: 38 haroof', U.LETTERS.length === 38, `${U.LETTERS.length} letters`);
const seqBad = U.LETTERS.filter((l, i) => !REF[i] || l.ch !== REF[i][0] || l.ch.codePointAt(0) !== REF[i][1]);
check('Urdu: letter order + Unicode points match the Wikipedia reference exactly', seqBad.length === 0,
  seqBad.length ? seqBad.map((l) => l.ch).join(' ') : '38/38 in order');
const TASK_NONJOIN = ['ا', 'د', 'ڈ', 'ذ', 'ر', 'ڑ', 'ز', 'ژ', 'و'];
check('Urdu: non-joiner set is EXACTLY ا د ڈ ذ ر ڑ ز ژ و',
  JSON.stringify([...U.NON_JOINERS].sort()) === JSON.stringify([...TASK_NONJOIN].sort()),
  `data set: ${U.NON_JOINERS.join(' ')}`);
const noForward = U.LETTERS.filter((l) => l.join !== 'both').map((l) => l.ch);
check('Urdu: letters with no forward join = non-joiners + final-only ے',
  JSON.stringify([...noForward].sort()) === JSON.stringify([...TASK_NONJOIN, 'ے'].sort()),
  noForward.join(' '));
check('Urdu: بڑی یے marked final-only, واؤ marked non-joiner',
  U.LETTERS.find((l) => l.ch === 'ے').join === 'final' && U.LETTERS.find((l) => l.ch === 'و').join === 'right');
check('Urdu: 10 Sabaq, numbers 1–20', U.SABAK.length === 10 && U.NUMBERS.length === 20,
  `${U.SABAK.length} sabaq · ${U.NUMBERS.length} numbers · ${U.PHRASE_COUNT} counted lines`);
const urduJoined = U.ALL_ITEMS.map((i) => i.s).join(' ');
check('Urdu: no Saraiki implosives (ݙ ٻ ڳ) in Urdu lines', !/[ݙٻڳ]/.test(urduJoined));
purity('Urdu', [...U.ALL_ITEMS, ...U.NUMBER_ITEMS], arabicOK);

/* ------------------------------------------------------------- PUNJABI */
check('Punjabi: 10 Sabaq, numbers 1–20', P.SABAK.length === 10 && P.NUMBERS.length === 20,
  `${P.SABAK.length} sabaq · ${P.NUMBERS.length} numbers · ${P.PHRASE_COUNT} counted lines`);
const pj = P.ALL_ITEMS.map((i) => i.s).join(' ');
for (const marker of ['چاہیدا', 'گل', 'ہن', 'مگروں', 'بھلک', 'چنگا', 'سواد']) {
  check(`Punjabi: marker ${marker} present`, pj.includes(marker));
}
check('Punjabi: possessives میرا / تہاڈا present (Punjabi, not Saraiki)',
  pj.includes('میرا') && pj.includes('تہاڈا'));
check('Punjabi: Saraiki میڈا / تیڈا absent', !pj.includes('میڈا') && !pj.includes('تیڈا'));
check('Punjabi: no Saraiki implosives (ݙ ٻ ڳ)', !/[ݙٻڳ]/.test(pj));
check('Punjabi: ڑ and ے genuinely in use', pj.includes('ڑ') && pj.includes('ے'),
  `ڑ ×${pj.split('ڑ').length - 1} · ے ×${pj.split('ے').length - 1}`);
check('Punjabi: the -دا present and چاہیدا frames exist',
  pj.includes('لگدا اے') && pj.includes('جاندا اے') && pj.includes('چاہیدا اے'));
purity('Punjabi', [...P.ALL_ITEMS, ...P.NUMBER_ITEMS], arabicOK);

/* ------------------------------------------------------------ GURMUKHI */
const CANON = 'ੳਅੲਸਹਕਖਗਘਙਚਛਜਝਞਟਠਡਢਣਤਥਦਧਨਪਫਬਭਮਯਰਲਵੜ';
check('Gurmukhi: exactly 35 akhar', G.AKHAR.length === 35, `${G.AKHAR.length} letters`);
check('Gurmukhi: akhar in canonical paintī order', G.AKHAR.map((a) => a.ch).join('') === CANON);
check('Gurmukhi: 10 matra in teaching order',
  G.MATRA.map((m) => m.name).join(',') === 'muktā,kannā,sihārī,bihārī,aiṅkaṛ,dulaiṅkaṛ,lāṉ,dulāṉvāṉ,hoṛā,kanauṛā',
  G.MATRA.map((m) => m.name).join(' · '));
check('Gurmukhi: lagaan = bindī, ṭippī, adhak',
  G.LAGAAN.map((m) => m.name).join(',') === 'bindī,ṭippī,adhak');
check('Gurmukhi: matra examples really carry their signs',
  G.MATRA.slice(1).every((m) => m.ex.length >= 2) && G.MATRA.find((m) => m.name === 'sihārī').ex === 'ਕਿ');
purity('Gurmukhi', [...G.WORD_ITEMS, ...G.LINE_ITEMS], gurmukhiOK);
check('Gurmukhi: every bridge word carries a Shahmukhi twin',
  G.WORDS.every((w) => w.alt && badChars(w.alt, arabicOK).length === 0), `${G.WORDS.length} words`);

/* Gurbani lines byte-exact against the shipped bani files. */
const baniCache = {};
const baniLines = (tok) => {
  if (!baniCache[tok]) {
    const p = new URL(`../src/data/gurbani/bani-${tok}.json`, import.meta.url);
    baniCache[tok] = JSON.parse(readFileSync(p, 'utf8')).lines.map((l) => l.g);
  }
  return baniCache[tok];
};
for (const line of G.GURBANI_LINES) {
  check(`Gurbani line byte-exact in bani-${line.bani}.json`, baniLines(line.bani).includes(line.g),
    line.src);
  const wordsOk = line.words.every(([w]) => line.g.includes(w));
  check(`Gurbani word-split of “${line.g.slice(0, 18)}…” covers real words`, wordsOk,
    `${line.words.length} words`);
}

/* ------------------------------------------------- seeded spot-checks */
function spot(label, items, seed) {
  const rng = mulberry32(seed);
  const drawn = new Set();
  console.log(`\n--- 15 random ${label} entries (hand spot-check) ---`);
  while (drawn.size < Math.min(15, items.length)) {
    const it = items[ri(rng, items.length)];
    if (drawn.has(it.s)) continue;
    drawn.add(it.s);
    console.log(`• ${it.s}  |  ${it.r}  |  ${it.en}`);
  }
}
spot('Urdu', U.ALL_ITEMS, 20261114);
spot('Punjabi', P.ALL_ITEMS, 20261115);
spot('Gurmukhi words', G.WORD_ITEMS, 20261116);

console.log(`\nCounts — Urdu: ${U.LETTERS.length} letters + ${U.HELPERS.length} helpers, ${U.SABAK.length} sabaq, ${U.PHRASE_COUNT} lines | Punjabi: ${P.SABAK.length} sabaq, ${P.PHRASE_COUNT} lines | Gurmukhi: ${G.AKHAR.length} akhar, ${G.MATRA.length} matra, ${G.LAGAAN.length} lagaan, ${G.WORDS.length} words, ${G.GURBANI_LINES.length} Gurbani lines`);
console.log(`verify:languages — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
