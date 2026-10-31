import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type {
  BeatCaption,
  ResolvedTimelineCaption,
} from "../core/captions";
import {
  clampLaneHeight,
  computeVisibleCutoutSublaneCount,
  createCompactLaneHeights,
  createDefaultLaneHeights,
  extractClipDepthInfo,
  LANE_HEIGHT_SPECS,
  MAX_DEPTH_CUTOUTS,
  parseStoredHiddenLanes,
  parseStoredLaneHeights,
  TIMELINE_LANE_ORDER,
  type ResizableLaneKey,
  type TimelineLaneId,
} from "../core/depthLanes";
import { FPS, formatTimecode, MIN_CLIP_FRAMES } from "../core/timing";
import { CaptionLane, type SelectedCaptionState } from "./CaptionLane";
import {
  DepthCutoutCanvasLanes,
  DepthCutoutLaneHeaders,
  EyeIcon,
  LaneEyeButton,
  LaneResizeHandle,
  type SelectedCutoutLayerState,
} from "./DepthCutoutLanes";
import type { BrowseMediaTarget, InspectorTab, UploadMediaTarget } from "./Inspector";
import { decodeDraggedAsset } from "./MediaBin";
import { Tracks } from "./Tracks";
import {
  ANIM_PROP_META,
  ANIM_PROPS,
  animatedPropsOf,
  clipAtFrame,
  copyKeyToFrame,
  defaultValueForProp,
  evaluateChannel,
  moveKeyToFrame,
  setKeyEasingAtFrame,
  visibleClipRange,
  type AnimProp,
  type KeyEasing,
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
  /** Resize-leaves-gaps mode: trimming shorter opens/extends a black gap instead of shifting later keyframes. */
  resizeLeaveGaps?: boolean;
  onToggleResizeLeaveGaps?: () => void;
  /** Nudges the given picture keyframes one slot earlier/later in running order (context menu). */
  onNudgeClips?: (frameIds: string[], delta: -1 | 1) => void;
  /** Duplicates the current/selected picture keyframe (context menu). */
  onDuplicateFrame?: () => void;
  onAddNoteMarker: () => void;
  onUpdateNoteMarker: (markerId: string, name: string) => void;
  onDeleteNoteMarker: (markerId: string) => void;
  onCloseMarkerEditor: () => void;
  onEditMarker: (markerId: string) => void;
  onScrub: (frame: number) => void;
  onSetSelection: (ids: string[], primaryId: string, targetFrame?: number) => void;
  onSelectAllImages?: () => void;
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
  onCommitAnimation?: (
    frameId: string,
    animation: BeatAnimation | undefined,
    label: string,
  ) => void;
  onOpenCurveEditor?: (frameId: string, prop: AnimProp) => void;
  onCopy: () => void;
  onPaste: () => void;
  onSplit: () => void;
  canMergeFrames?: boolean;
  onMergeFrames?: () => void;
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
  resolvedCaptions?: ResolvedTimelineCaption[];
  onBeginFreeCaptionDrag?: () => void;
  onPreviewFreeCaptionMove?: (
    sourceFrameId: string,
    captionIndex: number,
    targetGlobalInFrame: number,
    targetGlobalOutFrame: number,
    copy: boolean,
  ) => void;
  onCommitFreeCaptionMove?: (label: string) => void;
  onCancelFreeCaptionMove?: () => void;
  onMergeCaptions?: () => void;
  onDeleteCaptions?: () => void;
  showDepthMaps?: boolean;
  onToggleShowDepthMaps?: () => void;
  showDepthMapOverlay?: boolean;
  onToggleShowDepthMapOverlay?: () => void;
  showCutouts?: boolean;
  onToggleShowCutouts?: () => void;
  mutedCutoutLayers?: ReadonlySet<number>;
  onToggleMuteCutoutLayer?: (layerIndex: number) => void;
  onBrowseMediaForFrame?: (frameId: string, target: BrowseMediaTarget) => void;
  onUploadMediaForFrame?: (frameId: string, target: UploadMediaTarget) => void;
  onAssignDepthMap?: (frameId: string, ref: string | undefined, label?: string) => void;
  onAssignDepthPlate?: (frameId: string, ref: string | undefined, label?: string) => void;
  onDropDepthFile?: (file: File, frameId: string) => void;
  onAddCutout?: (frameId: string, ref: string) => void;
  onSetCutoutLayer?: (
    frameId: string,
    layerIndex: number,
    cutout: { image: string; depth?: number } | null,
    label?: string,
  ) => void;
  onDropCutoutFile?: (file: File, frameId: string, layerIndex?: number) => void;
  onPreviewCutoutDepth?: (frameId: string, layerIndex: number, depth: number) => void;
  onCommitCutoutDepth?: (
    frameId: string,
    layerIndex: number,
    depth: number,
    label?: string,
  ) => void;
  onMoveCutoutLayer?: (frameId: string, fromLayer: number, toLayer: number) => void;
  onClearCutouts?: (frameId: string) => void;
  inPointFrame?: number | null;
  outPointFrame?: number | null;
  loopPlayback?: boolean;
  onSetInPoint?: (frame: number | null) => void;
  onSetOutPoint?: (frame: number | null) => void;
  onClearInOut?: () => void;
  onToggleLoop?: () => void;
}

const MIN_PX_PER_FRAME = 0.08;
const MAX_PX_PER_FRAME = 160;
const DEFAULT_PX_PER_FRAME = 1.6;
const DEFAULT_TRACK_HEADER_WIDTH = 196;
const MIN_TRACK_HEADER_WIDTH = 136;
const MAX_TRACK_HEADER_WIDTH = 380;
const TRACK_HEADER_STORAGE_KEY = "frame24-track-header-width";
const LANE_HEIGHTS_STORAGE_KEY = "frame24-lane-heights";
const HIDDEN_LANES_STORAGE_KEY = "frame24-hidden-lanes";
const TICK_INTERVALS = [1, 2, 4, 6, 12, 24, 48, 120, 240, 360, 720, 1440, 2880, 7200];

function chooseMajorTickFrames(pxPerFrame: number): number {
  for (const step of TICK_INTERVALS) {
    if (step * pxPerFrame >= 92) return step;
  }
  return 7200;
}

