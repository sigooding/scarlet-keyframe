/** Run: npx vite-node scripts/audit-uncut-duplicates.ts > uncut-duplicates.json
 * Finds adjacent still-image pairs in the factory Original Uncut, including
 * short holds, carried pictures and scene boundaries. Three identical clips
 * count as two overlapping pairs. Non-images and gaps interrupt a run.
 * This is a read-only audit; saved user edits may produce different results.
 */
import film from "../src/data/nobodys-witness-film.json";
import durations from "../src/data/audio-durations.json";
import { imageFrameIds } from "../src/core/imageGrading";
import { buildKeyframes, createProjectState, parseImportPayload } from "../src/core/model";
import { buildDirectorsCutById } from "../src/core/directorsCut";
import { auditAdjacentImagePairs } from "../src/core/uncutHoldAudit";
import { buildTimelineClips, FPS } from "../src/sequence/animate";

const project = createProjectState(parseImportPayload(film, "film.json"), []);
const uncut = buildDirectorsCutById(project, "uncut", new Map());
const frames = buildKeyframes(uncut.story);
const byId = new Map(frames.map(frame => [frame.id, frame]));
const imageIds = new Set(imageFrameIds(frames, uncut.assets));
const { clips } = buildTimelineClips(frames, new Map(Object.entries(durations)));
const auditClips = clips.map(clip => ({
  id: clip.keyframe.id,
  scene: clip.keyframe.sceneId,
  picture: clip.keyframe.picture,
  text: clip.keyframe.text,
  durationFrames: clip.durationFrames,
  isImage: imageIds.has(clip.keyframe.id),
}));
const pairs = auditAdjacentImagePairs(auditClips).map(pair => {
  const beat = byId.get(pair.second.id)!.beat;
  return {
    ...pair,
    secondHasExplicitBackground: !!beat.background,
    secondRevertsBackground: !!beat.backgroundRevert,
    secondIsGap: !!beat.gap,
  };
});
console.log(JSON.stringify({
  fps: FPS,
  adjacentPairs: pairs.length,
  crossScenePairs: pairs.filter(pair => pair.first.scene !== pair.second.scene).length,
  pairs,
}, null, 2));
