#!/usr/bin/env node
/**
 * `npm run depth -- <picture>` — depth maps for the depth-map camera, made on this machine.
 *
 * Two jobs (see scripts/depth/make_depth.py for how):
 *   make   a new map from a Depth Anything V2 model            npm run depth -- /film/img/s2/10-bar.jpg
 *   fit    line a map somebody already made up with its picture npm run depth -- m4-railway-rain --fit
 *
 * The map goes where the film keeps them (public/film/depth/<folder>/<name>/depth.png) at the picture's exact size.
 * The map that was there is copied to depth--v1.png, depth--v2.png ... first: nothing is ever overwritten without a
 * copy. The model is downloaded once (checked by size and SHA-256) into a cache folder, not the repository.
 *
 * Needs Python with numpy, opencv-python-headless and onnxruntime: `npm run depth:setup` makes that. Node only for
 * the rest, so it runs on Windows.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL, MODELS, modelCacheDir } from "./depth/models.mjs";
import {
  RESULT_MARKER,
  UserError,
  depthMapRefFor,
  fileForRef,
  findPython,
  formatBytes,
  nextArchiveName,
  parseArgs,
  parseWorkerJson,
  pngSize,
  pythonHasPackages,
  resolvePicture,
} from "./depth/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
// SCARLET_KEYFRAME_PUBLIC points the command at another public/ folder (the tests use a temporary one).
const PUBLIC_DIR = process.env.SCARLET_KEYFRAME_PUBLIC?.trim() ? path.resolve(process.env.SCARLET_KEYFRAME_PUBLIC) : path.join(REPO_ROOT, "public");
const WORKER = path.join(__dirname, "depth", "make_depth.py");

const USAGE = `Usage:
  npm run depth -- <picture> [options]

<picture> is its path (/film/img/montage/m4-railway-rain.jpg), a path on disk inside public/, or just its name
(m4-railway-rain).

  (no option)      make a new depth map from the model (only when the picture has none yet)
  --check          measure whether the picture's existing map lines up with it; changes nothing
  --fit            line the existing map up with the picture, keeping its detail
  --fit=MAP        fit another map (made with Google's image tools, say) and use it as this picture's map
  --replace        make a new map from the model even though one exists (the old one is kept)
  --model NAME     small | base | large (default ${DEFAULT_MODEL}); the model is downloaded once
  --model-file F   use this Depth Anything V2 .onnx file instead
  --smooth N       how soft the map is, 0-20 (a new map: default 3, as the film's own maps; --fit: default 0, detail kept)
  --gpu            use the NVIDIA GPU if onnxruntime-gpu can (npm run depth:setup -- --gpu)
  --json           end with one line  @@result {...}  that a program can read (the editor's Make depth map button does)

First time: npm run depth:setup`;

// `--json`: the last line of the output is @@result {...}, for a program to read (see parseResultLine in depth/lib.mjs).
const JSON_MODE = process.argv.slice(2).includes("--json");

function emit(result) {
  if (JSON_MODE) console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
}

function fail(message, code = 1) {
  console.error(`\n${message}\n`);
  emit({ ok: false, message: String(message).trim() });
  process.exit(code);
}

async function sha256Of(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function download(spec, file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const part = `${file}.part`;
  console.log(`Downloading ${spec.file} (${formatBytes(spec.bytes)}). This happens once; it is kept in ${dir}`);
  let response;
  try {
    response = await fetch(spec.url, { redirect: "follow" });
  } catch (error) {
    throw new UserError(`Could not reach GitHub (${error.cause?.code || error.message}).\nDownload ${spec.url}\nand put the file in ${dir}`);
  }
  if (!response.ok || !response.body) {
    throw new UserError(`The download failed (HTTP ${response.status}).\nDownload ${spec.url}\nand put the file in ${dir}`);
  }
  const hash = crypto.createHash("sha256");
  let received = 0;
  let shown = -1;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      const percent = Math.floor((received / spec.bytes) * 100);
      if (percent !== shown && (process.stdout.isTTY || percent % 10 === 0)) {
        shown = percent;
        process.stdout.write(process.stdout.isTTY ? `\r  ${percent}%  ${formatBytes(received)}` : `  ${percent}%\n`);
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(part));
  } catch (error) {
    fs.rmSync(part, { force: true });
    throw new UserError(`The download was interrupted (${error.message}). Run the command again.`);
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
  if (received !== spec.bytes || hash.digest("hex") !== spec.sha256) {
    fs.rmSync(part, { force: true });
    throw new UserError(`The downloaded file is not the expected one (size or checksum differs), so it was thrown away.\nTry again, or download ${spec.url} by hand.`);
  }
  fs.renameSync(part, file);
  fs.writeFileSync(`${file}.ok`, `${spec.sha256}\n`);
}

/** The model file to use: downloaded and checked once, then trusted while its size is unchanged. */
async function ensureModel(name, modelFile) {
  if (modelFile) {
    const file = path.resolve(process.cwd(), modelFile);
    if (!fs.existsSync(file)) throw new UserError(`No model file at ${file}`);
    return file;
  }
  const spec = MODELS[name];
  if (!spec) throw new UserError(`Unknown model "${name}". Choose small, base or large.`);
  const file = path.join(modelCacheDir(), spec.file);
  if (fs.existsSync(file)) {
    if (fs.statSync(file).size !== spec.bytes) {
      throw new UserError(`${file} is not the expected size (${formatBytes(spec.bytes)}). Delete it and run the command again.`);
    }
    if (!fs.existsSync(`${file}.ok`)) {
      process.stdout.write(`Checking ${spec.file} … `);
      if ((await sha256Of(file)) !== spec.sha256) {
        throw new UserError(`${file} does not match the published checksum. Delete it and run the command again.`);
      }
      fs.writeFileSync(`${file}.ok`, `${spec.sha256}\n`);
      console.log("ok");
    }
    return file;
  }
  await download(spec, file);
  return file;
}

