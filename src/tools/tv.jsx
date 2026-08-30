/**
 * Live TV viewer.
 *
 * Five playlists ship ready to open, another twelve regional ones load on
 * demand, and everything is searchable and filterable by category. Channels
 * can be favourited and the last forty watched are remembered.
 *
 * The part that matters most is what happens when a stream is down. A public
 * index cannot promise a channel is live — measured, roughly six in ten
 * respond at any moment — so the viewer probes before committing, says which
 * channel failed and why, remembers it for ten minutes, and offers the next
 * one. A black rectangle with no explanation is the thing this is built to
 * avoid.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as TV from '../core/iptv';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty, fmt } from '../ui/kit';

/* ------------------------------------------------------------------ player */
function Screen({ ch, onClose, onNext }) {
  const vid = useRef(null);
  const hlsRef = useRef(null);
  const [state, setState] = useState('starting');   // starting | live | failed
  const [why, setWhy] = useState('');
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    let dead = false;
    const v = vid.current;
    if (!v || !ch) return undefined;
    setState('starting'); setWhy('');

    const fail = (msg) => {
      if (dead) return;
      TV.noteChannelFail(ch.url);
      setWhy(msg); setState('failed');
    };

    (async () => {
      if (TV.nativeHls()) {
        v.src = ch.url;
        try { await v.play(); TV.noteWatched(ch); TV.noteLive(ch.url, true); }
        catch { fail('Tap play to start — browser blocked autoplay'); }
      } else {
        let Hls;
        try { Hls = await TV.loadHls(); }
        catch (e) { fail(e.message); return; }
        if (dead) return;
        if (!Hls.isSupported()) { fail('This browser cannot play live streams. Try Chrome/Edge.'); return; }
        const hls = new Hls({
          maxBufferLength: 30, maxMaxBufferLength: 60,
          manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 3,
          enableWorker: true, lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Auto retry once for network errors
            if (retries < 1) { setRetries(r => r+1); hls.startLoad(); return; }
            fail('This channel is not responding right now. Try next.');
          } else {
            fail('This stream could not be decoded. Try another channel.');
          }
        });
        hls.loadSource(ch.url);
        hls.attachMedia(v);
        v.play().catch(() => { /* needs tap */ });
        TV.noteWatched(ch);
        TV.noteLive(ch.url, true);
      }
    })();

    const onPlaying = () => { if (!dead) setState('live'); };
    const onErr = () => fail('The stream stopped unexpectedly. Tap retry or next.');
    const onWaiting = () => { if (!dead && state !== 'failed') setState('starting'); };
    v.addEventListener('playing', onPlaying);
    v.addEventListener('error', onErr);
    v.addEventListener('waiting', onWaiting);
    const guard = setTimeout(() => {
      if (!dead && v.readyState < 3) fail('This channel did not start in time — try next.');
    }, 18000);

    return () => {
      dead = true;
      clearTimeout(guard);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('error', onErr);
      v.removeEventListener('waiting', onWaiting);
      try { hlsRef.current?.destroy(); } catch {}
      hlsRef.current = null;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
    };
  }, [ch?.id, ch?.url, retries]);   // eslint-disable-line

  const [fav, setFav] = useState(() => TV.isTvFav(ch?.id));
  useEffect(() => { setFav(TV.isTvFav(ch?.id)); }, [ch?.id]);

  const togglePiP = async () => {
    try {
      const v = vid.current;
      if (!v) return;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
  };

  return (
    <div className="tv-screen">
      <div className="tv-video">
        <video ref={vid} playsInline controls autoPlay
          style={{ width: '100%', height: '100%', background: '#000', display: 'block' }} />
        {state === 'starting' && (
          <div className="tv-overlay"><div className="spin" /><span>Tuning in… {retries ? `(retry ${retries})` : ''}</span></div>)}
        {state === 'failed' && (
          <div className="tv-overlay">
            <Icon n="warn" size={26} style={{ color: 'var(--warn)' }} />
            <b style={{ fontSize: 13 }}>{ch.name}</b>
            <span className="dim sm" style={{ textAlign: 'center', maxWidth: 260 }}>{why}</span>
            <span className="dim" style={{ fontSize: 10.5, textAlign: 'center', maxWidth: 280 }}>
              Public streams — some are off air or region-locked. Try next or retry.
            </span>
            <div className="btnrow" style={{ justifyContent: 'center' }}>
              <button className="btn sm" onClick={() => { setRetries(0); setState('starting'); setWhy(''); }}>
                <Icon n="refresh" size={14} /> Retry</button>
              <button className="btn ghost sm" onClick={onNext}>Next channel</button>
              <button className="btn ghost sm" onClick={onClose}><Icon n="x" size={14} /> Close</button>
            </div>
          </div>)}
      </div>

      <div className="tv-bar">
        {ch.logo
          ? <img src={ch.logo} alt="" referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
              style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain', background: 'var(--s2)' }} />
          : <span style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--s2)',
              display: 'grid', placeItems: 'center' }}><Icon n="film" size={15} /></span>}
        <div className="main" style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13 }}>{ch.name}</b>
          <span className="dim sm">
            {ch.group}{ch.quality ? ` · ${ch.quality}` : ''}
            {state === 'live' ? ' · live' : state === 'starting' ? ' · tuning…' : ' · offline'}
          </span>
        </div>
        <button className="rowbtn" aria-label="Favourite" title="Save"
          onClick={() => { TV.toggleTvFav(ch); setFav((v) => !v); }}
          style={{ color: fav ? 'var(--green)' : 'var(--fg3)' }}>
          <Icon n={fav ? 'staron' : 'star'} size={17} /></button>
        <button className="rowbtn" aria-label="Picture-in-Picture" title="PiP"
          onClick={togglePiP}>
          <Icon n="expand" size={16} /></button>
        <button className="rowbtn" aria-label="Fullscreen" title="Fullscreen"
          onClick={() => { try { vid.current?.requestFullscreen?.(); } catch {} }}>
          <Icon n="max" size={17} /></button>
        <button className="rowbtn" aria-label="Minimize" title="Minimize"
          onClick={onClose}>
          <Icon n="down" size={17} /></button>
        <button className="rowbtn" aria-label="Close" title="Close" onClick={onClose}>
          <Icon n="x" size={17} /></button>
      </div>
    </div>);
}

