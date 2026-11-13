/**
 * Built-in festival calendar — the OFFLINE-FIRST source of truth.
 *
 * Why this exists: every free holiday API we tested either has no India data
 * (Nager.Date returns HTTP 204 for IN), needs a paid key (HolidayAPI 401,
 * API-Ninjas 400), or requires a CORS proxy — and the public proxies were
 * measured at 408 / 401 / 522. Depending on them would mean the Festivals tool
 * breaks exactly when the user opens it.
 *
 * So the primary source is this local table: zero network, instant, always up.
 * Live APIs are kept as *enrichment* fallbacks for other countries.
 *
 * WAVE A (2026-11-13): India entries now carry a tradition tag and, where a
 * date depends on a moon sighting, an `expected` marker. Entry format:
 *   [date, name, tradition, expected?]
 *
 * Where the India dates come from (per family):
 *   · Gregorian-fixed (Christmas, Republic Day, Baisakhi, New Year) — the
 *     calendar rule itself; exact every year.
 *   · Hindu lunar festivals — the dates published for New Delhi by Drik
 *     Panchang / the Government of India holiday list for that year
 *     (Diwali = Kartik Amavasya, Holi = Phalguna Purnima, and so on).
 *     The Diwali week follows the Delhi reckoning: in 2026 Amavasya runs
 *     into midday on 9 Nov, so Govardhan Puja is 10 Nov and Bhai Dooj
 *     11 Nov — some regional calendars print them a day earlier.
 *   · Muslim festivals — the recognised expected dates for the year,
 *     flagged `expected`: the real day is fixed by the sighting of the
 *     moon and can move by one day.
 *   · Sikh dates — Gurpurabs follow the SGPC Nanakshahi calendar;
 *     Guru Nanak's Gurpurab stays on Kartik Purnima, as the SGPC keeps it.
 *     Guru Gobind Singh's Prakash Purab is listed on 5 Jan 2026 (the
 *     Government of India holiday list) and on 15 Jan 2027 (the SGPC
 *     Nanakshahi date, 2 Magh) — the two reckonings genuinely differ and
 *     the note in the app says so.
 *   · Christian movable dates (Good Friday, Easter) — computed from the
 *     Western Easter for the year (2026: 5 Apr; 2027: 28 Mar).
 * A regional festival is only added when a published date for the year
 * could be verified; an absent festival means "not verified", never a
 * guessed date. Borderline tithi calls were cross-checked with the app's
 * own panchang engine (scripts/verify_wave_a.mjs): Holi 2027 (Purnima
 * begins 21 Mar, 6:21 PM — Dahan that evening, Holi 22 Mar), Dussehra
 * 2027 (Dashami from 9 Oct, 9:02 AM — Vijayadashami 9 Oct), Chhath 2026
 * (Shashthi begins 14 Nov, 11:24 PM — the arghya day is 15 Nov).
 */

