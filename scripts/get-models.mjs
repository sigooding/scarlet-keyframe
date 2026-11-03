#!/usr/bin/env node
/**
 * `npm run models` — the models the depth and cut-out buttons use: what is on this computer, and downloading the rest.
 *
 *   npm run models                       list every model: what it is for, size, licence, on this computer or not
 *   npm run models -- best               download what "best" needs (the largest models; Depth Anything Large is non-commercial)
 *   npm run models -- fast               download what "fast" needs (small, permissively licensed)
 *   npm run models -- matte-best people  download these (ids from the list)
 *   --json                               end with one line  @@result {...}  that a program can read (the editor's Download
 *                                        buttons do)
 *
 * A model is downloaded once into a cache folder outside the repository (SCARLET_KEYFRAME_MODELS changes it) and checked
 * against its pinned size and SHA-256. You may download one yourself and put it there under its file name.
 */
import fs from "node:fs";
import { ensureModelFile, modelIsCached } from "./depth/download.mjs";
import { RESULT_MARKER, UserError, formatBytes } from "./depth/lib.mjs";
import { ALL_MODELS, QUALITIES, modelCacheDir, modelIdsFor } from "./depth/models.mjs";

const JSON_MODE = process.argv.slice(2).includes("--json");

function emit(result) {
  if (JSON_MODE) console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
}

function fail(message, code = 1) {
  console.error(`\n${message}\n`);
  emit({ ok: false, message: String(message).trim() });
  process.exit(code);
}

function listing() {
  const dir = modelCacheDir();
  return Object.entries(ALL_MODELS).map(([id, spec]) => ({
    id,
    role: spec.role,
    title: spec.title,
    file: spec.file,
    bytes: spec.bytes,
    license: spec.license,
    source: spec.source,
    cached: modelIsCached(spec, dir),
  }));
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--json");
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run models [-- best | fast | <model id> ...] [--json]\nIds: " + Object.keys(ALL_MODELS).join(", "));
    return 0;
  }
  const unknownFlag = args.find((arg) => arg.startsWith("-"));
  if (unknownFlag) throw new UserError(`Unknown option ${unknownFlag}. Try: npm run models -- --help`);

  const ids = [];
  for (const arg of args) {
    if (QUALITIES[arg]) ids.push(...modelIdsFor(arg, "cutouts"));
    else if (ALL_MODELS[arg]) ids.push(arg);
    else throw new UserError(`Unknown model "${arg}". Ids: ${Object.keys(ALL_MODELS).join(", ")}; or best, fast.`);
  }
  const wanted = [...new Set(ids)];

  if (wanted.length === 0) {
    const rows = listing();
    for (const row of rows) {
      console.log(`${row.id.padEnd(12)} ${row.role.padEnd(8)} ${formatBytes(row.bytes).padStart(9)}  ${row.license.padEnd(30)} ${row.cached ? "on this computer" : "not downloaded"}  ${row.title}`);
    }
    console.log(`\nKept in ${modelCacheDir()}\nDownload with: npm run models -- best   (or fast, or ids from above)`);
    emit({ ok: true, models: rows, dir: modelCacheDir() });
    return 0;
  }

  const done = [];
  for (const id of wanted) {
    const spec = ALL_MODELS[id];
    const file = await ensureModelFile(spec);
    done.push({ id, file, bytes: fs.statSync(file).size });
    console.log(`${id}: ${spec.title} is on this computer`);
  }
  emit({ ok: true, models: done });
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof UserError) fail(error.message, 1);
    fail(error instanceof Error ? error.stack || error.message : String(error), 2);
  });
