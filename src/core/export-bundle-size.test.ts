import { describe, expect, it } from "vitest";
import { buildPortableBundle, DEFAULT_EMBED_BUDGET_BYTES } from "./exportBundle";
import { createProjectState, parseImportPayload, type ProjectState } from "./model";

// A bundle is one JSON string, and a browser cannot hold a string past about 512 MB. Nobody's Witness references
// ~460 MB of pictures and sound, so a bundle that carried them all threw `RangeError: Invalid string length` after
// minutes of reading files. It now carries what would be lost and points at what the film keeps in public/.

function fileOf(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: name.endsWith(".mp3") ? "audio/mpeg" : "image/jpeg" });
}

function projectWith(pictures: string[]): ProjectState {
  const imported = parseImportPayload(
    {
      id: "t",
      title: "Test film",
      startSceneId: "a",
      scenes: [
        {
          id: "a",
          title: "A",
          dialogueBeats: pictures.map((picture, index) => ({ id: `b${index}`, text: ".", background: picture })),
        },
      ],
    },
    "t.json",
  );
  return createProjectState(imported, []);
}

describe("a bundle that can actually be written", () => {
  it("carries the files from a linked folder while there is room", async () => {
    const project = projectWith(["/film/img/a.jpg", "/film/img/b.jpg"]);
    const folder = new Map([
      ["film/img/a.jpg", fileOf("a.jpg", 1000)],
      ["film/img/b.jpg", fileOf("b.jpg", 1000)],
    ]);
    const bundle = await buildPortableBundle(project, folder, new Set());
    expect(bundle.assets).toHaveLength(2);
    expect(bundle.kept ?? []).toEqual([]);
    expect(bundle.missing).toEqual([]);
  });

  it("stops carrying them at the budget and points at the rest instead", async () => {
    const project = projectWith(["/film/img/a.jpg", "/film/img/b.jpg", "/film/img/c.jpg"]);
    const folder = new Map([
      ["film/img/a.jpg", fileOf("a.jpg", 900)],
      ["film/img/b.jpg", fileOf("b.jpg", 900)],
      ["film/img/c.jpg", fileOf("c.jpg", 900)],
    ]);
    const bundle = await buildPortableBundle(project, folder, new Set(), { embedBudgetBytes: 1000 });
    expect(bundle.assets).toHaveLength(1);
    expect(bundle.kept).toEqual(["film/img/b.jpg", "film/img/c.jpg"]);
    // the ones it points at are not called missing: they are where the film keeps them
    expect(bundle.missing).toEqual([]);
  });

  it("is a file the browser can write, however big the film is", async () => {
    const many = Array.from({ length: 40 }, (_, i) => `/film/img/${i}.jpg`);
    const folder = new Map(many.map((ref, i) => [ref.slice(1), fileOf(`${i}.jpg`, 100_000)]));
    const bundle = await buildPortableBundle(projectWith(many), folder, new Set(), { embedBudgetBytes: 250_000 });
    const text = JSON.stringify(bundle);
    expect(text.length).toBeLessThan(2_000_000);
    expect(bundle.assets.length).toBeLessThan(many.length);
    expect((bundle.kept ?? []).length).toBeGreaterThan(30);
    // and it still opens: the story and every reference survive the round trip
    const back = JSON.parse(text) as typeof bundle;
    expect(back.story.scenes[0].dialogueBeats).toHaveLength(40);
  });

  it("always carries an upload, whatever the budget: nothing else has a copy of it", async () => {
    const project = projectWith(["asset:up1"]);
    const withUpload: ProjectState = {
      ...project,
      assets: [
        {
          id: "up1",
          name: "hand-drawn.png",
          type: "image",
          mime: "image/png",
          size: 5000,
          uploadedAt: 1,
          source: "upload",
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
    };
    const bundle = await buildPortableBundle(withUpload, new Map(), new Set(), { embedBudgetBytes: 10 });
    expect(bundle.assets.map((asset) => asset.id)).toEqual(["up1"]);
    expect(bundle.assets[0].dataUrl).toContain("data:image/png");
    expect(bundle.kept ?? []).toEqual([]);
  });

  it("the budget is well under what a browser can hold", () => {
    expect(DEFAULT_EMBED_BUDGET_BYTES).toBeLessThan(300 * 1024 * 1024);
    expect(DEFAULT_EMBED_BUDGET_BYTES).toBeGreaterThan(8 * 1024 * 1024);
  });
});
