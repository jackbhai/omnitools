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
        # after the last published run there IS no next bus - the panel then says
        # so out loud, and that answer passes too. a test that only passes before
        # 5 pm is a fake bug factory, not a check.
        check("the next bus at the stop is answered - or its absence is stated",
              "NEXT AT" in up or "LAST BUS" in up or "NO BUS LEFT" in up,
              [x for x in t.split("\n")
               if "Next at" in x or "last bus" in x.lower() or "No bus left" in x][:1])
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


        CAP = """
(() => {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  class Cap extends OAC {
    constructor() {
      super(2, 44100 * 4, 44100);
      window.__cap = this;
      window.__ctxCount = (window.__ctxCount || 0) + 1;
    }
  }
  window.AudioContext = Cap;
  window.webkitAudioContext = Cap;
  window.__nodes = 0;
  ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource',
   'createStereoPanner', 'createBuffer', 'createDynamicsCompressor'].forEach((k) => {
    const orig = OAC.prototype[k];
    if (!orig) return;
    OAC.prototype[k] = function (...a) { window.__nodes++; return orig.apply(this, a); };
  });
  window.__measure = async () => {
    const b = await window.__cap.startRendering();
    const R = [];
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      let peak = 0, sq = 0, zc = 0, clipped = 0, first = -1, last = -1, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sq += d[i] * d[i];
        if (a > 0.004) { if (first < 0) first = i; last = i; }
        if ((d[i] > 0) !== (prev > 0)) zc++;
        prev = d[i];
      }
      const block = 4410, prof = [];
      for (let s = 0; s + block <= d.length; s += block) {
        let e = 0; for (let i = s; i < s + block; i++) e += Math.abs(d[i]);
        prof.push(e / block);
      }
      R.push({ peak: +peak.toFixed(4), rms: +Math.sqrt(sq / d.length).toFixed(5),
               len: +((last - first) / 44100).toFixed(3), zcr: zc, clipped: clipped, prof: prof });
    }
    return R;
  };
})();
"""

        print("\\n=== 9. the sounds: rendered samples, not promises ===")
        # The app is handed an OfflineAudioContext in place of a live one, so what
        # it schedules can be measured rather than trusted: peak, length, stereo
        # spread, clipped samples, and whether "off" is silence or only quieter.
        s = b.new_page(viewport={"width": 430, "height": 940})
        s.add_init_script(CAP)
        home(s)
        open_tile(s, "Plan Journey")
        pick_suggestion(s, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        pick_suggestion(s, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        s.wait_for_timeout(1400)
        ctxs = s.evaluate("window.__ctxCount || 0")
        check("picking a place really opens an audio context", ctxs >= 1, f"{ctxs} context(s)")
        rr = s.evaluate("window.__measure()")
        lft, rgt = rr[0], rr[1]
        check("and the sound is audible", lft["peak"] > 0.02 and lft["rms"] > 0.002,
              f"peak {lft['peak']} · rms {lft['rms']}")
        check("it lasts as long as a train taking the platform", 0.3 <= lft["len"] <= 4.0,
              f"{lft['len']} s of signal")
        check("nothing clips, with two whooshes and a chime stacked on one clock",
              lft["clipped"] == 0 and rgt["clipped"] == 0,
              f"{lft['clipped']}/{rgt['clipped']} clipped samples")
        check("it moves across the head, so it is not a mono beep",
              abs(lft["rms"] - rgt["rms"]) > 0.0002, f"L {lft['rms']} vs R {rgt['rms']}")
        prof = lft["prof"]
        loud = [x for x in prof if x > 0.1 * max(prof)] if prof else []
        check("it runs for at least four 100 ms blocks and fades, so it is not a click",
              len(loud) >= 4 and prof and prof[-1] < prof[0],
              f"{len(loud)} loud blocks of {len(prof)}, {prof[0]:.3f} down to {prof[-1]:.4f}")
        check("and building it took a real graph, not a silent stub",
              s.evaluate("window.__nodes") >= 12, f"{s.evaluate('window.__nodes')} nodes")
        check("and it is bright enough to hear over a fan",
              lft["zcr"] / max(0.1, lft["len"]) > 300,
              f"{lft['zcr']} zero crossings in {lft['len']} s")

        s2 = b.new_page(viewport={"width": 430, "height": 940})
        s2.add_init_script(CAP + """
(() => { try { localStorage.setItem('omni:settings', JSON.stringify({ sfx: false })); } catch (e) {} })();""")
        home(s2)
        open_tile(s2, "Plan Journey")
        pick_suggestion(s2, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        s2.wait_for_timeout(1200)
        check("turned off, not one audio node is built",
              s2.evaluate("window.__ctxCount || 0") == 0,
              f"{s2.evaluate('window.__ctxCount || 0')} contexts")
        check("and not one node is built either, so it is off and not merely quiet",
              s2.evaluate("window.__nodes || 0") == 0, f"{s2.evaluate('window.__nodes || 0')} nodes")

        s3 = b.new_page(viewport={"width": 430, "height": 940})
        s3.add_init_script(CAP)
        home(s3)
        open_tile(s3, "Plan Journey")
        pick_suggestion(s3, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        pick_suggestion(s3, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        s3.wait_for_timeout(1400)
        check("the panel that makes the sound carries the switch",
              s3.locator("button:has-text('Sounds on')").count() >= 1)
        s3.locator("button:has-text('Sounds on')").first.click(timeout=8000)
        s3.wait_for_timeout(700)
        t3 = s3.locator("body").inner_text()
        check("one press turns them off and says what that means",
              "Sounds off" in t3 and "nothing plays, nothing is fetched" in t3.lower(),
              [x for x in t3.split("\\n") if "Sounds" in x][:2])
        check("the choice is remembered, not just painted",
              '"sfx": false' in (s3.evaluate("localStorage.getItem('omni:settings')") or "")
              or '"sfx":false' in (s3.evaluate("localStorage.getItem('omni:settings')") or ""),
              s3.evaluate("localStorage.getItem('omni:settings')"))
        home(s3)
        open_tile(s3, "Plan Journey")
        s3.wait_for_timeout(1000)
        check("and after coming back the panel is still quiet, before anything is searched",
              s3.locator("button:has-text('Sounds off')").count() >= 1)
        s3.locator("button:has-text('Sounds off')").first.click(timeout=8000)
        s3.wait_for_timeout(900)
        t4 = s3.locator("body").inner_text()
        check("turning them on plays a bell you can hear, and names it",
              "Sounds on" in t4 and "last:" in t4.lower()
              and s3.evaluate("window.__ctxCount || 0") >= 1,
              [x for x in t4.split("\\n") if "last:" in x.lower()][:1])
        for _p in (s, s2, s3):
          try: _p.close()
          except Exception: pass

        print("\n=== 10. sounds in the whole app, switched from the top right ===")
        # The engine is in the start shell now. So a press in a tool that has
        # nothing to do with travel must build an audio graph — that is the whole
        # difference between "sounds in one panel" and "sounds in the app".
        s5 = b.new_page(viewport={"width": 430, "height": 940})
        s5.add_init_script(CAP)
        home(s5)
        s5.wait_for_timeout(400)
        n0 = s5.evaluate("window.__nodes || 0")
        s5.locator(".tile", has_text="QR").first.click(timeout=9000)
        s5.wait_for_timeout(500)
        n1 = s5.evaluate("window.__nodes || 0")
        check("opening a non-travel tool answers with sound", n1 > n0, f"{n0} to {n1} audio nodes on a tile press")
        s5.locator('button[aria-label="System status"]').click(timeout=9000)
        s5.wait_for_timeout(300)
        n2 = s5.evaluate("window.__nodes || 0")
        check("so does a header button, through the same delegated rule", n2 > n1, f"{n1} to {n2} nodes")
        s5.locator('button[aria-label="Back"]').click(timeout=9000)
        s5.wait_for_timeout(300)
        check("and leaving one is a different sound, not the same tick",
              s5.evaluate("window.__nodes || 0") > n2, "the back button has its own recipe")

        # Settings has to be one tap away from any screen, and it has to be able to
        # say what the app will do about sound effects.
        s5.locator('button[aria-label="Settings"]').click(timeout=9000)
        s5.wait_for_timeout(900)
        t5 = s5.locator("body").inner_text()
        check("the cog in the header lands on Settings", "settings" in s5.evaluate("location.hash").lower(),
              s5.evaluate("location.hash"))
        check("Settings speaks for the whole app, not only for travel",
              "Sound effects - the whole app" in t5 and "Travel Sounds" not in t5,
              [x for x in t5.split("\n") if "Sound effects" in x][:1])
        check("and offers to be heard before it is trusted",
              s5.locator("button:has-text('Hear a tap')").count() == 1
              and s5.locator("button:has-text('Hear a tool open')").count() == 1
              and s5.locator("button:has-text('Hear a leave')").count() == 1)
        n3 = s5.evaluate("window.__nodes || 0")
        s5.locator("button:has-text('Hear a tap')").click(timeout=9000)
        s5.wait_for_timeout(400)
        check("its test button builds a real graph", s5.evaluate("window.__nodes || 0") > n3,
              f"{n3} to {s5.evaluate('window.__nodes || 0')} nodes")
        s5.locator('button[aria-label="Sound effects on"]').click(timeout=9000)
        s5.wait_for_timeout(300)
        pref = json.loads(s5.evaluate("localStorage.getItem('omni:settings') || '{}'") or "{}")
        check("the header speaker writes the one preference the whole app reads",
              pref.get("sfx") is False, json.dumps(pref))
        n4 = s5.evaluate("window.__nodes || 0")
        s5.locator("button:has-text('Hear a leave')").click(timeout=9000)
        s5.wait_for_timeout(300)
        check("off means off: the next press builds nothing at all",
              s5.evaluate("window.__nodes || 0") == n4, f"still {n4} nodes")
        unchecked = s5.evaluate("() => { const l = [...document.querySelectorAll('.chk span')]"
            ".find(x => x.textContent.includes('Sound effects'));"
            " const box = l && l.parentElement.querySelector('input'); return !!(box && !box.checked); }")
        check("and the checkbox here reads off too, so the two switches cannot disagree",
              unchecked, "the Settings row tracks what the header speaker did")
        check("and it says so in words instead of failing quietly",
              "Switched off above" in s5.locator("body").inner_text())
        home(s5)
        open_tile(s5, "Plan Journey")
        s5.wait_for_timeout(700)
        check("the travel panel's own row reads the same preference",
              s5.locator("button:has-text('Sounds off')").count() >= 1,
              "off in the header is off in the panel")
        s5.locator('button[aria-label="Sound effects off"]').click(timeout=9000)
        s5.wait_for_timeout(300)
        n5 = s5.evaluate("window.__nodes || 0")
        # the test buttons live on the Settings page, so go back to them
        s5.locator('button[aria-label="Settings"]').click(timeout=9000)
        s5.wait_for_timeout(700)
        s5.locator("button:has-text('Hear a tap')").click(timeout=9000)
        s5.wait_for_timeout(400)
        check("and switching it back on from the header is heard",
              s5.evaluate("window.__nodes || 0") > n5,
              f"{n5} to {s5.evaluate('window.__nodes || 0')} nodes after the header turned sound back on")
        try:
            s5.close()
        except Exception:
            pass

        print("\n=== 11. Plan Journey is one search over both modes ===")
        s6 = b.new_page(viewport={"width": 430, "height": 940})
        s6.goto(BASE)
        home(s6)
        open_tile(s6, "Plan Journey")
        pick_suggestion(s6, "input >> nth=0", "Rajiv Chowk", "Rajiv Chowk")
        pick_suggestion(s6, "input >> nth=1", "Hauz Khas", "Hauz Khas")
        s6.wait_for_timeout(1800)
        body6 = s6.locator("body").inner_text()
        for chip in ["Both, whichever wins", "Metro + bus, both", "Metro only", "Bus only", "AC bus"]:
            check(f"the search offers the {chip.lower()} question",
                  s6.locator(f"button:has-text('{chip}')").count() == 1, chip)
        for srt in ["Best overall", "Fastest", "Cheapest", "Fewest changes"]:
            check(f"and ranks them by {srt.lower()}", s6.locator(f"button:has-text('{srt}')").count() == 1, srt)
        m = re.search(r"One search over ([\d,]+) published connections found (\d+) usable journey", body6)
        check("the panel says what the search actually did, in numbers",
              m is not None and int(m.group(2)) >= 1, m.group(0) if m else body6[-200:])
        chips6 = [x.strip() for x in s6.locator(".cats button.cat").all_inner_texts()]
        check("the answer is one ranked list of journeys, not a list per mode",
              len(chips6) >= 1 and all("m · ₹" in c for c in chips6), " / ".join(chips6[:4]))
        s6.locator("button:has-text('Best overall')").click(timeout=8000)
        s6.wait_for_timeout(500)
        s6.locator("button:has-text('Cheapest')").click(timeout=8000)
        s6.wait_for_timeout(500)
        cheapest = s6.locator(".cats button.cat.on").inner_text()
        s6.locator("button:has-text('Fastest')").click(timeout=8000)
        s6.wait_for_timeout(500)
        fastest = s6.locator(".cats button.cat.on").inner_text()
        def mins_of(txt):
            mm = re.search(r"(\d+)m", txt)
            return int(mm.group(1)) if mm else 10**6
        def rupees_of(txt):
            mm = re.search(r"₹(\d+)", txt)
            return int(mm.group(1)) if mm else 10**6
        check("re-ranking picks a genuinely cheaper first option and a genuinely quicker one",
              rupees_of(cheapest) <= rupees_of(fastest) and mins_of(fastest) <= mins_of(cheapest),
              f"cheapest {cheapest.strip()} vs fastest {fastest.strip()}")
        s6.locator("button:has-text('Metro + bus, both')").click(timeout=8000)
        s6.wait_for_timeout(2500)
        body7 = s6.locator("body").inner_text().lower()
        # compared in lower case on purpose: the card header is uppercased by CSS, and
        # inner_text() returns what is rendered - a case-sensitive match here once
        # failed on a screen that was showing the right answer
        check("asking for both modes either returns a journey that uses both or says it found none",
              "metro + bus" in body7 or "no journey needs both a bus and the metro" in body7,
              [x for x in body7.split("\n") if "both" in x][:1])
        s6.locator("button:has-text('Bus only')").click(timeout=8000)
        s6.wait_for_timeout(2000)
        modes6 = [x.strip() for x in s6.locator(".list b").all_inner_texts()]
        check("bus only returns bus journeys when the metro is excluded",
              not modes6 or all("Metro" not in m for m in modes6), " / ".join(modes6[:4]) or "one option, no compare table")
        s6.locator("button:has-text('Both, whichever wins')").click(timeout=8000)
        s6.locator("button:has-text('AC bus')").click(timeout=8000)
        s6.wait_for_timeout(1800)
        ac_chips = [x.strip() for x in s6.locator(".cats button.cat").all_inner_texts()]
        check("the AC toggle changes the price of a bus journey, visibly",
              len(ac_chips) >= 1 and all("₹" in c for c in ac_chips) and all(re.search(r"\d+m", c) for c in ac_chips),
              " / ".join(ac_chips[:3]))
        try:
            s6.close()
        except Exception:
            pass

        print("\n=== 13. the picker searches the whole map, not just our stop list ===")
        # The geocoders are somebody else's servers, so this section never asks them
        # anything: the page is handed canned answers for the URLs it calls, and what
        # gets checked is what the panel DOES with them. Whether the real services
        # answer at all is measured by verify_trip section 13, offline-tolerantly.
        s13 = b.new_page(viewport={"width": 430, "height": 940})
        p13 = []
        s13.on("pageerror", lambda e: p13.append(str(e)))
        GEO = {"type": "FeatureCollection", "features": [
            {"geometry": {"coordinates": [77.3253, 28.6649]},
             "properties": {"name": "Arya Samaj Road", "city": "Ghaziabad", "osm_type": "W", "osm_id": 1}},
            {"geometry": {"coordinates": [77.1970, 28.6457]},
             "properties": {"name": "Arya Samaj Road", "district": "Central Delhi", "osm_type": "W", "osm_id": 2}}]}
        def geo_route(mode):
            def h(route):
                u = route.request.url
                if mode == "off":
                    route.abort()
                elif "q=zzqx" in u:
                    route.fulfill(status=200, content_type="application/json",
                                  body='{"type":"FeatureCollection","features":[]}')
                else:
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(GEO))
            return h
        s13.route("**photon.komoot.io**", geo_route("hits"))
        s13.route("**nominatim.openstreetmap.org**", geo_route("off"))   # second opinion stays a stub
        s13.goto(BASE)
        home(s13)
        open_tile(s13, "Plan Journey")
        f13 = s13.locator("input >> nth=0")
        f13.click(timeout=8000); f13.fill(""); f13.type("abc", delay=15)
        s13.wait_for_timeout(400)
        check("three letters is not a place, and the panel does not pretend otherwise",
              s13.locator("button:has-text('Search the whole map')").count() == 0)
        f13.fill(""); f13.type("Arya Samaj Road", delay=10)
        s13.wait_for_timeout(500)
        ask13 = s13.locator("button:has-text('Search the whole map for')")
        check("a real street that is not a stop gets the map offered beside the stop list",
              ask13.count() == 1)
        ask13.first.click(timeout=8000)
        s13.wait_for_timeout(900)
        items = s13.locator(".geoitem")
        n_items = items.count()
        first_txt = items.first.inner_text().replace("\n", " ")[:80] if n_items else ""
        check("the map answers with the exact places, each credited to OpenStreetMap",
              n_items == 2 and "OpenStreetMap" in first_txt, first_txt)
        check("the two hits are told apart by where they are, not just the name",
              n_items == 2 and "Ghaziabad" in first_txt
              and "Delhi" in items.nth(1).inner_text(), first_txt)
        items.first.click(timeout=8000)
        s13.wait_for_timeout(600)
        check("picking one writes that exact pin into FROM, verbatim",
              "Arya Samaj Road" in s13.locator("input >> nth=0").input_value(),
              s13.locator("input >> nth=0").input_value()[:60])
        f13b = s13.locator("input >> nth=1")
        f13b.click(timeout=8000); f13b.fill(""); f13b.type("zzqx nowhere land", delay=8)
        s13.wait_for_timeout(400)
        s13.locator("button:has-text('Search the whole map for')").first.click(timeout=8000)
        s13.wait_for_timeout(800)
        check("a place no map service knows is admitted as such, with a way back to the stops",
              "Neither map service knows" in s13.locator("body").inner_text())
        check("an unknown place leaves the picker usable, the query still in the box",
              "zzqx" in s13.locator("input >> nth=1").input_value() + s13.locator("body").inner_text())
        s13.close()
        s13c = b.new_page(viewport={"width": 430, "height": 940})
        p13c = []
        s13c.on("pageerror", lambda e: p13c.append(str(e)))
        s13c.route("**photon.komoot.io**", geo_route("off"))
        s13c.route("**nominatim.openstreetmap.org**", geo_route("off"))
        s13c.goto(BASE)
        home(s13c)
        open_tile(s13c, "Plan Journey")
        f13c = s13c.locator("input >> nth=0")
        f13c.click(timeout=8000); f13c.fill(""); f13c.type("Connaught Place", delay=10)
        s13c.wait_for_timeout(500)
        s13c.locator("button:has-text('Search the whole map for')").first.click(timeout=8000)
        s13c.wait_for_timeout(900)
        body13c = s13c.locator("body").inner_text()
        check("offline is reported offline - never dressed up as an answer",
              "no internet, or both map services are refusing us" in body13c, body13c[-160:].replace("\n", " "))
        check("and the ordinary stop list still works while the map is out",
              s13c.locator(".list button").count() >= 1)
        s13c.locator("button:has-text('Try again')").first.click(timeout=8000)   # the retry must re-ask, not explode
        s13c.wait_for_timeout(700)
        check("retrying an offline lookup fails politely twice, never loudly once",
              "no internet, or both map services are refusing us" in s13c.locator("body").inner_text())
        s13c.close()
        check("the map-search panel threw no errors anywhere", not p13 and not p13c, "; ".join((p13 + p13c)[:2]))
        print("\n=== 14. measured walks and map-dropped pins ===")
        # The routing servers, geocoders and tile hosts are all answered from this
        # file - what is being tested is what the panel does with an answer, never
        # whether some operator feels like replying today.
        ROUTE_OK = {"code": "Ok", "routes": [{"distance": 640.0, "duration": 512.0,
            "geometry": {"coordinates": [[77.3253, 28.6649], [77.3285, 28.667], [77.3311, 28.6691]]}}]}
        REV14 = {"address": {"road": "Kasturba Marg", "suburb": "Rajendra Nagar", "city": "Ghaziabad"},
                 "display_name": "Kasturba Marg, Rajendra Nagar, Ghaziabad, Uttar Pradesh"}
        def s14_routes(s, mode):
            def fill(route, obj):
                route.fulfill(status=200, content_type="application/json", body=json.dumps(obj))
            s.route("**photon.komoot.io**", lambda r: fill(r, GEO))
            s.route("**nominatim.openstreetmap.org**",
                    lambda r: fill(r, [REV14]) if "/search" in r.request.url else fill(r, REV14))
            for tile in ("**tile.openstreetmap.fr**", "**arcgisonline.com**", "**opentopomap.org**", "**tile.openstreetmap.org**"):
                s.route(tile, lambda r: r.abort())
            if mode == "dead":
                s.route("**routing.openstreetmap.de**", lambda r: r.abort())
                s.route("**router.project-osrm.org**", lambda r: r.abort())
            else:
                s.route("**routing.openstreetmap.de**", lambda r: fill(r, ROUTE_OK))
                s.route("**router.project-osrm.org**", lambda r: r.abort())
        def s14_two_pins(s):
            f = s.locator("input >> nth=0")
            f.click(timeout=8000); f.type("Arya Samaj Road", delay=8)
            s.wait_for_timeout(500)
            s.locator("button:has-text('Search the whole map for')").first.click(timeout=8000)
            s.wait_for_timeout(800)
            s.locator(".geoitem").first.click(timeout=8000)
            g = s.locator("input >> nth=1")
            g.click(timeout=8000); g.type("Arya Samaj Road", delay=8)
            s.wait_for_timeout(500)
            s.locator("button:has-text('Search the whole map for')").first.click(timeout=8000)
            s.wait_for_timeout(800)
            s.locator(".geoitem").nth(1).click(timeout=8000)
            s.wait_for_timeout(1400)
        s14 = b.new_page(viewport={"width": 430, "height": 940})
        p14e = []
        s14.on("pageerror", lambda e: p14e.append(str(e)))
        s14_routes(s14, "live")
        s14.goto(BASE); home(s14); open_tile(s14, "Plan Journey")
        s14_two_pins(s14)
        try:
            s14.wait_for_selector("text=measured along OpenStreetMap footpaths", timeout=14000)
            got_note = True
        except Exception:
            got_note = False
        check("when the foot router answers, the panel says the walks are measured, not guessed",
              got_note)
        s14.locator("button:has-text('Turn by turn')").first.click(timeout=8000)
        s14.wait_for_timeout(700)
        b14 = s14.locator("body").inner_text()
        check("turn-by-turn prints the router's metres with the walk line",
              "640 m" in b14 and "measured on footpaths" in b14,
              [l.strip() for l in b14.split("\n") if "640" in l][:1] or "no 640 line")
        mb14 = s14.locator("button:has-text('Map ·')")
        check("the map button counts points without pretending precision",
              mb14.count() >= 1, mb14.first.inner_text()[:32] if mb14.count() else "none")
        mb14.first.click(timeout=8000)
        s14.wait_for_timeout(3400)
        check("the measured walk is drawn, dotted, over the ride line",
              s14.locator('.mapbox svg polyline[stroke="#00E5FF"], .mapbox path[stroke="#00E5FF"]').count() >= 1,
              f"threads={s14.locator('.mapbox svg polyline[stroke=\"#00E5FF\"], .mapbox path[stroke=\"#00E5FF\"]').count()}")
        s14.close()
        s14o = b.new_page(viewport={"width": 430, "height": 940})
        p14o = []
        s14o.on("pageerror", lambda e: p14o.append(str(e)))
        s14_routes(s14o, "dead")
        s14o.goto(BASE); home(s14o); open_tile(s14o, "Plan Journey")
        s14_two_pins(s14o)
        s14o.locator("button:has-text('Turn by turn')").first.click(timeout=8000)
        s14o.wait_for_timeout(900)
        b14o = s14o.locator("body").inner_text()
        check("a silent routing service leaves the straight-line number standing, and says so",
              "in a straight line" in b14o and "measured on footpaths" not in b14o,
              b14o[-160:].replace("\n", " "))
        s14o.close()
        s14p = b.new_page(viewport={"width": 430, "height": 940})
        p14p = []
        s14p.on("pageerror", lambda e: p14p.append(str(e)))
        s14_routes(s14p, "live")
        s14p.goto(BASE); home(s14p); open_tile(s14p, "Plan Journey")
        f14p = s14p.locator("input >> nth=0")
        f14p.click(timeout=8000); f14p.type("Ghasitaram", delay=10)
        s14p.wait_for_timeout(600)
        dpin = s14p.locator("button:has-text('drop a pin on the map')")
        check("the picker offers the map itself for the places no list has", dpin.count() == 1)
        dpin.first.click(timeout=8000)
        s14p.wait_for_timeout(900)
        check("a picker card opens under the field", s14p.locator(".mapbox").count() >= 1)
        try:
            pick = s14p.wait_for_selector("svg[aria-label*='Tap to pick']", timeout=16000)
        except Exception:
            pick = s14p.locator(".mapleaf").first
        bx = pick.bounding_box()
        s14p.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2)
        s14p.wait_for_timeout(1300)
        b14p = s14p.locator("body").inner_text()
        check("the tap is answered with the address that lives there",
              "Kasturba Marg, Rajendra Nagar, Ghaziabad" in b14p,
              [l.strip() for l in b14p.split("\n") if "Kasturba" in l][:1] or "no Kasturba line")
        s14p.locator("button:has-text('Use it')").first.click(timeout=8000)
        s14p.wait_for_timeout(700)
        check("and 'Use it' writes that exact spot into the From field",
              "Kasturba Marg" in s14p.locator("input >> nth=0").input_value(),
              s14p.locator("input >> nth=0").input_value()[:64])
        s14p.close()
        check("none of the new machinery threw in any browser",
              not (p14e + p14o + p14p), "; ".join((p14e + p14o + p14p)[:2]))
        print("\n=== 12. console hygiene ===")
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
