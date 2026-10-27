import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { AssetBrowser } from "../components/AssetBrowser";
import { CinematicPreview } from "../components/CinematicPreview";
import { CropModal } from "../components/CropModal";
import { ExportModal } from "../components/ExportModal";
import { Inspector, parseAmbienceSpec, serializeAmbienceSpec } from "../components/Inspector";
import { MissingMediaModal } from "../components/MissingMediaModal";
import { SnapshotModal } from "../components/SnapshotModal";
import { Timeline } from "../components/Timeline";
import { Topbar } from "../components/Topbar";
import { Tracks } from "../components/Tracks";
import mediaIndex from "../data/media-index.json";
import film from "../data/nobodys-witness-film.json";
import edits from "../data/studio-edits.json";
import { downloadText, measureAudioDuration, pictureLabel, slug } from "./helpers";
import { evaluateMissingMedia, normalizeMediaPath } from "./media";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { writeStudioPatch } from "./patch";
import { extractKnownMusicDurations } from "./previewAudio";
import {
  buildStarterPresetAnimation,
  buildTimelineClips,
} from "../sequence/animate";

describe("helper functions", () => {
  it("slug turns titles into clean filenames", () => {
    expect(slug("Nobody's Witness")).toBe("nobodys-witness");
    expect(slug("  Scene 77A: Cut #2! ")).toBe("scene-77a-cut-2");
    expect(slug("")).toBe("animatic");
  });

  it("pictureLabel labels gradient placeholders as 'No picture'", () => {
    expect(pictureLabel("gradient:linear-gradient(#000,#000)", true)).toBe("No picture");
    expect(pictureLabel("gradient:linear-gradient(#000,#000)", false)).toBe("No picture");
    expect(pictureLabel("/film/img/s78/88-the-waiting-room.jpg", true)).toBe("88-the-waiting-room");
  });

  it("downloadText creates an anchor download and revokes the object URL", () => {
    vi.useFakeTimers();
    const createdBlobs: Blob[] = [];
    const revokedUrls: string[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origDoc = globalThis.document;

    let clickedHref = "";
    let clickedDownload = "";
    let removed = false;

    URL.createObjectURL = (obj: Blob | MediaSource) => {
      createdBlobs.push(obj as Blob);
      return "blob:test-download-url";
    };
    URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
    };

    const fakeLink = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clickedHref = this.href;
        clickedDownload = this.download;
      },
      remove() {
        removed = true;
      },
    };

    const appended: unknown[] = [];
    globalThis.document = {
      createElement: (tag: string) => {
        expect(tag).toBe("a");
        return fakeLink;
      },
      body: {
        appendChild: (node: unknown) => {
          appended.push(node);
          return node;
        },
      },
    } as unknown as Document;

    try {
      downloadText('{"ok":true}', "nobodys-witness.reel.json", "application/json");
      expect(createdBlobs).toHaveLength(1);
      expect(createdBlobs[0].type).toBe("application/json;charset=utf-8");
      expect(appended).toHaveLength(1);
      expect(clickedHref).toBe("blob:test-download-url");
      expect(clickedDownload).toBe("nobodys-witness.reel.json");
      expect(removed).toBe(true);
      expect(revokedUrls).toHaveLength(0);

      vi.advanceTimersByTime(1000);
      expect(revokedUrls).toEqual(["blob:test-download-url"]);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      globalThis.document = origDoc;
      vi.useRealTimers();
    }
  });

  it("measureAudioDuration reads metadata, caches results, and handles errors safely", async () => {
    const cache = new Map<string, number>([["/cached.mp3", 4.25]]);
    expect(await measureAudioDuration("/cached.mp3", cache)).toBe(4.25);
    expect(await measureAudioDuration("", cache)).toBeUndefined();

    const origAudio = globalThis.Audio;
    class FakeAudio {
      preload = "";
      duration = NaN;
      private listeners = new Map<string, Set<() => void>>();
      addEventListener(event: string, fn: () => void) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(fn);
      }
      removeEventListener(event: string, fn: () => void) {
        this.listeners.get(event)?.delete(fn);
      }
      pause() {}
      removeAttribute() {}
      load() {}
      set src(value: string) {
        queueMicrotask(() => {
          if (value.includes("missing")) {
            this.listeners.get("error")?.forEach((fn) => fn());
          } else {
            this.duration = 2.75;
            this.listeners.get("loadedmetadata")?.forEach((fn) => fn());
          }
        });
      }
    }

    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    try {
      const measured = await measureAudioDuration("/voice/line.mp3", cache);
      expect(measured).toBe(2.75);
      expect(cache.get("/voice/line.mp3")).toBe(2.75);

      const failed = await measureAudioDuration("/voice/missing.mp3", cache);
      expect(failed).toBeUndefined();
      expect(cache.has("/voice/missing.mp3")).toBe(false);
    } finally {
      globalThis.Audio = origAudio;
    }
  });
});

