import openSedanDoor from "../assets/recreated-uncut/1562-sedan-door.jpg?url&inline";
import veraAsksMara from "../assets/recreated-uncut/199-asking-about-mara.jpg?url&inline";
import plazaMiniatures from "../assets/recreated-uncut/1439-plaza-miniatures.jpg?url&inline";
import veraReadsNotebook from "../assets/recreated-uncut/1332-reading-notebook.jpg?url&inline";
import kanekoAtCounter from "../assets/recreated-uncut/465-kaneko-at-counter.jpg?url&inline";
import veraInStoreroom from "../assets/recreated-uncut/1464-vera-storeroom.jpg?url&inline";
import ishidaDrives from "../assets/recreated-uncut/1007-ishida-drives.jpg?url&inline";
import jackRemembers from "../assets/recreated-uncut/288-jack-remembers.jpg?url&inline";
import shadowedCarWindow from "../assets/recreated-uncut/1302-black-sedan-window.jpg?url&inline";
import ishidasAnswer from "../assets/recreated-uncut/1349-ishidas-answer.jpg?url&inline";
import justAnInn from "../assets/recreated-uncut/773-just-an-inn.jpg?url&inline";
import veraReadsLetter from "../assets/recreated-uncut/1316-vera-reads-letter.jpg?url&inline";
import dressReady from "../assets/recreated-uncut/1076-dress-ready.jpg?url&inline";
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
import heHangsUp from "../assets/recreated-uncut/115-he-hangs-up.jpg?url&inline";
import reconstructingIt from "../assets/recreated-uncut/314-reconstructing-it.jpg?url&inline";
import umbrellaSwings from "../assets/recreated-uncut/418-umbrella-swings.jpg?url&inline";
import somethingSlow from "../assets/recreated-uncut/1176-something-slow.jpg?url&inline";
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
import sedanDoorDepth from "../assets/recreated-uncut/depth/1562-sedan-door-depth.jpg?url&inline";
import vereLetterDepth from "../assets/recreated-uncut/depth/1316-vera-reads-letter-depth.jpg?url&inline";
import kanekoCounterDepth from "../assets/recreated-uncut/depth/465-kaneko-counter-depth.jpg?url&inline";
import { buildKeyframes, type Keyframe, type ProjectAsset, type ProjectState, type StoryLike } from "./model";

const OLD_HARADA_ID = "duplicate-uncut-1383";
const wideHaradaPlate = { id: "duplicate-uncut-1383-wide", beat: "nw_b1383", scene: "nw_s82", source: "/film/img/s82/509-twenty-years-younger.jpg", name: "Listening to the tape (wide).jpg", data: wideListeningToTape, version: 13 } as const;

