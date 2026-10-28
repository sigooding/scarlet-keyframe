/**
 * Compact bipolar [min, max] audio waveform envelope cache with IndexedDB persistence
 * and concurrency-bounded background WebAudio decoding.
 *
 * At 200 buckets/sec (5 ms per bucket), even a 3-minute music track takes only ~72 KB
 * (`Int8Array` of length `2 * 36,000`) instead of ~70 MB of uncompressed Float32 PCM,
 * and reloads instantaneously on subsequent sessions.
 */

const IDB_NAME = "frame24-waveform-peaks-v1";
const IDB_STORE = "envelopes";
export const DEFAULT_BUCKETS_PER_SEC = 200;
const MAX_CONCURRENT_DECODES = 3;

export interface WaveformEnvelope {
  url: string;
  bucketsPerSec: number;
  bucketCount: number;
  durationMs: number;
  maxAbsPeak: number;
  /** Interleaved [min0, max0, min1, max1, ...] quantized in [-127, 127] representing [-1.0, 1.0] */
  minMax: Int8Array;
}

interface StoredWaveformRecord {
  url: string;
  bucketsPerSec: number;
  bucketCount: number;
  durationMs: number;
  maxAbsPeak: number;
  minMaxBuffer: ArrayBuffer;
  savedAt: number;
}

