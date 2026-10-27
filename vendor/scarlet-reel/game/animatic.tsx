/**
 * ANIMATIC MODE — the film played hands-off as a clean picture with its captions burned in, for the animatic exporter
 * (tools/export-animatic.mjs, also behind "🎞 Export animatic" on the home screen) or to watch and screen-record in a
 * browser:
 *
 *   ?story=nobodys-witness-film&scene=nw_s65&animatic=1&to=nw_s66&subs=1&desc=1&marks=1&pace=1
 *
 * In this mode the game shows every line at once (no typewriter) and moves on by itself: a silent line holds for its
 * reading time, a spoken one until its voice has finished. The reading panel and the controls are hidden; the game
 * draws the captions itself instead, the spoken lines as subtitles and the narration (the screenplay's action) and the
 * scene headings as descriptions. Every effect, the depth camera and the sound play exactly as they do in the game.
 *
 * Progress is reported on window.__animatic for the exporter: the scene on screen, every caption with the page-clock
 * time it appeared, and `done` once the scene after `to` begins (or the story reaches its ending).
 */
import { audio } from "../audio";
import type { DialogueBeat, SceneNode } from "../types";

export interface AnimaticOptions {
  /** The last scene to play (its continuation parts, `<id>_b`…, included); null plays to the end of the story. */
  to: string | null;
  /** Burn the spoken lines in as subtitles. */
  subtitles: boolean;
  /** Burn the narration and the scene headings in as descriptions. */
  descriptions: boolean;
  /** Show where the film is in the top-right corner: the screenplay scene, the beat within it and the picture's file, so a
   *  problem seen in the MP4 can be reported by where it is. */
  marks: boolean;
  /** Multiplies every reading hold: 1 is normal, 0.8 brisker, 1.25 slower. */
  pace: number;
}

export function animaticFromUrl(search?: string): AnimaticOptions | null {
  if (typeof window === "undefined") return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? window.location.search);
  } catch {
    return null;
  }
  const on = params.get("animatic");
  if (on === null || on === "0" || on === "false") return null;
  const flag = (key: string, fallback: boolean) => {
    const v = params.get(key);
    return v === null ? fallback : v !== "0" && v !== "false";
  };
  const pace = Number(params.get("pace") ?? "1");
  return {
    to: params.get("to") || null,
    subtitles: flag("subs", true),
    descriptions: flag("desc", true),
    marks: flag("marks", true),
    pace: Number.isFinite(pace) && pace >= 0.5 && pace <= 2 ? pace : 1,
  };
}

/** Read once: the URL does not change while the film plays. Null in ordinary play (and outside a browser). */
export const ANIMATIC: AnimaticOptions | null = animaticFromUrl();

/** Longest description an animatic makes by joining short action lines (about two lines on screen). */
export const JOIN_CHARS = 200;
const PLAIN_BEAT_KEYS = new Set(["id", "characterId", "text", "silent"]);
const silentLine = (b: DialogueBeat) => !b.audioUrl && !!b.silent && !!b.text && b.text !== "·";

/** Short action lines that follow each other on the same picture are shown as one description (up to JOIN_CHARS):
 *  a line joins the one before it only when it carries nothing of its own (no picture, voice, effect or condition).
 *  Every beat keeps the number it has in the authored scene (`animaticBeat`, counted from `firstNo`): a joined
 *  caption is stamped with the range it covers ("12–13"), so the mark in the corner names the same beats the
 *  Studio lists. Until 21 October 2026 the mark counted the joined lines instead, so its numbers drifted from
 *  the scene's own beat list wherever lines had joined (scene 1: 43 authored beats, 37 captions). */
export function joinActionLines(beats: DialogueBeat[], firstNo = 1): DialogueBeat[] {
  const out: DialogueBeat[] = [];
  const spans: [number, number][] = [];
  beats.forEach((b, i) => {
    const no = firstNo + i;
    const prev = out[out.length - 1];
    const plain = Object.keys(b).every((k) => PLAIN_BEAT_KEYS.has(k) || k === "animaticBeat");
    if (prev && silentLine(prev) && silentLine(b) && plain && prev.characterId === b.characterId && `${prev.text} ${b.text}`.length <= JOIN_CHARS) {
      spans[spans.length - 1][1] = no;
      const [from, to] = spans[spans.length - 1];
      out[out.length - 1] = { ...prev, text: `${prev.text} ${b.text}`, animaticBeat: from === to ? `${from}` : `${from}–${to}` };
    } else {
      out.push({ ...b, animaticBeat: `${no}` });
      spans.push([no, no]);
    }
  });
  return out;
}

