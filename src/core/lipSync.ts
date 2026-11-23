/**
 * The editor's "Make lip sync" button, as plain data (no React): which voice lines a shot can be lip-synced to, and what
 * the row in the Clip tab shows. The work happens on this computer's NVIDIA GPU: the editor's server runs
 * `npm run lipsync` (LatentSync 1.5, scripts/make-lipsync.mjs) and the finished clip is cut into the shot on the exact
 * frames of the line (insertClipIntoShot in cutaways.ts), as one undo step.
 */
import type { ResolvedAudioClip } from "./audioClips";
import type { LipSyncReady } from "./depthApiTypes";
import type { BeatLike } from "./model";

const FPS = 24;
/** A line must play at least this long inside the shot to be offered. */
const MIN_LINE_FRAMES = 12;

/** A voice line heard during a shot, which the shot's picture can be made to speak. */
export interface LipSyncLine {
  /** The audio clip's id. */
  id: string;
  /** The voice file, /film/voice/....mp3 */
  audio: string;
  /** Where the line starts and ends, in frames from the shot's start (the end is clipped to the shot). */
  from: number;
  to: number;
  /** "VERA: Is she hurt?", or the file name when there is no caption. */
  label: string;
}

/** The voice lines that START inside the shot (a line that began on another shot is not this face speaking). */
export function voiceLinesInShot(
  shot: { startFrame: number; durationFrames: number; beat: Pick<BeatLike, "captions"> },
  audioClips: ResolvedAudioClip[],
): LipSyncLine[] {
  const startMs = (shot.startFrame / FPS) * 1000;
  const endMs = ((shot.startFrame + shot.durationFrames) / FPS) * 1000;
  const captions = Array.isArray(shot.beat.captions) ? shot.beat.captions : [];
  return audioClips
    .filter((c) => c.lane === "voice" && typeof c.src === "string" && c.src.startsWith("/film/") && c.startMs >= startMs && c.startMs < endMs)
    .sort((a, b) => a.startMs - b.startMs)
    .flatMap((c) => {
      const from = Math.max(0, Math.round((c.startMs / 1000) * FPS - shot.startFrame));
      const to = Math.min(shot.durationFrames, Math.max(from + 1, Math.round((c.endMs / 1000) * FPS - shot.startFrame)));
      const caption = captions.find((cap) => cap.inFrame <= from + 6 && cap.outFrame > from);
      const file = c.src.split("/").pop() ?? c.src;
      // under half a second inside the shot is a line that belongs to the next shot
      if (to - from < MIN_LINE_FRAMES) return [];
      return [
        {
          id: c.id,
          audio: c.src,
          from,
          to,
          label: caption ? `${caption.speaker ? `${caption.speaker}: ` : ""}${caption.text}` : file.replace(/\.[^.]+$/, ""),
        },
      ];
    });
}

export type LipSyncJobStatus = "starting" | "running" | "done" | "error" | "cancelled";

export interface LipSyncJob {
  /** The shot it is for, its length, and the picture and line it was started with. */
  frameId: string;
  totalFrames: number;
  picture: string;
  line: LipSyncLine;
  status: LipSyncJobStatus;
  /** The server's id (null before it answered). */
  id: string | null;
  current: string | null;
  message: string | null;
  /** The clip, when done. */
  video: string | null;
  duration: number | null;
  applied: boolean;
  note: string | null;
}

export interface LipSyncState {
  /** null before the first answer; "unavailable" when there is no editor server to ask (a static page). */
  ready: LipSyncReady | "unavailable" | null;
  job: LipSyncJob | null;
}

export type LipSyncRowView =
  | { kind: "hidden" }
  | { kind: "checking" }
  | { kind: "unavailable" }
  | { kind: "setup"; missing: string[]; command: string }
  | { kind: "no-lines" }
  | { kind: "ready"; lines: LipSyncLine[]; busyElsewhere: boolean }
  | { kind: "running"; current: string | null; line: LipSyncLine; cancellable: boolean }
  | { kind: "done"; applied: boolean; note: string | null; video: string | null }
  | { kind: "failed"; message: string; cancelled: boolean };

/** What the row shows for this shot. */
export function lipSyncRowView(state: LipSyncState, shot: { frameId: string; canLipSync: boolean }, lines: LipSyncLine[]): LipSyncRowView {
  // a job's outcome stays on its shot, even once the shot has become the clip (a clip from frame 0 is the shot's first piece)
  const job = state.job;
  if (job && job.frameId === shot.frameId) {
    if (job.status === "starting" || job.status === "running") return { kind: "running", current: job.current, line: job.line, cancellable: Boolean(job.id) };
    if (job.status === "done") return { kind: "done", applied: job.applied, note: job.note, video: job.video };
    return { kind: "failed", message: job.message ?? "It stopped.", cancelled: job.status === "cancelled" };
  }
  if (!shot.canLipSync) return { kind: "hidden" };
  if (state.ready === null) return { kind: "checking" };
  if (state.ready === "unavailable") return { kind: "unavailable" };
  if (!state.ready.ready) return { kind: "setup", missing: state.ready.missing, command: state.ready.setupCommand };
  if (!lines.length) return { kind: "no-lines" };
  const busyElsewhere = Boolean(job && (job.status === "starting" || job.status === "running"));
  return { kind: "ready", lines, busyElsewhere };
}
