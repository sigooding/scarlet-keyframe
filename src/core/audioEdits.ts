// Cutting and shaping a sound clip: the edits a music cue needs that dragging its edges cannot do.
//
// Every function here is pure: it takes the clip as the timeline resolved it (so it knows where the clip really
// starts and ends in milliseconds) and gives back plain clips to store. Nothing here reads or writes a file: a cut
// only moves the in-point, so the recording on disk is never touched.

import {
  MIN_AUDIO_CLIP_MS,
  reanchorAudioClipToMs,
  roundMicros,
  trimAudioClipLeft,
  trimAudioClipRight,
  volumeScaleAtMs,
  type AudioClip,
  type AudioVolumeKey,
  type ResolvedAudioClip,
} from "./audioClips";
import type { TimelineClip } from "../sequence/animate";

/** Strips the fields the timeline works out, leaving the clip as it is stored. */
export function plainAudioClip(resolved: ResolvedAudioClip | AudioClip): AudioClip {
  const { anchorStartMs: _a, startMs: _s, endMs: _e, ...plain } = resolved as ResolvedAudioClip;
  return { ...plain };
}

/** Fades that fit inside `durationMs` and never overlap each other. */
function clampFades(durationMs: number, fadeInMs: number, fadeOutMs: number): { fadeInMs: number; fadeOutMs: number } {
  const dur = Math.max(0, durationMs);
  const fadeIn = Math.max(0, Math.min(dur, fadeInMs));
  const fadeOut = Math.max(0, Math.min(dur - fadeIn, fadeOutMs));
  return { fadeInMs: roundMicros(fadeIn), fadeOutMs: roundMicros(fadeOut) };
}

/** The file position `elapsedMs` into the clip, wrapped around the file for a looping clip. */
function inPointAfter(clip: AudioClip, elapsedMs: number, fileDurationMs?: number): number {
  const raw = roundMicros(clip.inMs + Math.max(0, elapsedMs));
  if (clip.loop && fileDurationMs && fileDurationMs > 0) {
    return roundMicros(((raw % fileDurationMs) + fileDurationMs) % fileDurationMs);
  }
  return Math.max(0, raw);
}

/** Splits a volume curve at `atMs` into the part before and the part after, each keeping its own shape. */
export function splitVolumeKeys(
  clip: Pick<AudioClip, "volumeKeys" | "durationMs">,
  atMs: number,
): { left?: AudioVolumeKey[]; right?: AudioVolumeKey[] } {
  const keys = clip.volumeKeys;
  if (!keys || keys.length === 0) return {};
  const boundary = roundMicros(volumeScaleAtMs(clip, atMs));
  const left: AudioVolumeKey[] = keys
    .filter((key) => key.atMs < atMs)
    .map((key) => ({ atMs: roundMicros(Math.max(0, key.atMs)), gain: key.gain }));
  const right: AudioVolumeKey[] = keys
    .filter((key) => key.atMs > atMs)
    .map((key) => ({ atMs: roundMicros(key.atMs - atMs), gain: key.gain }));
  // A point exactly on the cut, so neither side's curve changes shape where it was severed.
  left.push({ atMs: roundMicros(atMs), gain: boundary });
  right.unshift({ atMs: 0, gain: boundary });
  left.sort((a, b) => a.atMs - b.atMs);
  right.sort((a, b) => a.atMs - b.atMs);
  return { left, right };
}

export interface SplitAudioClipResult {
  /** The part before the cut: the clip as it was, ending at the cut. */
  left: AudioClip;
  /** The part after the cut: a new clip, playing on from the same place in the file. */
  right: AudioClip;
}

export interface SplitAudioClipOptions {
  /** The id for the new second half. Defaults to the first half's id with `-b`. */
  newId?: string;
  /** How long the recording is, so a looping clip's in-point wraps correctly. */
  fileDurationMs?: number;
}

/**
 * Cuts one sound clip in two at `atMs` on the timeline. Both halves play exactly what the one clip played:
 * the second half picks the recording up where the first left it. The cut itself is a hard cut, so no fade is
 * put at the join; a fade the clip already had stays on the side it belongs to (the fade-in on the first half,
 * the fade-out on the second). Returns null if the cut is not inside the clip, or would leave a sliver of
 * less than `MIN_AUDIO_CLIP_MS` on either side.
 */
