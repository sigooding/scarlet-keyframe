import { describe, expect, it } from "vitest";
import { setBeatAnimation, splitKeyframeAt, trimKeyframe } from "../core/edits";
import { UndoHistory } from "../core/history";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "../core/model";
import { clipFrames, FPS, formatTimecode, keyframeDuration } from "../core/timing";
import { buildTimelineClips, evaluate } from "./animate";

function makeTestProject(): ProjectState {
  const raw = {
    id: "test-film",
    title: "Test Film",
    startSceneId: "s77",
    scenes: [
      {
        id: "s77",
        animaticMark: "77",
        background: "/film/img/s77/85-the-desk-lamp.jpg",
        dialogueBeats: [
          {
            id: "b1",
            characterId: "vera",
            text: "First line of scene seventy-seven.",
            holdSeconds: 3, // 72 frames at 24 fps
          },
          {
            id: "b2",
            characterId: "jack",
            text: "Second line.",
            background: "/film/img/s77/86-the-clean-envelope.jpg",
            holdSeconds: 2, // 48 frames at 24 fps
          },
          {
            id: "b3",
            characterId: "jack",
            text: "Third line.",
            background: "/film/img/s77/87-he-writes-nothing.jpg",
            holdSeconds: 2.5, // 60 frames at 24 fps
            afterBeatTargetSceneId: "s78",
          },
        ],
      },
      {
        id: "s78",
        animaticMark: "78",
        background: "/film/img/s78/88-the-walkway.jpg",
        dialogueBeats: [
          {
            id: "b4",
            characterId: "jack",
            text: "Scene seventy-eight.",
            holdSeconds: 2, // 48 frames at 24 fps
          },
        ],
      },
    ],
  };
  return createProjectState(parseImportPayload(raw, "test.json"));
}

