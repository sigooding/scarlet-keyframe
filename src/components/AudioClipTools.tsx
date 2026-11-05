// The cut, trim and shape controls for one sound clip, under the Voice / SFX / Music / Ambience tabs.
// Every button here acts on the clip the tab has in hand; the work itself is done by src/core/audioEdits.ts.

import { useState } from "react";
import {
  formatMsTimecode,
  MIN_AUDIO_CLIP_MS,
  type AudioLaneId,
  type ResolvedAudioClip,
} from "../core/audioClips";
import { audioLabelFromSrc } from "../core/audioClips";
import type { AudioClipTool } from "../core/audioEdits";

export interface AudioSpanTarget {
  /** "shot" or "scene", for the button's own words. */
  kind: "shot" | "scene";
  label: string;
  startMs: number;
  endMs: number;
}

export interface AudioClipToolsProps {
  clip: ResolvedAudioClip;
  lane: AudioLaneId;
  playheadMs: number;
  /** The next cue on the same lane, when there is one: what a crossfade would run into. */
  nextClip?: ResolvedAudioClip;
  /** The shot and the scene under the clip, to lay it across. */
  spans: AudioSpanTarget[];
  onTool: (clipId: string, tool: AudioClipTool) => void;
}

const FADE_PRESETS_MS = [0, 500, 1000, 2000];
const CROSSFADE_PRESETS_MS = [500, 1000, 2000, 4000];

function fadeLabel(ms: number): string {
  if (ms === 0) return "none";
  return ms % 1000 === 0 ? `${ms / 1000} s` : `${ms / 1000}s`;
}

export function AudioClipTools({
  clip,
  lane,
  playheadMs,
  nextClip,
  spans,
  onTool,
}: AudioClipToolsProps) {
  const [crossfadeMs, setCrossfadeMs] = useState(1000);

  const insideStart = playheadMs > clip.startMs + MIN_AUDIO_CLIP_MS;
  const insideEnd = playheadMs < clip.endMs - MIN_AUDIO_CLIP_MS;
  const canSplit = insideStart && insideEnd;
  const canTrimStart = insideEnd && Math.abs(playheadMs - clip.startMs) > 0.5;
  const canTrimEnd = insideStart && Math.abs(playheadMs - clip.endMs) > 0.5;
  const playheadNote = canSplit
    ? `Playhead ${formatMsTimecode(playheadMs)}, ${Math.round(playheadMs - clip.startMs)} ms into this ${lane} clip.`
    : `Put the playhead inside this ${lane} clip (${formatMsTimecode(clip.startMs)} – ${formatMsTimecode(clip.endMs)}) to cut it.`;

  return (
    <section className="inspector-section" data-testid="audio-clip-tools">
      <div className="audio-tools-head">
        <span className="eyebrow">CUT &amp; TRIM</span>
        <small>
          {clip.durationMs >= 10000
            ? `${formatMsTimecode(clip.durationMs)} long`
            : `${Math.round(clip.durationMs)} ms long`}
        </small>
      </div>

      <div className="picture-actions">
        <button
          type="button"
          className="button button-quiet"
          data-testid="audio-tool-split"
          disabled={!canSplit}
          title="Cut this clip in two at the playhead (S). Both halves play the same recording, straight through the cut."
          onClick={() => onTool(clip.id, { kind: "split" })}
        >
          ✂ Cut at playhead (S)
        </button>
        <button
          type="button"
          className="button button-quiet"
          data-testid="audio-tool-trim-start"
          disabled={!canTrimStart}
          title="Start the clip at the playhead: the recording moves with the edge, so the sound stays in step. Past the clip's own start it plays more of the recording's head."
          onClick={() => onTool(clip.id, { kind: "trim", edge: "start" })}
        >
          ⇤ Start here
        </button>
        <button
          type="button"
          className="button button-quiet"
          data-testid="audio-tool-trim-end"
          disabled={!canTrimEnd}
          title="End the clip at the playhead: sooner, or later if the recording has more to play."
          onClick={() => onTool(clip.id, { kind: "trim", edge: "end" })}
        >
          ⇥ End here
        </button>
      </div>
      <small className="inspector-note" data-testid="audio-tool-playhead-note">
        {playheadNote}
      </small>

      <div className="picture-actions">
        <button
          type="button"
          className="button button-quiet"
          data-testid="audio-tool-duplicate"
          title="Put a copy of this clip straight after it, to carry the cue on."
          onClick={() => onTool(clip.id, { kind: "duplicate" })}
        >
          ⧉ Copy after
        </button>
        {spans.map((span) => (
          <button
            key={span.kind}
            type="button"
            className="button button-quiet"
            data-testid={`audio-tool-fit-${span.kind}`}
            title={`Lay this clip across ${span.label} (${formatMsTimecode(span.startMs)} – ${formatMsTimecode(span.endMs)}). A recording too short for it is looped.`}
            onClick={() => onTool(clip.id, { kind: "fit", span: span.kind })}
          >
            ↔ Fill the {span.kind}
          </button>
        ))}
      </div>

      <div className="audio-preset-row" data-testid="audio-tool-fade-in">
        <span className="control-label">Fade in</span>
        <div className="audio-preset-buttons">
          {FADE_PRESETS_MS.map((ms) => (
            <button
              key={ms}
              type="button"
              className={`audio-preset-btn ${Math.round(clip.fadeInMs) === ms ? "is-active" : ""}`}
              data-testid={`audio-fade-in-${ms}`}
              onClick={() => onTool(clip.id, { kind: "fade", edge: "in", ms })}
            >
              {fadeLabel(ms)}
            </button>
          ))}
        </div>
      </div>

      <div className="audio-preset-row" data-testid="audio-tool-fade-out">
        <span className="control-label">Fade out</span>
        <div className="audio-preset-buttons">
          {FADE_PRESETS_MS.map((ms) => (
            <button
              key={ms}
              type="button"
              className={`audio-preset-btn ${Math.round(clip.fadeOutMs) === ms ? "is-active" : ""}`}
              data-testid={`audio-fade-out-${ms}`}
              onClick={() => onTool(clip.id, { kind: "fade", edge: "out", ms })}
            >
              {fadeLabel(ms)}
            </button>
          ))}
        </div>
      </div>

      <div className="audio-crossfade" data-testid="audio-tool-crossfade">
        <div className="audio-preset-row">
          <span className="control-label">Crossfade into</span>
          <div className="audio-preset-buttons">
            {CROSSFADE_PRESETS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                className={`audio-preset-btn ${crossfadeMs === ms ? "is-active" : ""}`}
                data-testid={`audio-crossfade-${ms}`}
                disabled={!nextClip}
                onClick={() => setCrossfadeMs(ms)}
              >
                {fadeLabel(ms)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="button button-wide button-quiet"
          data-testid="audio-tool-crossfade-apply"
          disabled={!nextClip}
          title={
            nextClip
              ? `Hold this clip over the start of ${audioLabelFromSrc(nextClip.src)} and ramp one into the other.`
              : `No other clip after this one on the ${lane.toUpperCase()} lane.`
          }
          onClick={() => onTool(clip.id, { kind: "crossfade", ms: crossfadeMs })}
        >
          {nextClip
            ? `⤫ Crossfade ${fadeLabel(crossfadeMs)} into ${audioLabelFromSrc(nextClip.src)}`
            : `⤫ Nothing after this on the ${lane.toUpperCase()} lane`}
        </button>
      </div>
    </section>
  );
}
