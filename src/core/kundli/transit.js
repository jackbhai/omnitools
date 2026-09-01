/**
 * Transit (Gochar) Predictions Engine
 * Indian Punjabi Khatri Sharma Pandit Tradition
 * 
 * Calculates planetary transits and their effects based on:
 * - Moon sign (Rashi) based predictions
 * - Ascendant (Lagna) based predictions
 * - Planet-to-planet aspects during transit
 * - Sade Sati (Saturn's 7.5 year transit)
 * - Dhaiya (Small Panoti)
 * - Guru Bala (Jupiter transit effects)
 * - Mangal transit effects
 * 
 * References:
 * - Brihat Parashara Hora Shastra
 * - Phaladeepika (Mantreswara)
 * - Jataka Parijata (Vaidyanatha Dikshita)
 * - Uttara Kalamrita (Kalidasa)
 */

/**
 * Calculate transit predictions
 * @param {Object} natalChart - Birth chart data
 * @param {Date} transitDate - Date for transit calculation
 * @returns {Object} Transit predictions
 */
export function calculateTransit(natalChart, transitDate = new Date()) {
  const results = {
    date: transitDate.toISOString().split('T')[0],
    moonSign: natalChart.moonRashi || null,
    ascendant: natalChart.ascendant?.rashiName || null,
    planetTransits: [],
    sadeSati: null,
    dhaiya: null,
    guruBala: null,
    overallPrediction: '',
    houseEffects: [],
    remedies: []
  };
  
  if (!natalChart.planets || !results.moonSign) {
    return {
      error: 'Cannot calculate transit - incomplete chart data',
      results
    };
  }
  
  // Calculate current transit positions (simplified - would use Swiss Ephemeris in production)
  const transitPlanets = getTransitPlanets(transitDate);
  
  // Analyze each planet's transit
  for (const transit of transitPlanets) {
    const analysis = analyzeTransit(transit, natalChart, results.moonSign);
    results.planetTransits.push(analysis);
  }
  
  // Check Sade Sati
  results.sadeSati = checkSadeSati(natalChart, transitDate);
  
  // Check Dhaiya (Small Panoti)
  results.dhaiya = checkDhaiya(natalChart, transitDate);
  
  // Check Guru Bala (Jupiter transit)
  results.guruBala = checkGuruBala(natalChart, transitDate);
  
  // Generate overall prediction
  results.overallPrediction = generateOverallPrediction(results);
  
  // Calculate house-wise effects
  results.houseEffects = calculateHouseEffects(natalChart, transitPlanets);
  
  // Generate remedies
  results.remedies = generateTransitRemedies(results);
  
  return results;
}

/**
 * Get transit planet positions (simplified)
 * In production, this would use Swiss Ephemeris WASM
 */
function getTransitPlanets(date) {
  // Simplified - approximate positions
  // In production, use calculatePlanets() from astronomical.js with current date
  return [
    { name: 'Surya', sign: 'Simha', house: 0 },
    { name: 'Chandra', sign: 'Karka', house: 0 },
    { name: 'Mangal', sign: 'Mesha', house: 0 },
    { name: 'Budh', sign: 'Kanya', house: 0 },
    { name: 'Guru', sign: 'Meena', house: 0 },
    { name: 'Shukra', sign: 'Tula', house: 0 },
    { name: 'Shani', sign: 'Kumbha', house: 0 },
    { name: 'Rahu', sign: 'Meena', house: 0 },
    { name: 'Ketu', sign: 'Kanya', house: 0 }
  ];
}

/**
 * Analyze transit of a planet
 */
