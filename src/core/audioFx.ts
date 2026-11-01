// Per-track effects: reverb and delay / echo. The same node graph is used by the live engine and the offline export
// mix, so what you hear is what is exported. The reverb room is a synthetic impulse (decaying noise, seeded, so it is
// identical every time); no sound file is involved.

export interface ReverbFx {
  on: boolean;
  /** wet level, 0-1 */
  mix: number;
  /** length of the tail in seconds, 0.2-8 */
  seconds: number;
  /** gap before the tail starts, ms, 0-200 */
  preDelayMs: number;
  /** 0 = bright tail, 1 = dark tail */
  damping: number;
}

export interface EchoFx {
  on: boolean;
  /** time between repeats, ms, 40-1500 (short = slapback / delay, long = echo) */
  timeMs: number;
  /** how much of each repeat comes back, 0-0.9 */
  feedback: number;
  /** wet level, 0-1 */
  mix: number;
  /** 0 = dark repeats, 1 = bright repeats */
  tone: number;
}

export interface TrackFx {
  reverb: ReverbFx;
  echo: EchoFx;
}

export const DEFAULT_TRACK_FX: TrackFx = {
  reverb: { on: false, mix: 0.3, seconds: 1.8, preDelayMs: 20, damping: 0.5 },
  echo: { on: false, timeMs: 320, feedback: 0.35, mix: 0.28, tone: 0.6 },
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizeTrackFx(raw?: {
  reverb?: Partial<ReverbFx>;
  echo?: Partial<EchoFx>;
}): TrackFx {
  const d = DEFAULT_TRACK_FX;
  const r = raw?.reverb ?? {};
  const e = raw?.echo ?? {};
  return {
    reverb: {
      on: Boolean(r.on),
      mix: clamp(r.mix, 0, 1, d.reverb.mix),
      seconds: clamp(r.seconds, 0.2, 8, d.reverb.seconds),
      preDelayMs: clamp(r.preDelayMs, 0, 200, d.reverb.preDelayMs),
      damping: clamp(r.damping, 0, 1, d.reverb.damping),
    },
    echo: {
      on: Boolean(e.on),
      timeMs: clamp(e.timeMs, 40, 1500, d.echo.timeMs),
      feedback: clamp(e.feedback, 0, 0.9, d.echo.feedback),
      mix: clamp(e.mix, 0, 1, d.echo.mix),
      tone: clamp(e.tone, 0, 1, d.echo.tone),
    },
  };
}

export function isTrackFxActive(fx?: TrackFx): boolean {
  if (!fx) return false;
  return (fx.reverb.on && fx.reverb.mix > 0.001) || (fx.echo.on && fx.echo.mix > 0.001);
}

/** Seconds the effect keeps sounding after its input stops (used to pre-roll the export). */
export function fxTailSeconds(fx?: TrackFx): number {
  if (!fx || !isTrackFxActive(fx)) return 0;
  let tail = 0;
  if (fx.reverb.on && fx.reverb.mix > 0.001) tail = Math.max(tail, fx.reverb.preDelayMs / 1000 + fx.reverb.seconds);
  if (fx.echo.on && fx.echo.mix > 0.001) {
    const repeats = fx.echo.feedback < 0.02 ? 1 : Math.ceil(Math.log(0.01) / Math.log(fx.echo.feedback));
    tail = Math.max(tail, Math.min(8, (fx.echo.timeMs / 1000) * Math.max(1, repeats)));
  }
  return Math.min(10, tail);
}

export interface FxPreset {
  id: string;
  label: string;
  fx: TrackFx;
}

const preset = (id: string, label: string, reverb: Partial<ReverbFx>, echo: Partial<EchoFx>): FxPreset => ({
  id,
  label,
  fx: normalizeTrackFx({ reverb: { ...reverb }, echo: { ...echo } }),
});

export const FX_PRESETS: readonly FxPreset[] = [
  preset("off", "Off", { on: false }, { on: false }),
  preset("room", "Small room", { on: true, mix: 0.2, seconds: 0.7, preDelayMs: 8, damping: 0.6 }, { on: false }),
  preset("stairwell", "Stairwell", { on: true, mix: 0.38, seconds: 2.6, preDelayMs: 15, damping: 0.35 }, { on: false }),
  preset("hall", "Large hall", { on: true, mix: 0.32, seconds: 4.2, preDelayMs: 30, damping: 0.5 }, { on: false }),
  preset("slapback", "Slapback", { on: false }, { on: true, timeMs: 120, feedback: 0.12, mix: 0.3, tone: 0.7 }),
  preset("echo", "Echo", { on: false }, { on: true, timeMs: 380, feedback: 0.42, mix: 0.3, tone: 0.5 }),
  preset("tape", "Tape delay", { on: true, mix: 0.12, seconds: 1.0, damping: 0.7 }, { on: true, timeMs: 260, feedback: 0.5, mix: 0.28, tone: 0.25 }),
];

/** The preset a setting matches, if any (the panel shows "Custom" otherwise). */
export function matchingPresetId(fx?: TrackFx): string {
  const f = normalizeTrackFx(fx);
  const same = (a: TrackFx, b: TrackFx) => JSON.stringify(a) === JSON.stringify(b);
  return FX_PRESETS.find((p) => same(p.fx, f))?.id ?? (isTrackFxActive(f) ? "custom" : "off");
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const impulseCache = new Map<string, AudioBuffer>();

/** A stereo room: decaying noise that darkens as it fades. Deterministic for a given length and damping. */
export function createReverbImpulse(ctx: BaseAudioContext, seconds: number, damping: number): AudioBuffer {
  const key = `${ctx.sampleRate}|${seconds.toFixed(3)}|${damping.toFixed(3)}`;
  const hit = impulseCache.get(key);
  if (hit) return hit;
  const rate = ctx.sampleRate;
  const length = Math.max(2, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const attack = Math.max(1, Math.floor(rate * 0.004));
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const rand = mulberry32(0x9e3779b9 ^ Math.imul(channel + 1, 0x85ebca6b) ^ Math.round(seconds * 1000));
    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 2.6) * (i < attack ? i / attack : 1);
      const bright = 1 - damping * 0.88 * Math.min(1, t * 3);
      lp += ((rand() * 2 - 1) - lp) * bright;
      data[i] = lp * envelope;
    }
  }
  if (impulseCache.size > 24) impulseCache.clear();
  impulseCache.set(key, buffer);
  return buffer;
}

