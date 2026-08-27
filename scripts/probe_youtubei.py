#!/usr/bin/env python3
"""
The user is right: do it server-side, the way the npm packages do.

Packages like play-dl / ytdl-core / youtubei.js do NOT screen-scrape. They call
YouTube's own internal `youtubei` API pretending to be a mobile client. The
ANDROID and IOS clients get back `streamingData` with DIRECT, un-ciphered URLs —
no signature deciphering, no player JS to run. That is the whole trick.

It failed for us before ONLY because we called it from the browser (403 on the
Origin header). Our Cloudflare Worker has no Origin, so it should behave like
those packages do.

This tests the raw call from a server, exactly what the Worker would do.
"""
import concurrent.futures as cf, json, ssl, time, urllib.request

UA_ANDROID = "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip"
UA_IOS = "com.google.ios.youtube/19.09.3 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
VID = "fyLNURgWXU0"

CLIENTS = [
    ("ANDROID", {
        "clientName": "ANDROID", "clientVersion": "19.09.37",
        "androidSdkVersion": 34, "hl": "en", "gl": "IN",
    }, UA_ANDROID, "3"),
    ("ANDROID_MUSIC", {
        "clientName": "ANDROID_MUSIC", "clientVersion": "6.42.52",
        "androidSdkVersion": 34, "hl": "en", "gl": "IN",
    }, "com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 14) gzip", "21"),
    ("IOS", {
        "clientName": "IOS", "clientVersion": "19.09.3",
        "deviceModel": "iPhone16,2", "hl": "en", "gl": "IN",
    }, UA_IOS, "5"),
    ("IOS_MUSIC", {
        "clientName": "IOS_MUSIC", "clientVersion": "6.42",
        "deviceModel": "iPhone16,2", "hl": "en", "gl": "IN",
    }, "com.google.ios.youtubemusic/6.42 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)", "26"),
    ("WEB", {
        "clientName": "WEB", "clientVersion": "2.20240304.00.00", "hl": "en", "gl": "IN",
    }, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", "1"),
    ("TVHTML5", {
        "clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "clientVersion": "2.0",
        "hl": "en", "gl": "IN",
    }, "Mozilla/5.0 (PlayStation; PlayStation 4/12.00)", "85"),
]

def player(name, client, ua, cid):
    body = json.dumps({
        "context": {"client": client},
        "videoId": VID,
        "contentCheckOk": True,
        "racyCheckOk": True,
    }).encode()
    url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
    req = urllib.request.Request(url, data=body, headers={
        "User-Agent": ua,
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": cid,
        "X-YouTube-Client-Version": client["clientVersion"],
        "Accept-Language": "en-IN,en;q=0.9",
    })
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            d = json.loads(r.read(3_000_000))
    except Exception as e:
        return f"  {name:<16} ERR {str(e)[:52]}"

    status = (d.get("playabilityStatus") or {}).get("status")
    sd = d.get("streamingData") or {}
    fmts = (sd.get("adaptiveFormats") or []) + (sd.get("formats") or [])
    audio = [f for f in fmts if "audio" in (f.get("mimeType") or "")]
    direct = [f for f in audio if f.get("url")]
    ciphered = [f for f in audio if not f.get("url")]
    title = ((d.get("videoDetails") or {}).get("title") or "")[:30]
    best = max(direct, key=lambda f: f.get("bitrate", 0)) if direct else None
    return (f"  {'OK ' if direct else '   '}{name:<16} {status:<14} "
            f"audio={len(audio):<3} direct={len(direct):<3} ciphered={len(ciphered):<3} "
            f"{time.time()-t:>5.1f}s  {title}"
            + (f"\n      -> {(best.get('mimeType') or '')[:28]} {best.get('bitrate',0)//1000}kbps "
               f"{best['url'][:56]}" if best else ""))

print("=== youtubei /player, per client (server-side, no Origin) ===")
with cf.ThreadPoolExecutor(6) as ex:
    for line in ex.map(lambda a: player(*a), CLIENTS):
        print(line)

print("\n=== does a direct URL actually stream? ===")
def check_stream():
    body = json.dumps({
        "context": {"client": CLIENTS[0][1]}, "videoId": VID,
        "contentCheckOk": True, "racyCheckOk": True,
    }).encode()
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        data=body, headers={"User-Agent": UA_ANDROID, "Content-Type": "application/json",
                            "X-YouTube-Client-Name": "3",
                            "X-YouTube-Client-Version": "19.09.37"})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        d = json.loads(r.read(3_000_000))
    fmts = (d.get("streamingData") or {}).get("adaptiveFormats") or []
    audio = [f for f in fmts if "audio" in (f.get("mimeType") or "") and f.get("url")]
    if not audio:
        print("  no direct audio url to test")
        return
    best = max(audio, key=lambda f: f.get("bitrate", 0))
    print(f"  chosen: {best.get('mimeType')} {best.get('bitrate',0)//1000}kbps")
    r2 = urllib.request.Request(best["url"], headers={
        "User-Agent": UA_ANDROID, "Range": "bytes=0-199999"})
    t = time.time()
    with urllib.request.urlopen(r2, timeout=40, context=CTX) as rr:
        data = rr.read()
        print(f"  HTTP {rr.status}  {len(data)} bytes in {time.time()-t:.1f}s  "
              f"type={rr.headers.get('Content-Type')}  "
              f"ranges={rr.headers.get('Accept-Ranges')}")
        print(f"  magic: {data[:8].hex()}")
        if rr.status in (200, 206) and len(data) > 50000:
            print("  >>> PLAYABLE — this replaces the dead resolver entirely")

try:
    check_stream()
except Exception as e:
    print("  failed:", str(e)[:70])
