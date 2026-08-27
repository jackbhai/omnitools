#!/usr/bin/env python3
"""
The audio resolver is DOWN — find replacements. This is now urgent.

ahm7xmakki.com is returning 504 on every endpoint including its homepage, so
every song in the app fails. The whole music feature has been resting on one
host, which was always a risk and has now bitten.

Two directions:
  A. other YouTube-audio resolvers (same job, different host)
  B. the user's idea — desi download sites that host the MP3 themselves.
     If one of those works it is BETTER than a resolver: a plain file, no
     signed URL that expires, no single-connection limit.
"""
import concurrent.futures as cf, json, re, ssl, time, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
VID = "fyLNURgWXU0"
YT = f"https://www.youtube.com/watch?v={VID}"

def get(url, timeout=25, headers=None, data=None, limit=700000):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-IN,en;q=0.9"}
    if headers: h.update(headers)
    req = urllib.request.Request(url, headers=h, data=data,
                                 method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, r.read(limit), dict(r.headers), r.geturl()

print("=== A. alternative audio resolvers ===")
RESOLVERS = [
    ("cobalt.tools", "https://api.cobalt.tools/", None,
     json.dumps({"url": YT, "downloadMode": "audio"}).encode(),
     {"Content-Type": "application/json", "Accept": "application/json"}),
    ("cobalt imput", "https://cobalt-api.kwiatekmiki.com/", None,
     json.dumps({"url": YT, "downloadMode": "audio"}).encode(),
     {"Content-Type": "application/json", "Accept": "application/json"}),
    ("cobalt meowing", "https://cobalt-backend.canine.tools/", None,
     json.dumps({"url": YT, "downloadMode": "audio"}).encode(),
     {"Content-Type": "application/json", "Accept": "application/json"}),
    ("piped coffee streams", f"https://api.piped.private.coffee/streams/{VID}", None, None, None),
    ("piped adminforge", f"https://pipedapi.adminforge.de/streams/{VID}", None, None, None),
    ("piped drgns", f"https://pipedapi.drgns.space/streams/{VID}", None, None, None),
    ("invidious nadeko", f"https://inv.nadeko.net/api/v1/videos/{VID}", None, None, None),
    ("invidious fdn", f"https://invidious.fdn.fr/api/v1/videos/{VID}", None, None, None),
    ("yt.artemislena", f"https://yt.artemislena.eu/api/v1/videos/{VID}", None, None, None),
    ("invidious nerdvpn", f"https://invidious.nerdvpn.de/api/v1/videos/{VID}", None, None, None),
]
def probe_res(item):
    name, url, _, data, hdr = item
    t = time.time()
    try:
        st, body, h, _ = get(url, 30, hdr, data)
        txt = body.decode("utf-8", "replace")
        audio = ""
        try:
            j = json.loads(txt)
            audio = (j.get("url") or
                     (j.get("audioStreams") or [{}])[0].get("url", "") or
                     (j.get("adaptiveFormats") or [{}])[0].get("url", "") or "")
        except Exception:
            pass
        ok = bool(audio)
        return f"  {'OK ' if ok else '   '}{name:<22} {st} {time.time()-t:>5.1f}s  {audio[:48] or txt[:44]}"
    except Exception as e:
        return f"     {name:<22} ERR {time.time()-t:>4.1f}s  {str(e)[:46]}"

with cf.ThreadPoolExecutor(10) as ex:
    for line in ex.map(probe_res, RESOLVERS):
        print(line)

print("\n=== B. desi download sites: can we get a real MP3? ===")
SITES = [
    ("mr-jatt",   "https://mr-jatt.im",    "/search/{q}"),
    ("riskyjatt", "https://riskyjatt.com", "/search/{q}"),
    ("pagalfree", "https://pagalfree.com", "/search/{q}"),
    ("djjaani",   "https://djjaani.pw",    "/search/{q}"),
    ("mrjatt.fm", "https://mrjatt.fm",     "/search/{q}"),
    ("songspk",   "https://songspk.rocks", "/search/{q}"),
]
MP3_RE = re.compile(r'https?://[^\s"\'<>]+\.mp3[^\s"\'<>]*', re.I)

def walk(item):
    name, base, path = item
    out = [f"\n  {name}"]
    try:
        st, body, _, _ = get(base + path.format(q=urllib.parse.quote("babbu maan")), 20)
        txt = body.decode("utf-8", "replace")
        out.append(f"    search HTTP {st}, {len(txt)//1024} KB")
        direct = MP3_RE.findall(txt)
        if direct:
            out.append(f"    mp3 on the search page: {direct[0][:56]}")
            return "\n".join(out)
        # follow anything that looks like a track page
        links = list(dict.fromkeys(re.findall(r'href="([^"#?]+)"', txt)))
        cand = [l for l in links
                if re.search(r'(song|track|download|/\d{4,})', l, re.I)
                and not re.search(r'(whatsapp|facebook|twitter|telegram)', l, re.I)][:5]
        out.append(f"    {len(cand)} candidate pages")
        for c in cand:
            page = c if c.startswith("http") else urllib.parse.urljoin(base, c)
            try:
                st2, b2, _, _ = get(page, 18)
                t2 = b2.decode("utf-8", "replace")
                hits = MP3_RE.findall(t2)
                if hits:
                    out.append(f"    FOUND on {page[:46]}")
                    out.append(f"      {hits[0][:64]}")
                    # is it playable?
                    try:
                        st3, b3, h3, _ = get(hits[0], 25, {"Range": "bytes=0-99999"}, limit=200000)
                        out.append(f"      file HTTP {st3} {len(b3)}B "
                                   f"type={h3.get('Content-Type')} ranges={h3.get('Accept-Ranges')}")
                    except Exception as e:
                        out.append(f"      file check failed: {str(e)[:40]}")
                    return "\n".join(out)
            except Exception:
                continue
        out.append("    no mp3 reachable")
    except Exception as e:
        out.append(f"    failed: {str(e)[:50]}")
    return "\n".join(out)

with cf.ThreadPoolExecutor(6) as ex:
    for line in ex.map(walk, SITES):
        print(line)
