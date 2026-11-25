// What a Festival Cut shot is, for writing its video prompt and sizing its clip.
//
//   npx vite-node .claude/skills/kling-video/scripts/shot-info.ts <beatId> [<beatId> ...]
//
// Prints, per shot: its length (frames and seconds, and the whole seconds a model must make to cover it), the picture
// it shows (after any festival repair) and its public URL path, its text, the pictures of the shots either side (for an
// end frame or continuity), and whether it already plays a video or is split into pieces.
// sameRun lists the neighbouring shots of the same scene that show the same picture (the shot included). When it has
// more than one shot, they are one run: make ONE clip for the whole run (runFrames, runGenerateSeconds) and lay it
// across them with install_run_clip.py, never a clip per shot (the user's rule: merge same-picture shots before video).
import bundledAudioDurations from "../../../../src/data/audio-durations.json";
import bundledFilm from "../../../../src/data/nobodys-witness-film.json";
import bundledEdits from "../../../../src/data/studio-edits.json";
import { buildDirectorsCutById } from "../../../../src/core/directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../../../../src/core/model";
import { extractKnownMusicDurations } from "../../../../src/core/previewAudio";
import { clipFrames, FPS } from "../../../../src/core/timing";
import directorExport from "../../../../src/data/director-export.json";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("usage: shot-info.ts <beatId> [<beatId> ...]");
const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const festival = buildDirectorsCutById(base, "festival", voiceMap, extractKnownMusicDurations(bundledEdits));
const frames = buildKeyframes(festival.story);
const at = new Map(frames.map((f, i) => [String(f.beat.id), i]));
const picture = (i: number) => (frames[i] ? String(frames[i].beat.background ?? frames[i].picture ?? "") : "");
// the export's own picture for every shot (a festival video replaces the background, so look underneath it)
const stillOf = new Map<string, string>();
const sceneBeats = new Map<string, string[]>();
for (const sc of (directorExport as any).story.scenes) {
  const ids2: string[] = [];
  for (const b of sc.dialogueBeats ?? []) { stillOf.set(String(b.id), String(b.background ?? "")); ids2.push(String(b.id)); }
  sceneBeats.set(String(sc.id), ids2);
}
const lengthOf = (baseId: string) => frames.filter((f) => String(f.beat.id).replace(/~fc\d+$/, "") === baseId).reduce((t, f) => t + clipFrames(f), 0);
function sameRun(id: string): string[] {
  const baseId = id.replace(/~fc\d+$/, "");
  const pic = stillOf.get(baseId);
  for (const ids2 of sceneBeats.values()) {
    const k = ids2.indexOf(baseId);
    if (k < 0) continue;
    if (!pic) return [baseId];
    let a = k, b = k;
    while (a > 0 && stillOf.get(ids2[a - 1]) === pic) a -= 1;
    while (b < ids2.length - 1 && stillOf.get(ids2[b + 1]) === pic) b += 1;
    return ids2.slice(a, b + 1);
  }
  return [baseId];
}
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
    ...(() => {
      const run = sameRun(id);
      if (run.length < 2) return { sameRun: run };
      const runFrames = run.reduce((t, r) => t + lengthOf(r), 0);
      return { sameRun: run, runFrames, runSeconds: +(runFrames / FPS).toFixed(3), runGenerateSeconds: Math.max(3, Math.ceil(runFrames / FPS - 0.15)) };
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
