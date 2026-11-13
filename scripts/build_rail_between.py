#!/usr/bin/env python3
"""
Between-stations index for the rail timetable.

Reads the shipped route shards (public/data/rail-rNNN.json — the same data
the timetable renders) and builds per-station POSITIONAL shards:

    rail-bsp-<first two letters of station code>.json
      { CODE: [[trainNo, stopIndex, arr 'HH:MM'|null, dep|null, journeyDay]] }

A between-stations query then needs exactly two shard fetches (the letter
of the From code and the letter of the To code): intersect on train number,
keep pairs with stopIndex(from) < stopIndex(to), read the times off the
rows. Run: python3 scripts/build_rail_between.py
"""
import glob
import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')


def main():
    by_station = {}
    trains = 0
    rows = 0
    for path in sorted(glob.glob(os.path.join(DATA, 'rail-r*.json'))):
        with open(path) as f:
            shard = json.load(f)
        for no, stops in shard.items():
            trains += 1
            for i, s in enumerate(stops):
                code, arr, dep, day = s[0], s[1], s[2], s[3]
                by_station.setdefault(code, []).append([no, i, arr, dep, day])
                rows += 1
    print(f'{trains} trains · {rows} stop rows · {len(by_station)} stations')

    sizes = {}
    letters = {}
    for code, lst in by_station.items():
        letters.setdefault(code[:2].lower(), {})[code] = lst
    for letter, mapping in sorted(letters.items()):
        out = os.path.join(DATA, f'rail-bsp-{letter}.json')
        with open(out, 'w') as f:
            json.dump(mapping, f, separators=(',', ':'))
        sizes[letter] = os.path.getsize(out)
    print('shards:', {k: f'{v // 1024}KB' for k, v in sizes.items()})
    print(f'max shard {max(sizes.values()) // 1024}KB · total {sum(sizes.values()) // 1024}KB')

    # ---- verification: simulate the app query in python ----------------
    idx = {c: {r[0]: r for r in lst} for c, lst in
           ((code, lst) for code, lst in by_station.items())}

    def between(a, b):
        A = {r[0]: r for r in by_station.get(a, [])}
        B = {r[0]: r for r in by_station.get(b, [])}
        out = []
        for no, ra in A.items():
            rb = B.get(no)
            if rb and ra[1] < rb[1]:
                out.append((no, ra, rb))
        return out

    for a, b in [('NDLS', 'CNB'), ('CNB', 'NDLS'), ('NDLS', 'HWH')]:
        res = between(a, b)
        print(f'{a} -> {b}: {len(res)} trains')
        for no, ra, rb in res:
            if no in ('12301', '12302'):
                print(f'   {no}: dep {a} {ra[3]} (day {ra[4]}) -> arr {b} {rb[2]} (day {rb[4]})')


if __name__ == '__main__':
    sys.exit(main())
