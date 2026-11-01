import { createFxChain, fxTailSeconds } from "./audioFx";
import {
  AUDIO_LANES,
  computeScheduleWindow,
  DEFAULT_DUCK_DEPTH,
  type AudioLaneId,
  type ResolvedAudioClip,
} from "./audioClips";
import {
  createDefaultTrackMix,
  trackFxOf,
  effectiveTrackLevel,
  type MediaResolver,
  type TrackMixMap,
} from "./previewAudio";
import { FPS } from "./timing";
import { extractPlayableUrlsFromSrc } from "./webAudioEngine";

const BASE_LANE_LEVEL: Record<AudioLaneId, number> = {
  voice: 0.95,
  sfx: 0.85,
  music: 0.8,
  ambience: 0.55,
};

const MAX_FRAMES_PER_OFFLINE_CHUNK = 7200; // 5 minutes per OfflineAudioContext chunk

export interface OfflineAudioMixOptions {
  resolvedClips: readonly ResolvedAudioClip[];
  resolveMedia: MediaResolver;
  trackMix?: TrackMixMap;
  duckDepth?: number;
  fromFrame: number;
  toFrame: number;
  fps?: number;
  sampleRate?: number;
  normalize?: boolean;
  loudnessTarget?: "off" | "-16" | "-14";
  opticalPrintEq?: boolean;
}

/**
 * Deterministic xorshift32 noise buffer for offline procedural ambience ("rain")
 * so offline audio renders never use Math.random().
 */
