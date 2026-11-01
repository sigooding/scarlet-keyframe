import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFxChain,
  createReverbImpulse,
  DEFAULT_TRACK_FX,
  FX_PRESETS,
  fxTailSeconds,
  isTrackFxActive,
  matchingPresetId,
  normalizeTrackFx,
} from "./audioFx";
import { createDefaultTrackMix } from "./previewAudio";
import { applyStoredTrackFx, storeTrackFx, TRACK_FX_STORAGE_KEY } from "./trackFxStore";

// A tiny stand-in for the Web Audio graph: nodes remember what they are connected to.
function mockContext() {
  const param = () => ({ value: 0, cancelScheduledValues: () => undefined, setTargetAtTime(v: number) { this.value = v; } });
  const node = (kind: string) => {
    const n: any = { kind, connections: new Set<any>(), connect(to: any) { n.connections.add(to); return to; }, disconnect(to?: any) { if (to) n.connections.delete(to); else n.connections.clear(); } };
    n.gain = param();
    n.delayTime = param();
    n.frequency = param();
    return n;
  };
  const ctx: any = {
    sampleRate: 8000,
    currentTime: 0,
    destination: node("destination"),
    createGain: () => node("gain"),
    createDelay: () => node("delay"),
    createConvolver: () => node("convolver"),
    createBiquadFilter: () => node("biquad"),
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
    },
  };
  return ctx;
}

afterEach(() => vi.unstubAllGlobals());

describe("track effects model", () => {
  it("clamps to safe ranges and fills defaults", () => {
    const fx = normalizeTrackFx({ reverb: { on: true, mix: 9, seconds: 99, preDelayMs: -4, damping: NaN }, echo: { feedback: 5, timeMs: 1 } });
    expect(fx.reverb).toEqual({ on: true, mix: 1, seconds: 8, preDelayMs: 0, damping: DEFAULT_TRACK_FX.reverb.damping });
    expect(fx.echo.feedback).toBe(0.9);
    expect(fx.echo.timeMs).toBe(40);
    expect(fx.echo.on).toBe(false);
  });

  it("knows when an effect is active and how long its tail is", () => {
    expect(isTrackFxActive(undefined)).toBe(false);
    expect(isTrackFxActive(DEFAULT_TRACK_FX)).toBe(false);
    expect(fxTailSeconds(DEFAULT_TRACK_FX)).toBe(0);
    const stair = FX_PRESETS.find((p) => p.id === "stairwell")!.fx;
    expect(isTrackFxActive(stair)).toBe(true);
    expect(fxTailSeconds(stair)).toBeCloseTo(2.6 + 0.015, 3);
    const echo = FX_PRESETS.find((p) => p.id === "echo")!.fx;
    expect(fxTailSeconds(echo)).toBeGreaterThan(1);
    expect(fxTailSeconds(echo)).toBeLessThanOrEqual(8);
  });

  it("recognises its presets and reports anything else as custom", () => {
    for (const p of FX_PRESETS) expect(matchingPresetId(p.fx)).toBe(p.id);
    expect(matchingPresetId(normalizeTrackFx({ reverb: { on: true, mix: 0.77, seconds: 1.234 } }))).toBe("custom");
    expect(matchingPresetId(undefined)).toBe("off");
  });
});

describe("reverb room and effect chain", () => {
  it("builds the same decaying stereo room every time", () => {
    const a = createReverbImpulse(mockContext(), 1.2, 0.5);
    const first = Array.from(a.getChannelData(0).slice(0, 50));
    const b = createReverbImpulse({ ...mockContext(), sampleRate: 8000 } as never, 1.2, 0.5);
    expect(Array.from(b.getChannelData(0).slice(0, 50))).toEqual(first);
    const d = a.getChannelData(0);
    const rms = (from: number, to: number) => Math.sqrt(d.slice(from, to).reduce((s, v) => s + v * v, 0) / (to - from));
    expect(rms(100, 1000)).toBeGreaterThan(rms(d.length - 1000, d.length - 10));
    expect(a.numberOfChannels).toBe(2);
    expect(d[d.length - 1]).toBeCloseTo(0, 3);
  });

  it("connects the dry path always and a send only while its effect is on", () => {
    const ctx = mockContext();
    const chain = createFxChain(ctx, ctx.destination);
    const sends = () => [...(chain.input as any).connections].filter((n: any) => n.kind === "delay").length;
    expect(sends()).toBe(0); // before any update: the dry path only
    chain.update(undefined, true);
    expect(sends()).toBe(0);
    chain.update(FX_PRESETS.find((p) => p.id === "stairwell")!.fx, true);
    expect(sends()).toBe(1); // reverb pre-delay
    chain.update(FX_PRESETS.find((p) => p.id === "tape")!.fx, true);
    expect(sends()).toBe(2); // reverb pre-delay + echo delay
    chain.update(undefined, true);
    expect(sends()).toBe(0);
    chain.update(FX_PRESETS.find((p) => p.id === "slapback")!.fx, true);
    expect(sends()).toBe(1);
  });
});

describe("remembering the settings", () => {
  const store = () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    return data;
  };

  it("round-trips the active settings and drops them when everything is reset", () => {
    const data = store();
    const mix = createDefaultTrackMix();
    mix.voice.fx = FX_PRESETS.find((p) => p.id === "hall")!.fx;
    storeTrackFx(mix);
    expect(data.has(TRACK_FX_STORAGE_KEY)).toBe(true);
    const back = applyStoredTrackFx(createDefaultTrackMix());
    expect(back.voice.fx?.reverb.seconds).toBeCloseTo(4.2, 3);
    expect(back.sfx.fx).toBeUndefined();
    storeTrackFx(createDefaultTrackMix());
    expect(data.has(TRACK_FX_STORAGE_KEY)).toBe(false);
  });

  it("ignores broken stored data", () => {
    const data = store();
    data.set(TRACK_FX_STORAGE_KEY, "{not json");
    expect(applyStoredTrackFx(createDefaultTrackMix()).voice.fx).toBeUndefined();
  });
});
