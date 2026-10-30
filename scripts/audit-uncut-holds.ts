/** Run: npx vite-node scripts/audit-uncut-holds.ts > uncut-holds.json
 * `holds` groups still images within scenes for beat-boundary planning.
 * `continuousHolds` also groups identical pictures across scene boundaries.
 * Both use bundled measured voice durations at normal playback pace. This is
 * an audit only; it does not modify the film or any saved project.
 */
import film from "../src/data/nobodys-witness-film.json";
import durations from "../src/data/audio-durations.json";
import { imageFrameIds } from "../src/core/imageGrading";
import { buildKeyframes, createProjectState, parseImportPayload } from "../src/core/model";
import { buildDirectorsCutById } from "../src/core/directorsCut";
import { auditPictureHolds } from "../src/core/uncutHoldAudit";
import { buildTimelineClips, FPS } from "../src/sequence/animate";

const project = createProjectState(parseImportPayload(film, "film.json"), []);
const uncut = buildDirectorsCutById(project, "uncut", new Map());
const frames = buildKeyframes(uncut.story);
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
console.log(JSON.stringify({
  fps: FPS,
  holds: auditPictureHolds(auditClips, FPS, false),
  continuousHolds: auditPictureHolds(auditClips, FPS, true),
}, null, 2));
