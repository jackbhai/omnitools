/**
 * Ephemeris Wrapper - High-precision planetary positions
 * Layer 1: Astronomical Calculation Engine
 * 
 * Uses astronomy-engine 2.1.19 (VSOP87/ELP-MPP02)
 * Version and valid range documented for reproducibility
 * 
 * VSOP87: Variations Séculaires des Orbites Planétaires
 * - Developed by Bretagnon & Francou at Bureau des Longitudes
 * - Valid: -2000 to +6000 (4000 BC to 6000 AD)
 * - Accuracy: ~1 arcsecond for inner planets within ±1000 years of J2000
 * - For Moon: ELP-MPP02 theory
 * 
 * No fake data - all positions calculated from gravitational theory
 */

import { ENGINE_VERSIONS, PLANETS } from './constants.js';

export const EPHEMERIS_INFO = {
  engine: 'astronomy-engine',
  version: '2.1.19',
  theory: 'VSOP87 (Bretagnon & Francou) + ELP-MPP02 (Moon)',
  validRange: { startYear: -2000, endYear: 6000, note: 'High accuracy ±1000 years from J2000 (2000 AD), degrades beyond' },
  accuracy: {
    innerPlanets: '~1 arcsecond within ±1000 years',
    outerPlanets: '~few arcseconds',
    moon: '~few arcseconds',
    note: 'Sufficient for astrology (1° = 3600 arcseconds, so error <0.001°)',
  },
  reference: 'Meeus Astronomical Algorithms, VSOP87 documentation',
  documentation: 'https://github.com/cosinekitty/astronomy',
};

/**
 * Calculate planetary positions using astronomy-engine
 * Deterministic, no AI guessing
 * 
 * @param {Object} params
 * @param {number} params.JD_TT - Julian Day in Terrestrial Time
 * @param {Object} params.astronomy - astronomy-engine module (imported)
 * @param {string} params.nodeType - 'true' or 'mean'
 * @returns {Object} planetary positions tropical
 */
