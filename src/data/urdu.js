/**
 * urdu.js — Urdu Sikho course data. HAND-BUILT for this app.
 *
 * Script-first: the haroof table below was cross-checked against
 * Wikipedia's "Urdu alphabet" article (fetched 2026-11-14): letter
 * order, names, Unicode points and joined forms all follow it.
 * The non-joiners — letters that join to what comes BEFORE them but
 * never to what follows — are exactly: ا د ڈ ذ ر ڑ ز ژ و
 * (alif, dāl, ḍāl, ẕāl, rē, ṛē, zē, zhē, wāʼo). بڑی یے (ے) is a special
 * case: it only ever appears at the end of a word. The verifier
 * (scripts/verify_languages.mjs) re-asserts this set against a
 * reference table transcribed from that same article.
 *
 * Every phrase item: { s: Urdu (Nastaliq), r: Roman Urdu, hi: Hindi,
 * en: English }. Light vowel marks (zabar/zer/pesh) are used on some
 * words as a learner's aid, as in the Saraiki course.
 */

const I = (s, r, hi, en) => ({ s, r, hi, en });

/* ------------------------------------------------------------ haroof */
/* join: 'both'  — joins to the letter before AND after it
 *       'right' — joins only to the letter before it (a "non-joiner":
 *                 nothing after it ever connects)
 *       'final' — only ever the last letter of a word (بڑی یے)
 * Forms are shaped from these flags by the tool (final = ـX,
 * medial = ـXـ, initial = Xـ); non-joiners have no medial/initial. */
