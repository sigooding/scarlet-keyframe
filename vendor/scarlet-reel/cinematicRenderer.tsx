import React, { useMemo } from "react";
import type { CinematicSettings } from "./types";
import { assetBackground } from "./assetPath";
import {
  calculateGhostElements,
  GRADE_PRESETS,
  lensFlareStyle,
  lightStyle,
  resolveLensFlares,
  resolveLights,
  type ResolvedLensFlare,
} from "./cinematic";
import { reducedMotionCinematicMode } from "./game/useReducedMotion";

function bgStyle(bg: string): React.CSSProperties {
  const resolved = assetBackground(bg);
  if (resolved.startsWith("gradient:")) return { background: resolved.slice(9) };
  if (resolved.startsWith("video:")) return { background: "#05050a" };
  return { backgroundImage: `url(${resolved})`, backgroundSize: "cover", backgroundPosition: "center" };
}

/** Grade + film-stock + parallax classes for a cinematic plate. The colour
 * grade is a class only for non-dolly-zoom modes (the dolly-zoom keyframes
 * own `filter` for the blur, so its grade filter is baked into the keyframes
 * via --cin-grade-filter); the film treatment and parallax wrapper are plain
 * classes that work with any mode. */
function cinematicGradeClasses(c: CinematicSettings | undefined): string {
  const out: string[] = [];
  const grade = c?.colorGrade ? GRADE_PRESETS[c.colorGrade] : undefined;
  const film = !!c?.filmGrade;
  if (grade && (c?.mode ?? "pan") !== "dolly-zoom") out.push(`cin-grade-${grade.id}`);
  if (film) out.push("film-grade");
  return out.join(" ");
}

/** The clean (no-blur) grade filter for SPRITE layers — foreground extras,
 * the primary foreground subject, hotspot object images, talking portraits
 * and the stage walker. The plate takes the grade via its cin-grade-* class;
 * sprites render in layers above it, so without this they'd float ungraded
 * (full colour over a 1940s black & white plate). Same preset, same filter,
 * so sprite pixels match the plate exactly. */
export function spriteGradeStyle(c?: CinematicSettings): React.CSSProperties {
  const grade = c?.colorGrade ? GRADE_PRESETS[c.colorGrade] : undefined;
  if (!grade?.filter || grade.filter === "none") return {};
  return { filter: grade.filter };
}

/** The split-tone wash + scratch layer that sit ABOVE a graded/filmed plate
 * (also the only grade treatment video cutscenes can show — a video frame
 * can't take a CSS filter). Render inside the same relative container as the
 * plate so it covers it exactly. */
export function CinematicOverlays({ cinematic }: { cinematic?: CinematicSettings }) {
  const grade = cinematic?.colorGrade ? GRADE_PRESETS[cinematic.colorGrade] : undefined;
  const film = !!cinematic?.filmGrade;
  if (!grade && !film) return null;
  const strength = Math.max(0, Math.min(1, cinematic?.filmGradeStrength ?? 0.7));
  return (
    <>
      {grade && (
        <div
          className="grade-wash"
          aria-hidden
          style={{
            background: grade.tint,
            "--grade-wash-op": grade.tintOpacity,
            "--grade-wash-blend": grade.tintBlend,
          } as React.CSSProperties}
        />
      )}
      {film && (
        <div
          className="film-scratches"
          aria-hidden
          style={{ "--film-strength": strength } as React.CSSProperties}
        />
      )}
      {/* The print's exposure flicker: a black veil, never the plate's own opacity (a plate that is not fully
          opaque shows the picture underneath it, which was the scene's own shot flickering over the beat's). */}
      {film && <div className="film-flicker" aria-hidden />}
    </>
  );
}

/** Build the CSS class + variables that apply cinematic camera motion and
 * dimming to an image layer. Used for the scene background and per-beat
 * replacement backgrounds. Light glows are separate layers (see LightGlow).
 *
 * `still: true` renders the layer WITHOUT camera motion, frozen at the plate's
 * t=0 frame: the slide/zoom scene-transition overlays use it to show the
 * DESTINATION scene's background art during the move. Motion modes start
 * mid-move (pan zoomed in, dolly offset, dolly-zoom at its start scale), so
 * the frozen transform is the keyframe's 0% value — not a bare identity —
 * which is what makes the overlay pixel-match the plate at the swap instant. */
