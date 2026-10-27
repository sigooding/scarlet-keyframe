// Zoom / position animation for one clip.
//
// A beat may carry `animation`:
//   { zoom?: Key[], x?: Key[], y?: Key[] }
// where Key = { frame (from the clip's start), value, easing }.
// Zoom 1 = no zoom (max 3), x and y are the picture's offset in % of the frame (-50..50).
//
// Interpolation between two keys uses the *earlier* key's easing:
//   linear       straight line
//   ease-in-out  eases at both ends
//   hold         keeps its value until the next key
// Before the first key the value is the first key's value; after the last it is the last key's value.

import type { AnyRecord } from "../core/model";

export type Easing = "linear" | "ease-in-out" | "hold";

export interface AnimationKey {
  frame: number;
  value: number;
  easing: Easing;
}

export interface ClipAnimation {
  zoom?: AnimationKey[];
  x?: AnimationKey[];
  y?: AnimationKey[];
}

export type AnimationProperty = "zoom" | "x" | "y";

export const ANIMATION_PROPERTIES: AnimationProperty[] = ["zoom", "x", "y"];

export const EASINGS: Easing[] = ["linear", "ease-in-out", "hold"];

export const ANIMATION_DEFAULTS: Record<AnimationProperty, number> = { zoom: 1, x: 0, y: 0 };

export const ANIMATION_RANGES: Record<AnimationProperty, { min: number; max: number; step: number }> = {
  zoom: { min: 1, max: 3, step: 0.01 },
  x: { min: -50, max: 50, step: 0.5 },
  y: { min: -50, max: 50, step: 0.5 },
};

export interface AnimatedTransform {
  zoom: number;
  x: number;
  y: number;
}

// A clip is a keyframe (its animation lives on the beat); the animation object itself is accepted too.
export type AnimationSource = { beat?: AnyRecord } | ClipAnimation | undefined | null;

function isKeyed(source: unknown): source is ClipAnimation {
  if (!source || typeof source !== "object") return false;
  return "zoom" in source || "x" in source || "y" in source;
}

export function animationOf(source: AnimationSource): ClipAnimation | undefined {
  if (!source || typeof source !== "object") return undefined;
  const carried = (source as { beat?: AnyRecord }).beat?.animation as ClipAnimation | undefined;
  if (isKeyed(carried)) return carried;
  if (isKeyed(source)) return source;
  return undefined;
}

export function hasAnimation(source: AnimationSource): boolean {
  const animation = animationOf(source);
  if (!animation) return false;
  return ANIMATION_PROPERTIES.some((property) => (animation[property]?.length ?? 0) > 0);
}

export function sortedKeys(keys: AnimationKey[] | undefined): AnimationKey[] {
  return [...(keys ?? [])].sort((a, b) => a.frame - b.frame);
}

export function easingValue(easing: Easing, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (easing === "hold") return 0;
  if (easing === "linear") return clamped;
  // ease-in-out (cubic): slow, fast, slow.
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

// The value of one key list at a clip-local frame.
export function sampleKeys(keys: AnimationKey[] | undefined, localFrame: number): number | undefined {
  const sorted = sortedKeys(keys);
  if (!sorted.length) return undefined;
  const frame = Number.isFinite(localFrame) ? localFrame : 0;
  if (frame <= sorted[0].frame) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) return last.value;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (frame < from.frame || frame > to.frame) continue;
    const span = to.frame - from.frame;
    if (span <= 0) return to.value;
    const t = easingValue(from.easing, (frame - from.frame) / span);
    return from.value + (to.value - from.value) * t;
  }
  return last.value;
}

// The zoom / position of a clip at a clip-local frame. A clip without keys keeps its picture untouched.
export function evaluate(clip: AnimationSource, localFrame: number): AnimatedTransform {
  const animation = animationOf(clip);
  const output: AnimatedTransform = { ...ANIMATION_DEFAULTS };
  if (!animation) return output;
  for (const property of ANIMATION_PROPERTIES) {
    const value = sampleKeys(animation[property], localFrame);
    if (value !== undefined && Number.isFinite(value)) output[property] = value;
  }
  return output;
}

export function keyAt(keys: AnimationKey[] | undefined, frame: number): AnimationKey | undefined {
  return (keys ?? []).find((key) => key.frame === frame);
}

export function keyFrames(keys: AnimationKey[] | undefined): number[] {
  return sortedKeys(keys).map((key) => key.frame);
}

// The easing that applies at a frame: the easing of the key at (or just before) that frame.
export function easingAt(keys: AnimationKey[] | undefined, frame: number): Easing {
  const sorted = sortedKeys(keys);
  let found: Easing = "linear";
  for (const key of sorted) {
    if (key.frame <= frame) found = key.easing;
    else break;
  }
  return found;
}

export function isEmptyAnimation(animation: ClipAnimation | undefined): boolean {
  if (!animation) return true;
  return ANIMATION_PROPERTIES.every((property) => !(animation[property]?.length));
}

// Add or replace a key at `frame`, keeping the list sorted and clean.
export function withKey(
  keys: AnimationKey[] | undefined,
  frame: number,
  value: number,
  easing: Easing = "linear",
): AnimationKey[] {
  const target = Math.max(0, Math.round(frame));
  const next = sortedKeys(keys).filter((key) => key.frame !== target);
  next.push({ frame: target, value, easing });
  return next.sort((a, b) => a.frame - b.frame);
}

export function withoutKey(keys: AnimationKey[] | undefined, frame: number): AnimationKey[] {
  return sortedKeys(keys).filter((key) => key.frame !== Math.round(frame));
}

// Split each property's keys at `at` (a clip-local cut frame). Keys before the cut stay with the first
// half, keys at or after it belong to the second half and are re-timed to its own start.
export function splitAnimation(animation: ClipAnimation | undefined, at: number): [ClipAnimation | undefined, ClipAnimation | undefined] {
  if (!animation) return [undefined, undefined];
  const first: ClipAnimation = {};
  const second: ClipAnimation = {};
  for (const property of ANIMATION_PROPERTIES) {
    const keys = sortedKeys(animation[property]);
    const left = keys.filter((key) => key.frame < at);
    const right = keys.filter((key) => key.frame >= at).map((key) => ({ ...key, frame: key.frame - at }));
    if (left.length) first[property] = left;
    if (right.length) second[property] = right;
  }
  return [isEmptyAnimation(first) ? undefined : first, isEmptyAnimation(second) ? undefined : second];
}
