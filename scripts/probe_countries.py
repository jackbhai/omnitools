#!/usr/bin/env python3
"""
restcountries.com is deprecated on every version — find a replacement.

The Countries tool in the app calls it, so that tool is broken right now. Also
needed as the backbone for the "world dialling / emergency numbers" tool the
user asked for. Only sources with a real CORS header are usable.
"""
import concurrent.futures as cf, json, ssl, time, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def probe(name, url, extract, timeout=25):
    t = time.time()
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            body = r.read(4_000_000)
            acao = r.headers.get("Access-Control-Allow-Origin", "—")
            st = r.status
        try:
            n, s = extract(json.loads(body))
        except Exception as e:
            return (name, st, round(time.time()-t,1), acao, 0, f"parse:{str(e)[:36]}")
        return (name, st, round(time.time()-t,1), acao, n, s)
    except Exception as e:
        return (name, "ERR", round(time.time()-t,1), "—", 0, str(e)[:44])

SOURCES = [
    # the official successor host
    ("restcountries v4 all", "https://restcountries.com/v4/all",
     lambda j: (len(j) if isinstance(j, list) else 0, str(j)[:40])),
    ("files-03 legacy all", "https://files-03.restcountries.com/countries.00/legacy.json",
     lambda j: (len(j) if isinstance(j, list) else 0,
                (j[0].get("name", {}).get("common") if isinstance(j, list) and j else str(j)[:36]))),
    # countriesnow — separate project, several endpoints
    ("countriesnow codes", "https://countriesnow.space/api/v0.1/countries/codes",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("name", ""))),
    ("countriesnow capital", "https://countriesnow.space/api/v0.1/countries/capital",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("capital", ""))),
    ("countriesnow flags", "https://countriesnow.space/api/v0.1/countries/flag/images",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("name", ""))),
    ("countriesnow currency", "https://countriesnow.space/api/v0.1/countries/currency",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("currency", ""))),
    ("countriesnow population", "https://countriesnow.space/api/v0.1/countries/population",
     lambda j: (len(j.get("data", [])), (j.get("data") or [{}])[0].get("country", ""))),
    ("countriesnow cities IN", "https://countriesnow.space/api/v0.1/countries/cities/q?country=india",
     lambda j: (len(j.get("data", [])), (j.get("data") or [""])[0])),
    # github-hosted static datasets (no rate limit, permanent)
    ("mledoze/countries", "https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json",
     lambda j: (len(j), (j[0].get("name", {}) or {}).get("common", ""))),
    ("country-json calling codes",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-calling-code.json",
     lambda j: (len(j), f"{j[0].get('country')} +{j[0].get('calling_code')}")),
    ("country-json capitals",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-capital-city.json",
     lambda j: (len(j), f"{j[0].get('country')} {j[0].get('city')}")),
    ("country-json population",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-population.json",
     lambda j: (len(j), f"{j[0].get('country')} {j[0].get('population')}")),
    ("country-json currency",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-currency-code.json",
     lambda j: (len(j), f"{j[0].get('country')} {j[0].get('currency_code')}")),
    ("country-json languages",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-languages.json",
     lambda j: (len(j), f"{j[0].get('country')} {j[0].get('languages')}")),
    ("country-json abbreviation",
     "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-abbreviation.json",
     lambda j: (len(j), f"{j[0].get('country')} {j[0].get('abbreviation')}")),
    # world bank as a fallback for stats
    ("worldbank countries", "https://api.worldbank.org/v2/country?format=json&per_page=300",
     lambda j: (len(j[1]) if isinstance(j, list) and len(j) > 1 else 0,
                (j[1][0].get("name") if isinstance(j, list) and len(j) > 1 and j[1] else ""))),
]

rows = []
with cf.ThreadPoolExecutor(10) as ex:
    for r in ex.map(lambda a: probe(*a), SOURCES):
        rows.append(r)

print(f"{'source':<32}{'code':<6}{'time':>6}  CORS   n      sample")
print("-" * 96)
usable = []
for r in sorted(rows, key=lambda x: -x[4]):
    ok = r[4] and r[3] in ("*", ORIGIN)
    if ok: usable.append(r[0])
    print(f"{'OK ' if ok else '   '}{r[0]:<29}{str(r[1]):<6}{str(r[2]):>5}s  {r[3]:<5}{r[4]:<6} {str(r[5])[:38]}")

print(f"\nusable: {len(usable)}")
for u in usable: print("  ", u)

# the one that matters most for the app's Countries tool: search by name
print("\n=== can we search a single country by name? ===")
for name, url, ex_ in [
    ("mledoze (filter client-side)",
     "https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json",
     lambda j: (len([c for c in j if 'india' in json.dumps(c.get('name', {})).lower()]), "filtered")),
    ("countriesnow single",
     "https://countriesnow.space/api/v0.1/countries/capital/q?country=india",
     lambda j: (1 if j.get("data") else 0, str((j.get("data") or {}).get("capital", "")))),
]:
    r = probe(name, url, ex_)
    print(f"  {r[0]:<32} n={r[4]:<4} {r[5]}")
