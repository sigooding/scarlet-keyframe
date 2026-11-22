// "The Festival Cut": the Director's Export, finished as a feature. The edit itself is the director's — every shot,
// line, caption and sound clip, at the same length, so nothing drifts out of sync — and the finishing is the
// cinematographer's:
//
//  - Depth. Every shot whose picture has a depth map plays as a 2.5D shot. The depth camera moves with the shot's own
//    zoom/x/y keys (FrameDepthParallax), so a shot keeps its move and gains parallax. The amount breathes from a
//    gentle 0.14 to 0.24 across the shot: inside the range the film's hand-made rigs use, and low enough that faces
//    without cut-outs do not stretch. Shots that already have a depth rig (the director's own) are left exactly as
//    they are, unless their picture was repaired: a rig's plate and cut-outs are slices of the old picture, so the
//    shot moves to the repaired picture's own map.
//  - Camera. The "dolly" preset switches the depth camera off, so a dolly shot with keys is re-based on its keys
//    (mode static: the keys already carry the move). A shot with no move at all gets a slow push-in, or a slow
//    lateral drift on a wide shot, so no frame is a dead still. The four Vertigo dolly-zooms are left alone.
//  - Pictures. A handful of stills with visible faults (reviewed frame by frame) are replaced by repaired versions
//    that keep composition, cast, wardrobe and light. The originals are untouched, so the Director's Export still
//    plays its own pictures.
//  - Look. Film stock and grain are made consistent across the film; each scene keeps its grade.
//
// Data: src/data/festival-cut.json (depth map per picture, repaired picture per picture), made by
// scripts/build-festival-cut.mjs. Code is pure: the input project is never changed.

import festivalData from "../data/festival-cut.json";
import type { AnyRecord, BeatAnimation, BeatLike, Key, ProjectState, StoryLike } from "./model";

interface FestivalData {
  /** picture path -> depth map path (white near, black far), exact size of the picture */
  depthByPicture: Record<string, string>;
  /** picture path -> repaired picture path */
  pictureReplacements: Record<string, string>;
}

const DATA = festivalData as unknown as FestivalData;

export const FESTIVAL_DEPTH_START = 0.14;
export const FESTIVAL_DEPTH_END = 0.24;

export interface FestivalReport {
  depthAdded: number;
  depthKept: number;
  dollyRebased: number;
  movesAdded: number;
  picturesReplaced: number;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function hashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function key(frame: number, value: number, easing: Key["easing"] = "ease-in-out"): Key {
  return { frame, value, easing };
}

function hasMove(animation: BeatAnimation | undefined): boolean {
  if (!animation) return false;
  return (["zoom", "x", "y"] as const).some((ch) => {
    const keys = animation[ch];
    return Array.isArray(keys) && keys.length > 1 && keys.some((k) => k.value !== keys[0].value);
  });
}

/** A slow, motivated move for a shot that had none: a push-in, or on a wide establishing shot a lateral drift. */
function addMove(beat: BeatLike, frames: number): void {
  const last = Math.max(1, frames - 1);
  const anim: BeatAnimation = { ...(beat.animation ?? {}) };
  const text = String(beat.text ?? "").toLowerCase();
  const wide = /\b(street|avenue|lane|city|skyline|rain|harbour|viaduct|rooftop|exterior|ext\.|crowd|plaza|road)\b/.test(text);
  if (wide) {
    const dir = hashInt(String(beat.id ?? text)) % 2 === 0 ? 1 : -1;
    anim.zoom = [key(0, 1.06), key(last, 1.06, "linear")];
    anim.x = [key(0, -1.6 * dir), key(last, 1.6 * dir)];
  } else {
    anim.zoom = [key(0, 1.0), key(last, 1.055)];
  }
  beat.animation = anim;
}

/** Applies the festival finish to a copy of the Director's Export project. */
export function applyFestivalFinish(exportProject: ProjectState): { project: ProjectState; report: FestivalReport } {
  const story: StoryLike = clone(exportProject.story);
  const report: FestivalReport = { depthAdded: 0, depthKept: 0, dollyRebased: 0, movesAdded: 0, picturesReplaced: 0 };

  for (const scene of story.scenes) {
    for (const beat of scene.dialogueBeats ?? []) {
      const pic = typeof beat.background === "string" ? beat.background : "";
      if (!pic.startsWith("/film/img/") || beat.gap) continue;
      const frames = Math.max(1, Math.round(Number(beat.durationFrames) || 0));
      const cinematic: AnyRecord = { ...(beat.cinematic ?? {}) };

      // Pictures: a repaired still replaces a faulty one (its depth map is looked up for the repaired picture).
      const repaired = DATA.pictureReplacements[pic];
      if (repaired) {
        beat.background = repaired;
        report.picturesReplaced += 1;
      }
      const shown = repaired ?? pic;

      // Look: one film stock across the feature; each scene keeps its grade.
      cinematic.filmGrade = true;
      cinematic.filmGradeStrength = Math.max(Number(cinematic.filmGradeStrength) || 0, 0.3);
      cinematic.grain = true;
      cinematic.grainOpacity = 0.045;
      cinematic.vignette = true;
      cinematic.vignetteStrength = Math.max(Number(cinematic.vignetteStrength) || 0, 0.32);

      if (repaired && cinematic.depthMap) {
        // A rig drawn on the faulty picture (its plate and cut-outs are slices of it) would paint the old picture
        // over the repaired one: the shot keeps its depth amount and move, on the repaired picture's own map.
        delete cinematic.depthPlate;
        delete cinematic.depthCutouts;
        const map = DATA.depthByPicture[shown];
        if (map) cinematic.depthMap = map;
        else delete cinematic.depthMap;
        report.depthKept += 1;
        beat.cinematic = cinematic;
        continue;
      }
      if (cinematic.depthMap) {
        // The director's own rig: never touched.
        report.depthKept += 1;
        beat.cinematic = cinematic;
        continue;
      }

      const depthMap = DATA.depthByPicture[shown];
      if (cinematic.mode === "dolly-zoom") {
        beat.cinematic = cinematic;
        continue;
      }
      if (!hasMove(beat.animation)) {
        addMove(beat, frames);
        report.movesAdded += 1;
      }
      if (depthMap) {
        if (cinematic.mode === "dolly") report.dollyRebased += 1;
        cinematic.mode = "static";
        cinematic.depthMap = depthMap;
        cinematic.depthMotion = "push";
        cinematic.depthAmount = FESTIVAL_DEPTH_END;
        const anim: BeatAnimation = { ...(beat.animation ?? {}) };
        anim.depthAmount = [key(0, FESTIVAL_DEPTH_START), key(Math.max(1, frames - 1), FESTIVAL_DEPTH_END, "linear")];
        if (anim.values) {
          anim.values = { ...anim.values };
          delete anim.values.depthAmount;
        }
        beat.animation = anim;
        report.depthAdded += 1;
      }
      beat.cinematic = cinematic;
    }
  }

  return { project: { ...exportProject, story, updatedAt: Date.now() }, report };
}

export const FESTIVAL_DATA = DATA;
