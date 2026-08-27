#!/usr/bin/env python3
"""
"Kuch songs chal hi nahi rahe" — how many, and why?

Plays a run of tracks straight from a search and records the outcome of each,
so the failure rate is a number rather than an impression. Anything that fails
gets its MediaError code and the stage the UI was showing.
"""
import asyncio, time
from playwright.async_api import async_playwright

BASE = "http://localhost:5184/"
N = 8

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page()
        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_selector(".list .row", timeout=60000)
        await pg.wait_for_timeout(7000)

        rows = await pg.query_selector_all(".list .row")
        titles = await pg.evaluate(
            "()=>[...document.querySelectorAll('.list .row .main b')].map(e=>e.textContent)")

        ok = fails = 0
        print(f"{'#':<3}{'result':<9}{'time':>7}  track")
        print("-" * 74)
        for i in range(min(N, len(rows))):
            rows = await pg.query_selector_all(".list .row")
            t0 = time.time()
            await rows[i].click()
            outcome, code, stage = None, 0, ""
            # Judge by audible progress only. The silent unlock clip reports
            # MediaError 4 and the UI shows transient text mid-resolve; neither
            # means the track failed. The resolver legitimately needs 6-13 s.
            for _ in range(200):                       # up to 50 s
                await pg.wait_for_timeout(250)
                st = await pg.evaluate("""()=>{
                  const a=document.querySelector('audio');
                  return { t:a.currentTime, err:a.error?a.error.code:0,
                           isData:(a.src||'').startsWith('data:'),
                           msg:[...document.querySelectorAll('.mini-txt span')]
                                 .map(e=>e.textContent).join('') }; }""")
                if st["t"] > 0.4: outcome = "PLAYS"; break
                if st["err"] and not st["isData"]:
                    outcome, code = "MEDIA-ERR", st["err"]; break
                if "tap retry" in st["msg"] or "Could not get" in st["msg"]:
                    outcome, stage = "GAVE-UP", st["msg"][:32]; break
            dt = time.time() - t0
            if outcome is None: outcome = "TIMEOUT"
            if outcome == "PLAYS": ok += 1
            else: fails += 1
            extra = f" code={code}" if code else (f" {stage}" if stage else "")
            print(f"{i+1:<3}{outcome:<9}{dt:>6.1f}s  {titles[i][:38]}{extra}")
            await pg.wait_for_timeout(1500)

        print("-" * 74)
        print(f"played {ok}/{ok+fails}   failed {fails}")
        await b.close()

asyncio.run(main())
