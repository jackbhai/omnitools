/**
 * Kundli Milan (Match Making) - 36 Point System
 * Indian Punjabi Khatri Sharma Pandit Tradition
 * 
 * Ashtakoot Milan (8-fold compatibility test):
 * 1. Varna (1 point) - Spiritual compatibility
 * 2. Vashya (2 points) - Mutual attraction/control
 * 3. Tara (3 points) - Health and well-being
 * 4. Yoni (4 points) - Sexual compatibility
 * 5. Graha Maitri (5 points) - Mental compatibility
 * 6. Gana (6 points) - Temperament compatibility
 * 7. Bhakoot (7 points) - Love and family harmony
 * 8. Nadi (8 points) - Genetic/health compatibility
 * 
 * Total: 36 points
 * Minimum required: 18 points (50%)
 * Good match: 24-32 points
 * Excellent match: 32+ points
 */

/**
 * Calculate Kundli Milan compatibility
 * @param {Object} boyChart - Boy's chart data
 * @param {Object} girlChart - Girl's chart data
 * @returns {Object} Detailed compatibility report
 */
export function calculateMilan(boyChart, girlChart) {
  const results = {
    totalPoints: 0,
    maxPoints: 36,
    percentage: 0,
    verdict: '',
    detailedBreakdown: [],
    manglikCheck: {
      boy: checkManglik(boyChart),
      girl: checkManglik(girlChart)
    },
    recommendations: []
  };
  
  // Extract Moon signs (Rashi) for both
  const boyMoonSign = getMoonSign(boyChart);
  const girlMoonSign = getMoonSign(girlChart);
  
  if (!boyMoonSign || !girlMoonSign) {
    results.verdict = 'Cannot calculate - Moon sign missing';
    return results;
  }
  
  // 1. Varna (1 point) - Spiritual compatibility
  const varna = calculateVarna(boyMoonSign, girlMoonSign);
  results.detailedBreakdown.push(varna);
  results.totalPoints += varna.points;
  
  // 2. Vashya (2 points) - Mutual attraction
  const vashya = calculateVashya(boyMoonSign, girlMoonSign);
  results.detailedBreakdown.push(vashya);
  results.totalPoints += vashya.points;
  
  // 3. Tara (3 points) - Health and destiny
  const tara = calculateTara(boyChart, girlChart);
  results.detailedBreakdown.push(tara);
  results.totalPoints += tara.points;
  
  // 4. Yoni (4 points) - Sexual compatibility
  const yoni = calculateYoni(boyChart, girlChart);
  results.detailedBreakdown.push(yoni);
  results.totalPoints += yoni.points;
  
  // 5. Graha Maitri (5 points) - Mental compatibility
  const grahaMaitri = calculateGrahaMaitri(boyMoonSign, girlMoonSign);
  results.detailedBreakdown.push(grahaMaitri);
  results.totalPoints += grahaMaitri.points;
  
  // 6. Gana (6 points) - Temperament
  const gana = calculateGana(boyChart, girlChart);
  results.detailedBreakdown.push(gana);
  results.totalPoints += gana.points;
  
  // 7. Bhakoot (7 points) - Love and family
  const bhakoot = calculateBhakoot(boyMoonSign, girlMoonSign);
  results.detailedBreakdown.push(bhakoot);
  results.totalPoints += bhakoot.points;
  
  // 8. Nadi (8 points) - Genetic compatibility
  const nadi = calculateNadi(boyChart, girlChart);
  results.detailedBreakdown.push(nadi);
  results.totalPoints += nadi.points;
  
  // Calculate percentage
  results.percentage = (results.totalPoints / 36) * 100;
  
  // Determine verdict
  if (results.totalPoints >= 32) {
    results.verdict = 'Excellent Match (Uttam) - Highly Recommended';
  } else if (results.totalPoints >= 24) {
    results.verdict = 'Good Match (Shubh) - Recommended';
  } else if (results.totalPoints >= 18) {
    results.verdict = 'Average Match (Madhyam) - Acceptable with remedies';
  } else {
    results.verdict = 'Below Average (Ashubh) - Not Recommended';
  }
  
  // Check Manglik compatibility
  if (results.manglikCheck.boy.isManglik && !results.manglikCheck.girl.isManglik) {
    results.recommendations.push({
      type: 'warning',
      text: 'Boy is Manglik but girl is not. Manglik Dosha cancellation remedies required before marriage.'
    });
  } else if (!results.manglikCheck.boy.isManglik && results.manglikCheck.girl.isManglik) {
    results.recommendations.push({
      type: 'warning',
      text: 'Girl is Manglik but boy is not. Manglik Dosha cancellation remedies required before marriage.'
    });
  } else if (results.manglikCheck.boy.isManglik && results.manglikCheck.girl.isManglik) {
    results.recommendations.push({
      type: 'info',
      text: 'Both are Manglik - Dosha cancels out. Marriage is acceptable.'
    });
  }
  
  // Add specific recommendations based on weak points
  if (varna.points === 0) {
    results.recommendations.push({
      type: 'remedy',
      text: 'Varna mismatch - Perform spiritual rituals together, worship family deity'
    });
  }
  
  if (nadi.points === 0) {
    results.recommendations.push({
      type: 'warning',
      text: 'Nadi Dosha present - Serious health/genetic compatibility issue. Consult astrologer for Nadi Dosha Nivaran Puja.'
    });
  }
  
  if (bhakoot.points === 0) {
    results.recommendations.push({
      type: 'warning',
      text: 'Bhakoot Dosha present - May cause financial/family issues. Perform Bhakoot Shanti Puja.'
    });
  }
  
  if (results.totalPoints >= 18 && results.totalPoints < 24) {
    results.recommendations.push({
      type: 'remedy',
      text: 'Average compatibility - Perform pre-marriage rituals, worship Gauri-Ganesh, charity on auspicious days'
    });
  }
  
  return results;
}

