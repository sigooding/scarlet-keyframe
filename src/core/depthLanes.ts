import type { AnyRecord, Keyframe, ProjectState, SceneLike, BeatLike } from "./model";
import { buildKeyframes, unwrapMediaReference } from "./model";
import { effectiveFrameCinematic } from "../sequence/cameraPresets";
import type { TimelineClip } from "../sequence/animate";

export const MAX_DEPTH_CUTOUTS = 4;

export const CUTOUT_LAYER_COLORS: readonly [string, string, string, string] = [
  "#5ccfe6",
  "#c678dd",
  "#7fd962",
  "#f28779",
];

export const DEFAULT_CUTOUT_DEPTHS: readonly [number, number, number, number] = [
  0.55,
  0.66,
  0.76,
  0.86,
];

export interface DepthCutoutSlot {
  image: string;
  depth: number;
}

export interface ActiveCutoutLayer {
  layerIndex: number;
  image: string;
  depth: number;
}

export interface ClipDepthInfo {
  frameId: string;
  depthMap?: string;
  depthPlate?: string;
  depthAmount: number;
  depthFocus?: number;
  depthMotion?: string;
  /** Fixed length MAX_DEPTH_CUTOUTS (0..3). Null means unoccupied slot. */
  cutoutSlots: Array<DepthCutoutSlot | null>;
  /** Occupied cutout slots in ascending layer order. */
  activeCutouts: ActiveCutoutLayer[];
  foregroundImage?: string;
  isCarriedDepth: boolean;
  isCarriedCutouts: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export function defaultDepthForCutoutLayer(layerIndex: number): number {
  const clamped = Math.max(0, Math.min(MAX_DEPTH_CUTOUTS - 1, Math.floor(layerIndex)));
  return DEFAULT_CUTOUT_DEPTHS[clamped] ?? 0.6;
}

/**
 * Formats a concise, readable label for depth maps, clean plates, and cutout PNGs.
 * Many bundled depth assets share generic filenames (`depth.png`, `plate.jpg`, `cutout-1.png`),
 * so we include the shot folder slug when helpful.
 */
export function depthAssetLabel(ref: string | undefined, fallback = "Unassigned"): string {
  if (!ref) return fallback;
  const clean = unwrapMediaReference(ref).trim();
  if (!clean) return fallback;
  if (clean.startsWith("asset:")) {
    return `upload · ${clean.slice(6, 13)}`;
  }
  const parts = clean.replace(/[?#].*$/, "").replace(/\\/g, "/").split("/").filter(Boolean);
  const file = parts[parts.length - 1] || clean;
  const stem = file.replace(/\.[^.]+$/, "");
  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  if (/^(?:depth|plate|cutout(?:-\d+)?)$/i.test(stem) && parent && !/^(?:depth|img|film)$/i.test(parent)) {
    return `${parent} · ${stem}`;
  }
  return stem || file;
}

/**
 * Parses `cinematic.depthCutouts` into 4 fixed layer slots (0..3), preserving
 * intentional empty placeholder entries (`image: ""`) when higher layers are occupied.
 */
export function readCutoutSlotsFromCinematic(
  cinematic: AnyRecord | undefined,
): Array<DepthCutoutSlot | null> {
  const slots: Array<DepthCutoutSlot | null> = Array.from(
    { length: MAX_DEPTH_CUTOUTS },
    () => null,
  );
  const raw = cinematic?.depthCutouts;
  if (!Array.isArray(raw)) return slots;

  for (let i = 0; i < Math.min(MAX_DEPTH_CUTOUTS, raw.length); i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") continue;
    const image = typeof entry.image === "string" ? entry.image.trim() : "";
    if (!image) continue;
    const rawDepth = typeof entry.depth === "number" ? entry.depth : defaultDepthForCutoutLayer(i);
    slots[i] = {
      image,
      depth: clamp01(rawDepth),
    };
  }
  return slots;
}

/**
 * Serializes 4 cutout slots back into `cinematic.depthCutouts`, keeping empty
 * intermediate slots `{ image: "", depth }` only when needed to preserve higher layer indices,
 * and trimming trailing empty slots (returning `undefined` if all slots are empty).
 */
export function serializeCutoutSlots(
  slots: ReadonlyArray<DepthCutoutSlot | null>,
): DepthCutoutSlot[] | undefined {
  let lastOccupied = -1;
  for (let i = Math.min(MAX_DEPTH_CUTOUTS, slots.length) - 1; i >= 0; i -= 1) {
    const item = slots[i];
    if (item && item.image.trim()) {
      lastOccupied = i;
      break;
    }
  }
  if (lastOccupied < 0) return undefined;

  const output: DepthCutoutSlot[] = [];
  for (let i = 0; i <= lastOccupied; i += 1) {
    const item = slots[i];
    if (item && item.image.trim()) {
      output.push({
        image: item.image.trim(),
        depth: clamp01(item.depth),
      });
    } else {
      output.push({
        image: "",
        depth: defaultDepthForCutoutLayer(i),
      });
    }
  }
  return output;
}

export function extractKeyframeDepthInfo(kf: Keyframe): ClipDepthInfo {
  const cinematic = (effectiveFrameCinematic(kf) || {}) as AnyRecord;
  const beatCin = (kf.beat.cinematic || undefined) as AnyRecord | undefined;

  const depthMap =
    typeof cinematic.depthMap === "string" && cinematic.depthMap.trim()
      ? cinematic.depthMap.trim()
      : undefined;
  const depthPlate =
    typeof cinematic.depthPlate === "string" && cinematic.depthPlate.trim()
      ? cinematic.depthPlate.trim()
      : undefined;
  const depthAmount =
    typeof cinematic.depthAmount === "number" && Number.isFinite(cinematic.depthAmount)
      ? clamp01(cinematic.depthAmount)
      : 0.4;
  const depthFocus =
    typeof cinematic.depthFocus === "number" && Number.isFinite(cinematic.depthFocus)
      ? clamp01(cinematic.depthFocus)
      : undefined;
  const depthMotion =
    typeof cinematic.depthMotion === "string" && cinematic.depthMotion.trim()
      ? cinematic.depthMotion.trim()
      : undefined;
  const foregroundImage =
    typeof cinematic.foregroundImage === "string" && cinematic.foregroundImage.trim()
      ? cinematic.foregroundImage.trim()
      : undefined;

  const cutoutSlots = readCutoutSlotsFromCinematic(cinematic);
  const activeCutouts: ActiveCutoutLayer[] = [];
  cutoutSlots.forEach((slot, idx) => {
    if (slot && slot.image) {
      activeCutouts.push({
        layerIndex: idx,
        image: slot.image,
        depth: slot.depth,
      });
    }
  });

  const beatHasOwnDepth = Boolean(
    beatCin && typeof beatCin.depthMap === "string" && beatCin.depthMap.trim(),
  );
  const beatHasOwnCutouts = Boolean(beatCin && Array.isArray(beatCin.depthCutouts));

  return {
    frameId: kf.id,
    depthMap,
    depthPlate,
    depthAmount,
    depthFocus,
    depthMotion,
    cutoutSlots,
    activeCutouts,
    foregroundImage,
    isCarriedDepth: Boolean(kf.carried && !beatHasOwnDepth && depthMap),
    isCarriedCutouts: Boolean(kf.carried && !beatHasOwnCutouts && activeCutouts.length > 0),
  };
}

export function extractClipDepthInfo(clip: TimelineClip): ClipDepthInfo {
  return extractKeyframeDepthInfo(clip.keyframe);
}

/**
 * Determines how many expanded Cutout sub-lanes (`Cutout 1..N`) to display:
 * at least 2 (or `manualMin`), at least as many as the highest occupied cutout layer across clips,
 * capped at `MAX_DEPTH_CUTOUTS` (4).
 */
export function computeVisibleCutoutSublaneCount(
  clips: ReadonlyArray<TimelineClip>,
  manualMin = 2,
): number {
  let highestNeeded = Math.max(1, Math.min(MAX_DEPTH_CUTOUTS, manualMin));
  for (const clip of clips) {
    if (clip.keyframe.beat.gap) continue;
    const raw = effectiveFrameCinematic(clip.keyframe)?.depthCutouts;
    if (!Array.isArray(raw)) continue;
    for (let i = Math.min(MAX_DEPTH_CUTOUTS, raw.length) - 1; i >= 0; i -= 1) {
      if (raw[i] && typeof raw[i].image === "string" && raw[i].image.trim()) {
        if (i + 1 > highestNeeded) highestNeeded = i + 1;
        break;
      }
    }
  }
  return Math.max(1, Math.min(MAX_DEPTH_CUTOUTS, highestNeeded));
}

/**
 * Filters `cinematic.depthCutouts` according to lane mute state (`showCutouts`)
 * and per-layer mute indices (`mutedCutoutLayers`, 0-based).
 */
export function filterActiveCutoutsForPreview(
  rawCutouts: unknown,
  showCutouts = true,
  mutedCutoutLayers?: ReadonlySet<number>,
): DepthCutoutSlot[] | undefined {
  if (!showCutouts || !Array.isArray(rawCutouts)) return undefined;
  const result: DepthCutoutSlot[] = [];
  for (let i = 0; i < Math.min(MAX_DEPTH_CUTOUTS, rawCutouts.length); i += 1) {
    if (mutedCutoutLayers?.has(i)) continue;
    const entry = rawCutouts[i];
    if (!entry || typeof entry !== "object") continue;
    const image = typeof entry.image === "string" ? entry.image.trim() : "";
    if (!image) continue;
    const depth =
      typeof entry.depth === "number" && Number.isFinite(entry.depth)
        ? clamp01(entry.depth)
        : defaultDepthForCutoutLayer(i);
    result.push({ image, depth });
  }
  return result.length > 0 ? result : undefined;
}

// ============================================================================
// Pure ProjectState Mutations for Depth Maps & Cutout Layers
// ============================================================================

function locateFrameBeat(
  story: ProjectState["story"],
  frameId: string,
): { scene: SceneLike; beat: BeatLike } | null {
  const seen = new Set<string>();
  for (const scene of story.scenes) {
    const beats = scene.dialogueBeats ?? [];
    for (let beatIndex = 0; beatIndex < beats.length; beatIndex += 1) {
      const beat = beats[beatIndex];
      const rawId = String(beat.id || `${scene.id}:${beatIndex + 1}`);
      const id = seen.has(rawId) ? `${scene.id}:${rawId}` : rawId;
      seen.add(id);
      if (id === frameId) return { scene, beat };
    }
  }
  return null;
}

function mutateFrameCinematic(
  project: ProjectState,
  frameId: string,
  mutator: (cinematic: AnyRecord, existingFrame: Keyframe) => void,
): ProjectState {
  const story = JSON.parse(JSON.stringify(project.story)) as ProjectState["story"];
  const frames = buildKeyframes(story);
  const target = frames.find((f) => f.id === frameId);
  const location = locateFrameBeat(story, frameId);
  if (!target || !location || location.beat.gap) return project;

  const inheritedSource = target.cinematic ?? location.scene.cinematic;
  const baseCin = location.beat.cinematic ?? inheritedSource ?? {};
  const cinematic: AnyRecord = JSON.parse(JSON.stringify(baseCin));
  mutator(cinematic, target);

  if (Object.keys(cinematic).length > 0 || inheritedSource) {
    // Keep `{}` when an inherited scene/held cinematic exists so `beat.cinematic || ...`
    // does not resurrect a cleared depthMap or depthCutouts from an ancestor.
    location.beat.cinematic = cinematic;
  } else {
    delete location.beat.cinematic;
  }

  return {
    ...project,
    story,
    updatedAt: Date.now(),
  };
}

export function setFrameDepthMap(
  project: ProjectState,
  frameId: string,
  depthMap: string | undefined,
): ProjectState {
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    const trimmed = depthMap?.trim();
    if (trimmed) {
      cinematic.depthMap = trimmed;
      if (typeof cinematic.depthAmount !== "number") {
        cinematic.depthAmount = 0.4;
      }
    } else {
      delete cinematic.depthMap;
    }
  });
}

export function setFrameDepthPlate(
  project: ProjectState,
  frameId: string,
  depthPlate: string | undefined,
): ProjectState {
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    const trimmed = depthPlate?.trim();
    if (trimmed) cinematic.depthPlate = trimmed;
    else delete cinematic.depthPlate;
  });
}

