/**
 * Internet Radio — thousands of live stations from a global directory.
 *
 * Browse by country (India first), language or mood tag, search by name,
 * and save favourites. Playback uses one audio element with the app's
 * stream bar; insecure (http) stations are relayed so they play on a
 * secure page too. A station that will not start says so and offers the
 * next one — dead air with no explanation is the failure this avoids.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { radioPool, playableUrl, radioFavs, toggleRadioFav, isRadioFav } from '../core/webradio';
import { useData, useDebounced, Spin, Err, Empty, Src, Search, toast } from '../ui/kit';
import { useStreamPlayer, StreamBar } from '../ui/stream';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

const COUNTRIES = ['India', 'Pakistan', 'United Kingdom', 'United States', 'United Arab Emirates', 'Canada', 'Australia'];
const LANGUAGES = ['hindi', 'punjabi', 'urdu', 'english', 'tamil', 'telugu', 'bengali'];
const TAGS = ['bhajan', 'devotional', 'news', 'music', 'oldies', 'sufi', 'qawwali', 'talk', 'sports'];

export function Radio() {
  const [tab, setTab] = useState('country');   // country | language | tag | fav
  const [pick, setPick] = useState('India');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [favs, setFavs] = useState(() => radioFavs());
  const p = useStreamPlayer();

  const searching = dq.trim().length >= 2;
  const params = searching
    ? { mode: 'search', value: dq.trim(), limit: 60 }
    : tab === 'fav' ? null
    : { mode: tab, value: pick, limit: 60 };

  const s = useData('radio', radioPool, params || { mode: 'country', value: 'India' },
    { ttl: 6e5, deps: [params?.mode, params?.value, searching], auto: tab !== 'fav' || searching, spread: false });

  const playStation = (st) => {
    p.play({ key: st.uuid, title: st.name, sub: [st.country, st.codec && st.bitrate ? `${st.codec} ${st.bitrate}k` : st.codec].filter(Boolean).join(' · ') },
      playableUrl(st.url), { live: true });
  };

  const rows = tab === 'fav' && !searching ? favs : (s.data || []);

  const chips = tab === 'country' ? COUNTRIES : tab === 'language' ? LANGUAGES : tab === 'tag' ? TAGS : [];

  return (<>
    <Search value={q} onChange={setQ} ph="Search stations…" />
    <div className="cats" style={{ marginTop: 10 }}>
      {[['country', 'By country'], ['language', 'Language'], ['tag', 'Mood'], ['fav', 'Saved']].map(([id, n]) => (
        <button key={id} className={`cat ${tab === id ? 'on' : ''}`}
          onClick={() => { setTab(id); if (id === 'country') setPick('India'); if (id === 'language') setPick('hindi'); if (id === 'tag') setPick('bhajan'); }}>
          {id === 'fav' && <Icon n="staron" size={13} />}{n}</button>))}
    </div>
    {tab !== 'fav' && (
      <div className="cats" style={{ marginTop: 6 }}>
        {chips.map((c) => (
          <button key={c} className={`cat ${pick === c ? 'on' : ''}`} onClick={() => setPick(c)}>
            {c}</button>))}
      </div>)}

    {(tab !== 'fav' || searching) && s.loading && <Spin t="Finding stations" />}
    {(tab !== 'fav' || searching) && s.error && <Err error={s.error} retry={() => s.run()} />}
    {tab === 'fav' && !searching && favs.length === 0 && (
      <Empty icon="radio" t="No saved stations yet — tap the star on any station to keep it here" />)}
    {(tab !== 'fav' || searching) && !s.loading && !s.error && rows.length === 0 && (
      <Empty icon="radio" t={searching ? `No station matches “${dq.trim()}”` : 'No stations answered for this list'} />)}

    {rows.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>
        {rows.length} station{rows.length === 1 ? '' : 's'}{tab === 'fav' && !searching ? ' saved' : ''}
      </div>
      <div className="list">
        {rows.map((st) => {
          const active = p.cur?.key === st.uuid;
          const fav = isRadioFav(st.uuid, favs);
          return (
            <div className={`row ${active ? 'stream-on' : ''}`} key={st.uuid}>
              <button className="stream-play" aria-label={active && p.status === 'playing' ? `Pause ${st.name}` : `Play ${st.name}`}
                onClick={() => playStation(st)}>
                <Icon n={active && p.status === 'playing' ? 'pause' : 'play'} size={17} />
              </button>
              <div className="main" style={{ minWidth: 0 }} onClick={() => playStation(st)}>
                <b style={{ fontSize: 13.5 }}>{st.name}</b>
                <span className="dim sm" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[st.country, st.language, st.tags.join(' · ')].filter(Boolean).join(' · ') || 'Live radio'}
                </span>
              </div>
              <span className="dim" style={{ fontSize: 10.5, textAlign: 'right' }}>
                {st.codec}{st.bitrate ? ` ${st.bitrate}k` : ''}
              </span>
              <button className="rowbtn" aria-label={fav ? 'Remove from saved' : 'Save station'}
                style={{ color: fav ? 'var(--green)' : 'var(--fg3)' }}
                onClick={() => {
                  const nxt = toggleRadioFav(st);
                  setFavs(nxt);
                  toast(fav ? 'Removed from saved stations' : 'Station saved', 'info');
                  sfxPlay(fav ? 'remove' : 'add');
                }}>
                <Icon n={fav ? 'staron' : 'star'} size={17} />
              </button>
            </div>);
        })}
      </div>
      {(tab !== 'fav' || searching) && <Src meta={s.meta} />}
    </>)}
    <StreamBar p={p} />
  </>);
}

export default Radio;
