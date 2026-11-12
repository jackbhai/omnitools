/**
 * Universal downloader — separate buttons for VIDEO (with quality picker),
 * AUDIO extraction and THUMBNAIL grabbing, exactly as requested.
 *
 * Sources: for YouTube, two legs race — the app's own relay resolver
 * (which itself walks several player identities, then Piped mirrors) and
 * the Piped mirrors called directly for their per-quality stream lists;
 * first success wins, worst case bounded. Every other platform goes to
 * the broad resolver, unchanged. Instagram stories are the one known
 * dead end: they need a login, and the error says so plainly.
 */
import React, { useEffect, useRef, useState } from 'react';
import { jget } from '../core/engine';
import { resolveJson, cleanMediaUrl } from '../core/audio-resolve';
import { Card, Spin, Err, Chips, Copy, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';

/* The three mirrors the music side measured alive (2026-11-12). The two
   that used to sit here are gone — one answers 526, the other redirects
   to a parked page — and each dead mirror used to cost a full serial
   timeout on every YouTube fetch. */
const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.wireway.ch', 'https://pipedapi.ducks.party'];
/** Filenames must not contain path or reserved characters. */
const sanitize = (t) => String(t || 'download').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const ytId = (u) => {
  const m = String(u).match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};

/** First promise to settle with a non-null value wins; null when all settle empty. */
const firstGot = (ps) => new Promise((res) => {
  let left = ps.length;
  if (!left) return res(null);
  ps.forEach((p) => Promise.resolve(p).then(
    (v) => { if (v) res(v); else if (--left === 0) res(null); },
    () => { if (--left === 0) res(null); },
  ));
});

const THUMBS = [
  ['maxresdefault', 'Max (1280×720)'], ['sddefault', 'SD (640×480)'],
  ['hqdefault', 'HQ (480×360)'], ['mqdefault', 'MQ (320×180)'],
];

/**
 * A link shared into the app (manifest share_target) lands here as
 * ?url= / ?text= / ?title= — in the query string, or occasionally inside
 * the hash when a browser appends it there. Pull the first real URL out.
 */
function sharedUrl() {
  try {
    const fromParams = (p) => {
      const direct = p.get('url');
      if (direct && /^https?:\/\//i.test(direct)) return direct;
      const text = p.get('text') || '';
      const m = text.match(/https?:\/\/\S+/);
      return m ? m[0] : '';
    };
    const fromSearch = fromParams(new URLSearchParams(location.search));
    if (fromSearch) return fromSearch;
    const qi = location.hash.indexOf('?');
    if (qi >= 0) return fromParams(new URLSearchParams(location.hash.slice(qi + 1)));
  } catch {}
  return '';
}

export function Downloader() {
  const [url, setUrl] = useState(sharedUrl);
  const [busy, setBusy] = useState(false);
  /* Arriving with a shared link means the intent is obvious — fetch it. */
  const autoFetched = useRef(false);
  useEffect(() => {
    if (autoFetched.current) return;
    autoFetched.current = true;
    const s = sharedUrl();
    if (s) fetchInfo(s);
  }, []);   // eslint-disable-line
  const [err, setErr] = useState('');
  const [info, setInfo] = useState(null);
  const [stageTxt, setStageTxt] = useState('');

  const fetchInfo = async (ov) => {
    /* Normalise first: share-tracking params (si, utm_…, obrf) stripped,
       youtu.be / shorts / live forms canonicalised — resolvers answer
       noticeably better to a clean watch URL. */
    const rawUrl = cleanMediaUrl(ov ?? url);
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return;
    setUrl(rawUrl);
    setBusy(true); setErr(''); setInfo(null); setStageTxt('');
    const id = ytId(rawUrl);
    let got = null;

    const isInsta = /instagram\.com|instagr\.am/i.test(rawUrl);
    const isStory = /instagram\.com\/stories\//i.test(rawUrl);
    const isTikTok = /tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(rawUrl);

    const mapResolver = (d, via) => {
      const m = d.mediaInfo || {};
      const videoUrl = m.videoUrl || d.url || (Array.isArray(d.links) ? d.links[0] : '') || '';
      const audioUrl = m.audioUrl || '';
      if (!videoUrl && !audioUrl) return null;
      return {
        title: m.title || d.title || 'Media', author: m.author || '', platform: m.platform || d.platform || '',
        thumb: m.thumbnail || m.coverImage || d.thumbnail || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
        audio: audioUrl || null, video: videoUrl || null,
        qualities: (Array.isArray(m.qualities) ? m.qualities : [])
          .filter((q) => q && q.url)
          .map((q) => ({ q: q.quality || q.q || 'Video', url: q.url, size: q.size || q.contentLength })),
        audioOptions: (Array.isArray(m.audioOptions) ? m.audioOptions : [])
          .filter((a) => a && a.url)
          .map((a) => ({ q: a.quality || a.q || 'Audio', url: a.url, size: a.size || a.contentLength })),
        id, via,
      };
    };
    const mapPiped = (d) => {
      const vids = (d.videoStreams || []).filter((v) => v.url);
      const auds = (d.audioStreams || []).filter((a) => a.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!vids.length && !auds.length) return null;
      return {
        title: d.title || 'Video', author: d.uploader || '',
        platform: 'YouTube', thumb: d.thumbnailUrl || '',
        audio: auds[0]?.url || null,
        video: (vids.find((v) => !v.videoOnly) || vids[0])?.url || null,
        duration: d.duration,
        qualities: vids.map((v) => ({
          q: v.quality + (v.videoOnly ? ' (no audio)' : ''), url: v.url,
          mime: v.mimeType, size: v.contentLength })),
        audioOptions: auds.map((a) => ({
          q: `${Math.round((a.bitrate || 0) / 1000)} kbps ${(a.mimeType || '').split('/')[1] || ''}`,
          url: a.url, size: a.contentLength })),
        id, via: 'piped',
      };
    };

    if (id) {
      /* YouTube: race both legs, first success wins. The resolver leg is
         internally budgeted (its own relay attempt, then a capped proxy
         chain); the Piped leg races three mirrors at 8 s each. Worst
         case ≈17 s — the old serial stack (30 s resolver, then three
         mirrors at 12 s apiece, two of them dead) is what left the
         spinner running past half a minute with no answer at all. */
      const resolverLeg = (async () => {
        try {
          return mapResolver(await resolveJson(rawUrl, {
            ms: 10000, onProgress: (s) => setStageTxt(s),
          }), 'resolver');
        } catch { return null; }
      })();
      const pipedLeg = firstGot(PIPED.map(async (base) => {
        const g = mapPiped(await jget(`${base}/streams/${id}`, { ms: 8000 }));
        if (!g) throw new Error('empty');
        return g;
      }));
      got = await firstGot([resolverLeg, pipedLeg]);
    }

    // 1) Primary resolver — broadest platform coverage (Instagram, TikTok, FB, X, etc)
    // Instagram is slow: measured ~30 s for a reel, so the leg gets a
    // genuinely longer budget (the resolver chain's cap is raised with
    // it — a 45 s request under a 20 s cap could never succeed), and the
    // staged progress text keeps the wait honest. Retry twice.
    if (!got && !id) {
      const resolverMs = isInsta ? 45000 : isTikTok ? 35000 : 30000;
      for (let attempt = 0; attempt < (isInsta ? 2 : 1) && !got; attempt++) {
        try {
          const d = await resolveJson(rawUrl, {
            ms: resolverMs,
            ...(isInsta ? { cap: resolverMs } : {}),
            onProgress: (s) => setStageTxt(s),
          });
          got = mapResolver(d, attempt ? `resolver-retry${attempt + 1}` : 'resolver');
        } catch { /* try again */ }
      }
    }

    // 2) Instagram direct scrape fallback via proxy (og:video)
    // Instagram pages sometimes contain video URL in meta tags — try via our CORS proxy
    if (!got && isInsta) {
      try {
        const { proxyBase } = await import('../core/settings');
        const proxy = proxyBase();
        if (proxy) {
          const pageUrl = `${proxy}/?url=${encodeURIComponent(rawUrl)}`;
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 12000);
          const r = await fetch(pageUrl, { signal: ctrl.signal });
          clearTimeout(timer);
          if (r.ok) {
            const html = await r.text();
            // Look for og:video or video_url
            const ogVideo = html.match(/property="og:video" content="([^"]+)"/) || html.match(/"video_url":"([^"]+)"/) || html.match(/"videoUrl":"([^"]+)"/);
            const ogImage = html.match(/property="og:image" content="([^"]+)"/);
            if (ogVideo && ogVideo[1]) {
              const vUrl = ogVideo[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
              got = {
                title: 'Instagram Reel', author: '', platform: 'Instagram',
                thumb: ogImage ? ogImage[1] : '', audio: null, video: vUrl,
                qualities: [], audioOptions: [], id, via: 'og-scrape',
              };
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 3) Helpful error — stories get their own honest answer, not the generic one
    if (!got) {
      if (isStory) {
        setErr('That is an Instagram story link. Stories are only visible to logged-in Instagram accounts, so no public downloader can fetch them. Reels and posts work here — paste one of those instead.');
      } else if (isInsta) {
        setErr('Instagram did not answer in time (it can take 30–45 s). Check the reel is public, then tap Fetch again.');
      } else if (isTikTok) {
        setErr('TikTok did not answer this time. Check the link is public, wait a few seconds, then tap Fetch again.');
      } else {
        setErr('No source could read this link. It may be private, region-locked, or from a site we cannot read — public YouTube, Instagram, TikTok, X and Facebook links work best.');
      }
    }
    setInfo(got); setBusy(false); setStageTxt('');
  };

  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');
  const abortRef = useRef(null);

  /**
   * A cross-origin `<a download>` is ignored by browsers, and this CDN also
   * 302-redirects - so the old click did nothing. Fetch the bytes instead and
   * save from a blob URL, which produces a real file with a real name.
   */
  /**
   * Downloading here is genuinely slow: the CDN streams ~4 MB in ~45 s. The
   * earlier version gave no feedback, so a working download looked frozen and
   * users assumed the tool was broken.
   *
   * Now: immediate "Starting…" state, live percentage, a cancel button, and a
   * hard fallback that hands the URL to the browser if streaming stalls.
   * (A cross-origin `<a download>` is ignored by browsers and this CDN also
   * 302-redirects, which is why we must stream into a Blob ourselves.)
   */
  const grab = async (u, name) => {
    if (saving) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSaving(name);
    setNote('Starting…');
    const t0 = Date.now();
    // Try direct first, then via proxy if CORS fails
    const { proxyBase } = await import('../core/settings');
    const proxy = proxyBase();
    const urlsToTry = [u];
    if (proxy) urlsToTry.push(`${proxy}/?url=${encodeURIComponent(u)}`);

    let lastErr = null;
    for (const tryUrl of urlsToTry) {
      try {
        const res = await fetch(tryUrl, { mode: 'cors', signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const total = +(res.headers.get('content-length') || 0);
        const reader = res.body?.getReader();
        let blob;
        if (reader) {
          const chunks = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            const mb = (got / 1048576).toFixed(1);
            const secs = Math.round((Date.now() - t0) / 1000);
            setNote(total ? `${Math.round((got / total) * 100)}% · ${mb} MB` : `${mb} MB · ${secs}s`);
          }
          blob = new Blob(chunks);
        } else {
          blob = await res.blob();
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        setNote(`Saved (${(blob.size / 1048576).toFixed(1)} MB)`);
        abortRef.current = null;
        setSaving('');
        setTimeout(() => setNote(''), 5000);
        return;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError') { setNote('Cancelled'); break; }
        // Try next URL (proxy) if first failed
        if (tryUrl === u) { setNote('Direct failed, trying via proxy…'); continue; }
      }
    }
    // All failed - fallback to opening in new tab
    if (lastErr?.name !== 'AbortError') {
      setNote('Opening in a new tab…');
      window.open(u, '_blank', 'noopener');
    }
    abortRef.current = null;
    setSaving('');
    setTimeout(() => setNote(''), 5000);
  };

  const cancel = () => abortRef.current?.abort();

  return (<>
    <div className="fld">
      <label>Paste any video link</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="YouTube · Instagram · TikTok · X · Facebook · Reddit…"
        enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && fetchInfo()} />
    </div>
    <div className="btnrow">
      <button className="btn" style={{ flex: 1 }} disabled={busy || !url.trim()} onClick={() => fetchInfo()}>
        {busy ? 'Fetching…' : <><Icon n="search" size={16} /> Fetch</>}</button>
      <button className="btn ghost" onClick={async () => {
        try { setUrl(await navigator.clipboard.readText()); } catch {} }}><Icon n="list" size={18} /> Paste</button>
    </div>

    {busy && <Spin t={stageTxt || 'Reading the link'} />}
    {busy && /instagram\.com|instagr\.am/i.test(url) && !/stories\//i.test(url) && (
      <div className="dim sm" style={{ marginTop: 6 }}>
        Instagram is slow to answer — a reel can take 30–45 s. Keep this tab open.
      </div>)}
    {err && <div className="err" style={{ marginTop: 12 }}><h4>Couldn't fetch</h4><p>{err}</p></div>}

    {saving && (
      <Card style={{ position: 'sticky', top: 62, zIndex: 30,
        border: '1px solid rgba(0,255,156,.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="spin" style={{ width: 18, height: 18 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="tnum" style={{ fontSize: 12.5, display: 'block' }}>{note || 'Downloading…'}</b>
            <span className="dim sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis', display: 'block' }}>{saving}</span>
          </div>
          <button className="btn ghost sm" onClick={cancel}>Cancel</button>
        </div>
        <div className="dim sm" style={{ marginTop: 6 }}>
          Large files can take 30–60 s on this CDN — please keep this tab open.
        </div>
      </Card>)}
    {!saving && note && (
      <div className="src"><span className="dot" /><span>{note}</span></div>)}

    {info && (<>
      <Card style={{ marginTop: 12 }}>
        {info.thumb && <img src={info.thumb} alt="" className="dl-thumb" />}
        <b style={{ display: 'block', marginTop: 10, fontSize: 15 }}>{info.title}</b>
        <span className="dim sm">{info.author}{info.platform ? ` · ${info.platform}` : ''}
          {info.duration ? ` · ${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}` : ''}</span>
        <div className="src"><span className="dot" /><span>resolved via {info.via}</span></div>
      </Card>

      {/* ---------------- AUDIO ---------------- */}
      <Card>
        <div className="chead"><Icon n="music" size={17} /> Audio only</div>
        {info.audioOptions?.length > 0 ? (
          <div className="btnrow">
            {info.audioOptions.slice(0, 6).map((a, i) => (
              <button key={i} className="btn sm" onClick={() => grab(a.url, `${sanitize(info.title)}-${a.q.replace(/\s+/g,'')}.m4a`)}>
                <Icon n="download" size={16} /> {a.q}{a.size ? ` · ${(a.size / 1048576).toFixed(1)}MB` : ''}</button>))}
          </div>
        ) : info.audio ? (
          <button className="btn" style={{ width: '100%' }}
            onClick={() => grab(info.audio, `${sanitize(info.title)}.m4a`)}>
            {saving.endsWith('.m4a') ? (note || 'Downloading…') : <><Icon n="download" size={16} /> Download audio (M4A)</>}</button>
        ) : <div className="state sm">No separate audio track for this link.</div>}
        {info.audio && (
          <audio controls src={info.audio} style={{ width: '100%', marginTop: 10 }} preload="none" />)}
      </Card>

      {/* ---------------- THUMBNAIL ---------------- */}
      <Card>
        <div className="chead"><Icon n="image" size={18} /> Thumbnail</div>
        {info.id ? (
          <div className="btnrow">
            {THUMBS.map(([k, l]) => (
              <button key={k} className="btn ghost sm"
                onClick={() => grab(`https://i.ytimg.com/vi/${info.id}/${k}.jpg`, `${sanitize(info.title)}-${k}.jpg`)}>
                <Icon n="download" size={16} /> {l}</button>))}
          </div>
        ) : info.thumb ? (
          <button className="btn" style={{ width: '100%' }}
            onClick={() => grab(info.thumb, `${sanitize(info.title)}-thumb.jpg`)}><Icon n="download" size={16} /> Download thumbnail</button>
        ) : <div className="state sm">No thumbnail found for this link.</div>}
        {info.thumb && <div className="btnrow"><Copy text={info.thumb} label="Copy image URL" /></div>}
      </Card>

      {/* ---------------- VIDEO + QUALITY ---------------- */}
      <Card>
        <div className="chead"><Icon n="film" size={18} /> Video</div>
        {info.qualities?.length > 0 ? (<>
          <div className="dim sm" style={{ marginBottom: 8 }}>
            {fmt(info.qualities.length)} qualities available
          </div>
          <div className="list" style={{ border: 0 }}>
            {info.qualities.map((v, i) => (
              <div className="row" key={i} style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div className="main">
                  <b>{v.q}</b>
                  <span className="dim sm">{(v.mime || '').split(';')[0]}</span>
                </div>
                {v.size ? <span className="dl-size">{(v.size / 1048576).toFixed(1)} MB</span> : null}
                <button className="btn sm" disabled={!!saving}
                  onClick={() => grab(v.url, `${sanitize(info.title)}-${v.q}.mp4`)}>
                  {saving.includes(v.q) ? (note || '…') : <><Icon n="download" size={16} /> Download</>}</button>
              </div>))}
          </div>
        </>) : info.video ? (<>
          <button className="btn" style={{ width: '100%' }} disabled={!!saving}
            onClick={() => grab(info.video, `${sanitize(info.title)}.mp4`)}>
            {saving.endsWith('.mp4') ? (note || 'Downloading…') : <><Icon n="download" size={16} /> Download video (best available)</>}</button>
          <div className="src" style={{ marginTop: 10 }}>
            <span className="dot warn" />
            <span>This source returns a single best-quality file, not a quality list.
              Every open API that exposed per-quality streams (Piped mirrors) is
              currently blocked by YouTube, so a selector would be empty.
              Tip: the audio-only option above is much smaller if you just want sound.</span>
          </div>
        </>) : <div className="state sm">No downloadable video stream for this link.</div>}
      </Card>

      <div className="src">
        <span className="dot warn" />
        <span>Download only what you have the right to save. Respect each platform's terms
          and the creator's copyright.</span>
      </div>
    </>)}
  </>);
}
