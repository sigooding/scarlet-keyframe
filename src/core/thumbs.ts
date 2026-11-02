/**
 * Small thumbnails for lists, lanes and tiles.
 *
 * The originals under `public/` are never changed: `npm run thumbs` writes
 * derived copies under `public/thumbs/` (mirroring the original path) plus
 * `public/thumbs/index.json`. This module reads that index once, lazily, and
 * answers `thumbFor(ref)`:
 *
 * - the thumbnail URL when the index lists the picture;
 * - otherwise the original ref, unchanged.
 *
 * Nothing here is required: without the index (or on a `file:` page, which has
 * no server) every picture keeps using its original. The viewer, the depth
 * camera, the preloader, MP4 export and the `.reel.json` bundle always call the
 * originals directly, never this module.
 */

/** Where the derived files live, relative to the served site root. */
export const THUMB_DIR = "/thumbs";

/** The list of thumbnails that exist. */
export const THUMB_INDEX_URL = `${THUMB_DIR}/index.json`;

const IMAGE_REF = /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i;
const NON_LOCAL_REF = /^(?:data:|blob:|https?:|asset:|gradient:|emoji:|synth:)/i;

type ThumbState = "idle" | "loading" | "ready" | "unavailable";

let state: ThumbState = "idle";
let listed: Set<string> = new Set();
let loadPromise: Promise<boolean> | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a listener must not break rendering */
    }
  }
}

/** Safely decode one URL path segment (`%20` -> space); keeps malformed input. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeSegment(segment));
  } catch {
    return segment;
  }
}

/**
 * The path part of a media reference, as `public/` stores it: no origin, no
 * query string or hash, leading `/`, literal characters (spaces, `%`).
 * Returns `undefined` for anything that is not a local file path.
 */
export function thumbKey(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const trimmed = ref.trim();
  if (!trimmed || NON_LOCAL_REF.test(trimmed)) return undefined;
  let withoutQuery = trimmed.split("#")[0].split("?")[0];
  if (!withoutQuery) return undefined;
  if (/^[a-z]+:\/\//i.test(withoutQuery)) return undefined;
  withoutQuery = withoutQuery.replace(/^\.\//, "").replace(/^public\//, "").replace(/^\/+/, "");
  if (!withoutQuery) return undefined;
  return `/${withoutQuery}`;
}

/**
 * The extensions a thumbnail may have been written with: a JPEG source keeps a
 * JPEG name, a picture with transparency becomes `.webp`.
 */
function extensionVariants(path: string): string[] {
  const match = /\.(jpe?g|png|webp|gif|avif|bmp)$/i.exec(path);
  if (!match) return [path];
  const base = path.slice(0, -match[0].length);
  const extension = match[0].toLowerCase();
  // A transparent source is written as WebP, a JPEG source as JPEG; try the
  // matching name first so two pictures that share a base name never swap.
  const ordered =
    extension === ".jpg" || extension === ".jpeg"
      ? [path, `${base}${extension}`, `${base}.jpg`, `${base}.jpeg`, `${base}.webp`]
      : [path, `${base}.webp`, `${base}.jpg`, `${base}.jpeg`];
  return ordered.filter((candidate, index, all) => all.indexOf(candidate) === index);
}

/** Every spelling of the ref that the index might list (encoded or not, either extension). */
function lookupCandidates(key: string): string[] {
  const decoded = `/${key.split("/").filter(Boolean).map(decodeSegment).join("/")}`;
  const candidates: string[] = [];
  for (const spelling of [key, decoded]) {
    for (const variant of extensionVariants(spelling)) {
      if (!candidates.includes(variant)) candidates.push(variant);
    }
  }
  return candidates;
}

/**
 * The thumbnail URL for a listed picture, or the original ref.
 *
 * Query strings are ignored when looking the picture up (`?v=2`), and a ref may
 * be percent-encoded or not (`%20` or a space): both are matched against the
 * index, which lists the on-disk path. Only paths the index actually lists are
 * returned, so no request ever 404s.
 */
export function thumbFor(ref: string): string;
export function thumbFor(ref: string | undefined): string | undefined;
export function thumbFor(ref: string | undefined): string | undefined {
  if (!ref) return ref;
  if (state !== "ready" || listed.size === 0) return ref;
  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    return ref;
  }
  const key = thumbKey(ref);
  if (!key) return ref;
  for (const candidate of lookupCandidates(key)) {
    if (!listed.has(candidate)) continue;
    return `${THUMB_DIR}/${candidate.split("/").filter(Boolean).map(encodeSegment).join("/")}`;
  }
  return ref;
}

/** True when the index is loaded and lists thumbnails. */
export function hasThumbIndex(): boolean {
  return state === "ready" && listed.size > 0;
}

export function thumbIndexState(): ThumbState {
  return state;
}

/** Calls `listener` whenever the index finishes loading (or fails). */
export function subscribeThumbIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parseIndex(payload: unknown): Set<string> {
  const files = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const key = thumbKey(value);
    if (key && IMAGE_REF.test(key)) files.add(key);
  };
  if (Array.isArray(payload)) {
    payload.forEach(add);
  } else if (payload && typeof payload === "object") {
    const record = payload as { files?: unknown; thumbs?: unknown };
    if (Array.isArray(record.files)) record.files.forEach(add);
    else if (Array.isArray(record.thumbs)) record.thumbs.forEach(add);
    else if (record.thumbs && typeof record.thumbs === "object") {
      Object.keys(record.thumbs as Record<string, unknown>).forEach(add);
    }
  }
  return files;
}

/**
 * Loads `public/thumbs/index.json` once. Resolves `true` when thumbnails can be
 * used. A missing file, a 404, invalid JSON or no `fetch` all mean "originals
 * only" — never an error the editor has to handle.
 */
export function loadThumbIndex(url: string = THUMB_INDEX_URL): Promise<boolean> {
  if (loadPromise) return loadPromise;
  if (typeof fetch !== "function") {
    state = "unavailable";
    return Promise.resolve(false);
  }
  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    // The single-file build has no server to ask; every picture is the original.
    state = "unavailable";
    return Promise.resolve(false);
  }
  state = "loading";
  loadPromise = fetch(url, { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`thumbnail index ${response.status}`);
      return (await response.json()) as unknown;
    })
    .then((payload) => {
      const files = parseIndex(payload);
      listed = files;
      state = files.size ? "ready" : "unavailable";
      notify();
      return state === "ready";
    })
    .catch(() => {
      listed = new Set();
      state = "unavailable";
      notify();
      return false;
    });
  return loadPromise;
}

/**
 * Waits (briefly) for the index so the first paint of the timeline and the
 * media bin already asks for thumbnails. Resolves either way.
 */
export function awaitThumbIndex(timeoutMs = 2500): Promise<boolean> {
  const load = loadThumbIndex();
  if (timeoutMs <= 0) return load;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(state === "ready"), timeoutMs);
    void load.finally(() => {
      clearTimeout(timer);
      resolve(state === "ready");
    });
  });
}

/** Test hook: forget the index so the next call fetches it again. */
export function __resetThumbIndex(): void {
  state = "idle";
  listed = new Set();
  loadPromise = undefined;
}