export function setFrameCutoutLayer(
  project: ProjectState,
  frameId: string,
  layerIndex: number,
  cutout: { image: string; depth?: number } | null,
): ProjectState {
  const idx = Math.max(0, Math.min(MAX_DEPTH_CUTOUTS - 1, Math.floor(layerIndex)));
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    const slots = readCutoutSlotsFromCinematic(cinematic);
    if (cutout && cutout.image.trim()) {
      const prevDepth = slots[idx]?.depth;
      slots[idx] = {
        image: cutout.image.trim(),
        depth: clamp01(cutout.depth ?? prevDepth ?? defaultDepthForCutoutLayer(idx)),
      };
    } else {
      slots[idx] = null;
    }
    const serialized = serializeCutoutSlots(slots);
    if (serialized) cinematic.depthCutouts = serialized;
    else delete cinematic.depthCutouts;
  });
}

export function addFrameCutout(
  project: ProjectState,
  frameId: string,
  image: string,
  depth?: number,
): { project: ProjectState; layerIndex: number } {
  const trimmed = image.trim();
  if (!trimmed) return { project, layerIndex: 0 };

  const frames = buildKeyframes(project.story);
  const target = frames.find((f) => f.id === frameId);
  const existingSlots = target
    ? readCutoutSlotsFromCinematic(effectiveFrameCinematic(target))
    : Array.from({ length: MAX_DEPTH_CUTOUTS }, () => null);

  let targetIdx = existingSlots.findIndex((s) => !s || !s.image);
  if (targetIdx < 0) targetIdx = MAX_DEPTH_CUTOUTS - 1;

  const updated = setFrameCutoutLayer(project, frameId, targetIdx, {
    image: trimmed,
    depth: depth ?? defaultDepthForCutoutLayer(targetIdx),
  });
  return { project: updated, layerIndex: targetIdx };
}

