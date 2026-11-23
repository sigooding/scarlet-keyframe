// The editor server's lip sync job (POST /__api/depth/lipsync), with a stand-in for `npm run lipsync` (no GPU here).
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DepthJobView, DepthReady, LipSyncReady } from "../src/core/depthApiTypes";
import { createDepthMiddleware } from "./depth-api";

const repoRoot = path.resolve(__dirname, "..");

// Writes a clip where the real command would, prints its steps and the @@result line. FAKE_LIPSYNC_MODE: ok | fail | outside
const FAKE_LIPSYNC_CLI = `
const fs = require("fs"), path = require("path");
const [picture, , audio] = process.argv.slice(2);
const mode = process.env.FAKE_LIPSYNC_MODE || "ok";
console.log("1/4 making a video of the still, as long as the line");
console.log("2/4 redrawing the mouth on the GPU (LatentSync 1.5)");
if (mode === "fail") { console.log("CUDA out of memory"); console.log("@@result " + JSON.stringify({ ok: false, message: "CUDA out of memory" })); process.exit(1); }
const video = mode === "outside" ? "/film/img/sneaky.mp4" : "/film/video/lipsync/" + path.basename(picture).replace(/\\.[^.]+$/, "") + "--line.mp4";
const file = path.join(process.env.SCARLET_KEYFRAME_PUBLIC, ...video.split("/").filter(Boolean));
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, "mp4");
console.log("@@result " + JSON.stringify({ ok: true, video, picture, audio, duration: 1.5 }));
`;

let work: string;
let publicDir: string;
let server: http.Server;
let port: number;
let lipsync: LipSyncReady = { ready: true, missing: [], setupCommand: "npm run lipsync:setup" };

function touch(rel: string) {
  const file = path.join(publicDir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
}

function request<T = Record<string, unknown>>(method: string, route: string, body?: unknown): Promise<{ status: number; json: T }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, method, path: `/__api/depth/${route}`, headers: payload ? { "Content-Type": "application/json" } : {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8") || "null") as T }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitDone(id: string): Promise<DepthJobView> {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const { json } = await request<DepthJobView>("GET", `status?id=${id}`);
    if (json.status !== "running") return json;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("the job did not finish");
}

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-lipsync-api-"));
  publicDir = path.join(work, "public");
  const cli = path.join(work, "fake-lipsync.cjs");
  fs.writeFileSync(cli, FAKE_LIPSYNC_CLI);
  touch("film/img/s1/face.jpg");
  touch("film/voice/s1/line.mp3");
  const middleware = createDepthMiddleware({
    repoRoot,
    publicDir,
    lipsyncCliPath: cli,
    probe: () => ({ python: "fake", packages: true, gpu: false }),
    lipsyncProbe: () => lipsync,
  });
  server = http.createServer((req, res) => middleware(req, res, () => ((res.statusCode = 404), res.end())));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server?.close();
  delete process.env.FAKE_LIPSYNC_MODE;
  fs.rmSync(work, { recursive: true, force: true });
});

describe("lip sync job (POST /__api/depth/lipsync)", () => {
  it("says on /ready whether lip sync is set up, and what is missing", async () => {
    lipsync = { ready: false, missing: ["the LatentSync code"], setupCommand: "npm run lipsync:setup" };
    const { json } = await request<DepthReady>("GET", "ready?fresh=1");
    expect(json.lipsync).toEqual(lipsync);
    lipsync = { ready: true, missing: [], setupCommand: "npm run lipsync:setup" };
  });

  it("asks for the one-time setup when it is not set up", async () => {
    lipsync = { ready: false, missing: ["the weights (latentsync_unet.pt)"], setupCommand: "npm run lipsync:setup" };
    const { status, json } = await request<{ error: string; message: string }>("POST", "lipsync", { picture: "/film/img/s1/face.jpg", audio: "/film/voice/s1/line.mp3" });
    expect(status).toBe(412);
    expect(json.error).toBe("setup-needed");
    expect(json.message).toContain("npm run lipsync:setup");
    lipsync = { ready: true, missing: [], setupCommand: "npm run lipsync:setup" };
  });

  it("refuses a voice line that is not a file under public/film, or not there", async () => {
    for (const audio of ["../secret.mp3", "/film/voice/s1/missing.mp3", "/etc/passwd", "/film/voice/s1/line.txt"]) {
      const { status } = await request("POST", "lipsync", { picture: "/film/img/s1/face.jpg", audio });
      expect(status, audio).toBe(400);
    }
  });

  it("makes the clip and answers with it", async () => {
    process.env.FAKE_LIPSYNC_MODE = "ok";
    const { status, json } = await request<DepthJobView>("POST", "lipsync", { picture: "/film/img/s1/face.jpg", audio: "/film/voice/s1/line.mp3" });
    expect(status).toBe(200);
    expect(json.kind).toBe("lipsync");
    const done = await waitDone(json.id!);
    expect(done.status).toBe("done");
    expect(done.result?.video).toBe("/film/video/lipsync/face--line.mp4");
    expect(done.result?.duration).toBe(1.5);
  });

  it("reports the command's failure, and never accepts a clip outside the lip sync folder", async () => {
    process.env.FAKE_LIPSYNC_MODE = "fail";
    let { json } = await request<DepthJobView>("POST", "lipsync", { picture: "/film/img/s1/face.jpg", audio: "/film/voice/s1/line.mp3" });
    let done = await waitDone(json.id!);
    expect(done.status).toBe("error");
    expect(done.message).toContain("CUDA out of memory");
    process.env.FAKE_LIPSYNC_MODE = "outside";
    ({ json } = await request<DepthJobView>("POST", "lipsync", { picture: "/film/img/s1/face.jpg", audio: "/film/voice/s1/line.mp3" }));
    done = await waitDone(json.id!);
    expect(done.status).toBe("error");
    expect(done.message).toContain("outside the lip sync folder");
  });
});
