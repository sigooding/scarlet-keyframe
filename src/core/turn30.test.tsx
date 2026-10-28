import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Timeline } from "../components/Timeline";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import {
  applyDirectViewerPoseAtFrame,
  buildTimelineClips,
  evaluate,
  hasAnimationKeyframes,
  hasTransformKeyframes,
  zoomPoseAroundPointer,
} from "../sequence/animate";
import { buildDirectorsCutById } from "./directorsCut";
import { convertProjectCameraMovesToKeyframesWithCount, setBeatAnimation } from "./edits";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
} from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

describe("Direct Viewer Keyframe Creation & Convert All to Keyframes", () => {
  it("always creates real diamond keyframes on every camera edit made inside the main preview screen", () => {
    // 1. Still shot with zero existing keyframes -> wheel-zoom off-centre at +24f adds zoom, x, y diamonds!
    const zoomed = zoomPoseAroundPointer({ zoom: 1, x: 0, y: 0, rotation: 0 }, 1.35, 0.25, 0.75);
    const afterWheel = applyDirectViewerPoseAtFrame(
      undefined,
      24,
      { zoom: zoomed.zoom, x: zoomed.x, y: zoomed.y },
      { zoom: 1, x: 0, y: 0, rotation: 0 },
    );
    expect(afterWheel?.values).toBeUndefined();
    expect(afterWheel?.zoom?.map((k) => k.frame)).toEqual([0, 24]);
    expect(afterWheel?.x?.map((k) => k.frame)).toEqual([0, 24]);
    expect(afterWheel?.y?.map((k) => k.frame)).toEqual([0, 24]);
    expect(evaluate(afterWheel, 0).zoom).toBeCloseTo(1, 5);
    expect(evaluate(afterWheel, 24).zoom).toBeCloseTo(1.35, 5);

    // 2. Centered zoom-only shot (zoom has keys [0, 80], x/y/rotation have 0 keys) ->
    // drag-panning & rotating at +40f adds real x, y, and rotation diamond keyframes instead of static values!
    const zoomOnlyShot = {
      zoom: [
        { frame: 0, value: 1.15, easing: "ease-in-out" as const },
        { frame: 80, value: 1.3, easing: "linear" as const },
      ],
    };
    const afterPan = applyDirectViewerPoseAtFrame(
      zoomOnlyShot,
      40,
      { x: -6.5, y: 3.2 },
      { zoom: 1.225, x: 0, y: 0, rotation: 0 },
    );
    expect(afterPan?.values).toBeUndefined();
    expect(afterPan?.x).toEqual([
      { frame: 0, value: 0, easing: "ease-in-out" },
      { frame: 40, value: -6.5, easing: "ease-in-out" },
    ]);
    expect(afterPan?.y).toEqual([
      { frame: 0, value: 0, easing: "ease-in-out" },
      { frame: 40, value: 3.2, easing: "ease-in-out" },
    ]);

    const afterRotate = applyDirectViewerPoseAtFrame(
      afterPan,
      40,
      { rotation: -2.4, zoom: 1.26 },
      { zoom: 1.225, x: -6.5, y: 3.2, rotation: 0 },
    );
    expect(afterRotate?.rotation).toEqual([
      { frame: 0, value: 0, easing: "ease-in-out" },
      { frame: 40, value: -2.4, easing: "ease-in-out" },
    ]);
    expect(afterRotate?.zoom?.map((k) => k.frame)).toEqual([0, 40, 80]);

    // 3. Static Hitchcock/Ozu shot with plain animation.values.{zoom,x,y} + gradeStrength ->
    // direct preview edit promotes camera values into diamond keyframes while keeping gradeStrength intact
    const staticFramed = {
      values: { zoom: 1.14, x: -3.5, y: 1.2, gradeStrength: 1 },
    };
    const afterDirectAtZero = applyDirectViewerPoseAtFrame(
      staticFramed,
      0,
      { zoom: 1.22, x: -5, y: 2 },
      { zoom: 1.14, x: -3.5, y: 1.2, rotation: 0 },
    );
    expect(afterDirectAtZero?.values).toEqual({ gradeStrength: 1 });
    expect(afterDirectAtZero?.zoom).toEqual([{ frame: 0, value: 1.22, easing: "ease-in-out" }]);
    expect(afterDirectAtZero?.x).toEqual([{ frame: 0, value: -5, easing: "ease-in-out" }]);
    expect(afterDirectAtZero?.y).toEqual([{ frame: 0, value: 2, easing: "ease-in-out" }]);
  });

  it("Convert all to keyframes converts static-framed & preset shots across 1950s Noir, Neo-Noir, and Creative while preserving poses & 1x still shots", () => {
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

    for (const cutId of ["noir-1950s", "neo-noir", "creative"] as const) {
      const beforeProj = buildDirectorsCutById(baseProject, cutId, voiceMap, musicMap);
      const beforeFrames = buildKeyframes(beforeProj.story);
      const beforeClips = buildTimelineClips(beforeFrames, voiceMap).clips;

      const res = convertProjectCameraMovesToKeyframesWithCount(beforeProj, voiceMap);
      expect(res.convertedCount).toBeGreaterThan(150);

      const afterFrames = buildKeyframes(res.project.story);
      const afterClips = buildTimelineClips(afterFrames, voiceMap).clips;
      expect(afterClips.length).toBe(beforeClips.length);

      // Every non-1x static-framed shot now has real transform diamond keyframes with identical visual evaluation!
      for (let i = 0; i < beforeClips.length; i += 1) {
        const bClip = beforeClips[i];
        const aClip = afterClips[i];
        const vBefore = bClip.keyframe.beat.animation?.values;
        const hadNonDefaultFraming = Boolean(
          vBefore &&
            ((typeof vBefore.zoom === "number" && Math.abs(vBefore.zoom - 1) > 1e-6) ||
              (typeof vBefore.x === "number" && Math.abs(vBefore.x) > 1e-6) ||
              (typeof vBefore.y === "number" && Math.abs(vBefore.y) > 1e-6) ||
              (typeof vBefore.rotation === "number" && Math.abs(vBefore.rotation) > 1e-6)),
        );
        if (hadNonDefaultFraming) {
          expect(hasTransformKeyframes(aClip.keyframe)).toBe(true);
          expect(aClip.keyframe.beat.animation?.values?.zoom).toBeUndefined();
          expect(aClip.keyframe.beat.animation?.values?.x).toBeUndefined();
          expect(aClip.keyframe.beat.animation?.values?.y).toBeUndefined();
          // Sample start & end poses to verify zero visual jump from static-framing conversion
          for (const lf of [0, Math.max(0, bClip.durationFrames - 1)]) {
            const pBefore = evaluate(bClip.keyframe, lf, bClip.carriedStartPose);
            const pAfter = evaluate(aClip.keyframe, lf, aClip.carriedStartPose);
            expect(pAfter.zoom).toBeCloseTo(pBefore.zoom, 2);
            expect(pAfter.x).toBeCloseTo(pBefore.x, 2);
            expect(pAfter.y).toBeCloseTo(pBefore.y, 2);
          }
        }
      }

      // Running a second time is idempotent (0 newly converted, reports keyframedShotCount > 0)
      const secondPass = convertProjectCameraMovesToKeyframesWithCount(res.project, voiceMap);
      expect(secondPass.convertedCount).toBe(0);
      expect(secondPass.keyframedShotCount).toBe(res.keyframedShotCount);
      expect(secondPass.project).toBe(res.project);
    }
  });

  it("renders diamond keyframes on the active previewed timeline clip even when another clip was previously selected", () => {
    const project = createProjectState({
      sourceName: "active-diamonds.json",
      story: {
        id: "active-diamonds",
        title: "Active Diamonds",
        startSceneId: "s1",
        scenes: [
          {
            id: "s1",
            animaticMark: "1",
            background: "/film/img/s1/01-backstreet.jpg",
            dialogueBeats: [
              { id: "b1", characterId: "jack", text: "One", durationFrames: 48 },
              { id: "b2", characterId: "vera", text: "Two", durationFrames: 48 },
            ],
          },
        ],
      },
      assets: [],
      missing: [],
    });
    const edited = setBeatAnimation(project, "b2", {
      zoom: [
        { frame: 0, value: 1, easing: "ease-in-out" },
        { frame: 24, value: 1.25, easing: "ease-in-out" },
      ],
    });
    const frames = buildKeyframes(edited.story);
    const { clips, totalFrames } = buildTimelineClips(frames);
    const noop = () => undefined;

    // Playhead is on b2 (frame 60), while selectedFrameId is still b1 -> b2's diamonds still render!
    const html = renderToStaticMarkup(
      <Timeline
        clips={clips}
        totalFrames={totalFrames}
        playheadFrame={60}
        selectedFrameId="b1"
        selectedFrameIds={["b1"]}
        snapEnabled={true}
        noteMarkers={[]}
        editingMarkerId={null}
        canSplit={true}
        hasClipboard={false}
        resolveMedia={(u) => u}
        onToggleSnap={noop}
        onAddNoteMarker={noop}
        onUpdateNoteMarker={noop}
        onDeleteNoteMarker={noop}
        onCloseMarkerEditor={noop}
        onEditMarker={noop}
        onScrub={noop}
        onSetSelection={noop}
        onDragStart={noop}
        onDragEnd={noop}
        onTrimPreview={noop}
        onRollPreview={noop}
        onMoveClips={noop}
        onSetTransition={noop}
        onAnimationPreview={noop}
        onCopy={noop}
        onPaste={noop}
        onSplit={noop}
        onDelete={noop}
        onMoveCue={noop}
        onDropFile={noop}
      />,
    );
    expect(html).toContain('data-testid="clip-diamond-zoom-0"');
    expect(html).toContain('data-testid="clip-diamond-zoom-24"');
    expect(hasAnimationKeyframes(frames[1])).toBe(true);
  });
});