/** Every ordinary scene shows its words at once, with its short action lines joined; the title and the credits keep
 *  their own design and timing. Beat numbers run from the start of the screenplay scene across the nodes it was
 *  cut into (the same count `animaticMarkFor` used), but over the authored beats, before any joining. */
export function animaticStory<T extends { scenes: SceneNode[] }>(story: T): T {
  const next = new Map<string, number>();
  return {
    ...story,
    scenes: story.scenes.map((sc) => {
      if (sc.nodeType === "credits") return sc;
      const mark = sc.animaticMark;
      const start = mark ? (next.get(mark) ?? 0) + 1 : 1;
      const beats = sc.dialogueBeats ? joinActionLines(sc.dialogueBeats, start) : sc.dialogueBeats;
      if (mark && sc.dialogueBeats) next.set(mark, (next.get(mark) ?? 0) + sc.dialogueBeats.length);
      return { ...sc, noTypewriter: true, dialogueBeats: beats };
    }),
  };
}

/** How long a silent line stays up, times the pace. (14 characters a second until 10 October 2026, when the film ran
 *  2 h 36 min; 18 a second, 1.8 to 9 s, until 11 October.) */
export function readingSeconds(text: string, pace = 1, scenePace = 1): number {
  const chars = text.replace(/\s+/g, " ").trim().length;
  // About 20 characters a second, 1.5 s at least and 7 s at most (11 October 2026: the director wanted the film at about
  // 1 h 45 min, and the descriptions took the most time); a scene's faster read (studio-edits "readPace") and the
  // viewer's pace scale it.
  return Math.min(7, Math.max(1.5, 0.3 + chars / 20)) * scenePace * pace;
}

/** Seconds from `position` (in a track `duration` long, looping) to its next beat, for a scene's `musicSync`; 0 when a
 *  beat is under 40 ms away. The grid starts at `firstBeat` and restarts with the track, so a loop that is not a whole
 *  number of beats long does not drift. */
export function untilNextMusicBeat(position: number, duration: number, sync: { bpm: number; firstBeat: number }): number {
  const period = 60 / sync.bpm;
  if (!(period > 0) || !Number.isFinite(position)) return 0;
  const k = Math.max(0, Math.ceil((position - sync.firstBeat - 0.04) / period));
  let wait = sync.firstBeat + k * period - position;
  // past the track's last beat the next one is the first beat after the loop restarts
  if (Number.isFinite(duration) && duration > 0 && position + wait > duration) wait = duration - position + sync.firstBeat;
  return wait < 0.04 ? 0 : wait;
}

/** The pause after a recorded line before the next line comes up. */
export const AFTER_VOICE_SECONDS = 0.45;
/** How long a scene heading (or a scene's opening description) stays up before the scene's first line. */
export function headingSeconds(prose: string, pace = 1): number {
  return SLUGLINE.test(prose.trim()) ? 1.6 * pace : readingSeconds(prose, pace);
}

export type CaptionKind = "subtitle" | "description" | "heading";
export interface Caption {
  kind: CaptionKind;
  speaker?: string;
  text: string;
}

const SLUGLINE = /^(INT|EXT|I\/E)[./\s]/i;

/** Narration is the screenplay's own words (a narrator line, or a silent line with no voice); anything else is said. */
export function isNarration(beat: Pick<DialogueBeat, "characterId" | "audioUrl" | "silent">): boolean {
  return beat.characterId === "narrator" || /(^|_)narrator$/i.test(beat.characterId) || (!beat.audioUrl && !!beat.silent);
}

/** What the animatic shows at this moment: the scene's heading while its prose is up, else the line on screen. */
export function captionFor(
  options: AnimaticOptions,
  scene: SceneNode | null | undefined,
  proseShowing: boolean,
  beat: DialogueBeat | null,
  beatText: string,
  speaker: string | undefined
): Caption | null {
  if (!scene || scene.nodeType === "credits") return null;
  if (proseShowing) {
    const text = (scene.prose ?? "").trim();
    if (!text || !options.descriptions) return null;
    return { kind: SLUGLINE.test(text) ? "heading" : "description", text };
  }
  if (!beat) return null;
  const text = beatText.trim();
  if (!text || text === "·") return null;
  if (isNarration(beat)) return options.descriptions ? { kind: "description", text } : null;
  return options.subtitles ? { kind: "subtitle", speaker, text } : null;
}

