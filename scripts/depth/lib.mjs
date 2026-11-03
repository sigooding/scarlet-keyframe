/**
 * Plain helpers for `npm run depth` (scripts/make-depth.mjs): finding the picture, where its map goes, keeping the old
 * map, reading the arguments, finding Python. No side effects beyond reading the disk, so they can be tested.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** A mistake the person running the command can fix: shown as a message, not a stack trace. */
export class UserError extends Error {}

export const PICTURE_ROOT = "/film/img/";
export const DEPTH_ROOT = "/film/depth/";
const PICTURE_EXT = /\.(?:jpe?g|png|webp)$/i;

/** A ref that climbs (`..`) or stands still (`.`) could leave public/: never accepted. */
const hasDotSegments = (ref) => ref.split("/").some((part) => part === ".." || part === ".");

/** `/film/img/montage/m4-railway-rain.jpg` -> `/film/depth/montage/m4-railway-rain/depth.png` (the film's own layout). */
export function depthMapRefFor(pictureRef) {
  const clean = String(pictureRef).split("?")[0].split("#")[0];
  if (!clean.startsWith(PICTURE_ROOT) || !PICTURE_EXT.test(clean) || hasDotSegments(clean)) {
    throw new UserError(`${pictureRef} is not a picture under ${PICTURE_ROOT}`);
  }
  return `${DEPTH_ROOT}${clean.slice(PICTURE_ROOT.length).replace(PICTURE_EXT, "")}/depth.png`;
}

/** The disk path of a `/film/...` reference inside public/. */
export function fileForRef(publicDir, ref) {
  return path.join(publicDir, ...ref.split("/").filter(Boolean));
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Pictures under public/film/img whose file name (without extension) is `name`. Archived versions are not offered. */
export function findPicturesByName(publicDir, name) {
  const root = path.join(publicDir, "film", "img");
  const wanted = name.toLowerCase().replace(PICTURE_EXT, "");
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "archive") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (PICTURE_EXT.test(entry.name) && entry.name.replace(PICTURE_EXT, "").toLowerCase() === wanted) {
        found.push(`/${path.relative(publicDir, full).split(path.sep).join("/")}`);
      }
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Which picture was meant: `/film/img/montage/m4-railway-rain.jpg`, `public/film/img/...`, a path on disk inside
 * public/, or just the file name (`m4-railway-rain`). Returns `{ ref, file }`.
 */
export function resolvePicture(arg, publicDir, cwd = process.cwd()) {
  const raw = String(arg ?? "").trim().replace(/\\/g, "/");
  if (!raw) throw new UserError("Say which picture, for example: npm run depth -- /film/img/montage/m4-railway-rain.jpg");
  const root = path.resolve(publicDir);
  let ref = "";
  if (/^[a-zA-Z]:\//.test(raw) || (raw.startsWith("/") && !raw.startsWith("/film/"))) {
    const absolute = path.resolve(raw);
    if (!isInside(root, absolute)) throw new UserError(`${arg} is not inside ${root}; the picture must be in the repository's public/ folder.`);
    ref = `/${path.relative(root, absolute).split(path.sep).join("/")}`;
  } else if (raw.startsWith("/film/")) {
    ref = raw;
  } else if (raw.startsWith("public/")) {
    ref = `/${raw.slice("public/".length)}`;
  } else if (raw.startsWith("film/")) {
    ref = `/${raw}`;
  } else if (raw.includes("/")) {
    const relative = path.resolve(cwd, raw);
    ref = isInside(root, relative) ? `/${path.relative(root, relative).split(path.sep).join("/")}` : `${PICTURE_ROOT}${raw.replace(/^\.\//, "")}`;
  } else {
    const matches = findPicturesByName(publicDir, raw);
    if (matches.length === 0) throw new UserError(`No picture named "${raw}" under public/film/img. Give its path instead.`);
    if (matches.length > 1) {
      throw new UserError(`"${raw}" matches ${matches.length} pictures; say which:\n  ${matches.slice(0, 8).join("\n  ")}`);
    }
    ref = matches[0];
  }
  ref = ref.split("?")[0].split("#")[0];
  if (!ref.startsWith(PICTURE_ROOT) || !PICTURE_EXT.test(ref) || hasDotSegments(ref)) {
    throw new UserError(`${arg} is not a picture under public${PICTURE_ROOT} (a .jpg, .png or .webp).`);
  }
  const file = fileForRef(publicDir, ref);
  if (!isInside(root, file)) throw new UserError(`${arg} is not inside ${root}; the picture must be in the repository's public/ folder.`);
  if (!fs.existsSync(file)) throw new UserError(`There is no picture at ${file}`);
  return { ref, file };
}

/** `depth--v<N>.png`: the next free archive name, given the names already in the map's folder. */
export function nextArchiveName(existingNames) {
  let highest = 0;
  for (const name of existingNames) {
    const match = /^depth--v(\d+)\.png$/i.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `depth--v${highest + 1}.png`;
}

/**
 * npm run depth -- <picture> [--fit [MAP]] [--check] [--replace] [--model small|base|large] [--gpu] [--smooth N]
 *   --fit            line the picture's existing map up with it (keeps the map's detail)
 *   --fit=MAP / --fit MAP   fit another map (from Google's tools, say) and use it as the picture's map
 *   --check          measure whether the existing map lines up; change nothing
 *   --replace        make a new map from the model even though one exists (the old one is kept)
 */
export function parseArgs(argv) {
  const opts = { picture: undefined, fit: undefined, check: false, replace: false, model: undefined, modelFile: undefined, gpu: false, json: false, smooth: undefined, help: false };
  const needValue = (flag, value) => {
    if (value === undefined || value.startsWith("--")) throw new UserError(`${flag} needs a value.`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--check") opts.check = true;
    else if (arg === "--replace") opts.replace = true;
    else if (arg === "--gpu") opts.gpu = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--fit") {
      const next = argv[i + 1];
      if (opts.picture !== undefined && next !== undefined && !next.startsWith("-")) {
        opts.fit = next;
        i += 1;
      } else opts.fit = true;
    } else if (arg.startsWith("--fit=")) opts.fit = arg.slice("--fit=".length) || true;
    else if (arg === "--model") opts.model = needValue(arg, argv[++i]);
    else if (arg.startsWith("--model=")) opts.model = arg.slice("--model=".length);
    else if (arg === "--model-file") opts.modelFile = needValue(arg, argv[++i]);
    else if (arg.startsWith("--model-file=")) opts.modelFile = arg.slice("--model-file=".length);
    else if (arg === "--smooth" || arg.startsWith("--smooth=")) {
      const text = arg === "--smooth" ? needValue(arg, argv[++i]) : arg.slice("--smooth=".length);
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0 || value > 20) throw new UserError("--smooth is a number from 0 to 20 (default 3).");
      opts.smooth = value;
    } else if (arg.startsWith("-")) throw new UserError(`Unknown option ${arg}. Try: npm run depth -- --help`);
    else if (opts.picture === undefined) opts.picture = arg;
    else throw new UserError(`Only one picture at a time; "${arg}" is extra.`);
  }
  if (opts.fit !== undefined && opts.replace) throw new UserError("--fit and --replace do different things; use one.");
  if (opts.check && (opts.replace || typeof opts.fit === "string")) throw new UserError("--check only measures the picture's existing map.");
  return opts;
}

/** Python commands to try, best first: a chosen one, the project's own venv, then the system's. */
export function pythonCandidates({ platform = process.platform, repoRoot, env = process.env } = {}) {
  const list = [];
  const chosen = env.SCARLET_KEYFRAME_PYTHON?.trim();
  if (chosen) {
    const [cmd, ...args] = chosen.split(/\s+/);
    list.push({ cmd, args, label: chosen });
  }
  const venv = platform === "win32"
    ? path.join(repoRoot, ".depth-venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".depth-venv", "bin", "python");
  list.push({ cmd: venv, args: [], label: ".depth-venv", venv: true });
  if (platform === "win32") {
    list.push({ cmd: "py", args: ["-3"], label: "py -3" }, { cmd: "python", args: [], label: "python" });
  } else {
    list.push({ cmd: "python3", args: [], label: "python3" }, { cmd: "python", args: [], label: "python" });
  }
  return list;
}

/** The last line of the worker's output that is a JSON object with an `ok` field. */
export function parseWorkerJson(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith("{")) continue;
    try {
      const value = JSON.parse(lines[i]);
      if (value && typeof value === "object" && "ok" in value) return value;
    } catch {
      /* not it */
    }
  }
  return null;
}

