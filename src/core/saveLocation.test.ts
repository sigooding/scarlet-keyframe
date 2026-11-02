import { describe, expect, it } from "vitest";
import { currentSaveOrigin, fileSaveWarning, isOpenedFromFile, saveButtonTitle, savedStatusText } from "./saveLocation";

const serve = { protocol: "http:", origin: "http://127.0.0.1:4173" };
const dev = { protocol: "http:", origin: "http://127.0.0.1:5173" };
const disk = { protocol: "file:", origin: "null" };

describe("save location wording", () => {
  it("names the origin the saves belong to", () => {
    expect(currentSaveOrigin(serve)).toBe("http://127.0.0.1:4173");
    expect(savedStatusText(currentSaveOrigin(serve))).toBe("Saved in this browser for http://127.0.0.1:4173");
    expect(saveButtonTitle(currentSaveOrigin(serve))).toBe(
      "Saved in this browser for http://127.0.0.1:4173 (Ctrl/Cmd+S)",
    );
    expect(isOpenedFromFile(serve)).toBe(false);
  });

  it("keeps the port: dev and serve are different browser libraries", () => {
    expect(savedStatusText(currentSaveOrigin(dev))).toBe("Saved in this browser for http://127.0.0.1:5173");
    expect(savedStatusText(currentSaveOrigin(serve))).toBe("Saved in this browser for http://127.0.0.1:4173");
  });

  it("warns once, in one line, when the page came from a file", () => {
    expect(isOpenedFromFile(disk)).toBe(true);
    expect(currentSaveOrigin(disk)).toBe("this file");
    const warning = fileSaveWarning();
    expect(warning).toBe(
      "Opened from a file: saves here are separate from the ones at http://127.0.0.1:4173 — use npm run serve.",
    );
    expect(warning).not.toContain("\n");
  });
});
