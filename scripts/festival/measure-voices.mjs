#!/usr/bin/env node
// Measures every voice line the Director's Export plays (ITU-R BS.1770 integrated loudness, ffmpeg ebur128) and
// writes voiceGainDb into src/data/festival-cut.json: the gain that brings each line to the film's median dialogue
// level, so no line jumps out or drops away in the Festival Cut. Lines within 1.5 dB of the median are left alone;
// corrections are capped at +/-6 dB (a line far off is usually a whisper or a shout that is meant to be).
//   node scripts/festival/measure-voices.mjs
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
const run = promisify(execFile);
const ROOT = join(import.meta.dirname, "..", "..");
const exported = JSON.parse(readFileSync(join(ROOT, "src/data/director-export.json"), "utf8"));
const srcs = [...new Set(exported.audioClips.filter((c) => c.lane === "voice").map((c) => c.src))];
const loudness = {};
let next = 0;
async function worker() {
  while (next < srcs.length) {
    const src = srcs[next++];
    try {
      const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", join(ROOT, "public", src), "-af", "ebur128", "-f", "null", "-"], { maxBuffer: 1 << 26 });
      const m = /I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/.exec(stderr);
      if (m && Number(m[1]) > -70) loudness[src] = Number(m[1]);
    } catch {
      /* a missing file is reported by the media checks, not here */
    }
  }
}
await Promise.all([0, 1, 2, 3].map(worker));
const values = Object.values(loudness).sort((a, b) => a - b);
const median = values[Math.floor(values.length / 2)];
const voiceGainDb = {};
for (const [src, l] of Object.entries(loudness).sort()) {
  const d = median - l;
  if (Math.abs(d) >= 1.5) voiceGainDb[src] = Math.round(Math.max(-6, Math.min(6, d)) * 10) / 10;
}
const F = join(ROOT, "src/data/festival-cut.json");
const data = JSON.parse(readFileSync(F, "utf8"));
data.dialogueLufs = median;
data.voiceGainDb = voiceGainDb;
writeFileSync(F, `${JSON.stringify(data, null, 1)}\n`);
console.log(`${values.length} lines measured; median ${median} LUFS; spread ${values[0]} .. ${values[values.length - 1]}; ${Object.keys(voiceGainDb).length} corrected`);
