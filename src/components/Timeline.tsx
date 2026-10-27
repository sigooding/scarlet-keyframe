import { useMemo, useRef, useState } from "react";
import type { Keyframe } from "../core/model";
import { firstLine, sceneLabel } from "../core/model";

interface TimelineProps {
  frames: Keyframe[];
  selectedFrameId: string;
  selectedFrameIds: string[];
  resolveMedia: (value: string | undefined) => string | undefined;
  onSelect: (frameId: string, extend: boolean) => void;
  onAddAfter: (frameId: string) => void;
  onDropFile: (file: File, frameId: string) => void;
  onReorderDrop: (sourceId: string, targetId: string) => void;
  onFoldScene: (sceneId: string) => void;
}

type TimelineRow = { type: "scene"; sceneId: string; frame: Keyframe } | { type: "frame"; frame: Keyframe };
const ROW_HEIGHT = 70;

export function Timeline(props: TimelineProps) {
  const [search, setSearch] = useState("");
  const [sceneFilter, setSceneFilter] = useState("all");
  const [noPicture, setNoPicture] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => {
    const sceneMap = new Map<string, Keyframe>();
    props.frames.forEach((frame) => { if (!sceneMap.has(frame.sceneId)) sceneMap.set(frame.sceneId, frame); });
    return [...sceneMap.values()];
  }, [props.frames]);
  const matchingFrames = useMemo(() => props.frames.filter((frame) => {
    const query = search.trim().toLowerCase();
    return (sceneFilter === "all" || frame.sceneId === sceneFilter)
      && (!query || `${frame.mark} ${frame.speaker} ${frame.text} ${frame.picture || ""}`.toLowerCase().includes(query))
      && (!noPicture || !frame.beat.background);
  }), [props.frames, search, sceneFilter, noPicture]);
  const rows = useMemo(() => {
    const output: TimelineRow[] = [];
    let currentScene = "";
    for (const frame of matchingFrames) {
      if (frame.sceneId !== currentScene) {
        currentScene = frame.sceneId;
        output.push({ type: "scene", sceneId: currentScene, frame });
      }
      if (!collapsed.has(frame.sceneId)) output.push({ type: "frame", frame });
    }
    return output;
  }, [matchingFrames, collapsed]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 4);
  const visible = rows.slice(start, end);

  return (
    <aside className="sequence-panel">
      <header className="sequence-head">
        <div className="sequence-title-row"><div><span className="eyebrow">RUNNING ORDER</span><h2>Keyframes</h2></div><span className="sequence-total">{props.frames.length.toLocaleString()} <small>FRAMES</small></span></div>
        <label className="timeline-search"><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; setScrollTop(0); }} placeholder="Find a line or speaker" /><kbd>/</kbd></label>
        <div className="sequence-filters">
          <select value={sceneFilter} onChange={(event) => { setSceneFilter(event.target.value); if (scrollRef.current) scrollRef.current.scrollTop = 0; setScrollTop(0); }} aria-label="Filter by scene">
            <option value="all">All scenes</option>
            {scenes.map(({ scene, sceneId }) => <option value={sceneId} key={sceneId}>{sceneLabel(scene)}</option>)}
          </select>
          <label className="checkbox-label"><input type="checkbox" checked={noPicture} onChange={(event) => setNoPicture(event.target.checked)} /><span>No own picture</span></label>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="timeline-virtual-list"
        onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); setViewportHeight(event.currentTarget.clientHeight); }}
      >
        {rows.length ? (
          <div className="timeline-virtual-space" style={{ height: rows.length * ROW_HEIGHT }}>
            <div className="timeline-virtual-window" style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {visible.map((row, offset) => {
                const rowIndex = start + offset;
                if (row.type === "scene") {
                  return <SceneMarker key={`scene-${row.sceneId}`} frame={row.frame} collapsed={collapsed.has(row.sceneId)} count={matchingFrames.filter((frame) => frame.sceneId === row.sceneId).length} onFold={() => { const next = new Set(collapsed); next.has(row.sceneId) ? next.delete(row.sceneId) : next.add(row.sceneId); setCollapsed(next); props.onFoldScene(row.sceneId); }} />;
                }
                const frame = row.frame;
                const isSelected = props.selectedFrameId === frame.id;
                const isMulti = props.selectedFrameIds.includes(frame.id);
                return (
                  <div
                    key={frame.id}
                    className={`timeline-frame-row ${isSelected ? "is-selected" : ""} ${isMulti ? "is-multi" : ""}`}
                    style={{ height: ROW_HEIGHT }}
                    draggable
                    data-frame-id={frame.id}
                    onDragStart={(event) => { event.dataTransfer.setData("application/x-frame24-keyframe", frame.id); event.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"));
                      if (file) props.onDropFile(file, frame.id);
                      else {
                        const sourceId = event.dataTransfer.getData("application/x-frame24-keyframe");
                        if (sourceId && sourceId !== frame.id) props.onReorderDrop(sourceId, frame.id);
                      }
                    }}
                    onClick={(event) => props.onSelect(frame.id, event.shiftKey)}
                  >
                    <span className="timeline-frame-index">{String(frame.number).padStart(2, "0")}</span>
                    <span className="timeline-frame-thumb">
                      {props.resolveMedia(frame.picture) ? <img src={props.resolveMedia(frame.picture)} alt="" loading="lazy" decoding="async" /> : <i>NO STILL</i>}
                      {frame.carried && <b>↳</b>}
                    </span>
                    <span className="timeline-frame-copy"><strong>{frame.speaker}</strong><small>{firstLine(frame.text, 56) || "No caption"}</small></span>
                    <span className="timeline-frame-drag" aria-hidden>⠿</span>
                    <button className="timeline-add-between" title="Add keyframe after" onClick={(event) => { event.stopPropagation(); props.onAddAfter(frame.id); }}>+</button>
                    {rowIndex === 0 && <span className="timeline-virtual-index" aria-hidden />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div className="timeline-empty">No keyframes match this search.</div>}
      </div>
      <footer className="sequence-footer"><span>{matchingFrames.length.toLocaleString()} visible</span><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span></footer>
    </aside>
  );
}

function SceneMarker({ frame, collapsed, count, onFold }: { frame: Keyframe; collapsed: boolean; count: number; onFold: () => void }) {
  return (
    <button className="timeline-scene-marker" style={{ height: ROW_HEIGHT }} onClick={onFold}>
      <span className={`scene-fold ${collapsed ? "is-collapsed" : ""}`}>⌄</span>
      <span className="scene-mark-label">SC {frame.mark}</span>
      <span className="scene-marker-line" />
      <span className="scene-frame-count">{count} {count === 1 ? "FRAME" : "FRAMES"}</span>
    </button>
  );
}
