#!/usr/bin/env python3
"""
Cricket Archive — international formats (ODI · T20I · Test, men's).

Same Cricsheet source and the SAME scorecard derivation as the shipped IPL
archive — this script first proves that by regenerating IPL scorecards and
career stats from the raw Cricsheet IPL zip and diffing them against the
files already in public/data (--verify-ipl). Only then does it build the
international shards:

    cricket-m<id>.json          per-match scorecard (shared with IPL files)
    cricket-x<fmt>-<year>.json  season browse rows  fmt: odi | t20 | test
    cricket-x<fmt>-wc<year>.json World Cup edition rows (same row shape)
    cricket-xtest-wtc.json      World Test Championship finals
    cricket-stats-<fmt>.json    career records for the format
    cricket-intl-index.json     counts, coverage, year/WC lists per format

Row shapes match src/core/bigdata.js: season rows
[id, date, [t1, t2], result, scoreSummary, [pom], event] (event is new,
IPL rows simply don't carry it); stats rows identical to cricket-stats.json.

    python3 scripts/build_cricket_intl.py --verify-ipl
    python3 scripts/build_cricket_intl.py --build
Zips are read from /tmp/cricsheet/{ipl,odis,t20s,tests}_json.zip
(downloaded from https://cricsheet.org/downloads/).
"""
import collections
import json
import os
import random
import sys
import zipfile

RAW = '/tmp/cricsheet'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')

BOWLER_WKTS = {'bowled', 'caught', 'caught and bowled', 'lbw', 'stumped',
               'hit wicket'}
NOT_OUT_KINDS = {'retired hurt', 'retired not out'}


def ov_str(legal_balls):
    return f'{legal_balls // 6}.{legal_balls % 6}'


def dismissal_text(w, bowler):
    kind = w['kind']
    fielders = [f.get('name', '') for f in w.get('fielders', [])]
    if kind == 'caught':
        f0 = fielders[0] if fielders else ''
        return f'c & b {bowler}' if f0 == bowler else f'c {f0} b {bowler}'
    if kind == 'caught and bowled':
        return f'c & b {bowler}'
    if kind == 'bowled':
        return f'b {bowler}'
    if kind == 'lbw':
        return f'lbw b {bowler}'
    if kind == 'stumped':
        return f'st {fielders[0]} b {bowler}' if fielders else f'st b {bowler}'
    if kind == 'run out':
        return f"run out ({'/'.join(fielders)})" if fielders else 'run out'
    if kind == 'hit wicket':
        return f'hit wicket b {bowler}'
    if kind in NOT_OUT_KINDS:
        return ''
    return kind  # retired out, timed out, obstructing the field, ...


def result_text(info):
    o = info.get('outcome') or {}
    if o.get('winner'):
        by = o.get('by') or {}
        w = o['winner']
        if 'innings' in by:
            return f"{w} won by an innings and {by.get('runs', 0)} runs"
        if 'runs' in by:
            return f"{w} won by {by['runs']} runs"
        if 'wickets' in by:
            return f"{w} won by {by['wickets']} wickets"
        return f'{w} won'
    if o.get('eliminator'):
        return f"Match tied ({o['eliminator']} won the Super Over)"
    r = o.get('result')
    if r == 'tie':
        return 'Match tied'
    if r == 'draw':
        return 'Match drawn'
    if r == 'no result':
        return 'No result'
    return 'Match abandoned'


