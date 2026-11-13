/**
 * langcourse.jsx — the shared engine behind the language courses
 * (Urdu Sikho, Punjabi Sikho, Gurmukhi Sikho). It mirrors the Saraiki
 * Seekhna engine faithfully — Sabaq list of phrase rows (script +
 * Roman + Hindi + English), Abhyaas drills (flash cards, match the
 * meaning, listen & pick), a word of the day, and per-course progress
 * in localStorage — extracted so each course is data + a thin screen.
 *
 * Read-aloud honesty: Urdu lines are spoken by the studio Urdu voice
 * (the catalogue has one — "Gul"); Punjabi Shahmukhi lines ride the
 * same Urdu voice, the closest that can read the script, and the page
 * says so. Gurmukhi has NO studio voice at all, so it uses the
 * device's own Punjabi voice (pa-IN) when the device has one and
 * says plainly when it falls back.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Section, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { pickStudioVoice, studioChunk, stopAudio } from '../core/tts';
import { play as sfxPlay } from '../core/sfx.js';

/* ------------------------------------------------------------ speech */
export function createSpeaker({ studioLang = null, deviceLang = 'ur-PK' } = {}) {
  let voiceCache = null;
  let tried = false;
  let audioEl = null;
  async function speak(text, key, setPlaying) {
    try {
      setPlaying(key);
      if (studioLang) {
        if (!tried) { tried = true; try { voiceCache = await pickStudioVoice(studioLang); } catch { voiceCache = null; } }
        if (voiceCache) {
          const url = await studioChunk(text, voiceCache.index, 1);
          if (!audioEl) audioEl = new Audio();
          audioEl.src = url;
          audioEl.onended = () => setPlaying('');
          await audioEl.play();
          return;
        }
      }
      throw new Error('device tier');
    } catch {
      try {
        stopAudio();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = deviceLang;
        u.onend = () => setPlaying('');
        u.onerror = () => setPlaying('');
        speechSynthesis.speak(u);
      } catch { setPlaying(''); toast('Read-aloud is not available right now', 'err'); }
    }
  }
  function stop() { if (audioEl) audioEl.pause(); stopAudio(); try { speechSynthesis.cancel(); } catch { /* no tts */ } }
  return { speak, stop };
}

export function SpeakBtn({ text, id, playing, setPlaying, speak }) {
  const busy = playing === id;
  return (
    <button className="iconbtn" aria-label={busy ? 'Stop' : 'Listen'}
      onClick={() => {
        if (busy) { setPlaying(''); return; }
        speak(text, id, setPlaying);
      }}>
      <Icon n={busy ? 'pause' : 'volume'} size={16} /></button>
  );
}

/* A phrase row: script line, Roman · Hindi, English beneath.
 * `alt` (e.g. a Shahmukhi bridge for a Gurmukhi word) renders as a
 * second script line in its own class/dir when present. */
export function ItemRow({ it, id, playing, setPlaying, speak, cls, lang, dir = 'rtl', altCls, altLang, altDir = 'rtl', big = 19 }) {
  return (
    <div className="row">
      <div className="main">
        <b className={cls} lang={lang} dir={dir} style={{ display: 'block', textAlign: dir === 'rtl' ? 'right' : 'left', fontSize: big, lineHeight: dir === 'rtl' ? 2.1 : 1.5 }}>{it.s}</b>
        {it.alt && <span className={altCls} lang={altLang} dir={altDir} style={{ display: 'block', textAlign: altDir === 'rtl' ? 'right' : 'left', fontSize: 16, lineHeight: 2 }}>{it.alt}</span>}
        <span style={{ fontSize: 14.5 }}>{it.r} · <span className="f-dev" lang="hi">{it.hi}</span></span>
        <span className="dim sm">{it.en}</span>
      </div>
      <SpeakBtn text={it.s} id={id} playing={playing} setPlaying={setPlaying} speak={speak} />
    </div>);
}

export function NumberGrid({ numbers, playing, setPlaying, speak, cls, lang }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
      {numbers.map(([n, s, r]) => (
        <button key={n} className="tile" style={{ minHeight: 86, padding: '8px 6px' }}
          onClick={() => speak(s, `num-${n}`, setPlaying)} aria-label={`${n} — listen`}>
          <span className="dim sm tnum">{n}</span>
          <span className={cls} lang={lang} dir="rtl" style={{ fontSize: 19, lineHeight: 1.9 }}>{s}</span>
          <small>{r}</small>
        </button>))}
    </div>);
}

