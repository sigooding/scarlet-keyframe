import React, { useMemo } from "react";
import type { CinematicSettings } from "../../vendor/scarlet-reel/types";
import {
  calculateGhostElements,
  GRADE_PRESETS,
  lensFlareStyle,
  lightStyle,
  resolveLensFlares,
  resolveLights,
  type ResolvedLensFlare,
  type ResolvedLight,
} from "../../vendor/scarlet-reel/cinematic";
import { solveCubicBezier } from "../sequence/animate";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function posMod(n: number, span: number): number {
  const m = Math.max(1e-6, span);
  return ((n % m) + m) % m;
}

/**
 * Matches a CSS `@keyframes` loop with stops `0%, 100%` (min) and `50%` (max)
 * under `animation-timing-function: ease-in-out` (`cubic-bezier(0.42, 0, 0.58, 1)`
 * applied per keyframe interval `[0%, 50%]` and `[50%, 100%]`).
 */
export function pulseWaveEaseInOut(timeSec: number, durationSec: number): number {
  const dur = Math.max(0.1, Number.isFinite(durationSec) ? durationSec : 2.8);
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const cycle = posMod(t / dur, 1);
  if (cycle <= 0.5) {
    return solveCubicBezier(0.42, 0, 0.58, 1, cycle * 2);
  }
  return 1 - solveCubicBezier(0.42, 0, 0.58, 1, (cycle - 0.5) * 2);
}

/**
 * Matches `@keyframes grain-jitter` (`0.9s steps(4) infinite`) in `effects.css`.
 */
export function evaluateGrainJitterTransform(timeSec: number): string {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const step = Math.floor(posMod(t / 0.9, 1) * 4);
  if (step === 1) return "translate(-2%, 1.4%)";
  if (step === 2) return "translate(1.6%, -1.8%)";
  if (step === 3) return "translate(-1.2%, -0.8%)";
  return "translate(0%, 0%)";
}

/**
 * Matches `@keyframes film-grain-jitter` (`0.5s steps(3) infinite`) in `effects.css`.
 */
export function evaluateFilmGrainTransform(timeSec: number): string {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const step = Math.floor(posMod(t / 0.5, 1) * 3);
  if (step === 1) return "translate(-2.4%, 1.6%)";
  if (step === 2) return "translate(2.2%, -1.4%)";
  return "translate(0%, 0%)";
}

/**
 * Matches `@keyframes film-gate-weave` (`3.4s ease-in-out infinite alternate`) in `effects.css`.
 */
export function evaluateFilmGateWeaveTransform(timeSec: number, durSec = 3.4): string {
  const dur = Math.max(0.2, durSec);
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const twoCycle = posMod(t / dur, 2);
  const raw = twoCycle <= 1 ? twoCycle : 2 - twoCycle;
  if (raw <= 0.5) {
    const k = solveCubicBezier(0.42, 0, 0.58, 1, raw * 2);
    return `translate(${lerp(0.4, -0.5, k).toFixed(3)}px, ${lerp(-0.3, 0.3, k).toFixed(3)}px) scale(1.004)`;
  }
  const k = solveCubicBezier(0.42, 0, 0.58, 1, (raw - 0.5) * 2);
  return `translate(${lerp(-0.5, 0.3, k).toFixed(3)}px, ${lerp(0.3, 0.4, k).toFixed(3)}px) scale(1.004)`;
}

export const TOKYO_NOIR_WASH = {
  tint: "radial-gradient(ellipse at 50% 44%, rgba(255, 206, 148, 0.08) 0%, rgba(10, 18, 28, 0.34) 72%, rgba(4, 7, 13, 0.62) 100%), linear-gradient(180deg, rgba(10, 22, 34, 0.34) 0%, rgba(0, 0, 0, 0) 36%, rgba(5, 11, 20, 0.44) 100%)",
  tintOpacity: 0.9,
  tintBlend: "soft-light" as const,
};

/**
 * Frame-driven ambient grain overlay (replaces `.fx-grain::after`).
 */
export function FrameGrainOverlay({
  active,
  timeSec,
  opacity = 0.08,
}: {
  active: boolean;
  timeSec: number;
  opacity?: number;
}) {
  if (!active) return null;
  const transform = evaluateGrainJitterTransform(timeSec);
  const clampedOp = Math.max(0, Math.min(0.25, Number.isFinite(opacity) ? opacity : 0.08));
  return (
    <div
      className="frame-grain-overlay"
      data-testid="frame-grain-overlay"
      aria-hidden
      style={{
        position: "absolute",
        inset: "-50%",
        pointerEvents: "none",
        zIndex: 40,
        opacity: clampedOp,
        backgroundImage:
          "repeating-radial-gradient(circle at 17% 32%, rgba(255, 255, 255, 0.9) 0 0.6px, transparent 0.9px 2.2px)",
        transform,
        animation: "none",
        transition: "none",
      }}
    />
  );
}

