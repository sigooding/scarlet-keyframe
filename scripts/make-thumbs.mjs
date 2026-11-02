#!/usr/bin/env node
/**
 * `npm run thumbs` — build the small pictures the lists use.
 *
 * Every picture in src/data/media-index.json (plus `src/assets`, if pictures
 * there are ever referenced by path) gets a 400 px wide copy under
 * `public/thumbs/`, mirroring the original path:
 *
 *     public/film/img/s2/10-bar.jpg  ->  public/thumbs/film/img/s2/10-bar.jpg
 *
 * - JPEG sources become `<name>.jpg` (`-q:v 4`); PNG/WebP/GIF/AVIF/BMP sources
 *   become `<name>.webp` when the bundled FFmpeg has libwebp (transparency is
 *   kept), otherwise they are counted and reported as skipped.
 * - Originals are only ever read: nothing under public/ or src/assets/ is
 *   modified, moved, downscaled or re-encoded.
 * - Incremental: a thumbnail is skipped when it is newer than its original.
 *   Four files are encoded at a time, with a progress line.
 * - `public/thumbs/index.json` lists every thumbnail that exists afterwards;
 *   `src/core/thumbs.ts` only ever asks for those.
 *
 * Node only — no shell commands, path.join throughout — so this runs on Windows.
 *
 * Usage:
 *   npm run thumbs                 # every picture in the media index
 *   npm run thumbs -- --force      # re-encode even when up to date
 *   npm run thumbs -- --limit 20   # first 20 pictures (a quick check)
 *   npm run thumbs -- --index <file> --public <dir> --out <dir>
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const WIDTH = 400;
const CONCURRENCY = 4;
const JPEG_QUALITY = "4"; // -q:v 4 ≈ 85 %, small and clean at 400 px
const WEBP_QUALITY = "80";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);
const TRANSPARENT_EXTENSIONS = new Set([".png", ".webp", ".gif", ".avif"]);

function parseArgs(argv) {
  const opts = {
    index: path.join(REPO_ROOT, "src", "data", "media-index.json"),
    publicDir: path.join(REPO_ROOT, "public"),
    outDir: path.join(REPO_ROOT, "public", "thumbs"),
    assetsDir: path.join(REPO_ROOT, "src", "assets"),
    force: false,
    limit: 0,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value after ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--limit") opts.limit = Math.max(0, Math.round(Number(next()) || 0));
    else if (arg.startsWith("--limit=")) opts.limit = Math.max(0, Math.round(Number(arg.slice(8)) || 0));
    else if (arg === "--index") opts.index = path.resolve(process.cwd(), next());
    else if (arg === "--public") opts.publicDir = path.resolve(process.cwd(), next());
    else if (arg === "--out") opts.outDir = path.resolve(process.cwd(), next());
    else if (arg === "--assets") opts.assetsDir = path.resolve(process.cwd(), next());
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

/**
 * Thumbnails are derived files, and a full run deletes the ones it no longer
 * produces. So the output folder must be exactly `<originals>/thumbs` — never
 * a folder of originals, the originals folder itself, or anywhere else.
 */
function assertThumbsFolder(publicDir, outDir) {
  const relative = path.relative(path.resolve(publicDir), path.resolve(outDir));
  const isThumbs = process.platform === "win32" ? relative.toLowerCase() === "thumbs" : relative === "thumbs";
  if (!isThumbs) {
    throw new Error(
      `--out must be the "thumbs" folder inside the originals folder (${path.join(publicDir, "thumbs")}), not ${outDir}. ` +
        "A run deletes thumbnails it no longer produces, so it will not write anywhere else. Originals are never written or deleted.",
    );
  }
}

