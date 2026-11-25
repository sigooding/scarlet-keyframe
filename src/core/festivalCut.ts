// "The Festival Cut": the Director's Export, finished as a feature. The edit itself is the director's — every shot,
// line and caption, at the same length, so nothing drifts out of sync — and the finishing is the cinematographer's
// and the sound designer's:
//
//  - Depth. Every shot whose picture has a depth map plays as a 2.5D shot. The depth camera moves with the shot's own
//    zoom/x/y keys (FrameDepthParallax), so a shot keeps its move and gains parallax. The amount breathes from a
//    gentle 0.14 to 0.24 across the shot: inside the range the film's hand-made rigs use. The close-ups that hold the
//    screen longest have their people cut out (a plate with the people painted out, and a layer per person), so they
//    can take more depth, 0.2 to 0.34. However much depth a shot has, its near layers never grow or slide more than
//    3% of the frame against the background over the shot (MAX_PARALLAX, by the engine's own maths: a push-in
//    multiplies the depth). Past that the picture stretched at the edges of what is near and cut-out people slid,
//    worst in Mara's service, where slow 18% push-ins met full depth. Shots that already have a depth rig (the
//    director's own) keep their camera exactly as it is, within the same limit, unless their picture was repaired: a
//    rig's plate and cut-outs are slices of the old picture, so the shot moves to the repaired picture's own map.
//  - Camera. The "dolly" preset switches the depth camera off, so a dolly shot with keys is re-based on its keys
//    (mode static: the keys already carry the move). A shot with no move at all gets a slow push-in, or a slow
//    lateral drift on a wide shot, so no frame is a dead still. The four Vertigo dolly-zooms are left alone. The
//    raids, the Hive shootout, Vera's run and the night of the call go handheld: a float over the shot's own move.
//  - Light. A shot whose picture has a practical in it (a lamp, a street light, a neon sign, a vending machine) gets
//    a soft glow on it that breathes the way that light would, slowly: neon and flame a little more, a lamp barely.
//  - Motion. Six shots play as real motion, made from their own pictures (Vera starting to run, the train overhead,
//    the red shoe, the car, the incense, the rain at the service).
//  - Pictures. A handful of stills with visible faults (reviewed frame by frame) are replaced by repaired versions
//    that keep composition, cast, wardrobe and light. The originals are untouched.
//  - Sound. Every line of dialogue brought to one level (within 1.5 dB of the film's median, never more than 6 dB
//    of correction); Foley where the film had none, Kurose's sedan, a fuller Hive shootout; the rain under Mara's service plays
//    only outside, so the song has the room to itself indoors.
//  - Weather. A scene's rain falls outdoors only: the indoor shots in it (Kaneko's room at the service, inside the
//    cars, the altar room, the hotel lounge, Vera's flat) are dry, and hear the rain outside.
//  - Credits. The cast is credited to ElevenLabs, who made it; the tagline is gone from the title card and the end
//    card after the credits is left out, so the film ends on the credits. The closing song comes up from under the
//    last scene to full as the credits start, and fades out with the last frame.
//  - Look. Grain and vignette are made consistent across the film; each scene keeps its grade. No flicker anywhere:
//    the film-grade overlay's flicker is never switched on, and no light pulses faster than once in two seconds.
//
// Data: src/data/festival-cut.json, made by scripts/build-festival-cut.mjs. Code is pure: the input is never changed.

import festivalData from "../data/festival-cut.json";
import type { AudioClip } from "./audioClips";
import { handheldAnimation } from "./cameraDrive";
import { cutawayPieceId, splitShot } from "./cutaways";
import { buildKeyframes, type AnyRecord, type BeatAnimation, type BeatLike, type Key, type ProjectState, type StoryLike } from "./model";
import { clipFrames, FPS } from "./timing";

export interface FestivalCutout {
  depthMap: string;
  depthPlate: string;
  depthCutouts: { image: string; depth: number }[];
}

export interface FestivalTitleCard {
  kicker?: string;
  title: string;
  subtitle?: string;
}

