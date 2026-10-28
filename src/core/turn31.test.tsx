import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import mediaIndex from "../data/media-index.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips, clampPoseToPictureEdges, evaluate } from "../sequence/animate";
import {
  applyCutOptionsToProject,
  buildDirectorsCutById,
  VOTED_CLOSEUP_DEPTH_MAP_BY_BEAT_ID,
  VOTED_CLOSEUP_FRAME_SPECS,
  type DirectorsCutId,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
} from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

function readJpegDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`No JPEG SOF marker in ${filePath}`);
}

function buildBaseProjectFixture() {
  const voiceMap = new Map(
    Object.entries(bundledAudioDurations as Record<string, number>),
  );
  const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
    voiceDurations: voiceMap,
  });
  const baseProject = createProjectState(
    { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) },
    [],
    bundledEdits,
  );
  const musicMap = extractKnownMusicDurations(bundledEdits);
  return { baseProject, voiceMap, musicMap };
}

describe("Turn 31 — User-Voted Dialogue Close-Ups Fitted After Resized Original Frames", () => {
  it("installs all 6 user-voted 1920x1080 16:9 close-up plates and 6 960x540 depth maps on disk and in media indexes", () => {
    expect(VOTED_CLOSEUP_FRAME_SPECS).toHaveLength(6);
    expect(Object.keys(VOTED_CLOSEUP_DEPTH_MAP_BY_BEAT_ID)).toHaveLength(6);

    const repoRoot = path.resolve(__dirname, "../..");
    const srcMediaSet = new Set(mediaIndex as string[]);
    const publicMediaSet = new Set(
      JSON.parse(
        fs.readFileSync(path.join(repoRoot, "public/examples/media-index.json"), "utf8"),
      ) as string[],
    );

    for (const spec of VOTED_CLOSEUP_FRAME_SPECS) {
      const diskImg = path.join(repoRoot, "public", spec.suggestedPath.replace(/^\//, ""));
      expect(fs.existsSync(diskImg)).toBe(true);
      expect(fs.statSync(diskImg).size).toBeGreaterThan(100_000);

      const dims = readJpegDimensions(diskImg);
      expect(dims.width).toBe(1920);
      expect(dims.height).toBe(1080);
      expect(dims.width / dims.height).toBeCloseTo(16 / 9, 4);

      expect(srcMediaSet.has(spec.suggestedPath)).toBe(true);
      expect(publicMediaSet.has(spec.suggestedPath)).toBe(true);

      const depthRel = VOTED_CLOSEUP_DEPTH_MAP_BY_BEAT_ID[spec.beatId];
      expect(depthRel).toBeTruthy();
      const diskDepth = path.join(repoRoot, "public", depthRel.replace(/^\//, ""));
      expect(fs.existsSync(diskDepth)).toBe(true);
      expect(fs.statSync(diskDepth).size).toBeGreaterThan(5_000);
      const depthDims = readJpegDimensions(diskDepth);
      expect(depthDims.width).toBe(960);
      expect(depthDims.height).toBe(540);
      expect(srcMediaSet.has(depthRel)).toBe(true);
      expect(publicMediaSet.has(depthRel)).toBe(true);
    }
  });

  it("preserves every original master frame (resized shorter, never deleted) and fits each close-up immediately after it across all cuts", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();

    const cutExpectedGrade: Record<Exclude<DirectorsCutId, "uncut">, string> = {
      "neo-noir": "tokyo-noir",
      creative: "sodium-amber",
      "noir-1950s": "noir-1950s",
      tarantino: "tarantino-35mm",
    };

    for (const cutId of ["neo-noir", "creative", "noir-1950s", "tarantino"] as const) {
      const proj = buildDirectorsCutById(baseProject, cutId, voiceMap, musicMap);
      const frames = buildKeyframes(proj.story);
      const { clips } = buildTimelineClips(frames, voiceMap);

      for (const spec of VOTED_CLOSEUP_FRAME_SPECS) {
        const masterIdx = clips.findIndex((c) => c.keyframe.id === spec.precedingMasterBeatId);
        const closeupIdx = clips.findIndex((c) => c.keyframe.id === spec.beatId);
        expect(masterIdx, `${cutId} missing original frame ${spec.precedingMasterBeatId}`).toBeGreaterThanOrEqual(0);
        expect(closeupIdx, `${cutId} missing close-up ${spec.beatId}`).toBeGreaterThan(masterIdx);

        const masterClip = clips[masterIdx];
        const closeupClip = clips[closeupIdx];

        expect(masterClip.keyframe.picture).toBe(spec.precedingMasterPath);
        expect(closeupClip.keyframe.picture).toBe(spec.suggestedPath);
        expect(closeupClip.keyframe.beat.cinematic?.colorGrade).toBe(cutExpectedGrade[cutId]);

        if (cutId === "neo-noir" || cutId === "creative") {
          // Close-up fits directly at the end of the resized master clip with zero deleted frames
          expect(closeupIdx).toBe(masterIdx + 1);
          expect(closeupClip.startFrame).toBe(masterClip.endFrame);
        }
        if (cutId === "neo-noir") {
          expect(masterClip.durationFrames).toBe(spec.precedingMasterDurationFrames);
          expect(closeupClip.durationFrames).toBe(spec.durationFrames);
        }

        // Ruler marker jumps directly to each close-up
        const marker = (proj.story.markers || []).find(
          (m) => m.id.startsWith("marker-closeup-") && m.frame === closeupClip.startFrame,
        );
        expect(marker, `${cutId} missing closeup marker for ${spec.beatId}`).toBeDefined();

        // Camera pose stays strictly inside safe picture bounds
        for (const lf of [
          0,
          Math.floor(closeupClip.durationFrames / 2),
          Math.max(0, closeupClip.durationFrames - 1),
        ]) {
          const pose = evaluate(closeupClip.keyframe, lf);
          expect(clampPoseToPictureEdges(pose).clamped).toBe(false);
        }
      }
    }

    // Also verify Uncut preserves original master plates followed by the new close-up plates
    const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);
    const { clips: uncutClips } = buildTimelineClips(buildKeyframes(uncut.story), voiceMap);
    for (const spec of VOTED_CLOSEUP_FRAME_SPECS) {
      const masterClip = uncutClips.find((c) => c.keyframe.id === spec.precedingMasterBeatId);
      const closeupClip = uncutClips.find((c) => c.keyframe.id === spec.beatId);
      expect(masterClip?.keyframe.picture).toBe(spec.precedingMasterPath);
      expect(closeupClip?.keyframe.picture).toBe(spec.suggestedPath);
      expect(closeupClip!.startFrame).toBeGreaterThan(masterClip!.startFrame);
    }
  });

  it("wires 2.5D depth maps onto all 6 close-up plates when newPlateDepthMaps is enabled", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    const neoOff = buildDirectorsCutById(baseProject, "neo-noir", voiceMap, musicMap, {
      newPlateDepthMaps: false,
    });
    const withDepth = applyCutOptionsToProject(neoOff, { newPlateDepthMaps: true });
    const frames = buildKeyframes(withDepth.story);

    for (const spec of VOTED_CLOSEUP_FRAME_SPECS) {
      const kf = frames.find((f) => f.id === spec.beatId);
      expect(kf).toBeDefined();
      expect(kf!.beat.cinematic?.depthMap).toBe(VOTED_CLOSEUP_DEPTH_MAP_BY_BEAT_ID[spec.beatId]);
      expect(evaluate(kf!, 0).depthAmount).toBeGreaterThan(0);
    }
  });
});
