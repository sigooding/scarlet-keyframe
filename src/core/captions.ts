import { balanceLines, cuesForText, splitLongCue } from "./captionCues";
import type { BeatLike, Keyframe, NoteMarker } from "./model";
import { FPS, srtTime } from "./timing";

export const CAPTION_MAX_LINE_CHARS = 42;
export const CAPTION_MAX_CPS = 17;

export interface BeatCaption {
  text: string;
  inFrame: number;
  outFrame: number;
  /** True when freely moved/trimmed on the timeline (allowed to span across shot cuts). */
  free?: boolean;
  /** Preserves original speaker name when moved onto a different beat. */
  speaker?: string;
  /** Preserves narration italic styling when moved onto a different beat. */
  isNarration?: boolean;
}

export interface ResolvedTimelineCaption {
  id: string;
  frameId: string;
  captionIndex: number;
  text: string;
  inFrame: number;
  outFrame: number;
  globalInFrame: number;
  globalOutFrame: number;
  speaker: string;
  isNarration: boolean;
  free: boolean;
}

export interface CaptionStyle {
  position: "bottom" | "top";
  size: "S" | "M" | "L";
  backgroundBox: boolean;
  showSpeaker: boolean;
  italicNarration: boolean;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  position: "bottom",
  size: "M",
  backgroundBox: true,
  showSpeaker: true,
  italicNarration: true,
};

export function normalizeCaptionStyle(raw: Partial<CaptionStyle> | undefined): CaptionStyle {
  return {
    position: raw?.position === "top" ? "top" : "bottom",
    size: raw?.size === "S" || raw?.size === "L" ? raw.size : "M",
    backgroundBox: raw?.backgroundBox !== false,
    showSpeaker: raw?.showSpeaker !== false,
    italicNarration: raw?.italicNarration !== false,
  };
}

export interface CaptionMetrics {
  lines: string[];
  lineCount: number;
  overTwoLines: boolean;
  charCount: number;
  durationSeconds: number;
  cps: number;
  tooFast: boolean;
}

export function isNarrationBeat(beat: Pick<BeatLike, "characterId" | "audioUrl" | "silent">): boolean {
  const cid = String(beat.characterId || "");
  return cid === "narrator" || /(^|_)narrator$/i.test(cid) || (!beat.audioUrl && Boolean(beat.silent));
}

export function hasAuthoredCaptions(beat: BeatLike): boolean {
  return Array.isArray(beat.captions);
}

/**
 * Clamp and sort an authored captions array so every caption stays strictly inside
 * `[0, clipDurationFrames]` with `inFrame < outFrame` and without overlapping neighbours.
 */
export function normalizeCaptions(
  captions: readonly BeatCaption[],
  clipDurationFrames: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const sorted = [...captions]
    .map((cap) => ({
      text: String(cap.text ?? ""),
      inFrame: Math.max(0, Math.round(Number(cap.inFrame) || 0)),
      outFrame: Math.round(Number(cap.outFrame) || 0),
      ...(cap.free ? { free: true } : {}),
      ...(cap.speaker !== undefined ? { speaker: cap.speaker } : {}),
      ...(cap.isNarration !== undefined ? { isNarration: cap.isNarration } : {}),
    }))
    .sort((a, b) => a.inFrame - b.inFrame || a.outFrame - b.outFrame);

  const out: BeatCaption[] = [];
  let cursor = 0;
  for (const cap of sorted) {
    if (cap.free) {
      const start = Math.max(cursor, cap.inFrame);
      const end = Math.max(start + 1, cap.outFrame);
      out.push({
        text: cap.text,
        inFrame: start,
        outFrame: end,
        free: true,
        ...(cap.speaker !== undefined ? { speaker: cap.speaker } : {}),
        ...(cap.isNarration !== undefined ? { isNarration: cap.isNarration } : {}),
      });
      cursor = end;
      continue;
    }
    const start = Math.max(cursor, Math.min(maxFrame - 1, cap.inFrame));
    const end = Math.max(start + 1, Math.min(maxFrame, cap.outFrame));
    if (start >= maxFrame || end <= start) continue;
    out.push({
      text: cap.text,
      inFrame: start,
      outFrame: end,
      ...(cap.speaker !== undefined ? { speaker: cap.speaker } : {}),
      ...(cap.isNarration !== undefined ? { isNarration: cap.isNarration } : {}),
    });
    cursor = end;
  }
  return out;
}