function runWorker(python, args) {
  return new Promise((resolve) => {
    const child = spawn(python.cmd, [...python.args, WORKER, ...args], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", (error) => resolve({ code: -1, stdout, error }));
    child.on("close", (code) => resolve({ code, stdout }));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.picture === undefined) throw new UserError(`${USAGE}\n\nSay which picture.`);

  const picture = resolvePicture(opts.picture, PUBLIC_DIR);
  const mapRef = depthMapRefFor(picture.ref);
  const mapFile = fileForRef(PUBLIC_DIR, mapRef);
  const mapFolder = path.dirname(mapFile);
  const hasMap = fs.existsSync(mapFile);
  const relativeMap = path.relative(REPO_ROOT, mapFile);

  let mode = "make";
  let fitSource = "";
  if (opts.check) {
    mode = "check";
    fitSource = mapFile;
  } else if (opts.fit !== undefined) {
    mode = "fit";
    fitSource = typeof opts.fit === "string" ? path.resolve(process.cwd(), opts.fit) : mapFile;
  } else if (hasMap && !opts.replace) {
    throw new UserError(
      `${picture.ref} already has a depth map (${relativeMap}).\n` +
        `  npm run depth -- ${opts.picture} --check     measure whether it lines up with the picture (changes nothing)\n` +
        `  npm run depth -- ${opts.picture} --fit       line it up with the picture, keeping its detail (the old one is kept)\n` +
        `  npm run depth -- ${opts.picture} --replace   make a new one from the model (the old one is kept)`,
    );
  }
  if ((mode === "fit" || mode === "check") && !fs.existsSync(fitSource)) {
    throw new UserError(
      typeof opts.fit === "string" ? `There is no map at ${fitSource}` : `${picture.ref} has no depth map yet (${relativeMap}). Make one first: npm run depth -- ${opts.picture}`,
    );
  }

  const python = findPython({ repoRoot: REPO_ROOT });
  if (!python) {
    throw new UserError("Python 3.9 or newer was not found.\nInstall it from https://www.python.org/downloads/ (tick \"Add python.exe to PATH\"), then run: npm run depth:setup");
  }
  if (!pythonHasPackages(python)) {
    throw new UserError(`The Python packages for depth maps are not installed (${python.label}).\nRun once: npm run depth:setup`);
  }
  const modelFile = await ensureModel(opts.model ?? DEFAULT_MODEL, opts.modelFile);

  fs.mkdirSync(mapFolder, { recursive: true });
  const temporary = path.join(mapFolder, `.depth-${process.pid}.tmp.png`);
  const checkImage = path.join(REPO_ROOT, "exports", "depth", `${path.basename(mapFolder)}-fit-check.jpg`);
  const args = [picture.file, "--model", modelFile];
  if (opts.gpu) args.push("--gpu");
  if (mode === "make") {
    args.push("--out", temporary);
    if (opts.smooth !== undefined) args.push("--smooth", String(opts.smooth));
  } else if (mode === "fit") {
    args.push("--out", temporary, "--fit", fitSource, "--check-image", checkImage);
    if (opts.smooth !== undefined) args.push("--smooth", String(opts.smooth));
  } else {
    args.push("--fit", fitSource, "--dry-run");
  }

  console.log(`${picture.ref}  (${mode === "make" ? "making a new map" : mode === "fit" ? "lining the map up" : "checking the map"}, ${python.label})`);
  try {
    const { code, stdout, error } = await runWorker(python, args);
    if (error) throw new UserError(`Could not run ${python.label}: ${error.message}`);
    const result = parseWorkerJson(stdout);
    if (!result) throw new UserError(`The depth worker stopped without an answer (exit code ${code}).`);
    if (!result.ok) {
      if (result.error === "missing-python-packages") {
        throw new UserError(`The Python package "${result.module}" is missing (${python.label}).\nRun once: npm run depth:setup`);
      }
      throw new UserError(result.message || `The depth worker failed (${result.error}).`);
    }
    const using = `${result.model} on ${result.provider === "CUDAExecutionProvider" ? "the GPU" : "the CPU"}, ${result.seconds} s`;

    if (mode !== "make") {
      const t = result.transform;
      console.log(
        `  ${path.basename(fitSource) === "depth.png" ? "the map" : fitSource} is ${result.map_width}x${result.map_height}; the picture is ${result.width}x${result.height}\n` +
          `  fit: horizontal scale ${t.sx} shift ${t.tx >= 0 ? "+" : ""}${t.tx}, vertical scale ${t.sy} shift ${t.ty >= 0 ? "+" : ""}${t.ty} (of the picture)\n` +
          `  edges up to ${result.largest_shift_px_1920} px out of place on a 1920-wide picture; agreement ${result.score_before} -> ${result.score_after}  (${using})`,
      );
    }
    if (!result.written) {
      emit({ ok: true, mode, picture: picture.ref, map: mapRef, written: false, reason: result.reason ?? null });
      if (mode === "check") {
        const needs = result.reason !== "already-fits" && result.score_after - result.score_before >= 0.04;
        console.log(needs ? `\nThe map is out of line. Fix it with: npm run depth -- ${opts.picture} --fit` : "\nThe map already lines up with the picture. Nothing to do.");
      } else {
        console.log("\nThe map already lines up with the picture, so it was left as it is.");
      }
      return 0;
    }

    const written = pngSize(temporary);
    if (!written || written.width !== result.width || written.height !== result.height) {
      throw new UserError(`The new map is not the picture's size (${written ? `${written.width}x${written.height}` : "unreadable"} instead of ${result.width}x${result.height}), so it was not used.`);
    }
    let archived = "";
    if (fs.existsSync(mapFile)) {
      archived = nextArchiveName(fs.readdirSync(mapFolder));
      fs.copyFileSync(mapFile, path.join(mapFolder, archived));
    }
    fs.renameSync(temporary, mapFile);
    console.log(`\nWrote ${relativeMap}  (${result.width}x${result.height}, ${formatBytes(fs.statSync(mapFile).size)}${mode === "make" ? `, ${using}` : ""})`);
    if (archived) console.log(`The map that was there is kept as ${path.relative(REPO_ROOT, path.join(mapFolder, archived))}. To go back, copy it over depth.png.`);
    if (result.check_image) console.log(`Check it by eye (the map's edges in red, before and after): ${path.relative(REPO_ROOT, result.check_image)}`);
    console.log("Pictures with people in them also need cut-outs and a background plate, or they stretch as the camera moves (scarlett-witness tools/make-depth-layers.py).");
    if (!archived) console.log(`This picture had no map before: it only plays ${mapRef} once its look names it (the Inspector's depth map field).`);
    emit({
      ok: true,
      mode,
      picture: picture.ref,
      map: mapRef,
      written: true,
      width: result.width,
      height: result.height,
      bytes: fs.statSync(mapFile).size,
      model: result.model,
      provider: result.provider === "CUDAExecutionProvider" ? "gpu" : "cpu",
      seconds: result.seconds,
      archived: archived || null,
    });
    return 0;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof UserError) fail(error.message, 1);
    fail(error instanceof Error ? error.stack || error.message : String(error), 2);
  });
