import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import * as O from './tools/offline';
import * as L from './tools/live';
import * as T from './tools/transit';
import * as C from './tools/convert';
import { LocProvider } from './core/geo';
/* Sound effects belong to the app, not to one tool: the gesture layer is started
   here, in the shell, so a tap on any button in any tool answers. It imports no
   data file and no audio file — every sound is synthesised in the browser. */
import { attach as sfxAttach, enabled as sfxEnabled, setEnabled as sfxSet, play as sfxPlay } from './core/sfx';
import { PlayerProvider, usePlayer } from './core/player';
import { APP_MODE } from './core/app-bridge';
import { AppHomeTop, AppHomeCats, AppTabBar } from './ui/apphome';
import { MiniPlayer, FullPlayer } from './ui/PlayerUI';
/* The bus and metro tools carry the transit datasets (2.4 MB of JSON) behind a
   lazy boundary, so the app shell paints at its original size and a traveller
   who never opens Travel never downloads them. */
/* The bus dataset (2.2 MB) is fetched data now, not bundle: hub chunks and
   the dataset load in parallel, and the hub renders only once both land.
   A failed fetch lets the hub open on an empty dataset rather than wedging
   the lazy loader — the next open retries. */
const withBus = (p) => Promise.all([p, loadBusData().catch(() => null)]).then(([m]) => m);
const BusHub = lazy(() => withBus(import('./tools/travel-hubs')).then((m) => ({ default: m.BusHub })));
const MetroHub = lazy(() => withBus(import('./tools/travel-hubs')).then((m) => ({ default: m.MetroHub })));
const MultiModal = lazy(() => withBus(import('./tools/multimodal')).then((m) => ({ default: m.MultiModal })));

/* Heavy tool families load on first open instead of with the shell.
   The registry points at these wrappers; the tool view already renders
   inside a Suspense boundary, so nothing else had to change. */
const lazyTool = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const Music = lazyTool(() => import('./tools/music2'), 'Music');
const Downloader = lazyTool(() => import('./tools/downloader'), 'Downloader');
const LiveTV = lazyTool(() => import('./tools/tv'), 'LiveTV');
const KundliPro = lazyTool(() => import('./tools/kundli'), 'Kundli');
const MedicineDeep = lazyTool(() => import('./tools/medicine'), 'Medicine');
const Handwriting = lazyTool(() => import('./tools/handwriting'), 'Handwriting');
const News = lazyTool(() => import('./tools/news'), 'News');
const Screen = lazyTool(() => import('./tools/screen'), 'Screen');
const Names = lazyTool(() => import('./tools/names'), 'Names');
const Settings = lazyTool(() => import('./tools/settings'), 'Settings');
const Launches = lazyTool(() => import('./tools/extra'), 'Launches');
const Recipes = lazyTool(() => import('./tools/extra'), 'Recipes');
const WorldData = lazyTool(() => import('./tools/extra'), 'WorldData');
const Dogs = lazyTool(() => import('./tools/newtools'), 'Dogs');
const SunTimes = lazyTool(() => import('./tools/newtools'), 'SunTimes');
const Riddles = lazyTool(() => import('./tools/newtools'), 'Riddles');
const Horoscope = lazyTool(() => import('./tools/newtools'), 'Horoscope');
const Trivia = lazyTool(() => import('./tools/newtools'), 'Trivia');
const Cats = lazyTool(() => import('./tools/newtools'), 'Cats');
const Universities = lazyTool(() => import('./tools/newtools'), 'Universities');
const Food = lazyTool(() => import('./tools/newtools'), 'Food');
const Manga = lazyTool(() => import('./tools/reader'), 'Manga');
const Novels = lazyTool(() => import('./tools/reader'), 'Novels');
const Courses = lazyTool(() => import('./tools/utils'), 'Courses');
const TempMail = lazyTool(() => import('./tools/utils'), 'TempMail');
const WikiPdf = lazyTool(() => import('./tools/utils'), 'WikiPdf');
const WebSnap = lazyTool(() => import('./tools/utils'), 'WebSnap');
const Certificates = lazyTool(() => import('./tools/utils'), 'Certificates');
const Telenor = lazyTool(() => import('./tools/utils'), 'Telenor');
const Gita = lazyTool(() => import('./tools/devotional'), 'Gita');
const Quran = lazyTool(() => import('./tools/devotional'), 'Quran');
const Bible = lazyTool(() => import('./tools/devotional'), 'Bible');
const Gurbani = lazyTool(() => import('./tools/devotional'), 'Gurbani');
const Devotional = lazyTool(() => import('./tools/devotional'), 'Devotional');
const RecipesDeep = lazyTool(() => import('./tools/devotional'), 'RecipesDeep');
const Rashifal = lazyTool(() => import('./tools/devotional'), 'Rashifal');
const Panchang = lazyTool(() => import('./tools/panchang'), 'Panchang');
const VerseOfDay = lazyTool(() => import('./tools/votd'), 'VerseOfDay');
const PathReminders = lazyTool(() => import('./tools/reminders'), 'Reminders');
const SleepSounds = lazyTool(() => import('./tools/sleepsounds'), 'SleepSounds');
const Saraiki = lazyTool(() => import('./tools/saraiki'), 'Saraiki');
const Languages = lazyTool(() => import('./tools/languages'), 'Languages');
const Urdu = lazyTool(() => import('./tools/languages'), 'Urdu');
const Punjabi = lazyTool(() => import('./tools/languages'), 'Punjabi');
const Gurmukhi = lazyTool(() => import('./tools/languages'), 'Gurmukhi');
const PincodeFull = lazyTool(() => import('./tools/directories'), 'PincodeFull');
const IfscFull = lazyTool(() => import('./tools/directories'), 'IfscFull');
const BloodBanks = lazyTool(() => import('./tools/directories'), 'BloodBanks');
const CricketArchive = lazyTool(() => import('./tools/cricket'), 'CricketArchive');
const Kanoon = lazyTool(() => import('./tools/kanoon'), 'Kanoon');
const ClassicBooks = lazyTool(() => import('./tools/classics'), 'ClassicBooks');
const Radio = lazyTool(() => import('./tools/radio'), 'Radio');
const Podcasts = lazyTool(() => import('./tools/podcasts'), 'Podcasts');
const PayLinks = lazyTool(() => import('./tools/paylinks'), 'PayLinks');
const DocScanner = lazyTool(() => import('./tools/scanner'), 'Scanner');
const Games = lazyTool(() => import('./tools/games'), 'Games');
const VoiceRecorder = lazyTool(() => import('./tools/recorder'), 'Recorder');
const Bullion = lazyTool(() => import('./tools/bullion'), 'Bullion');
import { Hub } from './tools/travel-hub';
import { Spin, Section, SkelRows, Empty, Toaster, toast } from './ui/kit';
import * as W from './tools/world';
import { providerStats } from './core/engine';
import { loadBusData } from './core/bus-route';
import { sessSet, SESS_RESUME_MUSIC, SESS_OPEN_TV } from './core/keys';
import { searchMusic } from './core/music';
import { history as libHistory } from './core/library';
import { recent as tvRecent } from './core/iptv';
import { getLiveStatus } from './core/live-status';
import { startPresence, usePresence } from './core/presence';
import { onInstallPrompt, triggerInstall, isStandalone } from './core/pwa';
import { lastRead, lowDataOn, useLowData } from './ui/readerkit';
import { votdKind } from './core/votd';
import { loadReminders, saveReminders, dueReminders, markFired, openTarget, targetById } from './core/reminders';
import { Icon } from './ui/icons';

