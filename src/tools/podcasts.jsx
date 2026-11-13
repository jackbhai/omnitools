/**
 * Podcasts — search the big keyless index, open a show, play episodes.
 *
 * Episodes come from the show's own public feed (direct first, relayed
 * second). Where you stopped in an episode is remembered on this device
 * and offered back as a resume — long katha and story episodes are the
 * ones that need it most.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { podcastSearch, podcastBrowse, podcastFeed, PODCAST_GENRES } from '../core/podcasts';
import { useData, useDebounced, Spin, Err, Empty, Src, Search } from '../ui/kit';
import { useStreamPlayer, StreamBar } from '../ui/stream';
import { Icon } from '../ui/icons';

const POSKEY = 'omni:pod:pos';
const loadPos = () => { try { return JSON.parse(localStorage.getItem(POSKEY) || '{}'); } catch { return {}; } };
const savePos = (url, sec) => {
  try {
    const m = loadPos();
    if (sec > 10) m[url] = Math.floor(sec); else delete m[url];
    const keys = Object.keys(m).slice(-60);
    const out = {}; for (const k of keys) out[k] = m[k];
    localStorage.setItem(POSKEY, JSON.stringify(out));
  } catch { /* storage off */ }
};

const dstr = (raw) => {
  if (!raw) return '';
  if (/^\d+$/.test(raw)) { const s = +raw; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m} min`; }
  return raw;
};

export function Podcasts() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [genre, setGenre] = useState(PODCAST_GENRES[1]);   // Stories & Katha first
  const [show, setShow] = useState(null);
  const p = useStreamPlayer();
  const posRef = useRef(null);

  const searching = dq.trim().length >= 2;
  const s = useData('podsearch', podcastSearch, { q: dq.trim() },
    { ttl: 36e5, deps: [dq], auto: false, spread: false });
  const b = useData('podbrowse', podcastBrowse, { genreId: genre.id },
    { ttl: 36e5, deps: [genre.id], spread: false });
  useEffect(() => { if (searching) s.run({ q: dq.trim() }); }, [dq]);   // eslint-disable-line

  const f = useData('podfeed', podcastFeed, { feed: show?.feed },
    { ttl: 36e5, deps: [show?.id], auto: false, spread: false });
  useEffect(() => { if (show) f.run({ feed: show.feed }); }, [show?.id]);   // eslint-disable-line

  /* Remember episode positions as they play; offer resume on replay. */
  useEffect(() => {
    posRef.current = p.cur?.key || null;
  }, [p.cur?.key]);
  useEffect(() => {
    if (posRef.current && p.pos > 0 && p.status !== 'playing') savePos(posRef.current, p.pos);
    if (posRef.current && p.status === 'playing' && Math.floor(p.pos) % 15 === 0) savePos(posRef.current, p.pos);
  }, [p.pos, p.status]);

  const playEp = (showTitle, showArt, ep) => {
    const saved = loadPos()[ep.audio] || 0;
    p.play({ key: ep.audio, title: ep.title, sub: showTitle, art: showArt },
      ep.audio, { live: false, startAt: saved > 10 ? saved : 0 });
  };

  if (show) {
    return (<>
      <button className="btn ghost sm" onClick={() => setShow(null)}>
        <Icon n="back" size={14} /> All shows</button>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
        {show.art && <img src={show.art} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} referrerPolicy="no-referrer" />}
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 16, display: 'block' }}>{show.title}</b>
          <span className="dim sm">{show.author}{show.genre ? ` · ${show.genre}` : ''}</span>
        </div>
      </div>
      {f.loading && <Spin t="Loading episodes" />}
      {f.error && <Err error={f.error} retry={() => f.run({ feed: show.feed })} />}
      {f.data && (<>
        <div className="dim sm" style={{ margin: '12px 0 8px' }}>{f.data.episodes.length} episodes</div>
        <div className="list">
          {f.data.episodes.map((ep, i) => {
            const active = p.cur?.key === ep.audio;
            const saved = loadPos()[ep.audio] || 0;
            return (
              <div className={`row ${active ? 'stream-on' : ''}`} key={ep.audio + i}>
                <button className="stream-play" aria-label={`Play ${ep.title}`}
                  onClick={() => playEp(show.title, show.art || f.data.art, ep)}>
                  <Icon n={active && p.status === 'playing' ? 'pause' : 'play'} size={17} />
                </button>
                <div className="main" style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, display: 'block' }}>{ep.title}</b>
                  <span className="dim sm" style={{ display: 'block' }}>
                    {[ep.date ? new Date(ep.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
                      dstr(ep.dur), saved > 10 ? `Resume at ${Math.floor(saved / 60)}:${String(Math.floor(saved % 60)).padStart(2, '0')}` : '']
                      .filter(Boolean).join(' · ')}
                  </span>
                  {ep.desc && <span className="dim sm" style={{ display: 'block', marginTop: 2 }}>{ep.desc}</span>}
                </div>
              </div>);
          })}
        </div>
        <Src meta={f.meta} />
      </>)}
      <StreamBar p={p} />
    </>);
  }

  const list = searching ? s.data : b.data;
  const loading = searching ? s.loading : b.loading;
  const error = searching ? s.error : b.error;

  return (<>
    <Search value={q} onChange={setQ} ph="Search podcasts…" />
    {!searching && (
      <div className="cats" style={{ marginTop: 10 }}>
        {PODCAST_GENRES.map((g) => (
          <button key={g.id} className={`cat ${genre.id === g.id ? 'on' : ''}`} onClick={() => setGenre(g)}>{g.n}</button>))}
      </div>)}
    {loading && <Spin t="Finding shows" />}
    {error && <Err error={error} retry={() => (searching ? s.run({ q: dq.trim() }) : b.run({ genreId: genre.id }))} />}
    {!loading && !error && list && list.length === 0 && <Empty icon="wave" t="No shows found" />}
    {!loading && !error && list && list.length > 0 && (<>
      <div className="list" style={{ marginTop: 10 }}>
        {list.map((sh) => (
          <button className="row" key={sh.id} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}
            onClick={() => setShow(sh)}>
            {sh.art
              ? <img src={sh.art} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} loading="lazy" referrerPolicy="no-referrer" />
              : <span className="stream-art stream-art-ph" style={{ width: 46, height: 46 }}><Icon n="wave" size={18} /></span>}
            <div className="main" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5, display: 'block' }}>{sh.title}</b>
              <span className="dim sm" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[sh.author, sh.genre, sh.count ? `${sh.count} episodes` : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
            <Icon n="chevron" size={16} />
          </button>))}
      </div>
      <Src meta={searching ? s.meta : b.meta} />
    </>)}
    <StreamBar p={p} />
  </>);
}

export default Podcasts;
