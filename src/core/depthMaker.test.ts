import { describe, expect, it } from "vitest";
import { depthMapRefFor } from "../../scripts/depth/lib.mjs";
import { ALL_MODELS, QUALITIES } from "../../scripts/depth/models.mjs";
import type { DepthJobView, DepthMakeResult, DepthReady, ModelStatus } from "./depthApiTypes";
import {
  DEPTH_SETUP_COMMAND,
  DepthApiFailure,
  cancelDepthJob,
  createDepthMaker,
  cutoutsRowView,
  depthMapRefForPicture,
  depthRowView,
  fetchDepthFiles,
  fetchDepthJob,
  fetchDepthReady,
  formatModelSize,
  keepableDepthMap,
  modelsNeededForCutouts,
  modelsPanelView,
  pictureCanHaveDepthMap,
  plainPictureRef,
  startCutoutsJob,
  startDepthJob,
  startModelDownload,
  type ApplyCutouts,
  type ApplyDepthMap,
  type DepthMakerJob,
  type DepthMakerState,
  type DepthQuality,
  type MadeCutouts,
  type ModelDownload,
} from "./depthMaker";

// ---- helpers: a fake server, a clock the test winds by hand ---------------------------------------------------------

const BEST = ["people", "matte-best", "inpaint", "depth-large"];
const FAST = ["people", "matte-lite", "inpaint", "depth-small"];
const bytesOf = (ids: string[]) => ids.reduce((sum, id) => sum + ALL_MODELS[id].bytes, 0);

/**
 * What the server says about this computer, built from the real model registry. `here` names the models that are on it;
 * `patch` changes single fields of single models (an override, say).
 */
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

const view = (extra: Partial<DepthJobView> = {}): DepthJobView => ({
  id: "job-1",
  kind: "depth",
  status: "running",
  picture: "/film/img/s1/pic.jpg",
  map: "/film/depth/s1/pic/depth.png",
  percent: null,
  log: [],
  message: null,
  result: null,
  elapsedMs: 0,
  ...extra,
});

const doneView = (extra: Partial<DepthJobView> = {}): DepthJobView =>
  view({
    status: "done",
    percent: 100,
    result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, provider: "cpu", seconds: 41.2 },
    ...extra,
  });

const FOLDER = "/film/depth/s1/pic/people-1";
const cutoutsResult = (extra: Partial<DepthMakeResult> = {}): DepthMakeResult => ({
  ok: true,
  written: true,
  folder: FOLDER,
  depthMap: `${FOLDER}/depth.png`,
  plate: `${FOLDER}/plate.jpg`,
  review: `${FOLDER}/review.jpg`,
  cutouts: [
    { image: `${FOLDER}/cutout-1.png`, depth: 0.62, box: [100, 80, 400, 900], how: "feet" },
    { image: `${FOLDER}/cutout-2.png`, depth: 0.4, box: [700, 120, 300, 800], how: "body" },
  ],
  flags: [],
  provider: "gpu",
  seconds: 21.4,
  seen: 2,
  leftOut: 0,
  width: 1920,
  height: 1080,
  quality: "best",
  source: "model",
  ...extra,
});

const cutoutsView = (extra: Partial<DepthJobView> = {}): DepthJobView => view({ kind: "cutouts", map: "", step: null, ...extra });
const cutoutsDoneView = (result: DepthMakeResult = cutoutsResult(), extra: Partial<DepthJobView> = {}): DepthJobView =>
  cutoutsView({ status: "done", result, ...extra });

const downloadView = (extra: Partial<DepthJobView> = {}): DepthJobView =>
  view({ kind: "models", picture: "", map: "", percent: 0, current: "Downloading BiRefNet general (full) (once)", ...extra });

type Reply = { status: number; json: unknown } | "network-error";
const ok = (json: unknown): Reply => ({ status: 200, json });

/** A fake server: each route has a queue of replies (the last one repeats); every call is recorded. */
function fakeServer(routes: Record<string, Reply[]>) {
  const calls: { route: string; method: string; body?: unknown }[] = [];
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const route = input.replace("/__api/depth/", "").split("?")[0];
    calls.push({ route, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const queue = routes[route] ?? [{ status: 404, json: { error: "not-found", message: "No such depth API route." } }];
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply === "network-error") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls, count: (route: string) => calls.filter((call) => call.route === route).length };
}

