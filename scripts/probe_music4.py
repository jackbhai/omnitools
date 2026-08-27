#!/usr/bin/env python3
"""
Round 4: how far can the ONE working mirror + iTunes actually take us?

To grow the music section 100x we need, from CORS-enabled sources only:
  · pagination  — more than the first 20 hits per query
  · channels    — an artist's full upload list
  · playlists   — album / mix expansion
  · autoplay    — "more like this" without /streams (which 500s everywhere)

iTunes is the other CORS source: it has real metadata (artist ids, albums,
top songs) and can generate the QUERIES that Piped then resolves to playable
ids. That combination is the endless-queue engine.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = ("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
      "Chrome/126 Mobile Safari/537.36")
CTX = ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE
B = "https://api.piped.private.coffee"
Q = "babbu maan"

def get(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.status, dict(r.headers), r.read(900000)

def js(url, timeout=25):
    st, h, body = get(url, timeout)
    return st, h.get("Access-Control-Allow-Origin", "—"), json.loads(body)

print("=== 1. does search return a nextpage token? ===")
try:
    st, acao, d = js(f"{B}/search?q={urllib.parse.quote(Q)}&filter=music_songs")
    print(f"  status={st} CORS={acao} items={len(d.get('items', []))}")
    print(f"  keys: {list(d.keys())}")
    tok = d.get("nextpage")
    print(f"  nextpage token: {'YES len=' + str(len(tok)) if tok else 'NO'}")
    if tok:
        u = (f"{B}/nextpage/search?nextpage={urllib.parse.quote(tok)}"
             f"&q={urllib.parse.quote(Q)}&filter=music_songs")
        st2, acao2, d2 = js(u, 30)
        got = d2.get("items", [])
        print(f"  PAGE 2: status={st2} CORS={acao2} items={len(got)}")
        if got: print(f"          first: {got[0].get('title')}")
        tok2 = d2.get("nextpage")
        if tok2:
            u3 = (f"{B}/nextpage/search?nextpage={urllib.parse.quote(tok2)}"
                  f"&q={urllib.parse.quote(Q)}&filter=music_songs")
            st3, _, d3 = js(u3, 30)
            print(f"  PAGE 3: status={st3} items={len(d3.get('items', []))}")
except Exception as e:
    print("  FAILED:", str(e)[:90])

print("\n=== 2. channel (artist) browsing ===")
try:
    st, acao, d = js(f"{B}/search?q={urllib.parse.quote(Q)}&filter=channels")
    ch = [x for x in d.get("items", []) if x.get("url", "").startswith("/channel/")]
    print(f"  channels found: {len(ch)}")
    if ch:
        cid = ch[0]["url"].split("/channel/")[1]
        print(f"  testing channel {ch[0].get('name')} ({cid})")
        st2, acao2, cd = js(f"{B}/channel/{cid}", 30)
        rel = cd.get("relatedStreams") or []
        print(f"  /channel: status={st2} CORS={acao2} videos={len(rel)}")
        if rel: print(f"    first: {rel[0].get('title')}")
        print(f"    nextpage: {'YES' if cd.get('nextpage') else 'NO'}")
except Exception as e:
    print("  FAILED:", str(e)[:90])

print("\n=== 3. playlist expansion ===")
try:
    st, acao, d = js(f"{B}/search?q={urllib.parse.quote('punjabi hits')}&filter=playlists")
    pl = [x for x in d.get("items", []) if x.get("url", "").startswith("/playlist")]
    print(f"  playlists found: {len(pl)}")
    if pl:
        pid = pl[0]["url"].split("list=")[-1]
        print(f"  testing playlist {pl[0].get('name')} ({pid[:24]})")
        st2, acao2, pd = js(f"{B}/playlists/{pid}", 30)
        rel = pd.get("relatedStreams") or []
        print(f"  /playlists: status={st2} CORS={acao2} tracks={len(rel)}")
        if rel:
            for x in rel[:3]: print(f"    · {x.get('title')}")
except Exception as e:
    print("  FAILED:", str(e)[:90])

print("\n=== 4. how many distinct tracks can we harvest per artist? ===")
seen = {}
for f in ["music_songs", "music_videos", "all"]:
    try:
        _, _, d = js(f"{B}/search?q={urllib.parse.quote(Q)}&filter={f}")
        for x in d.get("items", []):
            u = x.get("url", "")
            if "v=" in u: seen[u.split("v=")[1][:11]] = x.get("title")
        print(f"  filter={f:<14} running unique ids: {len(seen)}")
    except Exception as e:
        print(f"  filter={f:<14} failed {str(e)[:40]}")

print("\n=== 5. iTunes → query generator for endless play ===")
try:
    u = ("https://itunes.apple.com/search?term=" + urllib.parse.quote(Q) +
         "&entity=musicArtist&country=IN&limit=1")
    _, acao, d = js(u)
    a = (d.get("results") or [{}])[0]
    aid = a.get("artistId")
    print(f"  artist: {a.get('artistName')} id={aid} CORS={acao}")
    if aid:
        u2 = f"https://itunes.apple.com/lookup?id={aid}&entity=song&limit=60&country=IN"
        _, _, d2 = js(u2)
        songs = [r for r in d2.get("results", []) if r.get("wrapperType") == "track"]
        print(f"  songs by this artist: {len(songs)}")
        for s in songs[:5]:
            print(f"    · {s.get('trackName')} — {s.get('collectionName')}")
        u3 = f"https://itunes.apple.com/lookup?id={aid}&entity=album&limit=30&country=IN"
        _, _, d3 = js(u3)
        albums = [r for r in d3.get("results", []) if r.get("wrapperType") == "collection"]
        print(f"  albums by this artist: {len(albums)}")
except Exception as e:
    print("  FAILED:", str(e)[:90])

print("\n=== 6. genre / mood seeds that return real results ===")
seeds = ["punjabi 2026", "bollywood hits", "coke studio pakistan", "sufi qawwali",
         "punjabi sad songs", "haryanvi", "bhojpuri hits", "old hindi classics",
         "pakistani ost", "lofi hindi", "gym punjabi", "romantic hindi"]
def one(s):
    try:
        _, acao, d = js(f"{B}/search?q={urllib.parse.quote(s)}&filter=music_songs", 20)
        it = d.get("items") or []
        return f"  {s:<24} {len(it):>3} results   {(it[0].get('title') if it else '')[:36]}"
    except Exception as e:
        return f"  {s:<24} FAILED {str(e)[:34]}"
with cf.ThreadPoolExecutor(6) as ex:
    for line in ex.map(one, seeds): print(line)
