import type {
  BeatAnimation,
  BeatAnimValues,
  BeatLike,
  CubicBezierTuple,
  KenBurnsBox,
  Key,
  KeyEasing,
  Keyframe,
} from "../core/model";
import { clipFrames, FPS, formatTimecode, MIN_CLIP_FRAMES, sceneProseFrames } from "../core/timing";
import {
  computePictureRunsForFrames,
  type PictureRunInfo,
} from "./cameraPresets";

export * from "./cameraPresets";
export type { BeatAnimation, BeatAnimValues, CubicBezierTuple, KenBurnsBox, Key, KeyEasing };
export { clipFrames, FPS, formatTimecode, MIN_CLIP_FRAMES };

export const ANIM_PROPS = [
  "zoom",
  "x",
  "y",
  "rotation",
  "opacity",
  "blur",
  "exposure",
  "gradeStrength",
  "depthAmount",
] as const;

export type AnimProp = (typeof ANIM_PROPS)[number];

export interface AnimPropMeta {
  prop: AnimProp;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
  decimals: number;
  suffix: string;
  color: string;
}

export const ANIM_PROP_META: Record<AnimProp, AnimPropMeta> = {
  zoom: {
    prop: "zoom",
    label: "Zoom",
    shortLabel: "Zoom",
    min: 1,
    max: 5,
    defaultValue: 1,
    step: 0.01,
    decimals: 2,
    suffix: "×",
    color: "#e8a24a",
  },
  x: {
    prop: "x",
    label: "Position X",
    shortLabel: "Pos X",
    min: -200,
    max: 200,
    defaultValue: 0,
    step: 0.5,
    decimals: 1,
    suffix: "%",
    color: "#52b6ec",
  },
  y: {
    prop: "y",
    label: "Position Y",
    shortLabel: "Pos Y",
    min: -200,
    max: 200,
    defaultValue: 0,
    step: 0.5,
    decimals: 1,
    suffix: "%",
    color: "#6ad99c",
  },
  rotation: {
    prop: "rotation",
    label: "Rotation",
    shortLabel: "Rotate",
    min: -180,
    max: 180,
    defaultValue: 0,
    step: 0.5,
    decimals: 1,
    suffix: "°",
    color: "#f2789f",
  },
  opacity: {
    prop: "opacity",
    label: "Opacity",
    shortLabel: "Opacity",
    min: 0,
    max: 1,
    defaultValue: 1,
    step: 0.01,
    decimals: 2,
    suffix: "",
    color: "#e9e2d0",
  },
  blur: {
    prop: "blur",
    label: "Blur",
    shortLabel: "Blur",
    min: 0,
    max: 20,
    defaultValue: 0,
    step: 0.1,
    decimals: 1,
    suffix: "px",
    color: "#95a7ff",
  },
  exposure: {
    prop: "exposure",
    label: "Exposure",
    shortLabel: "Expos",
    min: -2,
    max: 2,
    defaultValue: 0,
    step: 0.05,
    decimals: 2,
    suffix: " EV",
    color: "#ffd166",
  },
  gradeStrength: {
    prop: "gradeStrength",
    label: "Grade strength",
    shortLabel: "Grade",
    min: 0,
    max: 1,
    defaultValue: 1,
    step: 0.01,
    decimals: 2,
    suffix: "",
    color: "#c792ea",
  },
  depthAmount: {
    prop: "depthAmount",
    label: "Depth amount",
    shortLabel: "Depth",
    min: 0,
    max: 1,
    defaultValue: 0.4,
    step: 0.01,
    decimals: 2,
    suffix: "",
    color: "#4dd0e1",
  },
};

export const DEFAULT_BEZIER: CubicBezierTuple = [0.25, 0.1, 0.25, 1];
export const CSS_EASE_IN_BEZIER: CubicBezierTuple = [0.42, 0, 1, 1];
export const CSS_EASE_OUT_BEZIER: CubicBezierTuple = [0, 0, 0.58, 1];
export const CSS_EASE_IN_OUT_BEZIER: CubicBezierTuple = [0.42, 0, 0.58, 1];

export interface EvaluatedPose {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  blur: number;
  exposure: number;
  gradeStrength: number;
  depthAmount: number;
}

export interface TimelineClip {
  keyframe: Keyframe;
  index: number;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
  voiceFrames: number;
  voiceInFrame: number;
  voiceOutFrame: number;
  carriedStartPose?: EvaluatedPose;
}

export type AnimatableClip =
  | TimelineClip
  | Keyframe
  | BeatLike
  | BeatAnimation
  | null
  | undefined;

export function extractAnimation(clip: AnimatableClip): BeatAnimation | undefined {
  if (!clip || typeof clip !== "object") return undefined;
  if ("keyframe" in clip && clip.keyframe?.beat) return clip.keyframe.beat.animation;
  if ("beat" in clip && clip.beat && typeof clip.beat === "object") {
    return (clip.beat as BeatLike).animation;
  }
  if ("animation" in clip) return (clip as BeatLike).animation;
  return clip as BeatAnimation;
}

function extractAuthoredDepthAmount(clip: AnimatableClip): number {
  if (!clip || typeof clip !== "object") return ANIM_PROP_META.depthAmount.defaultValue;
  let raw: unknown;
  if ("keyframe" in clip && clip.keyframe) {
    raw =
      clip.keyframe.beat?.cinematic?.depthAmount ??
      clip.keyframe.cinematic?.depthAmount ??
      clip.keyframe.scene?.cinematic?.depthAmount;
  } else if ("beat" in clip && clip.beat && typeof clip.beat === "object") {
    const kf = clip as Keyframe;
    raw =
      kf.beat?.cinematic?.depthAmount ??
      kf.cinematic?.depthAmount ??
      kf.scene?.cinematic?.depthAmount;
  } else if ("cinematic" in clip && (clip as BeatLike).cinematic) {
    raw = (clip as BeatLike).cinematic?.depthAmount;
  }
  const num = Number(raw);
  if (Number.isFinite(num)) return Math.max(0, Math.min(1, num));
  return ANIM_PROP_META.depthAmount.defaultValue;
}