function clock() {
  const tasks: { id: number; fn: () => void }[] = [];
  let next = 1;
  return {
    setTimeout: (fn: () => void) => {
      tasks.push({ id: next, fn });
      return next++;
    },
    clearTimeout: (id: unknown) => {
      const at = tasks.findIndex((task) => task.id === id);
      if (at >= 0) tasks.splice(at, 1);
    },
    pending: () => tasks.length,
    /** Run the next waiting timer, then let the promises it started finish. */
    async tick() {
      tasks.shift()?.fn();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function maker(routes: Record<string, Reply[]>, options: { apply?: ApplyDepthMap; applyCutouts?: ApplyCutouts; quality?: DepthQuality } = {}) {
  const server = fakeServer(routes);
  const time = clock();
  const applied: [string, string, string][] = [];
  const appliedCutouts: [string, string, MadeCutouts][] = [];
  const qualityChanges: DepthQuality[] = [];
  const controller = createDepthMaker({
    fetch: server.fetch,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    now: () => 1_000,
    quality: options.quality,
    onQualityChange: (quality) => qualityChanges.push(quality),
    apply:
      options.apply ??
      ((frameId, picture, mapRef) => {
        applied.push([frameId, picture, mapRef]);
        return { applied: true };
      }),
    applyCutouts:
      options.applyCutouts ??
      ((frameId, picture, made) => {
        appliedCutouts.push([frameId, picture, made]);
        return { applied: true };
      }),
  });
  return { controller, server, time, applied, appliedCutouts, qualityChanges };
}

// ---- the helpers ----------------------------------------------------------------------------------------------------

describe("which pictures can have a depth map made", () => {
  it("the film's own pictures", () => {
    for (const ref of ["/film/img/s1/01-backstreet.jpg", "/film/img/montage/m4-railway-rain.JPG", "/film/img/a/b.jpeg", "/film/img/a/b.png", "/film/img/a/b.webp"]) {
      expect(pictureCanHaveDepthMap(ref), ref).toBe(true);
    }
    expect(pictureCanHaveDepthMap("/film/img/s1/pic.jpg?v=3#x")).toBe(true);
  });

  it("nothing else", () => {
    for (const ref of [undefined, null, "", "asset:abc", "gradient:linear(red,blue)", "emoji:x", "video:/film/v.mp4", "blob:http://x/1", "/film/depth/a/b/depth.png", "/film/img/a/b.gif", "/film/img/a/b", "/other/a.jpg", "a.jpg"]) {
      expect(pictureCanHaveDepthMap(ref), String(ref)).toBe(false);
    }
  });

  it("never a path that climbs or uses a backslash", () => {
    for (const ref of ["/film/img/../x.jpg", "/film/img/a/../../b.jpg", "/film/img/./a.jpg", "/film/img/a\\b.jpg"]) {
      expect(pictureCanHaveDepthMap(ref), ref).toBe(false);
    }
  });

  it("strips a query or fragment", () => {
    expect(plainPictureRef("/film/img/a/b.jpg?x=1#y")).toBe("/film/img/a/b.jpg");
  });
});

describe("where a picture's map goes", () => {
  it("is exactly where the depth command puts it", () => {
    for (const ref of ["/film/img/montage/m4-railway-rain.jpg", "/film/img/s1/01-backstreet.JPG", "/film/img/a/b/c.d.png", "/film/img/x.webp", "/film/img/s9/v1.2.final.jpeg"]) {
      expect(depthMapRefForPicture(ref), ref).toBe(depthMapRefFor(ref));
    }
    expect(depthMapRefForPicture("/film/img/s1/pic.jpg?v=2")).toBe("/film/depth/s1/pic/depth.png");
  });
});

describe("which depth map the cut-outs can keep", () => {
  it("one of the film's own, under /film/depth/", () => {
    expect(keepableDepthMap("/film/depth/s1/pic/depth.png")).toBe("/film/depth/s1/pic/depth.png");
    expect(keepableDepthMap("/film/depth/s1/pic/depth.png?v=2#x")).toBe("/film/depth/s1/pic/depth.png");
    expect(keepableDepthMap("/film/depth/s1/pic/people-2/depth.webp")).toBe("/film/depth/s1/pic/people-2/depth.webp");
  });

  it("nothing else", () => {
    for (const ref of [undefined, null, 5, "", "asset:abc", "/film/img/s1/pic.jpg", "/film/depth/../x.png", "/film/depth/a/./b.png", "/film/depth/a\\b.png", "/film/depth/a/b.gif", "gradient:x"]) {
      expect(keepableDepthMap(ref), String(ref)).toBeUndefined();
    }
  });
});

describe("how big a model is said to be", () => {
  it("in megabytes, and in gigabytes from a billion bytes up", () => {
    expect(formatModelSize(99_373_606)).toBe("99 MB");
    expect(formatModelSize(972_666_916)).toBe("973 MB");
    expect(formatModelSize(1_000_000_000)).toBe("1.0 GB");
    expect(formatModelSize(2_798_770_124)).toBe("2.8 GB");
  });
});

// ---- the API client -------------------------------------------------------------------------------------------------

describe("asking the server", () => {
  it("fetchDepthReady gives what the server says, and null when there is no depth API", async () => {
    expect(await fetchDepthReady(fakeServer({ ready: [ok(ready())] }).fetch)).toEqual(ready());
    expect(await fetchDepthReady(fakeServer({}).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: ["network-error"] }).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: [ok({ hello: "a static host's page" })] }).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: [{ status: 403, json: { error: "forbidden", message: "no" } }] }).fetch)).toBeNull();
  });

  it("an answer that knows nothing of models cannot drive the rows, so it counts as no depth API", async () => {
    expect(await fetchDepthReady(fakeServer({ ready: [ok({ ok: true, python: "python3", packages: true, gpu: false })] }).fetch)).toBeNull();
  });

  it("fetchDepthFiles gives the list of depth pictures, and null when there is no depth API or an odd answer", async () => {
    const paths = ["film/depth/s6/x/people-1/plate.jpg", "film/depth/s6/x/people-1/depth.png"];
    expect(await fetchDepthFiles(fakeServer({ files: [ok({ ok: true, paths })] }).fetch)).toEqual(paths);
    expect(await fetchDepthFiles(fakeServer({ files: [ok({ ok: true, paths: ["a.png", 5, null] })] }).fetch)).toEqual(["a.png"]);
    expect(await fetchDepthFiles(fakeServer({}).fetch)).toBeNull();
    expect(await fetchDepthFiles(fakeServer({ files: ["network-error"] }).fetch)).toBeNull();
    expect(await fetchDepthFiles(fakeServer({ files: [ok({ hello: "a static host's page" })] }).fetch)).toBeNull();
    expect(await fetchDepthFiles(fakeServer({ files: [{ status: 403, json: { error: "forbidden", message: "no" } }] }).fetch)).toBeNull();
  });

  it("fetchDepthReady(fresh) asks the server to look again", async () => {
    const server = fakeServer({ ready: [ok(ready())] });
    await fetchDepthReady(server.fetch, true);
    await fetchDepthReady(server.fetch);
    expect(server.calls.map((call) => call.route)).toEqual(["ready", "ready"]);
  });

  it("startDepthJob sends the picture and the quality as JSON", async () => {
    const server = fakeServer({ make: [ok(view())] });
    expect((await startDepthJob("/film/img/s1/pic.jpg", "fast", false, server.fetch)).id).toBe("job-1");
    expect(server.calls[0]).toMatchObject({ route: "make", method: "POST", body: { picture: "/film/img/s1/pic.jpg", quality: "fast" } });
  });

  it("startDepthJob asks for a new map (replace) only when told to", async () => {
    const server = fakeServer({ make: [ok(view())] });
    await startDepthJob("/film/img/s1/pic.jpg", "best", false, server.fetch);
    await startDepthJob("/film/img/s1/pic.jpg", "best", true, server.fetch);
    expect(server.calls[0].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "best" });
    expect(server.calls[1].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "best", replace: true });
  });

  it("startCutoutsJob sends the picture and the quality, and a depth map to keep only when there is one", async () => {
    const server = fakeServer({ cutouts: [ok(cutoutsView())] });
    await startCutoutsJob("/film/img/s1/pic.jpg", "best", undefined, server.fetch);
    await startCutoutsJob("/film/img/s1/pic.jpg", "fast", "/film/depth/s1/pic/depth.png", server.fetch);
    expect(server.calls[0]).toMatchObject({ route: "cutouts", method: "POST", body: { picture: "/film/img/s1/pic.jpg", quality: "best" } });
    expect(server.calls[0].body).not.toHaveProperty("sourceMap");
    expect(server.calls[1].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "fast", sourceMap: "/film/depth/s1/pic/depth.png" });
  });

  it("startModelDownload sends the ids", async () => {
    const server = fakeServer({ "models/download": [ok(downloadView())] });
    await startModelDownload(["matte-best", "inpaint"], server.fetch);
    expect(server.calls[0]).toMatchObject({ route: "models/download", method: "POST", body: { ids: ["matte-best", "inpaint"] } });
  });

  it("a refusal carries the server's kind, message and job", async () => {
    const server = fakeServer({ make: [{ status: 409, json: { error: "busy", message: "Another depth map is being made (a.jpg).", id: "other" } }] });
    const failure = await startDepthJob("/film/img/s1/pic.jpg", "best", false, server.fetch).catch((error) => error);
    expect(failure).toBeInstanceOf(DepthApiFailure);
    expect(failure).toMatchObject({ kind: "busy", message: "Another depth map is being made (a.jpg).", id: "other" });
  });

  it("a refusal for missing models says which", async () => {
    const server = fakeServer({ cutouts: [{ status: 412, json: { error: "models-missing", message: "Download these models first.", missing: ["matte-best", "inpaint"] } }] });
    const failure = await startCutoutsJob("/film/img/s1/pic.jpg", "best", undefined, server.fetch).catch((error) => error);
    expect(failure).toMatchObject({ kind: "models-missing", missing: ["matte-best", "inpaint"] });
  });

  it("a server that cannot be reached is 'network', and an odd answer still says something", async () => {
    const unreachable = await startDepthJob("/film/img/s1/pic.jpg", "best", false, fakeServer({ make: ["network-error"] }).fetch).catch((error) => error);
    expect(unreachable).toMatchObject({ kind: "network" });
    expect(unreachable.message).toContain("editor's server");
    const odd = await startDepthJob("/film/img/s1/pic.jpg", "best", false, fakeServer({ make: [{ status: 500, json: "oops" }] }).fetch).catch((error) => error);
    expect(odd).toMatchObject({ kind: "failed", message: "The server answered 500." });
  });

  it("status and cancel use the job's id", async () => {
    const server = fakeServer({ status: [ok(view())], cancel: [ok(view({ status: "cancelled" }))] });
    await fetchDepthJob("a b", server.fetch);
    await cancelDepthJob("a b", server.fetch);
    expect(server.calls[0].route).toBe("status");
    expect(server.calls[1]).toMatchObject({ route: "cancel", body: { id: "a b" } });
  });
});

// ---- the controller -------------------------------------------------------------------------------------------------

