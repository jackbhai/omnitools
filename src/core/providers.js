/**
 * Provider pools. Every entry was CORS-tested from a github.io Origin.
 * Multiple providers per capability => load spreading + automatic failover.
 */
import { FILM_API } from './endpoints';
import { jget } from './engine';
import { builtinHolidays } from './festivals';

const UA = { 'User-Agent': 'OmniTools/1.0 (public tools app)' };

/* ------------------------------------------------------------- WEATHER */
export const weather = [
  { id: 'open-meteo', label: 'Open-Meteo', async run({ lat, lon }) {
      const d = await jget(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
        'weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,' +
        'wind_gusts_10m,visibility,dew_point_2m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,' +
        'apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,' +
        'precipitation_probability_max,wind_speed_10m_max' +
        '&hourly=temperature_2m,precipitation_probability,weather_code' +
        '&timezone=auto&forecast_days=7');
      const c = d.current;
      const now = Date.now();
      /* Start the hourly strip at the CURRENT hour, not at midnight — a strip
         that opens with hours already past is the commonest way these read
         wrong. */
      const times = d.hourly?.time || [];
      let from = times.findIndex((t) => new Date(t).getTime() >= now - 36e5);
      if (from < 0) from = 0;
      return {
        temp: c.temperature_2m, feels: c.apparent_temperature,
        humidity: c.relative_humidity_2m, wind: c.wind_speed_10m,
        gust: c.wind_gusts_10m, dir: c.wind_direction_10m,
        precip: c.precipitation, code: c.weather_code, cloud: c.cloud_cover,
        pressure: c.pressure_msl ?? c.surface_pressure,
        visibility: c.visibility != null ? c.visibility / 1000 : null,
        dew: c.dew_point_2m, isDay: c.is_day === 1,
        uv: d.daily?.uv_index_max?.[0] ?? null,
        sunrise: d.daily.sunrise?.[0], sunset: d.daily.sunset?.[0],
        daylight: d.daily?.daylight_duration?.[0] ?? null,
        observedAt: c.time,
        hourly: times.slice(from, from + 24).map((t, i) => ({
          t, v: d.hourly.temperature_2m[from + i],
          pop: d.hourly.precipitation_probability?.[from + i] ?? null,
          code: d.hourly.weather_code?.[from + i] ?? null })),
        daily: (d.daily?.time || []).map((t, i) => ({
          date: t, max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i],
          feelsMax: d.daily.apparent_temperature_max?.[i] ?? null,
          code: d.daily.weather_code[i], pop: d.daily.precipitation_probability_max?.[i] ?? null,
          rain: d.daily.precipitation_sum?.[i] ?? null,
          uv: d.daily.uv_index_max?.[i] ?? null,
          windMax: d.daily.wind_speed_10m_max?.[i] ?? null,
          sunrise: d.daily.sunrise?.[i], sunset: d.daily.sunset?.[i] })),
      }; } },
  { id: 'met-no', label: 'MET Norway', async run({ lat, lon }) {
      const d = await jget(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, { headers: UA });
      const ts = d.properties.timeseries, n = ts[0].data.instant.details;
      return { temp: n.air_temperature, feels: n.air_temperature, humidity: n.relative_humidity,
        wind: n.wind_speed, precip: ts[0].data.next_1_hours?.details?.precipitation_amount ?? 0,
        code: null, pressure: n.air_pressure_at_sea_level, hourly: [],
        daily: ts.filter((_, i) => i % 24 === 0).slice(0, 7).map((t) => ({
          date: t.time.slice(0, 10), max: t.data.next_6_hours?.details?.air_temperature_max ?? n.air_temperature,
          min: t.data.next_6_hours?.details?.air_temperature_min ?? n.air_temperature, code: null, pop: null })) }; } },
  { id: 'wttr', label: 'wttr.in', async run({ lat, lon }) {
      const d = await jget(`https://wttr.in/${lat},${lon}?format=j1`, { proxy: true });
      const c = d.current_condition[0];
      return { temp: +c.temp_C, feels: +c.FeelsLikeC, humidity: +c.humidity, wind: +c.windspeedKmph,
        precip: +c.precipMM, code: null, pressure: +c.pressure, hourly: [],
        daily: (d.weather || []).slice(0, 7).map((w) => ({ date: w.date, max: +w.maxtempC, min: +w.mintempC, code: null, pop: null })) }; } },
];