function createDeterministicNoiseBuffer(ctx: BaseAudioContext, seed = 0x5ca1e724): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < len; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = ((state >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buf;
}

function scheduleSynthBedOffline(
  ctx: BaseAudioContext,
  noiseBuffer: AudioBuffer,
  preset: string,
  dest: AudioNode,
  whenSec: number,
  durSec: number,
): void {
  if (durSec <= 0) return;
  if (preset === "rain") {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(filter).connect(g).connect(dest);
    src.start(whenSec);
    src.stop(whenSec + durSec);
  } else {
    const osc = ctx.createOscillator();
    osc.type = preset === "tension" ? "sawtooth" : "sine";
    osc.frequency.value = preset === "jazz" ? 110 : preset === "tension" ? 73.4 : 65.4;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    const g = ctx.createGain();
    g.gain.value = 0.14;
    osc.connect(filter).connect(g).connect(dest);
    osc.start(whenSec);
    osc.stop(whenSec + durSec);
  }
}

interface Interval {
  startSec: number;
  endSec: number;
}

function mergeVoiceIntervals(
  clips: readonly ResolvedAudioClip[],
  windowStartMs: number,
  windowDurationMs: number,
): Interval[] {
  const windowEndMs = windowStartMs + windowDurationMs;
  const raw: Interval[] = [];
  for (const clip of clips) {
    if (clip.lane !== "voice") continue;
    if (clip.gain <= 0 || clip.durationMs <= 0) continue;
    const s = Math.max(windowStartMs, clip.startMs);
    const e = Math.min(windowEndMs, clip.endMs);
    if (e <= s) continue;
    raw.push({
      startSec: (s - windowStartMs) / 1000,
      endSec: (e - windowStartMs) / 1000,
    });
  }
  if (!raw.length) return [];
  raw.sort((a, b) => a.startSec - b.startSec);
  const merged: Interval[] = [{ ...raw[0] }];
  for (let i = 1; i < raw.length; i += 1) {
    const prev = merged[merged.length - 1];
    // Merge voice intervals separated by < 160ms so music doesn't pump between adjacent syllables
    if (raw[i].startSec <= prev.endSec + 0.16) {
      prev.endSec = Math.max(prev.endSec, raw[i].endSec);
    } else {
      merged.push({ ...raw[i] });
    }
  }
  return merged;
}

function automateDuckingGain(
  duckGainParam: AudioParam,
  voiceIntervals: readonly Interval[],
  duckDepth: number,
  durationSec: number,
): void {
  const clampedDuck = Math.max(0, Math.min(1, duckDepth));
  if (!voiceIntervals.length || clampedDuck >= 0.999) {
    duckGainParam.setValueAtTime(1, 0);
    return;
  }
  const attackSec = 0.08;
  const releaseSec = 0.22;

  const first = voiceIntervals[0];
  if (first.startSec <= 0.005) {
    duckGainParam.setValueAtTime(clampedDuck, 0);
  } else {
    duckGainParam.setValueAtTime(1, 0);
  }

  for (let i = 0; i < voiceIntervals.length; i += 1) {
    const cur = voiceIntervals[i];
    if (cur.startSec > 0.005) {
      const rampStart = Math.max(0, cur.startSec - attackSec);
      duckGainParam.setValueAtTime(1, rampStart);
      duckGainParam.linearRampToValueAtTime(clampedDuck, cur.startSec);
    }
    const holdUntil = Math.min(durationSec, cur.endSec);
    duckGainParam.setValueAtTime(clampedDuck, holdUntil);
    const next = voiceIntervals[i + 1];
    const releaseEnd = Math.min(durationSec, holdUntil + releaseSec);
    if (!next || next.startSec - attackSec > releaseEnd) {
      duckGainParam.linearRampToValueAtTime(1, releaseEnd);
    }
  }
}

async function decodeAllNeededAudioBuffers(
  clips: readonly ResolvedAudioClip[],
  resolveMedia: MediaResolver,
  windowStartMs: number,
  windowEndMs: number,
  sampleRate: number,
): Promise<{
  byUrl: Map<string, AudioBuffer>;
  fileDurationsMs: Map<string, number>;
}> {
  const urlsToDecode = new Set<string>();
  const urlToLogicalSrcs = new Map<string, Set<string>>();

  for (const clip of clips) {
    if (clip.durationMs <= 0 || clip.endMs <= windowStartMs || clip.startMs >= windowEndMs) {
      continue;
    }
    const { urls } = extractPlayableUrlsFromSrc(clip.src, resolveMedia);
    for (const u of urls) {
      urlsToDecode.add(u);
      const set = urlToLogicalSrcs.get(u) ?? new Set<string>();
      set.add(clip.src);
      urlToLogicalSrcs.set(u, set);
    }
  }

  const byUrl = new Map<string, AudioBuffer>();
  const fileDurationsMs = new Map<string, number>();
  if (!urlsToDecode.size || typeof OfflineAudioContext === "undefined") {
    return { byUrl, fileDurationsMs };
  }

  const decoder = new OfflineAudioContext(2, 1, sampleRate);
  await Promise.all(
    [...urlsToDecode].map(async (url) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return;
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("text/html")) return;
        const ab = await resp.arrayBuffer();
        const decoded = await decoder.decodeAudioData(ab.slice(0));
        byUrl.set(url, decoded);
        for (const logical of urlToLogicalSrcs.get(url) ?? []) {
          fileDurationsMs.set(logical, decoded.duration * 1000);
        }
      } catch {
        // Skip unreadable/missing media asset cleanly
      }
    }),
  );

  return { byUrl, fileDurationsMs };
}

