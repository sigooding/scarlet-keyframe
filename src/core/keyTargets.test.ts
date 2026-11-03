import { describe, expect, it } from "vitest";
import { controlOwnsArrowKeys, type KeyTargetLike } from "./keyTargets";

function target(
  values: Partial<KeyTargetLike> & Pick<KeyTargetLike, "tagName">,
  ownsArrowKeys = false,
): KeyTargetLike {
  return {
    ...values,
    closest: values.closest ?? ((selector) => selector === "[data-owns-arrow-keys]" && ownsArrowKeys ? {} : null),
  };
}

describe("controlOwnsArrowKeys", () => {
  it("leaves native value controls and editable content to the browser", () => {
    expect(controlOwnsArrowKeys(target({ tagName: "INPUT", type: "range" }))).toBe(true);
    expect(controlOwnsArrowKeys(target({ tagName: "INPUT", type: "number" }))).toBe(true);
    expect(controlOwnsArrowKeys(target({ tagName: "SELECT" }))).toBe(true);
    expect(controlOwnsArrowKeys(target({ tagName: "TEXTAREA" }))).toBe(true);
    expect(controlOwnsArrowKeys(target({ tagName: "DIV", isContentEditable: true }))).toBe(true);
  });

  it("recognizes descendants of an explicit arrow-key owner", () => {
    expect(controlOwnsArrowKeys(target({ tagName: "SPAN" }, true))).toBe(true);
  });

  it("does not claim navigation keys for buttons, the page, or the timeline", () => {
    expect(controlOwnsArrowKeys(target({ tagName: "BUTTON" }))).toBe(false);
    expect(controlOwnsArrowKeys(target({ tagName: "BODY" }))).toBe(false);
    expect(controlOwnsArrowKeys(target({ tagName: "DIV" }))).toBe(false);
    expect(controlOwnsArrowKeys(null)).toBe(false);
  });
});
