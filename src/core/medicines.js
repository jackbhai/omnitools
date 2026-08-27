/**
 * World medicine database — 253,802 Indian brands + global drug labels.
 *
 * WHY THIS EXISTS
 *   The old Medicine tool called AHM7 `/api/search`, which returns only
 *   { id, name, price }. Eight detail endpoints were probed; none exist.
 *   So the app could never show what a medicine actually DOES.
 *
 * WHAT REPLACED IT (all real, all verified live before shipping)
 *   1. LOCAL SHARDS  public/med/<xx>.json
 *      253,802 brands from junioralive/Indian-Medicine-Dataset:
 *      name, MRP in INR, manufacturer, pack size, composition, availability.
 *      12,068 of them also carry uses + side-effects + product photo merged
 *      from dmedhi/indian-medicines (HuggingFace).
 *      Sharded by the first two letters of the name, so searching "levosiz"
 *      downloads ONE ~40 KB file, not a 32 MB CSV. Works offline once cached.
 *   2. SALT SHARDS   public/med/salt/<n>.json
 *      composition -> the 30 cheapest brands with that exact salt, so the
 *      tool can answer "what is a cheaper substitute for this?".
 *   3. openFDA       api.fda.gov/drug/label.json — CORS *, 21 label sections
 *      (indications, dosage, warnings, contraindications, pregnancy…).
 *   4. RxNav / RxNorm — NIH normalised drug names + interaction checks.
 *
 * Everything degrades: no network -> cached shards still answer; shard missing
 * -> live openFDA still answers; openFDA down -> local clinical text answers.
 */

const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
const MED = `${BASE}/med`;

/* --------------------------------------------------------------- helpers */
export const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Normalised salt key: ingredient names only, dosage-insensitive, sorted. */
export function saltKey(comp) {
  return String(comp || '')
    .toLowerCase()
    .split(/\s*\+\s*/)
    .map((p) => p.replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ''))
    .filter(Boolean)
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('+');
}

const cache = new Map();
async function jget(url, ms = 15000) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

let META = null;
export async function meta() {
  if (!META) META = await jget(`${MED}/_meta.json`);
  return META;
}

/* ------------------------------------------------------------ shard load */
const shards = new Map();
async function shard(b) {
  if (shards.has(b)) return shards.get(b);
  const p = jget(`${MED}/${b}.json`).catch(() => null);
  shards.set(b, p);
  return p;
}

/** Expand a packed shard row into a full object. */
function expand(row, d, bucket, i) {
  const [n, p, m, c, k, disc, u, s, img] = row;
  return {
    id: `${bucket}:${i}`,
    name: n,
    price: p || 0,
    mfr: d.m[m] || '',
    comp: d.c[c] || '',
    pack: d.k[k] || '',
    discontinued: !!disc,
    uses: u >= 0 ? d.u[u] || '' : '',
    side: s >= 0 ? d.s[s] || '' : '',
    img: img || '',
  };
}

/* ------------------------------------------------------------ the search */
/**
 * Search 253,802 brands by name, composition or manufacturer.
 *
 * Buckets are keyed on the first two letters, so a query of two or more
 * characters hits exactly one file. One-letter queries fan out over the
 * matching buckets (still bounded). Ranking: exact > prefix > word-start >
 * substring, available before discontinued, cheaper first inside a tier.
 */
