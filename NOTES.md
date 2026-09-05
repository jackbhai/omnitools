# project notes

Not a design doc. This is the list of things I don't want to rediscover the
hard way, plus the numbers that took a whole day to measure once. If you're
picking this project up cold, read this before touching anything.

## The rules the app is built around

- Real data only. No placeholder rows, no "coming soon", no invented
  numbers anywhere in the UI. If a source is dead the panel says so.
- Every network path has 2-3 fallbacks on different infrastructure. Five
  mirrors of the same API is one plan wearing five hats.
- A 200 is not health. Count rows, fetch bytes, play the audio.
- Feature code lives in lazy chunks. The shell bundle must not grow just
  because one panel gained something - `verify_trip.mjs` greps the built
  shell for the feature's marker strings and fails if one leaked in.
- No vendor names in shipped files (sources are described by what they
  are: "second catalogue", "public archive"). `scripts/debrand.py
  --check` enforces it. `scripts/deemoji.py` keeps emoji out.

## Shape of it

```
browser (react + vite, static)
  ├─ direct fetch to ~130 CORS-open upstreams
  └─ cloudflare worker, only where CORS blocks
       /            relay, allow-listed hosts
       /song        races 30 catalogues, first playable wins
       /song-health paged (cloudflare caps 50 subrequests per request)
       /rss         batched RSS to JSON
       /search      bing + google news
       /topic       protobuf topic-id builder
       /surname     census scraper
       /yt          media resolver
```

Music resolution tiers, weakest last. The order is only visible when a tier
dies, and that is exactly how it was tested (kill the tier above, watch the
next answer):

```
primary → 16 catalogue mirrors → second catalogue (different company,
DB, CDN) → open music network → public archive → community uploads →
open-licence pool → open catalogue → live radio (only offered, never
silently substituted)
```

Transit data is a build-time snapshot, not a live API:

```
published gov pages → scrape/*.ndjson → scripts/build_transit_data.py
→ src/data/{bus-delhi,metro-delhi,stations-india}.json → verify scripts
```

The payloads (2026-09 rebuild): 1,335 distinct DTC route numbers across
2,490 directions with per-stop geometry and 113,547 published departures;
287 metro stations with fares effective 2025-08-25, per-terminal first/last
trains and headways. Refresh procedure in TRANSIT-DATA.md.

## Facts that cost time to learn

music:
- the saavn stream key decrypt is DES-ECB, key `38346591`, reimplemented in
  `src/core/saavn.js` and cross-checked against a python reference.
- quality rungs are `_320.mp4`, `_160.mp4`, ... `_48.mp4`. `_320.mp3` does
  not exist, it 404s.
- the audio CDN signs links and allows one active connection per client.
  Open a second while one streams and a random 403 shows up as MediaError 4
  mid-playlist. Player tears down first, re-resolves twice on expiry.
- jamendo's rate limiter answers HTTP 200 + success + zero rows. Retries
  once, then falls back to featured. Never trust that 200.
- the visualizer/equaliser need `crossOrigin="anonymous"` on the audio
  element or the analyser reads silence. All the current CDNs send
  `ACAO: *`, verified per-host. `playWithFallback()` drops the attribute if
  a future host can't handle it; sound wins over eye-candy.
- radio tiers (open network, archive, jamendo, etc.) answer a STYLE, never
  a song title. Asking them for a film track gets you a wrong answer that
  looks right.
- all 22 "public resolver" deployments people recommend are dead (cobalt,
  piped, invidious, soundcloud). Re-verified. Do not re-add them.

transit/maps:
- bus and metro ride steps carry their intermediate stops (`via`), and
  every step knows which map point it stands at (`pi`). Points and steps
  are two different index spaces; anything crossing the list↔map boundary
  must travel as a point index. Mixing them up was a real jump-to-wrong-pin
  bug - do not reintroduce it.
- walking legs: OSRM foot graph at routing.openstreetmap.de answers with
  real footpaths (749 m vs 781 m straight-line on a measured case, honest
  ~11% off). router.project-osrm.org "foot" returns drive-ish times, use it
  for distance only, never duration.
- nominatim answers 403 without a browser-ish User-Agent, and its results
  for India are sparse. It's the fallback, not the primary. Photon
  (komoot) is the primary geocoder.
- geocoders and reverse geocoding return real addresses; "tap the map to
  start a journey from here" reverse-geocodes the pin. When the pin can't
  be resolved the card says so instead of showing coordinates.
- one measured lesson: feed a map API a lat/lon pair and it may snap
  results to the wrong continent if you pass the axes swapped (an Oregon
  suburb once showed up as a New Delhi address). `anchorFor` in walkgeo.js
  pins the label to the point the user actually picked.

misc:
- M3U `EXTINF` lines can contain quoted commas (user-agent strings).
  Strip `key="..."` pairs before splitting on commas or channel names come
  out as `"like Gecko) Chrome/147..."`.
- Cloudflare worker: hard cap of 50 subrequests per request; a probe that
  checks audio bytes doubles that. Page health checks or the overflow
  reports healthy sources as dead.
- thespacedevs 429s after a few requests per IP; `mode=list` silently
  drops provider/pad/rocket fields. Three routes, never mode=list.
- Google News RSS answers 503 from all cloudflare IPs. Bing is primary.
- open-notify (ISS crew) is http-only; it was the single point of failure
  for that card. Now 3-deep, relay-first.

## Tests

Two Playwright suites, and they want DIFFERENT servers: qa_transit checks
the built bundle and runs against a preview of `dist/`; qa_new imports
`/src/...` modules directly (it inspects resolver internals), so it only
works against the vite DEV server. Starting a preview on 5190 instead of
dev makes a dozen chain tests die with "failed to fetch dynamically
imported module" and looks exactly like a product regression. It isn't.

