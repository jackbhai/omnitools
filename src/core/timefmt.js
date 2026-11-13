/**
 * Shared time formatting for the transit engines.
 *
 * bus-route.js and metro-route.js each carried a private copy of these two
 * (byte-identical except one Math.round); they live here now and both
 * engines re-export them, so existing import sites keep working.
 * trains.js has a DIFFERENT formatter for ISO timestamps — fmtIsoTime —
 * which is not this one; don't merge them.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Minutes-of-day → "9:05 PM" (wraps past midnight, em dash for null). */
export const fmtTime = (m) => {
  if (m == null) return '—';
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60), mi = x % 60, ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(mi)} ${ap}`;
};

/** Minutes → "1h 05m" / "45 min". */
export const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m} min`);