/* ------------------------------------------------------------ drills */
export const loadDrill = (key) => {
  try { const d = JSON.parse(localStorage.getItem(key) || '{}'); return { quiz: d.quiz || {}, seen: d.seen || {} }; }
  catch { return { quiz: {}, seen: {} }; }
};
export const saveDrill = (key, d) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* storage off */ } };

export const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
/** One correct item + three distractors sharing no answer text. */
export function makeQuestion(pool, field) {
  const item = pool[Math.floor(Math.random() * pool.length)];
  const seen = new Set([item[field]]);
  const opts = [item];
  for (const cand of shuffled(pool)) {
    if (opts.length >= 4) break;
    if (!seen.has(cand[field])) { seen.add(cand[field]); opts.push(cand); }
  }
  return { item, options: shuffled(opts) };
}

export function FlashCards({ pool, bumpSeen, cls, lang, dir = 'rtl', lessonWord = 'Sabaq' }) {
  const [deck, setDeck] = useState(() => shuffled(pool));
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const seenRef = useRef(new Set());
  useEffect(() => { setDeck(shuffled(pool)); setIdx(0); setFlip(false); }, [pool]);
  const it = deck[Math.min(idx, deck.length - 1)];
  if (!it) return null;
  const turn = () => {
    if (!flip) {
      const id = `${it.n}|${it.s}`;
      if (!seenRef.current.has(id)) { seenRef.current.add(id); bumpSeen(it.n); }
    }
    setFlip((f) => !f);
  };
  const go = (d) => { setIdx((i) => (i + d + deck.length) % deck.length); setFlip(false); };
  return (<>
    <button className="tile" style={{ width: '100%', minHeight: 168, padding: 16 }} onClick={turn}
      aria-label={flip ? 'Card answer shown — tap to flip back' : 'Flash card — tap to flip'}>
      {!flip ? (<>
        <span className={cls} lang={lang} dir={dir} style={{ fontSize: 26, lineHeight: dir === 'rtl' ? 2 : 1.5 }}>{it.s}</span>
        <span className="dim sm" style={{ display: 'block', marginTop: 6 }}>Tap to flip · {it.n ? `${lessonWord} ${it.n}` : 'Letters'}</span>
      </>) : (<>
        <span style={{ fontSize: 16 }}>{it.r}</span>
        <span className="f-dev" lang="hi" style={{ display: 'block', fontSize: 15, marginTop: 4 }}>{it.hi}</span>
        <span className="dim sm" style={{ display: 'block', marginTop: 4 }}>{it.en}</span>
      </>)}
    </button>
    <div className="btnrow" style={{ marginTop: 8 }}>
      <button className="btn ghost" style={{ flex: 1 }} onClick={() => go(-1)}><Icon n="back" size={14} /> Prev</button>
      <span className="dim sm" style={{ alignSelf: 'center' }}>{Math.min(idx + 1, deck.length)} / {deck.length}</span>
      <button className="btn ghost" style={{ flex: 1 }} onClick={() => { setDeck(shuffled(pool)); setIdx(0); setFlip(false); }}>
        <Icon n="shuffle" size={14} /> Shuffle</button>
      <button className="btn" style={{ flex: 1 }} onClick={() => go(1)}>Next <Icon n="chevron" size={14} /></button>
    </div>
  </>);
}

