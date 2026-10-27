import { describe, expect, it } from "vitest";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildTimelineClips } from "../sequence/animate";
import {
  buildAudioClipsFromFilm,
  combineMarqueeSelections,
  computeScheduleWindow,
  EMPTY_MULTI_SELECTION,
  frameToMs,
  hitTestMarqueeBox,
  reanchorAudioClipToMs,
  resolveAudioClips,
  snapAudioMs,
  trimAudioClipLeft,
  trimAudioClipRight,
  type AudioClip,
  type TimelineLaneBands,
} from "./audioClips";
import {
  copyMultiSelection,
  executeDeleteSelection,
  pasteMultiSelectionAt,
  setPicture,
  shiftMultiLaneSelection,
  trimKeyframe,
} from "./edits";
import { UndoHistory } from "./history";
import {
  applyStudioMusicSync,
  buildKeyframes,
  createProjectState,
  parseImportPayload,
  type AnyRecord,
  type ProjectState,
} from "./model";
import { extractKnownMusicDurations, resolveMusicSpans } from "./previewAudio";

function makeFixtureProject(): {
  project: ProjectState;
  voiceDurations: Map<string, number>;
  musicDurations: Map<string, number>;
} {
  const voiceDurations = new Map<string, number>([
    ["/film/voice/s1/line1.mp3", 1.8],
    ["/film/voice/s1/line2.mp3", 2.2],
    ["/film/voice/s2/line3.mp3", 1.5],
  ]);
  const musicDurations = new Map<string, number>([
    ["/film/audio/theme.mp3", 30],
  ]);

  const rawStory = {
    id: "test-film",
    title: "Test Film",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        sceneNumber: 1,
        title: "Scene One",
        autoAdvanceTargetSceneId: "sc2",
        background: "/film/img/sc1.png",
        musicUrl: "/film/audio/theme.mp3",
        musicMode: "track",
        musicLevel: 0.7,
        musicFadeSeconds: 1.5,
        musicFadeOutSeconds: 2.0,
        ambientAudio: "file:/film/sfx/amb-rain.mp3",
        dialogueBeats: [
          {
            id: "b1",
            speaker: "SCARLETT",
            text: "First beat line.",
            durationFrames: 48, // 2,000 ms
            audioUrl: "/film/voice/s1/line1.mp3",
            audioOffsetSeconds: 0.25, // +250 ms
            sfxUrl: "/film/sfx/door.mp3",
            sfxVolume: 0.8,
          },
          {
            id: "b2",
            speaker: "SCARLETT",
            text: "Second beat line.",
            durationFrames: 72, // 3,000 ms (starts at 2,000 ms)
            audioUrl: "/film/voice/s1/line2.mp3",
            audioOffsetSeconds: 0.5, // +500 ms => 2,500 ms
          },
          {
            id: "b3",
            speaker: "NARRATOR",
            text: "Silent reaction beat.",
            durationFrames: 48, // 2,000 ms (starts at 5,000 ms)
          },
        ],
      },
      {
        id: "sc2",
        sceneNumber: 2,
        title: "Scene Two",
        background: "/film/img/sc2.png",
        musicMode: "stop",
        ambientAudio: "none",
        dialogueBeats: [
          {
            id: "b4",
            speaker: "DETECTIVE",
            text: "Scene two opening.",
            durationFrames: 60, // 2,500 ms (starts at 7,000 ms)
            audioUrl: "/film/voice/s2/line3.mp3",
            audioOffsetSeconds: 0,
            sfxUrl: "/film/sfx/footstep.mp3",
          },
        ],
      },
    ],
  };

  const imported = parseImportPayload(rawStory, "test-film.json");
  let project = createProjectState(imported, []);
  project = {
    ...project,
    audioClips: buildAudioClipsFromFilm(project.story, voiceDurations, musicDurations),
  };
  return { project, voiceDurations, musicDurations };
}

