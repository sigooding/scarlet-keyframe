import { describe, expect, it } from "vitest";
import { setBeatAnimation, splitKeyframeAt, trimKeyframe } from "../core/edits";
import { UndoHistory } from "../core/history";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "../core/model";
import { clipFrames, FPS, formatTimecode, keyframeDuration } from "../core/timing";
import {
  buildTimelineClips,
  copySelectedKeyframes,
  evaluate,
  nextKeyframeFrameOnClip,
  pasteClipAnimationOnto,
  pasteCopiedKeyframesAt,
  prevKeyframeFrameOnClip,
  solveCubicBezier,
} from "./animate";

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
    expect(evaluate(clip, 0)).toEqual({
      zoom: 1.0,
      x: -20,
      y: 0,
      rotation: 0,
      opacity: 1,
      blur: 0,
      exposure: 0,
      gradeStrength: 1,
      depthAmount: 0.4,
    });
    expect(evaluate(clip, 10)).toEqual({
      zoom: 1.0,
      x: -20,
      y: 0,
      rotation: 0,
      opacity: 1,
      blur: 0,
      exposure: 0,
      gradeStrength: 1,
      depthAmount: 0.4,
    });

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
    expect(evaluate(clip, 95)).toEqual({
      zoom: 1.5,
      x: 10,
      y: 0,
      rotation: 0,
      opacity: 1,
      blur: 0,
      exposure: 0,
      gradeStrength: 1,
      depthAmount: 0.4,
    });
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

  it("bezier values match CSS cubic-bezier at five points, for three curves", () => {
    // Reference solver via 60-step binary search on parametric x(u) = t -> y(u)
    const refCssCubicBezier = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      t: number,
    ): number => {
      const sampleX = (u: number) =>
        3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
      const sampleY = (u: number) =>
        3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 64; i += 1) {
        const mid = 0.5 * (lo + hi);
        if (sampleX(mid) < t) lo = mid;
        else hi = mid;
      }
      return sampleY(0.5 * (lo + hi));
    };

    const threeCurves: Array<[number, number, number, number]> = [
      [0.25, 0.1, 0.25, 1.0], // CSS `ease`
      [0.85, 0.0, 0.15, 1.0], // Steep dramatic S-curve
      [0.34, 1.56, 0.64, 1.0], // Overshooting spring curve (y > 1)
    ];
    const fivePoints = [0.1, 0.25, 0.5, 0.75, 0.9];

    for (const [x1, y1, x2, y2] of threeCurves) {
      const clip = {
        beat: {
          animation: {
            opacity: [
              { frame: 0, value: 0, easing: "bezier" as const, bezier: [x1, y1, x2, y2] as [number, number, number, number] },
              { frame: 100, value: 1, easing: "linear" as const },
            ],
          },
        },
      };
      for (const t of fivePoints) {
        const expected = refCssCubicBezier(x1, y1, x2, y2, t);
        const solved = solveCubicBezier(x1, y1, x2, y2, t);
        const evaluated = evaluate(clip, t * 100).opacity;
        expect(solved).toBeCloseTo(expected, 7);
        expect(evaluated).toBeCloseTo(expected, 7);
      }
    }

    // Verify overshoot curve genuinely exceeds 1.0 mid-flight as CSS cubic-bezier does
    expect(solveCubicBezier(0.34, 1.56, 0.64, 1.0, 0.5)).toBeGreaterThan(1.05);
  });

  it("evaluates ease-in and ease-out values at chosen frames", () => {
    const clip = {
      beat: {
        animation: {
          rotation: [
            { frame: 0, value: 0, easing: "ease-in" as const },
            { frame: 20, value: 10, easing: "linear" as const },
          ],
          blur: [
            { frame: 0, value: 0, easing: "ease-out" as const },
            { frame: 20, value: 10, easing: "linear" as const },
          ],
        },
      },
    };

    // Endpoints match exactly
    expect(evaluate(clip, 0).rotation).toBe(0);
    expect(evaluate(clip, 20).rotation).toBe(10);
    expect(evaluate(clip, 0).blur).toBe(0);
    expect(evaluate(clip, 20).blur).toBe(10);

    // Chosen interior frames: 5 (t=0.25), 10 (t=0.5), 15 (t=0.75)
    // CSS ease-in = cubic-bezier(0.42, 0, 1, 1); CSS ease-out = cubic-bezier(0, 0, 0.58, 1)
    const rot5 = evaluate(clip, 5).rotation;
    const rot10 = evaluate(clip, 10).rotation;
    const rot15 = evaluate(clip, 15).rotation;

    const blur5 = evaluate(clip, 5).blur;
    const blur10 = evaluate(clip, 10).blur;
    const blur15 = evaluate(clip, 15).blur;

    // ease-in starts slower than linear (rot < linear at all interior points)
    expect(rot5).toBeCloseTo(10 * solveCubicBezier(0.42, 0, 1, 1, 0.25), 7);
    expect(rot10).toBeCloseTo(10 * solveCubicBezier(0.42, 0, 1, 1, 0.5), 7);
    expect(rot15).toBeCloseTo(10 * solveCubicBezier(0.42, 0, 1, 1, 0.75), 7);
    expect(rot5).toBeLessThan(2.5);
    expect(rot10).toBeCloseTo(3.153567, 4);
    expect(rot15).toBeLessThan(7.5);

    // ease-out starts faster than linear (blur > linear at all interior points, symmetric to ease-in)
    expect(blur5).toBeCloseTo(10 * solveCubicBezier(0, 0, 0.58, 1, 0.25), 7);
    expect(blur10).toBeCloseTo(10 * solveCubicBezier(0, 0, 0.58, 1, 0.5), 7);
    expect(blur15).toBeCloseTo(10 * solveCubicBezier(0, 0, 0.58, 1, 0.75), 7);
    expect(blur5).toBeGreaterThan(2.5);
    expect(blur10).toBeCloseTo(6.846432, 4);
    expect(blur15).toBeGreaterThan(7.5);
  });

  it("pasting selected keyframes at the playhead keeps their spacing", () => {
    let project = makeTestProject();
    project = setBeatAnimation(project, "b1", {
      opacity: [
        { frame: 4, value: 0, easing: "linear" },
        { frame: 9, value: 0.6, easing: "ease-out" },
        { frame: 17, value: 1, easing: "hold" },
      ],
      rotation: [{ frame: 9, value: 3, easing: "ease-out" }],
    });
    const clips = buildTimelineClips(buildKeyframes(project.story)).clips;
    const copied = copySelectedKeyframes(clips, [
      { frameId: "b1", prop: "opacity", frame: 4 },
      { frameId: "b1", prop: "opacity", frame: 9 },
      { frameId: "b1", prop: "opacity", frame: 17 },
      { frameId: "b1", prop: "rotation", frame: 9 },
    ]);
    expect(copied).toHaveLength(4);
    // Relative offsets from earliest keyframe (frame 4): 0, +5, +13, and rotation +5
    expect(copied.map((c) => ({ prop: c.prop, offset: c.offsetFrames }))).toEqual([
      { prop: "opacity", offset: 0 },
      { prop: "opacity", offset: 5 },
      { prop: "rotation", offset: 5 },
      { prop: "opacity", offset: 13 },
    ]);

    // Paste onto clip b2 (duration 48 frames) at local playhead frame 12 -> lands at 12, 17, 25
    const pasted = pasteCopiedKeyframesAt(undefined, copied, 12, 48);
    expect(pasted.pastedCount).toBe(4);
    expect(pasted.droppedCount).toBe(0);
    expect(pasted.animation?.opacity?.map((k) => k.frame)).toEqual([12, 17, 25]);
    expect(pasted.animation?.rotation?.map((k) => k.frame)).toEqual([17]);
  });

  it("pasting into a shorter clip drops extra keyframes after clip end and counts them", () => {
    const sourceAnim = {
      opacity: [
        { frame: 0, value: 0, easing: "linear" as const },
        { frame: 12, value: 1, easing: "ease-out" as const },
        { frame: 30, value: 0.5, easing: "linear" as const },
        { frame: 45, value: 0, easing: "linear" as const },
      ],
      blur: [
        { frame: 6, value: 8, easing: "linear" as const },
        { frame: 24, value: 0, easing: "linear" as const },
      ],
    };

    // Whole-clip "Paste animation" onto a 20-frame clip (valid frames 0..19):
    // Keeps opacity@0, opacity@12, blur@6 (3 kept); drops opacity@30, opacity@45, blur@24 (3 dropped)
    const clipPaste = pasteClipAnimationOnto(sourceAnim, 20);
    expect(clipPaste.pastedCount).toBe(3);
    expect(clipPaste.droppedCount).toBe(3);
    expect(clipPaste.animation?.opacity?.map((k) => k.frame)).toEqual([0, 12]);
    expect(clipPaste.animation?.blur?.map((k) => k.frame)).toEqual([6]);

    // Diamond Ctrl+V paste at playhead frame 10 on a 20-frame clip:
    // Offsets 0, +12, +30 -> frames 10 (kept), 22 (dropped), 40 (dropped)
    const diamondPaste = pasteCopiedKeyframesAt(
      undefined,
      [
        { prop: "opacity", offsetFrames: 0, value: 0, easing: "linear" },
        { prop: "opacity", offsetFrames: 12, value: 1, easing: "linear" },
        { prop: "opacity", offsetFrames: 30, value: 0, easing: "linear" },
      ],
      10,
      20,
    );
    expect(diamondPaste.pastedCount).toBe(1);
    expect(diamondPaste.droppedCount).toBe(2);
    expect(diamondPaste.animation?.opacity?.map((k) => k.frame)).toEqual([10]);
  });

  it("navigates previous and next keyframes on the selected clip with [ and ] helpers", () => {
    let project = makeTestProject();
    project = setBeatAnimation(project, "b2", {
      opacity: [
        { frame: 0, value: 0, easing: "linear" },
        { frame: 12, value: 1, easing: "linear" },
      ],
      rotation: [{ frame: 24, value: 3, easing: "ease-out" }],
    });
    const clips = buildTimelineClips(buildKeyframes(project.story)).clips;
    const clipB2 = clips[1];
    const anim = clipB2.keyframe.beat.animation;
    const dur = clipB2.durationFrames;

    expect(nextKeyframeFrameOnClip(anim, 0, dur)).toBe(12);
    expect(nextKeyframeFrameOnClip(anim, 12, dur)).toBe(24);
    expect(nextKeyframeFrameOnClip(anim, 24, dur)).toBeUndefined();

    expect(prevKeyframeFrameOnClip(anim, 24, dur)).toBe(12);
    expect(prevKeyframeFrameOnClip(anim, 12, dur)).toBe(0);
    expect(prevKeyframeFrameOnClip(anim, 0, dur)).toBeUndefined();
  });
});
