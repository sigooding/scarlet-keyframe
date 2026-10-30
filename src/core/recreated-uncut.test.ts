import { describe, expect, it, vi } from "vitest";
import film from "../data/nobodys-witness-film.json";
import audioDurations from "../data/audio-durations.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { buildDirectorsCutById } from "./directorsCut";
import { addRecreatedUncutCoverage, upgradeSavedRecreatedUncut } from "./recreatedUncut";
import { buildTimelineClips } from "../sequence/animate";

vi.mock("../assets/recreated-uncut/300-ishida-warning.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ejE=" }));
vi.mock("../assets/recreated-uncut/1383-listening-to-tape.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ejI=" }));
vi.mock("../assets/recreated-uncut/1383-listening-wide.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,d2lkZQ==" }));
vi.mock("../assets/recreated-uncut/980-later.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ejM=" }));
vi.mock("../assets/recreated-uncut/1573-empty-chair.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,YQ==" }));
vi.mock("../assets/recreated-uncut/031-after-twenty-years.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yg==" }));
vi.mock("../assets/recreated-uncut/1637-vera-still.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yw==" }));

vi.mock("../assets/recreated-uncut/099-vera-hesitates.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cA==" }));
vi.mock("../assets/recreated-uncut/1358-jack-stands.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cQ==" }));
vi.mock("../assets/recreated-uncut/1565-only-tea.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cg==" }));

vi.mock("../assets/recreated-uncut/038-sedan-departs.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cw==" }));
vi.mock("../assets/recreated-uncut/893-jack-what.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dA==" }));

vi.mock("../assets/recreated-uncut/1073-wine-red-dress.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dQ==" }));
vi.mock("../assets/recreated-uncut/128-missing-person-form.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dg==" }));
vi.mock("../assets/recreated-uncut/1686-beyond-the-curtain.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dw==" }));
vi.mock("../assets/recreated-uncut/284-daniel-voss-portrait.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,eA==" }));
vi.mock("../assets/recreated-uncut/1360-where-is-it.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,eQ==" }));

const base = () => createProjectState(parseImportPayload(film, "film.json"), []);
const oldHarada = { id: "duplicate-uncut-1383", name: "Listening to the tape.jpg", type: "image" as const, source: "bundle" as const, size: 2, dataUrl: "data:image/jpeg;base64,ejI=" };
const putOldHarada = (story: ReturnType<typeof base>["story"]) => {
  const beat = buildKeyframes(story).find(f => f.id === "nw_b1383")!.beat;
  beat.background = "asset:duplicate-uncut-1383";
  beat.backgroundHold = false;
  return beat;
};
vi.mock("../assets/recreated-uncut/028-men-approach.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ZA==" }));
vi.mock("../assets/recreated-uncut/1037-the-notebook.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ZQ==" }));
vi.mock("../assets/recreated-uncut/1351-was-that-you.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Zg==" }));

vi.mock("../assets/recreated-uncut/017-hidden.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Zw==" }));
vi.mock("../assets/recreated-uncut/1671-winter-light.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,aA==" }));

vi.mock("../assets/recreated-uncut/027-headlights.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,aQ==" }));
vi.mock("../assets/recreated-uncut/1054-the-sedan.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ag==" }));
vi.mock("../assets/recreated-uncut/1467-promised-a-car.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,aw==" }));

vi.mock("../assets/recreated-uncut/1020-dinner-with-me.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,bA==" }));
vi.mock("../assets/recreated-uncut/1177-no-messages.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,bQ==" }));

vi.mock("../assets/recreated-uncut/148-how-did-she-seem.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,bg==" }));
vi.mock("../assets/recreated-uncut/716-sea-wall-road.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,bw==" }));

