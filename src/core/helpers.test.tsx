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
import { buildTimelineClips } from "../sequence/animate";

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

  it("applies direct translate/scale transform and disables Scarlet Reel camera preset only on clips with keyframes", () => {
    const baseFrame = frames.find((frame) => frame.mark === "77") || frames[0];
    const resolveMedia = () => undefined;

    const presetFrame = {
      ...baseFrame,
      beat: { ...baseFrame.beat, cinematic: { ...baseFrame.beat.cinematic, mode: "pan" } },
    };
    const presetHtml = renderToStaticMarkup(
      <CinematicPreview
        frame={presetFrame}
        localFrame={12}
        resolveMedia={resolveMedia}
        playing={true}
        soundOn={false}
        showCaption={false}
        showMark={true}
      />,
    );
    expect(presetHtml).toContain('class="cin-preview-plate cin-pan"');

    const keyframedFrame = {
      ...presetFrame,
      beat: {
        ...presetFrame.beat,
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
    expect(keyframedHtml).not.toContain('class="cin-preview-plate cin-pan"');
    expect(keyframedHtml).toContain('class="cin-preview-plate cin-static"');
    expect(keyframedHtml).toContain("translate(-10%, 0%) scale(1.25)");
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
    const incomingClip = {
      ...clips[1],
      keyframe: {
        ...clips[1].keyframe,
        beat: {
          ...clips[1].keyframe.beat,
          cinematic: { mode: "pan", panDistance: 6, zoomDuration: 10 },
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

    const extractIncomingTransform = (markup: string): string => {
      const plateIdx = markup.indexOf('data-testid="cinematic-plate"');
      expect(plateIdx).toBeGreaterThan(0);
      const tagStart = markup.lastIndexOf("<div", plateIdx);
      const tagEnd = markup.indexOf(">", plateIdx);
      const tag = markup.slice(tagStart, tagEnd);
      const match = tag.match(/transform:([^;"]+)/);
      return match ? match[1] : "";
    };

    const tDuring = extractIncomingTransform(duringTransitionHtml);
    const tSteady = extractIncomingTransform(sameFrameNoTransitionHtml);

    // Transform during transition and without transition at the same localFrame must match identically (never snap to scale(1))
    expect(tDuring).toBeTruthy();
    expect(tDuring).toBe(tSteady);
    expect(tDuring).toContain("scale(1.12");
  });
});
