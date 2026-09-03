# Transit data: how it is built, refreshed and checked

Everything the Bus / Metro / Multi-modal tiles show comes from two JSON files
that a script generates. No screen in the app contains a hand-typed number.

```
web pages  ──►  scrape/*.json  ──►  scripts/build_transit_data.py  ──►  src/data/*.json  ──►  src/core/*.js  ──►  src/tools/*.jsx
 (2,490 + 253)     (raw HTML)          (one command, idempotent)         (v2 payloads)        (pure logic)        (the UI)
```

## 1. What is in the two payloads

`src/data/bus-delhi.json` — 2.2 MB
* `routes[]`: **2,564 directions** with `r` (number), `f`/`t`
  (from/to terminal), `o` (operator), `s` (stop indices), `m` (cumulative metres along
  the published polyline), `km`, `mins`, `rv` (index of the return direction, 2,394 of them),
  `sm` (0 = straight-line length, i.e. the source published no geometry), `src: 'osm'`
  for the 76 directions that only OpenStreetMap had. That is **1,335 distinct route numbers**
  once leading zeros fold (`0184` = `184`); the source pages print 1,367 literal spellings.
* `tt` on 2,488 of them: `{a, b}` first/last bus in minutes-midnight, `k` trips a day,
  `pk` peak headway `[lo, hi]`, `pw` peak window, `op` off-peak headway, and `d` the
  **departure list** — 113,547 departures across the 2,478 directions that publish one
  (median 33 per direction, the longest 230).
* `stops[]`: 5,324 stop entries with coordinates (5,096 distinct names) — these back
  near-me and the metro↔bus join.
* `fare`: the published ordinary / AC / feeder slabs and child fares.

`src/data/metro-delhi.json` — 160 KB
* `lines[]`: 16 records (9 corridors + branches) with `c` colour, `l` label, per-station
  km, opening year, ridership, `tt` (service window + peak/off-peak headway + peak window),
  `term` (first/last train **per terminal**), `net`, `ticketing` (the Aqua Line is a
  separate corporation and a separate ticket).
* `stations[]`: **287 stations** with lat/lon, their lines, interchange flag, and `b` — the
  DTC/cluster stops published within 1 km of that station (227 stations carry them, up to
  12 routes each).
* `fares`: DMRC slabs effective **2025-08-25** (normal and Sunday/holiday), Airport
  Express, smart-card and off-peak discounts, and the journey-time limit.
* `segments` + `walks`: every hop between adjacent stations, and the two named
  out-of-fare transfers (Noida Sector 51 ↔ 52, and the station-complex walks).

## 2. Where it came from

Two independent sources, merged with the operator's own pages as the primary:

| what | source | how it was checked |
|---|---|---|
| route numbers, stop order, terminals, all timetables, bus stops, bus fares | 2,490 public route pages + 5,163 stage pages, fetched in full (2,490/2,490, 0 failures) | row counts vs the site's own sitemap; every shaped record re-measured |
| metro lines, station order, first/last train, headways, station bus links | 9 line pages + 244 station pages | the bus counts per station were compared with what the station pages themselves print |
| geometry for the 76 bus directions missing from those pages, and every station coordinate | OpenStreetMap via Overpass (`scripts/osm-sources/*.json`) | kept as pristine inputs so a rebuild needs no network |
| revised metro fares | DMRC's published revision, 25 Aug 2025, cross-read against 4 secondary reports | the site's own fare chart had ₹22/₹33 wrong, so its numbers were **not** used |

Live vehicle positions were attempted and are **not** available to a static site:
OTD's GTFS-Realtime needs an API key (401 without one), the DTC tracking hosts answer
403/CORS-blocked, and the source site's own `/api/live/buses/` returns 403 with no
`Access-Control-Allow-Origin`. So "right now" in this app means **the published timetable
measured against the device clock**, and every panel says exactly that. Do not re-add a
live-feed fetch without first proving it works from a browser: `curl` 200 is not enough,
the response must be readable cross-origin.

## 3. Rebuilding after the source changes

```bash
python3 /home/user/scrape/fetch_routes.py    # re-crawl 2,490 route pages -> scrape/routes.ndjson
python3 /home/user/scrape/fetch_metro.py     # re-crawl 9 line + 244 station pages -> *.ndjson
python3 scripts/build_transit_data.py        # rebuild BOTH json files, print the report
npm run verify                               # every gate below, in one command
```

