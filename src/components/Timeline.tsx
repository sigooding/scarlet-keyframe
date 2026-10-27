import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BeatAnimation, NoteMarker } from "../core/model";
import { insertionSlotAtFrame, type ReorderDestination } from "../core/edits";
import { pictureLabel, storyboardGradient } from "../core/helpers";
import { firstLine, sceneLabel } from "../core/model";
import {
  createDefaultTrackMix,
  effectiveTrackLevel,
  type TrackId,
  type TrackMixMap,
} from "../core/previewAudio";
import {
  combineMarqueeSelections,
  EMPTY_MULTI_SELECTION,
  formatMsTimecode,
  hitTestMarqueeBox,
  type AudioClip,
  type AudioLaneId,
  type MultiLaneSelection,
  type ResolvedAudioClip,
  type SelectedKeyframeDiamond,
  type TimelineLaneBands,
} from "../core/audioClips";
import type { BeatCaption } from "../core/captions";
import { FPS, formatTimecode, MIN_CLIP_FRAMES } from "../core/timing";
import { CaptionLane, type SelectedCaptionState } from "./CaptionLane";
import type { InspectorTab } from "./Inspector";
import { decodeDraggedAsset } from "./MediaBin";
import { Tracks } from "./Tracks";
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
  maxTransitionFramesForCut,
  readCutTransition,
  TRANSITION_KINDS,
  type TransitionAlignment,
  type TransitionKind,
} from "../sequence/transitions";

const TRACK_HEADERS: ReadonlyArray<{ id: TrackId; label: string; icon: string }> = [
  { id: "video", label: "Video", icon: "▣" },
  { id: "voice", label: "Voice", icon: "◉" },
  { id: "sfx", label: "SFX", icon: "✦" },
  { id: "music", label: "Music", icon: "♪" },
  { id: "ambience", label: "Ambience", icon: "≈" },
];

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
  musicDurations?: ReadonlyMap<string, number>;
  trackMix?: TrackMixMap;
  resolveMedia: (value: string | undefined) => string | undefined;
  onToggleTrackMute?: (track: TrackId) => void;
  onToggleTrackSolo?: (track: TrackId) => void;
  onSetTrackLevel?: (track: TrackId, level: number) => void;
  onFocusInspectorTab?: (tab: InspectorTab) => void;
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
  onSetTransition: (
    incomingFrameId: string,
    kind: TransitionKind,
    durationFrames: number,
    previewOnly?: boolean,
    alignment?: TransitionAlignment,
  ) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onCopy: () => void;
  onPaste: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onExecuteDelete?: (ripple: boolean) => void;
  onMoveCue: (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => void;
  onDropFile: (file: File, frameId: string) => void;
  onDropImageAsset?: (ref: string, frameId: string) => void;
  onDropAudioAsset?: (lane: AudioLaneId, ref: string, dropStartMs: number) => void;
  resolvedAudioClips?: ResolvedAudioClip[];
  audioDurations?: ReadonlyMap<string, number>;
  multiSelection?: MultiLaneSelection;
  onSetMultiSelection?: (selection: MultiLaneSelection, primaryFrameId?: string, targetFrame?: number) => void;
  onClearAllSelection?: () => void;
  onSelectAudioClip?: (clip: ResolvedAudioClip, additive: boolean, targetFrame?: number) => void;
  onPreviewUpdateAudioClip?: (clipId: string, updated: AudioClip) => void;
  onShiftSelectionPreview?: (deltaMs: number) => void;
  onCommitSelectionShift?: (deltaMs: number, copy: boolean, label?: string) => void;
  onSelectKeyframeDiamond?: (diamond: SelectedKeyframeDiamond, additive: boolean) => void;
  mediaBinOpen?: boolean;
  onToggleMediaBin?: () => void;
  showCaptions?: boolean;
  onToggleShowCaptions?: () => void;
  selectedCaption?: SelectedCaptionState | null;
  canMergeCaptions?: boolean;
  onSelectCaption?: (
    frameId: string,
    captionIndex: number,
    extendNeighbour: boolean,
    targetFrame?: number,
  ) => void;
  onClearCaptionSelection?: () => void;
  onCommitCaptions?: (
    frameId: string,
    captions: BeatCaption[],
    clipDurationFrames: number,
    label: string,
    nextSelectedIndices?: number[],
  ) => void;
  onCaptionPreview?: (
    frameId: string,
    captions: BeatCaption[],
    clipDurationFrames: number,
  ) => void;
  onMergeCaptions?: () => void;
  onDeleteCaptions?: () => void;
}

