import type { Keyframe } from "../core/model";
import { FPS } from "../core/timing";
import type { TimelineClip } from "./animate";

export type TransitionKind = "cut" | "dissolve" | "dip-to-black" | "wipe-left" | "wipe-right";
export type TransitionAlignment = "at-cut" | "centred";

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
 * five canonical editor transition kinds.
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
  alignment: TransitionAlignment;
  userAdded: boolean;
}

export function readCutTransition(
  incoming: Keyframe | { beat: Record<string, any> },
  maxFrames?: number,
): CutTransitionSpec {
  const beat = incoming.beat ?? {};
  const kind = mapTransitionKind(beat.backgroundTransition);
  const userAdded = Boolean(beat.transitionUserAdded);
  const alignment: TransitionAlignment =
    userAdded && beat.backgroundTransitionAlign === "centred" ? "centred" : "at-cut";

  if (kind === "cut") {
    return { kind: "cut", durationFrames: 0, alignment: "at-cut", userAdded: false };
  }

  const rawSpeed = Number(beat.backgroundTransitionSpeed);
  let frames =
    Number.isFinite(rawSpeed) && rawSpeed > 0
      ? Math.max(1, Math.round(rawSpeed * FPS))
      : DEFAULT_TRANSITION_FRAMES;

  if (maxFrames !== undefined && Number.isFinite(maxFrames)) {
    frames = Math.max(1, Math.min(Math.max(1, Math.floor(maxFrames)), frames));
  }
  return { kind, durationFrames: frames, alignment, userAdded };
}

export interface TransitionWindow {
  cutFrame: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  alignment: TransitionAlignment;
}

/**
 * Computes the frame window of a transition around `cutFrame`.
 * By default (`alignment = "at-cut"`), film transitions start AT the cut and run after it:
 *   startFrame = cutFrame, endFrame = cutFrame + durationFrames.
 * When `alignment = "centred"` (opt-in on a user-added transition), the transition is
 * centred across the cut: startFrame = cutFrame - floor(durationFrames / 2).
 */
export function getTransitionWindow(
  cutFrame: number,
  durationFrames: number,
  alignment: TransitionAlignment = "at-cut",
): TransitionWindow {
  const len = Math.max(0, Math.round(durationFrames));
  const startFrame = alignment === "centred" ? cutFrame - Math.floor(len / 2) : cutFrame;
  return {
    cutFrame,
    startFrame,
    endFrame: startFrame + len,
    durationFrames: len,
    alignment,
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
  alignment: TransitionAlignment;
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

export function maxTransitionFramesForCut(
  outgoing: TimelineClip,
  incoming: TimelineClip,
  alignment: TransitionAlignment = "at-cut",
): number {
  if (alignment === "centred") {
    return Math.max(2, 2 * Math.min(outgoing.durationFrames, incoming.durationFrames));
  }
  return Math.max(1, incoming.durationFrames);
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
    const rawAlign: TransitionAlignment =
      incoming.keyframe.beat.transitionUserAdded &&
      incoming.keyframe.beat.backgroundTransitionAlign === "centred"
        ? "centred"
        : "at-cut";
    const maxLen = maxTransitionFramesForCut(outgoing, incoming, rawAlign);
    const spec = readCutTransition(incoming.keyframe, maxLen);
    if (spec.kind === "cut" || spec.durationFrames <= 0) continue;

    const win = getTransitionWindow(incoming.startFrame, spec.durationFrames, spec.alignment);
    if (frame >= win.startFrame && frame < win.endFrame) {
      const progress = transitionProgress(frame, win.startFrame, win.durationFrames);
      return {
        kind: spec.kind,
        alignment: spec.alignment,
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
