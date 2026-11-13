/**
 * Directories — the full national lists, on the device.
 *
 * PIN Code, IFSC and Blood Banks started as live lookups against one-record
 * APIs: fine for a single code, useless for "which branches are in my city"
 * and dead without signal. They now run on the complete directories —
 * 157,126 post offices, 183,214 bank branches, 2,820 blood banks — sharded
 * so a lookup fetches one small file and then answers offline forever.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as D from '../core/bigdata';
import { Icon } from '../ui/icons';
import { Card, Spin, Err, Empty, Search, Copy, fmt } from '../ui/kit';

const Tabs = ({ tabs, tab, setTab }) => (
  <div className="btnrow" style={{ marginTop: 2 }}>
    {tabs.map(([id, n]) => (
      <button key={id} className={`cat ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{n}</button>))}
  </div>);

/* ------------------------------------------------------------------- PIN */
export function PincodeFull() {
  const [tab, setTab] = useState('pin');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [meta, setMeta] = useState(null);
  const [tree, setTree] = useState(null);
  const [state, setState] = useState('');
  const [dist, setDist] = useState('');

  useEffect(() => { D.pinMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { if (tab === 'browse' && !tree) D.pinDistTree().then(setTree).catch((e) => setErr(e.message)); }, [tab, tree]);

  const goPin = async (pin) => {
    const v = String(pin || q).trim();
    if (!/^\d{6}$/.test(v)) return;
    setBusy(true); setErr(''); setRows(null);
    try { setRows(await D.pinByPin(v)); } catch (e) { setErr(e.message || 'Could not load that PIN'); }
    setBusy(false);
  };
  const goName = async () => {
    const v = q.trim();
    if (v.length < 3) return;
    setBusy(true); setErr(''); setRows(null);
    try {
      const all = await D.pinByName(v[0]);
      const lv = v.toLowerCase();
      setRows(all.filter((r) => r[0].toLowerCase().includes(lv)).slice(0, 120)
        .map((r) => ({ nameRow: r })));
    } catch (e) { setErr(e.message || 'Could not search'); }
    setBusy(false);
  };
  const goDist = async (s, d) => {
    setState(s); setDist(d); setBusy(true); setErr(''); setRows(null);
    try {
      const r = await D.pinDistrict(s, d);
      setRows(r.map((x) => ({ distRow: x })));
    } catch (e) { setErr(e.message || 'Could not load that district'); }
    setBusy(false);
  };

  return (<>
    <Tabs tabs={[['pin', 'By PIN code'], ['name', 'By office name'], ['browse', 'Browse districts']]} tab={tab} setTab={(t) => { setTab(t); setRows(null); setErr(''); }} />
    {tab !== 'browse' && (<>
      <Search value={q} onChange={setQ} onSubmit={tab === 'pin' ? () => goPin() : goName}
        ph={tab === 'pin' ? '6-digit PIN code, e.g. 110059' : 'Post office name, e.g. Uttam Nagar'} />
      <div className="btnrow">{['110001', '110059', '400001', '700001', '600001'].map((x) => (
        <button key={x} className="cat" onClick={() => { setTab('pin'); setQ(x); goPin(x); }}>{x}</button>))}</div>
    </>)}
    {tab === 'browse' && (<>
      {!tree && !err && <Spin t="Loading district list" />}
      {tree && !state && (<>
        <div className="dim sm" style={{ margin: '10px 0 6px' }}>Pick a state</div>
        <div className="btnrow">{Object.keys(tree).sort().map((s) => (
          <button key={s} className="cat" onClick={() => setState(s)}>{s}</button>))}</div>
      </>)}
      {tree && state && !dist && (<>
        <button className="btn ghost sm" onClick={() => setState('')}><Icon n="back" size={14} /> States</button>
        <div className="dim sm" style={{ margin: '10px 0 6px' }}>{state} — districts</div>
        <div className="btnrow">{Object.keys(tree[state]).sort().map((d) => (
          <button key={d} className="cat" onClick={() => goDist(state, d)}>{d} · {fmt(tree[state][d])}</button>))}</div>
      </>)}
      {dist && (<button className="btn ghost sm" onClick={() => { setDist(''); setRows(null); }}>
        <Icon n="back" size={14} /> {state} districts</button>)}
    </>)}
    {busy && <Spin />}
    {err && <Err error={err} retry={() => setErr('')} />}
    {rows && rows.length === 0 && <Empty t="Nothing found for that search" />}
    {rows && rows.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 6px' }}>{fmt(rows.length)} result(s){rows.length >= 120 ? ' — first 120 shown' : ''}</div>
      <div className="list">
        {rows.map((r, i) => r.nameRow ? (
          <button key={i} className="row uni-row" onClick={() => { setTab('pin'); setQ(r.nameRow[1]); goPin(r.nameRow[1]); }}>
            <div className="main"><b style={{ fontSize: 13.5 }}>{r.nameRow[0]}</b>
              <span className="dim sm">{r.nameRow[2]}, {r.nameRow[3]}</span></div>
            <span className="mono" style={{ color: 'var(--green)', fontSize: 12.5 }}>{r.nameRow[1]}</span>
          </button>
        ) : r.distRow ? (
          <div className="col" key={i}><b>{r.distRow[0]}</b>
            <span className="dim sm">{r.distRow[2]} · {r.distRow[3]} · PIN {r.distRow[1]}</span></div>
        ) : (
          <div className="col" key={i}><b>{r[0]}</b>
            <span className="dim sm">{r[1]} · {r[2]} · {r[3]}, {r[4]}</span>
            {(r[5] || r[6]) && <span className="dim sm">{[r[5] && `Taluk ${r[5]}`, r[6] && `Division ${r[6]}`].filter(Boolean).join(' · ')}</span>}</div>
        ))}
      </div>
    </>)}
    {meta && <div className="src"><span className="dot" /><span>{fmt(meta.offices)} post offices · {fmt(meta.pins)} PIN codes · national postal directory · works offline after first use</span></div>}
  </>);
}