async function renderOfflineChunk(
  clips: readonly ResolvedAudioClip[],
  resolveMedia: MediaResolver,
  byUrl: ReadonlyMap<string, AudioBuffer>,
  fileDurationsMs: ReadonlyMap<string, number>,
  trackMix: TrackMixMap,
  duckDepth: number,
  chunkStartMs: number,
  chunkSamples: number,
  sampleRate: number,
  opticalPrintEq = false,
): Promise<{ left: Float32Array; right: Float32Array }> {
  const chunkDurationSec = chunkSamples / sampleRate;
  const chunkDurationMs = chunkDurationSec * 1000;
  const ctx = new OfflineAudioContext(2, Math.max(1, chunkSamples), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  const preMaster = ctx.createGain();
  preMaster.gain.value = 1;

  if (opticalPrintEq && typeof ctx.createBiquadFilter === "function") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 85;
    hp.Q.value = Math.SQRT1_2;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1800;
    mid.Q.value = 1.1;
    mid.gain.value = 1.8;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7800;
    lp.Q.value = Math.SQRT1_2;

    preMaster.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    lp.connect(master);
  } else {
    preMaster.connect(master);
  }

  const duck = ctx.createGain();
  duck.connect(preMaster);

  const voiceLevel = effectiveTrackLevel(trackMix, "voice");
  const voiceIntervals =
    voiceLevel > 0 ? mergeVoiceIntervals(clips, chunkStartMs, chunkDurationMs) : [];
  automateDuckingGain(duck.gain, voiceIntervals, duckDepth, chunkDurationSec);

  const laneBuses: Record<AudioLaneId, GainNode> = {} as Record<AudioLaneId, GainNode>;
  for (const lane of AUDIO_LANES) {
    const bus = ctx.createGain();
    bus.gain.value = effectiveTrackLevel(trackMix, lane) * BASE_LANE_LEVEL[lane];
    const destination = lane === "music" || lane === "ambience" ? duck : preMaster;
    const chain = createFxChain(ctx, destination);
    chain.update(trackFxOf(trackMix, lane), true);
    bus.connect(chain.input);
    laneBuses[lane] = bus;
  }

  const noiseBuffer = createDeterministicNoiseBuffer(ctx);
  const slices = computeScheduleWindow(clips, chunkStartMs, {
    includeActiveAtPlayhead: true,
    windowFromMs: chunkStartMs,
    lookaheadMs: chunkDurationMs,
    fileDurationsMs,
  });

  for (const slice of slices) {
    const bus = laneBuses[slice.clip.lane];
    if (!bus || effectiveTrackLevel(trackMix, slice.clip.lane) <= 0) continue;

    const whenSec = Math.max(0, slice.startWhenOffsetMs / 1000);
    if (whenSec >= chunkDurationSec) continue;
    const maxAvailSec = chunkDurationSec - whenSec;
    const sliceRemSec = Math.min(maxAvailSec, slice.remainingMs / 1000);
    if (sliceRemSec <= 0) continue;

    const clipGain = ctx.createGain();
    clipGain.connect(bus);

    const applyEnvelope = (durSec: number) => {
      const pts = slice.gainEnvelope;
      if (!pts.length) {
        clipGain.gain.setValueAtTime(slice.clip.gain, whenSec);
        return;
      }
      clipGain.gain.setValueAtTime(pts[0].gain, whenSec);
      for (let i = 1; i < pts.length; i += 1) {
        const t = whenSec + Math.min(durSec, pts[i].offsetMs / 1000);
        clipGain.gain.linearRampToValueAtTime(pts[i].gain, t);
      }
    };

    const { urls, synthTokens } = extractPlayableUrlsFromSrc(slice.clip.src, resolveMedia);

    for (const url of urls) {
      const buf = byUrl.get(url);
      if (!buf || buf.duration <= 0) continue;
      const offsetInFileSec = slice.offsetInFileMs / 1000;
      const source = ctx.createBufferSource();
      source.buffer = buf;

      if (slice.clip.loop) {
        source.loop = true;
        const wrapped = ((offsetInFileSec % buf.duration) + buf.duration) % buf.duration;
        applyEnvelope(sliceRemSec);
        source.connect(clipGain);
        source.start(whenSec, wrapped);
        source.stop(whenSec + sliceRemSec);
      } else {
        if (offsetInFileSec >= buf.duration) continue;
        const finalDurSec = Math.min(sliceRemSec, buf.duration - offsetInFileSec);
        if (finalDurSec <= 0) continue;
        applyEnvelope(finalDurSec);
        source.connect(clipGain);
        source.start(whenSec, offsetInFileSec, finalDurSec);
      }
    }

    for (const preset of synthTokens) {
      applyEnvelope(sliceRemSec);
      scheduleSynthBedOffline(ctx, noiseBuffer, preset, clipGain, whenSec, sliceRemSec);
    }
  }

  const rendered = await ctx.startRendering();
  const left = new Float32Array(rendered.getChannelData(0));
  const right =
    rendered.numberOfChannels > 1
      ? new Float32Array(rendered.getChannelData(1))
      : new Float32Array(rendered.getChannelData(0));
  return { left, right };
}

/**
 * Renders the exact 4-track audio mix (`voice`, `sfx`, `music` with fades & ducking, `ambience`)
 * over `[fromFrame, toFrame]` inclusive (`N = toFrame - fromFrame + 1` frames) using
 * Web Audio `OfflineAudioContext`, returning a 16-bit PCM stereo WAV `Uint8Array` with
 * exact sample count `N * (sampleRate / fps)`.
 */
