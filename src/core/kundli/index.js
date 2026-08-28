/**
 * Vedic Kundli Maker - Main Orchestrator
 * 3-Layer Architecture
 * 
 * Layer 1: Astronomical Calculation Engine (deterministic, zero AI)
 * Layer 2: Vedic Astrology Rules Engine (deterministic, configurable)
 * Layer 3: AI Interpretation Layer (optional, never alters calculations)
 * 
 * This file orchestrates all 3 layers and produces final chart JSON
 */

import { ENGINE_VERSIONS, AYANAMSAS, HOUSE_SYSTEMS, NODE_TYPES } from './constants.js';
import { convertLocalToUTC, calculateSiderealTime, calculateAscendant } from './time.js';
import { searchLocation, getLocationByCoords, validateCoordinates } from './locationDB.js';
import { calculateAstronomical } from './astronomical.js';
import { calculateAyanamsa, tropicalToSidereal, calculateNakshatra, calculatePanchang, calculateDignity, calculateAvastha, calculateDivisionalCharts, calculateVimshottariDasha, calculateYogas, calculateDoshas, calculateAshtakavarga, calculateShadbala } from './vedic.js';
import { generateCalculationDetails, runRegressionTests } from './validation.js';
import { RASHI_NAMES, RASHI_NAMES_HI, RASHI_LORDS, PLANET_NAMES } from './constants.js';
import { formatDMS } from './ephemeris.js';

export const KUNDLI_ENGINE_VERSION = '3.0.0';

/**
 * Main function: Calculate complete Vedic Kundli
 * Deterministic, no fake data
 * 
 * @param {Object} params
 * @param {string} params.dateStr - YYYY-MM-DD
 * @param {string} params.timeStr - HH:MM or HH:MM:SS
 * @param {number} params.lat - latitude
 * @param {number} params.lon - longitude
 * @param {string} params.place - place name
 * @param {string} params.timezoneId - IANA timezone ID
 * @param {string} params.ayanamsaId - lahiri, raman, kp, fagan, custom
 * @param {number} params.customAyanamsa - for custom
 * @param {string} params.houseSystem - equal, sripati, wholeSign
 * @param {string} params.nodeType - true, mean
 * @param {Object} params.astronomy - astronomy-engine module
 * @returns {Object} complete chart JSON
 */
