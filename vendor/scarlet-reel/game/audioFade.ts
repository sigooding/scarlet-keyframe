/* ------------------------------------------------------------------ *
 *  MUSIC FADES
 *
 *  The soundtrack is a raw <audio> element outside the WebAudio graph, so
 *  there is no GainNode to automate — the fade is a loop on .volume.
 *
 *  Two rules make this feel like a film rather than a playlist:
 *    · leaving a track always RAMPS DOWN, never cuts
 *    · a replacement track ramps UP over the same window, so the two
 *      overlap into a crossfade instead of leaving a hole
 *
 *  A ramp always lands on a wall-clock deadline as well as on animation
 *  frames (see `fadeAudio`). It used to advance on frames alone, and a frame
 *  loop stops when the page stops drawing — a hidden tab, a minimised window,
 *  a locked screen. The outgoing element was then never paused, so a cue that
 *  LOOPS kept playing: that is how the opening song of Nobody's Witness could
 *  run on under the whole film. A fade nobody can see must still finish.
 * ------------------------------------------------------------------ */

/** Default fade length. Long enough to read as intentional, short enough
 *  that it never delays a scene change the player has already committed to. */
export const MUSIC_FADE_MS = 1400;

/** Equal-power crossfade pair. sin² + cos² = 1 at every t, so a track fading
 *  out on `down` and one fading in on `up` sum to constant perceived
 *  loudness. The obvious `1 - sin` for the outgoing side is NOT equivalent:
 *  it dips to ~0.51 of full power halfway through, an audible hole in the
 *  middle of the crossfade. */
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const fadeUpCurve = (t: number) => Math.sin((clamp01(t) * Math.PI) / 2);
const fadeDownCurve = (t: number) => Math.cos((clamp01(t) * Math.PI) / 2);

/** The frame API, looked up per call: some webviews (and plain Node, where the
 *  tests run) have none at all, in which case the deadline does all the work. */
const frameRequest = (step: (now: number) => void): number | null =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(step) : null;
const frameCancel = (frame: number) => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
};

type FadeHandle = { cancel: () => void };
const activeFades = new WeakMap<HTMLAudioElement, FadeHandle>();

/** Every ramp in flight, so they can all be settled at once when the page
 *  stops drawing (a hidden tab, a minimised window, a locked screen). */
const runningFades = new Set<() => void>();

/** True while a ramp is in flight on this element. Callers that set .volume
 *  directly (the mixer faders) must not fight a running fade. */
export const isFading = (el: HTMLAudioElement) => activeFades.has(el);

/** Finish every ramp in flight now, at its target volume. Called when the page
 *  becomes hidden: frames stop there, so a ramp left to the frame loop would
 *  sit at whatever volume it had reached — and an outgoing track would keep
 *  playing. */
export function settleRunningFades() {
  for (const settle of [...runningFades]) settle();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) settleRunningFades();
  });
}

/**
 * Ramp an element's volume to `to` over `ms`, then optionally stop it.
 * Returns a cancel function. Any previous ramp on the same element is
 * cancelled first, so rapid scene changes can't leave two loops fighting
 * over one volume property.
 *
 * The frames make it smooth; the deadline (`ms`, plus one frame of slack)
 * makes it certain. `onDone` fires exactly once either way — the music code
 * hangs "pause this track and release it" on it, so a ramp that never
 * finished was a track that never stopped.
 *
 * `follow`, when given, is a live multiplier read every frame (the voice duck):
 * the ramp is scaled by how far it has moved since the ramp began, so a long
 * crossfade still dips under a line spoken in the middle of it.
 */
export function fadeAudio(
  el: HTMLAudioElement,
  to: number,
  ms: number,
  onDone?: () => void,
  follow?: () => number
): FadeHandle {
  activeFades.get(el)?.cancel();
  const from = el.volume;
  // Nothing to do — still run onDone so callers can rely on it firing.
  if (ms <= 0 || Math.abs(to - from) < 0.001) {
    try {
      el.volume = clamp01(to);
    } catch {
      /* element detached */
    }
    onDone?.();
    const noop = { cancel: () => {} };
    return noop;
  }
  const start = performance.now();
  const follow0 = follow?.() || 1;
  const scale = () => (follow ? Math.max(0, follow()) / follow0 : 1);
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let settled = false;
  const settle = () => {
    if (cancelled || settled) return;
    settled = true;
    if (frame !== null) frameCancel(frame);
    if (timer !== null) clearTimeout(timer);
    runningFades.delete(settle);
    try {
      el.volume = clamp01(to * scale());
    } catch {
      /* element detached */
    }
    activeFades.delete(el);
    onDone?.();
  };
  const step = (now: number) => {
    if (cancelled || settled) return;
    const t = Math.min(1, (now - start) / ms);
    // Going down travels the cos curve from `from` to `to`; going up travels
    // the sin curve. Run as a simultaneous pair they hold constant power.
    const v =
      to < from
        ? to + (from - to) * fadeDownCurve(t)
        : from + (to - from) * fadeUpCurve(t);
    try {
      el.volume = clamp01(v * scale());
    } catch {
      /* element detached mid-ramp */
    }
    if (t < 1) {
      frame = frameRequest(step);
    } else {
      settle();
    }
  };
  frame = frameRequest(step);
  timer = setTimeout(settle, ms + 60);
  runningFades.add(settle);
  const handle: FadeHandle = {
    cancel: () => {
      cancelled = true;
      if (frame !== null) frameCancel(frame);
      if (timer !== null) clearTimeout(timer);
      runningFades.delete(settle);
      activeFades.delete(el);
    },
  };
  activeFades.set(el, handle);
  return handle;
}
