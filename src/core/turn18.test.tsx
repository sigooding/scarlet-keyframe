import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import { Topbar } from "../components/Topbar";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledMediaIndex from "../data/media-index.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  evaluate,
  remapLocalFrameWithSpeedRamp,
  remapSpeedRampProgress,
  SPEED_RAMP_KINDS,
} from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { resolveTimelineCaptions } from "./captions";
import {
  buildDirectorsCutProject,
  DIRECTORS_CUT_VERSION,
  MISSING_FRAME_SPECS,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  runningSceneIds,
} from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

describe("Turn 18 — Speed ramps, Tokyo-Noir viewer engine, and Full-Film Director's Cut", () => {
  it("evaluates deterministic speed-ramp curves monotonically in [0, 1] without internal state", () => {
    for (const kind of SPEED_RAMP_KINDS) {
      expect(remapSpeedRampProgress(0, kind)).toBe(0);
      expect(remapSpeedRampProgress(1, kind)).toBe(1);
      let prev = 0;
      for (let step = 1; step <= 40; step += 1) {
        const u = step / 40;
        const mapped = remapSpeedRampProgress(u, kind);
        expect(mapped).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(mapped).toBeLessThanOrEqual(1);
        // Calling twice with the same inputs produces identical output
        expect(remapSpeedRampProgress(u, kind)).toBe(mapped);
        prev = mapped;
      }
    }

    // "slow-out" eases gently out of stillness; "impact-ramp" surges early then suspends
    expect(remapLocalFrameWithSpeedRamp(20, 100, "slow-out")).toBeLessThan(8);
    expect(remapLocalFrameWithSpeedRamp(45, 100, "impact-ramp")).toBeGreaterThan(70);
    expect(remapLocalFrameWithSpeedRamp(99, 100, "slow-out")).toBeCloseTo(99, 6);
  });

  it("renders Tokyo-Noir grade, optical vignette, title cards, and letterbox captions with zero viewer CSS transitions", () => {
    const voiceMap = new Map(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
      voiceDurations: voiceMap,
    });
    const baseProj = createProjectState(
      { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits as any) },
      [],
      bundledEdits as any,
    );
    const dcProj = buildDirectorsCutProject(baseProj, voiceMap);
    const dcFrames = buildKeyframes(dcProj.story);

    const titleFrame = dcFrames.find(
      (f) => f.sceneId === "nw_title" && Boolean((f.beat as any).titleCard),
    );
    expect(titleFrame).toBeDefined();

    const html = renderToStaticMarkup(
      <CinematicPreview
        frame={titleFrame!}
        localFrame={24}
        clipDurationFrames={108}
        playheadFrame={900}
        totalFrames={109633}
        imageSrc="/film/img/s1/01-backstreet.jpg"
        resolveMedia={(v) => v}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );

    expect(html).toContain("cin-grade-tokyo-noir");
    expect(html).toContain('data-testid="frame-vignette-overlay"');
    expect(html).toContain('data-testid="viewer-title-card"');
    expect(html).toContain("NOBODY’S WITNESS");

    // Verify motes scenes render at 35% opacity and subtitles sit in the black letterbox bar with no grey box
    const motesSpokenFrame = dcFrames.find(
      (f) =>
        (f.beat.particles ?? f.scene.particles) === "motes" &&
        Boolean(f.beat.audioUrl) &&
        Boolean(f.scene.letterbox),
    );
    expect(motesSpokenFrame).toBeDefined();
    expect(
      (motesSpokenFrame!.beat.particleConfig ?? motesSpokenFrame!.scene.particleConfig)
        ?.opacity,
    ).toBe(0.35);

    const motesHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={motesSpokenFrame!}
        localFrame={4}
        clipDurationFrames={96}
        playheadFrame={1200}
        totalFrames={109661}
        captionStyle={dcProj.story.captionStyle}
        imageSrc="/film/img/s4/36-vera-at-the-table.jpg"
        resolveMedia={(v) => v}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(motesHtml).toContain('data-particle-kind="motes"');
    expect(motesHtml).toContain('data-particle-strength="0.35"');
    expect(motesHtml).toContain("cin-caption pos-bottom has-letterbox size-s no-box");

    // Verify Topbar exposes the undoable Director's Cut button for Nobody's Witness
    const topbarHtml = renderToStaticMarkup(
      <Topbar
        project={dcProj}
        saveStatus="DIRECTOR’S CUT"
        historyVersion={0}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onImport={() => {}}
        onLinkFolder={() => {}}
        folderLabel=""
        onSnapshot={() => {}}
        onExport={() => {}}
        onSave={() => {}}
        missingCount={0}
        onMissing={() => {}}
        editLabel="Ready"
        totalDuration={4568}
        onApplyDirectorsCut={() => {}}
      />,
    );
    expect(topbarHtml).toContain('data-testid="topbar-directors-cut-btn"');

    // Enforce standing viewer rule: newly added .cin-title-card / .cin-grade-tokyo-noir CSS rules contain no animations or transitions
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const noirIdx = css.indexOf(".cin-grade-tokyo-noir");
    expect(noirIdx).toBeGreaterThan(0);
    const tailCss = css.slice(noirIdx);
    expect(tailCss).toContain("transition: none !important;");
    expect(tailCss).toContain("animation: none !important;");
  });

  it("crafts the complete Neo-Noir / Tokyo Story Director's Cut across all 256 scenes while keeping beat.text untouched", () => {
    const voiceMap = new Map(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const musicMap = extractKnownMusicDurations(bundledEdits as any);
    voiceMap.forEach((v, k) => {
      if (!musicMap.has(k)) musicMap.set(k, v);
    });

    const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
      voiceDurations: voiceMap,
    });
    const baseProj = createProjectState(
      { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits as any) },
      [],
      bundledEdits as any,
    );

    const dcProj = buildDirectorsCutProject(baseProj, voiceMap, musicMap);
    expect(dcProj.directorsCutVersion).toBe(DIRECTORS_CUT_VERSION);

    // 1. Preserves Uncut Original Import snapshot + untouched originalStory
    expect(
      dcProj.snapshots.some((s) => s.id === "snapshot-uncut-original-import"),
    ).toBe(true);

    // 2. Preserves all 256 ordered scenes, including the 7 restored zero-beat scenes
    const ordered = runningSceneIds(dcProj.story);
    expect(ordered.length).toBe(256);
    expect(ordered[0]).toBe("nw_intro");
    expect(ordered[ordered.length - 1]).toBe("nw_end");
    const dcFrames = buildKeyframes(dcProj.story);
    for (const restoredSceneId of [
      "nw_intro",
      "nw_logo",
      "nw_title",
      "nw_m18",
      "nw_m53",
      "nw_credits",
      "nw_end",
    ]) {
      expect(dcFrames.some((f) => f.sceneId === restoredSceneId)).toBe(true);
    }

    // 3. Consolidates stuttery identical-plate beats (1,584 -> ~690 shots) & tightens runtime (~76 min)
    const { clips, totalFrames } = buildTimelineClips(dcFrames, voiceMap);
    expect(clips.length).toBeGreaterThan(550);
    expect(clips.length).toBeLessThan(760);
    const runtimeMinutes = totalFrames / 24 / 60;
    expect(runtimeMinutes).toBeGreaterThan(68);
    expect(runtimeMinutes).toBeLessThan(85);

    // 4. Leaves beat.text 100% untouched on every surviving original beat
    const origTextBySceneAndBeat = new Map<string, string>();
    for (const sc of baseProj.originalStory.scenes) {
      for (const b of sc.dialogueBeats || []) {
        if (b.id) {
          origTextBySceneAndBeat.set(`${sc.id}::${b.id}`, String(b.text || ""));
        }
      }
    }
    for (const f of dcFrames) {
      const key = `${f.sceneId}::${f.beat.id || ""}`;
      if (origTextBySceneAndBeat.has(key)) {
        expect(String(f.beat.text || "")).toBe(origTextBySceneAndBeat.get(key));
      }
    }

    // 5. Preserves 100% of spoken voice clips (560) with zero overlaps, millisecond J-cuts, and sound bridges
    const resolvedAudio = resolveAudioClips(dcProj.audioClips || [], clips);
    const voices = resolvedAudio
      .filter((a) => a.lane === "voice")
      .sort((a, b) => a.startMs - b.startMs);
    expect(voices.length).toBe(560);
    for (let i = 1; i < voices.length; i += 1) {
      expect(voices[i].startMs).toBeGreaterThanOrEqual(voices[i - 1].endMs - 5);
    }
    expect(voices.filter((v) => v.offsetMs < -50).length).toBeGreaterThan(40);
    expect(
      resolvedAudio.filter((a) => a.lane === "ambience" && a.offsetMs < -50).length,
    ).toBeGreaterThan(50);

    // 6. Eliminates redundant silent stage-direction captions while preserving Kurose/Jack & written clues
    const resolvedCaptions = resolveTimelineCaptions(clips);
    expect(resolvedCaptions.length).toBeGreaterThanOrEqual(566);
    expect(resolvedCaptions.length).toBeLessThan(590);
    expect(
      resolvedCaptions.some((c) => c.text.includes("Everyone is allowed one.")),
    ).toBe(true);
    expect(resolvedCaptions.some((c) => c.text.includes("DANIEL VOSS"))).toBe(true);

    // 7. Consistent "tokyo-noir" grade across 100% of non-gap narrative/montage shots + edge-safe cameras
    const gradedFilmClips = clips.filter(
      (c) =>
        !c.keyframe.beat.gap &&
        c.keyframe.sceneId !== "nw_intro" &&
        c.keyframe.sceneId !== "nw_logo",
    );
    expect(
      gradedFilmClips.every(
        (c) => c.keyframe.beat.cinematic?.colorGrade === "tokyo-noir",
      ),
    ).toBe(true);

    // Verify ALL 681 graded film shots stay strictly within picture borders at start and end!
    for (const c of gradedFilmClips) {
      const startPose = evaluate(c.keyframe, 0);
      const endPose = evaluate(c.keyframe, Math.max(0, c.durationFrames - 1));
      expect(clampPoseToPictureEdges(startPose).clamped).toBe(false);
      expect(clampPoseToPictureEdges(endPose).clamped).toBe(false);
    }

    // 8. Wires all 9 newly generated plates into the Director's Cut (zero remaining gap/gradient placeholders!)
    const gapClips = clips.filter(
      (c) =>
        Boolean(c.keyframe.beat.gap) ||
        String(c.keyframe.beat.background || "").startsWith("gradient:"),
    );
    expect(gapClips.length).toBe(0);
    expect(MISSING_FRAME_SPECS.length).toBe(9);
    const mediaSet = new Set(bundledMediaIndex as string[]);
    for (const spec of MISSING_FRAME_SPECS) {
      const match = clips.find((c) => c.keyframe.id === spec.beatId);
      expect(match).toBeDefined();
      expect(match!.durationFrames).toBe(spec.durationFrames);
      expect(match!.keyframe.beat.gap).toBeFalsy();
      expect(match!.keyframe.beat.background).toBe(spec.suggestedPath);
      expect(match!.keyframe.beat.cinematic?.colorGrade).toBe("tokyo-noir");
      expect(mediaSet.has(spec.suggestedPath)).toBe(true);
      expect(
        existsSync(resolve(process.cwd(), "public", spec.suggestedPath.replace(/^\//, ""))),
      ).toBe(true);
      const marker = dcProj.story.markers?.find((m) => m.frame === match!.startFrame);
      expect(marker).toBeDefined();
    }
  });
});
