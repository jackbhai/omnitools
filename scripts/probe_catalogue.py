#!/usr/bin/env python3
"""
Now that we own a proxy, which music catalogues become reachable?

Plenty of good sources were rejected earlier for ONE reason: they answer fine
over plain HTTP but send no Access-Control-Allow-Origin, so a browser refuses
them. A Cloudflare Worker we control removes that limitation entirely.

This re-tests every catalogue that was previously discarded, both directly and
through the Worker, and checks the specific songs the user said were missing.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

WORKER = "https://omni-proxy.omni-jackbhai.workers.dev"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, r.read(900000)

def viaworker(u):
    return f"{WORKER}/?url={urllib.parse.quote(u, safe='')}"

def probe(name, url, extract, proxied=False, timeout=30):
    t = time.time()
    target = viaworker(url) if proxied else url
    try:
        st, body = get(target, timeout)
        try:
            n, s = extract(json.loads(body))
        except Exception as e:
            return (name, st, round(time.time()-t,1), 0, f"parse:{str(e)[:34]}")
        return (name, st, round(time.time()-t,1), n, s)
    except Exception as e:
        return (name, "ERR", round(time.time()-t,1), 0, str(e)[:48])

def show(title, rows):
    print(f"\n=== {title} ===")
    for r in sorted(rows, key=lambda x: -x[3]):
        flag = "OK " if r[3] else "   "
        print(f" {flag}{r[0]:<34}{str(r[1]):<5}{str(r[2]):>6}s n={r[3]:<5}{str(r[4])[:44]}")

Q = "babbu maan"

# ------------------------------------------------- previously CORS-blocked
SOURCES = [
    # Audius — free, decentralised, DIRECT streams (no resolve step at all)
    ("Audius search", f"https://discoveryprovider.audius.co/v1/tracks/search?query={urllib.parse.quote(Q)}&app_name=omni",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Audius trending", "https://discoveryprovider.audius.co/v1/tracks/trending?app_name=omni&limit=30",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    # Deezer — huge catalogue, 30 s previews, great metadata
    ("Deezer search", f"https://api.deezer.com/search?q={urllib.parse.quote(Q)}&limit=40",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Deezer chart IN", "https://api.deezer.com/chart/0/tracks?limit=40",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Deezer artist search", f"https://api.deezer.com/search/artist?q={urllib.parse.quote(Q)}&limit=10",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("name", ""))),
    # Piped mirrors that work but omit CORS
    ("Piped kavin", f"https://pipedapi.kavin.rocks/search?q={urllib.parse.quote(Q)}&filter=music_songs",
     lambda j: (len(j.get("items", [])), (j.get("items") or [{}])[0].get("title", ""))),
    ("Piped adminforge", f"https://pipedapi.adminforge.de/search?q={urllib.parse.quote(Q)}&filter=music_songs",
     lambda j: (len(j.get("items", [])), (j.get("items") or [{}])[0].get("title", ""))),
    ("Piped drgns", f"https://pipedapi.drgns.space/search?q={urllib.parse.quote(Q)}&filter=music_songs",
     lambda j: (len(j.get("items", [])), (j.get("items") or [{}])[0].get("title", ""))),
    ("Piped projectsegfau", f"https://api.piped.projectsegfau.lt/search?q={urllib.parse.quote(Q)}&filter=music_songs",
     lambda j: (len(j.get("items", [])), (j.get("items") or [{}])[0].get("title", ""))),
    # Invidious — another YouTube front-end family
    ("Invidious nadeko", f"https://inv.nadeko.net/api/v1/search?q={urllib.parse.quote(Q)}&type=video",
     lambda j: (len(j) if isinstance(j, list) else 0, (j[0].get("title") if isinstance(j, list) and j else ""))),
    ("Invidious yewtu", f"https://yewtu.be/api/v1/search?q={urllib.parse.quote(Q)}&type=video",
     lambda j: (len(j) if isinstance(j, list) else 0, (j[0].get("title") if isinstance(j, list) and j else ""))),
    ("Invidious f5", f"https://invidious.f5.si/api/v1/search?q={urllib.parse.quote(Q)}&type=video",
     lambda j: (len(j) if isinstance(j, list) else 0, (j[0].get("title") if isinstance(j, list) and j else ""))),
]

direct, prox = [], []
with cf.ThreadPoolExecutor(12) as ex:
    fd = [ex.submit(probe, n, u, e, False) for n, u, e in SOURCES]
    fp = [ex.submit(probe, n, u, e, True) for n, u, e in SOURCES]
    for f in cf.as_completed(fd): direct.append(f.result())
    for f in cf.as_completed(fp): prox.append(f.result())

show("DIRECT (browser would also need CORS — this only proves the API is alive)", direct)
show("THROUGH THE WORKER (this is what the app can actually use)", prox)

# --------------------------------------- the songs the user said were missing
print("\n\n=== THE SONGS THAT WERE MISSING ===")
WANT = ["babbu maan touchwood", "ishq murshid", "cheema y",
        "haryanvi songs", "coke studio pakistan", "bollywood 2026"]
BASE = "https://api.piped.private.coffee"

def hunt(q):
    out = {}
    for filt in ("music_songs", "music_videos", "all"):
        try:
            st, body = get(f"{BASE}/search?q={urllib.parse.quote(q)}&filter={filt}", 20)
            for it in (json.loads(body).get("items") or []):
                u = it.get("url", "")
                if "v=" in u:
                    out[u.split("v=")[1][:11]] = it.get("title", "")
        except Exception:
            pass
    return q, out

with cf.ThreadPoolExecutor(6) as ex:
    for q, found in ex.map(hunt, WANT):
        print(f"  {q:<26} {len(found):>3} tracks   {list(found.values())[0][:42] if found else 'NOTHING'}")

# --------------------------------------------- Audius stream check (no resolve!)
print("\n=== Audius: does it hand out a playable stream with no resolve step? ===")
try:
    st, body = get(viaworker(f"https://discoveryprovider.audius.co/v1/tracks/search?query=punjabi&app_name=omni"), 30)
    d = json.loads(body).get("data") or []
    print(f"  {len(d)} tracks for 'punjabi'")
    if d:
        tid = d[0]["id"]
        print(f"  first: {d[0].get('title')} by {(d[0].get('user') or {}).get('name')}")
        surl = f"https://discoveryprovider.audius.co/v1/tracks/{tid}/stream?app_name=omni"
        req = urllib.request.Request(viaworker(surl), headers={"User-Agent": UA, "Range": "bytes=0-99999"})
        with urllib.request.urlopen(req, timeout=40, context=CTX) as r:
            b = r.read()
        print(f"  stream: HTTP {r.status}, {len(b)} bytes, type={r.headers.get('Content-Type')}")
except Exception as e:
    print("  failed:", str(e)[:70])
