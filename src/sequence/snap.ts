// Snapping: clip edges, the playhead, keyframes and markers pull a dragged frame into line when it is
// within a few pixels of them. Distances are in pixels; the caller converts them to frames.

export type SnapKind = "edge" | "playhead" | "keyframe" | "marker";

export interface SnapTarget {
  frame: number;
  kind: SnapKind;
  label?: string;
}

export interface SnapResult {
  frame: number;
  snapped: boolean;
  target?: SnapTarget;
  distance: number;
}

export const SNAP_PIXELS = 8;

// The nearest target within `thresholdFrames`. Ties resolve to the earlier target, so a snap never
// jumps back and forth between two equal candidates.
export function snapFrame(frame: number, targets: SnapTarget[], thresholdFrames: number): SnapResult {
  const base: SnapResult = { frame, snapped: false, distance: Number.POSITIVE_INFINITY };
  if (!Number.isFinite(frame) || thresholdFrames <= 0) return base;
  let best = base;
  for (const target of targets) {
    if (!Number.isFinite(target.frame)) continue;
    const distance = Math.abs(target.frame - frame);
    if (distance > thresholdFrames) continue;
    if (distance < best.distance || (distance === best.distance && target.frame < (best.target?.frame ?? Number.POSITIVE_INFINITY))) {
      best = { frame: target.frame, snapped: true, target, distance };
    }
  }
  return best;
}

// The frames a drag can snap to: every visible clip edge except the ones being dragged, plus the
// playhead, the selected clip's keyframes and every marker.
export function snapTargets(options: {
  clips: { start: number; end: number; id: string }[];
  excludeIds?: string[];
  playhead?: number;
  keyframes?: { frame: number; property?: string }[];
  markers?: { frame: number; label?: string }[];
}): SnapTarget[] {
  const excluded = new Set(options.excludeIds ?? []);
  const targets: SnapTarget[] = [];
  for (const clip of options.clips) {
    if (excluded.has(clip.id)) continue;
    targets.push({ frame: clip.start, kind: "edge", label: "clip start" });
    targets.push({ frame: clip.end, kind: "edge", label: "clip end" });
  }
  if (options.playhead !== undefined) targets.push({ frame: options.playhead, kind: "playhead", label: "playhead" });
  for (const key of options.keyframes ?? []) targets.push({ frame: key.frame, kind: "keyframe", label: key.property ? `${key.property} key` : "keyframe" });
  for (const marker of options.markers ?? []) targets.push({ frame: marker.frame, kind: "marker", label: marker.label ?? "marker" });
  return targets;
}

// Pixels to frames for a given zoom, so the pull stays 8 px on screen at every zoom level.
export function snapThresholdFrames(pxPerFrame: number, pixels = SNAP_PIXELS): number {
  if (!Number.isFinite(pxPerFrame) || pxPerFrame <= 0) return 0;
  return pixels / pxPerFrame;
}
