/* ------------------------------------------------------------------ */
/*  Scarlet Reel — core data contracts                                 */
/* ------------------------------------------------------------------ */

export type MeterKey = "Sultry" | "Aggressive" | "Clever" | "Suspicion";
export type AttitudeTag = "Sultry" | "Aggressive" | "Clever" | "Neutral";
/** The five CORE cursors/verbs every game kind shares: look, take, talk, use,
 *  go. Plus two EXTRA body-verbs — kick and punch — that a point-and-click can
 *  OPT IN to (see StageSettings.extendedVerbs). They exist on the cursor type
 *  so a hotspot can be authored as `cursor: "kick"`, but they never surface in
 *  a room's coin unless that room opts in, so a visual novel or a classic
 *  noir-rail case is completely unaffected. */
export type CursorKind = "look" | "take" | "talk" | "use" | "go" | "kick" | "punch";
/** A VERB COIN verb — the same verbs the cursor can carry, because in a
 *  point-and-click the verb IS the cursor. See Hotspot.verbs /
 *  StageSettings.verbCoin / StageSettings.extendedVerbs and
 *  docs/adventure-mode.md. */
export type VerbId = CursorKind;

export interface MeterChange {
  meter: MeterKey;
  delta: number;
}

export interface TrustChange {
  characterId: string;
  delta: number;
}

/** Shared gating rule used by hotspots, choices and dialogue beats. */
export interface Gating {
  requiresItems?: string[];
  requiresFlags?: string[];
  excludesItems?: string[];
  excludesFlags?: string[];
  /** when false, ANY of the requires* entries satisfies the gate (default true = all) */
  requiresAll?: boolean;
  minMeters?: Partial<Record<MeterKey, number>>;
  maxMeters?: Partial<Record<MeterKey, number>>;
  minTrust?: Record<string, number>;
  /** require that the player made one of these memory-tagged choices (see
   * Choice.memoryLog) before the gate opens. The keys may ALSO be story
   * flag names — a gate "remembers" a flag too (e.g. a character reacts
   * because you saw the body, not just because you said something).
   * Mirrors "the character recalls what you saw/said" rather than a bare
   * `requiresFlags` boolean. */
  requiresMemories?: string[];
}

export interface Consequences {
  setFlags?: string[];
  clearFlags?: string[];
  addItems?: string[];
  removeItems?: string[];
  meterChanges?: MeterChange[];
  trustChanges?: TrustChange[];
}

export type HotspotActionType =
  | "goToScene"
  | "giveItem"
  | "setFlag"
  | "showText"
  | "meterChange"
  | "openBoard"
  | "openMap"
  | "useItem"
  | "patternPuzzle"
  | "arcadeGame"
  | "startDialogue"
  | "setPlayerPose"
  | "runScript"
  | "esperPhoto"
  | "vkTest";

/**
 * SCRIPTED SEQUENCE — one step of a stage cutscene (SCUMM-style room
 * scripting). A script is an array of steps run IN ORDER on a 🚶 walkable
 * stage: player input locks, letterbox bars drop in, the steps play, and
 * control returns. Runs from a hotspot action (`type: "runScript"`) or on
 * scene entry (StageSettings.enterScript). STAGE NODES ONLY — classic
 * graphic-novel scenes (prose, beats, choices) are untouched by scripts,
 * and a runScript hotspot on a classic scene is ignored with a warning.
 *
 * Steps that move actors reuse the room's own walkers: `walkTo` routes the
 * player around obstacles exactly like a click; `npcWalkTo` drives an
 * ambient NPC (straight line, like patrols). `say` floats a speech line
 * over the player's head — or an NPC's when `npcId` is set — sized to the
 * text and never touching the dialogue-beat system.
 */
export type StageScriptStep =
  | { do: "walkTo"; x: number; y: number }
  | { do: "face"; dir: "left" | "right" }
  /** Switch the walker to a named pose animation ("" / omitted = back to idle). */
  | { do: "pose"; pose?: string }
  | { do: "wait"; seconds: number }
  /** Speech line floated over the player's head, or over `npcId`'s. The step
   *  holds the script for the line's reading time. */
  | { do: "say"; text: string; npcId?: string }
  | { do: "npcWalkTo"; npcId: string; x: number; y: number }
  /** Fire a SET MOTION on an ambient NPC: named animation / say line / facing
   *  (see StageNpcWaypoint). Does not hold the script — pair with `wait`. */
  | { do: "npcMotion"; npcId: string; anim?: string; say?: string; facing?: "left" | "right" }
  | { do: "setFlag"; flag: string }
  /** Ends the script and navigates. Steps after it never run. */
  | { do: "goToScene"; targetSceneId: string };

/** One follow-up action in a hotspot's `then` chain. Structurally a
 *  HotspotAction minus its own chain — flat by construction, so the engine
 *  can run a chain with a simple loop and no recursion or cycle guard. */
export type ChainedHotspotAction = Omit<HotspotAction, "then">;

export interface HotspotAction {
  type: HotspotActionType;
  targetSceneId?: string;
  itemGranted?: string;
  flagSet?: string;
  meterChange?: MeterChange;
  text?: string;
  /** for useItem hotspots: which held item is consumed. When unset the
   *  action consumes NOTHING — arming an item never empties the satchel on
   *  its own; consumption is always author-explicit. */
  itemConsumed?: string;
  /** A recorded/uploaded clip (mp3, wav…) that plays INSTEAD of the
   *  text-to-speech reader when this action's line shows — the hotspot
   *  equivalent of a dialogue beat's audio. Author it in the Studio with an
   *  upload, a library pick, or the 🎙 ElevenLabs button (any character
   *  voice). When a per-item reply line overrides the line, that reply's own
   *  clip (Hotspot.itemAudio) wins. */
  audioUrl?: string;
  /** for patternPuzzle hotspots: the puzzle configuration */
  patternPuzzle?: import("./game/PatternPuzzleTypes").PatternPuzzleConfig;
  /** for arcadeGame hotspots: the playable cabinet configuration. The
   *  mini-game is rendered INSIDE the cabinet artwork, through the
   *  transparent screen hole — see ArcadeGameConfig. */
  arcadeGame?: ArcadeGameConfig;
  /** ESPER Photo Analysis tool for Blade Runner detective photo zooming */
  esperPhoto?: import("./game/EsperTypes").EsperConfig;
  /** Voight-Kampff Polygraph Test engine for interrogating suspected Replicants */
  vkTest?: import("./game/VkTypes").VkConfig;
  /** runScript hotspots (STAGE nodes): the scripted sequence to play. The
   *  action's flagSet still applies when the script starts, and gating/
   *  isRepeatable behave exactly like any other hotspot. */
  script?: StageScriptStep[];
  /** startDialogue hotspots (STAGE nodes) play the scene's dialogueBeats as
   * a conversation. This action needs no payload of its own — the scene's
   * beats ARE the payload. Any flagSet / meterChange here still applies. */
  /** OPT-IN topic-list dialogue. When a `startDialogue` marker carries this,
   *  the conversation is a HUB of askable topics (see DialogueTopic) instead
   *  of the scene's linear `dialogueBeats`: pick a topic, its beats play, then
   *  it returns to the hub; a leave option ends the conversation. Stories
   *  without it are unchanged. */
  topics?: DialogueTopic[];
  /** Hub heading shown above the topic list (default "What do you want to ask?"). */
  topicPrompt?: string;
  /** The leave option's label (default "Never mind"). */
  topicLeaveLabel?: string;
  /** SOUND EFFECT — a clip fired when this action runs: a door creak, a
   *  gunshot, a phone ringing. Distinct from `audioUrl`, which is the VOICE
   *  channel and replaces the narration reader. This plays on the sfx bus
   *  ALONGSIDE any line, overlaps rather than interrupting, and is silenced
   *  by the sfx volume slider. Use audioUrl for "someone says something" and
   *  sfxUrl for "something makes a noise". */
  sfxUrl?: string;
  /** Volume for `sfxUrl`, 0..1, relative to the sfx channel (default 1). */
  sfxVolume?: number;
  /** CHAINED ACTIONS — extra actions run in order straight after this one.
   *  A hotspot's `action` stays the primary (it decides the cursor, gating
   *  and whether the marker is consumed); these are follow-ups, so one click
   *  can show a line AND set a flag AND grant an item.
   *
   *  Deliberately flat: a chained action carries no `then` of its own, so a
   *  chain cannot nest or loop. Navigation ends the chain — anything after a
   *  goToScene never runs, exactly like a script's goToScene step. */
  then?: ChainedHotspotAction[];
  /** setPlayerPose hotspots switch the WALKER's sprite animation to a named
   *  pose — a "bend down" to look under the bar, a "crouch", a "reach". Not
   *  a flag: the pose IS the animation name on the player's sheet. Flags are
   *  for persistent state; here they're optional — `gating` decides WHEN the
   *  pose fires, and `flagSet` can still record that it happened. */
  playerPose?: string;
  /** When true, the pose plays ONCE then the walker reverts to idle/scene
   *  default (a transient "bend down and back up"). Default false = hold the
   *  pose until movement or another pose clears it. */
  playerPoseOnce?: boolean;
}

export interface Hotspot {
  id: string;
  label: string;
  /** percentage bounds relative to the scene viewport */
  bounds: { x: number; y: number; w: number; h: number };
  cursor: CursorKind;
  isRepeatable?: boolean;
  gating?: Gating;
  action: HotspotAction;
  customFailMessage?: string;
  /** Hide the whole marker while its resolved gate fails. Off by default:
   * locked doors remain visible with a useful refusal. Use with NPC gates. */
  hiddenWhenLocked?: boolean;
  /** when true and the action grants an item, that item's image/emoji is drawn
   * inside the hotspot zone so players can literally see the object to pick up */
  showItemImage?: boolean;
  /** Scene-object image drawn inside the zone bounds — a cup, a watch, a key
   *  on a hook. Author it as a transparent-background image (PNG/WebP) so
   *  only the object is drawn over the background plate. The zone's bounds
   *  are the frame: drag/resize the zone to position and scale the object.
   *  It magnifies with the plate when the examine camera zooms in, and it
   *  follows the zone's visibility — hidden while the gate is shut, and
   *  gone for good once a one-shot zone is used (a picked-up object leaves
   *  the scene). */
  image?: string;
  /** Animate the object art with a sprite sheet — a barman polishing a glass,
   *  a neon sign flickering. Plays the sheet's "loop" animation (or the first
   *  one defined) on repeat; `image` stays as the static fallback. */
  sheet?: import("./game/spriteSheet").SpriteSheet;
  /** Looping idle motion for the object art (bob / sway / flicker / flutter) —
   *  CSS only, no extra frames. See src/game/animation.ts. */
  anim?: import("./game/animation").ExtraAnimation;
  /** VERB COIN — extra actions keyed by verb ("look at the bench" vs "take
   *  the wrench"). The hotspot's own `action` stays the default and is what
   *  plays with the coin OFF (and for the cursor it already carries). Verb
   *  actions are repeatable flavour: LOOK never consumes the object.
   *  See docs/adventure-mode.md. */
  verbs?: Partial<Record<VerbId, HotspotAction>>;
  /** Items that do something here when USEd on this object (verb coin or a
   *  drag). Anything else gets the story's wrong-item line. */
  acceptsItems?: string[];
  /** Per-item reply when an accepted item is USEd here, keyed by item id.
   *  Falls back to the useItem action's own text. */
  itemResponses?: Record<string, string>;
  /** Per-item reply CLIPS — when an accepted item's reply (itemResponses)
   *  plays, this clip (if set for that item) plays instead of speech
   *  synthesis, and beats the action's own audioUrl. Same authoring widgets
   *  as beats: upload, library pick, or 🎙 ElevenLabs generation. */
  itemAudio?: Record<string, string>;
  /** Said when the player tries a verb this object doesn't answer to (or a
   *  wrong item). Falls back to Story.verbResponses. */
  wrongVerbText?: string;
  /** How the object image fits its zone: "contain" keeps the whole object
   *  visible (default); "cover" fills the zone, cropping the overflow. */
  imageFit?: "contain" | "cover";
  /** OUT OF REACH — the object can't be walked to (a clock high on a tower,
   *  a window across the street, the moon). On a 🚶 stage node, clicking it
   *  fires its action from wherever the character stands: no walk-up, the
   *  walker just turns to face it. The marker reticle sits on the object
   *  itself instead of being clamped down to the walkable floor, and walking
   *  underneath it never triggers it by accident. Pairs naturally with a
   *  👁 look cursor ("You squint up at the clock tower…"), but any verb the
   *  zone answers works at range. Ignored on classic (non-stage) scenes,
   *  where hotspots already fire on click. */
  remote?: boolean;
  /** PROP OCCLUSION — stage scenes only: this marker's object art draws OVER
   *  the walkers instead of depth-sorting under them, so a big foreground
   *  prop (the crashed saucer) believably covers the character walking
   *  behind it. Default false: object art sits under walkers as always. */
  occludes?: boolean;
  /** STEP-ON TRIGGER (stage scenes only) — opt this marker IN or OUT of
   *  firing when the walker merely STROLLS past it, overriding the room's
   *  `stage.hotspotTrigger` policy for this one object.
   *    - `true`  — walking onto the marker fires it (the classic SCUMM
   *                "walk up and it happens").
   *    - `false` — the marker only ever fires when the player AIMED at it
   *                (clicked it, picked it off the verb coin, or pressed N).
   *    - omitted — inherit the room's policy.
   *
   *  Under the default policy the engine already treats SCENE-LEAVING
   *  markers (a `goToScene` action, or a 👣 go cursor) as aim-only, because
   *  an exit you trip by accident is a soft-lock: it yanks the player out of
   *  the room mid-investigation and they can't walk around their own spawn
   *  point. Set `walkOver: true` deliberately on a doorway you WANT to be a
   *  walk-off edge. See docs/adventure-mode.md § Hotspot triggers. */
  walkOver?: boolean;
  /** EXAMINE interaction: instead of a click, the player HOLDS the pointer on
   * this hotspot. The scene camera zooms in on the hotspot bounds, an
   * "EXAMINING" meter fills over `examineSeconds` (default 2.5 — release
   * early and the examine aborts), and on completion the hotspot's normal
   * action fires: giveItem = you pick the object up, showText = the
   * description. The hotspot is then consumed (hidden). Pair the action's
   * flagSet with a beat gated on that flag to narrate the discovery.
   * Use a LARGE, detailed background image: the zoom is a CSS magnification,
   * so a small or low-res plate will blur when the camera pushes in. */
  examine?: boolean;
  /** Seconds the examine hold takes (default 2.5). */
  examineSeconds?: number;
  /** MULTI-STATE OBJECT — one object that changes with the story instead of
   *  being faked with flag-gated duplicate hotspots. States are evaluated in
   *  order and the LAST one whose gate passes is active (so list the
   *  unconditional default FIRST, then increasingly specific ones). The
   *  active state overrides the hotspot's label / image / cursor / action /
   *  gating, accepted items and optional repeatability; identity, bounds and
   *  verbs are inherited unchanged — the marker never duplicates or
   *  re-mounts, it just re-skins and re-answers in place. See
   *  docs/adventure-mode.md § Multi-state objects. */
  states?: HotspotState[];
}

/** One state of a multi-stage object (see Hotspot.states). Every field is an
 *  OVERRIDE — undefined means "keep the hotspot's own value" (and an empty
 *  string for `image` means 'draw no object art in this state'). */