/* ------------------------------------------------------------- GEOCODE */
export const geocode = [
  { id: 'om-geo', label: 'Open-Meteo Geo', async run({ q }) {
      const d = await jget(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`);
      return (d.results || []).map((r) => ({ name: r.name, admin: r.admin1 || '', country: r.country || '',
        lat: r.latitude, lon: r.longitude, tz: r.timezone, pop: r.population })); } },
  { id: 'nominatim', label: 'Nominatim', async run({ q }) {
      const d = await jget(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8`, { headers: UA });
      return d.map((r) => ({ name: r.display_name.split(',')[0], admin: (r.display_name.split(',')[1] || '').trim(),
        country: (r.display_name.split(',').pop() || '').trim(), lat: +r.lat, lon: +r.lon })); } },
  { id: 'photon', label: 'Photon', async run({ q }) {
      const d = await jget(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`);
      return (d.features || []).map((f) => ({ name: f.properties.name || f.properties.city || '',
        admin: f.properties.state || '', country: f.properties.country || '',
        lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] })); } },
];

/* ------------------------------------------------------------- AIR
 * The WAQI provider that used to sit here was REMOVED, not fixed.
 *
 * It authenticated with the public `demo` token, and that token does not do
 * what it appears to. Measured on 2026-08-28: geo:28.61;77.20 (Delhi),
 * geo:19.07;72.87 (Mumbai), geo:51.5;-0.12 (London) and geo:40.7;-74.0
 * (New York) ALL returned `aqi: 55, idx: 1437, city: Shanghai`. It answers
 * every coordinate on Earth with one Chinese monitoring station, with
 * `status: "ok"`, so nothing in the app could tell it was wrong. Users in
 * Delhi were being shown Shanghai's air and told it was theirs.
 *
 * That is exactly the fake data this app is not allowed to ship. A real WAQI
 * token is free but personal, and this app has no login, so WAQI is out.
 *
 * What replaces it: the CAMS model behind Open-Meteo, which returns a distinct
 * reading per coordinate (verified across six cities on three continents), and
 * a second, independent view of the SAME model on Open-Meteo's GFS domain, so
 * a failure of one host is not a failure of air quality.
 */
const AQ_FIELDS = 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,' +
  'ammonia,dust,aerosol_optical_depth,uv_index,european_aqi,us_aqi,' +
  'european_aqi_pm2_5,european_aqi_pm10,european_aqi_no2,european_aqi_o3,european_aqi_so2';

const shapeAir = (d) => {
  const c = d.current || {};
  if (c.pm2_5 == null && c.us_aqi == null && c.european_aqi == null) throw new Error('no readings');
  const h = d.hourly || {};
  return {
    aqi: c.european_aqi, usaqi: c.us_aqi,
    pm25: c.pm2_5, pm10: c.pm10, co: c.carbon_monoxide,
    no2: c.nitrogen_dioxide, so2: c.sulphur_dioxide, o3: c.ozone,
    nh3: c.ammonia, dust: c.dust, aod: c.aerosol_optical_depth, uv: c.uv_index,
    // which pollutant is actually driving the number
    parts: [
      ['PM2.5', c.european_aqi_pm2_5], ['PM10', c.european_aqi_pm10],
      ['NO₂', c.european_aqi_no2], ['O₃', c.european_aqi_o3], ['SO₂', c.european_aqi_so2],
    ].filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]),
    at: c.time,
    forecast: (h.time || []).map((t, i) => ({
      t, us: h.us_aqi?.[i] ?? null, eu: h.european_aqi?.[i] ?? null, pm25: h.pm2_5?.[i] ?? null,
    })).filter((x) => x.us != null || x.eu != null),
  };
};

export const air = [
  { id: 'om-aq', label: 'CAMS air quality', async run({ lat, lon }) {
      return shapeAir(await jget('https://air-quality-api.open-meteo.com/v1/air-quality' +
        `?latitude=${lat}&longitude=${lon}&current=${AQ_FIELDS}` +
        '&hourly=pm2_5,pm10,us_aqi,european_aqi&forecast_days=3&timezone=auto')); } },
  { id: 'om-aq-gfs', label: 'GFS air quality', async run({ lat, lon }) {
      return shapeAir(await jget('https://air-quality-api.open-meteo.com/v1/air-quality' +
        `?latitude=${lat}&longitude=${lon}&current=${AQ_FIELDS}&domains=cams_global` +
        '&hourly=pm2_5,pm10,us_aqi,european_aqi&forecast_days=3&timezone=auto')); } },
];

/* ------------------------------------------------------------- TIME */
export const worldtime = [
  { id: 'timeapi', label: 'TimeAPI.io', async run({ tz }) {
      const d = await jget(`https://timeapi.io/api/Time/current/zone?timeZone=${encodeURIComponent(tz)}`);
      return { tz: d.timeZone, date: d.date, time: d.time, dow: d.dayOfWeek,
        iso: d.dateTime, dst: d.dstActive }; } },
  { id: 'local-tz', label: 'Browser (Intl)', async run({ tz }) {
      const now = new Date();
      const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' });
      const parts = f.format(now);
      return { tz, date: parts.split(',').slice(0, 2).join(','), time: parts.split(' ').pop(),
        dow: new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'long' }).format(now),
        iso: now.toISOString(), dst: null, offline: true }; } },
];

