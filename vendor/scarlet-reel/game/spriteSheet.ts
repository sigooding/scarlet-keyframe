/**
 * SPRITESHEET SUPPORT — one image, a grid of frames, named animations.
 *
 * Pure data + math only (no React) so logic.ts can validate sheets and the
 * Node engine tests can pin the frame arithmetic. The renderer lives in
 * src/game/SheetSprite.tsx and steps frames with CSS background-position —
 * no canvas, nothing runs while a sprite is idle on a single frame.
 *
 * Conventions the engine looks up by name:
 *   - stage walker: "walk" while moving, "idle" at rest
 *   - optional Stage directions: walk/idle followed by -up, -down, -left,
 *     -right, -up-left, -up-right, -down-left or -down-right. Diagonal walk
 *     clips opt in to eight-way headings. Explicit left art is not mirrored;
 *     missing left art can mirror a right bank. Legacy walk/idle still work.
 * Fallback: a missing name falls back through `fallbacks`, then to the
 * first animation defined on the sheet, so a sheet with only "walk" still
 * renders at rest (frozen on the animation's first frame).
 */

export interface SpriteSheetAnimation {
  /** Frame indices into the grid, counted left→right then top→bottom. */
  frames: number[];
  /** Frames per second (default 8). */
  fps?: number;
  /** Loop forever (default true). false = hold the last frame. */
  loop?: boolean;
}

export interface SpriteSheet {
  /** The sheet image — url / `asset:` reference. */
  image: string;
  /** Size of ONE frame in the sheet, in source pixels. */
  frameWidth: number;
  frameHeight: number;
  /** Named animations, e.g. { idle: {frames:[0]}, walk: {frames:[0,1,2,3]} } */
  animations: Record<string, SpriteSheetAnimation>;
  /** Render with crisp nearest-neighbour scaling (pixel art). */
  pixelated?: boolean;
}

/** Columns in the sheet given the loaded image's natural width. Drift-
 *  tolerant: a sheet whose width sits within 5% of a whole frame multiple
 *  rounds UP to it (downscale pipelines can land 1-2px short per row of
 *  frames); flooring there would drop the LAST column, whose frames then
 *  wrap to a phantom row and render blank — characters flashing on/off
 *  every animation cycle. Genuinely partial columns (>=5% short) still
 *  floor, as before. */
export function sheetCols(sheet: SpriteSheet, imageWidth: number): number {
  const fw = Math.max(1, sheet.frameWidth);
  const n = imageWidth / fw;
  const r = Math.round(n);
  return Math.max(1, Math.abs(n - r) <= 0.05 * Math.max(1, r) ? r : Math.floor(n));
}

/** Resolve an animation by name with graceful fallbacks. */
export function sheetAnim(
  sheet: SpriteSheet,
  name: string,
  fallbacks: string[] = []
): SpriteSheetAnimation | null {
  for (const key of [name, ...fallbacks]) {
    const anim = sheet.animations?.[key];
    if (anim && anim.frames?.length) return anim;
  }
  const first = Object.values(sheet.animations ?? {}).find((a) => a?.frames?.length);
  return first ?? null;
}

/** Which frame of `anim` is showing `elapsedSeconds` after it started.
 *  `fpsScale` speed-matches the cycle to how fast the sprite is actually
 *  crossing the floor (see `speedMatchedFpsScale`); it defaults to 1, so
 *  every existing caller — the first-person renderer, the Quake stage, the
 *  sheet editor's preview — keeps the frame arithmetic it has always had. */
export function sheetFrameAt(anim: SpriteSheetAnimation, elapsedSeconds: number, fpsScale = 1): number {
  const fps = anim.fps && anim.fps > 0 ? anim.fps : 8;
  return frameFromPhase(anim, Math.max(0, elapsedSeconds) * fps * speedMatchedFpsScale(fpsScale));
}

/** Which frame is showing after `phase` FRAMES have elapsed (a float). The
 *  renderer accumulates phase by delta-time rather than reading a wall clock,
 *  so a speed change mid-stride re-rates the cycle WITHOUT jumping its phase —
 *  the foot that was on the ground stays on the ground. */
export function frameFromPhase(anim: SpriteSheetAnimation, phase: number): number {
  const n = anim.frames.length;
  if (n === 0) return 0;
  const p = Number.isFinite(phase) ? Math.max(0, phase) : 0;
  const step = Math.floor(p);
  const idx = anim.loop === false ? Math.min(step, n - 1) : step % n;
  return anim.frames[idx];
}

/** A walk cycle drawn at one fps cannot cover every speed the same sprite
 *  actually travels: depth scales a distant walker down (and slows them), a
 *  patrol can be authored at any speed, and the double-click jog is FIVE times
 *  the room speed. Left alone the legs keep the authored rate while the feet
 *  cover the floor faster or slower — the classic moonwalk, which is most
 *  obvious in exactly the wide rooms the jog exists for.
 *
 *  So the cycle is re-rated by the ratio of the speed the sprite is really
 *  moving to the speed its sheet was drawn for. Clamped at both ends: a
 *  distant crawl must not freeze mid-step, and a jog must not strobe (five
 *  times an 8 fps cycle is 40 fps, which reads as a vibration, not a run —
 *  that is what a `run` bank on the sheet is for; see `jogAnimation`). */
export const FPS_SCALE_MIN = 0.45;
export const FPS_SCALE_MAX = 2.5;

export function speedMatchedFpsScale(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(FPS_SCALE_MAX, Math.max(FPS_SCALE_MIN, ratio));
}

