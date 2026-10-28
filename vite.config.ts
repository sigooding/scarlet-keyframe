import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
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

interface DevExportJob {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  completedFrames: number;
  totalFrames: number;
  percent: number;
  phase: string;
  mp4Path: string | null;
  srtPath: string | null;
  error?: string;
  snapshot: unknown;
  child: ChildProcess | null;
  createdAt: number;
}

const exportJobs = new Map<string, DevExportJob>();

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function mp4ExportDevPlugin(): Plugin {
  return {
    name: "frame24-mp4-export-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/__api/export/")) {
          next();
          return;
        }

        const parsedUrl = new URL(req.url, "http://127.0.0.1");
        const pathname = parsedUrl.pathname;

        const sendJson = (code: number, payload: unknown) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(payload));
        };

        if (pathname === "/__api/export/register-cli" && req.method === "POST") {
          try {
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || "{}") as Record<string, any>;
            const jobId = crypto.randomUUID();
            exportJobs.set(jobId, {
              id: jobId,
              status: "running",
              completedFrames: 0,
              totalFrames: 1,
              percent: 0,
              phase: "CLI project registered",
              mp4Path: null,
              srtPath: null,
              snapshot: {
                cliProjectPayload: body.cliProjectPayload,
                cliSourceName: body.cliSourceName || "cli-project.json",
              },
              child: null,
              createdAt: Date.now(),
            });
            sendJson(200, { jobId });
          } catch (err) {
            sendJson(500, {
              error: err instanceof Error ? err.message : "Could not register CLI project",
            });
          }
          return;
        }

        if (pathname === "/__api/export/start" && req.method === "POST") {
          try {
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || "{}") as Record<string, any>;
            const fromFrame = Math.max(0, Math.round(Number(body.fromFrame) || 0));
            const toFrame = Math.max(fromFrame, Math.round(Number(body.toFrame) || fromFrame));
            const captions = body.captions !== false;
            const srt = body.srt !== false;
            const marks = Boolean(body.marks);
            const quality = body.quality === "draft" ? "draft" : "master";
            const workers = Math.max(1, Math.min(8, Math.round(Number(body.workers) || 1)));
            const normalize = Boolean(body.normalize);
            const loudnessTarget =
              body.loudnessTarget === "-16" || body.loudnessTarget === "-14" || body.loudnessTarget === "off"
                ? body.loudnessTarget
                : normalize
                  ? "-14"
                  : "off";
            const opticalPrintEq =
              body.opticalPrintEq === undefined ? undefined : Boolean(body.opticalPrintEq);
            const embedChapters = body.embedChapters !== false;
            const baseName = String(body.baseName || "animatic").replace(/[^a-zA-Z0-9._-]+/g, "-");

            const jobId = crypto.randomUUID();
            const addr = server.httpServer?.address();
            const port = typeof addr === "object" && addr ? addr.port : 5173;
            const devServerUrl = `http://127.0.0.1:${port}`;

            const job: DevExportJob = {
              id: jobId,
              status: "running",
              completedFrames: 0,
              totalFrames: toFrame - fromFrame + 1,
              percent: 1,
              phase: "Starting headless Chromium & ffmpeg…",
              mp4Path: null,
              srtPath: null,
              snapshot: {
                project: body.project,
                trackMix: body.trackMix,
                duckDepth: body.duckDepth,
              },
              child: null,
              createdAt: Date.now(),
            };
            exportJobs.set(jobId, job);

            const scriptPath = path.resolve(__dirname, "scripts/export-mp4.mjs");
            const args = [
              scriptPath,
              "--url",
              devServerUrl,
              "--job",
              jobId,
              "--from",
              String(fromFrame),
              "--to",
              String(toFrame),
              "--out",
              path.resolve(__dirname, "exports"),
              "--name",
              baseName,
              "--quality",
              quality,
              "--workers",
              String(workers),
              "--loudnorm",
              loudnessTarget,
              ...(opticalPrintEq === undefined
                ? []
                : [opticalPrintEq ? "--optical-eq" : "--no-optical-eq"]),
              embedChapters ? "--chapters" : "--no-chapters",
              captions ? "--captions" : "--no-captions",
              srt ? "--srt" : "--no-srt",
              marks ? "--marks" : "--no-marks",
              "--progress-json",
            ];

            const child = spawn(process.execPath, args, {
              cwd: __dirname,
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            });
            job.child = child;

            let stdoutBuf = "";
            let stderrBuf = "";
            child.stdout?.on("data", (chunk) => {
              stdoutBuf += chunk.toString("utf8");
              let nl = stdoutBuf.indexOf("\n");
              while (nl >= 0) {
                const line = stdoutBuf.slice(0, nl).trim();
                stdoutBuf = stdoutBuf.slice(nl + 1);
                nl = stdoutBuf.indexOf("\n");
                if (!line) continue;
                try {
                  const evt = JSON.parse(line) as Record<string, any>;
                  if (job.status === "cancelled") continue;
                  if (evt.type === "progress") {
                    if (typeof evt.completedFrames === "number") job.completedFrames = evt.completedFrames;
                    if (typeof evt.totalFrames === "number") job.totalFrames = evt.totalFrames;
                    if (typeof evt.percent === "number") job.percent = evt.percent;
                    if (typeof evt.phase === "string") job.phase = evt.phase;
                  } else if (evt.type === "done") {
                    job.status = "done";
                    job.completedFrames = evt.totalFrames ?? job.totalFrames;
                    job.percent = 100;
                    job.phase = "Complete";
                    job.mp4Path = evt.mp4Path || null;
                    job.srtPath = evt.srtPath || null;
                    // Free snapshot memory once render finishes
                    job.snapshot = null;
                  } else if (evt.type === "error") {
                    job.status = "error";
                    job.phase = "Error";
                    job.error = String(evt.error || "Export failed");
                    job.snapshot = null;
                  }
                } catch {
                  // ignore non-json stdout line
                }
              }
            });

            child.stderr?.on("data", (chunk) => {
              stderrBuf += chunk.toString("utf8");
              if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
            });

            child.on("close", (code) => {
              job.child = null;
              if (job.status === "running") {
                if (code === 0 && job.mp4Path) {
                  job.status = "done";
                  job.percent = 100;
                  job.phase = "Complete";
                } else {
                  job.status = "error";
                  job.phase = "Error";
                  job.error = stderrBuf.trim() || `Exporter exited with code ${code}`;
                }
                job.snapshot = null;
              }
            });

            sendJson(200, { jobId });
          } catch (err) {
            sendJson(500, {
              error: err instanceof Error ? err.message : "Could not start export job",
            });
          }
          return;
        }

        if (pathname === "/__api/export/project" && req.method === "GET") {
          const id = parsedUrl.searchParams.get("id") || "";
          const job = exportJobs.get(id);
          if (!job || !job.snapshot) {
            sendJson(404, { error: "Job snapshot not found" });
            return;
          }
          sendJson(200, job.snapshot);
          return;
        }

        if (pathname === "/__api/export/status" && req.method === "GET") {
          const id = parsedUrl.searchParams.get("id") || "";
          const job = exportJobs.get(id);
          if (!job) {
            sendJson(404, { error: "Job not found" });
            return;
          }
          const mp4FileName = job.mp4Path ? path.basename(job.mp4Path) : undefined;
          const srtFileName = job.srtPath ? path.basename(job.srtPath) : undefined;
          sendJson(200, {
            id: job.id,
            status: job.status,
            completedFrames: job.completedFrames,
            totalFrames: job.totalFrames,
            percent: job.percent,
            phase: job.phase,
            mp4Url:
              job.status === "done" && job.mp4Path && fs.existsSync(job.mp4Path)
                ? `/__api/export/download?id=${encodeURIComponent(job.id)}&kind=mp4`
                : undefined,
            srtUrl:
              job.status === "done" && job.srtPath && fs.existsSync(job.srtPath)
                ? `/__api/export/download?id=${encodeURIComponent(job.id)}&kind=srt`
                : undefined,
            fileName: mp4FileName,
            srtFileName,
            error: job.error,
          });
          return;
        }

        if (pathname === "/__api/export/cancel" && req.method === "POST") {
          try {
            const rawBody = await readRequestBody(req);
            const body = JSON.parse(rawBody || "{}") as Record<string, any>;
            const id = String(body.id || "");
            const job = exportJobs.get(id);
            if (job) {
              job.status = "cancelled";
              job.phase = "Cancelled";
              job.snapshot = null;
              const proc = job.child;
              job.child = null;
              if (proc && !proc.killed) {
                try {
                  proc.kill("SIGTERM");
                } catch {
                  // ignore
                }
                setTimeout(() => {
                  try {
                    if (!proc.killed) proc.kill("SIGKILL");
                  } catch {
                    // ignore
                  }
                }, 1200);
              }
            }
            sendJson(200, { ok: true });
          } catch (err) {
            sendJson(500, { error: err instanceof Error ? err.message : "Cancel failed" });
          }
          return;
        }

        if (pathname === "/__api/export/download" && req.method === "GET") {
          const id = parsedUrl.searchParams.get("id") || "";
          const kind = parsedUrl.searchParams.get("kind") === "srt" ? "srt" : "mp4";
          const job = exportJobs.get(id);
          const targetPath = kind === "srt" ? job?.srtPath : job?.mp4Path;
          if (!targetPath || !fs.existsSync(targetPath)) {
            sendJson(404, { error: "Exported file not found" });
            return;
          }
          const stat = fs.statSync(targetPath);
          const fileName = path.basename(targetPath);
          res.statusCode = 200;
          res.setHeader(
            "Content-Type",
            kind === "srt" ? "text/plain; charset=utf-8" : "video/mp4",
          );
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
          fs.createReadStream(targetPath).pipe(res);
          return;
        }

        sendJson(404, { error: "Unknown export endpoint" });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [mp4ExportDevPlugin(), scarlettWitnessMediaPlugin(), react(), tailwindcss(), viteSingleFile()],
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