const MIN_PX_PER_FRAME = 0.08;
const MAX_PX_PER_FRAME = 160;
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
  musicDurations,
  trackMix,
  resolveMedia,
  onToggleTrackMute,
  onToggleTrackSolo,
  onSetTrackLevel,
  onFocusInspectorTab,
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
  onExecuteDelete,
  onDropFile,
  onDropImageAsset,
  onDropAudioAsset,
  resolvedAudioClips = [],
  audioDurations,
  multiSelection = EMPTY_MULTI_SELECTION,
  onSetMultiSelection,
  onClearAllSelection,
  onSelectAudioClip,
  onPreviewUpdateAudioClip,
  onShiftSelectionPreview,
  onCommitSelectionShift,
  onSelectKeyframeDiamond,
  mediaBinOpen = false,
  onToggleMediaBin,
  showCaptions = true,
  onToggleShowCaptions,
  selectedCaption = null,
  canMergeCaptions = false,
  onSelectCaption,
  onClearCaptionSelection,
  onCommitCaptions,
  onCaptionPreview,
  onMergeCaptions,
  onDeleteCaptions,
}: TimelineProps) {
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const [scrollLeft, setScrollLeft] = useState(() =>
    Math.max(0, playheadFrame * DEFAULT_PX_PER_FRAME - 300),
  );
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const captionsLaneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const audioLaneRefs = useRef<Partial<Record<AudioLaneId, HTMLDivElement | null>>>({});
  const audioLaneRefSetters = useMemo<
    Partial<Record<AudioLaneId, (el: HTMLDivElement | null) => void>>
  >(
    () => ({
      voice: (el) => {
        audioLaneRefs.current.voice = el;
      },
      sfx: (el) => {
        audioLaneRefs.current.sfx = el;
      },
      music: (el) => {
        audioLaneRefs.current.music = el;
      },
      ambience: (el) => {
        audioLaneRefs.current.ambience = el;
      },
    }),
    [],
  );
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

  const prevPlayheadForScrollRef = useRef(playheadFrame);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !clips.length) return;
    if (!initialCenteredRef.current) {
      initialCenteredRef.current = true;
      prevPlayheadForScrollRef.current = playheadFrame;
      centerFrameInView(playheadFrame, pxPerFrame);
      return;
    }
    if (prevPlayheadForScrollRef.current === playheadFrame) return;
    prevPlayheadForScrollRef.current = playheadFrame;
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

  // Sub-frame millisecond ticks when zoomed far in (Section A.4)
  const subFrameMsTicks = useMemo(() => {
    const pxPerMs = (pxPerFrame * FPS) / 1000;
    if (pxPerMs < 0.75) return [] as Array<{ ms: number; leftPx: number; label?: string }>;
    const stepMs = pxPerMs >= 8 ? 2 : pxPerMs >= 3 ? 5 : 10;
    const minMs = Math.max(0, Math.floor(((minVisibleFrame * 1000) / FPS) / stepMs) * stepMs);
    const maxMs = Math.min((totalFrames * 1000) / FPS, (maxVisibleFrame * 1000) / FPS);
    const out: Array<{ ms: number; leftPx: number; label?: string }> = [];
    for (let ms = minMs; ms <= maxMs; ms += stepMs) {
      // Skip if right on top of a whole-frame tick
      const nearestFrameMs = (Math.round((ms * FPS) / 1000) * 1000) / FPS;
      if (Math.abs(ms - nearestFrameMs) < 0.8) continue;
      const showLabel = ms % (stepMs * 5) === 0 && stepMs * 5 * pxPerMs >= 52;
      out.push({
        ms,
        leftPx: ms * pxPerMs,
        label: showLabel ? `.${String(ms % 1000).padStart(3, "0")}ms` : undefined,
      });
      if (out.length >= 450) break;
    }
    return out;
  }, [pxPerFrame, minVisibleFrame, maxVisibleFrame, totalFrames]);

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

      onClearCaptionSelection?.();
      onSetSelection([id], id, clickedFrame);
      onFocusInspectorTab?.("clip");
    },
    [
      clips,
      frameFromClientX,
      onClearCaptionSelection,
      onFocusInspectorTab,
      onSetSelection,
      selectedFrameId,
      selectedFrameIds,
    ],
  );

  // Multi-lane marquee box-select over empty space on ANY lane (Section C)
  const marqueeSession = useRef<{
    startX: number;
    startY: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    mode: "replace" | "add" | "subtract";
    baseSelection: MultiLaneSelection;
    bands: TimelineLaneBands;
  } | null>(null);

  const measureLaneBands = useCallback((): TimelineLaneBands => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return {};
    const cRect = canvasEl.getBoundingClientRect();
    const bandOf = (el: HTMLElement | null | undefined) => {
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return { top: r.top - cRect.top + 3, bottom: r.bottom - cRect.top - 3 };
    };
    return {
      captions: bandOf(captionsLaneRef.current),
      video: bandOf(trackRef.current),
      voice: bandOf(audioLaneRefs.current.voice),
      sfx: bandOf(audioLaneRefs.current.sfx),
      music: bandOf(audioLaneRefs.current.music),
      ambience: bandOf(audioLaneRefs.current.ambience),
    };
  }, []);

  const beginMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const targetEl = event.target as HTMLElement | null;
    if (
      targetEl?.closest(
        ".timeline-ruler, .timeline-playhead, .timeline-clip, .caption-block, .audio-clip-box, .timeline-transition-box, .timeline-roll-handle, .transition-kind-popover, button, input, textarea, select",
      )
    ) {
      return;
    }
    event.preventDefault();
    setTransitionPopover(null);
    const scrollEl = scrollRef.current;
    const canvasEl = canvasRef.current;
    if (!scrollEl || !canvasEl) return;
    const canvasRect = canvasEl.getBoundingClientRect();
    const x = event.clientX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
    const y = event.clientY - canvasRect.top;
    const mode: "replace" | "add" | "subtract" = event.altKey
      ? "subtract"
      : event.shiftKey || event.ctrlKey || event.metaKey
        ? "add"
        : "replace";

    marqueeSession.current = {
      startX: x,
      startY: y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      mode,
      baseSelection: multiSelection,
      bands: measureLaneBands(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = marqueeSession.current;
    const scrollEl = scrollRef.current;
    const canvasEl = canvasRef.current;
    if (!session || !scrollEl || !canvasEl) return;
    const dx = event.clientX - session.startClientX;
    const dy = event.clientY - session.startClientY;
    if (!session.moved && Math.hypot(dx, dy) < 4) return;
    session.moved = true;

    const canvasRect = canvasEl.getBoundingClientRect();
    const x = event.clientX - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
    const y = event.clientY - canvasRect.top;
    const rect = { x1: session.startX, y1: session.startY, x2: x, y2: y };
    setMarquee(rect);

    const hit = hitTestMarqueeBox(
      rect,
      session.bands,
      clips,
      resolvedAudioClips,
      pxPerFrame,
    );
    const combined = combineMarqueeSelections(session.baseSelection, hit, session.mode);
    if (onSetMultiSelection) {
      const primary =
        combined.pictureIds.includes(selectedFrameId)
          ? selectedFrameId
          : combined.pictureIds[0];
      onSetMultiSelection(combined, primary);
    } else if (combined.pictureIds.length > 0) {
      const primary = combined.pictureIds.includes(selectedFrameId)
        ? selectedFrameId
        : combined.pictureIds[0];
      onSetSelection(combined.pictureIds, primary);
    }
  };

  const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = marqueeSession.current;
    marqueeSession.current = null;
    setMarquee(null);
    if (!session) return;
    if (!session.moved && session.mode === "replace") {
      onClearAllSelection?.();
      onScrub(frameFromClientX(event.clientX));
    }
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
    alignment: TransitionAlignment;
    cutFrame: number;
    maxFrames: number;
    side: "left" | "right";
    initialFrames: number;
    startX: number;
    targets: ReturnType<typeof collectSnapTargets>;
  } | null>(null);

  const effectiveMix = useMemo(() => trackMix ?? createDefaultTrackMix(), [trackMix]);
  const videoSilenced = effectiveTrackLevel(effectiveMix, "video") === 0;

  const trackWidth = Math.max(viewportWidth, Math.ceil(totalFrames * pxPerFrame) + 160);

  const popoverIncomingClip = useMemo(
    () =>
      transitionPopover
        ? clips.find((c) => c.keyframe.id === transitionPopover.incomingId) ?? null
        : null,
    [clips, transitionPopover],
  );
  const popoverOutgoingClip = useMemo(
    () =>
      popoverIncomingClip && popoverIncomingClip.index > 0
        ? clips[popoverIncomingClip.index - 1] ?? null
        : null,
    [clips, popoverIncomingClip],
  );
  const popoverSpec = useMemo(() => {
    if (!popoverIncomingClip || !transitionPopover) return null;
    const rawAlign: TransitionAlignment =
      popoverIncomingClip.keyframe.beat.transitionUserAdded &&
      popoverIncomingClip.keyframe.beat.backgroundTransitionAlign === "centred"
        ? "centred"
        : "at-cut";
    const maxLen = popoverOutgoingClip
      ? maxTransitionFramesForCut(popoverOutgoingClip, popoverIncomingClip, rawAlign)
      : transitionPopover.maxFrames;
    return readCutTransition(popoverIncomingClip.keyframe, maxLen);
  }, [popoverIncomingClip, popoverOutgoingClip, transitionPopover]);

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
          {onToggleMediaBin && (
            <button
              type="button"
              className={`button button-quiet ${mediaBinOpen ? "is-active-tool" : ""}`}
              data-testid="media-bin-toggle"
              aria-pressed={mediaBinOpen}
              onClick={onToggleMediaBin}
              title="Toggle Media Bin (drag pictures onto shots or gaps, sounds onto audio lanes)"
            >
              ▣ Bin
            </button>
          )}
          <button
            type="button"
            className={`button button-quiet ${snapEnabled ? "is-active-tool" : ""}`}
            data-testid="snap-toggle"
            aria-pressed={snapEnabled}
            onClick={onToggleSnap}
            title="Toggle magnetic snapping within 8px (N) — hold Ctrl/Cmd to ignore"
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
            title="Copy selected items across lanes (Ctrl/Cmd+C)"
          >
            Copy
            {multiSelection.pictureIds.length +
              multiSelection.audioClipIds.length +
              multiSelection.captions.length >
            1
              ? ` (${multiSelection.pictureIds.length + multiSelection.audioClipIds.length + multiSelection.captions.length})`
              : ""}
          </button>
          <button
            type="button"
            className="button button-quiet"
            disabled={!hasClipboard}
            onClick={onPaste}
            title="Paste copied items at playhead (Ctrl/Cmd+V)"
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
          {canMergeCaptions && (
            <button
              type="button"
              className="button button-quiet is-active-tool"
              data-testid="toolbar-merge-captions-btn"
              onClick={() => onMergeCaptions?.()}
              title="Merge the two selected neighbouring captions"
            >
              Merge
            </button>
          )}
          <button
            type="button"
            className="button button-quiet danger-quiet"
            data-testid="toolbar-delete-btn"
            onClick={(event) => {
              if (onExecuteDelete) {
                onExecuteDelete(event.shiftKey);
              } else if (selectedCaption && selectedCaption.indices.length > 0 && onDeleteCaptions) {
                onDeleteCaptions();
              } else {
                onDelete();
              }
            }}
            title="Delete selection (Delete lifts picture to black gap; Shift+Delete ripple-deletes shot & anchored sounds)"
          >
            Delete
          </button>
          <span
            className="timeline-tc-badge"
            data-testid="timeline-timecode"
            title={`Millisecond time: ${formatMsTimecode((playheadFrame * 1000) / FPS)}`}
          >
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

      <div className="timeline-body">
        <aside className="timeline-track-headers" data-testid="timeline-track-headers" aria-label="Track headers">
          <div className="track-header-ruler">
            <span>TRACKS</span>
          </div>
          <div
            className={`track-header-row is-captions ${!showCaptions ? "is-silenced" : ""}`}
            data-testid="track-header-captions"
          >
            <div className="track-header-top">
              <button
                type="button"
                className="track-header-title"
                onClick={() => onFocusInspectorTab?.("clip")}
                title="Open Caption section in Inspector"
              >
                <i aria-hidden>CC</i> Captions
              </button>
              <div className="track-header-btns">
                {canMergeCaptions && (
                  <button
                    type="button"
                    className="track-caption-merge-btn"
                    data-testid="merge-captions-btn"
                    onClick={() => onMergeCaptions?.()}
                    title="Merge two neighbouring captions"
                  >
                    Merge
                  </button>
                )}
                <button
                  type="button"
                  className={`track-ms-btn is-cc ${showCaptions ? "is-active" : ""}`}
                  data-testid="track-toggle-captions"
                  aria-label="Toggle captions in viewer"
                  aria-pressed={showCaptions}
                  title={showCaptions ? "Hide captions in viewer" : "Show captions in viewer"}
                  onClick={() => onToggleShowCaptions?.()}
                >
                  CC
                </button>
              </div>
            </div>
          </div>
          {TRACK_HEADERS.map((header) => {
            const state = effectiveMix[header.id];
            const effective = effectiveTrackLevel(effectiveMix, header.id);
            return (
              <div
                key={header.id}
                className={`track-header-row is-${header.id} ${effective === 0 ? "is-silenced" : ""}`}
                data-testid={`track-header-${header.id}`}
              >
                <div className="track-header-top">
                  <button
                    type="button"
                    className="track-header-title"
                    onClick={() => onFocusInspectorTab?.(header.id === "video" ? "clip" : header.id)}
                    title={`Open ${header.label} settings in Inspector`}
                  >
                    <i aria-hidden>{header.icon}</i> {header.label}
                  </button>
                  <div className="track-header-btns">
                    <button
                      type="button"
                      className={`track-ms-btn is-mute ${state.mute ? "is-active" : ""}`}
                      data-testid={`track-mute-${header.id}`}
                      aria-label={`Mute ${header.label}`}
                      aria-pressed={state.mute}
                      title={`Mute ${header.label}`}
                      onClick={() => onToggleTrackMute?.(header.id)}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className={`track-ms-btn is-solo ${state.solo ? "is-active" : ""}`}
                      data-testid={`track-solo-${header.id}`}
                      aria-label={`Solo ${header.label}`}
                      aria-pressed={state.solo}
                      title={`Solo ${header.label}`}
                      onClick={() => onToggleTrackSolo?.(header.id)}
                    >
                      S
                    </button>
                  </div>
                </div>
                <label className="track-header-level">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={state.level}
                    aria-label={`${header.label} level`}
                    data-testid={`track-level-${header.id}`}
                    onChange={(event) => onSetTrackLevel?.(header.id, Number(event.target.value))}
                  />
                  <span>{Math.round(state.level * 100)}%</span>
                </label>
              </div>
            );
          })}
        </aside>

        <div
          ref={scrollRef}
          className="timeline-scroll-area"
          data-testid="timeline-scroll"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
        <div
          ref={canvasRef}
          className="timeline-canvas"
          style={{ width: trackWidth }}
          onPointerDown={beginMarquee}
          onPointerMove={moveMarquee}
          onPointerUp={endMarquee}
          onPointerCancel={() => {
            marqueeSession.current = null;
            setMarquee(null);
          }}
        >
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

            {subFrameMsTicks.map((sub) => (
              <span
                key={`ms-${sub.ms}`}
                className="ruler-tick is-subframe"
                data-testid={sub.label ? `ruler-subtick-${sub.ms}` : undefined}
                style={{ left: sub.leftPx }}
              >
                {sub.label && <i className="ruler-subtick-label">{sub.label}</i>}
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

          <CaptionLane
            laneRef={(el) => {
              captionsLaneRef.current = el;
            }}
            visibleClips={visibleClips}
            pxPerFrame={pxPerFrame}
            playheadFrame={playheadFrame}
            snapEnabled={snapEnabled}
            selectedFrameId={selectedFrameId}
            selectedCaption={selectedCaption}
            multiSelectedCaptions={multiSelection.captions}
            rawFrameFromClientX={rawFrameFromClientX}
            onSetSnapGuide={setSnapGuideFrame}
            onSelectCaption={(frameId, captionIndex, extendNeighbour, targetFrame) =>
              onSelectCaption?.(frameId, captionIndex, extendNeighbour, targetFrame)
            }
            onClearCaptionSelection={() => onClearCaptionSelection?.()}
            onCommitCaptions={(
              frameId,
              captions,
              clipDurationFrames,
              label,
              nextSelectedIndices,
            ) =>
              onCommitCaptions?.(
                frameId,
                captions,
                clipDurationFrames,
                label,
                nextSelectedIndices,
              )
            }
            onCaptionPreview={(frameId, captions, clipDurationFrames) =>
              onCaptionPreview?.(frameId, captions, clipDurationFrames)
            }
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />

          <div
            ref={trackRef}
            className={`timeline-picture-track ${videoSilenced ? "is-silenced" : ""}`}
            data-testid="picture-track"
          >
            {visibleClips.map((clip) => {
              const rawSrc = resolveMedia(clip.keyframe.picture);
              const imageThumb =
                !clip.keyframe.beat.gap &&
                rawSrc &&
                !rawSrc.startsWith("gradient:") &&
                !rawSrc.startsWith("emoji:")
                  ? rawSrc
                  : undefined;
              const prevClip = clip.index > 0 ? clips[clip.index - 1] : undefined;
              const rawAlign: TransitionAlignment =
                clip.keyframe.beat.transitionUserAdded &&
                clip.keyframe.beat.backgroundTransitionAlign === "centred"
                  ? "centred"
                  : "at-cut";
              const maxTransFrames = prevClip
                ? maxTransitionFramesForCut(prevClip, clip, rawAlign)
                : 0;
              const cutTrans = prevClip ? readCutTransition(clip.keyframe, maxTransFrames) : undefined;
              const hasCoSelectedOtherLanes =
                multiSelection.audioClipIds.length > 0 || multiSelection.captions.length > 0;

              return (
                <Fragment key={`clip-wrap-${clip.keyframe.sceneId}:${clip.keyframe.id}:${clip.index}`}>
                  <ClipItem
                    clip={clip}
                    clips={clips}
                    pxPerFrame={pxPerFrame}
                    snapEnabled={snapEnabled}
                    isSelected={selectedFrameId === clip.keyframe.id}
                    isMulti={
                      selectedFrameIds.includes(clip.keyframe.id) ||
                      multiSelection.pictureIds.includes(clip.keyframe.id)
                    }
                    selectedFrameIds={selectedFrameIds}
                    selectedDiamonds={multiSelection.keyframes}
                    hasCoSelectedOtherLanes={hasCoSelectedOtherLanes}
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
                    onShiftSelectionPreview={onShiftSelectionPreview}
                    onCommitSelectionShift={onCommitSelectionShift}
                    onAnimationPreview={onAnimationPreview}
                    onSelectKeyframeDiamond={onSelectKeyframeDiamond}
                    onDropFile={onDropFile}
                    onDropImageAsset={onDropImageAsset}
                  />

                  {prevClip && cutTrans && (
                    <>
                      {/* Transition box (at-cut by default; centred opt-in on user-added transitions) */}
                      {(() => {
                        const cutFrame = clip.startFrame;
                        const isCut = cutTrans.kind === "cut";
                        const win = getTransitionWindow(
                          cutFrame,
                          cutTrans.durationFrames,
                          cutTrans.alignment,
                        );
                        const rawWidth = cutTrans.durationFrames * pxPerFrame;
                        const width = isCut ? 12 : Math.max(20, rawWidth);
                        const left = isCut
                          ? cutFrame * pxPerFrame - 6
                          : cutTrans.alignment === "centred"
                            ? rawWidth >= 20
                              ? win.startFrame * pxPerFrame
                              : cutFrame * pxPerFrame - 10
                            : win.startFrame * pxPerFrame;
                        const kindMeta = TRANSITION_KINDS.find((t) => t.kind === cutTrans.kind);

                        return (
                          <div
                            className={`timeline-transition-box ${isCut ? "is-cut-badge" : `is-${cutTrans.kind}`}`}
                            data-testid={`transition-box-${clip.keyframe.id}`}
                            data-transition-kind={cutTrans.kind}
                            data-transition-frames={cutTrans.durationFrames}
                            data-transition-align={cutTrans.alignment}
                            style={{ left, width }}
                            title={
                              isCut
                                ? "Cut — double-click to add dissolve, dip to black, or wipe"
                                : `${kindMeta?.label || cutTrans.kind} (${cutTrans.durationFrames}f, ${cutTrans.alignment === "centred" ? "centred" : "at cut"}) — drag edge to resize, double-click to change`
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
                            {!isCut && cutTrans.alignment === "centred" && (
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
                                    alignment: cutTrans.alignment,
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
                                  onSetTransition(s.incomingId, s.kind, nextLen, true, s.alignment);
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
                                    alignment: cutTrans.alignment,
                                    cutFrame,
                                    maxFrames: Math.max(1, maxTransFrames),
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
                                  if (s.alignment === "centred") {
                                    const half = Math.max(1, Math.round(snapped.frame - s.cutFrame));
                                    const nextLen = Math.max(2, Math.min(s.maxFrames, half * 2));
                                    onSetTransition(s.incomingId, s.kind, nextLen, true, s.alignment);
                                  } else {
                                    const nextLen = Math.max(
                                      1,
                                      Math.min(s.maxFrames, Math.round(snapped.frame - s.cutFrame)),
                                    );
                                    onSetTransition(s.incomingId, s.kind, nextLen, true, s.alignment);
                                  }
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
                </Fragment>
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
                        onSetTransition(
                          transitionPopover.incomingId,
                          option.kind,
                          frames,
                          false,
                          option.kind === "cut" ? undefined : popoverSpec.alignment,
                        );
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {popoverSpec.kind !== "cut" && (
                  <>
                    <label className="transition-frames-field">
                      <span>Length (frames)</span>
                      <input
                        type="number"
                        data-testid="transition-frames-input"
                        min={1}
                        max={
                          popoverOutgoingClip
                            ? maxTransitionFramesForCut(
                                popoverOutgoingClip,
                                popoverIncomingClip,
                                popoverSpec.alignment,
                              )
                            : transitionPopover.maxFrames
                        }
                        value={popoverSpec.durationFrames}
                        onChange={(e) => {
                          const maxAllowed = popoverOutgoingClip
                            ? maxTransitionFramesForCut(
                                popoverOutgoingClip,
                                popoverIncomingClip,
                                popoverSpec.alignment,
                              )
                            : transitionPopover.maxFrames;
                          const next = Math.max(
                            1,
                            Math.min(maxAllowed, Number(e.target.value) || 1),
                          );
                          onSetTransition(
                            transitionPopover.incomingId,
                            popoverSpec.kind,
                            next,
                            false,
                            popoverSpec.alignment,
                          );
                        }}
                      />
                    </label>
                    {popoverSpec.userAdded && (
                      <div className="transition-align-field" data-testid="transition-align-options">
                        <span>Placement</span>
                        <div className="transition-align-btns">
                          <button
                            type="button"
                            data-testid="transition-align-at-cut"
                            className={`transition-kind-btn ${popoverSpec.alignment === "at-cut" ? "is-active" : ""}`}
                            onClick={() =>
                              onSetTransition(
                                transitionPopover.incomingId,
                                popoverSpec.kind,
                                popoverSpec.durationFrames,
                                false,
                                "at-cut",
                              )
                            }
                          >
                            At cut
                          </button>
                          <button
                            type="button"
                            data-testid="transition-align-centred"
                            className={`transition-kind-btn ${popoverSpec.alignment === "centred" ? "is-active" : ""}`}
                            onClick={() =>
                              onSetTransition(
                                transitionPopover.incomingId,
                                popoverSpec.kind,
                                popoverSpec.durationFrames,
                                false,
                                "centred",
                              )
                            }
                          >
                            Centred
                          </button>
                        </div>
                      </div>
                    )}
                  </>
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

          </div>

          <Tracks
            clips={clips}
            resolvedAudioClips={resolvedAudioClips}
            selectedAudioClipIds={multiSelection.audioClipIds}
            totalFrames={totalFrames}
            playheadFrame={playheadFrame}
            pxPerFrame={pxPerFrame}
            scrollLeft={scrollLeft}
            viewportWidth={viewportWidth}
            minVisibleFrame={minVisibleFrame}
            maxVisibleFrame={maxVisibleFrame}
            snapEnabled={snapEnabled}
            noteMarkers={noteMarkers}
            audioDurations={audioDurations ?? musicDurations}
            trackMix={effectiveMix}
            resolveMedia={resolveMedia}
            laneRefs={audioLaneRefSetters}
            onSetSnapGuide={setSnapGuideFrame}
            onSelectAudioClip={(clip, additive, targetFrame) => {
              onSelectAudioClip?.(clip, additive, targetFrame);
              onFocusInspectorTab?.(clip.lane);
            }}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onPreviewUpdateAudioClip={(clipId, updated) =>
              onPreviewUpdateAudioClip?.(clipId, updated)
            }
            onShiftAudioDragPreview={(deltaMs) => onShiftSelectionPreview?.(deltaMs)}
            onCommitAudioDrag={(deltaMs, copy) =>
              onCommitSelectionShift?.(
                deltaMs,
                copy,
                copy ? "Sound clip copied" : "Sound clip moved",
              )
            }
            onDropAudioAsset={onDropAudioAsset}
          />

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
  selectedDiamonds = [],
  hasCoSelectedOtherLanes = false,
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
  onShiftSelectionPreview,
  onCommitSelectionShift,
  onAnimationPreview,
  onSelectKeyframeDiamond,
  onDropFile,
  onDropImageAsset,
}: {
  clip: TimelineClip;
  clips: TimelineClip[];
  pxPerFrame: number;
  snapEnabled: boolean;
  isSelected: boolean;
  isMulti: boolean;
  selectedFrameIds: string[];
  selectedDiamonds?: ReadonlyArray<SelectedKeyframeDiamond>;
  hasCoSelectedOtherLanes?: boolean;
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
  onShiftSelectionPreview?: (deltaMs: number) => void;
  onCommitSelectionShift?: (deltaMs: number, copy: boolean, label?: string) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onSelectKeyframeDiamond?: (diamond: SelectedKeyframeDiamond, additive: boolean) => void;
  onDropFile: (file: File, frameId: string) => void;
  onDropImageAsset?: (ref: string, frameId: string) => void;
}) {
  const kf = clip.keyframe;
  const isGap = Boolean(kf.beat.gap);
  const width = Math.max(3, clip.durationFrames * pxPerFrame);
  const left = clip.startFrame * pxPerFrame;
  const isVoiceCut = !isGap && clip.voiceFrames > 0 && clip.durationFrames < clip.voiceFrames;
  const picture = kf.picture || "";
  const bgFallback = isGap
    ? undefined
    : picture.startsWith("gradient:")
      ? picture.slice(9)
      : storyboardGradient(picture).slice(9);

  const [dropHover, setDropHover] = useState(false);

  const moveSession = useRef<{
    startX: number;
    movingIds: string[];
    moved: boolean;
    shiftKey: boolean;
    modKey: boolean;
    multiShiftMode: boolean;
    lastDeltaMs: number;
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
        isGap ? "is-gap" : "",
        dropHover ? "is-drop-hover" : "",
        isSelected ? "is-selected" : "",
        isMulti ? "is-multi" : "",
        isVoiceCut ? "is-voice-cut" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left,
        width,
        background: isGap || thumbSrc ? undefined : bgFallback,
      }}
      data-testid={`timeline-clip-${kf.id}`}
      data-frame-id={kf.id}
      data-gap={isGap ? "true" : "false"}
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
        const multiShiftMode = Boolean(
          hasCoSelectedOtherLanes && isMulti && onShiftSelectionPreview && onCommitSelectionShift,
        );
        let movingIds = selectedFrameIds;
        if (!multiShiftMode && !shiftKey && !modKey && !selectedFrameIds.includes(kf.id)) {
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
          multiShiftMode,
          lastDeltaMs: 0,
        };
      }}
      onPointerMove={(event) => {
        const session = moveSession.current;
        if (!session) return;
        const dx = event.clientX - session.startX;
        if (!session.moved && Math.abs(dx) < 5) return;
        if (!session.moved) {
          session.moved = true;
          if (session.multiShiftMode) onDragStart();
        }

        if (session.multiShiftMode) {
          const deltaFrames = Math.round(dx / pxPerFrame);
          const deltaMs = (deltaFrames * 1000) / FPS;
          session.lastDeltaMs = deltaMs;
          onShiftSelectionPreview?.(deltaMs);
          return;
        }

        const effectiveSnap = snapEnabled && !(event.ctrlKey || event.metaKey);
        const rawFrame = rawFrameFromClientX(event.clientX);
        const excludeSet = event.altKey ? undefined : new Set(session.movingIds);
        const targets = getSnapTargetsForWindow(rawFrame, excludeSet);
        const snapped = snapFrame(rawFrame, targets, pxPerFrame, effectiveSnap);
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
        if (session.moved && session.multiShiftMode) {
          onCommitSelectionShift?.(session.lastDeltaMs, false, "Selection moved");
        } else if (session.moved && session.lastSlot) {
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
        const session = moveSession.current;
        moveSession.current = null;
        onSetSnapGuide(null);
        onSetMoveOverlay(null);
        if (session?.moved && session.multiShiftMode) onDragEnd("");
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!dropHover) setDropHover(true);
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropHover(false);
        const draggedAsset = decodeDraggedAsset(event);
        if (draggedAsset && draggedAsset.kind === "image" && onDropImageAsset) {
          onDropImageAsset(draggedAsset.ref, kf.id);
          return;
        }
        const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) onDropFile(file, kf.id);
      }}
      title={
        isGap
          ? `Gap · drop a picture (${clip.durationFrames}f · ${formatTimecode(clip.startFrame)}) — press Delete to close gap`
          : isVoiceCut
            ? `SC ${kf.mark} / ${kf.number} — Picture (${clip.durationFrames}f) ends before voice (${clip.voiceFrames}f)`
            : `SC ${kf.mark} / ${kf.number} · ${formatTimecode(clip.startFrame)} (${clip.durationFrames}f) — drag to move, Alt+drag to copy`
      }
    >
      {thumbSrc && <img className="timeline-clip-thumb" src={thumbSrc} alt="" loading="lazy" decoding="async" />}

      {isGap ? (
        <div className="timeline-gap-label" data-testid={`gap-label-${kf.id}`}>
          <span>Gap · drop a picture</span>
        </div>
      ) : (
        width >= 18 && (
          <div className="timeline-clip-overlay">
            <span className="timeline-clip-mark">{kf.mark}</span>
            {kf.beat.audioUrl && width >= 38 && (
              <span className="timeline-clip-vox-badge" title={`Voice: ${kf.beat.audioUrl}`}>
                ◉
              </span>
            )}
            {width >= 52 && (
              <span className="timeline-clip-label">
                {pictureLabel(picture, true, kf.speaker || "No picture")}
              </span>
            )}
          </div>
        )
      )}

      {(isSelected || selectedDiamonds.some((d) => d.frameId === kf.id)) && anim && (
        <div className="timeline-clip-keyframes">
          {(["zoom", "x", "y"] as const).map((prop) =>
            (anim[prop] ?? []).map((key) => {
              const clampedFrame = Math.max(0, Math.min(clip.durationFrames - 1, key.frame));
              const keyLeftPx = Math.max(
                5,
                Math.min(Math.max(5, width - 11), (clampedFrame + 0.5) * pxPerFrame),
              );
              const isDiamondSelected = selectedDiamonds.some(
                (d) => d.frameId === kf.id && d.prop === prop && d.frame === key.frame,
              );
              return (
                <button
                  type="button"
                  key={`${prop}-${key.frame}`}
                  className={`clip-key-diamond prop-${prop} ${isDiamondSelected ? "is-selected" : ""}`}
                  data-testid={`clip-diamond-${prop}-${key.frame}`}
                  style={{ left: keyLeftPx }}
                  title={`${prop}: ${key.value} @ +${key.frame}f (${key.easing}) — click to select, Delete to remove`}
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
                    const effectiveSnap = snapEnabled && !(event.ctrlKey || event.metaKey);
                    const rawAbsFrame = clip.startFrame + session.initialFrame + dx / pxPerFrame;
                    const targets = getSnapTargetsForWindow(rawAbsFrame, undefined, false, {
                      clipId: kf.id,
                      prop: session.prop,
                      frame: session.initialFrame,
                    });
                    const snapped = snapFrame(rawAbsFrame, targets, pxPerFrame, effectiveSnap);
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
                      onSelectKeyframeDiamond?.(
                        { frameId: kf.id, prop: session.prop, frame: session.initialFrame },
                        event.shiftKey,
                      );
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
          const effectiveSnap = snapEnabled && !(event.ctrlKey || event.metaKey);
          const rawEndFrame = session.initialEndFrame + (event.clientX - session.startX) / pxPerFrame;
          const snapped = snapFrame(rawEndFrame, session.targets, pxPerFrame, effectiveSnap);
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