export function defaultValueForProp(prop: AnimProp, clip?: AnimatableClip): number {
  if (prop === "depthAmount") return extractAuthoredDepthAmount(clip);
  return ANIM_PROP_META[prop].defaultValue;
}

export function hasAnimationKeyframes(clip: AnimatableClip): boolean {
  const anim = extractAnimation(clip);
  if (!anim) return false;
  return ANIM_PROPS.some((prop) => Boolean(anim[prop]?.length));
}

export function hasPropKeyframes(clip: AnimatableClip, prop: AnimProp): boolean {
  const anim = extractAnimation(clip);
  return Boolean(anim?.[prop]?.length);
}

export function hasPlainValues(clip: AnimatableClip): boolean {
  const anim = extractAnimation(clip);
  if (!anim?.values) return false;
  return ANIM_PROPS.some((prop) => typeof anim.values?.[prop] === "number" && Number.isFinite(anim.values[prop]));
}

export function hasPlainTransform(clip: AnimatableClip): boolean {
  const anim = extractAnimation(clip);
  const v = anim?.values;
  if (!v) return false;
  return (
    (typeof v.zoom === "number" && v.zoom !== 1) ||
    (typeof v.x === "number" && v.x !== 0) ||
    (typeof v.y === "number" && v.y !== 0) ||
    (typeof v.rotation === "number" && v.rotation !== 0)
  );
}

export function hasTransformKeyframes(clip: AnimatableClip): boolean {
  const anim = extractAnimation(clip);
  if (!anim) return false;
  return Boolean(
    anim.zoom?.length || anim.x?.length || anim.y?.length || anim.rotation?.length,
  );
}

export function hasCustomTransform(clip: AnimatableClip): boolean {
  return hasTransformKeyframes(clip) || hasPlainTransform(clip);
}

export function animatedPropsOf(animation: BeatAnimation | undefined): AnimProp[] {
  if (!animation) return [];
  return ANIM_PROPS.filter((prop) => Boolean(animation[prop]?.length));
}

/**
 * Parses `"cubic-bezier(x1, y1, x2, y2)"` into `[x1, y1, x2, y2]` if valid.
 */
export function parseCubicBezierString(raw: unknown): CubicBezierTuple | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^cubic-bezier\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*\)$/i.exec(
    raw.trim(),
  );
  if (!match) return undefined;
  const nums = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  return [
    Math.max(0, Math.min(1, nums[0])),
    nums[1],
    Math.max(0, Math.min(1, nums[2])),
    nums[3],
  ];
}

export function normalizeBezierTuple(tuple: unknown): CubicBezierTuple | undefined {
  if (!Array.isArray(tuple) || tuple.length < 4) return undefined;
  const x1 = Number(tuple[0]);
  const y1 = Number(tuple[1]);
  const x2 = Number(tuple[2]);
  const y2 = Number(tuple[3]);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return undefined;
  return [
    Math.max(0, Math.min(1, Math.round(x1 * 10000) / 10000)),
    Math.round(y1 * 10000) / 10000,
    Math.max(0, Math.min(1, Math.round(x2 * 10000) / 10000)),
    Math.round(y2 * 10000) / 10000,
  ];
}

export function resolveKeyBezier(key: Pick<Key, "easing" | "bezier">): CubicBezierTuple {
  if (key.bezier) {
    const norm = normalizeBezierTuple(key.bezier);
    if (norm) return norm;
  }
  const fromStr = parseCubicBezierString(key.easing);
  if (fromStr) return fromStr;
  switch (key.easing) {
    case "ease-in":
      return [...CSS_EASE_IN_BEZIER];
    case "ease-out":
      return [...CSS_EASE_OUT_BEZIER];
    case "ease-in-out":
      return [...CSS_EASE_IN_OUT_BEZIER];
    case "bezier":
      return [...DEFAULT_BEZIER];
    default:
      return [0.25, 0.25, 0.75, 0.75];
  }
}

/**
 * Evaluates a CSS `cubic-bezier(x1, y1, x2, y2)` at normalized time `x` in `[0, 1]`
 * exactly as CSS engines (WebKit/Blink UnitBezier) do:
 * solves `Bx(u) = x` for parameter `u` via Newton-Raphson with bisection fallback,
 * then returns `By(u)`.
 */
export function solveCubicBezier(
  rawX1: number,
  y1: number,
  rawX2: number,
  y2: number,
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const x1 = Math.max(0, Math.min(1, rawX1));
  const x2 = Math.max(0, Math.min(1, rawX2));
  if (x1 === y1 && x2 === y2) return x;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleCurveY = (u: number) => ((ay * u + by) * u + cy) * u;
  const sampleCurveDerivativeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  const EPSILON = 1e-11;

  // 1. Newton-Raphson iterations
  let u = x;
  let solved = false;
  for (let i = 0; i < 12; i += 1) {
    const xErr = sampleCurveX(u) - x;
    if (Math.abs(xErr) < EPSILON) {
      solved = true;
      break;
    }
    const dx = sampleCurveDerivativeX(u);
    if (Math.abs(dx) < 1e-6) break;
    const nextU = u - xErr / dx;
    if (nextU < 0 || nextU > 1) break;
    u = nextU;
  }

  // 2. Bisection fallback on [0, 1] when slope is near zero or Newton stepped out of bounds
  if (!solved && Math.abs(sampleCurveX(u) - x) >= EPSILON) {
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 40; i += 1) {
      const xEst = sampleCurveX(u);
      const err = xEst - x;
      if (Math.abs(err) < EPSILON) break;
      if (err < 0) lo = u;
      else hi = u;
      u = 0.5 * (lo + hi);
    }
  }

  return sampleCurveY(u);
}

export function evaluateKeyEasing(key: Pick<Key, "easing" | "bezier">, rawT: number): number {
  const t = Math.max(0, Math.min(1, rawT));
  if (key.easing === "hold") return 0;
  if (key.easing === "linear") return t;
  if (key.easing === "ease-in-out" && !key.bezier) {
    return t * t * (3 - 2 * t);
  }
  if (key.easing === "ease-in") {
    return solveCubicBezier(
      CSS_EASE_IN_BEZIER[0],
      CSS_EASE_IN_BEZIER[1],
      CSS_EASE_IN_BEZIER[2],
      CSS_EASE_IN_BEZIER[3],
      t,
    );
  }
  if (key.easing === "ease-out") {
    return solveCubicBezier(
      CSS_EASE_OUT_BEZIER[0],
      CSS_EASE_OUT_BEZIER[1],
      CSS_EASE_OUT_BEZIER[2],
      CSS_EASE_OUT_BEZIER[3],
      t,
    );
  }
  const [x1, y1, x2, y2] = resolveKeyBezier(key);
  return solveCubicBezier(x1, y1, x2, y2, t);
}