describe("checking what this computer can do", () => {
  it("asks once, remembers, and shares one request between callers", async () => {
    const { controller, server } = maker({ ready: [ok(ready())] });
    expect(controller.getState().ready).toBeNull();
    await Promise.all([controller.checkReady(), controller.checkReady()]);
    await controller.checkReady();
    expect(server.count("ready")).toBe(1);
    expect(controller.getState().ready).toEqual(ready());
    await controller.checkReady(true);
    expect(server.count("ready")).toBe(2);
  });

  it("says 'unavailable' when there is no depth API (a page opened from disk)", async () => {
    const { controller } = maker({});
    await controller.checkReady();
    expect(controller.getState().ready).toBe("unavailable");
  });

  it("tells listeners, until they stop listening", async () => {
    const { controller } = maker({ ready: [ok(ready())] });
    let heard = 0;
    const stop = controller.subscribe(() => (heard += 1));
    await controller.checkReady();
    expect(heard).toBe(1);
    stop();
    await controller.checkReady(true);
    expect(heard).toBe(1);
  });
});

describe("the quality", () => {
  it("starts at 'best', and tells listeners and whoever keeps it when it changes", () => {
    const { controller, qualityChanges } = maker({});
    expect(controller.getState().quality).toBe("best");
    let heard = 0;
    controller.subscribe(() => (heard += 1));
    controller.setQuality("fast");
    controller.setQuality("fast");
    expect(controller.getState().quality).toBe("fast");
    expect(heard).toBe(1);
    expect(qualityChanges).toEqual(["fast"]);
  });

  it("starts from the one it is given (the one chosen last time)", () => {
    expect(maker({}, { quality: "fast" }).controller.getState().quality).toBe("fast");
  });

  it("is what the next depth map is asked for", async () => {
    const { controller, server } = maker({ make: [ok(view())], status: [ok(view())] }, { quality: "best" });
    controller.setQuality("fast");
    await controller.start("f", "/film/img/s1/pic.jpg");
    expect(server.calls[0].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "fast" });
  });

  it("is what the next cut-outs are asked for", async () => {
    const { controller, server } = maker({ cutouts: [ok(cutoutsView())], status: [ok(cutoutsView())] }, { quality: "fast" });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    expect(server.calls[0].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "fast" });
  });
});

describe("making a map", () => {
  it("follows the job and puts the finished map on the shot it was started for", async () => {
    const { controller, server, time, applied } = maker({
      make: [ok(view())],
      status: [ok(view({ percent: 40, log: ["Downloading depth.onnx"] })), ok(view({ percent: 100 })), ok(doneView())],
    });
    await controller.start("frame-7", "/film/img/s1/pic.jpg");
    expect(server.calls[0]).toMatchObject({ route: "make", body: { picture: "/film/img/s1/pic.jpg", quality: "best" } });
    expect(controller.getState().job).toMatchObject({ kind: "depth", frameId: "frame-7", status: "running", id: "job-1" });
    expect(time.pending()).toBe(1);

    await time.tick();
    expect(controller.getState().job).toMatchObject({ status: "running", percent: 40, log: ["Downloading depth.onnx"] });
    await time.tick();
    expect(applied).toEqual([]);
    await time.tick();

    expect(applied).toEqual([["frame-7", "/film/img/s1/pic.jpg", "/film/depth/s1/pic/depth.png"]]);
    expect(controller.getState().job).toMatchObject({ status: "done", applied: true, note: null, existing: false });
    expect(time.pending()).toBe(0);
    expect(server.count("status")).toBe(3);
  });

  it("asks for a new map when told to, and tells the shot it is a new file (so the viewer loads it afresh)", async () => {
    const replaced: boolean[] = [];
    const { controller, server, time } = maker(
      { make: [ok(view())], status: [ok(doneView({ result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, archived: "depth--v1.png" } }))] },
      { apply: (_frame, _picture, _map, wasReplaced) => (replaced.push(Boolean(wasReplaced)), { applied: true }) },
    );
    await controller.start("frame-1", "/film/img/s1/pic.jpg", { replace: true });
    expect(server.calls[0].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "best", replace: true });
    expect(controller.getState().job).toMatchObject({ replace: true });
    await time.tick();
    expect(replaced).toEqual([true]);
    expect(controller.getState().job).toMatchObject({ status: "done", applied: true });
  });

  it("an ordinary map is not reported as new, and neither is one that was already there", async () => {
    const replaced: unknown[] = [];
    const apply: ApplyDepthMap = (_frame, _picture, _map, wasReplaced) => (replaced.push(wasReplaced), { applied: true });
    const ordinary = maker({ make: [ok(view())], status: [ok(doneView())] }, { apply });
    await ordinary.controller.start("f", "/film/img/s1/pic.jpg");
    await ordinary.time.tick();
    // the server used the file that was there although a new one was asked for (an old server): still not "new"
    const existing = maker({ make: [ok(doneView({ id: null, existing: true, result: { ok: true, existing: true, map: "/film/depth/s1/pic/depth.png" } }))] }, { apply });
    await existing.controller.start("f", "/film/img/s1/pic.jpg", { replace: true });
    expect(replaced).toEqual([false, false]);
  });

  it("a map that was already there is attached at once, with nothing to wait for", async () => {
    const { controller, time, applied } = maker({
      make: [ok(doneView({ id: null, existing: true, result: { ok: true, existing: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080 } }))],
    });
    await controller.start("frame-1", "/film/img/s1/pic.jpg?v=2");
    expect(applied).toEqual([["frame-1", "/film/img/s1/pic.jpg", "/film/depth/s1/pic/depth.png"]]);
    expect(controller.getState().job).toMatchObject({ status: "done", existing: true, applied: true });
    expect(time.pending()).toBe(0);
  });

  it("says why when the map could not go on the shot (and where it is saved)", async () => {
    const { controller, time } = maker({ make: [ok(view())], status: [ok(doneView())] }, { apply: () => ({ applied: false, reason: "The picture changed while the map was being made." }) });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await time.tick();
    const job = controller.getState().job as DepthMakerJob;
    expect(job).toMatchObject({ status: "done", applied: false });
    expect(job.note).toBe("The picture changed while the map was being made. The map is saved at /film/depth/s1/pic/depth.png.");
  });

  it("reports a failure with the server's own words", async () => {
    const { controller, time, applied } = maker({
      make: [ok(view())],
      status: [ok(view({ status: "error", message: "The Python package \"onnxruntime\" is missing (python3).\nRun once: npm run depth:setup" }))],
    });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(controller.getState().job).toMatchObject({ status: "error", message: expect.stringContaining("npm run depth:setup") });
    expect(applied).toEqual([]);
    expect(time.pending()).toBe(0);
  });

  it("can be cancelled", async () => {
    const { controller, time } = maker({ make: [ok(view())], status: [ok(view())], cancel: [ok(view({ status: "cancelled", message: "Cancelled." }))] });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await controller.cancel();
    expect(controller.getState().job).toMatchObject({ status: "cancelled", message: "Cancelled." });
    expect(time.pending()).toBe(0);
  });

  it("a refusal to start is shown, and 'set up first' makes it look again at what the computer can do", async () => {
    const { controller, server } = maker({
      make: [{ status: 412, json: { error: "setup-needed", message: "One-time setup needed: run  npm run depth:setup  in the project folder, then try again." } }],
      ready: [ok(ready({ python: null, packages: false }))],
    });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await flush();
    expect(controller.getState().job).toMatchObject({ status: "error", message: expect.stringContaining("npm run depth:setup") });
    expect(server.count("ready")).toBe(1);
    expect(controller.getState().ready).toMatchObject({ packages: false });
  });

  it("gives up after five failed attempts to ask, but survives a couple", async () => {
    const flaky = maker({ make: [ok(view())], status: ["network-error", "network-error", ok(doneView())] });
    await flaky.controller.start("f", "/film/img/s1/pic.jpg");
    for (let i = 0; i < 3; i += 1) await flaky.time.tick();
    expect(flaky.controller.getState().job).toMatchObject({ status: "done" });

    const dead = maker({ make: [ok(view())], status: ["network-error"] });
    await dead.controller.start("f", "/film/img/s1/pic.jpg");
    for (let i = 0; i < 5; i += 1) await dead.time.tick();
    expect(dead.controller.getState().job).toMatchObject({ status: "error", message: expect.stringContaining("editor's server") });
    expect(dead.time.pending()).toBe(0);
  });

  it("knows when the server has forgotten the job (it was restarted)", async () => {
    const { controller, time } = maker({ make: [ok(view())], status: [{ status: 404, json: { error: "not-found", message: "No such depth map job." } }] });
    await controller.start("f", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(controller.getState().job).toMatchObject({ status: "error", message: expect.stringContaining("restarted") });
  });

  it("forgets a finished job when asked, never a running one", async () => {
    const { controller, time } = maker({ make: [ok(view())], status: [ok(doneView())] });
    await controller.start("f", "/film/img/s1/pic.jpg");
    controller.dismiss();
    expect(controller.getState().job).not.toBeNull();
    await time.tick();
    controller.dismiss();
    expect(controller.getState().job).toBeNull();
  });
});