/** Width and height of a PNG, from its header (no decoding). */
export function pngSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(24);
    fs.readSync(fd, head, 0, 24, 0);
    if (head.readUInt32BE(0) !== 0x89504e47 || head.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

export function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

/** The first Python (3.9 or newer) this machine offers, trying the repository's own venv first; null when there is none. */
export function findPython({ repoRoot, platform = process.platform, env = process.env } = {}) {
  for (const candidate of pythonCandidates({ platform, repoRoot, env })) {
    if (candidate.venv && !fs.existsSync(candidate.cmd)) continue;
    const probe = spawnSync(candidate.cmd, [...candidate.args, "-c", "import sys; print(sys.version_info[0]*100+sys.version_info[1])"], {
      encoding: "utf8",
    });
    if (probe.status === 0 && Number(probe.stdout.trim()) >= 309) return candidate;
  }
  return null;
}

/** True when the packages the depth worker imports are installed for this Python. */
export function pythonHasPackages(python) {
  return spawnSync(python.cmd, [...python.args, "-c", "import cv2, numpy, onnxruntime"], { stdio: "ignore" }).status === 0;
}

/** True when onnxruntime offers the NVIDIA GPU (onnxruntime-gpu). The worker still falls back to the CPU if it cannot load. */
export function pythonHasGpu(python) {
  const probe = spawnSync(
    python.cmd,
    [...python.args, "-c", "import onnxruntime as o; print('CUDAExecutionProvider' in o.get_available_providers())"],
    { encoding: "utf8" },
  );
  return probe.status === 0 && probe.stdout.trim() === "True";
}

/** With `--json` the command ends with one line `@@result {...}` (the editor's server reads it instead of scraping text). */
export const RESULT_MARKER = "@@result ";

/** The last `@@result {...}` object in the command's output, or null. */
export function parseResultLine(output) {
  const lines = String(output).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith(RESULT_MARKER)) continue;
    try {
      const value = JSON.parse(lines[i].slice(RESULT_MARKER.length));
      if (value && typeof value === "object" && "ok" in value) return value;
    } catch {
      /* not it */
    }
  }
  return null;
}
