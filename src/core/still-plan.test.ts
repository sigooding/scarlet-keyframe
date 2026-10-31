import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import characters from "../data/sweet-jesus-characters.json";
import film from "../data/sweet-jesus-film.json";
import { SWEET_JESUS_LOCATION_REFERENCES } from "./sweetJesusLocations";
import { SWEET_JESUS_PROP_REFERENCES } from "./sweetJesusProps";

// Written by `npm run build:still-plan`, this is the shooting order for the scene
// stills: every scene after the opening, with the room, props and cast each still
// has to match. The test keeps it in step with the storyboard and the sheets.
const plan = JSON.parse(readFileSync("reviews/sweet-jesus-sheets-20261031/scene-stills-plan.json", "utf8")) as {
  film: string;
  totalShots: number;
  scenes: Array<{
    id: string;
    shotCount: number;
    location: string;
    props: string[];
    cast: string[];
    heardNotSeen: string[];
    beats: Array<{ id: string; shot: string }>;
  }>;
};

describe("Sweet Jesus scene still plan", () => {
  it("covers every scene after the opening, with real beats and sheets", () => {
    expect(plan.film).toBe(film.id);
    const storyScenes = film.scenes.filter((scene) => scene.id !== "sj_s01");
    expect(plan.scenes.map((scene) => scene.id)).toEqual(storyScenes.map((scene) => scene.id));
    const portraitIds = new Set(characters.map((character) => character.id));
    const locationIds = new Set(SWEET_JESUS_LOCATION_REFERENCES.map((ref) => ref.id));
    const propIds = new Set(SWEET_JESUS_PROP_REFERENCES.map((ref) => ref.id));
    let beats = 0;
    for (const scene of plan.scenes) {
      const story = film.scenes.find((item) => item.id === scene.id)!;
      const storyBeats = (story.dialogueBeats ?? []).filter((beat) => !beat.gap).map((beat) => beat.id);
      expect(scene.beats.map((beat) => beat.id)).toEqual(storyBeats);
      expect(scene.beats.every((beat) => beat.shot.trim().length > 0)).toBe(true);
      beats += scene.beats.length;
      expect(scene.shotCount).toBeGreaterThanOrEqual(2);
      expect(scene.shotCount).toBeLessThanOrEqual(Math.max(3, Math.ceil(scene.beats.length / 6)));
      const launderette = scene.location.startsWith("launderette/");
      expect(launderette || locationIds.has(scene.location)).toBe(true);
      for (const prop of scene.props) expect(propIds.has(prop)).toBe(true);
      for (const actor of scene.cast) expect(portraitIds.has(actor)).toBe(true);
    }
    expect(beats).toBe(406);
    expect(plan.totalShots).toBe(plan.scenes.reduce((sum, scene) => sum + scene.shotCount, 0));
  });

  it("never puts a heard-but-unseen voice in frame", () => {
    const tape = plan.scenes.find((scene) => scene.id === "sj_s17")!;
    expect(tape.heardNotSeen).toContain("PEANUT");
    expect(tape.cast).not.toContain("peanut-ray");
    const warehouse = plan.scenes.find((scene) => scene.id === "sj_s23")!;
    expect(warehouse.heardNotSeen).toContain("PEANUT");
    expect(warehouse.cast).not.toContain("peanut-ray");
    expect(warehouse.shotCount).toBe(12);
  });
});