/**
 * Get Moon sign from chart
 */
function getMoonSign(chart) {
  if (chart.moonRashi) return chart.moonRashi;
  
  const chandra = chart.planets?.find(p => p.name === 'Chandra');
  return chandra?.sidereal?.rashiName || null;
}

/**
 * 1. Varna (1 point) - Spiritual compatibility
 * Based on Moon sign caste hierarchy
 */
function calculateVarna(boySign, girlSign) {
  const varnaMap = {
    'Karka': 'Brahmin', 'Vrishchika': 'Brahmin', 'Meena': 'Brahmin',
    'Mesha': 'Kshatriya', 'Simha': 'Kshatriya', 'Dhanu': 'Kshatriya',
    'Vrishabha': 'Vaishya', 'Kanya': 'Vaishya', 'Makara': 'Vaishya',
    'Mithuna': 'Shudra', 'Tula': 'Shudra', 'Kumbha': 'Shudra'
  };
  
  const boyVarna = varnaMap[boySign] || 'Shudra';
  const girlVarna = varnaMap[girlSign] || 'Shudra';
  
  const varnaOrder = ['Brahmin', 'Kshatriya', 'Vaishya', 'Shudra'];
  const boyOrder = varnaOrder.indexOf(boyVarna);
  const girlOrder = varnaOrder.indexOf(girlVarna);
  
  let points = 0;
  let description = '';
  
  if (girlOrder >= boyOrder) {
    points = 1;
    description = `${boyVarna} boy + ${girlVarna} girl - Compatible (girl varna equal or higher)`;
  } else {
    points = 0;
    description = `${boyVarna} boy + ${girlVarna} girl - Incompatible (girl varna lower)`;
  }
  
  return {
    name: 'Varna',
    points,
    maxPoints: 1,
    boyValue: boyVarna,
    girlValue: girlVarna,
    description,
    importance: 'Spiritual compatibility, ego management'
  };
}

/**
 * 2. Vashya (2 points) - Mutual attraction and control
 */
