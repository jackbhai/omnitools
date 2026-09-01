/**
 * Gemstone Recommendations Engine
 * Indian Punjabi Khatri Sharma Pandit Tradition
 * 
 * Based on:
 * - Planetary weaknesses (Shadbala, dignity, house placement)
 * - Benefic/malefic analysis for ascendant
 * - Dasha periods (current and upcoming)
 * - Yoga formations
 * 
 * References:
 * - Garuda Purana
 * - Agni Purana
 * - Brihat Samhita (Varahamihira)
 * - Ratna Pariksha (Gemology texts)
 */

/**
 * Generate gemstone recommendations based on chart analysis
 * @param {Object} chart - Complete chart data
 * @returns {Object} Detailed gemstone recommendations
 */
export function recommendGemstones(chart) {
  const recommendations = {
    primary: [],      // Most important gemstones
    secondary: [],    // Supporting gemstones
    avoid: [],        // Gemstones to avoid
    dashaSpecific: [], // Current dasha recommendations
    general: []       // General wellness stones
  };
  
  const { planets, houses, ascendant, dasha } = chart;
  
  if (!planets || !ascendant) {
    return {
      error: 'Cannot generate recommendations - incomplete chart data',
      recommendations
    };
  }
  
  // Get ascendant lord
  const ascLord = getHouseLord(1, houses);
  
  // Analyze each planet
  for (const planet of planets) {
    const analysis = analyzePlanet(planet, chart);
    
    // Weak benefic planets need strengthening
    if (analysis.isBenefic && analysis.isWeak) {
      recommendations.primary.push(createGemstoneRecommendation(planet, analysis, 'strengthen'));
    }
    
    // Strong benefic planets can be enhanced
    if (analysis.isBenefic && analysis.isStrong && !analysis.isTooStrong) {
      recommendations.secondary.push(createGemstoneRecommendation(planet, analysis, 'enhance'));
    }
    
    // Malefic planets should generally be avoided
    if (analysis.isMalefic && analysis.isStrong) {
      recommendations.avoid.push(createGemstoneRecommendation(planet, analysis, 'avoid'));
    }
    
    // Weak malefic in good houses can be strengthened
    if (analysis.isMalefic && analysis.isWeak && analysis.inGoodHouse) {
      recommendations.secondary.push(createGemstoneRecommendation(planet, analysis, 'balance'));
    }
  }
  
  // Dasha-specific recommendations
  if (dasha && dasha.currentDasha) {
    const dashaPlanet = planets.find(p => p.name === dasha.currentDasha.lord);
    if (dashaPlanet) {
      const dashaAnalysis = analyzePlanet(dashaPlanet, chart);
      if (dashaAnalysis.isBenefic) {
        recommendations.dashaSpecific.push({
          ...createGemstoneRecommendation(dashaPlanet, dashaAnalysis, 'dasha'),
          dashaPeriod: `${dasha.currentDasha.lord} Mahadasha (${dasha.currentDasha.startDate} to ${dasha.currentDasha.endDate})`,
          priority: 'HIGH'
        });
      }
    }
  }
  
  // General wellness stones based on ascendant
  recommendations.general = getGeneralWellnessStones(ascendant.rashiName);
  
  // Sort by priority
  recommendations.primary.sort((a, b) => b.priority - a.priority);
  recommendations.secondary.sort((a, b) => b.priority - a.priority);
  
  return recommendations;
}

/**
 * Analyze a planet's strength and benefic nature
 */
