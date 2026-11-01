#!/usr/bin/env node
// Plan the Sweet Jesus scene stills from the storyboard and the reference sheets.
// For every scene after the opening it records the room sheet, the prop sheets and
// the cast portraits a still must match, together with the beats to cover and how
// many stills the scene gets. Nothing here is installed into the film: it is the
// shooting order for the still generations that follow.
//
//   node scripts/build-sweet-jesus-still-plan.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const film = JSON.parse(readFileSync(resolve(root, "src/data/sweet-jesus-film.json"), "utf8"));
const locations = JSON.parse(readFileSync(resolve(root, "src/data/sweet-jesus-locations.json"), "utf8"));
const props = JSON.parse(readFileSync(resolve(root, "src/data/sweet-jesus-props.json"), "utf8"));
const cast = JSON.parse(readFileSync(resolve(root, "src/data/sweet-jesus-characters.json"), "utf8"));

// The opening scene keeps its seven voted stills; every later scene is planned here.
const OPENING_SCENE = "sj_s01";

// The wash-n-dry has its own voted references, kept in the launderette file rather
// than with the location plates generated later.
const LAUNDERETTE = {
  sj_s01: "launderette/interior",
  sj_s08: "launderette/interior",
  sj_s14: "launderette/interior",
  sj_s27: "launderette/interior",
};

// Screenplay speaker -> cast portrait id. Voices without a portrait (OFFICER, CLERK,
// GUARD, NURSE, ...) are listed separately so a prompt never invents a face for them.
const PORTRAIT_BY_SPEAKER = {
  BUG: "bug-ray",
  PEANUT: "peanut-ray",
  ETTA: "etta-ray",
  JACK: "jack-monroe",
  VERA: "vera-voss",
  CORN: "corn-brandt",
  PIKE: "frank-pike",
  KELLERMAN: "whitney-kellerman",
  NICKY: "nicky",
  CLUTCH: "clutch",
  TICK: "tick-lane",
  HARRIETT: "harriett",
  DOVE: "dove",
  SAL: "sal-vetrano",
};
const KNOWN = new Set(cast.map((character) => character.id));

/** Two or three stills a scene, and a dozen for the 76-beat warehouse climax. */
function shotCount(beatCount) {
  if (beatCount > 40) return 12;
  if (beatCount <= 8) return 2;
  return 3;
}

const sceneOfLocation = new Map(locations.flatMap((ref) => ref.scenes.map((id) => [id, ref.id])));
const propsOfScene = new Map(props.flatMap((ref) => ref.scenes.map((id) => [id, ref.id])));

const scenes = film.scenes
  .filter((scene) => scene.id !== OPENING_SCENE)
  .map((scene) => {
    const beats = (scene.dialogueBeats ?? []).filter((beat) => !beat.gap);
    const speakerIds = [...new Set(beats.map((beat) => beat.characterId).filter(Boolean))];
    // O.S. and ON TAPE speakers are heard, never seen: a still must not put them in frame.
    const heard = (id) => /-(o-s|on-tape)$/.test(String(id));
    const inFrame = speakerIds.filter((id) => id !== "sj_stage" && !heard(id));
    const offscreen = speakerIds.filter((id) => heard(id));
    const nameOf = (id) => String(id).replace(/^sj_/, "").toUpperCase().replace(/-.*$/, "");
    const names = [...new Set(inFrame.map(nameOf))];
    const portraits = [...new Set(names.map((name) => PORTRAIT_BY_SPEAKER[name]).filter(Boolean))];
    const uncast = names.filter((name) => !PORTRAIT_BY_SPEAKER[name]).sort();
    const unknown = portraits.filter((id) => !KNOWN.has(id));
    if (unknown.length) throw new Error(`Cast portrait missing for ${unknown.join(", ")}`);
    const location = LAUNDERETTE[scene.id] ?? sceneOfLocation.get(scene.id);
    if (!location) throw new Error(`No location sheet for ${scene.id}`);
    return {
      id: scene.id,
      title: scene.title,
      beatCount: beats.length,
      seconds: Number((beats.reduce((sum, beat) => sum + beat.durationFrames, 0) / 24).toFixed(2)),
      shotCount: shotCount(beats.length),
      location,
      props: props.flatMap((ref) => (ref.scenes.includes(scene.id) ? [ref.id] : [])),
      cast: portraits,
      uncastSpeakers: uncast,
      heardNotSeen: [...new Set(offscreen.map(nameOf))].sort(),
      beats: beats.map((beat) => ({
        id: beat.id,
        seconds: Number((beat.durationFrames / 24).toFixed(2)),
        shot: beat.shotDescription,
        line: beat.text || "",
        speaker: beat.characterId && beat.text ? String(beat.characterId).replace(/^sj_/, "").toUpperCase() : "",
      })),
    };
  });

const plan = {
  film: film.id,
  openingScene: OPENING_SCENE,
  openingNote: "The opening keeps its seven voted stills; its location and prop sheets are the launderette references.",
  shotCounts: { rule: "2 stills up to 8 beats, 3 above, 12 for the warehouse climax" },
  totalShots: scenes.reduce((sum, scene) => sum + scene.shotCount, 0),
  totalBeats: scenes.reduce((sum, scene) => sum + scene.beatCount, 0),
  scenes,
};
if (propsOfScene.size && !scenes.length) throw new Error("No scenes planned.");

const out = resolve(root, "reviews/sweet-jesus-sheets-20261031/scene-stills-plan.json");
writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`Planned ${plan.totalShots} stills across ${scenes.length} scenes (${plan.totalBeats} beats) -> ${out}`);
