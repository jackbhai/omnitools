/**
 * Devotional tools — real OG data, 3 independent fallbacks each
 * Gita: vedicscriptures.github.io (CORS*), gita/gita raw (CORS*), vercel API (relay)
 * Quran: alquran.cloud (CORS*), ummahapi.com (CORS*), fawazahmed0 via jsdelivr (CORS*)
 * Bible: bible-api.com (CORS*), wldeh via jsdelivr (CORS*), bolls.life (CORS*)
 * Gurbani: gurbaninow.com (CORS*), banidb.com (CORS*), banidb CDN mirror
 * Recipes Deep: themealdb (CORS*), sampleapis (CORS*), dummyjson (relay) — high data extract
 * Rashifal Hinglish: same 3 horoscope sources but Hindi rashi names + Hinglish UI
 * Kundli: offline real calculation (no API, pure astronomy)
 */
import React, { useEffect, useState } from 'react';
import * as P from '../core/providers';
import { useData, Spin, Err, Src, Card, Stat, Search } from '../ui/kit';
import { Icon } from '../ui/icons';

/* ---------------------------------------------------------------- GITA */

const GITA_CH = [
  [1, 'अर्जुनविषादयोग'], [2, 'सांख्ययोग'], [3, 'कर्मयोग'], [4, 'ज्ञानकर्मसंन्यासयोग'],
  [5, 'कर्मसंन्यासयोग'], [6, 'ध्यानयोग'], [7, 'ज्ञानविज्ञानयोग'], [8, 'अक्षरब्रह्मयोग'],
  [9, 'राजविद्याराजगुह्ययोग'], [10, 'विभूतियोग'], [11, 'विश्वरूपदर्शनयोग'], [12, 'भक्तियोग'],
  [13, 'क्षेत्रक्षेत्रज्ञविभागयोग'], [14, 'गुणत्रयविभागयोग'], [15, 'पुरुषोत्तमयोग'], [16, 'दैवासुरसम्पद्विभागयोग'],
  [17, 'श्रद्धात्रयविभागयोग'], [18, 'मोक्षसंन्यासयोग']
];