/* ------------------------------------------------------------------ IFSC */
function IfscDetail({ code, onBack }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setD(null); setErr('');
    D.ifscDetail(code).then((r) => { if (alive) setD(r || 'none'); })
      .catch((e) => { if (alive) setErr(e.message || 'Could not load that branch'); });
    return () => { alive = false; };
  }, [code]);
  if (err) return <Err error={err} retry={onBack} />;
  if (!d) return <Spin t="Loading branch" />;
  if (d === 'none') return <Empty t="That IFSC is not in the directory" />;
  return (<>
    {onBack && <button className="btn ghost sm" onClick={onBack}><Icon n="back" size={14} /> Back</button>}
    <Card style={{ marginTop: 10 }}>
      <div className="chead">{d.bank}</div>
      <div className="kv"><span>Branch</span><b>{d.branch}</b></div>
      <div className="kv"><span>IFSC</span><b className="mono">{d.ifsc}</b></div>
      {d.micr && <div className="kv"><span>MICR</span><b className="mono">{d.micr}</b></div>}
      {d.swift && <div className="kv"><span>SWIFT</span><b className="mono">{d.swift}</b></div>}
      <div className="kv"><span>City</span><b>{d.city || d.centre}</b></div>
      <div className="kv"><span>District</span><b>{d.district}</b></div>
      <div className="kv"><span>State</span><b>{d.state}</b></div>
      <div className="kv"><span>Address</span><b style={{ fontWeight: 400, fontSize: 12.5 }}>{d.address}</b></div>
      {d.contact && <div className="kv"><span>Phone</span><b>{d.contact}</b></div>}
      <div className="btnrow">{[['UPI', d.upi], ['NEFT', d.neft], ['IMPS', d.imps], ['RTGS', d.rtgs]]
        .map(([k, v]) => <span key={k} className={`tag ${v ? 'g' : ''}`} style={v ? null : { opacity: .5 }}>{k}{v ? '' : ' —'}</span>)}</div>
      <div className="btnrow" style={{ marginTop: 10 }}><Copy text={d.ifsc} label="Copy IFSC" /></div>
    </Card>
  </>);
}

