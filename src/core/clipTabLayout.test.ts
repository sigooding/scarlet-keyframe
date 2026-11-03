import { describe, expect, it } from "vitest";
import { FIELD_BY_KEY } from "./cinematicSchema";
import {
  NOIR_LIGHTING_OPTIONS,
  advancedFieldKeys,
  allPlacedKeys,
  allSchemaKeys,
  cameraFieldKeys,
  countSet,
  fieldsFor,
  foregroundRowLabel,
  legacyLightKeysInUse,
  PANEL_KEYS,
} from "./clipTabLayout";

describe("the Clip tab layout loses no field", () => {
  it("places every field of the schema exactly once", () => {
    const placed = allPlacedKeys();
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual([...allSchemaKeys()].sort());
  });

  it("only places fields the schema knows", () => {
    for (const key of allPlacedKeys()) expect(FIELD_BY_KEY.has(key), key).toBe(true);
  });

  it("the noir lighting options are the schema's own", () => {
    const schema = FIELD_BY_KEY.get("hitchcockLighting")!.options!;
    expect(NOIR_LIGHTING_OPTIONS.map((o) => o.value)).toEqual(schema);
  });
});

describe("camera fields follow the camera mode", () => {
  it("static shows only the common three", () => {
    expect(cameraFieldKeys({ mode: "static" })).toEqual(["mode", "focalPoint", "zoomDuration"]);
  });

  it("no mode means pan", () => {
    expect(cameraFieldKeys(undefined)).toEqual(["mode", "focalPoint", "zoomDuration", "panDistance", "panDirection"]);
  });

  it("each mode adds its own fields, in the schema's order", () => {
    expect(cameraFieldKeys({ mode: "shake" })).toEqual(["mode", "focalPoint", "zoomDuration", "shakeAmount", "shakeRotation", "shakeDuration"]);
    expect(cameraFieldKeys({ mode: "dolly" })).toEqual([
      "mode", "focalPoint", "zoomDuration", "dollyDirection", "dollyDistance", "dollyDuration", "dollyVertical",
    ]);
    expect(cameraFieldKeys({ mode: "dolly-zoom" })).toEqual([
      "mode", "focalPoint", "zoomDuration", "dollyZoomAmount", "dollyZoomDuration", "dollyZoomDirection", "dollyZoomBlur", "dollyZoomOrigin",
    ]);
  });

  it("a field that already has a value stays visible in any mode", () => {
    const keys = cameraFieldKeys({ mode: "static", shakeAmount: 0.4, dollyDistance: 0 });
    expect(keys).toContain("shakeAmount");
    expect(keys).toContain("dollyDistance");
    expect(keys).not.toContain("shakeRotation");
    expect(cameraFieldKeys({ mode: "static", panDistance: "" })).not.toContain("panDistance");
  });
});

describe("counts and the old light fields", () => {
  it("counts the fields that hold a value", () => {
    expect(countSet({ grain: true, vignette: false, dimAmount: 0 }, ["grain", "vignette", "dimAmount", "colorGrade"])).toBe(3);
    expect(countSet(undefined, ["grain"])).toBe(0);
  });

  it("lists the old light fields only when a shot still has them", () => {
    expect(legacyLightKeysInUse({})).toEqual([]);
    expect(legacyLightKeysInUse({ lightSource: "40 60", lightRadius: 30 })).toEqual(["lightSource", "lightRadius"]);
    expect(advancedFieldKeys({})).not.toContain("lightSource");
    expect(advancedFieldKeys({ lightColor: "#fff" })).toContain("lightColor");
    expect(advancedFieldKeys({})).toEqual(["parallaxLayers", "foregroundAnimation", "foregroundExtras"]);
  });

  it("what a panel already edits is not listed again as raw data", () => {
    for (const key of ["lights", "lensFlare", "flares", "depthCutouts"]) {
      expect(PANEL_KEYS).toContain(key);
      expect(advancedFieldKeys({ [key]: [{ x: 1 }] })).not.toContain(key);
    }
  });

  it("the foreground rows lose the word the heading already says", () => {
    expect(foregroundRowLabel("Foreground subject")).toBe("Picture");
    expect(foregroundRowLabel("Foreground scale")).toBe("Scale");
    expect(foregroundRowLabel("Foreground position X")).toBe("Position X");
    expect(foregroundRowLabel("Foreground blend mode")).toBe("Blend mode");
    expect(foregroundRowLabel("Vignette")).toBe("Vignette");
  });

  it("fieldsFor turns keys into schema fields and skips unknown ones", () => {
    expect(fieldsFor(["mode", "nope", "grain"]).map((f) => f.key)).toEqual(["mode", "grain"]);
  });
});
