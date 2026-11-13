/**
 * apphome.jsx — the Android app's own home (app-mode only).
 *
 * Rendered by App.jsx solely when the native bridge exists
 * (core/app-bridge APP_MODE); the web home never mounts any of this.
 * Composition: greeting → My Day strip → Continue → My Tools → the
 * category grid — all of it customisable through one config object
 * (omni:app:home): reorder/hide categories, show/hide sections, pin
 * tools into My Tools, choose the bottom-bar slots. Edit mode opens
 * from the Customise button or a long-press anywhere on the home.
 *
 * Data comes from the same stores the web shelf reads (library
 * history, TV recents, reader position) and the same lazy modules
 * (panchang, votd), so the app home can never promise anything the
 * app does not actually have.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { Section } from './kit';
import { history as libHistory } from '../core/library';
import { recent as tvRecent } from '../core/iptv';
import { lastRead, lowDataOn } from './readerkit';
import { sessSet, SESS_RESUME_MUSIC, SESS_OPEN_TV } from '../core/keys';
import { votdKind } from '../core/votd';
import {
  useHomeCfg, setHomeCfg, useEditMode, setEditMode, haptic, resetHomeCfg,
} from '../core/app-bridge';

/* ------------------------------------------------------------------ helpers */

function greeting() {
  const h = new Date().getHours();
  if (h < 4) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const TAB_CANDIDATES = ['music', 'tv', 'dl', 'radio', 'games', 'train', 'weather', 'med'];

/* ------------------------------------------------------------------ My Day
 * Verse of the Day (rotation label) + today's Panchang headline +
 * Delhi weather/AQI mini — the three things worth knowing this
 * morning, each one tap opening its full tool. Every value loads
 * lazily and fails silent: a missing row is better than a wrong one. */
function MyDay({ fly, go }) {
  const kind = votdKind();
  const [pan, setPan] = useState('');
  const [wx, setWx] = useState('');

  useEffect(() => {
    let dead = false;
    import('../core/panchang.js').then(async (m) => {
      const now = new Date();
      const p = await m.computePanchang({
        y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(),
        lat: 28.6139, lon: 77.209, tzMin: -now.getTimezoneOffset(),
      });
      if (!dead && p?.tithi) {
        setPan(`${p.tithi.paksha} ${p.tithi.name}${p.nakshatra?.name ? ` · ${p.nakshatra.name} nakshatra` : ''}`);
      }
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const key = 'omni:app:wx';
        const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (cached && Date.now() - cached.t < 30 * 60000) {
          if (!dead) setWx(cached.v);
          return;
        }
        const [f, a] = await Promise.all([
          fetch('https://api.open-meteo.com/v1/forecast?latitude=28.6139&longitude=77.209&current=temperature_2m,weather_code').then((r) => r.json()),
          fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6139&longitude=77.209&current=us_aqi').then((r) => r.json()),
        ]);
        const t = Math.round(f?.current?.temperature_2m);
        const aqi = Math.round(a?.current?.us_aqi);
        if (Number.isFinite(t)) {
          const v = `Delhi ${t}°C${Number.isFinite(aqi) ? ` · AQI ${aqi}` : ''}`;
          if (!dead) setWx(v);
          try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ }
        }
      } catch { /* weather mini fails silent */ }
    })();
    return () => { dead = true; };
  }, []);

  return (
    <Section id="app-myday" title="My Day" icon="sun">
      <div className="shelf-col">
        <button className="cont-card" onClick={(e) => fly('votd', e)}>
          <span className="cont-ic"><Icon n="sparkle" size={18} /></span>
          <span className="cont-tx"><b>Verse of the Day · {kind.label}</b>
            <small>Tap to read today's verse and share the card</small></span>
          <Icon n="chevron" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
        </button>
        <button className="cont-card" onClick={(e) => fly('panchang', e)}>
          <span className="cont-ic"><Icon n="sun" size={18} /></span>
          <span className="cont-tx"><b>Today's Panchang</b>
            <small>{pan || 'Tithi · nakshatra · Rahu Kaal'}</small></span>
          <Icon n="chevron" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
        </button>
        <button className="cont-card" onClick={(e) => fly('weather', e)}>
          <span className="cont-ic"><Icon n="thermo" size={18} /></span>
          <span className="cont-tx"><b>Weather &amp; AQI</b>
            <small>{wx || 'Tap for Delhi weather and air quality'}</small></span>
          <Icon n="chevron" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
        </button>
      </div>
    </Section>);
}

/* ------------------------------------------------------------------ home top
 * Greeting + My Day + Continue + My Tools. Long-press anywhere here
 * (or in the category block) enters edit mode. */
