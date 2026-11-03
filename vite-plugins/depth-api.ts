import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";
import type { DepthApiError, DepthJobStatus, DepthJobView, DepthMakeResult, DepthReady } from "../src/core/depthApiTypes";
import {
  PICTURE_ROOT,
  RESULT_MARKER,
  UserError,
  depthMapRefFor,
  fileForRef,
  findPython,
  parseResultLine,
  pngSize,
  pythonHasGpu,
  pythonHasPackages,
  resolvePicture,
} from "../scripts/depth/lib.mjs";
import { DEFAULT_MODEL, MODELS, modelCacheDir } from "../scripts/depth/models.mjs";

/**
 * The depth-map API (`/__api/depth/*`) behind the editor's "Make depth map" button.
 *
 * The browser cannot run Python, so the button asks this server, which runs the same command a person would
 * (`npm run depth -- <picture> --json`, scripts/make-depth.mjs) and reports how it is going. Like the MP4 export API it
 * is served by BOTH `npm run dev` and `npm run serve`. A page opened from disk (`file:`) has no server, so there the
 * button explains that it needs one.
 *
 *   GET  /__api/depth/ready    what this computer can do: Python, its packages, the GPU, the model on disk
 *   POST /__api/depth/make     { picture: "/film/img/..jpg" }  -> the map being made (or already there)
 *   GET  /__api/depth/status   ?id=...                          -> how it is going
 *   POST /__api/depth/cancel   { id }
 *
 * It starts a program, so it only answers requests that really come from this page: the Host header must be this
 * computer (or the address you chose with SCARLET_KEYFRAME_HOST), a browser's Origin must be the same, and a POST must
 * be JSON (which another website cannot send without a permission this server never gives). Only pictures under
 * /film/img/ are accepted, and the picture is passed to the command only after it was resolved to a file under public/.
 * One map is made at a time; the command never overwrites a map (it asks for --replace for that, which this API does
 * not offer).
 */

export interface DepthCapabilities {
  python: string | null;
  packages: boolean;
  gpu: boolean;
}

export interface DepthApiOptions {
  /** Repository root: where scripts/make-depth.mjs and the Python environment (.depth-venv) are. */
  repoRoot: string;
  /** The public/ folder the command reads pictures from and writes maps to. Default: <repoRoot>/public. */
  publicDir?: string;
  /** The command that makes the map. Default: <repoRoot>/scripts/make-depth.mjs (tests give a stand-in). */
  cliPath?: string;
  /** A Depth Anything V2 .onnx file to use instead of the downloaded model (SCARLET_KEYFRAME_DEPTH_MODEL_FILE). */
  modelFile?: string;
  /** What this computer can do. Default: ask Python. Tests replace it. */
  probe?: () => DepthCapabilities;
  /** Host names besides this computer that may call the API (the address chosen with SCARLET_KEYFRAME_HOST). */
  allowedHosts?: string[];
}

interface Job {
  id: string;
  picture: string;
  map: string;
  mapFile: string;
  status: DepthJobStatus;
  log: string[];
  percent: number | null;
  message: string | null;
  result: DepthMakeResult | null;
  startedAt: number;
  endedAt: number | null;
  child: ChildProcess | null;
  cancelRequested: boolean;
  timedOut: boolean;
  timer: NodeJS.Timeout | null;
}

const API = "/__api/depth/";
const MAX_BODY_BYTES = 4096;
const MAX_LOG_LINES = 80;
const MAX_LINE_CHARS = 240;
const SHOWN_LOG_LINES = 8;
const MAX_KEPT_JOBS = 20;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const CAPABILITY_TTL_MS = 30_000;
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];

function probeMachine(repoRoot: string): DepthCapabilities {
  const python = findPython({ repoRoot });
  if (!python) return { python: null, packages: false, gpu: false };
  const packages = pythonHasPackages(python);
  return { python: python.label, packages, gpu: packages ? pythonHasGpu(python) : false };
}

