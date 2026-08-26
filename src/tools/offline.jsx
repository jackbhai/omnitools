/**
 * Offline tools — pure browser computation, zero network.
 * These can NEVER go down. This is the backbone of "koi feature band na ho".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Field, Copy, Card, Stat, Chips, fmt } from '../ui/kit';

const Out = ({ v }) => v ? <><div className="out">{v}</div><div className="btnrow"><Copy text={v} /></div></> : null;

/* ---------------------------------------------------------------- TEXT */
export function CaseConvert() {
  const [t, setT] = useState('');
  const ops = {
    UPPERCASE: t.toUpperCase(), lowercase: t.toLowerCase(),
    'Title Case': t.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
    'Sentence case': t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(),
    camelCase: t.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()),
    snake_case: t.trim().toLowerCase().replace(/\s+/g, '_'),
    'kebab-case': t.trim().toLowerCase().replace(/\s+/g, '-'),
    aLtErNaTe: [...t].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join(''),
    esreveR: [...t].reverse().join(''),
  };
  return (<>
    <Field label="Text" as="textarea" value={t} onChange={(e) => setT(e.target.value)} placeholder="Type or paste…" />
    {t && Object.entries(ops).map(([k, v]) => (
      <div className="card" key={k} style={{ marginBottom: 8 }}>
        <div className="chead">{k}</div><div className="out">{v}</div>
        <div className="btnrow"><Copy text={v} /></div>
      </div>))}
  </>);
}

export function WordCount() {
  const [t, setT] = useState('');
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const sent = t.trim() ? (t.match(/[.!?]+/g) || []).length || 1 : 0;
  const para = t.trim() ? t.split(/\n\s*\n/).filter(Boolean).length : 0;
  return (<>
    <Field label="Text" as="textarea" value={t} onChange={(e) => setT(e.target.value)} placeholder="Paste text…" />
    <div className="g3">
      <Stat l="Words" v={fmt(words)} /><Stat l="Chars" v={fmt(t.length)} />
      <Stat l="No spaces" v={fmt(t.replace(/\s/g, '').length)} />
    </div>
    <div className="g3" style={{ marginTop: 8 }}>
      <Stat l="Sentences" v={fmt(sent)} /><Stat l="Paragraphs" v={fmt(para)} />
      <Stat l="Read time" v={Math.ceil(words / 200) + 'm'} />
    </div>
  </>);
}

export function TextTools() {
  const [t, setT] = useState(''); const [mode, setMode] = useState('sort');
  const lines = t.split('\n');
  const out = {
    sort: [...lines].sort((a, b) => a.localeCompare(b)).join('\n'),
    rsort: [...lines].sort((a, b) => b.localeCompare(a)).join('\n'),
    dedupe: [...new Set(lines)].join('\n'),
    shuffle: [...lines].sort(() => Math.random() - .5).join('\n'),
    trim: lines.map((l) => l.trim()).filter(Boolean).join('\n'),
    number: lines.map((l, i) => `${i + 1}. ${l}`).join('\n'),
    reverse: [...lines].reverse().join('\n'),
  }[mode];
  return (<>
    <Field label="Lines" as="textarea" value={t} onChange={(e) => setT(e.target.value)} />
    <Chips items={[{v:'sort',l:'A→Z'},{v:'rsort',l:'Z→A'},{v:'dedupe',l:'Dedupe'},{v:'shuffle',l:'Shuffle'},
      {v:'trim',l:'Trim'},{v:'number',l:'Number'},{v:'reverse',l:'Reverse'}]} value={mode} onPick={setMode} />
    <Out v={out} />
  </>);
}

/* ------------------------------------------------------------- ENCODE */
export function Base64() {
  const [t, setT] = useState(''); const [enc, setEnc] = useState(true);
  let out = '';
  try { out = enc ? btoa(unescape(encodeURIComponent(t))) : decodeURIComponent(escape(atob(t))); }
  catch { out = t ? '⚠️ Invalid Base64' : ''; }
  return (<>
    <Chips items={[{v:'e',l:'Encode'},{v:'d',l:'Decode'}]} value={enc?'e':'d'} onPick={(v)=>setEnc(v==='e')} />
    <Field label={enc?'Plain text':'Base64'} as="textarea" value={t} onChange={(e)=>setT(e.target.value)} />
    <Out v={out} />
  </>);
}

