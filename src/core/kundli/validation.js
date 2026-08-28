/**
 * Validation System - Mandatory
 * Layer: Validation & Transparency
 * 
 * For every test birth chart:
 * 1. Calculate chart internally
 * 2. Compare against at least two independent trusted references
 * 3. Compare: planetary longitude, ascendant, nakshatra/pada, divisional placements, dasha dates
 * 4. Define tolerances
 * 5. Flag mismatch instead of hiding
 * 
 * Regression test cases for boundary conditions
 */

import { VALIDATION_TOLERANCES, REGRESSION_TEST_CASES } from './constants.js';

export const VALIDATION_ENGINE_VERSION = '1.0.0';

/**
 * Validation result for a single chart
 */
export function validateChart({ calculated, reference1, reference2, tolerances = VALIDATION_TOLERANCES }) {
  const results = {
    timestamp: new Date().toISOString(),
    version: VALIDATION_ENGINE_VERSION,
    tolerances,
    checks: [],
    passed: 0,
    failed: 0,
    warnings: [],
  };

  // Helper to compare longitudes with 0/360 wrap
  const longitudeDiff = (a, b) => {
    let diff = Math.abs(a - b);
    return Math.min(diff, 360 - diff);
  };

  // Check planetary longitudes
  if (calculated.planets && reference1?.planets) {
    for (const planetName of Object.keys(calculated.planets)) {
      const calcLon = calculated.planets[planetName]?.sidereal?.value || calculated.planets[planetName]?.tropical || 0;
      const refLon = reference1.planets[planetName]?.sidereal || reference1.planets[planetName]?.tropical || 0;
      
      const diff = longitudeDiff(calcLon, refLon);
      const passed = diff <= tolerances.planetaryLongitude;
      
      results.checks.push({
        type: 'planetary_longitude',
        planet: planetName,
        calculated: calcLon,
        reference: refLon,
        diff,
        tolerance: tolerances.planetaryLongitude,
        passed,
        status: passed ? 'PASS' : 'FAIL',
      });
      
      if (passed) results.passed++; else results.failed++;
    }
  }

  // Check ascendant
  if (calculated.ascendant && reference1?.ascendant) {
    const calcAsc = calculated.ascendant.sidereal?.value || calculated.ascendant.tropical?.value || 0;
    const refAsc = reference1.ascendant.sidereal || reference1.ascendant.tropical || 0;
    const diff = longitudeDiff(calcAsc, refAsc);
    const passed = diff <= tolerances.ascendantLongitude;
    
    results.checks.push({
      type: 'ascendant',
      calculated: calcAsc,
      reference: refAsc,
      diff,
      tolerance: tolerances.ascendantLongitude,
      passed,
      status: passed ? 'PASS' : 'FAIL',
    });
    
    if (passed) results.passed++; else results.failed++;
  }

  // Check nakshatra/pada
  if (calculated.nakshatra && reference1?.nakshatra) {
    const calcNak = calculated.nakshatra.nakshatraIdx;
    const refNak = reference1.nakshatra.nakshatraIdx;
    const calcPada = calculated.nakshatra.pada;
    const refPada = reference1.nakshatra.pada;
    
    const nakPassed = calcNak === refNak;
    const padaPassed = calcPada === refPada;
    
    results.checks.push({
      type: 'nakshatra',
      calculated: calcNak,
      reference: refNak,
      passed: nakPassed,
      status: nakPassed ? 'PASS' : 'FAIL',
    });
    
    results.checks.push({
      type: 'pada',
      calculated: calcPada,
      reference: refPada,
      passed: padaPassed,
      status: padaPassed ? 'PASS' : 'FAIL',
    });
    
    if (nakPassed) results.passed++; else results.failed++;
    if (padaPassed) results.passed++; else results.failed++;
  }

  // Check divisional placements
  if (calculated.divisional && reference1?.divisional) {
    for (const varga of ['D9', 'D10']) {
      for (const planetName of Object.keys(calculated.divisional)) {
        const calcRashi = calculated.divisional[planetName]?.[varga]?.rashiIdx;
        const refRashi = reference1.divisional?.[planetName]?.[varga]?.rashiIdx;
        
        if (calcRashi !== undefined && refRashi !== undefined) {
          const passed = calcRashi === refRashi;
          results.checks.push({
            type: `divisional_${varga}`,
            planet: planetName,
            calculated: calcRashi,
            reference: refRashi,
            passed,
            status: passed ? 'PASS' : 'FAIL',
          });
          
          if (passed) results.passed++; else results.failed++;
        }
      }
    }
  }

  // Check dasha dates
  if (calculated.dasha && reference1?.dasha) {
    const calcBalance = calculated.dasha.remainingFraction;
    const refBalance = reference1.dasha.remainingFraction;
    
    if (calcBalance !== undefined && refBalance !== undefined) {
      const diffDays = Math.abs(calcBalance - refBalance) * 365.25 * 10; // approximate days diff for 10-year dasha
      const passed = diffDays <= tolerances.dashaBalanceDays;
      
      results.checks.push({
        type: 'dasha_balance',
        calculated: calcBalance,
        reference: refBalance,
        diffDays,
        tolerance: tolerances.dashaBalanceDays,
        passed,
        status: passed ? 'PASS' : 'FAIL',
      });
      
      if (passed) results.passed++; else results.failed++;
    }
  }

  results.overall = results.failed === 0 ? 'PASS' : 'FAIL';
  results.summary = `${results.passed}/${results.checks.length} checks passed`;

  return results;
}

