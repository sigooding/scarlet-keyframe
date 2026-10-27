import { describe, expect, it } from "vitest";
import film from "../data/nobodys-witness-film.json";
import {
  addNoteMarker,
  copySelectedBeats,
  deleteKeyframes,
  pasteKeyframesAt,
  reorderKeyframe,
  reorderKeyframeWithResult,
  rollKeyframeCut,
  setCutTransition,
} from "../core/edits";
import { UndoHistory } from "../core/history";
import {
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  runningSceneIds,
  type ProjectState,
  type StoryLike,
} from "../core/model";
import { buildTimelineClips } from "./animate";
import { collectSnapTargets, buildSceneMarkers, snapClipSpan, snapFrame, type SnapTarget } from "./snap";
import {
  activeTransitionAtFrame,
  getTransitionWindow,
  mapTransitionKind,
  readCutTransition,
  transitionProgress,
} from "./transitions";

function makeTestProject(): ProjectState {
  const story: StoryLike = {
    id: "editor-v2-fixture",
    title: "Editor V2 Fixture",
    startSceneId: "s77",
    scenes: [
      {
        id: "s77",
        animaticMark: "77",
        background: "/img/77-plate.jpg",
        dialogueBeats: [
          {
            id: "b77_1",
            characterId: "vera",
            text: "You're the first person I've trusted.",
            background: "/img/85-desk-lamp.jpg",
            audioUrl: "/voice/vera-line-1.mp3",
            audioOffsetSeconds: 0.15,
            sfxUrl: "/sfx/lamp-click.mp3",
            sfxVolume: 0.8,
            durationFrames: 60,
            backgroundTransition: "crossfade",
            backgroundTransitionSpeed: 0.5,
            cinematic: { mode: "pan", colorGrade: "midnight-teal" },
            animation: {
              zoom: [
                { frame: 0, value: 1, easing: "linear" },
                { frame: 59, value: 1.4, easing: "ease-in-out" },
              ],
            },
          },
          {
            id: "b77_2",
            characterId: "narrator",
            text: "He opens the drawer.",
            background: "/img/86-envelope.jpg",
            sfxUrl: "/sfx/drawer-open.mp3",
            durationFrames: 48,
            afterBeatTargetSceneId: "s77a",
          },
        ],
      },
      {
        id: "s77a",
        animaticMark: "77A",
        background: "/img/77a-avenue.jpg",
        dialogueBeats: [
          {
            id: "b77a_1",
            characterId: "narrator",
            text: "Before dawn. A wide avenue.",
            background: "/img/77a-shot-1.jpg",
            durationFrames: 72,
          },
          {
            id: "b77a_2",
            characterId: "jack",
            text: "Not any more.",
            background: "/img/77a-shot-2.jpg",
            audioUrl: "/voice/jack-not-anymore.mp3",
            durationFrames: 54,
            afterBeatTargetSceneId: "s78",
          },
        ],
      },
      {
        id: "s78",
        animaticMark: "78",
        background: "/img/78-office.jpg",
        dialogueBeats: [
          {
            id: "b78_1",
            characterId: "narrator",
            text: "Morning light through blinds.",
            durationFrames: 36,
          },
        ],
      },
    ],
  };

  return createProjectState({
    story,
    assets: [],
    missing: [],
    sourceName: "fixture.json",
  });
}