export function Quiz({ pool, poolKey, drill, saveQuizBest, listen, playing, setPlaying, speak, cls, lang, dir = 'rtl', listenNote }) {
  const field = listen ? 's' : 'en';
  const [q, setQ] = useState(() => makeQuestion(pool, field));
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  useEffect(() => { setQ(makeQuestion(pool, field)); setRound(1); setScore(0); setPicked(null); setOver(false); }, [pool, field]);
  useEffect(() => { if (listen && !over) speak(q.item.s, 'drill-listen', setPlaying); }, [q, listen]); // eslint-disable-line
  const bestKey = poolKey + (listen ? ':listen' : ':quiz');
  const best = drill.quiz[bestKey];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt[field]);
    const right = opt[field] === q.item[field];
    if (right) { setScore((s) => s + 1); sfxPlay('success'); } else sfxPlay('error');
  };
  const next = () => {
    if (round >= 10) { setOver(true); saveQuizBest(bestKey, score); return; }
    setRound((r) => r + 1); setPicked(null); setQ(makeQuestion(pool, field));
  };
  const restart = () => { setQ(makeQuestion(pool, field)); setRound(1); setScore(0); setPicked(null); setOver(false); };
  if (over) return (<>
    <div className="col" style={{ textAlign: 'center', padding: '10px 0' }}>
      <b style={{ fontSize: 17 }}>{score} / 10</b>
      <span className="dim sm">{best !== undefined ? `Best in this pool: ${Math.max(best, score)} / 10` : 'First round in this pool — best saved'}</span>
      <div className="btnrow" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn" onClick={restart}><Icon n="refresh" size={14} /> Play again</button>
      </div>
    </div>
  </>);
  return (<>
    <div className="dim sm" style={{ marginBottom: 6 }}>Round {round} of 10 · Score {score}{best !== undefined ? ` · Best ${best}` : ''}</div>
    {listen ? (<>
      <button className="btn" style={{ width: '100%' }} onClick={() => speak(q.item.s, 'drill-listen', setPlaying)}>
        <Icon n={playing === 'drill-listen' ? 'pause' : 'volume'} size={16} /> {playing === 'drill-listen' ? 'Playing…' : 'Listen, then pick what you heard'}
      </button>
      {listenNote && <div className="dim sm" style={{ marginTop: 6 }}>{listenNote}</div>}
    </>) : (<>
      <div className={cls} lang={lang} dir={dir} style={{ fontSize: 24, lineHeight: dir === 'rtl' ? 2 : 1.5, textAlign: dir === 'rtl' ? 'right' : 'left' }}>{q.item.s}</div>
      <div className="dim sm">{q.item.r} — what does it mean?</div>
    </>)}
    <div className="list" style={{ marginTop: 8 }}>
      {q.options.map((opt) => {
        const val = opt[field];
        const isRight = val === q.item[field];
        return (
          <button key={val} className="row" disabled={!!picked} onClick={() => answer(opt)}
            style={picked && isRight ? { borderColor: 'var(--green)' } : picked && val === picked ? { borderColor: 'var(--err)' } : undefined}>
            <div className="main">
              {listen
                ? <b className={cls} lang={lang} dir={dir} style={{ display: 'block', textAlign: dir === 'rtl' ? 'right' : 'left', fontSize: 19, lineHeight: dir === 'rtl' ? 2 : 1.5 }}>{opt.s}</b>
                : <span style={{ fontSize: 15 }}>{opt.en}</span>}
              {picked && isRight && listen && <span className="dim sm">{opt.r} · {opt.en}</span>}
            </div>
            {picked && isRight && <Icon n="check" size={16} />}
            {picked && val === picked && !isRight && <Icon n="x" size={16} />}
          </button>);
      })}
    </div>
    {picked && (
      <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={next}>
        {round >= 10 ? 'See the score' : 'Next'} <Icon n="chevron" size={14} /></button>)}
  </>);
}

