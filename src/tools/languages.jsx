/**
 * languages.jsx — the Languages hub plus the Urdu, Punjabi and
 * Gurmukhi course screens. All three courses ride the shared engine
 * in langcourse.jsx (the Saraiki engine's shape); Saraiki Seekhna
 * keeps its own screen and is linked from the hub.
 *
 * Voice honesty, per course (also stated on each page):
 *  - Urdu — the studio catalogue HAS an Urdu voice ("Gul"): real.
 *  - Punjabi (Shahmukhi) — no Punjabi studio voice exists; the Urdu
 *    voice reads the script (it is the same script family) and the
 *    page labels it the closest available, never "a Punjabi voice".
 *  - Gurmukhi — no studio voice reads Gurmukhi at all; the device's
 *    own Punjabi voice (pa-IN) is used when present, labelled as such.
 */
import React, { useState } from 'react';
import { Card, Section } from '../ui/kit';
import { Icon } from '../ui/icons';
import { CourseScreen, LetterQuiz, SpeakBtn, createSpeaker } from './langcourse';
import * as U from '../data/urdu';
import * as P from '../data/punjabi';
import * as G from '../data/gurmukhi';
import { SABAK as SK_SABAK, PHRASE_COUNT as SK_COUNT } from '../data/saraiki';

/* ---------------------------------------------------------------- hub */
const go = (id) => { location.hash = id; };

export function Languages() {
  const courses = [
    {
      id: 'saraiki', name: 'Saraiki Seekhna', icon: 'book',
      line: `${SK_SABAK.length} Sabaq · ${SK_COUNT} lines · Shahmukhi + Roman`,
      sub: 'The original course — Saraiki only: میڈا / تیڈا, the implosive letters, Multani food and proverbs.',
    },
    {
      id: 'urdu', name: 'Urdu Sikho', icon: 'book',
      line: `Script first · ${U.LETTERS.length} haroof with joined forms · ${U.SABAK.length} Sabaq · ${U.PHRASE_COUNT} lines`,
      sub: 'Learn the Nastaliq letters properly, then greetings, family, bazaar, health and the sayings.',
    },
    {
      id: 'punjabi', name: 'Punjabi Sikho', icon: 'book',
      line: `${P.SABAK.length} Sabaq · ${P.PHRASE_COUNT} lines · Shahmukhi + Roman`,
      sub: 'Spoken Punjabi as it is actually spoken — چنگا، چاہیدا، گل — not Hindi in Shahmukhi letters.',
    },
    {
      id: 'gurmukhi', name: 'Gurmukhi Sikho', icon: 'book',
      line: `${G.AKHAR.length} akhar · ${G.MATRA.length} matra · ${G.WORDS.length} words · ${G.GURBANI_LINES.length} real Gurbani lines`,
      sub: 'The script course: letters → vowel signs → words you know → reading Japji and Anand Sahib word by word.',
    },
  ];
  return (<>
    <Card>
      <div className="chead">Languages · Zubaanein</div>
      <div className="sm" style={{ lineHeight: 1.6 }}>
        Four courses, one method: every line in its own script with Roman, Hindi and English,
        drills built from the course’s own words, and a word of the day. Everything is built
        into the app and works offline.
      </div>
    </Card>
    <div className="list" style={{ marginTop: 10 }}>
      {courses.map((c) => (
        <button key={c.id} className="row" onClick={() => go(c.id)}>
          <span className="ric"><Icon n={c.icon} size={20} /></span>
          <div className="main">
            <b>{c.name}</b>
            <span className="dim sm">{c.line}</span>
            <span className="sm">{c.sub}</span>
          </div>
          <Icon n="chevron" size={16} />
        </button>))}
    </div>
    <div className="src"><span className="dot" />
      <span>Read-aloud is labelled honestly on each course page — no voice pretends to be what it is not.</span></div>
  </>);
}

/* ---------------------------------------------------------------- urdu */
const urduSpeaker = createSpeaker({ studioLang: 'ur', deviceLang: 'ur-PK' });
const formsFor = (l) => ({
  iso: l.ch,
  fin: 'ـ' + l.ch,
  med: l.join === 'both' ? 'ـ' + l.ch + 'ـ' : null,
  ini: l.join === 'both' ? l.ch + 'ـ' : null,
});