/* ------------------------------------------------------ universal search
   One box, three kinds of answer: tools, songs, channels. Matching is
   forgiving about spelling — case, spaces and punctuation are normalised
   away, and a small alias map covers the Hinglish words people actually
   type (gaana, samachar, mausam, dawai…). */
const normQ = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9\u0900-\u097F]+/g, ' ').replace(/\s+/g, ' ').trim();
const ALIASES = {
  gaana: 'music', gana: 'music', geet: 'music', songs: 'music',
  samachar: 'news', khabar: 'news', mausam: 'weather',
  dawai: 'med', dava: 'med', dawa: 'med', paisa: 'currency',
  fm: 'radio', podcast: 'podcasts', khel: 'games', game: 'games',
  sona: 'gold', chandi: 'gold', record: 'recorder', scan: 'scan',
};
function toolMatches(t, q) {
  const hay = normQ(`${t.n} ${t.d} ${t.c}`);
  return normQ(q).split(' ').filter(Boolean)
    .every((tok) => hay.includes(tok) || ALIASES[tok] === t.id);
}

/* Channel index for the home search: two broad, light lists (not the
   19 MB complete index), fetched once on first use and kept in memory. */
let chanIndexCache = null;
let chanIndexBusy = null;
function loadChanIndex() {
  if (chanIndexCache) return Promise.resolve(chanIndexCache);
  if (chanIndexBusy) return chanIndexBusy;
  chanIndexBusy = (async () => {
    try {
      const TV = await import('./core/iptv');
      const urls = (TV.PLAYLISTS[0]?.urls || [])
        .filter((u) => u.includes('playlist_india') || u.includes('countries/in.m3u'));
      const rows = await TV.loadPlaylist(urls, { ms: 20000 });
      chanIndexCache = rows;
      return rows;
    } catch { return []; }
  })();
  return chanIndexBusy;
}

/* ------------------------------------------------------------ travel hubs
   Eleven separate Travel tiles were impossible to tell apart. They are now
   three mode hubs — Bus, Train, Metro — each keeping every feature as a tab. */
const TrainHub = lazy(async () => {
  const [TR, TJ, TT] = await Promise.all([import('./tools/trains2'), import('./tools/train-journey'), import('./tools/traintable')]);
  return { default: () => (
    <Hub icon="train" title="Indian Railways" sub="Live status · schedule · trains between stations"
      tabs={[
        { id: 'between', n: 'Find trains', i: 'search',  C: TR.TrainsBetween },
        { id: 'live',    n: 'Live status', i: 'signal',  C: TR.TrainLive },
        { id: 'sched',   n: 'Schedule',    i: 'list',    C: TR.TrainSchedule },
        { id: 'tt',      n: 'Time table',  i: 'clock',   C: TT.TrainTimeTable },
        { id: 'journey', n: 'Long journey',i: 'luggage', C: TJ.TrainJourney },
      ]} />) };
});

/* ------------------------------------------------------------------ registry
   type: 'off' = pure browser (never fails) · 'live' = pooled network tool
   i    = icon name from src/ui/icons.jsx (real SVG, never an emoji)          */
