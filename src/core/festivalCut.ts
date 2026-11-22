// "The Festival Cut": the Director's Export, finished as a feature. The edit itself is the director's — every shot,
// line and caption, at the same length, so nothing drifts out of sync — and the finishing is the cinematographer's
// and the sound designer's:
//
//  - Depth. Every shot whose picture has a depth map plays as a 2.5D shot. The depth camera moves with the shot's own
//    zoom/x/y keys (FrameDepthParallax), so a shot keeps its move and gains parallax. The amount breathes from a
//    gentle 0.14 to 0.24 across the shot: inside the range the film's hand-made rigs use, and low enough that faces
//    without cut-outs do not stretch. The close-ups that hold the screen longest have their people cut out (a plate
//    with the people painted out, and a layer per person), so they can take more depth, 0.2 to 0.34, without rubber
//    faces. Shots that already have a depth rig (the director's own) keep their camera exactly as it is, unless their
//    picture was repaired: a rig's plate and cut-outs are slices of the old picture, so the shot moves to the repaired
//    picture's own map.
//  - Camera. The "dolly" preset switches the depth camera off, so a dolly shot with keys is re-based on its keys
//    (mode static: the keys already carry the move). A shot with no move at all gets a slow push-in, or a slow
//    lateral drift on a wide shot, so no frame is a dead still. The four Vertigo dolly-zooms are left alone. The
//    raids, the Hive shootout, Vera's run and the night of the call go handheld: a float over the shot's own move.
//  - Light. A shot whose picture has a practical in it (a lamp, a street light, a neon sign, a vending machine) gets
//    a soft glow on it that breathes the way that light would: neon flickers, a flame wavers, a lamp barely moves.
//  - Motion. Six shots play as real motion, made from their own pictures (Vera starting to run, the train overhead,
//    the red shoe, the car, the incense, the rain at the service).
//  - Pictures. A handful of stills with visible faults (reviewed frame by frame) are replaced by repaired versions
//    that keep composition, cast, wardrobe and light. The originals are untouched.
//  - Sound. Foley where the film had none, Kurose's sedan, a fuller Hive shootout; the rain under Mara's service plays
//    only outside, so the song has the room to itself indoors.
//  - Look. Film stock and grain are made consistent across the film; each scene keeps its grade.
//
// Data: src/data/festival-cut.json, made by scripts/build-festival-cut.mjs. Code is pure: the input is never changed.

import festivalData from "../data/festival-cut.json";
import type { AudioClip } from "./audioClips";
import { handheldAnimation } from "./cameraDrive";
import { buildKeyframes, type AnyRecord, type BeatAnimation, type BeatLike, type Key, type ProjectState, type StoryLike } from "./model";
import { clipFrames, FPS } from "./timing";

export interface FestivalCutout {
  depthMap: string;
  depthPlate: string;
  depthCutouts: { image: string; depth: number }[];
}

export interface FestivalSound {
  id: string;
  lane: "sfx" | "ambience";
  src: string;
  anchorId: string;
  gain: number;
  offsetMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
  /** length of the file, ms (a clip never plays past its file unless it loops) */
  fileMs?: number;
  /** cut it short */
  maxMs?: number;
  /** run it to the end of this shot (inclusive) */
  untilAnchorId?: string;
}

export interface FestivalData {
  /** picture path -> depth map path (white near, black far), exact size of the picture */
  depthByPicture: Record<string, string>;
  /** picture path -> repaired picture path */
  pictureReplacements: Record<string, string>;
  /** picture path -> people cut out: depth map with them painted out, the plate, a layer per person */
  cutoutsByPicture?: Record<string, FestivalCutout>;
  /** picture path -> the practical light in it (x, y in % of the frame; its colour) */
  practicalByPicture?: Record<string, { x: number; y: number; color: string }>;
  /** beat id -> a real-motion clip made from its picture */
  videoShots?: Record<string, string>;
  sfx?: FestivalSound[];
  ambience?: FestivalSound[];
  /** clip ids of the Director's Export that the festival mix drops (replaced by its own) */
  removeClips?: string[];
  /** clip id -> fields changed in the festival mix */
  clipPatches?: Record<string, Partial<AudioClip>>;
}

const DATA = festivalData as unknown as FestivalData;

export const FESTIVAL_DEPTH_START = 0.14;
export const FESTIVAL_DEPTH_END = 0.24;
export const FESTIVAL_CUTOUT_DEPTH_START = 0.2;
export const FESTIVAL_CUTOUT_DEPTH_END = 0.34;
/** The engine plays at most this many cut-outs in one shot. */
export const MAX_CUTOUTS = 4;

/** Scenes that go handheld: the raids, the Hive shootout, Kurose's men, Vera's run and the night of the call. */
export const HANDHELD_SCENES =
  /^(nw_cut_inn-raid_\d+|nw_song_raid_\d+|nw_s38|nw_s70|nw_s71|nw_s93|nw_s95|nw_song_bad-guy_(0[5-9]|[1-3]\d))$/;