function calculateVashya(boySign, girlSign) {
  const vashyaMap = {
    'Mesha': 'Chatushpada', 'Vrishabha': 'Chatushpada', 'Mithuna': 'Manav',
    'Karka': 'Vanchar', 'Simha': 'Vanchar', 'Kanya': 'Manav',
    'Tula': 'Manav', 'Vrishchika': 'Keeta', 'Dhanu': 'Vanchar',
    'Makara': 'Chatushpada', 'Kumbha': 'Manav', 'Meena': 'Jalchar'
  };
  
  const boyVashya = vashyaMap[boySign] || 'Manav';
  const girlVashya = vashyaMap[girlSign] || 'Manav';
  
  let points = 0;
  let description = '';
  
  if (boyVashya === girlVashya) {
    points = 2;
    description = `Both ${boyVashya} - Perfect mutual attraction`;
  } else if (
    (boyVashya === 'Manav' && girlVashya === 'Chatushpada') ||
    (boyVashya === 'Chatushpada' && girlVashya === 'Manav') ||
    (boyVashya === 'Vanchar' && girlVashya === 'Manav')
  ) {
    points = 1;
    description = `${boyVashya} + ${girlVashya} - Moderate attraction`;
  } else {
    points = 0;
    description = `${boyVashya} + ${girlVashya} - Low attraction`;
  }
  
  return {
    name: 'Vashya',
    points,
    maxPoints: 2,
    boyValue: boyVashya,
    girlValue: girlVashya,
    description,
    importance: 'Mutual attraction, control, power dynamics'
  };
}

/**
 * 3. Tara (3 points) - Health and destiny
 * Based on nakshatra distance
 */
function calculateTara(boyChart, girlChart) {
  const boyNakshatra = boyChart.nakshatra?.nakshatra;
  const girlNakshatra = girlChart.nakshatra?.nakshatra;
  
  if (!boyNakshatra || !girlNakshatra) {
    return {
      name: 'Tara',
      points: 0,
      maxPoints: 3,
      boyValue: 'Unknown',
      girlValue: 'Unknown',
      description: 'Cannot calculate - Nakshatra missing',
      importance: 'Health, longevity, destiny'
    };
  }
  
  const nakshatras = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
  ];
  
  const boyIndex = nakshatras.indexOf(boyNakshatra);
  const girlIndex = nakshatras.indexOf(girlNakshatra);
  
  // Count from boy to girl and girl to boy
  let countBoyToGirl = (girlIndex - boyIndex + 27) % 27;
  let countGirlToBoy = (boyIndex - girlIndex + 27) % 27;
  
  // Divide by 9 and check remainder
  const remainderBoy = countBoyToGirl % 9;
  const remainderGirl = countGirlToBoy % 9;
  
  // Tara types: 1=Janma, 2=Sampat, 3=Vipat, 4=Kshema, 5=Pratyak, 6=Sadhana, 7=Naidhana, 8=Mitra, 9=Ati-Mitra
  // Good: 2,4,6,8,9 (Sampat, Kshema, Sadhana, Mitra, Ati-Mitra)
  // Bad: 1,3,5,7 (Janma, Vipat, Pratyak, Naidhana)
  
  const goodTaras = [2, 4, 6, 8, 0]; // 0 means 9 (Ati-Mitra)
  const boyGood = goodTaras.includes(remainderBoy);
  const girlGood = goodTaras.includes(remainderGirl);
  
  let points = 0;
  let description = '';
  
  if (boyGood && girlGood) {
    points = 3;
    description = `Both have good Tara - Excellent health and destiny`;
  } else if (boyGood || girlGood) {
    points = 1.5;
    description = `One has good Tara - Moderate health and destiny`;
  } else {
    points = 0;
    description = `Both have bad Tara - Health issues possible`;
  }
  
  return {
    name: 'Tara',
    points,
    maxPoints: 3,
    boyValue: boyNakshatra,
    girlValue: girlNakshatra,
    description,
    importance: 'Health, longevity, destiny, fortune'
  };
}

/**
 * 4. Yoni (4 points) - Sexual compatibility
 * Based on nakshatra animal symbols
 */
