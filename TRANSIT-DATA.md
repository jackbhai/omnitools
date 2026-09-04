# Transit data: how it is built, refreshed and checked

The bus / metro / multi-modal panels read exactly two JSON files that a script
generates. There are no numbers typed into the UI by hand.

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
| `verify:trip` → `scripts/verify_trip.mjs` | the journey model (geometry, every `judge` state, the dense-stop regressions, step wording) plus assertions on what actually ships: leaflet and the bus JSON must stay out of the start shell, and every tile source must be key-free; §8 clocks three real pairs and asserts the timeline sums to the headline | 131 passed · 0 failed |
| `verify:render` → `vite build --ssr scripts/ssr-smoke.jsx` + `node .ssr-smoke/ssr-smoke.js` | all 10 travel components render to HTML, and 10 real journeys/stops answer from the shipped data | 20 passed · 0 failed |
| `python3 tests/qa_transit.py <url>` | a real chromium: shell paints through the lazy boundary, both hubs, both planners, the combined planner, the map behind its button on all three, a `set_geolocation` walk down a 71-stop route, resume after reload, console hygiene | 109 passed · 0 failed |
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

## 9. The sounds (`src/core/sfx.js`)

Seven of them, and every one is built from oscillators and a noise buffer inside the browser:
**no audio file is downloaded, none is cached, and `caches.open` is never called**, so the
offline payload and the service worker are untouched. `verify:trip` asserts that literally —
the module contains no `fetch`, `new Audio`, `decodeAudioData`, data URI or URL at all, and
it imports exactly one thing (`core/settings.js`).

**They are the app's, not travel's.** `App.jsx` calls `sfx.attach()` once in the shell, and the
layer listens to `pointerdown`/`keydown` on the document and maps the element that was pressed
to a sound: `.tile` → `whoosh` (opening any tool), a button labelled `Back` → `back`,
`.btn`/`.cat`/`.chip`/`.tabs button`/`.iconbtn`/`.row`/checkbox/radio → `tick`. Anything can
opt out with `data-sfx="none"`, and a `[data-sfx]`-less element that matches nothing stays
silent. Panel-level `sound()` calls were left in place on purpose: they fire on the same
gesture, `play()`'s per-sound `minMs` floor turns the later one away with `too soon`, and that
is why a deliberate sound (a chime for an answer, a bell for an alert) always wins over the
generic tick. The shell grows by the engine and nothing else — measured **+7,680 bytes** on
`index-*.js` (1,451,018 → 1,458,698), and `verify:trip` still insists the transit JSON and
leaflet stay out of it.

| sound | what it means | what it is made of |
|---|---|---|
| `whoosh` | a place has been picked | noise through a band swept 240 → 1600 → 205 Hz, 52 → 34 Hz rail rumble, panned −0.95 → +0.95 |
| `chime` | a journey has been worked out | C6 E6 G6 C7, 90 ms apart |
| `ding` | an alert has really armed | C6 + G6 |
| `alight` | **get off now** | three C6/E6 bells 260 ms apart plus a 66 Hz thump — the only sound allowed while the tab is hidden |
| `brake` | the timetable cannot support this | noise through a highpass falling 2400 → 620 Hz, saw 240 → 70, 90 → 55 thump |
| `tick` | a key was pressed, or any button anywhere in the app | one 1180 → 900 Hz square, 45 ms |
| `back` | a tool was left | the same sweep run the other way: 1500 → 265 → 175 Hz, panned +0.9 → −0.7 |

`play()` answers `{ ok, why }` and never throws: `sounds are off`, `this tab is in the
background`, `too soon` (the per-sound repeat floor), `no such sound`, `this browser has no
Web Audio`, `graph failed: …`. The last decision is printed under the panel's own switch, so
silence always has a reason in words.

**Three places to switch, one preference.** The header carries a `volume`/`volumeoff` icon
button on every screen — next to a `cog` that opens Settings — and every one of the three
switches writes the same `omni:settings -> sfx` key. Settings subscribes through
`onSettings()`, so turning sound off from the header unchecks its box live instead of showing a
stale one; the Settings page also has five test buttons (`Hear a tap`, `Hear a tool open`,
`Hear a leave`, `Hear an answer`, `Hear an alert armed`) that call the app's own `play()`
rather than a private demo sound. `qa_transit` proves the chain in a browser: a press on the
**QR Code** tile builds audio nodes, the back button has its own recipe, the travel panel's row
follows the header, and with sound off the page reports 0 contexts and 0 nodes.