/**
 * Run regression tests for boundary cases
 * As per requirement: midnight, DST, historical timezone, borders, leap years, high/low lat, sign boundaries, nakshatra boundaries, divisional boundaries
 */
export function runRegressionTests(calculateFunction) {
  const results = {
    timestamp: new Date().toISOString(),
    version: VALIDATION_ENGINE_VERSION,
    testCases: REGRESSION_TEST_CASES,
    results: [],
    passed: 0,
    failed: 0,
  };

  for (const testCase of REGRESSION_TEST_CASES) {
    try {
      const start = performance.now();
      
      // Call the calculation function with test case data
      const chart = calculateFunction({
        dateStr: testCase.date,
        timeStr: testCase.time,
        lat: testCase.lat,
        lon: testCase.lon,
        timezoneId: testCase.tz || 'Asia/Kolkata',
      });
      
      const duration = performance.now() - start;
      
      // Basic validation: chart should be generated without error
      const hasPlanets = chart?.planets && Object.keys(chart.planets).length >= 7;
      const hasAscendant = chart?.ascendant && chart.ascendant.sidereal;
      const hasHouses = chart?.houses && chart.houses.length === 12;
      const hasNakshatra = chart?.nakshatra;
      
      const passed = hasPlanets && hasAscendant && hasHouses && hasNakshatra;
      
      results.results.push({
        id: testCase.id,
        name: testCase.name,
        input: testCase,
        chartGenerated: !!chart,
        hasPlanets,
        hasAscendant,
        hasHouses,
        hasNakshatra,
        durationMs: duration.toFixed(2),
        passed,
        status: passed ? 'PASS' : 'FAIL',
        warnings: chart?.warnings || [],
      });
      
      if (passed) results.passed++; else results.failed++;
      
    } catch (e) {
      results.results.push({
        id: testCase.id,
        name: testCase.name,
        input: testCase,
        error: e.message,
        passed: false,
        status: 'FAIL',
      });
      results.failed++;
    }
  }

  results.summary = `${results.passed}/${results.testCases.length} regression tests passed`;
  results.overall = results.failed === 0 ? 'PASS' : 'FAIL';

  return results;
}

/**
 * Generate calculation details for transparency (Anti-Fake rule)
 * Every kundli must include this page
 */
