#!/usr/bin/env python3
"""
Round 3: solve the two hard problems.

  A) SEARCH REDUNDANCY — exactly one Piped mirror answers with CORS. If it
     blinks, the whole music section dies. Can a CORS proxy wrap the dead-to-us
     mirrors (they work over plain HTTP, they just omit the header)?
  B) ENDLESS PLAY — /streams is 500 everywhere, so there is no "relatedStreams"
     to autoplay. What else can produce "more songs like this"?

Also inventories what iTunes can give us for free (artist / album / chart
browsing), since it is one of the few sources with a real CORS header.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
Q, VID = "babbu maan", "4OriqsUzKgY"

def get(url, timeout=25, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, dict(r.headers), r.read(800000)

def probe(name, url, extract, data=None, headers=None, timeout=25):
    t = time.time()
    try:
        st, h, body = get(url, timeout, data, headers)
        acao = h.get("Access-Control-Allow-Origin", "—")
        try:
            txt = body.decode("utf-8", "replace")
            j = json.loads(txt)
            if isinstance(j, dict) and isinstance(j.get("contents"), str):
                j = json.loads(j["contents"])
            n, s = extract(j)
        except Exception as e:
            return (name, st, round(time.time()-t,1), acao, 0, f"parse:{str(e)[:38]}")
        return (name, st, round(time.time()-t,1), acao, n, s)
    except Exception as e:
        return (name, "ERR", round(time.time()-t,1), "—", 0, str(e)[:52])

def show(t, rows):
    print(f"\n=== {t} ===")
    for r in sorted(rows, key=lambda x: -x[4]):
        ok = "OK " if (r[4] and r[3] in ("*", ORIGIN)) else "   "
        print(f" {ok}{r[0]:<38}{str(r[1]):<5}{str(r[2]):>5}s CORS={r[3]:<4} n={r[4]:<4} {str(r[5])[:46]}")

PROXIES = {
    "corsproxy.io": lambda u: "https://corsproxy.io/?url=" + urllib.parse.quote(u, safe=""),
    "cors.sh":      lambda u: "https://proxy.cors.sh/" + u,
    "allorigins":   lambda u: "https://api.allorigins.win/raw?url=" + urllib.parse.quote(u, safe=""),
    "codetabs":     lambda u: "https://api.codetabs.com/v1/proxy?quest=" + urllib.parse.quote(u, safe=""),
}

# ---------------------------------------------- A) proxied Piped redundancy
MIRRORS = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de",
           "https://pipedapi.drgns.space", "https://api.piped.projectsegfau.lt",
           "https://pipedapi.orangenet.cc", "https://pipedapi.in.projectsegfau.lt"]
def ex_p(j):
    it = j.get("items") or []
    return len(it), (it[0].get("title") if it else "")
rows = []
with cf.ThreadPoolExecutor(16) as ex:
    futs = []
    for m in MIRRORS[:4]:
        tgt = f"{m}/search?q={urllib.parse.quote(Q)}&filter=music_songs"
        for pn, pf in PROXIES.items():
            futs.append(ex.submit(probe, f"{pn} → {m.split('//')[1][:22]}", pf(tgt), ex_p, None, None, 30))
    for f in cf.as_completed(futs): rows.append(f.result())
show("A) Piped mirrors behind a CORS proxy", rows)

# ------------------------------------- B1) related via the working mirror
B = "https://api.piped.private.coffee"
rel = [
    probe("channel of a video",  f"{B}/streams/{VID}",
          lambda j: (len(j.get("relatedStreams") or []), "related")),
    probe("search filter=all",   f"{B}/search?q={urllib.parse.quote(Q)}&filter=all",
          ex_p),
    probe("search playlists",    f"{B}/search?q={urllib.parse.quote(Q)}&filter=playlists",
          ex_p),
    probe("search channels",     f"{B}/search?q={urllib.parse.quote(Q)}&filter=channels",
          ex_p),
    probe("search music_videos", f"{B}/search?q={urllib.parse.quote(Q)}&filter=music_videos",
          ex_p),
    probe("search music_albums", f"{B}/search?q={urllib.parse.quote(Q)}&filter=music_albums",
          ex_p),
    probe("search music_artists",f"{B}/search?q={urllib.parse.quote(Q)}&filter=music_artists",
          ex_p),
    probe("trending IN",         f"{B}/trending?region=IN",
          lambda j: (len(j), j[0].get("title") if j else "")),
    probe("suggestions",         f"{B}/suggestions?query=punjabi",
          lambda j: (len(j), j[0] if j else "")),
]
show("B1) what the one live mirror can still do", rel)

# ------------------------------- B2) proxied /streams (related) as a fallback
sr = []
tgt = f"{B}/streams/{VID}"
for pn, pf in PROXIES.items():
    sr.append(probe(f"{pn} → streams", pf(tgt),
                    lambda j: (len(j.get("relatedStreams") or []),
                               (j.get("relatedStreams") or [{}])[0].get("title", "")), None, None, 32))
for m in ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de"]:
    sr.append(probe(f"cors.sh → {m.split('//')[1][:20]}/streams",
                    PROXIES["cors.sh"](f"{m}/streams/{VID}"),
                    lambda j: (len(j.get("relatedStreams") or []),
                               (j.get("relatedStreams") or [{}])[0].get("title", "")), None, None, 32))
show("B2) related tracks through a proxy", sr)

# ------------------------------------------------- C) iTunes as a catalogue
it = [
    ("artist search", "https://itunes.apple.com/search?term=" + urllib.parse.quote(Q) +
     "&entity=musicArtist&country=IN&limit=10",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("artistName", ""))),
    ("album search", "https://itunes.apple.com/search?term=" + urllib.parse.quote(Q) +
     "&entity=album&country=IN&limit=25",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("collectionName", ""))),
    ("artist lookup → songs", "https://itunes.apple.com/lookup?id=271256&entity=song&limit=25&country=IN",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[-1].get("trackName", ""))),
    ("genre: Bollywood", "https://itunes.apple.com/search?term=bollywood&media=music&country=IN&limit=50",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("trackName", ""))),
    ("genre: punjabi 2026", "https://itunes.apple.com/search?term=punjabi%202026&media=music&country=IN&limit=50",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("trackName", ""))),
    ("IN top songs RSS", "https://rss.applemarketingtools.com/api/v2/in/music/most-played/50/songs.json",
     lambda j: (len(j.get("feed", {}).get("results", [])),
                (j.get("feed", {}).get("results") or [{}])[0].get("name", ""))),
    ("PK top songs RSS", "https://rss.applemarketingtools.com/api/v2/pk/music/most-played/50/songs.json",
     lambda j: (len(j.get("feed", {}).get("results", [])),
                (j.get("feed", {}).get("results") or [{}])[0].get("name", ""))),
    ("IN top albums RSS", "https://rss.applemarketingtools.com/api/v2/in/music/most-played/25/albums.json",
     lambda j: (len(j.get("feed", {}).get("results", [])),
                (j.get("feed", {}).get("results") or [{}])[0].get("name", ""))),
]
rows = []
with cf.ThreadPoolExecutor(10) as ex:
    futs = [ex.submit(probe, n, u, e) for n, u, e in it]
    for f in cf.as_completed(futs): rows.append(f.result())
show("C) iTunes / Apple charts (CORS *)", rows)

# ------------------------------------------------- D) Audius real CORS check
au = []
for host in ["discoveryprovider.audius.co", "discoveryprovider2.audius.co",
             "audius-discovery-1.altego.net", "audius-metadata-1.figment.io"]:
    au.append(probe(f"{host[:30]} search",
                    f"https://{host}/v1/tracks/search?query={urllib.parse.quote(Q)}&app_name=omni",
                    lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))))
    au.append(probe(f"{host[:30]} trending",
                    f"https://{host}/v1/tracks/trending?app_name=omni&limit=30",
                    lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))))
show("D) Audius (direct-stream, no resolve needed)", au)

print("\nNOTE: 'CORS=—' means the browser will block it even though curl works.")
