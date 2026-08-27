/**
 * OmniTools relay — Cloudflare Worker
 * ===================================
 *
 * Two jobs:
 *
 *   1. CORS relay for hosts that do not send the header (Deezer, the Piped
 *      mirrors, the audio CDN). Browsers refuse those outright; this forwards
 *      them with permissive CORS. A host allow-list keeps it from becoming an
 *      open proxy for anyone else's traffic.
 *
 *   2. /yt — a first-party audio resolver.
 *      This is the important one. The app used to depend on a single external
 *      resolver, and when that host started returning 504 on every request —
 *      including its own homepage — every song in the app stopped playing.
 *      Every public alternative was already dead too: Cobalt (3 mirrors),
 *      Piped /streams (3), Invidious (4) all 403/500/timeout.
 *
 *      So the resolver now lives here. It does what the npm packages
 *      (play-dl, ytdl-core, youtubei.js) actually do: call YouTube's own
 *      internal `youtubei` API while identifying as a mobile client. Those
 *      clients receive `streamingData` with DIRECT urls — no signature to
 *      decipher, no player JS to execute, which is what makes it small enough
 *      to run in a Worker.
 *
 *      Several client identities are tried in order, because YouTube retires
 *      them one at a time. If one starts returning LOGIN_REQUIRED the next is
 *      used, and the app keeps working.
 *
 * DEPLOY
 *   dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   paste this file, Deploy, then put the URL in the app under
 *   Music -> Library -> Speed.
 */

const ALLOWED = [
  // audio resolution + the utility API family
  'ahm7xmakki.com',
  'c.ymcdn.org',
  'ymcdn.org',

  // YouTube front-ends (search / playlists / channels)
  'api.piped.private.coffee',
  'pipedapi.kavin.rocks',
  'pipedapi.adminforge.de',
  'pipedapi.drgns.space',
  'api.piped.projectsegfau.lt',
  'pipedapi.orangenet.cc',
  'pipedapi.ducks.party',
  'pipedapi.leptons.xyz',
  'piped-api.lunar.icu',
  'pipedapi.reallyaweso.me',
  'inv.nadeko.net',
  'yewtu.be',
  'invidious.f5.si',
  'invidious.nerdvpn.de',
  'invidious.privacyredirect.com',
  'iv.datura.network',

  // Deezer — large catalogue, no CORS header of its own
  'api.deezer.com',
  'cdn-preview-a.dzcdn.net',
  'cdns-preview-a.dzcdn.net',
  'e-cdn-preview.dzcdn.net',
  'e-cdns-preview-a.dzcdn.net',

  // Audius — free and decentralised, direct streams
  'discoveryprovider.audius.co',
  'discoveryprovider2.audius.co',
  'discoveryprovider3.audius.co',
  'audius-discovery-1.altego.net',
  'audius-discovery-2.altego.net',

  // YouTube media hosts, for /yt playback
  'googlevideo.com',
  'youtube.com',
  'www.youtube.com',

  // Radio + lyrics
  'de1.api.radio-browser.info',
  'nl1.api.radio-browser.info',
  'at1.api.radio-browser.info',
  'lrclib.net',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/* ------------------------------------------------------------------ /yt ---
   Client identities, tried in order. YouTube disables these one at a time, so
   the list matters more than any single entry. */
const YT_CLIENTS = [
  { name: 'ANDROID_VR', version: '1.60.19', id: '28',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12; GB) gzip',
    extra: { androidSdkVersion: 32, deviceMake: 'Oculus', deviceModel: 'Quest 3',
             osName: 'Android', osVersion: '12' } },
  { name: 'IOS', version: '19.45.4', id: '5',
    ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)',
    extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2',
             osName: 'iPhone', osVersion: '18.1.0.22B83' } },
  { name: 'ANDROID', version: '19.44.38', id: '3',
    ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' } },
  { name: 'MWEB', version: '2.20241202.07.00', id: '2',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    extra: {} },
  { name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', version: '2.0', id: '85',
    ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15',
    extra: {} },
];

async function ytPlayer(videoId, client) {
  const body = {
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        hl: 'en', gl: 'IN',
        ...client.extra,
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.ua,
      'X-YouTube-Client-Name': client.id,
      'X-YouTube-Client-Version': client.version,
      'Accept-Language': 'en-IN,en;q=0.9',
      Origin: 'https://www.youtube.com',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${client.name} HTTP ${r.status}`);
  return r.json();
}

/** Pick the best DIRECT audio url — anything needing a cipher is unusable here. */
function pickAudio(data) {
  const sd = data?.streamingData || {};
  const all = [...(sd.adaptiveFormats || []), ...(sd.formats || [])];
  const audio = all.filter((f) => (f.mimeType || '').startsWith('audio/') && f.url);
  if (!audio.length) return null;
  audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  // prefer m4a: it seeks reliably in a plain <audio> element
  const m4a = audio.find((f) => (f.mimeType || '').includes('mp4'));
  return m4a || audio[0];
}

async function resolveYouTube(videoId) {
  const tried = [];
  for (const client of YT_CLIENTS) {
    try {
      const data = await ytPlayer(videoId, client);
      const status = data?.playabilityStatus?.status;
      const fmt = pickAudio(data);
      if (!fmt) { tried.push(`${client.name}:${status || 'no-audio'}`); continue; }
      const d = data.videoDetails || {};
      return {
        success: true,
        via: client.name,
        mediaInfo: {
          audioUrl: fmt.url,
          videoUrl: null,
          title: d.title || '',
          author: d.author || '',
          duration: +(d.lengthSeconds || 0),
          thumbnail: (d.thumbnail?.thumbnails || []).slice(-1)[0]?.url || '',
          bitrate: fmt.bitrate || 0,
          mime: fmt.mimeType || '',
        },
        tried,
      };
    } catch (e) {
      tried.push(`${client.name}:${String(e.message).slice(0, 40)}`);
    }
  }
  return { success: false, error: 'no client returned a playable stream', tried };
}

/* ------------------------------------------------------------------ main */
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    /* ---- first-party audio resolver ---- */
    if (url.pathname === '/yt') {
      const v = url.searchParams.get('v') || url.searchParams.get('id');
      const raw = url.searchParams.get('url');
      let videoId = v;
      if (!videoId && raw) {
        const m = raw.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
        videoId = m ? m[1] : null;
      }
      if (!videoId) return json({ success: false, error: 'pass ?v=<videoId>' }, 400);
      try {
        const out = await resolveYouTube(videoId);
        return json(out, out.success ? 200 : 502);
      } catch (e) {
        return json({ success: false, error: String(e.message).slice(0, 120) }, 502);
      }
    }

    /* ---- plain CORS relay ---- */
    let target = url.searchParams.get('url');
    if (!target && url.pathname.length > 1) {
      target = decodeURIComponent(url.pathname.slice(1)) + url.search;
    }
    if (!target) {
      return new Response(
        'OmniTools relay.\n\n  /?url=<encoded target>   CORS relay\n  /yt?v=<videoId>          audio resolver\n',
        { status: 200, headers: { ...CORS, 'Content-Type': 'text/plain' } });
    }

    let t;
    try { t = new URL(target); }
    catch { return new Response('Bad target URL', { status: 400, headers: CORS }); }

    const host = t.hostname.replace(/^www\./, '');
    const ok = ALLOWED.some((h) => host === h || host.endsWith('.' + h));
    if (!ok) return new Response(`Host not allowed: ${host}`, { status: 403, headers: CORS });

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