export const LETTERS = [
  { ch: 'ا', name: 'alif', ur: 'الف', rom: 'ā', ipa: '/ɑː/', join: 'right', ex: 'اردو', exr: 'Urdū', exe: 'the word “Urdu” itself' },
  { ch: 'ب', name: 'bē', ur: 'بے', rom: 'b', ipa: '/b/', join: 'both', ex: 'باپ', exr: 'bāp', exe: 'father' },
  { ch: 'پ', name: 'pē', ur: 'پے', rom: 'p', ipa: '/p/', join: 'both', ex: 'پانی', exr: 'pānī', exe: 'water' },
  { ch: 'ت', name: 'tē', ur: 'تے', rom: 't', ipa: '/t/', join: 'both', ex: 'تم', exr: 'tum', exe: 'you' },
  { ch: 'ٹ', name: 'ṭē', ur: 'ٹے', rom: 'ṭ', ipa: '/ʈ/', join: 'both', ex: 'ٹھیک', exr: 'ṭhīk', exe: 'fine, correct' },
  { ch: 'ث', name: 's̱ē', ur: 'ثے', rom: 's̱', ipa: '/s/', join: 'both', ex: 'ثابت', exr: 's̱ābit', exe: 'proven' },
  { ch: 'ج', name: 'jīm', ur: 'جیم', rom: 'j', ipa: '/d͡ʒ/', join: 'both', ex: 'آج', exr: 'āj', exe: 'today' },
  { ch: 'چ', name: 'cē', ur: 'چے', rom: 'ch', ipa: '/t͡ʃ/', join: 'both', ex: 'چائے', exr: 'chāe', exe: 'tea' },
  { ch: 'ح', name: 'baṛī ḥē', ur: 'بڑی حے', rom: 'ḥ', ipa: '/ɦ/', join: 'both', ex: 'حال', exr: 'ḥāl', exe: 'condition' },
  { ch: 'خ', name: 'khē', ur: 'خے', rom: 'kh', ipa: '/x/', join: 'both', ex: 'خوش', exr: 'khush', exe: 'happy' },
  { ch: 'د', name: 'dāl', ur: 'دال', rom: 'd', ipa: '/d/', join: 'right', ex: 'دل', exr: 'dil', exe: 'heart' },
  { ch: 'ڈ', name: 'ḍāl', ur: 'ڈال', rom: 'ḍ', ipa: '/ɖ/', join: 'right', ex: 'ڈاکٹر', exr: 'ḍākṭar', exe: 'doctor' },
  { ch: 'ذ', name: 'ẕāl', ur: 'ذال', rom: 'ẕ', ipa: '/z/', join: 'right', ex: 'ذرا', exr: 'ẕarā', exe: 'a little, just' },
  { ch: 'ر', name: 'rē', ur: 'رے', rom: 'r', ipa: '/r/', join: 'right', ex: 'رات', exr: 'rāt', exe: 'night' },
  { ch: 'ڑ', name: 'ṛē', ur: 'ڑے', rom: 'ṛ', ipa: '/ɽ/', join: 'right', ex: 'بڑا', exr: 'baṛā', exe: 'big' },
  { ch: 'ز', name: 'zē', ur: 'زے', rom: 'z', ipa: '/z/', join: 'right', ex: 'زبان', exr: 'zabān', exe: 'language, tongue' },
  { ch: 'ژ', name: 'zhē', ur: 'ژے', rom: 'zh', ipa: '/ʒ/', join: 'right', ex: 'ژالہ', exr: 'zhālā', exe: 'hail, dew' },
  { ch: 'س', name: 'sīn', ur: 'سین', rom: 's', ipa: '/s/', join: 'both', ex: 'سلام', exr: 'salām', exe: 'peace, greeting' },
  { ch: 'ش', name: 'shīn', ur: 'شین', rom: 'sh', ipa: '/ʃ/', join: 'both', ex: 'شام', exr: 'shām', exe: 'evening' },
  { ch: 'ص', name: 'ṣwād', ur: 'صاد', rom: 'ṣ', ipa: '/s/', join: 'both', ex: 'صبح', exr: 'ṣubah', exe: 'morning' },
  { ch: 'ض', name: 'ẓwād', ur: 'ضاد', rom: 'ẓ', ipa: '/z/', join: 'both', ex: 'ضرور', exr: 'ẓarūr', exe: 'certainly' },
  { ch: 'ط', name: 'ṭoʼē', ur: 'طوے', rom: 'ṭ', ipa: '/t/', join: 'both', ex: 'طبیعت', exr: 'ṭabīyat', exe: 'health, mood' },
  { ch: 'ظ', name: 'ẓoʼē', ur: 'ظوے', rom: 'ẓ', ipa: '/z/', join: 'both', ex: 'ظاہر', exr: 'ẓāhir', exe: 'evident, apparent' },
  { ch: 'ع', name: 'ʿain', ur: 'عین', rom: 'ʿ', ipa: '/ɑː, ʔ/', join: 'both', ex: 'علم', exr: 'ʿilm', exe: 'knowledge' },
  { ch: 'غ', name: 'ghain', ur: 'غین', rom: 'gh', ipa: '/ɣ/', join: 'both', ex: 'غصہ', exr: 'ghussah', exe: 'anger' },
  { ch: 'ف', name: 'fē', ur: 'فے', rom: 'f', ipa: '/f/', join: 'both', ex: 'صرف', exr: 'ṣirf', exe: 'only' },
  { ch: 'ق', name: 'qāf', ur: 'قاف', rom: 'q', ipa: '/q/', join: 'both', ex: 'وقت', exr: 'waqt', exe: 'time' },
  { ch: 'ک', name: 'kāf', ur: 'کاف', rom: 'k', ipa: '/k/', join: 'both', ex: 'کتاب', exr: 'kitāb', exe: 'book' },
  { ch: 'گ', name: 'gāf', ur: 'گاف', rom: 'g', ipa: '/ɡ/', join: 'both', ex: 'گھر', exr: 'ghar', exe: 'home' },
  { ch: 'ل', name: 'lām', ur: 'لام', rom: 'l', ipa: '/l/', join: 'both', ex: 'لوگ', exr: 'log', exe: 'people' },
  { ch: 'م', name: 'mīm', ur: 'میم', rom: 'm', ipa: '/m/', join: 'both', ex: 'ماں', exr: 'māṉ', exe: 'mother' },
  { ch: 'ن', name: 'nūn', ur: 'نون', rom: 'n', ipa: '/n/', join: 'both', ex: 'نام', exr: 'nām', exe: 'name' },
  { ch: 'ں', name: 'nūn ghunnā', ur: 'نون غنہ', rom: 'ṉ (nasal)', ipa: '/◌̃/', join: 'both', ex: 'ماں', exr: 'māṉ', exe: 'mother — the dotless nūn only nasalises; it never starts a word' },
  { ch: 'و', name: 'wāʼo', ur: 'واؤ', rom: 'w, ū, o', ipa: '/ʋ, uː, oː/', join: 'right', ex: 'وہ', exr: 'woh', exe: 'he, she, that' },
  { ch: 'ہ', name: 'hē (gol hē)', ur: 'ہے', rom: 'h, ā, e', ipa: '/ɦ/', join: 'both', ex: 'ہے', exr: 'hai', exe: 'is' },
  { ch: 'ھ', name: 'do-cashmī hē', ur: 'دو چشمی ہے', rom: 'h (breathy)', ipa: '/ʰ, ʱ/', join: 'both', ex: 'بھائی', exr: 'bhāī', exe: 'brother — this hē never starts a word; it breathes after another letter: بھ پھ تھ ٹھ جھ چھ دھ ڈھ کھ گھ' },
  { ch: 'ی', name: 'yē (choṭī yē)', ur: 'یے', rom: 'y, ī', ipa: '/j, iː/', join: 'both', ex: 'یہ', exr: 'yih', exe: 'this' },
  { ch: 'ے', name: 'baṛī yē', ur: 'بڑی یے', rom: 'e, ai', ipa: '/eː, ɛː/', join: 'final', ex: 'لڑکے', exr: 'laṛke', exe: 'boys — baṛī yē only ever ends a word' },
];

