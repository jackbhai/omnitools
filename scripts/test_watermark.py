#!/usr/bin/env python3
"""Prove the AHM7 handwriting watermark can be removed cleanly in a canvas.

Strategy that the browser will mirror exactly:
  1. find the ruled-line vertical period of the page
  2. copy a CLEAN band from one period above the watermark over the watermark
That reproduces the ruling + margin lines perfectly instead of smearing paint.
"""
from PIL import Image
import sys, collections

im = Image.open(sys.argv[1] if len(sys.argv) > 1 else 'shots/hand_test.png').convert('RGB')
w, h = im.size
px = im.load()
bg = px[5, 5]

def diff(p): return sum(abs(a - b) for a, b in zip(p, bg))

# --- row ink profile at two thresholds: heavy (text) and light (ruled lines)
heavy = [sum(1 for x in range(0, w, 2) if diff(px[x, y]) > 90) for y in range(h)]
light = [sum(1 for x in range(0, w, 2) if diff(px[x, y]) > 14) for y in range(h)]

lines = [y for y in range(h) if light[y] > w * 0.30]
gaps = [b - a for a, b in zip(lines, lines[1:]) if 20 < b - a < 200]
period = collections.Counter(gaps).most_common(1)[0][0] if gaps else 57
print(f"page {w}x{h}  bg={bg}  ruled lines={len(lines)}  period={period}px")

# --- watermark = last heavy band in the bottom 15% of the page
bands, cur = [], None
for y in range(h):
    if heavy[y] > 3:
        cur = [y, y] if cur is None else [cur[0], y]
    elif cur:
        bands.append(tuple(cur)); cur = None
if cur: bands.append(tuple(cur))
print("heavy bands:", bands)
wm = [b for b in bands if b[0] > h * 0.85]
if not wm:
    print("no watermark band found"); sys.exit(1)
y0, y1 = wm[0][0] - 6, wm[-1][1] + 6
print(f"watermark band y={y0}..{y1} ({(y1-y0)} px, {(y0/h):.1%}..{(y1/h):.1%})")

# --- copy the clean band from N periods above
n = 1
while True:
    sy0 = y0 - period * n
    if sy0 < h * 0.2: break
    if max(heavy[sy0:sy0 + (y1 - y0)]) <= 3: break
    n += 1
sy0 = y0 - period * n
print(f"source band y={sy0}..{sy0 + (y1-y0)} (clean, {n} period(s) up)")

out = im.copy()
strip = im.crop((0, sy0, w, sy0 + (y1 - y0)))
out.paste(strip, (0, y0))

# verify
op = out.load()
after = max(sum(1 for x in range(0, w, 2) if diff(op[x, y]) > 90) for y in range(y0, y1))
print(f"heavy ink left in band after patch: {after}  ->", "CLEAN" if after <= 3 else "STILL DIRTY")
out.save('shots/hand_clean.png')
print("saved shots/hand_clean.png")
