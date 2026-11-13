/**
 * Saraiki Seekhna — a structured mini-course in Saraiki (Shahmukhi +
 * Roman + Hindi + English), built for one learner's path: Sabaq 1–9
 * are the quick revision of what he has covered (basics, numbers,
 * time), Sabaq 10 onwards is new ground — past and future tenses, the
 * market, travel, and the proverbs of the Saraiki belt.
 *
 * Read-aloud: there is no Saraiki voice in the studio catalogue, so
 * items are spoken with the closest available voice (Urdu) — the page
 * says so in plain words rather than letting the accent pretend.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Section, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { SABAK, NUMBERS, VERBS, OPINIONS, VOCAB, ALL_ITEMS, VERB_ITEMS, PHRASE_COUNT } from '../data/saraiki';
import { pickStudioVoice, studioChunk, stopAudio } from '../core/tts';
import { play as sfxPlay } from '../core/sfx.js';

let voiceCache = null;
let audioEl = null;
async function speak(text, key, setPlaying) {
  try {
    setPlaying(key);
    if (!voiceCache) voiceCache = await pickStudioVoice('ur');
    if (voiceCache) {
      const url = await studioChunk(text, voiceCache.index, 1);
      if (!audioEl) audioEl = new Audio();
      audioEl.src = url;
      audioEl.onended = () => setPlaying('');
      await audioEl.play();
      return;
    }
    throw new Error('no studio voice');
  } catch {
    try {
      stopAudio();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ur-PK';
      u.onend = () => setPlaying('');
      speechSynthesis.speak(u);
    } catch { setPlaying(''); toast('Read-aloud is not available right now', 'err'); }
  }
}

function SpeakBtn({ text, id, playing, setPlaying }) {
  const busy = playing === id;
  return (
    <button className="iconbtn" aria-label={busy ? 'Stop' : 'Listen'}
      onClick={() => {
        if (busy) { if (audioEl) audioEl.pause(); stopAudio(); setPlaying(''); return; }
        speak(text, id, setPlaying);
      }}>
      <Icon n={busy ? 'pause' : 'volume'} size={16} /></button>
  );
}

function ItemRow({ it, id, playing, setPlaying }) {
  return (
    <div className="row">
      <div className="main">
        <b className="f-ur" lang="skr" dir="rtl" style={{ display: 'block', textAlign: 'right', fontSize: 19, lineHeight: 2.1 }}>{it.s}</b>
        <span style={{ fontSize: 14.5 }}>{it.r} · <span className="f-dev" lang="hi">{it.hi}</span></span>
        <span className="dim sm">{it.en}</span>
      </div>
      <SpeakBtn text={it.s} id={id} playing={playing} setPlaying={setPlaying} />
    </div>);
}

function NumberGrid({ from, to, playing, setPlaying }) {
  const rows = NUMBERS.filter(([n]) => n >= from && n <= to);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
      {rows.map(([n, s, r]) => (
        <button key={n} className="tile" style={{ minHeight: 86, padding: '8px 6px' }}
          onClick={() => speak(s, `num-${n}`, setPlaying)} aria-label={`${n} — listen`}>
          <span className="dim sm tnum">{n}</span>
          <span className="f-ur" lang="skr" dir="rtl" style={{ fontSize: 19, lineHeight: 1.9 }}>{s}</span>
          <small>{r}</small>
        </button>))}
    </div>);
}

/* ------------------------------------------------------------ practice */
/* Drill progress (omni:saraiki:drill, registered in core/keys.js):
   quiz best score per pool + a running count of cards reviewed per
   Sabaq. Stored on-device only, like everything else in this tool. */
const DRILL_KEY = 'omni:saraiki:drill';
const loadDrill = () => {
  try { const d = JSON.parse(localStorage.getItem(DRILL_KEY) || '{}'); return { quiz: d.quiz || {}, seen: d.seen || {} }; }
  catch { return { quiz: {}, seen: {} }; }
};
const saveDrill = (d) => { try { localStorage.setItem(DRILL_KEY, JSON.stringify(d)); } catch { /* storage off */ } };

const POOLS = [{ key: 'all', label: 'All' },
  ...Array.from({ length: 18 }, (_, i) => i + 1).map((n) => ({ key: String(n), label: `Sabaq ${n}` }))];
const poolItems = (key) => (key === 'all' ? VOCAB : VOCAB.filter((v) => String(v.n) === key));
const shuffled = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
/** One correct item + three distractors sharing no answer text. */
function makeQuestion(pool, field) {
  const item = pool[Math.floor(Math.random() * pool.length)];
  const seen = new Set([item[field]]);
  const opts = [item];
  for (const cand of shuffled(pool)) {
    if (opts.length >= 4) break;
    if (!seen.has(cand[field])) { seen.add(cand[field]); opts.push(cand); }
  }
  return { item, options: shuffled(opts) };
}

