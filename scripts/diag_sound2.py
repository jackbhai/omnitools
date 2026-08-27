#!/usr/bin/env python3
"""
Reproduce the silence by forcing the graph to attach, the way a real device does.

On a phone the AudioContext starts SUSPENDED. `chain.attach(el)` re-routes the
element's entire output through that context, so the moment it attaches the
element stops feeding the speakers directly. If the context never actually
resumes, the track plays — currentTime advances, the UI looks healthy — with no
sound at all. `chain.resume()` returns a promise that is never awaited or
checked, so a failed resume is invisible.

This attaches the graph explicitly and then measures the analyser, which is the
only honest read of whether audio is flowing.
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:5184/"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page()
        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_selector(".list .row", timeout=60000)
        await pg.wait_for_timeout(6000)

        rows = await pg.query_selector_all(".list .row")
        await rows[0].click()
        for _ in range(160):
            await pg.wait_for_timeout(250)
            t = await pg.evaluate("()=>{const a=document.querySelector('audio');return a?a.currentTime:0}")
            if t > 0.5: break
        print(f"playing, currentTime={t:.1f}s")

        # 1. attach the graph the way the app does
        r1 = await pg.evaluate("""async () => {
          const m = await import('/src/core/player.jsx');
          const el = document.querySelector('audio');
          m.chain.attach(el);
          return { attached: !!m.chain.ready, state: m.chain.ctx?.state };
        }""")
        print(f"after attach: {r1}")

        # 2. force the context to suspend — this is a phone's default state
        r2 = await pg.evaluate("""async () => {
          const m = await import('/src/core/player.jsx');
          if (!m.chain.ctx) return { skip: 'no context' };
          await m.chain.ctx.suspend();
          const el = document.querySelector('audio');
          const before = el.currentTime;
          await new Promise(r => setTimeout(r, 1500));
          const buf = new Uint8Array(m.chain.an.frequencyBinCount);
          let peak = 0;
          for (let i = 0; i < 10; i++) {
            m.chain.an.getByteTimeDomainData(buf);
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
            await new Promise(r => setTimeout(r, 60));
          }
          return {
            ctxState: m.chain.ctx.state,
            elementPaused: el.paused,
            timeAdvanced: +(el.currentTime - before).toFixed(2),
            analyserPeak: peak,
          };
        }""")
        print(f"\nwith the context SUSPENDED (a phone's default):")
        for k, v in r2.items(): print(f"   {k:<16} {v}")
        if r2.get("timeAdvanced", 0) > 0 and r2.get("analyserPeak") == 0:
            print("   >>> REPRODUCED: track advances, output is silent")
        elif r2.get("elementPaused"):
            print("   >>> element paused itself instead")

        # 3. resume and confirm sound comes back
        r3 = await pg.evaluate("""async () => {
          const m = await import('/src/core/player.jsx');
          await m.chain.ctx.resume();
          await new Promise(r => setTimeout(r, 800));
          const buf = new Uint8Array(m.chain.an.frequencyBinCount);
          let peak = 0;
          for (let i = 0; i < 12; i++) {
            m.chain.an.getByteTimeDomainData(buf);
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
            await new Promise(r => setTimeout(r, 60));
          }
          return { ctxState: m.chain.ctx.state, analyserPeak: peak };
        }""")
        print(f"\nafter resume: {r3}")
        if r3.get("analyserPeak", 0) > 0:
            print("   >>> sound returns once the context is running")

        await b.close()

asyncio.run(main())