export function splitAudioClipAtMs(
  resolved: ResolvedAudioClip,
  atMs: number,
  timelineClips: readonly TimelineClip[],
  options: SplitAudioClipOptions = {},
): SplitAudioClipResult | null {
  const cut = roundMicros(atMs);
  const leftDurationMs = roundMicros(cut - resolved.startMs);
  const rightDurationMs = roundMicros(resolved.endMs - cut);
  if (leftDurationMs < MIN_AUDIO_CLIP_MS || rightDurationMs < MIN_AUDIO_CLIP_MS) return null;

  const plain = plainAudioClip(resolved);
  const curves = splitVolumeKeys(resolved, leftDurationMs);

  const left: AudioClip = {
    ...plain,
    durationMs: leftDurationMs,
    ...clampFades(leftDurationMs, resolved.fadeInMs, 0),
    ...(curves.left ? { volumeKeys: curves.left } : {}),
  };
  if (!curves.left) delete left.volumeKeys;

  const right: AudioClip = reanchorAudioClipToMs(
    {
      ...plain,
      id: options.newId ?? `${resolved.id}-b`,
      inMs: inPointAfter(plain, leftDurationMs, options.fileDurationMs),
      durationMs: rightDurationMs,
      ...clampFades(rightDurationMs, 0, resolved.fadeOutMs),
      ...(curves.right ? { volumeKeys: curves.right } : {}),
    },
    cut,
    timelineClips,
  );
  if (!curves.right) delete right.volumeKeys;

  return { left, right };
}

/**
 * Pulls one edge of a clip to `atMs`: the start edge keeps the recording lined up with the picture (its
 * in-point moves with it), the end edge just stops the clip sooner or later. Returns null when the edge is
 * already there or the move would leave less than `MIN_AUDIO_CLIP_MS`.
 */
export function trimAudioClipEdgeToMs(
  resolved: ResolvedAudioClip,
  edge: "start" | "end",
  atMs: number,
  timelineClips: readonly TimelineClip[],
  fileDurationMs?: number,
): AudioClip | null {
  const target = roundMicros(atMs);
  if (edge === "start") {
    if (target >= roundMicros(resolved.endMs - MIN_AUDIO_CLIP_MS)) return null;
    const next = trimAudioClipLeft(resolved, target, timelineClips, fileDurationMs);
    return sameClip(next, resolved) ? null : next;
  }
  if (target <= roundMicros(resolved.startMs + MIN_AUDIO_CLIP_MS)) return null;
  const next = trimAudioClipRight(resolved, target, fileDurationMs);
  return sameClip(next, resolved) ? null : next;
}

function sameClip(next: AudioClip, resolved: ResolvedAudioClip): boolean {
  return (
    next.anchorId === resolved.anchorId &&
    Math.abs(next.offsetMs - resolved.offsetMs) < 0.5 &&
    Math.abs(next.inMs - resolved.inMs) < 0.5 &&
    Math.abs(next.durationMs - resolved.durationMs) < 0.5
  );
}

export interface CrossfadeResult {
  outgoing: AudioClip;
  incoming: AudioClip;
  /** How much of an overlap there really is, which can be less than asked for. */
  overlapMs: number;
  /** Where the overlap came from: the first cue playing on, the second starting early, or both. */
  from: "tail" | "head" | "both" | "none";
}

export interface CrossfadeOptions {
  /** How long each recording is, so neither clip is asked to play past its end. */
  outgoingFileMs?: number;
  incomingFileMs?: number;
}

/**
 * Crossfades one cue into the next over `requestedMs`: the two are made to overlap and each is given a matching
 * ramp, so one comes up as the other goes down. The overlap is taken first from the outgoing cue's tail (the rest
 * of its recording, which leaves the incoming cue exactly where it is), then from the incoming cue's head. When
 * neither recording has anything spare the two simply meet, and the ramps become a fade-out into a fade-in
 * (`overlapMs` 0, `from` "none"). Returns null if the second clip does not come after the first.
 */
export function crossfadeAudioClips(
  outgoing: ResolvedAudioClip,
  incoming: ResolvedAudioClip,
  requestedMs: number,
  timelineClips: readonly TimelineClip[],
  options: CrossfadeOptions = {},
): CrossfadeResult | null {
  if (incoming.startMs < outgoing.startMs) return null;
  const want = Math.max(0, roundMicros(requestedMs));
  if (want <= 0) return null;

  // The first cue should play on until `want` past the moment the second one starts. It is held back only by the
  // end of its own recording; whatever it cannot cover, the second cue makes up by starting that much earlier.
  const tailLimitMs =
    outgoing.loop || !options.outgoingFileMs || options.outgoingFileMs <= 0
      ? Number.POSITIVE_INFINITY
      : roundMicros(outgoing.startMs + Math.max(0, options.outgoingFileMs - outgoing.inMs));
  const headRoomMs = incoming.loop ? Number.POSITIVE_INFINITY : Math.max(0, incoming.inMs);

  const wantedEndMs = roundMicros(incoming.startMs + want);
  const outgoingEndMs = Math.max(
    roundMicros(outgoing.startMs + MIN_AUDIO_CLIP_MS),
    Math.min(wantedEndMs, tailLimitMs),
  );
  const headUsed = Math.min(Math.max(0, roundMicros(wantedEndMs - outgoingEndMs)), headRoomMs);
  const incomingStartMs = roundMicros(incoming.startMs - headUsed);
  const overlapMs = Math.max(0, roundMicros(outgoingEndMs - incomingStartMs));

  const tailMoved = Math.abs(outgoingEndMs - outgoing.endMs) > 0.5;
  let nextOutgoing = plainAudioClip(outgoing);
  if (tailMoved) {
    nextOutgoing = trimAudioClipRight(outgoing, outgoingEndMs, options.outgoingFileMs);
  }
  let nextIncoming = plainAudioClip(incoming);
  if (headUsed > 0.5) {
    nextIncoming = trimAudioClipLeft(incoming, incomingStartMs, timelineClips, options.incomingFileMs);
  }

  const ramp = overlapMs > 0 ? overlapMs : want;
  const outFades = clampFades(nextOutgoing.durationMs, nextOutgoing.fadeInMs, ramp);
  const inFades = clampFades(nextIncoming.durationMs, ramp, nextIncoming.fadeOutMs);

  return {
    outgoing: { ...nextOutgoing, ...outFades },
    incoming: { ...nextIncoming, ...inFades },
    overlapMs,
    from:
      overlapMs <= 0
        ? "none"
        : tailMoved && headUsed > 0.5
          ? "both"
          : headUsed > 0.5
            ? "head"
            : "tail",
  };
}