export function updateFrameCutoutDepth(
  project: ProjectState,
  frameId: string,
  layerIndex: number,
  depth: number,
): ProjectState {
  const idx = Math.max(0, Math.min(MAX_DEPTH_CUTOUTS - 1, Math.floor(layerIndex)));
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    const slots = readCutoutSlotsFromCinematic(cinematic);
    const existing = slots[idx];
    if (!existing || !existing.image) return;
    slots[idx] = {
      ...existing,
      depth: clamp01(depth),
    };
    const serialized = serializeCutoutSlots(slots);
    if (serialized) cinematic.depthCutouts = serialized;
  });
}

export function moveFrameCutoutLayer(
  project: ProjectState,
  frameId: string,
  fromLayer: number,
  toLayer: number,
): ProjectState {
  const a = Math.max(0, Math.min(MAX_DEPTH_CUTOUTS - 1, Math.floor(fromLayer)));
  const b = Math.max(0, Math.min(MAX_DEPTH_CUTOUTS - 1, Math.floor(toLayer)));
  if (a === b) return project;
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    const slots = readCutoutSlotsFromCinematic(cinematic);
    const temp = slots[a];
    slots[a] = slots[b];
    slots[b] = temp;
    const serialized = serializeCutoutSlots(slots);
    if (serialized) cinematic.depthCutouts = serialized;
    else delete cinematic.depthCutouts;
  });
}

