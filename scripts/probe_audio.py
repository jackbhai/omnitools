#!/usr/bin/env python3
"""Measure every CORS proxy + every audio-extraction backend, from a browser-like Origin."""
import concurrent.futures as cf, json, time, urllib.parse, urllib.request, ssl

ORIGIN = "https://jackbhai.github.io"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
VID = "4OriqsUzKgY"
YT = f"https://www.youtube.com/watch?v={VID}"
AHM7 = "https://ahm7xmakki.com/api/alldl?url=" + urllib.parse.quote(YT, safe="")
CTX = ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE

PROXIES = {
  "cors.sh":        lambda u: "https://proxy.cors.sh/" + u,
  "allorigins/raw": lambda u: "https://api.allorigins.win/raw?url=" + urllib.parse.quote(u, safe=""),
  "codetabs":       lambda u: "https://api.codetabs.com/v1/proxy?quest=" + urllib.parse.quote(u, safe=""),
  "isomorphic":     lambda u: "https://cors.isomorphic-git.org/" + u,
  "thingproxy":     lambda u: "https://thingproxy.freeboard.io/fetch/" + u,
  "corsproxy.io":   lambda u: "https://corsproxy.io/?url=" + urllib.parse.quote(u, safe=""),
  "whateverorigin": lambda u: "https://www.whateverorigin.org/get?url=" + urllib.parse.quote(u, safe=""),
  "cors-anywhere-hf": lambda u: "https://cors-anywhere.herokuapp.com/" + u,
  "jsonp.afeld":    lambda u: "https://jsonp.afeld.me/?url=" + urllib.parse.quote(u, safe=""),
  "crossorigin.me": lambda u: "https://crossorigin.me/" + u,
  "yacdn":          lambda u: "https://yacdn.org/serve/" + u,
  "cdn.jsdelivr-x": lambda u: "https://api.cors.lol/?url=" + urllib.parse.quote(u, safe=""),
  "corsfix":        lambda u: "https://proxy.corsfix.com/?" + u,
  "test.cors.workers.dev": lambda u: "https://test.cors.workers.dev/?" + u,
  "cors.eu.org":    lambda u: "https://cors.eu.org/" + u,
  "everyorigin":    lambda u: "https://everyorigin.jwvbremen.nl/get?url=" + urllib.parse.quote(u, safe=""),
}

def get(url, timeout=25, origin=True):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*",
        **({"Origin": ORIGIN, "Referer": ORIGIN + "/"} if origin else {}),
        "x-requested-with": "XMLHttpRequest",
    })
    t = time.time()
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        body = r.read(400000)
        return r.status, dict(r.headers), body, time.time() - t

def probe_proxy(name, wrap):
    try:
        st, h, body, dt = get(wrap(AHM7), 28)
        acao = h.get("Access-Control-Allow-Origin", "-")
        ok = False; note = ""
        try:
            j = json.loads(body.decode("utf-8", "replace"))
            if isinstance(j, dict) and "contents" in j:
                j = json.loads(j["contents"])
            au = (j.get("mediaInfo") or {}).get("audioUrl")
            ok = bool(au); note = (au or "")[:50]
        except Exception as e:
            note = "parse:" + str(e)[:40]
        return name, st, round(dt, 1), acao, ok, note
    except Exception as e:
        return name, "ERR", "-", "-", False, str(e)[:70]

print("=== CORS proxies wrapping AHM7 alldl ===")
with cf.ThreadPoolExecutor(20) as ex:
    for r in ex.map(lambda kv: probe_proxy(*kv), PROXIES.items()):
        print(f"  {r[0]:<24} {str(r[1]):<6} {str(r[2]):>5}s  CORS={r[3]:<4} ok={r[4]}  {r[5]}")

print("\n=== direct AHM7 (does it send CORS now?) ===")
try:
    st, h, b, dt = get(AHM7, 40)
    print("  status", st, round(dt,1), "s  ACAO=", h.get("Access-Control-Allow-Origin","NONE"))
    print("  keys:", list(json.loads(b).keys()))
except Exception as e:
    print("  ERR", e)

print("\n=== alternative extractors ===")
ALTS = {
 "cobalt.tools":  ("https://api.cobalt.tools/api/json", None),
 "piped.cf/streams": (f"https://pipedapi.kavin.rocks/streams/{VID}", None),
 "piped.coffee/streams": (f"https://api.piped.private.coffee/streams/{VID}", None),
 "piped.adminforge": (f"https://pipedapi.adminforge.de/streams/{VID}", None),
 "piped.reallyaweso": (f"https://api.piped.reallyaweso.me/streams/{VID}", None),
 "piped.leptons": (f"https://pipedapi.leptons.xyz/streams/{VID}", None),
 "piped.ducks": (f"https://pipedapi.ducks.party/streams/{VID}", None),
 "piped.drgns": (f"https://piped-api.drgns.space/streams/{VID}", None),
 "piped.smnz": (f"https://pipedapi.smnz.de/streams/{VID}", None),
 "inv.nadeko": (f"https://inv.nadeko.net/api/v1/videos/{VID}", None),
 "yewtu.be":   (f"https://yewtu.be/api/v1/videos/{VID}", None),
 "invidious.f5": (f"https://invidious.f5.si/api/v1/videos/{VID}", None),
 "inv.perennialte": (f"https://invidious.perennialte.ch/api/v1/videos/{VID}", None),
 "iv.melmac":  (f"https://iv.melmac.space/api/v1/videos/{VID}", None),
 "inv.projectsegfau": (f"https://invidious.projectsegfau.lt/api/v1/videos/{VID}", None),
 "vid.puffyan": (f"https://invidious.jing.rocks/api/v1/videos/{VID}", None),
 "y2mate-guru": (f"https://youtube-mp36.p.rapidapi.com/dl?id={VID}", None),
 "ahm7 ytmp3": ("https://ahm7xmakki.com/api/ytmp3?url=" + urllib.parse.quote(YT, safe=""), None),
 "ahm7 yt":    ("https://ahm7xmakki.com/api/yt?url=" + urllib.parse.quote(YT, safe=""), None),
 "ahm7 ytdl":  ("https://ahm7xmakki.com/api/ytdl?url=" + urllib.parse.quote(YT, safe=""), None),
 "ahm7 dl":    ("https://ahm7xmakki.com/api/dl?url=" + urllib.parse.quote(YT, safe=""), None),
 "ahm7 song":  ("https://ahm7xmakki.com/api/song?query=touchwood+babbu+maan", None),
 "ahm7 play":  ("https://ahm7xmakki.com/api/play?query=touchwood+babbu+maan", None),
 "ahm7 ytsearch": ("https://ahm7xmakki.com/api/ytsearch?query=touchwood", None),
}
def probe_alt(kv):
    name, (url, _) = kv
    try:
        st, h, b, dt = get(url, 22)
        return f"  {name:<22} {st} {round(dt,1)}s ACAO={h.get('Access-Control-Allow-Origin','NONE'):<4} {b[:110]!r}"
    except Exception as e:
        return f"  {name:<22} ERR {str(e)[:80]}"
with cf.ThreadPoolExecutor(24) as ex:
    for line in ex.map(probe_alt, ALTS.items()):
        print(line)
