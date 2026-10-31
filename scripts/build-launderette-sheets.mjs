import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareChromiumLauncher } from "./chromium-launcher.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const refs = JSON.parse(await readFile(path.join(root, "src/data/sweet-jesus-launderette.json"), "utf8"));
const destination = path.join(root, "src/assets/sweet-jesus/sweet-jesus-launderette-sheets.pdf");
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

const pages = await Promise.all(refs.map(async (ref, index) => {
  const ext = ref.id === "cassette-with-mic" ? "png" : "jpg";
  const bytes = await readFile(path.join(root, `src/assets/sweet-jesus/launderette/${ref.id}.${ext}`));
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  return `<section class="sheet">
    <header><span><b>SWEET JESUS</b> / PRODUCTION DESIGN</span><span>LOCATION FILE ${String(index + 1).padStart(2, "0")} / ${String(refs.length).padStart(2, "0")}</span></header>
    <div class="heading"><div><span class="eyebrow">${escape(ref.kicker)}</span><h1>${escape(ref.title)}</h1></div><p>${escape(ref.subtitle)}</p></div>
    <div class="main"><figure class="${ext === "png" ? "prop" : ""}"><img src="data:${mime};base64,${bytes.toString("base64")}" alt="${escape(ref.alt)}"><figcaption>SELECTED REFERENCE ${String(index + 1).padStart(2, "0")}</figcaption></figure>
      <aside><div class="note"><h2>THE LOOK</h2><p>${escape(ref.summary)}</p></div><div class="note"><h2>DESIGN / STAGING</h2><p>${escape(ref.design)}</p></div><div class="note"><h2>CONTINUITY LOCK</h2><p>${escape(ref.continuity)}</p></div></aside>
    </div>
    <footer><span>FRAME / 24 <b>—</b> SUNNY'S WASH-N-DRY</span><span>REFERENCE IMAGES ARE INDICATIVE · SCREENPLAY GOVERNS ACTION</span><span>16:9 · 1975</span></footer>
  </section>`;
}));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 13.333333in 7.5in; margin: 0; }
  * { box-sizing: border-box; } html, body { margin: 0; padding: 0; }
  body { color: #292921; font-family: Arial, sans-serif; }
  .sheet { width: 1280px; height: 720px; padding: 32px 42px 25px; display: flex; flex-direction: column; overflow: hidden; background: #f1eee4; break-after: page; }
  .sheet:last-child { break-after: auto; }
  header, footer { display: flex; justify-content: space-between; align-items: center; color: #6a675c; font-size: 10px; font-weight: 700; letter-spacing: .16em; }
  header { flex-shrink: 0; border-bottom: 1px solid #aaa696; padding-bottom: 15px; }
  header b, footer b { color: #a55339; }
  .heading { display: flex; justify-content: space-between; align-items: end; flex-shrink: 0; padding: 23px 0 20px; }
  .eyebrow, h2 { color: #a05a41; font-size: 10px; font-weight: 700; letter-spacing: .18em; }
  h1 { margin: 6px 0 0; font: 400 36px/1.05 Georgia, serif; letter-spacing: -.025em; }
  .heading p { margin: 0 0 3px; color: #716b5f; font-size: 13px; font-weight: 600; }
  .main { display: grid; grid-template-columns: minmax(0, 765px) minmax(0, 1fr); gap: 38px; flex: 1; min-height: 0; }
  figure { position: relative; margin: 0; width: 100%; aspect-ratio: 16/9; background: #252820; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  figure.prop { background: #dbd8cc; }
  figure img { display: block; max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
  figure.prop img { width: 92%; height: 76%; }
  figcaption { position: absolute; bottom: 12px; left: 13px; padding: 6px 8px; color: #f6f1e6; background: rgba(28,29,24,.8); font-size: 9px; font-weight: bold; letter-spacing: .13em; }
  aside { padding-top: 0; } .note { border-top: 1px solid #c7c2b3; padding: 13px 0 16px; }
  h2 { font-size: 10px; margin: 0 0 9px; }
  .note p { margin: 0; color: #3d3d35; font: 15px/1.5 Georgia, serif; }
  footer { padding-top: 13px; border-top: 1px solid #aaa696; font-size: 9px; }
</style></head><body>${pages.join("")}</body></html>`;

await mkdir(path.dirname(destination), { recursive: true });
const launch = await prepareChromiumLauncher({ gpu: false });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: "load" });
  const failures = await page.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
  if (failures) throw new Error(`${failures} launderette references did not load.`);
  const overflow = await page.locator(".sheet").evaluateAll((sheets) => sheets.filter((sheet) => {
    const lastNote = sheet.querySelector(".note:last-child");
    const footer = sheet.querySelector("footer");
    return lastNote && footer && lastNote.getBoundingClientRect().bottom > footer.getBoundingClientRect().top;
  }).length);
  if (overflow) throw new Error(`${overflow} launderette style sheets overflow their notes.`);
  await page.pdf({ path: destination, printBackground: true, preferCSSPageSize: true });
  if (process.argv.includes("--preview")) {
    await mkdir(path.join(root, "screenshots"), { recursive: true });
    await page.screenshot({ path: path.join(root, "screenshots/launderette-sheet-preview.png") });
  }
  console.log(`Wrote ${refs.length} landscape 16:9 style sheets to ${path.relative(root, destination)}.`);
} finally { await browser.close(); }