export interface AnimaticCue extends Caption {
  /** page-clock milliseconds (performance.now) when the caption appeared */
  t: number;
  /** the scene and the line it came from */
  scene?: string;
  beat?: string;
}
export interface AnimaticState {
  options: AnimaticOptions;
  sceneId: string | null;
  sceneTitle: string;
  /** every caption change in order; a cue with empty text clears the screen */
  cues: AnimaticCue[];
  /** every scene entered, with the page-clock time */
  scenes: { t: number; id: string }[];
  reachedTo: boolean;
  done: boolean;
  /** page-clock milliseconds when the film left the chosen scenes (or reached its ending); nothing after it is filmed */
  doneAt?: number;
}

declare global {
  interface Window {
    /** set by the exporter: start at once (a browser waits for one click, so the sound may play) */
    __animaticAutostart?: boolean;
    __animatic?: AnimaticState;
    /** the game's sound engine, for the exporter (it logs the ambience and renders the synthesised sounds offline) */
    __sw_audio?: typeof audio;
  }
}

function state(): AnimaticState | null {
  if (!ANIMATIC || typeof window === "undefined") return null;
  if (!window.__animatic) {
    window.__animatic = { options: ANIMATIC, sceneId: null, sceneTitle: "", cues: [], scenes: [], reachedTo: false, done: false };
    window.__sw_audio = audio;
  }
  return window.__animatic;
}
// Ready before the first scene, so the exporter can find the sound engine as soon as the page has loaded.
state();

const sameCaption = (a: Caption | null | undefined, b: Caption | null | undefined) =>
  (a?.text ?? "") === (b?.text ?? "") && (a?.kind ?? "") === (b?.kind ?? "") && (a?.speaker ?? "") === (b?.speaker ?? "");

/** Records the caption now on screen (null: none) when it changes, with the scene and the line it came from. */
export function noteCaption(caption: Caption | null, sceneId?: string, beatId?: string) {
  const st = state();
  if (!st) return;
  const last = st.cues[st.cues.length - 1];
  if (last ? sameCaption(last, caption) : !caption) return;
  st.cues.push({ t: performance.now(), kind: caption?.kind ?? "description", speaker: caption?.speaker, text: caption?.text ?? "", scene: sceneId, beat: beatId });
}

/** Records a scene change, and finishes once the film has left `to` (or reached its ending). */
export function noteScene(scene: SceneNode) {
  const st = state();
  if (!st || st.done) return;
  st.sceneId = scene.id;
  st.sceneTitle = scene.title ?? scene.id;
  st.scenes.push({ t: performance.now(), id: scene.id });
  const to = st.options.to;
  const inTo = !!to && (scene.id === to || scene.id.startsWith(`${to}_`));
  if (inTo) st.reachedTo = true;
  else if (to && st.reachedTo) st.done = true;
  if (scene.isEnding) st.done = true;
  if (st.done) st.doneAt = performance.now();
}

/** The captions, drawn over the picture (and the letterbox bars) where a film's subtitles go. */
export function AnimaticCaptions({ caption }: { caption: Caption | null }) {
  if (!caption) return null;
  if (caption.kind === "heading") {
    return (
      <div className="animatic-heading" key={`h:${caption.text}`} data-animatic-caption="heading">
        {caption.text}
      </div>
    );
  }
  return (
    <div className="animatic-caption" key={`${caption.kind}:${caption.speaker ?? ""}:${caption.text}`} data-animatic-caption={caption.kind}>
      {caption.kind === "subtitle" ? (
        <>
          {caption.speaker && <div className="animatic-speaker">{caption.speaker}</div>}
          <div className="animatic-subtitle">{caption.text}</div>
        </>
      ) : (
        <div className="animatic-description">{caption.text}</div>
      )}
    </div>
  );
}

export interface AnimaticMarkInfo {
  scene: string;
  /** The authored beat number ("12"), the range a joined caption covers ("12–13"), or "–" while the scene
   *  heading is up (the heading is not a beat; it used to show as BEAT 1, the first line's number). */
  beat: number | string;
  picture: string;
}

