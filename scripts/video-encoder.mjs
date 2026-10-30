import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const MAX_EXPORT_WORKERS = 6;

const PROBE_WIDTH = 320;
const PROBE_HEIGHT = 180;
const PROBE_FRAME_RGB = Buffer.alloc(PROBE_WIDTH * PROBE_HEIGHT * 3);

export function clampExportWorkers(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.max(1, Math.min(MAX_EXPORT_WORKERS, Math.round(n)));
}

export function normalizeRequestedEncoder(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "auto";
  const v = String(raw).trim().toLowerCase();
  if (v === "auto") return "auto";
  if (v === "nvenc" || v === "h264_nvenc") return "h264_nvenc";
  if (v === "videotoolbox" || v === "h264_videotoolbox") return "h264_videotoolbox";
  if (v === "amf" || v === "h264_amf") return "h264_amf";
  if (v === "qsv" || v === "h264_qsv") return "h264_qsv";
  if (v === "vaapi" || v === "h264_vaapi") return "h264_vaapi";
  if (v === "libx264" || v === "x264" || v === "cpu" || v === "software") return "libx264";
  throw new Error(
    `Invalid --encoder "${raw}" (expected "auto", "nvenc", "videotoolbox", "amf", "qsv", "vaapi", or "libx264")`,
  );
}

