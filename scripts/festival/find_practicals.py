"""Finds the practical lights in a picture (a lamp, a neon sign, a lit window): small, bright, saturated-or-warm
blobs, not a bright sky or a white wall. Prints JSON: picture -> [{x, y, color, area}] (x, y in % of the frame).

  .depth-venv/bin/python -I scripts/festival/find_practicals.py public <list-of-/film/img/-paths.txt>
"""
import json
import sys

import cv2
import numpy as np

public, listing = sys.argv[1], sys.argv[2]
out = {}
for ref in open(listing).read().split():
    img = cv2.imread(public + ref)
    if img is None:
        continue
    small = cv2.resize(img, (240, 135), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2].astype(np.float32) / 255
    mean_v = float(v.mean())
    # a night-ish frame only: a bright day frame has no "practicals", it is all light
    if mean_v > 0.42:
        continue
    mask = (v > max(0.86, mean_v + 0.5)).astype(np.uint8)
    if mask.mean() > 0.06:
        continue
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
    found = []
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA] / mask.size
        if area < 0.0004 or area > 0.025:
            continue
        x, y = cents[i]
        # skip blobs touching the frame edge (cut-off sky, a window bigger than the frame)
        l, t, w, h = stats[i, 0], stats[i, 1], stats[i, 2], stats[i, 3]
        if l <= 1 or t <= 1 or l + w >= 239 or t + h >= 134:
            continue
        # colour of the glow around the blob, not its blown-out centre
        ring = cv2.dilate((labels == i).astype(np.uint8), np.ones((9, 9), np.uint8)) - (labels == i).astype(np.uint8)
        b, g, r = [float(c) for c in cv2.mean(small, mask=ring)[:3]]
        peak = max(r, g, b, 1)
        r, g, b = [min(255, int(c / peak * 255)) for c in (r, g, b)]
        found.append({"x": round(x / 240 * 100, 1), "y": round(y / 135 * 100, 1), "color": f"#{r:02x}{g:02x}{b:02x}", "area": round(area, 5)})
    found.sort(key=lambda f: -f["area"])
    if found:
        out[ref] = found[:2]
print(json.dumps(out))
