// Splitting a shot around clips that play inside it: the shot plays, the clip takes over (a cutaway, or a lip-synced
// take of the same picture), the shot comes back. Used by the Festival Cut (its cutaways and lip syncs) and by the
// editor's Make lip sync button.
//
// The shot's total length never changes, and piece 0 keeps the shot's own id, so every sound anchored to the shot plays
// exactly where it did. Captions are split at the cuts; the route to the next scene moves to the last piece.

import type { AnyRecord, BeatLike, StoryLike } from "./model";

export interface ShotCut {
  /** Frames from the shot's start. */
  from: number;
  to: number;
  /** What plays in the cut: a picture, or `video:/film/video/....mp4`. */
  picture: string;
  /** What the cut shows, in a line (the shot's text in the timeline). */
  text: string;
}

const ROUTE_KEYS = ["afterBeatMode", "afterBeatTargetSceneId", "afterBeatSceneId", "afterBeatDelaySeconds", "nextSceneId"];
/** What a cut or the return to the shot must not carry: the shot's own sound, depth rig and lights. */
const NOT_COPIED = ["audioUrl", "sfxUrl", "sfxVolume", "audioClipId"];
const NOT_COPIED_LOOK = ["depthMap", "depthPlate", "depthCutouts", "depthAmount", "depthMotion", "depthFocus", "lights", "lightSource"];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The id of the n-th piece the Festival Cut splits a shot into (piece 0 keeps the shot's own id). */
export function cutawayPieceId(beatId: string, piece: number): string {
  return piece === 0 ? beatId : `${beatId}~fc${piece}`;
}

/**
 * The pieces a shot of `total` frames becomes with these cuts: [shot][cut][shot]...[shot], empty pieces dropped.
 * `idFor(n)` names piece n (piece 0 must keep the shot's id). `fresh(part)` is called for every piece after the first,
 * to give it its own camera (the shot's move is not repeated).
 */
export function splitShot(beat: BeatLike, total: number, cuts: ShotCut[], idFor: (n: number) => string, fresh?: (part: BeatLike) => void): BeatLike[] {
  const sorted = [...cuts].sort((a, b) => a.from - b.from);
  const pieces: { from: number; to: number; picture?: string; text?: string }[] = [];
  let at = 0;
  for (const cut of sorted) {
    const from = Math.max(at, Math.min(total, Math.round(cut.from)));
    const to = Math.max(from, Math.min(total, Math.round(cut.to)));
    if (from > at) pieces.push({ from: at, to: from });
    if (to > from) pieces.push({ from, to, picture: cut.picture, text: cut.text });
    at = to;
  }
  if (at < total) pieces.push({ from: at, to: total });
  const original = clone(beat);
  const captions = Array.isArray(original.captions) ? original.captions : [];
  return pieces.map((piece, n) => {
    const part: BeatLike = n === 0 ? beat : clone(original);
    part.id = idFor(n);
    part.durationFrames = piece.to - piece.from;
    part.captions = captions
      .filter((c) => c.outFrame > piece.from && c.inFrame < piece.to)
      .map((c) => ({ ...c, inFrame: Math.max(c.inFrame, piece.from) - piece.from, outFrame: Math.min(c.outFrame, piece.to) - piece.from }));
    if (n > 0) {
      for (const k of NOT_COPIED) delete (part as AnyRecord)[k];
      part.cinematic = { ...(original.cinematic ?? {}) };
      for (const k of NOT_COPIED_LOOK) delete (part.cinematic as AnyRecord)[k];
      if (fresh) fresh(part);
      else delete part.animation;
    }
    if (piece.picture) {
      part.background = piece.picture;
      part.characterId = "nw_narrator";
      part.text = piece.text ?? "";
      part.silent = true;
    }
    if (n < pieces.length - 1) for (const k of ROUTE_KEYS) delete (part as AnyRecord)[k];
    return part;
  });
}

/**
 * The editor's edit: a clip plays inside one shot from `from` to `to` (frames from the shot's start). `totalFrames` is
 * the shot's length as the timeline plays it (a montage shot has no durationFrames of its own). New pieces get ids
 * `<shot>~ls1`, `~ls2` ... that no shot in the story has yet. Returns a new story, or null when the shot is not there
 * or the cut does not fit inside it.
 */
export function insertClipIntoShot(story: StoryLike, beatId: string, totalFrames: number, cut: ShotCut): StoryLike | null {
  const total = Math.round(totalFrames);
  if (!(total > 0) || !(cut.to > cut.from) || cut.from < 0 || cut.from >= total) return null;
  const next = clone(story);
  const taken = new Set(next.scenes.flatMap((s) => (s.dialogueBeats ?? []).map((b) => String(b.id))));
  for (const scene of next.scenes) {
    const beats = scene.dialogueBeats ?? [];
    const index = beats.findIndex((b) => String(b.id) === beatId);
    if (index < 0) continue;
    let serial = 1;
    const ids = new Map<number, string>();
    const idFor = (n: number) => {
      if (n === 0) return beatId;
      if (!ids.has(n)) {
        while (taken.has(`${beatId}~ls${serial}`)) serial += 1;
        const id = `${beatId}~ls${serial}`;
        taken.add(id);
        ids.set(n, id);
      }
      return ids.get(n)!;
    };
    const pieces = splitShot(beats[index], total, [cut], idFor);
    scene.dialogueBeats = [...beats.slice(0, index), ...pieces, ...beats.slice(index + 1)];
    return next;
  }
  return null;
}
