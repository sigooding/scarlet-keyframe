import { useMemo } from "react";
import type { InspectorTab } from "./Inspector";
import {
  effectiveTrackLevel,
  resolveMusicSpans,
  type MusicSpan,
  type TrackMixMap,
} from "../core/previewAudio";
import { clipAtFrame, type TimelineClip } from "../sequence/animate";

export type AudioInspectorTab = Exclude<InspectorTab, "clip">;

export interface AmbienceSpan {
  id: string;
  sceneId: string;
  mark: string;
  label: string;
  title: string;
  startFrame: number;
  endFrame: number;
}

export function resolveAmbienceSpans(clips: TimelineClip[], totalFrames: number): AmbienceSpan[] {
  const spans: AmbienceSpan[] = [];
  const seen = new Set<string>();
  let active: AmbienceSpan | null = null;
  for (const clip of clips) {
    const scene = clip.keyframe.scene;
    if (seen.has(scene.id)) continue;
    seen.add(scene.id);
    const raw = scene.ambientAudio;
    if (raw === undefined) continue;
    const amb = String(raw).trim();
    if (!amb || amb === "none") {
      if (active) {
        active.endFrame = clip.startFrame;
        if (active.endFrame > active.startFrame) spans.push(active);
        active = null;
      }
      continue;
    }
    if (!active || active.title !== amb) {
      if (active) {
        active.endFrame = clip.startFrame;
        if (active.endFrame > active.startFrame) spans.push(active);
      }
      active = {
        id: clip.keyframe.id,
        sceneId: scene.id,
        mark: String(clip.keyframe.mark),
        label: amb.replace(/file:/g, "").replace(/\/film\/sfx\//g, ""),
        title: amb,
        startFrame: clip.startFrame,
        endFrame: totalFrames,
      };
    }
  }
  if (active) {
    active.endFrame = totalFrames;
    if (active.endFrame > active.startFrame) spans.push(active);
  }
  return spans;
}

export interface SyncedAudioLanesProps {
  clips: TimelineClip[];
  totalFrames: number;
  pxPerFrame: number;
  minVisibleFrame: number;
  maxVisibleFrame: number;
  selectedFrameId: string;
  musicDurations?: ReadonlyMap<string, number>;
  trackMix?: TrackMixMap;
  onSelect: (id: string, startFrame: number, audioTab?: AudioInspectorTab) => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
}

export function Tracks({
  clips,
  totalFrames,
  pxPerFrame,
  minVisibleFrame,
  maxVisibleFrame,
  selectedFrameId,
  musicDurations,
  trackMix,
  onSelect,
  onMoveCue,
}: SyncedAudioLanesProps) {
  const musicSpans = useMemo<MusicSpan[]>(
    () => resolveMusicSpans(clips, totalFrames, musicDurations),
    [clips, totalFrames, musicDurations],
  );

  const ambienceSpans = useMemo<AmbienceSpan[]>(
    () => resolveAmbienceSpans(clips, totalFrames),
    [clips, totalFrames],
  );

  const visibleVoice = useMemo(
    () =>
      clips.filter(
        (clip) =>
          clip.endFrame >= minVisibleFrame &&
          clip.startFrame <= maxVisibleFrame &&
          Boolean(clip.keyframe.beat.audioUrl),
      ),
    [clips, minVisibleFrame, maxVisibleFrame],
  );

  const visibleSfx = useMemo(
    () =>
      clips.filter(
        (clip) =>
          clip.endFrame >= minVisibleFrame &&
          clip.startFrame <= maxVisibleFrame &&
          Boolean(clip.keyframe.beat.sfxUrl),
      ),
    [clips, minVisibleFrame, maxVisibleFrame],
  );

  const visibleMusic = useMemo(
    () => musicSpans.filter((c) => c.endFrame >= minVisibleFrame && c.startFrame <= maxVisibleFrame),
    [musicSpans, minVisibleFrame, maxVisibleFrame],
  );

  const visibleAmbience = useMemo(
    () => ambienceSpans.filter((c) => c.endFrame >= minVisibleFrame && c.startFrame <= maxVisibleFrame),
    [ambienceSpans, minVisibleFrame, maxVisibleFrame],
  );

  function frameFromLaneClick(event: React.MouseEvent<HTMLElement>, fallbackFrame: number): number {
    const lane = event.currentTarget.closest(".synced-audio-lane") as HTMLElement | null;
    if (!lane || event.clientX === 0) return fallbackFrame;
    const rect = lane.getBoundingClientRect();
    if (rect.width <= 0) return fallbackFrame;
    return Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round((event.clientX - rect.left) / pxPerFrame)));
  }

  function handleEmptyLaneClick(event: React.MouseEvent<HTMLDivElement>, tab: AudioInspectorTab): void {
    if (event.target !== event.currentTarget || !clips.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedFrame = Math.max(
      0,
      Math.min(Math.max(0, totalFrames - 1), Math.round((event.clientX - rect.left) / pxPerFrame)),
    );
    const hit = clipAtFrame(clips, clickedFrame) || clips[0];
    if (hit) onSelect(hit.keyframe.id, clickedFrame, tab);
  }

  function dropCue(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const payload = event.dataTransfer.getData("application/x-frame24-cue");
    if (!payload || !clips.length) return;
    const [kind, sourceId] = payload.split("|");
    const rect = event.currentTarget.getBoundingClientRect();
    const targetFrame = Math.max(0, Math.round((event.clientX - rect.left) / pxPerFrame));
    let chosen = clips[0];
    for (const clip of clips) {
      if (clip.startFrame <= targetFrame) chosen = clip;
      else break;
    }
    if (chosen && sourceId && (kind === "music" || kind === "ambience" || kind === "sfx")) {
      onMoveCue(kind, sourceId, chosen.keyframe.id);
    }
  }

  const voiceSilenced = trackMix ? effectiveTrackLevel(trackMix, "voice") === 0 : false;
  const sfxSilenced = trackMix ? effectiveTrackLevel(trackMix, "sfx") === 0 : false;
  const musicSilenced = trackMix ? effectiveTrackLevel(trackMix, "music") === 0 : false;
  const ambienceSilenced = trackMix ? effectiveTrackLevel(trackMix, "ambience") === 0 : false;

  return (
    <div className="synced-audio-lanes" data-testid="synced-audio-lanes">
      {/* 1. Voice Lane */}
      <div
        className={`synced-audio-lane voice-lane ${voiceSilenced ? "is-silenced" : ""}`}
        data-testid="lane-voice"
        onClick={(e) => handleEmptyLaneClick(e, "voice")}
      >
        {visibleVoice.map((clip) => {
          const kf = clip.keyframe;
          const vIn = clip.voiceInFrame ?? 0;
          const vOut =
            clip.voiceOutFrame > vIn
              ? clip.voiceOutFrame
              : Math.min(clip.durationFrames, vIn + (clip.voiceFrames > 0 ? clip.voiceFrames : clip.durationFrames));
          const left = (clip.startFrame + vIn) * pxPerFrame;
          const voiceSpanFrames = Math.max(1, vOut - vIn);
          const isVoiceCut = clip.voiceFrames > 0 && vIn + clip.voiceFrames > clip.durationFrames;
          return (
            <button
              type="button"
              key={`vox-${kf.sceneId}-${kf.id}-${clip.index}`}
              className={`vox-cue ${selectedFrameId === kf.id ? "is-selected" : ""} ${isVoiceCut ? "is-voice-cut" : ""}`}
              data-testid={`vox-cue-${kf.id}`}
              data-scene-mark={kf.mark}
              data-voice-start={clip.startFrame + vIn}
              data-voice-end={clip.startFrame + vOut}
              style={{
                left,
                width: Math.max(12, voiceSpanFrames * pxPerFrame),
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(kf.id, clip.startFrame + vIn, "voice");
              }}
              title={`Voice (${kf.mark}/${kf.number}): ${kf.beat.audioUrl} — click to change file`}
            >
              <span>◉ {basename(String(kf.beat.audioUrl))}</span>
            </button>
          );
        })}
      </div>

      {/* 2. SFX Lane */}
      <div
        className={`synced-audio-lane sfx-lane ${sfxSilenced ? "is-silenced" : ""}`}
        data-testid="lane-sfx"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
        onClick={(e) => handleEmptyLaneClick(e, "sfx")}
      >
        {visibleSfx.map((clip) => {
          const kf = clip.keyframe;
          const left = clip.startFrame * pxPerFrame;
          return (
            <button
              type="button"
              key={`sfx-${kf.sceneId}-${kf.id}-${clip.index}`}
              className={`sfx-cue ${selectedFrameId === kf.id ? "is-selected" : ""}`}
              data-testid={`sfx-cue-${kf.id}`}
              data-scene-mark={kf.mark}
              style={{
                left,
                maxWidth: Math.max(18, clip.durationFrames * pxPerFrame - 2),
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-frame24-cue", `sfx|${kf.id}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(kf.id, clip.startFrame, "sfx");
              }}
              title={`SFX (${kf.mark}/${kf.number}): ${kf.beat.sfxUrl} — click to change file`}
            >
              <i />
              {basename(String(kf.beat.sfxUrl))}
            </button>
          );
        })}
      </div>

      {/* 3. Music Lane */}
      <div
        className={`synced-audio-lane music-lane ${musicSilenced ? "is-silenced" : ""}`}
        data-testid="lane-music"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
        onClick={(e) => handleEmptyLaneClick(e, "music")}
      >
        {visibleMusic.map((cue) => {
          const left = cue.startFrame * pxPerFrame;
          const width = Math.max(2, (cue.endFrame - cue.startFrame) * pxPerFrame);
          const s = cue.scene;
          const fadeIn = Number(s.musicFadeSeconds) > 0;
          const fadeOut = Number(s.musicFadeOutSeconds ?? s.musicFadeSeconds) > 0;
          return (
            <div
              key={`music-${cue.sceneId}-${cue.startFrame}`}
              role="button"
              tabIndex={0}
              className={`music-segment ${selectedFrameId === cue.id ? "is-selected" : ""}`}
              data-testid={`music-span-${cue.sceneId}`}
              data-track-url={cue.url}
              data-start-frame={cue.startFrame}
              data-end-frame={cue.endFrame}
              style={{ left, width }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-frame24-cue", `music|${cue.id}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => {
                e.stopPropagation();
                const clicked = frameFromLaneClick(e, cue.startFrame);
                const clamped = Math.max(cue.startFrame, Math.min(Math.max(cue.startFrame, cue.endFrame - 1), clicked));
                onSelect(cue.id, clamped, "music");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(cue.id, cue.startFrame, "music");
                }
              }}
              title={`${cue.url} · ${cue.loop ? "loop" : "once"} · fade in ${s.musicFadeSeconds ?? 1.4}s · level ${s.musicLevel ?? 1} — click to change file`}
            >
              <span>{cue.label}</span>
              {fadeIn && <i className="fade-in-wedge" />}
              {fadeOut && <i className="fade-out-wedge" />}
            </div>
          );
        })}
      </div>

      {/* 4. Ambience Lane */}
      <div
        className={`synced-audio-lane ambience-lane ${ambienceSilenced ? "is-silenced" : ""}`}
        data-testid="lane-ambience"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
        onClick={(e) => handleEmptyLaneClick(e, "ambience")}
      >
        {visibleAmbience.map((cue) => {
          const left = cue.startFrame * pxPerFrame;
          const width = Math.max(2, (cue.endFrame - cue.startFrame) * pxPerFrame);
          return (
            <div
              key={`amb-${cue.sceneId}-${cue.startFrame}`}
              role="button"
              tabIndex={0}
              className={`ambience-segment ${selectedFrameId === cue.id ? "is-selected" : ""}`}
              data-testid={`ambience-span-${cue.sceneId}`}
              style={{ left, width }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-frame24-cue", `ambience|${cue.id}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => {
                e.stopPropagation();
                const clicked = frameFromLaneClick(e, cue.startFrame);
                const clamped = Math.max(cue.startFrame, Math.min(Math.max(cue.startFrame, cue.endFrame - 1), clicked));
                onSelect(cue.id, clamped, "ambience");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(cue.id, cue.startFrame, "ambience");
                }
              }}
              title={`${cue.title} — click to change ambience file`}
            >
              <span>{cue.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || value;
}
