/**
 * Daily Panchang — computed on the device from the app's own vedic
 * astronomy (core/panchang.js): tithi, nakshatra, yoga and karana at
 * sunrise, sunrise/sunset, the three kaal windows, Abhijit and Brahma
 * muhurta, and the Hindu month. No network, any date, the user's place
 * (the app location — Delhi by default, as everywhere in the app).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Stat, Spin, Err } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useLoc } from '../core/geo';
import { computePanchang, limbsAt, tzOffsetMinutes, RASHI_NAMES } from '../core/panchang';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Panchang() {
  const loc = useLoc();
  const [day, setDay] = useState(() => ymd(new Date()));
  const [data, setData] = useState(null);
  const [now, setNow] = useState(null);
  const [err, setErr] = useState('');
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let dead = false;
    setErr(''); setData(null);
    (async () => {
      try {
        const { y, m, d } = parseYmd(day);
        const probe = new Date(Date.UTC(y, m - 1, d, 12));
        const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
        const tzMin = tzOffsetMinutes(probe, tzName);
        const p = await computePanchang({ y, m, d, lat: loc.lat, lon: loc.lon, tzMin });
        if (dead) return;
        if (!p) { setErr('The sun does not rise or set on this date at this place (polar day or night), so a panchang cannot be formed.'); return; }
        setData(p);
        const n = await limbsAt(new Date(), p.ayanamsa);
        if (!dead) setNow(n);
      } catch (e) { if (!dead) setErr(e.message || 'The panchang could not be calculated.'); }
    })();
    return () => { dead = true; };
  }, [day, loc.lat, loc.lon, runId]);

  const zone = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timeZoneName: 'short' })
        .formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value || '';
    } catch { return ''; }
  }, []);
  const tf = (dt) => dt ? dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
  const isToday = day === ymd(new Date());
  const nowDate = new Date();
  const inWin = (w) => isToday && nowDate >= w.start && nowDate <= w.end;
  const shift = (n) => { const { y, m, d } = parseYmd(day); setDay(ymd(new Date(y, m - 1, d + n))); };

  const kaalRow = (label, w, note) => (
    <div className="kv" key={label}>
      <span>{label}{inWin(w) && <b style={{ color: 'var(--warn)' }}> · running now</b>}<br />
        <span className="dim sm">{note}</span></span>
      <b className="tnum">{tf(w.start)} – {tf(w.end)}</b>
    </div>);

  return (<>
    <div className="btnrow" style={{ alignItems: 'center' }}>
      <button className="btn ghost sm" onClick={() => shift(-1)} aria-label="Previous day"><Icon n="back" size={14} /></button>
      <input type="date" className="fld" style={{ flex: 1 }} value={day} max="2100-12-31" min="1900-01-01"
        onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pick a date" />
      <button className="btn ghost sm" onClick={() => shift(1)} aria-label="Next day"><Icon n="chevron" size={14} /></button>
      {!isToday && <button className="btn sm" onClick={() => setDay(ymd(new Date()))}>Today</button>}
    </div>
    <div className="dim sm" style={{ margin: '8px 0 2px' }}>
      For {loc.name || 'your location'} · times in {zone || 'local time'} · calculated on this device, no internet needed
    </div>

    {!data && !err && <Spin t="Calculating the panchang" />}
    {err && <Err error={err} retry={() => setRunId((n) => n + 1)} />}
    {data && (<>
      <Card style={{ marginTop: 10 }}>
        <div className="chead">{DAYS[data.weekdayIdx]} · {new Date(data.date.y, data.date.m - 1, data.date.d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 27, lineHeight: 1.15 }} className="gradtext">
          {data.tithi.paksha} {data.tithi.name}
          <span className="f-dev" lang="hi" style={{ fontSize: 19 }}> · {data.tithi.pakshaHi} {data.tithi.nameHi}</span>
        </div>
        <div className="dim sm" style={{ marginTop: 4 }}>
          {data.hindu ? <>Hindu month <b style={{ color: 'var(--fg)' }}>{data.hindu.month}</b> · Vikram Samvat {data.hindu.vikramSamvat} · </> : null}
          Tithi ends {tf(data.tithi.ends)}
        </div>
        {isToday && now && (
          <div className="src" style={{ marginTop: 8 }}><span className="dot" />
            <span>Right now: {now.paksha} {now.tithiName} · {now.nakshatra} nakshatra · {now.yoga} yoga</span></div>)}
      </Card>

      <div className="stats" style={{ marginTop: 10 }}>
        <Stat l="Nakshatra" v={data.nakshatra.name} s={`Pada ${data.nakshatra.pada} · ends ${tf(data.nakshatra.ends)}`} />
        <Stat l="Yoga" v={data.yoga.name} s={`ends ${tf(data.yoga.ends)}`} />
        <Stat l="Karana" v={data.karana.name} s="half-tithi" />
        <Stat l="Moon in" v={RASHI_NAMES[data.moonSign]} s="sidereal sign" />
        <Stat l="Sunrise" v={tf(data.sunrise)} s={`sunset ${tf(data.sunset)}`} />
        <Stat l="Day length" v={`${Math.floor(data.dayLengthMs / 3600000)}h ${Math.round(data.dayLengthMs / 60000) % 60}m`} s={`solar noon ${tf(data.solarNoon)}`} />
      </div>

      <Card style={{ marginTop: 10 }}>
        <div className="chead"><Icon n="sun" size={14} /> Shubh muhurat</div>
        <div className="kv"><span>Abhijit Muhurat{inWin(data.abhijit) && <b style={{ color: 'var(--green)' }}> · running now</b>}<br />
          <span className="dim sm">The midday window, counted shubh for starting new work{data.weekdayIdx === 3 ? ' — not counted on Wednesdays in some traditions' : ''}</span></span>
          <b className="tnum">{tf(data.abhijit.start)} – {tf(data.abhijit.end)}</b></div>
        <div className="kv"><span>Brahma Muhurat<br /><span className="dim sm">The quiet stretch before sunrise, for prayer and study</span></span>
          <b className="tnum">{tf(data.brahma.start)} – {tf(data.brahma.end)}</b></div>
      </Card>

      <Card style={{ marginTop: 10 }}>
        <div className="chead"><Icon n="warn" size={14} /> Times to avoid for new beginnings</div>
        {kaalRow('Rahu Kaal', data.kaal.rahu, 'Segment ' + data.kaal.rahu.seg + ' of the daylight')}
        {kaalRow('Yamaganda', data.kaal.yama, 'Segment ' + data.kaal.yama.seg + ' of the daylight')}
        {kaalRow('Gulika Kaal', data.kaal.gulika, 'Segment ' + data.kaal.gulika.seg + ' of the daylight')}
        <div className="dim sm" style={{ marginTop: 8 }}>
          Each window is one eighth of the time between sunrise and sunset, placed by the weekday — the same
          reckoning printed panchangs use. Ayanamsa: Lahiri {data.ayanamsa.toFixed(2)}°.
        </div>
      </Card>
    </>)}
  </>);
}

export default Panchang;