const URDU_COURSE = {
  id: 'urdu', title: 'Urdu Sikho', scriptTitle: 'اردو',
  cls: 'f-ur', lang: 'ur', dir: 'rtl', lessonWord: 'Sabaq',
  speak: urduSpeaker.speak, stopSpeak: urduSpeaker.stop,
  intro: (<>A full mini-course in <b>Urdu</b> — and it starts where Urdu must start: the script.
    The {U.LETTERS.length} haroof come first, each with its joined forms (how it looks alone, at a word’s
    end, in the middle, and at the start), its name, its sound and a real word. Then {U.SABAK.length} Sabaq
    of living Urdu — salaam, family, the bazaar, health, and the sayings people actually season speech with.</>),
  speakNote: 'Read-aloud uses the studio Urdu voice — a real Urdu voice, so the accent is a true model here.',
  wotdLabel: 'Roz ka ek lafz · Word of the day',
  wotdPool: [...U.ALL_ITEMS, ...U.NUMBER_ITEMS],
  sabak: U.SABAK,
  numberGrid: { sabaq: 3, numbers: U.NUMBERS },
  pools: [{ key: 'all', label: 'All' },
    ...U.SABAK.map((s) => ({ key: String(s.n), label: `Sabaq ${s.n}` })),
    { key: 'letters', label: 'Haroof' }],
  poolItems: (key) => (key === 'all' ? U.VOCAB
    : key === 'letters' ? U.LETTER_ITEMS
    : U.VOCAB.filter((v) => String(v.n) === key)),
  drillKey: 'omni:langs:drill:urdu',
  listenNote: 'The Urdu studio voice is speaking — match the sound to the written Urdu.',
  topSections: (ctx) => [{
    key: 'haroof', title: `The Haroof · ${U.LETTERS.length} letters`, icon: 'type', badge: 'Start here', open: true,
    note: 'Tap a letter to hear a word it lives in. Each tile shows the letter alone, then its joined forms — final (ـب), medial (ـبـ), initial (بـ). The nine non-joiners (ا د ڈ ذ ر ڑ ز ژ و) join only backwards: they have no medial or initial form, and a word visually breaks after them.',
    body: (<>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
        {U.LETTERS.map((l) => {
          const f = formsFor(l);
          return (
            <button key={l.ch} className="tile" style={{ minHeight: 128, padding: '8px 6px' }}
              onClick={() => ctx.speak(l.ex, `let-${l.ch}`, ctx.setPlaying)} aria-label={`${l.name} — hear ${l.exr}`}>
              <span className="f-ur" lang="ur" dir="rtl" style={{ fontSize: 26, lineHeight: 1.9 }}>{f.iso}</span>
              <small style={{ display: 'block' }}>{l.name} · {l.rom}</small>
              <span className="f-ur" lang="ur" dir="rtl" style={{ display: 'block', fontSize: 17, lineHeight: 1.9 }}>
                {f.med ? `${f.fin} ${f.med} ${f.ini}` : f.ini === null && l.join === 'final' ? `${f.fin} · end only` : `${f.fin} · non-joiner`}
              </span>
              <span className="dim sm" style={{ display: 'block' }}>{l.exr} — {l.exe}</span>
            </button>);
        })}
      </div>
      <div className="seclabel" style={{ marginTop: 12 }}>Two helpers that ride on other letters</div>
      <div className="list">
        {U.HELPERS.map((h) => (
          <div className="row" key={h.ch}>
            <div className="main">
              <b className="f-ur" lang="ur" dir="rtl" style={{ display: 'block', textAlign: 'right', fontSize: 20, lineHeight: 2 }}>{h.ch}</b>
              <span style={{ fontSize: 14.5 }}>{h.name} · {h.rom}</span>
              <span className="dim sm">{h.note}</span>
            </div>
          </div>))}
      </div>
    </>),
  }],
  notes: { title: 'Reading Urdu — the honest rules', lines: U.NOTES },
  footer: 'Course data is built into the app and works offline · Letter table cross-checked against the standard Urdu alphabet (order, names, joined forms, non-joiners)',
};

export function Urdu() { return <CourseScreen course={URDU_COURSE} />; }

/* ------------------------------------------------------------- punjabi */
const punjabiSpeaker = createSpeaker({ studioLang: 'ur', deviceLang: 'ur-PK' });