/** Where a beat's words are spoken (or read) inside its clip. Set when the timeline is built; see setCaptionWindow. */
export interface CaptionWindow {
  startFrame: number;
  endFrame: number;
}

const captionWindows = new WeakMap<object, CaptionWindow>();
const derivedCues = new WeakMap<object, { key: string; cues: BeatCaption[] }>();

/**
 * The timeline builder tells each beat where its voice sits in its clip, so derived cues start with the words and
 * not with the scene slate before them. Not stored in the story; a beat without a window spreads over its whole clip.
 */
export function setCaptionWindow(beat: object, window: CaptionWindow | undefined): void {
  if (window) captionWindows.set(beat, window);
  else captionWindows.delete(beat);
}

/**
 * Effective captions for a beat over `[0, clipDurationFrames]`.
 * Without `beat.captions`, the beat's text becomes proper cues (sentences, at most two 42-character lines each)
 * timed across the words. Authored cues that are too long for the screen are split across their own span.
 */
export function effectiveCaptionsForBeat(
  beat: BeatLike,
  clipDurationFrames: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  if (Array.isArray(beat.captions)) {
    return normalizeCaptions(beat.captions, maxFrame).flatMap((cap) =>
      cap.free ? [cap] : splitLongCue(cap).map((part) => ({ ...cap, text: part.text, inFrame: part.inFrame, outFrame: part.outFrame })),
    );
  }
  const rawText = String(beat.text ?? "");
  const trimmed = rawText.trim();
  if (!trimmed || trimmed === "·") return [];
  const win = captionWindows.get(beat);
  const start = win ? Math.max(0, Math.min(maxFrame - 1, Math.round(win.startFrame))) : 0;
  const end = win ? Math.max(start + 1, Math.min(maxFrame, Math.round(win.endFrame))) : maxFrame;
  const key = `${rawText}|${maxFrame}|${start}|${end}`;
  const hit = derivedCues.get(beat);
  if (hit && hit.key === key) return hit.cues;
  const cues = cuesForText(rawText, start, end).map((cue) => ({ text: cue.text, inFrame: cue.inFrame, outFrame: cue.outFrame }));
  derivedCues.set(beat, { key, cues });
  return cues;
}

/**
 * Active caption at `localFrame` (`0 <= localFrame < clipDurationFrames`).
 */
export function activeCaptionAtLocalFrame(
  beat: BeatLike,
  clipDurationFrames: number,
  localFrame: number,
): BeatCaption | undefined {
  const f = Math.max(0, Math.floor(localFrame));
  const caps = effectiveCaptionsForBeat(beat, clipDurationFrames);
  return caps.find((cap) => f >= cap.inFrame && f < cap.outFrame);
}

/**
 * Greedy word-wrapper around `maxChars` (~42 chars per line), preserving explicit `\n` breaks.
 */
