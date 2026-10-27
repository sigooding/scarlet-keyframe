import type {
  AnyRecord,
  BeatAnimation,
  BeatLike,
  Keyframe,
  NoteMarker,
  ProjectState,
  SceneLike,
  StoryLike,
} from "./model";
import { buildKeyframes, runningSceneIds } from "./model";
import { clipFrames, FPS, MIN_CLIP_FRAMES } from "./timing";
import { buildTimelineClips, normalizeAnimation, splitAnimation, type TimelineClip } from "../sequence/animate";
import { DEFAULT_TRANSITION_FRAMES, type TransitionKind } from "../sequence/transitions";

export interface EffectBlock {
  cinematic?: AnyRecord;
  particles?: string;
  particleConfig?: AnyRecord;
  backgroundTransition?: string;
  backgroundTransitionSpeed?: number;
  backgroundHold?: boolean;
  backgroundRevert?: boolean;
  holdSeconds?: number;
  animation?: BeatAnimation;
}

export interface ReorderDestination {
  targetSceneId: string;
  targetBeatIndex: number;
  copy?: boolean;
}

export function cloneStory<T extends StoryLike>(story: T): T {
  return JSON.parse(JSON.stringify(story)) as T;
}

export function setPicture(project: ProjectState, frameId: string, picture?: string): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  if (picture) {
    location.beat.background = picture;
    location.beat.backgroundRevert = false;
    location.beat.backgroundHold = true;
  } else {
    delete location.beat.background;
    delete location.beat.backgroundRevert;
  }
  return { ...project, story, updatedAt: Date.now() };
}

export function setBeatField(project: ProjectState, frameId: string, path: string, value: unknown): ProjectState {
  return updateBeat(project, frameId, (beat) => setPath(beat, path, value));
}

export function setEffectField(project: ProjectState, frameId: string, path: string, value: unknown): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const normalized = path.replace(/^cinematic\.?/, "");
  const cinematic: AnyRecord = { ...(location.beat.cinematic || location.scene.cinematic || {}) };
  setPath(cinematic, normalized, value);
  if (Object.keys(cinematic).length) location.beat.cinematic = cinematic;
  else delete location.beat.cinematic;
  return { ...project, story, updatedAt: Date.now() };
}

export function getEffectValue(frame: Keyframe, path: string): unknown {
  const normalized = path.replace(/^cinematic\.?/, "");
  const cinematic = frame.beat.cinematic || frame.scene.cinematic || {};
  return getPath(cinematic, normalized);
}

export function resetEffectField(project: ProjectState, frameId: string, path: string): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  const original = locateBeat(project.originalStory, frameId);
  if (!location || !original) return project;
  const normalized = path.replace(/^cinematic\.?/, "");
  const originalValue = getPath(original.beat.cinematic || {}, normalized);
  if (originalValue !== undefined) {
    location.beat.cinematic = { ...(location.beat.cinematic || {}) };
    setPath(location.beat.cinematic, normalized, originalValue);
  } else {
    location.beat.cinematic = { ...(location.beat.cinematic || {}) };
    deletePath(location.beat.cinematic, normalized);
    if (!Object.keys(location.beat.cinematic).length) delete location.beat.cinematic;
  }
  return { ...project, story, updatedAt: Date.now() };
}

export function copyEffectBlock(frame: Keyframe): EffectBlock {
  const block: EffectBlock = {};
  const cinematic = frame.beat.cinematic || frame.scene.cinematic;
  if (cinematic) block.cinematic = JSON.parse(JSON.stringify(cinematic));
  const beat = frame.beat as AnyRecord;
  const scene = frame.scene as AnyRecord;
  const particles = beat.particles ?? scene.particles;
  const particleConfig = beat.particleConfig ?? scene.particleConfig;
  if (particles !== undefined) block.particles = particles;
  if (particleConfig !== undefined) block.particleConfig = JSON.parse(JSON.stringify(particleConfig));
  for (const key of ["backgroundTransition", "backgroundTransitionSpeed", "backgroundHold", "backgroundRevert", "holdSeconds"] as const) {
    if (beat[key] !== undefined) block[key] = beat[key];
  }
  if (beat.animation !== undefined) block.animation = JSON.parse(JSON.stringify(beat.animation));
  return block;
}

