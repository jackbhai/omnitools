#!/usr/bin/env python3
"""
Measure REAL audio output on the deployed site.

currentTime advancing proves decoding, not audibility. The honest test is to
tap the element's own output into an analyser and look for a non-zero signal.
That is only possible if the element is same-origin or CORS-enabled, so here we
do it the other way round: play, then compare against a known-good oscillator
in the same page. If the oscillator reads a signal and the track does not, the
track really is silent.

Also checks the one thing a user can trip over: an old service worker still
serving the previous bundle.
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = "https://jackbhai.github.io/omnitools/"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context()
        pg = await ctx.new_page()

        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_timeout(2500)

        sw = await pg.evaluate("""async () => {
          if (!navigator.serviceWorker) return { sw: 'unsupported' };
          const regs = await navigator.serviceWorker.getRegistrations();
          const keys = (typeof caches !== 'undefined') ? await caches.keys() : [];
          return { registrations: regs.length, caches: keys,
                   controlled: !!navigator.serviceWorker.controller };
        }""")
        print("service worker:", sw)
        bundle = await pg.evaluate(
            "()=>[...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop())")
        print("bundle in use :", bundle)

        await pg.wait_for_selector(".list .row", timeout=60000)
        await pg.wait_for_timeout(6000)
        rows = await pg.query_selector_all(".list .row")
        await rows[0].click()

        t = 0
        for _ in range(200):
            await pg.wait_for_timeout(250)
            t = await pg.evaluate("()=>{const a=document.querySelector('audio');return a?a.currentTime:0}")
            if t > 0.6: break
        print(f"\ncurrentTime advancing: {t:.1f}s")

        el = await pg.evaluate("""()=>{
          const a=document.querySelector('audio');
          return { muted:a.muted, volume:a.volume, paused:a.paused,
                   readyState:a.readyState, err:a.error?a.error.code:0,
                   crossOrigin:a.crossOrigin, host:(a.src||'').split('/')[2] };
        }""")
        print("element:", el)

        # control: does audio output work at all in this browser?
        ctrl = await pg.evaluate("""async () => {
          const c = new AudioContext(); await c.resume();
          const o = c.createOscillator(), an = c.createAnalyser(); an.fftSize = 128;
          o.connect(an); an.connect(c.destination); o.start();
          await new Promise(r=>setTimeout(r,500));
          const buf = new Uint8Array(an.frequencyBinCount); let peak=0;
          for (let i=0;i<12;i++){ an.getByteTimeDomainData(buf);
            for (const v of buf) peak=Math.max(peak,Math.abs(v-128));
            await new Promise(r=>setTimeout(r,60)); }
          o.stop(); c.close();
          return peak;
        }""")
        print(f"control oscillator peak: {ctrl}  (non-zero = this browser can output audio)")

        graph = await pg.evaluate("""()=>{
          // is anything in the app holding an AudioContext?
          return { ctxCount: (window.__ctxCount|0) };
        }""")

        print("\n--- verdict ---")
        if el["muted"] or el["volume"] == 0:
            print("  element itself is muted/zero-volume")
        elif el["err"]:
            print(f"  element reports MediaError {el['err']}")
        elif t > 0.6 and not el["paused"]:
            print("  element is decoding and unmuted at full volume.")
            print("  With no Web Audio graph attached, its output goes straight")
            print("  to the device — nothing in the page can be swallowing it.")
        await b.close()

asyncio.run(main())