describe("making the cut-outs of the selected shot", () => {
  it("follows the steps, then puts the depth map, the plate and the cut-outs on the shot it was started for, in one go", async () => {
    const { controller, server, time, appliedCutouts, applied } = maker({
      cutouts: [ok(cutoutsView())],
      status: [
        ok(cutoutsView({ step: { n: 1, of: 5, text: "finding the people" } })),
        ok(cutoutsView({ step: { n: 3, of: 5, text: "cutting out (2)" }, current: "cutting out (2)", log: ["  3/5 cutting out (2)"] })),
        ok(cutoutsDoneView()),
      ],
    });
    await controller.startCutouts("frame-7", "/film/img/s1/pic.jpg?v=3");
    expect(server.calls[0]).toMatchObject({ route: "cutouts", method: "POST", body: { picture: "/film/img/s1/pic.jpg", quality: "best" } });
    expect(controller.getState().job).toMatchObject({ kind: "cutouts", frameId: "frame-7", status: "running", id: "job-1" });

    await time.tick();
    expect(controller.getState().job?.step).toEqual({ n: 1, of: 5, text: "finding the people" });
    await time.tick();
    expect(controller.getState().job).toMatchObject({ step: { n: 3, of: 5, text: "cutting out (2)" }, current: "cutting out (2)" });
    expect(appliedCutouts).toEqual([]);
    await time.tick();

    expect(appliedCutouts).toEqual([
      [
        "frame-7",
        "/film/img/s1/pic.jpg",
        {
          depthMap: `${FOLDER}/depth.png`,
          plate: `${FOLDER}/plate.jpg`,
          // only what the shot keeps: the picture of each person and the depth it moves at
          cutouts: [
            { image: `${FOLDER}/cutout-1.png`, depth: 0.62 },
            { image: `${FOLDER}/cutout-2.png`, depth: 0.4 },
          ],
        },
      ],
    ]);
    expect(applied).toEqual([]); // not through the depth-map-only path
    expect(controller.getState().job).toMatchObject({ kind: "cutouts", status: "done", applied: true, note: null, caution: null });
    expect(controller.getState().job?.result?.review).toBe(`${FOLDER}/review.jpg`);
    expect(time.pending()).toBe(0);
  });

  it("passes on the shot's caution (the camera is a dolly, which does not use depth)", async () => {
    const { controller, time } = maker(
      { cutouts: [ok(cutoutsView())], status: [ok(cutoutsDoneView())] },
      { applyCutouts: () => ({ applied: true, caution: "This shot's camera is a dolly." }) },
    );
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(controller.getState().job).toMatchObject({ status: "done", applied: true, caution: "This shot's camera is a dolly." });
  });

  it("says where the layers are when they could not go on the shot", async () => {
    const { controller, time } = maker(
      { cutouts: [ok(cutoutsView())], status: [ok(cutoutsDoneView())] },
      { applyCutouts: () => ({ applied: false, reason: "This shot's picture changed while the cut-outs were being made." }) },
    );
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick();
    const job = controller.getState().job as DepthMakerJob;
    expect(job).toMatchObject({ status: "done", applied: false, caution: null });
    expect(job.note).toBe(`This shot's picture changed while the cut-outs were being made. The layers are saved in ${FOLDER}.`);
  });

  it("when nobody was found, nothing is put on the shot, and it says so", async () => {
    const none = cutoutsDoneView({ ok: true, written: false, reason: "no-people", flags: [], seconds: 3.2 });
    const { controller, time, appliedCutouts } = maker({ cutouts: [ok(cutoutsView())], status: [ok(none)] });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(appliedCutouts).toEqual([]);
    expect(controller.getState().job).toMatchObject({ status: "done", applied: false, note: expect.stringContaining("No people were found") });
  });

  it("when people were found but none could be cut out cleanly, it says that instead", async () => {
    const none = cutoutsDoneView({ ok: true, written: false, reason: "nothing-cut", flags: ["Person 1: the matte came back empty."] });
    const { controller, time, appliedCutouts } = maker({ cutouts: [ok(cutoutsView())], status: [ok(none)] });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(appliedCutouts).toEqual([]);
    expect(controller.getState().job).toMatchObject({ status: "done", applied: false, note: expect.stringContaining("none could be cut out cleanly") });
  });

  it("keeps the shot's own depth map when it has one: the server is told which", async () => {
    const { controller, server } = maker({ cutouts: [ok(cutoutsView())], status: [ok(cutoutsView())] });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg", "/film/depth/s1/pic/depth.png");
    expect(server.calls[0].body).toEqual({ picture: "/film/img/s1/pic.jpg", quality: "best", sourceMap: "/film/depth/s1/pic/depth.png" });
  });

  it("when the server wants models first, shows its words and looks again at what is on this computer", async () => {
    const { controller, server } = maker({
      cutouts: [{ status: 412, json: { error: "models-missing", message: "Download these models first: BiRefNet general (full).", missing: ["matte-best"] } }],
      ready: [ok(ready())],
    });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await flush();
    expect(controller.getState().job).toMatchObject({ status: "error", message: expect.stringContaining("Download these models first") });
    expect(server.count("ready")).toBe(1);
  });

  it("when another page is already making something, looks again at that too", async () => {
    const { controller, server } = maker({
      cutouts: [{ status: 409, json: { error: "busy", message: "Something is already being made (a.jpg).", id: "other" } }],
      ready: [ok(ready({ busy: "other" }))],
    });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await flush();
    expect(controller.getState().job).toMatchObject({ status: "error", message: "Something is already being made (a.jpg)." });
    expect(server.count("ready")).toBe(1);
    expect(controller.getState().ready).toMatchObject({ busy: "other" });
  });

  it("can be cancelled", async () => {
    const { controller, time, appliedCutouts } = maker({
      cutouts: [ok(cutoutsView())],
      status: [ok(cutoutsView())],
      cancel: [ok(cutoutsView({ status: "cancelled", message: "Cancelled." }))],
    });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await controller.cancel();
    expect(controller.getState().job).toMatchObject({ kind: "cutouts", status: "cancelled", message: "Cancelled." });
    expect(appliedCutouts).toEqual([]);
    expect(time.pending()).toBe(0);
  });

  it("reports a failure with the server's own words", async () => {
    const { controller, time, appliedCutouts } = maker({
      cutouts: [ok(cutoutsView())],
      status: [ok(cutoutsView({ status: "error", message: "The cut-out worker ran out of memory." }))],
    });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick();
    expect(controller.getState().job).toMatchObject({ status: "error", message: "The cut-out worker ran out of memory." });
    expect(appliedCutouts).toEqual([]);
  });
});