export interface HotspotState {
  /** Stable id (validator references, Studio list keys). */
  id: string;
  /** When this state is active. Omitted = always active: list that state
   *  FIRST as the default — an unconditional state listed later would
   *  permanently shadow everything above it (the validator warns on it). */
  when?: Gating;
  label?: string;
  image?: string;
  cursor?: CursorKind;
  action?: HotspotAction;
  /** Replaces the hotspot's own gate while this state is active.
   *  `undefined` = inherit the hotspot's gating; an EXPLICIT null = this
   *  state is always unlocked (the "door now open" state of a locked door). */
  gating?: Gating | null;
  /** undefined = inherit; null/[] = no item picker in this state. A machine
   * that consumed its key can then expose a button or puzzle directly. */
  acceptsItems?: string[] | null;
  /** Override repeatability (undefined inherits). Useful for a one-shot
   * briefing becoming a repeatable conversation. showText always repeats. */
  isRepeatable?: boolean;
}

export interface Choice {
  id: string;
  text: string;
  /** Where this choice navigates. Omitted for reply choices (reply: true),
   * which answer in place without moving; the validator warns if a reply
   * choice carries a target (it would navigate instead of replying). */
  targetSceneId?: string;
  attitudeTag?: AttitudeTag;
  gating?: Gating;
  consequences?: Consequences;
  /** A "conversational reply" that stays in the current scene: picking it applies
   * its consequences (flags/meters/trust/items) but does NOT navigate. It answers
   * the question in place — the next dialogue beat gated on the flag it sets
   * becomes the response. This is how branching Q&A dialogue is authored. */
  reply?: boolean;
  /** Hide this choice entirely until its gate is satisfied (instead of showing
   * it disabled with a hint). Ideal for sequential dialogue choices where the
   * upcoming questions shouldn't spoil the conversation. */
  hidden?: boolean;
  /** optional countdown. Any timed choice shows a shrinking ring and really
   *  expires — it does NOT need `quickTime`, which only adds the loud action
   *  treatment (banner, heartbeat sting, shaky cam). Expiry is the "you said
   *  nothing" beat: `timedOutConsequences` apply, the choice routes to
   *  `timedOutTargetSceneId` (falling back to `targetSceneId`), and a reply
   *  with neither just disappears from the rail because it was never said.
   *  See `src/game/conversationTimer.ts`. */
  timeLimitSeconds?: number;
  /** Quick-time prompt: a hard deadline with a big on-screen prompt, a
   * countdown ring around the choice buttons, and (below ~30% remaining) an
   * optional heartbeat sting + shaky-cam cinematic swap for the choice. If the
   * window expires, the choice routes to `timedOutTargetSceneId` with
   * `timedOutConsequences` applied — a distinct "you hesitated" path, NOT just
   * silent removal. */
  quickTime?: boolean;
  /** big on-screen prompt text (defaults to `text`). */
  qtePrompt?: string;
  /** heartbeat SFX sting once the timer dips below ~30% remaining. */
  qteHeartbeat?: boolean;
  /** swap the scene's cinematic to SHAKY CAM once the timer dips below ~30%. */
  qteShakyCam?: boolean;
  /** where to route when the window expires (usually a consequence scene,
   * not necessarily a game-over). Defaults to `targetSceneId`. */
  timedOutTargetSceneId?: string;
  /** consequences applied when the window expires — the "you hesitated" effects
   * (e.g. set a flag so downstream beats can react to the silence). */
  timedOutConsequences?: Consequences;
  /** CHANCE GAMBLE — this choice is a bet. On pick, one seeded gameplay draw
   * (`gameRandom() * 100 < chance` = hit) decides the route: a hit takes the
   * normal `targetSceneId` + `consequences`; a miss takes `failTargetSceneId`
   * + `failConsequences`. Either way the engine also sets the flag
   * `chance:<sceneId>:<choiceId>:hit|miss`, so later beats/gates can react to
   * how the dice landed. The roll is part of the seeded run, so a
   * `?seed=` replay reproduces the exact dice. The button shows its odds. */
  chance?: number;
  /** Where a missed gamble routes (the "it didn't work" path). */
  failTargetSceneId?: string;
  /** Consequences applied on a miss (in place of `consequences`). */
  failConsequences?: Consequences;
  /** defaults to false for consequence choices and true for pure navigation */
  isRepeatable?: boolean;
  /** choices in the same group are mutually exclusive; choosing one resolves all */
  exclusiveGroup?: string;
  /** A short memory tag. When this choice is picked, the engine records the
   * player's exact line under this tag so a later DialogueBeat (or a gate) can
   * recall *this specific choice* — turning "the flag is set" into "the
   * character remembers what you said." */
  memoryLog?: string;
  /** Optional "X will remember that" impact line. After a navigating choice that
   * carries this, the game shows a full-screen impact card that fades in
   * and out (e.g. "Lydia will remember that.") — immediate, explicit feedback
   * that the choice mattered. */
  rememberLine?: string;
  /** The noir verb: this choice PRESENTS an item to the character in the
   * scene — you pull out the photograph and hold it up. The choice is
   * un-pickable until the item is actually held (the engine adds it to the
   * effective gate, so a hidden present choice stays hidden until you have
   * the thing to show). Presenting records an `item:<id>` memory (the
   * item's name), so a later beat can recall it ({said} = the item name)
   * or a gate can "remember" it — see Choice.memoryLog for the tag form. */
  presentItem?: string;
  /** Hand it over: the presented item leaves the inventory (they keep it).
   * Default false — you flash it, you keep it. The choice being one-shot
   * already prevents showing the same item twice for two reactions. */
  consumePresentedItem?: boolean;
  /** OPT-IN playable ride minigame (a road sequence). Picking
   *  this choice launches a steering game instead of navigating at once: the
   *  player weaves through oncoming traffic for the ride's duration — survive
   *  to `targetSceneId` (the choice's `consequences` apply on the win), crash
   *  to `timedOutTargetSceneId`. Mutually exclusive with `quickTime`. */
  ride?: RideConfig;
  /** OPT-IN playable SIGNAL TRIANGULATION minigame (a 3D radio fix). Picking
   *  this choice opens a three.js bay: sweep a directional antenna around the
   *  water, read the signal strength, and drop bearing lines from three
   *  listening posts until they cross on the boat. Nail the fix inside the
   *  time limit and the choice's `consequences` apply and you head to
   *  `targetSceneId`; run out of time (or burn every bearing) and it routes to
   *  `timedOutTargetSceneId`. Mutually exclusive with `quickTime` and `ride`. */
  triangulate?: TriangulateConfig;
}

/** A playable SIGNAL TRIANGULATION minigame — the 3D counterpart to the
 *  lane-dodging ride and the flat row-picking pattern puzzle.
 *
 *  The player orbits a night-time bay rendered in three.js, aims a directional
 *  antenna from each of several shore posts, and commits a bearing when the
 *  signal meter peaks. Each committed bearing draws a line across the water;
 *  where the lines cross is the fix. Win by committing enough bearings whose
 *  crossing lands within `toleranceMeters` of the hidden target. */
/** A playable ARCADE CABINET — a climbing/barrel-dodging mini-game rendered
 *  INSIDE a piece of cabinet artwork.
 *
 *  The cabinet PNG is authored with its monitor keyed out to transparent (see
 *  scripts/hollow-signal/prep-cabinet.mjs), so the game canvas is simply
 *  painted behind the art and shows through the hole. That means the only
 *  thing the engine needs in order to line the two up is WHERE the hole is —
 *  which is `screenRect`, in percentages of the cabinet image.
 *
 *  Percentages (not pixels) so swapping in a differently-sized cabinet plate
 *  doesn't invalidate the placement, and so Studio's editor can nudge it with
 *  four sliders and a live preview. */
export interface ArcadeGameConfig {
  /** Title shown on the cabinet's attract screen. */
  title?: string;
  /** Cabinet artwork (url / `asset:` token). Its monitor area must be keyed
   *  transparent — the game is drawn through it. Omit to play full-bleed with
   *  no bezel at all. */
  cabinetImage?: string;
  /** WHERE the transparent monitor sits within `cabinetImage`, as percentages
   *  of that image's width/height. This is the field Studio's 🕹 editor
   *  adjusts when the art and the playfield don't line up. Defaults to the
   *  measured rect of the shipped cabinet. */
  screenRect?: { x: number; y: number; w: number; h: number };
  /** How tall the whole cabinet is drawn, in viewport-height percent
   *  (default 92). Lower it to sit the cabinet inside a busier room. */
  cabinetHeight?: number;
  /** Phosphor colour of the playfield (default "#54ff9f"). */
  screenTint?: string;
  /** How many levels/boards must be cleared to win (default 3). */
  boardsToClear?: number;
  /** Lives before it's game over (default 3). */
  lives?: number;
  /** Barrel spawn interval in seconds at board 1; each board speeds up
   *  (default 1.6). */
  spawnSeconds?: number;
  /** Caption on a win. */
  winText?: string;
  /** Caption when the player runs out of lives. */
  failText?: string;
  /** Applied when the player clears the game. */
  rewardConsequences?: Consequences;
  /** Applied when the player loses. Losing is never fatal by default — an
   *  arcade cabinet you can retry is the point. */
  loseConsequences?: Consequences;
  /** Where to go after a win (optional — most cabinets stay in the room). */
  targetSceneId?: string;
  /** Where to go after a loss (optional). */
  loseTargetSceneId?: string;
}

export interface TriangulateConfig {
  /** the big prompt above the bay */
  prompt?: string;
  /** seconds on the clock (default 45) */
  durationSeconds?: number;
  /** how many bearings must cross on the target to win (default 3) */
  bearingsRequired?: number;
  /** how many bearings the player may commit in total (default 5) — the
   *  margin for error, since a sloppy bearing is spent either way */
  bearingsAllowed?: number;
  /** how close the crossing must land, in world units (default 9) */
  toleranceMeters?: number;
  /** shore listening posts the player sweeps from, as world-unit x/z pairs.
   *  Two is the minimum for a crossing; three gives a real fix. */
  posts?: { x: number; z: number; label?: string }[];
  /** where the boat actually is, in world units. Omit for a seeded random
   *  position out on the water — a different fix on every playthrough. */
  target?: { x: number; z: number };
  /** caption on a successful fix */
  winText?: string;
  /** caption when the clock beats you */
  failText?: string;
}

/** A playable vehicle-ride minigame (a highway chase): steer
 *  left/right across lanes, dodging oncoming traffic. Reaching the end wins
 *  the ride; a crash routes to the choice's `timedOutTargetSceneId`. */
export interface RideConfig {
  /** number of lanes (default 3) */
  lanes?: number;
  /** seconds the ride lasts before you run the target down (default 18) */
  durationSeconds?: number;
  /** oncoming traffic sprites — image urls / `asset:` / `emoji:` (default 🚗) */
  traffic?: string[];
  /** the rider's vehicle (image url / `asset:` / `emoji:`) — default 🏍 */
  vehicleImage?: string;
  /** ms between traffic spawns (default 1200) */
  spawnMs?: number;
  /** traffic scroll speed, as a fraction of screen height per second (default 0.5) */
  speed?: number;
  /** the big prompt shown at the top while riding */
  prompt?: string;
  /** caption shown on a clean run (default "You catch him.") */
  winText?: string;
  /** caption shown on a crash (default "You went down.") */
  crashText?: string;
  /** ROAD ART — a vertically TILING image scrolled toward the player instead
   *  of the built-in CSS asphalt. Use a seamless tile (its top edge must
   *  continue into its bottom edge) or the loop visibly jumps. */
  roadImage?: string;
  /** Scenery behind the road — a skyline the road is driving into. Static;
   *  the sense of speed comes from the road, not the horizon. */
  horizonImage?: string;
  /** COCKPIT OVERLAY — a dashboard/windscreen frame drawn OVER the road, with
   *  its middle transparent. Turns the ride from a top-down dodge into a
   *  first-person drive without changing any of the play. */
  dashboardImage?: string;
  /** Full-bleed image shown on the crash card (the wreck). */
  crashImage?: string;
  /** DRIVER BEATS — the character's running commentary. One is fired on each
   *  near miss (`nearMiss`), on the crash, and on the win, so the ride talks
   *  the way the show does instead of playing in silence. Lines are picked in
   *  order and don't repeat until the list is exhausted. */
  driverName?: string;
  /** The talking sheet for the driver's portrait beside each line. */
  driverSheet?: import("./game/spriteSheet").SpriteSheet;
  /** Quips fired when traffic passes close without hitting. */
  nearMissLines?: string[];
  /** Quips fired as the ride starts. */
  startLines?: string[];
}

/** A catch-them-in-a-lie beat. Authored on a DialogueBeat via `beat.lie`:
 * while that line is on screen the player may press the speaker and must
 * produce the single piece of evidence that proves the claim false. The
 * contradiction verb — "you said you were home, but this motel receipt…" */
export interface Contradiction {
  /** Shown above the evidence bag when pressing (what is being challenged).
   * Falls back to the beat's own line when blank. */
  claim?: string;
  /** The item ids that break the claim. Usually exactly ONE clue; accept a
   * few so alternate evidence can crack the same lie (the player still has
   * to hold one of them). */
  evidenceItemIds: string[];
  /** The beat that plays when the correct evidence is produced — the
   * speaker caught. It is injected into the dialogue queue as the next line
   * after the claim, the same way a reply unlocks a gated beat. */
  caughtBeat: DialogueBeat;
  /** Flag set when the lie is broken — gate the rest of the confrontation
   * (choices, beats, routes) on it. */
  contradictedFlag: string;
  /** The payoff swing on a correct press (trust up, heat down, a memory of
   * the win…). */
  contradictedConsequences?: Consequences;
  /** Line shown when the player presents evidence that doesn't break the
   * claim — the speaker calls the bluff. Defaults to a generic scoff. */
  wrongBeat?: DialogueBeat;
  /** How many wrong pieces of evidence the player may show before the claim
   * shuts for the scene (default 2 — one bad guess, one last chance). */
  wrongEvidenceLimit?: number;
  /** The cost of a bluff that gets called (usually heat up / trust down). */
  wrongConsequences?: Consequences;
  /** In an interrogation scene, a correct press also breaks this much
   * composure (default 0 — the press stands on its own). 2+ is a
   * contradiction that cracks a suspect open. */
  composureDamage?: number;
  /** Optional impact card when the lie lands (e.g. "Vera knows
   * you've got her."). */
  rememberLine?: string;
}

export interface DialogueBeat {
  id: string;
  characterId: string;
  text: string;
  expression?: string;
  conditionRule?: Gating;
  /** Animatic only, set at runtime by `animaticStory`: this beat's number in the authored scene ("12", or
   *  "12–13" when the animatic shows it joined with the next line), so the mark in an exported animatic names
   *  the same beat the Studio lists. Never authored or saved. */
  animaticBeat?: string;

  /** Optional replacement background image (url / gradient: / asset:) shown
   * for this beat. By default a replacement image PERSISTS through later
   * beats (they stay on it until another beat sets a new image or a beat
   * ends the insert). Set `backgroundHold` to false to show it for THIS beat
   * only and revert to the scene plate as soon as the next beat starts. */
  background?: string;
  /** Cinematic camera/lighting applied to this beat's replacement background. */
  cinematic?: CinematicSettings;
  /** Transition used when this beat's replacement background appears — now dramatic. */
  backgroundTransition?:
    | "cut"
    | "fade"
    | "crossfade"
    | "fade-black"
    | "slide-left"
    | "slide-right"
    | "iris-in"
    | "iris"
    | "wipe-left"
    | "wipe-right"
    | "wipe-up"
    | "wipe-down"
    | "zoom"
    | "glitch"
    | "burn";
  /** Duration of the background transition in seconds (default 0.5). */
  backgroundTransitionSpeed?: number;
  /** Keep this beat's replacement background up for the beats that follow
   * (default true — persists). Set false to revert to the scene plate on the
   * very next beat. */
  backgroundHold?: boolean;
  /** End any currently-held insert shot: drop back to the scene's own plate
   * when this beat begins. Use on a beat with no background of its own. */
  backgroundRevert?: boolean;

