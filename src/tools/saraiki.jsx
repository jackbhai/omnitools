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
import React, { useEffect, useRef, useState } from 'react';
import { Card, Section, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { SABAK, NUMBERS, VERBS, PHRASE_COUNT } from '../data/saraiki';
import { pickStudioVoice, studioChunk, stopAudio } from '../core/tts';

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

export function Saraiki() {
  const [playing, setPlaying] = useState('');
  useEffect(() => () => { if (audioEl) audioEl.pause(); stopAudio(); }, []);
  return (<>
    <Card>
      <div className="chead">Saraiki Seekhna · سبق</div>
      <div className="sm" style={{ lineHeight: 1.6 }}>
        A full mini-course in <b>Saraiki</b> — Shahmukhi script, Roman, Hindi and English for every line.
        Sabaq 1–9 revise the ground already covered; Sabaq 10 onwards is new: past and future tenses,
        the market, travel, and proverbs. {PHRASE_COUNT} lines plus a full 1–100 count.
      </div>
      <div className="dim sm" style={{ marginTop: 8 }}>
        Read-aloud uses the closest available voice (Urdu) — the catalogue has no Saraiki voice of its
        own, so treat the accent as a guide, not a model.
      </div>
    </Card>

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
