/**
 * Sleep & Focus Sounds — ambient loops synthesised live by
 * core/ambient.js (no audio files, works offline). Any two sounds can
 * be mixed; each keeps its own volume. The sleep timer fades the mix
 * out gently instead of cutting it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Card, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { RECIPES, RECIPE_IDS, play, stop, setVolume, playingIds, fadeOutAll, supported } from '../core/ambient';

/* The timer outlives the page: leaving the tool must not cancel a
   fade-out the user asked for, so the deadline lives at module level. */
let timerEnd = 0;
let timerTO = null;
function armTimer(mins, onFire) {
  disarmTimer();
  if (!mins) return;
  timerEnd = Date.now() + mins * 60000;
  timerTO = setTimeout(() => { timerEnd = 0; timerTO = null; onFire(); }, mins * 60000);
}
function disarmTimer() { if (timerTO) clearTimeout(timerTO); timerTO = null; timerEnd = 0; }

const TIMER_OPTS = [0, 10, 20, 30, 45, 60];

export function SleepSounds() {
  const [on, setOn] = useState(() => playingIds());
  const [vols, setVols] = useState({});
  const [err, setErr] = useState(() => (supported() ? '' : 'This browser has no Web Audio, so the sounds cannot be made.'));
  const [mins, setMins] = useState(0);
  const [left, setLeft] = useState(0);
  const orderRef = useRef([...playingIds()]);

  useEffect(() => {
    const iv = setInterval(() => setLeft(timerEnd ? Math.max(0, Math.round((timerEnd - Date.now()) / 1000)) : 0), 500);
    return () => clearInterval(iv);
  }, []);

  const toggle = (id) => {
    if (on.includes(id)) {
      stop(id);
      orderRef.current = orderRef.current.filter((x) => x !== id);
      setOn(playingIds());
      return;
    }
    const r = play(id, vols[id] ?? 0.8);
    if (!r.ok) { setErr(r.why); toast(r.why, 'err'); return; }
    orderRef.current = [...orderRef.current.filter((x) => x !== id), id];
    if (orderRef.current.length > 2) { // mix limit: two layers
      const old = orderRef.current.find((x) => x !== id && playingIds().includes(x));
      if (old) { stop(old); orderRef.current = orderRef.current.filter((x) => x !== old); toast('Two-sound mix — the oldest layer stopped', 'info'); }
    }
    setOn(playingIds());
  };
  const pickTimer = (m) => {
    setMins(m);
    armTimer(m, () => { fadeOutAll(4); setMins(0); setTimeout(() => setOn(playingIds()), 4300); toast('Sleep timer — sounds faded out', 'info'); });
    if (m) toast(`Sleep timer set — ${m} minutes`, 'ok');
  };
  const fmtLeft = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (<>
    {err && <div className="err" style={{ marginBottom: 10 }}><h4>Sounds unavailable</h4><p>{err}</p></div>}
    <div className="dim sm" style={{ marginBottom: 10 }}>
      Made live by the app — no recordings, no downloads, works offline. Tap two sounds to mix them.
    </div>
    <div className="list">
      {RECIPE_IDS.map((id) => {
        const R = RECIPES[id];
        const active = on.includes(id);
        return (
          <div className="col" key={id} style={{ alignItems: 'stretch' }}>
            <div className="row" style={{ padding: 0 }}>
              <span className="state-ic" style={{ flex: '0 0 auto' }}><Icon n="wave" size={18} /></span>
              <div className="main"><b>{R.name}</b><span className="dim sm">{R.desc}</span></div>
              <button className={`btn sm ${active ? '' : 'ghost'}`} onClick={() => toggle(id)} aria-pressed={active}>
                <Icon n={active ? 'pause' : 'play'} size={14} /> {active ? 'Stop' : 'Play'}</button>
            </div>
            {active && (
              <label className="dim sm" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <Icon n="volume" size={15} /> Volume
                <input type="range" min="0" max="100" value={Math.round((vols[id] ?? 0.8) * 100)}
                  onChange={(e) => { const v = +e.target.value / 100; setVols((s) => ({ ...s, [id]: v })); setVolume(id, v); }}
                  style={{ flex: 1 }} aria-label={`${R.name} volume`} />
              </label>)}
          </div>);
      })}
    </div>

    <Card style={{ marginTop: 12 }}>
      <div className="chead"><Icon n="timer" size={14} /> Sleep timer</div>
      <div className="btnrow" style={{ marginTop: 0 }}>
        {TIMER_OPTS.map((m) => (
          <button key={m} className={`cat ${mins === m ? 'on' : ''}`} onClick={() => pickTimer(m)} aria-pressed={mins === m}>
            {m === 0 ? 'Off' : `${m} min`}</button>))}
      </div>
      {mins > 0 && (
        <div className="src" style={{ marginTop: 8 }}><span className="dot" />
          <span>Fading out in <b className="tnum">{fmtLeft}</b> — the mix lowers gently over the last seconds, it does not cut.</span></div>)}
      {on.length > 0 && (
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => { for (const id of playingIds()) stop(id); setOn([]); pickTimer(0); }}>
          Stop everything</button>)}
    </Card>
  </>);
}

export default SleepSounds;
