import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS, ShortcutsOverlay } from "../components/ShortcutsOverlay";
import { Tracks } from "../components/Tracks";
import { Topbar } from "../components/Topbar";
import film from "../data/nobodys-witness-film.json";
import edits from "../data/studio-edits.json";
import { type AudioClip, type ResolvedAudioClip } from "../core/audioClips";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../core/model";
import { buildTimelineClips } from "../sequence/animate";

const noop = () => {};

function makeFixture() {
  const imported = parseImportPayload(film, "nobodys-witness-film.json");
  const project = createProjectState(
    { ...imported, story: applyStudioMusicSync(imported.story, edits) },
    [],
    edits,
  );
  const frames = buildKeyframes(project.story);
  const { clips, totalFrames } = buildTimelineClips(frames);
  return { frames, clips, totalFrames };
}

describe("ShortcutsOverlay", () => {
  it("renders every shortcut group with its kbd rows when open", () => {
    const html = renderToStaticMarkup(<ShortcutsOverlay open onClose={noop} />);
    expect(html).toContain("Keyboard Shortcuts");
    expect(html).toContain('data-testid="shortcuts-overlay"');
    expect(html).toContain('data-testid="shortcuts-close"');
    const escapeHtml = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const group of SHORTCUT_GROUPS) {
      expect(html).toContain(escapeHtml(group.title));
      for (const row of group.rows) {
        expect(html).toContain(escapeHtml(row.keys));
        expect(html).toContain(escapeHtml(row.label));
      }
    }
    // The real hotkeys promised by the editor
    expect(html).toContain("Split selected caption or clip at playhead");
    expect(html).toContain("Toggle magnetic snap");
    expect(html).toContain("Hold to Compare with a reference cut");
    expect(html).toContain("Add a volume automation point");
  });

  it("renders nothing while closed", () => {
    expect(renderToStaticMarkup(<ShortcutsOverlay open={false} onClose={noop} />)).toBe("");
  });

  it("lists a sane shape of groups and rows", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThanOrEqual(4);
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title).toBeTruthy();
      expect(group.rows.length).toBeGreaterThan(0);
      for (const row of group.rows) {
        expect(row.keys).toBeTruthy();
        expect(row.label).toBeTruthy();
      }
    }
    const allKeys = SHORTCUT_GROUPS.flatMap((g) => g.rows.map((r) => r.keys));
    expect(allKeys).toContain("Space");
    expect(allKeys).toContain("?");
  });

  it("shows a Shortcuts button in the topbar wired to onShowShortcuts", () => {
    const html = renderToStaticMarkup(
      <Topbar
        project={makeTopbarProject()}
        saveStatus="Saved"
        historyVersion={0}
        canUndo={false}
        canRedo={false}
        onUndo={noop}
        onRedo={noop}
        onImport={noop}
        onLinkFolder={noop}
        folderLabel=""
        onSnapshot={noop}
        onExport={noop}
        onSave={noop}
        onShowShortcuts={noop}
        missingCount={0}
        onMissing={noop}
        editLabel="Ready"
        totalDuration={1000}
      />,
    );
    expect(html).toContain('data-testid="shortcuts-btn"');
    expect(html).toContain("Shortcuts");
  });
});

// Small local factory so the Topbar render test does not depend on the film fixture
function makeTopbarProject() {
  const imported = parseImportPayload(
    {
      id: "t",
      title: "T",
      startSceneId: "sc1",
      scenes: [
        {
          id: "sc1",
          sceneNumber: 1,
          title: "One",
          background: "gradient:x",
          dialogueBeats: [{ id: "b1", speaker: "A", text: "Hi", durationFrames: 24, background: "gradient:y" }],
        },
      ],
    },
    "t.json",
  );
  return createProjectState(imported, []);
}

describe("Tracks volume automation rendering", () => {
  it("renders the volume curve and key points for a music-lane clip", () => {
    const { clips, totalFrames } = makeFixture();
    const musicClip: AudioClip = {
      id: "ac-music-vol",
      lane: "music",
      src: "/film/audio/theme.mp3",
      anchorId: clips[0].keyframe.id,
      offsetMs: 0,
      inMs: 0,
      durationMs: 4000,
      gain: 0.5,
      fadeInMs: 0,
      fadeOutMs: 0,
      volumeKeys: [
        { atMs: 1000, gain: 0.4 },
        { atMs: 3000, gain: 1.2 },
      ],
    };
    const resolved: ResolvedAudioClip = {
      ...musicClip,
      anchorStartMs: clips[0].startFrame * (1000 / 24),
      startMs: clips[0].startFrame * (1000 / 24),
      endMs: clips[0].startFrame * (1000 / 24) + 4000,
    };
    const html = renderToStaticMarkup(
      <Tracks
        clips={clips}
        resolvedAudioClips={[resolved]}
        selectedAudioClipIds={[]}
        totalFrames={totalFrames}
        playheadFrame={clips[0].startFrame}
        pxPerFrame={3}
        scrollLeft={0}
        viewportWidth={900}
        minVisibleFrame={Math.max(0, clips[0].startFrame - 240)}
        maxVisibleFrame={clips[0].startFrame + 480}
        snapEnabled={true}
        noteMarkers={[]}
        resolveMedia={() => undefined}
        onSetSnapGuide={noop}
        onSelectAudioClip={noop}
        onDragStart={noop}
        onDragEnd={noop}
        onPreviewUpdateAudioClip={noop}
        onShiftAudioDragPreview={noop}
        onCommitAudioDrag={noop}
      />,
    );
    expect(html).toContain(`data-testid="volume-curve-${resolved.id}"`);
    expect(html).toContain(`data-testid="volume-key-${resolved.id}-0"`);
    expect(html).toContain(`data-testid="volume-key-${resolved.id}-1"`);
    expect(html).toContain("audio-gain-line");
  });

  it("renders no curve for music clips without automation keys", () => {
    const { clips, totalFrames } = makeFixture();
    const musicClip: AudioClip = {
      id: "ac-music-plain",
      lane: "music",
      src: "/film/audio/theme.mp3",
      anchorId: clips[0].keyframe.id,
      offsetMs: 0,
      inMs: 0,
      durationMs: 4000,
      gain: 0.6,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    const resolved: ResolvedAudioClip = {
      ...musicClip,
      anchorStartMs: 0,
      startMs: 0,
      endMs: 4000,
    };
    const html = renderToStaticMarkup(
      <Tracks
        clips={clips}
        resolvedAudioClips={[resolved]}
        selectedAudioClipIds={[]}
        totalFrames={totalFrames}
        playheadFrame={0}
        pxPerFrame={3}
        scrollLeft={0}
        viewportWidth={900}
        minVisibleFrame={0}
        maxVisibleFrame={900}
        snapEnabled={true}
        noteMarkers={[]}
        resolveMedia={() => undefined}
        onSetSnapGuide={noop}
        onSelectAudioClip={noop}
        onDragStart={noop}
        onDragEnd={noop}
        onPreviewUpdateAudioClip={noop}
        onShiftAudioDragPreview={noop}
        onCommitAudioDrag={noop}
      />,
    );
    expect(html).not.toContain(`data-testid="volume-curve-${resolved.id}"`);
    expect(html).not.toContain(`data-testid="volume-key-${resolved.id}`);
    expect(html).toContain("audio-gain-line");
  });
});
