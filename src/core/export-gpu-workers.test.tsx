import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportModal } from "../components/ExportModal";
import { buildKeyframes, createProjectState } from "./model";
import filmData from "../data/nobodys-witness-film.json";

describe("ExportModal GPU acceleration & up to 6 workers", () => {
  const project = createProjectState({
    story: structuredClone(filmData) as any,
    sourceName: "nobodys-witness-film.json",
    assets: [],
    missing: [],
  });
  const frames = buildKeyframes(project.story);
  const noop = () => {};

  it("exposes worker options 1 through 6 and enables GPU acceleration by default", () => {
    const html = renderToStaticMarkup(
      <ExportModal
        project={project}
        frames={frames}
        totalFrames={240}
        tab="mp4"
        setTab={noop}
        progress={0}
        message=""
        patchReport={null}
        mp4Message=""
        rangeStart={0}
        rangeEnd={null}
        setRangeStart={noop}
        setRangeEnd={noop}
        wholeFilm={true}
        setWholeFilm={noop}
        fromFrame={0}
        toFrame={239}
        setFromFrame={noop}
        setToFrame={noop}
        captions={true}
        srt={true}
        marks={false}
        quality="master"
        workers={6}
        setCaptions={noop}
        setSrt={noop}
        setMarks={noop}
        setQuality={noop}
        setWorkers={noop}
        setGpu={noop}
        onBundle={noop}
        onPatch={noop}
        onSrt={noop}
        onMp4={noop}
        onClose={noop}
        onRestoreSnapshot={noop}
      />,
    );

    expect(html).toContain('data-testid="export-workers-select"');
    expect(html).toContain(">1 worker<");
    expect(html).toContain(">2 workers<");
    expect(html).toContain(">3 workers<");
    expect(html).toContain(">4 workers<");
    expect(html).toContain(">5 workers<");
    expect(html).toContain(">6 workers<");
    expect(html).not.toContain(">7 workers<");
    expect(html).not.toContain(">8 workers<");
    expect(html).toContain('data-testid="export-opt-gpu"');
    expect(html).toContain("--workers 6");
    expect(html).toContain("--gpu");
  });

  it("emits --no-gpu in the CLI command preview when GPU acceleration is unchecked", () => {
    const html = renderToStaticMarkup(
      <ExportModal
        project={project}
        frames={frames}
        totalFrames={240}
        tab="mp4"
        setTab={noop}
        progress={0}
        message=""
        patchReport={null}
        mp4Message=""
        rangeStart={0}
        rangeEnd={null}
        setRangeStart={noop}
        setRangeEnd={noop}
        wholeFilm={true}
        setWholeFilm={noop}
        fromFrame={0}
        toFrame={239}
        setFromFrame={noop}
        setToFrame={noop}
        captions={true}
        srt={true}
        marks={false}
        quality="draft"
        workers={5}
        gpu={false}
        setCaptions={noop}
        setSrt={noop}
        setMarks={noop}
        setQuality={noop}
        setWorkers={noop}
        setGpu={noop}
        onBundle={noop}
        onPatch={noop}
        onSrt={noop}
        onMp4={noop}
        onClose={noop}
        onRestoreSnapshot={noop}
      />,
    );

    expect(html).toContain("--draft");
    expect(html).toContain("--workers 5");
    expect(html).toContain("--no-gpu");
  });
});
