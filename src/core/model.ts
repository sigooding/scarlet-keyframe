import type { ClipAnimation } from "../sequence/animate";

export type AnyRecord = Record<string, any>;

export interface StoryLike extends AnyRecord {
  id?: string;
  title?: string;
  tagline?: string;
  startSceneId: string;
  scenes: SceneLike[];
}

export interface SceneLike extends AnyRecord {
  id: string;
  title?: string;
  animaticMark?: string;
  background?: string;
  prose?: string;
  dialogueBeats?: BeatLike[];
  choices?: AnyRecord[];
}

export interface BeatLike extends AnyRecord {
  id?: string;
  characterId?: string;
  text?: string;
  background?: string;
  cinematic?: AnyRecord;
  audioUrl?: string;
  sfxUrl?: string;
  // Timeline edits: the clip's length in frames and its zoom/position keyframes.
  durationFrames?: number;
  animation?: ClipAnimation;
}

export interface ProjectAsset {
  id: string;
  name: string;
  type: "image" | "audio" | "video" | "other";
  mime?: string;
  size: number;
  uploadedAt?: number;
  folder?: string;
  source: "bundle" | "upload";
  blob?: Blob;
  dataUrl?: string;
  byteHash?: string;
  width?: number;
  height?: number;
  crop?: { x: number; y: number; width: number; height: number };
  outputPath?: string;
}

// A note marker the editor drops on the ruler (M). It is anchored to its clip so it ripples with edits;
// `frame` is the absolute position when it was made, used if the clip is gone.
export interface NoteMarker {
  id: string;
  name: string;
  frame: number;
  clipId?: string;
  offset?: number;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  createdAt: number;
  story: StoryLike;
}

export interface ProjectState {
  id: string;
  title: string;
  sourceName: string;
  story: StoryLike;
  originalStory: StoryLike;
  assets: ProjectAsset[];
  missing: string[];
  importedMissing: string[];
  sourceEdits?: AnyRecord;
  markers?: NoteMarker[];
  snapshots: ProjectSnapshot[];
  createdAt: number;
  updatedAt: number;
}

export interface Keyframe {
  id: string;
  sceneId: string;
  sceneIndex: number;
  beatIndex: number;
  mark: string;
  number: number;
  beat: BeatLike;
  scene: SceneLike;
  picture?: string;
  pictureSource: "beat" | "scene" | "carried" | "none";
  carried: boolean;
  speaker: string;
  text: string;
}

export interface ImportedStory {
  story: StoryLike;
  assets: AnyRecord[];
  missing: string[];
  sourceName: string;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCompiledStory(text: string): unknown {
  const declaration = text.indexOf("= {");
  if (declaration < 0) throw new Error("This file is not JSON or a compiled Scarlet Reel Story module.");
  const start = declaration + 2;
  const endMarker = text.lastIndexOf("} as");
  const end = endMarker >= start ? endMarker + 1 : text.lastIndexOf("}");
  if (end < start) throw new Error("Could not find the Story object in this file.");
  return JSON.parse(text.slice(start, end));
}

export function parseStoryText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return parseCompiledStory(text);
  }
}

export function parseImportPayload(value: unknown, sourceName: string): ImportedStory {
  const payload = typeof value === "string" ? parseStoryText(value) : value;
  if (!isRecord(payload)) throw new Error("The import must contain a Story object or a PortableStoryBundle.");
  const bundle = isRecord(payload.story) && Array.isArray(payload.story.scenes);
  const story = (bundle ? payload.story : payload) as StoryLike;
  if (!Array.isArray(story.scenes) || !story.scenes.length) throw new Error("The imported Story has no scene nodes.");
  if (!story.startSceneId) throw new Error("The imported Story is missing startSceneId.");
  const assets = bundle && Array.isArray(payload.assets) ? payload.assets.filter(isRecord) : [];
  const missing = bundle && Array.isArray(payload.missing) ? payload.missing.map(String) : [];
  const availableAssetIds = new Set(assets.map((asset) => String(asset.id)));
  for (const ref of collectMediaReferences(story)) {
    const assetId = assetIdFromReference(ref);
    if (assetId && !availableAssetIds.has(assetId)) missing.push(`asset:${assetId}`);
  }
  return {
    story: clone(story),
    assets: clone(assets),
    missing: [...new Set(missing)],
    sourceName,
  };
}

