// "Jack's Noir" cut: Original Uncut treated with the classic noir toolkit, using only pictures and sounds that
// already exist in the film (no new images, no new recordings).
//
//  - Colour & contrast: a mood per scene (blue = loneliness, amber = artificial light, red = danger,
//    green = unease/corruption, muted = bleak daylight) through the existing grades and light points.
//  - Camera: keyframed Dutch tilts on unstable beats, slow push-ins on emotional close lines, drifts on
//    reflection beats, a slow tilt for power / vulnerability. Only the beats given one of these moves get their
//    camera replaced (the film's auto-converted preset move); every other beat keeps the move it already has.
//  - Lighting: blinds, backlight rim, key slash, eye light and neon points from the existing overlays.
//  - Sound: only existing files. Music drops out after gunfire (silence), distant sirens on a few wet nights,
//    slap-back echo taps made from the same clips for footsteps and Jack's voice-over, J-cuts and L-cuts.
//  - Pacing: the silence after each spoken line is cut from 0.54 s to 0.25 s (1.75 s to about 1.15 s after a scene's last line).
//  - Voice-over: Jack's own recorded reflective lines are promoted to voice-over: they lead the picture (J-cut),
//    run on over the next picture (L-cut), carry a faint echo and the music ducks under them.
// A real narration track needs new recordings; this cut does not fake one.

import {
  buildAudioClipsFromFilm,
  resolveAudioClips,
  roundMicros,
  type AudioClip,
  type AudioVolumeKey,
} from "./audioClips";
import { isNarrationBeat } from "./captions";
import {
  buildKeyframes,
  type AnyRecord,
  type BeatAnimation,
  type BeatLike,
  type ProjectState,
  type SceneLike,
  type StoryLike,
} from "./model";
import { clipFrames, FPS, sceneProseFrames } from "./timing";
import { buildTimelineClips, minZoomForRotation } from "../sequence/animate";

export type NoirMood = "blue" | "amber" | "red" | "green" | "muted";

export interface SceneLook {
  mood: NoirMood;
  neon: boolean;
  blinds: boolean;
  rainy: boolean;
  echoey: boolean;
}

const VIOLENCE_SFX =
  /suppressed-shot|smg-burst|bullets|ricochets|door-pounding-shots|shot2|windscreen-crack|glass-case-shatter|gate-smash|body-fall|punches/;
const SHOT_SFX = /suppressed-shot|smg-burst|bullets|ricochets|shot2|windscreen-crack|glass-case-shatter|body-fall/;

function hashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Scene mood and set dressing from what the scene already carries: title, heading, ambience and sound effects. */
export function classifyScene(scene: SceneLike): SceneLook {
  const text = `${scene.title ?? ""} ${scene.prose ?? ""}`;
  const ambient = String(scene.ambientAudio ?? "");
  const sfx = (scene.dialogueBeats ?? []).map((b) => String(b.sfxUrl ?? "")).join(" ");
  const rainy = /rain|drizzle|wet-street/.test(ambient) || scene.particles === "rain" || scene.particles === "drizzle";
  const neon = /neon|izakaya|pachinko|yakitori|lounge/i.test(`${text} ${ambient}`);
  const blinds = /office|interview|detective|newsroom|hotel|lounge|apartment/i.test(text) || /loop-neon-office|amb-office|hotel-lounge/.test(ambient);
  const echoey = /stairwell|viaduct|rooftop|amb-hive|harbour|train/.test(ambient);

  let mood: NoirMood;
  if (VIOLENCE_SFX.test(sfx) || /raid/i.test(String(scene.id ?? ""))) mood = "red";
  else if (/police-station|police-radio|newsroom|highrise-office/.test(ambient) || /police|interview|detective|newsroom|kurose|harada/i.test(text)) mood = "green";
  else if (
    (/\b(DAY|DAWN|MORNING|AFTERNOON)\b/.test(text) && !/NIGHT/.test(text)) ||
    /loop-breakfast-counter|loop-harbour|loop-rooftop-wind/.test(ambient) ||
    /breakfast|morning|dawn|closed|forgotten|epilogue|rain has stopped/i.test(text)
  )
    mood = "muted";
  else if (/amb-hive|amb-office|amb-bar|vending|noodle|yakitori|izakaya|tv-murmur|hotel-lounge|amb-room-tone/.test(ambient) || /^\s*INT\./.test(String(scene.prose ?? "")))
    mood = /amb-hive/.test(ambient) && rainy ? "blue" : "amber"; // rain on the Hive's windows stays cold
  else mood = "blue";
  return { mood, neon, blinds, rainy, echoey };
}