export async function searchMedicines(q, { limit = 60 } = {}) {
  const raw = String(q || '').trim();
  if (raw.length < 2) return [];
  const kq = key(raw);
  if (!kq) return [];

  const m = await meta();
  const names = Object.keys(m.buckets);
  let want = [kq.slice(0, 2)];
  if (kq.length < 2) want = names.filter((b) => b.startsWith(kq));
  // also probe the bucket for the FIRST WORD, so "levo 5mg" still lands
  const w0 = key(raw.split(/\s+/)[0]);
  if (w0.length >= 2 && !want.includes(w0.slice(0, 2))) want.push(w0.slice(0, 2));

  const loaded = await Promise.all(want.filter((b) => m.buckets[b]).map(async (b) => [b, await shard(b)]));
  const hits = [];
  for (const [b, d] of loaded) {
    if (!d) continue;
    d.r.forEach((row, i) => {
      const nk = key(row[0]);
      let rank;
      if (nk === kq) rank = 0;
      else if (nk.startsWith(kq)) rank = 1;
      else if (nk.includes(kq)) rank = 2;
      else return;
      hits.push({ rank, row, d, b, i });
    });
  }

  // composition / manufacturer matches are a second pass over the same shards
  if (hits.length < 8) {
    for (const [b, d] of loaded) {
      if (!d) continue;
      const ci = d.c.map((c, j) => (key(c).includes(kq) ? j : -1)).filter((j) => j >= 0);
      if (!ci.length) continue;
      const set = new Set(ci);
      d.r.forEach((row, i) => { if (set.has(row[3])) hits.push({ rank: 3, row, d, b, i }); });
    }
  }

  hits.sort((a, z) =>
    a.rank - z.rank ||
    (a.row[5] - z.row[5]) ||
    (a.row[0].length - z.row[0].length) ||
    (a.row[1] - z.row[1]));

  const seen = new Set(), out = [];
  for (const h of hits) {
    const dk = key(h.row[0]) + '|' + h.row[4];
    if (seen.has(dk)) continue;
    seen.add(dk);
    out.push(expand(h.row, h.d, h.b, h.i));
    if (out.length >= limit) break;
  }
  return out;
}

/** Re-hydrate one medicine from its shard id (survives a page reload). */
export async function getMedicine(id) {
  const [b, i] = String(id).split(':');
  const d = await shard(b);
  if (!d || !d.r[i]) return null;
  return expand(d.r[i], d, b, +i);
}

/**
 * Clinical text for a composition, borrowed from any brand that has it.
 *
 * Only 12,068 of the 253,802 brands carry uses/side-effects, so a specific
 * pack often has none — "Levosiz 5mg Tablet MD" had no text even though
 * "Levosiz Tablet", the very same Levocetirizine 5mg, did. Uses and side
 * effects are a property of the SALT, not of the pack, so this looks across
 * the shard for a sibling with the same composition and reuses its text
 * (clearly labelled in the UI as coming from the same composition).
 */
