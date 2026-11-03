import { describe, expect, it } from "vitest";
import { resolveLensFlares, resolveLights } from "../../vendor/scarlet-reel/cinematic";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import {
  BREATHING,
  FLARE_PRESET_IDS,
  LIGHT_PRESETS,
  addFlare,
  addLight,
  breathingOf,
  countLightsAndFlares,
  defaultSpot,
  flarePresetHint,
  flarePresetLabel,
  isFollowingLight,
  lightFlarePreset,
  moveTo,
  pointMarkers,
  readLightsAndFlares,
  removeFlare,
  removeLight,
  sameTarget,
  setLightFlare,
  targetExists,
  updateFlare,
  updateLight,
  type CinematicPatch,
} from "./lightsFlares";

/** What the app does with a patch: set each field, or remove it when the value is undefined. */
function apply(cin: CinematicSettings | undefined, patch: CinematicPatch): CinematicSettings {
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(cin ?? {}));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return JSON.parse(JSON.stringify(next));
}

describe("what is on the picture", () => {
  it("lists lights, the single flare and the flare list, and folds in the old single-light fields", () => {
    const cin: CinematicSettings = {
      lights: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      lensFlare: { preset: "warm-amber" },
      flares: [{ preset: "neon-noir" }, { preset: "emerald" }],
    };
    const read = readLightsAndFlares(cin);
    expect(read.lights).toHaveLength(2);
    expect(read.flares.map((f) => f.ref)).toEqual([{ source: "single" }, { source: "list", index: 0 }, { source: "list", index: 1 }]);
    expect(countLightsAndFlares(cin)).toBe(5);

    const legacy = readLightsAndFlares({ lightSource: "40 60", lightColor: "#ff0000", lightRadius: 33 });
    expect(legacy.lights).toHaveLength(1);
    expect(legacy.lights[0]).toMatchObject({ x: 40, y: 60, size: 33 });
    expect(countLightsAndFlares(undefined)).toBe(0);
  });

  it("offers the engine's own flare looks with their names", () => {
    expect(FLARE_PRESET_IDS).toHaveLength(8);
    expect(FLARE_PRESET_IDS).not.toContain("custom");
    expect(flarePresetLabel("anamorphic-blue")).toBe("Anamorphic Blue");
    expect(flarePresetHint("neon-noir")).toBeTruthy();
    expect(flarePresetLabel(undefined)).toBe("Anamorphic Blue");
  });

  it("puts a new thing at the focal point, and the next one beside it", () => {
    expect(defaultSpot({ focalPoint: "58% 54%" }, 0)).toEqual({ x: 58, y: 54 });
    expect(defaultSpot({ focalPoint: "58% 54%" }, 1)).toEqual({ x: 67, y: 54 });
    expect(defaultSpot(undefined, 0)).toEqual({ x: 50, y: 35 });
    expect(defaultSpot({ focalPoint: "nonsense" }, 2)).toEqual({ x: 68, y: 35 });
    const wrapped = defaultSpot({ focalPoint: "90% 50%" }, 3);
    expect(wrapped.x).toBeGreaterThanOrEqual(4);
    expect(wrapped.x).toBeLessThanOrEqual(96);
  });
});

