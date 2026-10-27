import type { BeatAnimation, BeatLike, Key, KeyEasing, Keyframe } from "../core/model";
import { clipFrames, FPS, formatTimecode, MIN_CLIP_FRAMES } from "../core/timing";

export type { BeatAnimation, Key, KeyEasing };
export { clipFrames, FPS, formatTimecode, MIN_CLIP_FRAMES };

export type AnimProp = "zoom" | "x" | "y";

export interface EvaluatedPose {
  zoom: number;
  x: number;
  y: number;
}

export interface TimelineClip {
  keyframe: Keyframe;
  index: number;
  startFrame: number;
  durationFrames: number;
  endFrame: number;
  voiceFrames: number;
}

export type AnimatableClip =
  | TimelineClip
  | Keyframe
  | BeatLike
  | BeatAnimation
  | null
  | undefined;

function extractAnimation(clip: AnimatableClip): BeatAnimation | undefined {
  if (!clip || typeof clip !== "object") return undefined;
  if ("keyframe" in clip && clip.keyframe?.beat) return clip.keyframe.beat.animation;
  if ("beat" in clip && clip.beat && typeof clip.beat === "object") return (clip.beat as BeatLike).animation;
  if ("animation" in clip) return (clip as BeatLike).animation;
  return clip as BeatAnimation;
}

export function hasAnimationKeyframes(clip: AnimatableClip): boolean {
  const anim = extractAnimation(clip);
  if (!anim) return false;
  return Boolean(anim.zoom?.length || anim.x?.length || anim.y?.length);
}

function sortedKeys(keys: Key[]): Key[] {
  for (let i = 1; i < keys.length; i += 1) {
    if (keys[i].frame < keys[i - 1].frame) {
      return [...keys].sort((a, b) => a.frame - b.frame);
    }
  }
  return keys;
}

export function evaluateChannel(keys: Key[] | undefined, localFrame: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback;
  const ordered = sortedKeys(keys);
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
      const eased = a.easing === "ease-in-out" ? t * t * (3 - 2 * t) : t;
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

export function evaluate(clip: AnimatableClip, localFrame: number): EvaluatedPose {
  const anim = extractAnimation(clip);
  return {
    zoom: evaluateChannel(anim?.zoom, localFrame, 1),
    x: evaluateChannel(anim?.x, localFrame, 0),
    y: evaluateChannel(anim?.y, localFrame, 0),
  };
}

export function clampPropValue(prop: AnimProp, value: number): number {
  const safe = Number.isFinite(value) ? value : prop === "zoom" ? 1 : 0;
  if (prop === "zoom") return Math.max(1, Math.min(3, safe));
  return Math.max(-50, Math.min(50, safe));
}

export function normalizeAnimation(animation: BeatAnimation | undefined): BeatAnimation | undefined {
  if (!animation) return undefined;
  const next: BeatAnimation = {};
  for (const prop of ["zoom", "x", "y"] as const) {
    const raw = animation[prop];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const byFrame = new Map<number, Key>();
    for (const item of raw) {
      const frame = Math.max(0, Math.round(Number(item.frame) || 0));
      const easing: KeyEasing =
        item.easing === "ease-in-out" || item.easing === "hold" ? item.easing : "linear";
      byFrame.set(frame, {
        frame,
        value: clampPropValue(prop, Number(item.value)),
        easing,
      });
    }
    const sorted = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
    if (sorted.length > 0) next[prop] = sorted;
  }
  return next.zoom || next.x || next.y ? next : undefined;
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
    : [...existing, { frame, value: clampPropValue(prop, currentValue), easing: defaultEasing }];
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
}

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
  const atIndex = existing.findIndex((key) => key.frame === frame);
  let nextKeys: Key[];
  if (atIndex >= 0) {
    nextKeys = existing.map((key, idx) => (idx === atIndex ? { ...key, value: clamped } : key));
  } else {
    const prior = [...existing].reverse().find((key) => key.frame < frame);
    const inheritedEasing = prior?.easing ?? existing[0]?.easing ?? defaultEasing;
    nextKeys = [...existing, { frame, value: clamped, easing: inheritedEasing }];
  }
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
}

export function setKeyEasingAtFrame(
  animation: BeatAnimation | undefined,
  prop: AnimProp,
  localFrame: number,
  easing: KeyEasing,
): BeatAnimation | undefined {
  const frame = Math.max(0, Math.round(localFrame));
  const existing = animation?.[prop] ?? [];
  if (!existing.some((key) => key.frame === frame)) return normalizeAnimation(animation);
  const nextKeys = existing.map((key) => (key.frame === frame ? { ...key, easing } : key));
  return normalizeAnimation({
    ...animation,
    [prop]: nextKeys,
  });
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

export function splitAnimation(
  animation: BeatAnimation | undefined,
  splitFrame: number,
): [BeatAnimation | undefined, BeatAnimation | undefined] {
  if (!animation) return [undefined, undefined];
  const cut = Math.max(0, Math.round(splitFrame));
  const left: BeatAnimation = {};
  const right: BeatAnimation = {};
  for (const prop of ["zoom", "x", "y"] as const) {
    const keys = animation[prop];
    if (!keys?.length) continue;
    const ordered = sortedKeys(keys);
    const leftKeys = ordered.filter((key) => key.frame <= cut).map((key) => ({ ...key }));
    const rightKeys = ordered
      .filter((key) => key.frame >= cut)
      .map((key) => ({ ...key, frame: key.frame - cut }));
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
    const clip: TimelineClip = {
      keyframe,
      index,
      startFrame: cursor,
      durationFrames: duration,
      endFrame: cursor + duration,
      voiceFrames,
    };
    cursor += duration;
    return clip;
  });
  return { clips, totalFrames: cursor };
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