const IN = {
  2025: [
    ['2025-01-01','New Year\'s Day','Cultural'],['2025-01-13','Lohri','Sikh'],['2025-01-14','Makar Sankranti / Pongal','Hindu'],
    ['2025-01-26','Republic Day','National'],['2025-02-02','Vasant Panchami','Hindu'],['2025-02-26','Maha Shivaratri','Hindu'],
    ['2025-03-13','Holika Dahan','Hindu'],['2025-03-14','Holi','Hindu'],['2025-03-31','Eid al-Fitr','Muslim',1],
    ['2025-04-06','Ram Navami','Hindu'],['2025-04-10','Mahavir Jayanti','Jain'],['2025-04-13','Baisakhi','Sikh'],
    ['2025-04-14','Ambedkar Jayanti','National'],['2025-04-18','Good Friday','Christian'],['2025-05-12','Buddha Purnima','Buddhist'],
    ['2025-06-07','Eid al-Adha (Bakrid)','Muslim',1],['2025-07-06','Muharram','Muslim',1],['2025-08-09','Raksha Bandhan','Hindu'],
    ['2025-08-15','Independence Day','National'],['2025-08-16','Janmashtami','Hindu'],['2025-08-27','Ganesh Chaturthi','Hindu'],
    ['2025-09-05','Onam','Hindu'],['2025-09-05','Milad un-Nabi','Muslim',1],['2025-10-02','Gandhi Jayanti','National'],
    ['2025-10-02','Dussehra','Hindu'],['2025-10-20','Diwali','Hindu'],['2025-10-22','Govardhan Puja','Hindu'],
    ['2025-10-23','Bhai Dooj','Hindu'],['2025-11-05','Guru Nanak Jayanti','Sikh'],['2025-12-25','Christmas Day','Christian'],
  ],
  2026: [
    ['2026-01-01','New Year\'s Day','Cultural'],['2026-01-05','Guru Gobind Singh Jayanti','Sikh'],
    ['2026-01-13','Lohri','Sikh'],['2026-01-14','Makar Sankranti / Pongal','Hindu'],
    ['2026-01-23','Vasant Panchami','Hindu'],['2026-01-26','Republic Day','National'],
    ['2026-02-15','Maha Shivaratri','Hindu'],['2026-02-19','Ramadan begins','Muslim',1],
    ['2026-03-03','Holika Dahan','Hindu'],['2026-03-04','Holi','Hindu'],['2026-03-04','Hola Mohalla','Sikh'],
    ['2026-03-19','Chaitra Navratri begins / Ugadi','Hindu'],['2026-03-20','Eid al-Fitr','Muslim',1],
    ['2026-03-26','Ram Navami','Hindu'],['2026-03-31','Mahavir Jayanti','Jain'],['2026-04-03','Good Friday','Christian'],
    ['2026-04-05','Easter Sunday','Christian'],['2026-04-14','Baisakhi','Sikh'],['2026-04-14','Ambedkar Jayanti','National'],
    ['2026-05-01','Buddha Purnima','Buddhist'],['2026-05-27','Eid al-Adha (Bakrid)','Muslim',1],
    ['2026-06-26','Muharram','Muslim',1],['2026-07-29','Guru Purnima','Hindu'],
    ['2026-08-15','Independence Day','National'],['2026-08-17','Nag Panchami','Hindu'],
    ['2026-08-25','Milad un-Nabi','Muslim',1],['2026-08-26','Onam','Hindu'],['2026-08-28','Raksha Bandhan','Hindu'],
    ['2026-09-04','Janmashtami','Hindu'],['2026-09-14','Ganesh Chaturthi','Hindu'],
    ['2026-10-02','Gandhi Jayanti','National'],['2026-10-11','Sharad Navratri begins','Hindu'],
    ['2026-10-20','Dussehra','Hindu'],['2026-10-29','Karva Chauth','Hindu'],
    ['2026-11-06','Dhanteras','Hindu'],['2026-11-08','Diwali','Hindu'],['2026-11-08','Bandi Chhor Divas','Sikh'],
    ['2026-11-10','Govardhan Puja','Hindu'],['2026-11-11','Bhai Dooj','Hindu'],
    ['2026-11-15','Chhath Puja','Hindu'],['2026-11-14','Joti Jot — Guru Gobind Singh','Sikh'],
    ['2026-11-24','Guru Nanak Jayanti','Sikh'],['2026-12-12','Gurgaddi — Guru Gobind Singh','Sikh'],
    ['2026-12-25','Christmas Day','Christian'],
  ],
  2027: [
    ['2027-01-01','New Year\'s Day','Cultural'],['2027-01-13','Lohri','Sikh'],['2027-01-14','Makar Sankranti / Pongal','Hindu'],
    ['2027-01-15','Guru Gobind Singh Jayanti','Sikh'],['2027-01-26','Republic Day','National'],
    ['2027-02-11','Vasant Panchami','Hindu'],['2027-03-06','Maha Shivaratri','Hindu'],
    ['2027-03-10','Eid al-Fitr','Muslim',1],['2027-03-21','Holika Dahan','Hindu'],['2027-03-22','Holi','Hindu'],
    ['2027-03-26','Good Friday','Christian'],['2027-03-28','Easter Sunday','Christian'],
    ['2027-04-14','Baisakhi','Sikh'],['2027-04-14','Ambedkar Jayanti','National'],['2027-04-15','Ram Navami','Hindu'],
    ['2027-05-17','Eid al-Adha (Bakrid)','Muslim',1],['2027-05-20','Buddha Purnima','Buddhist'],
    ['2027-06-16','Muharram','Muslim',1],
    ['2027-08-15','Independence Day','National'],['2027-08-17','Raksha Bandhan','Hindu'],['2027-08-25','Janmashtami','Hindu'],
    ['2027-09-04','Ganesh Chaturthi','Hindu'],['2027-10-02','Gandhi Jayanti','National'],['2027-10-09','Dussehra','Hindu'],
    ['2027-10-27','Dhanteras','Hindu'],['2027-10-29','Diwali','Hindu'],['2027-10-30','Govardhan Puja','Hindu'],
    ['2027-10-31','Bhai Dooj','Hindu'],['2027-11-14','Guru Nanak Jayanti','Sikh'],['2027-12-25','Christmas Day','Christian'],
  ],
};

const PK = {
  2025: [['2025-02-05','Kashmir Day'],['2025-03-23','Pakistan Day'],['2025-03-31','Eid al-Fitr'],
    ['2025-05-01','Labour Day'],['2025-06-07','Eid al-Adha'],['2025-07-06','Ashura'],
    ['2025-08-14','Independence Day'],['2025-09-05','Eid Milad un-Nabi'],
    ['2025-11-09','Iqbal Day'],['2025-12-25','Quaid-e-Azam Day']],
  2026: [['2026-02-05','Kashmir Day'],['2026-03-20','Eid al-Fitr'],['2026-03-23','Pakistan Day'],
    ['2026-05-01','Labour Day'],['2026-05-27','Eid al-Adha'],['2026-06-26','Ashura'],
    ['2026-08-14','Independence Day'],['2026-08-25','Eid Milad un-Nabi'],
    ['2026-11-09','Iqbal Day'],['2026-12-25','Quaid-e-Azam Day']],
  2027: [['2027-02-05','Kashmir Day'],['2027-03-10','Eid al-Fitr'],['2027-03-23','Pakistan Day'],
    ['2027-05-01','Labour Day'],['2027-05-17','Eid al-Adha'],['2027-08-14','Independence Day'],
    ['2027-12-25','Quaid-e-Azam Day']],
};

const TABLES = { IN, PK };

/** Local, instant, never-fails provider. */
export const builtinHolidays = {
  id: 'builtin',
  label: 'Built-in calendar (offline)',
  async run({ cc, year }) {
    const t = TABLES[(cc || 'IN').toUpperCase()]?.[year];
    if (!t) throw new Error('not in local table');
    return t.map(([date, name, tradition, expected]) => ({
      date, name, en: name, local: true,
      tradition: tradition || null, expected: !!expected,
    })).sort((a, b) => a.date.localeCompare(b.date));
  },
};
