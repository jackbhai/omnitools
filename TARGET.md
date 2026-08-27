# 🎯 TARGET — must all be GREEN before we stop

Loop: **add → fix → test → repeat**. A row may only be ticked when the automated
test proves it on the LIVE site (`jackbhai.github.io/omnitools/`), not locally.

## P0 — blockers (site looks "not updated" to the user)
| # | Requirement | Test | Status |
|---|---|---|---|
| 1 | Returning visitor gets the NEW build (no stale service-worker cache) | SW test: 2nd visit bundle == latest hash | ⬜ |
| 2 | Version badge visible so we can confirm what is deployed | `#home` shows build id | ⬜ |

## P1 — music (user's main complaint)
| # | Requirement | Test | Status |
|---|---|---|---|
| 3 | Search "ishq murshid" returns results | ≥5 rows | ⬜ |
| 4 | Search "touchwood babbu maan" returns results | ≥5 rows | ⬜ |
| 5 | Search "cheema y" returns results | ≥5 rows | ⬜ |
| 6 | Tapping a song ACTUALLY plays it | iframe present + time advances | ⬜ |
| 7 | Mini player appears at bottom after play | `.mini` exists | ⬜ |
| 8 | Mini player expands to full screen | `.full` exists | ⬜ |
| 9 | Full player: shuffle/repeat/next/prev/seek | controls present | ⬜ |
| 10 | Lyrics tab loads or says "not found" (never blank) | text present | ⬜ |
| 11 | Equalizer tab: 10 bands + presets | 10 sliders | ⬜ |
| 12 | Queue tab lists the searched songs | ≥1 row | ⬜ |

## P2 — Everyday tools (explicitly demanded)
| # | Requirement | Test | Status |
|---|---|---|---|
| 13 | Everyday hub listing every working tool | page renders | ⬜ |
| 14 | Only endpoints that PASS a live probe are shown | no dead tiles | ⬜ |
| 15 | Downloader (alldl) returns audio+thumb+video | 3 sections | ⬜ |
| 16 | Movie search (msearch) returns results | ≥3 rows | ⬜ |
| 17 | Medicine search (search) returns results | ≥1 row | ⬜ |
| 18 | Courses / n8n / manga where live | rows or honest message | ⬜ |

## P3 — data tools must show REAL data
| # | Requirement | Test | Status |
|---|---|---|---|
| 19 | Trains NDLS→ASR lists real trains | ≥10 rows | ⬜ |
| 20 | Metro lines show real DMRC lines w/ terminals | ≥5 rows | ⬜ |
| 21 | Bus routes near user | ≥10 rows | ⬜ |
| 22 | Nearby ATM/hospital resolves (no infinite spinner) | rows, no `.spin` | ⬜ |
| 23 | Mandi prices render (or honest empty state) | no `.err` | ⬜ |
| 24 | Weather + AQI auto-located | temp visible | ⬜ |

## P4 — whole-app health
| # | Requirement | Test | Status |
|---|---|---|---|
| 25 | Every tool page renders without JS error | 0 pageerrors | ⬜ |
| 26 | No low-contrast/invisible text | contrast audit = 0 | ⬜ |
| 27 | No tool stuck on a spinner after 10s | 0 stuck | ⬜ |