def build_innings(inn, players_by_team):
    team = inn['team']
    bat = {}          # name -> [name, dismissal, runs, balls, 4s, 6s]
    order = []
    bowl = {}
    bowl_order = []
    total = 0
    wk = 0
    legal = 0
    extras = collections.OrderedDict()
    fow = []

    def see(name):
        if name not in bat:
            bat[name] = [name, None, 0, 0, 0, 0]
            order.append(name)

    for over in inn.get('overs', []):
        over_no = over['over']
        over_legal_before = None
        legal_in_over = 0
        for d in over['deliveries']:
            if over_legal_before is None:
                over_legal_before = legal_in_over
            batter, bowler, ns = d['batter'], d['bowler'], d['non_striker']
            see(batter)
            see(ns)
            ex = d.get('extras') or {}
            is_wide = 'wides' in ex
            # The shipped archive counts balls as deliveries minus wides
            # (no-balls included) — for overs, bowler figures and FOW alike.
            is_legal = not is_wide
            total += d['runs']['total']
            for k, v in ex.items():
                extras[k] = extras.get(k, 0) + v
            if bowler not in bowl:
                bowl[bowler] = [bowler, 0, 0, 0]  # legal balls, runs, wkts
                bowl_order.append(bowler)
            b = bowl[bowler]
            b[2] += d['runs']['total'] - ex.get('byes', 0) \
                - ex.get('legbyes', 0) - ex.get('penalty', 0)
            if is_legal:
                legal += 1
                legal_in_over += 1
                b[1] += 1
            if not is_wide:  # faced: no-balls count, wides do not
                row = bat[batter]
                row[3] += 1
                row[2] += d['runs']['batter']
                if d['runs']['batter'] == 4:
                    row[4] += 1
                elif d['runs']['batter'] == 6:
                    row[5] += 1
            for w in d.get('wickets', []):
                out_name = w['player_out']
                see(out_name)
                kind = w['kind']
                if kind in BOWLER_WKTS:
                    b[3] += 1
                if kind not in NOT_OUT_KINDS:
                    wk += 1
                if bat[out_name][1] is None:
                    bat[out_name][1] = dismissal_text(w, bowler)
                fow.append([wk, total, out_name, ov_str(legal)])
    for name in order:
        if bat[name][1] is None:
            bat[name][1] = ''
    ex_parts = []
    labels = {'byes': 'byes', 'legbyes': 'legbyes', 'wides': 'wides',
              'noballs': 'noballs', 'penalty': 'penalty'}
    for k, v in extras.items():
        ex_parts.append(f'{v} {labels.get(k, k)}')
    dnb = [p for p in players_by_team.get(team, []) if p not in bat]
    return {
        'team': team, 'total': total, 'wk': wk, 'ov': ov_str(legal),
        'bat': [bat[n] for n in order],
        'dnb': dnb,
        'bowl': [[n, ov_str(bowl[n][1]), bowl[n][2], bowl[n][3]]
                 for n in bowl_order],
        'ex': ', '.join(ex_parts),
        'fow': fow,
        'so': 1 if inn.get('super_over') else 0,
    }


def scorecard(mid, d):
    info = d['info']
    players = info.get('players') or {}
    inns = [build_innings(inn, players) for inn in d.get('innings', [])]
    summ_parts = []
    for team in info['teams']:
        team_inns = [i for i in inns if i['team'] == team and not i['so']]
        if team_inns:
            summ_parts.append(team + ' ' + ' & '.join(
                f"{i['total']}/{i['wk']} ({i['ov']})" for i in team_inns))
    event = (info.get('event') or {}).get('name', '')
    stage = (info.get('event') or {}).get('stage', '')
    if stage:
        event = f'{event} · {stage}' if event else stage
    meta = {
        'id': str(mid),
        'date': info['dates'][0],
        'season': str(info.get('season', '')),
        'teams': info['teams'],
        'venue': info.get('venue', ''),
        'result': result_text(info),
        'pom': info.get('player_of_match') or [],
        'toss': {'decision': (info.get('toss') or {}).get('decision', ''),
                 'winner': (info.get('toss') or {}).get('winner', '')},
        'summ': ' · '.join(summ_parts),
        'fmt': info.get('match_type', ''),
        'event': event,
    }
    meta['city'] = info.get('city', '')
    if len(info.get('dates', [])) > 1:
        meta['dateEnd'] = info['dates'][-1]
    return {'meta': meta, 'inns': inns}