describe("lights", () => {
  it("adds a light from a look, keeps the ones already there, and says which one is new", () => {
    const first = addLight({ focalPoint: "50% 50%" }, "neon");
    const cin = apply({ focalPoint: "50% 50%" }, first.patch);
    expect(cin.lights).toHaveLength(1);
    expect(cin.lights![0]).toMatchObject({ color: "#ff3d8b", x: 50, y: 50 });
    expect(first.target).toEqual({ kind: "light", index: 0 });

    const second = addLight(cin, "window");
    const both = apply(cin, second.patch);
    expect(both.lights).toHaveLength(2);
    expect(both.lights![0]).toMatchObject({ color: "#ff3d8b" });
    expect(second.target).toEqual({ kind: "light", index: 1 });
    expect(both.lights![1].x).not.toBe(both.lights![0].x);
  });

  it("every ready-made light is valid for the engine and keeps its own look when drawn", () => {
    for (const preset of LIGHT_PRESETS) {
      const cin = apply(undefined, addLight(undefined, preset.id, { x: 20, y: 30 }).patch);
      const [drawn] = resolveLights(cin);
      expect(drawn.x, preset.id).toBe(20);
      expect(drawn.color, preset.id).toBe(preset.light.color);
      expect(drawn.intensity, preset.id).toBeCloseTo(preset.light.intensity ?? 0.5, 5);
      expect(drawn.size, preset.id).toBe(preset.light.size);
      expect(preset.label && preset.hint, preset.id).toBeTruthy();
    }
  });

  it("an unknown look falls back to the first", () => {
    const cin = apply(undefined, addLight(undefined, "no-such-look", { x: 1, y: 2 }).patch);
    expect(cin.lights![0].color).toBe(LIGHT_PRESETS[0].light.color);
  });

  it("changes one light and leaves the others", () => {
    const base = apply(undefined, addLight(undefined, "warm-lamp", { x: 10, y: 10 }).patch);
    const two = apply(base, addLight(base, "moon", { x: 80, y: 20 }).patch);
    const changed = apply(two, updateLight(two, 1, { intensity: 0.9, size: 60 }));
    expect(changed.lights![1]).toMatchObject({ x: 80, color: "#8fb8ff", intensity: 0.9, size: 60 });
    expect(changed.lights![0]).toEqual(two.lights![0]);
    expect(updateLight(two, 7, { size: 1 })).toEqual({});
  });

  it("moves old single-light fields into the list on the first edit, so the old light is not lost or doubled", () => {
    const old: CinematicSettings = { lightSource: "40 60", lightColor: "#ff0000", lightRadius: 33 };
    const edited = apply(old, updateLight(old, 0, { intensity: 0.8 }));
    expect(edited.lightSource).toBeUndefined();
    expect(edited.lightColor).toBeUndefined();
    expect(edited.lightRadius).toBeUndefined();
    expect(edited.lights).toHaveLength(1);
    expect(edited.lights![0]).toMatchObject({ x: 40, y: 60, size: 33, intensity: 0.8 });

    const gone = apply(old, removeLight(old, 0));
    expect(gone.lights).toBeUndefined();
    expect(resolveLights(gone)).toHaveLength(0);
  });

  it("removes a light, and removing the last one leaves no empty list behind", () => {
    const two: CinematicSettings = { lights: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    expect(apply(two, removeLight(two, 0)).lights).toEqual([{ x: 2, y: 2 }]);
    const one = apply(two, removeLight(two, 0));
    expect("lights" in apply(one, removeLight(one, 0))).toBe(false);
    expect(removeLight(two, 5)).toEqual({});
  });

  it("a flare that followed a removed light keeps the light's place; later links move down one", () => {
    const cin: CinematicSettings = {
      lights: [{ x: 10, y: 11 }, { x: 20, y: 21 }, { x: 30, y: 31 }],
      lensFlare: { preset: "warm-amber", linkToLight: 0 },
      flares: [{ linkToLight: 1 }, { linkToLight: 2 }, { x: 5, y: 5 }],
    };
    const next = apply(cin, removeLight(cin, 1));
    expect(next.lights).toHaveLength(2);
    expect(next.lensFlare).toEqual({ preset: "warm-amber", linkToLight: 0 });
    expect(next.flares![0]).toEqual({ x: 20, y: 21 });
    expect(next.flares![1]).toEqual({ linkToLight: 1 });
    expect(next.flares![2]).toEqual({ x: 5, y: 5 });
    const drawn = resolveLensFlares(next);
    expect(drawn.map((f) => [f.x, f.y])).toEqual([[10, 11], [20, 21], [30, 31], [5, 5]]);
  });

  it("gives a light a flare of its own, changes its look, and takes it away", () => {
    const base = apply(undefined, addLight(undefined, "headlights", { x: 50, y: 40 }).patch);
    const on = apply(base, setLightFlare(base, 0, "neon-noir"));
    expect(lightFlarePreset(on.lights![0])).toBe("neon-noir");
    expect(resolveLensFlares(on)).toHaveLength(1);
    expect(resolveLensFlares(on)[0]).toMatchObject({ preset: "neon-noir", x: 50, y: 40 });

    const custom = apply(on, updateLight(on, 0, { flare: { preset: "neon-noir", starburstRays: 12 } }));
    const swapped = apply(custom, setLightFlare(custom, 0, "emerald"));
    expect(swapped.lights![0].flare).toEqual({ preset: "emerald", starburstRays: 12 });

    const off = apply(swapped, setLightFlare(swapped, 0, false));
    expect(off.lights![0].flare).toBeUndefined();
    expect(resolveLensFlares(off)).toHaveLength(0);
    expect(lightFlarePreset({ x: 1, y: 1, flare: true })).toBe("anamorphic-blue");
    expect(lightFlarePreset({ x: 1, y: 1 })).toBeNull();
    expect(setLightFlare(base, 9, "emerald")).toEqual({});
  });
});

describe("flares", () => {
  it("adds flares to the list, one after another", () => {
    const a = addFlare({ focalPoint: "30% 30%" }, "warm-amber");
    const cin = apply({ focalPoint: "30% 30%" }, a.patch);
    expect(cin.flares).toEqual([{ preset: "warm-amber", x: 30, y: 30, intensity: 0.75 }]);
    expect(a.target).toEqual({ kind: "flare", ref: { source: "list", index: 0 } });
    const b = addFlare(cin, "emerald");
    expect(apply(cin, b.patch).flares).toHaveLength(2);
    expect(b.target).toEqual({ kind: "flare", ref: { source: "list", index: 1 } });
    expect(resolveLensFlares(apply(cin, b.patch))).toHaveLength(2);
  });

  it("edits and removes the single flare and the listed ones, whichever holds them", () => {
    const cin: CinematicSettings = { lensFlare: { preset: "warm-amber", intensity: 0.5 }, flares: [{ preset: "neon-noir" }, { preset: "emerald" }] };
    const single = apply(cin, updateFlare(cin, { source: "single" }, { intensity: 0.9 }));
    expect(single.lensFlare).toEqual({ preset: "warm-amber", intensity: 0.9 });
    expect(single.flares).toEqual(cin.flares);

    const listed = apply(cin, updateFlare(cin, { source: "list", index: 1 }, { preset: "sci-fi-cyan", x: 70 }));
    expect(listed.flares).toEqual([{ preset: "neon-noir" }, { preset: "sci-fi-cyan", x: 70 }]);

    expect("lensFlare" in apply(cin, removeFlare(cin, { source: "single" }))).toBe(false);
    expect(apply(cin, removeFlare(cin, { source: "list", index: 0 })).flares).toEqual([{ preset: "emerald" }]);
    const last = apply({ flares: [{ preset: "emerald" }] }, removeFlare({ flares: [{ preset: "emerald" }] }, { source: "list", index: 0 }));
    expect("flares" in last).toBe(false);

    expect(updateFlare(cin, { source: "list", index: 9 }, { x: 1 })).toEqual({});
    expect(updateFlare({}, { source: "single" }, { x: 1 })).toEqual({});
    expect(removeFlare({}, { source: "single" })).toEqual({});
  });

  it("switches a flare off without losing it", () => {
    const cin: CinematicSettings = { flares: [{ preset: "emerald" }] };
    const off = apply(cin, updateFlare(cin, { source: "list", index: 0 }, { enabled: false }));
    expect(resolveLensFlares(off)).toHaveLength(0);
    expect(off.flares).toHaveLength(1);
    expect(resolveLensFlares(apply(off, updateFlare(off, { source: "list", index: 0 }, { enabled: true })))).toHaveLength(1);
  });
});

describe("placing things on the picture", () => {
  const cin: CinematicSettings = {
    lights: [{ x: 10, y: 10 }, { x: 60, y: 70 }],
    flares: [{ preset: "emerald", x: 5, y: 5 }, { linkToLight: 1 }],
  };

  it("moves a light to the clicked spot, rounded and kept inside the picture", () => {
    expect(apply(cin, moveTo(cin, { kind: "light", index: 0 }, { x: 33.349, y: 71.66 })).lights![0]).toMatchObject({ x: 33.3, y: 71.7 });
    expect(apply(cin, moveTo(cin, { kind: "light", index: 0 }, { x: -5, y: 140 })).lights![0]).toMatchObject({ x: 0, y: 100 });
  });

  it("moves a stand-alone flare, but not one that follows a light", () => {
    expect(apply(cin, moveTo(cin, { kind: "flare", ref: { source: "list", index: 0 } }, { x: 40, y: 50 })).flares![0]).toMatchObject({ x: 40, y: 50 });
    expect(isFollowingLight(cin.flares![1], cin.lights!)).toBe(true);
    expect(isFollowingLight(cin.flares![0], cin.lights!)).toBe(false);
    expect(isFollowingLight({ linkToLight: 9 }, cin.lights!)).toBe(false);
    expect(moveTo(cin, { kind: "flare", ref: { source: "list", index: 1 } }, { x: 1, y: 1 })).toEqual({});
  });

  it("knows where everything sits, a following flare at its light", () => {
    const markers = pointMarkers(cin);
    expect(markers.map((m) => [m.label, m.x, m.y])).toEqual([
      ["Light 1", 10, 10],
      ["Light 2", 60, 70],
      ["Flare 1", 5, 5],
      ["Flare 2", 60, 70],
    ]);
    expect(pointMarkers(undefined)).toEqual([]);
  });

  it("recognises the same target, and whether it is still there", () => {
    expect(sameTarget({ kind: "light", index: 1 }, { kind: "light", index: 1 })).toBe(true);
    expect(sameTarget({ kind: "light", index: 1 }, { kind: "light", index: 0 })).toBe(false);
    expect(sameTarget({ kind: "light", index: 0 }, { kind: "flare", ref: { source: "single" } })).toBe(false);
    expect(sameTarget({ kind: "flare", ref: { source: "single" } }, { kind: "flare", ref: { source: "single" } })).toBe(true);
    expect(sameTarget({ kind: "flare", ref: { source: "list", index: 0 } }, { kind: "flare", ref: { source: "list", index: 1 } })).toBe(false);
    expect(sameTarget(null, { kind: "light", index: 0 })).toBe(false);
    expect(targetExists(cin, { kind: "light", index: 1 })).toBe(true);
    expect(targetExists(cin, { kind: "light", index: 2 })).toBe(false);
    expect(targetExists(cin, { kind: "flare", ref: { source: "list", index: 1 } })).toBe(true);
    expect(targetExists(cin, { kind: "flare", ref: { source: "single" } })).toBe(false);
    expect(targetExists(cin, null)).toBe(false);
  });
});

describe("how a light breathes, in words", () => {
  it("names the three ready-made ways and calls anything else custom", () => {
    for (const mode of BREATHING) {
      expect(breathingOf({ x: 1, y: 1, pulseAmount: mode.pulseAmount, pulseSeconds: mode.pulseSeconds })).toBe(mode.id);
    }
    expect(breathingOf({ x: 1, y: 1, pulseAmount: 0 })).toBe("steady");
    expect(breathingOf({ x: 1, y: 1 })).toBe("custom");
    expect(breathingOf({ x: 1, y: 1, pulseAmount: 0.55, pulseSeconds: 7 })).toBe("custom");
  });
});
