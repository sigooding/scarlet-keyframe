import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicPreviewAssetsPlugin } from "./public-preview-assets";

// `npm run serve` serves public/ straight from the repository. public/ holds working files: a retaken picture or a
// re-made depth map (npm run depth) replaces the old file under the same name, so the browser must be told to ask
// again, and be told "unchanged" (304) when nothing changed.

let dir: string;
let server: http.Server;
let base: string;

function write(rel: string, bytes: Buffer, mtimeSeconds?: number) {
  const file = path.join(dir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  if (mtimeSeconds !== undefined) fs.utimesSync(file, mtimeSeconds, mtimeSeconds);
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-public-"));
  write("film/depth/s1/pic/depth.png", Buffer.alloc(2000, 1), 1_700_000_000);
  write("film/img/s1/with space.jpg", Buffer.alloc(900, 2));
  write("film/audio/song.mp3", Buffer.alloc(3000, 3));
  let handler: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void = () => {};
  const plugin = publicPreviewAssetsPlugin({ publicDir: dir });
  (plugin.configurePreviewServer as unknown as (s: unknown) => void)({
    middlewares: { use: (fn: typeof handler) => (handler = fn) },
  });
  server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end("not here");
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("public/ in the production preview", () => {
  it("serves a file and tells the browser to ask again before reusing it", async () => {
    const res = await fetch(`${base}/film/depth/s1/pic/depth.png`);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(2000);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toBeTruthy();
  });

  it("answers 304 when nothing changed", async () => {
    const first = await fetch(`${base}/film/depth/s1/pic/depth.png`);
    const etag = first.headers.get("etag")!;
    const again = await fetch(`${base}/film/depth/s1/pic/depth.png`, { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
  });

  it("sends the new file once it has been replaced under the same name", async () => {
    const before = await fetch(`${base}/film/depth/s1/pic/depth.png`);
    const etag = before.headers.get("etag")!;
    write("film/depth/s1/pic/depth.png", Buffer.alloc(2600, 9), 1_800_000_000);
    const after = await fetch(`${base}/film/depth/s1/pic/depth.png`, { headers: { "If-None-Match": etag } });
    expect(after.status).toBe(200);
    expect((await after.arrayBuffer()).byteLength).toBe(2600);
    expect(after.headers.get("etag")).not.toBe(etag);
  });

  it("answers range requests with 206 for audio seeking", async () => {
    const res = await fetch(`${base}/film/audio/song.mp3`, { headers: { Range: "bytes=100-199" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/3000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("finds a file whose name has a space when the address spells it %20", async () => {
    const res = await fetch(`${base}/film/img/s1/with%20space.jpg`);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(900);
  });

  it("leaves everything else to the rest of the server", async () => {
    expect((await fetch(`${base}/film/img/s1/missing.jpg`)).status).toBe(404);
    expect((await fetch(`${base}/__api/export/status?id=1`)).status).toBe(404);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/film/img/s1/with%20space.jpg`, { method: "POST" })).status).toBe(404);
  });

  it("does not serve anything outside public/", async () => {
    fs.writeFileSync(path.join(dir, "..", "scarlet-outside-secret.txt"), "secret");
    const res = await fetch(`${base}/..%2fscarlet-outside-secret.txt`);
    expect(res.status).not.toBe(200);
    fs.rmSync(path.join(dir, "..", "scarlet-outside-secret.txt"), { force: true });
  });
});
