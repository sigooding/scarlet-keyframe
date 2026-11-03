/**
 * Lights and lens flares of a shot, as the Inspector's "Lights & flares" panel edits them.
 *
 * The engine (vendor/scarlet-reel/cinematic.ts) reads three kinds of source:
 *   - `lights`      a list of glow points; each may carry a flare of its own (`flare`)
 *   - `lensFlare`   one stand-alone flare
 *   - `flares`      a list of stand-alone flares
 * plus three old loose fields for a single light (`lightSource`, `lightColor`, `lightRadius`) that are only read
 * when `lights` is empty. Every function here is pure: it takes the shot's current cinematic settings and returns a
 * PATCH (field name -> new value, `undefined` meaning "remove the field") for the app to apply as ONE edit.
 */
import { LENS_FLARE_PRESETS, lightPoints, resolveSingleLensFlare } from "../../vendor/scarlet-reel/cinematic";
import type { CinematicSettings, LensFlarePreset, LensFlareSettings, LightPoint } from "../../vendor/scarlet-reel/types";

/** Changes to a shot's cinematic settings, by field name. `undefined` removes the field. */
export type CinematicPatch = Record<string, unknown>;

/** Which stand-alone flare: the single `lensFlare`, or an entry of the `flares` list. */
export type FlareRef = { source: "single" } | { source: "list"; index: number };

/** One thing on the picture that can be selected, moved and edited. */
export type PointTarget = { kind: "light"; index: number } | { kind: "flare"; ref: FlareRef };

export interface EditableFlare {
  ref: FlareRef;
  flare: LensFlareSettings;
}

export interface LightsAndFlares {
  lights: LightPoint[];
  flares: EditableFlare[];
}

/** The flare looks the panel offers (the engine's own presets, minus "custom"). */
export const FLARE_PRESET_IDS: readonly Exclude<LensFlarePreset, "custom">[] = [
  "anamorphic-blue",
  "warm-amber",
  "sci-fi-cyan",
  "neon-noir",
  "vintage-35mm",
  "natural-sun",
  "interrogation",
  "emerald",
];

export const DEFAULT_FLARE_PRESET: LensFlarePreset = "anamorphic-blue";

export function flarePresetLabel(id: LensFlarePreset | undefined): string {
  return LENS_FLARE_PRESETS[id ?? DEFAULT_FLARE_PRESET]?.name ?? String(id);
}

export function flarePresetHint(id: LensFlarePreset | undefined): string {
  return LENS_FLARE_PRESETS[id ?? DEFAULT_FLARE_PRESET]?.tagline ?? "";
}

export interface LightPreset {
  id: string;
  label: string;
  hint: string;
  light: Omit<LightPoint, "x" | "y" | "flare">;
}

/** Ready-made lights, so a new one starts looking like something. Brightness 0-1, size = % of the picture's width. */
export const LIGHT_PRESETS: readonly LightPreset[] = [
  { id: "warm-lamp", label: "Warm lamp", hint: "A soft amber bulb that breathes slowly", light: { color: "#ffb45a", intensity: 0.55, size: 30, pulseSeconds: 3.5, pulseAmount: 0.3 } },
  { id: "street-light", label: "Street light", hint: "A steady sodium glow", light: { color: "#ffd27a", intensity: 0.6, size: 24, pulseSeconds: 4, pulseAmount: 0 } },
  { id: "window", label: "Window glow", hint: "Warm light from a lit window", light: { color: "#ffc878", intensity: 0.42, size: 38, pulseSeconds: 4, pulseAmount: 0 } },
  { id: "neon", label: "Neon sign", hint: "Pink neon with a nervous flicker", light: { color: "#ff3d8b", intensity: 0.6, size: 26, pulseSeconds: 0.9, pulseAmount: 0.75 } },
  { id: "moon", label: "Cold moonlight", hint: "A wide, cool blue wash", light: { color: "#8fb8ff", intensity: 0.35, size: 46, pulseSeconds: 6, pulseAmount: 0.2 } },
  { id: "headlights", label: "Headlights", hint: "A hard white-yellow glare", light: { color: "#fff3c4", intensity: 0.75, size: 18, pulseSeconds: 4, pulseAmount: 0 } },
  { id: "fire", label: "Fire or candle", hint: "A warm glow that flickers", light: { color: "#ff8a3d", intensity: 0.6, size: 22, pulseSeconds: 0.9, pulseAmount: 0.75 } },
];

export type BreathingId = "steady" | "slow" | "flicker";

/** How a light's glow moves, in words. */
export const BREATHING: readonly { id: BreathingId; label: string; pulseSeconds: number; pulseAmount: number }[] = [
  { id: "steady", label: "Steady", pulseSeconds: 4, pulseAmount: 0 },
  { id: "slow", label: "Slow", pulseSeconds: 3.5, pulseAmount: 0.3 },
  { id: "flicker", label: "Flicker", pulseSeconds: 0.9, pulseAmount: 0.75 },
];