function calculateYoni(boyChart, girlChart) {
  const boyNakshatra = boyChart.nakshatra?.nakshatra;
  const girlNakshatra = girlChart.nakshatra?.nakshatra;
  
  if (!boyNakshatra || !girlNakshatra) {
    return {
      name: 'Yoni',
      points: 0,
      maxPoints: 4,
      boyValue: 'Unknown',
      girlValue: 'Unknown',
      description: 'Cannot calculate - Nakshatra missing',
      importance: 'Sexual compatibility, physical attraction'
    };
  }
  
  const yoniMap = {
    'Ashwini': { animal: 'Horse', gender: 'M' },
    'Bharani': { animal: 'Elephant', gender: 'M' },
    'Krittika': { animal: 'Sheep', gender: 'F' },
    'Rohini': { animal: 'Serpent', gender: 'F' },
    'Mrigashira': { animal: 'Serpent', gender: 'F' },
    'Ardra': { animal: 'Dog', gender: 'F' },
    'Punarvasu': { animal: 'Cat', gender: 'F' },
    'Pushya': { animal: 'Sheep', gender: 'M' },
    'Ashlesha': { animal: 'Cat', gender: 'M' },
    'Magha': { animal: 'Rat', gender: 'M' },
    'Purva Phalguni': { animal: 'Rat', gender: 'F' },
    'Uttara Phalguni': { animal: 'Cow', gender: 'M' },
    'Hasta': { animal: 'Buffalo', gender: 'F' },
    'Chitra': { animal: 'Tiger', gender: 'F' },
    'Swati': { animal: 'Buffalo', gender: 'M' },
    'Vishakha': { animal: 'Tiger', gender: 'M' },
    'Anuradha': { animal: 'Deer', gender: 'F' },
    'Jyeshtha': { animal: 'Deer', gender: 'M' },
    'Mula': { animal: 'Dog', gender: 'M' },
    'Purva Ashadha': { animal: 'Monkey', gender: 'M' },
    'Uttara Ashadha': { animal: 'Mongoose', gender: 'M' },
    'Shravana': { animal: 'Monkey', gender: 'F' },
    'Dhanishta': { animal: 'Lion', gender: 'F' },
    'Shatabhisha': { animal: 'Horse', gender: 'F' },
    'Purva Bhadrapada': { animal: 'Lion', gender: 'M' },
    'Uttara Bhadrapada': { animal: 'Cow', gender: 'F' },
    'Revati': { animal: 'Elephant', gender: 'F' }
  };
  
  const boyYoni = yoniMap[boyNakshatra] || { animal: 'Unknown', gender: 'M' };
  const girlYoni = yoniMap[girlNakshatra] || { animal: 'Unknown', gender: 'F' };
  
  // Enemy animals (get 0 points)
  const enemies = {
    'Horse': 'Buffalo', 'Elephant': 'Lion', 'Sheep': 'Monkey',
    'Serpent': 'Mongoose', 'Dog': 'Deer', 'Cat': 'Rat',
    'Cow': 'Tiger', 'Buffalo': 'Horse', 'Lion': 'Elephant',
    'Monkey': 'Sheep', 'Mongoose': 'Serpent', 'Deer': 'Dog',
    'Rat': 'Cat', 'Tiger': 'Cow'
  };
  
  let points = 0;
  let description = '';
  
  // Check if same animal (best)
  if (boyYoni.animal === girlYoni.animal) {
    points = 4;
    description = `Same Yoni (${boyYoni.animal}) - Perfect sexual compatibility`;
  }
  // Check if enemies
  else if (enemies[boyYoni.animal] === girlYoni.animal || 
           enemies[girlYoni.animal] === boyYoni.animal) {
    points = 0;
    description = `Enemy Yonis (${boyYoni.animal} vs ${girlYoni.animal}) - Sexual incompatibility`;
  }
  // Check gender compatibility (M+F or F+M is good)
  else if (boyYoni.gender !== girlYoni.gender) {
    points = 3;
    description = `${boyYoni.animal} (M) + ${girlYoni.animal} (F) - Good sexual compatibility`;
  }
  // Same gender (moderate)
  else {
    points = 2;
    description = `${boyYoni.animal} + ${girlYoni.animal} - Moderate sexual compatibility`;
  }
  
  return {
    name: 'Yoni',
    points,
    maxPoints: 4,
    boyValue: `${boyYoni.animal} (${boyYoni.gender})`,
    girlValue: `${girlYoni.animal} (${girlYoni.gender})`,
    description,
    importance: 'Sexual compatibility, physical attraction, intimacy'
  };
}

/**
 * 5. Graha Maitri (5 points) - Mental compatibility
 * Based on Moon sign lords friendship
 */
