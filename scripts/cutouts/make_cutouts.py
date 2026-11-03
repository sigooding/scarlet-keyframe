#!/usr/bin/env python3
"""Cut-outs, a plate and a depth map for ONE picture, made on this machine.

Normally you do not run this directly: `npm run cutouts -- <picture>` (scripts/make-cutouts.mjs) finds the picture,
downloads the models, picks a fresh folder and calls this. The recipe is the film's own (scarlett-witness
`tools/make-depth-layers.py` and `tools/auto-cutouts.py`), with better models:

  1. find the people            YOLOX-X (person class). On the 45 pictures whose boxes were drawn by hand it found 95% of
                                them against 86% for the film's U2-Net, and ran faster. A figure smaller than 15% of the
                                largest (or under 0.04% of the picture) stays in the plate, and so does anyone past four
                                (the depth camera draws up to four cut-outs per picture).
  2. cut each one out           BiRefNet at 1024x1024 on a square round the box: a soft matte, moved by the engine as one solid
                                layer so nobody stretches.
  3. the depth map              from the model (Depth Anything V2) or from a map somebody already made (--source-depth, kept as
                                it is), with the people painted out of it, so the background does not bend round where they
                                stood. A person moves at the depth under their feet (so the feet stay planted), or, when
                                the feet are out of shot, at the depth of their body.
  4. the plate                  LaMa paints in what was behind them: the picture with nobody in it, drawn through the depth
                                map as the camera moves.

It also writes a review sheet (picture with its boxes, the cut-outs on green, the plate, the depth map) and says what a
person should look at: a cut-out that runs into its box edge (it may be clipped), one that is nearly empty, someone
still found in the plate. A face on a television or a photograph on a wall is people-shaped to a model: look at the sheet.

Everything is written to --out-dir (it must not exist yet; nothing is ever overwritten) through a temporary folder, so a
stopped run leaves nothing half-made. One model is loaded at a time, so a 10 GB graphics card never holds all four; if the
GPU runs out of memory a step is done again on the CPU. It prints one JSON line last, which scripts/make-cutouts.mjs reads.

Needs numpy, opencv-python-headless and onnxruntime (`npm run depth:setup` installs them in .depth-venv).
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "depth"))
from make_depth import MEAN, STD, depth_of, fail, load_libraries, make_session, read_gray01, read_rgb, soften  # noqa: E402

PAD = 0.06  # every box grows by this share of its size: hair and hems are not clipped
SHARE = 0.15  # a figure must be at least this share of the largest to be cut out
FLOOR = 0.0004  # ... and at least this share of the picture
CONF = 0.3  # YOLOX person confidence
NMS = 0.45
MAX_CUTOUTS = 4  # the depth camera draws up to four per picture
SMOOTH = 3.0  # softening of a depth map made by the model (a sigma on a 480-wide copy), as the film's own
HOLE_GROW = 13  # the hole reaches this far past each matte: the picture's own edge pixels carry the old background
MIN_SOLID = 0.005  # a cut-out with less solid matte than this share of its box is dropped as "not a person"


# ----------------------------------------------------------------------------------------------------- models

class Model:
    """An onnxruntime session made when needed and let go of afterwards, so only one model is ever in memory. If the GPU
    stops on a step (out of memory), the step is done again on the CPU."""

    def __init__(self, ort, path, want_gpu, say):
        self.ort, self.path, self.want_gpu, self.say = ort, path, want_gpu, say
        self.session = None
        self.provider = "CPUExecutionProvider"

    def __enter__(self):
        self.session, self.provider = make_session(self.ort, self.path, self.want_gpu)
        return self

    def __exit__(self, *_):
        self.session = None
        gc.collect()

    def call(self, fn):
        """fn(session), and again on the CPU if the GPU stops on it."""
        try:
            return fn(self.session)
        except Exception as error:  # noqa: BLE001 - onnxruntime raises plain RuntimeError for "out of memory"
            if self.provider == "CPUExecutionProvider":
                raise
            self.say(f"  the GPU stopped on this step ({str(error).splitlines()[0][:120]}); doing it on the CPU")
            self.session = None
            gc.collect()
            self.session, self.provider = make_session(self.ort, self.path, False)
            return fn(self.session)

    def run(self, feed):
        return self.call(lambda session: session.run(None, feed))

    def first_input(self):
        return self.session.get_inputs()[0].name


# ---------------------------------------------------------------------------------------------- finding people

def person_boxes(cv2, np, model, bgr, conf=CONF, nms=NMS, size=640):
    """YOLOX person boxes [x, y, w, h] with their scores. The export takes a fixed 640x640 BGR picture, 0..255, letterboxed
    (grey 114), and answers raw predictions that are decoded here with the grid and strides (YOLOX demo/ONNXRuntime)."""
    h, w = bgr.shape[:2]
    r = min(size / h, size / w)
    padded = np.full((size, size, 3), 114, np.uint8)
    padded[: int(h * r), : int(w * r)] = cv2.resize(bgr, (int(w * r), int(h * r)), interpolation=cv2.INTER_LINEAR)
    blob = np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32)
    out = model.run({model.first_input(): blob})[0].astype(np.float32)
    grids, strides = [], []
    for stride in (8, 16, 32):
        n = size // stride
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        grids.append(np.stack((xv, yv), 2).reshape(1, -1, 2))
        strides.append(np.full((1, n * n, 1), stride))
    grids, strides = np.concatenate(grids, 1), np.concatenate(strides, 1)
    out[..., :2] = (out[..., :2] + grids) * strides
    out[..., 2:4] = np.exp(out[..., 2:4]) * strides
    p = out[0]
    score = p[:, 4] * p[:, 5]  # objectness x the person class (0)
    keep = score >= conf
    p, score = p[keep], score[keep]
    if not len(p):
        return []
    xyxy = np.stack([p[:, 0] - p[:, 2] / 2, p[:, 1] - p[:, 3] / 2, p[:, 0] + p[:, 2] / 2, p[:, 1] + p[:, 3] / 2], 1) / r
    boxes = [[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in xyxy]
    found = []
    for i in np.array(cv2.dnn.NMSBoxes(boxes, score.tolist(), conf, nms)).reshape(-1):
        x, y, bw, bh = boxes[int(i)]
        x0, y0, x1, y1 = max(0.0, x), max(0.0, y), min(float(w), x + bw), min(float(h), y + bh)
        if x1 - x0 >= 2 and y1 - y0 >= 2:
            found.append(([int(x0), int(y0), int(x1 - x0), int(y1 - y0)], float(score[int(i)])))
    return found


def choose_people(found, width, height, limit=MAX_CUTOUTS):
    """The figures worth a cut-out: at least SHARE of the largest and FLOOR of the picture, the `limit` largest, then left to
    right. Returns (boxes widened by PAD, how many people were seen but left in the plate)."""
    if not found:
        return [], 0
    areas = [b[2] * b[3] for b, _ in found]
    floor = max(max(areas) * SHARE, width * height * FLOOR)
    big = sorted([(a, b) for (b, _), a in zip(found, areas) if a >= floor], reverse=True)[:limit]
    boxes = []
    for _, (x, y, w, h) in sorted(big, key=lambda item: item[1][0]):
        dx, dy = round(w * PAD), round(h * PAD)
        x0, y0, x1, y1 = max(0, x - dx), max(0, y - dy), min(width, x + w + dx), min(height, y + h + dy)
        boxes.append([x0, y0, x1 - x0, y1 - y0])
    return boxes, len(found) - len(boxes)


# ---------------------------------------------------------------------------------------- cutting them out

def imagenet(cv2, np, rgb, size):
    shrink = rgb.shape[0] > size or rgb.shape[1] > size
    x = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_AREA if shrink else cv2.INTER_CUBIC).astype(np.float32) / 255
    return ((x - np.array(MEAN, np.float32)) / np.array(STD, np.float32)).transpose(2, 0, 1)[None].astype(np.float32)


def matte_in(cv2, np, model, rgb, box):
    """The person or group inside box [x, y, w, h] as a soft matte the size of the picture. The box is cut out as a square
    (edges repeated past the frame), segmented at 1024x1024, and only the solid pieces of the result are kept."""
    H, W = rgb.shape[:2]
    x, y, w, h = box
    side = int(max(w, h) * 1.15)
    x0, y0 = int(round(x + w / 2 - side / 2)), int(round(y + h / 2 - side / 2))
    padded = cv2.copyMakeBorder(rgb, side, side, side, side, cv2.BORDER_REPLICATE)
    crop = padded[y0 + side : y0 + 2 * side, x0 + side : x0 + 2 * side]
    logits = model.run({model.first_input(): imagenet(cv2, np, crop, 1024)})[0][0, 0]
    m = cv2.resize((1 / (1 + np.exp(-logits))).astype(np.float32), (side, side), interpolation=cv2.INTER_CUBIC).clip(0, 1)
    full = np.zeros((H + 2 * side, W + 2 * side), np.float32)
    full[y0 + side : y0 + 2 * side, x0 + side : x0 + 2 * side] = m
    full = full[side : side + H, side : side + W]
    inside = np.zeros_like(full)
    inside[max(0, y) : y + h, max(0, x) : x + w] = 1
    full *= inside
    # Keep the people (every piece at least a fifth the size of the largest), not specks the model also liked.
    n, labels, stats, _ = cv2.connectedComponentsWithStats((full > 0.5).astype(np.uint8))
    if n > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        keep = np.isin(labels, 1 + np.flatnonzero(areas >= areas.max() / 5)).astype(np.uint8)
        full *= cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    full[full < 0.02] = 0
    return full


def own(np, mattes, depth):
    """Where cut-outs overlap, each pixel goes to the one whose matte claims it most strongly, and where two or more claim it
    outright (above half), to the nearest of them by the depth map's median under each: the one in front hides the rest."""
    if len(mattes) < 2:
        return mattes
    stack = np.stack(mattes)
    solid = stack > 0.5
    near = np.array([np.median(depth[s]) if s.any() else 0.0 for s in solid], np.float32)
    best = stack.argmax(0)
    contested = solid.sum(0) > 1
    best[contested] = np.where(solid, near[:, None, None], -1.0).argmax(0)[contested]
    return [np.where(best == i, m, 0).astype(np.float32) for i, m in enumerate(mattes)]