const TOOLS = [
  // ---------- Travel (grouped by mode) ----------
  { id:'bus',       n:'Bus',           i:'bus',      c:'Travel', t:'off',  d:'2,564 directions, timetables, fares', C:BusHub },
  { id:'train',     n:'Train',         i:'train',    c:'Travel', t:'live', d:'Live status & schedules',  C:TrainHub },
  { id:'metro',     n:'Metro',         i:'metro',    c:'Travel', t:'off',  d:'287 stations, fares, last train', C:MetroHub },
  { id:'journey',   n:'Plan Journey',  i:'compass',  c:'Travel', t:'off',  d:'Metro + bus combined',     C:MultiModal },
  { id:'nearby',    n:'Near Me',       i:'pin',      c:'Travel', t:'live', d:'ATM, food, fuel…',         C:T.Nearby },
  { id:'guide',     n:'Travel Guide',  i:'globe',    c:'Travel', t:'live', d:'City info + SOS',          C:T.TravelGuide },
  { id:'sos',       n:'Emergency',     i:'warn',     c:'Travel', t:'live', d:'Helplines, India & world', C:W.Emergency },
  { id:'dial',      n:'Dial Codes',    i:'signal',   c:'Travel', t:'live', d:'Country calling codes',    C:W.DialCodes },

  // ---------- India ----------
  { id:'weather',   n:'Weather + AQI', i:'sun',      c:'India', t:'live', d:'Forecast & air quality',    C:L.Weather },
  { id:'festivals', n:'Festivals',     i:'calendar', c:'India', t:'live', d:'Holidays calendar',         C:L.Festivals },
  { id:'pincode',   n:'PIN Code',      i:'mail',     c:'India', t:'live', d:'157,126 post offices · full directory', C:PincodeFull },
  { id:'ifsc',      n:'IFSC Finder',   i:'bank',     c:'India', t:'live', d:'183,214 branches · full directory', C:IfscFull },
  { id:'kanoon',    n:'Kanoon',        i:'scale',    c:'India', t:'live', d:'BNS + IPC · every section',   C:Kanoon },
  { id:'mandi',     n:'Mandi Prices',  i:'wheat',    c:'India', t:'live', d:'Daily commodity rates',     C:T.Mandi },
  { id:'gst',       n:'GST Calc',      i:'receipt',  c:'India', t:'off',  d:'CGST + SGST',               C:O.GstCalc },
  { id:'tax',       n:'Income Tax',    i:'rupee',    c:'India', t:'off',  d:'FY 2025-26',                C:O.TaxCalc },
  { id:'emi',       n:'EMI Calc',      i:'home',     c:'India', t:'off',  d:'Loan planner',              C:O.EmiCalc },
  { id:'sip',       n:'SIP Calc',      i:'chart',    c:'India', t:'off',  d:'Mutual funds',              C:O.SipCalc },
  { id:'upi',       n:'UPI QR & Links',i:'qr',       c:'India', t:'off',  d:'Payment QR + chat link',    C:PayLinks },

  // ---------- Health ----------
  { id:'med',       n:'Medicine',      i:'pill',     c:'Health', t:'live', d:'253,802 medicines · uses & price', C:MedicineDeep },
  { id:'blood',     n:'Blood Banks',   i:'heart',    c:'Health', t:'live', d:'2,820 banks · address & phone', C:BloodBanks },
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
  { id:'gold',      n:'Gold & Silver', i:'sparkle',  c:'Money', t:'live', d:'World spot price in ₹',     C:Bullion },
  { id:'pct',       n:'Percentage',    i:'percent',  c:'Money', t:'off',  d:'% calculator',              C:O.Percentage },

  // ---------- Music ----------
  { id:'music',     n:'Music Player',  i:'music',    c:'Music', t:'live', d:'Ad-free · EQ · background', C:Music },

  // ---------- Learn ----------
  { id:'wiki',      n:'Wikipedia',     i:'globe',    c:'Learn', t:'live', d:'Encyclopedia',              C:L.Wikipedia },
  { id:'dict',      n:'Dictionary',    i:'book',     c:'Learn', t:'live', d:'Definitions + audio',       C:L.Dictionary },
  { id:'books',     n:'Books',         i:'books',    c:'Learn', t:'live', d:'Open Library',              C:L.Books },
  { id:'classics',  n:'Classic Books', i:'book',     c:'Learn', t:'live', d:'70,000+ free books · read here', C:ClassicBooks },
  { id:'cricket',   n:'Cricket Archive', i:'chart',  c:'Media', t:'live', d:'IPL + ODI · T20I · Test · full scorecards', C:CricketArchive },
  { id:'country',   n:'Countries',     i:'earth',    c:'Learn', t:'live', d:'250 countries, full detail', C:W.Countries },
  { id:'names',     n:'Names & Surnames', i:'smile', c:'Learn', t:'live', d:'5,695 names · caste, region',C:Names },
  { id:'saraiki',   n:'Saraiki Seekhna', i:'book',   c:'Learn', t:'off',  d:'Sabaq course · Shahmukhi + Roman', C:Saraiki },
  { id:'languages', n:'Languages',     i:'book',   c:'Learn', t:'off',  d:'Saraiki · Urdu · Punjabi · Gurmukhi', C:Languages },
  { id:'urdu',      n:'Urdu Sikho',    i:'book',   c:'Learn', t:'off',  d:'Script first · 38 haroof · 10 Sabaq', C:Urdu },
  { id:'punjabi',   n:'Punjabi Sikho', i:'book',   c:'Learn', t:'off',  d:'Spoken Punjabi · Shahmukhi · 10 Sabaq', C:Punjabi },
  { id:'gurmukhi',  n:'Gurmukhi Sikho', i:'type',  c:'Learn', t:'off',  d:'35 akhar · read Gurbani line by line', C:Gurmukhi },
  { id:'worlddata', n:'World Data',    i:'chart',    c:'Learn', t:'live', d:'16 indicators, 25 years',   C:WorldData },

  // ---------- Media ----------
  { id:'dl',        n:'Downloader',    i:'download', c:'Media', t:'live', d:'Video / audio / thumbnail', C:Downloader },
  { id:'news',      n:'News',          i:'news',     c:'Media', t:'live', d:'52 countries · every topic', C:News },
  { id:'movies',    n:'Movies & TV',   i:'film',     c:'Media', t:'live', d:'Cast, seasons, episodes',    C:Screen },
  { id:'tv',        n:'Live TV',       i:'satellite',c:'Media', t:'live', d:'2,400+ Indian channels, free', C:LiveTV },
  { id:'radio',     n:'Internet Radio',i:'radio',    c:'Media', t:'live', d:'World stations · India first', C:Radio },
  { id:'podcasts',  n:'Podcasts',      i:'wave',     c:'Media', t:'live', d:'Shows & episodes, in-app play', C:Podcasts },
  { id:'jokes',     n:'Jokes',         i:'smile',    c:'Media', t:'live', d:'Random joke',               C:L.Jokes },
  { id:'quotes',    n:'Quotes',        i:'quote',    c:'Media', t:'live', d:'Inspiration',               C:L.Quotes },
  { id:'recipes',   n:'Recipes',       i:'flask',    c:'Everyday', t:'live', d:'790 recipes, 37 cuisines', C:Recipes },
  { id:'dogs',      n:'Dog Explorer',  i:'smile',    c:'Everyday', t:'live', d:'Breeds, photos & facts',     C:Dogs },
  { id:'cats',      n:'Cat Explorer',  i:'smile',    c:'Everyday', t:'live', d:'Facts & cute photos',        C:Cats },
  { id:'riddles',   n:'Riddles',       i:'quote',    c:'Everyday', t:'live', d:'Brain teasers with answer',  C:Riddles },
  { id:'trivia',    n:'Trivia Quiz',   i:'star',     c:'Everyday', t:'live', d:'Multiple choice quiz',       C:Trivia },
  { id:'games',     n:'Games',         i:'dice',     c:'Everyday', t:'off', d:'50 mini games — reflex · puzzle · brain · arcade · cards',      C:Games },
  { id:'recorder',  n:'Voice Recorder',i:'mic',      c:'Everyday', t:'off', d:'Record, save & play notes',  C:VoiceRecorder },
  { id:'horoscope', n:'Horoscope',     i:'star',     c:'Everyday', t:'live', d:'Daily zodiac predictions',   C:Horoscope },
  { id:'food',      n:'Food Scanner',  i:'flask',    c:'Everyday', t:'live', d:'Products & nutrition',       C:Food },
  { id:'uni',       n:'Universities',  i:'cap',      c:'Learn',    t:'live', d:'Find universities worldwide',C:Universities },

  // ---------- Bhakti / Holy books ----------
  { id:'gita',      n:'Bhagavad Gita', i:'book',     c:'Bhakti', t:'live', d:'18 chapters 700 verses real', C:Gita },
  { id:'quran',     n:'Quran',         i:'book',     c:'Bhakti', t:'live', d:'114 surahs 6236 ayahs real',  C:Quran },
  { id:'bible',     n:'Holy Bible',    i:'books',    c:'Bhakti', t:'live', d:'66 books 31102 verses real',  C:Bible },
  { id:'gurbani',   n:'Gurbani',       i:'books',    c:'Bhakti', t:'live', d:'1430 Angs Hukamnama real',    C:Gurbani },
  { id:'devotional',n:'Aarti & Mantra',i:'star',     c:'Bhakti', t:'off',  d:'Aarti Chalisa Bhajan Mantra + Audio',   C:Devotional },
  { id:'panchang',  n:'Daily Panchang', i:'sun',     c:'Bhakti', t:'off',  d:'Tithi nakshatra yoga karana · Rahu Kaal · on device', C:Panchang },
  { id:'votd',      n:'Verse of the Day', i:'sparkle', c:'Bhakti', t:'off',  d:'One verse a day · shareable card', C:VerseOfDay },
  { id:'reminders', n:'Path Reminders', i:'bell',    c:'Bhakti', t:'off',  d:'Daily path & aarti reminders', C:PathReminders },
  { id:'sleep',     n:'Sleep & Focus Sounds', i:'moon', c:'Health', t:'off', d:'Rain river wind bells · sleep timer', C:SleepSounds },
  { id:'recipesdeep',n:'Recipes Deep', i:'flask',    c:'Everyday', t:'live', d:'Ingredients video deep',   C:RecipesDeep },
  { id:'rashifal',  n:'Rashifal',      i:'star',     c:'India',  t:'live', d:'Hinglish Mesh-Vrishabh etc',  C:Rashifal },
  { id:'kundli',    n:'Kundli Pro v3', i:'star',     c:'India',  t:'off',  d:'3-Layer Verified - No Fake Data - Professional', C:KundliPro },
  { id:'settings',  n:'Settings',      i:'cog',      c:'Everyday', t:'off', d:'PWA App-like + Themes + Live Check - Standard Settings', C:Settings },

  // ---------- the resolver ----------
  { id:'manga',     n:'Manga',         i:'book',     c:'Everyday', t:'live', d:'Read chapters + pages',      C:Manga },
  { id:'novels',    n:'Novels',        i:'books',    c:'Everyday', t:'live', d:'Read full chapters',         C:Novels },
  { id:'courses',   n:'Courses',       i:'cap',      c:'Everyday', t:'live', d:'1000+ free courses',         C:Courses },
  { id:'tempmail',  n:'Temp Mail',     i:'mail',     c:'Everyday', t:'live', d:'Disposable inbox',           C:TempMail },
  { id:'wikipdf',   n:'Wiki → PDF',    i:'doc',      c:'Everyday', t:'live', d:'Article as PDF',             C:WikiPdf },
  { id:'hand',      n:'Handwriting',   i:'pen',      c:'Everyday', t:'live', d:'Neat page, ready to print', C:Handwriting },
  { id:'websnap',   n:'Screenshot',    i:'camera',   c:'Everyday', t:'live', d:'Capture any site',           C:WebSnap },
  { id:'certs',     n:'Certificates',  i:'badge',    c:'Everyday', t:'live', d:'Templates',                  C:Certificates },
  { id:'telenor',   n:'My Telenor Quiz', i:'check',  c:'Everyday', t:'live', d:'Today’s quiz answers',       C:Telenor },

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
  { id:'scan',      n:'Doc Scanner',   i:'camera',   c:'Convert', t:'off', d:'Scan pages → one PDF',     C:DocScanner },
  { id:'audioconv', n:'Audio → WAV',   i:'disc',     c:'Convert', t:'off', d:'Decode any format',        C:C.AudioConvert },
  { id:'vidframe',  n:'Video Frames',  i:'film',     c:'Convert', t:'off', d:'Extract as JPG',           C:C.VideoFrames },
  { id:'dataconv',  n:'Data Convert',  i:'swap',     c:'Convert', t:'off', d:'JSON/CSV/XML',             C:C.DataConvert },
  { id:'txtfile',   n:'Text → File',   i:'save',     c:'Convert', t:'off', d:'Save as any type',         C:C.TextToFile },
];