/** Two helpers that ride on other letters — not counted in the 38. */
export const HELPERS = [
  { ch: 'آ', name: 'alif maddah', ur: 'الف مدہ', rom: 'ā', ipa: '/ɑː/', note: 'alif wearing a maddah — a long ā at the start of a word: آج (āj, today), آپ (āp, you)' },
  { ch: 'ئ', name: 'hamzah', ur: 'ہمزہ', rom: 'ʼ', ipa: '/ʔ/', note: 'the little seat that holds a vowel between sounds: آئی (āʼī, she came), کوئی (koʼī, someone / no one)' },
];

export const NON_JOINERS = LETTERS.filter((l) => l.join === 'right').map((l) => l.ch);

export const NUMBERS = [
  [1, 'اِک', 'ik'], [2, 'دو', 'do'], [3, 'تِین', 'tīn'], [4, 'چار', 'chār'], [5, 'پانچ', 'pāṉch'],
  [6, 'چھے', 'chhe'], [7, 'سات', 'sāt'], [8, 'آٹھ', 'āṭh'], [9, 'نو', 'nau'], [10, 'دَس', 'das'],
  [11, 'گیارہ', 'gyārah'], [12, 'بارہ', 'bārah'], [13, 'تیرہ', 'terah'], [14, 'چودہ', 'chaudah'],
  [15, 'پندرہ', 'pandrah'], [16, 'سولہ', 'solah'], [17, 'سترہ', 'satrah'], [18, 'اٹھارہ', 'aṭhārah'],
  [19, 'اُنّیس', 'unnīs'], [20, 'بِیس', 'bīs'],
];

