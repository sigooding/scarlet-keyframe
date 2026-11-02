#!/usr/bin/env node
/**
 * `npm run check:thumbs` — verifies the thumbnails in a real browser.
 *
 * Run it while `npm run serve` (or `npm run dev`) is up. It checks that
 *
 *  1. the first screen's list pictures (timeline lanes) are `/thumbs/…` and
 *     together stay under 1.5 MB,
 *  2. the viewer still asks for the original picture of the current frame,
 *  3. scrolling the timeline across scenes 1-20 only asks for thumbnails, and
 *     reports the bytes,
 *  4. with `public/thumbs/` moved away the editor still shows every picture —
 *     from the originals — with no failed requests.
 *
 * The folder is put back before the script exits. Browser discovery is the
 * same as the MP4 exporter (Playwright Chromium, Chrome, Edge, or
 * PLAYWRIGHT_CHROMIUM_PATH). Node only, so it also runs on Windows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareChromiumLauncher } from "./chromium-launcher.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BASE_URL = (process.env.SCARLET_KEYFRAME_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const THUMBS_DIR = path.join(REPO_ROOT, "public", "thumbs");
const PARKED_DIR = path.join(REPO_ROOT, "public", ".thumbs-check-parked");
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif|bmp)$/i;
const LIST_SELECTOR =
  ".timeline-clip-thumb, .depth-lane-thumb, .cutout-alpha-thumb, .media-bin-tile-thumb, .asset-thumb, .media-bin-hover-preview";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

const launchBrowser = await prepareChromiumLauncher({ gpu: false });

/**
 * A page that records every picture the server sent, plus every picture element
 * it ever showed inside a list (virtualised rows disappear on scroll, so the
 * sets accumulate rather than being read once).
 */
async function openEditor() {
  // A browser per phase: decoding a few hundred pictures in one renderer is
  // what a real session does, but two of them at once need more RAM than most
  // machines spare for a check.
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((selector) => {
    const audit = { list: new Set(), viewer: new Set() };
    window.__thumbAudit = { list: [], viewer: [] };
    const scan = () => {
      for (const element of document.querySelectorAll("img, video")) {
        const raw = element.getAttribute("src") || "";
        if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) continue;
        let pathname = raw;
        try {
          pathname = new URL(raw, window.location.href).pathname;
        } catch {
          /* keep raw */
        }
        (element.closest(selector) ? audit.list : audit.viewer).add(pathname);
      }
      window.__thumbAudit.list = [...audit.list];
      window.__thumbAudit.viewer = [...audit.viewer];
    };
    scan();
    setInterval(scan, 200);
  }, LIST_SELECTOR);

  const pictures = new Map(); // pathname -> bytes the server sent
  page.on("response", (response) => {
    if (response.request().resourceType() !== "image") return;
    const pathname = new URL(response.url()).pathname;
    if (!IMAGE_EXT.test(pathname) || pictures.has(pathname)) return;
    pictures.set(pathname, Number(response.headers()["content-length"] || 0));
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__frame24) && window.__frame24.frameIds.length > 100, null, {
    timeout: 180000,
  });
  return { browser, context, page, pictures };
}

const sumBytes = (entries) => entries.reduce((total, [, bytes]) => total + bytes, 0);

const isThumb = (pathname) => pathname.startsWith("/thumbs/");

/**
 * Runs in the page: how many resources answered 4xx/5xx. The browser's own
 * /favicon.ico request is not the editor's (the page ships no icon file), so it
 * is not counted.
 */
function countFailedResources() {
  return performance
    .getEntriesByType("resource")
    .filter((entry) => entry.responseStatus >= 400 && !/\/favicon\.ico(?:$|\?)/.test(entry.name)).length;
}