const MOOD_LOOK: Record<NoirMood, AnyRecord> = {
  blue: { colorGrade: "midnight-teal", vignette: true, vignetteStrength: 0.42, dimAmount: 0.08 },
  amber: { colorGrade: "sodium-amber", vignette: true, vignetteStrength: 0.4, dimAmount: 0.05 },
  red: { colorGrade: "neon-noir", vignette: true, vignetteStrength: 0.46, dimAmount: 0.08 },
  green: { colorGrade: "midnight-teal", vignette: true, vignetteStrength: 0.44, dimAmount: 0.06 },
  muted: { colorGrade: "nolan-imax", vignette: true, vignetteStrength: 0.3, dimAmount: 0 },
};

const MOOD_LIGHTS: Record<NoirMood, AnyRecord[]> = {
  blue: [],
  amber: [],
  red: [{ x: 82, y: 30, color: "#c1121f", intensity: 0.34, size: 46, pulseSeconds: 3.6, pulseAmount: 0.5 }],
  green: [{ x: 50, y: 8, color: "#4caf7a", intensity: 0.3, size: 70, pulseSeconds: 5, pulseAmount: 0.15 }],
  muted: [],
};

const NEON_LIGHTS: AnyRecord[] = [
  { x: 18, y: 34, color: "#ff2d95", intensity: 0.36, size: 34, pulseSeconds: 3.2, pulseAmount: 0.4 },
  { x: 84, y: 40, color: "#18c7ff", intensity: 0.32, size: 38, pulseSeconds: 4.1, pulseAmount: 0.4 },
];

const EMOTIVE = /afraid|scared|sorry|blame|guilt|\blie[ds]?\b|truth|promise|dead|died|killed|murder|forgive|alone|miss(ed|ing)?\b/i;
const TENSION = /\b(gun|shot|shoot|shooting|blood|kill|run|hurry|behind you|they know|follow(ed|ing)?|watch(ing)?|threat|danger)\b/i;
const REFLECTIVE = /reflect|mirror|puddle|glass|window/i;
const REFLECTIVE_JACK = /\b(I should have|I promised|twenty years|I was a|I gave|I'm sorry|my statement|the last of it|I couldn't|I didn't|I never|I left|I lied|I wasn't)\b/i;

export function isJackVoiceOver(beat: BeatLike): boolean {
  if (beat.characterId !== "nw_jack" || !beat.audioUrl) return false;
  const text = String(beat.text ?? "");
  return text.length >= 90 || REFLECTIVE_JACK.test(text);
}

function key(frame: number, value: number, easing: "ease-in-out" | "linear" = "ease-in-out") {
  return { frame, value, easing };
}

function mergeLights(existing: unknown, add: AnyRecord[]): AnyRecord[] | undefined {
  const base = Array.isArray(existing) ? (existing as AnyRecord[]) : [];
  const out = [...base, ...add].slice(0, 3);
  return out.length ? out : undefined;
}

export interface JackNoirReport {
  scenesByMood: Record<NoirMood, number>;
  voiceOverBeats: number;
  dutchBeats: number;
  pushBeats: number;
  reflectionBeats: number;
  lCuts: number;
  tightTails: number;
  jCuts: number;
  silenceWindows: number;
  echoTaps: number;
  sirens: number;
}

function newReport(): JackNoirReport {
  return {
    scenesByMood: { blue: 0, amber: 0, red: 0, green: 0, muted: 0 },
    voiceOverBeats: 0,
    dutchBeats: 0,
    pushBeats: 0,
    reflectionBeats: 0,
    lCuts: 0,
    tightTails: 0,
    jCuts: 0,
    silenceWindows: 0,
    echoTaps: 0,
    sirens: 0,
  };
}