/** `127.0.0.1:5173` -> `127.0.0.1`, `[::1]:5173` -> `::1`. */
function hostnameOf(hostHeader: string | undefined): string {
  const host = String(hostHeader ?? "").trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(1, Math.max(1, host.indexOf("]")));
  return host.replace(/:\d+$/, "");
}

/** Why a request must be refused, or null when it may go on. */
function refusal(req: IncomingMessage, allowedHosts: Set<string>): { code: number; error: DepthApiError } | null {
  const forbidden = (message: string) => ({ code: 403, error: { error: "forbidden" as const, message } });
  if (!allowedHosts.has(hostnameOf(req.headers.host))) {
    return forbidden("The depth API only answers requests addressed to this computer.");
  }
  const origin = req.headers.origin;
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host.toLowerCase() === String(req.headers.host ?? "").toLowerCase();
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return forbidden("The depth API only answers requests from the editor page itself.");
  }
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") {
    return forbidden("The depth API only answers requests from the editor page itself.");
  }
  if (req.method === "POST") {
    const type = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!type.startsWith("application/json")) {
      return { code: 415, error: { error: "bad-request", message: "Send JSON (Content-Type: application/json)." } };
    }
  }
  return null;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      req.resume(); // let the rest go by, so the answer can be sent
      reject(new UserError("That request is too large."));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new UserError("That request is too large."));
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
        resolve(value as Record<string, unknown>);
      } catch {
        reject(new UserError("The request is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

/** Stops the command and the Python it started (a Python still running would write its map after "Cancel"). */
function killTree(child: ChildProcess | null) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

/** Splits a stream into lines (a progress meter may end its line with \r), keeping the unfinished one for next time. */
function lineSplitter(onLine: (line: string) => void) {
  let pending = "";
  return {
    write(chunk: Buffer) {
      pending += chunk.toString("utf8");
      const parts = pending.split(/\r\n|\n|\r/);
      pending = parts.pop() ?? "";
      for (const part of parts) onLine(part);
    },
    end() {
      if (pending) onLine(pending);
      pending = "";
    },
  };
}

export function createDepthMiddleware(options: DepthApiOptions): Connect.NextHandleFunction {
  const publicDir = path.resolve(options.publicDir ?? path.join(options.repoRoot, "public"));
  const publicDirIsOverridden = options.publicDir !== undefined;
  const cliPath = options.cliPath ?? path.join(options.repoRoot, "scripts", "make-depth.mjs");
  const probe = options.probe ?? (() => probeMachine(options.repoRoot));
  const allowedHosts = new Set([...LOOPBACK_HOSTS, ...(options.allowedHosts ?? []).map((host) => hostnameOf(host))]);
  const jobs = new Map<string, Job>();
  let capabilities: { at: number; value: DepthCapabilities } | null = null;

  const machine = (fresh = false): DepthCapabilities => {
    if (!fresh && capabilities && Date.now() - capabilities.at < CAPABILITY_TTL_MS) return capabilities.value;
    const value = probe();
    capabilities = { at: Date.now(), value };
    return value;
  };

  const runningJob = () => [...jobs.values()].find((job) => job.status === "running");

  const view = (job: Job): DepthJobView => ({
    id: job.id,
    status: job.status,
    picture: job.picture,
    map: job.map,
    percent: job.percent,
    log: job.log.slice(-SHOWN_LOG_LINES),
    message: job.message,
    result: job.result,
    elapsedMs: (job.endedAt ?? Date.now()) - job.startedAt,
  });

  const modelInfo = (): DepthReady["model"] => {
    if (options.modelFile) return { name: path.basename(options.modelFile), mb: 0, cached: fs.existsSync(options.modelFile), custom: true };
    const spec = MODELS[DEFAULT_MODEL];
    const file = path.join(modelCacheDir(), spec.file);
    let cached = false;
    try {
      cached = fs.statSync(file).size === spec.bytes;
    } catch {
      cached = false;
    }
    return { name: DEFAULT_MODEL, mb: Math.round(spec.bytes / 1_000_000), cached, custom: false };
  };

  /** Removes what a stopped command may have left behind in the map's folder: only its own temporary file. */
  const cleanUp = (job: Job) => {
    const folder = path.dirname(job.mapFile);
    try {
      for (const name of fs.readdirSync(folder)) {
        if (/^\.depth-\d+\.tmp\.png$/.test(name)) fs.rmSync(path.join(folder, name), { force: true });
      }
      if (!fs.existsSync(job.mapFile) && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder);
    } catch {
      /* nothing to clean */
    }
  };

  const prune = () => {
    const finished = [...jobs.values()].filter((job) => job.status !== "running").sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
    for (const job of finished.slice(0, Math.max(0, finished.length - MAX_KEPT_JOBS))) jobs.delete(job.id);
  };

  const finish = (job: Job, status: DepthJobStatus, message: string | null) => {
    if (job.status !== "running") return;
    job.status = status;
    job.message = message;
    job.endedAt = Date.now();
    if (job.timer) clearTimeout(job.timer);
    job.timer = null;
    job.child = null;
    if (status !== "done") cleanUp(job);
    prune();
  };

  const startJob = (picture: { ref: string }, map: string, mapFile: string, caps: DepthCapabilities): Job => {
    const job: Job = {
      id: crypto.randomUUID(),
      picture: picture.ref,
      map,
      mapFile,
      status: "running",
      log: [],
      percent: null,
      message: null,
      result: null,
      startedAt: Date.now(),
      endedAt: null,
      child: null,
      cancelRequested: false,
      timedOut: false,
      timer: null,
    };
    jobs.set(job.id, job);

    const args = [cliPath, picture.ref, "--json"];
    if (options.modelFile) args.push("--model-file", options.modelFile);
    if (caps.gpu) args.push("--gpu");

    const onLine = (raw: string) => {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) return;
      if (line.startsWith(RESULT_MARKER)) {
        const parsed = parseResultLine(line);
        if (parsed) job.result = parsed as DepthMakeResult;
        return;
      }
      const meter = /^\s*(\d{1,3})%/.exec(line);
      if (meter && Number(meter[1]) <= 100) job.percent = Number(meter[1]);
      job.log.push(line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line);
      if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
    };
    const out = lineSplitter(onLine);
    const err = lineSplitter(onLine);

    let child: ChildProcess;
    try {
      child = spawn(process.execPath, args, {
        cwd: options.repoRoot,
        env: { ...process.env, ...(publicDirIsOverridden ? { SCARLET_KEYFRAME_PUBLIC: publicDir } : {}) },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      finish(job, "error", `Could not start the depth command: ${error instanceof Error ? error.message : String(error)}`);
      return job;
    }
    job.child = child;
    job.timer = setTimeout(() => {
      job.timedOut = true;
      killTree(child);
    }, JOB_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => out.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.write(chunk));
    child.on("error", (error) => finish(job, "error", `Could not run the depth command: ${error.message}`));
    child.on("close", (code) => {
      out.end();
      err.end();
      if (job.cancelRequested) {
        finish(job, "cancelled", "Cancelled.");
      } else if (job.timedOut) {
        finish(job, "error", "It took longer than 15 minutes, so it was stopped.");
      } else if (code === 0 && job.result?.ok) {
        if (!fs.existsSync(mapFile)) {
          finish(job, "error", "The command finished but the map is not where it should be.");
        } else {
          const size = pngSize(mapFile);
          job.result = { ...job.result, map, ...(size ? { width: job.result.width ?? size.width, height: job.result.height ?? size.height } : {}) };
          job.percent = 100;
          finish(job, "done", null);
        }
      } else {
        const lastLine = [...job.log].reverse().find((line) => line.trim())?.trim();
        finish(job, "error", job.result?.message ?? lastLine ?? `The depth command stopped (exit code ${code}).`);
      }
    });
    return job;
  };

  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith(API)) {
      next();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (code: number, payload: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    };
    const sendError = (code: number, error: DepthApiError["error"], message: string, extra: Partial<DepthApiError> = {}) =>
      send(code, { error, message, ...extra } satisfies DepthApiError);

    const refused = refusal(req, allowedHosts);
    if (refused) {
      send(refused.code, refused.error);
      return;
    }

    try {
      const route = url.pathname.slice(API.length);

      if (route === "ready" && req.method === "GET") {
        const caps = machine(url.searchParams.get("fresh") === "1");
        send(200, { ok: true, ...caps, model: modelInfo(), busy: runningJob()?.id ?? null } satisfies DepthReady);
        return;
      }

      if (route === "make" && req.method === "POST") {
        const body = await readJsonBody(req);
        const asked = typeof body.picture === "string" ? body.picture.trim() : "";
        // Only a plain /film/img/... path: nothing that climbs (`..`), nothing with a backslash or a NUL. The command checks
        // this too (resolvePicture); this is the second lock on the door.
        if (!asked.startsWith(PICTURE_ROOT) || asked.includes("\\") || asked.includes("\0") || path.posix.normalize(asked) !== asked) {
          sendError(400, "bad-picture", "Depth maps can be made for pictures in public/film/img.");
          return;
        }
        let picture: { ref: string; file: string };
        try {
          picture = resolvePicture(asked, publicDir);
        } catch (error) {
          if (error instanceof UserError) {
            sendError(400, "bad-picture", error.message);
            return;
          }
          throw error;
        }
        const map = depthMapRefFor(picture.ref);
        const mapFile = fileForRef(publicDir, map);

        // A map made earlier is simply used: nothing to make, nothing to overwrite.
        if (fs.existsSync(mapFile)) {
          const size = pngSize(mapFile);
          send(200, {
            id: null,
            status: "done",
            picture: picture.ref,
            map,
            percent: 100,
            log: [],
            message: null,
            existing: true,
            result: { ok: true, existing: true, map, ...(size ?? {}) },
            elapsedMs: 0,
          } satisfies DepthJobView);
          return;
        }

        const running = runningJob();
        if (running) {
          if (running.picture === picture.ref) {
            send(200, view(running));
          } else {
            sendError(
              409,
              "busy",
              `Another depth map is being made (${path.basename(running.picture)}). Wait for it to finish, then try again.`,
              { id: running.id },
            );
          }
          return;
        }

        const caps = machine();
        if (!caps.python || !caps.packages) {
          sendError(412, "setup-needed", "One-time setup needed: run  npm run depth:setup  in the project folder, then try again.");
          return;
        }
        send(200, view(startJob(picture, map, mapFile, caps)));
        return;
      }

      if (route === "status" && req.method === "GET") {
        const job = jobs.get(url.searchParams.get("id") ?? "");
        if (!job) {
          sendError(404, "not-found", "No such depth map job (the server may have been restarted).");
          return;
        }
        send(200, view(job));
        return;
      }

      if (route === "cancel" && req.method === "POST") {
        const body = await readJsonBody(req);
        const job = jobs.get(typeof body.id === "string" ? body.id : "");
        if (!job) {
          sendError(404, "not-found", "No such depth map job.");
          return;
        }
        if (job.status === "running") {
          job.cancelRequested = true;
          killTree(job.child);
        }
        send(200, view(job));
        return;
      }

      sendError(404, "not-found", "No such depth API route.");
    } catch (error) {
      if (error instanceof UserError) {
        sendError(400, "bad-request", error.message);
        return;
      }
      sendError(500, "failed", error instanceof Error ? error.message : String(error));
    }
  };
}

/** Registers the depth API on `npm run dev` and on `npm run serve` alike. */
export function depthApiPlugin(options: DepthApiOptions): Plugin {
  return {
    name: "frame24-depth-api",
    configureServer(server) {
      server.middlewares.use(createDepthMiddleware(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDepthMiddleware(options));
    },
  };
}
