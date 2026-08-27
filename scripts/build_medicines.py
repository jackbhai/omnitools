#!/usr/bin/env python3
"""
Build a sharded, searchable medicine index from REAL public datasets.

Sources (all verified live before use):
  1. junioralive/Indian-Medicine-Dataset — 253,973 Indian brands.
     name, price(INR), discontinued, manufacturer, type, pack, composition x2.
     raw.githubusercontent.com serves it with Access-Control-Allow-Origin: *
  2. dmedhi/indian-medicines (HuggingFace, 11,825 rows) — USES + SIDE EFFECTS
     + product photo, merged by name so shards carry clinical text offline.

Output (public/med/):
  _meta.json        bucket -> count, totals, build date
  <xx>.json         self-contained shard: local string dict + records
  s<nn>.json        composition -> cheapest brands, for substitute lookup
                    (flat, NOT a subdirectory: a nested public/med/salt/ was
                     served as the SPA index.html by the dev server and every
                     substitute lookup parsed HTML instead of JSON)
  _salts.json       list of every composition + how many brands + shard id

Shards are SELF-CONTAINED (own local dict) so one search = one small fetch.
"""
import csv, io, json, os, re, sys, time, unicodedata, urllib.request, urllib.error
import gzip, collections, datetime, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'med')
CSV_URL = ("https://raw.githubusercontent.com/junioralive/Indian-Medicine-Dataset"
           "/main/DATA/indian_medicine_data.csv")
HF = ("https://datasets-server.huggingface.co/rows"
      "?dataset=dmedhi%2Findian-medicines&config=default&split=train&offset={}&length=100")
UA = {"User-Agent": "OmniTools/1.0 (+https://jackbhai.github.io/omnitools/)"}
SALT_SHARDS = 64

def fetch(url, timeout=240):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").strip())
    return re.sub(r"\s+", " ", s)