  /** optional MP3 voice line — plays instead of Web Speech TTS */
  audioUrl?: string;
  /** a sound effect fired as this beat appears, on the sfx bus: it never interrupts the voice line and may overlap it */
  sfxUrl?: string;
  /** volume for `sfxUrl`, 0..1 relative to the sfx channel (default 1) */
  sfxVolume?: number;
  /** if true, this beat is silent and the text just appears (no narration at all) */
  silent?: boolean;
  /** when false, the speaker's talking keyframe animation is suppressed for
   * THIS beat (they show their resting pose instead). Default true so a
   * character with talking frames animates whenever they speak. */
  useCharacterAnimation?: boolean;
  /** Memory recall substitutions. Keys are Choice.memoryLog tags; the value is
   * the line to show instead of `text` when the player made that choice. Use
   * the `{said}` placeholder to echo the player's exact words. When several
   * memories are present, the first matching tag in insertion order wins. */
  recalls?: Record<string, string>;

  /** PRESS THE LIE — the contradiction verb. When this beat is a line the
   * speaker wants to hold onto (a false claim), the player gets a 🎯 "Press
   * them on that" affordance: they open the evidence bag and must produce
   * the ONE clue that breaks the statement. The right evidence plays the
   * caught beat, swings trust/meters, and sets a flag the rest of the scene
   * (and story) can gate on. The wrong evidence is a BLUFF the speaker calls
   * — it costs trust and draws heat, and after `wrongEvidenceLimit` misses
   * the claim cannot be pressed again this scene (you blew your chance).
   *
   * This is the detective core: instead of clicking through every hotspot,
   * the player must have PAID ATTENTION and hold the evidence that matters.
   * It composes with the interrogation (a correct press can dump composure)
   * and with the corkboard (it can set a link flag). */
  lie?: Contradiction;

  /* ---- AFTER THIS BEAT: route to another scene ----
   * Normally a beat's replacement background reverts to the scene plate when
   * the dialogue finishes (before the scene's choices appear). These fields
   * instead send the player to another scene the moment this beat DONE is
   * dismissed — so the insert shot crossfades straight into the next scene,
   * with no cut back to the scene's own background. This is the clean way to
   * chain insert shots / build cutscenes out of beats. Only meaningful on a
   * beat that is visible at the end of a scene's beat queue (a following beat
   * merely routes when its turn ends; the LAST visible beat performs it). */
  /** Scene to go to when this beat is dismissed. Ignored on every beat except
   * the last visible one in the queue (later beats take over). */
  afterBeatTargetSceneId?: string;
  /** "auto" (default): routes itself after `afterBeatDelaySeconds` once the
   * line has finished typing. "continue": waits for the player's ▸ Continue
   * / Space press — good when you want them to read it before it cuts. */
  afterBeatMode?: "auto" | "continue";
  /** Hold time (seconds) between the finished line and the auto-route
   * (default 1.6). Ignored in "continue" mode. */
  afterBeatDelaySeconds?: number;
}

/**
 * TOPIC-LIST DIALOGUE (opt-in) — one askable question in an NPC conversation
 * hub, the way a LucasArts bartender works: walk up, pick what to ask, hear
 * the answer, and (unless it's exhausted) ask again or ask something else.
 *
 * Authored on a `startDialogue` hotspot's action (`topics`). When a
 * `startDialogue` marker carries `topics`, the conversation opens as a HUB of
 * these instead of playing the scene's linear `dialogueBeats`. Each topic:
 *  - `label` is the player-facing question ("Where's my gang?").
 *  - `beats` are the exchange that plays when it's chosen (reusing the full
 *    DialogueBeat machinery — voice, expressions, backgrounds, recalls).
 *  - `gating` hides the topic until flags/items/trust are ready.
 *  - a non-`repeatable` topic is exhausted after one ask (it stays in the hub
 *    with a ✓ so the player knows it's covered); `repeatable` lets it replay.
 *  - `flagSet` records that the topic was asked, so later topics, beats, or
 *    the wider story can gate on it.
 *
 * Stories that never set `topics` are 100% unchanged — the scene's
 * `dialogueBeats` play exactly as before.
 */
export interface DialogueTopic {
  /** stable id — tracks "already asked" state and is what other topics gate on */
  id: string;
  /** the player-facing question / line shown on the hub */
  label: string;
  /** optional gate: hidden from the hub until flags/items/trust are met */
  gating?: Gating;
  /** the exchange played when this topic is chosen */
  beats: DialogueBeat[];
  /** askable more than once (default false — asked once, then exhausted) */
  repeatable?: boolean;
  /** flag set the moment the topic is chosen (gate later topics / story) */
  flagSet?: string;
}

export interface EndingData {
  tier: "victory-gold" | "victory-silver" | "gameover";
  headline: string;
  recap: string;
  /** In an episodic story, an ending normally closes only the EPISODE — the
   * player is offered "Next time on…" and the following episode. Set this to
   * true for an ending that stops the whole season here (a true finale, or a
   * run-ending catastrophe), even when later episodes exist. */
  endsSeason?: boolean;
}

/* ------------------------------------------------------------------ */
/*  episodes — a Story packed into a TV-style season                   */
/* ------------------------------------------------------------------ */

/** One line of a "Previously on…" recap. Lines are gateable, so the recap
 * reflects what THIS player actually did last episode rather than replaying a
 * fixed trailer. */
export interface RecapLine {
  id: string;
  text: string;
  /** only shown when the gate passes (e.g. requiresFlags: ["took_the_bribe"]) */
  gating?: Gating;
  /** optional speaker — renders as an attributed line with their portrait */
  characterId?: string;
  /** optional still shown behind this recap beat (url / gradient: / asset:) */
  image?: string;
}

/**
 * An episode is a named slice of a story's scene graph with its own title
 * card, its own "Previously on…" recap, its own save slots and its own
 * endings. Finishing one snapshots the world state and carries it into the
 * next, so choices persist across the season.
 *
 * A story with no `episodes` array behaves exactly as before — episodes are
 * purely additive.
 */
/** A dramatic act inside one continuous story.
 *
 * Acts differ from Episodes deliberately: an Episode is a self-contained
 * chapter with its own save slots, ending and recap, whereas an Act is a
 * division *within* a single run. Acts give the player a title card, a name
 * for where they are, and a natural boundary for the route flowchart — the
 * chart at an act break shows the whole act rather than a single part. */
export interface Act {
  id: string;
  /** roman/wordy label shown above the title, e.g. "Act One" */
  label: string;
  /** the act's dramatic title, e.g. "The Woman Who Sold Herself Twice" */
  title: string;
  /** optional line under the title on the act card */
  tagline?: string;
  /** where the act begins — the scene the act-break choice routes to */
  startSceneId: string;
  /** still behind the act title card (url / gradient: / asset:) */
  titleCardImage?: string;
  /** seconds the card holds before it can be dismissed (default 2.6) */
  titleCardSeconds?: number;
}

export interface Episode {
  id: string;
  /** 1-based number shown on the title card ("Episode Two"). Defaults to its
   * position in the season. */
  number?: number;
  /** Optional suffix after the number for sub-chapters ("Episode 2a"). Used
   * when an act is split into several short episodes instead of one long one. */
  numberSuffix?: string;
  title: string;
  /** small kicker above the title (default: the story title) */
  kicker?: string;
  /** tagline under the title on the card */
  tagline?: string;
  /** every scene this episode owns. A scene belongs to exactly one episode. */
  sceneIds: string[];
  /** where the episode opens — must be one of `sceneIds` */
  startSceneId: string;
  /** still behind the title card (url / gradient: / asset:). Falls back to the
   * start scene's background. */
  titleCardImage?: string;
  /** cover art for this episode on the season screen */
  posterImage?: string;
  /** music that plays over the recap + title card */
  titleCardMusicUrl?: string;
  /** seconds the title card holds before it can be dismissed (default 2.4) */
  titleCardSeconds?: number;
  /** "Previously on…" beats, shown before the title card */
  recapLines?: RecapLine[];
  /** also replay the player's own remembered lines in the recap */
  recapFromMemories?: boolean;
  /** "Next time on…" teaser lines shown after this episode's ending card */
  nextTimeLines?: string[];
  /** playable from the season screen without clearing the previous episode */
  unlockedByDefault?: boolean;
  /** Alternate-route seasons: when set, this episode is unlocked only if one
   *  of the listed episodes was cleared — on one of its `endingSceneIds` when
   *  given, on ANY of its endings when omitted. Replaces the positional
   *  "previous episode cleared" rule for this episode. Already-cleared
   *  (replayable) copies still unlock. This is what lets a forked season keep
   *  each route's continuation chapter locked to the route that earned it. */
  unlockAfter?: { episodeId: string; endingSceneIds?: string[] }[];
  /** Per-ending "next time on…" routing: ending scene id → episode id.
   *  Overrides the positional next episode for that ending, so each fork of a
   *  season can point its curtain at its own continuation chapter. */
  nextEpisodeByEnding?: Record<string, string>;
  /** Per-ending "next time on…" teaser lines: ending scene id → lines.
   *  Falls back to `nextTimeLines`. */
  nextTimeByEnding?: Record<string, string[]>;
}

/** One line of a credits roll: a role label ("Directed by") and a name ("Sam Cole"). */
export interface CreditsLine {
  role: string;
  name: string;
}

/** Text-animation settings for a `credits` node. The node renders a proper
 * film-style intro: a kicker, a big title, a subtitle, a divider, then a list
 * of role/name credits. When `title` / `subtitle` / `lines` are omitted they
 * fall back to the scene's prose (line 1 = title, line 2 = subtitle, the rest =
 * name-only lines) so older stories keep working. */
export interface CreditsSettings {
  /** big title (defaults to prose line 1) */
  title?: string;
  /** smaller subtitle/tagline under the title (defaults to prose line 2) */
  subtitle?: string;
  /** the rolling role/name credits (defaults to prose lines 3+) */
  lines?: CreditsLine[];
  /** Typeface for the title sequence. Each maps to a loaded web font:
   * - pulp: Alfa Slab One — heavy pulp-paperback slab (default)
   * - poster: Bebas Neue — tall condensed film-poster caps
   * - elegant: Playfair Display — high-contrast prestige serif
   * - epic: Cinzel — chiselled Roman capitals
   * - modern: Josefin Sans — light geometric sans
   * - type: Newsreader — clean literary serif */
  font?: "pulp" | "poster" | "elegant" | "epic" | "modern" | "type";
  /** Motion applied to each card as it enters and leaves (default "blur-rise").
   * Only used by the "cards" style. "slam" is the pulp main-title punch: the
   * card lands oversized and snaps to size — the Tarantino chapter-card move. */
  cardMotion?: "blur-rise" | "letterspace" | "scale-down" | "slide" | "flicker" | "fade" | "slam" | "iris";
  /** how the title enters (default "fade-up"); "slam" punches it in oversized */
  titleEntrance?: "fade-up" | "typewriter" | "slam";
  /** colour of the big title itself (default the neon gold, with a matching
   * glow). A stark yellow here over hard-cut stills is the classic title-card
   * look. Roles/labels stay on `accentColor`. */
  titleColor?: string;
  /** how the credits list presents:
   * - fade-up (default): the whole list staggers into place and stays
   * - scroll: rolling credits
   * - cards: a film title sequence — each credit fades IN, holds, fades OUT
   *   before the next one arrives, so the screen is mostly image */
  style?: "fade-up" | "scroll" | "cards";
  /** "cards" only: seconds each card is on screen, fade in + hold + fade out
   * (default 3.4). Total sequence = cardSeconds × (2 + lines.length). */
  cardSeconds?: number;
  /** Full-bleed stills that cross-dissolve behind the credits — a title
   * sequence montage. Replaces the scene background while the credits play.
   * Each entry is a url / `gradient:` / `asset:` reference. */
  montage?: string[];
  /** seconds each montage still holds before dissolving to the next (default 5) */
  montageSeconds?: number;
  /** how one still hands over to the next:
   * - dissolve (default): long cross-fade
   * - cut: hard cut — the Tarantino title-sequence bang, still to still */
  montageTransition?: "dissolve" | "cut";
  /** loop the montage back to the first still (default true). When false it
   * holds on the last image. */
  montageLoop?: boolean;
  /** a montage still's camera, by its url: a still with a depth map moves with the depth camera instead of the
   * montage's slow zoom (the film builder fills it from the pictures' looks) */
  montageLooks?: Record<string, CinematicSettings>;
  /** seconds between successive line entrances (default 0.4) */
  stagger?: number;
  /** seconds each line takes to fade/slide in (default 0.85) */
  duration?: number;
  /** for "scroll": seconds for one full loop (default 24) */
  scrollDuration?: number;
  /** accent colour for the subtitle and role labels (default the cyan neon) */
  accentColor?: string;
  /** 35mm gate weave on the titles. Optically-printed titles were married to
   * the picture on a separate pass, so the type drifted against the plate:
   * a slow lateral sway (sprocket slop in the perforations) plus a tiny
   * per-frame registration error from the pulldown claw.
   * - off (default): dead steady, digital
   * - subtle: a well-maintained projector, barely perceptible
   * - worn: a print that has been round the circuit a few times
   * - projector: a tired rep-house machine, with occasional splice bumps */
  gateWeave?: "off" | "subtle" | "worn" | "projector";
}

/** An ADDITIONAL foreground image layered on top of the plate (and the primary
 * `foregroundImage` subject). Unlike the single primary foreground — which is
 * the vertigo/talking-sprite anchor and cycles keyframes — these are static
 * (or zooming) decorations/characters you can stack as many of as you like,
 * each independently positioned, scaled, flipped and parallaxed. */