export function pasteEffectBlock(project: ProjectState, frameIds: string[], block: EffectBlock): ProjectState {
  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  for (const frameId of frameIds) {
    const location = locateBeat(story, frameId);
    if (!location) continue;
    const target = frames.find((frame) => frame.id === frameId);
    if (!target) continue;
    location.beat.cinematic = block.cinematic ? JSON.parse(JSON.stringify(block.cinematic)) : undefined;
    for (const key of ["particles", "particleConfig", "backgroundTransition", "backgroundTransitionSpeed", "backgroundHold", "backgroundRevert", "holdSeconds", "animation"]) {
      if (block[key as keyof EffectBlock] === undefined) delete location.beat[key];
      else location.beat[key] = JSON.parse(JSON.stringify(block[key as keyof EffectBlock]));
    }
  }
  return { ...project, story, updatedAt: Date.now() };
}

export function trimKeyframe(project: ProjectState, frameId: string, durationFrames: number): ProjectState {
  const clamped = Math.max(MIN_CLIP_FRAMES, Math.round(durationFrames));
  return updateBeat(project, frameId, (beat) => {
    beat.durationFrames = clamped;
  });
}

/**
 * Roll edit across the cut between `leftFrameId` and `rightFrameId`:
 * moves the cut by `deltaFrames` so one clip grows and the adjacent clip shrinks
 * by the exact same number of frames, keeping total timeline length unchanged.
 */
export function rollKeyframeCut(
  project: ProjectState,
  leftFrameId: string,
  rightFrameId: string,
  deltaFrames: number,
  leftVoiceSeconds?: number,
  rightVoiceSeconds?: number,
): ProjectState {
  if (leftFrameId === rightFrameId) return project;
  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  const leftKf = frames.find((f) => f.id === leftFrameId);
  const rightKf = frames.find((f) => f.id === rightFrameId);
  const leftLoc = locateBeat(story, leftFrameId);
  const rightLoc = locateBeat(story, rightFrameId);
  if (!leftKf || !rightKf || !leftLoc || !rightLoc) return project;

  const leftInitial = clipFrames(leftKf, leftVoiceSeconds);
  const rightInitial = clipFrames(rightKf, rightVoiceSeconds);
  const minDelta = MIN_CLIP_FRAMES - leftInitial;
  const maxDelta = rightInitial - MIN_CLIP_FRAMES;
  if (minDelta > maxDelta) return project;

  const clampedDelta = Math.max(minDelta, Math.min(maxDelta, Math.round(deltaFrames)));
  if (clampedDelta === 0 && leftLoc.beat.durationFrames !== undefined && rightLoc.beat.durationFrames !== undefined) {
    return project;
  }

  leftLoc.beat.durationFrames = leftInitial + clampedDelta;
  rightLoc.beat.durationFrames = rightInitial - clampedDelta;
  return { ...project, story, updatedAt: Date.now() };
}

export function setRollDurations(
  project: ProjectState,
  leftFrameId: string,
  rightFrameId: string,
  leftDuration: number,
  rightDuration: number,
): ProjectState {
  if (leftFrameId === rightFrameId) return project;
  const story = cloneStory(project.story);
  const leftLoc = locateBeat(story, leftFrameId);
  const rightLoc = locateBeat(story, rightFrameId);
  if (!leftLoc || !rightLoc) return project;
  leftLoc.beat.durationFrames = Math.max(MIN_CLIP_FRAMES, Math.round(leftDuration));
  rightLoc.beat.durationFrames = Math.max(MIN_CLIP_FRAMES, Math.round(rightDuration));
  return { ...project, story, updatedAt: Date.now() };
}