/** Pass 1: colour, contrast and lighting. Beat cinematic is always merged over the scene's, never replacing it. */
function applyLook(story: StoryLike, report: JackNoirReport): Map<string, SceneLook> {
  const looks = new Map<string, SceneLook>();
  for (const scene of story.scenes) {
    const beats = scene.dialogueBeats ?? [];
    if (!beats.length || scene.id === "nw_intro" || scene.id === "nw_logo") continue;
    const look = classifyScene(scene);
    looks.set(scene.id, look);
    report.scenesByMood[look.mood] += 1;
    beats.forEach((beat, idx) => {
      if (beat.gap || String(beat.background ?? "").startsWith("video:")) return;
      const base: AnyRecord = { ...(scene.cinematic ?? {}), ...(beat.cinematic ?? {}) };
      const next: AnyRecord = { ...base, ...MOOD_LOOK[look.mood], grain: true, grainOpacity: 0.04 };
      const lights = [...MOOD_LIGHTS[look.mood], ...(look.neon ? NEON_LIGHTS : [])];
      if (lights.length) next.lights = mergeLights(base.lights, lights);
      const text = String(beat.text ?? "");
      const voiced = Boolean(beat.audioUrl) && !isNarrationBeat(beat);
      const h = hashInt(String(beat.id ?? `${scene.id}:${idx}`));
      if (voiced && EMOTIVE.test(text)) {
        next.hitchcockLighting = "eye-light"; // close lines: isolate the face
        next.vignetteStrength = Math.max(Number(next.vignetteStrength) || 0, 0.55);
      } else if (voiced || h % 3 === 0) {
        if (look.mood === "red") next.hitchcockLighting = "key-slash";
        else if (look.blinds) next.hitchcockLighting = "venetian-slats";
        else if (look.rainy && look.mood === "blue") next.hitchcockLighting = "silhouette-rim";
      }
      if (look.rainy && look.mood !== "amber") next.rainOnLens = next.rainOnLens ?? h % 4 === 0;
      beat.cinematic = next;
    });
  }
  return looks;
}

/** Silence kept after a spoken line: noir cuts on the reply. The raw Uncut leaves 0.54 s (and 1.75 s after a scene's last line). */
const TAIL_MID_FRAMES = Math.round(0.25 * FPS);

/**
 * Pass 2: picture timing. Every spoken beat is cut shortly after its voice ends (tight tail), and voice-over lines
 * and a few spoken lines cut away before the voice ends (L-cut), only into a silent beat of the same scene.
 */
function applyPacing(story: StoryLike, voiceDurations: ReadonlyMap<string, number>, report: JackNoirReport): void {
  const frames = buildKeyframes(story);
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const beat = frame.beat;
    if (!beat.audioUrl || beat.durationFrames || beat.gap) continue;
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

    // 1. Tight tail. A scene's last line keeps room for its transition.
    const transition = Math.min(2.4, Math.max(0, Number(frame.scene.transitionSpeed) || 0));
    const lastTail = Math.round(Math.max(0.9, transition + 0.25) * FPS);
    let target = voiceEnd + (lastInScene ? lastTail : TAIL_MID_FRAMES);
    let cut = false;

    // 2. L-cut: the voice runs on over the next (silent) picture of the same scene.
    if (next && !lastInScene && !next.beat.audioUrl && !next.beat.gap) {
      const vo = isJackVoiceOver(beat);
      if (vo || hashInt(String(beat.id)) % 4 === 0) {
        const cutFrames = Math.round((vo ? 0.8 : 0.35) * FPS);
        const lcut = Math.max(voiceEnd - cutFrames, lead + Math.round(0.5 * FPS), FPS);
        if (lcut < voiceEnd) {
          target = lcut;
          cut = true;
        }
      }
    }
    target = Math.max(target, Math.round(FPS / 2));
    if (target >= full - 1) continue;
    beat.durationFrames = target;
    report.tightTails += cut ? 0 : 1;
    report.lCuts += cut ? 1 : 0;
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

/** Pass 3: camera keyframes on the beats that carry a noir move; all other beats keep their existing move. */
function applyCamera(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  looks: Map<string, SceneLook>,
  report: JackNoirReport,
): void {
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurations);
  const durationByBeat = new Map<string, number>();
  clips.forEach((clip) => durationByBeat.set(String(clip.keyframe.beat.id), clip.durationFrames));
  let dutchFlip = 1;
  for (const frame of frames) {
    const beat = frame.beat;
    const pic = String(frame.picture ?? "");
    if (!beat.id || beat.gap || !pic.startsWith("/")) continue;
    const durF = durationByBeat.get(String(beat.id)) ?? 0;
    if (durF < 36) continue;
    const lastF = durF - 1;
    const look = looks.get(frame.sceneId);
    const text = String(beat.text ?? "");
    const voiced = Boolean(beat.audioUrl) && !isNarrationBeat(beat);
    const speaker = String(beat.characterId ?? "");
    const h = hashInt(String(beat.id));
    const anim: BeatAnimation = {};

    if ((look?.mood === "red" && h % 2 === 0) || (voiced && TENSION.test(text) && h % 3 !== 0)) {
      // Dutch tilt: the situation is unstable. Zoom is raised enough that the rotated picture never shows edges.
      const deg = (1.6 + (h % 15) / 10) * dutchFlip;
      dutchFlip = -dutchFlip;
      const cover = Math.max(minZoomForRotation(deg) + 0.02, 1.05);
      anim.rotation = [key(0, 0), key(lastF, deg)];
      anim.zoom = [key(0, 1), key(lastF, Number(cover.toFixed(4)))];
      report.dutchBeats += 1;
    } else if (voiced && EMOTIVE.test(text)) {
      anim.zoom = [key(0, 1), key(lastF, 1.075)]; // close-up feeling: fear, suspicion, guilt
      report.pushBeats += 1;
    } else if (speaker === "nw_kurose" && voiced) {
      anim.zoom = [key(0, 1.07), key(lastF, 1.07)]; // power: slow tilt up
      anim.y = [key(0, 1.6), key(lastF, -1.2)];
    } else if ((speaker === "nw_vera" || speaker === "nw_mara") && voiced && /afraid|scared|alone|trapped/i.test(text)) {
      anim.zoom = [key(0, 1.07), key(lastF, 1.07)]; // vulnerable: slow tilt down
      anim.y = [key(0, -1.2), key(lastF, 1.6)];
    } else if (REFLECTIVE.test(text) && !voiced) {
      anim.zoom = [key(0, 1.05), key(lastF, 1.05)]; // reflections: divided identity, a slow sideways drift
      anim.x = [key(0, -1.2), key(lastF, 1.2)];
      report.reflectionBeats += 1;
    } else {
      continue;
    }
    beat.animation = withCamera(beat.animation, anim);
  }
}

