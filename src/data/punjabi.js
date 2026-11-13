/**
 * punjabi.js — Punjabi Sikho course data. HAND-BUILT for this app.
 *
 * Spoken Punjabi in the Shahmukhi script — the same Arabic-based
 * script as the Saraiki course, but the language is genuinely
 * Punjabi (Majhi-leaning, as spoken in Delhi's Punjabi homes), NOT
 * Hindi wearing Shahmukhi letters and NOT Saraiki either:
 *   · میرا / تیرا / تہاڈا (merā / terā / tuhāḍā) — Punjabi possessives;
 *     Saraiki's میڈا / تیڈا never appear here.
 *   · the -دا present (کردا، جاندا), the copulas آں (am), اے (is),
 *     نے (are), the -نوں family (مینوں، تینوں، سانوں), دا/دی/دے for
 *     "of", چاہیدا (needed), ہُن (now), بھلک (tomorrow only),
 *     مگروں (after/later), گَلّ (a matter), سَواد (taste), ویلا (time).
 * Punjabi is a TONAL language — the notes say so honestly; the Roman
 * here stays simple (ā ī ū ṭ ḍ ṇ ṛ) and does not fake tone marks
 * across the course, only in the one note that explains them.
 *
 * Every item: { s: Shahmukhi, r: Roman Punjabi, hi: Hindi, en: English }.
 */

const I = (s, r, hi, en) => ({ s, r, hi, en });

export const NUMBERS = [
  [1, 'ہِک', 'hik'], [2, 'دو', 'do'], [3, 'تِن', 'tinn'], [4, 'چار', 'chār'], [5, 'پَنج', 'panj'],
  [6, 'چھے', 'chhe'], [7, 'سَتّ', 'satt'], [8, 'اَٹھ', 'aṭṭh'], [9, 'نوں', 'nauṉ'], [10, 'دَس', 'dass'],
  [11, 'گیاراں', 'giārāṉ'], [12, 'باراں', 'bārāṉ'], [13, 'تیراں', 'terāṉ'], [14, 'چوداں', 'chaudāṉ'],
  [15, 'پندراں', 'pandrāṉ'], [16, 'سولاں', 'solāṉ'], [17, 'ستاراں', 'satārāṉ'], [18, 'اٹھاراں', 'aṭhārāṉ'],
  [19, 'اُنی', 'unnī'], [20, 'وِیہہ', 'vīh'],
];