# ------------------------------------------------------------------------------------------------ the plate

def fill(cv2, np, model, rgb, hole):
    """Paints the hole in with LaMa: one square crop around each piece of the hole (twice its size, at most the picture's
    height), run at 512x512, scaled back and feathered into the picture over two pixels."""
    out = rgb.copy()
    H, W = hole.shape
    names = [i.name for i in model.session.get_inputs()]
    image_name, mask_name = ("image", "mask") if {"image", "mask"} <= set(names) else (names[0], names[1])
    # Pieces of the hole within a dozen pixels of each other are filled as one; a piece under 400 pixels on its own is
    # filled from its edges (cv2.inpaint), not by the model.
    near = cv2.dilate(hole.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    n, labels, _, _ = cv2.connectedComponentsWithStats(near)
    tiny = np.zeros((H, W), np.uint8)
    for i in range(1, n):
        piece = (labels == i) & hole.astype(bool)
        if piece.sum() < 400:
            tiny[piece] = 255
            continue
        ys, xs = np.nonzero(piece)
        x, y, w, h = int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        side = int(min(H, W, max(512, 2 * max(w, h))))
        x0 = int(np.clip(round(x + w / 2 - side / 2), 0, W - side))
        y0 = int(np.clip(round(y + h / 2 - side / 2), 0, H - side))
        crop = out[y0 : y0 + side, x0 : x0 + side]
        m = piece[y0 : y0 + side, x0 : x0 + side].astype(np.float32)
        img = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        mk = (cv2.resize(m, (512, 512), interpolation=cv2.INTER_LINEAR) > 0.01).astype(np.float32)
        res = model.run({image_name: img.transpose(2, 0, 1)[None], mask_name: mk[None, None]})[0][0].transpose(1, 2, 0)
        res = cv2.resize(np.clip(res, 0, 255).astype(np.float32), (side, side), interpolation=cv2.INTER_CUBIC)
        a = np.maximum(cv2.GaussianBlur(m, (0, 0), 2), m)[..., None]
        out[y0 : y0 + side, x0 : x0 + side] = (res * a + crop.astype(np.float32) * (1 - a)).clip(0, 255).astype(np.uint8)
    if tiny.any():
        out = cv2.inpaint(out, tiny, 5, cv2.INPAINT_TELEA)
    return out


# --------------------------------------------------------------------------------------- depth under people

def background_depth(cv2, np, depth, hole, smooth):
    """The depth with the people taken out (filled from around them), softened by `smooth` (0 keeps the map as it is). A
    depth map carries a person's nearness a little past their outline, so the hole is widened before the fill; left in,
    that halo becomes a bump the background bends around."""
    d16 = (depth * 65535).round().astype(np.uint16)
    wide = cv2.dilate(hole.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (45, 45)))
    filled = cv2.inpaint(d16, wide, 15, cv2.INPAINT_TELEA).astype(np.float32) / 65535
    return soften(cv2, filled, smooth)


