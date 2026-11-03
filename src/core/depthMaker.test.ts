import { describe, expect, it } from "vitest";
import { depthMapRefFor } from "../../scripts/depth/lib.mjs";
import type { DepthJobView, DepthReady } from "./depthApiTypes";
import {
  DEPTH_SETUP_COMMAND,
  DepthApiFailure,
  cancelDepthJob,
  createDepthMaker,
  depthMapRefForPicture,
  depthRowView,
  fetchDepthJob,
  fetchDepthReady,
  pictureCanHaveDepthMap,
  plainPictureRef,
  startDepthJob,
  type DepthMakerJob,
  type DepthMakerState,
} from "./depthMaker";

// ---- helpers: a fake server, a clock the test winds by hand ---------------------------------------------------------

const ready = (extra: Partial<DepthReady> = {}): DepthReady => ({
  ok: true,
  python: ".depth-venv",
  packages: true,
  gpu: false,
  model: { name: "base", mb: 389, cached: false, custom: false },
  busy: null,
  ...extra,
});

const view = (extra: Partial<DepthJobView> = {}): DepthJobView => ({
  id: "job-1",
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

function maker(routes: Record<string, Reply[]>, apply?: Parameters<typeof createDepthMaker>[0]["apply"]) {
  const server = fakeServer(routes);
  const time = clock();
  const applied: [string, string, string][] = [];
  const controller = createDepthMaker({
    fetch: server.fetch,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    now: () => 1_000,
    apply:
      apply ??
      ((frameId, picture, mapRef) => {
        applied.push([frameId, picture, mapRef]);
        return { applied: true };
      }),
  });
  return { controller, server, time, applied };
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

// ---- the API client -------------------------------------------------------------------------------------------------

describe("asking the server", () => {
  it("fetchDepthReady gives what the server says, and null when there is no depth API", async () => {
    expect(await fetchDepthReady(fakeServer({ ready: [ok(ready())] }).fetch)).toEqual(ready());
    expect(await fetchDepthReady(fakeServer({}).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: ["network-error"] }).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: [ok({ hello: "a static host's page" })] }).fetch)).toBeNull();
    expect(await fetchDepthReady(fakeServer({ ready: [{ status: 403, json: { error: "forbidden", message: "no" } }] }).fetch)).toBeNull();
  });

  it("fetchDepthReady(fresh) asks the server to look again", async () => {
    const server = fakeServer({ ready: [ok(ready())] });
    await fetchDepthReady(server.fetch, true);
    await fetchDepthReady(server.fetch);
    expect(server.calls.map((call) => call.route)).toEqual(["ready", "ready"]);
  });

  it("startDepthJob sends the picture as JSON", async () => {
    const server = fakeServer({ make: [ok(view())] });
    expect((await startDepthJob("/film/img/s1/pic.jpg", server.fetch)).id).toBe("job-1");
    expect(server.calls[0]).toMatchObject({ route: "make", method: "POST", body: { picture: "/film/img/s1/pic.jpg" } });
  });

  it("a refusal carries the server's kind, message and job", async () => {
    const server = fakeServer({ make: [{ status: 409, json: { error: "busy", message: "Another depth map is being made (a.jpg).", id: "other" } }] });
    const failure = await startDepthJob("/film/img/s1/pic.jpg", server.fetch).catch((error) => error);
    expect(failure).toBeInstanceOf(DepthApiFailure);
    expect(failure).toMatchObject({ kind: "busy", message: "Another depth map is being made (a.jpg).", id: "other" });
  });

  it("a server that cannot be reached is 'network', and an odd answer still says something", async () => {
    const unreachable = await startDepthJob("/film/img/s1/pic.jpg", fakeServer({ make: ["network-error"] }).fetch).catch((error) => error);
    expect(unreachable).toMatchObject({ kind: "network" });
    expect(unreachable.message).toContain("editor's server");
    const odd = await startDepthJob("/film/img/s1/pic.jpg", fakeServer({ make: [{ status: 500, json: "oops" }] }).fetch).catch((error) => error);
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

describe("making a map", () => {
  it("follows the job and puts the finished map on the shot it was started for", async () => {
    const { controller, server, time, applied } = maker({
      make: [ok(view())],
      status: [ok(view({ percent: 40, log: ["Downloading depth.onnx"] })), ok(view({ percent: 100 })), ok(doneView())],
    });
    await controller.start("frame-7", "/film/img/s1/pic.jpg");
    expect(controller.getState().job).toMatchObject({ frameId: "frame-7", status: "running", id: "job-1" });
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
    const { controller, time } = maker({ make: [ok(view())], status: [ok(doneView())] }, () => ({ applied: false, reason: "The picture changed while the map was being made." }));
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

  it("starts nothing new while a map is being made", async () => {
    const { controller, server } = maker({ make: [ok(view())], status: [ok(view())] });
    await controller.start("frame-1", "/film/img/s1/pic.jpg");
    await controller.start("frame-2", "/film/img/s1/other.jpg");
    expect(server.count("make")).toBe(1);
    expect(controller.getState().job?.frameId).toBe("frame-1");
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

// ---- what the row shows ---------------------------------------------------------------------------------------------

const job = (extra: Partial<DepthMakerJob> = {}): DepthMakerJob => ({
  frameId: "f1",
  picture: "/film/img/s1/pic.jpg",
  status: "running",
  id: "job-1",
  percent: null,
  log: [],
  message: null,
  result: null,
  existing: false,
  startedAt: 10_000,
  applied: false,
  note: null,
  ...extra,
});

const row = (state: DepthMakerState, extra: Partial<Parameters<typeof depthRowView>[0]> = {}) =>
  depthRowView({ frameId: "f1", picture: "/film/img/s1/pic.jpg", hasDepthMap: false, state, now: 25_000, ...extra });

describe("what the Make depth map row shows", () => {
  it("nothing for a picture that cannot have one, or a shot that has one", () => {
    const state: DepthMakerState = { ready: ready(), job: null };
    expect(row(state, { picture: "asset:abc" })).toEqual({ kind: "hidden" });
    expect(row(state, { picture: undefined })).toEqual({ kind: "hidden" });
    expect(row(state, { hasDepthMap: true })).toEqual({ kind: "hidden" });
  });

  it("waits while it asks, and says so when there is no server", () => {
    expect(row({ ready: null, job: null })).toEqual({ kind: "checking" });
    expect(row({ ready: "unavailable", job: null })).toEqual({ kind: "unavailable" });
  });

  it("offers the one-time setup when Python or its packages are missing", () => {
    expect(row({ ready: ready({ python: null, packages: false }), job: null })).toEqual({ kind: "setup-needed", command: DEPTH_SETUP_COMMAND });
    expect(row({ ready: ready({ packages: false }), job: null })).toMatchObject({ kind: "setup-needed" });
    expect(DEPTH_SETUP_COMMAND).toBe("npm run depth:setup");
  });

  it("is ready, and says what will happen: the model download the first time, the GPU when there is one", () => {
    expect(row({ ready: ready(), job: null })).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture. The first one downloads a 389 MB model, once.",
    });
    expect(row({ ready: ready({ model: { name: "base", mb: 389, cached: true, custom: false }, gpu: true }), job: null })).toEqual({
      kind: "ready",
      note: "Made on this computer from this picture. Uses your graphics card.",
    });
    expect(row({ ready: ready({ model: { name: "mine.onnx", mb: 0, cached: true, custom: true } }), job: null })).toMatchObject({
      note: expect.stringContaining("your model file"),
    });
    expect(row({ ready: ready({ model: { name: "gone.onnx", mb: 0, cached: false, custom: true } }), job: null })).toMatchObject({
      kind: "ready",
      note: expect.stringContaining("was not found"),
    });
  });

  it("is busy when a map is being made for another shot, or by another page", () => {
    expect(row({ ready: ready(), job: job({ frameId: "f2" }) })).toMatchObject({ kind: "busy" });
    expect(row({ ready: ready({ busy: "someone-else" }), job: null })).toMatchObject({ kind: "busy" });
    // a finished job for another shot does not block this one
    expect(row({ ready: ready(), job: job({ frameId: "f2", status: "done" }) })).toMatchObject({ kind: "ready" });
  });

  it("shows progress while it works: starting, the model download with its percent, then the making with its seconds", () => {
    expect(row({ ready: ready(), job: job({ status: "starting", id: null }) })).toEqual({ kind: "running", percent: null, phase: "Starting…", cancellable: false });
    expect(row({ ready: ready(), job: job({ percent: 40, log: ["Downloading depth_anything_v2_vitb.onnx (389 MB)."] }) })).toEqual({
      kind: "running",
      percent: 40,
      phase: "Downloading the model (once)… 40%",
      cancellable: true,
    });
    expect(row({ ready: ready(), job: job() })).toEqual({ kind: "running", percent: null, phase: "Making the depth map… 15 s", cancellable: true });
    expect(row({ ready: ready(), job: job({ percent: 100, log: ["Downloading x"] }) })).toMatchObject({ phase: "Making the depth map… 15 s" });
  });

  it("keeps showing the job on its own shot even once the map is on it", () => {
    const done = job({ status: "done", applied: true, result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080, provider: "gpu", seconds: 6.5 } });
    const shown = row({ ready: ready(), job: done }, { hasDepthMap: true });
    expect(shown).toMatchObject({ kind: "done", text: "Depth map made (1920×1080, 6.5 s on the GPU). Turn on MAP in the Depth Maps lane to see it." });
    expect((shown as { caution: string }).caution).toContain("people");
    // on another shot it is gone
    expect(row({ ready: ready(), job: done }, { frameId: "f2", hasDepthMap: true })).toEqual({ kind: "hidden" });
  });

  it("says a map that was already there was attached, and does not claim it was made", () => {
    const text = (extra: Partial<DepthMakerJob>) => (row({ ready: ready(), job: job({ status: "done", existing: true, ...extra }) }) as { text: string }).text;
    expect(text({ applied: true })).toBe("This picture already had a depth map. It is now this shot's.");
    expect(text({ applied: false, note: "The picture changed." })).toBe("This picture already has a depth map.");
  });

  it("shows the reason when the map could not go on the shot, and no people warning for a map that is not on it", () => {
    const shown = row({ ready: ready(), job: job({ status: "done", applied: false, note: "The picture changed. The map is saved at /film/depth/s1/pic/depth.png." }) });
    expect(shown).toMatchObject({ kind: "done", caution: null, note: expect.stringContaining("saved at") });
    expect((shown as { text: string }).text).not.toContain("Turn on MAP");
  });

  it("when the start failed because the computer is not set up, shows the setup help rather than a bare error", () => {
    const failed = job({ status: "error", message: "One-time setup needed: run  npm run depth:setup  in the project folder, then try again." });
    expect(row({ ready: ready({ python: null, packages: false }), job: failed })).toEqual({ kind: "setup-needed", command: DEPTH_SETUP_COMMAND });
    expect(row({ ready: ready({ packages: false }), job: failed })).toMatchObject({ kind: "setup-needed" });
    // set up, or not known: the error is shown as it is
    expect(row({ ready: ready(), job: failed })).toMatchObject({ kind: "failed" });
    expect(row({ ready: null, job: failed })).toMatchObject({ kind: "failed" });
    // a cancel is never mistaken for it
    expect(row({ ready: ready({ packages: false }), job: job({ status: "cancelled" }) })).toMatchObject({ kind: "failed", message: "Cancelled." });
  });

  it("shows a failure and a cancel, in words", () => {
    expect(row({ ready: ready(), job: job({ status: "error", message: "No space left." }) })).toEqual({ kind: "failed", message: "No space left." });
    expect(row({ ready: ready(), job: job({ status: "cancelled", message: null }) })).toEqual({ kind: "failed", message: "Cancelled." });
    expect(row({ ready: ready(), job: job({ status: "error", message: null }) })).toEqual({ kind: "failed", message: "The depth map could not be made." });
  });
});