/** Gurmukhi-only drill: see a letter, pick its sound. */
export function LetterQuiz({ letters, drill, saveQuizBest, speak, setPlaying, cls, lang }) {
  const mk = () => {
    const item = letters[Math.floor(Math.random() * letters.length)];
    const seen = new Set([item.sound]);
    const opts = [item];
    for (const cand of shuffled(letters)) {
      if (opts.length >= 4) break;
      if (!seen.has(cand.sound)) { seen.add(cand.sound); opts.push(cand); }
    }
    return { item, options: shuffled(opts) };
  };
  const [q, setQ] = useState(mk);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  const best = drill.quiz.letters;
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt.sound);
    if (opt.sound === q.item.sound) { setScore((s) => s + 1); sfxPlay('success'); } else sfxPlay('error');
  };
  const next = () => {
    if (round >= 10) { setOver(true); saveQuizBest('letters', score); return; }
    setRound((r) => r + 1); setPicked(null); setQ(mk());
  };
  const restart = () => { setQ(mk()); setRound(1); setScore(0); setPicked(null); setOver(false); };
  if (over) return (<>
    <div className="col" style={{ textAlign: 'center', padding: '10px 0' }}>
      <b style={{ fontSize: 17 }}>{score} / 10</b>
      <span className="dim sm">{best !== undefined ? `Best: ${Math.max(best, score)} / 10` : 'First round — best saved'}</span>
      <div className="btnrow" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button className="btn" onClick={restart}><Icon n="refresh" size={14} /> Play again</button>
      </div>
    </div>
  </>);
  return (<>
    <div className="dim sm" style={{ marginBottom: 6 }}>Round {round} of 10 · Score {score}{best !== undefined ? ` · Best ${best}` : ''}</div>
    <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
      <span className={cls} lang={lang} style={{ fontSize: 52, lineHeight: 1.3 }}>{q.item.ch}</span>
      <div className="dim sm">Which sound is this letter?</div>
      <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => speak(q.item.ch, 'letter-q', setPlaying)}>
        <Icon n="volume" size={14} /> Hear the letter</button>
    </div>
    <div className="list" style={{ marginTop: 8 }}>
      {q.options.map((opt) => {
        const isRight = opt.sound === q.item.sound;
        return (
          <button key={opt.ch} className="row" disabled={!!picked} onClick={() => answer(opt)}
            style={picked && isRight ? { borderColor: 'var(--green)' } : picked && opt.sound === picked ? { borderColor: 'var(--err)' } : undefined}>
            <div className="main"><span style={{ fontSize: 16 }}>{opt.sound}</span>
              {picked && isRight && <span className="dim sm" style={{ display: 'block' }}>{opt.name} · {opt.en}</span>}</div>
            {picked && isRight && <Icon n="check" size={16} />}
            {picked && opt.sound === picked && !isRight && <Icon n="x" size={16} />}
          </button>);
      })}
    </div>
    {picked && (
      <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={next}>
        {round >= 10 ? 'See the score' : 'Next'} <Icon n="chevron" size={14} /></button>)}
  </>);
}

