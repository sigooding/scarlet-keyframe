// "Jack's Narrated Cut": Jack's Noir with Jack's own voice-over written in place of the screenplay's description,
// scene by scene. Each voice-over line is a caption "JACK (V.O.)" (in italics) and, where `audioUrl` is given, Jack's
// recorded voice ("Narrator Lead", ElevenLabs eleven_v4, public/film/voice/narrated-jack/): every picture, camera move
// and sound the film already has stays where it is.
//
// In Original Uncut the screenplay's description ("JACK (48) sits at the desk ...") is a run of silent narrator beats shown
// as captions. Those beats also carry the shot's picture, camera move and sound effect, so they are never removed: a
// beat's CAPTION is replaced (`replace`), hidden (`silence`), or a new voice-over beat is put after one (`add`).
//
// To narrate another scene, add an entry to JACK_NARRATION below (the beat ids are in src/data/nobodys-witness-film.json).

import { FPS, clipFrames } from "./timing";
import { buildKeyframes, type AnyRecord, type BeatLike, type StoryLike } from "./model";

/** The character Jack's voice-over is credited to: it is shown as "JACK (V.O.)". */
export const JACK_VO_CHARACTER_ID = "nw_jack_vo";
export const JACK_VO_NAME = "Jack (V.O.)";

export type NarrationOp =
  /** The beat keeps its picture, camera and sound; its caption becomes this line of Jack's voice-over. */
  | { op: "replace"; beatId: string; text: string; audioUrl?: string; audioSeconds?: number }
  /** No caption on this beat: the picture, camera and sound play on without narration. */
  | { op: "silence"; beatId: string }
  /** A new voice-over beat after this one, on the picture that is showing. */
  | { op: "add"; after: string; id: string; text: string; audioUrl?: string; audioSeconds?: number };

export interface SceneNarration {
  sceneId: string;
  /** What this scene's narration does, in words (for people reading this file). */
  note: string;
  ops: NarrationOp[];
}

export const JACK_NARRATION: SceneNarration[] = [
  {
    sceneId: "nw_s10",
    note: "10 — Depends who's calling. Jack at his desk; Vera arrives; the photograph; Vera leaves.",
    ops: [
      // JACK (48) sits at the desk: his own words in place of the description (the picture, the lighter's sound and the
      // camera stay, one line to each beat).
      { op: "replace", beatId: "nw_b229", text: "I'd stopped buying cigarettes years ago.", audioUrl: "/film/voice/narrated-jack/nw_b229-id-stopped-buying-cigarettes.mp3", audioSeconds: 2.64 },
      { op: "replace", beatId: "nw_b230", text: "Still carried the lighter.", audioUrl: "/film/voice/narrated-jack/nw_b230-still-carried-the-lighter.mp3", audioSeconds: 1.76 },
      { op: "replace", beatId: "nw_b231", text: "It gave me something to do while I decided what not to say.", audioUrl: "/film/voice/narrated-jack/nw_b231-something-to-do.mp3", audioSeconds: 3.84 },
      // Vera's arrival and their opening exchange play without narration.
      { op: "silence", beatId: "nw_b232" },
      { op: "silence", beatId: "nw_b236" },
      { op: "silence", beatId: "nw_b238" },
      // V2, after "He doesn't answer. Another train passes. The blinds shiver."
      {
        op: "add",
        after: "nw_b248",
        id: "nw_b248_vo",
        text: "There's a lie you tell for money and a lie you tell because the truth would take too long. I'd been in business long enough to know the difference. That afternoon I was charging her for both.",
        audioUrl: "/film/voice/narrated-jack/nw_b248_vo-a-lie-you-tell.mp3",
        audioSeconds: 11.36,
      },
      // V3, after "...sets it down, face up, and squares it to the edge of the desk." (the old photograph has landed on his
      // desk and he has recognised Daniel), just before he says "I'm sorry." out loud.
      // To play it at the end of the scene instead ("Jack sits very still."), change `after` to "nw_b278": a voice-over added
      // after the scene's last beat takes over that beat's way on to the next scene and its transition time.
      {
        op: "add",
        after: "nw_b260",
        id: "nw_b260_vo",
        text: "I said I was sorry. I was sorry. Just not about the thing she thought.",
        audioUrl: "/film/voice/narrated-jack/nw_b260_vo-i-said-i-was-sorry.mp3",
        audioSeconds: 5.28,
      },
    ],
  },
];

/** A recorded line is held for its whole take and half a second of air. */
function recordedFrames(seconds: number | undefined): number {
  return seconds ? Math.ceil((seconds + 0.5) * FPS) : 0;
}

