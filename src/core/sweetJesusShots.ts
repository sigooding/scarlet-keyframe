import shotData from "../data/sweet-jesus-shots.json";
import s02Coffee from "../assets/sweet-jesus/scenes/s02-01-coffee.jpg?inline";
import s02Officers from "../assets/sweet-jesus/scenes/s02-02-officers.jpg?inline";
import s02BugDoorway from "../assets/sweet-jesus/scenes/s02-03-bug-doorway.jpg?inline";
import s03Stoop from "../assets/sweet-jesus/scenes/s03-01-stoop.jpg?inline";
import s03CoronerVan from "../assets/sweet-jesus/scenes/s03-02-coroner-van.jpg?inline";
import s04Counter from "../assets/sweet-jesus/scenes/s04-01-counter.jpg?inline";
import s04Receipt from "../assets/sweet-jesus/scenes/s04-02-receipt.jpg?inline";
import s04SeedWrapper from "../assets/sweet-jesus/scenes/s04-03-seed-wrapper.jpg?inline";
import s05BagNote from "../assets/sweet-jesus/scenes/s05-01-bag-note.jpg?inline";
import s05Pike from "../assets/sweet-jesus/scenes/s05-02-pike.jpg?inline";
import s05Drawer from "../assets/sweet-jesus/scenes/s05-03-drawer.jpg?inline";
import s06Hired from "../assets/sweet-jesus/scenes/s06-01-hired.jpg?inline";
import s06LedgerPage from "../assets/sweet-jesus/scenes/s06-02-ledger-page.jpg?inline";
import s06TheAdvance from "../assets/sweet-jesus/scenes/s06-03-the-advance.jpg?inline";
import s07TheSuit from "../assets/sweet-jesus/scenes/s07-01-the-suit.jpg?inline";
import s07Counting from "../assets/sweet-jesus/scenes/s07-02-counting.jpg?inline";
import s07BiscuitTin from "../assets/sweet-jesus/scenes/s07-03-biscuit-tin.jpg?inline";
import s08UnderTheTable from "../assets/sweet-jesus/scenes/s08-01-under-the-table.jpg?inline";
import s08PencilledThirteen from "../assets/sweet-jesus/scenes/s08-02-pencilled-thirteen.jpg?inline";
import s08TheCassette from "../assets/sweet-jesus/scenes/s08-03-the-cassette.jpg?inline";
import s09Stamp from "../assets/sweet-jesus/scenes/s09-01-stamp.jpg?inline";
import s09LotThirteen from "../assets/sweet-jesus/scenes/s09-02-lot-thirteen.jpg?inline";
import s09Telephone from "../assets/sweet-jesus/scenes/s09-03-telephone.jpg?inline";
import s10SandwichLine from "../assets/sweet-jesus/scenes/s10-01-sandwich-line.jpg?inline";
import s10Dorothy from "../assets/sweet-jesus/scenes/s10-02-dorothy.jpg?inline";
import s10TheNote from "../assets/sweet-jesus/scenes/s10-03-the-note.jpg?inline";
import s11TheBooks from "../assets/sweet-jesus/scenes/s11-01-the-books.jpg?inline";
import s11BentNib from "../assets/sweet-jesus/scenes/s11-02-bent-nib.jpg?inline";
import s11TheDrawer from "../assets/sweet-jesus/scenes/s11-03-the-drawer.jpg?inline";
import s12AuctionWindow from "../assets/sweet-jesus/scenes/s12-01-auction-window.jpg?inline";
import type { ProjectAsset, ProjectState } from "./model";
import { buildKeyframes } from "./model";

/**
 * A Sweet Jesus scene still is a keyframe of the film, not a reference plate:
 * the characters are acting the beat, in the room from the location sheets, with
 * the props from the prop sheets. Each one is keyed to the beats it covers.
 */
export interface SceneShot {
  id: string;
  label: string;
  alt: string;
  note: string;
  sceneId: string;
  beats: string[];
  location: string;
  cast: string[];
  props: string[];
  original: string;
  preview: string;
  dataUrl: string;
}

export const SWEET_JESUS_SHOT_VERSION = 1;

const images: Record<string, string> = {
  "s02-01-coffee": s02Coffee,
  "s02-02-officers": s02Officers,
  "s02-03-bug-doorway": s02BugDoorway,
  "s03-01-stoop": s03Stoop,
  "s03-02-coroner-van": s03CoronerVan,
  "s04-01-counter": s04Counter,
  "s04-02-receipt": s04Receipt,
  "s04-03-seed-wrapper": s04SeedWrapper,
  "s05-01-bag-note": s05BagNote,
  "s05-02-pike": s05Pike,
  "s05-03-drawer": s05Drawer,
  "s06-01-hired": s06Hired,
  "s06-02-ledger-page": s06LedgerPage,
  "s06-03-the-advance": s06TheAdvance,
  "s07-01-the-suit": s07TheSuit,
  "s07-02-counting": s07Counting,
  "s07-03-biscuit-tin": s07BiscuitTin,
  "s08-01-under-the-table": s08UnderTheTable,
  "s08-02-pencilled-thirteen": s08PencilledThirteen,
  "s08-03-the-cassette": s08TheCassette,
  "s09-01-stamp": s09Stamp,
  "s09-02-lot-thirteen": s09LotThirteen,
  "s09-03-telephone": s09Telephone,
  "s10-01-sandwich-line": s10SandwichLine,
  "s10-02-dorothy": s10Dorothy,
  "s10-03-the-note": s10TheNote,
  "s11-01-the-books": s11TheBooks,
  "s11-02-bent-nib": s11BentNib,
  "s11-03-the-drawer": s11TheDrawer,
  "s12-01-auction-window": s12AuctionWindow,
};