function dipKeys(
  clipStartMs: number,
  clipDurationMs: number,
  windows: { startMs: number; endMs: number; scale: number }[],
): AudioVolumeKey[] | undefined {
  const rel = windows
    .map((w) => ({ s: w.startMs - clipStartMs, e: w.endMs - clipStartMs, scale: w.scale }))
    .filter((w) => w.e > 0 && w.s < clipDurationMs)
    .sort((a, b) => a.s - b.s);
  if (!rel.length) return undefined;
  const keys: AudioVolumeKey[] = [];
  const push = (atMs: number, gain: number) => {
    const at = Math.max(0, Math.min(clipDurationMs, roundMicros(atMs)));
    const last = keys[keys.length - 1];
    if (last && at <= last.atMs) return;
    keys.push({ atMs: at, gain });
  };
  for (const w of rel) {
    push(w.s - 300, 1);
    push(w.s, w.scale);
    push(w.e, w.scale);
    push(w.e + 400, 1);
  }
  return keys;
}

/** Pass 4: sound, built only from files already in the film. */
function polishAudio(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations: ReadonlyMap<string, number> | undefined,
  looks: Map<string, SceneLook>,
  report: JackNoirReport,
): AudioClip[] {
  const frames = buildKeyframes(story);
  const base = buildAudioClipsFromFilm(story, voiceDurations, musicDurations);
  const { clips: timeline } = buildTimelineClips(frames, voiceDurations);
  const resolved = resolveAudioClips(base, timeline);
  const frameById = new Map(frames.map((f) => [f.id, f]));

  const voiceSorted = resolved.filter((c) => c.lane === "voice").sort((a, b) => a.startMs - b.startMs);
  const prevEnd = new Map<string, number>();
  voiceSorted.forEach((c, i) => prevEnd.set(c.id, i ? voiceSorted[i - 1].endMs : 0));

  // Windows where the music steps back: under Jack's voice-over, and silence after gunfire.
  const musicWindows: { startMs: number; endMs: number; scale: number }[] = [];
  const voiceOver = new Set<string>();
  for (const rc of voiceSorted) {
    const frame = frameById.get(rc.anchorId);
    if (frame && isJackVoiceOver(frame.beat)) {
      voiceOver.add(rc.id);
      musicWindows.push({ startMs: rc.startMs, endMs: rc.endMs, scale: 0.45 });
    }
  }
  for (const rc of resolved) {
    if (rc.lane === "sfx" && SHOT_SFX.test(rc.src)) {
      musicWindows.push({ startMs: rc.startMs + 250, endMs: rc.startMs + 2600, scale: 0 });
      report.silenceWindows += 1;
    }
  }
  report.voiceOverBeats = voiceOver.size;

  const out: AudioClip[] = [];
  const plain = (rc: (typeof resolved)[number], patch: Partial<AudioClip> = {}): AudioClip => ({
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
    ...patch,
  });
  const tap = (rc: (typeof resolved)[number], n: number, delayMs: number, scale: number): AudioClip =>
    plain(rc, {
      id: `${rc.id}_echo${n}`,
      offsetMs: roundMicros(rc.offsetMs + delayMs),
      gain: Math.max(0.02, rc.gain * scale),
      fadeInMs: 40,
      fadeOutMs: 220,
      loop: false,
      volumeKeys: undefined,
    });

  for (const rc of resolved) {
    if (rc.lane === "music") {
      const keys = dipKeys(rc.startMs, rc.durationMs, musicWindows);
      out.push(plain(rc, { gain: rc.gain * 0.85, ...(keys ? { volumeKeys: keys } : {}) }));
      continue;
    }
    if (rc.lane === "voice") {
      const frame = frameById.get(rc.anchorId);
      const isVO = voiceOver.has(rc.id);
      const clear = rc.startMs - (prevEnd.get(rc.id) ?? 0);
      const atStart = Math.abs(rc.offsetMs) < 35;
      const eligible = atStart && rc.startMs > 3000 && clear >= 700;
      const lead = isVO ? Math.min(650, clear - 150) : hashInt(rc.id) % 3 !== 0 ? 240 : 0;
      let voice = plain(rc);
      if (eligible && lead >= 120) {
        voice = plain(rc, { offsetMs: roundMicros(rc.offsetMs - lead), fadeInMs: 14, fadeOutMs: 24 });
        report.jCuts += 1;
      }
      out.push(voice);
      if (isVO && frame) {
        out.push(tap(voice as never, 1, 210, 0.16), tap(voice as never, 2, 430, 0.08));
        report.echoTaps += 2;
      }
      continue;
    }
    out.push(plain(rc));
    // Echo taps on footsteps where the place rings (stairwells, viaducts, rooftops, the Hive).
    if (rc.lane === "sfx" && /footsteps|boots|heels|running/.test(rc.src)) {
      const frame = frameById.get(rc.anchorId);
      if (frame && looks.get(frame.sceneId)?.echoey) {
        out.push(tap(rc as never, 1, 260, 0.28), tap(rc as never, 2, 520, 0.14));
        report.echoTaps += 2;
      }
    }
  }
  return out;
}

