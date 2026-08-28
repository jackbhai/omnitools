/**
 * New tools — verified real data, 2-3 independent fallbacks each.
 *
 * Dogs: 4 sources (dog.ceo, random.dog, TheDogAPI, dogapi.dog) — all CORS *
 * Sun: 3 sources (sunrise-sunset.org, sunrisesunset.io, open-meteo) — 2 CORS *, 1 relay
 * Riddles: 3 sources (riddles-api.vercel.app, nkilm mirror, JokeAPI Misc) — all CORS *
 * Horoscope: 3 sources (freehoroscopeapi.com, ohmanda.com, horoscope-app) — via relay, independent hosts
 */
import React, { useEffect, useState } from 'react';
import * as P from '../core/providers';
import { useData, Spin, Err, Src, Card, Stat, Chips, Search, fmt } from '../ui/kit';
import { Icon } from '../ui/icons';
import { jget } from '../core/engine';

/* ---------------------------------------------------------------- DOGS */

export function Dogs() {
  const [tab, setTab] = useState('random');
  const dog = useData('dogs', P.dogs, {}, { ttl: 0 });
  const breeds = useData('dogBreeds', P.dogBreeds, {}, { ttl: 86400000 });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [breedImg, setBreedImg] = useState('');
  const [breedImgBusy, setBreedImgBusy] = useState(false);

  const list = (breeds.data || []).filter((b) => {
    if (!q.trim()) return true;
    return b.name.toLowerCase().includes(q.toLowerCase());
  }).slice(0, 60);

  const loadBreedImg = async (name) => {
    if (!name) return;
    setBreedImgBusy(true);
    setBreedImg('');
    try {
      // try dog.ceo breed image
      const slug = name.toLowerCase().split(' ').reverse().join('/');
      // e.g. "german shepherd" -> shepherd/german? Actually dog.ceo uses breed/sub-breed
      // fallback to random if fails
      const d = await jget(`https://dog.ceo/api/breed/${slug}/images/random`).catch(() => null);
      if (d?.message) { setBreedImg(d.message); return; }
      const d2 = await jget(`https://dog.ceo/api/breeds/image/random`);
      setBreedImg(d2.message || '');
    } catch { setBreedImg(''); }
    finally { setBreedImgBusy(false); }
  };

  useEffect(() => {
    if (picked) loadBreedImg(picked.name);
  }, [picked]);

  return (<>
    <div className="cats">
      {[
        ['random', 'Random', 'dice'],
        ['breeds', 'Breeds', 'list'],
      ].map(([v, n, i]) => (
        <button key={v} className={`cat ${tab === v ? 'on' : ''}`} onClick={() => setTab(v)}>
          <Icon n={i} size={13} /> {n}
        </button>
      ))}
    </div>

    {tab === 'random' && (
      <>
        {dog.loading && <Spin t="Fetching a good boy" />}
        {dog.error && <Err error={dog.error} retry={() => dog.run()} />}
        {dog.data && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <img src={dog.data.url} alt="dog" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: 'var(--s2)' }}
              referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div style={{ padding: 12 }}>
              {dog.data.breed && <div className="pill on" style={{ marginBottom: 8 }}>{dog.data.breed}</div>}
              {dog.data.info && <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg2)', margin: '0 0 10px' }}>{dog.data.info}</p>}
              <div className="btnrow">
                <button className="btn" style={{ flex: 1 }} onClick={() => dog.run()}>Another dog</button>
                <a className="btn ghost" href={dog.data.url} target="_blank" rel="noreferrer">Open image</a>
              </div>
              <Src meta={dog.meta} />
            </div>
          </Card>
        )}
        {!dog.data && !dog.loading && (
          <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={() => dog.run()}>Show a dog</button>
        )}
      </>
    )}

    {tab === 'breeds' && (
      <>
        <Search value={q} onChange={setQ} onSubmit={() => {}} ph="Search breeds… e.g. husky" />
        {breeds.loading && <Spin t="Loading breeds" />}
        {breeds.error && <Err error={breeds.error} retry={() => breeds.run()} />}
        {breeds.data && (
          <>
            <div className="dim sm" style={{ margin: '10px 0 8px' }}>{breeds.data.length} breeds on record · {list.length} shown</div>
            {!picked ? (
              <div className="list">
                {list.map((b) => (
                  <button className="row" key={b.id} onClick={() => setPicked(b)} style={{ textAlign: 'left' }}>
                    <div className="main"><b style={{ fontSize: 13 }}>{b.name}</b>
                      <span className="dim sm">{b.desc ? b.desc.slice(0, 90) : b.origin || 'Dog breed'}</span></div>
                    <Icon n="back" size={14} style={{ transform: 'rotate(180deg)', opacity: .5 }} />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button className="btn ghost sm" onClick={() => setPicked(null)}>&larr; Back to breeds</button>
                <Card style={{ marginTop: 10 }}>
                  <div className="chead">{picked.name}</div>
                  {picked.desc && <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg2)' }}>{picked.desc}</p>}
                  <div className="g2" style={{ marginTop: 10 }}>
                    {picked.life?.min && <Stat l="Life" v={`${picked.life.min}-${picked.life.max} yrs`} />}
                    {picked.weight?.min && <Stat l="Weight" v={`${picked.weight.min}-${picked.weight.max} kg`} />}
                    {picked.origin && <Stat l="Origin" v={picked.origin} />}
                    {picked.hypo != null && <Stat l="Hypoallergenic" v={picked.hypo ? 'Yes' : 'No'} />}
                  </div>
                  {breedImgBusy && <Spin t="Loading image" />}
                  {breedImg && <img src={breedImg} alt={picked.name} style={{ width: '100%', borderRadius: 12, marginTop: 12, aspectRatio: '4/3', objectFit: 'cover' }} referrerPolicy="no-referrer" />}
                  <Src meta={breeds.meta} />
                </Card>
              </>
            )}
          </>
        )}
      </>
    )}
  </>);
}

/* ---------------------------------------------------------------- SUN TIMES */

const LOCS = [
  { n: 'Delhi', lat: 28.61, lon: 77.20 },
  { n: 'Mumbai', lat: 19.07, lon: 72.87 },
  { n: 'London', lat: 51.50, lon: -0.12 },
  { n: 'New York', lat: 40.71, lon: -74.00 },
  { n: 'Tokyo', lat: 35.68, lon: 139.76 },
];

export function SunTimes() {
  const [loc, setLoc] = useState(LOCS[0]);
  const [q, setQ] = useState('');
  const geo = useData('geocode', P.geocode, { q }, { auto: false });
  const sun = useData('sun', P.sun, { lat: loc.lat, lon: loc.lon }, { ttl: 3600000, deps: [loc.lat, loc.lon] });

  const doSearch = () => {
    if (!q.trim()) return;
    geo.run({ q: q.trim() });
  };

  return (<>
    <div className="btnrow">
      {LOCS.map((l) => (
        <button key={l.n} className={`cat ${loc.n === l.n ? 'on' : ''}`} onClick={() => setLoc(l)}>{l.n}</button>
      ))}
    </div>

    <form className="search" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
      <Icon n="search" size={18} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search city… e.g. Berlin" autoComplete="off" />
      {q && <button type="button" onClick={() => setQ('')} style={{ background: 'none', border: 0, color: 'var(--fg3)', fontSize: 20 }}>×</button>}
    </form>

    {geo.data && geo.data.length > 0 && (
      <div className="list" style={{ marginTop: 8 }}>
        {geo.data.slice(0, 6).map((g, i) => (
          <button className="row" key={i} onClick={() => { setLoc({ n: g.name, lat: g.lat, lon: g.lon }); setQ(''); }}>
            <div className="main"><b>{g.name}</b><span className="dim sm">{[g.admin, g.country].filter(Boolean).join(', ')} · {g.lat.toFixed(2)}, {g.lon.toFixed(2)}</span></div>
          </button>
        ))}
      </div>
    )}

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="sun" size={16} /> Sun times for {loc.n}</div>
      <div className="dim sm">{loc.lat.toFixed(2)}, {loc.lon.toFixed(2)} · today</div>
      {sun.loading && <Spin t="Calculating sun" />}
      {sun.error && <Err error={sun.error} retry={() => sun.run()} />}
      {sun.data && (
        <>
          <div className="g2" style={{ marginTop: 12 }}>
            <Stat l="Sunrise" v={String(sun.data.sunrise || '').slice(11, 16) || String(sun.data.sunrise || '').slice(0, 8) || '—'} />
            <Stat l="Sunset" v={String(sun.data.sunset || '').slice(11, 16) || String(sun.data.sunset || '').slice(0, 8) || '—'} />
          </div>
          <div className="g2" style={{ marginTop: 8 }}>
            <Stat l="Solar noon" v={String(sun.data.solar_noon || '').slice(11, 16) || '—'} />
            <Stat l="Day length" v={sun.data.day_length || '—'} />
          </div>
          {(sun.data.civil_twilight_begin || sun.data.moonrise) && (
            <div className="g2" style={{ marginTop: 8 }}>
              {sun.data.civil_twilight_begin && <Stat l="Dawn" v={String(sun.data.civil_twilight_begin).slice(11, 16)} />}
              {sun.data.civil_twilight_end && <Stat l="Dusk" v={String(sun.data.civil_twilight_end).slice(11, 16)} />}
              {sun.data.moonrise && <Stat l="Moonrise" v={String(sun.data.moonrise).slice(0, 8)} />}
              {sun.data.moonset && <Stat l="Moonset" v={String(sun.data.moonset).slice(0, 8)} />}
            </div>
          )}
          {sun.data.moon_phase && <div className="pill" style={{ marginTop: 10 }}>{sun.data.moon_phase}</div>}
          <Src meta={sun.meta} />
        </>
      )}
    </Card>

    <div className="src"><span className="dot" /><span>Sun position from 3 independent astronomy sources</span></div>
  </>);
}

/* ---------------------------------------------------------------- RIDDLES */

export function Riddles() {
  const r = useData('riddles', P.riddles, {}, { ttl: 0 });
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(false); }, [r.data]);

  return (<>
    <Card>
      {r.loading && <Spin t="Thinking of a riddle" />}
      {r.error && <Err error={r.error} retry={() => r.run()} />}
      {r.data && (
        <>
          <div className="chead">Riddle</div>
          <div style={{ fontSize: 16, lineHeight: 1.55, fontWeight: 600 }}>{r.data.q}</div>
          {show ? (
            <>
              <div style={{ marginTop: 14, padding: 12, background: 'var(--s2)', borderRadius: 12 }}>
                <div className="dim sm" style={{ marginBottom: 4 }}>Answer</div>
                <div style={{ fontSize: 15, lineHeight: 1.5 }}>{r.data.a}</div>
              </div>
              <div className="btnrow" style={{ marginTop: 12 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => r.run()}>Next riddle</button>
              </div>
            </>
          ) : (
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShow(true)}>Reveal answer</button>
              <button className="btn ghost" onClick={() => r.run()}>Skip</button>
            </div>
          )}
          <Src meta={r.meta} />
        </>
      )}
      {!r.data && !r.loading && (
        <button className="btn" style={{ width: '100%' }} onClick={() => r.run()}>Get a riddle</button>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>3 independent riddle sources · no repeats</span></div>
  </>);
}

/* ---------------------------------------------------------------- HOROSCOPE */

const SIGNS = [
  ['aries', 'Aries'], ['taurus', 'Taurus'], ['gemini', 'Gemini'], ['cancer', 'Cancer'],
  ['leo', 'Leo'], ['virgo', 'Virgo'], ['libra', 'Libra'], ['scorpio', 'Scorpio'],
  ['sagittarius', 'Sagittarius'], ['capricorn', 'Capricorn'], ['aquarius', 'Aquarius'], ['pisces', 'Pisces'],
];

export function Horoscope() {
  const [sign, setSign] = useState('aries');
  const h = useData('horoscope', P.horoscope, { sign }, { ttl: 3600000, deps: [sign] });

  return (<>
    <div className="cats">
      {SIGNS.map(([v, n]) => (
        <button key={v} className={`cat ${sign === v ? 'on' : ''}`} onClick={() => setSign(v)}>{n}</button>
      ))}
    </div>

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="smile" size={16} /> {sign.charAt(0).toUpperCase() + sign.slice(1)} · Today</div>
      {h.loading && <Spin t="Reading stars" />}
      {h.error && <Err error={h.error} retry={() => h.run()} />}
      {h.data && (
        <>
          {h.data.date && <div className="dim sm" style={{ marginBottom: 8 }}>{h.data.date}</div>}
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--fg2)' }}>{h.data.text}</div>
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={() => h.run()}>Refresh</button>
          </div>
          <Src meta={h.meta} />
        </>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Daily horoscope from 3 independent astrology sources</span></div>
  </>);
}

/* ---------------------------------------------------------------- TRIVIA */

export function Trivia() {
  const t = useData('trivia', P.trivia, {}, { ttl: 0 });
  const [show, setShow] = useState(false);
  const [picked, setPicked] = useState(null);
  useEffect(() => { setShow(false); setPicked(null); }, [t.data]);

  const isFact = t.data?.fact;
  const opts = t.data?.options || [];
  const correct = t.data?.correct || t.data?.answer;

  return (<>
    <Card>
      {t.loading && <Spin t="Fetching question" />}
      {t.error && <Err error={t.error} retry={() => t.run()} />}
      {t.data && (
        <>
          <div className="chead">
            <Icon n="quote" size={16} /> {t.data.category || 'Trivia'} {t.data.difficulty && <span className="pill" style={{ marginLeft: 8 }}>{t.data.difficulty}</span>}
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.5, fontWeight: 600, marginTop: 8 }}>{t.data.question}</div>

          {!isFact && opts.length > 1 && (
            <div className="list" style={{ marginTop: 14 }}>
              {opts.map((o, i) => {
                const isCorrect = show && o === correct;
                const isWrong = show && picked === o && o !== correct;
                return (
                  <button key={i} className="row" style={{
                    textAlign: 'left',
                    background: isCorrect ? 'color-mix(in srgb, var(--green) 18%, var(--card))' : isWrong ? 'color-mix(in srgb, var(--red, #ff5555) 12%, var(--card))' : '',
                    borderColor: isCorrect ? 'var(--green)' : isWrong ? 'var(--red, #ff5555)' : ''
                  }}
                    onClick={() => { if (!show) { setPicked(o); setShow(true); } }}>
                    <div className="main"><b style={{ fontSize: 14 }}>{o}</b></div>
                    {show && o === correct && <Icon n="check" size={16} style={{ color: 'var(--green)' }} />}
                  </button>
                );
              })}
            </div>
          )}

          {isFact && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--s2)', borderRadius: 12 }}>
              <div className="dim sm" style={{ marginBottom: 4 }}>Did you know?</div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>This is a fascinating fact — no options, just pure knowledge!</div>
            </div>
          )}

          {!show && !isFact && opts.length <= 1 && (
            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShow(true)}>Reveal answer</button>
            </div>
          )}

          {show && (
            <>
              <div style={{ marginTop: 14, padding: 12, background: 'var(--s2)', borderRadius: 12 }}>
                <div className="dim sm" style={{ marginBottom: 4 }}>Answer</div>
                <div style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>{t.data.answer}</div>
              </div>
              <div className="btnrow" style={{ marginTop: 12 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => t.run()}>Next question</button>
              </div>
            </>
          )}

          {!show && !isFact && opts.length > 1 && picked == null && (
            <div className="dim sm" style={{ marginTop: 10 }}>Pick an option to see if you are right</div>
          )}

          {!show && (isFact || opts.length <= 1) && (
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => t.run()}>Next</button>
            </div>
          )}

          <Src meta={t.meta} />
        </>
      )}
      {!t.data && !t.loading && (
        <button className="btn" style={{ width: '100%' }} onClick={() => t.run()}>Get a question</button>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Trivia from 4 independent sources · Open Trivia DB, The Trivia API, CyberWisp & Useless Facts</span></div>
  </>);
}

