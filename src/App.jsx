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
import * as A from './tools/ahm7';
import * as MP from './tools/metro-planner';
import * as BP from './tools/bus-planner';
import * as TR from './tools/trains2';
import { providerStats } from './core/engine';

/* ------------------------------------------------------------------ registry
   type: 'off' = pure browser (never fails) · 'live' = pooled network tool     */
const TOOLS = [
  // ---------- India ----------
  { id:'weather',   n:'Weather + AQI', i:'🌤️', c:'India', t:'live', d:'Forecast & air quality', C:L.Weather },
  { id:'festivals', n:'Festivals',     i:'🎉', c:'India', t:'live', d:'Holidays calendar',      C:L.Festivals },
  { id:'pincode',   n:'PIN Code',      i:'📮', c:'India', t:'live', d:'Post offices',           C:L.Pincode },
  { id:'ifsc',      n:'IFSC Finder',   i:'🏦', c:'India', t:'live', d:'Bank branches',          C:L.Ifsc },
  { id:'gst',       n:'GST Calc',      i:'🧾', c:'India', t:'off',  d:'CGST + SGST',            C:O.GstCalc },
  { id:'tax',       n:'Income Tax',    i:'💰', c:'India', t:'off',  d:'FY 2025-26',             C:O.TaxCalc },
  { id:'emi',       n:'EMI Calc',      i:'🏠', c:'India', t:'off',  d:'Loan planner',           C:O.EmiCalc },
  { id:'sip',       n:'SIP Calc',      i:'📈', c:'India', t:'off',  d:'Mutual funds',           C:O.SipCalc },

  // ---------- Time ----------
  { id:'clock',     n:'World Clock',   i:'🕐', c:'Time', t:'live', d:'12 zones live',           C:L.WorldClock },
  { id:'otd',       n:'On This Day',   i:'📅', c:'Time', t:'live', d:'History today',           C:L.OnThisDay },
  { id:'age',       n:'Age Calc',      i:'🎂', c:'Time', t:'off',  d:'Exact age',               C:O.AgeCalc },
  { id:'ts',        n:'Timestamp',     i:'⏱️', c:'Time', t:'off',  d:'Unix ↔ date',             C:O.TimestampTool },

  // ---------- Money ----------
  { id:'currency',  n:'Currency',      i:'💱', c:'Money', t:'live', d:'Live FX rates',          C:L.Currency },
  { id:'crypto',    n:'Crypto',        i:'₿',  c:'Money', t:'live', d:'Top 40 coins',           C:L.Crypto },
  { id:'pct',       n:'Percentage',    i:'％', c:'Money', t:'off',  d:'% calculator',           C:O.Percentage },

  // ---------- Music ----------
  { id:'music',     n:'Music Player',  i:'🎵', c:'Music', t:'live', d:'EQ · offline · radio',   C:Music },

  // ---------- Knowledge ----------
  { id:'wiki',      n:'Wikipedia',     i:'🌐', c:'Learn', t:'live', d:'Encyclopedia',           C:L.Wikipedia },
  { id:'dict',      n:'Dictionary',    i:'📖', c:'Learn', t:'live', d:'Definitions + audio',    C:L.Dictionary },
  { id:'books',     n:'Books',         i:'📚', c:'Learn', t:'live', d:'Open Library',           C:L.Books },
  { id:'country',   n:'Countries',     i:'🗺️', c:'Learn', t:'live', d:'Country facts',          C:L.Countries },
  { id:'name',      n:'Name Guess',    i:'🔮', c:'Learn', t:'live', d:'Age & gender',           C:L.NameGuess },

  // ---------- Media ----------
  { id:'news',      n:'Tech News',     i:'📰', c:'Media', t:'live', d:'HN + Lobsters',          C:L.News },
  { id:'movies',    n:'Movies & TV',   i:'🎬', c:'Media', t:'live', d:'Search titles',          C:L.Movies },
  { id:'jokes',     n:'Jokes',         i:'😄', c:'Media', t:'live', d:'Random joke',            C:L.Jokes },
  { id:'quotes',    n:'Quotes',        i:'💬', c:'Media', t:'live', d:'Inspiration',            C:L.Quotes },

  // ---------- Science ----------
  { id:'iss',       n:'ISS Tracker',   i:'🛰️', c:'Space', t:'live', d:'Live position',          C:L.Space },
  { id:'quake',     n:'Earthquakes',   i:'🌍', c:'Space', t:'live', d:'USGS live feed',         C:L.Quakes },

  // ---------- Text ----------
  { id:'case',      n:'Case Convert',  i:'🔤', c:'Text', t:'off', d:'9 formats',                C:O.CaseConvert },
  { id:'wc',        n:'Word Count',    i:'🔢', c:'Text', t:'off', d:'Stats & read time',        C:O.WordCount },
  { id:'lines',     n:'Line Tools',    i:'📝', c:'Text', t:'off', d:'Sort, dedupe…',            C:O.TextTools },
  { id:'lorem',     n:'Lorem Ipsum',   i:'📄', c:'Text', t:'off', d:'Placeholder text',         C:O.LoremGen },

  // ---------- Dev ----------
  { id:'b64',       n:'Base64',        i:'🔐', c:'Dev', t:'off', d:'Encode / decode',           C:O.Base64 },
  { id:'url',       n:'URL Encode',    i:'🔗', c:'Dev', t:'off', d:'Percent encoding',          C:O.UrlEncode },
  { id:'json',      n:'JSON Tools',    i:'{}', c:'Dev', t:'off', d:'Format · YAML',             C:O.JsonTool },
  { id:'jwt',       n:'JWT Decode',    i:'🎫', c:'Dev', t:'off', d:'Inspect token',             C:O.JwtDecode },
  { id:'regex',     n:'Regex Test',    i:'*',  c:'Dev', t:'off', d:'Live matching',             C:O.RegexTest },
  { id:'hash',      n:'Hash',          i:'#️⃣', c:'Dev', t:'off', d:'SHA-1/256/384/512',        C:O.Hash },
  { id:'gh',        n:'GitHub',        i:'⚙️', c:'Dev', t:'live', d:'Repo search',              C:L.Repos },
  { id:'ip',        n:'My IP',         i:'📡', c:'Dev', t:'live', d:'IP & location',            C:L.MyIp },

  // ---------- Generate ----------
  { id:'pw',        n:'Password',      i:'🔑', c:'Generate', t:'off', d:'Secure random',        C:O.Password },
  { id:'uuid',      n:'UUID',          i:'🆔', c:'Generate', t:'off', d:'v4 bulk',              C:O.Uuid },
  { id:'qr',        n:'QR Code',       i:'▦',  c:'Generate', t:'off', d:'Custom colours',       C:O.QrGen },
  { id:'dice',      n:'Dice Roll',     i:'🎲', c:'Generate', t:'off', d:'d4 → d100',            C:O.DiceRoll },

  // ---------- Convert ----------
  { id:'unit',      n:'Unit Convert',  i:'📏', c:'Convert', t:'off', d:'7 categories',          C:O.UnitConvert },
  { id:'temp',      n:'Temperature',   i:'🌡️', c:'Convert', t:'off', d:'C/F/K/R',              C:O.TempConvert },
  { id:'color',     n:'Colour Tool',   i:'🎨', c:'Convert', t:'off', d:'HEX/RGB/HSL + WCAG',    C:O.ColorTool },
  { id:'bmi',       n:'BMI',           i:'⚖️', c:'Convert', t:'off', d:'Health index',          C:O.BmiCalc },
  // ---------- Transport & Travel ----------
  { id:'trains',    n:'Trains',        i:'🚆', c:'Travel', t:'live', d:'Between stations',      C:TR.TrainsBetween },
  { id:'metro',     n:'Metro',         i:'🚇', c:'Travel', t:'live', d:'12 city networks',      C:T.Metro },
  { id:'nearby',    n:'Near Me',       i:'📍', c:'Travel', t:'live', d:'ATM, food, fuel…',      C:T.Nearby },
  { id:'guide',     n:'Travel Guide',  i:'🧭', c:'Travel', t:'live', d:'City info + SOS',       C:T.TravelGuide },
  { id:'manga',     n:'Manga',         i:'📖', c:'AHM7', t:'live', d:'Read & search',         C:A.Manga },
  { id:'novels',    n:'Novels',        i:'📕', c:'AHM7', t:'live', d:'Story library',         C:A.Novels },
  { id:'med',       n:'Medicine',      i:'💊', c:'AHM7', t:'live', d:'Drug database',         C:A.Medicine },
  { id:'courses',   n:'Courses',       i:'🎓', c:'AHM7', t:'live', d:'1000+ free courses',    C:A.Courses },
  { id:'tempmail',  n:'Temp Mail',     i:'📨', c:'AHM7', t:'live', d:'Disposable inbox',      C:A.TempMail },
  { id:'wikipdf',   n:'Wiki → PDF',    i:'📄', c:'AHM7', t:'live', d:'Article as PDF',        C:A.WikiPdf },
  { id:'hand',      n:'Handwriting',   i:'✍️', c:'AHM7', t:'live', d:'Text → handwriting',    C:A.Handwriting },
  { id:'websnap',   n:'Screenshot',    i:'📸', c:'AHM7', t:'live', d:'Capture any site',      C:A.WebSnap },
  { id:'certs',     n:'Certificates',  i:'🏆', c:'AHM7', t:'live', d:'Templates',             C:A.Certificates },
  { id:'telenor',   n:'Telenor Quiz',  i:'📶', c:'AHM7', t:'live', d:'Daily answers',         C:A.Telenor },
  { id:'dl',        n:'Downloader',    i:'⬇️', c:'Media',  t:'live', d:'Video/audio/thumb',    C:Downloader },
  { id:'trainlive', n:'Live Train',     i:'🔴', c:'Travel', t:'live', d:'Running status',       C:TR.TrainLive },
  { id:'trainsch',  n:'Train Schedule', i:'📋', c:'Travel', t:'live', d:'Full route + coaches',  C:TR.TrainSchedule },
  { id:'busplan',   n:'Bus Route',      i:'🚌', c:'Travel', t:'off',  d:'Fare + changes',       C:BP.BusPlanner },
  { id:'buslist',   n:'Bus Routes',     i:'🗒️', c:'Travel', t:'off',  d:'383 DTC routes',       C:BP.BusRoutesList },
  { id:'metroplan', n:'Metro Route',    i:'🗺️', c:'Travel', t:'off',  d:'Fare + interchanges',  C:MP.MetroPlanner },
  { id:'metronet',  n:'Metro Network',  i:'🚇', c:'Travel', t:'off',  d:'289 stations',         C:MP.MetroNetwork },
  { id:'metrolines',n:'Metro Lines',   i:'🚈', c:'Travel', t:'live', d:'Real DMRC lines',      C:T.MetroLines },
  { id:'mandi',     n:'Mandi Prices',  i:'🌾', c:'India',  t:'live', d:'Daily commodity rates', C:T.Mandi },

  // ---------- Converters ----------
  { id:'imgconv',   n:'Image Convert', i:'🖼️', c:'Convert', t:'off', d:'JPG/PNG/WEBP + resize', C:C.ImageConvert },
  { id:'img2pdf',   n:'Images → PDF',  i:'📄', c:'Convert', t:'off', d:'Multi-page PDF',        C:C.ImagesToPdf },
  { id:'audioconv', n:'Audio → WAV',   i:'🎼', c:'Convert', t:'off', d:'Decode any format',     C:C.AudioConvert },
  { id:'vidframe',  n:'Video Frames',  i:'🎞️', c:'Convert', t:'off', d:'Extract as JPG',        C:C.VideoFrames },
  { id:'dataconv',  n:'Data Convert',  i:'🔀', c:'Convert', t:'off', d:'JSON/CSV/XML',          C:C.DataConvert },
  { id:'txtfile',   n:'Text → File',   i:'💾', c:'Convert', t:'off', d:'Save as any type',      C:C.TextToFile },
];