/**
 * Frame-driven replacement for `CinematicOverlays` + `.film-grade` animations
 * (`grade-wash`, halation bloom, `film-grain-jitter`, `film-scratches`, `film-flicker`).
 */
export function FrameCinematicOverlays({
  cinematic,
  timeSec,
}: {
  cinematic?: CinematicSettings & {
    vignette?: boolean;
    vignetteStrength?: number;
  };
  timeSec: number;
}) {
  const rawGradeId = String((cinematic as Record<string, unknown> | undefined)?.colorGrade || "");
  const grade =
    rawGradeId === "tokyo-noir"
      ? TOKYO_NOIR_WASH
      : cinematic?.colorGrade
        ? GRADE_PRESETS[cinematic.colorGrade]
        : undefined;
  const film = !!cinematic?.filmGrade;
  const hasVignette = Boolean((cinematic as Record<string, unknown> | undefined)?.vignette);
  const rawVigStrength = Number((cinematic as Record<string, unknown> | undefined)?.vignetteStrength);
  const vignetteStrength = Number.isFinite(rawVigStrength)
    ? Math.max(0, Math.min(1, rawVigStrength))
    : 0.36;

  if (!grade && !film && !hasVignette) return null;

  const strength = Math.max(0, Math.min(1, cinematic?.filmGradeStrength ?? 0.7));
  const t = Number.isFinite(timeSec) ? timeSec : 0;

  // @keyframes film-scratch-flicker (7s steps(1) infinite)
  const scratchPct = posMod(t / 7, 1) * 100;
  const scratchOpacity =
    scratchPct >= 89 && scratchPct < 91
      ? strength * 0.5
      : scratchPct >= 97 && scratchPct < 99
        ? strength * 0.35
        : 0;

  // @keyframes film-flicker (0.38s steps(2, end) infinite, amp = 0.05)
  const flickerPct = posMod(t / 0.38, 1) * 100;
  const flickerAmp = 0.05;
  const flickerOpacity =
    flickerPct < 20
      ? 0
      : flickerPct < 40
        ? flickerAmp * 0.5
        : flickerPct < 50
          ? flickerAmp
          : flickerPct < 60
            ? flickerAmp * 0.5
            : flickerPct < 80
              ? 0
              : flickerAmp * 0.3;

  return (
    <>
      {grade && (
        <div
          className="grade-wash"
          aria-hidden
          style={
            {
              background: grade.tint,
              "--grade-wash-op": grade.tintOpacity,
              "--grade-wash-blend": grade.tintBlend,
              animation: "none",
              transition: "none",
            } as React.CSSProperties
          }
        />
      )}
      {hasVignette && vignetteStrength > 0.001 && (
        <div
          className="frame-vignette-overlay"
          data-testid="frame-vignette-overlay"
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 4,
            opacity: vignetteStrength,
            background:
              "radial-gradient(ellipse at 50% 48%, rgba(0, 0, 0, 0) 46%, rgba(3, 6, 12, 0.55) 82%, rgba(1, 2, 6, 0.92) 100%)",
            animation: "none",
            transition: "none",
          }}
        />
      )}
      {film && (
        <>
          <div
            className="frame-film-halation"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 3,
              opacity: strength * 0.22,
              background:
                "radial-gradient(ellipse at 50% 110%, rgba(255, 226, 170, 0.5) 0%, transparent 55%), radial-gradient(ellipse at 50% -10%, rgba(255, 244, 214, 0.28) 0%, transparent 60%)",
              mixBlendMode: "screen",
              animation: "none",
              transition: "none",
            }}
          />
          <div
            className="frame-film-grain"
            aria-hidden
            style={{
              position: "absolute",
              inset: "-60%",
              pointerEvents: "none",
              zIndex: 4,
              opacity: strength * 0.16,
              backgroundImage:
                "repeating-radial-gradient(circle at 21% 37%, rgba(255, 255, 255, 0.95) 0 0.7px, transparent 1px 2.4px)",
              transform: evaluateFilmGrainTransform(t),
              animation: "none",
              transition: "none",
            }}
          />
          <div
            className="film-scratches"
            aria-hidden
            style={
              {
                "--film-strength": strength,
                opacity: scratchOpacity,
                animation: "none",
                transition: "none",
              } as React.CSSProperties
            }
          />
          <div
            className="film-flicker"
            aria-hidden
            style={{
              opacity: flickerOpacity,
              animation: "none",
              transition: "none",
            }}
          />
        </>
      )}
    </>
  );
}