export async function renderTimelineAudioOfflineWav(
  options: OfflineAudioMixOptions,
): Promise<Uint8Array> {
  const fps = options.fps ?? FPS;
  const sampleRate = options.sampleRate ?? 48000;
  const startFrame = Math.max(0, Math.round(options.fromFrame));
  const endFrame = Math.max(startFrame, Math.round(options.toFrame));
  const frameCount = endFrame - startFrame + 1;
  const samplesPerFrame = Math.round(sampleRate / fps);
  const totalSamples = Math.max(1, frameCount * samplesPerFrame);
  const trackMix = options.trackMix ?? createDefaultTrackMix();
  const duckDepth = options.duckDepth ?? DEFAULT_DUCK_DEPTH;

  const fullStartMs = (startFrame * 1000) / fps;
  const fullEndMs = ((endFrame + 1) * 1000) / fps;

  const { byUrl, fileDurationsMs } = await decodeAllNeededAudioBuffers(
    options.resolvedClips,
    options.resolveMedia,
    fullStartMs,
    fullEndMs,
    sampleRate,
  );

  const outLeft = new Float32Array(totalSamples);
  const outRight = new Float32Array(totalSamples);
  const fxPreRollMs = Math.round(
    Math.max(0, ...AUDIO_LANES.map((lane) => fxTailSeconds(trackFxOf(trackMix, lane)))) * 1000,
  );

  let frameCursor = startFrame;
  let sampleCursor = 0;

  while (frameCursor <= endFrame) {
    const chunkFrames = Math.min(MAX_FRAMES_PER_OFFLINE_CHUNK, endFrame - frameCursor + 1);
    const chunkSamples = Math.min(totalSamples - sampleCursor, chunkFrames * samplesPerFrame);
    const chunkStartMs = (frameCursor * 1000) / fps;

    // Reverb and echo tails from before this chunk: render a little earlier and drop that lead-in.
    const preRollMs = Math.min(chunkStartMs, fxPreRollMs);
    const preRollSamples = Math.round((preRollMs / 1000) * sampleRate);

    const { left, right } = await renderOfflineChunk(
      options.resolvedClips,
      options.resolveMedia,
      byUrl,
      fileDurationsMs,
      trackMix,
      duckDepth,
      chunkStartMs - preRollMs,
      chunkSamples + preRollSamples,
      sampleRate,
      Boolean(options.opticalPrintEq),
    );

    outLeft.set(left.subarray(preRollSamples, preRollSamples + chunkSamples), sampleCursor);
    outRight.set(right.subarray(preRollSamples, preRollSamples + chunkSamples), sampleCursor);

    frameCursor += chunkFrames;
    sampleCursor += chunkSamples;
  }

  const resolvedLoudness =
    options.loudnessTarget ?? (options.normalize ? "-14" : "off");
  if (resolvedLoudness === "-16") {
    normalizeStereoLoudnessInPlace(outLeft, outRight, sampleRate, {
      targetLufs: -16,
      ceilingDb: -1.5,
    });
  } else if (resolvedLoudness === "-14") {
    normalizeStereoLoudnessInPlace(outLeft, outRight, sampleRate, {
      targetLufs: -14,
      ceilingDb: -1.0,
    });
  }

  return encodeWav16BitStereo(outLeft, outRight, sampleRate);
}

/**
 * ITU-R BS.1770 K-weighted integrated loudness normalization + smooth -1.0 dBTP peak ceiling.
 */