describe("downloading models", () => {
  it("follows the download, then looks again at what is on this computer", async () => {
    const { controller, server, time } = maker({
      "models/download": [ok(downloadView())],
      status: [
        ok(downloadView({ percent: 45, current: "Downloading BiRefNet general (full) (once)" })),
        ok(downloadView({ status: "done", percent: 100, current: null, result: { ok: true, models: [{ id: "matte-best", file: ALL_MODELS["matte-best"].file, bytes: ALL_MODELS["matte-best"].bytes }] } })),
      ],
      ready: [ok(ready({ here: ["matte-best"] }))],
    });
    await controller.downloadModels(["matte-best"]);
    expect(server.calls[0]).toMatchObject({ route: "models/download", method: "POST", body: { ids: ["matte-best"] } });
    expect(controller.getState().download).toMatchObject({ status: "running", ids: ["matte-best"], id: "job-1" });
    expect(controller.getState().job).toBeNull();

    await time.tick();
    expect(controller.getState().download).toMatchObject({ status: "running", percent: 45, current: "Downloading BiRefNet general (full) (once)" });
    await time.tick();
    await flush();

    expect(controller.getState().download).toMatchObject({ status: "done", percent: 100 });
    expect(server.count("ready")).toBe(1);
    const here = (controller.getState().ready as DepthReady).models.find((model) => model.id === "matte-best");
    expect(here?.cached).toBe(true);
    expect(time.pending()).toBe(0);
  });

  it("a download that cannot start is shown in words", async () => {
    const { controller } = maker({ "models/download": [{ status: 409, json: { error: "busy", message: "Something is already being made (a.jpg).", id: "other" } }] });
    await controller.downloadModels(["matte-best"]);
    expect(controller.getState().download).toMatchObject({ status: "error", message: "Something is already being made (a.jpg)." });
  });

  it("downloads nothing for an empty list", async () => {
    const { controller, server } = maker({ "models/download": [ok(downloadView())] });
    await controller.downloadModels([]);
    expect(server.count("models/download")).toBe(0);
    expect(controller.getState().download).toBeNull();
  });

  it("can be cancelled", async () => {
    const { controller, time } = maker({
      "models/download": [ok(downloadView())],
      status: [ok(downloadView())],
      cancel: [ok(downloadView({ status: "cancelled", message: "Cancelled." }))],
      ready: [ok(ready())],
    });
    await controller.downloadModels(["matte-best"]);
    await controller.cancel();
    await flush();
    expect(controller.getState().download).toMatchObject({ status: "cancelled", message: "Cancelled." });
    expect(time.pending()).toBe(0);
  });

  it("gives up after five failed attempts to ask, and knows when the server forgot the download", async () => {
    const dead = maker({ "models/download": [ok(downloadView())], status: ["network-error"] });
    await dead.controller.downloadModels(["matte-best"]);
    for (let i = 0; i < 5; i += 1) await dead.time.tick();
    expect(dead.controller.getState().download).toMatchObject({ status: "error", message: expect.stringContaining("editor's server") });

    const forgotten = maker({ "models/download": [ok(downloadView())], status: [{ status: 404, json: { error: "not-found", message: "No such job." } }] });
    await forgotten.controller.downloadModels(["matte-best"]);
    await forgotten.time.tick();
    expect(forgotten.controller.getState().download).toMatchObject({ status: "error", message: expect.stringContaining("restarted") });
  });

  it("is forgotten when dismissed, after a finished job has been", async () => {
    const { controller, time } = maker({
      cutouts: [ok(cutoutsView())],
      "models/download": [ok(downloadView())],
      status: [ok(cutoutsDoneView()), ok(downloadView({ status: "done", percent: 100 }))],
      ready: [ok(ready())],
    });
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await time.tick(); // the cut-outs are done
    await controller.downloadModels(["matte-best"]);
    await time.tick(); // the download is done
    await flush();
    expect(controller.getState().job).not.toBeNull();
    expect(controller.getState().download).toMatchObject({ status: "done" });
    controller.dismiss();
    expect(controller.getState().job).toBeNull();
    expect(controller.getState().download).not.toBeNull();
    controller.dismiss();
    expect(controller.getState().download).toBeNull();
  });
});

describe("one thing at a time", () => {
  it("starts nothing while cut-outs are being made: no other shot, no depth map, no download", async () => {
    const { controller, server } = maker({ cutouts: [ok(cutoutsView())], status: [ok(cutoutsView())] });
    await controller.startCutouts("frame-1", "/film/img/s1/pic.jpg");
    await controller.startCutouts("frame-2", "/film/img/s1/other.jpg");
    await controller.start("frame-3", "/film/img/s1/third.jpg");
    await controller.downloadModels(["matte-best"]);
    expect(server.count("cutouts")).toBe(1);
    expect(server.count("make")).toBe(0);
    expect(server.count("models/download")).toBe(0);
    expect(controller.getState().job?.frameId).toBe("frame-1");
    expect(controller.getState().download).toBeNull();
  });

  it("starts nothing while a map is being made", async () => {
    const { controller, server } = maker({ make: [ok(view())], status: [ok(view())] });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await controller.start("frame-2", "/film/img/s1/other.jpg");
    await controller.startCutouts("frame-2", "/film/img/s1/other.jpg");
    expect(server.count("make")).toBe(1);
    expect(server.count("cutouts")).toBe(0);
    expect(controller.getState().job?.frameId).toBe("frame-1");
  });

  it("starts no job and no second download while models are being downloaded", async () => {
    const { controller, server } = maker({ "models/download": [ok(downloadView())], status: [ok(downloadView())] });
    await controller.downloadModels(["matte-best"]);
    await controller.start("f", "/film/img/s1/pic.jpg");
    await controller.startCutouts("f", "/film/img/s1/pic.jpg");
    await controller.downloadModels(["inpaint"]);
    expect(server.count("make")).toBe(0);
    expect(server.count("cutouts")).toBe(0);
    expect(server.count("models/download")).toBe(1);
    expect(controller.getState().job).toBeNull();
  });
});

// ---- what the rows show ---------------------------------------------------------------------------------------------

const job = (extra: Partial<DepthMakerJob> = {}): DepthMakerJob => ({
  kind: "depth",
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
  replace: false,
  startedAt: 10_000,
  applied: false,
  note: null,
  caution: null,
  ...extra,
});

const download = (extra: Partial<ModelDownload> = {}): ModelDownload => ({
  status: "running",
  id: "dl-1",
  ids: ["matte-best"],
  percent: null,
  current: null,
  message: null,
  startedAt: 10_000,
  ...extra,
});

const idle = (r: DepthReady | "unavailable" | null = ready(), extra: Partial<DepthMakerState> = {}): DepthMakerState => ({ ready: r, quality: "best", job: null, download: null, ...extra });

const row = (state: DepthMakerState, extra: Partial<Parameters<typeof depthRowView>[0]> = {}) =>
  depthRowView({ frameId: "f1", picture: "/film/img/s1/pic.jpg", hasDepthMap: false, state, now: 25_000, ...extra });

const cutRow = (state: DepthMakerState, extra: Partial<Parameters<typeof cutoutsRowView>[0]> = {}) =>
  cutoutsRowView({ frameId: "f1", picture: "/film/img/s1/pic.jpg", hasCutouts: false, state, now: 25_000, ...extra });