export function setCutTransition(
  project: ProjectState,
  incomingFrameId: string,
  kind: TransitionKind,
  durationFrames = DEFAULT_TRANSITION_FRAMES,
): ProjectState {
  return updateBeat(project, incomingFrameId, (beat) => {
    beat.backgroundTransition = kind;
    if (kind === "cut") {
      beat.backgroundTransitionSpeed = 0;
    } else {
      const safeFrames = Math.max(1, Math.round(durationFrames));
      beat.backgroundTransitionSpeed = Number((safeFrames / FPS).toFixed(6));
    }
  });
}

export function setBeatAnimation(
  project: ProjectState,
  frameId: string,
  animation: BeatAnimation | undefined,
): ProjectState {
  const cleaned = normalizeAnimation(animation);
  return updateBeat(project, frameId, (beat) => {
    if (cleaned) beat.animation = cleaned;
    else delete beat.animation;
  });
}

export function splitKeyframeAt(
  project: ProjectState,
  frameId: string,
  splitOffsetFrames: number,
  voiceSeconds?: number,
): { project: ProjectState; leftId: string; rightId: string } | undefined {
  const story = cloneStory(project.story);
  const keyframes = buildKeyframes(story);
  const keyframe = keyframes.find((item) => item.id === frameId);
  const location = locateBeat(story, frameId);
  if (!keyframe || !location) return undefined;

  const total = clipFrames(keyframe, voiceSeconds);
  const cut = Math.round(splitOffsetFrames);
  if (cut <= 0 || cut >= total) return undefined;

  const leftBeat = location.beat;
  const rightBeat: BeatLike = JSON.parse(JSON.stringify(leftBeat));
  rightBeat.id = uniqueBeatId(story, location.scene.id);
  rightBeat.text = "";

  const effectivePicture = leftBeat.background || keyframe.picture;
  if (effectivePicture) {
    rightBeat.background = effectivePicture;
    rightBeat.backgroundRevert = false;
    rightBeat.backgroundHold = true;
  }

  // Splitting a clip creates a hard cut in the middle unless edited later
  delete rightBeat.backgroundTransition;
  delete rightBeat.backgroundTransitionSpeed;
  delete rightBeat.audioUrl;
  delete rightBeat.audioOffsetSeconds;
  delete rightBeat.sfxUrl;
  delete rightBeat.sfxVolume;

  // Keep any outgoing scene link on whichever half comes second so the scene chain stays intact.
  delete leftBeat.afterBeatTargetSceneId;
  delete leftBeat.afterBeatDelaySeconds;
  delete leftBeat.afterBeatMode;

  leftBeat.durationFrames = cut;
  rightBeat.durationFrames = total - cut;

  const [leftAnim, rightAnim] = splitAnimation(leftBeat.animation, cut);
  if (leftAnim) leftBeat.animation = leftAnim;
  else delete leftBeat.animation;
  if (rightAnim) rightBeat.animation = rightAnim;
  else delete rightBeat.animation;

  location.scene.dialogueBeats!.splice(location.index + 1, 0, rightBeat);
  return {
    project: { ...project, story, updatedAt: Date.now() },
    leftId: frameId,
    rightId: rightBeat.id!,
  };
}

export function insertKeyframeAfter(project: ProjectState, frameId: string): { project: ProjectState; insertedId: string } | undefined {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return undefined;
  const originalText = String(location.beat.text || "");
  const [left, right] = splitBeatText(originalText);
  const nextBeat: BeatLike = JSON.parse(JSON.stringify(location.beat));
  nextBeat.id = uniqueBeatId(story, location.scene.id);
  nextBeat.text = right;
  delete nextBeat.background;
  delete nextBeat.backgroundRevert;
  delete nextBeat.audioUrl;
  delete nextBeat.sfxUrl;
  delete location.beat.afterBeatTargetSceneId;
  delete location.beat.afterBeatDelaySeconds;
  delete location.beat.afterBeatMode;
  location.beat.text = left;
  location.scene.dialogueBeats!.splice(location.index + 1, 0, nextBeat);
  return { project: { ...project, story, updatedAt: Date.now() }, insertedId: nextBeat.id! };
}