/** Which of the three ways a light's own numbers match, or "custom" (the engine's default is a full slow breath). */
export function breathingOf(light: LightPoint): BreathingId | "custom" {
  const amount = light.pulseAmount ?? 1;
  const seconds = light.pulseSeconds ?? 2.8;
  if (amount <= 0.02) return "steady";
  for (const mode of BREATHING) {
    if (mode.id !== "steady" && Math.abs(amount - mode.pulseAmount) <= 0.08 && Math.abs(seconds - mode.pulseSeconds) <= 0.4) return mode.id;
  }
  return "custom";
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

function withoutUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = item;
  return out as T;
}

/** Everything on the picture that can be edited: the lights (old single-light fields included) and every flare. */
export function readLightsAndFlares(cinematic?: CinematicSettings): LightsAndFlares {
  const flares: EditableFlare[] = [];
  if (cinematic?.lensFlare) flares.push({ ref: { source: "single" }, flare: cinematic.lensFlare });
  (cinematic?.flares ?? []).forEach((flare, index) => {
    if (flare) flares.push({ ref: { source: "list", index }, flare });
  });
  return { lights: lightPoints(cinematic), flares };
}

export function countLightsAndFlares(cinematic?: CinematicSettings): number {
  const { lights, flares } = readLightsAndFlares(cinematic);
  return lights.length + flares.length;
}

/** Where a new light or flare goes: the shot's focal point, shifted for each one already there so they do not stack. */
export function defaultSpot(cinematic: CinematicSettings | undefined, alreadyThere: number): { x: number; y: number } {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s+(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(String(cinematic?.focalPoint ?? ""));
  const base = match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 50, y: 35 };
  const x = ((((base.x + 9 * alreadyThere) % 100) + 100) % 100);
  return { x: round1(clamp(x, 4, 96)), y: round1(clamp(base.y, 4, 96)) };
}

/** The patch that writes a new list of lights. The three old single-light fields are cleared with it, because the
 *  engine ignores them once `lights` exists and would bring the old light back if the list were ever emptied. */
function lightsPatch(cinematic: CinematicSettings | undefined, lights: LightPoint[]): CinematicPatch {
  const patch: CinematicPatch = { lights: lights.length ? lights : undefined };
  if (cinematic?.lightSource !== undefined) patch.lightSource = undefined;
  if (cinematic?.lightColor !== undefined) patch.lightColor = undefined;
  if (cinematic?.lightRadius !== undefined) patch.lightRadius = undefined;
  return patch;
}

export function addLight(
  cinematic: CinematicSettings | undefined,
  presetId: string,
  at?: { x: number; y: number },
): { patch: CinematicPatch; target: PointTarget } {
  const preset = LIGHT_PRESETS.find((item) => item.id === presetId) ?? LIGHT_PRESETS[0];
  const lights = lightPoints(cinematic).map((light) => ({ ...light }));
  const spot = at ?? defaultSpot(cinematic, countLightsAndFlares(cinematic));
  lights.push({ ...preset.light, x: spot.x, y: spot.y });
  return { patch: lightsPatch(cinematic, lights), target: { kind: "light", index: lights.length - 1 } };
}

export function updateLight(cinematic: CinematicSettings | undefined, index: number, change: Partial<LightPoint>): CinematicPatch {
  const lights = lightPoints(cinematic).map((light) => ({ ...light }));
  if (!lights[index]) return {};
  lights[index] = withoutUndefined({ ...lights[index], ...change });
  return lightsPatch(cinematic, lights);
}

/** Take a light away. A flare that followed it keeps the light's position instead; flares that followed later lights
 *  now follow them one place down. */
export function removeLight(cinematic: CinematicSettings | undefined, index: number): CinematicPatch {
  const all = lightPoints(cinematic);
  const gone = all[index];
  if (!gone) return {};
  const patch = lightsPatch(cinematic, all.filter((_, i) => i !== index).map((light) => ({ ...light })));
  const relink = (flare: LensFlareSettings): LensFlareSettings => {
    if (flare.linkToLight === undefined) return flare;
    if (flare.linkToLight === index) return withoutUndefined({ ...flare, linkToLight: undefined, x: gone.x, y: gone.y });
    if (flare.linkToLight > index) return { ...flare, linkToLight: flare.linkToLight - 1 };
    return flare;
  };
  if (cinematic?.lensFlare) {
    const next = relink(cinematic.lensFlare);
    if (next !== cinematic.lensFlare) patch.lensFlare = next;
  }
  if (cinematic?.flares?.length) {
    const next = cinematic.flares.map((flare) => (flare ? relink(flare) : flare));
    if (next.some((flare, i) => flare !== cinematic.flares![i])) patch.flares = next;
  }
  return patch;
}

