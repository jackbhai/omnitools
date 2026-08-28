import React, { useEffect, useMemo, useState } from 'react';
import * as O from './tools/offline';
import * as L from './tools/live';
import { Music } from './tools/music2';
import * as T from './tools/transit';
import * as C from './tools/convert';
import { LocProvider } from './core/geo';
import { PlayerProvider, usePlayer } from './core/player';
import { MiniPlayer, FullPlayer } from './ui/PlayerUI';
import { Downloader } from './tools/downloader';
import * as U from './tools/utils';
import * as R from './tools/reader';
import * as MP from './tools/metro-planner';
import * as BP from './tools/bus-planner';
import * as TR from './tools/trains2';
import { MultiModal } from './tools/multimodal';
import { TrainJourney } from './tools/train-journey';
import { Medicine as MedicineDeep } from './tools/medicine';
import { Handwriting } from './tools/handwriting';
import { Hub } from './tools/travel-hub';
import * as W from './tools/world';
import { News } from './tools/news';
import { Screen } from './tools/screen';
import { Names } from './tools/names';
import { Launches, Recipes, WorldData } from './tools/extra';
import { LiveTV } from './tools/tv';
import { Dogs, SunTimes, Riddles, Horoscope, Trivia, Cats, Universities, Food } from './tools/newtools';
import * as D from './tools/devotional';
import { Kundli as KundliPro } from './tools/kundli';
import { Settings } from './tools/settings';
import { providerStats } from './core/engine';
import { Icon } from './ui/icons';

/* ------------------------------------------------------------ travel hubs
   Eleven separate Travel tiles were impossible to tell apart. They are now
   three mode hubs — Bus, Train, Metro — each keeping every feature as a tab. */
const BusHub = () => (
  <Hub icon="bus" title="Delhi Bus" sub="Plan a trip · browse routes · check fares"
    tabs={[
      { id: 'plan',  n: 'Plan trip', i: 'route',  C: BP.BusPlanner },
      { id: 'routes',n: 'Routes',    i: 'list',   C: BP.BusRoutesList },
      { id: 'fare',  n: 'Fares',     i: 'fare',   C: BP.BusFares },
    ]} />);

const TrainHub = () => (
  <Hub icon="train" title="Indian Railways" sub="Live status · schedule · trains between stations"
    tabs={[
      { id: 'between', n: 'Find trains', i: 'search',  C: TR.TrainsBetween },
      { id: 'live',    n: 'Live status', i: 'signal',  C: TR.TrainLive },
      { id: 'sched',   n: 'Schedule',    i: 'list',    C: TR.TrainSchedule },
      { id: 'journey', n: 'Long journey',i: 'luggage', C: TrainJourney },
    ]} />);

const MetroHub = () => (
  <Hub icon="metro" title="Delhi Metro" sub="Route & fare · network map · line status"
    tabs={[
      { id: 'plan',  n: 'Plan route', i: 'route', C: MP.MetroPlanner },
      { id: 'net',   n: 'Network',    i: 'grid',  C: MP.MetroNetwork },
      { id: 'lines', n: 'Lines',      i: 'metro', C: T.MetroLines },
      { id: 'city',  n: 'Other cities', i: 'globe', C: T.Metro },
    ]} />);

/* ------------------------------------------------------------------ registry
   type: 'off' = pure browser (never fails) · 'live' = pooled network tool
   i    = icon name from src/ui/icons.jsx (real SVG, never an emoji)          */
