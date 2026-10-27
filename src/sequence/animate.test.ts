import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import {
  computeDepthCameraUniforms,
  PUSH_NEAR_FAR_RATIO,
} from "../components/FrameDepthParallax";
import {
  EMPTY_MULTI_SELECTION,
} from "../core/audioClips";
import {
  convertProjectCameraMovesToKeyframes,
  executeDeleteSelection,
  insertKeyframeAfter,
  mergeKeyframes,
  setBeatAnimation,
  splitKeyframeAt,
  trimKeyframe,
} from "../core/edits";
import { UndoHistory } from "../core/history";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "../core/model";
import { clipFrames, FPS, formatTimecode, keyframeDuration } from "../core/timing";
import {
  applyKenBurnsBoxes,
  applyPoseAtPlayhead,
  buildStarterPresetAnimation,
  buildTimelineClips,
  clampKenBurnsBox,
  clampPoseToPictureEdges,
  computePictureRuns,
  copySelectedKeyframes,
  effectiveFrameCinematic,
  evaluate,
  evaluateLegacyShotMove,
  hasAnimationKeyframes,
  kenBurnsBoxFromDrag,
  kenBurnsBoxToPose,
  minZoomForRotation,
  nextKeyframeFrameOnClip,
  pasteClipAnimationOnto,
  pasteCopiedKeyframesAt,
  poseToKenBurnsBox,
  prevKeyframeFrameOnClip,
  setSliderValueAtFrame,
  solveCubicBezier,
  VIEWER_ASPECT,
  zoomPoseAroundPointer,
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

  it("computes the exact Ken Burns formula for three 16:9 boxes and writes ease-in-out keyframes", () => {
    // Box 1: Full-frame 16:9 box (boxWidth = 1.0, center = (0.5, 0.5)) -> zoom = 1, x = 0, y = 0
    const box1 = { x: 0, y: 0, width: 1.0 };
    const pose1 = kenBurnsBoxToPose(box1);
    expect(pose1.clamped).toBe(false);
    expect(pose1.zoom).toBeCloseTo(1, 9);
    expect(pose1.x).toBeCloseTo(0, 9);
    expect(pose1.y).toBeCloseTo(0, 9);

    // Box 2: Top-left half-frame 16:9 box (boxWidth = 0.5, center = (0.25, 0.25)) -> zoom = 2, x = +50, y = +50
    const box2 = { x: 0, y: 0, width: 0.5 };
    const pose2 = kenBurnsBoxToPose(box2);
    expect(pose2.clamped).toBe(false);
    expect(pose2.zoom).toBeCloseTo(1 / 0.5, 9);
    expect(pose2.x).toBeCloseTo(-(1 / 0.5) * (0.25 - 0.5) * 100, 9); // +50
    expect(pose2.y).toBeCloseTo(-(1 / 0.5) * (0.25 - 0.5) * 100, 9); // +50
    expect(pose2.x).toBe(50);
    expect(pose2.y).toBe(50);

    // Box 3: Off-centre right/upper-mid 16:9 box (boxWidth = 0.4, center = (0.68, 0.40)) -> zoom = 2.5, x = -45, y = +25
    const box3 = { x: 0.48, y: 0.2, width: 0.4 };
    const pose3 = kenBurnsBoxToPose(box3);
    expect(pose3.clamped).toBe(false);
    expect(pose3.zoom).toBeCloseTo(2.5, 9);
    expect(pose3.x).toBeCloseTo(-2.5 * (0.68 - 0.5) * 100, 9); // -45
    expect(pose3.y).toBeCloseTo(-2.5 * (0.4 - 0.5) * 100, 9); // +25

    // Inverse recovery matches all three boxes
    expect(poseToKenBurnsBox(pose1)).toEqual(box1);
    expect(poseToKenBurnsBox(pose2)).toEqual(box2);
    expect(poseToKenBurnsBox({
      zoom: pose3.zoom,
      x: pose3.x,
      y: pose3.y,
    }).width).toBeCloseTo(box3.width, 9);
    expect(poseToKenBurnsBox(pose3).x).toBeCloseTo(box3.x, 9);
    expect(poseToKenBurnsBox(pose3).y).toBeCloseTo(box3.y, 9);

    // Writing START (box2) and END (box3) on a 48-frame clip writes ease-in-out at frames 0 and 47
    const applied = applyKenBurnsBoxes(undefined, box2, box3, 48);
    expect(applied.clamped).toBe(false);
    expect(applied.animation.kenBurns).toEqual({ start: box2, end: box3 });
    expect(applied.animation.zoom).toEqual([
      { frame: 0, value: 2, easing: "ease-in-out" },
      { frame: 47, value: 2.5, easing: "ease-in-out" },
    ]);
    expect(applied.animation.x).toEqual([
      { frame: 0, value: 50, easing: "ease-in-out" },
      { frame: 47, value: -45, easing: "ease-in-out" },
    ]);
    expect(applied.animation.y).toEqual([
      { frame: 0, value: 50, easing: "ease-in-out" },
      { frame: 47, value: 25, easing: "ease-in-out" },
    ]);

    // Midpoint (frame 23.5 -> t = 0.5) of ease-in-out sits halfway between START and END poses
    const midPose = evaluate(applied.animation, 23.5);
    expect(midPose.zoom).toBeCloseTo(2.25, 6);
    expect(midPose.x).toBeCloseTo(2.5, 6);
    expect(midPose.y).toBeCloseTo(37.5, 6);
  });

  it("clamps pan, zoom, rotation, and Ken Burns boxes at the picture's edges so black never shows", () => {
    // 1. Zooming below 1.0x clamps to 1.0x and flags clamped = true
    const underZoom = clampPoseToPictureEdges({ zoom: 0.72, x: 15, y: -10, rotation: 0 });
    expect(underZoom.clamped).toBe(true);
    expect(underZoom.zoom).toBe(1);
    expect(underZoom.x).toBe(0);
    expect(underZoom.y).toBe(0);

    // 2. At zoom = 2.0x (unrotated), valid x,y span is [-50, +50]
    const inside = clampPoseToPictureEdges({ zoom: 2, x: -32, y: 24, rotation: 0 });
    expect(inside.clamped).toBe(false);
    expect(inside.x).toBe(-32);
    expect(inside.y).toBe(24);

    const pastEdges = clampPoseToPictureEdges({ zoom: 2, x: -85, y: 74, rotation: 0 });
    expect(pastEdges.clamped).toBe(true);
    expect(pastEdges.x).toBe(-50);
    expect(pastEdges.y).toBe(50);

    // 3. Rotating by 10deg at zoom = 1.0x auto-clamps zoom to minZoomForRotation(10deg, 16/9)
    //    and keeps all four viewer corners strictly inside [0, 1] x [0, 1] of the picture
    const rotated = clampPoseToPictureEdges({ zoom: 1, x: 25, y: -25, rotation: 10 }, VIEWER_ASPECT);
    expect(rotated.clamped).toBe(true);
    expect(rotated.zoom).toBeCloseTo(minZoomForRotation(10, VIEWER_ASPECT), 6);

    const rad = (rotated.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const [vx, vy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ]) {
      const qx = (vx - rotated.x / 100) / rotated.zoom;
      const qy = (vy - rotated.y / 100) / rotated.zoom;
      const u = 0.5 + qx * cos + (qy / VIEWER_ASPECT) * sin;
      const v = 0.5 - qx * VIEWER_ASPECT * sin + qy * cos;
      expect(u).toBeGreaterThanOrEqual(-1e-9);
      expect(u).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }

    // 4. Wheel zoom around an off-centre pointer keeps that picture point stationary inside bounds
    const pointerZoom = zoomPoseAroundPointer({ zoom: 1, x: 0, y: 0, rotation: 0 }, 2, 0.25, 0.75);
    expect(pointerZoom.clamped).toBe(false);
    expect(pointerZoom.zoom).toBe(2);
    expect(pointerZoom.x).toBeCloseTo(25, 6);
    expect(pointerZoom.y).toBeCloseTo(-25, 6);

    // 5. Ken Burns boxes clamp strictly inside [0, 1] x [0, 1] at 16:9
    const kbOver = clampKenBurnsBox({ x: 0.75, y: -0.2, width: 0.5 });
    expect(kbOver.clamped).toBe(true);
    expect(kbOver.box).toEqual({ x: 0.5, y: 0, width: 0.5 });

    const kbDraggedOut = kenBurnsBoxFromDrag(0.6, 0.6, 1.3, 1.2);
    expect(kbDraggedOut.clamped).toBe(true);
    expect(kbDraggedOut.box.x).toBeGreaterThanOrEqual(0);
    expect(kbDraggedOut.box.y).toBeGreaterThanOrEqual(0);
    expect(kbDraggedOut.box.x + kbDraggedOut.box.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(kbDraggedOut.box.y + kbDraggedOut.box.width).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("enforces the auto-key rule with and without existing keyframes", () => {
    // WITHOUT existing keyframes: edits change plain values only and create zero keyframes
    let plainAnim = setSliderValueAtFrame(undefined, "zoom", 18, 1.6);
    plainAnim = applyPoseAtPlayhead(plainAnim, 18, { x: -12, y: 8, rotation: 4 });

    expect(hasAnimationKeyframes(plainAnim)).toBe(false);
    expect(plainAnim?.zoom).toBeUndefined();
    expect(plainAnim?.x).toBeUndefined();
    expect(plainAnim?.y).toBeUndefined();
    expect(plainAnim?.rotation).toBeUndefined();
    expect(plainAnim?.values).toEqual({ zoom: 1.6, x: -12, y: 8, rotation: 4 });

    // Plain values apply identically at every frame of the clip
    for (const f of [0, 18, 47]) {
      const p = evaluate(plainAnim, f);
      expect(p.zoom).toBe(1.6);
      expect(p.x).toBe(-12);
      expect(p.y).toBe(8);
      expect(p.rotation).toBe(4);
    }

    // WITH existing keyframes on zoom and x (but NOT on y or rotation):
    // - Updating at an existing keyframe frame (0) modifies that keyframe's value
    // - Updating at a new playhead frame (24) adds a keyframe on zoom & x, while keeping y & rotation plain!
    const seeded = {
      zoom: [
        { frame: 0, value: 1.2, easing: "ease-in-out" as const },
        { frame: 48, value: 1.8, easing: "linear" as const },
      ],
      x: [{ frame: 0, value: 0, easing: "linear" as const }],
    };

    const updatedAtZero = setSliderValueAtFrame(seeded, "zoom", 0, 1.35);
    expect(updatedAtZero?.zoom).toEqual([
      { frame: 0, value: 1.35, easing: "ease-in-out" },
      { frame: 48, value: 1.8, easing: "linear" },
    ]);

    const updatedAtMid = applyPoseAtPlayhead(updatedAtZero, 24, {
      zoom: 1.6,
      x: -14,
      y: 9,
      rotation: -2.5,
    });
    expect(updatedAtMid?.zoom?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 0, value: 1.35 },
      { frame: 24, value: 1.6 },
      { frame: 48, value: 1.8 },
    ]);
    // zoom keyframe at 24 inherits prior keyframe's ease-in-out easing
    expect(updatedAtMid?.zoom?.[1].easing).toBe("ease-in-out");
    expect(updatedAtMid?.x?.map((k) => ({ frame: k.frame, value: k.value }))).toEqual([
      { frame: 0, value: 0 },
      { frame: 24, value: -14 },
    ]);
    // y and rotation had NO keyframes, so they changed plain values without creating keyframes
    expect(updatedAtMid?.y).toBeUndefined();
    expect(updatedAtMid?.rotation).toBeUndefined();
    expect(updatedAtMid?.values).toEqual({ y: 9, rotation: -2.5 });
  });

  it("merges frames keeping first image and removing second image into one clip, and Delete on a gap removes it completely", () => {
    const project = makeTestProject();
    const beforeClips = buildTimelineClips(buildKeyframes(project.story)).clips;
    expect(beforeClips).toHaveLength(4);
    expect(beforeClips[0].durationFrames).toBe(72);
    expect(beforeClips[1].durationFrames).toBe(48);
    const firstImg = beforeClips[0].keyframe.picture;
    const thirdImg = beforeClips[2].keyframe.picture;
    const origFirstText = project.story.scenes[0].dialogueBeats![0].text;

    // Merge b1 + b2 -> single 120f clip with b1's image; b2 removed; b3 stays at frame 120 with its own image
    const merged = mergeKeyframes(project, ["b1", "b2"]);
    expect(merged).toBeDefined();
    expect(merged!.mergedId).toBe("b1");
    expect(merged!.removedCount).toBe(1);

    const mergedClips = buildTimelineClips(buildKeyframes(merged!.project.story)).clips;
    expect(mergedClips).toHaveLength(3);
    expect(mergedClips[0].keyframe.id).toBe("b1");
    expect(mergedClips[0].durationFrames).toBe(72 + 48);
    expect(mergedClips[0].keyframe.picture).toBe(firstImg);
    expect(mergedClips[1].keyframe.id).toBe("b3");
    expect(mergedClips[1].startFrame).toBe(120);
    expect(mergedClips[1].keyframe.picture).toBe(thirdImg);
    // beat.text on b1 is never mutated
    expect(merged!.project.story.scenes[0].dialogueBeats![0].text).toBe(origFirstText);

    // Lift b3 into a black gap with Delete, then Delete on the gap removes b3 completely and ripples b4 to 120
    const lifted = executeDeleteSelection(merged!.project, {
      ...EMPTY_MULTI_SELECTION,
      pictureIds: ["b3"],
    });
    const gapClips = buildTimelineClips(buildKeyframes(lifted.project.story)).clips;
    expect(gapClips[1].keyframe.id).toBe("b3");
    expect(gapClips[1].keyframe.beat.gap).toBe(true);

    const gapDeleted = executeDeleteSelection(lifted.project, {
      ...EMPTY_MULTI_SELECTION,
      pictureIds: ["b3"],
    });
    const afterGapDelete = buildTimelineClips(buildKeyframes(gapDeleted.project.story)).clips;
    expect(afterGapDelete).toHaveLength(2);
    expect(afterGapDelete.find((c) => c.keyframe.id === "b3")).toBeUndefined();
    // Scene chain across the removed last beat of s77 into s78 (b4) stays unbroken
    expect(afterGapDelete[1].keyframe.id).toBe("b4");
    expect(afterGapDelete[1].startFrame).toBe(120);
  });

  it("deletes single-beat gap scenes and preserves deduplicated beat IDs across afterBeatTargetSceneId chains", () => {
    const project = createProjectState(
      parseImportPayload(
        {
          id: "multi-scene-gap-merge",
          title: "Multi Scene Gap & Merge",
          startSceneId: "sc1",
          scenes: [
            {
              id: "sc1",
              title: "Scene 1",
              dialogueBeats: [
                { id: "dup_id", text: "Scene 1 shot", background: "img/s1.png", durationFrames: 48, afterBeatTargetSceneId: "sc2" },
              ],
            },
            {
              id: "sc2",
              title: "Scene 2",
              dialogueBeats: [
                { id: "sc2_a", text: "Scene 2 A", background: "img/s2a.png", durationFrames: 36 },
                { id: "sc2_b", text: "Scene 2 B", background: "img/s2b.png", durationFrames: 24, afterBeatTargetSceneId: "sc3" },
              ],
            },
            {
              id: "sc3",
              title: "Scene 3",
              dialogueBeats: [
                { id: "sc3_gap", text: "", gap: true, durationFrames: 30, afterBeatTargetSceneId: "sc4" },
              ],
            },
            {
              id: "sc4",
              title: "Scene 4",
              dialogueBeats: [
                { id: "dup_id", text: "Scene 4 duplicate raw id", background: "img/s4.png", durationFrames: 60 },
              ],
            },
          ],
        },
        "multi.json",
      ),
    );

    const afterGapDelete = executeDeleteSelection(project, {
      ...EMPTY_MULTI_SELECTION,
      pictureIds: ["sc3_gap"],
    });
    const framesAfterGap = buildKeyframes(afterGapDelete.project.story);
    expect(framesAfterGap.map((f) => f.id)).toEqual(["dup_id", "sc2_a", "sc2_b", "sc4:dup_id"]);

    const merged = mergeKeyframes(afterGapDelete.project, ["dup_id", "sc2_a"])!;
    expect(merged).toBeDefined();
    const framesAfterMerge = buildKeyframes(merged.project.story);
    expect(framesAfterMerge.map((f) => f.id)).toEqual(["dup_id", "sc2_b", "sc4:dup_id"]);
    expect(framesAfterMerge[0].picture).toBe("img/s1.png");
    expect(framesAfterMerge[0].beat.durationFrames).toBe(48 + 36);
  });

  it("converts pan, zoom-hold, dolly, depth truck, and depth push shots within 1% at frame 0, middle, and end", () => {
    const voiceDurations = new Map<string, number>(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
      voiceDurations,
    });
    const frames = buildKeyframes(imported.story);
    const { clips } = buildTimelineClips(frames, voiceDurations);
    const runs = computePictureRuns(clips);

    const pickClip = (pred: (c: (typeof clips)[number]) => boolean) => {
      const hit = clips.find((c) => c.durationFrames >= 36 && pred(c));
      expect(hit).toBeDefined();
      return hit!;
    };

    const panClip = pickClip((c) => {
      const cin = effectiveFrameCinematic(c.keyframe);
      return Boolean(cin && !cin.depthMap && (cin.mode ?? "pan") === "pan");
    });
    const zoomHoldClip = pickClip((c) => {
      const cin = effectiveFrameCinematic(c.keyframe);
      return Boolean(cin && !cin.depthMap && cin.mode === "zoom-hold");
    });
    const dollyClip = pickClip((c) => {
      const cin = effectiveFrameCinematic(c.keyframe);
      return Boolean(cin && cin.mode === "dolly");
    });
    const depthTruckClip = pickClip((c) => {
      const cin = effectiveFrameCinematic(c.keyframe);
      return Boolean(cin?.depthMap && (cin.depthMotion ?? "truck") === "truck");
    });
    const depthPushClip = pickClip((c) => {
      const cin = effectiveFrameCinematic(c.keyframe);
      return Boolean(cin?.depthMap && cin.depthMotion === "push");
    });

    for (const [label, clip] of [
      ["pan", panClip],
      ["zoom-hold", zoomHoldClip],
      ["dolly", dollyClip],
      ["depth truck", depthTruckClip],
      ["depth push", depthPushClip],
    ] as const) {
      const cin = effectiveFrameCinematic(clip.keyframe);
      const run = runs[clip.index];
      const offsetFrames = Math.max(0, clip.startFrame - run.runStartFrame);
      const lastFrame = Math.max(0, clip.durationFrames - 1);
      const midFrame = Math.floor(lastFrame / 2);

      for (const f of [0, midFrame, lastFrame]) {
        const legacy = evaluateLegacyShotMove(cin, clip.keyframe.picture, (offsetFrames + f) / FPS)!;
        expect(legacy, `${label} legacy move should exist`).toBeTruthy();
        const actual = evaluate(clip, f);

        const zoomRelErr = Math.abs(actual.zoom - legacy.zoom) / Math.max(1, Math.abs(legacy.zoom));
        // `x` and `y` are percentages of the 100%-wide/tall frame, so `Math.abs(a - b) / 100` is frame fraction.
        const xFrameErr = Math.abs(actual.x - legacy.x) / 100;
        const yFrameErr = Math.abs(actual.y - legacy.y) / 100;

        expect(zoomRelErr, `${label} zoom error at frame ${f}`).toBeLessThan(0.01);
        expect(xFrameErr, `${label} x error at frame ${f}`).toBeLessThan(0.01);
        expect(yFrameErr, `${label} y error at frame ${f}`).toBeLessThan(0.01);
      }
    }
  });

  it("Convert all to keyframes preserves hand-edited keyframes, leaves no-move/new shots still, and undoes in one step", () => {
    const voiceDurations = new Map<string, number>(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const rawImported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
      convertCameraMoves: false,
    });
    let project = createProjectState(rawImported);

    const initialFrames = buildKeyframes(project.story);
    const handTarget = initialFrames.find((f) => Boolean(effectiveFrameCinematic(f)?.depthMap))!;
    const staticNoMoveTarget = initialFrames.find((f) => {
      const cin = effectiveFrameCinematic(f);
      return !cin || (cin.mode === "static" && !cin.depthMap);
    })!;

    // Hand-edit one shot prior to conversion
    const customHandAnim = {
      zoom: [
        { frame: 0, value: 1.15, easing: "linear" as const },
        { frame: 30, value: 1.55, easing: "ease-in-out" as const },
      ],
      x: [{ frame: 0, value: -7.5, easing: "linear" as const }],
    };
    project = setBeatAnimation(project, handTarget.id, customHandAnim);

    const history = new UndoHistory<ProjectState>();
    const convertedProject = convertProjectCameraMovesToKeyframes(project, voiceDurations);
    expect(convertedProject).not.toBe(project);
    history.record(project);

    const afterConvertFrames = buildKeyframes(convertedProject.story);
    const handAfter = afterConvertFrames.find((f) => f.id === handTarget.id)!;
    expect(handAfter.beat.animation).toEqual(customHandAnim);

    const staticAfter = afterConvertFrames.find((f) => f.id === staticNoMoveTarget.id)!;
    expect(hasAnimationKeyframes(staticAfter)).toBe(false);

    // Newly inserted shots start with no keyframes (still picture)
    const insertedRes = insertKeyframeAfter(convertedProject, staticAfter.id)!;
    const insertedFrame = buildKeyframes(insertedRes.project.story).find(
      (f) => f.id === insertedRes.insertedId,
    )!;
    expect(hasAnimationKeyframes(insertedFrame)).toBe(false);
    expect(insertedFrame.beat.animation).toBeUndefined();

    // "Start from preset" writes editable keyframes onto a still shot
    const presetAnim = buildStarterPresetAnimation("zoom-hold", insertedFrame, 48);
    expect(presetAnim?.zoom?.length).toBeGreaterThanOrEqual(2);

    // One undo step undoes the entire film-wide conversion!
    const undone = history.undo(convertedProject)!;
    expect(undone).toBe(project);
    const undoneFrames = buildKeyframes(undone.story);
    expect(undoneFrames.find((f) => f.id === handTarget.id)!.beat.animation).toEqual(customHandAnim);
    const uneditedMoving = undoneFrames.find(
      (f) => f.id !== handTarget.id && Boolean(effectiveFrameCinematic(f)?.depthMap),
    )!;
    expect(hasAnimationKeyframes(uneditedMoving)).toBe(false);
  });

  it("maps keyframed zoom, x/y, and depthAmount to depth shader uniforms without exposing edges", () => {
    const clip = {
      keyframe: {
        cinematic: { depthMap: "/film/depth/s1/shot/depth.png", depthAmount: 0.4 },
        beat: {
          cinematic: { depthMap: "/film/depth/s1/shot/depth.png", depthAmount: 0.4 },
          animation: {
            zoom: [
              { frame: 0, value: 1.0, easing: "linear" as const },
              { frame: 48, value: 1.24, easing: "linear" as const },
            ],
            x: [
              { frame: 0, value: -6, easing: "linear" as const },
              { frame: 48, value: 6, easing: "linear" as const },
            ],
            y: [
              { frame: 0, value: -3, easing: "linear" as const },
              { frame: 48, value: 3, easing: "linear" as const },
            ],
            depthAmount: [
              { frame: 0, value: 0.2, easing: "linear" as const },
              { frame: 48, value: 0.8, easing: "linear" as const },
            ],
          },
        },
        scene: {},
      },
    } as any;

    const pose0 = evaluate(clip, 0);
    const pose48 = evaluate(clip, 48);
    expect(pose0.depthAmount).toBeCloseTo(0.2, 6);
    expect(pose48.depthAmount).toBeCloseTo(0.8, 6);
    expect(pose48.depthAmount).not.toBeCloseTo(pose0.depthAmount, 2);

    // At baseline depthAmount (0.4), zoom becomes push in exact PUSH_NEAR / PUSH_FAR ratio (3:1)
    const pureZoomUni = computeDepthCameraUniforms({
      zoom: 1.2,
      x: 0,
      y: 0,
      amount: 0.4,
      authoredAmount: 0.4,
      focus: 0.5,
    });
    expect(pureZoomUni.uZoom[0]).toBeCloseTo(1.2, 6);
    expect(pureZoomUni.uZoom[1] - 1).toBeCloseTo((1.2 - 1) * PUSH_NEAR_FAR_RATIO, 6);

    // Check every frame 0..48: source(uv, d) stays inside [0, 1]^2 for all corners uv in {0,1}^2 and d in {0, 0.5, 1}
    for (let f = 0; f <= 48; f += 6) {
      const p = evaluate(clip, f);
      const uni = computeDepthCameraUniforms({
        zoom: p.zoom,
        x: p.x,
        y: p.y,
        amount: p.depthAmount,
        authoredAmount: 0.4,
        focus: 0.35,
      });
      for (const d of [0, 0.35, 0.7, 1]) {
        const z = uni.uZoom[0] + (uni.uZoom[1] - uni.uZoom[0]) * d;
        const reach = d - uni.uFocus;
        for (const uvx of [0, 1]) {
          const sx = uni.uCenter[0] + (uvx - uni.uShift[0] * reach - uni.uCenter[0]) / z;
          expect(sx).toBeGreaterThanOrEqual(-1e-6);
          expect(sx).toBeLessThanOrEqual(1 + 1e-6);
        }
        for (const uvy of [0, 1]) {
          const sy = uni.uCenter[1] + (uvy - uni.uShift[1] * reach - uni.uCenter[1]) / z;
          expect(sy).toBeGreaterThanOrEqual(-1e-6);
          expect(sy).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
    }
  });

  it("keeps carried picture poses continuous across cuts (within one frame's movement)", () => {
    // 1. Hand-keyframed clip followed by carried clips (both unkeyframed and partially keyframed)
    const carriedProject = createProjectState(
      parseImportPayload(
        {
          id: "carried-continuity",
          title: "Carried Continuity",
          startSceneId: "s1",
          scenes: [
            {
              id: "s1",
              background: "/film/img/s1/shared.jpg",
              dialogueBeats: [
                {
                  id: "c1",
                  text: "Beat one",
                  durationFrames: 48,
                  animation: {
                    zoom: [
                      { frame: 0, value: 1.0, easing: "linear" },
                      { frame: 47, value: 1.32, easing: "linear" },
                    ],
                    x: [
                      { frame: 0, value: 0, easing: "linear" },
                      { frame: 47, value: -5, easing: "linear" },
                    ],
                  },
                },
                {
                  id: "c2",
                  text: "Beat two (carried, no own keyframes)",
                  durationFrames: 48,
                },
                {
                  id: "c3",
                  text: "Beat three (carried, only end keyframe at +47f)",
                  durationFrames: 48,
                  animation: {
                    zoom: [{ frame: 47, value: 1.5, easing: "linear" }],
                    x: [{ frame: 47, value: -8, easing: "linear" }],
                  },
                },
              ],
            },
          ],
        },
        "carried.json",
      ),
    );

    const { clips: cClips } = buildTimelineClips(buildKeyframes(carriedProject.story));
    const endC1 = evaluate(cClips[0], 47);
    const startC2 = evaluate(cClips[1], 0);
    expect(startC2.zoom).toBeCloseTo(endC1.zoom, 6);
    expect(startC2.x).toBeCloseTo(endC1.x, 6);

    const endC2 = evaluate(cClips[1], 47);
    const startC3 = evaluate(cClips[2], 0);
    const frame1C3 = evaluate(cClips[2], 1);
    expect(startC3.zoom).toBeCloseTo(endC2.zoom, 6);
    expect(startC3.x).toBeCloseTo(endC2.x, 6);
    expect(frame1C3.zoom).toBeGreaterThan(startC3.zoom);

    // 2. Converted film carried runs: continuous `presetFrame` even with keyframes, and pose delta across cut <= 1 frame's movement
    const voiceDurations = new Map<string, number>(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const importedFilm = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
      voiceDurations,
    });
    const { clips: filmClips } = buildTimelineClips(
      buildKeyframes(importedFilm.story),
      voiceDurations,
    );
    const runs = computePictureRuns(filmClips);

    let checkedCarriedCuts = 0;
    for (let i = 1; i < filmClips.length; i += 1) {
      const prev = filmClips[i - 1];
      const cur = filmClips[i];
      if (runs[i].runKeyId !== runs[i - 1].runKeyId) continue;

      // Continuous `presetFrame` across the cut even though both clips have keyframes!
      const prevLastPreset = prev.startFrame - runs[i - 1].runStartFrame + (prev.durationFrames - 1);
      const curFirstPreset = cur.startFrame - runs[i].runStartFrame + 0;
      expect(curFirstPreset).toBe(prevLastPreset + 1);

      const pPrevEnd = evaluate(prev, prev.durationFrames - 1);
      const pPrevPenult = evaluate(prev, Math.max(0, prev.durationFrames - 2));
      const pCurStart = evaluate(cur, 0);
      const pCurNext = evaluate(cur, Math.min(cur.durationFrames - 1, 1));

      const stepZoom = Math.max(
        Math.abs(pPrevEnd.zoom - pPrevPenult.zoom),
        Math.abs(pCurNext.zoom - pCurStart.zoom),
        0.002,
      );
      const stepX = Math.max(
        Math.abs(pPrevEnd.x - pPrevPenult.x),
        Math.abs(pCurNext.x - pCurStart.x),
        0.05,
      );

      expect(Math.abs(pCurStart.zoom - pPrevEnd.zoom)).toBeLessThanOrEqual(stepZoom * 1.5);
      expect(Math.abs(pCurStart.x - pPrevEnd.x)).toBeLessThanOrEqual(stepX * 1.5);
      checkedCarriedCuts += 1;
    }
    expect(checkedCarriedCuts).toBeGreaterThan(50);
  });
});

