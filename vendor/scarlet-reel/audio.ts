import { assetUrl } from "./assetPath";
import { mediaPreloader } from "./mediaPreload";
import type { AudioTrack } from "./types";

export type MixChannel = "master" | "music" | "ambient" | "voice" | "sfx";

/**
 * Procedural pulp-noir sound engine. Everything is synthesized through the
 * Web Audio API; the AudioTrack contract allows dropping in mp3 files later.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  /** False until the first user gesture — gates AudioContext creation so synth
   * audio never starts (and warns) before the player has interacted. */
  private unlocked = false;
  private buses: Partial<Record<MixChannel, GainNode>> = {};
  volumes: Record<MixChannel, number> = { master: 0.8, music: 0.8, ambient: 0.45, voice: 0.9, sfx: 0.75 };

  private ambientHandle: { gain: GainNode; stop: () => void } | null = null;
  private ambientId: string | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  readonly registry: AudioTrack[] = [
    { id: "rain", label: "Night Rain", kind: "synth", preset: "rain" },
    { id: "jazz", label: "Smoky Jazz Pad", kind: "synth", preset: "jazz" },
    { id: "drone", label: "Low Drone", kind: "synth", preset: "drone" },
    { id: "tension", label: "Tension Strings", kind: "synth", preset: "tension" },
  ];

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    // Don't create (or resume) the AudioContext until a real user gesture has
    // unlocked sound — creating it at page load triggers the browser's
    // "AudioContext was not allowed to start" warning and leaves synth audio
    // (ambience/SFX) silent under a strict autoplay policy.
    if (!this.unlocked) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = this.volumes.master;
      master.connect(this.ctx.destination);
      this.buses.master = master;
      (["music", "ambient", "voice", "sfx"] as MixChannel[]).forEach((ch) => {
        const g = this.ctx!.createGain();
        g.gain.value = this.volumes[ch];
        g.connect(master);
        this.buses[ch] = g;
      });
    }
    if (this.ctx.state === "suspended" && !this.rendering) void this.ctx.resume();
    return this.ctx;
  }

  /* ------------------------- offline rendering ------------------------- *
   * The animatic exporter (tools/export-animatic.mjs) rebuilds the film's mix
   * outside the browser. The recorded sounds are files it can read itself;
   * the synthesised ones (the rain bed, the transition thumps) are made here,
   * by this engine's own code pointed at an OfflineAudioContext, so the export
   * sounds exactly like the game. */
  private rendering = false;

  /** Runs `play` with the engine drawing into a fresh OfflineAudioContext (every bus is its output, at gain 1) and
   *  returns what it made. `play` may also build nodes itself on the context and output it is given. */
  async renderOffline(seconds: number, play: (ctx: BaseAudioContext, out: AudioNode) => void, sampleRate = 48000): Promise<AudioBuffer> {
    const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate);
    const out = off.createGain();
    out.connect(off.destination);
    const saved = { ctx: this.ctx, buses: this.buses, unlocked: this.unlocked, noise: this.noiseBuffer };
    this.ctx = off as unknown as AudioContext;
    this.buses = { master: out, music: out, ambient: out, voice: out, sfx: out };
    this.unlocked = true;
    this.noiseBuffer = null;
    this.rendering = true;
    try {
      play(off, out);
    } finally {
      this.ctx = saved.ctx;
      this.buses = saved.buses;
      this.unlocked = saved.unlocked;
      this.noiseBuffer = saved.noise;
      this.rendering = false;
    }
    return off.startRendering();
  }

  /** A built-in ambient preset ("rain"…) rendered for `seconds`, before the ambient bus's gain. */
  renderAmbient(id: string, seconds: number): Promise<AudioBuffer> {
    return this.renderOffline(seconds, (ctx, out) => {
      this.buildAmbient(ctx as AudioContext, id, out);
    });
  }

  unlock() {
    this.unlocked = true;
    this.ensure();
    // Ambient that was requested before the context existed (e.g. the menu's
    // rain fallback) gets applied now that sound is allowed.
    this.applyAmbient();
    // A prose clip the autoplay policy rejected at scene entry (Studio
    // playtest tabs, strict webviews) gets one more chance on a real gesture.
    this.retryPendingNarration();
  }

  setVolume(ch: MixChannel, v: number) {
    this.volumes[ch] = v;
    const ctx = this.ctx;
    const bus = this.buses[ch];
    if (ctx && bus) bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    // A recorded voice clip (playClip) is a raw Audio() outside the WebAudio
    // buses, so re-apply its effective volume live when voice/master change.
    if ((ch === "voice" || ch === "master") && this.clip) {
      this.clip.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    }
    // Same for in-flight effects: they are plain Audio elements outside the
    // WebAudio graph, so a live sfx/master change must be applied by hand.
    if (ch === "sfx" || ch === "master") {
      for (const el of this.sfxPlaying) {
        el.volume = Math.min(1, this.volumes.sfx * this.volumes.master);
      }
    }
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  private blip(freq: number, type: OscillatorType, dur: number, vol: number, delay = 0, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.buses.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, freq: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(this.buses.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  click() { this.blip(1400, "square", 0.045, 0.06, 0, 700); }
  tick() { this.blip(2100 + Math.random() * 500, "square", 0.018, 0.022); }
  hover() { this.blip(900, "sine", 0.05, 0.03); }
  pickup() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip(f, "triangle", 0.28, 0.12, i * 0.07));
  }
  combine() {
    [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => this.blip(f, "triangle", 0.4, 0.13, i * 0.06));
    this.noiseHit(0.35, 0.08, 3200, 0.28);
  }
  stinger() {
    [110, 220, 261.63, 311.13].forEach((f) => this.blip(f, "sawtooth", 1.4, 0.09));
    this.noiseHit(0.8, 0.12, 400);
  }
  success() {
    [523.25, 659.25, 880, 1318.5].forEach((f, i) => this.blip(f, "sine", 0.5, 0.12, i * 0.09));
  }
  fail() {
    this.blip(196, "sawtooth", 0.4, 0.12, 0, 92);
    this.blip(139, "sawtooth", 0.5, 0.1, 0.12, 70);
  }
  lockTick() { this.blip(3000, "square", 0.02, 0.05); }
  /** A short, weighty "thunk" — a press of pressure landing on a suspect. */
  press() {
    this.blip(160, "sine", 0.22, 0.16, 0, 70);
    this.noiseHit(0.5, 0.06, 220);
  }
  /** A soft, low exhale — the suspect steadies themselves after you hesitate. */
  steady() {
    this.blip(220, "sine", 0.5, 0.06, 0, 120);
    this.blip(180, "sine", 0.5, 0.05, 0.05, 100);
  }
  /** A tense two-beat heartbeat thump for quick-time prompts — a deep, muted
   * "lub-dub" that reads as a pulse rather than a sting. Each beat is a soft
   * low sine thump followed by a quieter one, so it feels like a heart under
   * pressure instead of a warning bell. Routed through the sfx bus. */
  heartbeat() {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const bus = this.buses.sfx; // capture so the inner closure stays typed
    const t0 = ctx.currentTime + 0.02;
    const thump = (at: number, freq: number, vol: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.6), at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    thump(t0, 72, 0.28, 0.22);          // "lub"
    thump(t0 + 0.17, 58, 0.2, 0.26);    // "dub"
  }
  /** A deep, low rolling thunder rumble for the storm. Built so it reads as
   * distant thunder rather than a single clap: a soft low thud for the onset, a
   * sub-bass pressure swell, a low-passed noise bed whose filter and volume are
   * slowly wobbled by LFOs (the "rolling" texture), and one to four delayed,
   * quieter rumbles rolling in behind it. Every parameter — intensity, length,
   * frequencies, LFO rates, the number of aftershocks — is randomized per
   * strike, so no two rolls sound the same. Routed through the sfx bus so the
   * Effects mixer controls it. */
  thunder() {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + 0.05;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // Per-strike intensity — every roll lands at a different volume.
    const strength = rand(0.45, 0.95);
    // One long rolling rumble, 3–6 seconds.
    const rumbleDur = rand(3, 6);

    // 1) Soft low onset — a short burst of dark noise (not a bright crack).
    {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(120, 220), t0);
      lp.frequency.exponentialRampToValueAtTime(rand(60, 90), t0 + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.2, 0.36) * strength, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0);
      src.stop(t0 + 0.55);
    }

    // 2) Sub-bass pressure body — a sine that sinks slowly, swelling then fading.
    {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(rand(64, 80), t0);
      o.frequency.exponentialRampToValueAtTime(rand(24, 30), t0 + rumbleDur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.26, 0.4) * strength, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + rumbleDur);
      o.connect(g).connect(this.buses.sfx);
      o.start(t0);
      o.stop(t0 + rumbleDur + 0.1);
    }

    // 3) Rolling low rumble bed — low-passed noise whose filter frequency and
    //    volume are wobbled by slow LFOs, so it swells in waves.
    {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(140, 220), t0);
      lp.frequency.exponentialRampToValueAtTime(rand(38, 60), t0 + rumbleDur);
      // Filter wobble — the slow "rolling" motion of the rumble.
      const filterLfo = ctx.createOscillator();
      filterLfo.frequency.value = rand(0.25, 0.7);
      const filterLfoG = ctx.createGain();
      filterLfoG.gain.value = rand(25, 60);
      filterLfo.connect(filterLfoG).connect(lp.frequency);
      filterLfo.start(t0);
      filterLfo.stop(t0 + rumbleDur);
      // Volume envelope + a slow amplitude wobble that fades with the rumble.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.3, 0.48) * strength, t0 + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + rumbleDur);
      const ampLfo = ctx.createOscillator();
      ampLfo.frequency.value = rand(0.2, 0.5);
      const ampLfoG = ctx.createGain();
      ampLfoG.gain.setValueAtTime(0.0001, t0);
      ampLfoG.gain.linearRampToValueAtTime(rand(0.04, 0.1) * strength, t0 + 0.3);
      ampLfoG.gain.setValueAtTime(rand(0.04, 0.1) * strength, t0 + rumbleDur - 0.4);
      ampLfoG.gain.linearRampToValueAtTime(0.0001, t0 + rumbleDur);
      ampLfo.connect(ampLfoG).connect(g.gain);
      ampLfo.start(t0);
      ampLfo.stop(t0 + rumbleDur);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0);
      src.stop(t0 + rumbleDur + 0.05);
    }

    // 4) Rolling aftershocks — 1–4 delayed low rumbles behind the main one.
    const aftershocks = Math.floor(rand(1, 5));
    for (let i = 0; i < aftershocks; i++) {
      const delay = 0.4 + rand(0.2, 0.6) + i * rand(0.5, 1.1);
      const dur = rand(1.6, 3.2);
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(90, 150), t0 + delay);
      lp.frequency.exponentialRampToValueAtTime(rand(32, 48), t0 + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(rand(0.08, 0.2) * strength, t0 + delay + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0 + delay);
      src.stop(t0 + delay + dur + 0.05);
    }
  }
  unlockClunk() {
    this.noiseHit(0.2, 0.16, 900);
    this.blip(180, "square", 0.18, 0.12, 0.03, 120);
  }
  dialTurn() { this.blip(2400, "square", 0.015, 0.03); }
  stringSnap() { this.blip(660, "triangle", 0.14, 0.12, 0, 220); }

  /* ------------------------- transition sound design -------------------------
   * Scene transitions used to be silent — the move landed visually and the ear
   * got nothing. This is a fully synthesized sound bed for them (zero asset
   * budget): a filtered-noise WHOOSH that swells across the cover and an
   * impact that lands exactly when the plate swaps. Both halves are scheduled
   * on the AudioContext clock against `coverSec`, so the thud hits the swap
   * instant instead of chasing it from a timer. Everything rides the sfx bus,
   * so the mixer's Effects fader already ducks it with every other sound. */

  /** Band-passed noise sweep — the body of a whoosh/swish. The filter glides
   * `from`→`to` Hz across `dur` and the gain swells late (default: 70% in)
   * so the air "arrives" with the card instead of preceding it. `pan` starts
   * the sweep off-axis (directional moves read directional in the ears) and
   * settles to centre at the landing. */
  private noiseSweep(
    t0: number,
    dur: number,
    from: number,
    to: number,
    vol: number,
    opts?: { q?: number; pan?: number; attack?: number }
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = opts?.q ?? 1.1;
    bp.frequency.setValueAtTime(Math.max(20, from), t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = ctx.createGain();
    const atk = opts?.attack ?? dur * 0.7;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.001, vol), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g);
    let tail: AudioNode = g;
    if (opts?.pan && typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan)), t0);
      p.pan.linearRampToValueAtTime(0, t0 + dur);
      g.connect(p);
      tail = p;
    }
    tail.connect(this.buses.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** A pitched-down sine — the body of a cinematic impact. Sits under the
   * noise sweeps like a cut-edged bump does under a picture change. */
  private subHit(t0: number, f0: number, f1: number, dur: number, vol: number) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol), t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.buses.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** Fire the sound bed for a scene transition. `kind` is the resolved
   * recipe (see `resolveTransitionSound` in this module); `coverSec` is how
   * long the cover runs — the impact is scheduled `coverSec` later, at the
   * swap. `dir` is the direction the card travels (directional whooshes pan
   * that way). Safe to call before the audio unlock: everything no-ops. */
  transitionSfx(kind: TransitionSoundKind, coverSec: number, dir: "left" | "right" | "up" | "down" | null = null) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx || kind === "none") return;
    const dur = Math.max(0.18, Math.min(2.4, coverSec));
    const t0 = ctx.currentTime + 0.012; // a hair of breathing room, still "on" the click
    const land = t0 + dur; // the swap instant
    const pan = dir === "left" ? -0.7 : dir === "right" ? 0.7 : 0;
    const vertical = dir === "up" || dir === "down";
    switch (kind) {
      case "whoosh": {
        // A slide: wide air travelling across the field, a cushioned land.
        this.noiseSweep(t0, dur, vertical ? 1300 : 1900, 420, 0.15, { q: 0.8, pan: vertical ? 0 : pan * 0.9 });
        this.subHit(land - 0.02, 150, 46, 0.3, 0.2); // soft cushion, not a wall-hit
        this.noiseSweep(land, 0.16, 600, 180, 0.05, { q: 1.6 }); // settle scuff
        break;
      }
      case "swish": {
        // A wipe/iris: tighter, faster, brighter — a card passing close by.
        this.noiseSweep(t0, dur * 0.82, vertical ? 2100 : 2800, 700, 0.12, { q: 1.7, pan: vertical ? 0 : pan * 0.7 });
        this.noiseSweep(land - dur * 0.12, 0.12, 2400, 800, 0.07, { q: 2.4 }); // edge tick
        this.subHit(land, 120, 50, 0.18, 0.12);
        break;
      }
      case "riser": {
        // A zoom: air AND pitch climb through the cover, then a hard sub-drop.
        this.noiseSweep(t0, dur, 500, 3200, 0.11, { q: 1.5, attack: dur * 0.86 });
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(62, t0);
        o.frequency.exponentialRampToValueAtTime(210, land);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(260, t0);
        lp.frequency.exponentialRampToValueAtTime(900, land);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.09, land);
        g.gain.exponentialRampToValueAtTime(0.0001, land + 0.1);
        o.connect(lp).connect(g).connect(this.buses.sfx);
        o.start(t0);
        o.stop(land + 0.15);
        this.subHit(land, 210, 34, 0.5, 0.3); // the punch
        this.noiseSweep(land, 0.22, 2600, 320, 0.08, { q: 1.2 }); // debris
        break;
      }
      case "thump": {
        // Just the hit — fade-to-black landings, or an author who wants weight
        // without any air. A descending body plus a soft cushion of noise.
        this.noiseSweep(t0 + dur * 0.4, dur * 0.6, 420, 140, 0.05, { q: 0.6 });
        this.subHit(land, 160, 40, 0.42, 0.24);
        break;
      }
      case "zap": {
        // A glitch: staccato square bursts stuttered across the cover in
        // steps(1) rhythm, noise mush underneath, a clipped digital crack at
        // the land (no smooth sub — a glitch never resolves cleanly).
        const steps = Math.max(3, Math.round(dur * 12));
        for (let i = 0; i < steps; i++) {
          if (Math.random() < 0.35) continue; // the gaps are the rhythm
          const f = 900 + Math.random() * 2600;
          this.blip(f, "square", 0.02 + Math.random() * 0.03, 0.05, 0.012 + (i / steps) * dur * 0.92, f * 0.5);
        }
        this.noiseSweep(t0, dur * 0.9, 2600, 900, 0.06, { q: 0.7 });
        this.subHit(land, 95, 44, 0.16, 0.16);
        this.noiseHit(0.1, 0.09, 3200, dur * 0.9 + 0.012); // the crack
        break;
      }
      case "sizzle": {
        // A burn: crackle pops over a warm low swell, then a soft flam as the
        // frame cools. Fire is texture, not impact.
        this.noiseSweep(t0, dur, 220, 90, 0.08, { q: 0.6, attack: dur * 0.55 });
        for (let i = 0; i < 10; i++) {
          this.blip(2200 + Math.random() * 3800, "triangle", 0.014, 0.02 + Math.random() * 0.025, 0.012 + Math.random() * dur);
        }
        this.subHit(land, 130, 48, 0.3, 0.14);
        this.noiseHit(0.28, 0.06, 1500, dur * 0.96 + 0.012);
        break;
      }
      case "swell": {
        // A plain fade: barely-there air, no impact — a dissolve shouldn't
        // announce itself, it just changes the pressure in the room.
        this.noiseSweep(t0, dur, 800, 260, 0.045, { q: 0.5, attack: dur * 0.6 });
        break;
      }
      default:
        break;
    }
  }

  /* ------------------------- ambience ------------------------- */

  setAmbient(id: string | null) {
    if (id === this.ambientId && this.ambientHandle) return;
    this.ambientId = id;
    this.applyAmbient();
  }

  /** Build/teardown the ambient graph against the current `ambientId`. No-ops
   * until the AudioContext exists (i.e. after the first user gesture). */
  private applyAmbient() {
    const id = this.ambientId;
    const ctx = this.ensure();
    if (!ctx || !this.buses.ambient) return;
    if (this.ambientHandle) {
      const old = this.ambientHandle;
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
      window.setTimeout(() => old.stop(), 2200);
      this.ambientHandle = null;
    }
    if (!id || id === "none") return;
    const handle = this.buildMix(ctx, id);
    if (handle) {
      handle.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      handle.gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
      this.ambientHandle = handle;
    }
  }

  /** An ambient id may layer several parts with "+": a built-in preset ("rain") and recorded loops ("file:/film/sfx/amb-hive.mp3"). */
  private buildMix(ctx: AudioContext, id: string): { gain: GainNode; stop: () => void } | null {
    const parts = id.split("+").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1 && !parts[0].startsWith("file:")) return this.buildAmbient(ctx, parts[0]);
    const mix = ctx.createGain();
    mix.connect(this.buses.ambient!);
    const stops: (() => void)[] = [];
    let dead = false;
    for (const part of parts) {
      if (part.startsWith("file:")) {
        const url = part.slice(5);
        void fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
          if (dead) return;
          const src = ctx.createBufferSource();
          const g = ctx.createGain();
          src.buffer = buf; src.loop = true; g.gain.value = 0.8;
          src.connect(g).connect(mix); src.start();
          stops.push(() => { try { src.stop(); } catch { /* noop */ } });
        }).catch(() => undefined);
      } else {
        const h = this.buildAmbient(ctx, part, mix);
        if (h) stops.push(h.stop);
      }
    }
    return { gain: mix, stop: () => { dead = true; stops.forEach((fn) => fn()); } };
  }

  private buildAmbient(ctx: AudioContext, id: string, dest?: AudioNode): { gain: GainNode; stop: () => void } | null {
    const bus = dest ?? this.buses.ambient!;
    const out = ctx.createGain();
    out.connect(bus);
    const stops: (() => void)[] = [];
    const t = ctx.currentTime;

    const noise = (freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass") => {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(out);
      src.start(t);
      stops.push(() => { try { src.stop(); } catch { /* noop */ } });
      return { f, g };
    };
    const tone = (freq: number, type: OscillatorType, vol: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(out);
      o.start(t);
      stops.push(() => { try { o.stop(); } catch { /* noop */ } });
      return { o, g };
    };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start(t);
      stops.push(() => { try { o.stop(); } catch { /* noop */ } });
    };

    switch (id) {
      case "rain": {
        const r = noise(1400, 0.4, 0.16);
        lfo(0.11, 300, r.f.frequency);
        noise(240, 0.6, 0.1, "lowpass");
        break;
      }
      case "jazz": {
        const chord = [110, 130.81, 164.81, 196];
        chord.forEach((f, i) => {
          const v = tone(f, "triangle", 0.028, i % 2 ? 4 : -3);
          lfo(0.07 + i * 0.013, 0.012, v.g.gain);
        });
        noise(4200, 0.3, 0.012, "highpass"); // vinyl hiss
        break;
      }
      case "drone": {
        const a = tone(55, "sine", 0.09);
        tone(58, "sine", 0.07);
        lfo(0.05, 4, a.o.frequency);
        break;
      }
      case "tension": {
        const s = tone(65.4, "sawtooth", 0.05);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 300;
        s.g.disconnect();
        s.g.connect(f).connect(out);
        lfo(0.09, 180, f.frequency);
        tone(98, "sine", 0.045, 6);
        break;
      }
      default:
        return null;
    }
    return { gain: out, stop: () => stops.forEach((fn) => fn()) };
  }

  /* ------------------------- voice ducking -------------------------
   * Sine-duck the scene music the moment dialogue or narration starts. The
   * envelope is a half-sine (flat at both ends), so the soundtrack dips
   * smoothly instead of cutting. While speech is active the floor holds;
   * the release waits for a beat of silence, so a flowing dialogue scene
   * doesn't pump the music between lines. The duck factor is exposed
   * (duckFactor + onDuckChange) because the scene music is a raw
   * HTMLAudioElement outside the WebAudio buses — the game multiplies it
   * into the track's volume and re-applies it as the envelope steps. */

  /** The option: when off, the music is never ducked. */
  voiceDuckEnabled = true;
  /** 1 = no duck; while ducked this sits at DUCK_FLOOR. The game multiplies
   *  it into the scene-music element's volume. */
  duckFactor = 1;
  /** Notified on every envelope step so the game can re-apply the live
   *  track's volume (the ramp is stepped, not a single scheduled curve). */
  onDuckChange: ((f: number) => void) | null = null;
  /** The floor: music sits at 35% of its volume under voice (~-9 dB). */
  static readonly DUCK_FLOOR = 0.35;
  private static readonly DUCK_ATTACK_MS = 450;
  private static readonly DUCK_RELEASE_MS = 900;
  /** Silence to hold before releasing, so line-to-line gaps don't pump. */
  private static readonly DUCK_GRACE_MS = 1100;
  private duckTimer: ReturnType<typeof setInterval> | null = null;
  private duckReleaseTimer: ReturnType<typeof setTimeout> | null = null;

  setVoiceDuckEnabled(on: boolean) {
    if (this.voiceDuckEnabled === on) return;
    this.voiceDuckEnabled = on;
    if (!on) {
      this.clearDuckRelease();
      this.duckRamp(1, AudioEngine.DUCK_RELEASE_MS);
    }
  }

  /** Voice just (re)started: dip to the floor on a half-sine attack. */
  voiceStarted() {
    if (!this.voiceDuckEnabled) return;
    this.clearDuckRelease();
    this.duckRamp(AudioEngine.DUCK_FLOOR, AudioEngine.DUCK_ATTACK_MS);
  }

  /** Voice ended (line finished / cancelled / dismissed): release to 1
   *  after a grace of silence. A newer voiceStarted() cancels the pending
   *  release, so consecutive lines hold the floor. */
  voiceEnded() {
    if (!this.voiceDuckEnabled) return;
    this.clearDuckRelease();
    this.duckReleaseTimer = setTimeout(() => {
      this.duckReleaseTimer = null;
      this.duckRamp(1, AudioEngine.DUCK_RELEASE_MS);
    }, AudioEngine.DUCK_GRACE_MS);
  }

  private clearDuckRelease() {
    if (this.duckReleaseTimer !== null) {
      clearTimeout(this.duckReleaseTimer);
      this.duckReleaseTimer = null;
    }
  }

  /** Step a half-sine ramp of the duck factor — eased = sin(π/2 · p) is
   *  flat at both ends — notifying onDuckChange at each step. */
  private duckRamp(to: number, ms: number) {
    if (this.duckTimer !== null) {
      clearInterval(this.duckTimer);
      this.duckTimer = null;
    }
    if (Math.abs(to - this.duckFactor) < 0.002) {
      this.duckFactor = to;
      this.onDuckChange?.(to);
      return;
    }
    const from = this.duckFactor;
    const start = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / Math.max(1, ms));
      const eased = Math.sin((p * Math.PI) / 2);
      this.duckFactor = p >= 1 ? to : from + (to - from) * eased;
      this.onDuckChange?.(this.duckFactor);
      if (p >= 1) {
        if (this.duckTimer !== null) clearInterval(this.duckTimer);
        this.duckTimer = null;
      }
    };
    step();
    this.duckTimer = setInterval(step, 33);
  }

  /* ------------------------- narration ------------------------- */

  /**
   * SPEECH KEEPALIVE — the Chromium "long utterance dies at ~15 seconds" bug.
   *
   * Chromium's speech-dispatcher bridge silently stops a synthesis job that
   * has been running for roughly 15s. `onend` never fires, so nothing in the
   * app can tell the line was truncated: the narration simply cuts out
   * mid-sentence and the music duck stays down until something else speaks.
   *
   * The only reliable workaround is to poke the queue while it is speaking:
   * a paired pause()/resume() resets the watchdog without audibly seaming
   * the audio. We tick every 10s (comfortably inside the ~15s window) and
   * only while `speaking` is true — poking an empty queue on some builds
   * makes a LATER utterance start paused, which is a much worse failure.
   *
   * Any line under ~14s never trips the bug, but the tick is harmless there
   * and the guard below stops it as soon as the queue drains.
   */
  private speechKeepAlive: ReturnType<typeof setInterval> | null = null;

  private startSpeechKeepAlive() {
    this.stopSpeechKeepAlive();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.speechKeepAlive = setInterval(() => {
      const s = window.speechSynthesis;
      // Queue drained (or the line was cancelled) — stop poking.
      if (!s.speaking) {
        this.stopSpeechKeepAlive();
        return;
      }
      // Don't fight a deliberate pause (none today, but be defensive).
      if (s.paused) return;
      try {
        s.pause();
        s.resume();
      } catch {
        /* a browser that refuses the poke is one that doesn't need it */
      }
    }, 10000);
  }

  private stopSpeechKeepAlive() {
    if (this.speechKeepAlive !== null) {
      clearInterval(this.speechKeepAlive);
      this.speechKeepAlive = null;
    }
  }

  private speechEpoch = 0;

  speak(text: string, persona?: string, override?: { voiceName?: string; pitch?: number; rate?: number }) {
    this.stopSpeech(); // A TTS line supersedes recorded voice too.
    const epoch = this.speechEpoch;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (this.volumes.voice <= 0.01) return;
    const u = new SpeechSynthesisUtterance(text);
    const personaHash = persona ? [...persona].reduce((sum, char) => sum + char.charCodeAt(0), 0) : 0;
    u.rate = override?.rate ?? 0.88;
    u.pitch = override?.pitch ?? (persona ? 0.72 + (personaHash % 5) * 0.08 : 0.72);
    u.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) => v.lang.startsWith("en"));
    const narrator =
      voices.find((v) => /samantha|victoria|zira|aria|jenny/i.test(v.name)) ??
      english[0];
    const chosen = override?.voiceName ? voices.find((v) => v.name === override.voiceName) : undefined;
    const pick = chosen ?? (persona && english.length ? english[personaHash % english.length] : narrator);
    if (pick) u.voice = pick;
    // Duck the music for the life of this line. A cancel() from a newer
    // line surfaces as a 'canceled' error — that line's own voiceStarted()
    // already re-armed the duck, so only a natural end releases it.
    u.onend = () => {
      if (this.speechEpoch !== epoch) return;
      this.stopSpeechKeepAlive();
      this.voiceEnded();
    };
    u.onerror = (e) => {
      if (this.speechEpoch !== epoch) return;
      this.stopSpeechKeepAlive();
      if (e.error !== "canceled") this.voiceEnded();
    };
    window.speechSynthesis.speak(u);
    this.startSpeechKeepAlive();
    this.voiceStarted();
  }

  /** Play a pre-recorded MP3 voice line (overrides TTS when set on a beat). */
  private clip: HTMLAudioElement | null = null;
  /**
   * A prose clip whose play() was rejected by the autoplay policy. Kept armed
   * so the next real user gesture (unlock() on any pointerdown) can retry it —
   * a narration blocked at scene entry used to be silently unrecoverable.
   * Cleared by stopSpeech() so a deliberate dismissal (Continue) always wins
   * over a pending retry.
   */
  private pendingNarration: { el: HTMLAudioElement; retrying: boolean } | null = null;

  private clearPendingNarration() {
    this.pendingNarration = null;
  }

  private retryPendingNarration() {
    const pending = this.pendingNarration;
    if (!pending || pending.retrying) return;
    pending.retrying = true;
    const el = pending.el;
    el.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    // CRITICAL: this runs synchronously inside the user gesture (unlock() is
    // called from a pointerdown). Retrying via a setTimeout would call play()
    // outside the activation window and be blocked again — transient
    // activation only covers the current event dispatch, not timers.
    void el
      .play()
      .then(() => {
        if (this.clip !== el) { el.pause(); return; }
        this.clearPendingNarration();
        this.voiceStarted();
      })
      .catch((err) => {
        if (this.clip !== el) return;
        const name = (err as DOMException | undefined)?.name;
        if (name === "NotAllowedError" || name === "AbortError") {
          // Still blocked — stay armed for the next gesture.
          if (this.pendingNarration === pending) pending.retrying = false;
        } else {
          // Not an autoplay problem: give up on this clip.
          if (this.clip === el) this.clip = null;
          this.clearPendingNarration();
          console.warn("Recorded narration still couldn't be played.", err);
        }
      });
  }

  /* ------------------------------------------------------------------ *
   *  SOUND EFFECTS FROM A FILE                                          *
   *                                                                     *
   *  Distinct from playClip() on purpose. playClip is the VOICE channel:  *
   *  it stops speech, ducks the music and holds the narration slot, which *
   *  is right for a recorded line and wrong for a door creak. An effect   *
   *  must be able to fire WHILE a line is being read, overlap with itself *
   *  (two shell casings), and never interrupt anything.                   *
   *                                                                       *
   *  So each call gets its own Audio element on the sfx mix, fire and     *
   *  forget. Concurrency is capped so a mashed hotspot can't spawn a      *
   *  hundred decoders.                                                    *
   * ------------------------------------------------------------------ */
  private sfxPlaying = new Set<HTMLAudioElement>();
  private static readonly MAX_CONCURRENT_SFX = 8;

  /** Play a one-shot sound effect from a URL on the sfx bus.
   *  `volume` is 0..1 relative to the sfx channel (default 1). */
  playSfx(url: string, volume = 1): void {
    if (!url) return;
    // Too many at once = audio mush and decoder pressure. Drop the oldest.
    if (this.sfxPlaying.size >= AudioEngine.MAX_CONCURRENT_SFX) {
      const oldest = this.sfxPlaying.values().next().value;
      if (oldest) {
        try {
          oldest.pause();
        } catch {
          /* already gone */
        }
        this.sfxPlaying.delete(oldest);
      }
    }
    let el: HTMLAudioElement;
    try {
      el = new Audio(assetUrl(url));
    } catch {
      return;
    }
    el.preload = "auto";
    el.volume = Math.min(1, Math.max(0, volume) * this.volumes.sfx * this.volumes.master);
    this.sfxPlaying.add(el);
    const done = () => {
      this.sfxPlaying.delete(el);
      el.removeEventListener("ended", done);
      el.removeEventListener("error", done);
    };
    el.addEventListener("ended", done);
    el.addEventListener("error", done);
    // A blocked effect is not worth surfacing: unlike narration, a missing
    // door creak should never interrupt play or log noise at the player.
    void el.play().catch(() => done());
  }

  /** Stop every in-flight sound effect (scene change, mute). */
  stopSfx(): void {
    for (const el of this.sfxPlaying) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    this.sfxPlaying.clear();
  }

  private clipEndHandler: (() => void) | null = null;

  playClip(url: string, prepared?: HTMLAudioElement): Promise<boolean> {
    this.stopSpeech();
    const a = prepared ?? mediaPreloader.takeAudio(url) ?? new Audio(assetUrl(url));
    a.preload = "auto";
    a.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    this.clip = a;
    // Release the music duck when this clip finishes (the prepared element
    // may be reused for a later clip — swap the handler, don't stack them).
    const endHandler = () => { if (this.clip === a) this.voiceEnded(); };
    this.clipEndHandler = endHandler;
    a.addEventListener("ended", endHandler);
    // Opening prose can be "primed" inside the user's Play click. If it is
    // already running by the time the scene mounts, adopt it instead of
    // restarting it — restarting would make the first words stutter or replay.
    if (!a.paused && !a.ended) {
      this.voiceStarted();
      return Promise.resolve(true);
    }
    if (a.ended) a.currentTime = 0;
    return a
      .play()
      .then(() => {
        // An earlier blocked attempt for this same clip is now obsolete.
        if (this.clip !== a) { a.pause(); return false; }
        this.clearPendingNarration();
        this.voiceStarted();
        return true;
      })
      .catch((err) => {
        if (this.clip !== a) return false; // A newer line / dismissal won.
        // Don't fail silently: a missing file or a browser autoplay block used
        // to look exactly like "the prose audio didn't play". Keep the UI calm,
        // but leave a useful breadcrumb in dev tools.
        const name = (err as DOMException | undefined)?.name;
        if (this.clip === a) {
          if (name === "NotAllowedError" || name === "AbortError") {
            // Autoplay policy: keep the clip armed so the next real user
            // gesture (unlock() on any pointerdown) can retry it.
            this.pendingNarration = { el: a, retrying: false };
          } else {
            this.clip = null;
          }
        }
        if (name !== "NotAllowedError" && name !== "AbortError") console.warn("Recorded narration couldn't be played.", err);
        return false;
      });
  }

  /**
   * Tidy up after a line WITHOUT truncating one that is still talking.
   *
   * Callers that are merely "done displaying" (a caption bar fading on its
   * own timer) want the music duck released and the slot freed, but must not
   * chop the narration in half — the spoken line is usually much longer than
   * the subtitle's dwell time. If speech or a clip is still running, this
   * leaves it alone; their own `onend`/`ended` handlers release the duck.
   *
   * Use `stopSpeech()` when the line is genuinely superseded (new beat, scene
   * change, player pressed Continue).
   */
  /** True while a TTS line or a recorded voice clip is still sounding.
   *  Lets auto-readers hold the current line until the narration finishes
   *  instead of chopping it when the next subtitle arrives. */
  speechActive(): boolean {
    const speaking =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending);
    const clipPlaying = !!this.clip && !this.clip.paused && !this.clip.ended;
    return speaking || clipPlaying;
  }

  stopSpeechIfIdle() {
    if (this.speechActive()) return;
    this.stopSpeech();
  }

  stopSpeech() {
    this.speechEpoch++;
    this.stopSpeechKeepAlive();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    // A pending autoplay retry belongs to the clip being dismissed — cancel it
    // so an old narration can't start after the player moved on.
    this.clearPendingNarration();
    if (this.clip) {
      if (this.clipEndHandler) this.clip.removeEventListener("ended", this.clipEndHandler);
      this.clipEndHandler = null;
      this.clip.pause();
      this.clip = null;
    }
    // Dismissed voice releases the music duck (after the grace, so a
    // deliberate "next line" isn't followed by a dip/release flicker).
    this.voiceEnded();
  }
}

