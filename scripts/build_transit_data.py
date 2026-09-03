#!/usr/bin/env python3
"""
build_transit_data.py — turn the scraped DTC / Delhi-Metro pages into the JSON
that ships inside OmniTools.

Inputs  (produced by scrape/fetch_routes.py + scrape/fetch_metro.py):
  scrape/routes.ndjson          2,490 DTC / Delhi Transit route-directions
  scrape/metro_lines.ndjson     9 metro line pages
  scrape/metro_stations.ndjson  244 metro station pages
  scrape/metro-timings.html     per-line first/last train + headways
  omnitools/src/data/bus-delhi.json     previous OSM-derived build (merged in)
  omnitools/src/data/metro-delhi.json   previous OSM metro build (geometry kept)

Outputs:
  omnitools/src/data/bus-delhi.json     v2: + timetable, + real road distance
  omnitools/src/data/metro-delhi.json   v2: + line timings/headways, + fares fix,
                                        + bus connections per station
  transit-report.json                   the numbers used to verify the build

Stop identity is name + location: two platforms that share a name but sit more
than MERGE_M apart are separate stops (this was a real bug once — see the note
in src/core/bus-route.js).

Distances: a route page embeds the polyline the bus actually drives
(mapData.route_coords).  Every stop is projected onto that polyline and given
its cumulative distance along it, so a journey's length is |d_a - d_b| — real
road distance, no straight-line guesswork and no OSRM round-trip.
"""
import json, math, os, re, sys, datetime
from collections import Counter, defaultdict

SCRAPE = "/home/user/scrape"
REPO = "/home/user/omnitools"
MERGE_M = 350.0
R = 6371000.0

def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1; dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def unesc(s):
    """Pages carry JS-escaped text (\\u002D). Replace only those escapes —
    decoding the whole string as unicode_escape mangles real UTF-8 (en-dash
    became garbage), which then breaks name matching."""
    if not s: return s
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)

def norm_ref(ref):
    return re.sub(r"[^A-Z0-9]", "", unesc(ref).upper())

def to_min(t):
    """'7:50 AM' / '19:05' -> minutes since midnight, or None."""
    if not t: return None
    t = str(t).strip().upper().replace("\u00a0", " ")
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", t)
    if not m: return None
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if ap == "PM" and h != 12: h += 12
    if ap == "AM" and h == 12: h = 0
    return h * 60 + mi

def dur_min(s):
    """'1h 36m' | '58 min' -> 96"""
    if not s: return None
    s = s.lower()
    h = re.search(r"(\d+)\s*h", s); m = re.search(r"(\d+)\s*m", s)
    tot = 0; got = False
    if h: tot += int(h.group(1)) * 60; got = True
    if m: tot += int(m.group(1)); got = True
    return tot if got and tot else None

def rng(s):
    """'10–55 min' -> [10,55]"""
    if not s: return None
    n = [int(x) for x in re.findall(r"\d+", str(s))]
    if not n: return None
    if len(n) == 1: return [n[0], n[0]]
    return [min(n[0], n[1]), max(n[0], n[1])]

def windows(s):
    """'8–10 AM, 5–7 PM' -> [[8,10],[17,19]]"""
    out = []
    if not s: return out
    for part in str(s).split(","):
        m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?",
                      part, re.I)
        if not m: continue
        h1, h2, ap = int(m.group(1)), int(m.group(3)), (m.group(5) or "").upper()
        if ap == "PM":
            if h1 != 12: h1 += 12
            if h2 != 12: h2 += 12
        elif ap == "AM":
            if h1 == 12: h1 = 0
            if h2 == 12: h2 = 0
        if h2 < h1: h1, h2 = h2, h1
        out.append([h1, h2])
    return out

# --------------------------------------------------------------------- bus ---
def load_routes():
    seen = {}
    path = f"{SCRAPE}/routes.ndjson"
    for line in open(path, encoding="utf-8"):
        try: r = json.loads(line)
        except Exception: continue
        if not r.get("ok"): continue
        seen[r["url"]] = r                     # last write wins (resume safety)
    return list(seen.values())

