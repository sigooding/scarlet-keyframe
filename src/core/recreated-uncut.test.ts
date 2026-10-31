import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import film from "../data/nobodys-witness-film.json";
import audioDurations from "../data/audio-durations.json";
import mediaIndex from "../data/media-index.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "./model";
import { buildDirectorsCutById } from "./directorsCut";
import { RECREATED_DEPTH_MAP_BY_BEAT, addRecreatedUncutCoverage, upgradeSavedRecreatedUncut } from "./recreatedUncut";
import { buildTimelineClips } from "../sequence/animate";

vi.mock("../assets/recreated-uncut/1562-sedan-door.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1YQ==" }));
vi.mock("../assets/recreated-uncut/115-he-hangs-up.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE2YQ==" }));
vi.mock("../assets/recreated-uncut/314-reconstructing-it.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE2Yg==" }));
vi.mock("../assets/recreated-uncut/418-umbrella-swings.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE2Yw==" }));
vi.mock("../assets/recreated-uncut/1176-something-slow.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE2ZA==" }));
vi.mock("../assets/recreated-uncut/199-asking-about-mara.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1Yg==" }));
vi.mock("../assets/recreated-uncut/1439-plaza-miniatures.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1Yw==" }));
vi.mock("../assets/recreated-uncut/1332-reading-notebook.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1ZA==" }));
vi.mock("../assets/recreated-uncut/465-kaneko-at-counter.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1ZQ==" }));
vi.mock("../assets/recreated-uncut/1464-vera-storeroom.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1Zg==" }));
vi.mock("../assets/recreated-uncut/1007-ishida-drives.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1Zw==" }));
vi.mock("../assets/recreated-uncut/288-jack-remembers.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1aA==" }));
vi.mock("../assets/recreated-uncut/1302-black-sedan-window.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE1aQ==" }));
vi.mock("../assets/recreated-uncut/1349-ishidas-answer.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE0YQ==" }));
vi.mock("../assets/recreated-uncut/773-just-an-inn.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE0Yg==" }));
vi.mock("../assets/recreated-uncut/1316-vera-reads-letter.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE0Yw==" }));
vi.mock("../assets/recreated-uncut/1076-dress-ready.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,djE0ZA==" }));
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
vi.mock("../assets/recreated-uncut/depth/1562-sedan-door-depth.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ZA==" }));
vi.mock("../assets/recreated-uncut/depth/465-kaneko-counter-depth.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ZA==" }));
vi.mock("../assets/recreated-uncut/depth/1316-vera-reads-letter-depth.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,ZA==" }));
vi.mock("../assets/recreated-uncut/128-missing-person-form.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dg==" }));
vi.mock("../assets/recreated-uncut/1686-beyond-the-curtain.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,dw==" }));
vi.mock("../assets/recreated-uncut/284-daniel-voss-portrait.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,eA==" }));
vi.mock("../assets/recreated-uncut/1360-where-is-it.jpg?url&inline", () => ({ default: "data:image/jpeg;base64,eQ==" }));


function readJpegDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`No JPEG SOF marker in ${filePath}`);
}

