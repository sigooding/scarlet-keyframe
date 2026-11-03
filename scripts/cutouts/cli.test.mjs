// `npm run cutouts`, end to end, with tiny stand-in models (fixtures/, made by make_fixtures.py) so nothing is downloaded.
// They need Python with numpy, opencv-python-headless and onnxruntime (npm run depth:setup); without them the end-to-end
// tests are skipped and the pure helpers are still tested.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESULT_MARKER, UserError, nextRunName, parseResultLine, pngSize, pythonCandidates, resolveSourceMap } from "../depth/lib.mjs";
import { parseCutoutArgs } from "../make-cutouts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const CLI = path.join(repoRoot, "scripts", "make-cutouts.mjs");
const FIX = path.join(here, "fixtures");
const MODELS = ["--people-model", path.join(FIX, "tiny-people.onnx"), "--matte-model", path.join(FIX, "tiny-matte.onnx"), "--inpaint-model", path.join(FIX, "tiny-lama.onnx"), "--depth-model", path.join(repoRoot, "scripts", "depth", "fixtures", "tiny-depth.onnx")];
const W = 1280;
const H = 720;

// ---- the pure helpers -----------------------------------------------------------------------------------------------

describe("the command line", () => {
  it("reads a picture, a quality and a source map", () => {
    expect(parseCutoutArgs(["pic"])).toMatchObject({ picture: "pic", quality: "best", sourceMap: undefined, cpu: false, json: false });
    expect(parseCutoutArgs(["pic", "--quality", "fast", "--json", "--cpu"])).toMatchObject({ quality: "fast", json: true, cpu: true });
    expect(parseCutoutArgs(["--quality=fast", "pic"])).toMatchObject({ picture: "pic", quality: "fast" });
    expect(parseCutoutArgs(["pic", "--source-map", "/film/depth/a/b/depth.png"]).sourceMap).toBe("/film/depth/a/b/depth.png");
    expect(parseCutoutArgs(["pic", "--gpu"]).cpu).toBe(false);
  });

  it("reads model files by role", () => {
    expect(parseCutoutArgs(["pic", "--people-model", "p.onnx", "--matte-model=m.onnx", "--inpaint-model", "i.onnx", "--depth-model", "d.onnx"]).models).toEqual({
      people: "p.onnx",
      matte: "m.onnx",
      inpaint: "i.onnx",
      depth: "d.onnx",
    });
  });

  it("refuses what makes no sense", () => {
    expect(() => parseCutoutArgs(["pic", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseCutoutArgs(["a", "b"])).toThrow(/Only one picture/);
    expect(() => parseCutoutArgs(["pic", "--quality"])).toThrow(/needs a value/);
    expect(() => parseCutoutArgs(["pic", "--quality", "ultra"])).toThrow(/Unknown quality/);
    expect(() => parseCutoutArgs(["pic", "--people-model", "--json"])).toThrow(/needs a value/);
  });
});

describe("each run gets a folder of its own", () => {
  it("is the next number, counting a stopped run's .part", () => {
    expect(nextRunName([])).toBe("people-1");
    expect(nextRunName(["depth.png", "plate.jpg"])).toBe("people-1");
    expect(nextRunName(["people-1", "people-2"])).toBe("people-3");
    expect(nextRunName(["people-1", "people-4.part"])).toBe("people-5");
    expect(nextRunName(["people-x", "people-2--old"])).toBe("people-1");
  });
});

describe("the depth map to keep", () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-cutouts-src-"));
    fs.mkdirSync(path.join(dir, "film", "depth", "s1", "pic"), { recursive: true });
    fs.writeFileSync(path.join(dir, "film", "depth", "s1", "pic", "depth.png"), "x");
    fs.mkdirSync(path.join(dir, "film", "img", "s1"), { recursive: true });
    fs.writeFileSync(path.join(dir, "film", "img", "s1", "pic.png"), "x");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("is a depth map under /film/depth/ that exists", () => {
    expect(resolveSourceMap("/film/depth/s1/pic/depth.png", dir)).toEqual({ ref: "/film/depth/s1/pic/depth.png", file: path.join(dir, "film", "depth", "s1", "pic", "depth.png") });
    expect(resolveSourceMap("film/depth/s1/pic/depth.png?x=1", dir).ref).toBe("/film/depth/s1/pic/depth.png");
    expect(resolveSourceMap("public/film/depth/s1/pic/depth.png", dir).ref).toBe("/film/depth/s1/pic/depth.png");
  });

  it("is nothing else: not a picture, not outside, not climbing, not missing", () => {
    for (const bad of ["/film/img/s1/pic.png", "/etc/passwd", "/film/depth/../img/s1/pic.png", "/film/depth/s1/../../img/s1/pic.png", "/film/depth/s1/pic/depth.txt", "", "/film/depth/s1/./pic/depth.png"]) {
      expect(() => resolveSourceMap(bad, dir), bad).toThrow(UserError);
    }
    expect(() => resolveSourceMap("/film/depth/s1/missing/depth.png", dir)).toThrow(/no depth map at/);
  });
});

// ---- end to end ---------------------------------------------------------------------------------------------------

function pythonWithPackages() {
  for (const candidate of pythonCandidates({ repoRoot })) {
    if (spawnSync(candidate.cmd, [...candidate.args, "-c", "import cv2, numpy, onnxruntime"], { stdio: "ignore" }).status === 0) return candidate;
  }
  return null;
}

(pythonWithPackages() ? describe : describe.skip)("npm run cutouts, end to end", () => {
  let work;
  let publicDir;
  let ffmpeg;
  let ffprobe;
  const folder = (...parts) => path.join(publicDir, "film", "depth", "t", "pic", ...parts);
  const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

  function cutouts(args) {
    const run = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, SCARLET_KEYFRAME_PUBLIC: publicDir } });
    return { status: run.status, out: run.stdout, err: run.stderr, result: parseResultLine(run.stdout) };
  }

  /** Raw pixels of an image file, through ffmpeg: Buffer of width*height*channels. */
  function pixels(file, pixFmt) {
    return execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", pixFmt, "-"], { maxBuffer: 64 * 1024 * 1024 });
  }
  const at = (buffer, channels, x, y) => [...buffer.subarray((y * W + x) * channels, (y * W + x) * channels + channels)];
  const size = (file) => {
    const [width, height] = execFileSync(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file], { encoding: "utf8" }).trim().split("x").map(Number);
    return { width, height };
  };

  beforeAll(async () => {
    ffmpeg = (await import("@ffmpeg-installer/ffmpeg")).default.path;
    ffprobe = (await import("@ffprobe-installer/ffprobe")).default.path;
    work = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-cutouts-"));
    publicDir = path.join(work, "public");
    fs.mkdirSync(path.join(publicDir, "film", "img", "t"), { recursive: true });
    // the test picture: dark grey, with a bright white rectangle (the stand-in "person") at x 400-700, y 200-650
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=0x202020:s=${W}x${H}:d=1,drawbox=x=400:y=200:w=300:h=450:color=white:t=fill`, "-frames:v", "1", "-q:v", "2", path.join(publicDir, "film", "img", "t", "pic.jpg")]);
    // a picture with nobody in it
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=0x303030:s=${W}x${H}:d=1`, "-frames:v", "1", "-q:v", "2", path.join(publicDir, "film", "img", "t", "empty.jpg")]);
    // a depth map somebody made: flat mid grey, the exact size of the picture
    fs.mkdirSync(path.join(work, "src"), { recursive: true });
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=0x808080:s=${W}x${H}:d=1`, "-frames:v", "1", path.join(work, "src", "given.png")]);
  }, 120000);

  afterAll(() => fs.rmSync(work, { recursive: true, force: true }));

  it("cuts the person out, paints the plate, fills the depth map, and writes a review sheet in a folder of its own", () => {
    const run = cutouts(["pic", "--json", "--cpu", ...MODELS]);
    expect(run.err).toContain("1/5 finding the people");
    expect(run.status, run.out + run.err).toBe(0);
    expect(run.out.trim().split("\n").pop().startsWith(RESULT_MARKER)).toBe(true);
    const r = run.result;
    expect(r).toMatchObject({
      ok: true,
      written: true,
      picture: "/film/img/t/pic.jpg",
      folder: "/film/depth/t/pic/people-1",
      depthMap: "/film/depth/t/pic/people-1/depth.png",
      plate: "/film/depth/t/pic/people-1/plate.jpg",
      review: "/film/depth/t/pic/people-1/review.jpg",
      quality: "best",
      width: W,
      height: H,
      seen: 1,
      leftOut: 0,
      provider: "cpu",
      source: "model",
    });
    expect(r.cutouts).toHaveLength(1);
    expect(r.cutouts[0].image).toBe("/film/depth/t/pic/people-1/cutout-1.png");
    expect(r.cutouts[0].depth).toBeGreaterThanOrEqual(0);
    expect(r.cutouts[0].depth).toBeLessThanOrEqual(1);
    // the box is the person's, widened by 6%
    const [bx, by, bw, bh] = r.cutouts[0].box;
    expect(bx).toBeLessThanOrEqual(400);
    expect(bx + bw).toBeGreaterThanOrEqual(700);
    expect(by).toBeLessThanOrEqual(200);
    expect(by + bh).toBeGreaterThanOrEqual(650);
    expect(bw).toBeLessThan(400);
    expect(r.flags.filter((flag) => /empty|clipped|still found/.test(flag))).toEqual([]);

    const files = fs.readdirSync(folder("people-1")).sort();
    expect(files).toEqual(["cutout-1.png", "depth.png", "plate.jpg", "review.jpg"]);
    for (const name of files) expect(size(folder("people-1", name)), name).toMatchObject(name === "review.jpg" ? { width: 1280, height: 720 } : { width: W, height: H });
    expect(pngSize(folder("people-1", "depth.png"))).toEqual({ width: W, height: H });

    // the cut-out: opaque on the person, transparent everywhere else
    const rgba = pixels(folder("people-1", "cutout-1.png"), "rgba");
    expect(at(rgba, 4, 550, 425)[3]).toBe(255);
    expect(at(rgba, 4, 550, 425).slice(0, 3)).toEqual([255, 255, 255]);
    expect(at(rgba, 4, 100, 100)[3]).toBe(0);
    expect(at(rgba, 4, 1000, 600)[3]).toBe(0);
    // the plate: where the person was the model painted (the stand-in paints black); the rest is the picture
    const plate = pixels(folder("people-1", "plate.jpg"), "rgb24");
    expect(Math.max(...at(plate, 3, 550, 425))).toBeLessThan(12);
    expect(at(plate, 3, 100, 100)[0]).toBeGreaterThan(24);
    expect(at(plate, 3, 100, 100)[0]).toBeLessThan(40);
    // the depth map: the stand-in model says "bright is near", so the person is nearest; the map has them painted out
    const depth = pixels(folder("people-1", "depth.png"), "gray");
    expect(depth[425 * W + 550]).toBeLessThan(depth[100 * W + 100] + 40);
  }, 120000);

  it("never overwrites: the next run is people-2 and the first is untouched", () => {
    const before = sha(folder("people-1", "cutout-1.png"));
    const run = cutouts(["pic", "--json", "--cpu", ...MODELS]);
    expect(run.status).toBe(0);
    expect(run.result.folder).toBe("/film/depth/t/pic/people-2");
    expect(fs.readdirSync(folder("people-2")).sort()).toEqual(["cutout-1.png", "depth.png", "plate.jpg", "review.jpg"]);
    expect(sha(folder("people-1", "cutout-1.png"))).toBe(before);
  }, 120000);

  it("keeps a depth map somebody made and paints the people out of it, unsoftened", () => {
    fs.mkdirSync(folder(), { recursive: true });
    fs.copyFileSync(path.join(work, "src", "given.png"), folder("depth.png"));
    const given = sha(folder("depth.png"));
    const run = cutouts(["pic", "--json", "--cpu", "--source-map", "/film/depth/t/pic/depth.png", ...MODELS.slice(0, 6)]);
    expect(run.status, run.out + run.err).toBe(0);
    expect(run.result).toMatchObject({ written: true, source: "given", folder: "/film/depth/t/pic/people-3" });
    expect(sha(folder("depth.png"))).toBe(given);
    const depth = pixels(folder("people-3", "depth.png"), "gray");
    for (const [x, y] of [[550, 425], [100, 100], [1000, 600]]) expect(Math.abs(depth[y * W + x] - 128), `${x},${y}`).toBeLessThanOrEqual(2);
    // the model that makes depth was not needed (none was given, and none was fetched)
    expect(run.err).toContain("your map, kept as it is");
    expect(run.out + run.err).not.toContain("Downloading");
  }, 120000);

  it("writes nothing for a picture with nobody in it, and says what to do", () => {
    const before = fs.readdirSync(path.join(publicDir, "film"));
    const run = cutouts(["empty", "--json", "--cpu", ...MODELS]);
    expect(run.status).toBe(0);
    expect(run.result).toMatchObject({ ok: true, written: false, reason: "no-people", seen: 0 });
    expect(run.out).toContain("npm run depth -- empty");
    expect(fs.existsSync(path.join(publicDir, "film", "depth", "t", "empty"))).toBe(false);
    expect(fs.readdirSync(path.join(publicDir, "film"))).toEqual(before);
  }, 120000);

  it("says plainly what is wrong, in the same line a program reads", () => {
    const check = (args, message) => {
      const run = cutouts([...args, "--json"]);
      expect(run.status, args.join(" ")).toBe(1);
      expect(run.result.ok).toBe(false);
      expect(run.result.message).toMatch(message);
      expect(run.err).toMatch(message);
    };
    check(["nope", "--cpu"], /No picture named "nope"/);
    check(["pic", "--quality", "ultra"], /Unknown quality/);
    check(["pic", "--source-map", "/film/img/t/pic.jpg", ...MODELS.slice(0, 6)], /not a depth map under public\/film\/depth/);
    check(["pic", "--people-model", path.join(work, "nothing.onnx"), "--matte-model", MODELS[3], "--inpaint-model", MODELS[5], "--depth-model", MODELS[7]], /No people model file at/);
  }, 120000);

  it("a stopped or failed run leaves no half-made folder behind", () => {
    const names = fs.readdirSync(path.join(publicDir, "film", "depth", "t", "pic"));
    expect(names.filter((name) => name.endsWith(".part"))).toEqual([]);
  });
});

(pythonWithPackages() ? describe : describe.skip)("the decisions inside the worker (scripts/cutouts/test_pipeline.py, no real models)", () => {
  it("chooses the figures, the depth, and the warnings sensibly", () => {
    const python = pythonWithPackages();
    const run = spawnSync(python.cmd, [...python.args, path.join(here, "test_pipeline.py")], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("ok test_flags");
    expect(run.stdout).toContain("ok test_yolox_decode_finds_a_person_and_ignores_the_rest");
  }, 60000);
});
