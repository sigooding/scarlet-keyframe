import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips } from "../sequence/animate";
import { effectiveCaptionsForBeat, resolveTimelineCaptions, wrapCaptionLines } from "./captions";
import { balanceLines, cuesForText, splitCaptionText, splitLongCue, splitSentences, wrapLines } from "./captionCues";
import { buildDirectorsCutById } from "./directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

const JACK =
  "Twenty years ago I was a police detective. An American insurance investigator named Daniel Voss proved the Shirakawa fire was arson, and the men who paid for it were never named. I was the one who signed the report that closed it.";

describe("caption cues: splitting", () => {
  it("splits sentences but not after Mrs. / Mr. / initials", () => {
    expect(splitSentences("Mrs. Sakai waits. Mr. Noda leaves! Who is J. K. Smith? Nobody.")).toEqual([
      "Mrs. Sakai waits.",
      "Mr. Noda leaves!",
      "Who is J. K. Smith?",
      "Nobody.",
    ]);
    expect(splitSentences('He said "No." Then he left.')).toEqual(['He said "No."', "Then he left."]);
    expect(splitSentences("Wait... what is that?")).toEqual(["Wait... what is that?"]);
  });

  it("keeps a short text as one cue and packs short sentences together", () => {
    expect(splitCaptionText("Rain. Not a storm. Just cold, steady, patient rain.")).toEqual([
      "Rain. Not a storm. Just cold, steady, patient rain.",
    ]);
    expect(splitCaptionText("Detective.")).toEqual(["Detective."]);
    expect(splitCaptionText("  ")).toEqual([]);
  });

  it("turns a long paragraph into cues of at most two lines of 42 characters, losing nothing", () => {
    const cues = splitCaptionText(JACK);
    expect(cues.length).toBeGreaterThanOrEqual(3);
    for (const cue of cues) {
      expect(cue.length).toBeLessThanOrEqual(84);
      expect(wrapLines(cue).length).toBeLessThanOrEqual(2);
      for (const line of wrapLines(cue)) expect(line.length).toBeLessThanOrEqual(42);
    }
    expect(cues.join(" ")).toBe(JACK);
  });

  it("breaks a sentence with no punctuation near the middle, never inside a word", () => {
    const text = "she walked down the long wet lane past the barber and the vending machine and the shuttered bar until the lamp";
    const cues = splitCaptionText(text);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues.join(" ")).toBe(text);
    for (const cue of cues) expect(cue.length).toBeGreaterThan(20);
  });

  it("balances two-line cues", () => {
    expect(balanceLines("Vera sits at the low table in the dawn light.")).toEqual(["Vera sits at the low", "table in the dawn light."]);
    expect(wrapCaptionLines("Vera sits at the low table in the dawn light.")).toEqual(["Vera sits at the low", "table in the dawn light."]);
    expect(wrapCaptionLines("Short.")).toEqual(["Short."]);
  });
});

describe("caption cues: timing", () => {
  it("covers the span with no gaps and no overlaps, in proportion, each cue readable when there is room", () => {
    const cues = cuesForText(JACK, 40, 40 + 24 * 16);
    expect(cues[0].inFrame).toBe(40);
    expect(cues[cues.length - 1].outFrame).toBe(40 + 24 * 16);
    for (let i = 1; i < cues.length; i += 1) expect(cues[i].inFrame).toBe(cues[i - 1].outFrame);
    for (const cue of cues) expect(cue.outFrame - cue.inFrame).toBeGreaterThanOrEqual(24);
  });

  it("falls back to plain proportion when the span is too short to read everything", () => {
    const cues = cuesForText(JACK, 0, 48);
    expect(cues[cues.length - 1].outFrame).toBe(48);
    expect(cues.every((c) => c.outFrame > c.inFrame)).toBe(true);
  });

  it("splits one over-long authored cue across its own span and leaves short ones alone", () => {
    const parts = splitLongCue({ text: JACK, inFrame: 10, outFrame: 400 });
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[0].inFrame).toBe(10);
    expect(parts[parts.length - 1].outFrame).toBe(400);
    expect(splitLongCue({ text: "Fires don't do that.", inFrame: 0, outFrame: 50 })).toHaveLength(1);
  });
});

describe("caption cues: the real film", () => {
  const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
  const imported = parseImportPayload(bundledFilm, "film.json", { voiceDurations: voiceMap });
  const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
  const musicMap = extractKnownMusicDurations(bundledEdits);

  for (const cutId of ["uncut", "neo-noir", "jack-noir"] as const) {
    it(`${cutId}: every cue fits two lines, is lossless, and starts with the voice`, () => {
      const project = buildDirectorsCutById(base, cutId, voiceMap, musicMap);
      const frames = buildKeyframes(project.story);
      const { clips } = buildTimelineClips(frames, voiceMap);
      let cues = 0;
      let massive = 0;
      let longest = 0;
      for (const clip of clips) {
        const beat = clip.keyframe.beat;
        const caps = effectiveCaptionsForBeat(beat, clip.durationFrames);
        const spoken = caps.filter((c) => !c.free);
        for (const cap of spoken) {
          cues += 1;
          const lines = wrapCaptionLines(cap.text, 42);
          if (lines.length > 2) massive += 1;
          longest = Math.max(longest, cap.text.length);
          expect(cap.outFrame).toBeGreaterThan(cap.inFrame);
          expect(cap.outFrame).toBeLessThanOrEqual(clip.durationFrames);
        }
        if (!Array.isArray(beat.captions) && beat.text && beat.text.trim() && beat.text.trim() !== "·") {
          expect(caps.map((c) => c.text).join(" ")).toBe(String(beat.text).replace(/\s+/g, " ").trim());
          if (beat.audioUrl && clip.voiceFrames > 0) expect(caps[0].inFrame).toBeGreaterThanOrEqual(Math.min(clip.voiceInFrame, clip.durationFrames - 1));
        }
      }
      expect(cues).toBeGreaterThan(500);
      expect(massive).toBe(0);
      expect(longest).toBeLessThanOrEqual(90);
      const timeline = resolveTimelineCaptions(clips);
      expect(timeline.length).toBe(cues);
    });
  }

  it("Jack's long line in Original Uncut becomes several cues instead of one paragraph", () => {
    const project = buildDirectorsCutById(base, "uncut", voiceMap, musicMap);
    const frames = buildKeyframes(project.story);
    const { clips } = buildTimelineClips(frames, voiceMap);
    const clip = clips.find((c) => c.keyframe.beat.id === "nw_b1390")!;
    const caps = effectiveCaptionsForBeat(clip.keyframe.beat, clip.durationFrames);
    expect(caps.length).toBeGreaterThanOrEqual(3);
    expect(caps.every((c) => c.text.length <= 84)).toBe(true);
  });
});