const TOOLS = [
  // ---------- Travel (grouped by mode) ----------
  { id:'bus',       n:'Bus',           i:'bus',      c:'Travel', t:'off',  d:'Route, fare & every stop', C:BusHub },
  { id:'train',     n:'Train',         i:'train',    c:'Travel', t:'live', d:'Live status & schedules',  C:TrainHub },
  { id:'metro',     n:'Metro',         i:'metro',    c:'Travel', t:'off',  d:'Route, fare & network',    C:MetroHub },
  { id:'journey',   n:'Plan Journey',  i:'compass',  c:'Travel', t:'off',  d:'Metro + bus combined',     C:MultiModal },
  { id:'nearby',    n:'Near Me',       i:'pin',      c:'Travel', t:'live', d:'ATM, food, fuel…',         C:T.Nearby },
  { id:'guide',     n:'Travel Guide',  i:'globe',    c:'Travel', t:'live', d:'City info + SOS',          C:T.TravelGuide },
  { id:'sos',       n:'Emergency',     i:'warn',     c:'Travel', t:'live', d:'Helplines, India & world', C:W.Emergency },
  { id:'dial',      n:'Dial Codes',    i:'signal',   c:'Travel', t:'live', d:'Country calling codes',    C:W.DialCodes },

  // ---------- India ----------
  { id:'weather',   n:'Weather + AQI', i:'sun',      c:'India', t:'live', d:'Forecast & air quality',    C:L.Weather },
  { id:'festivals', n:'Festivals',     i:'calendar', c:'India', t:'live', d:'Holidays calendar',         C:L.Festivals },
  { id:'pincode',   n:'PIN Code',      i:'mail',     c:'India', t:'live', d:'Post offices',              C:L.Pincode },
  { id:'ifsc',      n:'IFSC Finder',   i:'bank',     c:'India', t:'live', d:'Bank branches',             C:L.Ifsc },
  { id:'mandi',     n:'Mandi Prices',  i:'wheat',    c:'India', t:'live', d:'Daily commodity rates',     C:T.Mandi },
  { id:'gst',       n:'GST Calc',      i:'receipt',  c:'India', t:'off',  d:'CGST + SGST',               C:O.GstCalc },
  { id:'tax',       n:'Income Tax',    i:'rupee',    c:'India', t:'off',  d:'FY 2025-26',                C:O.TaxCalc },
  { id:'emi',       n:'EMI Calc',      i:'home',     c:'India', t:'off',  d:'Loan planner',              C:O.EmiCalc },
  { id:'sip',       n:'SIP Calc',      i:'chart',    c:'India', t:'off',  d:'Mutual funds',              C:O.SipCalc },

  // ---------- Health ----------
  { id:'med',       n:'Medicine',      i:'pill',     c:'Health', t:'live', d:'253,802 medicines · uses & price', C:MedicineDeep },
  { id:'bmi',       n:'BMI',           i:'scale',    c:'Health', t:'off',  d:'Health index',             C:O.BmiCalc },

  // ---------- Time ----------
  { id:'clock',     n:'World Clock',   i:'clock',    c:'Time', t:'live', d:'12 zones live',              C:L.WorldClock },
  { id:'otd',       n:'On This Day',   i:'calendar', c:'Time', t:'live', d:'History today',              C:L.OnThisDay },
  { id:'sun',       n:'Sun Times',     i:'sun',      c:'Time', t:'live', d:'Sunrise, sunset & moon',     C:SunTimes },
  { id:'age',       n:'Age Calc',      i:'cake',     c:'Time', t:'off',  d:'Exact age',                  C:O.AgeCalc },
  { id:'ts',        n:'Timestamp',     i:'timer',    c:'Time', t:'off',  d:'Unix ↔ date',                C:O.TimestampTool },

  // ---------- Money ----------
  { id:'currency',  n:'Currency',      i:'swap',     c:'Money', t:'live', d:'Live FX rates',             C:L.Currency },
  { id:'crypto',    n:'Crypto',        i:'coin',     c:'Money', t:'live', d:'Top 40 coins',              C:L.Crypto },
  { id:'pct',       n:'Percentage',    i:'percent',  c:'Money', t:'off',  d:'% calculator',              C:O.Percentage },

  // ---------- Music ----------
  { id:'music',     n:'Music Player',  i:'music',    c:'Music', t:'live', d:'Ad-free · EQ · background', C:Music },

  // ---------- Learn ----------
  { id:'wiki',      n:'Wikipedia',     i:'globe',    c:'Learn', t:'live', d:'Encyclopedia',              C:L.Wikipedia },
  { id:'dict',      n:'Dictionary',    i:'book',     c:'Learn', t:'live', d:'Definitions + audio',       C:L.Dictionary },
  { id:'books',     n:'Books',         i:'books',    c:'Learn', t:'live', d:'Open Library',              C:L.Books },
  { id:'country',   n:'Countries',     i:'earth',    c:'Learn', t:'live', d:'250 countries, full detail', C:W.Countries },
  { id:'names',     n:'Names & Surnames', i:'smile', c:'Learn', t:'live', d:'5,695 names · caste, region',C:Names },
  { id:'worlddata', n:'World Data',    i:'chart',    c:'Learn', t:'live', d:'16 indicators, 25 years',   C:WorldData },

  // ---------- Media ----------
  { id:'dl',        n:'Downloader',    i:'download', c:'Media', t:'live', d:'Video / audio / thumbnail', C:Downloader },
  { id:'news',      n:'News',          i:'news',     c:'Media', t:'live', d:'52 countries · every topic', C:News },
  { id:'movies',    n:'Movies & TV',   i:'film',     c:'Media', t:'live', d:'Cast, seasons, episodes',    C:Screen },
  { id:'tv',        n:'Live TV',       i:'satellite',c:'Media', t:'live', d:'2,400+ Indian channels, free', C:LiveTV },
  { id:'jokes',     n:'Jokes',         i:'smile',    c:'Media', t:'live', d:'Random joke',               C:L.Jokes },
  { id:'quotes',    n:'Quotes',        i:'quote',    c:'Media', t:'live', d:'Inspiration',               C:L.Quotes },
  { id:'recipes',   n:'Recipes',       i:'flask',    c:'Everyday', t:'live', d:'790 recipes, 37 cuisines', C:Recipes },
  { id:'dogs',      n:'Dog Explorer',  i:'smile',    c:'Everyday', t:'live', d:'Breeds, photos & facts',     C:Dogs },
  { id:'cats',      n:'Cat Explorer',  i:'smile',    c:'Everyday', t:'live', d:'Facts & cute photos',        C:Cats },
  { id:'riddles',   n:'Riddles',       i:'quote',    c:'Everyday', t:'live', d:'Brain teasers with answer',  C:Riddles },
  { id:'trivia',    n:'Trivia Quiz',   i:'star',     c:'Everyday', t:'live', d:'Multiple choice quiz',       C:Trivia },
  { id:'horoscope', n:'Horoscope',     i:'star',     c:'Everyday', t:'live', d:'Daily zodiac predictions',   C:Horoscope },
  { id:'food',      n:'Food Scanner',  i:'flask',    c:'Everyday', t:'live', d:'Products & nutrition',       C:Food },
  { id:'uni',       n:'Universities',  i:'cap',      c:'Learn',    t:'live', d:'Find universities worldwide',C:Universities },

  // ---------- Bhakti / Holy books ----------
  { id:'gita',      n:'Bhagavad Gita', i:'book',     c:'Bhakti', t:'live', d:'18 chapters 700 verses real', C:D.Gita },
  { id:'quran',     n:'Quran',         i:'book',     c:'Bhakti', t:'live', d:'114 surahs 6236 ayahs real',  C:D.Quran },
  { id:'bible',     n:'Holy Bible',    i:'books',    c:'Bhakti', t:'live', d:'66 books 31102 verses real',  C:D.Bible },
  { id:'gurbani',   n:'Gurbani',       i:'books',    c:'Bhakti', t:'live', d:'1430 Angs Hukamnama real',    C:D.Gurbani },
  { id:'devotional',n:'Aarti & Mantra',i:'star',     c:'Bhakti', t:'off',  d:'Aarti Chalisa Mantra real',   C:D.Devotional },
  { id:'recipesdeep',n:'Recipes Deep', i:'flask',    c:'Everyday', t:'live', d:'Ingredients video deep',   C:D.RecipesDeep },
  { id:'rashifal',  n:'Rashifal',      i:'star',     c:'India',  t:'live', d:'Hinglish Mesh-Vrishabh etc',  C:D.Rashifal },
  { id:'kundli',    n:'Kundli Pro v3', i:'star',     c:'India',  t:'off',  d:'3-Layer Verified - No Fake Data - Professional', C:KundliPro },
  { id:'settings',  n:'Settings',      i:'cog',      c:'Everyday', t:'off', d:'PWA App-like + Themes + Live Check - Standard Settings', C:Settings },

  // ---------- the resolver ----------
  { id:'manga',     n:'Manga',         i:'book',     c:'Everyday', t:'live', d:'Read chapters + pages',      C:R.Manga },
  { id:'novels',    n:'Novels',        i:'books',    c:'Everyday', t:'live', d:'Read full chapters',         C:R.Novels },
  { id:'courses',   n:'Courses',       i:'cap',      c:'Everyday', t:'live', d:'1000+ free courses',         C:U.Courses },
  { id:'tempmail',  n:'Temp Mail',     i:'mail',     c:'Everyday', t:'live', d:'Disposable inbox',           C:U.TempMail },
  { id:'wikipdf',   n:'Wiki → PDF',    i:'doc',      c:'Everyday', t:'live', d:'Article as PDF',             C:U.WikiPdf },
  { id:'hand',      n:'Handwriting',   i:'pen',      c:'Everyday', t:'live', d:'Neat page, ready to print', C:Handwriting },
  { id:'websnap',   n:'Screenshot',    i:'camera',   c:'Everyday', t:'live', d:'Capture any site',           C:U.WebSnap },
  { id:'certs',     n:'Certificates',  i:'badge',    c:'Everyday', t:'live', d:'Templates',                  C:U.Certificates },

  // ---------- Space ----------
  { id:'iss',       n:'ISS Tracker',   i:'satellite',c:'Space', t:'live', d:'Live position',             C:L.Space },
  { id:'quake',     n:'Earthquakes',   i:'earth',    c:'Space', t:'live', d:'USGS live feed',            C:L.Quakes },
  { id:'launch',    n:'Rocket Launches',i:'satellite',c:'Space', t:'live', d:'Every launch worldwide',    C:Launches },

  // ---------- Text ----------
  { id:'case',      n:'Case Convert',  i:'type',     c:'Text', t:'off', d:'9 formats',                   C:O.CaseConvert },
  { id:'wc',        n:'Word Count',    i:'numbers',  c:'Text', t:'off', d:'Stats & read time',           C:O.WordCount },
  { id:'lines',     n:'Line Tools',    i:'list',     c:'Text', t:'off', d:'Sort, dedupe…',               C:O.TextTools },
  { id:'lorem',     n:'Lorem Ipsum',   i:'doc',      c:'Text', t:'off', d:'Placeholder text',            C:O.LoremGen },

  // ---------- Dev ----------
  { id:'b64',       n:'Base64',        i:'lock',     c:'Dev', t:'off', d:'Encode / decode',              C:O.Base64 },
  { id:'url',       n:'URL Encode',    i:'link',     c:'Dev', t:'off', d:'Percent encoding',             C:O.UrlEncode },
  { id:'json',      n:'JSON Tools',    i:'braces',   c:'Dev', t:'off', d:'Format · YAML',                C:O.JsonTool },
  { id:'jwt',       n:'JWT Decode',    i:'key',      c:'Dev', t:'off', d:'Inspect token',                C:O.JwtDecode },
  { id:'regex',     n:'Regex Test',    i:'code',     c:'Dev', t:'off', d:'Live matching',                C:O.RegexTest },
  { id:'hash',      n:'Hash',          i:'hash',     c:'Dev', t:'off', d:'SHA-1/256/384/512',            C:O.Hash },
  { id:'gh',        n:'GitHub',        i:'cog',      c:'Dev', t:'live', d:'Repo search',                 C:L.Repos },
  { id:'ip',        n:'My IP',         i:'signal',   c:'Dev', t:'live', d:'IP & location',               C:L.MyIp },

  // ---------- Generate ----------
  { id:'pw',        n:'Password',      i:'key',      c:'Generate', t:'off', d:'Secure random',           C:O.Password },
  { id:'uuid',      n:'UUID',          i:'id',       c:'Generate', t:'off', d:'v4 bulk',                 C:O.Uuid },
  { id:'qr',        n:'QR Code',       i:'qr',       c:'Generate', t:'off', d:'Custom colours',          C:O.QrGen },
  { id:'dice',      n:'Dice Roll',     i:'dice',     c:'Generate', t:'off', d:'d4 → d100',               C:O.DiceRoll },

  // ---------- Convert ----------
  { id:'unit',      n:'Unit Convert',  i:'ruler',    c:'Convert', t:'off', d:'7 categories',             C:O.UnitConvert },
  { id:'temp',      n:'Temperature',   i:'thermo',   c:'Convert', t:'off', d:'C/F/K/R',                  C:O.TempConvert },
  { id:'color',     n:'Colour Tool',   i:'palette',  c:'Convert', t:'off', d:'HEX/RGB/HSL + WCAG',       C:O.ColorTool },
  { id:'imgconv',   n:'Image Convert', i:'image',    c:'Convert', t:'off', d:'JPG/PNG/WEBP + resize',    C:C.ImageConvert },
  { id:'img2pdf',   n:'Images → PDF',  i:'doc',      c:'Convert', t:'off', d:'Multi-page PDF',           C:C.ImagesToPdf },
  { id:'audioconv', n:'Audio → WAV',   i:'disc',     c:'Convert', t:'off', d:'Decode any format',        C:C.AudioConvert },
  { id:'vidframe',  n:'Video Frames',  i:'film',     c:'Convert', t:'off', d:'Extract as JPG',           C:C.VideoFrames },
  { id:'dataconv',  n:'Data Convert',  i:'swap',     c:'Convert', t:'off', d:'JSON/CSV/XML',             C:C.DataConvert },
  { id:'txtfile',   n:'Text → File',   i:'save',     c:'Convert', t:'off', d:'Save as any type',         C:C.TextToFile },
];

