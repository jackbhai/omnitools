#!/usr/bin/env python3
"""
Can the desi download sites give us a direct, playable MP3?

The user's idea is a good one: sites like DJPunjab / PagalWorld host the file
itself rather than a stream that has to be extracted. If one of them serves a
plain MP3 over HTTPS with range support, playback becomes trivial and fast —
no resolver, no signed link that expires, no single-connection limit.

What has to be true for us to use it:
  1. a search endpoint we can call
  2. a page we can parse down to a real .mp3 URL
  3. that URL must serve audio with HTTP 200/206
  4. it must be reachable through our Worker (they will not send CORS)
"""
import concurrent.futures as cf, re, ssl, time, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
WORKER = "https://omni-proxy.omni-jackbhai.workers.dev"

def get(url, timeout=20, headers=None, limit=400000):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, r.read(limit), dict(r.headers), r.geturl()

SITES = [
    ("pagalworld",  "https://pagalworld.com.se", "/search.php?q={q}"),
    ("djpunjab",    "https://djpunjab.is",       "/search/{q}"),
    ("mrjatt",      "https://mr-jatt.im",        "/search/{q}"),
    ("raagsong",    "https://raagsong.com",      "/?s={q}"),
    ("pagalfree",   "https://pagalfree.com",     "/search/{q}"),
    ("djjohal",     "https://djjohal.video",     "/search.php?q={q}"),
    ("riskyjatt",   "https://riskyjatt.com",     "/search/{q}"),
    ("wapking",     "https://wapking.name",      "/search?q={q}"),
]
Q = "babbu maan"

print("=== 1. can we reach a search page and see .mp3 links? ===")
def probe(item):
    name, base, path = item
    url = base + path.format(q=urllib.parse.quote(Q))
    try:
        st, body, hdr, final = get(url, 20)
        txt = body.decode("utf-8", "replace")
        mp3 = re.findall(r'https?://[^\s"\'<>]+\.mp3', txt)
        pages = re.findall(r'href="([^"]{6,120})"', txt)
        songish = [p for p in pages if re.search(r'(song|download|track|mp3)', p, re.I)]
        return (f"  {name:<12} HTTP {st}  {len(mp3):>3} direct mp3  "
                f"{len(songish):>3} song links  {(mp3[0][:52] if mp3 else '')}")
    except Exception as e:
        return f"  {name:<12} FAILED {str(e)[:52]}"

with cf.ThreadPoolExecutor(8) as ex:
    for line in ex.map(probe, SITES):
        print(line)

print("\n=== 2. follow one song page to its file ===")
def dig(name, base, listpath):
    try:
        st, body, _, _ = get(base + listpath.format(q=urllib.parse.quote(Q)), 20)
        txt = body.decode("utf-8", "replace")
        links = re.findall(r'href="([^"]+)"', txt)
        cand = [l for l in links if re.search(r'(song|download|/\d+)', l, re.I)][:6]
        for c in cand:
            page = c if c.startswith("http") else urllib.parse.urljoin(base, c)
            try:
                st2, b2, _, _ = get(page, 20)
                t2 = b2.decode("utf-8", "replace")
                mp3 = re.findall(r'https?://[^\s"\'<>]+\.mp3', t2)
                if mp3:
                    return page, mp3[0]
            except Exception:
                continue
    except Exception as e:
        return None, f"list failed: {str(e)[:44]}"
    return None, "no mp3 found on any candidate page"

for name, base, path in SITES[:5]:
    page, mp3 = dig(name, base, path)
    print(f"  {name:<12} {(mp3 or '')[:76]}")
    if page and mp3 and mp3.startswith("http"):
        # 3. is the file actually playable?
        try:
            st3, b3, h3, _ = get(mp3, 25, {"Range": "bytes=0-99999"}, 200000)
            print(f"               file: HTTP {st3}  {len(b3)} bytes  "
                  f"type={h3.get('Content-Type')}  ranges={h3.get('Accept-Ranges')}")
            # 4. through our Worker?
            wu = f"{WORKER}/?url={urllib.parse.quote(mp3, safe='')}"
            st4, b4, h4, _ = get(wu, 30, {"Range": "bytes=0-99999"}, 200000)
            print(f"               via worker: HTTP {st4}  {len(b4)} bytes  "
                  f"CORS={h4.get('Access-Control-Allow-Origin')}")
        except Exception as e:
            print(f"               file check failed: {str(e)[:56]}")