The crawler scripts and their NDJSON output live in `/home/user/scrape`, **outside this
repo on purpose**: `routes.ndjson` alone is 32 MB of parsed HTML and the repo is a static
site. If that directory is gone, `scripts/build_transit_data.py` can still rebuild the
OpenStreetMap half (`scripts/osm-sources/`, vendored, 148 KB) but the timetable half needs
a re-crawl — so copy `/home/user/scrape` somewhere durable before touching the builder.
Line counts are the thing to check after a crawl: 2,490 routes, 5,163 stages,
9 lines, 244 stations (the sitemap lists them, so a short number means a failed fetch).

`scripts/build_transit_data.py` never reads its own output as a merge source, so re-running
it is idempotent: identical bytes in, identical bytes out. It writes
`/home/user/scrape/transit-report.json` (row counts, per-source decisions) and
`route-index.json` (every route with what it had). Its quality gates are deliberate:
a record is dropped only when it cannot serve a trip (fewer than 2 stops) or when a single
hop exceeds 25 km (a scrape artefact). 39 hops over 15 km survived the check because they
are real long sections between IAS stations — they are published, not invented.

## 4. The gates (`npm run verify`)

| script | covers | last run |
|---|---|---|
| `verify:data` → `scripts/verify_transit_data.py` | structural invariants, timetable sanity, `rv` symmetry, stop-index integrity, and length re-measured against an independent router (median built/OSRM ratio 1.001) | PASS 24 · WARN 0 · FAIL 0 |
| `verify:bus` → `scripts/verify_bus.mjs` | 78 assertions on the bus core, generated from the data itself (fare slabs, `nextAtStop`, `planBus`, `statusNow`, `headwayNow`) | 78 passed · 0 failed |
| `verify:metro` → `scripts/verify_metro.mjs` | 69 assertions on the metro core incl. the bus↔metro join, last-train estimates, transfers, the 2025 fare chart | 69 passed · 0 failed |
| `verify:render` → `vite build --ssr scripts/ssr-smoke.jsx` + `node .ssr-smoke/ssr-smoke.js` | all 10 travel components render to HTML, and 10 real journeys/stops answer from the shipped data | 20 passed · 0 failed |
| `python3 tests/qa_transit.py <url>` | a real chromium: shell paints through the lazy boundary, both hubs, both planners, the combined planner, and console hygiene | 38 passed · 0 failed |
| `python3 scripts/healthcheck.py all` | the rest of the app's network sources | 93/96 (3 unrelated third-party flakes) |

Run the browser suite against `npx vite preview` (a built `dist`), never against
`npm run dev`: the dev server's HMR socket points at :443 for the sandbox proxy, and the
resulting error overlay swallows every click.

## 5. Known limits — say these, do not hide them

* Bus arrival times at intermediate stops are **derived**: departure + share of the route's
  published full-run minutes, weighted by the polyline. Traffic is not modelled.
* Timetables are the source's published values. 159 directions publish a single trip,
  so their first and last bus are the same minute — that is the data, not a bug.
* `nextAtStop` answers for stops that the source lists on that direction only; a stop
  served in the other direction is found via `rv`.
* Metro last-train figures are per terminal in DMRC's own publication; the per-station
  number on screen is that time less the running time to the station, and the UI labels it
  "estimated".
* The Noida Aqua Line and the Delhi-Meerut RRTS are separate ticketing; a journey that
  crosses into them is priced per ticket, and says so.
* `0184`, `184`, `238`, `27B` and similar numbers people expect do not exist in either
  source. They were not silently invented.

## 6. Notes for the next session

* `src/core/transit-link.js` joins metro stations to bus stops by **stop index**, then a
  distance filter (`max(450, station offset + 350) m`). Matching on names over-matches
  ("Nehru Place" gave 52 routes instead of 28). Do not go back to names.
* `BusHub` / `MetroHub` / `MultiModal` live in `src/tools/travel-hubs.jsx` and are
  `React.lazy`-imported in `App.jsx` on purpose: the 2.4 MB of JSON must stay out of the
  start shell. Measured on `dist` with `gzip -9`: shell 1,457,821 B (411 kB gz) against
  1,634,587 B before the split, transit chunk 2,266,251 B (639 kB gz) fetched on demand,
  `travel-hubs` 34,415 B, and the service worker caches them so the next visit is offline.
* Node ESM needs explicit `.js` in `src/core/*` imports even though Vite does not.
* `minutesOfDay()` returns IST clock minutes, so a fixture like `new Date(2026, 0, 5, 1, 30)`
  is shifted by +330 minutes. Build test times as `Date.UTC(...) - 330 * 60000`.
* Do not move the JSON into `public/` behind a `fetch()` to shrink the bundle: it would make
  the core modules async and ripple through four tools and both hubs.