function analyzeTransit(transit, natalChart, moonSign) {
  const signOrder = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
  ];
  
  const moonIndex = signOrder.indexOf(moonSign);
  const transitIndex = signOrder.indexOf(transit.sign);
  
  // Calculate house from Moon
  let houseFromMoon = ((transitIndex - moonIndex + 12) % 12) + 1;
  
  const analysis = {
    planet: transit.name,
    planetHindi: getPlanetHindi(transit.name),
    sign: transit.sign,
    signHindi: getSignHindi(transit.sign),
    houseFromMoon,
    effect: 'neutral',
    description: '',
    areas: [],
    remedy: ''
  };
  
  // Planet-specific transit effects from Moon sign
  const effects = getTransitEffects(transit.name, houseFromMoon);
  analysis.effect = effects.effect;
  analysis.description = effects.description;
  analysis.areas = effects.areas;
  analysis.remedy = effects.remedy;
  
  return analysis;
}

/**
 * Get transit effects based on house from Moon
 */
function getTransitEffects(planet, houseFromMoon) {
  const effectsMatrix = {
    'Surya': {
      1: { effect: 'mixed', description: 'Health issues, government matters, father concerns', areas: ['Health', 'Father', 'Government'], remedy: 'Offer water to Sun at sunrise' },
      2: { effect: 'good', description: 'Wealth increase, family harmony, good speech', areas: ['Wealth', 'Family', 'Speech'], remedy: 'Donate wheat and jaggery on Sunday' },
      3: { effect: 'good', description: 'Courage, victory over enemies, travel', areas: ['Courage', 'Siblings', 'Travel'], remedy: 'Recite Aditya Hridayam' },
      4: { effect: 'bad', description: 'Domestic unrest, vehicle issues, mother health', areas: ['Home', 'Mother', 'Vehicles'], remedy: 'Worship Sun and offer red flowers' },
      5: { effect: 'mixed', description: 'Children issues, education stress, speculation loss', areas: ['Children', 'Education', 'Investments'], remedy: 'Donate to educational institutions' },
      6: { effect: 'good', description: 'Victory over enemies, debt clearance, health improvement', areas: ['Enemies', 'Debts', 'Health'], remedy: 'Feed cows on Sunday' },
      7: { effect: 'bad', description: 'Marriage issues, partnership conflicts, travel problems', areas: ['Marriage', 'Partnerships', 'Travel'], remedy: 'Worship Shiva with red flowers' },
      8: { effect: 'bad', description: 'Health danger, accidents, sudden losses', areas: ['Health', 'Longevity', 'Sudden Events'], remedy: 'Mahamrityunjaya Jaap, donate black sesame' },
      9: { effect: 'good', description: 'Fortune, pilgrimage, guru blessings', areas: ['Fortune', 'Spirituality', 'Father'], remedy: 'Visit temple, respect elders' },
      10: { effect: 'good', description: 'Career success, fame, government favor', areas: ['Career', 'Fame', 'Authority'], remedy: 'Donate to government causes, respect authority' },
      11: { effect: 'good', description: 'Income increase, desires fulfilled, elder sibling support', areas: ['Income', 'Desires', 'Social Circle'], remedy: 'Feed the poor on Sunday' },
      12: { effect: 'bad', description: 'Expenditure, hospitalization, foreign travel stress', areas: ['Expenses', 'Health', 'Foreign'], remedy: 'Donate in secret, meditate' }
    },
    'Chandra': {
      1: { effect: 'good', description: 'Mental peace, charm, public support', areas: ['Mind', 'Health', 'Public Image'], remedy: 'Wear white, drink milk at night' },
      2: { effect: 'good', description: 'Wealth gain, family happiness, good food', areas: ['Wealth', 'Family', 'Food'], remedy: 'Donate rice and milk on Monday' },
      3: { effect: 'mixed', description: 'Short travels, communication efforts', areas: ['Travel', 'Communication'], remedy: 'Worship Goddess Parvati' },
      4: { effect: 'good', description: 'Home happiness, mother well-being, vehicle comfort', areas: ['Home', 'Mother', 'Vehicles'], remedy: 'Serve mother, keep home clean' },
      5: { effect: 'good', description: 'Children joy, romantic happiness, creative success', areas: ['Children', 'Romance', 'Creativity'], remedy: 'Feed fish, play with children' },
      6: { effect: 'bad', description: 'Mental stress, enemies, health issues', areas: ['Mental Health', 'Enemies'], remedy: 'Meditation, avoid conflicts' },
      7: { effect: 'good', description: 'Marriage bliss, partnership success, travel joy', areas: ['Marriage', 'Partnerships'], remedy: 'Respect spouse, sweet speech' },
      8: { effect: 'bad', description: 'Mental anxiety, fears, mother health concerns', areas: ['Anxiety', 'Mother Health'], remedy: 'Mahamrityunjaya Jaap, worship Shiva' },
      9: { effect: 'good', description: 'Fortune, guru blessings, spiritual growth', areas: ['Fortune', 'Spirituality'], remedy: 'Visit guru, pilgrimage' },
      10: { effect: 'good', description: 'Career success, public recognition', areas: ['Career', 'Public Image'], remedy: 'Serve public, be humble' },
      11: { effect: 'good', description: 'All gains, desires fulfilled, social success', areas: ['Gains', 'Social Circle'], remedy: 'Charity, help others' },
      12: { effect: 'mixed', description: 'Foreign travel, expenses, sleep issues', areas: ['Foreign', 'Sleep'], remedy: 'Sleep early, meditate before bed' }
    },
    'Shani': {
      1: { effect: 'bad', description: 'Health deterioration, obstacles, delays', areas: ['Health', 'Obstacles'], remedy: 'Feed black dogs, donate black clothes on Saturday' },
      2: { effect: 'bad', description: 'Financial loss, family disputes, speech problems', areas: ['Wealth', 'Family'], remedy: 'Donate black sesame and iron on Saturday' },
      3: { effect: 'good', description: 'Courage, victory over enemies, sibling support', areas: ['Courage', 'Siblings'], remedy: 'Feed crows, help servants' },
      4: { effect: 'bad', description: 'Home unrest, mother illness, vehicle breakdown', areas: ['Home', 'Mother', 'Vehicles'], remedy: 'Serve mother, donate black blanket to poor' },
      5: { effect: 'bad', description: 'Children issues, education failure, speculation loss', areas: ['Children', 'Education'], remedy: 'Donate to schools, feed children' },
      6: { effect: 'good', description: 'Destruction of enemies, debt clearance', areas: ['Enemies', 'Debts'], remedy: 'Feed dogs, help the disabled' },
      7: { effect: 'bad', description: 'Marriage discord, partnership loss, travel problems', areas: ['Marriage', 'Partnerships'], remedy: 'Respect spouse, donate to couples in need' },
      8: { effect: 'bad', description: 'Chronic illness, accidents, transformation', areas: ['Health', 'Transformation'], remedy: 'Mahamrityunjaya Jaap, donate black sesame' },
      9: { effect: 'bad', description: 'Fortune decline, guru displeasure, father issues', areas: ['Fortune', 'Father'], remedy: 'Serve father, respect guru, pilgrimage' },
      10: { effect: 'mixed', description: 'Career change, hard work, delayed success', areas: ['Career'], remedy: 'Work honestly, help colleagues' },
      11: { effect: 'good', description: 'Gains through hard work, elder support', areas: ['Gains', 'Elder Siblings'], remedy: 'Donate to elderly, charity' },
      12: { effect: 'bad', description: 'Hospitalization, foreign loss, isolation', areas: ['Expenses', 'Health'], remedy: 'Donate secretly, serve sick people' }
    }
  };
  
  // Get effects or return default
  const planetEffects = effectsMatrix[planet];
  if (planetEffects && planetEffects[houseFromMoon]) {
    return planetEffects[houseFromMoon];
  }
  
  return {
    effect: 'neutral',
    description: `${getPlanetHindi(planet)} transit in ${houseFromMoon}th house from Moon`,
    areas: ['General'],
    remedy: 'Regular prayers and charity'
  };
}