function analyzePlanet(planet, chart) {
  const analysis = {
    isBenefic: false,
    isMalefic: false,
    isWeak: false,
    isStrong: false,
    isTooStrong: false,
    inGoodHouse: false,
    dignity: planet.dignity?.dignity || 'Neutral',
    shadbala: planet.shadbala?.total || 0,
    house: planet.house?.num || 0
  };
  
  // Natural benefics: Jupiter, Venus, Mercury (waxing), Moon (waxing)
  const naturalBenefics = ['Guru', 'Shukra'];
  if (planet.name === 'Budh') {
    // Mercury is benefic unless with malefics
    naturalBenefics.push('Budh');
  }
  if (planet.name === 'Chandra') {
    // Moon is benefic if waxing (within 15 days of New Moon)
    // Simplified: assume benefic unless in debilitation
    naturalBenefics.push('Chandra');
  }
  
  analysis.isBenefic = naturalBenefics.includes(planet.name);
  analysis.isMalefic = !analysis.isBenefic && ['Surya', 'Mangal', 'Shani', 'Rahu', 'Ketu'].includes(planet.name);
  
  // Check dignity
  if (analysis.dignity.includes('Exalted') || analysis.dignity.includes('Own')) {
    analysis.isStrong = true;
    if (analysis.dignity.includes('Exalted')) {
      analysis.isTooStrong = true; // Too strong can be problematic
    }
  } else if (analysis.dignity.includes('Debilitated') || analysis.dignity.includes('Enemy')) {
    analysis.isWeak = true;
  }
  
  // Check Shadbala (if available)
  if (analysis.shadbala > 0) {
    const avgShadbala = 5.0; // Average strength in Rupas
    if (analysis.shadbala < avgShadbala * 0.7) {
      analysis.isWeak = true;
    } else if (analysis.shadbala > avgShadbala * 1.3) {
      analysis.isStrong = true;
    }
  }
  
  // Check house placement
  const goodHouses = [1, 2, 4, 5, 7, 9, 10, 11]; // Kendra + Trikona + 2nd + 11th
  analysis.inGoodHouse = goodHouses.includes(analysis.house);
  
  return analysis;
}

/**
 * Create gemstone recommendation
 */
