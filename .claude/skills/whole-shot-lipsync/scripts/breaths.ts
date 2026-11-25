// Leaves a breath after each lip-sync cutaway's line, so the film doesn't cut back the instant the speaker stops.
//
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/breaths.ts            report what it would change
//   npx vite-node .claude/skills/whole-shot-lipsync/scripts/breaths.ts --write    change src/data/festival-cut.json
//
// For every lip-sync cut in `inserts`, it moves the cut's end to half a second after the speaker's last line. It never
// goes past:
//   - 12 frames beyond the cut's present end (the clip holds that many frames past its cut, so it never runs out);
//   - 120 ms before the next line starts (the film is back on the other face before anyone else speaks);
//   - the shot's end, or the next cut in the shot.
// It also never leaves a sliver of under 8 frames before the shot ends. It runs on to the cut when the clip covers that
// and the next line belongs to the next shot; otherwise it stops short. Only cuts get longer; the film's timing doesn't
// change.
import { readFileSync, writeFileSync } from "node:fs";
import bundledAudioDurations from "../../../../src/data/audio-durations.json";
import bundledFilm from "../../../../src/data/nobodys-witness-film.json";
import bundledEdits from "../../../../src/data/studio-edits.json";
import { buildDirectorsCutById } from "../../../../src/core/directorsCut";
import { applyStudioMusicSync, buildKeyframes, createProjectState, parseImportPayload } from "../../../../src/core/model";
import { extractKnownMusicDurations } from "../../../../src/core/previewAudio";
import { clipFrames, FPS } from "../../../../src/core/timing";

export const BREATH_MS = 500;
const HELD = 12, GAP_MS = 120, MIN_PIECE = 8;
const FILE = new URL("../../../../src/data/festival-cut.json", import.meta.url);
const write = process.argv.includes("--write");

const voiceMap = new Map(Object.entries(bundledAudioDurations as Record<string, number>));
const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", { voiceDurations: voiceMap });
const base = createProjectState({ ...imported, story: applyStudioMusicSync(imported.story, bundledEdits) }, [], bundledEdits);
const festival = buildDirectorsCutById(base, "festival", voiceMap, extractKnownMusicDurations(bundledEdits));

const startMs = new Map<string, number>();
const shotFrames = new Map<string, number>(); // a shot's whole length, all its pieces together
let at = 0;
for (const f of buildKeyframes(festival.story)) {
  const id = String(f.beat.id);
  startMs.set(id, (at / FPS) * 1000);
  const baseId = id.replace(/~fc\d+$/, "");
  shotFrames.set(baseId, (shotFrames.get(baseId) ?? 0) + clipFrames(f));
  at += clipFrames(f);
}
const voices = (festival.audioClips ?? []).filter((c) => c.lane === "voice" && startMs.has(c.anchorId))
  .map((c) => ({ who: c.src.split("/").pop()!.split("-")[1], s: startMs.get(c.anchorId)! + c.offsetMs, e: startMs.get(c.anchorId)! + c.offsetMs + c.durationMs }));
const frameMs = 1000 / FPS;

const data = JSON.parse(readFileSync(FILE, "utf8"));
let changed = 0;
for (const insert of data.inserts ?? []) {
  const shot0 = startMs.get(insert.beatId);
  const total = shotFrames.get(insert.beatId);
  if (shot0 === undefined || !total) continue;
  const cuts = [...insert.cuts].sort((a: any, b: any) => a.from - b.from);
  cuts.forEach((cut: any, k: number) => {
    const m = /\/lipsync-([a-z]+)/.exec(String(cut.picture));
    if (!m || !String(cut.picture).startsWith("video:")) return;
    const slug = String(cut.picture).split("/lipsync-")[1].replace(/\.mp4$/, "").replace(/-/g, "");
    const a = shot0 + cut.from * frameMs, b = shot0 + cut.to * frameMs;
    const mine = voices.filter((v) => slug.startsWith(v.who) && v.e > a + 100 && v.s < b - 100);
    if (!mine.length) return;
    const lineEnd = Math.max(...mine.map((v) => v.e));
    const next = Math.min(...voices.filter((v) => v.s > lineEnd - 50).map((v) => v.s), Infinity);
    const limitNextCut = k + 1 < cuts.length ? cuts[k + 1].from - MIN_PIECE : total;
    let to = Math.min(Math.round((lineEnd + BREATH_MS - shot0) / frameMs), cut.to + HELD, Math.floor((next - GAP_MS - shot0) / frameMs), limitNextCut, total);
    // a sliver before the shot ends: run on to the cut instead when the clip covers it and the next line belongs to the
    // next shot (it starts as the shot ends); otherwise stop short of the sliver
    if (to < total && total - to < MIN_PIECE) to = total <= cut.to + HELD && next >= shot0 + total * frameMs - 40 ? total : total - MIN_PIECE;
    if (to <= cut.to) return;
    console.log(`${insert.beatId} ${String(cut.picture).split("/").pop()}: cut ends ${cut.to} -> ${to} (pause after the line ${Math.round(shot0 + cut.to * frameMs - lineEnd)} -> ${Math.round(shot0 + to * frameMs - lineEnd)} ms)`);
    cut.to = to;
    changed += 1;
  });
}
console.log(`${changed} cut(s) ${write ? "lengthened" : "would be lengthened"}`);
if (write && changed) writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
