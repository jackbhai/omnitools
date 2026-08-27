#!/usr/bin/env python3
"""
Round 2: the app cannot depend on ONE Piped mirror.

Round 1 found exactly one working search mirror and no working "related"
endpoint, which means no endless autoplay and no redundancy. This hunts for:
  · more Piped instances (from the live instance registry, not a hardcoded list)
  · YouTube Music / youtubei with the right client spoof
  · JioSaavn mirrors (huge Indian catalogue, has direct MP3 URLs)
  · anything that returns RELATED tracks so playback can continue forever
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
Q = "babbu maan"
VID = "4OriqsUzKgY"

def get(url, timeout=14, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, dict(r.headers), r.read(600000)

def probe(name, url, extract, data=None, headers=None, timeout=14):
    t = time.time()
    try:
        st, h, body = get(url, timeout, data, headers)
        acao = h.get("Access-Control-Allow-Origin", "—")
        try:
            n, sample = extract(json.loads(body))
        except Exception as e:
            return (name, st, round(time.time() - t, 1), acao, 0, f"parse:{str(e)[:40]}")
        return (name, st, round(time.time() - t, 1), acao, n, sample)
    except Exception as e:
        return (name, "ERR", round(time.time() - t, 1), "—", 0, str(e)[:55])

def show(title, rows):
    print(f"\n=== {title} ===")
    for r in sorted(rows, key=lambda x: -x[4]):
        ok = "OK " if (r[4] and r[3] in ("*", ORIGIN)) else "   "
        print(f" {ok}{r[0]:<34}{str(r[1]):<5}{str(r[2]):>5}s CORS={r[3]:<4} n={r[4]:<4} {str(r[5])[:52]}")

# ------------------------------------------- 1. live Piped instance registry
print("fetching the live Piped instance list…")
instances = []
for reg in ("https://piped-instances.kavin.rocks/",
            "https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md"):
    try:
        st, h, body = get(reg, 20)
        txt = body.decode("utf-8", "replace")
        if reg.endswith("/"):
            for it in json.loads(txt):
                if it.get("api_url"): instances.append(it["api_url"])
        else:
            import re
            instances += re.findall(r"https://[a-z0-9.\-]*pipedapi[a-z0-9.\-]*", txt)
            instances += re.findall(r"https://api[a-z0-9.\-]*piped[a-z0-9.\-]*", txt)
        print(f"  {reg[:50]} → {len(instances)} so far")
    except Exception as e:
        print(f"  {reg[:50]} failed: {str(e)[:50]}")
instances = sorted(set(instances))
print(f"  {len(instances)} unique instances to test")

def ex_piped(j):
    it = j.get("items") or []
    return len(it), (it[0].get("title") if it else "")

rows = []
if instances:
    with cf.ThreadPoolExecutor(24) as ex:
        futs = [ex.submit(probe, b.split("//")[-1][:32],
                          f"{b}/search?q={urllib.parse.quote(Q)}&filter=music_songs",
                          ex_piped) for b in instances]
        for f in cf.as_completed(futs): rows.append(f.result())
show("Piped registry — SEARCH", rows)
GOOD = ["https://" + r[0] for r in rows if r[4] and r[3] in ("*", ORIGIN)]

# ------------------------------------------------- 2. related on the winners
rel = []
for b in GOOD[:8]:
    host = b.split("//")[1][:26]
    rel.append(probe(f"{host} streams",  f"{b}/streams/{VID}",
                     lambda j: (len(j.get("relatedStreams") or []),
                                (j.get("relatedStreams") or [{}])[0].get("title", ""))))
    rel.append(probe(f"{host} nextpage", f"{b}/nextpage/search?q={urllib.parse.quote(Q)}&filter=music_songs&nextpage=1",
                     lambda j: (len(j.get("items") or []), "paged")))
show("Related + pagination", rel)

# --------------------------------------------------- 3. youtubei client spoof
CLIENTS = [
    ("ANDROID_MUSIC", "5.16.51", None),
    ("WEB_REMIX", "1.20240403.01.00", None),
    ("IOS_MUSIC", "5.21", None),
    ("ANDROID", "17.31.35", None),
]
yt_rows = []
for cname, cver, _ in CLIENTS:
    body = json.dumps({
        "context": {"client": {"clientName": cname, "clientVersion": cver,
                               "hl": "en", "gl": "IN", "androidSdkVersion": 30}},
        "query": Q,
    }).encode()
    yt_rows.append(probe(
        f"youtubei search {cname}",
        "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
        lambda j: (json.dumps(j).count('"videoId"'), "ids"),
        data=body, headers={"Content-Type": "application/json"}))
    nbody = json.dumps({
        "context": {"client": {"clientName": cname, "clientVersion": cver, "hl": "en", "gl": "IN"}},
        "videoId": VID,
    }).encode()
    yt_rows.append(probe(
        f"youtubei next {cname}",
        "https://music.youtube.com/youtubei/v1/next?prettyPrint=false",
        lambda j: (json.dumps(j).count('"videoId"'), "queue ids"),
        data=nbody, headers={"Content-Type": "application/json"}))
show("youtubei (YouTube Music internal)", yt_rows)

# --------------------------------------------------------- 4. JioSaavn family
SAAVN = [
    "https://saavn.dev/api",
    "https://jiosaavn-api-ts.vercel.app/api",
    "https://jiosaavn-api-2-harsh-patel.vercel.app/api",
    "https://saavn.me/api",
    "https://jiosaavn-api-privatecvc.vercel.app",
    "https://jiosaavnapi-nine.vercel.app/api",
    "https://saavnapi-nine.vercel.app",
    "https://jio-saavn-api-sigma.vercel.app/api",
    "https://jiosaavn-api-pi.vercel.app/api",
    "https://saavn-api.nandha.dev/api",
]
def ex_saavn(j):
    d = j.get("data") or j
    res = d.get("results") if isinstance(d, dict) else d
    if not isinstance(res, list): return 0, str(d)[:35]
    first = res[0] if res else {}
    return len(res), (first.get("name") or first.get("song") or "")
rows = []
with cf.ThreadPoolExecutor(12) as ex:
    futs = [ex.submit(probe, b.split("//")[1][:32],
                      f"{b}/search/songs?query={urllib.parse.quote(Q)}", ex_saavn) for b in SAAVN]
    for f in cf.as_completed(futs): rows.append(f.result())
show("JioSaavn mirrors (Indian catalogue + direct MP3)", rows)

# ------------------------------------------------------- 5. misc catalogues
misc = [
    ("Audius search (no CORS?)",
     "https://discoveryprovider2.audius.co/v1/tracks/search?query=" + urllib.parse.quote(Q) + "&app_name=omni",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Audius dp3",
     "https://discoveryprovider3.audius.co/v1/tracks/search?query=" + urllib.parse.quote(Q) + "&app_name=omni",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("iTunes IN songs",
     "https://itunes.apple.com/search?term=" + urllib.parse.quote(Q) + "&media=music&country=IN&limit=50",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("trackName", ""))),
    ("iTunes lookup artist top",
     "https://itunes.apple.com/search?term=punjabi&media=music&country=IN&limit=50",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("trackName", ""))),
    ("Radio Browser hindi",
     "https://de1.api.radio-browser.info/json/stations/search?language=hindi&limit=40",
     lambda j: (len(j), j[0].get("name") if j else "")),
    ("Radio Browser tag=bollywood",
     "https://de1.api.radio-browser.info/json/stations/bytag/bollywood?limit=40",
     lambda j: (len(j), j[0].get("name") if j else "")),
]
rows = []
with cf.ThreadPoolExecutor(8) as ex:
    futs = [ex.submit(probe, n, u, e) for n, u, e in misc]
    for f in cf.as_completed(futs): rows.append(f.result())
show("Misc catalogues", rows)

print("\n\nSUMMARY")
print(f"  working Piped search mirrors: {len(GOOD)}")
for g in GOOD: print("   ", g)
