#!/usr/bin/env node
// Saves each `npm run cutouts -- <picture> --json` result line next to the files it made, as people-N/result.json,
// so scripts/build-festival-cut.mjs knows which cut-outs a run made and at what depth.
//
// A run is only saved if every layer is sound: a layer the command flags as running to its box edge where that edge
// is inside the frame (a hard cut through a person, which shows as the layer moves), or a sliver under 3% of the
// frame's width, rejects the whole run. Its plate has every person painted out, so dropping one layer would make
// that person vanish; the shot keeps its plain depth map instead.
//   node scripts/festival/save-cutout-results.mjs <log>     (lines: "<picture>\t@@result {...}")
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const PUBLIC = join(import.meta.dirname, "..", "..", "public");
let saved = 0;
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  const at = line.indexOf("@@result ");
  if (at < 0) continue;
  const r = JSON.parse(line.slice(at + 9));
  if (!r.ok || !r.folder || !existsSync(join(PUBLIC, r.folder))) continue;
  const flagged = new Set((r.flags ?? []).map((f) => /^cut-out (\d+) runs to its box edge/.exec(f)?.[1]).filter(Boolean).map(Number));
  const bad = (r.cutouts ?? []).some((c, i) => {
    const [x, y, w, h] = c.box ?? [0, 0, r.width, r.height];
    if (w < r.width * 0.03) return true;
    const inside = x > 2 && y > 2 && x + w < r.width - 2 && y + h < r.height - 2;
    const clippedInside = flagged.has(i + 1) && !(x <= 2 || x + w >= r.width - 2 || y + h >= r.height - 2);
    return clippedInside || (flagged.has(i + 1) && inside);
  });
  if (bad) {
    console.log(`left out (a layer is cut through): ${r.picture}`);
    continue;
  }
  writeFileSync(join(PUBLIC, r.folder, "result.json"), `${JSON.stringify({ picture: r.picture, quality: r.quality, cutouts: r.cutouts, flags: r.flags }, null, 1)}\n`);
  saved += 1;
}
console.log(`${saved} results saved`);
