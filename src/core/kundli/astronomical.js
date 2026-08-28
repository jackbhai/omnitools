/**
 * Astronomical Calculation Engine - Layer 1
 * Deterministic, zero AI guessing
 * 
 * This is the foundation - all planetary positions calculated here
 * No Vedic rules, no interpretations - pure astronomy
 * 
 * Responsibilities:
 * - Planetary positions (tropical)
 * - Ascendant calculation (accurate to seconds)
 * - House cusps (with selectable house system)
 * - Sidereal time, obliquity
 * - Time conversion already done in time.js
 */

import { ENGINE_VERSIONS, RASHI_NAMES, RASHI_NAMES_HI } from './constants.js';
import { calculateSiderealTime, calculateAscendant, calculateTimeSensitivity } from './time.js';
import { calculatePlanetaryPositions, formatDMS } from './ephemeris.js';

export const ASTRONOMICAL_ENGINE_VERSION = '1.0.0';

/**
 * Main astronomical calculation
 * Input: already converted UTC and JD from time.js
 * Output: pure astronomical data, no Vedic yet
 * 
 * @param {Object} params
 * @param {number} params.JD_UTC - Julian Day UTC
 * @param {number} params.JD_TT - Julian Day TT
 * @param {number} params.lat - latitude
 * @param {number} params.lon - longitude
 * @param {Object} params.astronomy - astronomy-engine module
 * @param {string} params.houseSystem - 'equal', 'sripati', 'wholeSign'
 * @param {string} params.nodeType - 'true' or 'mean'
 * @returns {Object} astronomical data
 */