describe("recreated Original Uncut plates", () => {
  it("adds the selected votes while preserving all other shots, text, audio and duration", () => {
    const source = base();
    const result = buildDirectorsCutById(source, "uncut", new Map());
    const old = buildTimelineClips(buildKeyframes(source.originalStory)).clips;
    const next = buildTimelineClips(buildKeyframes(result.story)).clips;
    const selected = ["nw_b31", "nw_b1573", "nw_b1637", "nw_b28", "nw_b1037", "nw_b1351", "nw_b17", "nw_b1671", "nw_b27", "nw_b1054", "nw_b1467", "nw_b1020", "nw_b1177", "nw_b148", "nw_b716", "nw_b99", "nw_b1358", "nw_b1565", "nw_b38", "nw_b893", "nw_b1073", "nw_b128", "nw_b1686", "nw_b284", "nw_b1360", "nw_b300", "nw_b1383", "nw_b980"];
    expect(next.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]))
      .toEqual(old.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]));
    expect(next.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture))
      .toEqual(old.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture));
    for (const [id, asset] of [["nw_b31", "recreated-uncut-031"], ["nw_b1573", "recreated-uncut-1573"], ["nw_b1637", "recreated-uncut-1637"], ["nw_b28", "recreated-uncut-028"], ["nw_b1037", "recreated-uncut-1037"], ["nw_b1351", "recreated-uncut-1351"], ["nw_b17", "recreated-uncut-017"], ["nw_b1671", "recreated-uncut-1671"], ["nw_b27", "recreated-uncut-027"], ["nw_b1054", "recreated-uncut-1054"], ["nw_b1467", "recreated-uncut-1467"], ["nw_b1020", "recreated-uncut-1020"], ["nw_b1177", "recreated-uncut-1177"], ["nw_b148", "recreated-uncut-148"], ["nw_b716", "recreated-uncut-716"], ["nw_b99", "gap-uncut-099"], ["nw_b1358", "gap-uncut-1358"], ["nw_b1565", "gap-uncut-1565"], ["nw_b38", "gap-uncut-038"], ["nw_b893", "gap-uncut-893"], ["nw_b1073", "gap-uncut-1073"], ["nw_b128", "gap-uncut-128"], ["nw_b1686", "gap-uncut-1686"], ["nw_b284", "gap-uncut-284"], ["nw_b1360", "gap-uncut-1360"], ["nw_b300", "duplicate-uncut-300"], ["nw_b1383", "duplicate-uncut-1383-wide"], ["nw_b980", "duplicate-uncut-980"]]) {
      expect(next.find(c => c.keyframe.id === id)?.keyframe.picture).toBe(`asset:${asset}`);
      expect(result.assets.find(a => a.id === asset)?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    }
    expect(result.originalStory).toEqual(source.originalStory);
  });
  it("breaks selected long holds at existing beat boundaries without changing timing", () => {
    const source = base();
    const result = buildDirectorsCutById(source, "uncut", new Map());
    const durations = new Map(Object.entries(audioDurations));
    const before = buildTimelineClips(buildKeyframes(source.originalStory), durations).clips;
    const after = buildTimelineClips(buildKeyframes(result.story), durations).clips;
    expect(after.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl]))
      .toEqual(before.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl]));
    for (const [start, inserted, next] of [["nw_b98", "nw_b99", "nw_b100"], ["nw_b1357", "nw_b1358", "nw_b1359"], ["nw_b1564", "nw_b1565", "nw_b1566"], ["nw_b37", "nw_b38", "nw_b39"], ["nw_b892", "nw_b893", "nw_b894"], ["nw_b1072", "nw_b1073", "nw_b1074"], ["nw_b127", "nw_b128", "nw_b129"], ["nw_b1685", "nw_b1686", "nw_b1687"], ["nw_b283", "nw_b284", "nw_b285"], ["nw_b1359", "nw_b1360", "nw_b1361"]]) {
      const oldStart = before.find(c => c.keyframe.id === start)!;
      const oldInsert = before.find(c => c.keyframe.id === inserted)!;
      const newStart = after.find(c => c.keyframe.id === start)!;
      const newInsert = after.find(c => c.keyframe.id === inserted)!;
      expect((oldStart.durationFrames + oldInsert.durationFrames) / 24).toBeGreaterThan(7);
      expect(newStart.durationFrames / 24).toBeLessThanOrEqual(7);
      expect(newInsert.durationFrames / 24).toBeLessThanOrEqual(7);
      expect(newStart.keyframe.picture).toBe(oldStart.keyframe.picture);
      expect(newInsert.keyframe.picture).not.toBe(oldInsert.keyframe.picture);
      expect(after.find(c => c.keyframe.id === next)!.keyframe.picture).toBe(before.find(c => c.keyframe.id === next)!.keyframe.picture);
      expect(newInsert.startFrame).toBe(oldInsert.startFrame);
      expect(newInsert.durationFrames).toBe(oldInsert.durationFrames);
    }
  });
  it("replaces the second image in voted duplicate pairs without changing the surrounding beats", () => {
    const source = base();
    const result = buildDirectorsCutById(source, "uncut", new Map());
    const durations = new Map(Object.entries(audioDurations));
    const before = buildTimelineClips(buildKeyframes(source.originalStory), durations).clips;
    const after = buildTimelineClips(buildKeyframes(result.story), durations).clips;
    expect(after.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]))
      .toEqual(before.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]));
    for (const [id, asset] of [["nw_b300", "duplicate-uncut-300"], ["nw_b1383", "duplicate-uncut-1383-wide"], ["nw_b980", "duplicate-uncut-980"]]) {
      const index = before.findIndex(c => c.keyframe.id === id);
      expect(index).toBeGreaterThan(0);
      expect(before[index - 1].keyframe.picture).toBe(before[index].keyframe.picture);
      expect(after[index - 1].keyframe.picture).toBe(before[index - 1].keyframe.picture);
      expect(after[index].keyframe.picture).toBe(`asset:${asset}`);
      expect(after[index + 1].keyframe.picture).toBe(before[index + 1].keyframe.picture);
    }
  });
  it("upgrades v11 active and stashed cuts without replacing direct or carried custom pictures", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    buildKeyframes(activeStory).find(f => f.id === "nw_b300")!.beat.background = "/custom-phone.jpg";
    buildKeyframes(activeStory).find(f => f.id === "nw_b979")!.beat.background = "/custom-rain.jpg";
    buildKeyframes(stashedStory).find(f => f.id === "nw_b1382")!.beat.background = "/custom-cassette.jpg";
    const saved = { ...project, story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 11, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(active.find(f => f.id === "nw_b300")!.picture).toBe("/custom-phone.jpg");
    expect(active.find(f => f.id === "nw_b980")!.picture).toBe("/custom-rain.jpg");
    expect(active.find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(stashed.find(f => f.id === "nw_b1383")!.picture).toBe("/custom-cassette.jpg");
    expect(stashed.find(f => f.id === "nw_b300")!.picture).toBe("asset:duplicate-uncut-300");
    expect(stashed.find(f => f.id === "nw_b980")!.picture).toBe("asset:duplicate-uncut-980");
    expect(upgraded.recreatedUncutCoverageVersion).toBe(13);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b1383")!.picture).toBe("/film/img/s82/509-twenty-years-younger.jpg");
    expect(buildKeyframes(saved.savedCutStates.uncut.story).find(f => f.id === "nw_b300")!.picture).toBe("/film/img/s11/419-twenty-years.jpg");
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("upgrades the exact old Harada image in active and stashed v12 cuts without changing edits or timing", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    const beat = putOldHarada(activeStory);
    beat.cinematic = { colorGrade: "user-grade", depthMap: "/user-depth.png" };
    beat.animation = { values: { zoom: 1.12 } };
    putOldHarada(stashedStory);
    // Another use of the old asset is deliberately not changed.
    buildKeyframes(activeStory).find(f => f.id === "nw_b1377")!.beat.background = "asset:duplicate-uncut-1383";
    const saved = { ...project, assets: [oldHarada], story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 12, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const durations = new Map(Object.entries(audioDurations));
    const before = buildTimelineClips(buildKeyframes(saved.story), durations).clips;
    const upgraded = upgradeSavedRecreatedUncut(saved);
    const after = buildTimelineClips(buildKeyframes(upgraded.story), durations).clips;
    expect(after.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions, c.keyframe.beat.animation, c.keyframe.beat.cinematic]))
      .toEqual(before.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions, c.keyframe.beat.animation, c.keyframe.beat.cinematic]));
    expect(after.filter(c => c.keyframe.id !== "nw_b1383").map(c => c.keyframe.picture))
      .toEqual(before.filter(c => c.keyframe.id !== "nw_b1383").map(c => c.keyframe.picture));
    expect(after.find(c => c.keyframe.id === "nw_b1383")!.keyframe.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(buildKeyframes(upgraded.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(upgraded.assets.find(asset => asset.id === oldHarada.id)).toEqual(oldHarada);
    expect(upgraded.assets.find(asset => asset.id === "duplicate-uncut-1383-wide")?.dataUrl).toBe("data:image/jpeg;base64,d2lkZQ==");
    expect(upgraded.recreatedUncutCoverageVersion).toBe(13);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383");
  });
  it("upgrades a stashed Uncut without changing the active cut or its use of the old asset", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    putOldHarada(activeStory);
    putOldHarada(stashedStory);
    const saved = { ...project, assets: [oldHarada], story: activeStory, directorsCutId: "creative" as const, recreatedUncutCoverageVersion: 12, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    expect(upgraded.story).toBe(activeStory);
    expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383");
    expect(buildKeyframes(upgraded.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(upgraded.assets.find(asset => asset.id === oldHarada.id)).toEqual(oldHarada);
  });
  it("leaves modified old images and colliding custom wide assets untouched", () => {
    const project = base();
    for (const assets of [
      [{ ...oldHarada, dataUrl: "data:image/jpeg;base64,Y3VzdG9t" }],
      [oldHarada, { id: "duplicate-uncut-1383-wide", name: "Custom.jpg", type: "image" as const, source: "upload" as const, size: 6, dataUrl: "data:image/jpeg;base64,Y3VzdG9t" }],
    ]) {
      const story = structuredClone(project.story);
      putOldHarada(story);
      const saved = { ...project, assets, story, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 12 };
      const upgraded = upgradeSavedRecreatedUncut(saved);
      expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383");
      expect(upgraded.assets).toEqual(assets);
    }
  });
  it("preserves a carried old picture and its cinematic settings after a gap", () => {
    const project = base();
    const story = structuredClone(project.story);
    const beat = putOldHarada(story);
    beat.backgroundHold = true;
    beat.cinematic = { colorGrade: "user-grade", depthMap: "/user-depth.png" };
    const scene = story.scenes.find(s => s.id === "nw_s82")!;
    const index = scene.dialogueBeats!.findIndex(b => b.id === "nw_b1383");
    scene.dialogueBeats!.splice(index + 1, 0, { id: "user-gap", gap: true });
    const next = scene.dialogueBeats!.find(b => b.id === "nw_b1384")!;
    delete next.background;
    delete next.cinematic;
    const before = buildKeyframes(story);
    expect(before.find(f => f.id === "nw_b1384")!.picture).toBe("asset:duplicate-uncut-1383");
    const upgraded = upgradeSavedRecreatedUncut({ ...project, assets: [oldHarada], story, directorsCutId: "uncut", recreatedUncutCoverageVersion: 12 });
    const after = buildKeyframes(upgraded.story);
    expect(after.find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(after.find(f => f.id === "nw_b1383")!.beat.backgroundHold).toBe(true);
    const changed = before.filter(f => f.id !== "nw_b1383").flatMap(f => {
      const updated = after.find(a => a.id === f.id)!;
      return JSON.stringify([f.picture, f.cinematic]) === JSON.stringify([updated.picture, updated.cinematic])
        ? [] : [{ id: f.id, before: [f.picture, f.cinematic], after: [updated.picture, updated.cinematic] }];
    });
    expect(changed).toEqual([]);
  });
  it("backs out if restoring a carried image would alter a later cinematic look", () => {
    const project = base();
    const story = structuredClone(project.story);
    const beat = putOldHarada(story);
    beat.backgroundHold = true;
    beat.cinematic = { colorGrade: "user-grade", depthMap: "/user-depth.png" };
    const next = buildKeyframes(story).find(f => f.id === "nw_b1384")!.beat;
    delete next.background;
    expect(next.cinematic).toBeTruthy();
    const before = buildKeyframes(story).map(f => [f.id, f.picture, f.cinematic]);
    const assets = addRecreatedUncutCoverage(story, [oldHarada], 12);
    expect(buildKeyframes(story).map(f => [f.id, f.picture, f.cinematic])).toEqual(before);
    expect(next.background).toBeUndefined();
    expect(assets).toEqual([oldHarada]);
  });
  it("does not rewrite ambiguous inherited images across a scene or a non-held beat", () => {
    const oldRef = "asset:duplicate-uncut-1383";
    for (const crossScene of [false, true]) {
      const story = crossScene ? {
        id: "nobodys-witness-film", startSceneId: "nw_s82", scenes: [
          { id: "nw_s82", autoAdvanceTargetSceneId: "next", dialogueBeats: [{ id: "nw_b1383", background: oldRef, backgroundHold: true }] },
          { id: "next", dialogueBeats: [{ id: "next-beat" }] },
        ],
      } : {
        id: "nobodys-witness-film", startSceneId: "nw_s82", scenes: [
          { id: "nw_s82", dialogueBeats: [{ id: "nw_b1383", background: oldRef, backgroundHold: true }, { id: "next-beat", backgroundHold: false }] },
        ],
      };
      expect(buildKeyframes(story).find(f => f.id === "next-beat")!.picture).toBe(oldRef);
      const assets = addRecreatedUncutCoverage(story, [oldHarada], 12);
      expect(buildKeyframes(story).find(f => f.id === "nw_b1383")!.picture).toBe(oldRef);
      expect(buildKeyframes(story).find(f => f.id === "next-beat")!.picture).toBe(oldRef);
      expect(assets).toEqual([oldHarada]);
    }
  });
  it("does not replace a saved custom image in a new gap", () => {
    const project = base();
    const story = structuredClone(project.story);
    buildKeyframes(story).find(f => f.id === "nw_b99")!.beat.background = "/custom.jpg";
    const upgraded = upgradeSavedRecreatedUncut({ ...project, story, directorsCutId: "uncut", recreatedUncutCoverageVersion: 6 });
    expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b99")!.picture).toBe("/custom.jpg");
  });
  it("upgrades v11 without replacing direct or carried saved pictures", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    buildKeyframes(activeStory).find(f => f.id === "nw_b1360")!.beat.background = "/custom-ishida.jpg";
    buildKeyframes(stashedStory).find(f => f.id === "nw_b283")!.beat.background = "/custom-clipping.jpg";
    const saved = { ...project, story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 10, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(active.find(f => f.id === "nw_b1360")!.picture).toBe("/custom-ishida.jpg");
    expect(active.find(f => f.id === "nw_b284")!.picture).toBe("asset:gap-uncut-284");
    expect(stashed.find(f => f.id === "nw_b284")!.picture).toBe("/custom-clipping.jpg");
    expect(stashed.find(f => f.id === "nw_b1360")!.picture).toBe("asset:gap-uncut-1360");
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b284")!.picture).toBe("/film/img/s11/244-daniel-voss-41.jpg");
    expect(buildKeyframes(saved.savedCutStates.uncut.story).find(f => f.id === "nw_b1360")!.picture).toBe("/film/img/s80/the-blood-on-his-hand.jpg");
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("upgrades v10 saved and stashed Uncut without replacing direct or carried custom pictures", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    buildKeyframes(activeStory).find(f => f.id === "nw_b128")!.beat.background = "/custom-form.jpg";
    buildKeyframes(stashedStory).find(f => f.id === "nw_b1685")!.beat.background = "/custom-counter.jpg";
    const saved = { ...project, story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 9, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(active.find(f => f.id === "nw_b128")!.picture).toBe("/custom-form.jpg");
    expect(active.find(f => f.id === "nw_b1686")!.picture).toBe("asset:gap-uncut-1686");
    expect(stashed.find(f => f.id === "nw_b128")!.picture).toBe("asset:gap-uncut-128");
    expect(stashed.find(f => f.id === "nw_b1686")!.picture).toBe("/custom-counter.jpg");
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b1686")!.picture).toBe("/film/img/s100/1685-money-on-the-counter.jpg");
    expect(buildKeyframes(saved.savedCutStates.uncut.story).find(f => f.id === "nw_b128")!.picture).toBe("/film/img/s6/321-the-form.jpg");
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("leaves a different active cut untouched while upgrading a stashed Uncut", () => {
    const project = base();
    const otherStory = structuredClone(project.story);
    const otherAudio = project.audioClips;
    const saved = { ...project, story: otherStory, directorsCutId: "creative" as const, recreatedUncutCoverageVersion: 9, savedCutStates: { uncut: { story: structuredClone(project.story), updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    expect(upgraded.story).toBe(otherStory);
    expect(upgraded.audioClips).toBe(otherAudio);
    expect(buildKeyframes(upgraded.savedCutStates!.uncut!.story).find(f => f.id === "nw_b128")!.picture).toBe("asset:gap-uncut-128");
    expect(buildKeyframes(upgraded.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1686")!.picture).toBe("asset:gap-uncut-1686");
  });
  it("upgrades the v9 dress shot without replacing saved custom pictures", () => {
    const project = base();
    const active = structuredClone(project.story);
    const stashed = structuredClone(project.story);
    buildKeyframes(active).find(f => f.id === "nw_b1073")!.beat.background = "/custom-dress.jpg";
    const result = upgradeSavedRecreatedUncut({ ...project, story: active, directorsCutId: "uncut", recreatedUncutCoverageVersion: 8, savedCutStates: { uncut: { story: stashed, updatedAt: 1 } } });
    expect(buildKeyframes(result.story).find(f => f.id === "nw_b1073")!.picture).toBe("/custom-dress.jpg");
    expect(buildKeyframes(result.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1073")!.picture).toBe("asset:gap-uncut-1073");
  });
  it("only upgrades matching v8 gaps in saved and stashed Uncut", () => {
    const project = base();
    const story = structuredClone(project.story);
    buildKeyframes(story).find(f => f.id === "nw_b38")!.beat.background = "/custom.jpg";
    const stashedStory = structuredClone(project.story);
    buildKeyframes(stashedStory).find(f => f.id === "nw_b892")!.beat.background = "/custom-carried.jpg";
    const upgraded = upgradeSavedRecreatedUncut({ ...project, story, directorsCutId: "uncut", recreatedUncutCoverageVersion: 7, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } });
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(active.find(f => f.id === "nw_b38")!.picture).toBe("/custom.jpg");
    expect(active.find(f => f.id === "nw_b893")!.picture).toBe("asset:gap-uncut-893");
    expect(stashed.find(f => f.id === "nw_b38")!.picture).toBe("asset:gap-uncut-038");
    expect(stashed.find(f => f.id === "nw_b893")!.picture).toBe("/custom-carried.jpg");
  });
  it("migrates saved and stashed Uncut without overwriting custom or carried pictures", () => {
    const project = base();
    const savedStory = structuredClone(project.story);
    buildKeyframes(savedStory).find(f => f.id === "nw_b31")!.beat.background = "/custom.jpg";
    const stashedStory = structuredClone(project.story);
    buildKeyframes(stashedStory).find(f => f.id === "nw_b1572")!.beat.background = "/custom-carried.jpg";
    const result = upgradeSavedRecreatedUncut({ ...project, story: savedStory, directorsCutId: "uncut", savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } });
    expect(buildKeyframes(result.story).find(f => f.id === "nw_b31")!.picture).toBe("/custom.jpg");
    expect(buildKeyframes(result.story).find(f => f.id === "nw_b1637")!.picture).toBe("asset:recreated-uncut-1637");
    expect(buildKeyframes(result.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1573")!.picture).toBe("/custom-carried.jpg");
    expect(upgradeSavedRecreatedUncut(result)).toBe(result);
  });
});
