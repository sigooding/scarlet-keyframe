import {
  buildAudioClipsFromFilm,
  frameToMs,
  lookupAudioDurationMs,
  MIN_AUDIO_CLIP_MS,
  resolveAudioClips,
  roundMicros,
  type AudioClip,
} from "./audioClips";
import {
  isNarrationBeat,
  normalizeCaptions,
  type BeatCaption,
} from "./captions";
import {
  buildKeyframes,
  runningSceneIds,
  speakerLabel,
  type AnyRecord,
  type BeatAnimation,
  type BeatLike,
  type NoteMarker,
  type ProjectSnapshot,
  type ProjectState,
  type SceneLike,
  type StoryLike,
} from "./model";
import { FPS } from "./timing";
import {
  buildTimelineClips,
  clampPoseToPictureEdges,
  type TimelineClip,
} from "../sequence/animate";

export const DIRECTORS_CUT_VERSION = 4;

export type DirectorsCutId = "neo-noir" | "creative" | "noir-1950s" | "uncut";
type EditorialCutVariant = Exclude<DirectorsCutId, "uncut">;

export interface DirectorsCutOptionMeta {
  id: DirectorsCutId;
  label: string;
  shortLabel: string;
  description: string;
}

export const DIRECTORS_CUT_OPTIONS: readonly DirectorsCutOptionMeta[] = [
  {
    id: "neo-noir",
    label: "Neo-Noir Director’s Cut",
    shortLabel: "Neo-Noir Cut",
    description:
      "Contemporary Tokyo neo-noir & Ozu stillness — cool slate-teal grade, poised tripod holds, and balanced J-cuts.",
  },
  {
    id: "creative",
    label: "Creative Director’s Cut",
    shortLabel: "Creative Cut",
    description:
      "Memory-framed cold open, five chapter movements, sodium bleach-bypass look, kinetic camera & deep pre-lap sound.",
  },
  {
    id: "noir-1950s",
    label: "1950s Noir Director’s Cut",
    shortLabel: "1950s Noir Cut",
    description:
      "High-contrast silver-gelatin B&W, classical studio pacing, optical lap-dissolves, and sparse atmospheric sound.",
  },
  {
    id: "uncut",
    label: "Original Uncut Import",
    shortLabel: "Original Uncut",
    description:
      "Raw 1,584-beat source assembly before editorial consolidation or grading.",
  },
];

export function getDirectorsCutLabel(cutId: DirectorsCutId | undefined): string {
  const found = DIRECTORS_CUT_OPTIONS.find((opt) => opt.id === (cutId ?? "neo-noir"));
  return found ? found.label : "Neo-Noir Director’s Cut";
}

interface CutTitleCard {
  kicker?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "lower-left";
  monochrome?: boolean;
}

const CREATIVE_CHAPTER_CARDS: Record<
  string,
  { marker: string; card: CutTitleCard }
> = {
  nw_s3: {
    marker: "PART I · The Torn Strap",
    card: {
      kicker: "PART I · THREE DAYS LATER",
      title: "THE TORN STRAP",
      subtitle: "Tokyo in the fourth day of rain",
      align: "lower-left",
    },
  },
  nw_s30: {
    marker: "PART II · Twenty Years",
    card: {
      kicker: "PART II · NORTH OF THE CITY",
      title: "TWENTY YEARS OF JANUARIES",
      subtitle: "The road to the inn",
      align: "lower-left",
    },
  },
  nw_s61: {
    marker: "PART III · Nine O’Clock",
    card: {
      kicker: "PART III · UNDER THE EXPRESSWAY",
      title: "NINE O’CLOCK",
      subtitle: "Two detectives in the dark",
      align: "lower-left",
    },
  },
  nw_s77a: {
    marker: "PART IV · The Black Glass",
    card: {
      kicker: "PART IV · BEFORE DAWN",
      title: "THE BLACK GLASS",
      subtitle: "Everyone is allowed one",
      align: "lower-left",
    },
  },
  nw_s98: {
    marker: "PART V · After the Rain",
    card: {
      kicker: "PART V · FIVE DAYS LATER",
      title: "AFTER THE RAIN",
      subtitle: "What the city forgets",
      align: "lower-left",
    },
  },
};

export interface MissingFrameSpec {
  slotNumber: number;
  markerLabel: string;
  sceneId: string;
  sceneTitle: string;
  beatId: string;
  durationFrames: number;
  suggestedPath: string;
  shotSize: string;
  description: string;
  lightingAndMood: string;
}

export const MISSING_FRAME_SPECS: readonly MissingFrameSpec[] = [
  {
    slotNumber: 1,
    markerLabel: "GAP 01 · S12 Coin",
    sceneId: "nw_s12",
    sceneTitle: "12 — The strap",
    beatId: "nw_b307",
    durationFrames: 76,
    suggestedPath: "/film/img/s12/307-vending-coffee-can.jpg",
    shotSize: "Close-up insert",
    description:
      "Rain-beaded corner vending machine at night; Jack's wet hand feeds a 100-yen coin into the slot as a steel can of hot coffee drops into the lit pickup tray.",
    lightingAndMood:
      "Cold fluorescent vending glow against wet dark asphalt, selective warm amber button accent, shallow depth of field (tokyo-noir).",
  },
  {
    slotNumber: 2,
    markerLabel: "GAP 02 · S12 Shutter",
    sceneId: "nw_s12",
    sceneTitle: "12 — The strap",
    beatId: "nw_b325",
    durationFrames: 64,
    suggestedPath: "/film/img/s12/325-barber-shutter-closing.jpg",
    shotSize: "Low-angle medium shot",
    description:
      "Looking up from the wet backstreet toward the second-floor barbershop window as the elderly barber in pajamas shrugs and pulls the corrugated metal shutter rattling shut.",
    lightingAndMood:
      "Dim tungsten interior light narrowing to a slit behind wet slate-blue steel shutter, steady vertical rain.",
  },
  {
    slotNumber: 3,
    markerLabel: "GAP 03 · 77A Avenue",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1290",
    durationFrames: 102,
    suggestedPath: "/film/img/s77a/1290-predawn-avenue.jpg",
    shotSize: "Wide Ozu low-angle establishing shot",
    description:
      "Before dawn on a wide Tokyo financial avenue of shuttered banks and dark glass lobbies; white streetlamps receding in a straight geometric row over rain-slicked black asphalt as Jack walks alone with the envelope inside his coat.",
    lightingAndMood:
      "Cold pre-dawn steel-blue ambient light, crisp white streetlamp pools reflected in wet asphalt, deep shadows, composed stillness.",
  },
  {
    slotNumber: 4,
    markerLabel: "GAP 04 · 77A Sedan",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1293",
    durationFrames: 84,
    suggestedPath: "/film/img/s77a/1293-sedan-keeps-pace.jpg",
    shotSize: "Medium-long telephoto shot",
    description:
      "Jack walking along the wet curb without looking back while twin headlights of a long black luxury sedan creep slowly up through the rain behind him, matching his pace.",
    lightingAndMood:
      "Halation bloom from twin low-beam headlights in wet mist, dark silhouette of sedan bodywork, desaturated slate shadows.",
  },
  {
    slotNumber: 5,
    markerLabel: "GAP 05 · 77A Window",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1294",
    durationFrames: 78,
    suggestedPath: "/film/img/s77a/1294-hand-and-watch-on-sill.jpg",
    shotSize: "Tight neo-noir insert",
    description:
      "Rain-beaded black rear window of the sedan lowered halfway; the back seat remains pitch-dark except for Kurose's clean hand resting on the wet sill, wearing the distinctive dress watch from the plaza architectural model.",
    lightingAndMood:
      "Chiaroscuro shadow hiding Kurose's face completely; cold streetlamp glint catching the watch bezel and raindrops on dark glass.",
  },
  {
    slotNumber: 6,
    markerLabel: "GAP 06 · 77A Exchange",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1296",
    durationFrames: 424,
    suggestedPath: "/film/img/s77a/1296-everyone-is-allowed-one.jpg",
    shotSize: "Medium tracking two-plane composition",
    description:
      "Side profile of Jack walking steadily in the rain, soaked coat collar up, right hand tucked inside his jacket gripping Daniel's envelope, framed beside the dark open rear window of Kurose's pacing sedan.",
    lightingAndMood:
      "Deep shadow interior in foreground edge, cold wet cyan-slate street reflections across Jack's weathered face, restrained contrast.",
  },
  {
    slotNumber: 7,
    markerLabel: "GAP 07 · 77A Glass",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1303",
    durationFrames: 78,
    suggestedPath: "/film/img/s77a/1303-reflection-in-black-glass.jpg",
    shotSize: "Extreme close-up",
    description:
      "The tinted black rear window smoothly rises shut; in the wet dark glass, Kurose disappears completely and Jack sees only his own rain-streaked reflection.",
    lightingAndMood:
      "Specular raindrops and ghosted reflection of Jack's eyes in glossy black glass, deep crushed blacks.",
  },
  {
    slotNumber: 8,
    markerLabel: "GAP 08 · 77A Taillights",
    sceneId: "nw_s77a",
    sceneTitle: "77 — The black glass",
    beatId: "nw_b1304",
    durationFrames: 108,
    suggestedPath: "/film/img/s77a/1304-sedan-turns-off.jpg",
    shotSize: "Wide locked Ozu tail shot",
    description:
      "Jack stands motionless in the rain in left foreground back-three-quarter view as the black sedan pulls unhurriedly ahead down the empty avenue, red taillights bleeding into wet asphalt before turning off.",
    lightingAndMood:
      "Selective crimson taillight accent in desaturated steel-blue pre-dawn rain, poised architectural framing.",
  },
  {
    slotNumber: 9,
    markerLabel: "GAP 09 · S78 Door",
    sceneId: "nw_s78",
    sceneTitle: "78 — No name",
    beatId: "nw_b1309",
    durationFrames: 78,
    suggestedPath: "/film/img/s78/1309-vera-opens-door-dawn.jpg",
    shotSize: "Medium doorway shot",
    description:
      "Vera opens her apartment door into the grey rainy third-floor walkway, still wearing last night's dark dress, sleepless and pale, just as her gaze drops toward the doormat.",
    lightingAndMood:
      "Soft grey overcast dawn light from the open walkway meeting dim warm interior shadow, quiet Ozu domestic stillness.",
  },
];

