/**
 * Movies & TV — the deep view.
 *
 * A title page answers, in this order, the things people actually came for:
 * when it started and whether it is still going, how many seasons and how many
 * episodes, what it scored, who directed and who is in it (with the character
 * they played), every episode with its air date and its own rating, and a
 * trailer.
 *
 * Facts are merged from two independent catalogues (see src/core/screen.js) and
 * the page says which ones answered. If one is down the other still renders the
 * page rather than an error.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../core/screen';
import { Icon } from '../ui/icons';
import { Card, Spin, Empty, fmt } from '../ui/kit';

const TABS = [
  { id: 'search',  n: 'Search',   i: 'search' },
  { id: 'browse',  n: 'Browse',   i: 'grid'   },
  { id: 'today',   n: 'On today', i: 'calendar' },
  { id: 'people',  n: 'People',   i: 'smile'  },
];

const Poster = ({ src, alt, ratio = '2/3' }) => (
  src
    ? <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer"
        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        style={{ width: '100%', aspectRatio: ratio, objectFit: 'cover', background: 'var(--s2)' }} />
    : <div style={{ aspectRatio: ratio, display: 'grid', placeItems: 'center', background: 'var(--s2)', color: 'var(--fg3)' }}>
        <Icon n="film" size={20} /></div>
);

const Score = ({ v }) => v == null ? null : (
  <span style={{ color: v >= 8 ? 'var(--green)' : v >= 6.5 ? 'var(--cyan)' : 'var(--fg3)', fontWeight: 700 }}>
    {(+v).toFixed(1)}</span>
);

/* --------------------------------------------------------------- title card */
const Tile = ({ m, onOpen }) => (
  <button className="tile" onClick={() => onOpen(m)}
    style={{ padding: 0, overflow: 'hidden', minHeight: 0, display: 'block', textAlign: 'left', cursor: 'pointer' }}>
    <Poster src={S.posterOf(m)} alt={m.title} />
    <div style={{ padding: '8px 9px 10px' }}>
      <b style={{ fontSize: 12, display: 'block', lineHeight: 1.25 }}>{m.title}</b>
      <span className="dim" style={{ fontSize: 10.5 }}>
        {String(m.year || '').slice(0, 9)}
        {m.rating != null && <> · <Score v={m.rating} /></>}
        {m.type === 'series' && ' · TV'}
      </span>
    </div>
  </button>
);

const Grid = ({ list, onOpen }) => (
  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(126px,1fr))' }}>
    {list.map((m, i) => <Tile key={(m.id || m.title) + i} m={m} onOpen={onOpen} />)}
  </div>
);