export function duplicateKeyframe(project: ProjectState, frameId: string): { project: ProjectState; insertedId: string } | undefined {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return undefined;
  const duplicate = JSON.parse(JSON.stringify(location.beat)) as BeatLike;
  duplicate.id = uniqueBeatId(story, location.scene.id);
  delete location.beat.afterBeatTargetSceneId;
  delete location.beat.afterBeatDelaySeconds;
  delete location.beat.afterBeatMode;
  location.scene.dialogueBeats!.splice(location.index + 1, 0, duplicate);
  return { project: { ...project, story, updatedAt: Date.now() }, insertedId: duplicate.id! };
}

export function deleteKeyframe(project: ProjectState, frameId: string): ProjectState {
  return deleteKeyframes(project, [frameId]);
}

export function deleteKeyframes(project: ProjectState, frameIds: string[]): ProjectState {
  if (!frameIds.length) return project;
  const story = cloneStory(project.story);
  const chain = captureSceneChain(story);
  const idSet = new Set(frameIds);
  const frames = buildKeyframes(story);
  const toDelete = new Set<BeatLike>();
  for (const kf of frames) {
    if (idSet.has(kf.id)) toDelete.add(kf.beat);
  }
  if (!toDelete.size) return project;

  for (const scene of story.scenes) {
    if (!scene.dialogueBeats?.length) continue;
    scene.dialogueBeats = scene.dialogueBeats.filter((beat) => !toDelete.has(beat));
  }
  restoreSceneChain(story, chain);
  return { ...project, story, updatedAt: Date.now() };
}

/**
 * Finds the scene & beat insertion slot corresponding to `dropFrame` on `clips`.
 */
export function insertionSlotAtFrame(
  clips: TimelineClip[],
  dropFrame: number,
): { targetSceneId: string; targetBeatIndex: number; indicatorFrame: number } | undefined {
  if (!clips.length) return undefined;
  const clamped = Math.max(0, dropFrame);

  if (clamped <= clips[0].startFrame) {
    return {
      targetSceneId: clips[0].keyframe.sceneId,
      targetBeatIndex: 0,
      indicatorFrame: 0,
    };
  }

  const last = clips[clips.length - 1];
  if (clamped >= last.endFrame) {
    return {
      targetSceneId: last.keyframe.sceneId,
      targetBeatIndex: last.keyframe.beatIndex + 1,
      indicatorFrame: last.endFrame,
    };
  }

  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    if (clamped >= clip.startFrame && clamped < clip.endFrame) {
      const mid = clip.startFrame + clip.durationFrames / 2;
      if (clamped < mid) {
        return {
          targetSceneId: clip.keyframe.sceneId,
          targetBeatIndex: clip.keyframe.beatIndex,
          indicatorFrame: clip.startFrame,
        };
      }
      // If right half of the last clip in a scene and there is a next scene starting at clip.endFrame,
      // check whether cursor is closer to next scene start or stays at end of this scene:
      return {
        targetSceneId: clip.keyframe.sceneId,
        targetBeatIndex: clip.keyframe.beatIndex + 1,
        indicatorFrame: clip.endFrame,
      };
    }
  }

  return {
    targetSceneId: last.keyframe.sceneId,
    targetBeatIndex: last.keyframe.beatIndex + 1,
    indicatorFrame: last.endFrame,
  };
}

/**
 * Moves (or copies with `copy: true`) one or more keyframes within a scene or across scenes,
 * keeping all beat fields (voice, sound effect, caption, picture, animation, effects) intact
 * while preserving the running scene chain.
 */
