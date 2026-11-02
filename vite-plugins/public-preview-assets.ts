import fs from "node:fs";
import path from "node:path";
import sirv from "sirv";
import type { Plugin } from "vite";

/**
 * Serves the repository's `public/` folder in `vite preview` (`npm run serve`)
 * without copying it into the build output.
 *
 * `npm run serve` builds with `build.copyPublicDir: false`, because duplicating
 * 1.7 GB of film pictures, depth maps and audio into `dist-local/` costs ~20 s
 * on every build and gains nothing: the files are read-only reference media.
 * The preview server therefore hands anything it did not build (the app's own
 * JS/CSS/index.html) to sirv, which understands:
 *
 * - `Range: bytes=…` (206 Partial Content), which audio seeking and video need;
 * - `ETag` / `If-None-Match` (304), so a reload does not re-download pictures;
 * - long `Cache-Control` lifetimes for film pictures, depth maps and audio.
 */

/** Film pictures, depth maps, audio and reference plates rarely change. */
const LONG_CACHE = "public, max-age=2592000";

/** Everything else in public/ (manuals, example files) is not build output. */
const SHORT_CACHE = "public, max-age=300";

const MEDIA_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".mp4",
  ".webm",
]);

const LONG_CACHE_PREFIXES = [
  /^\/film\/(img|audio|voice|depth|video|sfx|review)\//i,
  /^\/img\//i,
  /^\/sweet-jesus\//i,
  /^\/miami-vice\//i,
  /^\/reels\//i,
  /^\/audio\//i,
  /^\/fonts\//i,
];

function cacheControlFor(pathname: string): string {
  return LONG_CACHE_PREFIXES.some((prefix) => prefix.test(pathname)) ? LONG_CACHE : SHORT_CACHE;
}

function isSeekableMedia(pathname: string): boolean {
  return MEDIA_EXTENSIONS.has(path.extname(pathname).toLowerCase());
}

function isPublicFile(publicDir: string, urlPath: string): boolean {
  const root = path.resolve(publicDir);
  const resolved = path.resolve(root, `.${urlPath}`);
  if (!resolved.startsWith(root + path.sep)) return false;
  try {
    return fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * sirv decodes `%20` into a space, like the dev server's media plugin does.
 * A few legacy film assets *literally* contain a percent escape in their file
 * name, so the decoded name does not exist while the still-encoded name does.
 * Re-encode such a request (sirv decodes it back to the literal name) so sirv
 * can still do the range and ETag work.
 */
function requestPathMatchingDisk(publicDir: string, urlPath: string): string {
  if (!urlPath.includes("%")) return urlPath;
  const segments = urlPath.split("/").filter(Boolean);
  const decoded = `/${segments.map(safeDecodeSegment).join("/")}`;
  if (isPublicFile(publicDir, decoded)) return urlPath;
  // sirv decodes the path; only the still-encoded name exists on disk.
  const raw = `/${segments.join("/")}`;
  if (!isPublicFile(publicDir, raw)) return urlPath;
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export interface PublicPreviewAssetsOptions {
  /** Absolute path to the repository's `public/` folder. */
  publicDir: string;
}

export function publicPreviewAssetsPlugin({ publicDir }: PublicPreviewAssetsOptions): Plugin {
  return {
    name: "scarlet-public-preview-assets",
    configurePreviewServer(server) {
      const servePublic = sirv(publicDir, {
        dev: true,
        etag: true,
        setHeaders(res, pathname) {
          res.setHeader("Cache-Control", cacheControlFor(pathname));
          if (isSeekableMedia(pathname)) res.setHeader("Accept-Ranges", "bytes");
        },
      });

      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }
        const rawUrl = req.url || "/";
        const urlPath = rawUrl.split("?")[0].split("#")[0];
        if (!urlPath || urlPath === "/" || urlPath.startsWith("/__api/")) {
          next();
          return;
        }
        const matchedPath = requestPathMatchingDisk(publicDir, urlPath);
        if (matchedPath !== urlPath) req.url = rawUrl.replace(urlPath, matchedPath);
        servePublic(req, res, next);
      });
    },
  };
}
