// "The Witness Cut": Original Uncut directed as a grown-up procedural nocturne. The camera is a witness —
// it never anticipates, it reacts late and it stays on consequence. Built non-destructively from
// `project.originalStory`, using only pictures and sounds that already exist in the film.
//
//  - Timing: ordinary spoken tails are cut from 0.54 s to 0.33 s, but lines that carry weight (grief,
//    confession, a lie owned up to) HOLD for ~1.15 s before the cut: fast through procedure, slow through
//    consequence. The beat before violence is extended and locked off (dread); the silent beat after it is
//    held even longer (aftermath). The last words of a line are never clipped.
//  - Camera: eye-level and patient. Creeping push-ins on confession lines, a slow lateral drift on
//    observation beats, a locked tripod in front of violence, an impact settle on the violent beat itself,
//    a slow pull-back on the aftermath, and a few sub-2° cants in danger scenes. Only treated beats get
//    their camera replaced; every other beat keeps the film's own move.
//  - Light: motivated practicals from the existing overlays only — street rim light on wet nights,
//    venetian slats in offices, a key slash in danger, an eye light reserved for confession close-ups,
//    volumetric shafts where the room rings.
//  - Transitions: hard cuts everywhere, except a dissolve where time demonstrably passes and a dip to
//    black into the elegiac scenes. Nothing decorative.
//  - Sound: J-cuts lead the next line by 200 ms where there is clear air; the score sits slightly lower
//    with longer fades and is never dipped for effects (the engine's own voice ducking is the only ducking).
//  - One shot per picture: consecutive beats of a scene that show the same picture are merged into one
//    frame on the timeline. Every line, caption and sound stays at the exact same time; the camera runs on
//    as one continuous move instead of resetting at each line.

import {
  buildAudioClipsFromFilm,
  frameToMs,
  resolveAudioClips,
  roundMicros,
  type AudioClip,
} from "./audioClips";
import { effectiveCaptionsForBeat, isNarrationBeat, normalizeCaptions, type BeatCaption } from "./captions";
import {
  buildKeyframes,
  type AnyRecord,
  type BeatAnimation,
  type BeatLike,
  type Key,
  type ProjectState,
  type SceneLike,
  type StoryLike,
} from "./model";
import { clipFrames, FPS, sceneProseFrames } from "./timing";
import {
  ANIM_PROPS,
  buildTimelineClips,
  defaultValueForProp,
  evaluate,
  minZoomForRotation,
  type AnimProp,
  type TimelineClip,
} from "../sequence/animate";

export type WitnessSetting = "danger" | "night-ext" | "interior" | "daylight";

export interface WitnessSceneLook {
  setting: WitnessSetting;
  rainy: boolean;
  office: boolean;
  echoey: boolean;
  elegiac: boolean;
  timeJump: boolean;
}

const VIOLENCE_SFX =
  /suppressed-shot|smg-burst|bullets|ricochets|door-pounding-shots|shot2|windscreen-crack|glass-case-shatter|gate-smash|body-fall|punches/;

/** Lines that carry weight: the picture holds on them before the cut. */
const HEAVY =
  /\b(dead|died|kill(ed|ing)?|murder(ed)?|sorry|forgive|alone|afraid|scared|goodbye|ashes|funeral|never came (back|home)|my (son|daughter|wife|husband|brother|sister))\b/i;
