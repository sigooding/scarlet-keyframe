import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BeatAnimation, NoteMarker } from "../core/model";
import { insertionSlotAtFrame, type ReorderDestination } from "../core/edits";
import { storyboardGradient } from "../core/helpers";
import { firstLine, sceneLabel } from "../core/model";
import { formatTimecode, MIN_CLIP_FRAMES } from "../core/timing";
import {
  clipAtFrame,
  moveKeyToFrame,
  visibleClipRange,
  type AnimProp,
  type TimelineClip,
} from "../sequence/animate";
import {
  buildSceneMarkers,
  collectSnapTargets,
  snapFrame,
  SNAP_DISTANCE_PX,
} from "../sequence/snap";
import {
  DEFAULT_TRANSITION_FRAMES,
  getTransitionWindow,
  readCutTransition,
  TRANSITION_KINDS,
  type TransitionKind,
} from "../sequence/transitions";
import { Tracks } from "./Tracks";

export interface TimelineProps {
  clips: TimelineClip[];
  totalFrames: number;
  playheadFrame: number;
  selectedFrameId: string;
  selectedFrameIds: string[];
  snapEnabled: boolean;
  noteMarkers: NoteMarker[];
  editingMarkerId: string | null;
  canSplit: boolean;
  hasClipboard: boolean;
  resolveMedia: (value: string | undefined) => string | undefined;
  onToggleSnap: () => void;
  onAddNoteMarker: () => void;
  onUpdateNoteMarker: (markerId: string, name: string) => void;
  onDeleteNoteMarker: (markerId: string) => void;
  onCloseMarkerEditor: () => void;
  onEditMarker: (markerId: string) => void;
  onScrub: (frame: number) => void;
  onSetSelection: (ids: string[], primaryId: string, targetFrame?: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onTrimPreview: (frameId: string, durationFrames: number) => void;
  onRollPreview: (leftFrameId: string, rightFrameId: string, leftDuration: number, rightDuration: number) => void;
  onMoveClips: (frameIds: string[], destination: ReorderDestination) => void;
  onSetTransition: (incomingFrameId: string, kind: TransitionKind, durationFrames: number, previewOnly?: boolean) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onCopy: () => void;
  onPaste: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
  onDropFile: (file: File, frameId: string) => void;
}

const MIN_PX_PER_FRAME = 0.08;
const MAX_PX_PER_FRAME = 16;
const DEFAULT_PX_PER_FRAME = 1.6;
const TICK_INTERVALS = [1, 2, 4, 6, 12, 24, 48, 120, 240, 360, 720, 1440, 2880, 7200];

function chooseMajorTickFrames(pxPerFrame: number): number {
  for (const step of TICK_INTERVALS) {
    if (step * pxPerFrame >= 92) return step;
  }
  return 7200;
}

export function Timeline({
  clips,
  totalFrames,
  playheadFrame,
  selectedFrameId,
  selectedFrameIds,
  snapEnabled,
  noteMarkers,
  editingMarkerId,
  canSplit,
  hasClipboard,
  resolveMedia,
  onToggleSnap,
  onAddNoteMarker,
  onUpdateNoteMarker,
  onDeleteNoteMarker,
  onCloseMarkerEditor,
  onEditMarker,
  onScrub,
  onSetSelection,
  onDragStart,
  onDragEnd,
  onTrimPreview,
  onRollPreview,
  onMoveClips,
  onSetTransition,
  onAnimationPreview,
  onCopy,
  onPaste,
  onSplit,
  onDelete,
  onMoveCue,
  onDropFile,
}: TimelineProps) {
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1100);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [snapGuideFrame, setSnapGuideFrame] = useState<number | null>(null);
  const [moveOverlay, setMoveOverlay] = useState<{
    indicatorFrame: number;
    targetSceneId: string;
    targetMark: string;
    copy: boolean;
    count: number;
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [transitionPopover, setTransitionPopover] = useState<{
    incomingId: string;
    cutFrame: number;
    maxFrames: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const initialCenteredRef = useRef(false);
  const pxPerFrameRef = useRef(pxPerFrame);
  pxPerFrameRef.current = pxPerFrame;
  const playheadRef = useRef(playheadFrame);
  playheadRef.current = playheadFrame;

  const activeClip = useMemo(() => clipAtFrame(clips, playheadFrame), [clips, playheadFrame]);
  const sceneMarkers = useMemo(() => buildSceneMarkers(clips), [clips]);

  const editingMarker = useMemo(
    () => (editingMarkerId ? noteMarkers.find((m) => m.id === editingMarkerId) ?? null : null),
    [editingMarkerId, noteMarkers],
  );
  const [markerDraftName, setMarkerDraftName] = useState("");
  useEffect(() => {
    if (editingMarker) setMarkerDraftName(editingMarker.name);
  }, [editingMarker]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(Math.max(320, el.clientWidth));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const centerFrameInView = useCallback((frame: number, scale = pxPerFrameRef.current) => {
    const el = scrollRef.current;
    if (!el) return;
    const targetLeft = Math.max(0, frame * scale - el.clientWidth * 0.28);
    el.scrollLeft = targetLeft;
    setScrollLeft(targetLeft);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !clips.length) return;
    if (!initialCenteredRef.current) {
      initialCenteredRef.current = true;
      centerFrameInView(playheadFrame, pxPerFrame);
      return;
    }
    if (scrubbingRef.current) return;
    const x = playheadFrame * pxPerFrame;
    const left = el.scrollLeft;
    const width = el.clientWidth;
    if (x < left + 24 || x > left + width - 48) {
      const next = Math.max(0, x - width * 0.25);
      el.scrollLeft = next;
      setScrollLeft(next);
    }
  }, [clips.length, playheadFrame, pxPerFrame, centerFrameInView]);

  const zoomTimeline = useCallback((factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    const prevScale = pxPerFrameRef.current;
    const nextScale = Math.max(MIN_PX_PER_FRAME, Math.min(MAX_PX_PER_FRAME, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-6) return;
    const viewOffset =
      anchorX ??
      (el
        ? Math.min(el.clientWidth * 0.5, Math.max(40, playheadRef.current * prevScale - el.scrollLeft))
        : 240);
    const anchorFrame = el ? (el.scrollLeft + viewOffset) / prevScale : playheadRef.current;
    setPxPerFrame(nextScale);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const nextLeft = Math.max(0, anchorFrame * nextScale - viewOffset);
      scrollRef.current.scrollLeft = nextLeft;
      setScrollLeft(nextLeft);
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      zoomTimeline(factor, offsetX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTimeline]);

  const scenes = useMemo(() => {
    const seen = new Map<string, TimelineClip>();
    for (const clip of clips) {
      if (!seen.has(clip.keyframe.sceneId)) seen.set(clip.keyframe.sceneId, clip);
    }
    return [...seen.values()];
  }, [clips]);

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const results: TimelineClip[] = [];
    for (const clip of clips) {
      const kf = clip.keyframe;
      if (`${kf.mark} ${kf.speaker} ${kf.text} ${kf.picture || ""}`.toLowerCase().includes(q)) {
        results.push(clip);
        if (results.length >= 40) break;
      }
    }
    return results;
  }, [clips, search]);

  const jumpToClip = (clip: TimelineClip) => {
    onSetSelection([clip.keyframe.id], clip.keyframe.id, clip.startFrame);
    centerFrameInView(clip.startFrame);
    setSearchOpen(false);
  };

  // Virtualized visible window
  const overscanPx = 380;
  const minVisibleFrame = Math.max(0, Math.floor((scrollLeft - overscanPx) / pxPerFrame));
  const maxVisibleFrame = Math.min(
    Math.max(1, totalFrames),
    Math.ceil((scrollLeft + viewportWidth + overscanPx) / pxPerFrame),
  );
  const [visStart, visEnd] = useMemo(
    () => visibleClipRange(clips, minVisibleFrame, maxVisibleFrame),
    [clips, minVisibleFrame, maxVisibleFrame],
  );
  const visibleClips = useMemo(
    () => (visEnd >= visStart ? clips.slice(visStart, visEnd + 1) : []),
    [clips, visStart, visEnd],
  );

  const visibleSceneMarkers = useMemo(
    () => sceneMarkers.filter((m) => m.frame >= minVisibleFrame && m.frame <= maxVisibleFrame),
    [sceneMarkers, minVisibleFrame, maxVisibleFrame],
  );

  const visibleNoteMarkers = useMemo(
    () => noteMarkers.filter((m) => m.frame >= minVisibleFrame && m.frame <= maxVisibleFrame),
    [noteMarkers, minVisibleFrame, maxVisibleFrame],
  );

  const majorStep = chooseMajorTickFrames(pxPerFrame);
  const minorStep = majorStep >= 24 ? majorStep / 4 : majorStep >= 4 ? majorStep / 2 : 1;
  const ticks = useMemo(() => {
    const list: Array<{ frame: number; major: boolean }> = [];
    const firstTick = Math.max(0, Math.floor(minVisibleFrame / minorStep) * minorStep);
    const lastTick = Math.min(totalFrames, maxVisibleFrame);
    for (let f = firstTick; f <= lastTick; f += minorStep) {
      const rounded = Math.round(f);
      const isMajor = rounded % majorStep === 0;
      if (isMajor || minorStep * pxPerFrame >= 10) {
        list.push({ frame: rounded, major: isMajor });
      }
    }
    return list;
  }, [minVisibleFrame, maxVisibleFrame, totalFrames, majorStep, minorStep, pxPerFrame]);

  const rawFrameFromClientX = useCallback(
    (clientX: number): number => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      return Math.max(0, x / pxPerFrame);
    },
    [pxPerFrame],
  );

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      return Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(rawFrameFromClientX(clientX))));
    },
    [rawFrameFromClientX, totalFrames],
  );

  const getSnapTargetsForWindow = useCallback(
    (
      centerFrame: number,
      excludeClipIds?: Set<string>,
      excludePlayhead?: boolean,
      excludeKeyframe?: { clipId: string; prop: string; frame: number },
    ) => {
      const windowFrames = Math.ceil((SNAP_DISTANCE_PX * 4) / Math.max(0.05, pxPerFrame)) + 24;
      return collectSnapTargets({
        clips,
        playheadFrame,
        sceneMarkers,
        noteMarkers,
        excludeClipIds,
        excludePlayhead,
        excludeKeyframe,
        minFrame: centerFrame - windowFrames,
        maxFrame: centerFrame + windowFrames,
      });
    },
    [clips, playheadFrame, sceneMarkers, noteMarkers, pxPerFrame],
  );

  const beginScrub = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTransitionPopover(null);
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onScrub(frameFromClientX(event.clientX));
  };

  const moveScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (!scrubbingRef.current) return;
    onScrub(frameFromClientX(event.clientX));
  };

  const endScrub = () => {
    scrubbingRef.current = false;
  };

  // Multi-select click logic (Shift range, Ctrl/Cmd toggle, plain single)
  const handleClipClickSelect = useCallback(
    (clip: TimelineClip, shiftKey: boolean, modKey: boolean, clientX: number) => {
      const id = clip.keyframe.id;
      const clickedFrame = Math.max(clip.startFrame, Math.min(clip.endFrame - 1, frameFromClientX(clientX)));

      if (shiftKey && selectedFrameId) {
        const anchorIdx = clips.findIndex((c) => c.keyframe.id === selectedFrameId);
        const targetIdx = clip.index;
        if (anchorIdx >= 0) {
          const lo = Math.min(anchorIdx, targetIdx);
          const hi = Math.max(anchorIdx, targetIdx);
          const rangeIds = clips.slice(lo, hi + 1).map((c) => c.keyframe.id);
          onSetSelection(rangeIds, selectedFrameId);
          return;
        }
      }

      if (modKey) {
        const exists = selectedFrameIds.includes(id);
        const nextIds = exists
          ? selectedFrameIds.length > 1
            ? selectedFrameIds.filter((item) => item !== id)
            : [id]
          : [...selectedFrameIds, id];
        const nextPrimary = nextIds.includes(id) ? id : nextIds[nextIds.length - 1];
        onSetSelection(nextIds, nextPrimary);
        return;
      }

      onSetSelection([id], id, clickedFrame);
    },
    [clips, frameFromClientX, onSetSelection, selectedFrameId, selectedFrameIds],
  );

  // Marquee drag over empty track space
  const marqueeSession = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    baseIds: string[];
  } | null>(null);

  const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setTransitionPopover(null);
    const scrollEl = scrollRef.current;
    const trackEl = trackRef.current;
    if (!scrollEl || !trackEl) return;
    const trackRect = trackEl.getBoundingClientRect();
    const x = event.clientX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
    const y = event.clientY - trackRect.top;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    marqueeSession.current = {
      startX: x,
      startY: y,
      additive,
      baseIds: additive ? [...selectedFrameIds] : [],
    };
    setMarquee({ x1: x, y1: y, x2: x, y2: y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = marqueeSession.current;
    const scrollEl = scrollRef.current;
    const trackEl = trackRef.current;
    if (!session || !scrollEl || !trackEl) return;
    const trackRect = trackEl.getBoundingClientRect();
    const x = event.clientX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
    const y = event.clientY - trackRect.top;
    setMarquee({ x1: session.startX, y1: session.startY, x2: x, y2: y });

    const minX = Math.min(session.startX, x);
    const maxX = Math.max(session.startX, x);
    const minFrame = minX / pxPerFrame;
    const maxFrame = maxX / pxPerFrame;

    // Clips span y = 14 .. trackHeight - 10; if box touches clip vertical band (or spans horizontally)
    const minY = Math.min(session.startY, y);
    const maxY = Math.max(session.startY, y);
    const touchesClipBand = maxY >= 12 && minY <= trackRect.height - 10;
    const hitIds = touchesClipBand
      ? clips
          .filter((c) => c.endFrame >= minFrame && c.startFrame <= maxFrame)
          .map((c) => c.keyframe.id)
      : [];

    const combined = [...new Set([...session.baseIds, ...hitIds])];
    if (combined.length > 0) {
      const primary = combined.includes(selectedFrameId) ? selectedFrameId : combined[0];
      onSetSelection(combined, primary);
    }
  };

  const endMarquee = () => {
    marqueeSession.current = null;
    setMarquee(null);
  };

  // Cut Roll Edit session
  const rollSession = useRef<{
    leftId: string;
    rightId: string;
    initialCutFrame: number;
    initialLeftFrames: number;
    initialRightFrames: number;
    startX: number;
    targets: ReturnType<typeof collectSnapTargets>;
  } | null>(null);

  // Transition Edge Drag session
  const transResizeSession = useRef<{
    incomingId: string;
    kind: TransitionKind;
    cutFrame: number;
    maxFrames: number;
    side: "left" | "right";
    initialFrames: number;
    startX: number;
    targets: ReturnType<typeof collectSnapTargets>;
  } | null>(null);

  const trackWidth = Math.max(viewportWidth, Math.ceil(totalFrames * pxPerFrame) + 160);

  const popoverIncomingClip = useMemo(
    () =>
      transitionPopover
        ? clips.find((c) => c.keyframe.id === transitionPopover.incomingId) ?? null
        : null,
    [clips, transitionPopover],
  );
  const popoverSpec = useMemo(
    () =>
      popoverIncomingClip && transitionPopover
        ? readCutTransition(popoverIncomingClip.keyframe, transitionPopover.maxFrames)
        : null,
    [popoverIncomingClip, transitionPopover],
  );

  return (
    <section className="timeline-editor" aria-label="Picture timeline" data-testid="picture-timeline">
      <header className="timeline-toolbar">
        <div className="timeline-goto-group">
          <span className="eyebrow">GO TO</span>
          <select
            className="timeline-scene-select"
            aria-label="Go to scene"
            value={activeClip?.keyframe.sceneId || ""}
            onChange={(event) => {
              const target = scenes.find((c) => c.keyframe.sceneId === event.target.value);
              if (target) jumpToClip(target);
            }}
          >
            {scenes.map((clip) => (
              <option key={clip.keyframe.sceneId} value={clip.keyframe.sceneId}>
                SC {sceneLabel(clip.keyframe.scene)} · {formatTimecode(clip.startFrame)}
              </option>
            ))}
          </select>

          <div className="timeline-goto-search">
            <label className="timeline-search">
              <span>⌕</span>
              <input
                value={search}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchMatches[0]) {
                    event.preventDefault();
                    jumpToClip(searchMatches[0]);
                  } else if (event.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                placeholder="Go to line or speaker…"
              />
            </label>
            {searchOpen && search.trim() && (
              <div className="timeline-search-popover" role="listbox" aria-label="Matching shots">
                {searchMatches.length > 0 ? (
                  searchMatches.map((clip) => (
                    <button
                      type="button"
                      key={`${clip.keyframe.sceneId}:${clip.keyframe.id}:${clip.index}`}
                      className="timeline-search-hit"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        jumpToClip(clip);
                      }}
                    >
                      <span className="hit-mark">SC {clip.keyframe.mark}</span>
                      <span className="hit-tc">{formatTimecode(clip.startFrame)}</span>
                      <span className="hit-copy">
                        <strong>{clip.keyframe.speaker}:</strong>{" "}
                        {firstLine(clip.keyframe.text, 54) || "No caption"}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="timeline-search-empty">No matching beats</div>
                )}
              </div>
            )}
          </div>

          {editingMarker && (
            <form
              className="marker-inline-editor"
              data-testid="marker-inline-editor"
              onSubmit={(event) => {
                event.preventDefault();
                onUpdateNoteMarker(editingMarker.id, markerDraftName);
                onCloseMarkerEditor();
              }}
            >
              <span>⚑</span>
              <input
                autoFocus
                aria-label="Note marker name"
                value={markerDraftName}
                onChange={(event) => setMarkerDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") onCloseMarkerEditor();
                }}
              />
              <button type="submit" className="button button-primary">
                OK
              </button>
              <button
                type="button"
                className="button button-text danger-quiet"
                onClick={() => {
                  onDeleteNoteMarker(editingMarker.id);
                  onCloseMarkerEditor();
                }}
              >
                ×
              </button>
            </form>
          )}
        </div>

        <div className="timeline-edit-tools">
          <button
            type="button"
            className={`button button-quiet ${snapEnabled ? "is-active-tool" : ""}`}
            data-testid="snap-toggle"
            aria-pressed={snapEnabled}
            onClick={onToggleSnap}
            title="Toggle magnetic snapping within 8px (N)"
          >
            🧲 Snap (N)
          </button>
          <button
            type="button"
            className="button button-quiet"
            data-testid="add-marker-btn"
            onClick={onAddNoteMarker}
            title="Add named note marker at playhead (M)"
          >
            ⚑ Marker (M)
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={onCopy}
            title="Copy selected clips (Ctrl/Cmd+C)"
          >
            Copy{selectedFrameIds.length > 1 ? ` (${selectedFrameIds.length})` : ""}
          </button>
          <button
            type="button"
            className="button button-quiet"
            disabled={!hasClipboard}
            onClick={onPaste}
            title="Paste copied clips at playhead (Ctrl/Cmd+V)"
          >
            Paste
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={onSplit}
            disabled={!canSplit}
            title="Split selected clip at playhead (S)"
          >
            ✂ Split (S)
          </button>
          <button
            type="button"
            className="button button-quiet danger-quiet"
            onClick={onDelete}
            title="Delete selected clip(s) (Delete)"
          >
            Delete{selectedFrameIds.length > 1 ? ` (${selectedFrameIds.length})` : ""}
          </button>
          <span className="timeline-tc-badge" data-testid="timeline-timecode">
            <strong>{formatTimecode(playheadFrame)}</strong>
            <i>/</i>
            <span>{formatTimecode(totalFrames)}</span>
          </span>
        </div>

        <div className="timeline-zoom-group" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out timeline"
            data-testid="timeline-zoom-out"
            onClick={() => zoomTimeline(1 / 1.35)}
            title="Zoom out timeline (− or Ctrl+scroll)"
          >
            −
          </button>
          <span className="timeline-zoom-readout">{Math.round(pxPerFrame * 24)}px/s</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in timeline"
            data-testid="timeline-zoom-in"
            onClick={() => zoomTimeline(1.35)}
            title="Zoom in timeline (+ or Ctrl+scroll)"
          >
            +
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="timeline-scroll-area"
        data-testid="timeline-scroll"
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className="timeline-canvas" style={{ width: trackWidth }}>
          <div
            className="timeline-ruler"
            data-testid="timeline-ruler"
            onPointerDown={beginScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            {ticks.map((tick) => (
              <span
                key={tick.frame}
                className={`ruler-tick ${tick.major ? "is-major" : "is-minor"}`}
                style={{ left: tick.frame * pxPerFrame }}
              >
                {tick.major && <b>{formatTimecode(tick.frame)}</b>}
              </span>
            ))}

            {visibleSceneMarkers.map((sm) => (
              <button
                type="button"
                key={`sm-${sm.sceneId}-${sm.frame}`}
                className="ruler-scene-marker"
                data-testid={`scene-marker-${sm.mark}`}
                style={{ left: sm.frame * pxPerFrame }}
                title={`Scene ${sm.mark} · ${formatTimecode(sm.frame)} — click to jump`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSetSelection([sm.clipId], sm.clipId, sm.frame);
                }}
              >
                {sm.mark}
              </button>
            ))}

            {visibleNoteMarkers.map((nm) => (
              <button
                type="button"
                key={nm.id}
                className={`ruler-note-marker ${editingMarkerId === nm.id ? "is-editing" : ""}`}
                data-testid={`note-marker-${nm.id}`}
                style={{ left: nm.frame * pxPerFrame }}
                title={`Note "${nm.name}" @ ${formatTimecode(nm.frame)} — click to jump, double-click to edit`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onScrub(nm.frame);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onEditMarker(nm.id);
                }}
              >
                ⚑ {nm.name}
              </button>
            ))}
          </div>

          <div
            ref={trackRef}
            className="timeline-picture-track"
            data-testid="picture-track"
            onPointerDown={beginMarquee}
            onPointerMove={moveMarquee}
            onPointerUp={endMarquee}
            onPointerCancel={endMarquee}
          >
            <div className="synced-lane-tag picture-lane-tag">▣ VIDEO</div>

            {visibleClips.map((clip) => {
              const rawSrc = resolveMedia(clip.keyframe.picture);
              const imageThumb =
                rawSrc && !rawSrc.startsWith("gradient:") && !rawSrc.startsWith("emoji:")
                  ? rawSrc
                  : undefined;
              const prevClip = clip.index > 0 ? clips[clip.index - 1] : undefined;
              const maxTransFrames = prevClip
                ? 2 * Math.min(prevClip.durationFrames, clip.durationFrames)
                : 0;
              const cutTrans = prevClip ? readCutTransition(clip.keyframe, maxTransFrames) : undefined;

              return (
                <div key={`clip-wrap-${clip.keyframe.sceneId}:${clip.keyframe.id}:${clip.index}`}>
                  <ClipItem
                    clip={clip}
                    clips={clips}
                    pxPerFrame={pxPerFrame}
                    snapEnabled={snapEnabled}
                    isSelected={selectedFrameId === clip.keyframe.id}
                    isMulti={selectedFrameIds.includes(clip.keyframe.id)}
                    selectedFrameIds={selectedFrameIds}
                    thumbSrc={imageThumb}
                    rawFrameFromClientX={rawFrameFromClientX}
                    getSnapTargetsForWindow={getSnapTargetsForWindow}
                    onSetSnapGuide={setSnapGuideFrame}
                    onSetMoveOverlay={setMoveOverlay}
                    onClickSelect={(shift, mod, clientX) =>
                      handleClipClickSelect(clip, shift, mod, clientX)
                    }
                    onSetSelection={onSetSelection}
                    onScrub={onScrub}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onTrimPreview={onTrimPreview}
                    onMoveClips={onMoveClips}
                    onAnimationPreview={onAnimationPreview}
                    onDropFile={onDropFile}
                  />

                  {prevClip && cutTrans && (
                    <>
                      {/* Transition box centred on the cut */}
                      {(() => {
                        const cutFrame = clip.startFrame;
                        const isCut = cutTrans.kind === "cut";
                        const win = getTransitionWindow(cutFrame, cutTrans.durationFrames);
                        const rawWidth = cutTrans.durationFrames * pxPerFrame;
                        const width = isCut ? 12 : Math.max(20, rawWidth);
                        const left = isCut
                          ? cutFrame * pxPerFrame - 6
                          : rawWidth >= 20
                            ? win.startFrame * pxPerFrame
                            : cutFrame * pxPerFrame - 10;
                        const kindMeta = TRANSITION_KINDS.find((t) => t.kind === cutTrans.kind);

                        return (
                          <div
                            className={`timeline-transition-box ${isCut ? "is-cut-badge" : `is-${cutTrans.kind}`}`}
                            data-testid={`transition-box-${clip.keyframe.id}`}
                            data-transition-kind={cutTrans.kind}
                            data-transition-frames={cutTrans.durationFrames}
                            style={{ left, width }}
                            title={
                              isCut
                                ? "Cut — double-click to add dissolve, dip to black, or wipe"
                                : `${kindMeta?.label || cutTrans.kind} (${cutTrans.durationFrames}f) — drag edges to resize, double-click to change`
                            }
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setTransitionPopover({
                                incomingId: clip.keyframe.id,
                                cutFrame,
                                maxFrames: Math.max(2, maxTransFrames),
                              });
                            }}
                          >
                            {!isCut && (
                              <span
                                className="transition-edge edge-left"
                                data-testid={`transition-edge-left-${clip.keyframe.id}`}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                  transResizeSession.current = {
                                    incomingId: clip.keyframe.id,
                                    kind: cutTrans.kind,
                                    cutFrame,
                                    maxFrames: Math.max(2, maxTransFrames),
                                    side: "left",
                                    initialFrames: cutTrans.durationFrames,
                                    startX: e.clientX,
                                    targets: getSnapTargetsForWindow(
                                      cutFrame,
                                      new Set([prevClip.keyframe.id, clip.keyframe.id]),
                                    ).filter((t) => t.frame !== cutFrame),
                                  };
                                  onDragStart();
                                }}
                                onPointerMove={(e) => {
                                  const s = transResizeSession.current;
                                  if (!s) return;
                                  const rawEdge = rawFrameFromClientX(e.clientX);
                                  const snapped = snapFrame(rawEdge, s.targets, pxPerFrame, snapEnabled);
                                  setSnapGuideFrame(snapped.snapped ? snapped.frame : null);
                                  const half = Math.max(1, Math.round(s.cutFrame - snapped.frame));
                                  const nextLen = Math.max(2, Math.min(s.maxFrames, half * 2));
                                  onSetTransition(s.incomingId, s.kind, nextLen, true);
                                }}
                                onPointerUp={(e) => {
                                  e.stopPropagation();
                                  transResizeSession.current = null;
                                  setSnapGuideFrame(null);
                                  onDragEnd("Transition length changed");
                                }}
                                onPointerCancel={() => {
                                  transResizeSession.current = null;
                                  setSnapGuideFrame(null);
                                  onDragEnd("");
                                }}
                              />
                            )}
                            <span className="transition-box-label">
                              {isCut
                                ? "×"
                                : width >= 46
                                  ? `${kindMeta?.shortLabel} ${cutTrans.durationFrames}f`
                                  : `${cutTrans.durationFrames}f`}
                            </span>
                            {!isCut && (
                              <span
                                className="transition-edge edge-right"
                                data-testid={`transition-edge-right-${clip.keyframe.id}`}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.currentTarget.setPointerCapture(e.pointerId);
                                  transResizeSession.current = {
                                    incomingId: clip.keyframe.id,
                                    kind: cutTrans.kind,
                                    cutFrame,
                                    maxFrames: Math.max(2, maxTransFrames),
                                    side: "right",
                                    initialFrames: cutTrans.durationFrames,
                                    startX: e.clientX,
                                    targets: getSnapTargetsForWindow(
                                      cutFrame,
                                      new Set([prevClip.keyframe.id, clip.keyframe.id]),
                                    ).filter((t) => t.frame !== cutFrame),
                                  };
                                  onDragStart();
                                }}
                                onPointerMove={(e) => {
                                  const s = transResizeSession.current;
                                  if (!s) return;
                                  const rawEdge = rawFrameFromClientX(e.clientX);
                                  const snapped = snapFrame(rawEdge, s.targets, pxPerFrame, snapEnabled);
                                  setSnapGuideFrame(snapped.snapped ? snapped.frame : null);
                                  const half = Math.max(1, Math.round(snapped.frame - s.cutFrame));
                                  const nextLen = Math.max(2, Math.min(s.maxFrames, half * 2));
                                  onSetTransition(s.incomingId, s.kind, nextLen, true);
                                }}
                                onPointerUp={(e) => {
                                  e.stopPropagation();
                                  transResizeSession.current = null;
                                  setSnapGuideFrame(null);
                                  onDragEnd("Transition length changed");
                                }}
                                onPointerCancel={() => {
                                  transResizeSession.current = null;
                                  setSnapGuideFrame(null);
                                  onDragEnd("");
                                }}
                              />
                            )}
                          </div>
                        );
                      })()}

                      {/* Roll Edit Handle right on the cut seam between prevClip and clip */}
                      <div
                        className="timeline-roll-handle"
                        data-testid={`roll-handle-${prevClip.keyframe.id}`}
                        role="separator"
                        aria-label={`Roll cut between ${prevClip.keyframe.mark}/${prevClip.keyframe.number} and ${clip.keyframe.mark}/${clip.keyframe.number}`}
                        style={{ left: clip.startFrame * pxPerFrame - 3 }}
                        title="Drag cut to roll edit (lengthens one clip and shortens the other)"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          rollSession.current = {
                            leftId: prevClip.keyframe.id,
                            rightId: clip.keyframe.id,
                            initialCutFrame: clip.startFrame,
                            initialLeftFrames: prevClip.durationFrames,
                            initialRightFrames: clip.durationFrames,
                            startX: e.clientX,
                            targets: collectSnapTargets({
                              clips,
                              playheadFrame,
                              sceneMarkers,
                              noteMarkers,
                              excludeClipIds: new Set([prevClip.keyframe.id, clip.keyframe.id]),
                              minFrame: clip.startFrame - 600,
                              maxFrame: clip.startFrame + 600,
                            }).filter((t) => t.frame !== clip.startFrame || t.kind === "playhead" || t.kind === "note-marker"),
                          };
                          onDragStart();
                        }}
                        onPointerMove={(e) => {
                          const s = rollSession.current;
                          if (!s) return;
                          const rawCut = s.initialCutFrame + (e.clientX - s.startX) / pxPerFrame;
                          const snapped = snapFrame(rawCut, s.targets, pxPerFrame, snapEnabled);
                          setSnapGuideFrame(snapped.snapped ? snapped.frame : null);
                          const minDelta = MIN_CLIP_FRAMES - s.initialLeftFrames;
                          const maxDelta = s.initialRightFrames - MIN_CLIP_FRAMES;
                          if (minDelta > maxDelta) return;
                          const clampedDelta = Math.max(
                            minDelta,
                            Math.min(maxDelta, Math.round(snapped.frame - s.initialCutFrame)),
                          );
                          onRollPreview(
                            s.leftId,
                            s.rightId,
                            s.initialLeftFrames + clampedDelta,
                            s.initialRightFrames - clampedDelta,
                          );
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          if (!rollSession.current) return;
                          rollSession.current = null;
                          setSnapGuideFrame(null);
                          onDragEnd("Cut rolled");
                        }}
                        onPointerCancel={() => {
                          rollSession.current = null;
                          setSnapGuideFrame(null);
                          onDragEnd("");
                        }}
                      />
                    </>
                  )}
                </div>
              );
            })}

            {transitionPopover && popoverIncomingClip && popoverSpec && (
              <div
                className="transition-kind-popover"
                data-testid="transition-popover"
                style={{
                  left: Math.max(12, transitionPopover.cutFrame * pxPerFrame - 95),
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="transition-popover-head">
                  <span>TRANSITION</span>
                  <button
                    type="button"
                    className="field-reset"
                    onClick={() => setTransitionPopover(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="transition-kind-options">
                  {TRANSITION_KINDS.map((option) => (
                    <button
                      type="button"
                      key={option.kind}
                      data-testid={`transition-opt-${option.kind}`}
                      className={`transition-kind-btn ${popoverSpec.kind === option.kind ? "is-active" : ""}`}
                      onClick={() => {
                        const frames =
                          option.kind === "cut"
                            ? 0
                            : popoverSpec.durationFrames > 0
                              ? popoverSpec.durationFrames
                              : Math.min(DEFAULT_TRANSITION_FRAMES, transitionPopover.maxFrames);
                        onSetTransition(transitionPopover.incomingId, option.kind, frames, false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {popoverSpec.kind !== "cut" && (
                  <label className="transition-frames-field">
                    <span>Length (frames)</span>
                    <input
                      type="number"
                      data-testid="transition-frames-input"
                      min={1}
                      max={transitionPopover.maxFrames}
                      value={popoverSpec.durationFrames}
                      onChange={(e) => {
                        const next = Math.max(
                          1,
                          Math.min(transitionPopover.maxFrames, Number(e.target.value) || 1),
                        );
                        onSetTransition(transitionPopover.incomingId, popoverSpec.kind, next, false);
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {moveOverlay && (
              <div
                className="timeline-drop-indicator"
                data-testid="timeline-drop-indicator"
                style={{ left: moveOverlay.indicatorFrame * pxPerFrame }}
              >
                <span>
                  {moveOverlay.copy ? "＋ COPY" : "MOVE"} {moveOverlay.count > 1 ? `(${moveOverlay.count})` : ""} → SC{" "}
                  {moveOverlay.targetMark}
                </span>
              </div>
            )}

            {marquee && (
              <div
                className="timeline-marquee-box"
                data-testid="timeline-marquee-box"
                style={{
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                }}
              />
            )}
          </div>

          <Tracks
            clips={clips}
            totalFrames={totalFrames}
            pxPerFrame={pxPerFrame}
            minVisibleFrame={minVisibleFrame}
            maxVisibleFrame={maxVisibleFrame}
            selectedFrameId={selectedFrameId}
            onSelect={(id, startFrame) => onSetSelection([id], id, startFrame)}
            onMoveCue={onMoveCue}
          />

          {snapGuideFrame !== null && (
            <div
              className="timeline-snap-guide"
              data-testid="timeline-snap-guide"
              style={{ left: snapGuideFrame * pxPerFrame }}
            />
          )}

          <div
            className="timeline-playhead"
            data-testid="timeline-playhead"
            style={{ left: playheadFrame * pxPerFrame }}
          >
            <div
              className="timeline-playhead-head"
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, totalFrames - 1)}
              aria-valuenow={playheadFrame}
              tabIndex={0}
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
            />
            <div className="timeline-playhead-line" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ClipItem({
  clip,
  clips,
  pxPerFrame,
  snapEnabled,
  isSelected,
  isMulti,
  selectedFrameIds,
  thumbSrc,
  rawFrameFromClientX,
  getSnapTargetsForWindow,
  onSetSnapGuide,
  onSetMoveOverlay,
  onClickSelect,
  onSetSelection,
  onScrub,
  onDragStart,
  onDragEnd,
  onTrimPreview,
  onMoveClips,
  onAnimationPreview,
  onDropFile,
}: {
  clip: TimelineClip;
  clips: TimelineClip[];
  pxPerFrame: number;
  snapEnabled: boolean;
  isSelected: boolean;
  isMulti: boolean;
  selectedFrameIds: string[];
  thumbSrc?: string;
  rawFrameFromClientX: (clientX: number) => number;
  getSnapTargetsForWindow: (
    centerFrame: number,
    excludeClipIds?: Set<string>,
    excludePlayhead?: boolean,
    excludeKeyframe?: { clipId: string; prop: string; frame: number },
  ) => ReturnType<typeof collectSnapTargets>;
  onSetSnapGuide: (frame: number | null) => void;
  onSetMoveOverlay: (
    overlay: {
      indicatorFrame: number;
      targetSceneId: string;
      targetMark: string;
      copy: boolean;
      count: number;
    } | null,
  ) => void;
  onClickSelect: (shiftKey: boolean, modKey: boolean, clientX: number) => void;
  onSetSelection: (ids: string[], primaryId: string, targetFrame?: number) => void;
  onScrub: (frame: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onTrimPreview: (frameId: string, durationFrames: number) => void;
  onMoveClips: (frameIds: string[], destination: ReorderDestination) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onDropFile: (file: File, frameId: string) => void;
}) {
  const kf = clip.keyframe;
  const width = Math.max(3, clip.durationFrames * pxPerFrame);
  const left = clip.startFrame * pxPerFrame;
  const isVoiceCut = clip.voiceFrames > 0 && clip.durationFrames < clip.voiceFrames;
  const picture = kf.picture || "";
  const bgFallback = picture.startsWith("gradient:")
    ? picture.slice(9)
    : storyboardGradient(picture).slice(9);

  const moveSession = useRef<{
    startX: number;
    movingIds: string[];
    moved: boolean;
    shiftKey: boolean;
    modKey: boolean;
    lastSlot?: { targetSceneId: string; targetBeatIndex: number; indicatorFrame: number };
  } | null>(null);

  const trimSession = useRef<{
    startX: number;
    startFrame: number;
    initialEndFrame: number;
    targets: ReturnType<typeof collectSnapTargets>;
  } | null>(null);

  const keySession = useRef<{
    prop: AnimProp;
    startX: number;
    initialFrame: number;
    initialAnim: BeatAnimation | undefined;
    moved: boolean;
  } | null>(null);

  const anim = kf.beat.animation;

  return (
    <div
      className={[
        "timeline-clip",
        isSelected ? "is-selected" : "",
        isMulti ? "is-multi" : "",
        isVoiceCut ? "is-voice-cut" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left,
        width,
        background: thumbSrc ? undefined : bgFallback,
      }}
      data-frame-id={kf.id}
      data-scene-id={kf.sceneId}
      data-scene-mark={kf.mark}
      data-start-frame={clip.startFrame}
      data-duration-frames={clip.durationFrames}
      data-has-voice={kf.beat.audioUrl ? "true" : "false"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const modKey = event.ctrlKey || event.metaKey;
        const shiftKey = event.shiftKey;
        let movingIds = selectedFrameIds;
        if (!shiftKey && !modKey && !selectedFrameIds.includes(kf.id)) {
          movingIds = [kf.id];
          onSetSelection([kf.id], kf.id);
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        moveSession.current = {
          startX: event.clientX,
          movingIds,
          moved: false,
          shiftKey,
          modKey,
        };
      }}
      onPointerMove={(event) => {
        const session = moveSession.current;
        if (!session) return;
        const dx = event.clientX - session.startX;
        if (!session.moved && Math.abs(dx) < 5) return;
        session.moved = true;

        const rawFrame = rawFrameFromClientX(event.clientX);
        const excludeSet = event.altKey ? undefined : new Set(session.movingIds);
        const targets = getSnapTargetsForWindow(rawFrame, excludeSet);
        const snapped = snapFrame(rawFrame, targets, pxPerFrame, snapEnabled);
        onSetSnapGuide(snapped.snapped ? snapped.frame : null);

        const slot = insertionSlotAtFrame(clips, snapped.frame);
        session.lastSlot = slot;
        if (slot) {
          const targetClip = clips.find((c) => c.keyframe.sceneId === slot.targetSceneId);
          onSetMoveOverlay({
            indicatorFrame: slot.indicatorFrame,
            targetSceneId: slot.targetSceneId,
            targetMark: targetClip?.keyframe.mark || slot.targetSceneId,
            copy: event.altKey,
            count: session.movingIds.length,
          });
        }
      }}
      onPointerUp={(event) => {
        const session = moveSession.current;
        moveSession.current = null;
        onSetSnapGuide(null);
        onSetMoveOverlay(null);
        if (!session) return;
        if (session.moved && session.lastSlot) {
          onMoveClips(session.movingIds, {
            targetSceneId: session.lastSlot.targetSceneId,
            targetBeatIndex: session.lastSlot.targetBeatIndex,
            copy: event.altKey,
          });
        } else {
          onClickSelect(session.shiftKey, session.modKey, event.clientX);
        }
      }}
      onPointerCancel={() => {
        moveSession.current = null;
        onSetSnapGuide(null);
        onSetMoveOverlay(null);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) onDropFile(file, kf.id);
      }}
      title={
        isVoiceCut
          ? `SC ${kf.mark} / ${kf.number} — Picture (${clip.durationFrames}f) ends before voice (${clip.voiceFrames}f)`
          : `SC ${kf.mark} / ${kf.number} · ${formatTimecode(clip.startFrame)} (${clip.durationFrames}f) — drag to move, Alt+drag to copy`
      }
    >
      {thumbSrc && <img className="timeline-clip-thumb" src={thumbSrc} alt="" loading="lazy" decoding="async" />}

      {width >= 18 && (
        <div className="timeline-clip-overlay">
          <span className="timeline-clip-mark">{kf.mark}</span>
          {kf.beat.audioUrl && width >= 38 && (
            <span className="timeline-clip-vox-badge" title={`Voice: ${kf.beat.audioUrl}`}>
              🎙
            </span>
          )}
          {width >= 72 && (
            <span className="timeline-clip-label">
              {picture.split("/").pop()?.replace(/\.[^.]+$/, "") || kf.speaker}
            </span>
          )}
        </div>
      )}

      {clip.voiceFrames > 0 && (
        <div
          className={`timeline-clip-voice ${isVoiceCut ? "is-cut" : ""}`}
          data-testid={`voice-bar-${kf.id}`}
          style={{
            width: `${Math.min(100, (clip.voiceFrames / Math.max(1, clip.durationFrames)) * 100)}%`,
          }}
        />
      )}

      {isSelected && anim && (
        <div className="timeline-clip-keyframes">
          {(["zoom", "x", "y"] as const).map((prop) =>
            (anim[prop] ?? []).map((key) => {
              const clampedFrame = Math.max(0, Math.min(clip.durationFrames - 1, key.frame));
              const keyLeftPx = Math.max(
                5,
                Math.min(Math.max(5, width - 11), (clampedFrame + 0.5) * pxPerFrame),
              );
              return (
                <button
                  type="button"
                  key={`${prop}-${key.frame}`}
                  className={`clip-key-diamond prop-${prop}`}
                  data-testid={`clip-diamond-${prop}-${key.frame}`}
                  style={{ left: keyLeftPx }}
                  title={`${prop}: ${key.value} @ +${key.frame}f (${key.easing})`}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    keySession.current = {
                      prop,
                      startX: event.clientX,
                      initialFrame: key.frame,
                      initialAnim: JSON.parse(JSON.stringify(anim)) as BeatAnimation,
                      moved: false,
                    };
                    onDragStart();
                  }}
                  onPointerMove={(event) => {
                    const session = keySession.current;
                    if (!session) return;
                    const dx = event.clientX - session.startX;
                    if (Math.abs(dx) > 2) session.moved = true;
                    const rawAbsFrame = clip.startFrame + session.initialFrame + dx / pxPerFrame;
                    const targets = getSnapTargetsForWindow(rawAbsFrame, undefined, false, {
                      clipId: kf.id,
                      prop: session.prop,
                      frame: session.initialFrame,
                    });
                    const snapped = snapFrame(rawAbsFrame, targets, pxPerFrame, snapEnabled);
                    onSetSnapGuide(snapped.snapped ? snapped.frame : null);
                    const nextLocal = Math.max(
                      0,
                      Math.min(
                        Math.max(0, clip.durationFrames - 1),
                        snapped.frame - clip.startFrame,
                      ),
                    );
                    const updated = moveKeyToFrame(
                      session.initialAnim,
                      session.prop,
                      session.initialFrame,
                      nextLocal,
                      Math.max(0, clip.durationFrames - 1),
                    );
                    onAnimationPreview(kf.id, updated);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    const session = keySession.current;
                    keySession.current = null;
                    onSetSnapGuide(null);
                    if (!session) return;
                    if (session.moved) {
                      onDragEnd(`${session.prop} keyframe moved`);
                    } else {
                      onDragEnd("");
                      onScrub(
                        clip.startFrame + Math.min(Math.max(0, clip.durationFrames - 1), session.initialFrame),
                      );
                    }
                  }}
                  onPointerCancel={() => {
                    keySession.current = null;
                    onSetSnapGuide(null);
                    onDragEnd("");
                  }}
                >
                  ◆
                </button>
              );
            }),
          )}
        </div>
      )}

      <div
        className="timeline-clip-trim"
        data-testid={`trim-handle-${kf.id}`}
        role="separator"
        aria-label={`Trim clip ${kf.mark}/${kf.number}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          const downstreamIds = new Set(clips.slice(clip.index).map((c) => c.keyframe.id));
          trimSession.current = {
            startX: event.clientX,
            startFrame: clip.startFrame,
            initialEndFrame: clip.endFrame,
            targets: getSnapTargetsForWindow(clip.endFrame, downstreamIds).filter(
              (t) => t.frame !== clip.endFrame || t.kind === "playhead" || t.kind === "note-marker",
            ),
          };
          onDragStart();
        }}
        onPointerMove={(event) => {
          const session = trimSession.current;
          if (!session) return;
          const rawEndFrame = session.initialEndFrame + (event.clientX - session.startX) / pxPerFrame;
          const snapped = snapFrame(rawEndFrame, session.targets, pxPerFrame, snapEnabled);
          onSetSnapGuide(snapped.snapped ? snapped.frame : null);
          const nextDuration = Math.max(MIN_CLIP_FRAMES, snapped.frame - session.startFrame);
          onTrimPreview(kf.id, nextDuration);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (!trimSession.current) return;
          trimSession.current = null;
          onSetSnapGuide(null);
          onDragEnd("Clip trimmed");
        }}
        onPointerCancel={() => {
          trimSession.current = null;
          onSetSnapGuide(null);
          onDragEnd("");
        }}
      />
    </div>
  );
}
