import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareChromiumLauncher } from "./chromium-launcher.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const film = await readJson("src/data/sweet-jesus-film.json");
const opening = await readJson("src/data/sweet-jesus-opening.json");
const scene = film.scenes.find((entry) => entry.id === opening.sceneId);
if (!scene) throw new Error("Opening scene not found in compiled screenplay.");
const shotsByBeat = new Map(opening.shots.flatMap((shot) => shot.beats.map((id) => [id, shot])));
const images = new Map(await Promise.all(opening.shots.map(async (shot) => {
  const bytes = await readFile(path.join(root, `src/assets/sweet-jesus/opening/${shot.preview}`));
  return [shot.id, `data:image/jpeg;base64,${bytes.toString("base64")}`];
})));
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const cards = scene.dialogueBeats.map((beat, index) => {
  const shot = shotsByBeat.get(beat.id);
  if (!shot) throw new Error(`No opening reference for ${beat.id}.`);
  const cues = (beat.captions || []).map((cue) => cue.text.replace(/\s+/g, " ")).join(" ");
  const content = beat.text ? cues : beat.shotDescription;
  const sound = !beat.text && cues ? `<p class="sound">CC: ${escape(cues)}</p>` : "";
  return `<article class="card"><div class="picture"><img src="${images.get(shot.id)}" alt="${escape(shot.label)}"></div>
    <div class="copy"><span class="number">FRAME ${String(index + 1).padStart(2, "0")} / ${scene.dialogueBeats.length}</span>
      <h2>${escape(shot.label)}</h2><p>${escape(content)}</p>${sound}</div></article>`;
});
const pages = [];
for (let i = 0; i < cards.length; i += 4) {
  const number = Math.floor(i / 4) + 1;
  pages.push(`<section class="sheet"><header><span><b>SWEET JESUS</b> / OPENING STORYBOARD</span><span>SUNNY'S WASH-N-DRY · ${String(number).padStart(2, "0")} / ${String(Math.ceil(cards.length / 4)).padStart(2, "0")}</span></header>
    <div class="heading"><h1>Thursday afternoon</h1><span>22 EDITABLE BEATS · 16:9 REFERENCE STILLS</span></div>
    <div class="cards">${cards.slice(i, i + 4).join("")}</div>
    <footer><span>FRAME / 24 · PICTURE REFERENCES REPEAT ACROSS BEATS</span><span>SCREENPLAY GOVERNS ACTION · NO DIALOGUE OR SFX AUDIO GENERATED</span></footer>
  </section>`);
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 13.333333in 7.5in; margin: 0; } * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; } body { font-family: Arial, sans-serif; color: #292921; }
  .sheet { width: 1280px; height: 720px; padding: 30px 40px 24px; background: #f1eee4; display: flex; flex-direction: column; break-after: page; overflow: hidden; }
  .sheet:last-child { break-after: auto; }
  header, footer { display: flex; justify-content: space-between; align-items: center; color: #706c61; font-size: 10px; font-weight: bold; letter-spacing: .14em; }
  header { border-bottom: 1px solid #aaa696; padding-bottom: 14px; } header b { color: #a55339; }
  .heading { display: flex; justify-content: space-between; align-items: baseline; padding: 19px 0 16px; }
  h1 { margin: 0; font: 400 30px/1 Georgia, serif; } .heading span { color: #a05a41; font-size: 10px; font-weight: bold; letter-spacing: .13em; }
  .cards { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 16px 22px; }
  .card { display: grid; grid-template-columns: 54% 1fr; gap: 14px; padding: 10px; background: #e6e2d7; min-width: 0; min-height: 0; }
  .picture { align-self: start; background: #151510; aspect-ratio: 16/9; overflow: hidden; }
  .picture img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .copy { min-width: 0; overflow: hidden; padding-top: 2px; }
  .number { color: #a05a41; font-weight: bold; font-size: 9px; letter-spacing: .1em; }
  h2 { margin: 7px 0 8px; font: 400 17px/1.1 Georgia, serif; }
  .copy p { margin: 0 0 8px; font-size: 12px; line-height: 1.4; white-space: normal; }
  .copy .sound { color: #6d594c; font-size: 11px; }
  footer { border-top: 1px solid #aaa696; padding-top: 12px; margin-top: 14px; font-size: 9px; }
</style></head><body>${pages.join("")}</body></html>`;
const destination = path.join(root, "src/assets/sweet-jesus/sweet-jesus-opening-storyboard.pdf");
await mkdir(path.dirname(destination), { recursive: true });
const launch = await prepareChromiumLauncher({ gpu: false });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: "load" });
  const failures = await page.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
  if (failures) throw new Error(`${failures} opening storyboard pictures did not load.`);
  const overflow = await page.locator(".copy").evaluateAll((nodes) => nodes.filter((node) => node.scrollHeight > node.clientHeight).length);
  if (overflow) throw new Error(`${overflow} opening storyboard descriptions overflow their cards.`);
  await page.pdf({ path: destination, printBackground: true, preferCSSPageSize: true });
  if (process.argv.includes("--preview")) {
    await mkdir(path.join(root, "screenshots"), { recursive: true });
    await page.screenshot({ path: path.join(root, "screenshots/opening-storyboard-preview.png") });
  }
  console.log(`Wrote ${cards.length} beats on ${pages.length} landscape storyboard pages to ${path.relative(root, destination)}.`);
} finally { await browser.close(); }
