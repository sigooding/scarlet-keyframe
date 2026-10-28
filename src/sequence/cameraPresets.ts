import bundledAudioDurations from "../data/audio-durations.json";
import type { AnyRecord, BeatAnimation, Key, Keyframe } from "../core/model";
import { clipFrames, FPS } from "../core/timing";

export interface SampledCameraPose {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}

export interface PictureRunInfo {
  runKeyId: string;
  runStartFrame: number;
  runEndFrame: number;
}

export type StarterPresetId =
  | "authored"
  | "still"
  | "pan-right"
  | "pan-left"
  | "slow-push"
  | "zoom-hold"
  | "dolly-right"
  | "dolly-left"
  | "dolly-zoom-push"
  | "dolly-zoom-pull"
  | "shake"
  | "depth-push"
  | "depth-truck-right"
  | "depth-truck-left"
  | "depth-drift";

export interface StarterPresetOption {
  id: StarterPresetId;
  label: string;
  group: "shot" | "preset" | "depth";
}

export const STARTER_PRESET_OPTIONS: readonly StarterPresetOption[] = [
  { id: "pan-right", label: "Pan right", group: "preset" },
  { id: "pan-left", label: "Pan left", group: "preset" },
  { id: "slow-push", label: "Slow push", group: "preset" },
  { id: "zoom-hold", label: "Zoom & hold", group: "preset" },
  { id: "dolly-right", label: "Dolly right", group: "preset" },
  { id: "dolly-left", label: "Dolly left", group: "preset" },
  { id: "dolly-zoom-push", label: "Dolly zoom push", group: "preset" },
  { id: "dolly-zoom-pull", label: "Dolly zoom pull", group: "preset" },
  { id: "shake", label: "Handheld shake", group: "preset" },
  { id: "depth-push", label: "Depth push", group: "depth" },
  { id: "depth-truck-right", label: "Depth truck right", group: "depth" },
  { id: "depth-truck-left", label: "Depth truck left", group: "depth" },
  { id: "depth-drift", label: "Depth drift", group: "depth" },
  { id: "still", label: "Still (clear move)", group: "shot" },
];

const DEFAULT_VOICE_DURATIONS: ReadonlyMap<string, number> = new Map(
  Object.entries(bundledAudioDurations as Record<string, number>),
);

const DEPTH_PUSH_FAR = 0.12;
const DEPTH_TRUCK = 0.08;