export const SABAK = [
  {
    n: 1, title: 'Salaam-o-taaruf · Greetings & introductions', kind: 'new',
    note: 'The first exchange of any Urdu conversation — greeting, name, where you are from, and a graceful goodbye.',
    items: [
      I('السلام علیکم', 'assalāmu alaikum', 'सलाम — आप पर शांति हो', 'Peace be upon you — the standard greeting'),
      I('وَعَلَیکُمُ السّلام', 'wa alaikumus salām', 'और आप पर भी शांति हो', 'And peace be upon you too — the reply'),
      I('آپ کا نام کیا ہے؟', 'āp kā nām kyā hai?', 'आपका नाम क्या है?', 'What is your name?'),
      I('میرا نام علی ہے', 'merā nām Alī hai', 'मेरा नाम अली है', 'My name is Ali'),
      I('آپ کہاں سے ہیں؟', 'āp kahāṉ se haiṉ?', 'आप कहाँ से हैं?', 'Where are you from?'),
      I('میں دہلی سے ہوں', 'maiṉ Dihlī se hūṉ', 'मैं दिल्ली से हूँ', 'I am from Delhi'),
      I('آپ کیسے ہیں؟', 'āp kaise haiṉ?', 'आप कैसे हैं?', 'How are you?'),
      I('میں ٹھیک ہوں، شکریہ', 'maiṉ ṭhīk hūṉ, shukriya', 'मैं ठीक हूँ, धन्यवाद', 'I am fine, thank you'),
      I('آپ سے مل کر خوشی ہوئی', 'āp se mil kar khushī huī', 'आपसे मिलकर ख़ुशी हुई', 'Pleased to meet you'),
      I('خُدا حافِظ', 'Khudā hāfiz', 'ख़ुदा हाफ़िज़ — अलविदा', 'May God protect you — goodbye'),
      I('شُکریہ', 'shukriya', 'शुक्रिया, धन्यवाद', 'Thank you'),
      I('کوئی بات نہیں', 'koī bāt nahīṉ', 'कोई बात नहीं', 'No problem — also the reply to thanks'),
      I('مَعاف کیجیے', 'maāf kījiye', 'माफ़ कीजिए', 'Excuse me / I am sorry'),
      I('صُبح بَخَیر', 'subah bakhair', 'सुप्रभात', 'Good morning'),
      I('پھر ملیں گے', 'phir mileṉge', 'फिर मिलेंगे', 'We will meet again'),
    ],
  },
  {
    n: 2, title: 'Khandan · Family', kind: 'new',
    note: 'The family words, then three sentences that use them — note how ہیں (haiṉ) is the respectful verb for elders.',
    items: [
      I('ماں', 'māṉ', 'माँ', 'mother'),
      I('وَالِد', 'wālid', 'पिता', 'father'),
      I('بھائی', 'bhāī', 'भाई', 'brother'),
      I('بہن', 'bahan', 'बहन', 'sister'),
      I('دادا', 'dādā', 'दादा', 'paternal grandfather'),
      I('دادی', 'dādī', 'दादी', 'paternal grandmother'),
      I('نانا', 'nānā', 'नाना', 'maternal grandfather'),
      I('نانی', 'nānī', 'नानी', 'maternal grandmother'),
      I('بیٹا', 'beṭā', 'बेटा', 'son'),
      I('بیٹی', 'beṭī', 'बेटी', 'daughter'),
      I('یہ میری ماں ہیں', 'yih merī māṉ haiṉ', 'यह मेरी माँ हैं', 'This is my mother'),
      I('میرے دو بھائی ہیں', 'mere do bhāī haiṉ', 'मेरे दो भाई हैं', 'I have two brothers'),
      I('میرا خاندان بڑا ہے', 'merā khāndān baṛā hai', 'मेरा परिवार बड़ा है', 'My family is big'),
      I('ہم سب ایک ساتھ رہتے ہیں', 'ham sab ek sāth rahte haiṉ', 'हम सब एक साथ रहते हैं', 'We all live together'),
      I('میرے والد استاد ہیں', 'mere wālid ustād haiṉ', 'मेरे पिता अध्यापक हैं', 'My father is a teacher'),
    ],
  },
  {
    n: 3, title: 'Ginti aur waqt · Numbers & time', kind: 'new',
    note: 'The count 1–20 is in the grid above. The lines below put numbers to work — clock time and the words for days and seasons of the day.',
    items: [
      I('ابھی کیا وقت ہوا ہے؟', 'abhī kyā waqt huā hai?', 'अभी क्या समय हुआ है?', 'What time is it now?'),
      I('تین بجے ہیں', 'tīn baje haiṉ', 'तीन बजे हैं', 'It is three o’clock'),
      I('آدھا گھنٹہ', 'ādhā ghanṭā', 'आधा घंटा', 'Half an hour'),
      I('آج', 'āj', 'आज', 'today'),
      I('کل', 'kal', 'कल', 'tomorrow — and also yesterday; the sentence tells you which'),
      I('پرسوں', 'parsoṉ', 'परसों', 'the day after tomorrow — or the day before yesterday'),
      I('ہفتہ', 'haftah', 'हफ़्ता, सप्ताह', 'week'),
      I('مہینہ', 'mahīnah', 'महीना', 'month'),
      I('سال', 'sāl', 'साल', 'year'),
      I('صُبح', 'subah', 'सुबह', 'morning'),
      I('دوپہر', 'dopahar', 'दोपहर', 'afternoon'),
      I('شام', 'shām', 'शाम', 'evening'),
      I('رات', 'rāt', 'रात', 'night'),
      I('دیر ہو گئی', 'der ho gaī', 'देर हो गई', 'It got late'),
    ],
  },
  {
    n: 4, title: 'Bazaar aur kharcha · The market & money', kind: 'new',
    note: 'Asking the price, bargaining gently, and the words of the shop.',
    items: [
      I('یہ کتنے کا ہے؟', 'yih kitne kā hai?', 'यह कितने का है?', 'How much is this?'),
      I('یہ بہت مہنگا ہے', 'yih bahut mahṉgā hai', 'यह बहुत महँगा है', 'This is very expensive'),
      I('کچھ کم کیجیے', 'kuchh kam kījiye', 'कुछ कम कीजिए', 'Please lower the price a little'),
      I('ٹھیک ہے، میں لے لیتا ہوں', 'ṭhīk hai, maiṉ le letā hūṉ', 'ठीक है, मैं ले लेता हूँ', 'Fine, I will take it'),
      I('مُجھے یہ چاہیے', 'mujhe yih chāhiye', 'मुझे यह चाहिए', 'I want / need this'),
      I('دوکان', 'dukān', 'दुकान', 'shop'),
      I('دوکاندار', 'dukāndār', 'दुकानदार', 'shopkeeper'),
      I('قِیمت', 'qīmat', 'क़ीमत, दाम', 'price'),
      I('سستا', 'sastā', 'सस्ता', 'cheap'),
      I('پیسے', 'paise', 'पैसे', 'money'),
      I('خریدنا', 'kharīdnā', 'ख़रीदना', 'to buy'),
      I('بیچنا', 'bechnā', 'बेचना', 'to sell'),
      I('صرف دیکھ رہا ہوں', 'sirf dekh rahā hūṉ', 'सिर्फ़ देख रहा हूँ', 'I am just looking'),
      I('کیا اِس سے چھوٹا ہے؟', 'kyā is se chhoṭā hai?', 'क्या इससे छोटा है?', 'Is there a smaller one than this?'),
    ],
  },
  {
    n: 5, title: 'Khana · Food', kind: 'new',
    note: 'At the table: the dishes, hunger and thirst, and how to praise the cook.',
    items: [
      I('روٹی', 'roṭī', 'रोटी', 'bread, roti'),
      I('چاول', 'chāwal', 'चावल', 'rice'),
      I('دال', 'dāl', 'दाल', 'lentils'),
      I('سبزی', 'sabzī', 'सब्ज़ी', 'vegetables; a vegetable dish'),
      I('گوشت', 'gosht', 'गोश्त', 'meat'),
      I('چائے', 'chāe', 'चाय', 'tea'),
      I('پانی', 'pānī', 'पानी', 'water'),
      I('دودھ', 'dūdh', 'दूध', 'milk'),
      I('مجھے بھوک لگی ہے', 'mujhe bhūk lagī hai', 'मुझे भूख लगी है', 'I am hungry'),
      I('مجھے پیاس لگی ہے', 'mujhe pyās lagī hai', 'मुझे प्यास लगी है', 'I am thirsty'),
      I('کھانا بہت مزے کا ہے', 'khānā bahut maze kā hai', 'खाना बहुत मज़े का है', 'The food is delicious'),
      I('اور چاہیے؟', 'aur chāhiye?', 'और चाहिए?', 'Would you like some more?'),
      I('بس، شکریہ', 'bas, shukriya', 'बस, धन्यवाद', 'That is enough, thank you'),
      I('نمک کم ہے', 'namak kam hai', 'नमक कम है', 'The salt is a little less'),
    ],
  },
  {
    n: 6, title: 'Safar aur raste · Travel & directions', kind: 'new',
    note: 'On the road: asking the way, giving directions, and the words of the journey.',
    items: [
      I('یہ راستہ کہاں جاتا ہے؟', 'yih rāstā kahāṉ jātā hai?', 'यह रास्ता कहाँ जाता है?', 'Where does this road go?'),
      I('سیدھا جائیے', 'sīdhā jāiye', 'सीधा जाइए', 'Go straight'),
      I('دائیں مڑیے', 'dāeṉ muṛiye', 'दाएँ मुड़िए', 'Turn right'),
      I('بائیں مڑیے', 'bāeṉ muṛiye', 'बाएँ मुड़िए', 'Turn left'),
      I('یہیں روکیے', 'yahīṉ rukiye', 'यहीं रुकिए', 'Stop right here'),
      I('اسٹیشن کتنی دور ہے؟', 'isṭeshan kitnī dūr hai?', 'स्टेशन कितनी दूर है?', 'How far is the station?'),
      I('مجھے بازار جانا ہے', 'mujhe bāzār jānā hai', 'मुझे बाज़ार जाना है', 'I have to go to the market'),
      I('گاڑی', 'gāṛī', 'गाड़ी', 'car, vehicle'),
      I('ٹکٹ', 'ṭikaṭ', 'टिकट', 'ticket'),
      I('سفر', 'safar', 'सफ़र', 'journey'),
      I('منزل', 'manzil', 'मंज़िल', 'destination'),
      I('نقشہ', 'naqshah', 'नक़्शा, मानचित्र', 'map'),
      I('کتنی دیر لگے گی؟', 'kitnī der lagegī?', 'कितनी देर लगेगी?', 'How long will it take?'),
    ],
  },
  {
    n: 7, title: 'Sehat · Health', kind: 'new',
    note: 'Saying what hurts, the doctor, the medicine — and the words that wish someone well.',
    items: [
      I('میری طبیعت خراب ہے', 'merī tabīyat kharāb hai', 'मेरी तबीयत ख़राब है', 'I am feeling unwell'),
      I('مجھے بخار ہے', 'mujhe bukhār hai', 'मुझे बुख़ार है', 'I have a fever'),
      I('سر میں درد ہے', 'sar meṉ dard hai', 'सर में दर्द है', 'I have a headache'),
      I('پیٹ میں درد ہے', 'peṭ meṉ dard hai', 'पेट में दर्द है', 'I have a stomach ache'),
      I('ڈاکٹر کے پاس جانا ہے', 'ḍākṭar ke pās jānā hai', 'डॉक्टर के पास जाना है', 'I need to see a doctor'),
      I('دوا کھا لی؟', 'dawā khā lī?', 'दवा खा ली?', 'Did you take the medicine?'),
      I('آرام کیجیے', 'ārām kījiye', 'आराम कीजिए', 'Please rest'),
      I('زیادہ پانی پیجیے', 'ziyādah pānī pījiye', 'ज़्यादा पानी पीजिए', 'Drink plenty of water'),
      I('جلدی ٹھیک ہو جائیے', 'jaldī ṭhīk ho jāiye', 'जल्दी ठीक हो जाइए', 'Get well soon'),
      I('اللہ شفا دے', 'Allāh shifā de', 'अल्लाह शिफ़ा दे', 'May God grant you recovery'),
      I('کھانسی', 'khāṉsī', 'खाँसी', 'a cough'),
      I('اب بہتر محسوس ہو رہا ہے', 'ab behtar mahsūs ho rahā hai', 'अब बेहतर महसूस हो रहा है', 'I am feeling better now'),
    ],
  },
  {
    n: 8, title: 'Roz-marra · Everyday lines', kind: 'new',
    note: 'The small lines that carry a whole day — hurry, weather, sleep and “we shall see”.',
    items: [
      I('ذرا سنیے', 'zarā suniye', 'ज़रा सुनिए', 'Please listen a moment'),
      I('ایک منٹ', 'ek minaṭ', 'एक मिनट', 'Just a minute'),
      I('جلدی کیجیے', 'jaldī kījiye', 'जल्दी कीजिए', 'Please hurry'),
      I('آرام سے', 'ārām se', 'आराम से', 'Gently — take it easy'),
      I('مجھے دیر ہو رہی ہے', 'mujhe der ho rahī hai', 'मुझे देर हो रही है', 'I am getting late'),
      I('چلیے، چلتے ہیں', 'chaliye, chalte haiṉ', 'चलिए, चलते हैं', 'Come, let us go'),
      I('آج موسم اچھا ہے', 'āj mausam achchhā hai', 'आज मौसम अच्छा है', 'The weather is nice today'),
      I('بارش ہو رہی ہے', 'bārish ho rahī hai', 'बारिश हो रही है', 'It is raining'),
      I('مجھے نیند آ رہی ہے', 'mujhe nīnd ā rahī hai', 'मुझे नींद आ रही है', 'I am feeling sleepy'),
      I('دیکھتے ہیں', 'dekhte haiṉ', 'देखते हैं', 'We shall see'),
      I('اچھا ہوا', 'achchhā huā', 'अच्छा हुआ', 'That turned out well — good thing'),
      I('کیا ہوا؟', 'kyā huā?', 'क्या हुआ?', 'What happened?'),
      I('سب ٹھیک ہے', 'sab ṭhīk hai', 'सब ठीक है', 'Everything is fine'),
    ],
  },
  {
    n: 9, title: 'Khayal aur jazbaat · Feelings & opinion frames', kind: 'new',
    note: 'Frames you can hang your own words on — “I think that…”, “in my opinion”, and the feelings themselves.',
    items: [
      I('مجھے لگتا ہے کہ…', 'mujhe lagtā hai ki…', 'मुझे लगता है कि…', 'I think that…'),
      I('میرے خیال میں', 'mere khayāl meṉ', 'मेरे ख़याल में', 'In my opinion'),
      I('آپ کا کیا خیال ہے؟', 'āp kā kyā khayāl hai?', 'आपका क्या ख़याल है?', 'What do you think?'),
      I('مجھے یقین ہے', 'mujhe yaqīn hai', 'मुझे यक़ीन है', 'I am sure'),
      I('مجھے خوشی ہوئی', 'mujhe khushī huī', 'मुझे ख़ुशी हुई', 'I felt happy'),
      I('مجھے افسوس ہوا', 'mujhe afsos huā', 'मुझे अफ़सोस हुआ', 'I felt sorry — I felt sad'),
      I('مجھے غصہ آیا', 'mujhe ghussā āyā', 'मुझे ग़ुस्सा आया', 'I got angry'),
      I('سچ یہ ہے کہ…', 'sach yih hai ki…', 'सच यह है कि…', 'The truth is that…'),
      I('مجھے یہ پسند ہے', 'mujhe yih pasand hai', 'मुझे यह पसंद है', 'I like this'),
      I('مجھے یہ پسند نہیں', 'mujhe yih pasand nahīṉ', 'मुझे यह पसंद नहीं', 'I do not like this'),
      I('شاید', 'shāyad', 'शायद', 'perhaps'),
      I('بالکل ٹھیک', 'bilkul ṭhīk', 'बिल्कुल ठीक', 'Absolutely right'),
    ],
  },
  {
    n: 10, title: 'Kahavateṉ · Sayings you will hear', kind: 'new',
    note: 'Proverbs and idioms that turn up in daily Urdu speech — learn them whole, the way people say them.',
    items: [
      I('جیسا کرو گے ویسا بھرو گے', 'jaisā karoge waisā bharoge', 'जैसा करोगे वैसा भरोगे', 'As you sow, so shall you reap'),
      I('محنت کا پھل میٹھا ہوتا ہے', 'mehnat kā phal mīṭhā hotā hai', 'मेहनत का फल मीठा होता है', 'Hard work bears sweet fruit'),
      I('صبر کا پھل میٹھا', 'sabr kā phal mīṭhā', 'सब्र का फल मीठा', 'Patience bears sweet fruit'),
      I('وقت کسی کا انتظار نہیں کرتا', 'waqt kisī kā intizār nahīṉ kartā', 'वक़्त किसी का इंतज़ार नहीं करता', 'Time waits for no one'),
      I('پیسہ ہاتھ کا میل ہے', 'paisā hāth kā mail hai', 'पैसा हाथ का मैल है', 'Money is the dirt of the hand — it comes and goes'),
      I('آنکھوں کا تارا', 'āṉkhoṉ kā tārā', 'आँखों का तारा', 'The apple of one’s eye'),
      I('دل باغ باغ ہونا', 'dil bāgh bāgh honā', 'दिल बाग़-बाग़ होना', 'To be overjoyed — the heart turns garden upon garden'),
      I('ناک میں دم کرنا', 'nāk meṉ dam karnā', 'नाक में दम करना', 'To pester someone endlessly'),
      I('اللہ کے گھر دیر ہے، اندھیر نہیں', 'Allāh ke ghar der hai, andher nahīṉ', 'अल्लाह के घर देर है, अंधेर नहीं', 'At God’s door there may be delay, never darkness'),
      I('جو ہوا، اچھا ہوا', 'jo huā, achchhā huā', 'जो हुआ, अच्छा हुआ', 'Whatever happened, happened for the good'),
    ],
  },
];

