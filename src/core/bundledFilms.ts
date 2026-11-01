import bundledFilm from "../data/nobodys-witness-film.json";
import miamiViceFilm from "../data/miami-vice-film.json";
import sweetJesusFilm from "../data/sweet-jesus-film.json";
import bundledEdits from "../data/studio-edits.json";
import { buildAudioClipsFromFilm } from "./audioClips";
import { buildDirectorsCutProject } from "./directorsCut";
import { applyStudioMusicSync, createProjectState, parseImportPayload, type AnyRecord, type ProjectState } from "./model";
import { upgradeSweetJesusOpening } from "./sweetJesusOpening";
import { upgradeSweetJesusShots } from "./sweetJesusShots";

export const BUILT_IN_FILMS = [
  { id: "nobodys-witness-film", title: "Nobody's Witness" },
  { id: "sweet-jesus-film", title: "Sweet Jesus" },
  { id: "miami-vice-film", title: "Miami Vice - Salt Water" },
] as const;

/** Create a fresh bundled project without applying another film's edits or media. */
export function createBundledFilm(
  id: string,
  voiceDurations: ReadonlyMap<string, number>,
  musicDurations: ReadonlyMap<string, number>,
): ProjectState | undefined {
  if (id === "sweet-jesus-film") {
    const imported = parseImportPayload(sweetJesusFilm, "sweet-jesus-film.json", { voiceDurations });
    const project = upgradeSweetJesusShots(upgradeSweetJesusOpening(createProjectState(imported)));
    return {
      ...project,
      originalStory: JSON.parse(JSON.stringify(project.story)),
      audioClips: buildAudioClipsFromFilm(project.story, voiceDurations, musicDurations),
    };
  }
  if (id === "miami-vice-film") {
    const imported = parseImportPayload(miamiViceFilm, "miami-vice-film.json", { voiceDurations });
    const project = createProjectState(imported);
    return {
      ...project,
      originalStory: JSON.parse(JSON.stringify(project.story)),
      audioClips: buildAudioClipsFromFilm(project.story, voiceDurations, musicDurations),
    };
  }
  if (id === "nobodys-witness-film") {
    const edits = bundledEdits as AnyRecord;
    const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations });
    const contextual = { ...imported, story: applyStudioMusicSync(imported.story, edits) };
    return buildDirectorsCutProject(createProjectState(contextual, [], edits), voiceDurations, musicDurations);
  }
  return undefined;
}
