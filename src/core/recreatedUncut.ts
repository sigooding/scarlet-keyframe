import ishidaWarning from "../assets/recreated-uncut/300-ishida-warning.jpg?url&inline";
import previousListeningToTape from "../assets/recreated-uncut/1383-listening-to-tape.jpg?url&inline";
import wideListeningToTape from "../assets/recreated-uncut/1383-listening-wide.jpg?url&inline";
import later from "../assets/recreated-uncut/980-later.jpg?url&inline";
import danielVossPortrait from "../assets/recreated-uncut/284-daniel-voss-portrait.jpg?url&inline";
import whereIsIt from "../assets/recreated-uncut/1360-where-is-it.jpg?url&inline";
import missingPersonForm from "../assets/recreated-uncut/128-missing-person-form.jpg?url&inline";
import beyondTheCurtain from "../assets/recreated-uncut/1686-beyond-the-curtain.jpg?url&inline";
import wineRedDress from "../assets/recreated-uncut/1073-wine-red-dress.jpg?url&inline";
import sedanDeparts from "../assets/recreated-uncut/038-sedan-departs.jpg?url&inline";
import jackWhat from "../assets/recreated-uncut/893-jack-what.jpg?url&inline";
import veraHesitates from "../assets/recreated-uncut/099-vera-hesitates.jpg?url&inline";
import jackStands from "../assets/recreated-uncut/1358-jack-stands.jpg?url&inline";
import onlyTea from "../assets/recreated-uncut/1565-only-tea.jpg?url&inline";
import howDidSheSeem from "../assets/recreated-uncut/148-how-did-she-seem.jpg?url&inline";
import seaWallRoad from "../assets/recreated-uncut/716-sea-wall-road.jpg?url&inline";
import dinner from "../assets/recreated-uncut/1020-dinner-with-me.jpg?url&inline";
import noMessages from "../assets/recreated-uncut/1177-no-messages.jpg?url&inline";
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
import { buildKeyframes, type Keyframe, type ProjectAsset, type ProjectState, type StoryLike } from "./model";

const OLD_HARADA_ID = "duplicate-uncut-1383";
const wideHaradaPlate = { id: "duplicate-uncut-1383-wide", beat: "nw_b1383", scene: "nw_s82", source: "/film/img/s82/509-twenty-years-younger.jpg", name: "Listening to the tape (wide).jpg", data: wideListeningToTape, version: 13 } as const;

// Only replacements selected in this recovery are listed here. The original
// imported story is never modified, and saved user pictures are left intact.
const plates = [
  { id: "duplicate-uncut-300", beat: "nw_b300", scene: "nw_s11", source: "/film/img/s11/419-twenty-years.jpg", name: "Ishida's warning.jpg", data: ishidaWarning, version: 12 },
  wideHaradaPlate,
  { id: "duplicate-uncut-980", beat: "nw_b980", scene: "nw_s59", source: "/film/img/s59/477-he-hardly-hears-her.jpg", name: "Later.jpg", data: later, version: 12 },
  { id: "gap-uncut-284", beat: "nw_b284", scene: "nw_s11", source: "/film/img/s11/244-daniel-voss-41.jpg", name: "Daniel Voss portrait.jpg", data: danielVossPortrait, version: 11 },
  { id: "gap-uncut-1360", beat: "nw_b1360", scene: "nw_s80", source: "/film/img/s80/the-blood-on-his-hand.jpg", name: "Where is it.jpg", data: whereIsIt, version: 11 },
  { id: "gap-uncut-128", beat: "nw_b128", scene: "nw_s6", source: "/film/img/s6/321-the-form.jpg", name: "Missing person form.jpg", data: missingPersonForm, version: 10 },
  { id: "gap-uncut-1686", beat: "nw_b1686", scene: "nw_s100", source: "/film/img/s100/1685-money-on-the-counter.jpg", name: "Beyond the curtain.jpg", data: beyondTheCurtain, version: 10 },
  { id: "gap-uncut-1073", beat: "nw_b1073", scene: "nw_s65", source: "/film/img/s65/488-wine-red-silk.jpg", name: "Wine red dress.jpg", data: wineRedDress, version: 9 },
  { id: "gap-uncut-038", beat: "nw_b38", scene: "nw_s1", source: "/film/img/s1/13-taillights-gone.jpg", name: "Sedan departs.jpg", data: sedanDeparts, version: 8 },
  { id: "gap-uncut-893", beat: "nw_b893", scene: "nw_s53", source: "/film/img/s53/467-it-frightens-her.jpg", name: "Jack what.jpg", data: jackWhat, version: 8 },
  { id: "gap-uncut-099", beat: "nw_b99", scene: "nw_s4", source: "/film/img/s4/41-three-looks.jpg", name: "Vera hesitates.jpg", data: veraHesitates, version: 7 },
  { id: "gap-uncut-1358", beat: "nw_b1358", scene: "nw_s80", source: "/film/img/s80/not-to-jack.jpg", name: "Jack stands.jpg", data: jackStands, version: 7 },
  { id: "gap-uncut-1565", beat: "nw_b1565", scene: "nw_s94", source: "/film/img/s94/141-he-drinks.jpg", name: "Only tea.jpg", data: onlyTea, version: 7 },
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
  { id: "recreated-uncut-1020", beat: "nw_b1020", scene: "nw_s62", source: "/film/img/s62/485-the-signal-is-red.jpg", name: "Dinner with me.jpg", data: dinner, version: 5 },
  { id: "recreated-uncut-1177", beat: "nw_b1177", scene: "nw_s72", source: "/film/img/s72/69-the-wait.jpg", name: "No messages.jpg", data: noMessages, version: 5 },
  { id: "recreated-uncut-148", beat: "nw_b148", scene: "nw_s6", source: "/film/img/s6/56-three-days-ago.jpg", name: "How did she seem.jpg", data: howDidSheSeem, version: 6 },
  { id: "recreated-uncut-716", beat: "nw_b716", scene: "nw_s28", source: "/film/img/s28/203-the-sea-wall-steps.jpg", name: "Sea wall road.jpg", data: seaWallRoad, version: 6 },
] as const;
const COVERAGE_VERSION = 13;

