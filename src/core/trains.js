/**
 * Indian Railways data.
 *
 * SOURCES (all CORS-verified from a github.io Origin):
 *   railradar.in/api/v1/trains/{no}        full schedule, 77-236 stops, coach
 *                                          position, run days, avg/max speed
 *   railradar.in/api/v1/trains/{no}/live   real-time running status: current
 *                                          location, next halt, delay minutes,
 *                                          per-station actual vs scheduled
 *   erail.in/rail/getTrains.aspx           trains between two stations
 *
 * REJECTED AFTER TESTING (documented so nobody re-adds them):
 *   erail TRAINROUTE  — returns the SAME cached fixture regardless of train
 *                       number (asking for 12013 returned Karjat/Neral, a
 *                       Mumbai local). Unusable, would have shown fake data.
 *   indianrailapi     — "Authentication Required"
 *   railyatri / trainman / confirmtkt — 404 / dead / no CORS
 *   NTES              — no public JSON
 */
import { jget } from './engine';

const RR = 'https://railradar.in/api/v1';

/* ------------------------------------------------------------- schedule */
export const trainInfo = [
  {
    id: 'railradar', label: 'RailRadar',
    async run({ no }) {
      const d = await jget(`${RR}/trains/${encodeURIComponent(no)}`, { ms: 20000 });
      if (!d?.success || !d?.data?.train) throw new Error('Train not found');
      const t = d.data.train;
      return {
        no: t.number, name: t.name, type: t.type, category: t.category,
        from: t.source, to: t.destination, runDays: t.runDays || [],
        km: t.distance, mins: t.duration, avgSpeed: t.avgSpeed, maxSpeed: t.maxSpeed,
        halts: t.totalHalts, returnTrain: t.returnTrain, coaches: t.coachPosition,
        // NOTE: the schedule endpoint nests {station:{code,name}} and uses
        // plain arrival/departure ("16:30"); the live endpoint flattens them.
        route: (d.data.route || []).map((r) => ({
          seq: r.sequence,
          code: r.station?.code ?? r.stationCode,
          name: r.station?.name ?? r.stationName,
          lat: r.station?.lat, lon: r.station?.lng,
          halt: r.isHalt,
          arr: r.arrival ?? r.scheduledArrival,
          dep: r.departure ?? r.scheduledDeparture,
          day: r.departureDay ?? r.arrivalDay,
          platform: r.platform, km: r.distance, speed: r.speedToNextStationKmph,
        })),
      };
    },
  },
];

/* ------------------------------------------------------------- live status */
export const trainLive = [
  {
    id: 'railradar-live', label: 'RailRadar live',
    async run({ no }) {
      const d = await jget(`${RR}/trains/${encodeURIComponent(no)}/live`, { ms: 22000 });
      if (!d?.success || !d?.data) throw new Error('No live data for this train');
      const L = d.data;
      return {
        no: L.trainNumber, name: L.trainName, startDate: L.startDate,
        updated: L.lastUpdatedAt, status: L.status, isLive: L.isLive,
        mode: L.trackingMode, delay: L.delayMinutes,
        current: L.currentLocation, next: L.nextHalt,
        route: (L.route || []).map((r) => ({
          seq: r.sequence, code: r.stationCode, name: r.stationName,
          halt: r.isHalt, status: r.status, platform: r.platform, km: r.distance,
          schArr: r.scheduledArrival, schDep: r.scheduledDeparture,
          actArr: r.actualArrival, actDep: r.actualDeparture,
          delay: r.delayMinutes ?? r.arrivalDelay ?? null,
        })),
      };
    },
  },
];

