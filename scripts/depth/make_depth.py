#!/usr/bin/env python3
"""A depth map for one picture, made on this machine with Depth Anything V2 (an ONNX file).

Normally you do not run this directly: `npm run depth -- <picture>` (scripts/make-depth.mjs) finds the picture,
downloads the model, keeps the old map and calls this. Two jobs:

  make (default)   a new map from the model. The same recipe as the film's own depth-only maps (scarlett-witness
                   `tools/make-depth-layers.py`), so the maps agree with the ones already in public/film/depth/:
                   the picture goes into the model squeezed to its square input, the answer is relative inverse depth
                   (0.5th to 99.5th percentile stretched to 0..1, white = near, black = far), softened by --smooth
                   (a sigma on a 480-wide copy, so surfaces stay smooth and the model's grain cannot bend straight
                   lines), and written at the picture's EXACT size, 8-bit grayscale PNG.

  --fit MAP        keep a map somebody already made (the director's, from Google's image tools, ...) and line it up
                   with the picture. The engine stretches a map over the whole picture, so a map of another shape, or
                   with a border, puts every edge in the wrong place and doubles thin things (poles, rails,
                   railings) as the camera moves. The model's depth is used only as a ruler: the map is scaled and
                   shifted until its edges sit on the picture's, then resampled at the picture's exact size. Its
                   detail is kept; nothing is softened or repainted.

A map on its own stretches PEOPLE like rubber. Pictures with people in them also need cut-outs and a background plate
(scarlett-witness `tools/make-depth-layers.py`); this script does the depth-only kind.

Needs numpy, opencv-python-headless and onnxruntime (`npm run depth:setup` installs them in .depth-venv).
It never touches the picture or the map it was given. It prints one JSON line last, which scripts/make-depth.mjs reads.
"""
from __future__ import annotations

import argparse
import contextlib
import gc
import io
import json
import os
import sys
import time

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
DEFAULT_INPUT = 518  # Depth Anything's square input, used when the model does not fix its own size
SMOOTH_WIDTH = 480  # the softening is done on a copy this wide
LOW_PERCENTILE, HIGH_PERCENTILE = 0.5, 99.5

FIT_WIDTH = 640  # the search for the fit is done on copies this wide
FIT_TRIM = 0.015  # a fitted map never reads the outer 1.5% of the map it was given (rounded corners, borders)
FIT_MAX_SCALE = 0.10  # looks for a scale within +-10% and a shift within +-8% of the picture
FIT_MAX_SHIFT = 0.08
FIT_MIN_GAIN = 0.04  # below this the map already lines up and is left alone
FIT_SMOOTH = 1.5  # softening of the model's depth when it is only a ruler


def fail(code, message, exit_code=2, **extra):
    print(json.dumps({"ok": False, "error": code, "message": message, **extra}))
    sys.exit(exit_code)


def load_libraries():
    try:
        import cv2
        import numpy as np
        import onnxruntime as ort
    except ImportError as error:  # the wrapper turns this into the exact setup hint
        fail("missing-python-packages", f"{error.name or error}: not installed", 3, module=error.name or "")
    return cv2, np, ort


def decode_file(cv2, np, path, flags):
    """Read an image through numpy so a path with accents or spaces works on Windows too."""
    try:
        raw = np.fromfile(path, dtype=np.uint8)
    except OSError as error:
        fail("cannot-read-image", f"{path}: {error}")
    image = cv2.imdecode(raw, flags)
    if image is None:
        fail("cannot-read-image", f"{path} is not an image OpenCV can read")
    return image


