import type { AnyRecord, ProjectState, SceneLike } from "./model";
import { buildKeyframes } from "./model";

export interface StudioPatch {
  note: string;
  scenes: Record<string, AnyRecord>;
  pictures: Array<{ scene: string; find: string; file: string }>;
  pictureLook: Record<string, { cinematic: AnyRecord }>;
  sfx: Array<{ scene: string; find: string; file: string; volume: number }>;
}

export interface StudioPatchResult {
  patch: StudioPatch;
  unmatched: string[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function writeStudioPatch(project: ProjectState): StudioPatchResult {
  const patch: StudioPatch = {
    note: `Animatic edits for ${project.title}. Generated against ${project.sourceName}.`,
    scenes: {},
    pictures: [],
    pictureLook: {},
    sfx: [],
  };
  const unmatched: string[] = [];
  const originalScenes = new Map(project.originalStory.scenes.map((scene) => [scene.id, scene]));
  const currentFrames = buildKeyframes(project.story);
  const originalFrames = new Map(buildKeyframes(project.originalStory).map((frame) => [frame.id, frame]));
  for (const scene of project.story.scenes) {
    const original = originalScenes.get(scene.id);
    if (!original) continue;
    const scenePatch = changedSceneFields(scene, original);
    if (Object.keys(scenePatch).length) patch.scenes[scene.id] = scenePatch;
  }

  for (const frame of currentFrames) {
    const previous = originalFrames.get(frame.id);
    const sceneName = frame.scene.id;
    const pictureChanged = !previous || previous.beat.background !== frame.beat.background;
    if (pictureChanged) {
      if (!frame.beat.background) {
        unmatched.push(`${sceneName} / beat ${frame.number}: removing a picture has no direct pictures[] patch entry.`);
      } else {
        const find = uniqueFind(frame.scene, frame.beat.text || "");
        const file = patchFile(frame.beat.background, project);
        if (!find) unmatched.push(`${sceneName} / beat ${frame.number}: no unique text match for the picture patch.`);
        else if (!file) unmatched.push(`${sceneName} / beat ${frame.number}: picture reference ${frame.beat.background} has no file path for pictures[].`);
        else patch.pictures.push({ scene: sceneName, find, file });
      }
    }

    const lookChanged = JSON.stringify(previous?.beat.cinematic || {}) !== JSON.stringify(frame.beat.cinematic || {});
    if (lookChanged) {
      const pictureRef = frame.beat.background || frame.picture || previous?.picture;
      const file = patchFile(pictureRef || "", project);
      const key = file ? basenameWithoutExtension(file) : "";
      if (!key) unmatched.push(`${sceneName} / beat ${frame.number}: camera/effect changes have no picture filename for pictureLook[].`);
      else {
        const cinematic = frame.beat.cinematic || frame.scene.cinematic || {};
        const existing = patch.pictureLook[key];
        if (existing && JSON.stringify(existing.cinematic) !== JSON.stringify(cinematic)) {
          unmatched.push(`${sceneName} / beat ${frame.number}: ${key} has conflicting looks; pictureLook[] can only store one look per filename.`);
        } else patch.pictureLook[key] = { cinematic: clone(cinematic) };
      }
    }

    const sfxChanged = previous?.beat.sfxUrl !== frame.beat.sfxUrl || previous?.beat.sfxVolume !== frame.beat.sfxVolume;
    if (sfxChanged && frame.beat.sfxUrl) {
      const find = uniqueFind(frame.scene, frame.beat.text || "");
      const file = patchFile(frame.beat.sfxUrl, project);
      if (!find) unmatched.push(`${sceneName} / beat ${frame.number}: no unique text match for the sound-effect patch.`);
      else if (!file) unmatched.push(`${sceneName} / beat ${frame.number}: sound reference ${frame.beat.sfxUrl} has no file path for sfx[].`);
      else patch.sfx.push({ scene: sceneName, find, file: file.replace(/\.(?:mp3|wav|ogg|m4a|aac)$/i, ""), volume: Number(frame.beat.sfxVolume ?? 1) });
    } else if (sfxChanged && !frame.beat.sfxUrl) {
      unmatched.push(`${sceneName} / beat ${frame.number}: removing a sound effect has no direct sfx[] patch entry.`);
    }

    const current = frame.beat as AnyRecord;
    const before = previous?.beat as AnyRecord | undefined;
    if (JSON.stringify(current.particles ?? current.particleConfig) !== JSON.stringify(before?.particles ?? before?.particleConfig)) {
      unmatched.push(`${sceneName} / beat ${frame.number}: per-beat particle overrides are not a native studio-edits key.`);
    }
  }

  return { patch, unmatched: [...new Set(unmatched)] };
}

function changedSceneFields(scene: SceneLike, original: SceneLike): AnyRecord {
  const keys = [
    "background", "cinematic", "musicUrl", "sceneAudioUrl", "musicMode", "musicLoop", "musicLevel",
    "musicFadeSeconds", "musicFadeOutSeconds", "musicSync", "ambientAudio", "particles", "particleConfig",
    "letterbox", "animaticReadPace", "transition", "transitionSpeed",
  ];
  const changed: AnyRecord = {};
  for (const key of keys) {
    if (JSON.stringify(scene[key]) === JSON.stringify(original[key])) continue;
    changed[key] = scene[key] === undefined ? null : clone(scene[key]);
  }
  return changed;
}

function uniqueFind(scene: SceneLike, text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  const beats = scene.dialogueBeats ?? [];
  const occursOnce = (candidate: string) => beats.filter((beat) => String(beat.text || "").includes(candidate)).length === 1;
  if (occursOnce(normalized)) return normalized;
  const words = normalized.split(" ");
  for (let length = words.length - 1; length >= 1; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      const candidate = words.slice(start, start + length).join(" ");
      if (occursOnce(candidate)) return candidate;
    }
  }
  return undefined;
}

function patchFile(value: string, project: ProjectState): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("asset:")) {
    const asset = project.assets.find((candidate) => candidate.id === value.slice(6));
    return asset?.outputPath || asset?.name;
  }
  if (/^https?:\/\//i.test(value)) return value;
  return value.replace(/^video:/, "").replace(/^mp3:/, "");
}

function basenameWithoutExtension(value: string): string {
  const file = value.split(/[\\/]/).pop() || "";
  return file.replace(/\.[^.]+$/, "");
}

export function makeStudioPatchReport(result: StudioPatchResult): string {
  const lines = ["Scarlet Reel studio-edits patch report", "", `Pictures: ${result.patch.pictures.length}`, `Looks: ${Object.keys(result.patch.pictureLook).length}`, `Sound effects: ${result.patch.sfx.length}`];
  if (result.unmatched.length) lines.push("", "Not represented by this patch:", ...result.unmatched.map((item) => `- ${item}`));
  return lines.join("\n");
}
