import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";

/**
 * The MP4 export API (`/__api/export/*`).
 *
 * It is served by BOTH the development server (`npm run dev`) and the
 * production preview server (`npm run serve`). The exporter renders frames in
 * headless Chromium against whichever server started the job, so the render
 * page is the dev page under `npm run dev` and the production build under
 * `npm run serve`.
 */

export interface Mp4ExportOptions {
  /** Repository root, used for `scripts/export-mp4.mjs` and the `exports/` folder. */
  repoRoot: string;
  /** Base URL (no trailing slash) that headless Chromium opens to render frames. */
  resolveServerUrl: () => string;
}

export interface ExportJob {
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

const exportJobs = new Map<string, ExportJob>();

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createMp4ExportMiddleware(options: Mp4ExportOptions): Connect.NextHandleFunction {
  return async (req, res, next) => {
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
        const capture =
          body.capture === "jpeg" || body.capture === "png" ? body.capture : "auto";
        const workers = Math.max(1, Math.min(6, Math.round(Number(body.workers) || 1)));
        const gpu = body.gpu !== false;
        const encoder =
          typeof body.encoder === "string" && body.encoder.trim()
            ? body.encoder.trim()
            : "auto";
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
const devServerUrl = options.resolveServerUrl();

        const job: ExportJob = {
          id: jobId,
          status: "running",
          completedFrames: 0,
          totalFrames: toFrame - fromFrame + 1,
          percent: 1,
          phase: gpu
            ? "Starting GPU-accelerated Chromium & ffmpeg…"
            : "Starting headless Chromium & ffmpeg (CPU)…",
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

        const scriptPath = path.join(options.repoRoot, "scripts", "export-mp4.mjs");
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
          path.join(options.repoRoot, "exports"),
          "--name",
          baseName,
          "--quality",
          quality,
          ...(capture === "auto" ? [] : ["--capture", capture]),
          "--workers",
          String(workers),
          gpu ? "--gpu" : "--no-gpu",
          ...(encoder !== "auto" ? ["--encoder", encoder] : []),
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
          cwd: options.repoRoot,
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
  };
}

type AddressableServer = { address: () => { port: number } | string | null };

function serverUrlFromHttpServer(
  httpServer: AddressableServer | null | undefined,
  fallbackPort: number,
): string {
  const address = httpServer?.address();
  const port = typeof address === "object" && address ? address.port : fallbackPort;
  return `http://127.0.0.1:${port}`;
}

/** Registers the export API on `npm run dev` and on `npm run serve` alike. */
export function mp4ExportApiPlugin({ repoRoot }: { repoRoot: string }): Plugin {
  return {
    name: "frame24-mp4-export-api",
    configureServer(server) {
      server.middlewares.use(
        createMp4ExportMiddleware({
          repoRoot,
          resolveServerUrl: () => serverUrlFromHttpServer(server.httpServer, 5173),
        }),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        createMp4ExportMiddleware({
          repoRoot,
          resolveServerUrl: () => serverUrlFromHttpServer(server.httpServer, 4173),
        }),
      );
    },
  };
}