def feet_depth(cv2, np, matte, bg):
    """The background depth just under the lowest solid row of a cut-out, at the middle of its feet: the cut-out moves at the
    ground's depth there, so the feet stay planted."""
    H, W = matte.shape
    ys, xs = np.nonzero(matte > 0.5)
    bottom = int(ys.max())
    feet = xs[ys >= bottom - max(4, (bottom - int(ys.min())) // 25)]
    fx, fy = float(np.median(feet)), min(H - 1, bottom + 4)
    x0, x1 = int(max(0, fx - 3)), int(min(W, fx + 4))
    y0, y1 = int(max(0, fy - 2)), int(min(H, fy + 3))
    return float(np.median(bg[y0:y1, x0:x1]))


def body_depth(cv2, np, matte, depth):
    """The map's median under the solid middle of a cut-out (a seated or half-framed person has no feet in shot)."""
    core = cv2.erode((matte > 0.9).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))) > 0
    if core.sum() < 50:
        core = matte > 0.5
    return float(np.median(depth[core]))


def person_depth(cv2, np, matte, bg, depth, height):
    """(depth, how): at the feet when they are in shot and the ground there agrees with the body, else at the body."""
    ys, _ = np.nonzero(matte > 0.5)
    body = body_depth(cv2, np, matte, depth)
    if int(ys.max()) >= height - max(4, int(height * 0.03)):
        return body, "body"
    feet = feet_depth(cv2, np, matte, bg)
    if abs(feet - body) > 0.3:
        return body, "body"
    return feet, "feet"