/**
 * Check Sade Sati (7.5 years Saturn transit)
 */
function checkSadeSati(natalChart, transitDate) {
  const moonSign = natalChart.moonRashi;
  if (!moonSign) return null;
  
  const signOrder = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
  ];
  
  // Simplified - would need actual Saturn position from Swiss Ephemeris
  const moonIndex = signOrder.indexOf(moonSign);
  const saturnSign = 'Kumbha'; // Placeholder
  const saturnIndex = signOrder.indexOf(saturnSign);
  
  let houseFromMoon = ((saturnIndex - moonIndex + 12) % 12) + 1;
  
  // Sade Sati happens when Saturn is in 12th, 1st, or 2nd from Moon
  const isSadeSati = [12, 1, 2].includes(houseFromMoon);
  
  if (!isSadeSati) {
    return {
      active: false,
      description: 'Sade Sati is not active'
    };
  }
  
  let phase = '';
  let phaseName = '';
  if (houseFromMoon === 12) {
    phase = 'first';
    phaseName = 'Rising Phase (Pehli Sade Sati)';
  } else if (houseFromMoon === 1) {
    phase = 'peak';
    phaseName = 'Peak Phase (Beech Sade Sati)';
  } else {
    phase = 'last';
    phaseName = 'Setting Phase (Aakhri Sade Sati)';
  }
  
  return {
    active: true,
    phase,
    phaseName,
    moonSign,
    saturnSign,
    description: `Sade Sati is active - ${phaseName}. Saturn transiting ${saturnSign} (${houseFromMoon}th from Moon in ${moonSign})`,
    effects: getSadeSatiEffects(phase, moonSign),
    remedies: getSadeSatiRemedies()
  };
}

