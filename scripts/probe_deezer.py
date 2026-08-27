#!/usr/bin/env python3
"""
How much catalogue can Deezer give us, and can we PLAY it?

Deezer is now reachable through our Worker (40 results in 0.44 s). It has a
genuinely enormous catalogue including Punjabi, Haryanvi, Bhojpuri, Pakistani
and Bollywood. Two things to establish:

  1. BREADTH — does it actually have the regional music, by artist and genre?
  2. PLAYBACK — Deezer only serves 30 s previews. That is not a music player.
     So the plan is: Deezer for DISCOVERY (search, artists, albums, charts,
     related artists — all things the YouTube mirror is bad at), and the
     existing resolver for full-length audio. This checks that a Deezer title
     reliably finds its full track on the playable side.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

WORKER = "https://omni-proxy.omni-jackbhai.workers.dev"
PIPED = "https://api.piped.private.coffee"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def get(url, timeout=30, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, headers=h),
                                timeout=timeout, context=CTX) as r:
        return r.status, r.read(900000), dict(r.headers)

def dz(path, timeout=30):
    u = f"https://api.deezer.com{path}"
    st, body, _ = get(f"{WORKER}/?url={urllib.parse.quote(u, safe='')}", timeout)
    return json.loads(body)

print("=== 1. REGIONAL BREADTH (artists) ===")
ARTISTS = ["Babbu Maan", "Sidhu Moose Wala", "Diljit Dosanjh", "Karan Aujla",
           "Sapna Choudhary", "Masoom Sharma", "Atif Aslam", "Rahat Fateh Ali Khan",
           "Arijit Singh", "Nusrat Fateh Ali Khan", "Gurdas Maan", "AP Dhillon",
           "Pawan Singh", "Khesari Lal Yadav", "Ammy Virk", "Shubh"]
def artist(a):
    try:
        d = dz(f"/search/artist?q={urllib.parse.quote(a)}&limit=1")
        r = (d.get("data") or [{}])[0]
        if not r.get("id"): return f"  {a:<24} not found"
        top = dz(f"/artist/{r['id']}/top?limit=50")
        alb = dz(f"/artist/{r['id']}/albums?limit=50")
        return (f"  {a:<24} id={r['id']:<10} fans={r.get('nb_fan',0):<9,} "
                f"top={len(top.get('data',[])):<4} albums={len(alb.get('data',[]))}")
    except Exception as e:
        return f"  {a:<24} ERR {str(e)[:34]}"
with cf.ThreadPoolExecutor(8) as ex:
    for line in ex.map(artist, ARTISTS): print(line)

print("\n=== 2. GENRE / LANGUAGE BREADTH (search depth) ===")
QUERIES = ["punjabi", "haryanvi", "bhojpuri", "bollywood", "pakistani",
           "coke studio", "qawwali", "ghazal", "sufi", "desi hip hop",
           "tamil", "telugu", "marathi", "gujarati", "bengali", "rajasthani"]
def genre(q):
    try:
        d = dz(f"/search?q={urllib.parse.quote(q)}&limit=100")
        n = len(d.get("data", []))
        tot = d.get("total", n)
        first = (d.get("data") or [{}])[0]
        return f"  {q:<16} {n:>4} returned / {tot:>7,} total   {first.get('title','')[:34]}"
    except Exception as e:
        return f"  {q:<16} ERR {str(e)[:40]}"
with cf.ThreadPoolExecutor(8) as ex:
    for line in ex.map(genre, QUERIES): print(line)

print("\n=== 3. THE SONGS THAT WERE MISSING ===")
for q in ["Babbu Maan Touchwood", "Ishq Murshid", "Cheema Y", "Pasoori"]:
    try:
        d = dz(f"/search?q={urllib.parse.quote(q)}&limit=5")
        rows = d.get("data", [])
        print(f"  {q:<24} {len(rows)} hits")
        for r in rows[:2]:
            print(f"      {r.get('title','')[:40]:<42} — {(r.get('artist') or {}).get('name','')}")
    except Exception as e:
        print(f"  {q:<24} ERR {str(e)[:40]}")

print("\n=== 4. EXTRA SURFACES Deezer gives us ===")
for name, path in [
    ("chart tracks",    "/chart/0/tracks?limit=50"),
    ("chart albums",    "/chart/0/albums?limit=30"),
    ("chart artists",   "/chart/0/artists?limit=30"),
    ("chart playlists", "/chart/0/playlists?limit=30"),
    ("genre list",      "/genre"),
    ("editorial",       "/editorial"),
    ("radio list",      "/radio"),
]:
    try:
        d = dz(path)
        rows = d.get("data", [])
        print(f"  {name:<18} {len(rows):>3} items   {(rows[0].get('title') or rows[0].get('name') or '') if rows else ''}")
    except Exception as e:
        print(f"  {name:<18} ERR {str(e)[:40]}")

print("\n=== 5. Deezer radio = an endless mix per genre? ===")
try:
    d = dz("/radio")
    rs = d.get("data", [])
    print(f"  {len(rs)} radio stations")
    for r in rs[:5]:
        print(f"      {r.get('title','')[:40]}")
    if rs:
        t = dz(f"/radio/{rs[0]['id']}/tracks?limit=40")
        print(f"  first station expands to {len(t.get('data', []))} tracks")
except Exception as e:
    print("  ERR", str(e)[:60])

print("\n=== 6. CRITICAL: can a Deezer title be played in full? ===")
print("  (Deezer previews are 30 s, so titles must resolve on the playable side)")
try:
    d = dz("/search?q=babbu%20maan&limit=8")
    hits = 0
    for r in d.get("data", [])[:6]:
        title = r.get("title", "")
        art = (r.get("artist") or {}).get("name", "")
        q = f"{art} {title}"
        st, body, _ = get(f"{PIPED}/search?q={urllib.parse.quote(q)}&filter=music_songs", 20)
        items = json.loads(body).get("items") or []
        ok = bool(items)
        hits += ok
        print(f"      {'FOUND' if ok else 'MISS ':<6} {title[:34]:<36} -> {items[0].get('title','')[:32] if items else ''}")
    print(f"  {hits}/6 Deezer titles are playable in full")
except Exception as e:
    print("  ERR", str(e)[:70])
