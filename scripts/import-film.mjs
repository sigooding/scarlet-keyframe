#!/usr/bin/env node
// Imports Nobody's Witness from a Scarlet Reel checkout (sigooding/scarlett-witness) into this app, so the film is
// built into it and opens with no server, from any folder:
//
//   npm run import:film                         # from ../scarlett-witness
//   npm run import:film -- /path/to/scarlett-witness
//
// Writes:
//   src/data/nobodys-witness-film.json  the compiled film (src/data/nobodysWitnessFilm.ts there), as JSON
//   src/data/studio-edits.json          src/film/studio-edits.json there, byte for byte (the music beat-sync comes from it)
//   src/data/media-index.json           indexed media paths available from sigooding/scarlett-witness/public
//   src/data/audio-durations.json       measured durations (seconds) of voice/music/sfx audio files in public
//   public/examples/media-index.json    same media index for runtime fetch compatibility
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA_EXT_RE = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp3|wav|ogg|m4a|aac|flac|mp4|webm)$/i;
const AUDIO_PARSE_EXT_RE = /\.(?:mp3|wav)$/i;

function readAudioDurationSeconds(filePath) {
  if (!existsSync(filePath)) return undefined;
  const buf = readFileSync(filePath);
  if (buf.length < 16) return undefined;
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === "fmt " && size >= 16) byteRate = buf.readUInt32LE(offset + 12);
      else if (id === "data") {
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    return byteRate > 0 && dataSize > 0 ? Math.round((dataSize / byteRate) * 1000) / 1000 : undefined;
  }
  let pos = 0;
  if (buf.toString("ascii", 0, 3) === "ID3" && buf.length >= 10) {
    pos =
      10 +
      (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  const br1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const br2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const srs = [44100, 48000, 32000, 0];
  let totalSamples = 0;
  let sampleRate = 0;
  let frames = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++;
      continue;
    }
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const v = (b1 >> 3) & 3;
    const l = (b1 >> 1) & 3;
    const bi = (b2 >> 4) & 0xf;
    const si = (b2 >> 2) & 3;
    const pad = (b2 >> 1) & 1;
    if (v === 1 || l !== 1 || bi === 0 || bi === 15 || si === 3) {
      pos++;
      continue;
    }
    const isV1 = v === 3;
    const sr = isV1 ? srs[si] : v === 2 ? srs[si] / 2 : srs[si] / 4;
    const kbps = isV1 ? br1[bi] : br2[bi];
    const spf = isV1 ? 1152 : 576;
    const fl = Math.floor(((spf / 8) * kbps * 1000) / sr) + pad;
    if (fl < 24 || pos + fl > buf.length + 4) {
      pos++;
      continue;
    }
    sampleRate = sr;
    totalSamples += spf;
    frames++;
    pos += fl;
  }
  return frames > 0 && sampleRate > 0 ? Math.round((totalSamples / sampleRate) * 1000) / 1000 : undefined;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? join(root, "..", "scarlett-witness"));
const filmModule = join(source, "src/data/nobodysWitnessFilm.ts");
const editsFile = join(source, "src/film/studio-edits.json");
for (const file of [filmModule, editsFile]) {
  if (!existsSync(file)) {
    console.error(`import-film: ${file} not found. Pass the path to a sigooding/scarlett-witness checkout.`);
    process.exit(1);
  }
}

const text = readFileSync(filmModule, "utf8");
const start = text.indexOf("= {");
const end = text.lastIndexOf("} as unknown as Story");
if (start < 0 || end <= start) {
  console.error(`import-film: ${filmModule} is not the generated film module this script expects.`);
  process.exit(1);
}
const film = JSON.parse(text.slice(start + 2, end + 1));
if (!Array.isArray(film.scenes) || !film.startSceneId) {
  console.error("import-film: the film has no scenes or no startSceneId.");
  process.exit(1);
}
writeFileSync(join(root, "src/data/nobodys-witness-film.json"), JSON.stringify(film));
writeFileSync(join(root, "src/data/studio-edits.json"), readFileSync(editsFile));

const mediaSet = new Set();
const durations = {};

const walkPublic = (baseDir, dir) => {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      walkPublic(baseDir, fullPath);
    } else if (MEDIA_EXT_RE.test(name)) {
      const rel = `/${relative(baseDir, fullPath).split("\\").join("/")}`;
      mediaSet.add(rel);
      if (AUDIO_PARSE_EXT_RE.test(name)) {
        const sec = readAudioDurationSeconds(fullPath);
        if (sec && sec > 0) durations[rel] = sec;
      }
    }
  }
};

const sourcePublic = join(source, "public");
if (existsSync(sourcePublic)) walkPublic(sourcePublic, sourcePublic);
if (existsSync(join(root, "public/film"))) walkPublic(join(root, "public"), join(root, "public/film"));

const sortedMedia = [...mediaSet].sort();
writeFileSync(join(root, "src/data/media-index.json"), JSON.stringify(sortedMedia));
writeFileSync(join(root, "public/examples/media-index.json"), JSON.stringify(sortedMedia));
writeFileSync(join(root, "src/data/audio-durations.json"), JSON.stringify(durations));

const beats = film.scenes.reduce((sum, scene) => sum + (scene.dialogueBeats?.length ?? 0), 0);
console.log(
  `import-film: "${film.title}" from ${source}: ${film.scenes.length} scene nodes, ${beats} beats; ${sortedMedia.length} media files indexed (${Object.keys(durations).length} audio durations)`,
);
