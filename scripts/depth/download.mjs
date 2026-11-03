/**
 * Downloading the models (see models.mjs): once, into the cache folder, checked by size and SHA-256.
 *
 * Used by `npm run depth`, `npm run cutouts` and `npm run models` (and so by the editor's buttons). Progress goes to
 * stdout as plain lines (`Downloading <file> (<size>)...`, then `  NN%` every ten percent), which the editor's server reads.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserError, formatBytes } from "./lib.mjs";
import { modelCacheDir } from "./models.mjs";

export async function sha256Of(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

/** In the cache with the right size (a cheap check: no checksum). A file you put there yourself counts. */
export function modelIsCached(spec, dir = modelCacheDir()) {
  try {
    return fs.statSync(path.join(dir, spec.file)).size === spec.bytes;
  } catch {
    return false;
  }
}

/** Downloads spec.url to `file` (through a .part file), refusing anything that is not the pinned size and checksum. */
export async function downloadModel(spec, file, { log = console.log, write = (text) => process.stdout.write(text), isTTY = Boolean(process.stdout.isTTY) } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const part = `${file}.part`;
  log(`Downloading ${spec.file} (${formatBytes(spec.bytes)}). This happens once; it is kept in ${dir}`);
  let response;
  try {
    response = await fetch(spec.url, { redirect: "follow" });
  } catch (error) {
    throw new UserError(`Could not reach the download (${error.cause?.code || error.message}).\nDownload ${spec.url}\nand put the file in ${dir}`);
  }
  if (!response.ok || !response.body) {
    throw new UserError(`The download failed (HTTP ${response.status}).\nDownload ${spec.url}\nand put the file in ${dir}`);
  }
  const hash = crypto.createHash("sha256");
  let received = 0;
  let shown = -1;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      const percent = Math.floor((received / spec.bytes) * 100);
      if (percent !== shown && (isTTY || percent % 10 === 0)) {
        shown = percent;
        write(isTTY ? `\r  ${percent}%  ${formatBytes(received)}` : `  ${percent}%\n`);
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(part));
  } catch (error) {
    fs.rmSync(part, { force: true });
    throw new UserError(`The download was interrupted (${error.message}). Run the command again.`);
  }
  if (isTTY) write("\n");
  if (received !== spec.bytes || hash.digest("hex") !== spec.sha256) {
    fs.rmSync(part, { force: true });
    throw new UserError(
      `The downloaded file is not the expected one (size or checksum differs), so it was thrown away.\nTry again, or download ${spec.url} by hand and put the file in ${dir}`,
    );
  }
  fs.renameSync(part, file);
  fs.writeFileSync(`${file}.ok`, `${spec.sha256}\n`);
}

/** The model file to use: downloaded and checked once, then trusted while its size is unchanged. */
export async function ensureModelFile(spec, { dir = modelCacheDir(), log = console.log, ...rest } = {}) {
  const file = path.join(dir, spec.file);
  if (fs.existsSync(file)) {
    if (fs.statSync(file).size !== spec.bytes) {
      throw new UserError(`${file} is not the expected size (${formatBytes(spec.bytes)}). Delete it and run the command again.`);
    }
    if (!fs.existsSync(`${file}.ok`)) {
      log(`Checking ${spec.file} …`);
      if ((await sha256Of(file)) !== spec.sha256) {
        throw new UserError(`${file} does not match the published checksum. Delete it and run the command again.`);
      }
      fs.writeFileSync(`${file}.ok`, `${spec.sha256}\n`);
      log("ok");
    }
    return file;
  }
  await downloadModel(spec, file, { log, ...rest });
  return file;
}