describe("editor v2 — move, roll, snap, transitions, copy/paste", () => {
  it("1. moving a clip into another scene keeps all the beat's fields and preserves scene order", () => {
    const initial = makeTestProject();
    const originalBeat = JSON.parse(
      JSON.stringify(initial.story.scenes[0].dialogueBeats![0]),
    );

    // Move b77_1 from Scene 77 into Scene 77A at beat index 1 (between b77a_1 and b77a_2)
    const moved = reorderKeyframe(initial, "b77_1", {
      targetSceneId: "s77a",
      targetBeatIndex: 1,
    });

    // Running scene order must stay ["s77", "s77a", "s78"]
    expect(runningSceneIds(moved.story)).toEqual(["s77", "s77a", "s78"]);

    const s77Beats = moved.story.scenes.find((s) => s.id === "s77")!.dialogueBeats!;
    const s77aBeats = moved.story.scenes.find((s) => s.id === "s77a")!.dialogueBeats!;
    expect(s77Beats.map((b) => b.id)).toEqual(["b77_2"]);
    expect(s77aBeats.map((b) => b.id)).toEqual(["b77a_1", "b77_1", "b77a_2"]);

    const relocatedBeat = s77aBeats[1];
    expect(relocatedBeat).toEqual(originalBeat);

    // Also verify moving the sole remaining beat out of s77 keeps s78 reachable via autoAdvanceTargetSceneId
    const movedAllFrom77 = reorderKeyframe(moved, "b77_2", {
      targetSceneId: "s77a",
      targetBeatIndex: 0,
    });
    expect(runningSceneIds(movedAllFrom77.story)).toEqual(["s77", "s77a", "s78"]);
    expect(buildKeyframes(movedAllFrom77.story).map((f) => f.id)).toEqual([
      "b77_2",
      "b77a_1",
      "b77_1",
      "b77a_2",
      "b78_1",
    ]);

    // Alt+drag (copy: true) duplicates into target scene with a new id while keeping original in place
    const altCopied = reorderKeyframeWithResult(initial, ["b77_1", "b77_2"], {
      targetSceneId: "s78",
      targetBeatIndex: 1,
      copy: true,
    });
    expect(altCopied.resultIds).toHaveLength(2);
    expect(buildKeyframes(altCopied.project.story)).toHaveLength(7);
  });

  it("2. a roll edit keeps the total length while lengthening one clip and shortening the other", () => {
    const initial = makeTestProject();
    const beforeTimeline = buildTimelineClips(buildKeyframes(initial.story));
    expect(beforeTimeline.totalFrames).toBe(60 + 48 + 72 + 54 + 36); // 270f

    // Roll the cut between b77_1 (60f) and b77_2 (48f) by +10 frames
    const rolledForward = rollKeyframeCut(initial, "b77_1", "b77_2", 10);
    const afterForward = buildTimelineClips(buildKeyframes(rolledForward.story));
    expect(afterForward.clips[0].durationFrames).toBe(70);
    expect(afterForward.clips[1].durationFrames).toBe(38);
    expect(afterForward.totalFrames).toBe(beforeTimeline.totalFrames);
    // Downstream clips do not shift at all during a roll edit
    expect(afterForward.clips[2].startFrame).toBe(beforeTimeline.clips[2].startFrame);

    // Clamps to MIN_CLIP_FRAMES (6f) so total length STILL never changes even on extreme drags
    const rolledExtreme = rollKeyframeCut(initial, "b77_1", "b77_2", 500);
    const afterExtreme = buildTimelineClips(buildKeyframes(rolledExtreme.story));
    expect(afterExtreme.clips[0].durationFrames).toBe(102);
    expect(afterExtreme.clips[1].durationFrames).toBe(6);
    expect(afterExtreme.totalFrames).toBe(beforeTimeline.totalFrames);
  });

  it("3. snapping picks the nearest edge within the 8px distance and respects N toggle", () => {
    const pxPerFrame = 2; // 8px = 4 frames tolerance
    const targets: SnapTarget[] = [
      { frame: 100, kind: "clip-edge" },
      { frame: 103, kind: "playhead" },
      { frame: 105, kind: "note-marker", label: "Cue" },
      { frame: 140, kind: "scene-marker", label: "SC 78" },
    ];

    // At rawFrame = 102.2:
    // dist to 100 = 4.4px, dist to 103 = 1.6px, dist to 105 = 5.6px -> picks 103 (nearest within 8px!)
    const hit = snapFrame(102.2, targets, pxPerFrame, true, 8);
    expect(hit.snapped).toBe(true);
    expect(hit.frame).toBe(103);
    expect(hit.target?.kind).toBe("playhead");

    // Outside 8px (> 4 frames away at 2px/frame): rawFrame = 120 -> nearest is 105 (30px away), does not snap
    const miss = snapFrame(120, targets, pxPerFrame, true, 8);
    expect(miss.snapped).toBe(false);
    expect(miss.frame).toBe(120);

    // When snapping is toggled off (N), does not snap even when 0.5px away
    const disabled = snapFrame(102.8, targets, pxPerFrame, false, 8);
    expect(disabled.snapped).toBe(false);
    expect(disabled.frame).toBe(103);

    // Span snapping checks both leading and trailing clip edges
    const spanSnap = snapClipSpan(77, 24, targets, pxPerFrame, true, 8);
    // Trailing edge 77 + 24 = 101 -> 2px from clip-edge 100 -> snaps startFrame to 100 - 24 = 76
    expect(spanSnap.snapped).toBe(true);
    expect(spanSnap.startFrame).toBe(76);
    expect(spanSnap.guideFrame).toBe(100);

    // Verify collectSnapTargets gathers clip edges, playhead, keyframes, scene markers, and note markers
    const withNote = addNoteMarker(makeTestProject(), 95, "Beat check").project;
    const clips = buildTimelineClips(buildKeyframes(withNote.story)).clips;
    const collected = collectSnapTargets({
      clips,
      playheadFrame: 80,
      sceneMarkers: buildSceneMarkers(clips),
      noteMarkers: withNote.story.markers || [],
    });
    const kinds = new Set(collected.map((t) => t.kind));
    expect(kinds.has("clip-edge")).toBe(true);
    expect(kinds.has("playhead")).toBe(true);
    expect(kinds.has("keyframe")).toBe(true);
    expect(kinds.has("scene-marker")).toBe(true);
    expect(kinds.has("note-marker")).toBe(true);
  });

  it("4. computes a transition's progress at its first, middle and last frame and maps film transitions", () => {
    const project = setCutTransition(makeTestProject(), "b77_2", "dissolve", 12);
    const clips = buildTimelineClips(buildKeyframes(project.story)).clips;
    // Cut between b77_1 (0..60) and b77_2 (60..108) is at frame 60.
    // A 12-frame dissolve centred on 60 starts at 54 and spans 12 frames (54..65, reaching 1 at 66).
    const win = getTransitionWindow(60, 12);
    expect(win.startFrame).toBe(54);
    expect(win.endFrame).toBe(66);

    // First frame (54): p = (54 - 54) / 12 = 0
    const first = activeTransitionAtFrame(clips, 54);
    expect(first).toBeDefined();
    expect(first!.kind).toBe("dissolve");
    expect(first!.progress).toBeCloseTo(0, 6);
    expect(first!.outgoingClip.keyframe.id).toBe("b77_1");
    expect(first!.incomingClip.keyframe.id).toBe("b77_2");

    // Middle frame (60 = cutFrame): p = (60 - 54) / 12 = 0.5
    const middle = activeTransitionAtFrame(clips, 60);
    expect(middle).toBeDefined();
    expect(middle!.progress).toBeCloseTo(0.5, 6);

    // Last active frame of the 12-frame window (65): p = (65 - 54) / 12 = 11 / 12,
    // and at transition end boundary (66) transitionProgress reaches 1.0
    const lastActive = activeTransitionAtFrame(clips, 65);
    expect(lastActive).toBeDefined();
    expect(lastActive!.progress).toBeCloseTo(11 / 12, 6);
    expect(transitionProgress(66, win.startFrame, win.durationFrames)).toBe(1);
    expect(activeTransitionAtFrame(clips, 66)).toBeUndefined();

    // Verify all existing transitions in the bundled film map cleanly to the 5 canonical kinds
    const { story: bundledStory } = parseImportPayload(film, "nobodys-witness-film.json");
    const valid = new Set(["cut", "dissolve", "dip-to-black", "wipe-left", "wipe-right"]);
    for (const kf of buildKeyframes(bundledStory)) {
      const spec = readCutTransition(kf);
      expect(valid.has(spec.kind)).toBe(true);
    }
    expect(mapTransitionKind("crossfade")).toBe("dissolve");
    expect(mapTransitionKind("zoom")).toBe("dissolve");
    expect(mapTransitionKind("fade-black")).toBe("dip-to-black");
    expect(mapTransitionKind("slide-left")).toBe("wipe-left");
    expect(mapTransitionKind("slide-right")).toBe("wipe-right");
  });

  it("5. pasting with the playhead inside a clip splits that clip first and undoes in one step", () => {
    const history = new UndoHistory<ProjectState>(20);
    const initial = makeTestProject();

    // Copy 3 clips: b77_2 (48f), b77a_1 (72f), b77a_2 (54f)
    const copied = copySelectedBeats(initial, ["b77_2", "b77a_1", "b77a_2"]);
    expect(copied).toHaveLength(3);

    // Playhead is at frame 25 — strictly inside b77_1 (0..60)!
    history.record(initial);
    const pasted = pasteKeyframesAt(initial, copied, 25);
    expect(pasted).toBeDefined();
    expect(pasted!.insertedIds).toHaveLength(3);

    const afterClips = buildTimelineClips(buildKeyframes(pasted!.project.story)).clips;
    // b77_1 (60f) was split into 25f + 35f, with the 3 pasted clips (48f, 72f, 54f) inserted right between them!
    expect(afterClips.map((c) => c.durationFrames)).toEqual([
      25, // first half of b77_1
      48, // pasted copy 1
      72, // pasted copy 2
      54, // pasted copy 3
      35, // second half of b77_1
      48, // original b77_2
      72, // original b77a_1
      54, // original b77a_2
      36, // original b78_1
    ]);
    expect(afterClips[0].keyframe.text).toBe("You're the first person I've trusted.");
    expect(afterClips[4].keyframe.text).toBe(""); // split second half has empty text

    // Multi-delete also closes gaps in one step
    history.record(pasted!.project);
    const afterDelete = deleteKeyframes(pasted!.project, pasted!.insertedIds);
    expect(buildKeyframes(afterDelete.story)).toHaveLength(6);

    // Undo delete -> back to pasted; undo paste -> back to initial (unsplit 60f b77_1!)
    const undoDelete = history.undo(afterDelete)!;
    expect(buildKeyframes(undoDelete.story)).toHaveLength(9);
    const undoPaste = history.undo(undoDelete)!;
    const restoredClips = buildTimelineClips(buildKeyframes(undoPaste.story)).clips;
    expect(restoredClips).toHaveLength(5);
    expect(restoredClips[0].durationFrames).toBe(60);
  });
});