export function cinematicLayer(c: CinematicSettings | undefined, url: string, opts?: { reducedMotion?: boolean; still?: boolean }): { className: string; style: React.CSSProperties } {
  const reduced = !!opts?.reducedMotion;
  const still = !!opts?.still;
  // Reduced motion: every moving camera mode becomes static; shake amplitude
  // is zeroed. Dim, grade, letterbox and lights still apply (they don't move).
  const rawMode = c?.mode ?? "pan";
  const mode = reduced || still ? reducedMotionCinematicMode(rawMode) : rawMode;
  const focalPos = c?.focalPoint ?? "50% 50%";
  const zoomDur = c?.zoomDuration ?? 8;
  const shake = reduced || still ? 0 : Math.max(0, Math.min(1, c?.shakeAmount ?? 0.5));
  // Roll defaults to intensity-derived so pre-existing shake scenes look the
  // same; authors can override it (and the jitter tempo) for finer control.
  const shakeRot = c?.shakeRotation ?? shake * 0.7;
  const shakeDur = Math.max(0.1, c?.shakeDuration ?? 0.5);
  // Slow pan drift — 0 keeps the old gentle push-in behaviour.
  const panDist = Math.max(0, c?.panDistance ?? 0);
  const panDir = c?.panDirection === "left" ? "-" : "";
  // Vertigo dolly-zoom: direction chooses which half of the move plays.
  const zoomAmount = Math.max(1, c?.dollyZoomAmount ?? 1.35);
  const zoomDir = c?.dollyZoomDirection ?? "both";
  const style: React.CSSProperties = {
    ...bgStyle(url),
    "--cin-zoom-dur": `${zoomDur}s`,
    "--cin-zoom-end": `scale(1.22) translate(${focalPos.split(" ").map((v) => `${((50 - parseFloat(v)) * 0.14).toFixed(2)}%`).join(", ")})`,
    "--cin-pan-x": `${panDir}${panDist}%`,
    "--cin-pan-y": "0%",
    "--cin-pan-dur": `${zoomDur}s`,
    "--cin-dim": String(c?.dimAmount ?? 0),
    // Handheld shake: amplitude in px + rotation in deg, driven by intensity.
    "--cin-shake-amt": `${(shake * 6).toFixed(2)}px`,
    "--cin-shake-rot": `${shakeRot.toFixed(2)}deg`,
    "--cin-shake-dur": `${shakeDur}s`,
    // Rail/dolly track: travel distance + direction + one-pass duration, plus
    // an optional vertical drift for a diagonal/crane pan.
    "--cin-dolly-dist": `${Math.max(0, c?.dollyDistance ?? 8)}%`,
    "--cin-dolly-dir": c?.dollyDirection === "left" ? "-1" : "1",
    "--cin-dolly-dur": `${Math.max(1, c?.dollyDuration ?? 10)}s`,
    "--cin-dolly-vert": `${Math.max(0, Math.min(8, c?.dollyVertical ?? 0))}%`,
    // Vertigo dolly-zoom: start/end scale (push in, pull out, or both) + blur.
    "--cin-dolly-zoom-from": `${zoomDir === "pull" ? zoomAmount : 1}`,
    "--cin-dolly-zoom-to": `${zoomDir === "pull" ? 1 : zoomAmount}`,
    "--cin-dolly-zoom-blur": `${Math.max(0, c?.dollyZoomBlur ?? 0)}px`,
    "--cin-dolly-zoom-dur": `${Math.max(1, c?.dollyZoomDuration ?? 8)}s`,
    // Colour grade: dolly-zoom keyframes own `filter` (the blur), so the grade
    // filter is baked into the keyframe variable; other modes take a class.
    // Keyed on rawMode (not `mode`) so a `still` dolly-zoom layer can freeze
    // at the plate's clean t=0 grade.
    ...(rawMode === "dolly-zoom" && !reduced
      ? {
          // Keyframes consume these; defaults keep the blur-only behaviour.
          "--cin-grade-filter": c?.colorGrade
            ? (GRADE_PRESETS[c.colorGrade]?.filterWithBlur ?? GRADE_PRESETS[c.colorGrade]?.filter ?? `blur(${Math.max(0, c?.dollyZoomBlur ?? 0)}px)`)
            : `blur(${Math.max(0, c?.dollyZoomBlur ?? 0)}px)`,
          "--cin-grade-filter-clean": c?.colorGrade ? (GRADE_PRESETS[c.colorGrade]?.filter ?? "none") : "none",
        }
      : {}),
    // Film-stock strength (drives grain/halation/scratch opacity).
    ...(c?.filmGrade
      ? {
          "--film-strength": String(Math.max(0, Math.min(1, c.filmGradeStrength ?? 0.7))),
        }
      : {}),
  } as React.CSSProperties;
  // Dolly needs the image larger than the frame so it has room to travel —
  // pin the height and let the width overflow instead of cropping to cover.
  // Keyed on rawMode (not `mode`) so a `still` dolly layer keeps the same
  // sizing as the moving plate it is matched against at the swap.
  if (rawMode === "dolly" && !reduced) {
    style.backgroundSize = "auto 122%";
    style.backgroundPosition = "center center";
  }
  // A dolly-zoom scales about its origin: the frame's centre unless the shot names one, so a pull-out can start close on
  // people away from the middle. Keyed on rawMode so a `still` layer freezes about the same point.
  if (rawMode === "dolly-zoom" && c?.dollyZoomOrigin) style.transformOrigin = c.dollyZoomOrigin;
  const className = [
    mode === "pan"
      ? "cin-pan"
      : mode === "zoom-hold"
        ? "cin-zoom-hold"
        : mode === "shake"
          ? "cin-shake"
          : mode === "dolly"
            ? "cin-dolly"
            : mode === "dolly-zoom"
              ? zoomDir === "push"
                ? "cin-dolly-zoom-push"
                : zoomDir === "pull"
                  ? "cin-dolly-zoom-pull"
                  : "cin-dolly-zoom"
              : "cin-static",
    (c?.dimAmount ?? 0) > 0 ? "cin-dim" : "",
    cinematicGradeClasses(c),
  ]
    .filter(Boolean)
    .join(" ");
  if (still && !reduced) {
    // Freeze at the plate's t=0 frame (each keyframe's 0% value, written with
    // the same --cin-* vars the animation consumes), so a moving scene's
    // overlay art lines up with the freshly-mounted plate at the swap.
    style.transform =
      rawMode === "pan"
        ? "scale(1.12) translate(calc(var(--cin-pan-x, 0%) * -0.5), calc(var(--cin-pan-y, 0%) * -0.5))"
        : rawMode === "dolly"
          ? "translateX(calc(var(--cin-dolly-dist, 8%) * -1 * var(--cin-dolly-dir, 1))) translateY(calc(var(--cin-dolly-vert, 0%) * -1))"
          : rawMode === "dolly-zoom"
            ? "scale(var(--cin-dolly-zoom-from, 1))"
            : rawMode === "shake"
              ? "scale(1.06)"
              : rawMode === "zoom-hold"
                ? "scale(1)"
                : undefined;
    // dolly-zoom keyframes own `filter`; at t=0 the plate is the clean grade.
    if (rawMode === "dolly-zoom") style.filter = "var(--cin-grade-filter-clean)";
  }
  return { className, style };
}
export function LightGlow({ cinematic }: { cinematic?: CinematicSettings }) {
  const lights = resolveLights(cinematic);
  if (!lights.length) return null;
  return (
    <>
      {lights.map((l, i) => (
        <div key={i} className="cin-light" style={lightStyle(l)} />
      ))}
    </>
  );
}

