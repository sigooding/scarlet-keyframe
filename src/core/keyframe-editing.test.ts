import { describe, expect, it } from "vitest";
import { buildTimelineClips } from "../sequence/animate";
import {
  effectiveCaptionsForBeat,
  splitCaptionsAcrossCut,
  type BeatCaption,
} from "./captions";
import {
  reorderKeyframeWithResult,
  setBeatCaptions,
  setPicture,
  splitKeyframeAt,
  trimKeyframe,
} from "./edits";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "./model";

function makeFixture(): ProjectState {
  const rawStory = {
    id: "cc-fixture",
    title: "CC Fixture",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        sceneNumber: 1,
        title: "Scene One",
        autoAdvanceTargetSceneId: "sc2",
        background: "/film/img/sc1.png",
        dialogueBeats: [
          {
            id: "b1",
            speaker: "A",
            text: "Alpha line spoken over the first picture.",
            durationFrames: 96,
            background: "/film/img/a.jpg",
          },
          {
            id: "b2",
            speaker: "B",
            text: "Beta derived caption line.",
            durationFrames: 60,
            background: "/film/img/b.jpg",
          },
          {
            id: "b3",
            speaker: "C",
            text: "Gamma third shot here.",
            durationFrames: 48,
            background: "/film/img/c.jpg",
          },
        ],
      },
      {
        id: "sc2",
        sceneNumber: 2,
        title: "Scene Two",
        background: "/film/img/sc2.png",
        dialogueBeats: [
          {
            id: "b4",
            speaker: "D",
            text: "Delta across scenes.",
            durationFrames: 48,
            background: "/film/img/d.jpg",
          },
        ],
      },
    ],
  };
  const imported = parseImportPayload(rawStory, "cc-fixture.json");
  const base = createProjectState(imported, []);
  // Author two CC cues on b1 (b2/b3/b4 stay derived from beat text)
  return setBeatCaptions(
    base,
    "b1",
    [
      { text: "Alpha line spoken over", inFrame: 0, outFrame: 40 },
      { text: "the first picture entirely.", inFrame: 40, outFrame: 96 },
    ],
    96,
  );
}

function clipList(project: ProjectState) {
  return buildTimelineClips(buildKeyframes(project.story)).clips;
}

