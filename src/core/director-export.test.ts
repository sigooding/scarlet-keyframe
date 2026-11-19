import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import directorExport from "../data/director-export.json";
import mediaIndex from "../data/media-index.json";
import { buildTimelineClips } from "../sequence/animate";
import { evaluateClipGainAtElapsedMs, frameToMs, resolveAudioClips } from "./audioClips";
import { restoreJackWalk } from "./jackWalk";
import { cutMaraCall } from "./maraCall";
import { resolveTimelineCaptions } from "./captions";
import type { PortableStoryBundle } from "./exportBundle";
import {
  applyCutOptionsToProject,
  buildDirectorsCutById,
  DIRECTORS_CUT_OPTIONS,
  isCutStory,
  openImportedFilmCut,
  repairImportedCutSource,
  switchDirectorsCutWithState,
} from "./directorsCut";
import {
  applyStudioMusicSync,
  buildKeyframes,
  collectMediaReferences,
  createProjectState,
  parseImportPayload,
  type ProjectState,
  type StoryLike,
} from "./model";
import { extractKnownMusicDurations } from "./previewAudio";

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const musicMap = extractKnownMusicDurations(bundledEdits);
const sourceStory = (): StoryLike =>
  applyStudioMusicSync(
    parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap }).story,
    bundledEdits,
  );
const baseProject = createProjectState(
  { ...parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap }), story: sourceStory() },
  [],
  bundledEdits,
);
const data = directorExport as unknown as { source: string; story: StoryLike; audioClips: unknown[] };
const exportCut = buildDirectorsCutById(baseProject, "director-export", voiceMap, musicMap);

function counts(p: ProjectState) {
  const frames = buildKeyframes(p.story);
  const { clips } = buildTimelineClips(frames, voiceMap);
  const voices = resolveAudioClips(p.audioClips ?? [], clips).filter((c) => c.lane === "voice");
  return {
    beats: frames.length,
    captions: frames.reduce((n, f) => n + (f.beat.captions?.length ?? 0), 0),
    voices: voices.length,
    newVoices: voices.filter((v) => /\/s(68|76|77a)\/(nw_b|s77a-)|^asset:nw_b\d+-machine-/.test(v.src)).length,
  };
}

const exportCounts = { beats: 769, captions: 693, voices: 585, newVoices: 25 };

/** What the editor's Import did with exports/nobodys-witness.reel.json before this change. */
function oldImport(): ProjectState {
  const raw = readFileSync("exports/nobodys-witness.reel.json", "utf8");
  const imported = parseImportPayload(raw, "nobodys-witness.reel.json", { voiceDurations: voiceMap });
  return createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
}

