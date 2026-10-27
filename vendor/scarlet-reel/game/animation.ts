/**
 * ANIMATION — the tween layer for scene sprites.
 *
 * Everything here is PURE: no React, no DOM, no timing. It turns authored
 * data (a path, a preset) into the CSS the renderer applies, and it is
 * Node-testable — see scripts/engine-tests.entry.ts.
 *
 * Three techniques ship together, because they solve three different jobs:
 *
 *   1. MOTION PATHS — a sprite travels a polyline across the plate (a gull
 *      flying past, a car crossing, a rat along a skirting board), at a
 *      constant speed with easing, optional banking and depth fade.
 *      Implemented as sampled @keyframes: one CSS animation, zero JS per
 *      frame, nothing running when the scene is still.
 *   2. PRESETS — looping idle motion (bob, sway, flicker, flutter…). A CSS
 *      class + two custom properties (speed, intensity), so a lantern
 *      flickers and a flag flutters without a single frame of art.
 *   3. SHEETS — frame-by-frame art (src/game/spriteSheet.ts), unchanged.
 */

/* ------------------------------------------------------------------ */
/*  Easing                                                             */
/* ------------------------------------------------------------------ */

export type EaseId = "linear" | "in" | "out" | "inOut" | "arc";

export const EASES: { id: EaseId; label: string }[] = [
  { id: "linear", label: "linear (steady)" },
  { id: "inOut", label: "ease in-out (drift off, drift in)" },
  { id: "in", label: "ease in (accelerate away)" },
  { id: "out", label: "ease out (arrive and settle)" },
  { id: "arc", label: "arc (float, no hard stops)" },
];

export function ease(t: number, id: EaseId = "linear"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (id) {
    case "in":
      return x * x;
    case "out":
      return 1 - (1 - x) * (1 - x);
    case "inOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "arc":
      // A sine arc: slow at both ends without the flat spot of inOut — the
      // "floating" curve a bird or a balloon wants.
      return 0.5 - Math.cos(Math.PI * x) / 2;
    default:
      return x;
  }
}

/* ------------------------------------------------------------------ */
/*  Motion paths                                                       */
/* ------------------------------------------------------------------ */

export interface MotionPoint {
  /** scene-percent, 0–100 */
  x: number;
  y: number;
}

export type MotionLoop = "loop" | "pingpong" | "once";

export interface MotionPath {
  /** At least two points; the sprite travels them in order. */
  points: MotionPoint[];
  /** Seconds for ONE pass along the path. */
  duration: number;
  /** Seconds to wait before the first pass (default 0). */
  delay?: number;
  ease?: EaseId;
  /** loop (default): restart · pingpong: reverse · once: play and hold. */
  loop?: MotionLoop;
  /** Bank/turn the sprite to face the direction it travels (default false). */
  faceTravel?: boolean;
  /** Scale multiplier at the END of the pass — 0.6 shrinks it into the
   *  distance as it goes (default 1). */
  scaleTo?: number;
  /** Opacity at the end of the pass — 0 flies it out of frame (default 1). */
  fadeTo?: number;
  /** Seconds the sprite waits at the end before looping again (default 0). */
  holdSeconds?: number;
}

/** Cumulative segment lengths (scene-percent units) and the total. */
export function pathSegments(path: MotionPath): { lengths: number[]; total: number } {
  const pts = path.points ?? [];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lengths.push(d);
    total += d;
  }
  return { lengths, total };
}

/** True when a path has enough to animate. */
export function motionAnimatable(path?: MotionPath | null): path is MotionPath {
  return !!path && (path.points?.length ?? 0) >= 2 && (path.duration ?? 0) > 0;
}

/** Position (and travel angle, in degrees) at normalised time `t` (0–1).
 *  Distance is arc-length, so a long segment isn't sprinted through. */