export function reorderKeyframeWithResult(
  project: ProjectState,
  frameIdOrIds: string | string[],
  target: (-1 | 1) | ReorderDestination,
): { project: ProjectState; resultIds: string[] } {
  const ids = Array.isArray(frameIdOrIds) ? frameIdOrIds : [frameIdOrIds];
  if (!ids.length) return { project, resultIds: [] };

  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  const idSet = new Set(ids);
  const selectedFrames = frames.filter((f) => idSet.has(f.id));
  if (!selectedFrames.length) return { project, resultIds: [] };

  let destination: ReorderDestination;
  if (typeof target === "number") {
    const delta = target;
    if (delta < 0) {
      const firstIdx = frames.findIndex((f) => f.id === selectedFrames[0].id);
      if (firstIdx <= 0) return { project, resultIds: selectedFrames.map((f) => f.id) };
      const prev = frames[firstIdx - 1];
      destination = { targetSceneId: prev.sceneId, targetBeatIndex: prev.beatIndex };
    } else {
      const lastSelected = selectedFrames[selectedFrames.length - 1];
      const lastIdx = frames.findIndex((f) => f.id === lastSelected.id);
      if (lastIdx < 0 || lastIdx >= frames.length - 1) {
        return { project, resultIds: selectedFrames.map((f) => f.id) };
      }
      const next = frames[lastIdx + 1];
      destination = { targetSceneId: next.sceneId, targetBeatIndex: next.beatIndex + 1 };
    }
  } else {
    destination = target;
  }

  const targetScene = story.scenes.find((s) => s.id === destination.targetSceneId);
  if (!targetScene) return { project, resultIds: selectedFrames.map((f) => f.id) };
  if (!targetScene.dialogueBeats) targetScene.dialogueBeats = [];

  const chain = captureSceneChain(story);
  const movingBeatSet = new Set(selectedFrames.map((f) => f.beat));
  const clampedIndex = Math.max(0, Math.min(targetScene.dialogueBeats.length, destination.targetBeatIndex));

  if (destination.copy) {
    const copies: BeatLike[] = selectedFrames.map((f) => {
      const copy = JSON.parse(JSON.stringify(f.beat)) as BeatLike;
      copy.id = uniqueBeatId(story, targetScene.id);
      return copy;
    });
    targetScene.dialogueBeats.splice(clampedIndex, 0, ...copies);
    restoreSceneChain(story, chain);
    return {
      project: { ...project, story, updatedAt: Date.now() },
      resultIds: copies.map((b) => b.id!),
    };
  }

  // Find the first non-moving beat at or after clampedIndex in targetScene to serve as a stable anchor.
  let anchorBeat: BeatLike | undefined;
  for (let i = clampedIndex; i < targetScene.dialogueBeats.length; i += 1) {
    const candidate = targetScene.dialogueBeats[i];
    if (!movingBeatSet.has(candidate)) {
      anchorBeat = candidate;
      break;
    }
  }

  const orderedBeatsToMove = selectedFrames.map((f) => {
    if (!f.beat.id) f.beat.id = uniqueBeatId(story, targetScene.id);
    return f.beat;
  });

  // Check if nothing actually changes position
  if (
    selectedFrames.every((f) => f.sceneId === targetScene.id) &&
    (() => {
      const simulated = targetScene.dialogueBeats!.filter((b) => !movingBeatSet.has(b));
      const insertAt = anchorBeat ? simulated.indexOf(anchorBeat) : simulated.length;
      simulated.splice(insertAt < 0 ? simulated.length : insertAt, 0, ...orderedBeatsToMove);
      return simulated.every((b, idx) => b === targetScene.dialogueBeats![idx]);
    })()
  ) {
    return { project, resultIds: selectedFrames.map((f) => f.id) };
  }

  for (const scene of story.scenes) {
    if (!scene.dialogueBeats?.length) continue;
    scene.dialogueBeats = scene.dialogueBeats.filter((b) => !movingBeatSet.has(b));
  }

  const insertIndex = anchorBeat ? targetScene.dialogueBeats.indexOf(anchorBeat) : -1;
  if (insertIndex >= 0) {
    targetScene.dialogueBeats.splice(insertIndex, 0, ...orderedBeatsToMove);
  } else {
    targetScene.dialogueBeats.push(...orderedBeatsToMove);
  }

  restoreSceneChain(story, chain);
  const nextFrames = buildKeyframes(story);
  const movedIds = orderedBeatsToMove
    .map((beat) => nextFrames.find((f) => f.beat === beat)?.id)
    .filter((id): id is string => Boolean(id));

  return {
    project: { ...project, story, updatedAt: Date.now() },
    resultIds: movedIds,
  };
}

