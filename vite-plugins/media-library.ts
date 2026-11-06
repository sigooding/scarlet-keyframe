import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin } from "vite";

/**
 * Media library for the editor: film pictures, depth maps, voice takes, music
 * and sound effects.
 *
 * Files are looked up in the repository's `public/` folder first (and in a few
 * neighbouring locations for Nobody's Witness), then fetched once from the
 * Scarlett Reel repository and cached. The production preview server
 * (`npm run serve`) serves `public/` itself through sirv, so this plugin is
 * registered there too as the fallback for those other roots.
 */

const MEDIA_EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export interface MediaLibraryOptions {
  /** Repository root, so `public/` resolves the same way in dev and preview. */
  repoRoot: string;
}

/** Everywhere a film picture, depth map or sound may be read from, in the order they win. */
function mediaRoots(repoRoot: string): string[] {
  return [
    process.env.SCARLETT_WITNESS_PUBLIC,
    path.join(repoRoot, "public"),
    path.resolve(repoRoot, "..", "scarlett-witness", "public"),
    "/tmp/scarlett-witness/public",
    "/tmp/scarlett-witness-cache",
  ].filter((dir): dir is string => Boolean(dir));
}

/**
 * The editor only offers a picture whose path it knows, and that list used to be two files written by a script:
 * `src/data/media-index.json`, baked into the build, and `public/examples/media-index.json`, fetched at startup. A
 * picture added after the last build was therefore invisible under `npm run serve` while `npm run dev` (which reads
 * the first file from disk every time) showed it — and a picture in neither file was invisible in both.
 *
 * So the servers answer that fetch from the disk instead: everything under the media roots, as it is right now. A
 * scan of ~8,000 files takes about 10 ms, and the answer is cached for a moment because the page asks once at
 * startup and the depth API asks again after it writes.
 */
export const MEDIA_INDEX_PATH = "/examples/media-index.json";
const SCAN_CACHE_MS = 2000;
let scanCache: { at: number; key: string; paths: string[] } | null = null;

function walkMedia(root: string, out: Set<string>): void {
  const stack: Array<{ dir: string; rel: string }> = [{ dir: root, rel: "" }];
  while (stack.length) {
    const here = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(here.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = `${here.rel}/${entry.name}`;
      if (entry.isDirectory()) {
        stack.push({ dir: path.join(here.dir, entry.name), rel });
      } else if (entry.isFile() && MEDIA_EXT_MIME[path.extname(entry.name).toLowerCase()]) {
        out.add(rel);
      }
    }
  }
}

/** Every media file the servers can hand over, as site paths (`/film/img/s1/01-backstreet.jpg`). */
export function scanMediaPaths(repoRoot: string, now = Date.now()): string[] {
  const roots = mediaRoots(repoRoot);
  const key = roots.join("|");
  if (scanCache && scanCache.key === key && now - scanCache.at < SCAN_CACHE_MS) return scanCache.paths;
  const found = new Set<string>();
  for (const root of roots) walkMedia(path.resolve(root), found);
  const paths = [...found].sort();
  scanCache = { at: now, key, paths };
  return paths;
}

/** Forgets the cached scan, so the next request walks the disk again (a new file has just been written). */
export function forgetMediaScan(): void {
  scanCache = null;
}

function resolveLocalMediaFile(repoRoot: string, relUrlPath: string): string | null {
  const roots = mediaRoots(repoRoot);

  let decoded = relUrlPath;
  try {
    decoded = decodeURIComponent(relUrlPath);
  } catch {
    /* keep raw */
  }
  const candidates = decoded === relUrlPath ? [relUrlPath] : [decoded, relUrlPath];

  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    for (const candidate of candidates) {
      const target = path.resolve(resolvedRoot, candidate.replace(/^\/+/, ""));
      if (!target.startsWith(resolvedRoot + path.sep)) continue;
      try {
        const stat = fs.statSync(target);
        if (stat.isFile()) return target;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

async function fetchFromGithubWitness(relUrlPath: string): Promise<string | null> {
  let decoded = relUrlPath.replace(/^\/+/, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }
  const cacheRoot = "/tmp/scarlett-witness-cache";
  const cacheFile = path.resolve(cacheRoot, decoded);
  if (!cacheFile.startsWith(cacheRoot + path.sep)) return null;

  const encodedSegments = decoded
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  const urls = [
    `https://raw.githubusercontent.com/sigooding/scarlett-witness/main/public/${encodedSegments}`,
    `https://api.github.com/repos/sigooding/scarlett-witness/contents/public/${encodedSegments}?ref=main`,
  ];

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  for (const url of urls) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "scarlet-keyframe-dev",
      };
      if (url.includes("api.github.com")) {
        headers.Accept = "application/vnd.github.raw";
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, bytes);
      return cacheFile;
    } catch {
      /* try next fallback */
    }
  }
  return null;
}

export function createMediaLibraryMiddleware({ repoRoot }: MediaLibraryOptions): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
      next();
      return;
    }
    const urlPath = req.url.split("?")[0];
    if (urlPath === MEDIA_INDEX_PATH) {
      const body = JSON.stringify(scanMediaPaths(repoRoot));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      // What is on disk changes while the editor is open (a depth map is made, a retake is installed).
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", Buffer.byteLength(body));
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    const ext = path.extname(urlPath).toLowerCase();
    if (!MEDIA_EXT_MIME[ext]) {
      next();
      return;
    }

    let filePath = resolveLocalMediaFile(repoRoot, urlPath);
    if (!filePath) {
      filePath = await fetchFromGithubWitness(urlPath);
    }
    if (!filePath) {
      next();
      return;
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const mime = MEDIA_EXT_MIME[ext] || "application/octet-stream";

    res.setHeader("Content-Type", mime);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const range = req.headers.range;
    if (range && range.startsWith("bytes=")) {
      const [startStr, endStr] = range.slice(6).split("-");
      const start = Number.parseInt(startStr, 10);
      const end = endStr ? Math.min(total - 1, Number.parseInt(endStr, 10)) : total - 1;
      if (Number.isFinite(start) && start >= 0 && start < total && end >= start) {
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Content-Length", end - start + 1);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Length", total);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  };
}

export function mediaLibraryPlugin(options: MediaLibraryOptions): Plugin {
  return {
    name: "scarlett-witness-media",
    configureServer(server) {
      server.middlewares.use(createMediaLibraryMiddleware(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMediaLibraryMiddleware(options));
    },
  };
}
