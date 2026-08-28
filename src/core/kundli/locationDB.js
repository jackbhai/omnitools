/**
 * Offline Location Database
 * Layer 1: Astronomical Engine - Location handling
 * 
 * Requirements:
 * - Country, state, city, district, major locality
 * - Latitude, longitude
 * - Timezone ID
 * - Aliases and alternate spellings
 * - India-specific detailed coverage
 * 
 * Never pretend city-center coordinates are user's exact birthplace
 * Show exact coordinates used
 */

export const LOCATION_DB_VERSION = '1.0.0';

// Major Indian cities with exact coordinates + timezone
// Sources: GeoNames, Census of India, Survey of India
export const INDIA_LOCATIONS = [
  // Delhi NCR - detailed for Karol Bagh case
  { name: 'Delhi', nameHi: 'दिल्ली', state: 'Delhi', country: 'IN', lat: 28.61, lon: 77.20, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Dilli', 'New Delhi', 'NCT Delhi'], population: 30290000 },
  { name: 'Karol Bagh', nameHi: 'करोल बाग', state: 'Delhi', district: 'Central Delhi', country: 'IN', lat: 28.65, lon: 77.19, tz: 'Asia/Kolkata', type: 'locality', parent: 'Delhi', aliases: ['Karol Bagh', 'Qarol Bagh'], note: 'Exact: 28.65,77.19 vs Delhi generic 28.61,77.20 diff ~0.5° LST ~2 min Lagna ~0.5° - critical for D60' },
  { name: 'Connaught Place', nameHi: 'कनॉट प्लेस', state: 'Delhi', district: 'Central Delhi', country: 'IN', lat: 28.63, lon: 77.21, tz: 'Asia/Kolkata', type: 'locality', parent: 'Delhi' },
  { name: 'Rohini', nameHi: 'रोहिणी', state: 'Delhi', district: 'North West Delhi', country: 'IN', lat: 28.74, lon: 77.08, tz: 'Asia/Kolkata', type: 'locality', parent: 'Delhi' },
  { name: 'Dwarka', nameHi: 'द्वारका', state: 'Delhi', district: 'South West Delhi', country: 'IN', lat: 28.59, lon: 77.04, tz: 'Asia/Kolkata', type: 'locality', parent: 'Delhi' },
  { name: 'Lajpat Nagar', nameHi: 'लाजपत नगर', state: 'Delhi', district: 'South Delhi', country: 'IN', lat: 28.57, lon: 77.24, tz: 'Asia/Kolkata', type: 'locality', parent: 'Delhi' },
  { name: 'Noida', nameHi: 'नोएडा', state: 'Uttar Pradesh', district: 'Gautam Buddha Nagar', country: 'IN', lat: 28.57, lon: 77.32, tz: 'Asia/Kolkata', type: 'city', aliases: ['New Okhla Industrial Development Authority'] },
  { name: 'Gurgaon', nameHi: 'गुड़गांव', state: 'Haryana', district: 'Gurugram', country: 'IN', lat: 28.46, lon: 77.02, tz: 'Asia/Kolkata', type: 'city', aliases: ['Gurugram'] },
  { name: 'Faridabad', nameHi: 'फरीदाबाद', state: 'Haryana', district: 'Faridabad', country: 'IN', lat: 28.40, lon: 77.31, tz: 'Asia/Kolkata', type: 'city' },

  // Maharashtra
  { name: 'Mumbai', nameHi: 'मुंबई', state: 'Maharashtra', country: 'IN', lat: 19.07, lon: 72.87, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Bombay', 'Bambai'], population: 20411000 },
  { name: 'Pune', nameHi: 'पुणे', state: 'Maharashtra', country: 'IN', lat: 18.52, lon: 73.85, tz: 'Asia/Kolkata', type: 'city', aliases: ['Poona'] },
  { name: 'Nagpur', nameHi: 'नागपुर', state: 'Maharashtra', country: 'IN', lat: 21.14, lon: 79.08, tz: 'Asia/Kolkata', type: 'city' },

  // Karnataka
  { name: 'Bangalore', nameHi: 'बेंगलुरु', state: 'Karnataka', country: 'IN', lat: 12.97, lon: 77.59, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Bengaluru', 'Bangaluru'], population: 12300000 },
  { name: 'Mysore', nameHi: 'मैसूर', state: 'Karnataka', country: 'IN', lat: 12.29, lon: 76.63, tz: 'Asia/Kolkata', type: 'city', aliases: ['Mysuru'] },

  // Tamil Nadu
  { name: 'Chennai', nameHi: 'चेन्नई', state: 'Tamil Nadu', country: 'IN', lat: 13.08, lon: 80.27, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Madras'], population: 11000000 },
  { name: 'Coimbatore', nameHi: 'कोयंबटूर', state: 'Tamil Nadu', country: 'IN', lat: 11.01, lon: 76.95, tz: 'Asia/Kolkata', type: 'city' },

  // West Bengal
  { name: 'Kolkata', nameHi: 'कोलकाता', state: 'West Bengal', country: 'IN', lat: 22.57, lon: 88.36, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Calcutta', 'Kalikata'], population: 15000000 },
  { name: 'Howrah', nameHi: 'हावड़ा', state: 'West Bengal', country: 'IN', lat: 22.59, lon: 88.31, tz: 'Asia/Kolkata', type: 'city' },

  // Gujarat
  { name: 'Ahmedabad', nameHi: 'अहमदाबाद', state: 'Gujarat', country: 'IN', lat: 23.02, lon: 72.57, tz: 'Asia/Kolkata', type: 'city', aliases: ['Amdavad'], population: 8000000 },
  { name: 'Surat', nameHi: 'सूरत', state: 'Gujarat', country: 'IN', lat: 21.17, lon: 72.83, tz: 'Asia/Kolkata', type: 'city' },

  // Rajasthan
  { name: 'Jaipur', nameHi: 'जयपुर', state: 'Rajasthan', country: 'IN', lat: 26.91, lon: 75.78, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Pink City'] },
  { name: 'Udaipur', nameHi: 'उदयपुर', state: 'Rajasthan', country: 'IN', lat: 24.58, lon: 73.68, tz: 'Asia/Kolkata', type: 'city' },

  // Uttar Pradesh
  { name: 'Lucknow', nameHi: 'लखनऊ', state: 'Uttar Pradesh', country: 'IN', lat: 26.84, lon: 80.94, tz: 'Asia/Kolkata', type: 'state_capital' },
  { name: 'Kanpur', nameHi: 'कानपुर', state: 'Uttar Pradesh', country: 'IN', lat: 26.44, lon: 80.33, tz: 'Asia/Kolkata', type: 'city' },
  { name: 'Varanasi', nameHi: 'वाराणसी', state: 'Uttar Pradesh', country: 'IN', lat: 25.31, lon: 82.97, tz: 'Asia/Kolkata', type: 'city', aliases: ['Benares', 'Kashi', 'Banaras'] },
  { name: 'Ayodhya', nameHi: 'अयोध्या', state: 'Uttar Pradesh', country: 'IN', lat: 26.79, lon: 82.19, tz: 'Asia/Kolkata', type: 'city', aliases: ['Ayodhya'] },

  // Bihar
  { name: 'Patna', nameHi: 'पटना', state: 'Bihar', country: 'IN', lat: 25.59, lon: 85.13, tz: 'Asia/Kolkata', type: 'state_capital' },

  // Madhya Pradesh
  { name: 'Bhopal', nameHi: 'भोपाल', state: 'Madhya Pradesh', country: 'IN', lat: 23.25, lon: 77.41, tz: 'Asia/Kolkata', type: 'state_capital' },
  { name: 'Indore', nameHi: 'इंदौर', state: 'Madhya Pradesh', country: 'IN', lat: 22.71, lon: 75.85, tz: 'Asia/Kolkata', type: 'city' },

  // Punjab
  { name: 'Chandigarh', nameHi: 'चंडीगढ़', state: 'Chandigarh', country: 'IN', lat: 30.73, lon: 76.77, tz: 'Asia/Kolkata', type: 'state_capital' },
  { name: 'Amritsar', nameHi: 'अमृतसर', state: 'Punjab', country: 'IN', lat: 31.63, lon: 74.87, tz: 'Asia/Kolkata', type: 'city' },
  { name: 'Ludhiana', nameHi: 'लुधियाना', state: 'Punjab', country: 'IN', lat: 30.90, lon: 75.85, tz: 'Asia/Kolkata', type: 'city' },

  // Kerala
  { name: 'Thiruvananthapuram', nameHi: 'तिरुवनंतपुरम', state: 'Kerala', country: 'IN', lat: 8.52, lon: 76.93, tz: 'Asia/Kolkata', type: 'state_capital', aliases: ['Trivandrum'] },
  { name: 'Kochi', nameHi: 'कोच्चि', state: 'Kerala', country: 'IN', lat: 9.93, lon: 76.26, tz: 'Asia/Kolkata', type: 'city', aliases: ['Cochin'] },

  // Telangana, Andhra
  { name: 'Hyderabad', nameHi: 'हैदराबाद', state: 'Telangana', country: 'IN', lat: 17.38, lon: 78.48, tz: 'Asia/Kolkata', type: 'state_capital' },
  { name: 'Visakhapatnam', nameHi: 'विशाखापत्तनम', state: 'Andhra Pradesh', country: 'IN', lat: 17.68, lon: 83.21, tz: 'Asia/Kolkata', type: 'city', aliases: ['Vizag'] },

  // More major cities
  { name: 'Jaipur', state: 'Rajasthan', country: 'IN', lat: 26.91, lon: 75.78, tz: 'Asia/Kolkata', type: 'city' },
  { name: 'Surat', state: 'Gujarat', country: 'IN', lat: 21.17, lon: 72.83, tz: 'Asia/Kolkata', type: 'city' },
  { name: 'Lucknow', state: 'UP', country: 'IN', lat: 26.84, lon: 80.94, tz: 'Asia/Kolkata', type: 'city' },
];

// World major cities
export const WORLD_LOCATIONS = [
  { name: 'New York', country: 'US', state: 'New York', lat: 40.71, lon: -74.00, tz: 'America/New_York', type: 'city' },
  { name: 'London', country: 'GB', state: 'England', lat: 51.50, lon: -0.12, tz: 'Europe/London', type: 'city' },
  { name: 'Dubai', country: 'AE', lat: 25.20, lon: 55.27, tz: 'Asia/Dubai', type: 'city' },
  { name: 'Singapore', country: 'SG', lat: 1.35, lon: 103.81, tz: 'Asia/Singapore', type: 'city' },
  { name: 'Sydney', country: 'AU', lat: -33.86, lon: 151.20, tz: 'Australia/Sydney', type: 'city' },
  { name: 'Toronto', country: 'CA', lat: 43.65, lon: -79.38, tz: 'America/Toronto', type: 'city' },
];

export const ALL_LOCATIONS = [...INDIA_LOCATIONS, ...WORLD_LOCATIONS];

/**
 * Search location database - offline, no API
 * @param {string} query - search term
 * @param {number} limit - max results
 * @returns {Array} matching locations
 */
export function searchLocation(query, limit = 10) {
  if (!query || query.length < 2) return [];
  
  const q = query.toLowerCase().trim();
  
  // Score each location
  const scored = ALL_LOCATIONS.map(loc => {
    let score = 0;
    const nameLower = loc.name.toLowerCase();
    const stateLower = (loc.state || '').toLowerCase();
    
    // Exact match highest
    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 80;
    else if (nameLower.includes(q)) score = 60;
    
    // Alias match
    if (loc.aliases) {
      for (const alias of loc.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower === q) score = Math.max(score, 95);
        else if (aliasLower.startsWith(q)) score = Math.max(score, 75);
        else if (aliasLower.includes(q)) score = Math.max(score, 55);
      }
    }
    
    // State match
    if (stateLower.includes(q)) score = Math.max(score, 30);
    
    // Boost by type and population
    if (score > 0) {
      if (loc.type === 'state_capital') score += 10;
      if (loc.type === 'locality') score += 5;
      if (loc.population) score += Math.log10(loc.population) * 2;
    }
    
    return { ...loc, score };
  }).filter(loc => loc.score > 0);
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  return scored.slice(0, limit);
}

/**
 * Get location by exact coordinates or nearest
 * @param {number} lat 
 * @param {number} lon 
 * @returns {Object} nearest location + distance
 */
export function getLocationByCoords(lat, lon) {
  let nearest = null;
  let minDist = Infinity;
  
  for (const loc of ALL_LOCATIONS) {
    const dist = haversineDistance(lat, lon, loc.lat, loc.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = loc;
    }
  }
  
  return {
    location: nearest,
    distanceKm: minDist,
    isExact: minDist < 1, // within 1km considered exact
    warning: minDist > 50 ? `Coordinates ${lat},${lon} are ${minDist.toFixed(1)}km from nearest known city ${nearest?.name}. For D60 accuracy (0.5°), use exact locality coordinates.` : null,
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Validate coordinates
 * @param {number} lat 
 * @param {number} lon 
 * @returns {Object} { valid, warnings }
 */
export function validateCoordinates(lat, lon) {
  const warnings = [];
  
  if (isNaN(lat) || isNaN(lon)) {
    return { valid: false, warnings: ['Invalid coordinates: not a number'] };
  }
  
  if (lat < -90 || lat > 90) {
    warnings.push(`Latitude ${lat} out of range -90 to 90`);
  }
  
  if (lon < -180 || lon > 180) {
    warnings.push(`Longitude ${lon} out of range -180 to 180`);
  }
  
  if (Math.abs(lat) > 66.5) {
    warnings.push(`Very high latitude ${lat}°: ascendant calculation sensitive, near polar region where some house systems fail. Using equal house system.`);
  }
  
  // Check if coordinates are generic city center vs exact
  const nearest = getLocationByCoords(lat, lon);
  if (nearest.distanceKm < 0.1) {
    warnings.push(`Coordinates appear to be city center of ${nearest.location.name}. For D60 (0.5° accuracy), use exact locality/hospital coordinates. Karol Bagh example: Delhi generic 28.61,77.20 vs Karol Bagh exact 28.65,77.19 diff 0.5° LST ~2 min.`);
  }
  
  return { valid: warnings.length === 0 || warnings.every(w => !w.includes('out of range')), warnings };
}
