#!/usr/bin/env python3
"""
Does the audio CDN tolerate two simultaneous connections?

The gapless preload opens a SECOND request to the same host while a track is
playing. In the browser the main element then died with MediaError code 4
(SRC_NOT_SUPPORTED) about 11 s in, while the preload element sat happily at
readyState 4. That smells like the CDN cutting one of the two connections.
This measures it directly.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
PROXY = ""
API = "https://ahm7xmakki.com/api/alldl?url="

def resolve(vid):
    tgt = API + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}", safe="")
    req = urllib.request.Request(tgt,
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
        d = json.loads(r.read())
    m = d.get("mediaInfo") or {}
    return m.get("audioUrl") or m.get("videoUrl")

def grab(url, label, nbytes=400000, rng=True):
    h = {"User-Agent": UA}
    if rng: h["Range"] = f"bytes=0-{nbytes}"
    t = time.time()
    try:
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
            data = r.read()
        return f"  {label}: HTTP {r.status} {len(data)} bytes in {time.time()-t:.1f}s"
    except Exception as e:
        return f"  {label}: FAILED after {time.time()-t:.1f}s — {str(e)[:60]}"

print("resolving two different tracks…")
A = resolve("4OriqsUzKgY")
B = resolve("fyLNURgWXU0")
print(f"  A: {A[:64] if A else 'FAILED'}")
print(f"  B: {B[:64] if B else 'FAILED'}")
if not A or not B:
    raise SystemExit("could not resolve both")

print("\n1) single connection, one track")
print(grab(A, "A alone"))

print("\n2) TWO connections to the SAME track (what a naive preload does)")
with cf.ThreadPoolExecutor(2) as ex:
    for line in ex.map(lambda i: grab(A, f"A#{i}"), (1, 2)):
        print(line)

print("\n3) TWO connections, DIFFERENT tracks (what our preload really does)")
with cf.ThreadPoolExecutor(2) as ex:
    fs = [ex.submit(grab, A, "A (playing)"), ex.submit(grab, B, "B (preload)")]
    for f in cf.as_completed(fs):
        print(f.result())

print("\n4) sustained: hold A open while B downloads")
def sustained(url, label, seconds=12):
    t = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=45, context=CTX) as r:
            total = 0
            while time.time() - t < seconds:
                chunk = r.read(65536)
                if not chunk: break
                total += len(chunk)
        return f"  {label}: read {total} bytes over {time.time()-t:.1f}s (ok)"
    except Exception as e:
        return f"  {label}: BROKE after {time.time()-t:.1f}s — {str(e)[:60]}"

with cf.ThreadPoolExecutor(2) as ex:
    fs = [ex.submit(sustained, A, "A streaming"), ex.submit(grab, B, "B preload burst")]
    for f in cf.as_completed(fs):
        print(f.result())