export interface ForegroundExtra {
  /** image url / `gradient:` / `asset:` reference */
  image: string;
  /** Animate this extra with a sprite sheet (flickering neon, a rain-lashed
   * flag) instead of the static `image`. Plays the sheet's "loop" animation
   * (or the first one defined) on repeat. While set it replaces `image` in
   * play; `image` is kept as the author's static fallback. */
  sheet?: import("./game/spriteSheet").SpriteSheet;
  /** how the image fits its box (default contain) */
  fit?: "contain" | "cover" | "fill" | "native";
  /** image scale (default 1) */
  scale?: number;
  /** anchor position as % of the frame (default 50 / 50).
   *
   *  NOTE the coordinate space: x/y are a % of the VIEWPORT and are clamped
   *  to 0..100, even in a wide (`stage.worldWidth > 100`) room. Hotspots,
   *  obstacles, occluders and spawns are a % of the WORLD. Set `worldX` to
   *  pin a prop to the room instead of the screen. */
  x?: number;
  y?: number;
  /** WIDE STAGES ONLY. Pin this layer to a position in the WORLD
   *  (0..worldWidth) so it pans with the camera instead of staying stuck to
   *  the viewport. Without it a prop slides across the room as the player
   *  walks — a dumpster drifting along the alley. Overrides `x`. */
  worldX?: number;
  /** point ON the image pinned at x/y, CSS background-position style (default "50% 100%" — feet on the floor) */
  anchor?: string;
  /** mirror horizontally, so two subjects can face each other */
  flip?: boolean;
  /** parallax depth 0 (far)→1 (near); only moves when parallaxDepth is on. */
  depth?: number;
  /** Toggle the layer without deleting it — useful while composing a shot. */
  visible?: boolean;
  /** layer opacity, useful for ghosts, rain, fog and distant silhouettes. */
  opacity?: number;
  /** CSS compositing style for this layer. */
  blendMode?: "normal" | "screen" | "multiply" | "overlay" | "soft-light" | "difference";
  /** rotation in degrees around the authored anchor. */
  rotation?: number;
  /** optional animated push-in zoom (1 = none) */
  zoom?: number;
  /** seconds the foreground zoom takes (default 8) */
  zoomDuration?: number;
  /** Fly/ crawl this sprite along a path across the plate — a gull crossing
   *  the harbour, a car passing, a rat along the skirting. Sampled into CSS
   *  keyframes: no JS runs per frame. See src/game/animation.ts. */
  motion?: import("./game/animation").MotionPath;
  /** Looping idle motion (bob, sway, flicker, flutter…) applied on top of
   *  the position — no extra art, one CSS class. See src/game/animation.ts. */
  anim?: import("./game/animation").ExtraAnimation;
  /** WALK-BEHIND MASK — use this foreground image as an occluder in a stage
   *  room: while the walker stands BEHIND it (their feet higher up the plate
   *  than this object's base) the art is drawn OVER the character, so they
   *  really are behind the counter / the truck / the pillar instead of being
   *  pasted on top of it. Off by default. No separate mask asset is needed —
   *  the cutout you already have IS the mask, alpha and all.
   *  See docs/adventure-mode.md. */
  occludes?: boolean;
  /** Where the occluder's base sits, in % of plate HEIGHT (default: this
   *  extra's own y). The walker is "behind" it while their feet are above
   *  this line. Nudge it to move the invisible depth line. */
  occludeBaseline?: number;
  /** ALPHA MASK — clip this layer to the ALPHA of another image, so a
   *  cut-out shape becomes a window the layer shows through.
   *
   *  This is the cockpit trick: put a scrolling cityscape on one layer, mask
   *  it with a dashboard cut-out whose windscreen is transparent, and the
   *  city only appears INSIDE the glass — the vehicle looks like it is
   *  flying through it. The mask is resolved like any other image reference
   *  (`asset:` token, url, or `gradient:`), scaled to the layer's box per
   *  `maskFit`, and its ALPHA channel is what counts (luminance is ignored).
   *  Omit for no masking — the layer draws square, exactly as before.
   *  See docs/adventure-mode.md § Masked layers. */
  maskImage?: string;
  /** How the mask is fitted to the layer's box (default "cover"): "cover"
   *  fills the box (crop the overflow — right for a full-frame dashboard),
   *  "contain" letterboxes the whole mask inside it, "fill" stretches. */
  maskFit?: "contain" | "cover" | "fill";
  /** Invert the mask — the transparent part becomes the visible part. Saves
   *  authoring a second plate when the cut-out you have is the wrong way
   *  round for the shot. */
  maskInvert?: boolean;
  /** SCROLLING LAYER — crawl the layer's own art endlessly in one axis, so
   *  it reads as motion past a fixed camera: rain sliding down a window,
   *  streetlights raking across a windscreen, a conveyor, a skyline passing
   *  under a hovering car. The art is laid edge-to-edge and the scroll loops
   *  seamlessly, so it never runs out; nothing is drawn outside the layer's
   *  box, and a `maskImage` still clips it. Pure CSS (@keyframes on the
   *  background offset): no JS runs per frame. */
  scroll?: import("./game/animation").LayerScroll;
}

/** One layer cut out of a picture for the depth-map camera (see CinematicSettings.depthCutouts). */
export interface DepthCutout {
  /** a transparent PNG the size of the picture, the person (or object) in place */
  image: string;
  /** its depth, 0 far – 1 near: the ground's depth at its feet */
  depth: number;
}

/** A mid-ground parallax depth plane (see CinematicSettings.parallaxLayers). */
export interface ParallaxLayer {
  /** image url / `gradient:` / `asset:` reference — transparent cutouts work best */
  image: string;
  /** 0 (far plane, shifts the least) → 1 (near plane, shifts like the foreground) */
  depth: number;
  /** how the image fits its plane (same semantics as foregroundFit) */
  fit?: "contain" | "cover" | "fill" | "native";
  /** plane scale (default 1) */
  scale?: number;
  /** anchor position, % of frame (default 50 / 50) */
  x?: number;
  y?: number;
}

/** Named colour grade presets (see GRADE_PRESETS in src/cinematic.ts). */
export type GradePresetId =
  | "nolan-imax"
  | "tarantino-35mm"
  | "spielberg-golden"
  | "noir-1940s"
  /** Crushed blacks, magenta/cyan neon bloom — the rain-city tech-noir look. */
  | "neon-noir"
  /** Deep teal shadow wash, sterile cyan highlights — institutional night. */
  | "midnight-teal";

/** Cinematic camera/lighting settings applied to an image (scene background
 * or a dialogue beat's replacement background). */
export interface CinematicSettings {
  /** camera style: pan, zoom-to-subject, static, handheld shake, a rail/dolly
   * track slide across a wide image, or a vertigo dolly-zoom */
  mode?: "pan" | "zoom-hold" | "static" | "shake" | "dolly" | "dolly-zoom";
  /** where the camera zooms toward / holds (CSS background-position value) */
  focalPoint?: string;
  /** how long the zoom-in takes in seconds (default 8) */
  zoomDuration?: number;
  /** handheld shake intensity 0–1 (default 0.5) — drives jitter amplitude */
  shakeAmount?: number;
  /** extra roll/rotation in degrees for the handheld shake (default derives
   * from shakeAmount so old scenes keep their exact look) */
  shakeRotation?: number;
  /** seconds for one full jitter cycle (default 0.5 — lower = faster, jitterier) */
  shakeDuration?: number;
  /** dolly travel direction across the image (default "right") */
  dollyDirection?: "left" | "right";
  /** dolly travel distance as % of the image width (default 8) */
  dollyDistance?: number;
  /** seconds for one full dolly pass (default 10) */
  dollyDuration?: number;
  /** vertical drift % layered onto the dolly (0 = pure horizontal, default 0)
   * — turns a rail track into a diagonal/crane pan */
  dollyVertical?: number;
  /** peak background zoom for the vertigo dolly-zoom as a scale factor
   * (default 1.35 — the background eases from 1× to this and back) */
  dollyZoomAmount?: number;
  /** seconds for one full push-in / pull-out dolly-zoom cycle (default 8) */
  dollyZoomDuration?: number;
  /** which half of the vertigo move to play: push in, pull out, or both
   * (default "both" — eases in and back, looping) */
  dollyZoomDirection?: "push" | "pull" | "both";
  /** background blur in px applied while the vertigo zoom plays (default 0).
   * The foreground subject is a separate layer, so it stays sharp while the
   * world blurs behind it — the classic soft-focus dolly-zoom. */
  dollyZoomBlur?: number;
  /** where the dolly-zoom pushes toward or pulls out from, as a CSS
   * transform-origin ("88% 55%"; default "50% 50%", the frame's centre). A
   * pull-out that starts close on people away from the centre needs it. */
  dollyZoomOrigin?: string;
  /** transparent foreground overlay (subject) that stays fixed while the
   * camera moves — the vertigo/dolly-zoom anchor. Also renders over any other
   * moving camera mode when set. */
  foregroundImage?: string;
  /** scale of the foreground image (default 1) */
  foregroundScale?: number;
  /** how the foreground image is sized within the frame:
   * - contain: whole image fits, letterboxed (default)
   * - cover: fills the frame, cropping edges
   * - fill: stretches to fill the frame (ignores aspect ratio)
   * - native: drawn at its real pixel size (pair with scale) */
  foregroundFit?: "contain" | "cover" | "fill" | "native";
  /** the point ON the foreground image that is pinned at foregroundX/foregroundY
   * and that the animated zoom focuses on. CSS background-position style, e.g.
   * "50% 20%" for a face, "50% 100%" for feet. Default "50% 50%" (centre). */
  foregroundAnchor?: string;
  /** where the anchor point sits in the frame: % of frame width (default 50) */
  foregroundX?: number;
  /** where the anchor point sits in the frame: % of frame height (default 50) */
  foregroundY?: number;
  /** animated push-in (or pull-out) zoom applied to the foreground, focused on
   * foregroundAnchor. 1 = no zoom (default); >1 zooms in, <1 zooms out. */
  /** rotation in degrees around the authored foreground anchor. */
  foregroundRotation?: number;
  foregroundZoom?: number;
  /** seconds for the foreground zoom to complete (default 8) */
  foregroundZoomDuration?: number;
  /** optional keyframe animation that cycles the foreground subject through
   * several poses. When set, its `frames` replace the single foregroundImage
   * (every frame shares the same scale / fit / position). */
  foregroundAnimation?: ForegroundAnimation;
  /** CSS blend mode for the PRIMARY foreground layer (default "normal").
   *
   * A real cutout with an alpha channel needs nothing here. This exists for
   * legacy FX plates that fake transparency by painting the subject on flat
   * black ("screen" drops the black) or flat white ("multiply" drops the
   * white). foregroundExtras always had `blendMode`; the primary layer did
   * not, so an FX plate assigned to it rendered as an opaque rectangle over
   * the scene — the one place authors could not work around it. */
  foregroundBlendMode?: "normal" | "screen" | "multiply" | "lighten" | "darken" | "overlay" | "soft-light" | "hard-light";
  /** opacity of the PRIMARY foreground layer 0–1 (default 1). */
  foregroundOpacity?: number;
  /** ADDITIONAL foreground images stacked on top of the plate (and behind
   * the primary foregroundImage subject). Unlike the single primary
   * foreground (the vertigo / talking-sprite anchor), these are independently
   * positioned, scaled, flipped and parallaxed extras — add as many as you
   * like for multiple characters / props / frames in one shot. */
  foregroundExtras?: ForegroundExtra[];
  /** drift distance for the slow "pan" mode as % of image width (default 0 —
   * keeps the gentle push-in only) */
  panDistance?: number;
  /** drift direction for the slow "pan" mode (default "right") */
  panDirection?: "left" | "right";
  /** Black dimming overlay: 0 = full brightness (default), 1 = fully black. */
  dimAmount?: number;
  /** one or more animated light glows layered over the image */
  lights?: LightPoint[];
  /** dynamic optical lens flare cinematic effect layered over the scene */
  lensFlare?: LensFlareSettings;
  /** multiple lens flare sources (when multiple distinct flares are authored) */
  flares?: LensFlareSettings[];

  /** Cinematic COLOR GRADE applied to the background plate: a named
   * director/stock look (see GRADE_PRESETS in src/cinematic.ts). Grades work
   * on ANY camera mode — they are a CSS filter + split-tone wash layered over
   * the moving plate, not a camera move. */
  colorGrade?: GradePresetId;
  /** Film-stock emulation: animated 35mm grain (stronger than the global
   * grain), gate weave, a soft halation bloom around highlights, light
   * flicker and the occasional dust/scratch pass. Sits ABOVE the grade so it
   * reads as the physical print of the graded image. */
  filmGrade?: boolean;
  /** Strength of the film-stock treatment, 0–1 (default 0.7). */
  filmGradeStrength?: number;

  /** Mouse/pointer PARALLAX depth: the camera subtly follows the cursor, and
   * the layers drift against each other (background slowest, foreground
   * fastest) for a diorama feel. 0/off–1 strong; default 0.35 when set.
   * Falls back to a gentle idle sway on devices with no pointer. */
  parallaxDepth?: number;
  /** Extra mid-ground depth planes between plate and subject. Each plane is a
   * transparent cutout that parallaxes at its own rate; `depth` 0 (far) → 1
   * (near) drives its shift. Great for window frames, crowds, fog banks. */
  parallaxLayers?: ParallaxLayer[];

  /** DEPTH-MAP camera (2.5D): a slow camera move with depth on a still
   * picture. `depthMap` is a grayscale image of the picture's shape — white =
   * near the camera, black = far. For clean edges also give `depthPlate` (the
   * picture with its people painted out) and `depthCutouts` (each person as a
   * transparent PNG): the plate moves through the depth map, each cut-out as one
   * solid layer, so nobody stretches. tools/make-depth-layers.py makes all three.
   * Off for players who ask for reduced motion (the still picture shows), and
   * not used with the dolly camera mode. */
  depthMap?: string;
  /** The picture with the cut-out people painted out (what shows behind them as
   * they move). Without it the depth map moves the picture itself. */
  depthPlate?: string;
  /** Up to four people or objects cut out of the picture, each a transparent
   * PNG the size of the picture, moved as one layer at its `depth` (0 far – 1
   * near; the ground's depth at its feet keeps it standing on the ground). */
  depthCutouts?: DepthCutout[];
  /** How far the camera moves, 0–1 (default 0.4). Push: the far plane ends
   * about 5% larger and the nearest about 14% at 0.4. Truck/drift: a plane one
   * unit of depth from the still plane slides 3% of the frame width at 0.4. */
  depthAmount?: number;
  /** The move: "truck" (slide sideways around the still plane, then hold;
   * default), "push" (dolly in toward `focalPoint`, then hold), "drift" (a slow
   * loop from side to side). */
  depthMotion?: "push" | "truck" | "drift";
  /** Truck/drift: which way the camera moves first (default "right"). */
  depthDirection?: "left" | "right";
  /** Truck/drift: the depth that holds still, 0 far – 1 near (default: the
   * cut-outs' depth, so the people hold and the world moves past; else 0.5). */
  depthFocus?: number;
  /** Seconds the push or truck takes before it holds; one drift loop. Default 14. */
  depthSeconds?: number;

  /* ---- new dynamic visuals (5 effects) — Studio toggles ---- */
  /** Volumetric light shafts through dust/fog — drift with parallax, flicker on tension */
  volumetricShafts?: boolean;
  /** Shafts intensity 0-2 (default 1) */
  shaftsIntensity?: number;
  /** Depth fog — thicker at back, lerp 0.1-0.6 by y; off unless true (with fog particles) */
  depthFog?: boolean;
  /** Depth fog strength 0-1 (default 0.6) */
  fogStrength?: number;
  /** Light-cast shadows — NPC/walker shadow skewed to nearest light */
  shadowCasting?: boolean;
  /** Shadow intensity 0-1 (default 0.8) */
  shadowIntensity?: number;
  /** Rain on lens droplets — glass droplets with backdrop blur sliding down */
  rainOnLens?: boolean;
  /** Rain lens intensity 0-2 (default 1) */
  rainLensIntensity?: number;
  /** DOF blur on talk — plate blurs 2px when conversation open */
  dofOnTalk?: boolean;
  /** DOF blur amount px (default 2) */
  dofBlur?: number;

  /** @deprecated legacy single light — merged into `lights` on next edit. */
  lightSource?: string;
  /** @deprecated legacy single light colour. */
  lightColor?: string;
  /** @deprecated legacy single light size. */
  lightRadius?: number;
}

/** How a foreground overlay animates through its keyframes. */
export type ForegroundAnimationMode = "dissolve" | "frames";

/** Keyframe animation for the foreground overlay subject (a character, prop or
 * frame). The frames are stacked at the same position/scale/fit and cycled in
 * order. `dissolve` smoothly opacity-fades between poses (e.g. a neutral pose
 * melting into a head-turned shock); `frames` hard-swaps sequential sprites
 * without interpolation — traditional comic-panel progression, the way Ace
 * Attorney or Hotel Dusk do limited animation. */
export interface ForegroundAnimation {
  mode: ForegroundAnimationMode;
  /** ordered image frames (url / asset:). This is the complete sequence —
   * include every pose you want played, including any starting pose. */
  frames: string[];
  /** seconds each keyframe is shown (default 0.2) */
  frameDuration?: number;
  /** dissolve only: seconds the cross-fade itself takes (default = frameDuration) */
  fadeDuration?: number;
  /** how many times to play through the sequence. undefined/0 = loop forever. */
  loops?: number;
}

/** One animated point of light. Renders additively (screen blend) and breathes
 * on a smooth sine-wave opacity curve, so it reads as living light rather than
 * a flat highlight. */
export interface LightPoint {
  /** glow centre as a CSS % position (0–100) */
  x: number;
  y: number;
  /** glow hue — any CSS colour (default warm amber #e8b23c) */
  color?: string;
  /** peak brightness 0–1 (default 0.5) */
  intensity?: number;
  /** glow diameter as a % of the container width (default 40) */
  size?: number;
  /** seconds for one full breath cycle (default 2.8) */
  pulseSeconds?: number;
  /** how strongly it breathes: 0 = steady, 1 = full swing (default 1) */
  pulseAmount?: number;
  /** optional lens flare attached to this light point */
  flare?: boolean | LensFlareSettings;
}

