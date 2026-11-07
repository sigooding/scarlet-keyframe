import { describe, expect, it } from "vitest";
import { clampPoseToPictureEdges, evaluateChannel } from "../sequence/animate";
import {
  buildDrivenAnimation,
  countKeys,
  coverZoomFor,
  handheldAnimation,
  handheldOffsets,
  NEUTRAL_POSE,
  NO_OFFSET,
  sampleDrive,
  simplifyPoints,
  addOffsets,
  addSample,
  commitRecording,
  offsetFromDrag,
  zoomFromWheel,
  type DrivePose,
  type DriveRecording,
  type DriveSample,
} from "./cameraDrive";

const poseAt = (animation: ReturnType<typeof buildDrivenAnimation>, frame: number, base: DrivePose = NEUTRAL_POSE): DrivePose => ({
  zoom: evaluateChannel(animation?.zoom, frame, base.zoom),
  x: evaluateChannel(animation?.x, frame, base.x),
  y: evaluateChannel(animation?.y, frame, base.y),
  rotation: evaluateChannel(animation?.rotation, frame, base.rotation),
});

/** A performance: `hand` gives the offset at each frame, over a shot that may already have a move. */
function perform(frames: number, hand: (frame: number) => Partial<typeof NO_OFFSET>, base: (frame: number) => DrivePose = () => NEUTRAL_POSE): DriveSample[] {
  const out: DriveSample[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    out.push({ frame, pose: sampleDrive(base(frame), { ...NO_OFFSET, ...hand(frame) }) });
  }
  return out;
}

describe("the pose a frame of driving records", () => {
  it("adds the hand to the move the shot already has", () => {
    const base: DrivePose = { zoom: 1.4, x: 3, y: -2, rotation: 0 };
    const pose = sampleDrive(base, { x: 1.5, y: 0.5, zoom: 1.1, rotation: 0.4 });
    expect(pose.zoom).toBeCloseTo(1.54, 4); // 1.4 × 1.1: the shot's zoom keeps zooming
    expect(pose.x).toBeCloseTo(4.5, 4);
    expect(pose.y).toBeCloseTo(-1.5, 4);
    expect(pose.rotation).toBeCloseTo(0.4, 4);
  });

  it("holds the camera inside the picture, however hard the hand pushes", () => {
    const pose = sampleDrive(NEUTRAL_POSE, { x: 500, y: -500, zoom: 1, rotation: 0 });
    const held = clampPoseToPictureEdges(pose);
    expect(pose).toEqual({ zoom: held.zoom, x: held.x, y: held.y, rotation: held.rotation });
    expect(Math.abs(pose.x)).toBeLessThan(500);
  });

  it("lifts the zoom when the camera rolls, so no edge shows", () => {
    const flat = sampleDrive(NEUTRAL_POSE, { ...NO_OFFSET, rotation: 0 });
    const rolled = sampleDrive(NEUTRAL_POSE, { ...NO_OFFSET, rotation: 4 });
    expect(flat.zoom).toBeCloseTo(1, 4);
    expect(rolled.zoom).toBeGreaterThan(1.05);
    expect(rolled.rotation).toBeCloseTo(4, 4);
  });

  it("throws the shot's own move away when it is given the neutral pose", () => {
    expect(sampleDrive(NEUTRAL_POSE, NO_OFFSET)).toEqual({ zoom: 1, x: 0, y: 0, rotation: 0 });
  });
});