export const SWEET_JESUS_SHOTS: SceneShot[] = shotData.map((shot) => {
  const dataUrl = images[shot.id];
  if (!dataUrl) throw new Error(`Missing bundled scene keyframe: ${shot.id}`);
  return { ...shot, preview: `./sweet-jesus/scenes/${shot.original}`, dataUrl };
});

const shotForBeat = new Map(
  SWEET_JESUS_SHOTS.flatMap((shot) => shot.beats.map((id) => [id, shot] as const)),
);

function candidateFrames(project: ProjectState): Array<{ beatId: string; shot: SceneShot }> {
  if (project.story.id !== "sweet-jesus-film") return [];
  const existing = new Map((project.assets ?? []).map((asset) => [asset.id, asset]));
  return buildKeyframes(project.story).flatMap((frame) => {
    const shot = shotForBeat.get(frame.id);
    if (!shot || frame.picture || frame.beat.gap || frame.beat.backgroundRevert || frame.beat.backgroundHold !== false) return [];
    const assetId = `sj-shot-v${SWEET_JESUS_SHOT_VERSION}-${shot.id}`;
    const occupied = existing.get(assetId);
    // Never replace a user asset with an accidentally colliding identifier.
    if (occupied && (occupied.type !== "image" || occupied.dataUrl !== shot.dataUrl)) return [];
    return [{ beatId: frame.id, shot }];
  });
}

/** Number of independent, truly blank scene slots that can safely be filled. */
export function countEmptySweetJesusShots(project: ProjectState): number {
  return candidateFrames(project).length;
}

/**
 * Insert keyframes only into empty scene slots, without altering dialogue, CC,
 * durations, deliberate gaps, existing pictures, or other films.
 */
export function fillEmptySweetJesusShots(project: ProjectState): ProjectState {
  const candidates = candidateFrames(project);
  if (!candidates.length) return project;
  const byBeat = new Map(candidates.map(({ beatId, shot }) => [beatId, shot]));
  const usedIds = new Set(project.assets.map((asset) => asset.id));
  const added: ProjectAsset[] = [];
  for (const { shot } of candidates) {
    const assetId = `sj-shot-v${SWEET_JESUS_SHOT_VERSION}-${shot.id}`;
    if (usedIds.has(assetId)) continue;
    usedIds.add(assetId);
    // The bytes are already bundled in the editor and remain available offline;
    // asset refs avoid duplicating base64 data for every repeated beat.
    const payload = shot.dataUrl.split(",", 2)[1] || "";
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    added.push({
      id: assetId,
      name: `Sweet Jesus - ${shot.label}.jpg`,
      type: "image",
      mime: "image/jpeg",
      size: Math.max(0, Math.floor(payload.length * 3 / 4) - padding),
      source: "bundle",
      width: 1024,
      height: 576,
      dataUrl: shot.dataUrl,
    });
  }
  const scenes = project.story.scenes.map((scene) => {
    if (!scene.dialogueBeats?.some((beat) => beat.id && byBeat.has(beat.id))) return scene;
    return {
      ...scene,
      dialogueBeats: scene.dialogueBeats.map((beat) => {
        const shot = beat.id ? byBeat.get(beat.id) : undefined;
        return shot
          ? { ...beat, background: `asset:sj-shot-v${SWEET_JESUS_SHOT_VERSION}-${shot.id}`, backgroundHold: false }
          : beat;
      }),
    };
  });
  const drafts = [
    "Storyboard draft: blank pictures and planned audio/captions",
    "Storyboard draft: opening reference stills; remaining pictures and audio planned",
  ];
  return {
    ...project,
    story: {
      ...project.story,
      scenes,
      ...(drafts.includes(String(project.story.productionStatus))
        ? { productionStatus: "Storyboard draft: opening and scene keyframes; remaining pictures and audio planned" }
        : {}),
    },
    assets: [...project.assets, ...added],
    updatedAt: Date.now(),
  };
}

/** One-time fill of the untouched built-in draft; blank slots only, so edits survive. */
export function upgradeSweetJesusShots(project: ProjectState): ProjectState {
  if (project.id !== "sweet-jesus-film" || project.story.id !== "sweet-jesus-film" ||
      (project.sweetJesusShotsVersion ?? 0) >= SWEET_JESUS_SHOT_VERSION) return project;
  const next = fillEmptySweetJesusShots(project);
  return { ...next, sweetJesusShotsVersion: SWEET_JESUS_SHOT_VERSION };
}
