#!/usr/bin/env python3
"""
Find more CORS proxies — the pool has thinned out badly.

corsproxy.io now answers 401 permanently (free tier exhausted) and it does so
in 80 ms, so it was winning the race with an instant failure. That leaves
cors.sh as effectively the only working hop, which is a single point of failure
for ALL audio playback.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
TARGET = ("https://ahm7xmakki.com/api/alldl?url="
          + urllib.parse.quote("https://www.youtube.com/watch?v=4OriqsUzKgY", safe=""))

CANDIDATES = {
    "cors.sh":         lambda u: "https://proxy.cors.sh/" + u,
    "corsproxy.io":    lambda u: "https://corsproxy.io/?url=" + urllib.parse.quote(u, safe=""),
    "allorigins/raw":  lambda u: "https://api.allorigins.win/raw?url=" + urllib.parse.quote(u, safe=""),
    "allorigins/get":  lambda u: "https://api.allorigins.win/get?url=" + urllib.parse.quote(u, safe=""),
    "codetabs":        lambda u: "https://api.codetabs.com/v1/proxy?quest=" + urllib.parse.quote(u, safe=""),
    "isomorphic-git":  lambda u: "https://cors.isomorphic-git.org/" + u,
    "cors.lol":        lambda u: "https://api.cors.lol/?url=" + urllib.parse.quote(u, safe=""),
    "whateverorigin":  lambda u: "https://www.whateverorigin.org/get?url=" + urllib.parse.quote(u, safe=""),
    "corsfix":         lambda u: "https://proxy.corsfix.com/?" + u,
    "cors.eu.org":     lambda u: "https://cors.eu.org/" + u,
    "test.workers":    lambda u: "https://test.cors.workers.dev/?" + u,
    "everyorigin":     lambda u: "https://everyorigin.jwvbremen.nl/get?url=" + urllib.parse.quote(u, safe=""),
    "jsonp.afeld":     lambda u: "https://jsonp.afeld.me/?url=" + urllib.parse.quote(u, safe=""),
    "crossorigin.me":  lambda u: "https://crossorigin.me/" + u,
    "thingproxy":      lambda u: "https://thingproxy.freeboard.io/fetch/" + u,
    "htmldriven":      lambda u: "https://cors-proxy.htmldriven.com/?url=" + urllib.parse.quote(u, safe=""),
    "yacdn":           lambda u: "https://yacdn.org/proxy/" + u,
    "cors-anywhere":   lambda u: "https://cors-anywhere.herokuapp.com/" + u,
    "1ft.io":          lambda u: "https://1ft.io/proxy?url=" + urllib.parse.quote(u, safe=""),
    "textance":        lambda u: "https://textance.herokuapp.com/title/" + u,
    "hexlet":          lambda u: "https://cors-proxy.hexlet.app/" + u,
    "r.jina.ai":       lambda u: "https://r.jina.ai/" + u,
    "wsrv":            lambda u: "https://wsrv.nl/?url=" + urllib.parse.quote(u, safe=""),
    "cloudflare-cors": lambda u: "https://cors.deno.dev/" + u,
    "deno-proxy":      lambda u: "https://api.allorigins.hexlet.app/raw?url=" + urllib.parse.quote(u, safe=""),
}

def probe(name, wrap):
    t = time.time()
    try:
        req = urllib.request.Request(wrap(TARGET), headers={
            "User-Agent": UA, "Origin": ORIGIN, "Referer": ORIGIN + "/",
            "x-requested-with": "XMLHttpRequest"})
        with urllib.request.urlopen(req, timeout=35, context=CTX) as r:
            body = r.read(300000)
            acao = r.headers.get("Access-Control-Allow-Origin", "—")
            st = r.status
        try:
            j = json.loads(body)
            if isinstance(j, dict) and isinstance(j.get("contents"), str):
                j = json.loads(j["contents"])
            audio = (j.get("mediaInfo") or {}).get("audioUrl")
            ok = bool(audio)
            note = "audioUrl OK" if ok else f"no audioUrl, keys={list(j)[:3]}"
        except Exception as e:
            ok, note = False, f"parse: {str(e)[:34]}"
        return (name, st, round(time.time() - t, 1), acao, ok, note)
    except Exception as e:
        return (name, "ERR", round(time.time() - t, 1), "—", False, str(e)[:46])

rows = []
with cf.ThreadPoolExecutor(12) as ex:
    for r in ex.map(lambda kv: probe(*kv), CANDIDATES.items()):
        rows.append(r)

print(f"{'proxy':<18}{'code':<6}{'time':>6}  {'CORS':<6}{'usable':<8}note")
print("-" * 88)
good = []
for r in sorted(rows, key=lambda x: (not x[4], x[2])):
    mark = "YES" if (r[4] and r[3] in ("*", ORIGIN)) else "no"
    if mark == "YES": good.append((r[0], r[2]))
    print(f"{r[0]:<18}{str(r[1]):<6}{str(r[2]):>5}s  {r[3]:<6}{mark:<8}{r[5][:44]}")

print(f"\nUSABLE FROM A BROWSER: {len(good)}")
for n, t in good:
    print(f"  {n} ({t}s)")