function sortedKeys(keys: Key[]): Key[] {
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i].frame < keys[i - 1].frame) {
      return [...keys].sort((a, b) => a.frame - b.frame);
    }
  }
  return keys;
}

export function evaluateChannel(
  keys: Key[] | undefined,
  localFrame: number,
  fallback: number,
  carriedStartValue?: number,
): number {
  if (!keys || keys.length === 0) return fallback;
  let ordered = sortedKeys(keys);
  if (
    ordered[0].frame > 0 &&
    typeof carriedStartValue === "number" &&
    Number.isFinite(carriedStartValue)
  ) {
    ordered = [
      {
        frame: 0,
        value: carriedStartValue,
        easing: ordered[0].easing === "hold" ? "hold" : "ease-in-out",
      },
      ...ordered,
    ];
  }
  if (localFrame <= ordered[0].frame) return ordered[0].value;
  const last = ordered[ordered.length - 1];
  if (localFrame >= last.frame) return last.value;

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (localFrame >= a.frame && localFrame <= b.frame) {
      if (localFrame === a.frame || b.frame === a.frame || a.easing === "hold") {
        return a.value;
      }
      const t = (localFrame - a.frame) / (b.frame - a.frame);
      const eased = evaluateKeyEasing(a, t);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

function fallbackForProp(
  anim: BeatAnimation | undefined,
  prop: AnimProp,
  clip: AnimatableClip,
  carriedStartValue?: number,
): number {
  const plain = anim?.values?.[prop];
  if (typeof plain === "number" && Number.isFinite(plain)) {
    return clampPropValue(prop, plain);
  }
  if (typeof carriedStartValue === "number" && Number.isFinite(carriedStartValue)) {
    return clampPropValue(prop, carriedStartValue);
  }
  return defaultValueForProp(prop, clip);
}

export function evaluate(
  clip: AnimatableClip,
  localFrame: number,
  carriedStartPose?: Partial<EvaluatedPose>,
): EvaluatedPose {
  const anim = extractAnimation(clip);
  const inherited =
    carriedStartPose ??
    (clip && typeof clip === "object" && "carriedStartPose" in clip
      ? clip.carriedStartPose
      : undefined);

  const evalProp = (prop: AnimProp): number => {
    const carriedVal = inherited?.[prop];
    return evaluateChannel(
      anim?.[prop],
      localFrame,
      fallbackForProp(anim, prop, clip, carriedVal),
      carriedVal,
    );
  };

  return {
    zoom: evalProp("zoom"),
    x: evalProp("x"),
    y: evalProp("y"),
    rotation: evalProp("rotation"),
    opacity: evalProp("opacity"),
    blur: evalProp("blur"),
    exposure: evalProp("exposure"),
    gradeStrength: evalProp("gradeStrength"),
    depthAmount: evalProp("depthAmount"),
  };
}

export function clampPropValue(prop: AnimProp, value: number): number {
  const meta = ANIM_PROP_META[prop];
  const safe = Number.isFinite(value) ? value : meta.defaultValue;
  const clamped = Math.max(meta.min, Math.min(meta.max, safe));
  return Object.is(clamped, -0) ? 0 : clamped;
}

function cleanZero(n: number): number {
  if (!Number.isFinite(n) || Object.is(n, -0) || Math.abs(n) < 1e-12) return 0;
  const rounded = Math.round(n * 1e10) / 1e10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export const VIEWER_ASPECT = 16 / 9;
export const MIN_KEN_BURNS_BOX_WIDTH = 0.2;

/**
 * Minimum zoom factor required so a 16:9 viewer rotated by `rotationDeg` stays 100% inside
 * a 16:9 picture with zero black corners exposed.
 */
export function minZoomForRotation(rotationDeg: number, aspect = VIEWER_ASPECT): number {
  const rad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return Math.max(1, c + s * Math.max(1, aspect));
}

export interface ClampedPoseResult {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
  clamped: boolean;
}

/**
 * Clamps `{ zoom, x, y, rotation }` for `transform: translate(x%, y%) scale(zoom) rotate(rotationdeg)`
 * centred at `50% 50%` on an `aspect` (16:9) viewer so the viewer frame NEVER extends past any
 * of the picture's four edges. Reports `clamped: true` if the input pose had to be constrained.
 */
export function clampPoseToPictureEdges(
  pose: { zoom: number; x: number; y: number; rotation?: number },
  aspect = VIEWER_ASPECT,
): ClampedPoseResult {
  const rawZoom = Number.isFinite(pose.zoom) ? pose.zoom : 1;
  const rawX = Number.isFinite(pose.x) ? pose.x : 0;
  const rawY = Number.isFinite(pose.y) ? pose.y : 0;
  const rawRotation = Number.isFinite(pose.rotation) ? Number(pose.rotation) : 0;

  const rotation = clampPropValue("rotation", rawRotation);
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const absCos = Math.abs(cos);
  const absSin = Math.abs(sin);

  const minZoom = minZoomForRotation(rotation, aspect);
  const maxZoom = ANIM_PROP_META.zoom.max;
  const zoom = cleanZero(Math.max(minZoom, Math.min(maxZoom, rawZoom)));

  const halfSpanU = (0.5 * absCos + (0.5 * absSin) / aspect) / zoom;
  const halfSpanV = (0.5 * absSin * aspect + 0.5 * absCos) / zoom;
  const maxDu = Math.max(0, 0.5 - halfSpanU);
  const maxDv = Math.max(0, 0.5 - halfSpanV);

  const tx0 = rawX / 100;
  const ty0 = rawY / 100;

  // Picture-space offset (du, dv) of the viewer centre (vx = 0, vy = 0)
  const du = (-tx0 * cos - (ty0 / aspect) * sin) / zoom;
  const dv = (tx0 * aspect * sin - ty0 * cos) / zoom;

  const duClamped = Math.max(-maxDu, Math.min(maxDu, du));
  const dvClamped = Math.max(-maxDv, Math.min(maxDv, dv));

  const tx = -zoom * (duClamped * cos - (dvClamped / aspect) * sin);
  const ty = -zoom * (duClamped * aspect * sin + dvClamped * cos);

  const x = cleanZero(clampPropValue("x", tx * 100));
  const y = cleanZero(clampPropValue("y", ty * 100));

  const clamped =
    Math.abs(zoom - rawZoom) > 1e-6 ||
    Math.abs(x - rawX) > 1e-5 ||
    Math.abs(y - rawY) > 1e-5 ||
    Math.abs(rotation - rawRotation) > 1e-6;

  return { zoom, x, y, rotation, clamped };
}

/**
 * Zooms to `targetZoom` keeping the picture point under normalized viewer pointer `(pointerNormX, pointerNormY)`
 * (`[0..1]` across the viewer) stationary, then clamps to the picture's edges.
 */
export function zoomPoseAroundPointer(
  pose: { zoom: number; x: number; y: number; rotation?: number },
  targetZoom: number,
  pointerNormX: number,
  pointerNormY: number,
  aspect = VIEWER_ASPECT,
): ClampedPoseResult {
  const rotation = clampPropValue("rotation", Number(pose.rotation) || 0);
  const z0 = Math.max(0.01, Number(pose.zoom) || 1);
  const x0 = Number(pose.x) || 0;
  const y0 = Number(pose.y) || 0;

  const minZoom = minZoomForRotation(rotation, aspect);
  const maxZoom = ANIM_PROP_META.zoom.max;
  const z1 = Math.max(minZoom, Math.min(maxZoom, targetZoom));
  const zoomWasClamped = Math.abs(z1 - targetZoom) > 1e-6;

  const vx = Math.max(0, Math.min(1, pointerNormX)) - 0.5;
  const vy = Math.max(0, Math.min(1, pointerNormY)) - 0.5;
  const ratio = z1 / z0;

  const rawX = vx * 100 * (1 - ratio) + x0 * ratio;
  const rawY = vy * 100 * (1 - ratio) + y0 * ratio;

  const edge = clampPoseToPictureEdges({ zoom: z1, x: rawX, y: rawY, rotation }, aspect);
  return {
    ...edge,
    clamped: zoomWasClamped || edge.clamped,
  };
}

export function clampKenBurnsBox(raw: KenBurnsBox): { box: KenBurnsBox; clamped: boolean } {
  const rawW = Number.isFinite(raw.width) ? raw.width : 1;
  const rawX = Number.isFinite(raw.x) ? raw.x : 0;
  const rawY = Number.isFinite(raw.y) ? raw.y : 0;

  const width = Math.max(MIN_KEN_BURNS_BOX_WIDTH, Math.min(1, rawW));
  const x = cleanZero(Math.max(0, Math.min(1 - width, rawX)));
  const y = cleanZero(Math.max(0, Math.min(1 - width, rawY)));

  const clamped =
    Math.abs(width - rawW) > 1e-6 ||
    Math.abs(x - rawX) > 1e-6 ||
    Math.abs(y - rawY) > 1e-6;

  return {
    box: { x, y, width },
    clamped,
  };
}

/**
 * Builds a 16:9 Ken Burns box inside `[0, 1] × [0, 1]` from a drag anchor `(anchorX, anchorY)`
 * to `(pointerX, pointerY)` in normalized picture coordinates.
 */
export function kenBurnsBoxFromDrag(
  anchorX: number,
  anchorY: number,
  pointerX: number,
  pointerY: number,
): { box: KenBurnsBox; clamped: boolean } {
  const ax = Math.max(0, Math.min(1, anchorX));
  const ay = Math.max(0, Math.min(1, anchorY));
  const outOfBounds = pointerX < 0 || pointerX > 1 || pointerY < 0 || pointerY > 1;
  const px = Math.max(0, Math.min(1, pointerX));
  const py = Math.max(0, Math.min(1, pointerY));

  const dx = px - ax;
  const dy = py - ay;
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;

  const maxSpanX = signX > 0 ? 1 - ax : ax;
  const maxSpanY = signY > 0 ? 1 - ay : ay;
  const maxAllowedWidth = Math.min(1, maxSpanX, maxSpanY);

  const requestedWidth = Math.max(Math.abs(dx), Math.abs(dy), MIN_KEN_BURNS_BOX_WIDTH);
  let width = Math.min(requestedWidth, Math.max(MIN_KEN_BURNS_BOX_WIDTH, maxAllowedWidth));
  width = Math.max(MIN_KEN_BURNS_BOX_WIDTH, Math.min(1, width));

  const rawLeft = signX > 0 ? ax : ax - width;
  const rawTop = signY > 0 ? ay : ay - width;
  const res = clampKenBurnsBox({ x: rawLeft, y: rawTop, width });
  return {
    box: res.box,
    clamped: outOfBounds || requestedWidth > maxAllowedWidth + 1e-6 || res.clamped,
  };
}

/**
 * Converts a 16:9 `KenBurnsBox` (normalized `x`, `y`, `width` inside `[0, 1]`) into the viewer's
 * centred `transform: translate(x%, y%) scale(zoom)` parameters:
 * - `zoom = 1 / boxWidth`
 * - `x = -zoom * (boxCenterX - 0.5) * 100`
 * - `y = -zoom * (boxCenterY - 0.5) * 100`
 */
export function kenBurnsBoxToPose(rawBox: KenBurnsBox): {
  zoom: number;
  x: number;
  y: number;
  box: KenBurnsBox;
  clamped: boolean;
} {
  const { box, clamped } = clampKenBurnsBox(rawBox);
  const boxWidth = box.width;
  const boxCenterX = box.x + boxWidth / 2;
  const boxCenterY = box.y + boxWidth / 2;
  const zoom = cleanZero(1 / boxWidth);
  const x = cleanZero(-zoom * (boxCenterX - 0.5) * 100);
  const y = cleanZero(-zoom * (boxCenterY - 0.5) * 100);
  return { zoom, x, y, box, clamped };
}

export function poseToKenBurnsBox(pose: { zoom: number; x: number; y: number }): KenBurnsBox {
  const z = Math.max(1, Math.min(ANIM_PROP_META.zoom.max, Number(pose.zoom) || 1));
  const width = 1 / z;
  const centerX = 0.5 - (Number(pose.x) || 0) / (100 * z);
  const centerY = 0.5 - (Number(pose.y) || 0) / (100 * z);
  return clampKenBurnsBox({
    x: centerX - width / 2,
    y: centerY - width / 2,
    width,
  }).box;
}

/**
 * Writes `zoom`, `x`, and `y` `ease-in-out` keyframes at the clip's first (`0`) and last
 * (`Math.max(0, clipDurationFrames - 1)`) frames from `startBox` and `endBox`, storing both boxes
 * on `animation.kenBurns` so they reappear whenever the clip is selected.
 */
export function applyKenBurnsBoxes(
  animation: BeatAnimation | undefined,
  startBox: KenBurnsBox,
  endBox: KenBurnsBox,
  clipDurationFrames: number,
): { animation: BeatAnimation; clamped: boolean } {
  const startRes = kenBurnsBoxToPose(startBox);
  const endRes = kenBurnsBoxToPose(endBox);
  const lastFrame = Math.max(0, Math.round(clipDurationFrames) - 1);

  const zoomKeys: Key[] =
    lastFrame > 0
      ? [
          { frame: 0, value: startRes.zoom, easing: "ease-in-out" },
          { frame: lastFrame, value: endRes.zoom, easing: "ease-in-out" },
        ]
      : [{ frame: 0, value: endRes.zoom, easing: "ease-in-out" }];

  const xKeys: Key[] =
    lastFrame > 0
      ? [
          { frame: 0, value: startRes.x, easing: "ease-in-out" },
          { frame: lastFrame, value: endRes.x, easing: "ease-in-out" },
        ]
      : [{ frame: 0, value: endRes.x, easing: "ease-in-out" }];

  const yKeys: Key[] =
    lastFrame > 0
      ? [
          { frame: 0, value: startRes.y, easing: "ease-in-out" },
          { frame: lastFrame, value: endRes.y, easing: "ease-in-out" },
        ]
      : [{ frame: 0, value: endRes.y, easing: "ease-in-out" }];

  const nextValues: BeatAnimValues = { ...(animation?.values ?? {}) };
  delete nextValues.zoom;
  delete nextValues.x;
  delete nextValues.y;
  delete nextValues.rotation;

  const normalized = normalizeAnimation({
    ...animation,
    values: Object.keys(nextValues).length > 0 ? nextValues : undefined,
    kenBurns: {
      start: startRes.box,
      end: endRes.box,
    },
    zoom: zoomKeys,
    x: xKeys,
    y: yKeys,
    rotation: undefined,
  })!;

  return {
    animation: normalized,
    clamped: startRes.clamped || endRes.clamped,
  };
}

function normalizeEasingValue(raw: unknown, rawBezier: unknown): {
  easing: KeyEasing;
  bezier?: CubicBezierTuple;
} {
  const parsedStr = parseCubicBezierString(raw);
  if (parsedStr) {
    return { easing: "bezier", bezier: normalizeBezierTuple(parsedStr) };
  }
  const tuple = normalizeBezierTuple(rawBezier);
  if (raw === "bezier") {
    return { easing: "bezier", bezier: tuple ?? [...DEFAULT_BEZIER] };
  }
  if (
    raw === "ease-in" ||
    raw === "ease-out" ||
    raw === "ease-in-out" ||
    raw === "hold" ||
    raw === "linear"
  ) {
    return { easing: raw };
  }
  if (tuple) {
    return { easing: "bezier", bezier: tuple };
  }
  return { easing: "linear" };
}

export function normalizeAnimation(animation: BeatAnimation | undefined): BeatAnimation | undefined {
  if (!animation) return undefined;
  const next: BeatAnimation = {};
  let hasAny = false;

  if (animation.values && typeof animation.values === "object") {
    const cleanValues: BeatAnimValues = {};
    for (const prop of ANIM_PROPS) {
      const rawVal = animation.values[prop];
      if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
        cleanValues[prop] = clampPropValue(prop, rawVal);
      }
    }
    if (Object.keys(cleanValues).length > 0) {
      next.values = cleanValues;
      hasAny = true;
    }
  }

  if (
    animation.kenBurns &&
    typeof animation.kenBurns === "object" &&
    animation.kenBurns.start &&
    animation.kenBurns.end
  ) {
    next.kenBurns = {
      start: clampKenBurnsBox(animation.kenBurns.start).box,
      end: clampKenBurnsBox(animation.kenBurns.end).box,
    };
    hasAny = true;
  }

  for (const prop of ANIM_PROPS) {
    const raw = animation[prop];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const byFrame = new Map<number, Key>();
    for (const item of raw) {
      const frame = Math.max(0, Math.round(Number(item.frame) || 0));
      const { easing, bezier } = normalizeEasingValue(item.easing, item.bezier);
      const normalizedKey: Key = {
        frame,
        value: clampPropValue(prop, Number(item.value)),
        easing,
        ...(bezier ? { bezier } : {}),
      };
      byFrame.set(frame, normalizedKey);
    }
    const sorted = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
    if (sorted.length > 0) {
      next[prop] = sorted;
      hasAny = true;
    }
  }
  return hasAny ? next : undefined;
}

export function toggleKeyAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  localFrame: number,
  currentValue: number,
  defaultEasing: KeyEasing = "linear",
): BeatAnimation | undefined {
  const frame = Math.max(0, Math.round(localFrame));
  const existing = animation?.[prop] ?? [];
  const hasAtFrame = existing.some((key) => key.frame === frame);
  const nextKeys = hasAtFrame
    ? existing.filter((key) => key.frame !== frame)
    : [
        ...existing,
        {
          frame,
          value: clampPropValue(prop, currentValue),
          easing: defaultEasing,
          ...(defaultEasing === "bezier" ? { bezier: [...DEFAULT_BEZIER] as CubicBezierTuple } : {}),
        },
      ];
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
}

/**
 * Auto-key rule shared by Inspector sliders and direct viewer framing:
 * - If `prop` already has keyframes (`animation[prop].length > 0`), updates the keyframe at
 *   `localFrame` or adds a new keyframe at `localFrame`.
 * - If `prop` has NO keyframes, updates the plain static value (`animation.values[prop]`) without
 *   creating any keyframe.
 */
export function setSliderValueAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  localFrame: number,
  value: number,
  defaultEasing: KeyEasing = "linear",
): BeatAnimation | undefined {
  const frame = Math.max(0, Math.round(localFrame));
  const clamped = clampPropValue(prop, value);
  const existing = sortedKeys(animation?.[prop] ?? []);

  if (existing.length === 0) {
    return normalizeAnimation({
      ...animation,
      values: {
        ...(animation?.values ?? {}),
        [prop]: clamped,
      },
    });
  }

  const atIndex = existing.findIndex((key) => key.frame === frame);
  let nextKeys: Key[];
  if (atIndex >= 0) {
    nextKeys = existing.map((key, idx) => (idx === atIndex ? { ...key, value: clamped } : key));
  } else {
    const prior = [...existing].reverse().find((key) => key.frame < frame);
    const inheritedEasing = prior?.easing ?? existing[0]?.easing ?? defaultEasing;
    const inheritedBezier =
      inheritedEasing === "bezier"
        ? ([...(prior?.bezier ?? existing[0]?.bezier ?? DEFAULT_BEZIER)] as CubicBezierTuple)
        : undefined;
    nextKeys = [
      ...existing,
      {
        frame,
        value: clamped,
        easing: inheritedEasing,
        ...(inheritedBezier ? { bezier: inheritedBezier } : {}),
      },
    ];
  }
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
}

