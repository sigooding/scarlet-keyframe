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

let work: string;
let publicDir: string;
let cli: string;
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
  process.env.FAKE_PNG = PNG_1X1;
  touch("film/img/t/a.jpg");
  touch("film/img/t/b.jpg");
  touch("film/img/t/has-map.jpg");
  touch("film/depth/t/has-map/depth.png");
  fs.writeFileSync(path.join(publicDir, "film", "depth", "t", "has-map", "depth.png"), Buffer.from(PNG_1X1, "base64"));
});

afterAll(() => {
  delete process.env.FAKE_DEPTH_MODE;
  delete process.env.FAKE_PNG;
  fs.rmSync(work, { recursive: true, force: true });
});

beforeEach(async () => {
  machine = READY;
  mode("ok");
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
  it("reports Python, its packages, the GPU and the model", async () => {
    machine = { python: ".depth-venv", packages: true, gpu: true };
    const { status: code, json } = await request<DepthReady>("GET", "ready");
    expect(code).toBe(200);
    expect(json).toMatchObject({ ok: true, python: ".depth-venv", packages: true, gpu: true, busy: null });
    expect(json.model).toMatchObject({ name: "base", custom: false });
    expect(json.model.mb).toBeGreaterThan(300);
    expect(typeof json.model.cached).toBe("boolean");
  });

  it("says when Python or its packages are missing", async () => {
    machine = { python: null, packages: false, gpu: false };
    expect((await request<DepthReady>("GET", "ready")).json).toMatchObject({ python: null, packages: false });
  });

  it("knows a model file chosen by the person", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const own = path.join(work, "mine.onnx");
    fs.writeFileSync(own, "model");
    await startServer({ modelFile: own });
    expect((await request<DepthReady>("GET", "ready")).json.model).toEqual({ name: "mine.onnx", mb: 0, cached: true, custom: true });
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
    expect(flags(done)).toBe("flags: --json");

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
});
