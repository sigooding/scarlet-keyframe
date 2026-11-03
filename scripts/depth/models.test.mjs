import { describe, expect, it } from "vitest";
import { ALL_MODELS, DEFAULT_QUALITY, MODELS, QUALITIES, modelCacheDir, modelIdsFor } from "./models.mjs";

describe("the model registry", () => {
  it("describes every model completely, with a pinned size and checksum and a link to where it came from", () => {
    for (const [id, spec] of Object.entries(ALL_MODELS)) {
      expect(["depth", "matte", "people", "inpaint"], id).toContain(spec.role);
      expect(spec.title, id).toBeTruthy();
      expect(spec.file, id).toMatch(/\.onnx$/);
      expect(spec.url, id).toMatch(/^https:\/\//);
      expect(spec.url.endsWith(spec.file), id).toBe(true);
      expect(spec.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(spec.bytes) && spec.bytes > 1_000_000, id).toBe(true);
      expect(spec.license, id).toBeTruthy();
      expect(spec.source, id).toMatch(/^https:\/\/github\.com\//);
      expect(spec.note, id).toBeTruthy();
    }
  });

  it("gives no two models the same file name", () => {
    const files = Object.values(ALL_MODELS).map((spec) => spec.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("keeps the depth models exactly as the depth command knows them", () => {
    expect(ALL_MODELS["depth-small"].sha256).toBe(MODELS.small.sha256);
    expect(ALL_MODELS["depth-base"].bytes).toBe(MODELS.base.bytes);
    expect(ALL_MODELS["depth-large"].file).toBe(MODELS.large.file);
  });

  it("says plainly which depth models are non-commercial", () => {
    expect(ALL_MODELS["depth-small"].license).toBe("Apache-2.0");
    expect(ALL_MODELS["depth-base"].license).toMatch(/non-commercial/i);
    expect(ALL_MODELS["depth-large"].license).toMatch(/non-commercial/i);
  });
});

describe("quality", () => {
  it("names only models that exist, one of each role", () => {
    for (const quality of Object.keys(QUALITIES)) {
      const set = QUALITIES[quality];
      expect(Object.keys(set).sort()).toEqual(["depth", "inpaint", "matte", "people"]);
      for (const [role, id] of Object.entries(set)) expect(ALL_MODELS[id].role, `${quality} ${role}`).toBe(role);
    }
    expect(Object.keys(QUALITIES)).toContain(DEFAULT_QUALITY);
  });

  it("best is the big set and fast the permissively licensed one", () => {
    const gb = (quality) => modelIdsFor(quality, "cutouts").reduce((sum, id) => sum + ALL_MODELS[id].bytes, 0) / 1e9;
    expect(gb("best")).toBeGreaterThan(2.7);
    expect(gb("best")).toBeLessThan(2.9);
    expect(gb("fast")).toBeLessThan(1);
    for (const id of modelIdsFor("fast", "cutouts")) expect(ALL_MODELS[id].license, id).not.toMatch(/non-commercial/i);
    expect(modelIdsFor("best", "cutouts").some((id) => /non-commercial/i.test(ALL_MODELS[id].license))).toBe(true);
  });

  it("a depth map needs only the depth model; cut-outs need all four", () => {
    expect(modelIdsFor("best", "depth")).toEqual(["depth-large"]);
    expect(modelIdsFor("fast", "depth")).toEqual(["depth-small"]);
    expect(modelIdsFor("best", "cutouts")).toEqual(["people", "matte-best", "inpaint", "depth-large"]);
    expect(() => modelIdsFor("ultra", "depth")).toThrow(/Unknown quality/);
  });

  it("keeps models outside the repository", () => {
    expect(modelCacheDir({ env: {}, platform: "linux", homedir: "/home/a" })).toBe("/home/a/.cache/scarlet-keyframe/models");
    expect(modelCacheDir({ env: { SCARLET_KEYFRAME_MODELS: "/m" }, platform: "linux", homedir: "/home/a" })).toBe("/m");
  });
});
