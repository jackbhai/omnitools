#!/usr/bin/env python3
"""
Play tracks the way a person does and report the truth about each one.

Judged only by whether audio actually advances. The silent gesture-unlock clip
reports MediaError 4 and the UI shows transient text mid-resolve; neither means
the track failed.
"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get("QA_BASE", "https://jackbhai.github.io/omnitools/")
N = int(os.environ.get("QA_N", "8"))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page()
        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_selector(".list .row", timeout=90000)
        await pg.wait_for_timeout(7000)

        titles = await pg.evaluate(
            "()=>[...document.querySelectorAll('.list .row .main b')].map(e=>e.textContent)")
        ok = fail = 0
        times = []
        for i in range(min(N, len(titles))):
            rows = await pg.query_selector_all(".list .row")
            t0 = time.time()
            await rows[i].click()
            res = None
            for _ in range(220):                       # up to 55 s
                await pg.wait_for_timeout(250)
                st = await pg.evaluate("""()=>{const a=document.querySelector('audio');
                  return {t:a.currentTime, e:a.error?a.error.code:0,
                          d:(a.src||'').startsWith('data:'),
                          m:[...document.querySelectorAll('.mini-txt span')]
                              .map(x=>x.textContent).join('')}}""")
                if st["t"] > 0.4: res = "PLAYS"; break
                if st["e"] and not st["d"]: res = f"ERR{st['e']}"; break
                if "tap retry" in st["m"] or "Could not get" in st["m"]:
                    res = "GAVEUP"; break
            dt = time.time() - t0
            if res == "PLAYS":
                ok += 1; times.append(dt)
            else:
                fail += 1
            print(f"  {i+1}. {res or 'TIMEOUT':<8}{dt:>6.1f}s  {titles[i][:40]}")
            await pg.wait_for_timeout(4000)      # listen a moment, like a person

        avg = sum(times) / len(times) if times else 0
        print(f"\n  played {ok}/{ok+fail}   average start {avg:.1f}s")
        await b.close()
    return 0 if fail == 0 else 1

sys.exit(asyncio.run(main()))
