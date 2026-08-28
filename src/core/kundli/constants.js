/**
 * Vedic Kundli - Constants & Configuration
 * Layer: Shared constants for all 3 layers
 * 
 * ENGINE VERSIONS - for reproducibility (as per Anti-Fake rules)
 */
export const ENGINE_VERSIONS = {
  astronomicalEngine: 'astronomy-engine@2.1.19 VSOP87/ELP-MPP02',
  ephemerisVersion: 'VSOP87 (Bretagnon & Francou) valid -2000 to +6000, ELP-MPP02 for Moon',
  ephemerisValidRange: { start: -2000, end: 6000, note: 'High accuracy ±1000 years from J2000, degrades beyond' },
  timezoneDatabase: 'IANA tzdata 2024b + custom historical India rules',
  timezoneDbVersion: '2024b',
  locationDatabase: 'GeoNames + India detailed 5000+ localities v1.0',
  locationDbVersion: '1.0.0',
  vedicRulesVersion: 'BPHS + Saravali + Phaladeepika v1.0',
  calculationEngineVersion: 'Kundli-Engine v3.0.0 3-layer architecture',
  buildTimestamp: new Date().toISOString(),
};

// Ayanamsa definitions - Multiple selectable as per requirement
export const AYANAMSAS = {
  lahiri: {
    id: 'lahiri',
    name: 'Lahiri / Chitrapaksha',
    nameHi: 'लाहिरी / चित्रपक्ष',
    default: true,
    description: 'Official Indian government ayanamsa, most widely used',
    // Lahiri ayanamsa at J2000: 23°51' approx, rate ~50.27"/year
    // Formula: ayanamsa = 23.856 + 0.013969*(year-2000) + corrections
    baseJ2000: 23.856, // degrees at 2000-01-01
    ratePerYear: 0.013969, // degrees per year (50.29 arcsec)
    // More precise calculation uses Newcomb precession
  },
  raman: {
    id: 'raman',
    name: 'B.V. Raman',
    nameHi: 'रमन',
    baseJ2000: 22.47,
    ratePerYear: 0.013969,
    description: 'B.V. Raman ayanamsa, ~1.4° less than Lahiri',
  },
  kp: {
    id: 'kp',
    name: 'Krishnamurti Paddhati (KP)',
    nameHi: 'केपी',
    baseJ2000: 23.73,
    ratePerYear: 0.013969,
    description: 'KP system ayanamsa',
  },
  fagan: {
    id: 'fagan',
    name: 'Fagan-Bradley (Western Sidereal)',
    nameHi: 'फगन-ब्रैडली',
    baseJ2000: 24.84,
    ratePerYear: 0.013969,
    description: 'Western sidereal astrology',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    nameHi: 'कस्टम',
    baseJ2000: 23.856,
    ratePerYear: 0.013969,
    description: 'User-defined ayanamsa',
  },
};

// Planet definitions
export const PLANETS = {
  Surya: { id: 'Surya', en: 'Sun', sanskrit: 'सूर्य', type: 'luminary', exaltation: { rashi: 0, degree: 10 }, debilitation: { rashi: 6, degree: 10 }, own: [4], moola: { rashi: 4, start: 0, end: 20 }, naisargikaBala: 60 },
  Chandra: { id: 'Chandra', en: 'Moon', sanskrit: 'चन्द्र', type: 'luminary', exaltation: { rashi: 1, degree: 3 }, debilitation: { rashi: 7, degree: 3 }, own: [3], moola: { rashi: 1, start: 3, end: 30 }, naisargikaBala: 51.4286 },
  Mangal: { id: 'Mangal', en: 'Mars', sanskrit: 'मंगल', type: 'planet', exaltation: { rashi: 9, degree: 28 }, debilitation: { rashi: 3, degree: 28 }, own: [0, 7], moola: { rashi: 0, start: 0, end: 12 }, naisargikaBala: 17.1429 },
  Budh: { id: 'Budh', en: 'Mercury', sanskrit: 'बुध', type: 'planet', exaltation: { rashi: 5, degree: 15 }, debilitation: { rashi: 11, degree: 15 }, own: [2, 5], moola: { rashi: 5, start: 15, end: 20 }, naisargikaBala: 25.7143 },
  Guru: { id: 'Guru', en: 'Jupiter', sanskrit: 'गुरु', type: 'planet', exaltation: { rashi: 3, degree: 5 }, debilitation: { rashi: 9, degree: 5 }, own: [8, 11], moola: { rashi: 8, start: 0, end: 10 }, naisargikaBala: 34.2857 },
  Shukra: { id: 'Shukra', en: 'Venus', sanskrit: 'शुक्र', type: 'planet', exaltation: { rashi: 11, degree: 27 }, debilitation: { rashi: 5, degree: 27 }, own: [1, 6], moola: { rashi: 6, start: 0, end: 15 }, naisargikaBala: 42.8571 },
  Shani: { id: 'Shani', en: 'Saturn', sanskrit: 'शनि', type: 'planet', exaltation: { rashi: 6, degree: 20 }, debilitation: { rashi: 0, degree: 20 }, own: [9, 10], moola: { rashi: 10, start: 0, end: 20 }, naisargikaBala: 8.5714 },
  Rahu: { id: 'Rahu', en: 'Rahu (North Node)', sanskrit: 'राहु', type: 'node', exaltation: { rashi: 1, degree: 0 }, debilitation: { rashi: 7, degree: 0 }, own: [], naisargikaBala: 0 },
  Ketu: { id: 'Ketu', en: 'Ketu (South Node)', sanskrit: 'केतु', type: 'node', exaltation: { rashi: 7, degree: 0 }, debilitation: { rashi: 1, degree: 0 }, own: [], naisargikaBala: 0 },
};

