#!/usr/bin/env python3
"""Build src/data/votd-pool.js — the Verse of the Day pool.

Every entry is real text with a stated source:
  · Gita    — extracted verbatim from the app's bundled chapter files
              (src/data/gita/*.json, the vedicscriptures dataset).
  · Gurbani — extracted verbatim from the app's bundled bani/shabad
              files (src/data/gurbani/*.json, BaniDB).
  · Quran   — fetched at build time from AlQuran Cloud, the same
              editions the Quran reader shows (quran-simple Arabic,
              en.asad English, ur.jalandhry Urdu).
  · Bible   — fetched at build time from the wldeh/bible-api KJV
              dataset (jsDelivr), the Bible reader's primary source.
Re-run: python3 scripts/build_votd.py
"""
import json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/data/votd-pool.js'

def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'OmniTools-build/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001 — build tool: retry then report
            last = e
    raise last

pool = []

# ---------------------------------------------------------------- Gita
GITA_PICKS = [(2, 20), (2, 47), (2, 56), (2, 14), (3, 35), (4, 7), (4, 8),
              (5, 18), (6, 5), (6, 6), (6, 47), (9, 22), (9, 27), (15, 7),
              (18, 66), (18, 78)]
for ch, v in GITA_PICKS:
    data = json.loads((ROOT / f'src/data/gita/ch-{ch:02d}.json').read_text('utf-8'))
    verse = next(x for x in data['verses'] if x['v'] == v)
    sa = re.sub(r'\|\|[^|]*\|\|\s*$', '', verse['sa']).strip()
    sa = re.sub(r'^[^|\n]+\|\s*\n', '', sa).strip()  # drop "Shri Bhagavan said |" speaker line
    pool.append({'k': 'gita', 'ref': f'Bhagavad Gita {ch}.{v}', 'go': {'tool': 'gita', 'ch': ch},
                 'text': sa, 'script': 'dev', 'translit': verse['tr'].strip(),
                 'meaning': verse['en'].strip()})
print(f'gita: {sum(1 for p in pool if p["k"] == "gita")}')

# ---------------------------------------------------------------- Gurbani
def bani_lines(name):
    return json.loads((ROOT / f'src/data/gurbani/{name}').read_text('utf-8'))['lines']

japji = bani_lines('bani-japji.json')
pool.append({'k': 'gurbani', 'ref': 'Mool Mantar · Guru Granth Sahib', 'go': {'tool': 'gurbani'},
             'text': japji[0]['g'], 'script': 'pa', 'translit': japji[0]['r'], 'meaning': japji[0]['e']})
aad = next((l for l in japji if 'aad sach' in l['r']), None)
if aad:
    pool.append({'k': 'gurbani', 'ref': 'Japji Sahib · Guru Granth Sahib', 'go': {'tool': 'gurbani'},
                 'text': aad['g'], 'script': 'pa', 'translit': aad['r'], 'meaning': aad['e']})
sukh = bani_lines('bani-sukhmani.json')
s1 = next((l for l in sukh if 'ਸੁਖਮਨੀ ਸੁਖ' in l['g']), sukh[0])
pool.append({'k': 'gurbani', 'ref': 'Sukhmani Sahib · Guru Granth Sahib', 'go': {'tool': 'gurbani'},
             'text': s1['g'], 'script': 'pa', 'translit': s1['r'], 'meaning': s1['e']})
for fn in sorted((ROOT / 'src/data/gurbani').glob('shabad-*.json')):
    d = json.loads(fn.read_text('utf-8'))
    lines = d.get('lines') or []
    if not lines:
        continue
    first = lines[0]
    title = d.get('title') or d.get('name') or 'Shabad'
    pool.append({'k': 'gurbani', 'ref': f'{title} · Guru Granth Sahib', 'go': {'tool': 'gurbani'},
                 'text': first['g'], 'script': 'pa', 'translit': first.get('r', ''), 'meaning': first.get('e', '')})
print(f'gurbani: {sum(1 for p in pool if p["k"] == "gurbani")}')

# ---------------------------------------------------------------- Quran
QURAN_PICKS = ['94:6', '94:5', '2:152', '13:28', '40:60', '3:139', '14:7', '55:13', '65:3', '2:45']
SURA_NAMES = {94: 'Ash-Sharh', 2: 'Al-Baqarah', 13: "Ar-Ra'd", 40: 'Ghafir', 3: 'Aal-e-Imran',
              14: 'Ibrahim', 55: 'Ar-Rahman', 65: 'At-Talaq'}
