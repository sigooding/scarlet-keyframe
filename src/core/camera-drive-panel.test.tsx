import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CameraDrivePanel, DEFAULT_HANDHELD, type HandheldSettings } from "../components/CameraDrivePanel";
import { NO_OFFSET } from "./cameraDrive";
import type { CameraDriveBinding } from "./useCameraDrive";

const noop = () => {};
const buttonTag = (html: string, testId: string) => new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "";
const buttonText = (html: string, testId: string) =>
  new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>(.*?)</button>`, "s").exec(html)?.[1].replace(/<!--.*?-->/g, "").trim() ?? "";
const isDisabled = (html: string, testId: string) => buttonTag(html, testId).includes("disabled");

function binding(patch: Partial<CameraDriveBinding> = {}): CameraDriveBinding {
  return {
    armed: false,
    live: false,
    offset: NO_OFFSET,
    smooth: 0.5,
    mode: "add",
    recorded: { frames: 0, shots: 0 },
    arm: noop,
    setSmooth: noop,
    setMode: noop,
    onDrag: noop,
    onWheel: noop,
    sample: noop,
    clear: noop,
    take: () => [],
    ...patch,
  };
}

const render = (options: { drive?: Partial<CameraDriveBinding>; handheld?: HandheldSettings; canDrive?: boolean; shotSeconds?: number } = {}) =>
  renderToStaticMarkup(
    <CameraDrivePanel
      drive={binding(options.drive)}
      handheld={options.handheld ?? DEFAULT_HANDHELD}
      onChangeHandheld={noop}
      onApplyHandheld={noop}
      canDrive={options.canDrive ?? true}
      shotSeconds={options.shotSeconds ?? 4}
    />,
  );

describe("the camera-by-hand panel", () => {
  it("offers to drive, and says what will happen", () => {
    const html = render();
    expect(buttonText(html, "drive-arm-btn")).toBe("Drive the camera");
    expect(isDisabled(html, "drive-arm-btn")).toBe(false);
    expect(html).toContain("press play");
    expect(buttonTag(html, "drive-cancel-btn")).toBe(""); // nothing to cancel yet
  });

  it("armed, it tells you how to move the camera and how to stop", () => {
    const html = render({ drive: { armed: true } });
    expect(buttonText(html, "drive-arm-btn")).toContain("Driving");
    expect(html).toContain("Alt-drag to roll");
    expect(html).toContain("the wheel to push in");
    expect(buttonTag(html, "drive-cancel-btn")).not.toBe("");
  });

  it("counts the take while it is being performed", () => {
    expect(render({ drive: { armed: true, recorded: { frames: 96, shots: 2 } } })).toContain("96 frames over 2 shots");
    expect(render({ drive: { armed: true, recorded: { frames: 12, shots: 1 } } })).toContain("12 frames over 1 shot");
    expect(render({ drive: { armed: true } })).toContain("armed");
    expect(render()).toContain(">off<");
  });

  it("says whether the shot's own move is kept or thrown away", () => {
    const keep = render({ drive: { mode: "add" } });
    expect(buttonTag(keep, "drive-mode-add")).toContain("is-active");
    expect(buttonTag(keep, "drive-mode-replace")).not.toContain("is-active");
    expect(keep).toContain("Over whatever the shot already does");
    const replace = render({ drive: { mode: "replace" } });
    expect(buttonTag(replace, "drive-mode-replace")).toContain("is-active");
    expect(replace).toContain("In place of whatever the shot does now");
  });

  it("shows the smoothing in words at its ends", () => {
    expect(render({ drive: { smooth: 0 } })).toContain(">exact<");
    expect(render({ drive: { smooth: 1 } })).toContain(">calm<");
    expect(render({ drive: { smooth: 0.35 } })).toContain(">0.35<");
  });

  it("has a slider for each part of the handheld, and says how long the shot is", () => {
    const html = render({ shotSeconds: 12.25 });
    for (const key of ["sway", "bob", "roll", "drift", "speed"]) {
      expect(buttonTag(html, `handheld-${key}`) || html.includes(`data-testid="handheld-${key}"`)).toBeTruthy();
    }
    expect(html).toContain("12.3 s shot");
    expect(buttonText(html, "handheld-apply")).toContain("Put a handheld on this shot");
  });

  it("offers nothing to drive on a gap or a picture that cannot move", () => {
    const html = render({ canDrive: false });
    expect(isDisabled(html, "drive-arm-btn")).toBe(true);
    expect(isDisabled(html, "handheld-apply")).toBe(true);
  });
});