/* ------------------------------------------------------------- detail sheet */
function Detail({ seed, onBack }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [season, setSeason] = useState(null);
  const [showAllCast, setShowAllCast] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setD(null);
    (async () => {
      try {
        let full = null;
        const imdbish = seed.imdb || (String(seed.id || '').startsWith('tt') ? seed.id : '');
        if (imdbish) full = await S.detail(seed.type, imdbish, { tvmazeId: seed.tvmaze });
        else if (seed.tvmaze) {
          /* No IMDb id — build the page from the television index alone. */
          const eps = await S.tvEpisodes(seed.tvmaze);
          full = {
            ...seed, episodes: eps,
            seasons: [...new Set(eps.map((e) => e.season))].sort((a, b) => a - b),
            episodeCount: eps.length, seasonCount: new Set(eps.map((e) => e.season)).size,
            cast: [], src: ['tv'],
          };
        } else throw new Error('This title has no id to look up');
        if (!alive) return;
        setD(full);
        setSeason(full.seasons?.[0] ?? null);
      } catch (e) { if (alive) setErr(e.message); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, [seed.id, seed.tvmaze]);   // eslint-disable-line

  if (busy) return (<><button className="btn ghost sm" onClick={onBack}>← Back</button><Spin t="Reading both catalogues" /></>);
  if (err || !d) return (<>
    <button className="btn ghost sm" onClick={onBack}>← Back</button>
    <div className="err" style={{ marginTop: 12 }}><h4>Could not open this title</h4><p>{err}</p></div></>);

  const eps = (d.episodes || []).filter((e) => season == null || e.season === season);
  const cast = d.billedCast?.length ? d.billedCast : (d.cast || []).map((n) => ({ name: n, character: '' }));
  const castShown = showAllCast ? cast : cast.slice(0, 12);

  return (<>
    <button className="btn ghost sm" onClick={onBack}>← Back</button>

    {/* ---- hero */}
    <Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
      {d.backdrop && (
        <div style={{ position: 'relative' }}>
          <img src={d.backdrop} alt="" referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
            style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.92))' }} />
          {d.logo && <img src={d.logo} alt="" referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ position: 'absolute', left: 14, bottom: 12, maxWidth: '58%', maxHeight: 62 }} />}
        </div>)}
      <div style={{ padding: 14, display: 'flex', gap: 12 }}>
        <div style={{ width: 92, flex: '0 0 auto', borderRadius: 10, overflow: 'hidden' }}>
          <Poster src={S.posterOf(d)} alt={d.title} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 25, letterSpacing: .6, lineHeight: 1.05, margin: 0 }}
            className="gradtext">{d.title}</h2>
          <div className="dim sm" style={{ marginTop: 5 }}>{S.runLine(d)}</div>
          <div className="btnrow" style={{ marginTop: 8 }}>
            {d.rating != null && <span className="pill on"><Icon n="staron" size={12} /> IMDb <Score v={d.rating} /></span>}
            {d.tvRating != null && d.tvRating !== d.rating && <span className="pill">TV index {(+d.tvRating).toFixed(1)}</span>}
            {d.status && <span className="pill">{d.status}</span>}
            {d.network && <span className="pill">{d.network}</span>}
          </div>
        </div>
      </div>
    </Card>

    {/* ---- the facts people ask for */}
    <div className="g3" style={{ marginTop: 10 }}>
      {d.type === 'series' && <div className="stat"><div className="v">{d.seasonCount || '—'}</div><div className="l">Seasons</div></div>}
      {d.type === 'series' && <div className="stat"><div className="v">{d.episodeCount || '—'}</div><div className="l">Episodes</div></div>}
      <div className="stat">
        <div className="v" style={{ fontSize: 17 }}>
          {(d.premiered || d.released || '').slice(0, 4) || String(d.year || '').slice(0, 4) || '—'}</div>
        <div className="l">{d.type === 'series' ? 'Started' : 'Released'}</div></div>
      {d.type === 'movie' && d.runtime && <div className="stat"><div className="v" style={{ fontSize: 17 }}>{d.runtime}</div><div className="l">Runtime</div></div>}
      {d.type === 'series' && d.avgRuntime && <div className="stat"><div className="v" style={{ fontSize: 17 }}>{d.avgRuntime}m</div><div className="l">Per episode</div></div>}
    </div>

    {d.nextEpisode && (
      <Card style={{ marginTop: 10, borderColor: 'rgba(0,255,156,.3)' }}>
        <div className="chead"><Icon n="calendar" size={15} /> Next episode</div>
        <b style={{ fontSize: 14 }}>S{d.nextEpisode.season} E{d.nextEpisode.number} · {d.nextEpisode.title}</b>
        <div className="dim sm" style={{ marginTop: 3 }}>{S.airedLabel(d.nextEpisode.airstamp)}</div>
      </Card>)}

    {d.desc && <Card style={{ marginTop: 10 }}>
      <div className="chead">Story</div>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--fg2)' }}>{d.desc}</p></Card>}

    {/* ---- credits */}
    <Card style={{ marginTop: 10 }}>
      <div className="chead">Details</div>
      {d.genres?.length > 0 && <div className="kv"><span>Genre</span><b style={{ fontSize: 12.5 }}>{d.genres.join(', ')}</b></div>}
      {d.directors?.length > 0 && <div className="kv"><span>Director</span><b style={{ fontSize: 12.5 }}>{d.directors.join(', ')}</b></div>}
      {d.writers?.length > 0 && <div className="kv"><span>Writer</span><b style={{ fontSize: 12.5 }}>{d.writers.slice(0, 4).join(', ')}</b></div>}
      {d.country && <div className="kv"><span>Country</span><b style={{ fontSize: 12.5 }}>{d.country}</b></div>}
      {d.language && <div className="kv"><span>Language</span><b>{d.language}</b></div>}
      {d.networkCountry && <div className="kv"><span>Aired in</span><b>{d.networkCountry}</b></div>}
      {d.schedule && <div className="kv"><span>Schedule</span><b style={{ fontSize: 12.5 }}>{d.schedule}</b></div>}
      {d.released && <div className="kv"><span>Release date</span><b>{S.airedLabel(d.released)}</b></div>}
      {d.ended && <div className="kv"><span>Ended</span><b>{S.airedLabel(d.ended)}</b></div>}
      {d.awards && <div className="kv"><span>Awards</span><b style={{ fontSize: 12 }}>{d.awards}</b></div>}
      {d.imdb && <a className="btn ghost" style={{ display: 'block', textAlign: 'center', marginTop: 10, textDecoration: 'none' }}
        href={`https://www.imdb.com/title/${d.imdb}/`} target="_blank" rel="noreferrer">Open on IMDb</a>}
    </Card>

    {cast.length > 0 && (
      <Card style={{ marginTop: 10 }}>
        <div className="chead">Cast · {cast.length}</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
          {castShown.map((c, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              {c.image
                ? <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 12, background: 'var(--s2)' }} />
                : <div style={{ aspectRatio: '1/1', borderRadius: 12, background: 'var(--s2)',
                    display: 'grid', placeItems: 'center', color: 'var(--fg3)' }}><Icon n="smile" size={20} /></div>}
              <b style={{ fontSize: 11, display: 'block', marginTop: 5, lineHeight: 1.2 }}>{c.name}</b>
              {c.character && <span className="dim" style={{ fontSize: 10 }}>{c.character}</span>}
            </div>))}
        </div>
        {cast.length > 12 && (
          <button className="btn ghost sm" style={{ marginTop: 10, width: '100%' }}
            onClick={() => setShowAllCast((v) => !v)}>
            {showAllCast ? 'Show fewer' : `Show all ${cast.length}`}</button>)}
      </Card>)}

    {d.trailers?.length > 0 && (
      <Card style={{ marginTop: 10 }}>
        <div className="chead">Trailers</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
          {d.trailers.map((t, i) => (
            <a key={i} href={S.ytWatch(t.yt)} target="_blank" rel="noreferrer"
              style={{ display: 'block', borderRadius: 10, overflow: 'hidden', position: 'relative', textDecoration: 'none' }}>
              <img src={S.ytThumb(t.yt)} alt="" loading="lazy" referrerPolicy="no-referrer"
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block', background: 'var(--s2)' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                background: 'rgba(0,0,0,.32)', color: '#fff' }}><Icon n="play" size={26} /></span>
            </a>))}
        </div>
      </Card>)}

    {/* ---- seasons + episodes */}
    {d.seasonList?.length > 0 && (
      <Card style={{ marginTop: 10 }}>
        <div className="chead">Seasons</div>
        {d.seasonList.map((s) => (
          <div className="kv" key={s.number}>
            <span>Season {s.number}{s.name ? ` · ${s.name}` : ''}</span>
            <b style={{ fontSize: 12 }}>
              {s.episodes ? `${s.episodes} ep` : ''}
              {s.premiere ? ` · ${s.premiere.slice(0, 4)}` : ''}
              {s.end && s.end.slice(0, 4) !== s.premiere?.slice(0, 4) ? `–${s.end.slice(0, 4)}` : ''}
            </b>
          </div>))}
      </Card>)}

    {d.episodes?.length > 0 && (<>
      <div className="chead" style={{ marginTop: 14 }}>
        Episodes · {d.episodes.length}{season != null ? ` · season ${season}` : ''}</div>
      {d.seasons?.length > 1 && (
        <div className="btnrow">
          {d.seasons.map((s) => (
            <button key={s} className={`cat ${season === s ? 'on' : ''}`} onClick={() => setSeason(s)}>S{s}</button>))}
          <button className={`cat ${season == null ? 'on' : ''}`} onClick={() => setSeason(null)}>All</button>
        </div>)}
      <div className="list">
        {eps.map((e, i) => (
          <div className="row" key={`${e.season}-${e.number}-${i}`} style={{ alignItems: 'flex-start', gap: 10 }}>
            {e.thumb
              ? <img src={e.thumb} alt="" loading="lazy" referrerPolicy="no-referrer"
                  onError={(e2) => { e2.currentTarget.style.display = 'none'; }}
                  style={{ width: 84, height: 48, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto', background: 'var(--s2)' }} />
              : <span className="mono" style={{ width: 46, textAlign: 'center', background: 'var(--s2)',
                  borderRadius: 8, padding: '7px 0', flex: '0 0 auto', fontSize: 11.5, color: 'var(--fg2)' }}>
                  S{e.season}E{e.number}</span>}
            <div className="main" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 12.8 }}>{e.thumb ? `S${e.season}E${e.number} · ` : ''}{e.title}</b>
              {e.overview && <span className="dim" style={{ fontSize: 11, lineHeight: 1.4, display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 2 }}>{e.overview}</span>}
              <span className="dim" style={{ fontSize: 10.5, display: 'block', marginTop: 3 }}>
                {S.airedLabel(e.aired)}{e.rating ? <> · <Score v={e.rating} /></> : ''}</span>
            </div>
          </div>))}
      </div>
    </>)}

    <div className="src"><span className="dot" />
      <span>Merged from {d.src?.length === 2 ? 'both catalogues' : 'one catalogue'}
        {d.src?.length === 1 ? ' — the other had no record of this title' : ''}</span></div>
  </>);
}