/**
 * Pure opacity calculation for a single light point (`@keyframes glow-breathe`).
 */
export function evaluateLightGlowOpacity(light: ResolvedLight, timeSec: number): number {
  const k = pulseWaveEaseInOut(timeSec, light.pulseSeconds);
  const amp = light.pulseAmount * 0.5;
  const minOp = light.intensity * (1 - amp);
  return lerp(minOp, light.intensity, k);
}

/**
 * Frame-driven replacement for `LightGlow` (`vendor/scarlet-reel/cinematicRenderer.tsx`).
 */
export function FrameLightGlow({
  cinematic,
  timeSec,
}: {
  cinematic?: CinematicSettings;
  timeSec: number;
}) {
  const lights = useMemo(() => resolveLights(cinematic), [cinematic]);
  if (!lights.length) return null;

  return (
    <>
      {lights.map((l, i) => {
        const opacity = evaluateLightGlowOpacity(l, timeSec);
        return (
          <div
            key={i}
            className="cin-light"
            data-testid={`frame-light-${i}`}
            style={{
              ...lightStyle(l),
              opacity,
              animation: "none",
              transition: "none",
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Pure frame-time sample for a resolved lens flare (`cin-flare-shimmer`,
 * `cin-streak-shimmer`, `cin-starburst-twinkle`, `cin-ghost-float`).
 */
export function evaluateLensFlareSample(flare: ResolvedLensFlare, timeSec: number) {
  const k = pulseWaveEaseInOut(timeSec, flare.pulseSeconds);
  const kStar = pulseWaveEaseInOut(timeSec, flare.pulseSeconds * 1.2);
  const amp = flare.pulseAmount * 0.5;

  const coreOpacity = lerp(flare.intensity * (1 - amp), flare.intensity, k);
  const coreScale = lerp(1 - amp * 0.06, 1 + amp * 0.06, k);

  const streakBase = flare.streakIntensity * flare.intensity;
  const streakOpacity = lerp(streakBase * (1 - amp * 0.35), streakBase, k);
  const streakScaleX = lerp(0.96, 1.04, k);
  const streakScaleY = lerp(0.92, 1.08, k);

  const starBase = flare.starburstIntensity * flare.intensity;
  const starOpacity = lerp(starBase * (1 - amp * 0.4), starBase, kStar);
  const starRotDeg = lerp(0, 3.5, kStar);
  const starScale = lerp(0.95, 1.05, kStar);

  const ghostDxPx = (50 - flare.x) * flare.reactivity * 0.08 * k;
  const ghostDyPx = (50 - flare.y) * flare.reactivity * 0.08 * k;

  return {
    coreOpacity,
    coreScale,
    streakOpacity,
    streakScaleX,
    streakScaleY,
    starOpacity,
    starRotDeg,
    starScale,
    ghostDxPx,
    ghostDyPx,
  };
}

function FrameSingleLensFlare({
  flare,
  timeSec,
}: {
  flare: ResolvedLensFlare;
  timeSec: number;
}) {
  const ghosts = useMemo(() => calculateGhostElements(flare), [flare]);
  const style = useMemo(() => lensFlareStyle(flare), [flare]);

  const starburstRaysCount = flare.starburstRays;
  const rayAngles = useMemo(() => {
    const half = Math.max(2, Math.floor(starburstRaysCount / 2));
    const step = 180 / half;
    const angles: number[] = [];
    for (let i = 0; i < half; i += 1) {
      angles.push(i * step);
    }
    return angles;
  }, [starburstRaysCount]);

  const sample = evaluateLensFlareSample(flare, timeSec);

  return (
    <div
      className="cin-lensflare-container"
      data-testid="frame-lens-flare"
      data-flare-time={timeSec.toFixed(4)}
      style={{
        ...style,
        animation: "none",
        transition: "none",
      }}
    >
      {/* 1. Anamorphic Horizontal Streak Beam */}
      {flare.streakIntensity > 0 && (
        <div
          className="cin-flare-streak-container"
          data-testid="frame-flare-streak"
          style={{
            opacity: sample.streakOpacity,
            transform: `translate(-50%, -50%) rotate(${flare.streakAngle}deg) scaleX(${sample.streakScaleX.toFixed(4)}) scaleY(${sample.streakScaleY.toFixed(4)})`,
            animation: "none",
            transition: "none",
          }}
        >
          <div className="cin-flare-laser" />
          <div className="cin-flare-streak-wide" />
          <div className="cin-flare-streak-diffuse" />
        </div>
      )}

      {/* 2. Starburst / Diffraction Spikes */}
      {flare.starburstIntensity > 0 && (
        <div
          className="cin-flare-starburst-group"
          data-testid="frame-flare-starburst"
          style={{
            opacity: sample.starOpacity,
            transform: `translate(-50%, -50%) rotate(${sample.starRotDeg.toFixed(4)}deg) scale(${sample.starScale.toFixed(4)})`,
            animation: "none",
            transition: "none",
          }}
        >
          {rayAngles.map((angle, i) => (
            <div
              key={i}
              className="cin-flare-ray"
              style={{ "--ray-rot": `${angle}deg` } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* 3. Central Core & Corona Halo */}
      <div
        className="cin-flare-core-group"
        data-testid="frame-flare-core"
        style={{
          opacity: sample.coreOpacity,
          transform: `translate(-50%, -50%) scale(${sample.coreScale.toFixed(4)})`,
          animation: "none",
          transition: "none",
        }}
      >
        <div className="cin-flare-corona" />
        <div className="cin-flare-core" />
      </div>

      {/* 4. Optical Ghost Reflections Chain */}
      {flare.ghostIntensity > 0 &&
        ghosts.map((g) => {
          if (g.opacity <= 0.01) return null;
          const floatTransform = `translate(-50%, -50%) translate(${sample.ghostDxPx.toFixed(3)}px, ${sample.ghostDyPx.toFixed(3)}px)`;
          const ghostStyle: React.CSSProperties = {
            left: `${g.x}%`,
            top: `${g.y}%`,
            width: `${g.size}vw`,
            height: `${g.size}vw`,
            maxWidth: `${g.size * 12}px`,
            maxHeight: `${g.size * 12}px`,
            opacity: g.opacity,
            transform: floatTransform,
            animation: "none",
            transition: "none",
          };

          if (g.type === "halo-rainbow") {
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element cin-flare-halo-rainbow"
                style={ghostStyle}
              />
            );
          }

          if (g.type === "aperture") {
            const col = g.color === "rainbow" ? flare.color : g.color;
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element cin-flare-aperture-shape"
                style={{
                  ...ghostStyle,
                  transform: `${floatTransform} rotate(${g.rotateDeg ?? 0}deg)`,
                  background: `radial-gradient(circle at center, transparent 30%, ${col} 100%)`,
                  border: `1.5px solid ${col}`,
                  boxShadow: `inset 0 0 8px ${col}`,
                }}
              />
            );
          }

          if (g.type === "ring" || g.type === "ring-thin") {
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element rounded-full"
                style={{
                  ...ghostStyle,
                  border: `${g.type === "ring" ? 1.5 : 1}px solid ${g.color}`,
                  boxShadow:
                    g.type === "ring"
                      ? `0 0 6px ${g.color}, inset 0 0 6px ${g.color}`
                      : undefined,
                  background: `radial-gradient(circle at center, transparent 70%, ${g.color}33 90%)`,
                }}
              />
            );
          }

          if (g.type === "star-pin") {
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element flex items-center justify-center"
                style={{
                  ...ghostStyle,
                  width: `${g.size * 0.8}vw`,
                  height: `${g.size * 0.8}vw`,
                }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: "100%",
                    height: "100%",
                    background: `radial-gradient(circle at center, #ffffff 0%, ${g.color} 60%, transparent 85%)`,
                    boxShadow: `0 0 10px #ffffff, 0 0 18px ${g.color}`,
                  }}
                />
              </div>
            );
          }

          if (g.type === "disc-soft" || g.type === "disc-wide") {
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element rounded-full"
                style={{
                  ...ghostStyle,
                  background: `radial-gradient(circle at center, ${g.color} 0%, transparent 70%)`,
                  filter: `blur(${g.type === "disc-wide" ? 6 : 3}px)`,
                }}
              />
            );
          }

          return (
            <div
              key={g.id}
              className="cin-flare-ghost-element rounded-full"
              style={{
                ...ghostStyle,
                background: `radial-gradient(circle at center, ${g.color} 0%, ${g.color}66 45%, transparent 75%)`,
                boxShadow: `0 0 12px ${g.color}44`,
              }}
            />
          );
        })}
    </div>
  );
}

/**
 * Frame-driven replacement for `LensFlareLayer` (`vendor/scarlet-reel/cinematicRenderer.tsx`).
 */
export function FrameLensFlareLayer({
  cinematic,
  timeSec,
  flareOverride,
}: {
  cinematic?: CinematicSettings;
  timeSec: number;
  flareOverride?: ResolvedLensFlare | null;
}) {
  const flares = useMemo(() => {
    if (flareOverride) return [flareOverride];
    return resolveLensFlares(cinematic);
  }, [cinematic, flareOverride]);

  if (!flares.length) return null;

  return (
    <>
      {flares.map((f, i) => (
        <FrameSingleLensFlare key={i} flare={f} timeSec={timeSec} />
      ))}
    </>
  );
}
