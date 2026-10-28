import { describe, expect, it } from "vitest";
import { EMPTY_MULTI_SELECTION } from "./audioClips";
import {
  activeTimelineCaptionAtFrame,
  makeRangeCaptionsSrt,
  resolveTimelineCaptions,
} from "./captions";
import {
  copyEffectBlock,
  moveTimelineCaption,
  pasteEffectBlock,
  shiftMultiLaneSelection,
} from "./edits";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { encodeWav16BitStereo } from "./offlineAudioMix";
import { buildTimelineClips } from "../sequence/animate";

function makeSampleProject() {
  const story = {
    title: "Turn 14 Test Film",
    startSceneId: "sc_1",
    scenes: [
      {
        id: "sc_1",
        sceneNumber: "1",
        title: "Alley",
        background: "/film/img/01-alley.jpg",
        cinematic: {
          grade: "noir",
          vignette: true,
          filmGrain: 0.25,
          depthMap: "/film/img/01-alley.depth.png",
          depthAmount: 0.6,
        },
        dialogueBeats: [
          {
            id: "b1",
            characterId: "mara",
            speaker: "MARA",
            text: "Wait in the car.",
            durationFrames: 36,
            particles: "rain",
            animation: {
              zoom: [
                { frame: 0, value: 1, easing: "ease-in-out" },
                { frame: 35, value: 1.24, easing: "ease-in-out" },
              ],
            },
          },
          {
            id: "b2",
            characterId: "cole",
            speaker: "COLE",
            text: "You have five minutes.",
            background: "/film/img/02-car.jpg",
            durationFrames: 24,
            cinematic: {
              grade: "neutral",
              depthMap: "/film/img/02-car.depth.png",
            },
          },
          {
            id: "b3",
            characterId: "narrator",
            speaker: "NARRATOR",
            text: "Rain hammered the windshield.",
            background: "/film/img/03-glass.jpg",
            durationFrames: 48,
          },
        ],
      },
    ],
  };
  const imported = parseImportPayload(story, "turn14.json");
  return createProjectState(imported);
}

describe("Turn 14: Paste effects, free timeline CC movement & range export", () => {
  it("copies look, particles & camera keyframes and pastes onto target shot without overwriting another picture's depthMap", () => {
    const project = makeSampleProject();
    const frames = buildKeyframes(project.story);
    const shotA = frames[0];
    const shotB = frames[1];

    const copied = copyEffectBlock(shotA);
    expect(copied.sourcePicture).toBe("/film/img/01-alley.jpg");
    expect(copied.cinematic?.grade).toBe("noir");
    expect(copied.particles).toBe("rain");
    expect(copied.animation?.zoom).toHaveLength(2);

    // Paste onto Shot B (which is 24 frames long and has its own /film/img/02-car.depth.png)
    const pasted = pasteEffectBlock(project, [shotB.id], copied);
    const nextFrames = buildKeyframes(pasted.story);
    const updatedB = nextFrames[1];

    expect(updatedB.beat.cinematic?.grade).toBe("noir");
    expect(updatedB.beat.cinematic?.vignette).toBe(true);
    expect(updatedB.beat.cinematic?.filmGrain).toBe(0.25);
    expect(updatedB.beat.cinematic?.depthAmount).toBe(0.6);
    // Shot B keeps its OWN depthMap instead of receiving Shot A's alley depthMap
    expect(updatedB.beat.cinematic?.depthMap).toBe("/film/img/02-car.depth.png");
    expect(updatedB.beat.particles).toBe("rain");
    // 36-frame zoom animation end keyframe (frame 35) fitted cleanly to 24-frame Shot B (frame 23)
    expect(updatedB.beat.animation?.zoom).toEqual([
      { frame: 0, value: 1, easing: "ease-in-out" },
      { frame: 23, value: 1.24, easing: "ease-in-out" },
    ]);
  });

  it("freely moves and trims captions across shot cuts while preserving speaker and never mutating beat.text", () => {
    const project = makeSampleProject();
    // Move Beat 1's caption ("Wait in the car.", originally 0..36) to global frames 28..52,
    // spanning right across the cut at frame 36 into Beat 2 (36..60)!
    const moved1 = moveTimelineCaption(project, "b1", 0, 28, 52);
    expect(moved1.anchorFrameId).toBe("b1");

    const clips1 = buildTimelineClips(buildKeyframes(moved1.project.story)).clips;
    const resolved1 = resolveTimelineCaptions(clips1);
    const movedCap1 = resolved1.find((rc) => rc.text === "Wait in the car.");
    expect(movedCap1?.globalInFrame).toBe(28);
    expect(movedCap1?.globalOutFrame).toBe(52);
    expect(movedCap1?.free).toBe(true);
    // Active across the cut at frame 40 (inside Beat 2!)
    expect(activeTimelineCaptionAtFrame(resolved1, 40)?.text).toBe("Wait in the car.");

    // Now drag it all the way onto Beat 3 (starts at frame 60): global frames 64..92
    const moved2 = moveTimelineCaption(
      moved1.project,
      moved1.anchorFrameId,
      moved1.anchorCaptionIndex,
      64,
      92,
    );
    expect(moved2.anchorFrameId).toBe("b3");

    const postFrames = buildKeyframes(moved2.project.story);
    // Original beat.text on ALL beats is 100% untouched!
    expect(postFrames[0].beat.text).toBe("Wait in the car.");
    expect(postFrames[1].beat.text).toBe("You have five minutes.");
    expect(postFrames[2].beat.text).toBe("Rain hammered the windshield.");

    const postClips = buildTimelineClips(postFrames).clips;
    const postResolved = resolveTimelineCaptions(postClips);
    const activeAt70 = activeTimelineCaptionAtFrame(postResolved, 70);
    expect(activeAt70?.text).toBe("Wait in the car.");
    expect(activeAt70?.speaker).toBe("MARA");
  });

  it("shifts multi-selected captions across shot boundaries via shiftMultiLaneSelection", () => {
    const project = makeSampleProject();
    // Shift Beat 1 caption (+40 frames = 1666.67 ms) so it lands inside Beat 2 (frame 40..76)
    const res = shiftMultiLaneSelection(
      project,
      {
        ...EMPTY_MULTI_SELECTION,
        captions: [{ frameId: "b1", index: 0 }],
      },
      (40 * 1000) / 24,
    );
    expect(res.selection.captions).toHaveLength(1);
    expect(res.selection.captions[0].frameId).toBe("b2");

    const clips = buildTimelineClips(buildKeyframes(res.project.story)).clips;
    const resolved = resolveTimelineCaptions(clips);
    const hit = resolved.find((rc) => rc.text === "Wait in the car.");
    expect(hit?.globalInFrame).toBe(40);
    expect(hit?.globalOutFrame).toBe(76);
  });

  it("exports range .srt shifted to 00:00:00,000 at --from and clipped cleanly to --to", () => {
    const project = makeSampleProject();
    const clips = buildTimelineClips(buildKeyframes(project.story)).clips;
    // Export range from=36 (start of Beat 2) to=59 (24 frames = 1.000s)
    const srt = makeRangeCaptionsSrt(clips, 36, 59, 24);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,000\nYou have five minutes.");
  });

  it("encodes exact 48kHz stereo WAV sample counts matching to - from + 1 frames at 24 fps", () => {
    const frameCount = 47;
    const samplesPerFrame = 48000 / 24; // 2000
    const totalSamples = frameCount * samplesPerFrame;
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);
    const wav = encodeWav16BitStereo(left, right, 48000);
    expect(wav.byteLength).toBe(44 + totalSamples * 4);
  });
});
