import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import film from "../data/sweet-jesus-film.json";
import { LOCATION_BY_SCENE, SWEET_JESUS_LOCATION_REFERENCES } from "./sweetJesusLocations";
import { PROPS_BY_SCENE, SWEET_JESUS_PROP_REFERENCES } from "./sweetJesusProps";

function jpegDimensions(path: string): [number, number] {
  const jpeg = readFileSync(path);
  expect(jpeg.readUInt16BE(0)).toBe(0xffd8);
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) { offset += 1; continue; }
    const marker = jpeg[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [jpeg.readUInt16BE(offset + 7), jpeg.readUInt16BE(offset + 5)];
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) { offset += 2; continue; }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error(`No JPEG frame dimensions in ${path}`);
}

describe("Sweet Jesus location sheets", () => {
  it("describes every sheet with a full-size original and a 16:9 preview", () => {
    expect(SWEET_JESUS_LOCATION_REFERENCES.length).toBeGreaterThan(0);
    for (const ref of SWEET_JESUS_LOCATION_REFERENCES) {
      expect(existsSync(`public/${ref.original.replace(/^\.\//, "")}`)).toBe(true);
      expect(jpegDimensions(`src/assets/sweet-jesus/locations/${ref.id}.jpg`)).toEqual([1280, 720]);
      // Inline as a data URL in the built editor; a bare URL under the test runner.
      expect(ref.preview).toBeTruthy();
      expect(ref.preview).toContain(`${ref.id}.jpg`);
      expect(ref.alt.length).toBeGreaterThan(25);
      expect(ref.summary.length).toBeGreaterThan(40);
      expect(ref.design.length).toBeGreaterThan(40);
      expect(ref.continuity.length).toBeGreaterThan(40);
      expect(ref.scenes.length).toBeGreaterThan(0);
    }
  });

  it("keys every sheet to real storyboard scenes, without claiming the launderette's own coverage", () => {
    const sceneIds = new Set(film.scenes.map((scene) => scene.id));
    for (const ref of SWEET_JESUS_LOCATION_REFERENCES) {
      for (const sceneId of ref.scenes) expect(sceneIds.has(sceneId)).toBe(true);
      expect(ref.scenes).not.toContain("sj_s01");
    }
    const ids = SWEET_JESUS_LOCATION_REFERENCES.map((ref) => ref.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [sceneId, ref] of Object.entries(LOCATION_BY_SCENE)) {
      expect(ref.scenes).toContain(sceneId);
    }
  });
});

describe("Sweet Jesus prop sheets", () => {
  it("describes every item with a full-size original and a 16:9 preview", () => {
    expect(SWEET_JESUS_PROP_REFERENCES.length).toBeGreaterThan(0);
    for (const ref of SWEET_JESUS_PROP_REFERENCES) {
      expect(existsSync(`public/${ref.original.replace(/^\.\//, "")}`)).toBe(true);
      expect(jpegDimensions(`src/assets/sweet-jesus/props/${ref.id}.jpg`)).toEqual([960, 540]);
      expect(ref.preview).toBeTruthy();
      expect(ref.preview).toContain(`${ref.id}.jpg`);
      expect(ref.alt.length).toBeGreaterThan(25);
      expect(ref.summary.length).toBeGreaterThan(40);
      expect(ref.design.length).toBeGreaterThan(40);
      expect(ref.continuity.length).toBeGreaterThan(60);
    }
  });

  it("tracks each item through the scenes that use it", () => {
    const sceneIds = new Set(film.scenes.map((scene) => scene.id));
    for (const ref of SWEET_JESUS_PROP_REFERENCES) {
      expect(ref.scenes.length).toBeGreaterThan(0);
      for (const sceneId of ref.scenes) expect(sceneIds.has(sceneId)).toBe(true);
    }
    const ids = SWEET_JESUS_PROP_REFERENCES.map((ref) => ref.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The ledger is in the warehouse, the clinic and the church basement: the props
    // index must list it in all three.
    const ledger = SWEET_JESUS_PROP_REFERENCES.find((ref) => ref.id === "ledger")!;
    expect(PROPS_BY_SCENE.sj_s23.map((ref) => ref.id)).toContain(ledger.id);
    expect(PROPS_BY_SCENE.sj_s24.map((ref) => ref.id)).toContain(ledger.id);
    expect(PROPS_BY_SCENE.sj_s28.map((ref) => ref.id)).toContain(ledger.id);
  });
});

