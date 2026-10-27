export type FieldKind = "text" | "number" | "boolean" | "select" | "color" | "image" | "json";

export interface CinematicField {
  key: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  extension?: boolean;
}

export interface CinematicGroup {
  id: string;
  label: string;
  fields: CinematicField[];
}

const field = (
  key: string,
  label: string,
  kind: FieldKind,
  options: Partial<Omit<CinematicField, "key" | "label" | "kind">> = {},
): CinematicField => ({ key, label, kind, ...options });

export const CINEMATIC_GROUPS: CinematicGroup[] = [
  {
    id: "camera",
    label: "Camera",
    fields: [
      field("mode", "Camera mode", "select", { options: ["pan", "zoom-hold", "static", "shake", "dolly", "dolly-zoom"] }),
      field("focalPoint", "Focal point", "text"),
      field("zoomDuration", "Move duration", "number", { min: 0.1, max: 60, step: 0.1 }),
      field("zoom", "Zoom", "number", { min: 1, max: 2.5, step: 0.01, extension: true }),
      field("startZoom", "Start zoom", "number", { min: 1, max: 2.5, step: 0.01, extension: true }),
      field("endZoom", "End zoom", "number", { min: 1, max: 2.5, step: 0.01, extension: true }),
      field("startFocalPoint", "Start framing", "text", { extension: true }),
      field("endFocalPoint", "End framing", "text", { extension: true }),
      field("easing", "Easing", "select", { options: ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "cinematic"], extension: true }),
      field("panDistance", "Pan distance", "number", { min: 0, max: 35, step: 0.1 }),
      field("panDirection", "Pan direction", "select", { options: ["left", "right"] }),
      field("shakeAmount", "Shake intensity", "number", { min: 0, max: 1, step: 0.01 }),
      field("shakeRotation", "Shake roll", "number", { min: 0, max: 5, step: 0.05 }),
      field("shakeDuration", "Shake cycle", "number", { min: 0.1, max: 3, step: 0.05 }),
      field("dollyDirection", "Dolly direction", "select", { options: ["left", "right"] }),
      field("dollyDistance", "Dolly distance", "number", { min: 0, max: 30, step: 0.1 }),
      field("dollyDuration", "Dolly duration", "number", { min: 1, max: 120, step: 0.1 }),
      field("dollyVertical", "Dolly vertical drift", "number", { min: 0, max: 8, step: 0.1 }),
      field("dollyZoomAmount", "Vertigo zoom", "number", { min: 1, max: 3, step: 0.01 }),
      field("dollyZoomDuration", "Vertigo duration", "number", { min: 1, max: 120, step: 0.1 }),
      field("dollyZoomDirection", "Vertigo direction", "select", { options: ["push", "pull", "both"] }),
      field("dollyZoomBlur", "Vertigo blur", "number", { min: 0, max: 24, step: 0.1 }),
      field("dollyZoomOrigin", "Vertigo origin", "text"),
      field("foregroundImage", "Foreground subject", "image"),
      field("foregroundScale", "Foreground scale", "number", { min: 0.1, max: 4, step: 0.01 }),
      field("foregroundFit", "Foreground fit", "select", { options: ["contain", "cover", "fill", "native"] }),
      field("foregroundAnchor", "Foreground anchor", "text"),
      field("foregroundX", "Foreground position X", "number", { min: 0, max: 100, step: 1 }),
      field("foregroundY", "Foreground position Y", "number", { min: 0, max: 100, step: 1 }),
      field("foregroundRotation", "Foreground rotation", "number", { min: -180, max: 180, step: 0.1 }),
      field("foregroundZoom", "Foreground zoom", "number", { min: 0.1, max: 4, step: 0.01 }),
      field("foregroundZoomDuration", "Foreground zoom duration", "number", { min: 0.1, max: 60, step: 0.1 }),
      field("foregroundAnimation", "Foreground animation", "json"),
      field("foregroundBlendMode", "Foreground blend mode", "select", { options: ["normal", "screen", "multiply", "lighten", "darken", "overlay", "soft-light", "hard-light"] }),
      field("foregroundOpacity", "Foreground opacity", "number", { min: 0, max: 1, step: 0.01 }),
      field("foregroundExtras", "Additional cut-out layers", "json"),
    ],
  },
  {
    id: "depth",
    label: "Depth & parallax",
    fields: [
      field("depthMap", "Depth map", "image"),
      field("depthPlate", "Painted-out plate", "image"),
      field("depthCutouts", "Cut-out layers", "json"),
      field("depthMotion", "Depth move", "select", { options: ["push", "truck", "drift"] }),
      field("depthAmount", "Depth amount", "number", { min: 0, max: 1, step: 0.01 }),
      field("depthSeconds", "Depth move seconds", "number", { min: 2, max: 120, step: 0.1 }),
      field("depthDirection", "Depth direction", "select", { options: ["left", "right"] }),
      field("depthFocus", "Depth focus plane", "number", { min: 0, max: 1, step: 0.01 }),
      field("parallaxDepth", "Pointer parallax", "number", { min: 0, max: 1, step: 0.01 }),
      field("parallaxLayers", "Parallax layers", "json"),
    ],
  },
  {
    id: "look",
    label: "Grade & texture",
    fields: [
      field("colorGrade", "Color grade", "select", { options: ["", "nolan-imax", "tarantino-35mm", "spielberg-golden", "noir-1940s", "neon-noir", "midnight-teal"] }),
      field("filmGrade", "Film stock", "boolean"),
      field("filmGradeStrength", "Film strength", "number", { min: 0, max: 1, step: 0.01 }),
      field("dimAmount", "Dim amount", "number", { min: 0, max: 1, step: 0.01 }),
      field("vignette", "Vignette", "boolean", { extension: true }),
      field("grain", "Grain", "boolean", { extension: true }),
    ],
  },
  {
    id: "lights",
    label: "Lights & flare",
    fields: [
      field("lights", "Animated light points", "json"),
      field("lightSource", "Legacy light position", "text"),
      field("lightColor", "Legacy light color", "color"),
      field("lightRadius", "Legacy light radius", "number", { min: 5, max: 95, step: 1 }),
      field("lensFlare", "Lens flare", "json"),
      field("flares", "Multiple flares", "json"),
    ],
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    fields: [
      field("volumetricShafts", "Volumetric shafts", "boolean"),
      field("shaftsIntensity", "Shaft intensity", "number", { min: 0, max: 2, step: 0.01 }),
      field("depthFog", "Depth fog", "boolean"),
      field("fogStrength", "Fog strength", "number", { min: 0, max: 1, step: 0.01 }),
      field("shadowCasting", "Light-cast shadows", "boolean"),
      field("shadowIntensity", "Shadow intensity", "number", { min: 0, max: 1, step: 0.01 }),
      field("rainOnLens", "Rain on lens", "boolean"),
      field("rainLensIntensity", "Lens rain intensity", "number", { min: 0, max: 2, step: 0.01 }),
      field("dofOnTalk", "Depth of field on dialogue", "boolean"),
      field("dofBlur", "Depth of field blur", "number", { min: 0, max: 20, step: 0.1 }),
    ],
  },
];

export const ORIGINAL_CINEMATIC_FIELDS = new Set(
  CINEMATIC_GROUPS.flatMap((group) => group.fields.filter((item) => !item.extension).map((item) => item.key)),
);

export const FIELD_BY_KEY = new Map(CINEMATIC_GROUPS.flatMap((group) => group.fields.map((item) => [item.key, item] as const)));