export const applyAutoKeyValue = setSliderValueAtFrame;

/**
 * Applies partial camera pose updates (`zoom`, `x`, `y`, `rotation`) at `localFrame` using the
 * per-property auto-key rule.
 */
export function applyPoseAtPlayhead(
  animation: BeatAnimation | undefined,
  localFrame: number,
  nextPose: Partial<Pick<EvaluatedPose, "zoom" | "x" | "y" | "rotation">>,
  defaultEasing: KeyEasing = "linear",
): BeatAnimation | undefined {
  let next = animation;
  const props: Array<"zoom" | "x" | "y" | "rotation"> = ["zoom", "x", "y", "rotation"];
  for (const prop of props) {
    const val = nextPose[prop];
    if (typeof val === "number" && Number.isFinite(val)) {
      next = setSliderValueAtFrame(next, prop, localFrame, val, defaultEasing);
    }
  }
  return next;
}

export function setKeyEasingAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  localFrame: number,
  easing: KeyEasing,
  bezier?: CubicBezierTuple,
): BeatAnimation | undefined {
  const frame = Math.max(0, Math.round(localFrame));
  const existing = animation?.[prop] ?? [];
  if (!existing.some((key) => key.frame === frame)) return normalizeAnimation(animation);
  const nextKeys = existing.map((key) => {
    if (key.frame !== frame) return key;
    if (easing === "bezier") {
      return {
        ...key,
        easing: "bezier" as const,
        bezier: bezier ?? key.bezier ?? resolveKeyBezier(key),
      };
    }
    const { bezier: _omit, ...rest } = key;
    return { ...rest, easing };
  });
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
}