export const HANDHELD = { sway: 0.55, bob: 0.4, roll: 0.3, speed: 1.3 } as const;

export interface FestivalReport {
  depthAdded: number;
  depthKept: number;
  cutoutShots: number;
  dollyRebased: number;
  movesAdded: number;
  handheldShots: number;
  lightsAdded: number;
  videoShots: number;
  picturesReplaced: number;
  soundsAdded: number;
  soundsRemoved: number;
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

/** A channel's value at a frame, straight between its keys (close enough to lay a hand over). */
function valueAt(keys: Key[] | undefined, frame: number, rest: number): number {
  if (!Array.isArray(keys) || !keys.length) return rest;
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  if (frame <= sorted[0].frame) return sorted[0].value;
  for (let i = 1; i < sorted.length; i += 1) {
    if (frame <= sorted[i].frame) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const t = b.frame === a.frame ? 1 : (frame - a.frame) / (b.frame - a.frame);
      return a.value + (b.value - a.value) * t;
    }
  }
  return sorted[sorted.length - 1].value;
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

function breathe(beat: BeatLike, frames: number, from: number, to: number): void {
  const anim: BeatAnimation = { ...(beat.animation ?? {}) };
  anim.depthAmount = [key(0, from), key(Math.max(1, frames - 1), to, "linear")];
  if (anim.values) {
    anim.values = { ...anim.values };
    delete anim.values.depthAmount;
  }
  beat.animation = anim;
}

/** How the light in the picture breathes, from what the shot says it is. */
export function practicalLight(spot: { x: number; y: number; color: string }, text: string): AnyRecord {
  const t = text.toLowerCase();
  let pulseSeconds = 4.5;
  let pulseAmount = 0.2;
  let intensity = 0.3;
  if (/\bneon|\bsign\b|signboard/.test(t)) [pulseSeconds, pulseAmount, intensity] = [0.9, 0.6, 0.38];
  else if (/candle|fire|flame|incense|lighter|\bmatch\b/.test(t)) [pulseSeconds, pulseAmount, intensity] = [1.1, 0.5, 0.36];
  else if (/vending|fluorescent|\btube\b|television|\btv\b|screen/.test(t)) [pulseSeconds, pulseAmount] = [2.2, 0.15];
  return { x: spot.x, y: spot.y, color: spot.color, intensity, size: 16, pulseSeconds, pulseAmount };
}

/** Applies the festival finish to a copy of the Director's Export project. */
export function applyFestivalFinish(exportProject: ProjectState): { project: ProjectState; report: FestivalReport } {
  const story: StoryLike = clone(exportProject.story);
  const report: FestivalReport = {
    depthAdded: 0,
    depthKept: 0,
    cutoutShots: 0,
    dollyRebased: 0,
    movesAdded: 0,
    handheldShots: 0,
    lightsAdded: 0,
    videoShots: 0,
    picturesReplaced: 0,
    soundsAdded: 0,
    soundsRemoved: 0,
  };

  // Every shot's real length (a montage shot has no durationFrames: it runs on its delay), in play order.
  const keyframes = buildKeyframes(story);
  const framesOf = new Map<string, number>();
  const order: string[] = [];
  for (const frame of keyframes) {
    const id = String(frame.beat.id);
    framesOf.set(id, clipFrames(frame));
    order.push(id);
  }

  for (const scene of story.scenes) {
    const handheld = HANDHELD_SCENES.test(String(scene.id));
    for (const beat of scene.dialogueBeats ?? []) {
      const pic = typeof beat.background === "string" ? beat.background : "";
      if (!pic.startsWith("/film/img/") || beat.gap) continue;
      const id = String(beat.id);
      const frames = Math.max(1, framesOf.get(id) ?? Math.round(Number(beat.durationFrames) || 0));
      const cinematic: AnyRecord = { ...(beat.cinematic ?? {}) };

      // Look: one film stock across the feature; each scene keeps its grade.
      cinematic.filmGrade = true;
      cinematic.filmGradeStrength = Math.max(Number(cinematic.filmGradeStrength) || 0, 0.3);
      cinematic.grain = true;
      cinematic.grainOpacity = 0.045;
      cinematic.vignette = true;
      cinematic.vignetteStrength = Math.max(Number(cinematic.vignetteStrength) || 0, 0.32);

      // Motion: a real clip made from this picture. A video shot has no depth or cut-outs of its own.
      const video = DATA.videoShots?.[id];
      if (video) {
        beat.background = `video:${video}`;
        for (const k of ["depthMap", "depthPlate", "depthCutouts", "depthAmount", "depthMotion", "depthFocus"]) delete cinematic[k];
        cinematic.mode = "static";
        if (beat.animation) {
          const anim = { ...beat.animation };
          delete anim.depthAmount;
          beat.animation = anim;
        }
        report.videoShots += 1;
        beat.cinematic = cinematic;
        continue;
      }

      // Pictures: a repaired still replaces a faulty one (its depth map is looked up for the repaired picture).
      const repaired = DATA.pictureReplacements[pic];
      if (repaired) {
        beat.background = repaired;
        report.picturesReplaced += 1;
      }
      const shown = repaired ?? pic;

      // Light: the practical in the picture glows, unless the shot already has lights of its own.
      const practical = DATA.practicalByPicture?.[shown];
      if (practical && !(Array.isArray(cinematic.lights) && cinematic.lights.length) && !cinematic.lightSource) {
        cinematic.lights = [practicalLight(practical, String(beat.text ?? ""))];
        report.lightsAdded += 1;
      }

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
        // The director's own rig: its camera is never touched.
        report.depthKept += 1;
        beat.cinematic = cinematic;
        continue;
      }

      if (cinematic.mode === "dolly-zoom") {
        beat.cinematic = cinematic;
        continue;
      }
      if (!hasMove(beat.animation)) {
        addMove(beat, frames);
        report.movesAdded += 1;
      }
      if (handheld) {
        const own = beat.animation ?? {};
        const animation = handheldAnimation({
          durationFrames: frames,
          ...HANDHELD,
          seed: id,
          base: own,
          basePoseAt: (f) => ({
            zoom: valueAt(own.zoom, f, 1),
            x: valueAt(own.x, f, 0),
            y: valueAt(own.y, f, 0),
            rotation: valueAt(own.rotation, f, 0),
          }),
        });
        if (animation) {
          beat.animation = animation;
          report.handheldShots += 1;
        }
      }

      const cutout = DATA.cutoutsByPicture?.[shown];
      const depthMap = cutout?.depthMap ?? DATA.depthByPicture[shown];
      if (depthMap) {
        if (cinematic.mode === "dolly") report.dollyRebased += 1;
        cinematic.mode = "static";
        cinematic.depthMap = depthMap;
        cinematic.depthMotion = "push";
        if (cutout) {
          cinematic.depthPlate = cutout.depthPlate;
          cinematic.depthCutouts = cutout.depthCutouts.slice(0, MAX_CUTOUTS);
          cinematic.depthAmount = FESTIVAL_CUTOUT_DEPTH_END;
          breathe(beat, frames, FESTIVAL_CUTOUT_DEPTH_START, FESTIVAL_CUTOUT_DEPTH_END);
          report.cutoutShots += 1;
        } else {
          cinematic.depthAmount = FESTIVAL_DEPTH_END;
          breathe(beat, frames, FESTIVAL_DEPTH_START, FESTIVAL_DEPTH_END);
        }
        report.depthAdded += 1;
      }
      beat.cinematic = cinematic;
    }
  }