export const NOTES = [
  'Most letters join on both sides. Nine are non-joiners — ا د ڈ ذ ر ڑ ز ژ و — they hold the hand of the letter before them but never connect to the one after, so a word breaks visually after them: اردو, دروازہ.',
  'Short vowels (zabar ـَ, zer ـِ, pesh ـُ) are usually NOT written in real Urdu — کتاب is read kitāb by habit, not by marks. The light marks in this course are training wheels.',
  'ں (nūn ghunnā) has no dot and only nasalises the vowel before it — ماں māṉ. No Urdu word begins with ں, ھ, ڑ or ے.',
  'ھ (do-cashmī hē) is the breath in بھ پھ تھ ٹھ جھ چھ دھ ڈھ کھ گھ — بھائی bhāī could not be written without it.',
];

/* ------------------------------------------------------- drill pools */
export const NUMBER_ITEMS = NUMBERS.map(([num, s, r]) => ({
  s, r, hi: String(num), en: `the number ${num}`, n: 3,
}));
export const LETTER_ITEMS = LETTERS.map((l) => ({
  s: l.ch, r: `${l.name} — ${l.rom}`, hi: l.ur, en: `the letter ${l.name} (${l.rom})`, n: 0,
}));
export const ALL_ITEMS = SABAK.flatMap((sb) => sb.items.map((it) => ({ ...it, n: sb.n })));
export const VOCAB = [...ALL_ITEMS, ...NUMBER_ITEMS, ...LETTER_ITEMS];
export const PHRASE_COUNT = ALL_ITEMS.length + NUMBERS.length + LETTERS.length;