export function normalizeStereoLoudnessInPlace(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  options: { targetLufs?: number; ceilingDb?: number; maxBoostDb?: number } = {},
): { measuredLufs: number; appliedGainDb: number; postPeakDb: number } {
  const targetLufs = options.targetLufs ?? -14;
  const ceilingDb = options.ceilingDb ?? -1.0;
  const maxBoostDb = options.maxBoostDb ?? 12.0;
  const n = Math.min(left.length, right.length);
  if (n === 0) {
    return { measuredLufs: -Infinity, appliedGainDb: 0, postPeakDb: -Infinity };
  }

  // 48 kHz ITU-R BS.1770-4 K-weighting stage 1 (high-shelf) + stage 2 (RLB high-pass)
  const kFilterEnergy = (samples: Float32Array): Float32Array => {
    const out = new Float32Array(n);
    // Stage 1: pre-filter high shelf (48kHz reference coefficients; close approximation at 44.1kHz)
    const b0 = 1.53512485958697;
    const b1 = -2.69169618940638;
    const b2 = 1.19839281085285;
    const a1 = -1.69065929318241;
    const a2 = 0.73248077421585;
    // Stage 2: RLB high-pass
    const hb0 = 1.0;
    const hb1 = -2.0;
    const hb2 = 1.0;
    const ha1 = -1.99004745483398;
    const ha2 = 0.99007225036621;

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0;
    for (let i = 0; i < n; i += 1) {
      const x0 = samples[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;

      const hy0 = hb0 * y0 + hb1 * hx1 + hb2 * hx2 - ha1 * hy1 - ha2 * hy2;
      hx2 = hx1;
      hx1 = y0;
      hy2 = hy1;
      hy1 = hy0;
      out[i] = hy0 * hy0;
    }
    return out;
  };

  const sqL = kFilterEnergy(left);
  const sqR = kFilterEnergy(right);

  const blockLen = Math.max(1, Math.round(0.4 * sampleRate));
  const hopLen = Math.max(1, Math.round(0.1 * sampleRate));
  const blockPowers: number[] = [];

  if (n >= blockLen) {
    for (let start = 0; start + blockLen <= n; start += hopLen) {
      let sum = 0;
      for (let i = start; i < start + blockLen; i += 1) {
        sum += sqL[i] + sqR[i];
      }
      blockPowers.push(sum / blockLen);
    }
  } else {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += sqL[i] + sqR[i];
    blockPowers.push(sum / n);
  }

  // Absolute gate (-70 LUFS)
  const absGatePower = Math.pow(10, (-70 + 0.691) / 10);
  const absGated = blockPowers.filter((p) => p > absGatePower);

  let measuredLufs = -Infinity;
  if (absGated.length > 0) {
    const meanAbs = absGated.reduce((acc, v) => acc + v, 0) / absGated.length;
    const relGateLufs = -0.691 + 10 * Math.log10(meanAbs) - 10;
    const relGatePower = Math.pow(10, (relGateLufs + 0.691) / 10);
    const relGated = absGated.filter((p) => p >= relGatePower);
    const finalSet = relGated.length > 0 ? relGated : absGated;
    const meanFinal = finalSet.reduce((acc, v) => acc + v, 0) / finalSet.length;
    if (meanFinal > 0) {
      measuredLufs = -0.691 + 10 * Math.log10(meanFinal);
    }
  }

  let appliedGainDb = 0;
  if (Number.isFinite(measuredLufs)) {
    appliedGainDb = Math.max(-24, Math.min(maxBoostDb, targetLufs - measuredLufs));
  }
  const linearGain = Math.pow(10, appliedGainDb / 20);
  const ceilingLinear = Math.pow(10, ceilingDb / 20);

  // Apply gain first
  for (let i = 0; i < n; i += 1) {
    left[i] *= linearGain;
    right[i] *= linearGain;
  }

  // Smooth envelope peak limiter to ceilingLinear (-1.0 dBTP)
  const releaseCoeff = Math.exp(-1 / Math.max(1, 0.06 * sampleRate));
  let envGain = 1.0;
  let postPeak = 0;
  for (let i = 0; i < n; i += 1) {
    const absMax = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    const neededGain = absMax > ceilingLinear ? ceilingLinear / absMax : 1.0;
    if (neededGain < envGain) {
      envGain = neededGain; // instant attack so zero overshoot
    } else {
      envGain = releaseCoeff * envGain + (1 - releaseCoeff) * 1.0;
      if (neededGain < envGain) envGain = neededGain;
    }
    left[i] *= envGain;
    right[i] *= envGain;
    const postAbs = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    if (postAbs > postPeak) postPeak = postAbs;
  }

  const postPeakDb = postPeak > 1e-9 ? 20 * Math.log10(postPeak) : -Infinity;
  return { measuredLufs, appliedGainDb, postPeakDb };
}

export function encodeWav16BitStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Uint8Array {
  const numFrames = Math.min(left.length, right.length);
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    chunks.push(String.fromCharCode(...sub));
  }
  return btoa(chunks.join(""));
}
