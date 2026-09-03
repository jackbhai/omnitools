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
import re
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


def fixture_geo():
    """A route number that ships as exactly ONE direction, so clicking its only
    suggestion is unambiguous, plus the coordinates of its first stop and of a
    stop ~9 later.  The trip test drives the browser's geolocation with these,
    which judges the engine against the same records the app is showing.

    Ambiguity matters: most numbers here have a return direction, and picking the
    wrong one puts the fake GPS at the far end of the ride — the app would then
    correctly report you had arrived before you had boarded."""
    import collections
    d = json.load(open(DATA, encoding="utf-8"))
    count = collections.Counter(r["r"] for r in d["routes"])
    cands = [r for r in d["routes"] if count[r["r"]] == 1 and r.get("tt", {}).get("d")
             and len(r["s"]) >= 20 and r["f"] != r["t"] and not r.get("src")]
    best = max(cands, key=lambda r: len(r["s"]))
    stops = d["stops"]
    a = stops[best["s"][0]]
    b = None
    for k in range(min(14, len(best["s"]) - 1), 0, -1):     # the furthest of the first stops
        s = stops[best["s"][k]]
        if abs(s["lat"] - a["lat"]) + abs(s["lon"] - a["lon"]) > 0.006:
            b = s
            break
    return {"route": best["r"], "stops": len(best["s"]),
            "board": (a["n"], a["lat"], a["lon"]),
            "alight": (b["n"], b["lat"], b["lon"])}


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
    geo = fixture_geo()
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        page = b.new_page(viewport={"width": 420, "height": 900})
        # Record every notification the app tries to send, on both channels: the
        # service worker registration (what an installed PWA uses) and the page
        # constructor (the fallback).
        #
        # Headless Chromium has no notification permission at all: Notification
        # .permission reads null and reg.showNotification() throws "No notification
        # permission has been granted for this origin" even after Playwright's
        # grant_permissions(["notifications"]).  The app correctly refuses to use a
        # channel that cannot answer, so to test the path that a user with granted
        # permission gets, the page-level permission is reported as granted here.
        # What is under test is the app's own gate, its call and the channel it
        # then claims in the bar — not Chromium's permission store.
        page.add_init_script("""(() => {
          window.__notes = [];
          try {
            const proto = ServiceWorkerRegistration.prototype;
            const orig = proto.showNotification;
            proto.showNotification = function (title, opt) {
              window.__notes.push({ via: 'sw', title: String(title), body: opt && String(opt.body || '') });
              // never delegate: the real call throws for want of a permission that
              // headless cannot grant, and the app would be right to bail out
              return Promise.resolve();
            };
          } catch {}
          try {
            const Real = window.Notification;
            function Spy(title, opt) {
              window.__notes.push({ via: 'page', title: String(title), body: opt && String(opt.body || '') });
              try { return new Real(title, opt); } catch { return null; }
            }
            Spy.permission = 'granted';
            Spy.requestPermission = () => Promise.resolve('granted');
            Object.defineProperty(window, 'Notification', { value: Spy, writable: true, configurable: true });
          } catch {}
        })()"""
        )
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
        t = page.locator("body").inner_text()
        check("the metro journey carries its own map button", "Map \u00b7" in t)
        check("the metro journey offers a get-off alert", "Get-off alert" in t)
        page.locator("button:has-text('Map \u00b7')").first.click(timeout=8000)
        page.wait_for_timeout(2400)
        drew = page.locator(".leaflet-container").count() > 0 or page.locator(".sketch").count() > 0
        check("metro map mounts with station dots", page.locator(".mapbox").count() > 0 and drew)
        note = page.locator(".mapnote").last.inner_text(timeout=8000)
        check("metro map counts the stations it drew", "points" in note, note[:70])
        check("and offers the same tile switch", page.locator(".mapswap").count() > 0,
              page.locator(".mapswap").first.inner_text())
        page.locator("button:has-text('Turn by turn')").first.click(timeout=8000)
        page.wait_for_timeout(900)
        st = page.locator(".stp").count()
        check("metro turn-by-turn lists board, ride and get-off", st >= 3, f"{st} steps")
        board_line = page.locator(".stp").first.inner_text(timeout=8000).replace("\n", " ")
        check("it names the line and the direction", "Yellow" in board_line or "Board the" in board_line, board_line[:80])

        home(page)
        open_tile(page, "Plan Journey")
        ok1, l1 = pick_suggestion(page, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        ok2, l2 = pick_suggestion(page, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        check("combined planner picked both ends", ok1 and ok2, f"{l1} | {l2}")
        t = page.locator("body").inner_text()
        check("combined options appear", "METRO" in t.upper() and "₹" in t, t[:70].replace("\n", " / "))
        check("per-option timing note", "RIGHT NOW" in t.upper() or "every" in t.lower(),
              [x for x in t.split("\n") if "every" in x.lower()][:1])
        check("the combined journey carries a map button too", "Map \u00b7" in t,
              [x for x in t.split("\n") if "Map" in x][:1])
        check("and a get-off alert for the whole metro+bus ride", "Get-off alert" in t)
        page.locator("button:has-text('Map \u00b7')").first.click(timeout=8000)
        page.wait_for_timeout(2400)
        drew = page.locator(".leaflet-container").count() > 0 or page.locator(".sketch").count() > 0
        check("combined map draws the bus stop and the metro leg together",
              page.locator(".mapbox").count() > 0 and drew,
              page.locator(".mapnote").last.inner_text()[:60] if page.locator(".mapnote").count() else "")

        print("\n=== 6. the map stays behind its own button ===")
        home(page)
        open_tile(page, "Bus")
        tab(page, "Right now")
        pick_suggestion(page, "input", geo["route"], geo["route"])
        check("no map is mounted before it is asked for", page.locator(".mapbox").count() == 0)
        mb = page.locator("button:has-text('Map ·')")
        check("the journey card carries a map button", mb.count() > 0,
              mb.first.inner_text()[:40] if mb.count() else "")
        mb.first.click(timeout=8000)
        page.wait_for_timeout(2600)
        check("pressing it mounts the map", page.locator(".mapbox").count() > 0)
        drew = page.locator(".leaflet-container").count() > 0 or page.locator(".sketch").count() > 0
        check("tiles or the offline sketch drew something", drew,
              "leaflet" if page.locator(".leaflet-container").count() else "sketch")
        note = page.locator(".mapnote").last.inner_text(timeout=8000) if page.locator(".mapnote").count() else ""
        check("the map states how many points it drew", "points" in note, note[:80])
        swap = page.locator(".mapswap").first
        check("it says which free tile server is drawn", swap.count() > 0
              and swap.inner_text().startswith("tiles:"), swap.inner_text() if swap.count() else "")
        before = swap.inner_text() if swap.count() else ""
        if swap.count():
            swap.click(); page.wait_for_timeout(2500)
            after = page.locator(".mapswap").first.inner_text()
            check("pressing it moves to another tile server", after != before, f"{before} -> {after}")
        page.locator("button:has-text('Hide map')").first.click(timeout=8000)
        page.wait_for_timeout(700)
        check("hiding it puts the clean list back", page.locator(".mapbox").count() == 0)
        turn = page.locator("button:has-text('Turn by turn')")
        check("turn-by-turn is also collapsed by default", turn.count() > 0)
        turn.first.click(timeout=8000)
        page.wait_for_timeout(900)
        rows = page.locator(".stp").count()
        check("it lists an action per leg", rows >= 2, f"{rows} steps")
        step_txt = page.locator(".stp").first.inner_text(timeout=8000)
        check("a step names the bus and the stop", geo["route"] in step_txt or "Board" in step_txt,
              step_txt.replace("\n", " ")[:70])

        print("\n=== 7. get-off alert driven by a real position fix ===")
        # a real permission grant, so the notification path is the one a user gets
        page.context.grant_permissions(["geolocation", "notifications"])
        page.context.set_geolocation({"latitude": geo["board"][1], "longitude": geo["board"][2]})
        home(page)
        open_tile(page, "Bus")
        tab(page, "Right now")
        pick_suggestion(page, "input", geo["route"], geo["route"])
        arm = page.locator("button:has-text('Get-off alert')").first
        check("the arm button exists", arm.count() > 0)
        arm.click(timeout=8000)
        page.wait_for_timeout(3000)
        bar = page.locator(".tripbar")
        check("arming puts a bar on the screen", bar.count() > 0)
        txt = bar.inner_text(timeout=8000).replace("\n", " ") if bar.count() else ""
        check("it speaks about the stop you are standing at",
              "boarding" in txt.lower() or geo["board"][0].lower() in txt.lower(), txt[:110])
        # the bar itself stays short; the explanation is one press away
        folded = bar.first.evaluate("el => el.getBoundingClientRect().height")
        check("the folded bar leaves the screen usable", folded <= 132, f"{folded:.0f} px tall")
        check("and offers the fine print rather than hiding it", "how it knows" in txt.lower(),
              txt[-70:] if txt else "")
        why = page.locator(".tripbar .tbwhy").first
        why.click(timeout=8000)
        page.wait_for_timeout(600)
        txtw = bar.inner_text(timeout=8000).replace("\n", " ")
        check("pressing it explains which clock is being used",
              "timetable" in txtw.lower() or "position" in txtw.lower(), txtw[-150:])
        check("it admits when notifications are unavailable",
              "notification" in txtw.lower() or "this bar only" in txtw.lower(),
              [s for s in txtw.split(" · ") if "bar" in s.lower() or "notification" in s.lower()][:1])
        notes = page.evaluate("() => window.__notes || []")
        check("an alert is handed to the notification channel once permission exists", len(notes) > 0,
              f"{notes[0]['via']}: {notes[0]['title'][:52]}" if notes else "no call recorded")
        check("it carries the stop you are at, not a generic message",
              any(geo["board"][0][:9].lower() in (str(n.get("title")) + str(n.get("body"))).lower() for n in notes)
              or any("stop" in str(n.get("title")).lower() for n in notes),
              str([n["title"] for n in notes[:2]])[:90])
        used = {n["via"] for n in notes}
        ok_claim = (("shade" in txtw.lower() and "sw" in used)
                    or ("page-level" in txtw.lower() and "page" in used)
                    or ("this bar only" in txtw.lower() and not used))
        check("and the bar names only the channel it really used", ok_claim,
              f"used={sorted(used) or 'none'} | …{txtw[-58:]}")
        open_h = bar.first.evaluate("el => el.getBoundingClientRect().height")
        check("and opening it costs the screen nothing it cannot spare", open_h <= 200,
              f"{folded:.0f} -> {open_h:.0f} px")
        check("the fine print costs less than half the bar", open_h - folded <= 70,
              f"+{open_h - folded:.0f} px")
        page.locator(".tripbar .tbwhy").first.click(timeout=8000)
        page.wait_for_timeout(500)
        # move the phone 14 stops along the ride: the countdown must follow
        page.context.set_geolocation({"latitude": geo["alight"][1], "longitude": geo["alight"][2]})
        page.wait_for_timeout(6500)
        bar2 = page.locator(".tripbar")
        txt2 = bar2.inner_text().replace("\n", " ") if bar2.count() else ""
        check("the trip is still running after a move down the line", bar2.count() > 0, txt2[:80])
        check("the countdown followed the fix, not the clock",
              "stops left" in txt2.lower() and txt2 != txt, txt2[:110])
        check("the bar moved from waiting to riding", "on board" in txt2.lower() or "next stop" in txt2.lower(),
              txt2[:60])
        check("and it says which stop is next", "next" in txt2.lower(), txt2[40:120])
        stored = page.evaluate("() => localStorage.getItem('omni:trip-v1')")
        check("an armed trip is written to storage", stored is not None, f"{len(str(stored))} bytes")
        page.reload(wait_until="load")
        page.wait_for_timeout(2800)
        back = page.locator(".tripbar").count() > 0
        txt3 = page.locator(".tripbar").inner_text().replace("\n", " ") if back else ""
        check("a reload resumes the same trip", back and geo["route"] in txt3, txt3[:80])
        if bar2.count():
            page.locator(".tripbar button:has-text('End')").first.click(timeout=8000)
            page.wait_for_timeout(800)
            check("End dismisses the bar", page.locator(".tripbar").count() == 0)
            check("End clears storage, so it cannot come back stale",
                  page.evaluate("() => localStorage.getItem('omni:trip-v1')") is None)

        print("\n=== 8. the journey clock: leave at, arrive by, and what the bar adds up to ===")
        home(page)
        open_tile(page, "Plan Journey")
        pick_suggestion(page, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        pick_suggestion(page, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        page.wait_for_timeout(1800)
        body = page.locator("body").inner_text()
        check("the planner asks WHEN, not only how long",
              "Leave at" in body and "Arrive by" in body and "Now" in body)
        m = re.search(r"(\d{2}:\d{2}) . (\d{2}:\d{2})", body)
        check("and answers in clock times", m is not None, m.group(0) if m else body[:60])
        segs = page.locator(".tlseg")
        check("the journey is drawn as a bar of legs", segs.count() >= 1, f"{segs.count()} segments")
        tips = [segs.nth(i).get_attribute("title") or "" for i in range(segs.count())]
        keys = page.locator(".tlkey").all_inner_texts()
        check("the bar has a key naming each leg, with its start time",
              len(keys) >= 1 and all(re.search(r"\d{2}:\d{2}", k) for k in keys)
              and not any("undefined" in k.lower() for k in keys), " / ".join(k[:22] for k in keys[:3]))
        check("every segment says what its minutes are made of",
              all("min" in (x or "") for x in tips) or not tips, " | ".join(t[:44] for t in tips[:2]))
        check("and the honesty line is on the card",
              "live vehicle" in body.lower() and "published departures" in body.lower(),
              [l for l in body.split("\n") if "5 km/h" in l][:1])

        page.locator("button:has-text('Leave at')").first.click(timeout=8000)
        page.wait_for_timeout(900)
        tinp = page.locator("input[type='time']")
        check("choosing it opens a time field", tinp.count() > 0)
        tinp.first.fill("08:15")
        tinp.first.dispatch_event("change")
        page.wait_for_timeout(1400)
        t2 = page.locator("body").inner_text()
        check("a fixed departure is honoured", "08:15" in t2, [l for l in t2.split("\n") if "08:15" in l][:1])
        mm = re.search(r"08:15 . (\d{2}):(\d{2})", t2)
        later = mm is not None and (int(mm.group(1)) * 60 + int(mm.group(2))) > 8 * 60 + 15
        check("and the arrival is a later clock time than it", later,
              mm.group(0) if mm else [l for l in t2.split("\n") if "→" in l][:1])
        chips = page.locator(".btnrow.tight .cat")
        check("other departures are offered as choices", chips.count() >= 2, f"{chips.count()} chips")
        before = [l for l in page.locator("body").inner_text().split("\n") if "→" in l and ":" in l][:1]
        if chips.count() >= 3:
            chips.nth(2).click(timeout=8000)
            page.wait_for_timeout(1400)
            after = [l for l in page.locator("body").inner_text().split("\n") if "→" in l and ":" in l][:1]
            check("picking one re-clocks the whole journey", after != before, f"{before} -> {after}")
            t3 = page.locator("body").inner_text()
            check("the wait at a bus stop is a printed time or none at all",
                  "no service" in t3.lower() or "published departure" in t3.lower()
                  or "min at this hour" in t3.lower(), [l for l in t3.split("\n") if "wait" in l.lower()][:1])

        page.locator("button:has-text('Arrive by')").first.click(timeout=8000)
        page.wait_for_timeout(900)
        page.locator("input[type='time']").first.fill("00:05")
        page.locator("input[type='time']").first.dispatch_event("change")
        page.wait_for_timeout(1400)
        t4 = page.locator("body").inner_text()
        check("an arrival nobody can meet is refused in words",
              "Nothing in these options reaches" in t4,
              [l for l in t4.split("\n") if "Nothing in these options" in l][:1])
        check("and it says what the earliest arrival really is",
              "earliest arrival is" in t4.lower(), [l for l in t4.split("\n") if "earliest" in l.lower()][:1])
        t5 = page.locator("body").inner_text()
        check("no label in this panel is a blank or an undefined", "undefined" not in t5.lower()
              and "₹" in t5 and "NaN" not in t5, [l for l in t5.split("\n") if "undefined" in l.lower()][:1])

        print("\n=== 9. console hygiene ===")
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
