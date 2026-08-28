#!/usr/bin/env python3
"""
Is anything this app depends on broken today?

WHY THIS EXISTS
---------------
Every source in this project was verified on the day it was added, and that
verification decays. Providers get bought, rate-limited, moved behind a key, or
quietly return an empty list forever. The failures that matter are the silent
ones: a search that answers 200 with zero rows looks healthy to a browser and
looks broken to a user.

So this is the one thing to run when something "feels off", or every few
months on principle. It reads the URLs OUT OF THE SOURCE FILES rather than
keeping its own copy, so it cannot drift away from what the app actually calls.

    python3 scripts/healthcheck.py            # everything
    python3 scripts/healthcheck.py music      # one group
    python3 scripts/healthcheck.py --json     # machine-readable

WHAT COUNTS AS HEALTHY
----------------------
Not "HTTP 200". A source is healthy when it returns USABLE CONTENT — rows in a
list, channels in a playlist, audio bytes from a stream. Several of the checks
below exist because a source once returned 200 with nothing in it and nobody
noticed for weeks.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
It does not fail the build. Third-party outages are normal and transient; a
red CI run every time somebody else has a bad afternoon teaches people to
ignore CI. It reports, clearly, and leaves the judgement to a human.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')

UA = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'),
    'Origin': 'https://jackbhai.github.io',
}
RELAY = 'https://omni-proxy.omni-jackbhai.workers.dev'


# --------------------------------------------------------------------- fetch
def fetch(url, ms=20, headers=None, cap=4_000_000):
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={**UA, **(headers or {})})
        r = urllib.request.urlopen(req, timeout=ms)
        return {
            'ok': True, 'status': r.status, 'body': r.read(cap),
            'cors': r.headers.get('Access-Control-Allow-Origin'),
            'type': (r.headers.get('Content-Type') or '')[:40],
            'ms': round((time.time() - t0) * 1000),
        }
    except Exception as e:                                   # noqa: BLE001
        return {'ok': False, 'status': None, 'body': b'', 'cors': None,
                'type': '', 'ms': round((time.time() - t0) * 1000),
                'error': str(e)[:70]}


def _songs_in(d, depth=0):
    """Find the song list, whichever envelope this particular fork wraps it in.

    The sixteen mirrors disagree: some return {success, data:[...]}, some
    {status, message, data:{results:[...]}}, some a bare array. Rather than
    encode sixteen shapes, walk until a list of dicts that look like songs
    turns up.
    """
    if depth > 6:
        return None
    if isinstance(d, list) and d and isinstance(d[0], dict):
        if set(d[0]) & {'downloadUrl', 'download_url', 'more_info', 'name', 'title'}:
            return d
    if isinstance(d, dict):
        for v in d.values():
            got = _songs_in(v, depth + 1)
            if got:
                return got
    return None


def _audio_link(row):
    """Highest-quality download address on a song row, under either field name.

    The forks disagree here too — half call it `link`, half call it `url`.
    """
    dl = row.get('downloadUrl') or row.get('download_url')
    if isinstance(dl, list) and dl:
        last = dl[-1]
        if isinstance(last, dict):
            return last.get('link') or last.get('url')
        if isinstance(last, str):
            return last
    return None


def rows_in(body):
    """How many usable rows came back, whatever shape the source uses."""
    try:
        d = json.loads(body)
    except Exception:                                        # noqa: BLE001
        return None
    if isinstance(d, list):
        return len(d)
    if not isinstance(d, dict):
        return None
    for k in ('results', 'data', 'songs', 'tracks', 'items', 'channels',
              'metas', 'articles', 'hits', 'people', 'meals', 'features',
              'entries', 'stations', 'docs'):
        v = d.get(k)
        if isinstance(v, list):
            return len(v)
        if isinstance(v, dict):
            for k2 in ('results', 'docs', 'items'):
                if isinstance(v.get(k2), list):
                    return len(v[k2])
    if 'response' in d and isinstance(d['response'], dict):
        docs = d['response'].get('docs')
        if isinstance(docs, list):
            return len(docs)
    return None


# ------------------------------------------------------- read the real URLs
def read(path):
    try:
        with open(os.path.join(SRC, path), encoding='utf-8') as fh:
            return fh.read()
    except OSError:
        return ''


def discovered():
    """Pull endpoints out of the source so this file cannot go stale."""
    out = []
    saavn = read('core/saavn.js')
    # 'mirror-audio', not 'rows'. A mirror shipped here for months answered
    # every search with a perfect row whose every download link was 404 — ten
    # songs, five quality rungs each, fifty dead addresses, and a rows-based
    # check called it healthy the whole time. So the check resolves a song and
    # then fetches the audio it was handed.
    for base, path in re.findall(r"base: '([^']+)',\s+path: '([^']+)'", saavn):
        out.append(('music', f'mirror {base.split("//")[1][:26]}',
                    f'{base}{path}pasoori&limit=2', 'mirror-audio'))
    for m in re.findall(r"const GAANA = '([^']+)'", read('core/sources.js')):
        out.append(('music', 'second catalogue', f'{m}/search?q=chaleya', 'hls'))
    for node in re.findall(r"'(https://[^']*audius[^']*)'", saavn):
        out.append(('music', f'open network {node.split("//")[1][:24]}',
                    f'{node}/v1/tracks/search?query=lofi&app_name=OmniTools&limit=2', 'rows'))

    iptv = read('core/iptv.js')
    for pid, url in re.findall(r"id: '(\w+)',\s+name: '[^']+',[^}]*?url: `([^`]+)`", iptv):
        url = url.replace('${CDN}', 'https://iptv-org.github.io/iptv')
        out.append(('tv', f'playlist {pid}', url, 'extinf'))

    src = read('core/sources.js')
    for m in re.findall(r"'(https://[^']*radio-browser[^']*)'", src):
        out.append(('radio', f'stations {m.split("//")[1][:22]}',
                    f'{m}/json/stations/topvote/3', 'rows'))
    return out


FIXED = [
    # group, label, url, expectation
    ('music', 'catalogue direct',
     'https://www.jiosaavn.com/api.php?__call=search.getResults&q=pasoori'
     '&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=2', 'rows'),
    ('music', 'public archive',
     'https://archive.org/advancedsearch.php?q=(bollywood)+AND+mediatype%3Aaudio'
     '+AND+format%3AMP3&fl%5B%5D=identifier&rows=3&output=json', 'rows'),
    ('music', 'community uploads',
     'https://api-v2.hearthis.at/search?t=bollywood&count=3', 'rows'),
    ('music', 'open-licence pool',
     'https://api.openverse.org/v1/audio/?q=bollywood&page_size=3', 'rows'),
    # Rate-limited: it answers a single query fine and returns an EMPTY list
    # — not an error — when several arrive at once, which is exactly the silent
    # failure this script exists to catch. `featured=1` is the cheapest query
    # it always answers, so a red line here means genuinely down, not busy.
    ('music', 'open catalogue',
     'https://api.jamendo.com/v3.0/tracks/?client_id=2c9a11b9&format=json'
     '&limit=3&featured=1', 'rows'),
    ('radio', 'curated broadcaster', 'https://somafm.com/channels.json', 'rows'),
    ('radio', 'fixed stream', 'https://stream.radioparadise.com/mp3-128', 'audio'),

    ('relay', 'relay alive', f'{RELAY}/?url=https%3A%2F%2Fapi.deezer.com%2Fsearch%3Fq%3Dtest%26limit%3D1', 'rows'),
    ('relay', 'relay /rss', f'{RELAY}/rss?limit=10&u=https%3A%2F%2Ffeeds.bbci.co.uk%2Fnews%2Fworld%2Frss.xml', 'rows'),
    ('relay', 'relay /search', f'{RELAY}/search?q=delhi&hl=en-IN&gl=IN&ceid=IN%3Aen&limit=10', 'rows'),
    ('relay', 'relay /surname', f'{RELAY}/surname?n=Rakheja', 'surname'),

    # The aggregator is rate-limited against datacentre IPs and the relay
    # retries, so this legitimately takes longer than everything else.
    ('news', 'aggregator IN',
     f'{RELAY}/rss?limit=10&u=https%3A%2F%2Fnews.google.com%2Frss%3Fhl%3Den-IN%26gl%3DIN%26ceid%3DIN%253Aen',
     'rows-slow'),
    ('news', 'publisher BBC',
     f'{RELAY}/rss?limit=10&u=https%3A%2F%2Ffeeds.bbci.co.uk%2Fnews%2Fworld%2Frss.xml', 'rows'),

    ('data', 'weather', 'https://api.open-meteo.com/v1/forecast?latitude=28.6&longitude=77.2&current=temperature_2m', 'json'),
    ('data', 'air quality', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6&longitude=77.2&current=us_aqi', 'json'),
    ('data', 'film index', 'https://v3-cinemeta.strem.io/meta/movie/tt15239678.json', 'json'),
    ('data', 'tv index', 'https://api.tvmaze.com/shows/1', 'json'),
    ('data', 'launches', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=2', 'rows'),
    ('data', 'people in space', 'https://ll.thespacedevs.com/2.2.0/astronaut/?limit=5&in_space=true', 'rows'),
    ('data', 'recipes', 'https://www.themealdb.com/api/json/v1/1/search.php?s=biryani', 'rows'),
    ('data', 'world bank', 'https://api.worldbank.org/v2/country/IN/indicator/SP.POP.TOTL?format=json&per_page=2', 'json'),
    ('data', 'countries', 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json', 'rows'),
    ('data', 'crypto', 'https://api.coinlore.net/api/tickers/?start=0&limit=3', 'rows'),
    ('data', 'currency', 'https://api.frankfurter.dev/v1/latest?base=INR', 'json'),
    ('data', 'my ip', 'https://ipwho.is/', 'json'),
    ('data', 'quakes', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', 'json'),
    ('data', 'medicines shard', 'https://jackbhai.github.io/omnitools/med/_meta.json', 'json'),
    ('data', 'names shard', 'https://jackbhai.github.io/omnitools/names/_meta.json', 'json'),
]


def judge(kind, r):
    """Healthy means USABLE, not merely reachable."""
    if not r['ok']:
        return False, r.get('error', 'unreachable')
    if r['status'] != 200:
        return False, f"HTTP {r['status']}"
    body = r['body']
    if kind == 'audio':
        # A live stream has no end; judging it on Content-Type alone avoids
        # sitting there reading it. An earlier version pulled 400 KB and took
        # 16 seconds to say "yes, this is audio".
        good = 'audio' in r['type'] or 'mpegurl' in r['type'] or len(body) > 2000
        return bool(good), r['type'] or f'{len(body)}b'
    if kind == 'extinf':
        n = body.decode('utf-8', 'ignore').count('#EXTINF')
        return n > 10, f'{n} channels'
    if kind == 'mirror-audio':
        # Search first, then prove the link it returned actually serves bytes.
        try:
            d = json.loads(body)
        except Exception:                                    # noqa: BLE001
            return False, 'not json'
        rows = _songs_in(d)
        if not rows:
            return False, 'no songs'
        link = _audio_link(rows[0])
        if not link:
            return False, 'no download link'
        a = fetch(link, 20, {'Range': 'bytes=0-2000'}, 4000)
        if a['status'] not in (200, 206):
            return False, f'search ok, AUDIO {a["status"] or a["error"]}'
        return len(a['body']) > 500, f'audio {a["status"]} {a["type"][:18]}'
    if kind == 'hls':
        # An HLS source is only healthy if the master playlist parses AND a
        # real media segment comes back — the master alone proves nothing.
        try:
            rows = (json.loads(body) or {}).get('data') or []
        except Exception:                                    # noqa: BLE001
            return False, 'not json'
        if not rows:
            return False, 'no songs'
        mus = rows[0].get('music') or {}
        master = mus.get('very_high') or mus.get('high') or ''
        if not master:
            return False, 'no stream link'
        m = fetch(master, 20, None, 200_000)
        if m['status'] != 200:
            return False, f'master {m["status"] or m["error"]}'
        lines = [l.strip() for l in m['body'].decode('utf-8', 'ignore').splitlines()
                 if l.strip() and not l.startswith('#')]
        if not lines:
            return False, 'empty master'
        child = master.split('?')[0].rsplit('/', 1)[0] + '/' + lines[0]
        c = fetch(child, 20, None, 200_000)
        segs = [l.strip() for l in c['body'].decode('utf-8', 'ignore').splitlines()
                if l.strip() and not l.startswith('#')]
        if not segs:
            return False, f'child {c["status"]}, no segments'
        s = fetch(child.rsplit('/', 1)[0] + '/' + segs[0], 20, None, 400_000)
        return len(s['body']) > 50_000, f'segment {len(s["body"]) // 1024}KB'
    if kind == 'surname':
        try:
            d = json.loads(body)
            n = max((d.get('surname') or {}).get('people', 0),
                    (d.get('given') or {}).get('people', 0))
            return n > 0, f'{n} people'
        except Exception:                                    # noqa: BLE001
            return False, 'unparsable'
    n = rows_in(body)
    if kind in ('rows', 'rows-slow'):
        # 200-with-zero-rows is the silent failure this whole script exists for
        return bool(n), (f'{n} rows' if n is not None else 'no list found')
    try:
        json.loads(body)
        return True, f'{len(body)}b'
    except Exception:                                        # noqa: BLE001
        return False, 'not json'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('group', nargs='?', default='all',
                    help='music | radio | tv | news | relay | data | all')
    ap.add_argument('--json', action='store_true', help='machine-readable output')
    args = ap.parse_args()

    checks = FIXED + discovered()
    if args.group != 'all':
        checks = [c for c in checks if c[0] == args.group]
    if not checks:
        print(f'no checks in group "{args.group}"')
        return 0

    results = []
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(fetch, url,
                          45 if kind == 'rows-slow' else 30 if kind == 'extinf' else 20,
                          None,
                          8_000 if kind == 'audio' else 4_000_000): (g, label, kind)
                for g, label, url, kind in checks}
        for fu in cf.as_completed(futs):
            g, label, kind = futs[fu]
            r = fu.result()
            ok, note = judge(kind, r)
            results.append({'group': g, 'name': label, 'ok': ok, 'note': note,
                            'ms': r['ms'], 'cors': r['cors'] == '*'})

    if args.json:
        print(json.dumps(results, indent=1))
    else:
        for g in ('relay', 'music', 'radio', 'tv', 'news', 'data'):
            rows = [r for r in results if r['group'] == g]
            if not rows:
                continue
            rows.sort(key=lambda r: (r['ok'], r['name']))
            good = sum(1 for r in rows if r['ok'])
            print(f'\n{g.upper()}  {good}/{len(rows)}')
            for r in rows:
                print(f"  {'ok ' if r['ok'] else 'BAD'} {r['name']:32s} "
                      f"{r['ms']:>6}ms  {r['note']}")

    bad = [r for r in results if not r['ok']]
    total = len(results)
    print(f"\n{'=' * 58}\n{total - len(bad)}/{total} healthy")
    if bad:
        print('\nneeds a look:')
        for r in bad:
            print(f"  {r['group']}/{r['name']}: {r['note']}")
        print('\nA handful of failures is normal — these are other people\'s\n'
              'servers. Investigate when a whole GROUP goes red, or when the\n'
              'same one fails on two different days.')
    # Never non-zero: a third-party outage must not fail anyone's build.
    return 0


if __name__ == '__main__':
    sys.exit(main())
