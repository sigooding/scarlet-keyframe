#!/usr/bin/env node
/**
 * `npm run lipsync -- <picture> --audio <voice>` — a lip-synced clip of one shot's still, speaking one voice line, made
 * on this computer's NVIDIA GPU with LatentSync 1.5 (8 GB of GPU memory). First time: npm run lipsync:setup.
 *
 *   npm run lipsync -- /film/img/s20/523-they-have-my-passport.jpg --audio /film/voice/s20/284-mara-tearfully-i-watched.mp3
 *
 * The still is made into a video as long as the line, LatentSync redraws the mouth to the voice, and the result is fitted
 * to the film (1920x1080, 24 fps, no sound: the voice already plays from the film's own clip) and written to
 * public/film/video/lipsync/<picture>--<voice>.mp4 (-2, -3 ... next to an earlier one; nothing is overwritten).
 * LatentSync moves the mouth only: the head and eyes stay as the still has them.
 *
 *   --steps N   LatentSync inference steps, 20-50 (default 20; more is sharper and slower)
 *   --json      end with one line  @@result {...}  (the editor's Make lip sync button reads it)
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESULT_MARKER, UserError, fileForRef, resolvePicture } from "./depth/lib.mjs";
import { LATENTSYNC_CONFIG, LIPSYNC_VIDEO_ROOT, isVoiceRef, lipSyncClipStem, lipSyncStatus } from "./lipsync/lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = process.env.SCARLET_KEYFRAME_PUBLIC?.trim() ? path.resolve(process.env.SCARLET_KEYFRAME_PUBLIC) : path.join(REPO_ROOT, "public");

function parse(argv) {
  const out = { picture: null, audio: null, steps: 20, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--audio") out.audio = argv[++i];
    else if (a === "--steps") out.steps = Number(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!out.picture) out.picture = a;
    else throw new UserError(`Unexpected argument: ${a}`);
  }
  return out;
}

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let tail = "";
    const pass = (chunk) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      // pass LatentSync's own progress through, one line at a time (tqdm redraws with \r)
      for (const line of text.split(/[\r\n]+/)) if (line.trim()) process.stdout.write(`${line.trim()}\n`);
    };
    child.stdout.on("data", pass);
    child.stderr.on("data", pass);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new UserError(`${path.basename(cmd)} stopped (exit code ${code}): ${tail.trim().split("\n").slice(-3).join(" ")}`))));
  });

const seconds = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) || 0;

async function main() {
  const opts = parse(process.argv.slice(2));
  if (opts.help || !opts.picture) {
    console.log("Usage: npm run lipsync -- <picture> --audio <voice file> [--steps 20] [--json]");
    return opts.help ? 0 : 1;
  }
  const picture = resolvePicture(opts.picture, PUBLIC_DIR);
  if (!isVoiceRef(opts.audio)) throw new UserError("--audio must be a voice file under public/film/ (a /film/....mp3 path).");
  const audioFile = fileForRef(PUBLIC_DIR, opts.audio);
  if (!existsSync(audioFile)) throw new UserError(`The voice file is not there: ${opts.audio}`);
  if (!Number.isFinite(opts.steps) || opts.steps < 10 || opts.steps > 60) throw new UserError("--steps must be between 10 and 60.");

  const status = lipSyncStatus(REPO_ROOT);
  if (!status.ready) throw new UserError(`Lip sync is not set up yet: missing ${status.missing.join(", ")}. Run: ${status.setupCommand}`);

  const started = Date.now();
  const work = mkdtempSync(path.join(os.tmpdir(), "scarlet-lipsync-"));
  try {
    console.log("1/4 making a video of the still, as long as the line");
    const inVideo = path.join(work, "in.mp4");
    const inAudio = path.join(work, "in.wav");
    await run("ffmpeg", ["-v", "error", "-y", "-i", audioFile, "-ar", "16000", "-ac", "1", inAudio]);
    const dur = seconds(inAudio);
    await run("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-framerate", "25", "-i", picture.file, "-t", dur.toFixed(3), "-vf", "scale=1280:-2,format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", "-r", "25", inVideo]);

    console.log("2/4 redrawing the mouth on the GPU (LatentSync 1.5)");
    const outRaw = path.join(work, "out.mp4");
    await run(
      status.python,
      ["-m", "scripts.inference", "--unet_config_path", LATENTSYNC_CONFIG, "--inference_ckpt_path", "checkpoints/latentsync_unet.pt", "--inference_steps", String(opts.steps), "--guidance_scale", "1.5", "--enable_deepcache", "--video_path", inVideo, "--audio_path", inAudio, "--video_out_path", outRaw],
      { cwd: status.dir, env: { ...process.env, PYTHONUNBUFFERED: "1" } },
    );
    if (!existsSync(outRaw)) throw new UserError("LatentSync finished without writing a video.");

    console.log("3/4 fitting it to the film (1920x1080, 24 fps)");
    const folder = fileForRef(PUBLIC_DIR, LIPSYNC_VIDEO_ROOT);
    mkdirSync(folder, { recursive: true });
    const stem = lipSyncClipStem(picture.ref, opts.audio);
    const taken = new Set(existsSync(folder) ? readdirSync(folder) : []);
    let name = `${stem}.mp4`;
    for (let n = 2; taken.has(name); n += 1) name = `${stem}-${n}.mp4`;
    const out = path.join(folder, name);
    await run("ffmpeg", ["-v", "error", "-y", "-i", outRaw, "-an", "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);

    console.log("4/4 checking");
    const length = seconds(out);
    if (!(length > 0)) throw new UserError("The clip came out empty.");
    const video = `${LIPSYNC_VIDEO_ROOT}${name}`;
    console.log(`A lip-synced clip (${length.toFixed(2)} s) is in public${video}`);
    if (opts.json) console.log(`${RESULT_MARKER}${JSON.stringify({ ok: true, video, picture: picture.ref, audio: opts.audio, duration: length, seconds: (Date.now() - started) / 1000 })}`);
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    const message = error instanceof UserError ? error.message : `Something went wrong: ${error?.stack ?? error}`;
    console.error(message);
    if (process.argv.includes("--json")) console.log(`${RESULT_MARKER}${JSON.stringify({ ok: false, message })}`);
    process.exit(1);
  },
);
