import { describe, expect, it } from "vitest";
import { buildKeyframes, createProjectState, type ProjectState, type StoryLike } from "./model";
import { setAnimationEasing, setAnimationValue, setClipDuration, splitClip, toggleAnimationKey, moveAnimationKey, deleteKeyframe } from "./edits";
import { GestureHistory } from "./gesture";
import { UndoHistory } from "./history";
import { buildSequence } from "../sequence/sequence";
import { evaluate } from "../sequence/animate";
import { clipFrames } from "./timing";

function makeProject(): ProjectState {
  const story = {
    id: "test-film",
    title: "Test film",
    startSceneId: "s1",
    scenes: [
      {
        id: "s1",
        animaticMark: "1",
        background: "/film/img/one.jpg",
        dialogueBeats: [
          { id: "b1", text: "First shot", durationFrames: 72, background: "/film/img/one.jpg" },
          { id: "b2", text: "Second shot", durationFrames: 48, background: "/film/img/two.jpg" },
          { id: "b3", text: "Third shot", durationFrames: 36, background: "/film/img/three.jpg" },
        ],
      },
    ],
  } as StoryLike;
  return createProjectState({ story, assets: [], missing: [], sourceName: "test.json" });
}

const sequenceOf = (project: ProjectState) => buildSequence(buildKeyframes(project.story));

describe("trim", () => {
  it("moves every later clip's start by the same number of frames", () => {
    const project = makeProject();
    const before = sequenceOf(project);
    expect(before.clips.map((clip) => clip.start)).toEqual([0, 72, 120]);

    const trimmed = setClipDuration(project, "b1", 60);
    const after = sequenceOf(trimmed);
    expect(after.clips[0].duration).toBe(60);
    expect(after.clips[1].start).toBe(before.clips[1].start - 12);
    expect(after.clips[2].start).toBe(before.clips[2].start - 12);
    expect(after.totalFrames).toBe(before.totalFrames - 12);
  });

  it("will not trim a clip below six frames", () => {
    const project = makeProject();
    const trimmed = setClipDuration(project, "b2", 2);
    expect(clipFrames(buildKeyframes(trimmed.story).find((frame) => frame.id === "b2")!)).toBe(6);
  });

  it("deleting a clip closes the gap", () => {
    const project = makeProject();
    const next = sequenceOf(deleteKeyframe(project, "b2"));
    expect(next.clips.map((clip) => clip.start)).toEqual([0, 72]);
    expect(next.clips[1].frame.id).toBe("b3");
  });
});

describe("split", () => {
  it("splits a 72-frame clip at frame 30 into 30 and 42 frames and re-times the keyframes", () => {
    let project = makeProject();
    // Zoom 1 → 1.3 across the first 48 frames and an x key halfway through.
    project = setAnimationValue(toggleAnimationKey(project, "b1", "zoom", 0, 1), "b1", "zoom", 0, 1);
    project = toggleAnimationKey(project, "b1", "zoom", 48, 1.3);
    project = toggleAnimationKey(project, "b1", "x", 15, 10);
    project = setAnimationEasing(project, "b1", "zoom", 48, "ease-in-out");

    const result = splitClip(project, "b1", 30);
    expect(result).toBeDefined();
    const split = result!.project;
    const clips = sequenceOf(split).clips;
    const first = clips.find((clip) => clip.frame.id === "b1")!;
    const second = clips.find((clip) => clip.frame.id === result!.secondId)!;

    expect(first.duration).toBe(30);
    expect(second.duration).toBe(42);
    expect(clipFrames(first.frame)).toBe(30);
    expect(clipFrames(second.frame)).toBe(42);
    // The sequence length is unchanged by a split.
    expect(sequenceOf(split).totalFrames).toBe(sequenceOf(project).totalFrames);

    // The first half keeps the keys before the cut, the second gets the rest re-timed to its own start.
    expect(first.frame.beat.animation?.zoom?.map((key) => key.frame)).toEqual([0]);
    expect(second.frame.beat.animation?.zoom?.map((key) => key.frame)).toEqual([18]);
    expect(second.frame.beat.animation?.zoom?.[0]).toMatchObject({ value: 1.3, easing: "ease-in-out" });
    expect(first.frame.beat.animation?.x?.map((key) => key.frame)).toEqual([15]);
    expect(second.frame.beat.animation?.x).toBeUndefined();

    // Values line up across the cut: the zoom at the last frame of the first half and the first frame of
    // the second half are both on the same curve.
    expect(evaluate(second.frame, 0).zoom).toBeCloseTo(1.3, 6);
    expect(evaluate(second.frame, 42).zoom).toBeCloseTo(1.3, 6);
  });

  it("gives the second half the same picture and no text", () => {
    const project = makeProject();
    const result = splitClip(project, "b1", 30)!;
    const frames = buildKeyframes(result.project.story);
    const first = frames.find((frame) => frame.id === "b1")!;
    const second = frames.find((frame) => frame.id === result.secondId)!;
    expect(second.picture).toBe(first.picture);
    expect(second.text).toBe("");
    expect(second.beat.audioUrl).toBeUndefined();
  });

  it("refuses to split within six frames of either edge", () => {
    const project = makeProject();
    expect(splitClip(project, "b1", 3)).toBeUndefined();
    expect(splitClip(project, "b1", 69)).toBeUndefined();
  });
});

