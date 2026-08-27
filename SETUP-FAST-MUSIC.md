# Music ko permanently fast banao — 5 minute, free

## Problem kya hai

Gaana chalane ke liye app ko ek **relay** (CORS proxy) se guzarna padta hai,
kyunki jis API se ad-free audio milta hai wo browser ko seedha allow nahi karti.

Aaj maine 25 public relays test kiye:

| Relay | Result |
|---|---|
| corsproxy.io | **401 permanently** — free tier khatam |
| cors.lol, cors.eu.org, test.workers, everyorigin | **429** rate limited |
| isomorphic-git, corsfix, cors-anywhere | **403** |
| allorigins, codetabs | **408 / 522** timeout |
| **cors.sh** | kaam karta hai, par **7–19 sekund** aur throttle ho jata hai |

Aur upstream API khud sirf **5.7 sekund** leta hai. Matlab **delay relay ka hai,
code ka nahi.** Isi wajah se gaana kabhi 3s me chalta hai, kabhi 25s me.

Ye code se theek nahi ho sakta — kisi aur ke rate limit ko main bypass nahi kar
sakta. Iska ek hi pakka hal hai: **apna relay**.

---

## Hal — apna Cloudflare Worker (free)

Cloudflare free plan: **100,000 request/din**. App itna use kar hi nahi sakta.
Credit card nahi chahiye. Speed ~200–500ms (7–19s ki jagah).

### Steps

1. **https://dash.cloudflare.com** kholo, sign in karo (free account bana lo)

2. Left menu → **Workers & Pages** → **Create** → **Workers** → **Create Worker**

3. Naam kuch bhi do (jaise `omni-proxy`) → **Deploy** dabao

4. **Edit code** pe click karo. Jo bhi likha hai **sab delete** karo.

5. Is repo se **`worker/omni-proxy.js`** file ka **pura content** copy karke
   paste karo → **Deploy**

6. Upar jo address dikhega usko copy karo, jaise:
   ```
   https://omni-proxy.tumhara-naam.workers.dev
   ```

7. OmniTools kholo → **Music** → **Library** tab → **Speed** →
   address paste karo → **Test & save**

   Green message aayega: *"Working — answered in 240 ms. Saved and in use."*

Bas. Ab har gaana isi se chalega.

---

## Iske baad kya hoga

| | Pehle (public relay) | Worker ke baad |
|---|---|---|
| Gaana start | 3–25 sekund | **under 1 sekund** |
| Reliability | kabhi-kabhi fail | hamesha |
| Rate limit | haan | nahi (100k/din) |
| Kharcha | free | free |

App **pehle tumhara Worker** try karega. Agar wo kabhi na chale, to public
relays fallback me rahenge — kuch tootega nahi.

---

## Safety

Worker me ek **host allow-list** hai — sirf in hosts ko fetch kar sakta hai:

```
ahm7xmakki.com · api.piped.private.coffee · c.ymcdn.org · itunes.apple.com
+ Piped ke backup mirrors
```

Matlab koi aur isko apne traffic ke liye use nahi kar sakta. Worker kuch
**store nahi karta**, sirf request aage bhejta hai. Koi cookie, koi log nahi.

---

## Agar kaam na kare

- **"Proxy answered HTTP 403"** → address me typo hai, ya Worker deploy nahi hua.
  Cloudflare pe Worker kholke check karo ki code paste hua hai aur Deploy dabaya.
- **"Timed out"** → Worker abhi propagate ho raha hai, 1 minute baad phir try karo.
- **"Unexpected response"** → puri file paste nahi hui. `worker/omni-proxy.js`
  ka pura content chahiye, pehli line se aakhri tak.

Hatana ho to Speed screen pe **Remove** dabao — app wapas public relays use
karne lagega.