try {
  // ---------------------------------------------------------------- first screen
  let firstScreenListBytes = 0;
  {
    const { browser, context, page, pictures } = await openEditor();
    await page.waitForTimeout(6000);
    const list = new Set(await page.evaluate(() => window.__thumbAudit.list));
    const listPictures = [...pictures].filter(([pathname]) => list.has(pathname));
    const listBytes = sumBytes(listPictures);
    firstScreenListBytes = listBytes;
    const notThumbs = listPictures.filter(([pathname]) => !isThumb(pathname)).map(([pathname]) => pathname);
    check(
      "first screen: list pictures are thumbnails",
      listPictures.length > 0 && notThumbs.length === 0,
      `${listPictures.length} list pictures${notThumbs.length ? `, originals: ${notThumbs.slice(0, 3).join(", ")}` : ""}`,
    );
    check("first screen: list pictures stay under 1.5 MB", listBytes > 0 && listBytes < 1.5 * 1048576, mb(listBytes));
    console.log(`      first screen pictures: ${pictures.size}, ${mb(sumBytes([...pictures]))} in total (the viewer's own picture included)`);

    // ------------------------------------------------------------ the viewer
    const currentSource = await page.evaluate(() => {
      const api = window.__frame24;
      const frameId = api.getSelectedIds()[0] || api.frameIds[0];
      const frame = api.getFrame(frameId);
      const ref = frame?.picture || frame?.beat?.picture;
      return { ref: ref || "", resolved: ref ? api.resolveMedia(ref) || "" : "" };
    });
    const originalPath = currentSource.resolved ? new URL(currentSource.resolved, BASE_URL).pathname : "";
    check("viewer resolves the selected picture", Boolean(originalPath), originalPath || "(no picture on this frame)");
    check("viewer uses the original, not a thumbnail", Boolean(originalPath) && !isThumb(originalPath), originalPath);
    check(
      "the viewer's picture was requested as the original",
      Boolean(originalPath) && pictures.has(originalPath) && originalPath !== "",
      originalPath,
    );
    const viewerPaths = new Set(await page.evaluate(() => window.__thumbAudit.viewer));
    const viewerThumbs = [...viewerPaths].filter(isThumb);
    check(
      "nothing outside the lists asks for a thumbnail",
      viewerThumbs.length === 0,
      `${viewerPaths.size} viewer pictures${viewerThumbs.length ? `, ${viewerThumbs.slice(0, 3).join(", ")}` : ""}`,
    );

    // ------------------------------------------------------- scroll scenes 1-20
    const sceneIds = await page.evaluate(() => {
      const api = window.__frame24;
      const seen = new Map();
      for (let i = 0; i < api.frameIds.length; i += 1) {
        const frame = api.getFrame(api.frameIds[i]);
        const sceneId = frame && (frame.sceneId ?? frame.beat?.sceneId);
        if (sceneId && !seen.has(sceneId)) seen.set(sceneId, api.frameIds[i]);
      }
      return [...seen.entries()].slice(0, 20).map(([, id]) => id);
    });
    const before = new Set(pictures.keys());
    for (const frameId of sceneIds) {
      await page.evaluate((id) => window.__frame24.setFrame(id), frameId);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(2500);
    const listNow = new Set(await page.evaluate(() => window.__thumbAudit.list));
    const scrollPictures = [...pictures].filter(([pathname]) => !before.has(pathname));
    const scrollLists = scrollPictures.filter(([pathname]) => listNow.has(pathname));
    const scrollOriginals = scrollLists.filter(([pathname]) => !isThumb(pathname)).map(([pathname]) => pathname);
    check(
      `scroll scenes 1-${sceneIds.length}: list pictures are thumbnails`,
      scrollLists.length > 0 && scrollOriginals.length === 0,
      `${scrollLists.length} thumbnails, ${mb(sumBytes(scrollLists))}${scrollOriginals.length ? `, originals: ${scrollOriginals.slice(0, 3).join(", ")}` : ""}`,
    );
    console.log(
      `      scroll: ${scrollPictures.length} pictures, ${mb(sumBytes(scrollPictures))} in total ` +
        `(viewer/preload ${scrollPictures.length - scrollLists.length}, ${mb(sumBytes(scrollPictures) - sumBytes(scrollLists))})`,
    );

    // ------------------------------------------------- media bin tiles and hover
    await page.locator('[data-testid="media-bin-toggle"]').dispatchEvent("click");
    await page.waitForTimeout(2000);
    const tileSources = await page.evaluate(() =>
      [...document.querySelectorAll(".media-bin-tile-thumb img")].map((img) => img.getAttribute("src") || ""),
    );
    check(
      "media bin tiles are thumbnails",
      tileSources.length > 0 && tileSources.every((src) => src.startsWith("/thumbs/")),
      `${tileSources.length} tiles`,
    );
    const tiles = await page.$$("[data-testid^='media-bin-item-']");
    if (tiles.length) {
      await tiles[0].hover();
      await page.waitForTimeout(1500);
      const hoverSrc = await page.evaluate(
        () => document.querySelector(".media-bin-hover-preview img")?.getAttribute("src") || "",
      );
      check(
        "media bin hover preview stays the original",
        Boolean(hoverSrc) && !hoverSrc.startsWith("/thumbs/"),
        hoverSrc.slice(0, 90) || "(no hover preview)",
      );
    }
    const failures = await page.evaluate(countFailedResources);
    check("no failed picture requests", failures === 0, `${failures} failures`);
    await context.close();
    await browser.close();
  }

  // ------------------------------------------------- no thumbnails at all
  if (fs.existsSync(THUMBS_DIR)) {
    fs.renameSync(THUMBS_DIR, PARKED_DIR);
    try {
      const { browser, context, page, pictures } = await openEditor();
      await page.waitForTimeout(4000);
      const list = new Set(await page.evaluate(() => window.__thumbAudit.list));
      const listPictures = [...pictures].filter(([pathname]) => list.has(pathname));
      const thumbs = [...pictures.keys()].filter(isThumb);
      check("without public/thumbs/ nothing asks for a thumbnail", thumbs.length === 0, `${thumbs.length} requests`);
      check(
        "without public/thumbs/ every list picture still shows (from the original)",
        listPictures.length > 0 && listPictures.every(([pathname]) => !isThumb(pathname)),
        `${listPictures.length} originals, ${mb(sumBytes(listPictures))}`,
      );
      const failures = await page.evaluate(countFailedResources);
      check("without public/thumbs/ there is no 404 spam", failures === 0, `${failures} failures`);
      await context.close();
      await browser.close();
    } finally {
      fs.renameSync(PARKED_DIR, THUMBS_DIR);
    }
  } else {
    console.log("SKIP  public/thumbs/ does not exist; run `npm run thumbs` first to check the thumbnails");
  }
} finally {
  if (fs.existsSync(PARKED_DIR) && !fs.existsSync(THUMBS_DIR)) fs.renameSync(PARKED_DIR, THUMBS_DIR);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}
