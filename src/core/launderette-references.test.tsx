import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunderetteReferences } from "../components/LaunderetteReferences";
import { Topbar } from "../components/Topbar";
import blankFilm from "../data/sweet-jesus-film.json";
import { createBundledFilm } from "./bundledFilms";
import { SWEET_JESUS_SHOTS } from "./sweetJesusShots";
import { buildPortableBundle } from "./exportBundle";
import { effectiveFilmCutOptions } from "./filmFraming";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import {
  SWEET_JESUS_LAUNDERETTE_REFERENCES,
  SWEET_JESUS_LAUNDERETTE_SHEETS_PDF,
  SWEET_JESUS_OPENING_STORYBOARD_PDF,
} from "./sweetJesusLaunderette";
import {
  countEmptySweetJesusOpeningShots,
  fillEmptySweetJesusOpeningShots,
  SWEET_JESUS_OPENING_REFERENCES,
  upgradeSweetJesusOpening,
} from "./sweetJesusOpening";

const noop = () => {};
const makeLegacy = () => createProjectState(parseImportPayload(blankFilm, "sweet-jesus-film.json"));
const fresh = () => createBundledFilm("sweet-jesus-film", new Map(), new Map())!;

// A PNG's first scanline has no previous row; the first pixel's alpha byte is
// unfiltered for every PNG filter (no left or upper neighbours). This catches a
// checkerboard that was painted into an otherwise nominally transparent PNG.
function jpegDimensions(path: string): [number, number] {
  const jpeg = readFileSync(path);
  expect(jpeg.readUInt16BE(0)).toBe(0xffd8);
  let offset = 2;
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) { offset += 1; continue; }
    const marker = jpeg[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [jpeg.readUInt16BE(offset + 7), jpeg.readUInt16BE(offset + 5)];
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) { offset += 2; continue; }
    offset += 2 + jpeg.readUInt16BE(offset + 2);
  }
  throw new Error(`No JPEG frame dimensions in ${path}`);
}

function pngCornerAlpha(path: string): number {
  const png = readFileSync(path);
  expect(png[24]).toBe(8); // 8-bit channels
  expect(png[25]).toBe(6); // RGBA
  expect(png[28]).toBe(0); // non-interlaced
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const name = png.toString("ascii", offset + 4, offset + 8);
    if (name === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks))[4];
}

