/** Run: npx vite-node scripts/audit-uncut-holds.ts > uncut-holds.json
 * Groups consecutive identical images within a scene, using bundled measured
 * voice durations at normal playback pace. This is an audit, not a mutation.
 * Review end-of-scene/cross-scene and single-long-beat cases separately.
 */
import film from "../src/data/nobodys-witness-film.json";
import durations from "../src/data/audio-durations.json";
import { buildKeyframes, createProjectState, parseImportPayload } from "../src/core/model";
import { buildDirectorsCutById } from "../src/core/directorsCut";
import { buildTimelineClips, FPS } from "../src/sequence/animate";

type Run = { scene: string; picture: string | undefined; durationFrames: number; beats: { id: string; text: string; durationFrames: number }[] };
const project = createProjectState(parseImportPayload(film, "film.json"), []);
const uncut = buildDirectorsCutById(project, "uncut", new Map());
const { clips } = buildTimelineClips(buildKeyframes(uncut.story), new Map(Object.entries(durations)));
const runs: Run[] = [];
for (const clip of clips) {
  const frame = clip.keyframe;
  let run = runs.at(-1);
  if (!run || run.scene !== frame.sceneId || run.picture !== frame.picture || !frame.picture) {
    run = { scene: frame.sceneId, picture: frame.picture, durationFrames: 0, beats: [] };
    runs.push(run);
  }
  run.durationFrames += clip.durationFrames;
  run.beats.push({ id: frame.id, text: frame.text, durationFrames: clip.durationFrames });
}
const holds = runs.flatMap((run, index) => {
  if (!run.picture || run.durationFrames <= 7 * FPS) return [];
  const next = runs[index + 1];
  return [{ ...run, seconds: run.durationFrames / FPS, nextScene: next?.scene, nextPicture: next?.picture, nextBeat: next?.beats[0] }];
});
console.log(JSON.stringify({ fps: FPS, holds }, null, 2));
