# OmniTools

**76 tools in one mobile web app. No login, no signup, no API keys, no ads.**

Live: https://jackbhai.github.io/omnitools/

---

## Continuing this project in a new chat

**[`CONTINUE-HERE.md`](CONTINUE-HERE.md)** is the entire handoff in one file —
architecture, every bug already found and fixed, all measurements, credentials,
current state and next steps. Paste it into a new chat and nothing else is
needed.

The Playwright suite is at [`tests/qa_new.py`](tests/qa_new.py) — 170 checks.

---

## Design

| Element | Value |
|---|---|
| Display font | `Bangers` |
| Body font | `DM Sans` |
| Mono font | `DM Mono` |
| Background | `#000000` — true AMOLED, saves battery |
| Primary | `#00FF9C` green |
| Secondary | `#00E5FF` cyan |
| Text | `#E8FFF4` |

**Zero emoji.** 108 hand-written SVG icons, so glyphs inherit the theme colour
and stay crisp at any DPI instead of rendering as a different font on every OS.
Enforced by `scripts/deemoji.py`.

**No vendor names in the UI.** Sources are described by what they are — "second
catalogue", "public archive" — never by who runs them. Enforced by
`scripts/debrand.py --check`.

---

## How this stays working

### Most tools need no network at all
A large share of the 76 are pure browser computation — calculators, converters,
generators, encoders, text utilities. **100% uptime by construction.** They
work on a plane, in a tunnel, with Wi-Fi off.

### The rest have independent fallbacks
Not mirrors of one API. A fallback only counts if it fails for *different
reasons* than the thing it backs up — different company, different CDN,
different infrastructure.

Music has **nine tiers**:

```
A  primary resolver          vendor API
B  16 catalogue mirrors       community forks, CORS-open, raced in waves
B0 Worker song racer          30 catalogues behind one request
C  catalogue direct           the catalogue's own API
J  second catalogue           a DIFFERENT Indian service, own DB and CDN
D  open music network         4 decentralised nodes
E  public archive             a public library
I  community uploads          an upload platform
G  open-licence pool          three commons platforms
H  open catalogue             a CC music label
F  live radio                 explicit offer, never a silent substitution
```

Each was verified by **blocking the tier above it in a real browser** and
confirming the next one answers:

```
primary dead        → catalogue-2        + relay dead        → catalogue-2
+ mirrors dead      → open-network       + open network dead → public-archive
+ archive dead      → community-uploads  + community dead    → open-licence
+ aggregator dead   → open-catalogue     last resort         → live radio
```

### A 200 response is not health
Every health check fetches **real content** — rows, bytes, playable audio — not
a status code.

This is not theoretical. One song mirror shipped here for months answering
every search perfectly while every download link it returned was a 404: ten
songs, five quality rungs each, fifty dead addresses. A status-code check
called it healthy the entire time.

```bash
python3 scripts/healthcheck.py all      # music|radio|tv|news|relay|data|all
```

The script reads its URLs **out of the source files**, so it cannot drift out
of date when a source is added or removed.

### Nothing is faked
No placeholder rows, no demo values, no "coming soon". If a source cannot be
verified, the tool does not ship. When something is genuinely unknown the UI
leaves it out rather than inventing it — a missing album shows nothing, not
"Unknown Album".

---

## What's inside

**Music** — 30 verified sources, ad-free, background playback, equaliser,
sleep timer, real-analyser visualisers.

**Live TV** — 2,420 Indian channels from 9 merged playlists, ranked by
*measured* live rate rather than by popularity. Dead channels are demoted and
labelled, never silently hidden.

**FM** — 5 independent sources with liveness memory.

**News** — 52 country editions, 49 publisher feeds, topic search.

**India** — trains, metro, buses, medicines (253,802), names (5,695). A bus or metro
journey brings its own map behind a button, turn-by-turn steps and a get-off alert that
watches your position against the published stops — free tiles, no key, no ads, and the
alert says in words when it has to fall back to the timetable clock.

**Everyday** — weather, air quality, currency, recipes, converters,
generators, encoders, and around forty more.

---

## Architecture

```
Browser (React + Vite, fully static)
  ├─ direct fetch to ~130 CORS-open upstreams        preferred path
  └─ Cloudflare Worker                                only where CORS blocks
       /            CORS relay, host allow-list
       /song        races 30 song catalogues
       /song-health paged (Cloudflare caps 50 subrequests/request)
       /rss  /search  /topic  /surname  /yt
```

No backend, no database, no server rendering. Deploy is a push to `main`.

---

## Development

```bash
npm install
npx vite --host 0.0.0.0 --port 5190
```

Before committing:

```bash
npm run verify                       # transit data + bus + metro + trip engine + render gates
npx vite build
python3 scripts/debrand.py --check
python3 scripts/deemoji.py
python3 scripts/healthcheck.py all
python3 tests/qa_new.py
```

The bus and metro tiles read from generated JSON — see **TRANSIT-DATA.md** for how to
refresh the scrape and what is measured versus derived.