export const PLANET_NAMES = Object.keys(PLANETS);

// Rashi
export const RASHI_NAMES = ['Mesh', 'Vrishabh', 'Mithun', 'Kark', 'Singh', 'Kanya', 'Tula', 'Vrishchik', 'Dhanu', 'Makar', 'Kumbh', 'Meen'];
export const RASHI_NAMES_HI = ['मेष', 'वृषभ', 'मिथुन', 'कर्क', 'सिंह', 'कन्या', 'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुंभ', 'मीन'];
export const RASHI_LORDS = ['Mangal', 'Shukra', 'Budh', 'Chandra', 'Surya', 'Budh', 'Shukra', 'Mangal', 'Guru', 'Shani', 'Shani', 'Guru'];

// Nakshatra
export const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
export const NAKSHATRAS_HI = ['अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा', 'पुनर्वसु', 'पुष्य', 'अश्लेषा', 'मघा', 'पूर्वा फाल्गुनी', 'उत्तरा फाल्गुनी', 'हस्त', 'चित्रा', 'स्वाति', 'विशाखा', 'अनुराधा', 'ज्येष्ठा', 'मूल', 'पूर्वाषाढ़ा', 'उत्तराषाढ़ा', 'श्रवण', 'धनिष्ठा', 'शतभिषा', 'पूर्व भाद्रपद', 'उत्तर भाद्रपद', 'रेवती'];

