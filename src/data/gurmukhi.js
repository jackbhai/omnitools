/**
 * gurmukhi.js — Gurmukhi Sikho course data. HAND-BUILT for this app.
 *
 * This is the SCRIPT course: the goal is to READ Punjabi — and above
 * all to read Gurbani in its own script. The 35 akhar in canonical
 * paintī order, the matra (vowel signs) and lagaan (extra marks),
 * then a reading ladder: letters → signs → words the learner already
 * knows from the spoken courses (with Shahmukhi bridges) → real
 * Gurbani lines.
 *
 * The Gurbani lines are NOT retyped from memory: each `g` string is
 * copied byte-for-byte from this app's own shipped bani data
 * (src/data/gurbani/bani-*.json — the same files the Gurbani reader
 * serves) and the verifier re-checks every one against those files.
 * Only the learner's Roman and the word-by-word glosses are new.
 *
 * Word items: { s: Gurmukhi, alt: Shahmukhi bridge, r: Roman,
 * hi: Hindi, en: English, n: step }.
 */

const W = (s, alt, r, hi, en) => ({ s, alt, r, hi, en });

/* ------------------------------------------------------- the 35 akhar */
/* Canonical order: the three vowel-carriers, ਸ ਹ, then the five
 * varg rows of five, then ਯ ਰ ਲ ਵ ੜ. */
export const AKHAR = [
  { ch: 'ੳ', name: 'ūṛā', sound: 'u', en: 'vowel carrier — u as in put; also carries o' },
  { ch: 'ਅ', name: 'aiṛā', sound: 'a', en: 'vowel carrier — a as in about' },
  { ch: 'ੲ', name: 'īṛī', sound: 'i', en: 'vowel carrier — i as in it; also carries e' },
  { ch: 'ਸ', name: 'sassā', sound: 'sa', en: 's — the last of the carriers’ row' },
  { ch: 'ਹ', name: 'hāhā', sound: 'ha', en: 'h' },
  { ch: 'ਕ', name: 'kakkā', sound: 'ka', en: 'k' },
  { ch: 'ਖ', name: 'khakkhā', sound: 'kha', en: 'kh — breathed k' },
  { ch: 'ਗ', name: 'gaggā', sound: 'ga', en: 'g' },
  { ch: 'ਘ', name: 'ghaggā', sound: 'gha', en: 'in Punjabi said with a low tone, not a breath' },
  { ch: 'ਙ', name: 'ṅaṅṅā', sound: 'nga', en: 'the ng of sing — rare in real words' },
  { ch: 'ਚ', name: 'chachchā', sound: 'cha', en: 'ch as in church' },
  { ch: 'ਛ', name: 'chhachhā', sound: 'chha', en: 'chh — breathed ch' },
  { ch: 'ਜ', name: 'jajjā', sound: 'ja', en: 'j' },
  { ch: 'ਝ', name: 'jhajjā', sound: 'jha', en: 'in Punjabi said with a low tone' },
  { ch: 'ਞ', name: 'ñaṅñā', sound: 'nya', en: 'the ny of canyon — rare in real words' },
  { ch: 'ਟ', name: 'ṭaiṅkā', sound: 'ṭa', en: 'hard ṭ — tongue curled back' },
  { ch: 'ਠ', name: 'ṭhaṭṭhā', sound: 'ṭha', en: 'hard ṭh — breathed' },
  { ch: 'ਡ', name: 'ḍaiṅgā', sound: 'ḍa', en: 'hard ḍ' },
  { ch: 'ਢ', name: 'ḍhaḍḍā', sound: 'ḍha', en: 'in Punjabi said with a low tone' },
  { ch: 'ਣ', name: 'ṇāṇā', sound: 'ṇa', en: 'hard ṇ — Punjabi loves this letter; Hindi barely uses it' },
  { ch: 'ਤ', name: 'tattā', sound: 'ta', en: 'soft t — tongue on the teeth' },
  { ch: 'ਥ', name: 'thatthā', sound: 'tha', en: 'soft th — breathed' },
  { ch: 'ਦ', name: 'daddā', sound: 'da', en: 'soft d' },
  { ch: 'ਧ', name: 'dhaddā', sound: 'dha', en: 'in Punjabi said with a low tone' },
  { ch: 'ਨ', name: 'nannā', sound: 'na', en: 'n' },
  { ch: 'ਪ', name: 'pappā', sound: 'pa', en: 'p' },
  { ch: 'ਫ', name: 'phapphā', sound: 'pha', en: 'ph — breathed p; also read fa in loanwords' },
  { ch: 'ਬ', name: 'babbā', sound: 'ba', en: 'b' },
  { ch: 'ਭ', name: 'bhabbā', sound: 'bha', en: 'in Punjabi said with a low tone' },
  { ch: 'ਮ', name: 'mammā', sound: 'ma', en: 'm' },
  { ch: 'ਯ', name: 'yayyā', sound: 'ya', en: 'y' },
  { ch: 'ਰ', name: 'rārā', sound: 'ra', en: 'r — a light tap' },
  { ch: 'ਲ', name: 'lallā', sound: 'la', en: 'l' },
  { ch: 'ਵ', name: 'vavvā', sound: 'va', en: 'v / w between vowels' },
  { ch: 'ੜ', name: 'ṛāṛā', sound: 'ṛa', en: 'hard flapped ṛ — the last letter, added for Punjabi' },
];

