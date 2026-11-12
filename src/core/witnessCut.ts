// "The Witness Cut": Original Uncut directed as a grown-up procedural nocturne. The camera is a witness —
// it never anticipates, it reacts late and it stays on consequence. Built non-destructively from
// `project.originalStory`.
//
//  - No narration. The screenplay's description (the silent narrator beats Original Uncut shows as italic
//    captions) is not shown: the picture tells it. Those beats stay, because they carry the picture change,
//    the look and the sound effect; only their caption goes, and their length is no longer the time it took
//    to read it. Spoken lines and unvoiced dialogue keep their captions.
//  - Cues. Where a narration line told the audience something it needs (writing in the scene, the time, the
//    place, what a man is remembering), the picture has to: WITNESS_CUES lists each one with the picture that
//    shows it, where in the frame it is (the camera goes there) and how long it takes to read. A cue the film
//    had no picture for gets one: a picture from elsewhere in the film cut in, or one made for it. Three jumps
//    in time that no picture could tell get a title over the picture. The cut is screened behind the 2.35:1
//    bars (12% of the height at the top and at the bottom), so a cue has to sit clear of them in its picture.
//  - Timing: a silent shot is held for what is in it, not for a caption: a base for a new picture, a longer
//    one for the first picture of a scene, a little more for each thing the screenplay saw there, and a
//    short breath where a silent beat only separates two lines. Ordinary spoken tails are cut from 0.54 s to
//    0.33 s, but lines that carry weight (grief, confession, a lie owned up to) HOLD for ~1.15 s before the
//    cut: fast through procedure, slow through consequence. The beat before violence is extended and locked
//    off (dread); the silent beat after it is held even longer (aftermath). The last words of a line are
//    never clipped. In scenes 1 and 2, cuts to a new picture land on the beat of the song, as the director
//    asked. Sequences the film cut to music (the songs, the raid on the inn) keep every length the film gave
//    them, so their cuts stay where they are on the song.
//  - Camera: eye-level and patient, and one move per shot. Every still picture gets a single continuous move
//    sized to the length of its shot (the film's own moves were timed for narration and never finished in a
//    shorter shot): a push toward what matters on inserts and cues, a creep-in on confession, a slow lateral
//    drift on observation, a pull-back on a scene's last silent picture; otherwise the kind of move the film
//    gave that picture (push, drift or still), at this cut's speed. A locked tripod in front of violence, an
//    impact settle on the violent beat itself, a slow pull-back on the aftermath, and a few sub-2° cants in
//    danger scenes.
//  - Light: motivated practicals from the existing overlays only — street rim light on wet nights,
//    venetian slats in offices, a key slash in danger, an eye light reserved for confession close-ups,
//    volumetric shafts where the room rings.
//  - Transitions: hard cuts (the film's blanket 0.9 s crossfade on every narrated picture change is not
//    used), except a dissolve where time demonstrably passes and a dip to black into the elegiac scenes.
//    Nothing decorative.
//  - Sound: J-cuts lead the next line by 200 ms where there is clear air; the score sits slightly lower
//    with longer fades and is never dipped for effects (the engine's own voice ducking is the only ducking).
//    No sound is added, removed or moved off its beat.
//  - One shot per picture: consecutive beats of a scene that show the same picture are merged into one
//    frame on the timeline. Every line, caption and sound stays at the exact same time, and the shot's one
//    camera move runs through it.

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
  type Keyframe,
  type ProjectState,
  type SceneLike,
  type StoryLike,
} from "./model";
import { lookupMusicDuration, resolveMusicSpans } from "./previewAudio";
import { clipFrames, FPS, sceneProseFrames } from "./timing";
import {
  ANIM_PROPS,
  buildCameraKeyframesFromEvaluator,
  buildTimelineClips,
  defaultValueForProp,
  evaluate,
  minZoomForRotation,
  type AnimProp,
  type SampledCameraPose,
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

/** The film's opening and ending: built by the cut builder with their own lengths, looks and dissolves. */
const STRUCTURAL_SCENE = /^nw_(intro|logo|title|credits|end)$/;
/** Sequences the film cut to music (the songs, the raid on the inn): one shot per scene, each with its own length. */
const OWN_RHYTHM_SCENE = /^nw_(song|cut)_/;

function hashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The screenplay's description: a beat of the narrator with no recorded voice. (Kaneko's prologue is her own
 * voice, and a character's line that was never recorded is still dialogue: neither is narration.)
 */
export function isWitnessNarration(beat: Pick<BeatLike, "characterId" | "audioUrl">): boolean {
  const cid = String(beat.characterId ?? "");
  return !beat.audioUrl && (cid === "narrator" || /(^|_)narrator$/i.test(cid));
}

/**
 * Something a narration line told the audience that the picture now has to tell. A line the picture, a spoken
 * line or a sound already covers is not listed (reviews/witness-cut-cues-20261111/ has the whole audit).
 */
export interface WitnessCue {
  /** The narration beat whose line was the cue. */
  beatId: string;
  /** What the line told the audience. */
  cue: string;
  /**
   * A picture shown on this beat in this cut instead of the film's: an existing picture cut in, or one made for
   * the cue. It is held by the beats after it, like any picture a beat brings.
   */
  picture?: string;
  /**
   * Where the cue is in the picture ("x% y%"): the camera pushes in on it. It has to be clear of the 2.35:1
   * bars the cut is screened behind (12% at the top and at the bottom) and of the 1.37:1 pillars.
   */
  focus?: string;
  /**
   * The picture is cut in for this beat only: the beat after it goes back to what the film shows there (the
   * look, what he is looking at, the look again).
   */
  insert?: boolean;
  /** Seconds the beat needs for the writing in the picture to be read. */
  read?: number;
  /** The beat is held for exactly this long (a flash of memory). */
  hold?: number;
  /** A title over the picture: only where time jumps and no picture could say so. */
  title?: string;
  /** Time passes into this beat: the picture dissolves in. */
  dissolve?: boolean;
}

const SIGN_IN_THE_FAMILY_PHOTOGRAPH = "/film/img/s4/623-the-sign-behind-them.jpg";
const SIGN_IN_JACKS_PHOTOGRAPH = "/film/img/s11/624-the-same-sign.jpg";
const THE_LETTER_CLOSE = "/film/img/s18/626-the-letter-under-the-lamp.jpg";

export const WITNESS_CUES: readonly WitnessCue[] = [
  // Scene 1: the cold open.
  { beatId: "nw_b10", cue: "Her phone lights up: VERA.", focus: "75% 58%", read: 2.2 },
  { beatId: "nw_b13", cue: "The scrap: 1.00 Sakai, an address, “just listen.”", focus: "50% 47%", read: 4.2 },
  { beatId: "nw_b46", cue: "A small brass key on a stamped number tag (114).", focus: "48% 57%", read: 2.6 },
  // Three days later.
  { beatId: "nw_b71", cue: "THREE DAYS LATER", title: "THREE DAYS LATER" },
  // The sign. The film's old photographs do not show the sign of the sketchbook and of the shop itself, so the
  // narration had to say "the same sign" each time; these two pictures were made to show it (623: the family
  // photograph, closer; 624: Jack's own photograph, with the sign it should have had).
  { beatId: "nw_b81", cue: "Behind them, the sign of a noodle shop.", picture: SIGN_IN_THE_FAMILY_PHOTOGRAPH, focus: "49% 25%", read: 3 },
  { beatId: "nw_b111", cue: "On the monitor: MARA VOSS.", focus: "46% 44%", read: 2.4 },
  { beatId: "nw_b142", cue: "A passport photo: Mara.", focus: "50% 42%", read: 2.4 },
  { beatId: "nw_b189", cue: "In the drawer: Mara's purse and the torn strap, in an evidence bag.", focus: "50% 62%", read: 3.2 },
  { beatId: "nw_b223", cue: "The card: JACK. INVESTIGATIONS.", focus: "53% 56%", read: 3.4 },
  { beatId: "nw_b260", cue: "He looks a moment too long at the noodle shop sign.", picture: SIGN_IN_THE_FAMILY_PHOTOGRAPH, insert: true, focus: "49% 25%", hold: 2.6 },
  { beatId: "nw_b283", cue: "The clipping: AMERICAN INSURANCE INVESTIGATOR FOUND DEAD - POLICE RULE SUICIDE.", focus: "47% 45%", read: 4.6 },
  { beatId: "nw_b284", cue: "The caption: DANIEL VOSS, 41.", focus: "55% 60%", read: 3.0 },
  { beatId: "nw_b285", cue: "One more photograph: Daniel Voss and a much younger Jack at a noodle counter. Behind them, the same sign.", picture: SIGN_IN_JACKS_PHOTOGRAPH, focus: "64% 30%", read: 3.2 },
  // The sketchbook: he has seen this sign twice this week. What he remembers is cut in, a flash each: her
  // photograph when he sees the drawing, his own when she asks why he wants the book and he does not answer.
  { beatId: "nw_b357", cue: "He has seen this sign: in the photograph from Vera's shelf.", picture: SIGN_IN_THE_FAMILY_PHOTOGRAPH, insert: true, focus: "49% 25%", hold: 1.6 },
  { beatId: "nw_b360", cue: "And in a box in his own cupboard. He doesn't answer.", picture: SIGN_IN_JACKS_PHOTOGRAPH, insert: true, focus: "64% 30%", hold: 1.6 },
  // The stakeout: time passes twice.
  { beatId: "nw_b390", cue: "LATER.", dissolve: true },
  { beatId: "nw_b430", cue: "3:40 a.m.", dissolve: true },
  { beatId: "nw_b440", cue: "The hoarding: KUROSE DEVELOPMENT.", focus: "51% 72%", read: 3.2 },
  // The letter in the sketchbook. The film's picture of it (s18/283) is the desk, wide, and the handwriting in it
  // cannot be read. The letter as the film designed it (props/sakai-letter), under the light of that desk lamp,
  // is cut in for the words; 283 is then the look at the name on the envelope.
  { beatId: "nw_b483", cue: "The letter: “Miss Voss. Your father did not kill himself.” T. SAKAI.", picture: THE_LETTER_CLOSE, focus: "40% 27%", read: 5.6 },
  { beatId: "nw_b485", cue: "The envelope folded inside it is addressed to VERA VOSS.", focus: "67% 52%", read: 3.0 },
  { beatId: "nw_b609", cue: "Mara's drawing of the bar from the floor: 1:07, EXCUSE ME.", focus: "60% 64%", read: 3.0 },
  { beatId: "nw_b615", cue: "The coin-locker key: 114.", focus: "59% 54%", read: 2.4 },
  // "He left it the week before": the film never shows what Okada puts on the counter.
  { beatId: "nw_b712", cue: "Okada sets a card on the counter: TOTO SHIMBUN. The journalist's name in katakana: KONDO.", picture: "/film/img/s27a/625-the-journalists-card.jpg", insert: true, focus: "48% 60%", read: 3 },
  { beatId: "nw_b734", cue: "The receipt: No. 114. Paid in full.", focus: "50% 52%", read: 3.2 },
  { beatId: "nw_b759", cue: "KATO RENTAL LOCKERS - UENO. No. 114.", focus: "50% 42%", read: 3.6 },
  { beatId: "nw_b787", cue: "Later. 2 a.m.", dissolve: true },
  // Only two people knew where he was going: what Jack is counting is cut in, a flash each.
  { beatId: "nw_b863", cue: "Ishida. He asked Ishida for the widow's address.", picture: "/film/img/s23/352-the-address.jpg", insert: true, hold: 1.6 },
  { beatId: "nw_b864", cue: "And Vera. He called her and told her it was just an inn.", picture: "/film/img/s36/208-come-back-safe-anyway.jpg", insert: true, hold: 1.6 },
  { beatId: "nw_b1034", cue: "The sign: MONTHLY. YEARLY. NO QUESTIONS.", focus: "49% 33%", read: 2.6 },
  { beatId: "nw_b1038", cue: "A cassette, labelled in a shaking hand: SHIOHAMA.", focus: "47% 52%", read: 3.0 },
  { beatId: "nw_b1039", cue: "On the flyleaf: DANIEL VOSS.", focus: "60% 46%", read: 3.0 },
  { beatId: "nw_b1076", cue: "LATER:", dissolve: true },
  { beatId: "nw_b1095", cue: "The clock: 10:00.", focus: "50% 50%", read: 2.2 },
  { beatId: "nw_b1096", cue: "Earlier: a different clock, 8:52.", focus: "50% 41%", read: 3.2 },
  { beatId: "nw_b1174", cue: "The clock above the bar: 11:52.", focus: "36% 24%", read: 2.4 },
  // The avenue before dawn: the film had no picture on this beat (a black frame under the description).
  { beatId: "nw_b1290", cue: "Before dawn. A wide, empty avenue; white streetlights in a long straight row.", picture: "/film/img/s77a/1290-predawn-avenue.jpg" },
  { beatId: "nw_b1313", cue: "Inside the cover: DANIEL VOSS.", focus: "38% 45%", read: 2.8 },
  { beatId: "nw_b1317", cue: "The letter she threw away, smoothed flat: “Your father did not kill himself.”", focus: "48% 32%", read: 4.2 },
  { beatId: "nw_b1472", cue: "The drawing: EXCUSE ME.", focus: "64% 66%", read: 3.0 },
  { beatId: "nw_b1610", cue: "FIVE DAYS LATER", title: "FIVE DAYS LATER" },
  { beatId: "nw_b1661", cue: "Weeks later.", title: "WEEKS LATER" },
  { beatId: "nw_b1671", cue: "Months later.", dissolve: true },
];

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

/** The one move a shot is given. */
export type WitnessMove = "cue" | "creep" | "cant" | "drift" | "pull-back" | "push" | "breath" | "hold";

export interface WitnessReport {
  scenesBySetting: Record<WitnessSetting, number>;
  /** Narration captions that are no longer shown. */
  narrationRemoved: number;
  /** Cues whose beat is not in the story (the film changed): nothing was done for them. */
  missingCues: string[];
  /** Beats that show a different picture from the film's, so the picture is the cue. */
  cuePictures: number;
  /** Titles over the picture (time jumps). */
  titleCards: number;
  /** Silent shots whose length is now set by what is in the picture. */
  silentShots: number;
  /** Silent beats that only separate two lines: a short breath. */
  pauses: number;
  /** Cuts to a new picture moved onto the beat of the song (scenes that carry a tempo). */
  cutsOnBeat: number;
  /** The film's crossfades on narrated picture changes that are hard cuts here. */
  hardCuts: number;
  reactionHolds: number;
  tightTails: number;
  dreadHolds: number;
  aftermathHolds: number;
  /** Creep-ins on shots that carry a confession or a line with weight. */
  pushIns: number;
  /** Lateral drifts. */
  drifts: number;
  dutchTilts: number;
  impactBeats: number;
  pullBacks: number;
  /** Pushes toward a cue. */
  cuePushes: number;
  /** Shots given one continuous move, by the kind of move. */
  shotMoves: Record<WitnessMove, number>;
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
    narrationRemoved: 0,
    missingCues: [],
    cuePictures: 0,
    titleCards: 0,
    silentShots: 0,
    pauses: 0,
    cutsOnBeat: 0,
    hardCuts: 0,
    reactionHolds: 0,
    tightTails: 0,
    dreadHolds: 0,
    aftermathHolds: 0,
    pushIns: 0,
    drifts: 0,
    dutchTilts: 0,
    impactBeats: 0,
    pullBacks: 0,
    cuePushes: 0,
    shotMoves: { cue: 0, creep: 0, cant: 0, drift: 0, "pull-back": 0, push: 0, breath: 0, hold: 0 },
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

/** How long a title over the picture is held. */
const TITLE_FRAMES = 4 * FPS;

/**
 * Pass 0: no narration, and the picture is the cue. Every narrator beat keeps its picture, look, sound and
 * place in the film, and loses its caption. A cue's picture is put on its beat (with the look that picture
 * has wherever the film already uses it), and a time jump gets its title.
 */
function applyNarrationAndCues(story: StoryLike, report: WitnessReport): Map<string, WitnessCue> {
  // What the film shows on each beat, before anything is cut in.
  const film = buildKeyframes(story);
  const filmIndex = new Map(film.map((frame, index) => [frame.beat, index]));
  const cueBeats = new Set(WITNESS_CUES.filter((cue) => cue.picture).map((cue) => cue.beatId));
  // The look each picture has where the film uses it: its focal point, its depth map, its lights.
  const lookByPicture = new Map<string, AnyRecord | undefined>();
  const beatById = new Map<string, BeatLike>();
  for (const scene of story.scenes) {
    if (typeof scene.background === "string" && scene.background && !lookByPicture.has(scene.background)) {
      lookByPicture.set(scene.background, scene.cinematic);
    }
    for (const beat of scene.dialogueBeats ?? []) {
      if (beat.id) beatById.set(String(beat.id), beat);
      if (typeof beat.background === "string" && beat.background && !lookByPicture.has(beat.background)) {
        lookByPicture.set(beat.background, beat.cinematic ?? scene.cinematic);
      }
    }
  }

  for (const scene of story.scenes) {
    for (const beat of scene.dialogueBeats ?? []) {
      if (beat.gap || !isWitnessNarration(beat) || Array.isArray(beat.captions)) continue;
      // an authored, empty list of captions: nothing is shown; the beat's text stays as its label in the editor
      beat.captions = [];
      report.narrationRemoved += 1;
    }
  }

  const cues = new Map<string, WitnessCue>();
  for (const cue of WITNESS_CUES) {
    const beat = beatById.get(cue.beatId);
    if (!beat) {
      report.missingCues.push(cue.beatId);
      continue;
    }
    cues.set(cue.beatId, cue);
    if (cue.picture) {
      const look = lookByPicture.get(cue.picture);
      beat.background = cue.picture;
      beat.cinematic = look ? clone(look) : { mode: "static" };
      if (cue.focus) beat.cinematic.focalPoint = cue.focus;
      delete beat.backgroundRevert;
      delete beat.backgroundHold;
      delete beat.animation; // the film's move on this beat belonged to another picture
      report.cuePictures += 1;
      if (cue.insert) {
        // The beat after an insert shows what the film shows there, not the insert held over.
        const at = filmIndex.get(beat);
        const after = at === undefined ? undefined : film[at + 1];
        if (
          after &&
          after.sceneId === film[at!].sceneId &&
          !after.beat.gap &&
          !after.beat.background &&
          !cueBeats.has(String(after.beat.id ?? "")) &&
          after.picture
        ) {
          after.beat.background = after.picture;
          if (!after.beat.cinematic && after.cinematic) after.beat.cinematic = clone(after.cinematic);
          delete after.beat.backgroundRevert;
        }
      }
    }
    if (cue.title) {
      beat.titleCard = { title: cue.title, align: "lower-left" };
      beat.durationFrames = TITLE_FRAMES;
      beat.captions = [];
      report.titleCards += 1;
    }
  }
  return cues;
}

/**
 * Pass 1: grade and motivated practical light, laid over the look each beat already shows in Original Uncut
 * (its own, or the one held from the beat that brought the picture: a line spoken over a held picture keeps
 * that picture's focal point and depth map).
 */
function applyLook(story: StoryLike, report: WitnessReport): Map<string, WitnessSceneLook> {
  const looks = new Map<string, WitnessSceneLook>();
  const shown = new Map<BeatLike, AnyRecord | undefined>();
  for (const frame of buildKeyframes(story)) shown.set(frame.beat, frame.cinematic);
  for (const scene of story.scenes) {
    const beats = scene.dialogueBeats ?? [];
    if (!beats.length || scene.id === "nw_intro" || scene.id === "nw_logo") continue;
    const look = classifyWitnessScene(scene);
    looks.set(scene.id, look);
    report.scenesBySetting[look.setting] += 1;
    beats.forEach((beat, idx) => {
      if (beat.gap || String(beat.background ?? "").startsWith("video:")) return;
      const base: AnyRecord = { ...(shown.get(beat) ?? beat.cinematic ?? scene.cinematic ?? {}) };
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

/**
 * Pass 2: motivated transitions only. The film crossfades into nearly every narrated picture for 0.9 s; under
 * a caption that reads as a page turning, without one it is a slideshow, so here those are hard cuts. What is
 * left: a dissolve where time passes (a scene that opens later, and the beats the screenplay marked "LATER"),
 * a dip to black into elegy, and any other transition the film itself put on a beat.
 */
function applyTransitions(
  story: StoryLike,
  looks: Map<string, WitnessSceneLook>,
  cues: ReadonlyMap<string, WitnessCue>,
  report: WitnessReport,
): void {
  for (const scene of story.scenes) {
    const look = looks.get(scene.id);
    if (!look) continue;
    const beats = scene.dialogueBeats ?? [];
    if (!STRUCTURAL_SCENE.test(scene.id) && !OWN_RHYTHM_SCENE.test(scene.id)) {
      for (const beat of beats) {
        // only the crossfade: a transition the film chose for one moment (the zoom after the shot) stays
        if (beat.backgroundTransition !== "crossfade" || beat.transitionUserAdded) continue;
        delete beat.backgroundTransition;
        delete beat.backgroundTransitionSpeed;
        delete beat.transitionAlignment;
        report.hardCuts += 1;
      }
    }
    const first = beats.find((b) => !b.gap);
    if (first && !first.backgroundTransition && (look.elegiac || look.timeJump)) {
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
    for (const beat of beats) {
      const cue = beat.id ? cues.get(String(beat.id)) : undefined;
      if (!cue?.dissolve || beat.backgroundTransition) continue;
      beat.backgroundTransition = "dissolve";
      beat.backgroundTransitionSpeed = 0.85;
      beat.transitionAlignment = "at-cut";
      report.dissolves += 1;
    }
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
 * How long a picture is held when nobody speaks and no caption has to be read (seconds). In Original Uncut a
 * silent beat lasts as long as its caption takes to read; here it lasts as long as the picture needs.
 */
export const WITNESS_SILENCE = {
  /** A new picture. */
  shot: 2.3,
  /** The first picture of a scene: the place has to be taken in. */
  establish: 3.4,
  /** The share of that a picture gets when it carries on under the next line (it is seen through the line too). */
  underVoice: 0.62,
  /** More for each word the screenplay spent on the shot (what it saw there), up to `detailMax`. */
  perWord: 0.045,
  detailMax: 1.6,
  /** More for each further beat of description on the same picture (something else happens in it). */
  perBeat: 0.35,
  /** The longest a silent picture is held, unless there is writing in it to read. */
  shotMax: 5,
  establishMax: 6,
  /** A silent beat between two lines on a picture that is already up: a breath, and a little for what happens in it. */
  pause: 0.7,
  pausePerWord: 0.02,
  pauseDetailMax: 0.4,
  /** "A beat.", "Silence.", "He doesn't answer.": a pause the screenplay asked for. */
  markedPause: 1.0,
  /** "A long pause.", "for a long moment". */
  longPause: 1.6,
  /** The longest run of such pauses. */
  pauseMax: 2.6,
  /** More after a line that carries weight. */
  afterHeavy: 0.4,
  /** More on a new picture the screenplay looks at "for a long time". */
  longLook: 1.0,
  /** A scene's last silent picture stays a moment before the next scene. */
  button: 0.5,
  /** Scenes with violence in them move faster; elegy and scenes with no dialogue at all take their time. */
  dangerTempo: 0.85,
  elegyTempo: 1.2,
  wordlessTempo: 1.15,
  /** A sound effect is kept inside its shot when it is short; a long one runs on over the cut. */
  shortSound: 2.6,
  shortSoundMax: 2.0,
  longSoundLead: 1.5,
  violentSound: 1.25,
} as const;

const MIN_SILENT_FRAMES = 10;
const LONG_PAUSE = /\blong (moment|time|pause|silence|while|beat)\b|\bfor a while\b|\bfor a long\b/i;
const MARKED_PAUSE =
  /^(a (small )?beat|a pause|silence|a breath|pages)\b|\b(doesn'?t answer|says nothing|no answer|has no answer|can'?t answer|waits|hesitates|very still|a moment|the pause|stares?|studies|considers|thinks (about )?it|decides|believes?|gives way|arrives in (her|his) face|the truth|what to say|breathing|lets it be)\b/i;
/** Silent beats that are the consequence itself: the witness stays on them. */
const HEAVY_SILENCE = /\b(gone|dead|dies|died|stops? moving|open eyes|cry(ing)?|cries|sobs?|breaks|shak(es|ing)|goes very still)\b/i;

function wordCount(text: unknown): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** A length the film set by hand or cut to music (not the time a caption takes to read): never re-timed. */
function hasAuthoredLength(frame: Keyframe): boolean {
  const beat = frame.beat;
  if (Number(beat.durationFrames) > 0) return true;
  if (Number(beat.holdSeconds ?? beat.holdDuration ?? beat.durationSeconds ?? beat.hold) > 0) return true;
  const beats = frame.scene.dialogueBeats ?? [];
  const delay = Number(beat.afterBeatDelaySeconds);
  return (
    frame.beatIndex === beats.length - 1 &&
    beat.afterBeatMode === "auto" &&
    Number.isFinite(delay) &&
    delay > 0 &&
    delay !== 1
  );
}

function transitionFrames(beat: BeatLike): number {
  if (!beat.backgroundTransition) return 0;
  const speed = Number(beat.backgroundTransitionSpeed);
  return Number.isFinite(speed) && speed > 0 ? Math.round(speed * FPS) : 12;
}

/**
 * Scenes whose lengths belong to a piece of music: the sequences cut to a song, and an ordinary scene that
 * plays in the middle of one (Mara's message, inside the night after the call).
 */
function scenesWithOwnRhythm(frames: readonly Keyframe[]): Set<string> {
  const order: string[] = [];
  for (const frame of frames) if (order[order.length - 1] !== frame.sceneId) order.push(frame.sceneId);
  const own = new Set<string>();
  order.forEach((id, i) => {
    const inside =
      i > 0 && i < order.length - 1 && OWN_RHYTHM_SCENE.test(order[i - 1]) && OWN_RHYTHM_SCENE.test(order[i + 1]);
    if (STRUCTURAL_SCENE.test(id) || OWN_RHYTHM_SCENE.test(id) || inside) own.add(id);
  });
  return own;
}

/**
 * Pass 3a: silent pictures. Consecutive silent beats on one picture are one stretch of silence: it gets a
 * length for what it is (the first picture of a scene, a new picture, or a breath between two lines), and that
 * length is shared between its beats in the proportions the film gave them, so a sound effect still falls at
 * the same point of the shot. Writing that has to be read, and a short sound, are never cut off.
 * Returns the beats it timed, each with the least it may be (frames).
 */
function retimeSilence(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  looks: Map<string, WitnessSceneLook>,
  cues: ReadonlyMap<string, WitnessCue>,
  report: WitnessReport,
): Map<string, number> {
  const retimed = new Map<string, number>();
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurations);
  const ownRhythm = scenesWithOwnRhythm(frames);
  const wordless = new Set<string>();
  for (const scene of story.scenes) {
    if (!(scene.dialogueBeats ?? []).some((b) => !isWitnessNarration(b) && !b.gap)) wordless.add(scene.id);
  }
  const sameScene = (a: Keyframe | undefined, b: Keyframe | undefined) => Boolean(a && b && a.sceneId === b.sceneId);
  const retimable = (frame: Keyframe | undefined): frame is Keyframe =>
    Boolean(frame) &&
    !frame!.beat.gap &&
    !frame!.beat.titleCard &&
    isWitnessNarration(frame!.beat) &&
    !ownRhythm.has(frame!.sceneId) &&
    !String(frame!.picture ?? "").startsWith("video:") &&
    !hasAuthoredLength(frame!);

  let i = 0;
  while (i < frames.length) {
    if (!retimable(frames[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (retimable(frames[j + 1]) && sameScene(frames[j + 1], frames[i]) && frames[j + 1].picture === frames[i].picture) {
      j += 1;
    }
    const first = frames[i];
    const before = frames[i - 1]; // what is on screen when this silence begins, in this scene or the one before
    const prev = sameScene(before, first) ? before : undefined;
    const next = sameScene(frames[j + 1], first) ? frames[j + 1] : undefined;
    const members = frames.slice(i, j + 1);
    // A scene that carries on with the picture already up ("(cont.)", or after a title) opens nothing.
    const opens = !before || before.beat.gap === true || before.picture !== first.picture || Boolean(first.beat.backgroundTransition && prev);
    const look = looks.get(first.sceneId);
    const S = WITNESS_SILENCE;

    let seconds: number;
    if (opens) {
      const base = prev ? S.shot : S.establish;
      const words = members.reduce((n, f) => n + wordCount(f.beat.text), 0);
      const detail = Math.min(S.detailMax, S.perWord * words) + S.perBeat * (members.length - 1);
      const underVoice = Boolean(next) && next!.picture === first.picture;
      seconds = Math.min(underVoice ? base * S.underVoice + detail * 0.5 : base + detail, prev ? S.shotMax : S.establishMax);
      seconds *=
        look?.setting === "danger"
          ? S.dangerTempo
          : look?.elegiac
            ? S.elegyTempo
            : wordless.has(first.sceneId)
              ? S.wordlessTempo
              : 1;
      if (members.some((f) => HEAVY_SILENCE.test(String(f.beat.text ?? "")))) seconds += S.afterHeavy;
      if (members.some((f) => LONG_PAUSE.test(String(f.beat.text ?? "")))) seconds += S.longLook;
      report.silentShots += 1;
    } else {
      seconds = 0;
      for (const f of members) {
        const text = String(f.beat.text ?? "");
        seconds +=
          (LONG_PAUSE.test(text) || HEAVY_SILENCE.test(text) ? S.longPause : MARKED_PAUSE.test(text) ? S.markedPause : S.pause) +
          Math.min(S.pauseDetailMax, S.pausePerWord * wordCount(text));
      }
      seconds = Math.min(seconds, S.pauseMax);
      const before = String(prev?.beat.text ?? "");
      if (prev?.beat.audioUrl && (HEAVY.test(before) || CONFESS.test(before))) seconds += S.afterHeavy;
      report.pauses += members.length;
    }
    if (!next) seconds += S.button;

    // What each beat cannot go under: writing to be read, a short sound, a dissolve it opens with.
    const floors = members.map((f) => {
      const cue = cues.get(String(f.beat.id ?? ""));
      let floor = MIN_SILENT_FRAMES;
      if (cue?.read) floor = Math.max(floor, Math.round(cue.read * FPS));
      if (f.beat.sfxUrl) {
        const sound = voiceDurations.get(String(f.beat.sfxUrl));
        // A shot is over before its sound is: the cut goes to what it did.
        const lead = VIOLENCE_SFX.test(String(f.beat.sfxUrl))
          ? S.violentSound
          : sound !== undefined && sound <= S.shortSound
            ? Math.min(sound + 0.2, S.shortSoundMax)
            : S.longSoundLead;
        floor = Math.max(floor, Math.round(lead * FPS));
      }
      return floor + transitionFrames(f.beat);
    });
    const flash = members.length === 1 ? cues.get(String(first.beat.id ?? ""))?.hold : undefined;
    const floorTotal = floors.reduce((a, b) => a + b, 0);
    const total = flash ? Math.round(flash * FPS) : Math.max(Math.round(seconds * FPS) + transitionFrames(first.beat), floorTotal);
    const weights = members.map((_, k) => Math.max(1, clips[i + k].durationFrames));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    let spare = Math.max(0, total - floorTotal);
    members.forEach((f, k) => {
      const share = k === members.length - 1 ? spare : Math.min(spare, Math.round(((total - floorTotal) * weights[k]) / weightTotal));
      spare -= share;
      f.beat.durationFrames = flash ? total : floors[k] + share;
      retimed.set(f.id, flash ? total : floors[k]);
    });
    i = j + 1;
  }
  return retimed;
}

/**
 * Pass 3: picture timing. Fast through procedure, slow through consequence: silent pictures are held for what
 * is in them, ordinary spoken tails are tightened, heavy lines get a reaction hold, and violence is framed by
 * a dread hold and an aftermath hold.
 */
function applyPacing(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  looks: Map<string, WitnessSceneLook>,
  cues: ReadonlyMap<string, WitnessCue>,
  report: WitnessReport,
): Map<string, number> {
  const retimed = retimeSilence(story, voiceDurations, looks, cues, report);
  const frames = buildKeyframes(story);
  const ownRhythm = scenesWithOwnRhythm(frames);
  const treatedSilent = new Set<string>();
  // A silent beat this cut timed (or that the film left to its caption) can be held longer around violence.
  const free = (frame: Keyframe) => retimed.has(frame.id) || !frame.beat.durationFrames;

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const beat = frame.beat;
    if (beat.gap) continue;
    // A sequence cut to a song keeps every length the film gave it: a tail tightened or a hold added there
    // moves every later cut of the sequence off the music.
    if (ownRhythm.has(frame.sceneId)) continue;

    // Violence framing: the beat before the shot is held and locked, the silent beat after is held longer.
    if (beat.sfxUrl && VIOLENCE_SFX.test(String(beat.sfxUrl))) {
      const prev = frames[i - 1];
      if (
        prev &&
        prev.sceneId === frame.sceneId &&
        !prev.beat.audioUrl &&
        !prev.beat.gap &&
        free(prev) &&
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
        free(next) &&
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
  return retimed;
}

/** The part of a looped song with a steady beat (seconds): after it the grid is not trusted. */
const STEADY_BEAT_SECONDS = 45;
/**
 * The length of a song that carries a tempo, where the project has no record of it (the editor learns a file's
 * length only when it plays it, and a cut must come out the same every time): measured from the file.
 */
const SONG_SECONDS: Readonly<Record<string, number>> = { "/film/audio/glimmering-haze.mp3": 60.43 };

/**
 * Pass 3b: cuts on the beat. A scene can carry the tempo of its song (`scene.musicSync`: the director measured
 * it for scenes 1 and 2 and asked that cuts to a new picture wait for the beat, though not every beat). The
 * editor does not act on it, so this cut does: each cut to a new picture in such a scene is moved to the
 * nearest beat by changing the length of the shot before it. A line is never shortened, only given air.
 */
function cutOnTheBeat(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations: ReadonlyMap<string, number> | undefined,
  retimed: ReadonlyMap<string, number>,
  report: WitnessReport,
): void {
  const frames = buildKeyframes(story);
  if (!frames.some((f) => f.scene.musicSync)) return;
  const { clips, totalFrames } = buildTimelineClips(frames, voiceDurations);
  const lengths = clips.map((c) => c.durationFrames);
  const indexById = new Map(clips.map((c, k) => [c.keyframe.id, k]));

  for (const span of resolveMusicSpans(clips, totalFrames, musicDurations)) {
    const from = indexById.get(span.id);
    const file = SONG_SECONDS[span.url] ?? lookupMusicDuration(span.url, musicDurations);
    if (from === undefined || !file) continue;
    let sinceStart = lengths[from]; // frames of music played when the cut into clip `k` happens
    for (let k = from + 1; k < clips.length && clips[k].startFrame < span.endFrame; k += 1) {
      const kf = clips[k].keyframe;
      const before = clips[k - 1].keyframe;
      const sync = kf.scene.musicSync as { bpm?: number; firstBeat?: number } | undefined;
      const bpm = Number(sync?.bpm);
      if (bpm > 0 && kf.sceneId === before.sceneId && kf.picture !== before.picture && !before.beat.gap && !before.beat.titleCard) {
        const period = 60 / bpm;
        const firstBeat = Number(sync?.firstBeat) || 0;
        const seconds = sinceStart / FPS;
        const inFile = span.loop ? seconds % file : seconds;
        if (inFile <= STEADY_BEAT_SECONDS && inFile < file) {
          const nearest = firstBeat + Math.round((inFile - firstBeat) / period) * period;
          let move = Math.round((nearest - inFile) * FPS);
          // a silent shot gives or takes; a line, a cue being read and a flash are only ever given air
          const floor = retimed.get(before.id) ?? lengths[k - 1];
          if (lengths[k - 1] + move < floor) move = Math.round((nearest + period - inFile) * FPS);
          if (move !== 0) {
            lengths[k - 1] += move;
            before.beat.durationFrames = lengths[k - 1];
            sinceStart += move;
          }
          report.cutsOnBeat += 1;
        }
      }
      sinceStart += lengths[k];
    }
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

/**
 * How fast the witness's camera moves (per second of shot) and how far it may go. A flat picture is scaled
 * and slid inside the frame, so a push softens it and a drift needs room at the edges; a picture with a depth
 * map is re-projected (near things move three times as far as far ones), so the same numbers go much further.
 */
export const WITNESS_CAMERA = {
  /** A shot shorter than this is not given a move: it would read as a twitch. */
  minMoveFrames: 30,
  /** Push on a flat picture: zoom per second, and the most it reaches. */
  push: 0.013,
  pushMax: 0.1,
  /** The creep-in on a confession. */
  creep: 0.016,
  creepMax: 0.12,
  /** A picture the film left still: it only breathes. */
  breath: 0.006,
  breathMax: 0.04,
  /** The push toward a cue: quicker, and it arrives before the shot ends so the writing can be read. */
  cue: 0.022,
  cueMax: 0.12,
  cueArrives: 0.72,
  /** Drift on a flat picture: the standoff it is watched from, and percent of the frame travelled per second. */
  driftZoom: 1.06,
  drift: 0.55,
  driftMax: 3.6,
  /** With a depth map: the far plane's zoom per second (of at most 0.12 × the picture's depth amount)... */
  depthPush: 0.012,
  /** ...and the parallax travelled per second (of at most 8 × the depth amount). */
  depthDrift: 0.9,
} as const;

const REST_POSE: SampledCameraPose = { zoom: 1, x: 0, y: 0, rotation: 0 };

function focalPercent(value: unknown): [number, number] {
  const match = /(-?[\d.]+)%?\s+(-?[\d.]+)%?/.exec(String(value ?? ""));
  const clampAxis = (n: number) => Math.max(12, Math.min(88, Number.isFinite(n) ? n : 50));
  return match ? [clampAxis(Number(match[1])), clampAxis(Number(match[2]))] : [50, 50];
}

interface ShotMove {
  kind: WitnessMove;
  /** The camera at `u` (0 at the shot's first frame, 1 at its last). */
  pose: (u: number) => SampledCameraPose;
  /** On a picture with a depth map, the push is centred on the focal point. */
  towardFocal?: boolean;
}

/** A zoom about the focal point: on a flat picture the point stays where it is in the frame while it grows. */
function zoomAbout(zoom: number, fx: number, fy: number, depth: boolean): SampledCameraPose {
  if (depth) return { zoom, x: 0, y: 0, rotation: 0 };
  return { zoom, x: (50 - fx) * (zoom - 1), y: (50 - fy) * (zoom - 1), rotation: 0 };
}

/** Every transform channel gets a key, so a beat never borrows a framing from the clip before it. */
function pinCamera(camera: BeatAnimation | undefined, at: SampledCameraPose): BeatAnimation {
  const out: BeatAnimation = { ...(camera ?? {}) };
  for (const prop of ["zoom", "x", "y", "rotation"] as const) {
    if (!out[prop]?.length) out[prop] = [{ frame: 0, value: Math.round(at[prop] * 1e6) / 1e6, easing: "linear" }];
  }
  return out;
}

/**
 * Pass 4: the witness's camera. A shot is a run of beats on one picture, and it gets one move for its whole
 * length (the beats share it, so nothing resets where a line begins, or where a scene carries on with the
 * picture already up): what the shot is decides the move, and the kind of move the film gave the picture
 * decides it when nothing else does. Violence keeps its own three beats: the frame locks where it is on the
 * silent beat before, jolts on the impact, and steps back after. Sequences cut to music keep the film's
 * camera, except where a line in them earns a move.
 */
function applyCamera(
  story: StoryLike,
  voiceDurations: ReadonlyMap<string, number>,
  looks: Map<string, WitnessSceneLook>,
  cues: ReadonlyMap<string, WitnessCue>,
  report: WitnessReport,
): Set<string> {
  const jolts = new Set<string>();
  const frames = buildKeyframes(story);
  const { clips } = buildTimelineClips(frames, voiceDurations);
  const ownRhythm = scenesWithOwnRhythm(frames);
  const C = WITNESS_CAMERA;
  const violent = new Set<number>();
  frames.forEach((f, i) => {
    if (f.beat.sfxUrl && VIOLENCE_SFX.test(String(f.beat.sfxUrl))) violent.add(i);
  });
  const sameScene = (i: number, j: number) => Boolean(frames[i] && frames[j] && frames[i].sceneId === frames[j].sceneId);
  const isVoiced = (beat: BeatLike) => Boolean(beat.audioUrl) && !isNarrationBeat(beat);
  const usable = (i: number) => {
    const f = frames[i];
    if (!f || !f.beat.id || f.beat.gap || f.sceneId === "nw_intro" || f.sceneId === "nw_logo") return false;
    const pic = String(f.picture ?? "");
    return Boolean(pic) && !pic.startsWith("video:") && !pic.startsWith("gradient:");
  };

  // The impact and the step back after it are their own beats; the lock before it is a held moment of its shot.
  const special = new Set<number>();
  const locked = new Set<number>();
  for (let i = 0; i < frames.length; i += 1) {
    if (!usable(i)) continue;
    const beat = frames[i].beat;
    const lastF = clips[i].durationFrames - 1;
    const flat = [key(0, 0, "linear")];
    if (violent.has(i) && lastF >= 6) {
      // Impact settle: the frame jolts in and settles — the witness flinched, then steadied.
      beat.animation = withCamera(beat.animation, {
        zoom: [key(0, 1.05), key(Math.min(6, lastF), 1.005, "ease-out"), key(lastF, 1.005, "linear")],
        x: flat,
        y: flat,
        rotation: flat,
      });
      jolts.add(String(beat.id));
      report.impactBeats += 1;
      special.add(i);
    } else if (violent.has(i + 1) && sameScene(i, i + 1) && !isVoiced(beat)) {
      // Dread: a locked tripod in front of what is about to happen.
      locked.add(i);
    } else if (violent.has(i - 1) && sameScene(i, i - 1) && !isVoiced(beat) && lastF >= 11) {
      // Aftermath: a slow retreat — the witness steps back from it.
      beat.animation = withCamera(beat.animation, { zoom: [key(0, 1.06), key(lastF, 1.0)], x: flat, y: flat, rotation: flat });
      report.pullBacks += 1;
      special.add(i);
    }
  }

  // A beat carries on the shot before it: the same picture, nothing cutting in, the same kind of sequence.
  const joins = (k: number) =>
    usable(k) &&
    usable(k - 1) &&
    !special.has(k) &&
    !special.has(k - 1) &&
    frames[k].picture === frames[k - 1].picture &&
    !frames[k].beat.backgroundTransition &&
    ownRhythm.has(frames[k].sceneId) === ownRhythm.has(frames[k - 1].sceneId);

  let cantFlip = 1;
  let driftFlip = 1;
  let i = 0;
  while (i < frames.length) {
    if (!usable(i) || special.has(i)) {
      i += 1;
      continue;
    }
    let j = i;
    while (joins(j + 1)) j += 1;
    const first = frames[i];
    const members = frames.slice(i, j + 1);
    const film = ownRhythm.has(first.sceneId);
    // A picture that is still up from a sequence cut to music goes on with the film's move.
    const carriesOnFilm = i > 0 && usable(i - 1) && !special.has(i - 1) && frames[i - 1].picture === first.picture && !joins(i);
    // The shot's own time: the locked beats are held out of it (the move stops for them and goes on after).
    const lengths = members.map((_, k) => clips[i + k].durationFrames);
    const moving = lengths.reduce((n, len, k) => n + (locked.has(i + k) ? 0 : len), 0);
    const seconds = moving / FPS;
    const look = looks.get(first.sceneId);
    const cin: AnyRecord = first.beat.cinematic ?? first.cinematic ?? {};
    const mode = String(cin.mode ?? "pan");
    const depth = Boolean(cin.depthMap) && mode !== "dolly";
    const amount = Math.max(0.05, Math.min(1, Number(cin.depthAmount ?? 0.4) || 0.4));
    const cue = members.map((f) => cues.get(String(f.beat.id))).find((c) => c?.focus);
    const [fx, fy] = focalPercent(cue?.focus ?? cin.focalPoint);
    const said = (test: RegExp) => members.some((f) => isVoiced(f.beat) && test.test(String(f.beat.text ?? "")));
    const heavy = said(CONFESS) || said(HEAVY);
    const tense = said(TENSE);
    const silent = members.every((f) => isWitnessNarration(f.beat));
    const observes = silent && members.some((f) => OBSERVE.test(String(f.beat.text ?? "")));
    const endsScene = !sameScene(j, j + 1);
    const opensScene = !sameScene(i, i - 1);
    const lateral = depth ? cin.depthMotion !== "push" : mode === "dolly" || (mode === "pan" && Number(cin.panDistance) > 0);
    const filmGoesLeft = depth ? cin.depthDirection === "left" : mode === "dolly" ? cin.dollyDirection === "left" : cin.panDirection === "left";
    const filmPushes = depth ? cin.depthMotion === "push" : mode === "zoom-hold" || mode === "dolly-zoom";
    const h = hashInt(String(first.beat.id));

    const pushTo = (reach: number, ease: (u: number) => number = (u) => u): ((u: number) => SampledCameraPose) =>
      (u) => zoomAbout(1 + reach * ease(u), fx, fy, depth);
    const driftBy = (dir: number): ((u: number) => SampledCameraPose) => {
      if (depth) {
        const travel = Math.min(amount * 8, Math.max(1, C.depthDrift * seconds));
        return (u) => ({ zoom: 1, x: dir * travel * (u - 0.5), y: 0, rotation: 0 });
      }
      const travel = Math.min(C.driftMax, Math.max(1.2, C.drift * seconds));
      const room = C.driftZoom - 1;
      return (u) => ({
        zoom: C.driftZoom,
        x: (50 - fx) * room * 0.5 + dir * travel * (u - 0.5),
        y: (50 - fy) * room * 0.5,
        rotation: 0,
      });
    };
    const depthReach = (rate: number, most = 1) => Math.min(amount * 0.12 * most, Math.max(0.015, rate * seconds));

    let move: ShotMove | undefined;
    if (carriesOnFilm) {
      move = undefined;
    } else if (moving < C.minMoveFrames) {
      move = film ? undefined : { kind: "hold", pose: () => REST_POSE };
    } else if (cue) {
      const reach = depth ? depthReach(C.cue * 0.6, 1.25) : Math.min(C.cueMax, C.cue * seconds);
      const arrive = (u: number) => (u >= C.cueArrives ? 1 : 1 - (1 - u / C.cueArrives) ** 2);
      move = { kind: "cue", pose: pushTo(reach, arrive), towardFocal: true };
    } else if (heavy) {
      // Confession creep: eye level, no haste.
      const reach = depth ? depthReach(C.depthPush) : Math.max(0.03, Math.min(C.creepMax, C.creep * seconds));
      move = { kind: "creep", pose: pushTo(reach), towardFocal: true };
    } else if (tense && look?.setting !== "daylight") {
      // A restrained cant, under 2°, zoomed past the frame edge.
      const deg = (1.2 + (h % 9) / 10) * cantFlip;
      cantFlip = -cantFlip;
      const cover = Number(Math.max(minZoomForRotation(deg) + 0.02, 1.04).toFixed(4));
      move = { kind: "cant", pose: (u) => ({ zoom: 1 + (cover - 1) * u, x: 0, y: 0, rotation: deg * u }) };
    } else if (observes) {
      // The witness's gaze: a slow lateral drift at a slight standoff.
      const dir = lateral ? (filmGoesLeft ? -1 : 1) : driftFlip;
      driftFlip = -dir;
      move = { kind: "drift", pose: driftBy(dir) };
    } else if (film) {
      move = undefined; // cut to music: the film's own move
    } else if (silent && endsScene && !opensScene && seconds >= 2) {
      // A scene's last silent picture: the witness steps back.
      const reach = depth ? depthReach(C.depthPush) : Math.min(0.08, C.push * seconds);
      move = { kind: "pull-back", pose: pushTo(reach, (u) => 1 - u), towardFocal: true };
    } else if (lateral) {
      const dir = filmGoesLeft ? -1 : 1;
      driftFlip = -dir;
      move = { kind: "drift", pose: driftBy(dir) };
    } else if (filmPushes) {
      const reach = depth ? depthReach(C.depthPush) : Math.max(0.02, Math.min(C.pushMax, C.push * seconds));
      move = { kind: "push", pose: pushTo(reach), towardFocal: true };
    } else {
      move = { kind: "breath", pose: pushTo(Math.min(C.breathMax, C.breath * seconds)) };
    }

    if (move) {
      report.shotMoves[move.kind] += 1;
      if (move.kind === "cue") report.cuePushes += 1;
      else if (move.kind === "creep") report.pushIns += 1;
      else if (move.kind === "drift") report.drifts += 1;
      else if (move.kind === "cant") report.dutchTilts += 1;
      else if (move.kind === "pull-back") report.pullBacks += 1;
      const pose = move.pose;
      let played = 0; // frames of the move already played when this beat begins
      members.forEach((frame, k) => {
        const beat = frame.beat;
        const start = played;
        const held = locked.has(i + k);
        const at = (local: number) => pose(moving <= 1 ? 0 : Math.min(1, (held ? start : start + local) / (moving - 1)));
        beat.animation = pinCamera(
          buildCameraKeyframesFromEvaluator(at, lengths[k], withCamera(beat.animation, {})),
          at(0),
        );
        if (move!.towardFocal && depth && beat.cinematic) {
          beat.cinematic.depthMotion = "push";
          // the re-projection pushes toward the picture's focal point: on a cue, that is where the cue is
          if (move!.kind === "cue" && cue?.focus) beat.cinematic.focalPoint = cue.focus;
        }
        if (!held) played += lengths[k];
      });
    }
    i = j + 1;
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
  const cues = applyNarrationAndCues(story, report);
  const looks = applyLook(story, report);
  applyTransitions(story, looks, cues, report);
  const retimed = applyPacing(story, voiceDurations, looks, cues, report);
  cutOnTheBeat(story, voiceDurations, musicDurations, retimed, report);
  const jolts = applyCamera(story, voiceDurations, looks, cues, report);
  let audioClips = polishAudio(story, voiceDurations, musicDurations, report);
  if (options.mergeSamePictures !== false) {
    audioClips = mergeSamePictureShots(story, audioClips, voiceDurations, jolts, report);
  }
  return {
    project: { ...uncut, story, audioClips, updatedAt: Date.now() },
    report,
  };
}
