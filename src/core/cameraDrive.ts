// Driving the camera by hand, and the handheld it saves you performing.
//
// The editor's only camera is keyframes on a shot (zoom, x, y, rotation). Two ways to fill them in:
//
//  - DRIVE: press play with the camera armed and move it with the mouse. The app samples the pose on every frame
//    (`sampleDrive`) and this module fits those samples to a handful of keys (`buildDrivenAnimation`). Without the
//    fitting a ten-second shot would end up with 240 keys a channel and no curve anybody could edit.
//  - HANDHELD: the same keys, generated (`handheldAnimation`) from sway, bob, roll and drift, so thirty shots can
//    have the float without thirty performances. Same seed, same move: a rebuild never changes a shot.
//
// Nothing here renders: it writes the beat's own `animation`, which the viewer, the MP4 export and the depth camera
// all already read. Every pose is put through `clampPoseToPictureEdges`, so a move can never show the edge of the
// picture — that is also what lifts the zoom when the camera rolls.

import { clampPoseToPictureEdges, minZoomForRotation, type BeatAnimation, type Key } from "../sequence/animate";

/** Where the camera is: the four channels a hand can drive. */
export interface DrivePose {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}

export const NEUTRAL_POSE: DrivePose = { zoom: 1, x: 0, y: 0, rotation: 0 };

/** One frame of a performance: the pose as it was at that frame of the shot. */
export interface DriveSample {
  /** Frames from the start of the shot. */
  frame: number;
  pose: DrivePose;
}