export function findTimelineShots(clips: readonly TimelineClip[], query: string): TimelineClip[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: TimelineClip[] = [];
  for (const clip of clips) {
    const kf = clip.keyframe;
    if (`${kf.mark} ${kf.speaker} ${kf.text} ${kf.picture || ""} ${kf.scene.title || ""} ${kf.beat.shotDescription || ""}`.toLowerCase().includes(q)) {
      results.push(clip);
      if (results.length >= 40) break;
    }
  }
  return results;
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
  resizeLeaveGaps = false,
  onToggleResizeLeaveGaps,
  onNudgeClips,
  onDuplicateFrame,
  onAddNoteMarker,
  onUpdateNoteMarker,
  onDeleteNoteMarker,
  onCloseMarkerEditor,
  onEditMarker,
  onScrub,
  onSetSelection,
  onSelectAllImages,
  onDragStart,
  onDragEnd,
  onTrimPreview,
  onRollPreview,
  onMoveClips,
  onSetTransition,
  onAnimationPreview,
  onCommitAnimation,
  onOpenCurveEditor,
  onCopy,
  onPaste,
  onSplit,
  canMergeFrames = false,
  onMergeFrames,
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
  resolvedCaptions: resolvedCaptionsProp,
  onBeginFreeCaptionDrag,
  onPreviewFreeCaptionMove,
  onCommitFreeCaptionMove,
  onCancelFreeCaptionMove,
  onMergeCaptions,
  onDeleteCaptions,
  showDepthMaps: showDepthMapsProp,
  onToggleShowDepthMaps,
  showDepthMapOverlay: showDepthMapOverlayProp,
  onToggleShowDepthMapOverlay,
  showCutouts: showCutoutsProp,
  onToggleShowCutouts,
  mutedCutoutLayers: mutedCutoutLayersProp,
  onToggleMuteCutoutLayer,
  onBrowseMediaForFrame,
  onUploadMediaForFrame,
  onAssignDepthMap,
  onAssignDepthPlate,
  onDropDepthFile,
  onAddCutout,
  onSetCutoutLayer,
  onDropCutoutFile,
  onPreviewCutoutDepth,
  onCommitCutoutDepth,
  onMoveCutoutLayer,
  onClearCutouts,
  inPointFrame = null,
  outPointFrame = null,
  loopPlayback = false,
  onSetInPoint,
  onSetOutPoint,
  onClearInOut,
  onToggleLoop,
}: TimelineProps) {
  const [cutoutsExpanded, setCutoutsExpanded] = useState(false);
  const [manualCutoutSublanes, setManualCutoutSublanes] = useState(2);
  const [selectedCutoutLayer, setSelectedCutoutLayer] =
    useState<SelectedCutoutLayerState | null>(null);
  const [localShowDepthMaps, setLocalShowDepthMaps] = useState(true);
  const [localShowDepthMapOverlay, setLocalShowDepthMapOverlay] = useState(false);
  const [localShowCutouts, setLocalShowCutouts] = useState(true);
  const [localMutedCutoutLayers, setLocalMutedCutoutLayers] = useState<Set<number>>(
    () => new Set(),
  );

  const effectiveShowDepthMaps = showDepthMapsProp ?? localShowDepthMaps;
  const effectiveShowDepthMapOverlay = showDepthMapOverlayProp ?? localShowDepthMapOverlay;
  const effectiveShowCutouts = showCutoutsProp ?? localShowCutouts;
  const effectiveMutedCutoutLayers = mutedCutoutLayersProp ?? localMutedCutoutLayers;

  const handleToggleDepthMaps = useCallback(() => {
    if (onToggleShowDepthMaps) onToggleShowDepthMaps();
    else setLocalShowDepthMaps((v) => !v);
  }, [onToggleShowDepthMaps]);

  const handleToggleDepthMapOverlay = useCallback(() => {
    if (onToggleShowDepthMapOverlay) onToggleShowDepthMapOverlay();
    else setLocalShowDepthMapOverlay((v) => !v);
  }, [onToggleShowDepthMapOverlay]);

  const handleToggleCutouts = useCallback(() => {
    if (onToggleShowCutouts) onToggleShowCutouts();
    else setLocalShowCutouts((v) => !v);
  }, [onToggleShowCutouts]);

  const handleToggleMuteCutoutLayer = useCallback(
    (layerIndex: number) => {
      if (onToggleMuteCutoutLayer) {
        onToggleMuteCutoutLayer(layerIndex);
      } else {
        setLocalMutedCutoutLayers((prev) => {
          const next = new Set(prev);
          if (next.has(layerIndex)) next.delete(layerIndex);
          else next.add(layerIndex);
          return next;
        });
      }
    },
    [onToggleMuteCutoutLayer],
  );

  const cutoutSublaneCount = useMemo(
    () => computeVisibleCutoutSublaneCount(clips, manualCutoutSublanes),
    [clips, manualCutoutSublanes],
  );

  const { depthClipCount, cutoutClipCount } = useMemo(() => {
    let dCount = 0;
    let cCount = 0;
    for (const clip of clips) {
      if (clip.keyframe.beat.gap) continue;
      const info = extractClipDepthInfo(clip);
      if (info.depthMap) dCount += 1;
      if (info.activeCutouts.length > 0 || info.foregroundImage) cCount += 1;
    }
    return { depthClipCount: dCount, cutoutClipCount: cCount };
  }, [clips]);
  const [pxPerFrame, setPxPerFrame] = useState(DEFAULT_PX_PER_FRAME);
  const ioDragRef = useRef<{ which: "in" | "out"; pointerId: number; moved: boolean } | null>(null);
  const [trackHeaderWidth, setTrackHeaderWidth] = useState<number>(() => {
    try {
      const saved = Number(window.localStorage.getItem(TRACK_HEADER_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= MIN_TRACK_HEADER_WIDTH && saved <= MAX_TRACK_HEADER_WIDTH) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_TRACK_HEADER_WIDTH;
  });
  const headerResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [isResizingHeaders, setIsResizingHeaders] = useState(false);

  const [laneHeights, setLaneHeights] = useState<Record<ResizableLaneKey, number>>(() => {
    try {
      return parseStoredLaneHeights(window.localStorage.getItem(LANE_HEIGHTS_STORAGE_KEY));
    } catch {
      return createDefaultLaneHeights();
    }
  });
  const [hiddenLanes, setHiddenLanes] = useState<Set<TimelineLaneId>>(() => {
    try {
      return parseStoredHiddenLanes(window.localStorage.getItem(HIDDEN_LANES_STORAGE_KEY));
    } catch {
      return new Set();
    }
  });
  const [hiddenCutoutSublanes, setHiddenCutoutSublanes] = useState<Set<number>>(() => new Set());
  const [tracksPopoverPos, setTracksPopoverPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const tracksVisBtnRef = useRef<HTMLButtonElement | null>(null);
  const tracksPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANE_HEIGHTS_STORAGE_KEY, JSON.stringify(laneHeights));
    } catch {
      // ignore storage errors
    }
  }, [laneHeights]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_LANES_STORAGE_KEY, JSON.stringify([...hiddenLanes]));
    } catch {
      // ignore storage errors
    }
  }, [hiddenLanes]);

  useEffect(() => {
    if (!tracksPopoverPos) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        (tracksPopoverRef.current?.contains(target) || tracksVisBtnRef.current?.contains(target))
      ) {
        return;
      }
      setTracksPopoverPos(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTracksPopoverPos(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [tracksPopoverPos]);

  const handleResizeLane = useCallback((key: ResizableLaneKey, nextHeight: number) => {
    const clamped = clampLaneHeight(key, nextHeight);
    setLaneHeights((prev) => (prev[key] === clamped ? prev : { ...prev, [key]: clamped }));
  }, []);

  const handleResetLaneHeight = useCallback((key: ResizableLaneKey) => {
    const def = LANE_HEIGHT_SPECS[key].defaultHeight;
    setLaneHeights((prev) => (prev[key] === def ? prev : { ...prev, [key]: def }));
  }, []);

  const handleCompactLaneHeights = useCallback(() => {
    setLaneHeights(createCompactLaneHeights());
  }, []);

  const handleResetAllLaneHeights = useCallback(() => {
    setLaneHeights(createDefaultLaneHeights());
  }, []);

  const handleToggleLaneVisible = useCallback((lane: TimelineLaneId) => {
    setHiddenLanes((prev) => {
      const next = new Set(prev);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });
  }, []);

  const handleToggleCutoutSublaneVisible = useCallback((layerIndex: number) => {
    setHiddenCutoutSublanes((prev) => {
      const next = new Set(prev);
      if (next.has(layerIndex)) next.delete(layerIndex);
      else next.add(layerIndex);
      return next;
    });
  }, []);

  const handleShowAllCutoutSublanes = useCallback(() => {
    setHiddenCutoutSublanes(new Set());
  }, []);

  const handleShowAllLanes = useCallback(() => {
    setHiddenLanes(new Set());
    setHiddenCutoutSublanes(new Set());
  }, []);

  const hiddenSublaneVisibleCount = useMemo(() => {
    if (!cutoutsExpanded || hiddenLanes.has("cutouts")) return 0;
    let count = 0;
    for (let i = 0; i < cutoutSublaneCount; i += 1) {
      if (hiddenCutoutSublanes.has(i)) count += 1;
    }
    return count;
  }, [cutoutsExpanded, cutoutSublaneCount, hiddenCutoutSublanes, hiddenLanes]);

  const totalHiddenLaneCount = hiddenLanes.size + hiddenSublaneVisibleCount;
  const toggleTracksPopover = useCallback(() => {
    setTracksPopoverPos((prev) => {
      if (prev) return null;
      const rect = tracksVisBtnRef.current?.getBoundingClientRect();
      if (!rect) return { left: 12, top: 120 };
      const maxLeft = typeof window !== "undefined" ? Math.max(8, window.innerWidth - 248) : rect.left;
      const maxTop = typeof window !== "undefined" ? Math.max(8, window.innerHeight - 448) : rect.bottom + 4;
      return {
        left: Math.min(maxLeft, Math.max(8, rect.left)),
        top: Math.min(maxTop, rect.bottom + 4),
      };
    });
  }, []);
  const lastMultiCaptionDeltaMsRef = useRef(0);
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
  const [expandedClipIds, setExpandedClipIds] = useState<Set<string>>(() => new Set());
  const [diamondMenu, setDiamondMenu] = useState<{
    frameId: string;
    prop: AnimProp;
    frame: number;
    currentEasing: KeyEasing;
    clientX: number;
    clientY: number;
  } | null>(null);

  const toggleClipExpanded = useCallback((frameId: string) => {
    setExpandedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(frameId)) next.delete(frameId);
      else next.add(frameId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!diamondMenu) return;
    const close = () => setDiamondMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [diamondMenu]);

  const [clipMenu, setClipMenu] = useState<{
    frameId: string;
    clientX: number;
    clientY: number;
    isGap: boolean;
  } | null>(null);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const pictureInputTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!clipMenu) return;
    const close = () => setClipMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClipMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [clipMenu]);

  const openClipMenu = useCallback(
    (frameId: string, clientX: number, clientY: number, isGap: boolean) => {
      setClipMenu({ frameId, clientX, clientY, isGap });
    },
    [],
  );

  const openPicturePicker = useCallback((frameId: string) => {
    pictureInputTargetRef.current = frameId;
    pictureInputRef.current?.click();
  }, []);

  const openKeyframeProps = useMemo<AnimProp[]>(() => {
    if (expandedClipIds.size === 0) return [];
    const set = new Set<AnimProp>();
    for (const clip of clips) {
      if (!expandedClipIds.has(clip.keyframe.id)) continue;
      for (const prop of animatedPropsOf(clip.keyframe.beat.animation)) {
        set.add(prop);
      }
    }
    return ANIM_PROPS.filter((p) => set.has(p));
  }, [clips, expandedClipIds]);

  const hasExpandedWithoutKeys = useMemo(() => {
    if (expandedClipIds.size === 0 || openKeyframeProps.length > 0) return false;
    for (const clip of clips) {
      if (expandedClipIds.has(clip.keyframe.id)) return true;
    }
    return false;
  }, [clips, expandedClipIds, openKeyframeProps.length]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const captionsLaneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const kfLaneRefs = useRef<Partial<Record<AnimProp, HTMLDivElement | null>>>({});
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

  const pendingZoomScrollLeftRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingZoomScrollLeftRef.current === null) return;
    const targetLeft = pendingZoomScrollLeftRef.current;
    pendingZoomScrollLeftRef.current = null;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = targetLeft;
    }
    setScrollLeft(targetLeft);
  }, [pxPerFrame]);

  const zoomTimeline = useCallback((factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    const prevScale = pxPerFrameRef.current;
    const nextScale = Math.max(MIN_PX_PER_FRAME, Math.min(MAX_PX_PER_FRAME, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-6) return;
    const currentScroll =
      pendingZoomScrollLeftRef.current ?? (el ? el.scrollLeft : 0);
    const viewOffset =
      anchorX ??
      (el
        ? Math.min(el.clientWidth * 0.5, Math.max(40, playheadRef.current * prevScale - currentScroll))
        : 240);
    const anchorFrame = el ? (currentScroll + viewOffset) / prevScale : playheadRef.current;
    const nextLeft = Math.max(0, anchorFrame * nextScale - viewOffset);
    pxPerFrameRef.current = nextScale;
    pendingZoomScrollLeftRef.current = nextLeft;
    setPxPerFrame(nextScale);
    setScrollLeft(nextLeft);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      // Alt+wheel allows vertical scrolling when timeline lanes exceed dock height
      if (event.altKey) return;

      // Shift+wheel or horizontal trackpad swipe pans the timeline horizontally
      const isHorizontalSwipe =
        !(event.ctrlKey || event.metaKey) &&
        (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15);
      if (isHorizontalSwipe) {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (delta !== 0) {
          event.preventDefault();
          const next = Math.max(0, el.scrollLeft + delta);
          el.scrollLeft = next;
          setScrollLeft(next);
        }
        return;
      }

      // Plain vertical mouse wheel (or Ctrl/Cmd + wheel) zooms in/out anchored at cursor X
      if (event.deltaY === 0) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const pixelDelta =
        event.deltaMode === 1
          ? event.deltaY * 28
          : event.deltaMode === 2
            ? event.deltaY * 120
            : event.deltaY;
      const clampedDelta = Math.max(-240, Math.min(240, pixelDelta));
      const factor = Math.pow(1.0022, -clampedDelta);
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

  const searchMatches = useMemo(() => findTimelineShots(clips, search), [clips, search]);

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
      return { top: r.top - cRect.top + 2, bottom: r.bottom - cRect.top - 2 };
    };
    const keyframeLanes: TimelineLaneBands["keyframeLanes"] = {};
    for (const prop of ANIM_PROPS) {
      const b = bandOf(kfLaneRefs.current[prop]);
      if (b) keyframeLanes[prop] = b;
    }
    return {
      captions: bandOf(captionsLaneRef.current),
      video: bandOf(trackRef.current),
      keyframeLanes,
      expandedClipIds,
      voice: bandOf(audioLaneRefs.current.voice),
      sfx: bandOf(audioLaneRefs.current.sfx),
      music: bandOf(audioLaneRefs.current.music),
      ambience: bandOf(audioLaneRefs.current.ambience),
    };
  }, [expandedClipIds]);

  // Empty-space drag-to-pan (left/middle drag on empty space pans scrollLeft; Shift/Ctrl/Cmd/Alt drag box-selects)
  const [isPanningEmpty, setIsPanningEmpty] = useState(false);
  const [marqueeToolActive, setMarqueeToolActive] = useState(false);
  const panEmptySession = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);

  const beginEmptySpacePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const targetEl = event.target as HTMLElement | null;
    if (
      targetEl?.closest(
        ".timeline-ruler, .timeline-playhead, .timeline-clip, .caption-block, .depth-lane-block, .cutout-lane-block, .depth-cutout-context-menu, .lane-resize-handle, .tracks-visibility-popover, .audio-clip-box, .timeline-transition-box, .timeline-roll-handle, .transition-kind-popover, .kf-lane-diamond, .diamond-easing-menu, button, input, textarea, select",
      )
    ) {
      return;
    }
    setTransitionPopover(null);
    const scrollEl = scrollRef.current;
    const canvasEl = canvasRef.current;
    if (!scrollEl || !canvasEl) return;

    const wantsMarquee =
      event.button === 0 &&
      (marqueeToolActive || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey);

    if (!wantsMarquee) {
      panEmptySession.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: scrollEl.scrollLeft,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

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

  const moveEmptySpacePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panEmptySession.current;
    if (pan && pan.pointerId === event.pointerId) {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const dx = event.clientX - pan.startClientX;
      const dy = event.clientY - pan.startClientY;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      if (!pan.moved) {
        pan.moved = true;
        setIsPanningEmpty(true);
      }
      const nextScroll = Math.max(0, pan.startScrollLeft - dx);
      scrollEl.scrollLeft = nextScroll;
      setScrollLeft(scrollEl.scrollLeft);
      return;
    }

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

  const endEmptySpacePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panEmptySession.current;
    if (pan && pan.pointerId === event.pointerId) {
      panEmptySession.current = null;
      setIsPanningEmpty(false);
      if (!pan.moved && event.button === 0) {
        onClearAllSelection?.();
        onScrub(frameFromClientX(event.clientX));
      }
      return;
    }

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
                placeholder="Go to dialogue, action or speaker…"
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
                        {firstLine(clip.keyframe.text || clip.keyframe.beat.shotDescription || "", 54) || "No caption"}
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
            className={`button button-quiet ${resizeLeaveGaps ? "is-active-tool" : ""}`}
            data-testid="resize-gap-toggle"
            aria-pressed={resizeLeaveGaps}
            onClick={onToggleResizeLeaveGaps}
            title="Resize leaves gaps: trimming a keyframe shorter keeps every later keyframe in place by opening a black gap after it (right-click the gap → Add picture here…) instead of shifting the rest of the timeline — click to toggle"
          >
            ▭ Leave gaps
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
            className={`button button-quiet ${marqueeToolActive ? "is-active-tool" : ""}`}
            data-testid="toolbar-marquee-btn"
            aria-pressed={marqueeToolActive}
            onClick={() => setMarqueeToolActive((v) => !v)}
            title={
              marqueeToolActive
                ? "Box select active — click to switch back to empty-space hand drag"
                : "Empty space drags timeline left/right · Hold Shift+drag or toggle this for marquee box select"
            }
          >
            {marqueeToolActive ? (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 5 }}
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    width="9"
                    height="9"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeDasharray="2.2 1.8"
                  />
                </svg>
                Select
              </>
            ) : (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 5 }}
                >
                  <path
                    d="M1.5 6H10.5M1.5 6L3.8 3.7M1.5 6L3.8 8.3M10.5 6L8.2 3.7M10.5 6L8.2 8.3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Pan
              </>
            )}
          </button>
          {(onSetInPoint || onSetOutPoint) && (
            <div className="timeline-io-toolbar-group" role="group" aria-label="In and Out range">
              <button
                type="button"
                className={`button button-quiet ${inPointFrame !== null ? "is-active-tool" : ""}`}
                data-testid="toolbar-mark-in-btn"
                onClick={(event) => {
                  if (event.shiftKey && inPointFrame !== null) {
                    onScrub(inPointFrame);
                  } else {
                    onSetInPoint?.(Math.max(0, Math.floor(playheadFrame)));
                  }
                }}
                title={
                  inPointFrame !== null
                    ? `In: f${inPointFrame} (${formatTimecode(inPointFrame)}) · Click or press I to set at playhead · Shift+click / Shift+I to jump`
                    : "Mark In at playhead (I)"
                }
              >
                [ I{inPointFrame !== null ? ` ${inPointFrame}` : ""}
              </button>
              <button
                type="button"
                className={`button button-quiet ${outPointFrame !== null ? "is-active-tool" : ""}`}
                data-testid="toolbar-mark-out-btn"
                onClick={(event) => {
                  if (event.shiftKey && outPointFrame !== null) {
                    onScrub(outPointFrame);
                  } else {
                    onSetOutPoint?.(Math.max(0, Math.floor(playheadFrame)));
                  }
                }}
                title={
                  outPointFrame !== null
                    ? `Out: f${outPointFrame} (${formatTimecode(outPointFrame)}) · Click or press O to set at playhead · Shift+click / Shift+O to jump`
                    : "Mark Out at playhead (O)"
                }
              >
                O{outPointFrame !== null ? ` ${outPointFrame}` : ""} ]
              </button>
              {onToggleLoop && (
                <button
                  type="button"
                  className={`button button-quiet ${loopPlayback ? "is-active-tool" : ""}`}
                  data-testid="toolbar-loop-btn"
                  aria-pressed={loopPlayback}
                  onClick={onToggleLoop}
                  title="Loop playback over In/Out range (Shift+Space)"
                >
                  ⟳ Loop
                </button>
              )}
              {(inPointFrame !== null || outPointFrame !== null) && onClearInOut && (
                <button
                  type="button"
                  className="button button-quiet"
                  data-testid="toolbar-clear-io-btn"
                  onClick={onClearInOut}
                  title="Clear In & Out marks (Alt+X)"
                  aria-label="Clear In and Out marks"
                >
                  ×
                </button>
              )}
            </div>
          )}
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
          {onSelectAllImages && (
            <button type="button" className="button button-quiet" onClick={onSelectAllImages}
              data-testid="select-all-images" title="Select all image frames (Ctrl/Cmd+A)">
              Select all images
            </button>
          )}
          <button
            type="button"
            className="button button-quiet"
            onClick={onSplit}
            disabled={!canSplit}
            title={selectedCaption ? "Split selected caption at playhead (S)" : "Split selected clip at playhead (S)"}
          >
            ✂ {selectedCaption ? "Split CC" : "Split"} (S)
          </button>
          {onMergeFrames && (
            <button
              type="button"
              className="button button-quiet"
              data-testid="toolbar-merge-frames-btn"
              onClick={onMergeFrames}
              disabled={!canMergeFrames}
              title="Merge frames: keeps first image, removes second image, and makes one clip"
            >
              Merge frames
            </button>
          )}
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
            title="Zoom out timeline (− or mouse wheel)"
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
            title="Zoom in timeline (+ or mouse wheel)"
          >
            +
          </button>
        </div>
      </header>

      <div
        className={`timeline-body ${isResizingHeaders ? "is-resizing" : ""}`}
        style={{ gridTemplateColumns: `${trackHeaderWidth}px 5px minmax(0, 1fr)` }}
      >
        <aside className="timeline-track-headers" data-testid="timeline-track-headers" aria-label="Track headers">
          <div className="track-header-ruler">
            <span>TRACKS</span>
            <div className="track-header-ruler-actions">
              {totalHiddenLaneCount > 0 && (
                <button
                  type="button"
                  className="tracks-show-all-inline-btn"
                  data-testid="tracks-show-all-inline-btn"
                  title="Restore all hidden lanes"
                  onClick={handleShowAllLanes}
                >
                  Show all
                </button>
              )}
              <button
                ref={tracksVisBtnRef}
                type="button"
                className={`tracks-visibility-btn ${tracksPopoverPos ? "is-open" : ""} ${totalHiddenLaneCount > 0 ? "has-hidden" : ""}`}
                data-testid="tracks-visibility-btn"
                aria-label="Show, hide, or resize timeline lanes"
                aria-expanded={Boolean(tracksPopoverPos)}
                title={
                  totalHiddenLaneCount > 0
                    ? `${totalHiddenLaneCount} lane${totalHiddenLaneCount === 1 ? "" : "s"} hidden — click to show/hide or resize lanes`
                    : "Show/hide lanes or compact lane heights"
                }
                onClick={toggleTracksPopover}
              >
                <EyeIcon visible={totalHiddenLaneCount === 0} size={11} />
                {totalHiddenLaneCount > 0 && (
                  <span className="tracks-hidden-badge" data-testid="tracks-hidden-count">
                    {totalHiddenLaneCount}
                  </span>
                )}
              </button>
            </div>
          </div>
          {!hiddenLanes.has("captions") && (
            <div
              className={`track-header-row is-captions ${!showCaptions ? "is-silenced" : ""}`}
              data-testid="track-header-captions"
              style={{
                height: laneHeights.captions,
                minHeight: laneHeights.captions,
                maxHeight: laneHeights.captions,
              }}
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
                  <LaneEyeButton
                    laneLabel="Captions"
                    testId="track-eye-captions"
                    visible
                    onClick={() => handleToggleLaneVisible("captions")}
                  />
                </div>
              </div>
              <LaneResizeHandle
                laneKey="captions"
                label="Captions"
                currentHeight={laneHeights.captions}
                onResize={handleResizeLane}
                onReset={handleResetLaneHeight}
              />
            </div>
          )}
          {TRACK_HEADERS.map((header) => {
            const state = effectiveMix[header.id];
            const effective = effectiveTrackLevel(effectiveMix, header.id);
            const isHidden = hiddenLanes.has(header.id);
            const rowHeight = laneHeights[header.id];
            const isCompactVideo = header.id === "video" && rowHeight < 62;
            return (
              <Fragment key={header.id}>
                {!isHidden && (
                  <div
                    className={`track-header-row is-${header.id} ${effective === 0 ? "is-silenced" : ""} ${isCompactVideo ? "is-compact-height" : ""}`}
                    data-testid={`track-header-${header.id}`}
                    style={{
                      height: rowHeight,
                      minHeight: rowHeight,
                      maxHeight: rowHeight,
                    }}
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
                        <LaneEyeButton
                          laneLabel={header.label}
                          testId={`track-eye-${header.id}`}
                          visible
                          onClick={() => handleToggleLaneVisible(header.id)}
                        />
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
                    <LaneResizeHandle
                      laneKey={header.id}
                      label={header.label}
                      currentHeight={rowHeight}
                      onResize={handleResizeLane}
                      onReset={handleResetLaneHeight}
                    />
                  </div>
                )}

                {header.id === "video" &&
                  !isHidden &&
                  openKeyframeProps.map((prop) => {
                    const meta = ANIM_PROP_META[prop];
                    const targetClip =
                      clips.find(
                        (c) =>
                          c.keyframe.id === selectedFrameId &&
                          expandedClipIds.has(c.keyframe.id) &&
                          (c.keyframe.beat.animation?.[prop]?.length ?? 0) > 0,
                      ) ||
                      clips.find(
                        (c) =>
                          expandedClipIds.has(c.keyframe.id) &&
                          (c.keyframe.beat.animation?.[prop]?.length ?? 0) > 0,
                      );
                    return (
                      <div
                        key={`kf-header-${prop}`}
                        className="track-header-row is-kf-sublane"
                        data-testid={`kf-lane-header-${prop}`}
                      >
                        <div className="kf-sublane-header-inner">
                          <span className="kf-sublane-dot" style={{ background: meta.color }} />
                          <span className="kf-sublane-title">{meta.label}</span>
                          {targetClip && (
                            <button
                              type="button"
                              className="kf-sublane-curve-btn"
                              data-testid={`open-curve-editor-${prop}`}
                              title={`Open Curve Editor for ${meta.label}`}
                              onClick={() => onOpenCurveEditor?.(targetClip.keyframe.id, prop)}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                                <path d="M1,8.5 C4,8.5 6,1.5 9,1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              <span>Curve</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {header.id === "video" && !isHidden && hasExpandedWithoutKeys && (
                  <div
                    className="track-header-row is-kf-sublane is-empty"
                    data-testid="kf-lane-header-empty"
                  >
                    <div className="kf-sublane-header-inner">
                      <span className="kf-sublane-title">Keyframes</span>
                    </div>
                  </div>
                )}

                {header.id === "video" && (
                  <DepthCutoutLaneHeaders
                    sublaneCount={cutoutSublaneCount}
                    cutoutsExpanded={cutoutsExpanded}
                    showDepthMaps={effectiveShowDepthMaps}
                    showDepthMapOverlay={effectiveShowDepthMapOverlay}
                    showCutouts={effectiveShowCutouts}
                    mutedCutoutLayers={effectiveMutedCutoutLayers}
                    depthClipCount={depthClipCount}
                    cutoutClipCount={cutoutClipCount}
                    depthHeight={laneHeights.depth}
                    cutoutsHeight={laneHeights.cutouts}
                    cutoutSublaneHeight={laneHeights.cutoutSublane}
                    hiddenLanes={hiddenLanes}
                    hiddenCutoutSublanes={hiddenCutoutSublanes}
                    onToggleLaneVisible={handleToggleLaneVisible}
                    onToggleCutoutSublaneVisible={handleToggleCutoutSublaneVisible}
                    onShowAllCutoutSublanes={handleShowAllCutoutSublanes}
                    onResizeLane={handleResizeLane}
                    onResetLaneHeight={handleResetLaneHeight}
                    onToggleCutoutsExpanded={() => setCutoutsExpanded((v) => !v)}
                    onAddCutoutSublane={() =>
                      setManualCutoutSublanes((cur) =>
                        Math.min(MAX_DEPTH_CUTOUTS, Math.max(cur, cutoutSublaneCount) + 1),
                      )
                    }
                    onToggleShowDepthMaps={handleToggleDepthMaps}
                    onToggleShowDepthMapOverlay={handleToggleDepthMapOverlay}
                    onToggleShowCutouts={handleToggleCutouts}
                    onToggleMuteCutoutLayer={handleToggleMuteCutoutLayer}
                    onFocusInspectorTab={onFocusInspectorTab}
                  />
                )}
              </Fragment>
            );
          })}
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize timeline track headers"
          data-testid="splitter-track-headers"
          className={`pane-splitter is-vertical is-track-header-splitter ${isResizingHeaders ? "is-dragging" : ""}`}
          title="Drag to resize track headers (double-click to reset)"
          onDoubleClick={() => {
            setTrackHeaderWidth(DEFAULT_TRACK_HEADER_WIDTH);
            try {
              window.localStorage.setItem(TRACK_HEADER_STORAGE_KEY, String(DEFAULT_TRACK_HEADER_WIDTH));
            } catch {
              // ignore
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsResizingHeaders(true);
            headerResizeRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth: trackHeaderWidth,
            };
          }}
          onPointerMove={(event) => {
            const session = headerResizeRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            const next = Math.max(
              MIN_TRACK_HEADER_WIDTH,
              Math.min(MAX_TRACK_HEADER_WIDTH, Math.round(session.startWidth + (event.clientX - session.startX))),
            );
            setTrackHeaderWidth(next);
          }}
          onPointerUp={(event) => {
            const session = headerResizeRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            headerResizeRef.current = null;
            setIsResizingHeaders(false);
            try {
              window.localStorage.setItem(TRACK_HEADER_STORAGE_KEY, String(trackHeaderWidth));
            } catch {
              // ignore
            }
          }}
          onPointerCancel={() => {
            headerResizeRef.current = null;
            setIsResizingHeaders(false);
          }}
        />

        <div
          ref={scrollRef}
          className={`timeline-scroll-area ${isPanningEmpty ? "is-panning-empty" : ""} ${marqueeToolActive ? "is-marquee-mode" : ""}`}
          data-testid="timeline-scroll"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          onPointerDown={beginEmptySpacePointer}
          onPointerMove={moveEmptySpacePointer}
          onPointerUp={endEmptySpacePointer}
          onPointerCancel={() => {
            panEmptySession.current = null;
            setIsPanningEmpty(false);
            marqueeSession.current = null;
            setMarquee(null);
          }}
        >
        <div
          ref={canvasRef}
          className="timeline-canvas"
          style={{ width: trackWidth }}
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

            {(inPointFrame !== null || outPointFrame !== null) && (() => {
              const maxIdx = Math.max(0, totalFrames - 1);
              const effIn = inPointFrame !== null ? Math.max(0, Math.min(maxIdx, inPointFrame)) : 0;
              const effOut =
                outPointFrame !== null
                  ? Math.max(effIn, Math.min(maxIdx, outPointFrame))
                  : maxIdx;
              const leftPx = effIn * pxPerFrame;
              const widthPx = Math.max(2, (effOut - effIn + 1) * pxPerFrame);
              return (
                <>
                  <div
                    className={`ruler-io-range ${loopPlayback ? "is-looping" : ""}`}
                    data-testid="timeline-io-range"
                    data-in-frame={effIn}
                    data-out-frame={effOut}
                    style={{ left: leftPx, width: widthPx }}
                  />
                  {inPointFrame !== null && (
                    <button
                      type="button"
                      className="ruler-io-handle is-in"
                      data-testid="timeline-in-mark"
                      style={{ left: effIn * pxPerFrame }}
                      title={`In mark: frame ${effIn} (${formatTimecode(effIn)}) — drag to move, click to jump`}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        ioDragRef.current = { which: "in", pointerId: event.pointerId, moved: false };
                      }}
                      onPointerMove={(event) => {
                        const drag = ioDragRef.current;
                        if (!drag || drag.which !== "in" || drag.pointerId !== event.pointerId) return;
                        drag.moved = true;
                        const raw = frameFromClientX(event.clientX);
                        const snapped = snapFrame(
                          raw,
                          getSnapTargetsForWindow(raw),
                          pxPerFrame,
                          snapEnabled && !(event.ctrlKey || event.metaKey),
                        );
                        setSnapGuideFrame(snapped.snapped ? snapped.frame : null);
                        const clamped =
                          outPointFrame !== null
                            ? Math.max(0, Math.min(outPointFrame, Math.round(snapped.frame)))
                            : Math.max(0, Math.min(maxIdx, Math.round(snapped.frame)));
                        onSetInPoint?.(clamped);
                      }}
                      onPointerUp={(event) => {
                        const drag = ioDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        ioDragRef.current = null;
                        setSnapGuideFrame(null);
                        if (!drag.moved) onScrub(effIn);
                      }}
                      onPointerCancel={() => {
                        ioDragRef.current = null;
                        setSnapGuideFrame(null);
                      }}
                    >
                      [
                    </button>
                  )}
                  {outPointFrame !== null && (
                    <button
                      type="button"
                      className="ruler-io-handle is-out"
                      data-testid="timeline-out-mark"
                      style={{ left: (effOut + 1) * pxPerFrame }}
                      title={`Out mark: frame ${effOut} (${formatTimecode(effOut)}) — drag to move, click to jump`}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        ioDragRef.current = { which: "out", pointerId: event.pointerId, moved: false };
                      }}
                      onPointerMove={(event) => {
                        const drag = ioDragRef.current;
                        if (!drag || drag.which !== "out" || drag.pointerId !== event.pointerId) return;
                        drag.moved = true;
                        // Subtract 1 because right edge of inclusive outFrame sits at (outFrame + 1) * pxPerFrame
                        const rawRightEdge = Math.round(rawFrameFromClientX(event.clientX));
                        const snappedEdge = snapFrame(
                          rawRightEdge,
                          getSnapTargetsForWindow(rawRightEdge),
                          pxPerFrame,
                          snapEnabled && !(event.ctrlKey || event.metaKey),
                        );
                        setSnapGuideFrame(snappedEdge.snapped ? snappedEdge.frame : null);
                        const candidateOut = Math.max(0, Math.round(snappedEdge.frame) - 1);
                        const minAllowed = inPointFrame !== null ? inPointFrame : 0;
                        const clamped = Math.max(minAllowed, Math.min(maxIdx, candidateOut));
                        onSetOutPoint?.(clamped);
                      }}
                      onPointerUp={(event) => {
                        const drag = ioDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        ioDragRef.current = null;
                        setSnapGuideFrame(null);
                        if (!drag.moved) onScrub(effOut);
                      }}
                      onPointerCancel={() => {
                        ioDragRef.current = null;
                        setSnapGuideFrame(null);
                      }}
                    >
                      ]
                    </button>
                  )}
                </>
              );
            })()}
          </div>

          {(inPointFrame !== null || outPointFrame !== null) && (() => {
            const maxIdx = Math.max(0, totalFrames - 1);
            const effIn = inPointFrame !== null ? Math.max(0, Math.min(maxIdx, inPointFrame)) : 0;
            const effOut =
              outPointFrame !== null
                ? Math.max(effIn, Math.min(maxIdx, outPointFrame))
                : maxIdx;
            return (
              <div
                className={`timeline-io-curtain ${loopPlayback ? "is-looping" : ""}`}
                style={{
                  left: effIn * pxPerFrame,
                  width: Math.max(2, (effOut - effIn + 1) * pxPerFrame),
                }}
                aria-hidden="true"
              />
            );
          })()}

          {!hiddenLanes.has("captions") && (
            <CaptionLane
              laneRef={(el) => {
                captionsLaneRef.current = el;
              }}
              height={laneHeights.captions}
              allClips={clips}
              visibleClips={visibleClips}
              resolvedCaptions={resolvedCaptionsProp}
              totalFrames={totalFrames}
              pxPerFrame={pxPerFrame}
              playheadFrame={playheadFrame}
              snapEnabled={snapEnabled}
              selectedFrameId={selectedFrameId}
              selectedCaption={selectedCaption}
              multiSelectedCaptions={multiSelection.captions}
              multiSelectionTotalCount={
                multiSelection.pictureIds.length +
                multiSelection.audioClipIds.length +
                multiSelection.captions.length
              }
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
              onBeginFreeCaptionDrag={onBeginFreeCaptionDrag}
              onPreviewFreeCaptionMove={onPreviewFreeCaptionMove}
              onCommitFreeCaptionMove={onCommitFreeCaptionMove}
              onCancelFreeCaptionMove={onCancelFreeCaptionMove}
              onBeginMultiDrag={() => {
                lastMultiCaptionDeltaMsRef.current = 0;
                onDragStart();
              }}
              onPreviewMultiDrag={(deltaMs) => {
                lastMultiCaptionDeltaMsRef.current = deltaMs;
                onShiftSelectionPreview?.(deltaMs);
              }}
              onCommitMultiDrag={(copy) => {
                const deltaMs = lastMultiCaptionDeltaMsRef.current;
                lastMultiCaptionDeltaMsRef.current = 0;
                onCommitSelectionShift?.(
                  deltaMs,
                  copy,
                  copy ? "Selection duplicated" : "Selection moved",
                );
              }}
              onCancelMultiDrag={() => {
                lastMultiCaptionDeltaMsRef.current = 0;
                onDragEnd("");
              }}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          )}

          {!hiddenLanes.has("video") && (
          <>
          <div
            ref={trackRef}
            className={`timeline-picture-track ${videoSilenced ? "is-silenced" : ""} ${laneHeights.video < 62 ? "is-compact-height" : ""}`}
            data-testid="picture-track"
            style={{
              height: laneHeights.video,
              minHeight: laneHeights.video,
              maxHeight: laneHeights.video,
            }}
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
                    isActive={playheadFrame >= clip.startFrame && playheadFrame < clip.endFrame}
                    isMulti={
                      selectedFrameIds.includes(clip.keyframe.id) ||
                      multiSelection.pictureIds.includes(clip.keyframe.id)
                    }
                    isLanesOpen={expandedClipIds.has(clip.keyframe.id)}
                    onToggleLanes={() => toggleClipExpanded(clip.keyframe.id)}
                    onOpenDiamondMenu={(prop, frame, currentEasing, clientX, clientY) =>
                      setDiamondMenu({
                        frameId: clip.keyframe.id,
                        prop,
                        frame,
                        currentEasing,
                        clientX,
                        clientY,
                      })
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
                    onOpenClipMenu={openClipMenu}
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

          {openKeyframeProps.map((prop) => (
            <div
              key={`kf-lane-${prop}`}
              ref={(el) => {
                kfLaneRefs.current[prop] = el;
              }}
              className="timeline-kf-lane"
              data-testid={`kf-lane-${prop}`}
              data-prop={prop}
            >
              {visibleClips.map((clip) => {
                if (!expandedClipIds.has(clip.keyframe.id)) return null;
                const keys = clip.keyframe.beat.animation?.[prop];
                if (!keys?.length) return null;
                return (
                  <KeyframePropertyStrip
                    key={`kf-strip-${clip.keyframe.id}-${prop}`}
                    clip={clip}
                    prop={prop}
                    pxPerFrame={pxPerFrame}
                    snapEnabled={snapEnabled}
                    selectedDiamonds={multiSelection.keyframes}
                    getSnapTargetsForWindow={getSnapTargetsForWindow}
                    onSetSnapGuide={setSnapGuideFrame}
                    onScrub={onScrub}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onAnimationPreview={onAnimationPreview}
                    onSelectKeyframeDiamond={onSelectKeyframeDiamond}
                    onOpenCurveEditor={() => onOpenCurveEditor?.(clip.keyframe.id, prop)}
                    onOpenDiamondMenu={(frame, currentEasing, clientX, clientY) =>
                      setDiamondMenu({
                        frameId: clip.keyframe.id,
                        prop,
                        frame,
                        currentEasing,
                        clientX,
                        clientY,
                      })
                    }
                  />
                );
              })}
            </div>
          ))}

          {hasExpandedWithoutKeys && (
            <div
              className="timeline-kf-lane is-empty"
              data-testid="kf-lane-empty"
            >
              {visibleClips
                .filter((c) => expandedClipIds.has(c.keyframe.id))
                .map((c) => (
                  <div
                    key={`empty-strip-${c.keyframe.id}`}
                    className="kf-lane-empty-note"
                    style={{
                      left: c.startFrame * pxPerFrame,
                      width: Math.max(80, c.durationFrames * pxPerFrame),
                    }}
                  >
                    Add ◆ keyframes in Inspector to animate properties
                  </div>
                ))}
            </div>
          )}
          </>
          )}

          <DepthCutoutCanvasLanes
            clips={clips}
            visibleClips={visibleClips}
            pxPerFrame={pxPerFrame}
            selectedFrameId={selectedFrameId}
            selectedFrameIds={selectedFrameIds}
            selectedCutoutLayer={selectedCutoutLayer}
            sublaneCount={cutoutSublaneCount}
            cutoutsExpanded={cutoutsExpanded}
            showDepthMaps={effectiveShowDepthMaps}
            showCutouts={effectiveShowCutouts}
            mutedCutoutLayers={effectiveMutedCutoutLayers}
            depthHeight={laneHeights.depth}
            cutoutsHeight={laneHeights.cutouts}
            cutoutSublaneHeight={laneHeights.cutoutSublane}
            hiddenLanes={hiddenLanes}
            hiddenCutoutSublanes={hiddenCutoutSublanes}
            resolveMedia={resolveMedia}
            frameFromClientX={frameFromClientX}
            onToggleCutoutsExpanded={() => setCutoutsExpanded((v) => !v)}
            onSelectShot={(frameId, additive, targetFrame) => {
              onClearCaptionSelection?.();
              if (additive) {
                const exists = selectedFrameIds.includes(frameId);
                const nextIds = exists
                  ? selectedFrameIds.length > 1
                    ? selectedFrameIds.filter((item) => item !== frameId)
                    : [frameId]
                  : [...selectedFrameIds, frameId];
                const nextPrimary = nextIds.includes(frameId)
                  ? frameId
                  : nextIds[nextIds.length - 1];
                onSetSelection(nextIds, nextPrimary, targetFrame);
              } else {
                onSetSelection([frameId], frameId, targetFrame);
              }
            }}
            onSelectCutoutLayer={setSelectedCutoutLayer}
            onFocusInspectorTab={onFocusInspectorTab}
            onBrowseMediaForFrame={onBrowseMediaForFrame}
            onUploadMediaForFrame={onUploadMediaForFrame}
            onAssignDepthMap={onAssignDepthMap}
            onAssignDepthPlate={onAssignDepthPlate}
            onDropDepthFile={onDropDepthFile}
            onAddCutout={onAddCutout}
            onSetCutoutLayer={onSetCutoutLayer}
            onDropCutoutFile={onDropCutoutFile}
            onPreviewCutoutDepth={onPreviewCutoutDepth}
            onCommitCutoutDepth={onCommitCutoutDepth}
            onMoveCutoutLayer={onMoveCutoutLayer}
            onClearCutouts={onClearCutouts}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />

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
            laneHeights={laneHeights}
            hiddenLanes={hiddenLanes}
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

          {hiddenLanes.size >= TIMELINE_LANE_ORDER.length && (
            <div className="timeline-all-lanes-hidden" data-testid="timeline-all-lanes-hidden">
              <span>All timeline lanes are hidden.</span>
              <button
                type="button"
                className="button button-quiet"
                onClick={handleShowAllLanes}
              >
                Show all lanes
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {tracksPopoverPos && (
        <div
          ref={tracksPopoverRef}
          className="tracks-visibility-popover"
          data-testid="tracks-visibility-popover"
          role="dialog"
          aria-label="Timeline lanes visibility and height"
          style={{
            left: tracksPopoverPos.left,
            top: tracksPopoverPos.top,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="tracks-popover-head">
            <span>LANES &amp; SIZING</span>
            {totalHiddenLaneCount > 0 && (
              <button
                type="button"
                className="tracks-popover-link"
                data-testid="tracks-popover-show-all"
                onClick={handleShowAllLanes}
              >
                Show all ({totalHiddenLaneCount})
              </button>
            )}
          </div>

          <div className="tracks-popover-presets">
            <button
              type="button"
              className="tracks-preset-btn"
              data-testid="tracks-preset-compact"
              title="Compact all lane heights so more tracks fit at once"
              onClick={handleCompactLaneHeights}
            >
              Compact lanes
            </button>
            <button
              type="button"
              className="tracks-preset-btn"
              data-testid="tracks-preset-reset"
              title="Restore default lane heights"
              onClick={handleResetAllLaneHeights}
            >
              Reset sizes
            </button>
          </div>

          <div className="tracks-popover-list">
            {(
              [
                { id: "captions", label: "Captions" },
                { id: "video", label: "Video" },
                { id: "depth", label: "Depth Maps" },
                { id: "cutouts", label: "Cutouts" },
                { id: "voice", label: "Voice" },
                { id: "sfx", label: "SFX" },
                { id: "music", label: "Music" },
                { id: "ambience", label: "Ambience" },
              ] as const
            ).map((lane) => {
              const visible = !hiddenLanes.has(lane.id);
              const px = laneHeights[lane.id];
              return (
                <button
                  key={lane.id}
                  type="button"
                  className={`tracks-popover-row ${!visible ? "is-hidden-lane" : ""}`}
                  data-testid={`tracks-vis-toggle-${lane.id}`}
                  aria-pressed={visible}
                  onClick={() => handleToggleLaneVisible(lane.id)}
                >
                  <span className="tracks-popover-eye">
                    <EyeIcon visible={visible} size={11} />
                  </span>
                  <span className="tracks-popover-name">{lane.label}</span>
                  <span className="tracks-popover-px">{px}px</span>
                </button>
              );
            })}

            {cutoutsExpanded &&
              !hiddenLanes.has("cutouts") &&
              Array.from({ length: cutoutSublaneCount }, (_, layerIndex) => {
                const visible = !hiddenCutoutSublanes.has(layerIndex);
                return (
                  <button
                    key={`sub-${layerIndex}`}
                    type="button"
                    className={`tracks-popover-row is-sublane ${!visible ? "is-hidden-lane" : ""}`}
                    data-testid={`tracks-vis-toggle-cutout-${layerIndex}`}
                    aria-pressed={visible}
                    onClick={() => handleToggleCutoutSublaneVisible(layerIndex)}
                  >
                    <span className="tracks-popover-eye">
                      <EyeIcon visible={visible} size={10} />
                    </span>
                    <span className="tracks-popover-name">↳ Cutout {layerIndex + 1}</span>
                    <span className="tracks-popover-px">{laneHeights.cutoutSublane}px</span>
                  </button>
                );
              })}
          </div>
          <div className="tracks-popover-hint">
            Drag bottom edge of any track header to resize · double-click edge to reset
          </div>
        </div>
      )}

      {diamondMenu && (
        <div
          className="diamond-easing-menu"
          data-testid="diamond-easing-menu"
          role="menu"
          style={{
            left: Math.min(
              typeof window !== "undefined" ? window.innerWidth - 190 : diamondMenu.clientX,
              diamondMenu.clientX,
            ),
            top: Math.min(
              typeof window !== "undefined" ? window.innerHeight - 240 : diamondMenu.clientY,
              diamondMenu.clientY,
            ),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="diamond-menu-head">
            <span>{ANIM_PROP_META[diamondMenu.prop].label}</span>
            <small>+{diamondMenu.frame}f</small>
          </div>
          {(
            [
              { easing: "linear", label: "Linear" },
              { easing: "ease-in", label: "Ease in" },
              { easing: "ease-out", label: "Ease out" },
              { easing: "ease-in-out", label: "Ease in-out" },
              { easing: "bezier", label: "Bezier curve" },
              { easing: "hold", label: "Hold" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.easing}
              type="button"
              role="menuitemradio"
              aria-checked={diamondMenu.currentEasing === opt.easing}
              data-testid={`diamond-menu-easing-${opt.easing}`}
              className={`diamond-menu-item ${diamondMenu.currentEasing === opt.easing ? "is-active" : ""}`}
              onClick={() => {
                const targetClip = clips.find((c) => c.keyframe.id === diamondMenu.frameId);
                if (targetClip) {
                  const updated = setKeyEasingAtFrame(
                    targetClip.keyframe.beat.animation,
                    diamondMenu.prop,
                    diamondMenu.frame,
                    opt.easing,
                  );
                  if (onCommitAnimation) {
                    onCommitAnimation(
                      diamondMenu.frameId,
                      updated,
                      `${ANIM_PROP_META[diamondMenu.prop].label} easing set to ${opt.easing}`,
                    );
                  } else {
                    onDragStart();
                    onAnimationPreview(diamondMenu.frameId, updated);
                    onDragEnd(`${ANIM_PROP_META[diamondMenu.prop].label} easing set to ${opt.easing}`);
                  }
                  if (opt.easing === "bezier") {
                    onOpenCurveEditor?.(diamondMenu.frameId, diamondMenu.prop);
                  }
                }
                setDiamondMenu(null);
              }}
            >
              <span>{opt.label}</span>
              {diamondMenu.currentEasing === opt.easing && <i>✓</i>}
            </button>
          ))}
          <hr className="diamond-menu-sep" />
          <button
            type="button"
            className="diamond-menu-item is-curve-link"
            data-testid="diamond-menu-open-curve"
            onClick={() => {
              onOpenCurveEditor?.(diamondMenu.frameId, diamondMenu.prop);
              setDiamondMenu(null);
            }}
          >
            <span>Open Curve Editor…</span>
          </button>
        </div>
      )}

      {/* Right-click context menu on video keyframes (picture clips & gaps) */}
      {clipMenu &&
        (() => {
          const targetClip = clips.find((c) => c.keyframe.id === clipMenu.frameId);
          const menuIds =
            selectedFrameIds.includes(clipMenu.frameId) && selectedFrameIds.length > 0
              ? selectedFrameIds
              : [clipMenu.frameId];
          const move = (delta: -1 | 1) => {
            const ids = menuIds;
            setClipMenu(null);
            onNudgeClips?.(ids, delta);
          };
          return (
            <div
              className="diamond-easing-menu clip-context-menu"
              data-testid="clip-context-menu"
              role="menu"
              style={{
                left: Math.min(
                  typeof window !== "undefined" ? window.innerWidth - 240 : clipMenu.clientX,
                  clipMenu.clientX,
                ),
                top: Math.min(
                  typeof window !== "undefined" ? window.innerHeight - 350 : clipMenu.clientY,
                  clipMenu.clientY,
                ),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="diamond-menu-head">
                <span>
                  {clipMenu.isGap
                    ? "Gap"
                    : `SC ${targetClip?.keyframe.mark ?? ""} · ${targetClip?.keyframe.number ?? ""}`}
                </span>
                <small>
                  {targetClip
                    ? `${formatTimecode(targetClip.startFrame)} · ${targetClip.durationFrames}f`
                    : ""}
                </small>
              </div>

              {clipMenu.isGap ? (
                <button
                  type="button"
                  className="diamond-menu-item is-primary"
                  data-testid="clip-menu-add-picture"
                  onClick={() => {
                    const frameId = clipMenu.frameId;
                    setClipMenu(null);
                    openPicturePicker(frameId);
                  }}
                >
                  <span>Add picture here…</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="diamond-menu-item is-primary"
                  data-testid="clip-menu-replace-picture"
                  onClick={() => {
                    const frameId = clipMenu.frameId;
                    setClipMenu(null);
                    openPicturePicker(frameId);
                  }}
                >
                  <span>Replace picture…</span>
                </button>
              )}

              {!clipMenu.isGap && (
                <button
                  type="button"
                  className="diamond-menu-item"
                  data-testid="clip-menu-split"
                  disabled={!canSplit}
                  onClick={() => {
                    setClipMenu(null);
                    onSplit();
                  }}
                >
                  <span>Split at playhead</span>
                  <small>S</small>
                </button>
              )}
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="clip-menu-duplicate"
                onClick={() => {
                  setClipMenu(null);
                  onDuplicateFrame?.();
                }}
              >
                <span>Duplicate</span>
              </button>
              <hr className="diamond-menu-sep" />
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="clip-menu-move-earlier"
                onClick={() => move(-1)}
              >
                <span>Move earlier</span>
                <small>⟲</small>
              </button>
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="clip-menu-move-later"
                onClick={() => move(1)}
              >
                <span>Move later</span>
                <small>⟳</small>
              </button>
              <hr className="diamond-menu-sep" />
              <button
                type="button"
                className="diamond-menu-item"
                data-testid="clip-menu-delete"
                onClick={() => {
                  setClipMenu(null);
                  onExecuteDelete?.(false);
                }}
              >
                <span>{clipMenu.isGap ? "Close gap" : "Delete (lift to gap)"}</span>
                <small>Del</small>
              </button>
            </div>
          );
        })()}

      {/* File picker for context-menu Replace / Add picture actions */}
      <input
        ref={pictureInputRef}
        type="file"
        accept="image/*"
        data-testid="clip-picture-input"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const frameId = pictureInputTargetRef.current;
          event.target.value = "";
          pictureInputTargetRef.current = null;
          if (file && frameId) onDropFile(file, frameId);
        }}
      />
    </section>
  );
}

function ClipItem({
  clip,
  clips,
  pxPerFrame,
  snapEnabled,
  isSelected,
  isActive = false,
  isMulti,
  isLanesOpen = false,
  onToggleLanes,
  onOpenDiamondMenu,
  onOpenClipMenu,
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
  isActive?: boolean;
  isMulti: boolean;
  isLanesOpen?: boolean;
  onToggleLanes?: () => void;
  onOpenDiamondMenu?: (
    prop: AnimProp,
    frame: number,
    currentEasing: KeyEasing,
    clientX: number,
    clientY: number,
  ) => void;
  onOpenClipMenu?: (frameId: string, clientX: number, clientY: number, isGap: boolean) => void;
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
    lastFrame: number;
    copy: boolean;
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
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!selectedFrameIds.includes(kf.id)) {
          onSetSelection([kf.id], kf.id);
        }
        onOpenClipMenu?.(kf.id, event.clientX, event.clientY, isGap);
      }}
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
          ? `Gap · drop a picture or right-click → Add picture here (${clip.durationFrames}f · ${formatTimecode(clip.startFrame)}) — press Delete to close gap`
          : isVoiceCut
            ? `SC ${kf.mark} / ${kf.number} — Picture (${clip.durationFrames}f) ends before voice (${clip.voiceFrames}f)`
            : `SC ${kf.mark} / ${kf.number} · ${formatTimecode(clip.startFrame)} (${clip.durationFrames}f) — drag to move, Alt+drag to copy, right-click for replace/split/duplicate`
      }
    >
      {thumbSrc && <img className="timeline-clip-thumb" src={thumbSrc} alt="" loading="lazy" decoding="async" />}

      {isGap ? (
        <div className="timeline-gap-label" data-testid={`gap-label-${kf.id}`}>
          <span>Gap · drop a picture</span>
        </div>
      ) : (
        (width >= 18 || isSelected || Boolean(anim)) && (
          <div className="timeline-clip-overlay">
            <button
              type="button"
              className={`clip-lanes-toggle ${isLanesOpen ? "is-open" : ""} ${animatedPropsOf(anim).length > 0 ? "has-keys" : ""}`}
              data-testid={`clip-lanes-toggle-${kf.id}`}
              aria-expanded={isLanesOpen}
              aria-label={isLanesOpen ? "Hide keyframe lanes" : "Show keyframe lanes"}
              title={
                isLanesOpen
                  ? "Hide animated property lanes"
                  : "Show animated property lanes under clip"
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLanes?.();
              }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                {isLanesOpen ? (
                  <path d="M1,2.2 L7,2.2 L4,6.4 Z" fill="currentColor" />
                ) : (
                  <path d="M2.2,1 L6.4,4 L2.2,7 Z" fill="currentColor" />
                )}
              </svg>
            </button>
            {width >= 24 && <span className="timeline-clip-mark">{kf.mark}</span>}
            {kf.beat.audioUrl && width >= 44 && (
              <span className="timeline-clip-vox-badge" title={`Voice: ${kf.beat.audioUrl}`}>
                ◉
              </span>
            )}
            {width >= 58 && (
              <span className="timeline-clip-label">
                {pictureLabel(picture, true, kf.speaker || "No picture")}
              </span>
            )}
          </div>
        )
      )}

      {(isSelected || isActive || selectedDiamonds.some((d) => d.frameId === kf.id)) && anim && (
        <div className="timeline-clip-keyframes">
          {ANIM_PROPS.map((prop) =>
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
                  style={{
                    left: keyLeftPx,
                    color: ANIM_PROP_META[prop].color,
                  }}
                  title={`${ANIM_PROP_META[prop].label}: ${key.value} @ +${key.frame}f (${key.easing}) — drag to move, Alt+drag to copy, right-click for easing`}
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenDiamondMenu?.(
                      prop,
                      key.frame,
                      key.easing,
                      event.clientX,
                      event.clientY,
                    );
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    keySession.current = {
                      prop,
                      startX: event.clientX,
                      initialFrame: key.frame,
                      lastFrame: key.frame,
                      copy: event.altKey,
                      initialAnim: JSON.parse(JSON.stringify(anim)) as BeatAnimation,
                      moved: false,
                    };
                    onDragStart();
                  }}
                  onPointerMove={(event) => {
                    const session = keySession.current;
                    if (!session) return;
                    const dx = event.clientX - session.startX;
                    if (!session.moved && Math.abs(dx) <= 2) return;
                    session.moved = true;
                    session.copy = event.altKey || session.copy;
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
                        Math.round(snapped.frame - clip.startFrame),
                      ),
                    );
                    session.lastFrame = nextLocal;
                    const updated = session.copy
                      ? copyKeyToFrame(
                          session.initialAnim,
                          session.prop,
                          session.initialFrame,
                          nextLocal,
                          Math.max(0, clip.durationFrames - 1),
                        )
                      : moveKeyToFrame(
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
                      onDragEnd(
                        session.copy
                          ? `${ANIM_PROP_META[session.prop].label} keyframe copied`
                          : `${ANIM_PROP_META[session.prop].label} keyframe moved`,
                      );
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
                  <i className="diamond-shape" aria-hidden="true" />
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

function KeyframePropertyStrip({
  clip,
  prop,
  pxPerFrame,
  snapEnabled,
  selectedDiamonds,
  getSnapTargetsForWindow,
  onSetSnapGuide,
  onScrub,
  onDragStart,
  onDragEnd,
  onAnimationPreview,
  onSelectKeyframeDiamond,
  onOpenCurveEditor,
  onOpenDiamondMenu,
}: {
  clip: TimelineClip;
  prop: AnimProp;
  pxPerFrame: number;
  snapEnabled: boolean;
  selectedDiamonds: ReadonlyArray<SelectedKeyframeDiamond>;
  getSnapTargetsForWindow: (
    centerFrame: number,
    excludeClipIds?: Set<string>,
    excludePlayhead?: boolean,
    excludeKeyframe?: { clipId: string; prop: string; frame: number },
  ) => ReturnType<typeof collectSnapTargets>;
  onSetSnapGuide: (frame: number | null) => void;
  onScrub: (frame: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onAnimationPreview: (frameId: string, animation: BeatAnimation | undefined) => void;
  onSelectKeyframeDiamond?: (diamond: SelectedKeyframeDiamond, additive: boolean) => void;
  onOpenCurveEditor: () => void;
  onOpenDiamondMenu: (
    frame: number,
    currentEasing: KeyEasing,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const kf = clip.keyframe;
  const meta = ANIM_PROP_META[prop];
  const anim = kf.beat.animation;
  const keys = anim?.[prop] ?? [];
  const left = clip.startFrame * pxPerFrame;
  const width = Math.max(8, clip.durationFrames * pxPerFrame);
  const maxLocal = Math.max(0, clip.durationFrames - 1);
  const fallbackVal = defaultValueForProp(prop, clip);

  const keySession = useRef<{
    startX: number;
    initialFrame: number;
    lastFrame: number;
    copy: boolean;
    initialAnim: BeatAnimation | undefined;
    moved: boolean;
  } | null>(null);

  const sparklinePoints = useMemo(() => {
    const H = 26;
    const padY = 4;
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of keys) {
      if (k.value < lo) lo = k.value;
      if (k.value > hi) hi = k.value;
    }
    const span = hi - lo;
    const yMin = span > 1e-6 ? lo : meta.min;
    const yMax = span > 1e-6 ? hi : meta.max;
    const denom = yMax - yMin || 1;

    const samples = Math.min(96, Math.max(12, Math.round(width / 3)));
    const pts: string[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const ratio = i / samples;
      const f = ratio * maxLocal;
      const val = evaluateChannel(keys, f, fallbackVal);
      const norm = Math.max(0, Math.min(1, (val - yMin) / denom));
      const x = ratio * width;
      const y = padY + (1 - norm) * (H - padY * 2);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [fallbackVal, keys, maxLocal, meta.max, meta.min, width]);

  return (
    <div
      className="kf-lane-strip"
      data-testid={`kf-lane-strip-${kf.id}-${prop}`}
      style={{ left, width }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenCurveEditor();
      }}
      title={`${meta.label} lane (SC ${kf.mark}/${kf.number}) — double-click to open Curve Editor`}
    >
      <svg
        className="kf-lane-sparkline"
        data-testid={`kf-lane-line-${kf.id}-${prop}`}
        width={width}
        height={26}
        viewBox={`0 0 ${width} 26`}
        preserveAspectRatio="none"
      >
        <polyline
          points={sparklinePoints}
          fill="none"
          stroke={meta.color}
          strokeWidth={1.6}
          strokeOpacity={0.9}
        />
      </svg>

      {width >= 44 && (
        <button
          type="button"
          className="kf-strip-curve-btn"
          data-testid={`strip-curve-btn-${kf.id}-${prop}`}
          title={`Open ${meta.label} Curve Editor`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCurveEditor();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1,8.5 C4,8.5 6,1.5 9,1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {keys.map((key, idx) => {
        const clampedFrame = Math.max(0, Math.min(maxLocal, key.frame));
        const keyLeftPx = Math.max(
          4,
          Math.min(Math.max(4, width - 8), (clampedFrame + 0.5) * pxPerFrame),
        );
        const isDiamondSelected = selectedDiamonds.some(
          (d) => d.frameId === kf.id && d.prop === prop && d.frame === key.frame,
        );
        return (
          <button
            type="button"
            key={`${prop}-${key.frame}-${idx}`}
            className={`kf-lane-diamond ${isDiamondSelected ? "is-selected" : ""}`}
            data-testid={`lane-diamond-${kf.id}-${prop}-${key.frame}`}
            style={{
              left: keyLeftPx,
              color: isDiamondSelected ? "#ffffff" : meta.color,
            }}
            title={`${meta.label}: ${key.value.toFixed(meta.decimals)}${meta.suffix} @ +${key.frame}f (${key.easing}) — drag to move, Alt+drag to copy, right-click for easing`}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenDiamondMenu(key.frame, key.easing, event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              keySession.current = {
                startX: event.clientX,
                initialFrame: key.frame,
                lastFrame: key.frame,
                copy: event.altKey,
                initialAnim: anim ? (JSON.parse(JSON.stringify(anim)) as BeatAnimation) : undefined,
                moved: false,
              };
              onDragStart();
            }}
            onPointerMove={(event) => {
              const session = keySession.current;
              if (!session) return;
              const dx = event.clientX - session.startX;
              if (!session.moved && Math.abs(dx) <= 2) return;
              session.moved = true;
              session.copy = event.altKey || session.copy;
              const effectiveSnap = snapEnabled && !(event.ctrlKey || event.metaKey);
              const rawAbsFrame = clip.startFrame + session.initialFrame + dx / pxPerFrame;
              const targets = getSnapTargetsForWindow(rawAbsFrame, undefined, false, {
                clipId: kf.id,
                prop,
                frame: session.initialFrame,
              });
              const snapped = snapFrame(rawAbsFrame, targets, pxPerFrame, effectiveSnap);
              onSetSnapGuide(snapped.snapped ? snapped.frame : null);
              const nextLocal = Math.max(
                0,
                Math.min(maxLocal, Math.round(snapped.frame - clip.startFrame)),
              );
              session.lastFrame = nextLocal;
              const updated = session.copy
                ? copyKeyToFrame(
                    session.initialAnim,
                    prop,
                    session.initialFrame,
                    nextLocal,
                    maxLocal,
                  )
                : moveKeyToFrame(
                    session.initialAnim,
                    prop,
                    session.initialFrame,
                    nextLocal,
                    maxLocal,
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
                onDragEnd(
                  session.copy
                    ? `${meta.label} keyframe copied`
                    : `${meta.label} keyframe moved`,
                );
                onSelectKeyframeDiamond?.(
                  { frameId: kf.id, prop, frame: session.lastFrame },
                  false,
                );
              } else {
                onDragEnd("");
                onSelectKeyframeDiamond?.(
                  { frameId: kf.id, prop, frame: session.initialFrame },
                  event.shiftKey,
                );
                onScrub(clip.startFrame + Math.min(maxLocal, session.initialFrame));
              }
            }}
            onPointerCancel={() => {
              keySession.current = null;
              onSetSnapGuide(null);
              onDragEnd("");
            }}
          >
            <i className="diamond-shape" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

