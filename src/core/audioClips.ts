import { buildTimelineClips, type AnimProp, type TimelineClip } from "../sequence/animate";
import { SNAP_DISTANCE_PX } from "../sequence/snap";
import { effectiveCaptionsForBeat } from "./captions";
import { buildKeyframes, type NoteMarker, type ProjectState, type StoryLike } from "./model";
import {
  effectiveTrackLevel,
  lookupMusicDuration,
  resolveMusicSpans,
  type TrackMixMap,
} from "./previewAudio";
import { FPS } from "./timing";

export type AudioLaneId = "voice" | "sfx" | "music" | "ambience";

export const AUDIO_LANES: readonly AudioLaneId[] = ["voice", "sfx", "music", "ambience"];
export const MIN_AUDIO_CLIP_MS = 20;
export const DEFAULT_DUCK_DEPTH = 0.65;

export interface AudioClip {
  id: string;
  lane: AudioLaneId;
  src: string;
  anchorId: string;
  offsetMs: number;
  inMs: number;
  durationMs: number;
  gain: number;
  fadeInMs: number;
  fadeOutMs: number;
  loop?: boolean;
}

export interface ResolvedAudioClip extends AudioClip {
  anchorStartMs: number;
  startMs: number;
  endMs: number;
}

export interface AmbienceSpan {
  id: string;
  sceneId: string;
  mark: string;
  label: string;
  title: string;
  startFrame: number;
  endFrame: number;
}

export interface SelectedKeyframeDiamond {
  frameId: string;
  prop: AnimProp;
  frame: number;
}

export interface MultiLaneSelection {
  pictureIds: string[];
  captions: Array<{ frameId: string; index: number }>;
  audioClipIds: string[];
  keyframes: SelectedKeyframeDiamond[];
}

export const EMPTY_MULTI_SELECTION: MultiLaneSelection = {
  pictureIds: [],
  captions: [],
  audioClipIds: [],
  keyframes: [],
};

export function isMultiSelectionEmpty(sel: MultiLaneSelection): boolean {
  return (
    sel.pictureIds.length === 0 &&
    sel.captions.length === 0 &&
    sel.audioClipIds.length === 0 &&
    sel.keyframes.length === 0
  );
}

/** Round to microsecond precision to avoid IEEE-754 drift while keeping exact ms values intact. */
export function roundMicros(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms * 1_000_000) / 1_000_000;
}

export function frameToMs(frame: number, fps = FPS): number {
  return roundMicros((frame * 1000) / fps);
}

export function msToFrameFloat(ms: number, fps = FPS): number {
  return (ms * fps) / 1000;
}

