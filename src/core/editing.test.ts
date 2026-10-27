import { describe, expect, it } from "vitest";
import { buildKeyframes, createProjectState, type ProjectState, type StoryLike } from "./model";
import { deleteClips, moveClips, pasteClips, rollEdit } from "./edits";
import { buildSequence, markerPosition } from "../sequence/sequence";
import { snapFrame, snapTargets, snapThresholdFrames } from "../sequence/snap";

function makeProject(): ProjectState {
  const story = {
    id: "film",
    title: "Film",
    startSceneId: "s1",
    scenes: [
      {
        id: "s1",
        animaticMark: "77",
        background: "/img/a.jpg",
        // The straight-through running order continues into scene 77A.
        autoAdvanceTargetSceneId: "s2",
        dialogueBeats: [
          {
            id: "a1",
            text: "First shot",
            durationFrames: 48,
            background: "/img/a1.jpg",
            audioUrl: "/voice/a1.mp3",
            sfxUrl: "/sfx/a1.mp3",
            sfxVolume: 0.4,
            cinematic: { mode: "pan", zoom: 1.2 },
            animation: { zoom: [{ frame: 0, value: 1, easing: "linear" }, { frame: 24, value: 1.4, easing: "ease-in-out" }] },
            backgroundTransition: "crossfade",
            transitionFrames: 12,
            expression: "v.o.",
          },
          { id: "a2", text: "Second shot", durationFrames: 36, background: "/img/a2.jpg", audioUrl: "/voice/a2.mp3" },
        ],
      },
      {
        id: "s2",
        animaticMark: "77A",
        background: "/img/b.jpg",
        dialogueBeats: [
          { id: "b1", text: "Elsewhere", durationFrames: 24, background: "/img/b1.jpg", audioUrl: "/voice/b1.mp3" },
          { id: "b2", text: "Later", durationFrames: 30, background: "/img/b2.jpg" },
        ],
      },
    ],
  } as StoryLike;
  return createProjectState({ story, assets: [], missing: [], sourceName: "t.json" });
}

const sequenceOf = (project: ProjectState) => buildSequence(buildKeyframes(project.story));
const beatOf = (project: ProjectState, id: string) => buildKeyframes(project.story).find((frame) => frame.id === id)?.beat;

describe("moving a clip", () => {
  it("moves a clip into another scene and keeps every field of the beat", () => {
    const project = makeProject();
    const before = beatOf(project, "a1")!;
    const result = moveClips(project, ["a1"], { frameId: "b1", position: "after" })!;
    expect(result).toBeDefined();

    const frames = buildKeyframes(result.project.story);
    const moved = frames.find((frame) => frame.id === "a1")!;
    // It is now in scene 77A, right after b1, and the order is a fresh sequence.
    expect(moved.sceneId).toBe("s2");
    expect(moved.mark).toBe("77A");
    expect(buildSequence(frames).clips.map((clip) => clip.frame.id)).toEqual(["a2", "b1", "a1", "b2"]);

    // Voice, sound effect, caption, look, animation keyframes and transition all travel with the beat.
    expect(moved.beat).toEqual(before);
    expect(moved.beat.audioUrl).toBe("/voice/a1.mp3");
    expect(moved.beat.sfxUrl).toBe("/sfx/a1.mp3");
    expect(moved.beat.sfxVolume).toBe(0.4);
    expect(moved.beat.cinematic).toEqual({ mode: "pan", zoom: 1.2 });
    expect(moved.beat.animation?.zoom).toHaveLength(2);
    expect(moved.beat.backgroundTransition).toBe("crossfade");
    expect(moved.text).toBe("First shot");
    expect(moved.picture).toBe("/img/a1.jpg");
  });

  it("moves several clips at once and keeps their order", () => {
    const project = makeProject();
    const result = moveClips(project, ["a2", "a1"], { frameId: "b2", position: "before" })!;
    const ids = buildSequence(buildKeyframes(result.project.story)).clips.map((clip) => clip.frame.id);
    expect(ids).toEqual(["b1", "a1", "a2", "b2"]);
  });

  it("copies instead of moving when asked, with fresh ids", () => {
    const project = makeProject();
    const result = moveClips(project, ["a2"], { frameId: "b2", position: "after" }, { copy: true })!;
    const ids = buildSequence(buildKeyframes(result.project.story)).clips.map((clip) => clip.frame.id);
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe("a1");
    expect(ids[1]).toBe("a2");
    expect(result.ids[0]).not.toBe("a2");
    const copy = buildKeyframes(result.project.story).find((frame) => frame.id === result.ids[0])!;
    // The copy keeps the beat's content but gets its own identity.
    expect(copy.text).toBe("Second shot");
    expect(copy.beat.audioUrl).toBe("/voice/a2.mp3");
  });

  it("refuses to drop a clip onto itself", () => {
    const project = makeProject();
    expect(moveClips(project, ["a1"], { frameId: "a1", position: "after" })).toBeUndefined();
  });
});

