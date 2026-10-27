import { describe, expect, it } from "vitest";
import {
  animationOf,
  evaluate,
  hasAnimation,
  sampleKeys,
  splitAnimation,
  type AnimationKey,
  type ClipAnimation,
} from "./animate";

const clipWith = (animation: ClipAnimation) => ({ beat: { id: "clip-1", animation } });

const linearZoom: AnimationKey[] = [
  { frame: 0, value: 1, easing: "linear" },
  { frame: 48, value: 3, easing: "linear" },
];

const easedZoom: AnimationKey[] = [
  { frame: 0, value: 1, easing: "ease-in-out" },
  { frame: 48, value: 3, easing: "ease-in-out" },
];

const heldX: AnimationKey[] = [
  { frame: 0, value: 0, easing: "hold" },
  { frame: 30, value: 20, easing: "hold" },
];

describe("evaluate", () => {
  it("returns the untouched picture when a clip has no animation", () => {
    expect(evaluate({ beat: {} }, 12)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(evaluate({ beat: { animation: {} } }, 12)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(hasAnimation({ beat: {} })).toBe(false);
    expect(hasAnimation({ beat: { animation: { zoom: [] } } })).toBe(false);
  });

  it("goes straight between linear keys", () => {
    const clip = clipWith({ zoom: linearZoom });
    expect(evaluate(clip, 0).zoom).toBeCloseTo(1, 6);
    expect(evaluate(clip, 12).zoom).toBeCloseTo(1.5, 6);
    expect(evaluate(clip, 24).zoom).toBeCloseTo(2, 6);
    expect(evaluate(clip, 36).zoom).toBeCloseTo(2.5, 6);
    expect(evaluate(clip, 48).zoom).toBeCloseTo(3, 6);
  });

  it("eases at both ends with ease-in-out", () => {
    const clip = clipWith({ zoom: easedZoom });
    // Half way is still the half-way value; the quarter points are pulled towards the ends.
    expect(evaluate(clip, 24).zoom).toBeCloseTo(2, 6);
    expect(evaluate(clip, 12).zoom).toBeCloseTo(1.25, 6);
    expect(evaluate(clip, 36).zoom).toBeCloseTo(2.75, 6);
    expect(evaluate(clip, 6).zoom).toBeLessThan(1.1);
    expect(evaluate(clip, 42).zoom).toBeGreaterThan(2.9);
  });

  it("holds a value until the next key with hold", () => {
    const clip = clipWith({ x: heldX });
    expect(evaluate(clip, 0).x).toBe(0);
    expect(evaluate(clip, 15).x).toBe(0);
    expect(evaluate(clip, 29).x).toBe(0);
    expect(evaluate(clip, 30).x).toBe(20);
    expect(evaluate(clip, 60).x).toBe(20);
  });

  it("uses the first key's value before it and the last key's value after it", () => {
    const keys: AnimationKey[] = [
      { frame: 10, value: 1.4, easing: "linear" },
      { frame: 20, value: 2.2, easing: "linear" },
    ];
    const clip = clipWith({ zoom: keys });
    expect(evaluate(clip, 0).zoom).toBe(1.4);
    expect(evaluate(clip, 10).zoom).toBe(1.4);
    expect(evaluate(clip, 100).zoom).toBe(2.2);
    expect(sampleKeys([], 5)).toBeUndefined();
  });

  it("handles each property independently", () => {
    const clip = clipWith({
      zoom: [{ frame: 0, value: 1, easing: "linear" }, { frame: 10, value: 2, easing: "linear" }],
      x: [{ frame: 0, value: -10, easing: "linear" }, { frame: 10, value: 10, easing: "linear" }],
      y: [{ frame: 0, value: 5, easing: "hold" }, { frame: 10, value: -5, easing: "hold" }],
    });
    expect(evaluate(clip, 5)).toEqual({ zoom: 1.5, x: 0, y: 5 });
  });

  it("accepts the animation object directly", () => {
    expect(evaluate({ zoom: linearZoom }, 24).zoom).toBeCloseTo(2, 6);
  });
});

describe("splitAnimation", () => {
  it("keeps earlier keys on the first half and re-times the rest to the second half", () => {
    const animation: ClipAnimation = {
      zoom: [
        { frame: 0, value: 1, easing: "linear" },
        { frame: 30, value: 1.3, easing: "ease-in-out" },
        { frame: 60, value: 2, easing: "linear" },
      ],
      x: [{ frame: 12, value: 8, easing: "linear" }],
    };
    const [first, second] = splitAnimation(animation, 30);
    expect(first?.zoom?.map((key) => key.frame)).toEqual([0]);
    expect(first?.x?.map((key) => key.frame)).toEqual([12]);
    expect(second?.zoom?.map((key) => key.frame)).toEqual([0, 30]);
    expect(second?.zoom?.map((key) => key.value)).toEqual([1.3, 2]);
    expect(second?.x).toBeUndefined();
  });

  it("passes an empty clip through", () => {
    expect(splitAnimation(undefined, 10)).toEqual([undefined, undefined]);
    expect(animationOf({ beat: {} })).toBeUndefined();
  });
});