const PUNJABI_COURSE = {
  id: 'punjabi', title: 'Punjabi Sikho', scriptTitle: 'پنجابی',
  cls: 'f-ur', lang: 'pa', dir: 'rtl', lessonWord: 'Sabaq',
  speak: punjabiSpeaker.speak, stopSpeak: punjabiSpeaker.stop,
  intro: (<>Spoken <b>Punjabi</b> in Shahmukhi — the same script family as the Saraiki course, a different
    language inside it. Punjabi says <b>چنگا</b> (changā, good), <b>گل</b> (gall, a matter), <b>چاہیدا</b> (chāhīdā,
    needed) and <b>بھلک</b> (bhalak, tomorrow); its present tense ends in <b>-دا</b> and its “am/is/are” are
    <b> آں / اے / نے</b>. If you know Saraiki, watch the possessives flip: Punjabi’s are میرا / تیرا / تہاڈا.</>),
  speakNote: 'Read-aloud uses the closest available voice (Urdu) — it reads the Shahmukhi script faithfully, but Punjabi’s own sounds, above all its tones, differ. Treat it as a guide to the words, not a model of the music.',
  wotdLabel: 'Roz da ek shabd · Word of the day',
  wotdPool: [...P.ALL_ITEMS, ...P.NUMBER_ITEMS],
  sabak: P.SABAK,
  numberGrid: { sabaq: 3, numbers: P.NUMBERS },
  pools: [{ key: 'all', label: 'All' }, ...P.SABAK.map((s) => ({ key: String(s.n), label: `Sabaq ${s.n}` }))],
  poolItems: (key) => (key === 'all' ? P.VOCAB : P.VOCAB.filter((v) => String(v.n) === key)),
  drillKey: 'omni:langs:drill:punjabi',
  listenNote: 'The voice is the closest available (Urdu) — match the sound to the written Punjabi.',
  notes: { title: 'How Punjabi differs — the honest notes', lines: P.NOTES },
  footer: 'Course data is built into the app and works offline · Genuine Punjabi — میرا / تہاڈا and the -دا present; Saraiki’s میڈا / تیڈا never appear',
};

export function Punjabi() { return <CourseScreen course={PUNJABI_COURSE} />; }

/* ------------------------------------------------------------ gurmukhi */
const gurmukhiSpeaker = createSpeaker({ studioLang: null, deviceLang: 'pa-IN' });

function SignRows({ rows, ctx }) {
  return (
    <div className="list">
      {rows.map((m) => (
        <div className="row" key={m.name}>
          <div className="main">
            <b className="f-pa" lang="pa" style={{ display: 'block', fontSize: 22, lineHeight: 1.5 }}>{m.ex}
              <span className="dim sm" style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}> · {m.rom}</span></b>
            <span style={{ fontSize: 14.5 }}>{m.name} — the “{m.sound}” sign</span>
            <span className="dim sm">{m.en}</span>
          </div>
          <SpeakBtn text={m.ex} id={`sign-${m.name}`} {...ctx} speak={gurmukhiSpeaker.speak} />
        </div>))}
    </div>);
}

function GurbaniLines({ ctx }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="col" style={{ gap: 12 }}>
      {G.GURBANI_LINES.map((l, li) => (
        <div key={li} className="col" style={{ gap: 4 }}>
          <span className="f-pa" lang="pa" style={{ fontSize: 20, lineHeight: 1.7 }}>{l.g}</span>
          <span className="sm">{l.r}</span>
          <span className="dim sm">{l.en}</span>
          <span className="dim sm">{l.src}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {l.words.map(([w, r, e], wi) => {
              const key = `${li}:${wi}`;
              const on = sel === key;
              return (
                <button key={key} className={`cat ${on ? 'on' : ''}`}
                  onClick={() => { setSel(on ? null : key); ctx.speak(w, `gw-${key}`, ctx.setPlaying); }}>
                  <span className="f-pa" lang="pa">{w}</span> · {r}</button>);
            })}
          </div>
          {sel && sel.startsWith(`${li}:`) && (
            <span className="sm" style={{ marginTop: 2 }}>
              <b>{l.words[Number(sel.split(':')[1])][0]}</b> — {l.words[Number(sel.split(':')[1])][2]}
            </span>)}
          <div>
            <button className="btn ghost" onClick={() => ctx.speak(l.g, `gl-${li}`, ctx.setPlaying)}>
              <Icon n={ctx.playing === `gl-${li}` ? 'pause' : 'volume'} size={14} /> Hear the whole line</button>
          </div>
        </div>))}
    </div>);
}

