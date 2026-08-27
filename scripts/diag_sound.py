#!/usr/bin/env python3
"""
"Songs chal rahe hain but sound nahi aa rahi" — find out why.

currentTime advancing means the element is DECODING. It does not mean anything
reaches the speakers. The prime suspect is the Web Audio graph: attaching an
element to createMediaElementSource() re-routes ALL of its output into that
graph. If the AudioContext is suspended, or the graph is attached to a
different element than the one playing, the element goes silent while still
reporting progress — exactly the symptom described.

This measures real output, not just currentTime.
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:5184/"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=[
            "--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page()
        logs = []
        pg.on("console", lambda m: logs.append(m.text[:130]))
        pg.on("pageerror", lambda e: logs.append("ERR " + str(e)[:130]))

        await pg.goto(BASE + "#music", wait_until="domcontentloaded")
        await pg.wait_for_selector(".list .row", timeout=60000)
        await pg.wait_for_timeout(6000)

        rows = await pg.query_selector_all(".list .row")
        await rows[0].click()

        # wait for the element to report progress
        for _ in range(160):
            await pg.wait_for_timeout(250)
            t = await pg.evaluate("()=>{const a=document.querySelector('audio');return a?a.currentTime:0}")
            if t > 0.5:
                break
        print(f"currentTime advancing: {t:.1f}s")

        state = await pg.evaluate("""() => {
          const a = document.querySelector('audio');
          return {
            currentTime: +a.currentTime.toFixed(2),
            paused: a.paused, muted: a.muted, volume: a.volume,
            readyState: a.readyState, networkState: a.networkState,
            error: a.error ? a.error.code : 0,
            duration: a.duration,
            buffered: a.buffered.length ? +a.buffered.end(0).toFixed(1) : 0,
            srcHost: (a.src || '').split('/')[2] || '',
          };
        }""")
        print("\n--- <audio> element ---")
        for k, v in state.items():
            print(f"  {k:<14} {v}")

        # The decisive test: is the Web Audio graph swallowing the output?
        graph = await pg.evaluate("""async () => {
          const m = await import('/src/core/player.jsx');
          const c = m.chain;
          const out = {
            attached: !!c.ready,
            ctxState: c.ctx ? c.ctx.state : 'no-context',
            sampleRate: c.ctx ? c.ctx.sampleRate : 0,
            hasAnalyser: !!c.an,
          };
          // Read the analyser: if audio is really flowing, this is not silent.
          if (c.an) {
            const buf = new Uint8Array(c.an.frequencyBinCount);
            let peak = 0;
            for (let i = 0; i < 12; i++) {
              c.an.getByteTimeDomainData(buf);
              for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
              await new Promise(r => setTimeout(r, 60));
            }
            out.analyserPeak = peak;   // 0 = pure silence
          }
          return out;
        }""")
        print("\n--- Web Audio graph ---")
        for k, v in graph.items():
            print(f"  {k:<14} {v}")

        verdict = []
        if state["muted"]:            verdict.append("element is muted")
        if state["volume"] == 0:      verdict.append("element volume is 0")
        if graph.get("ctxState") == "suspended":
            verdict.append("AudioContext SUSPENDED -> graph swallows all output")
        if graph.get("attached") and graph.get("analyserPeak", 1) == 0:
            verdict.append("graph attached but analyser reads pure silence")
        if not graph.get("attached") and state["currentTime"] > 0:
            verdict.append("graph not attached (element should be audible directly)")

        print("\n--- VERDICT ---")
        print("  " + ("; ".join(verdict) if verdict else "no obvious cause found"))

        errs = [l for l in logs if "ERR" in l or "fail" in l.lower()]
        if errs:
            print("\n--- console ---")
            for l in errs[:4]:
                print("  " + l)
        await b.close()

asyncio.run(main())