def read_rgb(cv2, np, path):
    return cv2.cvtColor(decode_file(cv2, np, path, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def read_gray01(cv2, np, path):
    """A depth map someone made, as float 0..1 (8- or 16-bit, gray or colour)."""
    raw = decode_file(cv2, np, path, cv2.IMREAD_UNCHANGED)
    if raw.ndim == 3:
        raw = cv2.cvtColor(raw[..., :3], cv2.COLOR_BGR2GRAY)
    return raw.astype(np.float32) / (65535.0 if raw.dtype == np.uint16 else 255.0)


# A tiny model (depth = brightness) used to find out whether the GPU can really be used, without loading a big one.
GPU_CHECK_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "tiny-depth.onnx")
# Why the GPU was not used, when it was asked for and a session ended up on the CPU. The workers put it in their answer.
GPU_NOTE = None
_dll_handles = []
_prepared = None


def nvidia_dll_dirs(roots, platform=None):
    """The folders pip's NVIDIA runtime packages (nvidia-cudnn-cu12 ...) keep their DLLs in: <site-packages>/nvidia/<name>/bin.
    Only Windows needs them found by hand."""
    platform = sys.platform if platform is None else platform
    if not str(platform).startswith("win"):
        return []
    found = []
    for root in roots:
        base = os.path.join(root, "nvidia")
        try:
            names = sorted(os.listdir(base))
        except OSError:
            continue
        for name in names:
            folder = os.path.join(base, name, "bin")
            if os.path.isdir(folder) and folder not in found:
                found.append(folder)
    return found


def prepare_gpu_libraries(ort):
    """Lets onnxruntime find CUDA and cuDNN: the NVIDIA pip packages' folders go on the DLL search path, and onnxruntime's own
    preload (onnxruntime 1.21+) loads them. Done once. Returns whatever the preload printed, for a diagnosis."""
    global _prepared
    if _prepared is not None:
        return _prepared
    roots = []
    try:
        import site

        roots = list(site.getsitepackages())
        user = site.getusersitepackages()
        if isinstance(user, str):
            roots.append(user)
    except Exception:  # noqa: BLE001
        pass
    for folder in nvidia_dll_dirs(roots):
        add = getattr(os, "add_dll_directory", None)
        if add:
            try:
                _dll_handles.append(add(folder))
            except OSError:
                pass
        os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")
    text = io.StringIO()
    preload = getattr(ort, "preload_dlls", None)
    if preload:
        try:
            with contextlib.redirect_stdout(text), contextlib.redirect_stderr(text):
                preload()
        except Exception as error:  # noqa: BLE001
            text.write(f"{type(error).__name__}: {error}\n")
    _prepared = text.getvalue().strip()
    return _prepared


def _one_line(message, limit=260):
    lines = [line.strip() for line in str(message).splitlines() if line.strip()]
    text = lines[0] if lines else ""
    return text if len(text) <= limit else text[: limit - 1] + "…"


def gpu_diagnosis(ort):
    """None when a session really runs on the GPU, else one line saying why not. The list of providers onnxruntime offers only
    says what it was BUILT with: whether CUDA and cuDNN can be loaded is only known by making a session."""
    if "CUDAExecutionProvider" not in ort.get_available_providers():
        return "this onnxruntime has no GPU support (it is the CPU package): run  npm run depth:setup -- --gpu"
    detail = prepare_gpu_libraries(ort)
    try:
        options = ort.SessionOptions()
        options.log_severity_level = 4
        session = ort.InferenceSession(GPU_CHECK_MODEL, options, providers=["CUDAExecutionProvider"])
        used = session.get_providers()
    except Exception as error:  # noqa: BLE001
        reason = _one_line(error)
        hint = next((line.strip() for line in detail.splitlines() if "dll" in line.lower() or "fail" in line.lower()), "")
        return reason if not hint else f"{reason} ({_one_line(hint, 160)})"
    if used and used[0] == "CUDAExecutionProvider":
        return None
    hint = _one_line(detail, 200)
    return "the CUDA and cuDNN libraries could not be loaded" + (f" ({hint})" if hint else "")


def make_session(ort, model, want_gpu):
    if not os.path.isfile(model):
        fail("no-model", f"no model file at {model}")
    options = ort.SessionOptions()
    options.log_severity_level = 3
    # Without this onnxruntime keeps every run's buffers (the film's own script ran a machine out of memory).
    options.enable_cpu_mem_arena = False
    global GPU_NOTE
    providers = ["CPUExecutionProvider"]
    if want_gpu and "CUDAExecutionProvider" in ort.get_available_providers():
        prepare_gpu_libraries(ort)
        providers.insert(0, "CUDAExecutionProvider")
    try:
        session = ort.InferenceSession(model, options, providers=providers)
    except Exception as error:  # a CUDA provider that cannot load its libraries: carry on on the CPU
        if providers[0] != "CPUExecutionProvider":
            GPU_NOTE = GPU_NOTE or _one_line(error, 200)
            session = ort.InferenceSession(model, options, providers=["CPUExecutionProvider"])
        else:
            fail("bad-model", f"{model}: {error}")
    used = session.get_providers()[0]
    if want_gpu and used != "CUDAExecutionProvider":
        # onnxruntime fell back to the CPU, usually without saying why: find out, so the person can be told
        GPU_NOTE = GPU_NOTE or gpu_diagnosis(ort) or "the GPU could not run this model"
        sys.stderr.write(f"  the GPU was not used ({GPU_NOTE}); using the CPU: the result is the same, only slower\n")
    return session, used


def depth_with_cpu_fallback(ort, cv2, np, model, want_gpu, rgb):
    """The picture's depth, and the provider that made it. If the GPU stops while running (a CUDA library that cannot load, no
    memory left) it is done again on the CPU: slower, same map. Loading the model on the GPU may already have fallen back."""
    session, provider = make_session(ort, model, want_gpu)
    try:
        return depth_of(cv2, np, session, rgb), provider
    except Exception as error:
        if provider == "CPUExecutionProvider":
            raise
        sys.stderr.write(f"  the GPU stopped ({str(error).strip().splitlines()[0][:200] if str(error).strip() else type(error).__name__}); doing it again on the CPU\n")
        session = None
        gc.collect()
        session, provider = make_session(ort, model, False)
        return depth_of(cv2, np, session, rgb), provider


def run_guarded(main):
    """Runs main(). A crash is answered like any other failure (one JSON line saying what went wrong), so the editor can show it,
    instead of a traceback and an exit code nobody sees."""
    try:
        code = main()
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        import traceback

        traceback.print_exc(file=sys.stderr)
        text = str(error).strip().splitlines()
        message = f"The worker crashed: {type(error).__name__}" + (f": {text[0][:300]}" if text else "")
        print(json.dumps({"ok": False, "error": "crashed", "message": message}))
        code = 1
    raise SystemExit(code)


def model_input_size(session):
    """(height, width) the model takes: the fixed size in its export, else Depth Anything's 518x518."""
    shape = session.get_inputs()[0].shape
    height, width = shape[-2], shape[-1]
    if isinstance(height, int) and isinstance(width, int):
        return height, width
    return DEFAULT_INPUT, DEFAULT_INPUT


def depth_of(cv2, np, session, rgb):
    """Relative inverse depth at the picture's size: float32 0..1, 1 = near."""
    picture_h, picture_w = rgb.shape[:2]
    in_h, in_w = model_input_size(session)
    shrinking = picture_h > in_h or picture_w > in_w
    squeezed = cv2.resize(rgb, (in_w, in_h), interpolation=cv2.INTER_AREA if shrinking else cv2.INTER_CUBIC)
    x = squeezed.astype(np.float32) / 255.0
    x = ((x - np.array(MEAN, np.float32)) / np.array(STD, np.float32)).transpose(2, 0, 1)[None].astype(np.float32)
    out = session.run(None, {session.get_inputs()[0].name: x})[0]
    d = np.squeeze(out).astype(np.float32)
    if d.ndim != 2:
        fail("bad-model-output", f"expected a 2-D depth image from the model, got shape {tuple(out.shape)}")
    low, high = np.percentile(d, [LOW_PERCENTILE, HIGH_PERCENTILE])
    if not high - low > 1e-9:
        fail("flat-depth", "the model returned a flat depth image for this picture")
    d = np.clip((d - low) / (high - low), 0.0, 1.0).astype(np.float32)
    return cv2.resize(d, (picture_w, picture_h), interpolation=cv2.INTER_CUBIC).clip(0.0, 1.0)


def soften(cv2, depth, smooth):
    """Blur a 480-wide copy by `smooth` and scale back up (what the film's depth-only maps do). 0 keeps the map as it is."""
    if smooth <= 0:
        return depth
    h, w = depth.shape
    small_w = min(SMOOTH_WIDTH, w)
    small_h = max(1, round(small_w * h / w))
    small = cv2.GaussianBlur(cv2.resize(depth, (small_w, small_h), interpolation=cv2.INTER_AREA), (0, 0), smooth)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC).clip(0.0, 1.0)


