import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { glowColorWithAlpha, resolveLights } from "../../vendor/scarlet-reel/cinematic";
import type { CinematicSettings, SceneNode } from "../../vendor/scarlet-reel/types";
import { solveCubicBezier } from "../sequence/animate";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type ParticleKind =
  | "none"
  | "rain"
  | "drizzle"
  | "snow"
  | "smoke"
  | "storm"
  | "dust"
  | "fog"
  | "ember"
  | "ash"
  | "fireflies"
  | "motes";

export type ParticleConfig = NonNullable<SceneNode["particleConfig"]>;

export interface FrameParticlesProps {
  kind: ParticleKind;
  seed: string;
  timeSec: number;
  soundOn?: boolean;
  cinematic?: CinematicSettings;
  reducedMotion?: boolean;
  ambientAudio?: string;
  /** scene.particleConfig: density 0..2, opacity 0..1, wind 0..3; unset = 1 */
  config?: ParticleConfig;
}

/* ------------------------------------------------------------------ */
/*  Deterministic seeded PRNG (FNV-1a + Mulberry32 — no Math.random)   */
/* ------------------------------------------------------------------ */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createSeededRng(seed: string | number): () => number {
  let state = (typeof seed === "number" ? seed : hashSeed(String(seed))) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function posMod(n: number, span: number): number {
  const m = Math.max(1e-6, span);
  return ((n % m) + m) % m;
}

function wrapRange(val: number, min: number, max: number): number {
  return min + posMod(val - min, max - min);
}

function pingPongEaseInOut(cycles: number): number {
  const twoCycle = posMod(cycles, 2);
  const linear = twoCycle <= 1 ? twoCycle : 2 - twoCycle;
  return solveCubicBezier(0.42, 0, 0.58, 1, linear);
}

/* ------------------------------------------------------------------ */
/*  Analytical wind model (smooth velocity + exact integral)           */
/* ------------------------------------------------------------------ */
interface WindHarmonic {
  amp: number;
  omega: number;
  phase: number;
}

function buildWindHarmonics(seed: string, scale: number): WindHarmonic[] {
  const rng = createSeededRng(`${seed}:wind`);
  return [
    { amp: randRange(rng, 0.55, 0.95) * scale, omega: randRange(rng, 0.45, 0.72), phase: rng() * Math.PI * 2 },
    { amp: randRange(rng, 0.35, 0.65) * scale, omega: randRange(rng, 0.95, 1.38), phase: rng() * Math.PI * 2 },
    { amp: randRange(rng, 0.18, 0.35) * scale, omega: randRange(rng, 1.75, 2.35), phase: rng() * Math.PI * 2 },
  ];
}

function evalWind(harmonics: WindHarmonic[], timeSec: number): { vel: number; disp: number } {
  let vel = 0;
  let disp = 0;
  for (const h of harmonics) {
    vel += h.amp * Math.sin(h.omega * timeSec + h.phase);
    disp += (-h.amp / h.omega) * (Math.cos(h.omega * timeSec + h.phase) - Math.cos(h.phase));
  }
  return { vel, disp };
}

/* ------------------------------------------------------------------ */
/*  Pure closed-form particle position evaluator (exported for tests)  */
/* ------------------------------------------------------------------ */
export interface ComputedParticle {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  size: number;
  alpha: number;
  depth: number;
  hue?: number;
  glowColor?: string | null;
  glowBoost?: number;
}

export interface ComputeParticlesOptions {
  seed: string;
  timeSec: number;
  kind: ParticleKind;
  width: number;
  height: number;
  intensity?: number;
  wind?: number;
  subtle?: boolean;
  density?: number;
  cinematic?: CinematicSettings;
}

export function computeParticlePositions(opts: ComputeParticlesOptions): ComputedParticle[] {
  const {
    seed,
    timeSec,
    kind,
    width: rawW,
    height: rawH,
    intensity = 1,
    wind = 1,
    subtle = false,
    cinematic,
  } = opts;
  const w = Math.max(1, rawW);
  const h = Math.max(1, rawH);
  const t = Number.isFinite(timeSec) ? timeSec : 0;

  if (kind === "rain" || kind === "drizzle" || kind === "storm") {
    const effIntensity =
      opts.intensity !== undefined
        ? intensity
        : kind === "storm"
          ? 1.5
          : kind === "drizzle"
            ? 0.45
            : 1.2;
    const count = Math.max(0, Math.round(120 * effIntensity));
    const rng = createSeededRng(`${seed}:rain:${count}`);
    const harmonics = buildWindHarmonics(`${seed}:rain`, 1.05 * wind);
    const { vel: windVel, disp: windDisp } = evalWind(harmonics, t);
    const out: ComputedParticle[] = [];

    for (let i = 0; i < count; i += 1) {
      const u0 = rng();
      const v0 = rng();
      const vx = randRange(rng, -0.4, 0.4);
      const vy = randRange(rng, 7, 14);
      const len = randRange(rng, 8, 22);
      const baseAlpha = randRange(rng, 0.22, 0.6);
      const depth = rng();
      const marginTop = len + rng() * 80;

      const x = wrapRange(u0 * w + (vx * t + windDisp * depth) * 60, -30, w + 30);
      const y = wrapRange(v0 * h + vy * (0.6 + depth * 0.7) * 60 * t, -marginTop, h + len);
      const alpha = baseAlpha * (0.5 + depth * 0.5);
      const ang = windVel * 0.06 * depth;
      const x2 = x + Math.sin(ang) * len * 0.35;
      const y2 = y + len * (0.8 + depth * 0.4);

      out.push({
        x,
        y,
        x2,
        y2,
        size: 0.5 + depth * 0.9,
        alpha,
        depth,
      });
    }
    return out;
  }

  if (kind === "dust" || kind === "motes") {
    const baseDensity = opts.density ?? (kind === "motes" ? 54 : 88);
    const count = Math.max(0, subtle ? Math.round(baseDensity * 0.35) : Math.round(baseDensity));
    const rng = createSeededRng(`${seed}:${subtle ? "dust-sub" : "dust"}:${count}`);
    const lights = resolveLights(cinematic);
    const lightPts = lights.map((l) => ({
      x: (l.x / 100) * w,
      y: (l.y / 100) * h,
      r: (l.size / 100) * Math.max(w, h) * 0.6,
      intensity: l.intensity ?? 0.5,
      color: l.color ?? "#e8b23c",
    }));
    const out: ComputedParticle[] = [];

    for (let i = 0; i < count; i += 1) {
      const u0 = rng();
      const v0 = rng();
      const vx = randRange(rng, -0.18, 0.18);
      const vy = randRange(rng, -0.22, 0.22);
      const size = subtle ? randRange(rng, 0.4, 1.6) : randRange(rng, 0.6, 2.8);
      const baseAlpha = subtle ? randRange(rng, 0.06, 0.22) : randRange(rng, 0.12, 0.55);
      const phase = rng() * Math.PI * 2;
      const depth = rng();
      const twinkleSpeed = randRange(rng, 0.6, 2.2);
      const hueShift = randRange(rng, -6, 6);

      const turbIntX = (-0.08 * depth / 0.3) * (Math.cos(0.3 * t + phase) - Math.cos(phase));
      const turbIntY = (0.06 * depth / 0.22) * (Math.sin(0.22 * t + phase * 1.3) - Math.sin(phase * 1.3));

      const x = wrapRange(u0 * w + (vx * t + turbIntX) * (1 + depth * 0.6) * 60, -10, w + 10);
      const y = wrapRange(v0 * h + (vy * t + turbIntY) * (1 + depth * 0.5) * 60, -10, h + 10);

      const tw = 0.65 + 0.35 * Math.sin(t * twinkleSpeed + phase);
      let alpha = baseAlpha * tw;
      let glowColor: string | null = null;
      let glowBoost = 0;

      for (const lt of lightPts) {
        const dx = x - lt.x;
        const dy = y - lt.y;
        const dist = Math.hypot(dx, dy);
        if (dist < lt.r && lt.r > 0) {
          const fall = 1 - dist / lt.r;
          alpha += fall * lt.intensity * 0.9;
          glowBoost = Math.max(glowBoost, fall * lt.intensity);
          if (fall > 0.35) glowColor = lt.color;
        }
      }

      out.push({
        x,
        y,
        size,
        alpha: Math.min(1, alpha),
        depth,
        hue: 42 + hueShift,
        glowColor,
        glowBoost,
      });
    }
    return out;
  }

  if (kind === "snow") {
    const count = 140;
    const rng = createSeededRng(`${seed}:snow`);
    const harmonics = buildWindHarmonics(`${seed}:snow`, 0.45 * wind);
    const { disp: windDisp } = evalWind(harmonics, t);
    const out: ComputedParticle[] = [];

    for (let i = 0; i < count; i += 1) {
      const u0 = rng();
      const v0 = rng();
      const vx = randRange(rng, -0.3, 0.3);
      const vy = randRange(rng, 0.4, 1.4);
      const size = randRange(rng, 1, 3.2);
      const baseAlpha = randRange(rng, 0.35, 0.85);
      const wobble0 = rng() * Math.PI * 2;
      const wobbleSpeed = randRange(rng, 0.4, 1.6);

      const wobbleAtT = wobble0 + wobbleSpeed * t;
      const swayInt = (-0.9 / wobbleSpeed) * (Math.cos(wobbleAtT) - Math.cos(wobble0));
      const x = wrapRange(u0 * w + (vx * t + swayInt + windDisp) * 60, -20, w + 20);
      const y = wrapRange(v0 * h + vy * 60 * t, -10, h + 10);
      const alpha = baseAlpha * (0.7 + 0.3 * Math.sin(t + wobbleAtT));

      out.push({ x, y, size, alpha, depth: 0.5 });
    }
    return out;
  }

  if (kind === "fireflies") {
    const count = 22;
    const rng = createSeededRng(`${seed}:fireflies`);
    const out: ComputedParticle[] = [];

    for (let i = 0; i < count; i += 1) {
      const u0 = rng();
      const v0 = rng();
      const vx = randRange(rng, -0.25, 0.25);
      const vy = randRange(rng, -0.2, 0.2);
      const size = randRange(rng, 1.2, 2.6);
      const phase = rng() * Math.PI * 2;
      const pulse = randRange(rng, 0.8, 2.4);

      const wobX = (-0.18 / 0.2) * (Math.cos(0.2 * t + phase) - Math.cos(phase));
      const wobY = (0.14 / 0.18) * (Math.sin(0.18 * t + phase * 1.1) - Math.sin(phase * 1.1));
      const x = wrapRange(u0 * w + (vx * t + wobX) * 60, -10, w + 10);
      const y = wrapRange(v0 * h + (vy * t + wobY) * 60, -10, h + 10);
      const glow = 0.5 + 0.5 * Math.sin(t * pulse + phase);
      const alpha = Math.pow(glow, 3);

      out.push({ x, y, size, alpha, depth: 0.5 });
    }
    return out;
  }

  if (kind === "ember" || kind === "ash") {
    const isEmber = kind === "ember";
    const count = isEmber ? 42 : 58;
    const rng = createSeededRng(`${seed}:${kind}`);
    const fadeRate = isEmber ? 0.18 : 0.09;
    const out: ComputedParticle[] = [];

    for (let i = 0; i < count; i += 1) {
      const u0 = randRange(rng, 0.15, 0.85);
      const yStartExtra = randRange(rng, 5, 30);
      const vx0 = randRange(rng, -0.6, 0.6);
      const vy0 = randRange(rng, isEmber ? -1.8 : -0.7, isEmber ? -0.6 : -0.15);
      const size = randRange(rng, isEmber ? 1.2 : 0.6, isEmber ? 3.4 : 1.8);
      const startAlpha = randRange(rng, 0.45, 0.95);
      const hue = isEmber ? randRange(rng, 12, 38) : randRange(rng, 0, 10);
      const phaseOffset = rng() * 12;

      const maxLifeAlpha = startAlpha / fadeRate;
      const maxLifeHeight = (h + yStartExtra + 20) / Math.max(12, Math.abs(vy0) * 60);
      const lifePeriod = Math.max(1.2, Math.min(maxLifeAlpha, maxLifeHeight));
      const life = posMod(t + phaseOffset, lifePeriod);

      const x0 = u0 * w;
      const x =
        x0 +
        vx0 * 60 * life +
        Math.sin(life * 0.8 + x0 * 0.01) * 14 * (1 - Math.exp(-life * 0.5));
      const y = h + yStartExtra + vy0 * 60 * life - 5.4 * life * life;
      const rawAlpha = Math.max(0, startAlpha - fadeRate * life);
      const flicker = isEmber ? 0.7 + 0.3 * Math.sin(t * 10 + x0) : 1;

      out.push({
        x,
        y,
        size,
        alpha: rawAlpha * flicker,
        depth: 0.5,
        hue,
      });
    }
    return out;
  }

  return [];
}

/* ------------------------------------------------------------------ */
/*  Lens rain drop evaluation (replaces @keyframes rain-lens-slide*)   */
/* ------------------------------------------------------------------ */
export interface ComputedLensDrop {
  id: string;
  left: number;
  top: number;
  size: number;
  tail: number;
  opacity: number;
  transform: string;
  large: boolean;
}

export interface ComputedLensBead {
  id: string;
  left: number;
  top: number;
  size: number;
  opacity: number;
  blur: number;
}

function evalPiecewiseLinear(stops: readonly [number, number][], u: number): number {
  if (u <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    const [t1, v1] = stops[i];
    if (u <= t1) {
      const [t0, v0] = stops[i - 1];
      const f = (u - t0) / Math.max(1e-9, t1 - t0);
      return v0 + (v1 - v0) * f;
    }
  }
  return stops[stops.length - 1][1];
}

export function computeRainLensDrops(opts: {
  seed: string;
  timeSec: number;
  intensity?: number;
}): {
  beads: ComputedLensBead[];
  drops: ComputedLensDrop[];
} {
  const { seed, timeSec, intensity = 1 } = opts;
  const t = Number.isFinite(timeSec) ? timeSec : 0;

  const beadCount = Math.max(0, Math.round(22 * Math.min(1.2, intensity)));
  const beadRng = createSeededRng(`${seed}:lens-beads:${beadCount}`);
  const beads: ComputedLensBead[] = Array.from({ length: beadCount }, (_, i) => ({
    id: `bead-${i}`,
    left: randRange(beadRng, 1, 98),
    top: randRange(beadRng, 2, 96),
    size: randRange(beadRng, 1.5, 4.2),
    opacity: randRange(beadRng, 0.035, 0.08),
    blur: randRange(beadRng, 0.2, 0.6),
  }));

  const dropCount = Math.max(0, Math.round(7 * intensity));
  const dropRng = createSeededRng(`${seed}:lens-drops:${dropCount}`);
  const drops: ComputedLensDrop[] = [];

  for (let i = 0; i < dropCount; i += 1) {
    const left = randRange(dropRng, 3, 96);
    const top = randRange(dropRng, -30, 90);
    const size = randRange(dropRng, 6, 12);
    const tail = randRange(dropRng, 18, 52);
    const dur = randRange(dropRng, 4.5, 9.5);
    const delay = randRange(dropRng, -8, 0);
    const baseOpacity = randRange(dropRng, 0.1, 0.17);
    const drift = randRange(dropRng, -3, 3);
    const wobble = randRange(dropRng, 0.6, 1.8);

    // @keyframes rain-lens-slide (linear infinite)
    const u = posMod((t - delay) / dur, 1);
    const opFactor = evalPiecewiseLinear(
      [
        [0, 0],
        [0.08, 1],
        [0.78, 0.9],
        [1, 0],
      ],
      u,
    );
    let tyPct = 0;
    let tyVh = 0;
    if (u <= 0.78) {
      tyPct = evalPiecewiseLinear(
        [
          [0, -24],
          [0.22, 18],
          [0.48, 52],
          [0.78, 92],
        ],
        u,
      );
    } else {
      const k = (u - 0.78) / 0.22;
      tyPct = 92 * (1 - k);
      tyVh = 132 * k;
    }
    const txPx =
      drift *
      evalPiecewiseLinear(
        [
          [0, 0],
          [0.22, 0.3],
          [0.48, 0.6],
          [0.78, 1.0],
          [1, 1.2],
        ],
        u,
      );
    const rotDeg =
      wobble *
      evalPiecewiseLinear(
        [
          [0, 0],
          [0.22, 0.2],
          [0.48, -0.3],
          [0.78, 0.15],
          [1, 0],
        ],
        u,
      );
    const scale = u <= 0.78 ? 1 : lerp(1, 1.08, (u - 0.78) / 0.22);

    drops.push({
      id: `drop-${i}`,
      left,
      top,
      size,
      tail,
      opacity: baseOpacity * opFactor,
      transform: `translateY(calc(${tyPct.toFixed(3)}% + ${tyVh.toFixed(3)}vh)) translateX(${txPx.toFixed(3)}px) rotate(${rotDeg.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
      large: false,
    });
  }

  const largeCount = Math.max(0, Math.round(2 * Math.min(1.5, intensity)));
  const largeRng = createSeededRng(`${seed}:lens-large:${largeCount}`);
  for (let i = 0; i < largeCount; i += 1) {
    const left = randRange(largeRng, 8, 92);
    const top = randRange(largeRng, -20, 60);
    const size = randRange(largeRng, 11, 17);
    const tail = randRange(largeRng, 36, 72);
    const dur = randRange(largeRng, 6.5, 11);
    const delay = randRange(largeRng, -7, -0.5);
    const baseOpacity = randRange(largeRng, 0.09, 0.16);
    const drift = randRange(largeRng, -2, 2);

    // @keyframes rain-lens-slide-large (cubic-bezier(0.2, 0.6, 0.3, 1) infinite)
    const rawU = posMod((t - delay) / dur, 1);
    const u = solveCubicBezier(0.2, 0.6, 0.3, 1, rawU);
    const opFactor = evalPiecewiseLinear(
      [
        [0, 0],
        [0.1, 1],
        [0.68, 0.85],
        [1, 0],
      ],
      u,
    );
    let tyPct = 0;
    let tyVh = 0;
    if (u <= 0.68) {
      tyPct = evalPiecewiseLinear(
        [
          [0, -28],
          [0.35, 28],
          [0.68, 72],
        ],
        u,
      );
    } else {
      const k = (u - 0.68) / 0.32;
      tyPct = 72 * (1 - k);
      tyVh = 135 * k;
    }
    const txPx =
      drift *
      evalPiecewiseLinear(
        [
          [0, 0],
          [0.35, 0.4],
          [0.68, 1.0],
          [1, 1.3],
        ],
        u,
      );
    const scale = evalPiecewiseLinear(
      [
        [0, 1],
        [0.35, 1.02],
        [0.68, 1.04],
        [1, 1.1],
      ],
      u,
    );

    drops.push({
      id: `large-${i}`,
      left,
      top,
      size,
      tail,
      opacity: baseOpacity * opFactor,
      transform: `translateY(calc(${tyPct.toFixed(3)}% + ${tyVh.toFixed(3)}vh)) translateX(${txPx.toFixed(3)}px) scale(${scale.toFixed(4)})`,
      large: true,
    });
  }

  return { beads, drops };
}

/* ------------------------------------------------------------------ */
/*  Layout-box DPR Canvas hook (invariant to CSS scale/rotate!)        */
/* ------------------------------------------------------------------ */
function useFrameCanvasDraw(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: React.DependencyList,
) {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const paintNow = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d", { alpha: true });
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const cssW = Math.max(1, canvas.clientWidth || 640);
    const cssH = Math.max(1, canvas.clientHeight || 360);
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    drawRef.current(ctx, cssW, cssH);
  };

  useIsomorphicLayoutEffect(() => {
    paintNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paintNow());
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Frame-driven Storm Lightning (no timers, no @keyframes)            */
/* ------------------------------------------------------------------ */
const STORM_BOLT_PATHS = [
  "polygon(50% 0%, 34% 26%, 54% 26%, 40% 52%, 58% 52%, 36% 100%, 68% 46%, 46% 46%)",
  "polygon(50% 0%, 38% 18%, 56% 18%, 42% 42%, 60% 42%, 32% 78%, 48% 78%, 34% 100%)",
  "polygon(50% 0%, 30% 30%, 50% 30%, 36% 60%, 56% 60%, 42% 88%, 64% 62%, 44% 62%)",
  "polygon(50% 0%, 28% 14%, 50% 14%, 40% 46%, 58% 46%, 30% 72%, 50% 72%, 38% 100%, 64% 50%, 44% 50%)",
];

function FrameStormLightning({ seed, timeSec }: { seed: string; timeSec: number }) {
  const period = 6.2;
  const t = Math.max(0, timeSec);
  const slot = Math.floor(t / period);
  const local = t - slot * period;
  const rng = createSeededRng(`${seed}:storm:${slot}`);
  const onset = randRange(rng, 1.8, 4.8);
  const flashDur = randRange(rng, 0.34, 0.56);

  if (local < onset || local > onset + flashDur) return null;
  const u = (local - onset) / flashDur;
  const flashEnvelope = evalPiecewiseLinear(
    [
      [0, 0],
      [0.12, 1],
      [0.3, 0.35],
      [0.48, 0.95],
      [1, 0],
    ],
    u,
  );
  const flashAlpha = randRange(rng, 0.55, 1);
  const tintPick = rng();
  const flashColor =
    tintPick < 0.34
      ? `rgba(205,228,255,${flashAlpha.toFixed(2)})`
      : tintPick < 0.67
        ? `rgba(180,210,255,${flashAlpha.toFixed(2)})`
        : `rgba(190,205,255,${flashAlpha.toFixed(2)})`;
  const withFork = rng() < 0.55;
  const x = randRange(rng, 8, 92);
  const path = STORM_BOLT_PATHS[Math.floor(rng() * STORM_BOLT_PATHS.length)];
  const height = randRange(rng, 45, 88);
  const scaleX = randRange(rng, 0.7, 1.5);
  const skew = randRange(rng, -14, 14);
  const boltOpacity = randRange(rng, 0.65, 1) * flashEnvelope;
  const forkX = withFork ? randRange(rng, 6, 94) : undefined;
  const forkScale = randRange(rng, 0.4, 0.75);
  const forkPath = withFork
    ? STORM_BOLT_PATHS[Math.floor(rng() * STORM_BOLT_PATHS.length)]
    : undefined;

  return (
    <div className="pointer-events-none absolute inset-0 z-[21] overflow-hidden" aria-hidden>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: flashEnvelope,
          background: `radial-gradient(ellipse at ${x}% 0%, ${flashColor}, rgba(130,170,220,0.28) 45%, transparent 78%)`,
          animation: "none",
          transition: "none",
        }}
      />
      <div
        className="storm-bolt"
        style={{
          left: `${x}%`,
          height: `${height}%`,
          clipPath: path,
          opacity: boltOpacity,
          transform: `translateX(-50%) scaleX(${scaleX}) skewX(${skew}deg)`,
          animation: "none",
        }}
      />
      {forkX !== undefined && forkPath && (
        <div
          className="storm-bolt"
          style={{
            left: `${forkX}%`,
            height: `${height * 0.66}%`,
            clipPath: forkPath,
            opacity: boltOpacity * 0.7,
            transform: `translateX(-50%) scaleX(${forkScale}) skewX(${-skew * 0.6}deg)`,
            animation: "none",
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  2D Canvas renderers driven solely by (seed, timeSec)               */
/* ------------------------------------------------------------------ */
function FrameRainCanvas({
  seed,
  timeSec,
  intensity = 1,
  wind = 1,
}: {
  seed: string;
  timeSec: number;
  intensity?: number;
  wind?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useFrameCanvasDraw(
    canvasRef,
    (ctx, w, h) => {
      const drops = computeParticlePositions({
        seed,
        timeSec,
        kind: "rain",
        width: w,
        height: h,
        intensity,
        wind,
      });
      for (const p of drops) {
        ctx.beginPath();
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = `rgba(175,205,240,${p.alpha})`;
        ctx.lineWidth = p.size;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2 ?? p.x, p.y2 ?? p.y + 12);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [seed, timeSec, intensity, wind],
  );

  return (
    <canvas
      ref={canvasRef}
      data-testid="frame-particles-rain"
      data-particle-seed={seed}
      data-particle-time={timeSec.toFixed(4)}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
    />
  );
}

function FrameDustCanvas({
  seed,
  timeSec,
  cinematic,
  density = 90,
  subtle = false,
}: {
  seed: string;
  timeSec: number;
  cinematic?: CinematicSettings;
  density?: number;
  subtle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightsKey = useMemo(
    () =>
      resolveLights(cinematic)
        .map((l) => `${l.x}:${l.y}:${l.size}:${l.intensity}:${l.color}`)
        .join("|"),
    [cinematic],
  );

  useFrameCanvasDraw(
    canvasRef,
    (ctx, w, h) => {
      const pts = computeParticlePositions({
        seed,
        timeSec,
        kind: "dust",
        width: w,
        height: h,
        density,
        subtle,
        cinematic,
      });
      for (const p of pts) {
        ctx.beginPath();
        ctx.globalAlpha = p.alpha * (subtle ? 0.7 : 1);
        if (p.glowColor && (p.glowBoost ?? 0) > 0.25) {
          ctx.shadowBlur = p.size * 6 * (p.glowBoost ?? 0) + 2;
          ctx.shadowColor = p.glowColor;
          ctx.fillStyle = p.glowColor;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = subtle
            ? "rgba(242,232,213,0.9)"
            : `hsla(${p.hue ?? 42}, 28%, 82%, 1)`;
        }
        ctx.arc(p.x, p.y, p.size * (0.7 + p.depth * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    [seed, timeSec, density, subtle, lightsKey],
  );

  return (
    <canvas
      ref={canvasRef}
      data-particle-seed={seed}
      data-particle-time={timeSec.toFixed(4)}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
      style={{ opacity: subtle ? 0.65 : 1 }}
    />
  );
}

function FrameSnowCanvas({
  seed,
  timeSec,
  wind = 1,
}: {
  seed: string;
  timeSec: number;
  wind?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useFrameCanvasDraw(
    canvasRef,
    (ctx, w, h) => {
      const flakes = computeParticlePositions({
        seed,
        timeSec,
        kind: "snow",
        width: w,
        height: h,
        wind,
      });
      for (const p of flakes) {
        ctx.beginPath();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "rgba(235,242,255,0.95)";
        ctx.shadowBlur = p.size * 1.5;
        ctx.shadowColor = "rgba(180,210,255,0.6)";
        if (p.size > 1.8) {
          const r = p.size;
          for (let a = 0; a < 6; a += 1) {
            const ang = (a * Math.PI) / 3;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
          }
          ctx.strokeStyle = `rgba(235,242,255,${p.alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        } else {
          ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    [seed, timeSec, wind],
  );

  return (
    <canvas
      ref={canvasRef}
      data-particle-seed={seed}
      data-particle-time={timeSec.toFixed(4)}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
    />
  );
}

function FrameEmberCanvas({
  seed,
  timeSec,
  kind = "ember",
}: {
  seed: string;
  timeSec: number;
  kind?: "ember" | "ash";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useFrameCanvasDraw(
    canvasRef,
    (ctx, w, h) => {
      const pts = computeParticlePositions({
        seed,
        timeSec,
        kind,
        width: w,
        height: h,
      });
      for (const p of pts) {
        if (p.alpha <= 0.005 || p.y < -20) continue;
        ctx.beginPath();
        ctx.globalAlpha = p.alpha;
        if (kind === "ember") {
          ctx.shadowBlur = p.size * 4;
          ctx.shadowColor = `hsla(${p.hue ?? 24}, 92%, 58%, ${p.alpha})`;
          ctx.fillStyle = `hsla(${p.hue ?? 24}, 96%, 62%, 1)`;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(190,185,180,${p.alpha * 0.6})`;
        }
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    [seed, timeSec, kind],
  );

  return (
    <canvas
      ref={canvasRef}
      data-particle-seed={seed}
      data-particle-time={timeSec.toFixed(4)}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
    />
  );
}

function FrameFirefliesCanvas({ seed, timeSec }: { seed: string; timeSec: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useFrameCanvasDraw(
    canvasRef,
    (ctx, w, h) => {
      const pts = computeParticlePositions({
        seed,
        timeSec,
        kind: "fireflies",
        width: w,
        height: h,
      });
      for (const p of pts) {
        ctx.beginPath();
        ctx.globalAlpha = p.alpha * 0.95;
        ctx.shadowBlur = p.size * 8 * p.alpha + 2;
        ctx.shadowColor = `hsla(48, 96%, 62%, ${p.alpha})`;
        ctx.fillStyle = `hsla(48, 98%, 68%, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.size * (0.6 + p.alpha * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    },
    [seed, timeSec],
  );

  return (
    <canvas
      ref={canvasRef}
      data-particle-seed={seed}
      data-particle-time={timeSec.toFixed(4)}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
    />
  );
}

function FrameSmokeOverlay({ seed, timeSec }: { seed: string; timeSec: number }) {
  const items = useMemo(() => {
    const rng = createSeededRng(`${seed}:smoke`);
    return Array.from({ length: 9 }, (_, i) => ({
      key: i,
      left: rng() * 100,
      top: 24 + rng() * 62,
      dur: 10 + rng() * 12,
      delay: rng() * 7,
      size: 110 + rng() * 220,
      depth: rng(),
      tint: rng() < 0.5 ? "rgba(200,190,220,0.16)" : "rgba(180,195,210,0.14)",
    }));
  }, [seed]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[20] overflow-hidden" aria-hidden>
      {items.map((p) => {
        const k = pingPongEaseInOut((timeSec + p.delay) / p.dur);
        const txVw = lerp(-6, 7, k);
        const tyVh = lerp(3, -6, k);
        const scale = lerp(1, 1.35, k);
        const rot = lerp(0, 12, k);
        const animOp = lerp(0.5, 0.9, k);
        return (
          <span
            key={p.key}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size * 0.62,
              borderRadius: 9999,
              filter: "blur(14px)",
              opacity: (0.45 + p.depth * 0.4) * animOp,
              transform: `translate(${txVw.toFixed(3)}vw, ${tyVh.toFixed(3)}vh) scale(${scale.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`,
              background: `radial-gradient(circle, ${p.tint}, transparent 70%)`,
              animation: "none",
              transition: "none",
            }}
          />
        );
      })}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 20%, rgba(200,200,210,0.25), transparent 70%)",
          filter: "blur(28px)",
        }}
      />
    </div>
  );
}

function FrameFogBanks({
  seed,
  timeSec,
  cinematic,
  density = 1,
}: {
  seed: string;
  timeSec: number;
  cinematic?: CinematicSettings;
  density?: number;
}) {
  const lights = useMemo(() => resolveLights(cinematic), [cinematic]);
  const dim = cinematic?.dimAmount ?? 0;
  const fogCount = Math.round(3 + density * 2);

  const layers = useMemo(() => {
    const rng = createSeededRng(`${seed}:fog:${fogCount}`);
    return Array.from({ length: fogCount }, (_, i) => {
      const top = randRange(rng, 8, 88);
      const depthFactor = 1 - top / 100;
      const baseOpacity = lerp(0.1, 0.6, depthFactor);
      return {
        id: i,
        top,
        height: randRange(rng, 18, 42),
        blur: randRange(rng, 18, 46),
        opacity: baseOpacity * randRange(rng, 0.5, 1.1) * (0.7 + dim * 0.8),
        dur: randRange(rng, 18, 42),
        delay: randRange(rng, -12, 0),
        dir: rng() < 0.5 ? 1 : -1,
        tint:
          i % 3 === 0
            ? "rgba(200,190,210,0.9)"
            : i % 3 === 1
              ? "rgba(180,200,210,0.8)"
              : "rgba(210,200,185,0.85)",
      };
    });
  }, [seed, fogCount, dim]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[19] overflow-hidden" aria-hidden>
      {layers.map((l) => {
        const k = pingPongEaseInOut((timeSec - l.delay) / l.dur);
        const txPct =
          k <= 0.5
            ? lerp(-6 * l.dir, 3 * l.dir, k * 2)
            : lerp(3 * l.dir, 7 * l.dir, (k - 0.5) * 2);
        const sy = k <= 0.5 ? lerp(1, 1.04, k * 2) : lerp(1.04, 0.98, (k - 0.5) * 2);
        return (
          <div
            key={l.id}
            className="absolute w-[130%]"
            style={{
              top: `${l.top}%`,
              height: `${l.height}%`,
              left: "-15%",
              opacity: l.opacity,
              filter: `blur(${l.blur}px)`,
              background: `radial-gradient(ellipse 70% 90% at 50% 50%, ${l.tint} 0%, rgba(200,200,200,0) 72%)`,
              transform: `translateX(${txPct.toFixed(3)}%) scaleY(${sy.toFixed(4)})`,
              animation: "none",
              transition: "none",
            }}
          />
        );
      })}
      {lights.map((lt, i) => (
        <div
          key={`shaft-${i}`}
          className="pointer-events-none"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            transform: "scale(1.06)",
            animation: "none",
            transition: "none",
          }}
          aria-hidden
        >
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${lt.x}%`,
              width: `${Math.max(12, lt.size * 0.8)}%`,
              background: `linear-gradient(180deg, ${glowColorWithAlpha(lt.color, 0.13)} 0%, ${glowColorWithAlpha(lt.color, 0.05)} 38%, transparent 78%)`,
              filter: "blur(18px)",
              mixBlendMode: "screen",
              opacity: (lt.intensity ?? 0.5) * 0.55,
              transform: "translateX(-50%)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Frame-driven Rain on Lens (replaces RainLensOverlay @keyframes)   */
/* ------------------------------------------------------------------ */
export function FrameRainLensOverlay({
  seed,
  timeSec,
  intensity = 1,
}: {
  seed: string;
  timeSec: number;
  intensity?: number;
}) {
  const { beads, drops } = useMemo(
    () => computeRainLensDrops({ seed, timeSec, intensity }),
    [seed, timeSec, intensity],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[22] overflow-hidden"
      data-testid="frame-rain-lens"
      aria-hidden
    >
      {beads.map((b) => (
        <span
          key={b.id}
          className="absolute rounded-full"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            opacity: b.opacity,
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 0%, rgba(200,220,255,0.24) 32%, rgba(180,210,255,0.1) 58%, transparent 78%)",
            boxShadow: `0 0 ${b.size * 0.8}px rgba(255,255,255,0.1)`,
            filter: `blur(${b.blur}px)`,
          }}
        />
      ))}
      {drops.map((d) => (
        <span
          key={d.id}
          className="fx-rain-lens-drop absolute"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size + d.tail,
            opacity: d.opacity,
            transform: d.transform,
            animation: "none",
            transition: "none",
          }}
        >
          <span
            className="absolute left-1/2 top-0 block -translate-x-1/2"
            style={{
              width: d.large ? Math.max(1.2, d.size * 0.22) : Math.max(1, d.size * 0.18),
              height: d.tail,
              background: d.large
                ? "linear-gradient(180deg, transparent 0%, rgba(165,195,235,0.06) 40%, rgba(175,205,255,0.14) 82%, rgba(210,230,255,0.26) 100%)"
                : "linear-gradient(180deg, transparent 0%, rgba(175,205,255,0.08) 35%, rgba(175,205,255,0.15) 78%, rgba(200,225,255,0.28) 100%)",
              filter: d.large ? "blur(0.6px)" : `blur(${Math.max(0.2, d.size * 0.06)}px)`,
              borderRadius: 999,
            }}
          />
          <span
            className="absolute bottom-0 left-1/2 block -translate-x-1/2 rounded-full"
            style={{
              width: d.size,
              height: d.size,
              background: d.large
                ? "radial-gradient(ellipse at 30% 26%, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.32) 18%, rgba(185,210,255,0.18) 44%, rgba(150,180,220,0.09) 68%, transparent 82%)"
                : "radial-gradient(ellipse at 32% 28%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.36) 14%, rgba(190,215,255,0.2) 38%, rgba(160,195,235,0.1) 62%, transparent 78%)",
              boxShadow: d.large
                ? `inset 0 0 ${d.size * 0.4}px rgba(255,255,255,0.24), inset 0 -${d.size * 0.2}px ${d.size * 0.3}px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.1)`
                : `inset 0 0 ${d.size * 0.35}px rgba(255,255,255,0.22), inset 0 -${d.size * 0.15}px ${d.size * 0.25}px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)`,
              border: d.large
                ? "0.5px solid rgba(255,255,255,0.15)"
                : "0.5px solid rgba(255,255,255,0.13)",
              backdropFilter: d.large ? "blur(0.6px)" : "blur(0.5px)",
            }}
          />
        </span>
      ))}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 28%)",
          filter: "blur(0.8px)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Frame-driven Ambient Atmosphere (subtle dust + volumetric shafts) */
/* ------------------------------------------------------------------ */
export function FrameAmbientAtmosphere({
  seed,
  timeSec,
  cinematic,
  reducedMotion,
  ambientAudio,
  dustOpacityScale = 1,
}: {
  seed: string;
  timeSec: number;
  cinematic?: CinematicSettings;
  reducedMotion?: boolean;
  ambientAudio?: string;
  dustOpacityScale?: number;
}) {
  const hasLights = (cinematic?.lights?.length ?? 0) > 0 || !!cinematic?.lightSource;
  const dim = cinematic?.dimAmount ?? 0;
  const showShafts = (cinematic as Record<string, unknown> | undefined)?.volumetricShafts !== false;
  const shaftsIntensity = Number(
    (cinematic as Record<string, unknown> | undefined)?.shaftsIntensity ?? 1,
  );
  const shouldShow = (hasLights && showShafts) || dim > 0.18;
  const isTension = ambientAudio === "tension";

  if (!shouldShow) return null;
  if (reducedMotion) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden opacity-30" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-100/[0.03] to-transparent" />
      </div>
    );
  }

  const flicker = isTension
    ? 0.85 + Math.sin(timeSec * 1.8) * 0.15 + Math.sin(timeSec * 3.1 + 1.3) * 0.07
    : 1;

  const clampedDustScale = Math.max(0, Math.min(1, dustOpacityScale));

  return (
    <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden" aria-hidden>
      <div
        className="pointer-events-none absolute inset-0"
        style={clampedDustScale < 1 ? { opacity: clampedDustScale } : undefined}
      >
        <FrameDustCanvas
          seed={`${seed}:atm-a`}
          timeSec={timeSec}
          cinematic={cinematic}
          density={36}
          subtle
        />
      </div>
      {hasLights && showShafts && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{ opacity: 0.18 * flicker * shaftsIntensity }}
          aria-hidden
        >
          {resolveLights(cinematic)
            .slice(0, 4)
            .map((lt, i) => (
              <div
                key={i}
                className="pointer-events-none"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  transform: "scale(1.06)",
                  animation: "none",
                  transition: "none",
                }}
                aria-hidden
              >
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: `${lt.x}%`,
                    width: `${lt.size * 1.4}%`,
                    background: `linear-gradient(180deg, transparent 0%, ${glowColorWithAlpha(lt.color, 0.1)} 14%, ${glowColorWithAlpha(lt.color, 0.05)} 38%, ${glowColorWithAlpha(lt.color, 0.02)} 62%, transparent 88%)`,
                    filter: "blur(22px)",
                    transform: `translateX(-50%) rotate(${(lt.x - 50) * 0.06}deg)`,
                    transformOrigin: "top center",
                    opacity: lt.intensity ?? 0.5,
                  }}
                />
              </div>
            ))}
        </div>
      )}
      {hasLights && showShafts && (
        <div
          className="pointer-events-none absolute inset-0"
          style={clampedDustScale < 1 ? { opacity: clampedDustScale } : undefined}
        >
          <FrameDustCanvas
            seed={`${seed}:atm-b`}
            timeSec={timeSec}
            cinematic={cinematic}
            density={18}
            subtle
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main FrameParticles switch (replaces AmbientParticles.Particles)  */
/* ------------------------------------------------------------------ */
export function FrameParticles({
  kind,
  seed,
  timeSec,
  cinematic,
  reducedMotion,
  ambientAudio,
  config,
}: FrameParticlesProps) {
  if (kind === "none") {
    return (
      <FrameAmbientAtmosphere
        seed={seed}
        timeSec={timeSec}
        cinematic={cinematic}
        reducedMotion={reducedMotion}
        ambientAudio={ambientAudio}
      />
    );
  }

  if (reducedMotion) {
    if (kind === "fog") {
      return (
        <div
          className="pointer-events-none absolute inset-0 z-[19] bg-gradient-to-b from-transparent via-paper/[0.04] to-paper/[0.07]"
          aria-hidden
        />
      );
    }
    if (kind === "dust" || kind === "motes") {
      return (
        <div
          className="pointer-events-none absolute inset-0 z-[20] opacity-20"
          style={{
            backgroundImage: "radial-gradient(rgba(242,232,213,0.5) 0.6px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />
      );
    }
    if (kind === "rain" || kind === "drizzle") {
      return <div className="pointer-events-none absolute inset-0 z-[20] opacity-30" aria-hidden />;
    }
    return <div className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const isRain = kind === "rain" || kind === "drizzle" || kind === "storm";
  const cinAny = cinematic as Record<string, unknown> | undefined;
  const depthFogOn = cinAny?.depthFog === true;
  const fogStrength = Number(cinAny?.fogStrength ?? 0.6);
  const rainLensOn = (cinAny?.rainOnLens as boolean | undefined) ?? isRain;
  const rainLensIntensity = Number(
    cinAny?.rainLensIntensity ?? (kind === "storm" ? 1.6 : kind === "rain" ? 1.2 : 0.6),
  );

  const dens = Math.max(0, Math.min(2, config?.density ?? 1));
  const gust = Math.max(0, Math.min(3, config?.wind ?? 1));
  const strength = Math.max(0, Math.min(1, config?.opacity ?? 1));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[20] overflow-hidden"
      data-testid="frame-particles"
      data-particle-kind={kind}
      data-particle-seed={seed}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={strength < 1 ? { opacity: strength } : undefined}
        data-particle-strength={strength}
      >
        {kind === "rain" && (
          <FrameRainCanvas seed={seed} timeSec={timeSec} intensity={1.2 * dens} wind={gust} />
        )}
        {kind === "drizzle" && (
          <FrameRainCanvas seed={seed} timeSec={timeSec} intensity={0.45 * dens} wind={gust} />
        )}
        {kind === "storm" && (
          <>
            <FrameRainCanvas seed={seed} timeSec={timeSec} intensity={1.5 * dens} wind={gust} />
            <FrameStormLightning seed={seed} timeSec={timeSec} />
          </>
        )}
        {kind === "snow" && <FrameSnowCanvas seed={seed} timeSec={timeSec} wind={gust} />}
        {kind === "smoke" && <FrameSmokeOverlay seed={seed} timeSec={timeSec} />}
        {kind === "dust" && (
          <FrameDustCanvas
            seed={seed}
            timeSec={timeSec}
            cinematic={cinematic}
            density={Math.round(88 * dens)}
          />
        )}
        {kind === "motes" && (
          <FrameDustCanvas
            seed={seed}
            timeSec={timeSec}
            cinematic={cinematic}
            density={Math.round(54 * dens)}
          />
        )}
        {kind === "fog" && depthFogOn && (
          <FrameFogBanks
            seed={seed}
            timeSec={timeSec}
            cinematic={cinematic}
            density={fogStrength * 1.8}
          />
        )}
        {kind === "ember" && <FrameEmberCanvas seed={seed} timeSec={timeSec} kind="ember" />}
        {kind === "ash" && <FrameEmberCanvas seed={seed} timeSec={timeSec} kind="ash" />}
        {kind === "fireflies" && <FrameFirefliesCanvas seed={seed} timeSec={timeSec} />}
      </div>
      {rainLensOn && (
        <FrameRainLensOverlay seed={seed} timeSec={timeSec} intensity={rainLensIntensity} />
      )}
      {(kind === "dust" || kind === "motes" || (kind === "fog" && depthFogOn)) && (
        <FrameAmbientAtmosphere
          seed={seed}
          timeSec={timeSec}
          cinematic={cinematic}
          reducedMotion={reducedMotion}
          ambientAudio={ambientAudio}
          dustOpacityScale={kind === "dust" || kind === "motes" ? strength : 1}
        />
      )}
    </div>
  );
}

export { FrameParticles as Particles };