describe("deleting several clips", () => {
  it("removes them all and closes the gap", () => {
    const project = makeProject();
    const next = deleteClips(project, ["a2", "b1"]);
    const clips = sequenceOf(next).clips;
    expect(clips.map((clip) => clip.frame.id)).toEqual(["a1", "b2"]);
    expect(clips[1].start).toBe(48);
    expect(sequenceOf(next).totalFrames).toBe(48 + 30);
  });
});

describe("roll edit", () => {
  it("keeps the total length", () => {
    const project = makeProject();
    const before = sequenceOf(project);
    const result = rollEdit(project, "a1", 10)!;
    const after = sequenceOf(result.project);
    expect(result.delta).toBe(10);
    expect(after.totalFrames).toBe(before.totalFrames);
    // The cut moves ten frames later: the first clip grows, the second shrinks.
    expect(after.clips[0].duration).toBe(58);
    expect(after.clips[1].duration).toBe(26);
    expect(after.clips[2].start).toBe(before.clips[2].start);
  });

  it("rolls the other way too, and stops at the six-frame minimum", () => {
    const project = makeProject();
    expect(sequenceOf(rollEdit(project, "a1", -10)!.project).clips.map((clip) => clip.duration)).toEqual([38, 46, 24, 30]);
    // The second clip cannot go below six frames.
    const clamped = rollEdit(project, "a1", 500)!;
    expect(clamped.delta).toBe(36 - 6);
    expect(sequenceOf(clamped.project).clips[1].duration).toBe(6);
  });

  it("does nothing at the end of the sequence", () => {
    expect(rollEdit(makeProject(), "b2", 5)).toBeUndefined();
  });
});

describe("pasting", () => {
  it("splits the clip under the playhead first, then inserts the copies", () => {
    const project = makeProject();
    const copies = [beatOf(project, "b1")!, beatOf(project, "b2")!];
    // (The second copy is "Later" with its voice take b2.mp3.)
    // Frame 100 is 52 frames into the first clip? No: clip a1 is 0–48, a2 is 48–84, b1 84–108. 100 is
    // inside b1 (16 frames in), so b1 is split first.
    const result = pasteClips(project, copies, 100)!;
    expect(result).toBeDefined();
    const clips = buildSequence(buildKeyframes(result.project.story)).clips;
    // b1 is split at the playhead first; the copies go in at the playhead, so b1's second half follows them.
    expect(clips.slice(0, 3).map((clip) => clip.frame.id)).toEqual(["a1", "a2", "b1"]);
    expect(clips.slice(3, 5).map((clip) => clip.frame.id)).toEqual(result.ids);
    expect(clips[5].frame.text).toBe("");
    expect(clips[6].frame.id).toBe("b2");
    // b1 now ends at the playhead, and the pasted copies start there.
    expect(clips[2].duration).toBe(16);
    expect(clips[2].end).toBe(100);
    expect(clips[5].duration).toBe(24 - 16);
    expect(result.start).toBe(100);
    expect(clips[3].start).toBe(100);
    expect(clips[4].start).toBe(100 + 24);
    expect(sequenceOf(result.project).totalFrames).toBe(sequenceOf(project).totalFrames + 54);
    // The copies keep the beat content, voice takes included.
    const first = buildKeyframes(result.project.story).find((frame) => frame.id === result.ids[0])!;
    const second = buildKeyframes(result.project.story).find((frame) => frame.id === result.ids[1])!;
    expect(first.text).toBe("Elsewhere");
    expect(first.beat.audioUrl).toBe("/voice/b1.mp3");
    expect(second.text).toBe("Later");
    expect(second.beat.background).toBe("/img/b2.jpg");
  });

  it("inserts before the clip when the playhead is on its first frame", () => {
    const project = makeProject();
    const result = pasteClips(project, [beatOf(project, "b1")!], 84)!;
    const ids = buildSequence(buildKeyframes(result.project.story)).clips.map((clip) => clip.frame.id);
    expect(ids).toEqual(["a1", "a2", result.ids[0], "b1", "b2"]);
    expect(result.start).toBe(84);
  });
});

