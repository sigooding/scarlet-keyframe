import { describe, expect, it } from "vitest";
import {
  computeWaveformEnvelopeFromChannels,
  sampleEnvelopeRange,
} from "./waveformPeaks";
import { normalizeStereoLoudnessInPlace } from "./offlineAudioMix";
import {
  applyStudioPatchToStory,
  isStudioPatchPayload,
  writeStudioPatch,
} from "./patch";
import { createProjectState, parseImportPayload } from "./model";

describe("Turn 16 — Bipolar Waveform Peak Envelope", () => {
  it("computes quantized Int8 bipolar [min, max] buckets and samples sub-ranges cleanly", () => {
    const sampleRate = 48000;
    const ch = new Float32Array(sampleRate); // 1.0 second
    // First half: quiet 0.25 sine; second half: hot 1.0/-0.95 square wave that clips
    for (let i = 0; i < sampleRate / 2; i++) {
      ch[i] = 0.25 * Math.sin((2 * Math.PI * 120 * i) / sampleRate);
    }
    for (let i = sampleRate / 2; i < sampleRate; i++) {
      ch[i] = i % 200 < 100 ? 1.0 : -0.95;
    }

    const env = computeWaveformEnvelopeFromChannels("test.wav", [ch], sampleRate, 200);
    expect(env.bucketCount).toBe(200);
    expect(env.durationMs).toBeCloseTo(1000, 1);
    expect(env.maxAbsPeak).toBeCloseTo(1.0, 2);

    // Sample only first half [0..500ms]: max ~0.25, min ~-0.25, never clipping
    for (let k = 0; k < 10; k++) {
      const s = sampleEnvelopeRange(env, k * 50, (k + 1) * 50, false);
      expect(s.max).toBeGreaterThan(0.2);
      expect(s.max).toBeLessThan(0.32);
      expect(s.min).toBeLessThan(-0.2);
      expect(s.min).toBeGreaterThan(-0.32);
      expect(s.peak).toBeLessThan(0.32);
    }

    // Sample second half [500..1000ms]: max ~1.0, min ~-0.95
    const secondHalf = sampleEnvelopeRange(env, 500, 1000, false);
    expect(secondHalf.max).toBeGreaterThan(0.98);
    expect(secondHalf.min).toBeLessThan(-0.92);
    expect(secondHalf.peak).toBeGreaterThan(0.98);

    // Loop mode wraps past 1000ms cleanly
    const looped = sampleEnvelopeRange(env, 1550, 1750, true);
    expect(looped.peak).toBeGreaterThan(0.98);
  });
});

describe("Turn 16 — -14 LUFS + -1.0 dBTP Loudness Normalization", () => {
  it("boosts a quiet mix toward -14 LUFS while strictly clamping peaks to -1.0 dBTP", () => {
    const sr = 48000;
    const len = sr * 2; // 2 seconds (> 400ms BS.1770 gating block)
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const s = 0.04 * Math.sin((2 * Math.PI * 440 * i) / sr);
      left[i] = s;
      right[i] = s;
    }
    // Add one sharp transient spike to test the -1.0 dBTP smooth peak limiter
    left[24000] = 0.9;
    right[24000] = -0.9;

    const { measuredLufs, appliedGainDb, postPeakDb } = normalizeStereoLoudnessInPlace(
      left,
      right,
      sr,
      { targetLufs: -14, ceilingDb: -1.0, maxBoostDb: 12 },
    );

    expect(Number.isFinite(measuredLufs)).toBe(true);
    expect(measuredLufs).toBeLessThan(-20);
    expect(appliedGainDb).toBeGreaterThan(6);
    expect(postPeakDb).toBeLessThanOrEqual(-0.99);

    const ceilingLinear = Math.pow(10, -1.0 / 20) + 1e-4;
    let maxPeak = 0;
    for (let i = 0; i < len; i++) {
      const m = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      if (m > maxPeak) maxPeak = m;
    }
    expect(maxPeak).toBeLessThanOrEqual(ceilingLinear);
    // Steady body of tone was boosted noticeably above 0.04
    expect(Math.abs(left[12000]) + Math.abs(left[12027])).toBeGreaterThan(0.12);
  });

  it("handles digital silence safely with zero NaNs and 0 dB gain", () => {
    const left = new Float32Array(48000);
    const right = new Float32Array(48000);
    const res = normalizeStereoLoudnessInPlace(left, right, 48000);
    expect(res.appliedGainDb).toBe(0);
    expect(left.every((v) => v === 0)).toBe(true);
  });
});

describe("Turn 16 — Studio Patch Hydration (--project support)", () => {
  it("round-trips studio-edits.json patches onto a base Story while keeping beat.text intact", () => {
    const rawStory = {
      title: "Test Film",
      startSceneId: "sc_1",
      scenes: [
        {
          id: "sc_1",
          name: "Scene 1",
          background: "/img/plate1.png",
          dialogueBeats: [
            {
              speaker: "Narrator",
              text: "Original immutable script line.",
              background: "/img/plate1.png",
              cinematic: { grade: "noir", gradeStrength: 0.5 },
            },
          ],
        },
      ],
    };

    const project = createProjectState(parseImportPayload(rawStory, "test-film.json"));
    // Edit picture, look, and beat SFX on the working story
    project.story.scenes[0].dialogueBeats![0].background = "/img/plate2.png";
    project.story.scenes[0].dialogueBeats![0].cinematic = {
      grade: "amber",
      gradeStrength: 0.85,
    };
    project.story.scenes[0].dialogueBeats![0].sfxUrl = "/sfx/thunder.mp3";
    project.story.scenes[0].dialogueBeats![0].sfxVolume = 0.75;

    const { patch } = writeStudioPatch(project);
    expect(isStudioPatchPayload(patch)).toBe(true);
    expect(isStudioPatchPayload(rawStory)).toBe(false);

    const hydratedStory = applyStudioPatchToStory(project.originalStory, patch);
    const beat = hydratedStory.scenes[0].dialogueBeats![0];
    expect(beat.text).toBe("Original immutable script line.");
    expect(beat.background).toBe("/img/plate2.png");
    expect((beat.cinematic as Record<string, unknown>)?.grade).toBe("amber");
    expect(beat.sfxUrl).toBe("/sfx/thunder.mp3");
    expect(beat.sfxVolume).toBe(0.75);
  });
});
