import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import directorExport from "../data/director-export.json";
import festivalData from "../data/festival-cut.json";
import mediaIndex from "../data/media-index.json";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS } from "./directorsCut";
import { applyFestivalFinish, FESTIVAL_DEPTH_END, FESTIVAL_DEPTH_START } from "./festivalCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload, type BeatLike, type StoryLike } from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const musicMap = extractKnownMusicDurations(bundledEdits);
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const exportCut = buildDirectorsCutById(base, "director-export", voiceMap, musicMap);
const festival = buildDirectorsCutById(base, "festival", voiceMap, musicMap);
const data = festivalData as unknown as { depthByPicture: Record<string, string>; pictureReplacements: Record<string, string> };
const beats = (s: StoryLike) => s.scenes.flatMap((sc) => sc.dialogueBeats ?? []);
const exportBeats = new Map(beats(exportCut.story).map((b) => [String(b.id), b]));

describe("The Festival Cut", () => {
  it("is first in the cut menu", () => {
    expect(DIRECTORS_CUT_OPTIONS[0].id).toBe("festival");
    expect(festival.directorsCutId).toBe("festival");
  });

  it("keeps the director's edit: same shots, same order, same lengths, same captions and the same sound clips", () => {
    expect(buildKeyframes(festival.story).map((f) => f.id)).toEqual(buildKeyframes(exportCut.story).map((f) => f.id));
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id))!;
      expect(b.durationFrames).toBe(was.durationFrames);
      expect(b.captions).toEqual(was.captions);
    }
    expect(festival.audioClips).toEqual(exportCut.audioClips);
    expect(festival.originalStory).toEqual(base.originalStory);
  });

  it("plays every shot that has a depth map in 2.5D, with the depth camera free to move", () => {
    let withPicture = 0;
    let withDepth = 0;
    for (const b of beats(festival.story)) {
      if (typeof b.background !== "string" || !b.background.startsWith("/film/img/")) continue;
      withPicture += 1;
      const c = b.cinematic ?? {};
      if (!c.depthMap) continue;
      withDepth += 1;
      // the dolly preset switches the depth camera off; the director's own rigs keep whatever they chose
      if (!exportBeats.get(String(b.id))?.cinematic?.depthMap) expect(c.mode).not.toBe("dolly");
    }
    expect(withDepth / withPicture).toBeGreaterThan(0.85);
  });

  it("breathes the new depth from 0.14 to 0.24 and leaves the director's own rigs exactly as they were", () => {
    let added = 0;
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id))!;
      if (was.cinematic?.depthMap && data.pictureReplacements[String(was.background)]) {
        // a rig made for a faulty picture moves to the repaired picture's map; its old plate and cut-outs go
        expect(b.cinematic?.depthMap).toBe(data.depthByPicture[data.pictureReplacements[String(was.background)]]);
        expect(b.cinematic?.depthPlate).toBeUndefined();
        expect(b.cinematic?.depthCutouts).toBeUndefined();
        continue;
      }
      if (was.cinematic?.depthMap) {
        expect(b.cinematic?.depthMap).toBe(was.cinematic.depthMap);
        expect(b.cinematic?.depthAmount).toBe(was.cinematic.depthAmount);
        expect(b.animation).toEqual(was.animation);
        continue;
      }
      if (!b.cinematic?.depthMap) continue;
      added += 1;
      const keys = b.animation?.depthAmount ?? [];
      expect(keys[0].value).toBe(FESTIVAL_DEPTH_START);
      expect(keys[keys.length - 1].value).toBe(FESTIVAL_DEPTH_END);
    }
    expect(added).toBeGreaterThan(400);
  });

  it("leaves no shot without a move (the Vertigo dolly-zooms and the director's own rigs keep their own)", () => {
    const still = beats(festival.story).filter((b: BeatLike) => {
      if (typeof b.background !== "string" || !b.background.startsWith("/film/img/") || b.cinematic?.mode === "dolly-zoom") return false;
      if (exportBeats.get(String(b.id))?.cinematic?.depthMap) return false;
      const a = b.animation ?? {};
      return !(["zoom", "x", "y"] as const).some((ch) => (a[ch] ?? []).some((k, _i, all) => k.value !== all[0].value));
    });
    expect(still.map((b) => b.id)).toEqual([]);
  });

  it("shows the repaired stills, and every depth map and repaired picture is a real, indexed file", () => {
    const index = new Set(mediaIndex as string[]);
    for (const [from, to] of Object.entries(data.pictureReplacements)) {
      expect(beats(festival.story).some((b) => b.background === from)).toBe(false);
      expect(existsSync(`public${to}`), to).toBe(true);
      expect(index.has(to), to).toBe(true);
    }
    for (const p of Object.values(data.depthByPicture)) {
      expect(existsSync(`public${p}`), p).toBe(true);
      expect(index.has(p), p).toBe(true);
    }
  });

  it("never changes the Director's Export itself", () => {
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    const again = applyFestivalFinish(exportCut);
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    expect(again.report.depthKept).toBeGreaterThan(150);
  });
});