# ------------------------------------------------------------------------------------------ fitting a map

def structure(cv2, gray01, sigma=1.5):
    """Where the map changes: gradient size after a light blur (what an edge overlay would draw)."""
    blurred = cv2.GaussianBlur(gray01, (0, 0), sigma)
    return cv2.magnitude(cv2.Sobel(blurred, cv2.CV_32F, 1, 0), cv2.Sobel(blurred, cv2.CV_32F, 0, 1))


def warp_map(cv2, np, source, transform, width, height, trim=FIT_TRIM):
    """`source` resampled onto a width x height picture: picture point (x, y), as 0..1 of the picture, reads the map at
    (sx*x + tx, sy*y + ty). The outer `trim` of the map is never read, so a dark border is not copied in."""
    sx, tx, sy, ty = transform
    xs = np.clip(sx * ((np.arange(width) + 0.5) / width) + tx, trim, 1.0 - trim)
    ys = np.clip(sy * ((np.arange(height) + 0.5) / height) + ty, trim, 1.0 - trim)
    map_x = np.tile((xs * source.shape[1] - 0.5).astype(np.float32), (height, 1))
    map_y = np.tile((ys * source.shape[0] - 0.5).astype(np.float32)[:, None], (1, width))
    return cv2.remap(source, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def correlation(np, a, b, mask):
    a = a[mask]
    b = b[mask]
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-12))