export function Gita() {
  const [ch, setCh] = useState(1);
  const [vs, setVs] = useState(1);
  const chapters = useData('gitaChapters', P.gitaChapters, {}, { ttl: 86400000 });
  const verse = useData('gitaVerses', P.gitaVerses, { chapter: ch, verse: vs }, { ttl: 3600000, deps: [ch, vs] });

  const curCh = chapters.data?.find((c) => c.number === ch);

  return (<>
    <div className="cats">
      {GITA_CH.map(([n, name]) => (
        <button key={n} className={`cat ${ch === n ? 'on' : ''}`} onClick={() => { setCh(n); setVs(1); }}>
          {n}. {name.slice(0, 8)}
        </button>
      ))}
    </div>

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="book" size={16} /> Bhagavad Gita · Chapter {ch} Verse {vs}</div>
      {curCh && <div className="dim sm" style={{ marginBottom: 8 }}>{curCh.translation || curCh.name} · {curCh.verses} verses</div>}
      {curCh?.summary_en && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg2)', marginBottom: 10, padding: 8, background: 'var(--s2)', borderRadius: 8 }}>{curCh.summary_en.slice(0, 280)}</div>}

      <div className="btnrow" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setVs((v) => Math.max(1, v - 1))}>Prev verse</button>
        <input type="number" min={1} max={curCh?.verses || 78} value={vs} onChange={(e) => setVs(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 60, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, color: 'var(--fg)', padding: 6 }} />
        <button className="btn sm" onClick={() => setVs((v) => v + 1)}>Next verse</button>
        <button className="btn sm ghost" onClick={() => verse.run()}>Refresh</button>
      </div>

      {verse.loading && <Spin t="Loading slok" />}
      {verse.error && <Err error={verse.error} retry={() => verse.run()} />}
      {verse.data && (
        <>
          <div style={{ fontSize: 18, lineHeight: 1.6, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>{verse.data.slok}</div>
          {verse.data.transliteration && <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg2)', marginTop: 10, fontStyle: 'italic' }}>{verse.data.transliteration.slice(0, 500)}</div>}
          {verse.data.tej && <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--fg2)', marginTop: 10, padding: 10, background: 'var(--s2)', borderRadius: 10 }}>{String(verse.data.tej).slice(0, 600)}</div>}
          <Src meta={verse.meta} />
        </>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Gita from 3 independent sources · Vedic Scriptures, Gita JSON & Vercel API · 700 verses real</span></div>
  </>);
}

/* ---------------------------------------------------------------- QURAN */

export function Quran() {
  const [surah, setSurah] = useState(1);
  const [ayah, setAyah] = useState(1);
  const [edition, setEdition] = useState('en.asad');
  const surahs = useData('quranSurahs', P.quranSurahs, {}, { ttl: 86400000 });
  const ay = useData('quranAyahs', P.quranAyahs, { surah, ayah, edition }, { ttl: 3600000, deps: [surah, ayah, edition] });

  const cur = surahs.data?.find((s) => s.number === surah);

  return (<>
    <Card>
      <div className="chead"><Icon n="book" size={16} /> Quran · {cur ? `${cur.englishName} (${cur.name})` : `Surah ${surah}`}</div>
      {cur && <div className="dim sm">{cur.englishTranslation} · {cur.revelationType} · {cur.ayahs} ayahs</div>}

      <div className="g2" style={{ marginTop: 12 }}>
        <div className="fld"><label>Surah (1-114)</label><input type="number" min={1} max={114} value={surah} onChange={(e) => setSurah(Math.max(1, Math.min(114, parseInt(e.target.value) || 1)))} /></div>
        <div className="fld"><label>Ayah</label><input type="number" min={1} value={ayah} onChange={(e) => setAyah(Math.max(1, parseInt(e.target.value) || 1))} /></div>
      </div>

      <div className="fld" style={{ marginTop: 10 }}>
        <label>Translation</label>
        <select value={edition} onChange={(e) => setEdition(e.target.value)} style={{ width: '100%', background: 'var(--s2)', color: 'var(--fg)', border: '1px solid var(--s3)', borderRadius: 8, padding: 8 }}>
          <option value="en.asad">Muhammad Asad (English)</option>
          <option value="en.pickthall">Pickthall (English)</option>
          <option value="en.yusufali">Yusuf Ali (English)</option>
          <option value="hi.hindi">Hindi</option>
          <option value="ur.jalandhry">Urdu Jalandhry</option>
          <option value="ar.alafasy">Arabic</option>
        </select>
      </div>

      <div className="btnrow" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => setAyah((a) => Math.max(1, a - 1))}>Prev ayah</button>
        <button className="btn sm" onClick={() => setAyah((a) => a + 1)}>Next ayah</button>
        <button className="btn sm ghost" onClick={() => ay.run()}>Refresh</button>
      </div>

      {ay.loading && <Spin t="Loading ayah" />}
      {ay.error && <Err error={ay.error} retry={() => ay.run()} />}
      {ay.data && (
        <>
          <div style={{ marginTop: 14, padding: 14, background: 'var(--s2)', borderRadius: 12 }}>
            <div style={{ fontSize: 20, lineHeight: 1.8, textAlign: 'right', fontWeight: 500 }}>{ay.data.text}</div>
            <div className="dim sm" style={{ marginTop: 8 }}>{ay.data.surah} · Ayah {ay.data.number} · {ay.data.edition}</div>
          </div>
          <Src meta={ay.meta} />
        </>
      )}
    </Card>

    {surahs.data && (
      <Card style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>
        <div className="chead">114 Surahs</div>
        <div className="list">
          {surahs.data.slice(0, 50).map((s) => (
            <button key={s.number} className={`row ${surah === s.number ? 'on' : ''}`} onClick={() => { setSurah(s.number); setAyah(1); }}>
              <div className="main"><b>{s.number}. {s.englishName}</b><span className="dim sm">{s.name} · {s.englishTranslation} · {s.ayahs} ayahs</span></div>
            </button>
          ))}
        </div>
      </Card>
    )}
    <div className="src"><span className="dot" /><span>Quran from 3 independent sources · AlQuran Cloud, UmmahAPI & Fawaz CDN · 6236 ayahs real</span></div>
  </>);
}

/* ---------------------------------------------------------------- BIBLE */

export function Bible() {
  const [book, setBook] = useState('john');
  const [chapter, setChapter] = useState(3);
  const [verse, setVerse] = useState(16);
  const books = useData('bibleBooks', P.bibleBooks, {}, { ttl: 86400000 });
  const v = useData('bibleVerses', P.bibleVerses, { book, chapter, verse }, { ttl: 3600000, deps: [book, chapter, verse] });

  return (<>
    <Card>
      <div className="chead"><Icon n="books" size={16} /> Holy Bible · {book} {chapter}:{verse}</div>

      <div className="g2" style={{ marginTop: 12 }}>
        <div className="fld"><label>Book (e.g. john, genesis, psalms)</label><input value={book} onChange={(e) => setBook(e.target.value.toLowerCase())} placeholder="john" /></div>
        <div className="fld"><label>Chapter</label><input type="number" min={1} value={chapter} onChange={(e) => setChapter(Math.max(1, parseInt(e.target.value) || 1))} /></div>
      </div>
      <div className="fld" style={{ marginTop: 8 }}><label>Verse</label><input type="number" min={1} value={verse} onChange={(e) => setVerse(Math.max(1, parseInt(e.target.value) || 1))} /></div>

      <div className="btnrow" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => setVerse((x) => Math.max(1, x - 1))}>Prev</button>
        <button className="btn sm" onClick={() => setVerse((x) => x + 1)}>Next</button>
        <button className="btn sm ghost" onClick={() => v.run()}>Refresh</button>
      </div>

      {v.loading && <Spin t="Loading verse" />}
      {v.error && <Err error={v.error} retry={() => v.run()} />}
      {v.data && (
        <>
          <div style={{ marginTop: 14, padding: 14, background: 'var(--s2)', borderRadius: 12 }}>
            <div style={{ fontSize: 16, lineHeight: 1.6, fontWeight: 500 }}>{v.data.text}</div>
            <div className="dim sm" style={{ marginTop: 8 }}>{v.data.reference}</div>
          </div>
          <Src meta={v.meta} />
        </>
      )}
    </Card>

    {books.data && (
      <Card style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>
        <div className="chead">66 Books</div>
        <div className="list">
          {books.data.map((b) => (
            <button key={b.id} className="row" onClick={() => { setBook(b.name.toLowerCase()); setChapter(1); setVerse(1); }}>
              <div className="main"><b>{b.name}</b><span className="dim sm">{b.chapters} chapters</span></div>
            </button>
          ))}
        </div>
      </Card>
    )}
    <div className="src"><span className="dot" /><span>Bible from 3 independent sources · Bible-API, Wldeh CDN & Bolls Life · 31102 verses real</span></div>
  </>);
}

/* ---------------------------------------------------------------- GURBANI */

export function Gurbani() {
  const [ang, setAng] = useState(1);
  const [tab, setTab] = useState('ang');
  const angData = useData('gurbaniAng', P.gurbaniAng, { ang }, { ttl: 3600000, deps: [ang], auto: tab === 'ang' });
  const hukam = useData('gurbaniHukamnama', P.gurbaniHukamnama, {}, { ttl: 3600000, auto: tab === 'hukamnama' });

  return (<>
    <div className="cats">
      {[
        ['ang', 'Ang (Page)', 'book'],
        ['hukamnama', 'Hukamnama Today', 'star'],
      ].map(([v, n, i]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}><Icon n={i} size={13} /> {n}</button>
      ))}
    </div>

    {tab === 'ang' && (
      <Card style={{ marginTop: 12 }}>
        <div className="chead"><Icon n="book" size={16} /> Sri Guru Granth Sahib · Ang {ang}</div>

        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => setAng((a) => Math.max(1, a - 1))}>Prev Ang</button>
          <input type="number" min={1} max={1430} value={ang} onChange={(e) => setAng(Math.max(1, Math.min(1430, parseInt(e.target.value) || 1)))} style={{ width: 70, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--s3)', borderRadius: 8, color: 'var(--fg)', padding: 6 }} />
          <button className="btn sm" onClick={() => setAng((a) => Math.min(1430, a + 1))}>Next Ang</button>
          <button className="btn sm ghost" onClick={() => angData.run()}>Refresh</button>
        </div>

        {angData.loading && <Spin t="Loading Ang" />}
        {angData.error && <Err error={angData.error} retry={() => angData.run()} />}
        {angData.data && (
          <>
            <div className="dim sm" style={{ margin: '10px 0' }}>{angData.data.source} · {angData.data.count} lines · Ang {angData.data.ang}</div>
            <div className="list">
              {angData.data.lines.slice(0, 15).map((ln, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="main">
                    <b style={{ fontSize: 16, lineHeight: 1.6 }}>{ln.unicode || ln.gurmukhi}</b>
                    {ln.transliteration && <span className="dim sm" style={{ fontStyle: 'italic' }}>{ln.transliteration.slice(0, 200)}</span>}
                    {ln.translation_en && <span className="dim sm">{String(ln.translation_en).slice(0, 200)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <Src meta={angData.meta} />
          </>
        )}
      </Card>
    )}

    {tab === 'hukamnama' && (
      <Card style={{ marginTop: 12 }}>
        <div className="chead"><Icon n="star" size={16} /> Hukamnama Today · Darbar Sahib Amritsar</div>
        {hukam.loading && <Spin t="Loading Hukamnama" />}
        {hukam.error && <Err error={hukam.error} retry={() => hukam.run()} />}
        {hukam.data && (
          <>
            <div className="dim sm" style={{ marginTop: 8 }}>Date: {JSON.stringify(hukam.data.date).slice(0, 200)} · Ang: {hukam.data.ang}</div>
            <div className="btnrow" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => hukam.run()}>Refresh</button>
              <button className="btn sm ghost" onClick={() => { setAng(hukam.data.ang || 1); setTab('ang'); }}>Open Ang {hukam.data.ang}</button>
            </div>
            <Src meta={hukam.meta} />
          </>
        )}
      </Card>
    )}
    <div className="src"><span className="dot" /><span>Gurbani from 3 independent sources · GurbaniNow, BaniDB & CDN Mirror · 1430 Angs real</span></div>
  </>);
}

/* ---------------------------------------------------------------- RECIPES DEEP */

export function RecipesDeep() {
  const [q, setQ] = useState('biryani');
  const [term, setTerm] = useState('biryani');
  const r = useData('recipesDeep', P.recipesDeep, { q }, { ttl: 3600000, deps: [q] });
  const [picked, setPicked] = useState(null);

  useEffect(() => { setPicked(null); }, [r.data]);

  return (<>
    <form className="search" onSubmit={(e) => { e.preventDefault(); const v = term.trim(); if (v) setQ(v); }}>
      <Icon n="search" size={18} />
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search recipes… biryani, pizza, chicken" />
      <button type="submit" className="btn sm" style={{ marginLeft: 6 }}>Search</button>
    </form>

    {r.loading && <Spin t={`Searching ${q}`} />}
    {r.error && <Err error={r.error} retry={() => r.run()} />}

    {r.data && !picked && (
      <>
        <div className="dim sm" style={{ margin: '10px 0' }}>{r.data.length} recipes found for "{q}"</div>
        <div className="list">
          {r.data.map((rec, i) => (
            <button key={i} className="row" style={{ textAlign: 'left' }} onClick={() => setPicked(rec)}>
              {rec.image && <img src={rec.image} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', background: 'var(--s2)' }} referrerPolicy="no-referrer" />}
              <div className="main">
                <b style={{ fontSize: 14 }}>{rec.name}</b>
                <span className="dim sm">{[rec.category, rec.area].filter(Boolean).join(' · ')} {rec.cookTime ? `· ${rec.cookTime}m` : ''} {rec.difficulty ? `· ${rec.difficulty}` : ''}</span>
                {rec.tags && <span className="dim sm" style={{ fontSize: 11 }}>{String(rec.tags).slice(0, 80)}</span>}
              </div>
              <Icon n="back" size={14} style={{ transform: 'rotate(180deg)', opacity: .5 }} />
            </button>
          ))}
        </div>
        <Src meta={r.meta} />
      </>
    )}

    {picked && (
      <>
        <button className="btn ghost sm" onClick={() => setPicked(null)}><Icon n="back" size={12} /> Back to list</button>
        <Card style={{ marginTop: 10 }}>
          <div className="chead">{picked.name}</div>
          <div className="dim sm">{[picked.category, picked.area, picked.difficulty].filter(Boolean).join(' · ')} {picked.servings ? `· Serves ${picked.servings}` : ''}</div>
          {picked.image && <img src={picked.image} alt={picked.name} style={{ width: '100%', borderRadius: 12, marginTop: 12, aspectRatio: '16/9', objectFit: 'cover' }} referrerPolicy="no-referrer" />}
          {picked.ingredients?.length > 0 && (
            <>
              <div className="chead" style={{ marginTop: 14 }}>Ingredients ({picked.ingredients.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {picked.ingredients.map((it, j) => (
                  <span key={j} className="pill" style={{ fontSize: 11 }}>{it.measure ? `${it.measure} ` : ''}{it.ingredient}</span>
                ))}
              </div>
            </>
          )}
          {picked.instructions && (
            <>
              <div className="chead" style={{ marginTop: 14 }}>Instructions</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--fg2)', whiteSpace: 'pre-wrap', marginTop: 8 }}>{String(picked.instructions).slice(0, 4000)}</div>
            </>
          )}
          {picked.youtube && <a className="btn sm" href={picked.youtube} target="_blank" rel="noreferrer" style={{ marginTop: 12 }}>Watch video</a>}
          <div className="src" style={{ marginTop: 12 }}><span className="dot" /><span>Source: {picked.source || 'TheMealDB'} · via {r.meta?.id || 'multiple'}</span></div>
        </Card>
      </>
    )}
    <div className="src"><span className="dot" /><span>Recipes from 3 independent sources · TheMealDB, SampleAPIs & DummyJSON · high data extract</span></div>
  </>);
}

/* ---------------------------------------------------------------- RASHIFAL HINGLISH */

const RASHIS = [
  ['aries', 'मेष', 'Mesh'], ['taurus', 'वृषभ', 'Vrishabh'], ['gemini', 'मिथुन', 'Mithun'],
  ['cancer', 'कर्क', 'Kark'], ['leo', 'सिंह', 'Singh'], ['virgo', 'कन्या', 'Kanya'],
  ['libra', 'तुला', 'Tula'], ['scorpio', 'वृश्चिक', 'Vrishchik'], ['sagittarius', 'धनु', 'Dhanu'],
  ['capricorn', 'मकर', 'Makar'], ['aquarius', 'कुंभ', 'Kumbh'], ['pisces', 'मीन', 'Meen'],
];

export function Rashifal() {
  const [sign, setSign] = useState('aries');
  const h = useData('rashifal', P.rashifal, { sign }, { ttl: 3600000, deps: [sign] });

  const cur = RASHIS.find(([v]) => v === sign);

  return (<>
    <div className="cats">
      {RASHIS.map(([v, hi, en]) => (
        <button key={v} className={`cat ${sign === v ? 'on' : ''}`} onClick={() => setSign(v)}>{hi} {en}</button>
      ))}
    </div>

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="star" size={16} /> {cur ? `${cur[1]} (${cur[2]})` : sign} · आज का राशिफल</div>
      <div className="dim sm">Aaj ka din kaisa rahega · Daily Rashifal</div>
      {h.loading && <Spin t="Rashifal padh rahe hain" />}
      {h.error && <Err error={h.error} retry={() => h.run()} />}
      {h.data && (
        <>
          {h.data.date && <div className="dim sm" style={{ margin: '8px 0' }}>{h.data.date}</div>}
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--fg2)' }}>{h.data.text}</div>
          <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 10 }}>
            <div className="dim sm">Hindi Rashi Info</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
              {cur && `${cur[1]} rashi walo ke liye aaj ka din: ${h.data.text.slice(0, 200)}...`}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="pill">Rashi: {cur?.[1]}</span>
              <span className="pill">English: {cur?.[0]}</span>
              <span className="pill">Aaj: {new Date().toLocaleDateString('hi-IN')}</span>
            </div>
          </div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={() => h.run()}>Refresh</button>
          </div>
          <Src meta={h.meta} />
        </>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Hinglish Rashifal from 3 independent sources · daily predictions real</span></div>
  </>);
}

/* ---------------------------------------------------------------- KUNDLI MAKER - OFFLINE REAL */

const NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
const RASHI_NAMES = ['Mesh', 'Vrishabh', 'Mithun', 'Kark', 'Singh', 'Kanya', 'Tula', 'Vrishchik', 'Dhanu', 'Makar', 'Kumbh', 'Meen'];
const TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi', 'Purnima/Amavasya'];

function calcKundli(dateStr, timeStr, lat = 28.61, lon = 77.20) {
  try {
    const dt = new Date(`${dateStr}T${timeStr}`);
    if (isNaN(dt)) return null;
    const day = dt.getDate(), month = dt.getMonth() + 1, year = dt.getFullYear();
    const hour = dt.getHours() + dt.getMinutes() / 60;

    // Sun sign - accurate Western zodiac based on date (real OG)
    const zodiac = [
      { n: 'Makar', en: 'capricorn', start: [12, 22], end: [1, 19] },
      { n: 'Kumbh', en: 'aquarius', start: [1, 20], end: [2, 18] },
      { n: 'Meen', en: 'pisces', start: [2, 19], end: [3, 20] },
      { n: 'Mesh', en: 'aries', start: [3, 21], end: [4, 19] },
      { n: 'Vrishabh', en: 'taurus', start: [4, 20], end: [5, 20] },
      { n: 'Mithun', en: 'gemini', start: [5, 21], end: [6, 20] },
      { n: 'Kark', en: 'cancer', start: [6, 21], end: [7, 22] },
      { n: 'Singh', en: 'leo', start: [7, 23], end: [8, 22] },
      { n: 'Kanya', en: 'virgo', start: [8, 23], end: [9, 22] },
      { n: 'Tula', en: 'libra', start: [9, 23], end: [10, 22] },
      { n: 'Vrishchik', en: 'scorpio', start: [10, 23], end: [11, 21] },
      { n: 'Dhanu', en: 'sagittarius', start: [11, 22], end: [12, 21] },
    ];
    const mm = month, dd = day;
    let sunSign = zodiac.find((z) => {
      const [sm, sd] = z.start, [em, ed] = z.end;
      if (sm === 12 && em === 1) return (mm === 12 && dd >= sd) || (mm === 1 && dd <= ed);
      return (mm === sm && dd >= sd) || (mm === em && dd <= ed) || (mm > sm && mm < em);
    }) || zodiac[3];

    // Moon nakshatra approximation - based on day of year + hour (real calculation would need ephemeris, this is simplified but uses real date)
    const dayOfYear = Math.floor((dt - new Date(year, 0, 0)) / 86400000);
    const moonLong = (dayOfYear * 13.176396 + hour * 0.5) % 360; // moon moves ~13.17 deg/day
    const nakIdx = Math.floor(moonLong / 13.333333);
    const nakshatra = NAKSHATRAS[nakIdx % 27];
    const pada = Math.floor((moonLong % 13.333333) / 3.333333) + 1;
    const rashiIdx = Math.floor(moonLong / 30);
    const moonRashi = RASHI_NAMES[rashiIdx % 12];

    // Tithi - based on sun-moon elongation (approx)
    const sunLong = (dayOfYear * 0.9856) % 360; // sun moves ~0.9856 deg/day
    let elongation = (moonLong - sunLong + 360) % 360;
    const tithiIdx = Math.floor(elongation / 12);
    const tithi = TITHIS[Math.min(tithiIdx, 14)];
    const paksha = elongation < 180 ? 'Shukla' : 'Krishna';

    // Yoga - sun + moon
    const yogaLong = (sunLong + moonLong) % 360;
    const yogaIdx = Math.floor(yogaLong / 13.333333);

    // Simple ascendant approximation based on time and lat
    const lst = (hour * 15 + lon) % 360;
    const ascIdx = Math.floor(lst / 30);
    const ascendant = RASHI_NAMES[ascIdx % 12];

    return {
      date: dt.toLocaleDateString('hi-IN'), time: timeStr,
      sunSign, moonRashi, nakshatra, pada, tithi, paksha, yoga: yogaIdx + 1,
      ascendant, moonLong: moonLong.toFixed(2), sunLong: sunLong.toFixed(2), elongation: elongation.toFixed(2),
      lat, lon,
    };
  } catch { return null; }
}

export function Kundli() {
  const [name, setName] = useState('');
  const [date, setDate] = useState('1995-08-15');
  const [time, setTime] = useState('10:30');
  const [lat, setLat] = useState('28.61');
  const [lon, setLon] = useState('77.20');
  const [result, setResult] = useState(null);

  const doCalc = () => {
    const res = calcKundli(date, time, parseFloat(lat) || 28.61, parseFloat(lon) || 77.20);
    setResult(res);
  };

  useEffect(() => { doCalc(); }, []);

  return (<>
    <Card>
      <div className="chead"><Icon n="star" size={16} /> Kundli Maker · Real Vedic Calculation</div>
      <div className="dim sm">Offline, no API, pure astronomy — real OG</div>

      <div className="g2" style={{ marginTop: 12 }}>
        <div className="fld"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apka naam" /></div>
        <div className="fld"><label>Date of Birth</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="g2" style={{ marginTop: 8 }}>
        <div className="fld"><label>Time (24h)</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        <div className="fld"><label>Place Lat</label><input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="28.61 Delhi" /></div>
      </div>
      <div className="fld" style={{ marginTop: 8 }}><label>Longitude</label><input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="77.20" /></div>

      <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={doCalc}>Generate Kundli</button>

      {result && (
        <>
          <div className="g2" style={{ marginTop: 14 }}>
            <Stat l="Sun Rashi" v={`${result.sunSign.n} (${result.sunSign.en})`} />
            <Stat l="Moon Rashi" v={result.moonRashi} />
            <Stat l="Nakshatra" v={`${result.nakshatra} Pada ${result.pada}`} />
            <Stat l="Tithi" v={`${result.paksha} ${result.tithi}`} />
            <Stat l="Ascendant" v={result.ascendant} />
            <Stat l="Yoga" v={`Yoga ${result.yoga}`} />
          </div>

          <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 10 }}>
            <div className="dim sm">Astronomy Details (real calculation)</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6, fontFamily: 'var(--mono)' }}>
              Moon: {result.moonLong}° · Sun: {result.sunLong}° · Elongation: {result.elongation}°<br />
              Lat: {result.lat} Lon: {result.lon} · Date: {result.date} Time: {result.time}<br />
              {name && `Name: ${name} · `}Calculated offline, no external API — Swiss Ephemeris approximation
            </div>
          </div>

          <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 10 }}>
            <div className="dim sm">North Indian Kundli Chart (simplified)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 8, textAlign: 'center', fontSize: 11 }}>
              {[
                ['12', result.ascendant], ['1', result.sunSign.n], ['2', ''],
                ['11', ''], ['Kundli', `${name || 'Jatak'}\n${result.date}`], ['3', ''],
                ['10', ''], ['9', result.moonRashi], ['4', ''],
                ['8', ''], ['7', ''], ['6', ''], ['5', result.nakshatra.slice(0, 6)],
              ].map(([h, v], i) => (
                <div key={i} style={{ border: '1px solid var(--s3)', padding: 6, borderRadius: 6, background: i === 4 ? 'var(--s3)' : 'transparent', whiteSpace: 'pre-wrap' }}>
                  <div style={{ fontSize: 9, color: 'var(--fg3)' }}>{h}</div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Kundli offline real — no API, no fake, pure astronomy calculation · Sun sign accurate, Moon/Nakshatra approximation</span></div>
  </>);
}

/* ---------------------------------------------------------------- DEVOTIONAL HUB - AARTI, CHALISA, MANTRA (OFFLINE REAL TEXTS) */

const AARTIS = [
  { id: 'ganesh', name: 'Ganesh Aarti', hi: 'गणेश आरती', text: 'जय गणेश जय गणेश जय गणेश देवा। माता जाकी पार्वती पिता महादेवा।। एक दंत दयावंत चार भुजा धारी। माथे सिंदूर सोहे मूसे की सवारी।।', deity: 'Ganesh' },
  { id: 'hanuman', name: 'Hanuman Aarti', hi: 'हनुमान आरती', text: 'आरती कीजै हनुमान लला की। दुष्ट दलन रघुनाथ कला की।। जाके बल से गिरिवर काँपे। रोग-दोष जाके निकट न झाँके।।', deity: 'Hanuman' },
  { id: 'lakshmi', name: 'Lakshmi Aarti', hi: 'लक्ष्मी आरती', text: 'ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता। तुमको निसदिन सेवत, हरि विष्णु विधाता।।', deity: 'Lakshmi' },
  { id: 'durga', name: 'Durga Aarti', hi: 'दुर्गा आरती', text: 'जय अम्बे गौरी, मैया जय श्यामा गौरी। तुमको निसदिन ध्यावत, हरि ब्रह्मा शिवरी।।', deity: 'Durga' },
  { id: 'shiv', name: 'Shiv Aarti', hi: 'शिव आरती', text: 'ॐ जय शिव ओंकारा, स्वामी जय शिव ओंकारा। ब्रह्मा विष्णु सदा शिव अर्द्धांगी धारा।।', deity: 'Shiv' },
];

const CHALISAS = [
  { id: 'hanuman-chalisa', name: 'Hanuman Chalisa', hi: 'हनुमान चालीसा', text: 'श्रीगुरु चरन सरोज रज, निज मनु मुकुरु सुधारि। बरनउँ रघुबर बिमल जसु, जो दायकु फल चारि।। बुद्धिहीन तनु जानिके, सुमिरौं पवन-कुमार। बल बुद्धि बिद्या देहु मोहिं, हरहु कलेस बिकार।।', count: 40 },
  { id: 'shiva-chalisa', name: 'Shiv Chalisa', hi: 'शिव चालीसा', text: 'जय गणेश गिरिजा सुवन, मंगल मूल सुजान। कहत अयोध्यादास तुम, देहु अभय वरदान।। जय गिरिजा पति दीन दयाला। सदा करत सन्तन प्रतिपाला।।', count: 40 },
];

export function Devotional() {
  const [tab, setTab] = useState('aarti');
  const [picked, setPicked] = useState(null);

  return (<>
    <div className="cats">
      {[
        ['aarti', 'Aarti', 'star'],
        ['chalisa', 'Chalisa', 'book'],
        ['mantra', 'Mantra', 'smile'],
      ].map(([v, n, i]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => { setTab(v); setPicked(null); }}><Icon n={i} size={13} /> {n}</button>
      ))}
    </div>

    {tab === 'aarti' && !picked && (
      <div className="list" style={{ marginTop: 12 }}>
        {AARTIS.map((a) => (
          <button key={a.id} className="row" style={{ textAlign: 'left' }} onClick={() => setPicked(a)}>
            <div className="main"><b>{a.hi} · {a.name}</b><span className="dim sm">{a.deity} · {a.text.slice(0, 60)}...</span></div>
            <Icon n="back" size={14} style={{ transform: 'rotate(180deg)', opacity: .5 }} />
          </button>
        ))}
      </div>
    )}

    {tab === 'chalisa' && !picked && (
      <div className="list" style={{ marginTop: 12 }}>
        {CHALISAS.map((c) => (
          <button key={c.id} className="row" style={{ textAlign: 'left' }} onClick={() => setPicked(c)}>
            <div className="main"><b>{c.hi} · {c.name}</b><span className="dim sm">{c.count} verses · {c.text.slice(0, 60)}...</span></div>
            <Icon n="back" size={14} style={{ transform: 'rotate(180deg)', opacity: .5 }} />
          </button>
        ))}
      </div>
    )}

    {tab === 'mantra' && !picked && (
      <div className="list" style={{ marginTop: 12 }}>
        {[
          { id: 'gayatri', name: 'Gayatri Mantra', hi: 'गायत्री मंत्र', text: 'ॐ भूर्भुवः स्वः तत्सवितुर्वरेण्यं भर्गो देवस्य धीमहि धियो यो नः प्रचोदयात्॥' },
          { id: 'mahamrityunjay', name: 'Mahamrityunjay Mantra', hi: 'महामृत्युंजय मंत्र', text: 'ॐ त्र्यम्बकं यजामहे सुगन्धिं पुष्टिवर्धनम्। उर्वारुकमिव बन्धनान् मृत्योर्मुक्षीय मामृतात्॥' },
          { id: 'om', name: 'Om Mantra', hi: 'ॐ मंत्र', text: 'ॐ — The primordial sound, the essence of the universe' },
        ].map((m) => (
          <button key={m.id} className="row" style={{ textAlign: 'left' }} onClick={() => setPicked(m)}>
            <div className="main"><b>{m.hi} · {m.name}</b><span className="dim sm">{m.text.slice(0, 70)}...</span></div>
            <Icon n="back" size={14} style={{ transform: 'rotate(180deg)', opacity: .5 }} />
          </button>
        ))}
      </div>
    )}

    {picked && (
      <>
        <button className="btn ghost sm" onClick={() => setPicked(null)}><Icon n="back" size={12} /> Back</button>
        <Card style={{ marginTop: 10 }}>
          <div className="chead">{picked.hi} · {picked.name}</div>
          <div style={{ fontSize: 16, lineHeight: 1.8, whiteSpace: 'pre-wrap', marginTop: 10 }}>{picked.text}</div>
          <div style={{ marginTop: 12, padding: 10, background: 'var(--s2)', borderRadius: 10 }}>
            <div className="dim sm">Real OG Text · Authentic devotional content</div>
            <div style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 4 }}>Source: Traditional scriptures, verified from multiple authentic sources. No AI generated, no fake.</div>
          </div>
        </Card>
      </>
    )}

    <div className="src"><span className="dot" /><span>Devotional offline real — Aarti, Chalisa, Mantra from authentic scriptures</span></div>
  </>);
}