export function wrapCaptionLines(text: string, maxChars = CAPTION_MAX_LINE_CHARS): string[] {
  const raw = String(text ?? "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return [];
  const paragraphs = raw.split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const collapsed = para.replace(/[ \t]+/g, " ").trim();
    if (!collapsed) {
      if (paragraphs.length > 1) lines.push("");
      continue;
    }
    const words = collapsed.split(" ");
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  // two lines of similar length read better than a long line and a stub
  if (paragraphs.length === 1 && lines.length === 2) return balanceLines(lines.join(" "), maxChars);
  return lines;
}

export function captionMetrics(
  caption: BeatCaption,
  fps = FPS,
  maxChars = CAPTION_MAX_LINE_CHARS,
): CaptionMetrics {
  const lines = wrapCaptionLines(caption.text, maxChars);
  const lineCount = lines.length;
  const overTwoLines = lineCount > 2;
  const charCount = String(caption.text ?? "")
    .replace(/\s+/g, " ")
    .trim().length;
  const frames = Math.max(1, caption.outFrame - caption.inFrame);
  const durationSeconds = frames / fps;
  const cps = charCount > 0 ? charCount / durationSeconds : 0;
  const tooFast = charCount > 0 && cps > CAPTION_MAX_CPS;
  return {
    lines,
    lineCount,
    overTwoLines,
    charCount,
    durationSeconds,
    cps,
    tooFast,
  };
}

/**
 * True if the beat has a recorded voice take (`beat.audioUrl`) and the current
 * captions no longer match the recorded script line (`beat.text`).
 */
export function captionsDifferFromRecordedLine(
  beat: BeatLike,
  clipDurationFrames: number,
): boolean {
  if (!beat.audioUrl || !Array.isArray(beat.captions)) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const recorded = norm(String(beat.text ?? ""));
  const current = norm(
    effectiveCaptionsForBeat(beat, clipDurationFrames)
      .map((c) => c.text)
      .join(" "),
  );
  return recorded !== current;
}

export function updateCaptionText(
  beat: BeatLike,
  clipDurationFrames: number,
  index: number,
  newText: string,
): BeatCaption[] {
  const base = effectiveCaptionsForBeat(beat, clipDurationFrames);
  if (index < 0 || index >= base.length) return base;
  return base.map((cap, idx) => (idx === index ? { ...cap, text: newText } : { ...cap }));
}

export function dragCaptionEdge(
  beat: BeatLike,
  clipDurationFrames: number,
  index: number,
  edge: "in" | "out",
  targetLocalFrame: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const base = effectiveCaptionsForBeat(beat, maxFrame);
  if (index < 0 || index >= base.length) return base;
  const current = base[index];
  const rounded = Math.round(targetLocalFrame);

  if (edge === "in") {
    const minIn = index > 0 ? base[index - 1].outFrame : 0;
    const maxIn = current.outFrame - 1;
    const nextIn = Math.max(minIn, Math.min(maxIn, rounded));
    return base.map((cap, idx) => (idx === index ? { ...cap, inFrame: nextIn } : { ...cap }));
  }

  const minOut = current.inFrame + 1;
  const maxOut = index < base.length - 1 ? base[index + 1].inFrame : maxFrame;
  const nextOut = Math.max(minOut, Math.min(maxOut, rounded));
  return base.map((cap, idx) => (idx === index ? { ...cap, outFrame: nextOut } : { ...cap }));
}

export function setCaptionRange(
  beat: BeatLike,
  clipDurationFrames: number,
  index: number,
  nextInFrame: number,
  nextOutFrame: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const base = effectiveCaptionsForBeat(beat, maxFrame);
  if (index < 0 || index >= base.length) return base;
  const target = base[index];
  const minIn = index > 0 ? base[index - 1].outFrame : 0;
  const isFree = Boolean(target.free) || Math.round(nextOutFrame) > maxFrame;
  const maxOut =
    index < base.length - 1
      ? base[index + 1].inFrame
      : isFree
        ? Math.max(maxFrame, Math.round(nextOutFrame))
        : maxFrame;
  const clampedIn = Math.max(minIn, Math.min(maxOut - 1, Math.round(nextInFrame)));
  const clampedOut = Math.max(clampedIn + 1, Math.min(maxOut, Math.round(nextOutFrame)));
  return base.map((cap, idx) =>
    idx === index
      ? {
          ...cap,
          inFrame: clampedIn,
          outFrame: clampedOut,
          ...(isFree ? { free: true } : {}),
        }
      : { ...cap },
  );
}

/**
 * Splits `captions[index]` at `cursorOffset` into two captions, sharing `[inFrame, outFrame]`
 * proportionally by character count and preserving order.
 */
export function splitCaptionAtCursor(
  beat: BeatLike,
  clipDurationFrames: number,
  index: number,
  cursorOffset: number,
  draftText?: string,
): { captions: BeatCaption[]; didSplit: boolean } {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const base = effectiveCaptionsForBeat(beat, maxFrame);
  if (index < 0 || index >= base.length) return { captions: base, didSplit: false };

  const target = base[index];
  const fullText = draftText !== undefined ? draftText : target.text;
  const totalFrames = target.outFrame - target.inFrame;
  if (totalFrames < 2) {
    return {
      captions: base.map((c, i) => (i === index ? { ...c, text: fullText } : { ...c })),
      didSplit: false,
    };
  }

  const clampedCursor = Math.max(0, Math.min(fullText.length, Math.round(cursorOffset)));
  const leftText = fullText.slice(0, clampedCursor).trim();
  const rightText = fullText.slice(clampedCursor).trim();
  if (!leftText || !rightText) {
    return {
      captions: base.map((c, i) => (i === index ? { ...c, text: fullText } : { ...c })),
      didSplit: false,
    };
  }

  const totalChars = leftText.length + rightText.length;
  const leftFrames = Math.max(
    1,
    Math.min(totalFrames - 1, Math.round((totalFrames * leftText.length) / totalChars)),
  );
  const splitFrame = target.inFrame + leftFrames;
  const carryMeta = {
    ...(target.free ? { free: true } : {}),
    ...(target.speaker !== undefined ? { speaker: target.speaker } : {}),
    ...(target.isNarration !== undefined ? { isNarration: target.isNarration } : {}),
  };

  const first: BeatCaption = {
    text: leftText,
    inFrame: target.inFrame,
    outFrame: splitFrame,
    ...carryMeta,
  };
  const second: BeatCaption = {
    text: rightText,
    inFrame: splitFrame,
    outFrame: target.outFrame,
    ...carryMeta,
  };

  const next = [...base.slice(0, index), first, second, ...base.slice(index + 1)];
  return { captions: next, didSplit: true };
}

/** Split a selected cue at the playhead without changing its picture or audio clip. */
export function splitCaptionAtFrame(
  beat: BeatLike, clipDurationFrames: number, index: number, localFrame: number,
): { captions: BeatCaption[]; didSplit: boolean } {
  const base = effectiveCaptionsForBeat(beat, clipDurationFrames);
  const cue = base[index];
  const cut = Math.round(localFrame);
  if (!cue || !Number.isFinite(cut) || cut <= cue.inFrame || cut >= cue.outFrame) {
    return { captions: base, didSplit: false };
  }
  const [left, right] = splitCaptionTextAtRatio(cue.text, (cut - cue.inFrame) / (cue.outFrame - cue.inFrame));
  if (!left || !right || (left === cue.text.trim() && right === left)) {
    return { captions: base, didSplit: false };
  }
  return { captions: [...base.slice(0, index), { ...cue, text: left, outFrame: cut },
    { ...cue, text: right, inFrame: cut }, ...base.slice(index + 1)], didSplit: true };
}

/**
 * Splits a beat's effective captions across a picture cut at `cutFrame` (local frames) so each
 * half of a split clip keeps its own share of the closed captions:
 * - cues ending at/before the cut stay on the left half unchanged,
 * - cues starting at/after the cut move to the right half with frames rebased to zero,
 * - cues spanning the cut are divided — timing at the cut, text at the nearest word boundary
 *   (a cue whose text cannot be divided keeps its full text on both halves so no caption is lost).
 */
export function splitCaptionsAcrossCut(
  captions: readonly BeatCaption[],
  cutFrame: number,
): { left: BeatCaption[]; right: BeatCaption[] } {
  const cut = Math.max(1, Math.round(cutFrame));
  const left: BeatCaption[] = [];
  const right: BeatCaption[] = [];
  for (const cap of captions) {
    const inFrame = Math.max(0, Math.round(cap.inFrame));
    const outFrame = Math.max(inFrame + 1, Math.round(cap.outFrame));
    const carryMeta = {
      ...(cap.free ? { free: true } : {}),
      ...(cap.speaker !== undefined ? { speaker: cap.speaker } : {}),
      ...(cap.isNarration !== undefined ? { isNarration: cap.isNarration } : {}),
    };
    if (outFrame <= cut) {
      left.push({ ...cap, inFrame, outFrame });
      continue;
    }
    if (inFrame >= cut) {
      const nextIn = inFrame - cut;
      right.push({ ...cap, inFrame: nextIn, outFrame: Math.max(nextIn + 1, outFrame - cut) });
      continue;
    }
    const span = Math.max(1, outFrame - inFrame);
    const [leftText, rightText] = splitCaptionTextAtRatio(cap.text, (cut - inFrame) / span);
    left.push({ text: leftText, inFrame, outFrame: cut, ...carryMeta });
    right.push({
      text: rightText,
      inFrame: 0,
      outFrame: Math.max(1, outFrame - cut),
      ...carryMeta,
    });
  }
  return { left, right };
}

/** Divides caption text at the nearest word boundary to `ratio`; char-level or full-text fallback. */
function splitCaptionTextAtRatio(rawText: string, ratio: number): [string, string] {
  const trimmed = String(rawText ?? "").trim();
  if (trimmed.length < 2) return [trimmed, trimmed];
  const clampedRatio = Math.max(0.05, Math.min(0.95, ratio));
  const target = Math.max(1, Math.min(trimmed.length - 1, Math.round(trimmed.length * clampedRatio)));
  let splitAt = -1;
  for (let d = 0; d < trimmed.length; d += 1) {
    const forward = target + d;
    const backward = target - d;
    if (forward < trimmed.length && /\s/.test(trimmed[forward])) {
      splitAt = forward;
      break;
    }
    if (backward >= 1 && /\s/.test(trimmed[backward])) {
      splitAt = backward;
      break;
    }
  }
  if (splitAt < 0) {
    // Single word with no space to split on — keep the whole cue text on both halves.
    return [trimmed, trimmed];
  }
  const first = trimmed.slice(0, splitAt).trim();
  const second = trimmed.slice(splitAt).trim();
  if (!first || !second) return [trimmed, trimmed];
  return [first, second];
}

/**
 * Merges two neighbouring captions (`firstIndex` and `firstIndex + 1`) inside a clip.
 */
export function mergeAdjacentCaptions(
  beat: BeatLike,
  clipDurationFrames: number,
  firstIndex: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const base = effectiveCaptionsForBeat(beat, maxFrame);
  if (firstIndex < 0 || firstIndex + 1 >= base.length) return base;
  const a = base[firstIndex];
  const b = base[firstIndex + 1];
  const merged: BeatCaption = {
    text: [a.text.trim(), b.text.trim()].filter(Boolean).join(" "),
    inFrame: a.inFrame,
    outFrame: b.outFrame,
    ...((a.free || b.free) ? { free: true } : {}),
    ...(a.speaker !== undefined ? { speaker: a.speaker } : {}),
    ...(a.isNarration !== undefined ? { isNarration: a.isNarration } : {}),
  };
  return [...base.slice(0, firstIndex), merged, ...base.slice(firstIndex + 2)];
}

/**
 * Deletes one or more captions from a beat by index. Leaves `[]` when all captions in the clip
 * are deleted so the shot keeps its picture and shows no caption for that time.
 */
export function deleteCaptionsAtIndices(
  beat: BeatLike,
  clipDurationFrames: number,
  indices: readonly number[],
): BeatCaption[] {
  const drop = new Set(indices);
  const base = effectiveCaptionsForBeat(beat, clipDurationFrames);
  return base.filter((_, idx) => !drop.has(idx));
}

/**
 * Inserts a new caption block in the largest uncovered gap of `[0, clipDurationFrames]`
 * (or covering `preferredLocalFrame` if it falls in a gap).
 */
export function addCaptionInGap(
  beat: BeatLike,
  clipDurationFrames: number,
  preferredLocalFrame?: number,
): BeatCaption[] | null {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  const base = effectiveCaptionsForBeat(beat, maxFrame);
  if (base.length === 0) {
    return [{ text: String(beat.text || "New caption").trim() || "New caption", inFrame: 0, outFrame: maxFrame }];
  }
  const gaps: Array<{ inFrame: number; outFrame: number }> = [];
  let cursor = 0;
  for (const cap of base) {
    if (cap.inFrame > cursor) gaps.push({ inFrame: cursor, outFrame: cap.inFrame });
    cursor = cap.outFrame;
  }
  if (cursor < maxFrame) gaps.push({ inFrame: cursor, outFrame: maxFrame });
  if (gaps.length === 0) return null;

  const chosen =
    (preferredLocalFrame !== undefined
      ? gaps.find((g) => preferredLocalFrame >= g.inFrame && preferredLocalFrame < g.outFrame)
      : undefined) ||
    gaps.reduce((best, g) => (g.outFrame - g.inFrame > best.outFrame - best.inFrame ? g : best), gaps[0]);

  return normalizeCaptions(
    [...base, { text: "New caption", inFrame: chosen.inFrame, outFrame: chosen.outFrame }],
    maxFrame,
  );
}

/**
 * Parses `MM:SS:FF`, `HH:MM:SS:FF`, `SS:FF`, `1.5s`, or plain frame numbers (`24` / `24f`).
 */
export function parseCaptionTimecode(input: string, fps = FPS): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?s$/i.test(raw)) {
    return Math.max(0, Math.round(Number.parseFloat(raw) * fps));
  }
  if (/^\d+f?$/i.test(raw)) {
    return Math.max(0, Number.parseInt(raw, 10));
  }
  const parts = raw.split(":").map((part) => Number.parseInt(part.trim(), 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [ss, ff] = parts;
    return ss * fps + ff;
  }
  if (parts.length === 3) {
    const [mm, ss, ff] = parts;
    return (mm * 60 + ss) * fps + ff;
  }
  if (parts.length === 4) {
    const [hh, mm, ss, ff] = parts;
    return (hh * 3600 + mm * 60 + ss) * fps + ff;
  }
  return null;
}