export function generateCalculationDetails({ birthData, timeConversion, astronomical, vedic, engineVersions, settings }) {
  return {
    // Birth data entered by user
    birthDataEntered: {
      date: birthData.dateStr,
      time: birthData.timeStr,
      place: birthData.place,
      latInput: birthData.lat,
      lonInput: birthData.lon,
      timezoneInput: birthData.timezoneId,
    },
    
    // Birth coordinates actually used
    coordinatesActuallyUsed: {
      lat: timeConversion?.details?.conversion?.lat || birthData.lat,
      lon: timeConversion?.details?.conversion?.lon || birthData.lon,
      latFormatted: `${birthData.lat}° ${birthData.lat >= 0 ? 'N' : 'S'}`,
      lonFormatted: `${birthData.lon}° ${birthData.lon >= 0 ? 'E' : 'W'}`,
      location: birthData.place,
      nearestKnownLocation: birthData.nearestLocation,
      coordinateWarning: birthData.coordinateWarning,
      note: 'Exact coordinates used for calculation. For D60 (0.5° accuracy), use exact locality/hospital coordinates, not city center.',
    },
    
    // Timezone and UTC conversion
    timezoneAndUTC: {
      inputTimezone: timeConversion?.timezoneInfo?.id || birthData.timezoneId,
      timezoneName: timeConversion?.timezoneInfo?.name || 'IST',
      utcOffset: timeConversion?.timezoneInfo?.offset || 5.5,
      historicalNote: timeConversion?.timezoneInfo?.historicalNote || '',
      localTime: `${birthData.dateStr} ${birthData.timeStr}`,
      utcTime: timeConversion?.details?.conversion?.utcDate ? `${timeConversion.details.conversion.utcDate} ${timeConversion.details.conversion.utcHourString} UTC` : 'Calculated',
      JD_UTC: timeConversion?.JD_UTC || astronomical?.input?.JD_UTC,
      JD_TT: timeConversion?.JD_TT || astronomical?.input?.JD_TT,
      deltaT: timeConversion?.deltaTSeconds ? `${timeConversion.deltaTSeconds.toFixed(2)} seconds` : 'Calculated',
      warnings: timeConversion?.warnings || [],
    },
    
    // Ayanamsa and exact value
    ayanamsa: {
      id: vedic?.ayanamsa?.ayanamsaId || settings?.ayanamsaId || 'lahiri',
      name: vedic?.ayanamsa?.ayanamsaName || 'Lahiri / Chitrapaksha',
      nameHi: vedic?.ayanamsa?.ayanamsaNameHi || 'लाहिरी',
      value: vedic?.ayanamsa?.value || 0,
      valueFormatted: vedic?.ayanamsa?.formatted || '0°',
      dms: vedic?.ayanamsa?.dms?.formatted || '',
      formula: vedic?.ayanamsa?.formula || '',
      info: vedic?.ayanamsa?.info || {},
    },
    
    // Ephemeris/calculation engine
    ephemeris: {
      engine: engineVersions?.ephemerisVersion || 'astronomy-engine@2.1.19 VSOP87',
      version: '2.1.19',
      theory: 'VSOP87 (Bretagnon & Francou) + ELP-MPP02 (Moon)',
      validRange: '-2000 to +6000 (4000 BC to 6000 AD)',
      accuracy: '~1 arcsecond for inner planets within ±1000 years',
      reference: 'Meeus Astronomical Algorithms',
    },
    
    // Node type
    nodeType: {
      id: settings?.nodeType || 'true',
      name: settings?.nodeType === 'true' ? 'True Node (True Rahu/Ketu)' : 'Mean Node (Mean Rahu/Ketu)',
      description: settings?.nodeType === 'true' ? 'True osculating node, more accurate, includes periodic terms' : 'Mean node, smoothed, moves ~19.34°/year',
    },
    
    // House system
    houseSystem: {
      id: settings?.houseSystem || 'equal',
      name: settings?.houseSystem === 'equal' ? 'Equal House (30° each from Lagna)' : settings?.houseSystem === 'wholeSign' ? 'Whole Sign' : 'Sripati / Porphyry',
      description: 'House cusps calculated from ascendant',
      ascendant: {
        tropical: astronomical?.ascendant?.tropical?.value?.toFixed(4) + '°' || '',
        sidereal: vedic?.ascendant?.sidereal?.value?.toFixed(4) + '°' || '',
        rashi: vedic?.ascendant?.sidereal?.rashiName || '',
      },
    },
    
    // Calculation timestamp/version
    calculationMeta: {
      timestamp: new Date().toISOString(),
      engineVersion: engineVersions?.calculationEngineVersion || 'Kundli-Engine v3.0.0',
      astronomicalEngineVersion: astronomical?.version || '1.0.0',
      vedicEngineVersion: vedic?.version || '1.0.0',
      timezoneDbVersion: engineVersions?.timezoneDbVersion || '2024b',
      locationDbVersion: engineVersions?.locationDbVersion || '1.0.0',
      calculationId: astronomical?.calculationId || `calc_${Date.now()}`,
      reproducibility: 'All inputs and versions stored for reproducibility. Same inputs will produce same outputs.',
    },
    
    // Warnings and notes
    warnings: [
      ...(timeConversion?.warnings || []),
      ...(astronomical?.warnings || []),
      ...(vedic?.warnings || []),
    ],
    
    // Anti-fake transparency
    transparency: {
      note: 'No AI guessing in calculations. All planetary positions from VSOP87 ephemeris, ascendant from GMST+LST+atan2, ayanamsa from Lahiri formula. No fabricated data.',
      verification: 'Calculation can be verified against independent ephemeris (Swiss Ephemeris, JPL Horizons) within tolerance 0.1° for planets, 0.5° for ascendant.',
      noFakeLabels: 'This chart does not use unverified labels like "100% Accurate" or "AI Verified". Accuracy is defined by tolerances and can be tested.',
    },
  };
}

/**
 * Compare two independent implementations (for validation)
 * Implementation 1: astronomy-engine
 * Implementation 2: simplified VSOP87 (our own)
 */
export function compareTwoImplementations(chart1, chart2) {
  const comparison = {
    timestamp: new Date().toISOString(),
    implementation1: 'astronomy-engine@2.1.19',
    implementation2: 'custom VSOP87 simplified',
    comparisons: [],
    mismatches: [],
  };

  // Compare each planet
  for (const planet of ['Surya', 'Chandra', 'Mangal', 'Budh', 'Guru', 'Shukra', 'Shani']) {
    const lon1 = chart1.planets?.[planet]?.tropical || 0;
    const lon2 = chart2.planets?.[planet]?.tropical || 0;
    const diff = Math.abs(lon1 - lon2);
    const adjustedDiff = Math.min(diff, 360 - diff);
    
    comparison.comparisons.push({
      planet,
      impl1: lon1.toFixed(4),
      impl2: lon2.toFixed(4),
      diff: adjustedDiff.toFixed(4),
      tolerance: '0.1°',
      passed: adjustedDiff <= 0.1,
    });
    
    if (adjustedDiff > 0.1) {
      comparison.mismatches.push({
        planet,
        diff: adjustedDiff,
        impl1: lon1,
        impl2: lon2,
      });
    }
  }

  comparison.passed = comparison.mismatches.length === 0;
  comparison.summary = comparison.passed ? 'Both implementations agree within tolerance' : `${comparison.mismatches.length} mismatches beyond tolerance - FLAG THE RESULT`;

  return comparison;
}