export function reorderKeyframe(
  project: ProjectState,
  frameIdOrIds: string | string[],
  target: (-1 | 1) | ReorderDestination,
): ProjectState {
  return reorderKeyframeWithResult(project, frameIdOrIds, target).project;
}

/**
 * Copies the selected clips' beats in timeline running order (stripping scene-advance links).
 */
export function copySelectedBeats(project: ProjectState, frameIds: string[]): BeatLike[] {
  if (!frameIds.length) return [];
  const story = cloneStory(project.story);
  const idSet = new Set(frameIds);
  const frames = buildKeyframes(story);
  captureSceneChain(story); // strips chain-only afterBeatTargetSceneId from cloned beats
  return frames
    .filter((f) => idSet.has(f.id))
    .map((f) => JSON.parse(JSON.stringify(f.beat)) as BeatLike);
}

/**
 * Inserts copies of `copiedBeats` at `playheadFrame`.
 * If `playheadFrame` is strictly inside a clip, splits that clip at `playheadFrame` first,
 * then inserts the copies between the two halves (all in one undoable state transition).
 */
export function pasteKeyframesAt(
  project: ProjectState,
  copiedBeats: BeatLike[],
  playheadFrame: number,
  voiceDurationByRef?: ReadonlyMap<string, number>,
): { project: ProjectState; insertedIds: string[] } | undefined {
  if (!copiedBeats.length) return undefined;

  let workingProject = project;
  const initialFrames = buildKeyframes(workingProject.story);
  const { clips, totalFrames } = buildTimelineClips(initialFrames, voiceDurationByRef);
  if (!clips.length) return undefined;

  const clampedPlayhead = Math.max(0, Math.round(playheadFrame));
  let targetSceneId: string;
  let targetBeatIndex: number;

  if (clampedPlayhead >= totalFrames) {
    const last = clips[clips.length - 1];
    targetSceneId = last.keyframe.sceneId;
    targetBeatIndex = last.keyframe.beatIndex + 1;
  } else {
    const active = clips.find((c) => clampedPlayhead >= c.startFrame && clampedPlayhead < c.endFrame) || clips[0];
    if (clampedPlayhead > active.startFrame && clampedPlayhead < active.endFrame) {
      const localSplit = clampedPlayhead - active.startFrame;
      const audioRef = active.keyframe.beat.audioUrl;
      const voiceSec = audioRef ? voiceDurationByRef?.get(audioRef) : undefined;
      const splitResult = splitKeyframeAt(workingProject, active.keyframe.id, localSplit, voiceSec);
      if (splitResult) {
        workingProject = splitResult.project;
        const postSplitFrames = buildKeyframes(workingProject.story);
        const rightKf = postSplitFrames.find((f) => f.id === splitResult.rightId);
        if (rightKf) {
          targetSceneId = rightKf.sceneId;
          targetBeatIndex = rightKf.beatIndex;
        } else {
          targetSceneId = active.keyframe.sceneId;
          targetBeatIndex = active.keyframe.beatIndex + 1;
        }
      } else {
        targetSceneId = active.keyframe.sceneId;
        targetBeatIndex = active.keyframe.beatIndex + 1;
      }
    } else {
      targetSceneId = active.keyframe.sceneId;
      targetBeatIndex = active.keyframe.beatIndex;
    }
  }

  const story = cloneStory(workingProject.story);
  const chain = captureSceneChain(story);
  const scene = story.scenes.find((s) => s.id === targetSceneId);
  if (!scene) return undefined;
  if (!scene.dialogueBeats) scene.dialogueBeats = [];

  const clones: BeatLike[] = copiedBeats.map((beat) => {
    const clone = JSON.parse(JSON.stringify(beat)) as BeatLike;
    clone.id = uniqueBeatId(story, scene.id);
    delete clone.afterBeatTargetSceneId;
    delete clone.afterBeatDelaySeconds;
    delete clone.afterBeatMode;
    return clone;
  });

  const idx = Math.max(0, Math.min(scene.dialogueBeats.length, targetBeatIndex));
  scene.dialogueBeats.splice(idx, 0, ...clones);
  restoreSceneChain(story, chain);

  return {
    project: { ...workingProject, story, updatedAt: Date.now() },
    insertedIds: clones.map((b) => b.id!),
  };
}

