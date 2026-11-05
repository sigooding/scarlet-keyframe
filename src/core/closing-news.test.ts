import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import film from "../data/nobodys-witness-film.json";
import audioDurations from "../data/audio-durations.json";
import mediaIndex from "../data/media-index.json";
import { buildKeyframes, createProjectState, parseImportPayload, type AnyRecord } from "./model";
import { buildTimelineClips } from "../sequence/animate";

const repoRoot = path.resolve(__dirname, "../..");

const NEWS_BEATS = ["nw_b1678", "nw_b1679"] as const;
const PLATE_BY_BEAT = {
  nw_b1678: "/film/img/s100/1678-the-evening-news-kurose.jpg",
  nw_b1679: "/film/img/s100/1679-the-photograph-of-ishida.jpg",
} as const;
const DEPTH_BY_BEAT = {
  nw_b1678: "/film/depth/recreated-uncut/1678-evening-news-depth.jpg",
  nw_b1679: "/film/depth/recreated-uncut/1679-ishida-photograph-depth.jpg",
} as const;
// The invented broadcast chyron ran at inset scale on these four wide frames.
const CHYRON_FRAMES = [
  "158-the-third-stool",
  "159-she-doesnt-turn",
  "160-the-clip",
  "161-stool-three",
] as const;

function readJpegDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`No JPEG SOF marker in ${filePath}`);
}

const sceneBeats = () =>
  ((film.scenes as AnyRecord[]).find((s) => s.id === "nw_s100")!.dialogueBeats as AnyRecord[]);

describe("Turn 61 — the closing news is two sequential TV frames", () => {
  it("gives each news beat its own picture instead of one crammed screen", () => {
    const beats = sceneBeats();
    const byId = new Map(beats.map((b) => [String(b.id), b]));
    for (const id of NEWS_BEATS) {
      expect(byId.get(id)?.background, `${id} needs its own plate`).toBe(PLATE_BY_BEAT[id]);
    }
    // Two frames, two different pictures: the old version reused one picture for both.
    expect(PLATE_BY_BEAT.nw_b1678).not.toBe(PLATE_BY_BEAT.nw_b1679);
  });

  it("runs Kurose first and Ishida's portrait second, in that order", () => {
    const ids = sceneBeats().map((b) => String(b.id));
    expect(ids.indexOf("nw_b1678")).toBeLessThan(ids.indexOf("nw_b1679"));
    // The portrait frame is held through "Nobody looks up." before the shop returns.
    const beats = sceneBeats();
    const idx = beats.findIndex((b) => b.id === "nw_b1679");
    expect(beats[idx + 1].id).toBe("nw_b1680");
    expect(beats[idx + 1].background).toBeUndefined();
    expect(beats[idx + 2].id).toBe("nw_b1681");
  });

  it("drops no beats and creates no new ones", () => {
    expect(sceneBeats()).toHaveLength(13);
    const ids = sceneBeats().map((b) => String(b.id));
    expect(ids.slice(3, 7)).toEqual(["nw_b1678", "nw_b1679", "nw_b1680", "nw_b1681"]);
  });

  it("installs each plate at 1920x1080 and lists it in both media indexes", () => {
    const listed = new Set(mediaIndex.map((p) => p.replace(/^\/+/, "")));
    const examples = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "public/examples/media-index.json"), "utf8"),
    ) as string[];
    for (const id of NEWS_BEATS) {
      const rel = PLATE_BY_BEAT[id].replace(/^\/+/, "");
      const file = path.join(repoRoot, "public", rel);
      expect(fs.existsSync(file)).toBe(true);
      expect(readJpegDimensions(file)).toEqual({ width: 1920, height: 1080 });
      expect(listed.has(rel)).toBe(true);
      expect(examples).toContain(`/${rel}`);
    }
  });

  it("gives both beats a depth camera on their own 960x540 greyscale map", () => {
    const listed = new Set(mediaIndex.map((p) => p.replace(/^\/+/, "")));
    for (const id of NEWS_BEATS) {
      const rel = DEPTH_BY_BEAT[id].replace(/^\/+/, "");
      const file = path.join(repoRoot, "public", rel);
      expect(fs.existsSync(file)).toBe(true);
      expect(readJpegDimensions(file)).toEqual({ width: 960, height: 540 });
      expect(listed.has(rel)).toBe(true);
    }
    const beats = sceneBeats();
    for (const id of NEWS_BEATS) {
      const cinematic = beats.find((b) => b.id === id)!.cinematic as AnyRecord;
      expect(cinematic).toMatchObject({ mode: "static", depthMotion: "push", depthAmount: 0.22 });
    }
  });

  it("keeps the timing: the two frames split the hold the news beat already owned", () => {
    const voiceMap = new Map(Object.entries(audioDurations as Record<string, number>));
    const project = createProjectState(
      parseImportPayload(film as never, "nobodys-witness-film.json", { voiceDurations: voiceMap }),
    );
    const { clips } = buildTimelineClips(buildKeyframes(project.story), voiceMap);
    const byBeat = new Map(clips.map((c) => [c.keyframe.id, c]));
    for (const id of NEWS_BEATS) {
      expect(byBeat.get(id)!.keyframe.picture).toBe(PLATE_BY_BEAT[id]);
      expect(byBeat.get(id)!.durationFrames).toBeGreaterThan(0);
    }
    // "Nobody looks up." still holds the portrait frame it inherits.
    expect(byBeat.get("nw_b1680")!.keyframe.picture).toBe(PLATE_BY_BEAT.nw_b1679);
    expect(clips.filter((c) => c.keyframe.sceneId === "nw_s100")).toHaveLength(13);
  });

  it("archives the superseded two-in-one frame and each repaired chyron frame", () => {
    const archived = (name: string) => fs.existsSync(
      path.join(repoRoot, "public/film/img/archive/s100", name),
    );
    expect(archived("320-the-news-nobody-watches--v2.jpg")).toBe(true);
    for (const name of CHYRON_FRAMES) {
      const live = path.join(repoRoot, `public/film/img/s100/${name}.jpg`);
      expect(readJpegDimensions(live)).toEqual({ width: 1920, height: 1080 });
      expect(archived(`${name}--v4.jpg`)).toBe(true);
    }
  });
});
