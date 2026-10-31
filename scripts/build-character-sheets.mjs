import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareChromiumLauncher } from "./chromium-launcher.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const refs = JSON.parse(await readFile(path.join(root, "src/data/sweet-jesus-characters.json"), "utf8"));
const destination = path.join(root, "src/assets/sweet-jesus/sweet-jesus-character-sheets.pdf");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const pages = await Promise.all(refs.map(async (ref, index) => {
  const portrait = await readFile(path.join(root, `src/assets/sweet-jesus/portraits/${ref.id}.jpg`));
  const number = String(index + 1).padStart(2, "0");
  return `<section class="sheet">
    <header><span>SWEET JESUS <b>/</b> CHARACTER REFERENCE</span><span>CAST FILE ${number} / ${String(refs.length).padStart(2, "0")}</span></header>
    <div class="title-block"><div class="eyebrow">BROOKLYN, NEW YORK · 1975</div>
      <h1>${escapeHtml(ref.name)}</h1><div class="subtitle">${escapeHtml(ref.role)} <span>·</span> ${escapeHtml(ref.age)}</div>
    </div>
    <div class="main"><div class="portrait"><img src="data:image/jpeg;base64,${portrait.toString("base64")}" alt="${escapeHtml(ref.name)}"></div>
      <div class="notes"><div class="note"><div class="note-label">CHARACTER</div><p>${escapeHtml(ref.summary)}</p></div>
        <div class="note"><div class="note-label">WARDROBE / LOOK</div><p>${escapeHtml(ref.look)}</p></div>
        <div class="note"><div class="note-label">CONTINUITY</div><p>${escapeHtml(ref.continuity)}</p></div>
        <div class="note-small">VOTED CASTING REFERENCE<br>FICTIONAL STORYBOARD DRAFT</div>
      </div></div>
    <footer><span>FRAME / 24</span><span>CHARACTER BIBLE <b>—</b> ${number}</span></footer>
  </section>`;
}));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #292621; }
  .sheet { width: 210mm; height: 297mm; overflow: hidden; break-after: page; background: #f5f1e9; padding: 13mm 14mm 11mm; display: flex; flex-direction: column; }
  .sheet:last-child { break-after: auto; }
  header, footer { display: flex; justify-content: space-between; align-items: center; color: #685e50; font-size: 8px; font-weight: 700; letter-spacing: .16em; }
  header { padding-bottom: 5mm; border-bottom: 1px solid #a99d8b; }
  header b, footer b { color: #9d5138; }
  .title-block { padding: 9mm 0 7mm; }
  .eyebrow, .note-label { font-size: 8px; font-weight: 700; letter-spacing: .19em; color: #a1553d; }
  h1 { font-family: Georgia, serif; font-weight: 400; font-size: 29px; letter-spacing: -.02em; line-height: 1.07; margin: 3mm 0 2mm; }
  .subtitle { color: #635c52; font-size: 11px; font-weight: 600; }
  .subtitle span { padding: 0 2mm; color: #a1553d; }
  .main { display: grid; grid-template-columns: 101mm 1fr; gap: 9mm; flex: 1; min-height: 0; align-items: start; }
  .portrait { height: 177mm; overflow: hidden; background: #b5aa9a; display: flex; align-items: center; justify-content: center; }
  .portrait img { width: 100%; height: 100%; object-fit: contain; }
  .notes { padding-top: 1mm; }
  .note { border-top: 1px solid #cfc5b6; padding: 4mm 0 5mm; }
  .note-label { font-size: 7.5px; }
  p { font-family: Georgia, serif; font-size: 10.5px; line-height: 1.48; margin: 3mm 0 0; color: #37332e; }
  .note-small { border-top: 1px solid #cfc5b6; padding-top: 5mm; color: #82796d; font-size: 7.5px; letter-spacing: .13em; line-height: 1.8; }
  footer { padding-top: 4mm; border-top: 1px solid #a99d8b; }
</style></head><body>${pages.join("")}</body></html>`;

await mkdir(path.dirname(destination), { recursive: true });
const launch = await prepareChromiumLauncher({ gpu: false });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: "load" });
  const failures = await page.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
  if (failures) throw new Error(`${failures} character portraits did not load.`);
  await page.pdf({ path: destination, printBackground: true, preferCSSPageSize: true });
  if (process.argv.includes("--preview")) {
    const screenshots = path.join(root, "screenshots");
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "character-sheet-preview.png") });
  }
  console.log(`Wrote ${refs.length} printable character sheets to ${path.relative(root, destination)}.`);
} finally {
  await browser.close();
}