/**
 * Get Sade Sati effects based on phase
 */
function getSadeSatiEffects(phase, moonSign) {
  const effects = {
    'first': {
      description: 'Rising phase - Mental stress, expenditure, foreign travel',
      areas: ['Mental Health', 'Expenses', 'Foreign Travel'],
      intensity: 'Medium'
    },
    'peak': {
      description: 'Peak phase - Maximum impact on health, career, family',
      areas: ['Health', 'Career', 'Family', 'Reputation'],
      intensity: 'High'
    },
    'last': {
      description: 'Setting phase - Financial strain, relationship issues',
      areas: ['Finances', 'Relationships', 'Health'],
      intensity: 'Medium'
    }
  };
  
  return effects[phase] || effects['first'];
}

/**
 * Get Sade Sati remedies (Punjabi tradition)
 */
function getSadeSatiRemedies() {
  return [
    {
      name: 'Shani Puja',
      description: 'Perform Shani Puja on Saturday evening at Shani temple',
      frequency: 'Every Saturday during Sade Sati'
    },
    {
      name: 'Oil Offering',
      description: 'Offer mustard oil to Shani idol (Tel Abhishek)',
      frequency: 'Every Saturday'
    },
    {
      name: 'Hanuman Chalisa',
      description: 'Recite Hanuman Chalisa daily',
      frequency: 'Daily (morning and evening)'
    },
    {
      name: 'Charity',
      description: 'Donate black sesame seeds, black blanket, iron items, black clothes to poor',
      frequency: 'Every Saturday'
    },
    {
      name: 'Feed Crows and Dogs',
      description: 'Feed black crows and black dogs',
      frequency: 'Every Saturday'
    },
    {
      name: 'Mantra Jaap',
      description: 'Chant "Om Sham Shanaishcharaya Namah" 108 times',
      frequency: 'Daily (evening)'
    },
    {
      name: 'Iron Ring',
      description: 'Wear iron ring made from horse shoe nail on middle finger',
      frequency: 'Continuous during Sade Sati'
    },
    {
      name: 'Serve Elderly',
      description: 'Serve elderly people, especially those who are disabled or poor',
      frequency: 'As opportunity arises'
    }
  ];
}

/**
 * Check Dhaiya (Small Panoti - 2.5 years)
 */