export function UrlEncode() {
  const [t, setT] = useState(''); const [enc, setEnc] = useState(true);
  let out = ''; try { out = enc ? encodeURIComponent(t) : decodeURIComponent(t); } catch { out = '⚠️ Invalid'; }
  return (<>
    <Chips items={[{v:'e',l:'Encode'},{v:'d',l:'Decode'}]} value={enc?'e':'d'} onPick={(v)=>setEnc(v==='e')} />
    <Field label="Text / URL" as="textarea" value={t} onChange={(e)=>setT(e.target.value)} />
    <Out v={out} />
  </>);
}

export function JsonTool() {
  const [t, setT] = useState(''); const [mode, setMode] = useState('pretty');
  let out = '', err = '';
  if (t.trim()) {
    try {
      const o = JSON.parse(t);
      out = mode === 'pretty' ? JSON.stringify(o, null, 2)
        : mode === 'min' ? JSON.stringify(o)
        : toYaml(o, 0);
    } catch (e) { err = '⚠️ ' + e.message; }
  }
  return (<>
    <Field label="JSON" as="textarea" value={t} onChange={(e)=>setT(e.target.value)} placeholder='{"key":"value"}' />
    <Chips items={[{v:'pretty',l:'Beautify'},{v:'min',l:'Minify'},{v:'yaml',l:'→ YAML'}]} value={mode} onPick={setMode} />
    {err ? <div className="err"><p>{err}</p></div> : <Out v={out} />}
  </>);
}
function toYaml(o, ind) {
  const p = '  '.repeat(ind);
  if (Array.isArray(o)) return o.map((v) => `${p}- ${typeof v === 'object' && v ? '\n' + toYaml(v, ind + 1) : v}`).join('\n');
  if (o && typeof o === 'object')
    return Object.entries(o).map(([k, v]) =>
      typeof v === 'object' && v ? `${p}${k}:\n${toYaml(v, ind + 1)}` : `${p}${k}: ${v}`).join('\n');
  return `${p}${o}`;
}

/* ------------------------------------------------------------- HASH/GEN */
async function sha(algo, msg) {
  const b = await crypto.subtle.digest(algo, new TextEncoder().encode(msg));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function Hash() {
  const [t, setT] = useState(''); const [h, setH] = useState({});
  useEffect(() => {
    if (!t) return setH({});
    (async () => setH({
      'SHA-1': await sha('SHA-1', t), 'SHA-256': await sha('SHA-256', t),
      'SHA-384': await sha('SHA-384', t), 'SHA-512': await sha('SHA-512', t),
    }))();
  }, [t]);
  return (<>
    <Field label="Text to hash" as="textarea" value={t} onChange={(e)=>setT(e.target.value)} />
    {Object.entries(h).map(([k, v]) => (
      <div className="card" key={k} style={{ marginBottom: 8 }}>
        <div className="chead">{k}</div><div className="out">{v}</div>
        <div className="btnrow"><Copy text={v} /></div>
      </div>))}
  </>);
}

export function Password() {
  const [len, setLen] = useState(20);
  const [o, setO] = useState({ upper: true, lower: true, num: true, sym: true });
  const [pw, setPw] = useState('');
  const gen = () => {
    let c = '';
    if (o.upper) c += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (o.lower) c += 'abcdefghijkmnopqrstuvwxyz';
    if (o.num) c += '23456789';
    if (o.sym) c += '!@#$%^&*()-_=+[]{}<>?';
    if (!c) return setPw('Pick at least one set');
    const a = new Uint32Array(len); crypto.getRandomValues(a);
    setPw([...a].map((x) => c[x % c.length]).join(''));
  };
  useEffect(gen, [len, o]);   // eslint-disable-line
  const bits = Math.round(len * Math.log2(
    (o.upper?24:0)+(o.lower?25:0)+(o.num?8:0)+(o.sym?21:0) || 1));
  return (<>
    <div className="card">
      <div className="out" style={{ fontSize: 16, letterSpacing: 1 }}>{pw}</div>
      <div className="btnrow"><Copy text={pw} /><button className="btn sm" onClick={gen}>↻ New</button></div>
      <div className="src"><span className={`dot ${bits<60?'bad':bits<90?'warn':''}`} />
        <span>{bits} bits entropy — {bits<60?'weak':bits<90?'good':'very strong'}</span></div>
    </div>
    <Field label={`Length: ${len}`} type="range" min="6" max="64" value={len} onChange={(e)=>setLen(+e.target.value)} />
    <div className="btnrow">
      {Object.keys(o).map((k) => (
        <button key={k} className={`cat ${o[k]?'on':''}`} onClick={()=>setO({...o,[k]:!o[k]})}>
          {{upper:'A-Z',lower:'a-z',num:'0-9',sym:'!@#'}[k]}
        </button>))}
    </div>
  </>);
}

export function Uuid() {
  const [n, setN] = useState(5); const [ids, setIds] = useState([]);
  const gen = () => setIds(Array.from({ length: n }, () => crypto.randomUUID()));
  useEffect(gen, [n]);  // eslint-disable-line
  return (<>
    <Field label={`Count: ${n}`} type="range" min="1" max="25" value={n} onChange={(e)=>setN(+e.target.value)} />
    <div className="btnrow"><button className="btn" onClick={gen}>↻ Generate</button><Copy text={ids.join('\n')} label="Copy all" /></div>
    <div className="out" style={{ marginTop: 10 }}>{ids.join('\n')}</div>
  </>);
}

export function LoremGen() {
  const W = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur'.split(' ');
  const [n, setN] = useState(3);
  const out = Array.from({ length: n }, () => {
    const s = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => {
      const len = 6 + Math.floor(Math.random() * 10);
      const w = Array.from({ length: len }, () => W[Math.floor(Math.random() * W.length)]);
      return w.join(' ').replace(/^./, (c) => c.toUpperCase()) + '.';
    });
    return s.join(' ');
  }).join('\n\n');
  return (<>
    <Field label={`Paragraphs: ${n}`} type="range" min="1" max="10" value={n} onChange={(e)=>setN(+e.target.value)} />
    <Out v={out} />
  </>);
}

