import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DepthApiError, DepthJobStatus, DepthJobView, DepthReady } from "../src/core/depthApiTypes";
import { pngSize, pythonCandidates } from "../scripts/depth/lib.mjs";
import { ALL_MODELS } from "../scripts/depth/models.mjs";
import { createDepthMiddleware, type DepthApiOptions, type DepthCapabilities } from "./depth-api";

// The editor's "Make depth map" button talks to this API. Most tests drive it against a stand-in for scripts/make-depth.mjs
// (a few lines of Node that print what the real command prints), so they need no Python; the last block runs the real
// command with the tiny stand-in model, and is skipped where Python's packages are not installed.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// A 1x1 PNG: the stand-in "map".
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const FAKE_CLI = `
const fs = require("node:fs");
const path = require("node:path");
const [, , picture, ...flags] = process.argv;
const mode = process.env.FAKE_DEPTH_MODE || "ok";
const publicDir = process.env.SCARLET_KEYFRAME_PUBLIC;
const parts = picture.replace(/^\\/film\\/img\\//, "").replace(/\\.[a-z]+$/i, "").split("/");
const mapFolder = path.join(publicDir, "film", "depth", ...parts);
const mapFile = path.join(mapFolder, "depth.png");
const say = (text) => process.stdout.write(text + "\\n");
const result = (value) => say("@@result " + JSON.stringify(value));
say(picture + "  (making a new map, fake)");
say("flags: " + flags.join(" "));
if (mode === "ok") {
  say("Downloading depth.onnx (10 MB). This happens once");
  say("  10%");
  say("  50%");
  say("  100%");
  fs.mkdirSync(mapFolder, { recursive: true });
  fs.writeFileSync(mapFile, Buffer.from(process.env.FAKE_PNG, "base64"));
  say("Wrote " + mapFile);
  result({ ok: true, mode: "make", picture, written: true, model: "fake", provider: flags.includes("--gpu") ? "gpu" : "cpu", seconds: 0.1, archived: null });
} else if (mode === "fail") {
  process.stderr.write("\\nThe Python packages for depth maps are not installed (python3).\\nRun once: npm run depth:setup\\n\\n");
  result({ ok: false, message: "The Python packages for depth maps are not installed (python3).\\nRun once: npm run depth:setup" });
  process.exit(1);
} else if (mode === "crash") {
  process.stderr.write("Traceback (most recent call last):\\n  boom\\n");
  process.exit(3);
} else if (mode === "slow") {
  fs.mkdirSync(mapFolder, { recursive: true });
  fs.writeFileSync(path.join(mapFolder, ".depth-" + process.pid + ".tmp.png"), "partial");
  say("  20%");
  setInterval(() => {}, 1000);
}
`;

const FAKE_CUTOUTS_CLI = `
const fs = require("node:fs");
const path = require("node:path");
const [, , picture, ...flags] = process.argv;
const mode = process.env.FAKE_CUTOUTS_MODE || "ok";
const publicDir = process.env.SCARLET_KEYFRAME_PUBLIC;
const parts = picture.replace(/^\\/film\\/img\\//, "").replace(/\\.[a-z]+$/i, "").split("/");
const base = path.join(publicDir, "film", "depth", ...parts);
const ref = "/film/depth/" + parts.join("/") + "/people-1";
const say = (text) => process.stdout.write(text + "\\n");
const warn = (text) => process.stderr.write(text + "\\n");
const result = (value) => say("@@result " + JSON.stringify(value));
say(picture + "  (cutting out the people, fake)");
say("flags: " + flags.map((flag) => (flag.startsWith(process.env.FAKE_WORK) ? path.basename(flag) : flag)).join(" "));
const answer = (extra) => ({ ok: true, mode: "cutouts", written: true, picture, folder: ref, depthMap: ref + "/depth.png", plate: ref + "/plate.jpg", review: ref + "/review.jpg",
  cutouts: [{ image: ref + "/cutout-1.png", depth: 0.8, box: [1, 2, 3, 4], how: "feet" }], seen: 1, leftOut: 0, flags: ["1 smaller figure(s) were left in the plate"],
  quality: flags.includes("fast") ? "fast" : "best", provider: "cpu", source: flags.includes("--source-map") ? "given" : "model", seconds: 1.5, width: 1, height: 1, ...extra });
const stages = () => { warn("1/5 finding the people"); warn("2/5 the depth (from the model; 1 person found)"); warn("3/5 cutting out (1)"); warn("4/5 painting in the plate"); warn("5/5 checking, and writing the files"); };
const write = (names) => { const dir = path.join(base, "people-1"); fs.mkdirSync(dir, { recursive: true }); for (const name of names) fs.writeFileSync(path.join(dir, name), name.endsWith(".png") ? Buffer.from(process.env.FAKE_PNG, "base64") : "jpg"); };
if (mode === "ok") { stages(); write(["depth.png", "cutout-1.png", "plate.jpg", "review.jpg"]); result(answer({})); }
else if (mode === "none") { warn("1/5 finding the people"); result({ ok: true, mode: "cutouts", written: false, reason: "no-people", seen: 0, flags: [], picture, quality: "best" }); }
else if (mode === "lie") { stages(); write(["depth.png"]); result(answer({})); }
else if (mode === "escape") { stages(); result(answer({ depthMap: "/film/depth/../../escaped.png" })); }
else if (mode === "fail") { process.stderr.write("\\nThe Python packages for depth maps are not installed (python3).\\n"); result({ ok: false, message: "The Python packages for depth maps are not installed (python3)." }); process.exit(1); }
else if (mode === "checking") { console.log("Checking inpainting_lama_2025jan.onnx …"); setInterval(() => {}, 1000); }
else if (mode === "slow") { warn("1/5 finding the people"); fs.mkdirSync(path.join(base, "people-1.part"), { recursive: true }); fs.writeFileSync(path.join(base, "people-1.part", "cutout-1.png"), "partial"); setInterval(() => {}, 1000); }
`;

