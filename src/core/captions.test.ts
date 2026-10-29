import { describe, expect, it } from "vitest";
import {
  activeCaptionAtLocalFrame,
  captionMetrics,
  captionsDifferFromRecordedLine,
  deleteCaptionsAtIndices,
  dragCaptionEdge,
  effectiveCaptionsForBeat,
  makeCaptionsSrt,
  makeCaptionsVtt,
  mergeAdjacentCaptions,
  splitCaptionAtCursor,
  splitCaptionAtFrame,
  updateCaptionText,
} from "./captions";
import { resetBeatCaptions, setBeatCaptions, setStoryCaptionStyle } from "./edits";
import { buildKeyframes, createProjectState, type StoryLike } from "./model";

function makeCaptionFixture(): StoryLike {
  return {
    id: "cap_fixture",
    title: "Caption Fixture",
    startSceneId: "s79",
    characters: [
      { id: "nw_narrator", name: "Narrator" },
      { id: "nw_daniel", name: "Daniel" },
    ],
    scenes: [
      {
        id: "s79",
        title: "79 — Her father's handwriting",
        animaticMark: "79",
        background: "/film/img/s79-vera-table.jpg",
        dialogueBeats: [
          {
            id: "b1",
            characterId: "nw_narrator",
            text: "Vera sits at the low table in the dawn light.",
          },
          {
            id: "b2",
            characterId: "nw_daniel",
            audioUrl: "/film/voice/s79/286-daniel-evenly-shiohama-third-visit-the-residents.mp3",
            text: "The fire began in two places at once. Fires don't do that.",
          },
        ],
      },
    ],
  };
}

function makeProject() {
  return createProjectState({
    story: makeCaptionFixture(),
    assets: [],
    missing: [],
    sourceName: "fixture.json",
  });
}