export function clearFrameCutouts(project: ProjectState, frameId: string): ProjectState {
  return mutateFrameCinematic(project, frameId, (cinematic) => {
    delete cinematic.depthCutouts;
  });
}

// ============================================================================
// Timeline Lane Visibility (Eye Toggle) & Per-Lane Vertical Height Resizing
// ============================================================================

export type TimelineLaneId =
  | "captions"
  | "video"
  | "depth"
  | "cutouts"
  | "voice"
  | "sfx"
  | "music"
  | "ambience";

export type ResizableLaneKey = TimelineLaneId | "cutoutSublane";

export interface LaneHeightSpec {
  id: ResizableLaneKey;
  label: string;
  defaultHeight: number;
  compactHeight: number;
  minHeight: number;
  maxHeight: number;
}

export const TIMELINE_LANE_ORDER: readonly TimelineLaneId[] = [
  "captions",
  "video",
  "depth",
  "cutouts",
  "voice",
  "sfx",
  "music",
  "ambience",
];

export const LANE_HEIGHT_SPECS: Record<ResizableLaneKey, LaneHeightSpec> = {
  captions: {
    id: "captions",
    label: "Captions",
    defaultHeight: 36,
    compactHeight: 26,
    minHeight: 24,
    maxHeight: 110,
  },
  video: {
    id: "video",
    label: "Video",
    defaultHeight: 100,
    compactHeight: 54,
    minHeight: 44,
    maxHeight: 220,
  },
  depth: {
    id: "depth",
    label: "Depth Maps",
    defaultHeight: 36,
    compactHeight: 28,
    minHeight: 24,
    maxHeight: 120,
  },
  cutouts: {
    id: "cutouts",
    label: "Cutouts",
    defaultHeight: 36,
    compactHeight: 28,
    minHeight: 24,
    maxHeight: 120,
  },
  cutoutSublane: {
    id: "cutoutSublane",
    label: "Cutout Layers",
    defaultHeight: 30,
    compactHeight: 24,
    minHeight: 22,
    maxHeight: 96,
  },
  voice: {
    id: "voice",
    label: "Voice",
    defaultHeight: 36,
    compactHeight: 26,
    minHeight: 24,
    maxHeight: 130,
  },
  sfx: {
    id: "sfx",
    label: "SFX",
    defaultHeight: 36,
    compactHeight: 26,
    minHeight: 24,
    maxHeight: 130,
  },
  music: {
    id: "music",
    label: "Music",
    defaultHeight: 36,
    compactHeight: 26,
    minHeight: 24,
    maxHeight: 130,
  },
  ambience: {
    id: "ambience",
    label: "Ambience",
    defaultHeight: 36,
    compactHeight: 26,
    minHeight: 24,
    maxHeight: 130,
  },
};