describe("what the Make depth map row shows", () => {
  it("nothing for a picture that cannot have one, or a shot that has one", () => {
    expect(row(idle(), { picture: "asset:abc" })).toEqual({ kind: "hidden" });
    expect(row(idle(), { picture: undefined })).toEqual({ kind: "hidden" });
  });

  it("a shot that already has a depth map offers, quietly, to make a new one: only when everything is in order", () => {
    expect(row(idle(), { hasDepthMap: true })).toMatchObject({ kind: "redo", note: expect.stringContaining("The old file is not lost") });
    expect((row(idle(ready({ here: ["depth-large"] })), { hasDepthMap: true }) as { note: string }).note).toContain("Made on this computer from this picture (Depth Anything V2 Large).");
    // nothing for a shot whose depth map goes with its cut-outs, or while the computer is not ready
    expect(row(idle(), { hasDepthMap: true, hasCutouts: true })).toEqual({ kind: "hidden" });
    expect(row(idle(null), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle("unavailable"), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle(ready({ packages: false })), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle(ready({ busy: "other" })), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle(ready(), { job: job({ frameId: "f2" }) }), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle(ready(), { download: download() }), { hasDepthMap: true })).toEqual({ kind: "hidden" });
    expect(row(idle(), { hasDepthMap: true, picture: "asset:abc" })).toEqual({ kind: "hidden" });
  });

  it("when the picture's map file is already on disk, offers to use it or to make a new one", () => {
    const view = row(idle(), { existingMap: "/film/depth/s1/pic/depth.png" }) as { kind: string; note: string; existingMap?: string };
    expect(view.kind).toBe("ready");
    expect(view.existingMap).toBe("/film/depth/s1/pic/depth.png");
    expect(view.note).toContain("already has a depth map file (/film/depth/s1/pic/depth.png). Use it, or make a new one.");
    expect(view.note).toContain("The old file is not lost");
    // no such file: the plain button
    expect(row(idle())).not.toHaveProperty("existingMap");
  });

  it("waits while it asks, and says so when there is no server", () => {
    expect(row(idle(null))).toEqual({ kind: "checking" });
    expect(row(idle("unavailable"))).toEqual({ kind: "unavailable" });
  });

  it("offers the one-time setup when Python or its packages are missing", () => {
    expect(row(idle(ready({ python: null, packages: false })))).toEqual({ kind: "setup-needed", command: DEPTH_SETUP_COMMAND });
    expect(row(idle(ready({ packages: false })))).toMatchObject({ kind: "setup-needed" });
    expect(DEPTH_SETUP_COMMAND).toBe("npm run depth:setup");
  });

  it("is ready, and says which model it will use, what it must download first, and whose licence", () => {
    expect(row(idle(ready()))).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture. The first one downloads Depth Anything V2 Large (1.3 GB), once. Its licence is non-commercial.",
    });
    expect(row(idle(ready({ here: ["depth-large"] })))).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture (Depth Anything V2 Large). Its licence is non-commercial.",
    });
    // "fast" is the small, permissive one
    expect(row(idle(ready(), { quality: "fast" }))).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture. The first one downloads Depth Anything V2 Small (99 MB), once.",
    });
    expect(row(idle(ready({ here: ["depth-small"] }), { quality: "fast" }))).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture (Depth Anything V2 Small).",
    });
  });

  it("says why the graphics card is not used when its package is installed but cannot load (and nothing when there is no such package)", () => {
    const why = "Failed to create CUDAExecutionProvider. Require cuDNN 9.* and CUDA 12.*";
    expect(row(idle(ready({ here: ["depth-large"], gpuNote: why })))).toMatchObject({ note: expect.stringMatching(new RegExp(` Not using your graphics card: ${why.replace(/[.*]/g, "\\$&")}$`)) });
    expect((row(idle(ready({ here: ["depth-large"] }))) as { note: string }).note).not.toContain("graphics card");
    expect((row(idle(ready({ here: ["depth-large"], gpu: true, gpuNote: null }))) as { note: string }).note).toContain("Uses your graphics card.");
  });

  it("says when it will use the graphics card, and when the model file is one of your own", () => {
    expect(row(idle(ready({ here: ["depth-large"], gpu: true })))).toMatchObject({ note: expect.stringMatching(/ Uses your graphics card\.$/) });
    expect(row(idle(ready({ patch: { "depth-large": { overridden: true, cached: true } } })))).toMatchObject({
      kind: "ready",
      note: "Made on this computer from this picture, with your model file.",
    });
    expect(row(idle(ready({ patch: { "depth-large": { overridden: true, cached: false } } })))).toMatchObject({
      kind: "ready",
      note: expect.stringContaining("was not found"),
    });
  });

  it("is busy when something is being made for another shot, a download is running, or another page is busy", () => {
    expect(row(idle(ready(), { job: job({ frameId: "f2" }) }))).toMatchObject({ kind: "busy" });
    expect(row(idle(ready(), { download: download() }))).toMatchObject({ kind: "busy", note: expect.stringContaining("downloaded") });
    expect(row(idle(ready({ busy: "someone-else" })))).toMatchObject({ kind: "busy" });
    // the cut-outs of this very shot also keep the depth map button waiting, and the note says it is this shot
    expect(row(idle(ready(), { job: job({ kind: "cutouts" }) }))).toEqual({ kind: "busy", note: "The cut-outs of this shot are being made, depth map included. One thing at a time." });
    expect(row(idle(ready(), { job: job({ frameId: "f2" }) }))).toEqual({ kind: "busy", note: "Something is being made for another shot. One thing at a time." });
    // a finished job for another shot does not block this one
    expect(row(idle(ready(), { job: job({ frameId: "f2", status: "done" }) }))).toMatchObject({ kind: "ready" });
  });

  it("shows progress while it works: starting, the model download with its percent, then the making with its seconds", () => {
    expect(row(idle(ready(), { job: job({ status: "starting", id: null }) }))).toEqual({ kind: "running", percent: null, phase: "Starting…", cancellable: false });
    expect(row(idle(ready(), { job: job({ percent: 40, current: "Downloading Depth Anything V2 Large (once)" }) }))).toEqual({
      kind: "running",
      percent: 40,
      phase: "Downloading Depth Anything V2 Large (once)… 40%",
      cancellable: true,
    });
    expect(row(idle(ready(), { job: job() }))).toEqual({ kind: "running", percent: null, phase: "Making the depth map… 15 s", cancellable: true });
    expect(row(idle(ready(), { job: job({ percent: 100, current: "Downloading x" }) }))).toMatchObject({ phase: "Making the depth map… 15 s" });
    // a percent with nothing saying it is a download is not shown as one
    expect(row(idle(ready(), { job: job({ percent: 40, current: null }) }))).toMatchObject({ percent: null, phase: "Making the depth map… 15 s" });
    // the first use of a model is checked, which takes a while for a big file: say so
    expect(row(idle(ready(), { job: job({ current: "Checking Depth Anything V2 Large (once)" }) }))).toEqual({
      kind: "running",
      percent: null,
      phase: "Checking Depth Anything V2 Large (once)… 15 s",
      cancellable: true,
    });
  });

  it("keeps showing the job on its own shot even once the map is on it", () => {
    const done = job({ status: "done", applied: true, result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, provider: "gpu", seconds: 6.5 } });
    const shown = row(idle(ready(), { job: done }), { hasDepthMap: true });
    expect(shown).toMatchObject({ kind: "done", text: "Depth map made (1920×1080, 6.5 s on the GPU). Turn on MAP in the Depth Maps lane to see it." });
    // the people warning points at the cut-outs button
    expect((shown as { caution: string }).caution).toContain("people");
    expect((shown as { caution: string }).caution).toContain("Make cutouts");
    // on another shot it is gone
    expect(row(idle(ready(), { job: done }), { frameId: "f2", hasDepthMap: true })).toMatchObject({ kind: "redo" }); // not the job: the quiet offer
  });

  it("says a map made again was redone, and where the old file is kept", () => {
    const done = job({ status: "done", applied: true, replace: true, result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, provider: "gpu", seconds: 4.2, archived: "depth--v1.png" } });
    expect((row(idle(ready(), { job: done }), { hasDepthMap: true }) as { text: string }).text).toBe(
      "Depth map redone (1920×1080, 4.2 s on the GPU). The old file is kept as depth--v1.png. Turn on MAP in the Depth Maps lane to see it.",
    );
  });

  it("says a map that was already there was attached, and does not claim it was made", () => {
    const text = (extra: Partial<DepthMakerJob>) => (row(idle(ready(), { job: job({ status: "done", existing: true, ...extra }) })) as { text: string }).text;
    expect(text({ applied: true })).toBe("This picture already had a depth map. It is now this shot's. If it looks wrong, press OK and then Make a new one.");
    expect(text({ applied: false, note: "The picture changed." })).toBe("This picture already has a depth map.");
  });

  it("shows the reason when the map could not go on the shot, and no people warning for a map that is not on it", () => {
    const shown = row(idle(ready(), { job: job({ status: "done", applied: false, note: "The picture changed. The map is saved at /film/depth/s1/pic/depth.png." }) }));
    expect(shown).toMatchObject({ kind: "done", caution: null, note: expect.stringContaining("saved at") });
    expect((shown as { text: string }).text).not.toContain("Turn on MAP");
  });

  it("when the start failed because the computer is not set up, shows the setup help rather than a bare error", () => {
    const failed = job({ status: "error", message: "One-time setup needed: run  npm run depth:setup  in the project folder, then try again." });
    expect(row(idle(ready({ python: null, packages: false }), { job: failed }))).toEqual({ kind: "setup-needed", command: DEPTH_SETUP_COMMAND });
    expect(row(idle(ready({ packages: false }), { job: failed }))).toMatchObject({ kind: "setup-needed" });
    // set up, or not known: the error is shown as it is
    expect(row(idle(ready(), { job: failed }))).toMatchObject({ kind: "failed" });
    expect(row(idle(null, { job: failed }))).toMatchObject({ kind: "failed" });
    // a cancel is never mistaken for it
    expect(row(idle(ready({ packages: false }), { job: job({ status: "cancelled" }) }))).toMatchObject({ kind: "failed", cancelled: true, message: "Cancelled." });
  });

  it("shows a failure and a cancel, in words", () => {
    expect(row(idle(ready(), { job: job({ status: "error", message: "No space left." }) }))).toEqual({ kind: "failed", cancelled: false, message: "No space left." });
    // a cancel you asked for is not an error
    expect(row(idle(ready(), { job: job({ status: "cancelled", message: null }) }))).toEqual({ kind: "failed", cancelled: true, message: "Cancelled." });
    expect(row(idle(ready(), { job: job({ status: "error", message: null }) }))).toEqual({ kind: "failed", cancelled: false, message: "The depth map could not be made." });
  });

  it("does not show cut-outs being made as a depth map", () => {
    expect(row(idle(ready(), { job: job({ kind: "cutouts", status: "done" }) }))).toMatchObject({ kind: "ready" });
  });
});

