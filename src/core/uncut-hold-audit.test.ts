import { describe, expect, it } from "vitest";
import { auditPictureHolds, type HoldAuditClip } from "./uncutHoldAudit";

const clip = (id: string, scene: string, picture: string | undefined, durationFrames: number, isImage = true): HoldAuditClip => ({
  id, scene, picture, durationFrames, isImage, text: id,
});

describe("Original Uncut hold audit", () => {
  it("detects one continuous still across scene boundaries and preserves the following frame", () => {
    const clips = [
      clip("one", "scene-a", "/same.jpg", 144),
      clip("two", "scene-b", "/same.jpg", 108),
      clip("three", "scene-b", "/next.jpg", 48),
    ];
    expect(auditPictureHolds(clips, 24, false)).toEqual([]);
    const holds = auditPictureHolds(clips, 24, true);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({
      scene: "scene-a", scenes: ["scene-a", "scene-b"], picture: "/same.jpg", durationFrames: 252, seconds: 10.5,
      nextScene: "scene-b", nextPicture: "/next.jpg", nextBeat: { id: "three", scene: "scene-b" },
    });
    expect(holds[0].beats.map(beat => beat.id)).toEqual(["one", "two"]);
  });

  it("excludes non-images and exact seven-second runs while gaps interrupt a picture hold", () => {
    const clips = [
      clip("exact", "s", "/exact.jpg", 168),
      clip("gradient", "s", "gradient:linear-gradient(#000,#000)", 240, false),
      clip("video", "s", "video:/film.mp4", 240, false),
      clip("first", "s", "/return.jpg", 96),
      clip("gap", "s", undefined, 240, false),
      clip("second", "s", "/return.jpg", 96),
      clip("long", "s", "/long.jpg", 169),
    ];
    const holds = auditPictureHolds(clips, 24, true);
    expect(holds.map(hold => hold.beats[0].id)).toEqual(["long"]);
    expect(holds[0].seconds).toBe(169 / 24);
    expect(holds[0].nextBeat).toBeUndefined();
  });
});