export function setKeyBezierAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  localFrame: number,
  bezier: CubicBezierTuple,
): BeatAnimation | undefined {
  const norm = normalizeBezierTuple(bezier) ?? [...DEFAULT_BEZIER];
  return setKeyEasingAtFrame(animation, prop, localFrame, "bezier", norm);
}

export function moveKeyToFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  fromFrame: number,
  toFrame: number,
  maxFrame?: number,
): BeatAnimation | undefined {
  const sourceFrame = Math.max(0, Math.round(fromFrame));
  let targetFrame = Math.max(0, Math.round(toFrame));
  if (maxFrame !== undefined) targetFrame = Math.min(Math.max(0, Math.round(maxFrame)), targetFrame);
  const existing = animation?.[prop] ?? [];
  const moving = existing.find((key) => key.frame === sourceFrame);
  if (!moving) return normalizeAnimation(animation);
  const others = existing.filter((key) => key.frame !== sourceFrame && key.frame !== targetFrame);
  return normalizeAnimation({
    ...animation,
    [prop]: [...others, { ...moving, frame: targetFrame }],
  });
}

export function copyKeyToFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  fromFrame: number,
  toFrame: number,
  maxFrame?: number,
): BeatAnimation | undefined {
  const sourceFrame = Math.max(0, Math.round(fromFrame));
  let targetFrame = Math.max(0, Math.round(toFrame));
  if (maxFrame !== undefined) targetFrame = Math.min(Math.max(0, Math.round(maxFrame)), targetFrame);
  const existing = animation?.[prop] ?? [];
  const source = existing.find((key) => key.frame === sourceFrame);
  if (!source) return normalizeAnimation(animation);
  if (targetFrame === sourceFrame) return normalizeAnimation(animation);
  const others = existing.filter((key) => key.frame !== targetFrame);
  const cloned: Key = {
    ...source,
    frame: targetFrame,
    ...(source.bezier ? { bezier: [...source.bezier] as CubicBezierTuple } : {}),
  };
  return normalizeAnimation({
    ...animation,
    [prop]: [...others, cloned],
  });
}

