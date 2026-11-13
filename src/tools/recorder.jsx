/**
 * Voice Recorder — record, keep, play back, download, delete.
 *
 * Recordings live in IndexedDB on this device (nothing is uploaded,
 * nothing leaves the phone). The microphone is asked for only when you
 * press Record, and a refusal is answered with plain instructions —
 * not a silent dead button.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Empty, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { play as sfxPlay } from '../core/sfx.js';

const DB = 'omni-recordings';
const STORE = 'clips';

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    t.onsuccess = () => resolve((t.result || []).sort((a, b) => b.at - a.at));
    t.onerror = () => reject(t.error);
  });
}
async function dbPut(rec) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec);
    t.onsuccess = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function dbDel(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    t.onsuccess = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

const human = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const tstr = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const extFor = (mime) => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';

export function Recorder() {
  const [clips, setClips] = useState(null);
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const audioRef = useRef(null);
  const urlRef = useRef('');

  const load = async () => { try { setClips(await dbAll()); } catch { setClips([]); } };
  useEffect(() => { load(); }, []);
  useEffect(() => () => {
    clearInterval(timerRef.current);
    try { mrRef.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* already closed */ }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const start = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErr('This browser cannot record audio. Try Chrome or Safari on your phone.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setErr(e?.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Tap the lock/site icon in the address bar, allow the microphone for this site, then try again.'
        : 'No microphone could be opened on this device.');
      sfxPlay('error');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timerRef.current);
      const dur = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      const recObj = { id: 'r' + Date.now(), at: Date.now(), dur, size: blob.size, mime: blob.type, blob };
      try { await dbPut(recObj); await load(); toast('Recording saved'); sfxPlay('success'); }
      catch { toast('Could not save the recording — storage may be full', 'err'); }
      setRec(false); setSecs(0);
    };
    mrRef.current = mr;
    startedRef.current = Date.now();
    mr.start(250);
    setRec(true); setSecs(0);
    timerRef.current = setInterval(() => setSecs(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
    sfxPlay('timer');
  };

  const stop = () => { try { mrRef.current?.stop(); } catch { setRec(false); } };

  const playClip = (clip) => {
    if (playingId === clip.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(clip.blob);
    urlRef.current = url;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = url;
    a.onended = () => setPlayingId(null);
    a.play().catch(() => { setPlayingId(null); toast('Could not play that recording', 'err'); });
    setPlayingId(clip.id);
    sfxPlay('play');
  };

  const download = (clip) => {
    const u = URL.createObjectURL(clip.blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = `recording-${new Date(clip.at).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extFor(clip.mime || '')}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };

  const remove = async (clip) => {
    if (playingId === clip.id) { audioRef.current?.pause(); setPlayingId(null); }
    await dbDel(clip.id);
    await load();
    toast('Recording deleted', 'info');
    sfxPlay('remove');
  };

  return (<>
    <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
      <button className={`rec-btn ${rec ? 'on' : ''}`} onClick={rec ? stop : start}
        aria-label={rec ? 'Stop recording' : 'Start recording'}>
        <Icon n={rec ? 'x' : 'mic'} size={30} />
      </button>
      <div style={{ marginTop: 10 }}>
        {rec
          ? <><span className="rec-dot" /> <b className="mono" style={{ fontSize: 18 }}>{tstr(secs)}</b>
              <div className="dim sm">Recording… tap the button to stop and save</div></>
          : <div className="dim sm">Tap to record a voice note, a tune, a reminder</div>}
      </div>
    </div>
    {err && <div className="err"><p>{err}</p></div>}

    <div className="chead" style={{ marginTop: 14 }}>Your recordings</div>
    {clips === null && <div className="dim sm">Loading…</div>}
    {clips !== null && clips.length === 0 && (
      <Empty icon="mic" t="Nothing recorded yet — your clips will live here, on this device only" />)}
    {clips && clips.length > 0 && (
      <div className="list">
        {clips.map((c) => (
          <div className="row" key={c.id}>
            <button className="stream-play" aria-label={playingId === c.id ? 'Pause' : 'Play'}
              onClick={() => playClip(c)}>
              <Icon n={playingId === c.id ? 'pause' : 'play'} size={17} />
            </button>
            <div className="main" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5 }}>{new Date(c.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
              <span className="dim sm">{tstr(c.dur)} · {human(c.size)}</span>
            </div>
            <button className="rowbtn" aria-label="Download" onClick={() => download(c)}><Icon n="download" size={17} /></button>
            <button className="rowbtn" aria-label="Delete" style={{ color: 'var(--bad)' }} onClick={() => remove(c)}>
              <Icon n="trash" size={17} /></button>
          </div>))}
      </div>)}
    <div className="src"><span className="dot" /><span>Stored only on this device — clearing site data deletes them</span></div>
  </>);
}

export default Recorder;