const GURMUKHI_COURSE = {
  id: 'gurmukhi', title: 'Gurmukhi Sikho', scriptTitle: 'ਗੁਰਮੁਖੀ',
  cls: 'f-pa', lang: 'pa', dir: 'ltr', lessonWord: 'Step',
  altCls: 'f-ur', altLang: 'pa', altDir: 'rtl',
  speak: gurmukhiSpeaker.speak, stopSpeak: gurmukhiSpeaker.stop,
  intro: (<>The <b>script</b> course. Gurmukhi is the script Punjabi is read in across India — and the script
    of the Guru Granth Sahib. The ladder is honest and short: the {G.AKHAR.length} akhar, the vowel signs that
    dress them, words you already know from the spoken courses (each with its Shahmukhi twin), and then real
    lines of Gurbani, read word by word.</>),
  speakNote: 'Read-aloud uses your device’s own Punjabi voice if it has one — no studio voice reads Gurmukhi, and this page will not pretend otherwise. If the device has none, the buttons simply stay quiet.',
  wotdLabel: 'Ajj da shabd · Word of the day',
  wotdPool: G.WORD_ITEMS,
  sabak: [
    {
      n: 1, title: 'Pehle shabd · Words you already know', kind: 'new',
      note: 'Every word below is one you have met in the spoken courses — here it is in Gurmukhi, with its Shahmukhi twin underneath. Sound them out letter by letter; the matra do the rest.',
      items: G.WORD_ITEMS,
    },
    {
      n: 2, title: 'Gurbani parho · Read the real lines', kind: 'new',
      note: 'Real lines, copied exactly from this app’s own Gurbani data — tap any word to hear it and see its meaning, or hear the whole line.',
      items: [],
    },
  ],
  numberGrid: null,
  pools: [{ key: 'all', label: 'All' }, { key: 'words', label: 'Words' }, { key: 'letters', label: 'Akhar' }],
  poolItems: (key) => (key === 'all' ? G.VOCAB : key === 'letters' ? G.LETTER_ITEMS : G.WORD_ITEMS),
  drillKey: 'omni:langs:drill:gurmukhi',
  listenNote: 'Your device’s Punjabi voice is speaking (if it has one) — match the sound to the written word.',
  extraModes: [['letters', 'Recognise the letter']],
  renderExtraMode: (mode, dctx) => (mode === 'letters'
    ? <LetterQuiz letters={G.AKHAR} drill={dctx.drill} saveQuizBest={dctx.saveQuizBest}
        speak={gurmukhiSpeaker.speak} setPlaying={dctx.setPlaying} cls="f-pa" lang="pa" />
    : null),
  topSections: (ctx) => [
    {
      key: 'akhar', title: `The ${G.AKHAR.length} Akhar · the paintī`, icon: 'type', badge: 'Start here', open: true,
      note: 'In the order every Punjabi child learns them: the three vowel-carriers, ਸ and ਹ, five rows of five, then ਯ ਰ ਲ ਵ ੜ. Tap a letter to hear it.',
      body: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
          {G.AKHAR.map((a) => (
            <button key={a.ch} className="tile" style={{ minHeight: 92, padding: '8px 4px' }}
              onClick={() => ctx.speak(a.ch, `ak-${a.ch}`, ctx.setPlaying)} aria-label={`${a.name} — listen`}>
              <span className="f-pa" lang="pa" style={{ fontSize: 26, lineHeight: 1.4 }}>{a.ch}</span>
              <small style={{ display: 'block' }}>{a.name}</small>
              <span className="dim sm">{a.sound}</span>
            </button>))}
        </div>),
    },
    {
      key: 'matra', title: 'Matra · the vowel signs', icon: 'type',
      note: 'A bare letter already says “a” (muktā). These signs change that vowel — every example is built on ਕ (ka).',
      body: <SignRows rows={G.MATRA} ctx={ctx} />,
    },
    {
      key: 'lagaan', title: 'Lagaan · the extra marks', icon: 'type',
      note: 'Three small marks with big jobs: two kinds of nasal, and the doubler.',
      body: <SignRows rows={G.LAGAAN} ctx={ctx} />,
    },
  ],
  renderSabakExtra: (n, ctx) => (n === 2 ? <GurbaniLines ctx={ctx} /> : null),
  notes: { title: 'Reading Gurmukhi — the honest rules', lines: G.NOTES },
  footer: 'Course data is built into the app and works offline · Every Gurbani line above is byte-identical to this app’s own Gurbani reader data',
};

export function Gurmukhi() { return <CourseScreen course={GURMUKHI_COURSE} />; }