const CATS = ['All', 'Travel', 'India', 'Bhakti', 'Health', 'Everyday', 'Convert', 'Music',
              'Time', 'Money', 'Learn', 'Media', 'Space', 'Text', 'Dev', 'Generate'];

/* ------------------------------------------------------- category cards
   Home's browsing surface is one big card per category. The cards are
   DERIVED from the registry above — counts, membership and preview names
   are computed from TOOLS, never hardcoded — so a tool registered by
   anyone, in any category (including a brand-new one), appears on its
   own. This map only carries the dressing: an icon, one line of copy
   and an accent chosen from the existing theme variables. A category
   with no entry here still gets a card, with the generic icon and an
   accent by rotation. */
const CATMETA = {
  Travel:   { i: 'route',     a: '--cyan',  d: 'Bus, train & metro — routes, fares, live status' },
  India:    { i: 'flag',      a: '--warn',  d: 'Weather, PIN, IFSC, mandi prices & tax' },
  Bhakti:   { i: 'book',      a: '--green', d: 'Gita, Quran, Bible, Gurbani, aarti & mantra' },
  Health:   { i: 'heart',     a: '--bad',   d: 'Medicine search, BMI & health checks' },
  Everyday: { i: 'sparkle',   a: '--cyan',  d: 'Recipes, quizzes, horoscope & more' },
  Convert:  { i: 'swap',      a: '--warn',  d: 'Units, images, audio & file conversion' },
  Music:    { i: 'music',     a: '--green', d: 'Ad-free player — EQ, lyrics, offline songs' },
  Time:     { i: 'clock',     a: '--cyan',  d: 'World clock, sun times, age & dates' },
  Money:    { i: 'rupee',     a: '--green', d: 'Currency, crypto & percentage tools' },
  Learn:    { i: 'cap',       a: '--warn',  d: 'Wikipedia, dictionary, books & world data' },
  Media:    { i: 'film',      a: '--cyan',  d: 'Downloader, news, movies & live TV' },
  Space:    { i: 'satellite', a: '--cyan',  d: 'ISS tracker, earthquakes & launches' },
  Text:     { i: 'type',      a: '--warn',  d: 'Case, word count & line tools' },
  Dev:      { i: 'code',      a: '--green', d: 'Base64, JSON, JWT, regex & hash' },
  Generate: { i: 'qr',        a: '--cyan',  d: 'Passwords, UUIDs, QR codes & dice' },
};
const CAT_ACCENTS = ['--green', '--cyan', '--warn', '--bad'];
function catMeta(name, idx) {
  if (name === '__az') return { i: 'list', a: '--cyan', d: 'Every tool, in alphabetical order' };
  if (name === '__fav') return { i: 'staron', a: '--warn', d: 'Your pinned tools, one tap away' };
  return CATMETA[name] || { i: 'grid', a: CAT_ACCENTS[(idx || 0) % CAT_ACCENTS.length], d: '' };
}
const parseCat = (r) => {
  try { return decodeURIComponent(r.slice(4)); } catch { return r.slice(4); }
};

/* The hash may carry share/pl params after the tool id (#dl?url=…) —
   the route is only the part before ? or &. */