export function formatMsTimecode(ms: number): string {
  const clamped = Math.max(0, ms);
  const wholeMs = Math.round(clamped);
  const totalSec = Math.floor(wholeMs / 1000);
  const mmm = wholeMs % 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(mmm).padStart(3, "0")}`;
}

export function audioLabelFromSrc(src: string): string {
  if (!src) return "Untitled sound";
  if (src.startsWith("asset:")) return `upload ${src.slice(6, 12)}`;
  const cleaned = src.replace(/file:/g, "").replace(/^mp3:/i, "");
  if (cleaned.includes("+")) {
    return cleaned
      .split("+")
      .map((part) => (part.trim().split("/").pop() || part.trim()).replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, ""))
      .join(" + ");
  }
  return (cleaned.split("/").pop() || cleaned).replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, "");
}

export function resolveAmbienceSpans(clips: TimelineClip[], totalFrames: number): AmbienceSpan[] {
  const spans: AmbienceSpan[] = [];
  const seen = new Set<string>();
  let active: AmbienceSpan | null = null;
  for (const clip of clips) {
    const scene = clip.keyframe.scene;
    if (seen.has(scene.id)) continue;
    seen.add(scene.id);
    const raw = scene.ambientAudio;
    if (raw === undefined) continue;
    const amb = String(raw).trim();
    if (!amb || amb === "none") {
      if (active) {
        active.endFrame = clip.startFrame;
        if (active.endFrame > active.startFrame) spans.push(active);
        active = null;
      }
      continue;
    }
    if (!active || active.title !== amb) {
      if (active) {
        active.endFrame = clip.startFrame;
        if (active.endFrame > active.startFrame) spans.push(active);
      }
      active = {
        id: clip.keyframe.id,
        sceneId: scene.id,
        mark: String(clip.keyframe.mark),
        label: amb.replace(/file:/g, "").replace(/\/film\/sfx\//g, ""),
        title: amb,
        startFrame: clip.startFrame,
        endFrame: totalFrames,
      };
    }
  }
  if (active) {
    active.endFrame = totalFrames;
    if (active.endFrame > active.startFrame) spans.push(active);
  }
  return spans;
}

export function lookupAudioDurationMs(
  src: string | undefined,
  durations?: ReadonlyMap<string, number>,
): number | undefined {
  const sec = lookupMusicDuration(src, durations);
  if (sec !== undefined && Number.isFinite(sec) && sec > 0) {
    return roundMicros(sec * 1000);
  }
  return undefined;
}

/**
 * Builds `AudioClip[]` once from the story's existing beat voice, beat SFX,
 * shared music spans, and scene ambience spans without mutating the story.
 */
export function buildAudioClipsFromFilm(
  story: StoryLike,
  audioDurations?: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): AudioClip[] {
  const frames = buildKeyframes(story);
  const { clips, totalFrames } = buildTimelineClips(frames, audioDurations);
  if (!clips.length) return [];

  const combinedMusicDurations = musicDurations ?? audioDurations;
  const result: AudioClip[] = [];
  let seq = 1;
  const nextId = (prefix: string) => `ac_${prefix}_${seq++}`;

  // 1. Voice & SFX per beat
  for (const clip of clips) {
    const kf = clip.keyframe;
    const beat = kf.beat;

    if (beat.audioUrl) {
      const src = String(beat.audioUrl);
      const offsetSec = Number(beat.audioOffsetSeconds || 0);
      const offsetMs = Number.isFinite(offsetSec) ? roundMicros(offsetSec * 1000) : 0;
      const knownMs = lookupAudioDurationMs(src, audioDurations);
      const fallbackMs =
        clip.voiceFrames > 0 ? frameToMs(clip.voiceFrames) : 3000;
      const durationMs = Math.max(MIN_AUDIO_CLIP_MS, knownMs ?? fallbackMs);

      result.push({
        id: nextId("vox"),
        lane: "voice",
        src,
        anchorId: kf.id,
        offsetMs,
        inMs: 0,
        durationMs,
        gain: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
        loop: false,
      });
    }

    if (beat.sfxUrl) {
      const src = String(beat.sfxUrl);
      const knownMs = lookupAudioDurationMs(src, audioDurations);
      const durationMs = Math.max(MIN_AUDIO_CLIP_MS, knownMs ?? 1500);
      const rawGain = Number(beat.sfxVolume ?? 1);
      const gain = Number.isFinite(rawGain) ? Math.max(0, Math.min(2, rawGain)) : 1;

      result.push({
        id: nextId("sfx"),
        lane: "sfx",
        src,
        anchorId: kf.id,
        offsetMs: 0,
        inMs: 0,
        durationMs,
        gain,
        fadeInMs: 0,
        fadeOutMs: 0,
        loop: false,
      });
    }
  }

  // 2. Music: one clip per shared music span
  const musicSpans = resolveMusicSpans(clips, totalFrames, combinedMusicDurations);
  const clipById = new Map(clips.map((c) => [c.keyframe.id, c]));

  for (const span of musicSpans) {
    const anchor = clipById.get(span.id) || clips[0];
    const startMs = frameToMs(span.startFrame);
    const endMs = frameToMs(span.endFrame);
    const durationMs = Math.max(MIN_AUDIO_CLIP_MS, roundMicros(endMs - startMs));
    const offsetMs = roundMicros(startMs - frameToMs(anchor.startFrame));
    const fadeInRaw = Number(span.scene.musicFadeSeconds);
    const fadeOutRaw = Number(span.scene.musicFadeOutSeconds);
    const fadeInMs =
      Number.isFinite(fadeInRaw) && fadeInRaw >= 0
        ? Math.min(durationMs, Math.round(fadeInRaw * 1000))
        : 0;
    const fadeOutMs =
      Number.isFinite(fadeOutRaw) && fadeOutRaw >= 0
        ? Math.min(Math.max(0, durationMs - fadeInMs), Math.round(fadeOutRaw * 1000))
        : 0;

    result.push({
      id: nextId("mus"),
      lane: "music",
      src: span.url,
      anchorId: anchor.keyframe.id,
      offsetMs,
      inMs: 0,
      durationMs,
      gain: Math.max(0, Math.min(2, Number.isFinite(span.level) ? span.level : 0.55)),
      fadeInMs,
      fadeOutMs,
      loop: span.loop,
    });
  }

  // 3. Ambience: one clip per scene ambience span
  const ambienceSpans = resolveAmbienceSpans(clips, totalFrames);
  for (const span of ambienceSpans) {
    const anchor = clipById.get(span.id) || clips[0];
    const startMs = frameToMs(span.startFrame);
    const endMs = frameToMs(span.endFrame);
    const durationMs = Math.max(MIN_AUDIO_CLIP_MS, roundMicros(endMs - startMs));
    const offsetMs = roundMicros(startMs - frameToMs(anchor.startFrame));
    const fadeMs = Math.min(300, Math.floor(durationMs / 4));

    result.push({
      id: nextId("amb"),
      lane: "ambience",
      src: span.title,
      anchorId: anchor.keyframe.id,
      offsetMs,
      inMs: 0,
      durationMs,
      gain: 0.65,
      fadeInMs: fadeMs,
      fadeOutMs: fadeMs,
      loop: true,
    });
  }

  return result;
}

export function ensureProjectAudioClips(
  project: ProjectState,
  audioDurations?: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  if (Array.isArray(project.audioClips)) return project;
  return {
    ...project,
    audioClips: buildAudioClipsFromFilm(project.story, audioDurations, musicDurations),
  };
}

export function rebuildProjectAudioClips(
  project: ProjectState,
  audioDurations?: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  return {
    ...project,
    audioClips: buildAudioClipsFromFilm(project.story, audioDurations, musicDurations),
    updatedAt: Date.now(),
  };
}

export function clipUnderMs(
  timelineClips: readonly TimelineClip[],
  targetStartMs: number,
): TimelineClip | undefined {
  if (!timelineClips.length) return undefined;
  const frameFloat = msToFrameFloat(targetStartMs);
  if (frameFloat <= timelineClips[0].startFrame) return timelineClips[0];
  const last = timelineClips[timelineClips.length - 1];
  if (frameFloat >= last.endFrame) return last;

  let lo = 0;
  let hi = timelineClips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = timelineClips[mid];
    if (frameFloat < c.startFrame) {
      hi = mid - 1;
    } else if (frameFloat >= c.endFrame) {
      lo = mid + 1;
    } else {
      return c;
    }
  }
  return last;
}

export function resolveAudioClips(
  audioClips: readonly AudioClip[] | undefined,
  timelineClips: readonly TimelineClip[],
): ResolvedAudioClip[] {
  if (!audioClips?.length || !timelineClips.length) return [];
  const anchorMap = new Map<string, TimelineClip>();
  for (const clip of timelineClips) {
    anchorMap.set(clip.keyframe.id, clip);
  }
  const fallbackAnchor = timelineClips[0];

  return audioClips.map((ac) => {
    const anchor = anchorMap.get(ac.anchorId) || fallbackAnchor;
    const anchorStartMs = frameToMs(anchor.startFrame);
    const startMs = roundMicros(anchorStartMs + ac.offsetMs);
    const endMs = roundMicros(startMs + ac.durationMs);
    return {
      ...ac,
      anchorId: anchor.keyframe.id,
      anchorStartMs,
      startMs,
      endMs,
    };
  });
}

/**
 * Re-anchors `clip` to the picture clip under `targetStartMs`, preserving the exact
 * timeline start time in milliseconds (`anchorStartMs + offsetMs === targetStartMs`).
 */
export function reanchorAudioClipToMs(
  clip: AudioClip,
  targetStartMs: number,
  timelineClips: readonly TimelineClip[],
): AudioClip {
  const safeTargetMs = Math.max(0, roundMicros(targetStartMs));
  const owner = clipUnderMs(timelineClips, safeTargetMs);
  if (!owner) {
    return { ...clip, offsetMs: safeTargetMs };
  }
  const anchorStartMs = frameToMs(owner.startFrame);
  const offsetMs = roundMicros(safeTargetMs - anchorStartMs);
  return {
    ...clip,
    anchorId: owner.keyframe.id,
    offsetMs,
  };
}

export function trimAudioClipLeft(
  resolved: ResolvedAudioClip,
  targetStartMs: number,
  timelineClips: readonly TimelineClip[],
  fileDurationMs?: number,
): AudioClip {
  const minStartByEnd = resolved.endMs - MIN_AUDIO_CLIP_MS;
  let minStartMs = 0;
  if (!resolved.loop) {
    // Cannot pull left past the file's beginning (inMs = 0)
    minStartMs = Math.max(0, roundMicros(resolved.startMs - resolved.inMs));
  }
  const clampedStartMs = Math.max(
    minStartMs,
    Math.min(minStartByEnd, roundMicros(targetStartMs)),
  );
  const deltaMs = roundMicros(clampedStartMs - resolved.startMs);
  const nextDurationMs = Math.max(MIN_AUDIO_CLIP_MS, roundMicros(resolved.durationMs - deltaMs));
  let nextInMs = roundMicros(resolved.inMs + deltaMs);
  if (resolved.loop && fileDurationMs && fileDurationMs > 0) {
    nextInMs = roundMicros(((nextInMs % fileDurationMs) + fileDurationMs) % fileDurationMs);
  } else {
    nextInMs = Math.max(0, nextInMs);
  }
  const fadeOutMs = Math.min(resolved.fadeOutMs, nextDurationMs);
  const fadeInMs = Math.min(resolved.fadeInMs, Math.max(0, nextDurationMs - fadeOutMs));
  const { anchorStartMs: _a, startMs: _s, endMs: _e, ...plain } = resolved;
  return reanchorAudioClipToMs(
    {
      ...plain,
      inMs: nextInMs,
      durationMs: nextDurationMs,
      fadeInMs,
      fadeOutMs,
    },
    clampedStartMs,
    timelineClips,
  );
}

export function trimAudioClipRight(
  resolved: ResolvedAudioClip,
  targetEndMs: number,
  fileDurationMs?: number,
): AudioClip {
  let maxDurationMs = Number.POSITIVE_INFINITY;
  if (!resolved.loop && fileDurationMs !== undefined && fileDurationMs > 0) {
    maxDurationMs = Math.max(MIN_AUDIO_CLIP_MS, roundMicros(fileDurationMs - resolved.inMs));
  }
  const rawDurationMs = roundMicros(targetEndMs - resolved.startMs);
  const nextDurationMs = Math.max(
    MIN_AUDIO_CLIP_MS,
    Math.min(maxDurationMs, rawDurationMs),
  );
  const fadeInMs = Math.min(resolved.fadeInMs, nextDurationMs);
  const fadeOutMs = Math.min(resolved.fadeOutMs, Math.max(0, nextDurationMs - fadeInMs));
  const { anchorStartMs: _a, startMs: _s, endMs: _e, ...plain } = resolved;
  return {
    ...plain,
    durationMs: nextDurationMs,
    fadeInMs,
    fadeOutMs,
  };
}

export interface SnapAudioOptions {
  pxPerFrame: number;
  snapEnabled: boolean;
  ignoreSnap?: boolean;
  playheadMs: number;
  timelineClips: readonly TimelineClip[];
  noteMarkers?: readonly NoteMarker[];
  otherAudioClips?: readonly ResolvedAudioClip[];
  excludeAudioIds?: ReadonlySet<string>;
}

export function snapAudioMs(
  rawMs: number,
  options: SnapAudioOptions,
): { ms: number; snapped: boolean; snapFrameApprox: number | null } {
  const safeRaw = Math.max(0, roundMicros(rawMs));
  if (!options.snapEnabled || options.ignoreSnap) {
    return { ms: safeRaw, snapped: false, snapFrameApprox: null };
  }

  const pxPerMs = (options.pxPerFrame * FPS) / 1000;
  if (pxPerMs <= 0) return { ms: safeRaw, snapped: false, snapFrameApprox: null };
  const thresholdMs = SNAP_DISTANCE_PX / pxPerMs;

  const candidates: number[] = [options.playheadMs];

  // Nearest whole frame boundary when zoomed in enough that frame snapping doesn't swallow coarse drags
  const nearestFrame = Math.round(msToFrameFloat(safeRaw));
  if (options.pxPerFrame >= 6) {
    candidates.push(frameToMs(nearestFrame));
  }

  // Picture cuts around rawMs
  const centerIdx = timelineClips.indexOfClipNear(options.timelineClips, safeRaw);
  const lo = Math.max(0, centerIdx - 20);
  const hi = Math.min(options.timelineClips.length - 1, centerIdx + 20);
  for (let i = lo; i <= hi; i += 1) {
    const c = options.timelineClips[i];
    candidates.push(frameToMs(c.startFrame), frameToMs(c.endFrame));
  }

  // Markers
  for (const m of options.noteMarkers ?? []) {
    candidates.push(frameToMs(m.frame));
  }

  // Other audio clips' start & end edges
  for (const other of options.otherAudioClips ?? []) {
    if (options.excludeAudioIds?.has(other.id)) continue;
    candidates.push(other.startMs, other.endMs);
  }

  let bestMs = safeRaw;
  let bestDist = thresholdMs;
  let snapped = false;

  for (const cand of candidates) {
    const dist = Math.abs(cand - safeRaw);
    if (dist <= bestDist) {
      bestDist = dist;
      bestMs = roundMicros(cand);
      snapped = true;
    }
  }

  return {
    ms: bestMs,
    snapped,
    snapFrameApprox: snapped ? msToFrameFloat(bestMs) : null,
  };
}

const timelineClips = {
  indexOfClipNear(clips: readonly TimelineClip[], ms: number): number {
    if (!clips.length) return 0;
    const hit = clipUnderMs(clips, ms);
    return hit ? hit.index : 0;
  },
};

export interface ScheduledClipSlice {
  clip: ResolvedAudioClip;
  /** Offset in ms from `currentPlayheadMs` at which `sourceNode.start` should fire (`0` if already active under playhead). */
  startWhenOffsetMs: number;
  /** Offset in ms inside the decoded audio file (`AudioBufferSourceNode.start(when, offsetInFileSec, remainingSec)`). */
  offsetInFileMs: number;
  /** Remaining playback duration in ms from `startWhenOffsetMs`. */
  remainingMs: number;
  /** Elapsed ms inside the clip at the moment it starts (`0` for future clips, `playheadMs - clip.startMs` for mid-clip seek). */
  elapsedInClipMs: number;
  /** Linear gain ramp control points `(offsetMsFromStart, gainValue)` for `GainNode.gain`. */
  gainEnvelope: Array<{ offsetMs: number; gain: number }>;
}

export function evaluateClipGainAtElapsedMs(clip: AudioClip, elapsedMs: number): number {
  const dur = Math.max(1, clip.durationMs);
  const t = Math.max(0, Math.min(dur, elapsedMs));
  const targetGain = Math.max(0, clip.gain);
  if (clip.fadeInMs > 0 && t < clip.fadeInMs) {
    return targetGain * (t / clip.fadeInMs);
  }
  const fadeOutStart = dur - clip.fadeOutMs;
  if (clip.fadeOutMs > 0 && t > fadeOutStart) {
    return targetGain * Math.max(0, (dur - t) / clip.fadeOutMs);
  }
  return targetGain;
}

export function buildClipGainEnvelope(
  clip: AudioClip,
  elapsedInClipMs: number,
  remainingMs: number,
): Array<{ offsetMs: number; gain: number }> {
  const t0 = Math.max(0, elapsedInClipMs);
  const tEnd = Math.min(clip.durationMs, t0 + remainingMs);
  const points: Array<{ offsetMs: number; gain: number }> = [
    { offsetMs: 0, gain: evaluateClipGainAtElapsedMs(clip, t0) },
  ];

  const fadeInEnd = Math.min(clip.durationMs, Math.max(0, clip.fadeInMs));
  const fadeOutStart = Math.max(fadeInEnd, clip.durationMs - Math.max(0, clip.fadeOutMs));

  if (fadeInEnd > t0 && fadeInEnd <= tEnd) {
    points.push({
      offsetMs: roundMicros(fadeInEnd - t0),
      gain: evaluateClipGainAtElapsedMs(clip, fadeInEnd),
    });
  }
  if (fadeOutStart > t0 && fadeOutStart < tEnd) {
    points.push({
      offsetMs: roundMicros(fadeOutStart - t0),
      gain: evaluateClipGainAtElapsedMs(clip, fadeOutStart),
    });
  }
  if (tEnd > t0) {
    points.push({
      offsetMs: roundMicros(tEnd - t0),
      gain: clip.fadeOutMs > 0 && tEnd >= clip.durationMs ? 0 : evaluateClipGainAtElapsedMs(clip, tEnd),
    });
  }
  return points;
}

export interface ComputeScheduleOptions {
  /** Include clips already playing under `currentPlayheadMs` (`clip.startMs <= currentPlayheadMs < clip.endMs`). True on play/seek/scrub. */
  includeActiveAtPlayhead: boolean;
  /** Window lower bound for upcoming clip starts (`>= windowFromMs`). Defaults to `currentPlayheadMs`. */
  windowFromMs?: number;
  /** Lookahead window length in ms from `currentPlayheadMs` (default `300` ms). */
  lookaheadMs?: number;
  /** Already-scheduled clip IDs to skip on incremental lookahead ticks. */
  alreadyScheduledIds?: ReadonlySet<string>;
  /** Known natural file durations in ms by `src` so non-looping clips stop at file end. */
  fileDurationsMs?: ReadonlyMap<string, number>;
}

/**
 * Pure lookahead scheduler: for `currentPlayheadMs`, determines which `AudioClip`s should
 * start (either immediately mid-file on seek/play, or within the next `lookaheadMs`),
 * and at what exact `offsetInFileMs` and `remainingMs`.
 */
export function computeScheduleWindow(
  resolvedClips: readonly ResolvedAudioClip[],
  currentPlayheadMs: number,
  options: ComputeScheduleOptions,
): ScheduledClipSlice[] {
  const lookaheadMs = options.lookaheadMs ?? 300;
  const windowEndMs = currentPlayheadMs + lookaheadMs;
  const windowFromMs = options.windowFromMs ?? currentPlayheadMs;
  const slices: ScheduledClipSlice[] = [];

  for (const clip of resolvedClips) {
    if (options.alreadyScheduledIds?.has(clip.id)) continue;
    if (clip.durationMs <= 0 || clip.endMs <= currentPlayheadMs) continue;

    const startsUnderPlayhead =
      options.includeActiveAtPlayhead &&
      clip.startMs <= currentPlayheadMs &&
      clip.endMs > currentPlayheadMs;
    const startsInLookahead =
      clip.startMs >= windowFromMs &&
      clip.startMs > currentPlayheadMs &&
      clip.startMs < windowEndMs;
    const startsExactlyAtWindowFrom =
      !options.includeActiveAtPlayhead &&
      clip.startMs >= windowFromMs &&
      clip.startMs < windowEndMs;

    if (!startsUnderPlayhead && !startsInLookahead && !startsExactlyAtWindowFrom) {
      continue;
    }

    const startWhenOffsetMs = clip.startMs <= currentPlayheadMs
      ? 0
      : roundMicros(clip.startMs - currentPlayheadMs);
    const elapsedInClipMs = clip.startMs <= currentPlayheadMs
      ? roundMicros(currentPlayheadMs - clip.startMs)
      : 0;
    const remainingClipMs = roundMicros(clip.durationMs - elapsedInClipMs);
    if (remainingClipMs <= 0) continue;

    const rawOffsetMs = roundMicros(clip.inMs + elapsedInClipMs);
    const naturalFileMs = options.fileDurationsMs?.get(clip.src);

    let offsetInFileMs = rawOffsetMs;
    let remainingMs = remainingClipMs;

    if (clip.loop) {
      if (naturalFileMs !== undefined && naturalFileMs > 0) {
        offsetInFileMs = roundMicros(((rawOffsetMs % naturalFileMs) + naturalFileMs) % naturalFileMs);
      }
    } else if (naturalFileMs !== undefined && naturalFileMs > 0) {
      if (rawOffsetMs >= naturalFileMs) continue;
      remainingMs = Math.min(remainingClipMs, roundMicros(naturalFileMs - rawOffsetMs));
      if (remainingMs <= 0) continue;
    }

    slices.push({
      clip,
      startWhenOffsetMs,
      offsetInFileMs,
      remainingMs,
      elapsedInClipMs,
      gainEnvelope: buildClipGainEnvelope(clip, elapsedInClipMs, remainingMs),
    });
  }

  return slices;
}

export function isVoicePlayingAtMs(
  resolvedClips: readonly ResolvedAudioClip[],
  timeMs: number,
  trackMix?: TrackMixMap,
): boolean {
  if (trackMix && effectiveTrackLevel(trackMix, "voice") <= 0) return false;
  return resolvedClips.some(
    (c) =>
      c.lane === "voice" &&
      c.gain > 0 &&
      timeMs >= c.startMs &&
      timeMs < c.endMs,
  );
}

export interface LaneBand {
  top: number;
  bottom: number;
}

export interface TimelineLaneBands {
  captions?: LaneBand;
  video?: LaneBand;
  voice?: LaneBand;
  sfx?: LaneBand;
  music?: LaneBand;
  ambience?: LaneBand;
}

export interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function bandIntersects(band: LaneBand | undefined, minY: number, maxY: number): boolean {
  if (!band) return false;
  return maxY >= band.top && minY <= band.bottom;
}

/**
 * Pure multi-lane marquee box hit-test across Captions, Video (plus keyframe diamonds),
 * Voice, SFX, Music, and Ambience.
 */
export function hitTestMarqueeBox(
  rect: MarqueeRect,
  bands: TimelineLaneBands,
  timelineClips: readonly TimelineClip[],
  resolvedAudioClips: readonly ResolvedAudioClip[],
  pxPerFrame: number,
): MultiLaneSelection {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const safePpf = Math.max(0.0001, pxPerFrame);
  const minFrame = minX / safePpf;
  const maxFrame = maxX / safePpf;
  const minMs = frameToMs(minFrame);
  const maxMs = frameToMs(maxFrame);

  const pictureIds: string[] = [];
  const captions: Array<{ frameId: string; index: number }> = [];
  const audioClipIds: string[] = [];
  const keyframes: SelectedKeyframeDiamond[] = [];

  const hitCaptions = bandIntersects(bands.captions, minY, maxY);
  const hitVideo = bandIntersects(bands.video, minY, maxY);

  if (hitCaptions || hitVideo) {
    for (const clip of timelineClips) {
      if (clip.endFrame < minFrame || clip.startFrame > maxFrame) continue;

      if (hitVideo) {
        pictureIds.push(clip.keyframe.id);
        const anim = clip.keyframe.beat.animation;
        if (anim) {
          for (const prop of ["zoom", "x", "y"] as const) {
            for (const key of anim[prop] ?? []) {
              const globalKeyFrame = clip.startFrame + key.frame;
              if (globalKeyFrame >= minFrame && globalKeyFrame <= maxFrame) {
                keyframes.push({
                  frameId: clip.keyframe.id,
                  prop,
                  frame: key.frame,
                });
              }
            }
          }
        }
      }

      if (hitCaptions) {
        const caps = effectiveCaptionsForBeat(clip.keyframe.beat, clip.durationFrames);
        caps.forEach((cap, idx) => {
          const capGlobalIn = clip.startFrame + cap.inFrame;
          const capGlobalOut = clip.startFrame + cap.outFrame;
          if (capGlobalOut >= minFrame && capGlobalIn <= maxFrame) {
            captions.push({ frameId: clip.keyframe.id, index: idx });
          }
        });
      }
    }
  }

  for (const lane of AUDIO_LANES) {
    if (!bandIntersects(bands[lane], minY, maxY)) continue;
    for (const ac of resolvedAudioClips) {
      if (ac.lane !== lane) continue;
      if (ac.endMs >= minMs && ac.startMs <= maxMs) {
        audioClipIds.push(ac.id);
      }
    }
  }

  return {
    pictureIds,
    captions,
    audioClipIds,
    keyframes,
  };
}

export function combineMarqueeSelections(
  base: MultiLaneSelection,
  hit: MultiLaneSelection,
  mode: "replace" | "add" | "subtract",
): MultiLaneSelection {
  if (mode === "replace") return hit;

  if (mode === "add") {
    const picSet = new Set([...base.pictureIds, ...hit.pictureIds]);
    const audSet = new Set([...base.audioClipIds, ...hit.audioClipIds]);
    const capMap = new Map<string, { frameId: string; index: number }>();
    for (const c of [...base.captions, ...hit.captions]) {
      capMap.set(`${c.frameId}:${c.index}`, c);
    }
    const kfMap = new Map<string, SelectedKeyframeDiamond>();
    for (const k of [...base.keyframes, ...hit.keyframes]) {
      kfMap.set(`${k.frameId}:${k.prop}:${k.frame}`, k);
    }
    return {
      pictureIds: [...picSet],
      captions: [...capMap.values()],
      audioClipIds: [...audSet],
      keyframes: [...kfMap.values()],
    };
  }

  // subtract (Alt+drag)
  const dropPic = new Set(hit.pictureIds);
  const dropAud = new Set(hit.audioClipIds);
  const dropCap = new Set(hit.captions.map((c) => `${c.frameId}:${c.index}`));
  const dropKf = new Set(hit.keyframes.map((k) => `${k.frameId}:${k.prop}:${k.frame}`));

  return {
    pictureIds: base.pictureIds.filter((id) => !dropPic.has(id)),
    captions: base.captions.filter((c) => !dropCap.has(`${c.frameId}:${c.index}`)),
    audioClipIds: base.audioClipIds.filter((id) => !dropAud.has(id)),
    keyframes: base.keyframes.filter((k) => !dropKf.has(`${k.frameId}:${k.prop}:${k.frame}`)),
  };
}