# ----------------------------------------------------------------------------------------------- the checks

def check_cutouts(np, cutouts, boxes, width, height):
    """What a person would want to look at: a clipped or nearly empty cut-out."""
    flags = []
    for k, (alpha, (x, y, w, h)) in enumerate(zip(cutouts, boxes), start=1):
        a = alpha[y : y + h, x : x + w] > 128
        if a.mean() < 0.08:
            flags.append(f"cut-out {k} is nearly empty: it may not be a person")
        # an edge of the box that is not the picture's own edge, with the matte running into it, may have cut someone off
        inner = [(a[0].mean(), y > 0), (a[-1].mean(), y + h < height), (a[:, 0].mean(), x > 0), (a[:, -1].mean(), x + w < width)]
        if any(v > 0.25 and inside for v, inside in inner):
            flags.append(f"cut-out {k} runs to its box edge: it may be clipped")
    return flags


def review_sheet(cv2, np, rgb, boxes, alphas, plate, bg):
    """Picture with its boxes | the cut-outs on green | the plate | the depth map, 640x360 each."""
    size = (640, 360)
    picture = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR).copy()
    for k, (x, y, w, h) in enumerate(boxes, start=1):
        cv2.rectangle(picture, (x, y), (x + w, y + h), (0, 255, 255), max(3, rgb.shape[1] // 400))
        cv2.putText(picture, str(k), (x + 8, y + 40), cv2.FONT_HERSHEY_SIMPLEX, max(1.0, rgb.shape[1] / 1600), (0, 255, 255), 3)
    green = np.zeros_like(picture)
    green[:] = (102, 255, 0)
    for alpha in alphas:
        a = (alpha.astype(np.float32) / 255)[..., None]
        green = (cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR) * a + green * (1 - a)).astype(np.uint8)
    depth = cv2.cvtColor((bg * 255).round().astype(np.uint8), cv2.COLOR_GRAY2BGR)
    tiles = []
    for image, label in ((picture, "picture and boxes"), (green, "cut-outs"), (cv2.cvtColor(plate, cv2.COLOR_RGB2BGR), "plate (people painted out)"), (depth, "depth map")):
        tile = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
        cv2.putText(tile, label, (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        tiles.append(tile)
    return np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:])])


