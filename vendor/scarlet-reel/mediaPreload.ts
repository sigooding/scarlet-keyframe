import { assetUrl } from "./assetPath";
import { resolveAssetReference } from "./data/mediaLibrary";

export const PRELOAD_LIMITS = { images: 8, audio: 6 } as const;
type MediaKind = "image" | "audio";
type Entry = {
  url?: string;
  element?: HTMLImageElement | HTMLAudioElement;
  ready: Promise<void>;
  cancel: () => void;
};

/** Small, disposable LRU of decoded plates and *unplayed* voice elements.
 * No AudioContext, play(), TTS, video, or remote generation is involved.
 * Playback takes ownership of a warmed element, including an in-flight load,
 * instead of constructing a second decoder on the scene boundary. */
export class MediaPreloader {
  private images = new Map<string, Entry>();
  private clips = new Map<string, Entry>();

  constructor(
    private resolve: (value: string) => Promise<string | undefined> = resolveAssetReference,
    private limits: { images: number; audio: number } = PRELOAD_LIMITS,
  ) {}

  warmImage(value?: string): Promise<void> { return this.warm("image", value); }
  warmAudio(value?: string): Promise<void> { return this.warm("audio", value); }

  private warm(kind: MediaKind, value?: string): Promise<void> {
    if (!value || /^(gradient:|video:|emoji:)/i.test(value)) return Promise.resolve();
    if (kind === "image" && /^data:(audio|video)\//i.test(value)) return Promise.resolve();
    if (kind === "audio" && /^data:(image|video)\//i.test(value)) return Promise.resolve();
    const cache = kind === "image" ? this.images : this.clips;
    const key = assetUrl(value);
    const existing = cache.get(key);
    if (existing) {
      cache.delete(key);
      cache.set(key, existing);
      return existing.ready;
    }
    const limit = kind === "image" ? this.limits.images : this.limits.audio;
    if (limit <= 0) return Promise.resolve();
    while (cache.size >= limit) {
      const oldest = cache.entries().next().value;
      if (!oldest) break;
      cache.delete(oldest[0]);
      oldest[1].cancel();
    }

    let cancelled = false;
    let settle: () => void = () => {};
    let detach: () => void = () => {};
    const entry: Entry = {
      ready: new Promise<void>((done) => { settle = done; }),
      cancel: () => {
        cancelled = true;
        detach();
        const el = entry.element;
        if (el) {
          // A consumed audio element is removed from this cache, so this can
          // never pause the current line or abort its download.
          if (kind === "audio") (el as HTMLAudioElement).pause();
          el.removeAttribute?.("src");
          if (kind === "audio") (el as HTMLAudioElement).load();
        }
        settle();
      },
    };
    cache.set(key, entry); // Reserve *before* awaiting IndexedDB (dedup races).
    const failed = () => {
      if (cache.get(key) === entry) { cache.delete(key); entry.cancel(); }
      else { detach(); settle(); }
    };
    const prepare = (resolved?: string) => {
      if (cancelled) { settle(); return; }
      if (!resolved || /^(asset:|video:|gradient:|emoji:)/i.test(resolved)) { failed(); return; }
      entry.url = assetUrl(resolved);
      try {
        if (kind === "image") {
          const img = new Image();
          entry.element = img;
          img.decoding = "async";
          img.fetchPriority = "low";
          const done = () => {
            detach();
            if (typeof img.decode === "function") void img.decode().catch(() => {}).then(settle);
            else settle();
          };
          img.onload = done;
          img.onerror = failed;
          detach = () => { img.onload = null; img.onerror = null; };
          img.src = entry.url;
          if (img.complete && img.naturalWidth > 0) done();
        } else {
          const el = new Audio();
          entry.element = el;
          const done = () => { detach(); settle(); };
          el.preload = "auto";
          el.addEventListener("loadeddata", done);
          el.addEventListener("error", failed);
          detach = () => {
            el.removeEventListener("loadeddata", done);
            el.removeEventListener("error", failed);
          };
          el.src = entry.url;
          el.load(); // Fetch only. Never unlock audio or start a silent clip.
          if (el.readyState >= 2) done();
        }
      } catch {
        failed(); // Speculation is best-effort; never hold up navigation.
      }
    };
    if (key.startsWith("asset:")) void this.resolve(key).then(prepare, failed);
    else prepare(key);
    return entry.ready;
  }

  takeAudio(value: string): HTMLAudioElement | undefined {
    const url = assetUrl(value);
    for (const [key, entry] of this.clips) {
      if ((key === url || entry.url === url) && entry.element) {
        this.clips.delete(key);
        // The load's listeners settle its ready promise naturally. Ownership
        // has transferred: clear()/eviction must not touch this element now.
        return entry.element as HTMLAudioElement;
      }
    }
    return undefined;
  }

  clear(): void {
    for (const entry of [...this.images.values(), ...this.clips.values()]) entry.cancel();
    this.images.clear();
    this.clips.clear();
  }
}

export const mediaPreloader = new MediaPreloader();

/** Respect an explicit data-saving preference and very slow connections. */
export function shouldPreloadMedia(): boolean {
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}
