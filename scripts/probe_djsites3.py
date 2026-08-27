#!/usr/bin/env python3
"""
Round 3: album page -> individual song page -> the actual file.

Rounds 1-2 kept landing on ALBUM pages. The file lives one level deeper, on a
per-song page. This walks that last hop and, crucially, checks whether the
resulting URL is a real audio file that supports range requests — which is
what an <audio> element needs in order to stream and seek.
"""
import re, ssl, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
WORKER = "https://omni-proxy.omni-jackbhai.workers.dev"

def get(url, timeout=20, headers=None, limit=700000):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-IN,en;q=0.9",
         "Referer": "https://riskyjatt.com/"}
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, headers=h),
                                timeout=timeout, context=CTX) as r:
        return r.status, r.read(limit), dict(r.headers), r.geturl()

BASE = "https://riskyjatt.com"
print("search -> album -> song -> file\n")

st, body, _, _ = get(f"{BASE}/search/{urllib.parse.quote('babbu maan')}")
txt = body.decode("utf-8", "replace")
albums = list(dict.fromkeys(re.findall(r'href="(/album/[^"]+)"', txt)))
print(f"albums found: {len(albums)}")
if not albums:
    raise SystemExit("no albums")

apage = urllib.parse.urljoin(BASE, albums[0])
print(f"album: {apage[:72]}")
st, body, _, _ = get(apage)
txt = body.decode("utf-8", "replace")

songs = list(dict.fromkeys(re.findall(r'href="(/song/[^"]+|/[^"]*mp3-song[^"]*)"', txt)))
print(f"song links on the album page: {len(songs)}")
for s in songs[:3]:
    print(f"   {s[:70]}")

if not songs:
    # sometimes the album page IS the player page
    print("\nno /song/ links; scanning the album page for media instead")
    for pat in [r'https?://[^\s"\'<>]+\.mp3[^\s"\'<>]*',
                r'"(https?://[^"]+/(?:files|audio|songs)/[^"]+)"']:
        hits = re.findall(pat, txt)
        if hits:
            print(f"   {pat[:34]} -> {hits[0][:66]}")
    raise SystemExit()

spage = urllib.parse.urljoin(BASE, songs[0])
print(f"\nsong page: {spage[:72]}")
st, body, _, _ = get(spage)
t = body.decode("utf-8", "replace")

mp3 = re.findall(r'https?://[^\s"\'<>]+\.mp3[^\s"\'<>]*', t)
src = re.findall(r'<source[^>]+src="([^"]+)"', t)
dl  = re.findall(r'href="(https?://[^"]*(?:download|\.mp3)[^"]*)"', t, re.I)
print(f"  .mp3 urls   : {len(mp3)}  {mp3[0][:64] if mp3 else ''}")
print(f"  <source src>: {len(src)}  {src[0][:64] if src else ''}")
print(f"  download    : {len(dl)}   {dl[0][:64] if dl else ''}")

cand = (mp3 + src + dl)
cand = [c for c in cand if ".mp3" in c.lower()]
if not cand:
    print("\n  no direct file on the song page either")
    raise SystemExit()

url = cand[0]
print(f"\nchecking the file: {url[:72]}")
try:
    st, b, h, final = get(url, 25, {"Range": "bytes=0-99999"}, 200000)
    print(f"  direct     : HTTP {st}  {len(b)}B  type={h.get('Content-Type')}  "
          f"ranges={h.get('Accept-Ranges')}")
    playable = st in (200, 206) and ("audio" in (h.get("Content-Type") or "") or len(b) > 50000)
    print(f"  playable   : {playable}")
except Exception as e:
    print(f"  direct failed: {str(e)[:60]}")
    playable = False

if playable:
    wu = f"{WORKER}/?url={urllib.parse.quote(url, safe='')}"
    try:
        st, b, h, _ = get(wu, 30, {"Range": "bytes=0-99999"}, 200000)
        print(f"  via worker : HTTP {st}  {len(b)}B  "
              f"CORS={h.get('Access-Control-Allow-Origin')}")
        print("\n  >>> USABLE: a plain MP3 the app could play with no resolver")
    except Exception as e:
        print(f"  via worker failed: {str(e)[:60]}")
        print("  (the host would need adding to the Worker allow-list)")
