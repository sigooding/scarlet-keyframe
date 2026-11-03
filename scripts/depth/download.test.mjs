// The downloader, against a small server of its own (nothing is fetched from the internet).
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { downloadModel, ensureModelFile, modelIsCached, sha256Of } from "./download.mjs";
import { UserError } from "./lib.mjs";

const BODY = crypto.randomBytes(300_000);
const SHA = crypto.createHash("sha256").update(BODY).digest("hex");

let server;
let base;
let hits;
let mode;
let dir;

const spec = (extra = {}) => ({ file: "m.onnx", url: `${base}/m.onnx`, bytes: BODY.length, sha256: SHA, note: "", ...extra });
const capture = () => {
  const lines = [];
  return { lines, log: (text) => lines.push(text), write: (text) => lines.push(text) };
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    if (mode === "missing") {
      res.statusCode = 404;
      res.end("no");
    } else if (mode === "cut") {
      res.writeHead(200, { "Content-Length": BODY.length });
      res.write(BODY.subarray(0, 100_000));
      setTimeout(() => res.destroy(), 20);
    } else if (mode === "wrong") {
      const other = Buffer.from(BODY);
      other[1000] ^= 0xff;
      res.writeHead(200, { "Content-Length": other.length });
      res.end(other);
    } else if (mode === "short") {
      res.writeHead(200, { "Content-Length": 1000 });
      res.end(BODY.subarray(0, 1000));
    } else {
      res.writeHead(200, { "Content-Length": BODY.length });
      res.end(BODY);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  hits = 0;
  mode = "ok";
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "scarlet-dl-"));
});

describe("downloading a model", () => {
  it("fetches it once, checks it, remembers that it did, and does not fetch it again", async () => {
    const out = capture();
    const file = await ensureModelFile(spec(), { dir, ...out });
    expect(file).toBe(path.join(dir, "m.onnx"));
    expect(fs.readFileSync(file).equals(BODY)).toBe(true);
    expect(fs.readFileSync(`${file}.ok`, "utf8").trim()).toBe(SHA);
    expect(fs.existsSync(`${file}.part`)).toBe(false);
    expect(hits).toBe(1);
    expect(modelIsCached(spec(), dir)).toBe(true);

    await ensureModelFile(spec(), { dir, ...out });
    expect(hits).toBe(1);
  });

  it("says what it is downloading and reports every ten percent, one line each, for a program to read", async () => {
    const out = capture();
    await ensureModelFile(spec(), { dir, ...out, isTTY: false });
    expect(out.lines[0]).toMatch(/^Downloading m\.onnx \(\d/);
    const percents = out.lines.filter((line) => /^\s+\d+%\n$/.test(line)).map((line) => Number(line.trim().replace("%", "")));
    expect(percents.length).toBeGreaterThan(0);
    expect(percents.every((value) => value % 10 === 0)).toBe(true);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents[percents.length - 1]).toBe(100);
  });

  it("refuses a file whose checksum is not the pinned one, and keeps nothing", async () => {
    mode = "wrong";
    const error = await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toContain("not the expected one");
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses a file of the wrong size", async () => {
    mode = "short";
    const error = await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("says so when the download is cut off, and removes the partial file", async () => {
    mode = "cut";
    const error = await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toMatch(/interrupted/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("says where to get the file when the address does not answer", async () => {
    mode = "missing";
    const error = await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toContain("HTTP 404");
    expect(error.message).toContain(`${base}/m.onnx`);
    expect(error.message).toContain(dir);
  });
});

describe("a model you downloaded yourself", () => {
  it("is checked once (the checksum), then trusted", async () => {
    fs.writeFileSync(path.join(dir, "m.onnx"), BODY);
    const out = capture();
    await ensureModelFile(spec(), { dir, ...out });
    expect(hits).toBe(0);
    expect(out.lines.join("")).toContain("Checking m.onnx");
    expect(fs.existsSync(path.join(dir, "m.onnx.ok"))).toBe(true);
    const again = capture();
    await ensureModelFile(spec(), { dir, ...again });
    expect(again.lines).toEqual([]);
  });

  it("is refused when it is the wrong size, or not the published file, and is never overwritten", async () => {
    fs.writeFileSync(path.join(dir, "m.onnx"), BODY.subarray(0, 5000));
    expect((await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e)).message).toContain("not the expected size");
    const other = Buffer.from(BODY);
    other[7] ^= 1;
    fs.writeFileSync(path.join(dir, "m.onnx"), other);
    expect((await ensureModelFile(spec(), { dir, ...capture() }).catch((e) => e)).message).toContain("does not match the published checksum");
    expect(fs.readFileSync(path.join(dir, "m.onnx")).equals(other)).toBe(true);
    expect(hits).toBe(0);
  });

  it("modelIsCached looks at the size only, so it is quick", () => {
    expect(modelIsCached(spec(), dir)).toBe(false);
    fs.writeFileSync(path.join(dir, "m.onnx"), BODY);
    expect(modelIsCached(spec(), dir)).toBe(true);
    expect(modelIsCached(spec({ bytes: 5 }), dir)).toBe(false);
  });
});

describe("sha256Of", () => {
  it("is the file's SHA-256", async () => {
    const file = path.join(dir, "x");
    fs.writeFileSync(file, BODY);
    expect(await sha256Of(file)).toBe(SHA);
  });
});

describe("downloadModel on its own", () => {
  it("writes the file and its .ok marker", async () => {
    const file = path.join(dir, "sub", "m.onnx");
    await downloadModel(spec(), file, capture());
    expect(fs.readFileSync(file).equals(BODY)).toBe(true);
    expect(fs.existsSync(`${file}.ok`)).toBe(true);
  });
});
