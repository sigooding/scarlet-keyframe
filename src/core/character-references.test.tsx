import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterReferences } from "../components/CharacterReferences";
import { Topbar } from "../components/Topbar";
import { createBundledFilm } from "./bundledFilms";
import { SWEET_JESUS_CHARACTER_REFERENCES, SWEET_JESUS_CHARACTER_SHEETS_PDF } from "./sweetJesusCharacters";

const noop = () => {};

describe("Sweet Jesus character references", () => {
  it("keeps each voted original and gallery preview paired with a unique character", () => {
    const cast = SWEET_JESUS_CHARACTER_REFERENCES;
    expect(cast).toHaveLength(14);
    expect(new Set(cast.map((character) => character.id)).size).toBe(cast.length);
    for (const character of cast) {
      expect(existsSync(`public/sweet-jesus/characters/${character.id}.png`)).toBe(true);
      expect(existsSync(`src/assets/sweet-jesus/portraits/${character.id}.jpg`)).toBe(true);
      expect(character.preview).toBeTruthy();
      expect(character.original).toBe(`./sweet-jesus/characters/${character.id}.png`);
      expect(character.look.length).toBeGreaterThan(20);
      expect(character.continuity.length).toBeGreaterThan(20);
    }
    expect(cast.find((character) => character.id === "bug-ray")?.age).toBe("15");
    expect(cast.find((character) => character.id === "jack-monroe")?.continuity).toContain("sunflower seeds");
    expect(cast.find((character) => character.id === "nicky")?.continuity).toContain("not a stutterer");
    expect(cast.find((character) => character.id === "tick-lane")?.look).toContain("gold pinky ring");
  });

  it("includes a printable page per cast member", () => {
    const pdf = readFileSync("src/assets/sweet-jesus/sweet-jesus-character-sheets.pdf").toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) || [])).toHaveLength(14);
    expect(SWEET_JESUS_CHARACTER_SHEETS_PDF).toBeTruthy();
  });

  it("renders an accessible character browser and printable set", () => {
    const html = renderToStaticMarkup(<CharacterReferences onClose={noop} />);
    expect(html).toContain('aria-label="Select a character"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Full-body reference portrait of Jack Monroe");
    expect(html).toContain("Download sheets ↓");
    expect(html).toContain('download="jack-monroe.png"');
    expect(html).toContain('data-testid="character-tick-lane"');
    expect(html).toContain("Sunflower seeds".toLowerCase());
  });

  it("adds the cast button only when the film supplies it", () => {
    const project = createBundledFilm("sweet-jesus-film", new Map(), new Map())!;
    const common = {
      project, saveStatus: "SAVED", historyVersion: 0, canUndo: false, canRedo: false,
      onUndo: noop, onRedo: noop, onImport: noop, onLinkFolder: noop, folderLabel: "",
      onSnapshot: noop, onExport: noop, onSave: noop, missingCount: 0, onMissing: noop,
      editLabel: "Storyboard draft", totalDuration: 0,
    };
    const withCast = renderToStaticMarkup(<Topbar {...common} onShowCharacterReferences={noop} />);
    const withoutCast = renderToStaticMarkup(<Topbar {...common} />);
    expect(withCast).toContain('data-testid="character-references-button"');
    expect(withoutCast).not.toContain('data-testid="character-references-button"');
  });
});
