import { useMemo } from "react";
import type { TimelineClip } from "../sequence/animate";

export interface SyncedAudioLanesProps {
  clips: TimelineClip[];
  totalFrames: number;
  pxPerFrame: number;
  minVisibleFrame: number;
  maxVisibleFrame: number;
  selectedFrameId: string;
  onSelect: (id: string, startFrame: number) => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
}

interface SpanCue {
  id: string;
  sceneId: string;
  label: string;
  title: string;
  startFrame: number;
  endFrame: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

export function Tracks({
  clips,
  totalFrames,
  pxPerFrame,
  minVisibleFrame,
  maxVisibleFrame,
  selectedFrameId,
  onSelect,
  onMoveCue,
}: SyncedAudioLanesProps) {
  const sceneStarts = useMemo(() => {
    const starts: TimelineClip[] = [];
    const seen = new Set<string>();
    for (const clip of clips) {
      if (!seen.has(clip.keyframe.sceneId)) {
        seen.add(clip.keyframe.sceneId);
        starts.push(clip);
      }
    }
    return starts;
  }, [clips]);

  const musicSpans = useMemo<SpanCue[]>(() => {
    const raw = sceneStarts.filter((clip) => {
      const s = clip.keyframe.scene;
      return s.musicMode === "track" || Boolean(s.musicUrl || s.sceneAudioUrl);
    });
    return raw.map((clip, idx) => {
      const s = clip.keyframe.scene;
      const url = String(s.musicUrl || s.sceneAudioUrl || "Untitled cue");
      const endFrame = idx + 1 < raw.length ? raw[idx + 1].startFrame : totalFrames;
      return {
        id: clip.keyframe.id,
        sceneId: clip.keyframe.sceneId,
        label: basename(url),
        title: `${url} · fade in ${s.musicFadeSeconds ?? 1.4}s · level ${s.musicLevel ?? 1}`,
        startFrame: clip.startFrame,
        endFrame,
        fadeIn: Number(s.musicFadeSeconds) > 0,
        fadeOut: Number(s.musicFadeOutSeconds ?? s.musicFadeSeconds) > 0,
      };
    });
  }, [sceneStarts, totalFrames]);

  const ambienceSpans = useMemo<SpanCue[]>(() => {
    const raw = sceneStarts.filter((clip) => {
      const amb = clip.keyframe.scene.ambientAudio;
      return Boolean(amb && amb !== "none");
    });
    return raw.map((clip, idx) => {
      const amb = String(clip.keyframe.scene.ambientAudio);
      const endFrame = idx + 1 < raw.length ? raw[idx + 1].startFrame : totalFrames;
      return {
        id: clip.keyframe.id,
        sceneId: clip.keyframe.sceneId,
        label: amb.replace(/file:/g, "").replace(/\/film\/sfx\//g, ""),
        title: amb,
        startFrame: clip.startFrame,
        endFrame,
        fadeIn: false,
        fadeOut: false,
      };
    });
  }, [sceneStarts, totalFrames]);

  const visibleMusic = useMemo(
    () => musicSpans.filter((c) => c.endFrame >= minVisibleFrame && c.startFrame <= maxVisibleFrame),
    [musicSpans, minVisibleFrame, maxVisibleFrame],
  );

  const visibleAmbience = useMemo(
    () => ambienceSpans.filter((c) => c.endFrame >= minVisibleFrame && c.startFrame <= maxVisibleFrame),
    [ambienceSpans, minVisibleFrame, maxVisibleFrame],
  );

  const visibleBeatAudio = useMemo(
    () =>
      clips.filter(
        (clip) =>
          clip.endFrame >= minVisibleFrame &&
          clip.startFrame <= maxVisibleFrame &&
          Boolean(clip.keyframe.beat.sfxUrl || clip.keyframe.beat.audioUrl),
      ),
    [clips, minVisibleFrame, maxVisibleFrame],
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

  return (
    <div className="synced-audio-lanes" data-testid="synced-audio-lanes">
      <div
        className="synced-audio-lane music-lane"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
      >
        <div className="synced-lane-tag">♪ MUSIC</div>
        {visibleMusic.map((cue) => {
          const left = cue.startFrame * pxPerFrame;
          const width = Math.max(24, (cue.endFrame - cue.startFrame) * pxPerFrame);
          return (
            <div
              key={`music-${cue.sceneId}`}
              className={`music-segment ${selectedFrameId === cue.id ? "is-selected" : ""}`}
              style={{ left, width }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-frame24-cue", `music|${cue.id}`);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onSelect(cue.id, cue.startFrame)}
              title={cue.title}
            >
              <span>{cue.label}</span>
              {cue.fadeIn && <i className="fade-in-wedge" />}
              {cue.fadeOut && <i className="fade-out-wedge" />}
            </div>
          );
        })}
      </div>

      <div
        className="synced-audio-lane ambience-lane"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
      >
        <div className="synced-lane-tag">≈ AMB</div>
        {visibleAmbience.map((cue) => {
          const left = cue.startFrame * pxPerFrame;
          const width = Math.max(24, (cue.endFrame - cue.startFrame) * pxPerFrame);
          return (
            <div
              key={`amb-${cue.sceneId}`}
              className={`ambience-segment ${selectedFrameId === cue.id ? "is-selected" : ""}`}
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

      <div
        className="synced-audio-lane effects-lane"
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropCue}
      >
        <div className="synced-lane-tag">🎙 VOX / SFX</div>
        {visibleBeatAudio.map((clip) => {
          const kf = clip.keyframe;
          const left = clip.startFrame * pxPerFrame;
          const voiceSpanFrames = clip.voiceFrames > 0 ? clip.voiceFrames : clip.durationFrames;
          return (
            <div key={`beat-audio-${kf.sceneId}-${kf.id}-${clip.index}`} className="beat-audio-group">
              {kf.beat.audioUrl && (
                <button
                  type="button"
                  className={`vox-cue ${selectedFrameId === kf.id ? "is-selected" : ""}`}
                  data-testid={`vox-cue-${kf.id}`}
                  data-scene-mark={kf.mark}
                  style={{
                    left,
                    width: Math.max(36, Math.min(clip.durationFrames, voiceSpanFrames) * pxPerFrame),
                  }}
                  onClick={() => onSelect(kf.id, clip.startFrame)}
                  title={`Voice (${kf.mark}/${kf.number}): ${kf.beat.audioUrl}`}
                >
                  <span>🎙 {basename(String(kf.beat.audioUrl))}</span>
                </button>
              )}
              {kf.beat.sfxUrl && (
                <button
                  type="button"
                  className={`sfx-cue ${selectedFrameId === kf.id ? "is-selected" : ""}`}
                  data-testid={`sfx-cue-${kf.id}`}
                  style={{ left: left + (kf.beat.audioUrl ? 4 : 0) }}
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
              )}
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
