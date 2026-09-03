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
| `verify:trip` → `scripts/verify_trip.mjs` | the journey model (geometry, every `judge` state, the dense-stop regressions, step wording) plus assertions on what actually ships: leaflet and the bus JSON must stay out of the start shell, and every tile source must be key-free; §8 clocks three real pairs and asserts the timeline sums to the headline | 103 passed · 0 failed |
| `verify:render` → `vite build --ssr scripts/ssr-smoke.jsx` + `node .ssr-smoke/ssr-smoke.js` | all 10 travel components render to HTML, and 10 real journeys/stops answer from the shipped data | 20 passed · 0 failed |
| `python3 tests/qa_transit.py <url>` | a real chromium: shell paints through the lazy boundary, both hubs, both planners, the combined planner, the map behind its button on all three, a `set_geolocation` walk down a 71-stop route, resume after reload, console hygiene | 94 passed · 0 failed |
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
* **There is no live vehicle position.** Everything that publishes one (DTC's OTD GTFS-RT, `dtcmonitrix`, the scrape site's own
  `/api/live/buses/` endpoint, OpenMove) is key-gated, CORS-blocked or 401 from a browser. "Right now" is therefore the published
  timetable read against the device clock, and the trip bar prints `Timetable clock:` whenever it is doing exactly that. The UI
  never claims a live bus, and no screen should be cropped to imply one.
* **Map tiles are somebody else's servers.** Free and key-free today (`osm.fr`, Esri grey, OpenTopoMap, `openstreetmap.org`), but any
  of them can throttle a static site without notice. Two consequences: the map is a button rather than a permanent panel, and tiles
  are never cached by the service worker, so an offline trip draws the built-in SVG sketch instead of a grey box.

## 6. Notes for the next session

* `src/core/transit-link.js` joins metro stations to bus stops by **stop index**, then a
  distance filter (`max(450, station offset + 350) m`). Matching on names over-matches
  ("Nehru Place" gave 52 routes instead of 28). Do not go back to names.
* `BusHub` / `MetroHub` / `MultiModal` live in `src/tools/travel-hubs.jsx` and are
  `React.lazy`-imported in `App.jsx` on purpose: the 2.4 MB of JSON must stay out of the
  start shell. Measured on the current `dist` with `gzip -9`: start shell 1,450,461 B
  (418 kB gz), transit chunk 2,288,342 B (663 kB gz — it carries the trip engine as well),
  `travel-hubs` 36,300 B (9.6 kB gz). A map costs nothing until its button is pressed:
  `trip-map` 6,616 B (3.0 kB gz) and `leaflet-src` 149,034 B (42.8 kB gz) plus 15 kB of
  Leaflet CSS, all on demand. `public/sw.js` caches the app's own files so a repeat visit
  works offline; it deliberately never caches tiles.
* Node ESM needs explicit `.js` in `src/core/*` imports even though Vite does not.
* `minutesOfDay()` returns IST clock minutes, so a fixture like `new Date(2026, 0, 5, 1, 30)`
  is shifted by +330 minutes. Build test times as `Date.UTC(...) - 330 * 60000`.
* Do not move the JSON into `public/` behind a `fetch()` to shrink the bundle: it would make
  the core modules async and ripple through four tools and both hubs.

For the trip layer specifically:

* `judge()` may only advance to a stop that is **no farther than every stop before it**. 264 published
  directions have adjacent stops 0-100 m apart (duplicate halts, loops), so a plain "nearest stop within
  130 m" walk runs to the end of the line in one tick, `tick()` finishes the trip inside `armTrip`, and the
  symptom is a Get-off alert button that seems to do nothing — the bar and its `omni:trip-v1` key are gone
  20 ms after being written.
* Any ancestor with a `backdrop-filter`, `filter` or `transform` silently traps a `position: fixed` child.
  The trip bar is portalled to `<body>` for that reason, and `verify:trip` asserts no hook sits below its
  early `return null` — a `useState` after `return null` throws on the first armed render, no bar appears.
* Leaflet must be `await import('leaflet')` inside an effect, never a static import: the stylesheet and the
  43 kB gzipped library belong in the map's own chunk, and a static import breaks `scripts/ssr-smoke.jsx`
  (`window is not defined`).
* A hung `Notification.requestPermission()` is normal in headless Chromium (permission is `denied`, no
  prompt ever shown). Arm the trip first, ask for permission second, and race the ask with a timeout —
  `alerts.js` uses 4 s.
* Playwright's `context.set_geolocation()` takes a dict positional, not `latitude=` kwargs. And a fixture
  must pick a route number that ships as exactly **one** direction: most numbers here also have a return
  direction, and arming the wrong one puts the fake GPS at the far end of the ride — the app then
  correctly reports arrival before boarding, and the test blames the app.
