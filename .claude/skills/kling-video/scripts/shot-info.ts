// What a Festival Cut shot is, for writing its video prompt and sizing its clip.
//
//   npx vite-node .claude/skills/kling-video/scripts/shot-info.ts <beatId> [<beatId> ...]
//
// Prints, per shot: its length (frames and seconds, and the whole seconds a model must make to cover it), the picture
// it shows (after any festival repair) and its public URL path, its text, the pictures of the shots either side (for an
// end frame or continuity), and whether it already plays a video or is split into pieces.
import bundledAudioDurations from "../../../../src/data/audio-durations.json";
import bundledFilm from "../../../../src/data/nobodys-witness-film.json";
import bundledEdits from "../../../../src/data/studio-edits.json";
import { buildDirectorsCutById } from "../../../../src/core/directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../../../../src/core/model";
import { extractKnownMusicDurations } from "../../../../src/core/previewAudio";
import { clipFrames, FPS } from "../../../../src/core/timing";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("usage: shot-info.ts <beatId> [<beatId> ...]");
const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const festival = buildDirectorsCutById(base, "festival", voiceMap, extractKnownMusicDurations(bundledEdits));
const frames = buildKeyframes(festival.story);
const at = new Map(frames.map((f, i) => [String(f.beat.id), i]));
const picture = (i: number) => (frames[i] ? String(frames[i].beat.background ?? frames[i].picture ?? "") : "");
const out = ids.map((id) => {
  const i = at.get(id);
  if (i === undefined) return { id, error: "not in the Festival Cut" };
  const f = frames[i];
  const n = clipFrames(f);
  const pic = picture(i);
  return {
    id,
    scene: f.sceneId,
    frames: n,
    seconds: +(n / FPS).toFixed(3),
    generateSeconds: Math.max(3, Math.ceil(n / FPS - 0.15)),
    picture: pic,
    publicPath: pic.startsWith("/film/") ? `public${pic}` : pic.startsWith("video:") ? `public${pic.slice(6)}` : pic,
    text: String(f.beat.text ?? ""),
    previous: picture(i - 1),
    next: picture(i + 1),
    alreadyVideo: pic.startsWith("video:"),
    split: at.has(`${id.replace(/~fc\d+$/, "")}~fc1`),
  };
});
console.log(JSON.stringify(out, null, 1));
