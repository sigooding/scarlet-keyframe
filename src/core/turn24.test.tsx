import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import { ExportModal } from "../components/ExportModal";
import bundledAudioDurations from "../data/audio-durations.json";
import mediaIndex from "../data/media-index.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips, clampPoseToPictureEdges, evaluate } from "../sequence/animate";
import {
  activeTimelineCaptionAtFrame,
  buildMp4FfmetadataChapters,
  DEFAULT_CAPTION_STYLE,
  resolveTimelineCaptions,
} from "./captions";
import {
  applyCutOptionsToProject,
  CLASSIC_1950S_CREST_LEADER_PATH,
  DEFAULT_CUT_OPTIONS,
  NEW_PLATE_DEPTH_MAP_BY_BEAT_ID,
  switchDirectorsCutWithState,
} from "./directorsCut";
import { setBeatField } from "./edits";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
} from "./model";
import { normalizeStereoLoudnessInPlace } from "./offlineAudioMix";
import { extractKnownMusicDurations } from "./previewAudio";
import { webAudioEngine } from "./webAudioEngine";

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

describe("Turn 24 — Selectable Polish Options (Visual Craft, Sound Mastering, Editorial UX)", () => {
  it("keeps all Turn 24 options off/standard by default and indexes all 9 depth maps + 1950s crest leader", () => {
    expect(DEFAULT_CUT_OPTIONS).toEqual({
      aspectFraming: "2.35:1",
      newPlateDepthMaps: false,
      classic1950sLeader: false,
      opticalPrintEq: false,
      preservePerCutEdits: true,
    });

    const repoRoot = path.resolve(__dirname, "../..");
    const mediaSet = new Set(mediaIndex as string[]);

    const depthPaths = Object.values(NEW_PLATE_DEPTH_MAP_BY_BEAT_ID);
    expect(depthPaths).toHaveLength(9);
    for (const rel of depthPaths) {
      const diskPath = path.join(repoRoot, "public", rel.replace(/^\//, ""));
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.statSync(diskPath).size).toBeGreaterThan(2000);
      expect(mediaSet.has(rel)).toBe(true);
    }

    const crestDiskPath = path.join(
      repoRoot,
      "public",
      CLASSIC_1950S_CREST_LEADER_PATH.replace(/^\//, ""),
    );
    expect(fs.existsSync(crestDiskPath)).toBe(true);
    expect(fs.statSync(crestDiskPath).size).toBeGreaterThan(50000);
    expect(mediaSet.has(CLASSIC_1950S_CREST_LEADER_PATH)).toBe(true);
  });

  it("toggles 2.5D depth parallax on the 9 s12/s77a/s78 plates and 1950s crest leader without shifting downstream frames", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    const neoDefault = switchDirectorsCutWithState(
      baseProject,
      "neo-noir",
      voiceMap,
      musicMap,
    );
    const defaultFrames = buildKeyframes(neoDefault.story);
    const defaultLayout = buildTimelineClips(defaultFrames, voiceMap);

    // Enable both newPlateDepthMaps and classic1950sLeader
    const customized = applyCutOptionsToProject(neoDefault, {
      newPlateDepthMaps: true,
      classic1950sLeader: true,
    });
    const customFrames = buildKeyframes(customized.story);
    const customLayout = buildTimelineClips(customFrames, voiceMap);

    // Exact frame alignment preserved across the entire film!
    expect(customLayout.totalFrames).toBe(defaultLayout.totalFrames);
    for (let i = 0; i < defaultLayout.clips.length; i += 1) {
      expect(customLayout.clips[i].startFrame).toBe(defaultLayout.clips[i].startFrame);
      expect(customLayout.clips[i].durationFrames).toBe(defaultLayout.clips[i].durationFrames);
    }

    // Verify crest leader swap on nw_logo
    const logoFrame = customFrames.find((f) => f.sceneId === "nw_logo");
    expect(logoFrame?.picture).toBe(CLASSIC_1950S_CREST_LEADER_PATH);
    expect(logoFrame?.beat.videoUrl).toBeUndefined();

    // Verify all 9 new plates have depthMap + non-zero depthAmount and stay within safe picture bounds
    for (const [beatId, expectedDepthPath] of Object.entries(NEW_PLATE_DEPTH_MAP_BY_BEAT_ID)) {
      const kf = customFrames.find((f) => f.beat.id === beatId);
      expect(kf).toBeDefined();
      expect(kf?.beat.cinematic?.depthMap).toBe(expectedDepthPath);
      const clip = customLayout.clips.find((c) => c.keyframe.id === kf?.id)!;
      const startPose = evaluate(kf!, 0);
      const endPose = evaluate(kf!, Math.max(0, clip.durationFrames - 1));
      expect(Math.max(startPose.depthAmount, endPose.depthAmount)).toBeGreaterThan(0);
      expect(clampPoseToPictureEdges(startPose).clamped).toBe(false);
      expect(clampPoseToPictureEdges(endPose).clamped).toBe(false);
    }

    // Toggling both options off restores original state cleanly
    const restored = applyCutOptionsToProject(customized, {
      newPlateDepthMaps: false,
      classic1950sLeader: false,
    });
    const restoredFrames = buildKeyframes(restored.story);
    const restoredLogo = restoredFrames.find((f) => f.sceneId === "nw_logo");
    expect(restoredLogo?.picture).toBe("video:/film/video/scarlet-reel-logo.mp4");
    for (const beatId of Object.keys(NEW_PLATE_DEPTH_MAP_BY_BEAT_ID)) {
      const kf = restoredFrames.find((f) => f.beat.id === beatId);
      expect(kf?.beat.cinematic?.depthMap).toBeUndefined();
    }
  });

  it("renders selectable aspect framing (2.35:1, 1.37:1 Academy pillarboxing, 16:9) and Instant Cut-Compare UI without CSS transitions", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    const noir50s = switchDirectorsCutWithState(
      baseProject,
      "noir-1950s",
      voiceMap,
      musicMap,
    );
    const frames = buildKeyframes(noir50s.story);
    const { clips, totalFrames } = buildTimelineClips(frames, voiceMap);
    const resolvedCaps = resolveTimelineCaptions(clips);
    const sampleClip = clips.find((c) => c.keyframe.text && c.keyframe.text.trim().length > 0) ?? clips[5];
    const sampleFrame = sampleClip.startFrame + 2;
    const activeCap = activeTimelineCaptionAtFrame(resolvedCaps, sampleFrame);

    const academyHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={sampleClip.keyframe}
        localFrame={2}
        presetFrame={2}
        shotKeyId={sampleClip.keyframe.id}
        clipDurationFrames={sampleClip.durationFrames}
        playheadFrame={sampleFrame}
        totalFrames={totalFrames}
        captionStyle={DEFAULT_CAPTION_STYLE}
        activeTimelineCaption={activeCap}
        imageSrc={sampleClip.keyframe.picture}
        resolveMedia={(ref) => ref}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
        showTimecodeOverlay={true}
        aspectFraming="1.37:1"
        compareActive={true}
        compareLabel="COMPARE · NEO-NOIR"
        compareTargetId="neo-noir"
        onToggleCompare={() => {}}
        onChangeCompareTarget={() => {}}
      />,
    );

    expect(academyHtml).toContain('data-testid="viewer-pillarbox-left"');
    expect(academyHtml).toContain('data-testid="viewer-pillarbox-right"');
    expect(academyHtml).toContain('data-aspect-framing="1.37:1"');
    expect(academyHtml).toContain('data-testid="viewer-compare-btn"');
    expect(academyHtml).toContain('data-testid="viewer-compare-target"');
    expect(academyHtml).toContain('data-testid="viewer-compare-badge"');
    expect(academyHtml).toContain("COMPARE · NEO-NOIR");
    expect(academyHtml).not.toContain('class="cin-letterbox cin-letterbox-top"');

    const openHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={sampleClip.keyframe}
        localFrame={2}
        presetFrame={2}
        shotKeyId={sampleClip.keyframe.id}
        clipDurationFrames={sampleClip.durationFrames}
        playheadFrame={sampleFrame}
        totalFrames={totalFrames}
        captionStyle={DEFAULT_CAPTION_STYLE}
        activeTimelineCaption={activeCap}
        imageSrc={sampleClip.keyframe.picture}
        resolveMedia={(ref) => ref}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
        aspectFraming="16:9"
      />,
    );
    expect(openHtml).toContain('data-aspect-framing="16:9"');
    expect(openHtml).not.toContain('data-testid="viewer-pillarbox-left"');
    expect(openHtml).not.toContain('class="cin-letterbox cin-letterbox-top"');
  });

  it("supports optical-print EQ toggle, -16 / -14 LUFS loudness mastering, and embedded FFMETADATA1 MP4 chapters", () => {
    expect(webAudioEngine.isOpticalPrintEqEnabled).toBe(false);
    webAudioEngine.setOpticalPrintEq(true);
    expect(webAudioEngine.isOpticalPrintEqEnabled).toBe(true);
    webAudioEngine.setOpticalPrintEq(false);
    expect(webAudioEngine.isOpticalPrintEqEnabled).toBe(false);

    // Synthesize a steady 440 Hz stereo test tone at -24 dBFS for 1 second (48 kHz)
    const sr = 48000;
    const makeTone = () => {
      const l = new Float32Array(sr);
      const r = new Float32Array(sr);
      for (let i = 0; i < sr; i += 1) {
        const s = 0.063 * Math.sin((2 * Math.PI * 440 * i) / sr);
        l[i] = s;
        r[i] = s;
      }
      return { l, r };
    };

    const tone16 = makeTone();
    const res16 = normalizeStereoLoudnessInPlace(tone16.l, tone16.r, sr, {
      targetLufs: -16,
      ceilingDb: -1.5,
    });
    const tone14 = makeTone();
    const res14 = normalizeStereoLoudnessInPlace(tone14.l, tone14.r, sr, {
      targetLufs: -14,
      ceilingDb: -1.0,
    });
    expect(res14.appliedGainDb - res16.appliedGainDb).toBeCloseTo(2.0, 1);

    // Verify FFMETADATA1 chapter generation on Creative Cut
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    const creative = switchDirectorsCutWithState(
      baseProject,
      "creative",
      voiceMap,
      musicMap,
    );
    const creativeFrames = buildKeyframes(creative.story);
    const { clips, totalFrames } = buildTimelineClips(creativeFrames, voiceMap);
    const ffmeta = buildMp4FfmetadataChapters(
      clips,
      creative.story.markers,
      0,
      totalFrames - 1,
    );
    expect(ffmeta.startsWith(";FFMETADATA1\n")).toBe(true);
    expect(ffmeta).toContain("[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\n");
    expect(ffmeta).toContain("title=PART I · The Torn Strap");
    expect(ffmeta).toContain("title=PART IV · Black Glass");
    expect(ffmeta).not.toContain("SHOT 01");

    // Verify ExportModal exposes selectable loudness, optical EQ, and MP4 chapters
    const modalHtml = renderToStaticMarkup(
      <ExportModal
        project={creative}
        frames={creativeFrames}
        clips={clips}
        totalFrames={totalFrames}
        playheadFrame={0}
        selectedClip={clips[0]}
        inPointFrame={null}
        outPointFrame={null}
        tab="mp4"
        setTab={() => {}}
        progress={0}
        message=""
        patchReport={null}
        mp4Message=""
        rangeStart={0}
        rangeEnd={null}
        setRangeStart={() => {}}
        setRangeEnd={() => {}}
        wholeFilm={true}
        setWholeFilm={() => {}}
        fromFrame={0}
        toFrame={totalFrames - 1}
        setFromFrame={() => {}}
        setToFrame={() => {}}
        captions={true}
        srt={true}
        marks={false}
        quality="master"
        workers={2}
        loudnessTarget="-16"
        opticalPrintEq={true}
        embedChapters={true}
        setCaptions={() => {}}
        setSrt={() => {}}
        setMarks={() => {}}
        setQuality={() => {}}
        setWorkers={() => {}}
        setLoudnessTarget={() => {}}
        setOpticalPrintEq={() => {}}
        setEmbedChapters={() => {}}
        mp4Job={null}
        onBundle={() => {}}
        onPatch={() => {}}
        onSrt={() => {}}
        onVtt={() => {}}
        onMp4={() => {}}
        onCancelMp4={() => {}}
        onClose={() => {}}
        onRestoreSnapshot={() => {}}
      />,
    );
    expect(modalHtml).toContain('data-testid="export-loudness-select"');
    expect(modalHtml).toContain('data-testid="export-opt-optical-eq"');
    expect(modalHtml).toContain('data-testid="export-opt-chapters"');
    expect(modalHtml).toContain("--loudnorm -16");
    expect(modalHtml).toContain("--optical-eq");
    expect(modalHtml).toContain("--chapters");
  });

  it("stashes and restores custom edits per cut when preservePerCutEdits is enabled, and supports factory reset", () => {
    const { baseProject, voiceMap, musicMap } = buildBaseProjectFixture();
    let neo = switchDirectorsCutWithState(baseProject, "neo-noir", voiceMap, musicMap);
    neo = applyCutOptionsToProject(neo, { preservePerCutEdits: true });

    const firstId = buildKeyframes(neo.story)[5].id;
    neo = setBeatField(neo, firstId, "notes", "Custom director note on Neo-Noir");
    expect(buildKeyframes(neo.story)[5].beat.notes).toBe("Custom director note on Neo-Noir");

    // Switch to 1950s Noir -> Neo-Noir custom edit is stashed in savedCutStates["neo-noir"]
    const noir50s = switchDirectorsCutWithState(neo, "noir-1950s", voiceMap, musicMap);
    expect(noir50s.directorsCutId).toBe("noir-1950s");
    expect(noir50s.savedCutStates?.["neo-noir"]).toBeDefined();

    // Switch back to Neo-Noir -> custom note is restored!
    const restoredNeo = switchDirectorsCutWithState(noir50s, "neo-noir", voiceMap, musicMap);
    expect(restoredNeo.directorsCutId).toBe("neo-noir");
    expect(buildKeyframes(restoredNeo.story)[5].beat.notes).toBe(
      "Custom director note on Neo-Noir",
    );

    // Factory reset rebuilds active cut cleanly without the custom note
    const resetNeo = switchDirectorsCutWithState(
      restoredNeo,
      "neo-noir",
      voiceMap,
      musicMap,
      { forceRebuild: true },
    );
    expect(buildKeyframes(resetNeo.story)[5].beat.notes).not.toBe(
      "Custom director note on Neo-Noir",
    );
  });
});
