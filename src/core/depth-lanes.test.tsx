import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import {
  DepthCutoutCanvasLanes,
  DepthCutoutLaneHeaders,
} from "../components/DepthCutoutLanes";
import { Timeline } from "../components/Timeline";
import { buildTimelineClips } from "../sequence/animate";
import {
  addFrameCutout,
  clampLaneHeight,
  clearFrameCutouts,
  computeVisibleCutoutSublaneCount,
  createCompactLaneHeights,
  createDefaultLaneHeights,
  depthAssetLabel,
  extractClipDepthInfo,
  extractKeyframeDepthInfo,
  filterActiveCutoutsForPreview,
  LANE_HEIGHT_SPECS,
  moveFrameCutoutLayer,
  parseStoredHiddenLanes,
  parseStoredLaneHeights,
  setFrameCutoutLayer,
  setFrameDepthMap,
  setFrameDepthPlate,
  updateFrameCutoutDepth,
} from "./depthLanes";
import { Tracks } from "../components/Tracks";
import { CaptionLane } from "../components/CaptionLane";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "./model";

function makeDepthCutoutFixture(): ProjectState {
  const rawStory = {
    id: "depth-lanes-fixture",
    title: "Depth Lanes Fixture",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        sceneNumber: 1,
        title: "Alley Rain",
        autoAdvanceTargetSceneId: "sc2",
        background: "/film/img/s1/02-vending.jpg",
        cinematic: {
          mode: "static",
          depthMap: "/film/depth/s1/02-vending/depth.png",
          depthPlate: "/film/depth/s1/02-vending/plate.jpg",
          depthAmount: 0.4,
          depthCutouts: [
            { image: "/film/depth/s1/02-vending/cutout-1.png", depth: 0.62 },
          ],
        },
        dialogueBeats: [
          {
            id: "b1",
            speaker: "MARA",
            text: "Scene-inherited depth map and single cutout.",
            durationFrames: 72,
          },
          {
            id: "b2",
            speaker: "MARA",
            text: "Beat override with two cutouts.",
            durationFrames: 96,
            background: "/film/img/s1/06-barbershop-doorway.jpg",
            cinematic: {
              mode: "static",
              depthMap: "/film/depth/s1/06-barbershop-doorway/depth.png",
              depthPlate: "/film/depth/s1/06-barbershop-doorway/plate.jpg",
              depthAmount: 0.45,
              depthCutouts: [
                { image: "/film/depth/s1/06-barbershop-doorway/cutout-1.png", depth: 0.639 },
                { image: "/film/depth/s1/06-barbershop-doorway/cutout-2.png", depth: 0.654 },
              ],
            },
          },
        ],
      },
      {
        id: "sc2",
        sceneNumber: 2,
        title: "Dry Room",
        background: "/film/img/s2/room.jpg",
        dialogueBeats: [
          {
            id: "b3",
            speaker: "JACK",
            text: "Plain 2D shot with no depth map yet.",
            durationFrames: 60,
            background: "/film/img/s2/room.jpg",
          },
        ],
      },
    ],
  };
  return createProjectState(parseImportPayload(rawStory, "depth-lanes-fixture.json"), []);
}