const CATS = ['All', 'Travel', 'India', 'Bhakti', 'Health', 'Everyday', 'Convert', 'Music',
              'Time', 'Money', 'Learn', 'Media', 'Space', 'Text', 'Dev', 'Generate'];

export default function App() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [fav, setFav] = useState(() => {
    try { return JSON.parse(localStorage.getItem('omni:fav') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    const h = () => { setRoute(location.hash.slice(1) || ''); window.scrollTo(0, 0); };
    addEventListener('hashchange', h); return () => removeEventListener('hashchange', h);
  }, []);
  useEffect(() => { localStorage.setItem('omni:fav', JSON.stringify(fav)); }, [fav]);

  const tool = TOOLS.find((t) => t.id === route);
  const shown = useMemo(() => {
    let list = TOOLS;
    if (cat === 'Fav') list = list.filter((t) => fav.includes(t.id));
    else if (cat !== 'All') list = list.filter((t) => t.c === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) => (t.n + ' ' + t.d + ' ' + t.c).toLowerCase().includes(s));
    }
    return list;
  }, [cat, q, fav]);

  const go = (id) => { location.hash = id; };
  const offCount = TOOLS.filter((t) => t.t === 'off').length;

  return (
   <LocProvider>
    <PlayerProvider>
    <Shell>
      <header className="topbar">
        {tool
          ? <button className="iconbtn" onClick={() => go('')} aria-label="Back"><Icon n="back" size={19} /></button>
          : <span className="brand gradtext">OMNI</span>}
        <div className="tb-t">
          <b>{tool ? tool.n : 'OmniTools'}</b>
          <span>{tool ? tool.d : `${TOOLS.length} tools · no login`}</span>
        </div>
        {tool && (
          <button className="iconbtn" aria-label="Favourite" onClick={() => setFav((f) =>
            f.includes(tool.id) ? f.filter((x) => x !== tool.id) : [...f, tool.id])}>
            <Icon n={fav.includes(tool.id) ? 'staron' : 'star'} size={18}
              style={{ color: fav.includes(tool.id) ? 'var(--green)' : '' }} />
          </button>)}
        <button className="iconbtn" aria-label="System status" onClick={() => setShowStatus((s) => !s)}>
          <span className="dot" />
        </button>
      </header>

      {showStatus && <StatusPanel onClose={() => setShowStatus(false)} offCount={offCount} total={TOOLS.length} />}

      <div className="main-area">
        {!tool && (<>
          <div className="hero">
            <h1 className="gradtext">EVERYTHING<br />IN ONE APP</h1>
            <p>{TOOLS.length} tools. Multi-source fallback on every live feature.
              No login, no signup, no API keys.</p>
            <div className="pillrow">
              <span className="pill on"><Icon n="check" size={13} /> {offCount} work offline</span>
              <span className="pill"><Icon n="refresh" size={13} /> Auto-failover</span>
              <span className="pill"><Icon n="shield" size={13} /> No tracking</span>
              <span className="pill" title="deployed build"><Icon n="box" size={13} /> {__BUILD__}</span>
            </div>
          </div>

          <div className="search">
            <Icon n="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools…" enterKeyHint="search" />
            {q && <button onClick={() => setQ('')} aria-label="Clear"
              style={{ background: 'none', border: 0, color: 'var(--fg3)', display: 'grid', placeItems: 'center' }}>
              <Icon n="x" size={17} /></button>}
          </div>

          <div className="cats">
            {fav.length > 0 && (
              <button className={`cat ${cat === 'Fav' ? 'on' : ''}`} onClick={() => setCat('Fav')}>
                <Icon n="staron" size={13} /> {fav.length}</button>)}
            {CATS.map((c) => <button key={c} className={`cat ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>

          {shown.length === 0
            ? <div className="state">No tools match &ldquo;{q}&rdquo;</div>
            : <div className="grid">
                {shown.map((t) => (
                  <button className="tile" key={t.id} onClick={() => go(t.id)}>
                    {t.t === 'live' ? <span className="live" /> : <span className="off">OFF</span>}
                    <span className="ic"><Icon n={t.i} size={24} /></span>
                    <b>{t.n}</b>
                    <small>{t.d}</small>
                  </button>))}
              </div>}

          <div className="hr" />
          <p className="dim sm">
            <b style={{ color: 'var(--green)' }}>OFF</b> = runs fully in your browser, works without internet.
            <b style={{ color: 'var(--green)' }}> ●</b> = live data with multiple backup sources; if one fails
            another takes over automatically.
          </p>
        </>)}

        {tool && <div style={{ paddingTop: 14 }}><tool.C /></div>}
      </div>

      <nav className="nav">
        {[['', 'grid', 'Tools'], ['music', 'music', 'Music'], ['bus', 'bus', 'Travel'],
          ['med', 'pill', 'Medicine'], ['weather', 'sun', 'Weather']].map(([id, ic, label]) => (
          <button key={id} className={route === id ? 'on' : ''} onClick={() => go(id)}>
            <Icon n={ic} size={21} /><small>{label}</small>
          </button>))}
      </nav>
      <MiniPlayer />
      <FullPlayer />
    </Shell>
    </PlayerProvider>
   </LocProvider>
  );
}

function Shell({ children }) {
  const p = usePlayer();
  return <div className={`app ${p?.track ? 'has-mini' : ''}`}>{children}</div>;
}

function StatusPanel({ onClose, offCount, total }) {
  const [stats, setStats] = useState([]);
  useEffect(() => {
    const t = setInterval(() => setStats(providerStats()), 1000);
    setStats(providerStats());
    return () => clearInterval(t);
  }, []);
  const healthy = stats.filter((s) => !s.open).length;
  return (
    <div className="card" style={{ margin: '12px 16px' }}>
      <div className="chead">System status
        <button className="iconbtn" style={{ marginLeft: 'auto', width: 28, height: 28 }}
          onClick={onClose} aria-label="Close"><Icon n="x" size={15} /></button></div>
      <div className="g3">
        <div className="stat"><div className="v" style={{ color: 'var(--green)' }}>{offCount}</div><div className="l">Offline-safe</div></div>
        <div className="stat"><div className="v">{total - offCount}</div><div className="l">Live tools</div></div>
        <div className="stat"><div className="v" style={{ color: 'var(--cyan)' }}>{healthy}/{stats.length || '—'}</div><div className="l">Sources up</div></div>
      </div>
      {stats.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 190, overflow: 'auto' }}>
          {stats.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
              <span className={`dot ${s.open ? 'bad' : s.rate < 60 ? 'warn' : ''}`} />
              <span className="mono" style={{ flex: 1 }}>{s.id}</span>
              <span className="dim">{s.rate}% · {s.ms}ms</span>
            </div>))}
        </div>)}
      <div className="src"><span className="dot" />
        <span>Failed sources are skipped for 60s, then retried automatically.</span></div>
    </div>
  );
}
