#!/usr/bin/env node
/**
 * `npm run cutouts -- <picture>` — cut-outs, a plate and a depth map for ONE picture, made on this machine.
 *
 * For a picture with people in it. A depth map alone stretches a person like rubber as the camera moves, so each person is
 * cut out as a layer of their own, what was behind them is painted in (the plate), and the depth map has the people painted
 * out of it. See scripts/cutouts/make_cutouts.py for how, and `npm run models` for the models it uses.
 *
 *   npm run cutouts -- 75-one-desperate-blow
 *   npm run cutouts -- /film/img/s74/75-one-desperate-blow.jpg --quality fast
 *
 * Everything goes to a NEW folder next to the picture's depth map, public/film/depth/<folder>/<name>/people-1/ (people-2 the
 * next time): depth.png, plate.jpg, cutout-1.png ..., and review.jpg to look at. Nothing is overwritten.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureModelFile } from "./depth/download.mjs";
import {
  RESULT_MARKER,
  UserError,
  depthMapRefFor,
  fileForRef,
  findPython,
  formatBytes,
  lastWords,
  nextRunName,
  parseWorkerJson,
  pythonHasGpu,
  pythonHasPackages,
  resolvePicture,
  resolveSourceMap,
} from "./depth/lib.mjs";
import { ALL_MODELS, DEFAULT_QUALITY, QUALITIES } from "./depth/models.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
// SCARLET_KEYFRAME_PUBLIC points the command at another public/ folder (the tests use a temporary one).
const PUBLIC_DIR = process.env.SCARLET_KEYFRAME_PUBLIC?.trim() ? path.resolve(process.env.SCARLET_KEYFRAME_PUBLIC) : path.join(REPO_ROOT, "public");
const WORKER = path.join(__dirname, "cutouts", "make_cutouts.py");

const USAGE = `Usage:
  npm run cutouts -- <picture> [options]

<picture> is its path (/film/img/s74/75-one-desperate-blow.jpg), a path on disk inside public/, or just its name.

  --quality Q       best | fast (default ${DEFAULT_QUALITY}); best uses the largest models (Depth Anything Large is non-commercial),
                    fast the small, permissively licensed ones. See: npm run models
  --source-map MAP  keep a depth map somebody already made (a /film/depth/... path) and paint the people out of it,
                    instead of making a new one from the model
  --cpu             do not use the NVIDIA GPU (it is used when onnxruntime-gpu can: npm run depth:setup -- --gpu)
  --people-model F, --matte-model F, --inpaint-model F, --depth-model F
                    use these .onnx files instead of the downloaded models
  --json            end with one line  @@result {...}  that a program can read (the editor's Make cutouts button does)

First time: npm run depth:setup, then npm run models -- best (or just run this: it downloads what it needs).`;

const JSON_MODE = process.argv.slice(2).includes("--json");

function emit(result) {
  if (JSON_MODE) console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
}

function fail(message, code = 1) {
  console.error(`\n${message}\n`);
  emit({ ok: false, message: String(message).trim() });
  process.exit(code);
}

const VALUE_FLAGS = ["--quality", "--source-map", "--people-model", "--matte-model", "--inpaint-model", "--depth-model"];

export function parseCutoutArgs(argv) {
  const opts = { picture: undefined, quality: DEFAULT_QUALITY, sourceMap: undefined, cpu: false, json: false, help: false, models: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--cpu") opts.cpu = true;
    else if (arg === "--gpu") opts.cpu = false; // the GPU is used when it can be; kept so the depth command's habit still works
    else if (VALUE_FLAGS.includes(flag)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UserError(`${flag} needs a value.`);
      if (flag === "--quality") opts.quality = value;
      else if (flag === "--source-map") opts.sourceMap = value;
      else opts.models[flag.slice(2, flag.indexOf("-model"))] = value;
    } else if (arg.startsWith("-")) throw new UserError(`Unknown option ${arg}. Try: npm run cutouts -- --help`);
    else if (opts.picture === undefined) opts.picture = arg;
    else throw new UserError(`Only one picture at a time; "${arg}" is extra.`);
  }
  if (!QUALITIES[opts.quality]) throw new UserError(`Unknown quality "${opts.quality}". Choose best or fast.`);
  return opts;
}

function runWorker(python, args) {
  return new Promise((resolve) => {
    const child = spawn(python.cmd, [...python.args, WORKER, ...args], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    // The worker's messages still reach the terminal (and the editor's server); the last of them are kept so that a worker that
    // dies without an answer can say why.
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => resolve({ code: -1, stdout, stderr, error }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  const opts = parseCutoutArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.picture === undefined) throw new UserError(`${USAGE}\n\nSay which picture.`);

  const picture = resolvePicture(opts.picture, PUBLIC_DIR);
  const baseRef = path.posix.dirname(depthMapRefFor(picture.ref));
  const baseFolder = fileForRef(PUBLIC_DIR, baseRef);
  const runName = nextRunName(fs.existsSync(baseFolder) ? fs.readdirSync(baseFolder) : []);
  const folderRef = `${baseRef}/${runName}`;
  const outDir = path.join(baseFolder, runName);
  const source = opts.sourceMap ? resolveSourceMap(opts.sourceMap, PUBLIC_DIR) : null;

  const python = findPython({ repoRoot: REPO_ROOT });
  if (!python) {
    throw new UserError("Python 3.9 or newer was not found.\nInstall it from https://www.python.org/downloads/ (tick \"Add python.exe to PATH\"), then run: npm run depth:setup");
  }
  if (!pythonHasPackages(python)) {
    throw new UserError(`The Python packages for depth maps are not installed (${python.label}).\nRun once: npm run depth:setup`);
  }
  const gpu = !opts.cpu && pythonHasGpu(python);

  // The models: the files you named, else the downloaded ones (downloaded and checked now if they are not there yet).
  const set = QUALITIES[opts.quality];
  const needed = ["people", "matte", "inpaint", ...(source ? [] : ["depth"])];
  const files = {};
  for (const role of needed) {
    if (opts.models[role]) {
      files[role] = path.resolve(process.cwd(), opts.models[role]);
      if (!fs.existsSync(files[role])) throw new UserError(`No ${role} model file at ${files[role]}`);
    } else {
      files[role] = await ensureModelFile(ALL_MODELS[set[role]]);
    }
  }

  console.log(`${picture.ref}  (cutting out the people, ${opts.quality} quality, ${python.label}, ${gpu ? "GPU" : "CPU"})`);
  const args = [
    picture.file,
    "--out-dir",
    outDir,
    "--people-model",
    files.people,
    "--matte-model",
    files.matte,
    "--inpaint-model",
    files.inpaint,
    ...(source ? ["--source-depth", source.file] : ["--depth-model", files.depth]),
    ...(gpu ? ["--gpu"] : []),
  ];
  const { code, stdout, stderr, error } = await runWorker(python, args);
  if (error) throw new UserError(`Could not run ${python.label}: ${error.message}`);
  const result = parseWorkerJson(stdout);
  if (!result) throw new UserError(`The cut-out worker stopped without an answer (exit code ${code}).${lastWords(stderr)}`);
  if (!result.ok) {
    if (result.error === "missing-python-packages") throw new UserError(`The Python package "${result.module}" is missing (${python.label}).\nRun once: npm run depth:setup`);
    throw new UserError(result.message || `The cut-out worker failed (${result.error}).`);
  }

  const summary = { ok: true, mode: "cutouts", picture: picture.ref, quality: opts.quality, width: result.width, height: result.height, seen: result.seen ?? 0, leftOut: result.left_out ?? 0 };
  if (!result.written) {
    emit({ ...summary, written: false, reason: result.reason, flags: result.flags ?? [], seconds: result.seconds });
    console.log(
      result.reason === "nothing-cut"
        ? "\nPeople were found but none could be cut out cleanly, so nothing was written."
        : `\nNo people were found in this picture, so nothing was written. A depth map alone is fine here: npm run depth -- ${opts.picture}`,
    );
    for (const flag of result.flags ?? []) console.log(`  - ${flag}`);
    return 0;
  }

  const cutouts = result.cutouts.map((cutout) => ({ image: `${folderRef}/${cutout.file}`, depth: cutout.depth, box: cutout.box, how: cutout.how }));
  const used = result.provider === "CUDAExecutionProvider" ? "gpu" : "cpu";
  console.log(`\n${cutouts.length} cut-out${cutouts.length === 1 ? "" : "s"}, a plate and a depth map are in ${path.relative(REPO_ROOT, outDir)}  (${used === "gpu" ? "GPU" : "CPU"}, ${result.seconds} s)`);
  for (const [k, cutout] of cutouts.entries()) console.log(`  cutout-${k + 1}  depth ${cutout.depth} (at the ${cutout.how})`);
  console.log(`Look at the review sheet: ${path.relative(REPO_ROOT, path.join(outDir, "review.jpg"))}`);
  if (result.flags?.length) {
    console.log("Worth a look:");
    for (const flag of result.flags) console.log(`  - ${flag}`);
  }
  console.log(`Their total size: ${formatBytes(fs.readdirSync(outDir).reduce((sum, name) => sum + fs.statSync(path.join(outDir, name)).size, 0))}. Nothing that was there before was touched.`);
  emit({
    ...summary,
    written: true,
    folder: folderRef,
    depthMap: `${folderRef}/depth.png`,
    plate: `${folderRef}/plate.jpg`,
    review: `${folderRef}/review.jpg`,
    cutouts,
    flags: result.flags ?? [],
    provider: used,
    gpuNote: result.gpu_note ?? null,
    source: result.source,
    seconds: result.seconds,
  });
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof UserError) fail(error.message, 1);
      fail(error instanceof Error ? error.stack || error.message : String(error), 2);
    });
}