function createGemstoneRecommendation(planet, analysis, type) {
  const gemstoneData = {
    'Surya': {
      stone: 'Ruby (Manik)',
      hindi: 'माणिक',
      metal: 'Gold',
      finger: 'Ring finger (right hand)',
      weight: '3-5 carats',
      day: 'Sunday',
      time: 'Morning (sunrise to 10 AM)',
      mantra: 'Om Hram Hreem Hroum Sah Suryaya Namah',
      mantraCount: '7000 times',
      price: '₹5,000 - ₹50,000 per carat',
      quality: 'Pigeon blood red, transparent, no cracks',
      benefits: 'Health, vitality, fame, government favor, father relationship',
      alternatives: ['Red Garnet', 'Red Spinel', 'Copper ring']
    },
    'Chandra': {
      stone: 'Pearl (Moti)',
      hindi: 'मोती',
      metal: 'Silver',
      finger: 'Little finger (right hand)',
      weight: '4-6 carats (or 6-8 grams)',
      day: 'Monday',
      time: 'Evening (moonrise)',
      mantra: 'Om Shram Shreem Shraum Sah Chandraya Namah',
      mantraCount: '11000 times',
      price: '₹1,000 - ₹10,000 per carat',
      quality: 'Round, white/cream, lustrous, no blemishes',
      benefits: 'Mental peace, emotions, mother relationship, public life',
      alternatives: ['Moonstone', 'White Coral', 'Silver ring']
    },
    'Mangal': {
      stone: 'Red Coral (Moonga)',
      hindi: 'मूंगा',
      metal: 'Gold or Copper',
      finger: 'Ring finger (right hand)',
      weight: '5-7 carats',
      day: 'Tuesday',
      time: 'Morning (after sunrise)',
      mantra: 'Om Kram Kreem Kroum Sah Bhaumaya Namah',
      mantraCount: '7000 times',
      price: '₹500 - ₹5,000 per carat',
      quality: 'Deep red, smooth, no spots, triangular or oval',
      benefits: 'Courage, energy, victory over enemies, property, siblings',
      alternatives: ['Red Jasper', 'Carnelian', 'Copper ring']
    },
    'Budh': {
      stone: 'Emerald (Panna)',
      hindi: 'पन्ना',
      metal: 'Gold',
      finger: 'Little finger (right hand)',
      weight: '4-6 carats',
      day: 'Wednesday',
      time: 'Morning (after sunrise)',
      mantra: 'Om Bram Breem Broum Sah Budhaya Namah',
      mantraCount: '9000 times',
      price: '₹10,000 - ₹1,00,000 per carat',
      quality: 'Bright green, transparent, no cracks',
      benefits: 'Intelligence, speech, business, education, communication',
      alternatives: ['Peridot', 'Green Tourmaline', 'Jade']
    },
    'Guru': {
      stone: 'Yellow Sapphire (Pukhraj)',
      hindi: 'पुखराज',
      metal: 'Gold',
      finger: 'Index finger (right hand)',
      weight: '5-7 carats',
      day: 'Thursday',
      time: 'Morning (sunrise to 11 AM)',
      mantra: 'Om Gram Greem Groum Sah Gurave Namah',
      mantraCount: '16000 times',
      price: '₹5,000 - ₹50,000 per carat',
      quality: 'Golden yellow, transparent, no flaws',
      benefits: 'Wisdom, wealth, children, husband (for women), spirituality',
      alternatives: ['Yellow Topaz', 'Citrine', 'Yellow Gold ring']
    },
    'Shukra': {
      stone: 'Diamond (Heera)',
      hindi: 'हीरा',
      metal: 'Platinum or White Gold',
      finger: 'Ring finger or Middle finger (right hand)',
      weight: '0.5-1.5 carats',
      day: 'Friday',
      time: 'Morning (after sunrise)',
      mantra: 'Om Dram Dreem Droum Sah Shukraya Namah',
      mantraCount: '16000 times',
      price: '₹50,000 - ₹5,00,000 per carat',
      quality: 'Colorless, brilliant cut, high clarity (VS1+)',
      benefits: 'Love, marriage, luxury, vehicles, arts, beauty',
      alternatives: ['White Sapphire', 'Zircon', 'Opal', 'White Topaz']
    },
    'Shani': {
      stone: 'Blue Sapphire (Neelam)',
      hindi: 'नीलम',
      metal: 'Silver or Iron',
      finger: 'Middle finger (right hand)',
      weight: '4-6 carats',
      day: 'Saturday',
      time: 'Evening (after sunset)',
      mantra: 'Om Pram Preem Proum Sah Shanaischaraya Namah',
      mantraCount: '23000 times',
      price: '₹10,000 - ₹2,00,000 per carat',
      quality: 'Deep blue to violet, transparent, no flaws',
      benefits: 'Discipline, career, longevity, spiritual growth, justice',
      cautions: 'TEST FIRST - wear for 3 days tied to arm. If negative effects, do not wear.',
      alternatives: ['Amethyst', 'Blue Spinel', 'Iolite', 'Iron ring']
    },
    'Rahu': {
      stone: 'Hessonite (Gomed)',
      hindi: 'गोमेद',
      metal: 'Silver',
      finger: 'Middle finger (right hand)',
      weight: '5-7 carats',
      day: 'Saturday (evening)',
      time: 'After sunset',
      mantra: 'Om Bhram Bhreem Bhroum Sah Rahave Namah',
      mantraCount: '18000 times',
      price: '₹1,000 - ₹10,000 per carat',
      quality: 'Honey brown to orange, transparent, honey-like glow',
      benefits: 'Material success, foreign travel, politics, research, occult',
      cautions: 'Can cause sudden changes. Consult astrologer before wearing.',
      alternatives: ['Spessartite Garnet', 'Orange Zircon']
    },
    'Ketu': {
      stone: "Cat's Eye (Lehsunia)",
      hindi: 'लहसुनिया',
      metal: 'Silver or Gold',
      finger: 'Little finger (right hand)',
      weight: '4-6 carats',
      day: 'Tuesday or Thursday',
      time: 'Morning or Evening',
      mantra: 'Om Sram Sreem Sroum Sah Ketave Namah',
      mantraCount: '17000 times',
      price: '₹500 - ₹5,000 per carat',
      quality: 'Chatoyant (cat eye effect), honey/green/brown',
      benefits: 'Spiritual growth, moksha, protection from evil, occult knowledge',
      cautions: 'Can cause detachment. Best for spiritually inclined people.',
      alternatives: ['Tiger Eye', 'Hawk Eye']
    }
  };
  
  const gemData = gemstoneData[planet.name];
  if (!gemData) return null;
  
  let priority = 5; // Default medium priority
  let recommendationType = '';
  let description = '';
  
  switch (type) {
    case 'strengthen':
      priority = 9;
      recommendationType = 'PRIMARY - Must Wear';
      description = `${planet.name} is weak benefic. Wearing ${gemData.stone} will strengthen positive effects.`;
      break;
    case 'enhance':
      priority = 7;
      recommendationType = 'SECONDARY - Recommended';
      description = `${planet.name} is strong benefic. ${gemData.stone} will enhance already positive effects.`;
      break;
    case 'balance':
      priority = 6;
      recommendationType = 'SECONDARY - Conditional';
      description = `${planet.name} is weak malefic in good house. ${gemData.stone} can balance its effects.`;
      break;
    case 'avoid':
      priority = 10;
      recommendationType = 'AVOID - Do Not Wear';
      description = `${planet.name} is strong malefic. Wearing ${gemData.stone} will increase negative effects.`;
      break;
    case 'dasha':
      priority = 10;
      recommendationType = 'DASHA-SPECIFIC - High Priority';
      description = `Current ${planet.name} dasha period. Wearing ${gemData.stone} will maximize dasha benefits.`;
      break;
  }
  
  return {
    planet: planet.name,
    planetHindi: getPlanetHindi(planet.name),
    priority,
    type: recommendationType,
    description,
    ...gemData,
    analysis: {
      dignity: analysis.dignity,
      house: analysis.house,
      shadbala: analysis.shadbala,
      isBenefic: analysis.isBenefic,
      isMalefic: analysis.isMalefic,
      isWeak: analysis.isWeak,
      isStrong: analysis.isStrong
    },
    wearingProcedure: getWearingProcedure(gemData),
    precautions: getPrecautions(planet.name)
  };
}