export interface FxChain {
  /** Connect the track's bus here. */
  input: GainNode;
  update(fx: TrackFx | undefined, immediate?: boolean): void;
}

/**
 * input -> dry -> output -> destination, plus a reverb send (pre-delay -> convolver -> wet) and an echo send
 * (delay with a tone filter in its feedback loop -> wet). A send is only connected while it is on.
 */
export function createFxChain(ctx: BaseAudioContext, destination: AudioNode): FxChain {
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.connect(destination);
  input.connect(output);

  const offline = typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
  const setValue = (param: AudioParam, value: number, immediate: boolean) => {
    if (offline || immediate) {
      param.cancelScheduledValues?.(0);
      param.value = value;
    } else {
      param.setTargetAtTime(value, ctx.currentTime, 0.03);
    }
  };

  let reverb: { pre: DelayNode; conv: ConvolverNode; wet: GainNode; key: string; connected: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
  let echo: { delay: DelayNode; tone: BiquadFilterNode; feedback: GainNode; wet: GainNode; connected: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;

  const ensureReverb = () => {
    if (reverb) return reverb;
    const pre = ctx.createDelay(0.5);
    const conv = ctx.createConvolver();
    const wet = ctx.createGain();
    wet.gain.value = 0;
    pre.connect(conv);
    conv.connect(wet);
    wet.connect(output);
    reverb = { pre, conv, wet, key: "", connected: false };
    return reverb;
  };

  const ensureEcho = () => {
    if (echo) return echo;
    const delay = ctx.createDelay(2);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0;
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(wet);
    wet.connect(output);
    echo = { delay, tone, feedback, wet, connected: false };
    return echo;
  };

  const update = (raw: TrackFx | undefined, immediate = false) => {
    const fx = normalizeTrackFx(raw);

    const reverbOn = fx.reverb.on && fx.reverb.mix > 0.001;
    if (reverbOn) {
      const r = ensureReverb();
      if (r.timer) {
        clearTimeout(r.timer);
        r.timer = undefined;
      }
      const key = `${fx.reverb.seconds}|${fx.reverb.damping}`;
      if (key !== r.key) {
        r.conv.buffer = createReverbImpulse(ctx, fx.reverb.seconds, fx.reverb.damping);
        r.key = key;
      }
      setValue(r.pre.delayTime, fx.reverb.preDelayMs / 1000, immediate);
      setValue(r.wet.gain, fx.reverb.mix * 0.9, immediate);
      if (!r.connected) {
        input.connect(r.pre);
        r.connected = true;
      }
    } else if (reverb && reverb.connected) {
      const r = reverb;
      setValue(r.wet.gain, 0, immediate);
      const drop = () => {
        try {
          input.disconnect(r.pre);
        } catch {
          // already disconnected
        }
        r.connected = false;
        r.timer = undefined;
      };
      if (offline || immediate) drop();
      else r.timer = setTimeout(drop, 500);
    }

    const echoOn = fx.echo.on && fx.echo.mix > 0.001;
    if (echoOn) {
      const e = ensureEcho();
      if (e.timer) {
        clearTimeout(e.timer);
        e.timer = undefined;
      }
      setValue(e.delay.delayTime, fx.echo.timeMs / 1000, immediate);
      setValue(e.feedback.gain, fx.echo.feedback, immediate);
      setValue(e.wet.gain, fx.echo.mix, immediate);
      setValue(e.tone.frequency, 800 + fx.echo.tone * 8200, immediate);
      if (!e.connected) {
        input.connect(e.delay);
        e.connected = true;
      }
    } else if (echo && echo.connected) {
      const e = echo;
      setValue(e.wet.gain, 0, immediate);
      setValue(e.feedback.gain, 0, immediate);
      const drop = () => {
        try {
          input.disconnect(e.delay);
        } catch {
          // already disconnected
        }
        e.connected = false;
        e.timer = undefined;
      };
      if (offline || immediate) drop();
      else e.timer = setTimeout(drop, 700);
    }
  };

  return { input, update };
}
