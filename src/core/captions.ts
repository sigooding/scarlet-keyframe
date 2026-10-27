import type { BeatLike, Keyframe } from "./model";
import { FPS, srtTime } from "./timing";

export const CAPTION_MAX_LINE_CHARS = 42;
export const CAPTION_MAX_CPS = 17;

export interface BeatCaption {
  text: string;
  inFrame: number;
  outFrame: number;
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
    }))
    .sort((a, b) => a.inFrame - b.inFrame || a.outFrame - b.outFrame);

  const out: BeatCaption[] = [];
  let cursor = 0;
  for (const cap of sorted) {
    const start = Math.max(cursor, Math.min(maxFrame - 1, cap.inFrame));
    const end = Math.max(start + 1, Math.min(maxFrame, cap.outFrame));
    if (start >= maxFrame || end <= start) continue;
    out.push({ text: cap.text, inFrame: start, outFrame: end });
    cursor = end;
  }
  return out;
}

/**
 * Effective captions for a beat over `[0, clipDurationFrames]`.
 * Without `beat.captions`, a beat shows `beat.text` across `[0, clipDurationFrames]`.
 */
export function effectiveCaptionsForBeat(
  beat: BeatLike,
  clipDurationFrames: number,
): BeatCaption[] {
  const maxFrame = Math.max(1, Math.round(clipDurationFrames));
  if (Array.isArray(beat.captions)) {
    return normalizeCaptions(beat.captions, maxFrame);
  }
  const rawText = String(beat.text ?? "");
  const trimmed = rawText.trim();
  if (!trimmed || trimmed === "·") return [];
  return [{ text: rawText, inFrame: 0, outFrame: maxFrame }];
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
  const minIn = index > 0 ? base[index - 1].outFrame : 0;
  const maxOut = index < base.length - 1 ? base[index + 1].inFrame : maxFrame;
  const clampedIn = Math.max(minIn, Math.min(maxOut - 1, Math.round(nextInFrame)));
  const clampedOut = Math.max(clampedIn + 1, Math.min(maxOut, Math.round(nextOutFrame)));
  return base.map((cap, idx) =>
    idx === index ? { ...cap, inFrame: clampedIn, outFrame: clampedOut } : { ...cap },
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

  const first: BeatCaption = {
    text: leftText,
    inFrame: target.inFrame,
    outFrame: splitFrame,
  };
  const second: BeatCaption = {
    text: rightText,
    inFrame: splitFrame,
    outFrame: target.outFrame,
  };

  const next = [...base.slice(0, index), first, second, ...base.slice(index + 1)];
  return { captions: next, didSplit: true };
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