describe("Director's Export cut", () => {
  it("is the first cut in the menu", () => {
    expect(DIRECTORS_CUT_OPTIONS[0].id).toBe("director-export");
    expect(exportCut.directorsCutId).toBe("director-export");
    expect(data.source).toBe("nobodys-witness.reel.json");
  });

  it("plays the stored edit exactly, including the retained scene 68/76/77A lines", () => {
    expect(exportCut.story).toEqual(data.story);
    expect(exportCut.audioClips).toEqual(data.audioClips);
    expect(counts(exportCut)).toEqual(exportCounts);
  });

  it("plays Jack’s six original stills between the call and Past midnight, on the same uninterrupted take", () => {
    const { clips } = buildTimelineClips(buildKeyframes(exportCut.story), voiceMap);
    const start = clips.findIndex((c) => c.keyframe.sceneId === "nw_m18");
    const walk = clips.slice(start, start + 6);
    expect(clips[start - 1].keyframe.sceneId).toBe("nw_s18");
    expect(clips[start + 6].keyframe.sceneId).toBe("nw_s19");
    expect(walk.map((c) => c.keyframe.picture)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `/film/img/montage18/0${n}.jpg`));
    for (const c of walk) {
      expect(c.durationFrames).toBe(120);
      expect(c.keyframe.beat).toMatchObject({ silent: true, captions: [], backgroundTransition: "dissolve" });
    }
    const headMs = frameToMs(walk[0].startFrame);
    const tailMs = frameToMs(walk[5].endFrame);
    const music = resolveAudioClips(exportCut.audioClips, clips).filter((c) =>
      c.lane === "music" && c.startMs < tailMs && c.endMs > headMs);
    expect(music).toHaveLength(1);
    expect(music[0]).toMatchObject({ src: "/film/audio/dark-hills-blues.mp3", anchorId: "nw_b479", endMs: tailMs });
    const elapsed = headMs - music[0].startMs;
    expect(elapsed).toBe(25125);
    expect(evaluateClipGainAtElapsedMs(music[0], elapsed)).toBeCloseTo(0.18);
    expect(evaluateClipGainAtElapsedMs(music[0], elapsed + 10000)).toBeCloseTo(0.63);
    expect(clips.some((c) => c.keyframe.sceneId === "nw_m53")).toBe(false);
  });

  it("keeps the film as the source, so every other cut is still built from the film", () => {
    expect(exportCut.originalStory).toEqual(baseProject.originalStory);
    expect(isCutStory(exportCut.originalStory)).toBe(false);
    const fromExport = buildDirectorsCutById(exportCut, "witness", voiceMap, musicMap);
    const fromFilm = buildDirectorsCutById(baseProject, "witness", voiceMap, musicMap);
    expect(buildKeyframes(fromExport.story).map((f) => f.id)).toEqual(buildKeyframes(fromFilm.story).map((f) => f.id));
  });

  it("resolves every picture and sound: bundled plates by asset id, everything else in public/", () => {
    const assetIds = new Set(exportCut.assets.map((a) => a.id));
    const paths = new Set(mediaIndex as string[]);
    for (const ref of collectMediaReferences(exportCut.story, exportCut.audioClips)) {
      const asset = /(?:^|:)asset:([^/?#]+)/.exec(ref)?.[1];
      if (asset) expect(assetIds.has(asset), ref).toBe(true);
      else if (ref.startsWith("/")) {
        expect(paths.has(ref) || paths.has(decodeURI(ref)), ref).toBe(true);
        expect(existsSync(`public${decodeURI(ref)}`), ref).toBe(true);
      }
    }
  });

  it("is never rewritten by the screening options", () => {
    const optioned = applyCutOptionsToProject(exportCut, { aspectFraming: "1.37:1", classic1950sLeader: true, newPlateDepthMaps: true });
    expect(optioned.story).toEqual(data.story);
  });

  it("survives a round trip through another cut, and Reset to factory brings back the built-in edit", () => {
    const edited: ProjectState = { ...exportCut, story: { ...exportCut.story, title: "edited" } };
    const away = switchDirectorsCutWithState(edited, "neo-noir", voiceMap, musicMap);
    expect(away.directorsCutId).toBe("neo-noir");
    const back = switchDirectorsCutWithState(away, "director-export", voiceMap, musicMap);
    expect(back.story.title).toBe("edited");
    expect(back.audioClips).toEqual(data.audioClips);
    const reset = switchDirectorsCutWithState(back, "director-export", voiceMap, musicMap, { forceRebuild: true });
    expect(reset.story).toEqual(data.story);
  });
});

describe("Importing a Nobody's Witness bundle", () => {
  it("used to lose captions and voices on the next load (the bug)", () => {
    const old = oldImport();
    expect(counts(old)).toEqual(exportCounts);
    const reloaded = buildDirectorsCutById(old, old.directorsCutId ?? "neo-noir", voiceMap, musicMap);
    const after = counts(reloaded);
    expect(after.captions).toBeLessThan(200);
    expect(after.voices).toBeLessThan(200);
  });

  it("now opens as the Director's Export, with the film as its source, and is not rebuilt on the next load", () => {
    const opened = openImportedFilmCut(oldImport(), sourceStory);
    expect(opened.directorsCutId).toBe("director-export");
    expect(opened.directorsCutVersion).toBeGreaterThanOrEqual(5);
    expect(isCutStory(opened.originalStory)).toBe(false);
    expect(counts(opened)).toEqual(exportCounts);
    // The portable file itself carries the restoration; import doesn't need a runtime fixup.
    const walk = (story: StoryLike) => story.scenes.find((s) => s.id === "nw_m18")?.dialogueBeats;
    expect(walk(opened.story)).toEqual(walk(exportCut.story));
    expect(opened.audioClips?.find((c) => c.id === "ac_mus_764")).toEqual(exportCut.audioClips?.find((c) => c.id === "ac_mus_764"));
    // another cut is built from the film, exactly as from a fresh project
    const uncut = switchDirectorsCutWithState(opened, "uncut", voiceMap, musicMap);
    expect(counts(uncut)).toEqual(counts(buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap)));
    // and coming back restores the imported edit with its sound
    const back = switchDirectorsCutWithState(uncut, "director-export", voiceMap, musicMap);
    expect(counts(back)).toEqual(exportCounts);
  });

  it("leaves an import of the film's own source alone", () => {
    const raw = createProjectState(parseImportPayload(bundledFilm, "nobodys-witness-film.json"), [], bundledEdits);
    expect(openImportedFilmCut(raw, sourceStory)).toBe(raw);
  });

  it("repairs a project the old import already damaged, and keeps the damaged edit as a snapshot", () => {
    const old = oldImport();
    const damaged = buildDirectorsCutById(old, "neo-noir", voiceMap, musicMap);
    expect(isCutStory(damaged.originalStory)).toBe(true);
    const repaired = repairImportedCutSource(damaged, sourceStory);
    expect(repaired.directorsCutId).toBe("director-export");
    expect(isCutStory(repaired.originalStory)).toBe(false);
    expect(repaired.savedCutStates).toEqual({});
    expect(repaired.snapshots[0].id).toBe("snapshot-before-import-repair");
    expect(counts(repaired)).toEqual(exportCounts);
    expect(repairImportedCutSource(exportCut, sourceStory)).toBe(exportCut);
  });
});