const EXPLICIT_GAP_BEAT_IDS = new Set(MISSING_FRAME_SPECS.map((s) => s.beatId));

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function hashInt(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function parseFocalOffset(focal: unknown): { fx: number; fy: number } {
  if (typeof focal !== "string") return { fx: 50, fy: 50 };
  const m = /([\d.]+)%\s+([\d.]+)%/.exec(focal);
  if (!m) return { fx: 50, fy: 50 };
  return {
    fx: Math.max(15, Math.min(85, Number(m[1]) || 50)),
    fy: Math.max(15, Math.min(85, Number(m[2]) || 50)),
  };
}

function classifyScenePace(sceneId: string): "action" | "contemplative" | "noir" {
  if (
    sceneId.includes("cut_inn-raid") ||
    sceneId.includes("song_raid") ||
    sceneId === "nw_s14a" ||
    /^nw_s(39|40|41|42|43|44|45|88|89|90)\b/.test(sceneId)
  ) {
    return "action";
  }
  if (
    sceneId === "nw_prologue" ||
    sceneId === "nw_title" ||
    sceneId === "nw_m18" ||
    sceneId === "nw_m53" ||
    sceneId === "nw_credits" ||
    sceneId === "nw_end" ||
    sceneId.includes("song_service") ||
    /^nw_s(3|15|16|19|28|30|34|59|78|98|99a|100)$/.test(sceneId)
  ) {
    return "contemplative";
  }
  return "noir";
}

/**
 * Determines whether a silent narrator beat carries indispensable written/plot information
 * that cannot be deduced from the image, voice, or foley alone.
 * Returns:
 * - `{ kind: "title", card }` for theatrical timecards (`THREE DAYS LATER`, etc.)
 * - `{ kind: "caption", text }` for essential written inserts/clues (`THE SCRAP`, `THE LETTER`, etc.)
 * - `{ kind: "suppress" }` for redundant stage directions ("She declines it.", "A small beat.", etc.)
 */
function classifySilentNarratorText(
  sceneId: string,
  beatId: string,
  rawText: string,
):
  | { kind: "title"; card: { kicker?: string; title: string; subtitle?: string } }
  | { kind: "caption"; text: string }
  | { kind: "suppress" } {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed === "·") return { kind: "suppress" };

  // Redundant card right before nw_title
  if (beatId === "nw_b70" || trimmed === "MAIN TITLES") {
    return { kind: "suppress" };
  }
  // Redundant location headers where visual cross-cut + ringing phone already tells the story
  if (beatId === "nw_b971" || beatId === "nw_b975" || beatId === "nw_b89") {
    return { kind: "suppress" };
  }

  // Pure theatrical time-jump intertitles (Ozu / classic noir)
  if (trimmed === "THREE DAYS LATER") {
    return { kind: "title", card: { title: "THREE DAYS LATER" } };
  }
  if (trimmed === "FIVE DAYS LATER") {
    return { kind: "title", card: { title: "FIVE DAYS LATER" } };
  }
  if (sceneId === "nw_s99a" && /^Weeks later\.?$/i.test(trimmed)) {
    return { kind: "title", card: { title: "WEEKS LATER" } };
  }

  // Explicit named written inserts / crucial unspoken plot reveals
  if (beatId === "nw_b13") {
    return {
      kind: "caption",
      text: "1.00 Sakai — “just listen.”",
    };
  }
  if (beatId === "nw_b189") {
    return {
      kind: "caption",
      text: "Inside the drawer: Mara’s purse and the torn strap, sealed together.",
    };
  }
  if (beatId === "nw_b283") {
    return {
      kind: "caption",
      text: "“AMERICAN INSURANCE INVESTIGATOR FOUND DEAD — POLICE RULE SUICIDE.”",
    };
  }
  if (beatId === "nw_b483") {
    return {
      kind: "caption",
      text: "“Miss Voss. Your father did not kill himself. I have kept his papers for twenty years.”",
    };
  }
  if (beatId === "nw_b1313" || trimmed === "DANIEL VOSS.") {
    return {
      kind: "caption",
      text: "DANIEL VOSS.",
    };
  }

  // Keep concise written text if a silent beat quotes a written note, sign, label, or voicemail message
  // (excluding Mara's funeral service / raid action descriptions)
  if (!sceneId.includes("song_") && !sceneId.includes("cut_")) {
    const quoteMatch = /"([^"]{6,120})"/.exec(trimmed);
    if (
      quoteMatch &&
      /\b(note|letter|headline|paper|card|written|reads|wrote|message|tag|label|envelope|ledger|file|stamped|screen)\b/i.test(
        trimmed,
      )
    ) {
      return {
        kind: "caption",
        text: `“${quoteMatch[1].trim()}”`,
      };
    }
  }

  return { kind: "suppress" };
}

/**
 * Synthesizes real playable shots for the 7 scenes in `nobodys-witness-film.json`
 * that originally had `dialogueBeats: []` (`nw_intro`, `nw_logo`, `nw_title`,
 * `nw_m18`, `nw_m53`, `nw_credits`, `nw_end`).
 */
function populateZeroBeatScenes(
  story: StoryLike,
  variant: EditorialCutVariant = "neo-noir",
): void {
  const is1950s = variant === "noir-1950s";
  const isCreative = variant === "creative";

  for (const scene of story.scenes) {
    if (scene.dialogueBeats && scene.dialogueBeats.length > 0) continue;

    if (scene.id === "nw_intro") {
      scene.dialogueBeats = [
        {
          id: "nw_dc_intro_1",
          characterId: "nw_narrator",
          text: "Black Cove",
          silent: true,
          background: String(scene.background || "video:/film/video/black-cove.mp4"),
          durationFrames: Math.round(7.9 * FPS),
          captions: [],
          ...(is1950s
            ? {
                cinematic: {
                  mode: "static",
                  colorGrade: "noir-1950s",
                  filmGrade: false,
                  vignette: true,
                  vignetteStrength: 0.48,
                  grain: true,
                  grainOpacity: 0.068,
                },
                animation: { values: { gradeStrength: 1 } },
              }
            : {}),
        },
      ];
    } else if (scene.id === "nw_logo") {
      scene.dialogueBeats = [
        {
          id: "nw_dc_logo_1",
          characterId: "nw_narrator",
          text: "Scarlet Reel",
          silent: true,
          background: String(scene.background || "video:/film/video/scarlet-reel-logo.mp4"),
          durationFrames: Math.round(9.9 * FPS),
          captions: [],
          ...(is1950s
            ? {
                cinematic: {
                  mode: "static",
                  colorGrade: "noir-1950s",
                  filmGrade: false,
                  vignette: true,
                  vignetteStrength: 0.48,
                  grain: true,
                  grainOpacity: 0.068,
                },
                animation: { values: { gradeStrength: 1 } },
              }
            : {}),
        },
      ];
    } else if (scene.id === "nw_title") {
      const credits = (scene.credits || {}) as AnyRecord;
      const sliceCount = isCreative ? 10 : 8;
      const montage: string[] = Array.isArray(credits.montage)
        ? credits.montage.slice(0, sliceCount)
        : [String(scene.background || "/film/img/montage/m4-railway-rain.jpg")];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;

      const cards: Array<CutTitleCard | undefined> = isCreative
        ? [
            {
              kicker: "A MEMORY IN FIVE MOVEMENTS",
              title: "NOBODY’S WITNESS",
              subtitle: "Tokyo, before the rain stopped",
              align: "lower-left",
            },
            undefined,
            {
              kicker: "WRITTEN & DIRECTED BY",
              title: "Scott Gooding",
              align: "lower-left",
            },
            undefined,
            {
              kicker: "STARRING",
              title: "Jack  ·  Vera  ·  Mara",
              align: "lower-left",
            },
            {
              kicker: "FEATURING",
              title: "Ishida  ·  Kaneko  ·  Kurose  ·  Harada",
              align: "lower-left",
            },
            undefined,
            {
              kicker: "ORIGINAL SCORE",
              title: "Scott Gooding",
              align: "lower-left",
            },
            undefined,
            undefined,
          ]
        : is1950s
          ? [
              undefined,
              {
                kicker: "A SCARLET REEL PICTURE",
                title: "NOBODY’S WITNESS",
                subtitle: "A Tokyo Nocturne",
                monochrome: true,
              },
              undefined,
              {
                kicker: "SCREENPLAY & DIRECTION",
                title: "Scott Gooding",
                monochrome: true,
              },
              {
                kicker: "STARRING",
                title: "Jack  ·  Vera  ·  Mara",
                subtitle: "with Ishida  ·  Kaneko  ·  Kurose",
                monochrome: true,
              },
              undefined,
              {
                kicker: "MUSICAL SCORE",
                title: "Scott Gooding",
                monochrome: true,
              },
              undefined,
            ]
          : [
              undefined,
              {
                title: "NOBODY’S WITNESS",
                subtitle: "Tokyo in the rain",
              },
              undefined,
              {
                kicker: "WRITTEN & DIRECTED BY",
                title: "Scott Gooding",
              },
              {
                kicker: "STARRING",
                title: "Jack  ·  Vera  ·  Mara",
              },
              undefined,
              {
                kicker: "ORIGINAL SCORE",
                title: "Scott Gooding",
              },
              undefined,
            ];

      const plateDur = isCreative ? 104 : is1950s ? 152 : 132;
      const dissolveSpeed = isCreative ? 1.05 : is1950s ? 0.68 : 0.85;

      scene.dialogueBeats = montage.map((pic, idx) => {
        const look = looks[pic] ? clone(looks[pic]) : {};
        return {
          id: `nw_dc_title_${idx + 1}`,
          characterId: "nw_narrator",
          text: cards[idx]?.title || `Opening montage ${idx + 1}`,
          silent: true,
          background: pic,
          cinematic: look,
          durationFrames: plateDur,
          captions: [],
          ...(idx === 0
            ? {
                backgroundTransition: "dip-to-black",
                backgroundTransitionSpeed: is1950s ? 0.72 : 1.0,
                transitionAlignment: "at-cut",
              }
            : {
                backgroundTransition: "dissolve",
                backgroundTransitionSpeed: dissolveSpeed,
                transitionAlignment: "at-cut",
              }),
          ...(cards[idx] ? { titleCard: cards[idx] } : {}),
        };
      });
    } else if (scene.id === "nw_m18" || scene.id === "nw_m53") {
      const credits = (scene.credits || {}) as AnyRecord;
      const montage: string[] = Array.isArray(credits.montage) ? credits.montage : [];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;
      const durF = isCreative ? 96 : is1950s ? 132 : 112;
      const transSpeed = isCreative ? 0.95 : is1950s ? 0.68 : 0.8;
      scene.dialogueBeats = montage.map((pic, idx) => ({
        id: `nw_dc_${scene.id}_${idx + 1}`,
        characterId: "nw_narrator",
        text: `${scene.title || scene.id} (${idx + 1})`,
        silent: true,
        background: pic,
        cinematic: looks[pic] ? clone(looks[pic]) : {},
        durationFrames: durF,
        captions: [],
        backgroundTransition: "dissolve",
        backgroundTransitionSpeed: transSpeed,
        transitionAlignment: "at-cut",
      }));
    } else if (scene.id === "nw_credits") {
      const credits = (scene.credits || {}) as AnyRecord;
      const montage: string[] = Array.isArray(credits.montage)
        ? credits.montage.slice(0, 10)
        : [String(scene.background || "/film/img/s1/377-the-hive-remembered.jpg")];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;
      const creditCards: Array<CutTitleCard> = is1950s
        ? [
            {
              kicker: "NOBODY’S WITNESS",
              title: "CAST OF CHARACTERS",
              subtitle: "Tokyo as a memory that is still happening.",
              monochrome: true,
            },
            { kicker: "WRITTEN & DIRECTED BY", title: "Scott Gooding", monochrome: true },
            {
              kicker: "THE PLAYERS",
              title: "Jack  ·  Vera  ·  Mara",
              subtitle: "Ishida  ·  Kaneko  ·  Okada",
              monochrome: true,
            },
            {
              kicker: "THE PLAYERS",
              title: "Harada  ·  Kurose  ·  Daniel",
              subtitle: "Mrs. Sakai  ·  Mr. & Mrs. Noda",
              monochrome: true,
            },
            { kicker: "MUSICAL SCORE", title: "Scott Gooding", monochrome: true },
          ]
        : isCreative
          ? [
              {
                title: "NOBODY’S WITNESS",
                subtitle: "Tokyo as a memory that is still happening.",
                align: "lower-left",
              },
              { kicker: "WRITTEN & DIRECTED BY", title: "Scott Gooding", align: "lower-left" },
              {
                kicker: "CAST",
                title: "Jack  ·  Vera  ·  Mara",
                subtitle: "Ishida  ·  Kaneko  ·  Okada",
                align: "lower-left",
              },
              {
                kicker: "CAST",
                title: "Harada  ·  Kurose  ·  Daniel",
                subtitle: "Mrs. Sakai  ·  Mr. & Mrs. Noda",
                align: "lower-left",
              },
              { kicker: "ORIGINAL MUSIC", title: "Scott Gooding", align: "lower-left" },
            ]
          : [
              { title: "NOBODY’S WITNESS", subtitle: "Tokyo as a memory that is still happening." },
              { kicker: "WRITTEN BY", title: "Scott Gooding" },
              {
                kicker: "CAST",
                title: "Jack  ·  Vera  ·  Mara",
                subtitle: "Ishida  ·  Kaneko  ·  Okada",
              },
              {
                kicker: "CAST",
                title: "Harada  ·  Kurose  ·  Daniel",
                subtitle: "Mrs. Sakai  ·  Mr. & Mrs. Noda",
              },
              { kicker: "ORIGINAL MUSIC", title: "Scott Gooding" },
            ];
      const durF = isCreative ? 114 : is1950s ? 140 : 126;
      scene.dialogueBeats = montage.map((pic, idx) => {
        const card = idx < creditCards.length ? creditCards[idx] : undefined;
        return {
          id: `nw_dc_credits_${idx + 1}`,
          characterId: "nw_narrator",
          text: card ? `${card.kicker ? `${card.kicker}: ` : ""}${card.title}` : `Closing montage ${idx + 1}`,
          silent: true,
          background: pic,
          cinematic: looks[pic] ? clone(looks[pic]) : {},
          durationFrames: durF,
          captions: [],
          backgroundTransition: idx === 0 ? "dip-to-black" : "dissolve",
          backgroundTransitionSpeed: is1950s ? 0.72 : 0.9,
          transitionAlignment: "at-cut",
          ...(card ? { titleCard: card } : {}),
        };
      });
    } else if (scene.id === "nw_end") {
      const endDur = is1950s ? 180 : isCreative ? 168 : 156;
      const holdUntil = is1950s ? 124 : isCreative ? 120 : 112;
      scene.dialogueBeats = [
        {
          id: "nw_dc_end_1",
          characterId: "nw_narrator",
          text: "NOBODY'S WITNESS — Tokyo as a memory that is still happening.",
          silent: true,
          background: String(scene.background || "/film/img/s1/377-the-hive-remembered.jpg"),
          durationFrames: endDur,
          captions: [],
          backgroundTransition: "dissolve",
          backgroundTransitionSpeed: is1950s ? 0.72 : 1.0,
          transitionAlignment: "at-cut",
          titleCard: is1950s
            ? {
                kicker: "NOBODY’S WITNESS",
                title: "THE END",
                subtitle: "Tokyo, in memory",
                monochrome: true,
              }
            : isCreative
              ? {
                  kicker: "EPILOGUE",
                  title: "NOBODY’S WITNESS",
                  subtitle: "Tokyo as a memory that is still happening.",
                  align: "lower-left",
                }
              : {
                  title: "NOBODY’S WITNESS",
                  subtitle: "Tokyo as a memory that is still happening.",
                },
          cinematic: is1950s
            ? {
                mode: "static",
                colorGrade: "noir-1950s",
                vignette: true,
                vignetteStrength: 0.54,
                grain: true,
                grainOpacity: 0.068,
                filmGrade: false,
              }
            : isCreative
              ? {
                  mode: "static",
                  colorGrade: "sodium-amber",
                  vignette: true,
                  vignetteStrength: 0.46,
                  grain: true,
                  grainOpacity: 0.056,
                  filmGrade: false,
                }
              : {
                  colorGrade: "tokyo-noir",
                  vignette: true,
                  vignetteStrength: 0.42,
                  filmGrain: true,
                  grainOpacity: 0.042,
                  filmGrade: false,
                },
          animation: {
            opacity: [
              { frame: 0, value: 1, easing: "linear" },
              { frame: holdUntil, value: 1, easing: "ease-in-out" },
              { frame: endDur - 1, value: 0, easing: "linear" },
            ],
            ...(is1950s ? { values: { gradeStrength: 1 } } : {}),
          },
        },
      ];
    }
  }
}