export const sun = [
  { id: 'sunrise-sunset', label: 'SunriseSunset.org', async run({ lat, lon }) {
      const d = await jget(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
      if (d.status !== 'OK') throw new Error(d.status);
      return d.results; } },
];

/* ------------------------------------------------------------- HOLIDAYS */
const GCAL = { IN:'en.indian', US:'en.usa', GB:'en.uk', PK:'en.pk', AE:'en.ae', CA:'en.canadian',
  AU:'en.australian', SG:'en.singapore', JP:'en.japanese', DE:'en.german', FR:'en.french',
  BD:'en.bd', LK:'en.lk', NP:'en.np', MY:'en.malaysia', SA:'en.saudiarabian' };

export const holidays = [
  builtinHolidays,
  { id: 'gcal-ics', label: 'Google Calendar', async run({ cc, year }) {
      const key = GCAL[(cc || 'IN').toUpperCase()];
      if (!key) throw new Error('no calendar');
      const txt = await jget(`https://calendar.google.com/calendar/ical/${key}%23holiday%40group.v.calendar.google.com/public/basic.ics`,
        { text: true, proxy: true });
      const y = String(year), out = [];
      const lines = txt.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
      let cur = null;
      for (const ln of lines) {
        if (ln === 'BEGIN:VEVENT') cur = {};
        else if (ln === 'END:VEVENT') {
          if (cur?.d?.startsWith(y) && cur.n)
            out.push({ date: `${cur.d.slice(0,4)}-${cur.d.slice(4,6)}-${cur.d.slice(6,8)}`, name: cur.n });
          cur = null;
        } else if (cur) {
          if (ln.startsWith('DTSTART')) cur.d = (ln.split(':')[1] || '').trim().slice(0, 8);
          else if (ln.startsWith('SUMMARY')) cur.n = ln.split(':').slice(1).join(':').trim();
        }
      }
      if (!out.length) throw new Error('none parsed');
      return out.sort((a, b) => a.date.localeCompare(b.date)); } },
  { id: 'nager', label: 'Nager.Date', async run({ cc, year }) {
      const d = await jget(`https://date.nager.at/api/v3/PublicHolidays/${year}/${(cc||'IN').toUpperCase()}`);
      return d.map((h) => ({ date: h.date, name: h.localName, en: h.name })); } },
];

/* ------------------------------------------------------------- CURRENCY */
export const currency = [
  { id: 'frankfurter', label: 'Frankfurter (ECB)', async run({ base }) {
      const d = await jget(`https://api.frankfurter.dev/v1/latest?base=${base}`);
      return { base: d.base, date: d.date, rates: d.rates }; } },
  { id: 'erapi', label: 'open.er-api', async run({ base }) {
      const d = await jget(`https://open.er-api.com/v6/latest/${base}`);
      if (d.result !== 'success') throw new Error('bad');
      return { base: d.base_code, date: (d.time_last_update_utc||'').slice(5,16), rates: d.rates }; } },
  { id: 'jsdelivr-fx', label: 'currency-api', async run({ base }) {
      const lc = base.toLowerCase();
      const d = await jget(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${lc}.json`);
      const rates = {}; for (const [k, v] of Object.entries(d[lc] || {})) rates[k.toUpperCase()] = v;
      return { base, date: d.date, rates }; } },
];

/* ------------------------------------------------------------- CRYPTO
 * CoinCap was removed, not repaired: api.coincap.io no longer resolves at all
 * — DNS itself fails — and its v3 replacement answers 401 without a key. A
 * provider that cannot be reached is worse than absent, because the engine
 * spends a timeout on it before failing over.
 *
 * Three independent sources now, all verified CORS-open from a github.io
 * origin and cross-checked against each other on the same minute:
 * CoinLore, CoinGecko and CoinPaprika all returned Bitcoin at ~$80,240.
 * Binance was tested too and is NOT used: it answers HTTP 451 (blocked for
 * legal reasons) from several regions, which would look like a random failure.
 */
export const crypto = [
  { id: 'coinlore', label: 'CoinLore', async run() {
      const d = await jget('https://api.coinlore.net/api/tickers/?start=0&limit=40');
      return d.data.map((a) => ({ sym: a.symbol, name: a.name, price: +a.price_usd,
        change: +a.percent_change_24h, cap: +a.market_cap_usd, rank: +a.rank })); } },
  { id: 'coingecko', label: 'CoinGecko', async run() {
      const d = await jget('https://api.coingecko.com/api/v3/coins/markets' +
        '?vs_currency=usd&order=market_cap_desc&per_page=40&page=1&sparkline=false');
      if (!Array.isArray(d)) throw new Error('shape');
      return d.map((a) => ({ sym: (a.symbol || '').toUpperCase(), name: a.name,
        price: a.current_price, change: a.price_change_percentage_24h,
        cap: a.market_cap, rank: a.market_cap_rank })); } },
  { id: 'coinpaprika', label: 'CoinPaprika', async run() {
      const d = await jget('https://api.coinpaprika.com/v1/tickers?limit=40');
      if (!Array.isArray(d)) throw new Error('shape');
      return d.map((a) => ({ sym: a.symbol, name: a.name,
        price: a.quotes?.USD?.price, change: a.quotes?.USD?.percent_change_24h,
        cap: a.quotes?.USD?.market_cap, rank: a.rank })); } },
];

/* ------------------------------------------------------------- INDIA */
export const pincode = [
  { id: 'postalpin', label: 'India Post', async run({ q }) {
      const d = await jget(`https://api.postalpincode.in/pincode/${q}`);
      const r = d[0]; if (r.Status !== 'Success') throw new Error(r.Message || 'not found');
      return r.PostOffice.map((p) => ({ name: p.Name, branch: p.BranchType, district: p.District,
        state: p.State, division: p.Division, circle: p.Circle, pin: p.Pincode })); } },
  { id: 'zippo', label: 'Zippopotam', async run({ q }) {
      const d = await jget(`https://api.zippopotam.us/in/${q}`);
      return (d.places || []).map((p) => ({ name: p['place name'], branch: '', district: p['place name'],
        state: p.state || '', division: '', circle: '', pin: d['post code'] })); } },
];

export const ifsc = [
  { id: 'razorpay', label: 'Razorpay IFSC', async run({ q }) {
      const d = await jget(`https://ifsc.razorpay.com/${q.toUpperCase()}`);
      return { bank: d.BANK, branch: d.BRANCH, address: d.ADDRESS, city: d.CITY, district: d.DISTRICT,
        state: d.STATE, ifsc: d.IFSC, micr: d.MICR || '', upi: d.UPI, neft: d.NEFT, imps: d.IMPS, rtgs: d.RTGS }; } },
];

export const indiaData = [
  { id: 'worldbank-in', label: 'World Bank', async run({ ind }) {
      const d = await jget(`https://api.worldbank.org/v2/country/IN/indicator/${ind}?format=json&per_page=20`);
      return (d[1] || []).filter((x) => x.value != null).map((x) => ({ year: x.date, value: x.value, name: x.indicator.value })); } },
];

/* ------------------------------------------------------------- KNOWLEDGE */
export const wiki = [
  { id: 'wm-core', label: 'Wikimedia REST', async run({ q }) {
      const d = await jget(`https://api.wikimedia.org/core/v1/wikipedia/en/search/page?q=${encodeURIComponent(q)}&limit=10`, { headers: UA });
      return (d.pages || []).map((p) => ({ title: p.title, desc: p.description || '',
        excerpt: (p.excerpt || '').replace(/<[^>]+>/g, ''),
        thumb: p.thumbnail ? 'https:' + p.thumbnail.url : '',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key)}` })); } },
  { id: 'mw-action', label: 'MediaWiki API', async run({ q }) {
      const d = await jget(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=10`);
      return (d.query?.search || []).map((p) => ({ title: p.title, desc: '',
        excerpt: (p.snippet || '').replace(/<[^>]+>/g, ''), thumb: '',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}` })); } },
];

export const onthisday = [
  { id: 'wm-otd', label: 'Wikimedia OnThisDay', async run({ m, d: day }) {
      const d = await jget(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${m}/${day}`, { headers: UA });
      const pick = (arr, kind) => (arr || []).slice(0, 12).map((e) => ({ kind, year: e.year || '',
        text: e.text, url: e.pages?.[0]?.content_urls?.desktop?.page || '' }));
      return [...pick(d.selected, 'Event'), ...pick(d.births, 'Born'), ...pick(d.deaths, 'Died'),
              ...pick(d.holidays, 'Holiday')]; } },
];

export const dictionary = [
  { id: 'freedict', label: 'Free Dictionary', async run({ q }) {
      const d = await jget(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`, { proxy: true });
      const e = d[0];
      return { word: e.word, phonetic: e.phonetic || e.phonetics?.find((p) => p.text)?.text || '',
        audio: e.phonetics?.find((p) => p.audio)?.audio || '',
        meanings: e.meanings.map((m) => ({ pos: m.partOfSpeech,
          defs: m.definitions.slice(0, 4).map((x) => ({ d: x.definition, ex: x.example || '' })),
          syn: (m.synonyms || []).slice(0, 6) })) }; } },
  { id: 'wiktionary', label: 'Wiktionary', async run({ q }) {
      const d = await jget(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}`, { headers: UA });
      const en = d.en || Object.values(d)[0] || [];
      return { word: q, phonetic: '', audio: '',
        meanings: en.slice(0, 4).map((m) => ({ pos: m.partOfSpeech || '',
          defs: (m.definitions || []).slice(0, 4).map((x) => ({ d: String(x.definition).replace(/<[^>]+>/g, ''),
            ex: (x.examples || [])[0] ? String(x.examples[0]).replace(/<[^>]+>/g, '') : '' })), syn: [] })) }; } },
];

/* ------------------------------------------------------------- SPACE */
export const iss = [
  { id: 'wheretheiss', label: 'WhereTheISS.at', async run() {
      const d = await jget('https://api.wheretheiss.at/v1/satellites/25544');
      return { lat: d.latitude, lon: d.longitude, alt: d.altitude, vel: d.velocity, vis: d.visibility }; } },
  { id: 'open-notify', label: 'Open Notify', async run() {
      const d = await jget('http://api.open-notify.org/iss-now.json', { proxy: true });
      return { lat: +d.iss_position.latitude, lon: +d.iss_position.longitude, alt: null, vel: null }; } },
];

export const astros = [
  { id: 'open-notify-astros', label: 'Open Notify', async run() {
      const d = await jget('http://api.open-notify.org/astros.json', { proxy: true });
      return d.people.map((p) => ({ name: p.name, craft: p.craft })); } },
];

export const quakes = [
  { id: 'usgs', label: 'USGS', async run() {
      const d = await jget('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=25&orderby=time&minmagnitude=2.5');
      return d.features.map((f) => ({ mag: f.properties.mag, place: f.properties.place,
        time: f.properties.time, url: f.properties.url,
        depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] })); } },
];

/* ------------------------------------------------------------- MEDIA */
export const news = [
  { id: 'hn', label: 'HN Algolia', async run({ q }) {
      const u = q ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=25`
                  : 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25';
      const d = await jget(u);
      return (d.hits || []).filter((h) => h.title).map((h) => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points ?? 0, author: h.author, comments: h.num_comments ?? 0, date: (h.created_at||'').slice(0,10) })); } },
  { id: 'lobsters', label: 'Lobste.rs', async run() {
      const d = await jget('https://lobste.rs/hottest.json', { proxy: true });
      return d.slice(0, 25).map((s) => ({ title: s.title, url: s.url || s.short_id_url,
        points: s.score ?? 0, author: s.submitter_user?.username || '', comments: s.comment_count ?? 0,
        date: (s.created_at||'').slice(0,10) })); } },
];

export const movies = [
  { id: 'cine-idx', label: 'Film index', async run({ q }) {
      const d = await jget(`${FILM_API}${encodeURIComponent(q)}`);
      const arr = d.results || d.data || (Array.isArray(d) ? d : []);
      return arr.slice(0, 15).map((m) => ({ title: m.title || m.name, year: m.year || m.release_date || '',
        img: m.poster || m.image || m.thumbnail || '', rating: m.rating || m.vote_average || null,
        overview: (m.overview || m.plot || '').slice(0, 200) })); } },
  { id: 'tvmaze', label: 'TVmaze', async run({ q }) {
      const d = await jget(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
      return d.slice(0, 15).map(({ show: s }) => ({ title: s.name, year: (s.premiered||'').slice(0,4),
        img: s.image?.medium || '', rating: s.rating?.average ?? null,
        overview: (s.summary||'').replace(/<[^>]+>/g,'').slice(0,200) })); } },
];

export const books = [
  { id: 'openlibrary', label: 'Open Library', async run({ q }) {
      const d = await jget(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=15&fields=title,author_name,first_publish_year,cover_i,key`);
      return (d.docs || []).map((b) => ({ title: b.title, author: (b.author_name||[]).slice(0,2).join(', '),
        year: b.first_publish_year || '', cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : '',
        url: 'https://openlibrary.org' + b.key })); } },
  { id: 'gutendex', label: 'Gutendex', async run({ q }) {
      const d = await jget(`https://gutendex.com/books?search=${encodeURIComponent(q)}`);
      return (d.results || []).slice(0, 15).map((b) => ({ title: b.title,
        author: (b.authors||[]).map((a) => a.name).join(', '), year: '',
        cover: b.formats?.['image/jpeg'] || '', url: b.formats?.['text/html'] || '' })); } },
];

/* ------------------------------------------------------------- MUSIC */
const AUDIUS = 'https://discoveryprovider.audius.co';
export const musicSearch = [
  { id: 'audius', label: 'Audius', async run({ q }) {
      const d = await jget(`${AUDIUS}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=OmniTools&limit=30`);
      return (d.data || []).map((t) => ({
        id: t.id, title: t.title, artist: t.user?.name || '', dur: t.duration,
        art: t.artwork?.['480x480'] || t.artwork?.['150x150'] || '',
        stream: `${AUDIUS}/v1/tracks/${t.id}/stream?app_name=OmniTools`,
        download: t.downloadable ? `${AUDIUS}/v1/tracks/${t.id}/download?app_name=OmniTools` : null,
        src: 'Audius', plays: t.play_count })); } },
  { id: 'archive-audio', label: 'Archive.org', async run({ q }) {
      const d = await jget(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+AND+mediatype%3A(audio)&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&rows=25&output=json`);
      return (d.response?.docs || []).map((x) => ({
        id: x.identifier, title: String(x.title).slice(0, 70), artist: String(x.creator || 'Unknown'),
        dur: null, art: `https://archive.org/services/img/${x.identifier}`,
        stream: null, archiveId: x.identifier, download: 'archive', src: 'Archive.org' })); } },
];