/** Optical style presets for cinematic lens flare effects. */
export type LensFlarePreset =
  | "anamorphic-blue"
  | "warm-amber"
  | "sci-fi-cyan"
  | "neon-noir"
  | "vintage-35mm"
  | "natural-sun"
  | "interrogation"
  | "emerald"
  | "custom";

/** Optical ghost reflections detail / count tier. */
export type LensFlareGhostTier = "subtle" | "standard" | "rich";

/** Dynamic lens flare cinematic effect configuration. Simulates optical lens
 * internal reflections, anamorphic laser streak beams, starburst diffraction
 * spikes, and multi-spectral chromatic ghost rings along the optical axis. */
export interface LensFlareSettings {
  /** whether the dynamic lens flare is active (default true when present) */
  enabled?: boolean;
  /** optical preset style (default "anamorphic-blue") */
  preset?: LensFlarePreset;
  /** light source origin X as a % of viewport width (0–100, default 50) */
  x?: number;
  /** light source origin Y as a % of viewport height (0–100, default 30) */
  y?: number;
  /** overall flare intensity / peak brightness 0–1 (default 0.75) */
  intensity?: number;
  /** primary flare color (hex or CSS color, defaults by preset) */
  color?: string;
  /** secondary / chromatic ghost ring tint (hex or CSS color) */
  secondaryColor?: string;
  /** anamorphic horizontal streak beam intensity 0–1 (default 0.85) */
  streakIntensity?: number;
  /** anamorphic streak vertical thickness / dispersion (0.2–3, default 1) */
  streakWidth?: number;
  /** anamorphic streak angle in degrees (-45 to 45, default 0 for horizontal) */
  streakAngle?: number;
  /** optical ghost reflections intensity 0–1 (default 0.7) */
  ghostIntensity?: number;
  /** ghost reflections spread / spacing along optical axis (0.5–2.0, default 1) */
  ghostSpread?: number;
  /** ghost artifact detail count (default "standard") */
  ghostCount?: LensFlareGhostTier;
  /** starburst diffraction rays intensity 0–1 (default 0.6) */
  starburstIntensity?: number;
  /** number of starburst ray spikes (4, 6, 8, or 12, default 6) */
  starburstRays?: number;
  /** central core glow and corona halo diameter % (10–100, default 40) */
  coreSize?: number;
  /** dynamic shimmer / pulse duration in seconds (0.5–8, default 2.6) */
  pulseSeconds?: number;
  /** dynamic shimmer / breathing depth 0–1 (default 0.4) */
  pulseAmount?: number;
  /** reactivity / parallax response to camera motion 0–2 (default 1) */
  reactivity?: number;
  /** optional index of a point light to link this flare's position to */
  linkToLight?: number;
}

/**
 * Explicit win/lose contract shown to the player in the Case File panel.
 * Without this, players have no idea what they are aiming at or what kills them.
 */
export interface CaseBriefing {
  /** Newsreel synopsis shown by the case card's Info button. */
  gameInfo?: string;
  /** one-line statement of the case goal */
  objective: string;
  /** how the player achieves the best outcome */
  winConditions: string[];
  /** what will end the case badly */
  loseConditions: string[];
  /** Suspicion value that triggers an automatic bust. 0/undefined disables it. */
  heatLimit?: number;
  /** scene the player is sent to when heatLimit is reached */
  heatFailSceneId?: string;
}

export interface OnEnterAction {
  consequences?: Consequences;
  /** Optional gate: the consequences apply only when the rule passes against
   * the state at entry. Lets a scene fire a flag conditionally (e.g. a
   * budget running out before a certain point) without a choice involved. */
  conditionRule?: Gating;
}

/** Composure-pressure interrogation on the scene's suspect. Talking is the
 * core loop, so it gets tension: every PRESSING reply (a reply choice with a
 * non-Neutral attitude tag) chips the suspect's composure. When it hits zero
 * the suspect is at their limit and TRUST DECIDES: at/above crackTrust they
 * CRACK (broke beat + brokeFlag + the big swing), below it they CLAMP
 * (clamped beat + clampFlag + the backfire). Charm your way up first and the
 * pressure pays; press cold and it rebounds.
 *
 * Composure is DERIVED — it's the initial value minus the pressing replies
 * already in usedChoices — so it persists across saves and re-entries and
 * can't be ground: a press is one-shot and never comes back. */
export interface Interrogation {
  /** The character being pressed — their name labels the composure gauge. */
  characterId: string;
  /** Composure hits before the suspect breaks (default 3). */
  composure?: number;
  /** Seconds the suspect stays "pressed" before they STEADY if you stop
   * pressing — one +1 recovery, once per scene. This is the urgency: hesitate
   * and the moment passes. Default 7, range 3–12. */
  steadySeconds?: number;
  /** Optional short reaction lines shown as the suspect is pressed down,
   * indexed from composure = composure-1 (index 0) down to 1. Adds the
   * "they're winding up" dynamism. A default escalating set is used when
   * omitted or an index is missing. */
  pressReactions?: string[];
  /** Trust at/above which zero composure = CRACK instead of CLAMP (default 0). */
  crackTrust?: number;
  /** The "broke" beat — plays the moment they crack. */
  brokeBeat: DialogueBeat;
  /** Flag set on the crack — gate the payoff content on it. */
  brokeFlag: string;
  /** The big swing on the crack (trust/heat/meters). */
  brokeConsequences?: Consequences;
  /** The "clamped" beat — plays when they shut down instead. */
  clampedBeat?: DialogueBeat;
  /** Flag set on the clamp — gate the fallout on it. */
  clampFlag?: string;
  /** The backfire on the clamp (usually heat+ / trust-). */
  clampConsequences?: Consequences;
}

/**
 * A STAGE node — the free-roam walkable exploration scene.
 *
 * A stage node plays nothing like a standard node: there is no prose panel
 * and nothing to read before acting. The player walks a character around a
 * floor (click-to-walk and/or WASD/arrows), interactables render as
 * interaction markers, and walking up to a marker fires it through the
 * SAME action path a clicked hotspot uses (gating, give-item, show-text,
 * use-item, exits — all unchanged). A marker whose action is
 * `startDialogue` (a character, usually drawn with the hotspot's image)
 * starts the scene's conversation — its dialogueBeats play in the normal
 * cinematic dialogue panel, ending in the scene's choices (give them
 * timeLimitSeconds for genuine "decide NOW" pressure). Exit
 * markers are ordinary goToScene hotspots: you walk to the door to leave.
 *
 * Prose on a stage node is intentionally NOT shown in play — narrative
 * lives in short caption lines (`showText` actions and `enterCaption`),
 * the way a walkable scene speaks through what you do, not paragraphs.
 */
/** One no-go rectangle the walker routes around (StageSettings.obstacles).
 *  Optionally carries a GATE: while the gate does NOT pass, the barrier is a
 *  solid wall (a locked door); the moment the gate opens the barrier ceases
 *  to exist and the walker may pass — the lock-and-key puzzle made spatial. */
/** One WALK-BEHIND region (StageSettings.occluders): a shape drawn over the
 *  room's own background art that covers the walker while they stand behind
 *  it. Purely visual — use an `obstacle` if it should also block movement. */
export interface StageOccluder {
  /** Stable id (editor/validator references). Optional. */
  id?: string;
  /** The shape, in world-% (x spans 0–worldWidth, y spans 0–100). Three or
   *  more points. A rectangle is just four points. */
  points: { x: number; y: number }[];
  /** THE DEPTH LINE, in % of plate height: the walker is covered while their
   *  feet are ABOVE this (smaller y = further away). Defaults to the lowest
   *  point of the shape — the front edge of the desk — which is what you want
   *  almost every time. Nudge it to move where "behind" begins. */
  baseline?: number;
  /** Hide the region without deleting it, while composing a shot. */
  visible?: boolean;
  /** Author's note — what this shape is ("the sergeant's desk"). */
  label?: string;
}

export interface StageObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stable id (editor/validator references). Optional. */
  id?: string;
  /** PASSAGE GATE — the barrier blocks while this gate is CLOSED and is
   *  gone once it opens. Omit for furniture that always blocks (a counter,
   *  a parked truck). A gate with an item requirement works too (the crowd
   *  parts once you hold the badge). */
  gating?: Gating;
}

/** FIRST-PERSON "QUAKE-STYLE" ROOM — a grid map plus the look/feel knobs.
 *  The map is an array of equal-length rows; `#` is a solid wall cell, `.`
 *  (or any unlisted character) is walkable floor, `S` marks the spawn, and
 *  capital letters are sprite anchors resolved through `markers` (hotspot
 *  ids) and `npcs` (npc ids). Everything else about the scene — hotspot
 *  actions, gating, dialogue, the enter script — is unchanged. */
export interface QuakeModeSettings {
  /** The grid map, one string per row. */
  map: string[];
  /** Capital letter → hotspot id: that hotspot's marker sprite is anchored
   *  at the letter's cell and clicking it fires the hotspot as usual. */
  markers?: Record<string, string>;
  /** Capital letter → npc id (from StageSettings.npcs): the npc's sheet is
   *  drawn as a billboard at the letter's cell. */
  npcAnchors?: Record<string, string>;
  /** Capital letter → PROP billboard: "image" or "image@height" (world
   *  units, default 2.05 — door height). Props are non-interactive set
   *  dressing drawn as billboards: a door slab on the wall line, a plant,
   *  a broom. Height after `@` lets one map mix doors (2.1) and plants
   *  (0.8). */
  props?: Record<string, string>;
  /** Optional tiled floor texture (url / `asset:`) instead of floorColor. */
  floorTexture?: string;
  /** First-person HAND OVERLAY — an image pinned to the bottom of the view
   *  (the Quake visible-weapon trick), e.g. Matt's hand holding the
   *  Quarterly Report. Transparent PNGs work best. */
  handImage?: string;
  /** Wall face colour (default #6b5a44). */
  wallColor?: string;
  /** Floor colour (default #2b2622). */
  floorColor?: string;
  /** Ceiling colour (default #171412). */
  ceilingColor?: string;
  /** Distance fog colour — the Quake gloom (default matches the ceiling). */
  fogColor?: string;
  /** Optional wall texture image url / `asset:` token tiled over the wall
   *  boxes instead of the flat wall colour. */
  wallTexture?: string;
  /** Camera horizontal FOV in degrees (default 75). */
  fov?: number;
  /** Walk speed in cells per second (default 3.2). */
  moveSpeed?: number;
  /** Turn speed in radians per second with arrow keys / Q,E (default 2.4). */
  turnSpeed?: number;
  /** True = click the view to pointer-lock and look with the mouse. */
  mouseLook?: boolean;
  /** Billboard scale for marker reticles (default 1). */
  markerScale?: number;
  /** How close (cells) the player must be for a marker to wear its label
   *  (default 2.5). */
  labelDistance?: number;
}