export function Practice({ course, playing, setPlaying }) {
  const { pools, poolItems, drillKey, speak, cls, lang, dir, listenNote, extraModes = [], renderExtraMode } = course;
  const [mode, setMode] = useState('flash');
  const [poolKey, setPoolKey] = useState('all');
  const [drill, setDrill] = useState(() => loadDrill(drillKey));
  const pool = useMemo(() => poolItems(poolKey), [poolKey, poolItems]);
  const bumpSeen = (n) => setDrill((d) => {
    const next = { ...d, seen: { ...d.seen, [n]: (d.seen[n] || 0) + 1 } };
    saveDrill(drillKey, next); return next;
  });
  const saveQuizBest = (key, score) => setDrill((d) => {
    if ((d.quiz[key] ?? -1) >= score) return d;
    const next = { ...d, quiz: { ...d.quiz, [key]: score } };
    saveDrill(drillKey, next); return next;
  });
  const seenTotal = Object.values(drill.seen).reduce((a, b) => a + b, 0);
  const modes = [['flash', 'Flash cards'], ['quiz', 'Match the meaning'], ['listen', 'Listen & pick'], ...extraModes];
  return (
    <Section id={`${course.id}-practice`} title="Abhyaas · Practice" icon="sparkle" badge="New">
      <div className="dim sm" style={{ margin: '2px 0 8px' }}>
        Drills built from this course’s own words. Progress stays on this device —
        {seenTotal ? ` ${seenTotal} card reviews logged so far.` : ' flip a card or finish a round to start yours.'}
      </div>
      <div className="cats">
        {modes.map(([m, lbl]) => (
          <button key={m} className={`cat ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{lbl}</button>))}
      </div>
      {mode !== 'letters' && (
        <div className="cats" style={{ marginTop: 6 }}>
          {pools.map((p) => {
            const qb = drill.quiz[p.key + ':quiz'];
            return (
              <button key={p.key} className={`cat ${poolKey === p.key ? 'on' : ''}`} onClick={() => setPoolKey(p.key)}>
                {p.label}{qb !== undefined ? ` · ${qb}/10` : ''}</button>);
          })}
        </div>)}
      <div style={{ marginTop: 10 }}>
        {mode === 'flash' && <FlashCards pool={pool} bumpSeen={bumpSeen} cls={cls} lang={lang} dir={dir} lessonWord={course.lessonWord} />}
        {mode === 'quiz' && <Quiz pool={pool} poolKey={poolKey} drill={drill} saveQuizBest={saveQuizBest} playing={playing} setPlaying={setPlaying} speak={speak} cls={cls} lang={lang} dir={dir} />}
        {mode === 'listen' && <Quiz listen pool={pool} poolKey={poolKey} drill={drill} saveQuizBest={saveQuizBest} playing={playing} setPlaying={setPlaying} speak={speak} cls={cls} lang={lang} dir={dir} listenNote={listenNote} />}
        {renderExtraMode && renderExtraMode(mode, { drill, saveQuizBest, playing, setPlaying })}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- course screen */
/* course = {
 *   id, title, scriptTitle, intro (node), speakNote, cls, lang, dir,
 *   speak, wotdPool, wotdLabel, lessonWord ('Sabaq'), sabak: [...],
 *   numberGrid: { sabaq, numbers } | null,
 *   topSections: (ctx) => [ { key, title, icon, badge, note, body } ],
 *   notes: { title, lines: [] } | null,
 *   renderSabakExtra: (n, ctx) => node | null,
 *   practice fields: pools, poolItems, drillKey, listenNote, extraModes, renderExtraMode,
 *   footer: string,
 * } */
export function CourseScreen({ course }) {
  const [playing, setPlaying] = useState('');
  const { speak } = course;
  useEffect(() => () => { course.stopSpeak && course.stopSpeak(); }, []); // eslint-disable-line
  const ctx = { playing, setPlaying, speak };
  const wotd = useMemo(() => {
    const pool = course.wotdPool;
    const day = Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 86400000);
    return pool[day % pool.length];
  }, [course.wotdPool]);
  const row = (it, id) => (
    <ItemRow key={id} it={it} id={id} {...ctx} cls={course.cls} lang={course.lang} dir={course.dir}
      altCls={course.altCls} altLang={course.altLang} altDir={course.altDir} />);
  return (<>
    <Card>
      <div className="chead">{course.title} · <span className={course.cls} lang={course.lang}>{course.scriptTitle}</span></div>
      <div className="sm" style={{ lineHeight: 1.6 }}>{course.intro}</div>
      {course.speakNote && <div className="dim sm" style={{ marginTop: 8 }}>{course.speakNote}</div>}
    </Card>

    <Card style={{ marginTop: 10 }}>
      <div className="chead">{course.wotdLabel}</div>
      <div className="dim sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — one word from the course, changing every day</div>
      <div className="list" style={{ marginTop: 6 }}>{row(wotd, 'wotd')}</div>
    </Card>

    <Practice course={course} playing={playing} setPlaying={setPlaying} />

    {course.topSections && course.topSections(ctx).map((s) => (
      <Section key={s.key} id={`${course.id}-${s.key}`} title={s.title} icon={s.icon || 'book'} badge={s.badge} defaultOpen={s.open}>
        {s.note && <div className="dim sm" style={{ margin: '2px 0 8px' }}>{s.note}</div>}
        {s.body}
      </Section>
    ))}

    {course.sabak.map((sb) => (
      <Section key={sb.n} id={`${course.id}-s${sb.n}`}
        title={`${course.lessonWord} ${sb.n} · ${sb.title}`} icon={sb.kind === 'new' ? 'sparkle' : 'book'}
        badge={sb.kind === 'new' ? 'New' : undefined} defaultOpen={sb.n === 1}>
        <div className="dim sm" style={{ margin: '2px 0 8px' }}>{sb.note}</div>
        {course.numberGrid && course.numberGrid.sabaq === sb.n && (
          <div style={{ marginBottom: 10 }}>
            <NumberGrid numbers={course.numberGrid.numbers} {...ctx} cls={course.cls} lang={course.lang} />
          </div>)}
        {sb.items.length > 0 && (
          <div className="list">
            {sb.items.map((it, i) => row(it, `s${sb.n}-${i}`))}
          </div>)}
        {course.renderSabakExtra && course.renderSabakExtra(sb.n, ctx)}
      </Section>
    ))}

    {course.notes && (
      <Section id={`${course.id}-notes`} title={course.notes.title} icon="info">
        <div className="col" style={{ gap: 8 }}>
          {course.notes.lines.map((ln, i) => <div key={i} className="sm" style={{ lineHeight: 1.6 }}>{ln}</div>)}
        </div>
      </Section>
    )}

    <div className="src"><span className="dot" /><span>{course.footer}</span></div>
  </>);
}