/**
 * Restructures Scene 77A ("77 — The black glass") from 16 unpictured `gradient:#000` beats
 * into 6 composed cinematic gap slots (`GAP 03`..`GAP 08`), preserving all 6 Kurose/Jack
 * dialogue lines with clean pacing while keeping `beat.text` untouched on every kept beat.
 */
function structureScene77AGaps(
  scene: SceneLike,
  variant: EditorialCutVariant = "neo-noir",
): void {
  const beats = scene.dialogueBeats ?? [];
  if (beats.length < 16) return;
  const byId = new Map(beats.map((b) => [String(b.id), b]));

  const g1 = byId.get("nw_b1290");
  const g2 = byId.get("nw_b1293");
  const g3 = byId.get("nw_b1294");
  const g4 = byId.get("nw_b1296");
  const g5 = byId.get("nw_b1303");
  const g6 = byId.get("nw_b1304");
  const lastOrig = beats[beats.length - 1];
  if (!g1 || !g2 || !g3 || !g4 || !g5 || !g6) return;

  // Transfer end-of-scene routing metadata onto g6 so scene 77A still chains cleanly into 78
  for (const key of [
    "afterBeatMode",
    "afterBeatTargetSceneId",
    "afterBeatSceneId",
    "afterBeatDelaySeconds",
    "nextSceneId",
  ]) {
    if (lastOrig[key] !== undefined) {
      g6[key] = lastOrig[key];
    }
  }

  delete scene.background;

  const configurePlate = (
    beat: BeatLike,
    picture: string,
    frames: number,
    caps: BeatCaption[],
  ) => {
    delete beat.gap;
    beat.background = picture;
    beat.durationFrames = frames;
    beat.captions = caps;
    delete beat.cinematic;
    delete beat.animation;
    delete beat.backgroundTransition;
    delete beat.backgroundTransitionSpeed;
    delete (beat as AnyRecord).titleCard;
  };

  const isCreative = variant === "creative";
  const is1950s = variant === "noir-1950s";

  configurePlate(
    g1,
    "/film/img/s77a/1290-predawn-avenue.jpg",
    isCreative ? 116 : is1950s ? 120 : 102,
    [],
  );
  if (isCreative) {
    (g1 as AnyRecord).titleCard = CREATIVE_CHAPTER_CARDS.nw_s77a.card;
  }

  configurePlate(
    g2,
    "/film/img/s77a/1293-sedan-keeps-pace.jpg",
    isCreative ? 76 : is1950s ? 98 : 84,
    [],
  );
  configurePlate(
    g3,
    "/film/img/s77a/1294-hand-and-watch-on-sill.jpg",
    isCreative ? 72 : is1950s ? 92 : 78,
    [],
  );

  // 6 spoken/silent-acted lines between Kurose and Jack (<16 c/s on every cue)
  configurePlate(
    g4,
    "/film/img/s77a/1296-everyone-is-allowed-one.jpg",
    isCreative ? 448 : is1950s ? 468 : 424,
    [
      { text: "Detective.", inFrame: 8, outFrame: 44, speaker: "KUROSE", isNarration: false },
      { text: "Not any more.", inFrame: 52, outFrame: 92, speaker: "JACK", isNarration: false },
      {
        text: "No. I was sorry to hear about the girl.",
        inFrame: 104,
        outFrame: 180,
        speaker: "KUROSE",
        isNarration: false,
      },
      {
        text: "You were a sensible policeman, I'm told. You always knew when to stop.",
        inFrame: 194,
        outFrame: 310,
        speaker: "KUROSE",
        isNarration: false,
      },
      {
        text: "Maybe that was a mistake.",
        inFrame: 320,
        outFrame: 368,
        speaker: "JACK",
        isNarration: false,
      },
      {
        text: "Everyone is allowed one.",
        inFrame: 376,
        outFrame: 420,
        speaker: "KUROSE",
        isNarration: false,
      },
    ],
  );

  configurePlate(
    g5,
    "/film/img/s77a/1303-reflection-in-black-glass.jpg",
    isCreative ? 84 : is1950s ? 96 : 78,
    [],
  );
  configurePlate(
    g6,
    "/film/img/s77a/1304-sedan-turns-off.jpg",
    isCreative ? 124 : is1950s ? 132 : 108,
    [],
  );

  scene.dialogueBeats = [g1, g2, g3, g4, g5, g6];
}

/**
 * Computes single-camera keyframe framing & optical grade for a consolidated shot
 * according to the active editorial cut (`"neo-noir"`, `"creative"`, or `"noir-1950s"`).
 */