/* -------------------------------------------------------------------- *
 *  TRANSITION SOUND MAPPING (pure — no AudioContext, probe-testable)   *
 * -------------------------------------------------------------------- */

/** The resolved recipe names the AudioEngine knows. "auto" is never resolved
 *  out of here as anything other than a mapping — see resolveTransitionSound. */
export type TransitionSoundKind = "none" | "whoosh" | "swish" | "riser" | "thump" | "sizzle" | "zap" | "swell";

/** The authored option (undefined = "auto"). */
export type TransitionSoundOption = "auto" | TransitionSoundKind;

/**
 * Resolve what a scene's transition should SOUND like:
 *   - an explicit author pick wins (transitionSound !== "auto");
 *   - otherwise the transition TYPE implies the recipe — the dramatic moves
 *     get air and weight, fades get a barely-there swell, and a cut is silent
 *     by definition (goToScene never even calls this for cuts).
 * Kept as a pure function so the table is testable without a browser.
 */
export function resolveTransitionSound(
  transition: string | undefined,
  override: TransitionSoundOption | undefined
): TransitionSoundKind {
  if (override && override !== "auto") return override;
  switch (transition) {
    case "slide-left":
    case "slide-right":
      return "whoosh";
    case "wipe-left":
    case "wipe-right":
    case "wipe-up":
    case "wipe-down":
    case "iris":
    case "iris-in":
      return "swish";
    case "zoom":
      return "riser";
    case "glitch":
      return "zap";
    case "burn":
      return "sizzle";
    case "fade-black":
      return "thump";
    case "fade":
      return "swell";
    case "cut":
    default:
      return "none";
  }
}

/** Which way the transition's card travels — the whoosh pans that way. */
export function transitionTravelDir(transition: string | undefined): "left" | "right" | "up" | "down" | null {
  switch (transition) {
    case "wipe-left":
    case "slide-left":
      return "left";
    case "wipe-right":
    case "slide-right":
      return "right";
    case "wipe-up":
      return "up";
    case "wipe-down":
      return "down";
    default:
      return null;
  }
}

export const audio = new AudioEngine();
