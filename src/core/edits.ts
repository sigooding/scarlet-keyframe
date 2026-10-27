import type { AnyRecord, BeatAnimation, BeatLike, Keyframe, ProjectState, StoryLike } from "./model";
import { buildKeyframes } from "./model";
import { clipFrames, MIN_CLIP_FRAMES } from "./timing";
import { normalizeAnimation, splitAnimation } from "../sequence/animate";

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
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const beats = location.scene.dialogueBeats!;
  const wasLast = location.index === beats.length - 1;
  const outgoingTarget = location.beat.afterBeatTargetSceneId;
  const outgoingDelay = location.beat.afterBeatDelaySeconds;
  const outgoingMode = location.beat.afterBeatMode;
  beats.splice(location.index, 1);
  if (wasLast && outgoingTarget) {
    if (beats.length > 0) {
      const newLast = beats[beats.length - 1];
      if (!newLast.afterBeatTargetSceneId) {
        newLast.afterBeatTargetSceneId = outgoingTarget;
        if (outgoingDelay !== undefined) newLast.afterBeatDelaySeconds = outgoingDelay;
        if (outgoingMode !== undefined) newLast.afterBeatMode = outgoingMode;
      }
    } else if (!location.scene.autoAdvanceTargetSceneId) {
      location.scene.autoAdvanceTargetSceneId = outgoingTarget;
    }
  }
  return { ...project, story, updatedAt: Date.now() };
}

export function reorderKeyframe(project: ProjectState, frameId: string, delta: -1 | 1): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const nextIndex = location.index + delta;
  if (nextIndex < 0 || nextIndex >= location.scene.dialogueBeats!.length) return project;
  const beats = location.scene.dialogueBeats!;
  [beats[location.index], beats[nextIndex]] = [beats[nextIndex], beats[location.index]];
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

function updateBeat(project: ProjectState, frameId: string, update: (beat: BeatLike) => void): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  update(location.beat);
  return { ...project, story, updatedAt: Date.now() };
}

function locateBeat(story: StoryLike, frameId: string): { scene: StoryLike["scenes"][number]; beat: BeatLike; index: number } | undefined {
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
