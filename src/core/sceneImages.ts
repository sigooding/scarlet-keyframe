// Pure logic for the Media Bin's scene view: which pictures belong to a scene.
//
// - In use: the pictures the scene's keyframes show now, in running order.
// - Earlier versions: files under /film/img/archive/<scene folder>/ (there is no per-keyframe picture history).
// - Alternatives: everything else that belongs to the scene: its own folder(s), sibling folders named
//   <folder>_<anything> (s2_new, s2_picks) and files anywhere else (retake folders, ...) that start with the same
//   leading shot number as a picture the scene uses (137-... matches retakes_2026_10_25/137-...-r1.jpg).
// Depth maps, reels, sheets and the archive are never alternatives.

export interface SceneFrameLite {
  id: string;
  sceneId: string;
  mark: string;
  title: string;
  number: number;
  picture?: string;
}

export interface SceneAssetLike {
  ref: string;
  name: string;
  folder: string;
  missing?: boolean;
}

export type SceneTileKind = "inuse" | "earlier" | "alt";

export interface SceneTile<A extends SceneAssetLike> {
  asset: A;
  kind: SceneTileKind;
  /** Keyframes of this scene that use the picture (in use only). */
  frames: { id: string; number: number }[];
}

export interface SceneImages<A extends SceneAssetLike> {
  folders: string[];
  inUse: SceneTile<A>[];
  earlier: SceneTile<A>[];
  alternatives: SceneTile<A>[];
}

export interface SceneListEntry {
  id: string;
  mark: string;
  title: string;
  frameCount: number;
}

const IMG_ROOT = "/film/img/";
const ARCHIVE_ROOT = "/film/img/archive/";
const NOT_SCENE_PICTURE = ["/film/depth/", "/film/review", "/reels/", "/sheets/", ARCHIVE_ROOT];

/** Folder of a /film/img/... picture relative to /film/img/ ("s77a"), or "" for anything else. */
export function sceneFolderOf(ref: string | undefined): string {
  if (!ref || !ref.startsWith(IMG_ROOT)) return "";
  const parts = ref.slice(IMG_ROOT.length).split("/");
  parts.pop();
  return parts.join("/");
}

export function leadingShotNumber(name: string): string {
  return /^(\d+)[-_]/.exec(name)?.[1] ?? "";
}

function fileName(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

function isUsablePicture(ref: string | undefined): ref is string {
  return Boolean(ref) && ref!.startsWith("/") && !/^(?:video|gradient):/.test(ref!);
}

export function sceneList(frames: readonly SceneFrameLite[]): SceneListEntry[] {
  const out: SceneListEntry[] = [];
  const byId = new Map<string, SceneListEntry>();
  for (const frame of frames) {
    let entry = byId.get(frame.sceneId);
    if (!entry) {
      entry = { id: frame.sceneId, mark: frame.mark, title: frame.title, frameCount: 0 };
      byId.set(frame.sceneId, entry);
      out.push(entry);
    }
    entry.frameCount += 1;
  }
  return out;
}

export function groupSceneImages<A extends SceneAssetLike>(
  sceneId: string | undefined,
  frames: readonly SceneFrameLite[],
  assets: readonly A[],
): SceneImages<A> {
  const empty: SceneImages<A> = { folders: [], inUse: [], earlier: [], alternatives: [] };
  if (!sceneId) return empty;
  const sceneFrames = frames.filter((frame) => frame.sceneId === sceneId);
  if (!sceneFrames.length) return empty;

  const byRef = new Map(assets.map((asset) => [asset.ref, asset]));

  // In use, in running order, each picture once.
  const used = new Map<string, { id: string; number: number }[]>();
  for (const frame of sceneFrames) {
    if (!isUsablePicture(frame.picture)) continue;
    const list = used.get(frame.picture) ?? [];
    list.push({ id: frame.id, number: frame.number });
    used.set(frame.picture, list);
  }
  const inUse: SceneTile<A>[] = [];
  for (const [ref, owners] of used) {
    const asset = byRef.get(ref);
    if (asset) inUse.push({ asset, kind: "inuse", frames: owners });
  }

  // Scene folders come from what the keyframes actually use; fall back to the scene mark (s77a).
  const folderSet = new Set<string>();
  for (const ref of used.keys()) {
    const folder = sceneFolderOf(ref);
    if (folder) folderSet.add(folder);
  }
  if (!folderSet.size) {
    const mark = sceneFrames[0].mark.toLowerCase().replace(/\s+/g, "");
    if (mark) folderSet.add(`s${mark}`);
  }
  const folders = [...folderSet];
  const usedNumbers = new Set<string>();
  for (const ref of used.keys()) {
    const n = leadingShotNumber(fileName(ref));
    if (n) usedNumbers.add(n);
  }

  const earlier: SceneTile<A>[] = [];
  const alternatives: SceneTile<A>[] = [];
  for (const asset of assets) {
    if (asset.missing || used.has(asset.ref)) continue;
    if (folders.some((folder) => asset.ref.startsWith(`${ARCHIVE_ROOT}${folder}/`))) {
      earlier.push({ asset, kind: "earlier", frames: [] });
      continue;
    }
    if (NOT_SCENE_PICTURE.some((part) => asset.ref.includes(part))) continue;
    const folder = sceneFolderOf(asset.ref);
    if (!folder) continue;
    const inFolder = folders.includes(folder);
    const inSibling = folders.some((f) => folder.startsWith(`${f}_`));
    const n = leadingShotNumber(fileName(asset.ref));
    if (inFolder || inSibling || (n && usedNumbers.has(n))) {
      alternatives.push({ asset, kind: "alt", frames: [] });
    }
  }
  const byName = (a: SceneTile<A>, b: SceneTile<A>) =>
    a.asset.folder.localeCompare(b.asset.folder) || a.asset.name.localeCompare(b.asset.name, undefined, { numeric: true });
  earlier.sort(byName);
  alternatives.sort(byName);
  return { folders, inUse, earlier, alternatives };
}