export function parseAvailableEncoders(encodersStdout) {
  const found = new Set();
  if (typeof encodersStdout !== "string") return found;
  const regex = /^\s*V[\w.]{5}\s+([a-zA-Z0-9_-]+)\b/gm;
  let match;
  while ((match = regex.exec(encodersStdout)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return found;
}

function platformFfmpegCandidates(platform, env) {
  if (platform === "win32") {
    return [
      env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "ffmpeg.exe") : "",
      env.USERPROFILE ? path.win32.join(env.USERPROFILE, "scoop", "shims", "ffmpeg.exe") : "",
      "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
      "C:\\ffmpeg\\bin\\ffmpeg.exe",
      "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    ].filter(Boolean);
  }
  if (platform === "darwin") {
    return ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  }
  return [];
}

export async function resolveFfmpegBinary({
  env = process.env,
  platform = process.platform,
  spawnSyncFn = spawnSync,
  exists = fs.existsSync,
  loadInstaller = () => import("@ffmpeg-installer/ffmpeg"),
} = {}) {
  const explicit = env.FFMPEG?.trim();
  if (explicit) {
    const res = spawnSyncFn(explicit, ["-version"], { stdio: "ignore" });
    if (res && res.status === 0) return explicit;
    throw new Error(
      `FFMPEG binary could not be executed: ${explicit}. Set FFMPEG to a working ffmpeg executable or clear it to use automatic detection.`,
    );
  }

  const sys = spawnSyncFn("ffmpeg", ["-version"], { stdio: "ignore" });
  if (sys && sys.status === 0) return "ffmpeg";

  for (const candidate of platformFfmpegCandidates(platform, env)) {
    if (!exists(candidate)) continue;
    const check = spawnSyncFn(candidate, ["-version"], { stdio: "ignore" });
    if (check && check.status === 0) return candidate;
  }

  try {
    const mod = await loadInstaller();
    const p = mod.default?.path || mod.path;
    if (p && exists(p)) return p;
  } catch {
    // ignore
  }

  throw new Error(
    "ffmpeg binary not found. Install system ffmpeg, set FFMPEG=/path/to/ffmpeg, or install @ffmpeg-installer/ffmpeg.",
  );
}

function buildHardwareCandidates(quality, vaapiDevice = "/dev/dri/renderD128") {
  const isDraft = quality === "draft";
  return {
    h264_nvenc: [
      {
        id: "h264_nvenc",
        label: "NVIDIA NVENC",
        hardware: true,
        preInputArgs: [],
        outputArgs: [
          "-c:v",
          "h264_nvenc",
          "-preset",
          isDraft ? "p1" : "p4",
          "-rc",
          "vbr",
          "-cq",
          isDraft ? "23" : "19",
          "-b:v",
          "0",
          "-pix_fmt",
          "yuv420p",
        ],
      },
      {
        id: "h264_nvenc",
        label: "NVIDIA NVENC",
        hardware: true,
        preInputArgs: [],
        outputArgs: [
          "-c:v",
          "h264_nvenc",
          "-preset",
          "fast",
          "-cq",
          isDraft ? "23" : "19",
          "-b:v",
          "0",
          "-pix_fmt",
          "yuv420p",
        ],
      },
    ],
    h264_videotoolbox: [
      {
        id: "h264_videotoolbox",
        label: "Apple VideoToolbox",
        hardware: true,
        preInputArgs: [],
        outputArgs: [
          "-c:v",
          "h264_videotoolbox",
          "-b:v",
          isDraft ? "5M" : "12M",
          "-maxrate",
          isDraft ? "8M" : "18M",
          "-bufsize",
          isDraft ? "10M" : "24M",
          "-pix_fmt",
          "yuv420p",
        ],
      },
    ],
    h264_amf: [
      {
        id: "h264_amf",
        label: "AMD AMF",
        hardware: true,
        preInputArgs: [],
        outputArgs: [
          "-c:v",
          "h264_amf",
          "-quality",
          isDraft ? "speed" : "balanced",
          "-rc",
          "cqp",
          "-qp_i",
          isDraft ? "21" : "18",
          "-qp_p",
          isDraft ? "22" : "19",
          "-pix_fmt",
          "yuv420p",
        ],
      },
    ],
    h264_qsv: [
      {
        id: "h264_qsv",
        label: "Intel Quick Sync",
        hardware: true,
        preInputArgs: [],
        outputArgs: [
          "-c:v",
          "h264_qsv",
          "-preset",
          isDraft ? "veryfast" : "fast",
          "-global_quality",
          isDraft ? "22" : "18",
          "-pix_fmt",
          "nv12",
        ],
      },
    ],
    h264_vaapi: [
      {
        id: "h264_vaapi",
        label: "Linux VA-API",
        hardware: true,
        requiresDevicePath: vaapiDevice,
        preInputArgs: ["-vaapi_device", vaapiDevice],
        outputArgs: [
          "-vf",
          "format=nv12,hwupload",
          "-c:v",
          "h264_vaapi",
          "-qp",
          isDraft ? "22" : "18",
        ],
      },
    ],
  };
}

export function makeSoftwareEncoderPlan(quality = "master", workers = 1) {
  const isDraft = quality === "draft";
  const maxSessions = clampExportWorkers(workers);
  return {
    id: "libx264",
    label: "libx264 (CPU)",
    hardware: false,
    preInputArgs: [],
    outputArgs: [
      "-c:v",
      "libx264",
      "-preset",
      isDraft ? "veryfast" : "fast",
      "-crf",
      isDraft ? "21" : "18",
      "-pix_fmt",
      "yuv420p",
    ],
    maxConcurrentSessions: maxSessions,
  };
}

function platformEncoderOrder(platform) {
  if (platform === "win32") return ["h264_nvenc", "h264_amf", "h264_qsv"];
  if (platform === "darwin") return ["h264_videotoolbox"];
  return ["h264_nvenc", "h264_qsv", "h264_vaapi"];
}

function buildProbeArgs(candidate) {
  return [
    "-v",
    "error",
    ...(candidate.preInputArgs ?? []),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${PROBE_WIDTH}x${PROBE_HEIGHT}`,
    "-framerate",
    "24",
    "-i",
    "-",
    "-frames:v",
    "1",
    ...candidate.outputArgs,
    "-f",
    "null",
    "-",
  ];
}

function probeSingleEncode(ffmpegBin, candidate, spawnSyncFn) {
  const res = spawnSyncFn(ffmpegBin, buildProbeArgs(candidate), {
    input: PROBE_FRAME_RGB,
    stdio: ["pipe", "ignore", "pipe"],
    timeout: 8000,
  });
  if (res && res.status === 0) {
    return { ok: true, error: "" };
  }
  const stderr = res?.stderr ? res.stderr.toString("utf8").trim() : "";
  const firstLine = stderr.split(/\r?\n/).find((l) => l.trim())?.trim() || `exit ${res?.status ?? "unknown"}`;
  return { ok: false, error: firstLine };
}

function runOneAsyncProbe(ffmpegBin, args, spawnFn) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    let child;
    try {
      child = spawnFn(ffmpegBin, args, { stdio: ["pipe", "ignore", "ignore"] });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(false);
    }, 8000);
    child.stdin?.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
    try {
      child.stdin?.end(PROBE_FRAME_RGB);
    } catch {
      // close handler will resolve
    }
  });
}

async function resolveMaxConcurrentSessions(ffmpegBin, candidate, targetWorkers, spawnFn) {
  if (targetWorkers <= 1) return 1;
  const args = buildProbeArgs(candidate);
  const tryCount = async (count) => {
    const results = await Promise.all(
      Array.from({ length: count }, () => runOneAsyncProbe(ffmpegBin, args, spawnFn)),
    );
    return results.every(Boolean);
  };

  if (await tryCount(targetWorkers)) return targetWorkers;

  for (let count = Math.min(targetWorkers - 1, 5); count >= 2; count -= 1) {
    if (await tryCount(count)) return count;
  }
  return 1;
}

export async function selectVideoEncoder({
  ffmpegBin,
  gpu = true,
  requestedEncoder = "auto",
  quality = "master",
  workers = 1,
  platform = process.platform,
  exists = fs.existsSync,
  spawnSyncFn = spawnSync,
  spawnFn = spawn,
  vaapiDevice = "/dev/dri/renderD128",
} = {}) {
  const normalized = normalizeRequestedEncoder(requestedEncoder);
  const clampedWorkers = clampExportWorkers(workers);

  if (normalized === "libx264" || (!gpu && normalized === "auto")) {
    return makeSoftwareEncoderPlan(quality, clampedWorkers);
  }

  const listRes = spawnSyncFn(ffmpegBin, ["-hide_banner", "-encoders"], {
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 8000,
  });
  const encodersText = listRes?.stdout ? listRes.stdout.toString("utf8") : "";
  const available = parseAvailableEncoders(encodersText);
  const profilesById = buildHardwareCandidates(quality, vaapiDevice);

  if (normalized !== "auto") {
    const variants = profilesById[normalized];
    if (!variants) {
      throw new Error(`Unsupported encoder: ${normalized}`);
    }
    if (available.size > 0 && !available.has(normalized)) {
      throw new Error(
        `Requested GPU encoder "${normalized}" is not compiled into ${ffmpegBin}. Install a full system ffmpeg build (e.g. winget/Homebrew/apt) or use --encoder auto.`,
      );
    }
    const errors = [];
    for (const variant of variants) {
      if (variant.requiresDevicePath && !exists(variant.requiresDevicePath)) {
        errors.push(`device not found (${variant.requiresDevicePath})`);
        continue;
      }
      const probe = probeSingleEncode(ffmpegBin, variant, spawnSyncFn);
      if (probe.ok) {
        const maxConcurrentSessions = await resolveMaxConcurrentSessions(
          ffmpegBin,
          variant,
          clampedWorkers,
          spawnFn,
        );
        return { ...variant, maxConcurrentSessions };
      }
      errors.push(probe.error);
    }
    throw new Error(
      `Requested GPU encoder "${normalized}" could not initialize (${errors.join("; ")}). Check your GPU drivers or use --encoder auto.`,
    );
  }

  for (const encoderId of platformEncoderOrder(platform)) {
    if (available.size > 0 && !available.has(encoderId)) continue;
    const variants = profilesById[encoderId] ?? [];
    for (const variant of variants) {
      if (variant.requiresDevicePath && !exists(variant.requiresDevicePath)) continue;
      const probe = probeSingleEncode(ffmpegBin, variant, spawnSyncFn);
      if (probe.ok) {
        const maxConcurrentSessions = await resolveMaxConcurrentSessions(
          ffmpegBin,
          variant,
          clampedWorkers,
          spawnFn,
        );
        return { ...variant, maxConcurrentSessions };
      }
    }
  }

  return makeSoftwareEncoderPlan(quality, clampedWorkers);
}

export function buildSegmentEncodeArgs({
  plan,
  quality = "master",
  fps = 24,
  frameCount,
  outPath,
  sequencePattern = "",
}) {
  const isDraft = quality === "draft";
  const inputSection = sequencePattern
    ? ["-framerate", String(fps), "-i", sequencePattern]
    : ["-f", "image2pipe", "-vcodec", isDraft ? "mjpeg" : "png", "-framerate", String(fps), "-i", "-"];

  return [
    "-y",
    ...(plan.preInputArgs ?? []),
    ...inputSection,
    "-an",
    "-frames:v",
    String(frameCount),
    ...plan.outputArgs,
    "-r",
    String(fps),
    "-video_track_timescale",
    String(fps),
    outPath,
  ];
}