export interface StageSettings {
  /** Optional room width / height. Letterboxes the plate AND all walkers,
   * markers and walk-behinds together, so a portrait screen cannot crop the
   * artwork away from its hit targets. Omit for legacy fill-screen framing.
   * Applies to the 2D stage, not first-person rooms. */
  plateAspectRatio?: number;
  /** The player character sprite. An image url / `asset:` token, or an emoji
   *  glyph when it starts with "emoji:" (e.g. "emoji:🕵️"). */
  playerImage?: string;
  /** Sprite-sheet walker — ONE image holding a grid of frames plus named
   *  animations ("walk" while moving, "idle" at rest; either falls back to
   *  the other). Takes precedence over walkFrames/playerImage when set.
   *  See src/game/spriteSheet.ts. */
  playerSheet?: import("./game/spriteSheet").SpriteSheet;
  /** VERB COIN — pick a verb, then click the object (LucasArts style).
   *  Off by default: the classic flow (walk up, marker fires) is unchanged.
   *  When on, hotspots answer per verb (Hotspot.verbs) and the USE verb arms
   *  an inventory item. See docs/adventure-mode.md. */
  verbCoin?: boolean;
  /** SENTENCE LINE — the SCUMM strip along the bottom of the room that
   *  reads out the pending interaction as you hover ("Look at the
   *  drop-safe", "Use wrench on the bike", or just "Walk to"). While on,
   *  RIGHT-CLICKING an object is a quick 👁 Look, exactly like picking
   *  look off the coin. Rooms without it (the default) render nothing
   *  new and classic graphic-novel scenes are untouched. */
  sentenceLine?: boolean;
  /** Which verbs the coin offers. Defaults to every verb the room uses. */
  verbs?: import("./types").VerbId[];
  /** OPT-IN for the two EXTRA body-verbs (👢 kick · 👊 punch). When true, the
   *  coin will offer them — derived from the room's hotspots, the same way the
   *  five core verbs are. Off (default), the coin is exactly the classic five
   *  (look / take / talk / use / go) regardless of what the hotspots answer.
   *  Listing them explicitly in `verbs` always wins over this flag. This keeps
   *  the extra verbs a per-ROOM choice, so a visual novel or a classic case
   *  never sees them unless it asks. See docs/adventure-mode.md. */
  extendedVerbs?: boolean;
  /** OPT-IN — OBJECT-FIRST verb menu (the "skull pie"): instead of
   *  picking a verb from the bottom coin and then the object, the player
   *  CLICKS an object first and a small pie-style menu of the verbs THAT
   *  object answers pops up next to it; pick a verb to act. USE expands to
   *  the inventory when the object accepts items. Off (default): the classic
   *  flow (and the verb-first coin) is unchanged. See docs/adventure-mode.md. */
  objectVerbMenu?: boolean;
  /** OPT-IN — HOLD-TO-OPEN for the object-first verb menu (the
   *  classic skull pie): instead of opening the pie the instant you click an
   *  object, the player PRESSES AND HOLDS the object and a BIG circular menu
   *  opens in the middle of the screen — the story's `verbMenuIcon` sprite
   *  sits large in the centre, the verbs the object answers ring it. Release
   *  over a verb to act; release over the skull or outside to cancel. A quick
   *  tap just walks to the object. Off (default): the menu opens on click,
   *  next to the object, exactly as before. */
  objectMenuHold?: boolean;
  /** The sprite at the CENTRE of the object-first skull pie menu (see
   *  `objectVerbMenu` / `objectMenuHold`) — an image url / `asset:` token or
   *  an `emoji:` glyph, rendered BIG in the middle of the ring of verbs so
   *  the menu wears the game's own art.
   *  Default: a skull emoji. Normally set story-wide on the 🎮 In-game theme
   *  tab (Story.verbMenuIcon); a stage value overrides it. */
  objectMenuIcon?: string;
  /** Optional walk-cycle frames (url / `asset:`), cycled while moving — a
   *  2-4 frame silhouette loop sells the walk. When omitted the sprite bobs
   *  procedurally instead. Frame 0 doubles as the idle pose. */
  walkFrames?: string[];
  /** Seconds each walk frame holds (default 0.14). */
  walkFrameDuration?: number;
  /** Spawn point in scene percentages (0–100). Defaults to bottom-centre,
   *  clamped onto the floor band. */
  spawn?: { x: number; y: number };
  /** Walk speed as a percentage of scene WIDTH per second (default ~18). */
  speed?: number;
  /** How close (in scene-% of width) the character must get to a marker to
   *  fire it (default ~4). */
  reach?: number;
  /** Allow arrow-key / WASD movement as well as click-to-walk (default true). */
  keyboard?: boolean;
  /** The walkable floor band, as % of plate height from the top of the
   *  screen. Default { top: 62, bottom: 94 }. Clicks outside the band walk
   *  to the nearest edge of it. */
  floor?: { top: number; bottom: number };
  /** WALK PATH — an arbitrary walkable polygon instead of the flat band.
   *  When ≥3 points are set, the walkable zone IS this polygon (world-%:
   *  x spans 0–worldWidth, y spans 0–100), so you can carve a winding path,
   *  a corridor that turns a corner, an L-shaped boardwalk — anything the
   *  plain band can't. Perspective depth still reads from the polygon's
   *  y-extent (bottom = near, top = far). Overrides `floor` for movement;
   *  `floor` (or the polygon's bounds) still drives the depth scale. */
  floorPoints?: { x: number; y: number }[];
  /** WALK-BEHIND REGIONS — draw around a desk, a counter, a parked car that
   *  is ALREADY PAINTED INTO THE BACKGROUND, and the walker is covered by it
   *  when they stand behind it.
   *
   *  This is the classic adventure "walk-behind" and it needs no extra art:
   *  the region is filled with the ROOM'S OWN BACKGROUND, clipped to the
   *  polygon you drew, and drawn at the depth of its `baseline`. A character
   *  whose feet are ABOVE the baseline (further up the plate = further away)
   *  sorts underneath it and is partly hidden; step forward past the baseline
   *  and you walk in front of it again. Because the fill is the background
   *  itself, the cutout matches the art pixel-for-pixel at every viewport
   *  size — nothing to export, nothing to keep in register.
   *
   *  Contrast the two neighbouring features:
   *    - `obstacles`  — where you may WALK   (collision, no visual)
   *    - `occluders`  — what COVERS you      (visual, no collision)
   *    - foregroundExtras + `occludes` — the same idea for a SEPARATE cutout
   *      image (a prop that isn't in the plate).
   *  A desk usually wants an occluder AND an obstacle over the same shape. */
  occluders?: StageOccluder[];
  /** Perspective: how much SMALLER the character is drawn at the top of the
   *  floor vs the bottom, 0–0.9 (default 0.35). 0 = flat, no depth scaling. */
  depthScale?: number;
  /** Sprite scale at the FRONT of the floor band — how big the character is
   *  up close (default 1). Raise it for a room with a strong foreground. */
  playerNearScale?: number;
  /** Sprite scale at the BACK of the floor band — how small they get walking
   *  away (default 1 - depthScale). Set both ends for an explicit range. */
  playerFarScale?: number;
  /** Hide only the walker art/shadow in first-person cockpit or close-up
   * stages. Interactions remain active; make controls remote for no walk-up. */
  hidePlayer?: boolean;
  /** Base scale of the player sprite (default 1). */
  playerScale?: number;
  /** Named animation to force the walker into (from the player's sprite
   *  sheet), e.g. "bend", "crouch", "reach" — held for the WHOLE scene as
   *  the walker's default pose instead of idle. The sprite still flips
   *  left/right with facing; movement plays this pose rather than the walk
   *  cycle. A `setPlayerPose` hotspot action can override it mid-scene. */
  playerPose?: string;
  /** When interaction labels show on markers:
   *  - "proximity" (default): labels fade in as the character approaches
   *  - "always": every marker wears its label (busy but explicit)
   *  - "none": reticles only — pure Die Hard pan-and-scan confidence */
  hints?: "proximity" | "always" | "none";
  /** HOTSPOT TRIGGER POLICY — when does STROLLING ONTO a marker fire it?
   *
   *  - "smart" (default): objects and characters fire on step-on exactly as
   *    they always have, but SCENE-LEAVING markers (a `goToScene` action or a
   *    👣 go cursor) need the player to AIM at them. This is the fix for the
   *    classic trap where the room's only door sits under the spawn point, so
   *    the player is ejected the instant they take a step — and for the shop
   *    counter you can't walk around without leaving the shop.
   *  - "walkover": legacy behaviour — every marker fires when stepped on,
   *    exits included (a room built as a chain of walk-off doorways).
   *  - "aim": nothing fires unless the player aimed at it. Purest
   *    point-and-click: markers are all click targets, walking is walking.
   *
   *  A marker's own `Hotspot.walkOver` always overrides the room policy.
   *  Remote (out-of-reach) markers are unaffected — they were aim-only
   *  already. Walk-off-screen `exitEdges` are unaffected too: they are a
   *  physical edge, not a marker. */
  hotspotTrigger?: "smart" | "walkover" | "aim";
  /** A caption bar line shown once when the scene begins — the stage
   *  equivalent of an opening narration beat (auto-fades, never blocks). */
  enterCaption?: string;
  /** SCRIPTED SEQUENCE played when the scene begins — the SCUMM room-entry
   *  script: walk the player in, walk an NPC up, trade a couple of floated
   *  lines, set a flag, hand control back. Input locks and letterbox bars
   *  show while it runs. See StageScriptStep. */
  enterScript?: StageScriptStep[];
  /** Run-once latch for enterScript: when set, the script is SKIPPED if this
   *  flag is already active, and the flag is set the moment the script runs —
   *  so the entrance plays once per story (save-proof), not on every visit.
   *  Leave empty to replay on every entry. */
  enterScriptFlag?: string;
  /** Furniture the character walks AROUND instead of through — a bar, a
   *  counter, a parked bike — as scene-percent rectangles. Click-to-walk
   *  routes around them (A* on a coarse grid, then string-pulled to the
   *  corners a person would actually turn at); the keyboard slides along them
   *  instead of stopping dead. See src/logic.ts `stageRoute`.
   *  A barrier may carry a GATE (`gating`): while the gate is CLOSED the
   *  barrier is a solid wall, and the instant it opens the barrier is GONE —
   *  a locked door made SPATIAL (the walker physically cannot pass, never
   *  mind the menus). Pair it with a door hotspot (or a multi-state object)
   *  whose action sets the opening flag. See docs/adventure-mode.md
   *  § "Doors as real doors". */
  obstacles?: StageObstacle[];
  /** WIDE WORLD — how many viewport-widths the room spans (default 100 =
   *  one screen, the classic single plate). 200 = two screens side by side,
   *  like a LucasArts scrolling alley: the camera follows the walker and
   *  pans across the plate, and every coordinate (spawn, hotspots, floor,
   *  obstacles, entrySpawns) is a % of the WIDE world, not the viewport.
   *  Set it and author the world as one continuous strip; the player never
   *  notices the seams. Pair with `exitEdges` for the world's ends. */
  worldWidth?: number;
  /** WALK-OFF-SCREEN EXITS — the red/yellow edge-arrow of the LucasArts
   *  adventure. When the walker reaches the world's left/right edge (or the
   *  viewport edge on a single-screen room) and an exit is defined there,
   *  the character keeps walking off-screen and the scene routes to
   *  `targetSceneId`. A red chevron arrow sits at the plate edge when the
   *  exit is open; yellow when `gating` shuts it (clicking a yellow arrow
   *  says `lockedLine`). Only left/right edges get arrows — the floor band
   *  bounds the top/bottom. */
  exitEdges?: Partial<Record<"left" | "right", StageExitEdge>>;
  /** ENTRY SPAWNS — where the walker appears depends on which room they
   *  came from: keyed by the PREVIOUS scene id (the exact id used in the
   *  exit's targetSceneId / goToScene action). Falls back to `spawn`.
   *  Essential on a wide world with several doors — walk in from the bar
   *  and you stand at the bar's door, not back at the dumpster. */
  entrySpawns?: Record<string, { x: number; y: number }>;
  /** OPT-IN 3D "QUAKE-STYLE" MODE — render this stage as a first-person
   *  billboard world instead of the 2D side-view room: a grid map of solid
   *  wall cells, a first-person camera (WASD + turn), and every character /
   *  marker drawn as a depth-sorted billboard sprite, the way Quake and
   *  Doom dressed their 3D worlds with 2D art. Purely additive: a stage
   *  without `quake` renders exactly as it always has, and the 2D knobs
   *  (floor band, depth scale, walk-behind) are simply unused in 3D.
   *  Hotspot actions, gating, conversations and the enter script all run
   *  through the same pipeline — only the room's GEOMETRY changes. */
  quake?: QuakeModeSettings;
  /** AMBIENT NPCS — scene actors that idle and (optionally) walk a patrol:
   *  the bartender polishing a glass, a barfly pacing, a street vendor
   *  swaying on their stool. Pure stage life — depth-scaled and z-sorted
   *  with the walker, scrolling with the camera on wide worlds. Interaction
   *  stays on hotspots; an NPC's sheet is the same SpriteSheet the walker
   *  uses (`idle` at rest, `walk` while patrolling, each falling back to
   *  the other). */
  npcs?: StageNpc[];
}

/** An ambient scene actor (see StageSettings.npcs). */
export interface StageNpc {
  /** Actor visibility derived from current case state. Pair with the linked
   * hotspot's gate so a departed suspect leaves neither a sprite nor a marker. */
  gating?: Gating;
  id: string;
  /** Static fallback art (image url / `asset:` / `emoji:`) when no sheet. */
  image?: string;
  /** Sprite sheet — `idle` at rest, `walk` while patrolling. */
  sheet?: import("./game/spriteSheet").SpriteSheet;
  /** Spawn position, % of the WIDE world (x 0–worldWidth, y 0–100). */
  x: number;
  y: number;
  /** Flat scale on top of the depth scaling (default 1). */
  scale?: number;
  /** Initial facing (default "right"). */
  facing?: "left" | "right";
  /** SET MOTION at rest — a named sheet animation played while standing
   *  around instead of plain "idle": the barman's "polish", the mechanic's
   *  "hammer". Falls back to "idle"/"walk" when the sheet doesn't define it. */
  idleAnim?: string;
  /** Optional motion while this NPC's linked conversation is open. Overrides
   *  its idle/waypoint motion, then restores it on close. A conversation pose,
   *  not phoneme lip-sync; blank preserves existing idle behaviour. */
  talkAnim?: string;
  /** Patrol route: walk from the spawn to each waypoint in turn, PAUSE
   *  `pause` seconds at each (playing that waypoint's SET MOTION — see
   *  StageNpcWaypoint), then repeat per `patrolMode`. Omit to stand and
   *  idle forever (the classic bartender). TIP: a single waypoint at the
   *  spawn position makes a STANDING actor that cycles a motion + ambient
   *  line on a timer — SCUMM set-dressing with zero walking. */
  patrol?: StageNpcWaypoint[];
  /** Walk speed in world-% / second (default: the room's walker speed). */
  speed?: number;
  /** INTERACTABLE NPC — link this actor to a 🗣 start-conversation marker
   *  (by hotspot id) and the actor BECOMES that marker: the static diamond
   *  hides and the character itself is clickable — the walker chases the
   *  actor's LIVE position (re-routing while they patrol) and the
   *  conversation fires on catch. Pressing N in play walks to + talks with
   *  the nearest linked character. Ambient (no link) NPCs stay pure
   *  set-dressing, exactly as before. */
  talkHotspotId?: string;
  /** How the route repeats (default "loop" — jump back to waypoint 1):
   *  "pingpong" walks the route backwards to the start and out again;
   *  "once" walks it a single time and HOLDS the last waypoint's motion
   *  forever (an actor that crosses the room and settles at the bar). */
  patrolMode?: "loop" | "pingpong" | "once";
}

/** One stop on an ambient NPC's route — position plus the SET MOTION played
 *  while paused there. This is the SCUMM "costume" beat: walk to the crate,
 *  face left, play "hammer" for 4 seconds, mutter a line, move on. */
export interface StageNpcWaypoint {
  x: number;
  y: number;
  /** seconds idling here before moving on (default 2) */
  pause?: number;
  /** SET MOTION — named sheet animation played while paused here ("sweep",
   *  "hammer", "drink"). Falls back to the NPC's idleAnim, then idle/walk. */
  anim?: string;
  /** Face this way during the pause (default: the direction of arrival). */
  facing?: "left" | "right";
  /** Ambient line said over their head while paused here — SCUMM background
   *  chatter. Shown as a floating speech line, not a dialogue beat. */
  say?: string;
  /** WALK-AWAY / WALK-TOWARD SIZE — the NPC's size multiplier ON ARRIVAL at
   *  this stop. The walk leg interpolates smoothly from the previous stop's
   *  size to this one, so a route into the distance shrinks the actor and a
   *  route toward the camera grows them (on top of the room's normal
   *  floor-band depth scaling). Blank = the NPC's base `scale`. */
  scale?: number;
}

/** One walk-off-screen exit of a stage room (see StageSettings.exitEdges). */
export interface StageExitEdge {
  /** where the player lands after walking off the edge */
  targetSceneId: string;
  /** optional flag set the moment the character steps off the edge */
  flagSet?: string;
  /** while this gate is shut the edge arrow renders YELLOW (locked) and
   *  clicking it plays `lockedLine` instead of leaving */
  gating?: Gating;
  /** the line said when the exit is locked (caption over the floor) */
  lockedLine?: string;
  /** short label for the arrow tooltip / editor, e.g. "the road" */
  label?: string;
}

