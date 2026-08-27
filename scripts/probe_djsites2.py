#!/usr/bin/env python3
"""
Round 2 on the download sites — look at what a real song page contains.

Round 1 found song links but no .mp3 in the HTML, which usually means either
(a) the file URL is built by JavaScript, or (b) it sits behind a redirect on a
separate CDN host. Both are workable IF the final URL is stable and serves
range requests. This walks one real page per site and dumps what is actually
there instead of guessing.
"""
import re, ssl, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def get(url, timeout=20, headers=None, limit=600000):
    h = {"User-Agent": UA, "Accept": "text/html,*/*",
         "Accept-Language": "en-IN,en;q=0.9"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, r.read(limit), dict(r.headers), r.geturl()

for name, base in [("mrjatt", "https://mr-jatt.im"), ("riskyjatt", "https://riskyjatt.com")]:
    print(f"\n{'='*62}\n{name}")
    try:
        st, body, _, _ = get(f"{base}/search/{urllib.parse.quote('babbu maan')}")
        txt = body.decode("utf-8", "replace")
        links = list(dict.fromkeys(re.findall(r'href="([^"]+)"', txt)))
        songs = [l for l in links if re.search(r'/(song|track|\d{3,})', l, re.I)][:4]
        print(f"  {len(links)} links, {len(songs)} look like songs")
        for s in songs[:2]:
            page = s if s.startswith("http") else urllib.parse.urljoin(base, s)
            print(f"\n  page: {page[:70]}")
            try:
                st2, b2, _, _ = get(page)
                t2 = b2.decode("utf-8", "replace")
                # everything that could be a media file, however it is written
                mp3 = re.findall(r'https?://[^\s"\'<>]+\.mp3[^\s"\'<>]*', t2)
                audio = re.findall(r'<audio[^>]*>|<source[^>]+>', t2)
                dl = re.findall(r'href="([^"]*(?:download|dl|get)[^"]*)"', t2, re.I)
                data = re.findall(r'data-(?:src|url|file|audio)="([^"]+)"', t2, re.I)
                print(f"     .mp3 in html : {len(mp3)}  {mp3[0][:58] if mp3 else ''}")
                print(f"     <audio> tags : {len(audio)}  {audio[0][:58] if audio else ''}")
                print(f"     download hrefs: {len(dl)}  {dl[0][:58] if dl else ''}")
                print(f"     data-* attrs : {len(data)}  {data[0][:58] if data else ''}")
                # follow one download link — the file often sits one hop away
                for d in dl[:2]:
                    u = d if d.startswith("http") else urllib.parse.urljoin(page, d)
                    try:
                        st3, b3, h3, final = get(u, 20, limit=120000)
                        ct = h3.get("Content-Type", "")
                        print(f"     -> {u[:52]}")
                        print(f"        HTTP {st3} {ct} {len(b3)}B  final={final[:52]}")
                        if "audio" in ct or final.endswith(".mp3"):
                            print("        *** THIS IS A PLAYABLE FILE ***")
                        else:
                            t3 = b3.decode("utf-8", "replace")
                            m3 = re.findall(r'https?://[^\s"\'<>]+\.mp3[^\s"\'<>]*', t3)
                            if m3: print(f"        mp3 inside: {m3[0][:56]}")
                    except Exception as e:
                        print(f"        follow failed: {str(e)[:44]}")
            except Exception as e:
                print(f"     page failed: {str(e)[:50]}")
    except Exception as e:
        print(f"  search failed: {str(e)[:60]}")