/* ------------------------------------------------------------- matra */
/* Shown on ਕ (kakkā). Muktā is the absence of a sign. */
export const MATRA = [
  { name: 'muktā', sign: '—', ex: 'ਕ', rom: 'ka', sound: 'a', en: 'no sign at all — every letter carries a short “a” by birth' },
  { name: 'kannā', sign: 'ਾ', ex: 'ਕਾ', rom: 'kā', sound: 'ā', en: 'the tall stroke after — long ā' },
  { name: 'sihārī', sign: 'ਿ', ex: 'ਕਿ', rom: 'ki', sound: 'i', en: 'written BEFORE the letter, spoken after it — the famous Gurmukhi twist' },
  { name: 'bihārī', sign: 'ੀ', ex: 'ਕੀ', rom: 'kī', sound: 'ī', en: 'long ī' },
  { name: 'aiṅkaṛ', sign: 'ੁ', ex: 'ਕੁ', rom: 'ku', sound: 'u', en: 'the hook below — short u' },
  { name: 'dulaiṅkaṛ', sign: 'ੂ', ex: 'ਕੂ', rom: 'kū', sound: 'ū', en: 'the double hook below — long ū' },
  { name: 'lāṉ', sign: 'ੇ', ex: 'ਕੇ', rom: 'ke', sound: 'e', en: 'the stroke above — e' },
  { name: 'dulāṉvāṉ', sign: 'ੈ', ex: 'ਕੈ', rom: 'kai', sound: 'ai', en: 'the double stroke above — ai' },
  { name: 'hoṛā', sign: 'ੋ', ex: 'ਕੋ', rom: 'ko', sound: 'o', en: 'above and after — o' },
  { name: 'kanauṛā', sign: 'ੌ', ex: 'ਕੌ', rom: 'kau', sound: 'au', en: 'the double mark — au' },
];

/* ------------------------------------------------------------ lagaan */
export const LAGAAN = [
  { name: 'bindī', sign: 'ਂ', ex: 'ਪੰਜਾਬ', rom: 'Paṉjāb', en: 'the dot above — a nasal hum; used after long vowels' },
  { name: 'ṭippī', sign: 'ੰ', ex: 'ਪੰਜ', rom: 'panj — five', en: 'the tighter nasal, used with short vowels before a consonant' },
  { name: 'adhak', sign: 'ੱ', ex: 'ਸੱਚਾ', rom: 'sachchā — true, truthful', en: 'the mark that doubles the next letter: say it twice as hard' },
];

