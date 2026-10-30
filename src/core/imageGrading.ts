import { cloneStory } from "./edits";
import { buildKeyframes, type Keyframe, type ProjectAsset, type ProjectState } from "./model";

/** Picture frames only: never select black gaps, gradients, emoji or video clips. */
export function imageFrameIds(frames: readonly Keyframe[], assets: readonly ProjectAsset[]): string[] {
  const assetsById = new Map(assets.map(a => [a.id, a]));
  return frames.filter(frame => {
    const ref = frame.picture;
    if (frame.beat.gap || !ref || /^(?:video:|gradient:|emoji:|synth:)/i.test(ref)) return false;
    if (/^data:/i.test(ref) && !/^data:image\//i.test(ref)) return false;
    if (/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(ref)) return false;
    if (ref.startsWith("asset:")) {
      const asset = assetsById.get(ref.slice(6));
      if (asset && asset.type !== "image") return false;
    }
    return true;
  }).map(frame => frame.id);
}

const LOOK_FIELDS = new Set(["colorGrade", "filmGrade", "filmGradeStrength", "dimAmount", "vignette", "vignetteStrength", "grain", "grainOpacity"]);
export function isImageGradePath(path: string): boolean {
  return path.startsWith("cinematic.") && LOOK_FIELDS.has(path.slice("cinematic.".length));
}

/** Apply only one grade/texture field to all selected pictures as a single undoable project edit. */
export function setImageGradeForFrames(project: ProjectState, ids: readonly string[], path: string, value: unknown, reset = false): ProjectState {
  if (!isImageGradePath(path) || !ids.length) return project;
  const story = cloneStory(project.story);
  const frames = buildKeyframes(story);
  const eligible = new Set(imageFrameIds(frames, project.assets));
  const wanted = new Set(ids);
  const originalFrames = reset ? new Map(buildKeyframes(project.originalStory).map(f => [f.id, f])) : undefined;
  const key = path.slice("cinematic.".length);
  let changed = false;
  for (const frame of frames) {
    if (!eligible.has(frame.id) || !wanted.has(frame.id)) continue;
    const cinematic = JSON.parse(JSON.stringify(frame.beat.cinematic ?? frame.cinematic ?? frame.scene.cinematic ?? {}));
    if (reset) {
      const original = originalFrames?.get(frame.id);
      if (!original) continue;
      const originalValue = original.beat.cinematic?.[key];
      if (originalValue === undefined) delete cinematic[key];
      else cinematic[key] = originalValue;
    } else if (value === undefined) {
      delete cinematic[key];
    } else {
      cinematic[key] = value;
    }
    if (Object.keys(cinematic).length) frame.beat.cinematic = cinematic;
    else delete frame.beat.cinematic;
    changed = true;
  }
  return changed ? { ...project, story, updatedAt: Date.now() } : project;
}
