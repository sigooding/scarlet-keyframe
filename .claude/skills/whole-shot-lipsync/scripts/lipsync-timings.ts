// Records, and checks, where each lip-sync clip's lines fall, so a later edit can't silently put lips and voice out of step.
//
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/lipsync-timings.ts --write <clip path> [...]   record these clips
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/lipsync-timings.ts --write-all                 record every one
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/lipsync-timings.ts --check                     report any drift
//
// The film never plays a lip-sync clip's own sound: install_clip.py strips it, and the film's voice clip plays at its film
// time. The clip was made from a track of those same voice clips at those same times, so lips and voice match when the
// clip goes in. They only drift apart if a line or a shot is retimed afterwards. This writes, for every clip, the shot (or
// piece) that shows it and where each of the speaker's lines starts in it, into lipSyncTimings in
// src/data/festival-cut.json. The festival test fails if any line has since moved by more than a frame.
// install_clip.py runs --write for the clip it installs. Use --write-all only when every clip is known to be in step.
import { readFileSync, writeFileSync } from "node:fs";
import bundledAudioDurations from "../../../../src/data/audio-durations.json";
import bundledFilm from "../../../../src/data/nobodys-witness-film.json";
import bundledEdits from "../../../../src/data/studio-edits.json";
import { buildDirectorsCutById } from "../../../../src/core/directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../../../../src/core/model";
import { extractKnownMusicDurations } from "../../../../src/core/previewAudio";
import { clipFrames, FPS } from "../../../../src/core/timing";

const FILE = new URL("../../../../src/data/festival-cut.json", import.meta.url);
const argv = process.argv.slice(2);
const mode = argv[0];
if (!["--write", "--write-all", "--check"].includes(mode)) throw new Error("usage: lipsync-timings.ts --write <clip>... | --write-all | --check");

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const festival = buildDirectorsCutById(base, "festival", voiceMap, extractKnownMusicDurations(bundledEdits));

const startMs = new Map<string, number>();
const lengthMs = new Map<string, number>();
const shownBy = new Map<string, string>(); // clip path -> the shot or piece showing it
let at = 0;
for (const f of buildKeyframes(festival.story)) {
  const id = String(f.beat.id);
  startMs.set(id, (at / FPS) * 1000);
  lengthMs.set(id, (clipFrames(f) / FPS) * 1000);
  const bg = String(f.beat.background ?? "");
  if (bg.startsWith("video:/film/video/festival/lipsync-")) shownBy.set(bg.slice("video:".length), id);
  at += clipFrames(f);
}
const voices = (festival.audioClips ?? []).filter((c) => c.lane === "voice" && startMs.has(c.anchorId))
  .map((c) => ({ src: c.src, start: startMs.get(c.anchorId)! + c.offsetMs, end: startMs.get(c.anchorId)! + c.offsetMs + c.durationMs }));
const who = (src: string) => src.split("/").pop()!.split("-")[1] ?? "?";

type Timing = { shot: string; lines: { voice: string; atMs: number }[] };
function measure(clip: string): Timing {
  const shot = shownBy.get(clip);
  if (!shot) throw new Error(`${clip} isn't shown anywhere in the Festival Cut`);
  // the clip is named lipsync-<speaker>-<words>; voice files spell a two-word speaker as one (mrs-noda -> mrsnoda)
  const slug = clip.split("/lipsync-")[1].replace(/\.mp4$/, "").replace(/-/g, "");
  const speaker = clip.split("/lipsync-")[1].split("-")[0];
  const s0 = startMs.get(shot)!, s1 = s0 + lengthMs.get(shot)!;
  const lines = voices.filter((v) => slug.startsWith(who(v.src)) && v.end > s0 + 100 && v.start < s1 - 100)
    .map((v) => ({ voice: v.src, atMs: Math.round(v.start - s0) }));
  if (!lines.length) throw new Error(`${clip}: no ${speaker} line in ${shot}`);
  return { shot, lines };
}

const data = JSON.parse(readFileSync(FILE, "utf8"));
const recorded: Record<string, Timing> = data.lipSyncTimings ?? {};
if (mode === "--check") {
  let bad = 0;
  for (const [clip, rec] of Object.entries(recorded)) {
    const now = shownBy.get(clip) ? measure(clip) : undefined;
    for (const line of rec.lines) {
      const was = line.atMs;
      const is = now?.shot === rec.shot ? now.lines.find((l) => l.voice === line.voice)?.atMs : undefined;
      if (is === undefined || Math.abs(is - was) > 1000 / FPS) {
        bad += 1;
        console.log(`${clip}: ${line.voice} was at ${was} ms in ${rec.shot}, now ${is === undefined ? "gone" : `${is} ms`}`);
      }
    }
  }
  console.log(bad ? `${bad} line(s) out of step` : `all ${Object.keys(recorded).length} lip syncs in step`);
} else {
  const clips = mode === "--write-all" ? [...shownBy.keys()] : argv.slice(1);
  for (const clip of clips) {
    recorded[clip] = measure(clip);
    console.log(`${clip}: ${recorded[clip].shot}, ${recorded[clip].lines.map((l) => `${l.atMs} ms`).join(", ")}`);
  }
  data.lipSyncTimings = Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
}