describe("animation editing", () => {
  it("changes the key at the playhead and adds one elsewhere once the property is animated", () => {
    let project = makeProject();
    // A slider with no keys does nothing: the diamond starts the animation.
    expect(setAnimationValue(project, "b1", "zoom", 10, 1.4)).toBe(project);
    project = toggleAnimationKey(project, "b1", "zoom", 0, 1);
    expect(project).not.toBe(makeProject());

    // No key at frame 20 yet, but the property is animated, so this adds one.
    project = setAnimationValue(project, "b1", "zoom", 20, 1.5);
    const animation = buildKeyframes(project.story)[0].beat.animation;
    expect(animation?.zoom?.map((key) => [key.frame, key.value])).toEqual([[0, 1], [20, 1.5]]);

    // A key already at frame 20 is changed, not duplicated.
    project = setAnimationValue(project, "b1", "zoom", 20, 2);
    expect(buildKeyframes(project.story)[0].beat.animation?.zoom?.map((key) => key.value)).toEqual([1, 2]);
  });

  it("toggles the diamond and moves a key in whole frames", () => {
    let project = toggleAnimationKey(makeProject(), "b1", "y", 10, 4);
    expect(buildKeyframes(project.story)[0].beat.animation?.y).toHaveLength(1);
    project = toggleAnimationKey(project, "b1", "y", 10, 4);
    expect(buildKeyframes(project.story)[0].beat.animation).toBeUndefined();

    project = toggleAnimationKey(project, "b1", "y", 10, 4);
    project = moveAnimationKey(project, "b1", "y", 10, 24);
    expect(buildKeyframes(project.story)[0].beat.animation?.y?.[0].frame).toBe(24);
  });
});

describe("undo", () => {
  it("records one step for a whole drag", () => {
    const history = new UndoHistory<ProjectState>(100);
    const gestures = new GestureHistory<ProjectState>(history);
    const project = makeProject();
    const originalLength = sequenceOf(project).clips[0].duration;

    // A drag: one long-lived gesture with many intermediate states.
    gestures.begin(project);
    let dragged = project;
    for (let delta = 1; delta <= 12; delta += 1) dragged = setClipDuration(dragged, "b1", originalLength - delta);
    expect(sequenceOf(dragged).clips[0].duration).toBe(originalLength - 12);
    expect(gestures.commit(dragged)).toBe(true);

    const undone = history.undo(dragged);
    expect(undone).toBe(project);
    expect(sequenceOf(undone!).clips[0].duration).toBe(originalLength);
    // Exactly one step was recorded, so there is nothing else to undo.
    expect(history.canUndo).toBe(false);
  });

  it("does not record a step for a drag that changed nothing", () => {
    const history = new UndoHistory<ProjectState>(100);
    const gestures = new GestureHistory<ProjectState>(history);
    const project = makeProject();
    gestures.begin(project);
    expect(gestures.commit(project)).toBe(false);
    expect(history.canUndo).toBe(false);
  });
});
