import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import rawFilmJson from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  DIRECTORS_CUT_OPTIONS,
  buildDirectorsCutById,
  buildDirectorsCutProject,
  getDirectorsCutLabel,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  type Keyframe,
  type ProjectState,
} from "./model";
import { buildTimelineClips, clampPoseToPictureEdges, evaluate } from "../sequence/animate";
import { resolveAudioClips, type ResolvedAudioClip } from "./audioClips";
import { extractKnownMusicDurations } from "./previewAudio";
import { CinematicPreview } from "../components/CinematicPreview";

function makeBaseProject(): {
  baseProject: ProjectState;
  voiceMap: Map<string, number>;
  musicMap: Map<string, number>;
} {
  const voiceMap = new Map<string, number>(
    Object.entries(bundledAudioDurations as Record<string, number>),
  );
  const imported = parseImportPayload(rawFilmJson, "nobodys-witness-film.json", {
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

describe("Turn 32–33 — 1940s Noir Director's Cut (original running order, silver-print monochrome & five reels)", () => {
  it("registers 'noir-1940s' in DIRECTORS_CUT_OPTIONS without mutating Neo-Noir, Creative, 1950s Noir, or Uncut", () => {
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toEqual([
      "neo-noir",
      "creative",
      "noir-1940s",
      "noir-1950s",
      "uncut",
    ]);
    expect(getDirectorsCutLabel("noir-1940s")).toBe("1940s Noir Director’s Cut");

    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const neoDefault = buildDirectorsCutProject(baseProject, voiceMap, musicMap);
    const neoById = buildDirectorsCutById(baseProject, "neo-noir", voiceMap, musicMap);
    const noir40s = buildDirectorsCutById(baseProject, "noir-1940s", voiceMap, musicMap);
    const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);

    expect(neoById.directorsCutId).toBe("neo-noir");
    expect(noir40s.directorsCutId).toBe("noir-1940s");
    expect(uncut.directorsCutId).toBe("uncut");

    const neoClips = buildTimelineClips(buildKeyframes(neoById.story), voiceMap).clips;
    const neoDefClips = buildTimelineClips(buildKeyframes(neoDefault.story), voiceMap).clips;
    expect(neoClips.length).toBe(703);
    expect(neoClips.length).toBe(neoDefClips.length);

    // 1940s Noir Cut keeps the original running order but splits multi-turn dialogue
    // plates into classical shot/reverse-shot coverage — more clips than Neo-Noir
    const c40Clips = buildTimelineClips(buildKeyframes(noir40s.story), voiceMap).clips;
    expect(c40Clips.length).toBeGreaterThan(neoClips.length);

    // Unknown/legacy saved cut ids fall back to the Neo-Noir baseline instead of crashing
    const legacy = buildDirectorsCutById(
      baseProject,
      "removed-cut" as unknown as "neo-noir",
      voiceMap,
      musicMap,
    );
    expect(legacy.directorsCutId).toBe("neo-noir");
  });

  it("preserves all 256 scenes, 35% motes, Scene 77A rain lock, static single-camera grammar, and zero edge clamping", () => {
    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const c40 = buildDirectorsCutById(baseProject, "noir-1940s", voiceMap, musicMap);
    expect(c40.story.scenes.length).toBe(256);

    const keyframes = buildKeyframes(c40.story);
    const { clips } = buildTimelineClips(keyframes, voiceMap);

    // Check 35% motes constraint wherever motes appear
    for (const sc of c40.story.scenes) {
      if ((sc as Record<string, any>).particles === "motes") {
        expect((sc as Record<string, any>).particleConfig?.opacity).toBe(0.35);
      }
      for (const beat of sc.dialogueBeats ?? []) {
        const effPart =
          (beat as Record<string, any>).particles ?? (sc as Record<string, any>).particles;
        if (
          effPart === "motes" &&
          ((beat as Record<string, any>).particles === "motes" ||
            (beat as Record<string, any>).particleConfig)
        ) {
          expect((beat as Record<string, any>).particleConfig?.opacity).toBe(0.35);
        }
      }
    }

    // Scene 77A strict rule: zero interior cabin light inside Kurose's sedan,
    // explicit wet-glass rain-on-lens active, uniform 1940s silver-print grade
    const s77aScene = c40.story.scenes.find((s) => s.id === "nw_s77a");
    expect(s77aScene).toBeDefined();
    for (const beat of s77aScene!.dialogueBeats ?? []) {
      const cin = (beat.cinematic || {}) as Record<string, any>;
      expect(cin.colorGrade).toBe("noir-1940s");
      expect(cin.lights).toBeUndefined();
      expect(cin.lensFlare).toBeUndefined();
      expect(cin.rainOnLens).toBe(true);
    }

    // Single-camera rule (mode === "static") and ZERO picture-edge clamping on every clip
    let dutchCantCount = 0;
    let lateralTrackCount = 0;
    let bigPushCount = 0;
    let stillCount = 0;
    let movingCount = 0;
    let crashExposureCount = 0;
    let whipPullOutCount = 0;
    let twoStepCount = 0;

    for (const clip of clips) {
      const beat = clip.keyframe.beat as Record<string, any>;
      expect((beat.cinematic as Record<string, any> | undefined)?.mode).toBe("static");

      const anim = beat.animation;
      if (anim?.zoom?.length) {
        movingCount += 1;
        const z0 = anim.zoom[0].value;
        const z1 = anim.zoom[anim.zoom.length - 1].value;
        if (z1 - z0 >= 0.25) bigPushCount += 1;
        if (z0 > z1 + 0.25) whipPullOutCount += 1;
      } else {
        stillCount += 1;
      }
      if (anim?.exposure?.length) crashExposureCount += 1;
      if (anim?.zoom?.length === 4) twoStepCount += 1;
      if (Math.abs(anim?.values?.rotation ?? 0) > 0.5) dutchCantCount += 1;
      if (anim?.x?.length === 2 && Math.abs(anim.x[1].value - anim.x[0].value) >= 6) {
        lateralTrackCount += 1;
      }

      const lastF = Math.max(0, clip.durationFrames - 1);
      const sampleFrames = [
        0,
        Math.floor(lastF * 0.15),
        Math.floor(lastF * 0.5),
        Math.floor(lastF * 0.85),
        lastF,
      ];
      for (const lf of sampleFrames) {
        const pose = evaluate(clip.keyframe, lf);
        const clamped = clampPoseToPictureEdges({
          zoom: pose.zoom,
          x: pose.x,
          y: pose.y,
          rotation: pose.rotation,
        });
        expect(clamped.clamped, `Clip ${clip.keyframe.id} clamped at f=${lf}`).toBe(false);
      }
    }

    // Classical 1940s restraint: deep-focus lock-offs dominate, slow dolly-ins & clue pushes,
    // canted Third Man-style tension angles, lateral dolly tracks — but zero grindhouse machinery
    expect(stillCount).toBeGreaterThanOrEqual(900);
    expect(movingCount).toBeGreaterThanOrEqual(150);
    expect(bigPushCount).toBeGreaterThanOrEqual(40);
    expect(dutchCantCount).toBeGreaterThanOrEqual(20);
    expect(lateralTrackCount).toBeGreaterThanOrEqual(15);
    expect(crashExposureCount).toBe(0);
    expect(whipPullOutCount).toBe(0);
    expect(twoStepCount).toBe(0);
  });

  it("activates noir-1940s silver-print monochrome, low-key fixtures, 5 reel intertitles, optical transitions & gentle J-cuts", () => {
    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const c40 = buildDirectorsCutById(baseProject, "noir-1940s", voiceMap, musicMap);
    const keyframes = buildKeyframes(c40.story);
    const { clips, totalFrames } = buildTimelineClips(keyframes, voiceMap);

    const lightingModes = new Set<string>();
    let shaftsCount = 0;
    let speedRampCount = 0;
    let coloredLightsCount = 0;

    for (const clip of clips) {
      const beat = clip.keyframe.beat as Record<string, any>;
      const cin = (beat.cinematic || {}) as Record<string, any>;

      // 100% high-contrast silver-print monochrome across every shot
      expect(cin.colorGrade).toBe("noir-1940s");
      // Period optics only — no speed ramps or colored light/flare bleed
      expect(cin.speedRamp).toBeUndefined();
      expect(cin.lights).toBeUndefined();
      expect(cin.lightSource).toBeUndefined();
      expect(cin.lightColor).toBeUndefined();
      expect(cin.lensFlare).toBeUndefined();
      expect(cin.flares).toBeUndefined();
      if (cin.speedRamp) speedRampCount += 1;
      if (Array.isArray(cin.lights) && cin.lights.length > 0) coloredLightsCount += 1;
      if (cin.volumetricShafts) shaftsCount += 1;
      if (typeof cin.hitchcockLighting === "string") {
        lightingModes.add(String(cin.hitchcockLighting));
      }

      const p0 = evaluate(clip.keyframe, 0);
      expect(p0.gradeStrength).toBe(1);
    }
    expect(speedRampCount).toBe(0);
    expect(coloredLightsCount).toBe(0);
    expect(shaftsCount).toBeGreaterThanOrEqual(500);
    // All four low-key carbon-arc fixtures active: venetian slats, key slash,
    // streetlamp rim & eye light
    expect(lightingModes).toEqual(
      new Set(["eye-light", "venetian-slats", "key-slash", "silhouette-rim"]),
    );

    // Five period reel intertitles + matching bone-silver timeline markers
    const reelMarkers = (c40.story.markers ?? []).filter((m) =>
      m.id.startsWith("marker-chapter-"),
    );
    expect(reelMarkers.length).toBe(5);
    expect(reelMarkers.every((m) => m.name.startsWith("REEL "))).toBe(true);
    expect(reelMarkers.every((m) => m.color === "#dcd2b8")).toBe(true);

    const reel2Frame = keyframes.find(
      (f: Keyframe) =>
        f.sceneId === "nw_s25" && Boolean((f.beat as any).titleCard),
    );
    expect(reel2Frame).toBeDefined();
    expect((reel2Frame!.beat as any).titleCard.title).toBe("THE NUMBER 114");
    expect((reel2Frame!.beat as any).titleCard.kicker).toBe("REEL TWO");
    expect((reel2Frame!.beat as any).titleCard.monochrome).toBe(true);

    const reel3Frame = keyframes.find(
      (f: Keyframe) =>
        f.sceneId === "nw_cut_inn-raid_01" && Boolean((f.beat as any).titleCard),
    );
    expect(reel3Frame).toBeDefined();
    expect((reel3Frame!.beat as any).titleCard.title).toBe("THE COASTAL INN");
    expect((reel3Frame!.beat as any).titleCard.monochrome).toBe(true);

    // Period optics: slow curtain dips at reel heads & stately lap-dissolves on
    // location shifts — zero directional wipes
    let dipCount = 0;
    let dissolveCount = 0;
    let wipeCount = 0;
    for (const clip of clips) {
      const trans = (clip.keyframe.beat as any).backgroundTransition;
      if (trans === "dip-to-black") dipCount += 1;
      else if (trans === "dissolve") dissolveCount += 1;
      else if (String(trans || "").startsWith("wipe")) wipeCount += 1;
    }
    expect(dipCount).toBeGreaterThanOrEqual(10);
    expect(dissolveCount).toBeGreaterThanOrEqual(50);
    expect(wipeCount).toBe(0);

    // Diegetic reel-opening SFX (gravel tyres) survives on the Reel Three head
    const resolvedAudio = resolveAudioClips(c40.audioClips ?? [], clips);
    const gravelSfx = resolvedAudio.find(
      (ac: ResolvedAudioClip) => ac.lane === "sfx" && ac.src.includes("gravel-tyres"),
    );
    expect(gravelSfx).toBeDefined();

    // Classical straight dialogue cuts: gentle -80 ms breath softening only,
    // zero deep pre-laps, and restrained hushed period score
    const voiceClips = (c40.audioClips ?? []).filter((ac) => ac.lane === "voice");
    const gentlePreLaps = voiceClips.filter((ac) => ac.offsetMs <= -70);
    const deepPreLaps = voiceClips.filter((ac) => ac.offsetMs <= -200);
    expect(gentlePreLaps.length).toBeGreaterThanOrEqual(40);
    expect(deepPreLaps.length).toBe(0);
    const scoreClips = (c40.audioClips ?? []).filter(
      (ac) =>
        ac.lane === "music" &&
        !ac.src.includes("black-cove") &&
        !ac.src.includes("scarlet-reel-logo"),
    );
    expect(scoreClips.length).toBeGreaterThan(10);
    expect(scoreClips.every((ac) => ac.gain <= 0.42)).toBe(true);

    // Render viewer markup for the Reel Two intertitle (silver-print monochrome)
    const reel2Clip = clips.find((c) => c.keyframe.id === reel2Frame!.id)!;
    const reel2Html = renderToStaticMarkup(
      <CinematicPreview
        frame={reel2Frame!}
        localFrame={24}
        clipDurationFrames={reel2Clip.durationFrames}
        playheadFrame={reel2Clip.startFrame + 24}
        totalFrames={totalFrames}
        imageSrc={String(reel2Frame!.picture || "")}
        resolveMedia={(v) => v}
        captionStyle={c40.story.captionStyle}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(reel2Html).toContain("cin-grade-noir-1940s");
    expect(reel2Html).toContain("is-monochrome");
    expect(reel2Html).toContain("viewer-title-card");
    expect(reel2Html).toContain("THE NUMBER 114");
    expect(reel2Html).toContain("REEL TWO");

    const css = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toContain(".cin-grade-noir-1940s");
    expect(css).toContain(".topbar-cut-trigger-dot.is-noir-1940s");
  });
});
