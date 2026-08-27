#!/usr/bin/env python3
"""
Why does resolving fail inside the app when the same call works from a shell?

The server-side check resolved both "failing" tracks in 6-9 s, so the upstream
is fine. Something about how the browser makes the call is different. This
watches the actual network traffic the page generates for one of those tracks.
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:5184/"
BAD = "Mere Dil Wich"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page()
        reqs = []
        pg.on("request", lambda r: reqs.append(["REQ", r.url[:120]])
              if ("alldl" in r.url or "workers.dev" in r.url or "cors" in r.url) else None)
        pg.on("response", lambda r: reqs.append(["RES", f"{r.status} {r.url[:110]}"])
              if ("alldl" in r.url or "workers.dev" in r.url or "cors" in r.url) else None)
        pg.on("requestfailed", lambda r: reqs.append(
            ["FAIL", f"{r.url[:100]} :: {r.failure}"])
              if ("alldl" in r.url or "workers.dev" in r.url or "cors" in r.url) else None)
        pg.on("console", lambda m: reqs.append(["LOG", m.text[:120]])
              if m.type == "error" else None)

        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_selector(".list .row", timeout=60000)
        await pg.wait_for_timeout(2000)

        box = await pg.query_selector("input[placeholder*='song']")
        await box.click(); await box.fill(BAD); await box.press("Enter")
        await pg.wait_for_timeout(9000)

        reqs.clear()
        rows = await pg.query_selector_all(".list .row")
        print(f"searching '{BAD}' -> {len(rows)} rows; playing the first")
        await rows[0].click()

        for _ in range(140):
            await pg.wait_for_timeout(250)
            st = await pg.evaluate("""()=>{const a=document.querySelector('audio');
              return {t:a.currentTime, err:a.error?a.error.code:0,
                      msg:[...document.querySelectorAll('.mini-txt span')].map(e=>e.textContent).join('')}}""")
            if st["t"] > 0.4 or st["err"] or "Could not" in st["msg"]:
                break
        print(f"outcome: t={st['t']:.1f} err={st['err']} msg={st['msg'][:60]}\n")

        print("--- network for this play ---")
        for kind, line in reqs[:26]:
            print(f"  {kind:<5}{line}")

        # ask the resolver directly, from inside the page
        print("\n--- resolveAudio() called directly in the page ---")
        r = await pg.evaluate("""async () => {
          const m = await import('/src/core/audio-resolve.js');
          const t0 = Date.now();
          try {
            const rec = await m.resolveAudio('usWp5bIydYU', { fresh: true });
            return { ok: true, ms: Date.now()-t0, audio: (rec.audio||'').slice(0,54) };
          } catch (e) { return { ok: false, ms: Date.now()-t0, err: String(e).slice(0,110) }; }
        }""")
        print("  ", r)
        await b.close()

asyncio.run(main())
