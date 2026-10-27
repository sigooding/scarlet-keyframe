import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Keyframe } from "../core/model";
import { firstLine, sceneLabel } from "../core/model";
import { MIN_CLIP_FRAMES, timecode } from "../core/timing";
import { ANIMATION_PROPERTIES, animationOf, sortedKeys, type AnimationProperty } from "../sequence/animate";
import { buildSequence, clipById, visibleClips, type SequenceClip } from "../sequence/sequence";

interface TimelineProps {
  frames: Keyframe[];
  selectedFrameId: string;
  playhead: number;
  resolveMedia: (value: string | undefined) => string | undefined;
  onSeek: (absoluteFrame: number) => void;
  onSelectClip: (frameId: string, absoluteFrame: number) => void;
  onTrimStart: () => void;
  onTrim: (frameId: string, durationFrames: number) => void;
  onTrimEnd: (label: string) => void;
  onMoveKeyframe: (frameId: string, property: AnimationProperty, from: number, to: number) => void;
  onSelectKeyframe: (frameId: string, localFrame: number) => void;
  onDropFile: (file: File, frameId: string) => void;
}

type DragState =
  | { kind: "scrub"; pointerId: number }
  | { kind: "trim"; pointerId: number; frameId: string; startX: number; startDuration: number; duration: number }
  | { kind: "key"; pointerId: number; frameId: string; property: AnimationProperty; from: number; target: number; startX: number; moved: boolean };

const ZOOM_LEVELS = [0.08, 0.12, 0.18, 0.28, 0.4, 0.6, 0.85, 1.2, 1.7, 2.4, 3.4, 5, 7];
const RULER_HEIGHT = 26;
const TRACK_HEIGHT = 86;
const KEY_TOP: Record<AnimationProperty, number> = { zoom: 30, x: 44, y: 58 };
const KEY_COLOURS: Record<AnimationProperty, string> = { zoom: "#e8a24a", x: "#6fd3c6", y: "#c58be0" };