describe("App and studio windows", () => {
  const imported = parseImportPayload(film, "nobodys-witness-film.json");
  const project = createProjectState(
    { ...imported, story: applyStudioMusicSync(imported.story, edits) },
    [],
    edits,
  );
  project.missing = ["/film/img/s77/85-the-desk-lamp.jpg", "/film/voice/s77/87-vera.mp3"];
  project.snapshots = [
    {
      id: "snap-1",
      name: "Assembly Cut",
      createdAt: Date.UTC(2026, 9, 27),
      story: project.story,
    },
  ];
  const frames = buildKeyframes(project.story);
  const noop = () => {};

  it("renders App without crashing", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("FRAME");
  });

  it("renders the full workspace (Timeline, CinematicPreview, Tracks, Inspector, AssetBrowser) on Scene 77", () => {
    const { clips, totalFrames } = buildTimelineClips(frames);
    const startClip = clips.find((clip) => clip.keyframe.mark === "77") || clips[0];
    const startFrame = startClip.keyframe;
    const resolveMedia = () => undefined;
    const workspaceHtml = renderToStaticMarkup(
      <div>
        <Timeline
          clips={clips}
          totalFrames={totalFrames}
          playheadFrame={startClip.startFrame}
          selectedFrameId={startFrame.id}
          selectedFrameIds={[startFrame.id]}
          snapEnabled={true}
          noteMarkers={[]}
          editingMarkerId={null}
          canSplit={false}
          hasClipboard={false}
          resolveMedia={resolveMedia}
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
        />
        <CinematicPreview
          frame={startFrame}
          localFrame={0}
          imageSrc={undefined}
          imagePosition={undefined}
          resolveMedia={resolveMedia}
          playing={false}
          soundOn={true}
          showCaption={true}
          showMark={true}
          setFocalPoint={noop}
        />
        <Tracks
          clips={clips}
          resolvedAudioClips={[]}
          selectedAudioClipIds={[]}
          totalFrames={totalFrames}
          playheadFrame={startClip.startFrame}
          pxPerFrame={3}
          scrollLeft={0}
          viewportWidth={900}
          minVisibleFrame={Math.max(0, startClip.startFrame - 240)}
          maxVisibleFrame={startClip.startFrame + 480}
          snapEnabled={true}
          noteMarkers={[]}
          resolveMedia={resolveMedia}
          onSetSnapGuide={noop}
          onSelectAudioClip={noop}
          onDragStart={noop}
          onDragEnd={noop}
          onPreviewUpdateAudioClip={noop}
          onShiftAudioDragPreview={noop}
          onCommitAudioDrag={noop}
        />
        <Inspector
          project={project}
          frame={startFrame}
          localFrame={0}
          clipDurationFrames={startClip.durationFrames}
          canSplit={false}
          pictureSrc={undefined}
          selectedCount={1}
          copied={false}
          onBrowse={noop}
          onUpload={noop}
          onSetPicture={noop}
          onSetAnimation={noop}
          onPreviewAnimation={noop}
          onDragStart={noop}
          onDragEnd={noop}
          onJumpToLocalFrame={noop}
          onSetEffect={noop}
          onResetEffect={noop}
          onSetBeat={noop}
          onSetScene={noop}
          onCopyEffects={noop}
          onPasteEffects={noop}
          onPlayVoice={noop}
          onSplit={noop}
          onInsert={noop}
          onDuplicate={noop}
          onDelete={noop}
          onMove={noop}
          onPreviewSfx={noop}
        />
        <AssetBrowser
          title="Choose a picture"
          kind="image"
          items={[{ id: "img-1", ref: "/film/img/s77/85-the-desk-lamp.jpg", name: "85-the-desk-lamp.jpg", folder: "film/img/s77", missing: true }]}
          onSelect={noop}
          onClose={noop}
        />
      </div>,
    );
    expect(workspaceHtml).toContain("SC 77");
    expect(workspaceHtml).toContain("Animation");
    expect(workspaceHtml).toContain("CLIP INSPECTOR");
    for (const id of ["video", "voice", "sfx", "music", "ambience"]) {
      expect(workspaceHtml).toContain(`data-testid="track-header-${id}"`);
      expect(workspaceHtml).toContain(`data-testid="track-mute-${id}"`);
      expect(workspaceHtml).toContain(`data-testid="track-solo-${id}"`);
      expect(workspaceHtml).toContain(`data-testid="track-level-${id}"`);
    }
    expect(workspaceHtml).toContain('data-testid="lane-voice"');
    expect(workspaceHtml).toContain('data-testid="lane-sfx"');
    expect(workspaceHtml).not.toContain("VOX / SFX");
  });

  it("labels gradient placeholder clips (such as scene 77A) as 'No picture' instead of raw gradient text", () => {
    const { clips, totalFrames } = buildTimelineClips(frames);
    const s77aClip = clips.find((clip) => clip.keyframe.mark === "77A")!;
    expect(s77aClip).toBeDefined();
    expect(s77aClip.keyframe.picture).toMatch(/^gradient:/);

    const html77a = renderToStaticMarkup(
      <Timeline
        clips={clips}
        totalFrames={totalFrames}
        playheadFrame={s77aClip.startFrame}
        selectedFrameId={s77aClip.keyframe.id}
        selectedFrameIds={[s77aClip.keyframe.id]}
        snapEnabled={true}
        noteMarkers={[]}
        editingMarkerId={null}
        canSplit={false}
        hasClipboard={false}
        musicDurations={extractKnownMusicDurations(edits)}
        resolveMedia={() => undefined}
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
    expect(html77a).toContain("No picture");
    expect(html77a).not.toContain("gradient:linear-gradient");
  });

  it("drives each shot from a single keyframe camera only and never double-transforms plate or missing card", () => {
    const baseFrame = frames.find((frame) => frame.mark === "77") || frames[0];
    const resolveMedia = () => undefined;

    // A shot with no keyframes is a still picture even if `cinematic.mode` is set.
    const unkeyframedFrame = {
      ...baseFrame,
      beat: {
        ...baseFrame.beat,
        animation: undefined,
        cinematic: { ...baseFrame.beat.cinematic, mode: "pan" },
      },
    };
    const stillHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={unkeyframedFrame}
        localFrame={12}
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
      />,
    );
    expect(stillHtml).not.toContain('class="cin-preview-plate cin-pan');
    expect(stillHtml).toContain("cin-preview-plate cin-static");
    expect(stillHtml).toContain('data-testid="cinematic-camera" style="transform:none');

    const keyframedFrame = {
      ...unkeyframedFrame,
      beat: {
        ...unkeyframedFrame.beat,
        animation: {
          zoom: [
            { frame: 0, value: 1, easing: "linear" as const },
            { frame: 24, value: 1.5, easing: "linear" as const },
          ],
          x: [{ frame: 0, value: -10, easing: "linear" as const }],
        },
      },
    };
    const keyframedHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={keyframedFrame}
        localFrame={12}
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
      />,
    );
    expect(keyframedHtml).not.toContain('class="cin-preview-plate cin-pan');
    expect(keyframedHtml).toContain("cin-preview-plate cin-static");
    // Applied once on `.cin-preview-camera`, while `.cin-preview-plate` and `.cin-preview-missing` have `transform:none`
    const matches = keyframedHtml.match(/translate\(-10%, 0%\) scale\(1\.25\)/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(keyframedHtml).toContain('class="cin-preview-missing" style="transform:none;animation:none;transition:none"');
    expect(keyframedHtml).toContain("animation:none");
    expect(keyframedHtml).toContain("transition:none");
  });

  it("renders Topbar with project title, missing media count, and actions", () => {
    const html = renderToStaticMarkup(
      <Topbar
        project={project}
        saveStatus="FILM READY"
        historyVersion={1}
        canUndo={true}
        canRedo={false}
        onUndo={noop}
        onRedo={noop}
        onImport={noop}
        onLinkFolder={noop}
        folderLabel=""
        onSnapshot={noop}
        onExport={noop}
        onSave={noop}
        missingCount={project.missing.length}
        onMissing={noop}
        editLabel="Ready"
        totalDuration={3725}
      />,
    );
    expect(html).toContain("Nobody&#x27;s Witness");
    expect(html).toContain("2 unlinked");
    expect(html).toContain("Link folder");
    expect(html).toContain("Snapshots (1)");
    expect(html).toContain("Export");
  });

  it("renders MissingMediaModal, SnapshotModal, CropModal, and ExportModal tabs", () => {
    const missingHtml = renderToStaticMarkup(
      <MissingMediaModal
        items={project.missing}
        folderLabel=""
        onClose={noop}
        onLink={noop}
      />,
    );
    expect(missingHtml).toContain("2 unlinked media paths");
    expect(missingHtml).toContain("/film/img/s77/85-the-desk-lamp.jpg");

    const snapshotHtml = renderToStaticMarkup(
      <SnapshotModal
        project={project}
        name="Director Cut"
        setName={noop}
        onSave={noop}
        onClose={noop}
        onRestore={noop}
      />,
    );
    expect(snapshotHtml).toContain("Assembly Cut");
    expect(snapshotHtml).toContain("Restore");

    const cropHtml = renderToStaticMarkup(
      <CropModal
        crop={{ assetId: "asset-1", frameId: frames[0].id, x: 40, y: 60 }}
        imageSrc="blob:test-image"
        onChange={noop}
        onSave={noop}
        onSkip={noop}
      />,
    );
    expect(cropHtml).toContain("40%");
    expect(cropHtml).toContain("60%");

    for (const tab of ["bundle", "patch", "mp4"] as const) {
      const exportHtml = renderToStaticMarkup(
        <ExportModal
          project={project}
          frames={frames}
          tab={tab}
          setTab={noop}
          progress={tab === "bundle" ? 50 : 0}
          message="Ready to export"
          patchReport={tab === "patch" ? writeStudioPatch(project) : null}
          mp4Message={tab === "mp4" ? "Playwright Chromium note" : ""}
          rangeStart={0}
          rangeEnd={10}
          setRangeStart={noop}
          setRangeEnd={noop}
          captions={true}
          marks={true}
          setCaptions={noop}
          setMarks={noop}
          onBundle={noop}
          onPatch={noop}
          onSrt={noop}
          onMp4={noop}
          onClose={noop}
          onRestoreSnapshot={noop}
        />,
      );
      expect(exportHtml).toContain("Export");
      expect(exportHtml).toContain("Ready to export");
    }
  });

  it("resolves all film media references against sigooding/scarlett-witness media-index with zero unlinked files", () => {
    const cleanProject = createProjectState(
      { ...imported, story: applyStudioMusicSync(imported.story, edits) },
      [],
      edits,
    );
    const paths = new Set((mediaIndex as string[]).map(normalizeMediaPath));
    const missing = evaluateMissingMedia(cleanProject, new Map(), paths);
    expect(missing).toEqual([]);
  });

  it("renders dedicated Voice, SFX, Music, and Ambience file selection settings tabs in Inspector", () => {
    expect(parseAmbienceSpec("rain+file:/film/sfx/amb-city-traffic.mp3")).toEqual({
      mode: "layers",
      synth: "rain",
      files: ["/film/sfx/amb-city-traffic.mp3"],
    });
    expect(serializeAmbienceSpec("rain", ["/film/sfx/amb-city-traffic.mp3"])).toBe(
      "rain+file:/film/sfx/amb-city-traffic.mp3",
    );

    const sampleFrame = frames.find((f) => f.beat.audioUrl || f.beat.sfxUrl) || frames[0];
    for (const [tab, testId] of [
      ["voice", "choose-voice-btn"],
      ["sfx", "choose-sfx-btn"],
      ["music", "choose-music-btn"],
      ["ambience", "choose-ambience-btn"],
    ] as const) {
      const html = renderToStaticMarkup(
        <Inspector
          project={project}
          frame={sampleFrame}
          localFrame={0}
          clipDurationFrames={48}
          canSplit={false}
          pictureSrc={undefined}
          selectedCount={1}
          copied={false}
          activeTab={tab}
          onBrowse={noop}
          onUpload={noop}
          onSetPicture={noop}
          onSetAnimation={noop}
          onPreviewAnimation={noop}
          onDragStart={noop}
          onDragEnd={noop}
          onJumpToLocalFrame={noop}
          onSetEffect={noop}
          onResetEffect={noop}
          onSetBeat={noop}
          onSetScene={noop}
          onCopyEffects={noop}
          onPasteEffects={noop}
          onPlayVoice={noop}
          onPreviewSfx={noop}
          onSplit={noop}
          onInsert={noop}
          onDuplicate={noop}
          onDelete={noop}
          onMove={noop}
        />,
      );
      expect(html).toContain(`data-testid="inspector-panel-${tab}"`);
      expect(html).toContain(`data-testid="${testId}"`);
    }
  });

  it("keeps camera movement transforms continuous across transitions without snapping to scale(1)", () => {
    const { clips } = buildTimelineClips(frames);
    const resolveMedia = () => undefined;
    const outgoingClip = clips[0];
    const baseIncomingKf = {
      ...clips[1].keyframe,
      beat: {
        ...clips[1].keyframe.beat,
        cinematic: { mode: "pan", panDistance: 6, zoomDuration: 10 },
      },
    };
    const convertedAnim = buildStarterPresetAnimation(
      "authored",
      baseIncomingKf,
      clips[1].durationFrames,
    );
    const incomingClip = {
      ...clips[1],
      keyframe: {
        ...baseIncomingKf,
        beat: {
          ...baseIncomingKf.beat,
          animation: convertedAnim,
        },
      },
    };

    const duringTransitionHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={incomingClip.keyframe}
        localFrame={11}
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
        transition={{
          kind: "dissolve",
          alignment: "at-cut",
          progress: 11 / 12,
          cutFrame: incomingClip.startFrame,
          startFrame: incomingClip.startFrame,
          endFrame: incomingClip.startFrame + 12,
          durationFrames: 12,
          outgoingClip,
          outLocalFrame: outgoingClip.durationFrames - 1,
          incomingClip,
          inLocalFrame: 11,
        }}
      />,
    );

    const sameFrameNoTransitionHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={incomingClip.keyframe}
        localFrame={11}
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
      />,
    );

    const extractIncomingCameraTransform = (markup: string): string => {
      const camIdx = markup.indexOf('data-testid="cinematic-camera"');
      expect(camIdx).toBeGreaterThan(0);
      const tagStart = markup.lastIndexOf("<div", camIdx);
      const tagEnd = markup.indexOf(">", camIdx);
      const tag = markup.slice(tagStart, tagEnd);
      const match = tag.match(/transform:([^;"]+)/);
      return match ? match[1] : "";
    };

    const tDuring = extractIncomingCameraTransform(duringTransitionHtml);
    const tSteady = extractIncomingCameraTransform(sameFrameNoTransitionHtml);

    expect(tDuring).toBeTruthy();
    expect(tDuring).toBe(tSteady);
    expect(tDuring).toContain("scale(1.12");
  });

  it("keeps plate and depth canvas transforms equal at frames 0, 12, and 48 and updates depthAmount on every frame", () => {
    const { clips } = buildTimelineClips(frames);
    const depthKeyframe = {
      ...clips[0].keyframe,
      picture: "/film/img/s1/shot-a.jpg",
      cinematic: {
        mode: "zoom-hold",
        depthMap: "/film/depth/s1/shot-a/depth.png",
        depthMotion: "push",
        depthAmount: 0.4,
      },
      beat: {
        ...clips[0].keyframe.beat,
        cinematic: {
          mode: "zoom-hold",
          depthMap: "/film/depth/s1/shot-a/depth.png",
          depthMotion: "push",
          depthAmount: 0.4,
        },
        animation: {
          zoom: [
            { frame: 0, value: 1, easing: "linear" as const },
            { frame: 48, value: 1.4, easing: "linear" as const },
          ],
          x: [
            { frame: 0, value: 0, easing: "linear" as const },
            { frame: 48, value: 6, easing: "linear" as const },
          ],
          y: [
            { frame: 0, value: 0, easing: "linear" as const },
            { frame: 48, value: -4, easing: "linear" as const },
          ],
          rotation: [
            { frame: 0, value: 0, easing: "linear" as const },
            { frame: 48, value: 2, easing: "linear" as const },
          ],
          depthAmount: [
            { frame: 0, value: 0.2, easing: "linear" as const },
            { frame: 48, value: 0.8, easing: "linear" as const },
          ],
        },
      },
    };
    const outgoingClip = { ...clips[0], keyframe: depthKeyframe };
    const incomingClip = clips[1];
    const resolveMedia = (v: string | undefined) => v;

    const extractTagStyleProp = (markup: string, marker: string, prop: string): string => {
      const idx = markup.indexOf(marker);
      expect(idx).toBeGreaterThan(0);
      const start = markup.lastIndexOf("<", idx);
      const end = markup.indexOf(">", idx);
      const tag = markup.slice(start, end);
      const match = tag.match(new RegExp(`${prop}:([^;"]+)`));
      return match ? match[1] : "";
    };

    const extractDataAttr = (markup: string, attr: string): string => {
      const m = markup.match(new RegExp(`${attr}="([^"]+)"`));
      return m ? m[1] : "";
    };

    const depthAmountsByFrame: number[] = [];
    for (const testFrame of [0, 12, 48]) {
      const html = renderToStaticMarkup(
        <CinematicPreview
          frame={depthKeyframe}
          localFrame={testFrame}
          imageSrc="/film/img/s1/shot-a.jpg"
          resolveMedia={resolveMedia}
          playing={false}
          soundOn={false}
          showCaption={false}
          showMark={true}
        />,
      );

      const cameraTransform = extractTagStyleProp(html, 'data-testid="cinematic-camera"', "transform");
      const plateTransform = extractTagStyleProp(html, 'data-testid="cinematic-plate"', "transform");
      const canvasTransform = extractTagStyleProp(html, 'class="depth-parallax"', "transform");

      // Plate and canvas sit inside the same `.cin-preview-camera` wrapper and have equal transforms.
      expect(plateTransform).toBe("none");
      expect(canvasTransform).toBe("none");
      expect(`${cameraTransform}|${plateTransform}`).toBe(`${cameraTransform}|${canvasTransform}`);

      // Wrapper rotates only (never double-applies translate/scale).
      expect(cameraTransform).not.toContain("translate(");
      expect(cameraTransform).toContain("rotate(");

      depthAmountsByFrame.push(Number(extractDataAttr(html, "data-depth-amount")));
    }

    // `depthAmount` changes across frames 0 -> 12 -> 48 (`0.2 -> 0.35 -> 0.8`).
    expect(depthAmountsByFrame[0]).toBeCloseTo(0.2, 4);
    expect(depthAmountsByFrame[1]).toBeCloseTo(0.35, 4);
    expect(depthAmountsByFrame[2]).toBeCloseTo(0.8, 4);
    expect(depthAmountsByFrame[2]).not.toBeCloseTo(depthAmountsByFrame[0], 2);

    // Also equal during a dissolve transition.
    const transitionHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={incomingClip.keyframe}
        localFrame={0}
        imageSrc="/film/img/s1/shot-b.jpg"
        outgoingImageSrc="/film/img/s1/shot-a.jpg"
        incomingImageSrc="/film/img/s1/shot-b.jpg"
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
        transition={{
          kind: "dissolve",
          alignment: "at-cut",
          progress: 0.5,
          cutFrame: incomingClip.startFrame,
          startFrame: incomingClip.startFrame,
          endFrame: incomingClip.startFrame + 12,
          durationFrames: 12,
          outgoingClip,
          outLocalFrame: 24,
          incomingClip,
          inLocalFrame: 0,
        }}
      />,
    );
    const outPlateTransform = extractTagStyleProp(
      transitionHtml,
      'data-testid="cinematic-plate-outgoing"',
      "transform",
    );
    const outCanvasTransform = extractTagStyleProp(
      transitionHtml,
      'class="depth-parallax"',
      "transform",
    );
    expect(outPlateTransform).toBe(outCanvasTransform);
  });

  it("applies animated opacity, blur, exposure, rotation, and gradeStrength directly to the viewer style", () => {
    const project = createProjectState({
      sourceName: "viewer-props-test.json",
      story: {
        id: "viewer-props-test",
        title: "Viewer Props Test",
        startSceneId: "s1",
        characters: [],
        scenes: [
          {
            id: "s1",
            title: "Scene 1",
            background: "/film/img/s1/shot.jpg",
            cinematic: {
              mode: "static",
              colorGrade: "noir",
              filmGrade: true,
            },
            dialogueBeats: [
              {
                id: "b1",
                text: "Fading in from blur",
                durationFrames: 24,
                animation: {
                  opacity: [
                    { frame: 0, value: 0, easing: "linear" },
                    { frame: 12, value: 1, easing: "linear" },
                  ],
                  blur: [
                    { frame: 0, value: 16, easing: "linear" },
                    { frame: 12, value: 0, easing: "linear" },
                  ],
                  exposure: [
                    { frame: 0, value: -1, easing: "linear" },
                    { frame: 12, value: 1, easing: "linear" },
                  ],
                  rotation: [
                    { frame: 0, value: 0, easing: "linear" },
                    { frame: 12, value: 3, easing: "linear" },
                  ],
                  gradeStrength: [
                    { frame: 0, value: 0, easing: "linear" },
                    { frame: 12, value: 0.5, easing: "linear" },
                  ],
                },
              },
            ],
          },
        ],
      },
      assets: [],
      missing: [],
    });

    const kf = buildKeyframes(project.story)[0];

    // At localFrame = 0: opacity 0, blur 16px, exposure -1 -> brightness(0.5), rotation 0deg, gradeStrength 0
    const html0 = renderToStaticMarkup(
      <CinematicPreview
        frame={kf}
        localFrame={0}
        imageSrc="/film/img/s1/shot.jpg"
        resolveMedia={(r) => r}
        playing={false}
        soundOn={false}
        showCaption={false}
        showMark={false}
        setFocalPoint={() => undefined}
      />,
    );
    expect(html0).toContain("opacity:0");
    expect(html0).toContain("filter:blur(16px) brightness(0.5)");
    expect(html0).toContain("rotate(0deg)");
    expect(html0).toContain('data-testid="cinematic-plate-graded"');

    // At localFrame = 6 (halfway of 0..12): opacity 0.5, blur 8px, exposure 0 -> brightness(1), rotation 1.5deg, gradeStrength 0.25
    const html6 = renderToStaticMarkup(
      <CinematicPreview
        frame={kf}
        localFrame={6}
        imageSrc="/film/img/s1/shot.jpg"
        resolveMedia={(r) => r}
        playing={false}
        soundOn={false}
        showCaption={false}
        showMark={false}
        setFocalPoint={() => undefined}
      />,
    );
    expect(html6).toContain("opacity:0.5");
    expect(html6).toContain("filter:blur(8px) brightness(1)");
    expect(html6).toContain("rotate(1.5deg)");

    // At localFrame = 12: opacity 1, blur 0px, exposure +1 -> brightness(2), rotation 3deg, gradeStrength 0.5
    const html12 = renderToStaticMarkup(
      <CinematicPreview
        frame={kf}
        localFrame={12}
        imageSrc="/film/img/s1/shot.jpg"
        resolveMedia={(r) => r}
        playing={false}
        soundOn={false}
        showCaption={false}
        showMark={false}
        setFocalPoint={() => undefined}
      />,
    );
    expect(html12).toContain("opacity:1");
    expect(html12).toContain("filter:blur(0px) brightness(2)");
    expect(html12).toContain("rotate(3deg)");
  });

  it("renders plain non-keyframed transforms, safe guides, 30% onion skin, timecode, and Ken Burns boxes", () => {
    const project = createProjectState({
      sourceName: "turn11-viewer.json",
      story: {
        id: "turn11-viewer",
        title: "Turn 11 Viewer",
        startSceneId: "s1",
        characters: [],
        scenes: [
          {
            id: "s1",
            animaticMark: "77",
            background: "/film/img/s77/85-the-desk-lamp.jpg",
            dialogueBeats: [
              {
                id: "b1",
                text: "Plain framed shot",
                durationFrames: 48,
                animation: {
                  values: { zoom: 1.5, x: -10, y: 8, rotation: 2 },
                },
              },
              {
                id: "b2",
                text: "Ken Burns shot",
                durationFrames: 48,
                animation: {
                  kenBurns: {
                    start: { x: 0, y: 0, width: 1 },
                    end: { x: 0.25, y: 0.15, width: 0.5 },
                  },
                  zoom: [
                    { frame: 0, value: 1, easing: "ease-in-out" },
                    { frame: 47, value: 2, easing: "ease-in-out" },
                  ],
                },
              },
            ],
          },
        ],
      },
      assets: [],
      missing: [],
    });

    const [plainKf, kbKf] = buildKeyframes(project.story);

    const plainHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={plainKf}
        localFrame={20}
        playheadFrame={144}
        totalFrames={480}
        imageSrc="/film/img/s77/85-the-desk-lamp.jpg"
        prevOnionSrc="/film/img/prev.jpg"
        nextOnionSrc="/film/img/next.jpg"
        resolveMedia={(r) => r}
        playing={false}
        soundOn={false}
        showCaption={false}
        showMark={true}
        showTimecodeOverlay={true}
        showSafeGuides={true}
        showOnionSkin={true}
        interactiveFraming={true}
        onPreviewAnimation={() => undefined}
        onToggleSafeGuides={() => undefined}
        onToggleOnionSkin={() => undefined}
        onToggleTimecodeOverlay={() => undefined}
        onToggleMarkOverlay={() => undefined}
        onToggleFullscreen={() => undefined}
        onToggleKenBurns={() => undefined}
      />,
    );

    expect(plainHtml).toContain("translate(-10%, 8%) scale(1.5) rotate(2deg)");
    expect(plainHtml).toContain('data-testid="viewer-rotation-handle"');
    expect(plainHtml).toContain('data-testid="viewer-action-safe"');
    expect(plainHtml).toContain('data-testid="viewer-title-safe"');
    expect(plainHtml).toContain('data-testid="viewer-onion-prev"');
    expect(plainHtml).toContain('data-testid="viewer-onion-next"');
    expect(plainHtml).toContain("opacity:0.3");
    expect(plainHtml).toContain('data-testid="viewer-timecode-overlay"');
    expect(plainHtml).toContain("00:06:00");
    expect(plainHtml).toContain("SC 77");

    // When a Ken Burns clip is selected while paused, both START and END boxes reappear
    const kbPausedHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={kbKf}
        localFrame={0}
        imageSrc="/film/img/s77/85-the-desk-lamp.jpg"
        resolveMedia={(r) => r}
        playing={false}
        soundOn={false}
        showCaption={false}
        showMark={true}
        interactiveFraming={true}
        onPreviewAnimation={() => undefined}
      />,
    );
    expect(kbPausedHtml).toContain('data-testid="ken-burns-start-box"');
    expect(kbPausedHtml).toContain('data-testid="ken-burns-end-box"');

    // During playback, boxes hide and the live camera move plays
    const kbPlayingHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={kbKf}
        localFrame={47}
        imageSrc="/film/img/s77/85-the-desk-lamp.jpg"
        resolveMedia={(r) => r}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
        interactiveFraming={true}
        onPreviewAnimation={() => undefined}
      />,
    );
    expect(kbPlayingHtml).not.toContain('data-testid="ken-burns-start-box"');
    expect(kbPlayingHtml).toContain("scale(2)");
  });

  it("drives grain, film overlays, lights, lens flare, and lens rain from frame time with zero CSS animations", () => {
    const project = createProjectState(
      parseImportPayload(
        {
          id: "frame-fx-test",
          title: "Frame FX",
          startSceneId: "s1",
          scenes: [
            {
              id: "s1",
              background: "/film/img/s1/332-the-sedan-blocks-the-lane.jpg",
              particles: "rain",
              cinematic: {
                mode: "static",
                colorGrade: "midnight-teal",
                filmGrade: true,
                grain: true,
                lights: [
                  {
                    x: 40,
                    y: 35,
                    color: "#ffc56b",
                    size: 20,
                    intensity: 0.6,
                    pulseSeconds: 2.4,
                    pulseAmount: 0.8,
                  },
                ],
                lensFlare: {
                  preset: "anamorphic-blue",
                  x: 42,
                  y: 48,
                  intensity: 0.65,
                  pulseSeconds: 2.0,
                  pulseAmount: 0.5,
                },
              },
              dialogueBeats: [{ id: "fx-beat-1", text: "Headlights in rain.", durationFrames: 96 }],
            },
          ],
        },
        "fx.json",
      ),
    );
    const kf = buildKeyframes(project.story)[0];
    const renderAt = (f: number) =>
      renderToStaticMarkup(
        <CinematicPreview
          frame={kf}
          localFrame={f}
          presetFrame={f}
          shotKeyId={kf.id}
          imageSrc="/film/img/s1/332-the-sedan-blocks-the-lane.jpg"
          resolveMedia={(r) => r}
          playing={false}
          soundOn={false}
          showCaption={true}
          showMark={true}
        />,
      );

    const htmlAt0 = renderAt(0);
    const htmlAt17First = renderAt(17);
    const htmlAt61 = renderAt(61);
    const htmlAt17Again = renderAt(17);

    // Identical markup for the same frame before and after scrubbing elsewhere
    expect(htmlAt17Again).toBe(htmlAt17First);
    expect(htmlAt17First).not.toBe(htmlAt0);
    expect(htmlAt61).not.toBe(htmlAt17First);

    // Frame-driven elements present, legacy CSS animation classes absent on plate/viewer
    expect(htmlAt17First).toContain('data-testid="frame-grain-overlay"');
    expect(htmlAt17First).toContain('data-testid="frame-light-0"');
    expect(htmlAt17First).toContain('data-testid="frame-lens-flare"');
    expect(htmlAt17First).toContain('data-testid="frame-rain-lens"');
    expect(htmlAt17First).toContain('data-testid="frame-particles-rain"');
    expect(htmlAt17First).not.toContain("fx-grain");
    expect(htmlAt17First).not.toContain('class="cin-preview-plate cin-static film-grade');
  });
});

