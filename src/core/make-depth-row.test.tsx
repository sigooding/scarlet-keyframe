import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_MODELS, QUALITIES } from "../../scripts/depth/models.mjs";
import { MakeCutoutsRow } from "../components/MakeCutoutsRow";
import { DepthToolsForShot, MakeDepthMapRow, type DepthMakerBinding } from "../components/MakeDepthMapRow";
import { ModelsPanel } from "../components/ModelsPanel";
import type { DepthReady, ModelStatus } from "./depthApiTypes";
import { cutoutsRowView, modelsPanelView, type CutoutsRowView, type DepthMakerJob, type DepthMakerState, type DepthRowView, type ModelDownload } from "./depthMaker";

const noop = () => {};

const buttonTag = (html: string, testId: string) => new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "";
const detailsTag = (html: string) => /<details[^>]*>/.exec(html)?.[0] ?? "";

// ---- fixtures: the real model registry, as the server would list it ---------------------------------------------------

const BEST = ["people", "matte-best", "inpaint", "depth-large"];

function ready(options: { here?: string[]; patch?: Record<string, Partial<ModelStatus>> } & Partial<Omit<DepthReady, "models">> = {}): DepthReady {
  const { here = [], patch = {}, ...rest } = options;
  return {
    ok: true,
    python: ".depth-venv",
    packages: true,
    gpu: false,
    models: Object.entries(ALL_MODELS).map(([id, spec]) => ({
      id,
      role: spec.role,
      title: spec.title,
      file: spec.file,
      bytes: spec.bytes,
      license: spec.license,
      source: spec.source,
      url: spec.url,
      note: spec.note,
      nonCommercial: /non-commercial/i.test(spec.license),
      cached: here.includes(id),
      overridden: false,
      ...patch[id],
    })),
    modelsDir: "/home/me/.cache/scarlet-keyframe/models",
    qualities: QUALITIES,
    defaultQuality: "best",
    busy: null,
    ...rest,
  };
}

const idle = (r: DepthReady | "unavailable" | null = ready(), extra: Partial<DepthMakerState> = {}): DepthMakerState => ({ ready: r, quality: "best", job: null, download: null, ...extra });

const job = (extra: Partial<DepthMakerJob> = {}): DepthMakerJob => ({
  kind: "cutouts",
  frameId: "f1",
  picture: "/film/img/s1/pic.jpg",
  status: "running",
  id: "job-1",
  percent: null,
  step: null,
  current: null,
  log: [],
  message: null,
  result: null,
  existing: false,
  startedAt: Date.now() - 12_000,
  applied: false,
  note: null,
  caution: null,
  ...extra,
});

const download = (extra: Partial<ModelDownload> = {}): ModelDownload => ({
  status: "running",
  id: "dl-1",
  ids: ["matte-best"],
  percent: 45,
  current: "Downloading BiRefNet general (full) (once)",
  message: null,
  startedAt: Date.now() - 5_000,
  ...extra,
});

const FOLDER = "/film/depth/s1/pic/people-1";
const madeResult = {
  ok: true,
  written: true,
  folder: FOLDER,
  depthMap: `${FOLDER}/depth.png`,
  plate: `${FOLDER}/plate.jpg`,
  review: `${FOLDER}/review.jpg`,
  cutouts: [
    { image: `${FOLDER}/cutout-1.png`, depth: 0.62, box: [100, 80, 400, 900] as [number, number, number, number], how: "feet" as const },
    { image: `${FOLDER}/cutout-2.png`, depth: 0.4, box: [700, 120, 300, 800] as [number, number, number, number], how: "body" as const },
  ],
  flags: [],
  provider: "gpu" as const,
  seconds: 21.4,
};

// ---- the Make depth map row ---------------------------------------------------------------------------------------------

function render(view: DepthRowView) {
  return renderToStaticMarkup(<MakeDepthMapRow view={view} onMake={noop} onCancel={noop} onDismiss={noop} onCheckAgain={noop} onCopy={noop} />);
}

