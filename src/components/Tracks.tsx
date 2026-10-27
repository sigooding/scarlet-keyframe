import { useMemo } from "react";
import {
  effectiveTrackLevel,
  resolveMusicSpans,
  type MusicSpan,
  type TrackMixMap,
} from "../core/previewAudio";
import type { TimelineClip } from "../sequence/animate";

export interface SyncedAudioLanesProps {
  clips: TimelineClip[];
  totalFrames: number;
  pxPerFrame: number;
  minVisibleFrame: number;
  maxVisibleFrame: number;
  selectedFrameId: string;
  musicDurations?: ReadonlyMap<string, number>;
  trackMix?: TrackMixMap;
  onSelect: (id: string, startFrame: number) => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
}

interface AmbienceSpan {
  id: string;
  sceneId: string;
  label: string;
  title: string;
  startFrame: number;
  endFrame: number;
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

  const ambienceSpans = useMemo<AmbienceSpan[]>(() => {
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
  }, [clips, totalFrames]);

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
      >
        {visibleVoice.map((clip) => {
          const kf = clip.keyframe;
          const left = clip.startFrame * pxPerFrame;
          const voiceSpanFrames = clip.voiceFrames > 0 ? clip.voiceFrames : clip.durationFrames;
          const isVoiceCut = clip.voiceFrames > 0 && clip.durationFrames < clip.voiceFrames;
          return (
            <button
              type="button"
              key={`vox-${kf.sceneId}-${kf.id}-${clip.index}`}
              className={`vox-cue ${selectedFrameId === kf.id ? "is-selected" : ""} ${isVoiceCut ? "is-voice-cut" : ""}`}
              data-testid={`vox-cue-${kf.id}`}
              data-scene-mark={kf.mark}
              style={{
                left,
                width: Math.max(12, Math.min(clip.durationFrames, voiceSpanFrames) * pxPerFrame),
              }}
              onClick={() => onSelect(kf.id, clip.startFrame)}
              title={`Voice (${kf.mark}/${kf.number}): ${kf.beat.audioUrl}`}
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
              onClick={() => onSelect(kf.id, clip.startFrame)}
              title={`SFX (${kf.mark}/${kf.number}): ${kf.beat.sfxUrl}`}
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
              onClick={() => onSelect(cue.id, cue.startFrame)}
              title={`${cue.url} · ${cue.loop ? "loop" : "once"} · fade in ${s.musicFadeSeconds ?? 1.4}s · level ${s.musicLevel ?? 1}`}
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
      >
        {visibleAmbience.map((cue) => {
          const left = cue.startFrame * pxPerFrame;
          const width = Math.max(2, (cue.endFrame - cue.startFrame) * pxPerFrame);
          return (
            <div
              key={`amb-${cue.sceneId}-${cue.startFrame}`}
              className={`ambience-segment ${selectedFrameId === cue.id ? "is-selected" : ""}`}
              data-testid={`ambience-span-${cue.sceneId}`}
              style={{ left, width }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-frame24-cue", `ambience|${cue.id}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onSelect(cue.id, cue.startFrame)}
              title={cue.title}
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
