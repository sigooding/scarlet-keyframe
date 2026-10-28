import {
  AUDIO_LANES,
  computeScheduleWindow,
  DEFAULT_DUCK_DEPTH,
  isVoicePlayingAtMs,
  type AudioLaneId,
  type ResolvedAudioClip,
  type ScheduledClipSlice,
} from "./audioClips";
import {
  createDefaultTrackMix,
  effectiveTrackLevel,
  type MediaResolver,
  type TrackMixMap,
} from "./previewAudio";
import {
  ingestDecodedBufferForWaveform,
  registerWaveformDecoder,
} from "./waveformPeaks";

const SCHEDULER_INTERVAL_MS = 95;
const LOOKAHEAD_MS = 300;
const MAX_CACHED_BUFFERS = 48;
const METER_FFT_SIZE = 1024;
const CLIP_THRESHOLD_LINEAR = 0.9885; // ~ -0.1 dBFS

export interface StereoMeterReading {
  peakL: number;
  peakR: number;
  dbL: number;
  dbR: number;
  clipped: boolean;
}

const BASE_LANE_LEVEL: Record<AudioLaneId, number> = {
  voice: 0.95,
  sfx: 0.85,
  music: 0.8,
  ambience: 0.55,
};

const SYNTH_PRESETS = new Set(["rain", "jazz", "drone", "tension"]);

interface ActiveScheduledHandle {
  clipId: string;
  endPlayheadMs: number;
  stop: () => void;
}

export function extractPlayableUrlsFromSrc(
  src: string,
  resolveMedia: MediaResolver,
): { urls: string[]; synthTokens: string[] } {
  const urls: string[] = [];
  const synthTokens: string[] = [];
  if (!src) return { urls, synthTokens };

  const parts = src
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part === "none") continue;
    if (SYNTH_PRESETS.has(part)) {
      synthTokens.push(part);
      continue;
    }
    const rawRef = part.startsWith("file:") ? part.slice(5).trim() : part;
    const resolved = resolveMedia(rawRef);
    if (resolved) urls.push(resolved);
  }
  return { urls, synthTokens };
}

