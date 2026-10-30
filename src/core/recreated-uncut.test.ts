import { describe, expect, it, vi } from "vitest";
import film from "../data/nobodys-witness-film.json";
import audioDurations from "../data/audio-durations.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { buildDirectorsCutById } from "./directorsCut";
import { upgradeSavedRecreatedUncut } from "./recreatedUncut";
import { buildTimelineClips } from "../sequence/animate";

vi.mock("../assets/recreated-uncut/1573-empty-chair.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,YQ==" }));
vi.mock("../assets/recreated-uncut/031-after-twenty-years.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yg==" }));
vi.mock("../assets/recreated-uncut/1637-vera-still.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yw==" }));

vi.mock("../assets/recreated-uncut/099-vera-hesitates.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cA==" }));
vi.mock("../assets/recreated-uncut/1358-jack-stands.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cQ==" }));
vi.mock("../assets/recreated-uncut/1565-only-tea.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cg==" }));

vi.mock("../assets/recreated-uncut/038-sedan-departs.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,cw==" }));
vi.mock("../assets/recreated-uncut/893-jack-what.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dA==" }));

const base = () => createProjectState(parseImportPayload(film, "film.json"), []);
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
    const selected = ["nw_b31", "nw_b1573", "nw_b1637", "nw_b28", "nw_b1037", "nw_b1351", "nw_b17", "nw_b1671", "nw_b27", "nw_b1054", "nw_b1467", "nw_b1020", "nw_b1177", "nw_b148", "nw_b716", "nw_b99", "nw_b1358", "nw_b1565", "nw_b38", "nw_b893"];
    expect(next.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]))
      .toEqual(old.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]));
    expect(next.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture))
      .toEqual(old.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture));
    for (const [id, asset] of [["nw_b31", "recreated-uncut-031"], ["nw_b1573", "recreated-uncut-1573"], ["nw_b1637", "recreated-uncut-1637"], ["nw_b28", "recreated-uncut-028"], ["nw_b1037", "recreated-uncut-1037"], ["nw_b1351", "recreated-uncut-1351"], ["nw_b17", "recreated-uncut-017"], ["nw_b1671", "recreated-uncut-1671"], ["nw_b27", "recreated-uncut-027"], ["nw_b1054", "recreated-uncut-1054"], ["nw_b1467", "recreated-uncut-1467"], ["nw_b1020", "recreated-uncut-1020"], ["nw_b1177", "recreated-uncut-1177"], ["nw_b148", "recreated-uncut-148"], ["nw_b716", "recreated-uncut-716"], ["nw_b99", "gap-uncut-099"], ["nw_b1358", "gap-uncut-1358"], ["nw_b1565", "gap-uncut-1565"], ["nw_b38", "gap-uncut-038"], ["nw_b893", "gap-uncut-893"]]) {
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
    for (const [start, inserted, next] of [["nw_b98", "nw_b99", "nw_b100"], ["nw_b1357", "nw_b1358", "nw_b1359"], ["nw_b1564", "nw_b1565", "nw_b1566"], ["nw_b37", "nw_b38", "nw_b39"], ["nw_b892", "nw_b893", "nw_b894"]]) {
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
  it("does not replace a saved custom image in a new gap", () => {
    const project = base();
    const story = structuredClone(project.story);
    buildKeyframes(story).find(f => f.id === "nw_b99")!.beat.background = "/custom.jpg";
    const upgraded = upgradeSavedRecreatedUncut({ ...project, story, directorsCutId: "uncut", recreatedUncutCoverageVersion: 6 });
    expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b99")!.picture).toBe("/custom.jpg");
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