export interface FestivalMusicHandoff {
  /** the export's music clip */
  clipId: string;
  /** the shot where it comes up */
  atAnchorId: string;
  /** its level from there (1 = full) */
  gain: number;
  /** how long it takes to come up */
  fadeMs: number;
  /** how long it takes to go, ending on the film's last frame */
  fadeOutMs: number;
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
  /** beat ids of indoor shots (a room, inside a car; a split shot's pieces follow it): the scene's rain stays outside */
  dry?: string[];
  /** beat id -> the title card it shows instead (the credits) */
  titleCards?: Record<string, FestivalTitleCard>;
  /** scenes the festival leaves out of the running order (the end card after the credits) */
  dropScenes?: string[];
  /** a song the export plays low that comes up to full for the credits, and fades out with the last frame */
  musicHandoffs?: FestivalMusicHandoff[];
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
  /**
   * Cutaways that break up a long-held shot: within the shot (by id), from frame `from` to frame `to` (relative to
   * the shot's start), the picture cuts to `picture`, then back. The shot's total length and every sound anchored to
   * it stay exactly where they were.
   */
  inserts?: { beatId: string; cuts: { from: number; to: number; picture: string; text: string }[] }[];
  /** voice file -> gain (dB) that brings the line to the film's median dialogue level (scripts/festival/measure-voices.mjs) */
  voiceGainDb?: Record<string, number>;
  /** the film's median dialogue loudness, LUFS */
  dialogueLufs?: number;
}

const DATA = festivalData as unknown as FestivalData;

export const FESTIVAL_DEPTH_START = 0.14;
export const FESTIVAL_DEPTH_END = 0.24;
export const FESTIVAL_CUTOUT_DEPTH_START = 0.2;
export const FESTIVAL_CUTOUT_DEPTH_END = 0.34;
/** The engine plays at most this many cut-outs in one shot. */
export const MAX_CUTOUTS = 4;
/**
 * The most a depth shot's near layers may grow or slide against its background over the shot, as a share of the
 * frame. Past this the picture visibly stretches at the edges of what is near, and cut-out people slide.
 */
export const MAX_PARALLAX = 0.03;

/** Scenes that go handheld: the raids, the Hive shootout, Kurose's men, Vera's run and the night of the call. */
export const HANDHELD_SCENES =
  /^(nw_cut_inn-raid_\d+|nw_song_raid_\d+|nw_s38|nw_s70|nw_s71|nw_s93|nw_s95|nw_song_bad-guy_(0[5-9]|[1-3]\d))$/;
export const HANDHELD = { sway: 0.55, bob: 0.4, roll: 0.3, speed: 1.3 } as const;

