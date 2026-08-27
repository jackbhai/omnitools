# ⚡ OmniTools

**47 tools in one mobile web app. No login, no signup, no API keys.**

🔗 **Live:** https://jackbhai.github.io/omnitools/

---

## Design

| Element | Value |
|---|---|
| Display font | `Bangers` |
| Body font | `DM Sans` |
| Mono font | `DM Mono` |
| Background | `#000000` (true AMOLED — saves battery) |
| Primary | `#00FF9C` light green |
| Secondary | `#00E5FF` cyan |

Glassmorphism cards, neon glow, gradient text, safe-area support for notched phones.

---

## "Koi feature band na ho" — how it's engineered

### 1. Most tools need no network at all
**25 of 47 tools** are pure browser computation — calculators, converters,
generators, encoders, text utilities. They have **100% uptime by construction**.
They work on a plane, in a tunnel, with Wi-Fi off.

### 2. Live tools use provider POOLS, not single APIs

```
Tool → Pool (2–3 independent APIs) → Router
                                      ├─ round-robin  (spreads load, avoids quotas)
                                      ├─ health score (failures demote a provider)
                                      ├─ circuit breaker (dead API skipped 60s)
                                      ├─ 2-layer cache (memory + localStorage)
                                      └─ stale-while-offline (old data > error)
```

Every result shows **which source answered**, and a `failover ×N` tag when a
backup had to step in.

| Capability | Providers |
|---|---|
| Weather | Open-Meteo → MET Norway → wttr.in |
| Geocoding | Open-Meteo Geo → Nominatim → Photon |
| Air quality | Open-Meteo AQ → WAQI |
| Currency | Frankfurter (ECB) → open.er-api → jsDelivr currency-api |
| Crypto | CoinLore → CoinCap |
| PIN code | India Post → Zippopotam |
| Dictionary | Free Dictionary → Wiktionary |
| Wikipedia | Wikimedia REST → MediaWiki Action |
| News | HN Algolia → Lobste.rs |
| GitHub | GitHub REST → Codeberg |
| Books | Open Library → Gutendex |
| Movies/TV | Film index → TVmaze |
| Festivals | **Built-in table** → Google ICS → Nager.Date |
| Music | Audius · Archive.org · Radio Browser (DE→NL) · iTunes |
| ISS | WhereTheISS.at → Open Notify |

### 3. Festivals ships its own data
Every free holiday API we tested fails for India — Nager.Date returns **HTTP 204**
for `IN`, HolidayAPI returns **401**, and the public CORS proxies measured
**408 / 401 / 522**. So the Indian & Pakistani calendars (2025–2027) are **built
into the bundle**: instant, offline, and impossible to break.

---

## 🎵 Music

Only **legal, CORS-clean** sources. The ⬇ button appears *only* where the
licence actually permits download.

| Source | Content | Download? |
|---|---|---|
| **Radio Browser** | 71 Punjabi · 444 Hindi · 63 Urdu · 500 India · 70 Pakistan stations | ▶ play only |
| **Audius** | ~100 punjabi / ~100 bollywood / 65 pakistani full tracks | ⬇ when artist allows |
| **Archive.org** | 7,398 punjabi · 2,894 bollywood · 1,696 hindi items | ⬇ **yes** (MP3/FLAC) |
| **iTunes** | Full Indian catalogue metadata | ▶ 30s preview only |

> JioSaavn/Gaana unofficial APIs were **tested and rejected** — all 8 mirrors are
> dead (402 / 404 / DNS failure), none send CORS headers, and serving copyrighted
> audio would risk a DMCA takedown of the whole repo.

### Player features
10-band equalizer · 7 presets (incl. **Punjabi Beat**, Bass Boost) · bass &
treble shelves · loudness compressor · live spectrum visualizer · playback speed
with pitch preservation · **background play** (MediaSession lock-screen controls)
· **offline caching** to IndexedDB.

---

## Tools

**India (8)** Weather+AQI · Festivals · PIN Code · IFSC · GST · Income Tax · EMI · SIP
**Time (4)** World Clock · On This Day · Age · Timestamp
**Money (3)** Currency · Crypto · Percentage
**Music (1)** Full player
**Learn (5)** Wikipedia · Dictionary · Books · Countries · Name Guess
**Media (4)** Tech News · Movies & TV · Jokes · Quotes
**Space (2)** ISS Tracker · Earthquakes
**Text (4)** Case Convert · Word Count · Line Tools · Lorem
**Dev (8)** Base64 · URL · JSON/YAML · JWT · Regex · Hash · GitHub · My IP
**Generate (4)** Password · UUID · QR · Dice
**Convert (4)** Units · Temperature · Colour+WCAG · BMI

---

## Stack

React 18 · Vite · vanilla CSS · PWA (service worker + manifest) ·
GitHub Actions → GitHub Pages. **88 KB gzipped.**

```bash
npm install
npm run dev      # localhost:3000
npm run build
```

---

## Honest limitations

1. **AhaConvert-style file conversion is not included.** Image/PDF/video
   conversion needs `ffmpeg.wasm` (~25 MB) and `pdf-lib`. That's a deliberate
   next phase, not a claim being made today.
2. **CORS-less APIs** (RestCountries, CoinCap, wttr.in) route through public
   proxies which are unreliable. Each has a CORS-clean primary, so the tool
   still works — the proxy is only the backup.
3. **WAQI uses the shared `demo` token**, rate-limited by design.
4. **Lunar festival dates** (Diwali, Eid) are the officially published dates;
   regional observance can differ by a day.
5. **No login** means no cross-device sync — favourites live in `localStorage`.