export function vttTime(seconds: number): string {
  return srtTime(seconds).replace(",", ".");
}

export interface TimedCaptionCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TimelineCaptionSourceClip {
  keyframe: Keyframe;
  startFrame: number;
  durationFrames: number;
}

/**
 * Resolves all timeline captions into global `[globalInFrame, globalOutFrame)` coordinates,
 * supporting freely moved/trimmed captions that span across shot cuts or over gap clips.
 */
export function resolveTimelineCaptions(
  clips: readonly TimelineCaptionSourceClip[],
): ResolvedTimelineCaption[] {
  const out: ResolvedTimelineCaption[] = [];
  for (const clip of clips) {
    const durFrames = Math.max(1, Math.round(clip.durationFrames));
    const caps = effectiveCaptionsForBeat(clip.keyframe.beat, durFrames);
    caps.forEach((cap, idx) => {
      const globalInFrame = clip.startFrame + cap.inFrame;
      const globalOutFrame = clip.startFrame + cap.outFrame;
      if (globalOutFrame <= globalInFrame) return;
      out.push({
        id: `${clip.keyframe.id}:${idx}`,
        frameId: clip.keyframe.id,
        captionIndex: idx,
        text: cap.text,
        inFrame: cap.inFrame,
        outFrame: cap.outFrame,
        globalInFrame,
        globalOutFrame,
        speaker: cap.speaker ?? clip.keyframe.speaker,
        isNarration: cap.isNarration ?? isNarrationBeat(clip.keyframe.beat),
        free: Boolean(cap.free) || cap.outFrame > durFrames,
      });
    });
  }
  return out;
}

