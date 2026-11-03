#!/usr/bin/env python3
"""Checks the map-fitting maths in make_depth.py without any model: a synthetic scene stands in for the depth model's
answer, a "map" of another shape, with a border and a known squeeze and shift, is made from it, and the fit must find
the squeeze and shift again. Run: python scripts/depth/test_fit.py  (needs numpy and opencv-python-headless)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cv2  # noqa: E402
import numpy as np  # noqa: E402

import make_depth as md  # noqa: E402


def scene(width=1600, height=900):
    """A made-up depth image: a ramp, a building, a thin pole, railings and a disc. Edges everywhere, nothing symmetric."""
    img = np.tile(np.linspace(0.1, 0.55, height, dtype=np.float32)[:, None], (1, width))
    cv2.rectangle(img, (int(width * .62), int(height * .08)), (int(width * .99), int(height * .72)), 0.35, -1)
    cv2.rectangle(img, (int(width * .17), int(height * .22)), (int(width * .185), int(height * .95)), 0.95, -1)
    cv2.rectangle(img, (int(width * .05), int(height * .60)), (int(width * .30), int(height * .64)), 0.80, -1)
    for k in range(7):
        x = int(width * (0.40 + 0.035 * k))
        cv2.rectangle(img, (x, int(height * .55)), (x + 5, int(height * .80)), 0.70, -1)
    cv2.circle(img, (int(width * .47), int(height * .32)), int(height * .10), 0.75, -1)
    cv2.circle(img, (int(width * .83), int(height * .88)), int(height * .07), 0.90, -1)
    return cv2.GaussianBlur(img, (0, 0), 2.0).clip(0, 1)


def make_candidate(reference, transform, size):
    """The map the engine would be given: picture point (x, y) reads it at (sx*x + tx, sy*y + ty), with a dark border."""
    sx, tx, sy, ty = transform
    width, height = size
    u = (np.arange(width) + 0.5) / width
    v = (np.arange(height) + 0.5) / height
    ref_h, ref_w = reference.shape
    map_x = np.tile((((u - tx) / sx) * ref_w - 0.5).astype(np.float32), (height, 1))
    map_y = np.tile((((v - ty) / sy) * ref_h - 0.5).astype(np.float32)[:, None], (1, width))
    out = cv2.remap(reference, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0.0)
    border = max(3, round(width * 0.006))
    out[:border] = 0
    out[-border:] = 0
    out[:, :border] = 0
    out[:, -border:] = 0
    return out


def check(name, condition, detail=""):
    print(("PASS  " if condition else "FAIL  ") + name + (f" - {detail}" if detail else ""))
    return condition


def main():
    reference = scene()
    ok = True

    # 1. The director's train map: 1408x768 with its content squeezed 3% and shifted 1.55%.
    known = (0.969, 0.0155, 1.0, 0.0)
    candidate = make_candidate(reference, known, (1408, 768))
    fit = md.fit_transform(cv2, np, reference, candidate)
    sx, tx, sy, ty = fit["transform"]
    ok &= check("finds a 3% squeeze and a 1.5% shift", abs(sx - known[0]) < 0.006 and abs(tx - known[1]) < 0.004
                and abs(sy - known[2]) < 0.006 and abs(ty - known[3]) < 0.004,
                f"found sx={sx:.4f} tx={tx:+.4f} sy={sy:.4f} ty={ty:+.4f}")
    ok &= check("the fit is clearly better than as-played", fit["after"] - fit["before"] > md.FIT_MIN_GAIN,
                f"{fit['before']:.3f} -> {fit['after']:.3f}")
    ok &= check("it is not at the edge of the search", not fit["at_limit"])

    # 2. Something different: a wider, taller map, shifted the other way.
    known2 = (1.04, -0.02, 0.98, 0.01)
    fit2 = md.fit_transform(cv2, np, reference, make_candidate(reference, known2, (1600, 900)))
    ok &= check("finds a different squeeze and shift", all(abs(a - b) < 0.008 for a, b in zip(fit2["transform"], known2)),
                "found " + ", ".join(f"{v:+.4f}" for v in fit2["transform"]))

    # 3. The fitted map reads like the reference where the border does not reach.
    fitted = md.warp_map(cv2, np, candidate, fit["transform"], 1600, 900)
    inner = (slice(60, -60), slice(80, -80))
    error = float(np.abs(fitted[inner] - reference[inner]).mean())
    stretched = cv2.resize(candidate, (1600, 900), interpolation=cv2.INTER_CUBIC)
    error_before = float(np.abs(stretched[inner] - reference[inner]).mean())
    ok &= check("the fitted map matches the scene better than the stretched one", error < error_before * 0.5,
                f"mean error {error_before:.4f} -> {error:.4f}")
    ok &= check("no dark border is copied into the fitted map", float(fitted[:, :12].mean()) > 0.05,
                f"left edge mean {float(fitted[:, :12].mean()):.3f}")

    # 4. A map that already lines up is left alone.
    exact = make_candidate(reference, (1.0, 0.0, 1.0, 0.0), (1600, 900))
    fit3 = md.fit_transform(cv2, np, reference, exact)
    ok &= check("a map that already fits is left alone", fit3["after"] - fit3["before"] < md.FIT_MIN_GAIN,
                f"gain {fit3['after'] - fit3['before']:.3f}")

    # 5. The size of the problem, in words.
    shift = md.largest_shift(known)
    ok &= check("reports how far out of place the edges were", 20 < shift < 40, f"{shift} px on a 1920-wide picture")

    print("\nall passed" if ok else "\nFAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