const readRoute = () => (location.hash.slice(1) || '').split(/[?&]/)[0];

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [q, setQ] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  const lowData = useLowData();
  const [snd, setSnd] = useState(() => sfxEnabled());
  const [scrolled, setScrolled] = useState(false);
  /* Search remembers what worked: the last few searches, one tap to
     run again. Stored only on this device, cleared in one tap. */
  const [recentQ, setRecentQ] = useState(() => {
    try { return JSON.parse(localStorage.getItem('omni:searches') || '[]'); } catch { return []; }
  });
  const [qFocus, setQFocus] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    addEventListener('scroll', on, { passive: true });
    on();
    return () => removeEventListener('scroll', on);
  }, []);
  const commitSearch = (s) => {
    const v = String(s || '').trim();
    if (v.length < 2) return;
    setRecentQ((cur) => {
      const nxt = [v, ...cur.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6);
      try { localStorage.setItem('omni:searches', JSON.stringify(nxt)); } catch {}
      return nxt;
    });
  };
  const clearRecentQ = () => {
    setRecentQ([]);
    try { localStorage.removeItem('omni:searches'); } catch {}
  };

  useEffect(() => sfxAttach(), []);
  useEffect(() => { startPresence(); }, []);
  const [fav, setFav] = useState(() => {
    try { return JSON.parse(localStorage.getItem('omni:fav') || '[]'); } catch { return []; }
  });
  const [recentTools, setRecentTools] = useState(() => {
    try { return JSON.parse(localStorage.getItem('omni:recent') || '[]'); } catch { return []; }
  });

  /* Navigation remembers two things the old handler threw away: where
     each view was scrolled to (restored on return — home above all),
     and the in-app stack, so the top bar's Back is a real Back. */
  const routeRef = useRef(route);
  const navStackRef = useRef([route]);
  useEffect(() => {
    const h = () => {
      const nxt = readRoute();
      const prev = routeRef.current;
      try {
        const map = JSON.parse(sessionStorage.getItem('omni:scrollpos') || '{}');
        map[prev] = window.scrollY;
        sessionStorage.setItem('omni:scrollpos', JSON.stringify(map));
      } catch { /* storage off — views just open at the top */ }
      const st = navStackRef.current;
      if (st.length > 1 && st[st.length - 2] === nxt) st.pop();
      else if (st[st.length - 1] !== nxt) st.push(nxt);
      routeRef.current = nxt;
      setRoute(nxt);
    };
    addEventListener('hashchange', h); return () => removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    let y = 0;
    try { y = JSON.parse(sessionStorage.getItem('omni:scrollpos') || '{}')[route] || 0; } catch { /* ignore */ }
    if (y > 0) {
      const t = setTimeout(() => window.scrollTo(0, y), 60);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
    return undefined;
  }, [route]);
  useEffect(() => { localStorage.setItem('omni:fav', JSON.stringify(fav)); }, [fav]);
  useEffect(() => {
    /* Only real tools are "recently used" — a category route must not
       evict tools from the shelf's short memory. */
    if (!route || !TOOLS.some((t) => t.id === route)) return;
    setRecentTools((cur) => {
      const nxt = [route, ...cur.filter((x) => x !== route)].slice(0, 8);
      try { localStorage.setItem('omni:recent', JSON.stringify(nxt)); } catch {}
      return nxt;
    });
  }, [route]);

  const tool = TOOLS.find((t) => t.id === route);

  /* A category is a route too (#cat:Travel), so the category view gets
     the same gifts a tool gets: the in-app Back stack, browser Back,
     and a scroll position of its own. Two pseudo-categories ride along:
     __fav (pinned) and __az (every tool, A–Z). */
  const openCat = !tool && route.startsWith('cat:') ? parseCat(route) : null;
  const favTools = useMemo(() => TOOLS.filter((t) => fav.includes(t.id)), [fav]);
  const catViewList = openCat === '__az'
    ? [...TOOLS].sort((a, b) => a.n.localeCompare(b.n))
    : openCat === '__fav' ? favTools
    : openCat ? TOOLS.filter((t) => t.c === openCat) : [];
  const catViewMeta = openCat ? catMeta(openCat, 0) : null;
  const catViewTitle = openCat === '__az' ? 'All tools A–Z'
    : openCat === '__fav' ? 'Pinned tools' : openCat;

  /* The home category cards, derived from the registry: every category
     that has tools, in the house order first, then any new category in
     the order its first tool registered it. */
  const catList = useMemo(() => {
    const seen = [];
    for (const t of TOOLS) if (!seen.includes(t.c)) seen.push(t.c);
    const ordered = CATS.slice(1).filter((c) => seen.includes(c));
    for (const c of seen) if (!ordered.includes(c)) ordered.push(c);
    return ordered
      .map((name, i) => ({ name, meta: catMeta(name, i), list: TOOLS.filter((t) => t.c === name) }))
      .filter((c) => c.list.length);
  }, []);

  const shown = useMemo(
    () => (q.trim() ? TOOLS.filter((t) => toolMatches(t, q)) : TOOLS), [q]);

  /* Songs + channels for the universal search, debounced. */
  const [uni, setUni] = useState({ songs: null, chans: null, loading: false });
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setUni({ songs: null, chans: null, loading: false }); return undefined; }
    setUni((u) => ({ ...u, loading: true }));
    let dead = false;
    const t = setTimeout(async () => {
      const [songs, chans] = await Promise.all([
        searchMusic(s, { deep: false }).then((r) => (r.tracks || []).slice(0, 8)).catch(() => []),
        lowData ? Promise.resolve([]) : loadChanIndex().then((rows) => {
          const nq = normQ(s);
          return rows.filter((c) => normQ(`${c.name} ${c.group || ''}`).includes(nq)).slice(0, 10);
        }).catch(() => []),
      ]);
      if (!dead) { setUni({ songs, chans, loading: false }); commitSearch(s); }
    }, 450);
    return () => { dead = true; clearTimeout(t); };
  }, [q, lowData]);

  const go = (id) => { location.hash = id; };
  /* True Back where this session has somewhere to go back to; a deep
     link that landed straight on a tool goes Home instead. */
  const goBack = () => {
    if (navStackRef.current.length > 1) history.back();
    else go('');
  };
  const offCount = TOOLS.filter((t) => t.t === 'off').length;

  /* ------------------------------------------------------ tool-open flight
     Opening a tool is one small ceremony, the same from every surface:
     the tapped tile lifts off and flies into the top bar while the tool
     view rises underneath it (see ToolGhost). The source rectangle is
     measured once, at the tap; the flight itself is transform/opacity
     only. Reduced motion — or a tap with nothing to lift — navigates
     plainly, exactly as before. */
  const ghostSeq = useRef(0);
  const [ghost, setGhost] = useState(null);
  const openTool = (t, e) => {
    try {
      const el = e && e.currentTarget;
      if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) {
          setGhost({ id: t.id, n: t.n, i: t.i, d: t.d,
            x: r.left, y: r.top, w: r.width, h: r.height, k: (ghostSeq.current += 1) });
        }
      }
    } catch { /* a failed flourish must never block the tool itself */ }
    go(t.id);
  };

  const tileBtn = (t, i) => (
    <button className="tile" key={t.id} onClick={(e) => openTool(t, e)}
      style={{ '--i': Math.min(i || 0, 14) }}>
      {t.t === 'live' ? <span className="live" /> : <span className="off">OFF</span>}
      <span className="ic"><Icon n={t.i} size={24} /></span>
      <b>{t.n}</b>
      <small>{t.d}</small>
    </button>);

  /* One home category card. Count and preview names are read off the
     registry list it is handed — nothing about the tools is restated. */
  const catCard = (name, list, i, meta) => {
    const m = meta || catMeta(name, i);
    const title = name === '__az' ? 'All tools A–Z' : name === '__fav' ? 'Pinned' : name;
    return (
      <button className="catcard" key={name}
        style={{ '--ca': `var(${m.a})`, '--i': Math.min(i, 9) }}
        onClick={() => go(`cat:${encodeURIComponent(name)}`)}
        aria-label={`${title} — ${list.length} tools`}>
        <span className="catcard-ic"><Icon n={m.i} size={25} /></span>
        <span className="catcard-tx">
          <span className="catcard-n"><b>{title}</b>
            <span className="catcard-n2">{list.length}</span></span>
          {m.d && <span className="catcard-d">{m.d}</span>}
          <span className="catcard-p">
            {list.slice(0, 3).map((t) => t.n).join(' · ')}{list.length > 3 ? ' · …' : ''}
          </span>
        </span>
        <Icon n="chevron" size={17} className="catcard-chev" />
      </button>);
  };

  return (
   <LocProvider>
    <PlayerProvider>
    <Shell>
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        {tool || openCat
          ? <button className="iconbtn" onClick={goBack} aria-label="Back"><Icon n="back" size={19} /></button>
          : <span className="brand gradtext">OMNI</span>}
        <div className="tb-t">
          <b>{tool ? tool.n : openCat ? catViewTitle : 'OmniTools'}</b>
          <span>{tool ? tool.d : openCat ? `${catViewList.length} tools`
            : `${TOOLS.length} tools · no login`}</span>
        </div>
        {tool && (
          <button className="iconbtn" aria-label="Favourite" onClick={() => {
            const has = fav.includes(tool.id);
            sfxPlay(has ? 'remove' : 'add');
            setFav((f) => has ? f.filter((x) => x !== tool.id) : [...f, tool.id]);
            toast(has ? 'Removed from pinned tools' : 'Pinned — find it on the home shelf', 'info');
          }}>
            <Icon n={fav.includes(tool.id) ? 'staron' : 'star'} size={18}
              style={{ color: fav.includes(tool.id) ? 'var(--green)' : '' }} />
          </button>)}
        <button className="iconbtn" aria-label={snd ? 'Sound effects on' : 'Sound effects off'}
          title={snd ? 'Sound effects are on for every tool - click to silence the app'
            : 'Sound effects are off - click to let the app answer a tap'}
          onClick={() => { const v = !snd; sfxSet(v); setSnd(v); if (v) sfxPlay('toggleon'); }}>
          <Icon n={snd ? 'volume' : 'volumeoff'} size={18} style={{ color: snd ? 'var(--green)' : '' }} />
        </button>
        <button className="iconbtn" aria-label="Settings" title="Settings - themes, PWA, sounds, proxy"
          onClick={() => go('settings')}><Icon n="cog" size={18} /></button>
        <TopStatusDot onClick={() => setShowStatus((s) => !s)} />
      </header>

      {showStatus && <StatusPanel onClose={() => setShowStatus(false)} offCount={offCount} total={TOOLS.length} />}

      <div className="main-area">
        {offline && (
          <div className="offlinebar" role="status">
            <span className="dot warn" />
            <span>You&rsquo;re offline — {offCount} tools still work without internet.</span>
          </div>)}
        {!tool && openCat && (
          <div className="catview">
            <div className="catview-h" style={{ '--ca': `var(${catViewMeta.a})` }}>
              <span className="catview-ic"><Icon n={catViewMeta.i} size={30} /></span>
              <div className="catview-tx">
                <h2>{catViewTitle}</h2>
                <p>{catViewList.length} tools{catViewMeta.d ? ` — ${catViewMeta.d}` : ''}</p>
              </div>
            </div>
            {catViewList.length === 0
              ? <Empty icon={openCat === '__fav' ? 'staron' : 'search'}
                  t={openCat === '__fav'
                    ? 'No pinned tools yet — tap the star at the top of any tool to pin it'
                    : 'No tools here yet'} />
              : <div className="grid catview-grid">{catViewList.map((t, i) => tileBtn(t, i))}</div>}
            <div className="hr" />
            <button className="btn ghost" onClick={goBack}>
              <Icon n="back" size={15} /> All categories</button>
          </div>)}

        {!tool && !openCat && (<>
          {!APP_MODE && (<div className="hero">
            <h1 className="gradtext">EVERYTHING<br />IN ONE APP</h1>
            <p>{TOOLS.length} tools. Multi-source fallback on every live feature.
              No login, no signup, no API keys.</p>
            <div className="pillrow">
              <PresenceChip />
              <span className="pill on"><Icon n="check" size={13} /> {offCount} work offline</span>
              <span className="pill"><Icon n="refresh" size={13} /> Auto-failover</span>
              <span className="pill"><Icon n="shield" size={13} /> No tracking</span>
              <span className="pill" title="deployed build"><Icon n="box" size={13} /> {__BUILD__}</span>
            </div>
          </div>)}

          {!APP_MODE && !q.trim() && <Shelf fav={fav} recentTools={recentTools} go={go} open={openTool} />}
          {APP_MODE && !q.trim() && <AppHomeTop tools={TOOLS} go={go} open={openTool} />}

          <div className="search">
            <Icon n="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onFocus={() => setQFocus(true)} onBlur={() => setQFocus(false)}
              aria-label="Search tools, songs and channels"
              placeholder="Search tools, songs, channels…" enterKeyHint="search" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search"
              style={{ background: 'none', border: 0, color: 'var(--fg3)', display: 'grid', placeItems: 'center' }}>
              <Icon n="x" size={17} /></button>}
          </div>

          {!q.trim() && (qFocus || recentQ.length > 0) && (
            <div className="qchips">
              {recentQ.length > 0 && (<>
                <span className="qchips-l">Recent</span>
                {recentQ.map((r) => (
                  <button key={r} className="cat"
                    onMouseDown={(e) => { e.preventDefault(); setQ(r); }}>
                    <Icon n="clock" size={12} /> {r}</button>))}
                <button className="qchip-x" aria-label="Clear recent searches" title="Clear recent searches"
                  onMouseDown={(e) => { e.preventDefault(); clearRecentQ(); }}>
                  <Icon n="x" size={13} /></button>
              </>)}
              {qFocus && (<>
                <span className="qchips-l">Popular</span>
                {['Kaka', 'Arijit Singh', 'Train status', 'Currency', 'Aarti'].map((r) => (
                  <button key={r} className="cat"
                    onMouseDown={(e) => { e.preventDefault(); setQ(r); }}>{r}</button>))}
              </>)}
            </div>)}

          {q.trim() ? (<>
            <div className="seclabel">Tools · {shown.length}</div>
            {shown.length === 0
              ? <div className="state">No tool matched — songs and channels are below.</div>
              : <div className="grid">{shown.map(tileBtn)}</div>}
            <UniResults uni={uni} go={go} open={openTool} />
          </>) : APP_MODE ? (
            <AppHomeCats tools={TOOLS} catList={catList} favTools={favTools} go={go} />
          ) : (<>
            <div className="seclabel" style={{ marginTop: 18 }}>Browse by category</div>
            <div className="catgrid">
              {fav.length > 0 && catCard('__fav', favTools, 0)}
              {catList.map((c, i) => catCard(c.name, c.list, i + (fav.length ? 1 : 0), c.meta))}
              {catCard('__az', [...TOOLS].sort((a, b) => a.n.localeCompare(b.n)), 9)}
            </div>
          </>)}

          <div className="hr" />
          <p className="dim sm">
            <b style={{ color: 'var(--green)' }}>OFF</b> = runs fully in your browser, works without internet.
            <b style={{ color: 'var(--green)' }}> ●</b> = live data with multiple backup sources; if one fails
            another takes over automatically.
          </p>
        </>)}

        {tool && <div className="view" style={{ paddingTop: 14 }}><Suspense fallback={<Spin />}><tool.C /></Suspense></div>}
      </div>

      {APP_MODE ? (
        <AppTabBar tools={TOOLS} route={route} go={go} />
      ) : (
      <nav className="nav">
        {[['', 'grid', 'Tools'], ['music', 'music', 'Music'], ['bus', 'bus', 'Travel'],
          ['med', 'pill', 'Medicine'], ['weather', 'sun', 'Weather']].map(([id, ic, label]) => (
          <button key={id} className={route === id ? 'on' : ''} onClick={() => go(id)}>
            <Icon n={ic} size={21} /><small>{label}</small>
          </button>))}
      </nav>)}
      <MiniPlayer />
      <FullPlayer />
      {!APP_MODE && <InstallPrompt />}
      <ReminderWatcher />
      <Toaster />
      <ScrollTopBtn />
      {ghost && <ToolGhost key={ghost.k} g={ghost}
        done={() => setGhost((cur) => (cur && cur.k === ghost.k ? null : cur))} />}
    </Shell>
    </PlayerProvider>
   </LocProvider>
  );
}

