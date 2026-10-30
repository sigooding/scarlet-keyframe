import { describe, expect, it } from "vitest";
import { buildKeyframes, createProjectState, type StoryLike } from "./model";
import { imageFrameIds, isImageGradePath, setImageGradeForFrames } from "./imageGrading";
import { buildTimelineClips } from "../sequence/animate";

function fixture() {
  const story: StoryLike = { id: "grade-test", title: "Grade", startSceneId: "s", scenes: [{
    id: "s", title: "S", background: "/room.jpg", cinematic: { colorGrade: "tokyo-noir", mode: "dolly", zoomDuration: 8 }, dialogueBeats: [
      { id: "a", text: "First", audioUrl: "/voice.mp3", background: "/a.jpg", cinematic: { colorGrade: "tokyo-noir", depthMap: "/a-depth.png", mode: "zoom" } },
      { id: "b", text: "Second" },
      { id: "gap", text: "Black", gap: true },
      { id: "vid", text: "Video", background: "video:/logo.mp4" },
      { id: "gradient", text: "Gradient", background: "gradient:#000" },
      { id: "c", text: "Third", background: "/c.jpg", cinematic: { mode: "dolly", filmGrade: true } },
    ],
  }] };
  return createProjectState({ story, assets: [], missing: [], sourceName: "grade.json" }, []);
}

describe("select all images and batch grading", () => {
  it("selects still image beats, including carried pictures, and excludes gaps and videos", () => {
    const p = fixture();
    expect(imageFrameIds(buildKeyframes(p.story), p.assets)).toEqual(["a", "b", "c"]);
    expect(isImageGradePath("cinematic.colorGrade")).toBe(true);
    expect(isImageGradePath("cinematic.mode")).toBe(false);
  });
  it("sets a selected grade in one edit, retaining timing, audio, camera and unrelated shots", () => {
    const p = fixture();
    const before = buildTimelineClips(buildKeyframes(p.story)).clips;
    const result = setImageGradeForFrames(p, ["a", "b", "c", "gap", "vid"], "cinematic.colorGrade", "noir-1950s");
    const after = buildTimelineClips(buildKeyframes(result.story)).clips;
    expect(after.map(c => [c.keyframe.id, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.picture]))
      .toEqual(before.map(c => [c.keyframe.id, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.picture]));
    for (const id of ["a", "b", "c"]) expect(after.find(c => c.keyframe.id === id)!.keyframe.cinematic?.colorGrade).toBe("noir-1950s");
    expect(after.find(c => c.keyframe.id === "a")!.keyframe.cinematic).toMatchObject({ mode: "zoom", depthMap: "/a-depth.png" });
    expect(after.find(c => c.keyframe.id === "c")!.keyframe.cinematic).toMatchObject({ mode: "dolly", filmGrade: true });
    expect(after.find(c => c.keyframe.id === "vid")!.keyframe.beat.cinematic).toEqual(before.find(c => c.keyframe.id === "vid")!.keyframe.beat.cinematic);
    expect(p.story).toEqual(p.originalStory);
    expect(setImageGradeForFrames(p, ["a"], "cinematic.mode", "static")).toBe(p);
  });
  it("resets each selected field to its original beat value and leaves others alone", () => {
    const p = fixture();
    const graded = setImageGradeForFrames(p, ["a", "c"], "cinematic.colorGrade", "neon-noir");
    const reset = setImageGradeForFrames(graded, ["a", "c"], "cinematic.colorGrade", undefined, true);
    const frames = buildKeyframes(reset.story);
    expect(frames.find(f => f.id === "a")!.beat.cinematic?.colorGrade).toBe("tokyo-noir");
    expect(frames.find(f => f.id === "c")!.beat.cinematic?.colorGrade).toBeUndefined();
    expect(frames.find(f => f.id === "c")!.beat.cinematic?.filmGrade).toBe(true);
  });
});