const base = () => createProjectState(parseImportPayload(film, "film.json"), []);
const v15Plates = [
  ["nw_b1562", "duplicate-uncut-1562"],
  ["nw_b199", "duplicate-uncut-199"],
  ["nw_b1439", "duplicate-uncut-1439"],
  ["nw_b1332", "duplicate-uncut-1332"],
  ["nw_b465", "duplicate-uncut-465"],
  ["nw_b1464", "duplicate-uncut-1464"],
  ["nw_b1007", "duplicate-uncut-1007"],
  ["nw_b288", "duplicate-uncut-288"],
  ["nw_b1302", "duplicate-uncut-1302"],
] as const;
const v16Plates = [
  ["nw_b115", "duplicate-uncut-115"],
  ["nw_b314", "duplicate-uncut-314"],
  ["nw_b418", "duplicate-uncut-418"],
  ["nw_b1176", "duplicate-uncut-1176"],
] as const;
const v16BeatIds: string[] = v16Plates.map(([id]) => id);
const v15BeatIds: string[] = v15Plates.map(([id]) => id);
const v15AndV16BeatIds = [...v15BeatIds, ...v16BeatIds];
const v14BeatIds = ["nw_b1349", "nw_b773", "nw_b1316", "nw_b1076"];
const v14AndV15BeatIds = [...v14BeatIds, ...v15BeatIds, ...v16BeatIds];
const oldHarada = { id: "duplicate-uncut-1383", name: "Listening to the tape.jpg", type: "image" as const, source: "bundle" as const, size: 2, dataUrl: "data:image/jpeg;base64,ejI=" };
const preserveNewSources = (story: ReturnType<typeof base>["story"]) => {
  const frames = buildKeyframes(story);
  for (const frame of frames.filter(f => v14AndV15BeatIds.includes(f.id))) frame.beat.background = frame.picture;
};
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
    const selected = ["nw_b31", "nw_b1573", "nw_b1637", "nw_b28", "nw_b1037", "nw_b1351", "nw_b17", "nw_b1671", "nw_b27", "nw_b1054", "nw_b1467", "nw_b1020", "nw_b1177", "nw_b148", "nw_b716", "nw_b99", "nw_b1358", "nw_b1565", "nw_b38", "nw_b893", "nw_b1073", "nw_b128", "nw_b1686", "nw_b284", "nw_b1360", "nw_b300", "nw_b1383", "nw_b980", "nw_b1349", "nw_b773", "nw_b1316", "nw_b1076", ...v15BeatIds, ...v16BeatIds];
    expect(next.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]))
      .toEqual(old.map(c => [c.keyframe.id, c.keyframe.text, c.durationFrames, c.keyframe.beat.audioUrl]));
    expect(next.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture))
      .toEqual(old.filter(c => !selected.includes(c.keyframe.id)).map(c => c.keyframe.picture));
    for (const [id, asset] of [["nw_b31", "recreated-uncut-031"], ["nw_b1573", "recreated-uncut-1573"], ["nw_b1637", "recreated-uncut-1637"], ["nw_b28", "recreated-uncut-028"], ["nw_b1037", "recreated-uncut-1037"], ["nw_b1351", "recreated-uncut-1351"], ["nw_b17", "recreated-uncut-017"], ["nw_b1671", "recreated-uncut-1671"], ["nw_b27", "recreated-uncut-027"], ["nw_b1054", "recreated-uncut-1054"], ["nw_b1467", "recreated-uncut-1467"], ["nw_b1020", "recreated-uncut-1020"], ["nw_b1177", "recreated-uncut-1177"], ["nw_b148", "recreated-uncut-148"], ["nw_b716", "recreated-uncut-716"], ["nw_b99", "gap-uncut-099"], ["nw_b1358", "gap-uncut-1358"], ["nw_b1565", "gap-uncut-1565"], ["nw_b38", "gap-uncut-038"], ["nw_b893", "gap-uncut-893"], ["nw_b1073", "gap-uncut-1073"], ["nw_b128", "gap-uncut-128"], ["nw_b1686", "gap-uncut-1686"], ["nw_b284", "gap-uncut-284"], ["nw_b1360", "gap-uncut-1360"], ["nw_b300", "duplicate-uncut-300"], ["nw_b1383", "duplicate-uncut-1383-wide"], ["nw_b980", "duplicate-uncut-980"], ["nw_b1349", "duplicate-uncut-1349"], ["nw_b773", "duplicate-uncut-773"], ["nw_b1316", "duplicate-uncut-1316"], ["nw_b1076", "duplicate-uncut-1076"], ...v15Plates, ...v16Plates]) {
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
    for (const [start, inserted, next] of [["nw_b98", "nw_b99", "nw_b100"], ["nw_b1357", "nw_b1358", "nw_b1359"], ["nw_b1564", "nw_b1565", "nw_b1566"], ["nw_b37", "nw_b38", "nw_b39"], ["nw_b892", "nw_b893", "nw_b894"], ["nw_b1072", "nw_b1073", "nw_b1074"], ["nw_b127", "nw_b128", "nw_b129"], ["nw_b1685", "nw_b1686", "nw_b1687"], ["nw_b283", "nw_b284", "nw_b285"], ["nw_b1359", "nw_b1360", "nw_b1361"], ["nw_b114", "nw_b115", "nw_b116"], ["nw_b313", "nw_b314", "nw_b315"], ["nw_b417", "nw_b418", "nw_b419"]]) {
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
    const oldWait = before.find(c => c.keyframe.id === "nw_b1175")!;
    const oldPiano = before.find(c => c.keyframe.id === "nw_b1176")!;
    const newWait = after.find(c => c.keyframe.id === "nw_b1175")!;
    const newPiano = after.find(c => c.keyframe.id === "nw_b1176")!;
    expect((oldWait.durationFrames + oldPiano.durationFrames) / 24).toBeGreaterThan(7);
    expect(newWait.durationFrames / 24).toBeLessThanOrEqual(7);
    expect(newPiano.durationFrames / 24).toBeLessThanOrEqual(7);
    expect(newWait.keyframe.picture).toBe(oldWait.keyframe.picture);
    expect(newPiano.keyframe.picture).toBe("asset:duplicate-uncut-1176");
    expect(after.find(c => c.keyframe.id === "nw_b1177")!.keyframe.picture).toBe("asset:recreated-uncut-1177");
  });
  it("replaces the second image in voted duplicate pairs without changing the surrounding beats", () => {
    const source = base();
    const result = buildDirectorsCutById(source, "uncut", new Map());
    const durations = new Map(Object.entries(audioDurations));
    const before = buildTimelineClips(buildKeyframes(source.originalStory), durations).clips;
    const after = buildTimelineClips(buildKeyframes(result.story), durations).clips;
    expect(after.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]))
      .toEqual(before.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]));
    for (const [id, asset] of [["nw_b300", "duplicate-uncut-300"], ["nw_b1383", "duplicate-uncut-1383-wide"], ["nw_b980", "duplicate-uncut-980"], ["nw_b1349", "duplicate-uncut-1349"], ["nw_b773", "duplicate-uncut-773"], ["nw_b1316", "duplicate-uncut-1316"], ["nw_b1076", "duplicate-uncut-1076"], ...v15Plates, ["nw_b115", "duplicate-uncut-115"], ["nw_b314", "duplicate-uncut-314"], ["nw_b418", "duplicate-uncut-418"]] as const) {
      const index = before.findIndex(c => c.keyframe.id === id);
      expect(index).toBeGreaterThan(0);
      expect(before[index - 1].keyframe.picture).toBe(before[index].keyframe.picture);
      expect(after[index - 1].keyframe.picture).toBe(before[index - 1].keyframe.picture);
      expect(after[index].keyframe.picture).toBe(`asset:${asset}`);
      expect(after[index + 1].keyframe.picture).toBe(before[index + 1].keyframe.picture);
    }
    const pianoIndex = before.findIndex(c => c.keyframe.id === "nw_b1176");
    expect(before[pianoIndex - 1].keyframe.picture).toBe(before[pianoIndex].keyframe.picture);
    expect(after[pianoIndex - 1].keyframe.picture).toBe(before[pianoIndex - 1].keyframe.picture);
    expect(after[pianoIndex].keyframe.picture).toBe("asset:duplicate-uncut-1176");
    expect(after[pianoIndex + 1].keyframe.picture).toBe("asset:recreated-uncut-1177");
  });
  it("upgrades v15 active and stashed Uncut to v16 without changing custom pictures, looks, or timing", () => {
    const project = base();
    const v15Base = buildDirectorsCutById(project, "uncut", new Map());
    // Revert only the v16 beats on a v15 snapshot to simulate a real saved v15 project
    const makeV15Story = () => {
      const s = structuredClone(project.originalStory);
      addRecreatedUncutCoverage(s, [], 0);
      for (const [id, src] of [
        ["nw_b115", undefined],
        ["nw_b314", undefined],
        ["nw_b418", undefined],
        ["nw_b1176", undefined],
      ] as const) {
        const beat = buildKeyframes(s).find(f => f.id === id)!.beat;
        delete beat.background;
        delete beat.backgroundHold;
        delete beat.cinematic;
        void src;
      }
      return s;
    };
    const activeStory = makeV15Story();
    const stashedStory = makeV15Story();
    const activeFrames = buildKeyframes(activeStory);
    const stashedFrames = buildKeyframes(stashedStory);
    activeFrames.find(f => f.id === "nw_b115")!.beat.background = "/custom-counter.jpg";
    activeFrames.find(f => f.id === "nw_b313")!.beat.background = "/custom-strap.jpg";
    activeFrames.find(f => f.id === "nw_b418")!.beat.cinematic = { depthMap: "/custom-depth.png", colorGrade: "user-grade" };
    stashedFrames.find(f => f.id === "nw_b314")!.beat.cinematic = { colorGrade: "stashed-grade" };
    stashedFrames.find(f => f.id === "nw_b314")!.beat.animation = { values: { zoom: 1.08 } };
    const collision = { id: "duplicate-uncut-418", name: "User umbrella.jpg", type: "image" as const, source: "upload" as const, size: 6, dataUrl: "data:image/jpeg;base64,Y3VzdG9t" };
    const preAssets = v15Base.assets.filter(a => !v16Plates.some(([, aid]) => aid === a.id));
    const saved = { ...project, assets: [...preAssets, collision], story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 15, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const unaffected = (story: typeof activeStory) => buildKeyframes(story).filter(f => !v16BeatIds.includes(f.id)).map(f => [f.id, f.picture, f.cinematic]);
    const timing = (story: typeof activeStory) => buildTimelineClips(buildKeyframes(story), new Map(Object.entries(audioDurations))).clips.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]);
    const beforeActive = unaffected(saved.story);
    const beforeStashed = unaffected(saved.savedCutStates.uncut.story);
    const activeTiming = timing(saved.story);
    const stashedTiming = timing(saved.savedCutStates.uncut.story);

    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(unaffected(upgraded.story)).toEqual(beforeActive);
    expect(unaffected(upgraded.savedCutStates!.uncut!.story)).toEqual(beforeStashed);
    expect(timing(upgraded.story)).toEqual(activeTiming);
    expect(timing(upgraded.savedCutStates!.uncut!.story)).toEqual(stashedTiming);
    expect(active.find(f => f.id === "nw_b115")!.picture).toBe("/custom-counter.jpg");
    expect(active.find(f => f.id === "nw_b314")!.picture).toBe("/custom-strap.jpg");
    expect(active.find(f => f.id === "nw_b418")!.picture).toBe("/film/img/s14a/340-the-shuttered-door.jpg");
    expect(active.find(f => f.id === "nw_b418")!.beat.cinematic).toEqual({ depthMap: "/custom-depth.png", colorGrade: "user-grade" });
    expect(active.find(f => f.id === "nw_b1176")!.picture).toBe("asset:duplicate-uncut-1176");
    expect(active.find(f => f.id === "nw_b1177")!.picture).toBe("asset:recreated-uncut-1177");
    expect(stashed.find(f => f.id === "nw_b115")!.picture).toBe("asset:duplicate-uncut-115");
    expect(stashed.find(f => f.id === "nw_b314")!.picture).toBe("asset:duplicate-uncut-314");
    expect(stashed.find(f => f.id === "nw_b314")!.beat.cinematic?.colorGrade).toBe("stashed-grade");
    expect(stashed.find(f => f.id === "nw_b314")!.beat.animation).toEqual({ values: { zoom: 1.08 } });
    expect(stashed.find(f => f.id === "nw_b418")!.picture).toBe("/film/img/s14a/340-the-shuttered-door.jpg");
    expect(stashed.find(f => f.id === "nw_b1176")!.picture).toBe("asset:duplicate-uncut-1176");
    expect(upgraded.assets.find(asset => asset.id === collision.id)).toEqual(collision);
    expect(upgraded.assets.some(asset => asset.id === "duplicate-uncut-967")).toBe(false);
    expect(upgraded.assets.some(asset => asset.id === "duplicate-uncut-1413")).toBe(false);
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("breaks the carried dress image at the second scene's beat without shifting its neighbours", () => {
    const project = base();
    const before = buildTimelineClips(buildKeyframes(project.originalStory), new Map(Object.entries(audioDurations))).clips;
    const after = buildTimelineClips(buildKeyframes(buildDirectorsCutById(project, "uncut", new Map()).story), new Map(Object.entries(audioDurations))).clips;
    const old = (id: string) => before.find(c => c.keyframe.id === id)!;
    const current = (id: string) => after.find(c => c.keyframe.id === id)!;
    expect(old("nw_b1074").keyframe.sceneId).toBe("nw_s65");
    expect(old("nw_b1075").keyframe.sceneId).toBe("nw_s65_b");
    expect(old("nw_b1074").keyframe.picture).toBe(old("nw_b1075").keyframe.picture);
    expect(old("nw_b1075").keyframe.picture).toBe(old("nw_b1076").keyframe.picture);
    expect(current("nw_b1074").keyframe.picture).toBe(old("nw_b1074").keyframe.picture);
    expect(current("nw_b1075").keyframe.picture).toBe(old("nw_b1075").keyframe.picture);
    expect(current("nw_b1076").keyframe.picture).toBe("asset:duplicate-uncut-1076");
    expect(current("nw_b1077").keyframe.picture).toBe(old("nw_b1077").keyframe.picture);
    expect(current("nw_b1076").startFrame).toBe(old("nw_b1076").startFrame);
    expect(current("nw_b1076").durationFrames).toBe(old("nw_b1076").durationFrames);
  });
  it("upgrades v14 active and stashed Uncut without changing custom pictures, looks, or timing", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    const activeFrames = buildKeyframes(activeStory);
    const stashedFrames = buildKeyframes(stashedStory);
    activeFrames.find(f => f.id === "nw_b1562")!.beat.background = "/custom-sedan.jpg";
    activeFrames.find(f => f.id === "nw_b198")!.beat.background = "/custom-bar.jpg";
    activeFrames.find(f => f.id === "nw_b1332")!.beat.cinematic = { colorGrade: "user-grade" };
    activeFrames.find(f => f.id === "nw_b1332")!.beat.animation = { values: { zoom: 1.12 } };
    activeFrames.find(f => f.id === "nw_b1464")!.beat.cinematic = { depthMap: "/custom-depth.png", colorGrade: "user-depth-grade" };
    stashedFrames.find(f => f.id === "nw_b1438")!.beat.background = "/custom-plaza.jpg";
    stashedFrames.find(f => f.id === "nw_b288")!.beat.background = "/custom-photograph.jpg";
    const collision = { id: "duplicate-uncut-1007", name: "User image.jpg", type: "image" as const, source: "upload" as const, size: 6, dataUrl: "data:image/jpeg;base64,Y3VzdG9t" };
    const saved = { ...project, assets: [collision], story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 14, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const unaffected = (story: typeof activeStory) => buildKeyframes(story).filter(f => !v15AndV16BeatIds.includes(f.id)).map(f => [f.id, f.picture, f.cinematic]);
    const timing = (story: typeof activeStory) => buildTimelineClips(buildKeyframes(story), new Map(Object.entries(audioDurations))).clips.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions]);
    const beforeActive = unaffected(saved.story);
    const beforeStashed = unaffected(saved.savedCutStates.uncut.story);
    const activeTiming = timing(saved.story);
    const stashedTiming = timing(saved.savedCutStates.uncut.story);

    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(unaffected(upgraded.story)).toEqual(beforeActive);
    expect(unaffected(upgraded.savedCutStates!.uncut!.story)).toEqual(beforeStashed);
    expect(timing(upgraded.story)).toEqual(activeTiming);
    expect(timing(upgraded.savedCutStates!.uncut!.story)).toEqual(stashedTiming);
    expect(active.find(f => f.id === "nw_b1562")!.picture).toBe("/custom-sedan.jpg");
    expect(active.find(f => f.id === "nw_b199")!.picture).toBe("/custom-bar.jpg");
    expect(active.find(f => f.id === "nw_b1007")!.picture).toBe("/film/img/s61/481-the-side-of-his-face.jpg");
    expect(active.find(f => f.id === "nw_b1464")!.picture).toBe("/film/img/s84/117-both-wrong.jpg");
    expect(active.find(f => f.id === "nw_b1464")!.beat.cinematic).toEqual({ depthMap: "/custom-depth.png", colorGrade: "user-depth-grade" });
    expect(active.find(f => f.id === "nw_b1332")!.picture).toBe("asset:duplicate-uncut-1332");
    expect(active.find(f => f.id === "nw_b1332")!.beat.cinematic?.colorGrade).toBe("user-grade");
    expect(active.find(f => f.id === "nw_b1332")!.beat.animation).toEqual({ values: { zoom: 1.12 } });
    expect(stashed.find(f => f.id === "nw_b1439")!.picture).toBe("/custom-plaza.jpg");
    expect(stashed.find(f => f.id === "nw_b288")!.picture).toBe("/custom-photograph.jpg");
    expect(stashed.find(f => f.id === "nw_b1562")!.picture).toBe("asset:duplicate-uncut-1562");
    expect(stashed.find(f => f.id === "nw_b1007")!.picture).toBe("/film/img/s61/481-the-side-of-his-face.jpg");
    expect(upgraded.assets.find(asset => asset.id === collision.id)).toEqual(collision);
    expect(upgraded.assets.some(asset => asset.id === "duplicate-uncut-87")).toBe(false);
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b1332")!.picture).toBe("/film/img/s79/92-underlined-twice.jpg");
  });
  it("rolls back a v15 insert if it would change later carried pictures or cinematic looks", () => {
    for (const insertGap of [false, true]) {
      const story = {
        id: "nobodys-witness-film", startSceneId: "nw_s94", scenes: [{
          id: "nw_s94", background: "/scene-default.jpg", dialogueBeats: [
            { id: "source", background: "/film/img/s94/139-only-tea.jpg", cinematic: { colorGrade: "user-grade" } },
            { id: "nw_b1562" },
            ...(insertGap ? [{ id: "user-gap", gap: true }] : []),
            { id: "later" },
          ],
        }],
      };
      const before = structuredClone(story);
      const framesBefore = buildKeyframes(story).map(f => [f.id, f.picture, f.cinematic]);
      const assets = addRecreatedUncutCoverage(story, [], 14);
      expect(assets).toEqual([]);
      expect(story).toEqual(before);
      expect(buildKeyframes(story).map(f => [f.id, f.picture, f.cinematic])).toEqual(framesBefore);
    }
  });
  it("restores a safely inherited following picture when inserting a v15 shot", () => {
    const story = {
      id: "nobodys-witness-film", startSceneId: "nw_s94", scenes: [{
        id: "nw_s94", background: "/scene-default.jpg", dialogueBeats: [
          { id: "source", background: "/film/img/s94/139-only-tea.jpg" },
          { id: "nw_b1562" },
          { id: "later" },
        ],
      }],
    };
    const before = buildKeyframes(story);
    const assets = addRecreatedUncutCoverage(story, [], 14);
    const after = buildKeyframes(story);
    expect(after.find(f => f.id === "nw_b1562")!.picture).toBe("asset:duplicate-uncut-1562");
    expect(after.find(f => f.id === "later")!.picture).toBe(before.find(f => f.id === "later")!.picture);
    // The plate and the voted depth map for that plate are bundled together.
    expect(assets.map(asset => asset.id).sort()).toEqual(["depth-uncut-1562", "duplicate-uncut-1562"]);
  });
  it("upgrades a stashed v14 Uncut without changing another active cut", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const saved = { ...project, story: activeStory, directorsCutId: "creative" as const, recreatedUncutCoverageVersion: 14, savedCutStates: { uncut: { story: structuredClone(project.story), updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    expect(upgraded.story).toBe(activeStory);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    for (const [id, asset] of v15Plates) expect(stashed.find(f => f.id === id)?.picture).toBe(`asset:${asset}`);
  });
  it("retains an explicitly edited hold instead of replacing its frame", () => {
    const story = structuredClone(base().story);
    const target = buildKeyframes(story).find(f => f.id === "nw_b465")!;
    target.beat.backgroundHold = true;
    const before = target.picture;
    addRecreatedUncutCoverage(story, [], 14);
    const after = buildKeyframes(story).find(f => f.id === "nw_b465")!;
    expect(after.picture).toBe(before);
    expect(after.beat.backgroundHold).toBe(true);
  });
  it("upgrades v13 Uncut while retaining direct and inherited custom pictures in active and stashed saves", () => {
    const project = base();
    const activeStory = structuredClone(project.story);
    const stashedStory = structuredClone(project.story);
    buildKeyframes(activeStory).find(f => f.id === "nw_b1349")!.beat.background = "/custom-ishida.jpg";
    buildKeyframes(stashedStory).find(f => f.id === "nw_b772")!.beat.background = "/custom-inn.jpg";
    buildKeyframes(stashedStory).find(f => f.id === "nw_b1075")!.beat.background = "/custom-dress.jpg";
    const saved = { ...project, story: activeStory, directorsCutId: "uncut" as const, recreatedUncutCoverageVersion: 13, savedCutStates: { uncut: { story: stashedStory, updatedAt: 1 } } };
    const upgraded = upgradeSavedRecreatedUncut(saved);
    const active = buildKeyframes(upgraded.story);
    const stashed = buildKeyframes(upgraded.savedCutStates!.uncut!.story);
    expect(active.find(f => f.id === "nw_b1349")!.picture).toBe("/custom-ishida.jpg");
    expect(active.find(f => f.id === "nw_b773")!.picture).toBe("asset:duplicate-uncut-773");
    expect(active.find(f => f.id === "nw_b1316")!.picture).toBe("asset:duplicate-uncut-1316");
    expect(active.find(f => f.id === "nw_b1076")!.picture).toBe("asset:duplicate-uncut-1076");
    expect(stashed.find(f => f.id === "nw_b1349")!.picture).toBe("asset:duplicate-uncut-1349");
    expect(stashed.find(f => f.id === "nw_b773")!.picture).toBe("/custom-inn.jpg");
    expect(stashed.find(f => f.id === "nw_b1316")!.picture).toBe("asset:duplicate-uncut-1316");
    expect(stashed.find(f => f.id === "nw_b1076")!.picture).toBe("/custom-dress.jpg");
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
    expect(upgraded.audioClips).toBe(saved.audioClips);
    expect(buildKeyframes(saved.story).find(f => f.id === "nw_b1076")!.picture).toBe("/film/img/s65/232-the-wine-red-dress.jpg");
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("does not use a conflicting user asset for one of the new bundled shots", () => {
    const project = base();
    const custom = { id: "duplicate-uncut-1349", name: "User image.jpg", type: "image" as const, source: "upload" as const, size: 6, dataUrl: "data:image/jpeg;base64,Y3VzdG9t" };
    const upgraded = upgradeSavedRecreatedUncut({ ...project, assets: [custom], directorsCutId: "uncut", recreatedUncutCoverageVersion: 13 });
    expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b1349")!.picture).toBe("/film/img/s80/95-ishida-doesnt-look-up.jpg");
    expect(upgraded.assets.find(asset => asset.id === custom.id)).toEqual(custom);
    expect(buildKeyframes(upgraded.story).find(f => f.id === "nw_b773")!.picture).toBe("asset:duplicate-uncut-773");
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
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
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
    expect(after.filter(c => !v14AndV15BeatIds.includes(c.keyframe.id)).map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions, c.keyframe.beat.animation, c.keyframe.beat.cinematic]))
      .toEqual(before.filter(c => !v14AndV15BeatIds.includes(c.keyframe.id)).map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.text, c.keyframe.beat.audioUrl, c.keyframe.beat.captions, c.keyframe.beat.animation, c.keyframe.beat.cinematic]));
    expect(after.filter(c => c.keyframe.id !== "nw_b1383" && !v14AndV15BeatIds.includes(c.keyframe.id)).map(c => c.keyframe.picture))
      .toEqual(before.filter(c => c.keyframe.id !== "nw_b1383" && !v14AndV15BeatIds.includes(c.keyframe.id)).map(c => c.keyframe.picture));
    expect(after.find(c => c.keyframe.id === "nw_b1383")!.keyframe.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(buildKeyframes(upgraded.savedCutStates!.uncut!.story).find(f => f.id === "nw_b1383")!.picture).toBe("asset:duplicate-uncut-1383-wide");
    expect(upgraded.assets.find(asset => asset.id === oldHarada.id)).toEqual(oldHarada);
    expect(upgraded.assets.find(asset => asset.id === "duplicate-uncut-1383-wide")?.dataUrl).toBe("data:image/jpeg;base64,d2lkZQ==");
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
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
      expect(upgraded.assets.find(asset => asset.id === oldHarada.id)).toEqual(assets[0]);
      expect(upgraded.assets.find(asset => asset.id === "duplicate-uncut-1383-wide"))
        .toEqual(assets.find(asset => asset.id === "duplicate-uncut-1383-wide"));
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
    const changed = before.filter(f => f.id !== "nw_b1383" && !v14AndV15BeatIds.includes(f.id)).flatMap(f => {
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
    preserveNewSources(story);
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

describe("voted depth maps for recreated Original Uncut stills", () => {
  const depthBeats = Object.keys(RECREATED_DEPTH_MAP_BY_BEAT).sort();
  it("gives only the three voted recreated stills a real depth-map camera", () => {
    const result = buildDirectorsCutById(base(), "uncut", new Map());
    const frames = buildKeyframes(result.story);
    expect(depthBeats).toEqual(["nw_b1316", "nw_b1562", "nw_b465"]);
    for (const id of depthBeats) {
      const entry = RECREATED_DEPTH_MAP_BY_BEAT[id];
      const frame = frames.find(f => f.id === id)!;
      expect(frame.picture).toBe(`asset:${entry.plateAssetId}`);
      expect(result.assets.find(a => a.id === entry.depthAssetId)?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(frame.beat.cinematic).toMatchObject({
        depthMap: `asset:${entry.depthAssetId}`,
        depthMotion: "push",
        depthAmount: entry.depthAmount,
        mode: "static",
      });
    }
    // Only these three beats use a recreated depth map.
    const usesRecreatedMap = frames
      .filter(f => /^asset:depth-uncut-/.test(String(f.beat.cinematic?.depthMap ?? "")))
      .map(f => f.id).sort();
    expect(usesRecreatedMap).toEqual(depthBeats);
  });
  it("stores the voted depth maps on disk at 960x540 and lists them in the media index", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    const listed = new Set((mediaIndex as string[]).map(p => p.replace(/^\/+/, "")));
    for (const id of depthBeats) {
      const rel = RECREATED_DEPTH_MAP_BY_BEAT[id].sourcePath.replace(/^\/+/, "");
      const file = path.join(repoRoot, "public", rel);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(5_000);
      expect(readJpegDimensions(file)).toEqual({ width: 960, height: 540 });
      expect(listed.has(rel)).toBe(true);
      const examples = JSON.parse(fs.readFileSync(path.join(repoRoot, "public/examples/media-index.json"), "utf8")) as string[];
      expect(examples).toContain(`/${rel}`);
    }
  });
  it("adds the depth cameras to already-saved v16 Uncut without touching pictures, timing or looks", () => {
    const project = base();
    const saved = structuredClone(project.story);
    addRecreatedUncutCoverage(saved, [], 0);
    for (const id of depthBeats) {
      const beat = buildKeyframes(saved).find(f => f.id === id)!.beat;
      delete beat.cinematic;
      beat.cinematic = { colorGrade: "tokyo-noir", grain: true };
    }
    const durations = new Map(Object.entries(audioDurations));
    const before = buildTimelineClips(buildKeyframes(saved), durations).clips;
    const upgraded = upgradeSavedRecreatedUncut({ ...project, story: saved, directorsCutId: "uncut", recreatedUncutCoverageVersion: 16 });
    expect(upgraded.recreatedUncutCoverageVersion).toBe(17);
    const frames = buildKeyframes(upgraded.story);
    for (const id of depthBeats) {
      expect(frames.find(f => f.id === id)!.beat.cinematic).toEqual({
        colorGrade: "tokyo-noir", grain: true,
        ...RECREATED_DEPTH_MAP_BY_BEAT[id] && {
          mode: "static",
          depthMap: `asset:${RECREATED_DEPTH_MAP_BY_BEAT[id].depthAssetId}`,
          depthMotion: "push",
          depthAmount: RECREATED_DEPTH_MAP_BY_BEAT[id].depthAmount,
          depthSeconds: 8,
        },
      });
    }
    const after = buildTimelineClips(frames, durations).clips;
    expect(after.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.picture]))
      .toEqual(before.map(c => [c.keyframe.id, c.startFrame, c.durationFrames, c.keyframe.picture]));
    expect(upgradeSavedRecreatedUncut(upgraded)).toBe(upgraded);
  });
  it("never overrides a shot that already has its own depth rig or a different picture", () => {
    const project = base();
    const saved = structuredClone(project.story);
    addRecreatedUncutCoverage(saved, [], 0);
    const frames = buildKeyframes(saved);
    for (const id of depthBeats) delete frames.find(f => f.id === id)!.beat.cinematic;
    frames.find(f => f.id === "nw_b465")!.beat.cinematic = { depthMap: "/custom-depth.png", depthMotion: "truck" };
    frames.find(f => f.id === "nw_b1316")!.beat.background = "/custom-letter.jpg";
    const upgraded = upgradeSavedRecreatedUncut({ ...project, story: saved, directorsCutId: "uncut", recreatedUncutCoverageVersion: 16 });
    const after = buildKeyframes(upgraded.story);
    expect(after.find(f => f.id === "nw_b465")!.beat.cinematic).toEqual({ depthMap: "/custom-depth.png", depthMotion: "truck" });
    expect(after.find(f => f.id === "nw_b1316")!.picture).toBe("/custom-letter.jpg");
    expect(after.find(f => f.id === "nw_b1316")!.beat.cinematic).toBeUndefined();
    expect(after.find(f => f.id === "nw_b1562")!.beat.cinematic).toMatchObject({ depthMap: "asset:depth-uncut-1562" });
  });
});
