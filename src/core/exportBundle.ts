import type { AudioClip } from "./audioClips";
import type { AnyRecord, ProjectAsset, ProjectState, StoryLike } from "./model";
import { assetIdFromReference, unwrapMediaReference } from "./model";
import {
  blobToDataUrl,
  encodeMediaPath,
  evaluateMissingMedia,
  hasPublicMediaPath,
  referencedPath,
  SCARLETT_WITNESS_RAW_BASE,
} from "./media";

export interface PortableStoryBundle {
  story: StoryLike;
  audioClips?: AudioClip[];
  assets: Array<{
    id: string;
    name: string;
    type: string;
    mime?: string;
    size: number;
    uploadedAt: number;
    dataUrl: string;
  }>;
  missing: string[];
}

interface WritableRef {
  value: string;
  set: (value: string) => void;
}

export async function buildPortableBundle(
  project: ProjectState,
  folderFiles: Map<string, File>,
  publicPaths: Set<string>,
): Promise<PortableStoryBundle> {
  const story = JSON.parse(JSON.stringify(project.story)) as StoryLike;
  const assets = new Map<string, PortableStoryBundle["assets"][number]>();
  for (const asset of project.assets) {
    const dataUrl = asset.dataUrl || (asset.blob ? await blobToDataUrl(asset.blob) : undefined);
    if (!dataUrl) continue;
    assets.set(asset.id, {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mime: asset.mime || asset.blob?.type,
      size: asset.size,
      uploadedAt: asset.uploadedAt || project.createdAt,
      dataUrl,
    });
  }

  const refs = collectWritableRefs(story);
  const fileAssetIds = new Map<string, string>();
  const missing = new Set(project.importedMissing);
  const nextId = () => `file-${crypto.randomUUID()}`;

  for (const ref of refs) {
    const assetId = assetIdFromReference(ref.value);
    if (assetId) {
      if (!assets.has(assetId)) missing.add(`asset:${assetId}`);
      continue;
    }
    const raw = unwrapMediaReference(ref.value);
    if (/^(?:data:|blob:|gradient:|emoji:)/i.test(raw) || /^https?:\/\//i.test(raw)) continue;
    const path = referencedPath(raw);
    if (!path) continue;
    const file = folderFiles.get(path);
    if (file) {
      let id = fileAssetIds.get(path);
      if (!id) {
        id = nextId();
        fileAssetIds.set(path, id);
        assets.set(id, {
          id,
          name: file.name,
          type: assetTypeForPath(path, file.type),
          mime: file.type || undefined,
          size: file.size,
          uploadedAt: project.createdAt,
          dataUrl: await blobToDataUrl(file),
        });
      }
      ref.set(rewrapAsset(ref.value, id));
      continue;
    }

    if (hasPublicMediaPath(publicPaths, path)) {
      const encoded = encodeMediaPath(path);
      const urls =
        typeof window !== "undefined" && window.location.protocol === "file:"
          ? [`${SCARLETT_WITNESS_RAW_BASE}/${encoded}`]
          : [`/${encoded}`, `${SCARLETT_WITNESS_RAW_BASE}/${encoded}`];
      let embedded = false;
      for (const candidateUrl of urls) {
        try {
          const response = await fetch(candidateUrl);
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && !contentType.includes("text/html")) {
            const blob = await response.blob();
            const id = fileAssetIds.get(path) || nextId();
            fileAssetIds.set(path, id);
            assets.set(id, {
              id,
              name: path.split("/").pop() || "media",
              type: assetTypeForPath(path, blob.type),
              mime: blob.type || undefined,
              size: blob.size,
              uploadedAt: project.createdAt,
              dataUrl: await blobToDataUrl(blob),
            });
            ref.set(rewrapAsset(ref.value, id));
            embedded = true;
            break;
          }
        } catch {
          // Try next fallback URL.
        }
      }
      if (embedded) continue;
    }
    missing.add(ref.value);
  }

  const currentMissing = evaluateMissingMedia(project, folderFiles, publicPaths);
  currentMissing.forEach((item) => missing.add(item));
  delete story.assets;
  const audioClips = project.audioClips
    ? (JSON.parse(JSON.stringify(project.audioClips)) as AudioClip[])
    : undefined;
  return {
    story,
    ...(audioClips ? { audioClips } : {}),
    assets: [...assets.values()],
    missing: [...missing].sort(),
  };
}

function collectWritableRefs(story: StoryLike): WritableRef[] {
  const refs: WritableRef[] = [];
  const add = (target: AnyRecord, key: string) => {
    if (typeof target[key] === "string" && target[key]) {
      refs.push({ value: target[key], set: (value) => { target[key] = value; } });
    }
  };
  const visitCinematic = (cinematic: unknown) => {
    if (!cinematic || typeof cinematic !== "object") return;
    const effect = cinematic as AnyRecord;
    ["depthMap", "depthPlate", "foregroundImage"].forEach((key) => add(effect, key));
    for (const key of ["depthCutouts", "foregroundExtras", "parallaxLayers"]) {
      if (Array.isArray(effect[key])) effect[key].forEach((layer: AnyRecord) => add(layer, "image"));
    }
    const animation = effect.foregroundAnimation;
    if (animation && Array.isArray(animation.frames)) {
      animation.frames.forEach((value: unknown, index: number) => {
        if (typeof value === "string") refs.push({ value, set: (next) => { animation.frames[index] = next; } });
      });
    }
  };
  for (const scene of story.scenes) {
    add(scene, "background");
    add(scene, "musicUrl");
    add(scene, "sceneAudioUrl");
    add(scene, "narrationAudioUrl");
    visitCinematic(scene.cinematic);
    if (typeof scene.ambientAudio === "string") {
      const parts = scene.ambientAudio.split("+");
      parts.forEach((part: string, index: number) => {
        if (!part.startsWith("file:")) return;
        refs.push({ value: part.slice(5), set: (next) => { parts[index] = `file:${next}`; scene.ambientAudio = parts.join("+"); } });
      });
    }
    for (const beat of scene.dialogueBeats ?? []) {
      add(beat, "background");
      add(beat, "audioUrl");
      add(beat, "sfxUrl");
      visitCinematic(beat.cinematic);
    }
  }
  return refs;
}

function rewrapAsset(reference: string, id: string): string {
  if (reference.startsWith("video:")) return `video:asset:${id}`;
  if (reference.startsWith("mp3:")) return `mp3:asset:${id}`;
  if (reference.startsWith("file:")) return `file:asset:${id}`;
  return `asset:${id}`;
}

function assetTypeForPath(path: string, mime = ""): ProjectAsset["type"] {
  if (mime.startsWith("image/") || /\.(?:jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(path)) return "image";
  if (mime.startsWith("audio/") || /\.(?:mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) return "audio";
  if (mime.startsWith("video/") || /\.(?:mp4|webm|mov)$/i.test(path)) return "video";
  return "other";
}
