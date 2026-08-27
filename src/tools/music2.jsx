/**
 * Music search — YouTube-first, because that is where Punjabi / Pakistani
 * catalogue actually lives (verified: Audius returns 0 for "touchwood babbu
 * maan" and "ishq murshid", YouTube returns all of them).
 *
 * Tabs: Songs (YouTube) · Radio (live desi stations) · Archive (downloadable)
 */
import React, { useEffect, useState } from 'react';
import * as P from '../core/providers';
import { ytSearch } from '../core/ytmusic';
import { usePlayer } from '../core/player';
import { prefetchAudio, isCached, onWarm } from '../core/audio-resolve';
import { useData, Spin, Err, Empty, Src, Search, Chips, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';

const mmss = (s) => !s ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const QUICK = ['babbu maan', 'ishq murshid', 'cheema y', 'sidhu moose wala',
  'diljit dosanjh', 'atif aslam', 'punjabi 2026', 'coke studio pakistan'];

export function Music() {
  const player = usePlayer();
  const [tab, setTab] = useState('songs');
  // re-render when a background prefetch lands, so the "ready" badge appears
  const [, bump] = useState(0);
  useEffect(() => onWarm(() => bump((n) => n + 1)), []);
  const [q, setQ] = useState('babbu maan');
  const [lang, setLang] = useState('punjabi');

  const pool = tab === 'songs' ? ytSearch
    : tab === 'radio' ? P.radio
    : [P.musicSearch[1]];
  const params = tab === 'radio' ? { q: lang, mode: 'lang' } : { q };
  const s = useData('music-' + tab, pool, params, { auto: true, ttl: 6e5, deps: [tab] });

  /**
   * Warm the top results the moment they appear.
   *
   * Resolving an ad-free stream costs 8-20 s upstream, and previously that
   * whole wait happened AFTER the tap — measured 21 s to first audio on a
   * cold load. Warming the first four results while the user is still reading
   * the list turns the tap into a near-instant play. Two resolve at a time,
   * only on the Songs tab, and each stays cached for 55 minutes.
   */
  useEffect(() => {
    if (tab !== 'songs' || !s.data?.length) return;
    const top = s.data.slice(0, 4).filter((t) => t?.id && !isCached(t.id));
    if (!top.length) return;
    const t = setTimeout(() => top.forEach((x) => prefetchAudio(x.id)), 250);
    return () => clearTimeout(t);
  }, [s.data, tab]);

  const openArchive = async (t) => {
    try {
      const m = await fetch(`https://archive.org/metadata/${t.archiveId}`).then((r) => r.json());
      const f = (m.files || []).find((x) => /\.(mp3|ogg|flac|m4a)$/i.test(x.name));
      if (!f) throw new Error('no audio');
      const url = `https://archive.org/download/${t.archiveId}/${encodeURIComponent(f.name)}`;
      player.play({ ...t, stream: url, dlUrl: url, needsResolve: false }, s.data);
    } catch { alert('Could not load this recording.'); }
  };

  const onPick = (t) => {
    if (tab === 'archive') return openArchive(t);
    if (tab === 'radio') return player.play({ ...t, title: t.name, stream: t.url, needsResolve: false }, s.data);
    player.play(t, s.data);   // songs: resolved on play
  };

  return (<>
    <div className="cats">
      {[['songs','music','Songs'],['radio','radio','Radio'],['archive','disc','Archive']].map(([v, ic, l]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}>
          <Icon n={ic} size={14} /> {l}</button>))}
    </div>

    {tab === 'radio' ? (
      <div className="btnrow">
        {['punjabi','hindi','urdu','bhojpuri','tamil','bengali'].map((l) => (
          <button key={l} className={`cat ${lang === l ? 'on' : ''}`}
            onClick={() => { setLang(l); s.run({ q: l, mode: 'lang' }); }}>{l}</button>))}
      </div>
    ) : (<>
      <Search value={q} onChange={setQ} onSubmit={() => q.trim() && s.run({ q: q.trim() })}
        ph="Search any song, artist, album…" />
      <div className="cats">
        {QUICK.map((x) => (
          <button key={x} className="cat" onClick={() => { setQ(x); s.run({ q: x }); }}>{x}</button>))}
      </div>
    </>)}

    {s.loading && <Spin t="Searching" />}
    {s.error && <Err error={s.error} retry={() => s.run()} />}
    {s.data?.length === 0 && <Empty />}
    {s.data?.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{s.data.length} results</div>
      <div className="list">
        {s.data.map((t, i) => {
          const active = player.track && (player.track.id ?? player.track.url) === (t.id ?? t.url);
          return (
            <div className="row" key={t.id || i} onClick={() => onPick(t)}
              style={{ cursor: 'pointer', background: active ? 'rgba(0,255,156,.07)' : '' }}>
              {(t.art || t.fav)
                ? <img src={t.art || t.fav} alt="" loading="lazy"
                    style={{ width: 46, height: 46, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto', background: 'var(--s3)' }}
                    onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                : <div style={{ width: 46, height: 46, borderRadius: 9, background: 'var(--s3)',
                    display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                    <Icon n={tab === 'radio' ? 'radio' : 'music'} size={20} style={{ opacity: .55 }} /></div>}
              <div className="main">
                <b style={{ fontSize: 13.5, color: active ? 'var(--green)' : '' }}>
                  {(t.title || t.name || '').slice(0, 52)}</b>
                <span className="dim sm">
                  {t.artist || t.country || ''}
                  {t.bitrate ? ` · ${t.bitrate}kbps` : ''}
                  {t.dur ? ` · ${mmss(t.dur)}` : ''}
                  {t.views ? ` · ${fmt(t.views)} plays` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                {tab === 'archive' && <span className="tag g">save</span>}
                {tab === 'radio' && <span className="tag c">live</span>}
                {tab === 'songs' && t.id && isCached(t.id) && !active &&
                  <span className="tag g" title="Stream already resolved — plays instantly">ready</span>}
                <span style={{ color: active && player.playing ? 'var(--green)' : 'var(--fg2)',
                               display: 'grid', placeItems: 'center' }}>
                  <Icon n={active && player.playing ? 'pause' : 'play'} size={18} /></span>
              </div>
            </div>);
        })}
      </div>
      <Src meta={s.meta} />
    </>)}

    <div className="src" style={{ marginTop: 14 }}>
      <span className="dot" />
      <span>Songs stream from YouTube via open front-ends. Radio is live. Archive.org items are
        public-domain / CC and downloadable.</span>
    </div>
  </>);
}