* CARTO's `basemaps.cartocdn.com` is not usable: it paints "API KEY REQUIRED" across a keyless app's tiles
  and answers HTTP 200, so the tile-error fallback never fires. 200 is not health — look at the pixels.

---

## 7. The trip layer: map button, turn-by-turn, get-off alert

Built on top of the two payloads. It changed no data file, no crawler and no fare table.

| file | what it is |
|---|---|
| `src/core/trip.js` | the pure journey model: `trackOfBus` / `trackOfRoute` / `trackOfMetro` / `trackOfLine` / `trackOfCombo`, `stepsOf`, `judge`, `metresBetween`, `bearing`, `compass`. No React, no DOM, no timers. |
| `src/core/trip-state.js` | the single armed trip for the whole app (`omni:trip-v1` in localStorage), a 4 s ticker, GPS fixes in, state out, resumed on load |
| `src/core/alerts.js` | notifications (service worker first, `new Notification` second), vibration, wake lock, visibility |
| `src/tools/trip-map.jsx` | the map: `PROVIDERS`, the Leaflet mount, the tile fallback chain, `Sketch` + `project` for when there is no network at all |
| `src/tools/trip-ui.jsx` | the only surface a planner imports: `TripKit` (map toggle, turn-by-turn toggle, arm button), `TripBar`, `StepList`, `ArmButton`, `AlertStatus`, `useTrip` |

**The map is asked for, never imposed.** A journey card carries one `Map · N points` button; until it is
pressed nothing map-related is mounted or fetched. Pressing it lazily loads Leaflet, centres the panel in
the screen (unless the OS asked for reduced motion), and prints which tile source is live with a ▸ button
to move to the next one.

**Four tile sources, four operators, zero keys.** osm.fr, then Esri World_Light_Gray, then OpenTopoMap,
then openstreetmap.org — each with its own attribution, and each tried only after the previous one fails on
four tiles. No network at all draws `Sketch`: the same points projected into SVG, still tappable, zero
requests. The service worker never caches tiles, so nothing about offline behaviour got worse.

**An alert that cannot fire says why.** The bar prints the clock it is using (`Position ±9 m, matched
against 71 published stops`, or `Timetable clock: …`), where the alert went (`notifications go to your
shade` / `page-level` / `this bar only`) and whether the screen is being kept awake. That fine print is
folded under `how it knows` — one press, never deleted.

**States.** `no-signal → to-stop → at-board → riding → alight → done`. The last two highlight the bar in
amber, the most recent alert line folds itself away after 18 s (90 s when urgent) so the bar stays about
90 px tall, and `End` clears storage so a finished trip cannot come back stale.

## 8. The journey clock (`src/core/journey-clock.js`)

The combined planner used to answer *how long*. It now answers *when*, and every
minute it prints is traceable to something already in the two payloads.

**Inputs.** `now`, `leave-at` (a wall time the user picks, or a departure chip from
`departures()`), `arrive-by` (inverted with `latestFor()`, a forward search that returns
`null` rather than a rounded-down lie when the target cannot be met).

**Where each minute comes from.**

| leg | minutes | source |
|---|---|---|
| walk | `km / 5 km/h` | distance in the payload, fixed speed (labelled as such) |
| metro wait | `detail.nextIn`, else mid-band headway | DMRC headway table for that hour; `lineInfo` is queried at the *wrapped* minute, never the raw accumulator |
| metro ride | `km / 0.55 km·min⁻¹` | the planner's own speed constant, so the bar cannot drift from the headline |
| change + platform | `publishedMinutes − Σ(rides+walks)` | the planner already charges `(legs−1)×7 + 2`; it is drawn as its own segment instead of being hidden inside a ride or double-counted as a second wait |
| bus wait | printed departure − now | `nextAtStop()` on that direction's `trips`; if no departure exists in the window the leg is labelled `no service then`, never an invented headway |

Two invariants are asserted in `verify:trip` for three real pairs (2-leg, 2-leg, 3-leg):
`Σrides + Σwalks + allowance === publishedMinutes` and
`Σall legs === publishedMinutes + waitMin` — i.e. the picture equals the number, and the number
equals what the metro panel prints. `agrees` is the same test the UI can call at runtime.

**Honesty rules.** Closed line → the ride is placed at the published first-train minute and
`risk.kind = 'closed'` says so; a bus gap → `over`/`long-wait`; an impossible `arrive by` →
the earliest real arrival, not a fudge. The card prints one line saying that bus minutes are
published, metro waits are headway-derived, walking is a flat 5 km/h, and that nothing in the
panel is a live vehicle position.
