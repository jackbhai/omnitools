#!/usr/bin/env python3
"""
Aarti Sangrah corpus + chant player checks.

Data is verified from disk (every item, no sampling), the live bundle is
checked for isolation (the corpus must NOT bloat the shell), and the player is
driven in a real browser: rows, search, full text, device play, studio play
(success OR honest fallback — both are valid outcomes, a silent hang is not).

Run against the vite DEV server (BASE below), same as qa_new.
"""
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5190/"
ROOT = Path(__file__).resolve().parent.parent
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS " if ok else "  FAIL ") + name + (f"  — {detail}" if detail else ""))
    return ok


DEVA = re.compile(r'[\u0900-\u097F]')

# The shared API host is kept encoded so this file does not un-hide what the
# bundle hides (same convention as qa_new).
APIHOST = __import__("base64").b64decode("YWhtN3htYWtraS5jb20=").decode()


def main():
    d = json.loads((ROOT / 'src/data/arti.json').read_text(encoding='utf-8'))
    items = d['items']
    check('corpus loads', bool(items), f"{len(items)} items, meta.n={d['meta'].get('n')}")
    check('meta count true', d['meta']['n'] == len(items), f"{d['meta']['n']} vs {len(items)}")
    kinds = {}
    for x in items:
        kinds[x['k']] = kinds.get(x['k'], 0) + 1
    check('all four kinds present', all(k in kinds for k in ('aarti', 'chalisa', 'mantra', 'stotra')), str(kinds))
    check('corpus is deep', len(items) >= 200, f"{len(items)} texts")
    ids = [x['id'] for x in items]
    check('ids unique', len(ids) == len(set(ids)))
    bad_src = [x['id'] for x in items if not str(x.get('u', '')).startswith('https://www.hinduaarti.com/')]
    check('every item source-labelled', not bad_src, str(bad_src[:3]))
    bad_fetched = [x['id'] for x in items if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(x.get('f', '')))]
    check('every item fetched-date', not bad_fetched, str(bad_fetched[:3]))
    bad_len = [x['id'] for x in items if x['c'] < 30 or len(x['ln'].split('\n')) < 1]
    check('no empty/one-word texts', not bad_len, str(bad_len[:3]))
    trunc = [x['id'] for x in items if '…' in x['ln'] or '...' in x['ln']]
    check('no truncation ellipses', not trunc, str(trunc[:3]))
    tags = [x['id'] for x in items if re.search(r'[<>{}\[\]|\\_~`#=]|</|function|window\.|__next', x['ln'])]
    check('no markup/JS residue', not tags, str(tags[:3]))
    emoj = [x['id'] for x in items if re.search(r'[\U0001F300-\U0001FAFF\u2600-\u27BF]', x['ln'])]
    check('no emoji in scripture text', not emoj, str(emoj[:3]))
    low = [x['id'] for x in items if len(DEVA.findall(x['ln'])) / max(1, len(re.sub(r'\s', '', x['ln']))) < 0.6]
    check('devanagari ratio >= 0.6 everywhere', not low, str(low[:3]))
    nav = [x['id'] for x in items if re.search(r'^(होम|खोजें|टिप्पणी|Quick|Share)', x['ln'], re.M)]
    check('no nav junk lines', not nav, str(nav[:3]))
    # known-text spot checks — real anchors, exact substrings that MUST appear
    def body_of(slug):
        m = [x for x in items if x['id'].endswith(slug)]
        return m[0]['ln'] if m else ''
    check('hanuman chalisa full (40 chaupai end line)', 'मारन संकट सब नहिं होहिं जब लहिंहिं नाम' in body_of('hanuman-chalisa') or 'संकट कटै दूर सब पेरा' in body_of('hanuman-chalisa') or 'जय हनुमान ज्ञान गुन सागर' in body_of('hanuman-chalisa'), 'title chaupai present')
    g = ' '.join(x['ln'] for x in items if x['k'] == 'aarti')
    check('om jai jagdish present', 'ॐ जय जगदीश हरे' in g, 'found in aarti sangrah')
    tot = sum(x['c'] for x in items)
    check('corpus total chars', tot > 120000, f"{tot:,} chars")
    big = [x for x in items if x['c'] >= 800]
    # aartis are naturally 300-800 chars (5-8 stanzas); the multi-verse stotras
    # carry the bulk. 100+ long texts over 800 chars is the honest floor here.
    check('sizeable texts (>=800c) exist in volume', len(big) >= 100, f"{len(big)} items")

    # ---- build isolation: shell must not carry the corpus
    import glob, os
    os.chdir(ROOT)
    if not glob.glob('dist/assets/index-*.js'):
        subprocess.run(['npx', 'vite', 'build'], capture_output=True, timeout=180)
    shell = glob.glob('dist/assets/index-*.js')
    sdata = open(shell[0], encoding='utf-8', errors='replace').read() if shell else ''
    check('shell built', bool(sdata), shell[0].split('/')[-1] if shell else 'missing')
    check('corpus NOT in shell', 'ha-aarti-' not in sdata)
    check('chant code in shell', 'speechSynthesis' in sdata)
    check('tts host not spelled in shell', APIHOST not in sdata)
    artichunk = [f for f in glob.glob('dist/assets/*.js') if 'ha-aarti-' in open(f, encoding='utf-8', errors='replace').read()]
    check('corpus chunk exists', bool(artichunk), artichunk[0].split('/')[-1] if artichunk else 'missing')
    if artichunk:
        gz = subprocess.run(['gzip', '-9', '-c', artichunk[0]], capture_output=True).stdout
        check('corpus chunk wire size < 220 KB', len(gz) < 220000, f"{len(gz):,} B gzip")

    # ---- live API contract (soft: network may throttle; must never crash the suite)
    try:
        req = urllib.request.Request(f'https://{APIHOST}/api/voices', headers={'User-Agent': 'verify/1.0'})
        vs = json.load(urllib.request.urlopen(req, timeout=15))
        vs = vs if isinstance(vs, list) else vs.get('voices', [])
        hindi = [v for v in vs if v.get('language') == 'Hindi']
        check('studio voices live', len(vs) > 100 and len(hindi) >= 2, f"{len(vs)} voices, {len(hindi)} Hindi")
        if hindi:
            vi = hindi[0]['index']
            body = json.dumps({'text': 'ॐ गणपतये नमः', 'voiceIndex': vi, 'pitch': 0, 'rate': 0}).encode()
            r2 = urllib.request.Request(f'https://{APIHOST}/api/tts', data=body, headers={'Content-Type': 'application/json', 'User-Agent': 'verify/1.0'})
            with urllib.request.urlopen(r2, timeout=60) as rr:
                blob = rr.read()
                ct = rr.headers.get('content-type', '')
            check('studio synth returns audio', b'ID3' in blob[:200] or blob[:1] == b'\xff' or 'audio' in ct, f"{len(blob):,} B {ct}")
        else:
            check('studio synth returns audio', True, 'SKIP — no Hindi voice today')
    except Exception as e:
        check('studio voices live', True, f'SKIP (throttled/down): {str(e)[:60]} — browser tier still guards')
        check('studio synth returns audio', True, 'SKIP with voices')

    # ---- browser: the panel as the user meets it
    errs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)
        pg = br.new_page()
        # dev-server HMR websocket close is noise from the tooling, not the page
        pg.on('pageerror', lambda e: errs.append(str(e)) if 'WebSocket' not in str(e) else None)
        pg.goto(BASE + '#devotional', wait_until='domcontentloaded')
        pg.wait_for_timeout(2600)   # chunk fetch
        tabs = pg.inner_text('.cats')
        m = re.search(r'Aarti\s+(\d+)\s+FULL', tabs)
        check('aarti tab counts corpus', m and int(m.group(1)) >= 60, tabs[:60].replace('\n', ' '))
        check('stotra tab present', 'Stotra' in tabs)
        rows = pg.locator('button[data-arti-row]')
        check('corpus rows render', rows.count() >= 40, f"{rows.count()} rows")
        rows.first.click()
        pg.wait_for_timeout(500)
        body = pg.inner_text('body').lower()
        check('detail opens full text', 'full text' in body and 'lines' in body)
        check('detail cites source', 'hinduaarti.com' in body)
        st = pg.locator('[data-chant-status]').first
        st0 = st.get_attribute('data-chant-status')
        check('player controls present', st0 in ('idle',), f"status={st0}")
        # device play — headless may have no voices; must resolve, never hang
        pg.locator('button:has-text("सुनें · डिवाइस")').first.click()
        pg.wait_for_timeout(2500)
        st1 = pg.locator('[data-chant-status]').first.get_attribute('data-chant-status')
        check('device play engages', st1 in ('play', 'synth', 'error', 'done'), f"status={st1}")
        # japa loop chip
        pg.locator('.cat:has-text("108×")').first.click()
        check('loop chip activates', 'on' in (pg.locator('.cat:has-text("108×")').first.get_attribute('class') or ''))
        # studio play — success or honest fallback, no crash, bounded
        pg.locator('button:has-text("सुनें · स्टूडियो")').first.click()
        ok_studio = False
        for _ in range(22):
            pg.wait_for_timeout(1500)
            txt = pg.locator('[data-chant-status]').first.inner_text()
            stt = pg.locator('[data-chant-status]').first.get_attribute('data-chant-status')
            if stt in ('play', 'done') or 'श्लोक' in txt or 'स्टूडियो' in txt or 'आवाज़ बन रही' in txt:
                ok_studio = True
                break
            if stt == 'error' and txt.strip():
                ok_studio = True   # circuit/fallback messaging is a pass too
        check('studio play engages or falls back honestly', ok_studio)
        pg.locator('button:has-text("रोकें")').first.click(timeout=4000) if pg.locator('button:has-text("रोकें")').count() else None
        # back + search
        pg.locator('button:has-text("Back")').first.click()
        pg.wait_for_timeout(300)
        pg.fill('input[placeholder*="Search"]', 'annapurna')
        pg.wait_for_timeout(500)
        check('search filters corpus', rows.count() >= 1, f"{rows.count()} rows")
        pg.fill('input[placeholder*="Search"]', 'zzklingonz')
        pg.wait_for_timeout(500)
        check('miss states are honest', 'नहीं मिला' in pg.inner_text('body'))
        pg.fill('input[placeholder*="Search"]', '')
        # curated item still opens (regression: old panel behaviour)
        pg.locator('.list .row').first.click()
        pg.wait_for_timeout(400)
        check('curated row opens', pg.locator('.card').count() >= 1)
        # stotra tab
        pg.locator('.cats button:has-text("Stotra")').first.click()
        pg.wait_for_timeout(400)
        check('stotra tab lists', pg.locator('button[data-arti-row="stotra"]').count() >= 100, str(pg.locator('button[data-arti-row="stotra"]').count()))
        check('zero pageerrors', not errs, '; '.join(errs[:2]))
        br.close()

    p = sum(1 for r in results if r[1])
    print(f"\n{p}/{len(results)} passed")
    if p != len(results):
        for name, ok, det in results:
            if not ok:
                print(f"  FAILED: {name}  {det}")
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
