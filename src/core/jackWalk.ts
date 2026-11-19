import type { TimelineClip } from "../sequence/animate";
import { frameToMs, roundMicros } from "./audioClips";
import type { BeatLike, ProjectState } from "./model";
import { FPS } from "./timing";

interface JackWalkRestore {
  project: ProjectState;
  firstShotId: string;
  startFrame: number;
}

/** Restore just the missing walk in an older Director's Export. Never rebuild the cut or its sound lanes. */
export function restoreJackWalk(project: ProjectState, timeline: readonly TimelineClip[]): JackWalkRestore | undefined {
  if (project.directorsCutId !== "director-export" || project.story.id !== "nobodys-witness-film") return;
  const montage = project.story.scenes.find((s) => s.id === "nw_m18");
  if (!montage || montage.dialogueBeats?.length || montage.autoAdvanceTargetSceneId !== "nw_s19") return;
  const stills: unknown = montage.credits?.montage;
  const hold = Math.round(Number(montage.credits?.montageSeconds) * FPS);
  if (!Array.isArray(stills) || stills.length !== 6 || !stills.every((s) => typeof s === "string" && s) || !(hold > 0)) return;

  // Use this edit's cut point, not a timecode from the factory print. Leave a re-routed scene alone.
  const next = timeline.findIndex((c) => c.keyframe.sceneId === "nw_s19");
  const previous = timeline[next - 1]?.keyframe;
  if (previous?.sceneId !== "nw_s18" || previous.beat.afterBeatTargetSceneId !== montage.id) return;
  const insertFrame = timeline[next].startFrame;
  const insertMs = frameToMs(insertFrame);
  const addedFrames = hold * stills.length;
  const addedMs = frameToMs(addedFrames);

  // The original bed plays right up to the missing walk. Don't guess at a replacement if someone has
  // removed or moved that cue, and don't touch the later use of the same recording after Pink water.
  const anchors = new Map(timeline.filter((c) => c.keyframe.sceneId === previous.sceneId)
    .map((c) => [c.keyframe.id, frameToMs(c.startFrame)]));
  const audioClips = project.audioClips;
  if (!audioClips) return;
  const cues = audioClips.filter((c) => c.lane === "music" && c.src === montage.musicUrl &&
    anchors.has(c.anchorId) && Math.abs(anchors.get(c.anchorId)! + c.offsetMs + c.durationMs - insertMs) < 0.01);
  if (cues.length !== 1) return;
  const [cue] = cues;
  const extended = { ...cue, durationMs: roundMicros(cue.durationMs + addedMs) };
  // Same take, no restart: keep the opening level, swell over the authored ten seconds on the walk,
  // and move the existing fade-out to the new tail. A hand-drawn volume curve takes precedence.
  const peak = roundMicros(Math.min(2, cue.gain * montage.musicLevel / previous.scene.musicLevel));
  const riseMs = Math.min(addedMs, montage.musicFadeSeconds * 1000);
  if (!cue.volumeKeys?.length && peak > cue.gain && cue.gain > 0 && riseMs > 0) {
    extended.gain = peak;
    extended.volumeKeys = [
      { atMs: cue.durationMs, gain: cue.gain / peak },
      { atMs: cue.durationMs + riseMs, gain: 1 },
    ];
  }

  const beats = stills.map((picture, i) => ({
    id: `nw_dc_nw_m18_${i + 1}`,
    characterId: "nw_narrator",
    text: `Jack’s theme — walk to the Hive (${i + 1}/${stills.length})`,
    silent: true,
    captions: [],
    background: picture,
    durationFrames: hold,
    backgroundTransition: montage.credits.montageTransition,
    backgroundTransitionSpeed: montage.transitionSpeed,
    ...(montage.credits.montageLooks?.[picture] ? { cinematic: { ...montage.credits.montageLooks[picture] } } : {}),
  } satisfies BeatLike));
  // Don't duplicate shots that have been moved to a different scene.
  const ids = new Set(beats.map((b) => b.id));
  if (timeline.some((c) => ids.has(c.keyframe.id))) return;

  return {
    startFrame: insertFrame,
    firstShotId: beats[0].id,
    project: {
      ...project,
      story: {
        ...project.story,
        scenes: project.story.scenes.map((s) => s === montage ? { ...s, dialogueBeats: beats } : s),
        // Sound and captions travel with their picture anchors; ruler notes are absolute frames.
        ...(project.story.markers ? { markers: project.story.markers.map((m) =>
          m.frame < insertFrame ? m : { ...m, frame: m.frame + addedFrames }) } : {}),
      },
      audioClips: audioClips.map((c) => c === cue ? extended : c),
    },
  };
}
