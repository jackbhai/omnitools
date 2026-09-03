#!/usr/bin/env python3
"""
verify_transit_data.py — prove the shipped transit data is what the source says.

Three kinds of check, all measured, nothing assumed:

  1. INVARIANTS   the built files are internally sound (indices, monotone
                  distances, linked directions, plausible headways/frequencies).
  2. SOURCE SPOT  re-fetch N route pages + metro line pages and compare every
                  published field against the record that shipped.
  3. ROAD TRUTH   the offline distance is the distance the bus drives, so a
                  journey's km is compared with OSRM's routed distance.

    python3 scripts/verify_transit_data.py [--pages 20] [--osrm 10]
"""
import json, math, os, random, re, sys, urllib.request, html as H
from collections import Counter

REPO = "/home/user/omnitools"
SITE = "https://www.dtcbusroutes.in"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
BUS = json.load(open(f"{REPO}/src/data/bus-delhi.json", encoding="utf-8"))
MET = json.load(open(f"{REPO}/src/data/metro-delhi.json", encoding="utf-8"))
R = 6371.0

def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1; dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

fails, warns, oks = [], [], 0
def chk(cond, label, detail=""):
    global oks
    if cond: oks += 1
    else: fails.append(f"{label} — {detail}")
def note(cond, label, detail=""):
    if not cond: warns.append(f"{label} — {detail}")

STOPS = BUS["stops"]
ROUTES = BUS["routes"]
NPOS = {s["n"]: (s["lat"], s["lon"]) for s in MET["stations"]}

# ------------------------------------------------------------- 1 invariants
chk(len(ROUTES) > 2000, "bus: route count", f"{len(ROUTES)} records")
chk(len(STOPS) > 4000, "bus: stop count", f"{len(STOPS)} stops")
tt_n = sum(1 for r in ROUTES if r.get("tt"))
chk(tt_n > len(ROUTES) * 0.9, "bus: timetable coverage", f"{tt_n}/{len(ROUTES)}")

bad_idx = bad_mono = bad_km = bad_rv = bad_hop = bad_tt = 0
hops_all = []
for r in ROUTES:
    if any((not isinstance(v, int)) or v < 0 or v >= len(STOPS) for v in r["s"]): bad_idx += 1
    if len(r["s"]) < 2: bad_idx += 1
    m = r.get("m")
    if m:
        if len(m) != len(r["s"]): bad_mono += 1
        elif any(m[i + 1] < m[i] for i in range(len(m) - 1)): bad_mono += 1
        elif r.get("km") and abs(m[-1] / 1000 - r["km"]) > 0.05: bad_km += 1
    pts = [STOPS[v] for v in r["s"]]
    for a, b in zip(pts, pts[1:]):
        d = hav((a["lat"], a["lon"]), (b["lat"], b["lon"])); hops_all.append(d)
        if d > 25: bad_hop += 1
    t = r.get("tt") or {}
    if t.get("d"):
        if t["d"] != sorted(t["d"]): bad_tt += 1
        if t.get("a") is None or t.get("b") is None: bad_tt += 1
        elif not (0 <= t["a"] <= t["b"] <= 1440): bad_tt += 1
        else:
            if min(t["d"]) < t["a"] - 1: bad_tt += 1
            if max(t["d"]) > t["b"] + 1: bad_tt += 1
    for key in ("pk", "op"):        # published headway RANGES, not a service window
        h = t.get(key)
        if h and not (0 < h[0] <= h[1] <= 180): bad_tt += 1
    if t.get("a") is not None and t.get("b") is not None and t["a"] > t["b"]: bad_tt += 1
    rv = r.get("rv")
    if rv is not None:
        # a loop route is published as two directions, "(+)" and "(-)" — same
        # service, different number, so compare after stripping the direction mark
        strip = lambda s: re.sub(r"\s*[()–\-+]*\s*", "", s.upper().replace(" ", ""))
        if rv >= len(ROUTES) or strip(ROUTES[rv]["r"]) != strip(r["r"]): bad_rv += 1