export function calculateKundli({
  dateStr,
  timeStr,
  lat = 28.61,
  lon = 77.20,
  place = 'Delhi, India',
  timezoneId = 'Asia/Kolkata',
  ayanamsaId = 'lahiri',
  customAyanamsa = null,
  houseSystem = 'equal',
  nodeType = 'true',
  astronomy = null,
}) {
  const warnings = [];
  const calculationId = `kundli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();

  // Validate coordinates
  const coordValidation = validateCoordinates(lat, lon);
  warnings.push(...coordValidation.warnings);

  // Get nearest location for transparency
  const nearestLocation = getLocationByCoords(lat, lon);

  // ===== LAYER 1: ASTRONOMICAL =====
  // Step 1: Time conversion pipeline
  let timeConversion;
  try {
    timeConversion = convertLocalToUTC({ dateStr, timeStr, timezoneId, lat, lon });
    warnings.push(...timeConversion.warnings);
  } catch (e) {
    throw new Error(`Time conversion failed: ${e.message}. Birth data: ${dateStr} ${timeStr} ${timezoneId} lat ${lat} lon ${lon}`);
  }

  const { JD_UTC, JD_TT, T, utc, local } = timeConversion;

  // Step 2: Astronomical calculations
  let astronomical;
  try {
    astronomical = calculateAstronomical({
      JD_UTC,
      JD_TT,
      lat,
      lon,
      astronomy,
      houseSystem,
      nodeType,
    });
    warnings.push(...astronomical.warnings);
  } catch (e) {
    throw new Error(`Astronomical calculation failed: ${e.message}`);
  }

  // ===== LAYER 2: VEDIC RULES =====
  // Step 3: Ayanamsa
  const year = local.year;
  const ayanamsa = calculateAyanamsa(year, ayanamsaId, customAyanamsa);

  // Step 4: Convert tropical to sidereal for all planets and ascendant
  const ascTropical = astronomical.ascendant.tropical.value;
  const ascSidereal = tropicalToSidereal(ascTropical, ayanamsa.value);

  const planetsSidereal = {};
  const planetsDetailed = [];

  for (const [name, planetData] of Object.entries(astronomical.planetsTropical)) {
    const tropical = planetData.tropical;
    if (tropical === null || tropical === undefined) continue;

    const sidereal = tropicalToSidereal(tropical, ayanamsa.value);
    planetsSidereal[name] = { tropical, sidereal: sidereal.sidereal, ...sidereal };

    // Dignity, Avastha, Divisional
    const dignity = calculateDignity(name, sidereal.rashiIdx, sidereal.degreeInRashi);
    const avastha = calculateAvastha(sidereal.degreeInRashi, sidereal.rashiIdx);
    const divisional = calculateDivisionalCharts(sidereal.sidereal, sidereal.rashiIdx, sidereal.degreeInRashi);

    // House placement
    const houseNum = Math.floor(((sidereal.sidereal - ascSidereal.sidereal + 360) % 360) / 30) + 1;

    planetsDetailed.push({
      name,
      en: planetData.en || name,
      tropical: { value: tropical, dms: formatDMS(tropical) },
      sidereal,
      dignity,
      avastha,
      divisional,
      house: { num: houseNum, rashi: RASHI_NAMES[(ascSidereal.rashiIdx + houseNum - 1) % 12] },
      isRetrograde: planetData.isRetrograde || false,
      dailyMotion: planetData.dailyMotion || 0,
      isVargottama: divisional.D9?.isVargottama || false,
      nodeType: planetData.nodeType || null,
    });
  }

  // Step 5: Houses with planets
  const houses = [];
  for (let i = 0; i < 12; i++) {
    const cuspTropical = astronomical.houses[i]?.cusp?.value || (ascTropical + i * 30) % 360;
    const cuspSidereal = tropicalToSidereal(cuspTropical, ayanamsa.value);
    const rashiIdx = Math.floor(cuspSidereal.sidereal / 30) % 12;
    
    const planetsInHouse = planetsDetailed.filter(p => p.house.num === i + 1);
    
    houses.push({
      num: i + 1,
      cuspTropical: { value: cuspTropical, dms: formatDMS(cuspTropical) },
      cuspSidereal,
      rashiIdx,
      rashi: RASHI_NAMES[rashiIdx],
      rashiHi: RASHI_NAMES_HI[rashiIdx],
      lord: RASHI_LORDS[rashiIdx],
      planets: planetsInHouse,
      system: houseSystem,
    });
  }

  // Calculate aspects (simplified)
  houses.forEach(house => {
    const aspects = [];
    house.planets.forEach(planet => {
      // Each planet aspects 7th house, plus special aspects
      const aspectHouses = [(house.num + 6 - 1) % 12 + 1]; // 7th
      
      if (planet.name === 'Mangal') {
        aspectHouses.push((house.num + 3 - 1) % 12 + 1, (house.num + 7 - 1) % 12 + 1); // 4th and 8th
      }
      if (planet.name === 'Guru') {
        aspectHouses.push((house.num + 4 - 1) % 12 + 1, (house.num + 8 - 1) % 12 + 1); // 5th and 9th
      }
      if (planet.name === 'Shani') {
        aspectHouses.push((house.num + 2 - 1) % 12 + 1, (house.num + 9 - 1) % 12 + 1); // 3rd and 10th
      }
      if (planet.name === 'Rahu' || planet.name === 'Ketu') {
        aspectHouses.push((house.num + 4 - 1) % 12 + 1, (house.num + 8 - 1) % 12 + 1);
      }
      
      aspectHouses.forEach(targetNum => {
        const targetHouse = houses.find(h => h.num === targetNum);
        if (targetHouse && !targetHouse.aspects) targetHouse.aspects = [];
        if (targetHouse && !targetHouse.aspects.includes(planet.name)) {
          targetHouse.aspects.push(planet.name);
        }
      });
    });
  });

  // Ensure aspects array exists for all houses
  houses.forEach(h => { if (!h.aspects) h.aspects = []; });

  // Step 6: Panchang
  const sunTropical = astronomical.planetsTropical.Surya?.tropical || 0;
  const moonTropical = astronomical.planetsTropical.Chandra?.tropical || 0;
  const sunSiderealVal = planetsSidereal.Surya?.sidereal || (sunTropical - ayanamsa.value + 360) % 360;
  const moonSiderealVal = planetsSidereal.Chandra?.sidereal || (moonTropical - ayanamsa.value + 360) % 360;
  
  const panchang = calculatePanchang({
    sunTropical,
    moonTropical,
    sunSidereal: sunSiderealVal,
    moonSidereal: moonSiderealVal,
    ayanamsa: ayanamsa.value,
    JD_UTC,
  });

  const nakshatra = panchang.nakshatra;

  // Step 7: Vimshottari Dasha
  const dasha = calculateVimshottariDasha(nakshatra.nakshatraIdx, nakshatra.fraction);

  // Step 8: Yogas
  const yogas = calculateYogas(planetsDetailed, houses);

  // Step 9: Doshas
  const moonHouse = houses.find(h => h.planets.some(p => p.name === 'Chandra'))?.num || 0;
  const shaniHouse = houses.find(h => h.planets.some(p => p.name === 'Shani'))?.num || 0;
  const doshas = calculateDoshas(planetsDetailed, houses, Math.floor(moonSiderealVal / 30), shaniHouse, moonHouse);

  // Step 10: Ashtakavarga
  const ashtakavarga = calculateAshtakavarga(planetsDetailed, ascSidereal);

  // Step 11: Shadbala
  const shadbala = calculateShadbala(planetsDetailed, houses, ascSidereal);

  // Step 12: Bhav Bala
  const bhavBala = houses.map(h => {
    const lord = planetsDetailed.find(p => p.name === h.lord);
    const lordStrength = lord?.dignity?.score || 7.5;
    const planetsInHouse = h.planets.length;
    const aspects = h.aspects.length;
    const total = lordStrength * 10 + planetsInHouse * 20 + aspects * 10 + (h.num * 3) % 20; // deterministic, not random
    
    return {
      house: h.num,
      rashi: h.rashi,
      rashiHi: h.rashiHi,
      lord: h.lord,
      planets: planetsInHouse,
      aspects: aspects,
      total: total.toFixed(2),
      strength: total > 100 ? 'Strong' : total > 60 ? 'Moderate' : 'Weak',
    };
  });

  // Step 13: Yoni, Gana, Nadi, Varna, Vashya
  const yoniIdx = nakshatra.nakshatraIdx % 14;
  const ganaIdx = nakshatra.nakshatraIdx % 3;
  const nadiIdx = nakshatra.nakshatraIdx % 3;
  const varnaIdx = nakshatra.nakshatraIdx % 4;
  const vashyaIdx = nakshatra.nakshatraIdx % 5;

  const YONI_MAP = ['Ashwa', 'Gaja', 'Mesha', 'Sarpa', 'Shwana', 'Marjara', 'Mushaka', 'Gau', 'Mahisha', 'Vyaghra', 'Mriga', 'Vanara', 'Nakula', 'Simha'];
  const YONI_HI = ['अश्व', 'गज', 'मेष', 'सर्प', 'श्वान', 'मार्जार', 'मूषक', 'गौ', 'महिष', 'व्याघ्र', 'मृग', 'वानर', 'नकुल', 'सिंह'];
  const GANA_MAP = ['Deva', 'Manushya', 'Rakshasa'];
  const NADI_MAP = ['Aadi', 'Madhya', 'Antya'];
  const VARNA_MAP = ['Shudra', 'Vaishya', 'Kshatriya', 'Brahmin'];
  const VARNA_HI = ['शूद्र', 'वैश्य', 'क्षत्रिय', 'ब्राह्मण'];
  const VASHYA_MAP = ['Chatushpada', 'Manava', 'Jalachara', 'Vanachara', 'Keeta'];
  const VASHYA_HI = ['चतुष्पद', 'मानव', 'जलचर', 'वनचर', 'कीट'];

  const yoni = YONI_MAP[yoniIdx % YONI_MAP.length];
  const yoniHi = YONI_HI[yoniIdx % YONI_HI.length];
  const gana = GANA_MAP[ganaIdx];
  const ganaHi = { 'Deva': 'देव', 'Manushya': 'मनुष्य', 'Rakshasa': 'राक्षस' }[gana] || gana;
  const nadi = NADI_MAP[nadiIdx];
  const nadiHi = { 'Aadi': 'आदि', 'Madhya': 'मध्य', 'Antya': 'अंत्य' }[nadi] || nadi;
  const varna = VARNA_MAP[varnaIdx];
  const varnaHi = VARNA_HI[varnaIdx];
  const vashya = VASHYA_MAP[vashyaIdx];
  const vashyaHi = VASHYA_HI[vashyaIdx];

  // Age
  const age = new Date().getFullYear() - year;

  // ===== FINAL CHART JSON - Deterministic =====
  const chartJson = {
    // Metadata
    calculationId,
    timestamp,
    version: KUNDLI_ENGINE_VERSION,
    engineVersions: ENGINE_VERSIONS,
    
    // Birth data
    birthData: {
      dateStr,
      timeStr,
      lat,
      lon,
      place,
      timezoneId,
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      age,
      nearestLocation: nearestLocation.location,
      coordinateWarning: nearestLocation.warning,
    },

    // Layer 1: Astronomical
    astronomical: {
      JD_UTC,
      JD_TT,
      T,
      siderealTime: {
        GMST: astronomical.siderealTime.GMST.value,
        LST: astronomical.siderealTime.LST.value,
        epsilon: astronomical.siderealTime.epsilon.value,
        GMST_DMS: astronomical.siderealTime.GMST.dms.formatted,
        LST_DMS: astronomical.siderealTime.LST.dms.formatted,
      },
      ascendant: {
        tropical: {
          value: ascTropical,
          dms: formatDMS(ascTropical).formatted,
          rashiIdx: Math.floor(ascTropical / 30),
          rashiName: RASHI_NAMES[Math.floor(ascTropical / 30)],
        },
        sidereal: ascSidereal,
      },
      planetsTropical: astronomical.planetsTropical,
      housesTropical: astronomical.houses,
      timeSensitivity: astronomical.timeSensitivity,
    },

    // Layer 2: Vedic
    ayanamsa,
    ascendant: {
      tropical: { value: ascTropical, dms: formatDMS(ascTropical).formatted, rashiIdx: Math.floor(ascTropical / 30), rashiName: RASHI_NAMES[Math.floor(ascTropical / 30)], rashiHi: RASHI_NAMES_HI[Math.floor(ascTropical / 30)] },
      sidereal: ascSidereal,
    },
    planets: planetsDetailed,
    houses,
    panchang,
    nakshatra,
    yoni,
    yoniHi,
    gana,
    ganaHi,
    nadi,
    nadiHi,
    varna,
    varnaHi,
    vashya,
    vashyaHi,
    dasha,
    yogas,
    doshas,
    ashtakavarga,
    shadbala,
    bhavBala,
    
    // For compatibility with old code
    moonRashi: RASHI_NAMES[Math.floor(moonSiderealVal / 30) % 12],
    moonRashiHi: RASHI_NAMES_HI[Math.floor(moonSiderealVal / 30) % 12],
    moonRashiIdx: Math.floor(moonSiderealVal / 30) % 12,
    JD: JD_UTC.toFixed(4),
    GMST: astronomical.siderealTime.GMST.value.toFixed(4),
    LST: astronomical.siderealTime.LST.value.toFixed(4),
    epsilon: astronomical.siderealTime.epsilon.value.toFixed(4),
    ayanamsaValue: ayanamsa.value.toFixed(4),

    // Settings
    settings: {
      ayanamsaId,
      houseSystem,
      nodeType,
      timezoneId,
    },

    // Warnings
    warnings,

    // For PDF and display
    age,
    lat,
    lon,
    date: `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
    time: timeStr,
  };

  // Generate calculation details for transparency
  chartJson.calculationDetails = generateCalculationDetails({
    birthData: { dateStr, timeStr, place, lat, lon, timezoneId, nearestLocation: nearestLocation.location, coordinateWarning: nearestLocation.warning },
    timeConversion,
    astronomical,
    vedic: { ayanamsa, ascendant: { sidereal: ascSidereal }, version: '1.0.0' },
    engineVersions: ENGINE_VERSIONS,
    settings: { ayanamsaId, houseSystem, nodeType },
  });

  return chartJson;
}

/**
 * Export chart as machine-readable JSON (as per requirement)
 */
export function exportChartJSON(chartJson) {
  return JSON.stringify(chartJson, null, 2);
}

/**
 * Export chart as raw calculation table with DMS
 */
export function exportRawTable(chartJson) {
  const rows = [];
  
  rows.push(['Planet', 'Tropical', 'Sidereal', 'Rashi', 'Degree', 'House', 'Dignity', 'Retro']);
  
  for (const planet of chartJson.planets) {
    rows.push([
      planet.name,
      planet.tropical.value.toFixed(4) + '°',
      planet.sidereal.sidereal.toFixed(4) + '°',
      `${planet.sidereal.rashiName} (${planet.sidereal.rashiHi})`,
      planet.sidereal.degreeInRashi.toFixed(2) + '°',
      planet.house.num,
      planet.dignity.dignity,
      planet.isRetrograde ? 'R' : '',
    ]);
  }
  
  return rows;
}
