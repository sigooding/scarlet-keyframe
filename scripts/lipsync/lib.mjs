// Where lip sync lives on this computer, and whether it is ready. Shared by `npm run lipsync:setup`, `npm run lipsync`
// and the editor's server (vite-plugins/depth-api.ts), so all three agree.
//
// The model is LatentSync 1.5 (ByteDance, Apache-2.0): it redraws the mouth of a face in a video to match a voice, and
// it runs in 8 GB of GPU memory (1.6 needs 18 GB). Its code is cloned into the shared cache folder; its Python packages
// go in .lipsync-venv in the project; its weights come from Hugging Face. At run time it finds faces with InsightFace,
// whose pretrained models are for non-commercial research only.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const LIPSYNC_SETUP_COMMAND = "npm run lipsync:setup";
export const LATENTSYNC_REPO = "https://github.com/bytedance/LatentSync";
export const LATENTSYNC_WEIGHTS = "ByteDance/LatentSync-1.5";
/** The 256-pixel configuration LatentSync 1.5 was trained with (stage2_512.yaml is 1.6, 18 GB). */
export const LATENTSYNC_CONFIG = "configs/unet/stage2.yaml";
export const LATENTSYNC_CHECKPOINTS = ["latentsync_unet.pt", "whisper/tiny.pt"];
/** Clips go here, under public/. */
export const LIPSYNC_VIDEO_ROOT = "/film/video/lipsync/";
export const VOICE_EXT = /\.(?:mp3|wav|m4a|ogg|flac)$/i;

/** The LatentSync checkout: SCARLET_KEYFRAME_LATENTSYNC, or the shared cache folder. */
export function latentSyncDir(env = process.env) {
  const asked = env.SCARLET_KEYFRAME_LATENTSYNC?.trim();
  if (asked) return path.resolve(asked);
  const base = env.XDG_CACHE_HOME?.trim() || (process.platform === "win32" ? env.LOCALAPPDATA?.trim() : "") || path.join(os.homedir(), ".cache");
  return path.join(base, "scarlet-keyframe", "latentsync");
}

/** The Python in the project's .lipsync-venv (Windows keeps it in Scripts/). */
export function lipSyncPython(repoRoot, platform = process.platform) {
  return platform === "win32" ? path.join(repoRoot, ".lipsync-venv", "Scripts", "python.exe") : path.join(repoRoot, ".lipsync-venv", "bin", "python");
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * What is in place, cheaply (files only: nothing is loaded). `ready` when the command can run; `missing` says what is
 * not there, in words a person can act on.
 */
export function lipSyncStatus(repoRoot, { env = process.env, platform = process.platform, ffmpeg = hasFfmpeg } = {}) {
  const dir = latentSyncDir(env);
  const python = lipSyncPython(repoRoot, platform);
  const missing = [];
  if (!existsSync(python)) missing.push("its Python environment (.lipsync-venv)");
  if (!existsSync(path.join(dir, "scripts", "inference.py"))) missing.push("the LatentSync code");
  for (const file of LATENTSYNC_CHECKPOINTS) if (!existsSync(path.join(dir, "checkpoints", file))) missing.push(`the weights (${file})`);
  if (!ffmpeg()) missing.push("ffmpeg (install it and put it on the PATH)");
  return { ready: missing.length === 0, missing, dir, python, setupCommand: LIPSYNC_SETUP_COMMAND };
}

/** A voice file under public/: a plain /film/... path to an audio file, nothing that climbs out. */
export function isVoiceRef(ref) {
  return (
    typeof ref === "string" &&
    ref.startsWith("/film/") &&
    VOICE_EXT.test(ref) &&
    !ref.includes("\\") &&
    !ref.includes("\0") &&
    path.posix.normalize(ref) === ref
  );
}

/** `/film/img/s20/523-x.jpg` + `/film/voice/s20/284-y.mp3` -> `523-x--284-y` (the clip's name, before any `-2`). */
export function lipSyncClipStem(pictureRef, voiceRef) {
  const stem = (ref) => path.posix.basename(ref).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${stem(pictureRef).slice(0, 48)}--${stem(voiceRef).slice(0, 48)}`;
}
