#!/usr/bin/env python3
"""
Verify data sources for the new tools BEFORE building anything.

The user asked for names/surnames directories and emergency numbers for India
and the world, and said: only build what is genuinely verified. So every source
here is tested from a browser Origin, and anything that fails is dropped rather
than shipped as a half-working tile.
"""
import concurrent.futures as cf, json, ssl, time, urllib.parse, urllib.request

ORIGIN = "https://jackbhai.github.io"
UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE

def probe(name, url, extract, timeout=20):
    t = time.time()
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "*/*", "Origin": ORIGIN, "Referer": ORIGIN + "/"})
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            body = r.read(900000)
            acao = r.headers.get("Access-Control-Allow-Origin", "—")
            st = r.status
        try:
            n, sample = extract(json.loads(body))
        except Exception as e:
            return (name, st, round(time.time()-t,1), acao, 0, f"parse:{str(e)[:38]}")
        return (name, st, round(time.time()-t,1), acao, n, sample)
    except Exception as e:
        return (name, "ERR", round(time.time()-t,1), "—", 0, str(e)[:46])

def show(title, rows):
    print(f"\n=== {title} ===")
    for r in sorted(rows, key=lambda x: -x[4]):
        usable = r[4] and r[3] in ("*", ORIGIN)
        print(f" {'OK ' if usable else '   '}{r[0]:<30}{str(r[1]):<5}{str(r[2]):>6}s "
              f"CORS={r[3]:<4} n={r[4]:<5}{str(r[5])[:40]}")
    return [r[0] for r in rows if r[4] and r[3] in ("*", ORIGIN)]

# ------------------------------------------------------------- names
NAMES = [
    ("agify (age from name)", "https://api.agify.io?name=arjun&country_id=IN",
     lambda j: (1 if j.get("age") else 0, f"age {j.get('age')} n={j.get('count')}")),
    ("genderize", "https://api.genderize.io?name=priya&country_id=IN",
     lambda j: (1 if j.get("gender") else 0, f"{j.get('gender')} {j.get('probability')}")),
    ("nationalize", "https://api.nationalize.io?name=singh",
     lambda j: (len(j.get("country", [])), (j.get("country") or [{}])[0].get("country_id", ""))),
    ("randomuser", "https://randomuser.me/api/?results=3&nat=in",
     lambda j: (len(j.get("results", [])),
                (j.get("results") or [{}])[0].get("name", {}).get("first", ""))),
    ("behind the name", "https://www.behindthename.com/api/lookup.json?name=aarav&key=demo",
     lambda j: (len(j) if isinstance(j, list) else 0, str(j)[:34])),
    ("datamuse (name-ish)", "https://api.datamuse.com/words?sp=aa*&max=20",
     lambda j: (len(j), (j or [{}])[0].get("word", ""))),
]

# ------------------------------------------------- emergency + country data
EMERGENCY = [
    ("restcountries all", "https://restcountries.com/v3.1/all?fields=name,cca2,idd,flags",
     lambda j: (len(j), (j or [{}])[0].get("name", {}).get("common", ""))),
    ("restcountries india", "https://restcountries.com/v3.1/alpha/in",
     lambda j: (len(j), (j or [{}])[0].get("name", {}).get("common", ""))),
    ("emergency numbers api", "https://emergencynumberapi.com/api/country/IN",
     lambda j: (1 if j.get("data") else 0,
                str((j.get("data") or {}).get("police", {}).get("all", ""))[:30])),
    ("emergency all countries", "https://emergencynumberapi.com/api/data/all",
     lambda j: (len(j.get("data", [])), "all countries")),
    ("worldtime (sanity)", "https://worldtimeapi.org/api/timezone/Asia/Kolkata",
     lambda j: (1 if j.get("datetime") else 0, str(j.get("datetime"))[:24])),
]

# --------------------------------------------------------- india-specific
INDIA = [
    ("postal PIN", "https://api.postalpincode.in/pincode/110001",
     lambda j: (len((j[0] or {}).get("PostOffice") or []),
                ((j[0] or {}).get("PostOffice") or [{}])[0].get("Name", ""))),
    ("IFSC lookup", "https://ifsc.razorpay.com/SBIN0000001",
     lambda j: (1 if j.get("BANK") else 0, f"{j.get('BANK','')} {j.get('CITY','')}")),
    ("cowin states", "https://cdn-api.co-vin.in/api/v2/admin/location/states",
     lambda j: (len(j.get("states", [])), (j.get("states") or [{}])[0].get("state_name",""))),
    ("india holidays (Nager)", "https://date.nager.at/api/v3/PublicHolidays/2026/IN",
     lambda j: (len(j) if isinstance(j, list) else 0,
                (j or [{}])[0].get("localName","") if isinstance(j, list) else "")),
    ("vehicle RTO (parivahan)", "https://vehicle-rc-api.vercel.app/api/DL01AA1111",
     lambda j: (1 if j else 0, str(j)[:30])),
]

rows = []
with cf.ThreadPoolExecutor(10) as ex:
    for r in ex.map(lambda a: probe(*a), NAMES): rows.append(r)
good_names = show("NAMES / people data", rows)

rows = []
with cf.ThreadPoolExecutor(10) as ex:
    for r in ex.map(lambda a: probe(*a), EMERGENCY): rows.append(r)
good_em = show("EMERGENCY + country data", rows)

rows = []
with cf.ThreadPoolExecutor(10) as ex:
    for r in ex.map(lambda a: probe(*a), INDIA): rows.append(r)
good_in = show("INDIA-specific", rows)

print("\n\n=== deep check on the emergency API (it decides a whole tool) ===")
for code in ["IN", "PK", "US", "GB", "AE", "AU", "CA", "SA"]:
    r = probe(code, f"https://emergencynumberapi.com/api/country/{code}",
              lambda j: (1 if j.get("data") else 0, json.dumps(j.get("data", {}))[:120]))
    d = r[5]
    print(f"  {code}: {d[:96]}")