/** Spoken admissions: the camera creeps in while they are said. */
const CONFESS =
  /\b(i lied|i knew|i saw|i did it|i was there|i paid|the truth is|i'?m sorry|confess|admit(ted)?|it was me)\b/i;
/** Silent observation beats: a witness's sideways gaze. */
const OBSERVE =
  /\b(watch(es|ing)?|stares?|looks? (at|out|across|up from|through)|through the (window|glass|blinds)|across the (street|road)|from the (car|doorway|window)|in the (mirror|glass))\b/i;
const TENSE =
  /\b(gun|knife|blood|run|don'?t move|behind you|they know|follow(ed|ing)?|watch(ing)? (us|you|the)|threat|danger)\b/i;

const TIME_JUMP = /\b(DAWN|MORNING|DAYS? LATER|NEXT (DAY|MORNING)|THREE DAYS|FIVE DAYS|LATER|EPILOGUE)\b/i;
const ELEGIAC = /\b(funeral|memorial|graveside|grave|cemetery|ashes|condolence|mourn(ing|ers)?)\b/i;

function hashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Scene setting and dressing read from what the scene already carries: title, heading, ambience, effects. */
export function classifyWitnessScene(scene: SceneLike): WitnessSceneLook {
  const text = `${scene.title ?? ""} ${scene.prose ?? ""}`;
  const ambient = String(scene.ambientAudio ?? "");
  const sfx = (scene.dialogueBeats ?? []).map((b) => String(b.sfxUrl ?? "")).join(" ");
  const rainy =
    /rain|drizzle|wet-street/.test(ambient) || scene.particles === "rain" || scene.particles === "drizzle";
  const office =
    /office|interview|detective|newsroom|hotel|lounge|apartment/i.test(text) ||
    /loop-neon-office|amb-office|hotel-lounge/.test(ambient);
  const echoey = /stairwell|viaduct|rooftop|amb-hive|harbour|train/.test(ambient);
  const elegiac = ELEGIAC.test(text);
  const timeJump = TIME_JUMP.test(text);

  let setting: WitnessSetting;
  if (VIOLENCE_SFX.test(sfx) || /raid/i.test(String(scene.id ?? ""))) setting = "danger";
  else if (
    (/\b(DAY|DAWN|MORNING|AFTERNOON)\b/.test(text) && !/NIGHT/.test(text)) ||
    /loop-breakfast-counter|loop-harbour|loop-rooftop-wind/.test(ambient) ||
    /breakfast|morning|dawn|epilogue|rain has stopped/i.test(text)
  )
    setting = "daylight";
  else if (
    /^\s*INT\./.test(String(scene.prose ?? "")) ||
    /amb-hive|amb-office|amb-bar|amb-room-tone|vending|noodle|yakitori|izakaya|tv-murmur|hotel-lounge/.test(ambient)
  )
    setting = "interior";
  else setting = "night-ext";
  return { setting, rainy, office, echoey, elegiac, timeJump };
}

const SETTING_LOOK: Record<WitnessSetting, AnyRecord> = {
  danger: { colorGrade: "tokyo-noir", vignette: true, vignetteStrength: 0.46, dimAmount: 0.08 },
  "night-ext": { colorGrade: "midnight-teal", vignette: true, vignetteStrength: 0.4, dimAmount: 0.06 },
  interior: { colorGrade: "tokyo-noir", vignette: true, vignetteStrength: 0.36, dimAmount: 0.04 },
  daylight: { colorGrade: "nolan-imax", vignette: true, vignetteStrength: 0.26, dimAmount: 0 },
};

export interface WitnessReport {
  scenesBySetting: Record<WitnessSetting, number>;
  reactionHolds: number;
  tightTails: number;
  dreadHolds: number;
  aftermathHolds: number;
  pushIns: number;
  drifts: number;
  dutchTilts: number;
  impactBeats: number;
  pullBacks: number;
  dissolves: number;
  dips: number;
  jCuts: number;
  /** Shots made by merging consecutive beats that show the same picture. */
  mergedShots: number;
  /** Beats folded into the shot before them (their lines, captions and sounds play inside that shot). */
  absorbedBeats: number;
}

export interface WitnessOptions {
  /** Merge consecutive beats of a scene that show the same picture into one frame (default true). */
  mergeSamePictures?: boolean;
}

function newReport(): WitnessReport {
  return {
    scenesBySetting: { danger: 0, "night-ext": 0, interior: 0, daylight: 0 },
    reactionHolds: 0,
    tightTails: 0,
    dreadHolds: 0,
    aftermathHolds: 0,
    pushIns: 0,
    drifts: 0,
    dutchTilts: 0,
    impactBeats: 0,
    pullBacks: 0,
    dissolves: 0,
    dips: 0,
    jCuts: 0,
    mergedShots: 0,
    absorbedBeats: 0,
  };
}

function key(frame: number, value: number, easing: "ease-in-out" | "linear" | "ease-out" = "ease-in-out") {
  return { frame, value, easing };
}

/** Pass 1: grade and motivated practical light. Beat cinematic is merged over the scene's, never replacing it. */
function applyLook(story: StoryLike, report: WitnessReport): Map<string, WitnessSceneLook> {
  const looks = new Map<string, WitnessSceneLook>();
  for (const scene of story.scenes) {
    const beats = scene.dialogueBeats ?? [];
    if (!beats.length || scene.id === "nw_intro" || scene.id === "nw_logo") continue;
    const look = classifyWitnessScene(scene);
    looks.set(scene.id, look);
    report.scenesBySetting[look.setting] += 1;
    beats.forEach((beat, idx) => {
      if (beat.gap || String(beat.background ?? "").startsWith("video:")) return;
      const base: AnyRecord = { ...(scene.cinematic ?? {}), ...(beat.cinematic ?? {}) };
      const next: AnyRecord = { ...base, ...SETTING_LOOK[look.setting], grain: true, grainOpacity: 0.035 };
      if (look.elegiac) {
        next.vignetteStrength = Math.max(Number(next.vignetteStrength) || 0, 0.48);
        next.dimAmount = Math.max(Number(next.dimAmount) || 0, 0.08);
      }
      const text = String(beat.text ?? "");
      const voiced = Boolean(beat.audioUrl) && !isNarrationBeat(beat);
      const h = hashInt(String(beat.id ?? `${scene.id}:${idx}`));
      if (voiced && (HEAVY.test(text) || CONFESS.test(text))) {
        // Confessions and grief are faces: an eye light and a shallow plane, nothing else.
        next.hitchcockLighting = "eye-light";
        next.dofOnTalk = true;
        next.vignetteStrength = Math.max(Number(next.vignetteStrength) || 0, 0.5);
      } else if (look.setting === "danger" && voiced) {
        next.hitchcockLighting = "key-slash";
      } else if (look.office && look.setting === "interior" && (voiced || h % 3 === 0)) {
        next.hitchcockLighting = "venetian-slats";
      } else if (look.setting === "night-ext" && look.rainy && h % 2 === 0) {
        next.hitchcockLighting = "silhouette-rim";
      }
      if (look.echoey && look.setting === "interior") {
        next.volumetricShafts = true;
        next.shaftsIntensity = Math.max(Number(next.shaftsIntensity) || 0, 0.45);
      }
      if (look.rainy && look.setting !== "interior") next.rainOnLens = next.rainOnLens ?? h % 5 === 0;
      beat.cinematic = next;
    });
  }
  return looks;
}

/** Pass 2: motivated transitions only — a dissolve where time passes, a dip to black into elegy. */
function applyTransitions(story: StoryLike, looks: Map<string, WitnessSceneLook>, report: WitnessReport): void {
  for (const scene of story.scenes) {
    const look = looks.get(scene.id);
    if (!look || (!look.elegiac && !look.timeJump)) continue;
    const first = (scene.dialogueBeats ?? []).find((b) => !b.gap);
    if (!first || first.backgroundTransition) continue;
    if (look.elegiac) {
      first.backgroundTransition = "dip-to-black";
      first.backgroundTransitionSpeed = 0.8;
      report.dips += 1;
    } else {
      first.backgroundTransition = "dissolve";
      first.backgroundTransitionSpeed = 0.85;
      report.dissolves += 1;
    }
    first.transitionAlignment = "at-cut";
  }
}

/** Ordinary silence kept after a spoken line (the raw Uncut leaves 0.54 s). */
const TAIL_MID_FRAMES = Math.round(0.33 * FPS);
/** The hold on a line that carries weight: the witness stays on the face. */
const REACTION_HOLD_FRAMES = Math.round(1.15 * FPS);
/** Extra lock-off time on the silent beat before violence. */
const DREAD_EXTRA_FRAMES = Math.round(0.66 * FPS);
/** Extra time on the silent beat after violence. */
const AFTERMATH_EXTRA_FRAMES = Math.round(1.0 * FPS);

/**
 * Pass 3: picture timing. Fast through procedure, slow through consequence: ordinary spoken tails are
 * tightened, heavy lines get a reaction hold, and violence is framed by a dread hold and an aftermath hold.
 */
function applyPacing(story: StoryLike, voiceDurations: ReadonlyMap<string, number>, report: WitnessReport): void {
  const frames = buildKeyframes(story);
  const treatedSilent = new Set<string>();

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const beat = frame.beat;
    if (beat.gap || frame.sceneId === "nw_intro" || frame.sceneId === "nw_logo") continue;

    // Violence framing: the beat before the shot is held and locked, the silent beat after is held longer.
    if (beat.sfxUrl && VIOLENCE_SFX.test(String(beat.sfxUrl))) {
      const prev = frames[i - 1];
      if (
        prev &&
        prev.sceneId === frame.sceneId &&
        !prev.beat.audioUrl &&
        !prev.beat.gap &&
        !prev.beat.durationFrames &&
        !treatedSilent.has(prev.id)
      ) {
        prev.beat.durationFrames = clipFrames(prev) + DREAD_EXTRA_FRAMES;
        treatedSilent.add(prev.id);
        report.dreadHolds += 1;
      }
      const next = frames[i + 1];
      if (
        next &&
        next.sceneId === frame.sceneId &&
        !next.beat.audioUrl &&
        !next.beat.gap &&
        !next.beat.durationFrames &&
        !treatedSilent.has(next.id)
      ) {
        next.beat.durationFrames = clipFrames(next) + AFTERMATH_EXTRA_FRAMES;
        treatedSilent.add(next.id);
        report.aftermathHolds += 1;
      }
      continue;
    }

    if (!beat.audioUrl || beat.durationFrames) continue;
    const voiceSec = voiceDurations.get(String(beat.audioUrl));
    if (voiceSec === undefined) continue; // unmeasured voice: leave the film's own timing
    const next = frames[i + 1];
    const lastInScene = !next || next.sceneId !== frame.sceneId;
    const full = clipFrames(frame, voiceSec);
    const offsetSec = Math.max(0, Number(beat.audioOffsetSeconds || 0));
    const voiceFrames = Math.max(1, Math.round(Math.max(0, voiceSec - offsetSec) * FPS));
    const explicitStart = Number(beat.voiceStartFrame);
    const lead = Math.max(0, Number.isFinite(explicitStart) ? Math.round(explicitStart) : sceneProseFrames(frame));
    const voiceEnd = Math.min(full, lead + voiceFrames);

    const text = String(beat.text ?? "");
    const heavy = HEAVY.test(text) || CONFESS.test(text);
    let tail: number;
    if (lastInScene) {
      // A scene's last line keeps room for its transition; a heavy last line stays half a second longer.
      const transition = Math.min(2.4, Math.max(0, Number(frame.scene.transitionSpeed) || 0));
      tail = Math.round(Math.max(0.9, transition + 0.25) * FPS) + (heavy ? Math.round(0.5 * FPS) : 0);
    } else {
      tail = heavy ? REACTION_HOLD_FRAMES : TAIL_MID_FRAMES;
    }
    const target = Math.max(voiceEnd + tail, Math.round(FPS / 2));
    if (Math.abs(target - full) <= 1) continue;
    beat.durationFrames = target;
    if (heavy && !lastInScene) report.reactionHolds += 1;
    else if (target < full) report.tightTails += 1;
  }
}

/** Replaces the transform channels (zoom, x, y, rotation) of a beat's animation, keeping every other channel. */
function withCamera(existing: BeatAnimation | undefined, camera: BeatAnimation): BeatAnimation {
  const rest: AnyRecord = { ...(existing ?? {}) };
  for (const channel of ["zoom", "x", "y", "rotation"]) delete rest[channel];
  if (rest.values) {
    rest.values = { ...rest.values };
    for (const channel of ["zoom", "x", "y", "rotation"]) delete rest.values[channel];
  }
  return { ...rest, ...camera } as BeatAnimation;
}

/** Pass 4: the witness's camera on the beats that earn one; every other beat keeps its existing move. */
function applyCamera(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  looks: Map<string, WitnessSceneLook>,
  report: WitnessReport,
): Set<string> {
  const jolts = new Set<string>();
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurations);
  const durationByBeat = new Map<string, number>();
  clips.forEach((clip) => durationByBeat.set(String(clip.keyframe.beat.id), clip.durationFrames));
  const violent = new Set<number>();
  frames.forEach((f, i) => {
    if (f.beat.sfxUrl && VIOLENCE_SFX.test(String(f.beat.sfxUrl))) violent.add(i);
  });
  let cantFlip = 1;

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const beat = frame.beat;
    const pic = String(frame.picture ?? "");
    if (!beat.id || beat.gap || !pic.startsWith("/")) continue;
    const durF = durationByBeat.get(String(beat.id)) ?? 0;
    if (durF < 30) continue;
    const lastF = durF - 1;
    const look = looks.get(frame.sceneId);
    const text = String(beat.text ?? "");
    const voiced = Boolean(beat.audioUrl) && !isNarrationBeat(beat);
    const h = hashInt(String(beat.id));
    const anim: BeatAnimation = {};
    const sameScene = (j: number) => frames[j] && frames[j].sceneId === frame.sceneId;

    if (violent.has(i)) {
      // Impact settle: the frame jolts in and settles — the witness flinched, then steadied.
      anim.zoom = [key(0, 1.05), key(Math.min(6, lastF), 1.005, "ease-out"), key(lastF, 1.005, "linear")];
      jolts.add(String(beat.id));
      report.impactBeats += 1;
    } else if (violent.has(i + 1) && sameScene(i + 1) && !voiced) {
      // Dread: a locked tripod in front of what is about to happen.
      anim.zoom = [key(0, 1), key(lastF, 1, "linear")];
    } else if (violent.has(i - 1) && sameScene(i - 1) && !voiced) {
      // Aftermath: a slow retreat — the witness steps back from it.
      anim.zoom = [key(0, 1.06), key(lastF, 1.0)];
      report.pullBacks += 1;
    } else if (voiced && (CONFESS.test(text) || HEAVY.test(text))) {
      // Confession creep: 1.0 -> 1.06, eye level, no haste.
      anim.zoom = [key(0, 1), key(lastF, 1.06)];
      report.pushIns += 1;
    } else if (!voiced && OBSERVE.test(text)) {
      // The witness's gaze: a slow lateral drift at a slight standoff.
      anim.zoom = [key(0, 1.05), key(lastF, 1.05, "linear")];
      anim.x = [key(0, -1.4), key(lastF, 1.4)];
      report.drifts += 1;
    } else if (look?.setting !== "daylight" && voiced && TENSE.test(text)) {
      // A restrained cant, under 2°, zoomed past the frame edge.
      const deg = (1.2 + (h % 9) / 10) * cantFlip;
      cantFlip = -cantFlip;
      const cover = Math.max(minZoomForRotation(deg) + 0.02, 1.04);
      anim.rotation = [key(0, 0), key(lastF, deg)];
      anim.zoom = [key(0, 1), key(lastF, Number(cover.toFixed(4)))];
      report.dutchTilts += 1;
    } else {
      continue;
    }
    beat.animation = withCamera(beat.animation, anim);
  }
  return jolts;
}

