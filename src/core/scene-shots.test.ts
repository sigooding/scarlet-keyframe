import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import characters from "../data/sweet-jesus-characters.json";
import film from "../data/sweet-jesus-film.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { SWEET_JESUS_LOCATION_REFERENCES } from "./sweetJesusLocations";
import { SWEET_JESUS_PROP_REFERENCES } from "./sweetJesusProps";
import {
  countEmptySweetJesusShots,
  fillEmptySweetJesusShots,
  SWEET_JESUS_SHOTS,
  upgradeSweetJesusShots,
} from "./sweetJesusShots";

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

const fresh = () => createProjectState(parseImportPayload(film, "sweet-jesus-film.json"));

describe("Sweet Jesus scene keyframes", () => {
  it("keys every keyframe to real beats, cast and sheets", () => {
    const beatToScene = new Map(
      film.scenes.flatMap((scene) => (scene.dialogueBeats ?? []).map((beat) => [beat.id, scene.id])),
    );
    const portraits = new Set(characters.map((character) => character.id));
    const locations = new Set(SWEET_JESUS_LOCATION_REFERENCES.map((ref) => ref.id));
    const props = new Set(SWEET_JESUS_PROP_REFERENCES.map((ref) => ref.id));
    const seen = new Set<string>();
    for (const shot of SWEET_JESUS_SHOTS) {
      expect(existsSync(`public/sweet-jesus/scenes/${shot.original}`)).toBe(true);
      expect(jpegDimensions(`src/assets/sweet-jesus/scenes/${shot.id}.jpg`)).toEqual([1024, 576]);
      expect(shot.preview).toBe(`./sweet-jesus/scenes/${shot.original}`);
      expect(shot.alt.length).toBeGreaterThan(40);
      expect(shot.note.length).toBeGreaterThan(40);
      expect(shot.beats.length).toBeGreaterThan(0);
      expect(locations.has(shot.location) || shot.location.startsWith("launderette/")).toBe(true);
      for (const prop of shot.props) expect(props.has(prop)).toBe(true);
      for (const actor of shot.cast) expect(portraits.has(actor)).toBe(true);
      for (const beat of shot.beats) {
        expect(beatToScene.get(beat)).toBe(shot.sceneId);
        // No beat may be claimed by two keyframes.
        expect(seen.has(beat)).toBe(false);
        seen.add(beat);
      }
    }
    // The opening keeps its own voted stills.
    for (const beat of seen) expect(beat.startsWith("sj_s01_")).toBe(false);
  });

  it("fills only blank slots and leaves an edited draft alone", () => {
    const project = upgradeSweetJesusShots(fresh());
    const frames = buildKeyframes(project.story);
    const covered = new Set(SWEET_JESUS_SHOTS.flatMap((shot) => shot.beats));
    expect(frames.filter((frame) => covered.has(frame.id)).every((frame) => frame.picture?.startsWith("asset:sj-shot-v"))).toBe(true);
    expect(countEmptySweetJesusShots(project)).toBe(0);
    expect(project.assets).toHaveLength(SWEET_JESUS_SHOTS.length);
    expect(project.story.productionStatus).toContain("scene keyframes");

    // Filling again is a no-op, and a custom picture is never overwritten.
    expect(fillEmptySweetJesusShots(project)).toBe(project);
    const custom = {
      ...project,
      story: {
        ...project.story,
        scenes: project.story.scenes.map((scene) => scene.id === "sj_s02" ? {
          ...scene,
          dialogueBeats: scene.dialogueBeats?.map((beat) => beat.id === "sj_s02_b001"
            ? { ...beat, background: "asset:mine", backgroundHold: false } : beat),
        } : scene),
      },
    };
    const after = fillEmptySweetJesusShots(custom);
    expect(buildKeyframes(after.story).find((frame) => frame.id === "sj_s02_b001")?.picture).toBe("asset:mine");
  });

  it("refuses to fill a project that is not the Sweet Jesus storyboard", () => {
    const other = { ...fresh(), story: { ...fresh().story, id: "another-film" } };
    expect(countEmptySweetJesusShots(other)).toBe(0);
    expect(fillEmptySweetJesusShots(other)).toBe(other);
  });
});
