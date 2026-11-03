import { describe, expect, it } from "vitest";
import type { ActiveTransition } from "../sequence/transitions";
import { transitionForViewer } from "./transitionForViewer";

function makeTransition(kind: ActiveTransition["kind"] = "dissolve"): ActiveTransition {
  return {
    kind,
    alignment: "at-cut",
    progress: 0.25,
    cutFrame: 100,
    startFrame: 100,
    endFrame: 120,
    durationFrames: 20,
    outgoingClip: { keyframe: { id: "outgoing" } },
    outLocalFrame: 10,
    incomingClip: { keyframe: { id: "incoming" } },
    inLocalFrame: 0,
  } as ActiveTransition;
}

const pausedEditView = {
  playing: false,
  compare: false,
  renderMode: false,
  editView: true,
  selectedClipId: "incoming",
};

describe("transitionForViewer", () => {
  it("shows the selected clip alone while paused in Edit view if it participates in a dissolve", () => {
    const transition = makeTransition();
    expect(transitionForViewer({ ...pausedEditView, transition })).toBeUndefined();
    expect(transitionForViewer({ ...pausedEditView, selectedClipId: "outgoing", transition })).toBeUndefined();
  });

  it.each([
    ["playing", { playing: true }],
    ["Compare view", { compare: true }],
    ["Edit view off", { editView: false }],
    ["an unrelated selected clip", { selectedClipId: "other" }],
  ])("keeps the real transition for %s", (_label, patch) => {
    const transition = makeTransition();
    expect(transitionForViewer({ ...pausedEditView, ...patch, transition } as Parameters<typeof transitionForViewer>[0])).toBe(transition);
  });

  it("always leaves render-mode transitions unchanged", () => {
    const transition = makeTransition();
    expect(transitionForViewer({
      ...pausedEditView,
      playing: true,
      compare: true,
      renderMode: true,
      transition,
    })).toBe(transition);
  });

  it("does not hide non-dissolve transitions", () => {
    const transition = makeTransition("wipe-left");
    expect(transitionForViewer({ ...pausedEditView, transition })).toBe(transition);
  });

  it("returns undefined when there is no active transition", () => {
    expect(transitionForViewer({ ...pausedEditView, transition: undefined })).toBeUndefined();
  });
});
