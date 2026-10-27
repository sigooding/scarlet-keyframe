import { AFTER_VOICE_SECONDS, readingSeconds, untilNextMusicBeat } from "../../vendor/scarlet-reel/game/animatic";
import type { Keyframe } from "./model";

// The whole editor is frame based: 24 frames per second, no fractional frames.
export const FPS = 24;
export const MIN_CLIP_FRAMES = 6;

export { AFTER_VOICE_SECONDS, readingSeconds, untilNextMusicBeat };

export function keyframeDuration(frame: Keyframe, voiceSeconds?: number, pace = 1): number {
  const beat = frame.beat;
  const explicit = Number(beat.holdSeconds ?? beat.holdDuration ?? beat.durationSeconds ?? beat.hold);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (beat.audioUrl) return Math.max(0.5, (voiceSeconds ?? 3) + AFTER_VOICE_SECONDS);
  const text = String(beat.text || "").trim();
  if (text && text !== "·") return readingSeconds(text, pace, Number(frame.scene.animaticReadPace) || 1);
  const delay = Number(beat.afterBeatDelaySeconds ?? frame.scene.autoAdvanceDelaySeconds);
  return Number.isFinite(delay) && delay > 0 ? delay : 1.5;
}

export function secondsFromFrames(frames: number): number {
  return (Number.isFinite(frames) ? frames : 0) / FPS;
}

export function framesFromSeconds(seconds: number): number {
  const value = Number.isFinite(seconds) ? seconds : 0;
  return Math.max(1, Math.round(value * FPS));
}

// The length of one clip on the Picture track: an explicit beat duration wins, otherwise the beat's
// natural animatic duration (voice take, reading time or hold) is converted to frames.
export function clipFrames(frame: Keyframe, voiceSeconds?: number): number {
  const explicit = Number(frame.beat.durationFrames);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(MIN_CLIP_FRAMES, Math.round(explicit));
  return Math.max(MIN_CLIP_FRAMES, framesFromSeconds(keyframeDuration(frame, voiceSeconds)));
}

// How much room the voice take (and its trailing beat) needs, before any trim.
export function voiceFrames(frame: Keyframe, voiceSeconds?: number): number {
  return Math.max(1, framesFromSeconds(keyframeDuration(frame, voiceSeconds)));
}

// Timecode shown everywhere in the editor: MM:SS:FF.
export function timecode(frames: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(frames) ? frames : 0));
  const totalSeconds = Math.floor(safe / FPS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainder = safe % FPS;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}:${pad(remainder)}`;
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

export function makeSrt(frames: Keyframe[], durations: number[]): string {
  // Durations are given in seconds (see callers), so trimming in frames is converted back here.
  let cursor = 0;
  const entries: string[] = [];
  frames.forEach((frame, index) => {
    const duration = durations[index] || keyframeDuration(frame);
    const text = String(frame.beat.text || "").trim();
    if (text && text !== "·") {
      entries.push(`${entries.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + duration)}\n${text}`);
    }
    cursor += duration;
  });
  return entries.join("\n\n");
}
