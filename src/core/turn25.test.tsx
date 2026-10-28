import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import { computeDepthCameraUniforms } from "../components/FrameDepthParallax";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  evaluate,
} from "../sequence/animate";
import {
  activeTimelineCaptionAtFrame,
  DEFAULT_CAPTION_STYLE,
  resolveTimelineCaptions,
} from "./captions";
import {
  buildDirectorsCutById,
  HITCHCOCK_VERTIGO_BY_BEAT_ID,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
} from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

function buildFixture() {
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

describe("Turn 25 — Hitchcock 1950s Noir Camera, Lighting, Dialogue Coverage & Centered Subtitles", () => {
  it("computes true Vertigo contra-zoom WebGL uniforms (foreground steady while background recedes or looms)", () => {
    const recStart = computeDepthCameraUniforms({
      zoom: 1.02,
      x: 0,
      y: 0,
      amount: 0.28,
      focus: 0.5,
      center: [0.42, 0.38],
      vertigoContraZoom: "recede",
    });
    const recEnd = computeDepthCameraUniforms({
      zoom: 1.32,
      x: 0,
      y: 0,
      amount: 0.56,
      focus: 0.5,
      center: [0.42, 0.38],
      vertigoContraZoom: "recede",
    });

    // In "recede" contra-zoom, far background (uZoom[0]) shrinks rapidly while near subject (uZoom[1]) stays anchored
    expect(recStart.uZoom[0] - recEnd.uZoom[0]).toBeGreaterThan(0.42);
    expect(Math.abs(recEnd.uZoom[1] - recStart.uZoom[1])).toBeLessThan(0.06);

    const loomStart = computeDepthCameraUniforms({
      zoom: 1.02,
      x: 0,
      y: 0,
      amount: 0.28,
      focus: 0.5,
      center: [0.48, 0.38],
      vertigoContraZoom: "loom",
    });
    const loomEnd = computeDepthCameraUniforms({
      zoom: 1.32,
      x: 0,
      y: 0,
      amount: 0.56,
      focus: 0.5,
      center: [0.48, 0.38],
      vertigoContraZoom: "loom",
    });

    // In "loom" contra-zoom, far background (uZoom[0]) looms inward while near subject (uZoom[1]) stays anchored
    expect(loomEnd.uZoom[0] - loomStart.uZoom[0]).toBeGreaterThan(0.45);
    expect(Math.abs(loomEnd.uZoom[1] - loomStart.uZoom[1])).toBeLessThan(0.06);
  });

  it("authors all 12 Vertigo contra-zooms, 4 monochrome Hitchcock chiaroscuro lighting styles, and varied static dialogue coverage in 1950s Noir only", () => {
    const { baseProj, voiceMap, musicMap } = buildFixture();
    const neo = buildDirectorsCutById(baseProj, "neo-noir", voiceMap, musicMap);
    const creative = buildDirectorsCutById(baseProj, "creative", voiceMap, musicMap);
    const noir = buildDirectorsCutById(baseProj, "noir-1950s", voiceMap, musicMap);

    const neoTl = buildTimelineClips(buildKeyframes(neo.story), voiceMap);
    const creativeTl = buildTimelineClips(buildKeyframes(creative.story), voiceMap);
    const noirTl = buildTimelineClips(buildKeyframes(noir.story), voiceMap);

    // Neo-Noir & Creative remain untouched by 1950s Hitchcock properties
    for (const c of [...neoTl.clips, ...creativeTl.clips]) {
      const cin = (c.keyframe.beat.cinematic ?? {}) as Record<string, unknown>;
      expect(cin.vertigoContraZoom).toBeUndefined();
      expect(cin.hitchcockLighting).toBeUndefined();
    }

    // Multi-turn conversations on shared plates are split into crisp shot/reverse-shot coverage in 1950s Noir
    expect(noirTl.clips.length).toBeGreaterThanOrEqual(neoTl.clips.length + 400);

    const expectedVertigoCount = Object.keys(HITCHCOCK_VERTIGO_BY_BEAT_ID).length;
    const vertigoClips = noirTl.clips.filter(
      (c) => Boolean((c.keyframe.beat.cinematic as Record<string, unknown> | undefined)?.vertigoContraZoom),
    );
    expect(vertigoClips.length).toBe(expectedVertigoCount);

    let staticZoomCoverageCount = 0;
    let clueOrConfessionPushCount = 0;
    let telephotoPanCount = 0;
    let dutchCantCount = 0;
    let opposingAnglePairs = 0;
    const lightingCounts: Record<string, number> = {};

    for (let i = 0; i < noirTl.clips.length; i += 1) {
      const c = noirTl.clips[i];
      const f = c.keyframe;
      const cin = (f.beat.cinematic ?? {}) as Record<string, unknown>;
      if (typeof cin.hitchcockLighting === "string") {
        lightingCounts[cin.hitchcockLighting] =
          (lightingCounts[cin.hitchcockLighting] ?? 0) + 1;
      }

      const anim = f.beat.animation;
      const vals = anim?.values ?? {};
      if (!anim?.zoom?.length && (vals.zoom ?? 1) >= 1.24) {
        staticZoomCoverageCount += 1;
      }
      if (anim?.zoom?.length && !cin.vertigoContraZoom) {
        const z0 = anim.zoom[0]?.value ?? 1;
        const z1 = anim.zoom[anim.zoom.length - 1]?.value ?? 1;
        if (Math.abs(z1 - z0) < 0.01 && anim.x?.length) {
          telephotoPanCount += 1;
        } else if (z1 - z0 >= 0.25) {
          clueOrConfessionPushCount += 1;
        }
      }
      if (Math.abs(vals.rotation ?? 0) > 0.5) {
        dutchCantCount += 1;
      }

      // Check consecutive shots sharing a plate for varied zoom/pan coverage & razor-hard cuts
      if (i > 0) {
        const prev = noirTl.clips[i - 1].keyframe;
        if (
          prev.sceneId === f.sceneId &&
          prev.picture &&
          prev.picture === f.picture &&
          !prev.beat.gap &&
          !f.beat.gap
        ) {
          expect(f.beat.backgroundTransition).toBeUndefined();
          const prevPose = evaluate(prev, 0);
          const curPose = evaluate(f, 0);
          if (Math.abs(curPose.zoom - prevPose.zoom) >= 0.12 || Math.abs(curPose.x - prevPose.x) >= 1.0) {
            opposingAnglePairs += 1;
          }
        }
      }

      // Edge-safety check at start, midpoint, and end of every shot
      if (!f.beat.gap && f.sceneId !== "nw_intro" && f.sceneId !== "nw_logo") {
        const mid = Math.floor(c.durationFrames / 2);
        for (const lf of [0, mid, Math.max(0, c.durationFrames - 1)]) {
          const p = evaluate(f, lf);
          expect(clampPoseToPictureEdges(p).clamped).toBe(false);
        }
      }
    }

    expect(staticZoomCoverageCount).toBeGreaterThanOrEqual(500);
    expect(opposingAnglePairs).toBeGreaterThanOrEqual(300);
    expect(clueOrConfessionPushCount).toBeGreaterThanOrEqual(40);
    expect(telephotoPanCount).toBeGreaterThanOrEqual(10);
    expect(dutchCantCount).toBeGreaterThanOrEqual(8);

    expect(lightingCounts["eye-light"]).toBeGreaterThan(150);
    expect(lightingCounts["venetian-slats"]).toBeGreaterThan(250);
    expect(lightingCounts["key-slash"]).toBeGreaterThan(150);
    expect(lightingCounts["silhouette-rim"]).toBeGreaterThan(120);

    // Verify CinematicPreview SSR markup mounts WebGL contra-zoom canvas even on 2D plates (e.g. nw_b251)
    // plus monochrome Hitchcock lighting with zero CSS transitions/animations
    const photoVertigoClip = vertigoClips.find((vc) => vc.keyframe.beat.id === "nw_b251")!;
    expect(photoVertigoClip).toBeDefined();
    expect(photoVertigoClip.keyframe.beat.cinematic?.depthMap).toBeUndefined();

    const vertigoHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={photoVertigoClip.keyframe}
        localFrame={24}
        presetFrame={24}
        shotKeyId={photoVertigoClip.keyframe.id}
        clipDurationFrames={photoVertigoClip.durationFrames}
        playheadFrame={photoVertigoClip.startFrame + 24}
        totalFrames={noirTl.totalFrames}
        captionStyle={DEFAULT_CAPTION_STYLE}
        imageSrc={photoVertigoClip.keyframe.picture}
        resolveMedia={(ref) => ref}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={true}
        aspectFraming="2.35:1"
      />,
    );
    expect(vertigoHtml).toContain('data-vertigo="loom"');
    expect(vertigoHtml).toContain('data-testid="frame-hitchcock-lighting"');
    expect(vertigoHtml).toContain('data-lighting-kind="eye-light"');
    expect(vertigoHtml).not.toMatch(/transition:\s*(?!none)/);
  });

  it("keeps subtitles horizontally centered across 2.35:1 Scope, 1.37:1 Academy, and 16:9 Open aspect ratios", () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, "../index.css"),
      "utf8",
    );

    // Ensure .cin-caption and .cin-caption.has-academy both preserve left: 50% + translateX(-50%) centering
    const academyRuleMatch = css.match(/\.cin-caption\.has-academy\s*\{([^}]*)\}/);
    expect(academyRuleMatch).not.toBeNull();
    const academyBody = academyRuleMatch![1];
    expect(academyBody).toContain("left: 50% !important");
    expect(academyBody).toContain("right: auto !important");
    expect(academyBody).toContain("transform: translateX(-50%) !important");
    expect(academyBody).toContain("text-align: center");
    expect(academyBody).not.toContain("left: 14%");

    const { baseProj, voiceMap, musicMap } = buildFixture();
    const noir = buildDirectorsCutById(baseProj, "noir-1950s", voiceMap, musicMap);
    const noirFrames = buildKeyframes(noir.story);
    const noirTl = buildTimelineClips(noirFrames, voiceMap);
    const caps = resolveTimelineCaptions(noirTl.clips);
    const sampleCap = caps.find(
      (cap) => !cap.isNarration && cap.text.trim().length > 10,
    )!;
    const sampleFrame = Math.floor(
      (sampleCap.globalInFrame + sampleCap.globalOutFrame) / 2,
    );
    const sampleClip = noirTl.clips.find(
      (c) => sampleFrame >= c.startFrame && sampleFrame < c.endFrame,
    )!;
    const activeCap = activeTimelineCaptionAtFrame(caps, sampleFrame);
    expect(activeCap).not.toBeNull();

    for (const gate of ["2.35:1", "1.37:1", "16:9"] as const) {
      const html = renderToStaticMarkup(
        <CinematicPreview
          frame={sampleClip.keyframe}
          localFrame={sampleFrame - sampleClip.startFrame}
          presetFrame={sampleFrame - sampleClip.startFrame}
          shotKeyId={sampleClip.keyframe.id}
          clipDurationFrames={sampleClip.durationFrames}
          playheadFrame={sampleFrame}
          totalFrames={noirTl.totalFrames}
          captionStyle={DEFAULT_CAPTION_STYLE}
          activeTimelineCaption={activeCap}
          imageSrc={sampleClip.keyframe.picture}
          resolveMedia={(ref) => ref}
          playing={false}
          soundOn={false}
          showCaption={true}
          showMark={true}
          aspectFraming={gate}
        />,
      );
      expect(html).toContain("cin-caption");
      if (gate === "2.35:1") {
        expect(html).toContain("has-letterbox");
      } else if (gate === "1.37:1") {
        expect(html).toContain("has-academy");
      }
    }
  });
});