function authorNeoNoirCamera(
  beat: BeatLike,
  sceneId: string,
  shotIndexInScene: number,
  durationFrames: number,
  pace: "action" | "contemplative" | "noir",
  variant: EditorialCutVariant = "neo-noir",
): void {
  if (beat.gap || sceneId === "nw_intro" || sceneId === "nw_logo") return;
  if (sceneId === "nw_end" && beat.animation?.opacity) return;

  const cin: AnyRecord = clone(beat.cinematic || {});
  const hasDepth = Boolean(cin.depthMap);
  const { fx, fy } = parseFocalOffset(cin.focalPoint);
  const h = hashInt(`${sceneId}:${beat.id}:${shotIndexInScene}`);

  // Strip legacy Scarlet Reel auto-camera motion so keyframes are the single camera source
  cin.mode = "static";
  delete cin.shakeAmount;

  if (variant === "noir-1950s") {
    // Authentic 1950s Silver-Gelatin Monochrome: high-contrast B&W, rich Tri-X grain,
    // deep spherical lens falloff, zero modern speed ramps, and no colored light tints.
    cin.colorGrade = "noir-1950s";
    cin.filmGrade = false;
    cin.vignette = true;
    cin.vignetteStrength =
      pace === "action" ? 0.55 : pace === "contemplative" ? 0.48 : 0.52;
    cin.grain = true;
    cin.grainOpacity = 0.068;
    delete cin.speedRamp;
    delete cin.lights;
    delete cin.lightSource;
    delete cin.lightColor;
    delete cin.lensFlare;
    delete cin.flares;
    beat.cinematic = cin;

    const lastF = Math.max(1, durationFrames - 1);
    const baseBiasX = Math.max(-1.4, Math.min(1.4, (50 - fx) * 0.045));
    const baseBiasY = Math.max(-1.0, Math.min(1.0, (50 - fy) * 0.035));

    // Classical 1950s studio grammar: ~76% poised tripod compositions; ~24% stately dolly pushes
    const shouldMove = durationFrames >= 104 && h % 10 < 3;
    if (!shouldMove) {
      if (Math.abs(baseBiasX) > 0.35 || Math.abs(baseBiasY) > 0.35) {
        const stillPose = clampPoseToPictureEdges({
          zoom: 1.034,
          x: baseBiasX,
          y: baseBiasY,
          rotation: 0,
        });
        beat.animation = {
          values: {
            zoom: Number(stillPose.zoom.toFixed(4)),
            x: Number((stillPose.x * 0.96).toFixed(3)),
            y: Number((stillPose.y * 0.96).toFixed(3)),
            gradeStrength: 1,
            ...(hasDepth ? { depthAmount: 0.16 } : {}),
          },
        };
      } else {
        beat.animation = {
          values: {
            gradeStrength: 1,
            ...(hasDepth ? { depthAmount: 0.14 } : {}),
          },
        };
      }
      return;
    }

    const z0 = 1.012;
    const z1 = 1.044;
    const rawP0 = clampPoseToPictureEdges({ zoom: z0, x: baseBiasX, y: baseBiasY, rotation: 0 });
    const rawP1 = clampPoseToPictureEdges({ zoom: z1, x: baseBiasX, y: baseBiasY, rotation: 0 });
    const p0 = { zoom: rawP0.zoom, x: rawP0.x * 0.96, y: rawP0.y * 0.96 };
    const p1 = { zoom: rawP1.zoom, x: rawP1.x * 0.96, y: rawP1.y * 0.96 };

    beat.animation = {
      zoom: [
        { frame: 0, value: Number(p0.zoom.toFixed(4)), easing: "ease-in-out" },
        { frame: lastF, value: Number(p1.zoom.toFixed(4)), easing: "linear" },
      ],
      ...(Math.abs(p0.x) > 0.05
        ? {
            x: [
              { frame: 0, value: Number(p0.x.toFixed(3)), easing: "ease-in-out" },
              { frame: lastF, value: Number(p1.x.toFixed(3)), easing: "linear" },
            ],
          }
        : {}),
      ...(Math.abs(p0.y) > 0.05
        ? {
            y: [
              { frame: 0, value: Number(p0.y.toFixed(3)), easing: "ease-in-out" },
              { frame: lastF, value: Number(p1.y.toFixed(3)), easing: "linear" },
            ],
          }
        : {}),
      ...(hasDepth
        ? {
            depthAmount: [
              { frame: 0, value: 0.16, easing: "ease-in-out" },
              { frame: lastF, value: 0.26, easing: "linear" },
            ],
          }
        : {}),
      values: { gradeStrength: 1 },
    };
    return;
  }

  if (variant === "creative") {
    // Creative Director's Cut: Sodium-Amber & Emerald Bleach-Bypass grade + expressive thriller camera
    cin.colorGrade = "sodium-amber";
    cin.filmGrade = false;
    cin.vignette = true;
    cin.vignetteStrength =
      pace === "action" ? 0.48 : pace === "contemplative" ? 0.40 : 0.44;
    cin.grain = true;
    cin.grainOpacity = 0.056;

    if (pace === "action" && beat.sfxUrl && /smg|shot|shatter|forced|crash|smash/i.test(String(beat.sfxUrl))) {
      cin.speedRamp = "impact-ramp";
    } else if (durationFrames >= 108 && h % 5 === 0) {
      cin.speedRamp = "ease-hold";
    } else if (durationFrames >= 92 && h % 6 === 1) {
      cin.speedRamp = "slow-out";
    } else {
      delete cin.speedRamp;
    }

    beat.cinematic = cin;

    const lastF = Math.max(1, durationFrames - 1);
    const baseBiasX = Math.max(-1.8, Math.min(1.8, (50 - fx) * 0.055));
    const baseBiasY = Math.max(-1.3, Math.min(1.3, (50 - fy) * 0.045));
    const gradeVal = pace === "contemplative" ? 0.88 : 0.92;

    // Expressive thriller choreography (~70% purposeful single-camera motion, ~30% taut holds)
    const shouldMove =
      pace === "action"
        ? durationFrames >= 34 && h % 3 !== 0
        : durationFrames >= 60 && h % 10 < 7;

    if (!shouldMove) {
      if (Math.abs(baseBiasX) > 0.32 || Math.abs(baseBiasY) > 0.32) {
        const stillPose = clampPoseToPictureEdges({
          zoom: 1.042,
          x: baseBiasX,
          y: baseBiasY,
          rotation: 0,
        });
        beat.animation = {
          values: {
            zoom: Number(stillPose.zoom.toFixed(4)),
            x: Number((stillPose.x * 0.96).toFixed(3)),
            y: Number((stillPose.y * 0.96).toFixed(3)),
            gradeStrength: gradeVal,
            ...(hasDepth ? { depthAmount: 0.26 } : {}),
          },
        };
      } else {
        beat.animation = {
          values: {
            gradeStrength: gradeVal,
            ...(hasDepth ? { depthAmount: 0.24 } : {}),
          },
        };
      }
      return;
    }

    const moveVariant = h % 5;
    let z0 = 1.016;
    let z1 = 1.066;
    let x0 = baseBiasX;
    let x1 = baseBiasX;
    let y0 = baseBiasY;
    let y1 = baseBiasY;

    if (moveVariant === 1) {
      // Slow pull-back environmental reveal
      z0 = 1.064;
      z1 = 1.014;
    } else if (moveVariant === 2) {
      // Creeping lateral tracking drift left-to-right
      z0 = 1.048;
      z1 = 1.058;
      x0 = baseBiasX - 1.25;
      x1 = baseBiasX + 1.25;
    } else if (moveVariant === 3) {
      // Creeping lateral tracking drift right-to-left
      z0 = 1.048;
      z1 = 1.058;
      x0 = baseBiasX + 1.25;
      x1 = baseBiasX - 1.25;
    } else if (moveVariant === 4) {
      // Subtle diagonal push toward subject
      z0 = 1.022;
      z1 = 1.064;
      x0 = baseBiasX * 0.5;
      x1 = baseBiasX;
      y0 = baseBiasY * 0.5;
      y1 = baseBiasY;
    }

    const rawP0 = clampPoseToPictureEdges({ zoom: z0, x: x0, y: y0, rotation: 0 });
    const rawP1 = clampPoseToPictureEdges({ zoom: z1, x: x1, y: y1, rotation: 0 });
    const p0 = { zoom: rawP0.zoom, x: rawP0.x * 0.96, y: rawP0.y * 0.96 };
    const p1 = { zoom: rawP1.zoom, x: rawP1.x * 0.96, y: rawP1.y * 0.96 };

    beat.animation = {
      zoom: [
        {
          frame: 0,
          value: Number(p0.zoom.toFixed(4)),
          easing: "bezier",
          bezier: [0.25, 0.1, 0.2, 1],
        },
        { frame: lastF, value: Number(p1.zoom.toFixed(4)), easing: "linear" },
      ],
      ...(Math.abs(p0.x - p1.x) > 0.05 || Math.abs(p0.x) > 0.05
        ? {
            x: [
              {
                frame: 0,
                value: Number(p0.x.toFixed(3)),
                easing: "bezier",
                bezier: [0.25, 0.1, 0.2, 1],
              },
              { frame: lastF, value: Number(p1.x.toFixed(3)), easing: "linear" },
            ],
          }
        : {}),
      ...(Math.abs(p0.y - p1.y) > 0.05 || Math.abs(p0.y) > 0.05
        ? {
            y: [
              {
                frame: 0,
                value: Number(p0.y.toFixed(3)),
                easing: "bezier",
                bezier: [0.25, 0.1, 0.2, 1],
              },
              { frame: lastF, value: Number(p1.y.toFixed(3)), easing: "linear" },
            ],
          }
        : {}),
      ...(hasDepth
        ? {
            depthAmount: [
              { frame: 0, value: 0.26, easing: "ease-in-out" },
              { frame: lastF, value: 0.42, easing: "linear" },
            ],
          }
        : {}),
      values: { gradeStrength: gradeVal },
    };
    return;
  }

  // Consistent signature Tokyo Neo-Noir visual language across all scenes ("neo-noir")
  cin.colorGrade = "tokyo-noir";
  cin.filmGrade = false;
  cin.vignette = true;
  cin.vignetteStrength =
    pace === "action" ? 0.42 : pace === "contemplative" ? 0.31 : 0.35;
  cin.grain = true;
  cin.grainOpacity = 0.042;

  // Subtle deterministic speed ramps only where story action or revelation calls for it
  if (pace === "action" && beat.sfxUrl && /smg|shot|shatter|forced|crash|smash/i.test(String(beat.sfxUrl))) {
    cin.speedRamp = "impact-ramp";
  } else if (durationFrames >= 120 && h % 7 === 0) {
    cin.speedRamp = "slow-in";
  } else {
    delete cin.speedRamp;
  }

  beat.cinematic = cin;

  const lastF = Math.max(1, durationFrames - 1);
  // Subtle framing bias toward authored focal point, strictly clamped inside picture borders
  const baseBiasX = Math.max(-1.6, Math.min(1.6, (50 - fx) * 0.05));
  const baseBiasY = Math.max(-1.2, Math.min(1.2, (50 - fy) * 0.04));

  // Ozu principle: short cuts & ~58% of shots hold in poised tripod stillness
  const shouldMove =
    pace === "action"
      ? durationFrames >= 40 && h % 3 === 0
      : durationFrames >= 84 && (hasDepth ? h % 10 < 6 : h % 10 < 4);

  if (!shouldMove) {
    if (Math.abs(baseBiasX) > 0.35 || Math.abs(baseBiasY) > 0.35) {
      const stillPose = clampPoseToPictureEdges({
        zoom: 1.038,
        x: baseBiasX,
        y: baseBiasY,
        rotation: 0,
      });
      beat.animation = {
        values: {
          zoom: Number(stillPose.zoom.toFixed(4)),
          x: Number((stillPose.x * 0.96).toFixed(3)),
          y: Number((stillPose.y * 0.96).toFixed(3)),
          gradeStrength: pace === "contemplative" ? 0.82 : 0.88,
          ...(hasDepth ? { depthAmount: 0.22 } : {}),
        },
      };
    } else {
      beat.animation = {
        values: {
          gradeStrength: pace === "contemplative" ? 0.82 : 0.88,
          ...(hasDepth ? { depthAmount: 0.2 } : {}),
        },
      };
    }
    return;
  }

  // Restrained, slow-burn single continuous move across the entire consolidated shot
  const moveVariant = h % 4;
  let z0 = 1.015;
  let z1 = 1.058;
  let x0 = baseBiasX;
  let x1 = baseBiasX;
  let y0 = baseBiasY;
  let y1 = baseBiasY;

  if (moveVariant === 1) {
    // Gentle pull-back reveal
    z0 = 1.055;
    z1 = 1.012;
  } else if (moveVariant === 2) {
    // Subtle lateral drift left-to-right (dolly feel)
    z0 = 1.045;
    z1 = 1.052;
    x0 = baseBiasX - 1.1;
    x1 = baseBiasX + 1.1;
  } else if (moveVariant === 3) {
    // Subtle lateral drift right-to-left
    z0 = 1.045;
    z1 = 1.052;
    x0 = baseBiasX + 1.1;
    x1 = baseBiasX - 1.1;
  }

  const rawP0 = clampPoseToPictureEdges({ zoom: z0, x: x0, y: y0, rotation: 0 });
  const rawP1 = clampPoseToPictureEdges({ zoom: z1, x: x1, y: y1, rotation: 0 });
  const p0 = {
    zoom: rawP0.zoom,
    x: rawP0.x * 0.96,
    y: rawP0.y * 0.96,
  };
  const p1 = {
    zoom: rawP1.zoom,
    x: rawP1.x * 0.96,
    y: rawP1.y * 0.96,
  };

  const anim: BeatAnimation = {
    zoom: [
      {
        frame: 0,
        value: Number(p0.zoom.toFixed(4)),
        easing: "bezier",
        bezier: [0.33, 0, 0.2, 1],
      },
      { frame: lastF, value: Number(p1.zoom.toFixed(4)), easing: "linear" },
    ],
    ...(Math.abs(p0.x - p1.x) > 0.05 || Math.abs(p0.x) > 0.05
      ? {
          x: [
            {
              frame: 0,
              value: Number(p0.x.toFixed(3)),
              easing: "bezier",
              bezier: [0.33, 0, 0.2, 1],
            },
            { frame: lastF, value: Number(p1.x.toFixed(3)), easing: "linear" },
          ],
        }
      : {}),
    ...(Math.abs(p0.y - p1.y) > 0.05 || Math.abs(p0.y) > 0.05
      ? {
          y: [
            {
              frame: 0,
              value: Number(p0.y.toFixed(3)),
              easing: "bezier",
              bezier: [0.33, 0, 0.2, 1],
            },
            { frame: lastF, value: Number(p1.y.toFixed(3)), easing: "linear" },
          ],
        }
      : {}),
    ...(hasDepth
      ? {
          depthAmount: [
            { frame: 0, value: 0.24, easing: "ease-in-out" },
            { frame: lastF, value: 0.38, easing: "linear" },
          ],
        }
      : {}),
    values: {
      gradeStrength: pace === "contemplative" ? 0.82 : 0.88,
    },
  };

  beat.animation = anim;
}