/** What the hand is doing, in the viewer's own units (percent of the frame, degrees, zoom factor). */
export interface DriveOffset {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export const NO_OFFSET: DriveOffset = { x: 0, y: 0, zoom: 1, rotation: 0 };

/**
 * The least zoom at which the frame can sit this far off centre, and at this roll, without reaching past the edge of
 * the picture. At zoom 1 the frame covers the picture exactly, so a pan has nowhere to go: driving a still shot has
 * to push in a little first, and this is how much.
 */
export function zoomNeededFor(pose: { x?: number; y?: number; rotation?: number }): number {
  const x = Math.abs(Number(pose.x) || 0);
  const y = Math.abs(Number(pose.y) || 0);
  // The frame can slide (zoom - 1) / 2 of the picture each way, which is (zoom - 1) × 50 percent of the frame.
  const forPan = 1 + Math.max(x, y) / 50;
  return Math.max(1, minZoomForRotation(Number(pose.rotation) || 0) * forPan);
}

/**
 * The pose to record for one frame: what the shot's own move does there, with the hand's offset over it, held
 * inside the picture. `base` is the move the shot already has (pass the neutral pose to throw it away). The zoom is
 * lifted to whatever the pan and the roll need, unless `headroom` is false.
 */
export function sampleDrive(base: DrivePose, offset: DriveOffset, headroom = true): DrivePose {
  const x = base.x + (Number.isFinite(offset.x) ? offset.x : 0);
  const y = base.y + (Number.isFinite(offset.y) ? offset.y : 0);
  const rotation = base.rotation + (Number.isFinite(offset.rotation) ? offset.rotation : 0);
  const asked = Math.max(0.01, base.zoom * (Number.isFinite(offset.zoom) ? offset.zoom : 1));
  const raw = {
    zoom: headroom ? Math.max(asked, zoomNeededFor({ x, y, rotation })) : asked,
    x,
    y,
    rotation,
  };
  const held = clampPoseToPictureEdges(raw);
  return { zoom: held.zoom, x: held.x, y: held.y, rotation: held.rotation };
}

interface Point {
  frame: number;
  value: number;
}

/**
 * Ramer–Douglas–Peucker: the fewest points that keep the curve within `tolerance` of the one that was performed.
 * The first and the last point are always kept, so the move starts and ends where the hand did.
 */
export function simplifyPoints(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    if (last <= first + 1) continue;
    const a = points[first];
    const b = points[last];
    const span = b.frame - a.frame;
    let worst = 0;
    let worstAt = -1;
    for (let i = first + 1; i < last; i += 1) {
      const point = points[i];
      const straight = span === 0 ? a.value : a.value + ((point.frame - a.frame) / span) * (b.value - a.value);
      const off = Math.abs(point.value - straight);
      if (off > worst) {
        worst = off;
        worstAt = i;
      }
    }
    if (worst > tolerance && worstAt > 0) {
      keep[worstAt] = true;
      stack.push([first, worstAt], [worstAt, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/** How far off the performance a fitted curve may sit, per channel, at `smooth` 0 (exact) to 1 (calm). */
const TOLERANCE_AT_FULL: Record<keyof DrivePose, number> = { zoom: 0.03, x: 1.2, y: 1.2, rotation: 0.5 };
/** Below this a channel never really moved, so it is left out and the shot keeps its own value. */
const STILL_ENOUGH: Record<keyof DrivePose, number> = { zoom: 0.004, x: 0.15, y: 0.15, rotation: 0.05 };
const DECIMALS: Record<keyof DrivePose, number> = { zoom: 4, x: 2, y: 2, rotation: 3 };

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export interface BuildDrivenOptions {
  /** What the hand did, one per frame of the shot (any order; the first and last are kept). */
  samples: readonly DriveSample[];
  /** The shot's other channels (opacity, blur…), kept as they are. */
  base?: BeatAnimation;
  /** 0 keeps every wobble, 1 is the calmest curve. Default 0.5. */
  smooth?: number;
}

/**
 * Fits a performance to keyframes. A channel the hand never moved is left out, so a driven pan does not also
 * flatten a zoom the shot already had. Keys are linear: they are samples of a real move, not an eased intention.
 */
export function buildDrivenAnimation(options: BuildDrivenOptions): BeatAnimation | null {
  const samples = [...options.samples].sort((a, b) => a.frame - b.frame);
  if (samples.length < 2) return null;
  const smooth = Math.max(0, Math.min(1, options.smooth ?? 0.5));
  const next: BeatAnimation = { ...(options.base ?? {}) };

  let wrote = false;
  for (const prop of ["zoom", "x", "y", "rotation"] as const) {
    const points: Point[] = samples.map((sample) => ({ frame: sample.frame, value: sample.pose[prop] }));
    const lowest = Math.min(...points.map((point) => point.value));
    const highest = Math.max(...points.map((point) => point.value));
    const still = highest - lowest < STILL_ENOUGH[prop];
    if (still && Math.abs(points[0].value - NEUTRAL_POSE[prop]) < STILL_ENOUGH[prop]) {
      // The hand held this channel still, at the value a shot has when nothing moves it. Leave whatever the shot
      // had: a driven pan must not erase its zoom.
      continue;
    }
    if (still) {
      // Still, but not where it rests: the push the pan needed, say. Hold it for the whole shot.
      next[prop] = [
        { frame: 0, value: round(points[0].value, DECIMALS[prop]), easing: "linear" },
        { frame: Math.max(1, Math.round(points[points.length - 1].frame)), value: round(points[0].value, DECIMALS[prop]), easing: "linear" },
      ];
      wrote = true;
      continue;
    }
    const fitted = simplifyPoints(points, TOLERANCE_AT_FULL[prop] * smooth);
    next[prop] = fitted.map(
      (point): Key => ({ frame: Math.max(0, Math.round(point.frame)), value: round(point.value, DECIMALS[prop]), easing: "linear" }),
    );
    wrote = true;
  }
  return wrote ? next : null;
}

/** How many keys a fitted performance came to, for the readout ("18 keys from 240 frames"). */
export function countKeys(animation: BeatAnimation | null): number {
  if (!animation) return 0;
  let total = 0;
  for (const prop of ["zoom", "x", "y", "rotation"] as const) total += animation[prop]?.length ?? 0;
  return total;
}

export interface HandheldOptions {
  /** How long the shot is, in frames. */
  durationFrames: number;
  /** Side to side, in percent of the frame. Default 0.8. */
  sway?: number;
  /** Up and down, in percent of the frame. Default 0.6. */
  bob?: number;
  /** Roll, in degrees. Default 0.5. */
  roll?: number;
  /** A slow one-way drift over the whole shot, in percent. Default 0. */
  drift?: number;
  /** How busy the hand is: stops per second. Default 1.6. */
  speed?: number;
  /** The same seed gives the same move, every build. Default "handheld". */
  seed?: string;
  /** The shot's other channels, kept as they are. */
  base?: BeatAnimation;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

/**
 * A handheld float, frame by frame: the camera never quite still, nobody performing it. Stops a little apart, eased
 * between, so it breathes rather than vibrates. These are offsets — the same kind a hand makes — so a shot keeps
 * whatever move it already had underneath.
 */
export function handheldOffsets(options: HandheldOptions): DriveOffset[] {
  const frames = Math.max(2, Math.round(options.durationFrames));
  const sway = Math.max(0, options.sway ?? 0.8);
  const bob = Math.max(0, options.bob ?? 0.6);
  const roll = Math.max(0, options.roll ?? 0.5);
  const drift = options.drift ?? 0;
  const speed = Math.max(0.2, options.speed ?? 1.6);
  const random = seededRandom(options.seed ?? "handheld");

  // Where the hand is at each stop; the frames between are eased from one to the next (smoothstep), which is what
  // makes it a float and not a vibration. It starts at rest: a cut onto a camera already off-centre reads as a jump.
  const stopEvery = Math.max(4, Math.round(24 / speed));
  const stops: DriveOffset[] = [{ ...NO_OFFSET }];
  for (let frame = stopEvery; frame < frames + stopEvery; frame += stopEvery) {
    stops.push({
      x: (random() * 2 - 1) * sway,
      y: (random() * 2 - 1) * bob,
      rotation: (random() * 2 - 1) * roll,
      zoom: 1,
    });
  }

  const out: DriveOffset[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const at = frame / stopEvery;
    const index = Math.floor(at);
    const from = stops[Math.min(index, stops.length - 1)];
    const to = stops[Math.min(index + 1, stops.length - 1)];
    const raw = at - index;
    const t = raw * raw * (3 - 2 * raw); // smoothstep: no corner at a stop
    const glide = frames <= 1 ? 0 : frame / (frames - 1);
    out.push({
      x: from.x + (to.x - from.x) * t + drift * glide,
      y: from.y + (to.y - from.y) * t,
      rotation: from.rotation + (to.rotation - from.rotation) * t,
      zoom: 1,
    });
  }
  return out;
}

/**
 * The handheld as keyframes, over a camera that is already there. `basePoseAt` is the shot's own move (leave it out
 * for a shot with none); the zoom is lifted just enough that the float never shows the edge of the picture.
 */
export function handheldAnimation(
  options: HandheldOptions & { basePoseAt?: (frame: number) => DrivePose; smooth?: number },
): BeatAnimation | null {
  const offsets = handheldOffsets(options);
  const headroom = coverZoomFor(options);
  const samples: DriveSample[] = offsets.map((offset, frame) => {
    const base = options.basePoseAt?.(frame) ?? NEUTRAL_POSE;
    return { frame, pose: sampleDrive({ ...base, zoom: Math.max(base.zoom, headroom) }, offset) };
  });
  return buildDrivenAnimation({ samples, base: options.base, smooth: options.smooth ?? 0.35 });
}

/** The least zoom a float of this size can run at without the frame reaching past the picture's edge. */
export function coverZoomFor(options: Pick<HandheldOptions, "sway" | "bob" | "roll" | "drift">): number {
  const sway = Math.max(0, options.sway ?? 0.8) + Math.abs(options.drift ?? 0);
  const bob = Math.max(0, options.bob ?? 0.6);
  const roll = Math.max(0, options.roll ?? 0.5);
  return Math.max(1.02, round(zoomNeededFor({ x: sway, y: bob, rotation: roll }), 4));
}

// ---- the hand ------------------------------------------------------------------------------------------------

/** Degrees of roll across the full width of the viewer, when the hand drags with Alt held. */
const ROLL_ACROSS_VIEWER = 20;
/** How fast the wheel pushes in. */
const WHEEL_ZOOM_RATE = 0.0015;

export interface DragReading {
  /** Pixels the pointer has moved since it went down. */
  dx: number;
  dy: number;
  /** The viewer's size in pixels, so the move is the same whatever the window. */
  width: number;
  height: number;
  /** Alt rolls the camera instead of moving it. */
  roll?: boolean;
}

/** What one drag asks of the camera: the picture follows the pointer, or rolls under it with Alt held. */
export function offsetFromDrag(drag: DragReading): DriveOffset {
  const width = Math.max(1, drag.width);
  const height = Math.max(1, drag.height);
  if (drag.roll) {
    return { ...NO_OFFSET, rotation: (drag.dx / width) * ROLL_ACROSS_VIEWER };
  }
  return { ...NO_OFFSET, x: (drag.dx / width) * 100, y: (drag.dy / height) * 100 };
}

/** One wheel notch, as a zoom multiplier (up pushes in). */
export function zoomFromWheel(deltaY: number): number {
  return Math.exp(-(Number(deltaY) || 0) * WHEEL_ZOOM_RATE);
}

/** Two offsets, one over the other: what the hand has done so far plus what this drag is doing. */
export function addOffsets(a: DriveOffset, b: DriveOffset): DriveOffset {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    rotation: a.rotation + b.rotation,
    zoom: Math.max(0.05, a.zoom * b.zoom),
  };
}

// ---- a take --------------------------------------------------------------------------------------------------

/** What was performed, shot by shot: a take can run across a cut, and each shot keeps its own keys. */
export type DriveRecording = Map<string, DriveSample[]>;

/** Adds one frame to the take. A frame driven twice (the playhead went back) keeps the last pass. */
export function addSample(recording: DriveRecording, frameId: string, sample: DriveSample): DriveRecording {
  const forShot = recording.get(frameId);
  if (!forShot) {
    recording.set(frameId, [sample]);
    return recording;
  }
  const at = forShot.findIndex((item) => item.frame === sample.frame);
  if (at >= 0) forShot[at] = sample;
  else forShot.push(sample);
  return recording;
}

export interface DrivenShot {
  frameId: string;
  animation: BeatAnimation;
  /** How many keys it came to, and over how many frames, for the readout. */
  keys: number;
  frames: number;
}

/**
 * The take as keyframes, one shot at a time. A shot the hand barely touched is left out, so a take that crossed a
 * cut does not stamp a flat move on the shot it only passed through.
 */
export function commitRecording(
  recording: DriveRecording,
  shots: ReadonlyMap<string, { base?: BeatAnimation }>,
  smooth = 0.5,
): DrivenShot[] {
  const out: DrivenShot[] = [];
  for (const [frameId, samples] of recording) {
    if (samples.length < 2) continue;
    const animation = buildDrivenAnimation({ samples, base: shots.get(frameId)?.base, smooth });
    if (!animation) continue;
    out.push({ frameId, animation, keys: countKeys(animation), frames: samples.length });
  }
  return out;
}