class Stops:
    def __init__(self):
        self.rows = []                          # {n,lat,lon}
        self.by_name = defaultdict(list)       # name -> [(idx,lat,lon)]
    def add(self, name, lat, lon):
        name = unesc(name).strip()
        key = name.lower()
        for i, la, lo in self.by_name.get(key, ()):
            if (la - lat) ** 2 + (lo - lon) ** 2 < 1e-9:
                return i
            if hav((lat, lon), (la, lo)) <= MERGE_M:
                return i
        i = len(self.rows)
        self.rows.append({"n": name, "lat": round(lat, 5), "lon": round(lon, 5)})
        self.by_name.setdefault(key, []).append((i, lat, lon))
        return i

def shape_along(coords, stops):
    """cumulative metres along the polyline, at the vertex nearest each stop."""
    if not coords or not stops:
        return None
    cum = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + hav((coords[i - 1][1], coords[i - 1][0]),
                                 (coords[i][1], coords[i][0])))
    anchor, prev, out = [], 0, []
    for (lat, lon) in stops:
        best, bi = None, prev
        hi = min(len(coords), prev + max(8, len(coords) // max(1, len(stops)) * 3))
        for k in range(prev, hi):
            d = hav((lat, lon), (coords[k][1], coords[k][0]))
            if best is None or d < best: best, bi = d, k
            if k > prev + 2 and d > best + 4000: break
        prev = max(prev, min(bi, len(coords) - 1))
        out.append(cum[bi] if best is not None and best < 900 else None)
    # fill gaps with straight-line accumulation so the array stays monotone
    straight = [0.0]
    for i in range(1, len(stops)):
        straight.append(straight[-1] + hav(stops[i - 1], stops[i]))
    final, bad = [], 0
    for i, v in enumerate(out):
        if v is None:
            v = straight[i]; bad += 1
        if final and v < final[-1]: v = final[-1]
        final.append(round(v))
    if bad > len(stops) * 0.5:
        return None
    return [int(x) for x in final]

def build_bus():
    rows = load_routes()
    old = json.load(open(f"{REPO}/scripts/osm-sources/bus-osm.json", encoding="utf-8"))
    stops = Stops()
    # old OSM stops are already name+location keyed — keep them first
    for s in old["stops"]:
        stops.add(s["n"], s["lat"], s["lon"])
    old_by_idx = {i: s for i, s in enumerate(old["stops"])}

    site_nums = {norm_ref(r.get("num", "")) for r in rows}
    routes, drop = [], Counter()
    rec_url = {}

    for r in rows:
        num = unesc(r.get("num", "")).strip()
        names, geolist = r.get("names") or [], r.get("geo") or []
        if len(names) != len(geolist) or len(names) < 2:
            drop["too_few_stops"] += 1; continue
        pts = [(g[0], g[1]) for g in geolist]
        if any(abs(p[0]) < 5 or abs(p[1]) < 5 for p in pts):
            drop["no_coords"] += 1; continue
        # A hop far beyond anything Delhi's streets can do means the source's
        # coordinates are broken, not that the route is long.  Sparse suburban
        # and intercity routes legitimately skip 15-25 km between platforms.
        hops = max(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if hops > 25000:
            drop["teleport_hop"] += 1; continue
        if hops > 6000:
            drop["sparse_hop_kept"] += 1
        idxs = [stops.add(g[2] if len(g) > 2 and g[2] else names[i], pts[i][0], pts[i][1])
                for i, g in enumerate(geolist)]
        tt = r.get("tt") or {}
        deps = sorted({m for m in (to_min(t) for _, t in tt.get("times", [])) if m is not None})
        rec = {"r": num, "f": unesc(r.get("from", "")).strip(), "t": unesc(r.get("to", "")).strip(),
               "o": unesc(r.get("agency", "")).strip(), "s": idxs}
        sm = shape_along(r.get("coords") or [], pts)
        if sm:
            rec["m"] = sm; rec["km"] = round(sm[-1] / 1000, 2)
        else:
            rec["m"] = [round(x) for x in _cum(pts)]; rec["km"] = round(rec["m"][-1] / 1000, 2); rec["sm"] = 0
        est = dur_min(r.get("est_time"))
        if est: rec["mins"] = est
        t = {}
        a, b = to_min(tt.get("first")), to_min(tt.get("last"))
        if a is not None: t["a"] = a
        if b is not None: t["b"] = b
        if tt.get("trips"): t["k"] = int(tt["trips"])
        pk, of = rng(tt.get("peak")), rng(tt.get("offpeak"))
        if pk: t["pk"] = pk
        if of: t["op"] = of
        w = windows(tt.get("peak_win") or "")
        if w: t["pw"] = w
        if deps:
            # where the page gave departure times but no explicit first/last bus,
            # the earliest and latest published departure are the first and last bus
            t.setdefault("a", min(deps)); t.setdefault("b", max(deps))
            t["d"] = deps
        if t: rec["tt"] = t
        if r.get("live_uid"): rec["lu"] = r["live_uid"]
        if r.get("return_url"):
            rec["_rv_url"] = (SITE + r["return_url"]) if r["return_url"].startswith("/") else r["return_url"]
        rec["_url"] = r["url"]
        routes.append(rec)

    # ---- merge routes the old OSM build had and the site does not ----------
    merged_old = 0
    for r in old["routes"]:
        if norm_ref(r["r"]) in site_nums: continue
        pts = []
        idxs = []
        for v in r["s"]:
            s = old_by_idx[v] if isinstance(v, int) and v < len(old_by_idx) else None
            if not s: break
            i = stops.add(s["n"], s["lat"], s["lon"]); idxs.append(i); pts.append((s["lat"], s["lon"]))
        if len(idxs) < 3: drop["old_unusable"] += 1; continue
        if max(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) > 25000:
            drop["old_teleport"] += 1; continue
        cm = [round(x) for x in _cum(pts)]
        rec = {"r": unesc(r["r"]).strip(), "f": r.get("f", ""), "t": r.get("t", ""),
               "o": r.get("o", "") or "Delhi Transport Corporation", "s": idxs, "m": cm,
               "km": round(cm[-1] / 1000, 2), "sm": 0, "src": "osm"}
        routes.append(rec); merged_old += 1

    # ---- link each direction to its return direction ----------------------
    #   The source page publishes its return page's URL, which is exact — the
    #   terminal labels differ between the two ("Jahangirpuri EBlock" vs
    #   "E Block Jahangir Puri Terminal"), so names alone would miss it.
    #   Name symmetry stays as the fallback for merged OpenStreetMap records.
    routes.sort(key=lambda x: (norm_ref(x["r"]), x["f"]))
    by_norm = defaultdict(list)
    pos_by_url = {}
    for i, r in enumerate(routes):
        r.pop("lu", None)          # the source site's private tracker id — unused here
        by_norm[norm_ref(r["r"])].append(i)
        if r.get("_url"):
            pos_by_url[r["_url"]] = i
            rec_url[i] = r["_url"]
    for i, r in enumerate(routes):
        rv = r.pop("_rv_url", None)
        r.pop("_url", None); r.pop("_rv_db", None); r.pop("_self_db", None)
        if rv and rv in pos_by_url and pos_by_url[rv] != i:
            r["rv"] = pos_by_url[rv]
    for i, r in enumerate(routes):
        if "rv" in r: continue
        cand = [j for j in by_norm[norm_ref(r["r"])] if j != i
                and routes[j]["f"] == r["t"] and routes[j]["t"] == r["f"]]
        if cand: r["rv"] = cand[0]

    # sidecar for scripts/verify_transit_data.py: which page each record came
    # from.  Deliberately written outside src/data so it is never shipped — the
    # product does not advertise where its data comes from.
    try:
        json.dump([{"i": i, "u": rec_url[i]} for i in range(len(routes)) if rec_url.get(i)],
                  open(f"{SCRAPE}/route-index.json", "w", encoding="utf-8"), ensure_ascii=False)
    except Exception as e:
        print("sidecar skipped:", e)

    stats = {"route_records": len(routes), "unique_route_numbers": len(by_norm),
             "physical_stops": len(stops.rows),
             "with_timetable": sum(1 for r in routes if r.get("tt")),
             "with_return": sum(1 for r in routes if r.get("rv") is not None),
             "with_shape_distance": sum(1 for r in routes if r.get("sm", 1) == 1),
             "merged_from_osm": merged_old}

    out = {
        "built": datetime.date.today().isoformat(),
        "source": "DTC + Delhi Transit published route pages (all directions), scraped 2026-09-03; "
                  "stop positions and the driven route polyline from the same pages; "
                  "OpenStreetMap route=bus relations merged for routes the operator pages do not list",
        "note": "Stops are keyed by name AND location: the same name more than %d m away is a separate "
                "physical stop. Routes reference stops by index. 'm' is the distance in metres ALONG the "
                "route's own polyline at each stop, so journey length is |m[a]-m[b]| — road distance, not "
                "a straight line. 'sm':0 means no polyline was published for that route and 'm' is the "
                "straight-line sum instead." % MERGE_M,
        "fare": {
            "note": "DTC slabs, unchanged since the 2016 revision; verified against the Delhi Tourism "
                    "transport listing. Women travel free on DTC and cluster buses (pink ticket).",
            "ordinary": [[4, 5], [10, 10], [None, 15]],
            "ac": [[4, 10], [8, 15], [12, 20], [None, 25]],
            "child_ordinary": [[4, 3], [10, 5], [None, 8]],
            "child_ac": [[4, 5], [8, 8], [12, 10], [None, 13]],
            "feeder": [[8, 7], [None, 10]],
        },
        "stats": stats,
        "stops": stops.rows,
        "routes": routes,
    }
    return out, drop

def _cum(pts):
    out = [0.0]
    for i in range(1, len(pts)):
        out.append(out[-1] + hav(pts[i - 1], pts[i]))
    return out

# ------------------------------------------------------------------- metro ---
LINE_COLOURS = {"Red": "#FF4040", "Yellow": "#FFDF00", "Blue": "#4169E1", "Green": "#008000",
                "Violet": "#8E24AA", "Pink": "#E91E63", "Magenta": "#9C27B0", "Grey": "#757575",
                "Airport": "#FF9800", "Aqua": "#00BCD4"}
LINE_SLUG = {"red-line": "Red Line", "yellow-line": "Yellow Line", "blue-line": "Blue Line",
             "green-line": "Green Line", "violet-line": "Violet Line", "pink-line": "Pink Line",
             "magenta-line": "Magenta Line", "grey-line": "Grey Line", "airport-express": "Airport Express"}

def ndjson(path):
    if not os.path.exists(path): return []
    out = []
    for line in open(path, encoding="utf-8"):
        try: d = json.loads(line)
        except Exception: continue
        if d.get("ok"): out.append(d)
    return out

def parse_timings_table():
    """The /delhi/metro/timings/ page: first + last train from each terminal,
    and the peak/off-peak headway, for every line."""
    h = open(f"{SCRAPE}/metro-timings.html", encoding="utf-8").read()
    t = re.sub(r"<[^>]+>", "\n", h)
    lines = [x.strip() for x in re.sub(r"\n\s*\n+", "\n", t).split("\n") if x.strip()]
    TIME = re.compile(r"^\d{1,2}:\d{2}\s*[AP]M$")
    FREQ = re.compile(r"^\d+\s*(?:[\u2013\u2014-]\s*\d+)?\s*min$")
    NAMES = re.compile(r"^(Red|Yellow|Blue|Green|Violet|Pink|Magenta|Grey|Aqua|Airport Express)( Line)?$")
    out = {}
    for i, l in enumerate(lines):
        m = NAMES.fullmatch(l)
        if not m: continue
        name = "Airport Express" if m.group(1) == "Airport Express" else m.group(1) + " Line"
        terms, times, freqs = [], [], []
        j = i + 1
        while j < len(lines) and j < i + 30:
            x = lines[j]
            if NAMES.fullmatch(x): break
            if x in ("\u2194", "\u2196", "\u21cc"): j += 1; continue
            if TIME.fullmatch(x): times.append(to_min(x))
            elif FREQ.fullmatch(x): freqs.append(rng(x))
            elif len(terms) < 2 and len(x) < 60 and not x.startswith("*"): terms.append(unesc(x).strip())
            j += 1
        out[name] = {"terminals": terms, "times": times, "freqs": freqs}
    return out


def split_segments(names, dist=None, maxhop=5.0):
    """A line page lists the main corridor and then each branch, restarting the
    list at the junction.  Two signatures of that:

      · the junction station name simply repeats   (Blue -> "Yamuna Bank … Vaishali")
      · a jump of more than `maxhop` km into a station that is then repeated at
        the far end of the appended block   (Magenta's Majlis Park loop)

    A genuinely long inter-station gap is left alone: the Airport Express Line
    really does run 6.2 km between Aerocity and Dhaula Kuan, and nothing repeats
    there, so no cut is made."""
    cuts, seen = set(), set()
    for i, n in enumerate(names):
        if n in seen: cuts.add(i)
        seen.add(n)
    if dist:
        for i in range(1, len(names)):
            if i in cuts: continue
            try:
                long = dist(names[i - 1], names[i]) > maxhop
            except Exception:
                long = False
            if long and names[i] in names[i + 1:]:
                cuts.add(i)
    segs, cur = [], []
    for i, n in enumerate(names):
        if i in cuts and cur:
            segs.append(cur); cur = [n]; continue
        cur.append(n)
    if cur: segs.append(cur)
    return [s for s in segs if len(s) >= 2]


BASE = lambda s: re.sub(r"[^a-z]", "", s.lower().replace(" line", "").replace(" (branch)", ""))
SITE = "https://www.dtcbusroutes.in"

def build_metro():
    old = json.load(open(f"{REPO}/scripts/osm-sources/metro-osm.json", encoding="utf-8"))
    lines_html = ndjson(f"{SCRAPE}/metro_lines.ndjson")
    stations_html = ndjson(f"{SCRAPE}/metro_stations.ndjson")
    tim = parse_timings_table()

    key = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    site_st, osm_st = {}, {}
    for d in stations_html:
        nm = unesc(d.get("name", "")).strip()
        if nm: site_st.setdefault(nm, d)
    for s in old["stations"]:
        osm_st.setdefault(s["n"], s)
    site_by_key = {key(k): k for k in site_st}
    osm_by_key = {key(k): k for k in osm_st}

    def canon(name):
        """A scraped station name -> the name we key the dataset by (site first)."""
        n = unesc(name).strip()
        if n in site_st: return n
        k = key(n)
        if k in site_by_key: return site_by_key[k]
        if n in osm_st: return n
        if k in osm_by_key: return osm_by_key[k]
        return n

    def coords(nm):
        d = site_st.get(nm)
        if d and d.get("lat"): return d["lat"], d["lon"]
        s = osm_st.get(nm)
        if s: return s["lat"], s["lon"]
        return None, None

    lines_out = []
    for d in sorted(lines_html, key=lambda x: x.get("title", "")):
        m = re.search(r"/delhi/metro/([^/]+)/$", d["url"])
        slug = m.group(1) if m else ""
        base = LINE_SLUG.get(slug) or unesc(d.get("name", "")).replace("Delhi Metro", "").strip()
        base = re.sub(r"\s*\(.*?\)\s*", " ", base).strip()
        base = re.sub(r"\s+", " ", base)
        if base.lower().endswith(" line"): base = base[:-5] + " Line"
        names = [canon(s["n"]) for s in d.get("stations", [])]
        def dist(a, b, _c=coords):
            pa, pb = _c(a), _c(b)
            if None in pa or None in pb: return 0.0
            return hav(pa, pb) / 1000
        segs = split_segments(names, dist=dist)
        if not segs: continue
        tt = {}
        if d.get("service"): tt["win"] = [to_min(d["service"][0]), to_min(d["service"][1])]
        fp = rng(re.sub("min", "", str(d.get("freq_peak") or ""))) or (tim.get(base, {}).get("freqs") or [None])[0]
        fo = rng(re.sub("min", "", str(d.get("freq_off") or ""))) or (tim.get(base, {}).get("freqs") or [None, None])[1]
        if fp: tt["peak"] = fp
        if fo: tt["off"] = fo
        w = windows((d.get("peak_win_am") or "")) + windows((d.get("peak_win_pm") or ""))
        if w: tt["pw"] = w
        ti = tim.get(base) or {}
        tms = ti.get("times") or []
        terms = ti.get("terminals") or []
        term = None
        if len(tms) >= 4 and len(terms) >= 2:
            term = [[terms[0], tms[0], tms[2]], [terms[1], tms[1], tms[3]]]
        elif len(tms) >= 2:
            term = [[terms[0] if terms else "", tms[0], tms[1]]]
        for si, seg in enumerate(segs):
            nm = base if si == 0 else f"{base} ({seg[-1]} branch)"
            rec = {"n": nm, "l": base, "c": d.get("color") or LINE_COLOURS.get(base.split()[0], "#888888"),
                   "s": seg}
            if si == 0:
                if d.get("km"): rec["km"] = d["km"]
                if d.get("opened"): rec["opened"] = d["opened"]
                if d.get("ridership_lakh"): rec["riders_lakh"] = d["ridership_lakh"]
                if tt: rec["tt"] = tt
                if term: rec["term"] = term
                bl = unesc(d.get("blurb") or "").strip()
                # the line pages put an SEO title in that slot for some lines;
                # only real prose is worth shipping
                if len(bl) > 90 and ". " in bl and "Stations, Route" not in bl:
                    rec["about"] = bl[:400]
            else:
                rec["branch"] = 1
            lines_out.append(rec)

    # keep OSM lines the operator pages do not cover (other networks, RRTS, …)
    have = {BASE(x["l"]) for x in lines_out}
    for L in old["lines"]:
        if BASE(L.get("l") or L["n"]) in have: continue
        def odist(a, b):
            pa, pb = coords(a), coords(b)
            if None in pa or None in pb: return 0.0
            return hav(pa, pb) / 1000
        segs = split_segments([canon(x) for x in L["s"]], dist=odist) or [L["s"]]
        for si, seg in enumerate(segs):
            lines_out.append({"n": L["n"] if si == 0 else f"{L['n']} ({seg[-1]} branch)",
                              "l": L.get("l") or L["n"],
                              "c": L.get("c") or LINE_COLOURS.get(L["n"].split()[0], "#888888"),
                              "s": seg, "src": "osm"})
            have.add(BASE(L.get("l") or L["n"]))

    # ---- stations: only those that sit on a line, so no stale duplicates ----
    member = defaultdict(list)
    for rec in lines_out:
        for s in rec["s"]:
            if rec["l"] not in member[s]: member[s].append(rec["l"])
    conn, struct = {}, {}
    for nm, d in site_st.items():
        if d.get("bus_stops"):
            conn[nm] = sorted([{"n": unesc(b["n"]).strip(), "m": b.get("m"), "routes": b.get("routes")}
                               for b in d["bus_stops"] if b.get("n")],
                              key=lambda x: (x["m"] if x["m"] is not None else 9999))[:12]
        if d.get("struct"): struct[nm] = d["struct"]

    stations_out, nofix = [], []
    for nm in sorted(member):
        la, lo = coords(nm)
        rec = {"n": nm, "lat": round(la, 5) if la else None, "lon": round(lo, 5) if lo else None,
               "l": sorted(member[nm])}
        if la is None: nofix.append(nm); continue
        if len(rec["l"]) > 1: rec["x"] = 1
        if struct.get(nm): rec["st"] = struct[nm]
        if conn.get(nm): rec["b"] = conn[nm]
        stations_out.append(rec)

    fares = {
        "note": "DMRC slabs effective 25 Aug 2025 — the first revision in 8 years. Taken from the "
                "corporation's own announcement (Re 1 to Rs 4 higher, Rs 5 on the Airport Express Line) "
                "and cross-checked against four news reports; Sunday/national-holiday slabs are one step "
                "below the weekday ones.",
        "effective": "2025-08-25",
        "weekday": [[2, 11], [5, 21], [12, 32], [21, 43], [32, 54], [None, 64]],
        "holiday": [[2, 11], [5, 11], [12, 21], [21, 32], [32, 43], [None, 54]],
        "airportExpress": [[2, 11], [5, 21], [12, 32], [21, 43], [32, 54], [None, 75]],
        "smartcardDiscount": 0.1,
        "mjqrtOffPeakDiscount": 0.2,
        "offPeak": {"weekday_windows": [[0, 8], [12, 17], [21, 24]],
                    "note": "Off-peak = before 8 AM, 12-5 PM, after 9 PM, Mon-Sat. Token passengers "
                            "always pay the full fare."},
        "timeLimit": [[2, 65], [12, 100], [None, 180]],
        "cards": {"smartCard": {"price": 150, "deposit": 50, "minBalance": 100, "maxBalance": 3000,
                                "validityYears": 10},
                  "tourist": {"day1": 200, "day3": 500, "deposit": 50},
                  "whatsapp": "+91 9650855800",
                  "journeyLimitMins": 90},
        "network": {"lines": len({x["l"] for x in lines_out}),
                    "stations": len(stations_out),
                    "km": round(sum(x.get("km", 0) for x in lines_out), 1)},
    }
    for rec in lines_out:
        l = rec["l"]
        rec["net"] = ("NMRC" if "Aqua" in l else "RRTS" if "RRTS" in l
                      else "RapidMetro" if "Rapid" in l else "DMRC")
        if rec["net"] != "DMRC":
            rec["ticketing"] = "separate"      # own fare system: a DMRC card is not valid

    out = {
        "built": datetime.date.today().isoformat(),
        "walks": [{"a": "Noida Sector 51", "b": "Noida Sector 52", "m": 300,
                   "note": "Footway between the Aqua Line and the Blue Line; a DMRC ticket is not "
                           "valid on the Aqua Line, so re-entering means a second fare."}],
        "source": "Delhi Metro line and station pages scraped 2026-09-03 (9 lines, 244 stations, every "
                  "bus stop within 1 km of each station); station geometry and the non-DMRC networks "
                  "(Aqua, RRTS, Rapid Metro) from OpenStreetMap route=subway relations",
        "fares": fares,
        "lines": lines_out,
        "stations": stations_out,
        "stats": {"lines": len(lines_out), "corridors": len({x["l"] for x in lines_out}),
                  "stations": len(stations_out), "with_bus_links": len(conn),
                  "interchanges": sum(1 for s in stations_out if s.get("x")),
                  "no_coords": len(nofix)},
    }
    return out


def main():
    rep = {}
    bus, bdrop = build_bus()
    metro = build_metro()
    bpath = f"{REPO}/src/data/bus-delhi.json"
    mpath = f"{REPO}/src/data/metro-delhi.json"
    json.dump(bus, open(bpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(metro, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    rep["bus"] = bus["stats"]; rep["bus_dropped"] = dict(bdrop)
    rep["metro"] = metro["stats"]
    # quick numeric report
    kms = sorted(r["km"] for r in bus["routes"])
    rep["bus_km"] = {"median": kms[len(kms) // 2], "p95": kms[int(len(kms) * .95)], "max": kms[-1]}
    tt = [r for r in bus["routes"] if r.get("tt", {}).get("d")]
    rep["bus_timetable"] = {"routes_with_departures": len(tt),
                            "median_departures": sorted(len(r["tt"]["d"]) for r in tt)[len(tt) // 2] if tt else 0}
    json.dump(rep, open(f"{SCRAPE}/transit-report.json", "w"), indent=1)
    print(json.dumps(rep, indent=1))
    print("bus bytes", os.path.getsize(bpath), "metro bytes", os.path.getsize(mpath))

if __name__ == "__main__":
    main()
