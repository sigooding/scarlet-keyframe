import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetBrowser, type BrowserAsset } from "../components/AssetBrowser";
import { CinematicPreview } from "../components/CinematicPreview";
import { buildKeyframes, type Keyframe } from "./model";
import { normalizeMediaPath, referencedPath } from "./media";

const noop = () => {};

function shot(picture: string): Keyframe {
  return buildKeyframes({
    id: "t",
    startSceneId: "a",
    characters: [],
    scenes: [{ id: "a", title: "A", dialogueBeats: [{ id: "b1", characterId: "nw_narrator", text: ".", silent: true, background: picture }] }],
  })[0];
}

const view = (picture: string) =>
  renderToStaticMarkup(
    <CinematicPreview
      frame={shot(picture)}
      imageSrc={picture.startsWith("video:") ? undefined : picture}
      resolveMedia={(v) => v}
      playing={false}
      soundOn={false}
      showCaption={false}
      showMark={false}
    />,
  );

describe("a shot that plays a video", () => {
  it("renders a video where a still would be", () => {
    const html = view("video:/film/video/scarlet-reel-logo.mp4");
    expect(html).toContain("<video");
    expect(html).toContain("/film/video/scarlet-reel-logo.mp4");
    expect(view("/film/img/s1/01-backstreet.jpg")).not.toContain("<video");
  });

  it("an uploaded video is referenced through its asset, and still resolves", () => {
    // What the upload writes: `video:asset:<id>`, which the editor resolves like any other uploaded file.
    expect(referencedPath("video:/film/video/clip.mp4")).toBe("film/video/clip.mp4"); // the prefix comes off
    expect(normalizeMediaPath("video:/film/video/clip.mp4")).toBe("film/video/clip.mp4"); // the index's own spelling
    expect(/(?:^|:)asset:([^/?#]+)/.exec("video:asset:abc123")?.[1]).toBe("abc123");
  });
});

describe("the picture chooser", () => {
  const rows = (assets: BrowserAsset[]) =>
    renderToStaticMarkup(
      <AssetBrowser
        title="Choose a picture"
        kind="image"
        items={assets}
        onSelect={noop}
        onClose={noop}
      />,
    );

  it("marks a video so it is not mistaken for a still", () => {
    const html = rows([
      { id: "a", ref: "/film/img/s1/01-backstreet.jpg", name: "01-backstreet.jpg", folder: "film/img/s1" },
      { id: "b", ref: "video:/film/video/clip.mp4", name: "clip.mp4", folder: "film/video", source: "Video", kind: "video" },
    ]);
    expect(html).toContain("VIDEO");
    expect(html).toContain("it plays");
    expect(html).toContain("clip.mp4");
    expect(html).toContain("01-backstreet.jpg");
  });

  it("a still with no thumbnail still says what it is", () => {
    expect(rows([{ id: "a", ref: "/x.jpg", name: "x.jpg", folder: "f" }])).toContain("STILL");
  });
});
