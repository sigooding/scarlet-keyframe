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

export const DIRECTORS_CUT_VERSION = 2;

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
function populateZeroBeatScenes(story: StoryLike): void {
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
        },
      ];
    } else if (scene.id === "nw_title") {
      const credits = (scene.credits || {}) as AnyRecord;
      const montage: string[] = Array.isArray(credits.montage)
        ? credits.montage.slice(0, 8)
        : [String(scene.background || "/film/img/montage/m4-railway-rain.jpg")];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;
      const cards: Array<{ kicker?: string; title: string; subtitle?: string } | undefined> = [
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

      scene.dialogueBeats = montage.map((pic, idx) => {
        const look = looks[pic] ? clone(looks[pic]) : {};
        return {
          id: `nw_dc_title_${idx + 1}`,
          characterId: "nw_narrator",
          text: cards[idx]?.title || `Opening montage ${idx + 1}`,
          silent: true,
          background: pic,
          cinematic: look,
          durationFrames: 132, // 5.5s contemplative Tokyo rain plates
          captions: [],
          ...(idx === 0
            ? {
                backgroundTransition: "dip-to-black",
                backgroundTransitionSpeed: 1.0,
                transitionAlignment: "at-cut",
              }
            : {
                backgroundTransition: "dissolve",
                backgroundTransitionSpeed: 0.85,
                transitionAlignment: "at-cut",
              }),
          ...(cards[idx] ? { titleCard: cards[idx] } : {}),
        };
      });
    } else if (scene.id === "nw_m18" || scene.id === "nw_m53") {
      const credits = (scene.credits || {}) as AnyRecord;
      const montage: string[] = Array.isArray(credits.montage) ? credits.montage : [];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;
      scene.dialogueBeats = montage.map((pic, idx) => ({
        id: `nw_dc_${scene.id}_${idx + 1}`,
        characterId: "nw_narrator",
        text: `${scene.title || scene.id} (${idx + 1})`,
        silent: true,
        background: pic,
        cinematic: looks[pic] ? clone(looks[pic]) : {},
        durationFrames: 112, // 4.67s Ozu nocturnal pillow shots
        captions: [],
        backgroundTransition: "dissolve",
        backgroundTransitionSpeed: 0.8,
        transitionAlignment: "at-cut",
      }));
    } else if (scene.id === "nw_credits") {
      const credits = (scene.credits || {}) as AnyRecord;
      const montage: string[] = Array.isArray(credits.montage)
        ? credits.montage.slice(0, 10)
        : [String(scene.background || "/film/img/s1/377-the-hive-remembered.jpg")];
      const looks = (credits.montageLooks || {}) as Record<string, AnyRecord>;
      const creditCards: Array<{ kicker?: string; title: string; subtitle?: string }> = [
        { title: "NOBODY’S WITNESS", subtitle: "Tokyo as a memory that is still happening." },
        { kicker: "WRITTEN BY", title: "Scott Gooding" },
        { kicker: "CAST", title: "Jack  ·  Vera  ·  Mara", subtitle: "Ishida  ·  Kaneko  ·  Okada" },
        { kicker: "CAST", title: "Harada  ·  Kurose  ·  Daniel", subtitle: "Mrs. Sakai  ·  Mr. & Mrs. Noda" },
        { kicker: "ORIGINAL MUSIC", title: "Scott Gooding" },
      ];
      scene.dialogueBeats = montage.map((pic, idx) => {
        const card = idx < creditCards.length ? creditCards[idx] : undefined;
        return {
          id: `nw_dc_credits_${idx + 1}`,
          characterId: "nw_narrator",
          text: card ? `${card.kicker ? `${card.kicker}: ` : ""}${card.title}` : `Closing montage ${idx + 1}`,
          silent: true,
          background: pic,
          cinematic: looks[pic] ? clone(looks[pic]) : {},
          durationFrames: 126, // 5.25s
          captions: [],
          backgroundTransition: idx === 0 ? "dip-to-black" : "dissolve",
          backgroundTransitionSpeed: 0.9,
          transitionAlignment: "at-cut",
          ...(card ? { titleCard: card } : {}),
        };
      });
    } else if (scene.id === "nw_end") {
      scene.dialogueBeats = [
        {
          id: "nw_dc_end_1",
          characterId: "nw_narrator",
          text: "NOBODY'S WITNESS — Tokyo as a memory that is still happening.",
          silent: true,
          background: String(scene.background || "/film/img/s1/377-the-hive-remembered.jpg"),
          durationFrames: 156, // 6.5s final stillness fading to black
          captions: [],
          backgroundTransition: "dissolve",
          backgroundTransitionSpeed: 1.0,
          transitionAlignment: "at-cut",
          titleCard: {
            title: "NOBODY’S WITNESS",
            subtitle: "Tokyo as a memory that is still happening.",
          },
          cinematic: {
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
              { frame: 112, value: 1, easing: "ease-in-out" },
              { frame: 155, value: 0, easing: "linear" },
            ],
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
function structureScene77AGaps(scene: SceneLike): void {
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

  const configureGap = (beat: BeatLike, frames: number, caps: BeatCaption[]) => {
    beat.gap = true;
    beat.durationFrames = frames;
    beat.captions = caps;
    delete beat.background;
    delete beat.cinematic;
    delete beat.animation;
    delete beat.backgroundTransition;
    delete beat.backgroundTransitionSpeed;
  };

  configureGap(g1, 102, []);
  configureGap(g2, 84, []);
  configureGap(g3, 78, []);

  // 6 spoken/silent-acted lines between Kurose and Jack across 424 frames (17.67s, <16 c/s on every cue)
  configureGap(g4, 424, [
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
  ]);

  configureGap(g5, 78, []);
  configureGap(g6, 108, []);

  scene.dialogueBeats = [g1, g2, g3, g4, g5, g6];
}

/**
 * Computes restrained Ozu + Neo-Noir single-camera keyframe framing for a consolidated shot.
 * ~60% of shots hold in composed tripod stillness; ~40% execute one barely-perceptible
 * continuous push, pull, or depth drift across the full shot duration without hitting edges.
 */
function authorNeoNoirCamera(
  beat: BeatLike,
  sceneId: string,
  shotIndexInScene: number,
  durationFrames: number,
  pace: "action" | "contemplative" | "noir",
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

  // Consistent signature Tokyo Neo-Noir visual language across all scenes
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
export function buildDirectorsCutProject(
  baseProject: ProjectState,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations?: ReadonlyMap<string, number>,
): ProjectState {
  const uncutSnapshot: ProjectSnapshot = {
    id: "snapshot-uncut-original-import",
    name: "Uncut Original Import (1,584 raw beats)",
    createdAt: baseProject.updatedAt || Date.now(),
    story: clone(baseProject.originalStory),
    ...(baseProject.audioClips ? { audioClips: clone(baseProject.audioClips) } : {}),
  };

  const story = clone(baseProject.originalStory);

  // 1. Restore the 7 missing cutscene, title, & Ozu pillow-montage scenes
  populateZeroBeatScenes(story);

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

    // Special 6-shot gap structure for Scene 77A ("The black glass")
    if (sceneId === "nw_s77a") {
      structureScene77AGaps(scene);
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
        authorNeoNoirCamera(b, sceneId, idx, Number(b.durationFrames) || 96, pace);
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

      if (EXPLICIT_GAP_BEAT_IDS.has(beatId)) {
        const spec = MISSING_FRAME_SPECS.find((s) => s.beatId === beatId)!;
        beat.gap = true;
        delete beat.background;
        delete beat.cinematic;
        delete beat.animation;
        beat.captions = [];
        const sfxUrl = beat.sfxUrl ? String(beat.sfxUrl) : "";
        const sfxDur = sfxUrl ? lookupAudioDurationMs(sfxUrl, voiceDurations) ?? 1500 : 0;
        prepared.push({
          beat,
          picture: undefined,
          isGap: true,
          hasTitleCard: false,
          durationFrames: spec.durationFrames,
          captions: [],
          sfxEvent: sfxUrl
            ? {
                lane: "sfx",
                src: sfxUrl,
                offsetWithinBeatMs: 0,
                gain: Math.min(0.65, Number(beat.sfxVolume ?? 0.5)),
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
        // Intentional post-line breathing room: fuller on reveals & scene closes, tighter in conflict
        const breathSec =
          pace === "action"
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
                gain: Math.min(0.62, Number(beat.sfxVolume ?? 0.55)),
                durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros((sfxSec ?? 1.5) * 1000)),
              }
            : undefined,
        });
      } else if (isNarr) {
        // Silent narrator beat: classify into TitleCard, Essential Clue Caption, or Suppressed Stage Direction
        const decision = classifySilentNarratorText(sceneId, beatId, String(beat.text || ""));
        if (decision.kind === "title") {
          (beat as AnyRecord).titleCard = decision.card;
          const durF = 84; // 3.5s poised theatrical intertitle
          prepared.push({
            beat,
            picture: pic,
            isGap: false,
            hasTitleCard: true,
            durationFrames: durF,
            captions: [],
          });
        } else if (decision.kind === "caption") {
          const readSec = Math.max(2.8, Math.min(5.2, 1.4 + decision.text.length / 17));
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
                  gain: Math.min(0.65, Number(beat.sfxVolume ?? 0.55)),
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
              durF = sfxSec ? Math.max(30, Math.min(52, Math.round((sfxSec + 0.35) * FPS))) : 36; // 1.5s crisp action cut
            } else if (pace === "contemplative") {
              durF = sceneId.includes("song_service") ? 92 : 88; // 3.7–3.8s Ozu pillow / funeral stillness
            } else {
              durF = sfxSec ? Math.max(56, Math.min(86, Math.round((sfxSec + 0.8) * FPS))) : 68; // 2.83s noir establishing beat
            }
          } else if (sfxUrl) {
            // Same plate, but carries a motivated diegetic sound effect (knock, footsteps, drawer, phone)
            durF = Math.max(
              26,
              Math.min(pace === "action" ? 44 : 64, Math.round(((sfxSec ?? 1.2) + 0.35) * FPS)),
            );
          } else if (nextPic === pic && i > 0 && prepared[i - 1]?.picture === pic) {
            // Middle redundant prose beat sandwiched on an already-held plate:
            // keep a subtle 0.55s human reaction breath between dialogue lines, or 4f minimal bridge if flanked by silence
            const prevHadVoice = Boolean(prepared[i - 1]?.voiceEvent);
            const nextHasVoice = Boolean(nextRaw?.audioUrl);
            durF = prevHadVoice && nextHasVoice ? 16 : 6;
          } else if (isLastInScene) {
            durF = pace === "contemplative" ? 30 : 20; // lingering scene-tail breath
          } else {
            durF = 12; // 0.5s clean visual reaction beat
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
                  gain: Math.min(0.65, Number(beat.sfxVolume ?? 0.55)),
                  durationMs: Math.max(MIN_AUDIO_CLIP_MS, roundMicros((sfxSec ?? 1.5) * 1000)),
                }
              : undefined,
          });
        }
      } else {
        // Unvoiced non-narrator line (fallback safety)
        const durF = 64;
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
      if (head.isGap || head.hasTitleCard || !head.picture) {
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
                  depthPlate: otherCin.depthPlate,
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

        // g === 0's own beat.audioUrl / beat.sfxUrl will be picked up by buildAudioClipsFromFilm
        // UNLESS g > 0 also had voice/sfx, which we register in absorbedAudioByAnchorId!
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
      authorNeoNoirCamera(beat, sceneId, shotIdx, durF, pace);

      if (shotIdx === 0 && !beat.gap && sceneOrderIdx > 2) {
        // Selective, story-motivated transitions ONLY at major time jumps, elegies, or memory shifts
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
      gain: 0.34,
      fadeInMs: 900,
      fadeOutMs: 900,
      loop: true,
    });
  }

  // Diegetic foley soundscape for Scene 77A ("The black glass") & Scene 12 gaps
  const diegeticExtras: Array<{
    anchorBeatId: string;
    src: string;
    offsetMs: number;
    gain: number;
  }> = [
    { anchorBeatId: "nw_b307", src: "/film/sfx/vending-coin-can.mp3", offsetMs: 180, gain: 0.48 },
    { anchorBeatId: "nw_b325", src: "/film/sfx/shutter-pull-down.mp3", offsetMs: 120, gain: 0.52 },
    { anchorBeatId: "nw_b1290", src: "/film/sfx/footsteps-wet.mp3", offsetMs: 150, gain: 0.42 },
    { anchorBeatId: "nw_b1293", src: "/film/sfx/car-stop-wet.mp3", offsetMs: 100, gain: 0.46 },
    { anchorBeatId: "nw_b1294", src: "/film/sfx/car-window-down.mp3", offsetMs: 160, gain: 0.5 },
    { anchorBeatId: "nw_b1303", src: "/film/sfx/car-window-down.mp3", offsetMs: 120, gain: 0.44 },
    { anchorBeatId: "nw_b1304", src: "/film/sfx/car-driving-away.mp3", offsetMs: 80, gain: 0.48 },
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
      gain: cue.gain,
      fadeInMs: 30,
      fadeOutMs: 120,
      loop: false,
    });
  }

  // Cold-open rain sound bridge: let Scene 1 rain sneak in 1,100 ms over the final black tail of nw_logo
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
      // Ambient sound bridges (J-cut pre-roll + L-cut tail crossfade across scene cuts)
      const bridgeLeadMs = rc.startMs > 2000 ? 780 : 0;
      const bridgeTailMs = rc.endMs + 650 < totalFilmMs ? 650 : 0;
      const actualLeadMs = Math.min(bridgeLeadMs, rc.startMs);
      const nextDurMs = Math.max(
        MIN_AUDIO_CLIP_MS,
        roundMicros(rc.durationMs + actualLeadMs + bridgeTailMs),
      );
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: roundMicros(rc.offsetMs - actualLeadMs),
        inMs: rc.inMs,
        durationMs: nextDurMs,
        gain: Math.min(0.38, rc.gain),
        fadeInMs: Math.max(rc.fadeInMs, actualLeadMs > 0 ? 1150 : 600),
        fadeOutMs: Math.max(rc.fadeOutMs, 1050),
        loop: rc.loop,
      };
    }

    if (rc.lane === "music") {
      // Restrained neo-noir score levels + smooth musical sound-bridge pre-roll
      const isLogoMusic =
        rc.src.includes("black-cove") || rc.src.includes("scarlet-reel-logo");
      const preRollMs = !isLogoMusic && rc.startMs > 5000 ? 850 : 0;
      const actualPreRollMs = Math.min(preRollMs, rc.startMs);
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: roundMicros(rc.offsetMs - actualPreRollMs),
        inMs: rc.inMs,
        durationMs: roundMicros(rc.durationMs + actualPreRollMs),
        gain: isLogoMusic ? rc.gain : Math.min(0.56, rc.gain * 0.82),
        fadeInMs: isLogoMusic ? rc.fadeInMs : Math.max(rc.fadeInMs, 2400),
        fadeOutMs: isLogoMusic ? rc.fadeOutMs : Math.max(rc.fadeOutMs, 2800),
        loop: rc.loop,
      };
    }

    if (rc.lane === "sfx") {
      return {
        id: rc.id,
        lane: rc.lane,
        src: rc.src,
        anchorId: rc.anchorId,
        offsetMs: rc.offsetMs,
        inMs: rc.inMs,
        durationMs: rc.durationMs,
        gain: Math.max(0.16, Math.min(0.68, rc.gain)),
        fadeInMs: Math.max(20, rc.fadeInMs),
        fadeOutMs: Math.max(45, rc.fadeOutMs),
        loop: rc.loop,
      };
    }

    // Voice lane: apply motivated J-cuts (-240 ms pre-cut lead) on shot/scene-opening lines
    // whenever the preceding voice clip ended at least 480 ms earlier!
    const isAtClipStart = Math.abs(rc.offsetMs) < 35;
    const prevEndMs = prevVoiceEndById.get(rc.id) ?? 0;
    const clearBeforeMs = rc.startMs - prevEndMs;
    if (
      anchorClip &&
      isAtClipStart &&
      rc.startMs > 3000 &&
      clearBeforeMs >= 480 &&
      hashInt(rc.id) % 3 !== 0
    ) {
      const jCutLeadMs = 240;
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

  // 5. Place Timeline Note Markers on all 9 explicit Missing-Frame Gap slots so the editor can jump right to them
  const existingMarkers: NoteMarker[] = Array.isArray(story.markers)
    ? story.markers.filter((m) => !m.id.startsWith("marker-gap-"))
    : [];
  const gapMarkers: NoteMarker[] = [];
  for (const spec of MISSING_FRAME_SPECS) {
    const gapClip = clipById.get(spec.beatId);
    if (!gapClip) continue;
    gapMarkers.push({
      id: `marker-gap-${String(spec.slotNumber).padStart(2, "0")}`,
      frame: gapClip.startFrame,
      name: spec.markerLabel,
      color: "#e8a24a",
    });
  }
  story.markers = [...existingMarkers, ...gapMarkers].sort((a, b) => a.frame - b.frame);

  const existingSnapshots = (baseProject.snapshots || []).filter(
    (s) => s.id !== uncutSnapshot.id,
  );

  return {
    ...baseProject,
    story,
    audioClips: polishedAudioClips,
    snapshots: [uncutSnapshot, ...existingSnapshots],
    directorsCutVersion: DIRECTORS_CUT_VERSION,
    updatedAt: Date.now(),
  };
}