/* -------------------------------------------------------------- channel tile */
const Tile = ({ c, onOpen }) => {
  const score = TV.channelScore(c.url);
  return (
  <button className="tile tv-tile" onClick={() => onOpen(c)}>
    {score > 0 && <span className="live" title="Responded recently" />}
    <div className="tv-logo">
      {c.logo
        ? <img src={c.logo} alt="" loading="lazy" referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        : <Icon n="film" size={20} />}
    </div>
    <b>{c.name}</b>
    <small>
      {c.quality || c.group}
      {c.partTime ? ' · part-time' : ''}
      {score < 0 ? ' · was down' : ''}
    </small>
  </button>);
};

/* ------------------------------------------------------------------- shell */
export function LiveTV() {
  const [listId, setListId] = useState('in');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [hideFlaky, setHideFlaky] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [tab, setTab] = useState('all');            // all | fav | recent
  const [limit, setLimit] = useState(60);
  const [checked, setChecked] = useState(0);      // forces a re-sort as results land
  const [checking, setChecking] = useState(false);
  const token = useRef(0);

  const source = useMemo(
    () => [...TV.PLAYLISTS, ...TV.EXTRA].find((p) => p.id === listId) || TV.PLAYLISTS[0],
    [listId]);

  useEffect(() => {
    const my = ++token.current;
    setBusy(true); setErr(''); setGroup(''); setLimit(60);
    TV.loadPlaylist(source.urls || [source.url], { only: source.only || null })
      .then((r) => { if (token.current === my) setRows(r); })
      .catch((e) => {
        if (token.current !== my) return;
        setRows([]);
        setErr(e.message === 'Failed to fetch'
          ? 'Could not reach the channel index. Check your connection.'
          : `Could not load this list: ${e.message}`);
      })
      .finally(() => { if (token.current === my) setBusy(false); });
  }, [listId]);   // eslint-disable-line

  const groups = useMemo(() => TV.groupsOf(rows), [rows]);

  /* Probe what is on screen, quietly, and re-sort as answers arrive.
     Only the visible slice is probed — checking 747 channels to show 60 would
     be rude to the hosts and pointless to the user. */
  useEffect(() => {
    if (busy || !rows.length) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      const slice = TV.filterChannels(rows, { q, group, hideFlaky }).slice(0, limit);
      if (!slice.length) return;
      setChecking(true);
      const n = await TV.probeBatch(slice, { concurrency: 6 });
      if (!alive) return;
      setChecking(false);
      if (n) setChecked((c) => c + 1);
    }, 700);
    return () => { alive = false; clearTimeout(t); };
  }, [rows, q, group, hideFlaky, limit, busy]);

  const base = tab === 'fav' ? TV.favourites() : tab === 'recent' ? TV.recent() : rows;
  const shown = useMemo(
    () => TV.sortByLiveness(TV.filterChannels(base, { q, group, hideFlaky })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, q, group, hideFlaky, checked]);

  const stats = useMemo(() => TV.livenessStats(shown.slice(0, limit)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, limit, checked]);

  /* "Try the next channel" should land on something plausible, so it walks the
     filtered list from the current position rather than picking at random. */
  const nextChannel = () => {
    if (!playing) return;
    const i = shown.findIndex((c) => c.id === playing.id);
    const rest = shown.slice(i + 1).concat(shown.slice(0, Math.max(i, 0)));
    const nxt = rest.find((c) => !TV.recentlyFailed(c.url)) || rest[0];
    if (nxt) setPlaying(nxt);
  };

  return (<>
    {playing && <Screen ch={playing} onClose={() => setPlaying(null)} onNext={nextChannel} />}

    <div className="cats">
      {TV.PLAYLISTS.map((p) => (
        <button key={p.id} className={`cat ${listId === p.id ? 'on' : ''}`}
          onClick={() => { setListId(p.id); setTab('all'); }}>{p.name}</button>))}
      <button className={`cat ${tab === 'fav' ? 'on' : ''}`} onClick={() => setTab(tab === 'fav' ? 'all' : 'fav')}>
        <Icon n="staron" size={13} /> Saved</button>
      <button className={`cat ${tab === 'recent' ? 'on' : ''}`} onClick={() => setTab(tab === 'recent' ? 'all' : 'recent')}>
        <Icon n="clock" size={13} /> Recent</button>
    </div>

    <div className="btnrow" style={{ marginTop: 2 }}>
      {TV.EXTRA.map((p) => (
        <button key={p.id} className={`cat ${listId === p.id ? 'on' : ''}`}
          onClick={() => { setListId(p.id); setTab('all'); }}>{p.name}</button>))}
    </div>

    <div className="search" style={{ marginTop: 10 }}>
      <Icon n="search" size={17} />
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${tab === 'all' ? source.name : tab === 'fav' ? 'saved' : 'recent'} channels…`}
        autoComplete="off" spellCheck="false" />
      <button onClick={() => setShowGroups((v) => !v)} aria-label="Filters"
        style={{ background: 'none', border: 0, cursor: 'pointer',
          color: (group || hideFlaky) ? 'var(--green)' : 'var(--fg3)', display: 'grid', placeItems: 'center' }}>
        <Icon n="filter" size={17} /></button>
    </div>

    {showGroups && (<>
      <div className="btnrow" style={{ marginTop: 0 }}>
        <button className={`cat ${!group ? 'on' : ''}`} onClick={() => setGroup('')}>All categories</button>
        {groups.slice(0, 16).map((g) => (
          <button key={g.k} className={`cat ${group === g.k ? 'on' : ''}`}
            onClick={() => setGroup(group === g.k ? '' : g.k)}>{g.k} · {g.n}</button>))}
      </div>
      <label className="chk" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={hideFlaky} onChange={(e) => setHideFlaky(e.target.checked)} />
        <span>Hide part-time and region-locked channels</span>
      </label>
    </>)}

    {busy && <Spin t={`Loading ${source.name}`} />}
    {!busy && err && (
      <div className="err" style={{ marginTop: 12 }}>
        <h4>Could not load</h4><p>{err}</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setListId((v) => v)}>Retry</button>
      </div>)}

    {!busy && !err && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>
        {shown.length === base.length
          ? `${fmt(base.length)} channels`
          : `${fmt(shown.length)} of ${fmt(base.length)}`}
        {tab === 'all' ? ` · ${source.name}` : tab === 'fav' ? ' · saved' : ' · recently watched'}
        {stats.up > 0 && ` · ${stats.up} confirmed live`}
        {checking && ' · checking…'}
      </div>
      {stats.down > 0 && (
        <div className="dim" style={{ fontSize: 10.5, margin: '-4px 0 8px' }}>
          {stats.down} did not answer just now and have been moved to the end.
          These are public streams; some are off air rather than broken.
        </div>)}
      {shown.length === 0
        ? <Empty t={tab === 'fav' ? 'No saved channels yet — tap the star while watching'
            : tab === 'recent' ? 'Nothing watched yet' : 'No channel matches that'} />
        : (<>
            <div className="grid tv-grid">
              {shown.slice(0, limit).map((c) => <Tile key={c.id + c.url} c={c} onOpen={setPlaying} />)}
            </div>
            {shown.length > limit && (
              <button className="btn ghost" style={{ marginTop: 12, width: '100%' }}
                onClick={() => setLimit((n) => n + 60)}>
                Show more · {fmt(shown.length - limit)} left</button>)}
          </>)}
      <div className="src"><span className="dot" />
        <span>Public channel index · streams are published by their broadcasters</span></div>
    </>)}
  </>);
}

export default LiveTV;