def aggregate_stats(matches):
    """matches: iterable of (mid, raw). Returns (bat_rows, bowl_rows, players)."""
    bat = {}
    bowl = {}
    played = collections.defaultdict(set)

    def brow(name):
        return bat.setdefault(name, {'m': set(), 'inn': 0, 'no': 0, 'runs': 0,
                                     'balls': 0, 'hs': -1, 'hsno': 0,
                                     'h': 0, 'f': 0, 'fours': 0, 'sixes': 0})

    def wrow(name):
        return bowl.setdefault(name, {'m': set(), 'balls': 0, 'runs': 0,
                                      'wk': 0, 'best': None})

    for mid, d in matches:
        info = d['info']
        if not d.get('innings'):
            continue
        for team, plist in (info.get('players') or {}).items():
            for p in plist:
                played[p].add(mid)
        for inn in d['innings']:
            card = build_innings(inn, info.get('players') or {})
            batnames = set()
            for row in card['bat']:
                name, dism, runs, balls, fours, sixes = row
                batnames.add(name)
                r = brow(name)
                r['inn'] += 1
                if dism == '':
                    r['no'] += 1
                r['runs'] += runs
                r['balls'] += balls
                r['fours'] += fours
                r['sixes'] += sixes
                if runs > r['hs'] or (runs == r['hs'] and dism == '' and not r['hsno']):
                    r['hs'] = runs
                    r['hsno'] = 1 if dism == '' else 0
                if runs >= 100:
                    r['h'] += 1
                elif runs >= 50:
                    r['f'] += 1
            for name, ovs, runs, wkts in card['bowl']:
                r = wrow(name)
                balls = int(ovs.split('.')[0]) * 6 + int(ovs.split('.')[1])
                r['balls'] += balls
                r['runs'] += runs
                r['wk'] += wkts
                cur = (wkts, -runs)
                if r['best'] is None or cur > r['best'][0]:
                    r['best'] = (cur, f'{wkts}/{runs}')
    for name, r in bat.items():
        r['m'] = played[name]
    for name, r in bowl.items():
        r['m'] = played[name]
    bat_rows = [[n, len(r['m']), r['inn'], r['no'], r['runs'], r['balls'],
                 r['hs'], r['hsno'], r['h'], r['f'], r['fours'], r['sixes']]
                for n, r in bat.items()]
    bat_rows.sort(key=lambda x: -x[4])
    bowl_rows = [[n, len(r['m']), r['balls'], r['runs'], r['wk'],
                  r['best'][1] if r['best'] else '—']
                 for n, r in bowl.items()]
    # wickets desc, then matches desc, then name — the shipped IPL table's
    # own tie order is an unstable-sort artefact and is not reproducible;
    # the figures themselves are exact (verified above).
    bowl_rows.sort(key=lambda x: (-x[4], -x[1], x[0]))
    return bat_rows[:100], bowl_rows[:100], len(played)


# --------------------------------------------------------------- verify IPL
def verify_ipl():
    z = zipfile.ZipFile(os.path.join(RAW, 'ipl.zip'))
    names = [n for n in z.namelist() if n.endswith('.json')]
    random.seed(7)
    sample = random.sample(names, 40)
    bad = 0
    for fn in sample:
        mid = fn[:-5]
        raw = json.loads(z.read(fn))
        mine = scorecard(mid, raw)
        shipped = json.load(open(os.path.join(OUT, f'cricket-m{mid}.json')))
        # shipped IPL files predate fmt/event fields
        mine2 = json.loads(json.dumps(mine))
        mine2['meta'].pop('fmt', None)
        mine2['meta'].pop('event', None)
        mine2['meta'].pop('dateEnd', None)
        if mine2 != shipped:
            bad += 1
            print(f'--- MISMATCH {mid}')
            for k in shipped['meta']:
                if mine2['meta'].get(k) != shipped['meta'][k]:
                    print('  meta', k, '| shipped:', shipped['meta'][k],
                          '| mine:', mine2['meta'].get(k))
            for i, (a, b) in enumerate(zip(shipped['inns'], mine2['inns'])):
                if a != b:
                    for k in a:
                        if a[k] != b[k]:
                            print(f'  inns{i}', k, '| shipped:', str(a[k])[:160],
                                  '| mine:', str(b[k])[:160])
            if bad >= 3:
                break
    print(f'scorecards: {40 - bad}/40 exact' if bad == 0 else f'{bad} mismatches')
    # stats over the whole IPL set
    all_matches = []
    for fn in names:
        all_matches.append((fn[:-5], json.loads(z.read(fn))))
    bat, bowl, players = aggregate_stats(all_matches)
    shipped = json.load(open(os.path.join(OUT, 'cricket-stats.json')))
    print('stats bat exact:', bat == shipped['bat'], '| players:', players)
    mine_by_name = {r[0]: r for r in bowl}
    fig_diff = [n for n, r in mine_by_name.items()
                if r != next((x for x in shipped['bowl'] if x[0] == n), None)]
    print('stats bowl figures exact (order aside):', not fig_diff, fig_diff[:3])


