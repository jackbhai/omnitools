#!/usr/bin/env python3
"""
Build the names & surnames directory that ships with the app.

WHERE THE DATA COMES FROM
-------------------------
Two registers, merged, with every claim traceable to one of them:

  Wikidata  — every family name actually carried by a person recorded as an
              Indian or Pakistani citizen. Measured: 3,307 for India, 651 for
              Pakistan, each with a real bearer count (Singh 1,524, Sharma 464,
              Khan 137).
  Wikipedia — 23 surname and given-name categories (Surnames of Indian origin
              822, Punjabi-language 182, Telugu 284, Arabic 863, Indian
              masculine given names 388 …), then the opening paragraph of each
              article, which is where community, region, origin and meaning
              actually live.

WHAT IS DELIBERATELY THROWN AWAY
--------------------------------
Wikipedia titles collide. Asking for "Grover" returns the Sesame Street Muppet;
"Chhabra" returns a municipality in Rajasthan; hundreds of others return a
single footballer. Mining those for "region" produced confident, wrong answers
— Chhabra was being labelled a Rajasthan/Madhya Pradesh surname because the
TOWN is there.

So each page is classified before anything is read off it:

  name    — the prose defines a surname/given name/clan/caste. Mined fully.
  disamb  — a "may refer to" page. Proves the spelling is used, but its prose
            lists unrelated things, so NOTHING is mined from it; the entry
            keeps only its register facts and a link.
  reject  — a biography, place, company or work. Discarded entirely.

Counted over 3,535 fetched pages: 2,078 real name pages, 871 disambiguation,
586 rejected. A second pass then asked explicitly for the "(surname)" article
of everything that had no clean page, which recovered 398 more — that is how
Grover ends up correct ("a surname found with people in India as well as with
people of English ancestry") instead of blue and furry.

OUTPUT
------
public/names/ — one shard per first letter plus _meta.json. Sharding keeps the
first paint small and, just as importantly, keeps the deployed file COUNT low:
this project has already had a Pages deploy time out on file count rather than
size.

Run:  python3 scripts/build_names.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'names')
UA = {'User-Agent': 'OmniTools/1.0 (https://jackbhai.github.io/omnitools/) names directory build'}
WIKI_API = 'https://en.wikipedia.org/w/api.php'
WD = 'https://query.wikidata.org/sparql'


def http(url, headers=UA, tries=4):
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=40))
        except Exception as e:
            if i == tries - 1:
                print('   failed:', e, file=sys.stderr)
                return {}
            time.sleep(2 * (i + 1))
    return {}


def wapi(params):
    params.update({'format': 'json', 'origin': '*', 'formatversion': 2})
    return http(WIKI_API + '?' + urllib.parse.urlencode(params))


def sparql(q):
    h = dict(UA); h['Accept'] = 'application/sparql-results+json'
    return http(f'{WD}?query={urllib.parse.quote(q)}&format=json', headers=h)


# --------------------------------------------------------------------- pull
CATS = {
    'Surnames of Indian origin':       ('surname', 'IN', ''),
    'Punjabi-language surnames':       ('surname', 'IN', 'Punjabi'),
    'Surnames of Pakistani origin':    ('surname', 'PK', ''),
    'Bengali-language surnames':       ('surname', 'IN', 'Bengali'),
    'Tamil-language surnames':         ('surname', 'IN', 'Tamil'),
    'Telugu-language surnames':        ('surname', 'IN', 'Telugu'),
    'Marathi-language surnames':       ('surname', 'IN', 'Marathi'),
    'Gujarati-language surnames':      ('surname', 'IN', 'Gujarati'),
    'Kannada-language surnames':       ('surname', 'IN', 'Kannada'),
    'Malayalam-language surnames':     ('surname', 'IN', 'Malayalam'),
    'Sindhi-language surnames':        ('surname', 'PK', 'Sindhi'),
    'Nepali-language surnames':        ('surname', 'NP', 'Nepali'),
    'Odia-language surnames':          ('surname', 'IN', 'Odia'),
    'Assamese-language surnames':      ('surname', 'IN', 'Assamese'),
    'Kashmiri-language surnames':      ('surname', 'IN', 'Kashmiri'),
    'Konkani-language surnames':       ('surname', 'IN', 'Konkani'),
    'Arabic-language surnames':        ('surname', '',   'Arabic'),
    'Indian given names':              ('given',   'IN', ''),
    'Indian masculine given names':    ('given-m', 'IN', ''),
    'Indian feminine given names':     ('given-f', 'IN', ''),
    'Pakistani masculine given names': ('given-m', 'PK', ''),
    'Pakistani feminine given names':  ('given-f', 'PK', ''),
    'Hindu given names':               ('given',   'IN', 'Hindu'),
}


def category(cat):
    out, cont = [], None
    while True:
        p = {'action': 'query', 'list': 'categorymembers',
             'cmtitle': f'Category:{cat}', 'cmlimit': 500}
        if cont:
            p['cmcontinue'] = cont
        d = wapi(p)
        out += [m['title'] for m in d.get('query', {}).get('categorymembers', []) if m.get('ns') == 0]
        cont = d.get('continue', {}).get('cmcontinue')
        if not cont:
            return out
        time.sleep(.25)


def register(country_qid):
    """Family names carried by people with this citizenship, with bearer counts."""
    all_rows, off = [], 0
    while True:
        d = sparql(f'''
SELECT ?s ?label (COUNT(DISTINCT ?p) AS ?bearers) (SAMPLE(?native) AS ?nat) WHERE {{
  ?p wdt:P27 wd:{country_qid}; wdt:P734 ?s .
  ?s rdfs:label ?label FILTER(LANG(?label)="en")
  OPTIONAL {{ ?s wdt:P1705 ?native }}
}}
GROUP BY ?s ?label ORDER BY DESC(?bearers) LIMIT 1000 OFFSET {off}''')
        b = d.get('results', {}).get('bindings', [])
        all_rows += [{'n': x['label']['value'], 'b': int(x['bearers']['value']),
                      'nat': x.get('nat', {}).get('value', '')} for x in b]
        if len(b) < 1000:
            return all_rows
        off += 1000
        time.sleep(.8)


# ------------------------------------------------------------- page triage
BIO = re.compile(
    r'^\s*[A-Z][\w.\u00C0-\u024F\'-]*(?:\s+[A-Z\u00C0-\u024F][\w.\'-]*){0,4}'
    r'\s*(?:\([^)]{0,80}\))?\s*(?:,\s*[^,]{0,40},)?\s*'
    r'(?:was|is)\s+(?:an?|the)\s+(?:[a-z-]+\s+){0,3}'
    r'(actor|actress|singer|player|politician|cricketer|footballer|director|writer|poet|author|'
    r'businessman|businesswoman|character|Muppet|scientist|journalist|musician|dancer|producer|'
    r'entrepreneur|activist|filmmaker|physician|lawyer|professor|general|officer|king|emperor)\b', re.I)
THING = re.compile(
    r'^\s*[A-Z][\w.\u00C0-\u024F\'-]*(?:\s+[A-Z\u00C0-\u024F][\w.\'-]*){0,3}'
    r'\s*(?:\([^)]{0,80}\))?\s*(?:is|was|are|were)\s+(?:an?|the)\s+(?:[a-z-]+\s+){0,3}'
    r'(city|town|village|municipality|district|tehsil|taluk|state|province|region|river|mountain|'
    r'lake|island|valley|fort|temple|mosque|church|palace|company|corporation|conglomerate|firm|'
    r'bank|brand|university|college|school|hospital|airport|newspaper|magazine|channel|party|'
    r'film|movie|novel|book|song|album|band|series|game|festival|award|genus|species|dish|'
    r'inequality|equation|theorem|algorithm)\b', re.I)
NAMEY = re.compile(r'\b(sur ?name|family name|given name|male name|female name|masculine|feminine|'
                   r'patronymic|clan|caste|community)\b', re.I)
DISAMB = re.compile(r'\bmay refer to\b', re.I)


def triage(extract):
    first = re.sub(r'\s+', ' ', extract)[:400]
    if DISAMB.search(first[:120]):
        return 'disamb'
    namey = bool(NAMEY.search(first[:220]))
    if (BIO.match(first) or THING.match(first)) and not namey:
        return None
    return 'name' if namey else None


def extracts(titles, store, kinds):
    for i in range(0, len(titles), 45):
        d = wapi({'action': 'query', 'prop': 'extracts', 'exintro': 1,
                  'explaintext': 1, 'redirects': 1, 'titles': '|'.join(titles[i:i + 45])})
        for pg in d.get('query', {}).get('pages', []):
            t, e = pg.get('title'), (pg.get('extract') or '').strip()
            if not t or not e:
                continue
            k = triage(e)
            if k:
                store[t] = e; kinds[t] = k
        time.sleep(.12)


# ----------------------------------------------------------------- mining
COMM = [(r'\bBrahmin', 'Brahmin'), (r'\bKhukhrain', 'Khukhrain'), (r'\bKhatri', 'Khatri'),
        (r'\bKshatriya', 'Kshatriya'), (r'\bArora\b', 'Arora'), (r'\bJat\b', 'Jat'),
        (r'\bRajput', 'Rajput'), (r'\bKayastha', 'Kayastha'), (r'\bBania|\bBaniya', 'Bania'),
        (r'\bAgarwal|\bAgrawal', 'Agarwal'), (r'\bVaishya', 'Vaishya'), (r'\bPatidar', 'Patidar'),
        (r'\bMarwari', 'Marwari'), (r'\bReddy\b', 'Reddy'), (r'\bNair\b', 'Nair'),
        (r'\bMaratha', 'Maratha'), (r'\bYadav', 'Yadav'), (r'\bBunt\b', 'Bunt'),
        (r'\bGounder', 'Gounder'), (r'\bChettiar', 'Chettiar'), (r'\bIyengar', 'Iyengar'),
        (r'\bIyer\b', 'Iyer'), (r'\bMudaliar', 'Mudaliar'), (r'\bSikh\b', 'Sikh'),
        (r'\bJain\b', 'Jain'), (r'\bParsi', 'Parsi'), (r'\bMuslim', 'Muslim'),
        (r'\bHindu', 'Hindu'), (r'\bChristian', 'Christian'), (r'\bPashtun|\bPathan', 'Pashtun'),
        (r'\bSyed\b', 'Syed'), (r'\bSheikh\b', 'Sheikh')]
REG = [(r'\bPunjab', 'Punjab'), (r'\bSindh', 'Sindh'), (r'\bBengal', 'Bengal'),
       (r'\bGujarat', 'Gujarat'), (r'\bMaharashtra|\bMarathi', 'Maharashtra'),
       (r'\bTamil', 'Tamil Nadu'), (r'\bKerala|\bMalayal', 'Kerala'),
       (r'\bKarnataka|\bKannada', 'Karnataka'), (r'\bAndhra|\bTelangana|\bTelugu', 'Andhra & Telangana'),
       (r'\bRajasthan', 'Rajasthan'), (r'\bUttar Pradesh|\bAwadh', 'Uttar Pradesh'),
       (r'\bBihar', 'Bihar'), (r'\bOdisha|\bOdia|\bOriya', 'Odisha'), (r'\bAssam', 'Assam'),
       (r'\bKashmir', 'Kashmir'), (r'\bHaryana', 'Haryana'), (r'\bHimachal', 'Himachal'),
       (r'\bGoa\b|\bKonkan', 'Goa & Konkan'), (r'\bJharkhand', 'Jharkhand'),
       (r'\bChhattisgarh', 'Chhattisgarh'), (r'\bMadhya Pradesh', 'Madhya Pradesh'),
       (r'\bUttarakhand|\bUttrakhand', 'Uttarakhand'), (r'\bNepal', 'Nepal'),
       (r'\bPakistan', 'Pakistan'), (r'\bBangladesh', 'Bangladesh'), (r'\bSri Lanka', 'Sri Lanka')]
ORIG = [(r'\bSanskrit', 'Sanskrit'), (r'\bPersian', 'Persian'), (r'\bArabic', 'Arabic'),
        (r'\bTurkic|\bTurkish', 'Turkic'), (r'\bPortuguese', 'Portuguese'),
        (r'\bPrakrit', 'Prakrit'), (r'\bPali\b', 'Pali'), (r'\bDravidian', 'Dravidian'),
        (r'\bUrdu\b', 'Urdu'), (r'\bHebrew', 'Hebrew')]


def mine(t, pats, cap=3):
    out = []
    for pat, lab in pats:
        if re.search(pat, t, re.I) and lab not in out:
            out.append(lab)
        if len(out) >= cap:
            break
    return out


def clean(t):
    return re.sub(r'\s+', ' ', t).strip()


def meaning_of(t):
    for pat in [r'\bmean(?:s|ing)\b[^.]{4,130}\.', r'\bderived from\b[^.]{4,130}\.',
                r'\bliterally\b[^.]{4,110}\.', r'\bdenotes?\b[^.]{4,110}\.']:
        m = re.search(pat, t, re.I)
        if m and len(m.group(0)) < 165:
            return clean(m.group(0))
    return ''


def summary_of(t):
    t = clean(t)
    t = re.sub(r'\s*Notable people (?:with|bearing|include)[^.]*[.:]?.*$', '', t, flags=re.I)
    t = re.sub(r'\s*(?:People|Persons|Notable persons) with (?:the|this)[^.]*[.:]?.*$', '', t, flags=re.I)
    for s in re.split(r'(?<=\.)\s+', t):
        if re.search(r'\b(sur ?name|family name|given name|male name|female name|caste|clan)\b', s, re.I) \
           and 18 < len(s) < 260:
            return s
    return ''


SKIP = re.compile(r'^(list of|indian name|names? of|.*\bnaming\b)', re.I)
VALID = re.compile(r"^[A-Za-z][A-Za-z' .-]*$")


def normalise(title):
    return re.sub(r'\s*\((surname|name|given name|disambiguation|Indian surname)\)\s*$', '', title, flags=re.I).strip()


def main():
    print('reading Wikipedia categories…')
    rec = {}
    pages = {}
    for cat, (kind, cc, lang) in CATS.items():
        members = category(cat)
        print(f'  {cat:34s} {len(members)}')
        for title in members:
            if SKIP.match(title):
                continue
            n = normalise(title)
            if not n or len(n) < 2 or len(n) > 28 or not VALID.match(n):
                continue
            r = rec.setdefault(n, {'kind': set(), 'cc': set(), 'lang': set(), 'b': 0, 'wiki': None})
            r['kind'].add(kind)
            if cc:
                r['cc'].add(cc)
            if lang:
                r['lang'].add(lang)
            r['wiki'] = r['wiki'] or title
            pages.setdefault(title, True)

    print('reading the citizenship register…')
    for qid, cc, label in (('Q668', 'IN', 'India'), ('Q843', 'PK', 'Pakistan')):
        rows = register(qid)
        print(f'  {label:34s} {len(rows)}')
        for x in rows:
            n = normalise(x['n'])
            if len(n) < 2 or len(n) > 28 or not VALID.match(n):
                continue
            r = rec.setdefault(n, {'kind': set(), 'cc': set(), 'lang': set(), 'b': 0, 'wiki': None})
            r['kind'].add('surname'); r['cc'].add(cc)
            r['b'] = max(r['b'], x['b'])
            if x.get('nat'):
                r['nat'] = x['nat']

    print(f'{len(rec)} distinct names. Reading articles…')
    store, kinds = {}, {}
    extracts(sorted({v['wiki'] for v in rec.values() if v['wiki']}), store, kinds)
    print(f'  from category titles: {len(store)}')
    bare = [n for n in rec if kinds.get(rec[n]['wiki'] or '') != 'name' and kinds.get(n) != 'name']
    extracts(bare, store, kinds)
    print(f'  after bare titles:    {len(store)}')
    need = [n for n in rec if not any(kinds.get(k) == 'name' for k in (rec[n]['wiki'], n, f'{n} (surname)'))]
    extracts([f'{n} (surname)' for n in need], store, kinds)
    print(f'  after (surname):      {len(store)}')
    print(f"  real name pages {sum(1 for v in kinds.values() if v == 'name')} · "
          f"disambiguation {sum(1 for v in kinds.values() if v == 'disamb')}")

    def best(n, wiki):
        cands = ([wiki] if wiki else []) + [f'{n} (surname)', n, f'{n} (name)', f'{n} (given name)']
        for k in cands:
            if k and kinds.get(k) == 'name':
                return store[k], k, 'name'
        for k in cands:
            if k and kinds.get(k) == 'disamb':
                return store[k], k, 'disamb'
        return '', None, None

    rows = []
    for n, v in rec.items():
        txt, used, pk = best(n, v['wiki'])
        r = {'n': n, 'k': 'surname' if 'surname' in v['kind'] else 'given'}
        if 'given-m' in v['kind']:
            r['g'] = 'm'
        elif 'given-f' in v['kind']:
            r['g'] = 'f'
        if v['cc']:
            r['c'] = sorted(v['cc'])
        if v['lang']:
            r['l'] = sorted(v['lang'])
        if v['b']:
            r['b'] = v['b']
        if v.get('nat') and v['nat'] != n:
            r['nat'] = v['nat']
        if txt and pk == 'name':          # ONLY a real name page is mined
            for key, vals in (('comm', mine(txt, COMM)), ('reg', mine(txt, REG)), ('o', mine(txt, ORIG, 2))):
                if vals:
                    r[key] = vals
            m, s = meaning_of(txt), summary_of(txt)
            if m:
                r['m'] = m
            if s:
                r['s'] = s
            r['w'] = used
        elif used:
            r['w'] = used                 # link only, nothing claimed
        rows.append(r)

    rows.sort(key=lambda x: (-x.get('b', 0), x['n']))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))

    shards = defaultdict(list)
    for r in rows:
        shards[r['n'][0].lower()][:0] = []      # ensure key
        shards[r['n'][0].lower()].append(r)
    index, total = {}, 0
    for letter, rs in sorted(shards.items()):
        path = os.path.join(OUT, f'{letter}.json')
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(rs, fh, ensure_ascii=False, separators=(',', ':'))
        index[letter] = len(rs); total += len(rs)

    meta = {
        'total': total,
        'surnames': sum(1 for r in rows if r['k'] == 'surname'),
        'given': sum(1 for r in rows if r['k'] == 'given'),
        'withProse': sum(1 for r in rows if r.get('s')),
        'withCommunity': sum(1 for r in rows if r.get('comm')),
        'withRegion': sum(1 for r in rows if r.get('reg')),
        'withMeaning': sum(1 for r in rows if r.get('m')),
        'shards': index,
        'built': time.strftime('%Y-%m-%d'),
    }
    with open(os.path.join(OUT, '_meta.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))

    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"\n{total} names · {meta['surnames']} surnames · {meta['given']} given")
    print(f"prose {meta['withProse']} · community {meta['withCommunity']} · "
          f"region {meta['withRegion']} · meaning {meta['withMeaning']}")
    print(f'{len(index) + 1} files, {size // 1024} KB total')


if __name__ == '__main__':
    main()