/* ------------------------------------------------------------- between stations */
export const trainsBetween = [
  {
    id: 'erail', label: 'eRail',
    async run({ from, to }) {
      const txt = await jget(
        `https://erail.in/rail/getTrains.aspx?Station_From=${from}&Station_To=${to}` +
        `&DataSource=0&Language=0&Cache=true`, { text: true, ms: 22000 });
      const rows = txt.split('^').slice(1).filter(Boolean);
      const out = [];
      for (const r of rows) {
        const f = r.split('~').filter((x) => x !== '');
        if (f.length < 14) continue;
        out.push({
          no: f[0], name: f[1], fromName: f[2], from: f[3], toName: f[4], to: f[5],
          dep: f[10], arr: f[11], dur: f[12], days: f[13],
        });
      }
      if (!out.length) throw new Error('No direct trains on this route');
      return out;
    },
  },
];

/** Common station codes for the picker (verified against eRail responses). */
export const STATIONS = [
  ['NDLS', 'New Delhi'], ['DLI', 'Old Delhi'], ['NZM', 'Hazrat Nizamuddin'],
  ['ANVT', 'Anand Vihar Terminal'], ['DEE', 'Delhi Sarai Rohilla'],
  ['ASR', 'Amritsar Jn'], ['LDH', 'Ludhiana Jn'], ['JUC', 'Jalandhar City'],
  ['UMB', 'Ambala Cant'], ['CDG', 'Chandigarh'], ['JAT', 'Jammu Tawi'],
  ['LKO', 'Lucknow'], ['CNB', 'Kanpur Central'], ['BSB', 'Varanasi Jn'],
  ['PRYJ', 'Prayagraj Jn'], ['GKP', 'Gorakhpur'], ['PNBE', 'Patna Jn'],
  ['HWH', 'Howrah Jn'], ['SDAH', 'Sealdah'], ['NJP', 'New Jalpaiguri'],
  ['CSTM', 'Mumbai CSMT'], ['BCT', 'Mumbai Central'], ['LTT', 'Lokmanya Tilak'],
  ['PUNE', 'Pune Jn'], ['ADI', 'Ahmedabad Jn'], ['ST', 'Surat'],
  ['JP', 'Jaipur'], ['JU', 'Jodhpur'], ['AII', 'Ajmer Jn'], ['UDZ', 'Udaipur City'],
  ['SBC', 'KSR Bengaluru'], ['MAS', 'MGR Chennai Ctr'], ['MAQ', 'Mangaluru Ctr'],
  ['TVC', 'Thiruvananthapuram'], ['ERS', 'Ernakulam Jn'], ['CBE', 'Coimbatore'],
  ['HYB', 'Hyderabad Dn'], ['SC', 'Secunderabad Jn'], ['BZA', 'Vijayawada Jn'],
  ['VSKP', 'Visakhapatnam'], ['BBS', 'Bhubaneswar'], ['BPL', 'Bhopal Jn'],
  ['NGP', 'Nagpur'], ['JBP', 'Jabalpur'], ['INDB', 'Indore Jn'], ['GWL', 'Gwalior'],
  ['AGC', 'Agra Cantt'], ['MTJ', 'Mathura Jn'], ['ALJN', 'Aligarh Jn'],
  ['BE', 'Bareilly'], ['MB', 'Moradabad'], ['HW', 'Haridwar Jn'], ['DDN', 'Dehradun'],
  ['KOTA', 'Kota Jn'], ['RTM', 'Ratlam Jn'], ['BRC', 'Vadodara Jn'],
  ['RNC', 'Ranchi'], ['TATA', 'Tatanagar Jn'], ['DHN', 'Dhanbad Jn'],
  ['GHY', 'Guwahati'], ['RJPB', 'Rajendra Nagar'], ['MFP', 'Muzaffarpur'],
];

export const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-IN',
      { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  } catch { return '—'; }
};

export const delayLabel = (m) => {
  if (m == null) return { text: '—', tone: 'var(--fg3)' };
  if (m <= 0) return { text: 'On time', tone: 'var(--green)' };
  if (m < 15) return { text: `${m} min late`, tone: 'var(--warn)' };
  return { text: `${Math.floor(m / 60)}h ${m % 60}m late`, tone: 'var(--bad)' };
};