describe("Captions (CC) editor model & exports", () => {
  it("1. with no captions field, the caption is beat.text over the whole clip", () => {
    const story = makeCaptionFixture();
    const beat = story.scenes[0].dialogueBeats![0];
    expect(beat.captions).toBeUndefined();

    const effective = effectiveCaptionsForBeat(beat, 96);
    expect(effective).toEqual([
      {
        text: "Vera sits at the low table in the dawn light.",
        inFrame: 0,
        outFrame: 96,
      },
    ]);

    expect(activeCaptionAtLocalFrame(beat, 96, 0)?.text).toBe(beat.text);
    expect(activeCaptionAtLocalFrame(beat, 96, 48)?.text).toBe(beat.text);
    expect(activeCaptionAtLocalFrame(beat, 96, 95)?.text).toBe(beat.text);
  });

  it("2. first edit creates beat.captions without changing beat.text, and reset removes beat.captions", () => {
    const project = makeProject();
    const originalScript = project.story.scenes[0].dialogueBeats![1].text;

    const updated = updateCaptionText(
      project.story.scenes[0].dialogueBeats![1],
      120,
      0,
      "Two fires started together.",
    );
    const afterEdit = setBeatCaptions(project, "b2", updated, 120);
    const editedBeat = afterEdit.story.scenes[0].dialogueBeats![1];

    expect(editedBeat.captions).toEqual([
      { text: "Two fires started together.", inFrame: 0, outFrame: 120 },
    ]);
    // Never mutate beat.text
    expect(editedBeat.text).toBe(originalScript);
    expect(captionsDifferFromRecordedLine(editedBeat, 120)).toBe(true);

    const afterReset = resetBeatCaptions(afterEdit, "b2");
    const resetBeat = afterReset.story.scenes[0].dialogueBeats![1];
    expect("captions" in resetBeat).toBe(false);
    expect(resetBeat.captions).toBeUndefined();
    expect(resetBeat.text).toBe(originalScript);
    expect(captionsDifferFromRecordedLine(resetBeat, 120)).toBe(false);
    expect(effectiveCaptionsForBeat(resetBeat, 120)).toEqual([
      { text: originalScript!, inFrame: 0, outFrame: 120 },
    ]);
  });

  it("3. split shares the time by characters and keeps the order", () => {
    const beat = {
      id: "b_split",
      // Left = "Ten chars!" (10 chars), Right = "Thirty characters right here!!" (30 chars) => 1:3 ratio
      text: "Ten chars! Thirty characters right here!!",
    };
    const cursorAtSplit = "Ten chars! ".length;
    const { captions, didSplit } = splitCaptionAtCursor(beat, 120, 0, cursorAtSplit);

    expect(didSplit).toBe(true);
    expect(captions).toHaveLength(2);
    expect(captions[0]).toEqual({
      text: "Ten chars!",
      inFrame: 0,
      outFrame: 30, // 10 / (10 + 30) * 120 = 30 frames
    });
    expect(captions[1]).toEqual({
      text: "Thirty characters right here!!",
      inFrame: 30,
      outFrame: 120,
    });

    // Merging the two neighbouring captions restores a single span [0, 120]
    const merged = mergeAdjacentCaptions({ ...beat, captions }, 120, 0);
    expect(merged).toEqual([
      {
        text: "Ten chars! Thirty characters right here!!",
        inFrame: 0,
        outFrame: 120,
      },
    ]);
  });

  it("4. edge drag stays inside the clip and respects neighbouring captions", () => {
    const beat = {
      id: "b_drag",
      text: "Original script line",
      captions: [
        { text: "First half", inFrame: 10, outFrame: 48 },
        { text: "Second half", inFrame: 48, outFrame: 90 },
      ],
    };

    // Drag left edge past clip start (-50) -> clamps to 0
    const clampedLeft = dragCaptionEdge(beat, 100, 0, "in", -50);
    expect(clampedLeft[0].inFrame).toBe(0);
    expect(clampedLeft[0].outFrame).toBe(48);

    // Drag right edge of second caption past clip end (250) -> clamps to clipDurationFrames (100)
    const clampedRight = dragCaptionEdge(beat, 100, 1, "out", 250);
    expect(clampedRight[1].inFrame).toBe(48);
    expect(clampedRight[1].outFrame).toBe(100);

    // Drag right edge of first caption past second caption's start -> clamps to 48
    const clampedMiddle = dragCaptionEdge(beat, 100, 0, "out", 75);
    expect(clampedMiddle[0].outFrame).toBe(48);

    // Deleting a caption keeps the shot and leaves no caption for that time
    const afterDelete = deleteCaptionsAtIndices(beat, 100, [0]);
    const beatAfterDelete = { ...beat, captions: afterDelete };
    expect(activeCaptionAtLocalFrame(beatAfterDelete, 100, 20)).toBeUndefined();
    expect(activeCaptionAtLocalFrame(beatAfterDelete, 100, 60)?.text).toBe("Second half");
  });

  it("5. .srt and .vtt exports emit each caption at its own clip-relative time", () => {
    const story = makeCaptionFixture();
    // Clip 1 = 48 frames (2.000s). Clip 2 = 96 frames (4.000s) with two captions: 12..48f and 48..96f.
    story.scenes[0].dialogueBeats![1].captions = [
      { text: "The fire began in two places at once.", inFrame: 12, outFrame: 48 },
      { text: "Fires don't do that.", inFrame: 48, outFrame: 96 },
    ];
    const frames = buildKeyframes(story);
    const durationsFrames = [48, 96];

    const srt = makeCaptionsSrt(frames, durationsFrames, 24);
    expect(srt).toBe(
      [
        "1\n00:00:00,000 --> 00:00:02,000\nVera sits at the low table in the dawn\nlight.",
        "2\n00:00:02,500 --> 00:00:04,000\nThe fire began in two places at once.",
        "3\n00:00:04,000 --> 00:00:06,000\nFires don't do that.",
      ].join("\n\n"),
    );

    const vtt = makeCaptionsVtt(frames, durationsFrames, 24);
    expect(vtt).toBe(
      [
        "WEBVTT",
        "1\n00:00:00.000 --> 00:00:02.000\nVera sits at the low table in the dawn\nlight.",
        "2\n00:00:02.500 --> 00:00:04.000\nThe fire began in two places at once.",
        "3\n00:00:04.000 --> 00:00:06.000\nFires don't do that.",
      ].join("\n\n") + "\n",
    );
  });

  it("6. flags reading speed (> 17 chars/sec) and more-than-two-lines (> 42 chars wrap)", () => {
    // 36 chars in 24 frames (1.0s) = 36 cps > 17 cps -> tooFast = true, 1 line -> overTwoLines = false
    const fastMetrics = captionMetrics({
      text: "Thirty-six characters in one second!",
      inFrame: 0,
      outFrame: 24,
    });
    expect(fastMetrics.cps).toBe(36);
    expect(fastMetrics.tooFast).toBe(true);
    expect(fastMetrics.overTwoLines).toBe(false);

    // 116 chars over 240 frames (10.0s) = 11.6 cps <= 17 cps -> tooFast = false, wraps to 3 lines -> overTwoLines = true
    const threeLineMetrics = captionMetrics({
      text: "Vera sits at the low table in the dawn light. Beside her, the two cups from the beginning of the film, both empty.",
      inFrame: 0,
      outFrame: 240,
    });
    expect(threeLineMetrics.lineCount).toBe(3);
    expect(threeLineMetrics.overTwoLines).toBe(true);
    expect(threeLineMetrics.cps).toBeCloseTo(11.4, 1);
    expect(threeLineMetrics.tooFast).toBe(false);

    // Project-wide caption style persists on story
    const project = makeProject();
    const styled = setStoryCaptionStyle(project, {
      position: "top",
      size: "L",
      backgroundBox: false,
      showSpeaker: false,
      italicNarration: true,
    });
    expect(styled.story.captionStyle).toEqual({
      position: "top",
      size: "L",
      backgroundBox: false,
      showSpeaker: false,
      italicNarration: true,
    });
  });
});


describe("caption-only playhead split", () => {
  it("splits the selected cue at its local frame and preserves metadata", () => {
    const beat = { id: "b", text: "unchanged", audioUrl: "/voice.mp3", captions: [
      { text: "One two three four", inFrame: 10, outFrame: 50, free: true, speaker: "Jack", isNarration: false },
    ] };
    const original = structuredClone(beat);
    const result = splitCaptionAtFrame(beat, 100, 0, 30);
    expect(result.didSplit).toBe(true);
    expect(result.captions).toEqual([
      { text: "One two", inFrame: 10, outFrame: 30, free: true, speaker: "Jack", isNarration: false },
      { text: "three four", inFrame: 30, outFrame: 50, free: true, speaker: "Jack", isNarration: false },
    ]);
    expect(beat).toEqual(original);
  });
  it("does not split on cue boundaries, a missing cue, or indivisible text", () => {
    const beat = { id: "b", text: "Hello world", captions: [{ text: "Hello world", inFrame: 5, outFrame: 20 }] };
    for (const [index, cut] of [[0, 5], [0, 20], [1, 10]])
      expect(splitCaptionAtFrame(beat, 30, index, cut).didSplit).toBe(false);
    expect(splitCaptionAtFrame({ ...beat, captions: [{ text: "Hello", inFrame: 5, outFrame: 20 }] }, 30, 0, 10).didSplit).toBe(false);
  });
});