export function calculateAstronomical({ JD_UTC, JD_TT, lat, lon, astronomy, houseSystem = 'equal', nodeType = 'true' }) {
  const warnings = [];
  const calculationId = `astro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 1. Sidereal time
  const sidereal = calculateSiderealTime(JD_TT, lon);
  const { GMST, LST, epsilon, T } = sidereal;
  
  // 2. Ascendant - accurate to seconds
  const ascTropical = calculateAscendant(LST, lat, epsilon);
  const ascTropicalDMS = formatDMS(ascTropical);
  
  // 3. Planetary positions
  const planetary = calculatePlanetaryPositions({ JD_TT, astronomy, nodeType });
  
  // 4. House cusps - deterministic based on house system
  const houses = calculateHouseCusps({ ascTropical, lat, lon, LST, epsilon, houseSystem });
  
  // 5. Time sensitivity
  const sensitivity = calculateTimeSensitivity(lat, LST);
  
  // 6. Validation of astronomical data
  if (isNaN(ascTropical) || ascTropical < 0 || ascTropical >= 360) {
    warnings.push(`Invalid ascendant calculation: ${ascTropical}. Lat ${lat}, LST ${LST}, epsilon ${epsilon}`);
  }
  
  if (Math.abs(lat) > 66.5) {
    warnings.push(`High latitude ${lat}°: ascendant ${ascTropical.toFixed(2)}° may be unreliable for some house systems. Using ${houseSystem} which works at all latitudes.`);
  }
  
  // Check planetary data
  const requiredPlanets = ['Surya', 'Chandra', 'Mangal', 'Budh', 'Guru', 'Shukra', 'Shani', 'Rahu', 'Ketu'];
  for (const p of requiredPlanets) {
    if (!planetary.planets[p]) {
      warnings.push(`Missing planet ${p} - ephemeris calculation failed`);
    }
  }
  
  return {
    calculationId,
    engine: 'astronomical',
    version: ASTRONOMICAL_ENGINE_VERSION,
    ephemerisVersion: ENGINE_VERSIONS.ephemerisVersion,
    timestamp: new Date().toISOString(),
    
    // Input
    input: { JD_UTC, JD_TT, lat, lon, houseSystem, nodeType },
    
    // Sidereal time
    siderealTime: {
      GMST: { value: GMST, dms: formatDMS(GMST), description: 'Greenwich Mean Sidereal Time' },
      LST: { value: LST, dms: formatDMS(LST), description: 'Local Sidereal Time = RAMC' },
      epsilon: { value: epsilon, dms: formatDMS(epsilon), description: 'Obliquity of ecliptic' },
      T: { value: T, description: 'Julian centuries from J2000' },
    },
    
    // Ascendant
    ascendant: {
      tropical: { value: ascTropical, dms: ascTropicalDMS, rashi: Math.floor(ascTropical / 30), rashiName: RASHI_NAMES[Math.floor(ascTropical / 30)], rashiHi: RASHI_NAMES_HI[Math.floor(ascTropical / 30)] },
      description: 'Ascendant calculated as atan2(cos RAMC, -(sin RAMC cos eps + tan phi sin eps))',
      formula: 'asc = atan2(cos RAMC, -(sin RAMC cos eps + tan phi sin eps))',
    },
    
    // Houses
    houses,
    
    // Planets - tropical
    planetsTropical: planetary.planets,
    
    // Sensitivity
    timeSensitivity: sensitivity,
    
    // Warnings
    warnings: [...warnings, ...(planetary.warnings || [])],
    
    // For reproducibility
    reproducibility: {
      engineVersion: ENGINE_VERSIONS.calculationEngineVersion,
      astronomicalEngineVersion: ASTRONOMICAL_ENGINE_VERSION,
      ephemerisVersion: ENGINE_VERSIONS.ephemerisVersion,
      ephemerisValidRange: ENGINE_VERSIONS.ephemerisValidRange,
      calculationTimestamp: new Date().toISOString(),
      calculationId,
    },
  };
}

function calculateHouseCusps({ ascTropical, lat, lon, LST, epsilon, houseSystem }) {
  const houses = [];
  
  if (houseSystem === 'equal') {
    // Equal house: each house 30° from ascendant
    for (let i = 0; i < 12; i++) {
      const cusp = (ascTropical + i * 30) % 360;
      houses.push({
        num: i + 1,
        cusp: { value: cusp, dms: formatDMS(cusp), rashi: Math.floor(cusp / 30), rashiName: RASHI_NAMES[Math.floor(cusp / 30) % 12] },
        system: 'equal',
        description: `House ${i+1} = Asc + ${i*30}°`,
      });
    }
  } else if (houseSystem === 'wholeSign') {
    // Whole sign: house 1 = full rashi of ascendant
    const ascRashi = Math.floor(ascTropical / 30);
    for (let i = 0; i < 12; i++) {
      const rashiIdx = (ascRashi + i) % 12;
      const cusp = rashiIdx * 30;
      houses.push({
        num: i + 1,
        cusp: { value: cusp, dms: formatDMS(cusp), rashi: rashiIdx, rashiName: RASHI_NAMES[rashiIdx] },
        system: 'wholeSign',
        description: `House ${i+1} = Rashi ${RASHI_NAMES[rashiIdx]} (30°)`,
      });
    }
  } else if (houseSystem === 'sripati') {
    // Sripati/Porphyry: division based on ascendant and MC
    // Simplified: similar to equal but with quadrant division
    // For true Sripati, need MC calculation
    // MC = RAMC + 90° projected onto ecliptic
    const MC = calculateMC(LST, epsilon);
    
    for (let i = 0; i < 12; i++) {
      // Sripati: houses 1,4,7,10 are angular, others trisected
      // Simplified implementation: equal for now, with note
      const cusp = (ascTropical + i * 30) % 360;
      houses.push({
        num: i + 1,
        cusp: { value: cusp, dms: formatDMS(cusp), rashi: Math.floor(cusp / 30), rashiName: RASHI_NAMES[Math.floor(cusp / 30) % 12] },
        system: 'sripati (simplified equal)',
        description: `House ${i+1} - Sripati simplified, true Sripati requires MC ${MC.toFixed(2)}°`,
        note: i === 0 || i === 3 || i === 6 || i === 9 ? 'Angular house' : 'Trisected',
      });
    }
  }
  
  return houses;
}

function calculateMC(LST, epsilon) {
  // Medium Coeli - intersection of ecliptic and meridian
  // MC = atan2(tan LST, cos epsilon)
  const lstRad = LST * Math.PI / 180;
  const epsRad = epsilon * Math.PI / 180;
  
  let mcRad = Math.atan2(Math.tan(lstRad), Math.cos(epsRad));
  let mcDeg = mcRad * 180 / Math.PI;
  mcDeg = mcDeg % 360;
  if (mcDeg < 0) mcDeg += 360;
  
  return mcDeg;
}

/**
 * Cross-validate astronomical calculations
 * Compare with second method for same JD
 */
export function crossValidateAstronomical(astroData, secondCalc) {
  const mismatches = [];
  
  // Compare ascendant if second calc provided
  if (secondCalc && secondCalc.ascendant) {
    const diff = Math.abs(astroData.ascendant.tropical.value - secondCalc.ascendant.tropical.value);
    const adjustedDiff = Math.min(diff, 360 - diff);
    if (adjustedDiff > 0.5) {
      mismatches.push({
        field: 'ascendant',
        value1: astroData.ascendant.tropical.value,
        value2: secondCalc.ascendant.tropical.value,
        diff: adjustedDiff,
        tolerance: 0.5,
        status: 'FAIL',
      });
    }
  }
  
  return {
    validated: mismatches.length === 0,
    mismatches,
    note: 'Cross-validation requires second independent implementation',
  };
}
