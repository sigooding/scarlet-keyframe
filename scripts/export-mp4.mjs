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
  --media <path>          Path to scarlett-witness/public (or scarlett-witness repo root)
  --out <dir|file.mp4>    Output directory or .mp4 file path (default: exports/)
  --name <slug>           Base output filename when --out is a directory (default: nobodys-witness)
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
    media: process.env.SCARLETT_WITNESS_PUBLIC || "",
    out: "exports/",
    name: "nobodys-witness",
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

async function launchHeadlessChromium() {
  const webglArgs = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--hide-scrollbars",
  ];

  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
      headless: true,
      args: webglArgs,
      env: { ...process.env },
    });
  }

  try {
    return await chromium.launch({
      headless: true,
      args: webglArgs,
    });
  } catch {
    // Fall back to bundled @sparticuz/chromium when Playwright's browser cache isn't installed
    if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
    }
    const sparticuzMod = await import("@sparticuz/chromium");
    const sparticuz = sparticuzMod.default ?? sparticuzMod;
    const executablePath = await sparticuz.executablePath();
    return chromium.launch({
      executablePath,
      headless: true,
      args: [...sparticuz.args, "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
      env: { ...process.env },
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

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "frame24-export-"));
  let viteServer = null;
  let browser = null;
  let activeFfmpeg = null;
  let cancelled = false;

  const cleanup = async () => {
    if (activeFfmpeg && !activeFfmpeg.killed) {
      try {
        activeFfmpeg.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    if (browser) {
      const b = browser;
      browser = null;
      await b.close().catch(() => undefined);
    }
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
      emitProgress({ phase: "Starting local Vite render server…", completedFrames: 0, totalFrames: 1, percent: 1 });
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

    emitProgress({ phase: "Launching headless Chromium (1920×1080)…", completedFrames: 0, totalFrames: 1, percent: 3 });
    browser = await launchHeadlessChromium();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const query = new URLSearchParams();
    query.set("render", "1");
    query.set("from", String(opts.from ?? 0));
    if (opts.to !== null) query.set("to", String(opts.to));
    query.set("captions", opts.captions ? "1" : "0");
    query.set("marks", opts.marks ? "1" : "0");
    if (opts.job) query.set("job", opts.job);

    const renderUrl = `${serverBaseUrl}/?${query.toString()}`;
    await page.goto(renderUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__render && window.__render.ready), null, {
      timeout: 60000,
    });
    await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));

    const filmBounds = await page.evaluate(() => ({
      totalFrames: window.__render.totalFrames,
      from: window.__render.from,
      to: window.__render.to,
    }));

    const maxFrameIdx = Math.max(0, filmBounds.totalFrames - 1);
    const fromFrame =
      opts.from !== null ? Math.max(0, Math.min(maxFrameIdx, opts.from)) : filmBounds.from;
    const toFrame =
      opts.to !== null
        ? Math.max(fromFrame, Math.min(maxFrameIdx, opts.to))
        : maxFrameIdx;

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
      const baseSlug = (opts.name || "nobodys-witness").replace(/[^a-zA-Z0-9._-]+/g, "-");
      const fileStem = isWholeFilm ? baseSlug : `${baseSlug}-${fromFrame}-${toFrame}`;
      finalMp4Path = path.join(outResolved, `${fileStem}.mp4`);
    }
    const finalSrtPath = finalMp4Path.replace(/\.mp4$/i, ".srt");

    const tempVideoPath = path.join(tmpDir, "picture.mp4");
    const tempWavPath = path.join(tmpDir, "sound.wav");

    // 1. Encode 1920x1080 24fps H.264 picture stream from exact viewer screenshots
    const videoFfmpegArgs = [
      "-y",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      String(FPS),
      "-i",
      "-",
      "-frames:v",
      String(expectedFrames),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      tempVideoPath,
    ];

    const videoEncoder = spawn(ffmpegBin, videoFfmpegArgs, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    activeFfmpeg = videoEncoder;
    let videoStderr = "";
    videoEncoder.stderr.on("data", (d) => {
      videoStderr += d.toString();
      if (videoStderr.length > 16000) videoStderr = videoStderr.slice(-16000);
    });
    const videoExitPromise = new Promise((resolve, reject) => {
      videoEncoder.on("error", reject);
      videoEncoder.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg picture encode exited ${code}: ${videoStderr.slice(-800)}`));
      });
    });

    for (let f = fromFrame; f <= toFrame; f += 1) {
      if (cancelled) throw new Error("Export cancelled");
      await page.evaluate((frameIndex) => window.__render.setFrame(frameIndex), f);
      const pngBuffer = await page.screenshot({
        type: "png",
        animations: "disabled",
      });
      const canContinue = videoEncoder.stdin.write(pngBuffer);
      if (!canContinue) {
        await once(videoEncoder.stdin, "drain");
      }
      const completed = f - fromFrame + 1;
      const pct = Math.min(82, 5 + (completed / expectedFrames) * 77);
      emitProgress({
        phase: `Rendering picture frame ${completed} / ${expectedFrames} (f${f})`,
        frame: f,
        completedFrames: completed,
        totalFrames: expectedFrames,
        percent: pct,
      });
    }

    videoEncoder.stdin.end();
    await videoExitPromise;
    activeFfmpeg = null;

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

        const b64Wav = await page.evaluate(
          ([a, b, sr]) => window.__render.renderAudioOffline(a, b, sr),
          [chunkStart, chunkEnd, SAMPLE_RATE],
        );
        const wavBuf = Buffer.from(b64Wav, "base64");
        const pcmSlice = wavBuf.subarray(44);
        if (pcmSlice.length >= expectedChunkBytes) {
          await wavHandle.write(pcmSlice.subarray(0, expectedChunkBytes));
        } else {
          await wavHandle.write(pcmSlice);
          await wavHandle.write(Buffer.alloc(expectedChunkBytes - pcmSlice.length));
        }

        const audioProgress = 86 + ((chunkEnd - fromFrame + 1) / expectedFrames) * 8;
        emitProgress({
          phase: "Mixing 4-track audio…",
          completedFrames: expectedFrames,
          totalFrames: expectedFrames,
          percent: Math.min(94, audioProgress),
        });
        chunkStart = chunkEnd + 1;
      }
    } finally {
      await wavHandle.close();
    }

    // 3. Generate sidecar .srt if enabled
    if (opts.srt) {
      const srtText = await page.evaluate(
        ([a, b]) => window.__render.getSrt(a, b),
        [fromFrame, toFrame],
      );
      await fsp.writeFile(finalSrtPath, srtText, "utf8");
    }

    // Close Chromium before final mux
    await browser.close();
    browser = null;

    // 4. Mux H.264 video + AAC audio with exact frame count `to - from + 1`
    emitProgress({
      phase: "Muxing H.264 video + AAC audio…",
      completedFrames: expectedFrames,
      totalFrames: expectedFrames,
      percent: 96,
    });

    const exactDurationSec = (expectedFrames / FPS).toFixed(6);
    await runFfmpeg(
      ffmpegBin,
      [
        "-y",
        "-i",
        tempVideoPath,
        "-i",
        tempWavPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-frames:v",
        String(expectedFrames),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "2",
        "-af",
        `apad,atrim=0:${exactDurationSec}`,
        "-movflags",
        "+faststart",
        finalMp4Path,
      ],
      (child) => {
        activeFfmpeg = child;
      },
    );
    activeFfmpeg = null;

    if (!opts.progressJson) {
      process.stderr.write("\r\x1b[K");
      console.log(
        `Exported ${expectedFrames} exact frame${expectedFrames === 1 ? "" : "s"} (${fromFrame}..${toFrame} @ ${FPS} fps) -> ${finalMp4Path}${opts.srt ? ` (+ ${finalSrtPath})` : ""}`,
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