describe("snapping", () => {
  const targets = snapTargets({
    clips: [
      { id: "a", start: 0, end: 48 },
      { id: "b", start: 48, end: 84 },
    ],
    excludeIds: ["b"],
    playhead: 60,
    keyframes: [{ frame: 52, property: "zoom" }],
    markers: [{ frame: 30, label: "note" }],
  });

  it("picks the nearest edge within the distance", () => {
    expect(snapFrame(46, targets, 4)).toMatchObject({ frame: 48, snapped: true, target: { kind: "edge" } });
    expect(snapFrame(63, targets, 4)).toMatchObject({ frame: 60, snapped: true, target: { kind: "playhead" } });
    expect(snapFrame(31, targets, 4).frame).toBe(30);
    expect(snapFrame(51, targets, 4).target?.kind).toBe("keyframe");
    // Nothing close enough: the frame is untouched.
    expect(snapFrame(20, targets, 4)).toMatchObject({ frame: 20, snapped: false });
    // Beyond the distance: no snap.
    expect(snapFrame(56, targets, 2).snapped).toBe(false);
  });

  it("leaves out the clips being dragged", () => {
    // Clip b's own start (48) is excluded, so a frame near it only snaps to a's end at the same place…
    const onlyOwn = snapTargets({ clips: [{ id: "b", start: 48, end: 84 }], excludeIds: ["b"] });
    expect(onlyOwn).toHaveLength(0);
  });

  it("keeps the pull at 8 pixels however far the timeline is zoomed", () => {
    expect(snapThresholdFrames(1)).toBe(8);
    expect(snapThresholdFrames(4)).toBe(2);
    expect(snapThresholdFrames(0)).toBe(0);
    // At 4 px per frame the pull is 2 frames: 2 away snaps, 4 away does not.
    const threshold = snapThresholdFrames(4);
    expect(snapFrame(50, targets, threshold).frame).toBe(48);
    expect(snapFrame(51, targets, threshold).frame).toBe(52);
    expect(snapFrame(56, targets, threshold).snapped).toBe(false);
  });
});

describe("note markers", () => {
  it("stay with their clip as the sequence ripples", () => {
    const project = makeProject();
    const clips = sequenceOf(project).clips;
    const marker = { id: "m1", name: "Check the lamp", frame: 12, clipId: "a1", offset: 12 };
    expect(markerPosition(marker, clips)).toBe(12);
    // Trim the clip before it; the marker moves with a1's new start.
    const moved = moveClips(project, ["a1"], { frameId: "b2", position: "after" })!;
    const after = sequenceOf(moved.project).clips;
    expect(markerPosition(marker, after)).toBe(after.find((clip) => clip.frame.id === "a1")!.start + 12);
  });
});
