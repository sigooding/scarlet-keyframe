// The animatic exporter's sound (tools/export-animatic.mjs): rebuilds the game's mix from what the page logged while the
// film played on its test clock. See docs/animatic-export.md.
//
//  - recorded sounds (voices, effects, music): every play, pause, seek and volume change of each <audio> element, so a
//    fade, the music ducking under a voice and a song that plays once all come out as they did in the game;
//  - the ambience: each change of the sound engine's bed, its recorded loops (at the engine's 0.8) and its synthesised
//    presets (rendered by the engine itself), with the engine's fade in (1.2 s) and fade out (0.6 s);
//  - synthesised one-shots (the transition thumps), rendered by the engine and placed where they fired.
// Times in the logs are page-clock milliseconds; the mix starts at the first frame (t0).
import { spawnSync } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";

export const RATE = 48000;

/** Decodes a file to interleaved stereo float32 at RATE, keeping the most recent ones (about 1.5 GB) in memory. */
export function makeDecoder(ffmpeg, pathOf) {
  const cache = new Map();
  let bytes = 0;
  return (url) => {
    if (cache.has(url)) {
      const hit = cache.get(url);
      cache.delete(url);
      cache.set(url, hit);
      return hit;
    }
    const path = pathOf(url);
    if (!path) return null;
    const r = spawnSync(ffmpeg, ["-nostdin", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", String(RATE), "-"], { maxBuffer: 2 ** 31 - 1 });
    if (r.status !== 0 || !r.stdout?.length) return null;
    const pcm = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
    cache.set(url, pcm);
    bytes += pcm.byteLength;
    while (bytes > 1.5e9 && cache.size > 1) {
      const [k, v] = cache.entries().next().value;
      cache.delete(k);
      bytes -= v.byteLength;
    }
    return pcm;
  };
}

/** The <audio> log as playing segments: { src, t0, t1, pos0, loop, vols: [[t, volume]…] }. */
export function mediaSegments(log, tEnd) {
  const els = new Map();
  const segs = [];
  const close = (s, t) => {
    if (!s.seg) return;
    s.seg.t1 = t;
    if (s.seg.t1 > s.seg.t0) segs.push(s.seg);
    s.seg = null;
  };
  const open = (s, t, pos) => {
    s.seg = { src: s.src, t0: t, t1: tEnd, pos0: pos, loop: s.loop, vols: [[t, s.muted ? 0 : s.vol]] };
  };
  for (const e of log) {
    let s = els.get(e.id);
    if (!s) els.set(e.id, (s = { seg: null, vol: 1, loop: false, muted: false, src: null }));
    if (e.ev === "play") {
      s.src = e.src;
      s.vol = e.vol ?? s.vol;
      s.loop = !!e.loop;
      s.muted = !!e.muted;
      if (!s.seg) open(s, e.t, e.pos ?? 0);
    } else if (e.ev === "vol") {
      s.vol = e.vol;
      if (s.seg) s.seg.vols.push([e.t, s.muted ? 0 : e.vol]);
    } else if (e.ev === "muted") {
      s.muted = !!e.muted;
      if (s.seg) s.seg.vols.push([e.t, s.muted ? 0 : s.vol]);
    } else if (e.ev === "pause" || e.ev === "ended") {
      close(s, e.t);
    } else if (e.ev === "seek") {
      if (s.seg) {
        close(s, e.t);
        open(s, e.t, e.pos ?? 0);
      }
    } else if (e.ev === "loop") {
      s.loop = !!e.loop;
      if (s.seg) s.seg.loop = s.loop;
    }
  }
  for (const s of els.values()) close(s, tEnd);
  return segs.filter((g) => g.src && !g.vols.every(([, v]) => v <= 0));
}

/** The engine's ambience changes as layers: { url | preset, gain, t0, tOut (fade-out start, or Infinity), bus }. */
export function ambientLayers(engineLog) {
  const layers = [];
  let current = null, currentId = null;
  for (const e of engineLog) {
    if (e.kind !== "ambient") continue;
    const id = e.args?.[0] ?? null;
    if (id === currentId) continue;
    if (current) for (const l of current) l.tOut = e.t;
    currentId = id;
    current = null;
    if (!id || id === "none") continue;
    const bus = (e.vol?.ambient ?? 0.45) * (e.vol?.master ?? 0.8);
    current = id.split("+").map((p) => p.trim()).filter(Boolean).map((part) =>
      part.startsWith("file:")
        ? { url: part.slice(5), gain: 0.8, t0: e.t, tOut: Infinity, bus }
        : { preset: part, gain: 1, t0: e.t, tOut: Infinity, bus });
    layers.push(...current);
  }
  return layers;
}

/** The synthesised one-shots as { key, t, bus }: key names the render ("transitionSfx:[...]"). */
export function synthEvents(engineLog) {
  return engineLog
    .filter((e) => e.kind === "synth")
    .map((e) => ({ key: `${e.name}:${JSON.stringify(e.args ?? [])}`, name: e.name, args: e.args ?? [], t: e.t, bus: (e.vol?.sfx ?? 0.75) * (e.vol?.master ?? 0.8) }));
}

/** Volume at page time t for a segment: steps as the game set them, each change eased over 12 ms so it does not click. */
function gainAt(vols, t, k) {
  // k: a cursor object { i } that only moves forward
  while (k.i + 1 < vols.length && vols[k.i + 1][0] <= t) k.i++;
  const [ti, vi] = vols[k.i];
  const prev = k.i > 0 ? vols[k.i - 1][1] : vi;
  const ramp = 12;
  return t - ti < ramp ? prev + (vi - prev) * ((t - ti) / ramp) : vi;
}

/** setTargetAtTime as the engine uses it: fade in towards 1 (time constant 1.2 s), fade out towards 0 (0.6 s), stop
 *  2.2 s after the fade-out began. */
function ambientGainAt(l, t) {
  if (t < l.t0) return 0;
  const inG = (tt) => 1 - (1 - 0.0001) * Math.exp(-(tt - l.t0) / 1200);
  if (t < l.tOut) return inG(t);
  if (t > l.tOut + 2200) return 0;
  return inG(l.tOut) * Math.exp(-(t - l.tOut) / 600);
}

/**
 * Writes the mix to a 16-bit stereo WAV, `seconds` long, page time `t0` at its start. `decode(url)` gives a file's
 * samples, `synth(key)` and `ambient(preset)` the engine's renders (interleaved stereo float32 at RATE). The last
 * `fadeOutSeconds` fade to silence (an export that stops part-way through the film).
 */
export function writeMix({ wavPath, t0, seconds, segments, layers, synths, decode, synth, ambient, fadeOutSeconds = 0, onWarn = () => {} }) {
  const total = Math.max(1, Math.round(seconds * RATE));
  const fd = openSync(wavPath, "w");
  const header = Buffer.alloc(44);
  const dataBytes = total * 4;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  writeSync(fd, header);

  const msPer = 1000 / RATE;
  const missing = new Set();
  const pcmOf = (key, get) => {
    const pcm = get(key);
    if (!pcm && !missing.has(key)) {
      missing.add(key);
      onWarn(`no audio for ${key}`);
    }
    return pcm;
  };
  const CHUNK = RATE * 10;
  const mix = new Float32Array(CHUNK * 2);
  const out = Buffer.alloc(CHUNK * 4);
  let peak = 0;
  for (let c0 = 0; c0 < total; c0 += CHUNK) {
    const n = Math.min(CHUNK, total - c0);
    mix.fill(0, 0, n * 2);
    const tA = t0 + c0 * msPer, tB = t0 + (c0 + n) * msPer;
    // recorded sounds
    for (const g of segments) {
      if (g.t1 <= tA || g.t0 >= tB) continue;
      const pcm = pcmOf(g.src, decode);
      if (!pcm) continue;
      const frames = pcm.length / 2;
      const k = { i: 0 };
      const from = Math.max(0, Math.floor((g.t0 - tA) / msPer)), to = Math.min(n, Math.ceil((g.t1 - tA) / msPer));
      for (let s = from; s < to; s++) {
        const t = tA + s * msPer;
        let i = Math.floor((g.pos0 + (t - g.t0) / 1000) * RATE);
        if (i < 0) continue;
        if (i >= frames) {
          if (!g.loop) break;
          i %= frames;
        }
        const v = gainAt(g.vols, t, k);
        mix[s * 2] += pcm[i * 2] * v;
        mix[s * 2 + 1] += pcm[i * 2 + 1] * v;
      }
    }
    // the ambience
    for (const l of layers) {
      if (l.t0 >= tB || l.tOut + 2200 <= tA) continue;
      const pcm = l.url ? pcmOf(l.url, decode) : pcmOf(l.preset, ambient);
      if (!pcm) continue;
      const frames = pcm.length / 2;
      const from = Math.max(0, Math.floor((l.t0 - tA) / msPer));
      for (let s = from; s < n; s++) {
        const t = tA + s * msPer;
        const env = ambientGainAt(l, t);
        if (env <= 0 && t > l.tOut) break;
        const i = Math.floor(((t - l.t0) / 1000) * RATE) % frames;
        const v = env * l.gain * l.bus;
        mix[s * 2] += pcm[i * 2] * v;
        mix[s * 2 + 1] += pcm[i * 2 + 1] * v;
      }
    }
    // synthesised one-shots
    for (const e of synths) {
      const pcm = pcmOf(e.key, synth);
      if (!pcm) continue;
      const frames = pcm.length / 2;
      if (e.t + frames * msPer <= tA || e.t >= tB) continue;
      const from = Math.max(0, Math.floor((e.t - tA) / msPer));
      for (let s = from; s < n; s++) {
        const i = Math.floor(((tA + s * msPer - e.t) / 1000) * RATE);
        if (i >= frames) break;
        if (i < 0) continue;
        mix[s * 2] += pcm[i * 2] * e.bus;
        mix[s * 2 + 1] += pcm[i * 2 + 1] * e.bus;
      }
    }
    const fadeFrom = total - Math.round(fadeOutSeconds * RATE);
    for (let s = 0; s < n * 2; s++) {
      let x = mix[s];
      const at = c0 + (s >> 1);
      if (at >= fadeFrom && fadeOutSeconds > 0) x *= 0.5 + 0.5 * Math.cos((Math.PI * (at - fadeFrom)) / (total - fadeFrom));
      const a = Math.abs(x);
      if (a > peak) peak = a;
      // a soft knee above -1 dBFS instead of hard clipping (the browser would have clipped)
      if (a > 0.89) x = Math.sign(x) * (0.89 + 0.1 * Math.tanh((a - 0.89) / 0.1));
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x * 32767))), s * 2);
    }
    writeSync(fd, out, 0, n * 4);
  }
  closeSync(fd);
  return { peak, missing: [...missing] };
}