/** How long a line of voice-over is held: about 2.3 words a second (37 words are about 16 seconds), never under 2 seconds. */
export const VO_WORDS_PER_SECOND = 37 / 16;

export function voiceOverSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, words / VO_WORDS_PER_SECOND);
}

export interface JackNarrationReport {
  replaced: number;
  silenced: number;
  added: number;
  /** Beats the plan names that are not in the story (the film changed): nothing was done for them. */
  missing: string[];
}

function ensureJackVoiceOver(story: StoryLike): void {
  const chars = story.characters;
  const entry = { id: JACK_VO_CHARACTER_ID, name: JACK_VO_NAME, role: "Jack's voice-over", avatarUrl: "", trustMeter: 0 };
  if (Array.isArray(chars)) {
    if (!chars.some((item: AnyRecord) => item?.id === JACK_VO_CHARACTER_ID)) chars.push(entry);
  } else if (chars && typeof chars === "object") {
    (chars as AnyRecord)[JACK_VO_CHARACTER_ID] ??= entry;
  } else {
    story.characters = [entry];
  }
}

/**
 * Applies the narration plan to a story (a copy that may be changed: Original Uncut's story, cloned by the cut builder).
 * A scene's beats are found by id; ones that are not there are reported, not guessed.
 */
export function applyJackNarration(story: StoryLike, plan: readonly SceneNarration[] = JACK_NARRATION): JackNarrationReport {
  const report: JackNarrationReport = { replaced: 0, silenced: 0, added: 0, missing: [] };
  if (!plan.length) return report;
  ensureJackVoiceOver(story);

  // The beats' own durations, before any of their text changes: a shot never gets shorter than the film made it.
  const originalFrames = new Map<string, number>();
  for (const frame of buildKeyframes(story)) {
    if (frame.beat.id) originalFrames.set(String(frame.beat.id), clipFrames(frame));
  }

  for (const entry of plan) {
    const scene = story.scenes.find((item) => item.id === entry.sceneId);
    const beats = scene?.dialogueBeats;
    if (!scene || !beats) {
      report.missing.push(entry.sceneId);
      continue;
    }
    const find = (id: string) => beats.find((beat) => beat.id === id);

    for (const op of entry.ops) {
      if (op.op === "replace") {
        const beat = find(op.beatId);
        if (!beat) {
          report.missing.push(op.beatId);
          continue;
        }
        const voiceFrames = Math.round(voiceOverSeconds(op.text) * FPS);
        beat.durationFrames = Math.max(originalFrames.get(op.beatId) ?? 0, voiceFrames, recordedFrames(op.audioSeconds));
        if (op.audioUrl) beat.audioUrl = op.audioUrl;
        beat.characterId = JACK_VO_CHARACTER_ID;
        beat.text = op.text;
        beat.silent = true;
        delete beat.captions;
        report.replaced += 1;
      } else if (op.op === "silence") {
        const beat = find(op.beatId);
        if (!beat) {
          report.missing.push(op.beatId);
          continue;
        }
        // an authored, empty list of captions: nothing is shown, the beat's text, length, picture and sound are untouched
        beat.captions = [];
        report.silenced += 1;
      }
    }

    // New beats last, so the ids above are still the film's own.
    for (const op of entry.ops) {
      if (op.op !== "add") continue;
      const index = beats.findIndex((beat) => beat.id === op.after);
      if (index < 0) {
        report.missing.push(op.after);
        continue;
      }
      if (beats.some((beat) => beat.id === op.id)) continue; // already there (applied twice)
      const anchor = beats[index];
      const last = index === beats.length - 1;
      const added: BeatLike = {
        id: op.id,
        characterId: JACK_VO_CHARACTER_ID,
        text: op.text,
        silent: true,
        durationFrames: Math.max(Math.round(voiceOverSeconds(op.text) * FPS), recordedFrames(op.audioSeconds)),
      };
      if (op.audioUrl) added.audioUrl = op.audioUrl;
      if (last) {
        // The scene now ends on the voice-over: it takes over what happens after the scene's last beat (the way on to the next
        // scene, and the time for the scene's transition).
        for (const key of Object.keys(anchor)) {
          if (!key.startsWith("afterBeat")) continue;
          added[key] = anchor[key];
          delete anchor[key];
        }
        const transition = scene.transition && scene.transition !== "none" && scene.transition !== "cut" ? Math.min(2.4, Math.max(0, Number(scene.transitionSpeed) || 0)) : 0;
        added.durationFrames = (added.durationFrames ?? 0) + Math.round(transition * FPS);
      }
      beats.splice(index + 1, 0, added);
      report.added += 1;
    }
  }
  return report;
}
