/**
 * OmniTools CORS proxy — Cloudflare Worker
 * =========================================
 *
 * WHY THIS EXISTS
 *   The app resolves ad-free audio through an upstream API that sends no CORS
 *   header, so a browser cannot call it directly. Until now that hop went
 *   through free public proxies. Measured on 2026-08-27, 25 of them:
 *     corsproxy.io ....... 401 permanently (free tier exhausted)
 *     cors.lol / eu.org /
 *     test.workers / everyorigin ... 429 rate limited
 *     isomorphic-git / corsfix / cors-anywhere ... 403
 *     allorigins / codetabs ........ 408 / 522 timeouts
 *     cors.sh ...................... works, but 7-11 s and throttles
 *   Result: music started in 3 s sometimes and 25 s other times, and sometimes
 *   not at all. No amount of client-side retry logic fixes someone else's rate
 *   limit.
 *
 *   This Worker is your own hop. Cloudflare's free plan allows 100,000
 *   requests a day, which is far more than this app can use, and it typically
 *   answers in a few hundred milliseconds instead of several seconds.
 *
 * WHAT IT DOES
 *   Fetches the target URL server-side and returns the body with permissive
 *   CORS headers. It only allows a small list of upstream hosts, so it cannot
 *   be turned into an open relay for someone else's traffic.
 *
 * DEPLOY — about five minutes, no credit card
 *   1. Sign in at https://dash.cloudflare.com  (free account is fine)
 *   2. Left menu: Workers & Pages  →  Create  →  Workers  →  Create Worker
 *   3. Name it e.g. omni-proxy  →  Deploy
 *   4. Click "Edit code", delete everything, paste THIS ENTIRE FILE, Deploy
 *   5. Copy the URL it gives you, e.g. https://omni-proxy.<you>.workers.dev
 *   6. In OmniTools: Settings (gear icon, top right) → paste the URL → Save
 *
 *   The app then uses your Worker first and keeps the public proxies as a
 *   fallback, so nothing breaks if the Worker is ever unreachable.
 */

/* Only these upstreams may be fetched. Keeps the Worker from becoming an
   open proxy that anyone could point at anything. */
const ALLOWED = [
  'ahm7xmakki.com',
  'api.piped.private.coffee',
  'pipedapi.kavin.rocks',
  'pipedapi.adminforge.de',
  'pipedapi.drgns.space',
  'api.piped.projectsegfau.lt',
  'pipedapi.orangenet.cc',
  'c.ymcdn.org',
  'itunes.apple.com',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    // Accept both ?url=<encoded> and the bare-suffix form /https://…
    let target = url.searchParams.get('url');
    if (!target && url.pathname.length > 1) {
      target = decodeURIComponent(url.pathname.slice(1)) + url.search;
    }

    if (!target) {
      return new Response(
        'OmniTools proxy is running.\n\nUsage: ?url=<encoded target>\n',
        { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' } });
    }

    let t;
    try {
      t = new URL(target);
    } catch {
      return new Response('Bad target URL', { status: 400, headers: CORS });
    }

    const host = t.hostname.replace(/^www\./, '');
    const ok = ALLOWED.some((h) => host === h || host.endsWith('.' + h));
    if (!ok) {
      return new Response(`Host not allowed: ${host}`, { status: 403, headers: CORS });
    }

    // Pass Range through so seeking in <audio> keeps working.
    const fwd = new Headers();
    const range = request.headers.get('Range');
    if (range) fwd.set('Range', range);
    fwd.set('User-Agent',
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36');
    fwd.set('Accept', '*/*');

    try {
      const res = await fetch(t.toString(), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: fwd,
        redirect: 'follow',
        cf: { cacheTtl: 60, cacheEverything: false },
      });

      const out = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) out.set(k, v);
      out.delete('content-security-policy');
      out.delete('content-security-policy-report-only');
      out.delete('set-cookie');

      return new Response(res.body, { status: res.status, headers: out });
    } catch (e) {
      return new Response(`Upstream failed: ${e.message}`, { status: 502, headers: CORS });
    }
  },
};