function checkDhaiya(natalChart, transitDate) {
  const moonSign = natalChart.moonRashi;
  if (!moonSign) return null;
  
  const signOrder = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
  ];
  
  const moonIndex = signOrder.indexOf(moonSign);
  const saturnSign = 'Kumbha'; // Placeholder
  const saturnIndex = signOrder.indexOf(saturnSign);
  
  let houseFromMoon = ((saturnIndex - moonIndex + 12) % 12) + 1;
  
  // Dhaiya happens when Saturn is in 4th or 8th from Moon
  const isDhaiya = [4, 8].includes(houseFromMoon);
  
  if (!isDhaiya) {
    return {
      active: false,
      description: 'Dhaiya is not active'
    };
  }
  
  const type = houseFromMoon === 4 ? 'Chaturthi Shani (4th house)' : 'Ashtami Shani (8th house)';
  
  return {
    active: true,
    type,
    houseFromMoon,
    description: `Dhaiya is active - Saturn in ${houseFromMoon}th house from Moon`,
    effects: houseFromMoon === 4 ?
      'Domestic unrest, vehicle issues, mother health, education problems' :
      'Health issues, chronic diseases, sudden events, transformation',
    remedies: getSadeSatiRemedies() // Same remedies as Sade Sati
  };
}

/**
 * Check Guru Bala (Jupiter transit strength)
 */
function checkGuruBala(natalChart, transitDate) {
  const moonSign = natalChart.moonRashi;
  if (!moonSign) return null;
  
  const signOrder = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
  ];
  
  const moonIndex = signOrder.indexOf(moonSign);
  const jupiterSign = 'Meena'; // Placeholder
  const jupiterIndex = signOrder.indexOf(jupiterSign);
  
  let houseFromMoon = ((jupiterIndex - moonIndex + 12) % 12) + 1;
  
  // Guru Bala calculation
  const goodHouses = [2, 5, 7, 9, 11]; // Excellent houses for Jupiter
  const badHouses = [6, 8, 12]; // Challenging houses
  
  let bala = 'Medium';
  let description = '';
  
  if (goodHouses.includes(houseFromMoon)) {
    bala = 'Strong';
    description = `Jupiter in ${houseFromMoon}th house from Moon - Excellent for wisdom, fortune, and growth`;
  } else if (badHouses.includes(houseFromMoon)) {
    bala = 'Weak';
    description = `Jupiter in ${houseFromMoon}th house from Moon - Challenges in wisdom and fortune`;
  } else {
    description = `Jupiter in ${houseFromMoon}th house from Moon - Moderate effects`;
  }
  
  return {
    houseFromMoon,
    jupiterSign,
    bala,
    description,
    effects: getGuruTransitEffects(houseFromMoon),
    remedy: 'Worship Lord Vishnu, recite Vishnu Sahasranama on Thursday, donate yellow items'
  };
}

/**
 * Get Jupiter transit effects by house
 */
function getGuruTransitEffects(houseFromMoon) {
  const effects = {
    1: 'Health improvement, personality enhancement, new beginnings',
    2: 'Wealth increase, family harmony, good speech',
    3: 'Courage, communication success, sibling support',
    4: 'Home happiness, mother blessing, vehicle purchase',
    5: 'Children success, education, romance, creativity',
    6: 'Enemy victory but health issues, legal problems',
    7: 'Marriage bliss, partnership success, business growth',
    8: 'Sudden changes, inheritance, spiritual awakening',
    9: 'Fortune, pilgrimage, guru blessings, father support',
    10: 'Career success, fame, recognition, promotion',
    11: 'All gains, income increase, desire fulfillment',
    12: 'Foreign travel, expenses, spiritual growth, isolation'
  };
  return effects[houseFromMoon] || 'General effects';
}

/**
 * Generate overall transit prediction
 */