```
npx vite preview --port 4173 --host 0.0.0.0
python3 tests/qa_transit.py http://localhost:4173/     # transit, 165 checks

npx vite --host 0.0.0.0 --port 5190                    # dev, transforms /src
python3 tests/qa_new.py                                # app-wide, 157 checks
python3 tests/qa_arti.py                               # devotional corpus, 39 checks (dev too)
```

In this sandbox headless chromium needs the local lib dir, and after a reset
the SONAME symlinks under ~/.libs are gone even though the .so files are not —
run `sh scripts/fix_playwright_libs.sh` first if the browser dies.
`LD_LIBRARY_PATH=/home/user/.libs/usr/lib/x86_64-linux-gnu`, and if a reset
wiped `~/.cache`, `pip install playwright && python3 -m playwright install
chromium` plus relinking the versioned `.so`s in `.libs` (unversioned names
too, chromium dlopen()s `libnspr4.so`, not `libnspr4.so.0`).

Suite gotchas:
- set a browser User-Agent in any python probe or cloudflare answers 403.
- several CSS labels are uppercased by rule; assert with the case-insensitive
  `has()` helper.
- navigate to BASE first, then BASE+#tool. A hash-only change doesn't reset
  tab state.
- suggestion dropdowns eat clicks; `click(force=True)` where needed.
- never sleep a fixed 24s for playback: poll `audio.currentTime > 0.5`. A
  freshly minted CDN link can expire inside one suite run; the player
  re-resolves and a fixed sleep reads that recovery as failure.
- fresh browser profiles have no play history, so anything that assumes a
  populated library row is stale. Seed playback via search (see
  `play_first` in qa_new.py).

Gate commands before any commit:

```
npx vite build
node --experimental-loader ./scripts/_json_loader.mjs scripts/verify_trip.mjs   # 200 checks
node --experimental-loader ./scripts/_json_loader.mjs scripts/verify_bus.mjs
node --experimental-loader ./scripts/_json_loader.mjs scripts/verify_metro.mjs
python3 scripts/verify_transit_data.py --pages 8 --osrm 6
python3 scripts/debrand.py --check && python3 scripts/deemoji.py
```

## Bugs already fixed, leave-them-fixed notes

- a catalogue mirror that answered every search with rows whose links all
  404'd. A search-based health check called it green for months. Every
  health check now fetches audio bytes.
- pausing a track snapped the vinyl back to 0deg; a stopped CSS animation
  doesn't hold its frame. It now pauses via `animation-play-state`.
- 40% of radio stations worked in dev and died in production: http
  sources on an https page fail silently. Scheme upgraded to https where
  it answers, original kept as fallback.
- names lookup took 30s on `Promise.all` (slowest source gates
  everything); progressive `pending` counter got it to 0.5s.
- the weather card lost UV/gust/visibility for the second city searched
  because the engine round-robin handed it a thinner source.
  `spread: false` on that pool.
- the via-list highlight: tapping an intermediate stop must light the stop,
  the parent ride row AND move the map pin; the first cut only lit the
  stop and the row stayed dark. The check is in qa §15.

## Deploy

Push to `main` with a personal access token in the URL, the token itself
never lives in the repo or in any file here:

```
git push "https://jackbhai:${TOKEN}@github.com/jackbhai/omnitools.git" main
```

Actions runs "Deploy to GitHub Pages", done in ~90s. To poll:
`GET /repos/jackbhai/omnitools/actions/runs?head_sha=<FULL 40-char sha>` -
the filter silently returns zero rows for a short sha.

After a deploy, verify by bytes, not by hope: fetch the live `index-*.js`,
pull the lazy chunk name out of it, fetch that chunk, compare size against
local `dist/` and grep for marker strings. Feature markers live in
`metro-planner-*.js` (transit), not in the shell, not in `trip-map-*.js`.

## Devotional corpus (arti sangrah)

- `src/data/arti.json`: 342 full texts (73 aarti / 50 chalisa / 44 mantra /
  114 stotra / 61 bhajan, 15 of them Marathi aarti + bhupal from Wikimedia), scraped once from a public aarti site's pages plus the wiki
  layer (Devanagari only, nothing truncated, every item keeps its source
  URL + fetch date). If a source line itself is ellipsised the item is
  dropped whole — a hymn with a spliced-out line is worse than no hymn.
  It is a dynamic-import chunk (~135 KB gzip) — never statically imported,
  the shell must stay lean. Rebuild: `python3 /home/user/scrape/arti/fetch_ha.py`
  (resumable ndjson, polite 0.35 s pacing) then `node scripts/build_arti.mjs`,
  which quality-gates every item (devanagari ratio, no ellipsis, no markup)
  and drops what fails instead of shipping it.
- Chant voices (`src/core/tts.js`): device speechSynthesis first (offline,
  instant), the shared media API's TTS as the studio tier (measured: it
  throttles above ~1 req/s — sequential calls, one retry, circuit breaker,
  session blob cache). No fake sync anywhere: highlight = the stanza actually
  being spoken.

## Current state

- 93 tools in the registry (`src/App.jsx`).
- gates as of the last commit: transit verify 200/0, qa_transit 165/0,
  qa_new 157/157, bus 78/0, metro 69/0, data 24 pass.
- two known-red sources with working fallbacks, by design: jamendo's
  empty-200 rate limit (tier H, anything above answers first) and google
  news rss 503 from cloudflare (bing is primary). Don't "fix" them by
  removing the fallback.
- raised once, not started: word-level karaoke highlighting in lyrics (the
  data has per-line timestamps, not per-word), liveness memory on the
  remaining fetch pools, offline snapshot of the geocoders for search.
