/* Saraiki authenticity gate — the course must stay Saraiki, never
 * Punjabi in disguise. Machine-checks every vocabulary line: the
 * Urdu/Punjabi possessives میرا / تیرا must appear NOWHERE in a vocab
 * string, the signature forms (میڈا / تیڈا / کِتھاں) and the implosive
 * letters (ݙ ٻ ڳ ݨ) must be present and growing, and the new Sabaq
 * 15–18 + opinion frames must exist with real depth. Prints 15 seeded
 * random NEW entries for the hand spot-check in the run report.
 * Run: npm run verify:saraiki
 */
import { SABAK, VERBS, NUMBERS, OPINIONS, VOCAB, PHRASE_COUNT } from '../src/data/saraiki.js';
import { mulberry32, ri } from '../src/core/games2.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  cond ? pass++ : fail++;
};

const BAD = ['میرا', 'تیرا'];
const allLines = [
  ...SABAK.flatMap((sb) => sb.items.map((it) => ({ where: `Sabaq ${sb.n}`, it }))),
  ...VERBS.flatMap((v) => [v.inf, v.pres, v.past, v.fut].map((it) => ({ where: 'verb table', it }))),
  ...OPINIONS.map((it) => ({ where: 'opinions', it })),
];
const badHits = allLines.filter(({ it }) => BAD.some((b) => it.s.includes(b)));
check('میرا / تیرا absent from every vocabulary line', badHits.length === 0,
  badHits.length ? badHits.map((h) => `${h.where}: ${h.it.s}`).join(' | ') : `${allLines.length} lines scanned`);

const joined = allLines.map(({ it }) => it.s).join(' ');
const count = (ch) => joined.split(ch).length - 1;
check('میڈا present', joined.includes('میڈا') || joined.includes('مِیݙا'));
check('تیڈا present', joined.includes('تیڈا') || joined.includes('تِیݙا'));
check('کِتھاں present', joined.includes('تھاں'));
check('ݙُو is 2 and ݙَاہ is 10', NUMBERS[1][1] === 'ݙُو' && NUMBERS[9][1] === 'ݙَاہ',
  `2=${NUMBERS[1][1]} · 10=${NUMBERS[9][1]}`);
check('implosive letters grew past the Wave A floor (ݙ ×>42, ٻ ×>15)',
  count('ݙ') > 42 && count('ٻ') > 15, `ݙ ×${count('ݙ')} · ٻ ×${count('ٻ')} · ڳ ×${count('ڳ')} · ݨ ×${count('ݨ')}`);

for (const n of [15, 16, 17, 18]) {
  const sb = SABAK.find((s) => s.n === n);
  check(`Sabaq ${n} exists with real depth`, !!sb && sb.items.length >= 12,
    sb ? `${sb.items.length} items — ${sb.title}` : 'missing');
}
check('opinion frames present', OPINIONS.length >= 8, `${OPINIONS.length} frames`);
check('Sabaq sequence is 1..18 complete',
  SABAK.map((s) => s.n).join(',') === Array.from({ length: 18 }, (_, i) => i + 1).join(','));
check('phrase count grew past 197', PHRASE_COUNT > 197, `PHRASE_COUNT=${PHRASE_COUNT}`);
check('drill pool covers every line', VOCAB.length >= PHRASE_COUNT,
  `VOCAB=${VOCAB.length}`);

/* 15 seeded-random NEW entries (Sabaq 15–18 + opinions) for hand-check. */
const fresh = [...SABAK.filter((s) => s.n >= 15).flatMap((s) => s.items), ...OPINIONS];
const rng = mulberry32(20261114);
const drawn = new Set();
console.log('\n--- 15 random new entries (hand spot-check) ---');
while (drawn.size < 15) {
  const it = fresh[ri(rng, fresh.length)];
  if (drawn.has(it.s)) continue;
  drawn.add(it.s);
  console.log(`• ${it.s}  |  ${it.r}  |  ${it.en}`);
}

console.log(`\nverify:saraiki — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