/* ------------------------------------------------------------- person sheet */
function Person({ p, onBack, onOpenShow }) {
  const [credits, setCredits] = useState(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let alive = true;
    S.personCredits(p.id).then((c) => alive && setCredits(c)).catch(() => alive && setCredits([]))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [p.id]);
  return (<>
    <button className="btn ghost sm" onClick={onBack}>← Back</button>
    <Card style={{ marginTop: 10, display: 'flex', gap: 12 }}>
      {p.image
        ? <img src={p.image} alt="" referrerPolicy="no-referrer"
            style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover', flex: '0 0 auto' }} />
        : <div style={{ width: 84, height: 84, borderRadius: 14, background: 'var(--s2)',
            display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon n="smile" size={26} /></div>}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 23, margin: 0, letterSpacing: .5 }} className="gradtext">{p.name}</h2>
        {p.birthday && <div className="dim sm" style={{ marginTop: 4 }}>
          Born {S.airedLabel(p.birthday)}
          {!p.deathday && <> · {Math.floor((Date.now() - new Date(p.birthday)) / 3.15576e10)} years old</>}</div>}
        {p.deathday && <div className="dim sm">Died {S.airedLabel(p.deathday)}</div>}
        {p.country && <div className="dim sm">{p.country}</div>}
      </div>
    </Card>
    {busy && <Spin t="Reading credits" />}
    {!busy && credits?.length > 0 && (<>
      <div className="chead" style={{ marginTop: 14 }}>Credits · {credits.length}</div>
      <div className="list">
        {credits.map((c, i) => (
          <button className="row" key={i} style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%' }}
            onClick={() => onOpenShow({ id: c.imdb || `tvmaze:${c.tvmaze}`, imdb: c.imdb, tvmaze: c.tvmaze,
              type: 'series', title: c.show, year: c.year, poster: c.poster, rating: c.rating })}>
            {c.poster
              ? <img src={c.poster} alt="" loading="lazy" referrerPolicy="no-referrer"
                  style={{ width: 42, height: 60, borderRadius: 7, objectFit: 'cover', flex: '0 0 auto' }} />
              : <span style={{ width: 42, height: 60, borderRadius: 7, background: 'var(--s2)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon n="film" size={15} /></span>}
            <div className="main"><b style={{ fontSize: 13 }}>{c.show}</b>
              <span className="dim sm">{c.year} · {c.kind}{c.rating ? ` · ${c.rating}` : ''}</span></div>
          </button>))}
      </div>
    </>)}
    {!busy && credits?.length === 0 && <Empty t="No credits listed" />}
  </>);
}

/* ------------------------------------------------------------------- shell */
export function Screen() {
  const [tab, setTab] = useState('search');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [person, setPerson] = useState(null);
  const [people, setPeople] = useState([]);

  const [row, setRow] = useState('top');
  const [bType, setBType] = useState('movie');
  const [genre, setGenre] = useState('');
  const [page, setPage] = useState(0);

  const [cc, setCc] = useState('US');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sched, setSched] = useState([]);

  const token = useRef(0);

  const run = async (fn, setter, label) => {
    const my = ++token.current;
    setBusy(true); setErr('');
    try {
      const r = await fn();
      if (token.current !== my) return;
      setter(r);
      if (!r.length) setErr(`${label} returned nothing.`);
    } catch (e) {
      if (token.current !== my) return;
      setter([]); setErr(e.message);
    } finally { if (token.current === my) setBusy(false); }
  };

  const doSearch = () => { if (q.trim()) run(() => S.search(q, { type }), setList, 'That search'); };

  useEffect(() => {
    if (tab === 'browse') { setPage(0); run(() => S.browse(row, bType, { genre }), setList, 'This row'); }
  }, [tab, row, bType, genre]);   // eslint-disable-line

  useEffect(() => {
    if (tab === 'today') run(() => S.schedule(cc, date), setSched, "Today's schedule");
  }, [tab, cc, date]);   // eslint-disable-line

  if (person) return <Person p={person} onBack={() => setPerson(null)}
    onOpenShow={(m) => { setPerson(null); setOpen(m); }} />;
  if (open) return <Detail seed={open} onBack={() => setOpen(null)} />;

  return (<>
    <div className="cats">
      {TABS.map((t) => (
        <button key={t.id} className={`cat ${tab === t.id ? 'on' : ''}`}
          onClick={() => { setTab(t.id); setErr(''); }}>
          <Icon n={t.i} size={13} /> {t.n}</button>))}
    </div>

    {tab === 'search' && (<>
      <form className="search" onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector('input')?.blur(); doSearch(); }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Any film or show…" autoComplete="off" spellCheck="false" />
      </form>
      <div className="btnrow">
        {[['all', 'Everything'], ['movie', 'Films'], ['series', 'Television']].map(([v, l]) => (
          <button key={v} className={`cat ${type === v ? 'on' : ''}`}
            onClick={() => { setType(v); if (q.trim()) run(() => S.search(q, { type: v }), setList, 'That search'); }}>{l}</button>))}
      </div>
      <div className="btnrow">
        {['Panchayat', 'Sacred Games', 'Dune', 'Breaking Bad', 'Mirzapur', '3 Idiots'].map((x) => (
          <button key={x} className="cat" onClick={() => { setQ(x); run(() => S.search(x, { type }), setList, 'That search'); }}>{x}</button>))}
      </div>
    </>)}

    {tab === 'browse' && (<>
      <div className="btnrow">
        {S.ROWS.map((r) => (
          <button key={r.id} className={`cat ${row === r.id ? 'on' : ''}`} onClick={() => setRow(r.id)}>{r.n}</button>))}
      </div>
      <div className="btnrow">
        {[['movie', 'Films'], ['series', 'Television']].map(([v, l]) => (
          <button key={v} className={`cat ${bType === v ? 'on' : ''}`} onClick={() => setBType(v)}>{l}</button>))}
      </div>
      <div className="btnrow">
        <button className={`cat ${!genre ? 'on' : ''}`} onClick={() => setGenre('')}>All genres</button>
        {S.GENRES.map((g) => (
          <button key={g} className={`cat ${genre === g ? 'on' : ''}`}
            onClick={() => setGenre(genre === g ? '' : g)}>{g}</button>))}
      </div>
    </>)}

    {tab === 'today' && (<>
      <div className="btnrow">
        {S.SCHEDULE_COUNTRIES.map(([v, l]) => (
          <button key={v} className={`cat ${cc === v ? 'on' : ''}`} onClick={() => setCc(v)}>{l}</button>))}
      </div>
      <div className="fld" style={{ marginTop: 8 }}><label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
    </>)}

    {tab === 'people' && (
      <form className="search" onSubmit={(e) => {
        e.preventDefault(); e.currentTarget.querySelector('input')?.blur();
        if (q.trim()) run(() => S.searchPeople(q), setPeople, 'That name');
      }}>
        <Icon n="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Actor, writer, director…" autoComplete="off" />
      </form>)}

    {busy && <Spin t="Reading the catalogues" />}
    {!busy && err && <div className="err" style={{ marginTop: 12 }}><h4>Nothing came back</h4><p>{err}</p></div>}

    {!busy && tab === 'people' && people.length > 0 && (
      <div className="list" style={{ marginTop: 10 }}>
        {people.map((p) => (
          <button className="row" key={p.id} onClick={() => setPerson(p)}
            style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%' }}>
            {p.image
              ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer"
                  style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', flex: '0 0 auto' }} />
              : <span style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--s2)',
                  display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Icon n="smile" size={18} /></span>}
            <div className="main"><b>{p.name}</b>
              <span className="dim sm">{[p.country, p.birthday && p.birthday.slice(0, 4)].filter(Boolean).join(' · ')}</span></div>
          </button>))}
      </div>)}

    {!busy && tab === 'today' && sched.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{sched.length} episodes airing</div>
      <div className="list">
        {sched.map((e, i) => (
          <button className="row" key={i} style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 0, width: '100%' }}
            onClick={() => setOpen({ id: e.imdb || `tvmaze:${e.showId}`, imdb: e.imdb, tvmaze: e.showId,
              type: 'series', title: e.show, poster: e.poster, rating: e.rating })}>
            <span className="mono" style={{ width: 48, textAlign: 'center', flex: '0 0 auto',
              color: 'var(--green)', fontSize: 12.5 }}>{e.time || '—'}</span>
            {e.poster && <img src={e.poster} alt="" loading="lazy" referrerPolicy="no-referrer"
              style={{ width: 38, height: 54, borderRadius: 7, objectFit: 'cover', flex: '0 0 auto' }} />}
            <div className="main" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{e.show}</b>
              <span className="dim sm">S{e.season}E{e.number} · {e.title}</span>
              <span className="dim" style={{ fontSize: 10.5 }}>{e.network}{e.runtime ? ` · ${e.runtime}m` : ''}</span>
            </div>
          </button>))}
      </div>
    </>)}

    {!busy && (tab === 'search' || tab === 'browse') && list.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>{list.length} titles</div>
      <Grid list={list} onOpen={setOpen} />
      {tab === 'browse' && (
        <button className="btn ghost" style={{ marginTop: 12, width: '100%' }} disabled={busy}
          onClick={async () => {
            const next = page + 1;
            try {
              const more = await S.browse(row, bType, { genre, skip: next * 50 });
              if (more.length) { setList((l) => [...l, ...more]); setPage(next); }
            } catch { /* the row simply ends */ }
          }}>Load more</button>)}
    </>)}

    {!busy && !err && tab === 'search' && list.length === 0 && q === '' && (
      <div className="state"><span>Search for anything, or tap one of the suggestions.</span></div>)}
  </>);
}

export default Screen;
