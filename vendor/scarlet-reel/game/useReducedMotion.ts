/**
 * useReducedMotion — a small, focused hook that honours
 * prefers-reduced-motion across the game engine.
 *
 * Why this exists:
 * The CSS file already has a blanket `@media (prefers-reduced-motion: reduce)`
 * that kills animation-duration, but JS-driven effects (cinematic mode swaps,
 * QTE shaky-cam overrides, scene-transition type, heartbeat stings) need to
 * know the preference *in code* so they can choose a calmer alternative
 * instead of merely having their animation zeroed after the fact.
 *
 * Two layers:
 *   1. prefersReducedMotion() — pure, testable, no DOM — returns true when
 *      matchMedia says reduce.
 *   2. usePrefersReducedMotion() — React hook that subscribes to changes.
 *
 * Used by:
 *   - Game.tsx cinematicLayer override (shake -> static)
 *   - Game.tsx scene transition (fade/fade-black -> cut)
 *   - Game.tsx QTE critical path (no shaky-cam, no heartbeat pulse)
 *   - Stage.tsx parallax tracker already checks, but now uses the hook too
 *   - animation.ts presetStyle / motionAnimation helpers
 */

import { useEffect, useState } from "react";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setReduced("matches" in e ? e.matches : (e as MediaQueryList).matches);
    };
    // Initial sync in case it changed between render and effect
    setReduced(mql.matches);
    // Modern browsers
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange as (e: MediaQueryListEvent) => void);
      return () => mql.removeEventListener("change", onChange as (e: MediaQueryListEvent) => void);
    }
    // Safari <14 fallback
    const legacy = mql as unknown as { addListener?: (fn: (e: MediaQueryList) => void) => void; removeListener?: (fn: (e: MediaQueryList) => void) => void };
    if (legacy.addListener) {
      legacy.addListener(onChange as (e: MediaQueryList) => void);
      return () => legacy.removeListener?.(onChange as (e: MediaQueryList) => void);
    }
  }, []);

  return reduced;
}

/**
 * Given a cinematic mode, return the calmer alternative when reduced motion
 * is requested. Shake/dolly/dolly-zoom become static; pan/zoom-hold become
 * static too when the user prefers no motion at all — the plate stays still
 * and only the narrative advances.
 */
export function reducedMotionCinematicMode(
  mode: string | undefined,
  reduced?: boolean
): string {
  const shouldReduce = reduced ?? true;
  if (!shouldReduce) return (mode ?? "static") as string;
  // All moving modes become static. The grade, lights, dim and letterbox
  // still apply (they don't move pixels).
  if (mode === "shake" || mode === "dolly" || mode === "dolly-zoom" || mode === "pan" || mode === "zoom-hold") {
    return "static";
  }
  return (mode ?? "static") as string;
}

/**
 * Scene entry transition under reduced motion: always cut, no fade.
 */
export function reducedMotionTransition(
  transition: string | undefined,
  reduced?: boolean
): string {
  const shouldReduce = reduced ?? true;
  if (!shouldReduce) return (transition ?? "cut") as string;
  return "cut";
}