describe("the Make depth map row", () => {
  it("draws nothing when there is nothing to offer", () => {
    expect(render({ kind: "hidden" })).toBe("");
  });

  it("offers an enabled button when the computer is ready, and says what will happen", () => {
    const html = render({ kind: "ready", note: "Made on this computer from this picture." });
    expect(html).toContain('data-testid="make-depth-row"');
    expect(html).toContain('data-state="ready"');
    expect(html).toContain("Make depth map");
    expect(buttonTag(html, "make-depth-button")).not.toContain("disabled");
    expect(html).toContain("Made on this computer from this picture.");
  });

  it("shows the button greyed out while checking, when busy, and when there is no server", () => {
    for (const view of [{ kind: "checking" }, { kind: "busy", note: "One at a time." }, { kind: "unavailable" }] as DepthRowView[]) {
      const html = render(view);
      expect(buttonTag(html, "make-depth-button"), view.kind).toContain("disabled");
    }
    expect(render({ kind: "checking" })).toContain("Checking this computer");
    expect(render({ kind: "busy", note: "One at a time." })).toContain("One at a time.");
    const unavailable = render({ kind: "unavailable" });
    expect(unavailable).toContain('data-testid="make-depth-unavailable"');
    expect(unavailable).toContain("npm run serve");
  });

  it("asks for the one-time setup, with the command to copy and a way to check again; no Make button", () => {
    const html = render({ kind: "setup-needed", command: "npm run depth:setup" });
    expect(html).toContain("npm run depth:setup");
    expect(html).toContain('data-testid="make-depth-copy"');
    expect(html).toContain('data-testid="make-depth-check-again"');
    expect(html).not.toContain('data-testid="make-depth-button"');
  });

  it("shows progress: a bar that fills while the model downloads, one that sweeps while it makes the map", () => {
    const downloading = render({ kind: "running", percent: 40, phase: "Downloading the model (once)… 40%", cancellable: true });
    expect(downloading).toContain('role="progressbar"');
    expect(downloading).toContain('aria-valuenow="40"');
    expect(downloading).toContain("width:40%");
    expect(downloading).not.toContain("is-indeterminate");
    expect(downloading).toContain("Downloading the model (once)… 40%");
    expect(buttonTag(downloading, "make-depth-cancel")).not.toContain("disabled");

    const making = render({ kind: "running", percent: null, phase: "Making the depth map… 12 s", cancellable: false });
    expect(making).toContain("is-indeterminate");
    expect(making).not.toContain("aria-valuenow");
    expect(making).toContain("Making the depth map… 12 s");
    expect(buttonTag(making, "make-depth-cancel")).toContain("disabled");
  });

  it("shows a failure as an alert, with a way to try again", () => {
    const html = render({ kind: "failed", cancelled: false, message: "No space left on the disk." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("No space left on the disk.");
    expect(html).toContain('data-testid="make-depth-retry"');
  });

  it("shows a cancel you asked for as a quiet note, not an error, with an OK to clear it", () => {
    const html = render({ kind: "failed", cancelled: true, message: "Cancelled." });
    expect(html).toContain('data-testid="make-depth-cancelled"');
    expect(html).toContain("Cancelled.");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("depth-make-error");
    expect(html).toContain('data-testid="make-depth-dismiss"');
    expect(html).not.toContain('data-testid="make-depth-retry"');
  });

  it("shows what was made, the people warning, and why a map was not attached", () => {
    const html = render({
      kind: "done",
      text: "Depth map made (1920×1080, 41.2 s on the CPU). Turn on MAP in the Depth Maps lane to see it.",
      caution: "If people are in this picture they will stretch when the camera moves.",
      note: "The map is saved at /film/depth/s1/pic/depth.png.",
    });
    expect(html).toContain('data-testid="make-depth-done"');
    expect(html).toContain("1920×1080");
    expect(html).toContain("people");
    expect(html).toContain("saved at /film/depth/s1/pic/depth.png");
    expect(html).toContain('data-testid="make-depth-dismiss"');
  });

  it("escapes what the server says", () => {
    const html = render({ kind: "failed", cancelled: false, message: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

// ---- the Make cutouts row ----------------------------------------------------------------------------------------------

function renderCutouts(view: CutoutsRowView) {
  return renderToStaticMarkup(
    <MakeCutoutsRow view={view} onMake={noop} onCancel={noop} onDismiss={noop} onCheckAgain={noop} onCopy={noop} onDownloadMissing={noop} onCancelDownload={noop} />,
  );
}

const missingView = (ids: string[], nonCommercial: boolean): CutoutsRowView => {
  const missing = ready().models.filter((model) => ids.includes(model.id));
  return { kind: "models-missing", missing, bytes: missing.reduce((sum, model) => sum + model.bytes, 0), nonCommercial };
};

describe("the Make cutouts row", () => {
  it("draws nothing when there is nothing to offer", () => {
    expect(renderCutouts({ kind: "hidden" })).toBe("");
  });

  it("offers an enabled, quiet button when the models are here, and says what will happen", () => {
    const html = renderCutouts({ kind: "ready", keepsMap: false, note: "Finds the people in this picture. A few minutes on the CPU." });
    expect(html).toContain('data-testid="make-cutouts-row"');
    expect(html).toContain('data-state="ready"');
    expect(html).toContain("Make cutouts");
    const button = buttonTag(html, "make-cutouts-button");
    expect(button).not.toContain("disabled");
    expect(button).toContain("button-quiet"); // the depth map is the main button; this one is the second
    expect(html).toContain("A few minutes on the CPU.");
  });

  it("shows the button greyed out while checking, when busy, and when there is no server", () => {
    for (const view of [{ kind: "checking" }, { kind: "busy", note: "One at a time." }, { kind: "unavailable" }] as CutoutsRowView[]) {
      expect(buttonTag(renderCutouts(view), "make-cutouts-button"), view.kind).toContain("disabled");
    }
    expect(renderCutouts({ kind: "checking" })).toContain("Checking this computer");
    expect(renderCutouts({ kind: "busy", note: "One at a time." })).toContain("One at a time.");
    const unavailable = renderCutouts({ kind: "unavailable" });
    expect(unavailable).toContain('data-testid="make-cutouts-unavailable"');
    expect(unavailable).toContain("npm run serve");
  });

  it("asks for the one-time setup, with the command to copy and a way to check again; no Make button", () => {
    const html = renderCutouts({ kind: "setup-needed", command: "npm run depth:setup" });
    expect(html).toContain("npm run depth:setup");
    expect(html).toContain('data-testid="make-cutouts-copy"');
    expect(html).toContain('data-testid="make-cutouts-check-again"');
    expect(html).not.toContain('data-testid="make-cutouts-button"');
  });

  it("asks for the models first: which, and one button to download them, with the total size", () => {
    const html = renderCutouts(missingView(BEST, true));
    expect(html).toContain('data-state="models-missing"');
    expect(html).toContain("4 models");
    for (const id of BEST) expect(html).toContain(ALL_MODELS[id].title);
    expect(html).toContain("Download models (2.8 GB)");
    expect(buttonTag(html, "make-cutouts-download")).not.toContain("disabled");
    expect(html).not.toContain('data-testid="make-cutouts-button"');
    // the licence caution only when one of the models has it
    expect(html).toContain("non-commercial");
    const permissive = renderCutouts(missingView(["people", "matte-lite"], false));
    expect(permissive).not.toContain("non-commercial");
    expect(permissive).toContain("2 models");
    expect(renderCutouts(missingView(["inpaint"], false))).toContain("a model");
  });

  it("shows a model download in progress, with a way to stop it", () => {
    const html = renderCutouts({ kind: "downloading", phase: "Downloading BiRefNet general (full) (once)… 45%", percent: 45, cancellable: true });
    expect(html).toContain('aria-label="Downloading models"');
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain("width:45%");
    expect(html).toContain("Downloading BiRefNet general (full) (once)… 45%");
    expect(buttonTag(html, "make-cutouts-cancel")).not.toContain("disabled");
    const unknown = renderCutouts({ kind: "downloading", phase: "Downloading models…", percent: null, cancellable: false });
    expect(unknown).toContain("is-indeterminate");
    expect(buttonTag(unknown, "make-cutouts-cancel")).toContain("disabled");
  });

  it("shows the steps while it works: a bar that moves with the step, and a way to stop", () => {
    const html = renderCutouts({ kind: "running", phase: "Step 3 of 5: cutting out (2) · 15 s", progress: 40, cancellable: true });
    expect(html).toContain('aria-label="Making the cut-outs"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain("width:40%");
    expect(html).toContain("Step 3 of 5: cutting out (2) · 15 s");
    expect(buttonTag(html, "make-cutouts-cancel")).not.toContain("disabled");
    // the first step has a sliver showing, not an empty bar
    expect(renderCutouts({ kind: "running", phase: "Step 1 of 5: finding the people · 1 s", progress: 0, cancellable: true })).toContain("width:6%");
    const waiting = renderCutouts({ kind: "running", phase: "Starting…", progress: null, cancellable: false });
    expect(waiting).toContain("is-indeterminate");
    expect(buttonTag(waiting, "make-cutouts-cancel")).toContain("disabled");
  });

  it("shows a failure as an alert, with a way to try again", () => {
    const html = renderCutouts({ kind: "failed", cancelled: false, message: "The cut-out worker ran out of memory." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("ran out of memory");
    expect(html).toContain('data-testid="make-cutouts-retry"');
  });

  it("shows a cancel you asked for as a quiet note, not an error, with an OK to clear it", () => {
    const html = renderCutouts({ kind: "failed", cancelled: true, message: "Cancelled." });
    expect(html).toContain('data-testid="make-cutouts-cancelled"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("depth-make-error");
    expect(html).toContain('data-testid="make-cutouts-dismiss"');
    expect(html).not.toContain('data-testid="make-cutouts-retry"');
  });

  it("shows what was made: a review sheet to open, what to look at, and any caution", () => {
    const html = renderCutouts({
      kind: "done",
      made: true,
      text: "2 cut-outs, a plate and a depth map made in 21.4 s on the GPU. This shot now uses them (one undo step).",
      flags: ["Person 2 is clipped at the picture's edge.", "A person-like shape is still in the plate."],
      caution: "This shot's camera is a dolly.",
      note: null,
      review: `${FOLDER}/review.jpg`,
    });
    expect(html).toContain('data-testid="make-cutouts-done"');
    expect(html).toContain("2 cut-outs, a plate and a depth map made");
    const link = /<a[^>]*data-testid="make-cutouts-review"[^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain(`href="${FOLDER}/review.jpg"`);
    expect(link).toContain('target="_blank"');
    expect(link).toContain("noopener");
    expect(html).toContain(`<img src="${FOLDER}/review.jpg"`);
    expect(html).toContain('data-testid="make-cutouts-flags"');
    expect(html).toContain("Person 2 is clipped at the picture&#x27;s edge.");
    expect(html).toContain("A person-like shape is still in the plate.");
    expect(html).toContain("This shot&#x27;s camera is a dolly.");
    expect(html).toContain('data-testid="make-cutouts-dismiss"');
  });

  it("shows no review link or flags when there are none (nobody was found)", () => {
    const html = renderCutouts({ kind: "done", made: false, text: "No people were found in this picture, so nothing was made.", flags: [], caution: null, note: null, review: null });
    expect(html).toContain("No people were found");
    // nothing was made, so it is not shown in the success colour
    expect(/<p[^>]*data-testid="make-cutouts-done"[^>]*>/.exec(html)?.[0]).not.toContain("is-ok");
    expect(/<p[^>]*data-testid="make-cutouts-done"[^>]*>/.exec(renderCutouts({ kind: "done", made: true, text: "ok", flags: [], caution: null, note: null, review: null }))?.[0]).toContain("is-ok");
    expect(html).not.toContain('data-testid="make-cutouts-review"');
    expect(html).not.toContain('data-testid="make-cutouts-flags"');
  });

  it("says where the layers are when they could not go on the shot", () => {
    const html = renderCutouts({ kind: "done", made: true, text: "2 cut-outs made.", flags: [], caution: null, note: `The picture changed. The layers are saved in ${FOLDER}.`, review: null });
    expect(html).toContain(`saved in ${FOLDER}`);
  });

  it("escapes what the server says", () => {
    const failed = renderCutouts({ kind: "failed", cancelled: false, message: "<img src=x onerror=alert(1)>" });
    expect(failed).not.toContain("<img");
    expect(failed).toContain("&lt;img");
    const done = renderCutouts({ kind: "done", made: true, text: "ok", flags: ["<script>alert(1)</script>"], caution: null, note: null, review: null });
    expect(done).not.toContain("<script>");
    expect(done).toContain("&lt;script&gt;");
  });
});

// ---- the models list -----------------------------------------------------------------------------------------------------

const panel = (state: DepthMakerState, open?: boolean) =>
  renderToStaticMarkup(<ModelsPanel view={modelsPanelView(state)!} onQuality={noop} onDownload={noop} open={open} />);

describe("the models list", () => {
  it("lists the four models of the chosen quality, each with its size, licence and a link to where it comes from", () => {
    const html = panel(idle());
    for (const id of BEST) {
      expect(html, id).toContain(`data-testid="model-${id}"`);
      expect(html, id).toContain(ALL_MODELS[id].title);
      expect(html, id).toContain(ALL_MODELS[id].license);
      const link = new RegExp(`<a[^>]*data-testid="model-source-${id}"[^>]*>`).exec(html)?.[0] ?? "";
      expect(link, id).toContain(`href="${ALL_MODELS[id].source}"`);
      expect(link, id).toContain('target="_blank"');
      expect(link, id).toContain("noopener");
      // and a link to the file itself, to download by hand
      const file = new RegExp(`<a[^>]*data-testid="model-file-${id}"[^>]*>`).exec(html)?.[0] ?? "";
      expect(file, id).toContain(`href="${ALL_MODELS[id].url}"`);
      expect(file, id).toContain('target="_blank"');
      expect(file, id).toContain("noopener");
      expect(file, id).toContain(ALL_MODELS[id].file);
    }
    expect(html).toContain("File ↗");
    expect(html).toContain("973 MB"); // BiRefNet full
    expect(html).toContain("1.3 GB"); // Depth Anything Large
    // not the ones of the other quality
    expect(html).not.toContain(ALL_MODELS["matte-lite"].title);
    expect(html).not.toContain(ALL_MODELS["depth-small"].title);
  });

  it("has a Download button for each model that is not here, none for one that is, and one for all of them", () => {
    const html = panel(idle(ready({ here: ["people", "inpaint"] })));
    expect(html).toContain('data-testid="model-download-matte-best"');
    expect(html).toContain('data-testid="model-download-depth-large"');
    expect(html).not.toContain('data-testid="model-download-people"');
    expect(html).not.toContain('data-testid="model-download-inpaint"');
    expect(html).toContain('data-cached="true"');
    expect(html).toContain('data-cached="false"');
    expect(html).toContain('data-testid="models-download-all"');
    expect(html).toContain("Download all that are missing (2.3 GB)");
    expect(html).toContain("2 of 4 on this computer");
    // one missing: its own button is enough
    expect(panel(idle(ready({ here: ["people", "inpaint", "matte-best"] })))).not.toContain('data-testid="models-download-all"');
  });

  it("says when everything is here, and offers nothing to download", () => {
    const html = panel(idle(ready({ here: BEST })));
    expect(html).toContain('data-testid="models-all-here"');
    expect(html).toContain("All 4 are on this computer.");
    expect(html).not.toContain("models-download-all");
    expect(html).not.toContain('data-testid="model-download-');
    expect(html).toContain('data-all-here="true"');
  });

  it("marks the non-commercial licence, and only that one", () => {
    const best = panel(idle());
    expect(best).toContain("models-licence is-noncommercial");
    expect(best.match(/is-noncommercial/g)).toHaveLength(1);
    const fast = panel(idle(ready(), { quality: "fast" }));
    expect(fast).not.toContain("is-noncommercial");
  });

  it("switches between Best and Fast, showing which is chosen and what it means", () => {
    const best = panel(idle());
    expect(buttonTag(best, "models-quality-best")).toContain('aria-pressed="true"');
    expect(buttonTag(best, "models-quality-fast")).toContain('aria-pressed="false"');
    expect(best).toContain("non-commercial use only");
    expect(best).toContain("Best · 0 of 4");
    const fast = panel(idle(ready(), { quality: "fast" }));
    expect(buttonTag(fast, "models-quality-fast")).toContain('aria-pressed="true"');
    expect(fast).toContain("permissive licences");
    expect(fast).toContain(ALL_MODELS["matte-lite"].title);
    expect(fast).toContain(ALL_MODELS["depth-small"].title);
  });

  it("makes the buttons wait while something is being made or downloaded", () => {
    const html = panel(idle(ready(), { download: download() }));
    expect(buttonTag(html, "model-download-matte-best")).toContain("disabled");
    expect(buttonTag(html, "models-download-all")).toContain("disabled");
  });

  it("says when a model is a file of your own, and does not offer to download it", () => {
    const used = panel(idle(ready({ patch: { "matte-best": { overridden: true, cached: true } } })));
    expect(used).toContain("You chose a file of your own for this, so it is used instead.");
    expect(used).not.toContain('data-testid="model-download-matte-best"');
    const gone = panel(idle(ready({ patch: { "matte-best": { overridden: true, cached: false } } })));
    expect(gone).toContain("but it was not found");
    expect(gone).not.toContain('data-testid="model-download-matte-best"');
  });

  it("says where the models are kept, and that a file put there by hand is used", () => {
    const html = panel(idle());
    expect(html).toContain("/home/me/.cache/scarlet-keyframe/models");
    expect(html).toContain("<b>File</b> link and put it there under its own name");
  });

  it("is closed unless asked to be open", () => {
    expect(detailsTag(panel(idle()))).not.toContain("open");
    expect(detailsTag(panel(idle(), true))).toContain("open");
  });
});

// ---- the rows for a shot ---------------------------------------------------------------------------------------------------

const binding = (state: DepthMakerState): DepthMakerBinding => ({
  state,
  onCheck: noop,
  onMake: noop,
  onMakeCutouts: noop,
  onDownload: noop,
  onQuality: noop,
  onCancel: noop,
  onDismiss: noop,
});
const tools = (props: { picture?: string | undefined; hasDepthMap?: boolean; hasCutouts?: boolean; keptMap?: string; state: DepthMakerState }) =>
  renderToStaticMarkup(
    <DepthToolsForShot
      frameId="f1"
      picture={"picture" in props ? props.picture : "/film/img/s1/pic.jpg"}
      hasDepthMap={props.hasDepthMap ?? false}
      hasCutouts={props.hasCutouts ?? false}
      keptMap={props.keptMap}
      maker={binding(props.state)}
    />,
  );
const stateOf = (html: string, row: "make-depth-row" | "make-cutouts-row") => new RegExp(`data-testid="${row}" data-state="([a-z-]+)"`).exec(html)?.[1];

describe("the rows for a shot", () => {
  it("offers both buttons for one of the film's pictures that has neither a depth map nor cut-outs, with the models list", () => {
    const html = tools({ state: idle(ready({ here: BEST })) });
    expect(stateOf(html, "make-depth-row")).toBe("ready");
    expect(stateOf(html, "make-cutouts-row")).toBe("ready");
    expect(buttonTag(html, "make-depth-button")).not.toContain("disabled");
    expect(buttonTag(html, "make-cutouts-button")).not.toContain("disabled");
    expect(html).toContain('data-testid="models-panel"');
    expect(detailsTag(html)).not.toContain("open"); // all here: nothing to draw attention to
  });

  it("opens the models list when the cut-outs are waiting for models", () => {
    const html = tools({ state: idle() });
    expect(stateOf(html, "make-depth-row")).toBe("ready");
    expect(stateOf(html, "make-cutouts-row")).toBe("models-missing");
    expect(html).toContain('data-testid="make-cutouts-download"');
    expect(detailsTag(html)).toContain("open");
  });

  it("offers only the cut-outs when the shot already has a depth map, and says it is kept when it can be", () => {
    const html = tools({ state: idle(ready({ here: ["people", "matte-best", "inpaint"] })), hasDepthMap: true, keptMap: "/film/depth/s1/pic/depth.png" });
    expect(html).not.toContain('data-testid="make-depth-row"');
    expect(stateOf(html, "make-cutouts-row")).toBe("ready");
    expect(html).toContain("kept as it is");
  });

  it("offers only the depth map when the shot already has cut-outs", () => {
    const html = tools({ state: idle(ready({ here: BEST })), hasCutouts: true });
    expect(stateOf(html, "make-depth-row")).toBe("ready");
    expect(html).not.toContain('data-testid="make-cutouts-row"');
  });

  it("says nothing when the shot has both", () => {
    expect(tools({ state: idle(ready({ here: BEST })), hasDepthMap: true, hasCutouts: true })).toBe("");
  });

  it("says nothing for a picture that is not one of the film's (an upload, a gradient, nothing)", () => {
    for (const picture of ["asset:abc", "gradient:linear-gradient(red,blue)", undefined]) {
      expect(tools({ picture, state: idle() }), String(picture)).toBe("");
    }
  });

  it("waits to hear what this computer can do before offering anything, and says so once", () => {
    const html = tools({ state: idle(null) });
    expect(stateOf(html, "make-depth-row")).toBe("checking");
    expect(html).not.toContain('data-testid="make-cutouts-row"'); // one explanation is enough
    expect(html).not.toContain('data-testid="models-panel"'); // nothing to list yet
    expect(html.match(/Checking this computer/g)).toHaveLength(1);
  });

  it("says once that there is no server, and once what to run to set up", () => {
    const none = tools({ state: idle("unavailable") });
    expect(none.match(/npm run serve/g)).toHaveLength(1);
    expect(none).not.toContain('data-testid="make-cutouts-row"');
    const setup = tools({ state: idle(ready({ python: null, packages: false })) });
    expect(stateOf(setup, "make-depth-row")).toBe("setup-needed");
    expect(setup).not.toContain('data-testid="make-cutouts-row"');
    expect(setup.match(/npm run depth:setup/g)).toHaveLength(1);
  });

  it("shows the cut-outs being made for this shot, with the depth map button waiting its turn", () => {
    const html = tools({ state: idle(ready({ here: BEST }), { job: job({ step: { n: 2, of: 5, text: "the depth (from the model; 2 people found)" } }) }) });
    expect(stateOf(html, "make-cutouts-row")).toBe("running");
    expect(stateOf(html, "make-depth-row")).toBe("busy");
    expect(buttonTag(html, "make-depth-button")).toContain("disabled");
    expect(html).toContain("Step 2 of 5");
  });

  it("keeps showing the finished cut-outs on their shot, with the review sheet, even though the shot has the layers now", () => {
    const done = job({ status: "done", applied: true, result: madeResult });
    const html = tools({ state: idle(ready({ here: BEST }), { job: done }), hasDepthMap: true, hasCutouts: true });
    expect(stateOf(html, "make-cutouts-row")).toBe("done");
    expect(html).toContain('data-testid="make-cutouts-review"');
    expect(html).not.toContain('data-testid="make-depth-row"');
  });

  it("shows a model download on the cut-outs row, with the depth map button waiting and the list open", () => {
    const html = tools({ state: idle(ready(), { download: download() }) });
    expect(stateOf(html, "make-cutouts-row")).toBe("downloading");
    expect(stateOf(html, "make-depth-row")).toBe("busy");
    expect(detailsTag(html)).toContain("open");
    expect(html).toContain("Downloading BiRefNet general (full) (once)… 45%");
  });

  it("agrees with the view functions about what the cut-outs row shows", () => {
    const state = idle(ready({ here: ["people"] }));
    const view = cutoutsRowView({ frameId: "f1", picture: "/film/img/s1/pic.jpg", hasCutouts: false, state });
    expect(view.kind).toBe("models-missing");
    expect(stateOf(tools({ state }), "make-cutouts-row")).toBe(view.kind);
  });
});