export const SABAK = [
  {
    n: 1, title: 'Milni · Greetings & meeting', kind: 'new',
    note: 'Sat Sri Akal opens everything; Rabb Rakha closes it. The middle is the same ground as any first meeting — name, home, how are you.',
    items: [
      I('ست سری اکال', 'sat srī akāl', 'सत श्री अकाल', 'Sat Sri Akal — the Sikh greeting: Truth is the Timeless One'),
      I('تساں کیویں ہو؟', 'tusāṉ kīveṉ ho?', 'तुम कैसे हो?', 'How are you?'),
      I('میں ٹھیک آں', 'maiṉ ṭhīk āṉ', 'मैं ठीक हूँ', 'I am fine — Punjabi “am” is آں (āṉ)'),
      I('تہاڈا ناں کیہ اے؟', 'tuhāḍā nāṉ kīh e?', 'तुम्हारा नाम क्या है?', 'What is your name? — “is” is اے (e)'),
      I('میرا ناں علی اے', 'merā nāṉ Alī e', 'मेरा नाम अली है', 'My name is Ali'),
      I('تسی کتھوں دے ہو؟', 'tusīṉ kithhoṉ de ho?', 'तुम कहाँ के हो?', 'Where are you from?'),
      I('میں دلی توں آں', 'maiṉ Dillī toṉ āṉ', 'मैं दिल्ली से हूँ', 'I am from Delhi'),
      I('مل کے بڑی خوشی ہوئی', 'mil ke baṛī khushī hoī', 'मिलकर बहुत ख़ुशी हुई', 'Very pleased to meet you'),
      I('رب رکھا', 'rabb rākhā', 'रब राखा — अलविदा', 'May God protect you — a warm Punjabi goodbye'),
      I('چنگا، فیر ملاں گے', 'changā, fer milāṉge', 'अच्छा, फिर मिलेंगे', 'Alright, we will meet again'),
      I('شکریا', 'shukriā', 'शुक्रिया', 'Thank you'),
      I('معافی دیو', 'maāfī deo', 'माफ़ कर दो', 'Please excuse me / forgive me'),
      I('تہاڈا دن چنگا گزرے', 'tuhāḍā din changā guzre', 'तुम्हारा दिन अच्छा गुज़रे', 'May your day go well'),
    ],
  },
  {
    n: 2, title: 'Parivar · Family', kind: 'new',
    note: 'Punjabi keeps its own words where Hindi borrows: پیو (father), بھیݨ (sister), ٹبّر (the whole family-clan).',
    items: [
      I('ماں', 'māṉ', 'माँ', 'mother'),
      I('پیو', 'piu', 'पिता', 'father'),
      I('بھرا', 'bhrā', 'भाई', 'brother'),
      I('بھیݨ', 'bhaiṇ', 'बहन', 'sister'),
      I('ویر', 'vīr', 'बड़े भाई (सम्मान से)', 'elder brother — the respectful word'),
      I('دادا', 'dādā', 'दादा', 'paternal grandfather'),
      I('دادی', 'dādī', 'दादी', 'paternal grandmother'),
      I('پت', 'putt', 'बेटा', 'son'),
      I('دھی', 'dhī', 'बेटी', 'daughter'),
      I('ایہ میری ماں اے', 'īh merī māṉ e', 'यह मेरी माँ है', 'This is my mother'),
      I('میرے دو بھرا نے', 'mere do bhrā ne', 'मेरे दो भाई हैं', 'I have two brothers — “are” is نے (ne)'),
      I('ساڈا ٹبر وڈا اے', 'sāḍā ṭabbar vaḍḍā e', 'हमारा परिवार बड़ा है', 'Our family is big'),
      I('اسی سارے اکو گھر رہندے آں', 'asīṉ sāre ikko ghar rahnde āṉ', 'हम सब एक ही घर में रहते हैं', 'We all live in one house'),
    ],
  },
  {
    n: 3, title: 'Ginti te vela · Numbers & time', kind: 'new',
    note: 'The count is in the grid above. Below: ویلا (velā, time) at work — and watch بھلک, “tomorrow” with no “yesterday” hiding inside it.',
    items: [
      I('ہن کی ویلا ہویا اے؟', 'huṇ kīh velā hoyā e?', 'अभी क्या समय हुआ है?', 'What time is it now?'),
      I('تن وجے نے', 'tinn vajje ne', 'तीन बजे हैं', 'It is three o’clock'),
      I('اج', 'ajj', 'आज', 'today'),
      I('کل', 'kal', 'कल', 'tomorrow — or yesterday; context decides'),
      I('بھلک', 'bhalak', 'आने वाला कल', 'tomorrow — only the coming one; Punjabi keeps it separate'),
      I('ہن', 'huṇ', 'अभी, अब', 'now'),
      I('مگروں', 'magroṉ', 'बाद में', 'later, afterwards'),
      I('سویر', 'saver', 'सुबह', 'morning'),
      I('شام', 'shām', 'शाम', 'evening'),
      I('رات', 'rāt', 'रात', 'night'),
      I('ہفتہ', 'haftā', 'हफ़्ता', 'week'),
      I('کدوں آویں گا؟', 'kadoṉ āveṉ gā?', 'कब आओगे?', 'When will you come?'),
    ],
  },
  {
    n: 4, title: 'Bazaar · The market', kind: 'new',
    note: 'How much is it — کنے دا اے؟ — and the two sentences every Punjabi shopper needs: چاہیدا اے and چاہیدا نئیں.',
    items: [
      I('ایہ کنے دا اے؟', 'īh kinne dā e?', 'यह कितने का है?', 'How much is this?'),
      I('بڑا مہنگا اے', 'baṛā mahingā e', 'बहुत महँगा है', 'It is very expensive — بڑا (baṛā) also means “very”'),
      I('کجھ گھٹ کرو', 'kujh ghaṭṭ karo', 'कुछ कम करो', 'Lower the price a bit'),
      I('چنگا، میں لے لینا واں', 'changā, maiṉ lai lainā vāṉ', 'ठीक है, मैं ले लेता हूँ', 'Alright, I will take it'),
      I('مینوں ایہ چاہیدا اے', 'mainūṉ īh chāhīdā e', 'मुझे यह चाहिए', 'I need this — چاہیدا is Punjabi’s everyday “wanted/should”'),
      I('مینوں ایہ نئیں چاہیدا', 'mainūṉ īh naīṉ chāhīdā', 'मुझे यह नहीं चाहिए', 'I do not want this'),
      I('دوکان', 'dukān', 'दुकान', 'shop'),
      I('پیسے', 'paise', 'पैसे', 'money'),
      I('سستا', 'sastā', 'सस्ता', 'cheap'),
      I('سودا', 'saudā', 'सौदा, सामान', 'the goods, the deal'),
      I('صرف ویکھ رہیا واں', 'sirf vekh rihā vāṉ', 'सिर्फ़ देख रहा हूँ', 'I am just looking — ویکھنا (vekhnā) is “to see”'),
      I('اس نالوں چھوٹا ہے گا؟', 'is nāloṉ chhoṭā hai gā?', 'इससे छोटा है क्या?', 'Do you have a smaller one than this?'),
    ],
  },
  {
    n: 5, title: 'Khana-pina · Food & drink', kind: 'new',
    note: 'Roti-shoti, saag, lassi — and چاہ (chāh), which is what Punjabi actually calls tea.',
    items: [
      I('روٹی شوٹی', 'roṭī-shoṭī', 'रोटी-शोटी — खाना', 'Food, a proper meal — roti with its echo-word, pure Punjabi'),
      I('ساگ', 'sāg', 'साग', 'cooked leafy greens'),
      I('سرسوں دا ساگ', 'sarsoṉ dā sāg', 'सरसों का साग', 'mustard greens — the dish itself'),
      I('مکھݨ', 'makkhaṇ', 'मक्खन', 'butter'),
      I('لسی', 'lassī', 'लस्सी', 'lassi'),
      I('پراٹھا', 'parāṭhā', 'पराठा', 'paratha'),
      I('چاہ', 'chāh', 'चाय', 'tea — Punjabi says chāh, not chāe'),
      I('دال', 'dāl', 'दाल', 'lentils'),
      I('مینوں بھکھ لگی اے', 'mainūṉ bhukkh laggī e', 'मुझे भूख लगी है', 'I am hungry'),
      I('کھانا بڑا سواد اے', 'khāṇā baṛā savād e', 'खाना बहुत स्वाद है', 'The food is very tasty — سواد (savād) is the Punjabi word for taste'),
      I('ہور چاہیدا اے؟', 'hor chāhīdā e?', 'और चाहिए?', 'Would you like more?'),
      I('بس جی', 'bass jī', 'बस जी', 'That is enough, thanks'),
      I('پانی', 'pānī', 'पानी', 'water'),
    ],
  },
  {
    n: 6, title: 'Safar · Travel & directions', kind: 'new',
    note: 'Directions the Punjabi way — سدھا، سجے، کبے — and پنڈ (the village) against شہر (the city).',
    items: [
      I('ایہ رستا کتھے جاندا اے؟', 'īh rastā kithhe jāndā e?', 'यह रास्ता कहाँ जाता है?', 'Where does this road go? — جاندا is the -dā present of جانا'),
      I('سدھا جاؤ', 'siddhā jāo', 'सीधा जाओ', 'Go straight'),
      I('سجے مڑو', 'sajje muṛo', 'दाएँ मुड़ो', 'Turn right'),
      I('کبے مڑو', 'kabbe muṛo', 'बाएँ मुड़ो', 'Turn left'),
      I('اتھے روک لو', 'ithhe rok lo', 'यहाँ रोक लो', 'Stop here'),
      I('سٹیشن کنی دور اے؟', 'saṭeshan kinnī dūr e?', 'स्टेशन कितनी दूर है?', 'How far is the station?'),
      I('مینوں بازار جانا اے', 'mainūṉ bāzār jāṇā e', 'मुझे बाज़ार जाना है', 'I have to go to the market'),
      I('پنڈ', 'piṇḍ', 'गाँव', 'village'),
      I('شہر', 'shahir', 'शहर', 'city'),
      I('گڈی', 'gaḍḍī', 'गाड़ी', 'car, vehicle'),
      I('ٹکٹ', 'ṭikaṭ', 'टिकट', 'ticket'),
      I('کنی دیر لگے گی؟', 'kinnī der lagge gī?', 'कितनी देर लगेगी?', 'How long will it take?'),
    ],
  },
  {
    n: 7, title: 'Sehat · Health', kind: 'new',
    note: 'At the doctor’s: what hurts, the medicine, rest — and کھانگھی, the cough Punjabi pronounces its own way.',
    items: [
      I('میری طبیت ٹھیک نئیں', 'merī tabīat ṭhīk naīṉ', 'मेरी तबीयत ठीक नहीं', 'I am not feeling well'),
      I('مینوں بخار اے', 'mainūṉ bukhār e', 'मुझे बुख़ार है', 'I have a fever'),
      I('سر وچ درد اے', 'sir vichch dard e', 'सर में दर्द है', 'I have a headache — وچ (vichch) is “in”'),
      I('ڈاکٹر کول جانا اے', 'ḍākṭar kol jāṇā e', 'डॉक्टर के पास जाना है', 'I need to go to the doctor — کول (kol) is “near / to”'),
      I('دوائی کھا لئی؟', 'davāī khā laī?', 'दवा खा ली?', 'Did you take the medicine?'),
      I('آرام کرو', 'ārām karo', 'आराम करो', 'Take rest'),
      I('پانی بوہتا پیو', 'pānī bohtā pīo', 'पानी ख़ूब पियो', 'Drink plenty of water'),
      I('چھیتی ٹھیک ہو جاؤ', 'chhetī ṭhīk ho jāo', 'जल्दी ठीक हो जाओ', 'Get well soon — چھیتی (chhetī) is “quickly”'),
      I('رب تینوں صحت دیوے', 'rabb tainūṉ sihhat deve', 'रब तुम्हें सेहत दे', 'May God give you health — تینوں (tainūṉ) is “to you”'),
      I('کھانگھی', 'khāṉghī', 'खाँसी', 'a cough — with a گھ, the Punjabi way'),
      I('ہن کجھ چنگا محسوس ہو رہیا اے', 'huṇ kujh changā mahisūs ho rihā e', 'अब कुछ अच्छा महसूस हो रहा है', 'I am feeling a bit better now'),
    ],
  },
  {
    n: 8, title: 'Roz di gall · Everyday talk', kind: 'new',
    note: 'گل (gall) — a matter, a thing said — does in Punjabi what بات does in Urdu. These lines run on it.',
    items: [
      I('ذرا سݨو', 'zarā suṇo', 'ज़रा सुनो', 'Listen a moment'),
      I('ہنے آؤندا واں', 'huṇe āundā vāṉ', 'अभी आता हूँ', 'I am coming right now'),
      I('کی گل اے؟', 'kīh gall e?', 'क्या बात है?', 'What is the matter?'),
      I('کوئی گل نئیں', 'koī gall naīṉ', 'कोई बात नहीं', 'No problem'),
      I('چل چلیے', 'chal chalīe', 'चलो चलें', 'Come, let us go'),
      I('اج موسم چنگا اے', 'ajj mosam changā e', 'आज मौसम अच्छा है', 'The weather is nice today'),
      I('مینھ پئے رہیا اے', 'mīnh pai rihā e', 'बारिश हो रही है', 'It is raining — مینھ (mīnh) is rain itself'),
      I('مینوں نیند آ رہی اے', 'mainūṉ nīnd ā rahī e', 'मुझे नींद आ रही है', 'I am feeling sleepy'),
      I('رک جا', 'ruk jā', 'रुक जा', 'Wait — hold on'),
      I('ویکھدے آں', 'vekhde āṉ', 'देखते हैं', 'We shall see — the -de present with آں'),
      I('سب ٹھیک اے', 'sab ṭhīk e', 'सब ठीक है', 'All is well'),
    ],
  },
  {
    n: 9, title: 'Khayal te jazbaat · Feelings & opinions', kind: 'new',
    note: 'Opinion frames in Punjabi dress: لگدا اے (it seems), خیال وچ (in the thought), سچی گل (the true matter).',
    items: [
      I('مینوں لگدا اے جو…', 'mainūṉ lagdā e jo…', 'मुझे लगता है कि…', 'I think that…'),
      I('میرے خیال وچ', 'mere khayāl vichch', 'मेरे ख़याल में', 'In my opinion'),
      I('تہاڈا کی خیال اے؟', 'tuhāḍā kīh khayāl e?', 'तुम्हारा क्या ख़याल है?', 'What do you think?'),
      I('مینوں یقین اے', 'mainūṉ yaqīn e', 'मुझे यक़ीन है', 'I am sure'),
      I('مینوں بڑی خوشی ہوئی', 'mainūṉ baṛī khushī hoī', 'मुझे बहुत ख़ुशी हुई', 'I felt very happy'),
      I('مینوں افسوس ہویا', 'mainūṉ afsos hoyā', 'मुझे अफ़सोस हुआ', 'I felt sad — I felt sorry'),
      I('سچی گل ایہ اے جو…', 'sachchī gall īh e jo…', 'सच्ची बात यह है कि…', 'The honest truth is that…'),
      I('مینوں ایہ پسند اے', 'mainūṉ īh pasand e', 'मुझे यह पसंद है', 'I like this'),
      I('شاید', 'shāid', 'शायद', 'perhaps'),
      I('بالکل ٹھیک', 'bilkul ṭhīk', 'बिल्कुल ठीक', 'Absolutely right'),
    ],
  },
  {
    n: 10, title: 'Akhan · Punjabi proverbs', kind: 'new',
    note: 'اخان (akhāṇ) — the sayings. A Punjabi conversation is seasoned with these; learn them whole.',
    items: [
      I('جتھے چاہ، اتھے راہ', 'jithhe chāh, uthhe rāh', 'जहाँ चाह, वहाँ राह', 'Where there is a will, there is a way'),
      I('جو بیجیے، سو کھائیے', 'jo bījīe, so khāīe', 'जो बोओगे, सो खाओगे', 'As you sow, so shall you eat'),
      I('سو سنار دی، ہک لوہار دی', 'sau sunār dī, hik luhār dī', 'सौ सुनार की, एक लुहार की', 'A hundred taps of the goldsmith equal one blow of the blacksmith'),
      I('اچی دوکان، پھکا پکوان', 'uchchī dukān, phikkā pakvān', 'ऊँची दुकान, फीका पकवान', 'A grand shop with bland food — all show, no substance'),
      I('محنت دا پھل مٹھا', 'mihnat dā phal miṭṭhā', 'मेहनत का फल मीठा', 'The fruit of hard work is sweet'),
      I('رب دے گھر دیر اے، اندھیر نئیں', 'rabb de ghar der e, andher naīṉ', 'रब के घर देर है, अंधेर नहीं', 'At God’s door there may be delay, never darkness'),
      I('ویلا کسے دا انتظار نئیں کردا', 'velā kise dā intzār naīṉ kardā', 'वक़्त किसी का इंतज़ार नहीं करता', 'Time waits for no one'),
      I('برا ویلا دس کے نئیں آؤندا', 'burā velā dass ke naīṉ āundā', 'बुरा वक़्त बता कर नहीं आता', 'Bad times arrive unannounced'),
    ],
  },
];