describe("Keyframe editing — CC-aware split, move/replace preservation, and gap-resizing", () => {
  describe("splitCaptionsAcrossCut (caption partition for frame splits)", () => {
    it("keeps cues before the cut left, rebases cues after it, and divides spanning cues", () => {
      const caps: BeatCaption[] = [
        { text: "One.", inFrame: 0, outFrame: 30 },
        { text: "Two words here now.", inFrame: 30, outFrame: 90 },
        { text: "Three.", inFrame: 90, outFrame: 120 },
      ];
      const { left, right } = splitCaptionsAcrossCut(caps, 60);

      expect(left.map((c) => [c.inFrame, c.outFrame])).toEqual([
        [0, 30],
        [30, 60],
      ]);
      // right = [tail of the spanning cue rebased to 0, cue 3 rebased]
      expect(right.map((c) => [c.inFrame, c.outFrame])).toEqual([
        [0, 30],
        [30, 60],
      ]);
      // Full cue stays intact on the left; the spanning cue's words are conserved across halves
      expect(left[0].text).toBe("One.");
      expect(`${left[1].text} ${right[0].text}`).toBe("Two words here now.");
      expect(right[0].text).not.toBe(left[1].text);
      expect(right[1].text).toBe("Three.");
    });

    it("falls back to full text on both halves when a cue cannot be divided", () => {
      const { left, right } = splitCaptionsAcrossCut([{ text: "Hi", inFrame: 0, outFrame: 40 }], 20);
      expect(left[0].text).toBe("Hi");
      expect(right[0].text).toBe("Hi");
      expect(left[0].outFrame).toBe(20);
      expect(right[0].outFrame).toBe(20);
    });
  });

  describe("splitKeyframeAt — splits the closed captions with the picture", () => {
    it("partitions authored CC at the cut instead of duplicating the cue list on both halves", () => {
      const project = makeFixture();
      const result = splitKeyframeAt(project, "b1", 48);
      expect(result).toBeDefined();

      const clips = clipList(result!.project);
      expect(clips).toHaveLength(5); // b1-left, b1-right, b2, b3, b4
      const left = clips[0];
      const right = clips[1];
      expect(left.durationFrames).toBe(48);
      expect(right.durationFrames).toBe(48);
      expect(right.keyframe.text).toBe("");

      const leftCaps = effectiveCaptionsForBeat(left.keyframe.beat, left.durationFrames);
      const rightCaps = effectiveCaptionsForBeat(right.keyframe.beat, right.durationFrames);

      // Left: cue 1 fully + the head of the spanning cue 2 (40..48)
      expect(leftCaps.map((c) => [c.inFrame, c.outFrame])).toEqual([
        [0, 40],
        [40, 48],
      ]);
      expect(leftCaps[0].text).toBe("Alpha line spoken over");
      // Right: only the tail of cue 2 rebased to zero — cue 1 must NOT reappear (old duplicate bug)
      expect(rightCaps.map((c) => [c.inFrame, c.outFrame])).toEqual([[0, 48]]);
      expect(rightCaps[0].text).not.toBe("Alpha line spoken over");
      expect(`${leftCaps[1].text} ${rightCaps[0].text}`).toBe("the first picture entirely.");
      // Full coverage across the cut, no overlap between halves
      expect(leftCaps[leftCaps.length - 1].outFrame).toBe(48);
      expect(rightCaps[rightCaps.length - 1].outFrame).toBe(48);
    });

    it("authors CC portions on both halves when captions derive from beat text", () => {
      const project = makeFixture();
      const result = splitKeyframeAt(project, "b2", 30);
      expect(result).toBeDefined();

      const clips = clipList(result!.project);
      const left = clips.find((c) => c.keyframe.id === "b2")!;
      const right = clips[clips.indexOf(left) + 1];
      expect(right.keyframe.text).toBe("");
      expect(right.keyframe.id).not.toBe("b2");

      const leftCaps = effectiveCaptionsForBeat(left.keyframe.beat, left.durationFrames);
      const rightCaps = effectiveCaptionsForBeat(right.keyframe.beat, right.durationFrames);
      expect(leftCaps).toHaveLength(1);
      expect(rightCaps).toHaveLength(1);
      expect(`${leftCaps[0].text} ${rightCaps[0].text}`).toBe("Beta derived caption line.");
      expect(leftCaps[0].outFrame).toBe(30);
      expect(rightCaps[0].outFrame).toBe(30);
      // Without the split-authored captions the right half would show no CC at all
      expect(Array.isArray(right.keyframe.beat.captions)).toBe(true);
    });

    it("preserves an explicitly empty caption list on both halves", () => {
      let project = makeFixture();
      project = setBeatCaptions(project, "b3", [], 48);
      const result = splitKeyframeAt(project, "b3", 20);
      expect(result).toBeDefined();
      const clips = clipList(result!.project);
      const left = clips.find((c) => c.keyframe.id === "b3")!;
      const right = clips[clips.indexOf(left) + 1];
      expect(left.keyframe.beat.captions).toEqual([]);
      expect(right.keyframe.beat.captions).toEqual([]);
      // Still treated as authored-empty: no CC derived back from text
      expect(effectiveCaptionsForBeat(left.keyframe.beat, left.durationFrames)).toEqual([]);
      expect(effectiveCaptionsForBeat(right.keyframe.beat, right.durationFrames)).toEqual([]);
    });
  });

  describe("trimKeyframe with leaveGap — resize without shifting later keyframes", () => {
    it("leaves a gap after the trimmed clip so every later keyframe keeps its position", () => {
      const base = makeFixture();
      const before = clipList(base).map((c) => ({ id: c.keyframe.id, start: c.startFrame }));
      expect(before.map((b) => b.start)).toEqual([0, 96, 156, 204]);

      const shrunk = trimKeyframe(base, "b1", 60, { leaveGap: true });
      const clips = clipList(shrunk);
      expect(clips[0].durationFrames).toBe(60);
      expect(clips[1].keyframe.beat.gap).toBe(true);
      expect(clips[1].durationFrames).toBe(36); // 96 - 60 opened a gap
      // Downstream keyframes did NOT move
      expect(clips.slice(2).map((c) => c.startFrame)).toEqual([96, 156, 204]);
      // Shrinking clamps authored CC to the new length
      const caps = effectiveCaptionsForBeat(clips[0].keyframe.beat, 60);
      expect(caps[caps.length - 1].outFrame).toBe(60);
    });

    it("extends an existing gap on repeated shrinks (preview drag accumulation)", () => {
      const base = makeFixture();
      const step1 = trimKeyframe(base, "b1", 72, { leaveGap: true });
      const step2 = trimKeyframe(step1, "b1", 60, { leaveGap: true });
      const clips = clipList(step2);
      expect(clips[0].durationFrames).toBe(60);
      expect(clips[1].keyframe.beat.gap).toBe(true);
      expect(clips[1].durationFrames).toBe(36);
      expect(clips[2].startFrame).toBe(96);
    });

    it("consumes the gap when the clip grows back, restoring exact original positions", () => {
      const base = makeFixture();
      const shrunk = trimKeyframe(base, "b1", 60, { leaveGap: true });
      const partial = trimKeyframe(shrunk, "b1", 80, { leaveGap: true });
      const partialClips = clipList(partial);
      expect(partialClips[0].durationFrames).toBe(80);
      expect(partialClips[1].keyframe.beat.gap).toBe(true);
      expect(partialClips[1].durationFrames).toBe(16);
      expect(partialClips[2].startFrame).toBe(96); // b2 still pinned

      const restored = trimKeyframe(partial, "b1", 96, { leaveGap: true });
      const restoredClips = clipList(restored);
      expect(restoredClips[0].durationFrames).toBe(96);
      expect(restoredClips.some((c) => c.keyframe.beat.gap)).toBe(false);
      expect(restoredClips.map((c) => c.startFrame)).toEqual([0, 96, 156, 204]);
    });

    it("only ripples downstream once a growing clip exhausts the gap", () => {
      const base = makeFixture();
      const shrunk = trimKeyframe(base, "b1", 60, { leaveGap: true }); // gap 36
      const over = trimKeyframe(shrunk, "b1", 110, { leaveGap: true }); // grows 50 > 36
      const clips = clipList(over);
      expect(clips[0].durationFrames).toBe(110);
      expect(clips.some((c) => c.keyframe.beat.gap)).toBe(false);
      // overflow = 50 - 36 = 14 frames ripple past the original b2 position (96 → 110)
      expect(clips[1].startFrame).toBe(110);
    });

    it("holds later scenes in place when trimming the last clip of a scene", () => {
      const base = makeFixture();
      const before = clipList(base);
      expect(before[2].startFrame).toBe(156); // b3
      expect(before[3].startFrame).toBe(204); // b4 (scene 2)

      const shrunk = trimKeyframe(base, "b3", 24, { leaveGap: true }); // 48 → 24
      const clips = clipList(shrunk);
      const b3 = clips.find((c) => c.keyframe.id === "b3")!;
      expect(b3.durationFrames).toBe(24);
      const gap = clips[clips.indexOf(b3) + 1];
      expect(gap.keyframe.beat.gap).toBe(true);
      expect(gap.durationFrames).toBe(24);
      const b4 = clips.find((c) => c.keyframe.id === "b4")!;
      expect(b4.startFrame).toBe(204); // scene 2 untouched
    });

    it("keeps the classic ripple behaviour when leaveGap is off", () => {
      const base = makeFixture();
      const after = trimKeyframe(base, "b1", 60);
      const clips = clipList(after);
      expect(clips[0].durationFrames).toBe(60);
      expect(clips.some((c) => c.keyframe.beat.gap)).toBe(false);
      expect(clips.map((c) => c.startFrame)).toEqual([0, 60, 120, 168]);
    });
  });

  describe("moving & replacing keyframes keeps their CC", () => {
    it("reorder (move earlier/later) carries the beat's captions along unchanged", () => {
      const base = makeFixture();
      const originalCaps = effectiveCaptionsForBeat(
        buildKeyframes(base.story).find((f) => f.id === "b1")!.beat,
        96,
      );
      expect(originalCaps).toHaveLength(2);

      const moved = reorderKeyframeWithResult(base, "b1", 1); // move later
      expect(moved.resultIds).toEqual(["b1"]);
      const frames = buildKeyframes(moved.project.story);
      const b1 = frames.find((f) => f.id === "b1")!;
      expect(b1.beatIndex).toBe(1); // now after b2
      const movedCaps = effectiveCaptionsForBeat(b1.beat, 96);
      expect(movedCaps).toEqual(originalCaps);
      expect(movedCaps[0].text).toBe("Alpha line spoken over");
    });

    it("replacing the picture (setPicture) leaves the CC untouched", () => {
      const base = makeFixture();
      const beforeCaps = effectiveCaptionsForBeat(
        buildKeyframes(base.story).find((f) => f.id === "b1")!.beat,
        96,
      );
      const replaced = setPicture(base, "b1", "/film/img/replacement.jpg");
      const b1 = buildKeyframes(replaced.story).find((f) => f.id === "b1")!;
      expect(b1.beat.background).toBe("/film/img/replacement.jpg");
      expect(effectiveCaptionsForBeat(b1.beat, 96)).toEqual(beforeCaps);
    });
  });
});
