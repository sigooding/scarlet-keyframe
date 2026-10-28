# Scarlet Reel source

Rendering helpers are copied from https://github.com/sigooding/scarlett-witness at commit `debaaf2` (read-only checkout on 27 Oct 2026). Files are kept in the source layout under this directory so the editor can use the original camera, grade, depth, particle, timing, audio-fade and media routines rather than re-creating them from descriptions.

The upstream repository did not include a top-level license file in the checked-out revision. Source attribution and provenance are retained here; confirm distribution terms with the upstream author before publishing this vendor copy.

## Frame-driven replacements in `src/components/`

The editor viewer renders every frame purely from the timeline frame number (no `Math.random`, no autonomous `requestAnimationFrame` / timer loops, and no CSS `@keyframes` animations). Upstream vendor files remain untouched here; the viewer uses these frame-driven replacements in `src/components/`:

- **`src/components/FrameDepthParallax.tsx`** (`FrameDepthParallaxLayer`) — replaces `vendor/scarlet-reel/game/DepthParallax.tsx` (`DepthParallaxLayer`). Drives the 2.5D WebGL depth shader (`uZoom`, `uShift`, `depthAmount`) directly from evaluated keyframe values on each frame rather than an internal wall-clock `requestAnimationFrame` loop.
- **`src/components/FrameParticles.tsx`** (`FrameParticles` / `Particles`, `FrameRainLensOverlay`, `FrameAmbientAtmosphere`) — replaces `vendor/scarlet-reel/game/AmbientParticles.tsx` (`Particles`, `RainLensOverlay`, `AmbientAtmosphere`) and its `@keyframes` rules in `vendor/scarlet-reel/effects.css` / `index.css` (`rain-lens-slide`, `rain-lens-slide-large`, `smoke-drift`, `fog-drift-smart`, `storm-flash`). Computes rain, lens-rain droplets, snow, dust, motes, smoke, fog, embers, ash, fireflies, lightning, and volumetric shafts deterministically from `(seed = clipId, timeSec)`.
- **`src/components/FrameCinematicOverlays.tsx`** (`FrameCinematicOverlays`, `FrameGrainOverlay`, `FrameLightGlow`, `FrameLensFlareLayer`) — replaces `CinematicOverlays`, `LightGlow`, and `LensFlareLayer` in `vendor/scarlet-reel/cinematicRenderer.tsx` together with the CSS `@keyframes` animations in `vendor/scarlet-reel/effects.css` / `index.css` (`grain-jitter`, `film-gate-weave`, `film-grain-jitter`, `film-scratch-flicker`, `film-flicker`, `glow-breathe`, `cin-flare-shimmer`, `cin-streak-shimmer`, `cin-starburst-twinkle`, `cin-ghost-float`).
- **`src/components/CinematicPreview.tsx`** (`ShotLayer`) — replaces Scarlet Reel's CSS camera preset `@keyframes` (`cin-pan`, `cin-zoom-hold`, `cin-dolly`, `cin-dolly-zoom`, `cin-shake` in `vendor/scarlet-reel/effects.css`, via `src/sequence/cameraPresets.ts` conversion to keyframes) so every shot has a single keyframe-driven camera.