// Tithi, Yoga, Karana etc
export const TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima/Amavasya'];
export const TITHIS_HI = ['प्रतिपदा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पंचमी', 'षष्ठी', 'सप्तमी', 'अष्टमी', 'नवमी', 'दशमी', 'एकादशी', 'द्वादशी', 'त्रयोदशी', 'चतुर्दशी', 'पूर्णिमा/अमावस्या'];
export const YOGAS = ['Vishkumbha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarman', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyan', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
export const KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti', 'Shakuni', 'Chatushpada', 'Naga', 'Kimstughna'];
export const VARA_NAMES = ['Ravivar', 'Somvar', 'Mangalvar', 'Budhvar', 'Guruvar', 'Shukravar', 'Shanivar'];
export const VARA_NAMES_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

// Dasha lords
export const DASHA_LORDS = [
  { lord: 'Ketu', years: 7 },
  { lord: 'Shukra', years: 20 },
  { lord: 'Surya', years: 6 },
  { lord: 'Chandra', years: 10 },
  { lord: 'Mangal', years: 7 },
  { lord: 'Rahu', years: 18 },
  { lord: 'Guru', years: 16 },
  { lord: 'Shani', years: 19 },
  { lord: 'Budh', years: 17 },
];

// Yoni, Gana, Nadi
export const YONI_MAP = ['Ashwa', 'Gaja', 'Mesha', 'Sarpa', 'Shwana', 'Marjara', 'Mushaka', 'Gau', 'Mahisha', 'Vyaghra', 'Mriga', 'Vanara', 'Nakula', 'Simha'];
export const YONI_HI = ['अश्व', 'गज', 'मेष', 'सर्प', 'श्वान', 'मार्जार', 'मूषक', 'गौ', 'महिष', 'व्याघ्र', 'मृग', 'वानर', 'नकुल', 'सिंह'];
export const GANA_MAP = ['Deva', 'Manushya', 'Rakshasa'];
export const NADI_MAP = ['Aadi', 'Madhya', 'Antya'];

// House systems
export const HOUSE_SYSTEMS = {
  equal: { id: 'equal', name: 'Equal House (30° each from Lagna)', default: true },
  sripati: { id: 'sripati', name: 'Sripati / Porphyry', description: 'Bhava madhya = planet longitude' },
  wholeSign: { id: 'wholeSign', name: 'Whole Sign', description: 'Each house = full rashi' },
};

// Node types
export const NODE_TYPES = {
  true: { id: 'true', name: 'True Node (True Rahu/Ketu)', default: true, description: 'True osculating node, more accurate' },
  mean: { id: 'mean', name: 'Mean Node (Mean Rahu/Ketu)', description: 'Mean node, smoothed' },
};

// Tolerances for validation
export const VALIDATION_TOLERANCES = {
  planetaryLongitude: 0.1, // degrees - 6 arcminutes tolerance vs reference
  ascendantLongitude: 0.5, // degrees - 30 arcminutes, ascendant sensitive to time
  nakshatra: 0, // exact match required (0-26)
  pada: 0, // exact match required (1-4)
  divisionalRashi: 0, // exact match required
  dashaBalanceDays: 2, // days tolerance for dasha balance
  dashaDateDays: 5, // days tolerance for dasha dates
};

// Test cases for regression (as per requirement)
export const REGRESSION_TEST_CASES = [
  { id: 'midnight', name: 'Birth near midnight', date: '1990-01-01', time: '23:59', lat: 28.61, lon: 77.2, desc: 'Tests day rollover' },
  { id: 'midnight2', name: 'Birth just after midnight', date: '1990-01-02', time: '00:01', lat: 28.61, lon: 77.2, desc: 'Tests day start' },
  { id: 'dst_usa', name: 'DST transition USA', date: '2023-03-12', time: '02:30', lat: 40.7128, lon: -74.006, tz: 'America/New_York', desc: 'Non-existent time during spring forward' },
  { id: 'dst_eu', name: 'DST transition Europe', date: '2023-10-29', time: '02:30', lat: 51.5074, lon: -0.1278, tz: 'Europe/London', desc: 'Ambiguous time during fall back' },
  { id: 'historical_india', name: 'Historical India pre-IST', date: '1945-06-15', time: '12:00', lat: 28.61, lon: 77.2, desc: 'Before IST standardization 1947' },
  { id: 'timezone_border', name: 'Near timezone border', date: '1990-06-15', time: '12:00', lat: 28.0, lon: 76.0, desc: 'Near border, check correct tz' },
  { id: 'leap_year', name: 'Leap year Feb 29', date: '2020-02-29', time: '12:00', lat: 28.61, lon: 77.2, desc: 'Leap day' },
  { id: 'high_lat', name: 'Very high latitude', date: '1990-06-21', time: '12:00', lat: 70.0, lon: 25.0, desc: 'Arctic circle, extreme ascendant' },
  { id: 'low_lat', name: 'Equator', date: '1990-06-21', time: '12:00', lat: 0.0, lon: 77.2, desc: 'Equatorial' },
  { id: 'sign_boundary', name: 'Close to sign boundary', date: '1975-02-03', time: '13:20', lat: 28.61, lon: 77.2, desc: 'Known case, Vrishabh Lagna 48.44° close to Mithun' },
  { id: 'nakshatra_boundary', name: 'Nakshatra pada boundary', date: '1990-01-15', time: '14:22', lat: 28.61, lon: 77.2, desc: 'Moon at 13°20\' boundary' },
  { id: 'divisional_boundary', name: 'Divisional chart boundary', date: '1990-06-15', time: '12:00', lat: 28.61, lon: 77.2, desc: 'Planet at 0.5° for D60' },
  { id: 'karol_bagh', name: 'Karol Bagh exact vs Delhi generic', date: '1975-02-03', time: '13:20', lat: 28.65, lon: 77.19, desc: 'Exact locality vs city center, ~0.5° LST diff' },
];
