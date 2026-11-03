/**
 * How the Clip tab's "More effects" area groups the cinematic fields, and which of them it shows.
 *
 * The data model (src/core/cinematicSchema.ts) is unchanged: this only decides where a field is shown. Every field
 * of the schema is placed in exactly one place below, and a test checks that none is lost. A field that has a value
 * is always shown, whatever the camera mode, so nothing that is active is ever hidden.
 */
import { CINEMATIC_GROUPS, FIELD_BY_KEY, type CinematicField } from "./cinematicSchema";

type Cin = Record<string, unknown> | undefined;

/** Camera fields in the order they are shown. */
const CAMERA_ORDER = [
  "mode",
  "focalPoint",
  "zoomDuration",
  "panDistance",
  "panDirection",
  "shakeAmount",
  "shakeRotation",
  "shakeDuration",
  "dollyDirection",
  "dollyDistance",
  "dollyDuration",
  "dollyVertical",
  "dollyZoomAmount",
  "dollyZoomDuration",
  "dollyZoomDirection",
  "dollyZoomBlur",
  "dollyZoomOrigin",
] as const;

/** Fields that only mean something for one camera mode. */
const MODE_FIELDS: Record<string, readonly string[]> = {
  pan: ["panDistance", "panDirection"],
  shake: ["shakeAmount", "shakeRotation", "shakeDuration"],
  dolly: ["dollyDirection", "dollyDistance", "dollyDuration", "dollyVertical"],
  "dolly-zoom": ["dollyZoomAmount", "dollyZoomDuration", "dollyZoomDirection", "dollyZoomBlur", "dollyZoomOrigin"],
};

const ALWAYS_SHOWN_CAMERA = ["mode", "focalPoint", "zoomDuration"];

/** A simple start-to-end move, an alternative to keyframes (the Animation section). */
export const FRAMING_KEYS = ["zoom", "startZoom", "endZoom", "startFocalPoint", "endFocalPoint", "easing", "speedRamp"] as const;

export const FOREGROUND_KEYS = [
  "foregroundImage",
  "foregroundScale",
  "foregroundFit",
  "foregroundAnchor",
  "foregroundX",
  "foregroundY",
  "foregroundRotation",
  "foregroundZoom",
  "foregroundZoomDuration",
  "foregroundBlendMode",
  "foregroundOpacity",
] as const;

export const DEPTH_KEYS = ["depthMap", "depthPlate", "depthMotion", "depthAmount", "depthSeconds", "depthDirection", "depthFocus", "parallaxDepth"] as const;

export const LOOK_KEYS = ["colorGrade", "filmGrade", "filmGradeStrength", "dimAmount", "vignette", "vignetteStrength", "grain", "grainOpacity"] as const;

export const ATMOSPHERE_KEYS = [
  "volumetricShafts",
  "shaftsIntensity",
  "depthFog",
  "fogStrength",
  "shadowCasting",
  "shadowIntensity",
  "rainOnLens",
  "rainLensIntensity",
  "dofOnTalk",
  "dofBlur",
] as const;

/**
 * Edited by a panel of their own, so not listed again as raw data (the header's Copy / Paste effects still carries
 * them): the "Lights & flares" panel (the lighting style, the lights, the single lens flare, the flare list) and the
 * Depth group's "Cutout layers" control (`depthCutouts`).
 */
export const PANEL_KEYS = ["hitchcockLighting", "lights", "lensFlare", "flares", "depthCutouts"] as const;

/** Settings that have no panel of their own yet: raw data, for people who want to edit it as JSON. */
export const ADVANCED_KEYS = ["parallaxLayers", "foregroundAnimation", "foregroundExtras"] as const;

/** The three old single-light fields, shown only on a shot that still has them. */
export const LEGACY_LIGHT_KEYS = ["lightSource", "lightColor", "lightRadius"] as const;

const hasValue = (cin: Cin, key: string) => cin?.[key] !== undefined && cin?.[key] !== null && cin?.[key] !== "";

/** The camera fields to show: the common ones, those of the current mode, and any that already hold a value. */
export function cameraFieldKeys(cin: Cin): string[] {
  const mode = String(cin?.mode ?? "pan");
  const wanted = new Set<string>([...ALWAYS_SHOWN_CAMERA, ...(MODE_FIELDS[mode] ?? [])]);
  for (const key of CAMERA_ORDER) if (hasValue(cin, key)) wanted.add(key);
  return CAMERA_ORDER.filter((key) => wanted.has(key));
}

/** How many of these fields hold a value on the shot (for a small "3 set" badge). */
export function countSet(cin: Cin, keys: readonly string[]): number {
  return keys.filter((key) => hasValue(cin, key)).length;
}

/** The old single-light fields this shot still has. */
export function legacyLightKeysInUse(cin: Cin): string[] {
  return LEGACY_LIGHT_KEYS.filter((key) => hasValue(cin, key));
}

/** The raw-data fields to list: all of them, plus the old light fields when the shot still has them. */
export function advancedFieldKeys(cin: Cin): string[] {
  return [...ADVANCED_KEYS, ...legacyLightKeysInUse(cin)];
}

/** "Foreground scale" -> "Scale" inside the Foreground group, where the heading already says what it is about. */
export function foregroundRowLabel(label: string): string {
  if (label === "Foreground subject") return "Picture";
  const short = label.replace(/^Foreground\s+/i, "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function fieldsFor(keys: readonly string[]): CinematicField[] {
  return keys.map((key) => FIELD_BY_KEY.get(key)).filter((item): item is CinematicField => Boolean(item));
}

/** Every schema field key, for the check that the layout loses none. */
export function allSchemaKeys(): string[] {
  return CINEMATIC_GROUPS.flatMap((group) => group.fields.map((item) => item.key));
}

/** Every key the layout places somewhere (the camera fields in every mode included). */
export function allPlacedKeys(): string[] {
  return [
    ...CAMERA_ORDER,
    ...FRAMING_KEYS,
    ...FOREGROUND_KEYS,
    ...DEPTH_KEYS,
    ...LOOK_KEYS,
    ...ATMOSPHERE_KEYS,
    ...PANEL_KEYS,
    ...ADVANCED_KEYS,
    ...LEGACY_LIGHT_KEYS,
  ];
}

/** Friendly names for the noir lighting styles. */
export const NOIR_LIGHTING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "eye-light", label: "Eye light" },
  { value: "venetian-slats", label: "Venetian blinds" },
  { value: "key-slash", label: "Key slash" },
  { value: "silhouette-rim", label: "Silhouette rim" },
];
