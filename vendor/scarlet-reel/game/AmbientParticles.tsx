import { useEffect, useMemo, useRef, useState } from "react";
import { glowColorWithAlpha, resolveLights } from "../cinematic";
import type { CinematicSettings } from "../types";

/* ------------------------------------------------------------------ */
/*  Particle kinds — extended from the original 3 to a full set       */
/* ------------------------------------------------------------------ */
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

export type ParticleConfig = NonNullable<import("../types").SceneNode["particleConfig"]>;

interface ParticlesProps {
  kind: ParticleKind;
  soundOn: boolean;
  cinematic?: CinematicSettings;
  reducedMotion?: boolean;
  ambientAudio?: string;
  /** scene.particleConfig: density 0..2 (how many drops/motes), opacity 0..1 (how strong), wind 0..3 (rain gusts); unset = 1 */
  config?: ParticleConfig;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function useDPRCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onResize?: (w: number, h: number, dpr: number) => void
) {
  // Callers pass an inline closure, so keep it in a ref: the observer must
  // attach ONCE per canvas, not re-subscribe on every parent re-render (a
  // storm scene re-renders at flicker rate — re-observing each time tore the
  // canvas down and back up, freezing the particles mid-frame).
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      onResizeRef.current?.(rect.width, rect.height, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef]);
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/* ------------------------------------------------------------------ */
/*  LIGHTNING — improved storm                                         */
/* ------------------------------------------------------------------ */
const STORM_BOLT_PATHS = [
  "polygon(50% 0%, 34% 26%, 54% 26%, 40% 52%, 58% 52%, 36% 100%, 68% 46%, 46% 46%)",
  "polygon(50% 0%, 38% 18%, 56% 18%, 42% 42%, 60% 42%, 32% 78%, 48% 78%, 34% 100%)",
  "polygon(50% 0%, 30% 30%, 50% 30%, 36% 60%, 56% 60%, 42% 88%, 64% 62%, 44% 62%)",
  "polygon(50% 0%, 28% 14%, 50% 14%, 40% 46%, 58% 46%, 30% 72%, 50% 72%, 38% 100%, 64% 50%, 44% 50%)",
];

interface StormStrike {
  id: number;
  x: number;
  path: string;
  height: number;
  scaleX: number;
  skew: number;
  opacity: number;
  forkX?: number;
  forkScale?: number;
  forkPath?: string;
  flashColor: string;
  flashDur: number;
}