export type LaneHeightMap = Record<ResizableLaneKey, number>;

export function createDefaultLaneHeights(): LaneHeightMap {
  return {
    captions: LANE_HEIGHT_SPECS.captions.defaultHeight,
    video: LANE_HEIGHT_SPECS.video.defaultHeight,
    depth: LANE_HEIGHT_SPECS.depth.defaultHeight,
    cutouts: LANE_HEIGHT_SPECS.cutouts.defaultHeight,
    cutoutSublane: LANE_HEIGHT_SPECS.cutoutSublane.defaultHeight,
    voice: LANE_HEIGHT_SPECS.voice.defaultHeight,
    sfx: LANE_HEIGHT_SPECS.sfx.defaultHeight,
    music: LANE_HEIGHT_SPECS.music.defaultHeight,
    ambience: LANE_HEIGHT_SPECS.ambience.defaultHeight,
  };
}

export function createCompactLaneHeights(): LaneHeightMap {
  return {
    captions: LANE_HEIGHT_SPECS.captions.compactHeight,
    video: LANE_HEIGHT_SPECS.video.compactHeight,
    depth: LANE_HEIGHT_SPECS.depth.compactHeight,
    cutouts: LANE_HEIGHT_SPECS.cutouts.compactHeight,
    cutoutSublane: LANE_HEIGHT_SPECS.cutoutSublane.compactHeight,
    voice: LANE_HEIGHT_SPECS.voice.compactHeight,
    sfx: LANE_HEIGHT_SPECS.sfx.compactHeight,
    music: LANE_HEIGHT_SPECS.music.compactHeight,
    ambience: LANE_HEIGHT_SPECS.ambience.compactHeight,
  };
}

export function clampLaneHeight(key: ResizableLaneKey, rawHeight: number): number {
  const spec = LANE_HEIGHT_SPECS[key];
  if (!Number.isFinite(rawHeight)) return spec.defaultHeight;
  return Math.max(spec.minHeight, Math.min(spec.maxHeight, Math.round(rawHeight)));
}

export function parseStoredLaneHeights(raw: string | null | undefined): LaneHeightMap {
  const base = createDefaultLaneHeights();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return base;
    for (const key of Object.keys(LANE_HEIGHT_SPECS) as ResizableLaneKey[]) {
      const val = parsed[key];
      if (typeof val === "number" && Number.isFinite(val)) {
        base[key] = clampLaneHeight(key, val);
      }
    }
  } catch {
    // ignore invalid storage
  }
  return base;
}

export function parseStoredHiddenLanes(raw: string | null | undefined): Set<TimelineLaneId> {
  const set = new Set<TimelineLaneId>();
  if (!raw) return set;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return set;
    const valid = new Set<string>(TIMELINE_LANE_ORDER);
    for (const item of parsed) {
      if (typeof item === "string" && valid.has(item)) {
        set.add(item as TimelineLaneId);
      }
    }
  } catch {
    // ignore invalid storage
  }
  return set;
}

