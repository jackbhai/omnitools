#!/usr/bin/env python3
"""
Why does a track sometimes die with MediaError 4 even though nothing else is
downloading?

Hypothesis: the resolver hands out a SIGNED, single-use-ish CDN link. If the
same video is resolved twice, the newer link may invalidate the older one — so
a background prefetch of a track that is ALREADY PLAYING would kill it.

This measures three things:
  1. is a link still good a minute after it was issued?
  2. does resolving the SAME video again invalidate the first link?
  3. does resolving a DIFFERENT video invalidate it?
"""
import json, ssl, time, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
API = "https://ahm7xmakki.com/api/alldl?url="

def resolve(vid):
    tgt = API + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}", safe="")
    req = urllib.request.Request(tgt, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
        d = json.loads(r.read())
    m = d.get("mediaInfo") or {}
    return m.get("audioUrl") or m.get("videoUrl")

def head(url, label, nbytes=120000):
    t = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                   "Range": f"bytes=0-{nbytes}"})
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            n = len(r.read())
        return f"    {label}: HTTP {r.status}, {n} bytes ({time.time()-t:.1f}s)  OK"
    except Exception as e:
        return f"    {label}: FAILED — {str(e)[:60]}"

print("1) resolve track A, then read it immediately")
A1 = resolve("4OriqsUzKgY")
print(f"   link A1 = ...{A1[-28:]}")
print(head(A1, "A1 fresh"))

print("\n2) wait 45 s, read the SAME link again (is it time-limited?)")
time.sleep(45)
print(head(A1, "A1 after 45 s"))

print("\n3) resolve the SAME video again -> does A1 still work?")
A2 = resolve("4OriqsUzKgY")
same = A1 == A2
print(f"   link A2 = ...{A2[-28:]}   {'SAME url' if same else 'DIFFERENT url'}")
print(head(A1, "A1 (the old link)"))
print(head(A2, "A2 (the new link)"))

print("\n4) resolve a DIFFERENT video -> does A2 still work?")
B = resolve("fyLNURgWXU0")
print(f"   link B  = ...{B[-28:]}")
print(head(A2, "A2 after resolving B"))
print(head(B,  "B"))

print("\n5) rapid burst: resolve three videos back to back, then read the first")
C1 = resolve("l0SZwPKzDDs")
C2 = resolve("wkzD1VfPyrs")
C3 = resolve("LrnJZKOBC7c")
print(head(C1, "C1 after C2+C3 were resolved"))
print(head(C3, "C3 (newest)"))