export function updateKeyPointAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  fromFrame: number,
  toFrame: number,
  toValue: number,
  maxFrame?: number,
): BeatAnimation | undefined {
  const sourceFrame = Math.max(0, Math.round(fromFrame));
  let targetFrame = Math.max(0, Math.round(toFrame));
  if (maxFrame !== undefined) targetFrame = Math.min(Math.max(0, Math.round(maxFrame)), targetFrame);
  const clampedValue = clampPropValue(prop, toValue);
  const existing = animation?.[prop] ?? [];
  const moving = existing.find((key) => key.frame === sourceFrame);
  if (!moving) return normalizeAnimation(animation);
  const others = existing.filter((key) => key.frame !== sourceFrame && key.frame !== targetFrame);
  return normalizeAnimation({
    ...animation,
    [prop]: [...others, { ...moving, frame: targetFrame, value: clampedValue }],
  });
}

export interface CopiedKeyframeItem {
  prop: AnimProp;
  offsetFrames: number;
  value: number;
  easing: KeyEasing;
  bezier?: CubicBezierTuple;
}

export interface PasteKeyframesResult {
  animation: BeatAnimation | undefined;
  pastedCount: number;
  droppedCount: number;
  pastedKeys: Array<{ prop: AnimProp; frame: number }>;
}