const memoryCache = new Map<string, WaveformEnvelope>();
const failedUrls = new Set<string>();
const inflightUrls = new Set<string>();
const pendingStack: Array<{ url: string; logicalSrc?: string }> = [];
let activeDecodes = 0;
const listeners = new Set<(url: string, env: WaveformEnvelope) => void>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openPeaksDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "url" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function loadEnvelopeFromIdb(url: string): Promise<WaveformEnvelope | null> {
  const db = await openPeaksDb();
  if (!db) return null;
  return new Promise<WaveformEnvelope | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const rec = req.result as StoredWaveformRecord | undefined;
        if (!rec || !rec.minMaxBuffer || rec.bucketCount <= 0) {
          resolve(null);
          return;
        }
        resolve({
          url: rec.url,
          bucketsPerSec: rec.bucketsPerSec || DEFAULT_BUCKETS_PER_SEC,
          bucketCount: rec.bucketCount,
          durationMs: rec.durationMs,
          maxAbsPeak: rec.maxAbsPeak,
          minMax: new Int8Array(rec.minMaxBuffer),
        });
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveEnvelopeToIdb(env: WaveformEnvelope): Promise<void> {
  const db = await openPeaksDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const copy = new Int8Array(env.minMax.length);
      copy.set(env.minMax);
      const record: StoredWaveformRecord = {
        url: env.url,
        bucketsPerSec: env.bucketsPerSec,
        bucketCount: env.bucketCount,
        durationMs: env.durationMs,
        maxAbsPeak: env.maxAbsPeak,
        minMaxBuffer: copy.buffer,
        savedAt: Date.now(),
      };
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function quantizeInt8(val: number): number {
  const clamped = Math.max(-1, Math.min(1, val));
  return Math.round(clamped * 127);
}

/**
 * Computes a compact bipolar `[min, max]` envelope from raw channel arrays or an `AudioBuffer`.
 */
export function computeWaveformEnvelopeFromChannels(
  url: string,
  channels: readonly Float32Array[],
  sampleRate: number,
  bucketsPerSec = DEFAULT_BUCKETS_PER_SEC,
): WaveformEnvelope {
  const chCount = channels.length;
  const totalSamples = chCount > 0 ? channels[0].length : 0;
  const safeSr = Math.max(1, sampleRate);
  const durationMs = (totalSamples / safeSr) * 1000;
  const bucketCount = Math.max(1, Math.ceil((totalSamples / safeSr) * bucketsPerSec));
  const minMax = new Int8Array(bucketCount * 2);
  let maxAbsPeak = 0;

  if (totalSamples > 0 && chCount > 0) {
    const ch0 = channels[0];
    const ch1 = chCount > 1 ? channels[1] : null;
    for (let b = 0; b < bucketCount; b++) {
      const s0 = Math.floor((b * safeSr) / bucketsPerSec);
      const s1 = Math.min(totalSamples, Math.max(s0 + 1, Math.floor(((b + 1) * safeSr) / bucketsPerSec)));
      let lo = 0;
      let hi = 0;
      // Stride very dense buckets slightly while never missing > 0.25ms transients
      const span = s1 - s0;
      const step = span > 512 ? Math.floor(span / 256) : 1;
      for (let i = s0; i < s1; i += step) {
        const s = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        if (s < lo) lo = s;
        if (s > hi) hi = s;
        const abs = s < 0 ? -s : s;
        if (abs > maxAbsPeak) maxAbsPeak = abs;
      }
      minMax[b * 2] = quantizeInt8(lo);
      minMax[b * 2 + 1] = quantizeInt8(hi);
    }
  }

  return {
    url,
    bucketsPerSec,
    bucketCount,
    durationMs,
    maxAbsPeak,
    minMax,
  };
}

export function computeWaveformEnvelopeFromBuffer(
  url: string,
  buffer: AudioBuffer,
  bucketsPerSec = DEFAULT_BUCKETS_PER_SEC,
): WaveformEnvelope {
  const channels: Float32Array[] = [];
  const count = Math.min(2, buffer.numberOfChannels);
  for (let c = 0; c < count; c++) {
    channels.push(buffer.getChannelData(c));
  }
  return computeWaveformEnvelopeFromChannels(url, channels, buffer.sampleRate, bucketsPerSec);
}

/**
 * Samples the `[min, max]` range across `[t0Ms, t1Ms]` in source audio milliseconds.
 */
export function sampleEnvelopeRange(
  env: WaveformEnvelope,
  t0Ms: number,
  t1Ms: number,
  loop: boolean,
): { min: number; max: number; peak: number } {
  const { bucketCount, bucketsPerSec, minMax } = env;
  if (bucketCount <= 0 || minMax.length < 2) {
    return { min: 0, max: 0, peak: 0 };
  }
  const rawB0 = Math.floor((t0Ms / 1000) * bucketsPerSec);
  const rawB1 = Math.max(rawB0 + 1, Math.ceil((t1Ms / 1000) * bucketsPerSec));

  let minQ = 0;
  let maxQ = 0;

  if (loop) {
    const span = Math.min(bucketCount, Math.max(1, rawB1 - rawB0));
    const step = span > 64 ? Math.floor(span / 32) : 1;
    for (let k = 0; k < span; k += step) {
      const idx = (((rawB0 + k) % bucketCount) + bucketCount) % bucketCount;
      const lo = minMax[idx * 2];
      const hi = minMax[idx * 2 + 1];
      if (lo < minQ) minQ = lo;
      if (hi > maxQ) maxQ = hi;
    }
  } else {
    if (rawB0 >= bucketCount || rawB1 <= 0) {
      return { min: 0, max: 0, peak: 0 };
    }
    const b0 = Math.max(0, rawB0);
    const b1 = Math.min(bucketCount, rawB1);
    const span = Math.max(1, b1 - b0);
    const step = span > 64 ? Math.floor(span / 32) : 1;
    for (let idx = b0; idx < b1; idx += step) {
      const lo = minMax[idx * 2];
      const hi = minMax[idx * 2 + 1];
      if (lo < minQ) minQ = lo;
      if (hi > maxQ) maxQ = hi;
    }
  }

  const min = minQ / 127;
  const max = maxQ / 127;
  const peak = Math.max(-min, max);
  return { min, max, peak };
}

function notifyEnvelope(env: WaveformEnvelope): void {
  memoryCache.set(env.url, env);
  for (const fn of listeners) {
    fn(env.url, env);
  }
}

export function ingestDecodedBufferForWaveform(url: string, buffer: AudioBuffer): WaveformEnvelope {
  const existing = memoryCache.get(url);
  if (existing) return existing;
  const env = computeWaveformEnvelopeFromBuffer(url, buffer);
  notifyEnvelope(env);
  void saveEnvelopeToIdb(env);
  return env;
}

export function getCachedWaveformEnvelope(url: string | undefined): WaveformEnvelope | undefined {
  if (!url) return undefined;
  return memoryCache.get(url);
}

export function onWaveformReady(
  listener: (url: string, env: WaveformEnvelope) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let decodeFetcher:
  | ((url: string, logicalSrc?: string) => Promise<AudioBuffer | null>)
  | null = null;

export function registerWaveformDecoder(
  fn: (url: string, logicalSrc?: string) => Promise<AudioBuffer | null>,
): void {
  decodeFetcher = fn;
}

function pumpQueue(): void {
  while (activeDecodes < MAX_CONCURRENT_DECODES && pendingStack.length > 0) {
    // LIFO so the clips currently scrolled into the user's viewport decode first!
    const next = pendingStack.pop()!;
    if (memoryCache.has(next.url) || inflightUrls.has(next.url) || failedUrls.has(next.url)) {
      continue;
    }
    inflightUrls.add(next.url);
    activeDecodes += 1;

    void (async () => {
      try {
        const fromIdb = await loadEnvelopeFromIdb(next.url);
        if (fromIdb) {
          notifyEnvelope(fromIdb);
          return;
        }
        if (!decodeFetcher) return;
        const buf = await decodeFetcher(next.url, next.logicalSrc);
        if (!buf) {
          failedUrls.add(next.url);
          return;
        }
        ingestDecodedBufferForWaveform(next.url, buf);
      } catch {
        failedUrls.add(next.url);
      } finally {
        inflightUrls.delete(next.url);
        activeDecodes = Math.max(0, activeDecodes - 1);
        pumpQueue();
      }
    })();
  }
}

export function requestWaveformEnvelope(url: string | undefined, logicalSrc?: string): void {
  if (!url || memoryCache.has(url) || inflightUrls.has(url) || failedUrls.has(url)) {
    return;
  }
  const existingIdx = pendingStack.findIndex((item) => item.url === url);
  if (existingIdx >= 0) {
    // Bump priority to top of LIFO stack
    const [item] = pendingStack.splice(existingIdx, 1);
    pendingStack.push(item);
  } else {
    pendingStack.push({ url, logicalSrc });
  }
  pumpQueue();
}

export function clearWaveformMemoryCacheForTests(): void {
  memoryCache.clear();
  failedUrls.clear();
  inflightUrls.clear();
  pendingStack.length = 0;
}