export function addNoteMarker(project: ProjectState, frame: number, name: string): { project: ProjectState; marker: NoteMarker } {
  const story = cloneStory(project.story);
  const existing = Array.isArray(story.markers) ? [...story.markers] : [];
  const marker: NoteMarker = {
    id: `marker-${crypto.randomUUID().slice(0, 8)}`,
    frame: Math.max(0, Math.round(frame)),
    name: name.trim() || `Note ${existing.length + 1}`,
  };
  existing.push(marker);
  existing.sort((a, b) => a.frame - b.frame);
  story.markers = existing;
  return {
    project: { ...project, story, updatedAt: Date.now() },
    marker,
  };
}

export function updateNoteMarker(project: ProjectState, markerId: string, patch: Partial<Pick<NoteMarker, "name" | "frame">>): ProjectState {
  const story = cloneStory(project.story);
  const existing = Array.isArray(story.markers) ? [...story.markers] : [];
  const index = existing.findIndex((m) => m.id === markerId);
  if (index < 0) return project;
  existing[index] = {
    ...existing[index],
    ...(patch.name !== undefined ? { name: patch.name.trim() || existing[index].name } : {}),
    ...(patch.frame !== undefined ? { frame: Math.max(0, Math.round(patch.frame)) } : {}),
  };
  existing.sort((a, b) => a.frame - b.frame);
  story.markers = existing;
  return { ...project, story, updatedAt: Date.now() };
}

export function deleteNoteMarker(project: ProjectState, markerId: string): ProjectState {
  const story = cloneStory(project.story);
  const existing = Array.isArray(story.markers) ? story.markers : [];
  if (!existing.some((m) => m.id === markerId)) return project;
  story.markers = existing.filter((m) => m.id !== markerId);
  return { ...project, story, updatedAt: Date.now() };
}

export function moveSfxCue(project: ProjectState, sourceFrameId: string, targetFrameId: string): ProjectState {
  const story = cloneStory(project.story);
  const from = locateBeat(story, sourceFrameId);
  const to = locateBeat(story, targetFrameId);
  if (!from || !to || !from.beat.sfxUrl) return project;
  to.beat.sfxUrl = from.beat.sfxUrl;
  to.beat.sfxVolume = from.beat.sfxVolume;
  if (from.beat !== to.beat) {
    delete from.beat.sfxUrl;
    delete from.beat.sfxVolume;
  }
  return { ...project, story, updatedAt: Date.now() };
}

export function setSceneField(project: ProjectState, sceneId: string, path: string, value: unknown): ProjectState {
  const story = cloneStory(project.story);
  const scene = story.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return project;
  setPath(scene, path, value);
  return { ...project, story, updatedAt: Date.now() };
}

interface SceneChainEntry {
  sceneId: string;
  nextSceneId?: string;
  delaySeconds?: number;
  mode?: unknown;
}

function captureSceneChain(story: StoryLike): SceneChainEntry[] {
  const orderedIds = runningSceneIds(story);
  const byId = new Map(story.scenes.map((s) => [s.id, s]));
  const entries: SceneChainEntry[] = [];

  for (let i = 0; i < orderedIds.length; i += 1) {
    const scene = byId.get(orderedIds[i]);
    if (!scene) continue;
    const beats = scene.dialogueBeats ?? [];
    const lastBeat = beats[beats.length - 1];
    const nextSceneId =
      i + 1 < orderedIds.length
        ? orderedIds[i + 1]
        : lastBeat?.afterBeatTargetSceneId || scene.autoAdvanceTargetSceneId;

    const entry: SceneChainEntry = {
      sceneId: scene.id,
      nextSceneId,
      delaySeconds: lastBeat?.afterBeatDelaySeconds,
      mode: lastBeat?.afterBeatMode,
    };
    entries.push(entry);

    // Strip chain-routing pointers off individual beats while beats are being moved/deleted
    for (const beat of beats) {
      if (beat.afterBeatTargetSceneId && beat.afterBeatTargetSceneId === nextSceneId) {
        delete beat.afterBeatTargetSceneId;
        delete beat.afterBeatDelaySeconds;
        delete beat.afterBeatMode;
      }
    }
  }

  return entries;
}