describe("fitting a performance to keyframes", () => {
  it("keeps the shape of the move with a handful of keys instead of one per frame", () => {
    const samples = perform(240, (frame) => ({ x: 6 * Math.sin((frame / 240) * Math.PI * 2) }));
    const animation = buildDrivenAnimation({ samples, smooth: 0.5 })!;
    expect(animation).not.toBeNull();
    expect(animation.x!.length).toBeGreaterThan(3);
    expect(animation.x!.length).toBeLessThan(40); // not 240
    for (let frame = 0; frame < 240; frame += 7) {
      expect(poseAt(animation, frame).x, `frame ${frame}`).toBeCloseTo(samples[frame].pose.x, 0);
    }
  });

  it("starts and ends exactly where the hand did", () => {
    const samples = perform(96, (frame) => ({ x: frame / 10, y: -frame / 20 }));
    const animation = buildDrivenAnimation({ samples, smooth: 1 })!;
    expect(animation.x![0].frame).toBe(0);
    expect(animation.x!.at(-1)!.frame).toBe(95);
    expect(poseAt(animation, 0).x).toBeCloseTo(samples[0].pose.x, 2);
    expect(poseAt(animation, 95).x).toBeCloseTo(samples[95].pose.x, 2);
  });

  it("a calmer setting keeps fewer keys than an exact one", () => {
    const samples = perform(240, (frame) => ({ x: 4 * Math.sin(frame / 3), y: 2 * Math.cos(frame / 5) }));
    const exact = countKeys(buildDrivenAnimation({ samples, smooth: 0 }));
    const middling = countKeys(buildDrivenAnimation({ samples, smooth: 0.5 }));
    const calm = countKeys(buildDrivenAnimation({ samples, smooth: 1 }));
    expect(exact).toBeGreaterThan(middling);
    expect(middling).toBeGreaterThanOrEqual(calm);
  });

  it("leaves a channel alone when the hand did not move it: a driven pan keeps the shot's zoom", () => {
    const base = (frame: number): DrivePose => ({ zoom: 1 + frame / 1000, x: 0, y: 0, rotation: 0 });
    const before = { zoom: [{ frame: 0, value: 1, easing: "linear" as const }, { frame: 119, value: 1.12, easing: "linear" as const }] };
    const panned = perform(120, (frame) => ({ x: frame / 30 }), base);
    const animation = buildDrivenAnimation({ samples: panned, base: before, smooth: 0.5 })!;
    expect(animation.x).toBeDefined();
    expect(animation.y).toBeUndefined(); // the hand held it still, so the shot keeps its own
    expect(animation.rotation).toBeUndefined();
    // the zoom it was driven over is recorded, not thrown away
    expect(poseAt(animation, 119).zoom).toBeCloseTo(base(119).zoom, 2);
  });

  it("keeps the shot's other channels (opacity, blur) exactly as they were", () => {
    const base = { opacity: [{ frame: 0, value: 0, easing: "linear" as const }], blur: [{ frame: 3, value: 2, easing: "linear" as const }] };
    const animation = buildDrivenAnimation({ samples: perform(48, (frame) => ({ x: frame / 8 })), base, smooth: 0.5 })!;
    expect(animation.opacity).toEqual(base.opacity);
    expect(animation.blur).toEqual(base.blur);
  });

  it("writes nothing at all when the hand never moved", () => {
    expect(buildDrivenAnimation({ samples: perform(60, () => ({})), smooth: 0.5 })).toBeNull();
    expect(buildDrivenAnimation({ samples: [], smooth: 0.5 })).toBeNull();
    expect(buildDrivenAnimation({ samples: perform(1, () => ({ x: 4 })), smooth: 0.5 })).toBeNull();
  });

  it("keys are linear and in order, on whole frames", () => {
    const animation = buildDrivenAnimation({ samples: perform(120, (frame) => ({ x: Math.sin(frame / 4) * 5 })), smooth: 0.4 })!;
    const keys = animation.x!;
    expect(keys.every((key) => key.easing === "linear")).toBe(true);
    expect(keys.every((key) => Number.isInteger(key.frame))).toBe(true);
    expect([...keys].sort((a, b) => a.frame - b.frame)).toEqual(keys);
  });
});

describe("simplifyPoints", () => {
  it("drops the points a straight line does not need", () => {
    const line = Array.from({ length: 50 }, (_, frame) => ({ frame, value: frame * 2 }));
    expect(simplifyPoints(line, 0.5)).toEqual([line[0], line[49]]);
  });

  it("keeps a corner", () => {
    const peak = [...Array.from({ length: 10 }, (_, i) => ({ frame: i, value: i })), ...Array.from({ length: 10 }, (_, i) => ({ frame: 10 + i, value: 9 - i }))];
    const kept = simplifyPoints(peak, 0.5);
    expect(kept.some((point) => point.frame === 9)).toBe(true);
    expect(kept.length).toBeLessThan(peak.length);
  });

  it("gives everything back when it is told to keep everything", () => {
    const wobbly = Array.from({ length: 20 }, (_, frame) => ({ frame, value: Math.sin(frame) }));
    expect(simplifyPoints(wobbly, 0)).toEqual(wobbly);
    expect(simplifyPoints([{ frame: 0, value: 1 }], 1)).toHaveLength(1);
  });
});

