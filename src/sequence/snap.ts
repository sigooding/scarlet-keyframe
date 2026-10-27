import type { NoteMarker } from "../core/model";
import { ANIM_PROPS, type TimelineClip } from "./animate";

export type SnapTargetKind = "clip-edge" | "playhead" | "keyframe" | "scene-marker" | "note-marker";

export interface SnapTarget {
  frame: number;
  kind: SnapTargetKind;
  label?: string;
}

export interface SnapResult {
  frame: number;
  snapped: boolean;
  target?: SnapTarget;
  distancePx?: number;
}

export const SNAP_DISTANCE_PX = 8;

/**
 * Picks the nearest snap target within `maxDistancePx` (default 8px).
 * When `enabled` is false or no target is within range, returns `Math.round(rawFrame)`.
 */
export function snapFrame(
  rawFrame: number,
  targets: SnapTarget[],
  pxPerFrame: number,
  enabled = true,
  maxDistancePx = SNAP_DISTANCE_PX,
): SnapResult {
  const rounded = Math.round(rawFrame);
  if (!enabled || pxPerFrame <= 0 || !targets.length) {
    return { frame: rounded, snapped: false };
  }

  let best: SnapTarget | undefined;
  let bestDistPx = Infinity;

  for (const target of targets) {
    const distPx = Math.abs(rawFrame - target.frame) * pxPerFrame;
    if (distPx <= maxDistancePx && distPx < bestDistPx) {
      bestDistPx = distPx;
      best = target;
    }
  }

  if (!best) return { frame: rounded, snapped: false };
  return {
    frame: Math.round(best.frame),
    snapped: true,
    target: best,
    distancePx: bestDistPx,
  };
}

/**
 * Snaps a moved clip (or multi-clip span) of length `spanFrames` by checking both
 * its leading edge (`rawStartFrame`) and trailing edge (`rawStartFrame + spanFrames`)
 * against `targets`, choosing whichever edge snaps closer within `maxDistancePx`.
 */
export function snapClipSpan(
  rawStartFrame: number,
  spanFrames: number,
  targets: SnapTarget[],
  pxPerFrame: number,
  enabled = true,
  maxDistancePx = SNAP_DISTANCE_PX,
): { startFrame: number; snapped: boolean; guideFrame?: number; target?: SnapTarget } {
  const roundedStart = Math.max(0, Math.round(rawStartFrame));
  if (!enabled || pxPerFrame <= 0 || !targets.length) {
    return { startFrame: roundedStart, snapped: false };
  }

  const head = snapFrame(rawStartFrame, targets, pxPerFrame, enabled, maxDistancePx);
  const tail = snapFrame(rawStartFrame + spanFrames, targets, pxPerFrame, enabled, maxDistancePx);

  if (head.snapped && (!tail.snapped || (head.distancePx ?? Infinity) <= (tail.distancePx ?? Infinity))) {
    return {
      startFrame: Math.max(0, head.frame),
      snapped: true,
      guideFrame: head.frame,
      target: head.target,
    };
  }
  if (tail.snapped) {
    const start = Math.max(0, tail.frame - spanFrames);
    return {
      startFrame: start,
      snapped: true,
      guideFrame: tail.frame,
      target: tail.target,
    };
  }
  return { startFrame: roundedStart, snapped: false };
}

export interface SceneMarker {
  sceneId: string;
  mark: string;
  frame: number;
  clipId: string;
}

/**
 * Builds one scene marker on the ruler at each scene's first clip (77, 77A, 78…).
 * Consecutive montage sub-scenes that share the same mark (e.g. two adjacent "77" nodes)
 * collapse to the first clip of that scene mark so each scene mark appears once at its start.
 */
export function buildSceneMarkers(clips: TimelineClip[]): SceneMarker[] {
  const markers: SceneMarker[] = [];
  let prevMark: string | undefined;
  for (const clip of clips) {
    const mark = clip.keyframe.mark;
    if (mark !== prevMark) {
      markers.push({
        sceneId: clip.keyframe.sceneId,
        mark,
        frame: clip.startFrame,
        clipId: clip.keyframe.id,
      });
      prevMark = mark;
    }
  }
  return markers;
}

export interface CollectSnapTargetsOptions {
  clips: TimelineClip[];
  playheadFrame: number;
  sceneMarkers: SceneMarker[];
  noteMarkers: NoteMarker[];
  excludeClipIds?: Set<string>;
  excludePlayhead?: boolean;
  excludeKeyframe?: { clipId: string; prop: string; frame: number };
  minFrame?: number;
  maxFrame?: number;
}

/**
 * Collects snap targets from clip edges, the playhead, animation keyframes,
 * scene markers, and note markers (optionally filtered to a frame window for speed).
 */
export function collectSnapTargets(opts: CollectSnapTargetsOptions): SnapTarget[] {
  const {
    clips,
    playheadFrame,
    sceneMarkers,
    noteMarkers,
    excludeClipIds,
    excludePlayhead,
    excludeKeyframe,
    minFrame = -Infinity,
    maxFrame = Infinity,
  } = opts;

  const targets: SnapTarget[] = [];

  if (!excludePlayhead && playheadFrame >= minFrame && playheadFrame <= maxFrame) {
    targets.push({ frame: playheadFrame, kind: "playhead", label: "Playhead" });
  }

  for (const sm of sceneMarkers) {
    if (sm.frame >= minFrame && sm.frame <= maxFrame) {
      targets.push({ frame: sm.frame, kind: "scene-marker", label: `SC ${sm.mark}` });
    }
  }

  for (const nm of noteMarkers) {
    if (nm.frame >= minFrame && nm.frame <= maxFrame) {
      targets.push({ frame: nm.frame, kind: "note-marker", label: nm.name });
    }
  }

  for (const clip of clips) {
    const id = clip.keyframe.id;
    const excluded = excludeClipIds?.has(id) ?? false;
    if (!excluded) {
      if (clip.startFrame >= minFrame && clip.startFrame <= maxFrame) {
        targets.push({ frame: clip.startFrame, kind: "clip-edge" });
      }
      if (clip.endFrame >= minFrame && clip.endFrame <= maxFrame) {
        targets.push({ frame: clip.endFrame, kind: "clip-edge" });
      }
    }

    const anim = clip.keyframe.beat.animation;
    if (anim && !excluded) {
      for (const prop of ANIM_PROPS) {
        for (const key of anim[prop] ?? []) {
          if (
            excludeKeyframe &&
            excludeKeyframe.clipId === id &&
            excludeKeyframe.prop === prop &&
            excludeKeyframe.frame === key.frame
          ) {
            continue;
          }
          const absFrame = clip.startFrame + Math.min(clip.durationFrames - 1, Math.max(0, key.frame));
          if (absFrame >= minFrame && absFrame <= maxFrame) {
            targets.push({ frame: absFrame, kind: "keyframe", label: `${prop}` });
          }
        }
      }
    }
  }

  return targets;
}
