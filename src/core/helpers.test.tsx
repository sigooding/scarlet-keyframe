import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { AssetBrowser } from "../components/AssetBrowser";
import { CinematicPreview } from "../components/CinematicPreview";
import { CropModal } from "../components/CropModal";
import { ExportModal } from "../components/ExportModal";
import { Inspector } from "../components/Inspector";
import { MissingMediaModal } from "../components/MissingMediaModal";
import { SnapshotModal } from "../components/SnapshotModal";
import { Timeline } from "../components/Timeline";
import { Topbar } from "../components/Topbar";
import { Tracks } from "../components/Tracks";
import film from "../data/nobodys-witness-film.json";
import edits from "../data/studio-edits.json";
import { downloadText, measureAudioDuration, slug } from "./helpers";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { writeStudioPatch } from "./patch";
import { buildTimelineClips } from "../sequence/animate";

describe("helper functions", () => {
  it("slug turns titles into clean filenames", () => {
    expect(slug("Nobody's Witness")).toBe("nobodys-witness");
    expect(slug("  Scene 77A: Cut #2! ")).toBe("scene-77a-cut-2");
    expect(slug("")).toBe("animatic");
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
          canSplit={false}
          resolveMedia={resolveMedia}
          onScrub={noop}
          onSelectClip={noop}
          onDragStart={noop}
          onDragEnd={noop}
          onTrimPreview={noop}
          onAnimationPreview={noop}
          onSplit={noop}
          onDelete={noop}
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
          frames={frames}
          playheadFrame={startClip.startFrame}
          selectedFrameId={startFrame.id}
          onSelect={noop}
          onMoveCue={noop}
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
});