def fit_transform(cv2, np, reference, candidate):
    """Where `candidate` (a depth map of any shape) sits on `reference` (a depth image already lined up with the picture).

    Returns {"transform": (sx, tx, sy, ty), "before": score, "after": score, "at_limit": bool}. The score is how well the
    two maps' edges agree plus half of how well their depth agrees (at most 1.5). The search starts from "as it plays
    today" (the map stretched over the picture) and walks scale and shift until the score stops rising."""
    ref_h, ref_w = reference.shape
    height = max(2, round(FIT_WIDTH * ref_h / ref_w))
    ref = cv2.resize(reference, (FIT_WIDTH, height), interpolation=cv2.INTER_AREA)
    ref_edges = structure(cv2, ref)
    mask = np.zeros((height, FIT_WIDTH), bool)
    mask[int(height * 0.05):int(height * 0.95), int(FIT_WIDTH * 0.05):int(FIT_WIDTH * 0.95)] = True

    def score(transform):
        warped = warp_map(cv2, np, candidate, transform, FIT_WIDTH, height)
        return (correlation(np, ref_edges, structure(cv2, warped), mask)
                + 0.5 * correlation(np, ref, cv2.GaussianBlur(warped, (0, 0), 1.0), mask))

    def allowed(t):
        return (1 - FIT_MAX_SCALE <= t[0] <= 1 + FIT_MAX_SCALE and 1 - FIT_MAX_SCALE <= t[2] <= 1 + FIT_MAX_SCALE
                and abs(t[1]) <= FIT_MAX_SHIFT and abs(t[3]) <= FIT_MAX_SHIFT)

    start = (1.0, 0.0, 1.0, 0.0)
    before = score(start)
    best, best_score = start, before
    # A coarse look at the horizontal scale and shift first (a different shape is mostly a horizontal matter) ...
    for sx in np.arange(0.94, 1.0601, 0.01):
        for tx in np.arange(-0.04, 0.0401, 0.01):
            candidate_score = score((float(sx), float(tx), 1.0, 0.0))
            if candidate_score > best_score:
                best, best_score = (float(sx), float(tx), 1.0, 0.0), candidate_score
    # ... then all four numbers, in smaller and smaller steps.
    for scale in (1.0, 0.5, 0.25, 0.125):
        improved = True
        while improved:
            improved = False
            for i in range(4):
                for direction in (-1, 1):
                    trial = list(best)
                    trial[i] += direction * 0.004 * scale
                    if not allowed(trial):
                        continue
                    trial_score = score(tuple(trial))
                    if trial_score > best_score + 1e-6:
                        best, best_score, improved = tuple(trial), trial_score, True
    at_limit = (abs(best[0] - 1) >= FIT_MAX_SCALE - 0.004 or abs(best[2] - 1) >= FIT_MAX_SCALE - 0.004
                or abs(best[1]) >= FIT_MAX_SHIFT - 0.004 or abs(best[3]) >= FIT_MAX_SHIFT - 0.004)
    return {"transform": best, "before": before, "after": best_score, "at_limit": at_limit}


