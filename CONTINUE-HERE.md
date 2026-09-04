# OmniTools — complete handoff

**This one file is the entire handoff. Paste it into a new chat and nothing
else is needed.**

Everything below is verified fact from the working project. Numbers came from
probes, not estimates.

---

## Links

| What | Where |
|---|---|
| **Live site** | https://jackbhai.github.io/omnitools/ |
| **Code repo** (site source, deploys from `main`) | https://github.com/jackbhai/omnitools |
| **Workspace repo** (full snapshot incl. tests + docs) | https://github.com/jackbhai/omnitools-workspace |
| Cloudflare Worker | https://omni-proxy.omni-jackbhai.workers.dev |
| Local path | `/home/user/omni` |

Raw file access, if you want to read code without cloning:
```
https://raw.githubusercontent.com/jackbhai/omnitools/main/<path>
```

---

## Credentials

The tokens are **not in this repository** — GitHub's push protection blocks
them, correctly. They live in the copy of this file in the project owner's
workspace, which is the copy that gets pasted into a new chat. If you are
reading this on GitHub and have no tokens, ask for them.

What they are, so you know what to expect:

```
GitHub PAT         ghp_...   push access to jackbhai/omnitools
Cloudflare token   cfut_...  deploy access to the omni-proxy Worker
CF account id      c15af85b232320e9f2d1814f66653697
```

The owner rotates and revokes these himself. Mention it once at the end of a
session if you like — do not warn him every message.

**Push:**
```bash
GH=<github token>
git push "https://jackbhai:${GH}@github.com/jackbhai/omnitools.git" main
```

**Deploy the Worker** (`worker.mjs` is a temp copy the API requires by name —
always delete it after):
```bash
cd worker && cp omni-proxy.js worker.mjs
CF=<cloudflare token>
ACC=c15af85b232320e9f2d1814f66653697
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/scripts/omni-proxy" \
  -H "Authorization: Bearer ${CF}" \
  -F 'metadata={"main_module":"worker.mjs","compatibility_date":"2024-11-01"};type=application/json' \
  -F 'worker.mjs=@worker.mjs;type=application/javascript+module'
rm -f worker.mjs
```

---

## How I work — read this before writing anything

I write **Hinglish** (Hindi + English, Roman script). **Reply in Hinglish.**

- I'm direct. Build the thing; don't describe the plan first.
- **If I ask twice, your last attempt did not work.** Don't re-explain it —
  go measure it and find the real cause.
- Be honest about breakage. "This source is dead, I removed it" is what I
  want. Shipping something half-working quietly is not.
- Don't narrate long tool sequences. Keep momentum, show results.
- Lead with the outcome, then the detail.

### Standing rules — these never expire

| My words | What it means |
|---|---|
| "sara data ekdam og our genone hone chiye fake ya temp data nhi hona chiye" | **Zero fake data.** No placeholders, no demo values, no "coming soon" |
| "10 times dara verify and recheck Krna then use Krna" | Verify a source ~10× before trusting it |
| "2-3 fallback dalo taki ruke na bilkul bhi" | 2–3 **independent** fallbacks minimum |
| "max to max tools" | Keep adding tools |
| "kabhi band na ho 99% best our future proof" | Assume every upstream dies eventually |
| "add fix test add fix test loop jab tak 100x working na ho" | Loop until measured working, not until it looks done |

Music must stay **ad-free with background playback**. It is the USP.

**A 200 response is not health.** Count rows, fetch bytes, play the audio.
"Independent" fallback means a different company on a different CDN — five
mirrors of one API is one plan wearing five hats.

---

## The project

**OmniTools** — mobile-first web app, **76 working tools**, no login, no
signup, no API keys, no ads, no tracking. Free on GitHub Pages.

```
India 9 · Everyday 9 · Convert 9 · Travel 8 · Dev 8 · Media 6 · Learn 6
Time 4 · Text 4 · Generate 4 · Space 3 · Money 3 · Health 2 · Music 1
```
Music is one tile but the largest subsystem in the app.

### Stack
React 18 + Vite (rolldown), plain CSS, no UI framework, no state library, no
backend, no database, no server rendering. `hls.js` from CDN on demand.
Cloudflare Worker deployed by `curl` (no wrangler). Playwright + Python tests.