/**
 * Extracts selected keyframe diamonds into a relative-spaced clipboard payload
 * anchored at the earliest selected diamond (`offsetFrames >= 0`).
 */
export function copySelectedKeyframes(
  clips: readonly TimelineClip[],
  selected: ReadonlyArray<{ frameId: string; prop: AnimProp; frame: number }>,
): CopiedKeyframeItem[] {
  if (!clips.length || !selected.length) return [];
  const clipById = new Map(clips.map((c) => [c.keyframe.id, c]));
  const matched: Array<{ absFrame: number; prop: AnimProp; key: Key }> = [];
  for (const item of selected) {
    const clip = clipById.get(item.frameId);
    const channel = clip?.keyframe.beat.animation?.[item.prop];
    const hit = channel?.find((k) => Math.round(k.frame) === Math.round(item.frame));
    if (clip && hit) {
      matched.push({ absFrame: clip.startFrame + hit.frame, prop: item.prop, key: hit });
    }
  }
  if (!matched.length) return [];
  matched.sort((a, b) => a.absFrame - b.absFrame);
  const minAbsFrame = matched[0].absFrame;
  return matched.map(({ absFrame, prop, key }) => ({
    prop,
    offsetFrames: absFrame - minAbsFrame,
    value: key.value,
    easing: key.easing,
    ...(key.bezier ? { bezier: [...key.bezier] as CubicBezierTuple } : {}),
  }));
}

/**
 * Pastes copied keyframe diamonds onto a target clip starting at `pasteLocalFrame`,
 * preserving relative frame spacing. Any keyframe falling at or after `clipDurationFrames`
 * (`targetFrame >= clipDurationFrames`, i.e. past `clipDurationFrames - 1`) is dropped and counted.
 */
export function pasteCopiedKeyframesAt(
  existingAnimation: BeatAnimation | undefined,
  copied: readonly CopiedKeyframeItem[],
  pasteLocalFrame: number,
  clipDurationFrames: number,
): PasteKeyframesResult {
  if (!copied.length || clipDurationFrames <= 0) {
    return {
      animation: normalizeAnimation(existingAnimation),
      pastedCount: 0,
      droppedCount: copied.length,
      pastedKeys: [],
    };
  }
  const baseFrame = Math.max(0, Math.round(pasteLocalFrame));
  const maxValidFrame = Math.max(0, Math.floor(clipDurationFrames) - 1);
  const next: BeatAnimation = {
    ...(existingAnimation?.values ? { values: { ...existingAnimation.values } } : {}),
    ...(existingAnimation?.kenBurns
      ? {
          kenBurns: {
            start: { ...existingAnimation.kenBurns.start },
            end: { ...existingAnimation.kenBurns.end },
          },
        }
      : {}),
  };
  for (const prop of ANIM_PROPS) {
    if (existingAnimation?.[prop]?.length) {
      next[prop] = existingAnimation[prop]!.map((k) => ({
        ...k,
        ...(k.bezier ? { bezier: [...k.bezier] as CubicBezierTuple } : {}),
      }));
    }
  }

  let pastedCount = 0;
  let droppedCount = 0;
  const pastedKeys: Array<{ prop: AnimProp; frame: number }> = [];

  for (const item of copied) {
    const targetFrame = baseFrame + Math.round(item.offsetFrames);
    if (targetFrame < 0 || targetFrame > maxValidFrame) {
      droppedCount += 1;
      continue;
    }
    const existingProp = (next[item.prop] ?? []).filter((k) => k.frame !== targetFrame);
    existingProp.push({
      frame: targetFrame,
      value: clampPropValue(item.prop, item.value),
      easing: item.easing,
      ...(item.bezier ? { bezier: [...item.bezier] as CubicBezierTuple } : {}),
    });
    next[item.prop] = existingProp;
    pastedCount += 1;
    pastedKeys.push({ prop: item.prop, frame: targetFrame });
  }

  return {
    animation: normalizeAnimation(next),
    pastedCount,
    droppedCount,
    pastedKeys,
  };
}

/**
 * Copies and pastes an entire clip's `BeatAnimation` onto another clip of `targetDurationFrames`.
 * Keyframes keep their original local frames (`0 .. targetDurationFrames - 1`); keyframes falling
 * after the target clip's end (`frame >= targetDurationFrames`) are dropped and counted.
 */
export function pasteClipAnimationOnto(
  sourceAnimation: BeatAnimation | undefined,
  targetDurationFrames: number,
): PasteKeyframesResult {
  if (!sourceAnimation) {
    return { animation: undefined, pastedCount: 0, droppedCount: 0, pastedKeys: [] };
  }
  const maxValidFrame = Math.max(0, Math.floor(targetDurationFrames) - 1);
  const next: BeatAnimation = {
    ...(sourceAnimation.values ? { values: { ...sourceAnimation.values } } : {}),
  };
  let pastedCount = 0;
  let droppedCount = 0;
  const pastedKeys: Array<{ prop: AnimProp; frame: number }> = [];

  for (const prop of ANIM_PROPS) {
    const keys = sourceAnimation[prop];
    if (!keys?.length) continue;
    const kept: Key[] = [];
    for (const k of keys) {
      const f = Math.round(k.frame);
      if (targetDurationFrames <= 0 || f > maxValidFrame) {
        droppedCount += 1;
      } else {
        kept.push({
          ...k,
          frame: f,
          ...(k.bezier ? { bezier: [...k.bezier] as CubicBezierTuple } : {}),
        });
        pastedCount += 1;
        pastedKeys.push({ prop, frame: f });
      }
    }
    if (kept.length > 0) next[prop] = kept;
  }

  return {
    animation: normalizeAnimation(next),
    pastedCount,
    droppedCount,
    pastedKeys,
  };
}