/* ------------------------------------------- ladder step 3: the words */
export const WORDS = [
  W('ਪਾਣੀ', 'پانی', 'pānī', 'पानी', 'water'),
  W('ਰੋਟੀ', 'روٹی', 'roṭī', 'रोटी', 'bread, roti'),
  W('ਘਰ', 'گھر', 'ghar', 'घर', 'home, house'),
  W('ਮਾਂ', 'ماں', 'māṉ', 'माँ', 'mother'),
  W('ਪਿਉ', 'پیو', 'piu', 'पिता', 'father'),
  W('ਭਰਾ', 'بھرا', 'bhrā', 'भाई', 'brother'),
  W('ਭੈਣ', 'بھیݨ', 'bhaiṇ', 'बहन', 'sister'),
  W('ਸਕੂਲ', 'سکول', 'skūl', 'स्कूल', 'school'),
  W('ਕਿਤਾਬ', 'کتاب', 'kitāb', 'किताब', 'book'),
  W('ਪੈਸਾ', 'پیسہ', 'paisā', 'पैसा', 'money'),
  W('ਦੁੱਧ', 'ددھ', 'duddh', 'दूध', 'milk'),
  W('ਸਬਜ਼ੀ', 'سبزی', 'sabzī', 'सब्ज़ी', 'vegetables'),
  W('ਫਲ', 'پھل', 'phal', 'फल', 'fruit'),
  W('ਪਿੰਡ', 'پنڈ', 'piṇḍ', 'गाँव', 'village'),
  W('ਸ਼ਹਿਰ', 'شہر', 'shahir', 'शहर', 'city'),
  W('ਰਸਤਾ', 'رستہ', 'rastā', 'रास्ता', 'road, way'),
  W('ਮੌਸਮ', 'موسم', 'mosam', 'मौसम', 'weather'),
  W('ਚੰਗਾ', 'چنگا', 'changā', 'अच्छा', 'good'),
  W('ਵੱਡਾ', 'وڈا', 'vaḍḍā', 'बड़ा', 'big'),
  W('ਛੋਟਾ', 'چھوٹا', 'chhoṭā', 'छोटा', 'small'),
  W('ਗਰਮ', 'گرم', 'garam', 'गर्म', 'hot'),
  W('ਠੰਡਾ', 'ٹھنڈا', 'ṭhanḍā', 'ठंडा', 'cold'),
  W('ਨਵਾਂ', 'نواں', 'navāṉ', 'नया', 'new'),
  W('ਪੁਰਾਣਾ', 'پرانا', 'purāṇā', 'पुराना', 'old'),
  W('ਦੋਸਤ', 'دوست', 'dost', 'दोस्त', 'friend'),
  W('ਪਿਆਰ', 'پیار', 'piār', 'प्यार', 'love'),
  W('ਖੁਸ਼', 'خوش', 'khush', 'ख़ुश', 'happy'),
  W('ਨਾਮ', 'نام', 'nām', 'नाम', 'name'),
  W('ਕੰਮ', 'کم', 'kamm', 'काम', 'work'),
  W('ਦਿਨ', 'دن', 'din', 'दिन', 'day'),
  W('ਰਾਤ', 'رات', 'rāt', 'रात', 'night'),
  W('ਸੂਰਜ', 'سورج', 'sūraj', 'सूरज', 'sun'),
  W('ਚੰਦ', 'چند', 'chand', 'चाँद', 'moon'),
];

/* ------------------------------ ladder step 4: real Gurbani, read slowly */
/* `g` is byte-exact from the app's shipped bani files (see header);
 * `bani` names the file the verifier must find the line in. */