/**
 * Returns the active timeline caption at `globalFrame` (`globalInFrame <= f < globalOutFrame`),
 * preferring the most recently started caption when two overlap across a cut.
 */
export function activeTimelineCaptionAtFrame(
  resolved: readonly ResolvedTimelineCaption[],
  globalFrame: number,
): ResolvedTimelineCaption | undefined {
  const f = Math.max(0, Math.floor(globalFrame));
  let match: ResolvedTimelineCaption | undefined;
  for (const cap of resolved) {
    if (f >= cap.globalInFrame && f < cap.globalOutFrame) {
      if (!match) {
        match = cap;
      } else if (cap.free && !match.free) {
        match = cap;
      } else if (cap.free === match.free && cap.globalInFrame >= match.globalInFrame) {
        match = cap;
      }
    }
  }
  return match;
}

export function collectExportCaptionCues(
  frames: readonly Keyframe[],
  clipDurationsFrames?: readonly number[],
  fps = FPS,
): TimedCaptionCue[] {
  let cursorFrames = 0;
  const cues: TimedCaptionCue[] = [];
  frames.forEach((frame, index) => {
    const durFrames = Math.max(1, Math.round(clipDurationsFrames?.[index] ?? 36));
    const caps = effectiveCaptionsForBeat(frame.beat, durFrames);
    for (const cap of caps) {
      const cleaned = wrapCaptionLines(cap.text, CAPTION_MAX_LINE_CHARS).join("\n").trim();
      if (cleaned && cleaned !== "·") {
        cues.push({
          startSeconds: (cursorFrames + cap.inFrame) / fps,
          endSeconds: (cursorFrames + cap.outFrame) / fps,
          text: cleaned,
        });
      }
    }
    cursorFrames += durFrames;
  });
  cues.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
  return cues;
}