/** Pass 5: sound. J-cuts where there is clear air; the score sits lower with longer fades and is never dipped. */
function polishAudio(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations: ReadonlyMap<string, number> | undefined,
  report: WitnessReport,
): AudioClip[] {
  const frames = buildKeyframes(story);
  const base = buildAudioClipsFromFilm(story, voiceDurations, musicDurations);
  const { clips: timeline } = buildTimelineClips(frames, voiceDurations);
  const resolved = resolveAudioClips(base, timeline);

  const voiceSorted = resolved.filter((c) => c.lane === "voice").sort((a, b) => a.startMs - b.startMs);
  const prevEnd = new Map<string, number>();
  voiceSorted.forEach((c, i) => prevEnd.set(c.id, i ? voiceSorted[i - 1].endMs : 0));

  const out: AudioClip[] = [];
  for (const rc of resolved) {
    const plainClip: AudioClip = {
      id: rc.id,
      lane: rc.lane,
      src: rc.src,
      anchorId: rc.anchorId,
      offsetMs: rc.offsetMs,
      inMs: rc.inMs,
      durationMs: rc.durationMs,
      gain: rc.gain,
      fadeInMs: rc.fadeInMs,
      fadeOutMs: rc.fadeOutMs,
      loop: rc.loop,
      ...(rc.volumeKeys ? { volumeKeys: rc.volumeKeys } : {}),
    };
    if (rc.lane === "music") {
      out.push({
        ...plainClip,
        gain: rc.gain * 0.9, // never dipped for effects; it just sits a touch lower
        fadeInMs: Math.max(Number(rc.fadeInMs) || 0, 1200),
        fadeOutMs: Math.max(Number(rc.fadeOutMs) || 0, 1800),
      });
      continue;
    }
    if (rc.lane === "voice") {
      const clear = rc.startMs - (prevEnd.get(rc.id) ?? 0);
      const atStart = Math.abs(rc.offsetMs) < 35;
      if (atStart && rc.startMs > 3000 && clear >= 600 && hashInt(rc.id) % 2 === 0) {
        out.push({ ...plainClip, offsetMs: roundMicros(rc.offsetMs - 200), fadeInMs: 12, fadeOutMs: 24 });
        report.jCuts += 1;
        continue;
      }
    }
    out.push(plainClip);
  }
  return out;
}

