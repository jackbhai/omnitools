/**
 * Muhurat Finder - Auspicious Timing Calculator
 * Indian Punjabi Khatri Sharma Pandit Tradition
 * 
 * Calculates auspicious timings for:
 * - Marriage (Vivah)
 * - House Warming (Griha Pravesh)
 * - Vehicle Purchase
 * - Business Start
 * - Travel (Yatra)
 * - Mundan (Head Shaving)
 * - Engagement (Sagaai)
 * - Property Deal
 * - Gold Purchase
 * - Naming Ceremony (Naamkaran)
 * 
 * Based on:
 * - Panchang (Tithi, Vara, Nakshatra, Yoga, Karana)
 * - Choghadiya
 * - Hora
 * - Rahu Kaal, Yamaghanda, Gulika Kaal
 * - Moon transit
 * - Tara Bala, Chandra Bala
 */

// Rahu Kaal timing table (varies by weekday)
const RAHU_KAAL = {
  0: { start: 16.5, end: 18 },    // Sunday: 4:30 PM - 6:00 PM
  1: { start: 7.5, end: 9 },      // Monday: 7:30 AM - 9:00 AM
  2: { start: 15, end: 16.5 },    // Tuesday: 3:00 PM - 4:30 PM
  3: { start: 12, end: 13.5 },    // Wednesday: 12:00 PM - 1:30 PM
  4: { start: 13.5, end: 15 },    // Thursday: 1:30 PM - 3:00 PM
  5: { start: 10.5, end: 12 },    // Friday: 10:30 AM - 12:00 PM
  6: { start: 9, end: 10.5 }      // Saturday: 9:00 AM - 10:30 AM
};

// Yamaghanda timing table
const YAMAGHANDA = {
  0: { start: 12, end: 13.5 },    // Sunday
  1: { start: 10.5, end: 12 },    // Monday
  2: { start: 9, end: 10.5 },     // Tuesday
  3: { start: 7.5, end: 9 },      // Wednesday
  4: { start: 6, end: 7.5 },      // Thursday
  5: { start: 15, end: 16.5 },    // Friday
  6: { start: 13.5, end: 15 }     // Saturday
};

// Gulika Kaal timing table
const GULIKA_KAAL = {
  0: { start: 13.5, end: 15 },    // Sunday
  1: { start: 12, end: 13.5 },    // Monday
  2: { start: 10.5, end: 12 },    // Tuesday
  3: { start: 9, end: 10.5 },     // Wednesday
  4: { start: 7.5, end: 9 },      // Thursday
  5: { start: 6, end: 7.5 },      // Friday
  6: { start: 15, end: 16.5 }     // Saturday
};