function generateOverallPrediction(results) {
  const goodCount = results.planetTransits.filter(p => p.effect === 'good').length;
  const badCount = results.planetTransits.filter(p => p.effect === 'bad').length;
  
  let overall = '';
  
  if (results.sadeSati?.active) {
    overall = `Sade Sati is active (${results.sadeSati.phaseName}). Expect challenges but also transformation. Follow remedies strictly. `;
  }
  
  if (goodCount > badCount) {
    overall += `Generally favorable period with ${goodCount} beneficial planetary transits. Good time for important decisions.`;
  } else if (badCount > goodCount) {
    overall += `Challenging period with ${badCount} difficult transits. Be cautious, follow remedies, avoid risky decisions.`;
  } else {
    overall += `Mixed period with balanced planetary influences. Proceed with normal activities but stay alert.`;
  }
  
  return overall;
}

/**
 * Calculate house-wise effects
 */
function calculateHouseEffects(natalChart, transitPlanets) {
  const houseEffects = [];
  
  for (let house = 1; house <= 12; house++) {
    const planetsInHouse = transitPlanets.filter(p => p.house === house);
    
    if (planetsInHouse.length > 0) {
      houseEffects.push({
        house,
        houseName: getHouseName(house),
        planets: planetsInHouse.map(p => p.name),
        effects: `Planetary activity in ${house}th house - ${getHouseName(house)} area affected`
      });
    }
  }
  
  return houseEffects;
}

/**
 * Generate transit-specific remedies
 */
function generateTransitRemedies(results) {
  const remedies = [];
  
  // Add Sade Sati remedies if active
  if (results.sadeSati?.active) {
    remedies.push(...results.sadeSati.remedies);
  }
  
  // Add planet-specific remedies for bad transits
  const badTransits = results.planetTransits.filter(p => p.effect === 'bad');
  for (const transit of badTransits) {
    if (transit.remedy) {
      remedies.push({
        name: `${transit.planetHindi} Transit Remedy`,
        description: transit.remedy,
        planet: transit.planet
      });
    }
  }
  
  return remedies;
}

/**
 * Get house name in Hindi
 */
function getHouseName(house) {
  const houseNames = {
    1: 'Tanu Bhava (Self, Health)',
    2: 'Dhana Bhava (Wealth, Family)',
    3: 'Sahaja Bhava (Siblings, Courage)',
    4: 'Sukha Bhava (Home, Mother)',
    5: 'Putra Bhava (Children, Education)',
    6: 'Ripu Bhava (Enemies, Health)',
    7: 'Kalatra Bhava (Marriage, Partners)',
    8: 'Ayur Bhava (Longevity, Transformation)',
    9: 'Dharma Bhava (Fortune, Father)',
    10: 'Karma Bhava (Career, Fame)',
    11: 'Labha Bhava (Gains, Desires)',
    12: 'Vyaya Bhava (Losses, Foreign)'
  };
  return houseNames[house] || `House ${house}`;
}

/**
 * Get planet Hindi name
 */
function getPlanetHindi(planet) {
  const hindiNames = {
    'Surya': 'सूर्य', 'Chandra': 'चन्द्र', 'Mangal': 'मंगल',
    'Budh': 'बुध', 'Guru': 'गुरु', 'Shukra': 'शुक्र',
    'Shani': 'शनि', 'Rahu': 'राहु', 'Ketu': 'केतु'
  };
  return hindiNames[planet] || planet;
}

/**
 * Get sign Hindi name
 */
function getSignHindi(sign) {
  const hindiNames = {
    'Mesha': 'मेष', 'Vrishabha': 'वृषभ', 'Mithuna': 'मिथुन',
    'Karka': 'कर्क', 'Simha': 'सिंह', 'Kanya': 'कन्या',
    'Tula': 'तुला', 'Vrishchika': 'वृश्चिक', 'Dhanu': 'धनु',
    'Makara': 'मकर', 'Kumbha': 'कुम्भ', 'Meena': 'मीन'
  };
  return hindiNames[sign] || sign;
}
