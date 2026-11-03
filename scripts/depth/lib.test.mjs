import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, modelCacheDir } from "./models.mjs";
import {
  UserError,
  depthMapRefFor,
  findPicturesByName,
  nextArchiveName,
  parseArgs,
  parseWorkerJson,
  pngSize,
  pythonCandidates,
  resolvePicture,
} from "./lib.mjs";

let publicDir;

function touch(ref) {
  const file = path.join(publicDir, ...ref.split("/").filter(Boolean));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
}

beforeAll(() => {
  publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-depth-lib-"));
  touch("/film/img/montage/m4-railway-rain.jpg");
  touch("/film/img/s1/01-backstreet.jpg");
  touch("/film/img/s2/01-backstreet.jpg");
  touch("/film/img/archive/s1/01-backstreet--v1.jpg");
  touch("/film/img/s14a/337-engine-off.jpg");
  touch("/film/audio/not-a-picture.mp3");
});

afterAll(() => {
  fs.rmSync(publicDir, { recursive: true, force: true });
});

describe("where a picture's depth map lives", () => {
  it("follows the film's own layout", () => {
    expect(depthMapRefFor("/film/img/montage/m4-railway-rain.jpg")).toBe("/film/depth/montage/m4-railway-rain/depth.png");
    expect(depthMapRefFor("/film/img/s14a/337-engine-off.jpg")).toBe("/film/depth/s14a/337-engine-off/depth.png");
    expect(depthMapRefFor("/film/img/s1/a.png?v=2")).toBe("/film/depth/s1/a/depth.png");
    expect(depthMapRefFor("/film/img/retakes_2026_10_25/137-x-r1.webp")).toBe("/film/depth/retakes_2026_10_25/137-x-r1/depth.png");
  });

  it("refuses anything that is not a picture of the film", () => {
    expect(() => depthMapRefFor("/img/x.jpg")).toThrow(UserError);
    expect(() => depthMapRefFor("/film/img/x.gif")).toThrow(UserError);
    expect(() => depthMapRefFor("/film/audio/x.mp3")).toThrow(UserError);
  });
});

describe("finding the picture that was meant", () => {
  it("takes its film path, a public/ path, a Windows path, or a path on disk", () => {
    const expected = "/film/img/montage/m4-railway-rain.jpg";
    expect(resolvePicture("/film/img/montage/m4-railway-rain.jpg", publicDir).ref).toBe(expected);
    expect(resolvePicture("film/img/montage/m4-railway-rain.jpg", publicDir).ref).toBe(expected);
    expect(resolvePicture("public/film/img/montage/m4-railway-rain.jpg", publicDir).ref).toBe(expected);
    expect(resolvePicture("film\\img\\montage\\m4-railway-rain.jpg", publicDir).ref).toBe(expected);
    expect(resolvePicture("montage/m4-railway-rain.jpg", publicDir).ref).toBe(expected);
    expect(resolvePicture(path.join(publicDir, "film", "img", "montage", "m4-railway-rain.jpg"), publicDir).ref).toBe(expected);
    expect(resolvePicture("/film/img/montage/m4-railway-rain.jpg", publicDir).file).toBe(path.join(publicDir, "film", "img", "montage", "m4-railway-rain.jpg"));
  });

  it("takes just the file name when it is unique, with or without the extension", () => {
    expect(resolvePicture("m4-railway-rain", publicDir).ref).toBe("/film/img/montage/m4-railway-rain.jpg");
    expect(resolvePicture("337-engine-off.jpg", publicDir).ref).toBe("/film/img/s14a/337-engine-off.jpg");
    expect(resolvePicture("M4-Railway-Rain", publicDir).ref).toBe("/film/img/montage/m4-railway-rain.jpg");
  });

  it("asks which one when a name is ambiguous, and never offers archived versions", () => {
    expect(findPicturesByName(publicDir, "01-backstreet")).toEqual(["/film/img/s1/01-backstreet.jpg", "/film/img/s2/01-backstreet.jpg"]);
    expect(() => resolvePicture("01-backstreet", publicDir)).toThrow(/matches 2 pictures/);
  });

  it("explains a mistake instead of guessing", () => {
    expect(() => resolvePicture("", publicDir)).toThrow(/Say which picture/);
    expect(() => resolvePicture("no-such-picture", publicDir)).toThrow(/No picture named/);
    expect(() => resolvePicture("/film/img/s1/missing.jpg", publicDir)).toThrow(/no picture at/);
    expect(() => resolvePicture("/film/audio/not-a-picture.mp3", publicDir)).toThrow(/not a picture/);
    expect(() => resolvePicture(path.join(os.tmpdir(), "elsewhere.jpg"), publicDir)).toThrow(/not inside/);
  });
});

describe("keeping the old map", () => {
  it("names the next free archive file", () => {
    expect(nextArchiveName([])).toBe("depth--v1.png");
    expect(nextArchiveName(["depth.png"])).toBe("depth--v1.png");
    expect(nextArchiveName(["depth.png", "depth--v1.png"])).toBe("depth--v2.png");
    expect(nextArchiveName(["depth--v1.png", "depth--v3.png", "plate.jpg"])).toBe("depth--v4.png");
    expect(nextArchiveName(["depth--v10.png", "depth--v9.png"])).toBe("depth--v11.png");
  });
});