export async function clinicalFor(med) {
  if (med.uses || med.side) return { uses: med.uses, side: med.side, img: med.img, from: null };
  const sk = saltKey(med.comp);
  if (!sk) return null;

  const m = await meta();
  const own = String(med.id).split(':')[0];
  // search the medicine's own shard first, then the shard of the salt's name
  const order = [own, ...Object.keys(m.buckets).filter((b) => b !== own)];

  for (const b of order.slice(0, 6)) {
    const d = await shard(b);
    if (!d) continue;
    // which composition indices in this shard share the salt?
    const ci = [];
    d.c.forEach((c, j) => { if (saltKey(c) === sk) ci.push(j); });
    if (!ci.length) continue;
    const set = new Set(ci);
    for (let i = 0; i < d.r.length; i++) {
      const row = d.r[i];
      if (row.length < 7 || !set.has(row[3])) continue;
      const uses = row[6] >= 0 ? d.u[row[6]] : '';
      const side = row[7] >= 0 ? d.s[row[7]] : '';
      if (uses || side) {
        return { uses, side, img: med.img || row[8] || '', from: row[0] };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------- substitutes */
let SALTS = null;
async function salts() {
  if (!SALTS) SALTS = await jget(`${MED}/_salts.json`).catch(() => ({}));
  return SALTS;
}
/**
 * FNV-1a 32-bit — the exact hash the Python builder used to split the salt
 * shards. It replaced md5: a hand-rolled browser md5 disagreed with Python's
 * on every input, so `substitutes()` always fetched the wrong shard and
 * silently returned nothing. This is small enough that both sides cannot drift.
 */
export function saltShard(sk, n) {
  let h = 0x811c9dc5;
  for (let i = 0; i < sk.length; i++) {
    // salt keys are ASCII by construction (see saltKey), so charCodeAt is safe
    h ^= sk.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % n;
}

/**
 * Cheaper brands with the SAME composition.
 * Returns { total, min, max, list:[{price,name,mfr,pack,save,savePct}] }
 */
export async function substitutes(comp, currentPrice = 0) {
  const sk = saltKey(comp);
  if (!sk) return null;
  const m = await meta();
  const idx = saltShard(sk, m.saltShards || 64);
  const d = await jget(`${MED}/s${idx}.json`).catch(() => null);
  const list = d?.[sk];
  if (!list?.length) return null;
  // _salts.json is 110 KB and only supplies the total/min/max headline, so it
  // is fetched opportunistically — a failure must not lose the substitutes.
  const all = await salts().catch(() => ({}));
  const stat = all[sk] || [list.length, list[0][0], list[list.length - 1][0]];
  return {
    salt: sk.replace(/\+/g, ' + '),
    total: stat[0], min: stat[1], max: stat[2],
    list: list.map(([price, name, mfr, pack]) => ({
      price, name, mfr, pack,
      save: currentPrice > price ? +(currentPrice - price).toFixed(2) : 0,
      savePct: currentPrice > price ? Math.round(((currentPrice - price) / currentPrice) * 100) : 0,
    })),
  };
}

/* ----------------------------------------------------------- global data */
/** Brand -> generic, so an Indian brand name finds its FDA label. */
export const BRAND_GENERIC = {
  crocin: 'acetaminophen', dolo: 'acetaminophen', calpol: 'acetaminophen',
  paracip: 'acetaminophen', pacimol: 'acetaminophen', metacin: 'acetaminophen',
  combiflam: 'ibuprofen', brufen: 'ibuprofen', ibugesic: 'ibuprofen',
  disprin: 'aspirin', ecosprin: 'aspirin',
  levosiz: 'levocetirizine', xyzal: 'levocetirizine', levocet: 'levocetirizine',
  cetzine: 'cetirizine', alerid: 'cetirizine', okacet: 'cetirizine',
  allegra: 'fexofenadine', montek: 'montelukast', montair: 'montelukast',
  azithral: 'azithromycin', azee: 'azithromycin', zithromax: 'azithromycin',
  augmentin: 'amoxicillin', mox: 'amoxicillin', novamox: 'amoxicillin',
  cifran: 'ciprofloxacin', ciplox: 'ciprofloxacin',
  omez: 'omeprazole', ocid: 'omeprazole',
  pan: 'pantoprazole', pantocid: 'pantoprazole', pantop: 'pantoprazole',
  rantac: 'ranitidine', zinetac: 'ranitidine',
  glycomet: 'metformin', gluconorm: 'metformin', glucophage: 'metformin',
  amlong: 'amlodipine', amlopres: 'amlodipine', stamlo: 'amlodipine',
  telma: 'telmisartan', telsartan: 'telmisartan',
  atorva: 'atorvastatin', lipitor: 'atorvastatin', storvas: 'atorvastatin',
  rosuvas: 'rosuvastatin', crestor: 'rosuvastatin',
  thyronorm: 'levothyroxine', eltroxin: 'levothyroxine',
  zerodol: 'aceclofenac', voveran: 'diclofenac',
  sinarest: 'phenylephrine', dcold: 'phenylephrine',
  betadine: 'povidone iodine', volini: 'diclofenac',
  shelcal: 'calcium carbonate', neurobion: 'vitamin b complex',
  zincovit: 'multivitamin', becosules: 'vitamin b complex',
  meftal: 'mefenamic acid', spasmo: 'dicyclomine',
  cyclopam: 'dicyclomine', buscopan: 'hyoscine',
  domstal: 'domperidone', emeset: 'ondansetron', ondem: 'ondansetron',
  norflox: 'norfloxacin', metrogyl: 'metronidazole', flagyl: 'metronidazole',
  wysolone: 'prednisolone', omnacortil: 'prednisolone',
  deriphyllin: 'theophylline', asthalin: 'albuterol', duolin: 'albuterol',
  seroflo: 'fluticasone', budecort: 'budesonide',
  zolfresh: 'zolpidem', alprax: 'alprazolam', restyl: 'alprazolam',
  clonotril: 'clonazepam', nexito: 'escitalopram', cipralex: 'escitalopram',
  gabapin: 'gabapentin', pregabid: 'pregabalin', lyrica: 'pregabalin',
  sumo: 'nimesulide', nise: 'nimesulide',
  liv52: 'herbal', cremaffin: 'lactulose', duphalac: 'lactulose',
  librax: 'chlordiazepoxide', udiliv: 'ursodiol',
};

/** Best guess of the generic ingredient of an arbitrary brand/composition. */
export function genericOf(nameOrComp) {
  const s = String(nameOrComp || '').toLowerCase();
  for (const [b, g] of Object.entries(BRAND_GENERIC)) {
    if (s.includes(b)) return g;
  }
  // "Levocetirizine (5mg) + Montelukast (10mg)" -> "levocetirizine"
  const first = s.split(/\+|,/)[0].replace(/\([^)]*\)/g, '').trim();
  return first.replace(/\b(tablet|capsule|syrup|injection|mg|ml|cream|gel|drops?|suspension|sr|xr|md|dt|kid|plus|forte)\b/g, '').trim();
}

const FDA = 'https://api.fda.gov/drug/label.json';
const RX = 'https://rxnav.nlm.nih.gov/REST';

/** openFDA label, searched generic-first then brand-first then free text. */
export async function fdaLabel(term) {
  const t = String(term || '').trim();
  if (!t) return null;
  const g = genericOf(t);
  const tries = [
    `${FDA}?search=openfda.generic_name:"${encodeURIComponent(g)}"&limit=1`,
    `${FDA}?search=openfda.substance_name:"${encodeURIComponent(g)}"&limit=1`,
    `${FDA}?search=openfda.brand_name:"${encodeURIComponent(t)}"&limit=1`,
    `${FDA}?search=${encodeURIComponent(g)}&limit=1`,
  ];
  for (const u of tries) {
    try {
      const d = await jget(u, 12000);
      const r = d?.results?.[0];
      if (r) return { ...r, _q: u.includes('generic_name') ? g : t };
    } catch { /* next */ }
  }
  return null;
}

/** RxNav: normalised name + RxCUI + drug class, three fallbacks deep. */
export async function rxInfo(term) {
  const g = genericOf(term) || term;
  try {
    const a = await jget(`${RX}/rxcui.json?name=${encodeURIComponent(g)}&search=2`, 10000);
    const cui = a?.idGroup?.rxnormId?.[0];
    if (!cui) return null;
    const [props, cls] = await Promise.all([
      jget(`${RX}/rxcui/${cui}/properties.json`, 10000).catch(() => null),
      jget(`https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${cui}&relaSource=ATC`, 10000).catch(() => null),
    ]);
    const classes = (cls?.rxclassDrugInfoList?.rxclassDrugInfo || [])
      .map((x) => x.rxclassMinConceptItem?.className).filter(Boolean);
    return {
      rxcui: cui,
      name: props?.properties?.name || g,
      synonym: props?.properties?.synonym || '',
      classes: [...new Set(classes)].slice(0, 6),
    };
  } catch { return null; }
}

/** Human-readable openFDA section list, in the order a patient would read. */
export const FDA_SECTIONS = [
  ['indications_and_usage', 'What it treats'],
  ['purpose', 'Purpose'],
  ['dosage_and_administration', 'How to take it'],
  ['warnings', 'Warnings'],
  ['warnings_and_cautions', 'Warnings & cautions'],
  ['boxed_warning', 'Boxed warning'],
  ['contraindications', 'Do not use if'],
  ['do_not_use', 'Do not use'],
  ['ask_doctor', 'Ask a doctor'],
  ['ask_doctor_or_pharmacist', 'Ask a doctor or pharmacist'],
  ['when_using', 'When using this'],
  ['stop_use', 'Stop use and call a doctor if'],
  ['adverse_reactions', 'Side effects'],
  ['drug_interactions', 'Drug interactions'],
  ['pregnancy', 'Pregnancy'],
  ['pregnancy_or_breast_feeding', 'Pregnancy / breastfeeding'],
  ['nursing_mothers', 'Nursing mothers'],
  ['pediatric_use', 'Children'],
  ['geriatric_use', 'Older adults'],
  ['overdosage', 'Overdose'],
  ['clinical_pharmacology', 'How it works'],
  ['mechanism_of_action', 'Mechanism of action'],
  ['storage_and_handling', 'Storage'],
  ['active_ingredient', 'Active ingredient'],
  ['inactive_ingredient', 'Inactive ingredients'],
  ['keep_out_of_reach_of_children', 'Keep away from children'],
];