function calculateGrahaMaitri(boySign, girlSign) {
  const lordMap = {
    'Mesha': 'Mangal', 'Vrishabha': 'Shukra', 'Mithuna': 'Budh',
    'Karka': 'Chandra', 'Simha': 'Surya', 'Kanya': 'Budh',
    'Tula': 'Shukra', 'Vrishchika': 'Mangal', 'Dhanu': 'Guru',
    'Makara': 'Shani', 'Kumbha': 'Shani', 'Meena': 'Guru'
  };
  
  const boyLord = lordMap[boySign] || 'Unknown';
  const girlLord = lordMap[girlSign] || 'Unknown';
  
  // Friendship table
  const friends = {
    'Surya': ['Chandra', 'Mangal', 'Guru'],
    'Chandra': ['Surya', 'Budh'],
    'Mangal': ['Surya', 'Chandra', 'Guru'],
    'Budh': ['Surya', 'Shukra'],
    'Guru': ['Surya', 'Chandra', 'Mangal'],
    'Shukra': ['Budh', 'Shani'],
    'Shani': ['Budh', 'Shukra']
  };
  
  const enemies = {
    'Surya': ['Shukra', 'Shani'],
    'Chandra': ['Shukra'],
    'Mangal': ['Budh'],
    'Budh': ['Chandra', 'Mangal'],
    'Guru': ['Shukra', 'Shani'],
    'Shukra': ['Surya', 'Chandra'],
    'Shani': ['Surya', 'Chandra', 'Mangal']
  };
  
  const boyFriends = friends[boyLord] || [];
  const boyEnemies = enemies[boyLord] || [];
  const girlFriends = friends[girlLord] || [];
  const girlEnemies = enemies[girlLord] || [];
  
  const boyToGirl = boyFriends.includes(girlLord) ? 'friend' : 
                    boyEnemies.includes(girlLord) ? 'enemy' : 'neutral';
  const girlToBoy = girlFriends.includes(boyLord) ? 'friend' : 
                    girlEnemies.includes(boyLord) ? 'enemy' : 'neutral';
  
  let points = 0;
  let description = '';
  
  if (boyToGirl === 'friend' && girlToBoy === 'friend') {
    points = 5;
    description = `${boyLord} and ${girlLord} mutual friends - Perfect mental compatibility`;
  } else if (boyToGirl === 'friend' && girlToBoy === 'neutral') {
    points = 4;
    description = `${boyLord} friend of ${girlLord}, neutral reverse - Good mental compatibility`;
  } else if (boyToGirl === 'neutral' && girlToBoy === 'friend') {
    points = 4;
    description = `${boyLord} neutral to ${girlLord}, friend reverse - Good mental compatibility`;
  } else if (boyToGirl === 'neutral' && girlToBoy === 'neutral') {
    points = 3;
    description = `${boyLord} and ${girlLord} mutual neutral - Moderate mental compatibility`;
  } else if (boyToGirl === 'friend' && girlToBoy === 'enemy') {
    points = 2;
    description = `${boyLord} friend of ${girlLord}, enemy reverse - Mixed mental compatibility`;
  } else if (boyToGirl === 'enemy' && girlToBoy === 'friend') {
    points = 2;
    description = `${boyLord} enemy of ${girlLord}, friend reverse - Mixed mental compatibility`;
  } else if (boyToGirl === 'neutral' && girlToBoy === 'enemy') {
    points = 1;
    description = `${boyLord} neutral to ${girlLord}, enemy reverse - Poor mental compatibility`;
  } else if (boyToGirl === 'enemy' && girlToBoy === 'neutral') {
    points = 1;
    description = `${boyLord} enemy of ${girlLord}, neutral reverse - Poor mental compatibility`;
  } else {
    points = 0;
    description = `${boyLord} and ${girlLord} mutual enemies - Mental incompatibility`;
  }
  
  return {
    name: 'Graha Maitri',
    points,
    maxPoints: 5,
    boyValue: boyLord,
    girlValue: girlLord,
    description,
    importance: 'Mental compatibility, friendship, understanding'
  };
}

/**
 * 6. Gana (6 points) - Temperament compatibility
 * Based on nakshatra ganas (Dev, Manushya, Rakshas)
 */
