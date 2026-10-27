/**
 * Deploy-safe asset paths.
 *
 * Stories reference their media as root-absolute paths ("/img/bg-diner.jpg",
 * "/soundtrack.mp3"). That is correct at the site root, but a GitHub Pages
 * *project* site is served from a subdirectory — https://user.github.io/repo/ —
 * where "/img/..." resolves to the domain root and 404s. Vite rewrites the
 * paths it can see at build time (imports, index.html), but story media lives
 * in plain data strings it never touches.
 *
 * `assetUrl` closes that gap: it prefixes root-absolute paths with the app's
 * base URL. Everything else — data URLs, blob URLs, http(s), gradients, and
 * paths that are already based — passes through untouched, so it is safe to
 * call on any media value, including one that has already been resolved from
 * IndexedDB.
 */

/** Vite's configured base, always with a trailing slash ("/" when at root).
 *  Optional-chained so the module also initialises under plain Node (the
 *  engine test bundle), where `import.meta.env` doesn't exist. */
const BASE = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || "/").replace(/\/*$/, "/");

/** Prefix a root-absolute asset path with the deployment base path. */
export function assetUrl(url: string): string;
export function assetUrl(url: string | undefined): string | undefined;
export function assetUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  // Nothing to do when the app is served from the domain root.
  if (BASE === "/") return url;
  // Only root-absolute paths need rewriting. Protocol-relative ("//cdn/x"),
  // absolute URLs, data:/blob: payloads and relative paths are already fine.
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  // Don't double-prefix something that was already resolved.
  if (url.startsWith(BASE)) return url;
  return BASE + url.slice(1);
}

/** Resolve a background token that may carry a `video:` prefix. Gradients and
 * unresolved `asset:` references pass through so callers can keep switching on
 * them exactly as before. */
export function assetBackground(value: string): string {
  if (!value) return value;
  if (value.startsWith("gradient:") || value.startsWith("asset:")) return value;
  if (value.startsWith("video:")) {
    const inner = value.slice(6);
    return inner.startsWith("asset:") ? value : `video:${assetUrl(inner)}`;
  }
  return assetUrl(value);
}