describe("Sweet Jesus launderette and opening", () => {
  it("keeps four voted references, including an actually transparent complete microphone prop", () => {
    expect(SWEET_JESUS_LAUNDERETTE_REFERENCES).toHaveLength(4);
    for (const ref of SWEET_JESUS_LAUNDERETTE_REFERENCES) {
      expect(existsSync(`public/${ref.original.replace(/^\.\//, "")}`)).toBe(true);
      expect(ref.preview).toBeTruthy();
      expect(ref.alt.length).toBeGreaterThan(25);
      expect(ref.continuity.length).toBeGreaterThan(35);
    }
    const prop = "public/sweet-jesus/launderette/cassette-with-mic.png";
    expect(pngCornerAlpha(prop)).toBe(0);
    expect(SWEET_JESUS_LAUNDERETTE_REFERENCES.find((ref) => ref.id === "cassette-with-mic")?.design).toContain("no added radio");
  });

  it("contains landscape 16:9 printable style sheets and a 22-beat opening storyboard", () => {
    for (const [name, count] of [["launderette-sheets", 4], ["opening-storyboard", 6]] as const) {
      const pdf = readFileSync(`src/assets/sweet-jesus/sweet-jesus-${name}.pdf`).toString("latin1");
      expect(pdf.startsWith("%PDF-")).toBe(true);
      expect((pdf.match(/\/Type \/Page\b/g) || [])).toHaveLength(count);
      expect(pdf).toContain("/MediaBox [0 0 960 540]");
    }
    expect(SWEET_JESUS_LAUNDERETTE_SHEETS_PDF).toBeTruthy();
    expect(SWEET_JESUS_OPENING_STORYBOARD_PDF).toBeTruthy();
  });

  it("assigns the seven references to all 22 opening beats without audio or carried pictures", () => {
    const project = fresh();
    const frames = buildKeyframes(project.story);
    const opening = frames.filter((frame) => frame.sceneId === "sj_s01");
    expect(opening).toHaveLength(22);
    expect(SWEET_JESUS_OPENING_REFERENCES).toHaveLength(7);
    for (const ref of SWEET_JESUS_OPENING_REFERENCES) {
      expect(jpegDimensions(`src/assets/sweet-jesus/opening/${ref.preview}`)).toEqual([1280, 720]);
      expect(existsSync(`public/sweet-jesus/opening/${ref.original}`)).toBe(true);
    }
    const covered = SWEET_JESUS_OPENING_REFERENCES.flatMap((shot) => shot.beats);
    expect(new Set(covered).size).toBe(22);
    expect(covered).toEqual(opening.map((frame) => frame.id));
    // The seven opening stills, plus the scene keyframes installed later in the film.
    expect(project.assets).toHaveLength(7 + SWEET_JESUS_SHOTS.length);
    // Vitest stubs static imports as paths; the browser smoke test checks the real inlined data URLs.
    expect(project.assets.slice(0, 7).every((asset) => asset.width === 1280 && asset.height === 720 && !!asset.dataUrl)).toBe(true);
    expect(project.assets.slice(7).every((asset) => asset.width === 1024 && asset.height === 576 && !!asset.dataUrl)).toBe(true);
    expect(opening.every((frame) => frame.picture?.startsWith("asset:sj-opening-v1-") && frame.beat.backgroundHold === false)).toBe(true);
    expect(opening.slice(0, 8).every((frame) => frame.picture?.endsWith("brothers-washer"))).toBe(true);
    expect(opening.slice(8, 12).every((frame) => frame.picture?.endsWith("brothers-newspaper"))).toBe(true);
    expect(opening[14].picture).toMatch(/peanut-exits$/);
    expect(opening.slice(15, 20).every((frame) => frame.picture?.endsWith("bug-recording"))).toBe(true);
    expect(opening[20].picture).toMatch(/pinky-ring$/);
    expect(opening[21].picture).toMatch(/bug-labels-tape$/);
    const shotBeats = new Set(SWEET_JESUS_SHOTS.flatMap((shot) => shot.beats));
    expect(frames.slice(22).filter((frame) => !shotBeats.has(frame.id)).every((frame) => !frame.picture)).toBe(true);
    expect(project.audioClips).toEqual([]);
    expect(project.story.scenes[0].dialogueBeats?.[20].captions?.[0].text).toContain("Peanut laughs");
    expect(countEmptySweetJesusOpeningShots(project)).toBe(0);
  });

  it("defaults Sweet Jesus to 16:9 without overriding an explicit framing choice or another film", () => {
    const project = fresh();
    expect(effectiveFilmCutOptions(project).aspectFraming).toBe("16:9");
    const legacy = makeLegacy();
    delete legacy.story.cutOptions;
    expect(effectiveFilmCutOptions(legacy).aspectFraming).toBe("16:9");
    legacy.cutOptions = { aspectFraming: "1.37:1" };
    expect(effectiveFilmCutOptions(legacy).aspectFraming).toBe("1.37:1");
    const other = createBundledFilm("nobodys-witness-film", new Map(), new Map())!;
    expect(effectiveFilmCutOptions(other).aspectFraming).toBe("2.35:1");
  });

  it("upgrades only an untouched built-in opening and leaves an edited draft unchanged", () => {
    const legacy = makeLegacy();
    const migrated = upgradeSweetJesusOpening(legacy);
    expect(buildKeyframes(migrated.story).slice(0, 22).every((frame) => !!frame.picture)).toBe(true);
    expect(legacy.assets).toHaveLength(0);
    expect(buildKeyframes(legacy.story).slice(0, 22).every((frame) => !frame.picture)).toBe(true);
    expect(upgradeSweetJesusOpening(migrated)).toBe(migrated);

    const edited = makeLegacy();
    edited.story.scenes[0].dialogueBeats![0].shotDescription = "A user's revised establishing shot.";
    edited.story.scenes[0].dialogueBeats![0].captions![0].text = "[A user's revised cue.]";
    const snapshot = JSON.parse(JSON.stringify(edited.story));
    const safe = upgradeSweetJesusOpening(edited);
    expect(safe.story).toEqual(snapshot);
    expect(safe.assets).toEqual([]);
    expect(safe.sweetJesusOpeningVersion).toBe(1);
    expect(upgradeSweetJesusOpening(safe)).toBe(safe);
    const other = createBundledFilm("nobodys-witness-film", new Map(), new Map())!;
    expect(upgradeSweetJesusOpening(other)).toBe(other);
  });

  it("fills only empty independent slots on request, preserving edits, gaps and asset collisions", () => {
    const project = makeLegacy();
    const beats = project.story.scenes[0].dialogueBeats!;
    beats[0].background = "asset:user-picture";
    beats[1].gap = true;
    beats[2].backgroundRevert = true;
    beats[3].captions = [{ text: "[My edited cue.]", inFrame: 1, outFrame: 12, speaker: "", isNarration: false }];
    beats[3].durationFrames = 140;
    project.assets.push({ id: "user-picture", name: "Mine.jpg", source: "upload", type: "image", size: 3, dataUrl: "data:image/jpeg;base64,AAA=" });
    const beforeCaption = JSON.parse(JSON.stringify(beats[3].captions));
    expect(countEmptySweetJesusOpeningShots(project)).toBe(19);
    const filled = fillEmptySweetJesusOpeningShots(project);
    const result = filled.story.scenes[0].dialogueBeats!;
    expect(result[0].background).toBe("asset:user-picture");
    expect(result[1].gap).toBe(true);
    expect(result[1].background).toBeUndefined();
    expect(result[2].background).toBeUndefined();
    expect(result[3].captions).toEqual(beforeCaption);
    expect(result[3].durationFrames).toBe(140);
    expect(result[3].background).toMatch(/^asset:sj-opening-v1-/);
    expect(project.story.scenes[0].dialogueBeats![3].background).toBeUndefined();
    expect(filled.assets.find((asset) => asset.id === "user-picture")).toEqual(project.assets[0]);
    expect(countEmptySweetJesusOpeningShots(filled)).toBe(0);

    const collision = makeLegacy();
    collision.assets.push({ id: "sj-opening-v1-brothers-washer", name: "Do not replace", source: "upload", type: "image", size: 3, dataUrl: "data:image/jpeg;base64,AAA=" });
    const collisionFill = fillEmptySweetJesusOpeningShots(collision);
    expect(collisionFill.story.scenes[0].dialogueBeats!.slice(0, 8).every((beat) => !beat.background)).toBe(true);
    expect(collisionFill.assets.find((asset) => asset.id === "sj-opening-v1-brothers-washer")?.name).toBe("Do not replace");
  });

  it("exports the opening assets in a portable bundle", async () => {
    const bundle = await buildPortableBundle(fresh(), new Map(), new Set());
    expect(bundle.missing).toEqual([]);
    expect(bundle.assets).toHaveLength(7 + SWEET_JESUS_SHOTS.length);
    expect(bundle.assets.every((asset) => !!asset.dataUrl)).toBe(true);
    expect(bundle.story.scenes[0].dialogueBeats![0].background).toMatch(/^asset:sj-opening-v1-/);
  });

  it("renders an accessible location browser and exposes the toolbar action only when supplied", () => {
    const html = renderToStaticMarkup(<LaunderetteReferences onClose={noop} onFillOpening={noop} emptyOpeningCount={3} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Select a launderette reference"');
    expect(html).toContain("Fill 3 empty opening shots");
    expect(html).toContain("Dialogue and sound are captioned, not recorded");
    expect(html).toContain('download="sweet-jesus-launderette-sheets.pdf"');
    expect(html).toContain('download="sweet-jesus-opening-storyboard.pdf"');
    const props = {
      project: fresh(), saveStatus: "SAVED", historyVersion: 0, canUndo: false, canRedo: false,
      onUndo: noop, onRedo: noop, onImport: noop, onLinkFolder: noop, folderLabel: "",
      onSnapshot: noop, onExport: noop, onSave: noop, missingCount: 0, onMissing: noop,
      editLabel: "Storyboard draft", totalDuration: 0,
    };
    expect(renderToStaticMarkup(<Topbar {...props} onShowLaunderetteReferences={noop} />)).toContain('data-testid="launderette-references-button"');
    expect(renderToStaticMarkup(<Topbar {...props} />)).not.toContain('data-testid="launderette-references-button"');
  });
});
