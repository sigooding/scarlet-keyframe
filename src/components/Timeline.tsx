import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Keyframe, NoteMarker } from "../core/model";
import { firstLine, sceneLabel } from "../core/model";
import { MIN_CLIP_FRAMES, timecode } from "../core/timing";
import { ANIMATION_PROPERTIES, animationOf, sortedKeys, type AnimationProperty } from "../sequence/animate";
import { buildSequence, clipAtFrame, clipById, markerPosition, visibleClips, type SequenceClip } from "../sequence/sequence";
import { snapFrame, snapTargets, snapThresholdFrames, type SnapTarget } from "../sequence/snap";
import {
  TRANSITION_KINDS,
  TRANSITION_LABELS,
  transitionAtCut,
  type TransitionKind,
} from "../sequence/transitions";

export type SelectMode = "replace" | "toggle";
export type DropPosition = "before" | "after";

interface TimelineProps {
  frames: Keyframe[];
  selectedIds: string[];
  playhead: number;
  snapEnabled: boolean;
  markers: NoteMarker[];
  resolveMedia: (value: string | undefined) => string | undefined;
  onSeek: (absoluteFrame: number) => void;
  onSelect: (frameId: string, absoluteFrame: number, mode: SelectMode) => void;
  onSelectMany: (frameIds: string[]) => void;
  onGestureStart: () => void;
  onGestureEnd: (label: string) => void;
  onTrim: (frameId: string, durationFrames: number) => void;
  onRoll: (leftFrameId: string, deltaFrames: number) => void;
  onMoveClips: (ids: string[], targetId: string, position: DropPosition, copy: boolean) => void;
  onTransitionFrames: (frameId: string, frames: number) => void;
  onTransitionKind: (frameId: string, kind: TransitionKind) => void;
  onToggleSnap: () => void;
  onAddMarker: () => void;
  onRemoveMarker: (markerId: string) => void;
  onMoveKeyframe: (frameId: string, property: AnimationProperty, from: number, to: number) => void;
  onSelectKeyframe: (frameId: string, localFrame: number) => void;
  onDropFile: (file: File, frameId: string) => void;
}

type DragState =
  | { kind: "scrub"; pointerId: number }
  | { kind: "trim"; pointerId: number; frameId: string; startX: number; startDuration: number; duration: number }
  | { kind: "key"; pointerId: number; frameId: string; property: AnimationProperty; from: number; target: number; startX: number; moved: boolean }
  | { kind: "roll"; pointerId: number; leftId: string; startX: number; delta: number }
  | { kind: "move"; pointerId: number; ids: string[]; frameId: string; startX: number; moved: boolean; overId?: string; position: DropPosition; copy: boolean }
  | { kind: "box"; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean }
  | { kind: "trans"; pointerId: number; frameId: string; startX: number; startFrames: number; frames: number };

const ZOOM_LEVELS = [0.08, 0.12, 0.18, 0.28, 0.4, 0.6, 0.85, 1.2, 1.7, 2.4, 3.4, 5, 7];
const RULER_HEIGHT = 30;
const TRACK_HEIGHT = 96;
const CONTENT_HEIGHT = RULER_HEIGHT + TRACK_HEIGHT;
const KEY_TOP: Record<AnimationProperty, number> = { zoom: 34, x: 48, y: 62 };
const KEY_COLOURS: Record<AnimationProperty, string> = { zoom: "#e8a24a", x: "#6fd3c6", y: "#c58be0" };
const DRAG_THRESHOLD = 4;

