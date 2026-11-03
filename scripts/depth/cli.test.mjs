// End-to-end tests of `npm run depth` with a tiny stand-in model (fixtures/tiny-depth.onnx: depth = brightness), so
// nothing is downloaded. They need Python with numpy, opencv-python-headless and onnxruntime (npm run depth:setup);
// without them these tests are skipped and the pure helpers are still tested in lib.test.mjs.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESULT_MARKER, parseResultLine, pngSize, pythonCandidates } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const CLI = path.join(repoRoot, "scripts", "make-depth.mjs");
const MODEL = path.join(here, "fixtures", "tiny-depth.onnx");
const CHECK_IMAGE = path.join(repoRoot, "exports", "depth", "pic-fit-check.jpg");

function findPython() {
  for (const candidate of pythonCandidates({ repoRoot })) {
    const probe = spawnSync(candidate.cmd, [...candidate.args, "-c", "import cv2, numpy, onnxruntime"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const python = findPython();
const suite = python ? describe : describe.skip;

const HELPER = `
import sys, cv2, numpy as np
def read(p): return cv2.imread(p, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
if sys.argv[1] == "squeeze":
    # what a map made elsewhere looks like: another shape, content squeezed 3% and shifted, a dark border
    src = read(sys.argv[2]); h, w = src.shape
    sx, tx = 0.97, 0.0155
    u = (np.arange(1408) + 0.5) / 1408; v = (np.arange(768) + 0.5) / 768
    mx = np.tile((((u - tx) / sx) * w - 0.5).astype(np.float32), (768, 1))
    my = np.tile((v * h - 0.5).astype(np.float32)[:, None], (1, 1408))
    out = cv2.remap(src, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out[:, :8] = 0; out[:, -8:] = 0; out[:6] = 0; out[-6:] = 0
    cv2.imwrite(sys.argv[3], (out * 255 + 0.5).astype(np.uint8))
elif sys.argv[1] == "error":
    ref, fitted, squeezed = (read(p) for p in sys.argv[2:5])
    h, w = ref.shape
    stretched = cv2.resize(squeezed, (w, h), interpolation=cv2.INTER_CUBIC)
    inner = (slice(int(h * .08), -int(h * .08)), slice(int(w * .08), -int(w * .08)))
    print(float(np.abs(fitted[inner] - ref[inner]).mean()), float(np.abs(stretched[inner] - ref[inner]).mean()))
`;

let work;
let publicDir;
let mapFolder;
let ffmpeg;

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function depth(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, SCARLET_KEYFRAME_PUBLIC: publicDir },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function helper(...args) {
  return execFileSync(python.cmd, [...python.args, path.join(work, "helper.py"), ...args], { encoding: "utf8" }).trim();
}

suite("npm run depth, end to end", () => {
  beforeAll(async () => {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const info = mod.default ?? mod;
    ffmpeg = typeof info === "string" ? info : info.path;
    work = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-depth-cli-"));
    publicDir = path.join(work, "public");
    mapFolder = path.join(publicDir, "film", "depth", "t", "pic");
    fs.mkdirSync(path.join(publicDir, "film", "img", "t"), { recursive: true });
    fs.writeFileSync(path.join(work, "helper.py"), HELPER);
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1600x900:duration=1:rate=1", "-frames:v", "1", path.join(publicDir, "film", "img", "t", "pic.jpg")], { stdio: "pipe" });
  }, 120000);

  afterAll(() => {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(CHECK_IMAGE, { force: true });
  });

  it("makes a map at the picture's exact size", () => {
    const run = depth(["pic", "--model-file", MODEL]);
    expect(run.err).toBe("");
    expect(run.status).toBe(0);
    expect(run.out).toContain("Wrote");
    expect(pngSize(path.join(mapFolder, "depth.png"))).toEqual({ width: 1600, height: 900 });
  }, 90000);

  it("will not make a second map by accident, and says what to do", () => {
    const before = sha(path.join(mapFolder, "depth.png"));
    const run = depth(["pic", "--model-file", MODEL]);
    expect(run.status).toBe(1);
    expect(run.err).toContain("already has a depth map");
    expect(run.err).toContain("--fit");
    expect(sha(path.join(mapFolder, "depth.png"))).toBe(before);
  }, 60000);

  it("--check measures and changes nothing", () => {
    const before = sha(path.join(mapFolder, "depth.png"));
    const run = depth(["pic", "--check", "--model-file", MODEL]);
    expect(run.status).toBe(0);
    expect(run.out).toContain("agreement");
    expect(fs.readdirSync(mapFolder)).toEqual(["depth.png"]);
    expect(sha(path.join(mapFolder, "depth.png"))).toBe(before);
  }, 90000);

  it("--replace makes a new map and keeps the old one byte for byte", () => {
    const first = sha(path.join(mapFolder, "depth.png"));
    const run = depth(["pic", "--replace", "--smooth", "0", "--model-file", MODEL]);
    expect(run.status).toBe(0);
    expect(run.out).toContain("kept as");
    expect(sha(path.join(mapFolder, "depth--v1.png"))).toBe(first);
    expect(sha(path.join(mapFolder, "depth.png"))).not.toBe(first);
    expect(fs.readdirSync(mapFolder).sort()).toEqual(["depth--v1.png", "depth.png"]);
  }, 90000);

  describe("--json (what the editor's Make depth map button reads)", () => {
    const lastLine = (text) => text.trim().split(/\r?\n/).pop();

    beforeAll(() => {
      fs.copyFileSync(path.join(publicDir, "film", "img", "t", "pic.jpg"), path.join(publicDir, "film", "img", "t", "pic2.jpg"));
    });

    it("ends with one @@result line that says where the map is and how big", () => {
      const run = depth(["pic2", "--model-file", MODEL, "--json"]);
      expect(run.status).toBe(0);
      expect(lastLine(run.out).startsWith(RESULT_MARKER)).toBe(true);
      const result = parseResultLine(run.out);
      expect(result).toMatchObject({
        ok: true,
        mode: "make",
        picture: "/film/img/t/pic2.jpg",
        map: "/film/depth/t/pic2/depth.png",
        written: true,
        width: 1600,
        height: 900,
        provider: "cpu",
        archived: null,
      });
      expect(result.bytes).toBe(fs.statSync(path.join(publicDir, "film", "depth", "t", "pic2", "depth.png")).size);
      expect(typeof result.seconds).toBe("number");
    }, 90000);

    it("says so in the same line when it cannot, and still exits 1 with the message on stderr", () => {
      const run = depth(["pic2", "--model-file", MODEL, "--json"]);
      expect(run.status).toBe(1);
      expect(run.err).toContain("already has a depth map");
      const result = parseResultLine(run.out);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("already has a depth map");
    }, 60000);

    it("reports the copy it kept when it replaces a map", () => {
      const run = depth(["pic2", "--replace", "--smooth", "0", "--model-file", MODEL, "--json"]);
      expect(run.status).toBe(0);
      expect(parseResultLine(run.out)).toMatchObject({ ok: true, written: true, archived: "depth--v1.png" });
    }, 90000);

    it("a plain run (no --json) prints no result line", () => {
      const run = depth(["pic2", "--check", "--model-file", MODEL]);
      expect(run.status).toBe(0);
      expect(run.out).not.toContain(RESULT_MARKER);
    }, 90000);
  });

  it("--fit lines up a map of another shape and keeps the one that was there", () => {
    const original = path.join(work, "original.png");
    fs.copyFileSync(path.join(mapFolder, "depth.png"), original);
    const squeezed = path.join(work, "squeezed.png");
    helper("squeeze", original, squeezed);
    expect(pngSize(squeezed)).toEqual({ width: 1408, height: 768 });

    const run = depth(["pic", `--fit=${squeezed}`, "--model-file", MODEL]);
    expect(run.status).toBe(0);
    expect(run.out).toContain("out of place");
    expect(run.out).toContain("Wrote");
    expect(pngSize(path.join(mapFolder, "depth.png"))).toEqual({ width: 1600, height: 900 });
    expect(sha(path.join(mapFolder, "depth--v2.png"))).toBe(sha(original));
    expect(fs.existsSync(CHECK_IMAGE)).toBe(true);

    const [fitted, stretched] = helper("error", original, path.join(mapFolder, "depth.png"), squeezed).split(" ").map(Number);
    expect(fitted).toBeLessThan(stretched * 0.6);
  }, 120000);

  it("leaves a map that already lines up alone", () => {
    const before = sha(path.join(mapFolder, "depth.png"));
    const run = depth(["pic", "--fit", "--model-file", MODEL]);
    expect(run.status).toBe(0);
    expect(run.out).toContain("already lines up");
    expect(sha(path.join(mapFolder, "depth.png"))).toBe(before);
    expect(fs.existsSync(path.join(mapFolder, "depth--v3.png"))).toBe(false);
  }, 90000);

  it("says plainly when the picture cannot be found", () => {
    const run = depth(["no-such-picture", "--model-file", MODEL]);
    expect(run.status).toBe(1);
    expect(run.err).toContain("No picture named");
  }, 30000);
});

suite("the fitting maths (scripts/depth/test_fit.py, no model needed)", () => {
  it("recovers a known squeeze and shift, and leaves a map that already fits alone", () => {
    const run = spawnSync(python.cmd, [...python.args, path.join(here, "test_fit.py")], { encoding: "utf8" });
    expect(run.stdout).toContain("all passed");
    expect(run.status).toBe(0);
  }, 120000);
});

suite("the depth worker's safety nets (scripts/depth/test_worker.py, no model needed)", () => {
  it("does the work again on the CPU when the GPU stops, and answers a crash as JSON", () => {
    const run = spawnSync(python.cmd, [...python.args, path.join(here, "test_worker.py")], { encoding: "utf8" });
    expect(run.stdout).toContain("all passed");
    expect(run.status).toBe(0);
  }, 120000);
});
