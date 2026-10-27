import { AFTER_VOICE_SECONDS, readingSeconds, untilNextMusicBeat } from "../../vendor/scarlet-reel/game/animatic";
import type { Keyframe } from "./model";

export { AFTER_VOICE_SECONDS, readingSeconds, untilNextMusicBeat };

export const FPS = 24;
export const MIN_CLIP_FRAMES = 6;

export function keyframeDuration(frame: Keyframe, voiceSeconds?: number, pace = 1): number {
  const beat = frame.beat;
  const explicit = Number(beat.holdSeconds ?? beat.holdDuration ?? beat.durationSeconds ?? beat.hold);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const beats = frame.scene.dialogueBeats ?? [];
  const isFirstBeat = frame.beatIndex === 0;
  const isLastBeat = frame.beatIndex === beats.length - 1;
  const prose = isFirstBeat ? String(frame.scene.prose ?? "").trim() : "";
  const proseSec = prose
    ? (/^(INT|EXT|I\/E)[./\s]/i.test(prose) ? 1.6 * pace : readingSeconds(prose, pace))
    : 0;
  const rawDelay = Number(beat.afterBeatDelaySeconds);
  const hasAutoDelay =
    isLastBeat &&
    beat.afterBeatMode === "auto" &&
    Number.isFinite(rawDelay) &&
    rawDelay > 0 &&
    rawDelay !== 1;
  const sceneTrans =
    isLastBeat &&
    frame.scene.transition &&
    frame.scene.transition !== "none" &&
    frame.scene.transition !== "cut"
      ? Math.min(2.4, Math.max(0, Number(frame.scene.transitionSpeed) || 0))
      : 0;
  const nodeOverhead = hasAutoDelay ? 0.28 : 0;
  const text = String(beat.text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (beat.audioUrl) {
    const estVoice =
      voiceSeconds ?? (text ? Math.min(10, Math.max(3, 0.8 + text.length / 13)) : 3);
    const post = hasAutoDelay
      ? 0.4 + rawDelay + 0.18
      : isLastBeat
        ? (Number.isFinite(rawDelay) && rawDelay > 0 ? rawDelay : 1) + 0.1
        : AFTER_VOICE_SECONDS + 0.1;
    return Math.max(0.5, proseSec + estVoice + post + sceneTrans);
  }
  if (hasAutoDelay) {
    return Math.max(0.5, proseSec + rawDelay + nodeOverhead + sceneTrans);
  }
  if (text && text !== "·") {
    return proseSec + readingSeconds(text, pace, Number(frame.scene.animaticReadPace) || 1) + sceneTrans;
  }
  const delay = Number(beat.afterBeatDelaySeconds ?? frame.scene.autoAdvanceDelaySeconds);
  return proseSec + (Number.isFinite(delay) && delay > 0 ? delay : 1.5) + sceneTrans;
}

export function clipFrames(frame: Keyframe, voiceSeconds?: number, pace = 1): number {
  const explicit = Number(frame.beat.durationFrames);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit));
  }
  return Math.max(1, Math.round(keyframeDuration(frame, voiceSeconds, pace) * FPS));
}

export function formatTimecode(frameNumber: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(frameNumber) ? frameNumber : 0));
  const ff = safe % FPS;
  const totalSeconds = Math.floor(safe / FPS);
  const minutes = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function srtTime(seconds: number): string {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const remainder = millis % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export function makeSrt(frames: Keyframe[], durations?: number[]): string {
  let cursor = 0;
  const entries: string[] = [];
  frames.forEach((frame, index) => {
    const duration = durations?.[index] ?? clipFrames(frame) / FPS;
    const text = String(frame.beat.text || "").trim();
    if (text && text !== "·") {
      entries.push(`${entries.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + duration)}\n${text}`);
    }
    cursor += duration;
  });
  return entries.join("\n\n");
}
