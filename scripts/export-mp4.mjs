#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const FPS = 24;
const SAMPLE_RATE = 48000;
const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS; // Exact integer: 2000 samples/frame
const BYTES_PER_STEREO_SAMPLE = 4; // 16-bit L + 16-bit R
const AUDIO_CHUNK_FRAMES = 1440; // 60s chunks for OfflineAudioContext

function printHelp() {
  console.log(`Usage:
  npm run export -- [options]

Options:
  --from <frame>          Start frame index, 0-based inclusive (default: 0)
  --to <frame>            End frame index, 0-based inclusive (default: last frame of film)
  --project <file>        Path to .reel.json bundle, story.json, or studio-edits.json patch
  --media <path>          Path to scarlett-witness/public (or scarlett-witness repo root)
  --out <dir|file.mp4>    Output directory or .mp4 file path (default: exports/)
  --name <slug>           Base output filename when --out is a directory (default: project slug)
  --quality <master|draft> master = 1920x1080 PNG CRF 18 (default); draft = 1280x720 JPEG fast
  --draft                 Shorthand for --quality draft (1280x720 fast review render)
  --workers <1..8>        Parallel headless Chromium + ffmpeg segment workers (default: 1)
  --loudnorm <off|-16|-14> Loudness mastering target: off, -16 LUFS (theatrical), -14 LUFS (streaming)
  --normalize             Shorthand for --loudnorm -14 (-14 LUFS with -1.0 dBTP peak ceiling)
  --no-normalize          Shorthand for --loudnorm off (default)
  --optical-eq            Apply warm 1950s optical-print EQ (85 Hz HPF, +1.8 dB @ 1.8 kHz, 7.8 kHz LPF)
  --no-optical-eq         Bypass 1950s optical-print EQ
  --chapters              Embed timeline chapter/scene markers in MP4 container (default: on)
  --no-chapters           Do not embed MP4 chapter markers
  --captions              Burn captions into picture (default: on)
  --no-captions           Disable burnt-in captions (alias: --no-subs)
  --srt                   Write sidecar .srt subtitle file (default: on)
  --no-srt                Do not write .srt file
  --marks                 Burn timecode and scene/beat mark in corners
  --no-marks              Hide timecode and scene/beat mark (default)
  --url <http://...>      Existing dev server URL (auto-starts Vite when omitted)
  --job <id>              Dev-server live project job ID
  --progress-json         Emit JSON progress events on stdout
  --help                  Show this help
`);
}