function FlashCards({ pool, bumpSeen }) {
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
        <span className="f-ur" lang="skr" dir="rtl" style={{ fontSize: 26, lineHeight: 2 }}>{it.s}</span>
        <span className="dim sm" style={{ display: 'block', marginTop: 6 }}>Tap to flip · Sabaq {it.n}</span>
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

function Quiz({ pool, poolKey, drill, saveQuizBest, listen, playing, setPlaying }) {
  const field = listen ? 's' : 'en';
  const [q, setQ] = useState(() => makeQuestion(pool, field));
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  useEffect(() => { setQ(makeQuestion(pool, field)); setRound(1); setScore(0); setPicked(null); setOver(false); }, [pool, field]);
  useEffect(() => { if (listen && !over) speak(q.item.s, 'drill-listen', setPlaying); }, [q, listen]); // eslint-disable-line
  const best = drill.quiz[poolKey + (listen ? ':listen' : ':quiz')];
  const answer = (opt) => {
    if (picked) return;
    setPicked(opt[field]);
    const right = opt[field] === q.item[field];
    if (right) { setScore((s) => s + 1); sfxPlay('success'); } else sfxPlay('error');
  };
  const next = () => {
    if (round >= 10) {
      setOver(true);
      saveQuizBest(poolKey + (listen ? ':listen' : ':quiz'), score);
      return;
    }
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
      <div className="dim sm" style={{ marginTop: 6 }}>The voice is the closest available (Urdu) — match the sound to the written Saraiki.</div>
    </>) : (<>
      <div className="f-ur" lang="skr" dir="rtl" style={{ fontSize: 24, lineHeight: 2, textAlign: 'right' }}>{q.item.s}</div>
      <div className="dim sm">{q.item.r} — what does it mean?</div>
    </>)}
    <div className="list" style={{ marginTop: 8 }}>
      {q.options.map((opt) => {
        const val = opt[field];
        const isRight = val === q.item[field];
        const cls = picked ? (isRight ? 'on' : val === picked ? 'err' : '') : '';
        return (
          <button key={val} className={`row ${cls}`} disabled={!!picked} onClick={() => answer(opt)}
            style={picked && isRight ? { borderColor: 'var(--green)' } : picked && val === picked ? { borderColor: 'var(--err)' } : undefined}>
            <div className="main">
              {listen
                ? <b className="f-ur" lang="skr" dir="rtl" style={{ display: 'block', textAlign: 'right', fontSize: 19, lineHeight: 2 }}>{opt.s}</b>
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
function Practice({ playing, setPlaying }) {
  const [mode, setMode] = useState('flash');
  const [poolKey, setPoolKey] = useState('all');
  const [drill, setDrill] = useState(loadDrill);
  const pool = useMemo(() => poolItems(poolKey), [poolKey]);
  const bumpSeen = (n) => setDrill((d) => {
    const next = { ...d, seen: { ...d.seen, [n]: (d.seen[n] || 0) + 1 } };
    saveDrill(next); return next;
  });
  const saveQuizBest = (key, score) => setDrill((d) => {
    if ((d.quiz[key] ?? -1) >= score) return d;
    const next = { ...d, quiz: { ...d.quiz, [key]: score } };
    saveDrill(next); return next;
  });
  const seenTotal = Object.values(drill.seen).reduce((a, b) => a + b, 0);
  return (
    <Section id="saraiki-practice" title="Abhyaas · Practice" icon="sparkle" badge="New">
      <div className="dim sm" style={{ margin: '2px 0 8px' }}>
        Three drills built from the course’s own words. Progress stays on this device —
        {seenTotal ? ` ${seenTotal} card reviews logged so far.` : ' flip a card or finish a round to start yours.'}
      </div>
      <div className="cats">
        {[['flash', 'Flash cards'], ['quiz', 'Match the meaning'], ['listen', 'Listen & pick']].map(([m, lbl]) => (
          <button key={m} className={`cat ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{lbl}</button>))}
      </div>
      <div className="cats" style={{ marginTop: 6 }}>
        {POOLS.map((p) => {
          const qb = drill.quiz[p.key + ':quiz'];
          return (
            <button key={p.key} className={`cat ${poolKey === p.key ? 'on' : ''}`} onClick={() => setPoolKey(p.key)}>
              {p.label}{qb !== undefined ? ` · ${qb}/10` : ''}</button>);
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        {mode === 'flash' && <FlashCards pool={pool} bumpSeen={bumpSeen} />}
        {mode === 'quiz' && <Quiz pool={pool} poolKey={poolKey} drill={drill} saveQuizBest={saveQuizBest} playing={playing} setPlaying={setPlaying} />}
        {mode === 'listen' && <Quiz listen pool={pool} poolKey={poolKey} drill={drill} saveQuizBest={saveQuizBest} playing={playing} setPlaying={setPlaying} />}
      </div>
    </Section>
  );
}

export function Saraiki() {
  const [playing, setPlaying] = useState('');
  useEffect(() => () => { if (audioEl) audioEl.pause(); stopAudio(); }, []);
  const wotd = useMemo(() => {
    const pool = [...ALL_ITEMS, ...VERB_ITEMS, ...OPINIONS];
    const day = Math.floor(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 86400000);
    return pool[day % pool.length];
  }, []);
  return (<>
    <Card>
      <div className="chead">Saraiki Seekhna · سبق</div>
      <div className="sm" style={{ lineHeight: 1.6 }}>
        A full mini-course in <b>Saraiki</b> — Shahmukhi script, Roman, Hindi and English for every line.
        Sabaq 1–9 revise the ground already covered; Sabaq 10 onwards is new: tenses, the market, travel,
        proverbs, and now directions, health, the phone, Multani food and how to say what you think.
        {' '}{PHRASE_COUNT} lines plus a full 1–100 count.
      </div>
      <div className="dim sm" style={{ marginTop: 8 }}>
        Read-aloud uses the closest available voice (Urdu) — the catalogue has no Saraiki voice of its
        own, so treat the accent as a guide, not a model.
      </div>
    </Card>

    <Card style={{ marginTop: 10 }}>
      <div className="chead">Roz ka ek shabd · Word of the day</div>
      <div className="dim sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — one word from the course, changing every day</div>
      <div className="list" style={{ marginTop: 6 }}>
        <ItemRow it={wotd} id="wotd" playing={playing} setPlaying={setPlaying} />
      </div>
    </Card>

    <Practice playing={playing} setPlaying={setPlaying} />

    {SABAK.map((sb) => (
      <Section key={sb.n} id={`saraiki-s${sb.n}`}
        title={`Sabaq ${sb.n} · ${sb.title}`} icon={sb.kind === 'new' ? 'sparkle' : 'book'}
        badge={sb.kind === 'new' ? 'New' : 'Revision'} defaultOpen={sb.n === 10}>
        <div className="dim sm" style={{ margin: '2px 0 8px' }}>{sb.note}</div>
        {sb.n === 4 && <NumberGrid from={1} to={20} playing={playing} setPlaying={setPlaying} />}
        {sb.n === 5 && <NumberGrid from={21} to={100} playing={playing} setPlaying={setPlaying} />}
        {sb.items.length > 0 && (
          <div className="list">
            {sb.items.map((it, i) => (
              <ItemRow key={i} it={it} id={`s${sb.n}-${i}`} playing={playing} setPlaying={setPlaying} />))}
          </div>)}
        {sb.n === 18 && (<>
          <div className="seclabel" style={{ marginTop: 12 }}>Feelings & opinions — sentence frames</div>
          <div className="list">
            {OPINIONS.map((it, i) => (
              <ItemRow key={i} it={it} id={`op-${i}`} playing={playing} setPlaying={setPlaying} />))}
          </div>
        </>)}
        {sb.n === 11 && (<>
          <div className="seclabel" style={{ marginTop: 12 }}>The verb table — present · past · future</div>
          <div className="list">
            {VERBS.map((v, i) => (
              <div className="col" key={i} style={{ alignItems: 'stretch' }}>
                <b>{v.inf.r} <span className="dim sm">· {v.inf.en}</span></b>
                {[['Present', v.pres], ['Past', v.past], ['Future', v.fut]].map(([lbl, f]) => (
                  <div className="row" key={lbl} style={{ padding: '4px 0' }}>
                    <span className="dim sm" style={{ width: 52, flex: '0 0 auto' }}>{lbl}</span>
                    <div className="main">
                      <span className="f-ur" lang="skr" dir="rtl" style={{ display: 'block', textAlign: 'right', fontSize: 17, lineHeight: 2 }}>{f.s}</span>
                      <span className="dim sm">{f.r} · {f.en}</span>
                    </div>
                    <SpeakBtn text={f.s} id={`v${i}-${lbl}`} playing={playing} setPlaying={setPlaying} />
                  </div>))}
              </div>))}
          </div>
        </>)}
      </Section>
    ))}
    <div className="src"><span className="dot" />
      <span>Course data is built into the app and works offline · Saraiki forms only — میڈا/تیڈا, never میرا/تیرا</span></div>
  </>);
}

export default Saraiki;