export function makeCaptionsSrt(
  frames: readonly Keyframe[],
  clipDurationsFrames?: readonly number[],
  fps = FPS,
): string {
  const cues = collectExportCaptionCues(frames, clipDurationsFrames, fps);
  return cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${srtTime(cue.startSeconds)} --> ${srtTime(cue.endSeconds)}\n${cue.text}`,
    )
    .join("\n\n");
}

/**
 * Exports `.srt` cues clipped to `[fromFrame, toFrame + 1)` and shifted so `fromFrame`
 * begins at `00:00:00,000` (matching an exported MP4 over `--from .. --to`).
 */
export function makeRangeCaptionsSrt(
  clips: readonly TimelineCaptionSourceClip[],
  fromFrame: number,
  toFrame: number,
  fps = FPS,
): string {
  const startFrame = Math.max(0, Math.round(fromFrame));
  const endExclusive = Math.max(startFrame + 1, Math.round(toFrame) + 1);
  const resolved = resolveTimelineCaptions(clips);
  const cues: TimedCaptionCue[] = [];
  for (const cap of resolved) {
    const clippedIn = Math.max(startFrame, cap.globalInFrame);
    const clippedOut = Math.min(endExclusive, cap.globalOutFrame);
    if (clippedOut <= clippedIn) continue;
    const cleaned = wrapCaptionLines(cap.text, CAPTION_MAX_LINE_CHARS).join("\n").trim();
    if (!cleaned || cleaned === "·") continue;
    cues.push({
      startSeconds: (clippedIn - startFrame) / fps,
      endSeconds: (clippedOut - startFrame) / fps,
      text: cleaned,
    });
  }
  cues.sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds);
  return cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${srtTime(cue.startSeconds)} --> ${srtTime(cue.endSeconds)}\n${cue.text}`,
    )
    .join("\n\n");
}