export function IfscFull() {
  const [tab, setTab] = useState('code');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [meta, setMeta] = useState(null);
  const [banks, setBanks] = useState(null);
  const [bankQ, setBankQ] = useState('');
  const [bankIdx, setBankIdx] = useState(null);
  const [branches, setBranches] = useState(null);
  const [branchQ, setBranchQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { D.ifscMeta().then(setMeta).catch(() => {}); }, []);
  const valid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(q.trim().toUpperCase());

  const pickBank = async (i) => {
    setBankIdx(i); setBusy(true); setErr(''); setBranches(null); setBranchQ('');
    try { setBranches(await D.ifscBrowse(i)); } catch (e) { setErr(e.message || 'Could not load branches'); }
    setBusy(false);
  };
  const shownBranches = useMemo(() => {
    if (!branches) return null;
    const v = branchQ.trim().toLowerCase();
    const f = v ? branches.filter((b) => `${b[1]} ${b[2]} ${b[3]} ${b[4]}`.toLowerCase().includes(v)) : branches;
    return f.slice(0, 150);
  }, [branches, branchQ]);

  if (open) return <IfscDetail code={open} onBack={() => setOpen('')} />;

  return (<>
    <Tabs tabs={[['code', 'By IFSC code'], ['bank', 'By bank & city']]} tab={tab} setTab={setTab} />
    {tab === 'code' && (<>
      <Search value={q} onChange={(v) => setQ(v.toUpperCase())} onSubmit={() => valid && setOpen(q.trim().toUpperCase())}
        ph="IFSC, e.g. HDFC0000001" />
      <div className="btnrow">{['HDFC0000001', 'SBIN0000001', 'ICIC0000001'].map((x) => (
        <button key={x} className="cat" onClick={() => { setQ(x); setOpen(x); }}>{x}</button>))}</div>
      {q.trim().length >= 4 && !valid && (
        <div className="dim sm" style={{ marginTop: 6 }}>An IFSC is 11 characters: 4 bank letters, 0, then 6 branch characters.</div>)}
      {!q && <Empty icon="bank" t="Enter an IFSC, or browse by bank and city" />}
    </>)}
    {tab === 'bank' && (<>
      {bankIdx === null && (<>
        <Search value={bankQ} onChange={async (v) => {
          setBankQ(v);
          if (!banks) { try { setBanks(await D.ifscBanks()); } catch (e) { setErr(e.message); } }
        }} onSubmit={() => {}} ph="Bank name, e.g. State Bank" />
        {!banks && !err && <div className="dim sm" style={{ marginTop: 8 }}>Type to load the bank list…</div>}
        {err && <Err error={err} retry={() => setErr('')} />}
        {banks && (<div className="list" style={{ marginTop: 8 }}>
          {banks.map(([n, c], i) => ({ n, c, i })).filter((b) => b.c > 0 && b.n.toLowerCase().includes(bankQ.trim().toLowerCase())).slice(0, 60)
            .map((b) => (
              <button key={b.i} className="row uni-row" onClick={() => pickBank(b.i)}>
                <div className="main"><b style={{ fontSize: 13.5 }}>{b.n}</b>
                  <span className="dim sm">{fmt(b.c)} branches</span></div>
              </button>))}
        </div>)}
      </>)}
      {bankIdx !== null && banks && (<>
        <button className="btn ghost sm" onClick={() => { setBankIdx(null); setBranches(null); }}>
          <Icon n="back" size={14} /> Banks</button>
        <div className="chead" style={{ marginTop: 8 }}>{banks[bankIdx][0]}</div>
        <Search value={branchQ} onChange={setBranchQ} onSubmit={() => {}} ph="Filter by branch or city" />
        {busy && <Spin t="Loading branches" />}
        {err && <Err error={err} retry={() => pickBank(bankIdx)} />}
        {shownBranches && (<>
          <div className="dim sm" style={{ margin: '8px 0 6px' }}>{fmt(branches.length)} branches{branchQ ? ` · ${fmt(shownBranches.length)} shown` : ''}</div>
          <div className="list">
            {shownBranches.map((b) => (
              <button key={b[0]} className="row uni-row" onClick={() => setOpen(b[0])}>
                <div className="main"><b style={{ fontSize: 13.5 }}>{b[1]}</b>
                  <span className="dim sm">{b[2]} · {b[3]}, {b[4]}</span></div>
                <span className="mono" style={{ color: 'var(--green)', fontSize: 11.5 }}>{b[0]}</span>
              </button>))}
          </div>
        </>)}
      </>)}
    </>)}
    {meta && <div className="src"><span className="dot" /><span>{fmt(meta.count)} branches · {fmt(meta.banks)} banks · national branch directory · works offline after first use</span></div>}
  </>);
}