export function AppHomeTop({ tools, go, open }) {
  const cfg = useHomeCfg();
  const editing = useEditMode();
  const pressTimer = useRef(null);

  const fly = (id, e) => {
    const t = tools.find((x) => x.id === id);
    if (t && open) open(t, e); else go(id);
  };

  let lastSong = null; let lastChan = null; let lastBook = null;
  try { lastSong = libHistory()[0] || null; } catch { /* empty history */ }
  try { lastChan = tvRecent()[0] || null; } catch { /* empty history */ }
  try { lastBook = lastRead(); } catch { /* nothing read yet */ }
  const ld = lowDataOn();
  const myTools = cfg.myTools
    .map((id) => tools.find((t) => t.id === id))
    .filter(Boolean);
  const hasContinue = lastSong || lastChan || lastBook;

  const armLongPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => { haptic(25); setEditMode(true); }, 600);
  };
  const disarm = () => clearTimeout(pressTimer.current);

  return (
    <div className="app-home-top"
      onPointerDown={armLongPress} onPointerUp={disarm}
      onPointerLeave={disarm} onPointerCancel={disarm}>
      <div className="app-greet">
        <div>
          <h1 className="gradtext">{greeting()}</h1>
          <p className="dim sm" style={{ marginTop: 2 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{tools.length} tools, all yours
          </p>
        </div>
        <button className={`btn sm ${editing ? '' : 'ghost'}`}
          onClick={() => { haptic(15); setEditMode(!editing); }}>
          <Icon n={editing ? 'check' : 'pen'} size={14} /> {editing ? 'Done' : 'Customise'}
        </button>
      </div>

      {cfg.sections.myday && <MyDay fly={fly} go={go} />}

      {cfg.sections.cont && hasContinue && (
        <Section id="app-continue" title="Continue" icon="play">
          <div className="shelf-col">
            {lastBook && (
              <button className="cont-card" onClick={(e) => fly(lastBook.tool, e)}>
                <span className="cont-ic"><Icon n="book" size={18} /></span>
                <span className="cont-tx"><b>{lastBook.label?.t || 'Continue reading'}</b>
                  <small>{lastBook.label?.s ? `${lastBook.label.s} · ` : ''}tap to continue reading</small></span>
                <Icon n="play" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
              </button>)}
            {lastSong && (
              <button className="cont-card" onClick={(e) => {
                try { sessSet(SESS_RESUME_MUSIC, JSON.stringify(lastSong)); } catch { /* ignore */ }
                fly('music', e);
              }}>
                {lastSong.art && !ld
                  ? <img src={lastSong.art} alt="" loading="lazy" />
                  : <span className="cont-ic"><Icon n="music" size={18} /></span>}
                <span className="cont-tx"><b>{lastSong.title}</b>
                  <small>{lastSong.artist || 'Song'} · tap to resume</small></span>
                <Icon n="play" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
              </button>)}
            {lastChan && (
              <button className="cont-card" onClick={(e) => {
                try { sessSet(SESS_OPEN_TV, JSON.stringify(lastChan)); } catch { /* ignore */ }
                fly('tv', e);
              }}>
                {lastChan.logo && !ld
                  ? <img src={lastChan.logo} alt="" loading="lazy" />
                  : <span className="cont-ic"><Icon n="film" size={18} /></span>}
                <span className="cont-tx"><b>{lastChan.name}</b>
                  <small>{lastChan.group || 'Channel'} · tap to watch</small></span>
                <Icon n="play" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
              </button>)}
          </div>
        </Section>)}

      {(myTools.length > 0 || editing) && (
        <Section id="app-mytools" title="My Tools" icon="staron">
          {myTools.length > 0
            ? <div className="shelf-row">
                {myTools.map((t) => (
                  <button key={t.id} className="cat shelf-chip"
                    onClick={(e) => { if (!editing) { open ? open(t, e) : go(t.id); } }}>
                    <Icon n={t.i} size={14} /> {t.n}
                    {editing && (
                      <span className="chip-x" role="button" aria-label={`Remove ${t.n}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setHomeCfg({ myTools: cfg.myTools.filter((x) => x !== t.id) });
                        }}>
                        <Icon n="x" size={12} />
                      </span>)}
                  </button>))}
              </div>
            : <p className="dim sm">No tools here yet — add your favourites below while customising.</p>}
        </Section>)}
    </div>);
}

/* ------------------------------------------------------------------ categories + edit panel */

function orderedCats(catList, cfg) {
  const byName = new Map(catList.map((c) => [c.name, c]));
  const out = [];
  for (const name of cfg.order) {
    if (byName.has(name)) { out.push(byName.get(name)); byName.delete(name); }
  }
  for (const c of catList) if (byName.has(c.name)) out.push(c);
  return out;
}

export function AppHomeCats({ tools, catList, favTools, go }) {
  const cfg = useHomeCfg();
  const editing = useEditMode();
  const ordered = useMemo(() => orderedCats(catList, cfg), [catList, cfg]);
  const visible = editing ? ordered : ordered.filter((c) => !cfg.hidden.includes(c.name));

  const move = (name, dir) => {
    const names = ordered.map((c) => c.name);
    const i = names.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    haptic(8);
    setHomeCfg({ order: names });
  };
  const toggleHidden = (name) => {
    haptic(8);
    setHomeCfg({
      hidden: cfg.hidden.includes(name)
        ? cfg.hidden.filter((x) => x !== name)
        : [...cfg.hidden, name],
    });
  };

  const cardInner = (title, count, meta, preview) => (<>
    <span className="catcard-ic"><Icon n={meta.i} size={25} /></span>
    <span className="catcard-tx">
      <span className="catcard-n"><b>{title}</b><span className="catcard-n2">{count}</span></span>
      {meta.d && <span className="catcard-d">{meta.d}</span>}
      {preview && <span className="catcard-p">{preview}</span>}
    </span>
  </>);

  return (
    <div className="app-home-cats">
      <div className="seclabel" style={{ marginTop: 18 }}>
        Browse by category{editing ? ' — arrange your home' : ''}
      </div>

      {editing && <EditPanel tools={tools} cfg={cfg} />}

      <div className="catgrid">
        {visible.map((c, i) => {
          const isHidden = cfg.hidden.includes(c.name);
          const preview = `${c.list.slice(0, 3).map((t) => t.n).join(' · ')}${c.list.length > 3 ? ' · …' : ''}`;
          if (!editing) {
            return (
              <button className="catcard" key={c.name}
                style={{ '--ca': `var(${c.meta.a})`, '--i': Math.min(i, 9) }}
                onClick={() => go(`cat:${encodeURIComponent(c.name)}`)}
                aria-label={`${c.name} — ${c.list.length} tools`}>
                {cardInner(c.name, c.list.length, c.meta, preview)}
                <Icon n="chevron" size={17} className="catcard-chev" />
              </button>);
          }
          return (
            <div className={`catcard editing ${isHidden ? 'is-hidden' : ''}`} key={c.name}
              style={{ '--ca': `var(${c.meta.a})`, '--i': Math.min(i, 9) }}>
              {cardInner(c.name, c.list.length, c.meta, preview)}
              <span className="catcard-ctl">
                <button className="iconbtn sm" aria-label={`Move ${c.name} up`}
                  onClick={() => move(c.name, -1)}><Icon n="up" size={15} /></button>
                <button className="iconbtn sm" aria-label={`Move ${c.name} down`}
                  onClick={() => move(c.name, 1)}><Icon n="down" size={15} /></button>
                <button className="btn ghost sm" aria-label={`${isHidden ? 'Show' : 'Hide'} ${c.name}`}
                  onClick={() => toggleHidden(c.name)}>{isHidden ? 'Show' : 'Hide'}</button>
              </span>
            </div>);
        })}
      </div>

      {!editing && (<>
        {favTools.length > 0 && (
          <div className="catgrid" style={{ marginTop: 10 }}>
            <button className="catcard" style={{ '--ca': 'var(--green)', '--i': 0 }}
              onClick={() => go('cat:__fav')} aria-label={`Pinned — ${favTools.length} tools`}>
              {cardInner('Pinned', favTools.length, { i: 'staron', d: 'Your pinned tools' },
                favTools.slice(0, 3).map((t) => t.n).join(' · '))}
              <Icon n="chevron" size={17} className="catcard-chev" />
            </button>
            <button className="catcard" style={{ '--ca': 'var(--cyan)', '--i': 1 }}
              onClick={() => go('cat:__az')} aria-label={`All tools A–Z — ${tools.length} tools`}>
              {cardInner('All tools A–Z', tools.length, { i: 'grid', d: 'Every tool, alphabetically' }, '')}
              <Icon n="chevron" size={17} className="catcard-chev" />
            </button>
          </div>)}
        {favTools.length === 0 && (
          <div className="catgrid" style={{ marginTop: 10 }}>
            <button className="catcard" style={{ '--ca': 'var(--cyan)', '--i': 0 }}
              onClick={() => go('cat:__az')} aria-label={`All tools A–Z — ${tools.length} tools`}>
              {cardInner('All tools A–Z', tools.length, { i: 'grid', d: 'Every tool, alphabetically' }, '')}
              <Icon n="chevron" size={17} className="catcard-chev" />
            </button>
          </div>)}
      </>)}
    </div>);
}

/* The edit-mode control panel: sections, My Tools picker, tab slots. */
function EditPanel({ tools, cfg }) {
  const toggleTool = (id) => {
    haptic(8);
    setHomeCfg({
      myTools: cfg.myTools.includes(id)
        ? cfg.myTools.filter((x) => x !== id)
        : [...cfg.myTools, id],
    });
  };
  const setSlot = (id) => {
    if (cfg.tabs.includes(id) || cfg.tabs.length >= 4) return;
    haptic(8);
    setHomeCfg({ tabs: [...cfg.tabs, id] });
  };
  const dropSlot = (id) => setHomeCfg({ tabs: cfg.tabs.filter((x) => x !== id) });
  const slotLabel = (id) => id === 'search' ? 'Search'
    : id === 'more' ? 'More'
    : tools.find((t) => t.id === id)?.n || id;

  return (
    <div className="editpanel">
      <div className="chead sm"><Icon n="pen" size={14} /> Customise home</div>

      <div className="editrow">
        <label className="chk">
          <input type="checkbox" checked={cfg.sections.myday}
            onChange={(e) => setHomeCfg({ sections: { ...cfg.sections, myday: e.target.checked } })} />
          <span>My Day strip (verse · panchang · weather)</span>
        </label>
        <label className="chk">
          <input type="checkbox" checked={cfg.sections.cont}
            onChange={(e) => setHomeCfg({ sections: { ...cfg.sections, cont: e.target.checked } })} />
          <span>Continue row</span>
        </label>
      </div>

      <div className="chead sm" style={{ marginTop: 12 }}>My Tools — tap to add or remove</div>
      <div className="edittools">
        {tools.map((t) => (
          <button key={t.id}
            className={`cat ${cfg.myTools.includes(t.id) ? 'on' : ''}`}
            onClick={() => toggleTool(t.id)}>
            <Icon n={t.i} size={13} /> {t.n}
          </button>))}
      </div>

      <div className="chead sm" style={{ marginTop: 12 }}>Bottom bar — up to 4 shortcuts</div>
      <div className="shelf-row">
        {cfg.tabs.map((id) => (
          <button key={id} className="cat on" onClick={() => dropSlot(id)}>
            {slotLabel(id)} <Icon n="x" size={12} />
          </button>))}
        {cfg.tabs.length === 0 && <span className="dim sm">Only Home will show.</span>}
      </div>
      <div className="shelf-row" style={{ marginTop: 6 }}>
        {[...TAB_CANDIDATES, 'search', 'more']
          .filter((id) => !cfg.tabs.includes(id))
          .map((id) => (
            <button key={id} className="cat" onClick={() => setSlot(id)}>
              <Icon n="plus" size={12} /> {slotLabel(id)}
            </button>))}
      </div>

      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn ghost sm" onClick={() => { resetHomeCfg(); haptic(15); }}>
          Reset layout</button>
        <button className="btn sm" onClick={() => setEditMode(false)}>
          <Icon n="check" size={14} /> Done</button>
      </div>
    </div>);
}

/* ------------------------------------------------------------------ app tab bar
 * Floating pill bar, app-mode only: Home + the user's chosen slots.
 * 'search' jumps home and focuses the search box; 'more' jumps home
 * and scrolls to the categories. */
export function AppTabBar({ tools, route, go }) {
  const cfg = useHomeCfg();
  const focusSearch = () => {
    go('');
    setTimeout(() => {
      const el = document.querySelector('.search input');
      if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }, 80);
  };
  const goMore = () => {
    go('');
    setTimeout(() => {
      const el = document.querySelector('.app-home-cats');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };
  return (
    <nav className="apptabs" aria-label="App">
      <button className={route === '' ? 'on' : ''}
        onClick={() => { haptic(8); go(''); }}>
        <Icon n="home" size={21} /><small>Home</small>
      </button>
      {cfg.tabs.map((id) => {
        if (id === 'search') {
          return (
            <button key="search" onClick={() => { haptic(8); focusSearch(); }}>
              <Icon n="search" size={21} /><small>Search</small>
            </button>);
        }
        if (id === 'more') {
          return (
            <button key="more" onClick={() => { haptic(8); goMore(); }}>
              <Icon n="grid" size={21} /><small>More</small>
            </button>);
        }
        const t = tools.find((x) => x.id === id);
        if (!t) return null;
        return (
          <button key={id} className={route === id ? 'on' : ''}
            onClick={() => { haptic(8); go(id); }}>
            <Icon n={t.i} size={21} /><small>{t.n.split(' ')[0]}</small>
          </button>);
      })}
    </nav>);
}