function restoreSceneChain(story: StoryLike, chain: SceneChainEntry[]): void {
  const byId = new Map(story.scenes.map((s) => [s.id, s]));
  for (const entry of chain) {
    if (!entry.nextSceneId) continue;
    const scene = byId.get(entry.sceneId);
    if (!scene) continue;
    const beats = scene.dialogueBeats ?? [];
    if (beats.length > 0) {
      const lastBeat = beats[beats.length - 1];
      if (
        scene.autoAdvanceTargetSceneId !== entry.nextSceneId &&
        scene.choices?.[0]?.targetSceneId !== entry.nextSceneId
      ) {
        lastBeat.afterBeatTargetSceneId = entry.nextSceneId;
        if (entry.delaySeconds !== undefined) lastBeat.afterBeatDelaySeconds = entry.delaySeconds;
        if (entry.mode !== undefined) lastBeat.afterBeatMode = entry.mode;
      }
    } else {
      scene.autoAdvanceTargetSceneId = entry.nextSceneId;
    }
  }
}

function updateBeat(project: ProjectState, frameId: string, update: (beat: BeatLike) => void): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  update(location.beat);
  return { ...project, story, updatedAt: Date.now() };
}

function locateBeat(story: StoryLike, frameId: string): { scene: SceneLike; beat: BeatLike; index: number } | undefined {
  // First resolve through running order with seenIds deduplication (matches buildKeyframes 1:1)
  const orderedIds = runningSceneIds(story);
  const sceneById = new Map(story.scenes.map((s) => [s.id, s]));
  const seenIds = new Set<string>();
  for (const sceneId of orderedIds) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;
    const beats = scene.dialogueBeats ?? [];
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex += 1) {
      const beat = beats[beatIndex];
      const rawId = String(beat.id || `${scene.id}:${beatIndex + 1}`);
      const id = seenIds.has(rawId) ? `${scene.id}:${rawId}` : rawId;
      seenIds.add(id);
      if (id === frameId) return { scene, beat, index: beatIndex };
    }
  }
  // Fallback for unreachable scenes
  for (const scene of story.scenes) {
    const beats = scene.dialogueBeats ?? [];
    const index = beats.findIndex((beat, beatIndex) => String(beat.id || `${scene.id}:${beatIndex + 1}`) === frameId);
    if (index >= 0) return { scene, beat: beats[index], index };
  }
  return undefined;
}

function uniqueBeatId(story: StoryLike, sceneId: string): string {
  const existing = new Set(story.scenes.flatMap((scene) => (scene.dialogueBeats ?? []).map((beat) => beat.id)));
  let id = `${sceneId}_edit_${crypto.randomUUID().slice(0, 8)}`;
  while (existing.has(id)) id = `${sceneId}_edit_${crypto.randomUUID().slice(0, 8)}`;
  return id;
}

function splitBeatText(value: string): [string, string] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [value, ""];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function pathParts(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function getPath(target: unknown, path: string): any {
  let value = target as AnyRecord;
  for (const part of pathParts(path)) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function setPath(target: AnyRecord, path: string, value: unknown): void {
  const parts = pathParts(path);
  if (!parts.length) return;
  let parent = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = parts[index + 1];
    if (parent[part] == null || typeof parent[part] !== "object") parent[part] = /^\d+$/.test(next) ? [] : {};
    parent = parent[part];
  }
  const leaf = parts[parts.length - 1];
  if (value === undefined) delete parent[leaf];
  else parent[leaf] = value;
}

function deletePath(target: AnyRecord, path: string): void {
  const parts = pathParts(path);
  if (!parts.length) return;
  let parent = target;
  for (const part of parts.slice(0, -1)) {
    parent = parent?.[part];
    if (parent == null) return;
  }
  delete parent[parts[parts.length - 1]];
}