function calculateGana(boyChart, girlChart) {
  const boyNakshatra = boyChart.nakshatra?.nakshatra;
  const girlNakshatra = girlChart.nakshatra?.nakshatra;
  
  if (!boyNakshatra || !girlNakshatra) {
    return {
      name: 'Gana',
      points: 0,
      maxPoints: 6,
      boyValue: 'Unknown',
      girlValue: 'Unknown',
      description: 'Cannot calculate - Nakshatra missing',
      importance: 'Temperament, nature, behavior'
    };
  }
  
  const ganaMap = {
    'Ashwini': 'Dev', 'Bharani': 'Manushya', 'Krittika': 'Rakshas',
    'Rohini': 'Manushya', 'Mrigashira': 'Dev', 'Ardra': 'Manushya',
    'Punarvasu': 'Dev', 'Pushya': 'Dev', 'Ashlesha': 'Rakshas',
    'Magha': 'Rakshas', 'Purva Phalguni': 'Manushya', 'Uttara Phalguni': 'Manushya',
    'Hasta': 'Dev', 'Chitra': 'Rakshas', 'Swati': 'Dev',
    'Vishakha': 'Rakshas', 'Anuradha': 'Dev', 'Jyeshtha': 'Rakshas',
    'Mula': 'Rakshas', 'Purva Ashadha': 'Manushya', 'Uttara Ashadha': 'Manushya',
    'Shravana': 'Dev', 'Dhanishta': 'Manushya', 'Shatabhisha': 'Rakshas',
    'Purva Bhadrapada': 'Manushya', 'Uttara Bhadrapada': 'Manushya', 'Revati': 'Dev'
  };
  
  const boyGana = ganaMap[boyNakshatra] || 'Manushya';
  const girlGana = ganaMap[girlNakshatra] || 'Manushya';
  
  let points = 0;
  let description = '';
  
  if (boyGana === girlGana) {
    points = 6;
    description = `Both ${boyGana} Gana - Perfect temperament match`;
  } else if (boyGana === 'Dev' && girlGana === 'Manushya') {
    points = 5;
    description = `Dev boy + Manushya girl - Good temperament match`;
  } else if (boyGana === 'Manushya' && girlGana === 'Dev') {
    points = 5;
    description = `Manushya boy + Dev girl - Good temperament match`;
  } else if (boyGana === 'Dev' && girlGana === 'Rakshas') {
    points = 1;
    description = `Dev boy + Rakshas girl - Poor temperament match`;
  } else if (boyGana === 'Rakshas' && girlGana === 'Dev') {
    points = 0;
    description = `Rakshas boy + Dev girl - Very poor temperament match`;
  } else if (boyGana === 'Manushya' && girlGana === 'Rakshas') {
    points = 2;
    description = `Manushya boy + Rakshas girl - Below average temperament match`;
  } else if (boyGana === 'Rakshas' && girlGana === 'Manushya') {
    points = 2;
    description = `Rakshas boy + Manushya girl - Below average temperament match`;
  }
  
  return {
    name: 'Gana',
    points,
    maxPoints: 6,
    boyValue: boyGana,
    girlValue: girlGana,
    description,
    importance: 'Temperament, nature, behavior, values'
  };
}

/**
 * 7. Bhakoot (7 points) - Love and family harmony
 * Based on Moon sign distance
 */
