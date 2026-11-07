import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { forgetMediaScan } from "./media-library";
import type { Connect, Plugin } from "vite";
import type {
  DepthApiError,
  DepthJobKind,
  DepthJobStatus,
  DepthJobView,
  DepthMakeResult,
  DepthQuality,
  DepthFiles,
  DepthReady,
  ModelRole,
  ModelStatus,
} from "../src/core/depthApiTypes";
import { modelIsCached } from "../scripts/depth/download.mjs";
import {
  PICTURE_ROOT,
  RESULT_MARKER,
  UserError,
  depthMapRefFor,
  fileForRef,
  findPython,
  parseResultLine,
  pngSize,
  gpuStatus,
  pythonHasPackages,
  resolvePicture,
  resolveSourceMap,
} from "../scripts/depth/lib.mjs";
import { ALL_MODELS, DEFAULT_QUALITY, QUALITIES, modelCacheDir, modelIdsFor } from "../scripts/depth/models.mjs";

/**
 * The depth API (`/__api/depth/*`) behind the editor's "Make depth map" and "Make cutouts" buttons and its model downloads.
 *
 * The browser cannot run Python, so the buttons ask this server, which runs the same commands a person would
 * (`npm run depth`, `npm run cutouts`, `npm run models`, all with --json) and reports how they are going. Like the MP4
 * export API it is served by BOTH `npm run dev` and `npm run serve`. A page opened from disk (`file:`) has no server, so
 * there the buttons explain that they need one.
 *
 *   GET  /__api/depth/ready            what this computer can do: Python, its packages, the GPU, every model and whether it is here
 *   POST /__api/depth/make             { picture, quality? }                  -> a depth map being made (or already there)
 *   POST /__api/depth/cutouts          { picture, quality?, sourceMap? }      -> the cut-outs of the picture's people
 *   POST /__api/depth/models/download  { ids? , quality? }                    -> models being downloaded
 *   GET  /__api/depth/status           ?id=...                                -> how a job is going
 *   POST /__api/depth/cancel           { id }
 *
 * They start programs, so the API only answers requests that really come from this page: the Host header must be this
 * computer (or the address you chose with SCARLET_KEYFRAME_HOST), a browser's Origin must be the same, and a POST must be
 * JSON (which another website cannot send without a permission this server never gives). Only plain /film/img/ pictures
 * (and /film/depth/ maps) are accepted, and a path is passed on only after it was resolved to a file under public/. One job
 * runs at a time. Nothing is ever overwritten: a depth map is never replaced, and each cut-out run gets a new folder.
 */

export interface DepthCapabilities {
  python: string | null;
  packages: boolean;
  /** onnxruntime can REALLY use the GPU (a session on a tiny model was made on it), not just offers the provider. */
  gpu: boolean;
  /** The GPU package is installed but cannot be used: why, in a line. Null when it works, or when there is no GPU package. */
  gpuNote?: string | null;
}

export interface DepthApiOptions {
  /** Repository root: where scripts/ and the Python environment (.depth-venv) are. */
  repoRoot: string;
  /** The public/ folder the commands read pictures from and write maps to. Default: <repoRoot>/public. */
  publicDir?: string;
  /** The commands. Default: <repoRoot>/scripts/make-depth.mjs, make-cutouts.mjs, get-models.mjs (tests give stand-ins). */
  cliPath?: string;
  cutoutsCliPath?: string;
  modelsCliPath?: string;
  /** A Depth Anything V2 .onnx file to use instead of the downloaded model (SCARLET_KEYFRAME_DEPTH_MODEL_FILE). */
  modelFile?: string;
  /** .onnx files to use instead of the downloaded cut-out models (SCARLET_KEYFRAME_CUTOUT_MODEL_FILES, a JSON object). */
  modelFiles?: Partial<Record<"people" | "matte" | "inpaint", string>>;
  /** Where the models are kept. Default: the shared cache folder (modelCacheDir). */
  modelsDir?: string;
  /** What this computer can do. Default: ask Python. Tests replace it. */
  probe?: () => DepthCapabilities;
  /** Host names besides this computer that may call the API (the address chosen with SCARLET_KEYFRAME_HOST). */
  allowedHosts?: string[];
}

