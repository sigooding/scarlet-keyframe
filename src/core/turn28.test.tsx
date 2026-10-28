import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import mediaIndex from "../data/media-index.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips, clampPoseToPictureEdges, evaluate } from "../sequence/animate";
import { resolveTimelineCaptions } from "./captions";
import {
  applyCutOptionsToProject,
  buildDirectorsCutById,
  VOTED_GAP_DEPTH_MAP_BY_BEAT_ID,
  VOTED_GAP_FRAME_SPECS,
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

describe("Turn 28 — User-Voted Reference-Matched Gap Frames & Depth Maps", () => {
  it("installs all 7 user-voted 16:9 HD+ film plates and 7 grayscale depth maps on disk and in media indexes", () => {
    expect(VOTED_GAP_FRAME_SPECS).toHaveLength(7);
    expect(Object.keys(VOTED_GAP_DEPTH_MAP_BY_BEAT_ID)).toHaveLength(7);

    const repoRoot = path.resolve(__dirname, "../..");
    const srcMediaSet = new Set(mediaIndex as string[]);
    const publicMediaSet = new Set(
      JSON.parse(
        fs.readFileSync(path.join(repoRoot, "public/examples/media-index.json"), "utf8"),
      ) as string[],
    );

    for (const spec of VOTED_GAP_FRAME_SPECS) {
      const diskImg = path.join(repoRoot, "public", spec.suggestedPath.replace(/^\//, ""));
      expect(fs.existsSync(diskImg)).toBe(true);
      expect(fs.statSync(diskImg).size).toBeGreaterThan(100_000);

      const dims = readJpegDimensions(diskImg);
      expect(dims.width).toBeGreaterThanOrEqual(1920);
      expect(dims.height).toBeGreaterThanOrEqual(1080);
      expect(dims.width / dims.height).toBeCloseTo(16 / 9, 2);

      expect(srcMediaSet.has(spec.suggestedPath)).toBe(true);
      expect(publicMediaSet.has(spec.suggestedPath)).toBe(true);

      const depthRel = VOTED_GAP_DEPTH_MAP_BY_BEAT_ID[spec.beatId];
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

  it("wires all 7 voted plates across Neo-Noir, Creative, 1950s Noir, and Uncut with timeline markers and zero border clamping", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();

    const cutExpectedGrade: Record<Exclude<DirectorsCutId, "uncut">, string> = {
      "neo-noir": "tokyo-noir",
      creative: "sodium-amber",
      "noir-1950s": "noir-1950s",
    };

    for (const cutId of ["neo-noir", "creative", "noir-1950s"] as const) {
      const proj = buildDirectorsCutById(baseProject, cutId, voiceMap, musicMap);
      const frames = buildKeyframes(proj.story);
      const { clips } = buildTimelineClips(frames, voiceMap);

      for (const spec of VOTED_GAP_FRAME_SPECS) {
        const match = clips.find((c) => c.keyframe.id === spec.beatId);
        expect(match, `${cutId} missing clip ${spec.beatId}`).toBeDefined();
        expect(match!.keyframe.beat.background).toBe(spec.suggestedPath);
        expect(match!.keyframe.beat.cinematic?.colorGrade).toBe(cutExpectedGrade[cutId]);
        if (cutId === "neo-noir") {
          expect(match!.durationFrames).toBe(spec.durationFrames);
        }

        // Verify ruler marker jumps directly to each voted shot
        const marker = (proj.story.markers || []).find(
          (m) => m.id.startsWith("marker-voted-") && m.frame === match!.startFrame,
        );
        expect(marker, `${cutId} missing marker for ${spec.beatId}`).toBeDefined();

        // Verify camera keyframes stay strictly within safe picture bounds
        for (const lf of [
          0,
          Math.floor(match!.durationFrames / 2),
          Math.max(0, match!.durationFrames - 1),
        ]) {
          const pose = evaluate(match!.keyframe, lf);
          expect(clampPoseToPictureEdges(pose).clamped).toBe(false);
        }
      }

      // Verify Scene 53 wide -> insert -> wide opening distinct plate progression
      const s53Pics = clips
        .filter((c) => c.keyframe.sceneId === "nw_s53")
        .map((c) => c.keyframe.picture)
        .filter((pic, idx, arr) => idx === 0 || pic !== arr[idx - 1])
        .slice(0, 3);
      expect(s53Pics).toEqual([
        "/film/img/s53/219-pink-water.jpg",
        "/film/img/s53/883-she-wrings-the-cloth.jpg",
        "/film/img/s53/219-pink-water.jpg",
      ]);

      // Verify Scene 77A 7-shot sequence with 1299-the-envelope.jpg on nw_b1292
      const s77aPics = clips
        .filter((c) => c.keyframe.sceneId === "nw_s77a")
        .map((c) => c.keyframe.picture);
      expect(s77aPics).toEqual([
        "/film/img/s77a/1290-predawn-avenue.jpg",
        "/film/img/s77a/1299-the-envelope.jpg",
        "/film/img/s77a/1293-sedan-keeps-pace.jpg",
        "/film/img/s77a/1294-hand-and-watch-on-sill.jpg",
        "/film/img/s77a/1296-everyone-is-allowed-one.jpg",
        "/film/img/s77a/1303-reflection-in-black-glass.jpg",
        "/film/img/s77a/1304-sedan-turns-off.jpg",
      ]);

      // Verify Scene 78 7-shot sequence & DANIEL VOSS. notebook reveal
      const s78Pics = clips
        .filter((c) => c.keyframe.sceneId === "nw_s78")
        .map((c) => c.keyframe.picture);
      expect(s78Pics).toEqual([
        "/film/img/s78/88-the-walkway.jpg",
        "/film/img/s78/1307-jack-knocks-once.jpg",
        "/film/img/s78/316-squared-to-the-door.jpg",
        "/film/img/s78/1309-vera-opens-door-dawn.jpg",
        "/film/img/s78/89-no-name.jpg",
        "/film/img/s78/90-daniel-voss.jpg",
        "/film/img/s78/1313-daniel-voss-inside-cover.jpg",
      ]);
      const caps = resolveTimelineCaptions(clips);
      const vossCap = caps.find((c) => c.frameId === "nw_b1313");
      expect(vossCap).toBeDefined();
      expect(vossCap!.text).toBe("DANIEL VOSS.");

      // Verify Scene 100 complete 8-shot epilogue progression
      const s100Pics = clips
        .filter((c) => c.keyframe.sceneId === "nw_s100")
        .map((c) => c.keyframe.picture);
      expect(s100Pics).toEqual([
        "/film/img/s100/1676-the-kaneko-sign.jpg",
        "/film/img/s100/320-the-news-nobody-watches.jpg",
        "/film/img/s100/158-the-third-stool.jpg",
        "/film/img/s100/1682-the-curtain-moves.jpg",
        "/film/img/s100/161-stool-three.jpg",
        "/film/img/s100/160-the-clip.jpg",
        "/film/img/s100/1685-money-on-the-counter.jpg",
        "/film/img/s100/159-she-doesnt-turn.jpg",
      ]);
    }

    // Verify Uncut preserves exact 1,584 beats while exposing all 7 new plates on their target beats
    const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);
    const uncutFrames = buildKeyframes(uncut.story);
    expect(uncutFrames).toHaveLength(1584);
    for (const spec of VOTED_GAP_FRAME_SPECS) {
      const f = uncutFrames.find((kf) => kf.id === spec.beatId);
      expect(f).toBeDefined();
      expect(f!.picture).toBe(spec.suggestedPath);
    }
  });

  it("toggles 2.5D WebGL depth maps on all 7 voted plates via newPlateDepthMaps without altering frame timing", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    const neoOff = buildDirectorsCutById(baseProject, "neo-noir", voiceMap, musicMap, {
      newPlateDepthMaps: false,
    });
    const neoOn = applyCutOptionsToProject(neoOff, { newPlateDepthMaps: true });

    const offClips = buildTimelineClips(buildKeyframes(neoOff.story), voiceMap);
    const onClips = buildTimelineClips(buildKeyframes(neoOn.story), voiceMap);
    expect(onClips.totalFrames).toBe(offClips.totalFrames);

    for (const spec of VOTED_GAP_FRAME_SPECS) {
      const cOff = offClips.clips.find((c) => c.keyframe.id === spec.beatId)!;
      const cOn = onClips.clips.find((c) => c.keyframe.id === spec.beatId)!;
      expect(cOff.keyframe.beat.cinematic?.depthMap).toBeUndefined();
      expect(cOn.keyframe.beat.cinematic?.depthMap).toBe(
        VOTED_GAP_DEPTH_MAP_BY_BEAT_ID[spec.beatId],
      );
      expect(cOn.startFrame).toBe(cOff.startFrame);
      expect(cOn.durationFrames).toBe(cOff.durationFrames);
      expect(evaluate(cOn.keyframe, 0).depthAmount).toBeGreaterThan(0);
    }
  });
});