// The old Director's Export had the montage's pictures and route, but an empty dialogueBeats array.
// Exercise the opt-in repair on a working copy with a different timeline, marker and mix.
describe("restoring Jack’s walk in a saved Director’s Export", () => {
  const old: ProjectState = {
    ...exportCut,
    story: {
      ...exportCut.story,
      scenes: exportCut.story.scenes.map((s) => {
        if (s.id === "nw_m18") return { ...s, dialogueBeats: [] };
        if (s.id === "nw_intro") return { ...s, dialogueBeats: [{ ...s.dialogueBeats![0], durationFrames: 240 }] };
        return s;
      }),
      markers: [{ id: "before", name: "Opening", frame: 0 }, { id: "after", name: "My note", frame: 33000 }],
    },
    audioClips: exportCut.audioClips!.map((c) => c.id === "ac_mus_764"
      ? { ...c, durationMs: 25125, gain: 0.3, volumeKeys: [{ atMs: 80, gain: 0.8 }] } : c),
  };
  const timeline = (p: ProjectState) => buildTimelineClips(buildKeyframes(p.story), voiceMap);
  const before = timeline(old);
  it("adds 720 frames without resetting any other shot, note, sound clip, or custom mix", () => {
    const fix = restoreJackWalk(old, before.clips)!;
    expect(fix.startFrame).toBe(before.clips.find((c) => c.keyframe.sceneId === "nw_s19")!.startFrame);
    const after = timeline(fix.project);
    expect(after.totalFrames).toBe(before.totalFrames + 720);
    expect(fix.project.story.scenes.find((s) => s.id === "nw_m18")?.dialogueBeats).toEqual(
      exportCut.story.scenes.find((s) => s.id === "nw_m18")?.dialogueBeats);
    expect(after.clips.filter((c) => c.keyframe.sceneId !== "nw_m18").map((c) => [c.keyframe.id, c.startFrame])).toEqual(
      before.clips.map((c) => [c.keyframe.id, c.startFrame + (c.startFrame >= fix.startFrame ? 720 : 0)]));
    expect(fix.project.story.markers?.map((m) => m.frame)).toEqual([0, 33720]);
    expect(fix.project.audioClips).toEqual(old.audioClips!.map((c) =>
      c.id === "ac_mus_764" ? { ...c, durationMs: 55125 } : c));
    expect(old.story.scenes.find((s) => s.id === "nw_m18")?.dialogueBeats).toEqual([]);
    expect(restoreJackWalk(fix.project, after.clips)).toBeUndefined();
  });

  it("doesn't change a different cut, a populated montage, or an edit without the incoming theme", () => {
    expect(restoreJackWalk({ ...old, directorsCutId: "witness" }, before.clips)).toBeUndefined();
    expect(restoreJackWalk(exportCut, timeline(exportCut).clips)).toBeUndefined();
    expect(restoreJackWalk({ ...old, audioClips: old.audioClips!.filter((c) => c.id !== "ac_mus_764") }, before.clips)).toBeUndefined();
  });
});