interface Job {
  id: string;
  kind: DepthJobKind;
  picture: string;
  map: string;
  mapFile: string;
  /** What a stopped command may have left behind. */
  tidy: { folder?: string; partFiles?: string[] };
  status: DepthJobStatus;
  log: string[];
  percent: number | null;
  step: { n: number; of: number; text: string } | null;
  current: string | null;
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
const TIMEOUT_MS: Record<DepthJobKind, number> = { depth: 15 * 60_000, cutouts: 30 * 60_000, models: 90 * 60_000 };
const CAPABILITY_TTL_MS = 30_000;
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"];

/** A request that is turned away: the HTTP status, the kind, and what to tell a person. */
class Refusal extends Error {
  constructor(
    readonly code: number,
    readonly kind: DepthApiError["error"],
    message: string,
    readonly extra: Partial<DepthApiError> = {},
  ) {
    super(message);
  }
}

function probeMachine(repoRoot: string): DepthCapabilities {
  const python = findPython({ repoRoot });
  if (!python) return { python: null, packages: false, gpu: false };
  const packages = pythonHasPackages(python);
  if (!packages) return { python: python.label, packages, gpu: false, gpuNote: null };
  // Makes a session on a tiny model: a few seconds with a GPU package, which is why the answer is kept for a while.
  const status = gpuStatus(python);
  return { python: python.label, packages, gpu: status.gpu, gpuNote: status.installed && !status.gpu ? status.reason : null };
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

const DEPTH_FOLDER = ["film", "depth"];
const LAYER_EXT = /\.(?:png|jpe?g|webp)$/i;
const MAX_LISTED_FILES = 50_000;

/**
 * Every picture under public/film/depth/ as a path under public/ (`film/depth/s6/321-the-form/people-1/plate.jpg`). The editor's
 * media index is made when the film is imported, so the layers the Make buttons write are not in it; this is how the editor
 * learns they are there. Never follows a link, and leaves out folders still being written (`people-N.part`), hidden files and
 * temporary files.
 */
export function listDepthFiles(publicDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, relative: string[]) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_LISTED_FILES) return;
      const name = entry.name;
      if (name.startsWith(".") || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!name.endsWith(".part")) walk(path.join(dir, name), [...relative, name]);
      } else if (entry.isFile() && LAYER_EXT.test(name) && !/\.tmp\.[a-z]+$/i.test(name)) {
        found.push([...relative, name].join("/"));
      }
    }
  };
  walk(path.join(publicDir, ...DEPTH_FOLDER), DEPTH_FOLDER);
  return found.sort();
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

/** Stops the command and the Python it started (a Python still running would write its files after "Cancel"). */
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

const titleOfFile = (file: string) => Object.values(ALL_MODELS).find((spec) => spec.file === file)?.title ?? file;

function parseQuality(value: unknown): DepthQuality {
  if (value === undefined || value === null || value === "") return DEFAULT_QUALITY as DepthQuality;
  if (value === "best" || value === "fast") return value;
  throw new Refusal(400, "bad-request", 'Quality is "best" or "fast".');
}

