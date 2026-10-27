import { describe, expect, it } from "vitest";
import { buildKeyframes, createProjectState, type ProjectState, type StoryLike } from "../core/model";
import { setTransitionFrames, setTransitionKind } from "../core/edits";
import { buildSequence } from "./sequence";
import {
  transitionAtCut,
  transitionFramesOf,
  transitionKindOf,
  transitionProgress,
  transitionStyles,
  transitionsOf,
} from "./transitions";

function makeProject(beats: Record<string, unknown>[]): ProjectState {
  const story = {
    id: "film",
    title: "Film",
    startSceneId: "s1",
    scenes: [{ id: "s1", animaticMark: "1", background: "/img/a.jpg", dialogueBeats: beats }],
  } as StoryLike;
  return createProjectState({ story, assets: [], missing: [], sourceName: "t.json" });
}

const clipsOf = (project: ProjectState) => buildSequence(buildKeyframes(project.story)).clips;

describe("transition mapping", () => {
  it("maps the film's transitions onto the five editor kinds", () => {
    expect(transitionKindOf("crossfade")).toBe("dissolve");
    expect(transitionKindOf("dissolve")).toBe("dissolve");
    expect(transitionKindOf("fade")).toBe("dip-black");
    expect(transitionKindOf("fade-black")).toBe("dip-black");
    expect(transitionKindOf("slide-left")).toBe("wipe-left");
    expect(transitionKindOf("wipe-up")).toBe("wipe-left");
    expect(transitionKindOf("wipe-right")).toBe("wipe-right");
    expect(transitionKindOf("cut")).toBe("cut");
    expect(transitionKindOf(undefined)).toBe("cut");
    expect(transitionKindOf("something-else")).toBe("dissolve");
  });

  it("takes its length from an explicit frame count, else from the film's speed in seconds", () => {
    expect(transitionFramesOf({ backgroundTransition: "crossfade", backgroundTransitionSpeed: 0.9 })).toBe(22);
    expect(transitionFramesOf({ backgroundTransition: "crossfade", transitionFrames: 12, backgroundTransitionSpeed: 0.9 })).toBe(12);
    expect(transitionFramesOf({ backgroundTransition: "fade", backgroundTransitionSpeed: 0.5 })).toBe(12);
    // A cut has no length at all.
    expect(transitionFramesOf({ backgroundTransition: "cut", backgroundTransitionSpeed: 2 })).toBe(0);
  });
});

describe("a transition on the cut", () => {
  const project = makeProject([
    { id: "a", text: "A", durationFrames: 48, background: "/img/a.jpg" },
    { id: "b", text: "B", durationFrames: 48, background: "/img/b.jpg", backgroundTransition: "crossfade", transitionFrames: 12 },
    { id: "c", text: "C", durationFrames: 48, background: "/img/c.jpg" },
  ]);
  const clips = clipsOf(project);
  const transition = transitionAtCut(clips, 1)!;

  it("straddles the cut and is listed once", () => {
    expect(transition).toMatchObject({ cut: 48, frames: 12, start: 42, end: 54, kind: "dissolve" });
    expect(transitionsOf(clips)).toHaveLength(1);
    // The cut before the first clip has nothing to transition from.
    expect(transitionAtCut(clips, 0)).toBeUndefined();
  });

  it("reports progress 0, 0.5 and 1 at its first, middle and last frame", () => {
    expect(transitionProgress(transition, 42)).toBe(0);
    expect(transitionProgress(transition, 48)).toBeCloseTo(0.5, 6);
    expect(transitionProgress(transition, 53)).toBeCloseTo(11 / 12, 6);
    // Outside the transition it clamps.
    expect(transitionProgress(transition, 10)).toBe(0);
    expect(transitionProgress(transition, 900)).toBe(1);
    // First frame, middle frame, last frame of a 12-frame transition starting at 42.
    expect([42, 48, 54].map((frame) => transitionProgress(transition, frame))).toEqual([0, 0.5, 1]);
  });

  it("draws both pictures from the frame number", () => {
    const start = transitionStyles("dissolve", 0);
    const middle = transitionStyles("dissolve", 0.5);
    const end = transitionStyles("dissolve", 1);
    expect(start.incoming.opacity).toBe(0);
    expect(middle.incoming.opacity).toBe(0.5);
    expect(end.incoming.opacity).toBe(1);
    expect(middle.outgoing.opacity).toBe(1);

    // Dip to black: out fades down in the first half, in fades up in the second.
    expect(transitionStyles("dip-black", 0.25).outgoing.opacity).toBeCloseTo(0.5, 6);
    expect(transitionStyles("dip-black", 0.25).incoming.opacity).toBe(0);
    expect(transitionStyles("dip-black", 0.75).outgoing.opacity).toBe(0);
    expect(transitionStyles("dip-black", 0.75).incoming.opacity).toBeCloseTo(0.5, 6);

    // Wipes reveal the incoming picture with a moving clip-path.
    expect(transitionStyles("wipe-left", 0).incoming.clipPath).toBe("inset(0 100% 0 0)");
    expect(transitionStyles("wipe-left", 0.5).incoming.clipPath).toBe("inset(0 50% 0 0)");
    expect(transitionStyles("wipe-left", 1).incoming.clipPath).toBe("inset(0 0% 0 0)");
    expect(transitionStyles("wipe-right", 0.25).incoming.clipPath).toBe("inset(0 0 0 75%)");

    expect(transitionStyles("cut", 0.5)).toEqual({ outgoing: { opacity: 0 }, incoming: { opacity: 1 } });
  });

  it("changes kind and length in frames", () => {
    let next = setTransitionFrames(project, "b", 36);
    expect(transitionAtCut(clipsOf(next), 1)).toMatchObject({ frames: 36, start: 48 - 18, end: 48 + 18 });
    // The film's own speed field follows the frame length so an export agrees.
    expect(buildKeyframes(next.story)[1].beat.backgroundTransitionSpeed).toBeCloseTo(36 / 24, 6);

    next = setTransitionKind(next, "b", "wipe-right");
    expect(transitionAtCut(clipsOf(next), 1)!.kind).toBe("wipe-right");

    next = setTransitionKind(next, "b", "cut");
    expect(transitionAtCut(clipsOf(next), 1)).toBeUndefined();

    // A new kind on a cut starts as a 12-frame dissolve.
    next = setTransitionFrames(project, "c", 0);
    expect(transitionAtCut(clipsOf(next), 2)).toBeUndefined();
  });
});