export class WebAudioPlaybackEngine {
  private ctx: AudioContext | null = null;
  private preMasterGain: GainNode | null = null;
  private eqHighPass: BiquadFilterNode | null = null;
  private opticalPrintEq = false;
  private masterGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private meterBufL: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(METER_FFT_SIZE * 4));
  private meterBufR: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(METER_FFT_SIZE * 4));
  private stickyClipped = false;
  private laneBuses: Partial<Record<AudioLaneId, GainNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;

  private bufferCache = new Map<string, AudioBuffer>();
  private inflightDecodes = new Map<string, Promise<AudioBuffer | null>>();
  private fileDurationMsBySrc = new Map<string, number>();
  private decodeListeners = new Set<(url: string, buffer: AudioBuffer) => void>();

  private resolvedClips: ResolvedAudioClip[] = [];
  private trackMix: TrackMixMap = createDefaultTrackMix();
  private resolveMedia: MediaResolver = (v) => v;
  private soundEnabled = true;
  private duckDepth = DEFAULT_DUCK_DEPTH;

  private playing = false;
  private playSpeed = 1;
  private anchorPlayheadMs = 0;
  private anchorCtxTime = 0;
  private scheduledUpToMs = 0;
  private scheduledIds = new Set<string>();
  private activeHandles: ActiveScheduledHandle[] = [];
  private schedulerTimer: number | null = null;
  private scrubStopTimer: number | null = null;

  get isPlaying(): boolean {
    return this.playing;
  }

  get contextState(): AudioContextState | "uninitialized" {
    return this.ctx ? this.ctx.state : "uninitialized";
  }

  get decodedBufferCount(): number {
    return this.bufferCache.size;
  }

  get activeSourceCount(): number {
    return this.activeHandles.length;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.soundEnabled ? 1 : 0;
      master.connect(ctx.destination);

      try {
        const splitter = ctx.createChannelSplitter(2);
        const anaL = ctx.createAnalyser();
        const anaR = ctx.createAnalyser();
        anaL.fftSize = METER_FFT_SIZE;
        anaR.fftSize = METER_FFT_SIZE;
        anaL.smoothingTimeConstant = 0;
        anaR.smoothingTimeConstant = 0;
        master.connect(splitter);
        splitter.connect(anaL, 0);
        splitter.connect(anaR, 1);
        this.analyserL = anaL;
        this.analyserR = anaR;
      } catch {
        // Fallback for minimal mock AudioContext environments in tests
      }

      const preMaster = ctx.createGain();
      preMaster.gain.value = 1;

      try {
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

        hp.connect(mid);
        mid.connect(lp);
        lp.connect(master);

        this.eqHighPass = hp;
      } catch {
        // Fallback for minimal mock AudioContext environments in tests
      }

      if (this.opticalPrintEq && this.eqHighPass) {
        preMaster.connect(this.eqHighPass);
      } else {
        preMaster.connect(master);
      }

      const duck = ctx.createGain();
      duck.gain.value = 1;
      duck.connect(preMaster);

      this.ctx = ctx;
      this.preMasterGain = preMaster;
      this.masterGain = master;
      this.duckGain = duck;

      for (const lane of AUDIO_LANES) {
        const bus = ctx.createGain();
        bus.gain.value = effectiveTrackLevel(this.trackMix, lane) * BASE_LANE_LEVEL[lane];
        // Music and ambience pass through the ducking bus; voice and sfx bypass ducking
        if (lane === "music" || lane === "ambience") {
          bus.connect(duck);
        } else {
          bus.connect(preMaster);
        }
        this.laneBuses[lane] = bus;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  unlock(): void {
    this.ensureContext();
  }

  onBufferDecoded(listener: (url: string, buffer: AudioBuffer) => void): () => void {
    this.decodeListeners.add(listener);
    return () => {
      this.decodeListeners.delete(listener);
    };
  }

  getCachedBuffer(resolvedUrl: string | undefined): AudioBuffer | undefined {
    if (!resolvedUrl) return undefined;
    const hit = this.bufferCache.get(resolvedUrl);
    if (hit) {
      // Touch LRU order
      this.bufferCache.delete(resolvedUrl);
      this.bufferCache.set(resolvedUrl, hit);
    }
    return hit;
  }

  resetClipIndicator(): void {
    this.stickyClipped = false;
  }

  readStereoMeter(): StereoMeterReading {
    if (!this.ctx || this.ctx.state !== "running" || !this.analyserL || !this.analyserR || !this.soundEnabled) {
      return {
        peakL: 0,
        peakR: 0,
        dbL: -Infinity,
        dbR: -Infinity,
        clipped: this.stickyClipped,
      };
    }
    this.analyserL.getFloatTimeDomainData(this.meterBufL);
    this.analyserR.getFloatTimeDomainData(this.meterBufR);
    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < METER_FFT_SIZE; i += 1) {
      const aL = Math.abs(this.meterBufL[i]);
      const aR = Math.abs(this.meterBufR[i]);
      if (aL > peakL) peakL = aL;
      if (aR > peakR) peakR = aR;
    }
    if (peakL >= CLIP_THRESHOLD_LINEAR || peakR >= CLIP_THRESHOLD_LINEAR) {
      this.stickyClipped = true;
    }
    const dbL = peakL > 1e-6 ? 20 * Math.log10(peakL) : -Infinity;
    const dbR = peakR > 1e-6 ? 20 * Math.log10(peakR) : -Infinity;
    return {
      peakL,
      peakR,
      dbL,
      dbR,
      clipped: this.stickyClipped,
    };
  }

  getKnownDurationMs(src: string): number | undefined {
    return this.fileDurationMsBySrc.get(src);
  }

  /**
   * Decodes an audio URL once via `AudioContext.decodeAudioData` (or `OfflineAudioContext`
   * when decoding for waveform display before the first user gesture!).
   */
  async decodeUrlOnce(resolvedUrl: string, logicalSrc?: string): Promise<AudioBuffer | null> {
    if (!resolvedUrl || typeof window === "undefined") return null;
    const cached = this.getCachedBuffer(resolvedUrl);
    if (cached) {
      if (logicalSrc) this.fileDurationMsBySrc.set(logicalSrc, cached.duration * 1000);
      return cached;
    }
    const existing = this.inflightDecodes.get(resolvedUrl);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const resp = await fetch(resolvedUrl);
        if (!resp.ok) return null;
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("text/html")) return null;
        const arrayBuf = await resp.arrayBuffer();
        const decoder: BaseAudioContext | null =
          this.ctx ??
          (typeof OfflineAudioContext !== "undefined"
            ? new OfflineAudioContext(1, 1, 44100)
            : this.ensureContext());
        if (!decoder) return null;
        const audioBuf = await decoder.decodeAudioData(arrayBuf.slice(0));
        // Extract & persist compact [min, max] waveform envelope before LRU eviction
        ingestDecodedBufferForWaveform(resolvedUrl, audioBuf);
        if (this.bufferCache.size >= MAX_CACHED_BUFFERS) {
          const oldestKey = this.bufferCache.keys().next().value;
          if (oldestKey) this.bufferCache.delete(oldestKey);
        }
        this.bufferCache.set(resolvedUrl, audioBuf);
        if (logicalSrc) {
          this.fileDurationMsBySrc.set(logicalSrc, audioBuf.duration * 1000);
        }
        for (const fn of this.decodeListeners) {
          fn(resolvedUrl, audioBuf);
        }
        return audioBuf;
      } catch {
        return null;
      } finally {
        this.inflightDecodes.delete(resolvedUrl);
      }
    })();

    this.inflightDecodes.set(resolvedUrl, promise);
    return promise;
  }

  setClips(clips: ResolvedAudioClip[], resolveMedia: MediaResolver): void {
    this.resolvedClips = clips;
    this.resolveMedia = resolveMedia;
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(enabled ? 1 : 0, this.ctx.currentTime, 0.015);
    }
  }

  setTrackMix(mix: TrackMixMap): void {
    this.trackMix = mix;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const lane of AUDIO_LANES) {
      const bus = this.laneBuses[lane];
      if (bus) {
        const target = effectiveTrackLevel(mix, lane) * BASE_LANE_LEVEL[lane];
        bus.gain.setTargetAtTime(target, now, 0.015);
      }
    }
    this.updateDuckingAtMs(this.getCurrentPlayheadMs());
  }

  setDuckDepth(depth: number): void {
    this.duckDepth = Math.max(0, Math.min(1, depth));
    this.updateDuckingAtMs(this.getCurrentPlayheadMs());
  }

  get isOpticalPrintEqEnabled(): boolean {
    return this.opticalPrintEq;
  }

  setOpticalPrintEq(enabled: boolean): void {
    const next = Boolean(enabled);
    if (this.opticalPrintEq === next) return;
    this.opticalPrintEq = next;
    if (!this.preMasterGain || !this.masterGain) return;
    try {
      this.preMasterGain.disconnect();
      if (next && this.eqHighPass) {
        this.preMasterGain.connect(this.eqHighPass);
      } else {
        this.preMasterGain.connect(this.masterGain);
      }
    } catch {
      // Ignore in mock environments
    }
  }

  /**
   * Master playback clock derived strictly from `AudioContext.currentTime`.
   */
  getCurrentPlayheadMs(): number {
    if (!this.playing || !this.ctx) return this.anchorPlayheadMs;
    const elapsedSec = Math.max(0, this.ctx.currentTime - this.anchorCtxTime);
    return this.anchorPlayheadMs + elapsedSec * 1000 * this.playSpeed;
  }

  startPlayback(fromMs: number, speed = 1): void {
    this.stopAllSources();
    const ctx = this.ensureContext();
    this.playSpeed = speed > 0 ? speed : 1;
    this.anchorPlayheadMs = Math.max(0, fromMs);
    this.anchorCtxTime = ctx ? ctx.currentTime : 0;
    this.scheduledUpToMs = this.anchorPlayheadMs;
    this.playing = true;

    if (ctx) {
      this.scheduleWindow(true);
      this.schedulerTimer = window.setInterval(() => {
        if (!this.playing) return;
        this.scheduleWindow(false);
      }, SCHEDULER_INTERVAL_MS);
    }
  }

  seek(toMs: number, speed = this.playSpeed): void {
    const clamped = Math.max(0, toMs);
    if (this.playing) {
      this.startPlayback(clamped, speed);
    } else {
      this.stopAllSources();
      this.anchorPlayheadMs = clamped;
    }
  }

  /**
   * Short ~80 ms audio grain on scrub so the editor hears clips under the playhead.
   */
  scrub(atMs: number): void {
    if (this.playing || !this.soundEnabled) return;
    this.stopAllSources();
    this.anchorPlayheadMs = Math.max(0, atMs);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;

    const slices = computeScheduleWindow(this.resolvedClips, this.anchorPlayheadMs, {
      includeActiveAtPlayhead: true,
      lookaheadMs: 1,
      fileDurationsMs: this.fileDurationMsBySrc,
    });
    for (const slice of slices) {
      if (slice.startWhenOffsetMs === 0) {
        this.spawnSlice(ctx, slice, Math.min(85, slice.remainingMs));
      }
    }
    this.scrubStopTimer = window.setTimeout(() => {
      if (!this.playing) this.stopAllSources();
    }, 95);
  }

  stop(): void {
    this.anchorPlayheadMs = this.getCurrentPlayheadMs();
    this.playing = false;
    this.stopAllSources();
  }

  previewClip(clip: ResolvedAudioClip, resolveMedia: MediaResolver): void {
    this.stop();
    this.resolveMedia = resolveMedia;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const slice: ScheduledClipSlice = {
      clip,
      startWhenOffsetMs: 0,
      offsetInFileMs: clip.inMs,
      remainingMs: clip.durationMs,
      elapsedInClipMs: 0,
      gainEnvelope: [
        { offsetMs: 0, gain: clip.fadeInMs > 0 ? 0 : clip.gain },
        ...(clip.fadeInMs > 0 ? [{ offsetMs: clip.fadeInMs, gain: clip.gain }] : []),
        ...(clip.fadeOutMs > 0
          ? [
              { offsetMs: Math.max(0, clip.durationMs - clip.fadeOutMs), gain: clip.gain },
              { offsetMs: clip.durationMs, gain: 0 },
            ]
          : []),
      ],
    };
    this.spawnSlice(ctx, slice);
  }

  private stopAllSources(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.scrubStopTimer !== null) {
      window.clearTimeout(this.scrubStopTimer);
      this.scrubStopTimer = null;
    }
    for (const h of this.activeHandles) {
      h.stop();
    }
    this.activeHandles = [];
    this.scheduledIds.clear();
    if (this.duckGain && this.ctx) {
      this.duckGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.duckGain.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  private updateDuckingAtMs(nowMs: number): void {
    if (!this.ctx || !this.duckGain) return;
    const ctxNow = this.ctx.currentTime;
    const voiceNow = isVoicePlayingAtMs(this.resolvedClips, nowMs, this.trackMix);
    const duckedLevel = Math.max(0, 1 - this.duckDepth);
    this.duckGain.gain.cancelScheduledValues(ctxNow);
    this.duckGain.gain.setTargetAtTime(voiceNow ? duckedLevel : 1, ctxNow, 0.045);

    // Also schedule upcoming voice transitions inside lookahead window
    if (effectiveTrackLevel(this.trackMix, "voice") <= 0) return;
    const windowEnd = nowMs + LOOKAHEAD_MS;
    const transitions = new Set<number>();
    for (const c of this.resolvedClips) {
      if (c.lane !== "voice" || c.gain <= 0) continue;
      if (c.startMs > nowMs && c.startMs <= windowEnd) transitions.add(c.startMs);
      if (c.endMs > nowMs && c.endMs <= windowEnd) transitions.add(c.endMs);
    }
    for (const edgeMs of [...transitions].sort((a, b) => a - b)) {
      const when = ctxNow + (edgeMs - nowMs) / 1000 / this.playSpeed;
      const activeAfter = isVoicePlayingAtMs(this.resolvedClips, edgeMs + 0.5, this.trackMix);
      this.duckGain.gain.linearRampToValueAtTime(
        activeAfter ? duckedLevel : 1,
        Math.max(ctxNow + 0.01, when + 0.06),
      );
    }
  }

  private scheduleWindow(initialSeek: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const nowMs = this.getCurrentPlayheadMs();

    // Prune finished source/gain handles so long multi-hour plays never accumulate graph nodes
    if (this.activeHandles.length > 0) {
      const stillActive: ActiveScheduledHandle[] = [];
      for (const h of this.activeHandles) {
        if (h.endPlayheadMs < nowMs - 80) {
          h.stop();
        } else {
          stillActive.push(h);
        }
      }
      this.activeHandles = stillActive;
    }

    this.updateDuckingAtMs(nowMs);

    const slices = computeScheduleWindow(this.resolvedClips, nowMs, {
      includeActiveAtPlayhead: initialSeek,
      windowFromMs: initialSeek ? nowMs : this.scheduledUpToMs,
      lookaheadMs: LOOKAHEAD_MS * this.playSpeed,
      alreadyScheduledIds: this.scheduledIds,
      fileDurationsMs: this.fileDurationMsBySrc,
    });

    this.scheduledUpToMs = nowMs + LOOKAHEAD_MS * this.playSpeed;

    // Pre-warm buffers for clips coming up in the next 4 seconds so lookahead hits cache
    const warmLimitMs = nowMs + 4000 * this.playSpeed;
    for (const c of this.resolvedClips) {
      if (c.endMs >= nowMs && c.startMs <= warmLimitMs) {
        const { urls } = extractPlayableUrlsFromSrc(c.src, this.resolveMedia);
        for (const u of urls) {
          if (!this.bufferCache.has(u) && !this.inflightDecodes.has(u)) {
            void this.decodeUrlOnce(u, c.src);
          }
        }
      }
    }

    for (const slice of slices) {
      this.scheduledIds.add(slice.clip.id);
      this.spawnSlice(ctx, slice);
    }
  }

  private spawnSlice(
    ctx: AudioContext,
    slice: ScheduledClipSlice,
    overrideDurationMs?: number,
  ): void {
    const bus = this.laneBuses[slice.clip.lane];
    if (!bus) return;

    const { urls, synthTokens } = extractPlayableUrlsFromSrc(
      slice.clip.src,
      this.resolveMedia,
    );
    const clipGain = ctx.createGain();
    clipGain.connect(bus);

    const stopFns: Array<() => void> = [];
    let cancelled = false;

    const applyEnvelope = (whenSec: number, sliceRef: ScheduledClipSlice, durSec: number) => {
      clipGain.gain.cancelScheduledValues(whenSec);
      const pts = sliceRef.gainEnvelope;
      if (!pts.length) {
        clipGain.gain.setValueAtTime(sliceRef.clip.gain, whenSec);
        return;
      }
      clipGain.gain.setValueAtTime(pts[0].gain, whenSec);
      for (let i = 1; i < pts.length; i += 1) {
        const t = whenSec + Math.min(durSec, pts[i].offsetMs / 1000 / this.playSpeed);
        clipGain.gain.linearRampToValueAtTime(pts[i].gain, t);
      }
    };

    const startDecodedBuffer = (buf: AudioBuffer, isLateArrival: boolean) => {
      if (cancelled) return;
      let startWhenSec = ctx.currentTime + slice.startWhenOffsetMs / 1000 / this.playSpeed;
      let offsetInFileSec = slice.offsetInFileMs / 1000;
      let remainingSec = (overrideDurationMs ?? slice.remainingMs) / 1000 / this.playSpeed;

      if (isLateArrival && this.playing) {
        const liveNowMs = this.getCurrentPlayheadMs();
        if (liveNowMs >= slice.clip.endMs) return;
        if (liveNowMs <= slice.clip.startMs) {
          startWhenSec = ctx.currentTime + (slice.clip.startMs - liveNowMs) / 1000 / this.playSpeed;
          offsetInFileSec = slice.clip.inMs / 1000;
          remainingSec = slice.clip.durationMs / 1000 / this.playSpeed;
        } else {
          const elapsedMs = liveNowMs - slice.clip.startMs;
          startWhenSec = ctx.currentTime;
          offsetInFileSec = (slice.clip.inMs + elapsedMs) / 1000;
          remainingSec = (slice.clip.durationMs - elapsedMs) / 1000 / this.playSpeed;
        }
      }

      if (buf.duration <= 0 || remainingSec <= 0) return;

      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = this.playSpeed;

      if (slice.clip.loop) {
        source.loop = true;
        const wrappedOffset = ((offsetInFileSec % buf.duration) + buf.duration) % buf.duration;
        applyEnvelope(startWhenSec, slice, remainingSec);
        source.connect(clipGain);
        source.start(startWhenSec, wrappedOffset);
        source.stop(startWhenSec + remainingSec);
      } else {
        if (offsetInFileSec >= buf.duration) return;
        const playableFileSec = (buf.duration - offsetInFileSec) / this.playSpeed;
        const finalDurSec = Math.min(remainingSec, playableFileSec);
        if (finalDurSec <= 0) return;
        applyEnvelope(startWhenSec, slice, finalDurSec);
        source.connect(clipGain);
        source.start(startWhenSec, offsetInFileSec, finalDurSec * this.playSpeed);
      }

      stopFns.push(() => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
        try {
          source.disconnect();
        } catch {
          // Already disconnected.
        }
      });
    };

    for (const url of urls) {
      const cached = this.bufferCache.get(url);
      if (cached) {
        startDecodedBuffer(cached, false);
      } else {
        void this.decodeUrlOnce(url, slice.clip.src).then((buf) => {
          if (buf && !cancelled) startDecodedBuffer(buf, true);
        });
      }
    }

    for (const preset of synthTokens) {
      const startWhenSec = ctx.currentTime + slice.startWhenOffsetMs / 1000 / this.playSpeed;
      const durSec = (overrideDurationMs ?? slice.remainingMs) / 1000 / this.playSpeed;
      applyEnvelope(startWhenSec, slice, durSec);
      stopFns.push(this.startSynthBed(ctx, preset, clipGain, startWhenSec, durSec));
    }

    const handle: ActiveScheduledHandle = {
      clipId: slice.clip.id,
      endPlayheadMs: slice.clip.startMs + slice.elapsedInClipMs + (overrideDurationMs ?? slice.remainingMs),
      stop: () => {
        cancelled = true;
        for (const fn of stopFns) fn();
        try {
          clipGain.disconnect();
        } catch {
          // noop
        }
      },
    };
    this.activeHandles.push(handle);
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private startSynthBed(
    ctx: AudioContext,
    preset: string,
    dest: AudioNode,
    whenSec: number,
    durSec: number,
  ): () => void {
    const stops: Array<() => void> = [];
    if (preset === "rain") {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
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
      stops.push(() => {
        try {
          src.stop();
          src.disconnect();
        } catch {
          // noop
        }
      });
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
      stops.push(() => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // noop
        }
      });
    }
    return () => {
      for (const fn of stops) fn();
    };
  }
}

export const webAudioEngine = new WebAudioPlaybackEngine();
registerWaveformDecoder((url, logicalSrc) => webAudioEngine.decodeUrlOnce(url, logicalSrc));

