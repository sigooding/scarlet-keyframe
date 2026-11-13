#!/usr/bin/env node
// Builds a Portable Bundle (.reel.json) into the app as the "Director's Export" cut, so it is in the cut menu with
// no import, and is never re-cut, re-graded or re-timed:
//
//   npm run hardwire:export                                   # exports/nobodys-witness.reel.json
//   npm run hardwire:export -- path/to/another.reel.json
//
// A bundle carries the files that would otherwise be lost as base64 (uploads, linked-folder files), and points at
// everything else by path. Each embedded file is checked byte for byte against the repository:
//   - the same bytes are already in public/          -> the reference becomes that public path;
//   - the same bytes are a recreated Uncut plate the app ships (src/assets/recreated-uncut/) -> the `asset:` id
//     stays, and the cut supplies the app's own copy (recreatedUncutAssets in src/core/recreatedUncut.ts);
//   - anything else is written to public/film/{img,audio,video}/export/ and the reference points there.
//
// Writes:
//   src/data/director-export.json   { source, story, audioClips } with references rewritten as above
//   src/data/media-index.json       plus any file written to public/film/*/export/
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = resolve(ROOT, process.argv[2] ?? "exports/nobodys-witness.reel.json");
const PUBLIC = join(ROOT, "public");
const BUNDLED_PLATES = join(ROOT, "src/assets/recreated-uncut");
const OUT_DATA = join(ROOT, "src/data/director-export.json");
const MEDIA_INDEX = join(ROOT, "src/data/media-index.json");

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

/** Every file under `dir` (skipping generated thumbnails), grouped by byte size so only same-size files are hashed. */
function filesBySize(dir, skip = () => false) {
  const out = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (skip(p)) continue;
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        const list = out.get(st.size) ?? [];
        list.push(p);
        out.set(st.size, list);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function findSame(index, buf, digest) {
  for (const p of index.get(buf.length) ?? []) {
    if (sha1(readFileSync(p)) === digest) return p;
  }
  return undefined;
}

const EXT_BY_MIME = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg",
  "video/mp4": ".mp4", "video/webm": ".webm",
};

function main() {
  if (!existsSync(bundlePath)) throw new Error(`No bundle at ${bundlePath}`);
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  if (!bundle?.story?.scenes?.length) throw new Error(`${bundlePath} is not a Portable Bundle (no story.scenes).`);

  const publicIndex = filesBySize(PUBLIC, (p) => p.startsWith(join(PUBLIC, "thumbs")));
  const plateIndex = filesBySize(BUNDLED_PLATES);
  const rewrite = new Map(); // asset id -> public path
  const keptIds = [];
  const written = [];

  for (const asset of bundle.assets ?? []) {
    if (typeof asset?.id !== "string" || typeof asset.dataUrl !== "string") continue;
    const comma = asset.dataUrl.indexOf(",");
    const buf = Buffer.from(asset.dataUrl.slice(comma + 1), "base64");
    const digest = sha1(buf);
    const inPublic = findSame(publicIndex, buf, digest);
    if (inPublic) {
      rewrite.set(asset.id, `/${relative(PUBLIC, inPublic).split("\\").join("/")}`);
      continue;
    }
    if (findSame(plateIndex, buf, digest)) {
      keptIds.push(asset.id);
      continue;
    }
    const kind = asset.type === "audio" ? "audio" : asset.type === "video" ? "video" : "img";
    const ext = EXT_BY_MIME[asset.mime] ?? (extname(String(asset.name ?? "")) || ".bin");
    const rel = `film/${kind}/export/${asset.id}${ext}`;
    mkdirSync(dirname(join(PUBLIC, rel)), { recursive: true });
    writeFileSync(join(PUBLIC, rel), buf);
    rewrite.set(asset.id, `/${rel}`);
    written.push({ path: `/${rel}`, name: asset.name, bytes: buf.length });
  }

  // Rewrite every `asset:<id>` inside any string (plain, `video:asset:…`, an ambience `file:asset:…`, cinematic layers).
  let rewrites = 0;
  const unresolved = new Set();
  const embedded = new Set((bundle.assets ?? []).map((a) => a?.id));
  const visit = (value) => {
    if (typeof value === "string") {
      return value.replace(/asset:([A-Za-z0-9._-]+)/g, (match, id) => {
        const path = rewrite.get(id);
        if (path) {
          rewrites += 1;
          return path;
        }
        if (!embedded.has(id)) unresolved.add(id);
        return match;
      });
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = visit(v);
      return out;
    }
    return value;
  };
  const story = visit(bundle.story);
  const audioClips = Array.isArray(bundle.audioClips) ? visit(bundle.audioClips) : [];
  if (unresolved.size) {
    throw new Error(`The bundle references files it does not carry: ${[...unresolved].join(", ")}`);
  }

  const data = { source: basename(bundlePath), story, audioClips };
  writeFileSync(OUT_DATA, JSON.stringify(data));

  // The media index is how the editor knows a public file exists. Index what was written, and any file the edit
  // points at that is in public/ but was never indexed (depth rigs made in the editor, for instance).
  const index = JSON.parse(readFileSync(MEDIA_INDEX, "utf8"));
  const set = new Set(index);
  const before = set.size;
  for (const w of written) set.add(w.path);
  const text = JSON.stringify({ story, audioClips });
  const referenced = text.match(/\/(?:film|img|audio)\/[^"+\s]+?\.(?:jpe?g|png|webp|gif|mp3|wav|ogg|m4a|mp4|webm)/gi) ?? [];
  const indexedNow = [];
  for (const ref of new Set(referenced)) {
    const plain = decodeURI(ref);
    if (set.has(ref) || set.has(plain)) continue;
    if (existsSync(join(PUBLIC, plain))) {
      set.add(plain);
      indexedNow.push(plain);
    }
  }
  if (set.size !== before) writeFileSync(MEDIA_INDEX, `${JSON.stringify([...set].sort(), null, 2)}\n`);

  console.log(`Director's Export from ${relative(ROOT, bundlePath)}`);
  console.log(`  ${story.scenes.length} scenes, ${audioClips.length} sound clips`);
  console.log(`  ${rewrite.size - written.length} embedded files already in public/ (${rewrites} references rewritten)`);
  console.log(`  ${keptIds.length} recreated Uncut plates kept as bundled assets`);
  console.log(`  ${written.length} new files written:`);
  for (const w of written) console.log(`    ${w.path}  (${w.name}, ${(w.bytes / 1024).toFixed(0)} KB)`);
  console.log(`  ${indexedNow.length} files in public/ the edit uses were added to the media index`);
  for (const p of indexedNow) console.log(`    ${p}`);
  console.log(`  -> ${relative(ROOT, OUT_DATA)}`);
}

main();