export const GURBANI_LINES = [
  {
    g: 'ੴ ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ਨਿਰਭਉ ਨਿਰਵੈਰੁ ਅਕਾਲ ਮੂਰਤਿ ਅਜੂਨੀ ਸੈਭੰ ਗੁਰ ਪ੍ਰਸਾਦਿ ॥',
    r: 'ik oankār sat nām kartā purakh nirbhau nirvair akāl mūrat ajūnī saibhaṉ gur prasād',
    src: 'Japji Sahib · the Mool Mantar · Sri Guru Granth Sahib, Ang 1', bani: 'japji',
    en: 'God is One. Truth is His Name — the Creator, present in all, without fear, without enmity, timeless in form, never born, self-existent; known by the Guru’s grace.',
    words: [
      ['ੴ', 'ik oankār', 'the One God'], ['ਸਤਿ', 'sat', 'Truth, eternal'], ['ਨਾਮੁ', 'nām', 'the Name'],
      ['ਕਰਤਾ', 'kartā', 'the Creator'], ['ਪੁਰਖੁ', 'purakh', 'the Being in all'], ['ਨਿਰਭਉ', 'nirbhau', 'without fear'],
      ['ਨਿਰਵੈਰੁ', 'nirvair', 'without enmity'], ['ਅਕਾਲ', 'akāl', 'timeless'], ['ਮੂਰਤਿ', 'mūrat', 'form'],
      ['ਅਜੂਨੀ', 'ajūnī', 'never born'], ['ਸੈਭੰ', 'saibhaṉ', 'self-existent'], ['ਗੁਰ', 'gur', 'the Guru'],
      ['ਪ੍ਰਸਾਦਿ', 'prasād', 'by the grace'],
    ],
  },
  {
    g: 'ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥',
    r: 'ād sach jugād sach',
    src: 'Japji Sahib · the opening Salok · Ang 1', bani: 'japji',
    en: 'True in the primal beginning; true through every age.',
    words: [
      ['ਆਦਿ', 'ād', 'in the beginning'], ['ਸਚੁ', 'sach', 'True'], ['ਜੁਗਾਦਿ', 'jugād', 'through all the ages'], ['ਸਚੁ', 'sach', 'True'],
    ],
  },
  {
    g: 'ਹੈ ਭੀ ਸਚੁ ਨਾਨਕ ਹੋਸੀ ਭੀ ਸਚੁ ॥੧॥',
    r: 'hai bhī sach Nānak hosī bhī sach',
    src: 'Japji Sahib · the opening Salok · Ang 1', bani: 'japji',
    en: 'True here and now; O Nanak, He shall ever be true.',
    words: [
      ['ਹੈ', 'hai', 'is (now)'], ['ਭੀ', 'bhī', 'also'], ['ਸਚੁ', 'sach', 'True'], ['ਨਾਨਕ', 'Nānak', 'Nanak — the Guru signs his name'],
      ['ਹੋਸੀ', 'hosī', 'shall be'], ['ਭੀ', 'bhī', 'also'], ['ਸਚੁ', 'sach', 'True'],
    ],
  },
  {
    g: 'ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥',
    r: 'sochai soch na hovaī je sochī lakh vār',
    src: 'Japji Sahib · Pauri 1 · Ang 1', bani: 'japji',
    en: 'By thinking alone He cannot be reached — even if one thinks a hundred thousand times.',
    words: [
      ['ਸੋਚੈ', 'sochai', 'by thinking'], ['ਸੋਚਿ', 'soch', 'thought'], ['ਨ', 'na', 'not'], ['ਹੋਵਈ', 'hovaī', 'is attained'],
      ['ਜੇ', 'je', 'even if'], ['ਸੋਚੀ', 'sochī', 'one thinks'], ['ਲਖ', 'lakh', 'a hundred thousand'], ['ਵਾਰ', 'vār', 'times'],
    ],
  },
  {
    g: 'ਅਨੰਦੁ ਭਇਆ ਮੇਰੀ ਮਾਏ ਸਤਿਗੁਰੂ ਮੈ ਪਾਇਆ ॥',
    r: 'anand bhaiā merī māe satigurū mai pāiā',
    src: 'Anand Sahib · the opening · Ang 917', bani: 'anand',
    en: 'Bliss has come, O my mother — I have found the True Guru.',
    words: [
      ['ਅਨੰਦੁ', 'anand', 'bliss'], ['ਭਇਆ', 'bhaiā', 'has come about'], ['ਮੇਰੀ', 'merī', 'my'], ['ਮਾਏ', 'māe', 'O mother'],
      ['ਸਤਿਗੁਰੂ', 'satigurū', 'the True Guru'], ['ਮੈ', 'mai', 'I'], ['ਪਾਇਆ', 'pāiā', 'have found'],
    ],
  },
  {
    g: 'ਹਮਰੀ ਕਰੋ ਹਾਥ ਦੈ ਰੱਛਾ ॥',
    r: 'hamrī karo hāth dai rachhā',
    src: 'Benti Chaupai Sahib · the beloved prayer of the Nitnem', bani: 'chaupai',
    en: 'Place Your protecting hand over me.',
    words: [
      ['ਹਮਰੀ', 'hamrī', 'over me / us'], ['ਕਰੋ', 'karo', 'place, do'], ['ਹਾਥ', 'hāth', 'hand'], ['ਦੈ', 'dai', 'giving'], ['ਰੱਛਾ', 'rachhā', 'protection'],
    ],
  },
  {
    g: 'ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਹ ॥',
    r: 'srī Vāhigurū jī kī fatah',
    src: 'Jaap Sahib · the opening salutation', bani: 'jaap',
    en: 'Victory belongs to the Wondrous Guru.',
    words: [
      ['ਸ੍ਰੀ', 'srī', 'revered'], ['ਵਾਹਿਗੁਰੂ', 'Vāhigurū', 'the Wondrous Guru — God'], ['ਜੀ', 'jī', '(said with respect)'], ['ਕੀ', 'kī', 'belongs to'], ['ਫਤਹ', 'fatah', 'victory'],
    ],
  },
];