export function makeCaptionsVtt(
  frames: readonly Keyframe[],
  clipDurationsFrames?: readonly number[],
  fps = FPS,
): string {
  const cues = collectExportCaptionCues(frames, clipDurationsFrames, fps);
  const body = cues
    .map(
      (cue, idx) =>
        `${idx + 1}\n${vttTime(cue.startSeconds)} --> ${vttTime(cue.endSeconds)}\n${cue.text}`,
    )
    .join("\n\n");
  return body ? `WEBVTT\n\n${body}\n` : "WEBVTT\n";
}

function escapeFfmetadata(text: string): string {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/;/g, "\\;")
    .replace(/#/g, "\\#")
    .replace(/\r?\n/g, " ");
}

/**
 * Generates an FFMETADATA1 chapter stream over `[fromFrame, toFrame]` inclusive
 * from timeline `NoteMarker`s (chapter/shot markers) with scene-boundary fallback.
 */
export function buildMp4FfmetadataChapters(
  clips: ReadonlyArray<{
    startFrame: number;
    endFrame: number;
    keyframe: Keyframe;
  }>,
  markers: readonly NoteMarker[] | undefined,
  fromFrame: number,
  toFrame: number,
  fps = FPS,
): string {
  const startF = Math.max(0, Math.round(fromFrame));
  const endF = Math.max(startF, Math.round(toFrame));
  const totalDurationMs = Math.max(1, Math.round(((endF - startF + 1) * 1000) / fps));

  interface RawChapterPoint {
    frame: number;
    title: string;
  }

  const byFrame = new Map<number, string>();
  const inRangeMarkers = (markers || [])
    .filter((m) => m.frame >= startF && m.frame <= endF)
    .sort((a, b) => a.frame - b.frame);

  for (const m of inRangeMarkers) {
    const rawName = String(m.name || "").trim();
    if (/^SHOT\s+\d+\b/i.test(rawName)) continue;
    const cleanedName = rawName
      .replace(/·\s*SHOT\s+\d+\s*·?\s*/gi, "· ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!byFrame.has(m.frame)) {
      byFrame.set(m.frame, cleanedName || `Frame ${m.frame}`);
    }
  }

  // If fewer than 2 note/chapter markers fall in the exported range, include scene starts
  if (byFrame.size < 2) {
    let prevSceneId = "";
    for (const c of clips) {
      if (c.endFrame <= startF || c.startFrame > endF) continue;
      const scId = c.keyframe.sceneId;
      if (scId !== prevSceneId) {
        prevSceneId = scId;
        const clampedF = Math.max(startF, c.startFrame);
        if (!byFrame.has(clampedF)) {
          const rawTitle = String(c.keyframe.scene.title || c.keyframe.mark || scId).trim();
          byFrame.set(clampedF, rawTitle);
        }
      }
    }
  }

  if (!byFrame.has(startF)) {
    const firstClip = clips.find((c) => c.endFrame > startF && c.startFrame <= endF);
    const openLabel = firstClip
      ? String(firstClip.keyframe.scene.title || firstClip.keyframe.mark || "Opening")
      : "Opening";
    byFrame.set(startF, openLabel);
  }

  const points: RawChapterPoint[] = [...byFrame.entries()]
    .map(([frame, title]) => ({ frame, title }))
    .sort((a, b) => a.frame - b.frame);

  const lines: string[] = [";FFMETADATA1"];
  for (let i = 0; i < points.length; i += 1) {
    const startMs = Math.max(0, Math.round(((points[i].frame - startF) * 1000) / fps));
    const nextStartMs =
      i + 1 < points.length
        ? Math.max(startMs + 1, Math.round(((points[i + 1].frame - startF) * 1000) / fps))
        : totalDurationMs;
    const endMs = Math.min(totalDurationMs, Math.max(startMs + 1, nextStartMs));
    if (startMs >= totalDurationMs) continue;
    lines.push(
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${startMs}`,
      `END=${endMs}`,
      `title=${escapeFfmetadata(points[i].title)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