def largest_shift(transform, width=1920):
    """How far, at most, the map's edges sit from the picture's (in pixels of a `width`-wide picture, 16:9)."""
    sx, tx, sy, ty = transform
    dx = max(abs(sx * x + tx - x) for x in (0.0, 0.5, 1.0)) * width
    dy = max(abs(sy * y + ty - y) for y in (0.0, 0.5, 1.0)) * width * 9 / 16
    return round(max(dx, dy), 1)


def edge_overlay(cv2, np, rgb, gray01):
    edges = cv2.Canny(cv2.GaussianBlur((gray01 * 255).astype(np.uint8), (0, 0), 1.2), 18, 45)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    out = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    out[edges > 0] = (0, 0, 255)
    return out


def write_png(cv2, np, path, gray01):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    ok, encoded = cv2.imencode(".png", (gray01 * 255.0 + 0.5).astype(np.uint8))
    if not ok:
        fail("cannot-write-map", f"could not encode {path}")
    encoded.tofile(path)  # numpy writes it, so a path with accents works on Windows


def write_check_image(cv2, np, path, rgb, before, after, label_before, label_after):
    """The picture twice, the map's edges in red: as the map plays now, and after the fit. Zoom in on thin things."""
    height, width = rgb.shape[:2]
    panel_w = min(width, 1600)
    panel_h = round(panel_w * height / width)
    panels = []
    for gray, label in ((before, label_before), (after, label_after)):
        panel = cv2.resize(edge_overlay(cv2, np, rgb, gray), (panel_w, panel_h), interpolation=cv2.INTER_AREA)
        cv2.putText(panel, label, (14, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2, cv2.LINE_AA)
        panels.append(panel)
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    ok, encoded = cv2.imencode(".jpg", np.vstack(panels), [cv2.IMWRITE_JPEG_QUALITY, 90])
    if ok:
        encoded.tofile(path)


# ------------------------------------------------------------------------------------------------- main

def main() -> int:
    if "--gpu-check" in sys.argv[1:]:
        # `make_depth.py --gpu-check`: can onnxruntime really use the GPU here? One JSON line. Used by the setup and the editor.
        _, _, ort = load_libraries()
        reason = gpu_diagnosis(ort)
        print(json.dumps({
            "ok": True,
            "gpu": reason is None,
            "reason": reason,
            "installed": "CUDAExecutionProvider" in ort.get_available_providers(),
            "onnxruntime": ort.__version__,
            "providers": ort.get_available_providers(),
        }))
        return 0

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("picture")
    parser.add_argument("--out", help="where to write the map (a .png); not needed with --dry-run")
    parser.add_argument("--model", required=True, help="a Depth Anything V2 .onnx file")
    parser.add_argument("--gpu", action="store_true", help="use the NVIDIA GPU when onnxruntime-gpu can")
    parser.add_argument("--smooth", type=float, default=None,
                        help="softening, a sigma on a 480-wide copy (0 = none). Default 3 for a new map, 0 for --fit (keeps the map's detail)")
    parser.add_argument("--fit", metavar="MAP", help="line this existing map up with the picture instead of making a new one")
    parser.add_argument("--dry-run", action="store_true", help="with --fit: measure and report, write nothing")
    parser.add_argument("--check-image", metavar="JPG", help="with --fit: also write the picture with the map's edges, before and after")
    args = parser.parse_args()
    if not args.out and not args.dry_run:
        parser.error("--out is needed (unless --dry-run)")
    if args.dry_run and not args.fit:
        parser.error("--dry-run is for --fit")

    started = time.time()
    cv2, np, ort = load_libraries()
    ort.set_default_logger_severity(3)
    rgb = read_rgb(cv2, np, args.picture)
    height, width = rgb.shape[:2]
    depth, provider = depth_with_cpu_fallback(ort, cv2, np, args.model, args.gpu, rgb)
    result = {
        "ok": True,
        "width": int(width),
        "height": int(height),
        "provider": provider,
        "model": os.path.basename(args.model),
    }

    if not args.fit:
        smooth = 3.0 if args.smooth is None else args.smooth
        final = soften(cv2, depth, smooth)
        write_png(cv2, np, args.out, final)
        result.update(mode="make", written=True, out=os.path.abspath(args.out), smooth=smooth,
                      near=round(float(final.max()), 3), far=round(float(final.min()), 3), mean=round(float(final.mean()), 3))
    else:
        candidate = read_gray01(cv2, np, args.fit)
        fit = fit_transform(cv2, np, soften(cv2, depth, FIT_SMOOTH), candidate)
        sx, tx, sy, ty = fit["transform"]
        gain = fit["after"] - fit["before"]
        result.update(
            mode="fit", map_width=int(candidate.shape[1]), map_height=int(candidate.shape[0]),
            transform={"sx": round(sx, 4), "tx": round(tx, 4), "sy": round(sy, 4), "ty": round(ty, 4)},
            score_before=round(fit["before"], 3), score_after=round(fit["after"], 3),
            largest_shift_px_1920=largest_shift(fit["transform"]),
            written=False, out=None,
        )
        if fit["at_limit"]:
            result.update(ok=False, error="no-fit", message="the best fit is at the edge of what is searched "
                          "(a scale within 10% and a shift within 8%); this map does not look like this picture")
        elif gain < FIT_MIN_GAIN:
            result.update(reason="already-fits")
        elif not args.dry_run:
            before = cv2.resize(candidate, (width, height), interpolation=cv2.INTER_CUBIC).clip(0.0, 1.0)
            fitted = warp_map(cv2, np, candidate, fit["transform"], width, height).clip(0.0, 1.0)
            if args.smooth:
                fitted = soften(cv2, fitted, args.smooth)
                result["smooth"] = args.smooth
            write_png(cv2, np, args.out, fitted)
            result.update(written=True, out=os.path.abspath(args.out))
            if args.check_image:
                write_check_image(cv2, np, args.check_image, rgb, before, fitted,
                                  "BEFORE: the map as it plays now", "AFTER: the same map, lined up")
                result["check_image"] = os.path.abspath(args.check_image)

    if args.gpu and provider != "CUDAExecutionProvider" and GPU_NOTE:
        result["gpu_note"] = GPU_NOTE
    result["seconds"] = round(time.time() - started, 1)
    print(json.dumps(result))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    run_guarded(main)