const CATS = ['All', 'AHM7', 'India', 'Travel', 'Convert', 'Music', 'Time', 'Money', 'Learn', 'Media', 'Space', 'Text', 'Dev', 'Generate'];

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
          ? <button className="iconbtn" onClick={() => go('')}>‹</button>
          : <span className="brand gradtext">OMNI</span>}
        <div className="tb-t">
          <b>{tool ? tool.n : 'OmniTools'}</b>
          <span>{tool ? tool.d : `${TOOLS.length} tools · no login`}</span>
        </div>
        {tool && (
          <button className="iconbtn" onClick={() => setFav((f) =>
            f.includes(tool.id) ? f.filter((x) => x !== tool.id) : [...f, tool.id])}>
            {fav.includes(tool.id) ? '★' : '☆'}
          </button>)}
        <button className="iconbtn" onClick={() => setShowStatus((s) => !s)}>
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
              <span className="pill on">● {offCount} work offline</span>
              <span className="pill">⚡ Auto-failover</span>
              <span className="pill">🔒 No tracking</span>
              <span className="pill" title="deployed build">⬢ {__BUILD__}</span>
            </div>
          </div>

          <div className="search">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools…" enterKeyHint="search" />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 0, color: 'var(--fg3)', fontSize: 20 }}>×</button>}
          </div>

          <div className="cats">
            {fav.length > 0 && <button className={`cat ${cat === 'Fav' ? 'on' : ''}`} onClick={() => setCat('Fav')}>★ {fav.length}</button>}
            {CATS.map((c) => <button key={c} className={`cat ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>

          {shown.length === 0
            ? <div className="state">No tools match "{q}"</div>
            : <div className="grid">
                {shown.map((t) => (
                  <button className="tile" key={t.id} onClick={() => go(t.id)}>
                    {t.t === 'live' ? <span className="live" /> : <span className="off">OFF</span>}
                    <span className="ic">{t.i}</span>
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
        <button className={!tool ? 'on' : ''} onClick={() => go('')}><span>▦</span><small>Tools</small></button>
        <button className={route === 'music' ? 'on' : ''} onClick={() => go('music')}><span>🎵</span><small>Music</small></button>
        <button className={route === 'weather' ? 'on' : ''} onClick={() => go('weather')}><span>🌤️</span><small>Weather</small></button>
        <button className={route === 'clock' ? 'on' : ''} onClick={() => go('clock')}><span>🕐</span><small>Clock</small></button>
        <button className={route === 'currency' ? 'on' : ''} onClick={() => go('currency')}><span>💱</span><small>Money</small></button>
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
      <div className="chead">System status <button className="iconbtn" style={{ marginLeft: 'auto', width: 28, height: 28, fontSize: 15 }} onClick={onClose}>×</button></div>
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