function StormLightning({ soundOn }: { soundOn: boolean }) {
  const [strike, setStrike] = useState<StormStrike | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let strikeTimer: number | null = null;
    let clearTimer: number | null = null;
    let thunderTimer: number | null = null;

    const schedule = () => {
      strikeTimer = window.setTimeout(() => {
        if (cancelled) return;
        const id = ++idRef.current;
        const flashAlpha = rand(0.55, 1);
        const flashTint =
          Math.random() < 0.5
            ? `rgba(205,228,255,${flashAlpha.toFixed(2)})`
            : Math.random() < 0.5
              ? `rgba(180,210,255,${flashAlpha.toFixed(2)})`
              : `rgba(190,205,255,${flashAlpha.toFixed(2)})`;
        const withFork = Math.random() < 0.55;
        setStrike({
          id,
          x: rand(8, 92),
          path: STORM_BOLT_PATHS[Math.floor(Math.random() * STORM_BOLT_PATHS.length)],
          height: rand(45, 88),
          scaleX: rand(0.7, 1.5),
          skew: rand(-14, 14),
          opacity: rand(0.65, 1),
          forkX: withFork ? rand(6, 94) : undefined,
          forkScale: rand(0.4, 0.75),
          // Resolved HERE (not at render time): a fresh Math.random() in the
          // render path would re-roll the fork's shape on every re-render.
          forkPath: withFork ? STORM_BOLT_PATHS[Math.floor(Math.random() * STORM_BOLT_PATHS.length)] : undefined,
          flashColor: flashTint,
          flashDur: rand(0.32, 0.6),
        });
        thunderTimer = window.setTimeout(() => {
          if (!cancelled && soundOn) {
            // lazy import audio to avoid circular
            import("../audio").then(({ audio }) => audio.thunder());
          }
        }, rand(400, 1800));
        clearTimer = window.setTimeout(() => {
          if (cancelled) return;
          setStrike(null);
          schedule();
        }, 500);
      }, rand(3000, 10000));
    };
    schedule();
    return () => {
      cancelled = true;
      if (strikeTimer !== null) window.clearTimeout(strikeTimer);
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      if (thunderTimer !== null) window.clearTimeout(thunderTimer);
    };
  }, [soundOn]);

  if (!strike) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[21] overflow-hidden" aria-hidden>
      <div
        className="storm-flash"
        style={
          {
            background: `radial-gradient(ellipse at ${strike.x}% 0%, ${strike.flashColor}, rgba(130,170,220,0.28) 45%, transparent 78%)`,
            "--flash-dur": `${strike.flashDur}s`,
          } as React.CSSProperties
        }
      />
      <div
        className="storm-bolt"
        style={{
          left: `${strike.x}%`,
          height: `${strike.height}%`,
          clipPath: strike.path,
          opacity: strike.opacity,
          transform: `translateX(-50%) scaleX(${strike.scaleX}) skewX(${strike.skew}deg)`,
        }}
      />
      {strike.forkX !== undefined && strike.forkPath && (
        <div
          className="storm-bolt"
          style={{
            left: `${strike.forkX}%`,
            height: `${strike.height * 0.66}%`,
            clipPath: strike.forkPath,
            opacity: (strike.opacity * 0.7).toFixed(2),
            transform: `translateX(-50%) scaleX(${strike.forkScale}) skewX(${-strike.skew * 0.6}deg)`,
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DUST MOTES — canvas, light-reactive, parallax                      */
/* ------------------------------------------------------------------ */
interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  phase: number;
  depth: number; // 0 far ..1 near
  twinkleSpeed: number;
  hueShift: number;
}

function DustCanvas({
  cinematic,
  density = 90,
  subtle = false,
}: {
  cinematic?: CinematicSettings;
  density?: number;
  subtle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<DustParticle[]>([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const parRef = useRef({ x: 0, y: 0 });
  const lights = useMemo(() => resolveLights(cinematic), [cinematic]);

  useDPRCanvas(canvasRef, (w, h) => {
    dimsRef.current = { w, h };
    // re-seed if empty or size changed drastically
    if (particlesRef.current.length === 0) {
      const count = subtle ? Math.round(density * 0.35) : density;
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.18, 0.18),
        vy: rand(-0.22, 0.22),
        size: subtle ? rand(0.4, 1.6) : rand(0.6, 2.8),
        baseAlpha: subtle ? rand(0.06, 0.22) : rand(0.12, 0.55),
        alpha: 0.5,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random(),
        twinkleSpeed: rand(0.6, 2.2),
        hueShift: rand(-6, 6),
      }));
    }
  });

  // parallax tracking from CSS vars + pointer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement?.closest("[data-story-id]") as HTMLElement | null;
    if (!parent) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cs = getComputedStyle(parent);
        const px = parseFloat(cs.getPropertyValue("--par-x")) || 0;
        const py = parseFloat(cs.getPropertyValue("--par-y")) || 0;
        // fallback to pointer-derived if no CSS var
        if (!px && !py) {
          const r = parent.getBoundingClientRect();
          const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
          const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
          parRef.current = { x: nx, y: ny };
        } else {
          parRef.current = { x: px, y: py };
        }
      });
    };
    parent.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      parent.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { w, h } = dimsRef.current;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, w, h);

      const time = now * 0.001;
      const parX = parRef.current.x;
      const parY = parRef.current.y;

      // precompute light positions in canvas space
      const lightPts = lights.map((l) => ({
        x: (l.x / 100) * w,
        y: (l.y / 100) * h,
        r: (l.size / 100) * Math.max(w, h) * 0.6,
        intensity: l.intensity ?? 0.5,
        color: l.color ?? "#e8b23c",
      }));

      for (const p of particlesRef.current) {
        // turbulence
        const turbX = Math.sin(time * 0.3 + p.phase) * 0.08 * p.depth;
        const turbY = Math.cos(time * 0.22 + p.phase * 1.3) * 0.06 * p.depth;

        p.x += (p.vx + turbX) * (1 + p.depth * 0.6) * dt * 60;
        p.y += (p.vy + turbY) * (1 + p.depth * 0.5) * dt * 60;

        // wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // twinkle
        const tw = 0.65 + 0.35 * Math.sin(time * p.twinkleSpeed + p.phase);
        let alpha = p.baseAlpha * tw;

        // light reactivity
        let glowColor: string | null = null;
        let glowBoost = 0;
        for (const lt of lightPts) {
          const dx = p.x - lt.x;
          const dy = p.y - lt.y;
          const dist = Math.hypot(dx, dy);
          if (dist < lt.r) {
            const fall = 1 - dist / lt.r;
            alpha += fall * lt.intensity * 0.9;
            glowBoost = Math.max(glowBoost, fall * lt.intensity);
            if (fall > 0.35) glowColor = lt.color;
            // gentle attraction toward light (dust caught in beam)
            p.vx += (-dx / (dist + 20)) * fall * 0.003 * lt.intensity;
            p.vy += (-dy / (dist + 20)) * fall * 0.003 * lt.intensity;
          }
        }
        alpha = Math.min(1, alpha);
        p.alpha = alpha;

        // parallax offset
        const sx = p.x + parX * p.depth * 28;
        const sy = p.y + parY * p.depth * 18;

        // draw
        ctx.beginPath();
        ctx.globalAlpha = alpha * (subtle ? 0.7 : 1);
        if (glowColor && glowBoost > 0.25) {
          ctx.shadowBlur = p.size * 6 * glowBoost + 2;
          ctx.shadowColor = glowColor;
          ctx.fillStyle = glowColor;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = subtle ? "rgba(242,232,213,0.9)" : `hsla(${42 + p.hueShift}, 28%, 82%, 1)`;
        }
        ctx.arc(sx, sy, p.size * (0.7 + p.depth * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lights, subtle]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
      aria-hidden
      style={{ opacity: subtle ? 0.65 : 1 }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  FOG BANKS — DOM layers with blur, drifting, light interaction      */
/*  Depth fog: opacity = lerp(0.1,0.6, y/100) so background hazier       */
/* ------------------------------------------------------------------ */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function FogBanks({ cinematic, density = 1 }: { cinematic?: CinematicSettings; density?: number }) {
  const lights = useMemo(() => resolveLights(cinematic), [cinematic]);
  const dim = cinematic?.dimAmount ?? 0;
  const fogCount = Math.round(3 + density * 2);
  const layers = useMemo(
    () =>
      Array.from({ length: fogCount }, (_, i) => {
        const top = rand(8, 88);
        // Depth fog: background (top near 0 = far) hazier than foreground (bottom near 100 = near)
        // User requested lerp(0.1,0.6,y/100) — we interpret as far hazier, so invert: 1 - top/100
        const depthFactor = 1 - top / 100; // 1 at top (far), 0 at bottom (near)
        const baseOpacity = lerp(0.1, 0.6, depthFactor); // far 0.6, near 0.1
        return {
          id: i,
          top,
          height: rand(18, 42),
          blur: rand(18, 46),
          opacity: baseOpacity * rand(0.5, 1.1) * (0.7 + dim * 0.8),
          dur: rand(18, 42),
          delay: rand(-12, 0),
          dir: Math.random() < 0.5 ? 1 : -1,
          depth: depthFactor, // use depthFactor for parallax
          tint: i % 3 === 0 ? "rgba(200,190,210,0.9)" : i % 3 === 1 ? "rgba(180,200,210,0.8)" : "rgba(210,200,185,0.85)",
        };
      }),
    [fogCount, dim]
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-[19] overflow-hidden" aria-hidden>
      {layers.map((l) => (
        <div
          key={l.id}
          className="fog-bank absolute w-[130%] will-change-transform"
          style={
            {
              top: `${l.top}%`,
              height: `${l.height}%`,
              left: "-15%",
              opacity: l.opacity,
              filter: `blur(${l.blur}px)`,
              background: `radial-gradient(ellipse 70% 90% at 50% 50%, ${l.tint} 0%, rgba(200,200,200,0) 72%)`,
              animation: `fog-drift-smart ${l.dur}s ease-in-out ${l.delay}s infinite alternate`,
              "--fog-dir": l.dir,
              "--fog-depth": l.depth,
              "--plane-shift": `${(4 + l.depth * 24).toFixed(1)}px`,
              transform: `translateX(${l.dir * -6}%)`,
            } as React.CSSProperties
          }
        />
      ))}
      {/* Light shafts through fog. Each shaft lives inside a full-size
       * `parallax-mid` plane (which owns the --par-x drift) and the shaft
       * shape itself is the inner element — an inline `transform` on the
       * plane would have overridden the class's parallax transform and the
       * shafts would never have drifted with the pointer. */}
      {lights.map((lt, i) => (
        <div
          key={`shaft-${i}`}
          className="parallax-mid pointer-events-none"
          style={{ "--plane-shift": `${(4 + (lt.x / 100) * 12).toFixed(1)}px` } as React.CSSProperties}
          aria-hidden
        >
          <div
            className="absolute top-0 h-full will-change-transform"
            style={
              {
                left: `${lt.x}%`,
                width: `${Math.max(12, lt.size * 0.8)}%`,
                background: `linear-gradient(180deg, ${glowColorWithAlpha(lt.color, 0.13)} 0%, ${glowColorWithAlpha(lt.color, 0.05)} 38%, transparent 78%)`,
                filter: "blur(18px)",
                mixBlendMode: "screen" as any,
                opacity: (lt.intensity ?? 0.5) * 0.55,
                transform: `translateX(-50%)`,
              } as React.CSSProperties
            }
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EMBER / ASH — rising glowing particles                             */
/* ------------------------------------------------------------------ */
function EmberCanvas({
  kind = "ember",
  cinematic: _cinematic,
}: {
  kind?: "ember" | "ash";
  cinematic?: CinematicSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; size: number; alpha: number; life: number; hue: number }[]
  >([]);
  const dimsRef = useRef({ w: 0, h: 0 });

  useDPRCanvas(canvasRef, (w, h) => {
    dimsRef.current = { w, h };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const spawn = (w: number, h: number) => {
      const isEmber = kind === "ember";
      return {
        x: rand(w * 0.15, w * 0.85),
        y: h + rand(5, 30),
        vx: rand(-0.6, 0.6),
        vy: rand(isEmber ? -1.8 : -0.7, isEmber ? -0.6 : -0.15),
        size: rand(isEmber ? 1.2 : 0.6, isEmber ? 3.4 : 1.8),
        alpha: rand(0.45, 0.95),
        life: 0,
        hue: isEmber ? rand(12, 38) : rand(0, 10),
      };
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { w, h } = dimsRef.current;
      if (!w || !h) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // fade trail slightly for ember glow persistence
      ctx.fillStyle = kind === "ember" ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)";
      ctx.globalCompositeOperation = "destination-out" as any;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      // maintain count
      const target = kind === "ember" ? 42 : 58;
      while (particlesRef.current.length < target) {
        particlesRef.current.push(spawn(w, h));
      }

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.life += dt;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vx += Math.sin(p.life * 0.8 + p.x * 0.01) * 0.02;
        p.vy -= 0.003; // lift
        p.alpha -= dt * (kind === "ember" ? 0.18 : 0.09);

        if (p.alpha <= 0 || p.y < -20) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        const flicker = kind === "ember" ? 0.7 + 0.3 * Math.sin(now * 0.01 + p.x) : 1;
        ctx.beginPath();
        ctx.globalAlpha = p.alpha * flicker;
        if (kind === "ember") {
          ctx.shadowBlur = p.size * 4;
          ctx.shadowColor = `hsla(${p.hue}, 92%, 58%, ${p.alpha})`;
          ctx.fillStyle = `hsla(${p.hue}, 96%, 62%, 1)`;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(190,185,180,${p.alpha * 0.6})`;
        }
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[20] h-full w-full" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/*  SNOW / DRIZZLE — canvas                                            */
/* ------------------------------------------------------------------ */
function SnowCanvas({ kind = "snow" }: { kind?: "snow" | "drizzle" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; size: number; alpha: number; wobble: number; wobbleSpeed: number }[]
  >([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  const windRef = useRef({ x: 0, target: 0, t: 0 });

  useDPRCanvas(canvasRef, (w, h) => {
    dimsRef.current = { w, h };
    if (particlesRef.current.length === 0) {
      const count = kind === "snow" ? 140 : 90;
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.3, 0.3),
        vy: rand(kind === "snow" ? 0.4 : 1.2, kind === "snow" ? 1.4 : 3.2),
        size: rand(kind === "snow" ? 1 : 0.6, kind === "snow" ? 3.2 : 1.4),
        alpha: rand(0.35, 0.85),
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: rand(0.4, 1.6),
      }));
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { w, h } = dimsRef.current;
      if (!w || !h) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // wind gust variation
      windRef.current.t += dt;
      if (windRef.current.t > 3) {
        windRef.current.target = rand(-0.9, 0.9);
        windRef.current.t = 0;
      }
      windRef.current.x += (windRef.current.target - windRef.current.x) * dt * 0.6;

      ctx.clearRect(0, 0, w, h);
      const time = now * 0.001;
      for (const p of particlesRef.current) {
        p.wobble += p.wobbleSpeed * dt;
        const sway = Math.sin(p.wobble) * (kind === "snow" ? 0.9 : 0.15);
        p.x += (p.vx + sway + windRef.current.x) * dt * 60;
        p.y += p.vy * dt * 60;

        if (p.y > h + 10) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;

        ctx.beginPath();
        ctx.globalAlpha = p.alpha * (0.7 + 0.3 * Math.sin(time + p.wobble));
        if (kind === "snow") {
          ctx.fillStyle = "rgba(235,242,255,0.95)";
          ctx.shadowBlur = p.size * 1.5;
          ctx.shadowColor = "rgba(180,210,255,0.6)";
        } else {
          ctx.fillStyle = "rgba(160,195,235,0.7)";
          ctx.shadowBlur = 0;
        }
        // snowflake as tiny 6-point, drizzle as streak
        if (kind === "snow" && p.size > 1.8) {
          // simple asterisk
          const r = p.size;
          for (let a = 0; a < 6; a++) {
            const ang = (a * Math.PI) / 3;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
          }
          ctx.strokeStyle = `rgba(235,242,255,${p.alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        } else if (kind === "drizzle") {
          ctx.fillRect(p.x, p.y, 0.8, p.size * 6);
        } else {
          ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[20] h-full w-full" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/*  FIREFLIES / MOTES — warm drifting points with glow                 */
/* ------------------------------------------------------------------ */
function FirefliesCanvas({ cinematic: _cinematic }: { cinematic?: CinematicSettings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; size: number; alpha: number; phase: number; pulse: number }[]
  >([]);
  const dimsRef = useRef({ w: 0, h: 0 });

  useDPRCanvas(canvasRef, (w, h) => {
    dimsRef.current = { w, h };
    if (particlesRef.current.length === 0) {
      particlesRef.current = Array.from({ length: 22 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.25, 0.25),
        vy: rand(-0.2, 0.2),
        size: rand(1.2, 2.6),
        alpha: 0,
        phase: Math.random() * Math.PI * 2,
        pulse: rand(0.8, 2.4),
      }));
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { w, h } = dimsRef.current;
      if (!w || !h) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      const time = now * 0.001;
      for (const p of particlesRef.current) {
        // lazy drift with Perlin-like wobble
        p.x += (p.vx + Math.sin(time * 0.2 + p.phase) * 0.18) * dt * 60;
        p.y += (p.vy + Math.cos(time * 0.18 + p.phase * 1.1) * 0.14) * dt * 60;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // pulse: 0..1 with slow on/off
        const glow = 0.5 + 0.5 * Math.sin(time * p.pulse + p.phase);
        const a = Math.pow(glow, 3); // sharp peak, long dark
        p.alpha = a;

        ctx.beginPath();
        ctx.globalAlpha = a * 0.95;
        ctx.shadowBlur = p.size * 8 * a + 2;
        ctx.shadowColor = `hsla(48, 96%, 62%, ${a})`;
        ctx.fillStyle = `hsla(48, 98%, 68%, ${a})`;
        ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[20] h-full w-full" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/*  RAIN — enhanced canvas with wind, depth, splash                     */
/* ------------------------------------------------------------------ */
function RainCanvas({ intensity = 1, wind = 1 }: { intensity?: number; wind?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<
    { x: number; y: number; vx: number; vy: number; len: number; alpha: number; depth: number }[]
  >([]);
  const dimsRef = useRef({ w: 0, h: 0 });
  // Wind eases toward a retargeted value instead of snapping: an instant
  // `wind = rand(-2.2, 2.2)` every 2.5s made every streak lurch at once
  // (readable as a frame skip); the lerp keeps the gusts organic.
  const windRef = useRef({ x: 0, target: 0, t: 0 });

  useDPRCanvas(canvasRef, (w, h) => {
    dimsRef.current = { w, h };
    if (particlesRef.current.length === 0) {
      const count = Math.round(120 * intensity);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.4, 0.4),
        vy: rand(7, 14),
        len: rand(8, 22),
        alpha: rand(0.22, 0.6),
        depth: Math.random(),
      }));
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      windRef.current.t += dt;
      if (windRef.current.t > 2.5) {
        windRef.current.target = rand(-2.2, 2.2) * wind;
        windRef.current.t = 0;
      }
      windRef.current.x += (windRef.current.target - windRef.current.x) * dt * 0.8;
      const { w, h } = dimsRef.current;
      if (!w || !h) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (const p of particlesRef.current) {
        p.x += (p.vx + windRef.current.x * p.depth) * dt * 60;
        p.y += p.vy * (0.6 + p.depth * 0.7) * dt * 60;
        if (p.y > h + p.len) {
          p.y = -p.len - Math.random() * 80;
          p.x = Math.random() * w;
        }
        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;

        const alpha = p.alpha * (0.5 + p.depth * 0.5);
        ctx.beginPath();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(175,205,240,${alpha})`;
        ctx.lineWidth = 0.5 + p.depth * 0.9;
        const ang = windRef.current.x * 0.06 * p.depth;
        const x2 = p.x + Math.sin(ang) * p.len * 0.35;
        const y2 = p.y + p.len * (0.8 + p.depth * 0.4);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wind]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[20] h-full w-full" aria-hidden />;
}

/* ------------------------------------------------------------------ */
/*  SMOKE — soft drifting plumes with turbulence                        */
/* ------------------------------------------------------------------ */
function SmokeCanvas() {
  const items = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        left: Math.random() * 100,
        top: 24 + Math.random() * 62,
        dur: 10 + Math.random() * 12,
        delay: Math.random() * 7,
        size: 110 + Math.random() * 220,
        key: i,
        depth: Math.random(),
        tint: Math.random() < 0.5 ? "rgba(200,190,220,0.16)" : "rgba(180,195,210,0.14)",
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[20] overflow-hidden" aria-hidden>
      {items.map((p) => (
        <span
          key={p.key}
          className="smoke-puff"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size * 0.62,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            opacity: 0.45 + p.depth * 0.4,
            background: `radial-gradient(circle, ${p.tint}, transparent 70%)`,
          }}
        />
      ))}
      {/* extra wisps */}
      <div className="absolute inset-0 opacity-[0.12]" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 20%, rgba(200,200,210,0.25), transparent 70%)", filter: "blur(28px)" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RAIN ON LENS — water droplets with backdrop blur, slide down       */
/* ------------------------------------------------------------------ */
function RainLensOverlay({ intensity = 1 }: { intensity?: number }) {
  // High-quality rain on lens: tiny static condensation + medium sliding drops with tail + occasional large beads.
  // Pass 2: the beads/drops were far too OPAQUE — they read as painted-on
  // stickers instead of water on glass. Every alpha below is ~half of the
  // first pass; the glass should be *felt* (a faint shimmer + the odd
  // sliding bead), not worn like a smudge filter.
  const beads = useMemo(
    () =>
      Array.from({ length: Math.round(22 * Math.min(1.2, intensity)) }, (_, i) => ({
        id: `bead-${i}`,
        left: rand(1, 98),
        top: rand(2, 96),
        size: rand(1.5, 4.2),
        opacity: rand(0.035, 0.08),
        blur: rand(0.2, 0.6),
      })),
    [intensity]
  );
  const drops = useMemo(
    () =>
      Array.from({ length: Math.round(7 * intensity) }, (_, i) => ({
        id: `drop-${i}`,
        left: rand(3, 96),
        top: rand(-30, 90),
        size: rand(6, 12),
        tail: rand(18, 52),
        dur: rand(4.5, 9.5),
        delay: rand(-8, 0),
        opacity: rand(0.1, 0.17),
        drift: rand(-3, 3),
        wobble: rand(0.6, 1.8),
      })),
    [intensity]
  );
  const large = useMemo(
    () =>
      Array.from({ length: Math.round(2 * Math.min(1.5, intensity)) }, (_, i) => ({
        id: `large-${i}`,
        left: rand(8, 92),
        top: rand(-20, 60),
        size: rand(11, 17),
        tail: rand(36, 72),
        dur: rand(6.5, 11),
        delay: rand(-7, -0.5),
        opacity: rand(0.09, 0.16),
        drift: rand(-2, 2),
      })),
    [intensity]
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[22] overflow-hidden" aria-hidden>
      {/* tiny static condensation — subtle, no motion */}
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
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 0%, rgba(200,220,255,0.24) 32%, rgba(180,210,255,0.1) 58%, transparent 78%)`,
            boxShadow: `0 0 ${b.size * 0.8}px rgba(255,255,255,0.1)`,
            filter: `blur(${b.blur}px)`,
          } as React.CSSProperties}
        />
      ))}
      {/* sliding drops with tail */}
      {drops.map((d) => (
        <span
          key={d.id}
          className="fx-rain-lens-drop absolute will-change-transform"
          style={
            {
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size + d.tail,
              opacity: d.opacity,
              animation: `rain-lens-slide ${d.dur}s linear ${d.delay}s infinite`,
              ["--drift" as any]: `${d.drift}px`,
              ["--wobble" as any]: `${d.wobble}deg`,
            } as React.CSSProperties
          }
        >
          {/* tail — vertical streak fading up */}
          <span
            className="absolute left-1/2 top-0 block -translate-x-1/2"
            style={{
              width: Math.max(1, d.size * 0.18),
              height: d.tail,
              background: `linear-gradient(180deg, transparent 0%, rgba(175,205,255,0.08) 35%, rgba(175,205,255,0.15) 78%, rgba(200,225,255,0.28) 100%)`,
              filter: `blur(${Math.max(0.2, d.size * 0.06)}px)`,
              borderRadius: 999,
            }}
          />
          {/* head — glass bead */}
          <span
            className="absolute bottom-0 left-1/2 block -translate-x-1/2 rounded-full"
            style={{
              width: d.size,
              height: d.size,
              background: `radial-gradient(ellipse at 32% 28%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.36) 14%, rgba(190,215,255,0.2) 38%, rgba(160,195,235,0.1) 62%, transparent 78%)`,
              boxShadow: `inset 0 0 ${d.size * 0.35}px rgba(255,255,255,0.22), inset 0 -${d.size * 0.15}px ${d.size * 0.25}px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)`,
              border: `0.5px solid rgba(255,255,255,0.13)`,
              backdropFilter: `blur(0.5px)`,
            } as React.CSSProperties}
          />
        </span>
      ))}
      {large.map((d) => (
        <span
          key={d.id}
          className="fx-rain-lens-drop absolute will-change-transform"
          style={
            {
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size + d.tail,
              opacity: d.opacity,
              animation: `rain-lens-slide-large ${d.dur}s cubic-bezier(0.2,0.6,0.3,1) ${d.delay}s infinite`,
              ["--drift" as any]: `${d.drift}px`,
            } as React.CSSProperties
          }
        >
          <span
            className="absolute left-1/2 top-0 block -translate-x-1/2"
            style={{
              width: Math.max(1.2, d.size * 0.22),
              height: d.tail,
              background: `linear-gradient(180deg, transparent 0%, rgba(165,195,235,0.06) 40%, rgba(175,205,255,0.14) 82%, rgba(210,230,255,0.26) 100%)`,
              filter: `blur(0.6px)`,
              borderRadius: 999,
            }}
          />
          <span
            className="absolute bottom-0 left-1/2 block -translate-x-1/2 rounded-full"
            style={{
              width: d.size,
              height: d.size,
              background: `radial-gradient(ellipse at 30% 26%, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.32) 18%, rgba(185,210,255,0.18) 44%, rgba(150,180,220,0.09) 68%, transparent 82%)`,
              boxShadow: `inset 0 0 ${d.size * 0.4}px rgba(255,255,255,0.24), inset 0 -${d.size * 0.2}px ${d.size * 0.3}px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.1)`,
              border: `0.5px solid rgba(255,255,255,0.15)`,
              backdropFilter: `blur(0.6px)`,
            } as React.CSSProperties}
          />
        </span>
      ))}
      {/* very subtle overall condensation haze — neutral, not blue */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 28%)`,
          filter: "blur(0.8px)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AMBIENT ATMOSPHERE — always-on subtle dust + light shafts           */
/*  Shown even when particles = none, if lights/dim present             */
/*  Volumetric shafts now parallax-mid + flicker on tension             */
/* ------------------------------------------------------------------ */
export function AmbientAtmosphere({
  cinematic,
  reducedMotion,
  ambientAudio,
}: {
  cinematic?: CinematicSettings;
  reducedMotion?: boolean;
  ambientAudio?: string;
}) {
  const hasLights = (cinematic?.lights?.length ?? 0) > 0 || !!cinematic?.lightSource;
  const dim = cinematic?.dimAmount ?? 0;
  const showShafts = (cinematic as any)?.volumetricShafts !== false;
  const shaftsIntensity = (cinematic as any)?.shaftsIntensity ?? 1;
  const shouldShow = (hasLights && showShafts) || dim > 0.18;
  const isTension = ambientAudio === "tension";
  const [flicker, setFlicker] = useState(1);

  // flicker intensity sin(time)*0.15 when tension
  useEffect(() => {
    if (!isTension || reducedMotion) {
      setFlicker(1);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const t = now * 0.001;
      const f = 0.85 + Math.sin(t * 1.8) * 0.15 + Math.sin(t * 3.1 + 1.3) * 0.07;
      setFlicker(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isTension, reducedMotion]);

  if (!shouldShow) return null;
  if (reducedMotion) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden opacity-30" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-100/[0.03] to-transparent" />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden" aria-hidden>
      <DustCanvas cinematic={cinematic} density={36} subtle />
      {/* faint volumetric light cones — now parallax-mid drifting with --par-x */}
      {hasLights && showShafts && (
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{ opacity: 0.18 * flicker * shaftsIntensity } as React.CSSProperties}
          aria-hidden
        >
          {/* Each shaft sits in its own parallax-mid plane (pointer drift);
           * the shape carries the inline transform/rotate. The tension
           * flicker lives on the parent opacity (the rAF-driven `flicker`
           * state) — a per-shaft Date.now() term would re-roll opacity on
           * every re-render and jitter in step with React commits instead of
           * time. */}
          {resolveLights(cinematic)
            .slice(0, 4)
            .map((lt, i) => (
              <div
                key={i}
                className="parallax-mid pointer-events-none"
                style={{ "--plane-shift": `${(6 + (lt.size / 100) * 18).toFixed(1)}px` } as React.CSSProperties}
                aria-hidden
              >
                <div
                  className="absolute top-0 h-full will-change-transform"
                  style={
                    {
                      left: `${lt.x}%`,
                      width: `${lt.size * 1.4}%`,
                      background: `linear-gradient(180deg, transparent 0%, ${glowColorWithAlpha(lt.color, 0.1)} 14%, ${glowColorWithAlpha(lt.color, 0.05)} 38%, ${glowColorWithAlpha(lt.color, 0.02)} 62%, transparent 88%)`,
                      filter: `blur(22px)`,
                      transform: `translateX(-50%) rotate(${(lt.x - 50) * 0.06}deg)`,
                      transformOrigin: "top center",
                      opacity: lt.intensity ?? 0.5,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
        </div>
      )}
      {/* extra dust motes caught in shafts */}
      {hasLights && showShafts && <DustCanvas cinematic={cinematic} density={18} subtle />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN PARTICLES SWITCH                                                */
/* ------------------------------------------------------------------ */
export function Particles({ kind, soundOn, cinematic, reducedMotion, ambientAudio, config }: ParticlesProps) {
  if (kind === "none") {
    // still render subtle atmosphere if scene has lights/dim
    return <AmbientAtmosphere cinematic={cinematic} reducedMotion={reducedMotion} ambientAudio={ambientAudio} />;
  }

  if (reducedMotion) {
    // reduced: keep a static visual hint but no motion, no canvas, no rAF.
    if (kind === "fog") return <div className="pointer-events-none absolute inset-0 z-[19] bg-gradient-to-b from-transparent via-paper/[0.04] to-paper/[0.07]" aria-hidden />;
    if (kind === "dust" || kind === "motes") return <div className="pointer-events-none absolute inset-0 z-[20] opacity-20" style={{ backgroundImage: "radial-gradient(rgba(242,232,213,0.5) 0.6px, transparent 1px)", backgroundSize: "28px 28px" }} aria-hidden />;
    if (kind === "rain" || kind === "drizzle") return <div className="pointer-events-none absolute inset-0 z-[20] opacity-30" aria-hidden />;
    // Every other kind (storm, snow, smoke, ember, ash, fireflies) is a
    // motion-only effect: nothing to show at rest. The catch-all matters —
    // without it the code fell through and mounted the FULL canvas engine
    // (lightning rAF loops, 140 snowflakes, thunder timers) for exactly the
    // users the setting exists to protect.
    return <div className="pointer-events-none absolute inset-0" aria-hidden />;
  }

  const isRain = kind === "rain" || kind === "drizzle" || kind === "storm";
  // Off unless a scene asks for it (the director had it taken off every scene on 11 October 2026)
  const depthFogOn = (cinematic as any)?.depthFog === true;
  const fogStrength = (cinematic as any)?.fogStrength ?? 0.6;
  // Defaults to ON for rain scenes, but an EXPLICIT false from Studio (the
  // checkbox writes false, not undefined) must win — the render gate below
  // is `rainLensOn` alone, never `rainLensOn || isRain`.
  const rainLensOn = (cinematic as any)?.rainOnLens ?? isRain;
  const rainLensIntensity = (cinematic as any)?.rainLensIntensity ?? (kind === "storm" ? 1.6 : kind === "rain" ? 1.2 : 0.6);

  // scene.particleConfig (Studio: Particle Effects sliders). Unset leaves every effect exactly as it was.
  const dens = Math.max(0, Math.min(2, config?.density ?? 1));
  const gust = Math.max(0, Math.min(3, config?.wind ?? 1));
  const strength = Math.max(0, Math.min(1, config?.opacity ?? 1));

  return (
    <div className="pointer-events-none absolute inset-0 z-[20] overflow-hidden" aria-hidden>
      <div className="pointer-events-none absolute inset-0" style={strength < 1 ? { opacity: strength } : undefined} data-particle-strength={strength}>
        {kind === "rain" && <RainCanvas key={`rain-${dens}`} intensity={1.2 * dens} wind={gust} />}
        {kind === "drizzle" && <RainCanvas key={`drizzle-${dens}`} intensity={0.45 * dens} wind={gust} />}
        {kind === "storm" && (
          <>
            <RainCanvas key={`storm-${dens}`} intensity={1.5 * dens} wind={gust} />
            <StormLightning soundOn={soundOn} />
          </>
        )}
        {kind === "snow" && <SnowCanvas kind="snow" />}
        {kind === "smoke" && <SmokeCanvas />}
        {kind === "dust" && <DustCanvas key={`dust-${dens}`} cinematic={cinematic} density={Math.round(88 * dens)} />}
        {kind === "motes" && <DustCanvas key={`motes-${dens}`} cinematic={cinematic} density={Math.round(54 * dens)} />}
        {kind === "fog" && depthFogOn && <FogBanks cinematic={cinematic} density={fogStrength * 1.8} />}
        {kind === "ember" && <EmberCanvas kind="ember" cinematic={cinematic} />}
        {kind === "ash" && <EmberCanvas kind="ash" cinematic={cinematic} />}
        {kind === "fireflies" && <FirefliesCanvas cinematic={cinematic} />}
      </div>
      {/* rain on lens overlay — improved glass droplets with tail. Gated on
       * rainLensOn ALONE: it already defaults to isRain, and OR-ing isRain in
       * again would make an explicit "off" from Studio impossible on rain
       * scenes (the whole point of the toggle). */}
      {rainLensOn && <RainLensOverlay intensity={rainLensIntensity} />}
      {/* atmosphere underlay for light interaction — shafts */}
      {(kind === "dust" || kind === "motes" || (kind === "fog" && depthFogOn)) && (
        <AmbientAtmosphere cinematic={cinematic} reducedMotion={reducedMotion} ambientAudio={ambientAudio} />
      )}
    </div>
  );
}
