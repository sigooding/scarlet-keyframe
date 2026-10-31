import {
  EMPTY_MULTI_SELECTION,
  reanchorAudioClipToMs,
  resolveAudioClips,
  type AudioClip,
  type MultiLaneSelection,
  type SelectedKeyframeDiamond,
} from "./audioClips";
import {
  deleteCaptionsAtIndices,
  effectiveCaptionsForBeat,
  isNarrationBeat,
  normalizeCaptions,
  normalizeCaptionStyle,
  resolveTimelineCaptions,
  splitCaptionsAcrossCut,
  type BeatCaption,
  type CaptionStyle,
} from "./captions";
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
import { buildKeyframes, convertStoryCameraMovesToKeyframes, runningSceneIds } from "./model";
import { clipFrames, FPS, MIN_CLIP_FRAMES } from "./timing";
import {
  ANIM_PROPS,
  buildTimelineClips,
  normalizeAnimation,
  pasteClipAnimationOnto,
  splitAnimation,
  type AnimProp,
  type TimelineClip,
} from "../sequence/animate";
import {
  DEFAULT_TRANSITION_FRAMES,
  mapTransitionKind,
  type TransitionAlignment,
  type TransitionKind,
} from "../sequence/transitions";

export interface EffectBlock {
  sourcePicture?: string;
  cinematic?: AnyRecord;
  particles?: string;
  particleConfig?: AnyRecord;
  backgroundTransition?: string;
  backgroundTransitionSpeed?: number;
  transitionAlignment?: TransitionAlignment;
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
  const preFrames = buildKeyframes(story);
  const targetIdx = preFrames.findIndex((f) => f.id === frameId);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const wasGap = location.beat.gap === true;