interface PendingAudioEvent {
  lane: "voice" | "sfx";
  src: string;
  offsetWithinBeatMs: number;
  gain: number;
  durationMs: number;
}

/**
 * Builds the complete, polished Neo-Noir / *Tokyo Story* Director's Cut on a `ProjectState`
 * without mutating `project.originalStory` or any surviving `beat.text`.
 */
function buildEditorialCut(
  baseProject: ProjectState,
  variant: EditorialCutVariant,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  const isCreative = variant === "creative";
  const is1950s = variant === "noir-1950s";

  const uncutSnapshot: ProjectSnapshot = {
    id: "snapshot-uncut-original-import",
    name: "Uncut Original Import (1,584 raw beats)",
    createdAt: baseProject.updatedAt || Date.now(),
    story: clone(baseProject.originalStory),
    ...(baseProject.audioClips ? { audioClips: clone(baseProject.audioClips) } : {}),
  };

  const story = clone(baseProject.originalStory);

  // Clean widescreen-bar subtitle styling (no grey box inside the black bar)
  story.captionStyle = {
    position: "bottom",
    size: "S",
    backgroundBox: false,
    showSpeaker: true,
    italicNarration: true,
  };

  // 1. Restore the 7 missing cutscene, title, & Ozu pillow-montage scenes
  populateZeroBeatScenes(story, variant);

  // Creative Director's Cut structural cold-open re-routing:
  // Kaneko's voiced memory of the Hive (`nw_prologue`) emerges out of black right after `nw_logo`,
  // then smash-cuts from "before the night in Kanda" directly into the rain-slicked murder (`nw_s1` -> `nw_s2` -> `nw_title` -> `nw_s3`).
  if (isCreative) {
    const logoScene = story.scenes.find((s) => s.id === "nw_logo");
    const prologueScene = story.scenes.find((s) => s.id === "nw_prologue");
    const titleScene = story.scenes.find((s) => s.id === "nw_title");
    if (logoScene && prologueScene && titleScene && prologueScene.dialogueBeats?.length) {
      logoScene.autoAdvanceTargetSceneId = "nw_prologue";
      const lastPrologueBeat =
        prologueScene.dialogueBeats[prologueScene.dialogueBeats.length - 1];
      lastPrologueBeat.afterBeatTargetSceneId = "nw_s1";
      titleScene.autoAdvanceTargetSceneId = "nw_s3";
    }
  }

  // Dial floating motes down to ~35% opacity across all scenes & beats in the Director's Cut
  for (const scene of story.scenes) {
    if (scene.particles === "motes") {
      scene.particleConfig = {
        ...(scene.particleConfig || {}),
        opacity: 0.35,
      };
    }
    for (const beat of scene.dialogueBeats ?? []) {
      const effectiveKind = beat.particles ?? scene.particles;
      if (effectiveKind === "motes" && (beat.particles === "motes" || beat.particleConfig)) {
        beat.particleConfig = {
          ...(beat.particleConfig || {}),
          opacity: 0.35,
        };
      }
    }
  }

  const orderedIds = runningSceneIds(story);
  const sceneById = new Map(story.scenes.map((s) => [s.id, s]));

  // Track consolidated beat-level voice & SFX offsets (in exact milliseconds)
  // for beats whose secondary beat was absorbed into an identical-plate primary beat.
  const absorbedAudioByAnchorId = new Map<string, PendingAudioEvent[]>();

  let carriedAcrossScenesPic: string | undefined;

  orderedIds.forEach((sceneId, sceneOrderIdx) => {
    const scene = sceneById.get(sceneId);
    if (!scene) return;

    // Consistent theatrical widescreen letterbox across the film (except raw studio video logos)
    if (sceneId !== "nw_intro" && sceneId !== "nw_logo") {
      scene.letterbox = true;
    }

    // Special 6-shot sequence for Scene 77A ("The black glass"), now fully pictured
    if (sceneId === "nw_s77a") {
      structureScene77AGaps(scene, variant);
      const pace = classifyScenePace(sceneId);
      const beats = scene.dialogueBeats ?? [];
      beats.forEach((b, idx) => {
        const durF = Number(b.durationFrames) || 96;
        authorNeoNoirCamera(b, sceneId, idx, durF, pace, variant);
        if (b.id === "nw_b1296") {
          const lastF = Math.max(1, durF - 1);
          if (is1950s) {
            b.animation = {
              zoom: [
                { frame: 0, value: 1.01, easing: "ease-in-out" },
                { frame: lastF, value: 1.04, easing: "linear" },
              ],
              values: { gradeStrength: 1 },
            };
          } else if (isCreative) {
            b.animation = {
              zoom: [
                {
                  frame: 0,
                  value: 1.01,
                  easing: "bezier",
                  bezier: [0.25, 0.1, 0.2, 1],
                },
                { frame: lastF, value: 1.064, easing: "linear" },
              ],
              values: { gradeStrength: 0.92 },
            };
          } else {
            b.animation = {
              zoom: [
                {
                  frame: 0,
                  value: 1.012,
                  easing: "bezier",
                  bezier: [0.33, 0, 0.2, 1],
                },
                { frame: lastF, value: 1.052, easing: "linear" },
              ],
              values: { gradeStrength: 0.88 },
            };
          }
        }
        if (idx === 0) {
          b.backgroundTransition = "dip-to-black";
          b.backgroundTransitionSpeed = is1950s ? 0.72 : isCreative ? 1.05 : 1.0;
          b.transitionAlignment = "at-cut";
        }
        if (b.background) carriedAcrossScenesPic = String(b.background);
      });
      return;
    }

    // Skip already-crafted synthetic title/montage scenes
    if (
      sceneId === "nw_intro" ||
      sceneId === "nw_logo" ||
      sceneId === "nw_title" ||
      sceneId === "nw_m18" ||
      sceneId === "nw_m53" ||
      sceneId === "nw_credits" ||
      sceneId === "nw_end"
    ) {
      const beats = scene.dialogueBeats ?? [];
      const pace = classifyScenePace(sceneId);
      beats.forEach((b, idx) => {
        authorNeoNoirCamera(b, sceneId, idx, Number(b.durationFrames) || 96, pace, variant);
        if (b.background) carriedAcrossScenesPic = String(b.background);
      });
      return;
    }

    const rawBeats = scene.dialogueBeats ?? [];
    if (!rawBeats.length) return;

    const pace = classifyScenePace(sceneId);
    const scenePic = typeof scene.background === "string" && scene.background ? scene.background : undefined;
    let activePic = scenePic || carriedAcrossScenesPic;

    // Resolve each beat's picture, narrative role, target durationFrames, and clean captions
    interface PreparedBeat {
      beat: BeatLike;
      picture: string | undefined;
      isGap: boolean;
      standalone?: boolean;
      hasTitleCard: boolean;
      durationFrames: number;
      captions: BeatCaption[] | undefined; // undefined = use default beat.text (for spoken dialogue)
      voiceEvent?: PendingAudioEvent;
      sfxEvent?: PendingAudioEvent;
    }

    const prepared: PreparedBeat[] = [];

    for (let i = 0; i < rawBeats.length; i += 1) {
      const beat = rawBeats[i];
      const beatId = String(beat.id || `${sceneId}_${i + 1}`);
      beat.id = beatId;

      // Clear mechanical Scarlet Reel crossfades by default; motivated transitions are placed below
      delete beat.backgroundTransition;
      delete beat.backgroundTransitionSpeed;
      delete beat.transitionAlignment;
      delete (beat as AnyRecord).titleCard;

      if (EXPLICIT_GAP_BEAT_IDS.has(beatId)) {
        const spec = MISSING_FRAME_SPECS.find((s) => s.beatId === beatId)!;
        delete beat.gap;
        beat.background = spec.suggestedPath;
        delete beat.cinematic;
        delete beat.animation;
        beat.captions = [];
        const sfxUrl = beat.sfxUrl ? String(beat.sfxUrl) : "";
        const sfxDur = sfxUrl ? lookupAudioDurationMs(sfxUrl, voiceDurations) ?? 1500 : 0;
        const gapDur = is1950s
          ? Math.round(spec.durationFrames * 1.18)
          : isCreative
            ? beatId === "nw_b1309"
              ? 118
              : Math.round(spec.durationFrames * 0.92)
            : spec.durationFrames;
        prepared.push({
          beat,
          picture: spec.suggestedPath,
          isGap: false,
          standalone: true,
          hasTitleCard: false,
          durationFrames: gapDur,
          captions: [],
          sfxEvent: sfxUrl
            ? {
                lane: "sfx",
                src: sfxUrl,
                offsetWithinBeatMs: 0,
                gain: Math.min(is1950s ? 0.48 : 0.65, Number(beat.sfxVolume ?? 0.5)),
                durationMs: sfxDur,
              }
            : undefined,
        });
        continue;
      }

      if (beat.backgroundRevert) {
        activePic = scenePic || carriedAcrossScenesPic;
      }
      if (typeof beat.background === "string" && beat.background) {
        activePic = beat.background;
      }
      const pic = activePic || scenePic || carriedAcrossScenesPic;
      const prevPic = i > 0 ? prepared[i - 1]?.picture : carriedAcrossScenesPic;
      const nextRaw = rawBeats[i + 1];
      const nextPic = nextRaw
        ? typeof nextRaw.background === "string" && nextRaw.background
          ? nextRaw.background
          : pic
        : undefined;
      const isNewVisualPlate = Boolean(pic && pic !== prevPic);
      const isLastInScene = i === rawBeats.length - 1;

      const isNarr = isNarrationBeat(beat);
      const voiceUrl = beat.audioUrl ? String(beat.audioUrl) : "";
      const voiceSec = voiceUrl ? voiceDurations.get(voiceUrl) : undefined;
      const sfxUrl = beat.sfxUrl ? String(beat.sfxUrl) : "";
      const sfxSec = sfxUrl ? voiceDurations.get(sfxUrl) : undefined;

      // Kaneko's voiced Prologue narration is spoken memory voiceover — preserve 100%!
      if (voiceUrl) {
        const durSec =
          voiceSec ??
          Math.min(9, Math.max(2.2, 0.7 + String(beat.text || "").length / 14));
        const offsetSec = Math.max(0, Number(beat.audioOffsetSeconds || 0));
        // Intentional post-line breathing room tailored to each cut's dramatic rhythm
        const breathSec = is1950s
          ? pace === "action"
            ? 0.55
            : isLastInScene
              ? 1.6
              : pace === "contemplative"
                ? 1.35
                : 1.05
          : isCreative
            ? pace === "action"
              ? 0.22
              : isLastInScene
                ? pace === "contemplative"
                  ? 1.45
                  : 1.02
                : pace === "contemplative"
                  ? 0.88
                  : 0.42
            : pace === "action"
              ? 0.32
              : isLastInScene
                ? 1.25
                : pace === "contemplative"
                  ? 0.92
                  : 0.62;
        const totalFrames = Math.max(
          18,
          Math.round((offsetSec + durSec + breathSec) * FPS),
        );
        const capIn = Math.round(offsetSec * FPS);
        const capOut = Math.min(
          totalFrames,
          Math.max(capIn + 14, Math.round((offsetSec + durSec + 0.22) * FPS)),
        );
        const spk = isNarr ? "" : speakerLabel(story, beat.characterId);
        const capEntry: BeatCaption = {
          text: String(beat.text || ""),
          inFrame: capIn,
          outFrame: capOut,
          speaker: spk,
          isNarration: isNarr,
        };

        prepared.push({
          beat,
          picture: pic,
          isGap: false,
          hasTitleCard: false,
          durationFrames: totalFrames,
          captions: [capEntry],
          voiceEvent: {
            lane: "voice",
            src: voiceUrl,
            offsetWithinBeatMs: roundMicros(offsetSec * 1000),
            gain: 1,
            durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros(durSec * 1000)),
          },
          sfxEvent: sfxUrl
            ? {
                lane: "sfx",
                src: sfxUrl,
                offsetWithinBeatMs: 0,
                gain: Math.min(is1950s ? 0.48 : 0.62, Number(beat.sfxVolume ?? 0.55)),
                durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros((sfxSec ?? 1.5) * 1000)),
              }
            : undefined,
        });
      } else if (isNarr) {
        // Creative Cut 5-movement chapter intertitle override on silent opener beats
        const creativeChapter =
          isCreative && i === 0 ? CREATIVE_CHAPTER_CARDS[sceneId] : undefined;
        const decision = creativeChapter
          ? ({ kind: "title", card: creativeChapter.card } as const)
          : classifySilentNarratorText(sceneId, beatId, String(beat.text || ""));
        if (decision.kind === "title") {
          (beat as AnyRecord).titleCard = is1950s
            ? { ...decision.card, monochrome: true }
            : decision.card;
          const durF = creativeChapter ? 96 : is1950s ? 102 : 84;
          prepared.push({
            beat,
            picture: pic,
            isGap: false,
            hasTitleCard: true,
            durationFrames: durF,
            captions: [],
          });
        } else if (decision.kind === "caption") {
          const readSec = Math.max(
            is1950s ? 3.2 : 2.8,
            Math.min(is1950s ? 5.8 : 5.2, (is1950s ? 1.7 : 1.4) + decision.text.length / 17),
          );
          const durF = Math.round(readSec * FPS);
          prepared.push({
            beat,
            picture: pic,
            isGap: false,
            hasTitleCard: false,
            durationFrames: durF,
            captions: [
              {
                text: decision.text,
                inFrame: 4,
                outFrame: Math.max(16, durF - 6),
                speaker: "",
                isNarration: true,
              },
            ],
            sfxEvent: sfxUrl
              ? {
                  lane: "sfx",
                  src: sfxUrl,
                  offsetWithinBeatMs: 0,
                  gain: Math.min(is1950s ? 0.48 : 0.65, Number(beat.sfxVolume ?? 0.55)),
                  durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros((sfxSec ?? 1.5) * 1000)),
                }
              : undefined,
          });
        } else {
          // Suppressed stage direction ("She declines it.", "A small beat.", etc.):
          // Size purely for visual storytelling & rhythmic pacing!
          let durF: number;
          if (isNewVisualPlate) {
            if (pace === "action") {
              durF = is1950s
                ? sfxSec
                  ? Math.max(42, Math.min(64, Math.round((sfxSec + 0.6) * FPS)))
                  : 48
                : isCreative
                  ? sfxSec
                    ? Math.max(24, Math.min(44, Math.round((sfxSec + 0.25) * FPS)))
                    : 28
                  : sfxSec
                    ? Math.max(30, Math.min(52, Math.round((sfxSec + 0.35) * FPS)))
                    : 36;
            } else if (pace === "contemplative") {
              durF = is1950s
                ? 108
                : isCreative
                  ? sceneId.includes("song_service")
                    ? 104
                    : 96
                  : sceneId.includes("song_service")
                    ? 92
                    : 88;
            } else {
              durF = is1950s
                ? sfxSec
                  ? Math.max(72, Math.min(104, Math.round((sfxSec + 1.1) * FPS)))
                  : 84
                : isCreative
                  ? sfxSec
                    ? Math.max(44, Math.min(72, Math.round((sfxSec + 0.55) * FPS)))
                    : 52
                  : sfxSec
                    ? Math.max(56, Math.min(86, Math.round((sfxSec + 0.8) * FPS)))
                    : 68;
            }
          } else if (sfxUrl) {
            durF = Math.max(
              isCreative ? 22 : 26,
              Math.min(
                pace === "action" ? (isCreative ? 38 : 44) : is1950s ? 76 : 64,
                Math.round(((sfxSec ?? 1.2) + (is1950s ? 0.55 : 0.35)) * FPS),
              ),
            );
          } else if (nextPic === pic && i > 0 && prepared[i - 1]?.picture === pic) {
            const prevHadVoice = Boolean(prepared[i - 1]?.voiceEvent);
            const nextHasVoice = Boolean(nextRaw?.audioUrl);
            durF =
              prevHadVoice && nextHasVoice
                ? is1950s
                  ? 24
                  : isCreative
                    ? 12
                    : 16
                : is1950s
                  ? 10
                  : isCreative
                    ? 4
                    : 6;
          } else if (isLastInScene) {
            durF = is1950s
              ? pace === "contemplative"
                ? 42
                : 30
              : isCreative
                ? pace === "contemplative"
                  ? 36
                  : 16
                : pace === "contemplative"
                  ? 30
                  : 20;
          } else {
            durF = is1950s ? 18 : isCreative ? 10 : 12;
          }

          prepared.push({
            beat,
            picture: pic,
            isGap: false,
            hasTitleCard: false,
            durationFrames: durF,
            captions: [],
            sfxEvent: sfxUrl
              ? {
                  lane: "sfx",
                  src: sfxUrl,
                  offsetWithinBeatMs: 0,
                  gain: Math.min(is1950s ? 0.48 : 0.65, Number(beat.sfxVolume ?? 0.55)),
                  durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros((sfxSec ?? 1.5) * 1000)),
                }
              : undefined,
          });
        }
      } else {
        // Unvoiced non-narrator line (fallback safety)
        const durF = is1950s ? 76 : isCreative ? 58 : 64;
        const spk = speakerLabel(story, beat.characterId);
        prepared.push({
          beat,
          picture: pic,
          isGap: false,
          hasTitleCard: false,
          durationFrames: durF,
          captions: [
            {
              text: String(beat.text || ""),
              inFrame: 0,
              outFrame: durF - 4,
              speaker: spk,
              isNarration: false,
            },
          ],
        });
      }

      if (pic && beat.backgroundHold !== false) {
        carriedAcrossScenesPic = pic;
      }
    }

    // 2. Consolidate consecutive beats within the scene that share the exact same picture
    // (eliminating camera-reset stutter & mid-plate cuts while keeping exact ms audio & frame captions!)
    const consolidated: BeatLike[] = [];
    let idx = 0;
    while (idx < prepared.length) {
      const head = prepared[idx];
      if (head.isGap || head.standalone || head.hasTitleCard || !head.picture) {
        if (head.picture) head.beat.background = head.picture;
        head.beat.durationFrames = head.durationFrames;
        if (head.captions !== undefined) head.beat.captions = head.captions;
        consolidated.push(head.beat);
        idx += 1;
        continue;
      }

      let end = idx + 1;
      while (
        end < prepared.length &&
        !prepared[end].isGap &&
        !prepared[end].standalone &&
        !prepared[end].hasTitleCard &&
        prepared[end].picture === head.picture
      ) {
        end += 1;
      }

      const group = prepared.slice(idx, end);
      const primary = head.beat;
      primary.background = head.picture;

      // Preserve richer cinematic metadata (depthMap / lights) if a later beat in the same plate group carried it
      for (let g = 1; g < group.length; g += 1) {
        const otherCin = group[g].beat.cinematic as AnyRecord | undefined;
        if (otherCin) {
          primary.cinematic = {
            ...(otherCin || {}),
            ...(primary.cinematic || {}),
            ...(otherCin.depthMap && !primary.cinematic?.depthMap
              ? {
                  depthMap: otherCin.depthMap,
                  depthPlate: otherCin.depthMap ? otherCin.depthPlate : undefined,
                  depthCutouts: otherCin.depthCutouts,
                }
              : {}),
            ...(otherCin.lights && !primary.cinematic?.lights ? { lights: otherCin.lights } : {}),
          };
        }
      }

      // Preserve end-of-scene chain routing (`afterBeatTargetSceneId`, etc.) from the final beat in the group
      const tailBeat = group[group.length - 1].beat;
      if (tailBeat !== primary) {
        for (const routeKey of [
          "afterBeatMode",
          "afterBeatTargetSceneId",
          "afterBeatSceneId",
          "afterBeatDelaySeconds",
          "nextSceneId",
        ]) {
          if (tailBeat[routeKey] !== undefined) {
            primary[routeKey] = tailBeat[routeKey];
          }
        }
      }

      let runningFrames = 0;
      const mergedCaptions: BeatCaption[] = [];
      const extraAudioEvents: PendingAudioEvent[] = [];

      for (let g = 0; g < group.length; g += 1) {
        const item = group[g];
        const startOffsetFrames = runningFrames;
        const startOffsetMs = frameToMs(startOffsetFrames);

        if (item.captions && item.captions.length > 0) {
          for (const cap of item.captions) {
            mergedCaptions.push({
              ...cap,
              inFrame: startOffsetFrames + cap.inFrame,
              outFrame: startOffsetFrames + cap.outFrame,
            });
          }
        }

        if (g > 0) {
          if (item.voiceEvent) {
            extraAudioEvents.push({
              ...item.voiceEvent,
              offsetWithinBeatMs: roundMicros(startOffsetMs + item.voiceEvent.offsetWithinBeatMs),
            });
          }
          if (item.sfxEvent) {
            extraAudioEvents.push({
              ...item.sfxEvent,
              offsetWithinBeatMs: roundMicros(startOffsetMs + item.sfxEvent.offsetWithinBeatMs),
            });
          }
        }

        runningFrames += item.durationFrames;
      }

      primary.durationFrames = Math.max(18, runningFrames);
      primary.captions = normalizeCaptions(mergedCaptions, primary.durationFrames);

      if (extraAudioEvents.length > 0) {
        absorbedAudioByAnchorId.set(String(primary.id), extraAudioEvents);
      }

      consolidated.push(primary);
      idx = end;
    }

    // 3. Apply camera framing & motivated scene-opening transitions
    consolidated.forEach((beat, shotIdx) => {
      const durF = Math.max(12, Number(beat.durationFrames) || 48);
      authorNeoNoirCamera(beat, sceneId, shotIdx, durF, pace, variant);

      if (shotIdx === 0 && !beat.gap && sceneOrderIdx >= 2) {
        if (is1950s) {
          // Classical 1950s studio grammar: slow curtain fades to black at act breaks,
          // optical laboratory lap-dissolves across day/night & location shifts.
          if (
            sceneId === "nw_prologue" ||
            sceneId === "nw_s3" ||
            sceneId === "nw_s30" ||
            sceneId === "nw_s61" ||
            sceneId === "nw_s78" ||
            sceneId === "nw_s98" ||
            sceneId === "nw_s99a"
          ) {
            beat.backgroundTransition = "dip-to-black";
            beat.backgroundTransitionSpeed = 0.72;
            beat.transitionAlignment = "at-cut";
          } else if (
            sceneId === "nw_s18" ||
            sceneId === "nw_s51" ||
            sceneId === "nw_s53" ||
            sceneId === "nw_s70" ||
            sceneId === "nw_s83" ||
            sceneId === "nw_s93" ||
            sceneId.includes("song_service")
          ) {
            beat.backgroundTransition = "dissolve";
            beat.backgroundTransitionSpeed = 0.68;
            beat.transitionAlignment = "at-cut";
          }
        } else if (isCreative) {
          // Creative Cut: chapter curtain dips, memory dissolves, & kinetic raid whips
          if (
            sceneId === "nw_prologue" ||
            sceneId === "nw_s3" ||
            sceneId === "nw_s30" ||
            sceneId === "nw_s61" ||
            sceneId === "nw_s78" ||
            sceneId === "nw_s98" ||
            sceneId === "nw_s99a"
          ) {
            beat.backgroundTransition = "dip-to-black";
            beat.backgroundTransitionSpeed = 1.05;
            beat.transitionAlignment = "at-cut";
          } else if (sceneId === "nw_s14a" || sceneId === "nw_s39") {
            beat.backgroundTransition = "whip";
            beat.backgroundTransitionSpeed = 1.35;
            beat.transitionAlignment = "at-cut";
          } else if (sceneId === "nw_s53" || sceneId.includes("song_service")) {
            const serviceNum = Number((/_(\d+)$/.exec(sceneId) || [])[1] || "0");
            if (serviceNum === 1) {
              beat.backgroundTransition = "dip-to-black";
              beat.backgroundTransitionSpeed = 1.05;
              beat.transitionAlignment = "at-cut";
            } else {
              beat.backgroundTransition = "dissolve";
              beat.backgroundTransitionSpeed = 0.85;
              beat.transitionAlignment = "at-cut";
            }
          }
        } else if (sceneOrderIdx > 2) {
          // Selective, story-motivated transitions ONLY at major time jumps, elegies, or memory shifts ("neo-noir")
          if (
            sceneId === "nw_prologue" ||
            sceneId === "nw_s3" ||
            sceneId === "nw_s78" ||
            sceneId === "nw_s98" ||
            sceneId === "nw_s99a"
          ) {
            beat.backgroundTransition = "dip-to-black";
            beat.backgroundTransitionSpeed = 1.0;
            beat.transitionAlignment = "at-cut";
          } else if (sceneId.includes("song_service")) {
            const serviceNum = Number((/_(\d+)$/.exec(sceneId) || [])[1] || "0");
            if (serviceNum === 1) {
              beat.backgroundTransition = "dip-to-black";
              beat.backgroundTransitionSpeed = 1.1;
              beat.transitionAlignment = "at-cut";
            } else if (serviceNum % 2 === 1) {
              beat.backgroundTransition = "dissolve";
              beat.backgroundTransitionSpeed = 0.75;
              beat.transitionAlignment = "at-cut";
            }
          }
        }
      }
    });

    scene.dialogueBeats = consolidated;
  });

  // 4. Fill natural room tone on bare scenes before building millisecond audioClips
  const bareAmbienceDefaults: Record<string, string> = {
    nw_s20: "file:/film/sfx/amb-hive.mp3",
    nw_s20_b: "file:/film/sfx/amb-hive.mp3",
    nw_s20_c: "file:/film/sfx/amb-hive.mp3",
    nw_s77a: "rain+file:/film/sfx/loop-wet-street.mp3+file:/film/sfx/loop-car-idle-rain.mp3",
  };
  const baseAudioClips = buildAudioClipsFromFilm(story, voiceDurations, musicDurations);

  const builtFrames = buildKeyframes(story);
  const { clips: timelineClips, totalFrames } = buildTimelineClips(builtFrames, voiceDurations);
  const clipById = new Map<string, TimelineClip>(
    timelineClips.map((c) => [c.keyframe.id, c]),
  );

  // Inject absorbed voice & SFX clips from consolidated identical-plate beats at exact ms offsets
  let extraSeq = 1;
  const injectedAudio: AudioClip[] = [...baseAudioClips];

  for (const [anchorId, events] of absorbedAudioByAnchorId.entries()) {
    for (const ev of events) {
      injectedAudio.push({
        id: `ac_dc_abs_${extraSeq++}`,
        lane: ev.lane,
        src: ev.src,
        anchorId,
        offsetMs: ev.offsetWithinBeatMs,
        inMs: 0,
        durationMs: ev.durationMs,
        gain: ev.gain,
        fadeInMs: ev.lane === "sfx" ? 25 : 8,
        fadeOutMs: ev.lane === "sfx" ? 60 : 18,
        loop: false,
      });
    }
  }

  // Add natural room tone beds for bare scenes + diegetic foley for Scene 77A & Scene 12 gaps
  for (const [scId, ambSrc] of Object.entries(bareAmbienceDefaults)) {
    const scClips = timelineClips.filter((c) => c.keyframe.sceneId === scId);
    if (!scClips.length) continue;
    const first = scClips[0];
    const last = scClips[scClips.length - 1];
    const durMs = roundMicros(frameToMs(last.endFrame) - frameToMs(first.startFrame));
    injectedAudio.push({
      id: `ac_dc_room_${scId}`,
      lane: "ambience",
      src: ambSrc,
      anchorId: first.keyframe.id,
      offsetMs: 0,
      inMs: 0,
      durationMs: Math.max(500, durMs),
      gain: is1950s ? 0.24 : isCreative ? 0.38 : 0.34,
      fadeInMs: is1950s ? 1200 : 900,
      fadeOutMs: is1950s ? 1200 : 900,
      loop: true,
    });
  }

  // Diegetic foley soundscape for Scene 77A ("The black glass") & Scene 12 gaps
  const foleyScale = is1950s ? 0.78 : isCreative ? 1.06 : 1.0;
  const diegeticExtras: Array<{
    anchorBeatId: string;
    src: string;
    offsetMs: number;
    gain: number;
  }> = [
    { anchorBeatId: "nw_b307", src: "/film/sfx/vending-coin-can.mp3", offsetMs: 180, gain: 0.48 * foleyScale },
    { anchorBeatId: "nw_b325", src: "/film/sfx/shutter-pull-down.mp3", offsetMs: 120, gain: 0.52 * foleyScale },
    { anchorBeatId: "nw_b1290", src: "/film/sfx/footsteps-wet.mp3", offsetMs: 150, gain: 0.42 * foleyScale },
    { anchorBeatId: "nw_b1293", src: "/film/sfx/car-stop-wet.mp3", offsetMs: 100, gain: 0.46 * foleyScale },
    { anchorBeatId: "nw_b1294", src: "/film/sfx/car-window-down.mp3", offsetMs: 160, gain: 0.5 * foleyScale },
    { anchorBeatId: "nw_b1303", src: "/film/sfx/car-window-down.mp3", offsetMs: 120, gain: 0.44 * foleyScale },
    { anchorBeatId: "nw_b1304", src: "/film/sfx/car-driving-away.mp3", offsetMs: 80, gain: 0.48 * foleyScale },
  ];
  for (const cue of diegeticExtras) {
    if (!clipById.has(cue.anchorBeatId)) continue;
    const durMs = lookupAudioDurationMs(cue.src, voiceDurations) ?? 2200;
    injectedAudio.push({
      id: `ac_dc_foley_${extraSeq++}`,
      lane: "sfx",
      src: cue.src,
      anchorId: cue.anchorBeatId,
      offsetMs: cue.offsetMs,
      inMs: 0,
      durationMs: Math.max(MIN_AUDIO_CLIP_MS, durMs),
      gain: Number(cue.gain.toFixed(3)),
      fadeInMs: 30,
      fadeOutMs: 120,
      loop: false,
    });
  }

  const resolvedPass1 = resolveAudioClips(injectedAudio, timelineClips);
  const voiceSorted = resolvedPass1
    .filter((c) => c.lane === "voice")
    .sort((a, b) => a.startMs - b.startMs);

  // Build map of previous voice endMs so J-cuts never collide with preceding dialogue
  const prevVoiceEndById = new Map<string, number>();
  for (let i = 0; i < voiceSorted.length; i += 1) {
    prevVoiceEndById.set(voiceSorted[i].id, i > 0 ? voiceSorted[i - 1].endMs : 0);
  }

  const totalFilmMs = frameToMs(totalFrames);

  const polishedAudioClips: AudioClip[] = resolvedPass1.map((rc) => {
    const anchorClip = clipById.get(rc.anchorId);

    if (rc.lane === "ambience") {
      // Ambient sound bridges tailored to each cut
      const bridgeLeadMs =
        rc.startMs > 2000 ? (is1950s ? 450 : isCreative ? 1350 : 780) : 0;
      const bridgeTailMs =
        rc.endMs + 950 < totalFilmMs ? (is1950s ? 450 : isCreative ? 900 : 650) : 0;
      const actualLeadMs = Math.min(bridgeLeadMs, rc.startMs);
      const nextDurMs = Math.max(
        MIN_AUDIO_CLIP_MS,
        roundMicros(rc.durationMs + actualLeadMs + bridgeTailMs),
      );
      const maxAmbGain = is1950s ? 0.26 : isCreative ? 0.42 : 0.38;
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: roundMicros(rc.offsetMs - actualLeadMs),
        inMs: rc.inMs,
        durationMs: nextDurMs,
        gain: Math.min(maxAmbGain, rc.gain),
        fadeInMs: Math.max(rc.fadeInMs, actualLeadMs > 0 ? (isCreative ? 1400 : 1150) : 600),
        fadeOutMs: Math.max(rc.fadeOutMs, isCreative ? 1250 : 1050),
        loop: rc.loop,
      };
    }

    if (rc.lane === "music") {
      const isLogoMusic =
        rc.src.includes("black-cove") || rc.src.includes("scarlet-reel-logo");
      const preRollMs =
        !isLogoMusic && rc.startMs > 5000 ? (is1950s ? 500 : isCreative ? 1400 : 850) : 0;
      const actualPreRollMs = Math.min(preRollMs, rc.startMs);
      const musicGain = isLogoMusic
        ? rc.gain
        : is1950s
          ? Math.min(0.40, rc.gain * 0.68)
          : isCreative
            ? Math.min(0.62, rc.gain * 0.9)
            : Math.min(0.56, rc.gain * 0.82);
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: roundMicros(rc.offsetMs - actualPreRollMs),
        inMs: rc.inMs,
        durationMs: roundMicros(rc.durationMs + actualPreRollMs),
        gain: musicGain,
        fadeInMs: isLogoMusic ? rc.fadeInMs : Math.max(rc.fadeInMs, is1950s ? 3200 : isCreative ? 2000 : 2400),
        fadeOutMs: isLogoMusic ? rc.fadeOutMs : Math.max(rc.fadeOutMs, is1950s ? 3600 : isCreative ? 2600 : 2800),
        loop: rc.loop,
      };
    }

    if (rc.lane === "sfx") {
      const maxSfxGain = is1950s ? 0.48 : isCreative ? 0.72 : 0.68;
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: rc.offsetMs,
        inMs: rc.inMs,
        durationMs: rc.durationMs,
        gain: Math.max(0.14, Math.min(maxSfxGain, rc.gain)),
        fadeInMs: Math.max(20, rc.fadeInMs),
        fadeOutMs: Math.max(45, rc.fadeOutMs),
        loop: rc.loop,
      };
    }

    // Voice lane J-cut strategy per editorial cut:
    // - Creative Cut: bold -360 ms psychological pre-lap J-cuts whenever >= 620 ms silence precedes
    // - 1950s Noir Cut: classical straight dialogue cuts (gentle -80 ms breath softening only)
    // - Neo-Noir Cut: balanced -240 ms J-cuts whenever >= 480 ms silence precedes
    const isAtClipStart = Math.abs(rc.offsetMs) < 35;
    const prevEndMs = prevVoiceEndById.get(rc.id) ?? 0;
    const clearBeforeMs = rc.startMs - prevEndMs;
    const minClearMs = is1950s ? 800 : isCreative ? 620 : 480;
    const shouldPreLap = is1950s
      ? hashInt(rc.id) % 3 === 0
      : isCreative
        ? hashInt(rc.id) % 5 !== 0
        : hashInt(rc.id) % 3 !== 0;

    if (
      anchorClip &&
      isAtClipStart &&
      rc.startMs > 3000 &&
      clearBeforeMs >= minClearMs &&
      shouldPreLap
    ) {
      const jCutLeadMs = is1950s ? 80 : isCreative ? 360 : 240;
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: roundMicros(rc.offsetMs - jCutLeadMs),
        inMs: rc.inMs,
        durationMs: rc.durationMs,
        gain: rc.gain,
        fadeInMs: 14,
        fadeOutMs: 24,
        loop: rc.loop,
      };
    }

    return {
      id: rc.id,
      lane: rc.lane,
      src: rc.src,
      anchorId: rc.anchorId,
      offsetMs: rc.offsetMs,
      inMs: rc.inMs,
      durationMs: rc.durationMs,
      gain: rc.gain,
      fadeInMs: Math.max(8, rc.fadeInMs),
      fadeOutMs: Math.max(18, rc.fadeOutMs),
      loop: rc.loop,
    };
  });

  // 5. Place Timeline Note Markers on all 9 newly generated plate slots (+ chapter markers in Creative Cut)
  const existingMarkers: NoteMarker[] = Array.isArray(story.markers)
    ? story.markers.filter(
        (m) => !m.id.startsWith("marker-gap-") && !m.id.startsWith("marker-chapter-"),
      )
    : [];
  const chapterMarkers: NoteMarker[] = [];
  const chapterFrameSet = new Set<number>();
  if (isCreative) {
    const chapterEntries = Object.entries(CREATIVE_CHAPTER_CARDS);
    chapterEntries.forEach(([scId, ch], chIdx) => {
      const firstClip = timelineClips.find((c) => c.keyframe.sceneId === scId);
      if (!firstClip) return;
      chapterFrameSet.add(firstClip.startFrame);
      chapterMarkers.push({
        id: `marker-chapter-${String(chIdx + 1).padStart(2, "0")}`,
        frame: firstClip.startFrame,
        name: scId === "nw_s77a" ? "PART IV · SHOT 03 · Black Glass" : ch.marker,
        color: "#c678dd",
      });
    });
  }

  const gapMarkers: NoteMarker[] = [];
  for (const spec of MISSING_FRAME_SPECS) {
    const gapClip = clipById.get(spec.beatId);
    if (!gapClip) continue;
    if (chapterFrameSet.has(gapClip.startFrame)) continue;
    gapMarkers.push({
      id: `marker-gap-${String(spec.slotNumber).padStart(2, "0")}`,
      frame: gapClip.startFrame,
      name: spec.markerLabel.replace(/^GAP\s+/, "SHOT "),
      color: is1950s ? "#abb2bf" : "#56b6c2",
    });
  }

  story.markers = [...existingMarkers, ...gapMarkers, ...chapterMarkers].sort(
    (a, b) => a.frame - b.frame,
  );

  const existingSnapshots = (baseProject.snapshots || []).filter(
    (s) => s.id !== uncutSnapshot.id,
  );

  return {
    ...baseProject,
    story,
    audioClips: polishedAudioClips,
    snapshots: [uncutSnapshot, ...existingSnapshots],
    directorsCutVersion: DIRECTORS_CUT_VERSION,
    directorsCutId: variant,
    updatedAt: Date.now(),
  };
}