**Deploy = push to `main` → GitHub Actions → Pages, about 90 seconds.**

### Architecture
```
Browser (React + Vite, fully static)
  ├─ direct fetch to ~130 CORS-open upstreams      ← preferred path
  └─ Cloudflare Worker                              ← only where CORS blocks
       /            CORS relay, ~130-host allow-list
       /song        races 30 song catalogues, first playable wins
       /song-health paged (Cloudflare caps 50 subrequests per request)
       /rss         batched RSS to JSON
       /search      Bing + Google news
       /topic       protobuf topic-id builder
       /surname     census scraper
       /yt          media resolver
```

### Design system
- Fonts: `Bangers` (display), `DM Sans` (body), `DM Mono` (mono)
- AMOLED `#000000`, green `#00FF9C`, cyan `#00E5FF`, text `#E8FFF4`
- **Zero emoji** — 108 hand-written SVG icons in `src/ui/icons.jsx`.
  Enforced by `scripts/deemoji.py`.
- **No vendor name anywhere.** Sources are named by what they are ("second
  catalogue", "public archive"), never who runs them. Enforced by
  `scripts/debrand.py --check`. The host is base64-decoded at runtime in
  `src/core/endpoints.js`, the Worker and the test suite — cosmetic, not a
  security boundary, but the project must not advertise its sources.

---

## What is built and working

### Music — 9 independent tiers

| Tier | What | Relay | Exact |
|---|---|---|---|
| A | Primary resolver (vendor API) | yes | yes |
| B | 16 catalogue mirrors, CORS-open, raced in waves of 4 | no | yes |
| B0 | **Worker `/song` — 30 catalogues in one request** | yes | yes |
| C | Catalogue direct | optional | yes |
| J | **Second Indian catalogue** — different company, DB, CDN | no | yes |
| D | Open music network (4 Audius nodes) | no | no |
| E | Public archive (archive.org) | no | no |
| I | Community uploads (hearthis) | no | no |
| G | Open-licence pool (openverse) | no | no |
| H | Open catalogue (jamendo) | no | no |
| F | Live radio — explicit offer, never a silent substitution | no | no |

Verified by **blocking each tier in a real browser** and watching the next
answer:
```
primary dead        → catalogue-2        + relay dead        → catalogue-2
+ mirrors dead      → open-network       + open network dead → public-archive
+ archive dead      → community-uploads  + community dead    → open-licence
+ aggregator dead   → open-catalogue     last resort         → live radio
```

Ten historically-difficult songs all resolve and play through the Worker in
0.18–1.09 s: Babbu Maan Touchwood, Ishq Murshid, Cheema Y, Pasoori, Mehmaan,
Kesariya, Chaleya, Apna Bana Le, Jhoome Jo Pathaan, Tum Hi Ho.

**Facts that cost real time to learn:**
- JioSaavn DES-ECB key `38346591`, decrypt reimplemented in pure JS in
  `src/core/saavn.js`, verified 10/10 against a Python reference
- Quality ladder `_320.mp4`, `_160.mp4`, `_96.mp4`, `_48.mp4`.
  **`_320.mp3` does not exist — it 404s.**
- `saavncdn` sends `Access-Control-Allow-Origin: *` → audio plays direct,
  **no relay in the audio path**
- The CDN signs links and allows **one active connection per client**. Opening
  a second while the first streams makes one return 403 → MediaError 4
  mid-playlist. The player tears the old connection down first and has two
  re-resolve attempts.
- Jamendo rate limit returns **HTTP 200 + `status: success` + empty results.**
  Retries once after 700 ms, then falls back to `featured=1`.
- Tiers G and H must be asked for a **STYLE** via `radioHint()`, never a song
  title — they never hold film recordings.
- All 22 public resolvers are dead (5 Cobalt, 9 Piped, 8 Invidious,
  SoundCloud). Re-verified. **Do not re-add them.**

### Live TV — 2,420 Indian channels

Nine merged playlists ordered by **measured live rate**, not by stars:
```
92%  DugguTV/streams/channels.m3u              359 indian
90%  Free-TV/playlists/playlist_india.m3u8      32
84%  amazeyourself/dishd2h.m3u                  27
76%  Zaman-Topu/FINAL_IPTV_ACTIVE.m3u          683
68%  amazeyourself/ashokadigital.m3u           134
67%  iptv-org/countries/in.m3u                 747
60%  Yaarokayaar1110                            35
44%  Zaman-Topu/FINAL_IPTV_COMPLETE.m3u       2164   huge, so kept last
 0%  FINAL_IPTV_DEAD.m3u + 4 JioTV lists              EXCLUDED
```
JioTV links expire within hours, hence excluded. Two sources are worldwide
lists that merely contain Indian TV — merged unfiltered they produced 19,505
channels of mostly foreign content, so each source carries an `only:` regex.

**909 channels exist in none of the older sources** — all of Doordarshan
regional, Bhojpuri channels, state broadcasters.

### FM
Five sources. https upgrade recovers 35 of 52 stations. Duplicates collapsed.
Liveness memory. Three live directory mirrors (was effectively one — the second
had stopped resolving in DNS).

### Player UI
Vinyl disc with grooves that **freezes in place** when paused, three
visualisers driven by a real analyser (bars with falling peaks / waveform /
pulsing ring), volume with mute memory, buffered-ahead on the seek bar,
distinct repeat-one glyph, track chips (album, year, language, duration,
bitrate read off the actual stream URL), queue with running time.

### Everything else
News (52 country editions, 49 publisher feeds, Bing search, protobuf topic
ids), names (5,695, progressive loading), medicines (253,802), weather, air
quality, transit, space, converters, generators.

---

## Bugs already found and fixed — do not reintroduce these

Each was found by measuring, not by reading code. This is why the
"verify, don't assume" rule exists.

**A mirror that answered every search with dead links.**
`jiosaavn-api-beta` shipped for months. Every search returned a perfect row
whose every quality rung 404'd — 10 songs × 5 rungs = 50 dead addresses. A
search-based health check called it green the whole time. **Every health check
now fetches audio bytes.**

**The visualiser never worked, on any track, ever.**
A cross-origin `<audio>` without `crossOrigin="anonymous"` yields a **muted**
MediaElementSource — sound plays but script cannot read samples. Measured:
analyser sum 0, peak 0, while audibly playing. The code avoided the attribute
citing a 302-redirect problem. Re-measured, fresh link per trial:
```
c.ymcdn.org        crossOrigin 5/5 played   plain 5/5   spectrum 1622 vs 0
aac.saavncdn.com   crossOrigin 5/5 played   plain 5/5   spectrum 1759 vs 0
gaana HLS          crossOrigin ok           plain ok    spectrum 2097 vs 2045
```
Both send `Access-Control-Allow-Origin: *`. Fixing it also unlocked the
equaliser, which the UI had been claiming could not work on streams.
`playWithFallback()` drops the attribute and replays if it ever breaks — sound
wins over decoration.

**Pausing snapped the artwork upright.** A stopped CSS animation does not hold
its frame, it returns to 0deg. Now uses `animation-play-state: paused`.

**40% of radio stations died only on the deployed site.** 52 of 129 stations
are published as plain `http://`; an https page silently refuses insecure
audio. Worked in dev, dead in production, no error shown. 35 of the 52 work
over https → scheme upgraded, original kept as fallback.

**M3U parsing produced channels named `"like Gecko) Chrome/147.0.0.0"`.**
81 India entries carry `http-user-agent="Mozilla/5.0 (Windows NT 10.0; ...)"`
whose value contains commas, and EXTINF was split on the first comma.
Fix: `const stripped = l.replace(/[\w-]+="[^"]*"/g, '');` then split.

**Names lookup took 30 s because of `Promise.all`.** Waited for the slowest
source (Wikidata, 25 s) while the census answered in 0.1 s. Made progressive
with a `pending` counter. **30 s → 0.5 s.**

**Weather card was silently thinner for city #2.** Engine round-robin handed it
MET Norway, which lacks UV/gusts/visibility. Fixed with `spread: false`.

**`api.open-notify.org` is http-only, no https at all.** "People in space" had
exactly one provider, so the card could never load on the live site. Now
3-deep, relay-first.

**Cloudflare caps 50 subrequests per request.** Probing 31 sources with an
audio check is 62, and the overflow does not fail cleanly — it blames *healthy*
sources. A naive probe called 12 working sources dead. `/song-health` pages.

**`ll.thespacedevs.com` returns 429 after a few requests per IP.** Now 3
routes. Do **not** use `mode=list` — it silently drops
`launch_service_provider`, `pad` and `rocket.configuration`.

**Google News `/rss/search` returns 503 from all Cloudflare IPs.** Bing News
RSS is primary. Google topic IDs are base64 protobuf, reconstructed from
Knowledge Graph mids — all 8 reproduce byte-for-byte.

---

## Environment

The sandbox resets — `node_modules`, Playwright and git config get wiped, and
the git remote is lost (always push with the token in the URL).

```bash
# if /home/user/omni is missing
git clone https://github.com/jackbhai/omnitools.git /home/user/omni

cd /home/user/omni
npm install
pip install playwright && python3 -m playwright install chromium
python3 -m playwright install-deps chromium
git config user.name "jackbhai"
git config user.email "jackbhai@users.noreply.github.com"
npx vite --host 0.0.0.0 --port 5190
```

### Testing traps
- **Cloudflare answers Python-urllib's default User-Agent with 403.** Always
  set a browser UA in probe scripts.
- CSS `text-transform: uppercase` on `.chead`, `.stat .l`, `.fld label` — all
  assertions must use the case-insensitive `has()` helper.
- Playwright must navigate to BASE **then** BASE+"#tool"; a hash-only change
  does not reset tab state.
- Search-suggestion dropdowns intercept clicks → use `click(force=True)`.
- Poll for `audio.currentTime > 0.5`; never `sleep(24)`. The suite is long and
  a link minted early can expire before it is used.

---

## Files worth knowing

```
src/App.jsx                 76-tool registry, categories
src/core/saavn.js           16 mirrors, DES decrypt, raceMirrors, relayRace
src/core/sources.js         TIERS registry, radio, station liveness, tier J
src/core/audio-resolve.js   staged resolution, rememberTrack, saavn fallback
src/core/player.jsx         Chain (EQ + viz tap), attach/playWithFallback
src/core/engine.js          jget with forceProxy + mixed-content guard
src/core/iptv.js            9 playlists, parseM3U, liveness memory
src/core/news.js            52 editions, 49 publishers, protobuf topics
src/core/names.js           5,695 names, progressive deepLookup
src/core/providers.js       weather/air/iss/astros/crypto/ipinfo/radio pools
src/ui/PlayerUI.jsx         MiniPlayer, FullPlayer, 3 visualisers, chips
src/ui/icons.jsx            108 hand-written SVG icons
src/styles/theme.css        design system, vinyl disc, spectrum, queue
worker/omni-proxy.js        CORS relay + /song racer + 6 endpoints
scripts/healthcheck.py      reads URLs OUT OF SOURCE so it cannot drift
scripts/debrand.py          --check enforces no vendor name
scripts/deemoji.py          enforces no emoji
tests/qa_new.py             Playwright suite, 170 checks
public/names/               27 shards, 5,695 names
public/med/                 253,802 medicines
```

---

## Current state

| | |
|---|---|
| Tools | **76** |
| Test suite | **147/147** (FM checks added after; pass standalone, not yet run in the full suite) |
| Source health | **34/36** |
| Worker | **30/30 song sources alive** |
| Last commit | `1fdd76e` — FM https upgrade + liveness |

### Known red — both expected, both covered

| What | Why | Covered by |
|---|---|---|
| Jamendo | Rate limit returns 200 + `success` + zero rows | Retry, then `featured=1`. Tier H; A–E answer first |
| Google news aggregator IN | 503 to all Cloudflare IPs | Bing is primary; 49 publisher feeds work |

Neither is a bug to fix. Both are other people's servers behaving badly with
working fallbacks in place. **Do not "fix" them by removing the fallback.**

---

## What to do next

**1. Run the full suite with the new FM checks.** They pass standalone
(`insecure: 0, withAlt: 16, unique: 57/57, mirrors: 3, learned: 12, up: 10,
first=1 last=-1`) but have not been run inside the whole suite.
```bash
python3 tests/qa_new.py
```

**2. Push and verify the deploy.**
```bash
git push "https://jackbhai:${GH}@github.com/jackbhai/omnitools.git" main
# wait ~90s, check the Actions API for conclusion == success
```

**3. The open feature request — full GitHub scan for new tools.**
Find new unique, working, live APIs and add the best as tools. Started last
session (24 queries for public-API list repos) but not finished.

The method that has worked twice:
```
search many phrasings → collect repos → pull README + homepage
  → extract candidate URLs → probe every host with several path shapes
  → keep only those returning REAL data
  → deep-verify survivors against hard cases
  → rank by measured latency / coverage
  → ship with 2-3 independent fallbacks
```
That turned 3,884 repos into 30 verified music sources, and 80 repos into 9
ranked IPTV playlists.

Anything added must have: real verified data, 2–3 independent fallbacks, no
vendor names, no emoji, and a healthcheck entry that fetches actual content
rather than trusting a 200.

**4. Rotate the credentials** when pausing the project.

### Raised but not started
- Word-level highlighting in the lyrics tab
- Liveness memory on the remaining source pools

---

## Before every commit

```bash
npx vite build                      # must be clean
python3 scripts/debrand.py --check  # no vendor name
python3 scripts/deemoji.py          # no emoji
python3 scripts/healthcheck.py all  # source health
python3 tests/qa_new.py             # the suite
```

Health of one group:
```bash
python3 scripts/healthcheck.py music   # music|radio|tv|news|relay|data|all
```

Worker song sources (paged — Cloudflare caps 50 subrequests/request):
```bash
curl -s "https://omni-proxy.omni-jackbhai.workers.dev/song-health?offset=0&n=16"
```

---

## Start here

Read this file, tell me in one or two lines what you understood and what
you're starting on, then start. Don't summarise it back to me — I wrote it.

---

## Travel layer: map, get-off alerts, journey clock (shipped in code, **not yet on Pages**)

Everything below is committed on `main` in this repo and every gate is green —
but the live site at `jackbhai.github.io/omnitools/` still serves the pre-map
build (`index-DtDIxHKb.js`; `assets/trip-map-*.js` returns 404 there). That is
the whole reason the map is "not visible" on the phone: it is not deployed.

| what | where |
|---|---|
| OSM map behind a `Map · N points` button, 4 key-free tile sources, SVG `Sketch` offline fallback | `src/tools/trip-map.jsx`, `src/tools/trip-ui.jsx` |
| trip model + turn-by-turn + get-off states (`no-signal → to-stop → at-board → riding → alight → done`) | `src/core/trip.js`, `src/core/trip-state.js` |
| real notifications (service-worker channel, page-level fallback) | `src/core/alerts.js`, `public/sw.js` |
| leave-at / arrive-by clock + timeline bar | `src/core/journey-clock.js`, wired in `src/tools/multimodal.jsx` |
| six synthesised sounds (a train passing on search, bells on alerts) | `src/core/sfx.js`, wired in the three planners + `core/trip-state.js` |

| gate | result |
|---|---|
| `npm run verify` | data PASS 24 · bus 78/0 · metro 69/0 · trip 131/0 · render 20 ✓ |
| `python3 tests/qa_transit.py http://localhost:4173/` | 109 passed · 0 failed |
| `npx vite build`, `debrand.py --check`, `deemoji.py` | clean |

**To deploy (needs a GitHub token this sandbox does not have — verified four times, `$GH` is unset and there is no credential file):**

```bash
cd omnitools
git push "https://jackbhai:${GH}@github.com/jackbhai/omnitools.git" main
# ~90 s later: gh api repos/jackbhai/omnitools/actions/runs?per_page=1 → conclusion == success
# then confirm the shipped chunk actually exists:
curl -sI https://jackbhai.github.io/omnitools/assets/$(curl -s https://jackbhai.github.io/omnitools/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1) | head -1
```

Do not "fix" the missing map by rewriting the panel — rebuild and push, then re-measure the 404 above.