export function allKeyframeFramesOnClip(
  animation: BeatAnimation | undefined,
  clipDurationFrames?: number,
): number[] {
  if (!animation) return [];
  const frames = new Set<number>();
  const maxF =
    clipDurationFrames !== undefined ? Math.max(0, Math.floor(clipDurationFrames) - 1) : Infinity;
  for (const prop of ANIM_PROPS) {
    for (const k of animation[prop] ?? []) {
      const f = Math.max(0, Math.round(k.frame));
      if (f <= maxF) frames.add(f);
    }
  }
  return [...frames].sort((a, b) => a - b);
}

export function prevKeyframeFrameOnClip(
  animation: BeatAnimation | undefined,
  currentLocalFrame: number,
  clipDurationFrames?: number,
): number | undefined {
  const frames = allKeyframeFramesOnClip(animation, clipDurationFrames);
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    if (frames[i] < currentLocalFrame) return frames[i];
  }
  return undefined;
}

export function nextKeyframeFrameOnClip(
  animation: BeatAnimation | undefined,
  currentLocalFrame: number,
  clipDurationFrames?: number,
): number | undefined {
  const frames = allKeyframeFramesOnClip(animation, clipDurationFrames);
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i] > currentLocalFrame) return frames[i];
  }
  return undefined;
}

export function splitAnimation(
  animation: BeatAnimation | undefined,
  splitFrame: number,
): [BeatAnimation | undefined, BeatAnimation | undefined] {
  if (!animation) return [undefined, undefined];
  const cut = Math.max(0, Math.round(splitFrame));
  const left: BeatAnimation = animation.values ? { values: { ...animation.values } } : {};
  const right: BeatAnimation = animation.values ? { values: { ...animation.values } } : {};
  for (const prop of ANIM_PROPS) {
    const keys = animation[prop];
    if (!keys?.length) continue;
    const ordered = sortedKeys(keys);
    const leftKeys = ordered
      .filter((key) => key.frame <= cut)
      .map((key) => ({
        ...key,
        ...(key.bezier ? { bezier: [...key.bezier] as CubicBezierTuple } : {}),
      }));
    const rightKeys = ordered
      .filter((key) => key.frame >= cut)
      .map((key) => ({
        ...key,
        frame: key.frame - cut,
        ...(key.bezier ? { bezier: [...key.bezier] as CubicBezierTuple } : {}),
      }));
    if (leftKeys.length) left[prop] = leftKeys;
    if (rightKeys.length) right[prop] = rightKeys;
  }
  return [normalizeAnimation(left), normalizeAnimation(right)];
}

export function buildTimelineClips(
  frames: Keyframe[],
  voiceSecondsByRef?: ReadonlyMap<string, number>,
  pace = 1,
): { clips: TimelineClip[]; totalFrames: number } {
  let cursor = 0;
  const clips: TimelineClip[] = frames.map((keyframe, index) => {
    const audioRef = keyframe.beat.audioUrl;
    const measuredVoice = audioRef ? voiceSecondsByRef?.get(audioRef) : undefined;
    const duration = clipFrames(keyframe, measuredVoice, pace);
    const offsetSec = Math.max(0, Number(keyframe.beat.audioOffsetSeconds || 0));
    const rawVoiceSec = audioRef ? Math.max(0, (measuredVoice ?? 3) - offsetSec) : 0;
    const voiceFrames = audioRef ? Math.max(1, Math.round(rawVoiceSec * FPS)) : 0;
    const explicitVoiceStart = Number(keyframe.beat.voiceStartFrame);
    const defaultVoiceStart = audioRef ? sceneProseFrames(keyframe, pace) : 0;
    const voiceInFrame = audioRef
      ? Math.max(
          0,
          Math.min(
            Math.max(0, duration - 1),
            Number.isFinite(explicitVoiceStart) ? Math.round(explicitVoiceStart) : defaultVoiceStart,
          ),
        )
      : 0;
    const voiceOutFrame = audioRef ? Math.min(duration, voiceInFrame + voiceFrames) : 0;
    const clip: TimelineClip = {
      keyframe,
      index,
      startFrame: cursor,
      durationFrames: duration,
      endFrame: cursor + duration,
      voiceFrames,
      voiceInFrame,
      voiceOutFrame,
    };
    cursor += duration;
    return clip;
  });

  // Carried clips showing the same picture inherit the previous clip's ending pose by default.
  for (let i = 1; i < clips.length; i += 1) {
    const prev = clips[i - 1];
    const cur = clips[i];
    const kf = cur.keyframe;
    const prevKf = prev.keyframe;
    if (
      !kf.beat.gap &&
      !prevKf.beat.gap &&
      Boolean(kf.carried) &&
      Boolean(kf.picture) &&
      kf.picture === prevKf.picture
    ) {
      cur.carriedStartPose = evaluate(prev, Math.max(0, prev.durationFrames - 1));
    }
  }

  return { clips, totalFrames: cursor };
}

export function computePictureRuns(clips: ReadonlyArray<TimelineClip>): PictureRunInfo[] {
  return computePictureRunsForFrames(
    clips.map((c) => c.keyframe),
    clips.map((c) => c.durationFrames),
  );
}

export function clipAtFrame(clips: TimelineClip[], frameNumber: number): TimelineClip | undefined {
  if (!clips.length) return undefined;
  const target = Math.max(0, Math.floor(frameNumber));
  let lo = 0;
  let hi = clips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const clip = clips[mid];
    if (target < clip.startFrame) {
      hi = mid - 1;
    } else if (target >= clip.endFrame) {
      lo = mid + 1;
    } else {
      return clip;
    }
  }
  return clips[clips.length - 1];
}

export function visibleClipRange(
  clips: TimelineClip[],
  minFrame: number,
  maxFrame: number,
): [number, number] {
  if (!clips.length) return [0, -1];
  let lo = 0;
  let hi = clips.length - 1;
  let startIdx = clips.length;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (clips[mid].endFrame > minFrame) {
      startIdx = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (startIdx >= clips.length) return [0, -1];

  lo = startIdx;
  hi = clips.length - 1;
  let endIdx = startIdx - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (clips[mid].startFrame <= maxFrame) {
      endIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return [startIdx, endIdx];
}