export function pathPointAt(path: MotionPath, t: number): { x: number; y: number; angle: number } {
  const pts = path.points ?? [];
  if (!pts.length) return { x: 0, y: 0, angle: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
  const { lengths, total } = pathSegments(path);
  if (total <= 0) return { x: pts[0].x, y: pts[0].y, angle: 0 };
  const target = ease(t, path.ease ?? "linear") * total;
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (walked + lengths[i] >= target || i === lengths.length - 1) {
      const f = lengths[i] <= 0 ? 0 : Math.min(1, (target - walked) / lengths[i]);
      const a = pts[i];
      const b = pts[i + 1];
      // Face the way it's going. Sprites are drawn facing right, so a
      // leftward leg is a mirrored sprite, not a 180 deg spin.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const angle = dx < 0 ? (Math.atan2(dy, dx) * 180) / Math.PI + 180 : (Math.atan2(dy, dx) * 180) / Math.PI;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle };
    }
    walked += lengths[i];
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/** How many keyframe stops to emit — enough that a straight sample reads as
 *  constant speed, few enough to stay cheap. */
export const MOTION_SAMPLES = 28;

/** The @keyframes text for a path. Coordinates are scene percentages; the
 *  anchor translate is carried through CSS variables so the sprite stays
 *  pinned by the same corner it was authored with. */
export function motionKeyframes(name: string, path: MotionPath): string {
  const dur = Math.max(0.1, path.duration);
  const hold = Math.max(0, path.holdSeconds ?? 0);
  const total = dur + hold;
  const travel = dur / total; // fraction of the cycle spent moving
  const scaleTo = path.scaleTo ?? 1;
  const fadeTo = path.fadeTo ?? 1;
  const bank = path.faceTravel !== false;
  const stops: string[] = [];
  const n = MOTION_SAMPLES;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = pathPointAt(path, t);
    const at = (t * travel * 100).toFixed(3);
    const s = (1 + (scaleTo - 1) * t).toFixed(4);
    const o = (1 + (fadeTo - 1) * t).toFixed(4);
    const rot = bank ? ` rotate(${p.angle.toFixed(2)}deg)` : "";
    stops.push(
      `${at}% { left: ${p.x.toFixed(3)}%; top: ${p.y.toFixed(3)}%; opacity: ${o}; transform: translate(var(--ex-ax), var(--ex-ay))${rot} scale(${s}); }`
    );
  }
  if (hold > 0)
    stops.push(
      `100% { left: ${path.points[path.points.length - 1].x.toFixed(3)}%; top: ${path.points[path.points.length - 1].y.toFixed(3)}%; opacity: ${fadeTo.toFixed(4)}; transform: translate(var(--ex-ax), var(--ex-ay))${bank ? ` rotate(${pathPointAt(path, 1).angle.toFixed(2)}deg)` : ""} scale(${scaleTo.toFixed(4)}); }`
    );
  return `@keyframes ${name} {\n  ${stops.join("\n  ")}\n}`;
}

/** The animation-* declarations that play the path. */
export function motionAnimation(path: MotionPath, name: string): Record<string, string> {
  const dur = Math.max(0.1, path.duration) + Math.max(0, path.holdSeconds ?? 0);
  const loop = path.loop ?? "loop";
  return {
    animationName: name,
    animationDuration: `${dur}s`,
    animationDelay: `${Math.max(0, path.delay ?? 0)}s`,
    // Sampled keyframes already carry the easing, so the CSS timing function
    // stays linear — otherwise the ease would be applied twice.
    animationTimingFunction: "linear",
    animationIterationCount: loop === "once" ? "1" : "infinite",
    animationDirection: loop === "pingpong" ? "alternate" : "normal",
    animationFillMode: loop === "once" ? "forwards" : "both",
  };
}

/**
 * Reduced-motion aware variant: when reducedMotion is true, suppress motion
 * paths entirely (return null — the sprite stays still). Caller should skip
 * injecting the @keyframes and the animation style.
 */
export function motionAnimationSafe(
  path: MotionPath,
  name: string,
  opts?: { reducedMotion?: boolean }
): Record<string, string> | null {
  if (opts?.reducedMotion) return null;
  return motionAnimation(path, name);
}

/* ------------------------------------------------------------------ */
/*  Loop presets — idle motion with no extra art                       */
/* ------------------------------------------------------------------ */

export type AnimPresetId =
  | "none"
  | "bob"
  | "sway"
  | "flicker"
  | "pulse"
  | "drift"
  | "flutter"
  | "float"
  | "spin"
  | "shake"
  | "breathe";

export interface ExtraAnimation {
  preset?: AnimPresetId;
  /** multiplier on the preset's base period — 0.5 is twice as fast (default 1) */
  speed?: number;
  /** 0.2–2 amplitude of the motion / effect (default 1) */
  intensity?: number;
  /** seconds before the loop starts (default 0 — avoids every sprite
   *  bobbing in lockstep) */
  delay?: number;
}

export const ANIM_PRESETS: { id: AnimPresetId; label: string; blurb: string; baseSeconds: number }[] = [
  { id: "none", label: "- none -", blurb: "Static sprite.", baseSeconds: 0 },
  { id: "bob", label: "bob", blurb: "Slow vertical bob — a boat, a hanging lamp, a sleeping drunk.", baseSeconds: 3.2 },
  { id: "sway", label: "sway", blurb: "Lean left/right from the base — grass, a sign in the wind.", baseSeconds: 4 },
  { id: "flicker", label: "flicker", blurb: "Irregular brightness steps — neon, a candle, a bad tube.", baseSeconds: 5.5 },
  { id: "pulse", label: "pulse", blurb: "Breathing scale + glow — a heartbeat, an alarm light.", baseSeconds: 1.6 },
  { id: "drift", label: "drift", blurb: "Slow closed loop in a small circle — smoke, dust, a balloon.", baseSeconds: 9 },
  { id: "flutter", label: "flutter", blurb: "Fast flap — wings, paper, a flag snapping.", baseSeconds: 0.5 },
  { id: "float", label: "float", blurb: "Lazy rise and fall with a tilt — a gull on a thermal.", baseSeconds: 6 },
  { id: "spin", label: "spin", blurb: "Slow rotation — a fan, a record, a revolving light.", baseSeconds: 12 },
  { id: "shake", label: "shake", blurb: "Nervous jitter — a rattling grate, a frightened hand.", baseSeconds: 0.9 },
  { id: "breathe", label: "breathe", blurb: "Very slow scale — chests, fog banks, something alive.", baseSeconds: 5 },
];

export function presetSeconds(anim?: ExtraAnimation | null): number {
  const preset = anim?.preset ?? "none";
  const base = ANIM_PRESETS.find((p) => p.id === preset)?.baseSeconds ?? 0;
  if (!base) return 0;
  const mult = Math.max(0.1, anim?.speed ?? 1);
  return base * mult;
}

/** The class + custom properties that drive a preset.
 * When reducedMotion is true, looping idle motion is suppressed — the element
 * stays visible and in place, with no animation class. The CSS blanket in
 * index.css already zeroes animation-duration, but returning no class avoids
 * even the initial transform snap. */
export function presetStyle(
  anim?: ExtraAnimation | null,
  opts?: { reducedMotion?: boolean }
): { className: string; vars: Record<string, string> } {
  const preset = anim?.preset ?? "none";
  if (preset === "none") return { className: "", vars: {} };
  if (opts?.reducedMotion) return { className: "", vars: {} };
  const secs = presetSeconds(anim);
  return {
    className: `anim-${preset}`,
    vars: {
      "--anim-dur": `${secs.toFixed(2)}s`,
      "--anim-amp": String(Math.min(2, Math.max(0.2, anim?.intensity ?? 1))),
      ...(anim?.delay ? { animationDelay: `${anim.delay}s` } : {}),
    },
  };
}

/** A short human summary for Studio ("flies across in 9s, looping"). */
export function describeMotion(path?: MotionPath | null): string {
  if (!motionAnimatable(path)) return "still";
  const loop = path.loop ?? "loop";
  const { total } = pathSegments(path);
  return `${Math.round(total)}% of frame in ${path.duration}s · ${loop === "pingpong" ? "there and back" : loop === "once" ? "once" : "looping"}`;
}

/* ------------------------------------------------------------------ */
/*  Scrolling layers — endless crawl behind a mask                     */
/* ------------------------------------------------------------------ */

/** Endless crawl settings for a foreground layer
 *  (see ForegroundExtra.scroll in src/types.ts). */
export interface LayerScroll {
  /** Axis to crawl along. "x" slides the art sideways (a passing skyline),
   *  "y" slides it vertically (rain on glass, a rising lift shaft). */
  axis?: "x" | "y";
  /** Crawl speed in % of the layer's own size per second (default 12).
   *  Higher is faster; the loop length is always exactly one tile, so any
   *  speed stays seamless. Negative values crawl backwards. */
  speed?: number;
  /** Tile the art along the scroll axis (default true — required for a
   *  seamless loop). Turn off to slide a single long strip across once. */
  repeat?: boolean;
  /** Cross-axis drift added on top of the crawl, in % of the layer per
   *  second — a diagonal rain-streak rather than a flat sideways slide. */
  crossSpeed?: number;
  /** Initial displacement in % of the rendered tile (negative moves up/left).
   * Lets a skyline's buildings, not just its sky, start inside a windscreen. */
  offsetX?: number;
  offsetY?: number;
}

/** Default crawl speed, in % of the layer's own size per second. */
export const SCROLL_DEFAULT_SPEED = 12;

/** Signed pixel travel speeds are configured as box-% per second. Cross
 * drift is independent: each axis completes its own whole-tile loop, so an
 * arbitrary diagonal never snaps back at the primary axis's loop boundary. */
function scrollSpeeds(scroll: LayerScroll): { x: number; y: number } {
  const finite = (n: number | undefined, fallback: number) => Number.isFinite(n ?? fallback) ? (n ?? fallback) : 0;
  const main = finite(scroll.speed, SCROLL_DEFAULT_SPEED);
  const cross = finite(scroll.crossSpeed, 0);
  return scroll.axis === "y" ? { x: cross, y: main } : { x: main, y: cross };
}

export function scrollAnimatable(scroll?: LayerScroll | null): scroll is LayerScroll {
  return !!scroll && Object.values(scrollSpeeds(scroll)).some(n => Math.abs(n) > 0.001);
}

export function scrollPeriod(scroll: LayerScroll): number {
  const speeds = scrollSpeeds(scroll);
  const speed = Math.abs(scroll.axis === "y" ? speeds.y : speeds.x);
  return Math.max(0.25, 100 / Math.max(0.001, speed));
}

/** Shift by the measured tile LENGTH, not a percentage alignment. A 100%
 * background-position change is (box - image) pixels, NOT one image width. */
export function scrollKeyframes(name: string, scroll: LayerScroll): string {
  const speeds = scrollSpeeds(scroll);
  return (["x", "y"] as const).filter(axis => Math.abs(speeds[axis]) > 0.001).map(axis => {
    const sign = speeds[axis] < 0 ? -1 : 1;
    return `@keyframes ${name}-${axis} {\n  from { background-position-${axis}: var(--scroll-start-${axis}, 0px); }\n  to { background-position-${axis}: calc(var(--scroll-start-${axis}, 0px) + var(--scroll-tile-${axis}) * ${sign}); }\n}`;
  }).join("\n");
}

export function scrollStyle(
  scroll: LayerScroll,
  name: string,
  opts?: { reducedMotion?: boolean; tileRatioX?: number; tileRatioY?: number }
): Record<string, string> | null {
  if (!scrollAnimatable(scroll) || opts?.reducedMotion) return null;
  const speeds = scrollSpeeds(scroll);
  const axes = (["x", "y"] as const).filter(axis => Math.abs(speeds[axis]) > 0.001);
  return {
    backgroundImage: "var(--scroll-image)",
    backgroundRepeat: scroll.repeat === false ? "no-repeat" : "repeat",
    backgroundSize: "var(--scroll-tile-x) var(--scroll-tile-y)",
    backgroundPosition: "var(--scroll-start-x, 0px) var(--scroll-start-y, 0px)",
    animationName: axes.map(axis => `${name}-${axis}`).join(", "),
    animationDuration: axes.map(axis => {
      const ratio = (axis === "x" ? opts?.tileRatioX : opts?.tileRatioY) ?? 1;
      return `${Math.max(0.25, 100 * ratio / Math.abs(speeds[axis])).toFixed(3)}s`;
    }).join(", "),
    animationTimingFunction: "linear",
    animationIterationCount: scroll.repeat === false ? "1" : "infinite",
    animationFillMode: "forwards",
    willChange: "background-position",
  };
}
