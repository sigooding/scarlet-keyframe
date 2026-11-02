import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetThumbIndex,
  hasThumbIndex,
  loadThumbIndex,
  thumbFor,
  thumbIndexState,
  thumbKey,
  THUMB_DIR,
} from "./thumbs";

const LISTED = [
  "/film/img/s2/10-bar.jpg",
  "/film/img/s1_retakes/download (1).jpg",
  "/sweet-jesus/characters/jack-monroe.webp",
  "/film/img/s82/new-empty-newsroom.jpg",
  "/film/img/s82/new-empty-newsroom.webp",
];

function mockIndex(files: string[] | null, status = 200) {
  const fetchMock = vi.fn(async () => {
    if (files === null) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify({ version: 1, width: 400, files }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function withIndex(files: string[] | null) {
  __resetThumbIndex();
  mockIndex(files);
  await loadThumbIndex();
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetThumbIndex();
});

describe("thumbFor", () => {
  it("returns the thumbnail when the index lists the picture", async () => {
    await withIndex(LISTED);
    expect(hasThumbIndex()).toBe(true);
    expect(thumbFor("/film/img/s2/10-bar.jpg")).toBe(`${THUMB_DIR}/film/img/s2/10-bar.jpg`);
  });

  it("returns the original when the index does not list it", async () => {
    await withIndex(LISTED);
    expect(thumbFor("/film/img/s2/11-unlisted.jpg")).toBe("/film/img/s2/11-unlisted.jpg");
    expect(thumbFor("/film/img/s2/not-a-picture.txt")).toBe("/film/img/s2/not-a-picture.txt");
  });

  it("uses the originals when the index is missing", async () => {
    __resetThumbIndex();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await loadThumbIndex()).toBe(false);
    expect(thumbIndexState()).toBe("unavailable");
    expect(hasThumbIndex()).toBe(false);
    expect(thumbFor("/film/img/s2/10-bar.jpg")).toBe("/film/img/s2/10-bar.jpg");
  });

  it("uses the originals before the index has loaded", () => {
    __resetThumbIndex();
    expect(thumbIndexState()).toBe("idle");
    expect(thumbFor("/film/img/s2/10-bar.jpg")).toBe("/film/img/s2/10-bar.jpg");
  });

  it("ignores query strings and hashes when looking a picture up", async () => {
    await withIndex(LISTED);
    expect(thumbFor("/film/img/s2/10-bar.jpg?v=3")).toBe(`${THUMB_DIR}/film/img/s2/10-bar.jpg`);
    expect(thumbFor("/film/img/s2/10-bar.jpg#top")).toBe(`${THUMB_DIR}/film/img/s2/10-bar.jpg`);
    // The cached thumbnail carries no query string, so it cannot be stale.
    expect(thumbFor("/film/img/s2/10-bar.jpg?cache=1")).not.toContain("?");
  });

  it("matches percent-encoded refs (`%20`) and writes them back encoded", async () => {
    await withIndex(LISTED);
    expect(thumbFor("/film/img/s1_retakes/download%20(1).jpg")).toBe(
      `${THUMB_DIR}/film/img/s1_retakes/download%20(1).jpg`,
    );
    // A ref with a literal space is matched too, and the URL stays valid.
    expect(thumbFor("/film/img/s1_retakes/download (1).jpg")).toBe(
      `${THUMB_DIR}/film/img/s1_retakes/download%20(1).jpg`,
    );
    expect(thumbFor("/film/img/s1_retakes/download%20(1).jpg?x=1")).toBe(
      `${THUMB_DIR}/film/img/s1_retakes/download%20(1).jpg`,
    );
  });

  it("finds the WebP thumbnail written for a PNG (transparency kept)", async () => {
    await withIndex(LISTED);
    expect(thumbFor("/sweet-jesus/characters/jack-monroe.png")).toBe(
      `${THUMB_DIR}/sweet-jesus/characters/jack-monroe.webp`,
    );
  });

  it("prefers the thumbnail that matches the source extension", async () => {
    await withIndex(LISTED);
    expect(thumbFor("/film/img/s82/new-empty-newsroom.jpg")).toBe(
      `${THUMB_DIR}/film/img/s82/new-empty-newsroom.jpg`,
    );
    expect(thumbFor("/film/img/s82/new-empty-newsroom.png")).toBe(
      `${THUMB_DIR}/film/img/s82/new-empty-newsroom.webp`,
    );
  });

  it("leaves non-file references alone", async () => {
    await withIndex(LISTED);
    for (const ref of [
      "data:image/png;base64,AAAA",
      "blob:http://127.0.0.1:4173/abc",
      "https://raw.githubusercontent.com/sigooding/scarlett-witness/main/public/film/img/s2/10-bar.jpg",
      "asset:upload-1",
      "gradient:scene-1",
      "emoji:🎬",
    ]) {
      expect(thumbFor(ref)).toBe(ref);
    }
    expect(thumbFor(undefined)).toBeUndefined();
  });

  it("keeps the originals on a page opened from disk", async () => {
    await withIndex(LISTED);
    vi.stubGlobal("window", { location: { protocol: "file:", origin: "null" } });
    expect(thumbFor("/film/img/s2/10-bar.jpg")).toBe("/film/img/s2/10-bar.jpg");
  });

  it("never asks for a thumbnail the index does not list", async () => {
    await withIndex(LISTED);
    const requests: string[] = [];
    for (const ref of [
      "/film/img/s2/10-bar.jpg",
      "/film/img/unknown/a.png",
      "/film/img/s1_retakes/download (2).jpg",
    ]) {
      const url = thumbFor(ref);
      if (url.startsWith(THUMB_DIR)) requests.push(url);
    }
    expect(requests).toHaveLength(1);
    expect(requests[0]).toBe(`${THUMB_DIR}/film/img/s2/10-bar.jpg`);
  });

  it("accepts an index that is a plain array of files", async () => {
    __resetThumbIndex();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(["/film/img/s2/10-bar.jpg"]), { status: 200 })),
    );
    await loadThumbIndex();
    expect(thumbFor("/film/img/s2/10-bar.jpg")).toBe(`${THUMB_DIR}/film/img/s2/10-bar.jpg`);
  });

  it("loads the index once, even when called many times", async () => {
    __resetThumbIndex();
    const fetchMock = mockIndex(LISTED);
    await Promise.all([loadThumbIndex(), loadThumbIndex(), loadThumbIndex()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("thumbKey", () => {
  it("normalises file references and rejects everything else", () => {
    expect(thumbKey("/film/img/a.jpg")).toBe("/film/img/a.jpg");
    expect(thumbKey("film/img/a.jpg")).toBe("/film/img/a.jpg");
    expect(thumbKey("./film/img/a.jpg")).toBe("/film/img/a.jpg");
    expect(thumbKey("/film/img/a.jpg?v=1")).toBe("/film/img/a.jpg");
    expect(thumbKey("  /film/img/a.jpg  ")).toBe("/film/img/a.jpg");
    expect(thumbKey("")).toBeUndefined();
    expect(thumbKey(undefined)).toBeUndefined();
    expect(thumbKey("https://example.com/a.jpg")).toBeUndefined();
    expect(thumbKey("data:image/jpeg;base64,AA")).toBeUndefined();
    expect(thumbKey("asset:abc")).toBeUndefined();
  });
});