/* ------------------------------------------------------- tool-open flight
   The ghost of the tapped tile, flown to the top bar. It is rendered
   outside the routed views, so it survives the home → tool swap it
   celebrates. Both rectangles are measured exactly once (the source at
   the tap, the top bar here); the flight is a single transform +
   opacity transition on one fixed element — no layout work per frame.
   It never takes pointer events, and it removes itself in ~340 ms; a
   second tap simply replaces it. */
function ToolGhost({ g, done }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const tb = document.querySelector('.topbar');
    const tr = tb ? tb.getBoundingClientRect() : { left: 0, top: 0 };
    const dx = tr.left + 10 - g.x;
    const dy = tr.top + 9 - g.y;
    const sx = 46 / g.w;
    const sy = 46 / g.h;
    const tx = el.querySelector('.flywrap-tx');
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (tx) tx.style.opacity = '0';
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      el.style.opacity = '0';
      el.style.borderRadius = '14px';
    }));
    const t = setTimeout(done, 360);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.k]);
  return (
    <div className="flywrap" ref={ref} aria-hidden="true"
      style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
      <span className="ic"><Icon n={g.i} size={24} /></span>
      <span className="flywrap-tx"><b>{g.n}</b><small>{g.d}</small></span>
    </div>);
}

function Shell({ children }) {
  const p = usePlayer();
  return (
    <div className={`app ${p?.track ? 'has-mini' : ''}`}
      style={{ '--mini-lift': p?.track ? '64px' : '0px' }}>
      {children}
    </div>);
}

/* ---------------------------------------------------------- status dot
   The header dot used to be painted permanently green. It now reads
   the same source-health stats the status panel shows: green when
   every used source is answering, amber when some are open, red when
   most are — and plain green-with-honest-title before anything has
   been used, since no claim exists yet either way. */