/** Fields that route the film on from a scene's last beat: they move onto the shot that now ends the scene. */
const ROUTE_KEYS = ["afterBeatMode", "afterBeatTargetSceneId", "afterBeatSceneId", "afterBeatDelaySeconds", "nextSceneId"];
const TRANSFORM_PROPS: ReadonlySet<AnimProp> = new Set<AnimProp>(["zoom", "x", "y", "rotation"]);

/** Can this beat be folded into (or start) a merged shot? Gaps, title cards and moving pictures stay on their own. */
function mergeable(clip: TimelineClip): boolean {
  const kf = clip.keyframe;
  const pic = String(kf.picture ?? "");
  return Boolean(pic) && !kf.beat.gap && !kf.beat.titleCard && !pic.startsWith("video:") && clip.durationFrames > 0;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * One continuous camera move over a merged shot. Each beat keeps its own move at its own place in the shot
 * (the pose it actually showed at its first and last frame, plus its keys in between); where a beat's move
 * started somewhere other than where the previous one ended (the camera "reset" at the old cut), the move is
 * eased in from the previous end pose so the shot never jumps. The difference fades to zero over that beat,
 * so every beat still ends exactly where it used to and nothing accumulates. The impact settle on a violent
 * beat is the one deliberate jolt and is kept as authored.
 */
function mergeShotAnimation(
  segments: ReadonlyArray<{ clip: TimelineClip; offset: number; jolt: boolean }>,
): BeatAnimation | undefined {
  const out: BeatAnimation = {};
  for (const prop of ANIM_PROPS) {
    const poses = segments.map(({ clip }) => {
      const last = Math.max(0, clip.durationFrames - 1);
      return { start: evaluate(clip, 0)[prop], end: evaluate(clip, last)[prop] };
    });
    const anyKeys = segments.some(({ clip }) => Boolean(clip.keyframe.beat.animation?.[prop]?.length));
    const fallback = defaultValueForProp(prop);
    const moves =
      prop !== "depthAmount" &&
      poses.some((p) => Math.abs(p.start - fallback) > 1e-6 || Math.abs(p.end - fallback) > 1e-6);
    if (!anyKeys && !moves) continue;

    const keys: Key[] = [];
    let prevEnd: number | undefined;
    segments.forEach(({ clip, offset, jolt }, k) => {
      const dur = Math.max(1, clip.durationFrames);
      const last = dur - 1;
      const own = [...(clip.keyframe.beat.animation?.[prop] ?? [])].sort((a, b) => a.frame - b.frame);
      const { start, end } = poses[k];
      // Ease in from wherever the previous beat left the camera (transform channels only, never on the jolt).
      const delta =
        prevEnd !== undefined && TRANSFORM_PROPS.has(prop) && !jolt && last > 0 && Math.abs(prevEnd - start) > 1e-6
          ? prevEnd - start
          : 0;
      const shifted = (local: number, value: number) => round6(value + delta * (1 - local / Math.max(1, last)));
      const firstOwn = own[0];
      const startEasing =
        firstOwn && firstOwn.frame <= 0
          ? { easing: firstOwn.easing, ...(firstOwn.bezier ? { bezier: firstOwn.bezier } : {}) }
          : firstOwn && clip.carriedStartPose
            ? { easing: firstOwn.easing === "hold" ? ("hold" as const) : ("ease-in-out" as const) }
            : { easing: "linear" as const };
      keys.push({ frame: offset, value: shifted(0, start), ...startEasing });
      for (const key of own) {
        if (key.frame <= 0 || key.frame >= last) continue;
        keys.push({ ...key, frame: offset + key.frame, value: shifted(key.frame, key.value) });
      }
      if (last > 0) keys.push({ frame: offset + last, value: round6(end), easing: "linear" });
      prevEnd = end;
    });

    // Drop the middle of flat runs so the lane shows the moves, not a key on every old cut.
    const tidy = keys.filter((key, i) => {
      if (i === 0 || i === keys.length - 1) return true;
      const a = keys[i - 1];
      const b = keys[i + 1];
      return !(a.value === key.value && key.value === b.value && a.easing !== "hold");
    });
    if (!anyKeys && tidy.every((key) => key.value === fallback)) continue;
    out[prop] = tidy;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Pass 6: one shot per picture. Consecutive beats of a scene that show the same picture become one frame on
 * the timeline: the first beat of the run carries the whole run. Its length is the sum of theirs, the later
 * lines' captions are placed at the frames they were spoken, every sound clip anchored to a folded beat is
 * re-anchored to the shot at the same millisecond, and the camera runs on as one move. Nothing moves in time:
 * the picture, the words and the sound at every frame of the film are what they were before the merge.
 */
function mergeSamePictureShots(
  story: StoryLike,
  audioClips: AudioClip[],
  voiceDurations: ReadonlyMap<string, number>,
  jolts: ReadonlySet<string>,
  report: WitnessReport,
): AudioClip[] {
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurations);

  // Runs of the same picture inside one scene.
  const groups: TimelineClip[][] = [];
  for (const clip of clips) {
    const run = groups[groups.length - 1];
    const prev = run?.[run.length - 1];
    if (
      prev &&
      mergeable(prev) &&
      mergeable(clip) &&
      prev.keyframe.sceneId === clip.keyframe.sceneId &&
      prev.keyframe.picture === clip.keyframe.picture
    ) {
      run.push(clip);
    } else {
      groups.push([clip]);
    }
  }

  // Where each old anchor now lives: the beat that carries it and how many frames into that beat it starts.
  const homeByOldId = new Map<string, { beat: BeatLike; offsetFrames: number }>();
  const absorbed = new Set<BeatLike>();

  for (const group of groups) {
    const primaryClip = group[0];
    const primary = primaryClip.keyframe.beat;
    if (group.length === 1) {
      homeByOldId.set(primaryClip.keyframe.id, { beat: primary, offsetFrames: 0 });
      continue;
    }
    // Captions are read while each beat still has its own clip window (set by buildTimelineClips above).
    const captions: BeatCaption[] = [];
    const segments: Array<{ clip: TimelineClip; offset: number; jolt: boolean }> = [];
    let offset = 0;
    for (const clip of group) {
      const kf = clip.keyframe;
      homeByOldId.set(kf.id, { beat: primary, offsetFrames: offset });
      for (const cap of effectiveCaptionsForBeat(kf.beat, clip.durationFrames)) {
        captions.push({
          ...cap,
          inFrame: offset + cap.inFrame,
          outFrame: offset + cap.outFrame,
          speaker: cap.speaker ?? kf.speaker,
          isNarration: cap.isNarration ?? isNarrationBeat(kf.beat),
        });
      }
      segments.push({ clip, offset, jolt: jolts.has(String(kf.beat.id ?? "")) });
      offset += clip.durationFrames;
    }

    const others = group.slice(1).map((c) => c.keyframe.beat);
    const tail = others[others.length - 1];
    const animation = mergeShotAnimation(segments);

    // Light: the shot keeps its first beat's set-up; a confession anywhere in it earns the eye light for the
    // whole shot, and depth / lights carried by a later beat are not lost.
    const cinematic: AnyRecord = { ...(primary.cinematic ?? {}) };
    const confession = others.find((b) => b.cinematic?.hitchcockLighting === "eye-light");
    if (confession && cinematic.hitchcockLighting !== "eye-light") {
      cinematic.hitchcockLighting = "eye-light";
      cinematic.dofOnTalk = true;
      cinematic.vignetteStrength = Math.max(
        Number(cinematic.vignetteStrength) || 0,
        Number(confession.cinematic?.vignetteStrength) || 0,
      );
    }
    for (const b of others) {
      const c = b.cinematic;
      if (!c) continue;
      if (c.depthMap && !cinematic.depthMap) {
        cinematic.depthMap = c.depthMap;
        if (c.depthPlate !== undefined) cinematic.depthPlate = c.depthPlate;
        if (c.depthCutouts !== undefined) cinematic.depthCutouts = c.depthCutouts;
      }
      if (c.lights && !cinematic.lights) cinematic.lights = c.lights;
    }

    primary.durationFrames = offset;
    primary.captions = normalizeCaptions(captions, offset);
    primary.cinematic = cinematic;
    if (animation) primary.animation = animation;
    else delete primary.animation;
    primary.mergedBeatIds = others.map((b, i) => String(b.id ?? group[i + 1].keyframe.id));
    for (const routeKey of ROUTE_KEYS) {
      if (tail[routeKey] !== undefined) primary[routeKey] = tail[routeKey];
      else delete primary[routeKey];
    }
    if (tail.background && tail.backgroundHold === false) {
      primary.background = String(primaryClip.keyframe.picture);
      primary.backgroundHold = false;
    }
    others.forEach((b) => absorbed.add(b));
    report.mergedShots += 1;
    report.absorbedBeats += others.length;
  }

  if (!absorbed.size) return audioClips;
  for (const scene of story.scenes) {
    if (scene.dialogueBeats?.some((b) => absorbed.has(b))) {
      scene.dialogueBeats = scene.dialogueBeats.filter((b) => !absorbed.has(b));
    }
  }

  // Re-anchor every sound to the shot that now carries its beat, at the same millisecond.
  const newIdByBeat = new Map<BeatLike, string>();
  for (const kf of buildKeyframes(story)) newIdByBeat.set(kf.beat, kf.id);
  return audioClips.map((clip) => {
    const home = homeByOldId.get(clip.anchorId);
    const newId = home ? newIdByBeat.get(home.beat) : undefined;
    if (!home || !newId) return clip;
    if (newId === clip.anchorId && home.offsetFrames === 0) return clip;
    return { ...clip, anchorId: newId, offsetMs: roundMicros(clip.offsetMs + frameToMs(home.offsetFrames)) };
  });
}

/** Builds the cut from an Original Uncut project (the true source). Pure: the input project is not changed. */
export function applyWitnessTreatment(
  uncut: ProjectState,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
  options: WitnessOptions = {},
): { project: ProjectState; report: WitnessReport } {
  const report = newReport();
  const story: StoryLike = JSON.parse(JSON.stringify(uncut.story));
  story.captionStyle = { position: "bottom", size: "S", backgroundBox: false, showSpeaker: true, italicNarration: true };
  const looks = applyLook(story, report);
  applyTransitions(story, looks, report);
  applyPacing(story, voiceDurations, report);
  const jolts = applyCamera(story, voiceDurations, looks, report);
  let audioClips = polishAudio(story, voiceDurations, musicDurations, report);
  if (options.mergeSamePictures !== false) {
    audioClips = mergeSamePictureShots(story, audioClips, voiceDurations, jolts, report);
  }
  return {
    project: { ...uncut, story, audioClips, updatedAt: Date.now() },
    report,
  };
}