/** Where the film is: the node's screenplay scene (`animaticMark`, set by the film builder), the beat counted from the start of
 *  that scene across the nodes it was cut into (continuations, a song's timed shots), and the file name of the picture on
 *  screen. Null for nodes with no scene (the titles, the credits). `label` is the current beat's authored number
 *  (`animaticBeat`, stamped by `animaticStory` before any lines were joined); when it is given it wins over the
 *  counted `beatIdx`, which numbers the joined captions and so drifts from the scene's own beat list. A negative
 *  `beatIdx` (the heading is on screen) shows "–", not the first beat's number. */
export function animaticMarkFor(scenes: SceneNode[], scene: SceneNode | null | undefined, beatIdx: number, picture: string | undefined, label?: string): AnimaticMarkInfo | null {
  const mark = scene?.animaticMark;
  if (!scene || !mark) return null;
  let before = 0;
  for (const s of scenes) {
    if (s.id === scene.id) break;
    if (s.animaticMark === mark) before += s.dialogueBeats?.length ?? 0;
  }
  const file = (picture ?? "").replace(/^video:/, "").split("/").pop() ?? "";
  return { scene: mark, beat: label ?? (beatIdx < 0 ? "–" : before + Math.max(0, beatIdx) + 1), picture: file.startsWith("gradient:") ? "" : file };
}

/** The mark, small in the top-right corner, out of the way of the captions and the scene heading. */
export function AnimaticMark({ info }: { info: AnimaticMarkInfo | null }) {
  if (!info) return null;
  return (
    <div className="animatic-mark" data-animatic-mark>
      <span>SC {info.scene}</span> · <span>BEAT {info.beat}</span>
      {info.picture && <div className="animatic-mark-pic">{info.picture}</div>}
    </div>
  );
}

/** Whether this browser will run the depth camera, and what it draws with (the graphics chip, or a software renderer
 *  when hardware acceleration is off), for the start card. */
function depthCheck(): { on: boolean; why: string; renderer: string } {
  let renderer = "no WebGL";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }
  } catch { /* no WebGL */ }
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const software = /swiftshader|llvmpipe|basic render|software/i.test(renderer);
  if (renderer === "no WebGL") return { on: false, why: "this browser has no WebGL: turn on its hardware acceleration (Chrome: Settings → System → Use graphics acceleration when available)", renderer };
  if (reduced) return { on: false, why: "your computer asks apps for reduced motion (Windows: Settings → Accessibility → Visual effects → Animation effects on)", renderer };
  return { on: true, why: software ? "on, but drawn in software: turn on the browser's hardware acceleration for smooth moves" : "on", renderer };
}

/** The film is over (or past the chosen scenes): a black card instead of the game's ending screen and controls. */
export function AnimaticEnd() {
  return (
    <div className="animatic-end" data-animatic-end>
      <div>The end</div>
    </div>
  );
}

/** In a browser an animatic waits for one click, so its sound is allowed to start, then plays itself with no controls:
 *  watch it, or record it with any screen recorder. */
export function AnimaticStart({ title, onStart }: { title: string; onStart: () => void }) {
  const o = ANIMATIC;
  const depth = depthCheck();
  const parts = [
    o?.to ? `to ${o.to.replace(/^nw_s?/, "scene ")}` : "to the end",
    o?.subtitles ? "subtitles" : "no subtitles",
    o?.descriptions ? "descriptions" : "no descriptions",
    o?.marks ? "scene and beat marks" : "no marks",
  ];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-6 text-center">
      <div className="font-pulp text-xs uppercase tracking-[0.4em] text-gold">Animatic</div>
      <h1 className="font-pulp text-3xl uppercase text-paper">{title}</h1>
      <p className="max-w-lg font-type text-sm text-paper/70">
        Plays by itself with no controls: {parts.join(" · ")}. Record it with a screen recorder, or use
        🎞 Export animatic on the home screen for an MP4 and a subtitle file.
      </p>
      <p className="max-w-lg font-type text-xs text-paper/55" data-depth-check={depth.on ? "on" : "off"}>
        Depth camera: {depth.why}. Drawing with: {depth.renderer}.
      </p>
      <button
        autoFocus
        onClick={onStart}
        className="border-2 border-gold bg-gold/15 px-6 py-2.5 font-pulp text-xs uppercase tracking-[0.2em] text-gold hover:bg-gold/25"
      >
        ▶ Start
      </button>
    </div>
  );
}
