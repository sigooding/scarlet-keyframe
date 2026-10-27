import type { Keyframe, NoteMarker } from "../core/model";
import { clipFrames, voiceFrames } from "../core/timing";

// One clip on the single Picture track: a beat, its start on the sequence time axis and its length in
// whole frames. Ripple is always on, so every start is the sum of the clips before it.
export interface SequenceClip {
  frame: Keyframe;
  index: number;
  start: number;
  duration: number;
  end: number;
  voice: number;
}

export interface Sequence {
  clips: SequenceClip[];
  totalFrames: number;
}

export function buildSequence(frames: Keyframe[]): Sequence {
  const clips: SequenceClip[] = [];
  let cursor = 0;
  frames.forEach((frame, index) => {
    const duration = clipFrames(frame);
    clips.push({
      frame,
      index,
      start: cursor,
      duration,
      end: cursor + duration,
      voice: voiceFrames(frame),
    });
    cursor += duration;
  });
  return { clips, totalFrames: cursor };
}

export function clipById(clips: SequenceClip[], frameId: string | undefined): SequenceClip | undefined {
  if (!frameId) return undefined;
  return clips.find((clip) => clip.frame.id === frameId);
}

// The clip that covers an absolute frame. Frames past the end resolve to the last clip.
export function clipAtFrame(clips: SequenceClip[], absoluteFrame: number): SequenceClip | undefined {
  if (!clips.length) return undefined;
  const frame = Math.max(0, Math.floor(Number.isFinite(absoluteFrame) ? absoluteFrame : 0));
  if (frame >= clips[clips.length - 1].end) return clips[clips.length - 1];
  let low = 0;
  let high = clips.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (clips[middle].end <= frame) low = middle + 1;
    else high = middle;
  }
  return clips[low];
}

// The frame inside the clip that an absolute playhead points at (always within the clip).
export function localFrameOf(clip: SequenceClip, absoluteFrame: number): number {
  const local = Math.round((Number.isFinite(absoluteFrame) ? absoluteFrame : 0) - clip.start);
  return Math.max(0, Math.min(Math.max(0, clip.duration - 1), local));
}

export function clipStartOf(clips: SequenceClip[], frameId: string | undefined): number {
  return clipById(clips, frameId)?.start ?? 0;
}

// The clips that intersect a pixel window, for drawing only what is on screen.
export function visibleClips(clips: SequenceClip[], fromFrame: number, toFrame: number): { first: number; last: number } {
  if (!clips.length) return { first: 0, last: -1 };
  const from = Math.max(0, Math.floor(fromFrame));
  const to = Math.max(from, Math.ceil(toFrame));
  let low = 0;
  let high = clips.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (clips[middle].end <= from) low = middle + 1;
    else high = middle;
  }
  const first = low;
  let last = first;
  while (last + 1 < clips.length && clips[last].start <= to) last += 1;
  return { first, last };
}

// Where a note marker sits now: anchored to its clip so it ripples with the picture, with the absolute
// frame it was made at as the fallback once the clip is gone.
export function markerPosition(marker: NoteMarker, clips: SequenceClip[]): number {
  const clip = marker.clipId ? clipById(clips, marker.clipId) : undefined;
  if (clip) return clip.start + Math.max(0, Math.min(clip.duration - 1, Math.round(marker.offset ?? 0)));
  return Math.max(0, Math.round(marker.frame));
}
