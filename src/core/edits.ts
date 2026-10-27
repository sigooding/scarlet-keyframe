import type { AnyRecord, BeatLike, Keyframe, ProjectState, StoryLike } from "./model";
import { buildKeyframes } from "./model";
import { clipFrames, MIN_CLIP_FRAMES } from "./timing";
import {
  ANIMATION_PROPERTIES,
  animationOf,
  isEmptyAnimation,
  keyAt,
  splitAnimation,
  withKey,
  withoutKey,
  type AnimationProperty,
  type ClipAnimation,
  type Easing,
} from "../sequence/animate";

export interface EffectBlock {
  cinematic?: AnyRecord;
  particles?: string;
  particleConfig?: AnyRecord;
  backgroundTransition?: string;
  backgroundTransitionSpeed?: number;
  backgroundHold?: boolean;
  backgroundRevert?: boolean;
  holdSeconds?: number;
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
    for (const key of ["particles", "particleConfig", "backgroundTransition", "backgroundTransitionSpeed", "backgroundHold", "backgroundRevert", "holdSeconds"]) {
      if (block[key as keyof EffectBlock] === undefined) delete location.beat[key];
      else location.beat[key] = JSON.parse(JSON.stringify(block[key as keyof EffectBlock]));
    }
  }
  return { ...project, story, updatedAt: Date.now() };
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
  delete nextBeat.afterBeatTargetSceneId;
  delete nextBeat.afterBeatDelaySeconds;
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
  location.scene.dialogueBeats!.splice(location.index + 1, 0, duplicate);
  return { project: { ...project, story, updatedAt: Date.now() }, insertedId: duplicate.id! };
}

export function deleteKeyframe(project: ProjectState, frameId: string): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  location.scene.dialogueBeats!.splice(location.index, 1);
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

/* ------------------------------------------------------------------ *
 * Timeline editing: trim, split and zoom/position animation keyframes  *
 * ------------------------------------------------------------------ */

// Trim: set the clip's length in frames. Everything after it ripples to a new start.
export function setClipDuration(project: ProjectState, frameId: string, durationFrames: number): ProjectState {
  const rounded = Math.max(MIN_CLIP_FRAMES, Math.round(durationFrames));
  const frame = buildKeyframes(project.story).find((candidate) => candidate.id === frameId);
  if (!frame) return project;
  if (clipFrames(frame) === rounded && Number(frame.beat.durationFrames) === rounded) return project;
  return updateBeat(project, frameId, (beat) => { beat.durationFrames = rounded; });
}

// Split: the first clip ends at the playhead, the second gets the rest, the same picture and no text.
// Each half keeps its own zoom/position keys, re-timed to its own start.
export function splitClip(
  project: ProjectState,
  frameId: string,
  atLocalFrame: number,
): { project: ProjectState; firstId: string; secondId: string; at: number } | undefined {
  const frames = buildKeyframes(project.story);
  const frame = frames.find((candidate) => candidate.id === frameId);
  if (!frame) return undefined;
  const total = clipFrames(frame);
  const at = Math.round(Number.isFinite(atLocalFrame) ? atLocalFrame : 0);
  if (at < MIN_CLIP_FRAMES || total - at < MIN_CLIP_FRAMES) return undefined;

  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return undefined;

  const [firstAnimation, secondAnimation] = splitAnimation(animationOf(frame), at);
  const secondBeat = JSON.parse(JSON.stringify(location.beat)) as BeatLike;
  secondBeat.id = uniqueBeatId(story, location.scene.id);
  secondBeat.text = "";
  secondBeat.durationFrames = total - at;
  delete secondBeat.audioUrl;
  delete secondBeat.audioOffsetSeconds;
  delete secondBeat.sfxUrl;
  delete secondBeat.sfxVolume;
  delete secondBeat.afterBeatTargetSceneId;
  delete secondBeat.afterBeatDelaySeconds;
  delete secondBeat.holdSeconds;
  // The second half keeps the picture that was on screen at the cut.
  if (frame.picture) {
    secondBeat.background = frame.picture;
    secondBeat.backgroundRevert = false;
    secondBeat.backgroundHold = true;
  } else {
    delete secondBeat.background;
  }
  applyAnimation(secondBeat, secondAnimation);
  applyAnimation(location.beat, firstAnimation);
  location.beat.durationFrames = at;

  location.scene.dialogueBeats!.splice(location.index + 1, 0, secondBeat);
  return {
    project: { ...project, story, updatedAt: Date.now() },
    firstId: String(location.beat.id || frameId),
    secondId: String(secondBeat.id),
    at,
  };
}