/** While jogging, play the RUN bank if the sheet drew one — a faster walk
 *  cycle is the fallback, not the goal. Same candidate order as the walk
 *  resolver (exact direction, mirrored opposite, four-way base, generic) so a
 *  sheet with only `run-right` still jogs correctly facing left. Returns null
 *  when there is no run art at all, so the caller keeps the walk resolution it
 *  already had. */
export function jogAnimation(
  sheet: SpriteSheet | undefined,
  dir: string
): { anim: string; fallbacks: string[]; flip: boolean } | null {
  const animations = sheet?.animations;
  if (!animations) return null;
  const left = dir === "left" || dir.endsWith("-left");
  const right = dir === "right" || dir.endsWith("-right");
  const has = (name: string) => !!animations[name]?.frames?.length;
  const candidates: { anim: string; flip: boolean }[] = [{ anim: `run-${dir}`, flip: false }];
  if (left) candidates.push({ anim: `run-${dir.replace("left", "right")}`, flip: true });
  else if (right) candidates.push({ anim: `run-${dir.replace("right", "left")}`, flip: true });
  if (dir.includes("-")) candidates.push({ anim: `run-${dir.split("-")[0]}`, flip: false });
  candidates.push({ anim: "run", flip: left });
  const found = candidates.find((c) => has(c.anim));
  if (!found) return null;
  return { ...found, fallbacks: ["walk", "idle"] };
}

/** Grid position of a frame index. */
export function sheetFramePos(frame: number, cols: number): { col: number; row: number } {
  const f = Math.max(0, Math.floor(frame));
  return { col: f % cols, row: Math.floor(f / cols) };
}

/** True when the sheet has an image and at least one drawable animation —
 * the render-or-fallback test used by the stage walker, talking portraits
 * and foreground extras. */
export function sheetDrawable(sheet?: SpriteSheet | null): sheet is SpriteSheet {
  return !!(
    sheet &&
    sheet.image &&
    sheet.frameWidth > 0 &&
    sheet.frameHeight > 0 &&
    Object.values(sheet.animations ?? {}).some((a) => a?.frames?.length)
  );
}

/** Author-facing sanity check; each entry becomes a validator warning.
 * `expectedNames`: the animation names the engine looks up for THIS use of
 * the sheet (walker: walk/idle, portrait: talk/rest, extra: loop) — a sheet
 * defining none of them still renders via fallback, but gets a hint. */
/** Author-facing sanity check; each entry becomes a validator warning.
 * `expectedNames`: the animation names the engine looks up for THIS use of
 * the sheet (walker: walk/idle, portrait: talk/rest, extra: loop) — a sheet
 * defining none of them still renders via fallback, but gets a hint.
 * `gridFrameCount`: how many frames the sheet image ACTUALLY holds
 * (cols × rows from its natural size). Only known once the image has decoded,
 * so it is optional — when supplied, animations referencing frames past the
 * end of the grid are reported. Those frames don't crash: SheetSprite clamps
 * them to the last real frame, so the sprite silently plays the WRONG pose
 * (a "talk" cycle that stops moving, an idle stuck on the final frame).
 * Nothing else in the app tells the author, which is why it belongs here. */
export function spriteSheetIssues(
  sheet: SpriteSheet,
  label = "sprite sheet",
  expectedNames?: string[],
  gridFrameCount?: number
): string[] {
  const issues: string[] = [];
  if (!sheet.image) issues.push(`${label}: no sheet image set.`);
  if (!(sheet.frameWidth > 0) || !(sheet.frameHeight > 0))
    issues.push(`${label}: frame size must be positive (got ${sheet.frameWidth}×${sheet.frameHeight}).`);
  const anims = Object.entries(sheet.animations ?? {});
  if (!anims.length) issues.push(`${label}: no animations defined — add at least "idle" or "walk".`);
  for (const [name, anim] of anims) {
    if (!anim?.frames?.length) issues.push(`${label}: animation "${name}" has no frames.`);
    else if (anim.frames.some((f) => !Number.isInteger(f) || f < 0))
      issues.push(`${label}: animation "${name}" has a negative or fractional frame index.`);
    if (anim?.fps !== undefined && !(anim.fps > 0)) issues.push(`${label}: animation "${name}" fps must be > 0.`);

    // Frames past the end of the real grid. Reported per animation, naming the
    // offenders, because "frame 7 doesn't exist" is actionable and "this sheet
    // is wrong" is not. Common after re-building a sheet with fewer sprites
    // than the animations were originally written for.
    if (gridFrameCount && gridFrameCount > 0 && anim?.frames?.length) {
      const over = anim.frames.filter((f) => Number.isInteger(f) && f >= gridFrameCount);
      if (over.length) {
        const unique = [...new Set(over)].sort((a, b) => a - b);
        const one = unique.length === 1;
        issues.push(
          `${label}: animation "${name}" uses frame${one ? "" : "s"} ${unique.join(", ")}, but the sheet only has ${gridFrameCount} (0–${gridFrameCount - 1}). ` +
            `${one ? "It" : "They"} will render as frame ${gridFrameCount - 1} instead.`
        );
      }
    }
  }
  if (expectedNames?.length && anims.length && !anims.some(([n]) => expectedNames.includes(n)))
    issues.push(
      `${label}: none of the animation names the engine looks up here (${expectedNames.map((n) => `"${n}"`).join(", ")}) are defined — it will fall back to "${anims[0][0]}".`
    );
  return issues;
}

/** Frames the sheet image actually holds, from its natural pixel size.
 *  Shared by the editor's warning and its animation presets so both agree. */
export function sheetFrameCount(sheet: SpriteSheet, imageWidth: number, imageHeight: number): number {
  const cols = sheetCols(sheet, imageWidth);
  const rows = Math.max(1, Math.floor(imageHeight / Math.max(1, sheet.frameHeight)));
  return Math.max(1, cols * rows);
}
