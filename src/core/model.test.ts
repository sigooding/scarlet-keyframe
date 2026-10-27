import { describe, expect, it } from "vitest";
import film from "../data/nobodys-witness-film.json";
import { buildKeyframes, parseImportPayload, runningSceneIds } from "./model";

// The film built into the app (npm run import:film) opens as one timeline of keyframes in playing order.
describe("the built-in film", () => {
  const { story } = parseImportPayload(film, "nobodys-witness-film.json");
  const frames = buildKeyframes(story);
  const marks = frames.map((frame) => frame.mark);

  it("is Nobody's Witness, starting from its start scene", () => {
    expect(story.title).toBe("Nobody's Witness");
    expect(runningSceneIds(story)[0]).toBe(story.startSceneId);
  });

  it("gives every beat in the running order a keyframe", () => {
    const order = runningSceneIds(story);
    const beats = order.reduce((sum, id) => sum + (story.scenes.find((scene) => scene.id === id)?.dialogueBeats?.length ?? 0), 0);
    expect(frames.length).toBe(beats);
    expect(frames.length).toBeGreaterThan(1000);
  });

  it("plays scene 77A between scenes 77 and 78", () => {
    const first77a = marks.indexOf("77A");
    expect(first77a).toBeGreaterThan(marks.lastIndexOf("77"));
    expect(first77a).toBeLessThan(marks.indexOf("78"));
  });
});