export interface FestivalReport {
  depthAdded: number;
  depthKept: number;
  depthSoftened: number;
  dryShots: number;
  cutoutShots: number;
  dollyRebased: number;
  movesAdded: number;
  handheldShots: number;
  lightsAdded: number;
  videoShots: number;
  picturesReplaced: number;
  soundsAdded: number;
  soundsRemoved: number;
  cutawaysAdded: number;
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

/**
 * How far a depth shot's near layers move against its background over the shot, as a share of the frame, by the
 * engine's own maths (FrameDepthParallax): near layers zoom by 1 + (zoom - 1)(1 + 2r) against the background's zoom
 * and slide by r times the pan, where r is the depth on the frame over the shot's authored depth.
 */
export function parallaxOf(animation: BeatAnimation | undefined, authored: unknown, frames: number): number {
  const anim = animation ?? {};
  const own = typeof authored === "number" && Number.isFinite(authored) ? authored : 0.4;
  const base = own > 1e-4 ? Math.min(1, Math.max(0.05, own)) : 0.4;
  const at = (f: number): [number, number, number] => {
    const zoom = Math.max(1, valueAt(anim.zoom, f, 1));
    const r = Math.min(1, Math.max(0, valueAt(anim.depthAmount, f, own))) / base;
    return [(r * (zoom - 1)) / zoom, (r * valueAt(anim.x, f, 0)) / 100, (r * valueAt(anim.y, f, 0)) / 100];
  };
  const last = Math.max(1, frames - 1);
  const times = new Set<number>([0, last]);
  for (let f = 0; f <= last; f += Math.max(1, Math.floor(last / 24))) times.add(f);
  for (const ch of ["zoom", "x", "y", "depthAmount"] as const) for (const k of anim[ch] ?? []) if (k.frame <= last) times.add(Math.max(0, k.frame));
  const [z0, x0, y0] = at(0);
  let most = 0;
  for (const f of times) {
    const [z, x, y] = at(f);
    most = Math.max(most, Math.abs(z - z0) + Math.abs(x - x0) + Math.abs(y - y0));
  }
  return most;
}

/** The share of its depth a shot can play at without its near layers moving more than MAX_PARALLAX (1 for most). */
export function depthShare(parallax: number): number {
  // a hair under the exact share, so rounding the depth keys can never tip a shot over the limit
  return parallax > MAX_PARALLAX ? (MAX_PARALLAX / parallax) * 0.99 : 1;
}

/** A depth amount at a shot's share (rounded down, to five places). */
export function scaledDepth(value: number, share: number): number {
  return share >= 1 ? value : Math.floor(value * share * 100000) / 100000;
}

/**
 * A director's rig keeps its camera, but its depth plays at the share that keeps its near layers within
 * MAX_PARALLAX. The engine's parallax is the depth on the frame over the authored depth, so the authored amount
 * stays and the depth on every frame comes down: its keys at their share, or one held key for a rig that had none.
 */
function soften(beat: BeatLike, cinematic: AnyRecord, frames: number): boolean {
  const share = depthShare(parallaxOf(beat.animation, cinematic.depthAmount, frames));
  if (share >= 1) return false;
  const anim: BeatAnimation = { ...(beat.animation ?? {}) };
  const values = anim.values as AnyRecord | undefined;
  const authored = typeof cinematic.depthAmount === "number" ? cinematic.depthAmount : 0.4;
  const held = typeof values?.depthAmount === "number" ? values.depthAmount : authored;
  const keys = anim.depthAmount;
  anim.depthAmount =
    Array.isArray(keys) && keys.length
      ? keys.map((k) => ({ ...k, value: scaledDepth(k.value, share) }))
      : [key(0, scaledDepth(held, share), "linear")];
  if (values && "depthAmount" in values) {
    const rest = { ...values };
    delete rest.depthAmount;
    anim.values = rest as BeatAnimation["values"];
  }
  beat.animation = anim;
  return true;
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
  // Slow on purpose: a fast pulse reads as flicker, and flicker makes people feel sick.
  if (/\bneon|\bsign\b|signboard/.test(t)) [pulseSeconds, pulseAmount, intensity] = [2.6, 0.3, 0.34];
  else if (/candle|fire|flame|incense|lighter|\bmatch\b/.test(t)) [pulseSeconds, pulseAmount, intensity] = [2.2, 0.3, 0.34];
  else if (/vending|fluorescent|\btube\b|television|\btv\b|screen/.test(t)) [pulseSeconds, pulseAmount] = [3.5, 0.12];
  return { x: spot.x, y: spot.y, color: spot.color, intensity, size: 16, pulseSeconds, pulseAmount };
}

/** The id of the n-th piece a split shot becomes (piece 0 keeps the shot's own id, so its sounds stay anchored). */
export { cutawayPieceId };

/**
 * Splits each listed shot at its cutaways: the shot plays, the cutaway takes over, the shot comes back. Captions
 * are split at the cuts; the route to the next scene moves to the last piece. Returns how many cutaways went in.
 */
function insertCutaways(story: StoryLike): number {
  const byBeat = new Map((DATA.inserts ?? []).map((i) => [i.beatId, i.cuts]));
  let added = 0;
  for (const scene of story.scenes) {
    const out: BeatLike[] = [];
    for (const beat of scene.dialogueBeats ?? []) {
      const cuts = byBeat.get(String(beat.id));
      const total = Math.round(Number(beat.durationFrames) || 0);
      if (!cuts?.length || total <= 0) {
        out.push(beat);
        continue;
      }
      // the first piece keeps the shot's move up to its cut (keys past its end are never reached); each other piece
      // gets a fresh camera from the festival's own pass
      const pieces = splitShot(beat, total, cuts, (n) => cutawayPieceId(String(beat.id), n));
      added += pieces.filter((p) => cuts.some((c) => c.picture === p.background)).length;
      out.push(...pieces);
    }
    scene.dialogueBeats = out;
  }
  return added;
}

/** Applies the festival finish to a copy of the Director's Export project. */
export function applyFestivalFinish(exportProject: ProjectState): { project: ProjectState; report: FestivalReport } {
  const story: StoryLike = clone(exportProject.story);
  const report: FestivalReport = {
    depthAdded: 0,
    depthKept: 0,
    depthSoftened: 0,
    dryShots: 0,
    cutoutShots: 0,
    dollyRebased: 0,
    movesAdded: 0,
    handheldShots: 0,
    lightsAdded: 0,
    videoShots: 0,
    picturesReplaced: 0,
    soundsAdded: 0,
    soundsRemoved: 0,
    cutawaysAdded: 0,
  };
  // Running order: a scene the festival leaves out is gone, and nothing leads to it.
  const dropped = new Set(DATA.dropScenes ?? []);
  if (dropped.size) {
    story.scenes = story.scenes.filter((scene) => !dropped.has(String(scene.id)));
    for (const scene of story.scenes) {
      if (dropped.has(String(scene.autoAdvanceTargetSceneId))) delete scene.autoAdvanceTargetSceneId;
      if (scene.choices) scene.choices = scene.choices.filter((c) => !dropped.has(String(c.targetSceneId)));
      for (const beat of scene.dialogueBeats ?? []) {
        if (dropped.has(String(beat.afterBeatTargetSceneId))) delete beat.afterBeatTargetSceneId;
      }
    }
  }
  report.cutawaysAdded = insertCutaways(story);

  // Every shot's real length (a montage shot has no durationFrames: it runs on its delay), in play order.
  const keyframes = buildKeyframes(story);
  const framesOf = new Map<string, number>();
  const order: string[] = [];
  for (const frame of keyframes) {
    const id = String(frame.beat.id);
    framesOf.set(id, clipFrames(frame));
    order.push(id);
  }

  const dry = new Set(DATA.dry ?? []);
  for (const scene of story.scenes) {
    const handheld = HANDHELD_SCENES.test(String(scene.id));
    for (const beat of scene.dialogueBeats ?? []) {
      // Credits: a card can say something else (the cast's maker; no tagline on the title).
      const card = DATA.titleCards?.[String(beat.id)];
      if (card) {
        beat.titleCard = { ...card };
        beat.text = card.kicker ? `${card.kicker}: ${card.title}` : card.title;
      }
      // Weather: a scene's rain falls outdoors only. An indoor shot is dry (it still hears the rain outside).
      if (dry.has(String(beat.id).replace(/~fc\d+$/, ""))) {
        beat.particles = "none";
        report.dryShots += 1;
      }
      const pic = typeof beat.background === "string" ? beat.background : "";
      if (!pic.startsWith("/film/img/") && !beat.gap && beat.cinematic?.depthMap) {
        // a director's rig on a library picture: nothing else is finished here, but its depth plays at its share
        const rig: AnyRecord = { ...beat.cinematic };
        const length = Math.max(1, framesOf.get(String(beat.id)) ?? Math.round(Number(beat.durationFrames) || 0));
        if (soften(beat, rig, length)) report.depthSoftened += 1;
        beat.cinematic = rig;
      }
      if (!pic.startsWith("/film/img/") || beat.gap) continue;
      const id = String(beat.id);
      const frames = Math.max(1, framesOf.get(id) ?? Math.round(Number(beat.durationFrames) || 0));
      const cinematic: AnyRecord = { ...(beat.cinematic ?? {}) };

      // Look: one grain and vignette across the feature; each scene keeps its grade. Never the "film grade" overlay:
      // it carries a brightness flicker (2.6 times a second) and scratches, which made a viewer feel sick.
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
        if (soften(beat, cinematic, frames)) report.depthSoftened += 1;
        report.depthKept += 1;
        beat.cinematic = cinematic;
        continue;
      }
      if (cinematic.depthMap) {
        // The director's own rig: its camera is never touched; its depth keeps its near layers within MAX_PARALLAX.
        if (soften(beat, cinematic, frames)) report.depthSoftened += 1;
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
        const [from, to] = cutout ? [FESTIVAL_CUTOUT_DEPTH_START, FESTIVAL_CUTOUT_DEPTH_END] : [FESTIVAL_DEPTH_START, FESTIVAL_DEPTH_END];
        if (cutout) {
          cinematic.depthPlate = cutout.depthPlate;
          cinematic.depthCutouts = cutout.depthCutouts.slice(0, MAX_CUTOUTS);
          report.cutoutShots += 1;
        }
        // The authored amount is the top of the range; the depth breathes up to it across the shot, at the share that
        // keeps the near layers within MAX_PARALLAX of the background (a big push takes less depth than a slow one).
        cinematic.depthAmount = to;
        breathe(beat, frames, from, to);
        const share = depthShare(parallaxOf(beat.animation, to, frames));
        if (share < 1) {
          breathe(beat, frames, scaledDepth(from, share), scaledDepth(to, share));
          report.depthSoftened += 1;
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
    const patched = patches[clip.id] ? { ...clip, ...patches[clip.id] } : clip;
    // Dialogue at one level: each line is brought toward the film's median loudness, on top of the director's own
    // gain for the clip (a line set quieter on purpose stays quieter).
    const db = clip.lane === "voice" ? DATA.voiceGainDb?.[clip.src] : undefined;
    audioClips.push(db ? { ...patched, gain: Math.round(patched.gain * 10 ** (db / 20) * 1000) / 1000 } : patched);
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

  // Music: a song the export plays low under the last scene comes up to full for the credits. Its clip plays on to the
  // hand-over and crossfades into the same song, in step (so the crossfade is a pure rise in level), which runs to the
  // film's last frame and fades out with it.
  const startMs = new Map<string, number>();
  let elapsed = 0;
  for (const id of order) {
    startMs.set(id, (elapsed / FPS) * 1000);
    elapsed += framesOf.get(id) ?? 0;
  }
  const filmEndMs = (elapsed / FPS) * 1000;
  for (const handoff of DATA.musicHandoffs ?? []) {
    const index = audioClips.findIndex((c) => c.id === handoff.clipId);
    const from = startMs.get(handoff.atAnchorId);
    if (index < 0 || from === undefined) continue;
    const clip = audioClips[index];
    const into = from - ((startMs.get(clip.anchorId) ?? 0) + clip.offsetMs);
    if (!(into > 0) || into >= clip.durationMs) continue;
    audioClips[index] = { ...clip, durationMs: Math.round(into + handoff.fadeMs), fadeOutMs: handoff.fadeMs };
    audioClips.push({
      ...clip,
      id: `${clip.id}~up`,
      anchorId: handoff.atAnchorId,
      offsetMs: 0,
      inMs: Math.round(clip.inMs + into),
      durationMs: Math.round(Math.min(filmEndMs - from, clip.durationMs - into)),
      gain: handoff.gain,
      fadeInMs: handoff.fadeMs,
      fadeOutMs: handoff.fadeOutMs,
      loop: false,
    });
    report.soundsAdded += 1;
  }

  return { project: { ...exportProject, story, audioClips, updatedAt: Date.now() }, report };
}

export const FESTIVAL_DATA = DATA;

/** Bump when the finishing code changes in a way the data does not show. */
export const FESTIVAL_CODE_VERSION = 4;