describe("Depth Maps lane & Expandable Cutouts lanes", () => {
  it("formats readable labels for generic depth.png, plate.jpg, cutout-N.png, and uploaded assets", () => {
    expect(depthAssetLabel("/film/depth/s1/06-barbershop-doorway/depth.png")).toBe(
      "06-barbershop-doorway · depth",
    );
    expect(depthAssetLabel("/film/depth/s1/06-barbershop-doorway/cutout-2.png")).toBe(
      "06-barbershop-doorway · cutout-2",
    );
    expect(depthAssetLabel("/film/depth/s12/s12-barber-depth.jpg")).toBe("s12-barber-depth");
    expect(depthAssetLabel("asset:upload-abcdef123456")).toBe("upload · upload-");
  });

  it("extracts depth maps, clean plates, and multi-layer cutout slots across beats and scene inheritance", () => {
    const project = makeDepthCutoutFixture();
    const { clips } = buildTimelineClips(buildKeyframes(project.story));
    expect(clips).toHaveLength(3);

    const b1Info = extractClipDepthInfo(clips[0]);
    expect(b1Info.depthMap).toBe("/film/depth/s1/02-vending/depth.png");
    expect(b1Info.depthPlate).toBe("/film/depth/s1/02-vending/plate.jpg");
    expect(b1Info.isCarriedDepth).toBe(true);
    expect(b1Info.activeCutouts).toEqual([
      { layerIndex: 0, image: "/film/depth/s1/02-vending/cutout-1.png", depth: 0.62 },
    ]);

    const b2Info = extractClipDepthInfo(clips[1]);
    expect(b2Info.isCarriedDepth).toBe(false);
    expect(b2Info.activeCutouts).toHaveLength(2);
    expect(b2Info.activeCutouts[1]).toEqual({
      layerIndex: 1,
      image: "/film/depth/s1/06-barbershop-doorway/cutout-2.png",
      depth: 0.654,
    });

    const b3Info = extractClipDepthInfo(clips[2]);
    expect(b3Info.depthMap).toBeUndefined();
    expect(b3Info.activeCutouts).toEqual([]);
    expect(computeVisibleCutoutSublaneCount(clips, 2)).toBe(2);
  });

  it("assigns, updates, reorders, and clears depth maps and cutout layers (including sparse slots and scene-inherited shots)", () => {
    let project = makeDepthCutoutFixture();

    // 1. Assign depth map + sparse Cutout 3 (layerIndex 2) onto plain 2D beat b3
    project = setFrameDepthMap(project, "b3", "/film/depth/s2/room/depth.png");
    project = setFrameDepthPlate(project, "b3", "/film/depth/s2/room/plate.jpg");
    project = setFrameCutoutLayer(project, "b3", 2, {
      image: "/film/depth/s2/room/cutout-3.png",
      depth: 0.78,
    });

    let frames = buildKeyframes(project.story);
    const b3AfterAssign = extractKeyframeDepthInfo(frames.find((f) => f.id === "b3")!);
    expect(b3AfterAssign.depthMap).toBe("/film/depth/s2/room/depth.png");
    expect(b3AfterAssign.depthPlate).toBe("/film/depth/s2/room/plate.jpg");
    expect(b3AfterAssign.cutoutSlots[0]).toBeNull();
    expect(b3AfterAssign.cutoutSlots[1]).toBeNull();
    expect(b3AfterAssign.cutoutSlots[2]).toEqual({
      image: "/film/depth/s2/room/cutout-3.png",
      depth: 0.78,
    });
    // Expanded sublane count automatically grows to 3 to show Cutout 3
    expect(computeVisibleCutoutSublaneCount(buildTimelineClips(frames).clips, 2)).toBe(3);

    // 2. Adding a cutout via summary lane fills the first open slot (Cutout 1 = layerIndex 0)
    const added = addFrameCutout(project, "b3", "/film/depth/s2/room/cutout-1.png", 0.52);
    expect(added.layerIndex).toBe(0);
    project = added.project;

    // 3. Scrubbing cutout depth & moving Cutout 3 up to Cutout 2
    project = updateFrameCutoutDepth(project, "b3", 0, 0.91);
    project = moveFrameCutoutLayer(project, "b3", 2, 1);
    frames = buildKeyframes(project.story);
    const b3AfterMove = extractKeyframeDepthInfo(frames.find((f) => f.id === "b3")!);
    expect(b3AfterMove.activeCutouts).toEqual([
      { layerIndex: 0, image: "/film/depth/s2/room/cutout-1.png", depth: 0.91 },
      { layerIndex: 1, image: "/film/depth/s2/room/cutout-3.png", depth: 0.78 },
    ]);

    // 4. Clearing scene-inherited depth map and cutouts on b1 does NOT resurrect scene.cinematic values
    project = setFrameDepthMap(project, "b1", undefined);
    project = clearFrameCutouts(project, "b1");
    frames = buildKeyframes(project.story);
    const b1Cleared = extractKeyframeDepthInfo(frames.find((f) => f.id === "b1")!);
    expect(b1Cleared.depthMap).toBeUndefined();
    expect(b1Cleared.activeCutouts).toEqual([]);
  });

  it("filters cutout layers cleanly when the Cutouts lane or individual Cutout sub-lanes are muted", () => {
    const raw = [
      { image: "/cut-1.png", depth: 0.5 },
      { image: "/cut-2.png", depth: 0.7 },
      { image: "/cut-3.png", depth: 0.85 },
    ];
    expect(filterActiveCutoutsForPreview(raw, false)).toBeUndefined();
    expect(filterActiveCutoutsForPreview(raw, true, new Set([1]))).toEqual([
      { image: "/cut-1.png", depth: 0.5 },
      { image: "/cut-3.png", depth: 0.85 },
    ]);
  });

  it("renders Depth Maps and Cutouts lanes in Timeline and expands Cutouts into per-layer sub-lanes", () => {
    const project = makeDepthCutoutFixture();
    const keyframes = buildKeyframes(project.story);
    const { clips, totalFrames } = buildTimelineClips(keyframes);

    const timelineHtml = renderToStaticMarkup(
      <Timeline
        clips={clips}
        totalFrames={totalFrames}
        playheadFrame={0}
        selectedFrameId="b2"
        selectedFrameIds={["b2"]}
        snapEnabled={true}
        noteMarkers={[]}
        editingMarkerId={null}
        canSplit={false}
        hasClipboard={false}
        resolveMedia={(v) => v}
        onToggleSnap={() => {}}
        onAddNoteMarker={() => {}}
        onUpdateNoteMarker={() => {}}
        onDeleteNoteMarker={() => {}}
        onCloseMarkerEditor={() => {}}
        onEditMarker={() => {}}
        onScrub={() => {}}
        onSetSelection={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onTrimPreview={() => {}}
        onRollPreview={() => {}}
        onMoveClips={() => {}}
        onSetTransition={() => {}}
        onAnimationPreview={() => {}}
        onCopy={() => {}}
        onPaste={() => {}}
        onSplit={() => {}}
        onDelete={() => {}}
        onMoveCue={() => {}}
        onDropFile={() => {}}
      />,
    );

    expect(timelineHtml).toContain('data-testid="track-header-depth"');
    expect(timelineHtml).toContain('data-testid="timeline-depth-lane"');
    expect(timelineHtml).toContain('data-testid="track-header-cutouts"');
    expect(timelineHtml).toContain('data-testid="cutouts-lane-expand-btn"');
    expect(timelineHtml).toContain('data-testid="timeline-cutouts-lane"');
    expect(timelineHtml).toContain('data-testid="depth-block-b2"');
    expect(timelineHtml).toContain('data-testid="cutout-summary-block-b2"');
    // Collapsed by default: individual cutout sublanes are hidden until expanded
    expect(timelineHtml).not.toContain('data-testid="timeline-cutout-sublane-0"');

    // Render expanded headers + canvas lanes directly to verify per-layer sub-lanes
    const expandedHeadersHtml = renderToStaticMarkup(
      <DepthCutoutLaneHeaders
        sublaneCount={3}
        cutoutsExpanded={true}
        showDepthMaps={true}
        showDepthMapOverlay={false}
        showCutouts={true}
        mutedCutoutLayers={new Set([1])}
        depthClipCount={2}
        cutoutClipCount={2}
        onToggleCutoutsExpanded={() => {}}
        onAddCutoutSublane={() => {}}
        onToggleShowDepthMaps={() => {}}
        onToggleShowDepthMapOverlay={() => {}}
        onToggleShowCutouts={() => {}}
        onToggleMuteCutoutLayer={() => {}}
      />,
    );
    expect(expandedHeadersHtml).toContain('data-testid="cutout-sublane-header-0"');
    expect(expandedHeadersHtml).toContain('data-testid="cutout-sublane-header-1"');
    expect(expandedHeadersHtml).toContain('data-testid="cutout-sublane-header-2"');
    expect(expandedHeadersHtml).toContain('data-testid="cutouts-add-sublane-btn"');

    const expandedCanvasHtml = renderToStaticMarkup(
      <DepthCutoutCanvasLanes
        clips={clips}
        visibleClips={clips}
        pxPerFrame={2}
        selectedFrameId="b2"
        selectedFrameIds={["b2"]}
        selectedCutoutLayer={{ frameId: "b2", layerIndex: 1 }}
        sublaneCount={3}
        cutoutsExpanded={true}
        showDepthMaps={true}
        showCutouts={true}
        mutedCutoutLayers={new Set()}
        resolveMedia={(v) => v}
        frameFromClientX={() => 0}
        onToggleCutoutsExpanded={() => {}}
        onSelectShot={() => {}}
        onSelectCutoutLayer={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    );
    expect(expandedCanvasHtml).toContain('data-testid="timeline-cutout-sublane-0"');
    expect(expandedCanvasHtml).toContain('data-testid="timeline-cutout-sublane-1"');
    expect(expandedCanvasHtml).toContain('data-testid="cutout-layer-block-b2-0"');
    expect(expandedCanvasHtml).toContain('data-testid="cutout-layer-block-b2-1"');
    expect(expandedCanvasHtml).toContain('data-testid="cutout-depth-pill-b2-1"');
  });

  it("wires depth-map diagnostic overlay and lane mute toggles in CinematicPreview", () => {
    const project = makeDepthCutoutFixture();
    const b2 = buildKeyframes(project.story).find((f) => f.id === "b2")!;

    const withMapOverlay = renderToStaticMarkup(
      <CinematicPreview
        frame={b2}
        imageSrc={b2.picture}
        resolveMedia={(v) => v}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={false}
        showDepthMaps={true}
        showDepthMapOverlay={true}
        showCutouts={true}
      />,
    );
    expect(withMapOverlay).toContain('data-testid="viewer-depth-map-overlay"');

    const mutedBoth = renderToStaticMarkup(
      <CinematicPreview
        frame={b2}
        imageSrc={b2.picture}
        resolveMedia={(v) => v}
        playing={false}
        soundOn={false}
        showCaption={true}
        showMark={false}
        showDepthMaps={false}
        showDepthMapOverlay={false}
        showCutouts={false}
      />,
    );
    expect(mutedBoth).not.toContain('data-testid="viewer-depth-map-overlay"');
    expect(mutedBoth).not.toContain('class="depth-parallax');
  });

  it("clamps, compacts, and parses stored lane heights and hidden lane sets safely", () => {
    const defaults = createDefaultLaneHeights();
    expect(defaults.video).toBe(LANE_HEIGHT_SPECS.video.defaultHeight);
    expect(defaults.depth).toBe(LANE_HEIGHT_SPECS.depth.defaultHeight);
    expect(defaults.cutouts).toBe(LANE_HEIGHT_SPECS.cutouts.defaultHeight);

    const compact = createCompactLaneHeights();
    expect(compact.video).toBeLessThan(defaults.video);
    expect(compact.voice).toBeLessThan(defaults.voice);
    expect(compact.depth).toBeLessThan(defaults.depth);

    expect(clampLaneHeight("video", 12)).toBe(LANE_HEIGHT_SPECS.video.minHeight);
    expect(clampLaneHeight("video", 999)).toBe(LANE_HEIGHT_SPECS.video.maxHeight);
    expect(clampLaneHeight("depth", 48.4)).toBe(48);

    const parsedHeights = parseStoredLaneHeights(
      JSON.stringify({ video: 64, depth: 52, voice: 4, bogus: 120 }),
    );
    expect(parsedHeights.video).toBe(64);
    expect(parsedHeights.depth).toBe(52);
    expect(parsedHeights.voice).toBe(LANE_HEIGHT_SPECS.voice.minHeight);
    expect(parsedHeights.sfx).toBe(LANE_HEIGHT_SPECS.sfx.defaultHeight);

    expect(parseStoredLaneHeights("{bad-json")).toEqual(defaults);

    const hidden = parseStoredHiddenLanes(
      JSON.stringify(["depth", "sfx", "not-a-lane", 42]),
    );
    expect([...hidden]).toEqual(["depth", "sfx"]);
    expect([...parseStoredHiddenLanes("not-an-array")]).toEqual([]);
  });

  it("renders per-lane resize handles, Eye show/hide buttons, custom lane heights, and hidden lane states across headers and canvas", () => {
    const project = makeDepthCutoutFixture();
    const keyframes = buildKeyframes(project.story);
    const { clips, totalFrames } = buildTimelineClips(keyframes);

    const timelineHtml = renderToStaticMarkup(
      <Timeline
        clips={clips}
        totalFrames={totalFrames}
        playheadFrame={0}
        selectedFrameId="b2"
        selectedFrameIds={["b2"]}
        snapEnabled={true}
        noteMarkers={[]}
        editingMarkerId={null}
        canSplit={false}
        hasClipboard={false}
        resolveMedia={(v) => v}
        onToggleSnap={() => {}}
        onAddNoteMarker={() => {}}
        onUpdateNoteMarker={() => {}}
        onDeleteNoteMarker={() => {}}
        onCloseMarkerEditor={() => {}}
        onEditMarker={() => {}}
        onScrub={() => {}}
        onSetSelection={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onTrimPreview={() => {}}
        onRollPreview={() => {}}
        onMoveClips={() => {}}
        onSetTransition={() => {}}
        onAnimationPreview={() => {}}
        onCopy={() => {}}
        onPaste={() => {}}
        onSplit={() => {}}
        onDelete={() => {}}
        onMoveCue={() => {}}
        onDropFile={() => {}}
      />,
    );

    // Every main lane exposes both an Eye visibility button and a bottom drag-resize handle
    for (const laneId of [
      "captions",
      "video",
      "depth",
      "cutouts",
      "voice",
      "sfx",
      "music",
      "ambience",
    ]) {
      expect(timelineHtml).toContain(`data-testid="track-eye-${laneId}"`);
      expect(timelineHtml).toContain(`data-testid="lane-resize-${laneId}"`);
    }
    expect(timelineHtml).toContain('data-testid="tracks-visibility-btn"');

    // Verify DepthCutoutLaneHeaders + DepthCutoutCanvasLanes honor custom heights & hidden lanes/sublanes
    const hiddenSet = new Set<"depth" | "cutouts">(["depth"]);
    const hiddenSubs = new Set<number>([1]);
    const customHeadersHtml = renderToStaticMarkup(
      <DepthCutoutLaneHeaders
        sublaneCount={3}
        cutoutsExpanded={true}
        showDepthMaps={true}
        showDepthMapOverlay={false}
        showCutouts={true}
        mutedCutoutLayers={new Set()}
        depthClipCount={2}
        cutoutClipCount={2}
        depthHeight={50}
        cutoutsHeight={46}
        cutoutSublaneHeight={38}
        hiddenLanes={hiddenSet}
        hiddenCutoutSublanes={hiddenSubs}
        onToggleLaneVisible={() => {}}
        onToggleCutoutSublaneVisible={() => {}}
        onShowAllCutoutSublanes={() => {}}
        onResizeLane={() => {}}
        onResetLaneHeight={() => {}}
        onToggleCutoutsExpanded={() => {}}
        onAddCutoutSublane={() => {}}
        onToggleShowDepthMaps={() => {}}
        onToggleShowDepthMapOverlay={() => {}}
        onToggleShowCutouts={() => {}}
        onToggleMuteCutoutLayer={() => {}}
      />,
    );
    expect(customHeadersHtml).not.toContain('data-testid="track-header-depth"');
    expect(customHeadersHtml).toContain('data-testid="track-header-cutouts"');
    expect(customHeadersHtml).toContain("height:46px");
    expect(customHeadersHtml).toContain('data-testid="cutout-sublane-header-0"');
    expect(customHeadersHtml).not.toContain('data-testid="cutout-sublane-header-1"');
    expect(customHeadersHtml).toContain('data-testid="cutout-sublane-header-2"');
    expect(customHeadersHtml).toContain('data-testid="cutouts-show-hidden-sublanes-btn"');

    const customCanvasHtml = renderToStaticMarkup(
      <DepthCutoutCanvasLanes
        clips={clips}
        visibleClips={clips}
        pxPerFrame={2}
        selectedFrameId="b2"
        selectedFrameIds={["b2"]}
        selectedCutoutLayer={null}
        sublaneCount={3}
        cutoutsExpanded={true}
        showDepthMaps={true}
        showCutouts={true}
        mutedCutoutLayers={new Set()}
        depthHeight={50}
        cutoutsHeight={46}
        cutoutSublaneHeight={38}
        hiddenLanes={hiddenSet}
        hiddenCutoutSublanes={hiddenSubs}
        resolveMedia={(v) => v}
        frameFromClientX={() => 0}
        onToggleCutoutsExpanded={() => {}}
        onSelectShot={() => {}}
        onSelectCutoutLayer={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    );
    expect(customCanvasHtml).not.toContain('data-testid="timeline-depth-lane"');
    expect(customCanvasHtml).toContain('data-testid="timeline-cutouts-lane"');
    expect(customCanvasHtml).toContain("height:46px");
    expect(customCanvasHtml).toContain('data-testid="timeline-cutout-sublane-0"');
    expect(customCanvasHtml).not.toContain('data-testid="timeline-cutout-sublane-1"');
    expect(customCanvasHtml).toContain('data-testid="timeline-cutout-sublane-2"');

    // Verify CaptionLane & Tracks honor custom heights and hidden audio lanes
    const captionHtml = renderToStaticMarkup(
      <CaptionLane
        allClips={clips}
        visibleClips={clips}
        totalFrames={totalFrames}
        pxPerFrame={2}
        playheadFrame={0}
        snapEnabled={true}
        selectedFrameId="b2"
        selectedCaption={null}
        multiSelectedCaptions={[]}
        multiSelectionTotalCount={0}
        height={52}
        rawFrameFromClientX={() => 0}
        onSetSnapGuide={() => {}}
        onSelectCaption={() => {}}
        onClearCaptionSelection={() => {}}
        onCommitCaptions={() => {}}
        onCaptionPreview={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    );
    expect(captionHtml).toContain("height:52px");

    const tracksHtml = renderToStaticMarkup(
      <Tracks
        clips={clips}
        resolvedAudioClips={[]}
        selectedAudioClipIds={[]}
        totalFrames={totalFrames}
        playheadFrame={0}
        pxPerFrame={2}
        scrollLeft={0}
        viewportWidth={800}
        minVisibleFrame={0}
        maxVisibleFrame={totalFrames}
        snapEnabled={true}
        noteMarkers={[]}
        resolveMedia={(v) => v}
        laneHeights={{ voice: 56, music: 28 }}
        hiddenLanes={new Set(["sfx", "ambience"])}
        onSetSnapGuide={() => {}}
        onSelectAudioClip={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onPreviewUpdateAudioClip={() => {}}
        onShiftAudioDragPreview={() => {}}
        onCommitAudioDrag={() => {}}
      />,
    );
    expect(tracksHtml).toContain('data-testid="lane-voice"');
    expect(tracksHtml).toContain("height:56px");
    expect(tracksHtml).toContain('data-testid="lane-music"');
    expect(tracksHtml).toContain("height:28px");
    expect(tracksHtml).not.toContain('data-testid="lane-sfx"');
    expect(tracksHtml).not.toContain('data-testid="lane-ambience"');
  });
});
