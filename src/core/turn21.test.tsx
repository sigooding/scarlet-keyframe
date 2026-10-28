import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import { Topbar } from "../components/Topbar";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  evaluate,
} from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
import { activeTimelineCaptionAtFrame, resolveTimelineCaptions } from "./captions";
import {
  buildDirectorsCutById,
  buildDirectorsCutProject,
  DIRECTORS_CUT_OPTIONS,
  getDirectorsCutLabel,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  runningOrderDiagnostics,
  runningSceneIds,
} from "./model";
import { extractKnownMusicDurations, resolveMusicSpans } from "./previewAudio";

function buildBaseProjectFixture() {
  const voiceMap = new Map(
    Object.entries(bundledAudioDurations as Record<string, number>),
  );
  const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
    voiceDurations: voiceMap,
  });
  const baseProj = createProjectState(
    { ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) },
    [],
    bundledEdits,
  );
  const musicMap = extractKnownMusicDurations(bundledEdits);
  return { baseProj, voiceMap, musicMap };
}

describe("Turn 21 — Multi-Cut Director's Cuts (Creative, 1950s Noir, Neo-Noir, Uncut) & Dropdown", () => {
  it("keeps Neo-Noir Director's Cut bit-for-bit intact across round-trip cut switches", () => {
    const { baseProj, voiceMap, musicMap } = buildBaseProjectFixture();
    const neoBaseline = buildDirectorsCutProject(baseProj, voiceMap, musicMap);
    expect(neoBaseline.directorsCutId).toBe("neo-noir");

    // Round-trip: Neo-Noir -> Creative -> 1950s Noir -> Uncut -> Neo-Noir
    const creative = buildDirectorsCutById(neoBaseline, "creative", voiceMap, musicMap);
    const noir50s = buildDirectorsCutById(creative, "noir-1950s", voiceMap, musicMap);
    const uncut = buildDirectorsCutById(noir50s, "uncut", voiceMap, musicMap);
    const neoAfterRoundTrip = buildDirectorsCutById(uncut, "neo-noir", voiceMap, musicMap);

    expect(creative.directorsCutId).toBe("creative");
    expect(noir50s.directorsCutId).toBe("noir-1950s");
    expect(uncut.directorsCutId).toBe("uncut");
    expect(neoAfterRoundTrip.directorsCutId).toBe("neo-noir");

    // Uncut restores all 1,584 original beats
    expect(buildKeyframes(uncut.story).length).toBe(1584);

    // Neo-Noir after round-trip matches fresh baseline story & audioClips 100%
    expect(neoAfterRoundTrip.story).toEqual(neoBaseline.story);
    expect(neoAfterRoundTrip.audioClips).toEqual(neoBaseline.audioClips);
  });

  it("authors a cohesive Creative Director's Cut with memory cold-open, 5 chapters, sodium-amber grade, and deep pre-laps", () => {
    const { baseProj, voiceMap, musicMap } = buildBaseProjectFixture();
    const origTextByKey = new Map<string, string>();
    for (const sc of baseProj.originalStory.scenes) {
      for (const b of sc.dialogueBeats ?? []) {
        origTextByKey.set(`${sc.id}::${b.id}`, String(b.text ?? ""));
      }
    }

    const creative = buildDirectorsCutById(baseProj, "creative", voiceMap, musicMap);

    // Running order reaches all 256 scenes with 0 warnings
    const orderedIds = runningSceneIds(creative.story);
    expect(orderedIds.length).toBe(256);
    expect(runningOrderDiagnostics(creative.story).length).toBe(0);

    // Memory-framed cold open: nw_logo -> nw_prologue -> nw_s1 -> nw_s2 -> nw_title -> nw_s3
    expect(orderedIds.slice(0, 7)).toEqual([
      "nw_intro",
      "nw_logo",
      "nw_prologue",
      "nw_s1",
      "nw_s2",
      "nw_title",
      "nw_s3",
    ]);

    const frames = buildKeyframes(creative.story);
    const { clips, totalFrames } = buildTimelineClips(frames, voiceMap);
    expect(clips.length).toBeGreaterThanOrEqual(690);

    // Zero missing gaps and zero beat.text mutations
    expect(frames.filter((f) => Boolean(f.beat.gap)).length).toBe(0);
    for (const f of frames) {
      const key = `${f.sceneId}::${f.id}`;
      if (origTextByKey.has(key)) {
        expect(String(f.beat.text ?? "")).toBe(origTextByKey.get(key));
      }
    }

    // All 5 chapter intertitles (lower-left) + 5 chapter ruler markers + 9 shot markers
    const chapterMarkers = (creative.story.markers || []).filter((m) =>
      m.id.startsWith("marker-chapter-"),
    );
    const gapMarkers = (creative.story.markers || []).filter((m) =>
      m.id.startsWith("marker-gap-"),
    );
    expect(chapterMarkers.length).toBe(5);
    expect(gapMarkers.length).toBe(8);

    for (const scId of ["nw_s3", "nw_s30", "nw_s61", "nw_s77a", "nw_s98"]) {
      const firstSceneFrame = frames.find((f) => f.sceneId === scId)!;
      const tc = (firstSceneFrame.beat as Record<string, any>).titleCard;
      expect(tc).toBeTruthy();
      expect(tc.align).toBe("lower-left");
      expect(String(tc.kicker)).toContain("PART ");
    }

    // Consistent sodium-amber grade, motes <= 0.35, and zero picture-edge border clamping
    for (const clip of clips) {
      const f = clip.keyframe;
      if (f.sceneId !== "nw_intro" && f.sceneId !== "nw_logo") {
        expect(f.beat.cinematic?.colorGrade).toBe("sodium-amber");
      }
      if ((f.beat.particles ?? f.scene.particles) === "motes") {
        const effOp = f.beat.particleConfig?.opacity ?? f.scene.particleConfig?.opacity;
        expect(effOp).toBeCloseTo(0.35, 3);
      }
      for (const lf of [0, Math.floor(clip.durationFrames / 2), clip.durationFrames - 1]) {
        const pose = evaluate(f, Math.max(0, lf));
        expect(clampPoseToPictureEdges(pose).clamped).toBe(false);
      }
    }

    // Deep -360 ms pre-lap J-cuts with zero voice overlap and valid music spans
    const resolvedAudio = resolveAudioClips(creative.audioClips || [], clips);
    const voices = resolvedAudio
      .filter((c) => c.lane === "voice")
      .sort((a, b) => a.startMs - b.startMs);
    expect(voices.filter((v) => v.offsetMs <= -350).length).toBeGreaterThanOrEqual(40);
    for (let i = 1; i < voices.length; i += 1) {
      expect(voices[i].startMs).toBeGreaterThanOrEqual(voices[i - 1].endMs - 0.01);
    }
    expect(resolveMusicSpans(clips, totalFrames, musicMap).length).toBeGreaterThan(10);
  });

  it("authors an authentic 1950s Noir Director's Cut in 100% silver-gelatin monochrome with classical pacing & sparse sound", () => {
    const { baseProj, voiceMap, musicMap } = buildBaseProjectFixture();
    const neo = buildDirectorsCutById(baseProj, "neo-noir", voiceMap, musicMap);
    const creative = buildDirectorsCutById(baseProj, "creative", voiceMap, musicMap);
    const noir50s = buildDirectorsCutById(baseProj, "noir-1950s", voiceMap, musicMap);

    expect(runningSceneIds(noir50s.story).length).toBe(256);
    expect(runningOrderDiagnostics(noir50s.story).length).toBe(0);

    const neoClips = buildTimelineClips(buildKeyframes(neo.story), voiceMap);
    const creativeClips = buildTimelineClips(buildKeyframes(creative.story), voiceMap);
    const noirFrames = buildKeyframes(noir50s.story);
    const noirClips = buildTimelineClips(noirFrames, voiceMap);

    // 1950s Noir has more deliberate, unhurried classical runtime than Neo-Noir and Creative
    expect(noirClips.totalFrames).toBeGreaterThan(neoClips.totalFrames);
    expect(neoClips.totalFrames).toBeGreaterThan(creativeClips.totalFrames);

    let stillCount = 0;
    for (const clip of noirClips.clips) {
      const f = clip.keyframe;
      const cin = (f.beat.cinematic || {}) as Record<string, unknown>;
      // 100% silver-gelatin B&W across ALL shots including nw_intro & nw_logo video leaders!
      expect(cin.colorGrade).toBe("noir-1950s");
      expect(cin.speedRamp).toBeUndefined();
      expect(cin.lights).toBeUndefined();
      expect(cin.lightSource).toBeUndefined();
      expect(cin.lightColor).toBeUndefined();
      expect(cin.lensFlare).toBeUndefined();
      expect(cin.flares).toBeUndefined();

      const p0 = evaluate(f, 0);
      const p1 = evaluate(f, Math.max(0, clip.durationFrames - 1));
      expect(p0.gradeStrength).toBe(1);
      expect(clampPoseToPictureEdges(p0).clamped).toBe(false);
      expect(clampPoseToPictureEdges(p1).clamped).toBe(false);

      if (!f.beat.animation?.zoom?.length) {
        stillCount += 1;
      }
    }

    // Classical 1950s studio tripod restraint (~75%+ composed still frames)
    expect(stillCount / noirClips.clips.length).toBeGreaterThan(0.72);

    // Restrained, atmospheric 1950s sound mix
    const resolvedAudio = resolveAudioClips(noir50s.audioClips || [], noirClips.clips);
    const musicCues = resolvedAudio.filter(
      (c) =>
        c.lane === "music" &&
        !c.src.includes("black-cove") &&
        !c.src.includes("scarlet-reel-logo"),
    );
    const ambCues = resolvedAudio.filter((c) => c.lane === "ambience");
    const sfxCues = resolvedAudio.filter((c) => c.lane === "sfx");
    const voices = resolvedAudio
      .filter((c) => c.lane === "voice")
      .sort((a, b) => a.startMs - b.startMs);

    for (const m of musicCues) expect(m.gain).toBeLessThanOrEqual(0.4001);
    for (const a of ambCues) expect(a.gain).toBeLessThanOrEqual(0.2601);
    for (const s of sfxCues) expect(s.gain).toBeLessThanOrEqual(0.4801);
    // No aggressive modern J-cuts in 1950s Noir (max 80 ms gentle breath softening)
    expect(voices.filter((v) => v.offsetMs < -100).length).toBe(0);
    for (let i = 1; i < voices.length; i += 1) {
      expect(voices[i].startMs).toBeGreaterThanOrEqual(voices[i - 1].endMs - 0.01);
    }
  });

  it("renders viewer grades, monochrome video/captions/titles, and Topbar dropdown cleanly", () => {
    const { baseProj, voiceMap, musicMap } = buildBaseProjectFixture();
    const noir50s = buildDirectorsCutById(baseProj, "noir-1950s", voiceMap, musicMap);
    const frames = buildKeyframes(noir50s.story);
    const { clips, totalFrames } = buildTimelineClips(frames, voiceMap);
    const captions = resolveTimelineCaptions(clips);

    // 1. Studio video leader in 1950s Noir renders with cin-grade-noir-1950s
    const logoClip = clips.find((c) => c.keyframe.sceneId === "nw_logo")!;
    const logoHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={logoClip.keyframe}
        localFrame={10}
        clipDurationFrames={logoClip.durationFrames}
        playheadFrame={logoClip.startFrame + 10}
        totalFrames={totalFrames}
        resolveMedia={(v) => v}
        captionStyle={noir50s.story.captionStyle}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(logoHtml).toContain("cin-preview-video cin-grade-noir-1950s");

    // 2. Monochrome title card & monochrome speaker subtitle in Scene 77A
    const endClip = clips.find((c) => c.keyframe.sceneId === "nw_end")!;
    const endHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={endClip.keyframe}
        localFrame={30}
        clipDurationFrames={endClip.durationFrames}
        playheadFrame={endClip.startFrame + 30}
        totalFrames={totalFrames}
        imageSrc="/film/img/s1/377-the-hive-remembered.jpg"
        resolveMedia={(v) => v}
        captionStyle={noir50s.story.captionStyle}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(endHtml).toContain("cin-grade-noir-1950s");
    expect(endHtml).toContain("cin-title-card is-center is-monochrome");
    expect(endHtml).toContain("THE END");

    const kuroseClip = clips.find((c) => c.keyframe.id === "nw_b1296")!;
    const activeCap = activeTimelineCaptionAtFrame(captions, kuroseClip.startFrame + 20) ?? null;
    const kuroseHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={kuroseClip.keyframe}
        localFrame={20}
        clipDurationFrames={kuroseClip.durationFrames}
        playheadFrame={kuroseClip.startFrame + 20}
        totalFrames={totalFrames}
        imageSrc="/film/img/s77a/1296-everyone-is-allowed-one.jpg"
        resolveMedia={(v) => v}
        captionStyle={noir50s.story.captionStyle}
        activeTimelineCaption={activeCap}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(kuroseHtml).toContain("cin-caption pos-bottom has-letterbox size-s no-box is-monochrome");
    expect(kuroseHtml).toContain("KUROSE");

    // 3. Topbar renders clearly named cut selector trigger for each option
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toEqual([
      "neo-noir",
      "creative",
      "noir-1950s",
      "uncut",
    ]);
    for (const opt of DIRECTORS_CUT_OPTIONS) {
      const tbHtml = renderToStaticMarkup(
        <Topbar
          project={noir50s}
          saveStatus="SAVED"
          historyVersion={1}
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
          editLabel={getDirectorsCutLabel(opt.id).toUpperCase()}
          totalDuration={3300}
          activeCutId={opt.id}
          onSelectDirectorsCut={() => {}}
        />,
      );
      expect(tbHtml).toContain('data-testid="topbar-directors-cut-btn"');
      expect(tbHtml).toContain(opt.label);
    }
  });
});