export function createProjectState(
  imported: ImportedStory,
  assets: ProjectAsset[] = [],
  sourceEdits?: AnyRecord,
): ProjectState {
  const story = clone(imported.story);
  const now = Date.now();
  return {
    id: String(story.id || `project-${now}`),
    title: String(story.title || imported.sourceName.replace(/\.[^.]+$/, "") || "Untitled film"),
    sourceName: imported.sourceName,
    story,
    originalStory: clone(story),
    assets,
    missing: imported.missing,
    importedMissing: imported.missing,
    sourceEdits,
    snapshots: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function applyStudioMusicSync(story: StoryLike, sourceEdits: unknown): StoryLike {
  if (!isRecord(sourceEdits) || !Array.isArray(sourceEdits.musicSync)) return clone(story);
  const next = clone(story);
  const byId = new Map(next.scenes.map((scene) => [scene.id, scene]));
  for (const cue of sourceEdits.musicSync) {
    if (!isRecord(cue) || !Array.isArray(cue.scenes) || !Number(cue.bpm)) continue;
    for (const id of cue.scenes) {
      const scene = byId.get(String(id));
      if (!scene) continue;
      scene.musicSync = { bpm: Number(cue.bpm), firstBeat: Number(cue.firstBeat) || 0 };
      if (!scene.musicUrl && cue.track && scene.musicMode !== "none") scene.musicUrl = String(cue.track);
    }
  }
  return next;
}

export function runningSceneIds(story: StoryLike): string[] {
  const byId = new Map<string, SceneLike>(story.scenes.map((scene) => [scene.id, scene]));
  const ordered: string[] = [];
  const visited = new Set<string>();
  let nextId: string | undefined = story.startSceneId || story.scenes[0]?.id;

  while (nextId && byId.has(nextId) && !visited.has(nextId)) {
    const scene: SceneLike | undefined = byId.get(nextId);
    if (!scene) break;
    visited.add(nextId);
    ordered.push(scene.id);
    const beats: BeatLike[] = scene.dialogueBeats ?? [];
    const lastBeat: BeatLike | undefined = beats[beats.length - 1];
    nextId = lastBeat?.afterBeatTargetSceneId || scene.autoAdvanceTargetSceneId || scene.choices?.[0]?.targetSceneId;
  }

  return ordered;
}

export function runningOrderDiagnostics(story: StoryLike): string[] {
  const order = runningSceneIds(story);
  const reached = new Set(order);
  const diagnostics: string[] = [];
  if (order.length === 0) diagnostics.push("No scene is reachable from startSceneId.");
  const unreachable = story.scenes.filter((scene) => !reached.has(scene.id));
  if (unreachable.length) diagnostics.push(`${unreachable.length} scene node(s) are not in the straight-through running order.`);
  const lastId = order[order.length - 1];
  const last = story.scenes.find((scene) => scene.id === lastId);
  if (last?.dialogueBeats?.length) {
    const finalBeat = last.dialogueBeats[last.dialogueBeats.length - 1];
    const target = finalBeat?.afterBeatTargetSceneId || last.autoAdvanceTargetSceneId || last.choices?.[0]?.targetSceneId;
    if (target && !story.scenes.some((scene) => scene.id === target)) diagnostics.push(`The final route points to missing scene ${target}.`);
  }
  return diagnostics;
}

export function buildKeyframes(story: StoryLike): Keyframe[] {
  const orderedIds = runningSceneIds(story);
  const sceneById = new Map(story.scenes.map((scene) => [scene.id, scene]));
  const frames: Keyframe[] = [];
  let carriedPicture: string | undefined;

  orderedIds.forEach((sceneId, sceneIndex) => {
    const scene = sceneById.get(sceneId)!;
    const beats = scene.dialogueBeats ?? [];
    const scenePicture = typeof scene.background === "string" ? scene.background : undefined;
    let activePicture = scenePicture || carriedPicture;

    beats.forEach((beat, beatIndex) => {
      if (beat.backgroundRevert) activePicture = scenePicture || carriedPicture;
      if (typeof beat.background === "string" && beat.background) activePicture = beat.background;
      const picture = activePicture || scenePicture || carriedPicture;
      const pictureSource = beat.background
        ? "beat"
        : beatIndex === 0 && scenePicture
          ? "scene"
          : picture
            ? "carried"
            : "none";
      const id = String(beat.id || `${scene.id}:${beatIndex + 1}`);
      frames.push({
        id,
        sceneId: scene.id,
        sceneIndex,
        beatIndex,
        mark: String(scene.animaticMark || scene.title || scene.id),
        number: beatIndex + 1,
        beat,
        scene,
        picture,
        pictureSource,
        carried: pictureSource !== "beat",
        speaker: speakerLabel(story, beat.characterId),
        text: String(beat.text || ""),
      });
      if (picture) carriedPicture = picture;
    });
  });

  return frames;
}

export function speakerLabel(story: StoryLike, characterId?: string): string {
  if (!characterId) return "NARRATOR";
  const chars = story.characters;
  const character = Array.isArray(chars)
    ? chars.find((item: AnyRecord) => item.id === characterId)
    : isRecord(chars)
      ? chars[characterId]
      : undefined;
  const authoredName = typeof character?.name === "string" ? character.name : "";
  if (authoredName) return authoredName.toUpperCase();
  return characterId.replace(/^nw_/, "").replace(/[_-]+/g, " ").toUpperCase();
}

export function framePicture(frame: Keyframe): string | undefined {
  return frame.picture;
}

export function firstLine(text: string, max = 72): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function sceneLabel(scene: SceneLike): string {
  return String(scene.animaticMark || scene.title || scene.id);
}

export function assetIdFromReference(value: string): string | undefined {
  const match = /(?:^|:)asset:([^/?#]+)/.exec(value);
  return match?.[1];
}

export function unwrapMediaReference(value: string): string {
  if (value.startsWith("video:") || value.startsWith("mp3:")) return value.slice(value.indexOf(":") + 1);
  return value;
}

export function collectMediaReferences(story: StoryLike): string[] {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value) return;
    if (/^(?:gradient:|emoji:)/i.test(value)) return;
    const unwrapped = unwrapMediaReference(value);
    if (unwrapped.startsWith("data:") || unwrapped.startsWith("blob:")) return;
    refs.add(unwrapped);
  };
  const visitCinematic = (cinematic: unknown) => {
    if (!isRecord(cinematic)) return;
    ["depthMap", "depthPlate", "foregroundImage"].forEach((key) => add(cinematic[key]));
    for (const key of ["depthCutouts", "foregroundExtras", "parallaxLayers"]) {
      if (Array.isArray(cinematic[key])) cinematic[key].forEach((layer: AnyRecord) => add(layer?.image));
    }
    const animation = cinematic.foregroundAnimation;
    if (isRecord(animation) && Array.isArray(animation.frames)) animation.frames.forEach(add);
  };

  for (const scene of story.scenes) {
    add(scene.background);
    add(scene.musicUrl);
    add(scene.sceneAudioUrl);
    add(scene.narrationAudioUrl);
    const ambient = String(scene.ambientAudio || "");
    for (const part of ambient.split("+")) add(part.startsWith("file:") ? part.slice(5) : part);
    visitCinematic(scene.cinematic);
    for (const beat of scene.dialogueBeats ?? []) {
      add(beat.background);
      add(beat.audioUrl);
      add(beat.sfxUrl);
      visitCinematic(beat.cinematic);
    }
  }
  return [...refs];
}

export function collectImageReferences(story: StoryLike, assets: ProjectAsset[] = []): string[] {
  const imageRefs = new Set<string>();
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value) return;
    if (/^video:/i.test(value) || /^gradient:/i.test(value)) return;
    const assetId = assetIdFromReference(value);
    if (assetId) {
      if (assetsById.get(assetId)?.type === "image") imageRefs.add(value);
      return;
    }
    const raw = unwrapMediaReference(value);
    if (/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i.test(raw)) imageRefs.add(value);
  };
  const visitCinematic = (cinematic: unknown) => {
    if (!isRecord(cinematic)) return;
    ["depthMap", "depthPlate", "foregroundImage"].forEach((key) => add(cinematic[key]));
    for (const key of ["depthCutouts", "foregroundExtras", "parallaxLayers"]) {
      if (Array.isArray(cinematic[key])) cinematic[key].forEach((layer: AnyRecord) => add(layer?.image));
    }
    const animation = cinematic.foregroundAnimation;
    if (isRecord(animation) && Array.isArray(animation.frames)) animation.frames.forEach(add);
  };
  story.scenes.forEach((scene) => {
    add(scene.background);
    visitCinematic(scene.cinematic);
    scene.dialogueBeats?.forEach((beat) => {
      add(beat.background);
      visitCinematic(beat.cinematic);
    });
    if (scene.credits && Array.isArray(scene.credits.montage)) scene.credits.montage.forEach(add);
  });
  assets.filter((asset) => asset.type === "image").forEach((asset) => imageRefs.add(`asset:${asset.id}`));
  return [...imageRefs];
}

export function sceneForFrame(story: StoryLike, frameId: string): SceneLike | undefined {
  const frame = buildKeyframes(story).find((candidate) => candidate.id === frameId);
  return frame?.scene;
}
