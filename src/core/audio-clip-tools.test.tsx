import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudioClipTools, type AudioSpanTarget } from "../components/AudioClipTools";
import type { AudioLaneId, ResolvedAudioClip } from "./audioClips";

const noop = () => {};

const buttonTag = (html: string, testId: string) =>
  new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "";
const buttonText = (html: string, testId: string) =>
  new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>(.*?)</button>`, "s")
    .exec(html)?.[1]
    .replace(/<!--.*?-->/g, "")
    .trim() ?? "";
const isDisabled = (html: string, testId: string) => buttonTag(html, testId).includes("disabled");

function cue(patch: Partial<ResolvedAudioClip> = {}): ResolvedAudioClip {
  return {
    id: "ac-music-1",
    lane: "music",
    src: "/film/audio/bad-guy.mp3",
    anchorId: "b1",
    offsetMs: 0,
    inMs: 0,
    durationMs: 8000,
    gain: 0.7,
    fadeInMs: 0,
    fadeOutMs: 0,
    anchorStartMs: 0,
    startMs: 0,
    endMs: 8000,
    ...patch,
  };
}

const SPANS: AudioSpanTarget[] = [
  { kind: "shot", label: "shot 3 of 10 — Depends who's calling", startMs: 2000, endMs: 6000 },
  { kind: "scene", label: "10 — Depends who's calling", startMs: 0, endMs: 60000 },
];

function render(options: {
  clip?: ResolvedAudioClip;
  lane?: AudioLaneId;
  playheadMs?: number;
  nextClip?: ResolvedAudioClip;
  spans?: AudioSpanTarget[];
} = {}) {
  return renderToStaticMarkup(
    <AudioClipTools
      clip={options.clip ?? cue()}
      lane={options.lane ?? "music"}
      playheadMs={options.playheadMs ?? 4000}
      nextClip={options.nextClip}
      spans={options.spans ?? SPANS}
      onTool={noop}
    />,
  );
}

describe("the cut & trim tools on a sound clip", () => {
  it("offers a cut, a start-here and an end-here when the playhead is inside the clip", () => {
    const html = render({ playheadMs: 4000 });
    expect(isDisabled(html, "audio-tool-split")).toBe(false);
    expect(isDisabled(html, "audio-tool-trim-start")).toBe(false);
    expect(isDisabled(html, "audio-tool-trim-end")).toBe(false);
    expect(buttonText(html, "audio-tool-split")).toContain("Cut at playhead (S)");
    expect(html).toContain("4000 ms into this music clip");
  });

  it("will not cut when the playhead is outside the clip, and says where to put it", () => {
    const html = render({ playheadMs: 12000 });
    expect(isDisabled(html, "audio-tool-split")).toBe(true);
    expect(html).toContain("Put the playhead inside this music clip");
    // past the end, the clip can still be carried out to the playhead, but it cannot start after its own end
    expect(isDisabled(html, "audio-tool-trim-end")).toBe(false);
    expect(isDisabled(html, "audio-tool-trim-start")).toBe(true);
  });

  it("can carry an edge out to a playhead before or after the clip", () => {
    const early = render({ clip: cue({ startMs: 4000, endMs: 8000, anchorId: "b2", offsetMs: 0 }), playheadMs: 1000 });
    expect(isDisabled(early, "audio-tool-trim-start")).toBe(false); // the cue starts earlier
    expect(isDisabled(early, "audio-tool-trim-end")).toBe(true); // but cannot end before it starts
  });

  it("will not cut off a sliver at either end", () => {
    expect(isDisabled(render({ playheadMs: 5 }), "audio-tool-split")).toBe(true);
    expect(isDisabled(render({ playheadMs: 7995 }), "audio-tool-split")).toBe(true);
    expect(isDisabled(render({ playheadMs: 100 }), "audio-tool-split")).toBe(false);
  });

  it("will not trim an edge that is already where the playhead is", () => {
    const html = render({ playheadMs: 0 });
    expect(isDisabled(html, "audio-tool-trim-start")).toBe(true);
    const end = render({ playheadMs: 8000 });
    expect(isDisabled(end, "audio-tool-trim-end")).toBe(true);
  });

  it("offers to fill the shot or the scene the playhead is in, and names them", () => {
    const html = render();
    expect(buttonText(html, "audio-tool-fit-shot")).toContain("Fill the shot");
    expect(buttonText(html, "audio-tool-fit-scene")).toContain("Fill the scene");
    expect(buttonTag(html, "audio-tool-fit-scene")).toContain("10 — Depends who&#x27;s calling");
    expect(buttonTag(html, "audio-tool-fit-shot")).toContain("looped");
  });

  it("shows nothing to fill when the app knows no spans", () => {
    const html = render({ spans: [] });
    expect(buttonTag(html, "audio-tool-fit-shot")).toBe("");
    expect(buttonTag(html, "audio-tool-duplicate")).not.toBe("");
  });

  it("marks the fade the clip already has", () => {
    const html = render({ clip: cue({ fadeInMs: 1000, fadeOutMs: 0 }) });
    expect(buttonTag(html, "audio-fade-in-1000")).toContain("is-active");
    expect(buttonTag(html, "audio-fade-in-500")).not.toContain("is-active");
    expect(buttonTag(html, "audio-fade-out-0")).toContain("is-active");
    expect(buttonText(html, "audio-fade-in-0")).toBe("none");
    expect(buttonText(html, "audio-fade-out-2000")).toBe("2 s");
  });

  it("names the cue a crossfade would run into", () => {
    const next = cue({ id: "ac-music-2", src: "/film/audio/coins-measure-time.mp3", startMs: 8000, endMs: 20000 });
    const html = render({ nextClip: next });
    expect(isDisabled(html, "audio-tool-crossfade-apply")).toBe(false);
    expect(buttonText(html, "audio-tool-crossfade-apply")).toContain("coins-measure-time");
    expect(buttonText(html, "audio-tool-crossfade-apply")).toContain("1 s");
    expect(buttonTag(html, "audio-crossfade-1000")).toContain("is-active");
  });

  it("says so, and offers nothing, when there is no cue after this one on the lane", () => {
    const html = render();
    expect(isDisabled(html, "audio-tool-crossfade-apply")).toBe(true);
    expect(buttonText(html, "audio-tool-crossfade-apply")).toContain("Nothing after this on the MUSIC lane");
    expect(isDisabled(html, "audio-crossfade-2000")).toBe(true);
  });

  it("is the same tools on the other lanes, in that lane's words", () => {
    const html = render({ lane: "voice", playheadMs: 12000 });
    expect(html).toContain("Put the playhead inside this voice clip");
    expect(buttonTag(html, "audio-tool-crossfade-apply")).toContain("VOICE lane");
    expect(html).toContain('data-testid="audio-clip-tools"');
  });
});
