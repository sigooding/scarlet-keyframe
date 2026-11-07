import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createMediaLibraryMiddleware,
  forgetMediaScan,
  MEDIA_INDEX_PATH,
  mediaLibraryPlugin,
  scanMediaPaths,
} from "./media-library";
import { publicPreviewAssetsPlugin } from "./public-preview-assets";

// The editor shows a picture only when its path is in the media index. That index used to be two files a script
// wrote, so a picture added since the last build was invisible under `npm run serve` while `npm run dev` showed it.
// Both servers now answer the index from the disk itself.

let repoRoot: string;
let server: http.Server;
let base: string;

function write(rel: string, bytes = Buffer.alloc(16, 7)) {
  const file = path.join(repoRoot, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

beforeAll(async () => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-media-"));
  write("public/film/img/s1/01-backstreet.jpg");
  write("public/film/depth/s1/01-backstreet/depth.png");
  write("public/film/audio/theme.mp3");
  write("public/examples/media-index.json", Buffer.from(JSON.stringify(["/film/img/s1/01-backstreet.jpg"])));
  write("public/notes.txt"); // not media: never in the index
  let handler: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void = () => {};
  const middleware = createMediaLibraryMiddleware({ repoRoot });
  handler = middleware as typeof handler;
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
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

beforeEach(() => forgetMediaScan());

const index = async (): Promise<{ status: number; paths: string[]; cacheControl: string | null }> => {
  const res = await fetch(`${base}${MEDIA_INDEX_PATH}`);
  return {
    status: res.status,
    paths: res.status === 200 ? ((await res.json()) as string[]) : [],
    cacheControl: res.headers.get("cache-control"),
  };
};

describe("the media index the editor asks for", () => {
  it("lists every media file under public/, as site paths", async () => {
    const { status, paths } = await index();
    expect(status).toBe(200);
    expect(paths).toContain("/film/img/s1/01-backstreet.jpg");
    expect(paths).toContain("/film/depth/s1/01-backstreet/depth.png");
    expect(paths).toContain("/film/audio/theme.mp3");
  });

  it("leaves out what is not media, and anything hidden", async () => {
    write("public/.secret/hidden.jpg");
    const { paths } = await index();
    expect(paths).not.toContain("/notes.txt");
    expect(paths.some((p) => p.includes(".secret"))).toBe(false);
  });

  it("sees a picture added while the editor is open, with no rebuild and no script", async () => {
    expect((await index()).paths).not.toContain("/film/img/s9/999-a-new-retake.jpg");
    write("public/film/img/s9/999-a-new-retake.jpg");
    forgetMediaScan();
    expect((await index()).paths).toContain("/film/img/s9/999-a-new-retake.jpg");
  });

  it("is never cached: what is on disk changes while the page is open", async () => {
    expect((await index()).cacheControl).toBe("no-store");
  });

  it("is sorted and has no duplicates, whichever root a file came from", async () => {
    const { paths } = await index();
    expect([...paths].sort()).toEqual(paths);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("still serves the media files themselves", async () => {
    const res = await fetch(`${base}/film/img/s1/01-backstreet.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("hands anything else on", async () => {
    expect((await fetch(`${base}/index.html`)).status).toBe(404);
  });
});

describe("scanMediaPaths", () => {
  it("answers from a cache for a moment, then walks the disk again", () => {
    const first = scanMediaPaths(repoRoot, 1000);
    write("public/film/img/s9/1000-while-cached.jpg");
    expect(scanMediaPaths(repoRoot, 1500)).toEqual(first); // still the cached answer
    expect(scanMediaPaths(repoRoot, 9000)).toContain("/film/img/s9/1000-while-cached.jpg");
  });

  it("is quick enough to answer on every request", () => {
    forgetMediaScan();
    const started = Date.now();
    scanMediaPaths(repoRoot, started);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("both servers answer it", () => {
  const routes = (plugin: ReturnType<typeof mediaLibraryPlugin>) => {
    const added: unknown[] = [];
    const server = { middlewares: { use: (fn: unknown) => added.push(fn) } };
    (plugin.configureServer as unknown as (s: unknown) => void)(server);
    (plugin.configurePreviewServer as unknown as (s: unknown) => void)(server);
    return added;
  };

  it("the dev server and the preview server both get the middleware", () => {
    expect(routes(mediaLibraryPlugin({ repoRoot })).length).toBe(2);
  });

  it("the preview server's public folder does not answer the index with the file a script left there", async () => {
    let handler: ((req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void) | null = null;
    const plugin = publicPreviewAssetsPlugin({ publicDir: path.join(repoRoot, "public") });
    (plugin.configurePreviewServer as unknown as (s: unknown) => void)({
      middlewares: { use: (fn: typeof handler) => (handler = fn) },
    });
    const sirvServer = http.createServer((req, res) =>
      handler!(req, res, () => {
        res.statusCode = 418; // "not mine": the media plugin behind it answers in the real app
        res.end("passed on");
      }),
    );
    await new Promise<void>((resolve) => sirvServer.listen(0, "127.0.0.1", resolve));
    const port = (sirvServer.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${MEDIA_INDEX_PATH}`);
    expect(res.status).toBe(418);
    // but it still serves the pictures beside it
    expect((await fetch(`http://127.0.0.1:${port}/film/img/s1/01-backstreet.jpg`)).status).toBe(200);
    sirvServer.close();
  });
});