for ref in QURAN_PICKS:
    d = get(f'https://api.alquran.cloud/v1/ayah/{ref}/editions/quran-simple,en.asad,ur.jalandhry')
    ar, en, ur = d['data'][0]['text'], d['data'][1]['text'], d['data'][2]['text']
    s, a = ref.split(':')
    pool.append({'k': 'quran', 'ref': f'Quran {ref} · Surah {SURA_NAMES[int(s)]}',
                 'go': {'tool': 'quran', 'surah': int(s), 'ayah': int(a)},
                 'text': ar, 'script': 'ar', 'translit': ur, 'meaning': en})
print(f'quran: {sum(1 for p in pool if p["k"] == "quran")}')

# ------------------------------------------------- Bible (KJV via wldeh dataset)
# The reader's primary source: cdn.jsdelivr.net/gh/wldeh/bible-api,
# path bibles/en-kjv/books/<folder>/chapters/<n>.json (bolls.life, the
# reader's third leg, rate-limited this build, so it is not used here).
BIBLE_PICKS = [  # (book index in the reader's BIBLE_BOOKS order, folder, name, chapter, verse, plain-English gloss)
    (0, 'genesis', 'Genesis', 1, 1, 'Before anything else existed, God made the heavens and the earth.'),
    (5, 'joshua', 'Joshua', 1, 9, 'Be strong and brave — God goes with you everywhere; do not be afraid.'),
    (18, 'psalms', 'Psalm', 23, 1, 'The Lord cares for me like a shepherd; I lack nothing.'),
    (18, 'psalms', 'Psalm', 46, 1, 'God is our shelter and our strength, always near when trouble comes.'),
    (19, 'proverbs', 'Proverbs', 3, 5, 'Trust God with all your heart instead of relying only on your own understanding.'),
    (22, 'isaiah', 'Isaiah', 41, 10, 'Do not fear — God is with you, strengthens you and holds you up.'),
    (23, 'jeremiah', 'Jeremiah', 29, 11, "God's plans for you are for good — a future filled with hope."),
    (24, 'lamentations', 'Lamentations', 3, 22, "We are held up only by God's mercy, which never runs out."),
    (32, 'micah', 'Micah', 6, 8, 'What God asks is simple: act justly, love mercy, and walk humbly with Him.'),
    (39, 'matthew', 'Matthew', 11, 28, 'Come to Jesus, all who are tired and burdened, and He will give you rest.'),
    (42, 'john', 'John', 1, 1, 'Before creation, the Word already was — with God, and the Word was God.'),
    (42, 'john', 'John', 3, 16, 'God loved the world so much that He gave His only Son, so that whoever believes in Him has eternal life.'),
    (44, 'romans', 'Romans', 8, 28, 'For those who love God, He works all things together for good.'),
    (45, '1corinthians', '1 Corinthians', 13, 4, 'Real love is patient and kind; it does not envy, boast or hold on to pride.'),
    (49, 'philippians', 'Philippians', 4, 13, 'Through Christ who strengthens me, I can face anything.'),
]
cache = {}
for bidx, folder, bname, ch, v, gloss in BIBLE_PICKS:
    if (folder, ch) not in cache:
        path = f'bibles/en-kjv/books/{folder}/chapters/{ch}.json'
        try:
            d = get(f'https://cdn.jsdelivr.net/gh/wldeh/bible-api@main/{path}')
        except Exception:
            d = get(f'https://raw.githubusercontent.com/wldeh/bible-api/main/{path}')
        cache[(folder, ch)] = d.get('data') or d.get('verses')
    rows = cache[(folder, ch)]
    text = re.sub(r'<[^>]+>', '', str(rows[v - 1]['text'])).strip()
    # The wldeh KJV data glues the marginal note onto some verses
    # ("...thy God?6.8 walk...: Heb. humble thyself to walk") — the
    # note always starts with this verse's own "<ch>.<v> " marker.
    marker = f'{ch}.{v} '
    idx = text.rfind(marker)
    if idx > 10:
        text = text[:idx].rstrip()
    # A leading pilcrow is the KJV paragraph mark, noise on a card.
    text = re.sub(r'^¶\s*', '', text)
    pool.append({'k': 'bible', 'ref': f'{bname} {ch}:{v} · KJV',
                 'go': {'tool': 'bible', 'book': bidx, 'chapter': ch},
                 'text': text, 'script': 'en', 'translit': '', 'meaning': gloss})
print(f'bible: {sum(1 for p in pool if p["k"] == "bible")}')

header = """/**
 * votd-pool.js — the Verse of the Day pool. GENERATED by
 * scripts/build_votd.py; edit that script, not this file.
 * Sources: Gita + Gurbani from the app's own bundled datasets;
 * Quran from AlQuran Cloud (quran-simple / en.asad / ur.jalandhry);
 * Bible from the wldeh KJV dataset. Every text is verbatim from its source.
 */
"""
OUT.write_text(header + 'export const POOL = ' + json.dumps(pool, ensure_ascii=False, indent=1) + ';\n', 'utf-8')
print(f'wrote {OUT} with {len(pool)} entries')