/** Distant sirens on a handful of wet, cool-lit nights: an existing effect on beats that have no effect yet. */
function addSirens(story: StoryLike, looks: Map<string, SceneLook>, report: JackNoirReport): void {
  for (const scene of story.scenes) {
    const look = looks.get(scene.id);
    if (!look || look.mood !== "blue" || !look.rainy) continue;
    if (hashInt(scene.id) % 9 !== 0) continue;
    const beats = scene.dialogueBeats ?? [];
    const target = beats.find((b, i) => i >= 1 && !b.sfxUrl && !b.audioUrl && !b.gap);
    if (!target) continue;
    target.sfxUrl = "/film/sfx/sirens-distant.mp3";
    target.sfxVolume = 0.2;
    report.sirens += 1;
  }
}

/** Builds the cut from an Original Uncut project (the true source). Pure: the input project is not changed. */
export function applyJackNoirTreatment(
  uncut: ProjectState,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): { project: ProjectState; report: JackNoirReport } {
  const report = newReport();
  const story: StoryLike = JSON.parse(JSON.stringify(uncut.story));
  story.captionStyle = { position: "bottom", size: "S", backgroundBox: false, showSpeaker: true, italicNarration: true };
  const looks = applyLook(story, report);
  addSirens(story, looks, report);
  applyPacing(story, voiceDurations, report);
  applyCamera(story, voiceDurations, looks, report);
  const audioClips = polishAudio(story, voiceDurations, musicDurations, looks, report);
  return {
    project: { ...uncut, story, audioClips, updatedAt: Date.now() },
    report,
  };
}
