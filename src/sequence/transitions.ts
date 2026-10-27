import type { Keyframe } from "../core/model";
import { FPS } from "../core/timing";
import type { TimelineClip } from "./animate";

export type TransitionKind = "cut" | "dissolve" | "dip-to-black" | "wipe-left" | "wipe-right";

export const TRANSITION_KINDS: Array<{ kind: TransitionKind; label: string; shortLabel: string }> = [
  { kind: "cut", label: "Cut", shortLabel: "CUT" },
  { kind: "dissolve", label: "Dissolve", shortLabel: "DISS" },
  { kind: "dip-to-black", label: "Dip to black", shortLabel: "DIP" },
  { kind: "wipe-left", label: "Wipe left", shortLabel: "◀WIPE" },
  { kind: "wipe-right", label: "Wipe right", shortLabel: "WIPE▶" },
];

export const DEFAULT_TRANSITION_FRAMES = 12;

/**
 * Maps any authored or legacy Scarlet Reel transition identifier to one of the
 * five canonical editor transition kinds:
 * - "cut" | "none" | "" | undefined -> "cut"
 * - "dissolve" | "crossfade" | "fade" | "zoom" | "iris" | "iris-in" | "glitch" -> "dissolve"
 * - "dip-to-black" | "dip to black" | "fade-black" | "burn" -> "dip-to-black"
 * - "wipe-left" | "wipe left" | "slide-left" | "wipe-up" -> "wipe-left"
 * - "wipe-right" | "wipe right" | "slide-right" | "wipe-down" -> "wipe-right"
 */
export const FILM_TRANSITION_MAP: Record<string, TransitionKind> = {
  "": "cut",
  none: "cut",
  cut: "cut",
  dissolve: "dissolve",
  crossfade: "dissolve",
  fade: "dissolve",
  zoom: "dissolve",
  iris: "dissolve",
  "iris-in": "dissolve",
  glitch: "dissolve",
  "dip-to-black": "dip-to-black",
  "dip to black": "dip-to-black",
  "fade-black": "dip-to-black",
  burn: "dip-to-black",
  "wipe-left": "wipe-left",
  "wipe left": "wipe-left",
  "slide-left": "wipe-left",
  "wipe-up": "wipe-left",
  "wipe-right": "wipe-right",
  "wipe right": "wipe-right",
  "slide-right": "wipe-right",
  "wipe-down": "wipe-right",
};

export function mapTransitionKind(raw: unknown): TransitionKind {
  if (typeof raw !== "string") return "cut";
  const key = raw.trim().toLowerCase();
  return FILM_TRANSITION_MAP[key] ?? "cut";
}

export interface CutTransitionSpec {
  kind: TransitionKind;
  durationFrames: number;
}

export function readCutTransition(
  incoming: Keyframe | { beat: Record<string, any> },
  maxFrames?: number,
): CutTransitionSpec {
  const beat = incoming.beat ?? {};
  const kind = mapTransitionKind(beat.backgroundTransition);
  if (kind === "cut") return { kind: "cut", durationFrames: 0 };

  const rawSpeed = Number(beat.backgroundTransitionSpeed);
  let frames =
    Number.isFinite(rawSpeed) && rawSpeed > 0
      ? Math.max(1, Math.round(rawSpeed * FPS))
      : DEFAULT_TRANSITION_FRAMES;

  if (maxFrames !== undefined && Number.isFinite(maxFrames)) {
    frames = Math.max(1, Math.min(Math.max(1, Math.floor(maxFrames)), frames));
  }
  return { kind, durationFrames: frames };
}

export interface TransitionWindow {
  cutFrame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
}

/**
 * Centres a transition of `durationFrames` around `cutFrame`.
 * For an even length L (e.g. 12), startFrame = cutFrame - 6 and endFrame = cutFrame + 6,
 * spanning frames [startFrame .. endFrame - 1] (and progress reaches 1 at endFrame).
 */
export function getTransitionWindow(cutFrame: number, durationFrames: number): TransitionWindow {
  const len = Math.max(0, Math.round(durationFrames));
  const halfBefore = Math.floor(len / 2);
  const startFrame = cutFrame - halfBefore;
  return {
    cutFrame,
    startFrame,
    endFrame: startFrame + len,
    durationFrames: len,
  };
}

/**
 * Progress formula: p = (frame - transitionStart) / length, clamped to [0, 1].
 */
export function transitionProgress(frame: number, transitionStart: number, length: number): number {
  if (length <= 0) return 1;
  const raw = (frame - transitionStart) / length;
  return Math.max(0, Math.min(1, raw));
}

export interface ActiveTransition {
  kind: Exclude<TransitionKind, "cut">;
  progress: number;
  cutFrame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  outgoingClip: TimelineClip;
  outLocalFrame: number;
  incomingClip: TimelineClip;
  inLocalFrame: number;
}

/**
 * Evaluates whether `frame` falls inside a cut transition on `clips`.
 * While active, returns both the outgoing and incoming clips with their respective
 * local frames (so each can run its own `evaluate()` animation) and progress `p`.
 */
export function activeTransitionAtFrame(
  clips: TimelineClip[],
  frame: number,
): ActiveTransition | undefined {
  if (clips.length < 2) return undefined;

  for (let i = 1; i < clips.length; i += 1) {
    const outgoing = clips[i - 1];
    const incoming = clips[i];
    const maxLen = 2 * Math.min(outgoing.durationFrames, incoming.durationFrames);
    const spec = readCutTransition(incoming.keyframe, maxLen);
    if (spec.kind === "cut" || spec.durationFrames <= 0) continue;

    const win = getTransitionWindow(incoming.startFrame, spec.durationFrames);
    if (frame >= win.startFrame && frame < win.endFrame) {
      const progress = transitionProgress(frame, win.startFrame, win.durationFrames);
      return {
        kind: spec.kind,
        progress,
        cutFrame: win.cutFrame,
        startFrame: win.startFrame,
        endFrame: win.endFrame,
        durationFrames: win.durationFrames,
        outgoingClip: outgoing,
        outLocalFrame: frame - outgoing.startFrame,
        incomingClip: incoming,
        inLocalFrame: frame - incoming.startFrame,
      };
    }
  }
  return undefined;
}