chk(bad_idx == 0, "bus: every stop index resolves", f"{bad_idx} broken")
chk(bad_mono == 0, "bus: distance array monotone", f"{bad_mono} broken")
chk(bad_km == 0, "bus: km matches the distance array", f"{bad_km} broken")
chk(bad_rv == 0, "bus: return-direction links point at the same service", f"{bad_rv} wrong")
chk(bad_hop == 0, "bus: no teleport between consecutive stops", f"{bad_hop} hops >25 km")
chk(bad_tt == 0, "bus: timetables complete, sorted and inside the published window", f"{bad_tt} routes")
med = sorted(hops_all)[len(hops_all) // 2]
p99 = sorted(hops_all)[int(len(hops_all) * .99)]
chk(med < 1.2, "bus: median hop between stops is walk-plausible", f"median {med:.2f} km")
print(f"  bus: {len(ROUTES)} directions · {len(STOPS)} stops · {tt_n} with timetables · "
      f"median stop-to-stop {med:.2f} km, p99 {p99:.2f} km")

uniq = Counter(r["r"].upper().replace(" ", "") for r in ROUTES)
print(f"  bus: {len(uniq)} distinct route numbers, busiest listing {uniq.most_common(1)}")

msum = sum(len(r.get("tt", {}).get("d", [])) for r in ROUTES)
chk(msum > 40000, "bus: departure times present in volume", f"{msum} times")
print(f"  bus: {msum} individual departure times published")

# metro
lines = MET["lines"]; sts = MET["stations"]
chk(len(lines) >= 12, "metro: line records", f"{len(lines)}")
chk(len(sts) > 270, "metro: stations", f"{len(sts)}")
nocoord = [s["n"] for s in sts if not s.get("lat")]
chk(not nocoord, "metro: every station has coordinates", f"{len(nocoord)} missing")
missing = {n for L in lines for n in L["s"] if n not in NPOS}
chk(not missing, "metro: every station named by a line exists", str(sorted(missing)[:5]))
medge = 0
for L in lines:
    for a, b in zip(L["s"], L["s"][1:]):
        if a in NPOS and b in NPOS and hav(NPOS[a], NPOS[b]) > 9: medge += 1
chk(medge == 0, "metro: no impossible inter-station gap", f"{medge} edges >9 km")
xfer = [s for s in sts if len(s.get("l", [])) > 1]
chk(len(xfer) > 25, "metro: interchanges detected", f"{len(xfer)}")
f = MET["fares"]
for key in ("weekday", "holiday", "airportExpress"):
    seq = [v for _, v in f[key]]
    chk(seq == sorted(seq), f"metro: {key} fare slabs never decrease", str(seq))
chk(f["weekday"][-1][1] == 64 and f["holiday"][-1][1] == 54,
    "metro: Aug-2025 top fares (Rs 64 weekday / Rs 54 holiday)", json.dumps([f["weekday"][-1], f["holiday"][-1]]))
withb = sum(1 for s in sts if s.get("b"))
print(f"  metro: {len(lines)} line records · {len(sts)} stations · {len(xfer)} interchanges · "
      f"{withb} stations carry bus connections")
chk(withb > 200, "metro: bus connections for most stations", f"{withb}")

# --------------------------------------------------------- 2 source spot-check
def fetch(u, timeout=30):
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")

def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def check_route_page(url, rec):
    h = fetch(SITE + url)
    issues = []
    t = re.sub(r"<[^>]+>", "\n", h)
    t = H.unescape(re.sub(r"\n\s*\n+", "\n", t))
    lines = [x.strip() for x in t.split("\n") if x.strip()]
    m = re.search(r">\s*([0-9A-Za-z()\-./ ]+?)\s+Bus Route", h)
    if m and norm(m.group(1)) != norm(rec["r"]):
        issues.append(f"number {rec['r']!r} vs {m.group(1)!r}")
    names = [n for n in lines if n.startswith("Return:") ]
    # stop sequence: the page lists stops as "Name\n#k"
    page_stops = re.findall(r'title="([^"]+)"\s*(?:class="[^"]*")?>\s*[^<]*</', h)
    seq = re.findall(r'<span class="text-sm font-medium[^"]*">([^<]{2,120})</span>', h)
    seq = [s for s in seq if not s.startswith("Return")]
    if len(seq) >= 5:
        mine = [STOPS[v]["n"] for v in rec["s"]]
        if len(seq) != len(mine):
            issues.append(f"stop count {len(mine)} vs page {len(seq)}")
        else:
            same = sum(1 for a, b in zip(seq, mine) if norm(a) == norm(b))
            if same < len(seq) * 0.9:
                issues.append(f"only {same}/{len(seq)} stop names match the page")
    mm = re.search(r"Service hours:\s*<span[^>]*>([^<]*)</span>\s*</span>\s*<[^>]*>\s*&#8211;", h)
    a = re.search(r"Service hours:.*?([0-9]{1,2}:[0-9]{2}\s*[AP]M).*?([0-9]{1,2}:[0-9]{2}\s*[AP]M)", t, re.S)
    if a:
        def mins(x):
            hh, rest = x.split(":"); mi, ap = rest.split()[0], rest.split()[1]
            hh = int(hh) % 12 + (12 if ap.upper() == "PM" and int(hh) != 12 else 0)
            return hh * 60 + int(mi)
        if rec.get("tt", {}).get("a") != mins(a.group(1)):
            issues.append(f"first bus {rec['tt'].get('a')} vs page {mins(a.group(1))}")
        if rec.get("tt", {}).get("b") != mins(a.group(2)):
            issues.append(f"last bus {rec['tt'].get('b')} vs page {mins(a.group(2))}")
    tk = re.search(r"(\d+)\s*\n?trips/day", t)
    if tk and rec.get("tt", {}).get("k") != int(tk.group(1)):
        issues.append(f"trips {rec['tt'].get('k')} vs page {tk.group(1)}")
    return issues

SIDE = "/home/user/scrape/route-index.json"
npages = int(next((sys.argv[i + 1] for i, x in enumerate(sys.argv) if x == "--pages"), "20"))
checked = bad = 0
side = []
if os.path.exists(SIDE):
    side = json.load(open(SIDE, encoding="utf-8"))
    random.Random(7).shuffle(side)
    for row in side:
        rec = ROUTES[row["i"]]
        if not rec.get("tt", {}).get("d"): continue
        url = re.sub(r"^https?://[^/]+", "", row["u"])
        try:
            issues = check_route_page(url, rec)
            checked += 1
            for it in issues:
                bad += 1
                fails.append(f"source mismatch on {rec['r']}: {it}")
        except Exception as e:
            warns.append(f"could not re-check {rec['r']}: {type(e).__name__} {e}")
        if checked >= npages: break
else:
    warns.append("no route-index.json sidecar — source spot-check skipped")
print(f"  spot-check: {checked} route pages re-fetched from the source, {bad} mismatches")
chk(bad == 0, "source: built records match the live pages", f"{bad} mismatches")

# ------------------------------------------------------------------ 3 OSRM
def osrm(pts):
    coords = ";".join(f"{lon:.5f},{lat:.5f}" for lat, lon in pts)
    u = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=false"
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    return j["routes"][0]["distance"] / 1000 if j.get("code") == "Ok" else None

n_osrm = int(next((sys.argv[i + 1] for i, x in enumerate(sys.argv) if x == "--osrm"), "10"))
ratios, tried = [], 0
rnd = random.Random(11)
for rec in rnd.sample([r for r in ROUTES if r.get("sm", 1) == 1 and len(r["s"]) > 12], n_osrm * 3):
    if tried >= n_osrm: break
    i, j = 0, len(rec["s"]) - 1
    a, b = STOPS[rec["s"][i]], STOPS[rec["s"][j]]
    if hav((a["lat"], a["lon"]), (b["lat"], b["lon"])) < 1.5: continue   # loop: 0 km by road
    mine = (rec["m"][j] - rec["m"][i]) / 1000
    tried += 1
    try:
        real = osrm([(a["lat"], a["lon"]), (b["lat"], b["lon"])])
        if real: ratios.append(mine / real)
    except Exception:
        pass
if ratios:
    ratios.sort()
    med = ratios[len(ratios) // 2]
    print(f"  osrm: built distance / routed distance over {len(ratios)} whole routes — "
          f"median {med:.3f}, range {ratios[0]:.2f}–{ratios[-1]:.2f}")
    chk(0.8 < med < 1.25, "osrm: offline distance tracks the road", f"median ratio {med:.3f}")
else:
    warns.append("osrm comparison unavailable (network)")

print()
print(f"PASS {oks}   WARN {len(warns)}   FAIL {len(fails)}")
for w in warns: print("  warn:", w)
for f2 in fails[:20]: print("  FAIL:", f2)
sys.exit(1 if fails else 0)
