import { describe, expect, it } from "vitest";
import { buildTimelineClips } from "../sequence/animate";
import {
  buildClipGainEnvelope,
  EMPTY_MULTI_SELECTION,
  evaluateClipGainAtElapsedMs,
  volumeScaleAtMs,
  type AudioClip,
} from "./audioClips";
import { copyMultiSelection } from "./edits";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "./model";

function makeProjectWithMusicClip(): ProjectState {
  const rawStory = {
    id: "volume-fixture",
    title: "Volume Fixture",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        sceneNumber: 1,
        title: "Scene One",
        background: "/film/img/sc1.png",
        dialogueBeats: [
          {
            id: "b1",
            speaker: "A",
            text: "Long picture beat under the score.",
            durationFrames: 240,
            background: "/film/img/a.jpg",
          },
        ],
      },
    ],
  };
  const imported = parseImportPayload(rawStory, "volume-fixture.json");
  const base = createProjectState(imported, []);
  const musicClip: AudioClip = {
    id: "ac-music-vol",
    lane: "music",
    src: "/film/audio/theme.mp3",
    anchorId: "b1",
    offsetMs: 0,
    inMs: 0,
    durationMs: 4000,
    gain: 0.5,
    fadeInMs: 500,
    fadeOutMs: 500,
    volumeKeys: [
      { atMs: 1000, gain: 0.4 },
      { atMs: 3000, gain: 1 },
    ],
  };
  return { ...base, audioClips: [musicClip] };
}

