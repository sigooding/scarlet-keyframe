// Builds the voice track for ONE lip-sync clip over a whole shot of the Festival Cut.
//
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/shot-voice-track.ts <beatId> <speaker> <out.mp3>
//
// The track is exactly as long as the shot. It holds only <speaker>'s lines (the actor on camera), each at the moment
// it is spoken in the film; every other voice in the shot becomes silence of the same length, so the clip can play the
// actor listening through the other lines and the shot never has to cut. <speaker> is the token in the voice files'
// names (/film/voice/<scene>/<nn>-<speaker>-<words>.mp3), e.g. vera, jack, kaneko. A sidecar <out>.json records the
// shot's length and the line timings for the prompt and for install_clip.py.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import bundledAudioDurations from "../../../../src/data/audio-durations.json";
import bundledFilm from "../../../../src/data/nobodys-witness-film.json";
import bundledEdits from "../../../../src/data/studio-edits.json";
import { buildDirectorsCutById } from "../../../../src/core/directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../../../../src/core/model";
import { extractKnownMusicDurations } from "../../../../src/core/previewAudio";
import { clipFrames, FPS } from "../../../../src/core/timing";

const [beatId, speaker, out] = process.argv.slice(2);
if (!beatId || !speaker || !out) throw new Error("usage: shot-voice-track.ts <beatId> <speaker> <out.mp3>");

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const festival = buildDirectorsCutById(base, "festival", voiceMap, extractKnownMusicDurations(bundledEdits));

// every shot's start on the film's clock
const startMs = new Map<string, number>();
let at = 0;
let frames = 0;
for (const f of buildKeyframes(festival.story)) {
  const id = String(f.beat.id);
  startMs.set(id, (at / FPS) * 1000);
  if (id === beatId) frames = clipFrames(f);
  at += clipFrames(f);
}
if (!frames) throw new Error(`no shot ${beatId} in the Festival Cut`);
const shotStart = startMs.get(beatId)!;
// A shot the festival has already split (a cutaway or another lip sync over part of it) plays as pieces: <id>,
// <id>~fc1, ... The track then covers this piece only, and install_clip.py adds the clip as a cut for it.
const baseId = beatId.replace(/~fc\d+$/, "");
const split = startMs.has(`${baseId}~fc1`);
const offsetFrames = Math.round(((shotStart - (startMs.get(baseId) ?? shotStart)) / 1000) * FPS);
const shotMs = (frames / FPS) * 1000;

const who = (src: string) => src.split("/").pop()!.split("-")[1] ?? "?";
const lines = (festival.audioClips ?? [])
  .filter((c) => c.lane === "voice" && startMs.has(c.anchorId))
  .map((c) => {
    const start = startMs.get(c.anchorId)! + c.offsetMs - shotStart;
    return { src: c.src, speaker: who(c.src), inMs: c.inMs, startMs: Math.round(start), endMs: Math.round(start + c.durationMs) };
  })
  // a line that only grazes the shot's edges (under a tenth of a second) belongs to the next or last shot
  .filter((l) => l.endMs > 100 && l.startMs < shotMs - 100)
  .sort((a, b) => a.startMs - b.startMs);
const kept = lines.filter((l) => l.speaker === speaker.toLowerCase());
if (!kept.length) throw new Error(`${speaker} says nothing in ${beatId}; voices here: ${[...new Set(lines.map((l) => l.speaker))].join(", ") || "none"}`);

const T = shotMs / 1000;
const inputs: string[] = [];
const filters: string[] = [];
kept.forEach((l, k) => {
  const skip = Math.max(0, -l.startMs) / 1000;
  const dur = Math.min((l.endMs - l.startMs) / 1000 - skip, T - Math.max(0, l.startMs / 1000));
  inputs.push("-i", `public${l.src}`);
  filters.push(`[${k}:a]aresample=44100,aformat=channel_layouts=mono,atrim=start=${(l.inMs / 1000 + skip).toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(Math.max(0, l.startMs))}[a${k}]`);
});
filters.push(`anullsrc=r=44100:cl=mono,atrim=duration=${T.toFixed(3)}[sil]`);
filters.push(`[sil]${kept.map((_, k) => `[a${k}]`).join("")}amix=inputs=${kept.length + 1}:normalize=0:duration=first,atrim=duration=${T.toFixed(3)}[out]`);
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", out]);

const s = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
console.log(`${beatId}: ${frames} frames = ${T.toFixed(2)}s. Track: ${out}`);
if (split) console.log(`  ${baseId} is split into pieces: this track covers frames ${offsetFrames}-${offsetFrames + frames} of it`);
for (const l of lines) {
  const mine = l.speaker === speaker.toLowerCase();
  console.log(`  ${s(l.startMs)}-${s(Math.min(l.endMs, shotMs))}  ${l.speaker}${mine ? "" : "  (off the track: the actor listens)"}`);
}
writeFileSync(`${out}.json`, JSON.stringify({ beatId, baseId, split, offsetFrames, speaker, frames, track: out, lines }, null, 1));