/**
 * Get general wellness stones based on ascendant
 */
function getGeneralWellnessStones(ascSign) {
  const wellnessStones = {
    'Mesha': [
      { stone: 'Red Coral', benefit: 'Energy and courage' },
      { stone: 'Ruby', benefit: 'Vitality and leadership' }
    ],
    'Vrishabha': [
      { stone: 'Emerald', benefit: 'Communication and business' },
      { stone: 'Diamond', benefit: 'Luxury and relationships' }
    ],
    'Mithuna': [
      { stone: 'Emerald', benefit: 'Intelligence and learning' },
      { stone: 'Citrine', benefit: 'Creativity and expression' }
    ],
    'Karka': [
      { stone: 'Pearl', benefit: 'Emotional balance and mother' },
      { stone: 'Moonstone', benefit: 'Intuition and peace' }
    ],
    'Simha': [
      { stone: 'Ruby', benefit: 'Fame and authority' },
      { stone: 'Yellow Sapphire', benefit: 'Wisdom and children' }
    ],
    'Kanya': [
      { stone: 'Emerald', benefit: 'Health and service' },
      { stone: 'Peridot', benefit: 'Clarity and organization' }
    ],
    'Tula': [
      { stone: 'Diamond', benefit: 'Marriage and partnerships' },
      { stone: 'Opal', benefit: 'Creativity and balance' }
    ],
    'Vrishchika': [
      { stone: 'Red Coral', benefit: 'Courage and transformation' },
      { stone: "Cat's Eye", benefit: 'Spiritual protection' }
    ],
    'Dhanu': [
      { stone: 'Yellow Sapphire', benefit: 'Wisdom and fortune' },
      { stone: 'Topaz', benefit: 'Optimism and expansion' }
    ],
    'Makara': [
      { stone: 'Blue Sapphire', benefit: 'Career and discipline' },
      { stone: 'Amethyst', benefit: 'Spiritual growth' }
    ],
    'Kumbha': [
      { stone: 'Blue Sapphire', benefit: 'Innovation and humanitarian' },
      { stone: 'Amethyst', benefit: 'Detachment and wisdom' }
    ],
    'Meena': [
      { stone: 'Yellow Sapphire', benefit: 'Spirituality and children' },
      { stone: 'Pearl', benefit: 'Compassion and intuition' }
    ]
  };
  
  return wellnessStones[ascSign] || [];
}