function printHelp() {
  console.log(`Usage:
  npm run thumbs [options]

Writes 400 px wide thumbnails to public/thumbs/ for every picture in the media
index. Originals are never changed.

Options:
  --force        Re-encode thumbnails that are already up to date
  --limit <n>    Only the first n pictures (for a quick check)
  --index <file> Media index to read (default: src/data/media-index.json)
  --public <dir> Originals folder (default: public)
  --out <dir>    Thumbnail folder; must be <public>/thumbs (default: public/thumbs)
  --assets <dir> Extra picture folder to include (default: src/assets)
  --help         Show this help
`);
}

/** The FFmpeg that ships in node_modules, or a system one via FFMPEG. */
async function resolveFfmpeg() {
  const explicit = process.env.FFMPEG?.trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`FFMPEG does not exist: ${explicit}`);
    return explicit;
  }
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const info = mod.default ?? mod;
    if (typeof info === "string" && fs.existsSync(info)) return info;
    if (info?.path && fs.existsSync(info.path)) return info.path;
  } catch {
    /* fall through to a system ffmpeg */
  }
  return "ffmpeg";
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 1024 * 1024 * 32 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message).trim().split("\n").slice(-3).join(" ");
        reject(new Error(detail || error.message));
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

/** Does this FFmpeg have the libwebp encoder? */
async function hasLibwebp(ffmpeg) {
  try {
    const encoders = await run(ffmpeg, ["-hide_banner", "-encoders"]);
    return /^\s*V\S*\s+libwebp\s/m.test(encoders);
  } catch {
    return false;
  }
}

function readMediaIndex(file) {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${file} must be a JSON array of paths`);
  return parsed.filter((entry) => typeof entry === "string");
}

/**
 * Pictures in src/assets that are served by path (i.e. that also live under
 * public/). The rest are bundled by Vite as data URLs, so a file thumbnail
 * would never be requested for them.
 */
function assetPictures(assetsDir, publicDir) {
  if (!assetsDir || !fs.existsSync(assetsDir)) return { refs: [], skipped: 0 };
  const root = path.resolve(publicDir);
  const refs = [];
  let skipped = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        if (full.startsWith(root + path.sep)) refs.push(`/${path.relative(root, full).split(path.sep).join("/")}`);
        else skipped += 1;
      }
    }
  };
  walk(assetsDir);
  return { refs, skipped };
}

/** Absolute original path, or null when it is outside public/ or missing. */
function resolveOriginal(publicDir, ref) {
  const key = ref.split("?")[0].split("#")[0].replace(/^\/+/, "");
  if (!key) return null;
  const root = path.resolve(publicDir);
  const decoded = path.resolve(root, key);
  const candidates = decoded === path.resolve(root, ref.replace(/^\/+/, "")) ? [decoded] : [decoded, path.resolve(root, ref.replace(/^\/+/, ""))];
  for (const candidate of candidates) {
    if (!candidate.startsWith(root + path.sep)) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the encoded spelling */
    }
  }
  return null;
}

/**
 * Where the thumbnail for `originalPath` goes: the same folder and name under
 * `public/thumbs/`, with an extension that matches the encoding — `.jpg` for
 * JPEG sources, `.webp` for pictures that keep transparency.
 */
function thumbPathFor(publicDir, outDir, originalPath, useWebp = false) {
  const relative = path.relative(path.resolve(publicDir), originalPath);
  const extension = path.extname(relative).toLowerCase();
  const base = extension ? relative.slice(0, -extension.length) : relative;
  const target = useWebp ? ".webp" : extension === ".jpeg" ? ".jpeg" : ".jpg";
  return path.join(outDir, `${base}${target}`);
}

function isUpToDate(originalPath, thumbPath) {
  try {
    const source = fs.statSync(originalPath);
    const thumb = fs.statSync(thumbPath);
    return thumb.size > 0 && thumb.mtimeMs >= source.mtimeMs;
  } catch {
    return false;
  }
}

async function encode(ffmpeg, originalPath, thumbPath, webp) {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  // The temporary copy keeps the real extension: FFmpeg picks the muxer from it.
  const suffix = `.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const temporary = thumbPath.replace(/\.(jpe?g|webp)$/i, (extension) => `${suffix}${extension}`);
  // Scale to 400 px wide, keep the aspect ratio, never enlarge, never upscale
  // an already-small picture, and drop the metadata.
  const filter = `scale='min(${WIDTH},iw)':-2:flags=lanczos`;
  const codec = webp
    ? ["-c:v", "libwebp", "-quality", WEBP_QUALITY, "-compression_level", "4", "-preset", "picture"]
    : ["-q:v", JPEG_QUALITY];
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    originalPath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    ...codec,
    "-map_metadata",
    "-1",
    temporary,
  ];
  try {
    await run(ffmpeg, args);
    fs.renameSync(temporary, thumbPath);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/** Runs `worker` over `items`, at most `concurrency` at a time. */
async function pool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

function walkIndexFiles(outDir) {
  const files = [];
  if (!fs.existsSync(outDir)) return files;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(`/${path.relative(outDir, full).split(path.sep).join("/")}`);
      }
    }
  };
  walk(outDir);
  return files.sort();
}