// Move a slider: change the key at the playhead, otherwise add one if the property is already animated.
export function setAnimationValue(
  project: ProjectState,
  frameId: string,
  property: AnimationProperty,
  localFrame: number,
  value: number,
): ProjectState {
  return writeAnimation(project, frameId, (animation) => {
    const frame = Math.max(0, Math.round(localFrame));
    const keys = animation[property] ?? [];
    const existing = keyAt(keys, frame);
    if (existing) {
      existing.value = value;
      return true;
    }
    if (!keys.length) return false;
    animation[property] = withKey(keys, frame, value, "linear");
    return true;
  });
}

// The diamond: add a key at the playhead, or remove the one that is already there.
export function toggleAnimationKey(
  project: ProjectState,
  frameId: string,
  property: AnimationProperty,
  localFrame: number,
  value: number,
): ProjectState {
  return writeAnimation(project, frameId, (animation) => {
    const frame = Math.max(0, Math.round(localFrame));
    const keys = animation[property] ?? [];
    if (keyAt(keys, frame)) {
      const next = withoutKey(keys, frame);
      if (next.length) animation[property] = next;
      else delete animation[property];
      return true;
    }
    animation[property] = withKey(keys, frame, value, "linear");
    return true;
  });
}

export function setAnimationEasing(
  project: ProjectState,
  frameId: string,
  property: AnimationProperty,
  localFrame: number,
  easing: Easing,
): ProjectState {
  return writeAnimation(project, frameId, (animation) => {
    const key = keyAt(animation[property], Math.round(localFrame));
    if (!key) return false;
    key.easing = easing;
    return true;
  });
}

export function moveAnimationKey(
  project: ProjectState,
  frameId: string,
  property: AnimationProperty,
  fromFrame: number,
  toFrame: number,
): ProjectState {
  return writeAnimation(project, frameId, (animation) => {
    const keys = animation[property] ?? [];
    const key = keyAt(keys, Math.round(fromFrame));
    if (!key) return false;
    const target = Math.max(0, Math.round(toFrame));
    if (target === key.frame) return false;
    // A key that lands on another one replaces it; the list stays sorted.
    const others = keys.filter((item) => item !== key && item.frame !== target);
    animation[property] = [...others, { frame: target, value: key.value, easing: key.easing }].sort((a, b) => a.frame - b.frame);
    return true;
  });
}

export function clearAnimation(project: ProjectState, frameId: string): ProjectState {
  return updateBeat(project, frameId, (beat) => { delete beat.animation; });
}

function applyAnimation(beat: BeatLike, animation: ClipAnimation | undefined): void {
  if (animation && !isEmptyAnimation(animation)) beat.animation = animation;
  else delete beat.animation;
}

// Run an animation edit on one beat; the project is only rebuilt when something actually changed.
function writeAnimation(
  project: ProjectState,
  frameId: string,
  mutate: (animation: ClipAnimation) => boolean,
): ProjectState {
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const current = animationOf({ beat: location.beat });
  const animation: ClipAnimation = {};
  for (const property of ANIMATION_PROPERTIES) {
    const keys = current?.[property];
    if (keys?.length) animation[property] = keys.map((key) => ({ ...key }));
  }
  if (!mutate(animation)) return project;
  applyAnimation(location.beat, animation);
  return { ...project, story, updatedAt: Date.now() };
}