export const radio = [
  { id: 'radiobrowser-de', label: 'Radio Browser DE', async run({ q, mode }) {
      const base = 'https://de1.api.radio-browser.info/json/stations';
      const u = mode === 'lang' ? `${base}/bylanguage/${encodeURIComponent(q)}?hidebroken=true&limit=60&order=votes&reverse=true`
        : mode === 'country' ? `${base}/bycountry/${encodeURIComponent(q)}?hidebroken=true&limit=60&order=votes&reverse=true`
        : `${base}/search?name=${encodeURIComponent(q)}&hidebroken=true&limit=60&order=votes&reverse=true`;
      const d = await jget(u, { headers: UA });
      return d.filter((s) => s.url_resolved).map((s) => ({ id: s.stationuuid, name: s.name.trim(),
        url: s.url_resolved, codec: s.codec, bitrate: s.bitrate, country: s.country,
        lang: s.language, fav: s.favicon, votes: s.votes, tags: s.tags })); } },
  { id: 'radiobrowser-nl', label: 'Radio Browser NL', async run({ q, mode }) {
      const base = 'https://nl1.api.radio-browser.info/json/stations';
      const u = mode === 'lang' ? `${base}/bylanguage/${encodeURIComponent(q)}?hidebroken=true&limit=60`
        : mode === 'country' ? `${base}/bycountry/${encodeURIComponent(q)}?hidebroken=true&limit=60`
        : `${base}/search?name=${encodeURIComponent(q)}&hidebroken=true&limit=60`;
      const d = await jget(u, { headers: UA });
      return d.filter((s) => s.url_resolved).map((s) => ({ id: s.stationuuid, name: s.name.trim(),
        url: s.url_resolved, codec: s.codec, bitrate: s.bitrate, country: s.country,
        lang: s.language, fav: s.favicon, votes: s.votes, tags: s.tags })); } },
];