/**
 * Get house lord
 */
function getHouseLord(houseNum, houses) {
  const house = houses?.find(h => h.num === houseNum);
  if (!house) return null;
  
  const lordMap = {
    'Mesha': 'Mangal', 'Vrishabha': 'Shukra', 'Mithuna': 'Budh',
    'Karka': 'Chandra', 'Simha': 'Surya', 'Kanya': 'Budh',
    'Tula': 'Shukra', 'Vrishchika': 'Mangal', 'Dhanu': 'Guru',
    'Makara': 'Shani', 'Kumbha': 'Shani', 'Meena': 'Guru'
  };
  
  return lordMap[house.rashi] || null;
}

/**
 * Get planet Hindi name
 */
function getPlanetHindi(planetName) {
  const hindiNames = {
    'Surya': 'सूर्य',
    'Chandra': 'चन्द्र',
    'Mangal': 'मंगल',
    'Budh': 'बुध',
    'Guru': 'गुरु',
    'Shukra': 'शुक्र',
    'Shani': 'शनि',
    'Rahu': 'राहु',
    'Ketu': 'केतु'
  };
  return hindiNames[planetName] || planetName;
}

/**
 * Get wearing procedure
 */
function getWearingProcedure(gemData) {
  return `
1. Purchase on ${gemData.day} morning
2. Clean with Ganga jal, raw milk, honey, and clean water
3. Energize by chanting mantra ${gemData.mantraCount}
4. Set in ${gemData.metal} ring/pendant
5. Wear on ${gemData.finger} on ${gemData.day} during ${gemData.time}
6. Face East or North while wearing
7. Visit temple and offer prayers
8. Donate ${gemData.metal} or related items to poor
  `.trim();
}

/**
 * Get precautions for specific planet
 */
function getPrecautions(planetName) {
  const precautions = {
    'Shani': [
      'NEVER wear without testing first',
      'Tie sapphire to arm for 3 days before wearing',
      'If nightmares, accidents, or illness occur, remove immediately',
      'Do not wear if Saturn is in 1st, 4th, 7th, 8th, or 12th house',
      'Consult astrologer if pregnant or during Sade Sati'
    ],
    'Rahu': [
      'Can cause sudden changes in life',
      'May increase material desires',
      'Avoid if mentally unstable',
      'Do not wear during Rahu dasha if Rahu is malefic',
      'Monitor for 1 week after wearing'
    ],
    'Ketu': [
      'Can cause detachment from worldly life',
      'Best for spiritually inclined people',
      'May reduce material ambitions',
      'Avoid if not ready for spiritual growth',
      'Consult astrologer before wearing'
    ],
    'Mangal': [
      'Can increase aggression and anger',
      'Avoid if Mars is already very strong',
      'Remove during surgical procedures',
      'Do not wear to funerals or hospitals'
    ]
  };
  
  return precautions[planetName] || ['Consult astrologer before wearing', 'Monitor effects for first week'];
}
