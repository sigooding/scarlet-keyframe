import type { ProjectAsset, ProjectState } from "./model";
import { assetIdFromReference, collectMediaReferences, unwrapMediaReference } from "./model";

export async function hashBlob(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of new Uint8Array(bytes)) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function createUploadAsset(file: File): Promise<ProjectAsset> {
  const id = `upload-${crypto.randomUUID()}`;
  const mime = file.type || mimeFromName(file.name);
  const type = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "other";
  const blob = file.slice(0, file.size, mime);
  const cleanName = file.name.replace(/[\\/]/g, "-");
  const stem = cleanName.replace(/\.[^.]+$/, "");
  const ext = /\.[^.]+$/.exec(cleanName)?.[0] || "";
  const name = `${stem}-${id.slice(-7)}${ext}`;
  const outputPath = type === "image" ? `/img/animatic/${name}` : `/audio/animatic/${name}`;
  const dimensions = type === "image" ? await imageDimensions(blob) : undefined;
  return {
    id,
    name,
    type,
    mime,
    size: file.size,
    uploadedAt: Date.now(),
    source: "upload",
    blob,
    byteHash: await hashBlob(blob),
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
    outputPath,
  };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Invalid media data URL.");
  const metadata = dataUrl.slice(0, separator);
  const mime = /^data:([^;,]+)/i.exec(metadata)?.[1] || "application/octet-stream";
  const payload = dataUrl.slice(separator + 1);
  const bytes = metadata.includes(";base64")
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function normalizeMediaPath(value: string): string {
  let path = value;
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { /* retain the source string */ }
  }
  path = path.replace(/^video:/i, "").replace(/^mp3:/i, "").replace(/^file:/i, "");
  path = path.replace(/[?#].*$/, "").replace(/\\/g, "/").replace(/^\/+/, "");
  path = path.replace(/^\.\//, "").replace(/^public\//, "");
  return path;
}

export function folderFilePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  let path = normalizeMediaPath(relative);
  if (path.startsWith("img/") || path.startsWith("audio/") || path.startsWith("sfx/") || path.startsWith("voice/") || path.startsWith("depth/")) {
    path = `film/${path}`;
  }
  return path;
}

export function referencedPath(value: string): string | undefined {
  const raw = unwrapMediaReference(value);
  if (!raw || /^(?:asset:|data:|blob:|gradient:|emoji:)/i.test(raw)) return undefined;
  if (/^https?:\/\//i.test(raw)) return undefined;
  return normalizeMediaPath(raw);
}

export function evaluateMissingMedia(
  project: ProjectState,
  folderFiles: Map<string, File>,
  publicPaths: Set<string>,
): string[] {
  const availableAssetIds = new Set(project.assets.map((asset) => asset.id));
  const refs = collectMediaReferences(project.story);
  const missing = new Set<string>();
  for (const ref of refs) {
    const id = assetIdFromReference(ref);
    if (id) {
      if (!availableAssetIds.has(id)) missing.add(`asset:${id}`);
      continue;
    }
    const path = referencedPath(ref);
    if (path && !folderFiles.has(path) && !publicPaths.has(path)) missing.add(ref);
  }
  for (const item of project.importedMissing) {
    const id = assetIdFromReference(item);
    const path = referencedPath(item);
    if (id && !availableAssetIds.has(id)) missing.add(item);
    else if (path && !folderFiles.has(path) && !publicPaths.has(path)) missing.add(item);
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}

export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const mime: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", mp4: "video/mp4", webm: "video/webm",
  };
  return mime[ext || ""] || "application/octet-stream";
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  if (typeof createImageBitmap !== "function") return undefined;
  try {
    const bitmap = await createImageBitmap(blob);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return undefined;
  }
}