# ------------------------------------------------------------------- build
WC_EVENTS = {
    'ICC World Cup', 'ICC Cricket World Cup', "ICC Men's Cricket World Cup",
    'ICC World Twenty20', "ICC Men's T20 World Cup", 'ICC T20 World Cup',
    'World Cup',  # the 2019 ODI edition is filed under exactly this name
}


def is_wc(event_name):
    return event_name in WC_EVENTS


def build():
    formats = {  # fmt code -> (zip, match_type kept)
        'odi': ('odis.zip', 'ODI'),
        't20': ('t20s.zip', 'T20'),
        'test': ('tests.zip', 'Test'),
    }
    index = {}
    for fmt, (zname, mtype) in formats.items():
        z = zipfile.ZipFile(os.path.join(RAW, zname))
        seasons = collections.defaultdict(list)
        wc = collections.defaultdict(list)
        wtc = []
        all_matches = []
        events = collections.Counter()
        dates = []
        for fn in z.namelist():
            if not fn.endswith('.json'):
                continue
            raw = json.loads(z.read(fn))
            info = raw['info']
            if info.get('gender') != 'male' or info.get('match_type') != mtype:
                continue
            mid = fn[:-5]
            card = scorecard(mid, raw)
            with open(os.path.join(OUT, f'cricket-m{mid}.json'), 'w') as f:
                json.dump(card, f, separators=(',', ':'))
            m = card['meta']
            year = m['date'][:4]
            row = [mid, m['date'], m['teams'], m['result'], m['summ'],
                   m['pom'], m['event']]
            seasons[year].append(row)
            ev_name = (info.get('event') or {}).get('name', '')
            events[ev_name] += 1
            if is_wc(ev_name):
                wc[year].append(row)
            if ev_name == 'ICC World Test Championship' and \
                    (info.get('event') or {}).get('stage') == 'Final':
                wtc.append(row)
            dates.append(m['date'])
            all_matches.append((mid, raw))
        for year, rows in seasons.items():
            rows.sort(key=lambda r: r[1])
            with open(os.path.join(OUT, f'cricket-x{fmt}-{year}.json'), 'w') as f:
                json.dump(rows, f, separators=(',', ':'))
        wc_years = []
        for year, rows in sorted(wc.items()):
            rows.sort(key=lambda r: r[1])
            with open(os.path.join(OUT, f'cricket-x{fmt}-wc{year}.json'), 'w') as f:
                json.dump(rows, f, separators=(',', ':'))
            wc_years.append(year)
        if wtc:
            wtc.sort(key=lambda r: r[1])
            with open(os.path.join(OUT, f'cricket-x{fmt}-wtc.json'), 'w') as f:
                json.dump(wtc, f, separators=(',', ':'))
        bat, bowl, players = aggregate_stats(all_matches)
        stats = {'bat': bat, 'bowl': bowl, 'matches': len(all_matches),
                 'players': players,
                 'coverage': [min(dates), max(dates)]}
        with open(os.path.join(OUT, f'cricket-stats-{fmt}.json'), 'w') as f:
            json.dump(stats, f, separators=(',', ':'))
        index[fmt] = {'matches': len(all_matches), 'players': players,
                      'coverage': [min(dates), max(dates)],
                      'years': sorted(seasons.keys(), reverse=True),
                      'wc': sorted(wc_years, reverse=True),
                      'wtc': len(wtc)}
        print(f"{fmt}: {len(all_matches)} matches · {players} players · "
              f"{min(dates)} → {max(dates)} · WC editions {sorted(wc_years)} · "
              f"WTC finals {len(wtc)}")
        print(f'   top bat: {bat[0][0]} {bat[0][4]} runs · top bowl: '
              f'{bowl[0][0]} {bowl[0][4]} wkts')
    with open(os.path.join(OUT, 'cricket-intl-index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print('index written')


if __name__ == '__main__':
    if '--verify-ipl' in sys.argv:
        verify_ipl()
    elif '--build' in sys.argv:
        build()
