import openingData from "../data/sweet-jesus-opening.json";
import brothers from "../assets/sweet-jesus/opening/brothers-washer.jpg?inline";
import newspaper from "../assets/sweet-jesus/opening/brothers-newspaper.jpg?inline";
import quarters from "../assets/sweet-jesus/opening/brothers-quarters.jpg?inline";
import exit from "../assets/sweet-jesus/opening/peanut-exits.jpg?inline";
import recording from "../assets/sweet-jesus/opening/bug-recording.jpg?inline";
import ring from "../assets/sweet-jesus/opening/pinky-ring.jpg?inline";
import label from "../assets/sweet-jesus/opening/bug-labels-tape.jpg?inline";
import type { ProjectAsset, ProjectState } from "./model";
import { buildKeyframes } from "./model";

export interface OpeningReference {
  id: string;
  label: string;
  preview: string;
  original: string;
  note: string;
  beats: string[];
  assetId: string;
  dataUrl: string;
}

const images: Record<string, string> = {
  "brothers-washer": brothers,
  "brothers-newspaper": newspaper,
  "brothers-quarters": quarters,
  "peanut-exits": exit,
  "bug-recording": recording,
  "pinky-ring": ring,
  "bug-labels-tape": label,
};

export const SWEET_JESUS_OPENING_REFERENCES: OpeningReference[] = openingData.shots.map((shot) => {
  const dataUrl = images[shot.id];
  if (!dataUrl) throw new Error(`Missing bundled opening image: ${shot.id}`);
  return { ...shot, dataUrl, assetId: `sj-opening-v${openingData.version}-${shot.id}` };
});

const referenceForBeat = new Map(
  SWEET_JESUS_OPENING_REFERENCES.flatMap((reference) => reference.beats.map((id) => [id, reference] as const)),
);

function candidateFrames(project: ProjectState): Array<{ beatId: string; reference: OpeningReference }> {
  if (project.story.id !== "sweet-jesus-film") return [];
  const existing = new Map((project.assets ?? []).map((asset) => [asset.id, asset]));
  return buildKeyframes(project.story).flatMap((frame) => {
    const reference = frame.sceneId === openingData.sceneId ? referenceForBeat.get(frame.id) : undefined;
    if (!reference || frame.picture || frame.beat.gap || frame.beat.backgroundRevert || frame.beat.backgroundHold !== false) return [];
    const occupied = existing.get(reference.assetId);
    // Never replace a user asset with an accidentally colliding identifier.
    if (occupied && (occupied.type !== "image" || occupied.dataUrl !== reference.dataUrl)) return [];
    return [{ beatId: frame.id, reference }];
  });
}

/** Number of independent, truly blank opening slots that can safely be filled. */
export function countEmptySweetJesusOpeningShots(project: ProjectState): number {
  return candidateFrames(project).length;
}

/**
 * Insert references only into empty opening slots, without altering dialogue,
 * CC, durations, deliberate gaps, existing pictures, or other films. This is
 * also an explicit, undoable action for saved drafts with opening edits.
 */
export function fillEmptySweetJesusOpeningShots(project: ProjectState): ProjectState {
  const candidates = candidateFrames(project);
  if (!candidates.length) return project;
  const byBeat = new Map(candidates.map(({ beatId, reference }) => [beatId, reference]));
  const usedIds = new Set(project.assets.map((asset) => asset.id));
  const added: ProjectAsset[] = [];
  for (const { reference } of candidates) {
    if (usedIds.has(reference.assetId)) continue;
    usedIds.add(reference.assetId);
    // The bytes are already bundled in the editor and remain available offline;
    // asset refs avoid duplicating base64 data for every repeated beat.
    const payload = reference.dataUrl.split(",", 2)[1] || "";
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    added.push({
      id: reference.assetId,
      name: `Sweet Jesus - ${reference.label}.jpg`,
      type: "image",
      mime: "image/jpeg",
      size: Math.max(0, Math.floor(payload.length * 3 / 4) - padding),
      source: "bundle",
      width: 1280,
      height: 720,
      dataUrl: reference.dataUrl,
    });
  }
  const scenes = project.story.scenes.map((scene) => scene.id !== openingData.sceneId ? scene : {
    ...scene,
    dialogueBeats: scene.dialogueBeats?.map((beat) => {
      const reference = beat.id ? byBeat.get(beat.id) : undefined;
      return reference ? { ...beat, background: `asset:${reference.assetId}`, backgroundHold: false } : beat;
    }),
  });
  const oldStatus = "Storyboard draft: blank pictures and planned audio/captions";
  return {
    ...project,
    story: {
      ...project.story,
      scenes,
      ...(project.story.productionStatus === oldStatus
        ? { productionStatus: "Storyboard draft: opening reference stills; remaining pictures and audio planned" }
        : {}),
    },
    assets: [...project.assets, ...added],
    updatedAt: Date.now(),
  };
}

/**
 * One-time migration of the untouched, pre-illustration built-in draft. If the
 * opening scene has *any* user edit, leave it exactly as it is; the user can
 * explicitly fill its remaining blank pictures from the launderette gallery.
 */
export function upgradeSweetJesusOpening(project: ProjectState): ProjectState {
  if (project.id !== "sweet-jesus-film" || project.story.id !== "sweet-jesus-film" ||
      project.sourceName !== "sweet-jesus-film.json" || (project.sweetJesusOpeningVersion ?? 0) >= openingData.version) return project;
  const current = project.story.scenes.find((scene) => scene.id === openingData.sceneId);
  const original = project.originalStory?.scenes.find((scene) => scene.id === openingData.sceneId);
  const unchanged = current && original && JSON.stringify(current) === JSON.stringify(original);
  const next = unchanged ? fillEmptySweetJesusOpeningShots(project) : project;
  return { ...next, sweetJesusOpeningVersion: openingData.version };
}
