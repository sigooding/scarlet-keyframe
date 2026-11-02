#!/usr/bin/env node
/**
 * `npm run check:serve` — end-to-end check of the production server.
 *
 * Run it while `npm run serve` is up. It drives headless Chromium through the
 * things that must keep working on 127.0.0.1:4173: the editor opens, an edit
 * survives Save + reload, film pictures/depth maps/audio (with a Range request)
 * load from the repository's public/ folder, and a 24-frame draft MP4 export
 * through the in-app API produces a one-second file.
 *
 * Browser: the same discovery the MP4 exporter uses — Playwright's Chromium,
 * an installed Chrome or Edge, PLAYWRIGHT_CHROMIUM_PATH, or the bundled Linux
 * Chromium. Node only, so it also runs on Windows.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareChromiumLauncher } from "./chromium-launcher.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BASE_URL = (process.env.SCARLET_KEYFRAME_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const ORIGIN = new URL(BASE_URL).origin;
const EXPORTS_DIR = path.join(REPO_ROOT, "exports");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function ffprobePath() {
  const mod = await import("@ffprobe-installer/ffprobe");
  const info = mod.default ?? mod;
  return typeof info === "object" ? info.path : String(info);
}

const launchBrowser = await prepareChromiumLauncher({ gpu: false });
const browser = await launchBrowser();

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failedRequests = [];
page.on("requestfailed", (request) => failedRequests.push(request.url()));

const waitForEditor = () =>
  page.waitForFunction(() => Boolean(window.__frame24) && window.__frame24.frameIds.length > 100, null, {
    timeout: 180000,
  });

try {
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await waitForEditor();
  record("editor opens", true, `${await page.evaluate(() => window.__frame24.frameIds.length)} frames`);

  const saveTitle = await page.locator('button:has-text("Save")').first().getAttribute("title");
  record("Save button names the origin", Boolean(saveTitle?.includes(ORIGIN)), saveTitle || "");

  // An edit: split a clip at frame 6 of its own clip, with the app's own shortcut.
  const frameId = await page.evaluate(() => window.__frame24.frameIds[30]);
  const clipStart = await page.evaluate((id) => window.__frame24.getFrame(id)?.startFrame, frameId);
  await page.evaluate((id) => window.__frame24.setFrame(id), frameId);
  await page.waitForTimeout(400);
  await page.evaluate((frame) => window.__frame24.setPlayhead(frame), (clipStart ?? 0) + 6);
  await page.waitForTimeout(400);
  const beforeFrames = await page.evaluate(() => window.__frame24.frameIds.length);
  await page.keyboard.press("s");
  await page.waitForTimeout(1200);
  const afterFrames = await page.evaluate(() => window.__frame24.frameIds.length);
  record(
    "edit changes the project",
    afterFrames === beforeFrames + 1,
    `${beforeFrames} → ${afterFrames} (${await page.evaluate(() => window.__frame24.getEditLabel())})`,
  );

  await page.locator('button:has-text("Save")').first().click();
  await page.waitForTimeout(2500);
  const status = (await page.locator(".topbar-save-status").innerText()).trim();
  record("status text names the origin", status.includes(ORIGIN), status);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForEditor();
  const afterReload = await page.evaluate(() => window.__frame24.frameIds.length);
  record("edit survives a reload", afterReload === afterFrames, `${afterReload} frames after reload`);

  const media = await page.evaluate(async () => {
    const picture = await fetch("/film/img/s14a/337-engine-off.jpg");
    const depth = await fetch("/film/depth/s1/02-vending/depth.png");
    const audio = await fetch("/film/audio/baby-fool.mp3", { headers: { Range: "bytes=0-1023" } });
    const bytes = (await audio.arrayBuffer()).byteLength;
    return {
      picture: { status: picture.status, type: picture.headers.get("content-type") },
      depth: { status: depth.status, type: depth.headers.get("content-type") },
      audio: {
        status: audio.status,
        range: audio.headers.get("content-range"),
        type: audio.headers.get("content-type"),
        bytes,
      },
      resolved: window.__frame24.resolveMedia("/film/img/s14a/337-engine-off.jpg"),
    };
  });
  record(
    "film picture loads",
    media.picture.status === 200 && media.picture.type === "image/jpeg",
    `${media.picture.status} ${media.picture.type}`,
  );
  record(
    "depth map loads",
    media.depth.status === 200 && media.depth.type === "image/png",
    `${media.depth.status} ${media.depth.type}`,
  );
  record(
    "mp3 Range request answers 206",
    media.audio.status === 206 && /^bytes 0-1023\//.test(media.audio.range || ""),
    `${media.audio.status} ${media.audio.range} ${media.audio.bytes} bytes`,
  );
  record("the app resolves media locally", media.resolved === "/film/img/s14a/337-engine-off.jpg", String(media.resolved));

  // Draft MP4, 24 frames, through the same endpoint the export dialog uses.
  const exportStartedAt = Date.now();
  await page.click('button:has-text("Export")');
  await page.waitForTimeout(800);
  if (await page.locator('[data-testid="export-tab-mp4"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="export-tab-mp4"]').click();
  }
  await page.locator('[data-testid="export-mode-range"]').click();
  await page.locator('[data-testid="export-from-frame-input"]').fill("0");
  await page.locator('[data-testid="export-to-frame-input"]').fill("23");
  await page.locator('[data-testid="export-quality-draft"]').click();
  await page.selectOption('[data-testid="export-workers-select"]', "1");
  const exportStarted = Date.now();
  await page.locator('[data-testid="export-mp4-render-btn"]').click();
  await page.waitForSelector(
    '[data-testid="export-mp4-progress"][data-status="done"], [data-testid="export-mp4-progress"][data-status="error"]',
    { timeout: 900000 },
  );
  const exportStatus = await page.locator('[data-testid="export-mp4-progress"]').getAttribute("data-status");
  record(
    "in-app MP4 export finishes",
    exportStatus === "done",
    `${exportStatus} in ${((Date.now() - exportStarted) / 1000).toFixed(1)} s`,
  );

  // The exporter reuses a name for the same range, so look for a fresh file.
  const produced = (fs.existsSync(EXPORTS_DIR) ? fs.readdirSync(EXPORTS_DIR) : [])
    .filter((name) => name.endsWith(".mp4"))
    .map((name) => ({ name, mtime: fs.statSync(path.join(EXPORTS_DIR, name)).mtimeMs }))
    .filter((file) => file.mtime >= exportStartedAt)
    .sort((a, b) => b.mtime - a.mtime)
    .map((file) => file.name);
  if (!produced.length) {
    record("exported mp4 exists", false, "no new .mp4 in exports/");
  } else {
    const mp4 = path.join(EXPORTS_DIR, produced[0]);
    const probe = JSON.parse(
      execFileSync(await ffprobePath(), [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_frames:format=duration",
        "-of",
        "json",
        mp4,
      ]).toString(),
    );
    const duration = Number(probe.format?.duration ?? 0);
    const frames = Number(probe.streams?.[0]?.nb_frames ?? 0);
    record(
      "the mp4 is about a second of 24 frames",
      duration > 0.8 && duration < 1.3 && frames === 24,
      `${produced[0]}: ${duration.toFixed(3)} s, ${frames} frames, ${probe.streams?.[0]?.width}x${probe.streams?.[0]?.height}`,
    );
  }

  record("no failed requests", failedRequests.length === 0, `${failedRequests.length} failed`);
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}
