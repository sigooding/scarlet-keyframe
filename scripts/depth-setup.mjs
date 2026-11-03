#!/usr/bin/env node
/**
 * `npm run depth:setup` — one-time setup for `npm run depth`.
 *
 * Makes a Python virtual environment in .depth-venv (not committed) and installs numpy, opencv-python-headless and
 * onnxruntime into it, so nothing is installed system-wide. Nothing else is needed: the model is downloaded by
 * `npm run depth` the first time it is used.
 *
 *   npm run depth:setup                       CPU (works everywhere; a few seconds a picture)
 *   npm run depth:setup -- --gpu              onnxruntime-gpu for an NVIDIA card, with NVIDIA's CUDA 12 and cuDNN 9 libraries as
 *                                             pip packages (about 1.3 GB), so only the NVIDIA driver is needed; Python 3.10+
 *   npm run depth:setup -- --python "py -3.12"   use this Python (3.9 - 3.13)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gpuStatus } from "./depth/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VENV = path.join(REPO_ROOT, ".depth-venv");
const VENV_PYTHON = process.platform === "win32" ? path.join(VENV, "Scripts", "python.exe") : path.join(VENV, "bin", "python");

const argv = process.argv.slice(2);
const gpu = argv.includes("--gpu");
const chosenIndex = argv.findIndex((a) => a === "--python" || a.startsWith("--python="));
const chosen = chosenIndex < 0 ? "" : argv[chosenIndex].includes("=") ? argv[chosenIndex].slice("--python=".length) : argv[chosenIndex + 1] || "";

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function candidates() {
  if (chosen) {
    const [cmd, ...args] = chosen.split(/\s+/);
    return [{ cmd, args, label: chosen }];
  }
  return process.platform === "win32"
    ? [{ cmd: "py", args: ["-3"], label: "py -3" }, { cmd: "python", args: [], label: "python" }]
    : [{ cmd: "python3", args: [], label: "python3" }, { cmd: "python", args: [], label: "python" }];
}

function version(candidate) {
  const probe = spawnSync(candidate.cmd, [...candidate.args, "-c", "import sys; print(sys.version_info[0]*100+sys.version_info[1])"], { encoding: "utf8" });
  return probe.status === 0 ? Number(probe.stdout.trim()) : 0;
}

function run(cmd, args, label) {
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  return result.status === 0;
}

const python = candidates().find((c) => version(c) >= (gpu ? 310 : 309));
if (!python) {
  fail(gpu ? "Python 3.10 or newer was not found (the GPU packages need it).\nInstall it from https://www.python.org/downloads/ (tick \"Add python.exe to PATH\"), then run this again, or choose one with --python \"py -3.12\"." : "Python 3.9 or newer was not found.\nInstall it from https://www.python.org/downloads/ (tick \"Add python.exe to PATH\"), then run this again.\n(Python 3.9 to 3.13 work; if pip cannot find packages for a very new Python, use --python \"py -3.12\".)");
}
console.log(`Using ${python.label} (Python ${Math.floor(version(python) / 100)}.${version(python) % 100})`);

if (gpu) console.log("\nThe GPU packages include NVIDIA's CUDA 12 and cuDNN 9 libraries: about 1.3 GB to download, once.");

if (!fs.existsSync(VENV_PYTHON)) {
  if (!run(python.cmd, [...python.args, "-m", "venv", VENV], `${python.label} -m venv .depth-venv`)) {
    fail("Could not make the virtual environment. On Linux you may need: sudo apt install python3-venv");
  }
}

const requirements = path.join(__dirname, "depth", gpu ? "requirements-gpu.txt" : "requirements.txt");
// onnxruntime and onnxruntime-gpu must not both be installed.
spawnSync(VENV_PYTHON, ["-m", "pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu"], { stdio: "ignore" });
if (!run(VENV_PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirements], `pip install -r ${path.relative(REPO_ROOT, requirements)}`)) {
  fail("pip could not install the packages. Check your internet connection and try again.\nOn a very new Python, a package may have no download yet: try --python \"py -3.12\".");
}

const check = spawnSync(
  VENV_PYTHON,
  ["-c", "import cv2, numpy, onnxruntime as o; print('onnxruntime', o.__version__, 'can use', ', '.join(o.get_available_providers()))"],
  { encoding: "utf8" },
);
if (check.status !== 0) fail(`The packages installed but could not be imported:\n${check.stderr}`);
console.log(`\n${check.stdout.trim()}`);

if (gpu) {
  // The provider list only says what onnxruntime was built with. Whether CUDA and cuDNN can be LOADED is found out by making a
  // session on a tiny model.
  console.log("\nChecking that the GPU really works…");
  const status = gpuStatus({ cmd: VENV_PYTHON, args: [] });
  if (status.gpu) {
    console.log("The GPU works: depth maps and cut-outs will use it (restart `npm run serve` / `npm run dev` if it is running).");
  } else {
    const smi = spawnSync("nvidia-smi", [], { encoding: "utf8" });
    const cuda = /CUDA Version:\s*([\d.]+)/.exec(smi.stdout || "")?.[1];
    console.log(`The GPU is NOT being used: ${status.reason}`);
    if (smi.status !== 0) console.log("nvidia-smi did not run: is the NVIDIA driver installed? Get it from https://www.nvidia.com/Download/index.aspx");
    else if (cuda && Number.parseFloat(cuda) < 12) console.log(`Your NVIDIA driver supports CUDA ${cuda} only; these packages need CUDA 12: update the driver.`);
    else console.log("If the message names a missing DLL, install the latest NVIDIA driver and the Microsoft Visual C++ Redistributable (x64), then run this again.");
    console.log("Everything still works on the CPU, only slower.");
  }
} else if (!gpu) {
  const smi = spawnSync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { encoding: "utf8" });
  if (smi.status === 0 && smi.stdout.trim()) {
    console.log(`An NVIDIA GPU was found (${smi.stdout.trim().split("\n")[0]}). To try it: npm run depth:setup -- --gpu  (then add --gpu to npm run depth).`);
  }
}
console.log("\nReady. Try: npm run depth -- --help");
