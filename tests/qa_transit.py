#!/usr/bin/env python3
"""
Browser checks for the Delhi travel tools — everything that reads
src/data/bus-delhi.json / metro-delhi.json.

scripts/ssr-smoke.jsx already proves the modules wire up and print real
numbers. This proves what only a browser can: that the lazy boundary in
App.jsx actually loads the transit chunk, that a tab click mounts its panel,
that typing in a search box produces a pickable suggestion, that a chosen
journey shows a fare AND a timetable line, and that nothing throws.

The bus stop pair is read out of the shipped data (two stops that sit on the
same published route) so the test never depends on a guess about which stops
are connected.

    python3 tests/qa_transit.py [base-url]          # default http://localhost:4173/

Aim it at `vite preview` (a production build), not `npm run dev`: the dev
server's HMR websocket is configured for the sandbox proxy on 443, and on
plain localhost Vite raises its error overlay, which then swallows every click.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
DATA = os.path.join(os.path.dirname(__file__), "..", "src", "data", "bus-delhi.json")
OUT = []


def check(name, ok, detail=""):
    OUT.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


def fixture_pair():
    """A long published route that also has a timetable AND a return direction,
    with two of its stops. Everything the right-now panel needs to show exists."""
    d = json.load(open(DATA, encoding="utf-8"))
    cand = [r for r in d["routes"] if r.get("rv") is not None and r.get("tt", {}).get("d")
            and not r.get("src") and len(r["s"]) > 30]
    best = max(cand, key=lambda r: len(r["s"]))
    nm = [d["stops"][i]["n"] for i in best["s"]]
    return best["r"], nm[0], nm[min(3, len(nm) - 1)]


def home(page):
    page.goto(BASE, wait_until="load", timeout=45000)
    page.wait_for_timeout(1500)


def open_tile(page, label):
    page.locator(f".tile:has-text('{label}')").first.click(timeout=8000)
    page.wait_for_timeout(1300)


def tab(page, name):
    page.locator(f".tabs button:has-text('{name}')").first.click(timeout=8000)
    page.wait_for_timeout(1300)


def pick_suggestion(page, box, query, want, timeout=8000):
    """Type in a search field and click the suggestion whose text contains `want`."""
    inp = page.locator(box).first
    inp.click(timeout=timeout)
    inp.fill("")
    inp.type(query, delay=10)
    page.wait_for_timeout(700)
    opt = page.locator(f"button:has-text('{want}')").first
    if opt.count() == 0:
        return False, ""
    label = opt.inner_text(timeout=timeout).replace("\n", " ")[:70]
    opt.click(timeout=timeout)
    page.wait_for_timeout(800)
    return True, label


def main():
    errs, page_errs = [], []
    route, stop_a, stop_b = fixture_pair()
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        page = b.new_page(viewport={"width": 420, "height": 900})
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errs.append(str(e)))
        home(page)

        print("=== 1. shell paints through the lazy boundary ===")
        check("home grid renders tiles", page.locator(".tile").count() > 40, f"{page.locator('.tile').count()} tiles")
        body = page.locator("body").inner_text()
        check("bus tile advertises the real count", "2,564" in body, "tile subtitle")
        check("metro tile advertises the real count", "287" in body)
        check("no page errors on first paint", not page_errs, "; ".join(page_errs[:2]))

        print("\n=== 2. bus / right-now panel ===")
        open_tile(page, "Bus")
        tab(page, "Right now")
        t = page.locator("body").inner_text()
        check("panel mounted", "RIGHT NOW" in t.upper())
        check("device clock printed", "IST" in t, [l for l in t.split("\n") if "IST" in l][:1])
        ok, label = pick_suggestion(page, "input", route, route)
        check(f"route {route} offered", ok, label)
        t = page.locator("body").inner_text()
        up = t.upper()
        check("first and last bus shown", "FIRST BUS" in up and "LAST BUS" in up)
        check("headway or trips shown", "HEADWAY" in up or "TRIPS A DAY" in up)
        check("next departure block present", "NEXT FROM THE TERMINAL" in up)
        check("running or not-running stated", any(k in up for k in
              ["RUNNING NOW", "LEAVING SHORTLY", "CLOSED NOW", "NOT STARTED", "LAST TRIP"]))
        page.locator("button:has-text('Every stop')").first.click(timeout=8000)
        page.wait_for_timeout(900)
        rows = page.locator(".list .row").count()
        check("stop list expanded to many rows", rows > 25, f"{rows} rows")
        rb = page.locator(".tabs ~ * button:has-text('Return'), button:has-text('Return')")
        check("return direction offered for this route", rb.count() > 0)
        if rb.count():
            rb.first.click(timeout=8000)
            page.wait_for_timeout(900)
            check("direction flip re-renders a card", "FIRST BUS" in page.locator("body").inner_text().upper())

        print("\n=== 3. bus / planner: fare and the next bus at your stop ===")
        home(page)
        open_tile(page, "Bus")
        tab(page, "Plan trip")
        ok1, l1 = pick_suggestion(page, "input >> nth=0", stop_a[:18], stop_a[:18])
        ok2, l2 = pick_suggestion(page, "input >> nth=1", stop_b[:18], stop_b[:18])
        check(f"both stops picked ({route})", ok1 and ok2, f"{l1} | {l2}")
        t = page.locator("body").inner_text()
        up = t.upper()
        check("a fare is quoted", "₹" in t)
        check("minutes / stops / changes stats", "MINUTES" in up and "STOPS" in up and "CHANGES" in up)
        check("next-bus-at-your-stop row rendered", "NEXT AT" in up,
              [x for x in t.split("\n") if "NEXT AT" in x.upper()][:1])
        check("women-free note kept", "free" in t.lower())
        check("distance honesty line", "drives" in t.lower() or "road" in t.lower())

        print("\n=== 4. metro / right-now: status, last train, buses, fares ===")
        home(page)
        open_tile(page, "Metro")
        tab(page, "Right now")
        t = page.locator("body").inner_text()
        up = t.upper()
        check("network header with the clock", "THE NETWORK AT" in up)
        check("several corridors listed", sum(k in t for k in ["Red", "Yellow", "Blue", "Pink", "Magenta"]) >= 5)
        check("last-train panel present", "LAST TRAIN" in up)
        check("buses at the station joined", "BUSES AT" in up, [x for x in t.split("\n") if "BUSES AT" in x.upper()][:1])
        check("fare slabs shown", "SLABS" in up or "SUNDAY" in up)
        check("separate-ticketing note present", "SEPARATE TICKETING" in up)
        page.locator("button:has-text('Airport')").first.click(timeout=8000)
        page.wait_for_timeout(1000)
        t2 = page.locator("body").inner_text().upper()
        check("another corridor re-renders without error", "RUNNING" in t2 or "CLOSED" in t2)

        print("\n=== 5. metro planner + combined journey ===")
        home(page)
        open_tile(page, "Metro")
        tab(page, "Plan route")
        t = page.locator("body").inner_text()
        up = t.upper()
        check("default journey priced", "₹" in t)
        check("right-now band on the journey", "RIGHT NOW" in up)
        check("last-train line on the journey", "LAST TRAIN" in up)
        check("bus board under the journey", "BUSES AT" in up)
        check("every-station toggle exists", "ALL" in up and "STATIONS" in up)
        page.locator("button:has-text('Show all')").first.click(timeout=8000)
        page.wait_for_timeout(900)
        check("station list expands", page.locator(".list .row").count() > 8,
              f"{page.locator('.list .row').count()} rows")

        home(page)
        open_tile(page, "Plan Journey")
        ok1, l1 = pick_suggestion(page, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        ok2, l2 = pick_suggestion(page, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        check("combined planner picked both ends", ok1 and ok2, f"{l1} | {l2}")
        t = page.locator("body").inner_text()
        check("combined options appear", "METRO" in t.upper() and "₹" in t, t[:70].replace("\n", " / "))
        check("per-option timing note", "RIGHT NOW" in t.upper() or "every" in t.lower(),
              [x for x in t.split("\n") if "every" in x.lower()][:1])

        print("\n=== 6. console hygiene ===")
        quiet = ("favicon", "geolocation", "net::ERR", "Failed to load resource",
                 "Permission", "WebSocket", "vite")
        noise = [e for e in errs if not any(k in e for k in quiet)]
        check("no console errors from app code", not noise, "; ".join(noise[:3]))
        check("no uncaught exceptions", not page_errs, "; ".join(page_errs[:3]))
        b.close()

    bad = [n for n, ok, _ in OUT if not ok]
    print("\n" + "=" * 52)
    print(f"{len(OUT) - len(bad)} passed · {len(bad)} failed" + (f"  ← {', '.join(bad)}" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