  if (picture) {
    // If filling a gap, stamp any immediately following beat that relied on carried picture
    // so filling the gap only changes this slot and never alters shots after it.
    if (wasGap && targetIdx >= 0) {
      for (let i = targetIdx + 1; i < preFrames.length; i += 1) {
        const downstream = preFrames[i];
        if (downstream.beat.gap) continue;
        if (!downstream.beat.background && downstream.picture) {
          downstream.beat.background = downstream.picture;
        }
        break;
      }
    }
    delete location.beat.gap;
    location.beat.background = picture;
    location.beat.backgroundRevert = false;
    // Storyboard drafts can opt into independent blank slots. Respect their
    // authored hold setting so filling one slot doesn't fill the whole film.
    if (!(story.independentStoryboardPictures && location.beat.backgroundHold === false)) {
      location.beat.backgroundHold = true;
    }
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
  const frames = buildKeyframes(story);
  const target = frames.find((f) => f.id === frameId);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const normalized = path.replace(/^cinematic\.?/, "");
  const baseCin = location.beat.cinematic ?? target?.cinematic ?? location.scene.cinematic ?? {};
  const cinematic: AnyRecord = JSON.parse(JSON.stringify(baseCin));
  setPath(cinematic, normalized, value);
  if (Object.keys(cinematic).length) location.beat.cinematic = cinematic;
  else delete location.beat.cinematic;
  return { ...project, story, updatedAt: Date.now() };
}

export function getEffectValue(frame: Keyframe, path: string): unknown {
  const normalized = path.replace(/^cinematic\.?/, "");
  const cinematic = frame.beat.cinematic ?? frame.cinematic ?? frame.scene.cinematic ?? {};
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

const SHOT_SPECIFIC_DEPTH_KEYS = ["depthMap", "depthPlate", "depthCutouts"] as const;

export function copyEffectBlock(frame: Keyframe): EffectBlock {
  const block: EffectBlock = {};
  if (frame.picture) block.sourcePicture = frame.picture;
  const cinematic = frame.beat.cinematic ?? frame.cinematic ?? frame.scene.cinematic;
  if (cinematic) block.cinematic = JSON.parse(JSON.stringify(cinematic));
  const beat = frame.beat as AnyRecord;
  const scene = frame.scene as AnyRecord;
  const particles = beat.particles ?? scene.particles;
  const particleConfig = beat.particleConfig ?? scene.particleConfig;
  if (particles !== undefined) block.particles = particles;
  if (particleConfig !== undefined) block.particleConfig = JSON.parse(JSON.stringify(particleConfig));
  for (const key of ["backgroundTransition", "backgroundTransitionSpeed", "transitionAlignment"] as const) {
    if (beat[key] !== undefined) {
      (block as AnyRecord)[key] = beat[key];
    }
  }
  if (beat.animation !== undefined) block.animation = JSON.parse(JSON.stringify(beat.animation));
  return block;
}

function fitAnimationToTargetDuration(
  sourceAnimation: BeatAnimation | undefined,
  targetDurationFrames: number,
): BeatAnimation | undefined {
  if (!sourceAnimation) return undefined;
  const maxValidFrame = Math.max(0, Math.floor(targetDurationFrames) - 1);
  const fitted: BeatAnimation = {
    ...(sourceAnimation.values ? { values: { ...sourceAnimation.values } } : {}),
  };
  for (const prop of ANIM_PROPS) {
    const keys = sourceAnimation[prop];
    if (!keys?.length) continue;
    const byFrame = new Map<number, (typeof keys)[number]>();
    for (const k of keys) {
      const clampedFrame = Math.max(0, Math.min(maxValidFrame, Math.round(k.frame)));
      byFrame.set(clampedFrame, {
        ...k,
        frame: clampedFrame,
        ...(k.bezier ? { bezier: [...k.bezier] as typeof k.bezier } : {}),
      });
    }
    fitted[prop] = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
  }
  return normalizeAnimation(fitted);
}

export function pasteEffectBlock(
  project: ProjectState,
  frameIds: string[],
  block: EffectBlock,
  voiceDurationByRef?: ReadonlyMap<string, number>,
): ProjectState {
  if (!frameIds.length) return project;
  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurationByRef);
  const clipById = new Map(clips.map((c) => [c.keyframe.id, c]));

  for (const frameId of frameIds) {
    const location = locateBeat(story, frameId);
    if (!location) continue;
    const target = frames.find((frame) => frame.id === frameId);
    if (!target) continue;
    const targetClip = clipById.get(frameId);
    const targetDur = targetClip?.durationFrames ?? clipFrames(target);

    const samePicture = Boolean(block.sourcePicture && target.picture === block.sourcePicture);
    const existingTargetCin =
      target.beat.cinematic ?? target.cinematic ?? target.scene.cinematic ?? {};

    if (block.cinematic) {
      const nextCin: AnyRecord = JSON.parse(JSON.stringify(block.cinematic));
      if (!samePicture) {
        for (const k of SHOT_SPECIFIC_DEPTH_KEYS) {
          delete nextCin[k];
          if (existingTargetCin[k] !== undefined) {
            nextCin[k] = JSON.parse(JSON.stringify(existingTargetCin[k]));
          }
        }
      }
      if (Object.keys(nextCin).length) location.beat.cinematic = nextCin;
      else delete location.beat.cinematic;
    } else {
      const preserved: AnyRecord = {};
      for (const k of SHOT_SPECIFIC_DEPTH_KEYS) {
        if (location.beat.cinematic?.[k] !== undefined) {
          preserved[k] = JSON.parse(JSON.stringify(location.beat.cinematic[k]));
        }
      }
      if (Object.keys(preserved).length) location.beat.cinematic = preserved;
      else delete location.beat.cinematic;
    }

    for (const key of [
      "particles",
      "particleConfig",
      "backgroundTransition",
      "backgroundTransitionSpeed",
      "transitionAlignment",
    ] as const) {
      const val = block[key];
      if (val === undefined) delete (location.beat as AnyRecord)[key];
      else (location.beat as AnyRecord)[key] = JSON.parse(JSON.stringify(val));
    }

    if (block.animation === undefined) {
      delete location.beat.animation;
    } else {
      const fitted =
        pasteClipAnimationOnto(block.animation, targetDur).droppedCount === 0
          ? pasteClipAnimationOnto(block.animation, targetDur).animation
          : fitAnimationToTargetDuration(block.animation, targetDur);
      if (fitted) location.beat.animation = fitted;
      else delete location.beat.animation;
    }
  }
  return { ...project, story, updatedAt: Date.now() };
}

/**
 * Resizes a picture keyframe to `durationFrames`.
 *
 * With `options.leaveGap` (the **Resize leaves gaps** timeline option), downstream keyframes
 * never shift while the clip is resized: shortening opens (or extends) a black gap right after
 * the clip — fillable later via right-click → **Add picture here…** — and lengthening eats into
 * that gap first, only rippling further downstream once the gap is exhausted. Without the option
 * the classic behaviour applies: later keyframes slide with every resize.
 */
export function trimKeyframe(
  project: ProjectState,
  frameId: string,
  durationFrames: number,
  options: { leaveGap?: boolean } = {},
): ProjectState {
  const clamped = Math.max(MIN_CLIP_FRAMES, Math.round(durationFrames));
  const story = cloneStory(project.story);
  const location = locateBeat(story, frameId);
  if (!location) return project;
  const prevDuration = Math.max(
    MIN_CLIP_FRAMES,
    Math.round(Number(location.beat.durationFrames) || clamped),
  );
  location.beat.durationFrames = clamped;
  if (Array.isArray(location.beat.captions)) {
    location.beat.captions = normalizeCaptions(location.beat.captions, clamped);
  }

  const delta = prevDuration - clamped;
  if (!options.leaveGap || delta === 0) {
    return { ...project, story, updatedAt: Date.now() };
  }

  ensureAllBeatIds(story);
  const frames = buildKeyframes(story);
  const myIdx = frames.findIndex((f) => f.id === frameId);
  const nextKf = myIdx >= 0 && myIdx + 1 < frames.length ? frames[myIdx + 1] : undefined;
  const nextBeat = nextKf?.beat;

  if (delta > 0) {
    // Shortened → open or extend a gap directly after the clip so later keyframes hold position.
    const chain = captureSceneChain(story);
    if (nextBeat?.gap) {
      nextBeat.durationFrames =
        Math.max(0, Math.round(Number(nextBeat.durationFrames) || 0)) + delta;
    } else {
      const gapBeat: BeatLike = {
        id: uniqueBeatId(story, location.scene.id),
        gap: true,
        durationFrames: delta,
        text: "",
      };
      location.scene.dialogueBeats!.splice(location.index + 1, 0, gapBeat);
    }
    restoreSceneChain(story, chain);
    return { ...project, story, updatedAt: Date.now() };
  }

  // Lengthened → absorb frames from the following gap when present; only a leftover overflow
  // (gap exhausted) ripples further downstream.
  const grow = -delta;
  if (!nextBeat?.gap) return { ...project, story, updatedAt: Date.now() };
  const gapFrames = Math.max(0, Math.round(Number(nextBeat.durationFrames) || 0));
  const remaining = gapFrames - grow;
  const grownProject = { ...project, story, updatedAt: Date.now() };
  if (remaining > 0) {
    nextBeat.durationFrames = remaining;
    return grownProject;
  }
  // Gap fully consumed: close it (also re-anchors any sounds anchored to the gap).
  const gapId = nextBeat.id ? String(nextBeat.id) : "";
  if (gapId) return closeGapKeyframes(grownProject, [gapId]);
  const chain = captureSceneChain(story);
  for (const scene of story.scenes) {
    if (!scene.dialogueBeats?.length) continue;
    scene.dialogueBeats = scene.dialogueBeats.filter((b) => b !== nextBeat);
  }
  restoreSceneChain(story, chain);
  return { ...project, story, updatedAt: Date.now() };
}

export function setBeatCaptions(
  project: ProjectState,
  frameId: string,
  captions: readonly BeatCaption[],
  clipDurationFrames?: number,
): ProjectState {
  return updateBeat(project, frameId, (beat) => {
    if (clipDurationFrames !== undefined) {
      beat.captions = normalizeCaptions(captions, clipDurationFrames);
    } else {
      beat.captions = captions.map((cap) => ({
        text: String(cap.text ?? ""),
        inFrame: Math.max(0, Math.round(cap.inFrame)),
        outFrame: Math.max(1, Math.round(cap.outFrame)),
        ...(cap.free ? { free: true } : {}),
        ...(cap.speaker !== undefined ? { speaker: cap.speaker } : {}),
        ...(cap.isNarration !== undefined ? { isNarration: cap.isNarration } : {}),
      }));
    }
  });
}

export interface MoveTimelineCaptionResult {
  project: ProjectState;
  anchorFrameId: string;
  anchorCaptionIndex: number;
}

/**
 * Moves or trims a timeline caption freely anywhere on the timeline (`[0, +inf)`),
 * re-anchoring cleanly to whichever shot contains `targetGlobalInFrame` while allowing
 * `targetGlobalOutFrame` to span across shot cuts, and never mutating `beat.text`.
 */
export function moveTimelineCaption(
  project: ProjectState,
  sourceFrameId: string,
  captionIndex: number,
  targetGlobalInFrame: number,
  targetGlobalOutFrame: number,
  options: {
    copy?: boolean;
    voiceDurationByRef?: ReadonlyMap<string, number>;
    totalFrames?: number;
  } = {},
): MoveTimelineCaptionResult {
  const { copy = false, voiceDurationByRef, totalFrames } = options;
  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  const { clips, totalFrames: computedTotalFrames } = buildTimelineClips(frames, voiceDurationByRef);
  if (!clips.length) {
    return { project, anchorFrameId: sourceFrameId, anchorCaptionIndex: captionIndex };
  }

  const maxTimelineFrames = Math.max(1, totalFrames ?? computedTotalFrames);
  const sourceClip = clips.find((c) => c.keyframe.id === sourceFrameId);
  if (!sourceClip) {
    return { project, anchorFrameId: sourceFrameId, anchorCaptionIndex: captionIndex };
  }

  const sourceCaps = effectiveCaptionsForBeat(sourceClip.keyframe.beat, sourceClip.durationFrames);
  if (captionIndex < 0 || captionIndex >= sourceCaps.length) {
    return { project, anchorFrameId: sourceFrameId, anchorCaptionIndex: captionIndex };
  }

  const moving = sourceCaps[captionIndex];
  const requestedLen = Math.max(1, Math.round(targetGlobalOutFrame) - Math.round(targetGlobalInFrame));
  const clampedGlobalIn = Math.max(
    0,
    Math.min(Math.max(0, maxTimelineFrames - 1), Math.round(targetGlobalInFrame)),
  );
  const clampedGlobalOut = Math.max(clampedGlobalIn + 1, clampedGlobalIn + requestedLen);

  const anchorClip =
    clips.find((c) => clampedGlobalIn >= c.startFrame && clampedGlobalIn < c.endFrame) ??
    clips[clips.length - 1];

  const localIn = Math.max(0, clampedGlobalIn - anchorClip.startFrame);
  const localOut = Math.max(localIn + 1, clampedGlobalOut - anchorClip.startFrame);
  const movedAcrossClips = anchorClip.keyframe.id !== sourceClip.keyframe.id;
  const speaker =
    moving.speaker ?? (movedAcrossClips ? sourceClip.keyframe.speaker : undefined);
  const isNarration =
    moving.isNarration ??
    (movedAcrossClips ? isNarrationBeat(sourceClip.keyframe.beat) : undefined);

  const placedCaption: BeatCaption = {
    text: moving.text,
    inFrame: localIn,
    outFrame: localOut,
    free: true,
    ...(speaker !== undefined ? { speaker } : {}),
    ...(isNarration !== undefined ? { isNarration } : {}),
  };

  if (anchorClip.keyframe.id === sourceClip.keyframe.id) {
    const remaining = copy
      ? [...sourceCaps]
      : sourceCaps.filter((_, idx) => idx !== captionIndex);
    // Trim or shift any non-moved sibling caption on the same beat so it doesn't collide
    const adjusted = adjustSiblingCaptionsAround(remaining, placedCaption);
    adjusted.push(placedCaption);
    adjusted.sort((a, b) => a.inFrame - b.inFrame || a.outFrame - b.outFrame);
    const newIdx = adjusted.indexOf(placedCaption);
    sourceClip.keyframe.beat.captions = adjusted.map((c) => ({ ...c }));
    return {
      project: { ...project, story, updatedAt: Date.now() },
      anchorFrameId: anchorClip.keyframe.id,
      anchorCaptionIndex: Math.max(0, newIdx),
    };
  }

  if (!copy) {
    const remainingSource = sourceCaps.filter((_, idx) => idx !== captionIndex);
    sourceClip.keyframe.beat.captions = remainingSource.map((c) => ({ ...c }));
  }

  const destBase = effectiveCaptionsForBeat(anchorClip.keyframe.beat, anchorClip.durationFrames);
  const adjustedDest = adjustSiblingCaptionsAround(destBase, placedCaption);
  adjustedDest.push(placedCaption);
  adjustedDest.sort((a, b) => a.inFrame - b.inFrame || a.outFrame - b.outFrame);
  const newIdx = adjustedDest.indexOf(placedCaption);
  anchorClip.keyframe.beat.captions = adjustedDest.map((c) => ({ ...c }));

  return {
    project: { ...project, story, updatedAt: Date.now() },
    anchorFrameId: anchorClip.keyframe.id,
    anchorCaptionIndex: Math.max(0, newIdx),
  };
}

function adjustSiblingCaptionsAround(
  siblings: readonly BeatCaption[],
  placed: BeatCaption,
): BeatCaption[] {
  const out: BeatCaption[] = [];
  for (const sib of siblings) {
    if (sib.outFrame <= placed.inFrame || sib.inFrame >= placed.outFrame) {
      out.push({ ...sib });
      continue;
    }
    // Trim sibling around the placed caption so existing captions aren't pushed unexpectedly
    if (sib.inFrame < placed.inFrame) {
      out.push({
        ...sib,
        outFrame: placed.inFrame,
        free: true,
      });
    }
    if (sib.outFrame > placed.outFrame) {
      out.push({
        ...sib,
        inFrame: placed.outFrame,
        free: true,
      });
    }
  }
  return out.filter((c) => c.outFrame > c.inFrame);
}

export function resetBeatCaptions(project: ProjectState, frameId: string): ProjectState {
  return updateBeat(project, frameId, (beat) => {
    delete beat.captions;
  });
}

export function setStoryCaptionStyle(
  project: ProjectState,
  patch: Partial<CaptionStyle>,
): ProjectState {
  const story = cloneStory(project.story);
  story.captionStyle = normalizeCaptionStyle({ ...(story.captionStyle || {}), ...patch });
  return { ...project, story, updatedAt: Date.now() };
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
  alignment?: TransitionAlignment,
): ProjectState {
  return updateBeat(project, incomingFrameId, (beat) => {
    const wasCut = mapTransitionKind(beat.backgroundTransition) === "cut";
    beat.backgroundTransition = kind;
    if (kind === "cut") {
      beat.backgroundTransitionSpeed = 0;
      delete beat.backgroundTransitionAlign;
      delete beat.transitionUserAdded;
    } else {
      if (wasCut || alignment === "centred") {
        beat.transitionUserAdded = true;
      }
      const safeFrames = Math.max(1, Math.round(durationFrames));
      beat.backgroundTransitionSpeed = Number((safeFrames / FPS).toFixed(6));
      if (alignment !== undefined) {
        if (alignment === "centred" && beat.transitionUserAdded) {
          beat.backgroundTransitionAlign = "centred";
        } else {
          delete beat.backgroundTransitionAlign;
        }
      }
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

  // Split the closed captions (CC) with the picture: partition cues at the cut so each half keeps
  // its own share instead of duplicating the full cue list (authored `beat.captions` or the
  // caption derived from `beat.text` on the left half — the right half keeps `text: ""`).
  const authoredCaptions = Array.isArray(leftBeat.captions);
  const sourceCaptions = effectiveCaptionsForBeat(leftBeat, total);
  const splitCaptions = splitCaptionsAcrossCut(sourceCaptions, cut);
  if (authoredCaptions || splitCaptions.left.length > 0) {
    leftBeat.captions = normalizeCaptions(splitCaptions.left, cut);
  } else {
    delete leftBeat.captions;
  }
  if (authoredCaptions || splitCaptions.right.length > 0) {
    rightBeat.captions = normalizeCaptions(splitCaptions.right, Math.max(1, total - cut));
  } else {
    delete rightBeat.captions;
  }

  location.scene.dialogueBeats!.splice(location.index + 1, 0, rightBeat);

  let nextAudioClips = project.audioClips;
  if (Array.isArray(project.audioClips)) {
    const cutMs = (cut * 1000) / FPS;
    nextAudioClips = project.audioClips.map((ac) => {
      if (ac.anchorId === frameId && ac.offsetMs >= cutMs) {
        return {
          ...ac,
          anchorId: rightBeat.id!,
          offsetMs: ac.offsetMs - cutMs,
        };
      }
      return ac;
    });
  }

  return {
    project: {
      ...project,
      story,
      ...(nextAudioClips ? { audioClips: nextAudioClips } : {}),
      updatedAt: Date.now(),
    },
    leftId: frameId,
    rightId: rightBeat.id!,
  };
}

export function convertProjectCameraMovesToKeyframesWithCount(
  project: ProjectState,
  voiceDurations?: ReadonlyMap<string, number>,
): { project: ProjectState; convertedCount: number; keyframedShotCount: number } {
  const story = cloneStory(project.story);
  const convertedCount = convertStoryCameraMovesToKeyframes(story, voiceDurations);
  const frames = buildKeyframes(story);
  const keyframedShotCount = frames.filter((kf) => {
    const a = kf.beat.animation;
    return Boolean(
      a?.kenBurns ||
        a?.zoom?.length ||
        a?.x?.length ||
        a?.y?.length ||
        a?.rotation?.length,
    );
  }).length;
  if (convertedCount <= 0) {
    return { project, convertedCount: 0, keyframedShotCount };
  }
  return {
    project: { ...project, story, updatedAt: Date.now() },
    convertedCount,
    keyframedShotCount,
  };
}

export function convertProjectCameraMovesToKeyframes(
  project: ProjectState,
  voiceDurations?: ReadonlyMap<string, number>,
): ProjectState {
  return convertProjectCameraMovesToKeyframesWithCount(project, voiceDurations).project;
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
  delete nextBeat.animation;
  delete nextBeat.cinematic;
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
  ensureAllBeatIds(story);
  const idSet = new Set(frameIds);
  const frames = buildKeyframes(story);
  const toDelete = new Set<BeatLike>();
  for (const kf of frames) {
    if (idSet.has(kf.id)) toDelete.add(kf.beat);
  }
  if (!toDelete.size) return project;

  const chain = captureSceneChain(story);
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
      if (f.sceneId !== targetScene.id && !copy.background && f.picture) {
        copy.background = f.picture;
      }
      return copy;
    });
    const nextInScene = targetScene.dialogueBeats[clampedIndex];
    if (nextInScene && !nextInScene.background && copies.some((c) => Boolean(c.background))) {
      nextInScene.backgroundRevert = true;
    }
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
    if (f.sceneId !== targetScene.id && !f.beat.background && f.picture) {
      f.beat.background = f.picture;
    }
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
  if (
    anchorBeat &&
    !anchorBeat.background &&
    selectedFrames.some((f) => f.sceneId !== targetScene.id) &&
    orderedBeatsToMove.some((b) => Boolean(b.background))
  ) {
    anchorBeat.backgroundRevert = true;
  }
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
    .map((f) => {
      const copy = JSON.parse(JSON.stringify(f.beat)) as BeatLike;
      if (!copy.background && f.picture) copy.background = f.picture;
      return copy;
    });
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

// ============================================================================
// Turn 7 — Free Sound Clips, Lift / Ripple-Delete / Gaps, & Multi-Lane Edits
// ============================================================================

export function setAudioClips(project: ProjectState, audioClips: AudioClip[]): ProjectState {
  return {
    ...project,
    audioClips: audioClips.map((c) => ({ ...c })),
    updatedAt: Date.now(),
  };
}

export function updateAudioClip(
  project: ProjectState,
  clipId: string,
  updater: Partial<AudioClip> | ((clip: AudioClip) => AudioClip),
): ProjectState {
  const existing = project.audioClips ?? [];
  let changed = false;
  const next = existing.map((clip) => {
    if (clip.id !== clipId) return clip;
    changed = true;
    return typeof updater === "function" ? updater({ ...clip }) : { ...clip, ...updater };
  });
  if (!changed) return project;
  return { ...project, audioClips: next, updatedAt: Date.now() };
}

export function deleteAudioClips(project: ProjectState, clipIds: readonly string[]): ProjectState {
  if (!clipIds.length || !project.audioClips?.length) return project;
  const idSet = new Set(clipIds);
  const next = project.audioClips.filter((clip) => !idSet.has(clip.id));
  if (next.length === project.audioClips.length) return project;
  return { ...project, audioClips: next, updatedAt: Date.now() };
}

/**
 * Lift (`Delete` on picture clips): removes picture and leaves a black gap (`beat.gap: true`)
 * of the exact same frame length, keeping captions and anchored sounds in place and moving
 * nothing after it.
 */
export function liftKeyframes(
  project: ProjectState,
  frameIds: readonly string[],
  voiceDurationByRef?: ReadonlyMap<string, number>,
): ProjectState {
  if (!frameIds.length) return project;
  const story = cloneStory(project.story);
  const preFrames = buildKeyframes(story);
  const idSet = new Set(frameIds);
  const targets = preFrames.filter((kf) => idSet.has(kf.id) && !kf.beat.gap);
  if (!targets.length) return project;

  // Stamp explicit background onto any surviving non-gap beat that previously inherited its
  // picture from a lifted beat so nothing downstream alters its image.
  for (const kf of preFrames) {
    if (idSet.has(kf.id) || kf.beat.gap) continue;
    if (!kf.beat.background && kf.picture) {
      kf.beat.background = kf.picture;
    }
  }

  for (const kf of targets) {
    const audioRef = kf.beat.audioUrl;
    const voiceSec = audioRef ? voiceDurationByRef?.get(audioRef) : undefined;
    const exactFrames = clipFrames(kf, voiceSec);
    kf.beat.durationFrames = exactFrames;
    kf.beat.gap = true;
    delete kf.beat.background;
    delete kf.beat.backgroundRevert;
    delete kf.beat.backgroundHold;
    delete kf.beat.backgroundTransition;
    delete kf.beat.backgroundTransitionSpeed;
    delete kf.beat.cinematic;
    delete kf.beat.animation;
    delete kf.beat.particles;
    delete kf.beat.particleConfig;
  }

  return { ...project, story, updatedAt: Date.now() };
}

export interface MergeKeyframesResult {
  project: ProjectState;
  mergedId: string;
  removedCount: number;
}

export function canMergeKeyframes(
  project: ProjectState,
  selectedFrameIds: readonly string[],
): boolean {
  const frames = buildKeyframes(project.story);
  if (frames.length < 2) return false;
  if (selectedFrameIds.length >= 2) {
    const idSet = new Set(selectedFrameIds);
    const matching = frames.filter((f) => idSet.has(f.id));
    return matching.length >= 2;
  }
  const primaryId = selectedFrameIds[0];
  if (!primaryId) return false;
  const idx = frames.findIndex((f) => f.id === primaryId);
  return idx >= 0 && idx + 1 < frames.length;
}

/**
 * Merges two (or more selected) clips into a single clip:
 * - Keeps the first clip's image (`picture`), removes the second clip's image and beat(s),
 *   and sums `durationFrames` into one combined clip.
 * - Preserves downstream carried pictures, scene-chain routing, captions (in `beat.captions`,
 *   never mutating `beat.text`), and millisecond-accurate `audioClips`.
 */
export function mergeKeyframes(
  project: ProjectState,
  selectedFrameIds: readonly string[],
  voiceDurationByRef?: ReadonlyMap<string, number>,
): MergeKeyframesResult | undefined {
  const story = cloneStory(project.story);
  ensureAllBeatIds(story);
  const preFrames = buildKeyframes(story);
  if (preFrames.length < 2) return undefined;

  const { clips: preClips } = buildTimelineClips(preFrames, voiceDurationByRef);
  let targetClips: TimelineClip[] = [];

  if (selectedFrameIds.length >= 2) {
    const idSet = new Set(selectedFrameIds);
    targetClips = preClips.filter((c) => idSet.has(c.keyframe.id));
  } else if (selectedFrameIds.length === 1) {
    const idx = preClips.findIndex((c) => c.keyframe.id === selectedFrameIds[0]);
    if (idx >= 0 && idx + 1 < preClips.length) {
      targetClips = [preClips[idx], preClips[idx + 1]];
    }
  }

  if (targetClips.length < 2) return undefined;

  const firstClip = targetClips[0];
  const restClips = targetClips.slice(1);
  const removedIdSet = new Set(restClips.map((c) => c.keyframe.id));
  const removedBeatSet = new Set(restClips.map((c) => c.keyframe.beat));

  // Preserve carried picture on surviving beats outside the merge set so downstream shots keep their own picture
  for (const kf of preFrames) {
    if (removedIdSet.has(kf.id) || kf.id === firstClip.keyframe.id) continue;
    if (!kf.beat.gap && !kf.beat.background && kf.picture) {
      kf.beat.background = kf.picture;
    }
  }

  // Ensure the kept first clip explicitly holds the first image (unless the first clip itself was a gap)
  const firstBeat = firstClip.keyframe.beat;
  if (!firstBeat.gap && !firstBeat.background && firstClip.keyframe.picture) {
    firstBeat.background = firstClip.keyframe.picture;
  }

  // Sum durations into a single clip
  const combinedDurationFrames = targetClips.reduce((sum, c) => sum + c.durationFrames, 0);
  firstBeat.durationFrames = Math.max(MIN_CLIP_FRAMES, combinedDurationFrames);

  // Combine captions into firstBeat.captions (never mutating firstBeat.text) if any secondary clip has captions
  // or firstBeat already uses custom beat.captions
  const restHaveCaptions = restClips.some(
    (c) => effectiveCaptionsForBeat(c.keyframe.beat, c.durationFrames).length > 0,
  );
  if (restHaveCaptions || Array.isArray(firstBeat.captions)) {
    const mergedCaptions: BeatCaption[] = [];
    let runningOffset = 0;
    for (const c of targetClips) {
      const caps = effectiveCaptionsForBeat(c.keyframe.beat, c.durationFrames);
      for (const cap of caps) {
        mergedCaptions.push({
          ...cap,
          inFrame: runningOffset + cap.inFrame,
          outFrame: runningOffset + cap.outFrame,
        });
      }
      runningOffset += c.durationFrames;
    }
    firstBeat.captions = normalizeCaptions(mergedCaptions, firstBeat.durationFrames);
  }

  // Capture pre-merge audio start times in milliseconds before removing secondary beats
  const preResolvedAudio = project.audioClips?.length
    ? resolveAudioClips(project.audioClips, preClips)
    : [];
  const preAudioStartMs = new Map(preResolvedAudio.map((rc) => [rc.id, rc.startMs]));

  const chain = captureSceneChain(story);
  for (const scene of story.scenes) {
    if (!scene.dialogueBeats?.length) continue;
    scene.dialogueBeats = scene.dialogueBeats.filter((b) => !removedBeatSet.has(b));
  }
  restoreSceneChain(story, chain);

  let nextAudioClips = project.audioClips;
  if (project.audioClips?.length) {
    const postFrames = buildKeyframes(story);
    const { clips: postClips } = buildTimelineClips(postFrames, voiceDurationByRef);
    nextAudioClips = project.audioClips.map((ac) => {
      if (!removedIdSet.has(ac.anchorId)) return ac;
      const targetMs = Math.max(0, preAudioStartMs.get(ac.id) ?? 0);
      return reanchorAudioClipToMs(ac, targetMs, postClips);
    });
  }

  return {
    project: {
      ...project,
      story,
      ...(nextAudioClips ? { audioClips: nextAudioClips } : {}),
      updatedAt: Date.now(),
    },
    mergedId: firstClip.keyframe.id,
    removedCount: restClips.length,
  };
}

/**
 * Closes one or more gap beats completely (`Delete` on a gap):
 * - Removes the gap beat(s) from the story (closing the timeline gap and removing any gap captions).
 * - Removes beat-level `voice` / `sfx` cues that belonged to the deleted gap beat(s), while
 *   re-anchoring any scene-level `music` / `ambience` cue cleanly to the clip now occupying that cut.
 */
export function closeGapKeyframes(
  project: ProjectState,
  gapFrameIds: readonly string[],
  voiceDurationByRef?: ReadonlyMap<string, number>,
): ProjectState {
  if (!gapFrameIds.length) return project;
  const idSet = new Set(gapFrameIds);

  const storyWithPreservedCarry = cloneStory(project.story);
  const preFrames = buildKeyframes(storyWithPreservedCarry);
  const actualGapIds = preFrames.filter((kf) => idSet.has(kf.id) && kf.beat.gap).map((kf) => kf.id);
  if (!actualGapIds.length) return project;
  const removedGapSet = new Set(actualGapIds);

  for (const kf of preFrames) {
    if (removedGapSet.has(kf.id)) continue;
    if (!kf.beat.gap && !kf.beat.background && kf.picture) {
      kf.beat.background = kf.picture;
    }
  }

  const { clips: preClips } = buildTimelineClips(preFrames, voiceDurationByRef);
  const preStartByGapId = new Map<string, number>();
  for (const c of preClips) {
    if (removedGapSet.has(c.keyframe.id)) {
      preStartByGapId.set(c.keyframe.id, (c.startFrame * 1000) / FPS);
    }
  }

  const nextProject = deleteKeyframes(
    { ...project, story: storyWithPreservedCarry },
    actualGapIds,
  );
  if (!nextProject.audioClips?.length) return nextProject;

  const postFrames = buildKeyframes(nextProject.story);
  const { clips: postClips } = buildTimelineClips(postFrames, voiceDurationByRef);

  const nextAudioClips = nextProject.audioClips
    .filter((ac) => {
      if (!removedGapSet.has(ac.anchorId)) return true;
      // Remove beat-level dialogue/SFX cues belonging to the deleted gap; keep scene-spanning music/ambience
      return ac.lane === "music" || ac.lane === "ambience";
    })
    .map((ac) => {
      if (!removedGapSet.has(ac.anchorId)) return ac;
      const gapCutMs = preStartByGapId.get(ac.anchorId) ?? 0;
      const targetMs = Math.max(0, gapCutMs + ac.offsetMs);
      return reanchorAudioClipToMs(ac, targetMs, postClips);
    });

  return { ...nextProject, audioClips: nextAudioClips, updatedAt: Date.now() };
}

/**
 * Ripple-delete (`Shift+Delete` on picture/gap clips): removes the shot(s), closes the gap,
 * and removes all sound clips whose `anchorId` belonged to the deleted shot(s).
 */
export function rippleDeleteKeyframes(
  project: ProjectState,
  frameIds: readonly string[],
): { project: ProjectState; removedSoundCount: number } {
  if (!frameIds.length) return { project, removedSoundCount: 0 };
  const idSet = new Set(frameIds);

  // Preserve carried picture on surviving beats before removing upstream beats.
  const storyWithPreservedCarry = cloneStory(project.story);
  const preFrames = buildKeyframes(storyWithPreservedCarry);
  for (const kf of preFrames) {
    if (idSet.has(kf.id) || kf.beat.gap) continue;
    if (!kf.beat.background && kf.picture) {
      kf.beat.background = kf.picture;
    }
  }

  const deletedProject = deleteKeyframes({ ...project, story: storyWithPreservedCarry }, [...frameIds]);
  const existingAudio = project.audioClips ?? [];
  const survivingAudio = existingAudio.filter((ac) => !idSet.has(ac.anchorId));
  const removedSoundCount = existingAudio.length - survivingAudio.length;

  return {
    project: {
      ...deletedProject,
      ...(project.audioClips !== undefined ? { audioClips: survivingAudio } : {}),
      updatedAt: Date.now(),
    },
    removedSoundCount,
  };
}

function stripResolvedAudioFields(rc: AudioClip): AudioClip {
  return {
    id: rc.id,
    lane: rc.lane,
    src: rc.src,
    anchorId: rc.anchorId,
    offsetMs: rc.offsetMs,
    inMs: rc.inMs,
    durationMs: rc.durationMs,
    gain: rc.gain,
    fadeInMs: rc.fadeInMs,
    fadeOutMs: rc.fadeOutMs,
    ...(rc.loop !== undefined ? { loop: rc.loop } : {}),
    ...(rc.volumeKeys?.length
      ? { volumeKeys: rc.volumeKeys.map((key) => ({ ...key })) }
      : {}),
  };
}

/**
 * Deletes selected animation keyframe diamonds (`SelectedKeyframeDiamond[]`).
 */
export function deleteAnimationKeyframes(
  project: ProjectState,
  diamonds: readonly SelectedKeyframeDiamond[],
): ProjectState {
  if (!diamonds.length) return project;
  const byClip = new Map<string, Array<{ prop: AnimProp; frame: number }>>();
  for (const d of diamonds) {
    const list = byClip.get(d.frameId) ?? [];
    list.push({ prop: d.prop, frame: Math.round(d.frame) });
    byClip.set(d.frameId, list);
  }
  if (!byClip.size) return project;

  const story = cloneStory(project.story);
  let changed = false;
  for (const [clipId, items] of byClip) {
    const loc = locateBeat(story, clipId);
    if (!loc?.beat.animation) continue;
    const nextAnim: BeatAnimation = { ...loc.beat.animation };
    for (const item of items) {
      const existing = nextAnim[item.prop];
      if (!existing?.length) continue;
      const filtered = existing.filter((k) => Math.round(k.frame) !== item.frame);
      if (filtered.length !== existing.length) {
        nextAnim[item.prop] = filtered;
        changed = true;
      }
    }
    const normalized = normalizeAnimation(nextAnim);
    if (normalized) loc.beat.animation = normalized;
    else delete loc.beat.animation;
  }
  if (!changed) return project;
  return { ...project, story, updatedAt: Date.now() };
}

export interface DeleteSelectionResult {
  project: ProjectState;
  removedSoundCount: number;
  statusMessage: string;
}

/**
 * Executes Section B Delete / Shift+Delete rules across any multi-lane selection in one undo step.
 */
export function executeDeleteSelection(
  project: ProjectState,
  selection: MultiLaneSelection,
  options: { ripple?: boolean; voiceDurationByRef?: ReadonlyMap<string, number> } = {},
): DeleteSelectionResult {
  const { ripple = false, voiceDurationByRef } = options;
  let current = project;
  let removedSoundCount = 0;
  const parts: string[] = [];

  const preFrames = buildKeyframes(current.story);
  const frameById = new Map(preFrames.map((f) => [f.id, f]));
  const gapIds: string[] = [];
  const pictureIds: string[] = [];
  for (const id of selection.pictureIds) {
    const kf = frameById.get(id);
    if (!kf) continue;
    if (kf.beat.gap) gapIds.push(id);
    else pictureIds.push(id);
  }

  // 1. Keyframe diamonds
  if (selection.keyframes.length > 0) {
    const next = deleteAnimationKeyframes(current, selection.keyframes);
    if (next !== current) {
      current = next;
      parts.push(
        selection.keyframes.length === 1
          ? "Removed 1 keyframe"
          : `Removed ${selection.keyframes.length} keyframes`,
      );
    }
  }

  // 2. Explicitly selected captions (skip beats being completely removed)
  const beatsBeingRemoved = new Set<string>(ripple ? [...pictureIds, ...gapIds] : gapIds);
  if (selection.captions.length > 0) {
    const byClip = new Map<string, number[]>();
    for (const item of selection.captions) {
      if (beatsBeingRemoved.has(item.frameId) || !Number.isFinite(item.index)) continue;
      const list = byClip.get(item.frameId) ?? [];
      list.push(item.index);
      byClip.set(item.frameId, list);
    }
    let deletedCaps = 0;
    for (const [clipId, indices] of byClip) {
      const kf = buildKeyframes(current.story).find((f) => f.id === clipId);
      if (!kf) continue;
      const audioRef = kf.beat.audioUrl;
      const voiceSec = audioRef ? voiceDurationByRef?.get(audioRef) : undefined;
      const dur = clipFrames(kf, voiceSec);
      const uniqueIndices = [...new Set(indices)];
      const nextCaps = deleteCaptionsAtIndices(kf.beat, dur, uniqueIndices);
      current = setBeatCaptions(current, clipId, nextCaps, dur);
      deletedCaps += uniqueIndices.length;
    }
    if (deletedCaps > 0) {
      parts.push(deletedCaps === 1 ? "Removed caption" : `Removed ${deletedCaps} captions`);
    }
  }

  // 3. Explicitly selected sounds (no gaps on sound lanes)
  if (selection.audioClipIds.length > 0) {
    const before = current.audioClips?.length ?? 0;
    current = deleteAudioClips(current, selection.audioClipIds);
    const after = current.audioClips?.length ?? 0;
    const directRemoved = before - after;
    if (directRemoved > 0) {
      removedSoundCount += directRemoved;
      parts.push(directRemoved === 1 ? "Removed 1 sound clip" : `Removed ${directRemoved} sound clips`);
    }
  }

  // 4. Video lane: Shift+Delete = ripple delete; Delete = lift picture -> gap, close gap
  const allVideoIds = [...pictureIds, ...gapIds];
  if (ripple && allVideoIds.length > 0) {
    const res = rippleDeleteKeyframes(current, allVideoIds);
    current = res.project;
    removedSoundCount += res.removedSoundCount;
    const shotLabel = allVideoIds.length === 1 ? "1 shot" : `${allVideoIds.length} shots`;
    const soundLabel =
      res.removedSoundCount === 1
        ? "1 anchored sound removed"
        : `${res.removedSoundCount} anchored sounds removed`;
    parts.unshift(`Ripple-deleted ${shotLabel} · ${soundLabel}`);
  } else {
    if (pictureIds.length > 0) {
      current = liftKeyframes(current, pictureIds, voiceDurationByRef);
      parts.unshift(
        pictureIds.length === 1
          ? "Lifted picture to black gap"
          : `Lifted ${pictureIds.length} pictures to black gaps`,
      );
    }
    if (gapIds.length > 0) {
      current = closeGapKeyframes(current, gapIds, voiceDurationByRef);
      parts.push(gapIds.length === 1 ? "Closed gap" : `Closed ${gapIds.length} gaps`);
    }
  }

  return {
    project: current,
    removedSoundCount,
    statusMessage: parts.join(" · ") || "Nothing selected to delete.",
  };
}

function ensureAllBeatIds(story: StoryLike): void {
  const frames = buildKeyframes(story);
  for (const kf of frames) {
    kf.beat.id = kf.id;
  }
}

/**
 * Drags a single-lane or multi-lane selection in time as one unit:
 * - Sound-only selections shift by exact `deltaMs` (millisecond precision, never rounded to frames)
 *   and re-anchor on drop to the picture clip under each sound's new start.
 * - Selections including video clips shift on whole-frame boundaries (`deltaFrames`), inserting or
 *   resizing a gap before the block so video + co-selected sounds/captions move together by the
 *   exact same duration while unselected upstream sounds stay put.
 */
export function shiftMultiLaneSelection(
  project: ProjectState,
  selection: MultiLaneSelection,
  deltaMs: number,
  options: { copy?: boolean; voiceDurationByRef?: ReadonlyMap<string, number> } = {},
): { project: ProjectState; selection: MultiLaneSelection } {
  const { copy = false, voiceDurationByRef } = options;
  const hasVideo = selection.pictureIds.length > 0;
  const hasCaptions = selection.captions.length > 0;
  const hasAudio = selection.audioClipIds.length > 0;

  if (!hasVideo && !hasCaptions && !hasAudio) {
    return { project, selection };
  }

  const initialFrames = buildKeyframes(project.story);
  const { clips: initialClips } = buildTimelineClips(initialFrames, voiceDurationByRef);
  const resolvedAudio = resolveAudioClips(project.audioClips ?? [], initialClips);
  const resolvedById = new Map(resolvedAudio.map((rc) => [rc.id, rc]));

  // Case A: Sound-only drag (pure millisecond precision!)
  if (!hasVideo && !hasCaptions && hasAudio) {
    const audioSet = new Set(selection.audioClipIds);
    const moving = resolvedAudio.filter((rc) => audioSet.has(rc.id));
    if (!moving.length) return { project, selection };

    const minStartMs = Math.min(...moving.map((rc) => rc.startMs));
    const clampedDeltaMs = Math.max(-minStartMs, deltaMs);
    if (Math.abs(clampedDeltaMs) < 0.0001 && !copy) {
      return { project, selection };
    }

    const existing = project.audioClips ?? [];
    if (copy) {
      const copies: AudioClip[] = [];
      for (const rc of moving) {
        const base: AudioClip = {
          ...stripResolvedAudioFields(rc),
          id: `ac-${rc.lane}-${crypto.randomUUID().slice(0, 8)}`,
        };
        copies.push(reanchorAudioClipToMs(base, Math.max(0, rc.startMs + clampedDeltaMs), initialClips));
      }
      return {
        project: {
          ...project,
          audioClips: [...existing, ...copies],
          updatedAt: Date.now(),
        },
        selection: {
          ...EMPTY_MULTI_SELECTION,
          audioClipIds: copies.map((c) => c.id),
        },
      };
    }

    const nextAudio = existing.map((ac) => {
      if (!audioSet.has(ac.id)) return ac;
      const rc = resolvedById.get(ac.id);
      if (!rc) return ac;
      return reanchorAudioClipToMs(ac, Math.max(0, rc.startMs + clampedDeltaMs), initialClips);
    });

    return {
      project: { ...project, audioClips: nextAudio, updatedAt: Date.now() },
      selection,
    };
  }

  // Case B: Video clips included (with or without co-selected sounds/captions)
  if (hasVideo) {
    const requestedFrames = Math.round((deltaMs * FPS) / 1000);
    if (requestedFrames === 0) return { project, selection };

    const story = cloneStory(project.story);
    ensureAllBeatIds(story);
    const frames = buildKeyframes(story);
    const { clips: preClips } = buildTimelineClips(frames, voiceDurationByRef);
    const videoSet = new Set(selection.pictureIds);
    const selectedClips = preClips.filter((c) => videoSet.has(c.keyframe.id));
    if (!selectedClips.length) return { project, selection };

    const firstSelected = selectedClips[0];
    const lastSelected = selectedClips[selectedClips.length - 1];
    const firstIdx = preClips.indexOf(firstSelected);
    const lastIdx = preClips.indexOf(lastSelected);
    const prevClip = firstIdx > 0 ? preClips[firstIdx - 1] : undefined;
    const nextClip = lastIdx >= 0 && lastIdx + 1 < preClips.length ? preClips[lastIdx + 1] : undefined;

    let actualFrames = requestedFrames;

    if (requestedFrames > 0) {
      if (prevClip && prevClip.keyframe.beat.gap && prevClip.keyframe.sceneId === firstSelected.keyframe.sceneId) {
        const chain = captureSceneChain(story);
        prevClip.keyframe.beat.durationFrames = prevClip.durationFrames + requestedFrames;
        if (nextClip && nextClip.keyframe.beat.gap) {
          const absorb = Math.min(requestedFrames, nextClip.durationFrames);
          const remaining = nextClip.durationFrames - absorb;
          if (remaining <= 0) {
            for (const sc of story.scenes) {
              if (!sc.dialogueBeats?.length) continue;
              sc.dialogueBeats = sc.dialogueBeats.filter((b) => b !== nextClip.keyframe.beat);
            }
          } else {
            nextClip.keyframe.beat.durationFrames = remaining;
          }
        }
        restoreSceneChain(story, chain);
      } else {
        const loc = locateBeat(story, firstSelected.keyframe.id);
        if (!loc) return { project, selection };
        const chain = captureSceneChain(story);
        const gapBeat: BeatLike = {
          id: uniqueBeatId(story, loc.scene.id),
          gap: true,
          durationFrames: requestedFrames,
          text: "",
        };
        loc.scene.dialogueBeats!.splice(loc.index, 0, gapBeat);
        if (nextClip && nextClip.keyframe.beat.gap) {
          const absorb = Math.min(requestedFrames, nextClip.durationFrames);
          const remaining = nextClip.durationFrames - absorb;
          if (remaining <= 0) {
            for (const sc of story.scenes) {
              if (!sc.dialogueBeats?.length) continue;
              sc.dialogueBeats = sc.dialogueBeats.filter((b) => b !== nextClip.keyframe.beat);
            }
          } else {
            nextClip.keyframe.beat.durationFrames = remaining;
          }
        }
        restoreSceneChain(story, chain);
      }
    } else {
      if (!prevClip) return { project, selection };
      const wantConsume = -requestedFrames;
      if (prevClip.keyframe.beat.gap) {
        const consume = Math.min(wantConsume, prevClip.durationFrames);
        if (consume <= 0) return { project, selection };
        actualFrames = -consume;
        const remaining = prevClip.durationFrames - consume;
        const chain = captureSceneChain(story);
        if (remaining <= 0) {
          for (const sc of story.scenes) {
            if (!sc.dialogueBeats?.length) continue;
            sc.dialogueBeats = sc.dialogueBeats.filter((b) => b !== prevClip.keyframe.beat);
          }
        } else {
          prevClip.keyframe.beat.durationFrames = remaining;
        }
        restoreSceneChain(story, chain);
      } else {
        const maxShrink = Math.max(0, prevClip.durationFrames - MIN_CLIP_FRAMES);
        const consume = Math.min(wantConsume, maxShrink);
        if (consume <= 0) return { project, selection };
        actualFrames = -consume;
        prevClip.keyframe.beat.durationFrames = prevClip.durationFrames - consume;
      }
    }

    const actualDeltaMs = (actualFrames * 1000) / FPS;
    const postFrames = buildKeyframes(story);
    const { clips: postClips } = buildTimelineClips(postFrames, voiceDurationByRef);
    const postIdSet = new Set(postClips.map((c) => c.keyframe.id));
    const audioSet = new Set(selection.audioClipIds);

    let nextAudioClips = project.audioClips;
    if (Array.isArray(project.audioClips)) {
      nextAudioClips = project.audioClips.map((ac) => {
        const preRc = resolvedById.get(ac.id);
        const preStartMs = preRc?.startMs ?? 0;
        if (audioSet.has(ac.id)) {
          return reanchorAudioClipToMs(ac, Math.max(0, preStartMs + actualDeltaMs), postClips);
        }
        if (videoSet.has(ac.anchorId)) {
          return reanchorAudioClipToMs(ac, Math.max(0, preStartMs), postClips);
        }
        if (!postIdSet.has(ac.anchorId)) {
          return reanchorAudioClipToMs(ac, Math.max(0, preStartMs + actualDeltaMs), postClips);
        }
        return ac;
      });
    }

    return {
      project: {
        ...project,
        story,
        ...(nextAudioClips ? { audioClips: nextAudioClips } : {}),
        updatedAt: Date.now(),
      },
      selection,
    };
  }

  // Case C: Captions (+ optional sounds, no video clips) — freely re-anchor across shot cuts
  const deltaFrames = Math.round((deltaMs * FPS) / 1000);
  let current = project;
  let nextCaptionsSelection = selection.captions;

  if ((deltaFrames !== 0 || copy) && hasCaptions) {
    const story = cloneStory(current.story);
    const frames = buildKeyframes(story);
    const { clips, totalFrames: maxTimelineFrames } = buildTimelineClips(frames, voiceDurationByRef);
    const selectedKeys = new Set(
      selection.captions
        .filter((item) => Number.isFinite(item.index))
        .map((item) => `${item.frameId}:${item.index}`),
    );
    const allResolved = resolveTimelineCaptions(clips);
    const movingResolved = allResolved.filter((rc) => selectedKeys.has(rc.id));

    if (movingResolved.length > 0 && clips.length > 0) {
      const minGlobalIn = Math.min(...movingResolved.map((rc) => rc.globalInFrame));
      const clampedDeltaFrames = Math.max(-minGlobalIn, deltaFrames);

      if (clampedDeltaFrames !== 0 || copy) {
        const clipById = new Map(clips.map((c) => [c.keyframe.id, c]));

        if (!copy) {
          const dropByClip = new Map<string, Set<number>>();
          for (const rc of movingResolved) {
            const set = dropByClip.get(rc.frameId) ?? new Set<number>();
            set.add(rc.captionIndex);
            dropByClip.set(rc.frameId, set);
          }
          for (const [frameId, dropSet] of dropByClip) {
            const clip = clipById.get(frameId);
            if (!clip) continue;
            const base = effectiveCaptionsForBeat(clip.keyframe.beat, clip.durationFrames);
            clip.keyframe.beat.captions = base
              .filter((_, idx) => !dropSet.has(idx))
              .map((c) => ({ ...c }));
          }
        }

        const placedTokens = new Map<BeatCaption, string>();
        const touchedClips = new Set<TimelineClip>();

        movingResolved.forEach((rc, moveIdx) => {
          const len = Math.max(1, rc.globalOutFrame - rc.globalInFrame);
          const nextGlobalIn = Math.max(
            0,
            Math.min(Math.max(0, maxTimelineFrames - 1), rc.globalInFrame + clampedDeltaFrames),
          );
          const anchorClip =
            clips.find((c) => nextGlobalIn >= c.startFrame && nextGlobalIn < c.endFrame) ??
            clips[clips.length - 1];
          const localIn = Math.max(0, nextGlobalIn - anchorClip.startFrame);
          const localOut = localIn + len;
          const movedAcross = anchorClip.keyframe.id !== rc.frameId;

          const placed: BeatCaption = {
            text: rc.text,
            inFrame: localIn,
            outFrame: localOut,
            free: true,
            ...(movedAcross || rc.speaker ? { speaker: rc.speaker } : {}),
            ...(movedAcross ? { isNarration: rc.isNarration } : {}),
          };
          placedTokens.set(placed, `${anchorClip.keyframe.id}#${moveIdx}`);

          const existing = effectiveCaptionsForBeat(anchorClip.keyframe.beat, anchorClip.durationFrames);
          const adjusted = adjustSiblingCaptionsAround(existing, placed);
          adjusted.push(placed);
          anchorClip.keyframe.beat.captions = adjusted;
          touchedClips.add(anchorClip);
        });

        const nextSel: Array<{ frameId: string; index: number }> = [];
        for (const clip of touchedClips) {
          const list = clip.keyframe.beat.captions ?? [];
          list.sort((a, b) => a.inFrame - b.inFrame || a.outFrame - b.outFrame);
          list.forEach((cap, idx) => {
            if (placedTokens.has(cap)) {
              nextSel.push({ frameId: clip.keyframe.id, index: idx });
            }
          });
          clip.keyframe.beat.captions = list.map((c) => ({ ...c }));
        }

        current = { ...current, story, updatedAt: Date.now() };
        nextCaptionsSelection = nextSel;
      }
    }
  }

  let nextAudioIds = selection.audioClipIds;
  if (hasAudio) {
    const audioRes = shiftMultiLaneSelection(
      current,
      { ...EMPTY_MULTI_SELECTION, audioClipIds: selection.audioClipIds },
      deltaMs,
      { copy, voiceDurationByRef },
    );
    current = audioRes.project;
    nextAudioIds = audioRes.selection.audioClipIds;
  }

  return {
    project: current,
    selection: {
      ...selection,
      captions: nextCaptionsSelection,
      audioClipIds: nextAudioIds,
    },
  };
}

export interface MultiLaneClipboard {
  beats: BeatLike[];
  audioClips: Array<{ clip: AudioClip; relativeMs: number }>;
  standaloneCaptions: Array<{ caption: BeatCaption; relativeFrames: number }>;
}

/**
 * Copies any single-lane or multi-lane selection, preserving exact relative millisecond
 * offsets between copied items.
 */
export function copyMultiSelection(
  project: ProjectState,
  selection: MultiLaneSelection,
  voiceDurationByRef?: ReadonlyMap<string, number>,
): MultiLaneClipboard | undefined {
  const frames = buildKeyframes(project.story);
  const { clips } = buildTimelineClips(frames, voiceDurationByRef);
  const clipById = new Map(clips.map((c) => [c.keyframe.id, c]));
  const resolvedAudio = resolveAudioClips(project.audioClips ?? [], clips);
  const resolvedById = new Map(resolvedAudio.map((rc) => [rc.id, rc]));

  const videoSet = new Set(selection.pictureIds);
  const copiedBeats = copySelectedBeats(project, selection.pictureIds);

  const selectedAudio = selection.audioClipIds
    .map((id) => resolvedById.get(id))
    .filter((rc): rc is NonNullable<typeof rc> => Boolean(rc));

  const standaloneCaps: Array<{ caption: BeatCaption; absStartFrame: number }> = [];
  for (const item of selection.captions) {
    if (videoSet.has(item.frameId)) continue;
    const tc = clipById.get(item.frameId);
    if (!tc || !Number.isFinite(item.index)) continue;
    const caps = effectiveCaptionsForBeat(tc.keyframe.beat, tc.durationFrames);
    const cap = caps[item.index];
    if (cap) {
      standaloneCaps.push({
        caption: { ...cap },
        absStartFrame: tc.startFrame + cap.inFrame,
      });
    }
  }

  if (!copiedBeats.length && !selectedAudio.length && !standaloneCaps.length) {
    return undefined;
  }

  const startTimesMs: number[] = [];
  for (const id of selection.pictureIds) {
    const tc = clipById.get(id);
    if (tc) startTimesMs.push((tc.startFrame * 1000) / FPS);
  }
  for (const rc of selectedAudio) {
    startTimesMs.push(rc.startMs);
  }
  for (const sc of standaloneCaps) {
    startTimesMs.push((sc.absStartFrame * 1000) / FPS);
  }

  const anchorZeroMs = startTimesMs.length > 0 ? Math.min(...startTimesMs) : 0;
  const anchorZeroFrame = Math.round((anchorZeroMs * FPS) / 1000);

  return {
    beats: copiedBeats,
    audioClips: selectedAudio.map((rc) => ({
      clip: stripResolvedAudioFields(rc),
      relativeMs: rc.startMs - anchorZeroMs,
    })),
    standaloneCaptions: standaloneCaps.map((sc) => ({
      caption: sc.caption,
      relativeFrames: Math.max(0, sc.absStartFrame - anchorZeroFrame),
    })),
  };
}

/**
 * Pastes a `MultiLaneClipboard` at `playheadFrame`, keeping relative millisecond times of
 * pasted sounds intact and anchoring each pasted sound to the picture clip under it.
 */
export function pasteMultiSelectionAt(
  project: ProjectState,
  clipboard: MultiLaneClipboard,
  playheadFrame: number,
  voiceDurationByRef?: ReadonlyMap<string, number>,
): { project: ProjectState; selection: MultiLaneSelection } | undefined {
  if (
    !clipboard.beats.length &&
    !clipboard.audioClips.length &&
    !clipboard.standaloneCaptions.length
  ) {
    return undefined;
  }

  let current = project;
  let insertedVideoIds: string[] = [];

  if (clipboard.beats.length > 0) {
    const pastedBeats = pasteKeyframesAt(current, clipboard.beats, playheadFrame, voiceDurationByRef);
    if (pastedBeats) {
      current = pastedBeats.project;
      insertedVideoIds = pastedBeats.insertedIds;
    }
  }

  const postFrames = buildKeyframes(current.story);
  const { clips: postClips } = buildTimelineClips(postFrames, voiceDurationByRef);
  if (!postClips.length) return undefined;

  const baseMs = (Math.max(0, Math.round(playheadFrame)) * 1000) / FPS;
  const insertedAudioIds: string[] = [];

  if (clipboard.audioClips.length > 0) {
    const newAudio: AudioClip[] = clipboard.audioClips.map(({ clip, relativeMs }) => {
      const fresh: AudioClip = {
        ...clip,
        id: `ac-${clip.lane}-${crypto.randomUUID().slice(0, 8)}`,
      };
      insertedAudioIds.push(fresh.id);
      return reanchorAudioClipToMs(fresh, Math.max(0, baseMs + relativeMs), postClips);
    });
    current = {
      ...current,
      audioClips: [...(current.audioClips ?? []), ...newAudio],
      updatedAt: Date.now(),
    };
  }

  const insertedCaptions: Array<{ frameId: string; index: number }> = [];
  if (clipboard.standaloneCaptions.length > 0) {
    for (const sc of clipboard.standaloneCaptions) {
      const targetFrame = Math.max(0, Math.round(playheadFrame) + sc.relativeFrames);
      const host =
        postClips.find((c) => targetFrame >= c.startFrame && targetFrame < c.endFrame) ||
        postClips[postClips.length - 1];
      if (!host) continue;
      const localIn = Math.max(0, Math.min(host.durationFrames - 1, targetFrame - host.startFrame));
      const len = Math.max(1, sc.caption.outFrame - sc.caption.inFrame);
      const localOut = Math.min(host.durationFrames, localIn + len);
      const existing = effectiveCaptionsForBeat(host.keyframe.beat, host.durationFrames);
      const nextCaps = [...existing, { text: sc.caption.text, inFrame: localIn, outFrame: localOut }];
      current = setBeatCaptions(current, host.keyframe.id, nextCaps, host.durationFrames);
      insertedCaptions.push({ frameId: host.keyframe.id, index: nextCaps.length - 1 });
    }
  }

  return {
    project: current,
    selection: {
      pictureIds: insertedVideoIds,
      captions: insertedCaptions,
      audioClipIds: insertedAudioIds,
      keyframes: [],
    },
  };
}