export interface FitAudioClipOptions {
  /** How long the recording is. Without it the clip is simply stretched to the span. */
  fileDurationMs?: number;
  /** Let the clip loop when the recording is too short to cover the span. Default true. */
  allowLoop?: boolean;
  /** Keep the clip's fades, shortened to fit. Default true. */
  keepFades?: boolean;
}

export interface FitAudioClipResult {
  clip: AudioClip;
  /** True when the recording was too short and the clip was set to loop to reach the end. */
  looped: boolean;
  /** True when the recording ran out and the clip had to stop short of the span. */
  short: boolean;
}

/**
 * Lays a clip across a span of the timeline, from `startMs` to `endMs`: the cue starts at the top of the span and
 * runs to its end. When the recording is too short it is looped to reach the end, or, if looping is not wanted,
 * the clip stops when the recording does and `short` says so.
 */
export function fitAudioClipToSpanMs(
  resolved: ResolvedAudioClip,
  startMs: number,
  endMs: number,
  timelineClips: readonly TimelineClip[],
  options: FitAudioClipOptions = {},
): FitAudioClipResult {
  const from = Math.max(0, roundMicros(startMs));
  const spanMs = Math.max(MIN_AUDIO_CLIP_MS, roundMicros(endMs - from));
  const allowLoop = options.allowLoop ?? true;
  const keepFades = options.keepFades ?? true;
  const plain = plainAudioClip(resolved);

  const room =
    options.fileDurationMs && options.fileDurationMs > 0
      ? Math.max(MIN_AUDIO_CLIP_MS, roundMicros(options.fileDurationMs - plain.inMs))
      : Number.POSITIVE_INFINITY;
  const tooShort = spanMs > room;
  const looped = tooShort && allowLoop;
  const durationMs = tooShort && !allowLoop ? room : spanMs;
  const fades = keepFades
    ? clampFades(durationMs, plain.fadeInMs, plain.fadeOutMs)
    : { fadeInMs: 0, fadeOutMs: 0 };

  const clip = reanchorAudioClipToMs(
    {
      ...plain,
      durationMs,
      ...fades,
      ...(looped ? { loop: true } : {}),
    },
    from,
    timelineClips,
  );
  return { clip, looped, short: tooShort && !allowLoop };
}

export interface DuplicateAudioClipOptions {
  newId?: string;
  /** Where the copy starts. Defaults to the moment the original ends. */
  startMs?: number;
}

/** A copy of a clip, by default laid down where the original ends, so a cue can be carried on. */
export function duplicateAudioClip(
  resolved: ResolvedAudioClip,
  timelineClips: readonly TimelineClip[],
  options: DuplicateAudioClipOptions = {},
): AudioClip {
  const startMs = Math.max(0, roundMicros(options.startMs ?? resolved.endMs));
  return reanchorAudioClipToMs(
    { ...plainAudioClip(resolved), id: options.newId ?? `${resolved.id}-copy` },
    startMs,
    timelineClips,
  );
}

/** The clip on the same lane that starts next after this one (the cue a crossfade would run into). */
export function nextClipOnLane(
  clips: readonly ResolvedAudioClip[],
  clip: ResolvedAudioClip,
): ResolvedAudioClip | undefined {
  return clips
    .filter((other) => other.lane === clip.lane && other.id !== clip.id && other.startMs >= clip.startMs)
    .sort((a, b) => a.startMs - b.startMs)[0];
}

/** One job the clip tools can ask for: what the buttons in the sound tabs send back to the app. */
export type AudioClipTool =
  | { kind: "split" }
  | { kind: "trim"; edge: "start" | "end" }
  | { kind: "duplicate" }
  | { kind: "fit"; span: "shot" | "scene" }
  | { kind: "crossfade"; ms: number }
  | { kind: "fade"; edge: "in" | "out"; ms: number };