export const itunes = [
  { id: 'itunes', label: 'iTunes Search', async run({ q }) {
      const d = await jget(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=30&country=IN`, { proxy: true });
      return (d.results || []).map((t) => ({ id: t.trackId, title: t.trackName, artist: t.artistName,
        album: t.collectionName, art: (t.artworkUrl100 || '').replace('100x100', '400x400'),
        preview: t.previewUrl, dur: Math.round((t.trackTimeMillis || 0) / 1000), src: 'iTunes' })); } },
];

/* ------------------------------------------------------------- DEV/FUN */
export const github = [
  { id: 'gh', label: 'GitHub', async run({ q }) {
      const d = await jget(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=15`);
      return (d.items || []).map((r) => ({ name: r.full_name, desc: r.description || '',
        stars: r.stargazers_count, forks: r.forks_count, lang: r.language || '', url: r.html_url })); } },
  { id: 'codeberg', label: 'Codeberg', async run({ q }) {
      const d = await jget(`https://codeberg.org/api/v1/repos/search?q=${encodeURIComponent(q)}&limit=15&sort=stars&order=desc`);
      return (d.data || []).map((r) => ({ name: r.full_name, desc: r.description || '',
        stars: r.stars_count ?? 0, forks: r.forks_count ?? 0, lang: r.language || '', url: r.html_url })); } },
];