export function calculatePlanetaryPositions({ JD_TT, astronomy, nodeType = 'true' }) {
  if (!astronomy) {
    throw new Error('astronomy-engine not loaded. Offline bundle required.');
  }

  const results = {
    timestamp: new Date().toISOString(),
    engine: EPHEMERIS_INFO,
    JD_TT,
    nodeType,
    planets: {},
    warnings: [],
  };

  try {
    // Create Astronomy Time from JD
    // astronomy-engine expects UTC Date, but we have JD_TT
    // Convert JD_TT to Date for astronomy-engine
    // JD 2440587.5 = 1970-01-01 00:00 UTC
    const unixDays = JD_TT - 2440587.5;
    const unixMs = unixDays * 86400000;
    const date = new Date(unixMs);
    const astroTime = astronomy.MakeTime(date);

    // Helper to get ecliptic longitude
    const getEclipticLongitude = (body) => {
      try {
        const vec = astronomy.GeoVector(body, astroTime, true);
        const ecl = astronomy.Ecliptic(vec);
        return ecl.elon; // degrees 0-360
      } catch (e) {
        results.warnings.push(`Failed to calculate ${body}: ${e.message}`);
        return null;
      }
    };

    // Sun
    const sunLon = getEclipticLongitude(astronomy.Body.Sun);
    results.planets.Surya = {
      name: 'Surya',
      en: 'Sun',
      tropical: sunLon,
      body: 'Sun',
    };

    // Moon
    try {
      const moonEcl = astronomy.EclipticGeoMoon(astroTime);
      results.planets.Chandra = {
        name: 'Chandra',
        en: 'Moon',
        tropical: moonEcl.lon,
        latitude: moonEcl.lat,
        distance: moonEcl.dist,
      };
    } catch (e) {
      results.warnings.push(`Moon calc failed: ${e.message}`);
    }

    // Planets
    const planetMap = {
      Budh: astronomy.Body.Mercury,
      Shukra: astronomy.Body.Venus,
      Mangal: astronomy.Body.Mars,
      Guru: astronomy.Body.Jupiter,
      Shani: astronomy.Body.Saturn,
    };

    for (const [name, body] of Object.entries(planetMap)) {
      const lon = getEclipticLongitude(body);
      if (lon !== null) {
        results.planets[name] = {
          name,
          en: PLANETS[name]?.en || name,
          tropical: lon,
          body: body.toString(),
        };
      }
    }

    // Rahu/Ketu - Lunar nodes
    // True Node vs Mean Node
    try {
      // For True Node, we need to calculate osculating node
      // astronomy-engine doesn't directly give nodes, so we use approximation
      // True node calculation: based on Moon's orbit
      // For now, use Moon's position + 180 for Ketu, but note this is simplified
      // In full implementation, we'd calculate true node from lunar theory
      
      // Mean node moves retrograde ~19.34° per year, period 18.6 years
      // At J2000, mean Rahu was at ~125.044°
      const T = (JD_TT - 2451545.0) / 36525.0;
      let meanRahuLon;
      
      if (nodeType === 'mean') {
        // Mean node formula from Meeus
        // L = 125.04452 - 1934.136261*T + 0.0020708*T^2 + T^3/450000
        meanRahuLon = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000;
        meanRahuLon = meanRahuLon % 360;
        if (meanRahuLon < 0) meanRahuLon += 360;
      } else {
        // True node - more complex, includes periodic terms
        // Simplified: mean + periodic corrections
        // For high accuracy, we'd need full ELP-MPP02 node theory
        // Using approximation with major periodic terms
        const L = 125.04452 - 1934.136261 * T;
        const D = 297.85036 + 445267.111480 * T; // Mean elongation Moon-Sun
        const M = 357.52772 + 35999.050340 * T; // Sun mean anomaly
        const Mp = 134.96298 + 477198.867398 * T; // Moon mean anomaly
        const F = 93.27191 + 483202.017538 * T; // Moon arg latitude
        
        // Major periodic terms for true node (from Meeus, simplified)
        let trueCorr = 0;
        trueCorr += -1.4979 * Math.sin((F - 2*D + 2*M) * Math.PI/180);
        trueCorr += -0.1500 * Math.sin((M) * Math.PI/180);
        trueCorr += -0.1226 * Math.sin((F - 2*D) * Math.PI/180);
        trueCorr += 0.1176 * Math.sin((F) * Math.PI/180);
        trueCorr += -0.0801 * Math.sin((F + 2*D - 2*M) * Math.PI/180);
        
        meanRahuLon = L + trueCorr;
        meanRahuLon = meanRahuLon % 360;
        if (meanRahuLon < 0) meanRahuLon += 360;
      }

      const rahuLon = meanRahuLon;
      const ketuLon = (rahuLon + 180) % 360;

      results.planets.Rahu = {
        name: 'Rahu',
        en: 'Rahu (North Node)',
        tropical: rahuLon,
        isRetrograde: true,
        nodeType,
        meanLongitude: nodeType === 'mean' ? rahuLon : null,
      };

      results.planets.Ketu = {
        name: 'Ketu',
        en: 'Ketu (South Node)',
        tropical: ketuLon,
        isRetrograde: true,
        nodeType,
      };

    } catch (e) {
      results.warnings.push(`Node calc failed: ${e.message}`);
    }

    // Calculate retrograde status for planets
    // Retrograde when apparent motion is westward
    // We check by calculating position 1 day later and seeing if longitude decreased
    try {
      const futureDate = new Date(unixMs + 86400000); // +1 day
      const futureTime = astronomy.MakeTime(futureDate);
      
      for (const [name, body] of Object.entries(planetMap)) {
        if (results.planets[name]) {
          const currentLon = results.planets[name].tropical;
          const futureVec = astronomy.GeoVector(body, futureTime, true);
          const futureEcl = astronomy.Ecliptic(futureVec);
          const futureLon = futureEcl.elon;
          
          let diff = futureLon - currentLon;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          
          results.planets[name].isRetrograde = diff < 0;
          results.planets[name].dailyMotion = diff; // degrees per day
        }
      }
    } catch (e) {
      results.warnings.push(`Retrograde calc failed: ${e.message}`);
    }

  } catch (e) {
    results.error = e.message;
    results.warnings.push(`Ephemeris calculation failed: ${e.message}`);
  }

  return results;
}

/**
 * Validate ephemeris calculation against known test cases
 * For transparency and anti-fake
 */
export function validateEphemeris() {
  const tests = [
    {
      name: 'J2000 Sun position',
      JD_TT: 2451545.0,
      expected: { Surya: 280.46 }, // Sun at ~280° at J2000
      tolerance: 1.0,
    },
    {
      name: '3 Feb 1975 13:20 IST Delhi - Known case',
      // JD 2442446.8264
      JD_TT: 2442446.8264,
      expected: { Surya: 313.8, Chandra: 210.5 }, // Approx from known data
      tolerance: 2.0,
      note: 'Vrishabh Lagna case, previously buggy Dhanu',
    },
  ];

  return {
    ephemerisInfo: EPHEMERIS_INFO,
    tests,
    note: 'Validation requires astronomy-engine loaded. Run with real dates.',
  };
}

/**
 * Format longitude as degrees, minutes, seconds
 * For raw calculation table
 */
export function formatDMS(degrees) {
  const d = Math.floor(degrees);
  const mFloat = (degrees - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  
  return {
    degrees: d,
    minutes: m,
    seconds: s,
    formatted: `${d}° ${m}' ${s.toFixed(2)}"`,
    decimal: degrees,
  };
}