export interface SceneNode {
  id: string;
  title: string;
  /** Author's sticky note for the Studio canvas — shown as a strip on the
   * scene's node card. Studio metadata only; the game never renders it. */
  note?: string;
  /** standard, credits (no HUD, big typography), cutscene (no HUD, full-screen video),
   * stage (a free-roam WALKABLE exploration scene — no prose panel, the
   * player walks a character around a floor and interacts by approaching
   * things; conversations play via startDialogue markers), or note — an
   * author placeholder ("Missing Scene Here"): wired into the graph
   * on both sides but bypassed in play (the game follows its single outgoing
   * route straight through). */
  nodeType?: "standard" | "credits" | "cutscene" | "stage" | "note";
  /** NO-HUD layout: render this scene with zero in-game chrome — no menu,
   * meters, current-lead panel, auto/skip chips, back/narration buttons,
   * inventory dock or sound/help corner. Only meaningful on a 🚶 stage node
   * (Studio's Node Layout Type lists it as "🚶 Walkable Stage — No HUD");
   * the player still gets dialogue subtitles, stage markers and the verb
   * coin, and Esc always opens the quit dialog (Save & exit), so nobody is
   * ever trapped. */
  hideHud?: boolean;
  /** Animatic only: multiplies the reading time of this scene's silent lines (0.75 = a quarter quicker). Set by the film
   * builder from studio-edits "readPace" so narration does not hold one picture for half a minute. */
  animaticReadPace?: number;
  /** Animatic only: the screenplay scene this node plays ("84", "97A"), shown in the corner with the beat number and the picture
   *  when the animatic's marks are on, so a problem can be reported by where it is. Set by the film builder. */
  animaticMark?: string;
  /** When the film plays itself (an animatic, or the player's Auto), a cut to a new picture waits for the next beat of
   *  this scene's music, so the pictures change on the song's beat. Only cuts: lines and descriptions on the same
   *  picture keep their own timing (syncing every change felt mechanical). `bpm` is the track's tempo, `firstBeat` the
   *  time of its first beat in the file, in seconds; a looping track restarts the grid each time round. */
  musicSync?: { bpm: number; firstBeat: number };
  /** Marks this scene as the END OF A PART. On leaving it, the game shows the
   * route flowchart for the part just played before continuing. The string is
   * the part's display name (e.g. "Part 3 — Two Hundred and Eleven Thousand").
   * Endings show their chart automatically and don't need this. */
  partBreak?: string;
  /** image url, `gradient:<css-gradient>`, `video:<mp4>` */
  background: string;
  /** synth ambient preset id, `mp3:<url>` or `video:` audio track */
  ambientAudio?: string;
  /** MP3 URL that plays over this scene as background music / narration */
  sceneAudioUrl?: string; // new: MP3 file URL for scene audio
  /** looping background music file; sceneAudioUrl remains a legacy alias */
  musicUrl?: string;
  /** How scene music behaves on entry:
   * - inherit (default): keep playing whatever the previous scene started
   * - track: play musicUrl (switches tracks; same track keeps looping)
   * - none: stop the soundtrack entirely */
  musicMode?: "inherit" | "track" | "none";
  /** false: the track this scene starts plays once and then leaves the scenes silent until another cue (a song, not a bed).
   *  Default true: a track loops until changed or silenced. Only read when this scene starts a track. */
  musicLoop?: boolean;
  /** Seconds to cross-fade the soundtrack when this scene changes it.
   *  Applies to both the outgoing track and the incoming one, so a switch is
   *  a true crossfade. Defaults to 1.4s. 0 = hard cut (the old behaviour). */
  musicFadeSeconds?: number;
  /** Seconds the OUTGOING track takes to fade when this scene changes the music; defaults to `musicFadeSeconds`.
   *  Longer than the fade-in, the old track carries on under the new one and dies away slowly, so two versions of the
   *  same song merge (Nobody's Witness: the piano "Bad Guy" into the sung one); shorter, it has gone before the new
   *  one is up. */
  musicFadeOutSeconds?: number;
  /** Default level for this scene's music, 0–1 (a multiplier on the music
   *  channel). Lets a scene start a track louder (a title theme) or lower
   *  (ambient bed under dialogue) independent of the player's music volume.
   *  Only applied when this scene starts a track (musicMode "track"); a
   *  "continue"/"none" scene doesn't retune an already-playing track. */
  musicLevel?: number;
  /** one-shot recorded prose narration, used instead of Web Speech */
  narrationAudioUrl?: string;
  /** scene-level narration override; defaults to true */
  autoNarrate?: boolean;
  /** Minimum seconds the scene holds before its choices (and, on credits /
   * cutscene nodes, the continue button) become available. 0/undefined = instant.
   * A cinematic pacing knob, most useful on credits/cutscene nodes. */
  choiceDelaySeconds?: number;
  /** When set, a scene with no available choices automatically routes here
   * after the timer once prose + dialogue + any cinematic hold have finished. */
  autoAdvanceTargetSceneId?: string;
  /** Seconds to wait before auto-routing to autoAdvanceTargetSceneId. */
  autoAdvanceDelaySeconds?: number;
  /** Hide the on-screen auto-advance countdown from the player. */
  autoAdvanceHideTimer?: boolean;
  /** text-animation settings for the credits node's intro (ignored on other node types) */
  credits?: CreditsSettings;
  /** when true, prose renders instantly with no typewriter tick — use when MP3 voice is the real narration */
  noTypewriter?: boolean;
  /** when true, the big scene-title card that flashes on scene entry is not
   *  shown (the small HUD label remains). Useful for quiet cold opens. */
  hideSceneTitle?: boolean;
  /** INTERRUPTIBLE DIALOGUE — the replies surface over the FINAL line of the
   *  conversation instead of waiting for it to finish, so the player can cut
   *  the speaker off and a `timeLimitSeconds` clock is already running while
   *  they're still talking. Only the last visible beat can be interrupted
   *  (earlier lines belong to the speaker), and never one carrying an
   *  after-beat cut — that route owns the exit. See
   *  `src/game/conversationTimer.ts`. */
  interruptibleDialogue?: boolean;
  /** visual particle overlay; if undefined, falls back to legacy auto-matching based on ambient audio.
   * Extended to include dust motes (light-reactive), fog banks (volumetric),
   * ember/ash (rising), snow/drizzle, fireflies — each smarter and reacting
   * to lights, dim, wind and parallax. */
  particles?: "none" | "rain" | "drizzle" | "snow" | "smoke" | "storm" | "dust" | "fog" | "ember" | "ash" | "fireflies" | "motes";
  /** fine-tune the particle effect: density 0..2 (how many drops or motes; 1 = as designed), opacity 0..1 (how strong), wind 0..3
   *  (rain gusts; 1 = as designed). Unset leaves every effect exactly as it was. `tint` is reserved and not applied yet. */
  particleConfig?: { density?: number; wind?: number; tint?: string; opacity?: number };
  /** STAGE NODES — the walkable-stage configuration. When the
   * scene's nodeType is "stage" this drives the whole scene: the player
   * walks a character around `stage.floor`, interactable markers fire
   * hotspots through the normal action path, `startDialogue` markers open
   * the conversation, exits are goToScene markers. Ignored on other node
   * types. */
  stage?: StageSettings;
  /** cinematic camera motion applied to the scene background image */
  cinematic?: CinematicSettings;
  /** Show cinematic letterbox bars (top/bottom black bands) over the scene. */
  letterbox?: boolean;
  /** How the scene enters over the previous one.
   *  Classic: fade, fade-black, cut
   *  Cinematic: iris (circle wipe), wipe-left/right/up/down, slide-left/right,
   *  zoom (scale punch), glitch (chromatic aberration), burn (film burn flash)
   *  Defaults to "fade". "dissolve" crossfades the next scene's picture over this one, with no black between them. */
  transition?:
    | "fade"
    | "dissolve"
    | "fade-black"
    | "cut"
    | "iris"
    | "iris-in"
    | "wipe-left"
    | "wipe-right"
    | "wipe-up"
    | "wipe-down"
    | "slide-left"
    | "slide-right"
    | "zoom"
    | "glitch"
    | "burn";
  /** Seconds for the scene entry transition (default 0.5). */
  transitionSpeed?: number;
  /** Sound design that rides the scene entry transition — fully synthesized
   * in the WebAudio engine (zero asset budget): a bed that rises with the
   * cover and lands with an impact at the swap.
   *  - "auto" (undefined): picked from the transition itself —
   *    slide → whoosh, wipe/iris → swish, zoom → riser + sub-hit,
   *    glitch → zap, burn → sizzle, fade-black → thump, fade/cut → silent air.
   *  - an explicit kind overrides the auto pick (handy to make an entry
   *    mean more than the move implies: a `fade` can land with a `thump`,
   *    a `slide` can carry a `riser`).
   *  - "none": total silence (and "cut" is always silent — a cut is a cut).
   * Routed through the sfx bus, so the Effects fader and the sound toggle
   * control it. Reduced-motion play never plays the move, so no sound either. */
  transitionSound?: "auto" | "whoosh" | "swish" | "riser" | "thump" | "sizzle" | "zap" | "swell" | "none";
  /** The opening prose. NOT rendered on stage nodes (narrative there is
   * captions: `stage.enterCaption` + showText markers) — keep it "" and put
   * anything author-facing in `note`. */
  prose: string;
  dialogueBeats?: DialogueBeat[];
  hotspots?: Hotspot[];
  choices?: Choice[];
  onEnterActions?: OnEnterAction[];
  /** Composure-pressure interrogation on this scene's suspect (see
   * Interrogation). Pressing replies chip composure; at zero, trust decides
   * crack vs clamp. */
  interrogation?: Interrogation;
  isEnding?: boolean;
  endingData?: EndingData;
}

export interface Item {
  id: string;
  name: string;
  icon: string; // emoji glyph
  /** image URL for item icon; falls back to emoji if set */
  iconUrl?: string;
  description: string;
  flavorText: string;
  isClue?: boolean;
  combinableWith?: { targetItemId: string; resultItemId: string };
}

export type AssetType = "audio" | "video" | "image";

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  /** optional library folder ("sprites", "backgrounds", …) so generated and
   * uploaded assets can be grouped and found again; unfiled when unset */
  folder?: string;
  /** portable base64 data URL used for export/import and browser fallback */
  dataUrl: string;
  /** desktop-only playable copy written to the game media folder */
  fileUrl?: string;
  /** size in bytes */
  size: number;
  uploadedAt: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  /** image url or `emoji:<glyph>` token */
  avatarUrl: string;
  trustMeter: number;
  /** optional Web Speech voice settings chosen in Studio */
  voice?: { voiceName?: string; pitch?: number; rate?: number };
  /** ElevenLabs `voice_id` (a stock voice or a clone from the ElevenLabs
   *  console) used to generate this character's dialogue lines as MP3s in
   *  Studio. The API key itself is kept in the browser (localStorage),
   *  never in the story data. */
  elevenVoiceId?: string;
  /** Talking keyframes — sprite frames that auto-cycle as an on-scene portrait
   * while this character is the active speaker (a dialogue beat), the
   * VN / Ace-Attorney "animated while talking" look. Each entry is a url /
   * `asset:` reference; transparent PNGs work best. */
  talkingFrames?: string[];
  /** seconds each talking frame holds (default ~0.16) */
  talkingFrameDuration?: number;
  /** horizontal position of the talking sprite, % from left (default 50) */
  talkingX?: number;
  /** scale of the talking sprite (default 1) */
  talkingScale?: number;
  /** resting/neutral pose shown when this character is on-scene but NOT the
   * active speaker (falls back to talkingFrames[0] if unset). */
  talkingRest?: string;
  /** Talking portrait as ONE sprite-sheet image instead of loose frame files.
   * Named animations the engine looks up: "talk" while this character is the
   * active speaker, "rest" otherwise (a missing "rest" holds talk frame 1).
   * TAKES OVER from talkingFrames/talkingRest while set — the keyframe fields
   * are untouched and take effect again the moment the sheet is cleared.
   * Position/scale/flip still come from talkingX/Y/Scale/Flip. */
  talkingSheet?: import("./game/spriteSheet").SpriteSheet;
  /** Alternate talking sheets — outfits, moods, poses. While this character
   * is the ACTIVE SPEAKER and the current beat's `expression` matches a
   * variant's name (case-insensitive), that variant's sheet replaces
   * `talkingSheet` for the beat; everyone else (and beats with no matching
   * expression) uses the default sheet. */
  talkingSheets?: { name: string; sheet: import("./game/spriteSheet").SpriteSheet }[];
  /** opacity of the sprite while some OTHER character is speaking
   * (0.2–1, default 0.72 — lower = more see-through). */
  talkingDim?: number;
  /** mirror the sprite horizontally (face left) so two speakers can face
   * each other across the frame. */
  talkingFlip?: boolean;
  /** vertical position of the sprite, % up from the floor (default 0). */
  talkingY?: number;
}

export interface DeductionConnection {
  a: string; // clue item id or character id
  b: string;
  flagSet: string;
  revelation: string;
}

export interface DeductionBoard {
  suspectIds: string[];
  connections: DeductionConnection[];
}

/**
 * One travel destination on the story's map screen.
 *
 * Unlocking is DERIVED, never stored: a location is open exactly when its
 * `gating` passes against the live GlobalState (same `meetsGating` used by
 * choices and hotspots — flags, items, meters, trust all work). No unlock
 * list is written to the save, so loads, replays and NG+ can never disagree
 * with the story state that earned the access.
 */
export interface MapLocation {
  id: string;
  /** Pin label, e.g. "The Blue Room". */
  label: string;
  /** Scene the player lands on when travelling here. Resolved through
   * bypassedSceneId, so a note placeholder target passes through to the
   * first real scene like every other route. */
  targetSceneId: string;
  /** Pin position on the map image, in percent (0–100) of width/height. */
  x: number;
  y: number;
  /** Same gating vocabulary as choices/hotspots. Absent = always open. */
  gating?: Gating;
  /** true → a locked pin is not drawn at all (a secret place). Default
   * false → a locked pin shows as "???" so the player knows somewhere is
   * still waiting to be earned. */
  hiddenWhenLocked?: boolean;
  /** One teasing line shown on a locked (visible) pin, e.g. "Someone in the
   * diner knows the pier number." Falls back to the generic gating hint. */
  lockedHint?: string;
  /** Emoji drawn on the pin (default 📍). */
  icon?: string;
}

/** The story's travel map — a screen of flag-gated destinations. When
 * present (with at least one location) the player gets a 🗺 Travel Map entry
 * in the HUD menu and the T hotkey. When absent nothing map-related renders. */
/* ---------------- cursor art ---------------- */

/** Custom CURSOR art for one verb (and for the plain arrow, "default").
 *  Supply a transparent cutout (`image`) and it becomes the real CSS cursor —
 *  supply a sprite `sheet` and it plays as a little animated pointer that
 *  follows the mouse (a reaching hand, a turning key, a blinking eye).
 *  Cursors are authored per case on the 🎮 In-game theme tab. */
export interface CursorArt {
  /** Static art: a transparent PNG/WebP, ideally ≤64px (browsers cap cursor
   *  images at 128px). */
  image?: string;
  /** Animated art: a sprite sheet whose "loop" animation plays. Wins over
   *  `image` — an animated cursor is drawn as a sprite that tracks the mouse,
   *  so it is not bound by the CSS cursor size limit. */
  sheet?: import("./game/spriteSheet").SpriteSheet;
  /** Which point of the art is the HOTSPOT (the pixel that clicks):
   *  "top-left" (default — a pointing finger) or "center" (a reticle). */
  anchor?: "top-left" | "center";
  /** Size in px (default 32; CSS cursors clamp to 128). */
  size?: number;
}

/* ---------------- inventory presentation ---------------- */

/** How a case shows what the player is carrying.
 *  - "classic" (DEFAULT): the plain chip rail — today's dock, unchanged.
 *  - "container": a POUCH / CASE / SADDLEBAG sprite that pops open with the
 *    items laid out inside it. `image` is the art (anything transparent —
 *    a bag, a briefcase, a tool roll, a freezer bag); without one you get a
 *    stitched leather panel in the house style, so the mode never looks
 *    broken. Authors supply their own art per game.
 *  - "hidden": no on-screen dock at all (the case manages items off-screen). */
/**
 * How the inventory presents itself.
 *  - "classic"   : the chip rail docked in a corner (default).
 *  - "container" : a bag/case sprite with the loot laid out inside it.
 *  - "modal"     : a centred overlay with LARGE item art — the loot fills
 *                  the middle of the screen instead of hugging a corner.
 *  - "hidden"    : no inventory UI at all.
 */
export type InventoryDisplayMode = "classic" | "container" | "modal" | "hidden";

/** Where the dock sits on the plate. */
export type InventoryAnchor = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export interface InventorySettings {
  mode?: InventoryDisplayMode;
  /** Dock heading — "Inventory", "Satchel", "Saddlebags", "Case File"… */
  label?: string;
  /** Container art: a transparent PNG/WebP (url / `asset:`). The items are
   *  laid out inside its middle, so pick art with an open middle. */
  image?: string;
  /** Animated container (a lid that breathes) — a sprite sheet whose "loop"
   *  animation plays. Optional; `image` is the static fallback. */
  sheet?: import("./game/spriteSheet").SpriteSheet;
  anchor?: InventoryAnchor;
  /** Item columns inside the container (default 4). */
  columns?: number;
  /** Padding inside the container art where items sit, % of its box (default
   *  14 — tune it so the icons land in the pouch, not on the strap). */
  inset?: number;
  /** Container height in px (default 260). */
  height?: number;
  /** Start collapsed, showing only the heading and the count (default false). */
  startClosed?: boolean;
  /** MODAL mode only: pixel size of each item tile (default 132). The art is
   *  drawn at this size, so it reads as a real object rather than an icon. */
  tileSize?: number;
}

export interface StoryMap {
  /** Heading over the map screen (default "Travel Map"). */
  title?: string;
  /** Map artwork (url / gradient: / asset:). The pins are placed on this. */
  backgroundImage?: string;
  /** Opt-in: let the map ABSORB pure travel choices. When true, a choice
   * whose only job is navigating to a scene an UNLOCKED pin also reaches is
   * hidden in play, and the choice rail shows one "🗺 Open the map" action
   * instead — one road out, not two buttons for the same journey. Choices
   * with any side effect (flags, meters, items, memory, replies, timers,
   * presented evidence) are NEVER absorbed, and locked pins never absorb a
   * choice. Default false: authored choices win unless you opt in. */
  replaceTravelChoices?: boolean;
  locations: MapLocation[];
}

