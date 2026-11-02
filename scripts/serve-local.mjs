#!/usr/bin/env node
/**
 * `npm run serve` — run the app the way it is meant to be used.
 *
 * Builds a normal, multi-file production build into `dist-local/` (no single
 * file, `public/` served from the repository rather than copied) and serves it
 * with `vite preview` on 127.0.0.1:4173. The MP4 export API runs on that
 * server too, so Export > MP4 works from the production build.
 *
 * Node only — no shell commands — so this works on Windows.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MODE = "serve";
const HOST = process.env.SCARLET_KEYFRAME_HOST?.trim() || "127.0.0.1";
const PORT = 4173;
const OUT_DIR = path.join(REPO_ROOT, "dist-local");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  npm run serve [-- --no-build]

Builds the production app into dist-local/ and serves it at http://${HOST}:${PORT}.
The port is fixed: browser saves (IndexedDB) belong to one address, so the app
must not move to another port.

Options:
  --no-build   Serve the existing dist-local/ without rebuilding
  --help       Show this help
`);
  process.exit(0);
}

const skipBuild = args.includes("--no-build");

/** Resolves true when nothing is listening on host:port. */
function isPortFree(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") resolve(false);
      else resolve(false);
    });
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exitCode = 1;
}

function directorySize(dir) {
  let total = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return total;
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${bytes} B`;
}

const portFree = await isPortFree(HOST, PORT);
if (!portFree) {
  fail(
    [
      `Port ${PORT} is already in use, so the app cannot start.`,
      `Scarlet Keyframe always serves the production build on http://${HOST}:${PORT}.`,
      "Your saves live in this browser at that exact address, so the app refuses to move to",
      "another port (it would open an empty project).",
      "",
      `Close whatever is using port ${PORT} — usually another \`npm run serve\`, or`,
      `\`npm run preview\` — then run \`npm run serve\` again.`,
    ].join("\n"),
  );
  process.exit(1);
}

if (!skipBuild) {
  console.log(`Building the production app into ${path.relative(REPO_ROOT, OUT_DIR)}${path.sep} …`);
  const startedAt = Date.now();
  try {
    await build({ root: REPO_ROOT, mode: MODE, logLevel: "info" });
  } catch (error) {
    fail(`The production build failed.\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const seconds = (Date.now() - startedAt) / 1000;
  const bytes = directorySize(OUT_DIR);
  console.log(
    `Build finished in ${seconds.toFixed(1)} s — ${path.relative(REPO_ROOT, OUT_DIR)}${path.sep} is ${formatBytes(bytes)} ` +
      `(public/ is served from the repository, not copied).`,
  );
} else if (!fs.existsSync(path.join(OUT_DIR, "index.html"))) {
  fail(
    `There is no build in ${path.relative(REPO_ROOT, OUT_DIR)}${path.sep} yet. Run \`npm run serve\` without --no-build first.`,
  );
  process.exit(1);
}

let server;
try {
  server = await preview({
    root: REPO_ROOT,
    mode: MODE,
    logLevel: "info",
    preview: { host: HOST, port: PORT, strictPort: true },
  });
} catch (error) {
  fail(
    [
      `Could not start the preview server on port ${PORT}.`,
      error instanceof Error ? error.message : String(error),
    ].join("\n"),
  );
  process.exit(1);
}

console.log("");
console.log(`  Scarlet Keyframe — production build`);
console.log(`  http://${HOST}:${PORT}`);
console.log("");
console.log(`  Saves live in this browser at ${`http://${HOST}:${PORT}`}.`);
console.log(`  Back up real work with Export > Portable Bundle (.reel.json).`);
console.log(`  Press Ctrl+C to stop.`);
console.log("");

const shutdown = () => {
  void Promise.resolve(server.httpServer?.close()).finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