export function createDepthMiddleware(options: DepthApiOptions): Connect.NextHandleFunction {
  const publicDir = path.resolve(options.publicDir ?? path.join(options.repoRoot, "public"));
  const publicDirIsOverridden = options.publicDir !== undefined;
  const scripts = path.join(options.repoRoot, "scripts");
  const cliPath = options.cliPath ?? path.join(scripts, "make-depth.mjs");
  const cutoutsCliPath = options.cutoutsCliPath ?? path.join(scripts, "make-cutouts.mjs");
  const modelsCliPath = options.modelsCliPath ?? path.join(scripts, "get-models.mjs");
  const modelsDir = options.modelsDir ?? modelCacheDir();
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
    kind: job.kind,
    status: job.status,
    picture: job.picture,
    map: job.map,
    percent: job.percent,
    step: job.step,
    current: job.current,
    log: job.log.slice(-SHOWN_LOG_LINES),
    message: job.message,
    result: job.result,
    elapsedMs: (job.endedAt ?? Date.now()) - job.startedAt,
  });

  /** A file of your own for a role replaces the downloaded model. */
  const overrideFor = (role: ModelRole): string | undefined => (role === "depth" ? options.modelFile : options.modelFiles?.[role]);

  const modelStatuses = (): ModelStatus[] =>
    Object.entries(ALL_MODELS).map(([id, spec]) => {
      const override = overrideFor(spec.role as ModelRole);
      return {
        id,
        role: spec.role as ModelRole,
        title: spec.title,
        file: spec.file,
        bytes: spec.bytes,
        license: spec.license,
        source: spec.source,
        url: spec.url,
        note: spec.note,
        nonCommercial: /non-commercial/i.test(spec.license),
        cached: override ? fs.existsSync(override) : modelIsCached(spec, modelsDir),
        overridden: Boolean(override),
      };
    });

  const isPresent = (id: string) => {
    const spec = ALL_MODELS[id];
    const override = overrideFor(spec.role as ModelRole);
    return override ? fs.existsSync(override) : modelIsCached(spec, modelsDir);
  };

  /** Removes what a stopped command may have left behind: its own temporary files, and a folder it made if it is empty. */
  const cleanUp = (job: Job) => {
    try {
      const folder = job.tidy.folder;
      if (folder && fs.existsSync(folder)) {
        for (const name of fs.readdirSync(folder)) {
          const full = path.join(folder, name);
          if (/^\.depth-\d+\.tmp\.png$/.test(name)) fs.rmSync(full, { force: true });
          else if (/^people-\d+\.part$/.test(name)) fs.rmSync(full, { recursive: true, force: true });
        }
        if (!fs.existsSync(job.mapFile) && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder);
      }
      for (const part of job.tidy.partFiles ?? []) fs.rmSync(part, { force: true });
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
    // A depth map or a set of cut-outs has just been written (or a half-made one removed), so the media index the
    // editor asks for must walk the disk again rather than answer from the scan it has.
    forgetMediaScan();
    prune();
  };

  const newJob = (kind: DepthJobKind, picture: string, map: string, tidy: Job["tidy"]): Job => ({
    id: crypto.randomUUID(),
    kind,
    picture,
    map,
    mapFile: map ? fileForRef(publicDir, map) : "",
    tidy,
    status: "running",
    log: [],
    percent: null,
    step: null,
    current: null,
    message: null,
    result: null,
    startedAt: Date.now(),
    endedAt: null,
    child: null,
    cancelRequested: false,
    timedOut: false,
    timer: null,
  });

  /** Checks a finished command's answer against the disk. Returns what is wrong, or null. */
  const verify = (job: Job): string | null => {
    const result = job.result;
    if (!result) return "The command finished without an answer.";
    if (job.kind === "depth") {
      if (!fs.existsSync(job.mapFile)) return "The command finished but the map is not where it should be.";
      const size = pngSize(job.mapFile);
      job.result = { ...result, map: job.map, ...(size ? { width: result.width ?? size.width, height: result.height ?? size.height } : {}) };
      return null;
    }
    if (job.kind === "cutouts") {
      if (result.written === false) return null; // nobody found, or nobody cut out cleanly: a real answer, nothing to check
      const refs = [result.depthMap, result.plate, result.review, ...(result.cutouts ?? []).map((cutout) => cutout.image)];
      for (const ref of refs) {
        const clean = typeof ref === "string" ? ref : "";
        if (!clean.startsWith("/film/depth/") || clean.split("/").some((part) => part === ".." || part === ".")) return "The command's answer named a file outside the depth folder.";
        if (!fs.existsSync(fileForRef(publicDir, clean))) return `The command finished but ${clean} is not there.`;
      }
      return null;
    }
    const models = (result.models ?? []).map((item) => ({ id: item.id, file: path.basename(String(item.file)), bytes: item.bytes }));
    for (const item of models) {
      const spec = ALL_MODELS[item.id];
      if (!spec || !fs.existsSync(path.join(modelsDir, spec.file))) return `The download finished but ${item.id} is not in the models folder.`;
    }
    job.result = { ...result, models };
    return null;
  };

  /** Starts `args` as a node command in the repository and follows it. */
  const runJob = (job: Job, args: string[]): Job => {
    jobs.set(job.id, job);
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
      const stage = /^(\d)\/(\d) (.+)$/.exec(line);
      if (stage) {
        job.step = { n: Number(stage[1]), of: Number(stage[2]), text: stage[3] };
        job.current = `Step ${stage[1]} of ${stage[2]}: ${stage[3]}`;
        job.percent = null;
      }
      const download = /^Downloading (\S+) \(/.exec(line);
      if (download) {
        job.current = `Downloading ${titleOfFile(download[1])} (once)`;
        job.percent = 0;
      }
      // The first time a model is used the command checks its checksum, which takes a while for a big file.
      const checking = /^Checking (\S+) …/.exec(line);
      if (checking) {
        job.current = `Checking ${titleOfFile(checking[1])} (once)`;
        job.percent = null;
      }
      job.log.push(line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS - 1)}…` : line);
      if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
    };
    const out = lineSplitter(onLine);
    const err = lineSplitter(onLine);

    let child: ChildProcess;
    try {
      child = spawn(process.execPath, args, {
        cwd: options.repoRoot,
        env: {
          ...process.env,
          ...(publicDirIsOverridden ? { SCARLET_KEYFRAME_PUBLIC: publicDir } : {}),
          ...(options.modelsDir ? { SCARLET_KEYFRAME_MODELS: options.modelsDir } : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
    } catch (error) {
      finish(job, "error", `Could not start the command: ${error instanceof Error ? error.message : String(error)}`);
      return job;
    }
    job.child = child;
    job.timer = setTimeout(() => {
      job.timedOut = true;
      killTree(child);
    }, TIMEOUT_MS[job.kind]);

    child.stdout?.on("data", (chunk: Buffer) => out.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.write(chunk));
    child.on("error", (error) => finish(job, "error", `Could not run the command: ${error.message}`));
    child.on("close", (code) => {
      out.end();
      err.end();
      if (job.cancelRequested) {
        finish(job, "cancelled", "Cancelled.");
      } else if (job.timedOut) {
        finish(job, "error", `It took longer than ${Math.round(TIMEOUT_MS[job.kind] / 60_000)} minutes, so it was stopped.`);
      } else if (code === 0 && job.result?.ok) {
        const problem = verify(job);
        if (problem) {
          finish(job, "error", problem);
        } else {
          job.percent = 100;
          finish(job, "done", null);
        }
      } else {
        const lastLine = [...job.log].reverse().find((line) => line.trim())?.trim();
        finish(job, "error", job.result?.message ?? lastLine ?? `The command stopped (exit code ${code}).`);
      }
    });
    return job;
  };

  // ---- what a request names -----------------------------------------------------------------------------------------

  /** The picture a request names: a plain /film/img/... path that exists under public/. */
  const pictureFrom = (body: Record<string, unknown>) => {
    const asked = typeof body.picture === "string" ? body.picture.trim() : "";
    // Only a plain /film/img/... path: nothing that climbs (`..`), nothing with a backslash or a NUL. The command checks
    // this too (resolvePicture); this is the second lock on the door.
    if (!asked.startsWith(PICTURE_ROOT) || asked.includes("\\") || asked.includes("\0") || path.posix.normalize(asked) !== asked) {
      throw new Refusal(400, "bad-picture", "These buttons work on pictures in public/film/img.");
    }
    try {
      return resolvePicture(asked, publicDir) as { ref: string; file: string };
    } catch (error) {
      if (error instanceof UserError) throw new Refusal(400, "bad-picture", error.message);
      throw error;
    }
  };

  /** A job of this kind on this picture is already running: join it. Another job: wait. */
  const joinOrBusy = (kind: DepthJobKind, picture: string): Job | null => {
    const running = runningJob();
    if (!running) return null;
    if (running.kind === kind && running.picture === picture) return running;
    const what =
      running.kind === "models"
        ? "models are being downloaded"
        : `${running.kind === "cutouts" ? "cut-outs are" : "a depth map is"} being made${running.picture ? ` (${path.basename(running.picture)})` : ""}`;
    throw new Refusal(409, "busy", `Something else is running: ${what}. Wait for it to finish, then try again.`, { id: running.id });
  };

  const needSetup = (caps: DepthCapabilities) => {
    if (!caps.python || !caps.packages) throw new Refusal(412, "setup-needed", "One-time setup needed: run  npm run depth:setup  in the project folder, then try again.");
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
        send(200, {
          ok: true,
          ...caps,
          models: modelStatuses(),
          modelsDir,
          qualities: QUALITIES as DepthReady["qualities"],
          defaultQuality: DEFAULT_QUALITY as DepthQuality,
          busy: runningJob()?.id ?? null,
        } satisfies DepthReady);
        return;
      }

      if (route === "files" && req.method === "GET") {
        send(200, { ok: true, paths: listDepthFiles(publicDir) } satisfies DepthFiles);
        return;
      }

      if (route === "make" && req.method === "POST") {
        const body = await readJsonBody(req);
        const picture = pictureFrom(body);
        const quality = parseQuality(body.quality);
        const map = depthMapRefFor(picture.ref);
        const mapFile = fileForRef(publicDir, map);

        // `replace: true` asks for a new map although one exists: the command keeps the old file as depth--vN.png beside it.
        const replace = body.replace === true;

        // Without that, a map made earlier is simply used: nothing to make, nothing to overwrite.
        if (!replace && fs.existsSync(mapFile)) {
          const size = pngSize(mapFile);
          send(200, {
            id: null,
            kind: "depth",
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

        const joined = joinOrBusy("depth", picture.ref);
        if (joined) {
          send(200, view(joined));
          return;
        }
        const caps = machine();
        needSetup(caps);
        const args = [cliPath, picture.ref, "--json"];
        if (options.modelFile) args.push("--model-file", options.modelFile);
        else args.push("--model", QUALITIES[quality].depth.replace(/^depth-/, ""));
        if (caps.gpu) args.push("--gpu");
        if (replace) args.push("--replace");
        const job = newJob("depth", picture.ref, map, { folder: path.dirname(fileForRef(publicDir, map)) });
        send(200, view(runJob(job, args)));
        return;
      }

      if (route === "cutouts" && req.method === "POST") {
        const body = await readJsonBody(req);
        const picture = pictureFrom(body);
        const quality = parseQuality(body.quality);
        let sourceMap: string | null = null;
        if (body.sourceMap !== undefined && body.sourceMap !== null && body.sourceMap !== "") {
          const asked = typeof body.sourceMap === "string" ? body.sourceMap.trim() : "";
          if (asked.includes("\0") || path.posix.normalize(asked) !== asked) throw new Refusal(400, "bad-picture", "The depth map to keep must be a plain /film/depth/... path.");
          try {
            sourceMap = (resolveSourceMap(asked, publicDir) as { ref: string }).ref;
          } catch (error) {
            if (error instanceof UserError) throw new Refusal(400, "bad-picture", error.message);
            throw error;
          }
        }

        const joined = joinOrBusy("cutouts", picture.ref);
        if (joined) {
          send(200, view(joined));
          return;
        }
        const caps = machine();
        needSetup(caps);
        const needed = modelIdsFor(quality, "cutouts").filter((id) => !(sourceMap && ALL_MODELS[id].role === "depth"));
        const missing = needed.filter((id) => !isPresent(id));
        if (missing.length) {
          const names = missing.map((id) => ALL_MODELS[id].title).join(", ");
          const gb = (missing.reduce((sum, id) => sum + ALL_MODELS[id].bytes, 0) / 1e9).toFixed(1);
          throw new Refusal(412, "models-missing", `Download the models first: ${names} (${gb} GB).`, { missing });
        }
        const args = [cutoutsCliPath, picture.ref, "--json", "--quality", quality];
        if (sourceMap) args.push("--source-map", sourceMap);
        for (const role of ["people", "matte", "inpaint"] as const) {
          const file = options.modelFiles?.[role];
          if (file) args.push(`--${role}-model`, file);
        }
        if (options.modelFile && !sourceMap) args.push("--depth-model", options.modelFile);
        const base = fileForRef(publicDir, path.posix.dirname(depthMapRefFor(picture.ref)));
        const job = newJob("cutouts", picture.ref, "", { folder: base });
        job.mapFile = path.join(base, "depth.png"); // only "is there a map here" matters to the tidy-up
        send(200, view(runJob(job, args)));
        return;
      }

      if (route === "models/download" && req.method === "POST") {
        const body = await readJsonBody(req);
        const ids: string[] = [];
        if (body.ids !== undefined) {
          if (!Array.isArray(body.ids) || body.ids.length > 20) throw new Refusal(400, "bad-request", "ids must be a short list of model ids.");
          for (const id of body.ids) {
            if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(ALL_MODELS, id)) throw new Refusal(400, "bad-request", `Unknown model "${String(id)}".`);
            ids.push(id);
          }
        }
        if (body.quality !== undefined) ids.push(...modelIdsFor(parseQuality(body.quality), "cutouts"));
        const wanted = [...new Set(ids)];
        if (wanted.length === 0) throw new Refusal(400, "bad-request", "Say which models to download.");
        const missing = wanted.filter((id) => !isPresent(id));
        if (missing.length === 0) {
          send(200, {
            id: null,
            kind: "models",
            status: "done",
            picture: "",
            map: "",
            percent: 100,
            log: [],
            message: null,
            existing: true,
            result: { ok: true, existing: true, models: [] },
            elapsedMs: 0,
          } satisfies DepthJobView);
          return;
        }
        const running = runningJob();
        if (running?.kind === "models") {
          send(200, view(running));
          return;
        }
        joinOrBusy("models", ""); // anything else running: wait
        const job = newJob("models", "", "", { partFiles: missing.map((id) => path.join(modelsDir, `${ALL_MODELS[id].file}.part`)) });
        send(200, view(runJob(job, [modelsCliPath, ...missing, "--json"])));
        return;
      }

      if (route === "status" && req.method === "GET") {
        const job = jobs.get(url.searchParams.get("id") ?? "");
        if (!job) {
          sendError(404, "not-found", "No such job (the server may have been restarted).");
          return;
        }
        send(200, view(job));
        return;
      }

      if (route === "cancel" && req.method === "POST") {
        const body = await readJsonBody(req);
        const job = jobs.get(typeof body.id === "string" ? body.id : "");
        if (!job) {
          sendError(404, "not-found", "No such job.");
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
      if (error instanceof Refusal) {
        sendError(error.code, error.kind, error.message, error.extra);
        return;
      }
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
