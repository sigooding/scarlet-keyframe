import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import bundledAudioDurations from "../data/audio-durations.json";
import bundledFilm from "../data/nobodys-witness-film.json";
import bundledEdits from "../data/studio-edits.json";
import directorExport from "../data/director-export.json";
import mediaIndex from "../data/media-index.json";
import { buildTimelineClips } from "../sequence/animate";
import { resolveAudioClips } from "./audioClips";
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
    newVoices: voices.filter((v) => /\/s(68|76|77a)\/(nw_b|s77a-)/.test(v.src)).length,
  };
}

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

  it("plays the exported edit exactly: every caption and every voice, the new scene 68/76/77A lines included", () => {
    expect(exportCut.story).toEqual(data.story);
    expect(exportCut.audioClips).toEqual(data.audioClips);
    expect(counts(exportCut)).toEqual({ beats: 763, captions: 701, voices: 590, newVoices: 30 });
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
    expect(counts(old)).toEqual({ beats: 763, captions: 701, voices: 590, newVoices: 30 });
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
    expect(counts(opened)).toEqual({ beats: 763, captions: 701, voices: 590, newVoices: 30 });
    // another cut is built from the film, exactly as from a fresh project
    const uncut = switchDirectorsCutWithState(opened, "uncut", voiceMap, musicMap);
    expect(counts(uncut)).toEqual(counts(buildDirectorsCutById(baseProject, "uncut", voiceMap, musicMap)));
    // and coming back restores the imported edit with its sound
    const back = switchDirectorsCutWithState(uncut, "director-export", voiceMap, musicMap);
    expect(counts(back)).toEqual({ beats: 763, captions: 701, voices: 590, newVoices: 30 });
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
    expect(counts(repaired)).toEqual({ beats: 763, captions: 701, voices: 590, newVoices: 30 });
    expect(repairImportedCutSource(exportCut, sourceStory)).toBe(exportCut);
  });
});
