/**
 * Music — search, charts, genres, artists, playlists and endless radio.
 *
 * WHY IT LOOKS LIKE THIS
 *   The old screen was a search box and the first 20 hits, full stop. A live
 *   probe of the sources showed how much more was reachable without adding a
 *   single API key:
 *     · search paginates (verified pages 2 and 3, 20 rows each) → infinite scroll
 *     · fanning the same query over three filters takes 20 hits → 54 unique ids
 *     · one playlist call returns 101 tracks
 *     · iTunes (CORS *) gives an artist's 60 songs and 30 albums, plus charts
 *   So the tool now has Search · Charts · Genres · Playlists · Radio, and every
 *   list can be played as a queue.
 *
 *   Playback stays what it was: a direct audio stream, no video, no ads, no
 *   YouTube embed. Tapping a row starts the whole list as a queue, so it keeps
 *   going by itself; with Radio on, the queue refills before it can run out.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as P from '../core/providers';
import { usePlayer } from '../core/player';
import { prefetchAudio, isCached, onWarm } from '../core/audio-resolve';
import { searchMusic, suggest, findPlaylists, findPlaylistsWithCounts, playlistTracks, artistInfo,
         resolveByName, radioQueue, chart, GENRES } from '../core/music';
import { Spin, Err, Empty, Card, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';
import { favourites, isFav, toggleFav, history, topPlayed, playlists,
         createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist,
         clearHistory, onLibrary, libraryStats } from '../core/library';
import { getSettings, setSetting, testProxy } from '../core/settings';

const mmss = (s) => (!s ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

const TABS = [
  ['search',   'search',  'Search'],
  ['library',  'staron',  'Library'],
  ['charts',   'chart',   'Charts'],
  ['genres',   'grid',    'Genres'],
  ['playlist', 'list',    'Playlists'],
  ['radio',    'radio',   'Radio'],
];

const QUICK = ['babbu maan', 'sidhu moose wala', 'diljit dosanjh', 'ishq murshid',
  'cheema y', 'atif aslam', 'arijit singh', 'coke studio', 'karan aujla', 'ap dhillon'];

export function Music() {
  const player = usePlayer();
  const [tab, setTab] = useState('search');
  const [, bump] = useState(0);
  useEffect(() => onWarm(() => bump((n) => n + 1)), []);

  return (<>
    <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
      {TABS.map(([id, ic, label]) => (
        <button key={id} role="tab" aria-selected={tab === id}
          className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
          <Icon n={ic} size={16} /><span>{label}</span>
        </button>))}
    </div>

    {tab === 'search'   && <SearchTab player={player} />}
    {tab === 'library'  && <LibraryTab player={player} />}
    {tab === 'charts'   && <ChartsTab player={player} />}
    {tab === 'genres'   && <GenresTab player={player} />}
    {tab === 'playlist' && <PlaylistTab player={player} />}
    {tab === 'radio'    && <RadioTab player={player} />}
  </>);
}

/* ------------------------------------------------------------- track list */
function TrackList({ tracks, player, onPlay, loading, more, onMore, onRemove }) {
  const sentinel = useRef(null);
  const [addFor, setAddFor] = useState(null);   // track awaiting a playlist pick
  const [, bump] = useState(0);
  useEffect(() => onLibrary(() => bump((n) => n + 1)), []);

  /* Infinite scroll: load the next page when the end of the list appears. */
  useEffect(() => {
    if (!onMore || !sentinel.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) onMore(); },
      { rootMargin: '400px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [onMore, tracks.length]);

  if (!tracks?.length) return null;
  return (<>
    <div className="list">
      {tracks.map((t, i) => {
        const active = player.track && (player.track.id ?? player.track.url) === (t.id ?? t.url);
        return (
          <div className="row" key={(t.id || '') + i} onClick={() => onPlay(t, i)}
            style={{ cursor: 'pointer', background: active ? 'rgba(0,255,156,.07)' : '' }}>
            {t.art
              ? <img src={t.art} alt="" loading="lazy"
                  style={{ width: 46, height: 46, borderRadius: 9, objectFit: 'cover',
                           flex: '0 0 auto', background: 'var(--s3)' }}
                  onError={(e) => { e.target.style.visibility = 'hidden'; }} />
              : <div style={{ width: 46, height: 46, borderRadius: 9, background: 'var(--s3)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                  <Icon n="music" size={20} style={{ opacity: .55 }} /></div>}
            <div className="main">
              <b style={{ fontSize: 13.5, color: active ? 'var(--green)' : '' }}>
                {(t.title || '').slice(0, 54)}</b>
              <span className="dim sm">
                {t.artist || ''}
                {t.dur ? ` · ${mmss(t.dur)}` : ''}
                {t.views ? ` · ${fmt(t.views)} plays` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center', flex: '0 0 auto' }}>
              {t.id && isCached(t.id) && !active &&
                <span className="tag g" title="Already loaded — plays instantly">ready</span>}
              {t.id && (
                <button className="rowbtn" aria-label={isFav(t.id) ? 'Remove favourite' : 'Add favourite'}
                  onClick={(e) => { e.stopPropagation(); toggleFav(t); }}>
                  <Icon n={isFav(t.id) ? 'staron' : 'star'} size={16}
                    style={{ color: isFav(t.id) ? 'var(--green)' : 'var(--fg3)' }} /></button>)}
              {t.id && !onRemove && (
                <button className="rowbtn" aria-label="Add to playlist"
                  onClick={(e) => { e.stopPropagation(); setAddFor(t); }}>
                  <Icon n="list" size={16} style={{ color: 'var(--fg3)' }} /></button>)}
              {onRemove && (
                <button className="rowbtn" aria-label="Remove from playlist"
                  onClick={(e) => { e.stopPropagation(); onRemove(t); }}>
                  <Icon n="x" size={15} style={{ color: 'var(--fg3)' }} /></button>)}
              <span style={{ color: active && player.playing ? 'var(--green)' : 'var(--fg2)',
                             display: 'grid', placeItems: 'center', paddingLeft: 3 }}>
                <Icon n={active && player.playing ? 'pause' : 'play'} size={18} /></span>
            </div>
          </div>);
      })}
    </div>
    {addFor && <AddToPlaylist track={addFor} onClose={() => setAddFor(null)} />}
    {onMore && <div ref={sentinel} style={{ height: 1 }} />}
    {loading && <Spin t="Loading more" />}
    {!loading && more === false && tracks.length > 20 &&
      <div className="dim sm" style={{ textAlign: 'center', padding: '12px 0' }}>
        That is everything for this one.</div>}
  </>);
}

/** Small sheet: pick a playlist to add a track to, or make a new one. */
function AddToPlaylist({ track, onClose }) {
  const [name, setName] = useState('');
  const pls = playlists();
  const add = (id) => { addToPlaylist(id, track); onClose(); };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="chead">Add &ldquo;{(track.title || '').slice(0, 30)}&rdquo; to…</div>
        {pls.length > 0 && (
          <div className="list" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {pls.map((p) => (
              <button className="row" key={p.id} onClick={() => add(p.id)}
                style={{ background: 'none', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                <Icon n="list" size={17} style={{ color: 'var(--green)' }} />
                <div className="main"><b style={{ fontSize: 13 }}>{p.name}</b>
                  <span className="dim sm">{p.tracks.length} songs</span></div>
              </button>))}
          </div>)}
        <div className="fld" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="ip-wrap">
            <Icon n="list" size={16} />
            <input value={name} autoFocus placeholder="…or a new playlist"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  const p = createPlaylist(name); if (p) add(p.id);
                }
              }} />
          </div>
        </div>
        <button className="btn ghost sm" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Cancel</button>
      </div>
    </div>);
}

/** Start a list as a queue and warm the first few so the next tap is instant. */
function playList(player, list, i) {
  player.setRadio(true);
  player.play(list[i], list);
  const nx = list[i + 1];
  if (nx?.id) prefetchAudio(nx.id, 0);
}

/* ------------------------------------------------------------ search tab */
function SearchTab({ player }) {
  const [q, setQ] = useState('babbu maan');
  const [tracks, setTracks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tips, setTips] = useState([]);
  const [focused, setFocused] = useState(false);   // only suggest while typing
  const [more, setMore] = useState(null);          // next() or false
  const [loadingMore, setLoadingMore] = useState(false);
  const nextRef = useRef(null);
  const seq = useRef(0);

  const run = useCallback(async (term) => {
    const s = String(term || '').trim();
    if (!s) return;
    const my = ++seq.current;
    setBusy(true); setErr(''); setTips([]);
    try {
      const r = await searchMusic(s);
      if (my !== seq.current) return;
      setTracks(r.tracks);
      nextRef.current = r.next;
      setMore(r.next ? true : false);
      /* Warm just the top two while the user reads the list. Warming more
         backfired: each resolve mints a fresh signed CDN link and invalidates
         the previous one, so deep prefetching left later tracks with dead
         links (MediaError 4). Two is enough for the common first tap. */
      r.tracks.slice(0, 2).forEach((t, i) => t.id && prefetchAudio(t.id, i));
    } catch (e) {
      if (my === seq.current) { setErr(e.message || 'Search failed'); setTracks([]); }
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, []);

  useEffect(() => { run('babbu maan'); }, [run]);

  /* Suggestions only while the box actually has focus. Leaving the dropdown
     mounted after a search covered the results list and swallowed taps. */
  useEffect(() => {
    if (!focused || q.trim().length < 2) { setTips([]); return; }
    const t = setTimeout(async () => setTips(await suggest(q)), 300);
    return () => clearTimeout(t);
  }, [q, focused]);

  const loadMore = useCallback(async () => {
    if (!nextRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const add = await nextRef.current();
      if (add.length) setTracks((cur) => [...(cur || []), ...add]);
      else { setMore(false); nextRef.current = null; }
    } finally { setLoadingMore(false); }
  }, [loadingMore]);

  return (<>
    <div className="fld" style={{ position: 'relative' }}>
      <div className="ip-wrap">
        <Icon n="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setTips([]); setFocused(false); run(q); e.target.blur(); }
          }}
          placeholder="Any song, artist or album…" enterKeyHint="search" />
        {q && <button className="ip-x" onClick={() => { setQ(''); setTips([]); }} aria-label="Clear">
          <Icon n="x" size={16} /></button>}
      </div>
      {focused && tips.length > 0 && (
        <div className="list" style={{ position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 40, marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
          {tips.map((s) => (
            <button key={s} className="col" style={{ background: 'none', border: 0,
              textAlign: 'left', width: '100%', cursor: 'pointer' }}
              onMouseDown={(e) => { e.preventDefault(); setQ(s); setTips([]); setFocused(false); run(s); }}>
              <b style={{ fontSize: 13 }}>{s}</b>
            </button>))}
        </div>)}
    </div>

    <div className="cats">
      {QUICK.map((x) => (
        <button key={x} className="cat"
          onClick={() => { setQ(x); setTips([]); setFocused(false); run(x); }}>{x}</button>))}
    </div>

    {busy && !tracks && <Spin t="Searching" />}
    {err && <Err error={err} retry={() => run(q)} />}
    {tracks?.length === 0 && !busy && <Empty t={`Nothing found for "${q}"`} />}

    {tracks?.length > 0 && (<>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
        <span className="dim sm" style={{ flex: 1 }}>{tracks.length} songs</span>
        <button className="btn ghost sm" onClick={() => playList(player, tracks, 0)}>
          <Icon n="play" size={14} /> Play all</button>
        <button className="btn ghost sm" onClick={() => {
          const sh = [...tracks].sort(() => Math.random() - 0.5);
          player.setShuffle(true); playList(player, sh, 0);
        }}><Icon n="swap" size={14} /> Shuffle</button>
      </div>
      <TrackList tracks={tracks} player={player} loading={loadingMore}
        more={more} onMore={more ? loadMore : null}
        onPlay={(t, i) => playList(player, tracks, i)} />
    </>)}
  </>);
}

/* ------------------------------------------------------------ charts tab */
function ChartsTab({ player }) {
  const [country, setCountry] = useState('in');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [opening, setOpening] = useState(null);

  const load = useCallback(async (c) => {
    setBusy(true); setErr(''); setRows(null);
    try { setRows(await chart(c, 50)); }
    catch (e) { setErr(e.message || 'Could not load the chart'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(country); }, [country, load]);

  /* Chart rows are metadata only, so the title is resolved to a playable
     track on tap, then the rest of the chart is queued behind it. */
  const openRow = async (r, i) => {
    setOpening(i);
    try {
      const t = await resolveByName(r.title, r.artist);
      if (!t) throw new Error('not found');
      const rest = await Promise.all(rows.slice(i + 1, i + 6)
        .map((x) => resolveByName(x.title, x.artist).catch(() => null)));
      const queue = [t, ...rest.filter(Boolean)];
      player.setRadio(true);
      player.play(t, queue);
      if (queue[1]?.id) prefetchAudio(queue[1].id, 0);
    } catch { setErr('Could not find a stream for that track.'); }
    finally { setOpening(null); }
  };

  return (<>
    <div className="cats">
      {[['in', 'India'], ['us', 'Global'], ['gb', 'UK'], ['ca', 'Canada'], ['ae', 'UAE']]
        .map(([c, l]) => (
        <button key={c} className={`cat ${country === c ? 'on' : ''}`}
          onClick={() => setCountry(c)}>{l}</button>))}
    </div>
    {busy && <Spin t="Loading the chart" />}
    {err && <Err error={err} retry={() => load(country)} />}
    {rows?.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>
        Top {rows.length} most played right now
      </div>
      <div className="list">
        {rows.map((r, i) => (
          <div className="row" key={i} onClick={() => openRow(r, i)} style={{ cursor: 'pointer' }}>
            <span className="chartno">{i + 1}</span>
            {r.art
              ? <img src={r.art} alt="" loading="lazy"
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }} />
              : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--s3)' }} />}
            <div className="main">
              <b style={{ fontSize: 13 }}>{r.title}</b>
              <span className="dim sm">{r.artist}</span>
            </div>
            <span style={{ color: 'var(--fg2)', display: 'grid', placeItems: 'center' }}>
              {opening === i ? <span className="spin-sm" /> : <Icon n="play" size={17} />}
            </span>
          </div>))}
      </div>
      <div className="src"><span className="dot" />
        <span>Chart positions from Apple's most-played feed; audio is matched and streamed ad-free.</span></div>
    </>)}
  </>);
}

/* ------------------------------------------------------------ genres tab */
function GenresTab({ player }) {
  const [open, setOpen] = useState(null);
  const [tracks, setTracks] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (g) => {
    setOpen(g); setBusy(true); setTracks(null);
    try {
      const r = await searchMusic(g.q);
      setTracks(r.tracks);
      r.tracks.slice(0, 2).forEach((t, i) => t.id && prefetchAudio(t.id, i));
    } catch { setTracks([]); }
    finally { setBusy(false); }
  };

  if (open) return (<>
    <button className="btn ghost sm" onClick={() => { setOpen(null); setTracks(null); }}
      style={{ marginBottom: 10 }}><Icon n="back" size={15} /> All genres</button>
    <div className="hubhead">
      <div className="hubico"><Icon n="music" size={24} /></div>
      <div><b>{open.label}</b><span className="dim sm">{tracks?.length || 0} songs</span></div>
    </div>
    {busy && <Spin t={`Loading ${open.label}`} />}
    {tracks?.length > 0 && (<>
      <button className="btn" style={{ width: '100%', marginBottom: 10 }}
        onClick={() => playList(player, tracks, 0)}>
        <Icon n="play" size={16} /> Play all {tracks.length}</button>
      <TrackList tracks={tracks} player={player}
        onPlay={(t, i) => playList(player, tracks, i)} />
    </>)}
    {tracks?.length === 0 && !busy && <Empty />}
  </>);

  return (<>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
      {GENRES.map((g) => (
        <button className="tile" key={g.id} onClick={() => load(g)}>
          <span className="ic"><Icon n="music" size={22} /></span>
          <b>{g.label}</b>
        </button>))}
    </div>
    <div className="src" style={{ marginTop: 14 }}><span className="dot" />
      <span>{GENRES.length} moods and languages. Every list plays as a queue and keeps going.</span></div>
  </>);
}

/* ---------------------------------------------------------- playlist tab */
function PlaylistTab({ player }) {
  const [q, setQ] = useState('punjabi hits');
  const [lists, setLists] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [tracks, setTracks] = useState(null);
  const [loadingTracks, setLoadingTracks] = useState(false);

  /* Only show playlists that actually expand: the mirror advertises many it
     cannot open (four of five came back empty in testing), and tapping one of
     those looked like a bug on our side. */
  const find = useCallback(async (term) => {
    setBusy(true); setLists(null);
    try { setLists(await findPlaylistsWithCounts(term)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { find('punjabi hits'); }, [find]);

  const openList = async (p) => {
    setOpen(p); setLoadingTracks(true); setTracks(null);
    try {
      const t = await playlistTracks(p.id);
      setTracks(t);
      t.slice(0, 2).forEach((x, i) => x.id && prefetchAudio(x.id, i));
    } catch { setTracks([]); }
    finally { setLoadingTracks(false); }
  };

  if (open) return (<>
    <button className="btn ghost sm" onClick={() => { setOpen(null); setTracks(null); }}
      style={{ marginBottom: 10 }}><Icon n="back" size={15} /> Playlists</button>
    <div className="hubhead">
      {open.art
        ? <img src={open.art} alt="" style={{ width: 62, height: 62, borderRadius: 14, objectFit: 'cover' }} />
        : <div className="hubico"><Icon n="list" size={24} /></div>}
      <div style={{ minWidth: 0 }}>
        <b style={{ fontSize: 15 }}>{open.name.slice(0, 46)}</b>
        <span className="dim sm">{tracks ? `${tracks.length} songs` : 'loading…'}{open.by ? ` · ${open.by}` : ''}</span>
      </div>
    </div>
    {loadingTracks && <Spin t="Loading the playlist" />}
    {tracks?.length > 0 && (<>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="btn sm" style={{ flex: 1 }} onClick={() => playList(player, tracks, 0)}>
          <Icon n="play" size={15} /> Play all</button>
        <button className="btn ghost sm" onClick={() => {
          const sh = [...tracks].sort(() => Math.random() - 0.5);
          player.setShuffle(true); playList(player, sh, 0);
        }}><Icon n="swap" size={15} /> Shuffle</button>
      </div>
      <TrackList tracks={tracks} player={player}
        onPlay={(t, i) => playList(player, tracks, i)} />
    </>)}
    {tracks?.length === 0 && !loadingTracks && <Empty t="This playlist came back empty" />}
  </>);

  return (<>
    <div className="fld">
      <div className="ip-wrap">
        <Icon n="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { find(q); e.target.blur(); } }}
          placeholder="Find a playlist…" enterKeyHint="search" />
      </div>
    </div>
    <div className="cats">
      {['punjabi hits', 'bollywood 2026', 'old is gold', 'coke studio',
        'sad songs', 'party mix', 'sufi', 'lofi'].map((x) => (
        <button key={x} className="cat" onClick={() => { setQ(x); find(x); }}>{x}</button>))}
    </div>
    {busy && <Spin t="Finding playlists" />}
    {lists?.length === 0 && !busy &&
      <Empty t="No playlists here that can be opened — try another search" />}
    {lists?.length > 0 && (
      <div className="list">
        {lists.map((p) => (
          <div className="row" key={p.id} onClick={() => openList(p)} style={{ cursor: 'pointer' }}>
            {p.art
              ? <img src={p.art} alt="" loading="lazy"
                  style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto' }} />
              : <div style={{ width: 48, height: 48, borderRadius: 9, background: 'var(--s3)',
                  display: 'grid', placeItems: 'center' }}><Icon n="list" size={20} /></div>}
            <div className="main">
              <b style={{ fontSize: 13 }}>{p.name.slice(0, 48)}</b>
              <span className="dim sm">{p.count ? `${p.count} songs` : 'playlist'}{p.by ? ` · ${p.by}` : ''}</span>
            </div>
            <Icon n="chevron" size={15} style={{ opacity: .5 }} />
          </div>))}
      </div>)}
    <div className="src" style={{ marginTop: 14 }}><span className="dot" />
      <span>A playlist can hold a hundred songs — the whole thing queues up and plays without stopping.</span></div>
  </>);
}

/* -------------------------------------------------------------- radio tab */
function RadioTab({ player }) {
  const [mode, setMode] = useState('desi');       // desi = endless mix · live = stations
  const [busy, setBusy] = useState(false);
  const [stations, setStations] = useState(null);
  const [err, setErr] = useState('');
  const [lang, setLang] = useState('punjabi');

  const startMix = async (seedQuery, label) => {
    setBusy(true); setErr('');
    try {
      const r = await searchMusic(seedQuery);
      if (!r.tracks.length) throw new Error('nothing found');
      const shuffled = [...r.tracks].sort(() => Math.random() - 0.5);
      player.setRadio(true);
      player.setShuffle(false);
      player.play(shuffled[0], shuffled);
      if (shuffled[1]?.id) prefetchAudio(shuffled[1].id, 0);
    } catch (e) { setErr(`Could not start ${label}: ${e.message}`); }
    finally { setBusy(false); }
  };

  const loadStations = useCallback(async (l) => {
    setBusy(true); setErr(''); setStations(null);
    try {
      const r = await P.radio[0].run({ q: l, mode: 'lang' });
      setStations(r);
    } catch (e) { setErr(e.message || 'Could not load stations'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (mode === 'live') loadStations(lang); }, [mode, lang, loadStations]);

  return (<>
    <div className="cats">
      <button className={`cat ${mode === 'desi' ? 'on' : ''}`} onClick={() => setMode('desi')}>
        Endless mix</button>
      <button className={`cat ${mode === 'live' ? 'on' : ''}`} onClick={() => setMode('live')}>
        Live stations</button>
    </div>

    {mode === 'desi' && (<>
      <Card>
        <div className="chead"><Icon n="radio" size={16} /> Non-stop radio</div>
        <div className="dim sm">
          Pick a station and it plays for as long as you like. When the list gets
          low it refills itself with more of the same, so the music never stops.
        </div>
      </Card>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
        {GENRES.map((g) => (
          <button className="tile" key={g.id} disabled={busy}
            onClick={() => startMix(g.q, g.label)}>
            <span className="ic"><Icon n="radio" size={22} /></span>
            <b>{g.label}</b>
            <small>non-stop</small>
          </button>))}
      </div>
      {busy && <Spin t="Starting the station" />}
      {err && <div className="note bad" style={{ marginTop: 10 }}>{err}</div>}
    </>)}

    {mode === 'live' && (<>
      <div className="cats">
        {['punjabi', 'hindi', 'urdu', 'bhojpuri', 'tamil', 'bengali'].map((l) => (
          <button key={l} className={`cat ${lang === l ? 'on' : ''}`}
            onClick={() => setLang(l)}>{l}</button>))}
      </div>
      {busy && <Spin t="Loading stations" />}
      {err && <Err error={err} retry={() => loadStations(lang)} />}
      {stations?.length > 0 && (
        <div className="list">
          {stations.map((st, i) => {
            const active = player.track && player.track.url === st.url;
            return (
              <div className="row" key={i} style={{ cursor: 'pointer' }}
                onClick={() => player.play({ ...st, title: st.name, stream: st.url, needsResolve: false }, stations)}>
                {st.fav
                  ? <img src={st.fav} alt="" loading="lazy"
                      style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto' }}
                      onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--s3)',
                      display: 'grid', placeItems: 'center' }}><Icon n="radio" size={19} /></div>}
                <div className="main">
                  <b style={{ fontSize: 13, color: active ? 'var(--green)' : '' }}>{st.name}</b>
                  <span className="dim sm">{st.country || ''}{st.bitrate ? ` · ${st.bitrate}kbps` : ''}</span>
                </div>
                <span className="tag c">live</span>
              </div>);
          })}
        </div>)}
    </>)}
  </>);
}

/* -------------------------------------------------------------- library tab */
/**
 * Favourites, recently played, most played, your own playlists — and the
 * proxy setting, which is here because it is the one thing that decides
 * whether music starts in half a second or ten.
 */
function LibraryTab({ player }) {
  const [, bump] = useState(0);
  useEffect(() => onLibrary(() => bump((n) => n + 1)), []);
  const [view, setView] = useState('fav');
  const [openPl, setOpenPl] = useState(null);
  const [newName, setNewName] = useState('');

  const stats = libraryStats();
  const favs = favourites();
  const hist = history();
  const top = topPlayed(25);
  const pls = playlists();

  /* --- one playlist, opened --- */
  if (openPl) {
    const pl = pls.find((p) => p.id === openPl);
    if (!pl) { setOpenPl(null); return null; }
    return (<>
      <button className="btn ghost sm" onClick={() => setOpenPl(null)} style={{ marginBottom: 10 }}>
        <Icon n="back" size={15} /> Library</button>
      <div className="hubhead">
        <div className="hubico"><Icon n="list" size={24} /></div>
        <div style={{ minWidth: 0 }}>
          <b>{pl.name}</b><span className="dim sm">{pl.tracks.length} songs</span>
        </div>
      </div>
      {pl.tracks.length === 0
        ? <Empty t="Empty — add songs with the + button on any track" />
        : (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn sm" style={{ flex: 1 }}
              onClick={() => playList(player, pl.tracks, 0)}>
              <Icon n="play" size={15} /> Play all</button>
            <button className="btn ghost sm" onClick={() => {
              const sh = [...pl.tracks].sort(() => Math.random() - 0.5);
              player.setShuffle(true); playList(player, sh, 0);
            }}><Icon n="swap" size={15} /> Shuffle</button>
          </div>
          <TrackList tracks={pl.tracks} player={player}
            onPlay={(t, i) => playList(player, pl.tracks, i)}
            onRemove={(t) => removeFromPlaylist(pl.id, t.id)} />
        </>)}
      <button className="btn ghost sm" style={{ width: '100%', marginTop: 14 }}
        onClick={() => { if (confirm(`Delete "${pl.name}"?`)) { deletePlaylist(pl.id); setOpenPl(null); } }}>
        <Icon n="x" size={14} /> Delete this playlist</button>
    </>);
  }

  const rows = view === 'fav' ? favs : view === 'recent' ? hist : top;

  return (<>
    <div className="g3" style={{ marginBottom: 12 }}>
      <div className="stat"><div className="v">{stats.favourites}</div><div className="l">Favourites</div></div>
      <div className="stat"><div className="v">{stats.playlists}</div><div className="l">Playlists</div></div>
      <div className="stat"><div className="v">{stats.history}</div><div className="l">Played</div></div>
    </div>

    <div className="cats">
      {[['fav', 'Favourites'], ['recent', 'Recent'], ['top', 'Most played'],
        ['lists', 'My playlists'], ['setup', 'Speed']].map(([v, l]) => (
        <button key={v} className={`cat ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>{l}</button>))}
    </div>

    {view === 'lists' && (<>
      <div className="fld" style={{ marginTop: 10 }}>
        <div className="ip-wrap">
          <Icon n="list" size={16} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { createPlaylist(newName); setNewName(''); } }}
            placeholder="New playlist name…" />
          <button className="ip-x" disabled={!newName.trim()} aria-label="Create"
            onClick={() => { if (newName.trim()) { createPlaylist(newName); setNewName(''); } }}>
            <Icon n="check" size={16} /></button>
        </div>
      </div>
      {pls.length === 0
        ? <Empty t="No playlists yet — name one above and press enter" />
        : <div className="list">
            {pls.map((p) => (
              <div className="row" key={p.id} onClick={() => setOpenPl(p.id)} style={{ cursor: 'pointer' }}>
                <div style={{ width: 44, height: 44, borderRadius: 9, background: 'var(--s3)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--green)' }}>
                  <Icon n="list" size={19} /></div>
                <div className="main">
                  <b style={{ fontSize: 13 }}>{p.name}</b>
                  <span className="dim sm">{p.tracks.length} songs</span>
                </div>
                <Icon n="chevron" size={15} style={{ opacity: .5 }} />
              </div>))}
          </div>}
    </>)}

    {view === 'setup' && <SpeedSetup />}

    {['fav', 'recent', 'top'].includes(view) && (<>
      {rows.length === 0
        ? <Empty t={view === 'fav'
            ? 'No favourites yet — tap the star on any song'
            : 'Nothing played yet'} />
        : (<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
            <span className="dim sm" style={{ flex: 1 }}>{rows.length} songs</span>
            <button className="btn ghost sm" onClick={() => playList(player, rows, 0)}>
              <Icon n="play" size={14} /> Play all</button>
            {view === 'recent' && rows.length > 0 &&
              <button className="btn ghost sm" onClick={() => { if (confirm('Clear history?')) clearHistory(); }}>
                <Icon n="x" size={14} /></button>}
          </div>
          <TrackList tracks={rows} player={player}
            onPlay={(t, i) => playList(player, rows, i)} />
        </>)}
    </>)}
  </>);
}

/* --------------------------------------------------------- speed / proxy */
function SpeedSetup() {
  const [url, setUrl] = useState(getSettings().proxyUrl || '');
  const [state, setState] = useState(null);   // { ok, ms, error }
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true); setState(null);
    const r = await testProxy(url);
    setState(r);
    if (r.ok) setSetting('proxyUrl', url.trim().replace(/\/+$/, ''));
    setBusy(false);
  };

  return (<>
    <Card>
      <div className="chead"><Icon n="signal" size={16} /> Make playback fast and reliable</div>
      <div className="dim sm" style={{ lineHeight: 1.65 }}>
        Songs are fetched through a relay. The free public relays are heavily
        rate-limited, which is why a song sometimes starts in three seconds and
        sometimes takes twenty. Running your own — free, five minutes, no card —
        makes it consistently fast.
      </div>
      <div className="fld" style={{ marginTop: 12 }}>
        <label>Your relay address</label>
        <div className="ip-wrap">
          <Icon n="link" size={16} />
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://omni-proxy.you.workers.dev" spellCheck="false" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn sm" style={{ flex: 1 }} disabled={busy || !url.trim()} onClick={check}>
          {busy ? 'Checking…' : 'Test & save'}</button>
        {getSettings().proxyUrl &&
          <button className="btn ghost sm" onClick={() => { setSetting('proxyUrl', ''); setUrl(''); setState(null); }}>
            Remove</button>}
      </div>
      {state?.ok && <div className="note" style={{ marginTop: 10 }}>
        Working — answered in {state.ms} ms. Saved and in use.</div>}
      {state && !state.ok && <div className="note bad" style={{ marginTop: 10 }}>{state.error}</div>}
      {!state && getSettings().proxyUrl &&
        <div className="note" style={{ marginTop: 10 }}>A relay is saved and in use.</div>}
    </Card>

    <Card>
      <div className="chead"><Icon n="info" size={16} /> How to set one up</div>
      <ol className="steps">
        <li>Open <b>dash.cloudflare.com</b> and sign in (a free account is fine).</li>
        <li>Go to <b>Workers &amp; Pages</b> → <b>Create</b> → <b>Workers</b> → <b>Create Worker</b>.</li>
        <li>Give it any name, press <b>Deploy</b>, then <b>Edit code</b>.</li>
        <li>Delete what is there and paste the contents of <b>worker/omni-proxy.js</b>
            from the project, then <b>Deploy</b>.</li>
        <li>Copy the address it shows you and paste it in the box above.</li>
      </ol>
      <div className="src"><span className="dot" />
        <span>Cloudflare's free plan allows 100,000 requests a day — far more than
          this app can use. Nothing is stored on it; it only passes requests through.</span></div>
    </Card>
  </>);
}