describe("Turn 7 — Free Sound Clips, Delete & Gaps, and Multi-Lane Box Select", () => {
  it("1. builds audioClips with one voice clip per beat with audioUrl at pictureStart + audioOffsetSeconds, and music clips matching resolveMusicSpans (leaving story audio fields untouched)", () => {
    const voiceDurations = new Map<string, number>(
      Object.entries(bundledAudioDurations as Record<string, number>),
    );
    const sourceEdits = bundledEdits as AnyRecord;
    const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json");
    const story = applyStudioMusicSync(imported.story, sourceEdits);
    const storySnapshotBefore = JSON.stringify(story);
    const musicDurations = extractKnownMusicDurations(sourceEdits);

    const builtAudioClips = buildAudioClipsFromFilm(story, voiceDurations, musicDurations);

    // Story beats' and scenes' audio fields must remain completely untouched
    expect(JSON.stringify(story)).toBe(storySnapshotBefore);

    const frames = buildKeyframes(story);
    const { clips, totalFrames } = buildTimelineClips(frames, voiceDurations);
    const resolved = resolveAudioClips(builtAudioClips, clips);

    // Voice clips: exactly 1 per beat that has an audioUrl, starting at pictureStart + audioOffsetSeconds
    const beatsWithVoice = clips.filter((c) => Boolean(c.keyframe.beat.audioUrl));
    const voiceClips = resolved.filter((ac) => ac.lane === "voice");
    expect(voiceClips.length).toBe(beatsWithVoice.length);

    for (let i = 0; i < beatsWithVoice.length; i += 1) {
      const tc = beatsWithVoice[i];
      const vc = voiceClips[i];
      const pictureStartMs = frameToMs(tc.startFrame);
      const offsetSec = Number(tc.keyframe.beat.audioOffsetSeconds || 0);
      const expectedStartMs = pictureStartMs + offsetSec * 1000;
      expect(vc.anchorId).toBe(tc.keyframe.id);
      expect(vc.src).toBe(tc.keyframe.beat.audioUrl);
      expect(vc.startMs).toBeCloseTo(expectedStartMs, 3);
    }

    // Music clips: 1 clip per span from resolveMusicSpans with matching start, end, level, fades, and loop
    const expectedSpans = resolveMusicSpans(clips, totalFrames, musicDurations);
    const musicClips = resolved.filter((ac) => ac.lane === "music");
    expect(musicClips.length).toBe(expectedSpans.length);

    for (let i = 0; i < expectedSpans.length; i += 1) {
      const span = expectedSpans[i];
      const mc = musicClips[i];
      const spanStartMs = frameToMs(span.startFrame);
      const spanEndMs = frameToMs(span.endFrame);
      expect(mc.src).toBe(span.url);
      expect(mc.startMs).toBeCloseTo(spanStartMs, 3);
      expect(mc.endMs).toBeCloseTo(spanEndMs, 3);
      expect(Boolean(mc.loop)).toBe(Boolean(span.loop));
      expect(mc.gain).toBeCloseTo(Number(span.scene.musicLevel ?? 0.7), 3);
      expect(mc.fadeInMs).toBeCloseTo(Math.max(0, Number(span.scene.musicFadeSeconds ?? 0)) * 1000, 3);
    }
  });

  it("2. re-anchoring on drop across shots and scenes keeps the exact time in milliseconds", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const { clips } = buildTimelineClips(buildKeyframes(project.story), voiceDurations);
    const resolved = resolveAudioClips(project.audioClips!, clips);
    const firstVoice = resolved.find((c) => c.lane === "voice" && c.anchorId === "b1")!;
    expect(firstVoice.startMs).toBe(250);

    // Drag across into Scene 2 (b4 starts at frame 168 => 7,000 ms) at an exact non-frame ms: 7,389 ms
    const targetMs = 7389;
    const reanchored = reanchorAudioClipToMs(firstVoice, targetMs, clips);
    expect(reanchored.anchorId).toBe("b4");
    expect(reanchored.offsetMs).toBeCloseTo(389, 5);

    const [resolvedAfter] = resolveAudioClips([reanchored], clips);
    expect(resolvedAfter.startMs).toBe(7389);
  });

  it("3. ripple-trimming an earlier shot moves anchored downstream sounds by the exact same time", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const preClips = buildTimelineClips(buildKeyframes(project.story), voiceDurations).clips;
    const preResolved = resolveAudioClips(project.audioClips!, preClips);
    const voiceOnB2 = preResolved.find((c) => c.lane === "voice" && c.anchorId === "b2")!;
    const voiceOnB4 = preResolved.find((c) => c.lane === "voice" && c.anchorId === "b4")!;
    expect(voiceOnB2.startMs).toBe(2500);
    expect(voiceOnB4.startMs).toBe(7000);

    // Ripple-trim shot b1 from 48 frames (2,000 ms) to 72 frames (3,000 ms): +1,000 ms (+24f)
    const trimmedProject = trimKeyframe(project, "b1", 72);
    const postClips = buildTimelineClips(buildKeyframes(trimmedProject.story), voiceDurations).clips;
    const postResolved = resolveAudioClips(trimmedProject.audioClips!, postClips);

    const postVoiceB2 = postResolved.find((c) => c.id === voiceOnB2.id)!;
    const postVoiceB4 = postResolved.find((c) => c.id === voiceOnB4.id)!;

    expect(postVoiceB2.startMs - voiceOnB2.startMs).toBeCloseTo(1000, 5);
    expect(postVoiceB4.startMs - voiceOnB4.startMs).toBeCloseTo(1000, 5);
  });

  it("4. with snapping off (or Ctrl/Cmd ignoreSnap), a sound placed at 1,234 ms stays at exact 1,234 ms (never rounded to frames)", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const { clips } = buildTimelineClips(buildKeyframes(project.story), voiceDurations);
    const sfx = project.audioClips!.find((c) => c.lane === "sfx")!;

    // 1,234 ms is 29.616 frames — strictly between frame 29 (1208.33 ms) and frame 30 (1250.00 ms)
    const snappedOff = snapAudioMs(1234, {
      pxPerFrame: 20,
      snapEnabled: false,
      playheadMs: 1250,
      timelineClips: clips,
      noteMarkers: [],
      otherAudioClips: [],
    });
    expect(snappedOff.snapped).toBe(false);
    expect(snappedOff.ms).toBe(1234);

    // Also verify holding Ctrl/Cmd ignores snapping even when snapEnabled is true
    const ctrlBypass = snapAudioMs(1234, {
      pxPerFrame: 20,
      snapEnabled: true,
      ignoreSnap: true,
      playheadMs: 1250,
      timelineClips: clips,
      noteMarkers: [],
      otherAudioClips: [],
    });
    expect(ctrlBypass.snapped).toBe(false);
    expect(ctrlBypass.ms).toBe(1234);

    const placed = reanchorAudioClipToMs(sfx, snappedOff.ms, clips);
    const [resolvedPlaced] = resolveAudioClips([placed], clips);
    expect(resolvedPlaced.startMs).toBe(1234);
  });

  it("5. Delete on a picture clip leaves a black gap of the same length and moves nothing; Delete on a gap closes it; Shift+Delete closes a picture clip", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const preClips = buildTimelineClips(buildKeyframes(project.story), voiceDurations).clips;
    const preB2 = preClips.find((c) => c.keyframe.id === "b2")!;
    const preB3 = preClips.find((c) => c.keyframe.id === "b3")!;
    const preVoiceB2 = resolveAudioClips(project.audioClips!, preClips).find(
      (c) => c.lane === "voice" && c.anchorId === "b2",
    )!;

    // Step A: Plain Delete ("lift") on b2 leaves a black gap of identical frame length; nothing after moves
    const lifted = executeDeleteSelection(
      project,
      { ...EMPTY_MULTI_SELECTION, pictureIds: ["b2"] },
      { ripple: false, voiceDurationByRef: voiceDurations },
    );
    const liftedFrames = buildKeyframes(lifted.project.story);
    const liftedClips = buildTimelineClips(liftedFrames, voiceDurations).clips;
    const gapB2 = liftedClips.find((c) => c.keyframe.id === "b2")!;
    const afterB3 = liftedClips.find((c) => c.keyframe.id === "b3")!;
    const afterVoiceB2 = resolveAudioClips(lifted.project.audioClips!, liftedClips).find(
      (c) => c.id === preVoiceB2.id,
    )!;

    expect(gapB2.keyframe.beat.gap).toBe(true);
    expect(gapB2.keyframe.picture).toBeUndefined();
    expect(gapB2.durationFrames).toBe(preB2.durationFrames);
    expect(afterB3.startFrame).toBe(preB3.startFrame); // Nothing after moved!
    expect(afterVoiceB2.startMs).toBe(preVoiceB2.startMs); // Sound stayed put!
    expect(gapB2.keyframe.text).toBe("Second beat line."); // Caption kept!

    // Dropping a picture onto the gap fills it cleanly without moving downstream shots
    const filled = setPicture(lifted.project, "b2", "/film/img/replacement.png");
    const filledKf = buildKeyframes(filled.story).find((f) => f.id === "b2")!;
    expect(filledKf.beat.gap).toBeUndefined();
    expect(filledKf.picture).toBe("/film/img/replacement.png");

    // Step B: Plain Delete on the gap closes it
    const closedFromGap = executeDeleteSelection(
      lifted.project,
      { ...EMPTY_MULTI_SELECTION, pictureIds: ["b2"] },
      { ripple: false, voiceDurationByRef: voiceDurations },
    );
    const closedClips = buildTimelineClips(
      buildKeyframes(closedFromGap.project.story),
      voiceDurations,
    ).clips;
    expect(closedClips.find((c) => c.keyframe.id === "b2")).toBeUndefined();
    const closedB3 = closedClips.find((c) => c.keyframe.id === "b3")!;
    expect(closedB3.startFrame).toBe(preB2.startFrame);

    // Step C: Shift+Delete on the original picture clip closes it directly
    const shiftDeleted = executeDeleteSelection(
      project,
      { ...EMPTY_MULTI_SELECTION, pictureIds: ["b2"] },
      { ripple: true, voiceDurationByRef: voiceDurations },
    );
    const shiftClips = buildTimelineClips(
      buildKeyframes(shiftDeleted.project.story),
      voiceDurations,
    ).clips;
    expect(shiftClips.find((c) => c.keyframe.id === "b2")).toBeUndefined();
    expect(shiftClips.find((c) => c.keyframe.id === "b3")!.startFrame).toBe(preB2.startFrame);
  });

  it("6. ripple delete removes anchored sounds, reports removed sound count, and one undo restores everything", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const history = new UndoHistory<ProjectState>(20);

    // b1 has 2 anchored sounds in our fixture: 1 voice + 1 sfx (plus music/ambience if anchored to b1!)
    const anchoredToB1 = project.audioClips!.filter((ac) => ac.anchorId === "b1");
    expect(anchoredToB1.length).toBeGreaterThanOrEqual(2);

    history.record(project);
    const rippleRes = executeDeleteSelection(
      project,
      { ...EMPTY_MULTI_SELECTION, pictureIds: ["b1"] },
      { ripple: true, voiceDurationByRef: voiceDurations },
    );

    expect(rippleRes.removedSoundCount).toBe(anchoredToB1.length);
    expect(rippleRes.statusMessage).toContain(`${anchoredToB1.length} anchored sound`);
    expect(
      rippleRes.project.audioClips!.some((ac) => anchoredToB1.some((orig) => orig.id === ac.id)),
    ).toBe(false);

    // Single Undo step restores the shot AND every anchored sound clip
    const restored = history.undo(rippleRes.project)!;
    expect(restored).toBeDefined();
    expect(buildKeyframes(restored.story).some((f) => f.id === "b1")).toBe(true);
    expect(restored.audioClips!.length).toBe(project.audioClips!.length);
    for (const orig of anchoredToB1) {
      expect(restored.audioClips!.find((ac) => ac.id === orig.id)).toEqual(orig);
    }
  });

  it("7. a marquee box over three lanes selects items on all three, supports Shift+add / Alt+subtract, and drags/copies/pastes as one", () => {
    const { project, voiceDurations } = makeFixtureProject();
    const { clips } = buildTimelineClips(buildKeyframes(project.story), voiceDurations);
    const resolved = resolveAudioClips(project.audioClips!, clips);
    const pxPerFrame = 4; // b1 spans frames 0..48 => x = 0..192 px

    const bands: TimelineLaneBands = {
      captions: { top: 30, bottom: 58 },
      video: { top: 58, bottom: 134 },
      voice: { top: 134, bottom: 170 },
      sfx: { top: 170, bottom: 206 },
      music: { top: 206, bottom: 242 },
      ambience: { top: 242, bottom: 278 },
    };

    // Drag marquee across Video + Voice + SFX over x = [10, 120] (within shot b1)
    const hit = hitTestMarqueeBox(
      { x1: 10, y1: 80, x2: 120, y2: 195 },
      bands,
      clips,
      resolved,
      pxPerFrame,
    );

    expect(hit.pictureIds).toContain("b1");
    const hitLanes = new Set(
      hit.audioClipIds.map((id) => resolved.find((c) => c.id === id)?.lane),
    );
    expect(hitLanes.has("voice")).toBe(true);
    expect(hitLanes.has("sfx")).toBe(true);
    expect(hitLanes.has("music")).toBe(false); // music lane y=206..242 was below y2=195

    // Alt+drag over SFX lane removes SFX while keeping Video + Voice
    const sfxOnlyHit = hitTestMarqueeBox(
      { x1: 10, y1: 175, x2: 120, y2: 200 },
      bands,
      clips,
      resolved,
      pxPerFrame,
    );
    const subtracted = combineMarqueeSelections(hit, sfxOnlyHit, "subtract");
    expect(subtracted.pictureIds).toContain("b1");
    expect(
      subtracted.audioClipIds.some((id) => resolved.find((c) => c.id === id)?.lane === "sfx"),
    ).toBe(false);

    // Drag all 3 lanes +1,000 ms (+24 frames) later as one unit
    const voiceId = hit.audioClipIds.find((id) => resolved.find((c) => c.id === id)?.lane === "voice")!;
    const sfxId = hit.audioClipIds.find((id) => resolved.find((c) => c.id === id)?.lane === "sfx")!;
    const preVoiceStart = resolved.find((c) => c.id === voiceId)!.startMs;
    const preSfxStart = resolved.find((c) => c.id === sfxId)!.startMs;

    const shifted = shiftMultiLaneSelection(project, hit, 1000, {
      voiceDurationByRef: voiceDurations,
    });
    const postClips = buildTimelineClips(
      buildKeyframes(shifted.project.story),
      voiceDurations,
    ).clips;
    const postResolved = resolveAudioClips(shifted.project.audioClips!, postClips);

    expect(postClips.find((c) => c.keyframe.id === "b1")!.startFrame).toBe(24);
    expect(postResolved.find((c) => c.id === voiceId)!.startMs - preVoiceStart).toBeCloseTo(1000, 3);
    expect(postResolved.find((c) => c.id === sfxId)!.startMs - preSfxStart).toBeCloseTo(1000, 3);

    // Copy & paste preserves relative millisecond spacing between sounds
    const cb = copyMultiSelection(project, {
      ...EMPTY_MULTI_SELECTION,
      audioClipIds: [sfxId, voiceId],
    }, voiceDurations)!;
    const pasted = pasteMultiSelectionAt(project, cb, 120, voiceDurations)!; // frame 120 = 5,000 ms
    const pastedResolved = resolveAudioClips(
      pasted.project.audioClips!,
      buildTimelineClips(buildKeyframes(pasted.project.story), voiceDurations).clips,
    );
    const pastedSounds = pasted.selection.audioClipIds.map(
      (id) => pastedResolved.find((c) => c.id === id)!,
    );
    expect(Math.abs(pastedSounds[1].startMs - pastedSounds[0].startMs)).toBeCloseTo(
      Math.abs(preVoiceStart - preSfxStart),
      5,
    );
  });

  it("8. scheduler computes exact mid-file offsets for clips under playhead, upcoming clips in the 300 ms lookahead, and trim left/right bounds", () => {
    const testClips: AudioClip[] = [
      {
        // Active mid-clip at playhead 2,000 ms (started at 1,000 ms with inMs = 400 ms)
        id: "ac-active",
        lane: "music",
        src: "/audio/score.mp3",
        anchorId: "b1",
        offsetMs: 1000,
        inMs: 400,
        durationMs: 5000,
        gain: 0.8,
        fadeInMs: 2000,
        fadeOutMs: 1000,
      },
      {
        // Starts 180 ms in the future (inside 300 ms lookahead window)
        id: "ac-upcoming",
        lane: "sfx",
        src: "/sfx/click.mp3",
        anchorId: "b1",
        offsetMs: 2180,
        inMs: 50,
        durationMs: 600,
        gain: 1.0,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
      {
        // Starts 450 ms in the future (outside 300 ms lookahead window)
        id: "ac-later",
        lane: "voice",
        src: "/voice/later.mp3",
        anchorId: "b1",
        offsetMs: 2450,
        inMs: 0,
        durationMs: 1200,
        gain: 1.0,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ];

    const { project, voiceDurations } = makeFixtureProject();
    const tClips = buildTimelineClips(buildKeyframes(project.story), voiceDurations).clips;
    const resolved = resolveAudioClips(testClips, tClips);

    const scheduled = computeScheduleWindow(resolved, 2000, {
      includeActiveAtPlayhead: true,
      lookaheadMs: 300,
      fileDurationsMs: new Map([
        ["/audio/score.mp3", 10000],
        ["/sfx/click.mp3", 1000],
      ]),
    });

    expect(scheduled.map((s) => s.clip.id)).toEqual(["ac-active", "ac-upcoming"]);

    // ac-active: playhead is 1,000 ms into the clip + 400 ms front trim => offsetInFileMs = 1,400 ms, remainingMs = 4,000 ms
    const activeSlice = scheduled.find((s) => s.clip.id === "ac-active")!;
    expect(activeSlice.startWhenOffsetMs).toBe(0);
    expect(activeSlice.offsetInFileMs).toBe(1400);
    expect(activeSlice.remainingMs).toBe(4000);
    // Halfway through 2,000 ms fade-in at 0.8 gain => initial ramp point is 0.4!
    expect(activeSlice.gainEnvelope[0].gain).toBeCloseTo(0.4, 4);

    // ac-upcoming: starts in 180 ms at its front trim inMs = 50 ms for full 600 ms
    const upcomingSlice = scheduled.find((s) => s.clip.id === "ac-upcoming")!;
    expect(upcomingSlice.startWhenOffsetMs).toBe(180);
    expect(upcomingSlice.offsetInFileMs).toBe(50);
    expect(upcomingSlice.remainingMs).toBe(600);

    // Also verify left/right trim bounds against natural file duration unless loop is enabled
    const trimmedLeftPastZero = trimAudioClipLeft(resolved[0], 0, tClips, 10000);
    expect(trimmedLeftPastZero.inMs).toBe(0); // Clamped at file start (can only pull left by 400 ms)
    expect(trimmedLeftPastZero.offsetMs).toBe(600);

    const trimmedRightPastEnd = trimAudioClipRight(resolved[1], 5000, 1000);
    expect(trimmedRightPastEnd.durationMs).toBe(950); // 1000 ms file - 50 ms inMs = 950 ms max without loop
  });
});
