#!/usr/bin/env node
// Builds src/data/festival-cut.json for "The Festival Cut" (src/core/festivalCut.ts):
//
//   npm run build:festival-cut
//
// - depthByPicture: every picture the Director's Export shows (and every repaired picture) -> its depth map in
//   public/film/depth/, if one exists. A hand-made map wins over a generated one:
//     /film/depth/<folder>/<stem>-depth.jpg | -depth.png      (made for that picture, e.g. scene 77A)
//     /film/depth/<folder>/<stem>/depth.png                   (npm run depth, or the film's own)
// - pictureReplacements, practicalByPicture, videoShots, inserts, sfx, ambience, removeClips, clipPatches, voiceGainDb, lipSyncTimings: kept as they are in
//   the file; edit them by hand (practicalByPicture comes from scripts/festival/find_practicals.py).
// - cutoutsByPicture: for every picture, the newest people-N folder `npm run cutouts` made for it, if any:
//     /film/depth/<folder>/<stem>/people-N/{depth.png, plate.jpg, cutout-*.png}, with its result.json (the command's
//     --json result line, saved there: which cut-outs, at what depth)
// - Every file the cut uses (depth maps, plates, cut-outs, repaired pictures, clips, sounds) is added to
//   src/data/media-index.json.
//
// Make the missing maps first:  npm run depth -- <picture> --model small   (one per picture; see README, Depth maps)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(ROOT, "src/data/festival-cut.json");
const MEDIA_INDEX = join(ROOT, "src/data/media-index.json");

const exported = JSON.parse(readFileSync(join(ROOT, "src/data/director-export.json"), "utf8"));
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const pictureReplacements = previous.pictureReplacements ?? {};
const KEPT = ["practicalByPicture", "videoShots", "sfx", "ambience", "removeClips", "clipPatches", "voiceGainDb", "dialogueLufs", "inserts", "dry", "creditCards", "titleCards", "dropScenes", "musicHandoffs", "lipSyncTimings", "removeCaptions", "textPatches"];

const pictures = new Set();
for (const scene of exported.story.scenes) {
  for (const beat of scene.dialogueBeats ?? []) {
    if (typeof beat.background === "string" && beat.background.startsWith("/film/img/")) pictures.add(beat.background);
  }
}
for (const repaired of Object.values(pictureReplacements)) pictures.add(repaired);
for (const insert of previous.inserts ?? []) for (const cut of insert.cuts) if (cut.picture.startsWith("/film/img/")) pictures.add(cut.picture);
for (const card of previous.creditCards?.cards ?? []) if (card.picture.startsWith("/film/img/")) pictures.add(card.picture);

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
// People cut out by `npm run cutouts -- <picture> --quality fast`: the newest run wins.
const cutoutsByPicture = {};
for (const picture of [...pictures].sort()) {
  const m = /^\/film\/img\/(.+)\/([^/]+)\.(?:jpe?g|png|webp)$/i.exec(picture);
  if (!m) continue;
  const folders = [...new Set([m[1], m[1].replace(/_(?:new|retakes|picks)$/, "")])];
  for (const f of folders) {
    const base = `/film/depth/${f}/${m[2]}`;
    const dir = join(PUBLIC, base);
    if (!existsSync(dir) || cutoutsByPicture[picture]) continue;
    const runs = readdirSync(dir).filter((n) => /^people-\d+$/.test(n)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)));
    for (const run of runs) {
      const folder = `${base}/${run}`;
      const result = join(PUBLIC, folder, "result.json");
      if (!existsSync(result) || !existsSync(join(PUBLIC, folder, "plate.jpg"))) continue;
      const r = JSON.parse(readFileSync(result, "utf8"));
      const depthCutouts = (r.cutouts ?? []).map((c) => ({ image: c.image, depth: c.depth })).filter((c) => existsSync(join(PUBLIC, c.image)));
      if (!depthCutouts.length) continue;
      cutoutsByPicture[picture] = { depthMap: `${folder}/depth.png`, depthPlate: `${folder}/plate.jpg`, depthCutouts };
      break;
    }
  }
}

const out = { depthByPicture, pictureReplacements, cutoutsByPicture };
for (const k of KEPT) if (previous[k] !== undefined) out[k] = previous[k];
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);

const index = new Set(JSON.parse(readFileSync(MEDIA_INDEX, "utf8")));
const before = index.size;
const used = [...Object.values(depthByPicture), ...Object.values(pictureReplacements), ...Object.values(out.videoShots ?? {})];
for (const insert of out.inserts ?? []) for (const cut of insert.cuts) used.push(cut.picture.replace(/^video:/, ""));
for (const c of Object.values(cutoutsByPicture)) used.push(c.depthMap, c.depthPlate, ...c.depthCutouts.map((x) => x.image));
for (const s of [...(out.sfx ?? []), ...(out.ambience ?? [])]) for (const part of s.src.split("+")) if (part.includes("/")) used.push(part.replace(/^file:/, ""));
for (const patch of Object.values(out.clipPatches ?? {})) if (typeof patch.src === "string" && patch.src.startsWith("/")) used.push(patch.src);
for (const p of used) index.add(p);
if (index.size !== before) writeFileSync(MEDIA_INDEX, `${JSON.stringify([...index].sort(), null, 2)}\n`);

console.log(`${pictures.size} pictures; ${Object.keys(depthByPicture).length} with a depth map; ${pictures.size - Object.keys(depthByPicture).length} without`);
console.log(`${Object.keys(cutoutsByPicture).length} pictures with people cut out`);
console.log(`${Object.keys(pictureReplacements).length} repaired pictures; ${index.size - before} files added to the media index`);
