#!/usr/bin/env python3
"""
Find every music SEARCH + CATALOGUE source that works from a browser Origin.

The app currently searches through two Piped mirrors only. To grow the music
section we need: more search mirrors, charts/trending, related tracks (for
endless autoplay), artist/album browsing, and playlist expansion.

Everything is probed with the real Origin the app runs on, because a source
that answers curl but omits CORS is useless to us.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
Q = "babbu maan"
VID = "4OriqsUzKgY"


def get(url, timeout=15, data=None, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h,
                                 method="POST" if data else "GET")
    t = time.time()
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, dict(r.headers), r.read(500000), time.time() - t


def probe(name, url, extract, data=None, headers=None, timeout=15):
    try:
        st, h, body, dt = get(url, timeout, data, headers)
        acao = h.get("Access-Control-Allow-Origin", "—")
        try:
            j = json.loads(body)
            n, sample = extract(j)
        except Exception as e:
            return (name, st, round(dt, 1), acao, 0, f"parse: {str(e)[:45]}")
        return (name, st, round(dt, 1), acao, n, sample)
    except Exception as e:
        return (name, "ERR", "—", "—", 0, str(e)[:60])


def show(title, rows):
    print(f"\n=== {title} ===")
    for r in sorted(rows, key=lambda x: -x[4]):
        ok = "OK " if (r[4] and r[3] in ("*", ORIGIN)) else "   "
        print(f" {ok}{r[0]:<30} {str(r[1]):<5} {str(r[2]):>5}s CORS={r[3]:<4} n={r[4]:<4} {str(r[5])[:60]}")


# ---------------------------------------------------------------- Piped pool
PIPED = [
    "https://api.piped.private.coffee", "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de", "https://pipedapi.leptons.xyz",
    "https://pipedapi.ducks.party", "https://piped-api.lunar.icu",
    "https://pipedapi.reallyaweso.me", "https://api.piped.yt",
    "https://pipedapi.drgns.space", "https://piped-api.codespace.cz",
    "https://pipedapi.phoenixthrush.com", "https://pipedapi.astartes.nl",
    "https://pipedapi.reallypointless.com", "https://api.piped.projectsegfau.lt",
    "https://pipedapi.smnz.de", "https://pipedapi.syncpundit.io",
    "https://pipedapi.in.projectsegfau.lt", "https://pipedapi.us.projectsegfau.lt",
    "https://pipedapi.ehwurscht.at", "https://api.piped.privacydev.net",
]
def ex_piped(j):
    it = j.get("items") or []
    return len(it), (it[0].get("title") if it else "")

rows = []
with cf.ThreadPoolExecutor(20) as ex:
    futs = {ex.submit(probe, base.split("//")[1][:28],
                      f"{base}/search?q={urllib.parse.quote(Q)}&filter=music_songs",
                      ex_piped): base for base in PIPED}
    for f in cf.as_completed(futs):
        rows.append(f.result())
show("Piped mirrors — SEARCH", rows)
GOOD_PIPED = [r[0] for r in rows if r[4] and r[3] in ("*", ORIGIN)]

# --------------------------------------------------- Piped extras on winners
extra = []
for host in GOOD_PIPED[:6]:
    base = "https://" + host
    extra.append(probe(f"{host[:20]} trending",
                       f"{base}/trending?region=IN",
                       lambda j: (len(j), j[0].get("title") if j else "")))
    extra.append(probe(f"{host[:20]} suggest",
                       f"{base}/suggestions?query=babbu",
                       lambda j: (len(j), j[0] if j else "")))
show("Piped mirrors — trending / suggestions", extra)

# ------------------------------------------------------------- Invidious
INV = [
    "https://inv.nadeko.net", "https://invidious.f5.si", "https://yewtu.be",
    "https://invidious.nerdvpn.de", "https://inv.tux.pizza",
    "https://invidious.privacyredirect.com", "https://iv.datura.network",
    "https://invidious.reallyaweso.me", "https://inv.vern.cc",
    "https://invidious.perennialte.ch", "https://invidious.einfachzocken.eu",
    "https://iv.melmac.space", "https://invidious.jing.rocks",
]
def ex_inv(j):
    if isinstance(j, list):
        return len(j), (j[0].get("title") if j else "")
    return 0, str(j)[:40]

rows = []
with cf.ThreadPoolExecutor(16) as ex:
    futs = [ex.submit(probe, b.split("//")[1][:28],
                      f"{b}/api/v1/search?q={urllib.parse.quote(Q)}&type=video",
                      ex_inv) for b in INV]
    for f in cf.as_completed(futs):
        rows.append(f.result())
show("Invidious — SEARCH", rows)

# ----------------------------------------------- YouTube Music internal API
YTM_KEY = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30"
ytm_body = json.dumps({
    "context": {"client": {"clientName": "WEB_REMIX", "clientVersion": "1.20240101.01.00",
                           "hl": "en", "gl": "IN"}},
    "query": Q, "params": "EgWKAQIIAWoKEAoQAxAEEAUQCQ==",
}).encode()
def ex_ytm(j):
    s = json.dumps(j)
    return s.count('"videoId"'), s[:40]
show("YouTube Music internal", [probe(
    "music.youtube youtubei/search",
    f"https://music.youtube.com/youtubei/v1/search?key={YTM_KEY}&prettyPrint=false",
    ex_ytm, data=ytm_body,
    headers={"Content-Type": "application/json", "X-Goog-Api-Format-Version": "1"})])

# --------------------------------------------------------- other catalogues
others = [
    ("Audius search",
     "https://discoveryprovider.audius.co/v1/tracks/search?query=" + urllib.parse.quote(Q) + "&app_name=omni",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Audius trending IN",
     "https://discoveryprovider.audius.co/v1/tracks/trending?app_name=omni&limit=20",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Jamendo tracks",
     "https://api.jamendo.com/v3.0/tracks/?client_id=56d30c95&format=json&limit=10&search=" + urllib.parse.quote(Q),
     lambda j: (len(j.get("results", [])), (j.get("results") or [{}])[0].get("name", ""))),
    ("Deezer search (jsonp host)",
     "https://api.deezer.com/search?q=" + urllib.parse.quote(Q),
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("iTunes search",
     "https://itunes.apple.com/search?term=" + urllib.parse.quote(Q) + "&media=music&limit=25",
     lambda j: (j.get("resultCount", 0), (j.get("results") or [{}])[0].get("trackName", ""))),
    ("MusicBrainz recording",
     "https://musicbrainz.org/ws/2/recording?query=" + urllib.parse.quote(Q) + "&fmt=json&limit=10",
     lambda j: (len(j.get("recordings", [])), (j.get("recordings") or [{}])[0].get("title", ""))),
    ("Last.fm-ish: Deezer chart IN",
     "https://api.deezer.com/chart/0/tracks?limit=25",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("title", ""))),
    ("Saavn unofficial search",
     "https://saavn.dev/api/search/songs?query=" + urllib.parse.quote(Q),
     lambda j: (len((j.get("data") or {}).get("results", [])),
                ((j.get("data") or {}).get("results") or [{}])[0].get("name", ""))),
    ("Saavn unofficial (jiosaavn.com)",
     "https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=" + urllib.parse.quote(Q),
     lambda j: (len(((j.get("data") or {}).get("results") or [])),
                (((j.get("data") or {}).get("results") or [{}])[0]).get("name", ""))),
    ("Radio Browser (desi)",
     "https://de1.api.radio-browser.info/json/stations/search?language=punjabi&limit=20",
     lambda j: (len(j), j[0].get("name") if j else "")),
]
rows = []
with cf.ThreadPoolExecutor(12) as ex:
    futs = [ex.submit(probe, n, u, e) for n, u, e in others]
    for f in cf.as_completed(futs):
        rows.append(f.result())
show("Other catalogues", rows)

# --------------------------------------- related tracks (endless autoplay)
rel = []
for host in GOOD_PIPED[:4]:
    rel.append(probe(f"{host[:20]} /streams related",
                     f"https://{host}/streams/{VID}",
                     lambda j: (len(j.get("relatedStreams", []) or []),
                                (j.get("relatedStreams") or [{}])[0].get("title", ""))))
for host in GOOD_PIPED[:3]:
    rel.append(probe(f"{host[:20]} playlist mix",
                     f"https://{host}/playlists/RD{VID}",
                     lambda j: (len(j.get("relatedStreams", []) or []),
                                (j.get("relatedStreams") or [{}])[0].get("title", ""))))
show("Related / mix (endless play)", rel)

print("\n\nSUMMARY")
print("  usable Piped search mirrors:", len(GOOD_PIPED))
for g in GOOD_PIPED: print("   ", g)