const SHAKE_STOPS: ReadonlyArray<{ p: number; x: number; y: number; r: number }> = [
  { p: 0.0, x: 0, y: 0, r: 0 },
  { p: 0.1, x: 1, y: -0.6, r: 1 },
  { p: 0.24, x: -0.9, y: 0.4, r: -0.7 },
  { p: 0.38, x: 0.5, y: 1, r: 0.5 },
  { p: 0.52, x: -0.6, y: -0.8, r: -0.4 },
  { p: 0.66, x: 0.7, y: 0.3, r: 0.8 },
  { p: 0.8, x: -0.4, y: 0.5, r: -0.6 },
  { p: 0.92, x: 0.2, y: -0.3, r: 1 },
  { p: 1.0, x: 0, y: 0, r: 0 },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function smoothstep01(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

function easeInOutCos(t: number): number {
  const u = clamp01(t);
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

function pingPong01(cycles: number): number {
  if (!Number.isFinite(cycles)) return 0;
  const mod = ((cycles % 2) + 2) % 2;
  return mod <= 1 ? mod : 2 - mod;
}

/**
 * Exact `settle(t, seconds)` curve from `DepthParallax` / `FrameDepthParallax`.
 */
export function depthSettle(tSec: number, seconds: number): number {
  const t = Math.max(0, tSec);
  const x = clamp01(t / Math.max(2, seconds));
  const lead = Math.min(1, t / 0.6);
  return (1 - Math.pow(1 - x, 3)) * lead * lead * (3 - 2 * lead);
}

function isNonStillPicture(src?: string): boolean {
  if (!src) return false;
  if (src.startsWith("video:")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(src);
}

function parsePositionPercent(value: unknown): [number, number] {
  if (typeof value !== "string" || !value.trim()) return [50, 50];
  const parts = value.trim().split(/\s+/);
  const parseAxis = (tok: string | undefined, axis: "x" | "y"): number => {
    if (!tok) return 50;
    const lower = tok.toLowerCase();
    if (lower === "center") return 50;
    if (axis === "x" && lower === "left") return 0;
    if (axis === "x" && lower === "right") return 100;
    if (axis === "y" && lower === "top") return 0;
    if (axis === "y" && lower === "bottom") return 100;
    const n = Number.parseFloat(lower);
    return Number.isFinite(n) ? clamp(n, 0, 100) : 50;
  };
  return [parseAxis(parts[0], "x"), parts.length > 1 ? parseAxis(parts[1], "y") : 50];
}

function roundKeyValue(n: number): number {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 0;
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

export function effectiveFrameCinematic(
  kf: Pick<Keyframe, "cinematic" | "beat" | "scene">,
): AnyRecord | undefined {
  return (kf.beat.cinematic || kf.cinematic || kf.scene.cinematic) as AnyRecord | undefined;
}

function evaluateEditWrapperMove(
  cinematic: AnyRecord,
  tSec: number,
): SampledCameraPose | null {
  const hasEditMove = Boolean(
    cinematic.startZoom !== undefined ||
      cinematic.endZoom !== undefined ||
      cinematic.zoom !== undefined ||
      cinematic.startFocalPoint ||
      cinematic.endFocalPoint,
  );
  if (!hasEditMove) return null;

  const startScaleRaw = Number(cinematic.startZoom ?? cinematic.zoom ?? 1);
  const endScaleRaw = Number(cinematic.endZoom ?? cinematic.zoom ?? 1);
  const startScale = Number.isFinite(startScaleRaw) && startScaleRaw > 0 ? startScaleRaw : 1;
  const endScale = Number.isFinite(endScaleRaw) && endScaleRaw > 0 ? endScaleRaw : 1;
  const [sx, sy] = parsePositionPercent(cinematic.startFocalPoint || cinematic.focalPoint);
  const [ex, ey] = parsePositionPercent(cinematic.endFocalPoint || cinematic.focalPoint);
  const startX = (50 - sx) * 0.14;
  const startY = (50 - sy) * 0.14;
  const endX = (50 - ex) * 0.14;
  const endY = (50 - ey) * 0.14;

  const dur = Math.max(0.1, Number(cinematic.zoomDuration) || 8);
  const easingName = String(cinematic.easing || "ease-in-out");
  const rawT = clamp01(tSec / dur);
  const u =
    easingName === "linear"
      ? rawT
      : easingName === "ease-out"
        ? easeOutCubic(rawT)
        : smoothstep01(rawT);

  const zoom = startScale + (endScale - startScale) * u;
  const tx = startX + (endX - startX) * u;
  const ty = startY + (endY - startY) * u;
  if (Math.abs(zoom - 1) < 1e-5 && Math.abs(tx) < 1e-5 && Math.abs(ty) < 1e-5) {
    return null;
  }
  return { zoom, x: zoom * tx, y: zoom * ty, rotation: 0 };
}

/**
 * Evaluates Scarlet Reel's flat camera preset (`pan`, `zoom-hold`, `dolly`, `dolly-zoom`, `shake`)
 * at `timeSec`. Returns `null` when there is no preset camera move (`!cinematic` or `mode === "static"`
 * without explicit edit zoom/focal move).
 */
export function evaluateLegacyPresetPose(
  cinematic: AnyRecord | undefined,
  timeSec: number,
): SampledCameraPose | null {
  if (!cinematic) return null;
  const t = Math.max(0, timeSec);
  const editMove = evaluateEditWrapperMove(cinematic, t);
  const rawMode = typeof cinematic.mode === "string" ? cinematic.mode : undefined;

  if (rawMode === "static") {
    return editMove;
  }

  const mode = rawMode || "pan";

  if (mode === "zoom-hold") {
    const zoomDur = Math.max(0.1, Number(cinematic.zoomDuration) || 8);
    const [fx, fy] =
      cinematic.focusX !== undefined || cinematic.focusY !== undefined
        ? [clamp(Number(cinematic.focusX ?? 50), 0, 100), clamp(Number(cinematic.focusY ?? 50), 0, 100)]
        : parsePositionPercent(cinematic.focalPoint);
    const endX = (50 - fx) * 0.14;
    const endY = (50 - fy) * 0.14;
    const u = easeOutCubic(t / (0.8 * zoomDur));
    const zoom = 1 + 0.22 * u;
    const tx = endX * u;
    const ty = endY * u;
    return { zoom, x: zoom * tx, y: zoom * ty, rotation: 0 };
  }

  if (mode === "dolly") {
    const dollyDur = Math.max(1, Number(cinematic.dollyDuration) || 10);
    const dist = Math.max(0, Number(cinematic.dollyDistance ?? 8));
    const dir = cinematic.dollyDirection === "left" ? -1 : 1;
    const vert = clamp(Number(cinematic.dollyVertical ?? 0), 0, 8);
    const u = smoothstep01(pingPong01(t / dollyDur));
    const x = -dist * dir + 2 * dist * dir * u;
    const y = -vert + 2 * vert * u;
    const zoom = Math.max(1.22, 1 + Math.max(Math.abs(x), Math.abs(y)) / 50);
    return { zoom, x, y, rotation: 0 };
  }

  if (mode === "dolly-zoom") {
    const dzDur = Math.max(1, Number(cinematic.dollyZoomDuration) || 8);
    const amount = Math.max(1, Number(cinematic.dollyZoomAmount) || 1.35);
    const dir = String(cinematic.dollyZoomDirection ?? "both");
    const fromScale = dir === "pull" ? amount : 1;
    const toScale = dir === "pull" ? 1 : amount;
    const u =
      dir === "push" || dir === "pull"
        ? smoothstep01(t / dzDur)
        : smoothstep01(pingPong01(t / dzDur));
    const scale = fromScale + (toScale - fromScale) * u;
    const [ox, oy] = parsePositionPercent(cinematic.dollyZoomOrigin);
    return {
      zoom: scale,
      x: (50 - ox) * (scale - 1),
      y: (50 - oy) * (scale - 1),
      rotation: 0,
    };
  }

  if (mode === "shake") {
    const shake = clamp(Number(cinematic.shakeAmount ?? 0.5), 0, 1);
    if (shake <= 0) return null;
    const shakeAmtPct = ((shake * 6) / 1920) * 100;
    const shakeRotDeg = Number(cinematic.shakeRotation ?? shake * 0.7);
    const shakeDur = Math.max(0.1, Number(cinematic.shakeDuration) || 0.5);
    const phase = (((t / shakeDur) % 1) + 1) % 1;
    let sx = 0;
    let sy = 0;
    let sr = 0;
    for (let i = 0; i < SHAKE_STOPS.length - 1; i += 1) {
      const a = SHAKE_STOPS[i];
      const b = SHAKE_STOPS[i + 1];
      if (phase >= a.p && phase <= b.p) {
        const w = b.p > a.p ? (phase - a.p) / (b.p - a.p) : 0;
        sx = (a.x + (b.x - a.x) * w) * shakeAmtPct;
        sy = (a.y + (b.y - a.y) * w) * shakeAmtPct;
        sr = (a.r + (b.r - a.r) * w) * shakeRotDeg;
        break;
      }
    }
    return { zoom: 1.06, x: sx, y: sy, rotation: sr };
  }

  if (mode === "pan") {
    if (editMove) return editMove;
    const panDur = Math.max(0.1, Number(cinematic.zoomDuration) || 14);
    const panDist = Math.max(0, Number(cinematic.panDistance ?? 0));
    const panX = cinematic.panDirection === "left" ? -panDist : panDist;
    const u = smoothstep01(t / panDur);
    const zoom = 1.12 + 0.04 * u;
    const tx = -0.5 * panX + 1.5 * panX * u;
    return { zoom, x: zoom * tx, y: 0, rotation: 0 };
  }

  return editMove;
}

/**
 * Evaluates Scarlet Reel's 2.5D depth camera move (`truck`, `push`, `drift`) at `timeSec`
 * expressed in camera keyframe coordinates (`zoom` = far-plane push, `x`/`y` = `uShift * 100`),
 * matching `FrameDepthParallax` bit-for-bit.
 */
export function evaluateLegacyDepthPose(
  cinematic: AnyRecord | undefined,
  timeSec: number,
  ignoreDepthMapCheck = false,
): SampledCameraPose | null {
  if (!cinematic) return null;
  if (!ignoreDepthMapCheck && !cinematic.depthMap) return null;

  const motion =
    cinematic.depthMotion === "push" ||
    cinematic.depthMotion === "drift" ||
    cinematic.depthMotion === "truck"
      ? cinematic.depthMotion
      : "truck";
  const amount =
    typeof cinematic.depthAmount === "number" && Number.isFinite(cinematic.depthAmount)
      ? clamp(cinematic.depthAmount, 0, 1)
      : 0.4;
  if (amount <= 0) return null;

  const direction = cinematic.depthDirection === "left" ? -1 : 1;
  const seconds = Math.max(2, Number(cinematic.depthSeconds ?? 14));
  const t = Math.max(0, timeSec);

  if (motion === "push") {
    const p = depthSettle(t, seconds);
    return {
      zoom: 1 + amount * DEPTH_PUSH_FAR * p,
      x: 0,
      y: 0,
      rotation: 0,
    };
  }

  if (motion === "truck") {
    const slide = amount * DEPTH_TRUCK * depthSettle(t, seconds) * direction;
    return {
      zoom: 1,
      x: slide * 100,
      y: 0,
      rotation: 0,
    };
  }

  // drift
  const grow = easeInOutCos(t / 2);
  const slide =
    amount * DEPTH_TRUCK * 0.5 * grow * Math.sin((2 * Math.PI * t) / seconds) * direction;
  return {
    zoom: 1,
    x: slide * 100,
    y: 0,
    rotation: 0,
  };
}

/**
 * Evaluates whichever single legacy camera move (`depth` move or `preset` move) applied to a shot
 * before keyframe conversion. Returns `null` if the shot has no camera move (still picture).
 */
export function evaluateLegacyShotMove(
  cinematic: AnyRecord | undefined,
  picture: string | undefined,
  timeSec: number,
): SampledCameraPose | null {
  if (isNonStillPicture(picture)) return null;
  const isGradient = Boolean(picture && picture.startsWith("gradient:"));
  if (!isGradient && picture && cinematic?.depthMap && cinematic.mode !== "dolly") {
    return evaluateLegacyDepthPose(cinematic, timeSec);
  }
  return evaluateLegacyPresetPose(cinematic, timeSec);
}

export function describeAuthoredMove(cinematic: AnyRecord | undefined, picture?: string): string | null {
  if (!cinematic || isNonStillPicture(picture)) return null;
  const isGradient = Boolean(picture && picture.startsWith("gradient:"));
  if (!isGradient && picture && cinematic.depthMap && cinematic.mode !== "dolly") {
    const motion =
      cinematic.depthMotion === "push" || cinematic.depthMotion === "drift"
        ? cinematic.depthMotion
        : "truck";
    const dir =
      motion === "truck"
        ? cinematic.depthDirection === "left"
          ? " left"
          : " right"
        : "";
    return `Depth ${motion}${dir}`;
  }
  const rawMode = typeof cinematic.mode === "string" ? cinematic.mode : undefined;
  if (rawMode === "static") {
    return evaluateEditWrapperMove(cinematic, 1) ? "Custom zoom" : null;
  }
  const mode = rawMode || "pan";
  if (mode === "pan") {
    if (evaluateEditWrapperMove(cinematic, 1)) return "Custom zoom";
    const dist = Number(cinematic.panDistance ?? 0);
    if (dist <= 0) return "Slow push";
    return `Pan ${cinematic.panDirection === "left" ? "left" : "right"}`;
  }
  if (mode === "zoom-hold") return "Zoom & hold";
  if (mode === "dolly") return `Dolly ${cinematic.dollyDirection === "left" ? "left" : "right"}`;
  if (mode === "dolly-zoom") {
    return `Dolly zoom ${cinematic.dollyZoomDirection === "pull" ? "pull" : "push"}`;
  }
  if (mode === "shake") return "Handheld shake";
  return null;
}

/**
 * Sample indices every `step` frames (`6`) starting at `0` and always ending at `lastFrame`.
 */
export function sampleFramesEverySix(durationFrames: number, step = 6): number[] {
  const lastFrame = Math.max(0, Math.round(durationFrames) - 1);
  if (lastFrame === 0) return [0];
  const frames: number[] = [];
  for (let f = 0; f < lastFrame; f += step) {
    frames.push(f);
  }
  frames.push(lastFrame);
  return frames;
}

/**
 * Ramer-Douglas-Peucker simplification on sampled `(frame, value)` points:
 * drops any keyframe that a straight line between its kept neighbours reproduces within `0.5%`.
 * Returns `[]` when the channel stays at `defaultValue`, or `[frame 0]` when constant non-default.
 */
export function simplifyChannelSamples(
  samples: ReadonlyArray<{ frame: number; value: number }>,
  defaultValue: number,
  toleranceRatio = 0.005,
): Key[] {
  if (samples.length === 0) return [];
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const s of samples) {
    if (s.value < minVal) minVal = s.value;
    if (s.value > maxVal) maxVal = s.value;
  }
  const span = maxVal - minVal;
  if (span <= 1e-6) {
    if (Math.abs(samples[0].value - defaultValue) <= 1e-6) {
      return [];
    }
    return [{ frame: 0, value: roundKeyValue(samples[0].value), easing: "linear" }];
  }

  const tol = Math.max(1e-6, toleranceRatio * span);
  const keep = new Uint8Array(samples.length);
  keep[0] = 1;
  keep[samples.length - 1] = 1;

  const subdivide = (startIdx: number, endIdx: number): void => {
    if (endIdx - startIdx <= 1) return;
    const a = samples[startIdx];
    const b = samples[endIdx];
    const df = b.frame - a.frame;
    if (df <= 0) return;

    let maxErr = -1;
    let splitIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const p = samples[i];
      const interp = a.value + ((b.value - a.value) * (p.frame - a.frame)) / df;
      const err = Math.abs(p.value - interp);
      if (err > maxErr) {
        maxErr = err;
        splitIdx = i;
      }
    }

    if (maxErr > tol && splitIdx > startIdx && splitIdx < endIdx) {
      keep[splitIdx] = 1;
      subdivide(startIdx, splitIdx);
      subdivide(splitIdx, endIdx);
    }
  };

  subdivide(0, samples.length - 1);

  const out: Key[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    if (keep[i]) {
      out.push({
        frame: samples[i].frame,
        value: roundKeyValue(samples[i].value),
        easing: "linear",
      });
    }
  }
  return out;
}

/**
 * Samples `evalAtLocalFrame` every 6 frames over `durationFrames`, simplifies within `0.5%`,
 * and writes `zoom`/`x`/`y`/`rotation` onto `baseAnimation` while preserving non-camera channels.
 */
export function buildCameraKeyframesFromEvaluator(
  evalAtLocalFrame: (localFrame: number) => SampledCameraPose,
  durationFrames: number,
  baseAnimation?: BeatAnimation,
): BeatAnimation | undefined {
  const sampleFrames = sampleFramesEverySix(durationFrames, 6);
  const zoomSamples: Array<{ frame: number; value: number }> = [];
  const xSamples: Array<{ frame: number; value: number }> = [];
  const ySamples: Array<{ frame: number; value: number }> = [];
  const rotSamples: Array<{ frame: number; value: number }> = [];

  for (const frame of sampleFrames) {
    const pose = evalAtLocalFrame(frame);
    zoomSamples.push({ frame, value: pose.zoom });
    xSamples.push({ frame, value: pose.x });
    ySamples.push({ frame, value: pose.y });
    rotSamples.push({ frame, value: pose.rotation });
  }

  const zoomKeys = simplifyChannelSamples(zoomSamples, 1, 0.005);
  const xKeys = simplifyChannelSamples(xSamples, 0, 0.005);
  const yKeys = simplifyChannelSamples(ySamples, 0, 0.005);
  const rotKeys = simplifyChannelSamples(rotSamples, 0, 0.005);

  const next: BeatAnimation = {};
  if (zoomKeys.length) next.zoom = zoomKeys;
  if (xKeys.length) next.x = xKeys;
  if (yKeys.length) next.y = yKeys;
  if (rotKeys.length) next.rotation = rotKeys;

  // Preserve non-camera channels (`opacity`, `blur`, `exposure`, `gradeStrength`, `depthAmount`).
  if (baseAnimation) {
    for (const prop of ["opacity", "blur", "exposure", "gradeStrength", "depthAmount"] as const) {
      if (baseAnimation[prop]?.length) {
        next[prop] = baseAnimation[prop]!.map((k) => ({ ...k }));
      }
    }
    if (baseAnimation.values) {
      const restValues = { ...baseAnimation.values };
      delete restValues.zoom;
      delete restValues.x;
      delete restValues.y;
      delete restValues.rotation;
      if (Object.keys(restValues).length > 0) {
        next.values = restValues;
      }
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function hasHandEditedCamera(anim: BeatAnimation | undefined): boolean {
  if (!anim) return false;
  if (anim.kenBurns) return true;
  if (
    anim.zoom?.length ||
    anim.x?.length ||
    anim.y?.length ||
    anim.rotation?.length
  ) {
    return true;
  }
  const v = anim.values;
  if (
    v &&
    (typeof v.zoom === "number" ||
      typeof v.x === "number" ||
      typeof v.y === "number" ||
      typeof v.rotation === "number")
  ) {
    return true;
  }
  return false;
}

/**
 * Computes continuous shared-picture runs across consecutive carried beats (`presetFrame` runs).
 * Continuous time applies whether or not any clip in the run has keyframes.
 */
export function computePictureRunsForFrames(
  frames: ReadonlyArray<Keyframe>,
  durations: ReadonlyArray<number>,
): PictureRunInfo[] {
  const runs: PictureRunInfo[] = [];
  let cursor = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const kf = frames[i];
    const dur = Math.max(1, durations[i] ?? 1);
    const startFrame = cursor;
    const endFrame = cursor + dur;
    cursor = endFrame;

    const prev = i > 0 ? frames[i - 1] : undefined;
    const cin = effectiveFrameCinematic(kf) || {};
    const prevCin = prev ? effectiveFrameCinematic(prev) || {} : undefined;

    const canContinue =
      Boolean(prev) &&
      !kf.beat.gap &&
      !prev!.beat.gap &&
      Boolean(kf.carried) &&
      Boolean(kf.picture) &&
      kf.picture === prev!.picture &&
      String(cin.mode ?? "pan") === String(prevCin?.mode ?? "pan") &&
      String(cin.depthMap ?? "") === String(prevCin?.depthMap ?? "") &&
      String(cin.depthMotion ?? "") === String(prevCin?.depthMotion ?? "");

    if (canContinue) {
      const shared = runs[i - 1];
      shared.runEndFrame = endFrame;
      runs.push(shared);
    } else {
      runs.push({
        runKeyId: kf.id,
        runStartFrame: startFrame,
        runEndFrame: endFrame,
      });
    }
  }
  return runs;
}

/**
 * Converts every un-keyframed shot's preset or depth move in `frames` into `zoom`/`x`/`y`/`rotation`
 * keyframes in place on `frame.beat.animation`. Shots already edited by hand keep their keyframes,
 * and shots with no move keep no camera keyframes (still picture).
 * Returns the number of beats whose camera moves were converted.
 */
export function convertFramesCameraMovesToKeyframes(
  frames: ReadonlyArray<Keyframe>,
  voiceSecondsByRef: ReadonlyMap<string, number> = DEFAULT_VOICE_DURATIONS,
  pace = 1,
): number {
  const durations = frames.map((kf) => {
    const audioRef = kf.beat.audioUrl;
    const measured =
      audioRef !== undefined
        ? (voiceSecondsByRef.get(audioRef) ?? DEFAULT_VOICE_DURATIONS.get(audioRef))
        : undefined;
    return clipFrames(kf, measured, pace);
  });

  const runs = computePictureRunsForFrames(frames, durations);
  let startCursor = 0;
  let convertedCount = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const kf = frames[i];
    const durationFrames = durations[i];
    const clipStartFrame = startCursor;
    startCursor += durationFrames;

    if (kf.beat.gap) continue;
    if (hasHandEditedCamera(kf.beat.animation)) continue;

    const cin = effectiveFrameCinematic(kf);
    const run = runs[i];
    const runOffsetFrames = Math.max(0, clipStartFrame - run.runStartFrame);

    const probe = evaluateLegacyShotMove(cin, kf.picture, runOffsetFrames / FPS);
    if (!probe) continue;

    const nextAnim = buildCameraKeyframesFromEvaluator(
      (localFrame) =>
        evaluateLegacyShotMove(cin, kf.picture, (runOffsetFrames + localFrame) / FPS) ?? {
          zoom: 1,
          x: 0,
          y: 0,
          rotation: 0,
        },
      durationFrames,
      kf.beat.animation,
    );

    if (nextAnim) {
      kf.beat.animation = nextAnim;
    } else {
      delete kf.beat.animation;
    }
    convertedCount += 1;
  }

  return convertedCount;
}

/**
 * Builds `BeatAnimation` for Inspector's `"Start from preset"` menu on a single shot.
 */
export function buildStarterPresetAnimation(
  presetId: StarterPresetId,
  frame: Keyframe,
  durationFrames: number,
  options?: {
    presetOffsetFrames?: number;
  },
): BeatAnimation | undefined {
  const base = frame.beat.animation;
  if (presetId === "still") {
    return buildCameraKeyframesFromEvaluator(
      () => ({ zoom: 1, x: 0, y: 0, rotation: 0 }),
      durationFrames,
      base,
    );
  }

  const cin = effectiveFrameCinematic(frame);
  const authoredDepthAmt =
    typeof cin?.depthAmount === "number" && Number.isFinite(cin.depthAmount) && cin.depthAmount > 0
      ? clamp(cin.depthAmount, 0, 1)
      : 0.4;
  const shotSeconds = Math.max(2, Number(cin?.depthSeconds ?? Math.max(4, durationFrames / FPS)));

  if (presetId === "authored") {
    const offset = options?.presetOffsetFrames ?? 0;
    const probe = evaluateLegacyShotMove(cin, frame.picture, offset / FPS);
    if (!probe) {
      return buildCameraKeyframesFromEvaluator(
        () => ({ zoom: 1, x: 0, y: 0, rotation: 0 }),
        durationFrames,
        base,
      );
    }
    return buildCameraKeyframesFromEvaluator(
      (localFrame) =>
        evaluateLegacyShotMove(cin, frame.picture, (offset + localFrame) / FPS) ?? {
          zoom: 1,
          x: 0,
          y: 0,
          rotation: 0,
        },
      durationFrames,
      base,
    );
  }

  const syntheticCinematicForPreset = (): { cin: AnyRecord; isDepth: boolean } => {
    switch (presetId) {
      case "pan-right":
        return { cin: { mode: "pan", panDirection: "right", panDistance: 5, zoomDuration: 12 }, isDepth: false };
      case "pan-left":
        return { cin: { mode: "pan", panDirection: "left", panDistance: 5, zoomDuration: 12 }, isDepth: false };
      case "slow-push":
        return { cin: { mode: "pan", panDistance: 0, zoomDuration: Math.max(4, durationFrames / FPS) }, isDepth: false };
      case "zoom-hold":
        return {
          cin: {
            mode: "zoom-hold",
            focalPoint: cin?.focalPoint ?? "50% 50%",
            zoomDuration: Math.max(4, (durationFrames / FPS) * 1.1),
          },
          isDepth: false,
        };
      case "dolly-right":
        return { cin: { mode: "dolly", dollyDirection: "right", dollyDistance: 6, dollyDuration: 10 }, isDepth: false };
      case "dolly-left":
        return { cin: { mode: "dolly", dollyDirection: "left", dollyDistance: 6, dollyDuration: 10 }, isDepth: false };
      case "dolly-zoom-push":
        return { cin: { mode: "dolly-zoom", dollyZoomDirection: "push", dollyZoomAmount: 1.35, dollyZoomDuration: Math.max(2.5, durationFrames / FPS) }, isDepth: false };
      case "dolly-zoom-pull":
        return { cin: { mode: "dolly-zoom", dollyZoomDirection: "pull", dollyZoomAmount: 1.35, dollyZoomDuration: Math.max(2.5, durationFrames / FPS) }, isDepth: false };
      case "shake":
        return { cin: { mode: "shake", shakeAmount: 0.45, shakeDuration: 0.6 }, isDepth: false };
      case "depth-push":
        return { cin: { depthMotion: "push", depthAmount: authoredDepthAmt, depthSeconds: shotSeconds }, isDepth: true };
      case "depth-truck-right":
        return { cin: { depthMotion: "truck", depthDirection: "right", depthAmount: authoredDepthAmt, depthSeconds: shotSeconds }, isDepth: true };
      case "depth-truck-left":
        return { cin: { depthMotion: "truck", depthDirection: "left", depthAmount: authoredDepthAmt, depthSeconds: shotSeconds }, isDepth: true };
      case "depth-drift":
        return { cin: { depthMotion: "drift", depthDirection: "right", depthAmount: authoredDepthAmt, depthSeconds: shotSeconds }, isDepth: true };
    }
  };

  const spec = syntheticCinematicForPreset();
  return buildCameraKeyframesFromEvaluator(
    (localFrame) => {
      const tSec = localFrame / FPS;
      const pose = spec.isDepth
        ? evaluateLegacyDepthPose(spec.cin, tSec, true)
        : evaluateLegacyPresetPose(spec.cin, tSec);
      return pose ?? { zoom: 1, x: 0, y: 0, rotation: 0 };
    },
    durationFrames,
    base,
  );
}