  // Sound: the export's mix, less what the festival replaces, plus its own.
  const removed = new Set(DATA.removeClips ?? []);
  const patches = DATA.clipPatches ?? {};
  const audioClips: AudioClip[] = [];
  for (const clip of exportProject.audioClips ?? []) {
    if (removed.has(clip.id)) {
      report.soundsRemoved += 1;
      continue;
    }
    audioClips.push(patches[clip.id] ? { ...clip, ...patches[clip.id] } : clip);
  }
  const spanMs = (from: string, until: string): number => {
    const a = order.indexOf(from);
    const b = order.indexOf(until);
    if (a < 0 || b < a) return 0;
    let frames = 0;
    for (let i = a; i <= b; i += 1) frames += framesOf.get(order[i]) ?? 0;
    return (frames / FPS) * 1000;
  };
  for (const sound of [...(DATA.sfx ?? []), ...(DATA.ambience ?? [])]) {
    if (!framesOf.has(sound.anchorId)) continue;
    const offsetMs = sound.offsetMs ?? 0;
    let durationMs = sound.untilAnchorId ? spanMs(sound.anchorId, sound.untilAnchorId) - offsetMs : (sound.fileMs ?? 0);
    if (!sound.loop && sound.fileMs) durationMs = Math.min(durationMs, sound.fileMs);
    if (sound.maxMs) durationMs = Math.min(durationMs, sound.maxMs);
    if (!(durationMs > 0)) continue;
    audioClips.push({
      id: sound.id,
      lane: sound.lane,
      src: sound.src,
      anchorId: sound.anchorId,
      offsetMs,
      inMs: 0,
      durationMs: Math.round(durationMs),
      gain: sound.gain,
      fadeInMs: sound.fadeInMs ?? 0,
      fadeOutMs: sound.fadeOutMs ?? 0,
      loop: Boolean(sound.loop),
    });
    report.soundsAdded += 1;
  }

  return { project: { ...exportProject, story, audioClips, updatedAt: Date.now() }, report };
}

export const FESTIVAL_DATA = DATA;
