/**
 * Path & Aarti Reminders — set a time for a path or aarti the app
 * already carries. Fires in-app (banner + sound) while the app is open,
 * and as a system notification where the platform allows it. The limit
 * is stated on the page, not buried: a web app cannot ring while it is
 * fully closed, so a missed reminder is shown on the next open.
 */
import React, { useEffect, useState } from 'react';
import { Card, Empty, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { REM_TARGETS, targetById, loadReminders, saveReminders, openTarget } from '../core/reminders';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function Reminders() {
  const [list, setList] = useState(loadReminders);
  const [targetId, setTargetId] = useState(REM_TARGETS[0].id);
  const [time, setTime] = useState('05:30');
  const [days, setDays] = useState(ALL_DAYS);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  useEffect(() => { saveReminders(list); }, [list]);

  const add = () => {
    if (!time) { toast('Pick a time first', 'err'); return; }
    const r = { id: `r${Date.now().toString(36)}`, targetId, time, days: [...days].sort(), on: true, lastFired: '' };
    setList((l) => [...l, r]);
    toast('Reminder set', 'ok');
  };
  const toggleDay = (d) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const askNotify = async () => {
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      toast(p === 'granted' ? 'Notifications allowed' : 'Notifications not allowed — reminders will show inside the app', 'info');
    } catch { toast('This browser could not show the permission prompt', 'err'); }
  };

  return (<>
    <Card>
      <div className="chead"><Icon n="bell" size={14} /> New reminder</div>
      <label className="dim sm" htmlFor="rem-target">Path or aarti</label>
      <select id="rem-target" className="fld" style={{ width: '100%', margin: '4px 0 10px' }} value={targetId}
        onChange={(e) => setTargetId(e.target.value)}>
        {REM_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.sub}</option>)}
      </select>
      <label className="dim sm" htmlFor="rem-time">Time</label>
      <input id="rem-time" type="time" className="fld" style={{ width: '100%', margin: '4px 0 10px' }}
        value={time} onChange={(e) => setTime(e.target.value)} />
      <div className="dim sm" style={{ marginBottom: 4 }}>Days</div>
      <div className="btnrow" style={{ marginTop: 0 }}>
        {DAY_LETTERS.map((L, d) => (
          <button key={d} className={`cat ${days.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)}
            aria-pressed={days.includes(d)}>{L}</button>))}
        <button className="cat" onClick={() => setDays(ALL_DAYS)}>Every day</button>
      </div>
      <button className="btn" style={{ marginTop: 12, width: '100%' }} onClick={add} disabled={!days.length}>
        <Icon n="plus" size={15} /> Add reminder</button>
      {!days.length && <div className="dim sm" style={{ marginTop: 6 }}>Pick at least one day.</div>}
    </Card>

    <Card style={{ marginTop: 10 }}>
      <div className="chead"><Icon n="bell" size={14} /> Notifications</div>
      {perm === 'unsupported' && <div className="sm">This browser does not support notifications. Reminders will appear as a banner inside the app while it is open.</div>}
      {perm === 'default' && (<>
        <div className="sm">Allow notifications so a reminder can reach you when the app is in the background.</div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={askNotify}>Allow notifications</button></>)}
      {perm === 'granted' && <div className="sm">Notifications are allowed. Reminders will also be posted as a notification while the app is open in the background.</div>}
      {perm === 'denied' && <div className="sm">Notifications are blocked in the browser settings. Reminders will appear as a banner inside the app while it is open.</div>}
      <div className="dim sm" style={{ marginTop: 10 }}>
        How reminders work here: they ring while the app is open or installed with notifications allowed.
        A web app cannot ring at an exact minute while it is fully closed — if the app was shut at your
        time, the reminder banner will be waiting for you when you next open it the same day.
      </div>
    </Card>

    <div className="seclabel" style={{ marginTop: 14 }}>Your reminders · {list.length}</div>
    {list.length === 0
      ? <Empty icon="bell" t="No reminders yet — add your first path above" />
      : <div className="list">
          {list.map((r) => {
            const t = targetById(r.targetId);
            return (
              <div className="row" key={r.id}>
                <span className="state-ic" style={{ flex: '0 0 auto' }}><Icon n="bell" size={17} /></span>
                <div className="main"><b>{t.name}</b>
                  <span className="dim sm">{r.time} · {r.days.length === 7 ? 'Every day' : r.days.map((d) => 'SMTWTFS'[d]).join(' ')}</span></div>
                <button className="btn ghost sm" onClick={() => openTarget(t)}>Open</button>
                <button className={`btn ghost sm`} onClick={() => setList((l) => l.map((x) => x.id === r.id ? { ...x, on: x.on === false } : x))}
                  aria-pressed={r.on !== false}>{r.on === false ? 'Off' : 'On'}</button>
                <button className="iconbtn" aria-label="Delete reminder"
                  onClick={() => setList((l) => l.filter((x) => x.id !== r.id))}><Icon n="trash" size={16} /></button>
              </div>);
          })}
        </div>}
  </>);
}

export default Reminders;
