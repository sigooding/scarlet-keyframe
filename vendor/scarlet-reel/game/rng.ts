/**
 * DETERMINISTIC SEEDED RNG — one stream for every GAMEPLAY draw.
 *
 * Two runs of the same story with the same seed and the same inputs should
 * play identically. Today a bug that only appears on an unlucky roll is
 * unreproducible; with a seed it replays on demand, and a seeded run doubles
 * as a regression test next to the playtest-coverage tally.
 *
 * Boot: put ?seed=1234 (any string) on the URL — Game.tsx applies it once at
 * import. Tests and future Studio toggles call setGameSeed directly.
 *
 * Resume: the stream's POSITION is part of the world. `rngSnapshot()` returns
 * `{ seed, draws }`, which GameSave carries, and `restoreRngSnapshot()` puts
 * the stream back exactly there — so loading a slot, importing a .sreel or
 * pressing ↺ Rewind resumes the SAME run instead of restarting the dice from
 * the top. Without it a seeded run only replayed identically until the first
 * save/load, and rewind handed back a world whose next shuffle had already
 * been rolled.
 *
 * What is SEEDED (gameplay — outcomes change if the roll changes):
 *   - minigame shuffles (PatternPuzzle's row order),
 *   - minigame spawns (RideGame obstacle timing / lane / sprite),
 *   - anything that calls gameRandom/gamePick/gameShuffle from here on.
 * What stays UNSEEDED (cosmetic or infrastructural):
 *   - ids and tokens (uid, library keys),
 *   - audio noise and UI blips,
 *   - storm particles and lightning bolts (weather should feel wild),
 *   - Studio canvas layout.
 */

/** The PRNG shape: a stateful draw in [0, 1). */
export type Rng = () => number;

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Same seed in, same
 *  stream out, forever. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** String → 32-bit seed (the xmur3 finalizer), so ?seed=fred works as well
 *  as ?seed=1234. Same text always hashes to the same number. */
export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The seed fixed for this run, or null while the stream is live Math.random. */
let activeSeed: string | null = null;
let stream: Rng = () => Math.random();
/** How many draws the pinned stream has served since it was seeded. This is
 *  the stream's POSITION — the other half of a resumable run (the seed is the
 *  first half). Live (unseeded) draws are not counted: there is no position to
 *  restore to when the source is Math.random. */
let drawCount = 0;

/** Fix (or unfixed) the gameplay stream. A number, a numeric string or any
 *  non-empty string seeds it; null/undefined/"" hands it back to Math.random.
 *  Either way the position resets to zero — this starts a run, it does not
 *  resume one (see restoreRngSnapshot). */
export function setGameSeed(seed?: string | number | null): void {
  drawCount = 0;
  if (seed === null || seed === undefined || `${seed}`.trim() === "") {
    activeSeed = null;
    stream = () => Math.random();
    return;
  }
  activeSeed = `${seed}`.trim();
  stream = mulberry32(hashSeed(activeSeed));
}

/** The seed this run is pinned to, or null if draws are live. */
export function currentGameSeed(): string | null {
  return activeSeed;
}

/** How many draws the current stream has served (0 when unseeded). */
export function gameDrawCount(): number {
  return activeSeed ? drawCount : 0;
}

/** One draw, counted. Every helper below goes through here so the position
 *  can never drift from what was actually rolled. */
function draw(): number {
  if (activeSeed) drawCount += 1;
  return stream();
}

/** One gameplay draw in [0, 1). */
export function gameRandom(): number {
  return draw();
}

/** A gameplay float in [a, b). */
export function gameRange(a: number, b: number): number {
  return a + draw() * (b - a);
}

/** A gameplay pick from a non-empty array. */
export function gamePick<T>(arr: readonly T[]): T {
  return arr[Math.floor(draw() * arr.length)];
}

/** A gameplay Fisher-Yates shuffle — returns a NEW array; the input is
 *  untouched. Same seed, same input order → same permutation. */
export function gameShuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Resuming a seeded run                                              */
/* ------------------------------------------------------------------ */

/** Where a pinned stream has got to. Carried by GameSave so a load, an
 *  imported .sreel or a ↺ Rewind resumes the run rather than re-rolling it. */
export interface RngSnapshot {
  seed: string;
  draws: number;
}

/** Advancing a stream is a loop, so a hand-edited save must not be able to
 *  hang the game with an absurd position. A million draws is far past anything
 *  a minigame produces and still costs milliseconds. */
export const RNG_MAX_RESTORE_DRAWS = 1_000_000;

/** The run's position, or null when the stream is live (unseeded) — an
 *  unseeded run has nothing to restore to, and saving `{ seed: null }` would
 *  only be a way to smuggle junk into a save file. */
export function rngSnapshot(): RngSnapshot | null {
  if (!activeSeed) return null;
  return { seed: activeSeed, draws: drawCount };
}

/** Put the stream back to a saved position: re-seed, then serve (and discard)
 *  the draws that already happened. Returns false — leaving the stream
 *  untouched — when the snapshot is missing, malformed or from an unseeded
 *  run, so a hand-edited or older save degrades to "the dice stay where they
 *  were" instead of throwing inside a load. */
export function restoreRngSnapshot(snapshot?: RngSnapshot | null): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const seed = typeof snapshot.seed === "string" ? snapshot.seed.trim() : "";
  if (!seed) return false;
  const raw = typeof snapshot.draws === "number" ? snapshot.draws : Number(snapshot.draws);
  const draws = Number.isFinite(raw) ? Math.min(RNG_MAX_RESTORE_DRAWS, Math.max(0, Math.floor(raw))) : 0;
  setGameSeed(seed);
  // draw() does the counting, so the restored position is by construction the
  // one the snapshot asked for.
  for (let i = 0; i < draws; i++) draw();
  return true;
}

/** Pull the run seed out of a query string: "?seed=42&x=1" → "42". Absent,
 *  empty or a bare "?seed=" all mean "no seed". */
export function seedFromSearch(search: string): string | null {
  const m = /[?&]seed=([^&]*)/.exec(search ?? "");
  const v = m && m[1] ? decodeURIComponent(m[1]).trim() : "";
  return v ? v : null;
}

/** Apply the seed from the live URL's query string (boot-time). Returns the
 *  seed applied, if any. */
export function initGameSeedFromUrl(): string | null {
  let search = "";
  try {
    search = globalThis.location?.search ?? "";
  } catch {
    search = "";
  }
  const seed = seedFromSearch(search);
  if (seed) setGameSeed(seed);
  return seed;
}