export function Timeline(props: TimelineProps) {
  const { frames, selectedIds, playhead } = props;
  const [search, setSearch] = useState("");
  const [sceneFilter, setSceneFilter] = useState("all");
  const [pxPerFrame, setPxPerFrame] = useState(1.2);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ frameId: string; x: number; kind: TransitionKind } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingAnchorRef = useRef<{ frame: number; clientX: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const sequence = useMemo(() => buildSequence(frames), [frames]);
  const currentClip = useMemo(() => clipAtFrame(sequence.clips, playhead), [sequence, playhead]);
  const selectedClip = useMemo(() => clipById(sequence.clips, props.selectedIds[0]) ?? currentClip, [sequence, props.selectedIds, currentClip]);
  const totalWidth = Math.max(viewportWidth, sequence.totalFrames * pxPerFrame);
  const thresholdFrames = snapThresholdFrames(pxPerFrame);

  const scenes = useMemo(() => {
    const seen = new Map<string, Keyframe>();
    frames.forEach((frame) => { if (!seen.has(frame.sceneId)) seen.set(frame.sceneId, frame); });
    return [...seen.values()];
  }, [frames]);

  const noteMarkers = useMemo(
    () => props.markers.map((marker) => ({ marker, frame: markerPosition(marker, sequence.clips) })),
    [props.markers, sequence.clips],
  );

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
  const firstDrawn = Math.max(0, onScreen.first - 1);
  const drawn = useMemo(
    () => sequence.clips.slice(firstDrawn, Math.max(firstDrawn, onScreen.last) + 1),
    [sequence.clips, firstDrawn, onScreen.last],
  );

  // Scene markers: one per scene, at its first clip.
  const sceneMarkers = useMemo(() => {
    const all: { key: string; label: string; start: number; sceneId: string }[] = [];
    let sceneId = "";
    sequence.clips.forEach((clip) => {
      if (clip.frame.sceneId === sceneId) return;
      sceneId = clip.frame.sceneId;
      all.push({ key: `scene-${sceneId}`, label: clip.frame.mark, start: clip.start, sceneId });
    });
    // Only the marks that fit on screen; never skip the scene the playhead is in.
    const currentScene = currentClip?.frame.sceneId;
    const minGap = 26 / pxPerFrame;
    const shown: typeof all = [];
    let lastX = -Infinity;
    let lastLabel = -Infinity;
    for (const marker of all) {
      if (marker.start < fromFrame - minGap || marker.start > toFrame + minGap) continue;
      const fits = marker.start - lastLabel >= 46 / pxPerFrame;
      if (fits || marker.sceneId === currentScene) {
        shown.push(marker);
        lastLabel = marker.start;
      }
      lastX = marker.start;
    }
    void lastX;
    return shown;
  }, [currentClip?.frame.sceneId, fromFrame, pxPerFrame, sequence.clips, toFrame]);

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

  const transitions = useMemo(() => {
    const output: { index: number; transition: ReturnType<typeof transitionAtCut> }[] = [];
    for (const clip of drawn) {
      if (clip.index < 1) continue;
      const transition = transitionAtCut(sequence.clips, clip.index);
      if (transition) output.push({ index: clip.index, transition });
    }
    return output;
  }, [drawn, sequence.clips]);

  // Everything a dragged edge can snap to.
  const snapCandidates = useCallback((excludeIds: string[], includeKeyframes = false): SnapTarget[] => {
    const keyframes = includeKeyframes && selectedClip
      ? selectedKeys.map((key) => ({ frame: selectedClip.start + key.frame, property: key.property }))
      : [];
    return snapTargets({
      clips: sequence.clips.map((clip) => ({ id: clip.frame.id, start: clip.start, end: clip.end })),
      excludeIds,
      playhead,
      keyframes,
      markers: [
        ...noteMarkers.map((entry) => ({ frame: entry.frame, label: entry.marker.name })),
        ...sceneMarkers.map((entry) => ({ frame: entry.start, label: `SC ${entry.label}` })),
      ],
    });
  }, [noteMarkers, playhead, sceneMarkers, selectedClip, selectedKeys, sequence.clips]);

  const applySnap = useCallback((candidate: number, excludeIds: string[], includeKeyframes = false): number => {
    if (!props.snapEnabled) {
      setSnapLine(null);
      return Math.round(candidate);
    }
    const result = snapFrame(candidate, snapCandidates(excludeIds, includeKeyframes), thresholdFrames);
    setSnapLine(result.snapped ? result.frame : null);
    return Math.round(result.frame);
  }, [props.snapEnabled, snapCandidates, thresholdFrames]);

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

  /* ------------------------------------------------------------- scrubbing -- */

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
    // Claim the drag straight away: pointerup can arrive twice (captured element + track), and a move or a
    // trim must only ever be applied once.
    dragRef.current = null;
    setSnapLine(null);
    if (state.kind === "trim") {
      const delta = state.duration - state.startDuration;
      props.onGestureEnd(delta === 0 ? "Clip trimmed" : `Clip ${delta > 0 ? "lengthened" : "shortened"} ${Math.abs(delta)} frames`);
    }
    if (state.kind === "key") {
      if (state.moved) props.onMoveKeyframe(state.frameId, state.property, state.from, state.target);
      else props.onSelectKeyframe(state.frameId, state.from);
    }
    if (state.kind === "roll") {
      props.onGestureEnd(state.delta === 0 ? "Cut rolled" : `Cut rolled ${state.delta > 0 ? "later" : "earlier"} ${Math.abs(state.delta)} frames`);
    }
    if (state.kind === "move") {
      if (state.moved && state.overId) props.onMoveClips(state.ids, state.overId, state.position, state.copy);
    }
    if (state.kind === "trans") {
      props.onGestureEnd(`Transition ${state.frames} frames`);
    }
    if (state.kind === "box") {
      if (!state.moved) props.onSeek(frameAt(event.clientX));
      else {
        const left = Math.min(state.startX, state.x);
        const right = Math.max(state.startX, state.x);
        const from = frameAt(left);
        const to = frameAt(right);
        const ids = sequence.clips.filter((clip) => clip.end >= from && clip.start <= to).map((clip) => clip.frame.id);
        props.onSelectMany(ids);
      }
    }
    setDrag(null);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state) return;
    if (state.kind === "scrub") moveScrub(event);
    else if (state.kind === "trim") moveTrim(event);
    else if (state.kind === "key") moveKey(event);
    else if (state.kind === "roll") moveRoll(event);
    else if (state.kind === "move") moveClipDrag(event);
    else if (state.kind === "trans") moveTransition(event);
  };

  /* ------------------------------------------------------------------ trim -- */

  const startTrim = (event: React.PointerEvent<HTMLElement>, clip: SequenceClip) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    // Select the clip but leave the playhead alone: a snap target must not move out from under the drag.
    props.onSelect(clip.frame.id, playhead, event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace");
    props.onGestureStart();
    setDrag({ kind: "trim", pointerId: event.pointerId, frameId: clip.frame.id, startX: event.clientX, startDuration: clip.duration, duration: clip.duration });
  };

  const moveTrim = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "trim" || state.pointerId !== event.pointerId) return;
    const clip = clipById(sequence.clips, state.frameId);
    if (!clip) return;
    const raw = state.startDuration + (event.clientX - state.startX) / pxPerFrame;
    const snapped = applySnap(clip.start + raw, [clip.frame.id]) - clip.start;
    const nextDuration = Math.max(MIN_CLIP_FRAMES, Math.round(snapped));
    if (nextDuration === state.duration) return;
    state.duration = nextDuration;
    props.onTrim(state.frameId, nextDuration);
  };

  /* ------------------------------------------------------------------ roll -- */

  const startRoll = (event: React.PointerEvent<HTMLElement>, left: SequenceClip) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    props.onGestureStart();
    setDrag({ kind: "roll", pointerId: event.pointerId, leftId: left.frame.id, startX: event.clientX, delta: 0 });
  };

  const moveRoll = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "roll" || state.pointerId !== event.pointerId) return;
    const left = clipById(sequence.clips, state.leftId);
    if (!left) return;
    const right = sequence.clips[left.index + 1];
    const raw = Math.round((event.clientX - state.startX) / pxPerFrame);
    const snapped = applySnap(left.end + raw, [left.frame.id, right?.frame.id ?? ""]) - left.end;
    if (snapped === state.delta) return;
    state.delta = snapped;
    props.onRoll(state.leftId, snapped);
  };

  /* ------------------------------------------------------------------- key -- */

  const startKey = (event: React.PointerEvent<HTMLElement>, property: AnimationProperty, frame: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ kind: "key", pointerId: event.pointerId, frameId: selectedClip?.frame.id ?? "", property, from: frame, target: frame, startX: event.clientX, moved: false });
  };

  const moveKey = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "key" || state.pointerId !== event.pointerId) return;
    if (!selectedClip) return;
    const raw = state.from + Math.round((event.clientX - state.startX) / pxPerFrame);
    const target = Math.max(0, applySnap(selectedClip.start + raw, [selectedClip.frame.id], true) - selectedClip.start);
    state.moved = target !== state.from;
    state.target = target;
    setDrag({ ...state });
  };

  /* ------------------------------------------------------------------ move -- */

  const startClipDrag = (event: React.PointerEvent<HTMLElement>, clip: SequenceClip) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const ids = additive
      ? (selectedIds.includes(clip.frame.id) ? selectedIds : [...selectedIds, clip.frame.id])
      : (selectedIds.includes(clip.frame.id) && selectedIds.length > 1 ? selectedIds : [clip.frame.id]);
    props.onSelect(clip.frame.id, frameAt(event.clientX), additive ? "toggle" : "replace");
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ kind: "move", pointerId: event.pointerId, ids, frameId: clip.frame.id, startX: event.clientX, moved: false, position: "before", copy: false });
  };

  const moveClipDrag = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "move" || state.pointerId !== event.pointerId) return;
    if (!state.moved && Math.abs(event.clientX - state.startX) < DRAG_THRESHOLD) return;
    const frame = frameAt(event.clientX);
    const over = clipAtFrame(sequence.clips, frame);
    if (!over) return;
    if (state.ids.includes(over.frame.id)) {
      // Hovering its own clip: keep the last target, just mark the drag as live.
      state.moved = true;
      state.copy = event.altKey;
      setDrag({ ...state });
      return;
    }
    const position: DropPosition = frame < over.start + over.duration / 2 ? "before" : "after";
    state.moved = true;
    state.overId = over.frame.id;
    state.position = position;
    state.copy = event.altKey;
    setDrag({ ...state });
  };

  /* ------------------------------------------------------------ transitions -- */

  const startTransition = (event: React.PointerEvent<HTMLElement>, frameId: string, frames: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    props.onGestureStart();
    setDrag({ kind: "trans", pointerId: event.pointerId, frameId, startX: event.clientX, startFrames: frames, frames });
  };

  const moveTransition = (event: React.PointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state || state.kind !== "trans" || state.pointerId !== event.pointerId) return;
    // The box stays centred on the cut, so an edge moving by d changes the length by 2d.
    const delta = Math.round(((event.clientX - state.startX) / pxPerFrame) * 2);
    const frames = Math.max(2, state.startFrames + delta);
    if (frames === state.frames) return;
    state.frames = frames;
    props.onTransitionFrames(state.frameId, frames);
  };

  const goTo = (frame: Keyframe) => {
    const clip = clipById(sequence.clips, frame.id);
    if (!clip) return;
    props.onSelect(clip.frame.id, clip.start, "replace");
    setResultsOpen(false);
    const node = scrollRef.current;
    if (node) node.scrollLeft = Math.max(0, clip.start * pxPerFrame - node.clientWidth / 3);
  };


  function moveBox(event: React.PointerEvent<HTMLElement>) {
    const state = dragRef.current;
    if (!state || state.kind !== "box" || state.pointerId !== event.pointerId) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    state.x = x;
    state.y = y;
    if (Math.abs(x - state.startX) > DRAG_THRESHOLD || Math.abs(y - state.startY) > DRAG_THRESHOLD) state.moved = true;
    setDrag({ ...state });
  }

  const playheadX = playhead * pxPerFrame;
  const snapX = snapLine === null ? null : snapLine * pxPerFrame;
  const dropClip = drag?.kind === "move" && drag.overId ? clipById(sequence.clips, drag.overId) : undefined;
  const dropX = dropClip && drag?.kind === "move" ? (drag.position === "before" ? dropClip.start : dropClip.end) * pxPerFrame : null;
  const boxRect = drag?.kind === "box" && drag.moved
    ? { left: Math.min(drag.startX, drag.x), width: Math.abs(drag.x - drag.startX), top: Math.min(drag.startY, drag.y), height: Math.abs(drag.y - drag.startY) }
    : null;

  return (
    <aside className="sequence-panel">
      <header className="sequence-head">
        <div className="sequence-title-row">
          <div><span className="eyebrow">TIMELINE · 24 FPS</span><h2>Picture track</h2></div>
          <div className="timeline-readout">
            <strong data-testid="timeline-timecode">{timecode(playhead)}</strong>
            <small>/ {timecode(sequence.totalFrames)} · {sequence.clips.length.toLocaleString()} clips{selectedIds.length ? ` · ${selectedIds.length} selected` : ""}</small>
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
          <button
            className={`tl-tool ${props.snapEnabled ? "is-on" : ""}`}
            data-testid="snap-toggle"
            onClick={props.onToggleSnap}
            title="Snapping (N): clip edges, the playhead, keyframes and markers within 8 px"
          >⌁ SNAP {props.snapEnabled ? "ON" : "OFF"}</button>
          <button className="tl-tool" data-testid="add-marker" onClick={props.onAddMarker} title="Add a note marker at the playhead (M)">＋ MARK</button>
          <div className="zoom-controls">
            <button onClick={() => zoom(0.5)} title="Zoom out (Ctrl/Cmd + scroll)" aria-label="Zoom out">−</button>
            <span>{pxPerFrame >= 1 ? `${pxPerFrame.toFixed(1)}×` : `${Math.round(1 / pxPerFrame)}f/px`}</span>
            <button onClick={() => zoom(2)} title="Zoom in (Ctrl/Cmd + scroll)" aria-label="Zoom in">+</button>
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className={`timeline-body ${drag?.kind === "scrub" ? "is-scrubbing" : ""} ${drag?.kind === "move" && drag.moved ? "is-moving" : ""}`}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div ref={contentRef} className="timeline-content" style={{ width: totalWidth, height: CONTENT_HEIGHT }}>
          <div
            className="timeline-ruler"
            style={{ height: RULER_HEIGHT }}
            onPointerDown={startScrub}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {ticks.map((frame) => (
              <span key={frame} className="ruler-tick" style={{ left: frame * pxPerFrame }}>
                <i />
                <b>{timecode(frame)}</b>
              </span>
            ))}
            {sceneMarkers.map((marker) => (
              <button
                key={marker.key}
                className="tl-scene-marker"
                data-testid="scene-marker"
                data-mark={marker.label}
                style={{ left: marker.start * pxPerFrame }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => props.onSeek(marker.start)}
                title={`Scene ${marker.label} starts at ${timecode(marker.start)}`}
              >{marker.label}</button>
            ))}
            {noteMarkers.map(({ marker, frame }) => (
              <button
                key={marker.id}
                className="tl-note-marker"
                data-testid="note-marker"
                data-name={marker.name}
                style={{ left: frame * pxPerFrame }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => props.onSeek(frame)}
                onDoubleClick={() => props.onRemoveMarker(marker.id)}
                title={`${marker.name} · ${timecode(frame)} · double-click to remove`}
              ><i />{marker.name}</button>
            ))}
          </div>

          <div className="timeline-track-label">PICTURE</div>
          <div
            className="timeline-track"
            style={{ height: TRACK_HEIGHT }}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
              const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setDrag({
                kind: "box",
                pointerId: event.pointerId,
                startX: event.clientX - rect.left,
                startY: event.clientY - rect.top,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                moved: false,
              });
            }}
            onPointerMove={(event) => moveBox(event)}
            onPointerUp={(event) => {
              endDrag(event);
            }}
            onPointerCancel={endDrag}
          >
            {drawn.map((clip) => {
              const width = clip.duration * pxPerFrame;
              const left = clip.start * pxPerFrame;
              const isSelected = selectedIds.includes(clip.frame.id);
              const isCurrent = currentClip?.frame.id === clip.frame.id;
              const short = clip.voice > clip.duration;
              const source = props.resolveMedia(clip.frame.picture);
              const voicePercent = Math.min(100, Math.max(2, (clip.voice / Math.max(1, clip.duration)) * 100));
              const dragging = drag?.kind === "move" && drag.moved && drag.ids.includes(clip.frame.id);
              return (
                <div
                  key={clip.frame.id}
                  className={`tl-clip ${isSelected ? "is-selected" : ""} ${isCurrent ? "is-current" : ""} ${short ? "is-short" : ""} ${clip.frame.carried ? "is-carried" : ""} ${dragging ? "is-dragging" : ""}`}
                  style={{ left, width: Math.max(3, width - 1) }}
                  data-frame-id={clip.frame.id}
                  data-start={clip.start}
                  data-duration={clip.duration}
                  data-selected={isSelected ? "yes" : "no"}
                  onPointerDown={(event) => startClipDrag(event, clip)}
                  onPointerMove={(event) => moveClipDrag(event)}
                  onPointerUp={(event) => endDrag(event)}
                  onPointerCancel={endDrag}
                  title={`SC ${clip.frame.mark} · ${clip.duration} frames · ${timecode(clip.start)}\n${clip.frame.speaker}: ${clip.frame.text || "no caption"}\nDrag to move · Alt+drag to copy`}
                >
                  <span className="tl-clip-thumb">
                    {source ? <img src={source} alt="" loading="lazy" decoding="async" draggable={false} /> : <em />}
                  </span>
                  <span className="tl-clip-mark">SC {clip.frame.mark}</span>
                  {width > 88 && <span className="tl-clip-text">{firstLine(clip.frame.text, Math.max(8, Math.floor(width / 6)))}</span>}
                  <span className="tl-clip-voice" style={{ width: `${voicePercent}%` }} data-testid="clip-voice" />
                  <span
                    className="tl-clip-handle"
                    data-testid="trim-handle"
                    onPointerDown={(event) => startTrim(event, clip)}
                    onPointerMove={moveTrim}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDragOver={(event) => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); }}
                    onDrop={(event) => {
                      const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith("image/"));
                      if (!file) return;
                      event.preventDefault();
                      event.stopPropagation();
                      props.onDropFile(file, clip.frame.id);
                    }}
                    title="Drag to trim · shortest clip is 6 frames"
                  />
                </div>
              );
            })}

            {transitions.map(({ index, transition }) => transition && (
              <div
                key={`transition-${transition.incomingIndex}`}
                className="tl-transition"
                data-testid="transition-box"
                data-kind={transition.kind}
                data-frames={transition.frames}
                data-frame-id={sequence.clips[index].frame.id}
                style={{ left: transition.start * pxPerFrame, width: Math.max(18, transition.frames * pxPerFrame) }}
                title={`${TRANSITION_LABELS[transition.kind]} · ${transition.frames} frames · double-click to change`}
                onDoubleClick={() => setPicker({ frameId: sequence.clips[index].frame.id, x: transition.start * pxPerFrame, kind: transition.kind })}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>{transition.frames * pxPerFrame > 74 ? `${TRANSITION_LABELS[transition.kind]} · ${transition.frames}f` : `${transition.frames}f`}</span>
                <i
                  className="tl-transition-edge is-left"
                  data-testid="transition-left"
                  onPointerDown={(event) => startTransition(event, sequence.clips[index].frame.id, transition.frames)}
                  onPointerMove={moveTransition}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
                <i
                  className="tl-transition-edge is-right"
                  data-testid="transition-right"
                  onPointerDown={(event) => startTransition(event, sequence.clips[index].frame.id, transition.frames)}
                  onPointerMove={moveTransition}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              </div>
            ))}

            {drawn.map((clip) => {
              const left = clip.index >= 1 ? clip.start : undefined;
              if (left === undefined) return null;
              const leftClip = sequence.clips[clip.index - 1];
              return (
                <span
                  key={`roll-${clip.frame.id}`}
                  className="tl-cut"
                  data-testid="roll-handle"
                  data-left-id={leftClip.frame.id}
                  style={{ left: left * pxPerFrame }}
                  title={`Roll the cut · ${leftClip.duration}f | ${clip.duration}f`}
                  onPointerDown={(event) => startRoll(event, leftClip)}
                  onPointerMove={moveRoll}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                ><i /><i /></span>
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

            {boxRect && <div className="tl-marquee" style={{ left: boxRect.left, width: boxRect.width, top: boxRect.top, height: boxRect.height }} />}
            {dropX !== null && <div className="tl-drop-line" style={{ left: dropX }} />}

            {picker && (
              <div className="tl-kind-picker" style={{ left: picker.x }} onPointerDown={(event) => event.stopPropagation()}>
                <span>Transition</span>
                {TRANSITION_KINDS.map((kind) => (
                  <button
                    key={kind}
                    className={kind === picker.kind ? "is-active" : ""}
                    data-testid={`transition-kind-${kind}`}
                    onClick={() => { props.onTransitionKind(picker.frameId, kind); setPicker(null); }}
                  >{TRANSITION_LABELS[kind]}</button>
                ))}
                <button className="tl-kind-close" onClick={() => setPicker(null)}>×</button>
              </div>
            )}
          </div>

          {snapX !== null && <div className="tl-snap-line" style={{ left: snapX }} data-testid="snap-line" />}

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
        <span>{selectedIds.length > 1 ? `${selectedIds.length} clips selected` : selectedClip ? `SC ${selectedClip.frame.mark} · clip ${timecode(selectedClip.start)}–${timecode(selectedClip.end)} · ${selectedClip.duration}f` : "No clip selected"}</span>
        <span className="sequence-hints">
          <kbd>⌥</kbd>drag copy · <kbd>⇧</kbd>click select · <kbd>N</kbd> snap · <kbd>M</kbd> marker · <kbd>⌘C</kbd><kbd>⌘V</kbd> copy · <kbd>S</kbd> split · <kbd>⌫</kbd> delete
        </span>
      </footer>
    </aside>
  );
}