/** Give a light a lens flare of its own (a look), or take it away (`false`). Other custom flare settings stay. */
export function setLightFlare(cinematic: CinematicSettings | undefined, index: number, preset: LensFlarePreset | false): CinematicPatch {
  const light = lightPoints(cinematic)[index];
  if (!light) return {};
  if (preset === false) return updateLight(cinematic, index, { flare: undefined });
  const custom = typeof light.flare === "object" && light.flare ? light.flare : {};
  return updateLight(cinematic, index, { flare: { ...custom, preset } });
}

/** The look of a light's own flare, or `null` when it has none. */
export function lightFlarePreset(light: LightPoint): LensFlarePreset | null {
  if (!light.flare) return null;
  return typeof light.flare === "object" ? (light.flare.preset ?? DEFAULT_FLARE_PRESET) : DEFAULT_FLARE_PRESET;
}

export function addFlare(
  cinematic: CinematicSettings | undefined,
  preset: LensFlarePreset,
  at?: { x: number; y: number },
): { patch: CinematicPatch; target: PointTarget } {
  const spot = at ?? defaultSpot(cinematic, countLightsAndFlares(cinematic));
  const flares = [...(cinematic?.flares ?? [])];
  flares.push({ preset, x: spot.x, y: spot.y, intensity: 0.75 });
  return { patch: { flares }, target: { kind: "flare", ref: { source: "list", index: flares.length - 1 } } };
}

export function updateFlare(cinematic: CinematicSettings | undefined, ref: FlareRef, change: Partial<LensFlareSettings>): CinematicPatch {
  if (ref.source === "single") {
    if (!cinematic?.lensFlare) return {};
    return { lensFlare: withoutUndefined({ ...cinematic.lensFlare, ...change }) };
  }
  const flares = [...(cinematic?.flares ?? [])];
  if (!flares[ref.index]) return {};
  flares[ref.index] = withoutUndefined({ ...flares[ref.index], ...change });
  return { flares };
}

export function removeFlare(cinematic: CinematicSettings | undefined, ref: FlareRef): CinematicPatch {
  if (ref.source === "single") return cinematic?.lensFlare ? { lensFlare: undefined } : {};
  const flares = (cinematic?.flares ?? []).filter((_, index) => index !== ref.index);
  return { flares: flares.length ? flares : undefined };
}

/** The flare the target points at, if it is still there. */
export function flareAt(cinematic: CinematicSettings | undefined, ref: FlareRef): LensFlareSettings | undefined {
  return ref.source === "single" ? cinematic?.lensFlare : cinematic?.flares?.[ref.index];
}

/** True when a flare takes its position from a light, so it cannot be placed on its own. */
export function isFollowingLight(flare: LensFlareSettings | undefined, lights: readonly LightPoint[]): boolean {
  return flare?.linkToLight !== undefined && Boolean(lights[flare.linkToLight]);
}

/** Put a light or flare at a spot on the picture (percent of its width and height). A flare that follows a light is
 *  not moved: move the light. */
export function moveTo(cinematic: CinematicSettings | undefined, target: PointTarget, at: { x: number; y: number }): CinematicPatch {
  const spot = { x: round1(clamp(at.x, 0, 100)), y: round1(clamp(at.y, 0, 100)) };
  if (target.kind === "light") return updateLight(cinematic, target.index, spot);
  if (isFollowingLight(flareAt(cinematic, target.ref), lightPoints(cinematic))) return {};
  return updateFlare(cinematic, target.ref, spot);
}

export function sameTarget(a: PointTarget | null | undefined, b: PointTarget | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "light") return a.index === (b as { index: number }).index;
  const left = a.ref;
  const right = (b as { ref: FlareRef }).ref;
  return left.source === right.source && (left.source === "single" || left.index === (right as { index: number }).index);
}

/** True when the target still points at something in these settings. */
export function targetExists(cinematic: CinematicSettings | undefined, target: PointTarget | null | undefined): boolean {
  if (!target) return false;
  return target.kind === "light" ? Boolean(lightPoints(cinematic)[target.index]) : Boolean(flareAt(cinematic, target.ref));
}

export interface PointMarker {
  target: PointTarget;
  kind: "light" | "flare";
  x: number;
  y: number;
  label: string;
}

/** Where everything sits on the picture, for the rings drawn over the viewer. */
export function pointMarkers(cinematic?: CinematicSettings): PointMarker[] {
  const { lights, flares } = readLightsAndFlares(cinematic);
  const markers: PointMarker[] = lights.map((light, index) => ({
    target: { kind: "light", index },
    kind: "light",
    x: clamp(light.x ?? 50, 0, 100),
    y: clamp(light.y ?? 30, 0, 100),
    label: `Light ${index + 1}`,
  }));
  flares.forEach(({ ref, flare }, order) => {
    const resolved = resolveSingleLensFlare(flare, lights);
    markers.push({ target: { kind: "flare", ref }, kind: "flare", x: resolved.x, y: resolved.y, label: `Flare ${order + 1}` });
  });
  return markers;
}