describe("the command line", () => {
  it("reads a picture and the modes", () => {
    expect(parseArgs(["m4-railway-rain"])).toMatchObject({ picture: "m4-railway-rain", fit: undefined, check: false, replace: false, gpu: false });
    expect(parseArgs(["pic", "--fit"]).fit).toBe(true);
    expect(parseArgs(["--fit", "pic"])).toMatchObject({ picture: "pic", fit: true });
    expect(parseArgs(["pic", "--fit", "other.png"])).toMatchObject({ picture: "pic", fit: "other.png" });
    expect(parseArgs(["pic", "--fit=other.png"]).fit).toBe("other.png");
    expect(parseArgs(["pic", "--check"]).check).toBe(true);
    expect(parseArgs(["pic", "--replace", "--gpu"])).toMatchObject({ replace: true, gpu: true });
    expect(parseArgs(["pic", "--model", "large", "--smooth", "2.5"])).toMatchObject({ model: "large", smooth: 2.5 });
    expect(parseArgs(["pic", "--model=small", "--smooth=0"])).toMatchObject({ model: "small", smooth: 0 });
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("refuses what makes no sense", () => {
    expect(() => parseArgs(["pic", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["a", "b"])).toThrow(/Only one picture/);
    expect(() => parseArgs(["pic", "--fit", "--replace"])).toThrow(/different things/);
    expect(() => parseArgs(["pic", "--check", "--replace"])).toThrow(/only measures/);
    expect(() => parseArgs(["pic", "--smooth", "99"])).toThrow(/0 to 20/);
    expect(() => parseArgs(["pic", "--smooth", "soft"])).toThrow(/0 to 20/);
    expect(() => parseArgs(["pic", "--model"])).toThrow(/needs a value/);
  });
});

describe("finding Python", () => {
  it("tries a chosen one, then the project's own environment, then the system's", () => {
    const linux = pythonCandidates({ platform: "linux", repoRoot: "/repo", env: { SCARLET_KEYFRAME_PYTHON: "python3.12 -X utf8" } });
    expect(linux[0]).toMatchObject({ cmd: "python3.12", args: ["-X", "utf8"] });
    expect(linux[1]).toMatchObject({ cmd: path.join("/repo", ".depth-venv", "bin", "python"), venv: true });
    expect(linux.map((c) => c.cmd).slice(2)).toEqual(["python3", "python"]);

    const windows = pythonCandidates({ platform: "win32", repoRoot: "C:\\repo", env: {} });
    expect(windows[0].cmd).toContain("Scripts");
    expect(windows.map((c) => c.label).slice(1)).toEqual(["py -3", "python"]);
  });
});

describe("the models", () => {
  it("are pinned: https GitHub release files with a size and a SHA-256", () => {
    for (const [name, spec] of Object.entries(MODELS)) {
      expect(spec.url, name).toMatch(/^https:\/\/github\.com\/fabio-sim\/Depth-Anything-ONNX\/releases\/download\/v2\.0\.0\/depth_anything_v2_vit[sbl]\.onnx$/);
      expect(spec.sha256, name).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.bytes, name).toBeGreaterThan(50_000_000);
      expect(spec.url.endsWith(spec.file), name).toBe(true);
    }
    expect(MODELS[DEFAULT_MODEL]).toBeDefined();
  });

  it("are kept in a cache folder per platform, or where SCARLET_KEYFRAME_MODELS says", () => {
    const home = path.join(path.sep, "home", "me");
    expect(modelCacheDir({ env: { SCARLET_KEYFRAME_MODELS: "/tmp/m" }, platform: "linux", homedir: home })).toBe(path.resolve("/tmp/m"));
    expect(modelCacheDir({ env: {}, platform: "linux", homedir: home })).toBe(path.join(home, ".cache", "scarlet-keyframe", "models"));
    expect(modelCacheDir({ env: { XDG_CACHE_HOME: "/x" }, platform: "linux", homedir: home })).toBe(path.join("/x", "scarlet-keyframe", "models"));
    expect(modelCacheDir({ env: {}, platform: "darwin", homedir: home })).toBe(path.join(home, "Library", "Caches", "scarlet-keyframe", "models"));
    expect(modelCacheDir({ env: { LOCALAPPDATA: "C:\\L" }, platform: "win32", homedir: home })).toBe(path.join("C:\\L", "scarlet-keyframe", "models"));
  });
});

describe("reading what the worker says", () => {
  it("takes the last JSON line that has an ok field and ignores other output", () => {
    const out = ["loading…", '{"progress": 1}', '{"ok": true, "width": 4}', "", '{"ok": false, "error": "no-model"}'].join("\n");
    expect(parseWorkerJson(out)).toEqual({ ok: false, error: "no-model" });
    expect(parseWorkerJson('noise\n{"ok": true, "width": 4}\ntrailing text')).toEqual({ ok: true, width: 4 });
    expect(parseWorkerJson("nothing useful")).toBeNull();
    expect(parseWorkerJson("")).toBeNull();
  });

  it("reads a PNG's size from its header", () => {
    const header = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
    header.writeUInt32BE(13, 8);
    header.write("IHDR", 12, "ascii");
    header.writeUInt32BE(2668, 16);
    header.writeUInt32BE(1500, 20);
    const file = path.join(publicDir, "size.png");
    fs.writeFileSync(file, header);
    expect(pngSize(file)).toEqual({ width: 2668, height: 1500 });
    fs.writeFileSync(file, Buffer.from("not a png at all, just text"));
    expect(pngSize(file)).toBeNull();
  });
});
