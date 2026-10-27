import { describe, expect, it } from "vitest";
import { clipFrames, FPS, keyframeDuration, timecode, voiceFrames } from "./timing";
import type { Keyframe } from "./model";

function makeFrame(beat: Record<string, unknown>): Keyframe {
  return {
    id: "clip",
    sceneId: "scene",
    sceneIndex: 0,
    beatIndex: 0,
    mark: "1",
    number: 1,
    beat,
    scene: { id: "scene" },
    pictureSource: "none",
    carried: false,
    speaker: "NARRATOR",
    text: String(beat.text || ""),
  } as Keyframe;
}

describe("clipFrames", () => {
  it("uses durationFrames when the beat sets it", () => {
    expect(clipFrames(makeFrame({ durationFrames: 40, holdSeconds: 5 }))).toBe(40);
    expect(clipFrames(makeFrame({ durationFrames: 6 }))).toBe(6);
  });

  it("falls back to keyframeDuration converted to frames", () => {
    const beat = { holdSeconds: 2.5 };
    const frame = makeFrame(beat);
    expect(clipFrames(frame)).toBe(Math.round(keyframeDuration(frame) * FPS));
    expect(clipFrames(frame)).toBe(60);
  });

  it("never goes below six frames", () => {
    expect(clipFrames(makeFrame({ durationFrames: 2 }))).toBe(6);
    expect(clipFrames(makeFrame({ holdSeconds: 0.05 }))).toBe(6);
    expect(voiceFrames(makeFrame({ holdSeconds: 2 }))).toBe(48);
  });
});

describe("timecode", () => {
  it("reads as MM:SS:FF at 24 fps", () => {
    expect(timecode(0)).toBe("00:00:00");
    expect(timecode(1)).toBe("00:00:01");
    expect(timecode(24)).toBe("00:01:00");
    expect(timecode(1500)).toBe("01:02:12");
    expect(timecode(24 * 60 * 5)).toBe("05:00:00");
    expect(timecode(-10)).toBe("00:00:00");
  });
});