function TopStatusDot({ onClick }) {
  const [stats, setStats] = useState([]);
  useEffect(() => {
    const read = () => setStats(providerStats());
    read();
    const t = setInterval(read, 5000);
    return () => clearInterval(t);
  }, []);
  const open = stats.filter((x) => x.open).length;
  const cls = stats.length && open > 0 ? (open < stats.length / 2 ? 'warn' : 'bad') : '';
  const title = !stats.length
    ? 'System status — nothing has been loaded yet'
    : open === 0
      ? 'System status — every source is answering'
      : `System status — ${open} of ${stats.length} sources are having trouble`;
  return (
    <button className="iconbtn" aria-label="System status" title={title} onClick={onClick}>
      <span className={`dot ${cls}`} />
    </button>);
}

/* ------------------------------------------------------- install prompt
   The banner design existed in the stylesheet with no component using
   it; the only route to install was a folded Settings section. This
   surfaces it with manners: only when the browser actually offers an
   install, only from the second visit on, and a dismissal is
   remembered for a fortnight rather than nagging every open. */
function InstallPrompt() {
  const p = usePlayer();
  const [ready, setReady] = useState(false);
  const [visits, setVisits] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const t = +localStorage.getItem('omni:install:dismissed') || 0;
      return t > 0 && Date.now() - t < 14 * 864e5;
    } catch { return false; }
  });
  useEffect(() => {
    try {
      const n = (+localStorage.getItem('omni:visits') || 0) + 1;
      localStorage.setItem('omni:visits', String(n));
      setVisits(n);
    } catch { /* storage off — the prompt simply waits for a later visit */ }
    return onInstallPrompt(() => setReady(true));
  }, []);
  if (!ready || dismissed || visits < 2 || isStandalone()) return null;
  const dismiss = () => {
    try { localStorage.setItem('omni:install:dismissed', String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  };
  return (
    <div className="pwa-install-prompt" role="dialog" aria-label="Install OmniTools"
      style={p?.track ? { bottom: 'calc(138px + var(--safe-b))' } : undefined}>
      <Icon n="download" size={22} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13.5, display: 'block' }}>Install OmniTools</b>
        <span className="dim sm">On your home screen — opens like an app, works offline.</span>
      </div>
      <button className="btn sm" onClick={async () => { await triggerInstall(); dismiss(); }}>Install</button>
      <button className="iconbtn" style={{ width: 34, height: 34, flex: '0 0 auto' }}
        aria-label="Not now" onClick={dismiss}>
        <Icon n="x" size={15} />
      </button>
    </div>);
}

function StatusPanel({ onClose, offCount, total }) {
  const [stats, setStats] = useState([]);
  useEffect(() => {
    const t = setInterval(() => setStats(providerStats()), 1000);
    setStats(providerStats());
    return () => clearInterval(t);
  }, []);
  const healthy = stats.filter((s) => !s.open).length;
  /* The six services a user feels, probed live (cached three minutes). */
  const [liveRows, setLiveRows] = useState(null);
  const [liveAt, setLiveAt] = useState(0);
  useEffect(() => {
    let dead = false;
    getLiveStatus().then((r) => { if (!dead) { setLiveRows(r.rows); setLiveAt(r.at); } });
    return () => { dead = true; };
  }, []);
  const recheck = () => {
    setLiveRows(null);
    getLiveStatus(true).then((r) => { setLiveRows(r.rows); setLiveAt(r.at); });
  };
  return (
    <div className="card" style={{ margin: '12px 16px' }}>
      <div className="chead">System status
        <button className="iconbtn" style={{ marginLeft: 'auto', width: 28, height: 28 }}
          onClick={onClose} aria-label="Close"><Icon n="x" size={15} /></button></div>
      <PresenceRow />
      <div className="chead" style={{ fontSize: 12, marginTop: 2 }}>Live status
        <button className="rowbtn" style={{ marginLeft: 'auto' }} aria-label="Recheck services"
          onClick={recheck}><Icon n="refresh" size={15} /></button></div>
      {!liveRows ? <SkelRows n={3} h={24} /> : liveRows.map((s) => (
        <div className="src" key={s.id}>
          <span className={`dot ${s.state === 'down' ? 'bad' : s.state === 'slow' ? 'warn' : ''}`} />
          <span style={{ flex: 1 }}>{s.name}</span>
          <span className="src-meta">
            {s.state === 'down' ? (s.note || 'not answering')
              : `${(s.ms / 1000).toFixed(1)}s${s.state === 'slow' ? ' · slow' : ''}`}
          </span>
        </div>))}
      {liveAt > 0 && (
        <div className="dim sm" style={{ margin: '2px 0 10px' }}>
          Last checked {new Date(liveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {' · '}{Math.max(0, Math.round((Date.now() - liveAt) / 1000))}s ago · real probes, cached 3 minutes
        </div>)}
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

/* ------------------------------------------------------------ home shelf
   The top of home answers "where was I?" before "what exists?": resume
   the last song or channel, then pinned tools, then recently used ones.
   Everything reads the same stores the features themselves write, so the
   shelf can never promise something the app does not have. */
/* ------------------------------------------------- Wave A home pieces
   ReminderWatcher: while the app is open it checks every 30 seconds
   for a due path/aarti reminder and surfaces it as a banner + chime +
   a system notification where permission was granted. A web app
   cannot ring at an exact minute while fully closed — the Reminders
   tool says so in plain words; a missed reminder still fires on the
   next open the same day.
   VotdShelfCard: today's verse source on the home shelf; the label
   comes from the pool-free rotation core, the verse itself loads
   inside the tool. */
function ReminderWatcher() {
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    let dead = false;
    const check = () => {
      try {
        const list = loadReminders();
        const due = dueReminders(list);
        if (!due.length) return;
        let next = list;
        for (const r of due) next = markFired(next, r.id);
        saveReminders(next);
        if (!dead) setQueue((cur) => [...cur, ...due.filter((d) => !cur.some((c) => c.id === d.id))]);
        try { sfxPlay('chime'); } catch { /* silent */ }
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            for (const r of due) {
              const t = targetById(r.targetId);
              reg.showNotification('Path reminder', {
                body: t ? `${t.n} · set for ${r.time}` : `Reminder · ${r.time}`,
                tag: `omni-rem-${r.id}`,
              });
            }
          }).catch(() => {});
        }
      } catch { /* reminders never break the shell */ }
    };
    check();
    const iv = setInterval(check, 30000);
    return () => { dead = true; clearInterval(iv); };
  }, []);
  if (!queue.length) return null;
  const r = queue[0];
  const t = targetById(r.targetId);
  return (
    <div className="rembanner" role="alert">
      <Icon n="bell" size={18} />
      <div className="main"><b>Time for {t ? t.n : 'your path'}</b>
        <span className="dim sm">Your {r.time} reminder — tap Open to read it now</span></div>
      <button className="btn sm" onClick={() => { setQueue((q) => q.slice(1)); openTarget(t); }}>Open</button>
      <button className="iconbtn" aria-label="Dismiss reminder"
        onClick={() => setQueue((q) => q.slice(1))}><Icon n="x" size={16} /></button>
    </div>);
}