# ---------------------------------------------------------------------------------------------- writing files

def save(cv2, np, path, image, extension, params=()):
    ok, encoded = cv2.imencode(extension, image, list(params))
    if not ok:
        fail("cannot-write", f"could not encode {os.path.basename(path)}")
    encoded.tofile(path)  # through numpy so a path with accents works on Windows too


# ------------------------------------------------------------------------------------------------------ main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("picture")
    parser.add_argument("--out-dir", required=True, help="the new folder to write into (it must not exist)")
    parser.add_argument("--people-model", required=True, help="YOLOX .onnx, finds the people")
    parser.add_argument("--matte-model", required=True, help="BiRefNet .onnx, cuts them out")
    parser.add_argument("--inpaint-model", required=True, help="LaMa .onnx, paints the plate")
    parser.add_argument("--depth-model", help="Depth Anything V2 .onnx (not needed with --source-depth)")
    parser.add_argument("--source-depth", help="a depth map somebody already made: kept as it is, with the people painted out")
    parser.add_argument("--gpu", action="store_true", help="use the NVIDIA GPU when onnxruntime-gpu can")
    parser.add_argument("--conf", type=float, default=CONF, help=f"person confidence, default {CONF}")
    parser.add_argument("--max-cutouts", type=int, default=MAX_CUTOUTS)
    args = parser.parse_args()
    if not args.source_depth and not args.depth_model:
        parser.error("--depth-model is needed unless --source-depth is given")
    if os.path.exists(args.out_dir):
        fail("exists", f"{args.out_dir} already exists: nothing is overwritten")

    started = time.time()
    cv2, np, ort = load_libraries()
    ort.set_default_logger_severity(3)
    say = lambda text: sys.stderr.write(text + "\n")  # noqa: E731
    rgb = read_rgb(cv2, np, args.picture)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    H, W = rgb.shape[:2]
    gpu = bool(args.gpu and "CUDAExecutionProvider" in ort.get_available_providers())
    if args.gpu and not gpu:
        say("  --gpu asked for the GPU but onnxruntime has none (it needs onnxruntime-gpu with CUDA 12 and cuDNN 9): using the CPU")
    providers = {}
    result = {"ok": True, "mode": "cutouts", "width": int(W), "height": int(H)}

    say("1/5 finding the people")
    with Model(ort, args.people_model, gpu, say) as model:
        found = person_boxes(cv2, np, model, bgr, args.conf)
        providers["people"] = model.provider
    boxes, left_out = choose_people(found, W, H, args.max_cutouts)
    result.update(seen=len(found), left_out=left_out)
    if not boxes:
        result.update(written=False, reason="no-people", seconds=round(time.time() - started, 1))
        print(json.dumps(result))
        return 0

    say(f"2/5 the depth ({'your map, kept as it is' if args.source_depth else 'from the model'}; {len(boxes)} {'person' if len(boxes) == 1 else 'people'} found)")
    if args.source_depth:
        given = read_gray01(cv2, np, args.source_depth)
        depth = cv2.resize(given, (W, H), interpolation=cv2.INTER_CUBIC).clip(0, 1) if given.shape != (H, W) else given
        source = "given"
    else:
        with Model(ort, args.depth_model, gpu, say) as model:
            depth = model.call(lambda session: depth_of(cv2, np, session, rgb))
            providers["depth"] = model.provider
        source = "model"

    say(f"3/5 cutting out ({len(boxes)})")
    with Model(ort, args.matte_model, gpu, say) as model:
        mattes = [matte_in(cv2, np, model, rgb, box) for box in boxes]
        providers["matte"] = model.provider
    mattes = own(np, mattes, depth)
    keep = [i for i, m in enumerate(mattes) if (m > 0.5).sum() >= MIN_SOLID * boxes[i][2] * boxes[i][3]]
    flags = [f"person {i + 1} (box {boxes[i][2]}x{boxes[i][3]}) gave no cut-out, so it was left in the plate" for i in range(len(boxes)) if i not in keep]
    boxes, mattes = [boxes[i] for i in keep], [mattes[i] for i in keep]
    if not boxes:
        result.update(written=False, reason="nothing-cut", flags=flags, seconds=round(time.time() - started, 1))
        print(json.dumps(result))
        return 0

    hole = np.zeros((H, W), np.uint8)
    for m in mattes:
        hole |= (m > 0.02).astype(np.uint8)
    hole = cv2.dilate(hole, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (HOLE_GROW, HOLE_GROW)))
    smooth = 0.0 if source == "given" else SMOOTH
    bg = background_depth(cv2, np, depth, hole, smooth)

    say("4/5 painting in the plate")
    with Model(ort, args.inpaint_model, gpu, say) as model:
        plate = fill(cv2, np, model, rgb, hole)
        providers["inpaint"] = model.provider

    say("5/5 checking, and writing the files")
    alphas = [(m * 255).round().astype(np.uint8) for m in mattes]
    flags += check_cutouts(np, alphas, boxes, W, H)
    with Model(ort, args.people_model, gpu, say) as model:
        left_in_plate = person_boxes(cv2, np, model, cv2.cvtColor(plate, cv2.COLOR_RGB2BGR), 0.5)
    biggest = max(int((a > 128).sum()) for a in alphas)
    still = [b for b, _ in left_in_plate if b[2] * b[3] >= max(W * H * FLOOR, SHARE * biggest)]
    if still:
        flags.append(f"{len(still)} person-like shape(s) still found in the plate: someone may have been missed")
    if left_out:
        flags.append(f"{left_out} smaller figure(s) were left in the plate (under {int(SHARE * 100)}% of the largest, or past {args.max_cutouts})")

    temporary = f"{args.out_dir}.part"
    shutil.rmtree(temporary, ignore_errors=True)
    os.makedirs(temporary)
    try:
        save(cv2, np, os.path.join(temporary, "depth.png"), (bg * 255).round().astype(np.uint8), ".png", [cv2.IMWRITE_PNG_COMPRESSION, 9])
        save(cv2, np, os.path.join(temporary, "plate.jpg"), cv2.cvtColor(plate, cv2.COLOR_RGB2BGR), ".jpg", [cv2.IMWRITE_JPEG_QUALITY, 92])
        cutouts = []
        for k, (box, m, alpha) in enumerate(zip(boxes, mattes, alphas), start=1):
            rgba = np.dstack([rgb * (alpha > 0)[..., None], alpha]).astype(np.uint8)
            save(cv2, np, os.path.join(temporary, f"cutout-{k}.png"), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA), ".png", [cv2.IMWRITE_PNG_COMPRESSION, 9])
            value, how = person_depth(cv2, np, m, bg, depth, H)
            if how == "body" and not (m > 0.5).any():
                value = 0.5
            cutouts.append({"file": f"cutout-{k}.png", "box": box, "depth": round(value, 3), "how": how})
        save(cv2, np, os.path.join(temporary, "review.jpg"), review_sheet(cv2, np, rgb, boxes, alphas, plate, bg), ".jpg", [cv2.IMWRITE_JPEG_QUALITY, 84])
        os.replace(temporary, args.out_dir)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    heavy = providers.get("matte", "CPUExecutionProvider")
    result.update(
        written=True,
        folder=os.path.abspath(args.out_dir),
        depth_map="depth.png",
        plate="plate.jpg",
        review="review.jpg",
        cutouts=cutouts,
        flags=flags,
        source=source,
        provider=heavy,
        providers=providers,
        seconds=round(time.time() - started, 1),
    )
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
