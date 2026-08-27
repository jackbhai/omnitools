/**
 * Medicine lookup with FULL clinical detail.
 *
 * WHY THIS REPLACES THE AHM7-ONLY VERSION:
 *   AHM7 /api/search returns ONLY { id, name, price } — three fields. I probed
 *   eight possible detail endpoints (?action=detail, ?id=, /detail, /medster…)
 *   and none exist, so tapping a result could never show more. The tool looked
 *   broken because the data simply wasn't there.
 *
 * SOURCES NOW (both CORS-verified from a browser origin):
 *   openFDA drug/label  — uses, dosage, warnings, do-not-use, side effects,
 *                         pregnancy advice, active/inactive ingredients
 *   RxNav (US NLM)      — normalised drug names + related brand/generic forms
 *   AHM7 /api/search    — kept for Indian brand names and INR prices
 */
import React, { useState } from 'react';
import { jget } from '../core/engine';
import { useData, Spin, Err, Empty, Src, Search, Card, Copy } from '../ui/kit';

const FDA = 'https://api.fda.gov/drug/label.json';
const RXNAV = 'https://rxnav.nlm.nih.gov/REST';

/* Common Indian names -> the generic openFDA indexes them under. */
const GENERIC = {
  paracetamol: 'acetaminophen', crocin: 'acetaminophen', dolo: 'acetaminophen',
  calpol: 'acetaminophen', combiflam: 'ibuprofen', brufen: 'ibuprofen',
  disprin: 'aspirin', ecosprin: 'aspirin', augmentin: 'amoxicillin',
  azithral: 'azithromycin', azee: 'azithromycin', pantop: 'pantoprazole',
  pan: 'pantoprazole', omez: 'omeprazole', zyrtec: 'cetirizine',
  cetzine: 'cetirizine', allegra: 'fexofenadine', montek: 'montelukast',
  shelcal: 'calcium carbonate', glycomet: 'metformin', telma: 'telmisartan',
  amlokind: 'amlodipine', atorva: 'atorvastatin', thyronorm: 'levothyroxine',
};

const clean = (v) => {
  const s = Array.isArray(v) ? v.join(' ') : String(v || '');
  return s.replace(/\s+/g, ' ').trim();
};

const SECTIONS = [
  ['purpose', 'Purpose', '🎯'],
  ['indications_and_usage', 'Uses', '💊'],
  ['dosage_and_administration', 'Dosage & directions', '📏'],
  ['active_ingredient', 'Active ingredient', '🧪'],
  ['warnings', 'Warnings', '⚠️'],
  ['do_not_use', 'Do NOT use if', '🚫'],
  ['ask_doctor', 'Ask a doctor if', '👨‍⚕️'],
  ['ask_doctor_or_pharmacist', 'Ask doctor/pharmacist', '💬'],
  ['stop_use', 'Stop use if', '🛑'],
  ['pregnancy_or_breast_feeding', 'Pregnancy / breastfeeding', '🤰'],
  ['adverse_reactions', 'Side effects', '😷'],
  ['drug_interactions', 'Drug interactions', '🔀'],
  ['keep_out_of_reach_of_children', 'Child safety', '🧒'],
  ['storage_and_handling', 'Storage', '📦'],
  ['inactive_ingredient', 'Inactive ingredients', '🧾'],
];

