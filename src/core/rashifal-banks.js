/* Rashifal content engine — fully self-contained, NO machine translation.
 * Hand-written phrase banks in three registers (proper Hindi, English,
 * Hinglish). Deterministic: the same date + same rashi gives the same
 * reading all day (seeded hash), and it changes the next day. Each field
 * draws with its own salt so combinations stay varied. */

export const RASHIFAL_BANKS = {
  hi: {
    overall: [
      'आज का दिन आपके लिए अनुकूल रहेगा। रुके हुए काम गति पकड़ेंगे और मन प्रसन्न रहेगा।',
      'आज धैर्य से काम लें — जल्दबाज़ी में लिया फ़ैसला बाद में बदलना पड़ सकता है। शाम तक स्थिति साफ़ होगी।',
      'आज किस्मत आपका साथ देगी। कोई शुभ समाचार मिल सकता है और पुरानी चिंता दूर होगी।',
      'आज का दिन मिश्रित रहेगा — सुबह थोड़ी भागदौड़, पर दोपहर बाद सब संभल जाएगा।',
      'आज आत्मविश्वास ऊँचा रहेगा। लोग आपकी बात सुनेंगे, बस वाणी में मिठास बनाए रखें।',
      'आज धन और समय दोनों की बचत पर ध्यान दें। छोटी-छोटी लापरवाहियाँ बड़ा नुकसान कर सकती हैं।',
      'आज कोई पुराना मित्र या संबंध काम आएगा। मदद मांगने में संकोच न करें।',
      'आज मन थोड़ा अशांत रह सकता है। ध्यान और थोड़ी सैर से दिन सुधरेगा।',
    ],
    career: [
      'कार्यक्षेत्र में आपकी मेहनत रंग लाएगी। वरिष्ठ अधिकारी प्रसन्न रहेंगे।',
      'नौकरी-व्यापार में आज कोई नया अवसर दस्तक दे सकता है — पूरी जानकारी लेकर ही आगे बढ़ें।',
      'आज सहकर्मियों से मतभेद संभव है। बहस से बचें, काम से जवाब दें।',
      'पैसों के लेन-देन में आज सावधानी रखें। उधार देने से बचें।',
      'छात्रों के लिए दिन अच्छा है — पढ़ाई में मन लगेगा और परीक्षा की तैयारी मज़बूत होगी।',
      'आज का दिन योजनाएँ बनाने के लिए उत्तम है, क्रियान्वयन कल से शुरू करें।',
    ],
    love: [
      'प्रेम संबंधों में मधुरता रहेगी। जीवनसाथी के साथ समय बिताएँ, पुरानी गलतफ़हमी दूर होगी।',
      'आज साथी की भावनाओं को समझने का प्रयास करें — छोटी बात पर नाराज़गी लंबी खिंच सकती है।',
      'अविवाहितों के लिए आज कोई अच्छा प्रस्ताव या मुलाक़ात संभव है।',
      'परिवार में किसी बुज़ुर्ग का आशीर्वाद और सलाह आज बहुत काम आएगी।',
      'आज अपने मन की बात कहने का अच्छा दिन है — संकोच छोड़ें, पर शब्द सोचकर चुनें।',
      'रिश्तों में आज थोड़ी दूरी महसूस हो सकती है। शांति से बातचीत ही हल है।',
    ],
    health: [
      'स्वास्थ्य सामान्य रहेगा। पानी पर्याप्त पिएँ और नींद पूरी करें।',
      'आज थकान और सिरदर्द रह सकता है — काम के बीच छोटे विश्राम लें।',
      'पेट संबंधी तकलीफ़ से बचें — हल्का और समय पर भोजन करें।',
      'ऊर्जा अच्छी रहेगी। सुबह की सैर या हल्का व्यायाम फ़ायदा देगा।',
      'आँखों और गर्दन पर दबाव न डालें — स्क्रीन से बीच-बीच में नज़र हटाएँ।',
      'मानसिक शांति के लिए आज थोड़ा समय अकेले बिताएँ, मन हल्का होगा।',
    ],
    advice: [
      'उपाय: सुबह सूर्य को जल अर्पित करें, दिन शुभ रहेगा।',
      'उपाय: आज किसी ज़रूरतमंद को अन्न या फल दान करें।',
      'उपाय: घर से निकलते समय माता-पिता का आशीर्वाद लेकर जाएँ।',
      'उपाय: आज हनुमान जी के सामने दीपक जलाएँ, बाधाएँ दूर होंगी।',
      'उपाय: क्रोध पर नियंत्रण रखें — एक शांत निर्णय आज सबसे बड़ा लाभ देगा।',
      'उपाय: आज शाम को पीपल या तुलसी के पास दीपक जलाना शुभ रहेगा।',
    ],
    colours: ['लाल', 'केसरिया', 'पीला', 'हरा', 'नीला', 'सफ़ेद', 'गुलाबी', 'सुनहरा', 'बैंगनी', 'आसमानी'],
  },
  en: {
    overall: [
      'A favourable day overall. Delayed work starts moving and your mind stays light.',
      'Move patiently today — a rushed decision may need reversing. Things clear up by evening.',
      'Luck supports you today. Good news is possible and an old worry fades.',
      'A mixed day — a busy morning, but everything settles after noon.',
      'Your confidence runs high today. People will listen to you; keep your words sweet.',
      'Guard both money and time today. Small carelessness can cost more than it looks.',
      'An old friend or contact proves useful today. Do not hesitate to ask for help.',
      'The mind may feel restless today. A short walk and some quiet time will fix the day.',
    ],
    career: [
      'Your hard work shows results at work. Seniors will be pleased with you.',
      'A new opportunity may knock today — gather full information before you commit.',
      'Differences with colleagues are possible. Avoid arguments; let your work answer.',
      'Be careful with money matters today. Avoid lending.',
      'A good day for students — focus comes easily and exam preparation strengthens.',
      'Today is ideal for planning. Start execution from tomorrow.',
    ],
    love: [
      'Sweetness rules your relationships. Time with your partner clears an old misunderstanding.',
      'Try to understand your partner\u2019s feelings today — a small sulk can stretch long.',
      'For the unmarried, a good proposal or a meaningful meeting is possible today.',
      'An elder\u2019s blessing and advice at home will prove very useful today.',
      'A good day to speak your heart — drop hesitation, but choose words with care.',
      'A little distance may be felt in relationships. Calm conversation is the only cure.',
    ],
    health: [
      'Health stays normal. Drink enough water and complete your sleep.',
      'Tiredness or a headache is possible — take short breaks between work.',
      'Avoid stomach trouble — eat light and on time.',
      'Energy levels are good. A morning walk or light exercise will help.',
      'Do not strain your eyes and neck — look away from the screen regularly.',
      'Spend a little time alone for mental peace; the mind will feel lighter.',
    ],
    advice: [
      'Remedy: offer water to the rising Sun — the day turns auspicious.',
      'Remedy: donate food or fruit to someone in need today.',
      'Remedy: take your parents\u2019 blessings before stepping out.',
      'Remedy: light a lamp before Hanuman ji today — obstacles will ease.',
      'Remedy: control anger — one calm decision brings today\u2019s biggest gain.',
      'Remedy: light a lamp near a tulsi or peepal in the evening.',
    ],
    colours: ['Red', 'Saffron', 'Yellow', 'Green', 'Blue', 'White', 'Pink', 'Golden', 'Purple', 'Sky blue'],
  },
  hing: {
    overall: [
      'Aaj ka din aapke favour me rahega. Ruke hue kaam speed pakdenge aur mood fresh rahega.',
      'Aaj patience se kaam lo — jaldbazi wala decision baad me palatna pad sakta hai. Shaam tak picture clear hogi.',
      'Aaj luck saath degi. Koi good news mil sakti hai aur purani tension khatm hogi.',
      'Din mixed rahega — subah thodi bhaag-daud, lekin dopahar ke baad sab set ho jayega.',
      'Aaj confidence high rahega. Log aapki baat sunenge, bas bolne me mithaas rakho.',
      'Aaj paisa aur time dono bachakar chalo. Chhoti si laparwahi bada nuksaan kar sakti hai.',
      'Aaj koi purana dost ya contact kaam aayega. Help maangne me sharmao mat.',
      'Aaj mann thoda restless reh sakta hai. Thodi walk aur shaanti se din sudhar jayega.',
    ],
    career: [
      'Kaam me aapki mehnat dikhegi. Boss aur seniors khush rahenge.',
      'Job-business me aaj naya mauka mil sakta hai — pehle poori jaankari lo, phir haan kaho.',
      'Aaj colleagues se behes ho sakti hai. Ladne ki jagah kaam se jawab do.',
      'Paison ke len-den me aaj dhyaan rakho. Udhaar dene se bacho.',
      'Students ke liye din badhiya hai — padhai me mann lagega, preparation strong hogi.',
      'Aaj ka din planning ke liye best hai, kaam kal se shuru karo.',
    ],
    love: [
      'Relations me mithaas rahegi. Partner ke saath time bitao, purani galatfehmi door hogi.',
      'Aaj partner ki feelings samajhne ki koshish karo — chhoti narazgi lambi khinch sakti hai.',
      'Single logo ke liye aaj achha proposal ya koi khaas mulakaat possible hai.',
      'Ghar me kisi buzurg ka aashirwad aur salah aaj bahut kaam aayegi.',
      'Aaj dil ki baat kehne ka achha din hai — hesitation chhodo, lekin words soch ke bolo.',
      'Rishton me aaj thodi doori feel ho sakti hai. Shaanti se baat-cheet hi hal hai.',
    ],
    health: [
      'Health normal rahegi. Paani khoob piyo aur neend poori karo.',
      'Aaj thakan ya headache ho sakta hai — kaam ke beech me chhote breaks lo.',
      'Pet ki takleef se bacho — halka khana, time par khao.',
      'Energy achhi rahegi. Subah ki walk ya halki exercise fayda degi.',
      'Aankhon aur gardan par zor mat do — screen se beech-beech me nazar hatao.',
      'Mental peace ke liye aaj thoda time akele bitao, mann halka hoga.',
    ],
    advice: [
      'Upay: subah ugte Suraj ko jal chadhao, din shubh rahega.',
      'Upay: aaj kisi zaruratmand ko khana ya phal daan karo.',
      'Upay: ghar se nikalte time maa-baap ka aashirwad lekar jao.',
      'Upay: aaj Hanuman ji ke saamne deepak jalao, rukawatein door hongi.',
      'Upay: gusse par control rakho — ek shaant decision aaj sabse bada fayda dega.',
      'Upay: shaam ko tulsi ya peepal ke paas deepak jalana shubh rahega.',
    ],
    colours: ['Laal', 'Kesariya', 'Peela', 'Hara', 'Neela', 'Safed', 'Gulabi', 'Sunehra', 'Baingani', 'Aasmani'],
  },
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/* dateStr: 'YYYY-MM-DD' (local). signIdx: 0-11. register: 'hi'|'en'|'hing' */
export function rashifalFor(signIdx, dateStr, register) {
  const bank = RASHIFAL_BANKS[register] || RASHIFAL_BANKS.en;
  const pick = (arr, salt) => arr[hashStr(`${dateStr}|${signIdx}|${salt}`) % arr.length];
  return {
    overall: pick(bank.overall, 'ov'),
    career: pick(bank.career, 'ca'),
    love: pick(bank.love, 'lo'),
    health: pick(bank.health, 'he'),
    advice: pick(bank.advice, 'ad'),
    luckyNumber: (hashStr(`${dateStr}|${signIdx}|num`) % 9) + 1,
    luckyColour: pick(bank.colours, 'col'),
    score: 55 + (hashStr(`${dateStr}|${signIdx}|score`) % 41),
  };
}