const FAKE_MODELS_CLI = `
const fs = require("node:fs");
const path = require("node:path");
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const mode = process.env.FAKE_MODELS_MODE || "ok";
const dir = process.env.SCARLET_KEYFRAME_MODELS;
const files = JSON.parse(process.env.FAKE_MODEL_FILES);
const say = (text) => process.stdout.write(text + "\\n");
say("ids: " + ids.join(" "));
const done = [];
for (const id of ids) {
  const { file, bytes } = files[id];
  say("Downloading " + file + " (1.0 MB). This happens once; it is kept in " + dir);
  say("  10%");
  if (mode === "slow") { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, file + ".part"), "partial"); setInterval(() => {}, 1000); return; }
  say("  50%");
  say("  100%");
  fs.mkdirSync(dir, { recursive: true });
  const fd = fs.openSync(path.join(dir, file), "w"); fs.ftruncateSync(fd, bytes); fs.closeSync(fd);
  done.push({ id, file: path.join(dir, file), bytes });
}
if (mode === "fail") { process.stderr.write("\\nThe download failed (HTTP 404).\\n"); say("@@result " + JSON.stringify({ ok: false, message: "The download failed (HTTP 404)." })); process.exit(1); }
say("@@result " + JSON.stringify({ ok: true, models: done }));
`;

let work: string;
let publicDir: string;
let cli: string;
let cutoutsCli: string;
let modelsCli: string;
let modelsDir: string;
let fakeModel: string;
let server: http.Server;
let port: number;
const started: string[] = [];

const READY: DepthCapabilities = { python: "fake-python", packages: true, gpu: false };
let machine: DepthCapabilities = READY;

function touch(rel: string) {
  const file = path.join(publicDir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "picture");
}

async function startServer(extra: Partial<DepthApiOptions> = {}) {
  const middleware = createDepthMiddleware({
    repoRoot,
    publicDir,
    cliPath: cli,
    cutoutsCliPath: cutoutsCli,
    modelsCliPath: modelsCli,
    modelsDir,
    probe: () => machine,
    ...extra,
  });
  server = http.createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end("not here");
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
}

interface Reply<T = unknown> {
  status: number;
  json: T;
}