const medPool = [
  {
    id: 'openfda', label: 'openFDA drug label',
    async run({ q }) {
      const key = q.toLowerCase().trim();
      const generic = GENERIC[key] || GENERIC[key.split(/[\s(]/)[0]] || key;
      const tries = [
        `openfda.generic_name:"${generic}"`,
        `openfda.brand_name:"${q}"`,
        `openfda.substance_name:"${generic}"`,
      ];
      for (const s of tries) {
        try {
          const d = await jget(`${FDA}?search=${encodeURIComponent(s)}&limit=3`, { ms: 20000 });
          if (d?.results?.length) {
            return d.results.map((r) => ({
              brand: clean(r.openfda?.brand_name) || q,
              generic: clean(r.openfda?.generic_name) || generic,
              maker: clean(r.openfda?.manufacturer_name),
              type: clean(r.openfda?.product_type),
              route: clean(r.openfda?.route),
              sections: SECTIONS
                .filter(([k]) => r[k])
                .map(([k, label, icon]) => ({ key: k, label, icon, text: clean(r[k]) })),
            }));
          }
        } catch { /* next pattern */ }
      }
      throw new Error('No drug label found');
    },
  },
];

const indianPool = [
  {
    id: 'ahm7-med', label: 'AHM7 MEDSTER (India)',
    async run({ q }) {
      const d = await jget(`https://ahm7xmakki.com/api/search?q=${encodeURIComponent(q)}`, { ms: 20000 });
      const r = d?.results || [];
      if (!r.length) throw new Error('no Indian listings');
      return r;
    },
  },
];

const rxPool = [
  {
    id: 'rxnav', label: 'RxNav (NLM)',
    async run({ q }) {
      const key = q.toLowerCase().trim();
      const generic = GENERIC[key] || key;
      const id = await jget(`${RXNAV}/rxcui.json?name=${encodeURIComponent(generic)}`, { ms: 15000 });
      const rxcui = id?.idGroup?.rxnormId?.[0];
      if (!rxcui) throw new Error('not in RxNorm');
      const rel = await jget(`${RXNAV}/rxcui/${rxcui}/related.json?tty=SBD+SCD+BN`, { ms: 15000 });
      const groups = rel?.relatedGroup?.conceptGroup || [];
      const names = [];
      for (const g of groups) for (const c of g.conceptProperties || []) names.push(c.name);
      return { rxcui, names: [...new Set(names)].slice(0, 12) };
    },
  },
];

export function Medicine() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState('');
  const [open, setOpen] = useState(0);

  const fda = useData('med-fda', medPool, { q: active }, { auto: false, ttl: 864e5 });
  const ind = useData('med-in', indianPool, { q: active }, { auto: false, ttl: 864e5 });
  const rx = useData('med-rx', rxPool, { q: active }, { auto: false, ttl: 864e5 });

  const go = (v) => {
    const t = String(v ?? q).trim();
    if (!t) return;
    setActive(t); setQ(t); setOpen(0);
    fda.run({ q: t }); ind.run({ q: t }); rx.run({ q: t });
  };

  const drug = fda.data?.[open];

  return (<>
    <Search value={q} onChange={setQ} onSubmit={() => go()} ph="Medicine name, e.g. paracetamol" />
    <div className="btnrow">
      {['paracetamol', 'ibuprofen', 'azithromycin', 'pantoprazole', 'cetirizine', 'metformin'].map((m) => (
        <button key={m} className="cat" onClick={() => go(m)}>{m}</button>))}
    </div>

    {!active && <Empty t="Search a medicine for uses, dosage, warnings and side effects" />}
    {fda.loading && <Spin t="Reading drug label" />}

    {fda.data?.length > 1 && (
      <div className="cats" style={{ marginTop: 10 }}>
        {fda.data.map((d, i) => (
          <button key={i} className={`cat ${open === i ? 'on' : ''}`} onClick={() => setOpen(i)}>
            {d.brand.slice(0, 22)}
          </button>))}
      </div>)}

    {drug && (<>
      <Card>
        <div className="chead">{drug.type || 'Drug label'}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, letterSpacing: .6 }}
          className="gradtext">{drug.brand}</div>
        {drug.generic && <div className="kv" style={{ marginTop: 8 }}>
          <span>Generic</span><b>{drug.generic}</b></div>}
        {drug.route && <div className="kv"><span>Route</span><b>{drug.route}</b></div>}
        {drug.maker && <div className="kv"><span>Manufacturer</span>
          <b style={{ fontSize: 12.5 }}>{drug.maker}</b></div>}
        <div className="dim sm" style={{ marginTop: 8 }}>{drug.sections.length} label sections</div>
      </Card>

      {drug.sections.map((s) => (
        <Card key={s.key}>
          <div className="chead">{s.icon} {s.label}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.65 }}>{s.text}</p>
          <div className="btnrow"><Copy text={s.text} label="Copy" /></div>
        </Card>))}

      {rx.data?.names?.length > 0 && (
        <Card>
          <div className="chead">🔀 Related brands &amp; forms</div>
          <div className="btnrow">
            {rx.data.names.map((n, i) => (
              <span key={i} className="tag" style={{ fontSize: 11 }}>{n.slice(0, 46)}</span>))}
          </div>
          <div className="dim sm" style={{ marginTop: 8 }}>RxNorm ID {rx.data.rxcui}</div>
        </Card>)}

      {ind.data?.length > 0 && (
        <Card>
          <div className="chead">🇮🇳 Indian listings &amp; price</div>
          {ind.data.slice(0, 12).map((m, i) => (
            <div className="kv" key={i}>
              <span style={{ fontSize: 12.5 }}>{m.name}</span>
              <b style={{ color: 'var(--green)' }}>{m.price}</b>
            </div>))}
          <div className="dim sm" style={{ marginTop: 6 }}>via AHM7 MEDSTER</div>
        </Card>)}

      <div className="src">
        <span className="dot warn" />
        <span>Label data from openFDA (US FDA). Indian brands/prices from AHM7.
          Reference only — always follow your doctor or pharmacist.</span>
      </div>
      <Src meta={fda.meta} />
    </>)}

    {active && fda.error && (<>
      <Err error={fda.error} retry={() => go(active)} />
      {ind.data?.length > 0 && (
        <Card>
          <div className="chead">🇮🇳 Indian listings (no FDA label found)</div>
          {ind.data.slice(0, 15).map((m, i) => (
            <div className="kv" key={i}>
              <span style={{ fontSize: 12.5 }}>{m.name}</span>
              <b style={{ color: 'var(--green)' }}>{m.price}</b>
            </div>))}
        </Card>)}
    </>)}
  </>);
}