describe("Music-lane volume automation curves", () => {
  describe("volumeScaleAtMs", () => {
    it("returns 1 without keys, holds the first/last key outside, and interpolates linearly between", () => {
      const durationMs = 4000;
      expect(volumeScaleAtMs({ durationMs }, 0)).toBe(1);
      expect(
        volumeScaleAtMs(
          {
            durationMs,
            volumeKeys: [
              { atMs: 3000, gain: 1 },
              { atMs: 1000, gain: 0.4 }, // input order is irrelevant
            ],
          },
          2000,
        ),
      ).toBeCloseTo(0.7, 6);
      const keys = [
        { atMs: 1000, gain: 0.4 },
        { atMs: 3000, gain: 1 },
      ];
      expect(volumeScaleAtMs({ durationMs, volumeKeys: keys }, 500)).toBe(0.4); // before first
      expect(volumeScaleAtMs({ durationMs, volumeKeys: keys }, 3500)).toBe(1); // after last
      expect(volumeScaleAtMs({ durationMs, volumeKeys: keys }, 99999)).toBe(1);
      expect(volumeScaleAtMs({ durationMs, volumeKeys: [{ atMs: 500, gain: 9 }] }, 10)).toBe(1.5); // clamped to max
      expect(volumeScaleAtMs({ durationMs, volumeKeys: [{ atMs: 500, gain: -2 }] }, 10)).toBe(0); // clamped to 0
    });
  });

  describe("evaluateClipGainAtElapsedMs composes static gain × fades × curve", () => {
    const clip: AudioClip = {
      id: "ac-music-vol",
      lane: "music",
      src: "/film/audio/theme.mp3",
      anchorId: "b1",
      offsetMs: 0,
      inMs: 0,
      durationMs: 4000,
      gain: 0.5,
      fadeInMs: 500,
      fadeOutMs: 500,
      volumeKeys: [
        { atMs: 1000, gain: 0.4 },
        { atMs: 3000, gain: 1 },
      ],
    };

    it("keeps the classic fade shape when there are no keys", () => {
      const plain = { ...clip, volumeKeys: undefined };
      expect(evaluateClipGainAtElapsedMs(plain, 0)).toBe(0);
      expect(evaluateClipGainAtElapsedMs(plain, 250)).toBeCloseTo(0.25, 6);
      expect(evaluateClipGainAtElapsedMs(plain, 2000)).toBeCloseTo(0.5, 6);
      expect(evaluateClipGainAtElapsedMs(plain, 3750)).toBeCloseTo(0.25, 6);
      expect(evaluateClipGainAtElapsedMs(plain, 4000)).toBe(0);
    });

    it("scales the plateau with the curve and keeps fading both edges", () => {
      // Before the first key the curve holds 0.4 → plateau 0.5 × 0.4 = 0.2
      expect(evaluateClipGainAtElapsedMs(clip, 500)).toBeCloseTo(0.2, 6);
      expect(evaluateClipGainAtElapsedMs(clip, 1000)).toBeCloseTo(0.2, 6); // exactly on the first key
      expect(evaluateClipGainAtElapsedMs(clip, 2000)).toBeCloseTo(0.35, 6); // 0.5 × interp(0.4→1) = 0.5 × 0.7
      expect(evaluateClipGainAtElapsedMs(clip, 3000)).toBeCloseTo(0.5, 6); // 0.5 × 1
      expect(evaluateClipGainAtElapsedMs(clip, 3500)).toBeCloseTo(0.5, 6); // plateau until fade-out
      // Fade-in still ramps from silence into the curved level
      expect(evaluateClipGainAtElapsedMs(clip, 250)).toBeCloseTo(0.5 * (250 / 500) * 0.4, 6);
      // Fade-out still ramps the curved level down to silence
      expect(evaluateClipGainAtElapsedMs(clip, 3750)).toBeCloseTo(0.5 * 1 * (250 / 500), 6);
      expect(evaluateClipGainAtElapsedMs(clip, 4000)).toBe(0);
    });
  });

  describe("buildClipGainEnvelope", () => {
    const clip: AudioClip = {
      id: "ac-music-vol",
      lane: "music",
      src: "/film/audio/theme.mp3",
      anchorId: "b1",
      offsetMs: 0,
      inMs: 0,
      durationMs: 4000,
      gain: 0.5,
      fadeInMs: 500,
      fadeOutMs: 500,
      volumeKeys: [
        { atMs: 1000, gain: 0.4 },
        { atMs: 3000, gain: 1 },
      ],
    };

    it("keeps the exact classic fade-only shape when the clip has no keys", () => {
      const plain = { ...clip, volumeKeys: undefined };
      const points = buildClipGainEnvelope(plain, 0, plain.durationMs);
      expect(points).toEqual([
        { offsetMs: 0, gain: 0 },
        { offsetMs: 500, gain: 0.5 },
        { offsetMs: 3500, gain: 0.5 },
        { offsetMs: 4000, gain: 0 },
      ]);
    });

    it("emits volume-key breakpoints (plus midpoints) and keeps the fade edges", () => {
      const points = buildClipGainEnvelope(clip, 0, clip.durationMs);
      const offsets = points.map((p) => p.offsetMs);
      expect(offsets).toContain(0);
      expect(offsets).toContain(500); // fade-in end
      expect(offsets).toContain(1000); // volume key
      expect(offsets).toContain(3000); // volume key
      expect(offsets).toContain(3500); // fade-out start
      expect(points[points.length - 1]).toEqual({ offsetMs: 4000, gain: 0 });
      // Values follow evaluateClipGainAtElapsedMs at each breakpoint
      const at1000 = points.find((p) => p.offsetMs === 1000)!;
      expect(at1000.gain).toBeCloseTo(evaluateClipGainAtElapsedMs(clip, 1000), 6);
      expect(at1000.gain).toBeCloseTo(0.5 * 0.4, 6);
      // Sorted, non-decreasing offsets
      for (let i = 1; i < points.length; i += 1) {
        expect(points[i].offsetMs).toBeGreaterThanOrEqual(points[i - 1].offsetMs);
      }
    });

    it("re-bases a mid-clip seek so the slice starts at the curve's value at the playhead", () => {
      // Seek into the clip at 2,000 ms (between the two keys) with 1,500 ms remaining
      const points = buildClipGainEnvelope(clip, 2000, 1500);
      expect(points[0].offsetMs).toBe(0);
      expect(points[0].gain).toBeCloseTo(evaluateClipGainAtElapsedMs(clip, 2000), 6);
      expect(points[0].gain).toBeCloseTo(0.35, 6);
      // The key at 3,000 ms arrives at slice-offset 1,000
      const keyPoint = points.find((p) => p.offsetMs === 1000);
      expect(keyPoint?.gain).toBeCloseTo(0.5, 6);
      // Slice ends at 3,500 ms clip time → fade-out has begun → below the plateau
      const last = points[points.length - 1];
      expect(last.offsetMs).toBe(1500);
      expect(last.gain).toBeCloseTo(evaluateClipGainAtElapsedMs(clip, 3500), 6);
    });
  });

  describe("volumeKeys survive edit operations", () => {
    it("copyMultiSelection keeps volumeKeys on copied sound clips", () => {
      const project = makeProjectWithMusicClip();
      const frames = buildKeyframes(project.story);
      const { clips } = buildTimelineClips(frames);
      expect(clips).toHaveLength(1);

      const clipboard = copyMultiSelection(
        project,
        { ...EMPTY_MULTI_SELECTION, audioClipIds: ["ac-music-vol"] },
        new Map(),
      );
      expect(clipboard).toBeDefined();
      expect(clipboard!.audioClips).toHaveLength(1);
      expect(clipboard!.audioClips[0].clip.volumeKeys).toEqual([
        { atMs: 1000, gain: 0.4 },
        { atMs: 3000, gain: 1 },
      ]);
    });
  });
});
