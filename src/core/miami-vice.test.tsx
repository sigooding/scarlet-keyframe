import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILT_IN_FILMS, createBundledFilm } from "./bundledFilms";
import { MIAMI_VICE_CAST_REFERENCES } from "./miamiViceCharacters";
import { MIAMI_VICE_LOCATION_BY_SCENE, MIAMI_VICE_LOCATION_REFERENCES } from "./miamiViceLocations";
import music from "../data/miami-vice-music.json";
import { MiamiViceCast } from "../components/MiamiViceCast";

const project = () => createBundledFilm("miami-vice-film", new Map(), new Map())!;

describe("Miami Vice - Salt Water", () => {
  it("is a bundled feature-length film", () => {
    expect(BUILT_IN_FILMS.map((item) => item.id)).toContain("miami-vice-film");
    const built = project();
    expect(built.story.title).toBe("Miami Vice - Salt Water");
    expect(built.story.scenes.length).toBeGreaterThanOrEqual(120);
    const beats = built.story.scenes.flatMap((scene) => scene.dialogueBeats ?? []);
    expect(beats.length).toBeGreaterThan(1100);
    // Compiled beats time dialogue at fourteen characters a second and cap each
    // action shot at nine seconds, so a two-hour feature compiles to roughly a
    // third of its screen time. Sweet Jesus (30 scenes) compiles to 40 minutes.
    const frames = beats.reduce((sum, beat) => sum + Number(beat.durationFrames), 0);
    expect(frames).toBeGreaterThan(120_000);
    expect(frames).toBeLessThan(200_000);
  });

  it("is night-heavy Miami", () => {
    const titles = project().story.scenes.map((scene) => String(scene.title ?? ""));
    expect(titles.filter((title) => /NIGHT/.test(title)).length).toBeGreaterThan(
      titles.filter((title) => /DAY/.test(title)).length,
    );
    expect(titles.some((title) => /BISCAYNE|CAUSEWAY|MIAMI RIVER|OCEAN DRIVE/.test(title))).toBe(true);
  });

  it("uses the season four squad", () => {
    const names = (project().story.characters ?? []).map((character: { name?: string }) => String(character.name));
    for (const name of ["Crockett", "Tubbs", "Castillo", "Gina", "Trudy", "Switek", "Zito", "Izzy"]) {
      expect(names).toContain(name);
    }
  });

  it("ships a cast reference for every generated portrait", () => {
    expect(MIAMI_VICE_CAST_REFERENCES).toHaveLength(10);
    for (const character of MIAMI_VICE_CAST_REFERENCES) {
      expect(character.preview).toBeTruthy();
      expect(character.original).toBe(`./miami-vice/characters/${character.id}.png`);
      expect(character.continuity.length).toBeGreaterThan(40);
    }
  });

  it("keys every location plate to real storyboard scenes", () => {
    const sceneIds = new Set(project().story.scenes.map((scene) => String(scene.id)));
    expect(MIAMI_VICE_LOCATION_REFERENCES.length).toBeGreaterThan(0);
    for (const ref of MIAMI_VICE_LOCATION_REFERENCES) {
      expect(ref.preview).toContain(`${ref.id}.jpg`);
      expect(ref.alt.length).toBeGreaterThan(60);
      expect(ref.summary.length).toBeGreaterThan(60);
      expect(ref.design.length).toBeGreaterThan(60);
      expect(ref.continuity.length).toBeGreaterThan(60);
      expect(ref.scenes.length).toBeGreaterThan(0);
      for (const sceneId of ref.scenes) expect(sceneIds).toContain(sceneId);
    }
    expect(Object.keys(MIAMI_VICE_LOCATION_BY_SCENE)).toContain("mv_s01");
  });

  it("carries a music cue list keyed to real scenes", () => {
    const sceneIds = new Set(project().story.scenes.map((scene) => String(scene.id)));
    expect(music.length).toBeGreaterThan(20);
    for (const cue of music) {
      expect(cue.note.length).toBeGreaterThan(40);
      expect(["score", "song", "diegetic", "ambience"]).toContain(cue.kind);
      for (const sceneId of cue.scenes) expect(sceneIds).toContain(sceneId);
    }
    // Five licensed period songs, all of them in the season four register.
    expect(music.filter((cue) => cue.kind === "song")).toHaveLength(5);
    expect(music.some((cue) => cue.scenes.includes("mv_s99"))).toBe(true);
  });

  it("renders the cast gallery", () => {
    const html = renderToStaticMarkup(<MiamiViceCast onClose={() => {}} />);
    expect(html).toContain("Cast references");
    for (const character of MIAMI_VICE_CAST_REFERENCES) {
      expect(html).toContain(character.name.replace(/'/g, "&#x27;"));
    }
    expect(html).toContain("miami-cast-james-crockett");
  });
});
