import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function resolveLocalMediaFile(relUrlPath: string): string | null {
  const roots = [
    process.env.SCARLETT_WITNESS_PUBLIC,
    path.resolve(__dirname, "public"),
    path.resolve(__dirname, "../scarlett-witness/public"),
    "/tmp/scarlett-witness/public",
    "/tmp/scarlett-witness-cache",
  ].filter((dir): dir is string => Boolean(dir));

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

function scarlettWitnessMediaPlugin(): Plugin {
  return {
    name: "scarlett-witness-media",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
          next();
          return;
        }
        const urlPath = req.url.split("?")[0];
        const ext = path.extname(urlPath).toLowerCase();
        if (!MEDIA_EXT_MIME[ext]) {
          next();
          return;
        }

        let filePath = resolveLocalMediaFile(urlPath);
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
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [scarlettWitnessMediaPlugin(), react(), tailwindcss(), viteSingleFile()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