export const NOTES = [
  'The present tense ends in -دا (dā), not Hindi’s -tā: کردا (kardā, he does), جاندا (jāndā, he goes), ویکھدا (vekh dā, he sees).',
  '“Of” is دا / دی / دے (dā / dī / de): میرے بھرا دا گھر — my brother’s house. It follows the thing owned, and unlike Saraiki, the possessives are plain میرا / تیرا / تہاڈا.',
  'The verb “to be” splits three ways: آں (āṉ, am) — میں ٹھیک آں؛ اے (e, is) — اوہ ٹھیک اے؛ نے (ne, are) — اوہ ٹھیک نے.',
  'The -نوں family carries “to me / to you / to us”: مینوں (mainūṉ), تینوں (tainūṉ), سانوں (sānūṉ). مینوں چاہیدا اے covers both “I need it” and “I should”.',
  'Punjabi is a TONAL language — the old breathy consonants (ਘ ਭ ਧ…) turned into pitch. گھوڑا in Gurmukhi is “ghòṛā”, a horse, said low; کوڑا “koṛā” is a leper. Hindi ears hear them as near-twins; Punjabi ears never confuse them. The Roman in this course does not mark tones — use your ears on the read-aloud, imperfect as it is.',
  'Words Hindi speakers do not say: چنگا (changā, good), سواد (savād, tasty), گل (gall, a matter), ویلا (velā, time), بھلک (bhalak, tomorrow), چھیتی (chhetī, quickly), کول (kol, near), وچ (vichch, in).',
];

/* ------------------------------------------------------- drill pools */
export const NUMBER_ITEMS = NUMBERS.map(([num, s, r]) => ({
  s, r, hi: String(num), en: `the number ${num}`, n: 3,
}));
export const ALL_ITEMS = SABAK.flatMap((sb) => sb.items.map((it) => ({ ...it, n: sb.n })));
export const VOCAB = [...ALL_ITEMS, ...NUMBER_ITEMS];
export const PHRASE_COUNT = ALL_ITEMS.length + NUMBERS.length;