def key(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

def saltkey(s):
    """Normalised composition key: sorted ingredient names, dosage-insensitive."""
    parts = re.split(r"\s*\+\s*", (s or "").lower())
    out = []
    for p in parts:
        p = re.sub(r"\([^)]*\)", "", p)
        p = re.sub(r"[^a-z0-9]+", "", p)
        if p: out.append(p)
    return "+".join(sorted(set(out)))

def shard_of(sk, n):
    """FNV-1a 32-bit. Trivial to reimplement identically in JS — an earlier
    version used md5 here and the hand-rolled browser md5 disagreed with
    Python's, so every substitute lookup fetched the wrong shard and returned
    nothing. A hash this simple cannot drift."""
    h = 0x811c9dc5
    for b in sk.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h % n

# ---------------------------------------------------------------- 1. base CSV
cache = "/tmp/med.csv"
if not os.path.exists(cache) or os.path.getsize(cache) < 1_000_000:
    print("downloading base dataset…", flush=True)
    open(cache, "wb").write(fetch(CSV_URL))
rows = list(csv.DictReader(io.StringIO(open(cache, encoding="utf-8", errors="replace").read())))
print(f"base rows: {len(rows):,}")

# ---------------------------------------------------------- 2. clinical text
clin, clin_cache = {}, "/tmp/med_clinical.json"
if os.path.exists(clin_cache):
    clin = json.load(open(clin_cache))
want = 11825
if len(clin) < want * 0.95:
    print(f"pulling clinical text from HuggingFace (have {len(clin)})…", flush=True)
    off, misses = 0, 0
    while off < want and misses < 6:
        try:
            d = json.loads(fetch(HF.format(off), 90))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                misses += 1; time.sleep(8 * misses); continue
            misses += 1; time.sleep(3); continue
        except Exception:
            misses += 1; time.sleep(3); continue
        misses = 0
        rs = d.get("rows", [])
        if not rs: break
        for r in rs:
            v = r["row"]
            clin[key(v["name"])] = {"u": norm(v.get("uses")), "s": norm(v.get("side_effects")),
                                    "i": (v.get("image_url") or "").strip()}
        off += len(rs)
        want = d.get("num_rows_total", want)
        if off % 2000 == 0:
            print("   ", off, flush=True); json.dump(clin, open(clin_cache, "w"))
        time.sleep(0.25)
    json.dump(clin, open(clin_cache, "w"))
print(f"clinical rows: {len(clin):,}")

# ---------------------------------------------------------- 3. group + dedupe
buckets = collections.defaultdict(list)
by_salt = collections.defaultdict(list)
seen = set()
n_clin = 0

for r in rows:
    name = norm(r.get("name"))
    if not name: continue
    k = key(name)
    if not k: continue
    pack = norm(r.get("pack_size_label"))
    try: price = round(float(r.get("price(₹)") or 0), 2)
    except Exception: price = 0
    if (k, pack, price) in seen: continue
    seen.add((k, pack, price))

    c1, c2 = norm(r.get("short_composition1")), norm(r.get("short_composition2"))
    comp = (c1 + (" + " + c2 if c2 else "")).strip(" +")
    mfr = norm(r.get("manufacturer_name"))
    disc = 1 if str(r.get("Is_discontinued")).upper() == "TRUE" else 0
    cl = clin.get(k)
    if cl: n_clin += 1

    buckets[(k[:2] or "_").ljust(2, "_")].append(
        {"n": name, "p": price, "m": mfr, "c": comp, "k": pack, "d": disc,
         "u": (cl or {}).get("u", ""), "s": (cl or {}).get("s", ""), "i": (cl or {}).get("i", "")})

    sk = saltkey(comp)
    if sk and price > 0 and not disc:
        by_salt[sk].append((price, name, mfr, pack))

print(f"merged clinical onto {n_clin:,} rows · {len(buckets)} name buckets · {len(by_salt):,} salts")

# --------------------------------------------------------------- 4. emit
os.makedirs(OUT, exist_ok=True)
for root, dirs, files in os.walk(OUT, topdown=False):
    for f in files: os.remove(os.path.join(root, f))
    for d in dirs: os.rmdir(os.path.join(root, d))

meta = {"buckets": {}, "total": 0, "clinical": n_clin, "salts": len(by_salt),
        "saltShards": SALT_SHARDS,
        "src": "junioralive/Indian-Medicine-Dataset + dmedhi/indian-medicines",
        "built": datetime.date.today().isoformat()}

def intern_shard(recs):
    """Per-shard local dictionaries: shard stays self-contained AND small."""
    pools = {f: {} for f in "mcku s".replace(" ", "")}
    order = {f: [] for f in pools}
    def idx(f, v):
        if not v: return -1
        if v not in pools[f]:
            pools[f][v] = len(order[f]); order[f].append(v)
        return pools[f][v]
    out = []
    for r in recs:
        row = [r["n"], r["p"], idx("m", r["m"]), idx("c", r["c"]),
               idx("k", r["k"]), r["d"]]
        if r["u"] or r["s"] or r["i"]:
            row += [idx("u", r["u"]), idx("s", r["s"]), r["i"]]
        out.append(row)
    return {"m": order["m"], "c": order["c"], "k": order["k"],
            "u": order["u"], "s": order["s"], "r": out}

# Merge tiny shards before writing.
#
# Sharding on two letters produced 688 name files, 513 of them under 20 KB and
# holding only 1.8 MB between them. That file COUNT is what made the Pages
# deploy time out — the bytes were never the problem. Rare prefixes are folded
# into their single-letter parent ("qz" -> "q"), which keeps a search to one
# fetch while cutting the file count by roughly two thirds.
MERGE_UNDER = 400          # records; below this a prefix is not worth its own file

merged = {}
for b, recs in buckets.items():
    key = b if len(recs) >= MERGE_UNDER else (b[0] + "_")
    merged.setdefault(key, []).extend(recs)

# meta maps every two-letter prefix to the file that actually holds it, so the
# client can still resolve a query to exactly one request.
route = {}
for b in buckets:
    route[b] = b if len(buckets[b]) >= MERGE_UNDER else (b[0] + "_")

for b, recs in sorted(merged.items()):
    recs.sort(key=lambda x: (x["d"], x["n"]))
    json.dump(intern_shard(recs), open(os.path.join(OUT, f"{b}.json"), "w"),
              separators=(",", ":"), ensure_ascii=False)
    meta["buckets"][b] = len(recs)
    meta["total"] += len(recs)
meta["route"] = route

# ---- salt shards: cheapest 30 brands per composition (substitute finder)
salt_files = collections.defaultdict(dict)
salt_list = {}
for sk, lst in by_salt.items():
    lst.sort()
    shard = shard_of(sk, SALT_SHARDS)
    salt_files[shard][sk] = [[round(p, 2), n, m, k] for p, n, m, k in lst[:30]]
    salt_list[sk] = [len(lst), round(lst[0][0], 2), round(lst[-1][0], 2)]
for shard, d in salt_files.items():
    json.dump(d, open(os.path.join(OUT, f"s{shard}.json"), "w"),
              separators=(",", ":"), ensure_ascii=False)
json.dump(salt_list, open(os.path.join(OUT, "_salts.json"), "w"),
          separators=(",", ":"), ensure_ascii=False)
json.dump(meta, open(os.path.join(OUT, "_meta.json"), "w"), separators=(",", ":"))

sizes = []
for root, _, files in os.walk(OUT):
    for f in files: sizes.append((os.path.getsize(os.path.join(root, f)), os.path.relpath(os.path.join(root, f), OUT)))
tot = sum(s for s, _ in sizes)
sizes.sort(reverse=True)
print(f"\nwrote {len(sizes)} files · {tot/1e6:.1f} MB · {meta['total']:,} medicines")
print("largest:", ", ".join(f"{f} {s/1e3:.0f}KB" for s, f in sizes[:5]))
big = os.path.join(OUT, sizes[0][1])
print(f"biggest gzips to {len(gzip.compress(open(big,'rb').read()))/1e3:.0f} KB")
med = sizes[len(sizes)//2]
print(f"median shard {med[1]} {med[0]/1e3:.0f}KB")