describe("sequence time & animation", () => {
  it("evaluate() computes linear, ease-in-out, hold, before-first, and after-last values", () => {
    const clip = {
      animation: {
        zoom: [
          { frame: 10, value: 1.0, easing: "linear" as const },
          { frame: 30, value: 2.0, easing: "ease-in-out" as const },
          { frame: 50, value: 3.0, easing: "hold" as const },
          { frame: 70, value: 1.5, easing: "linear" as const },
        ],
        x: [
          { frame: 12, value: -20, easing: "hold" as const },
          { frame: 24, value: 10, easing: "linear" as const },
        ],
      },
    };

    // Before the first keyframe -> first keyframe's value
    expect(evaluate(clip, 0)).toEqual({ zoom: 1.0, x: -20, y: 0 });
    expect(evaluate(clip, 10)).toEqual({ zoom: 1.0, x: -20, y: 0 });

    // Linear segment [10..30]: 1.0 -> 2.0
    expect(evaluate(clip, 15).zoom).toBeCloseTo(1.25, 6);
    expect(evaluate(clip, 20).zoom).toBeCloseTo(1.5, 6);
    expect(evaluate(clip, 25).zoom).toBeCloseTo(1.75, 6);

    // Hold segment on x [12..24]: stays -20 until frame 24, then becomes 10
    expect(evaluate(clip, 12).x).toBe(-20);
    expect(evaluate(clip, 23).x).toBe(-20);
    expect(evaluate(clip, 24).x).toBe(10);

    // Ease-in-out segment [30..50]: 2.0 -> 3.0
    // t = 0.25 -> 3(0.0625) - 2(0.015625) = 0.15625 (slower than linear 0.25 near start)
    // t = 0.5  -> 0.5 (exact midpoint = 2.5)
    // t = 0.75 -> 0.84375 (slower than linear near end)
    expect(evaluate(clip, 35).zoom).toBeCloseTo(2.15625, 6);
    expect(evaluate(clip, 40).zoom).toBeCloseTo(2.5, 6);
    expect(evaluate(clip, 45).zoom).toBeCloseTo(2.84375, 6);

    // Hold segment on zoom [50..70]: stays 3.0 until frame 70
    expect(evaluate(clip, 50).zoom).toBe(3.0);
    expect(evaluate(clip, 69).zoom).toBe(3.0);
    expect(evaluate(clip, 70).zoom).toBe(1.5);

    // After the last keyframe -> last keyframe's value
    expect(evaluate(clip, 95)).toEqual({ zoom: 1.5, x: 10, y: 0 });
  });

  it("clipFrames() uses durationFrames when set, otherwise keyframeDuration at 24 fps", () => {
    let project = makeTestProject();
    let keyframes = buildKeyframes(project.story);
    expect(keyframeDuration(keyframes[0])).toBe(3);
    expect(clipFrames(keyframes[0])).toBe(3 * FPS); // 72

    project = trimKeyframe(project, "b1", 60);
    keyframes = buildKeyframes(project.story);
    expect(clipFrames(keyframes[0])).toBe(60);

    expect(formatTimecode(0)).toBe("00:00:00");
    expect(formatTimecode(72)).toBe("00:03:00");
    expect(formatTimecode(60)).toBe("00:02:12");
  });

  it("trimming one clip ripples every later clip's start by the same number of frames", () => {
    const before = makeTestProject();
    const beforeClips = buildTimelineClips(buildKeyframes(before.story)).clips;
    expect(beforeClips.map((c) => c.startFrame)).toEqual([0, 72, 120, 180]);

    // Trim clip 0 ("b1") 12 frames shorter: 72 -> 60
    const after = trimKeyframe(before, "b1", 60);
    const afterClips = buildTimelineClips(buildKeyframes(after.story)).clips;
    expect(afterClips[0].durationFrames).toBe(60);
    expect(afterClips.map((c) => c.startFrame)).toEqual([0, 60, 108, 168]);

    for (let i = 1; i < beforeClips.length; i += 1) {
      expect(afterClips[i].startFrame - beforeClips[i].startFrame).toBe(-12);
    }
  });

  it("splitting at frame 30 of a 72-frame clip gives 30f and 42f clips with split, re-timed keyframes", () => {
    let project = makeTestProject();
    project = setBeatAnimation(project, "b1", {
      zoom: [
        { frame: 0, value: 1.0, easing: "ease-in-out" },
        { frame: 20, value: 1.2, easing: "linear" },
        { frame: 45, value: 1.5, easing: "linear" },
        { frame: 71, value: 1.8, easing: "linear" },
      ],
      x: [
        { frame: 10, value: -15, easing: "linear" },
        { frame: 30, value: 0, easing: "hold" },
        { frame: 60, value: 25, easing: "linear" },
      ],
    });

    const split = splitKeyframeAt(project, "b1", 30);
    expect(split).toBeDefined();

    const clips = buildTimelineClips(buildKeyframes(split!.project.story)).clips;
    expect(clips).toHaveLength(5);

    const first = clips[0];
    const second = clips[1];
    expect(first.durationFrames).toBe(30);
    expect(second.durationFrames).toBe(42);
    expect(first.startFrame).toBe(0);
    expect(second.startFrame).toBe(30);
    expect(clips[2].startFrame).toBe(72); // Later clips keep their exact position across a split

    // Second clip keeps the same picture and has no text
    expect(second.keyframe.picture).toBe(first.keyframe.picture);
    expect(second.keyframe.text).toBe("");

    // Keyframes split between halves and re-timed to each half's start
    expect(first.keyframe.beat.animation?.zoom).toEqual([
      { frame: 0, value: 1.0, easing: "ease-in-out" },
      { frame: 20, value: 1.2, easing: "linear" },
    ]);
    expect(second.keyframe.beat.animation?.zoom).toEqual([
      { frame: 15, value: 1.5, easing: "linear" },
      { frame: 41, value: 1.8, easing: "linear" },
    ]);

    // A keyframe right at the split point (frame 30) stays at 30 on first and re-times to 0 on second
    expect(first.keyframe.beat.animation?.x).toEqual([
      { frame: 10, value: -15, easing: "linear" },
      { frame: 30, value: 0, easing: "hold" },
    ]);
    expect(second.keyframe.beat.animation?.x).toEqual([
      { frame: 0, value: 0, easing: "hold" },
      { frame: 30, value: 25, easing: "linear" },
    ]);
  });

  it("records an entire multi-step drag as a single undo step", () => {
    const history = new UndoHistory<ProjectState>(50);
    const initial = makeTestProject();
    let current = initial;

    // Simulate dragging right edge through 5 pointermove steps: 72 -> 70 -> 66 -> 63 -> 60
    history.beginDrag(current);
    for (const frames of [70, 66, 63, 60]) {
      current = trimKeyframe(current, "b1", frames);
    }
    expect(history.commitDrag(current)).toBe(true);
    expect(clipFrames(buildKeyframes(current.story)[0])).toBe(60);
    expect(history.canUndo).toBe(true);

    // One single undo restores the initial 72-frame state and empties the undo stack
    const undone = history.undo(current);
    expect(undone).toBe(initial);
    expect(clipFrames(buildKeyframes(undone!.story)[0])).toBe(72);
    expect(history.canUndo).toBe(false);
  });
});