// Only replacements selected in this recovery are listed here. The original
// imported story is never modified, and saved user pictures are left intact.
const plates = [
  { id: "duplicate-uncut-1562", beat: "nw_b1562", scene: "nw_s94", source: "/film/img/s94/139-only-tea.jpg", name: "The open sedan door.jpg", data: openSedanDoor, version: 15 },
  { id: "duplicate-uncut-199", beat: "nw_b199", scene: "nw_s8", source: "/film/img/s8/160-were-closed.jpg", name: "Vera asks about Mara.jpg", data: veraAsksMara, version: 15 },
  { id: "duplicate-uncut-1439", beat: "nw_b1439", scene: "nw_s83", source: "/film/img/retakes_2026_10_20/112-every-page-r1.jpg", name: "The tiny plaza.jpg", data: plazaMiniatures, version: 15 },
  { id: "duplicate-uncut-1332", beat: "nw_b1332", scene: "nw_s79", source: "/film/img/s79/92-underlined-twice.jpg", name: "Vera reads the notebook.jpg", data: veraReadsNotebook, version: 15 },
  { id: "duplicate-uncut-465", beat: "nw_b465", scene: "nw_s17", source: "/film/img/s17/434-i-was-already-old.jpg", name: "Kaneko at the counter.jpg", data: kanekoAtCounter, version: 15 },
  { id: "duplicate-uncut-1464", beat: "nw_b1464", scene: "nw_s84", source: "/film/img/s84/117-both-wrong.jpg", name: "Vera in the storeroom.jpg", data: veraInStoreroom, version: 15 },
  { id: "duplicate-uncut-1007", beat: "nw_b1007", scene: "nw_s61", source: "/film/img/s61/481-the-side-of-his-face.jpg", name: "Ishida behind the wheel.jpg", data: ishidaDrives, version: 15 },
  { id: "duplicate-uncut-288", beat: "nw_b288", scene: "nw_s11", source: "/film/img/s11/167-two-men-laughing.jpg", name: "Jack studies the photograph.jpg", data: jackRemembers, version: 15 },
  { id: "duplicate-uncut-1302", beat: "nw_b1302", scene: "nw_s77a", source: "/film/img/s77a/1296-everyone-is-allowed-one.jpg", name: "The shadowed car window.jpg", data: shadowedCarWindow, version: 15 },
  { id: "duplicate-uncut-1349", beat: "nw_b1349", scene: "nw_s80", source: "/film/img/s80/95-ishida-doesnt-look-up.jpg", name: "Ishida's answer.jpg", data: ishidasAnswer, version: 14 },
  { id: "duplicate-uncut-773", beat: "nw_b773", scene: "nw_s36", source: "/film/img/s36/538-the-receipts-in-his-hand.jpg", name: "Just an inn.jpg", data: justAnInn, version: 14 },
  { id: "duplicate-uncut-1316", beat: "nw_b1316", scene: "nw_s79", source: "/film/img/s79/91-grey-light.jpg", name: "Vera reads the letter.jpg", data: veraReadsLetter, version: 14 },
  { id: "duplicate-uncut-1076", beat: "nw_b1076", scene: "nw_s65_b", source: "/film/img/s65/232-the-wine-red-dress.jpg", name: "The dress is ready.jpg", data: dressReady, version: 14 },
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
  { id: "duplicate-uncut-115", beat: "nw_b115", scene: "nw_s5", source: "/film/img/s5/48-the-quiet-phone-call.jpg", name: "He hangs up.jpg", data: heHangsUp, version: 16 },
  { id: "duplicate-uncut-314", beat: "nw_b314", scene: "nw_s12", source: "/film/img/s12/168-the-strap.jpg", name: "Reconstructing it.jpg", data: reconstructingIt, version: 16 },
  { id: "duplicate-uncut-418", beat: "nw_b418", scene: "nw_s14a", source: "/film/img/s14a/340-the-shuttered-door.jpg", name: "The umbrella swings.jpg", data: umbrellaSwings, version: 16 },
  { id: "duplicate-uncut-1176", beat: "nw_b1176", scene: "nw_s72", source: "/film/img/s72/69-the-wait.jpg", name: "Something slow.jpg", data: somethingSlow, version: 16 },
] as const;
const COVERAGE_VERSION = 16;
/** Depth maps are added separately so earlier saved Uncut projects pick them up. */
const DEPTH_VERSION = 17;
const UPGRADE_VERSION = Math.max(COVERAGE_VERSION, DEPTH_VERSION);

/**
 * Voted greyscale depth maps for recreated Uncut stills. Each map was drawn from
 * its own plate, so it may only drive the picture it was made for. Keyed by beat
 * so a plate that is not installed can never pick up another shot's map. The map
 * is bundled as an inline asset so the single-file build needs no server, and a
 * full-size copy is kept at `public/` `sourcePath` for inspection.
 */
export const RECREATED_DEPTH_MAP_BY_BEAT: Readonly<Record<string, {
  plateAssetId: string;
  depthAssetId: string;
  depthAssetName: string;
  sourcePath: string;
  data: string;
  depthAmount: number;
}>> = {
  nw_b1562: {
    plateAssetId: "duplicate-uncut-1562",
    depthAssetId: "depth-uncut-1562",
    depthAssetName: "The open sedan door (depth).jpg",
    sourcePath: "/film/depth/recreated-uncut/1562-sedan-door-depth.jpg",
    data: sedanDoorDepth,
    depthAmount: 0.28,
  },
  nw_b465: {
    plateAssetId: "duplicate-uncut-465",
    depthAssetId: "depth-uncut-465",
    depthAssetName: "Kaneko at the counter (depth).jpg",
    sourcePath: "/film/depth/recreated-uncut/465-kaneko-counter-depth.jpg",
    data: kanekoCounterDepth,
    depthAmount: 0.26,
  },
  nw_b1316: {
    plateAssetId: "duplicate-uncut-1316",
    depthAssetId: "depth-uncut-1316",
    depthAssetName: "Vera reads the letter (depth).jpg",
    sourcePath: "/film/depth/recreated-uncut/1316-vera-reads-letter-depth.jpg",
    data: vereLetterDepth,
    depthAmount: 0.26,
  },
};

/**
 * Gives a recreated still its own 2.5D camera. Only touches a beat that still
 * shows the bundled plate and has no depth rig of its own, so camera, grade and
 * user-added depth work are never discarded.
 */
