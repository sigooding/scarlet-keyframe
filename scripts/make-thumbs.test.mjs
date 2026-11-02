import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "make-thumbs.mjs");

let ffmpegPath;
let ffprobePath;
let workDir;
let publicDir;
let outDir;
let indexFile;

function makePicture(target, args) {
  execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args, target], {
    stdio: "pipe",
  });
}

function runScript(extraArgs = []) {
  return execFileSync(
    process.execPath,
    [SCRIPT, "--index", indexFile, "--public", publicDir, "--out", outDir, "--assets", path.join(workDir, "no-assets"), ...extraArgs],
    { encoding: "utf8", env: { ...process.env, FFMPEG: ffmpegPath } },
  );
}

function readIndex() {
  const payload = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf8"));
  expect(payload.width).toBe(400);
  return payload.files;
}

beforeAll(async () => {
  const mod = await import("@ffmpeg-installer/ffmpeg");
  const info = mod.default ?? mod;
  ffmpegPath = typeof info === "string" ? info : info.path;
  const probe = await import("@ffprobe-installer/ffprobe");
  const probeInfo = probe.default ?? probe;
  ffprobePath = typeof probeInfo === "string" ? probeInfo : probeInfo.path;

  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-thumbs-"));
  publicDir = path.join(workDir, "public");
  outDir = path.join(publicDir, "thumbs");
  fs.mkdirSync(path.join(publicDir, "film", "img", "s1 sub"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "sweet-jesus", "characters"), { recursive: true });

  makePicture(path.join(publicDir, "film", "img", "a-wide.jpg"), [
    "-f", "lavfi", "-i", "testsrc=size=1600x900:duration=1:rate=1", "-frames:v", "1",
  ]);
  makePicture(path.join(publicDir, "film", "img", "s1 sub", "small.jpg"), [
    "-f", "lavfi", "-i", "testsrc=size=300x200:duration=1:rate=1", "-frames:v", "1",
  ]);
  makePicture(path.join(publicDir, "sweet-jesus", "characters", "logo.png"), [
    "-f", "lavfi", "-i", "color=c=red@0.4:size=900x600,format=rgba", "-frames:v", "1",
  ]);
  // A file name with a space, like the real `/film/audio/Dark Hills Blues (1).wav`.
  makePicture(path.join(outDir, "..", "film", "img", "with space.jpg"), [
    "-f", "lavfi", "-i", "testsrc=size=800x600:duration=1:rate=1", "-frames:v", "1",
  ]);

  indexFile = path.join(workDir, "media-index.json");
  fs.writeFileSync(
    indexFile,
    JSON.stringify([
      "/film/img/a-wide.jpg",
      "/film/img/s1 sub/small.jpg",
      "/film/img/with space.jpg",
      "/sweet-jesus/characters/logo.png",
      "/film/img/not-on-disk.jpg",
      "/film/audio/a-song.mp3",
    ]),
  );
}, 120000);

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("npm run thumbs", () => {
  it("writes 400 px thumbnails, mirrors paths, and lists them", () => {
    const output = runScript();
    expect(output).toContain("4 written");
    expect(output).toContain("Originals untouched");

    const thumb = path.join(outDir, "film", "img", "a-wide.jpg");
    expect(fs.existsSync(thumb)).toBe(true);
    // The original is untouched: same size, still 1600 px wide.
    const original = path.join(publicDir, "film", "img", "a-wide.jpg");
    const probe = execFileSync(
      ffprobePath,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", thumb],
      { encoding: "utf8" },
    ).trim();
    expect(probe).toBe("400,226"); // 1600x900 scaled to 400 wide
    expect(fs.statSync(original).size).toBeGreaterThan(fs.statSync(thumb).size);

    // A picture narrower than 400 px is not enlarged.
    const smallProbe = execFileSync(
      ffprobePath,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(outDir, "film", "img", "s1 sub", "small.jpg")],
      { encoding: "utf8" },
    ).trim();
    expect(smallProbe).toBe("300,200");

    // A PNG keeps transparency as WebP; the name swaps extension.
    const logo = path.join(outDir, "sweet-jesus", "characters", "logo.webp");
    expect(fs.existsSync(logo)).toBe(true);
    expect(fs.existsSync(path.join(outDir, "sweet-jesus", "characters", "logo.png"))).toBe(false);

    const files = readIndex();
    expect(files).toEqual([
      "/film/img/a-wide.jpg",
      "/film/img/s1 sub/small.jpg",
      "/film/img/with space.jpg",
      "/sweet-jesus/characters/logo.webp",
    ]);
  }, 180000);

  it("skips thumbnails that are already up to date", () => {
    const output = runScript();
    expect(output).toContain("0 written");
    expect(output).toContain("4 unchanged");
  }, 120000);

  it("re-encodes only the picture whose original changed", () => {
    const original = path.join(publicDir, "film", "img", "s1 sub", "small.jpg");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(original, later, later);
    const output = runScript();
    expect(output).toContain("1 updated");
    expect(output).toContain("3 unchanged");
  }, 120000);

  it("leaves the originals byte-for-byte identical", () => {
    const before = fs.readFileSync(path.join(publicDir, "film", "img", "a-wide.jpg"));
    runScript(["--force"]);
    const after = fs.readFileSync(path.join(publicDir, "film", "img", "a-wide.jpg"));
    expect(after.equals(before)).toBe(true);
    expect(before.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // still a JPEG
  }, 180000);

  it("reports a picture that is missing from disk instead of failing", () => {
    const output = runScript();
    expect(output).toContain("1 indexed path not on disk");
  }, 120000);

  it("refuses an output folder that is not <public>/thumbs, and deletes nothing", () => {
    // A run deletes thumbnails it no longer produces. Pointed at a folder of
    // originals (or at public/ itself) it would delete them, so it stops first.
    const originalsFolder = path.join(publicDir, "film", "img");
    const before = fs.readdirSync(originalsFolder).sort();
    for (const target of [originalsFolder, publicDir, path.join(workDir, "elsewhere")]) {
      expect(() =>
        execFileSync(
          process.execPath,
          [SCRIPT, "--index", indexFile, "--public", publicDir, "--out", target, "--assets", path.join(workDir, "no-assets")],
          { encoding: "utf8", stdio: "pipe", env: { ...process.env, FFMPEG: ffmpegPath } },
        ),
      ).toThrow(/must be the "thumbs" folder/);
    }
    expect(fs.readdirSync(originalsFolder).sort()).toEqual(before);
    expect(fs.existsSync(path.join(workDir, "elsewhere"))).toBe(false);
  }, 60000);

  it("stops with a clear message when the index is missing", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [SCRIPT, "--index", path.join(workDir, "nope.json"), "--public", publicDir, "--out", outDir],
        { encoding: "utf8", stdio: "pipe", env: { ...process.env, FFMPEG: ffmpegPath } },
      ),
    ).toThrow(/Media index not found/);
  }, 60000);
});
