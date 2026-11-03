import { describe, expect, it } from "vitest";
import { addFlare, addLight, removeLight, setLightFlare } from "./lightsFlares";
import { setEffectField, setEffectFields } from "./edits";
import { buildKeyframes, createProjectState, parseImportPayload, type ProjectState } from "./model";
import { effectiveFrameCinematic } from "../sequence/cameraPresets";
import { resolveLensFlares, resolveLights } from "../../vendor/scarlet-reel/cinematic";

function makeProject(): ProjectState {
  const raw = {
    id: "fx-film",
    title: "FX Film",
    startSceneId: "sc1",
    scenes: [
      {
        id: "sc1",
        sceneNumber: 1,
        title: "One",
        background: "/film/img/sc1.png",
        cinematic: { focalPoint: "40% 60%", vignette: true, lightSource: "20 30", lightColor: "#ff0000", lightRadius: 25 },
        dialogueBeats: [
          { id: "b1", speaker: "A", text: "First.", durationFrames: 48 },
          { id: "b2", speaker: "A", text: "Second.", durationFrames: 48, cinematic: { grain: true } },
        ],
      },
    ],
  };
  return createProjectState(parseImportPayload(raw, "fx.json"), []);
}

const cinematicOf = (project: ProjectState, id: string) => effectiveFrameCinematic(buildKeyframes(project.story).find((f) => f.id === id)!);

describe("setEffectFields: several cinematic fields in one edit", () => {
  it("sets and removes fields together, starting from the shot's effective settings", () => {
    const project = makeProject();
    const next = setEffectFields(project, "b1", { "cinematic.vignetteStrength": 0.4, grain: true, vignette: undefined });
    const cin = cinematicOf(next, "b1");
    expect(cin).toMatchObject({ vignetteStrength: 0.4, grain: true, focalPoint: "40% 60%" });
    expect(cin?.vignette).toBeUndefined();
    expect(next).not.toBe(project);
    expect(next.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it("changes nothing for an empty patch or an unknown shot", () => {
    const project = makeProject();
    expect(setEffectFields(project, "b1", {})).toBe(project);
    expect(setEffectFields(project, "no-such-shot", { grain: true })).toBe(project);
  });

  it("leaves the other shots and the original story alone", () => {
    const project = makeProject();
    const next = setEffectFields(project, "b1", { grain: true });
    expect(cinematicOf(next, "b2")).toMatchObject({ grain: true });
    expect(JSON.stringify(project.story)).toBe(JSON.stringify(makeProject().story));
  });

  it("setEffectField is the one-field case of it", () => {
    const project = makeProject();
    const single = setEffectField(project, "b1", "cinematic.dimAmount", 0.3);
    const many = setEffectFields(project, "b1", { dimAmount: 0.3 });
    expect(cinematicOf(single, "b1")).toEqual(cinematicOf(many, "b1"));
  });
});

describe("the lights and flares patches, applied to a real shot", () => {
  it("adds a light and a flare to a shot that has none, then they are drawn", () => {
    // b2 has its own settings and no light (b1 inherits the scene's old single light, tested below).
    let project = makeProject();
    expect(resolveLights(cinematicOf(project, "b2"))).toHaveLength(0);
    const light = addLight(cinematicOf(project, "b2"), "neon");
    project = setEffectFields(project, "b2", light.patch);
    const flare = addFlare(cinematicOf(project, "b2"), "warm-amber");
    project = setEffectFields(project, "b2", flare.patch);
    const cin = cinematicOf(project, "b2");
    expect(resolveLights(cin)).toHaveLength(1);
    expect(resolveLights(cin)[0].color).toBe("#ff3d8b");
    expect(resolveLensFlares(cin)).toHaveLength(1);
    expect(cin).toMatchObject({ grain: true });
  });

  it("the old single light of a scene becomes the first light on the first edit, and is not drawn twice", () => {
    let project = makeProject();
    const before = cinematicOf(project, "b1");
    expect(resolveLights(before)).toHaveLength(1);
    const added = addLight(before, "moon");
    project = setEffectFields(project, "b1", added.patch);
    const cin = cinematicOf(project, "b1");
    expect(cin?.lightSource).toBeUndefined();
    expect(resolveLights(cin)).toHaveLength(2);
    expect(resolveLights(cin)[0]).toMatchObject({ x: 20, y: 30, size: 25 });
  });

  it("removing every light takes the old single light with it", () => {
    let project = makeProject();
    project = setEffectFields(project, "b1", removeLight(cinematicOf(project, "b1"), 0));
    expect(resolveLights(cinematicOf(project, "b1"))).toHaveLength(0);
  });

  it("a light's own flare is one edit and can be undone by restoring the earlier project", () => {
    const start = makeProject();
    const withLight = setEffectFields(start, "b1", addLight(cinematicOf(start, "b1"), "headlights").patch);
    const withFlare = setEffectFields(withLight, "b1", setLightFlare(cinematicOf(withLight, "b1"), 1, "emerald"));
    expect(resolveLensFlares(cinematicOf(withFlare, "b1"))).toHaveLength(1);
    expect(resolveLensFlares(cinematicOf(withLight, "b1"))).toHaveLength(0);
  });
});