function calculateBhakoot(boySign, girlSign) {
  const signOrder = [
    'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrishchika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'
  ];
  
  const boyIndex = signOrder.indexOf(boySign);
  const girlIndex = signOrder.indexOf(girlSign);
  
  if (boyIndex === -1 || girlIndex === -1) {
    return {
      name: 'Bhakoot',
      points: 0,
      maxPoints: 7,
      boyValue: boySign,
      girlValue: girlSign,
      description: 'Cannot calculate - Invalid signs',
      importance: 'Love, family harmony, prosperity'
    };
  }
  
  // Count from boy to girl
  let count = (girlIndex - boyIndex + 12) % 12;
  if (count === 0) count = 12;
  
  // Good Bhakoot: 1,2,3,4,5,6,7,8,9,10,11,12
  // Bad Bhakoot: 6-8 (Shadashtak), 9-5 (Navam-Pancham), 12-2 (Dwirdwadas)
  
  let points = 0;
  let description = '';
  
  if (count === 6 || count === 8) {
    points = 0;
    description = `6-8 Bhakoot (Shadashtak) - Serious family/health issues`;
  } else if (count === 9 || count === 5) {
    points = 0;
    description = `9-5 Bhakoot (Navam-Pancham) - Progeny/education issues`;
  } else if (count === 12 || count === 2) {
    points = 0;
    description = `12-2 Bhakoot (Dwirdwadas) - Financial losses`;
  } else {
    points = 7;
    description = `${count} Bhakoot - Excellent love and family harmony`;
  }
  
  return {
    name: 'Bhakoot',
    points,
    maxPoints: 7,
    boyValue: boySign,
    girlValue: girlSign,
    description,
    importance: 'Love, family harmony, prosperity, children'
  };
}

/**
 * 8. Nadi (8 points) - Genetic/health compatibility
 * Based on nakshatra nadis (Aadi, Madhya, Antya)
 */
function calculateNadi(boyChart, girlChart) {
  const boyNakshatra = boyChart.nakshatra?.nakshatra;
  const girlNakshatra = girlChart.nakshatra?.nakshatra;
  
  if (!boyNakshatra || !girlNakshatra) {
    return {
      name: 'Nadi',
      points: 0,
      maxPoints: 8,
      boyValue: 'Unknown',
      girlValue: 'Unknown',
      description: 'Cannot calculate - Nakshatra missing',
      importance: 'Genetic compatibility, health, progeny'
    };
  }
  
  const nadiMap = {
    'Ashwini': 'Aadi', 'Bharani': 'Madhya', 'Krittika': 'Antya',
    'Rohini': 'Antya', 'Mrigashira': 'Madhya', 'Ardra': 'Aadi',
    'Punarvasu': 'Aadi', 'Pushya': 'Madhya', 'Ashlesha': 'Antya',
    'Magha': 'Antya', 'Purva Phalguni': 'Madhya', 'Uttara Phalguni': 'Aadi',
    'Hasta': 'Aadi', 'Chitra': 'Madhya', 'Swati': 'Antya',
    'Vishakha': 'Antya', 'Anuradha': 'Madhya', 'Jyeshtha': 'Aadi',
    'Mula': 'Aadi', 'Purva Ashadha': 'Madhya', 'Uttara Ashadha': 'Antya',
    'Shravana': 'Antya', 'Dhanishta': 'Madhya', 'Shatabhisha': 'Aadi',
    'Purva Bhadrapada': 'Aadi', 'Uttara Bhadrapada': 'Madhya', 'Revati': 'Antya'
  };
  
  const boyNadi = nadiMap[boyNakshatra] || 'Madhya';
  const girlNadi = nadiMap[girlNakshatra] || 'Madhya';
  
  let points = 0;
  let description = '';
  
  if (boyNadi === girlNadi) {
    points = 0;
    description = `Same Nadi (${boyNadi}) - Nadi Dosha! Serious health/genetic issues, progeny problems`;
  } else {
    points = 8;
    description = `${boyNadi} + ${girlNadi} Nadi - Perfect genetic compatibility, healthy progeny`;
  }
  
  return {
    name: 'Nadi',
    points,
    maxPoints: 8,
    boyValue: boyNadi,
    girlValue: girlNadi,
    description,
    importance: 'Genetic compatibility, health, progeny, longevity'
  };
}

/**
 * Check Manglik Dosha
 */
function checkManglik(chart) {
  const mangal = chart.planets?.find(p => p.name === 'Mangal');
  
  if (!mangal || !mangal.house) {
    return {
      isManglik: false,
      houses: [],
      description: 'Cannot determine - Mars position missing'
    };
  }
  
  const manglikHouses = [1, 4, 7, 8, 12];
  const isManglik = manglikHouses.includes(mangal.house.num);
  
  return {
    isManglik,
    houses: isManglik ? [mangal.house.num] : [],
    description: isManglik ? 
      `Manglik Dosha present - Mars in ${mangal.house.num}th house` :
      'No Manglik Dosha'
  };
}
