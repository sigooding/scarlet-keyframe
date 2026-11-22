#!/usr/bin/env node
// Builds src/data/festival-cut.json for "The Festival Cut" (src/core/festivalCut.ts):
//
//   npm run build:festival-cut
//
// - depthByPicture: every picture the Director's Export shows (and every repaired picture) -> its depth map in
//   public/film/depth/, if one exists. A hand-made map wins over a generated one:
//     /film/depth/<folder>/<stem>-depth.jpg | -depth.png      (made for that picture, e.g. scene 77A)
//     /film/depth/<folder>/<stem>/depth.png                   (npm run depth, or the film's own)
// - pictureReplacements: kept as it is in the file (picture -> repaired picture); edit it by hand.
// - Every depth map and repaired picture is added to src/data/media-index.json.
//
// Make the missing maps first:  npm run depth -- <picture> --model small   (one per picture; see README, Depth maps)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(ROOT, "src/data/festival-cut.json");
const MEDIA_INDEX = join(ROOT, "src/data/media-index.json");

const exported = JSON.parse(readFileSync(join(ROOT, "src/data/director-export.json"), "utf8"));
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const pictureReplacements = previous.pictureReplacements ?? {};

const pictures = new Set();
for (const scene of exported.story.scenes) {
  for (const beat of scene.dialogueBeats ?? []) {
    if (typeof beat.background === "string" && beat.background.startsWith("/film/img/")) pictures.add(beat.background);
  }
}
for (const repaired of Object.values(pictureReplacements)) pictures.add(repaired);

function depthFor(picture) {
  const m = /^\/film\/img\/(.+)\/([^/]+)\.(?:jpe?g|png|webp)$/i.exec(picture);
  if (!m) return undefined;
  const [, folder, stem] = m;
  const folders = [...new Set([folder, folder.replace(/_(?:new|retakes|picks)$/, "")])];
  for (const f of folders) {
    for (const cand of [`/film/depth/${f}/${stem}-depth.jpg`, `/film/depth/${f}/${stem}-depth.png`, `/film/depth/${f}/${stem}/depth.png`]) {
      if (existsSync(join(PUBLIC, cand))) return cand;
    }
  }
  return undefined;
}

const depthByPicture = {};
for (const picture of [...pictures].sort()) {
  const depth = depthFor(picture);
  if (depth) depthByPicture[picture] = depth;
}
writeFileSync(OUT, `${JSON.stringify({ depthByPicture, pictureReplacements }, null, 1)}\n`);

const index = new Set(JSON.parse(readFileSync(MEDIA_INDEX, "utf8")));
const before = index.size;
for (const p of [...Object.values(depthByPicture), ...Object.values(pictureReplacements)]) index.add(p);
if (index.size !== before) writeFileSync(MEDIA_INDEX, `${JSON.stringify([...index].sort(), null, 2)}\n`);

console.log(`${pictures.size} pictures; ${Object.keys(depthByPicture).length} with a depth map; ${pictures.size - Object.keys(depthByPicture).length} without`);
console.log(`${Object.keys(pictureReplacements).length} repaired pictures; ${index.size - before} files added to the media index`);
