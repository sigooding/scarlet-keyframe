import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import directorExport from "../data/director-export.json";
import festivalData from "../data/festival-cut.json";
import mediaIndex from "../data/media-index.json";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS } from "./directorsCut";
import {
  applyFestivalFinish,
  FESTIVAL_CUTOUT_DEPTH_END,
  FESTIVAL_CUTOUT_DEPTH_START,
  FESTIVAL_DEPTH_END,
  FESTIVAL_DEPTH_START,
  HANDHELD_SCENES,
  MAX_CUTOUTS,
  type FestivalData,
} from "./festivalCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload, type BeatLike, type StoryLike } from "./model";
import { clipFrames } from "./timing";
import { extractKnownMusicDurations } from "./previewAudio";

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const musicMap = extractKnownMusicDurations(bundledEdits);
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const exportCut = buildDirectorsCutById(base, "director-export", voiceMap, musicMap);
const festival = buildDirectorsCutById(base, "festival", voiceMap, musicMap);
const data = festivalData as unknown as FestivalData;
const videoShots = data.videoShots ?? {};
const beats = (s: StoryLike) => s.scenes.flatMap((sc) => sc.dialogueBeats ?? []);
const exportBeats = new Map(beats(exportCut.story).map((b) => [String(b.id), b]));

describe("The Festival Cut", () => {
  it("is first in the cut menu", () => {
    expect(DIRECTORS_CUT_OPTIONS[0].id).toBe("festival");
    expect(festival.directorsCutId).toBe("festival");
  });

  it("keeps the director's edit: same shots, same order, same lengths, same captions, and every voice and music clip", () => {
    expect(buildKeyframes(festival.story).map((f) => f.id)).toEqual(buildKeyframes(exportCut.story).map((f) => f.id));
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id))!;
      expect(b.durationFrames).toBe(was.durationFrames);
      expect(b.captions).toEqual(was.captions);
    }
    const removed = new Set(data.removeClips ?? []);
    const mine = new Map((festival.audioClips ?? []).map((c) => [c.id, c]));
    for (const clip of exportCut.audioClips ?? []) {
      if (removed.has(clip.id)) {
        expect(clip.lane, clip.id).toBe("ambience");
        expect(mine.has(clip.id)).toBe(false);
        continue;
      }
      expect(mine.get(clip.id), clip.id).toEqual({ ...clip, ...(data.clipPatches?.[clip.id] ?? {}) });
    }
    for (const clip of exportCut.audioClips ?? []) if (clip.lane === "voice" || clip.lane === "music") expect(removed.has(clip.id)).toBe(false);
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
      if (videoShots[String(b.id)]) continue;
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
      const cut = Boolean(b.cinematic?.depthCutouts);
      expect(keys[0].value).toBe(cut ? FESTIVAL_CUTOUT_DEPTH_START : FESTIVAL_DEPTH_START);
      expect(keys[keys.length - 1].value).toBe(cut ? FESTIVAL_CUTOUT_DEPTH_END : FESTIVAL_DEPTH_END);
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

  it("shows the repaired stills, and every file the cut uses is real and indexed", () => {
    const index = new Set(mediaIndex as string[]);
    for (const [from, to] of Object.entries(data.pictureReplacements)) {
      expect(beats(festival.story).some((b) => b.background === from)).toBe(false);
      expect(existsSync(`public${to}`), to).toBe(true);
      expect(index.has(to), to).toBe(true);
    }
    const used = [...Object.values(data.depthByPicture), ...Object.values(videoShots)];
    for (const c of Object.values(data.cutoutsByPicture ?? {})) used.push(c.depthMap, c.depthPlate, ...c.depthCutouts.map((x) => x.image));
    for (const s of [...(data.sfx ?? []), ...(data.ambience ?? [])]) for (const part of s.src.split("+")) if (part.includes("/")) used.push(part.replace(/^file:/, ""));
    for (const p of used) {
      expect(existsSync(`public${p}`), p).toBe(true);
      expect(index.has(p), p).toBe(true);
    }
  });

  it("times every added move and depth ramp to the shot's real length (montage shots run on their delay)", () => {
    const short: string[] = [];
    for (const frame of buildKeyframes(festival.story)) {
      const b = frame.beat;
      if (exportBeats.get(String(b.id))?.cinematic?.depthMap || videoShots[String(b.id)]) continue;
      const keys = b.animation?.depthAmount;
      if (!keys) continue;
      if (keys[keys.length - 1].frame < clipFrames(frame) - 2) short.push(String(b.id));
    }
    expect(short).toEqual([]);
  });

  it("plays the people-cut-out close-ups with their plate and layers, at most four", () => {
    const cut = data.cutoutsByPicture ?? {};
    for (const b of beats(festival.story)) {
      const c = cut[String(b.background)];
      if (!c || exportBeats.get(String(b.id))?.cinematic?.depthMap) continue;
      expect(b.cinematic?.depthMap).toBe(c.depthMap);
      expect(b.cinematic?.depthPlate).toBe(c.depthPlate);
      expect((b.cinematic?.depthCutouts as unknown[]).length).toBeLessThanOrEqual(MAX_CUTOUTS);
    }
  });

  it("goes handheld in the raids, the Hive shootout and Vera's run", () => {
    let held = 0;
    for (const scene of festival.story.scenes) {
      if (!HANDHELD_SCENES.test(String(scene.id))) continue;
      for (const b of scene.dialogueBeats ?? []) {
        if (typeof b.background !== "string" || !b.background.startsWith("/film/img/")) continue;
        if (exportBeats.get(String(b.id))?.cinematic?.depthMap || b.cinematic?.mode === "dolly-zoom") continue;
        expect((b.animation?.rotation ?? []).length, String(b.id)).toBeGreaterThan(1);
        held += 1;
      }
    }
    expect(held).toBeGreaterThan(40);
  });

  it("plays its shots as real motion, made from their own pictures", () => {
    const shown = beats(festival.story).filter((b) => String(b.background).startsWith("video:/film/video/festival/"));
    expect(shown.map((b) => String(b.id)).sort()).toEqual(Object.keys(videoShots).sort());
    for (const b of shown) expect(b.cinematic?.depthMap).toBeUndefined();
  });

  it("lights the practicals: a soft glow that breathes, never on a shot that already has its own lights", () => {
    let lit = 0;
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id));
      if (was?.cinematic?.lights) {
        expect(b.cinematic?.lights).toEqual(was.cinematic.lights);
        continue;
      }
      for (const l of (b.cinematic?.lights as { intensity: number; size: number }[] | undefined) ?? []) {
        expect(l.intensity).toBeLessThanOrEqual(0.4);
        expect(l.size).toBeLessThanOrEqual(20);
        lit += 1;
      }
    }
    expect(lit).toBeGreaterThan(200);
  });

  it("hangs every new sound on a real shot, and keeps the rain outside at Mara's service", () => {
    const ids = new Set(beats(festival.story).map((b) => String(b.id)));
    const added = (festival.audioClips ?? []).filter((c) => c.id.startsWith("fc_"));
    expect(added.length).toBe((data.sfx ?? []).length + (data.ambience ?? []).length);
    for (const c of added) {
      expect(ids.has(c.anchorId), c.anchorId).toBe(true);
      expect(c.durationMs).toBeGreaterThan(0);
    }
    // Kurose's sedan has its windows; the shootout has its volley
    expect(added.some((c) => c.src.endsWith("kurose-window-down.mp3") && c.anchorId === "nw_b1294")).toBe(true);
    expect(added.some((c) => c.src.endsWith("hive-volley.mp3") && c.anchorId === "nw_b1141")).toBe(true);
    // indoors at the service (scenes 05-28) no ambience clip plays: the song has the room
    const order = buildKeyframes(festival.story);
    const startMs = new Map<string, number>();
    let t = 0;
    for (const f of order) {
      startMs.set(String(f.beat.id), t);
      t += (clipFrames(f) / 24) * 1000;
    }
    const indoor = order.filter((f) => /^nw_song_service_(0[5-9]|1\d|2[0-8])$/.test(String(f.scene.id))).map((f) => startMs.get(String(f.beat.id))!);
    const [from, to] = [Math.min(...indoor), Math.max(...indoor)];
    for (const c of festival.audioClips ?? []) {
      if (c.lane !== "ambience") continue;
      const s = (startMs.get(c.anchorId) ?? -1e9) + c.offsetMs;
      const e = s + c.durationMs;
      expect(e <= from + 500 || s >= to, c.id).toBe(true);
    }
  });

  it("never flickers: no film-grade overlay it did not already have, and no light pulsing faster than every 2 seconds", () => {
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id));
      expect(Boolean(b.cinematic?.filmGrade), String(b.id)).toBe(Boolean(was?.cinematic?.filmGrade));
      if (was?.cinematic?.lights) continue;
      for (const l of (b.cinematic?.lights as { pulseSeconds: number }[] | undefined) ?? []) expect(l.pulseSeconds).toBeGreaterThanOrEqual(2);
    }
  });

  it("never changes the Director's Export itself", () => {
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    const again = applyFestivalFinish(exportCut);
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    expect(again.report.depthKept).toBeGreaterThan(150);
  });
});
