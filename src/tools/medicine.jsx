/**
 * Medicine — every medicine in the world, with real detail.
 *
 * WHAT CHANGED AND WHY
 *   The previous version searched the resolver `/api/search`, which returns only
 *   { id, name, price }. Eight detail endpoints were probed; none exist. So
 *   opening a medicine showed a price and nothing else — no uses, no dosage,
 *   no warnings. "Livosiz 5mg" returned nothing at all.
 *
 *   Now the tool searches a local index of 253,802 Indian brands (name, MRP,
 *   manufacturer, pack, composition, availability) built from
 *   junioralive/Indian-Medicine-Dataset, with uses + side effects + product
 *   photos merged in from dmedhi/indian-medicines. On top of that every
 *   medicine is enriched live with:
 *     · openFDA drug labels — up to 26 sections of official prescribing text
 *     · RxNav / RxNorm      — normalised generic name and ATC drug class
 *     · substitute finder   — the cheapest brands sharing the exact salt
 *
 *   Search works offline once a shard is cached, so it never shows a blank
 *   screen because a network call failed.
 */
import React, { useEffect, useRef, useState } from 'react';
import { searchMedicines, substitutes, fdaLabel, rxInfo, genericOf, clinicalFor,
         meta as medMeta, FDA_SECTIONS } from '../core/medicines';
import { Card, Spin, Empty } from '../ui/kit';
import { Icon } from '../ui/icons';

const money = (n) => (n ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—');

/** "Sleepiness Fatigue Dryness in mouth" -> chips, without shredding phrases. */
function splitEffects(s) {
  if (!s) return [];
  const t = String(s).replace(/\s+/g, ' ').trim();
  if (t.includes(',')) return t.split(',').map((x) => x.trim()).filter(Boolean);
  // dataset joins items with a capital letter and no separator
  return t.split(/(?=[A-Z][a-z])/).map((x) => x.trim()).filter((x) => x.length > 2);
}

export function Medicine() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const [stats, setStats] = useState(null);
  const seq = useRef(0);

  useEffect(() => { medMeta().then(setStats).catch(() => {}); }, []);

  // debounced live search — the shard is one small fetch, so typing is fine
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchMedicines(term, { limit: 80 });
        if (my === seq.current) setHits(r);
      } catch {
        if (my === seq.current) setHits([]);
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (sel) return <Detail med={sel} onBack={() => setSel(null)} />;

  return (<>
    <div className="fld">
      <label>Search {stats ? stats.total.toLocaleString('en-IN') : '253,802'} medicines</label>
      <div className="ip-wrap">
        <Icon n="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="Levosiz 5mg, Dolo 650, paracetamol…" enterKeyHint="search" />
        {q && <button className="ip-x" onClick={() => setQ('')} aria-label="Clear"><Icon n="x" size={16} /></button>}
      </div>
    </div>

    <div className="cats">
      {['Levosiz 5mg', 'Dolo 650', 'Augmentin 625', 'Montek LC', 'Pan 40', 'Zincovit', 'Combiflam']
        .map((s) => <button key={s} className="cat" onClick={() => setQ(s)}>{s}</button>)}
    </div>

    {busy && !hits && <Spin t="Searching" />}
    {hits?.length === 0 && <Empty t={`No medicine matches "${q}"`} />}

    {hits?.length > 0 && (<>
      <div className="dim sm" style={{ margin: '10px 0 8px' }}>
        {hits.length}{hits.length === 80 ? '+' : ''} results
      </div>
      <div className="list">
        {hits.map((m) => (
          <button className="row" key={m.id} onClick={() => setSel(m)}
            style={{ background: 'none', border: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--s3)',
              display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--green)' }}>
              <Icon n="pill" size={20} />
            </div>
            <div className="main">
              <b style={{ fontSize: 13.5 }}>{m.name}</b>
              <span className="dim sm">{m.comp || m.mfr}</span>
            </div>
            <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
              <b style={{ color: 'var(--green)', fontSize: 13.5 }}>{money(m.price)}</b>
              {m.discontinued && <div className="tag w" style={{ marginTop: 3 }}>discontinued</div>}
            </div>
          </button>))}
      </div>
    </>)}

    {!hits && (
      <div className="src" style={{ marginTop: 16 }}><span className="dot" />
        <span>{stats ? `${stats.total.toLocaleString('en-IN')} brands · ${stats.salts.toLocaleString('en-IN')} compositions` : 'Loading index'}
          {' '}· prices in INR · clinical detail from openFDA and RxNorm. Not medical advice.</span></div>)}
  </>);
}

