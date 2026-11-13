/**
 * panchang.js — a real daily Panchang, computed entirely on the device.
 *
 * Everything here is astronomy, not a table: Sun and Moon longitudes come
 * from the same ephemeris the Kundli engine uses (astronomy-engine), the
 * sidereal conversion and the tithi / nakshatra names come from the app's
 * own vedic module (src/core/kundli/vedic.js), and sunrise / sunset come
 * from the standard NOAA solar equations evaluated locally. Nothing is
 * fetched, so the tool works offline and for any date the user picks.
 *
 * Two honest corrections to the shared engine, applied HERE rather than
 * by editing the engine the Kundli tool depends on:
 *   · Yoga — vedic.js's calculatePanchang sums the TROPICAL longitudes.
 *     Nitya yoga is defined on sidereal (nirayana) longitudes, so the
 *     yoga is recomputed here from the sidereal sum.
 *   · Karana — vedic.js cycles the 11 names with a naive % 11. The real
 *     sequence is fixed: Kimstughna for the first half-tithi, the seven
 *     movable karanas repeated eight times, then Shakuni, Chatushpada
 *     and Naga for the last three half-tithis. That sequence is used here.
 *   · Tithi NAME — the engine's 15-entry table merges Purnima/Amavasya
 *     and its lookup clamps at index 14, so Krishna-paksha names come
 *     out wrong; names are picked here from the full 15-name cycle.
 * The tithi NUMBER (an elongation — identical in both zodiacs), the
 * nakshatra computation and vara are taken from the engine unchanged.
 *
 * Rahu Kaal / Yamaganda / Gulika Kaal are the standard weekday segments:
 * the daylight span is divided into eight equal parts and each weekday
 * owns a fixed segment number (the table used by printed panchangs).
 *
 * The Hindu (Amanta) month is found from the new moon that opened the
 * current lunar month: the month is named for the sidereal sign the Sun
 * occupied at that new moon. Adhika / kshaya months are not separately
 * flagged — the month name shown is the nija month for the date.
 */

import { calculateAyanamsa, tropicalToSidereal, calculateNakshatra, calculatePanchang } from './kundli/vedic.js';
import { YOGAS, KARANAS } from './kundli/constants.js';

let astroMod = null;
async function astro() {
  if (!astroMod) astroMod = await import('astronomy-engine');
  return astroMod;
}

/* ------------------------------------------------------------ sun times
   NOAA solar calculator equations (Julian-century form), evaluated for
   the civil date at the place. Two passes: the second recomputes the
   equation of time and declination at the estimated event instant. */
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
function julianDayUTC(date) { return date.getTime() / 86400000 + 2440587.5; }

function sunCalc(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const varY = Math.tan(eps * RAD / 2) ** 2;
  const L0r = L0 * RAD;
  const eqTime = 4 * DEG * (varY * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr)
    + 4 * e * varY * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * varY * varY * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr)); // minutes
  return { decl, eqTime };
}

/** Sunrise / sunset / solar noon as absolute Dates for one civil day.
 *  `midnightUTC` is the UTC instant of local midnight; tzMin is the
 *  place's offset from UTC in minutes (east positive). */
export function sunTimes(midnightUTCms, lat, lon, tzMin) {
  const solve = (minsGuess, isRise) => {
    let mins = minsGuess;
    for (let i = 0; i < 2; i++) {
      const jd = julianDayUTC(new Date(midnightUTCms + mins * 60000));
      const { decl, eqTime } = sunCalc(jd);
      const latR = lat * RAD, declR = decl * RAD;
      const cosHA = Math.cos(90.833 * RAD) / (Math.cos(latR) * Math.cos(declR)) - Math.tan(latR) * Math.tan(declR);
      if (cosHA < -1 || cosHA > 1) return null;      // polar day / night
      const HA = Math.acos(cosHA) * DEG;
      mins = 720 - 4 * (lon + (isRise ? HA : -HA)) - eqTime + tzMin;
    }
    return mins;
  };
  const riseMin = solve(360, true);
  const setMin = solve(1080, false);
  if (riseMin == null || setMin == null) return null;
  const at = (m) => new Date(midnightUTCms + m * 60000);
  return {
    sunrise: at(riseMin), sunset: at(setMin),
    solarNoon: at((riseMin + setMin) / 2),
    dayLengthMs: (setMin - riseMin) * 60000,
  };
}

/* ------------------------------------------------------------- positions */
async function sunMoon(date) {
  const a = await astro();
  const t = a.MakeTime(date);
  const sun = a.Ecliptic(a.GeoVector(a.Body.Sun, t, true)).elon;
  const moon = a.EclipticGeoMoon(t).lon;
  return { sunT: ((sun % 360) + 360) % 360, moonT: ((moon % 360) + 360) % 360 };
}
const elong = (s, m) => ((m - s) % 360 + 360) % 360;

/** Bisect the instant in (t0, t1) where fn(date) crosses `target` upward
 *  (fn is a 0–360 phase). Returns a Date. */