function SingleLensFlare({ flare }: { flare: ResolvedLensFlare }) {
  const ghosts = useMemo(() => calculateGhostElements(flare), [flare]);
  const style = useMemo(() => lensFlareStyle(flare), [flare]);

  const starburstRaysCount = flare.starburstRays;
  const rayAngles = useMemo(() => {
    const half = Math.max(2, Math.floor(starburstRaysCount / 2));
    const step = 180 / half;
    const angles: number[] = [];
    for (let i = 0; i < half; i++) {
      angles.push(i * step);
    }
    return angles;
  }, [starburstRaysCount]);

  return (
    <div className="cin-lensflare-container" style={style}>
      {/* 1. Anamorphic Horizontal Streak Beam */}
      {flare.streakIntensity > 0 && (
        <div className="cin-flare-streak-container">
          <div className="cin-flare-laser" />
          <div className="cin-flare-streak-wide" />
          <div className="cin-flare-streak-diffuse" />
        </div>
      )}

      {/* 2. Starburst / Diffraction Spikes */}
      {flare.starburstIntensity > 0 && (
        <div className="cin-flare-starburst-group">
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
      <div className="cin-flare-core-group">
        <div className="cin-flare-corona" />
        <div className="cin-flare-core" />
      </div>

      {/* 4. Optical Ghost Reflections Chain */}
      {flare.ghostIntensity > 0 &&
        ghosts.map((g) => {
          if (g.opacity <= 0.01) return null;
          const ghostStyle: React.CSSProperties = {
            left: `${g.x}%`,
            top: `${g.y}%`,
            width: `${g.size}vw`,
            height: `${g.size}vw`,
            maxWidth: `${g.size * 12}px`,
            maxHeight: `${g.size * 12}px`,
            opacity: g.opacity,
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
            return (
              <div
                key={g.id}
                className="cin-flare-ghost-element cin-flare-aperture-shape"
                style={{
                  ...ghostStyle,
                  transform: `translate(-50%, -50%) rotate(${g.rotateDeg ?? 0}deg)`,
                  background: `radial-gradient(circle at center, transparent 30%, ${g.color === "rainbow" ? flare.color : g.color} 100%)`,
                  border: `1.5px solid ${g.color === "rainbow" ? flare.color : g.color}`,
                  boxShadow: `inset 0 0 8px ${g.color === "rainbow" ? flare.color : g.color}`,
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
                  boxShadow: g.type === "ring" ? `0 0 6px ${g.color}, inset 0 0 6px ${g.color}` : undefined,
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

          // Standard disc
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

export function LensFlareLayer({
  cinematic,
  flareOverride,
}: {
  cinematic?: CinematicSettings;
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
        <SingleLensFlare key={i} flare={f} />
      ))}
    </>
  );
}

