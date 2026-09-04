# OmniTools

A phone-first web app that packs ~90 small tools into one static page:
a music player, a travel planner (Delhi bus + metro + trains), live TV and
radio, weather, news, a medicine lookup, converters, generators, some
learning tools. No login, no ads, no tracking, nothing to configure.

Live: https://jackbhai.github.io/omnitools/

It is fully static. Most panels fetch public, key-free sources from the
browser; where a source blocks cross-origin reads, a small Cloudflare
Worker acts as a plain relay (`worker/omni-proxy.js`). There is no backend
of our own holding data about anyone.

## What's inside

- Music: multi-source resolver (the goal is ad-free audio that keeps
  working when a source dies; every tier was tested by killing the tier
  above it). Queue, sleep timer, equalizer, synced lyrics when available.
- Travel: Delhi bus + metro data ships inside the bundle as a snapshot of
  the published government transit pages. Trip planning is turn-by-turn,
  rides fold out their intermediate stops, walking legs are measured on
  the actual footpath graph rather than straight lines. Refreshing the
  snapshot is a two-command pipeline, see TRANSIT-DATA.md.
- Offline: a service worker keeps the shell and the last-used data around.
  When a new build lands you get a small "reload?" prompt instead of the
  page changing under you.

## Stack

React 18 + Vite (rolldown). Plain CSS, no component library, no state
library. Map tiles from an OpenStreetMap tile server, drawn only inside
lazy chunks so the main bundle stays small. hls.js is loaded on demand.
Data corpora (medicines, names) are sharded under `public/` and fetched
per shard when first needed, never precached.

## Running it

```
npm install
npm run dev                 # dev server
npm run build               # -> dist/
npm run verify              # data + trip gates, no browser needed
python3 tests/qa_new.py     # app-wide browser suite (expects :5190)
python3 tests/qa_transit.py http://localhost:4173/   # transit suite
```

## Deploy

Push to `main`. GitHub Actions builds and publishes to Pages in about 90
seconds. The Worker is deployed with curl (see `worker/`), only when its
endpoints change.

## Credits

Map data and imagery © OpenStreetMap contributors (ODbL). Transit data
comes from public government transit portals and is checked for drift by
the verify scripts. Lyrics come from community lyrics databases.