function writeIndex(outDir) {
  const files = walkIndexFiles(outDir);
  const payload = {
    version: 1,
    width: WIDTH,
    generatedBy: "npm run thumbs",
    // Paths mirror the originals and are relative to /thumbs.
    files,
  };
  const target = path.join(outDir, "index.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 0)}\n`);

  let bytes = 0;
  for (const file of files) {
    try {
      bytes += fs.statSync(path.join(outDir, ...file.split("/").filter(Boolean))).size;
    } catch {
      /* ignore */
    }
  }
  return { files: files.length, bytes };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    printHelp();
    return 0;
  }
  assertThumbsFolder(opts.publicDir, opts.outDir);
  if (!fs.existsSync(opts.index)) throw new Error(`Media index not found: ${opts.index}`);
  if (!fs.existsSync(opts.publicDir)) throw new Error(`Originals folder not found: ${opts.publicDir}`);

  const ffmpeg = await resolveFfmpeg();
  const webpAvailable = await hasLibwebp(ffmpeg);

  // Every picture the app can list: the media index plus any src/assets picture.
  const refs = readMediaIndex(opts.index);
  const assets = assetPictures(opts.assetsDir, opts.publicDir);
  const jobs = [];
  const seen = new Set();
  const missing = [];
  for (const ref of [...refs, ...assets.refs]) {
    if (typeof ref !== "string") continue;
    const extension = path.extname(ref.split("?")[0]).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const original = resolveOriginal(opts.publicDir, ref);
    if (!original) {
      missing.push(ref);
      continue;
    }
    const useWebp = TRANSPARENT_EXTENSIONS.has(extension);
    const thumb = thumbPathFor(opts.publicDir, opts.outDir, original, useWebp);
    if (seen.has(thumb)) continue;
    seen.add(thumb);
    jobs.push({ original, thumb, extension, useWebp });
  }
  const chosen = opts.limit > 0 ? jobs.slice(0, opts.limit) : jobs;

  console.log(
    `Thumbnails: ${chosen.length} picture${chosen.length === 1 ? "" : "s"} → ${path.relative(REPO_ROOT, opts.outDir) || opts.outDir} ` +
      `(${WIDTH} px wide, ${webpAvailable ? "JPEG + WebP" : "JPEG only — this FFmpeg has no libwebp"})`,
  );
  if (assets.skipped) {
    console.log(
      `  ${assets.skipped} src/assets picture${assets.skipped === 1 ? "" : "s"} are bundled as data URLs, not served by path; no thumbnail needed`,
    );
  }
  if (missing.length) {
    console.log(`  ${missing.length} indexed path${missing.length === 1 ? "" : "s"} not on disk; skipped`);
  }

  const counts = { created: 0, updated: 0, skipped: 0, unsupported: 0, failed: 0 };
  const skippedKinds = new Map();
  const failures = [];
  const startedAt = Date.now();
  let done = 0;
  let totalSourceBytes = 0;
  let totalThumbBytes = 0;

  await pool(chosen, CONCURRENCY, async (job) => {
    done += 1;
    const label = `[${done}/${chosen.length}]`;
    const transparent = job.useWebp;
    if (transparent && !webpAvailable) {
      counts.unsupported += 1;
      skippedKinds.set(job.extension, (skippedKinds.get(job.extension) ?? 0) + 1);
      process.stdout.write(`\r${label} skipped (no libwebp): ${path.relative(opts.publicDir, job.original)}${" ".repeat(20)}\n`);
      return;
    }
    const upToDate = !opts.force && isUpToDate(job.original, job.thumb);
    if (upToDate) {
      counts.skipped += 1;
      if (done % 100 === 0 || done === chosen.length) {
        process.stdout.write(`\r${label} ${counts.created} new, ${counts.updated} updated, ${counts.skipped} unchanged…${" ".repeat(10)}\n`);
      }
      return;
    }
    const existed = fs.existsSync(job.thumb);
    try {
      await encode(ffmpeg, job.original, job.thumb, transparent);
      if (existed) counts.updated += 1;
      else counts.created += 1;
      totalSourceBytes += fs.statSync(job.original).size;
      totalThumbBytes += fs.statSync(job.thumb).size;
      process.stdout.write(
        `\r${label} ${existed ? "updated" : "wrote"} ${path.relative(opts.publicDir, job.original)}${" ".repeat(24)}\n`,
      );
    } catch (error) {
      counts.failed += 1;
      failures.push(`${path.relative(opts.publicDir, job.original)}: ${error instanceof Error ? error.message : String(error)}`);
      process.stdout.write(`\r${label} FAILED ${path.relative(opts.publicDir, job.original)}${" ".repeat(20)}\n`);
    }
  });

  // Thumbnails are derived files: anything in the folder that this run did not
  // produce (a changed source type, an older naming scheme) is removed, so the
  // index lists only real, current thumbnails. A --limit run is left alone.
  let pruned = 0;
  if (opts.limit === 0) {
    const intended = new Set(jobs.map((job) => path.resolve(job.thumb)));
    for (const file of walkIndexFiles(opts.outDir)) {
      const full = path.join(opts.outDir, ...file.split("/").filter(Boolean));
      if (intended.has(path.resolve(full))) continue;
      fs.rmSync(full, { force: true });
      pruned += 1;
    }
  }

  const summary = writeIndex(opts.outDir);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log(
    `${counts.created} written, ${counts.updated} updated, ${counts.skipped} unchanged, ` +
      `${counts.unsupported} skipped without transparency support, ${counts.failed} failed in ${seconds} s`,
  );
  if (pruned) console.log(`Removed ${pruned} stale thumbnail${pruned === 1 ? "" : "s"} no longer produced by the index`);
  if (totalThumbBytes > 0) {
    console.log(
      `Encoded pictures: ${formatBytes(totalSourceBytes)} of originals → ${formatBytes(totalThumbBytes)} of thumbnails ` +
        `(${(totalSourceBytes / Math.max(1, totalThumbBytes)).toFixed(1)}× smaller)`,
    );
  }
  for (const [extension, count] of skippedKinds) {
    console.log(`  skipped ${count} ${extension} source${count === 1 ? "" : "s"}: this FFmpeg has no libwebp encoder (transparency would be lost)`);
  }
  for (const failure of failures.slice(0, 10)) console.log(`  failed: ${failure}`);
  if (failures.length > 10) console.log(`  … and ${failures.length - 10} more failures`);
  console.log(
    `${path.relative(REPO_ROOT, opts.outDir) || opts.outDir}/index.json lists ${summary.files} thumbnail${summary.files === 1 ? "" : "s"} (${formatBytes(summary.bytes)}). Originals untouched.`,
  );
  return counts.failed > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`\nCould not build thumbnails: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

export { WIDTH, resolveOriginal, thumbPathFor, isUpToDate, hasLibwebp, writeIndex, parseArgs };
