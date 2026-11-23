import { describe, expect, it } from "vitest";
import type { ResolvedAudioClip } from "./audioClips";
import { insertClipIntoShot } from "./cutaways";
import { lipSyncRowView, voiceLinesInShot, type LipSyncState } from "./lipSync";
import type { StoryLike } from "./model";
import { isVoiceRef, lipSyncClipStem, lipSyncStatus } from "../../scripts/lipsync/lib.mjs";

const story = (): StoryLike =>
  ({
    id: "t",
    title: "t",
    scenes: [
      {
        id: "s1",
        dialogueBeats: [
          { id: "a", text: "before", durationFrames: 24, background: "/film/img/x/a.jpg" },
          {
            id: "b",
            text: "the shot",
            durationFrames: 240,
            background: "/film/img/x/b.jpg",
            audioUrl: "/film/voice/x/b.mp3",
            animation: { zoom: [{ frame: 0, value: 1 }, { frame: 239, value: 1.05 }] },
            captions: [
              { text: "First line.", inFrame: 0, outFrame: 60, speaker: "VERA" },
              { text: "Second line.", inFrame: 100, outFrame: 160, speaker: "JACK" },
            ],
            afterBeatMode: "auto",
            afterBeatTargetSceneId: "s2",
          },
        ],
      },
    ],
  }) as unknown as StoryLike;

const beats = (s: StoryLike) => s.scenes.flatMap((sc) => sc.dialogueBeats ?? []);

describe("cutting a lip-synced clip into a shot", () => {
  it("splits the shot around the clip: same total length, the shot's id first, captions split, route on the last piece", () => {
    const next = insertClipIntoShot(story(), "b", 240, { from: 100, to: 160, picture: "video:/film/video/lipsync/b--line.mp4", text: "JACK: Second line." })!;
    const pieces = beats(next).slice(1);
    expect(pieces.map((p) => p.id)).toEqual(["b", "b~ls1", "b~ls2"]);
    expect(pieces.map((p) => p.durationFrames)).toEqual([100, 60, 80]);
    expect(pieces[1].background).toBe("video:/film/video/lipsync/b--line.mp4");
    expect(pieces[1].captions).toEqual([{ text: "Second line.", inFrame: 0, outFrame: 60, speaker: "JACK" }]);
    expect(pieces[0].captions?.map((c) => c.text)).toEqual(["First line."]);
    // only the shot's own piece keeps its sound; the route to the next scene moves to the last piece
    expect(pieces[0].audioUrl).toBe("/film/voice/x/b.mp3");
    expect(pieces[1].audioUrl).toBeUndefined();
    expect(pieces[0].afterBeatTargetSceneId).toBeUndefined();
    expect(pieces[2].afterBeatTargetSceneId).toBe("s2");
    expect(pieces[2].background).toBe("/film/img/x/b.jpg");
  });

  it("never reuses an id, so a shot can take a second clip; the input story is not changed", () => {
    const original = story();
    const once = insertClipIntoShot(original, "b", 240, { from: 0, to: 60, picture: "video:/one.mp4", text: "one" })!;
    expect(beats(original)).toHaveLength(2);
    const twice = insertClipIntoShot(once, "b", 60, { from: 10, to: 30, picture: "video:/two.mp4", text: "two" })!;
    const ids = beats(twice).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does nothing when the shot is not there or the clip does not fit", () => {
    expect(insertClipIntoShot(story(), "nope", 240, { from: 0, to: 10, picture: "video:/x.mp4", text: "" })).toBeNull();
    expect(insertClipIntoShot(story(), "b", 240, { from: 240, to: 260, picture: "video:/x.mp4", text: "" })).toBeNull();
    expect(insertClipIntoShot(story(), "b", 240, { from: 50, to: 50, picture: "video:/x.mp4", text: "" })).toBeNull();
  });
});

const clip = (id: string, src: string, startMs: number, endMs: number, lane = "voice"): ResolvedAudioClip =>
  ({ id, lane, src, anchorId: "b", offsetMs: 0, inMs: 0, durationMs: endMs - startMs, gain: 1, fadeInMs: 0, fadeOutMs: 0, anchorStartMs: 0, startMs, endMs }) as ResolvedAudioClip;