export const NOTES = [
  'Every Gurmukhi letter hangs from the headline — the sirlekh. Words are one unbroken headline; read letter by letter along it.',
  'The inherent vowel: a bare letter says its name’s first syllable — ਕ is “ka”, not “k”. A letter that must stand without its “a” takes a halant (੍) below, as in ਪ੍ਰਸਾਦਿ (pra-sā-di).',
  'ਸਿਹਾਰੀ (ਿ) is written before its letter but spoken after it: ਕਿ is written “i + k” and read “ki”. This one rule unlocks half of all real words.',
  'ਘ ਝ ਢ ਧ ਭ are not really breathed in Punjabi — they mark the LOW TONE. ਘੋੜਾ “ghòṛā” (a horse) said flat and low is a different word from its high-twin.',
  'The lines in step 4 are served word-for-word by this app’s own Gurbani reader — open the Japji Sahib bani there to hear each line in full.',
];

/* ------------------------------------------------------- drill pools */
export const LETTER_ITEMS = AKHAR.map((a) => ({
  s: a.ch, r: `${a.name} — ${a.sound}`, hi: a.name, en: `the letter ${a.sound} (${a.name})`, n: 0,
}));
export const WORD_ITEMS = WORDS.map((w) => ({ ...w, n: 1 }));
export const LINE_ITEMS = GURBANI_LINES.map((l, i) => ({
  s: l.g, r: l.r, hi: l.src, en: l.en, n: 2, lineIdx: i,
}));
export const VOCAB = [...LETTER_ITEMS, ...WORD_ITEMS];
export const PHRASE_COUNT = AKHAR.length + MATRA.length + LAGAAN.length + WORDS.length + GURBANI_LINES.length;