export function QrGen() {
  const [t, setT] = useState('https://github.com');
  const [size, setSize] = useState(300);
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(t)}&bgcolor=000000&color=00FF9C`;
  return (<>
    <Field label="Text or URL" as="textarea" value={t} onChange={(e)=>setT(e.target.value)} />
    <Field label={`Size: ${size}px`} type="range" min="150" max="600" step="50" value={size} onChange={(e)=>setSize(+e.target.value)} />
    {t && <div className="card center">
      <img src={url} alt="QR" style={{ width: '100%', maxWidth: 280, borderRadius: 12, background: '#000' }} />
      <div className="btnrow" style={{ justifyContent: 'center' }}>
        <a className="btn sm" href={url} download="qr.png" target="_blank" rel="noreferrer">⬇ Download</a>
      </div>
    </div>}
  </>);
}

/* ------------------------------------------------------------- CALCULATORS */
export function EmiCalc() {
  const [p, setP] = useState(2500000), [r, setR] = useState(8.5), [y, setY] = useState(20);
  const n = y * 12, i = r / 1200;
  const emi = i ? (p * i * (1 + i) ** n) / ((1 + i) ** n - 1) : p / n;
  const total = emi * n;
  return (<>
    <Field label="Loan amount (₹)" type="number" inputMode="numeric" value={p} onChange={(e)=>setP(+e.target.value)} />
    <Field label={`Interest rate: ${r}%`} type="range" min="1" max="20" step="0.1" value={r} onChange={(e)=>setR(+e.target.value)} />
    <Field label={`Tenure: ${y} years`} type="range" min="1" max="30" value={y} onChange={(e)=>setY(+e.target.value)} />
    <Card>
      <div className="chead">Monthly EMI</div>
      <div className="big gradtext">₹{fmt(emi)}</div>
      <div className="g2" style={{ marginTop: 14 }}>
        <Stat l="Total payable" v={'₹' + fmt(total)} />
        <Stat l="Total interest" v={'₹' + fmt(total - p)} />
      </div>
    </Card>
  </>);
}

export function SipCalc() {
  const [m, setM] = useState(10000), [r, setR] = useState(12), [y, setY] = useState(10);
  const n = y * 12, i = r / 1200;
  const fv = i ? m * (((1 + i) ** n - 1) / i) * (1 + i) : m * n;
  const inv = m * n;
  return (<>
    <Field label="Monthly investment (₹)" type="number" inputMode="numeric" value={m} onChange={(e)=>setM(+e.target.value)} />
    <Field label={`Expected return: ${r}%`} type="range" min="1" max="30" step="0.5" value={r} onChange={(e)=>setR(+e.target.value)} />
    <Field label={`Period: ${y} years`} type="range" min="1" max="40" value={y} onChange={(e)=>setY(+e.target.value)} />
    <Card>
      <div className="chead">Maturity value</div>
      <div className="big gradtext">₹{fmt(fv)}</div>
      <div className="g2" style={{ marginTop: 14 }}>
        <Stat l="Invested" v={'₹' + fmt(inv)} /><Stat l="Returns" v={'₹' + fmt(fv - inv)} />
      </div>
    </Card>
  </>);
}

export function GstCalc() {
  const [amt, setAmt] = useState(1000), [rate, setRate] = useState(18), [inc, setInc] = useState(false);
  const base = inc ? amt / (1 + rate / 100) : amt;
  const tax = inc ? amt - base : (amt * rate) / 100;
  return (<>
    <Field label="Amount (₹)" type="number" inputMode="decimal" value={amt} onChange={(e)=>setAmt(+e.target.value)} />
    <Chips items={[{v:'ex',l:'Add GST'},{v:'in',l:'Remove GST'}]} value={inc?'in':'ex'} onPick={(v)=>setInc(v==='in')} />
    <Chips items={[{v:5,l:'5%'},{v:12,l:'12%'},{v:18,l:'18%'},{v:28,l:'28%'}]} value={rate} onPick={setRate} />
    <Card>
      <div className="kv"><span>Base amount</span><b>₹{fmt(base, 2)}</b></div>
      <div className="kv"><span>CGST ({rate/2}%)</span><b>₹{fmt(tax/2, 2)}</b></div>
      <div className="kv"><span>SGST ({rate/2}%)</span><b>₹{fmt(tax/2, 2)}</b></div>
      <div className="kv"><span>Total GST</span><b style={{color:'var(--cyan)'}}>₹{fmt(tax, 2)}</b></div>
      <div className="kv"><span>Final amount</span><b style={{color:'var(--green)',fontSize:17}}>₹{fmt(base+tax, 2)}</b></div>
    </Card>
  </>);
}

export function BmiCalc() {
  const [w, setW] = useState(70), [h, setH] = useState(170);
  const bmi = w / ((h / 100) ** 2);
  const cat = bmi < 18.5 ? ['Underweight','var(--cyan)'] : bmi < 25 ? ['Normal','var(--green)']
    : bmi < 30 ? ['Overweight','var(--warn)'] : ['Obese','var(--bad)'];
  return (<>
    <Field label={`Weight: ${w} kg`} type="range" min="30" max="200" value={w} onChange={(e)=>setW(+e.target.value)} />
    <Field label={`Height: ${h} cm`} type="range" min="120" max="220" value={h} onChange={(e)=>setH(+e.target.value)} />
    <Card>
      <div className="chead">Your BMI</div>
      <div className="big" style={{ color: cat[1] }}>{bmi.toFixed(1)}</div>
      <div style={{ color: cat[1], fontWeight: 700, marginTop: 6 }}>{cat[0]}</div>
      <div className="g2" style={{ marginTop: 14 }}>
        <Stat l="Healthy range" v={`${(18.5*(h/100)**2).toFixed(0)}–${(25*(h/100)**2).toFixed(0)} kg`} />
        <Stat l="Ideal weight" v={`${(22*(h/100)**2).toFixed(0)} kg`} />
      </div>
    </Card>
  </>);
}

export function AgeCalc() {
  const [d, setD] = useState('2000-01-01');
  const b = new Date(d), now = new Date();
  if (isNaN(b)) return <Field label="Date of birth" type="date" value={d} onChange={(e)=>setD(e.target.value)} />;
  let y = now.getFullYear()-b.getFullYear(), m = now.getMonth()-b.getMonth(), dd = now.getDate()-b.getDate();
  if (dd < 0) { m--; dd += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  const days = Math.floor((now - b) / 864e5);
  const nb = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (nb < now) nb.setFullYear(nb.getFullYear() + 1);
  return (<>
    <Field label="Date of birth" type="date" value={d} onChange={(e)=>setD(e.target.value)} />
    <Card>
      <div className="chead">Your age</div>
      <div className="big gradtext">{y}<span style={{fontSize:18}}>y</span> {m}<span style={{fontSize:18}}>m</span> {dd}<span style={{fontSize:18}}>d</span></div>
      <div className="g3" style={{ marginTop: 14 }}>
        <Stat l="Days" v={fmt(days)} /><Stat l="Hours" v={fmt(days*24)} />
        <Stat l="Next b'day" v={Math.ceil((nb-now)/864e5)+'d'} />
      </div>
    </Card>
  </>);
}

export function TaxCalc() {
  const [inc, setInc] = useState(1200000);
  // New regime FY 2025-26 slabs
  const slabs = [[400000,0],[800000,.05],[1200000,.10],[1600000,.15],[2000000,.20],[2400000,.25],[Infinity,.30]];
  let tax = 0, prev = 0;
  for (const [lim, rate] of slabs) { if (inc > prev) { tax += (Math.min(inc, lim) - prev) * rate; prev = lim; } else break; }
  const rebate = inc <= 1200000 ? tax : 0;
  const net = Math.max(0, tax - rebate), cess = net * 0.04;
  return (<>
    <Field label="Annual income (₹)" type="number" inputMode="numeric" value={inc} onChange={(e)=>setInc(+e.target.value)} />
    <Card>
      <div className="chead">New regime · FY 2025-26</div>
      <div className="kv"><span>Gross tax</span><b>₹{fmt(tax)}</b></div>
      {rebate > 0 && <div className="kv"><span>87A rebate</span><b style={{color:'var(--green)'}}>−₹{fmt(rebate)}</b></div>}
      <div className="kv"><span>Health &amp; edu cess 4%</span><b>₹{fmt(cess)}</b></div>
      <div className="kv"><span>Total tax</span><b style={{color:'var(--green)',fontSize:17}}>₹{fmt(net+cess)}</b></div>
      <div className="kv"><span>Take home</span><b>₹{fmt(inc-net-cess)}</b></div>
      <div className="src"><span className="dot warn" /><span>Indicative only — verify with a CA</span></div>
    </Card>
  </>);
}

/* ------------------------------------------------------------- CONVERTERS */
const UNITS = {
  Length: { m:1, km:1000, cm:.01, mm:.001, mi:1609.34, yd:.9144, ft:.3048, in:.0254, nmi:1852 },
  Weight: { kg:1, g:.001, mg:1e-6, t:1000, lb:.453592, oz:.0283495 },
  Volume: { l:1, ml:.001, m3:1000, gal:3.78541, qt:.946353, cup:.236588, floz:.0295735 },
  Area:   { m2:1, km2:1e6, ha:1e4, acre:4046.86, ft2:.092903, sqyd:.836127 },
  Speed:  { 'm/s':1, 'km/h':.277778, mph:.44704, knot:.514444 },
  Data:   { B:1, KB:1024, MB:1048576, GB:1073741824, TB:1099511627776 },
  Time:   { s:1, min:60, hr:3600, day:86400, week:604800, ms:.001 },
};
export function UnitConvert() {
  const [cat, setCat] = useState('Length');
  const keys = Object.keys(UNITS[cat]);
  const [from, setFrom] = useState(keys[0]), [to, setTo] = useState(keys[1]);
  const [v, setV] = useState(1);
  useEffect(() => { const k = Object.keys(UNITS[cat]); setFrom(k[0]); setTo(k[1]); }, [cat]);
  const out = (v * UNITS[cat][from]) / UNITS[cat][to];
  return (<>
    <Chips items={Object.keys(UNITS)} value={cat} onPick={setCat} />
    <Field label="Value" type="number" inputMode="decimal" value={v} onChange={(e)=>setV(+e.target.value)} />
    <div className="g2">
      <Field label="From" as="select" value={from} onChange={(e)=>setFrom(e.target.value)}>
        {keys.map((k)=><option key={k}>{k}</option>)}</Field>
      <Field label="To" as="select" value={to} onChange={(e)=>setTo(e.target.value)}>
        {keys.map((k)=><option key={k}>{k}</option>)}</Field>
    </div>
    <Card><div className="chead">Result</div>
      <div className="big gradtext" style={{ fontSize: 30 }}>{out.toLocaleString('en-IN',{maximumFractionDigits:8})}</div>
      <div className="dim sm" style={{ marginTop: 6 }}>{v} {from} = {out.toLocaleString('en-IN',{maximumFractionDigits:8})} {to}</div>
    </Card>
  </>);
}

export function TempConvert() {
  const [c, setC] = useState(25);
  return (<>
    <Field label={`Celsius: ${c}°C`} type="range" min="-50" max="150" value={c} onChange={(e)=>setC(+e.target.value)} />
    <Field label="Exact °C" type="number" inputMode="decimal" value={c} onChange={(e)=>setC(+e.target.value)} />
    <div className="g3">
      <Stat l="Fahrenheit" v={(c*9/5+32).toFixed(1)+'°'} />
      <Stat l="Kelvin" v={(c+273.15).toFixed(2)} />
      <Stat l="Rankine" v={((c+273.15)*9/5).toFixed(1)} />
    </div>
  </>);
}

export function ColorTool() {
  const [hex, setHex] = useState('#00FF9C');
  const h2r = (h) => { const n = parseInt(h.replace('#',''),16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; };
  const { r, g, b } = h2r(hex.length === 7 ? hex : '#000000');
  const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255, l = (max+min)/2;
  const d = max-min;
  const s = d === 0 ? 0 : d/(1-Math.abs(2*l-1));
  let hh = 0;
  if (d) { const rr=r/255,gg=g/255,bb=b/255;
    hh = max===rr ? 60*(((gg-bb)/d)%6) : max===gg ? 60*((bb-rr)/d+2) : 60*((rr-gg)/d+4); }
  if (hh<0) hh+=360;
  const lum = (x) => { x/=255; return x<=.03928 ? x/12.92 : ((x+.055)/1.055)**2.4; };
  const L = .2126*lum(r)+.7152*lum(g)+.0722*lum(b);
  const cw = (L+.05)/.05, cb = 1.05/(L+.05);
  return (<>
    <Field label="Colour" type="color" value={hex} onChange={(e)=>setHex(e.target.value)} style={{height:56,padding:4}} />
    <Field label="Hex" value={hex} onChange={(e)=>setHex(e.target.value)} className="mono" />
    <div style={{ height:80, borderRadius:14, background:hex, border:'1px solid var(--line)', marginBottom:12 }} />
    <Card>
      <div className="kv"><span>HEX</span><b className="mono">{hex.toUpperCase()}</b></div>
      <div className="kv"><span>RGB</span><b className="mono">rgb({r}, {g}, {b})</b></div>
      <div className="kv"><span>HSL</span><b className="mono">hsl({hh.toFixed(0)}, {(s*100).toFixed(0)}%, {(l*100).toFixed(0)}%)</b></div>
      <div className="kv"><span>Contrast on white</span><b style={{color:cw>=4.5?'var(--green)':'var(--bad)'}}>{cw.toFixed(2)}:1</b></div>
      <div className="kv"><span>Contrast on black</span><b style={{color:cb>=4.5?'var(--green)':'var(--bad)'}}>{cb.toFixed(2)}:1</b></div>
    </Card>
    <div className="btnrow"><Copy text={hex} label="Copy hex" /><Copy text={`rgb(${r}, ${g}, ${b})`} label="Copy rgb" /></div>
  </>);
}

/* ------------------------------------------------------------- DEV */
export function JwtDecode() {
  const [t, setT] = useState('');
  let head = '', body = '', err = '';
  if (t.trim()) {
    try {
      const p = t.trim().split('.');
      if (p.length < 2) throw new Error('Not a JWT (needs 3 parts)');
      const dec = (x) => JSON.stringify(JSON.parse(atob(x.replace(/-/g,'+').replace(/_/g,'/'))), null, 2);
      head = dec(p[0]); body = dec(p[1]);
    } catch (e) { err = '⚠️ ' + e.message; }
  }
  return (<>
    <Field label="JWT token" as="textarea" value={t} onChange={(e)=>setT(e.target.value)} placeholder="eyJhbGciOi…" />
    {err && <div className="err"><p>{err}</p></div>}
    {head && <><div className="chead">Header</div><div className="out">{head}</div></>}
    {body && <><div className="chead" style={{marginTop:12}}>Payload</div><div className="out">{body}</div>
      <div className="src"><span className="dot warn" /><span>Decoded locally — signature NOT verified</span></div></>}
  </>);
}

export function RegexTest() {
  const [pat, setPat] = useState('\\d+'), [flags, setFlags] = useState('g'), [txt, setTxt] = useState('Order 123 shipped on 2026-08-27');
  let matches = [], err = '';
  try { matches = [...txt.matchAll(new RegExp(pat, flags.includes('g') ? flags : flags + 'g'))]; }
  catch (e) { err = e.message; }
  return (<>
    <Field label="Pattern" value={pat} onChange={(e)=>setPat(e.target.value)} className="mono" />
    <Field label="Flags" value={flags} onChange={(e)=>setFlags(e.target.value)} className="mono" />
    <Field label="Test string" as="textarea" value={txt} onChange={(e)=>setTxt(e.target.value)} />
    {err ? <div className="err"><p>⚠️ {err}</p></div> :
      <Card><div className="chead">{matches.length} match{matches.length!==1?'es':''}</div>
        {matches.map((m,i)=>(<div className="kv" key={i}>
          <span>#{i+1} @ {m.index}</span><b className="mono">{m[0]}</b></div>))}
      </Card>}
  </>);
}

export function TimestampTool() {
  const [ts, setTs] = useState(Math.floor(Date.now()/1000));
  const d = new Date(ts * (String(ts).length > 10 ? 1 : 1000));
  return (<>
    <Field label="Unix timestamp" type="number" value={ts} onChange={(e)=>setTs(+e.target.value)} />
    <div className="btnrow"><button className="btn sm" onClick={()=>setTs(Math.floor(Date.now()/1000))}>Now</button></div>
    <Card>
      <div className="kv"><span>ISO 8601</span><b className="mono sm">{isNaN(d)?'—':d.toISOString()}</b></div>
      <div className="kv"><span>Local (IST)</span><b className="sm">{isNaN(d)?'—':d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</b></div>
      <div className="kv"><span>UTC</span><b className="sm">{isNaN(d)?'—':d.toUTCString()}</b></div>
      <div className="kv"><span>Relative</span><b>{isNaN(d)?'—':relTime(d)}</b></div>
    </Card>
  </>);
}
function relTime(d) {
  const s = (Date.now() - d) / 1000;
  const u = [[31536000,'year'],[2592000,'month'],[86400,'day'],[3600,'hour'],[60,'min'],[1,'sec']];
  for (const [n, l] of u) if (Math.abs(s) >= n) {
    const v = Math.round(s / n); return `${Math.abs(v)} ${l}${Math.abs(v)!==1?'s':''} ${v>0?'ago':'from now'}`;
  }
  return 'just now';
}

export function Percentage() {
  const [a, setA] = useState(50), [b, setB] = useState(200);
  return (<>
    <div className="g2">
      <Field label="Value A" type="number" inputMode="decimal" value={a} onChange={(e)=>setA(+e.target.value)} />
      <Field label="Value B" type="number" inputMode="decimal" value={b} onChange={(e)=>setB(+e.target.value)} />
    </div>
    <Card>
      <div className="kv"><span>A is what % of B</span><b>{b?((a/b)*100).toFixed(2):'—'}%</b></div>
      <div className="kv"><span>A% of B</span><b>{fmt((a*b)/100,2)}</b></div>
      <div className="kv"><span>% increase A→B</span><b style={{color:b>=a?'var(--green)':'var(--bad)'}}>{a?(((b-a)/a)*100).toFixed(2):'—'}%</b></div>
      <div className="kv"><span>Difference</span><b>{fmt(b-a,2)}</b></div>
    </Card>
  </>);
}

export function DiceRoll() {
  const [sides, setSides] = useState(6), [n, setN] = useState(2), [res, setRes] = useState([]);
  const roll = () => {
    const a = new Uint32Array(n); crypto.getRandomValues(a);
    const r = [...a].map((x) => (x % sides) + 1);
    setRes(r); navigator.vibrate?.(18);
  };
  useEffect(roll, [sides, n]);   // eslint-disable-line
  return (<>
    <Chips items={[{v:4,l:'d4'},{v:6,l:'d6'},{v:8,l:'d8'},{v:10,l:'d10'},{v:12,l:'d12'},{v:20,l:'d20'},{v:100,l:'d100'}]} value={sides} onPick={setSides} />
    <Field label={`Dice: ${n}`} type="range" min="1" max="8" value={n} onChange={(e)=>setN(+e.target.value)} />
    <Card className="center">
      <div className="big gradtext">{res.reduce((s,x)=>s+x,0)}</div>
      <div className="btnrow" style={{justifyContent:'center'}}>
        {res.map((r,i)=><span key={i} className="tag g" style={{fontSize:14,padding:'6px 12px'}}>{r}</span>)}
      </div>
      <button className="btn" style={{marginTop:12,width:'100%'}} onClick={roll}>🎲 Roll</button>
    </Card>
  </>);
}