describe("Mara’s message is heard only on Vera’s machine", () => {
  const timeline = (p: ProjectState) => buildTimelineClips(buildKeyframes(p.story), voiceMap);
  const { clips } = timeline(exportCut);
  const audio = resolveAudioClips(exportCut.audioClips, clips);
  const phone = clips.find((c) => c.keyframe.id === "nw_b1688")!;
  const hall = clips[phone.index + 1];
  const play = clips.filter((c) => c.keyframe.sceneId === "nw_s76_maras_message");
  const machine = audio.filter((c) => c.lane === "voice" && play.some((p) => p.keyframe.id === c.anchorId));

  it("cuts from the record tone to Jack in the corridor, with no earlier words or subtitles", () => {
    expect(phone.durationFrames).toBe(43);
    expect(hall.keyframe.id).toBe("nw_b1109");
    expect(audio.filter((c) => c.lane === "voice" && c.startMs < frameToMs(hall.startFrame) && c.endMs > frameToMs(phone.startFrame))).toEqual([]);
    expect(audio.filter((c) => /\/s68\/nw_b169[0235]-|\/s68\/nw_b1689-/.test(c.src))).toEqual([]);
    const captions = resolveTimelineCaptions(clips);
    expect(captions.filter((c) => c.frameId === phone.keyframe.id)).toEqual([]);
    const exit = audio.find((c) => c.src.endsWith("/237-jack-it-s-time.mp3"))!;
    expect(exit.anchorId).toBe(hall.keyframe.id);
    expect(frameToMs(captions.find((c) => c.frameId === exit.anchorId && c.text === "It's time.")!.globalInFrame)).toBeCloseTo(exit.startMs, 4);
    expect(audio.find((c) => c.id === "ac_sfx_mara_record")?.endMs).toBeCloseTo(frameToMs(hall.startFrame), 4);
  });

  it("plays all five original filtered performances after PLAY, under a local score dip, then the stop tone", () => {
    expect(play[0].keyframe.id).toBe("nw_b1697");
    expect(machine.map((c) => c.src.match(/\/s76\/nw_b(\d+)-machine-.+-print\.wav$/)?.[1])).toEqual(["1698", "1699", "1701", "1702", "1704"]);
    expect(machine[0].startMs).toBeGreaterThanOrEqual(frameToMs(play[0].endFrame));
    const caps = resolveTimelineCaptions(play);
    expect(caps).toHaveLength(8);
    expect(caps[0].text).toMatch(/^Vera\? It’s me\./);
    expect(caps.at(-1)?.text).toBe("Vera… I’m sor—");
    const stop = audio.find((c) => c.id === "ac_sfx_mara_stop")!;
    expect(stop.startMs).toBeGreaterThanOrEqual(machine[4].endMs);
    expect(stop.endMs).toBeLessThan(frameToMs(play[2].endFrame));
    const song = audio.find((c) => c.src === "/film/audio/bad-guy.mp3")!;
    expect(evaluateClipGainAtElapsedMs(song, frameToMs(play[0].startFrame) - song.startMs)).toBeCloseTo(song.gain);
    expect(evaluateClipGainAtElapsedMs(song, machine[0].startMs - song.startMs)).toBeCloseTo(song.gain * 0.24);
  });

  it("carries the levelled prints in the portable file, byte-identical to the built-in edit", () => {
    const bundle: PortableStoryBundle = JSON.parse(readFileSync("exports/nobodys-witness.reel.json", "utf8"));
    for (const c of machine) {
      const portable = bundle.audioClips!.find((a) => a.id === c.id)!;
      const asset = bundle.assets.find((a) => portable.src === `asset:${a.id}`)!;
      expect(asset.mime).toBe("audio/wav");
      expect(Buffer.from(asset.dataUrl.split(",")[1], "base64").equals(readFileSync(`public${c.src}`))).toBe(true);
    }
    for (const id of [phone.keyframe.sceneId, hall.keyframe.sceneId, play[0].keyframe.sceneId]) {
      expect(bundle.story.scenes.find((s) => s.id === id)).toEqual(exportCut.story.scenes.find((s) => s.id === id));
    }
  });

  it("conforms an older exported working copy at its own cut point without moving music against later pictures", () => {
    // A fresh Witness export has both sets of takes, with different shot lengths and sound ids from the director's.
    const saved: ProjectState = { ...buildDirectorsCutById(baseProject, "witness", voiceMap, musicMap), directorsCutId: "director-export" };
    const before = timeline(saved);
    const oldHall = before.clips.find((c) => c.keyframe.id === "nw_b1109")!;
    saved.story = { ...saved.story, markers: [{ id: "m", name: "My note", frame: oldHall.startFrame + 2000 }] };
    const result = cutMaraCall(saved, before.clips)!.project;
    const after = timeline(result);
    const shift = before.totalFrames - after.totalFrames;
    expect(shift).toBeGreaterThan(700);
    const newHall = after.clips.find((c) => c.keyframe.id === oldHall.keyframe.id)!;
    expect(newHall.startFrame).toBe(oldHall.startFrame - shift);
    expect(result.story.markers![0].frame).toBe(saved.story.markers![0].frame - shift);
    expect(result.originalStory).toBe(saved.originalStory);
    const oldAudio = resolveAudioClips(saved.audioClips, before.clips);
    const newAudio = resolveAudioClips(result.audioClips, after.clips);
    for (const lane of ["music", "ambience"]) {
      const bed = oldAudio.find((c) => c.lane === lane && c.startMs < frameToMs(oldHall.startFrame) && c.endMs > frameToMs(oldHall.startFrame) + 1)!;
      const join = newAudio.find((c) => c.id === `${bed.id}-after-handset`)!;
      expect(join.inMs + frameToMs(newHall.startFrame) - join.startMs).toBeCloseTo(bed.inMs + frameToMs(oldHall.startFrame) - bed.startMs, 4);
      expect(join.endMs).toBeCloseTo(bed.endMs - frameToMs(shift), 4);
      expect(join.fadeInMs).toBe(newAudio.find((c) => c.id === bed.id)!.fadeOutMs);
    }
    expect(cutMaraCall(result, after.clips)).toBeUndefined();
    expect(cutMaraCall({ ...saved, directorsCutId: "witness" }, before.clips)).toBeUndefined();
    expect(cutMaraCall({ ...saved, audioClips: saved.audioClips!.filter((c) => !c.src.endsWith("nw_b1704-machine-im-sor.mp3")) }, before.clips)).toBeUndefined();
  });
});