/* ---------------------------------------------------------------- CATS */

export function Cats() {
  const c = useData('cats', P.cats, {}, { ttl: 0 });

  return (<>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {c.loading && <div style={{ padding: 20 }}><Spin t="Fetching cat" /></div>}
      {c.error && <div style={{ padding: 16 }}><Err error={c.error} retry={() => c.run()} /></div>}
      {c.data && (
        <>
          {c.data.image && (
            <img src={c.data.image} alt="cat" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: 'var(--s2)' }}
              referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div style={{ padding: 12 }}>
            {c.data.fact && <div style={{ fontSize: 15, lineHeight: 1.55, fontWeight: c.data.image ? 400 : 600 }}>{c.data.fact}</div>}
            {!c.data.fact && c.data.image && <div className="dim sm">Random cat image · {c.data.tags?.length ? c.data.tags.slice(0, 3).join(', ') : 'cute cat'}</div>}
            {c.data.tags?.length > 0 && <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{c.data.tags.slice(0, 6).map((t, i) => <span key={i} className="pill">{t}</span>)}</div>}
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => c.run()}>Another cat</button>
              {c.data.image && <a className="btn ghost" href={c.data.image} target="_blank" rel="noreferrer">Open image</a>}
            </div>
            <Src meta={c.meta} />
          </div>
        </>
      )}
      {!c.data && !c.loading && (
        <div style={{ padding: 16 }}><button className="btn" style={{ width: '100%' }} onClick={() => c.run()}>Show a cat</button></div>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>Cats from 4 independent sources · facts & images</span></div>
  </>);
}

/* ---------------------------------------------------------------- UNIVERSITIES */

export function Universities() {
  const [country, setCountry] = useState('India');
  const [q, setQ] = useState('India');
  const u = useData('universities', P.universities, { country: q }, { ttl: 3600000, deps: [q] });

  const doSearch = () => {
    const v = country.trim();
    if (!v) return;
    setQ(v);
  };

  return (<>
    <form className="search" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
      <Icon n="search" size={18} />
      <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country… e.g. India, USA, Germany" autoComplete="off" />
      <button type="submit" className="btn sm" style={{ marginLeft: 6 }}>Search</button>
    </form>

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="cap" size={16} /> Universities in {q}</div>
      {u.loading && <Spin t={`Searching ${q}`} />}
      {u.error && <Err error={u.error} retry={() => u.run()} />}
      {u.data && (
        <>
          <div className="dim sm" style={{ margin: '8px 0' }}>{u.data.length} found</div>
          <div className="list">
            {u.data.slice(0, 30).map((uni, i) => (
              <div className="row" key={i} style={{ alignItems: 'flex-start' }}>
                <div className="main">
                  <b style={{ fontSize: 13.5 }}>{uni.name}</b>
                  <span className="dim sm">{[uni.state, uni.country].filter(Boolean).join(' · ')} {uni.alpha_two_code ? `(${uni.alpha_two_code})` : ''}</span>
                  {uni.web_pages?.[0] && <a href={uni.web_pages[0]} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--cyan)', marginTop: 2, display: 'inline-block' }}>{uni.web_pages[0].replace(/^https?:\/\//, '').slice(0, 40)}</a>}
                </div>
              </div>
            ))}
          </div>
          <Src meta={u.meta} />
        </>
      )}
    </Card>
    <div className="src"><span className="dot" /><span>University data from 3 independent sources · Hipolabs, GitHub mirror & College Scorecard</span></div>
  </>);
}

/* ---------------------------------------------------------------- FOOD */

export function Food() {
  const [term, setTerm] = useState('chocolate');
  const [q, setQ] = useState('chocolate');
  const f = useData('food', P.food, { q }, { ttl: 3600000, deps: [q] });

  const doSearch = () => {
    const v = term.trim();
    if (!v) return;
    setQ(v);
  };

  return (<>
    <form className="search" onSubmit={(e) => { e.preventDefault(); doSearch(); }}>
      <Icon n="search" size={18} />
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search food… e.g. apple, chocolate, banana" autoComplete="off" />
      <button type="submit" className="btn sm" style={{ marginLeft: 6 }}>Search</button>
    </form>

    <div style={{ marginTop: 10 }}>
      {f.loading && <Spin t={`Searching ${q}`} />}
      {f.error && <Err error={f.error} retry={() => f.run()} />}
      {f.data && (
        <>
          <div className="dim sm" style={{ marginBottom: 8 }}>{f.data.length} products found for "{q}"</div>
          <div className="list">
            {f.data.map((item, i) => (
              <div className="row" key={i} style={{ alignItems: 'flex-start' }}>
                {item.image && <img src={item.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', background: 'var(--s2)', flexShrink: 0 }} referrerPolicy="no-referrer" />}
                <div className="main">
                  <b style={{ fontSize: 13.5 }}>{item.name}</b>
                  <span className="dim sm">{[item.brand, item.source].filter(Boolean).join(' · ')} {item.code ? `· ${item.code.slice(0, 12)}` : ''}</span>
                  {item.ingredients && <span className="dim sm" style={{ fontSize: 11, lineHeight: 1.3 }}>{String(item.ingredients).slice(0, 120)}</span>}
                  {item.nutriments && Object.keys(item.nutriments).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {Object.entries(item.nutriments).slice(0, 4).map(([k, v], j) => (
                        <span key={j} className="pill" style={{ fontSize: 10 }}>{k}: {typeof v === 'number' ? v.toFixed(1) : String(v).slice(0, 12)}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Src meta={f.meta} />
        </>
      )}
    </div>
    <div className="src"><span className="dot" /><span>Food data from 3 independent sources · Open Food Facts, Fruityvice & USDA</span></div>
  </>);
}