async function crossTime(t0, t1, phaseFn, target) {
  let lo = t0.getTime(), hi = t1.getTime();
  const pLo = await phaseFn(new Date(lo));
  for (let i = 0; i < 40 && hi - lo > 20000; i++) {
    const mid = (lo + hi) / 2;
    const p = await phaseFn(new Date(mid));
    const rel = ((p - pLo) % 360 + 360) % 360;
    const tgt = ((target - pLo) % 360 + 360) % 360;
    if (rel < tgt) lo = mid; else hi = mid;
  }
  return new Date((lo + hi) / 2);
}

/* ---------------------------------------------------------------- karana */
const MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];
export function karanaName(halfIdx) {
  if (halfIdx <= 0) return 'Kimstughna';
  if (halfIdx >= 57) return ['Shakuni', 'Chatushpada', 'Naga'][Math.min(59, halfIdx) - 57];
  return MOVABLE[(halfIdx - 1) % 7];
}

/* ------------------------------------------------------- kaal segments
   Segment numbers (1 = first eighth of daylight) per weekday, Sunday
   first — the table printed panchangs use. */
const RAHU_SEG = [8, 2, 7, 5, 6, 4, 3];
const YAMA_SEG = [5, 4, 3, 2, 1, 7, 6];
const GULI_SEG = [7, 6, 5, 4, 3, 2, 1];