/** A request as a browser (or anything else) could send it; the Host header can be chosen. */
function request<T = Record<string, unknown>>(
  method: string,
  route: string,
  options: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Promise<Reply<T>> {
  return new Promise((resolve, reject) => {
    const payload = options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined);
    const headers: Record<string, string> = { ...(payload !== undefined ? { "Content-Type": "application/json" } : {}), ...options.headers };
    const req = http.request({ host: "127.0.0.1", port, method, path: `/__api/depth/${route}`, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown = text;
        try {
          json = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        resolve({ status: res.statusCode ?? 0, json: json as T });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const make = (picture: string) => request<DepthJobView & DepthApiError>("POST", "make", { body: { picture } });
const status = (id: string) => request<DepthJobView & DepthApiError>("GET", `status?id=${encodeURIComponent(id)}`);

async function waitFor(id: string, wanted: DepthJobStatus, ms = 20000): Promise<DepthJobView> {
  const until = Date.now() + ms;
  for (;;) {
    const { json } = await status(id);
    if (json.status === wanted) return json;
    if (json.status !== "running" && wanted === "running") return json;
    if (Date.now() > until) throw new Error(`job ${id} is ${json.status}, not ${wanted}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

function mode(value: string) {
  process.env.FAKE_DEPTH_MODE = value;
}

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-depth-api-"));
  publicDir = path.join(work, "public");
  cli = path.join(work, "fake-cli.cjs");
  fs.writeFileSync(cli, FAKE_CLI);
  cutoutsCli = path.join(work, "fake-cutouts.cjs");
  fs.writeFileSync(cutoutsCli, FAKE_CUTOUTS_CLI);
  modelsCli = path.join(work, "fake-models.cjs");
  fs.writeFileSync(modelsCli, FAKE_MODELS_CLI);
  modelsDir = path.join(work, "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  fakeModel = path.join(work, "fake.onnx");
  fs.writeFileSync(fakeModel, "model");
  process.env.FAKE_MODEL_FILES = JSON.stringify(Object.fromEntries(Object.entries(ALL_MODELS).map(([id, spec]) => [id, { file: spec.file, bytes: spec.bytes }])));
  process.env.FAKE_PNG = PNG_1X1;
  process.env.FAKE_WORK = work;
  touch("film/img/t/a.jpg");
  touch("film/img/t/b.jpg");
  touch("film/img/t/has-map.jpg");
  touch("film/img/t/c.jpg");
  touch("film/depth/t/has-map/depth.png");
  fs.writeFileSync(path.join(publicDir, "film", "depth", "t", "has-map", "depth.png"), Buffer.from(PNG_1X1, "base64"));
});

afterAll(() => {
  delete process.env.FAKE_DEPTH_MODE;
  delete process.env.FAKE_CUTOUTS_MODE;
  delete process.env.FAKE_MODELS_MODE;
  delete process.env.FAKE_MODEL_FILES;
  delete process.env.FAKE_PNG;
  delete process.env.FAKE_WORK;
  fs.rmSync(work, { recursive: true, force: true });
});

beforeEach(async () => {
  machine = READY;
  mode("ok");
  process.env.FAKE_CUTOUTS_MODE = "ok";
  process.env.FAKE_MODELS_MODE = "ok";
  fs.rmSync(modelsDir, { recursive: true, force: true });
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.rmSync(path.join(publicDir, "film", "depth", "t", "c"), { recursive: true, force: true });
  started.length = 0;
  fs.rmSync(path.join(publicDir, "film", "depth", "t", "a"), { recursive: true, force: true });
  fs.rmSync(path.join(publicDir, "film", "depth", "t", "b"), { recursive: true, force: true });
  await startServer();
});

afterEach(async () => {
  // Never leave a stand-in running: stop anything that is still being made.
  for (const id of started) await request("POST", "cancel", { body: { id } }).catch(() => undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("what this computer can do (GET ready)", () => {
  it("reports Python, its packages, the GPU, every model and what each quality uses", async () => {
    machine = { python: ".depth-venv", packages: true, gpu: true };
    const { status: code, json } = await request<DepthReady>("GET", "ready");
    expect(code).toBe(200);
    expect(json).toMatchObject({ ok: true, python: ".depth-venv", packages: true, gpu: true, busy: null, defaultQuality: "best", modelsDir });
    expect(json.models.map((m) => m.id)).toEqual(["depth-small", "depth-base", "depth-large", "people", "matte-best", "matte-lite", "inpaint"]);
    for (const model of json.models) {
      expect(model.source, model.id).toMatch(/^https:\/\//);
      // the file itself, for downloading by hand: its last part is the name the models folder expects
      expect(model.url, model.id).toMatch(/^https:\/\//);
      expect(model.url.endsWith(`/${model.file}`), model.id).toBe(true);
      expect(model.license, model.id).toBeTruthy();
      expect(model.bytes, model.id).toBeGreaterThan(1_000_000);
      expect(model.cached, model.id).toBe(false);
      expect(model.overridden, model.id).toBe(false);
    }
    expect(json.qualities.best).toEqual({ depth: "depth-large", matte: "matte-best", people: "people", inpaint: "inpaint" });
    expect(json.qualities.fast.depth).toBe("depth-small");
    // the non-commercial ones are marked, so a person can choose
    expect(json.models.filter((m) => m.nonCommercial).map((m) => m.id)).toEqual(["depth-base", "depth-large"]);
  });

  it("says when Python or its packages are missing", async () => {
    machine = { python: null, packages: false, gpu: false };
    expect((await request<DepthReady>("GET", "ready")).json).toMatchObject({ python: null, packages: false });
  });

  it("knows which models are in the models folder, by their size alone, so it is quick", async () => {
    const put = (id: string, bytes: number) => {
      const fd = fs.openSync(path.join(modelsDir, ALL_MODELS[id].file), "w");
      fs.ftruncateSync(fd, bytes);
      fs.closeSync(fd);
    };
    put("inpaint", ALL_MODELS.inpaint.bytes);
    put("people", 12345); // the wrong size: a download that was cut off, or another file
    const models = (await request<DepthReady>("GET", "ready")).json.models;
    expect(models.find((m) => m.id === "inpaint")?.cached).toBe(true);
    expect(models.find((m) => m.id === "people")?.cached).toBe(false);
    expect(models.find((m) => m.id === "matte-best")?.cached).toBe(false);
  });

  it("counts a file of your own for a role as that role's model", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await startServer({ modelFile: fakeModel, modelFiles: { people: fakeModel, matte: path.join(work, "gone.onnx") } });
    const models = (await request<DepthReady>("GET", "ready")).json.models;
    for (const id of ["depth-small", "depth-large"]) expect(models.find((m) => m.id === id), id).toMatchObject({ cached: true, overridden: true });
    expect(models.find((m) => m.id === "people")).toMatchObject({ cached: true, overridden: true });
    // a file that is not there does not count as the model
    expect(models.find((m) => m.id === "matte-best")).toMatchObject({ cached: false, overridden: true });
    expect(models.find((m) => m.id === "inpaint")).toMatchObject({ cached: false, overridden: false });
  });

  it("is never cached by the browser", async () => {
    const reply = await new Promise<http.IncomingMessage>((resolve) =>
      http.get({ host: "127.0.0.1", port, path: "/__api/depth/ready" }, (res) => {
        res.resume();
        resolve(res);
      }),
    );
    expect(reply.headers["cache-control"]).toBe("no-store");
  });
});

describe("making a map (POST make, GET status)", () => {
  it("runs the command, follows it, and reports where the map is", async () => {
    const first = await make("/film/img/t/a.jpg");
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ status: "running", picture: "/film/img/t/a.jpg", map: "/film/depth/t/a/depth.png" });
    started.push(first.json.id as string);
    const done = await waitFor(first.json.id as string, "done");
    expect(done.percent).toBe(100);
    expect(done.result).toMatchObject({ ok: true, map: "/film/depth/t/a/depth.png", width: 1, height: 1, provider: "cpu" });
    expect(done.log.join("\n")).toContain("Downloading depth.onnx");
    expect(pngSize(path.join(publicDir, "film", "depth", "t", "a", "depth.png"))).toEqual({ width: 1, height: 1 });
  });

  it("passes --json always, --gpu only when the GPU is on offer, and a chosen model file", async () => {
    const plain = await make("/film/img/t/a.jpg");
    const done = await waitFor(plain.json.id as string, "done");
    const flags = (view: DepthJobView) => view.log.find((line) => line.startsWith("flags:")) ?? "";
    // the depth model follows the quality: best is Depth Anything Large, fast the Small
    expect(flags(done)).toBe("flags: --json --model large");

    fs.rmSync(path.join(publicDir, "film", "depth", "t", "a"), { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    machine = { python: "p", packages: true, gpu: true };
    await startServer({ modelFile: "/models/mine.onnx" });
    const gpu = await make("/film/img/t/a.jpg");
    const gpuDone = await waitFor(gpu.json.id as string, "done");
    expect(flags(gpuDone)).toBe("flags: --json --model-file /models/mine.onnx --gpu");
    expect(gpuDone.result?.provider).toBe("gpu");
  });

  it("uses a map that is already there instead of making another (nothing is overwritten)", async () => {
    const before = fs.readFileSync(path.join(publicDir, "film", "depth", "t", "has-map", "depth.png"));
    const { status: code, json } = await make("/film/img/t/has-map.jpg");
    expect(code).toBe(200);
    expect(json).toMatchObject({ id: null, status: "done", existing: true, map: "/film/depth/t/has-map/depth.png" });
    expect(json.result).toMatchObject({ ok: true, existing: true, width: 1, height: 1 });
    expect(fs.readFileSync(path.join(publicDir, "film", "depth", "t", "has-map", "depth.png")).equals(before)).toBe(true);
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBeNull();
  });

  it("says what the command said when it fails, and leaves nothing behind", async () => {
    mode("fail");
    const first = await make("/film/img/t/a.jpg");
    const failed = await waitFor(first.json.id as string, "error");
    expect(failed.message).toContain("npm run depth:setup");
    expect(failed.result?.ok).toBe(false);
    expect(fs.existsSync(path.join(publicDir, "film", "depth", "t", "a", "depth.png"))).toBe(false);
  });

  it("falls back to the last line it printed when the command dies without an answer", async () => {
    mode("crash");
    const first = await make("/film/img/t/a.jpg");
    const failed = await waitFor(first.json.id as string, "error");
    expect(failed.message).toBe("boom");
    expect(failed.result).toBeNull();
  });

  it("will not start without Python's packages, and says what to run", async () => {
    machine = { python: "python3", packages: false, gpu: false };
    const { status: code, json } = await make("/film/img/t/a.jpg");
    expect(code).toBe(412);
    expect(json.error).toBe("setup-needed");
    expect(json.message).toContain("npm run depth:setup");
  });

  it("makes one map at a time: the same picture joins the job, another picture waits", async () => {
    mode("slow");
    const first = await make("/film/img/t/a.jpg");
    started.push(first.json.id as string);
    expect(first.json.status).toBe("running");

    const again = await make("/film/img/t/a.jpg");
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(first.json.id);

    const other = await make("/film/img/t/b.jpg");
    expect(other.status).toBe(409);
    expect(other.json).toMatchObject({ error: "busy", id: first.json.id });
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBe(first.json.id);
  });

  it("can be cancelled: the command stops and its temporary file and empty folder are removed", async () => {
    mode("slow");
    const first = await make("/film/img/t/a.jpg");
    const id = first.json.id as string;
    started.push(id);
    const folder = path.join(publicDir, "film", "depth", "t", "a");
    // wait until the stand-in has made its temporary file
    for (let i = 0; i < 100 && !(fs.existsSync(folder) && fs.readdirSync(folder).length); i += 1) await new Promise((r) => setTimeout(r, 30));
    expect(fs.readdirSync(folder)).toHaveLength(1);

    const cancelled = await request<DepthJobView>("POST", "cancel", { body: { id } });
    expect(cancelled.status).toBe(200);
    const final = await waitFor(id, "cancelled");
    expect(final.message).toBe("Cancelled.");
    expect(fs.existsSync(folder)).toBe(false);
    // and another picture can be made now
    mode("ok");
    const next = await make("/film/img/t/b.jpg");
    expect(next.status).toBe(200);
    started.push(next.json.id as string);
    await waitFor(next.json.id as string, "done");
  });

  it("knows nothing of a job it was never given", async () => {
    expect((await status("nope")).status).toBe(404);
    expect((await request("POST", "cancel", { body: { id: "nope" } })).status).toBe(404);
  });
});

describe("which pictures it accepts", () => {
  it.each([
    ["not under /film/img/", "/other/a.jpg"],
    ["a name without a folder", "a.jpg"],
    ["a path that climbs out of public/", "/film/img/../../outside/secret.jpg"],
    ["a path that climbs and comes back", "/film/img/t/../t/a.jpg"],
    ["a dot segment", "/film/img/./t/a.jpg"],
    ["a backslash", "/film/img/t\\a.jpg"],
    ["a NUL", "/film/img/t/a\u0000.jpg"],
    ["something that is not a picture", "/film/img/t/a.txt"],
    ["a picture that does not exist", "/film/img/t/missing.jpg"],
    ["nothing at all", ""],
  ])("refuses %s", async (_label, picture) => {
    const { status: code, json } = await make(picture);
    expect(code).toBe(400);
    expect(json.error).toBe("bad-picture");
    expect(fs.existsSync(path.join(work, "outside"))).toBe(false);
  });

  it("refuses a picture that is not a string", async () => {
    expect((await request("POST", "make", { body: { picture: 42 } })).status).toBe(400);
    expect((await request("POST", "make", { body: {} })).status).toBe(400);
  });
});

describe("who may ask", () => {
  const ok = { "Content-Type": "application/json" };

  it("answers only requests addressed to this computer (not a DNS-rebinding page)", async () => {
    const { status: code, json } = await request<DepthApiError>("GET", "ready", { headers: { Host: "evil.example" } });
    expect(code).toBe(403);
    expect(json.error).toBe("forbidden");
    expect((await request("GET", "ready", { headers: { Host: "localhost:5173" } })).status).toBe(200);
    expect((await request("GET", "ready", { headers: { Host: "[::1]:5173" } })).status).toBe(200);
  });

  it("answers the address you chose with SCARLET_KEYFRAME_HOST, and only that one", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await startServer({ allowedHosts: ["192.168.1.20"] });
    expect((await request("GET", "ready", { headers: { Host: "192.168.1.20:4173" } })).status).toBe(200);
    expect((await request("GET", "ready", { headers: { Host: "192.168.1.21:4173" } })).status).toBe(403);
  });

  it("refuses a page on another origin, even on this computer", async () => {
    const reply = await request("POST", "make", {
      body: { picture: "/film/img/t/a.jpg" },
      headers: { ...ok, Origin: "http://evil.example", Host: `127.0.0.1:${port}` },
    });
    expect(reply.status).toBe(403);
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBeNull();
  });

  it("refuses a request the browser marks as cross-site", async () => {
    expect((await request("GET", "ready", { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await request("GET", "ready", { headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(200);
  });

  it("accepts the editor page's own origin", async () => {
    const reply = await request("GET", "ready", { headers: { Origin: `http://127.0.0.1:${port}`, Host: `127.0.0.1:${port}` } });
    expect(reply.status).toBe(200);
  });

  it("wants JSON for a POST (a form from another site cannot send that)", async () => {
    const reply = await request<DepthApiError>("POST", "make", {
      rawBody: "picture=/film/img/t/a.jpg",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(reply.status).toBe(415);
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBeNull();
  });

  it("refuses broken or oversized JSON", async () => {
    expect((await request("POST", "make", { rawBody: "{nope" })).status).toBe(400);
    expect((await request("POST", "make", { rawBody: "[]" })).status).toBe(400);
    const big = JSON.stringify({ picture: "x".repeat(10000) });
    // with a Content-Length, and chunked (no Content-Length): both are answered, neither is cut off
    expect((await request("POST", "make", { rawBody: big, headers: { "Content-Length": String(Buffer.byteLength(big)) } })).status).toBe(400);
    expect((await request("POST", "make", { rawBody: big })).status).toBe(400);
  });

  it("leaves every other address to the rest of the server", async () => {
    const reply = await new Promise<{ status: number; body: string }>((resolve) =>
      http.get({ host: "127.0.0.1", port, path: "/film/img/t/a.jpg" }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }),
    );
    expect(reply).toEqual({ status: 404, body: "not here" });
    expect((await request("GET", "nothing-here")).status).toBe(404);
  });
});

// ---- cut-outs ---------------------------------------------------------------------------------------------------------------

const cutouts = (body: Record<string, unknown>) => request<DepthJobView & DepthApiError>("POST", "make".replace("make", "cutouts"), { body });
const cutoutMode = (value: string) => {
  process.env.FAKE_CUTOUTS_MODE = value;
};
const flagsOf = (job: DepthJobView) => job.log.find((line) => line.startsWith("flags:")) ?? "";
const ownModels = () => ({ modelFile: fakeModel, modelFiles: { people: fakeModel, matte: fakeModel, inpaint: fakeModel } });
async function restart(extra: Partial<DepthApiOptions>) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await startServer(extra);
}

describe("cut-outs (POST cutouts)", () => {
  it("makes the cut-outs of a picture's people, follows its five steps, and reports the new folder", async () => {
    await restart(ownModels());
    const first = await cutouts({ picture: "/film/img/t/c.jpg" });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ kind: "cutouts", status: "running", picture: "/film/img/t/c.jpg" });
    started.push(first.json.id as string);
    const done = await waitFor(first.json.id as string, "done");
    expect(done.kind).toBe("cutouts");
    expect(done.step).toEqual({ n: 5, of: 5, text: "checking, and writing the files" });
    expect(done.current).toBe("Step 5 of 5: checking, and writing the files");
    expect(done.result).toMatchObject({
      ok: true,
      written: true,
      folder: "/film/depth/t/c/people-1",
      depthMap: "/film/depth/t/c/people-1/depth.png",
      plate: "/film/depth/t/c/people-1/plate.jpg",
      review: "/film/depth/t/c/people-1/review.jpg",
      seen: 1,
      leftOut: 0,
      quality: "best",
    });
    expect(done.result?.cutouts).toEqual([{ image: "/film/depth/t/c/people-1/cutout-1.png", depth: 0.8, box: [1, 2, 3, 4], how: "feet" }]);
    expect(done.result?.flags).toEqual(["1 smaller figure(s) were left in the plate"]);
    expect(fs.readdirSync(path.join(publicDir, "film", "depth", "t", "c", "people-1")).sort()).toEqual(["cutout-1.png", "depth.png", "plate.jpg", "review.jpg"]);
  });

  it("passes on the quality, a depth map to keep, and the model files you chose", async () => {
    await restart(ownModels());
    const job = await cutouts({ picture: "/film/img/t/c.jpg", quality: "fast", sourceMap: "/film/depth/t/has-map/depth.png" });
    started.push(job.json.id as string);
    const done = await waitFor(job.json.id as string, "done");
    const flags = flagsOf(done);
    expect(flags).toContain("--json --quality fast --source-map /film/depth/t/has-map/depth.png");
    for (const role of ["people", "matte", "inpaint"]) expect(flags, role).toContain(`--${role}-model fake.onnx`);
    // the depth model is not asked for when a map is kept
    expect(flags).not.toContain("--depth-model");
    expect(done.result).toMatchObject({ quality: "fast", source: "given" });

    fs.rmSync(path.join(publicDir, "film", "depth", "t", "c"), { recursive: true, force: true });
    const again = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(again.json.id as string);
    expect(flagsOf(await waitFor(again.json.id as string, "done"))).toContain("--depth-model fake.onnx");
  });

  it("a picture with nobody in it is a finished job that made nothing", async () => {
    await restart(ownModels());
    cutoutMode("none");
    const job = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(job.json.id as string);
    const done = await waitFor(job.json.id as string, "done");
    expect(done.result).toMatchObject({ ok: true, written: false, reason: "no-people", seen: 0 });
    expect(fs.existsSync(path.join(publicDir, "film", "depth", "t", "c"))).toBe(false);
  });

  it("will not start until the models are on this computer, and says which and how big", async () => {
    const best = await cutouts({ picture: "/film/img/t/c.jpg" });
    expect(best.status).toBe(412);
    expect(best.json.error).toBe("models-missing");
    expect(best.json.missing).toEqual(["people", "matte-best", "inpaint", "depth-large"]);
    expect(best.json.message).toContain("BiRefNet general (full)");
    expect(best.json.message).toContain("2.8 GB");
    const fast = await cutouts({ picture: "/film/img/t/c.jpg", quality: "fast" });
    expect(fast.json.missing).toEqual(["people", "matte-lite", "inpaint", "depth-small"]);
    expect(fast.json.message).toContain("0.8 GB");
    // a depth map you already have means the depth model is not needed
    const kept = await cutouts({ picture: "/film/img/t/c.jpg", sourceMap: "/film/depth/t/has-map/depth.png" });
    expect(kept.json.missing).toEqual(["people", "matte-best", "inpaint"]);
    expect(fs.existsSync(path.join(publicDir, "film", "depth", "t", "c"))).toBe(false);
  });

  it("is happy to start once the models are in the models folder", async () => {
    for (const id of ["people", "matte-best", "inpaint", "depth-large"]) {
      const fd = fs.openSync(path.join(modelsDir, ALL_MODELS[id].file), "w");
      fs.ftruncateSync(fd, ALL_MODELS[id].bytes);
      fs.closeSync(fd);
    }
    const job = await cutouts({ picture: "/film/img/t/c.jpg" });
    expect(job.status).toBe(200);
    started.push(job.json.id as string);
    await waitFor(job.json.id as string, "done");
  });

  it("says what to run when Python is not set up", async () => {
    await restart(ownModels());
    machine = { python: "python3", packages: false, gpu: false };
    const { status: code, json } = await cutouts({ picture: "/film/img/t/c.jpg" });
    expect(code).toBe(412);
    expect(json.error).toBe("setup-needed");
  });

  it("refuses a quality that does not exist, and a depth map that is not a depth map", async () => {
    await restart(ownModels());
    expect((await cutouts({ picture: "/film/img/t/c.jpg", quality: "ultra" })).status).toBe(400);
    for (const sourceMap of ["/film/img/t/a.jpg", "/film/depth/../img/t/a.jpg", "/etc/passwd", "/film/depth/t/nothing/depth.png", "/film/depth/t/./has-map/depth.png"]) {
      const reply = await cutouts({ picture: "/film/img/t/c.jpg", sourceMap });
      expect(reply.status, sourceMap).toBe(400);
      expect(reply.json.error, sourceMap).toBe("bad-picture");
    }
    expect(fs.existsSync(path.join(publicDir, "film", "depth", "t", "c"))).toBe(false);
  });

  it("makes one thing at a time: the same picture's cut-outs are joined, anything else waits", async () => {
    // matte-best is in the models folder, matte-lite is not (so a download of it is a real request)
    await restart({ modelFile: fakeModel, modelFiles: { people: fakeModel, inpaint: fakeModel } });
    const fd = fs.openSync(path.join(modelsDir, ALL_MODELS["matte-best"].file), "w");
    fs.ftruncateSync(fd, ALL_MODELS["matte-best"].bytes);
    fs.closeSync(fd);
    cutoutMode("slow");
    const first = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(first.json.id as string);
    expect((await cutouts({ picture: "/film/img/t/c.jpg" })).json.id).toBe(first.json.id);
    const other = await cutouts({ picture: "/film/img/t/a.jpg" });
    expect(other.status).toBe(409);
    expect(other.json).toMatchObject({ error: "busy", id: first.json.id });
    expect(other.json.message).toContain("cut-outs are being made");
    // a depth map waits too, and so does a model download
    expect((await make("/film/img/t/b.jpg")).status).toBe(409);
    expect((await request("POST", "models/download", { body: { ids: ["matte-lite"] } })).status).toBe(409);
  });

  it("can be cancelled: the command stops and its half-made folder is removed", async () => {
    await restart(ownModels());
    cutoutMode("slow");
    const first = await cutouts({ picture: "/film/img/t/c.jpg" });
    const id = first.json.id as string;
    started.push(id);
    const folder = path.join(publicDir, "film", "depth", "t", "c");
    for (let i = 0; i < 100 && !fs.existsSync(path.join(folder, "people-1.part", "cutout-1.png")); i += 1) await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(path.join(folder, "people-1.part"))).toBe(true);
    await request("POST", "cancel", { body: { id } });
    expect((await waitFor(id, "cancelled")).message).toBe("Cancelled.");
    expect(fs.existsSync(folder)).toBe(false);
  });

  it("says which model it is checking the first time one is used (the command checks its checksum once)", async () => {
    await restart(ownModels());
    cutoutMode("checking");
    const first = await cutouts({ picture: "/film/img/t/c.jpg" });
    const id = first.json.id as string;
    started.push(id);
    let seen: DepthJobView | undefined;
    for (let i = 0; i < 200; i += 1) {
      seen = (await status(id)).json;
      if (seen.current) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(seen?.current).toBe("Checking LaMa (once)");
    expect(seen?.percent).toBeNull();
    expect(seen?.step ?? null).toBeNull();
    await request("POST", "cancel", { body: { id } });
    await waitFor(id, "cancelled");
  });

  it("checks what the command claims against the disk", async () => {
    await restart(ownModels());
    cutoutMode("lie");
    const lie = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(lie.json.id as string);
    const failed = await waitFor(lie.json.id as string, "error");
    expect(failed.message).toContain("is not there");
    cutoutMode("escape");
    fs.rmSync(path.join(publicDir, "film", "depth", "t", "c"), { recursive: true, force: true });
    const escape = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(escape.json.id as string);
    expect((await waitFor(escape.json.id as string, "error")).message).toContain("outside the depth folder");
  });

  it("says what the command said when it fails", async () => {
    await restart(ownModels());
    cutoutMode("fail");
    const job = await cutouts({ picture: "/film/img/t/c.jpg" });
    started.push(job.json.id as string);
    expect((await waitFor(job.json.id as string, "error")).message).toContain("not installed");
  });
});

// ---- model downloads ----------------------------------------------------------------------------------------------------------

const download = (body: Record<string, unknown>) => request<DepthJobView & DepthApiError>("POST", "models/download", { body });
const present = (id: string) => {
  const fd = fs.openSync(path.join(modelsDir, ALL_MODELS[id].file), "w");
  fs.ftruncateSync(fd, ALL_MODELS[id].bytes);
  fs.closeSync(fd);
};

describe("downloading models (POST models/download)", () => {
  it("downloads what is missing, shows which model and how far, and then they are on this computer", async () => {
    const job = await download({ ids: ["inpaint"] });
    expect(job.status).toBe(200);
    expect(job.json).toMatchObject({ kind: "models", status: "running", picture: "", map: "" });
    started.push(job.json.id as string);
    const done = await waitFor(job.json.id as string, "done");
    expect(done.current).toBe("Downloading LaMa (once)");
    expect(done.percent).toBe(100);
    expect(done.log.join("\n")).toContain("Downloading inpainting_lama_2025jan.onnx");
    expect(done.result).toMatchObject({ ok: true, models: [{ id: "inpaint", file: ALL_MODELS.inpaint.file, bytes: ALL_MODELS.inpaint.bytes }] });
    // not an absolute path of this computer, only the file's name
    expect(done.result?.models?.[0].file).not.toContain(path.sep);
    const ready = (await request<DepthReady>("GET", "ready")).json;
    expect(ready.models.find((m) => m.id === "inpaint")?.cached).toBe(true);
  });

  it("asks only for what is missing, by id or by quality", async () => {
    present("inpaint");
    present("people");
    const job = await download({ quality: "fast" });
    started.push(job.json.id as string);
    const done = await waitFor(job.json.id as string, "done");
    // only the two that were missing were downloaded (inpaint and people were already here)
    expect(done.result?.models?.map((m) => m.id)).toEqual(["matte-lite", "depth-small"]);
  });

  it("says at once when everything asked for is already here", async () => {
    present("inpaint");
    const reply = await download({ ids: ["inpaint"] });
    expect(reply.status).toBe(200);
    expect(reply.json).toMatchObject({ id: null, kind: "models", status: "done", existing: true });
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBeNull();
  });

  it("refuses an id it does not know, a list that is not a list, and nothing at all", async () => {
    expect((await download({ ids: ["nope"] })).status).toBe(400);
    expect((await download({ ids: ["constructor"] })).status).toBe(400);
    expect((await download({ ids: "inpaint" })).status).toBe(400);
    expect((await download({ ids: [7] })).status).toBe(400);
    expect((await download({ ids: Array.from({ length: 21 }, () => "inpaint") })).status).toBe(400);
    expect((await download({ quality: "ultra" })).status).toBe(400);
    expect((await download({})).status).toBe(400);
    expect((await download({ ids: [] })).status).toBe(400);
  });

  it("is one job at a time: asking again joins it, a depth map or cut-outs wait", async () => {
    process.env.FAKE_MODELS_MODE = "slow";
    const first = await download({ ids: ["inpaint"] });
    started.push(first.json.id as string);
    expect((await download({ ids: ["inpaint"] })).json.id).toBe(first.json.id);
    const blocked = await make("/film/img/t/a.jpg");
    expect(blocked.status).toBe(409);
    expect(blocked.json.message).toContain("models are being downloaded");
    expect((await cutouts({ picture: "/film/img/t/c.jpg" })).status).toBe(409);
  });

  it("can be cancelled, and its partial file is removed", async () => {
    process.env.FAKE_MODELS_MODE = "slow";
    const first = await download({ ids: ["inpaint"] });
    const id = first.json.id as string;
    started.push(id);
    const part = path.join(modelsDir, `${ALL_MODELS.inpaint.file}.part`);
    for (let i = 0; i < 100 && !fs.existsSync(part); i += 1) await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(part)).toBe(true);
    await request("POST", "cancel", { body: { id } });
    await waitFor(id, "cancelled");
    expect(fs.existsSync(part)).toBe(false);
  });

  it("says what went wrong when a download fails, and keeps nothing", async () => {
    process.env.FAKE_MODELS_MODE = "fail";
    const job = await download({ ids: ["inpaint"] });
    started.push(job.json.id as string);
    expect((await waitFor(job.json.id as string, "error")).message).toContain("HTTP 404");
  });
});

describe("the new routes are as careful as the old", () => {
  const routes: [string, Record<string, unknown>][] = [
    ["cutouts", { picture: "/film/img/t/c.jpg" }],
    ["models/download", { ids: ["inpaint"] }],
  ];

  it.each(routes)("%s answers only this computer, this page, and JSON", async (route, body) => {
    expect((await request("POST", route, { body, headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await request("POST", route, { body, headers: { Origin: "http://evil.example", Host: `127.0.0.1:${port}` } })).status).toBe(403);
    expect((await request("POST", route, { body, headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect((await request("POST", route, { rawBody: JSON.stringify(body), headers: { "Content-Type": "text/plain" } })).status).toBe(415);
    expect((await request<DepthReady>("GET", "ready")).json.busy).toBeNull();
  });

  it("cut-outs take only the film's own pictures, never a path that climbs", async () => {
    await restart(ownModels());
    for (const picture of ["/film/img/../../outside/secret.jpg", "/film/img/t/../t/c.jpg", "/other/c.jpg", "c.jpg", "/film/img/t/c.jpg\u0000", "/film/img/t\\c.jpg"]) {
      const reply = await cutouts({ picture });
      expect(reply.status, picture).toBe(400);
      expect(reply.json.error, picture).toBe("bad-picture");
    }
    expect(fs.existsSync(path.join(work, "outside"))).toBe(false);
  });
});

// The real command, with the tiny stand-in model (scripts/depth/fixtures/tiny-depth.onnx), so nothing is downloaded.
function pythonWithPackages() {
  for (const candidate of pythonCandidates({ repoRoot })) {
    const probe = spawnSync(candidate.cmd, [...candidate.args, "-c", "import cv2, numpy, onnxruntime"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

(pythonWithPackages() ? describe : describe.skip)("with the real command and the stand-in model", () => {
  let real: string;

  beforeAll(async () => {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const info = (mod as { default?: unknown }).default ?? mod;
    const ffmpeg = typeof info === "string" ? info : (info as { path: string }).path;
    real = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-depth-api-real-"));
    const pictureFile = path.join(real, "public", "film", "img", "t", "pic.jpg");
    fs.mkdirSync(path.dirname(pictureFile), { recursive: true });
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1600x900:duration=1:rate=1", "-frames:v", "1", pictureFile]);
    // the picture the stand-in person finder is made for: 1280x720, dark, with a bright rectangle (see scripts/cutouts/make_fixtures.py)
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=1280x720:d=1,drawbox=x=400:y=200:w=300:h=450:color=white:t=fill", "-frames:v", "1", "-q:v", "2", path.join(real, "public", "film", "img", "t", "person.jpg")]);
  }, 120000);

  afterAll(() => fs.rmSync(real, { recursive: true, force: true }));

  it("makes a map at the picture's exact size, then uses it", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await startServer({
      publicDir: path.join(real, "public"),
      cliPath: path.join(repoRoot, "scripts", "make-depth.mjs"),
      modelFile: path.join(repoRoot, "scripts", "depth", "fixtures", "tiny-depth.onnx"),
      probe: undefined,
    });
    const ready = (await request<DepthReady>("GET", "ready")).json;
    expect(ready).toMatchObject({ ok: true, packages: true });
    expect(ready.python).toBeTruthy();

    const first = await make("/film/img/t/pic.jpg");
    expect(first.status).toBe(200);
    started.push(first.json.id as string);
    const done = await waitFor(first.json.id as string, "done", 80000);
    expect(done.result).toMatchObject({ ok: true, map: "/film/depth/t/pic/depth.png", width: 1600, height: 900, written: true });
    expect(pngSize(path.join(real, "public", "film", "depth", "t", "pic", "depth.png"))).toEqual({ width: 1600, height: 900 });

    const second = await make("/film/img/t/pic.jpg");
    expect(second.json).toMatchObject({ id: null, status: "done", existing: true, map: "/film/depth/t/pic/depth.png" });
    expect(fs.readdirSync(path.join(real, "public", "film", "depth", "t", "pic"))).toEqual(["depth.png"]);
  }, 120000);

  it("makes the cut-outs of a picture with a person in it, and a second run gets a folder of its own", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const fixtures = path.join(repoRoot, "scripts", "cutouts", "fixtures");
    await startServer({
      publicDir: path.join(real, "public"),
      cliPath: path.join(repoRoot, "scripts", "make-depth.mjs"),
      cutoutsCliPath: path.join(repoRoot, "scripts", "make-cutouts.mjs"),
      modelsCliPath: path.join(repoRoot, "scripts", "get-models.mjs"),
      modelFile: path.join(repoRoot, "scripts", "depth", "fixtures", "tiny-depth.onnx"),
      modelFiles: { people: path.join(fixtures, "tiny-people.onnx"), matte: path.join(fixtures, "tiny-matte.onnx"), inpaint: path.join(fixtures, "tiny-lama.onnx") },
      probe: undefined,
    });
    const ready = (await request<DepthReady>("GET", "ready")).json;
    for (const id of ["people", "matte-best", "inpaint", "depth-large"]) expect(ready.models.find((m) => m.id === id), id).toMatchObject({ cached: true, overridden: true });

    const first = await cutouts({ picture: "/film/img/t/person.jpg" });
    expect(first.status).toBe(200);
    started.push(first.json.id as string);
    const done = await waitFor(first.json.id as string, "done", 100000);
    expect(done.result).toMatchObject({ ok: true, written: true, folder: "/film/depth/t/person/people-1", seen: 1, width: 1280, height: 720 });
    expect(done.result?.cutouts).toHaveLength(1);
    const folder = path.join(real, "public", "film", "depth", "t", "person", "people-1");
    expect(fs.readdirSync(folder).sort()).toEqual(["cutout-1.png", "depth.png", "plate.jpg", "review.jpg"]);
    expect(pngSize(path.join(folder, "depth.png"))).toEqual({ width: 1280, height: 720 });

    const again = await cutouts({ picture: "/film/img/t/person.jpg" });
    started.push(again.json.id as string);
    expect((await waitFor(again.json.id as string, "done", 100000)).result?.folder).toBe("/film/depth/t/person/people-2");
    expect(fs.existsSync(path.join(folder, "cutout-1.png"))).toBe(true);
  }, 240000);
});

// ---- the list of depth files (GET files) ---------------------------------------------------------------------------------

describe("the depth folder's files (GET files)", () => {
  const put = (relative: string, content = "x") => {
    const file = path.join(publicDir, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  it("lists the pictures under film/depth as paths under public/, so the editor can tell they are there", async () => {
    put("film/depth/s6/321-the-form/people-1/plate.jpg");
    put("film/depth/s6/321-the-form/people-1/cutout-1.png");
    put("film/depth/s6/321-the-form/people-1/depth.png");
    put("film/depth/s6/321-the-form/people-1/review.jpg");
    put("film/depth/m4/rain/depth.webp");
    const reply = await request<{ ok: boolean; paths: string[] }>("GET", "files");
    expect(reply.status).toBe(200);
    expect(reply.json.ok).toBe(true);
    expect(reply.json.paths).toEqual(
      expect.arrayContaining([
        "film/depth/s6/321-the-form/people-1/plate.jpg",
        "film/depth/s6/321-the-form/people-1/cutout-1.png",
        "film/depth/s6/321-the-form/people-1/depth.png",
        "film/depth/m4/rain/depth.webp",
      ]),
    );
    expect([...reply.json.paths].sort()).toEqual(reply.json.paths);
  });

  it("leaves out what is not a finished picture: folders still being written, temporary and hidden files, other kinds of file", async () => {
    put("film/depth/s7/x/people-1.part/cutout-1.png");
    put("film/depth/s7/x/.depth-abc.tmp.png");
    put("film/depth/s7/x/.hidden.png");
    put("film/depth/s7/x/depth-1.tmp.png");
    put("film/depth/s7/x/notes.txt");
    put("film/depth/s7/x/depth.png");
    const { paths } = (await request<{ paths: string[] }>("GET", "files")).json;
    expect(paths.filter((p) => p.startsWith("film/depth/s7/"))).toEqual(["film/depth/s7/x/depth.png"]);
  });

  it("never follows a link out of the folder", async () => {
    const outside = path.join(work, "outside-pictures");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.png"), "x");
    const linkDir = path.join(publicDir, "film", "depth", "linked");
    fs.mkdirSync(path.dirname(linkDir), { recursive: true });
    try {
      fs.symlinkSync(outside, linkDir, "dir");
      fs.symlinkSync(path.join(outside, "secret.png"), path.join(publicDir, "film", "depth", "link.png"));
    } catch {
      return; // no symlinks on this machine: nothing to prove
    }
    const { paths } = (await request<{ paths: string[] }>("GET", "files")).json;
    expect(paths.some((p) => p.includes("secret") || p.includes("linked") || p === "film/depth/link.png")).toBe(false);
  });

  it("is an empty list when the folder does not exist, and only answers the editor page itself", async () => {
    fs.rmSync(path.join(publicDir, "film", "depth"), { recursive: true, force: true });
    expect((await request<{ paths: string[] }>("GET", "files")).json.paths).toEqual([]);
    expect((await request("GET", "files", { headers: { Host: "evil.example" } })).status).toBe(403);
  });
});