describe("the voice lines a shot can be lip-synced to", () => {
  const shot = { startFrame: 240, durationFrames: 240, beat: beats(story())[1] };
  it("offers voice lines that start during the shot, on the shot's own clock, labelled with their caption", () => {
    const lines = voiceLinesInShot(shot, [
      clip("before", "/film/voice/x/0.mp3", 5000, 12000), // starts before the shot: another face
      clip("l1", "/film/voice/x/1.mp3", 10000, 12500),
      clip("l2", "/film/voice/x/2.mp3", 14200, 16800),
      clip("sfx", "/film/sfx/x.mp3", 11000, 12000, "sfx"),
      clip("after", "/film/voice/x/3.mp3", 21000, 22000), // after the shot
      clip("sliver", "/film/voice/x/4.mp3", 19900, 22000), // starts in the last 0.1 s: the next shot's line
    ]);
    expect(lines.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(lines[0]).toMatchObject({ audio: "/film/voice/x/1.mp3", from: 0, to: 60, label: "VERA: First line." });
    expect(lines[1]).toMatchObject({ from: 101, to: 163, label: "JACK: Second line." });
  });
});

describe("the Make lip sync row", () => {
  const line = { id: "l1", audio: "/film/voice/x/1.mp3", from: 0, to: 60, label: "VERA: First line." };
  const base: LipSyncState = { ready: { ready: true, missing: [], setupCommand: "npm run lipsync:setup" }, job: null };
  it("walks from setup to ready to running to done", () => {
    expect(lipSyncRowView(base, { frameId: "b", canLipSync: false }, [line]).kind).toBe("hidden");
    // once the clip is in, the shot is a video: the outcome still shows on it
    const finished = { frameId: "b", totalFrames: 240, picture: "/film/img/x/b.jpg", line, status: "done" as const, id: "j", current: null, message: null, video: "/film/video/lipsync/b.mp4", duration: 1, applied: true, note: null };
    expect(lipSyncRowView({ ...base, job: finished }, { frameId: "b", canLipSync: false }, []).kind).toBe("done");
    expect(lipSyncRowView({ ...base, ready: null }, { frameId: "b", canLipSync: true }, [line]).kind).toBe("checking");
    expect(lipSyncRowView({ ...base, ready: "unavailable" }, { frameId: "b", canLipSync: true }, [line]).kind).toBe("unavailable");
    expect(lipSyncRowView({ ...base, ready: { ready: false, missing: ["ffmpeg"], setupCommand: "npm run lipsync:setup" } }, { frameId: "b", canLipSync: true }, [line])).toEqual({
      kind: "setup",
      missing: ["ffmpeg"],
      command: "npm run lipsync:setup",
    });
    expect(lipSyncRowView(base, { frameId: "b", canLipSync: true }, []).kind).toBe("no-lines");
    expect(lipSyncRowView(base, { frameId: "b", canLipSync: true }, [line]).kind).toBe("ready");
    const job = { frameId: "b", totalFrames: 240, picture: "/film/img/x/b.jpg", line, status: "running" as const, id: "j", current: "2/4", message: null, video: null, duration: null, applied: false, note: null };
    expect(lipSyncRowView({ ...base, job }, { frameId: "b", canLipSync: true }, [line]).kind).toBe("running");
    // another shot while it runs: ready, but the button waits
    expect(lipSyncRowView({ ...base, job }, { frameId: "other", canLipSync: true }, [line])).toMatchObject({ kind: "ready", busyElsewhere: true });
    expect(lipSyncRowView({ ...base, job: { ...job, status: "done", video: "/film/video/lipsync/b.mp4", applied: true } }, { frameId: "b", canLipSync: true }, [line]).kind).toBe("done");
    expect(lipSyncRowView({ ...base, job: { ...job, status: "error", message: "CUDA out of memory" } }, { frameId: "b", canLipSync: true }, [line])).toMatchObject({ kind: "failed", message: "CUDA out of memory" });
  });
});

describe("the lip sync command's checks", () => {
  it("accepts only voice files under public/film", () => {
    expect(isVoiceRef("/film/voice/s1/a.mp3")).toBe(true);
    for (const bad of ["/film/../x.mp3", "../x.mp3", "/etc/x.mp3", "/film/voice/a.txt", "/film/voice\\a.mp3", 42]) expect(isVoiceRef(bad), String(bad)).toBe(false);
  });
  it("names a clip after its picture and its line", () => {
    expect(lipSyncClipStem("/film/img/s20/523-They have.jpg", "/film/voice/s20/284-mara.mp3")).toBe("523-they-have--284-mara");
  });
  it("says what is missing before setup", () => {
    const status = lipSyncStatus("/nonexistent-repo", { env: { SCARLET_KEYFRAME_LATENTSYNC: "/nonexistent-latentsync" }, ffmpeg: () => false });
    expect(status.ready).toBe(false);
    expect(status.missing.join(" ")).toMatch(/Python environment.*LatentSync code.*weights.*ffmpeg/);
    expect(status.setupCommand).toBe("npm run lipsync:setup");
  });
});