/* ---------------------------------------------------------- hindu month */
const MONTH_BY_SIGN = ['Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin',
  'Kartik', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna', 'Chaitra']; // index = Sun's sidereal sign 0..11 at new moon
const MONTH_ORDER = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada',
  'Ashwin', 'Kartik', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna'];

/** Timezone offset (minutes east of UTC) for an IANA zone on a date. */
export function tzOffsetMinutes(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

/**
 * Full panchang for one civil day at one place.
 * @param y/m/d  civil date in the place's timezone
 * @param tzMin  offset minutes east of UTC for that place & date
 * Returns null only if the sun never rises/sets (polar) that day.
 */
export async function computePanchang({ y, m, d, lat, lon, tzMin }) {
  const midnightUTCms = Date.UTC(y, m - 1, d) - tzMin * 60000;
  const st = sunTimes(midnightUTCms, lat, lon, tzMin);
  if (!st) return null;
  const { sunrise, sunset, solarNoon, dayLengthMs } = st;

  const yearFrac = y + ((m - 1) * 30.44 + d) / 365.25;
  const ay = calculateAyanamsa(yearFrac);
  const ayVal = typeof ay === 'object' ? ay.value : ay;

  const atSunrise = await sunMoon(sunrise);
  const sunSid = tropicalToSidereal(atSunrise.sunT, ayVal).sidereal;
  const moonSid = tropicalToSidereal(atSunrise.moonT, ayVal).sidereal;

  const JD_UTC = julianDayUTC(sunrise);
  const eng = calculatePanchang({
    sunTropical: atSunrise.sunT, moonTropical: atSunrise.moonT,
    sunSidereal: sunSid, moonSidereal: moonSid, ayanamsa: ayVal,
    JD_UTC, weekday: sunrise.getDay(),
  });

  const el = elong(atSunrise.sunT, atSunrise.moonT);
  const tithiIdx = Math.floor(el / 12);                    // 0..29
  /* The engine's name table merges both 15th tithis into one entry and
     its lookup clamps at 14, so Krishna-paksha names come out wrong from
     it; the name is therefore picked here from the full 15-name cycle. */
  const T15 = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami',
    'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', ''];
  const T15HI = ['प्रतिपदा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पंचमी', 'षष्ठी', 'सप्तमी',
    'अष्टमी', 'नवमी', 'दशमी', 'एकादशी', 'द्वादशी', 'त्रयोदशी', 'चतुर्दशी', ''];
  const tName = tithiIdx % 15 === 14 ? (tithiIdx === 14 ? 'Purnima' : 'Amavasya') : T15[tithiIdx % 15];
  const tNameHi = tithiIdx % 15 === 14 ? (tithiIdx === 14 ? 'पूर्णिमा' : 'अमावस्या') : T15HI[tithiIdx % 15];
  const halfIdx = Math.floor(el / 6);                      // 0..59
  const yogaIdx = Math.floor((((sunSid + moonSid) % 360) / (360 / 27))) % 27;
  const nak = calculateNakshatra(moonSid);

  /* End instants: bisect forward from sunrise (max +36 h). */
  const horizon = new Date(sunrise.getTime() + 36 * 3600000);
  const tithiEnd = await crossTime(sunrise, horizon,
    async (dt) => { const p = await sunMoon(dt); return elong(p.sunT, p.moonT); }, (tithiIdx + 1) * 12 % 360);
  const nakEnd = await crossTime(sunrise, horizon,
    async (dt) => { const p = await sunMoon(dt); return tropicalToSidereal(p.moonT, ayVal).sidereal; },
    (nak.nakshatraIdx + 1) * (360 / 27) % 360);
  const yogaEnd = await crossTime(sunrise, horizon,
    async (dt) => { const p = await sunMoon(dt); return (tropicalToSidereal(p.sunT, ayVal).sidereal + tropicalToSidereal(p.moonT, ayVal).sidereal) % 360; },
    (yogaIdx + 1) * (360 / 27) % 360);

  /* Kaal segments */
  const seg = (n) => ({
    start: new Date(sunrise.getTime() + (n - 1) * dayLengthMs / 8),
    end: new Date(sunrise.getTime() + n * dayLengthMs / 8),
  });
  const wd = new Date(midnightUTCms + 12 * 3600000).getUTCDay(); // weekday in the place's tz
  const weekdayLocal = new Date(y, m - 1, d).getDay(); // device tz weekday — fallback sanity
  const dayIdx = ((wd % 7) + 7) % 7;

  /* Abhijit: the middle muhurta — centred on solar noon, 1/15 of the day. */
  const abhijit = {
    start: new Date(solarNoon.getTime() - dayLengthMs / 30),
    end: new Date(solarNoon.getTime() + dayLengthMs / 30),
  };
  const brahma = {
    start: new Date(sunrise.getTime() - 96 * 60000),
    end: new Date(sunrise.getTime() - 48 * 60000),
  };

  /* Hindu month from the new moon that opened this lunar month. */
  let hindu = null;
  try {
    let t0 = new Date(sunrise.getTime() - 31 * 86400000);
    let prev = elong((await sunMoon(t0)).sunT, (await sunMoon(t0)).moonT);
    let nmDate = null;
    for (let t = t0.getTime() + 86400000; t <= sunrise.getTime() + 86400000; t += 86400000) {
      const p = await sunMoon(new Date(t));
      const e = elong(p.sunT, p.moonT);
      if (e < prev) { // wrapped through 0 between t-1d and t
        nmDate = await crossTime(new Date(t - 86400000), new Date(t),
          async (dt) => { const q = await sunMoon(dt); return elong(q.sunT, q.moonT); }, 0);
        break;
      }
      prev = e;
    }
    if (nmDate) {
      const p = await sunMoon(nmDate);
      const sign = Math.floor(tropicalToSidereal(p.sunT, ayVal).sidereal / 30) % 12;
      const month = MONTH_BY_SIGN[sign];
      const mi = MONTH_ORDER.indexOf(month);
      const gm = new Date(nmDate.getTime() + tzMin * 60000).getUTCMonth();
      const gy = new Date(nmDate.getTime() + tzMin * 60000).getUTCFullYear();
      const vs = gy + ((mi >= 10 || (mi === 9 && gm === 0)) ? 56 : 57);
      hindu = { month, vikramSamvat: vs, monthStart: nmDate };
    }
  } catch { /* month line is decorative; never fail the panchang over it */ }

  return {
    date: { y, m, d }, lat, lon, tzMin, ayanamsa: ayVal,
    sunrise, sunset, solarNoon, dayLengthMs,
    weekdayIdx: dayIdx,
    tithi: {
      idx: tithiIdx, number: tithiIdx + 1,
      name: tName, nameHi: tNameHi,
      paksha: eng.tithi.paksha, pakshaHi: eng.tithi.pakshaHi,
      ends: tithiEnd,
    },
    nakshatra: {
      idx: nak.nakshatraIdx, name: nak.nakshatra, nameHi: nak.nakshatraHi,
      pada: nak.pada, lord: nak.lord, ends: nakEnd,
    },
    yoga: { idx: yogaIdx, name: YOGAS[yogaIdx], ends: yogaEnd },
    karana: { idx: halfIdx, name: karanaName(halfIdx) },
    moonSign: Math.floor(moonSid / 30) % 12,
    sunSign: Math.floor(sunSid / 30) % 12,
    kaal: {
      rahu: { ...seg(RAHU_SEG[dayIdx]), seg: RAHU_SEG[dayIdx] },
      yama: { ...seg(YAMA_SEG[dayIdx]), seg: YAMA_SEG[dayIdx] },
      gulika: { ...seg(GULI_SEG[dayIdx]), seg: GULI_SEG[dayIdx] },
    },
    abhijit, brahma,
    hindu,
    _weekdayLocal: weekdayLocal,
  };
}

/** The four limbs at one instant (for the tool's "right now" line). */
export async function limbsAt(date, ayVal) {
  const p = await sunMoon(date);
  const sunSid = tropicalToSidereal(p.sunT, ayVal).sidereal;
  const moonSid = tropicalToSidereal(p.moonT, ayVal).sidereal;
  const el = elong(p.sunT, p.moonT);
  const tithiIdx = Math.floor(el / 12);
  const nak = calculateNakshatra(moonSid);
  return {
    tithiIdx, tithiName: tithiIdx % 15 === 14 ? (tithiIdx === 14 ? 'Purnima' : 'Amavasya')
      : ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami',
        'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'][tithiIdx % 15],
    paksha: el < 180 ? 'Shukla' : 'Krishna',
    nakshatra: nak.nakshatra, pada: nak.pada,
    yoga: YOGAS[Math.floor((((sunSid + moonSid) % 360) / (360 / 27))) % 27],
    karana: karanaName(Math.floor(el / 6)),
  };
}

/** Rashi names are needed by the UI; re-exported so the tool imports one module. */
export { RASHI_NAMES, RASHI_NAMES_HI } from './kundli/constants.js';
