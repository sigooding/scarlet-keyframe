#!/usr/bin/env node
/**
 * `npm run lipsync:setup` — installs local lip sync once: LatentSync 1.5 (ByteDance, Apache-2.0), which needs an NVIDIA
 * GPU with 8 GB of memory, Python 3.10, git and ffmpeg.
 *
 *   1. clones LatentSync into the shared cache folder (SCARLET_KEYFRAME_LATENTSYNC to put it elsewhere),
 *   2. makes .lipsync-venv in the project and installs its Python packages (PyTorch with CUDA 12.1, about 5 GB),
 *   3. downloads the LatentSync 1.5 weights from Hugging Face (about 5 GB).
 *
 * Run it again at any time: what is already there is kept. Then: npm run lipsync -- <picture> --audio <voice>, or the
 * Make lip sync button in the editor's Clip tab.
 *
 * Licences: LatentSync's code and weights are Apache-2.0. It finds faces with InsightFace, whose pretrained models are
 * for non-commercial research only: check that before a commercial release.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LATENTSYNC_CHECKPOINTS, LATENTSYNC_REPO, LATENTSYNC_WEIGHTS, latentSyncDir, lipSyncPython, lipSyncStatus } from "./lipsync/lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function step(text) {
  console.log(`\n== ${text}`);
}

function sh(cmd, args, opts = {}) {
  const shown = [cmd, ...args].join(" ");
  console.log(`$ ${shown}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error || r.status !== 0) throw new Error(`This failed: ${shown}${r.error ? ` (${r.error.message})` : ""}`);
}

function works(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0 ? `${r.stdout}${r.stderr}`.trim() : null;
}

/** A Python 3.10 (what LatentSync is tested on); 3.11 also works for most setups. */
function findPython310() {
  const candidates = process.platform === "win32" ? [["py", ["-3.10"]], ["py", ["-3.11"]], ["python", []]] : [["python3.10", []], ["python3.11", []], ["python3", []]];
  for (const [cmd, pre] of candidates) {
    const v = works(cmd, [...pre, "--version"]);
    const m = v && /Python 3\.(\d+)/.exec(v);
    if (m && Number(m[1]) >= 10 && Number(m[1]) <= 11) return { cmd, pre, version: v };
  }
  return null;
}

function main() {
  console.log("Local lip sync: LatentSync 1.5 (8 GB of NVIDIA GPU memory).");
  if (!works("git", ["--version"])) throw new Error("git is needed: install it from https://git-scm.com and run this again.");
  if (!works("ffmpeg", ["-version"])) throw new Error("ffmpeg is needed: install it (https://ffmpeg.org) and put it on the PATH, then run this again.");
  const nvidia = works("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"]);
  console.log(nvidia ? `GPU: ${nvidia}` : "No NVIDIA GPU was found (nvidia-smi): lip sync will not run without one.");

  const dir = latentSyncDir();
  step(`1/3 LatentSync code -> ${dir}`);
  if (existsSync(path.join(dir, "scripts", "inference.py"))) console.log("Already here.");
  else {
    mkdirSync(path.dirname(dir), { recursive: true });
    sh("git", ["clone", "--depth", "1", LATENTSYNC_REPO, dir]);
  }

  step("2/3 Python packages -> .lipsync-venv");
  const python = lipSyncPython(REPO_ROOT);
  if (!existsSync(python)) {
    const base = findPython310();
    if (!base) throw new Error("Python 3.10 is needed (https://www.python.org/downloads/release/python-31011/), then run this again.");
    console.log(`Using ${base.version}`);
    sh(base.cmd, [...base.pre, "-m", "venv", path.join(REPO_ROOT, ".lipsync-venv")]);
  }
  sh(python, ["-m", "pip", "install", "--upgrade", "pip"]);
  sh(python, ["-m", "pip", "install", "-r", path.join(dir, "requirements.txt")]);

  step(`3/3 LatentSync 1.5 weights (${LATENTSYNC_WEIGHTS})`);
  const fetch = LATENTSYNC_CHECKPOINTS.map((f) => `hf_hub_download(${JSON.stringify(LATENTSYNC_WEIGHTS)}, ${JSON.stringify(f)}, local_dir="checkpoints")`).join("; ");
  sh(python, ["-c", `from huggingface_hub import hf_hub_download; ${fetch}`], { cwd: dir });

  const status = lipSyncStatus(REPO_ROOT);
  if (!status.ready) throw new Error(`Still missing: ${status.missing.join(", ")}`);
  console.log("\nLip sync is ready. Try it: npm run lipsync -- <picture> --audio <voice file>, or Make lip sync in the editor.");
  console.log("Note: InsightFace's face models (used by LatentSync) are for non-commercial research only.");
}

try {
  main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
