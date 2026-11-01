import { describe, expect, it } from "vitest";
import film from "../data/nobodys-witness-film.json";
import mediaIndex from "../data/media-index.json";
import { buildKeyframes, parseImportPayload } from "./model";
import { groupSceneImages, leadingShotNumber, sceneFolderOf, sceneList, type SceneFrameLite } from "./sceneImages";

const asset = (ref: string) => ({
  ref,
  name: ref.split("/").pop()!,
  folder: ref.split("/").slice(1, -1).join("/"),
});
const frame = (id: string, sceneId: string, number: number, picture?: string): SceneFrameLite => ({
  id,
  sceneId,
  mark: sceneId.replace("nw_s", "").toUpperCase(),
  title: sceneId,
  number,
  picture,
});

describe("sceneImages helpers", () => {
  it("finds the folder and the leading shot number", () => {
    expect(sceneFolderOf("/film/img/s77a/1290-x.jpg")).toBe("s77a");
    expect(sceneFolderOf("/film/depth/s77a/x.jpg")).toBe("");
    expect(sceneFolderOf("gradient:black")).toBe("");
    expect(leadingShotNumber("137-he-knows-r1.jpg")).toBe("137");
    expect(leadingShotNumber("cold-open-1-28.jpg")).toBe("");
  });
});

describe("groupSceneImages", () => {
  const assets = [
    "/film/img/s2/10-bar.jpg",
    "/film/img/s2/11-bar-b.jpg",
    "/film/img/s2/12-unused.jpg",
    "/film/img/s2_picks/50-pick.jpg",
    "/film/img/s2_new/60-new.jpg",
    "/film/img/s20/70-other-scene.jpg",
    "/film/img/archive/s2/10-bar--v1.jpg",
    "/film/img/archive/s20/70-other-scene--v1.jpg",
    "/film/img/retakes_2026_10_25/11-bar-b-r1.jpg",
    "/film/img/retakes_2026_10_25/99-elsewhere-r1.jpg",
    "/film/depth/s2/10-bar-depth.jpg",
    "/reels/rapture/11-reel.jpg",
  ].map(asset);
  const frames = [
    frame("a", "nw_s2", 1, "/film/img/s2/10-bar.jpg"),
    frame("b", "nw_s2", 2, "/film/img/s2/10-bar.jpg"),
    frame("c", "nw_s2", 3, "/film/img/s2/11-bar-b.jpg"),
    frame("d", "nw_s2", 4, "/film/img/s2_picks/50-pick.jpg"),
    frame("e", "nw_s2", 5, "gradient:black"),
    frame("f", "nw_s20", 6, "/film/img/s20/70-other-scene.jpg"),
  ];
  const g = groupSceneImages("nw_s2", frames, assets);

  it("lists in-use pictures once, in running order, with their keyframes", () => {
    expect(g.inUse.map((t) => t.asset.name)).toEqual(["10-bar.jpg", "11-bar-b.jpg", "50-pick.jpg"]);
    expect(g.inUse[0].frames.map((f) => f.number)).toEqual([1, 2]);
  });
  it("uses every folder the scene's pictures come from", () => {
    expect(g.folders.sort()).toEqual(["s2", "s2_picks"]);
  });
  it("takes earlier versions from the scene folders' archive only", () => {
    expect(g.earlier.map((t) => t.asset.ref)).toEqual(["/film/img/archive/s2/10-bar--v1.jpg"]);
  });
  it("finds alternatives by folder, sibling folder and shot number, never depth maps or reels", () => {
    expect(g.alternatives.map((t) => t.asset.name).sort()).toEqual(["11-bar-b-r1.jpg", "12-unused.jpg", "60-new.jpg"]);
  });
  it("handles another scene, an empty scene and no scene", () => {
    expect(groupSceneImages("nw_s20", frames, assets).alternatives).toEqual([]);
    expect(groupSceneImages("nope", frames, assets)).toEqual({ folders: [], inUse: [], earlier: [], alternatives: [] });
    expect(groupSceneImages(undefined, frames, assets).inUse).toEqual([]);
  });
  it("lists scenes in order with frame counts", () => {
    expect(sceneList(frames)).toEqual([
      { id: "nw_s2", mark: "2", title: "nw_s2", frameCount: 5 },
      { id: "nw_s20", mark: "20", title: "nw_s20", frameCount: 1 },
    ]);
  });
});

describe("real film", () => {
  const { story } = parseImportPayload(film, "film.json");
  const frames = buildKeyframes(story).map<SceneFrameLite>((f) => ({
    id: f.id,
    sceneId: f.sceneId,
    mark: f.mark,
    title: String(f.scene.title || ""),
    number: f.number,
    picture: f.picture,
  }));
  const assets = (mediaIndex as string[])
    .filter((p) => /\.(jpe?g|png|webp)$/i.test(p))
    .map(asset);
  it("gives scene 2 pictures, earlier versions and alternatives", () => {
    const g = groupSceneImages("nw_s2", frames, assets);
    expect(g.inUse.length).toBeGreaterThan(5);
    expect(g.earlier.length).toBeGreaterThan(5);
    expect(g.alternatives.length).toBeGreaterThan(0);
    expect(g.folders).toContain("s2");
  });
});