/** The KIND of game a case is — the axis the author picks before writing.
 *
 *  - "noir-rail" (default): the house style. Prose, beats, a choice rail —
 *    reading-forward, one decision at a time.
 *  - "adventure": a point-and-click room game — walkable rooms (STAGE nodes),
 *    verb cursors (look / take / talk / use / go), inventory puzzles, NPCs
 *    with idle animation. See docs/adventure-mode.md.
 *  - "vn": a visual novel — full-screen portraits, minimal UI, dialogue-led.
 *
 *  Today this is a DECLARATION (Studio shows it, the validator reads it, and
 *  Studio's tooling can be tailored per kind). The interaction models share
 *  one engine, so a case can mix: an adventure case still plays prose beats
 *  when a conversation starts. */
export type GameKind = "noir-rail" | "adventure" | "vn" | "first-person";

export interface Story {
  /** Stamped by the tool that generates a built-in story (the film): a fingerprint of that build. A Studio draft or a
   *  publication made from an older build carries the older stamp, so the newsstand can say it is not the shipped story. */
  builtinRevision?: string;
  /** Default halftone/grain setting for a new player. Existing player
   * preference still wins. False is useful for photographic adventures. */
  pulpPaper?: boolean;
  id: string;
  title: string;
  tagline: string;
  /** How the INVENTORY is presented on screen. Opt-in per case, so a point-
   *  and-click can carry a leather satchel with the loot inside it while
   *  every other game keeps exactly the dock it has today.
   *  See InventorySettings and docs/adventure-mode.md. */
  inventoryDisplay?: InventorySettings;
  /** What kind of game this case is (default "noir-rail"). See GameKind. */
  gameKind?: GameKind;
  coverImage: string;
  startSceneId: string;
  scenes: SceneNode[];
  items: Item[];
  characters: Character[];
  /** Story-wide walker appearance — the In-game theme's 🚶 "Player character"
   *  setting. Every 🚶 stage scene uses it as its default walker; a scene that
   *  sets its own stage.playerSheet / playerImage overrides it. Lets a story
   *  define its protagonist ONCE (e.g. a Ben-like biker) instead of per room.
   *  Purely additive: stories that never set it behave exactly as before. */
  playerSprite?: { image?: string; sheet?: import("./game/spriteSheet").SpriteSheet };
  deduction?: DeductionBoard;
  /** Optional travel map: flag/item/meter-gated destinations the player can
   * jump to from the 🗺 map screen. See StoryMap. */
  map?: StoryMap;
  /** explicit win/lose rules surfaced to the player */
  briefing?: CaseBriefing;
  /** Per-verb CURSOR art — a pointing hand for take, an eye for look, a
   *  turning key for use, and a plain arrow under "default". Opt-in: with no
   *  art the game keeps its system cursors. Authored on the 🎮 In-game theme
   *  tab. See CursorArt. */
  cursorArt?: Partial<Record<import("./types").CursorKind | "default", CursorArt>>;
  /** The sprite at the CENTRE of the object-first skull pie menu (Full
   *  the skull pie — see StageSettings.objectVerbMenu / objectMenuHold).
   *  An image url / `asset:` token or an `emoji:` glyph; rendered BIG in the
   *  middle of the ring of verbs whenever the pie opens. Purely additive:
   *  unset keeps the default skull emoji and every non-opt-in game is
   *  untouched. Authored on the 🎮 In-game theme tab, beside the cursors. */
  verbMenuIcon?: string;
  /** OPT-IN master switch for the object-first verb menu (the skull pie).
   *  The menu is already per-scene opt-in (StageSettings.objectVerbMenu);
   *  this is the STORY-wide kill-switch. Default undefined = "on" (scenes
   *  that opt in keep their menu, so existing opt-in stories are
   *  untouched). Set `false` to disable the pie everywhere — every scene's
   *  objectVerbMenu / objectMenuHold is ignored — so a game that never uses
   *  it never shows it. Authored on the 🎮 In-game theme tab. */
  verbMenuEnabled?: boolean;
  /** Default "that doesn't work" lines for the verb coin, per verb. An
   *  author-supplied Hotspot.wrongVerbText wins; otherwise one of these is
   *  picked (varied, so repeating a failed verb doesn't read like a loop). */
  verbResponses?: Partial<Record<import("./types").VerbId, string[]>>;
  /** Optional episodic structure. When present the story is presented as a
   * season: a season screen, per-episode title cards + recaps, per-episode
   * save slots, and per-episode endings. When absent the story plays as one
   * continuous case exactly as before. */
  episodes?: Episode[];
  /** label for the season on the episode screen (default "Season One") */
  seasonTitle?: string;
  /** Optional act structure.
   *
   * Membership is DERIVED, never declared: an act owns every scene reachable
   * by choice edges from its `startSceneId`, stopping at any other act's
   * start scene (see routeGraph.scenesInAct). Authors therefore only nominate
   * where each act BEGINS — the graph decides the rest, and it can never fall
   * out of sync with the story the player actually walks.
   *
   * The trade-off is that a single cross-act link silently merges two acts,
   * so validateStory() checks for overlap, empty acts and orphaned scenes.
   *
   * Acts are a *presentational* grouping inside a
   * single continuous run — unlike episodes they don't split saves or endings.
   * They give the story act title cards and scope the route flowchart, so the
   * chart shown at the end of an act covers that act only. */
  acts?: Act[];
  /** Author notes for story flags: flag id -> one short line of what the
   * flag MEANS in-story. Shown in Studio's 🏷 Flags tab (next to where the
   * flag is set), echoed by a dialogue beat that recalls the flag (in place
   * of the player's exact words), and listed in the player's Case Progress
   * "Story so far" readout. */
  flagNotes?: Record<string, string>;
  /** Look of the bottom dialogue/choice panel. Story-wide, so the reading
   * surface stays consistent from scene to scene. */
  dialogueBox?: DialogueBoxTheme;
  /** Studio canvas layout: sceneId -> position, plus an OPTIONAL authored size.
   *  w/h are only present once an author has resized that card by hand; every
   *  card without them renders at the default width, so old stories and fresh
   *  scenes are unaffected. Purely an editor concern — the game never reads it. */
  layout?: Record<string, { x: number; y: number; w?: number; h?: number }>;
  /** transport-only array to package IndexedDB assets during import/export */
  assets?: MediaAsset[];
}

/**
 * Look and behaviour of the dialogue/choice panel at the bottom of the frame.
 *
 * The panel is anchored to the bottom of the screen, so anything that changes
 * its height moves every control inside it. While prose types out line by
 * line the box grows upward, which used to drag the inline narrate/skip
 * buttons up with it — a moving target the player is trying to click.
 * `reserveLines` fixes a floor for the text area so the panel keeps one
 * height for the whole scene and the controls stay put.
 */
export interface DialogueBoxTheme {
  /** Reserve room for this many lines of prose so the panel doesn't grow as
   * text types in. 0 disables the reservation (the old reflowing behaviour).
   * Default 3. */
  reserveLines?: number;
  /** Backdrop image behind the panel (url / gradient: / asset:). When unset
   * the panel keeps the plain scrim. */
  backgroundImage?: string;
  /** Opacity of the panel backdrop, 0–1. Default 0.85. */
  backgroundOpacity?: number;
  /** Tint drawn under the backdrop image, as a CSS colour. Default near-black. */
  backgroundColor?: string;
  /** Blur the scene art behind the panel, in px. Default 0 (no blur). */
  backdropBlur?: number;
  /** Draw a hairline border + shadow around the panel so it reads as a
   * physical card rather than a gradient. Default false. */
  bordered?: boolean;

  /* ------------------------------------------------------------------ *
   *  In-game text type / size
   * ------------------------------------------------------------------ */
  /** Typeface for body prose + dialogue lines (the big reading text). */
  bodyFont?: "type" | "pulp" | "poster" | "elegant" | "epic" | "modern";
  /** Typeface for headings — nameplates, HUD labels, scene titles. */
  headingFont?: "pulp" | "poster" | "epic" | "ui" | "elegant" | "type";
  /** Body text size scale, 0.8–1.4 (1 = default). Scales the reading text
   * and the line reservation proportionally. */
  textScale?: number;

  /* ------------------------------------------------------------------ *
   *  HUD / accent theme
   * ------------------------------------------------------------------ */
  /** Named HUD colour scheme, applied story-wide. "classic" keeps the
   * default noir palette; the rest re-tint gold/neon/cyan/crimson accents. */
  hudTheme?: HudThemeId;
  /** Custom primary accent (hex), overrides the scheme's accent/gold for
   * nameplates, highlights and the choice focus. Used when set. */
  accentColor?: string;
  /** Custom danger/heat colour (hex), overrides crimson (bad gates, HEAT). */
  dangerColor?: string;
  /** Hide the small ⏱ countdown / autosave style readouts and similar HUD
   * chrome for a cleaner, more cinematic frame. */
  minimalHud?: boolean;

  /* ------------------------------------------------------------------ *
   *  Investigation panel visibility
   * ------------------------------------------------------------------ *
   * Each panel is AUTO by default: it only appears when the story actually
   * uses the feature (corkboard needs `deduction`, travel map needs `map`
   * with locations; case progress always has content so auto = shown).
   * These flags force a panel OFF for stories that want a cleaner frame.
   * There is deliberately no "force show" — surfacing an empty corkboard or
   * map a story never feeds would only confuse the player. */
  /** Hide the ▤ Case Progress drawer (top-left) entirely. */
  hideCaseProgress?: boolean;
  /** Hide the 📌 Corkboard even when the story defines a deduction board. */
  hideCorkboard?: boolean;
  /** Hide the 🗺 Travel Map even when the story defines map locations. */
  hideMap?: boolean;
}

/** Named in-game HUD colour schemes (see HUD_THEMES in src/cinematic.ts). */
export type HudThemeId =
  | "classic"
  | "neon-noir"
  | "sepia-pulp"
  | "midnight-teal"
  | "venetian-red"
  | "ghost-green";

/** Global config for the main title / landing page */
export interface TitleTheme {
  titleText?: string;
  tagline?: string;
  musicUrl?: string;
  bgImageUrl?: string;
  neonColor?: string; // custom flicker neon hex code
  /** FEATURED CASES — story ids given a big banner card at the TOP of the
   *  newsstand, above the ordinary grid: the front-page splash of the
   *  magazine rack. Order here is the order they appear, so this doubles as
   *  the running order of the front page. Ids that no longer resolve to a
   *  visible story are ignored (a hidden or deleted case must not leave a
   *  hole at the top of the stand). Empty/omitted = no featured strip and
   *  the newsstand looks exactly as it always did. */
  featuredStoryIds?: string[];
}

export interface GlobalState {
  activeFlags: Set<string>;
  inventory: Item[];
  meters: Record<MeterKey, number>;
  characterTrust: Record<string, number>;
  /** memoryLog tag -> the player's exact line. Set when a choice carrying a
   * memoryLog tag is picked; read by DialogueBeat.recalls and Gating.requiresMemories.
   * This is what lets NPCs recall *your* words, not merely a boolean. */
  memories: Record<string, string>;
}

/* ---------------- audio extensibility contract ---------------- */

export interface AudioTrack {
  id: string;
  label: string;
  kind: "synth" | "file";
  /** mp3/ogg url when kind === "file" */
  url?: string;
  /** synth preset name when kind === "synth" */
  preset?: string;
  baseVolume?: number;
}

/* ---------------- persistence ---------------- */

export interface UnlockedEnding {
  sceneId: string;
  headline: string;
  tier: EndingData["tier"];
  unlockedAt: number;
  /** which episode this ending closed, when the story is episodic */
  episodeId?: string;
}

/** Per-episode completion record: which episodes a player has cleared, how they
 * ended them, and the world state carried out of each one. The carry-over is
 * what makes episode 2 open with the consequences of episode 1. */
export interface EpisodeProgress {
  episodeId: string;
  /** the ending scene that closed it */
  endingSceneId: string;
  endingHeadline: string;
  endingTier: EndingData["tier"];
  completedAt: number;
  /** world state snapshot at the moment the episode ended — loaded as the
   * starting state of the next episode */
  carry: {
    activeFlags: string[];
    inventory: string[];
    meters: Record<MeterKey, number>;
    characterTrust: Record<string, number>;
    memories: Record<string, string>;
  };
}

/** storyId -> episodeId -> progress */
export type SeasonLog = Record<string, Record<string, EpisodeProgress>>;

export type EndingLog = Record<string, UnlockedEnding[]>; // storyId -> endings

/** A single save-slot snapshot of a playthrough, kept small so it fits easily
 * in localStorage. Item ids and flags are stored as strings and rebuilt against
 * the story on load. */
/** One decision point in the ordered record of a playthrough. Sets can't
 * express order, so the flowchart needs its own append-only log: which scene,
 * which choice was taken, and — crucially — which sibling choices existed at
 * that moment and were not taken. That's what makes the chart legible as
 * "here's the road you didn't walk". */
export interface JourneyStep {
  sceneId: string;
  sceneTitle: string;
  /** the chosen choice's id, or null for an automatic//single transition */
  choiceId: string | null;
  choiceText?: string;
  attitudeTag?: AttitudeTag;
  /** sibling choices present at this node. `taken` marks the one picked;
   * `locked` marks options that were visible but gated shut. */
  options: {
    id: string;
    text: string;
    taken: boolean;
    locked?: boolean;
    attitudeTag?: AttitudeTag;
  }[];
  /** the "X will remember that" line, if this choice carried one */
  rememberLine?: string;
  /** timed-out quick-time events are decisions too — the player decided by
   * not deciding, and the chart should say so. */
  timedOut?: boolean;
  /** trust deltas applied here, for the relationship rail */
  trustChanges?: TrustChange[];
  /** flags this decision set — the choice's own consequences, or the
   * timed-out consequences of an expired quick-time prompt. Recorded so the
   * end-of-part flowchart and end-of-act route map can list the "route
   * notes" (with Story.flagNotes) for the stretch just played. */
  flagsSet?: string[];
}

export interface GameSave {
  /** Save-slot schema version (see SAVE_SCHEMA / migrateSave in logic.ts).
   *  Absent on saves written before versioning existed — those ARE v1.
   *  Reads refuse versions NEWER than the running build rather than
   *  mis-loading a shape they don't understand. */
  schema?: number;
  /** Where the seeded gameplay RNG had got to when this snapshot was taken
   *  (see src/game/rng.ts). Absent for an unseeded run — live dice have no
   *  position worth restoring. Purely additive, so schema stays v1: an older
   *  save simply has no rng field and the stream is left wherever it is. */
  rng?: import("./game/rng").RngSnapshot;
  storyId: string;
  /** which episode this save belongs to — save slots are per-episode so each
   * chapter keeps its own three slots. */
  episodeId?: string;
  sceneId: string;
  sceneTitle: string;
  savedAt: number;
  activeFlags: string[];
  inventory: string[]; // item ids — rebuilt from the story on load
  meters: Record<MeterKey, number>;
  characterTrust: Record<string, number>;
  memories: Record<string, string>;
  proseAcknowledged: boolean;
  beatIdx: number;
  usedHotspots: string[];
  usedChoices: string[];
  visitedScenes: string[];
  encounteredCharacters: string[];
  expiredChoices: string[];
  choiceClocks: Record<string, number>;
  /** live interrogation composure by sceneId (initial until first pressed,
   *  0 = broken/clamped). Persists so a mid-interrogation save keeps its state. */
  composure?: Record<string, number>;
  /** scenes whose suspect has already steadied once (recovery is one-shot). */
  steadied?: Record<string, boolean>;
  /** dialogue beat ids the player has actually SEEN play, story-wide. A
   *  revisit resumes after the last seen beat instead of skipping every
   *  AUTHORED beat — so a gated beat that never played on the first visit
   *  still surfaces on a later one, once its flag is set. */
  seenBeats?: string[];
  /** ordered decision log powering the end-of-part flowchart */
  journey?: JourneyStep[];
  /** how many journey steps were already charted at the last part break */
  chartedUpTo?: number;
  /** acts whose title card has already played, so loading mid-story doesn't
   * replay a card the player has seen */
  seenActs?: string[];
}