describe("which models the cut-outs need", () => {
  it("the people finder, the matte, the plate filler and the depth model of the chosen quality", () => {
    expect(modelsNeededForCutouts(ready(), "best", false).map((model) => model.id)).toEqual(BEST);
    expect(modelsNeededForCutouts(ready(), "fast", false).map((model) => model.id)).toEqual(FAST);
  });

  it("no depth model when the shot's own depth map is kept", () => {
    expect(modelsNeededForCutouts(ready(), "best", true).map((model) => model.id)).toEqual(["people", "matte-best", "inpaint"]);
  });

  it("nothing from a server that does not say which models a quality uses", () => {
    expect(modelsNeededForCutouts({ ...ready(), qualities: undefined as never }, "best", false)).toEqual([]);
  });
});

describe("what the Make cutouts row shows", () => {
  it("nothing for a picture that cannot have one, or a shot that already has cut-outs", () => {
    expect(cutRow(idle(), { picture: "asset:abc" })).toEqual({ kind: "hidden" });
    expect(cutRow(idle(), { picture: undefined })).toEqual({ kind: "hidden" });
    expect(cutRow(idle(), { hasCutouts: true })).toEqual({ kind: "hidden" });
  });

  it("waits while it asks, says so when there is no server, and offers the one-time setup", () => {
    expect(cutRow(idle(null))).toEqual({ kind: "checking" });
    expect(cutRow(idle("unavailable"))).toEqual({ kind: "unavailable" });
    expect(cutRow(idle(ready({ python: null, packages: false })))).toEqual({ kind: "setup-needed", command: DEPTH_SETUP_COMMAND });
  });

  it("asks for the models first when they are not on this computer: which, how big, and whose licence", () => {
    const nothing = cutRow(idle(ready()));
    expect(nothing).toMatchObject({ kind: "models-missing", bytes: bytesOf(BEST), nonCommercial: true });
    expect((nothing as { missing: ModelStatus[] }).missing.map((model) => model.id)).toEqual(BEST);

    // only what is not here yet
    const some = cutRow(idle(ready({ here: ["people", "inpaint"] })));
    expect((some as { missing: ModelStatus[] }).missing.map((model) => model.id)).toEqual(["matte-best", "depth-large"]);
    expect(some).toMatchObject({ bytes: bytesOf(["matte-best", "depth-large"]) });

    // a model of your own counts as here
    const mine = cutRow(idle(ready({ here: ["people", "inpaint", "depth-large"], patch: { "matte-best": { overridden: true, cached: true } } })));
    expect(mine).toMatchObject({ kind: "ready" });
  });

  it("'fast' asks for the small models, none of which is non-commercial", () => {
    const fast = cutRow(idle(ready(), { quality: "fast" }));
    expect((fast as { missing: ModelStatus[] }).missing.map((model) => model.id)).toEqual(FAST);
    expect(fast).toMatchObject({ bytes: bytesOf(FAST), nonCommercial: false });
  });

  it("does not ask for a depth model when the shot's depth map is kept", () => {
    const kept = cutRow(idle(ready()), { keptMap: "/film/depth/s1/pic/depth.png" });
    expect((kept as { missing: ModelStatus[] }).missing.map((model) => model.id)).toEqual(["people", "matte-best", "inpaint"]);
    expect(kept).toMatchObject({ nonCommercial: false });
    expect(cutRow(idle(ready({ here: ["people", "matte-best", "inpaint"] })), { keptMap: "/film/depth/s1/pic/depth.png" })).toMatchObject({ kind: "ready", keepsMap: true });
  });

  it("shows a download of the models in progress, with its percent", () => {
    expect(cutRow(idle(ready(), { download: download({ percent: 45, current: "Downloading BiRefNet general (full) (once)" }) }))).toEqual({
      kind: "downloading",
      phase: "Downloading BiRefNet general (full) (once)… 45%",
      percent: 45,
      cancellable: true,
    });
    expect(cutRow(idle(ready(), { download: download({ status: "starting", id: null }) }))).toEqual({
      kind: "downloading",
      phase: "Downloading models…",
      percent: null,
      cancellable: false,
    });
    // at 100% it is finishing, not downloading
    expect(cutRow(idle(ready(), { download: download({ percent: 100, current: "Downloading x" }) }))).toMatchObject({ percent: null });
  });

  it("is busy when something is being made for another shot or by another page", () => {
    expect(cutRow(idle(ready(), { job: job({ frameId: "f2", kind: "cutouts" }) }))).toEqual({ kind: "busy", note: "Something is being made for another shot. One thing at a time." });
    expect(cutRow(idle(ready(), { job: job({ frameId: "f2" }) }))).toMatchObject({ kind: "busy" });
    // a depth map of this very shot keeps the cut-outs button waiting, and says so
    expect(cutRow(idle(ready(), { job: job() }))).toEqual({ kind: "busy", note: "The depth map of this shot is being made. One thing at a time." });
    expect(cutRow(idle(ready({ busy: "someone-else" })))).toMatchObject({ kind: "busy" });
    expect(cutRow(idle(ready(), { job: job({ frameId: "f2", kind: "cutouts", status: "done" }) }))).toMatchObject({ kind: "models-missing" });
  });

  it("is ready when the models are here, and says what will happen and how long", () => {
    const here = ready({ here: BEST });
    const cpu = cutRow(idle(here)) as { kind: string; note: string; keepsMap: boolean };
    expect(cpu).toMatchObject({ kind: "ready", keepsMap: false });
    expect(cpu.note).toContain("Finds the people in this picture, cuts each one out, paints in what was behind them, and makes the depth map");
    expect(cpu.note).toContain("A few minutes on the CPU.");
    expect((cutRow(idle(ready({ here: BEST, gpu: true }))) as { note: string }).note).toContain("A few seconds on your graphics card.");
    const kept = cutRow(idle(here), { keptMap: "/film/depth/s1/pic/depth.png" }) as { note: string; keepsMap: boolean };
    expect(kept.keepsMap).toBe(true);
    expect(kept.note).toContain("paints them out of the depth map you have (kept as it is)");
  });

  it("says why the graphics card is not used, in the note and after a run that ended on the CPU", () => {
    const why = "cudnn64_9.dll could not be loaded";
    const note = (cutRow(idle(ready({ here: BEST, gpuNote: why }))) as { note: string }).note;
    expect(note).toContain("A few minutes on the CPU.");
    expect(note).toContain(`Not using your graphics card: ${why}`);
    expect((cutRow(idle(ready({ here: BEST }))) as { note: string }).note).not.toContain("graphics card");
    const done = job({ kind: "cutouts", status: "done", applied: true, result: cutoutsResult({ provider: "cpu", seconds: 101.1, gpuNote: why }) });
    expect((cutRow(idle(ready(), { job: done }), { hasCutouts: true }) as { text: string }).text).toBe(
      `2 cut-outs, a plate and a depth map made in 101.1 s on the CPU. This shot now uses them (one undo step). Your graphics card was not used: ${why}`,
    );
    const depthDone = job({ status: "done", applied: true, result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, provider: "cpu", seconds: 30, gpuNote: why } });
    expect((row(idle(ready(), { job: depthDone }), { hasDepthMap: true }) as { text: string }).text).toContain(`Your graphics card was not used: ${why}`);
    // a run that used the GPU never mentions it
    const fine = job({ kind: "cutouts", status: "done", applied: true, result: cutoutsResult({ provider: "gpu" }) });
    expect((cutRow(idle(ready(), { job: fine }), { hasCutouts: true }) as { text: string }).text).not.toContain("not used");
  });

  it("shows the steps while it works, with its seconds", () => {
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", status: "starting", id: null }) }))).toEqual({ kind: "running", phase: "Starting…", progress: null, cancellable: false });
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts" }) }))).toEqual({ kind: "running", phase: "Working… 15 s", progress: null, cancellable: true });
    // before the first step the command may be checking a model it has not used before
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", current: "Checking BiRefNet general (full) (once)" }) }))).toEqual({
      kind: "running",
      phase: "Checking BiRefNet general (full) (once)… 15 s",
      progress: null,
      cancellable: true,
    });
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", step: { n: 3, of: 5, text: "cutting out (2)" } }) }))).toEqual({
      kind: "running",
      phase: "Step 3 of 5: cutting out (2) · 15 s",
      progress: 40,
      cancellable: true,
    });
  });

  it("shows a failure and a cancel, in words", () => {
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", status: "error", message: "Out of memory." }) }))).toEqual({ kind: "failed", cancelled: false, message: "Out of memory." });
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", status: "cancelled", message: null }) }))).toEqual({ kind: "failed", cancelled: true, message: "Cancelled." });
    expect(cutRow(idle(ready(), { job: job({ kind: "cutouts", status: "error", message: null }) }))).toEqual({ kind: "failed", cancelled: false, message: "The cut-outs could not be made." });
  });

  it("says what was made, links its review sheet, lists what to look at, and keeps showing it on its own shot", () => {
    const done = job({
      kind: "cutouts",
      status: "done",
      applied: true,
      result: cutoutsResult({ flags: ["Person 2 is clipped at the picture's edge."] }),
      caution: "This shot's camera is a dolly.",
    });
    expect(cutRow(idle(ready(), { job: done }), { hasCutouts: true })).toEqual({
      kind: "done",
      made: true,
      text: "2 cut-outs, a plate and a depth map made in 21.4 s on the GPU. This shot now uses them (one undo step).",
      flags: ["Person 2 is clipped at the picture's edge."],
      caution: "This shot's camera is a dolly.",
      note: null,
      review: `${FOLDER}/review.jpg`,
    });
    // one person
    const single = job({ kind: "cutouts", status: "done", applied: true, result: cutoutsResult({ cutouts: [cutoutsResult().cutouts![0]], provider: "cpu", seconds: 140 }) });
    expect((cutRow(idle(ready(), { job: single }), { hasCutouts: true }) as { text: string }).text).toBe(
      "1 cut-out, a plate and a depth map made in 140 s on the CPU. This shot now uses them (one undo step).",
    );
    // on another shot it is gone
    expect(cutRow(idle(ready(), { job: done }), { frameId: "f2", hasCutouts: true })).toEqual({ kind: "hidden" });
  });

  it("says where the layers are when they could not go on the shot", () => {
    const shown = cutRow(idle(ready(), { job: job({ kind: "cutouts", status: "done", applied: false, result: cutoutsResult(), note: `The picture changed. The layers are saved in ${FOLDER}.` }) }));
    expect(shown).toMatchObject({ kind: "done", made: true, text: "2 cut-outs made in 21.4 s on the GPU.", note: expect.stringContaining("saved in"), review: `${FOLDER}/review.jpg` });
  });

  it("says plainly when nobody was found, and still shows what the finder noticed", () => {
    const none = job({
      kind: "cutouts",
      status: "done",
      applied: false,
      result: cutoutsResult({ written: false, reason: "no-people", cutouts: undefined, review: undefined, flags: ["A face on a television was not counted."] }),
      note: "No people were found in this picture, so nothing was made. A depth map alone is fine here.",
    });
    expect(cutRow(idle(ready(), { job: none }))).toEqual({
      kind: "done",
      made: false,
      text: "No people were found in this picture, so nothing was made. A depth map alone is fine here.",
      flags: ["A face on a television was not counted."],
      caution: null,
      note: null,
      review: null,
    });
  });
});