function addRecreatedDepthMaps(story: StoryLike, assets: ProjectAsset[], afterVersion: number): void {
  if (afterVersion >= DEPTH_VERSION) return;
  const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
  for (const frame of buildKeyframes(story)) {
    const entry = RECREATED_DEPTH_MAP_BY_BEAT[frame.id];
    if (!entry) continue;
    const plate = `asset:${entry.plateAssetId}`;
    if (frame.picture !== plate && frame.beat.background !== plate) continue;
    const cinematic = frame.cinematic;
    if (cinematic && (has(cinematic, "depthMap") || has(cinematic, "depthPlate") || has(cinematic, "depthCutouts"))) continue;
    const existing = assets.find(asset => asset.id === entry.depthAssetId);
    if (existing && (existing.source !== "bundle" || existing.dataUrl !== entry.data)) continue;
    // The map must be the same file the plate was drawn against; never reuse a
    // user asset that happens to share the bundled id.
    addBundledJpeg(assets, { id: entry.depthAssetId, name: entry.depthAssetName, data: entry.data });
    // A dolly preset travels across an oversized plate, so it cannot be combined
    // with a depth camera; the shot keeps its focal point and duration but is
    // re-based on the static 2.5D push the depth map was drawn for.
    frame.beat.cinematic = {
      ...(frame.beat.cinematic ?? {}),
      mode: "static",
      depthMap: `asset:${entry.depthAssetId}`,
      depthMotion: "push",
      depthAmount: entry.depthAmount,
      depthSeconds: 8,
    };
  }
}

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
    // Never redirect a shot to a user asset that happens to share a bundled ID.
    const already = assets.find(asset => asset.id === plate.id);
    if (already && (already.source !== "bundle" || already.dataUrl !== plate.data)) return false;
    const frame = frames.find(f => f.sceneId === plate.scene && f.id === plate.beat);
    if (!frame || frame.picture !== plate.source || frame.beat.background || frame.beat.backgroundRevert || frame.beat.gap) return false;
    if (plate.version >= 15) {
      // Explicit shot-specific layers and hold settings are user edits; do not
      // discard them merely because the underlying picture still matches.
      const shotMedia = ["depthMap", "depthPlate", "depthCutouts", "foregroundImage", "foregroundExtras", "parallaxLayers", "foregroundAnimation"];
      if (frame.beat.backgroundHold === true || (frame.beat.cinematic &&
        shotMedia.some(key => Object.prototype.hasOwnProperty.call(frame.beat.cinematic, key)))) return false;
    }
    const next = frames[frames.indexOf(frame) + 1];
    return !(next?.sceneId === frame.sceneId && next.picture === plate.source &&
      !next.beat.background && !next.beat.backgroundRevert && next.beat.backgroundHold === false);
  });
  const selected = new Set(candidates.map(plate => plate.beat));
  for (const plate of candidates) {
    const frame = frames.find(f => f.sceneId === plate.scene && f.id === plate.beat)!;
    const next = frames[frames.indexOf(frame) + 1];
    // A saved edit can make the next still (or its look) depend on the held
    // picture. Record the complete effective sequence before a v15 insertion;
    // if any other frame changes, restore the original beat fields below.
    const before = plate.version >= 15 ? buildKeyframes(story).map(item => ({
      id: item.id, picture: item.picture, cinematic: JSON.stringify(item.cinematic),
    })) : undefined;
    const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
    const previous = before ? {
      hadBackground: has(frame.beat, "background"), background: frame.beat.background,
      hadHold: has(frame.beat, "backgroundHold"), hold: frame.beat.backgroundHold,
      hadCinematic: has(frame.beat, "cinematic"), cinematic: frame.beat.cinematic,
      nextHadBackground: !!next && has(next.beat, "background"), nextBackground: next?.beat.background,
    } : undefined;
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
    if (before && previous) {
      const after = buildKeyframes(story);
      const safe = after.length === before.length && before.every((old, index) => {
        const current = after[index];
        return old.id === current.id && (old.id === frame.id ||
          (old.picture === current.picture && old.cinematic === JSON.stringify(current.cinematic)));
      });
      if (!safe) {
        if (previous.hadBackground) frame.beat.background = previous.background;
        else delete frame.beat.background;
        if (previous.hadHold) frame.beat.backgroundHold = previous.hold;
        else delete frame.beat.backgroundHold;
        if (previous.hadCinematic) frame.beat.cinematic = previous.cinematic;
        else delete frame.beat.cinematic;
        if (next) {
          if (previous.nextHadBackground) next.beat.background = previous.nextBackground;
          else delete next.beat.background;
        }
        continue;
      }
    }
    addBundledJpeg(assets, plate);
  }
  addRecreatedDepthMaps(story, assets, afterVersion);
  return assets;
}

/** Apply new coverage once to saved Original Uncut, including its stashed state. */
export function upgradeSavedRecreatedUncut(project: ProjectState): ProjectState {
  const previous = project.recreatedUncutCoverageVersion ?? 0;
  if (project.originalStory.id !== "nobodys-witness-film" || previous >= UPGRADE_VERSION) return project;
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
  return { ...project, story, assets, savedCutStates, recreatedUncutCoverageVersion: UPGRADE_VERSION };
}
