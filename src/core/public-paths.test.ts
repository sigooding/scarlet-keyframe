import { describe, expect, it } from "vitest";
import { hasPublicMediaPath, withPublicPaths } from "./media";

describe("withPublicPaths: telling the editor a file is there", () => {
  const start = new Set(["film/img/s1/a.jpg"]);

  it("adds paths, normalised the way the index is (no leading slash, no query)", () => {
    const next = withPublicPaths(start, ["/film/depth/s6/x/people-1/plate.jpg?v=2", "film/depth/s6/x/people-1/depth.png"]);
    expect(hasPublicMediaPath(next, "film/depth/s6/x/people-1/plate.jpg")).toBe(true);
    expect(hasPublicMediaPath(next, "film/depth/s6/x/people-1/depth.png")).toBe(true);
    expect(hasPublicMediaPath(next, "film/img/s1/a.jpg")).toBe(true);
  });

  it("does not change the set it was given", () => {
    withPublicPaths(start, ["/film/depth/new.png"]);
    expect([...start]).toEqual(["film/img/s1/a.jpg"]);
  });

  it("returns the very same set when nothing is new, so nothing is drawn again for nothing", () => {
    expect(withPublicPaths(start, [])).toBe(start);
    expect(withPublicPaths(start, ["/film/img/s1/a.jpg", undefined, null, ""])).toBe(start);
  });

  it("counts a path given twice once", () => {
    const next = withPublicPaths(start, ["/film/depth/a.png", "film/depth/a.png"]);
    expect(next.size).toBe(2);
  });
});
