import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MakeDepthMapForShot, MakeDepthMapRow, type DepthMakerBinding } from "../components/MakeDepthMapRow";
import type { DepthReady } from "./depthApiTypes";
import type { DepthMakerJob, DepthMakerState, DepthRowView } from "./depthMaker";

const noop = () => {};

function render(view: DepthRowView) {
  return renderToStaticMarkup(<MakeDepthMapRow view={view} onMake={noop} onCancel={noop} onDismiss={noop} onCheckAgain={noop} onCopy={noop} />);
}

const buttonTag = (html: string, testId: string) => new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "";

describe("the Make depth map row", () => {
  it("draws nothing when there is nothing to offer", () => {
    expect(render({ kind: "hidden" })).toBe("");
  });

  it("offers an enabled button when the computer is ready, and says what will happen", () => {
    const html = render({ kind: "ready", note: "Made on this computer from this picture." });
    expect(html).toContain('data-testid="make-depth-row"');
    expect(html).toContain('data-state="ready"');
    expect(html).toContain("Make depth map");
    expect(buttonTag(html, "make-depth-button")).not.toContain("disabled");
    expect(html).toContain("Made on this computer from this picture.");
  });

  it("shows the button greyed out while checking, when busy, and when there is no server", () => {
    for (const view of [{ kind: "checking" }, { kind: "busy", note: "One at a time." }, { kind: "unavailable" }] as DepthRowView[]) {
      const html = render(view);
      expect(buttonTag(html, "make-depth-button"), view.kind).toContain("disabled");
    }
    expect(render({ kind: "checking" })).toContain("Checking this computer");
    expect(render({ kind: "busy", note: "One at a time." })).toContain("One at a time.");
    const unavailable = render({ kind: "unavailable" });
    expect(unavailable).toContain('data-testid="make-depth-unavailable"');
    expect(unavailable).toContain("npm run serve");
  });

  it("asks for the one-time setup, with the command to copy and a way to check again; no Make button", () => {
    const html = render({ kind: "setup-needed", command: "npm run depth:setup" });
    expect(html).toContain("npm run depth:setup");
    expect(html).toContain('data-testid="make-depth-copy"');
    expect(html).toContain('data-testid="make-depth-check-again"');
    expect(html).not.toContain('data-testid="make-depth-button"');
  });

  it("shows progress: a bar that fills while the model downloads, one that sweeps while it makes the map", () => {
    const downloading = render({ kind: "running", percent: 40, phase: "Downloading the model (once)… 40%", cancellable: true });
    expect(downloading).toContain('role="progressbar"');
    expect(downloading).toContain('aria-valuenow="40"');
    expect(downloading).toContain("width:40%");
    expect(downloading).not.toContain("is-indeterminate");
    expect(downloading).toContain("Downloading the model (once)… 40%");
    expect(buttonTag(downloading, "make-depth-cancel")).not.toContain("disabled");

    const making = render({ kind: "running", percent: null, phase: "Making the depth map… 12 s", cancellable: false });
    expect(making).toContain("is-indeterminate");
    expect(making).not.toContain("aria-valuenow");
    expect(making).toContain("Making the depth map… 12 s");
    expect(buttonTag(making, "make-depth-cancel")).toContain("disabled");
  });

  it("shows a failure as an alert, with a way to try again", () => {
    const html = render({ kind: "failed", message: "No space left on the disk." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("No space left on the disk.");
    expect(html).toContain('data-testid="make-depth-retry"');
  });

  it("shows what was made, the people warning, and why a map was not attached", () => {
    const html = render({
      kind: "done",
      text: "Depth map made (1920×1080, 41.2 s on the CPU). Turn on MAP in the Depth Maps lane to see it.",
      caution: "If people are in this picture they will stretch when the camera moves.",
      note: "The map is saved at /film/depth/s1/pic/depth.png.",
    });
    expect(html).toContain('data-testid="make-depth-done"');
    expect(html).toContain("1920×1080");
    expect(html).toContain("people");
    expect(html).toContain("saved at /film/depth/s1/pic/depth.png");
    expect(html).toContain('data-testid="make-depth-dismiss"');
  });

  it("escapes what the server says", () => {
    const html = render({ kind: "failed", message: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

// ---- the row for a shot -----------------------------------------------------------------------------------------------

const ready: DepthReady = { ok: true, python: ".depth-venv", packages: true, gpu: false, model: { name: "base", mb: 389, cached: true, custom: false }, busy: null };
const binding = (state: DepthMakerState): DepthMakerBinding => ({ state, onCheck: noop, onMake: noop, onCancel: noop, onDismiss: noop });
const shot = (props: { picture: string | undefined; hasDepthMap: boolean; state: DepthMakerState }) =>
  renderToStaticMarkup(<MakeDepthMapForShot frameId="f1" picture={props.picture} hasDepthMap={props.hasDepthMap} maker={binding(props.state)} />);

describe("the row for a shot", () => {
  const idle: DepthMakerState = { ready, job: null };

  it("offers the button for one of the film's pictures that has no depth map", () => {
    const html = shot({ picture: "/film/img/s1/pic.jpg", hasDepthMap: false, state: idle });
    expect(html).toContain('data-state="ready"');
    expect(buttonTag(html, "make-depth-button")).not.toContain("disabled");
  });

  it("says nothing when the shot already has a depth map", () => {
    expect(shot({ picture: "/film/img/s1/pic.jpg", hasDepthMap: true, state: idle })).toBe("");
  });

  it("says nothing for a picture that is not one of the film's (an upload, a gradient, nothing)", () => {
    for (const picture of ["asset:abc", "gradient:linear-gradient(red,blue)", undefined]) {
      expect(shot({ picture, hasDepthMap: false, state: idle }), String(picture)).toBe("");
    }
  });

  it("waits to hear what this computer can do before offering anything", () => {
    const html = shot({ picture: "/film/img/s1/pic.jpg", hasDepthMap: false, state: { ready: null, job: null } });
    expect(html).toContain('data-state="checking"');
  });

  it("keeps showing its own shot's map being made, and the finished message, even though the shot now has the map", () => {
    const running: DepthMakerJob = {
      frameId: "f1",
      picture: "/film/img/s1/pic.jpg",
      status: "running",
      id: "j",
      percent: null,
      log: [],
      message: null,
      result: null,
      existing: false,
      startedAt: Date.now() - 12_000,
      applied: false,
      note: null,
    };
    expect(shot({ picture: "/film/img/s1/pic.jpg", hasDepthMap: false, state: { ready, job: running } })).toContain('data-state="running"');
    const done = { ...running, status: "done" as const, applied: true, result: { ok: true, map: "/film/depth/s1/pic/depth.png", width: 1920, height: 1080 } };
    expect(shot({ picture: "/film/img/s1/pic.jpg", hasDepthMap: true, state: { ready, job: done } })).toContain('data-state="done"');
  });
});