function addBundledJpeg(assets: ProjectAsset[], plate: { id: string; name: string; data: string }): void {
  if (assets.some(asset => asset.id === plate.id)) return;
  const base64 = plate.data.split(",")[1] || "";
  assets.push({ id: plate.id, name: plate.name, type: "image", mime: "image/jpeg",
    size: Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0),
    source: "bundle", dataUrl: plate.data });
}

/** Upgrade only the exact old bundled Harada image, retaining it for any other uses. */
function upgradePreviousHarada(story: StoryLike, frames: Keyframe[], assets: ProjectAsset[], afterVersion: number): void {
  if (afterVersion >= wideHaradaPlate.version) return;
  const oldAsset = assets.find(asset => asset.id === OLD_HARADA_ID);
  if (oldAsset?.source !== "bundle" || oldAsset.dataUrl !== previousListeningToTape) return;
  const existingWide = assets.find(asset => asset.id === wideHaradaPlate.id);
  if (existingWide && (existingWide.source !== "bundle" || existingWide.dataUrl !== wideHaradaPlate.data)) return;
  const index = frames.findIndex(frame => frame.sceneId === wideHaradaPlate.scene && frame.id === wideHaradaPlate.beat);
  const frame = frames[index];
  const oldRef = `asset:${OLD_HARADA_ID}`;
  if (!frame || frame.picture !== oldRef || frame.beat.background !== oldRef || frame.beat.backgroundRevert || frame.beat.gap) return;

  // If a later beat carries the old image, keep that picture rather than
  // changing an extra shot. Gaps do not end a held image. A cross-scene carry
  // or an explicitly non-held next beat is too ambiguous to rewrite safely.
  const next = frames.slice(index + 1).find(candidate => !candidate.beat.gap);
  let restoredNext: Keyframe | undefined;
  let hadBackground = false;
  let hadCinematic = false;
  let previousBackground: string | undefined;
  let previousCinematic: Keyframe["beat"]["cinematic"];
  if (next?.picture === oldRef && !next.beat.background && !next.beat.backgroundRevert) {
    if (next.sceneId !== frame.sceneId || next.beat.backgroundHold === false) return;
    restoredNext = next;
    hadBackground = Object.prototype.hasOwnProperty.call(next.beat, "background");
    hadCinematic = Object.prototype.hasOwnProperty.call(next.beat, "cinematic");
    previousBackground = next.beat.background;
    previousCinematic = next.beat.cinematic;
    next.beat.background = oldRef;
    if (!next.beat.cinematic && next.cinematic) {
      next.beat.cinematic = JSON.parse(JSON.stringify(next.cinematic));
    }
  }
  frame.beat.background = `asset:${wideHaradaPlate.id}`;
  // A changed held picture can indirectly affect later frames. Validate the
  // entire effective sequence and back out if any other picture or look moves.
  const after = buildKeyframes(story);
  const safe = after.length === frames.length && frames.every((before, i) => {
    const current = after[i];
    return before.id === current.id && (before.id === frame.id || before.picture === current.picture) &&
      JSON.stringify(before.cinematic) === JSON.stringify(current.cinematic);
  });
  if (!safe) {
    frame.beat.background = oldRef;
    if (restoredNext) {
      if (hadBackground) restoredNext.beat.background = previousBackground;
      else delete restoredNext.beat.background;
      if (hadCinematic) restoredNext.beat.cinematic = previousCinematic;
      else delete restoredNext.beat.cinematic;
    }
    return;
  }
  // Keep any saved hold, camera, grade and animation settings intact.
  addBundledJpeg(assets, wideHaradaPlate);
}

export function addRecreatedUncutCoverage(story: StoryLike, existing: ProjectAsset[], afterVersion = 0): ProjectAsset[] {
  if (story.id !== "nobodys-witness-film") return existing;
  const frames = buildKeyframes(story);
  const assets = [...existing];
  upgradePreviousHarada(story, frames, assets, afterVersion);
  const candidates = plates.filter(plate => {
    if (plate.version <= afterVersion) return false;
    if (plate.id === wideHaradaPlate.id) {
      const already = assets.find(asset => asset.id === plate.id);
      if (already && (already.source !== "bundle" || already.dataUrl !== plate.data)) return false;
    }
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
    addBundledJpeg(assets, plate);
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
