import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import directorExport from "../data/director-export.json";
import festivalData from "../data/festival-cut.json";
import mediaIndex from "../data/media-index.json";
import { buildDirectorsCutById, DIRECTORS_CUT_OPTIONS, refreshStaleBuiltInCuts, switchDirectorsCutWithState } from "./directorsCut";
import {
  applyFestivalFinish,
  cutawayPieceId,
  depthShare,
  FESTIVAL_CUTOUT_DEPTH_END,
  FESTIVAL_CUTOUT_DEPTH_START,
  FESTIVAL_DEPTH_END,
  FESTIVAL_DEPTH_START,
  HANDHELD_SCENES,
  MAX_CUTOUTS,
  MAX_PARALLAX,
  parallaxOf,
  scaledDepth,
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
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const beats = (s: StoryLike) => s.scenes.flatMap((sc) => sc.dialogueBeats ?? []);
const exportBeats = new Map(beats(exportCut.story).map((b) => [String(b.id), b]));

describe("The Festival Cut", () => {
  it("is first in the cut menu", () => {
    expect(DIRECTORS_CUT_OPTIONS[0].id).toBe("festival");
    expect(festival.directorsCutId).toBe("festival");
  });

  it("keeps the director's edit: same shots, same order, same lengths, same captions, and every voice and music clip", () => {
    // a shot broken up by cutaways becomes pieces right after it; together they run exactly as long as it did and
    // carry exactly its captions
    const inserts = new Map((data.inserts ?? []).map((i) => [i.beatId, i.cuts.length]));
    const byId = new Map(beats(festival.story).map((b) => [String(b.id), b]));
    const dropped = new Set(data.dropScenes ?? []);
    const expected: string[] = [];
    for (const f of buildKeyframes(exportCut.story)) {
      if (dropped.has(f.sceneId)) continue;
      const id = String(f.beat.id);
      expected.push(id);
      for (let n = 1; byId.has(cutawayPieceId(id, n)); n += 1) expected.push(cutawayPieceId(id, n));
    }
    expect(buildKeyframes(festival.story).map((f) => f.id)).toEqual(expected);
    const droppedBeats = new Set(exportCut.story.scenes.filter((sc) => dropped.has(String(sc.id))).flatMap((sc) => (sc.dialogueBeats ?? []).map((b) => String(b.id))));
    for (const [id, was] of exportBeats) {
      if (droppedBeats.has(id)) {
        expect(byId.has(id), id).toBe(false);
        continue;
      }
      const pieces = [byId.get(id)!];
      for (let n = 1; byId.has(cutawayPieceId(id, n)); n += 1) pieces.push(byId.get(cutawayPieceId(id, n))!);
      expect(pieces.length > 1, id).toBe(inserts.has(id));
      if (pieces.length === 1) {
        expect(pieces[0].durationFrames, id).toBe(was.durationFrames);
        expect(pieces[0].captions, id).toEqual(was.captions);
        continue;
      }
      expect(pieces.reduce((t, p) => t + Number(p.durationFrames), 0), id).toBe(was.durationFrames);
      // put the pieces' captions back on the shot's own clock and re-join any caption a cut split in two
      const rebuilt: { text: string; inFrame: number; outFrame: number }[] = [];
      let offset = 0;
      for (const piece of pieces) {
        for (const c of piece.captions ?? []) {
          const at = { text: c.text, inFrame: c.inFrame + offset, outFrame: c.outFrame + offset };
          const last = rebuilt[rebuilt.length - 1];
          if (last && last.text === at.text && last.outFrame === at.inFrame) last.outFrame = at.outFrame;
          else rebuilt.push(at);
        }
        offset += Number(piece.durationFrames);
      }
      expect(rebuilt, id).toEqual((was.captions ?? []).map((c) => ({ text: c.text, inFrame: c.inFrame, outFrame: c.outFrame })));
    }
    const removed = new Set(data.removeClips ?? []);
    const mine = new Map((festival.audioClips ?? []).map((c) => [c.id, c]));
    for (const clip of exportCut.audioClips ?? []) {
      if (removed.has(clip.id)) {
        expect(clip.lane, clip.id).toBe("ambience");
        expect(mine.has(clip.id)).toBe(false);
        continue;
      }
      const db = clip.lane === "voice" ? data.voiceGainDb?.[clip.src] : undefined;
      const want = { ...clip, ...(data.clipPatches?.[clip.id] ?? {}) };
      if (db) want.gain = Math.round(want.gain * 10 ** (db / 20) * 1000) / 1000;
      if ((data.musicHandoffs ?? []).some((h) => h.clipId === clip.id)) {
        // a song that comes up for the credits: the same clip, playing on only to the hand-over
        const got = mine.get(clip.id)!;
        expect({ ...got, durationMs: want.durationMs, fadeOutMs: want.fadeOutMs }, clip.id).toEqual(want);
        expect(got.durationMs).toBeLessThan(want.durationMs);
        continue;
      }
      expect(mine.get(clip.id), clip.id).toEqual(want);
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

  it("breathes the new depth from 0.14 to 0.24 within the parallax limit, and leaves the director's rigs as they were but for that limit", () => {
    const framesOf = new Map(buildKeyframes(festival.story).map((f) => [String(f.beat.id), clipFrames(f)]));
    let added = 0;
    let limited = 0;
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id));
      if (!was || videoShots[String(b.id)]) continue;
      const frames = framesOf.get(String(b.id)) ?? 1;
      if (was.cinematic?.depthMap && data.pictureReplacements[String(was.background)]) {
        // a rig made for a faulty picture moves to the repaired picture's map; its old plate and cut-outs go
        expect(b.cinematic?.depthMap).toBe(data.depthByPicture[data.pictureReplacements[String(was.background)]]);
        expect(b.cinematic?.depthPlate).toBeUndefined();
        expect(b.cinematic?.depthCutouts).toBeUndefined();
        continue;
      }
      if (was.cinematic?.depthMap) {
        // the camera and the authored amount stay; only the depth on the frames comes down, and only past the limit
        expect(b.cinematic?.depthMap).toBe(was.cinematic.depthMap);
        expect(b.cinematic?.depthAmount).toBe(was.cinematic.depthAmount);
        const share = depthShare(parallaxOf(was.animation, was.cinematic.depthAmount, frames));
        if (share >= 1) {
          expect(b.animation).toEqual(was.animation);
          continue;
        }
        limited += 1;
        const { depthAmount: _got, values: _gv, ...rest } = b.animation ?? {};
        const { depthAmount: _was, values: _wv, ...wasRest } = was.animation ?? {};
        expect(rest).toEqual(wasRest);
        continue;
      }
      if (!b.cinematic?.depthMap) continue;
      added += 1;
      const keys = b.animation?.depthAmount ?? [];
      const cut = Boolean(b.cinematic?.depthCutouts);
      const [from, to] = cut ? [FESTIVAL_CUTOUT_DEPTH_START, FESTIVAL_CUTOUT_DEPTH_END] : [FESTIVAL_DEPTH_START, FESTIVAL_DEPTH_END];
      expect(b.cinematic?.depthAmount).toBe(to);
      const share = depthShare(parallaxOf({ ...b.animation, depthAmount: [{ frame: 0, value: from, easing: "ease-in-out" }, { frame: Math.max(1, frames - 1), value: to, easing: "linear" }] }, to, frames));
      expect(keys[0].value).toBe(scaledDepth(from, share));
      expect(keys[keys.length - 1].value).toBe(scaledDepth(to, share));
      if (share < 1) limited += 1;
    }
    expect(added).toBeGreaterThan(400);
    expect(limited).toBeGreaterThan(50);
  });

  it("never lets a depth shot's near layers move more than the limit against the background", () => {
    const over: string[] = [];
    let service = 0;
    for (const f of buildKeyframes(festival.story)) {
      const b = f.beat;
      if (!b.cinematic?.depthMap) continue;
      const p = parallaxOf(b.animation, b.cinematic.depthAmount, clipFrames(f));
      if (p > MAX_PARALLAX + 1e-6) over.push(`${b.id} ${p.toFixed(3)}`);
      if (String(f.sceneId).startsWith("nw_song_service_")) service += 1;
    }
    expect(over).toEqual([]);
    expect(service).toBeGreaterThan(10);
    // the service's slow push-ins were what bent it: at full depth they move the near layers far past the limit
    const shoes = beats(exportCut.story).find((b) => String(b.id) === "nw_song_service_06:nw_song_b6");
    expect(parallaxOf(shoes?.animation, 0.24, 113)).toBeGreaterThanOrEqual(0);
  });

  it("keeps the rain outdoors: an indoor shot is dry, the street keeps its rain", () => {
    const dry = new Set(data.dry ?? []);
    expect(dry.size).toBeGreaterThan(40);
    let checked = 0;
    for (const scene of festival.story.scenes) {
      for (const b of scene.dialogueBeats ?? []) {
        if (!dry.has(String(b.id).replace(/~fc\d+$/, ""))) continue;
        expect(b.particles, String(b.id)).toBe("none");
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(dry.size);
    // the lane outside the service still rains
    const lane = festival.story.scenes.find((sc) => sc.id === "nw_song_service_30")!;
    expect(lane.dialogueBeats?.[0].particles ?? lane.particles).toBe("drizzle");
  });

  it("credits the cast to ElevenLabs and ends on the credits, without the tagline", () => {
    const order = buildKeyframes(festival.story);
    const last = order[order.length - 1];
    expect(last.sceneId).toBe("nw_credits");
    expect(festival.story.scenes.some((sc) => sc.id === "nw_end")).toBe(false);
    const cards = festival.story.scenes.find((sc) => sc.id === "nw_credits")!.dialogueBeats!.map((b) => (b as { titleCard?: { kicker?: string; title: string; subtitle?: string } }).titleCard);
    expect(cards.some((c) => c?.kicker === "CAST CREATED BY" && c.title === "ElevenLabs")).toBe(true);
    expect(JSON.stringify(cards)).not.toContain("Tokyo as a memory");
    expect(cards.filter((c) => c?.kicker === "CAST").length).toBe(2);
  });

  it("brings the closing song up to full for the credits, in step, and fades it out on the last frame", () => {
    const handoff = (data.musicHandoffs ?? [])[0];
    expect(handoff).toBeDefined();
    const clips = festival.audioClips ?? [];
    const low = clips.find((c) => c.id === handoff.clipId)!;
    const up = clips.find((c) => c.id === `${handoff.clipId}~up`)!;
    expect(up.src).toBe(low.src);
    expect(up.gain).toBe(1);
    expect(up.anchorId).toBe(handoff.atAnchorId);
    // the low clip plays exactly to the end of the crossfade, and the loud one picks the song up where it is
    const frames = buildKeyframes(festival.story);
    let ms = 0;
    let lowStart = -1;
    let upStart = -1;
    for (const f of frames) {
      if (String(f.beat.id) === low.anchorId) lowStart = ms;
      if (String(f.beat.id) === up.anchorId) upStart = ms;
      ms += (clipFrames(f) / 24) * 1000;
    }
    expect(Math.abs(up.inMs - (upStart - lowStart - low.offsetMs))).toBeLessThan(2);
    expect(Math.abs(low.durationMs - (upStart - lowStart + handoff.fadeMs))).toBeLessThan(2);
    // it runs to the last frame and fades out with it
    expect(Math.abs(upStart + up.durationMs - ms)).toBeLessThan(2);
    expect(up.fadeOutMs).toBe(handoff.fadeOutMs);
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
    for (const insert of data.inserts ?? []) for (const cut of insert.cuts) used.push(cut.picture.replace(/^video:/, ""));
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
    // real-motion shots, plus any lip-sync piece a cutaway put in
    const lipSync = (data.inserts ?? []).flatMap((i) => i.cuts.filter((c) => c.picture.startsWith("video:")).map((c) => c.picture));
    const shown = beats(festival.story).filter((b) => String(b.background).startsWith("video:/film/video/festival/") && !lipSync.includes(String(b.background)));
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

  it("levels the dialogue: no line corrected by more than 6 dB, and lines already at level left alone", () => {
    const g = Object.values(data.voiceGainDb ?? {});
    expect(g.length).toBeGreaterThan(0);
    for (const db of g) expect(Math.abs(db)).toBeLessThanOrEqual(6);
    const voices = (exportCut.audioClips ?? []).filter((c) => c.lane === "voice").length;
    expect(g.length).toBeLessThan(voices);
  });

  it("never flickers: no film-grade overlay it did not already have, and no light pulsing faster than every 2 seconds", () => {
    for (const b of beats(festival.story)) {
      const was = exportBeats.get(String(b.id));
      expect(Boolean(b.cinematic?.filmGrade), String(b.id)).toBe(Boolean(was?.cinematic?.filmGrade));
      if (was?.cinematic?.lights) continue;
      for (const l of (b.cinematic?.lights as { pulseSeconds: number }[] | undefined) ?? []) expect(l.pulseSeconds).toBeGreaterThanOrEqual(2);
    }
  });

  it("a Festival Cut saved before an update is rebuilt, not restored (switching to it, or reopening the app)", () => {
    // what a browser had saved before the pull: the old cut, with no video shots, and no version stamp
    const old = clone(festival);
    delete old.builtInCutVersions;
    for (const b of beats(old.story)) if (String(b.background).startsWith("video:")) b.background = "/film/img/old.jpg";
    const hasVideo = (p: typeof festival) => beats(p.story).some((b) => String(b.background).startsWith("video:"));
    expect(hasVideo(old)).toBe(false);

    // switching: on the Director's Export with the stale Festival Cut stashed
    const onExport = { ...clone(exportCut), builtInCutVersions: { "director-export": exportCut.builtInCutVersions!["director-export"] }, savedCutStates: { festival: { story: old.story, audioClips: old.audioClips, updatedAt: 1 } } };
    const switched = switchDirectorsCutWithState(onExport, "festival", voiceMap, musicMap);
    expect(hasVideo(switched)).toBe(true);

    // reopening: the saved project is on the stale Festival Cut
    const reopened = refreshStaleBuiltInCuts(old, voiceMap, musicMap);
    expect(hasVideo(reopened)).toBe(true);
    expect(reopened.snapshots?.some((s) => s.id === "snapshot-before-festival-update")).toBe(true);
    // and a current one is left exactly as it is (the user's own edits survive)
    expect(refreshStaleBuiltInCuts(reopened, voiceMap, musicMap)).toBe(reopened);
    const edited = clone(switched);
    edited.savedCutStates = { ...(edited.savedCutStates ?? {}) };
    const back = switchDirectorsCutWithState(switchDirectorsCutWithState(edited, "director-export", voiceMap, musicMap), "festival", voiceMap, musicMap);
    expect(back.story).toEqual(edited.story);
  });

  it("breaks up the longest holds: no picture held more than 13 seconds where a cutaway went in", () => {
    const byId = new Map(beats(festival.story).map((b) => [String(b.id), b]));
    for (const insert of data.inserts ?? []) {
      for (let n = 0; byId.has(cutawayPieceId(insert.beatId, n)); n += 1) {
        const piece = byId.get(cutawayPieceId(insert.beatId, n))!;
        expect(Number(piece.durationFrames) / 24, piece.id as string).toBeLessThanOrEqual(13.5);
        expect(piece.background, piece.id as string).toBeTruthy();
      }
    }
  });

  it("never changes the Director's Export itself", () => {
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    const again = applyFestivalFinish(exportCut);
    expect(exportCut.story).toEqual((directorExport as unknown as { story: StoryLike }).story);
    // the director's depth rigs are kept, except where a real-motion clip has taken the shot over
    expect(again.report.depthKept + again.report.videoShots).toBeGreaterThan(150);
  });
});
