import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinematicPreview } from "../components/CinematicPreview";
import { Topbar } from "../components/Topbar";
import { findTimelineShots } from "../components/Timeline";
import film from "../data/sweet-jesus-film.json";
import { buildTimelineClips } from "../sequence/animate";
import { BUILT_IN_FILMS, createBundledFilm } from "./bundledFilms";
import { captionMetrics, effectiveCaptionsForBeat, makeCaptionsSrt } from "./captions";
import { setBeatField, setPicture } from "./edits";
import { buildKeyframes, parseImportPayload, runningOrderDiagnostics, runningSceneIds } from "./model";
import { clipFrames } from "./timing";

const project = createBundledFilm("sweet-jesus-film", new Map(), new Map())!;
const frames = buildKeyframes(project.story);
const screenplay = readFileSync("src/data/sweet-jesus.fountain", "utf8");
const noop = () => {};

describe("Sweet Jesus storyboard", () => {
  it("is compiled reproducibly from the editable screenplay", () => {
    expect(execFileSync(process.execPath, ["scripts/build-sweet-jesus.mjs", "--check"], { encoding: "utf8" })).toContain("matches the screenplay");
    expect(parseImportPayload(film, "sweet-jesus-film.json").story.title).toBe("Sweet Jesus");
    expect(screenplay).toContain("INT. VETRANO'S COFFEE SHOP");
    expect(screenplay).toContain("INT. VERA'S CAR");
    expect(screenplay).toContain("SMASH TO BLACK.");
  });

  it("has a complete, unique sequence with opening stills and independent later picture slots", () => {
    expect(project.story.scenes).toHaveLength(30);
    expect(runningSceneIds(project.story)).toHaveLength(30);
    expect(runningOrderDiagnostics(project.story)).toEqual([]);
    expect(frames.length).toBeGreaterThan(400);
    expect(new Set(frames.map((frame) => frame.id)).size).toBe(frames.length);
    expect(frames.every((frame) => String(frame.scene.prose).startsWith("INT.") || String(frame.scene.prose).startsWith("EXT."))).toBe(true);
    expect(frames.every((frame) => String(frame.beat.shotDescription).trim().length > 0)).toBe(true);
    expect(frames.slice(0, 22).every((frame) => frame.picture?.startsWith("asset:sj-opening-v1-"))).toBe(true);
    expect(frames.slice(22).every((frame) => !frame.picture)).toBe(true);
    expect(frames[frames.length - 1].beat.gap).toBe(true);
    expect(project.assets).toHaveLength(7);
    expect(project.audioClips).toEqual([]);
    expect(project.sourceEdits).toBeUndefined();
    const warehouse = project.story.scenes.find((scene) => scene.title?.includes("WAREHOUSE 3"))!;
    const beats = warehouse.dialogueBeats!;
    const start = beats.findIndex((beat) => beat.shotDescription?.includes("rest of his life"));
    const death = beats.findIndex((beat) => beat.shotDescription?.includes("stray round"));
    const nickySeconds = beats.slice(start, death + 1).reduce((sum, beat) => sum + Number(beat.durationFrames), 0) / 24;
    expect(nickySeconds).toBeGreaterThan(230);
    expect(nickySeconds).toBeLessThan(250);
    const tickHolds = beats.filter((beat) => /Tick is gut-shot|hooks a finger|gets his fingers|reaches again, slips/.test(String(beat.shotDescription)));
    expect(tickHolds.reduce((sum, beat) => sum + Number(beat.durationFrames), 0) / 24).toBeGreaterThanOrEqual(60);
    expect(BUILT_IN_FILMS.map((item) => item.id)).toEqual(["nobodys-witness-film", "sweet-jesus-film"]);
  });

  it("gives every dialogue line readable, timed CC and includes non-dialogue sound cues", () => {
    let sounds = 0;
    for (const frame of frames) {
      const duration = clipFrames(frame);
      const captions = effectiveCaptionsForBeat(frame.beat, duration);
      if (frame.beat.text) {
        expect(captions.length).toBeGreaterThan(0);
        const spoken = captions.map((caption) => caption.text.replace(/^[^:]+:\s*/, "")).join(" ").replace(/\s+/g, " ").trim();
        expect(spoken).toBe(frame.beat.text);
      }
      for (let i = 0; i < captions.length; i += 1) {
        const cue = captions[i];
        expect(cue.inFrame).toBeGreaterThanOrEqual(0);
        expect(cue.outFrame).toBeLessThanOrEqual(duration);
        if (i) expect(cue.inFrame).toBeGreaterThanOrEqual(captions[i - 1].outFrame);
        const metrics = captionMetrics(cue);
        expect(metrics.overTwoLines).toBe(false);
        expect(metrics.tooFast).toBe(false);
        if (cue.text.startsWith("[")) sounds += 1;
      }
    }
    expect(sounds).toBeGreaterThan(45);
    const srt = makeCaptionsSrt(frames, frames.map((frame) => clipFrames(frame)));
    expect(srt).toContain("BUG: It's a beat.");
    expect(srt).toContain("MAN (O.S.): This one's on the house.");
    expect(srt).toContain("[A washer clanks in rhythm.]");
    expect(srt).toContain("[Peanut laughs.]");
  });

  it("finds blank storyboard shots by their action, scene or dialogue", () => {
    const { clips } = buildTimelineClips(frames);
    expect(findTimelineShots(clips, "gut-shot")[0].keyframe.beat.shotDescription).toContain("Tick is gut-shot");
    expect(findTimelineShots(clips, "VETRANO'S COFFEE SHOP")[0].keyframe.scene.title).toContain("VETRANO'S COFFEE SHOP");
    expect(findTimelineShots(clips, "don't call us again")[0].keyframe.text).toContain("Don't call us again");
    expect(findTimelineShots(clips, "  ")).toEqual([]);
  });

  it("keeps pictures independent when a blank shot is filled, while allowing intentional holds", () => {
    const firstBlank = frames[22];
    const edited = setPicture(project, firstBlank.id, "asset:my-picture");
    const nextFrames = buildKeyframes(edited.story);
    expect(nextFrames[22].picture).toBe("asset:my-picture");
    expect(nextFrames[23].picture).toBeUndefined();
    expect(nextFrames[24].picture).toBeUndefined();
    expect(frames[22].picture).toBeUndefined();
    const held = setPicture(setBeatField(project, firstBlank.id, "backgroundHold", true), firstBlank.id, "asset:held");
    expect(buildKeyframes(held.story)[23].picture).toBe("asset:held");
  });

  it("exposes an editable-description slate, the film selector, and a screenplay download", () => {
    const preview = renderToStaticMarkup(
      <CinematicPreview frame={frames[22]} localFrame={0} resolveMedia={() => undefined}
        playing={false} soundOn={false} showCaption={true} showMark={true} />,
    );
    expect(preview).toContain("STORYBOARD");
    expect(preview).toContain("No music. ETTA RAY");
    expect(preview).toContain("Blank picture");
    const { totalFrames } = buildTimelineClips(frames);
    const topbar = renderToStaticMarkup(
      <Topbar project={project} projectChoices={BUILT_IN_FILMS} onSelectProject={noop} onDownloadScreenplay={noop}
        saveStatus="SAVED" historyVersion={0} canUndo={false} canRedo={false} onUndo={noop} onRedo={noop}
        onImport={noop} onLinkFolder={noop} folderLabel="" onSnapshot={noop} onExport={noop} onSave={noop}
        missingCount={0} onMissing={noop} editLabel="Storyboard draft" totalDuration={totalFrames / 24} />,
    );
    expect(topbar).toContain('aria-label="Switch film"');
    expect(topbar).toContain("Sweet Jesus");
    expect(topbar).toContain("Screenplay ↓");
  });
});