function VotdShelfCard({ go, open }) {
  const kind = votdKind();
  const fly = (e) => {
    const t = TOOLS.find((x) => x.id === 'votd');
    if (t && open) open(t, e); else go('votd');
  };
  return (
    <Section id="shelf-votd" title="Verse of the Day" icon="sparkle">
      <button className="cont-card" onClick={fly}>
        <span className="cont-ic"><Icon n="sparkle" size={18} /></span>
        <span className="cont-tx"><b>Today · {kind.label}</b>
          <small>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · tap to read it and share the card</small></span>
        <Icon n="chevron" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
      </button>
    </Section>);
}

function Shelf({ fav, recentTools, go, open }) {
  /* Shelf taps open tools through the same flight as the tiles, so the
     ceremony is identical wherever a tool is opened from. */
  const fly = (id, e) => {
    const t = TOOLS.find((x) => x.id === id);
    if (t && open) open(t, e); else go(id);
  };
  let lastSong = null;
  let lastChan = null;
  let lastBook = null;
  try { lastSong = libHistory()[0] || null; } catch {}
  try { lastChan = tvRecent()[0] || null; } catch {}
  try { lastBook = lastRead(); } catch {}
  const ld = lowDataOn();
  const favTools = TOOLS.filter((t) => fav.includes(t.id));
  const recent = recentTools
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t) => t && !fav.includes(t.id));
  /* First run: the shelf introduces itself instead of vanishing, so a
     new user learns the home screen keeps their place for them. The
     moment anything lands here, this face is gone for good. */
  if (!lastSong && !lastChan && !lastBook && !favTools.length && !recent.length) {
    return (
      <div className="shelf">
        <Section id="shelf-start" title="Start here" icon="sparkle">
          <div className="shelf-empty">
            <p className="dim sm">
              This shelf fills itself. Play a song or open a channel and it will be
              waiting here to resume. Pin a tool and it stays one tap away.
            </p>
            <div className="btnrow">
              <button className="btn sm" onClick={(e) => fly('music', e)}>
                <Icon n="music" size={15} /> Play a song</button>
              <button className="btn ghost sm" onClick={(e) => fly('tv', e)}>
                <Icon n="film" size={15} /> Watch TV</button>
            </div>
            <p className="dim sm" style={{ marginTop: 8 }}>
              Tip: tap the star at the top of any tool to pin it here.
            </p>
          </div>
        </Section>
        <VotdShelfCard go={go} open={open} />
      </div>);
  }

  const chip = (t) => (
    <button key={t.id} className="cat shelf-chip" onClick={(e) => (open ? open(t, e) : go(t.id))}>
      <Icon n={t.i} size={14} /> {t.n}</button>);

  return (
    <div className="shelf">
      <VotdShelfCard go={go} open={open} />
      {(lastSong || lastChan || lastBook) && (
        <Section id="shelf-continue" title="Continue" icon="play">
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
                try { sessSet(SESS_RESUME_MUSIC, JSON.stringify(lastSong)); } catch {}
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
                try { sessSet(SESS_OPEN_TV, JSON.stringify(lastChan)); } catch {}
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
      {favTools.length > 0 && (
        <Section id="shelf-fav" title="Pinned tools" icon="staron" badge={`${favTools.length}`}>
          <div className="shelf-row">{favTools.map(chip)}</div>
        </Section>)}
      {recent.length > 0 && (
        <Section id="shelf-recent" title="Recently used" icon="clock"
          badge={`${recent.length}`} defaultOpen={false}>
          <div className="shelf-row">{recent.map(chip)}</div>
        </Section>)}
    </div>);
}

/* ------------------------------------------------- universal search hits
   Songs play right here through the shared player; a channel hands off
   to the TV tool, which opens it on arrival. */
function UniResults({ uni, go, open }) {
  const p = usePlayer();
  const { songs, chans, loading } = uni;
  const openChan = (c, e) => {
    try { sessSet(SESS_OPEN_TV, JSON.stringify(c)); } catch {}
    const tv = TOOLS.find((x) => x.id === 'tv');
    if (tv && open) open(tv, e); else go('tv');
  };
  return (<>
    <div className="seclabel">Songs{songs ? ` · ${songs.length}` : ''}</div>
    {loading && !songs ? <SkelRows n={3} h={52} />
      : songs && songs.length ? (
        <div className="list" style={{ marginBottom: 4 }}>
          {songs.map((t, i) => (
            <button className="row uni-row" key={t.id || i} onClick={() => p.play(t, songs)}>
              {t.art
                ? <img src={t.art} alt="" loading="lazy"
                    style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto', background: 'var(--s3)' }}
                    onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                : <span className="cont-ic"><Icon n="music" size={18} /></span>}
              <div className="main"><b style={{ fontSize: 13.5 }}>{(t.title || '').slice(0, 54)}</b>
                <span className="dim sm">{t.artist || ''}</span></div>
              <Icon n="play" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
            </button>))}
        </div>)
      : <div className="state sm">No songs matched — the Music tab searches deeper.</div>}
    <div className="seclabel">TV channels{chans ? ` · ${chans.length}` : ''}</div>
    {loading && !chans ? <SkelRows n={2} h={52} />
      : chans && chans.length ? (
        <div className="list">
          {chans.map((c, i) => (
            <button className="row uni-row" key={(c.id || 'c') + i} onClick={(e) => openChan(c, e)}>
              {c.logo
                ? <img src={c.logo} alt="" loading="lazy"
                    style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'contain', flex: '0 0 auto', background: 'var(--s3)' }}
                    onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                : <span className="cont-ic"><Icon n="film" size={18} /></span>}
              <div className="main"><b style={{ fontSize: 13.5 }}>{c.name}</b>
                <span className="dim sm">{c.group || 'Channel'}</span></div>
              <Icon n="play" size={18} style={{ color: 'var(--green)', flex: '0 0 auto' }} />
            </button>))}
        </div>)
      : <div className="state sm">No channel matched — open TV for the full list.</div>}
  </>);
}

/* --------------------------------------------------------- scroll to top */
function ScrollTopBtn() {
  const p = usePlayer();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    addEventListener('scroll', on, { passive: true });
    on();
    return () => removeEventListener('scroll', on);
  }, []);
  if (!show) return null;
  return (
    <button className="scrolltop" aria-label="Back to top"
      style={{ bottom: `calc(${p?.track ? 148 : 84}px + var(--safe-b))` }}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <Icon n="up" size={18} />
    </button>);
}

/* ------------------------------------------------------------- presence
   How many people are in the app right now, from the relay's heartbeat
   count. Renders nothing at all when there is no honest number: a failed
   check must never turn into a made-up audience. A count older than the
   last heartbeat shows greyed and says it is the last known reading. */
function PresenceChip() {
  const pres = usePresence();
  if (!pres) return null;
  return (
    <span className="pill" title="People using the app right now — counted by a once-a-minute heartbeat, so treat it as approximate"
      style={pres.fresh ? undefined : { opacity: 0.55 }}>
      <span className={`dot ${pres.fresh ? 'pres-dot' : ''}`}
        style={pres.fresh ? undefined : { background: 'var(--fg3)', boxShadow: 'none' }} />
      {pres.n} online now{pres.fresh ? '' : ' · last known'}
    </span>);
}

function PresenceRow() {
  const pres = usePresence();
  if (!pres) return null;
  return (
    <div className="src" style={pres.fresh ? undefined : { opacity: 0.6 }}>
      <span className={`dot ${pres.fresh ? 'pres-dot' : ''}`}
        style={pres.fresh ? undefined : { background: 'var(--fg3)', boxShadow: 'none' }} />
      <span style={{ flex: 1 }}>{pres.n} online now</span>
      <span className="src-meta">{pres.fresh ? 'live count · approximate' : 'last known count'}</span>
    </div>);
}