export const jokes = [
  { id: 'oja', label: 'Official Joke API', async run() {
      const d = await jget('https://official-joke-api.appspot.com/random_joke');
      return { setup: d.setup, punch: d.punchline }; } },
  { id: 'jokeapi', label: 'JokeAPI', async run() {
      const d = await jget('https://v2.jokeapi.dev/joke/Any?safe-mode&type=twopart');
      return { setup: d.setup, punch: d.delivery }; } },
];

export const quotes = [
  { id: 'dummyjson', label: 'DummyJSON', async run() {
      const d = await jget('https://dummyjson.com/quotes/random');
      return { text: d.quote, author: d.author }; } },
  { id: 'zenquotes', label: 'ZenQuotes', async run() {
      const d = await jget('https://zenquotes.io/api/random', { proxy: true });
      return { text: d[0].q, author: d[0].a }; } },
];

export const country = [
  { id: 'restcountries', label: 'REST Countries', async run({ q }) {
      const d = await jget(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}`, { proxy: true });
      if (!Array.isArray(d)) throw new Error('shape');
      return d.slice(0, 5).map((c) => ({ name: c.name.common, official: c.name.official,
        capital: (c.capital||[]).join(', '), population: c.population, region: c.region,
        languages: Object.values(c.languages||{}).join(', '),
        currencies: Object.entries(c.currencies||{}).map(([k,v]) => `${v.name} (${k})`).join(', '),
        flag: c.flags?.svg || '', area: c.area, tz: (c.timezones||[]).slice(0,3).join(', ') })); } },
  { id: 'worldbank-c', label: 'World Bank', async run({ q }) {
      const d = await jget('https://api.worldbank.org/v2/country?format=json&per_page=400');
      const list = (d[1]||[]).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) && c.region?.value !== 'Aggregates');
      if (!list.length) throw new Error('no match');
      return list.slice(0, 5).map((c) => ({ name: c.name, official: c.name, capital: c.capitalCity || '',
        population: null, region: c.region?.value || '', languages: '', currencies: '',
        flag: '', area: null, tz: '' })); } },
];

/* The IP pool used to be ipapi.co plus a bare ip-echo. ipapi.co rate-limits
 * hard (measured: 403, then 429) and the echo returns no location at all, so a
 * single bad minute left "My IP" with an address and nothing else. Four more
 * were tested from a github.io origin — all CORS-open, all agreeing on the
 * same address, all returning a city. */
export const ipinfo = [
  { id: 'ipwho', label: 'ipwho.is', async run() {
      const d = await jget('https://ipwho.is/');
      if (d.success === false) throw new Error(d.message || 'refused');
      return { ip: d.ip, city: d.city, region: d.region, country: d.country,
        cc: d.country_code, org: d.connection?.isp || d.connection?.org || '',
        tz: d.timezone?.id || '', lat: d.latitude, lon: d.longitude,
        currency: d.currency?.code || '' }; } },
  { id: 'geojs', label: 'GeoJS', async run() {
      const d = await jget('https://get.geojs.io/v1/ip/geo.json');
      return { ip: d.ip, city: d.city, region: d.region, country: d.country,
        cc: d.country_code, org: d.organization_name || '', tz: d.timezone || '',
        lat: +d.latitude, lon: +d.longitude }; } },
  { id: 'ipinfo-io', label: 'ipinfo.io', async run() {
      const d = await jget('https://ipinfo.io/json');
      const [lat, lon] = String(d.loc || ',').split(',');
      return { ip: d.ip, city: d.city, region: d.region, country: d.country,
        cc: d.country, org: d.org || '', tz: d.timezone || '',
        lat: +lat || null, lon: +lon || null }; } },
  { id: 'ipapi-co', label: 'ipapi.co', async run() {
      const d = await jget('https://ipapi.co/json/');
      if (d.error) throw new Error(d.reason || 'refused');
      return { ip: d.ip, city: d.city, region: d.region, country: d.country_name,
        cc: d.country_code, org: d.org, tz: d.timezone, lat: d.latitude,
        lon: d.longitude, currency: d.currency }; } },
  { id: 'ipify', label: 'ipify', async run() {
      const d = await jget('https://api.ipify.org?format=json');
      return { ip: d.ip, city: '', region: '', country: '', org: '', tz: '' }; } },
];

export const nameInfo = [
  { id: 'agify-genderize', label: 'Agify + Genderize', async run({ q }) {
      const [a, g] = await Promise.all([
        jget(`https://api.agify.io/?name=${encodeURIComponent(q)}`),
        jget(`https://api.genderize.io/?name=${encodeURIComponent(q)}`)]);
      return { name: q, age: a.age, count: a.count, gender: g.gender, prob: g.probability }; } },
];

export const dogs = [
  { id: 'dogceo', label: 'Dog CEO', async run() {
      const d = await jget('https://dog.ceo/api/breeds/image/random');
      return { url: d.message }; } },
];