describe("what the models list shows", () => {
  it("nothing until the server has answered, or when there is none", () => {
    expect(modelsPanelView(idle(null))).toBeNull();
    expect(modelsPanelView(idle("unavailable"))).toBeNull();
    expect(modelsPanelView(idle({ ...ready(), qualities: undefined as never }))).toBeNull();
  });

  it("the four models of the chosen quality, in the order they are used, with what each is for", () => {
    const best = modelsPanelView(idle(ready({ here: ["people"] })))!;
    expect(best.quality).toBe("best");
    expect(best.rows.map((entry) => entry.model.id)).toEqual(BEST);
    expect(best.rows.map((entry) => entry.usedFor)).toEqual(["finds the people", "cuts them out", "paints the plate", "makes the depth map"]);
    expect(best.totalBytes).toBe(bytesOf(BEST));
    expect(best.missingIds).toEqual(["matte-best", "inpaint", "depth-large"]);
    expect(best.missingBytes).toBe(bytesOf(["matte-best", "inpaint", "depth-large"]));
    expect(best.allHere).toBe(false);
    expect(best.nonCommercial).toBe(true);
    expect(best.modelsDir).toBe("/home/me/.cache/scarlet-keyframe/models");

    const fast = modelsPanelView(idle(ready(), { quality: "fast" }))!;
    expect(fast.rows.map((entry) => entry.model.id)).toEqual(FAST);
    expect(fast.nonCommercial).toBe(false);
  });

  it("knows when everything is here", () => {
    const all = modelsPanelView(idle(ready({ here: BEST })))!;
    expect(all.allHere).toBe(true);
    expect(all.missingIds).toEqual([]);
    expect(all.missingBytes).toBe(0);
  });

  it("waits to download while anything is being made or downloaded", () => {
    expect(modelsPanelView(idle(ready()))!.busy).toBe(false);
    expect(modelsPanelView(idle(ready(), { download: download() }))!.busy).toBe(true);
    expect(modelsPanelView(idle(ready(), { job: job() }))!.busy).toBe(true);
    expect(modelsPanelView(idle(ready({ busy: "other-page" })))!.busy).toBe(true);
    expect(modelsPanelView(idle(ready(), { job: job({ status: "done" }), download: download({ status: "done" }) }))!.busy).toBe(false);
  });
});