Peaks are capped at 0.34 per voice behind a master of
0.5 and a compressor at −12 dB; the browser suite renders the same graphs through an
`OfflineAudioContext` and asserts peak 0.30 with **zero clipped samples**, 0.85 s of signal,
different energy in the two ears, and 0 nodes built when the switch is off — off is silence,
not quieter.

---

## 10. The combined search (`src/core/combo-route.js`)

Plan Journey does not run the metro planner and the bus planner and staple the answers
together. It searches **one graph** that contains both modes, so a bus can beat the metro, the
metro can beat a bus, and a journey that needs both is found by the search instead of guessed
at by a feeder-bus heuristic.

- **Nodes** are `m#<station>` (one node per station, so a station on three lines is still one
  node and changing lines is a real decision, not a teleport) and `b#<stopIdx>`.
- **Edges**: every adjacent hop of every published bus direction (2,490 routes, 82,408
  directed edges, km measured along the shape the bus actually drives, minutes from that
  direction's own speed), every adjacent station pair of every metro line (608), and the walk
  links a station publishes to its stops plus the interchange walks inside stations (5,328).
  5,239 nodes, built in ~120-150 ms and memoised, in memory only - nothing new ships.
- **Cost** is one `edgeCost(obj, edge)` plus a change penalty: `7` min to change metro line at
  a gate, `8` min to board anything else (a second DTC ticket, not a tap), `2` min to get into
  the paid area once per metro chain, walking at `5 km/h`. `price()` prints numbers from the
  same constants, because a search that optimises a different sum than the one displayed is how
  a planner starts lying.
- **The end walk is priced inside the search** through a virtual sink node: the journey is the
  ride plus getting to the place that was asked for. Without this the search happily stopped a
  station early - Rajiv Chowk to Hauz Khas once came back as 38 min with 2 km of walking at
  each end instead of 23 min. And the sink is only offered to a journey that used a vehicle,
  otherwise "walk to a station, walk to a stop" beats everything and the metro never appears.
- **Objectives**: `min` (minutes), `fare` (rupees) and `value` (minutes + ₹2 per minute saved).
  `fare` is priced per kilometre - `₹0.90/km` on bus (the slope of the DTC slab, 0.3-3 km ₹5 up
  to 12-40 km ₹15) and `₹2.20/km` on the metro (the DMRC table's slope), with walking at
  `₹0.25/min` - not per published slab *per hop*. Charging the slab at every hop made a 30-stop
  ride cost ₹150, the search concluded that walking Delhi was cheaper, and uniform-cost
  wandered into its own pop ceiling. A new ticket costs ₹5 at a gate; a metro line change costs
  nothing (one ticket, one ride).
- **How many searches**: five for `Both, whichever wins` (`all/min`, `all/fare`, `all/value`,
  `metro/min`, `metro/fare`), three each for `Metro only`, `Bus only` and `Metro + bus, both`.
  Not seven: `bus/min` and `bus/fare` are exactly what `all/min`/`all/fare` may already return
  (the wider graph contains the bus sub-graph), so running them again bought nothing and cost
  0.5-1.9 s. `all/value` exists because `value` weights minutes and rupees together; the
  single-mode runs exist so "Metro only" can answer without the bus sub-graph in the way.
  Every candidate must be a finished journey, so `only: 'bus'` is the same engine, not a weaker
  one. Candidates are deduped by their rides (which door the station was left by is not a
  different journey), then anything both slower and dearer than something already shown is
  dropped.
- **Caps**: `MAX_WALK_KM 2`, `MAX_WALK_MIN 20`, `MAX_LEGS 7`, `MAX_MINUTES 360`, six entries at
  the origin and every published stop within 2 km of the destination as an exit, 260,000 pops per
  search and 120,000 for a single-mode money search. A* with `haversine / 0.55 km per minute`
  toward the destination for minutes, and for rupees `haversine x ₹0.90/km` - the cheapest fare
  per kilometre anyone can buy, so it stays a lower bound and cannot cut an answer. A search
  that hits its ceiling says so (`capped`) and the panel prints the sentence; `Bus only` is the
  question most likely to say it, because a 82,408-edge sub-graph searched exhaustively for the
  cheapest rupee total is genuinely slow.
- **Measured** (`node --experimental-loader ./scripts/_json_loader.mjs scripts/_sweep_combo.mjs`,
  18 named pairs, of which 12 are spelled the way the two datasets spell them): 28-909 ms per
  answer, 1-5 options, no pair left empty, worst end walk 1.22 km, and the best answer is a
  `Metro + Bus` journey on two of them. The metro champion agrees with the metro planner -
  Rajiv Chowk to Hauz Khas `23 min ₹32` (21 riding + 2 walking) against the metro tool's
  `21 min ₹32`; AIIMS to Noida Sector 52 `59 min ₹54, 2 changes, 22.71 km` against
  `57 min ₹54, 2 changes, 22.72 km`. Same fare because it is the same published slab; the
  minutes differ by exactly the two walks, and `verify:trip` asserts that relationship instead
  of a constant.
- **What the per-mode lists could not show**: Anand Vihar ISBT to Nehru Place at 06:42 as
  `Metro + Bus - 35 min ₹37, 1 change` - RRTS to New Ashok Nagar, 0.32 km to Crown Plaza, bus
  440 to Govindpuri - where the bus-only answer is 46 min and the metro cannot reach it at that
  hour. Non-DMRC lines (the RRTS) carry `separateTicket` and a sentence saying their ticket is
  not part of the DMRC slab.
- **The UI** (`src/tools/multimodal.jsx`) shows one ranked list with four questions - `Best
  overall` (the search's own `value`), `Fastest`, `Cheapest`, `Fewest changes` - four mode
  filters (`Both, whichever wins`, `Metro + bus, both`, `Metro only`, `Bus only`), an `AC bus`
  price toggle, the departure clock, and fine print that states how many journeys the search
  found and how many it discarded. The question rows stay on screen when a filter returns
  nothing, so an empty answer is a state the traveller can leave.
### The two bugs the sweep found, and what they taught

Both were found by printing legs and measuring, not by reading the code, and both are now
gated in `verify:trip`.

1. **A leg stitched from two route records.** Vehicle ids were keyed by route *number*
   (`912`), while a leg's stops were read from a route *record* index. The DTC data lists a
   number once per direction, so a chain that rode the first record's early hops and the
   second record's later hops merged into one leg - and printed `i0` from one and `i1` from
   the other. Vishwavidyalaya to Hauz Khas came back as `Bus 20 min ₹5` whose get-off stop was
   14.4 km from the destination, and because that number dominated the Pareto list it **deleted
   the correct metro answer**. Ids are per record now, and a bus span only merges while the hops
   are contiguous. `gate: 35 ride legs name the stops their own route data holds`.
2. **Settling a node instead of a state.** The search marks nodes settled, so the first state to
   reach a destination node - often a walk - owned its chain. `only: 'metro'` answered *nothing*
   for a pair with a direct ride, and the cost remembered for a candidate belonged to a
   different journey than the legs being shown. Arrival on a vehicle is now recorded while edges
   are relaxed (`rideAt`), the walk-only state is left alone, and the minutes on screen must
   equal the minutes that were optimised (`gate: 19 options cost what they claim`).

Two smaller things came out of the same pass: `endsAt` used to treat "the place is named after
this station" as "the place is standing at this station", which invented a 0 km walk across
4 km of city - it now measures the gap and lets the walk cap reject the entry; and `plan()` took
place objects only, so a bare name lost its memo key (`undefined|undefined`) and shared one
cached answer with every other named pair - it resolves names through a normalised index of
both datasets now, and says so when a name belongs to neither.

- `verify:trip` §12 holds 29 checks over this file: the graph is built once, walk links exist
  only where the published station exits say so, no edge is free, the shown options are
  Pareto-clean, the caps hold, both modes' champions agree with their own single-mode planner,
  a place given by name alone still answers, a repeat comes from the memo, and a journey whose
  two ends are the same place is refused with a note rather than invented.