/**
 * Builds the default Neo-Noir / *Tokyo Story* Director's Cut on a `ProjectState`
 * without mutating `project.originalStory` or any surviving `beat.text`.
 */
export function buildDirectorsCutProject(
  baseProject: ProjectState,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  return buildEditorialCut(baseProject, "neo-noir", voiceDurations, musicDurations);
}

/**
 * Builds any selectable editorial version (`"neo-noir"`, `"creative"`, `"noir-1950s"`, or `"uncut"`)
 * non-destructively from `baseProject.originalStory`, preserving snapshots and full story integrity.
 */
export function buildDirectorsCutById(
  baseProject: ProjectState,
  cutId: DirectorsCutId,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  if (cutId === "uncut") {
    const uncutSnapshot: ProjectSnapshot = {
      id: "snapshot-uncut-original-import",
      name: "Uncut Original Import (1,584 raw beats)",
      createdAt: baseProject.updatedAt || Date.now(),
      story: clone(baseProject.originalStory),
    };
    const story = clone(baseProject.originalStory);
    const audioClips = buildAudioClipsFromFilm(story, voiceDurations, musicDurations);
    const existingSnapshots = (baseProject.snapshots || []).filter(
      (s) => s.id !== uncutSnapshot.id,
    );
    return {
      ...baseProject,
      story,
      audioClips,
      snapshots: [uncutSnapshot, ...existingSnapshots],
      directorsCutVersion: DIRECTORS_CUT_VERSION,
      directorsCutId: "uncut",
      updatedAt: Date.now(),
    };
  }
  return buildEditorialCut(baseProject, cutId, voiceDurations, musicDurations);
}
