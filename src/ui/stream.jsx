/**
 * A small streaming player for tools that play a direct audio URL
 * (internet radio, podcast episodes).
 *
 * The main music player resolves its own tracks through the music
 * resolver chain and cannot take a raw stream URL, so these tools carry
 * this lighter player instead — same surface language (artwork, title,
 * transport, seek), one audio element, and it politely pauses the music
 * player before starting so two things never talk over each other.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../core/player';
import { play as sfxPlay } from '../core/sfx.js';
import { Icon } from './icons';

export function useStreamPlayer() {
  const music = usePlayer();
  const elRef = useRef(null);
  const [cur, setCur] = useState(null);       // { key, title, sub, art }
  const [status, setStatus] = useState('idle'); // idle|loading|playing|paused|error
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState('');
  const metaRef = useRef({ live: false, onEnded: null });

  const el = () => {
    if (!elRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      elRef.current = a;
    }
    return elRef.current;
  };

  useEffect(() => {
    const a = el();
    const onPlay = () => setStatus('playing');
    const onPause = () => setStatus((s) => (s === 'error' ? s : 'paused'));
    const onWait = () => setStatus((s) => (s === 'playing' ? s : 'loading'));
    const onTime = () => setPos(a.currentTime || 0);
    const onMeta = () => setDur(Number.isFinite(a.duration) ? a.duration : 0);
    const onErr = () => {
      if (!a.src) return;
      setErr('This stream could not be played. It may be offline or blocked here.');
      setStatus('error');
    };
    const onEnded = () => { setStatus('paused'); metaRef.current.onEnded?.(); };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWait);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('error', onErr);
    a.addEventListener('ended', onEnded);
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.load();
      for (const [ev, fn] of [['play', onPlay], ['pause', onPause], ['waiting', onWait],
        ['timeupdate', onTime], ['loadedmetadata', onMeta], ['error', onErr], ['ended', onEnded]]) {
        a.removeEventListener(ev, fn);
      }
    };
  }, []);

  const play = useCallback((item, url, { live = false, startAt = 0, onEnded = null } = {}) => {
    const a = el();
    try { if (music?.playing) music.toggle(); } catch { /* music player optional */ }
    metaRef.current = { live, onEnded };
    setErr('');
    if (cur?.key === item.key && a.src) {
      if (a.paused) { a.play().catch(() => {}); sfxPlay('play'); }
      else { a.pause(); sfxPlay('pause'); }
      return;
    }
    setCur(item);
    setStatus('loading');
    setPos(0); setDur(0);
    a.src = url;
    a.load();
    if (startAt > 0) {
      const seek = () => { try { a.currentTime = startAt; } catch {} a.removeEventListener('loadedmetadata', seek); };
      a.addEventListener('loadedmetadata', seek);
    }
    a.play().catch(() => { /* error event reports it */ });
    sfxPlay('play');
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.title, artist: item.sub || '',
          artwork: item.art ? [{ src: item.art, sizes: '512x512' }] : [],
        });
      }
    } catch { /* optional */ }
  }, [cur, music]);

  const toggle = useCallback(() => {
    const a = el();
    if (!a.src) return;
    if (a.paused) { a.play().catch(() => {}); sfxPlay('play'); }
    else { a.pause(); sfxPlay('pause'); }
  }, []);

  const stop = useCallback(() => {
    const a = el();
    a.pause();
    a.removeAttribute('src');
    a.load();
    setCur(null); setStatus('idle'); setPos(0); setDur(0); setErr('');
  }, []);

  const seek = useCallback((t) => {
    const a = el();
    try { a.currentTime = t; setPos(t); } catch { /* live streams may refuse */ }
  }, []);

  return { cur, status, pos, dur, err, live: metaRef.current.live, play, toggle, stop, seek,
           audioEl: elRef };
}

const tstr = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
};

/** Sticky transport bar rendered at the foot of a tool view. */
export function StreamBar({ p, onClose }) {
  if (!p.cur) return null;
  const live = p.live;
  return (
    <div className="stream-bar" role="region" aria-label="Now playing">
      {p.cur.art
        ? <img src={p.cur.art} alt="" className="stream-art" referrerPolicy="no-referrer" />
        : <span className="stream-art stream-art-ph"><Icon n={live ? 'radio' : 'wave'} size={18} /></span>}
      <div className="main" style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cur.title}</b>
        <span className="dim sm" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.status === 'loading' ? 'Connecting…' : p.status === 'error' ? 'Stream failed'
            : live ? (p.status === 'playing' ? 'Live' : 'Paused') + (p.cur.sub ? ` · ${p.cur.sub}` : '')
            : `${tstr(p.pos)} / ${tstr(p.dur)}${p.cur.sub ? ` · ${p.cur.sub}` : ''}`}
        </span>
        {!live && p.dur > 0 && (
          <input type="range" className="stream-seek" min="0" max={p.dur} step="1" value={Math.min(p.pos, p.dur)}
            onChange={(e) => p.seek(+e.target.value)} aria-label="Seek" />)}
      </div>
      <button className="rowbtn" aria-label={p.status === 'playing' ? 'Pause' : 'Play'} onClick={p.toggle}>
        <Icon n={p.status === 'playing' ? 'pause' : 'play'} size={20} />
      </button>
      <button className="rowbtn" aria-label="Stop" onClick={() => { p.stop(); onClose?.(); }}>
        <Icon n="x" size={17} />
      </button>
      {p.status === 'error' && p.err && (
        <div className="stream-err dim sm">{p.err}</div>)}
    </div>
  );
}
