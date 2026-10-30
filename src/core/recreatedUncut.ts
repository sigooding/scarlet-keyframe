import headlights from "../assets/recreated-uncut/027-headlights.jpg?url&inline";
import sedan from "../assets/recreated-uncut/1054-the-sedan.jpg?url&inline";
import promisedCar from "../assets/recreated-uncut/1467-promised-a-car.jpg?url&inline";
import hidden from "../assets/recreated-uncut/017-hidden.jpg?url&inline";
import winterLight from "../assets/recreated-uncut/1671-winter-light.jpg?url&inline";
import menApproach from "../assets/recreated-uncut/028-men-approach.jpg?url&inline";
import notebook from "../assets/recreated-uncut/1037-the-notebook.jpg?url&inline";
import wasThatYou from "../assets/recreated-uncut/1351-was-that-you.jpg?url&inline";
import emptyChair from "../assets/recreated-uncut/1573-empty-chair.jpg?url&inline";
import twentyYears from "../assets/recreated-uncut/031-after-twenty-years.jpg?url&inline";
import veraStill from "../assets/recreated-uncut/1637-vera-still.jpg?url&inline";
import { buildKeyframes, type ProjectAsset, type ProjectState, type StoryLike } from "./model";

// Only replacements selected in this recovery are listed here. The original
// imported story is never modified, and saved user pictures are left intact.
const plates = [
  { id: "recreated-uncut-1573", beat: "nw_b1573", scene: "nw_s96", source: "/film/img/s96/303-he-left-a-statement.jpg", name: "Empty chair.jpg", data: emptyChair, version: 1 },
  { id: "recreated-uncut-031", beat: "nw_b31", scene: "nw_s1", source: "/film/img/s1/333-the-white-light.jpg", name: "After twenty years.jpg", data: twentyYears, version: 1 },
  { id: "recreated-uncut-1637", beat: "nw_b1637", scene: "nw_s98", source: "/film/img/s98/526-at-the-end.jpg", name: "Vera goes still.jpg", data: veraStill, version: 1 },
  { id: "recreated-uncut-028", beat: "nw_b28", scene: "nw_s1", source: "/film/img/s1/332-the-sedan-blocks-the-lane.jpg", name: "Men approach.jpg", data: menApproach, version: 2 },
  { id: "recreated-uncut-1037", beat: "nw_b1037", scene: "nw_s63", source: "/film/img/s63/230-no-questions.jpg", name: "The notebook.jpg", data: notebook, version: 2 },
  { id: "recreated-uncut-1351", beat: "nw_b1351", scene: "nw_s80", source: "/film/img/s80/96-hands-close.jpg", name: "Was that you.jpg", data: wasThatYou, version: 2 },
  { id: "recreated-uncut-017", beat: "nw_b17", scene: "nw_s1", source: "/film/img/s1/06-barbershop-doorway.jpg", name: "Mara hidden.jpg", data: hidden, version: 3 },
  { id: "recreated-uncut-1671", beat: "nw_b1671", scene: "nw_s99a", source: "/film/img/s99/157-the-sign.jpg", name: "Winter light.jpg", data: winterLight, version: 3 },
  { id: "recreated-uncut-027", beat: "nw_b27", scene: "nw_s1", source: "/film/img/s1/332-the-sedan-blocks-the-lane.jpg", name: "Headlights.jpg", data: headlights, version: 4 },
  { id: "recreated-uncut-1054", beat: "nw_b1054", scene: "nw_s63a", source: "/film/img/s63a/295-they-give-up.jpg", name: "The sedan.jpg", data: sedan, version: 4 },
  { id: "recreated-uncut-1467", beat: "nw_b1467", scene: "nw_s84", source: "/film/img/s84/518-thats-mine.jpg", name: "Promised a car.jpg", data: promisedCar, version: 4 },
] as const;
const COVERAGE_VERSION = 4;

export function addRecreatedUncutCoverage(story: StoryLike, existing: ProjectAsset[], afterVersion = 0): ProjectAsset[] {
  if (story.id !== "nobodys-witness-film") return existing;
  const frames = buildKeyframes(story);
  const assets = [...existing];
  const candidates = plates.filter(plate => {
    if (plate.version <= afterVersion) return false;
    const frame = frames.find(f => f.sceneId === plate.scene && f.id === plate.beat);
    if (!frame || frame.picture !== plate.source || frame.beat.background || frame.beat.backgroundRevert || frame.beat.gap) return false;
    const next = frames[frames.indexOf(frame) + 1];
    return !(next?.sceneId === frame.sceneId && next.picture === plate.source &&
      !next.beat.background && !next.beat.backgroundRevert && next.beat.backgroundHold === false);
  });
  const selected = new Set(candidates.map(plate => plate.beat));
  for (const plate of candidates) {
    const frame = frames.find(f => f.sceneId === plate.scene && f.id === plate.beat)!;
    const next = frames[frames.indexOf(frame) + 1];
    // A non-held picture reverts to the scene background rather than the held
    // predecessor. Restore the next inherited picture unless it is itself a
    // selected replacement. Candidates are chosen before any mutation.
    if (next?.sceneId === frame.sceneId && !selected.has(next.id as typeof plate.beat) && next.picture === plate.source && !next.beat.background && !next.beat.backgroundRevert) {
      next.beat.background = plate.source;
    }
    frame.beat.background = `asset:${plate.id}`;
    frame.beat.backgroundHold = false;
    if (frame.cinematic) {
      const cinematic = { ...frame.cinematic };
      delete cinematic.depthMap; delete cinematic.depthPlate; delete cinematic.depthCutouts;
      frame.beat.cinematic = cinematic;
    }
    if (!assets.some(asset => asset.id === plate.id)) {
      const base64 = plate.data.split(",")[1] || "";
      assets.push({ id: plate.id, name: plate.name, type: "image", mime: "image/jpeg",
        size: Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0),
        source: "bundle", dataUrl: plate.data });
    }
  }
  return assets;
}

/** Apply new coverage once to saved Original Uncut, including its stashed state. */
export function upgradeSavedRecreatedUncut(project: ProjectState): ProjectState {
  const previous = project.recreatedUncutCoverageVersion ?? 0;
  if (project.originalStory.id !== "nobodys-witness-film" || previous >= COVERAGE_VERSION) return project;
  let story = project.story;
  let assets = project.assets;
  let savedCutStates = project.savedCutStates;
  if (project.directorsCutId === "uncut") {
    story = JSON.parse(JSON.stringify(story)) as StoryLike;
    assets = addRecreatedUncutCoverage(story, assets, previous);
  }
  const stashed = savedCutStates?.uncut;
  if (stashed) {
    const savedStory = JSON.parse(JSON.stringify(stashed.story)) as StoryLike;
    assets = addRecreatedUncutCoverage(savedStory, assets, previous);
    savedCutStates = { ...savedCutStates, uncut: { ...stashed, story: savedStory } };
  }
  return { ...project, story, assets, savedCutStates, recreatedUncutCoverageVersion: COVERAGE_VERSION };
}
