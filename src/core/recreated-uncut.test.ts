import { describe, expect, it, vi } from "vitest";
import film from "../data/nobodys-witness-film.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { buildDirectorsCutById } from "./directorsCut";
import { upgradeSavedRecreatedUncut } from "./recreatedUncut";
import { buildTimelineClips } from "../sequence/animate";

vi.mock("../assets/recreated-uncut/1573-empty-chair.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,YQ==" }));
vi.mock("../assets/recreated-uncut/031-after-twenty-years.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yg==" }));
vi.mock("../assets/recreated-uncut/1637-vera-still.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,Yw==" }));

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
  it("adds the fifteen votes while preserving all other shots, text, audio and duration", () => {
    const source = base();
    const result = buildDirectorsCutById(source, "uncut", new Map());
    const old = buildTimelineClips(buildKeyframes(source.originalStory)).clips;
    const next = buildTimelineClips(buildKeyframes(result.story)).clips;
    const selected = ["nw_b31", "nw_b1573", "nw_b1637", "nw_b28", "nw_b1037", "nw_b1351", "nw_b17", "nw_b1671", "nw_b27", "nw_b1054", "nw_b1467", "nw_b1020", "nw_b1177", "nw_b148", "nw_b716"];
    expect(next.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]))
      .toEqual(old.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]));
    expect(next.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture))
      .toEqual(old.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture));
    for (const [id, asset] of [["nw_b31", "recreated-uncut-031"], ["nw_b1573", "recreated-uncut-1573"], ["nw_b1637", "recreated-uncut-1637"], ["nw_b28", "recreated-uncut-028"], ["nw_b1037", "recreated-uncut-1037"], ["nw_b1351", "recreated-uncut-1351"], ["nw_b17", "recreated-uncut-017"], ["nw_b1671", "recreated-uncut-1671"], ["nw_b27", "recreated-uncut-027"], ["nw_b1054", "recreated-uncut-1054"], ["nw_b1467", "recreated-uncut-1467"], ["nw_b1020", "recreated-uncut-1020"], ["nw_b1177", "recreated-uncut-1177"], ["nw_b148", "recreated-uncut-148"], ["nw_b716", "recreated-uncut-716"]]) {
      expect(next.find(c => c.keyframe.id === id)?.keyframe.picture).toBe(`asset:${asset}`);
      expect(result.assets.find(a => a.id === asset)?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    }
    expect(result.originalStory).toEqual(source.originalStory);
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
