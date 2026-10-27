import { useMemo } from "react";
import type { Keyframe } from "../core/model";

interface TracksProps {
  frames: Keyframe[];
  selectedFrameId: string;
  onSelect: (id: string) => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
}

export function Tracks({ frames, selectedFrameId, onSelect, onMoveCue }: TracksProps) {
  const positionById = useMemo(() => new Map(frames.map((frame, index) => [frame.id, index / Math.max(1, frames.length - 1)])), [frames]);
  const sceneStarts = useMemo(() => {
    const starts = new Map<string, Keyframe>();
    frames.forEach((frame) => { if (!starts.has(frame.sceneId)) starts.set(frame.sceneId, frame); });
    return starts;
  }, [frames]);
  const musicCues = useMemo(() => [...sceneStarts.values()].filter((frame) => {
    const scene = frame.scene;
    return scene.musicMode === "track" || Boolean(scene.musicUrl || scene.sceneAudioUrl);
  }), [sceneStarts]);
  const ambienceCues = useMemo(() => [...sceneStarts.values()].filter((frame) => Boolean(frame.scene.ambientAudio && frame.scene.ambientAudio !== "none")), [sceneStarts]);
  const sfxCues = useMemo(() => frames.filter((frame) => Boolean(frame.beat.sfxUrl)), [frames]);
  const totalWidth = Math.max(320, frames.length * 1.6);

  function dropCue(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const payload = event.dataTransfer.getData("application/x-frame24-cue");
    if (!payload) return;
    const [kind, sourceId] = payload.split("|");
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetIndex = Math.min(frames.length - 1, Math.round(ratio * (frames.length - 1)));
    const target = frames[targetIndex];
    if (target && sourceId && (kind === "music" || kind === "ambience" || kind === "sfx")) onMoveCue(kind, sourceId, target.id);
  }

  return (
    <section className="tracks-panel">
      <header className="tracks-head"><span>TRACKS</span><small>DRAG CUES TO MOVE</small><span className="track-duration">{frames.length.toLocaleString()} beats</span></header>
      <div className="track-scroll" style={{ overflowX: frames.length > 220 ? "auto" : "hidden" }}>
        <div className="track-ruler" style={{ minWidth: totalWidth }}>
          <div className="ruler-label">RUN</div>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction} style={{ left: `${fraction * 100}%` }}>{Math.round(fraction * frames.length).toLocaleString()}</span>)}
        </div>
        <div className="track-lane music-lane" style={{ minWidth: totalWidth }} onDragOver={(event) => event.preventDefault()} onDrop={dropCue}>
          <div className="lane-label"><i>♪</i><span>MUSIC</span></div>
          <div className="lane-content">
            {musicCues.map((frame, index) => {
              const start = positionById.get(frame.id) || 0;
              const nextStart = index + 1 < musicCues.length ? positionById.get(musicCues[index + 1].id) || 1 : 1;
              const url = frame.scene.musicUrl || frame.scene.sceneAudioUrl || "Untitled cue";
              return (
                <div
                  className={`music-segment ${selectedFrameId === frame.id ? "is-selected" : ""}`}
                  key={`music-${frame.sceneId}`}
                  style={{ left: `${start * 100}%`, width: `${Math.max(3, (nextStart - start) * 100)}%` }}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.setData("application/x-frame24-cue", `music|${frame.id}`); event.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => onSelect(frame.id)}
                  title={`${url} · fade in ${frame.scene.musicFadeSeconds ?? 1.4}s · level ${frame.scene.musicLevel ?? 1}`}
                >
                  <span>{basename(url)}</span>
                  {Number(frame.scene.musicFadeSeconds) > 0 && <i className="fade-in-wedge" />}
                  {Number(frame.scene.musicFadeOutSeconds ?? frame.scene.musicFadeSeconds) > 0 && <i className="fade-out-wedge" />}
                </div>
              );
            })}
            {musicCues.length === 0 && <span className="lane-empty">No explicit music cue. Inherited tracks remain active.</span>}
          </div>
        </div>
        <div className="track-lane ambience-lane" style={{ minWidth: totalWidth }} onDragOver={(event) => event.preventDefault()} onDrop={dropCue}>
          <div className="lane-label"><i>≈</i><span>AMBIENCE</span></div>
          <div className="lane-content">
            {ambienceCues.map((frame, index) => {
              const start = positionById.get(frame.id) || 0;
              const nextStart = index + 1 < ambienceCues.length ? positionById.get(ambienceCues[index + 1].id) || 1 : 1;
              return <div className="ambience-segment" key={`amb-${frame.sceneId}`} style={{ left: `${start * 100}%`, width: `${Math.max(3, (nextStart - start) * 100)}%` }} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-frame24-cue", `ambience|${frame.id}`); event.dataTransfer.effectAllowed = "move"; }} onClick={() => onSelect(frame.id)} title={String(frame.scene.ambientAudio)}><span>{String(frame.scene.ambientAudio).replace(/file:/g, "").replace(/\/film\/sfx\//g, "")}</span></div>;
            })}
            {ambienceCues.length === 0 && <span className="lane-empty">No ambience layer</span>}
          </div>
        </div>
        <div className="track-lane effects-lane" style={{ minWidth: totalWidth }} onDragOver={(event) => event.preventDefault()} onDrop={dropCue}>
          <div className="lane-label"><i>✳</i><span>EFFECTS</span></div>
          <div className="lane-content">
            {sfxCues.map((frame) => {
              const left = (positionById.get(frame.id) || 0) * 100;
              return <button className={`sfx-cue ${selectedFrameId === frame.id ? "is-selected" : ""}`} key={`sfx-${frame.id}`} style={{ left: `${left}%` }} draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-frame24-cue", `sfx|${frame.id}`); event.dataTransfer.effectAllowed = "move"; }} onClick={() => onSelect(frame.id)} title={`${frame.mark} / beat ${frame.number}: ${frame.beat.sfxUrl}`}><i />{basename(String(frame.beat.sfxUrl))}</button>;
            })}
            {sfxCues.length === 0 && <span className="lane-empty">No sound effect markers</span>}
          </div>
        </div>
        <div className="track-playhead" style={{ left: `${(positionById.get(selectedFrameId) || 0) * 100}%` }} />
      </div>
    </section>
  );
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || value;
}
