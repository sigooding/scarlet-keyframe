/**
 * Where the editor saves its work.
 *
 * Projects live in this browser's IndexedDB, which is scoped to the exact
 * origin (scheme + host + port). Two addresses are two separate libraries:
 * `http://127.0.0.1:5173` (dev), `http://127.0.0.1:4173` (production serve) and
 * a page opened from disk (`file:`) never see each other's saves. The app says
 * which address it is saving to, so a missing project is never a mystery.
 */

/** The parts of `window.location` these helpers read. */
export interface SaveLocationLike {
  protocol: string;
  origin?: string;
}

function currentLocation(): SaveLocationLike | undefined {
  if (typeof window === "undefined" || !window.location) return undefined;
  return window.location;
}

/** The address these saves belong to, for example `http://127.0.0.1:4173`. */
export function currentSaveOrigin(location: SaveLocationLike | undefined = currentLocation()): string {
  if (!location) return "";
  if (location.protocol === "file:") return "this file";
  return location.origin || "";
}

/** Status text after a save, for example `Saved in this browser for http://127.0.0.1:4173`. */
export function savedStatusText(origin: string = currentSaveOrigin()): string {
  return origin ? `Saved in this browser for ${origin}` : "Saved in this browser";
}

/** The Save button's tooltip: the same promise, plus the keyboard shortcut. */
export function saveButtonTitle(
  origin: string = currentSaveOrigin(),
  shortcut = "Ctrl/Cmd+S",
): string {
  return `${savedStatusText(origin)} (${shortcut})`;
}

/** True when the editor was opened straight from disk instead of from a server. */
export function isOpenedFromFile(location: SaveLocationLike | undefined = currentLocation()): boolean {
  return location?.protocol === "file:";
}

/** One-line warning that a file: page keeps its own separate saves. */
export function fileSaveWarning(serverOrigin = "http://127.0.0.1:4173"): string {
  return `Opened from a file: saves here are separate from the ones at ${serverOrigin} — use npm run serve.`;
}