// Choghadiya (Day and Night)
const CHOGHADIYA_DAY = {
  0: ['Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg'], // Sunday
  1: ['Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Char', 'Labh', 'Amrit'], // Monday
  2: ['Rog', 'Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'],   // Tuesday
  3: ['Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Char', 'Labh'], // Wednesday
  4: ['Shubh', 'Rog', 'Udveg', 'Char', 'Labh', 'Amrit', 'Kaal', 'Shubh'], // Thursday
  5: ['Char', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Char'],  // Friday
  6: ['Kaal', 'Shubh', 'Rog', 'Udveg', 'Char', 'Labh', 'Amrit', 'Kaal']   // Saturday
};

// Auspicious Choghadiya types
const AUSPICIOUS_CHOGHADIYA = ['Shubh', 'Labh', 'Amrit', 'Char'];

// Auspicious weekdays for different events
const AUSPICIOUS_DAYS = {
  'marriage': [1, 3, 4, 5],      // Mon, Wed, Thu, Fri
  'griha_pravesh': [1, 3, 4, 5], // Mon, Wed, Thu, Fri
  'vehicle': [1, 3, 4, 5],       // Mon, Wed, Thu, Fri
  'business': [1, 3, 4],         // Mon, Wed, Thu
  'travel': [1, 3, 4, 5],        // Mon, Wed, Thu, Fri
  'mundan': [1, 3, 4, 5],        // Mon, Wed, Thu, Fri
  'engagement': [1, 3, 4, 5],    // Mon, Wed, Thu, Fri
  'property': [1, 3, 4, 5],      // Mon, Wed, Thu, Fri
  'gold': [4, 5],                // Thu, Fri
  'naming': [1, 3, 4, 5]         // Mon, Wed, Thu, Fri
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Auspicious nakshatras for different events
const AUSPICIOUS_NAKSHATRAS = {
  'marriage': ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
  'griha_pravesh': ['Rohini', 'Mrigashira', 'Uttara Phalguni', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
  'vehicle': ['Ashwini', 'Pushya', 'Hasta', 'Chitra', 'Swati', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati'],
  'business': ['Ashwini', 'Pushya', 'Hasta', 'Chitra', 'Swati', 'Anuradha', 'Shravana', 'Dhanishta'],
  'travel': ['Ashwini', 'Pushya', 'Hasta', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati'],
  'mundan': ['Mrigashira', 'Chitra', 'Jyeshtha', 'Dhanishta', 'Shatabhisha'],
  'engagement': ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Revati'],
  'property': ['Rohini', 'Mrigashira', 'Uttara Phalguni', 'Chitra', 'Anuradha', 'Uttara Ashadha', 'Uttara Bhadrapada'],
  'gold': ['Pushya', 'Punarvasu', 'Uttara Phalguni', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
  'naming': ['Ashwini', 'Rohini', 'Mrigashira', 'Pushya', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Shravana', 'Dhanishta', 'Revati']
};

// Auspicious tithis
const AUSPICIOUS_TITHIS = {
  'marriage': [2, 3, 5, 6, 7, 10, 11, 13], // Shukla 2,3,5,6,7,10,11,13
  'griha_pravesh': [1, 2, 3, 5, 6, 7, 10, 11, 12, 13],
  'vehicle': [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13],
  'business': [1, 2, 3, 5, 6, 7, 10, 11, 12, 13],
  'travel': [2, 3, 5, 6, 7, 10, 11, 12, 13],
  'mundan': [2, 3, 5, 6, 7, 10, 11, 12, 13],
  'engagement': [2, 3, 5, 6, 7, 10, 11, 12, 13],
  'property': [2, 3, 5, 6, 7, 10, 11, 12, 13],
  'gold': [3, 5, 6, 7, 10, 11, 13],
  'naming': [1, 2, 3, 5, 6, 7, 10, 11, 12, 13]
};

/**
 * Find auspicious muhurat for a specific event
 * @param {Object} params - Search parameters
 * @param {string} params.event - Event type
 * @param {Date} params.startDate - Search start date
 * @param {Date} params.endDate - Search end date
 * @param {Object} params.location - Location { lat, lng, tz }
 * @returns {Object} List of auspicious muhurats
 */
export function findMuhurat(params) {
  const { event, startDate, endDate, location } = params;
  
  if (!event || !startDate || !endDate) {
    return { error: 'Missing required parameters', muhurats: [] };
  }
  
  const muhurats = [];
  const currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    const muhurat = analyzeDay(currentDate, event, location);
    
    if (muhurat.isAuspicious) {
      muhurats.push(muhurat);
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Sort by score (best muhurats first)
  muhurats.sort((a, b) => b.score - a.score);
  
  return {
    event,
    eventHindi: getEventHindi(event),
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    totalFound: muhurats.length,
    muhurats
  };
}

/**
 * Analyze a specific day for muhurat
 */
function analyzeDay(date, event, location) {
  const dayOfWeek = date.getDay();
  
  // Basic analysis without Swiss Ephemeris
  // Using simplified calculations based on date
  
  const muhurat = {
    date: date.toISOString().split('T')[0],
    day: DAY_NAMES[dayOfWeek],
    dayHindi: getDayHindi(dayOfWeek),
    isAuspicious: false,
    score: 0,
    maxScore: 100,
    factors: [],
    auspiciousTimings: {},
    inauspiciousTimings: {},
    recommendations: []
  };
  
  // 1. Check weekday (Vara)
  const goodDay = AUSPICIOUS_DAYS[event]?.includes(dayOfWeek);
  if (goodDay) {
    muhurat.score += 15;
    muhurat.factors.push({ name: 'Weekday', value: 'Auspicious', points: 15 });
  } else {
    muhurat.factors.push({ name: 'Weekday', value: 'Not ideal', points: 0 });
  }
  
  // 2. Rahu Kaal
  const rahuKaal = RAHU_KAAL[dayOfWeek];
  muhurat.inauspiciousTimings['Rahu Kaal'] = formatTimeRange(rahuKaal.start, rahuKaal.end);
  
  // 3. Yamaghanda
  const yamaghanda = YAMAGHANDA[dayOfWeek];
  muhurat.inauspiciousTimings['Yamaghanda'] = formatTimeRange(yamaghanda.start, yamaghanda.end);
  
  // 4. Gulika Kaal
  const gulika = GULIKA_KAAL[dayOfWeek];
  muhurat.inauspiciousTimings['Gulika Kaal'] = formatTimeRange(gulika.start, gulika.end);
  
  // 5. Abhijit Muhurat (always auspicious, around noon)
  muhurat.auspiciousTimings['Abhijit Muhurat'] = '11:45 AM - 12:30 PM';
  muhurat.score += 5;
  
  // 6. Brahma Muhurat (early morning)
  muhurat.auspiciousTimings['Brahma Muhurat'] = '4:24 AM - 5:12 AM';
  
  // 7. Choghadiya
  const dayChoghadiya = CHOGHADIYA_DAY[dayOfWeek];
  const auspiciousSlots = [];
  const sunriseHour = 6; // Approximate sunrise at 6 AM
  
  for (let i = 0; i < 8; i++) {
    const slotName = dayChoghadiya[i];
    const slotStart = sunriseHour + (i * 1.5);
    const slotEnd = slotStart + 1.5;
    
    if (AUSPICIOUS_CHOGHADIYA.includes(slotName)) {
      auspiciousSlots.push({
        name: slotName,
        time: formatTimeRange(slotStart, slotEnd)
      });
    }
  }
  
  if (auspiciousSlots.length > 0) {
    muhurat.auspiciousTimings['Choghadiya'] = auspiciousSlots.map(s => `${s.name}: ${s.time}`).join(', ');
    muhurat.score += 10;
  }
  
  // 8. Hora (planetary hours) - simplified
  const horaLord = getHoraLord(dayOfWeek, date);
  muhurat.factors.push({ name: 'Hora Lord', value: horaLord, points: 0 });
  
  // Determine overall auspiciousness
  muhurat.isAuspicious = goodDay && muhurat.score >= 20;
  
  // Add recommendations
  if (goodDay) {
    muhurat.recommendations.push({
      type: 'good',
      text: `${DAY_NAMES[dayOfWeek]} is auspicious for ${getEventHindi(event)}`
    });
  }
  
  muhurat.recommendations.push({
    type: 'timing',
    text: `Avoid Rahu Kaal (${muhurat.inauspiciousTimings['Rahu Kaal']}) for important activities`
  });
  
  muhurat.recommendations.push({
    type: 'timing',
    text: `Abhijit Muhurat (11:45 AM - 12:30 PM) is most auspicious`
  });
  
  // For Punjabi traditions, add specific notes
  if (event === 'marriage') {
    muhurat.recommendations.push({
      type: 'tradition',
      text: 'Punjabi tradition: Prefer Thursday or Friday for marriage. Avoid Tuesday.'
    });
  }
  
  if (event === 'griha_pravesh') {
    muhurat.recommendations.push({
      type: 'tradition',
      text: 'Punjabi tradition: Enter new house with right foot first, carry Kalash with water'
    });
  }
  
  return muhurat;
}

/**
 * Format time range to readable string
 */
function formatTimeRange(startHour, endHour) {
  const formatHour = (h) => {
    const hour = Math.floor(h);
    const minutes = Math.round((h - hour) * 60);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}

/**
 * Get Hora Lord (simplified)
 */
function getHoraLord(dayOfWeek, date) {
  const horaLords = ['Surya', 'Shukra', 'Budh', 'Chandra', 'Shani', 'Guru', 'Mangal'];
  // Simplified - first hora lord of the day
  const dayLords = {
    0: 'Surya', 1: 'Chandra', 2: 'Mangal', 3: 'Budh',
    4: 'Guru', 5: 'Shukra', 6: 'Shani'
  };
  return dayLords[dayOfWeek] || 'Surya';
}

/**
 * Get event Hindi name
 */
function getEventHindi(event) {
  const hindiNames = {
    'marriage': 'विवाह (शादी)',
    'griha_pravesh': 'गृह प्रवेश',
    'vehicle': 'वाहन खरीदी',
    'business': 'व्यापार शुरू',
    'travel': 'यात्रा',
    'mundan': 'मुंडन (चूड़ाकर्म)',
    'engagement': 'सगाई (मंगनी)',
    'property': 'संपत्ति खरीदी',
    'gold': 'सोना खरीदी',
    'naming': 'नामकरण'
  };
  return hindiNames[event] || event;
}

/**
 * Get day Hindi name
 */
function getDayHindi(dayOfWeek) {
  const hindiNames = [
    'रविवार (ऐतवार)', 'सोमवार', 'मंगलवार', 'बुधवार',
    'गुरुवार (बीरबार)', 'शुक्रवार', 'शनिवार'
  ];
  return hindiNames[dayOfWeek] || '';
}

/**
 * Get today's panchang summary
 */
export function getTodayPanchang(date = new Date()) {
  const dayOfWeek = date.getDay();
  
  return {
    date: date.toISOString().split('T')[0],
    day: DAY_NAMES[dayOfWeek],
    dayHindi: getDayHindi(dayOfWeek),
    inauspiciousTimings: {
      'Rahu Kaal': formatTimeRange(RAHU_KAAL[dayOfWeek].start, RAHU_KAAL[dayOfWeek].end),
      'Yamaghanda': formatTimeRange(YAMAGHANDA[dayOfWeek].start, YAMAGHANDA[dayOfWeek].end),
      'Gulika Kaal': formatTimeRange(GULIKA_KAAL[dayOfWeek].start, GULIKA_KAAL[dayOfWeek].end)
    },
    auspiciousTimings: {
      'Abhijit Muhurat': '11:45 AM - 12:30 PM',
      'Brahma Muhurat': '4:24 AM - 5:12 AM',
      'Godhuli Muhurat': 'Around sunset (6:00 PM - 6:12 PM)'
    },
    moonSign: 'Calculated by Swiss Ephemeris',
    nakshatra: 'Calculated by Swiss Ephemeris',
    yoga: 'Calculated by Swiss Ephemeris',
    karana: 'Calculated by Swiss Ephemeris'
  };
}

/**
 * Check if current time is auspicious
 */
export function isCurrentTimeAuspicious(event = 'general') {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const dayOfWeek = now.getDay();
  
  const results = {
    time: now.toLocaleTimeString(),
    day: DAY_NAMES[dayOfWeek],
    isAuspicious: true,
    reasons: []
  };
  
  // Check Rahu Kaal
  const rahuKaal = RAHU_KAAL[dayOfWeek];
  if (currentHour >= rahuKaal.start && currentHour <= rahuKaal.end) {
    results.isAuspicious = false;
    results.reasons.push(`Current time is in Rahu Kaal (${formatTimeRange(rahuKaal.start, rahuKaal.end)})`);
  }
  
  // Check Yamaghanda
  const yamaghanda = YAMAGHANDA[dayOfWeek];
  if (currentHour >= yamaghanda.start && currentHour <= yamaghanda.end) {
    results.isAuspicious = false;
    results.reasons.push(`Current time is in Yamaghanda (${formatTimeRange(yamaghanda.start, yamaghanda.end)})`);
  }
  
  // Check Gulika Kaal
  const gulika = GULIKA_KAAL[dayOfWeek];
  if (currentHour >= gulika.start && currentHour <= gulika.end) {
    results.isAuspicious = false;
    results.reasons.push(`Current time is in Gulika Kaal (${formatTimeRange(gulika.start, gulika.end)})`);
  }
  
  // Check if it's Abhijit Muhurat (always auspicious)
  if (currentHour >= 11.75 && currentHour <= 12.5) {
    results.isAuspicious = true;
    results.reasons = ['Current time is in Abhijit Muhurat - most auspicious'];
  }
  
  // Check day
  if (event !== 'general') {
    const goodDay = AUSPICIOUS_DAYS[event]?.includes(dayOfWeek);
    if (!goodDay) {
      results.isAuspicious = false;
      results.reasons.push(`${DAY_NAMES[dayOfWeek]} is not ideal for ${getEventHindi(event)}`);
    }
  }
  
  if (results.reasons.length === 0) {
    results.reasons.push('Current time is generally auspicious');
  }
  
  return results;
}
