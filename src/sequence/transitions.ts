import type { BeatLike } from "../core/model";
import { FPS } from "../core/timing";
import type { SequenceClip } from "./sequence";

// The five transition kinds the editor draws. A transition belongs to the cut *before* a clip: it is
// stored on the incoming beat as backgroundTransition (kind) and backgroundTransitionSpeed (seconds).
export type TransitionKind = "cut" | "dissolve" | "dip-black" | "wipe-left" | "wipe-right";

export const TRANSITION_KINDS: TransitionKind[] = ["cut", "dissolve", "dip-black", "wipe-left", "wipe-right"];

export const TRANSITION_LABELS: Record<TransitionKind, string> = {
  cut: "Cut",
  dissolve: "Dissolve",
  "dip-black": "Dip to black",
  "wipe-left": "Wipe left",
  "wipe-right": "Wipe right",
};

export const DEFAULT_TRANSITION_FRAMES = 12;
export const MAX_TRANSITION_FRAMES = 96;

// The film's existing transition names, mapped onto the five kinds this editor draws. Anything else
// falls back to a dissolve; a cut is a cut.
const FILM_TRANSITIONS: Record<string, TransitionKind> = {
  cut: "cut",
  none: "cut",
  crossfade: "dissolve",
  dissolve: "dissolve",
  zoom: "dissolve",
  iris: "dissolve",
  "iris-in": "dissolve",
  glitch: "dissolve",
  burn: "dissolve",
  fade: "dip-black",
  "fade-black": "dip-black",
  fadeblack: "dip-black",
  "dip-black": "dip-black",
  dip: "dip-black",
  black: "dip-black",
  "wipe-left": "wipe-left",
  "slide-left": "wipe-left",
  "wipe-up": "wipe-left",
  "slide-up": "wipe-left",
  "wipe-right": "wipe-right",
  "slide-right": "wipe-right",
  "wipe-down": "wipe-right",
  "slide-down": "wipe-right",
};

export function transitionKindOf(value: unknown): TransitionKind {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return "cut";
  return FILM_TRANSITIONS[key] ?? "dissolve";
}

// How long the transition is: an explicit length in frames wins, otherwise the film's speed in seconds.
export function transitionFramesOf(beat: BeatLike): number {
  if (transitionKindOf(beat.backgroundTransition) === "cut") return 0;
  const explicit = Number(beat.transitionFrames);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(MAX_TRANSITION_FRAMES, Math.round(explicit));
  const seconds = Number(beat.backgroundTransitionSpeed);
  const frames = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * FPS) : DEFAULT_TRANSITION_FRAMES;
  return Math.min(MAX_TRANSITION_FRAMES, Math.max(2, frames));
}

export interface CutTransition {
  incomingIndex: number;
  outgoingIndex: number;
  cut: number;
  frames: number;
  start: number;
  end: number;
  kind: TransitionKind;
}

// The transition on the cut before clip `incomingIndex`. It straddles the cut: half in the outgoing
// clip, half in the incoming one.
export function transitionAtCut(clips: SequenceClip[], incomingIndex: number): CutTransition | undefined {
  if (incomingIndex < 1 || incomingIndex >= clips.length) return undefined;
  const incoming = clips[incomingIndex];
  const frames = transitionFramesOf(incoming.frame.beat);
  if (frames <= 0) return undefined;
  const cut = incoming.start;
  const start = Math.max(0, cut - Math.floor(frames / 2));
  return {
    incomingIndex,
    outgoingIndex: incomingIndex - 1,
    cut,
    frames,
    start,
    end: start + frames,
    kind: transitionKindOf(incoming.frame.beat.backgroundTransition),
  };
}

// Every transition on the sequence, used by the timeline and the export report.
export function transitionsOf(clips: SequenceClip[]): CutTransition[] {
  const output: CutTransition[] = [];
  for (let index = 1; index < clips.length; index += 1) {
    const transition = transitionAtCut(clips, index);
    if (transition) output.push(transition);
  }
  return output;
}

// The transition that covers an absolute frame, if any.
export function transitionCovering(clips: SequenceClip[], frame: number): CutTransition | undefined {
  const target = Math.max(0, Math.round(frame));
  for (let index = 1; index < clips.length; index += 1) {
    const clip = clips[index];
    if (clip.start > target + MAX_TRANSITION_FRAMES) break;
    if (clip.end < target - MAX_TRANSITION_FRAMES) continue;
    const transition = transitionAtCut(clips, index);
    if (transition && target >= transition.start && target < transition.end) return transition;
  }
  return undefined;
}

// p = (frame − transition start) / length, clamped to the transition.
export function transitionProgress(transition: CutTransition, frame: number): number {
  if (transition.frames <= 0) return frame >= transition.cut ? 1 : 0;
  const raw = (frame - transition.start) / transition.frames;
  return Math.max(0, Math.min(1, raw));
}

export interface LayerStyle {
  opacity?: number;
  clipPath?: string;
}

export interface TransitionStyles {
  // The outgoing picture is drawn underneath, the incoming one on top.
  outgoing: LayerStyle;
  incoming: LayerStyle;
}

// Everything is computed from p, not from CSS animation, so a scrubbed frame and a played frame match.
export function transitionStyles(kind: TransitionKind, progress: number): TransitionStyles {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  switch (kind) {
    case "dissolve":
      return { outgoing: { opacity: 1 }, incoming: { opacity: p } };
    case "dip-black":
      // Outgoing fades to black in the first half, the incoming fades up from black in the second.
      return { outgoing: { opacity: Math.max(0, 1 - p * 2) }, incoming: { opacity: Math.max(0, p * 2 - 1) } };
    case "wipe-left":
      // The incoming picture is revealed from the left edge to the right.
      return { outgoing: { opacity: 1 }, incoming: { opacity: 1, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } };
    case "wipe-right":
      return { outgoing: { opacity: 1 }, incoming: { opacity: 1, clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` } };
    case "cut":
    default:
      return { outgoing: { opacity: 0 }, incoming: { opacity: 1 } };
  }
}

// A short description for the timeline box and reports.
export function describeTransition(transition: CutTransition): string {
  return `${TRANSITION_LABELS[transition.kind]} · ${transition.frames}f`;
}
