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
  isKillBillRaidScene,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  type Keyframe,
  type ProjectState,
} from "./model";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  evaluate,
} from "../sequence/animate";
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

describe("Turn 32–33 — Tarantino Director's Cut (keyframe choreography + built-in lights & VFX)", () => {
  it("registers 'tarantino' in DIRECTORS_CUT_OPTIONS without mutating Neo-Noir, Creative, 1950s Noir, or Uncut", () => {
    expect(DIRECTORS_CUT_OPTIONS.map((o) => o.id)).toEqual([
      "neo-noir",
      "creative",
      "noir-1950s",
      "tarantino",
      "uncut",
    ]);

    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const neoDefault = buildDirectorsCutProject(baseProject, voiceMap, musicMap);
    const neoById = buildDirectorsCutById(baseProject, "neo-noir", voiceMap, musicMap);
    const tarantino = buildDirectorsCutById(baseProject, "tarantino", voiceMap, musicMap);
    const uncut = buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap);

    expect(neoById.directorsCutId).toBe("neo-noir");
    expect(tarantino.directorsCutId).toBe("tarantino");
    expect(uncut.directorsCutId).toBe("uncut");

    const neoClips = buildTimelineClips(buildKeyframes(neoById.story), voiceMap).clips;
    const neoDefClips = buildTimelineClips(buildKeyframes(neoDefault.story), voiceMap).clips;
    expect(neoClips.length).toBe(703);
    expect(neoClips.length).toBe(neoDefClips.length);

    // Tarantino Cut splits multi-turn dialogue plates for punchy Sally Menke coverage
    const qtClips = buildTimelineClips(buildKeyframes(tarantino.story), voiceMap).clips;
    expect(qtClips.length).toBeGreaterThan(neoClips.length);
  });

  it("preserves all 256 scenes, 35% motes constraint, Scene 77A zero-cabin-light lock, and zero edge clamping", () => {
    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const qt = buildDirectorsCutById(baseProject, "tarantino", voiceMap, musicMap);
    expect(qt.story.scenes.length).toBe(256);

    const keyframes = buildKeyframes(qt.story);
    const { clips } = buildTimelineClips(keyframes, voiceMap);

    // Check 35% motes constraint wherever motes appear
    for (const sc of qt.story.scenes) {
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

    // Scene 77A strict rule: zero interior cabin light inside Kurose's sedan, exterior rain-on-lens active
    const s77aScene = qt.story.scenes.find((s) => s.id === "nw_s77a");
    expect(s77aScene).toBeDefined();
    for (const beat of s77aScene!.dialogueBeats ?? []) {
      const cin = (beat.cinematic || {}) as Record<string, any>;
      expect(cin.lights).toBeUndefined();
      expect(cin.tarantinoLighting).toBeUndefined();
      expect(cin.rainOnLens).toBe(true);
    }

    // Verify single-camera rule (mode === 'static') and ZERO picture-edge clamping across every clip!
    let crashZoomWithFlashCount = 0;
    let whipPullOutCount = 0;
    let twoStepLeoneCount = 0;
    let dutchCantCount = 0;
    let lateralTrackCount = 0;

    for (const clip of clips) {
      const beat = clip.keyframe.beat as Record<string, any>;
      const scId = clip.keyframe.sceneId;
      if (!beat.gap && scId !== "nw_intro" && scId !== "nw_logo") {
        expect((beat.cinematic as Record<string, any> | undefined)?.mode).toBe("static");
      }

      const anim = beat.animation;
      if (anim?.exposure && anim.exposure.length >= 3 && anim?.zoom?.length >= 2) {
        crashZoomWithFlashCount += 1;
      }
      if (anim?.zoom?.length >= 2 && anim.zoom[0].value > anim.zoom[1].value + 0.25) {
        whipPullOutCount += 1;
      }
      if (anim?.zoom?.length === 4) {
        twoStepLeoneCount += 1;
      }
      if (Math.abs(anim?.values?.rotation ?? 0) > 0.5) {
        dutchCantCount += 1;
      }
      if (anim?.x?.length === 2 && Math.abs(anim.x[1].value - anim.x[0].value) >= 6) {
        lateralTrackCount += 1;
      }

      // Check start, quarter, mid, three-quarter, and end frames of every clip for zero clamping
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

    expect(crashZoomWithFlashCount).toBeGreaterThanOrEqual(25);
    expect(whipPullOutCount).toBeGreaterThanOrEqual(8);
    expect(twoStepLeoneCount).toBeGreaterThanOrEqual(15);
    expect(dutchCantCount).toBeGreaterThanOrEqual(20);
    expect(lateralTrackCount).toBeGreaterThanOrEqual(15);
  });

  it("activates tarantino-35mm print, House-of-Blue-Leaves B&W raid switches, lights, flares, 5 chapter cards, wipes & J-cuts", () => {
    const { baseProject, voiceMap, musicMap } = makeBaseProject();
    const qt = buildDirectorsCutById(baseProject, "tarantino", voiceMap, musicMap);
    const keyframes = buildKeyframes(qt.story);
    const { clips, totalFrames } = buildTimelineClips(keyframes, voiceMap);

    const lightingModes = new Set<string>();
    const flarePresets = new Set<string>();
    let raidMonochromeCount = 0;
    let grindhouseColorCount = 0;
    let lightsPointCount = 0;
    let filmGradeCount = 0;
    let wipeTransitionCount = 0;

    for (const clip of clips) {
      const scId = clip.keyframe.sceneId;
      const beat = clip.keyframe.beat as Record<string, any>;
      if (beat.gap || scId === "nw_intro" || scId === "nw_logo") continue;
      const cin = (beat.cinematic || {}) as Record<string, any>;

      if (isKillBillRaidScene(scId)) {
        expect(cin.colorGrade).toBe("noir-1940s");
        raidMonochromeCount += 1;
      } else {
        expect(cin.colorGrade).toBe("tarantino-35mm");
        grindhouseColorCount += 1;
      }

      if (cin.tarantinoLighting) lightingModes.add(String(cin.tarantinoLighting));
      if (cin.lensFlare) flarePresets.add(String(cin.lensFlare));
      if (Array.isArray(cin.lights) && cin.lights.length > 0) lightsPointCount += 1;
      if (cin.filmGrade && typeof cin.filmGrade === "object" && cin.gateWeave === true) {
        filmGradeCount += 1;
      }
      if (
        beat.backgroundTransition === "wipe-left" ||
        beat.backgroundTransition === "wipe-right"
      ) {
        wipeTransitionCount += 1;
      }
    }

    expect(raidMonochromeCount).toBeGreaterThanOrEqual(10);
    expect(grindhouseColorCount).toBeGreaterThanOrEqual(500);
    expect(lightingModes).toEqual(
      new Set([
        "richardson-toplight",
        "pulp-gold-glow",
        "neon-crimson-slash",
        "raid-katana-strobe",
      ]),
    );
    expect(flarePresets.has("warm-amber")).toBe(true);
    expect(flarePresets.has("neon-noir")).toBe(true);
    expect(flarePresets.has("anamorphic-blue")).toBe(true);
    expect(flarePresets.has("interrogation")).toBe(true);
    expect(lightsPointCount).toBeGreaterThanOrEqual(500);
    expect(filmGradeCount).toBeGreaterThanOrEqual(500);
    expect(wipeTransitionCount).toBeGreaterThanOrEqual(3);

    // Verify all 5 Tarantino Chapter Cards + Bride-yellow timeline markers + preserved Chapter 3 gravel-tyres SFX
    const chapterMarkers = (qt.story.markers ?? []).filter((m) =>
      m.id.startsWith("marker-chapter-"),
    );
    expect(chapterMarkers.length).toBe(5);
    expect(chapterMarkers.every((m) => m.color === "#ffd400")).toBe(true);

    const ch3Frame = keyframes.find(
      (f: Keyframe) =>
        f.sceneId === "nw_cut_inn-raid_01" && Boolean((f.beat as any).titleCard),
    );
    expect(ch3Frame).toBeDefined();
    expect((ch3Frame!.beat as any).titleCard.title).toBe("MASSACRE AT THE COASTAL INN");
    expect((ch3Frame!.beat as any).titleCard.tarantino).toBe(true);

    const resolvedAudio = resolveAudioClips(qt.audioClips ?? [], clips);
    const gravelSfx = resolvedAudio.find(
      (ac: ResolvedAudioClip) => ac.lane === "sfx" && ac.src.includes("gravel-tyres"),
    );
    expect(gravelSfx).toBeDefined();

    // Sally Menke -320ms pre-lap J-cuts active on voice track
    const jCuts = (qt.audioClips ?? []).filter(
      (ac) => ac.lane === "voice" && ac.offsetMs <= -300,
    );
    expect(jCuts.length).toBeGreaterThanOrEqual(40);

    // Render viewer markup for Chapter 2 (tarantino-35mm + pulp-gold-glow + Bride-yellow card) & Chapter 3 (noir-1940s raid)
    const ch2Clip = clips.find(
      (c) =>
        c.keyframe.sceneId === "nw_s25" && Boolean((c.keyframe.beat as any).titleCard),
    );
    expect(ch2Clip).toBeDefined();
    const ch2Html = renderToStaticMarkup(
      <CinematicPreview
        frame={ch2Clip!.keyframe}
        localFrame={24}
        clipDurationFrames={ch2Clip!.durationFrames}
        playheadFrame={ch2Clip!.startFrame + 24}
        totalFrames={totalFrames}
        imageSrc={String(ch2Clip!.keyframe.picture || "")}
        resolveMedia={(v) => v}
        captionStyle={qt.story.captionStyle}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(ch2Html).toContain("cin-grade-tarantino-35mm");
    expect(ch2Html).toContain("frame-tarantino-lighting");
    expect(ch2Html).toContain("is-tarantino");
    expect(ch2Html).toContain("THE NUMBER 114");

    const ch3Clip = clips.find((c) => c.keyframe.id === ch3Frame!.id)!;
    const ch3Html = renderToStaticMarkup(
      <CinematicPreview
        frame={ch3Frame!}
        localFrame={24}
        clipDurationFrames={ch3Clip.durationFrames}
        playheadFrame={ch3Clip.startFrame + 24}
        totalFrames={totalFrames}
        imageSrc={String(ch3Frame!.picture || "")}
        resolveMedia={(v) => v}
        captionStyle={qt.story.captionStyle}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
      />,
    );
    expect(ch3Html).toContain("cin-grade-noir-1940s");
    expect(ch3Html).toContain("raid-katana-strobe");
    expect(ch3Html).toContain("MASSACRE AT THE COASTAL INN");

    const css = fs.readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toContain(".cin-grade-tarantino-35mm");
    expect(css).toContain(".cin-grade-noir-1940s");
    expect(css).toContain(".cin-title-card.is-tarantino");
  });
});