describe("the handheld nobody has to perform", () => {
  it("floats: never still, never far", () => {
    const offsets = handheldOffsets({ durationFrames: 240, sway: 1, bob: 0.8, roll: 0.5, speed: 1.6 });
    expect(offsets).toHaveLength(240);
    expect(offsets[0]).toEqual(NO_OFFSET); // a cut onto a camera already off-centre reads as a jump
    const xs = offsets.map((offset) => offset.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(1.0001);
    expect(Math.max(...offsets.map((offset) => Math.abs(offset.rotation)))).toBeLessThanOrEqual(0.5001);
  });

  it("breathes rather than vibrates: no jump between one frame and the next", () => {
    const sway = 1.5;
    const offsets = handheldOffsets({ durationFrames: 240, sway, bob: sway, roll: 1, speed: 2 });
    // Frame to frame it never moves more than the easing allows: a smoothstep between two stops 12 frames apart
    // peaks at 1.5 × swing / 12. That is what makes it a float rather than a vibration.
    const smallStep = (1.5 * (2 * sway)) / 12 + 1e-6;
    for (let frame = 1; frame < offsets.length; frame += 1) {
      expect(Math.abs(offsets[frame].x - offsets[frame - 1].x), `frame ${frame}`).toBeLessThan(smallStep);
      expect(Math.abs(offsets[frame].y - offsets[frame - 1].y), `frame ${frame}`).toBeLessThan(smallStep);
    }
  });

  it("is the same move every time, so a rebuild never changes a shot", () => {
    const once = handheldOffsets({ durationFrames: 120, seed: "s12" });
    const again = handheldOffsets({ durationFrames: 120, seed: "s12" });
    expect(again).toEqual(once);
    expect(handheldOffsets({ durationFrames: 120, seed: "s13" })).not.toEqual(once);
  });

  it("drifts one way across the shot when it is asked to", () => {
    const offsets = handheldOffsets({ durationFrames: 240, sway: 0, bob: 0, roll: 0, drift: 6 });
    expect(offsets[0].x).toBeCloseTo(0, 4);
    expect(offsets[239].x).toBeCloseTo(6, 4);
  });

  it("busier means more stops, calmer means fewer", () => {
    const quick = handheldAnimation({ durationFrames: 240, speed: 4, smooth: 0.2 });
    const slow = handheldAnimation({ durationFrames: 240, speed: 0.5, smooth: 0.2 });
    expect(countKeys(quick)).toBeGreaterThan(countKeys(slow));
  });

  it("holds the zoom above what the float needs, so no edge shows", () => {
    const animation = handheldAnimation({ durationFrames: 120, sway: 2, bob: 1.5, roll: 1.5 })!;
    const needed = coverZoomFor({ sway: 2, bob: 1.5, roll: 1.5 });
    expect(needed).toBeGreaterThan(1.05);
    for (let frame = 0; frame < 120; frame += 5) {
      const pose = poseAt(animation, frame);
      expect(pose.zoom, `frame ${frame}`).toBeGreaterThanOrEqual(needed - 0.001);
      const held = clampPoseToPictureEdges(pose);
      expect(Math.abs(held.x - pose.x), `frame ${frame} x`).toBeLessThan(0.02);
      expect(Math.abs(held.y - pose.y), `frame ${frame} y`).toBeLessThan(0.02);
    }
  });

  it("goes over a move the shot already has instead of replacing it", () => {
    const push = (frame: number): DrivePose => ({ zoom: 1 + frame * 0.002, x: 0, y: 0, rotation: 0 });
    const animation = handheldAnimation({ durationFrames: 120, sway: 1, bob: 1, roll: 0.4, basePoseAt: push })!;
    // the push is still a push: it ends further in than it started
    expect(poseAt(animation, 119).zoom).toBeGreaterThan(poseAt(animation, 0).zoom + 0.15);
    // and the float is on top of it
    const xs = Array.from({ length: 120 }, (_, frame) => poseAt(animation, frame).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
  });

  it("writes a handful of keys, not a key per frame", () => {
    const animation = handheldAnimation({ durationFrames: 480, sway: 1, bob: 1, roll: 0.5 })!;
    expect(countKeys(animation)).toBeLessThan(200);
    expect(countKeys(animation)).toBeGreaterThan(8);
  });
});

describe("the hand on the picture", () => {
  it("the picture follows the pointer, the same distance whatever the window", () => {
    const small = offsetFromDrag({ dx: 80, dy: -40, width: 800, height: 450 });
    const big = offsetFromDrag({ dx: 160, dy: -80, width: 1600, height: 900 });
    expect(small.x).toBeCloseTo(10, 6);
    expect(small.y).toBeCloseTo(-8.888, 2);
    expect(big).toEqual(small);
  });

  it("Alt rolls the camera instead of moving it", () => {
    const roll = offsetFromDrag({ dx: 400, dy: 100, width: 800, height: 450, roll: true });
    expect(roll.rotation).toBeCloseTo(10, 6);
    expect(roll.x).toBe(0);
    expect(roll.y).toBe(0);
  });

  it("the wheel pushes in and pulls out, and stands still at rest", () => {
    expect(zoomFromWheel(0)).toBe(1);
    expect(zoomFromWheel(-100)).toBeGreaterThan(1);
    expect(zoomFromWheel(100)).toBeLessThan(1);
    expect(zoomFromWheel(-100) * zoomFromWheel(100)).toBeCloseTo(1, 6);
  });

  it("one drag over another adds up, and the zooms multiply", () => {
    const sum = addOffsets({ x: 2, y: -1, rotation: 0.5, zoom: 1.2 }, { x: 1, y: 1, rotation: -0.2, zoom: 1.5 });
    expect(sum).toEqual({ x: 3, y: 0, rotation: 0.3, zoom: 1.7999999999999998 });
  });
});

describe("a take across the cuts", () => {
  const take = (): DriveRecording => new Map();

  it("keeps each shot's frames apart", () => {
    const recording = take();
    addSample(recording, "b1", { frame: 0, pose: NEUTRAL_POSE });
    addSample(recording, "b1", { frame: 1, pose: { ...NEUTRAL_POSE, x: 2 } });
    addSample(recording, "b2", { frame: 0, pose: NEUTRAL_POSE });
    expect([...recording.keys()]).toEqual(["b1", "b2"]);
    expect(recording.get("b1")).toHaveLength(2);
  });

  it("a frame driven twice keeps the last pass", () => {
    const recording = take();
    addSample(recording, "b1", { frame: 4, pose: { ...NEUTRAL_POSE, x: 1 } });
    addSample(recording, "b1", { frame: 4, pose: { ...NEUTRAL_POSE, x: 9 } });
    expect(recording.get("b1")).toHaveLength(1);
    expect(recording.get("b1")![0].pose.x).toBe(9);
  });

  it("writes the shots the hand moved and leaves the ones it only passed through", () => {
    const recording = take();
    for (let frame = 0; frame < 60; frame += 1) {
      addSample(recording, "moved", { frame, pose: sampleDrive(NEUTRAL_POSE, { ...NO_OFFSET, x: frame / 10 }) });
      addSample(recording, "still", { frame, pose: NEUTRAL_POSE });
    }
    addSample(recording, "one-frame", { frame: 0, pose: NEUTRAL_POSE });
    const shots = new Map([["moved", {}], ["still", {}], ["one-frame", {}]]);
    const committed = commitRecording(recording, shots, 0.5);
    expect(committed.map((shot) => shot.frameId)).toEqual(["moved"]);
    expect(committed[0].frames).toBe(60);
    expect(committed[0].keys).toBeGreaterThan(1);
    expect(committed[0].animation.x).toBeDefined();
  });

  it("keeps each shot's own other channels", () => {
    const recording = take();
    for (let frame = 0; frame < 30; frame += 1) {
      addSample(recording, "b1", { frame, pose: sampleDrive(NEUTRAL_POSE, { ...NO_OFFSET, y: frame / 5 }) });
    }
    const base = { opacity: [{ frame: 0, value: 0.5, easing: "linear" as const }] };
    const committed = commitRecording(recording, new Map([["b1", { base }]]), 0.5);
    expect(committed[0].animation.opacity).toEqual(base.opacity);
  });
});