function parseCliArgs(argv) {
  const opts = {
    from: null,
    to: null,
    project: "",
    media: process.env.SCARLETT_WITNESS_PUBLIC || "",
    out: "exports/",
    name: "",
    quality: "master",
    workers: 1,
    normalize: false,
    loudnorm: "off",
    opticalEq: undefined,
    chapters: true,
    captions: true,
    srt: true,
    marks: false,
    url: "",
    job: "",
    progressJson: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value after ${arg}`);
      i += 1;
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--from") {
      const n = Number(next());
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --from frame: ${argv[i]}`);
      opts.from = Math.round(n);
    } else if (arg.startsWith("--from=")) {
      const n = Number(arg.slice(7));
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --from frame: ${arg}`);
      opts.from = Math.round(n);
    } else if (arg === "--to") {
      const n = Number(next());
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --to frame: ${argv[i]}`);
      opts.to = Math.round(n);
    } else if (arg.startsWith("--to=")) {
      const n = Number(arg.slice(5));
      if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid --to frame: ${arg}`);
      opts.to = Math.round(n);
    } else if (arg === "--project") {
      opts.project = next();
    } else if (arg.startsWith("--project=")) {
      opts.project = arg.slice(10);
    } else if (arg === "--media") {
      opts.media = next();
    } else if (arg.startsWith("--media=")) {
      opts.media = arg.slice(8);
    } else if (arg === "--out") {
      opts.out = next();
    } else if (arg.startsWith("--out=")) {
      opts.out = arg.slice(6);
    } else if (arg === "--name") {
      opts.name = next();
    } else if (arg.startsWith("--name=")) {
      opts.name = arg.slice(7);
    } else if (arg === "--draft") {
      opts.quality = "draft";
    } else if (arg === "--quality") {
      const q = next().toLowerCase();
      if (q !== "master" && q !== "draft") {
        throw new Error(`Invalid --quality "${q}" (expected "master" or "draft")`);
      }
      opts.quality = q;
    } else if (arg.startsWith("--quality=")) {
      const q = arg.slice(10).toLowerCase();
      if (q !== "master" && q !== "draft") {
        throw new Error(`Invalid --quality "${q}" (expected "master" or "draft")`);
      }
      opts.quality = q;
    } else if (arg === "--workers") {
      const w = Number(next());
      if (!Number.isFinite(w) || w < 1) throw new Error(`Invalid --workers count: ${argv[i]}`);
      opts.workers = Math.max(1, Math.min(8, Math.round(w)));
    } else if (arg.startsWith("--workers=")) {
      const w = Number(arg.slice(10));
      if (!Number.isFinite(w) || w < 1) throw new Error(`Invalid --workers count: ${arg}`);
      opts.workers = Math.max(1, Math.min(8, Math.round(w)));
    } else if (arg === "--normalize") {
      opts.normalize = true;
      opts.loudnorm = "-14";
    } else if (arg === "--no-normalize") {
      opts.normalize = false;
      opts.loudnorm = "off";
    } else if (arg === "--loudnorm") {
      const v = String(next()).toLowerCase();
      if (v !== "off" && v !== "-16" && v !== "-14") {
        throw new Error(`Invalid --loudnorm "${v}" (expected "off", "-16", or "-14")`);
      }
      opts.loudnorm = v;
      opts.normalize = v !== "off";
    } else if (arg.startsWith("--loudnorm=")) {
      const v = arg.slice(11).toLowerCase();
      if (v !== "off" && v !== "-16" && v !== "-14") {
        throw new Error(`Invalid --loudnorm "${v}" (expected "off", "-16", or "-14")`);
      }
      opts.loudnorm = v;
      opts.normalize = v !== "off";
    } else if (arg === "--optical-eq") {
      opts.opticalEq = true;
    } else if (arg === "--no-optical-eq") {
      opts.opticalEq = false;
    } else if (arg === "--chapters") {
      opts.chapters = true;
    } else if (arg === "--no-chapters") {
      opts.chapters = false;
    } else if (arg === "--captions" || arg === "--subs") {
      opts.captions = true;
    } else if (arg === "--no-captions" || arg === "--no-subs") {
      opts.captions = false;
    } else if (arg === "--srt") {
      opts.srt = true;
    } else if (arg === "--no-srt") {
      opts.srt = false;
    } else if (arg === "--marks") {
      opts.marks = true;
    } else if (arg === "--no-marks") {
      opts.marks = false;
    } else if (arg === "--url") {
      opts.url = next();
    } else if (arg.startsWith("--url=")) {
      opts.url = arg.slice(6);
    } else if (arg === "--job") {
      opts.job = next();
    } else if (arg.startsWith("--job=")) {
      opts.job = arg.slice(6);
    } else if (arg === "--progress-json") {
      opts.progressJson = true;
    }
  }

  return opts;
}

async function resolveFfmpegBinary() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const sys = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (sys.status === 0) return "ffmpeg";
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const p = mod.default?.path || mod.path;
    if (p && fs.existsSync(p)) return p;
  } catch {
    // ignore
  }
  throw new Error(
    "ffmpeg binary not found. Install system ffmpeg, set FFMPEG=/path/to/ffmpeg, or install @ffmpeg-installer/ffmpeg.",
  );
}

function resolveMediaDir(rawMedia) {
  if (!rawMedia) return "";
  const abs = path.resolve(process.cwd(), rawMedia);
  if (!fs.existsSync(abs)) {
    throw new Error(`Media path does not exist: ${abs}`);
  }
  const nestedPublic = path.join(abs, "public");
  if (
    fs.existsSync(nestedPublic) &&
    fs.statSync(nestedPublic).isDirectory() &&
    !fs.existsSync(path.join(abs, "film")) &&
    !fs.existsSync(path.join(abs, "audio"))
  ) {
    return nestedPublic;
  }
  return abs;
}

/**
 * Resolves the headless Chromium launch options ONCE so spawning N parallel workers
 * never extracts @sparticuz/chromium concurrently.
 */
async function prepareChromiumLauncher() {
  const webglArgs = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--hide-scrollbars",
  ];

  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return () =>
      chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
        headless: true,
        args: webglArgs,
        env: { ...process.env },
      });
  }

  try {
    const probe = await chromium.launch({ headless: true, args: webglArgs });
    await probe.close();
    return () => chromium.launch({ headless: true, args: webglArgs });
  } catch {
    if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
    }
    const sparticuzMod = await import("@sparticuz/chromium");
    const sparticuz = sparticuzMod.default ?? sparticuzMod;
    const executablePath = await sparticuz.executablePath();
    const args = [
      ...sparticuz.args,
      "--autoplay-policy=no-user-gesture-required",
      "--hide-scrollbars",
    ];
    const env = { ...process.env };
    return () =>
      chromium.launch({
        executablePath,
        headless: true,
        args,
        env,
      });
  }
}

function makeWavHeader(dataSizeBytes, sampleRate = SAMPLE_RATE) {
  const numChannels = 2;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSizeBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSizeBytes, 40);
  return header;
}

/**
 * ITU-R BS.1770-4 K-weighted -14 LUFS loudness normalization + -1.0 dBTP smooth peak ceiling
 * across the entire assembled 16-bit stereo WAV file, preserving exact sample count.
 */
async function normalizeWav16StereoFileInPlace(
  wavPath,
  sampleRate = SAMPLE_RATE,
  targetLufs = -14,
) {
  const raw = await fsp.readFile(wavPath);
  if (raw.length <= 44) return;
  const numSamples = Math.floor((raw.length - 44) / 4);
  if (numSamples <= 0) return;

  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  let off = 44;
  for (let i = 0; i < numSamples; i += 1) {
    left[i] = raw.readInt16LE(off) / 32768;
    right[i] = raw.readInt16LE(off + 2) / 32768;
    off += 4;
  }

  const kEnergy = (samples) => {
    const out = new Float32Array(numSamples);
    const b0 = 1.53512485958697;
    const b1 = -2.69169618940638;
    const b2 = 1.19839281085285;
    const a1 = -1.69065929318241;
    const a2 = 0.73248077421585;
    const hb0 = 1.0;
    const hb1 = -2.0;
    const hb2 = 1.0;
    const ha1 = -1.99004745483398;
    const ha2 = 0.99007225036621;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
    for (let i = 0; i < numSamples; i += 1) {
      const x0 = samples[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      const hy0 = hb0 * y0 + hb1 * hx1 + hb2 * hx2 - ha1 * hy1 - ha2 * hy2;
      hx2 = hx1;
      hx1 = y0;
      hy2 = hy1;
      hy1 = hy0;
      out[i] = hy0 * hy0;
    }
    return out;
  };

  const sqL = kEnergy(left);
  const sqR = kEnergy(right);
  const blockLen = Math.max(1, Math.round(0.4 * sampleRate));
  const hopLen = Math.max(1, Math.round(0.1 * sampleRate));
  const blockPowers = [];
  if (numSamples >= blockLen) {
    for (let s = 0; s + blockLen <= numSamples; s += hopLen) {
      let sum = 0;
      for (let i = s; i < s + blockLen; i += 1) sum += sqL[i] + sqR[i];
      blockPowers.push(sum / blockLen);
    }
  } else {
    let sum = 0;
    for (let i = 0; i < numSamples; i += 1) sum += sqL[i] + sqR[i];
    blockPowers.push(sum / numSamples);
  }

  const absGate = Math.pow(10, (-70 + 0.691) / 10);
  const absGated = blockPowers.filter((p) => p > absGate);
  let measuredLufs = -Infinity;
  if (absGated.length > 0) {
    const meanAbs = absGated.reduce((a, v) => a + v, 0) / absGated.length;
    const relGateLufs = -0.691 + 10 * Math.log10(meanAbs) - 10;
    const relGate = Math.pow(10, (relGateLufs + 0.691) / 10);
    const relGated = absGated.filter((p) => p >= relGate);
    const set = relGated.length > 0 ? relGated : absGated;
    const meanFinal = set.reduce((a, v) => a + v, 0) / set.length;
    if (meanFinal > 0) measuredLufs = -0.691 + 10 * Math.log10(meanFinal);
  }

  const ceilingDb = targetLufs <= -16 ? -1.5 : -1.0;
  const ceilingLinear = Math.pow(10, ceilingDb / 20);
  const gainDb = Number.isFinite(measuredLufs)
    ? Math.max(-24, Math.min(12, targetLufs - measuredLufs))
    : 0;
  const linearGain = Math.pow(10, gainDb / 20);
  const releaseCoeff = Math.exp(-1 / Math.max(1, 0.06 * sampleRate));

  let envGain = 1.0;
  off = 44;
  for (let i = 0; i < numSamples; i += 1) {
    let l = left[i] * linearGain;
    let r = right[i] * linearGain;
    const absMax = Math.max(Math.abs(l), Math.abs(r));
    const needed = absMax > ceilingLinear ? ceilingLinear / absMax : 1.0;
    if (needed < envGain) {
      envGain = needed;
    } else {
      envGain = releaseCoeff * envGain + (1 - releaseCoeff) * 1.0;
      if (needed < envGain) envGain = needed;
    }
    l = Math.max(-1, Math.min(1, l * envGain));
    r = Math.max(-1, Math.min(1, r * envGain));
    raw.writeInt16LE(Math.round(l < 0 ? l * 32768 : l * 32767), off);
    raw.writeInt16LE(Math.round(r < 0 ? r * 32768 : r * 32767), off + 2);
    off += 4;
  }

  await fsp.writeFile(wavPath, raw);
}

function runFfmpeg(ffmpegBin, args, onChild) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    onChild?.(child);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const isDraft = opts.quality === "draft";
  const renderWidth = isDraft ? 1280 : 1920;
  const renderHeight = isDraft ? 720 : 1080;

  const emitProgress = (payload) => {
    if (opts.progressJson) {
      process.stdout.write(`${JSON.stringify({ type: "progress", ...payload })}\n`);
    } else if (payload.phase) {
      const pct = payload.percent !== undefined ? ` (${Math.round(payload.percent)}%)` : "";
      process.stderr.write(`\r\x1b[K[export] ${payload.phase}${pct}`);
    }
  };

  const ffmpegBin = await resolveFfmpegBinary();
  const mediaDir = resolveMediaDir(opts.media);
  if (mediaDir) {
    process.env.SCARLETT_WITNESS_PUBLIC = mediaDir;
  }

  let cliProjectPayload = null;
  let cliSourceName = "";
  if (opts.project) {
    const absProj = path.resolve(process.cwd(), opts.project);
    if (!fs.existsSync(absProj)) {
      throw new Error(`Project file does not exist: ${absProj}`);
    }
    const rawProjText = await fsp.readFile(absProj, "utf8");
    cliProjectPayload = JSON.parse(rawProjText);
    cliSourceName = path.basename(absProj);
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frame24-export-"));
  let viteServer = null;
  const activeBrowsers = new Set();
  const activeFfmpegs = new Set();
  let cancelled = false;

  const cleanup = async () => {
    for (const proc of activeFfmpegs) {
      if (proc && !proc.killed) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
    activeFfmpegs.clear();

    const browsers = [...activeBrowsers];
    activeBrowsers.clear();
    await Promise.all(browsers.map((b) => b.close().catch(() => undefined)));

    if (viteServer) {
      const s = viteServer;
      viteServer = null;
      await s.close().catch(() => undefined);
    }
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  };

  const handleSignal = () => {
    cancelled = true;
    void cleanup().finally(() => process.exit(130));
  };
  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);

  try {
    let serverBaseUrl = opts.url.replace(/\/+$/, "");
    if (!serverBaseUrl) {
      emitProgress({
        phase: "Starting local Vite render server…",
        completedFrames: 0,
        totalFrames: 1,
        percent: 1,
      });
      viteServer = await createViteServer({
        root: REPO_ROOT,
        logLevel: "error",
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: false,
        },
      });
      await viteServer.listen();
      const addr = viteServer.httpServer?.address();
      const port = typeof addr === "object" && addr ? addr.port : 5173;
      serverBaseUrl = `http://127.0.0.1:${port}`;
    }

    let effectiveJobId = opts.job;
    if (cliProjectPayload !== null) {
      const regRes = await fetch(`${serverBaseUrl}/__api/export/register-cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliProjectPayload, cliSourceName }),
      });
      if (!regRes.ok) {
        throw new Error(`Failed to register --project payload (${regRes.status})`);
      }
      const regData = await regRes.json();
      effectiveJobId = regData.jobId;
    }

    emitProgress({
      phase: `Launching headless Chromium (${renderWidth}×${renderHeight}${opts.workers > 1 ? `, ${opts.workers} workers` : ""})…`,
      completedFrames: 0,
      totalFrames: 1,
      percent: 3,
    });

    const launchBrowser = await prepareChromiumLauncher();

    const makeRenderUrl = (fFrom, fTo) => {
      const query = new URLSearchParams();
      query.set("render", "1");
      query.set("from", String(fFrom));
      if (fTo !== null && fTo !== undefined) query.set("to", String(fTo));
      query.set("captions", opts.captions ? "1" : "0");
      query.set("marks", opts.marks ? "1" : "0");
      if (isDraft) {
        query.set("w", String(renderWidth));
        query.set("h", String(renderHeight));
      }
      if (effectiveJobId) query.set("job", effectiveJobId);
      return `${serverBaseUrl}/?${query.toString()}`;
    };

    const primaryBrowser = await launchBrowser();
    activeBrowsers.add(primaryBrowser);
    const primaryCtx = await primaryBrowser.newContext({
      viewport: { width: renderWidth, height: renderHeight },
      deviceScaleFactor: 1,
    });
    const primaryPage = await primaryCtx.newPage();

    await primaryPage.goto(makeRenderUrl(opts.from ?? 0, opts.to), {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await primaryPage.waitForFunction(
      () => Boolean(window.__render && window.__render.ready),
      null,
      { timeout: 60000 },
    );
    await primaryPage.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));

    const filmBounds = await primaryPage.evaluate(() => ({
      totalFrames: window.__render.totalFrames,
      from: window.__render.from,
      to: window.__render.to,
    }));

    const maxFrameIdx = Math.max(0, filmBounds.totalFrames - 1);
    const fromFrame =
      opts.from !== null ? Math.max(0, Math.min(maxFrameIdx, opts.from)) : filmBounds.from;
    const toFrame =
      opts.to !== null ? Math.max(fromFrame, Math.min(maxFrameIdx, opts.to)) : maxFrameIdx;

    if (opts.to !== null && opts.from !== null && opts.to < opts.from) {
      throw new Error(`--to (${opts.to}) must be >= --from (${opts.from})`);
    }

    const expectedFrames = toFrame - fromFrame + 1;
    const isWholeFilm = fromFrame === 0 && toFrame === maxFrameIdx;

    // Resolve output paths
    const outResolved = path.resolve(process.cwd(), opts.out);
    let finalMp4Path;
    if (outResolved.toLowerCase().endsWith(".mp4")) {
      finalMp4Path = outResolved;
      await fsp.mkdir(path.dirname(finalMp4Path), { recursive: true });
    } else {
      await fsp.mkdir(outResolved, { recursive: true });
      const defaultStem = cliSourceName
        ? cliSourceName.replace(/\.(?:reel\.json|json)$/i, "")
        : "nobodys-witness";
      const baseSlug = (opts.name || defaultStem).replace(/[^a-zA-Z0-9._-]+/g, "-");
      const draftSuffix = isDraft ? "-720p" : "";
      const fileStem = isWholeFilm
        ? `${baseSlug}${draftSuffix}`
        : `${baseSlug}-${fromFrame}-${toFrame}${draftSuffix}`;
      finalMp4Path = path.join(outResolved, `${fileStem}.mp4`);
    }
    const finalSrtPath = finalMp4Path.replace(/\.mp4$/i, ".srt");

    const tempVideoPath = path.join(tmpDir, "picture.mp4");
    const tempWavPath = path.join(tmpDir, "sound.wav");

    // 1. Partition [fromFrame..toFrame] across W workers (exact sum == expectedFrames)
    const workerCount = Math.max(1, Math.min(opts.workers, Math.ceil(expectedFrames / 2)));
    const segments = [];
    const basePerWorker = Math.floor(expectedFrames / workerCount);
    const remainder = expectedFrames % workerCount;
    let segCursor = fromFrame;
    for (let w = 0; w < workerCount; w += 1) {
      const segFrames = basePerWorker + (w < remainder ? 1 : 0);
      const outPath =
        workerCount === 1
          ? tempVideoPath
          : path.join(tmpDir, `seg-${String(w).padStart(3, "0")}.mp4`);
      segments.push({
        index: w,
        from: segCursor,
        to: segCursor + segFrames - 1,
        count: segFrames,
        outPath,
      });
      segCursor += segFrames;
    }

    const extraPages = [];
    const extraBrowsers = [];
    if (workerCount > 1) {
      for (let w = 1; w < workerCount; w += 1) {
        const seg = segments[w];
        const b = await launchBrowser();
        activeBrowsers.add(b);
        extraBrowsers.push(b);
        const ctx = await b.newContext({
          viewport: { width: renderWidth, height: renderHeight },
          deviceScaleFactor: 1,
        });
        const p = await ctx.newPage();
        await p.goto(makeRenderUrl(seg.from, seg.to), {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await p.waitForFunction(
          () => Boolean(window.__render && window.__render.ready),
          null,
          { timeout: 60000 },
        );
        await p.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
        extraPages.push(p);
      }
    }

    let completedFramesTotal = 0;

    const encodeSegment = async (seg, page) => {
      const segArgs = [
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        isDraft ? "mjpeg" : "png",
        "-framerate",
        String(FPS),
        "-i",
        "-",
        "-an",
        "-frames:v",
        String(seg.count),
        "-c:v",
        "libx264",
        "-preset",
        isDraft ? "veryfast" : "fast",
        "-crf",
        isDraft ? "21" : "18",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(FPS),
        seg.outPath,
      ];

      const encoder = spawn(ffmpegBin, segArgs, {
        stdio: ["pipe", "ignore", "pipe"],
      });
      activeFfmpegs.add(encoder);
      let stderr = "";
      encoder.stderr.on("data", (d) => {
        stderr += d.toString();
        if (stderr.length > 12000) stderr = stderr.slice(-12000);
      });
      const exitPromise = new Promise((resolve, reject) => {
        encoder.on("error", reject);
        encoder.on("close", (code) => {
          activeFfmpegs.delete(encoder);
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg segment ${seg.index} exited ${code}: ${stderr.slice(-800)}`));
        });
      });

      for (let f = seg.from; f <= seg.to; f += 1) {
        if (cancelled) throw new Error("Export cancelled");
        await page.evaluate((frameIndex) => window.__render.setFrame(frameIndex), f);
        const imgBuf = isDraft
          ? await page.screenshot({ type: "jpeg", quality: 92, animations: "disabled" })
          : await page.screenshot({ type: "png", animations: "disabled" });
        const canContinue = encoder.stdin.write(imgBuf);
        if (!canContinue) {
          await once(encoder.stdin, "drain");
        }
        completedFramesTotal += 1;
        const pct = Math.min(82, 5 + (completedFramesTotal / expectedFrames) * 77);
        emitProgress({
          phase: `Rendering picture frame ${completedFramesTotal} / ${expectedFrames}${workerCount > 1 ? ` (${workerCount}w)` : ""}`,
          frame: f,
          completedFrames: completedFramesTotal,
          totalFrames: expectedFrames,
          percent: pct,
        });
      }

      encoder.stdin.end();
      await exitPromise;
    };

    await Promise.all(
      segments.map((seg, idx) =>
        encodeSegment(seg, idx === 0 ? primaryPage : extraPages[idx - 1]),
      ),
    );

    // Close secondary worker browsers immediately after picture capture
    if (extraBrowsers.length > 0) {
      await Promise.all(
        extraBrowsers.map(async (b) => {
          activeBrowsers.delete(b);
          await b.close().catch(() => undefined);
        }),
      );

      // Concatenate segment MP4s losslessly
      emitProgress({
        phase: `Concatenating ${workerCount} video segments…`,
        completedFrames: expectedFrames,
        totalFrames: expectedFrames,
        percent: 84,
      });
      const concatListPath = path.join(tmpDir, "concat.txt");
      const concatBody = segments
        .map((s) => `file '${s.outPath.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await fsp.writeFile(concatListPath, `${concatBody}\n`, "utf8");
      await runFfmpeg(
        ffmpegBin,
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concatListPath,
          "-c",
          "copy",
          "-frames:v",
          String(expectedFrames),
          tempVideoPath,
        ],
        (child) => activeFfmpegs.add(child),
      );
    }

    // 2. Mix 4-track audio (voices, SFX, music with fades & ducking, ambience) via OfflineAudioContext
    emitProgress({
      phase: "Mixing 4-track audio (voices, SFX, music fades & ducking, ambience)…",
      completedFrames: expectedFrames,
      totalFrames: expectedFrames,
      percent: 86,
    });

    const totalPcmBytes = expectedFrames * SAMPLES_PER_FRAME * BYTES_PER_STEREO_SAMPLE;
    const wavHandle = await fsp.open(tempWavPath, "w");
    try {
      await wavHandle.write(makeWavHeader(totalPcmBytes, SAMPLE_RATE));
      let chunkStart = fromFrame;
      while (chunkStart <= toFrame) {
        if (cancelled) throw new Error("Export cancelled");
        const chunkEnd = Math.min(toFrame, chunkStart + AUDIO_CHUNK_FRAMES - 1);
        const chunkFrames = chunkEnd - chunkStart + 1;
        const expectedChunkBytes = chunkFrames * SAMPLES_PER_FRAME * BYTES_PER_STEREO_SAMPLE;

        const b64Wav = await primaryPage.evaluate(
          ([a, b, sr, eq]) => window.__render.renderAudioOffline(a, b, sr, false, eq),
          [chunkStart, chunkEnd, SAMPLE_RATE, opts.opticalEq],
        );
        const wavBuf = Buffer.from(b64Wav, "base64");
        const pcmSlice = wavBuf.subarray(44);
        if (pcmSlice.length >= expectedChunkBytes) {
          await wavHandle.write(pcmSlice.subarray(0, expectedChunkBytes));
        } else {
          await wavHandle.write(pcmSlice);
          await wavHandle.write(Buffer.alloc(expectedChunkBytes - pcmSlice.length));
        }

        const audioProgress = 86 + ((chunkEnd - fromFrame + 1) / expectedFrames) * 7;
        emitProgress({
          phase: "Mixing 4-track audio…",
          completedFrames: expectedFrames,
          totalFrames: expectedFrames,
          percent: Math.min(93, audioProgress),
        });
        chunkStart = chunkEnd + 1;
      }
    } finally {
      await wavHandle.close();
    }

    if (opts.loudnorm === "-16" || opts.loudnorm === "-14") {
      const targetNum = Number(opts.loudnorm);
      const ceilStr = targetNum <= -16 ? "−1.5 dBTP" : "−1.0 dBTP";
      emitProgress({
        phase: `Normalizing audio loudness (${targetNum} LUFS / ${ceilStr})…`,
        completedFrames: expectedFrames,
        totalFrames: expectedFrames,
        percent: 94,
      });
      await normalizeWav16StereoFileInPlace(tempWavPath, SAMPLE_RATE, targetNum);
    }

    // 3. Generate sidecar .srt if enabled
    if (opts.srt) {
      const srtText = await primaryPage.evaluate(
        ([a, b]) => window.__render.getSrt(a, b),
        [fromFrame, toFrame],
      );
      await fsp.writeFile(finalSrtPath, srtText, "utf8");
    }

    // 3b. Generate FFMETADATA1 chapters if enabled
    let chaptersMetaPath = "";
    if (opts.chapters) {
      const ffmetaText = await primaryPage.evaluate(
        ([a, b]) =>
          typeof window.__render.getFfmetadataChapters === "function"
            ? window.__render.getFfmetadataChapters(a, b)
            : "",
        [fromFrame, toFrame],
      );
      if (ffmetaText && ffmetaText.includes("[CHAPTER]")) {
        chaptersMetaPath = path.join(tmpDir, "chapters.ffmetadata");
        await fsp.writeFile(chaptersMetaPath, ffmetaText, "utf8");
      }
    }

    // Close primary Chromium before final mux
    activeBrowsers.delete(primaryBrowser);
    await primaryBrowser.close();

    // 4. Mux H.264 video + AAC audio (+ optional chapter metadata) with exact frame count `to - from + 1`
    emitProgress({
      phase: "Muxing H.264 video + AAC audio…",
      completedFrames: expectedFrames,
      totalFrames: expectedFrames,
      percent: 96,
    });

    const exactDurationSec = (expectedFrames / FPS).toFixed(6);
    const muxArgs = [
      "-y",
      "-i",
      tempVideoPath,
      "-i",
      tempWavPath,
      ...(chaptersMetaPath ? ["-f", "ffmetadata", "-i", chaptersMetaPath] : []),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      ...(chaptersMetaPath ? ["-map_metadata", "2", "-map_chapters", "2"] : []),
      "-c:v",
      "copy",
      "-frames:v",
      String(expectedFrames),
      "-c:a",
      "aac",
      "-b:a",
      isDraft ? "160k" : "192k",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "2",
      "-af",
      `apad,atrim=0:${exactDurationSec}`,
      "-movflags",
      "+faststart",
      finalMp4Path,
    ];
    await runFfmpeg(ffmpegBin, muxArgs, (child) => activeFfmpegs.add(child));

    if (!opts.progressJson) {
      process.stderr.write("\r\x1b[K");
      console.log(
        `Exported ${expectedFrames} exact frame${expectedFrames === 1 ? "" : "s"} (${fromFrame}..${toFrame} @ ${FPS} fps, ${renderWidth}x${renderHeight}) -> ${finalMp4Path}${opts.srt ? ` (+ ${finalSrtPath})` : ""}`,
      );
    } else {
      process.stdout.write(
        `${JSON.stringify({
          type: "done",
          fromFrame,
          toFrame,
          totalFrames: expectedFrames,
          mp4Path: finalMp4Path,
          srtPath: opts.srt ? finalSrtPath : null,
          percent: 100,
          phase: "Complete",
        })}\n`,
      );
    }
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (process.argv.includes("--progress-json")) {
    process.stdout.write(`${JSON.stringify({ type: "error", error: message })}\n`);
  } else {
    process.stderr.write(`\n[export] ERROR: ${message}\n`);
  }
  process.exit(1);
});