export function Timeline(props: TimelineProps) {
  const { frames, selectedFrameId, playhead } = props;
  const [search, setSearch] = useState("");
  const [sceneFilter, setSceneFilter] = useState("all");
  const [pxPerFrame, setPxPerFrame] = useState(1.2);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingAnchorRef = useRef<{ frame: number; clientX: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const sequence = useMemo(() => buildSequence(frames), [frames]);
  const selectedClip = useMemo(() => clipById(sequence.clips, selectedFrameId), [sequence, selectedFrameId]);
  const totalWidth = Math.max(viewportWidth, sequence.totalFrames * pxPerFrame);

  const scenes = useMemo(() => {
    const seen = new Map<string, Keyframe>();
    frames.forEach((frame) => { if (!seen.has(frame.sceneId)) seen.set(frame.sceneId, frame); });
    return [...seen.values()];
  }, [frames]);

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query && sceneFilter === "all") return [];
    return frames.filter((frame) => {
      if (sceneFilter !== "all" && frame.sceneId !== sceneFilter) return false;
      if (!query) return true;
      return `${frame.mark} ${frame.speaker} ${frame.text} ${frame.picture || ""}`.toLowerCase().includes(query);
    }).slice(0, 40);
  }, [frames, search, sceneFilter]);

  const fromFrame = scrollLeft / pxPerFrame;
  const toFrame = (scrollLeft + viewportWidth) / pxPerFrame;
  const onScreen = visibleClips(sequence.clips, fromFrame, toFrame);
  const drawn = useMemo(
    () => sequence.clips.slice(onScreen.first, onScreen.last + 1),
    [sequence.clips, onScreen.first, onScreen.last],
  );

  const tickStep = useMemo(() => {
    const candidates = [1, 2, 4, 6, 12, 24, 48, 24 * 5, 24 * 10, 24 * 30, 24 * 60, 24 * 120, 24 * 300];
    return candidates.find((step) => step * pxPerFrame >= 64) ?? candidates[candidates.length - 1];
  }, [pxPerFrame]);

  const ticks = useMemo(() => {
    const start = Math.max(0, Math.floor(fromFrame / tickStep) * tickStep);
    const output: number[] = [];
    for (let frame = start; frame <= Math.min(sequence.totalFrames, toFrame + tickStep); frame += tickStep) output.push(frame);
    return output;
  }, [fromFrame, toFrame, tickStep, sequence.totalFrames]);

  const selectedKeys = useMemo(() => {
    if (!selectedClip) return [];
    const animation = animationOf(selectedClip.frame);
    if (!animation) return [];
    return ANIMATION_PROPERTIES.flatMap((property) =>
      sortedKeys(animation[property]).map((key) => ({ property, frame: key.frame })),
    );
  }, [selectedClip]);

  useEffect(() => { dragRef.current = drag; }, [drag]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    setViewportWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setViewportWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keep the playhead on screen while it moves (scrubbing, playback, "Go to").
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const x = playhead * pxPerFrame;
    const margin = 60;
    if (x < node.scrollLeft + margin) node.scrollLeft = Math.max(0, x - margin);
    else if (x > node.scrollLeft + node.clientWidth - margin) node.scrollLeft = x - node.clientWidth + margin;
  }, [playhead, pxPerFrame]);

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    const node = scrollRef.current;
    if (!anchor || !node) return;
    pendingAnchorRef.current = null;
    const rect = node.getBoundingClientRect();
    node.scrollLeft = Math.max(0, anchor.frame * pxPerFrame - (anchor.clientX - rect.left));
  }, [pxPerFrame]);

  const zoom = useCallback((factor: number, clientX?: number) => {
    setPxPerFrame((current) => {
      const index = ZOOM_LEVELS.findIndex((level) => level >= current - 0.0001);
      let nextIndex = index < 0 ? ZOOM_LEVELS.length - 1 : index;
      if (factor > 1) nextIndex = Math.min(ZOOM_LEVELS.length - 1, nextIndex + 1);
      else nextIndex = Math.max(0, nextIndex - 1);
      const next = ZOOM_LEVELS[nextIndex];
      const node = scrollRef.current;
      if (node && clientX !== undefined) {
        const rect = node.getBoundingClientRect();
        pendingAnchorRef.current = { frame: (node.scrollLeft + clientX - rect.left) / current, clientX };
      } else if (node) {
        // Without a pointer, keep the playhead in view.
        pendingAnchorRef.current = { frame: playhead, clientX: node.getBoundingClientRect().left + 80 };
      }
      return next;
    });
  }, [playhead]);

  // Ctrl/Cmd + wheel zooms around the pointer.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 2 : 0.5, event.clientX);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const frameAt = useCallback((clientX: number): number => {
    const node = contentRef.current;
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    const frame = Math.round((clientX - rect.left) / pxPerFrame);
    return Math.max(0, Math.min(Math.max(0, sequence.totalFrames - 1), frame));
  }, [pxPerFrame, sequence.totalFrames]);

  const startScrub = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: "scrub", pointerId: event.pointerId });
    props.onSeek(frameAt(event.clientX));
  };

  const moveScrub = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "scrub" || state.pointerId !== event.pointerId) return;
    props.onSeek(frameAt(event.clientX));
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.kind === "trim") {
      const delta = state.duration - state.startDuration;
      props.onTrimEnd(delta === 0 ? "Clip trimmed" : `Clip ${delta > 0 ? "lengthened" : "shortened"} ${Math.abs(delta)} frames`);
    }
    if (state.kind === "key") {
      if (state.moved) props.onMoveKeyframe(state.frameId, state.property, state.from, state.target);
      else props.onSelectKeyframe(state.frameId, state.from);
    }
    setDrag(null);
  };

  const startTrim = (event: React.PointerEvent<HTMLElement>, clip: SequenceClip) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    props.onSelectClip(clip.frame.id, Math.max(clip.start, Math.min(clip.end - 1, playhead)));
    props.onTrimStart();
    setDrag({ kind: "trim", pointerId: event.pointerId, frameId: clip.frame.id, startX: event.clientX, startDuration: clip.duration, duration: clip.duration });
  };

  const moveTrim = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "trim" || state.pointerId !== event.pointerId) return;
    const delta = Math.round((event.clientX - state.startX) / pxPerFrame);
    const nextDuration = Math.max(MIN_CLIP_FRAMES, state.startDuration + delta);
    if (nextDuration === state.duration) return;
    state.duration = nextDuration;
    props.onTrim(state.frameId, nextDuration);
  };

  const startKey = (event: React.PointerEvent<HTMLElement>, property: AnimationProperty, frame: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ kind: "key", pointerId: event.pointerId, frameId: selectedFrameId, property, from: frame, target: frame, startX: event.clientX, moved: false });
  };

  const moveKey = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "key" || state.pointerId !== event.pointerId) return;
    const delta = Math.round((event.clientX - state.startX) / pxPerFrame);
    const target = Math.max(0, state.from + delta);
    state.moved = target !== state.from;
    state.target = target;
    setDrag({ ...state });
  };

  const goTo = (frame: Keyframe) => {
    const clip = clipById(sequence.clips, frame.id);
    if (!clip) return;
    props.onSelectClip(frame.id, clip.start);
    setResultsOpen(false);
    const node = scrollRef.current;
    if (node) node.scrollLeft = Math.max(0, clip.start * pxPerFrame - node.clientWidth / 3);
  };

  const playheadX = playhead * pxPerFrame;

  return (
    <aside className="sequence-panel">
      <header className="sequence-head">
        <div className="sequence-title-row">
          <div><span className="eyebrow">TIMELINE · 24 FPS</span><h2>Picture track</h2></div>
          <div className="timeline-readout">
            <strong data-testid="timeline-timecode">{timecode(playhead)}</strong>
            <small>/ {timecode(sequence.totalFrames)} · {sequence.clips.length.toLocaleString()} clips</small>
          </div>
        </div>
        <div className="sequence-tools">
          <div className="goto-wrap">
            <label className="timeline-search">
              <span>⌕</span>
              <input
                value={search}
                data-testid="timeline-search"
                onChange={(event) => { setSearch(event.target.value); setResultsOpen(true); }}
                onFocus={() => setResultsOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && matches[0]) { event.preventDefault(); goTo(matches[0]); }
                  if (event.key === "Escape") setResultsOpen(false);
                }}
                placeholder="Go to a line, speaker or scene"
              />
              <kbd>↵</kbd>
            </label>
            {resultsOpen && (search.trim() || sceneFilter !== "all") && (
              <div className="goto-results">
                <div className="goto-results-head">{matches.length ? `${matches.length} match${matches.length === 1 ? "" : "es"} · pick one to move the playhead` : "No matching clip"}</div>
                {matches.slice(0, 12).map((frame) => {
                  const clip = clipById(sequence.clips, frame.id);
                  return (
                    <button key={frame.id} data-testid="goto-result" onClick={() => goTo(frame)}>
                      <b>{frame.mark}</b>
                      <span>{firstLine(frame.text, 46) || frame.speaker}</span>
                      <i>{clip ? timecode(clip.start) : ""}</i>
                    </button>
                  );
                })}
                <button className="goto-close" onClick={() => setResultsOpen(false)}>Close</button>
              </div>
            )}
          </div>
          <select
            value={sceneFilter}
            aria-label="Filter by scene"
            onChange={(event) => { setSceneFilter(event.target.value); setResultsOpen(true); }}
          >
            <option value="all">All scenes</option>
            {scenes.map((frame) => <option value={frame.sceneId} key={frame.sceneId}>{sceneLabel(frame.scene)}</option>)}
          </select>
          <div className="zoom-controls">
            <button onClick={() => zoom(0.5)} title="Zoom out (Ctrl/Cmd + scroll)" aria-label="Zoom out">−</button>
            <span>{pxPerFrame >= 1 ? `${pxPerFrame.toFixed(1)}×` : `${Math.round(1 / pxPerFrame)}f/px`}</span>
            <button onClick={() => zoom(2)} title="Zoom in (Ctrl/Cmd + scroll)" aria-label="Zoom in">+</button>
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className={`timeline-body ${drag?.kind === "scrub" ? "is-scrubbing" : ""}`}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div ref={contentRef} className="timeline-content" style={{ width: totalWidth, height: RULER_HEIGHT + TRACK_HEIGHT + 26 }}>
          <div
            className="timeline-ruler"
            style={{ height: RULER_HEIGHT }}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {ticks.map((frame) => (
              <span key={frame} className="ruler-tick" style={{ left: frame * pxPerFrame }}>
                <i />
                <b>{timecode(frame)}</b>
              </span>
            ))}
          </div>

          <div className="timeline-track-label">PICTURE</div>
          <div
            className="timeline-track"
            style={{ height: TRACK_HEIGHT }}
            onPointerDown={(event) => {
              // Clicking the empty part of the track moves the playhead too.
              if (event.target === event.currentTarget) props.onSeek(frameAt(event.clientX));
            }}
          >
            {drawn.map((clip) => {
              const width = clip.duration * pxPerFrame;
              const left = clip.start * pxPerFrame;
              const isSelected = clip.frame.id === selectedFrameId;
              const short = clip.voice > clip.duration;
              const source = props.resolveMedia(clip.frame.picture);
              const voicePercent = Math.min(100, Math.max(2, (clip.voice / Math.max(1, clip.duration)) * 100));
              return (
                <div
                  key={clip.frame.id}
                  className={`tl-clip ${isSelected ? "is-selected" : ""} ${short ? "is-short" : ""} ${clip.frame.carried ? "is-carried" : ""}`}
                  style={{ left, width: Math.max(3, width - 1) }}
                  data-frame-id={clip.frame.id}
                  data-start={clip.start}
                  data-duration={clip.duration}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    props.onSelectClip(clip.frame.id, frameAt(event.clientX));
                  }}
                  title={`SC ${clip.frame.mark} · ${clip.duration} frames · ${timecode(clip.start)}\n${clip.frame.speaker}: ${clip.frame.text || "no caption"}`}
                >
                  <span className="tl-clip-thumb">
                    {source ? <img src={source} alt="" loading="lazy" decoding="async" draggable={false} /> : <em />}
                  </span>
                  <span className="tl-clip-mark">SC {clip.frame.mark}</span>
                  {width > 88 && <span className="tl-clip-text">{firstLine(clip.frame.text, Math.max(8, Math.floor(width / 6)))}</span>}
                  <span className="tl-clip-voice" style={{ width: `${voicePercent}%` }} />
                  <span
                    className="tl-clip-handle"
                    data-testid="trim-handle"
                    onPointerDown={(event) => startTrim(event, clip)}
                  onDragOver={(event) => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); }}
                  onDrop={(event) => {
                    const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"));
                    if (!file) return;
                    event.preventDefault();
                    event.stopPropagation();
                    props.onDropFile(file, clip.frame.id);
                  }}
                    onPointerMove={moveTrim}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    title="Drag to trim · shortest clip is 6 frames"
                  />
                </div>
              );
            })}

            {selectedClip && selectedKeys.map((key) => {
              const dragging = drag?.kind === "key" && drag.property === key.property && drag.from === key.frame;
              const frame = dragging ? drag.target : key.frame;
              const left = (selectedClip.start + frame) * pxPerFrame;
              return (
                <button
                  key={`${key.property}-${key.frame}`}
                  className={`tl-key ${dragging ? "is-dragging" : ""}`}
                  data-property={key.property}
                  data-frame={key.frame}
                  style={{ left, top: KEY_TOP[key.property], borderColor: KEY_COLOURS[key.property], background: KEY_COLOURS[key.property] }}
                  title={`${key.property} keyframe at frame ${frame} · drag to move`}
                  onPointerDown={(event) => startKey(event, key.property, key.frame)}
                  onPointerMove={moveKey}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              );
            })}
          </div>

          <div className="timeline-playhead" style={{ left: playheadX }} data-testid="playhead">
            <span
              className="timeline-playhead-grip"
              onPointerDown={startScrub}
              onPointerMove={moveScrub}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title="Drag the playhead to scrub"
            />
          </div>
        </div>
      </div>

      <footer className="sequence-footer">
        <span>{selectedClip ? `SC ${selectedClip.frame.mark} · clip ${timecode(selectedClip.start)}–${timecode(selectedClip.end)} · ${selectedClip.duration}f` : "No clip selected"}</span>
        <span className="sequence-hints"><kbd>S</kbd> split · <kbd>⌫</kbd> delete · <kbd>←</kbd><kbd>→</kbd> frame</span>
      </footer>
    </aside>
  );
}