/* ----------------------------------------------------------------- BLOOD */
export function BloodBanks() {
  const [tree, setTree] = useState(null);
  const [err, setErr] = useState('');
  const [state, setState] = useState('');
  const [dist, setDist] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => { D.bloodIndex().then(setTree).catch((e) => setErr(e.message || 'Could not load the directory')); }, []);
  const pickState = async (s) => {
    setState(s); setDist(''); setBusy(true); setErr(''); setQ('');
    try { setRows(await D.bloodState(s)); } catch (e) { setErr(e.message || 'Could not load that state'); }
    setBusy(false);
  };
  const shown = useMemo(() => {
    if (!rows) return null;
    let f = dist ? rows.filter((r) => r[1] === dist) : rows;
    const v = q.trim().toLowerCase();
    if (v) f = f.filter((r) => `${r[0]} ${r[2]}`.toLowerCase().includes(v));
    return f;
  }, [rows, dist, q]);

  return (<>
    {!tree && !err && <Spin t="Loading blood bank directory" />}
    {err && <Err error={err} retry={() => { setErr(''); D.bloodIndex().then(setTree).catch((e) => setErr(e.message)); }} />}
    {tree && !state && (<>
      <div className="dim sm" style={{ margin: '4px 0 8px' }}>Pick a state — 2,820 government-listed blood banks</div>
      <div className="btnrow">{Object.keys(tree).sort().map((s) => (
        <button key={s} className="cat" onClick={() => pickState(s)}>
          {s} · {fmt(Object.values(tree[s]).reduce((a, b) => a + b, 0))}</button>))}</div>
    </>)}
    {state && (<>
      <button className="btn ghost sm" onClick={() => { setState(''); setRows(null); setDist(''); }}>
        <Icon n="back" size={14} /> States</button>
      <div className="chead" style={{ marginTop: 8 }}>{state}</div>
      <div className="btnrow">
        <button className={`cat ${!dist ? 'on' : ''}`} onClick={() => setDist('')}>All districts</button>
        {Object.keys(tree[state]).sort().map((d) => (
          <button key={d} className={`cat ${dist === d ? 'on' : ''}`} onClick={() => setDist(d)}>{d} · {tree[state][d]}</button>))}
      </div>
      <Search value={q} onChange={setQ} onSubmit={() => {}} ph="Search bank or city" />
      {busy && <Spin />}
      {shown && (<>
        <div className="dim sm" style={{ margin: '8px 0 6px' }}>{fmt(shown.length)} blood bank(s)</div>
        {shown.length === 0 && <Empty t="No blood bank matches" />}
        <div className="list">
          {shown.slice(0, 200).map((r, i) => (
            <div className="col" key={i}>
              <b>{r[0]}</b>
              <span className="dim sm">{r[7] ? `${r[7]} · ` : ''}{r[6] || 'Blood bank'} · {r[2]}, {r[1]}</span>
              <span className="dim sm">{r[3]}{r[4] ? ` — ${r[4]}` : ''}</span>
              {r[5] && <a className="mono" style={{ fontSize: 12.5, color: 'var(--green)' }} href={`tel:${r[5].replace(/[^+\d]/g, '')}`}>{r[5]}</a>}
            </div>))}
        </div>
      </>)}
    </>)}
    <div className="src"><span className="dot" /><span>Government blood-bank directory · call ahead to confirm stock · works offline after first use</span></div>
  </>);
}