/* ------------------------------------------------------------------ detail */
function Detail({ med, onBack }) {
  const [sub, setSub] = useState(undefined);
  const [fda, setFda] = useState(undefined);
  const [rx, setRx] = useState(undefined);
  const [clin, setClin] = useState(undefined);
  const [openSec, setOpenSec] = useState({});

  useEffect(() => {
    let live = true;
    setSub(undefined); setFda(undefined); setRx(undefined); setClin(undefined);
    // uses/side-effects: this pack's own text, else a sibling with the same salt
    clinicalFor(med).then((v) => live && setClin(v)).catch(() => live && setClin(null));
    substitutes(med.comp, med.price).then((v) => live && setSub(v)).catch(() => live && setSub(null));
    fdaLabel(med.comp || med.name).then((v) => live && setFda(v)).catch(() => live && setFda(null));
    rxInfo(med.comp || med.name).then((v) => live && setRx(v)).catch(() => live && setRx(null));
    return () => { live = false; };
  }, [med.id]);

  const uses = splitEffects(clin?.uses || med.uses);
  const side = splitEffects(clin?.side || med.side);
  const borrowed = clin?.from;
  const generic = genericOf(med.comp || med.name);
  const sections = fda ? FDA_SECTIONS.filter(([k]) => fda[k]?.length) : [];

  return (<>
    <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 10 }}>
      <Icon n="back" size={15} /> All results
    </button>

    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {med.img
          ? <img src={med.img} alt="" loading="lazy"
              style={{ width: 68, height: 68, borderRadius: 11, objectFit: 'cover',
                       background: 'var(--s3)', flex: '0 0 auto' }}
              onError={(e) => { e.target.style.display = 'none'; }} />
          : <div style={{ width: 68, height: 68, borderRadius: 11, background: 'var(--s3)',
              display: 'grid', placeItems: 'center', flex: '0 0 auto', color: 'var(--green)' }}>
              <Icon n="pill" size={30} /></div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{med.name}</div>
          {med.comp && <div className="dim sm" style={{ marginTop: 3 }}>{med.comp}</div>}
          <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {med.price > 0 && <span className="tag g">{money(med.price)}</span>}
            {med.pack && <span className="tag">{med.pack}</span>}
            <span className={`tag ${med.discontinued ? 'w' : 'c'}`}>
              {med.discontinued ? 'Discontinued' : 'Available'}</span>
          </div>
        </div>
      </div>
      {med.mfr && (
        <div className="kv" style={{ marginTop: 12 }}>
          <span>Manufacturer</span><b>{med.mfr}</b>
        </div>)}
      {rx?.name && rx.name.toLowerCase() !== generic && (
        <div className="kv"><span>Generic name</span><b>{rx.name}</b></div>)}
      {rx?.classes?.length > 0 && (
        <div className="kv"><span>Drug class</span><b>{rx.classes[0]}</b></div>)}
    </Card>

    {clin === undefined && !med.uses && <Spin t="Loading uses and side effects" />}

    {uses.length > 0 && (
      <Card>
        <div className="chead"><Icon n="check" size={16} /> What it is used for</div>
        <div className="chips">{uses.map((u, i) => <span key={i} className="chip g">{u}</span>)}</div>
        {borrowed && (
          <div className="src"><span className="dot" />
            <span>Same composition as <b>{borrowed}</b> — uses apply to the salt, not the brand.</span></div>)}
      </Card>)}

    {side.length > 0 && (
      <Card>
        <div className="chead"><Icon n="warn" size={16} /> Common side effects</div>
        <div className="chips">{side.map((u, i) => <span key={i} className="chip w">{u}</span>)}</div>
        <div className="src"><span className="dot" />
          <span>Most side effects are mild and fade as your body adjusts. See a doctor if any persists.</span></div>
      </Card>)}

    {/* ---------------------------------------------------- substitutes */}
    {sub === undefined && <Spin t="Finding cheaper substitutes" />}
    {sub && sub.list.length > 1 && (
      <Card>
        <div className="chead"><Icon n="swap" size={16} /> Cheaper substitutes</div>
        <div className="dim sm" style={{ marginBottom: 8 }}>
          {sub.total} brands share this composition · {money(sub.min)} to {money(sub.max)}
        </div>
        <div className="list">
          {sub.list.filter((s) => s.name !== med.name).slice(0, 12).map((s, i) => (
            <div className="row" key={i}>
              <div className="main">
                <b style={{ fontSize: 13 }}>{s.name}</b>
                <span className="dim sm">{s.mfr}{s.pack ? ` · ${s.pack}` : ''}</span>
              </div>
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <b style={{ color: 'var(--green)' }}>{money(s.price)}</b>
                {s.savePct > 0 && <div className="tag g" style={{ marginTop: 3 }}>−{s.savePct}%</div>}
              </div>
            </div>))}
        </div>
        <div className="src"><span className="dot" />
          <span>Same salt and strength. Ask your pharmacist before switching brands.</span></div>
      </Card>)}

    {/* ------------------------------------------------------ FDA label */}
    {fda === undefined && <Spin t="Loading official drug label" />}
    {fda && sections.length > 0 && (
      <Card>
        <div className="chead"><Icon n="doc" size={16} /> Official label · {sections.length} sections</div>
        <div className="dim sm" style={{ marginBottom: 8 }}>
          US FDA prescribing information for <b>{fda._q}</b>
          {fda.openfda?.brand_name?.[0] ? ` (${fda.openfda.brand_name[0]})` : ''}
        </div>
        {sections.map(([k, label]) => {
          const text = [].concat(fda[k]).join('\n\n');
          const open = openSec[k];
          const short = text.length > 260 && !open;
          return (
            <div key={k} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <button onClick={() => setOpenSec((s) => ({ ...s, [k]: !s[k] }))}
                style={{ background: 'none', border: 0, width: '100%', textAlign: 'left',
                         cursor: 'pointer', color: 'inherit', padding: 0,
                         display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 13, color: k === 'boxed_warning' ? 'var(--bad)' : 'var(--green)', flex: 1 }}>
                  {label}</b>
                <Icon n="chevron" size={14} style={{ transform: open ? 'rotate(90deg)' : '', opacity: .6 }} />
              </button>
              <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {short ? text.slice(0, 260).trim() + '…' : text}
              </div>
            </div>);
        })}
        <div className="src"><span className="dot" />
          <span>Source: openFDA drug label API. US labelling may differ from the Indian pack.</span></div>
      </Card>)}

    {fda === null && uses.length === 0 && (
      <Card>
        <div className="chead"><Icon n="info" size={16} /> No detailed label found</div>
        <div className="dim sm">
          This brand is in the Indian price index but no matching FDA label exists for
          <b> {generic}</b>. The composition, price and manufacturer above are real.
        </div>
      </Card>)}

    <div className="src" style={{ marginTop: 14 }}><span className="dot" />
      <span><b>Not medical advice.</b> Prices are indicative MRP and change. Always follow
        your doctor's prescription and read the pack insert.</span></div>
  </>);
}
