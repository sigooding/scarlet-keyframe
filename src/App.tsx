import { imageFrameIds, isImageGradePath, setImageGradeForFrames } from "./core/imageGrading";
import { upgradeSavedRecreatedUncut } from "./core/recreatedUncut";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { flushSync } from "react-dom";
import { AssetBrowser, type BrowserAsset } from "./components/AssetBrowser";
import type { SelectedCaptionState } from "./components/CaptionLane";
import { CinematicPreview } from "./components/CinematicPreview";
import { CharacterReferences } from "./components/CharacterReferences";
import { LaunderetteReferences } from "./components/LaunderetteReferences";
import { CurveEditor } from "./components/CurveEditor";
import { CropModal, type CropState } from "./components/CropModal";
import { ExportModal, type ExportTab, type Mp4ExportCapture, type Mp4ExportQuality } from "./components/ExportModal";
import { suggestExportWorkers } from "../scripts/export-workers.mjs";
import { StereoPeakMeter } from "./components/StereoPeakMeter";
import {
  Inspector,
  type BrowseMediaTarget,
  type InheritedAmbienceInfo,
  type InheritedMusicInfo,
  type InspectorTab,
  type UploadMediaTarget,
} from "./components/Inspector";
import { MediaBin } from "./components/MediaBin";
import { MissingMediaModal } from "./components/MissingMediaModal";
import { SnapshotModal } from "./components/SnapshotModal";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { Timeline } from "./components/Timeline";
import { Topbar } from "./components/Topbar";
import { resolveAmbienceSpans } from "./components/Tracks";
import {
  buildAudioClipsFromFilm,
  DEFAULT_DUCK_DEPTH,
  EMPTY_MULTI_SELECTION,
  frameToMs,
  isMultiSelectionEmpty,
  reanchorAudioClipToMs,
  resolveAudioClips,
  type AudioClip,
  type AudioLaneId,
  type MultiLaneSelection,
  type ResolvedAudioClip,
  type SelectedKeyframeDiamond,
} from "./core/audioClips";
import {
  activeTimelineCaptionAtFrame,
  buildMp4FfmetadataChapters,
  DEFAULT_CAPTION_STYLE,
  deleteCaptionsAtIndices,
  effectiveCaptionsForBeat,
  makeCaptionsSrt,
  makeCaptionsVtt,
  makeRangeCaptionsSrt,
  mergeAdjacentCaptions,
  normalizeCaptionStyle,
  resolveTimelineCaptions,
  splitCaptionAtFrame,
  type BeatCaption,
  type CaptionStyle,
  type ResolvedTimelineCaption,
} from "./core/captions";
import {
  applyStudioMusicSync,
  buildKeyframes,
  collectImageReferences,
  collectMediaReferences,
  createProjectState,
  parseImportPayload,
  runningOrderDiagnostics,
  type AnyRecord,
  type BeatAnimation,
  type BeatLike,
  type KenBurnsBox,
  type LoudnessTargetMode,
  type ProjectAsset,
  type ProjectState,
} from "./core/model";
import {
  addNoteMarker,
  canMergeKeyframes,
  cloneStory as cloneProjectStory,
  convertProjectCameraMovesToKeyframesWithCount,
  copyEffectBlock,
  copyMultiSelection,
  copySelectedBeats,
  deleteNoteMarker,
  duplicateKeyframe,
  executeDeleteSelection,
  insertKeyframeAfter,
  mergeKeyframes,
  moveSfxCue,
  moveTimelineCaption,
  pasteEffectBlock,
  pasteKeyframesAt,
  pasteMultiSelectionAt,
  reorderKeyframeWithResult,
  resetBeatCaptions,
  resetEffectField,
  setAudioClips,
  setBeatAnimation,
  setBeatCaptions,
  setBeatField,
  setCutTransition,
  setEffectField,
  setPicture,
  setRollDurations,
  setSceneField,
  setStoryCaptionStyle,
  shiftMultiLaneSelection,
  splitKeyframeAt,
  trimKeyframe,
  updateAudioClip,
  updateNoteMarker,
  type EffectBlock,
  type MultiLaneClipboard,
  type ReorderDestination,
} from "./core/edits";
import {
  addFrameCutout,
  clearFrameCutouts,
  moveFrameCutoutLayer,
  setFrameCutoutLayer,
  setFrameDepthMap,
  setFrameDepthPlate,
  updateFrameCutoutDepth,
} from "./core/depthLanes";
import { buildPortableBundle } from "./core/exportBundle";
import {
  applyCutOptionsToProject,
  buildDirectorsCutById,
  buildDirectorsCutProject,
  DIRECTORS_CUT_OPTIONS,
  DIRECTORS_CUT_VERSION,
  getDirectorsCutLabel,
  normalizeCutOptions,
  switchDirectorsCutWithState,
  type DirectorsCutId,
} from "./core/directorsCut";
import { downloadText, measureAudioDuration, slug } from "./core/helpers";
import {
  createUploadAsset,
  dataUrlToBlob,
  encodeMediaPath,
  evaluateMissingMedia,
  folderFilePath,
  hasPublicMediaPath,
  normalizeMediaPath,
  referencedPath,
  SCARLETT_WITNESS_RAW_BASE,
} from "./core/media";
import { UndoHistory } from "./core/history";
import { loadActiveProject, loadSavedProject, listSavedProjects, saveActiveProject, type SavedProjectSummary } from "./core/storage";
import { BUILT_IN_FILMS, createBundledFilm } from "./core/bundledFilms";
import { countEmptySweetJesusOpeningShots, fillEmptySweetJesusOpeningShots, upgradeSweetJesusOpening } from "./core/sweetJesusOpening";
import { effectiveFilmCutOptions } from "./core/filmFraming";
import { clipFrames, FPS, formatTimecode } from "./core/timing";
import {
  applyStudioPatchToStory,
  isStudioPatchPayload,
  writeStudioPatch,
  type StudioPatchResult,
} from "./core/patch";
import {
  createDefaultTrackMix,
  effectiveTrackLevel,
  extractKnownMusicDurations,
  PreviewAudioController,
  resolveMusicSpans,
  type TrackId,
  type TrackMixMap,
} from "./core/previewAudio";
import { webAudioEngine } from "./core/webAudioEngine";
import { preloadDepthParallaxAssets } from "./components/FrameDepthParallax";
import {
  applyKenBurnsBoxes,
  buildTimelineClips,
  clipAtFrame,
  computePictureRuns,
  copySelectedKeyframes,
  effectiveFrameCinematic,
  evaluate,
  nextKeyframeFrameOnClip,
  pasteClipAnimationOnto,
  pasteCopiedKeyframesAt,
  prevKeyframeFrameOnClip,
  type AnimProp,
  type CopiedKeyframeItem,
} from "./sequence/animate";
import {
  activeTransitionAtFrame,
  readCutTransition,
  type TransitionAlignment,
  type TransitionKind,
} from "./sequence/transitions";
import { audio } from "../vendor/scarlet-reel/audio";
import bundledAudioDurations from "./data/audio-durations.json";
import bundledMediaIndex from "./data/media-index.json";
import { renderTimelineAudioOfflineWav, uint8ArrayToBase64 } from "./core/offlineAudioMix";
import bundledFilm from "./data/nobodys-witness-film.json";
import bundledEdits from "./data/studio-edits.json";
import sweetJesusScreenplay from "./data/sweet-jesus.fountain?raw";

type BrowseTarget = BrowseMediaTarget;
type BrowserState = { kind: "image" | "audio"; target: BrowseTarget; frameId?: string };
type UploadIntent = { kind: "image" | "audio"; target: UploadMediaTarget; frameId: string };

export interface Mp4ExportJobState {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  completedFrames: number;
  totalFrames: number;
  percent: number;
  phase: string;
  mp4Url?: string;
  srtUrl?: string;
  fileName?: string;
  srtFileName?: string;
  error?: string;
}

const PLAYHEAD_SESSION_KEY = "frame24-playhead";
const PANE_SIZES_STORAGE_KEY = "frame24-pane-sizes";
const DEFAULT_INSPECTOR_WIDTH = 368;
const DEFAULT_TIMELINE_HEIGHT = 348;
const DEFAULT_MEDIA_BIN_WIDTH = 256;

interface PaneSizes {
  inspectorWidth: number;
  timelineHeight: number;
  mediaBinWidth: number;
}

function readStoredPaneSizes(): PaneSizes {
  try {
    const raw = window.localStorage.getItem(PANE_SIZES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PaneSizes>;
      return {
        inspectorWidth:
          Number.isFinite(parsed.inspectorWidth) && parsed.inspectorWidth! >= 260 && parsed.inspectorWidth! <= 680
            ? Math.round(parsed.inspectorWidth!)
            : DEFAULT_INSPECTOR_WIDTH,
        timelineHeight:
          Number.isFinite(parsed.timelineHeight) && parsed.timelineHeight! >= 180 && parsed.timelineHeight! <= 820
            ? Math.round(parsed.timelineHeight!)
            : DEFAULT_TIMELINE_HEIGHT,
        mediaBinWidth:
          Number.isFinite(parsed.mediaBinWidth) && parsed.mediaBinWidth! >= 180 && parsed.mediaBinWidth! <= 520
            ? Math.round(parsed.mediaBinWidth!)
            : DEFAULT_MEDIA_BIN_WIDTH,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
    timelineHeight: DEFAULT_TIMELINE_HEIGHT,
    mediaBinWidth: DEFAULT_MEDIA_BIN_WIDTH,
  };
}

function writeStoredPaneSizes(sizes: PaneSizes): void {
  try {
    window.localStorage.setItem(PANE_SIZES_STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // ignore storage errors
  }
}

const renderImageDecodeCache = new Map<string, Promise<void>>();

function ensureImageDecodedOnce(url: string): Promise<void> {
  if (!url || url.startsWith("gradient:") || url.startsWith("emoji:")) {
    return Promise.resolve();
  }
  const existing = renderImageDecodeCache.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "sync";
    const timer = window.setTimeout(() => resolve(), 4000);
    const done = () => {
      window.clearTimeout(timer);
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    img.onload = done;
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve();
    };
    img.src = url;
    if (img.complete) done();
  });
  renderImageDecodeCache.set(url, promise);
  return promise;
}

async function waitForRenderFrameReady(rootEl: HTMLElement | null): Promise<void> {
  if (!rootEl) return;
  const urls = new Set<string>();
  const extractCssUrls = (bg: string) => {
    const regex = /url\((['"]?)(.*?)\1\)/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(bg)) !== null) {
      const u = m[2]?.trim();
      if (u && !u.startsWith("data:image/svg")) urls.add(u);
    }
  };

  rootEl.querySelectorAll<HTMLElement>(".cin-preview-plate").forEach((el) => {
    if (el.style.backgroundImage) extractCssUrls(el.style.backgroundImage);
  });
  rootEl.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (img.currentSrc || img.src) urls.add(img.currentSrc || img.src);
  });

  if (urls.size > 0) {
    await Promise.all([...urls].map(ensureImageDecodedOnce));
  }

  // Wait for any WebGL depth-parallax canvases to finish uploading & drawing
  const startWait = performance.now();
  while (performance.now() - startWait < 4000) {
    const depthCanvases = rootEl.querySelectorAll<HTMLCanvasElement>("canvas.depth-parallax");
    const allDepthReady =
      depthCanvases.length === 0 ||
      Array.from(depthCanvases).every((c) => c.dataset.depthReady === "1");
    const videos = rootEl.querySelectorAll<HTMLVideoElement>("video.cin-preview-video");
    const allVideosReady =
      videos.length === 0 ||
      Array.from(videos).every((v) => !v.seeking);
    if (allDepthReady && allVideosReady) break;
    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
  }

  await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
  await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
}

declare global {
  interface Window {
    __render?: {
      ready: boolean;
      fps: number;
      from: number;
      to: number;
      totalFrames: number;
      getFrame: () => number;
      setFrame: (n: number) => Promise<number>;
      setOptions: (opts: { captions?: boolean; marks?: boolean; timecode?: boolean }) => void;
      renderAudioOffline: (
        fromFrame: number,
        toFrame: number,
        sampleRate?: number,
        normalize?: boolean,
        opticalEqOverride?: boolean,
      ) => Promise<string>;
      getSrt: (fromFrame: number, toFrame: number) => string;
      getFfmetadataChapters: (fromFrame: number, toFrame: number) => string;
      getAudioMixSpec: () => {
        resolvedAudioClips: ResolvedAudioClip[];
        trackMix: TrackMixMap;
        duckDepth: number;
        fps: number;
        totalFrames: number;
      };
    };
    __frame24?: {
      frameIds: string[];
      totalFrames: number;
      snapEnabled: boolean;
      getPlayhead: () => number;
      getPlayheadMs: () => number;
      setPlayhead: (frameNumber: number) => void;
      setFrame: (frameId: string) => void;
      getSelectedIds: () => string[];
      setSelectedIds: (ids: string[]) => void;
      getMultiSelection: () => MultiLaneSelection;
      getAudioClips: () => ResolvedAudioClip[];
      getWebAudioClock: () => {
        playing: boolean;
        playheadMs: number;
        activeSources: number;
        duckDepth: number;
      };
      getEditLabel: () => string;
      getDuration: (frameId: string) => number;
      getFrame: (frameId: string) => AnyRecord | undefined;
      getActiveTransition: () => AnyRecord | undefined;
      getMusicSpans: () => AnyRecord[];
      getTrackMix: () => TrackMixMap;
      getEffectiveTrackLevel: (track: TrackId) => number;
      getAudioVolumes: () => AnyRecord;
      getInspectorTab: () => InspectorTab;
      setInspectorTab: (tab: InspectorTab) => void;
      getMissingCount: () => number;
      resolveMedia: (ref: string | undefined) => string | undefined;
      getCaptionStyle: () => CaptionStyle;
      getActiveCaption: () => BeatCaption | undefined;
      getTimelineCaptions: () => ResolvedTimelineCaption[];
      getInOutMarks: () => { inFrame: number | null; outFrame: number | null; loop: boolean };
      setInOutMarks: (inFrame: number | null, outFrame: number | null) => void;
      setLoopPlayback: (loop: boolean) => void;
      exportSrtText: (sceneId?: string) => string;
      exportVttText: (sceneId?: string) => string;
    };
  }
}

const history = new UndoHistory<ProjectState>(100);
const audioController = new PreviewAudioController();
const IO_MARKS_SESSION_KEY = "frame24-io-marks";

function readStoredIoMarks(): { inFrame: number | null; outFrame: number | null } {
  try {
    const raw = sessionStorage.getItem(IO_MARKS_SESSION_KEY);
    if (!raw) return { inFrame: null, outFrame: null };
    const parsed = JSON.parse(raw) as { inFrame?: unknown; outFrame?: unknown };
    const inFrame =
      typeof parsed.inFrame === "number" && Number.isFinite(parsed.inFrame) && parsed.inFrame >= 0
        ? Math.floor(parsed.inFrame)
        : null;
    const outFrame =
      typeof parsed.outFrame === "number" && Number.isFinite(parsed.outFrame) && parsed.outFrame >= 0
        ? Math.floor(parsed.outFrame)
        : null;
    return { inFrame, outFrame };
  } catch {
    return { inFrame: null, outFrame: null };
  }
}

function writeStoredIoMarks(inFrame: number | null, outFrame: number | null): void {
  try {
    if (inFrame === null && outFrame === null) {
      sessionStorage.removeItem(IO_MARKS_SESSION_KEY);
    } else {
      sessionStorage.setItem(IO_MARKS_SESSION_KEY, JSON.stringify({ inFrame, outFrame }));
    }
  } catch {
    // Ignore storage errors
  }
}

function readStoredPlayhead(): number | null {
  try {
    const raw = sessionStorage.getItem(PLAYHEAD_SESSION_KEY);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredPlayhead(frame: number): void {
  try {
    sessionStorage.setItem(PLAYHEAD_SESSION_KEY, String(Math.max(0, Math.floor(frame))));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

function mergeProjectSummaries(existing: SavedProjectSummary[], incoming: SavedProjectSummary[]): SavedProjectSummary[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    const old = byId.get(item.id);
    if (!old || item.updatedAt >= old.updatedAt) byId.set(item.id, item);
  });
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [switchingProject, setSwitchingProject] = useState(false);
  const switchingProjectRef = useRef(false);
  const [publicPaths, setPublicPaths] = useState<Set<string>>(
    () => new Set((bundledMediaIndex as string[]).map(normalizeMediaPath)),
  );
  const [folderFiles, setFolderFiles] = useState<Map<string, File>>(new Map());
  const [folderLabel, setFolderLabel] = useState("");
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [voiceDurations, setVoiceDurations] = useState<Map<string, number>>(
    () => new Map(Object.entries(bundledAudioDurations as Record<string, number>)),
  );
  const [measuredMusicDurations, setMeasuredMusicDurations] = useState<Map<string, number>>(
    () => new Map(Object.entries(bundledAudioDurations as Record<string, number>)),
  );
  const [decodedAudioMs, setDecodedAudioMs] = useState<Map<string, number>>(() => new Map());
  const [trackMix, setTrackMix] = useState<TrackMixMap>(() => createDefaultTrackMix());
  const [duckDepth, setDuckDepth] = useState(DEFAULT_DUCK_DEPTH);
  const [mediaBinOpen, setMediaBinOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("clip");
  const inspectorTabRef = useRef<InspectorTab>("clip");
  inspectorTabRef.current = inspectorTab;

  const [playheadFrame, setPlayheadFrame] = useState(0);
  const playheadRef = useRef(0);
  playheadRef.current = playheadFrame;

  const [selectedFrameId, setSelectedFrameId] = useState("");
  const selectedFrameIdRef = useRef("");
  selectedFrameIdRef.current = selectedFrameId;
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedFrameIds;

  const [multiSelection, setMultiSelection] = useState<MultiLaneSelection>(EMPTY_MULTI_SELECTION);
  const multiSelectionRef = useRef<MultiLaneSelection>(EMPTY_MULTI_SELECTION);
  multiSelectionRef.current = multiSelection;

  const [multiClipboard, setMultiClipboard] = useState<MultiLaneClipboard | null>(null);
  const multiClipboardRef = useRef<MultiLaneClipboard | null>(null);
  multiClipboardRef.current = multiClipboard;

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [resizeLeaveGaps, setResizeLeaveGaps] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [copiedClips, setCopiedClips] = useState<BeatLike[]>([]);
  const copiedClipsRef = useRef<BeatLike[]>([]);
  copiedClipsRef.current = copiedClips;

  const [copiedEffects, setCopiedEffects] = useState<EffectBlock | null>(null);
  const [copiedAnimation, setCopiedAnimation] = useState<BeatAnimation | null>(null);
  const [copiedKeyframes, setCopiedKeyframes] = useState<CopiedKeyframeItem[]>([]);
  const copiedKeyframesRef = useRef<CopiedKeyframeItem[]>([]);
  copiedKeyframesRef.current = copiedKeyframes;
  const lastCopyModeRef = useRef<"keyframes" | "clips">("clips");
  const [curveEditor, setCurveEditor] = useState<{ frameId: string; prop: AnimProp } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saveStatus, setSaveStatus] = useState("LOADING");
  const [editLabel, setEditLabel] = useState("Ready");
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [uploadIntent, setUploadIntent] = useState<UploadIntent | null>(null);
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [playback, setPlayback] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [playSpeed, setPlaySpeed] = useState(1);
  const renderParams = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("render") !== "1") return null;
    const rawFrom = sp.get("from");
    const rawTo = sp.get("to");
    const parsedFrom =
      rawFrom !== null && rawFrom !== "" && Number.isFinite(Number(rawFrom))
        ? Math.max(0, Math.round(Number(rawFrom)))
        : 0;
    const parsedTo =
      rawTo !== null && rawTo !== "" && Number.isFinite(Number(rawTo))
        ? Math.max(parsedFrom, Math.round(Number(rawTo)))
        : null;
    const captionsParam = sp.get("captions") ?? sp.get("subs");
    const captions = captionsParam === null ? true : captionsParam !== "0";
    const marksParam = sp.get("marks");
    const tcParam = sp.get("tc");
    const marks = marksParam === null ? false : marksParam !== "0";
    const tc = tcParam === null ? marks : tcParam !== "0";
    const rawW = Number(sp.get("w"));
    const rawH = Number(sp.get("h"));
    const width = Number.isFinite(rawW) && rawW >= 320 ? Math.round(rawW) : 1920;
    const height = Number.isFinite(rawH) && rawH >= 180 ? Math.round(rawH) : 1080;
    const job = sp.get("job") || undefined;
    return { from: parsedFrom, to: parsedTo, captions, marks, tc, width, height, job };
  }, []);
  const isRenderMode = renderParams !== null;

  const [inPointFrame, setInPointFrameState] = useState<number | null>(() =>
    renderParams ? null : readStoredIoMarks().inFrame,
  );
  const [outPointFrame, setOutPointFrameState] = useState<number | null>(() =>
    renderParams ? null : readStoredIoMarks().outFrame,
  );
  const inPointRef = useRef<number | null>(inPointFrame);
  inPointRef.current = inPointFrame;
  const outPointRef = useRef<number | null>(outPointFrame);
  outPointRef.current = outPointFrame;

  const [loopPlayback, setLoopPlayback] = useState(false);
  const loopPlaybackRef = useRef(false);
  loopPlaybackRef.current = loopPlayback;

  const setInPoint = useCallback((frame: number | null) => {
    const clean = frame === null ? null : Math.max(0, Math.floor(frame));
    inPointRef.current = clean;
    setInPointFrameState(clean);
    if (clean !== null && outPointRef.current !== null && outPointRef.current < clean) {
      outPointRef.current = null;
      setOutPointFrameState(null);
      writeStoredIoMarks(clean, null);
    } else {
      writeStoredIoMarks(clean, outPointRef.current);
    }
  }, []);

  const setOutPoint = useCallback((frame: number | null) => {
    const clean = frame === null ? null : Math.max(0, Math.floor(frame));
    outPointRef.current = clean;
    setOutPointFrameState(clean);
    if (clean !== null && inPointRef.current !== null && inPointRef.current > clean) {
      inPointRef.current = null;
      setInPointFrameState(null);
      writeStoredIoMarks(null, clean);
    } else {
      writeStoredIoMarks(inPointRef.current, clean);
    }
  }, []);

  const clearInOutMarks = useCallback(() => {
    inPointRef.current = null;
    outPointRef.current = null;
    setInPointFrameState(null);
    setOutPointFrameState(null);
    writeStoredIoMarks(null, null);
  }, []);

  const [viewerZoom, setViewerZoom] = useState(1);
  const [showCaptions, setShowCaptions] = useState(() =>
    renderParams ? renderParams.captions : true,
  );
  const [showDepthMaps, setShowDepthMaps] = useState(true);
  const [showDepthMapOverlay, setShowDepthMapOverlay] = useState(false);
  const [showCutouts, setShowCutouts] = useState(true);
  const [mutedCutoutLayers, setMutedCutoutLayers] = useState<Set<number>>(() => new Set());
  const toggleMutedCutoutLayer = useCallback((layerIndex: number) => {
    setMutedCutoutLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerIndex)) next.delete(layerIndex);
      else next.add(layerIndex);
      return next;
    });
  }, []);
  const [ccStyleOpen, setCcStyleOpen] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState<SelectedCaptionState | null>(null);
  const selectedCaptionRef = useRef<SelectedCaptionState | null>(null);
  selectedCaptionRef.current = selectedCaption;
  const [showMarks, setShowMarks] = useState(() =>
    renderParams ? renderParams.marks : true,
  );
  const [showTimecodeOverlay, setShowTimecodeOverlay] = useState(() =>
    renderParams ? renderParams.tc : true,
  );
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [showOnionSkin, setShowOnionSkin] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;
  const [kenBurnsSuppressed, setKenBurnsSuppressed] = useState(false);
  const [kenBurnsDrawStep, setKenBurnsDrawStep] = useState<"start" | "end" | null>(null);
  const [kenBurnsDraftStart, setKenBurnsDraftStart] = useState<KenBurnsBox | null>(null);
  const [edgeWarningToken, setEdgeWarningToken] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [launderetteOpen, setLaunderetteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState<ExportTab>("bundle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [patchReport, setPatchReport] = useState<StudioPatchResult | null>(null);
  const [mp4Message, setMp4Message] = useState("");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [exportWholeFilm, setExportWholeFilm] = useState(true);
  const [exportFromFrame, setExportFromFrame] = useState(0);
  const [exportToFrame, setExportToFrame] = useState(0);
  const [captionsExport, setCaptionsExport] = useState(true);
  const [srtExport, setSrtExport] = useState(true);
  const [marksExport, setMarksExport] = useState(false);
  const [exportQuality, setExportQuality] = useState<Mp4ExportQuality>("master");
  const [exportCapture, setExportCapture] = useState<Mp4ExportCapture>("auto");
  // Start at the number of parallel render workers this machine can feed; an
  // export is CPU-bound per worker, so a single worker wastes most of a laptop.
  const [exportWorkers, setExportWorkers] = useState(() =>
    suggestExportWorkers(typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4),
  );
  const [exportGpu, setExportGpu] = useState(true);
  const [exportNormalize, setExportNormalize] = useState(false);
  const [exportLoudnessTarget, setExportLoudnessTarget] = useState<LoudnessTargetMode>("off");
  const [exportOpticalEq, setExportOpticalEq] = useState(false);
  const [exportEmbedChapters, setExportEmbedChapters] = useState(true);
  const [mp4Job, setMp4Job] = useState<Mp4ExportJobState | null>(null);
  const [comparePinned, setComparePinned] = useState(false);
  const [compareKeyHeld, setCompareKeyHeld] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState<DirectorsCutId>("uncut");
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotModal, setSnapshotModal] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsOpenRef = useRef(false);
  shortcutsOpenRef.current = shortcutsOpen;

  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => readStoredPaneSizes());
  const paneSizesRef = useRef<PaneSizes>(paneSizes);
  paneSizesRef.current = paneSizes;
  const [activePaneDrag, setActivePaneDrag] = useState<"inspector" | "timeline" | "mediabin" | null>(null);
  const paneDragSessionRef = useRef<{
    which: "inspector" | "timeline" | "mediabin";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startSize: number;
  } | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const renderShellRef = useRef<HTMLDivElement>(null);
  const lastFreeCaptionResultRef = useRef<{
    anchorFrameId: string;
    anchorCaptionIndex: number;
  } | null>(null);
  const copyEffectsRef = useRef<() => void>(() => undefined);
  const pasteEffectsRef = useRef<() => void>(() => undefined);
  const mp4PollTimerRef = useRef<number | null>(null);
  const activeMp4JobTokenRef = useRef<number>(0);
  const voiceDurationCache = useRef(new Map<string, number>());
  const attemptedVoiceRefs = useRef(new Set<string>(Object.keys(bundledAudioDurations as Record<string, number>)));
  const attemptedMusicRefs = useRef(new Set<string>(Object.keys(bundledAudioDurations as Record<string, number>)));
  const previewPlayerRef = useRef<HTMLAudioElement | null>(null);
  const dragBaseProjectRef = useRef<ProjectState | null>(null);
  const dragBaseSelectionRef = useRef<MultiLaneSelection>(EMPTY_MULTI_SELECTION);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    return webAudioEngine.onBufferDecoded((src, buffer) => {
      const durationMs = buffer.duration * 1000;
      if (!src || !Number.isFinite(durationMs) || durationMs <= 0) return;
      setDecodedAudioMs((prev) => {
        if (prev.get(src) === Math.round(durationMs)) return prev;
        const next = new Map(prev);
        next.set(src, Math.round(durationMs));
        return next;
      });
    });
  }, []);

  useEffect(() => {
    window.__sw_audio = audio;
    return () => {
      window.__sw_audio = undefined;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        const jobSnapshotPromise =
          renderParams?.job && window.location.protocol !== "file:"
            ? fetch(`/__api/export/project?id=${encodeURIComponent(renderParams.job)}`)
                .then((r) => (r.ok ? (r.json() as Promise<AnyRecord>) : null))
                .catch(() => null)
            : Promise.resolve(null);

        const [saved, mediaIndex, jobSnapshot] = await Promise.all([
          isRenderMode ? Promise.resolve(undefined) : loadActiveProject().catch(() => undefined),
          window.location.protocol === "file:"
            ? Promise.resolve([] as string[])
            : fetch("examples/media-index.json")
                .then((response) => (response.ok ? (response.json() as Promise<string[]>) : []))
                .catch(() => [] as string[]),
          jobSnapshotPromise,
        ]);
        const sourceEdits = bundledEdits as AnyRecord;
        const paths = new Set<string>([
          ...(bundledMediaIndex as string[]).map(normalizeMediaPath),
          ...mediaIndex.map(normalizeMediaPath),
        ]);
        if (!alive) return;
        setPublicPaths(paths);
        const initialVoiceDurations = new Map<string, number>(
          Object.entries(bundledAudioDurations as Record<string, number>),
        );
        const initialMusicDurations = extractKnownMusicDurations(sourceEdits);
        initialVoiceDurations.forEach((sec, ref) => {
          if (!initialMusicDurations.has(ref)) initialMusicDurations.set(ref, sec);
        });

        let initialProject: ProjectState;
        let statusLabel: string;
        if (jobSnapshot?.project?.story?.scenes?.length) {
          const snapProj = jobSnapshot.project as ProjectState;
          initialProject = {
            ...snapProj,
            importedMissing: snapProj.importedMissing || [],
            assets: snapProj.assets || [],
            snapshots: snapProj.snapshots || [],
          };
          if (jobSnapshot.trackMix) {
            setTrackMix(jobSnapshot.trackMix as TrackMixMap);
          }
          if (typeof jobSnapshot.duckDepth === "number") {
            setDuckDepth(jobSnapshot.duckDepth);
          }
          statusLabel = "RENDER JOB";
        } else if (jobSnapshot?.cliProjectPayload !== undefined) {
          const rawPayload = jobSnapshot.cliProjectPayload;
          const sourceName = String(jobSnapshot.cliSourceName || "cli-project.json");
          if (isStudioPatchPayload(rawPayload)) {
            const baseImported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
              voiceDurations: initialVoiceDurations,
            });
            const patchedStory = applyStudioPatchToStory(
              applyStudioMusicSync(baseImported.story, sourceEdits),
              rawPayload,
            );
            initialProject = createProjectState(
              { ...baseImported, story: patchedStory, sourceName },
              [],
              sourceEdits,
            );
          } else if (
            rawPayload &&
            typeof rawPayload === "object" &&
            !Array.isArray(rawPayload) &&
            (rawPayload as AnyRecord).story?.scenes?.length &&
            (rawPayload as AnyRecord).originalStory?.scenes?.length
          ) {
            const snapProj = rawPayload as ProjectState;
            initialProject = {
              ...snapProj,
              importedMissing: snapProj.importedMissing || [],
              assets: snapProj.assets || [],
              snapshots: snapProj.snapshots || [],
            };
          } else {
            const imported = parseImportPayload(rawPayload, sourceName, {
              voiceDurations: initialVoiceDurations,
            });
            const story =
              imported.story.id === "nobodys-witness-film"
                ? applyStudioMusicSync(imported.story, sourceEdits)
                : imported.story;
            const hydratedAssets: ProjectAsset[] = [];
            for (const row of imported.assets) {
              if (typeof row.id !== "string" || typeof row.dataUrl !== "string") continue;
              const blob = dataUrlToBlob(row.dataUrl);
              const type =
                row.type === "image" || row.type === "audio" || row.type === "video"
                  ? row.type
                  : "other";
              hydratedAssets.push({
                id: row.id,
                name: String(row.name || row.id),
                type,
                mime: String(row.mime || blob.type || "application/octet-stream"),
                size: Number(row.size || blob.size),
                uploadedAt: Number(row.uploadedAt || Date.now()),
                source: "bundle",
                blob,
              });
            }
            initialProject = createProjectState({ ...imported, story }, hydratedAssets, sourceEdits);
          }
          statusLabel = "CLI PROJECT";
        } else if (saved?.story?.scenes?.length) {
          const normalizedSaved: ProjectState = {
            ...saved,
            importedMissing: saved.importedMissing || [],
            assets: saved.assets || [],
            snapshots: saved.snapshots || [],
          };
          if (
            normalizedSaved.story.id === "nobodys-witness-film" &&
            (normalizedSaved.directorsCutVersion ?? 0) < DIRECTORS_CUT_VERSION
          ) {
            const preCutSnapshot = {
              id: "snapshot-pre-directors-cut",
              name: "Pre-Director's Cut Autosave",
              createdAt: normalizedSaved.updatedAt || Date.now(),
              story: JSON.parse(JSON.stringify(normalizedSaved.story)),
              ...(normalizedSaved.audioClips
                ? { audioClips: JSON.parse(JSON.stringify(normalizedSaved.audioClips)) }
                : {}),
            };
            const withPreSnap: ProjectState = {
              ...normalizedSaved,
              snapshots: [
                preCutSnapshot,
                ...normalizedSaved.snapshots.filter((s) => s.id !== preCutSnapshot.id),
              ],
            };
            initialProject = buildDirectorsCutById(
              withPreSnap,
              normalizedSaved.directorsCutId ?? "neo-noir",
              initialVoiceDurations,
              initialMusicDurations,
            );
            void saveActiveProject(initialProject).catch(() => {});
            statusLabel = getDirectorsCutLabel(initialProject.directorsCutId).toUpperCase();
          } else {
            initialProject = normalizedSaved.story.id === "nobodys-witness-film"
              ? { ...normalizedSaved, directorsCutId: normalizedSaved.directorsCutId ?? "neo-noir" }
              : normalizedSaved;
            statusLabel = normalizedSaved.story.id === "nobodys-witness-film"
              ? getDirectorsCutLabel(initialProject.directorsCutId).toUpperCase()
              : "SAVED TO THIS BROWSER";
          }
        } else {
          const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
            voiceDurations: initialVoiceDurations,
          });
          const contextual = { ...imported, story: applyStudioMusicSync(imported.story, sourceEdits) };
          const baseBundledProject = createProjectState(contextual, [], sourceEdits);
          initialProject = buildDirectorsCutProject(
            baseBundledProject,
            initialVoiceDurations,
            initialMusicDurations,
          );
          statusLabel = isRenderMode
            ? "RENDER MODE"
            : getDirectorsCutLabel(initialProject.directorsCutId).toUpperCase();
        }

        if (!Array.isArray(initialProject.audioClips)) {
          initialProject = {
            ...initialProject,
            audioClips: buildAudioClipsFromFilm(
              initialProject.story,
              initialVoiceDurations,
              extractKnownMusicDurations(initialProject.sourceEdits ?? sourceEdits),
            ),
          };
        }
        initialProject = upgradeSavedRecreatedUncut(initialProject);
        // CLI renders must reproduce their snapshot exactly; only interactive
        // built-in drafts receive the conservative opening-reference migration.
        if (!isRenderMode) initialProject = upgradeSweetJesusOpening(initialProject);
        initialProject.missing = evaluateMissingMedia(initialProject, new Map(), paths);

        projectRef.current = initialProject;
        setProject(initialProject);
        const builtFrames = buildKeyframes(initialProject.story);
        const { clips: builtClips, totalFrames: builtTotal } = buildTimelineClips(
          builtFrames,
          initialVoiceDurations,
        );
        setExportToFrame(Math.max(0, builtTotal - 1));
        const storedFrame = isRenderMode ? null : readStoredPlayhead();
        const openingSceneClip =
          builtClips.find((clip) => clip.keyframe.sceneId === "nw_s1") ||
          builtClips.find((clip) => clip.keyframe.mark === "77") ||
          builtClips[0];
        const startPlayhead = renderParams
          ? Math.max(0, Math.min(Math.max(0, builtTotal - 1), renderParams.from))
          : storedFrame !== null && storedFrame < builtTotal
            ? storedFrame
            : openingSceneClip?.startFrame ?? 0;
        const startClip = clipAtFrame(builtClips, startPlayhead) || openingSceneClip;
        playheadRef.current = startPlayhead;
        setPlayheadFrame(startPlayhead);
        setSelectedFrameId(startClip?.keyframe.id || "");
        setSelectedFrameIds(startClip ? [startClip.keyframe.id] : []);
        setMultiSelection({
          pictureIds: startClip ? [startClip.keyframe.id] : [],
          captions: [],
          audioClipIds: [],
          keyframes: [],
        });
        setSaveStatus(statusLabel);
        if (!isRenderMode) {
          void listSavedProjects().then((items) => {
            if (alive) setSavedProjects((old) => mergeProjectSummaries(old, items));
          });
        }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Unable to open this project.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, [isRenderMode, renderParams]);

  useEffect(() => {
    if (!loading && !isRenderMode) writeStoredPlayhead(playheadFrame);
  }, [loading, isRenderMode, playheadFrame]);

  const frames = useMemo(() => (project ? buildKeyframes(project.story) : []), [project?.story]);
  const { clips, totalFrames } = useMemo(
    () => buildTimelineClips(frames, voiceDurations),
    [frames, voiceDurations],
  );
  const resolvedTimelineCaptions = useMemo(
    () => resolveTimelineCaptions(clips),
    [clips],
  );
  const activeTimelineCaption = useMemo<ResolvedTimelineCaption | null>(
    () => activeTimelineCaptionAtFrame(resolvedTimelineCaptions, playheadFrame) ?? null,
    [resolvedTimelineCaptions, playheadFrame],
  );
  const noteMarkers = useMemo(() => project?.story.markers ?? [], [project?.story.markers]);

  useEffect(() => {
    if (totalFrames > 0 && playheadFrame >= totalFrames) {
      setPlayheadFrame(totalFrames - 1);
    }
  }, [totalFrames, playheadFrame]);

  const pictureRuns = useMemo(() => computePictureRuns(clips), [clips]);

  const activeClip = useMemo(
    () => clipAtFrame(clips, playheadFrame) || clips[0],
    [clips, playheadFrame],
  );
  const viewerFrame = activeClip?.keyframe;
  const viewerLocalFrame = activeClip
    ? Math.max(0, Math.min(activeClip.durationFrames - 1, playheadFrame - activeClip.startFrame))
    : 0;
  const activeRun = activeClip ? pictureRuns[activeClip.index] : undefined;
  const viewerPresetFrame = activeRun
    ? Math.max(0, playheadFrame - activeRun.runStartFrame)
    : viewerLocalFrame;
  const viewerShotKeyId = activeRun?.runKeyId ?? viewerFrame?.id;

  const activeTransition = useMemo(
    () => activeTransitionAtFrame(clips, playheadFrame),
    [clips, playheadFrame],
  );
  const outgoingRun = activeTransition ? pictureRuns[activeTransition.outgoingClip.index] : undefined;
  const incomingRun = activeTransition ? pictureRuns[activeTransition.incomingClip.index] : undefined;
  const outgoingPresetFrame = activeTransition
    ? outgoingRun
      ? Math.max(0, playheadFrame - outgoingRun.runStartFrame)
      : activeTransition.outLocalFrame
    : undefined;
  const incomingPresetFrame = activeTransition
    ? incomingRun
      ? Math.max(0, playheadFrame - incomingRun.runStartFrame)
      : activeTransition.inLocalFrame
    : undefined;
  const outgoingShotKeyId = activeTransition
    ? outgoingRun?.runKeyId ?? activeTransition.outgoingClip.keyframe.id
    : undefined;
  const incomingShotKeyId = activeTransition
    ? incomingRun?.runKeyId ?? activeTransition.incomingClip.keyframe.id
    : undefined;

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.keyframe.id === selectedFrameId) || activeClip,
    [clips, selectedFrameId, activeClip],
  );
  const selectedFrame = selectedClip?.keyframe;
  const inspectorLocalFrame = selectedClip
    ? Math.max(0, Math.min(selectedClip.durationFrames - 1, playheadFrame - selectedClip.startFrame))
    : 0;
  const currentIndex = activeClip?.index ?? 0;

  const cropPositionForPicture = useCallback(
    (pic?: string) => {
      if (!pic?.startsWith("asset:")) return undefined;
      const asset = project?.assets.find((item) => item.id === pic.slice(6));
      return asset?.crop ? `${asset.crop.x}% ${asset.crop.y}%` : undefined;
    },
    [project?.assets],
  );

  const viewerImagePosition = cropPositionForPicture(viewerFrame?.picture);

  useEffect(() => {
    const next = new Map<string, string>();
    project?.assets.forEach((asset) => {
      if (asset.blob) next.set(`asset:${asset.id}`, URL.createObjectURL(asset.blob));
      else if (asset.dataUrl) next.set(`asset:${asset.id}`, asset.dataUrl);
    });
    folderFiles.forEach((file, path) => next.set(path, URL.createObjectURL(file)));
    setObjectUrls(next);
    return () => {
      next.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [project?.assets, folderFiles]);

  const resolveMedia = useCallback(
    (value: string | undefined): string | undefined => {
      if (!value || /^(?:gradient:|emoji:)/i.test(value)) return undefined;
      if (/^(?:data:|blob:|https?:\/\/)/i.test(value)) return value;
      const assetId = value.match(/(?:^|:)asset:([^/?#]+)/)?.[1];
      if (assetId) return objectUrls.get(`asset:${assetId}`);
      const path = referencedPath(value);
      if (!path) return undefined;
      const linked = objectUrls.get(path);
      if (linked) return linked;
      if (hasPublicMediaPath(publicPaths, path)) {
        const encoded = encodeMediaPath(path);
        const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
        if (isDev && typeof window !== "undefined" && window.location.protocol !== "file:") {
          return `/${encoded}`;
        }
        return `${SCARLETT_WITNESS_RAW_BASE}/${encoded}`;
      }
      return undefined;
    },
    [objectUrls, publicPaths],
  );

  useEffect(() => {
    let cancelled = false;
    const seen = new Set<string>();
    const pending: Array<{ ref: string; src: string }> = [];
    for (const frame of frames) {
      const ref = frame.beat.audioUrl;
      if (!ref || seen.has(ref) || voiceDurations.has(ref) || attemptedVoiceRefs.current.has(ref)) continue;
      seen.add(ref);
      const src = resolveMedia(ref);
      if (src) {
        attemptedVoiceRefs.current.add(ref);
        pending.push({ ref, src });
      }
    }
    if (!pending.length) return;
    void (async () => {
      const measured = new Map<string, number>();
      const batch = pending.slice(0, 96);
      for (let i = 0; i < batch.length; i += 12) {
        if (cancelled) return;
        const slice = batch.slice(i, i + 12);
        const results = await Promise.all(
          slice.map(async (item) => ({
            ref: item.ref,
            sec: await measureAudioDuration(item.src, voiceDurationCache.current),
          })),
        );
        for (const r of results) {
          if (r.sec !== undefined && r.sec > 0) measured.set(r.ref, r.sec);
        }
      }
      if (!cancelled && measured.size > 0) {
        setVoiceDurations((prev) => {
          const next = new Map(prev);
          measured.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frames, resolveMedia, voiceDurations]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const seen = new Set<string>();
    const pending: Array<{ ref: string; src: string }> = [];
    for (const scene of project.story.scenes) {
      const ref = scene.musicUrl || scene.sceneAudioUrl;
      if (!ref || seen.has(ref) || measuredMusicDurations.has(ref) || attemptedMusicRefs.current.has(ref)) continue;
      seen.add(ref);
      const src = resolveMedia(ref);
      if (src) {
        attemptedMusicRefs.current.add(ref);
        pending.push({ ref, src });
      }
    }
    if (!pending.length) return;
    void (async () => {
      const measured = new Map<string, number>();
      const results = await Promise.all(
        pending.map(async (item) => ({
          ref: item.ref,
          sec: await measureAudioDuration(item.src, voiceDurationCache.current),
        })),
      );
      for (const r of results) {
        if (r.sec !== undefined && r.sec > 0) measured.set(r.ref, r.sec);
      }
      if (!cancelled && measured.size > 0) {
        setMeasuredMusicDurations((prev) => {
          const next = new Map(prev);
          measured.forEach((v, k) => next.set(k, v));
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, resolveMedia, measuredMusicDurations]);

  const musicDurations = useMemo(() => {
    const combined = extractKnownMusicDurations(project?.sourceEdits ?? bundledEdits);
    measuredMusicDurations.forEach((sec, ref) => {
      combined.set(ref, sec);
    });
    return combined;
  }, [project?.sourceEdits, measuredMusicDurations]);

  const audioDurationSecondsMap = useMemo(() => {
    const out = new Map<string, number>();
    voiceDurations.forEach((sec, ref) => {
      if (sec > 0) out.set(ref, sec);
    });
    musicDurations.forEach((sec, ref) => {
      if (sec > 0) out.set(ref, sec);
    });
    decodedAudioMs.forEach((ms, ref) => {
      if (ms > 0) out.set(ref, ms / 1000);
    });
    return out;
  }, [voiceDurations, musicDurations, decodedAudioMs]);

  const fileDurationMap = useMemo(() => {
    const out = new Map<string, number>();
    voiceDurations.forEach((sec, ref) => {
      if (sec > 0) out.set(ref, Math.round(sec * 1000));
    });
    musicDurations.forEach((sec, ref) => {
      if (sec > 0) out.set(ref, Math.round(sec * 1000));
    });
    decodedAudioMs.forEach((ms, ref) => {
      if (ms > 0) out.set(ref, Math.round(ms));
    });
    return out;
  }, [voiceDurations, musicDurations, decodedAudioMs]);

  const resolvedAudioClips = useMemo(
    () => resolveAudioClips(project?.audioClips ?? [], clips),
    [project?.audioClips, clips],
  );

  // Ensure any pre-existing/HMR-preserved project without `audioClips` builds them immediately
  useEffect(() => {
    if (!project || Array.isArray(project.audioClips)) return;
    const built = buildAudioClipsFromFilm(project.story, voiceDurations, musicDurations);
    const upgraded: ProjectState = { ...project, audioClips: built };
    projectRef.current = upgraded;
    setProject(upgraded);
  }, [project, voiceDurations, musicDurations]);

  useEffect(() => {
    audioController.setTimeline(clips, totalFrames, musicDurations);
  }, [clips, totalFrames, musicDurations]);

  useEffect(() => {
    audioController.setTrackMix(trackMix);
    webAudioEngine.setTrackMix(trackMix);
  }, [trackMix]);

  useEffect(() => {
    webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
  }, [resolvedAudioClips, resolveMedia]);

  useEffect(() => {
    webAudioEngine.setSoundEnabled(soundOn);
  }, [soundOn]);

  const activeCutOptions = useMemo(
    () => effectiveFilmCutOptions(project),
    [project?.cutOptions, project?.story.cutOptions, project?.story.id],
  );

  useEffect(() => {
    webAudioEngine.setDuckDepth(duckDepth);
  }, [duckDepth]);

  useEffect(() => {
    webAudioEngine.setOpticalPrintEq(activeCutOptions.opticalPrintEq);
  }, [activeCutOptions.opticalPrintEq]);

  useEffect(() => {
    if (isRenderMode) return;
    const isTypingEl = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "\\" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingEl(e.target)) {
        if (!e.repeat) setCompareKeyHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "\\") setCompareKeyHeld(false);
    };
    const onBlur = () => setCompareKeyHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [isRenderMode]);

  const activeAudioClip = useMemo<ResolvedAudioClip | undefined>(() => {
    if (multiSelection.audioClipIds.length > 0) {
      const explicit = resolvedAudioClips.find((c) => c.id === multiSelection.audioClipIds[0]);
      if (explicit) return explicit;
    }
    const tab = inspectorTab;
    if (tab !== "voice" && tab !== "sfx" && tab !== "music" && tab !== "ambience") {
      return undefined;
    }
    if (!selectedClip) return undefined;
    const anchored = resolvedAudioClips.find(
      (c) => c.lane === tab && c.anchorId === selectedClip.keyframe.id,
    );
    if (anchored) return anchored;
    const clipStartMs = frameToMs(selectedClip.startFrame);
    const clipEndMs = frameToMs(selectedClip.endFrame);
    return resolvedAudioClips.find(
      (c) => c.lane === tab && c.startMs < clipEndMs && c.endMs > clipStartMs,
    );
  }, [multiSelection.audioClipIds, resolvedAudioClips, inspectorTab, selectedClip]);

  const handleToggleTrackMute = useCallback((track: TrackId) => {
    setTrackMix((prev) => ({
      ...prev,
      [track]: { ...prev[track], mute: !prev[track].mute },
    }));
  }, []);

  const handleToggleTrackSolo = useCallback((track: TrackId) => {
    setTrackMix((prev) => ({
      ...prev,
      [track]: { ...prev[track], solo: !prev[track].solo },
    }));
  }, []);

  const handleSetTrackLevel = useCallback((track: TrackId, level: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));
    setTrackMix((prev) => ({
      ...prev,
      [track]: { ...prev[track], level: clamped },
    }));
  }, []);

  useEffect(() => {
    if (!project) return;
    const missing = evaluateMissingMedia(project, folderFiles, publicPaths);
    if (missing.length !== project.missing.length || missing.some((item, index) => item !== project.missing[index])) {
      setProject({ ...project, missing });
    }
  }, [project, folderFiles, publicPaths]);

  useEffect(() => {
    if (!project || isRenderMode) return;
    const timer = window.setTimeout(() => {
      if (switchingProjectRef.current || projectRef.current !== project) return;
      setSaveStatus("SAVING…");
      void saveActiveProject(project)
        .then(() => {
          if (!switchingProjectRef.current && projectRef.current === project) setSaveStatus("SAVED TO THIS BROWSER");
        })
        .catch(() => {
          if (!switchingProjectRef.current && projectRef.current === project) setSaveStatus("AUTOSAVE FAILED");
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [project, isRenderMode]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const session = paneDragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      if (session.which === "inspector") {
        const dx = session.startClientX - e.clientX;
        const maxW = Math.min(680, Math.max(300, window.innerWidth - 360));
        const nextW = Math.max(260, Math.min(maxW, Math.round(session.startSize + dx)));
        setPaneSizes((prev) => ({ ...prev, inspectorWidth: nextW }));
      } else if (session.which === "timeline") {
        const dy = session.startClientY - e.clientY;
        const maxH = Math.min(820, Math.max(240, window.innerHeight - 210));
        const nextH = Math.max(180, Math.min(maxH, Math.round(session.startSize + dy)));
        setPaneSizes((prev) => ({ ...prev, timelineHeight: nextH }));
      } else if (session.which === "mediabin") {
        const dx = e.clientX - session.startClientX;
        const maxW = Math.min(520, Math.max(220, window.innerWidth - 520));
        const nextW = Math.max(180, Math.min(maxW, Math.round(session.startSize + dx)));
        setPaneSizes((prev) => ({ ...prev, mediaBinWidth: nextW }));
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      const session = paneDragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      paneDragSessionRef.current = null;
      setActivePaneDrag(null);
      writeStoredPaneSizes(paneSizesRef.current);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, []);

  useEffect(() => {
    const el = previewStageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setViewerZoom((z) => {
        const delta = event.deltaY < 0 ? 0.15 : -0.15;
        return Math.max(0.5, Math.min(3, Math.round((z + delta) * 100) / 100));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const applyProject = useCallback((next: ProjectState, label: string) => {
    const previous = projectRef.current;
    if (!previous || next === previous) return;
    history.record(previous);
    projectRef.current = next;
    setProject(next);
    setEditLabel(label);
    setSaveStatus("UNSAVED CHANGES");
    setHistoryVersion((value) => value + 1);
  }, []);

  const editProject = useCallback(
    (update: (current: ProjectState) => ProjectState, label: string) => {
      const current = projectRef.current;
      if (!current) return;
      applyProject(update(current), label);
    },
    [applyProject],
  );

  const beginDragEdit = useCallback(() => {
    if (projectRef.current) {
      history.beginDrag(projectRef.current);
      dragBaseProjectRef.current = projectRef.current;
      dragBaseSelectionRef.current = multiSelectionRef.current;
    }
  }, []);

  const previewProjectEdit = useCallback((update: (current: ProjectState) => ProjectState) => {
    const current = projectRef.current;
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    projectRef.current = next;
    setProject(next);
    setSaveStatus("UNSAVED CHANGES");
  }, []);

  const endDragEdit = useCallback((label: string) => {
    const current = projectRef.current;
    dragBaseProjectRef.current = null;
    if (!current) return;
    if (!label) {
      history.cancelDrag();
      return;
    }
    if (history.commitDrag(current)) {
      setEditLabel(label);
      setHistoryVersion((value) => value + 1);
    }
  }, []);

  const syncSelectionAfterProjectChange = useCallback(
    (nextProject: ProjectState) => {
      const nextFrames = buildKeyframes(nextProject.story);
      const { clips: nextClips, totalFrames: nextTotal } = buildTimelineClips(nextFrames, voiceDurations);
      const validIds = new Set(nextFrames.map((f) => f.id));
      const validAudioIds = new Set((nextProject.audioClips ?? []).map((a) => a.id));
      const kept = selectedIdsRef.current.filter((id) => validIds.has(id));
      const keptAudio = multiSelectionRef.current.audioClipIds.filter((id) => validAudioIds.has(id));
      const clampedPlayhead = Math.max(0, Math.min(Math.max(0, nextTotal - 1), playheadRef.current));
      setPlayheadFrame(clampedPlayhead);
      if (kept.length > 0) {
        setSelectedFrameIds(kept);
        setSelectedFrameId((prev) => (kept.includes(prev) ? prev : kept[0]));
      } else {
        const hit = clipAtFrame(nextClips, clampedPlayhead) || nextClips[0];
        setSelectedFrameId(hit?.keyframe.id || "");
        setSelectedFrameIds(keptAudio.length > 0 ? [] : hit ? [hit.keyframe.id] : []);
      }
      setMultiSelection((prev) => ({
        pictureIds: prev.pictureIds.filter((id) => validIds.has(id)),
        captions: prev.captions.filter((c) => validIds.has(c.frameId)),
        audioClipIds: keptAudio,
        keyframes: prev.keyframes.filter((k) => validIds.has(k.frameId)),
      }));
    },
    [voiceDurations],
  );

  const undo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const previous = history.undo(current);
    if (!previous) return;
    projectRef.current = previous;
    setProject(previous);
    setEditLabel("Undo");
    setSaveStatus("UNSAVED CHANGES");
    setHistoryVersion((value) => value + 1);
    syncSelectionAfterProjectChange(previous);
  }, [syncSelectionAfterProjectChange]);

  const redo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const next = history.redo(current);
    if (!next) return;
    projectRef.current = next;
    setProject(next);
    setEditLabel("Redo");
    setSaveStatus("UNSAVED CHANGES");
    setHistoryVersion((value) => value + 1);
    syncSelectionAfterProjectChange(next);
  }, [syncSelectionAfterProjectChange]);

  const scrubToFrame = useCallback(
    (targetFrame: number) => {
      const clamped = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame)));
      if (playback) {
        setPlayback(false);
        webAudioEngine.stop();
        audioController.stopAll();
      } else if (soundOn) {
        webAudioEngine.scrub(frameToMs(clamped));
      }
      setPlayheadFrame(clamped);
      const hit = clipAtFrame(clips, clamped);
      if (hit) {
        setSelectedFrameId(hit.keyframe.id);
        const curSel = multiSelectionRef.current;
        const hasOtherLaneSel =
          curSel.audioClipIds.length > 0 ||
          curSel.captions.length > 0 ||
          curSel.keyframes.length > 0;
        if (!hasOtherLaneSel) {
          setSelectedFrameIds((prev) =>
            prev.length > 1 && prev.includes(hit.keyframe.id) ? prev : [hit.keyframe.id],
          );
          setMultiSelection((prev) =>
            prev.pictureIds.length > 1 && prev.pictureIds.includes(hit.keyframe.id)
              ? prev
              : {
                  pictureIds: [hit.keyframe.id],
                  captions: [],
                  audioClipIds: [],
                  keyframes: [],
                },
          );
        }
      }
    },
    [clips, playback, soundOn, totalFrames],
  );

  const stepFrames = useCallback(
    (delta: number) => {
      scrubToFrame(playheadRef.current + delta);
    },
    [scrubToFrame],
  );

  const setSelection = useCallback(
    (ids: string[], primaryId: string, targetFrame?: number) => {
      const cleanIds = ids.length ? ids : primaryId ? [primaryId] : [];
      selectedIdsRef.current = cleanIds;
      setSelectedFrameIds(cleanIds);
      if (primaryId || cleanIds[0]) {
        setSelectedFrameId(primaryId || cleanIds[0]);
      }
      setSelectedCaption(null);
      const nextMulti: MultiLaneSelection = {
        pictureIds: cleanIds,
        captions: [],
        audioClipIds: [],
        keyframes: [],
      };
      multiSelectionRef.current = nextMulti;
      setMultiSelection(nextMulti);
      if (targetFrame !== undefined) {
        if (playback) {
          setPlayback(false);
          webAudioEngine.stop();
          audioController.stopAll();
        }
        setPlayheadFrame(Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame))));
      }
    },
    [playback, totalFrames],
  );

  const handleSetMultiSelection = useCallback(
    (next: MultiLaneSelection, primaryFrameId?: string, targetFrame?: number) => {
      multiSelectionRef.current = next;
      selectedIdsRef.current = next.pictureIds;
      setMultiSelection(next);
      setSelectedFrameIds(next.pictureIds);
      if (primaryFrameId) {
        setSelectedFrameId(primaryFrameId);
      } else if (next.pictureIds.length > 0) {
        setSelectedFrameId((prev) =>
          next.pictureIds.includes(prev) ? prev : next.pictureIds[0],
        );
      } else if (next.audioClipIds.length > 0) {
        const hitAudio = resolvedAudioClips.find((c) => c.id === next.audioClipIds[0]);
        if (hitAudio) {
          setSelectedFrameId(hitAudio.anchorId);
          setInspectorTab(hitAudio.lane);
        }
      } else if (next.captions.length > 0) {
        setSelectedFrameId(next.captions[0].frameId);
      } else if (next.keyframes.length > 0) {
        setSelectedFrameId(next.keyframes[0].frameId);
      }
      if (targetFrame !== undefined) {
        if (playback) {
          setPlayback(false);
          webAudioEngine.stop();
          audioController.stopAll();
        }
        setPlayheadFrame(Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame))));
      }
      if (next.captions.length > 0) {
        const firstFrameId = next.captions[0].frameId;
        setSelectedCaption({
          frameId: firstFrameId,
          indices: next.captions
            .filter((c) => c.frameId === firstFrameId)
            .map((c) => c.index),
        });
      } else {
        setSelectedCaption(null);
      }
    },
    [playback, resolvedAudioClips, totalFrames],
  );

  const selectAllImages = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const ids = imageFrameIds(clips.map(clip => clip.keyframe), current.assets);
    if (!ids.length) return;
    const primary = ids.includes(selectedFrameId) ? selectedFrameId : ids[0];
    setSelection(ids, primary);
    setInspectorTab("clip");
    setEditLabel(`Selected ${ids.length} image frames`);
  }, [clips, selectedFrameId, setSelection]);

  const clearAllSelection = useCallback(() => {
    multiSelectionRef.current = EMPTY_MULTI_SELECTION;
    selectedIdsRef.current = [];
    setMultiSelection(EMPTY_MULTI_SELECTION);
    setSelectedFrameIds([]);
    setSelectedCaption(null);
    setEditingMarkerId(null);
    setCcStyleOpen(false);
  }, []);

  const selectRelativeClip = useCallback(
    (delta: number) => {
      if (!clips.length) return;
      const baseIndex = selectedClip?.index ?? 0;
      const next = clips[Math.max(0, Math.min(clips.length - 1, baseIndex + delta))];
      if (next) setSelection([next.keyframe.id], next.keyframe.id, next.startFrame);
    },
    [clips, selectedClip, setSelection],
  );

  const handleMoveClips = useCallback(
    (frameIds: string[], destination: ReorderDestination) => {
      const current = projectRef.current;
      if (!current || !frameIds.length) return;
      const result = reorderKeyframeWithResult(current, frameIds, destination);
      if (result.project === current) return;
      const label = destination.copy
        ? `Copied ${result.resultIds.length} clip${result.resultIds.length === 1 ? "" : "s"}`
        : `Moved ${result.resultIds.length} clip${result.resultIds.length === 1 ? "" : "s"}`;
      applyProject(result.project, label);
      if (result.resultIds.length > 0) {
        const nextClips = buildTimelineClips(buildKeyframes(result.project.story), voiceDurations).clips;
        const firstMoved = nextClips.find((c) => c.keyframe.id === result.resultIds[0]);
        setSelectedFrameIds(result.resultIds);
        setSelectedFrameId(result.resultIds[0]);
        setMultiSelection({
          pictureIds: result.resultIds,
          captions: [],
          audioClipIds: [],
          keyframes: [],
        });
        if (firstMoved) setPlayheadFrame(firstMoved.startFrame);
      }
    },
    [applyProject, voiceDurations],
  );

  const handleNudgeClips = useCallback(
    (frameIds: string[], delta: -1 | 1) => {
      const current = projectRef.current;
      if (!current || !frameIds.length) return;
      const result = reorderKeyframeWithResult(current, frameIds, delta);
      if (result.project === current) return;
      applyProject(
        result.project,
        delta < 0 ? "Clip moved earlier" : "Clip moved later",
      );
      if (result.resultIds.length > 0) {
        setSelectedFrameIds(result.resultIds);
        setSelectedFrameId(result.resultIds[0]);
        setMultiSelection({
          pictureIds: result.resultIds,
          captions: [],
          audioClipIds: [],
          keyframes: [],
        });
      }
    },
    [applyProject],
  );

  const handleCopyClips = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const sel = multiSelectionRef.current;
    if (sel.keyframes.length > 0 && sel.pictureIds.length === 0 && sel.audioClipIds.length === 0 && sel.captions.length === 0) {
      const items = copySelectedKeyframes(clips, sel.keyframes);
      if (!items.length) return;
      copiedKeyframesRef.current = items;
      setCopiedKeyframes(items);
      lastCopyModeRef.current = "keyframes";
      setEditLabel(`Copied ${items.length} keyframe${items.length === 1 ? "" : "s"}`);
      return;
    }
    lastCopyModeRef.current = "clips";
    if (
      sel.audioClipIds.length > 0 ||
      sel.captions.length > 0 ||
      (sel.pictureIds.length > 0 && (sel.audioClipIds.length > 0 || sel.captions.length > 0))
    ) {
      const clipBoard = copyMultiSelection(current, sel, voiceDurations);
      if (!clipBoard) return;
      setMultiClipboard(clipBoard);
      if (clipBoard.beats.length > 0) setCopiedClips(clipBoard.beats);
      const parts: string[] = [];
      if (clipBoard.beats.length) parts.push(`${clipBoard.beats.length} shot${clipBoard.beats.length === 1 ? "" : "s"}`);
      if (clipBoard.audioClips.length) parts.push(`${clipBoard.audioClips.length} sound${clipBoard.audioClips.length === 1 ? "" : "s"}`);
      setEditLabel(`Copied ${parts.join(" + ") || "selection"}`);
      return;
    }
    const ids = sel.pictureIds.length
      ? sel.pictureIds
      : selectedIdsRef.current.length
        ? selectedIdsRef.current
        : selectedFrameId
          ? [selectedFrameId]
          : [];
    if (!ids.length) return;
    const beats = copySelectedBeats(current, ids);
    if (!beats.length) return;
    setMultiClipboard(null);
    setCopiedClips(beats);
    setEditLabel(`Copied ${beats.length} clip${beats.length === 1 ? "" : "s"}`);
  }, [clips, selectedFrameId, voiceDurations]);

  const handlePasteClips = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    if (lastCopyModeRef.current === "keyframes" && copiedKeyframesRef.current.length > 0) {
      const explicitSelected = clips.find((c) => c.keyframe.id === selectedFrameId);
      const underPlayhead = clipAtFrame(clips, playheadRef.current);
      const targetClip =
        explicitSelected &&
        playheadRef.current >= explicitSelected.startFrame &&
        playheadRef.current < explicitSelected.endFrame
          ? explicitSelected
          : underPlayhead || explicitSelected;
      if (!targetClip) return;
      const inTarget =
        playheadRef.current >= targetClip.startFrame && playheadRef.current < targetClip.endFrame;
      const anchorLocal = inTarget ? playheadRef.current - targetClip.startFrame : 0;
      const res = pasteCopiedKeyframesAt(
        targetClip.keyframe.beat.animation,
        copiedKeyframesRef.current,
        anchorLocal,
        targetClip.durationFrames,
      );
      const msg =
        res.droppedCount > 0
          ? `Pasted ${res.pastedCount} keyframe${res.pastedCount === 1 ? "" : "s"} (${res.droppedCount} dropped after clip end)`
          : `Pasted ${res.pastedCount} keyframe${res.pastedCount === 1 ? "" : "s"}`;
      if (res.pastedCount > 0) {
        applyProject(
          setBeatAnimation(current, targetClip.keyframe.id, res.animation),
          msg,
        );
        const nextSel: MultiLaneSelection = {
          pictureIds: [],
          captions: [],
          audioClipIds: [],
          keyframes: res.pastedKeys.map((k) => ({
            frameId: targetClip.keyframe.id,
            prop: k.prop,
            frame: k.frame,
          })),
        };
        multiSelectionRef.current = nextSel;
        setMultiSelection(nextSel);
      } else {
        setEditLabel(msg);
      }
      return;
    }
    const mClip = multiClipboardRef.current;
    if (mClip && (mClip.audioClips.length > 0 || mClip.beats.length > 0 || mClip.standaloneCaptions.length > 0)) {
      const result = pasteMultiSelectionAt(current, mClip, playheadRef.current, voiceDurations);
      if (!result) return;
      applyProject(result.project, "Pasted selection");
      handleSetMultiSelection(result.selection);
      return;
    }
    const beats = copiedClipsRef.current;
    if (!beats.length) return;
    const result = pasteKeyframesAt(current, beats, playheadRef.current, voiceDurations);
    if (!result) return;
    applyProject(
      result.project,
      `Pasted ${result.insertedIds.length} clip${result.insertedIds.length === 1 ? "" : "s"}`,
    );
    setSelectedFrameIds(result.insertedIds);
    setSelectedFrameId(result.insertedIds[0] || "");
    setMultiSelection({
      pictureIds: result.insertedIds,
      captions: [],
      audioClipIds: [],
      keyframes: [],
    });
  }, [applyProject, clips, handleSetMultiSelection, selectedFrameId, voiceDurations]);

  const jumpPrevKeyframe = useCallback(() => {
    const targetClip = selectedClip || clipAtFrame(clips, playheadRef.current);
    if (!targetClip) return;
    const localCur = playheadRef.current - targetClip.startFrame;
    const prevLocal = prevKeyframeFrameOnClip(
      targetClip.keyframe.beat.animation,
      localCur,
      targetClip.durationFrames,
    );
    if (prevLocal !== undefined) {
      scrubToFrame(targetClip.startFrame + prevLocal);
      setEditLabel(`Keyframe +${prevLocal}f`);
    }
  }, [clips, scrubToFrame, selectedClip]);

  const jumpNextKeyframe = useCallback(() => {
    const targetClip = selectedClip || clipAtFrame(clips, playheadRef.current);
    if (!targetClip) return;
    const localCur = playheadRef.current - targetClip.startFrame;
    const nextLocal = nextKeyframeFrameOnClip(
      targetClip.keyframe.beat.animation,
      localCur,
      targetClip.durationFrames,
    );
    if (nextLocal !== undefined) {
      scrubToFrame(targetClip.startFrame + nextLocal);
      setEditLabel(`Keyframe +${nextLocal}f`);
    }
  }, [clips, scrubToFrame, selectedClip]);

  const handleAddMarkerAtPlayhead = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const defaultName = `Note ${(current.story.markers?.length ?? 0) + 1}`;
    const { project: next, marker } = addNoteMarker(current, playheadRef.current, defaultName);
    applyProject(next, `Marker "${marker.name}" added`);
    setEditingMarkerId(marker.id);
  }, [applyProject]);

  const handleSetTransition = useCallback(
    (
      incomingFrameId: string,
      kind: TransitionKind,
      durationFrames: number,
      previewOnly = false,
      alignment?: TransitionAlignment,
    ) => {
      if (previewOnly) {
        previewProjectEdit((current) =>
          setCutTransition(current, incomingFrameId, kind, durationFrames, alignment),
        );
      } else {
        editProject(
          (current) => setCutTransition(current, incomingFrameId, kind, durationFrames, alignment),
          `Transition: ${kind}${kind === "cut" ? "" : ` (${durationFrames}f)`}`,
        );
      }
    },
    [editProject, previewProjectEdit],
  );

  const setFocalPoint = useCallback(
    (value: string) => {
      if (!viewerFrame) return;
      editProject(
        (current) => setEffectField(current, viewerFrame.id, "cinematic.focalPoint", value),
        "Focal point changed",
      );
    },
    [editProject, viewerFrame],
  );

  const setFramePicture = useCallback(
    (picture?: string) => {
      if (!selectedFrame) return;
      editProject(
        (current) => setPicture(current, selectedFrame.id, picture),
        picture ? "Picture changed" : "Picture removed",
      );
    },
    [editProject, selectedFrame],
  );

  const assignAudioAssetToLane = useCallback(
    (lane: AudioLaneId, assetRef: string, label: string) => {
      if (!selectedClip) return;
      const knownDurMs = fileDurationMap.get(assetRef);
      const targetClip =
        activeAudioClip && activeAudioClip.lane === lane
          ? activeAudioClip
          : resolvedAudioClips.find(
              (c) => c.lane === lane && c.anchorId === selectedClip.keyframe.id,
            );
      if (targetClip) {
        editProject(
          (current) =>
            updateAudioClip(current, targetClip.id, {
              src: assetRef,
              inMs: 0,
              ...(knownDurMs ? { durationMs: knownDurMs } : {}),
            }),
          label,
        );
        setMultiSelection({
          pictureIds: [],
          captions: [],
          audioClipIds: [targetClip.id],
          keyframes: [],
        });
      } else {
        const newId = `ac-${lane}-${crypto.randomUUID().slice(0, 8)}`;
        const defaultDur =
          knownDurMs ??
          (lane === "sfx"
            ? 1500
            : Math.max(1000, frameToMs(selectedClip.durationFrames)));
        const newClip: AudioClip = {
          id: newId,
          lane,
          src: assetRef,
          anchorId: selectedClip.keyframe.id,
          offsetMs: 0,
          inMs: 0,
          durationMs: defaultDur,
          gain: lane === "voice" ? 1 : lane === "sfx" ? 0.85 : lane === "music" ? 0.7 : 0.6,
          fadeInMs: lane === "music" || lane === "ambience" ? 500 : 0,
          fadeOutMs: lane === "music" || lane === "ambience" ? 500 : 0,
          ...(lane === "ambience" ? { loop: true } : {}),
        };
        editProject(
          (current) => setAudioClips(current, [...(current.audioClips ?? []), newClip]),
          label,
        );
        setMultiSelection({
          pictureIds: [],
          captions: [],
          audioClipIds: [newId],
          keyframes: [],
        });
      }
    },
    [activeAudioClip, editProject, fileDurationMap, resolvedAudioClips, selectedClip],
  );

  const openBrowser = useCallback(
    (kind: "image" | "audio", target: BrowseTarget, frameId?: string) =>
      setBrowser({ kind, target, frameId }),
    [],
  );

  const chooseBrowserAsset = useCallback(
    (asset: BrowserAsset) => {
      const target = browser?.target;
      const targetFrameId = browser?.frameId || selectedFrame?.id;
      if (!project || !selectedFrame || !target || !targetFrameId) return;
      if (target === "picture") setFramePicture(asset.ref);
      else if (target === "scenePicture")
        editProject(
          (current) => setSceneField(current, selectedFrame.sceneId, "background", asset.ref),
          "Scene plate changed",
        );
      else if (target === "depthMap")
        editProject(
          (current) => setFrameDepthMap(current, targetFrameId, asset.ref),
          "Depth map changed",
        );
      else if (target === "depthPlate")
        editProject(
          (current) => setFrameDepthPlate(current, targetFrameId, asset.ref),
          "Clean plate changed",
        );
      else if (target === "cutout:add")
        editProject(
          (current) => addFrameCutout(current, targetFrameId, asset.ref).project,
          "Cutout layer added",
        );
      else if (target.startsWith("cutout:")) {
        const layerIndex = Number(target.split(":")[1]) || 0;
        editProject(
          (current) => setFrameCutoutLayer(current, targetFrameId, layerIndex, { image: asset.ref }),
          `Cutout ${layerIndex + 1} changed`,
        );
      } else if (target === "foregroundImage")
        editProject(
          (current) => setEffectField(current, targetFrameId, `cinematic.${target}`, asset.ref),
          `${target} changed`,
        );
      else if (target === "voice")
        assignAudioAssetToLane("voice", asset.ref, "Voice take changed");
      else if (target === "sfx")
        assignAudioAssetToLane("sfx", asset.ref, "Sound effect changed");
      else if (target === "music")
        assignAudioAssetToLane("music", asset.ref, "Music cue changed");
      else if (target === "ambience" || target.startsWith("ambience:"))
        assignAudioAssetToLane("ambience", asset.ref, "Ambience file changed");
      setBrowser(null);
    },
    [assignAudioAssetToLane, browser, editProject, project, selectedFrame, setFramePicture],
  );

  const imageInputRefTarget = useCallback(
    (kind: "image" | "audio", target: UploadIntent["target"], explicitFrameId?: string) => {
      const fid = explicitFrameId || selectedFrame?.id;
      if (!fid) return;
      setUploadIntent({ kind, target, frameId: fid });
      window.setTimeout(() => (kind === "image" ? imageInputRef.current : audioInputRef.current)?.click(), 0);
    },
    [selectedFrame],
  );

  async function saveUploadedFile(file: File, intent: UploadIntent): Promise<void> {
    const current = projectRef.current;
    if (!current) return;
    if (intent.kind === "image" && !file.type.startsWith("image/")) return;
    if (intent.kind === "audio" && !file.type.startsWith("audio/")) return;
    const asset = await createUploadAsset(file);
    const latest = projectRef.current;
    if (switchingProjectRef.current || !latest || latest.id !== current.id) {
      setLoadError("The film changed during the upload. Please upload the file again.");
      return;
    }
    let next: ProjectState = { ...latest, assets: [...latest.assets, asset], updatedAt: Date.now() };
    const assetRef = `asset:${asset.id}`;
    let historyLabel = `${intent.kind === "image" ? "Picture" : "Sound"} uploaded`;
    if (intent.target === "picture") {
      next = setPicture(next, intent.frameId, assetRef);
    } else if (intent.target === "depthMap") {
      next = setFrameDepthMap(next, intent.frameId, assetRef);
      historyLabel = "Depth map uploaded";
    } else if (intent.target === "depthPlate") {
      next = setFrameDepthPlate(next, intent.frameId, assetRef);
      historyLabel = "Clean plate uploaded";
    } else if (intent.target === "cutout:add") {
      next = addFrameCutout(next, intent.frameId, assetRef).project;
      historyLabel = "Cutout layer uploaded";
    } else if (intent.target.startsWith("cutout:")) {
      const layerIndex = Number(intent.target.split(":")[1]) || 0;
      next = setFrameCutoutLayer(next, intent.frameId, layerIndex, { image: assetRef });
      historyLabel = `Cutout ${layerIndex + 1} uploaded`;
    } else if (
      intent.target === "voice" ||
      intent.target === "sfx" ||
      intent.target === "music" ||
      intent.target === "ambience"
    ) {
      const lane: AudioLaneId = intent.target;
      const newClip: AudioClip = {
        id: `ac-${lane}-${crypto.randomUUID().slice(0, 8)}`,
        lane,
        src: assetRef,
        anchorId: intent.frameId,
        offsetMs: 0,
        inMs: 0,
        durationMs: lane === "sfx" ? 1500 : 4000,
        gain: lane === "voice" ? 1 : lane === "sfx" ? 0.85 : 0.7,
        fadeInMs: 0,
        fadeOutMs: 0,
      };
      next = setAudioClips(next, [...(next.audioClips ?? []), newClip]);
    }
    applyProject(next, historyLabel);
    setSelectedFrameId(intent.frameId);
    setSelectedFrameIds([intent.frameId]);
    if (
      intent.target === "picture" &&
      asset.type === "image" &&
      asset.width &&
      asset.height &&
      Math.abs(asset.width / asset.height - 16 / 9) > 0.015
    ) {
      setCropState({ assetId: asset.id, frameId: intent.frameId, x: 50, y: 50 });
    }
  }

  const onUploadInput = (event: ChangeEvent<HTMLInputElement>, kind: "image" | "audio") => {
    const file = event.target.files?.[0];
    if (file && uploadIntent?.kind === kind) void saveUploadedFile(file, uploadIntent);
    event.target.value = "";
  };

  const handleFolderPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files || [])];
    const files = new Map<string, File>();
    for (const file of picked) {
      const path = folderFilePath(file);
      if (/\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp3|wav|ogg|m4a|aac|mp4|webm)$/i.test(path)) files.set(path, file);
    }
    setFolderFiles(files);
    const first = (picked[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath;
    setFolderLabel(first?.split("/")[0] || "public folder");
    setSaveStatus("MEDIA FOLDER LINKED");
    event.target.value = "";
  };

  async function handleImportFile(file: File): Promise<void> {
    const startingProjectId = projectRef.current?.id;
    const raw = await file.text();
    if (switchingProjectRef.current || projectRef.current?.id !== startingProjectId) {
      throw new Error("The film changed during import. Please import the file again.");
    }
    const imported = parseImportPayload(raw, file.name, { voiceDurations });
    const sourceEdits = imported.story.id === "nobodys-witness-film"
      ? projectRef.current?.sourceEdits ?? (bundledEdits as AnyRecord)
      : undefined;
    const story =
      imported.story.id === "nobodys-witness-film" && sourceEdits
        ? applyStudioMusicSync(imported.story, sourceEdits)
        : imported.story;
    const assets: ProjectAsset[] = [];
    for (const row of imported.assets) {
      if (typeof row.id !== "string" || typeof row.dataUrl !== "string") continue;
      const blob = dataUrlToBlob(row.dataUrl);
      const type = row.type === "image" || row.type === "audio" || row.type === "video" ? row.type : "other";
      assets.push({
        id: row.id,
        name: String(row.name || row.id),
        type,
        mime: String(row.mime || blob.type || "application/octet-stream"),
        size: Number(row.size || blob.size),
        uploadedAt: Number(row.uploadedAt || Date.now()),
        source: "bundle",
        blob,
      });
    }
    let next = createProjectState({ ...imported, story }, assets, sourceEdits);
    if (!Array.isArray(next.audioClips)) {
      next = {
        ...next,
        audioClips: buildAudioClipsFromFilm(
          next.story,
          voiceDurations,
          extractKnownMusicDurations(sourceEdits ?? bundledEdits),
        ),
      };
    }
    next.missing = evaluateMissingMedia(next, folderFiles, publicPaths);
    const previous = projectRef.current;
    if (previous) {
      await saveActiveProject(previous);
      if (switchingProjectRef.current || projectRef.current !== previous) {
        throw new Error("The current film changed while saving. Please import again.");
      }
      setSavedProjects((old) => mergeProjectSummaries(old, [{ id: previous.id, title: previous.title, updatedAt: Date.now() }]));
    }
    history.clear();
    setHistoryVersion((value) => value + 1);
    projectRef.current = next;
    setProject(next);
    const ordered = buildKeyframes(next.story);
    const built = buildTimelineClips(ordered, voiceDurations).clips;
    const start = built.find((clip) => clip.keyframe.mark === "77") || built[0];
    setPlayheadFrame(start?.startFrame ?? 0);
    setSelectedFrameId(start?.keyframe.id || "");
    setSelectedFrameIds(start ? [start.keyframe.id] : []);
    setMultiSelection({
      pictureIds: start ? [start.keyframe.id] : [],
      captions: [],
      audioClipIds: [],
      keyframes: [],
    });
    setBrowser(null);
    setCharactersOpen(false);
    setLaunderetteOpen(false);
    setExportOpen(false);
    setEditLabel(`Imported ${file.name}`);
    setSaveStatus("IMPORT COMPLETE");
    void listSavedProjects().then((items) => setSavedProjects((old) => mergeProjectSummaries(old, items)));
  }

  async function handleImportInput(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await handleImportFile(file);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Import failed.");
      }
    }
    event.target.value = "";
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-frame-id]");
    const frameId = target?.dataset.frameId || selectedFrame?.id;
    const image = [...event.dataTransfer.files].find((file) => file.type.startsWith("image/"));
    if (image && frameId) void saveUploadedFile(image, { kind: "image", target: "picture", frameId });
  };

  const handleTimelineDrop = useCallback((file: File, frameId: string) => {
    void saveUploadedFile(file, { kind: "image", target: "picture", frameId });
  }, []);

  const imageBrowserItems = useMemo<BrowserAsset[]>(() => {
    if (!project) return [];
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const output = new Map<string, BrowserAsset>();
    for (const ref of collectImageReferences(project.story, project.assets)) {
      const assetId = ref.match(/(?:^|:)asset:([^/?#]+)/)?.[1];
      const asset = assetId ? assets.get(assetId) : undefined;
      const path = referencedPath(ref) || "";
      const name = asset?.name || path.split("/").pop() || ref;
      output.set(ref, {
        id: ref,
        ref,
        name,
        folder: asset ? (asset.source === "upload" ? "Uploads" : "Project library") : path.split("/").slice(0, -1).join("/"),
        src: resolveMedia(ref),
        size: asset?.size || folderFiles.get(path)?.size,
        missing: !resolveMedia(ref) && !ref.startsWith("gradient:"),
        source: asset?.source || "Project film",
      });
    }
    for (const [path, file] of folderFiles) {
      if (!/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(path)) continue;
      const ref = `/${path}`;
      if (!output.has(ref)) {
        output.set(ref, {
          id: ref,
          ref,
          name: file.name,
          folder: path.split("/").slice(0, -1).join("/"),
          src: resolveMedia(ref),
          size: file.size,
          source: "Linked public folder",
        });
      }
    }
    for (const path of publicPaths) {
      if (!/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)$/i.test(path)) continue;
      const ref = `/${path}`;
      if (!output.has(ref)) {
        output.set(ref, {
          id: ref,
          ref,
          name: path.split("/").pop() || path,
          folder: path.split("/").slice(0, -1).join("/"),
          src: resolveMedia(ref),
          source: "scarlett-witness",
        });
      }
    }
    return [...output.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  }, [project, resolveMedia, folderFiles, publicPaths]);

  const audioBrowserItems = useMemo<BrowserAsset[]>(() => {
    if (!project) return [];
    const output = new Map<string, BrowserAsset>();
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const refs = new Set(
      collectMediaReferences(project.story, project.audioClips).filter(
        (value) => /\.(?:mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i.test(value) || value.startsWith("asset:"),
      ),
    );
    project.assets.filter((asset) => asset.type === "audio").forEach((asset) => refs.add(`asset:${asset.id}`));
    refs.forEach((ref) => {
      const assetId = ref.match(/(?:^|:)asset:([^/?#]+)/)?.[1];
      const asset = assetId ? assets.get(assetId) : undefined;
      const path = referencedPath(ref) || "";
      const file = folderFiles.get(path);
      output.set(ref, {
        id: ref,
        ref,
        name: asset?.name || path.split("/").pop() || ref,
        folder: asset ? (asset.source === "upload" ? "Uploads" : "Project library") : path.split("/").slice(0, -1).join("/"),
        src: resolveMedia(ref),
        size: asset?.size || file?.size,
        missing: !resolveMedia(ref),
        source: asset?.source || "Project film",
      });
    });
    for (const [path, file] of folderFiles) {
      if (!/\.(?:mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) continue;
      const ref = `/${path}`;
      if (!output.has(ref)) {
        output.set(ref, {
          id: ref,
          ref,
          name: file.name,
          folder: path.split("/").slice(0, -1).join("/"),
          src: resolveMedia(ref),
          size: file.size,
          source: "Linked public folder",
        });
      }
    }
    for (const path of publicPaths) {
      if (!/\.(?:mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) continue;
      const ref = `/${path}`;
      if (!output.has(ref)) {
        output.set(ref, {
          id: ref,
          ref,
          name: path.split("/").pop() || path,
          folder: path.split("/").slice(0, -1).join("/"),
          src: resolveMedia(ref),
          source: "scarlett-witness",
        });
      }
    }

    const target = browser?.target || "";
    const sceneVoiceFolder = selectedFrame ? `film/voice/s${String(selectedFrame.mark).toLowerCase()}` : "";
    const scoreItem = (item: BrowserAsset): number => {
      if (item.folder === "Uploads") return 0;
      if (target === "voice") {
        if (sceneVoiceFolder && item.folder.toLowerCase() === sceneVoiceFolder) return 1;
        if (item.folder.startsWith("film/voice")) return 2;
        return 5;
      }
      if (target === "sfx") {
        const lower = item.name.toLowerCase();
        if (item.folder.includes("sfx") && !lower.startsWith("amb-") && !lower.startsWith("loop-")) return 1;
        if (item.folder.includes("sfx")) return 2;
        return 5;
      }
      if (target === "music") {
        if (item.folder === "film/audio" || item.folder.startsWith("audio")) return 1;
        return 5;
      }
      if (target === "ambience" || target.startsWith("ambience:")) {
        const lower = item.name.toLowerCase();
        if (lower.startsWith("amb-") || lower.startsWith("loop-") || lower.includes("rain") || lower.includes("room-tone")) {
          return 1;
        }
        if (item.folder.includes("sfx")) return 2;
        return 5;
      }
      return 3;
    };

    return [...output.values()].sort(
      (a, b) => scoreItem(a) - scoreItem(b) || a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name),
    );
  }, [project, resolveMedia, folderFiles, publicPaths, browser?.target, selectedFrame]);

  const stopPlaybackAndAudio = useCallback(() => {
    setPlayback(false);
    webAudioEngine.stop();
    audioController.stopAll();
  }, []);

  async function switchFilm(id: string): Promise<void> {
    const previous = projectRef.current;
    if (!previous || previous.id === id || switchingProjectRef.current) return;
    switchingProjectRef.current = true;
    setSwitchingProject(true);
    setSaveStatus("SAVING…");
    setLoadError("");
    stopPlaybackAndAudio();
    previewPlayerRef.current?.pause();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let changedActiveRecord = false;
    try {
      // Preserve even very recent edits before leaving, including imported projects.
      await saveActiveProject(previous);
      let next = await loadSavedProject(id) ?? createBundledFilm(id, voiceDurations, musicDurations);
      if (!next) throw new Error("That film could not be found in browser storage.");
      next = {
        ...next,
        assets: next.assets || [],
        snapshots: next.snapshots || [],
        importedMissing: next.importedMissing || [],
      };
      if (!Array.isArray(next.audioClips)) {
        next = { ...next, audioClips: buildAudioClipsFromFilm(next.story, voiceDurations, musicDurations) };
      }
      next = upgradeSavedRecreatedUncut(next);
      next = upgradeSweetJesusOpening(next);
      next.missing = evaluateMissingMedia(next, folderFiles, publicPaths);
      const ordered = buildKeyframes(next.story);
      const built = buildTimelineClips(ordered, voiceDurations);
      if (!built.clips.length) throw new Error("This film has no playable storyboard frames.");
      if (projectRef.current !== previous) throw new Error("The current film changed while saving. Please try switching again.");
      await saveActiveProject(next);
      changedActiveRecord = true;
      if (projectRef.current !== previous) throw new Error("The current film changed while saving. Please try switching again.");

      history.clear();
      setHistoryVersion((value) => value + 1);
      setSavedProjects((old) => mergeProjectSummaries(old, [{ id: previous.id, title: previous.title, updatedAt: Date.now() }]));
      projectRef.current = next;
      setProject(next);
      const first = next.story.id === "nobodys-witness-film"
        ? built.clips.find((clip) => clip.keyframe.sceneId === "nw_s1") ?? built.clips[0]
        : built.clips[0];
      playheadRef.current = first.startFrame;
      setPlayheadFrame(first.startFrame);
      setSelectedFrameId(first.keyframe.id);
      setSelectedFrameIds([first.keyframe.id]);
      setMultiSelection({ pictureIds: [first.keyframe.id], captions: [], audioClipIds: [], keyframes: [] });
      setSelectedCaption(null);
      setCurveEditor(null);
      setBrowser(null);
      setUploadIntent(null);
      setCropState(null);
      setCharactersOpen(false);
      setLaunderetteOpen(false);
      setExportOpen(false);
      setComparePinned(false);
      setCompareKeyHeld(false);
      clearInOutMarks();
      setRangeStart(0);
      setRangeEnd(null);
      setExportWholeFilm(true);
      setExportFromFrame(0);
      setExportToFrame(Math.max(0, built.totalFrames - 1));
      setEditLabel(next.story.id === "sweet-jesus-film" ? "Storyboard draft" : "Film opened");
      setSaveStatus("SAVED TO THIS BROWSER");
      void listSavedProjects().then((items) => setSavedProjects((old) => mergeProjectSummaries(old, items)));
    } catch (error) {
      // If a late edit raced the switch, restore the active pointer to that edit.
      if ((changedActiveRecord || projectRef.current !== previous) && projectRef.current) {
        try { await saveActiveProject(projectRef.current); } catch { /* Surface the original error below. */ }
      }
      setLoadError(error instanceof Error ? error.message : "Could not switch films.");
      setSaveStatus("AUTOSAVE FAILED");
    } finally {
      switchingProjectRef.current = false;
      setSwitchingProject(false);
    }
  }

  const startPlaybackFromCurrent = useCallback(
    (forceLoop = false) => {
      if (!project || !clips.length) return;
      webAudioEngine.unlock();
      const maxIdx = Math.max(0, totalFrames - 1);
      const isLoop = forceLoop || loopPlaybackRef.current;
      let startAt = playheadRef.current >= maxIdx ? 0 : playheadRef.current;
      if (isLoop) {
        const effIn = inPointRef.current !== null ? Math.max(0, Math.min(maxIdx, inPointRef.current)) : 0;
        const effOut =
          outPointRef.current !== null ? Math.max(effIn, Math.min(maxIdx, outPointRef.current)) : maxIdx;
        if (
          playheadRef.current < effIn ||
          playheadRef.current > effOut ||
          (effOut > effIn && playheadRef.current >= effOut)
        ) {
          startAt = effIn;
        }
      }
      if (startAt !== playheadRef.current) {
        playheadRef.current = startAt;
        setPlayheadFrame(startAt);
      }
      webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
      webAudioEngine.setSoundEnabled(soundOn);
      webAudioEngine.setTrackMix(trackMix);
      webAudioEngine.setDuckDepth(duckDepth);
      webAudioEngine.startPlayback(frameToMs(startAt), 1);
      setDirection(1);
      setPlaySpeed(1);
      setPlayback(true);
    },
    [
      project,
      clips.length,
      totalFrames,
      resolvedAudioClips,
      resolveMedia,
      soundOn,
      trackMix,
      duckDepth,
    ],
  );

  const togglePlayback = useCallback(() => {
    if (!project || !clips.length) return;
    if (playback) {
      stopPlaybackAndAudio();
      return;
    }
    startPlaybackFromCurrent(false);
  }, [playback, project, clips.length, stopPlaybackAndAudio, startPlaybackFromCurrent]);

  const toggleLoopShortcut = useCallback(() => {
    if (!project || !clips.length) return;
    if (playback && loopPlaybackRef.current) {
      stopPlaybackAndAudio();
      return;
    }
    loopPlaybackRef.current = true;
    setLoopPlayback(true);
    if (playback) {
      const maxIdx = Math.max(0, totalFrames - 1);
      const effIn = inPointRef.current !== null ? Math.max(0, Math.min(maxIdx, inPointRef.current)) : 0;
      const effOut =
        outPointRef.current !== null ? Math.max(effIn, Math.min(maxIdx, outPointRef.current)) : maxIdx;
      if (playheadRef.current < effIn || playheadRef.current > effOut) {
        playheadRef.current = effIn;
        setPlayheadFrame(effIn);
        webAudioEngine.seek(frameToMs(effIn), playSpeed);
      }
      return;
    }
    startPlaybackFromCurrent(true);
  }, [project, clips.length, playback, totalFrames, playSpeed, stopPlaybackAndAudio, startPlaybackFromCurrent]);

  const nativeFsEnteredRef = useRef(false);

  const exitFullscreenPlayback = useCallback(() => {
    setIsFullscreen(false);
    isFullscreenRef.current = false;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      nativeFsEnteredRef.current = false;
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  const toggleFullscreenPlayback = useCallback(() => {
    if (isFullscreenRef.current) {
      exitFullscreenPlayback();
      return;
    }
    setIsFullscreen(true);
    isFullscreenRef.current = true;
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen?.()
        .then(() => {
          nativeFsEnteredRef.current = true;
        })
        .catch(() => undefined);
    }
    if (!playback) {
      startPlaybackFromCurrent();
    }
  }, [exitFullscreenPlayback, playback, startPlaybackFromCurrent]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFsChange = () => {
      if (!document.fullscreenElement && nativeFsEnteredRef.current) {
        nativeFsEnteredRef.current = false;
        setIsFullscreen(false);
        isFullscreenRef.current = false;
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    setKenBurnsSuppressed(false);
    setKenBurnsDrawStep(null);
    setKenBurnsDraftStart(null);
  }, [selectedFrameId]);

  useEffect(() => {
    if (!playback || !totalFrames) return;
    let rafId = 0;

    if (direction > 0) {
      if (!webAudioEngine.isPlaying) {
        webAudioEngine.unlock();
        webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
        webAudioEngine.setSoundEnabled(soundOn);
        webAudioEngine.setTrackMix(trackMix);
        webAudioEngine.setDuckDepth(duckDepth);
        webAudioEngine.startPlayback(frameToMs(playheadRef.current), playSpeed);
      }

      const tickForward = () => {
        // Master clock: strictly derived from AudioContext.currentTime inside webAudioEngine.
        const currentMs = webAudioEngine.getCurrentPlayheadMs();
        const nextFrame = Math.floor((currentMs * FPS) / 1000);
        const maxIdx = Math.max(0, totalFrames - 1);

        if (loopPlaybackRef.current) {
          const effIn =
            inPointRef.current !== null ? Math.max(0, Math.min(maxIdx, inPointRef.current)) : 0;
          const effOut =
            outPointRef.current !== null ? Math.max(effIn, Math.min(maxIdx, outPointRef.current)) : maxIdx;
          const loopEndExclusiveMs = frameToMs(effOut + 1);
          if (currentMs >= loopEndExclusiveMs) {
            webAudioEngine.seek(frameToMs(effIn), playSpeed);
            playheadRef.current = effIn;
            setPlayheadFrame(effIn);
            const loopHit = clipAtFrame(clips, effIn);
            if (loopHit) setSelectedFrameId(loopHit.keyframe.id);
            rafId = requestAnimationFrame(tickForward);
            return;
          }
        }

        if (nextFrame >= maxIdx) {
          setPlayheadFrame(maxIdx);
          const endClip = clipAtFrame(clips, maxIdx);
          if (endClip) setSelectedFrameId(endClip.keyframe.id);
          stopPlaybackAndAudio();
          return;
        }
        if (nextFrame !== playheadRef.current) {
          setPlayheadFrame(nextFrame);
          const hit = clipAtFrame(clips, nextFrame);
          if (hit) {
            setSelectedFrameId(hit.keyframe.id);
            const curSel = multiSelectionRef.current;
            if (
              curSel.audioClipIds.length === 0 &&
              curSel.captions.length === 0 &&
              curSel.keyframes.length === 0 &&
              curSel.pictureIds.length <= 1
            ) {
              selectedIdsRef.current = [hit.keyframe.id];
              setSelectedFrameIds([hit.keyframe.id]);
              const nextSel: MultiLaneSelection = {
                pictureIds: [hit.keyframe.id],
                captions: [],
                audioClipIds: [],
                keyframes: [],
              };
              multiSelectionRef.current = nextSel;
              setMultiSelection(nextSel);
            }
          }
        }
        rafId = requestAnimationFrame(tickForward);
      };

      rafId = requestAnimationFrame(tickForward);
      return () => cancelAnimationFrame(rafId);
    }

    // Reverse shuttle (J key): step backward smoothly while Web Audio stays stopped.
    webAudioEngine.stop();
    const anchorFrame = playheadRef.current;
    let reverseSteps = 0;
    const tickReverse = () => {
      reverseSteps += Math.max(1, playSpeed);
      const nextFrame = anchorFrame - Math.floor(reverseSteps / 2);
      if (nextFrame <= 0) {
        setPlayheadFrame(0);
        if (clips[0]) setSelectedFrameId(clips[0].keyframe.id);
        stopPlaybackAndAudio();
        return;
      }
      if (nextFrame !== playheadRef.current) {
        setPlayheadFrame(nextFrame);
        const hit = clipAtFrame(clips, nextFrame);
        if (hit) setSelectedFrameId(hit.keyframe.id);
      }
      rafId = requestAnimationFrame(tickReverse);
    };
    rafId = requestAnimationFrame(tickReverse);
    return () => cancelAnimationFrame(rafId);
  }, [
    playback,
    direction,
    playSpeed,
    totalFrames,
    clips,
    resolvedAudioClips,
    resolveMedia,
    soundOn,
    trackMix,
    duckDepth,
    stopPlaybackAndAudio,
  ]);

  const moveCue = useCallback(
    (kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => {
      const current = projectRef.current;
      if (!current || sourceId === targetId) return;
      if (kind === "sfx") {
        applyProject(moveSfxCue(current, sourceId, targetId), "Sound cue moved");
        return;
      }
      const next = cloneProjectStory(current.story);
      const sourceFrame = buildKeyframes(next).find((frame) => frame.id === sourceId);
      const targetFrame = buildKeyframes(next).find((frame) => frame.id === targetId);
      if (!sourceFrame || !targetFrame || sourceFrame.sceneId === targetFrame.sceneId) return;
      const sourceScene = next.scenes.find((scene) => scene.id === sourceFrame.sceneId);
      const targetScene = next.scenes.find((scene) => scene.id === targetFrame.sceneId);
      if (!sourceScene || !targetScene) return;
      if (kind === "music") {
        for (const key of [
          "musicUrl",
          "sceneAudioUrl",
          "musicMode",
          "musicLoop",
          "musicLevel",
          "musicFadeSeconds",
          "musicFadeOutSeconds",
        ]) {
          if (sourceScene[key] !== undefined) targetScene[key] = sourceScene[key];
          delete sourceScene[key];
        }
      } else {
        targetScene.ambientAudio = sourceScene.ambientAudio;
        delete sourceScene.ambientAudio;
      }
      applyProject(
        { ...current, story: next, updatedAt: Date.now() },
        kind === "music" ? "Music cue moved" : "Ambience cue moved",
      );
    },
    [applyProject],
  );

  const canSplit = useMemo(() => {
    if (selectedCaption) {
      if (selectedCaption.indices.length !== 1) return false;
      const clip = clips.find(c => c.keyframe.id === selectedCaption.frameId);
      if (!clip) return false;
      return splitCaptionAtFrame(clip.keyframe.beat, clip.durationFrames,
        selectedCaption.indices[0], playheadFrame - clip.startFrame).didSplit;
    }
    return Boolean(selectedClip && playheadFrame > selectedClip.startFrame && playheadFrame < selectedClip.endFrame);
  }, [selectedCaption, selectedClip, clips, playheadFrame]);

  const splitAtPlayhead = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const selected = selectedCaptionRef.current;
    if (selected) {
      if (selected.indices.length !== 1) return;
      const clip = clips.find(c => c.keyframe.id === selected.frameId);
      if (!clip) return;
      const index = selected.indices[0];
      const result = splitCaptionAtFrame(clip.keyframe.beat, clip.durationFrames, index,
        playheadRef.current - clip.startFrame);
      if (!result.didSplit) return;
      applyProject(setBeatCaptions(current, clip.keyframe.id, result.captions, clip.durationFrames), "Caption split at playhead");
      const nextSel = { frameId: clip.keyframe.id, indices: [index + 1] };
      selectedCaptionRef.current = nextSel;
      setSelectedCaption(nextSel);
      setMultiSelection({ pictureIds: [], captions: [{ frameId: clip.keyframe.id, index: index + 1 }], audioClipIds: [], keyframes: [] });
      return;
    }
    if (!selectedClip) return;
    const localOffset = playheadRef.current - selectedClip.startFrame;
    if (localOffset <= 0 || localOffset >= selectedClip.durationFrames) return;
    const audioRef = selectedClip.keyframe.beat.audioUrl;
    const voiceSec = audioRef ? voiceDurations.get(audioRef) : undefined;
    const result = splitKeyframeAt(current, selectedClip.keyframe.id, localOffset, voiceSec);
    if (!result) return;
    applyProject(result.project, "Clip split at playhead");
    setSelectedFrameId(result.rightId);
    setSelectedFrameIds([result.rightId]);
    setMultiSelection({ pictureIds: [result.rightId], captions: [], audioClipIds: [], keyframes: [] });
  }, [applyProject, clips, selectedClip, voiceDurations]);

  const captionStyle = useMemo<CaptionStyle>(
    () => normalizeCaptionStyle(project?.story.captionStyle ?? DEFAULT_CAPTION_STYLE),
    [project?.story.captionStyle],
  );

  const canMergeCaptions = useMemo(() => {
    if (!selectedClip || !selectedCaption) return false;
    if (selectedCaption.frameId !== selectedClip.keyframe.id) return false;
    if (selectedCaption.indices.length !== 2) return false;
    const [a, b] = selectedCaption.indices;
    const caps = effectiveCaptionsForBeat(
      selectedClip.keyframe.beat,
      selectedClip.durationFrames,
    );
    return (
      Math.abs(a - b) === 1 &&
      Math.min(a, b) >= 0 &&
      Math.max(a, b) < caps.length
    );
  }, [selectedCaption, selectedClip]);

  const handleSelectCaption = useCallback(
    (
      frameId: string,
      captionIndex: number,
      extendNeighbour: boolean,
      targetFrame?: number,
    ) => {
      setSelectedFrameId(frameId);
      setSelectedFrameIds([]);
      setInspectorTab("clip");
      if (targetFrame !== undefined) {
        if (playback) stopPlaybackAndAudio();
        setPlayheadFrame(Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame))));
      }
      setSelectedCaption((prev) => {
        let nextSel: SelectedCaptionState;
        if (
          extendNeighbour &&
          prev &&
          prev.frameId === frameId &&
          prev.indices.length >= 1
        ) {
          const anchor = prev.indices[prev.indices.length - 1];
          if (Math.abs(captionIndex - anchor) === 1) {
            nextSel = {
              frameId,
              indices: [Math.min(anchor, captionIndex), Math.max(anchor, captionIndex)],
            };
          } else {
            nextSel = { frameId, indices: [captionIndex] };
          }
        } else {
          nextSel = { frameId, indices: [captionIndex] };
        }
        setMultiSelection({
          pictureIds: [],
          captions: nextSel.indices.map((idx) => ({ frameId, index: idx })),
          audioClipIds: [],
          keyframes: [],
        });
        return nextSel;
      });
    },
    [playback, stopPlaybackAndAudio, totalFrames],
  );

  const handleCommitCaptions = useCallback(
    (
      frameId: string,
      captions: BeatCaption[],
      clipDurationFrames: number,
      label: string,
      nextSelectedIndices?: number[],
    ) => {
      editProject(
        (current) => setBeatCaptions(current, frameId, captions, clipDurationFrames),
        label,
      );
      if (nextSelectedIndices !== undefined) {
        setSelectedCaption(
          nextSelectedIndices.length > 0
            ? { frameId, indices: nextSelectedIndices }
            : null,
        );
        setMultiSelection((prev) => ({
          ...prev,
          captions: nextSelectedIndices.map((index) => ({ frameId, index })),
        }));
      }
    },
    [editProject],
  );

  const handleCaptionPreview = useCallback(
    (frameId: string, captions: BeatCaption[], clipDurationFrames: number) => {
      previewProjectEdit((current) =>
        setBeatCaptions(current, frameId, captions, clipDurationFrames),
      );
    },
    [previewProjectEdit],
  );

  const handleBeginFreeCaptionDrag = useCallback(() => {
    lastFreeCaptionResultRef.current = null;
    beginDragEdit();
  }, [beginDragEdit]);

  const handlePreviewFreeCaptionMove = useCallback(
    (
      sourceFrameId: string,
      captionIndex: number,
      targetGlobalInFrame: number,
      targetGlobalOutFrame: number,
      copy: boolean,
    ) => {
      const base = dragBaseProjectRef.current ?? projectRef.current;
      if (!base) return;
      const res = moveTimelineCaption(
        base,
        sourceFrameId,
        captionIndex,
        targetGlobalInFrame,
        targetGlobalOutFrame,
        { copy, voiceDurationByRef: voiceDurations, totalFrames },
      );
      lastFreeCaptionResultRef.current = {
        anchorFrameId: res.anchorFrameId,
        anchorCaptionIndex: res.anchorCaptionIndex,
      };
      projectRef.current = res.project;
      setProject(res.project);
      setSaveStatus("UNSAVED CHANGES");
    },
    [totalFrames, voiceDurations],
  );

  const handleCommitFreeCaptionMove = useCallback(
    (label: string) => {
      const movedTo = lastFreeCaptionResultRef.current;
      lastFreeCaptionResultRef.current = null;
      endDragEdit(label);
      if (movedTo) {
        setSelectedFrameId(movedTo.anchorFrameId);
        setSelectedFrameIds([]);
        const nextCapSel: SelectedCaptionState = {
          frameId: movedTo.anchorFrameId,
          indices: [movedTo.anchorCaptionIndex],
        };
        selectedCaptionRef.current = nextCapSel;
        setSelectedCaption(nextCapSel);
        const nextMulti: MultiLaneSelection = {
          pictureIds: [],
          captions: [{ frameId: movedTo.anchorFrameId, index: movedTo.anchorCaptionIndex }],
          audioClipIds: [],
          keyframes: [],
        };
        multiSelectionRef.current = nextMulti;
        setMultiSelection(nextMulti);
      }
    },
    [endDragEdit],
  );

  const handleCancelFreeCaptionMove = useCallback(() => {
    lastFreeCaptionResultRef.current = null;
    const base = dragBaseProjectRef.current;
    if (base) {
      projectRef.current = base;
      setProject(base);
    }
    endDragEdit("");
  }, [endDragEdit]);

  const handleMergeCaptions = useCallback(() => {
    const sel = selectedCaptionRef.current;
    if (!sel || sel.indices.length !== 2) return;
    const clip = clips.find((c) => c.keyframe.id === sel.frameId);
    if (!clip) return;
    const firstIndex = Math.min(sel.indices[0], sel.indices[1]);
    if (Math.abs(sel.indices[0] - sel.indices[1]) !== 1) return;
    const merged = mergeAdjacentCaptions(
      clip.keyframe.beat,
      clip.durationFrames,
      firstIndex,
    );
    handleCommitCaptions(
      clip.keyframe.id,
      merged,
      clip.durationFrames,
      "Captions merged",
      [firstIndex],
    );
  }, [clips, handleCommitCaptions]);

  const handleDeleteSelectedCaptions = useCallback(() => {
    const sel = selectedCaptionRef.current;
    if (!sel || sel.indices.length === 0) return false;
    const clip = clips.find((c) => c.keyframe.id === sel.frameId);
    if (!clip) return false;
    const next = deleteCaptionsAtIndices(
      clip.keyframe.beat,
      clip.durationFrames,
      sel.indices,
    );
    handleCommitCaptions(
      clip.keyframe.id,
      next,
      clip.durationFrames,
      "Caption deleted",
      [],
    );
    return true;
  }, [clips, handleCommitCaptions]);

  const handleResetCaptions = useCallback(
    (frameId: string) => {
      editProject((current) => resetBeatCaptions(current, frameId), "Caption reset");
      setSelectedCaption(null);
    },
    [editProject],
  );

  const handleUpdateCaptionStyle = useCallback(
    (patch: Partial<CaptionStyle>) => {
      editProject(
        (current) => setStoryCaptionStyle(current, patch),
        "Caption style updated",
      );
    },
    [editProject],
  );

  // ── Turn 7: Free Sound Clips, Lift/Ripple Delete & Multi-Lane Selection ──

  const handleSelectAudioClip = useCallback(
    (clip: ResolvedAudioClip, additive: boolean, targetFrame?: number) => {
      setSelectedFrameId(clip.anchorId);
      setInspectorTab(clip.lane);
      setSelectedCaption(null);
      if (targetFrame !== undefined) {
        if (playback) stopPlaybackAndAudio();
        setPlayheadFrame(Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame))));
      }
      const prev = multiSelectionRef.current;
      let nextMulti: MultiLaneSelection;
      if (additive) {
        const exists = prev.audioClipIds.includes(clip.id);
        nextMulti = {
          ...prev,
          audioClipIds: exists
            ? prev.audioClipIds.filter((id) => id !== clip.id)
            : [...prev.audioClipIds, clip.id],
        };
      } else {
        selectedIdsRef.current = [];
        setSelectedFrameIds([]);
        nextMulti = {
          pictureIds: [],
          captions: [],
          audioClipIds: [clip.id],
          keyframes: [],
        };
      }
      multiSelectionRef.current = nextMulti;
      setMultiSelection(nextMulti);
    },
    [playback, stopPlaybackAndAudio, totalFrames],
  );

  const handleSelectKeyframeDiamond = useCallback(
    (diamond: SelectedKeyframeDiamond, additive: boolean) => {
      setSelectedFrameId(diamond.frameId);
      setSelectedCaption(null);
      const prev = multiSelectionRef.current;
      const same = (k: SelectedKeyframeDiamond) =>
        k.frameId === diamond.frameId && k.prop === diamond.prop && k.frame === diamond.frame;
      let nextMulti: MultiLaneSelection;
      if (additive) {
        const exists = prev.keyframes.some(same);
        nextMulti = {
          ...prev,
          keyframes: exists ? prev.keyframes.filter((k) => !same(k)) : [...prev.keyframes, diamond],
        };
      } else {
        selectedIdsRef.current = [];
        setSelectedFrameIds([]);
        nextMulti = {
          pictureIds: [],
          captions: [],
          audioClipIds: [],
          keyframes: [diamond],
        };
      }
      multiSelectionRef.current = nextMulti;
      setMultiSelection(nextMulti);
    },
    [],
  );

  const handleShiftSelectionPreview = useCallback(
    (deltaMs: number) => {
      const base = dragBaseProjectRef.current;
      const baseSel = dragBaseSelectionRef.current;
      if (!base || isMultiSelectionEmpty(baseSel)) return;
      const shifted = shiftMultiLaneSelection(base, baseSel, deltaMs, {
        copy: false,
        voiceDurationByRef: voiceDurations,
      });
      if (shifted.project === projectRef.current) return;
      projectRef.current = shifted.project;
      setProject(shifted.project);
      setSaveStatus("UNSAVED CHANGES");
    },
    [voiceDurations],
  );

  const handleCommitSelectionShift = useCallback(
    (deltaMs: number, copy: boolean, label?: string) => {
      const base = dragBaseProjectRef.current;
      const baseSel = dragBaseSelectionRef.current;
      if (!base || isMultiSelectionEmpty(baseSel)) {
        endDragEdit("");
        return;
      }
      if (Math.abs(deltaMs) < 0.05 && !copy) {
        projectRef.current = base;
        setProject(base);
        endDragEdit("");
        return;
      }
      const shifted = shiftMultiLaneSelection(base, baseSel, deltaMs, {
        copy,
        voiceDurationByRef: voiceDurations,
      });
      projectRef.current = shifted.project;
      setProject(shifted.project);
      endDragEdit(
        label ||
          (copy
            ? `Copied selection (${deltaMs >= 0 ? "+" : ""}${Math.round(deltaMs)} ms)`
            : `Moved selection (${deltaMs >= 0 ? "+" : ""}${Math.round(deltaMs)} ms)`),
      );
      handleSetMultiSelection(shifted.selection);
    },
    [endDragEdit, handleSetMultiSelection, voiceDurations],
  );

  const handleDropAssetOnClip = useCallback(
    (assetRef: string, frameId: string) => {
      editProject(
        (current) => setPicture(current, frameId, assetRef),
        "Picture dropped on shot",
      );
      setSelectedFrameId(frameId);
      setSelectedFrameIds([frameId]);
      setMultiSelection({
        pictureIds: [frameId],
        captions: [],
        audioClipIds: [],
        keyframes: [],
      });
    },
    [editProject],
  );

  const handleAddAudioClipOnLane = useCallback(
    (lane: AudioLaneId, assetRef: string, targetStartMs: number) => {
      const current = projectRef.current;
      if (!current || !clips.length) return;
      const knownDur = fileDurationMap.get(assetRef);
      const id = `ac-${lane}-${crypto.randomUUID().slice(0, 8)}`;
      const seed: AudioClip = {
        id,
        lane,
        src: assetRef,
        anchorId: clips[0].keyframe.id,
        offsetMs: 0,
        inMs: 0,
        durationMs: knownDur ?? (lane === "sfx" ? 1500 : 4000),
        gain: lane === "voice" ? 1 : lane === "sfx" ? 0.85 : lane === "music" ? 0.7 : 0.6,
        fadeInMs: lane === "music" || lane === "ambience" ? 500 : 0,
        fadeOutMs: lane === "music" || lane === "ambience" ? 500 : 0,
        ...(lane === "ambience" ? { loop: true } : {}),
      };
      const anchored = reanchorAudioClipToMs(seed, Math.max(0, targetStartMs), clips);
      applyProject(
        setAudioClips(current, [...(current.audioClips ?? []), anchored]),
        `Added ${lane} sound at ${Math.round(targetStartMs)} ms`,
      );
      setSelectedFrameId(anchored.anchorId);
      setSelectedFrameIds([]);
      setInspectorTab(lane);
      setMultiSelection({
        pictureIds: [],
        captions: [],
        audioClipIds: [id],
        keyframes: [],
      });
    },
    [applyProject, clips, fileDurationMap],
  );

  const handleRebuildSoundFromFilm = useCallback(() => {
    if (
      !window.confirm(
        "Rebuild sound from the film? This replaces all sound clips on the Voice, SFX, Music, and Ambience lanes with fresh clips built from the story (you can Undo).",
      )
    ) {
      return;
    }
    editProject(
      (current) =>
        setAudioClips(
          current,
          buildAudioClipsFromFilm(current.story, voiceDurations, musicDurations),
        ),
      "Rebuilt sound from the film",
    );
    setMultiSelection((prev) => ({ ...prev, audioClipIds: [] }));
  }, [editProject, musicDurations, voiceDurations]);

  const handleNudgeSelectedAudio = useCallback(
    (deltaMs: number) => {
      const current = projectRef.current;
      if (!current?.audioClips?.length) return false;
      const ids =
        multiSelectionRef.current.audioClipIds.length > 0
          ? multiSelectionRef.current.audioClipIds
          : activeAudioClip
            ? [activeAudioClip.id]
            : [];
      if (!ids.length) return false;
      const shifted = shiftMultiLaneSelection(
        current,
        { ...EMPTY_MULTI_SELECTION, audioClipIds: ids },
        deltaMs,
        { copy: false, voiceDurationByRef: voiceDurations },
      );
      if (shifted.project === current) return false;
      const nextClips = buildTimelineClips(buildKeyframes(shifted.project.story), voiceDurations).clips;
      const firstResolved = resolveAudioClips(shifted.project.audioClips ?? [], nextClips).find(
        (c) => c.id === ids[0],
      );
      const msReadout = firstResolved ? ` (${Math.round(firstResolved.startMs)} ms)` : "";
      applyProject(
        shifted.project,
        `Nudged sound ${deltaMs > 0 ? `+${deltaMs}` : deltaMs} ms${msReadout}`,
      );
      return true;
    },
    [activeAudioClip, applyProject, voiceDurations],
  );

  const runDeleteForSelection = useCallback(
    (sel: MultiLaneSelection, forceRipple = false) => {
      const current = projectRef.current;
      if (!current) return;

      const preFrames = buildKeyframes(current.story);
      const liftedOnlyIds = !forceRipple
        ? sel.pictureIds.filter((id) => {
            const kf = preFrames.find((f) => f.id === id);
            return kf && !kf.beat.gap;
          })
        : [];

      const res = executeDeleteSelection(current, sel, {
        ripple: forceRipple,
        voiceDurationByRef: voiceDurations,
      });
      if (res.project === current) return;

      applyProject(res.project, res.statusMessage);

      const nextFrames = buildKeyframes(res.project.story);
      const { clips: nextClips, totalFrames: nextTotal } = buildTimelineClips(
        nextFrames,
        voiceDurations,
      );
      const nextPlayhead = Math.max(0, Math.min(Math.max(0, nextTotal - 1), playheadRef.current));
      setPlayheadFrame(nextPlayhead);
      setSelectedCaption(null);

      if (liftedOnlyIds.length > 0) {
        setSelectedFrameIds(liftedOnlyIds);
        setSelectedFrameId(liftedOnlyIds[0]);
        const nextMulti: MultiLaneSelection = {
          pictureIds: liftedOnlyIds,
          captions: [],
          audioClipIds: [],
          keyframes: [],
        };
        multiSelectionRef.current = nextMulti;
        setMultiSelection(nextMulti);
      } else {
        const nearest = clipAtFrame(nextClips, nextPlayhead) || nextClips[0];
        setSelectedFrameId(nearest?.keyframe.id || "");
        const selectNearestPicture = Boolean(nearest && sel.pictureIds.length > 0);
        const nextPicIds = selectNearestPicture ? [nearest!.keyframe.id] : [];
        setSelectedFrameIds(nextPicIds);
        const nextMulti: MultiLaneSelection = {
          pictureIds: nextPicIds,
          captions: [],
          audioClipIds: [],
          keyframes: [],
        };
        multiSelectionRef.current = nextMulti;
        setMultiSelection(nextMulti);
      }
    },
    [applyProject, voiceDurations],
  );

  const executeDelete = useCallback(
    (forceRipple = false) => {
      let sel = multiSelectionRef.current;

      if (isMultiSelectionEmpty(sel)) {
        if (selectedCaptionRef.current?.indices.length) {
          handleDeleteSelectedCaptions();
          return;
        }
        const fallbackIds =
          selectedIdsRef.current.length > 0
            ? selectedIdsRef.current
            : selectedFrameIdRef.current
              ? [selectedFrameIdRef.current]
              : [];
        if (!fallbackIds.length) return;
        sel = { ...EMPTY_MULTI_SELECTION, pictureIds: fallbackIds };
      }

      runDeleteForSelection(sel, forceRipple);
    },
    [handleDeleteSelectedCaptions, runDeleteForSelection],
  );

  const handleDeleteInspectorClip = useCallback(
    (forceRipple = false) => {
      const targetId = selectedFrameIdRef.current;
      if (!targetId) return;
      const picIds =
        selectedIdsRef.current.length > 0 && selectedIdsRef.current.includes(targetId)
          ? selectedIdsRef.current
          : [targetId];
      runDeleteForSelection(
        { ...EMPTY_MULTI_SELECTION, pictureIds: picIds },
        forceRipple,
      );
    },
    [runDeleteForSelection],
  );

  const mergeCandidateIds = useMemo(
    () =>
      selectedFrameIds.length > 0
        ? selectedFrameIds
        : selectedFrameId
          ? [selectedFrameId]
          : [],
    [selectedFrameIds, selectedFrameId],
  );

  const canMergeFrames = useMemo(
    () => (project ? canMergeKeyframes(project, mergeCandidateIds) : false),
    [project, mergeCandidateIds],
  );

  const handleMergeFrames = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const ids =
      selectedIdsRef.current.length > 0
        ? selectedIdsRef.current
        : selectedFrameIdRef.current
          ? [selectedFrameIdRef.current]
          : [];
    if (!ids.length) return;
    const res = mergeKeyframes(current, ids, voiceDurations);
    if (!res) return;
    applyProject(res.project, "Merged frames into one clip");
    const nextFrames = buildKeyframes(res.project.story);
    const { clips: nextClips, totalFrames: nextTotal } = buildTimelineClips(
      nextFrames,
      voiceDurations,
    );
    const mergedClip = nextClips.find((c) => c.keyframe.id === res.mergedId);
    setSelectedFrameId(res.mergedId);
    setSelectedFrameIds([res.mergedId]);
    setSelectedCaption(null);
    const nextMulti: MultiLaneSelection = {
      pictureIds: [res.mergedId],
      captions: [],
      audioClipIds: [],
      keyframes: [],
    };
    multiSelectionRef.current = nextMulti;
    setMultiSelection(nextMulti);
    if (mergedClip) {
      const clampedPh = Math.max(
        mergedClip.startFrame,
        Math.min(mergedClip.endFrame - 1, Math.min(Math.max(0, nextTotal - 1), playheadRef.current)),
      );
      setPlayheadFrame(clampedPh);
    }
  }, [applyProject, voiceDurations]);

  const handleToggleKenBurns = useCallback(() => {
    const targetFrame = viewerFrame ?? selectedFrame;
    if (!targetFrame || targetFrame.beat.gap) return;
    if (playback) stopPlaybackAndAudio();
    if (selectedFrameIdRef.current !== targetFrame.id) {
      setSelectedFrameId(targetFrame.id);
      setSelectedFrameIds([targetFrame.id]);
      const nextMulti: MultiLaneSelection = {
        pictureIds: [targetFrame.id],
        captions: [],
        audioClipIds: [],
        keyframes: [],
      };
      multiSelectionRef.current = nextMulti;
      setMultiSelection(nextMulti);
    }
    if (kenBurnsDrawStep !== null) {
      setKenBurnsDrawStep(null);
      setKenBurnsDraftStart(null);
      setEditLabel("Ken Burns cancelled");
      return;
    }
    if (targetFrame.beat.animation?.kenBurns) {
      setKenBurnsSuppressed((v) => !v);
      return;
    }
    setKenBurnsSuppressed(false);
    setKenBurnsDraftStart(null);
    setKenBurnsDrawStep("start");
    setEditLabel("Ken Burns: drag on picture to draw START 16:9 box");
  }, [viewerFrame, selectedFrame, playback, stopPlaybackAndAudio, kenBurnsDrawStep]);

  const handleStartKenBurnsRedraw = useCallback(() => {
    if (playback) stopPlaybackAndAudio();
    setKenBurnsSuppressed(false);
    setKenBurnsDraftStart(null);
    setKenBurnsDrawStep("start");
    setEditLabel("Ken Burns: drag on picture to draw START 16:9 box");
  }, [playback, stopPlaybackAndAudio]);

  const handleClearKenBurns = useCallback(() => {
    const targetFrame = viewerFrame ?? selectedFrame;
    if (!targetFrame) return;
    const curAnim = targetFrame.beat.animation;
    if (!curAnim) return;
    const cleaned: BeatAnimation = {
      ...curAnim,
      kenBurns: undefined,
      zoom: undefined,
      x: undefined,
      y: undefined,
    };
    editProject(
      (cur) => setBeatAnimation(cur, targetFrame.id, cleaned),
      "Cleared Ken Burns move",
    );
    setKenBurnsDrawStep(null);
    setKenBurnsDraftStart(null);
  }, [viewerFrame, selectedFrame, editProject]);

  const handleCompleteKenBurnsDraw = useCallback(
    (step: "start" | "end", box: KenBurnsBox) => {
      const targetClip = activeClip ?? selectedClip;
      if (!targetClip) return;
      if (step === "start") {
        setKenBurnsDraftStart(box);
        setKenBurnsDrawStep("end");
        setEditLabel("Ken Burns: drag on picture to draw END 16:9 box");
        return;
      }
      const startBox = kenBurnsDraftStart ?? { x: 0, y: 0, width: 1 };
      const applied = applyKenBurnsBoxes(
        targetClip.keyframe.beat.animation,
        startBox,
        box,
        targetClip.durationFrames,
      );
      if (selectedFrameIdRef.current !== targetClip.keyframe.id) {
        setSelectedFrameId(targetClip.keyframe.id);
        setSelectedFrameIds([targetClip.keyframe.id]);
        const nextMulti: MultiLaneSelection = {
          pictureIds: [targetClip.keyframe.id],
          captions: [],
          audioClipIds: [],
          keyframes: [],
        };
        multiSelectionRef.current = nextMulti;
        setMultiSelection(nextMulti);
      }
      editProject(
        (cur) => setBeatAnimation(cur, targetClip.keyframe.id, applied.animation),
        "Applied Ken Burns START & END",
      );
      setKenBurnsDrawStep(null);
      setKenBurnsDraftStart(null);
      setKenBurnsSuppressed(false);
    },
    [activeClip, selectedClip, kenBurnsDraftStart, editProject],
  );

  const handleConvertAllToKeyframes = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const res = convertProjectCameraMovesToKeyframesWithCount(current, voiceDurations);
    if (res.convertedCount <= 0) {
      setEditLabel(
        res.keyframedShotCount > 0
          ? `All ${res.keyframedShotCount.toLocaleString()} camera moves & framings are already keyframed`
          : "No un-keyframed camera moves to convert",
      );
      return;
    }
    editProject(
      () => res.project,
      `Converted ${res.convertedCount.toLocaleString()} shot${res.convertedCount === 1 ? "" : "s"} to keyframes`,
    );
  }, [editProject, voiceDurations]);

  useEffect(() => {
    if (!viewerFrame) return;
    window.__frame24 = {
      frameIds: frames.map((frame) => frame.id),
      totalFrames,
      snapEnabled,
      getPlayhead: () => playheadRef.current,
      getPlayheadMs: () =>
        playback ? webAudioEngine.getCurrentPlayheadMs() : frameToMs(playheadRef.current),
      setPlayhead: (frameNumber) => scrubToFrame(frameNumber),
      setFrame: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        if (hit) setSelection([frameId], frameId, hit.startFrame);
      },
      getSelectedIds: () => [...selectedIdsRef.current],
      setSelectedIds: (ids) => {
        if (ids.length) setSelection(ids, ids[0]);
        else clearAllSelection();
      },
      getMultiSelection: () => multiSelectionRef.current,
      getAudioClips: () => resolvedAudioClips,
      getWebAudioClock: () => ({
        playing: webAudioEngine.isPlaying,
        playheadMs: webAudioEngine.getCurrentPlayheadMs(),
        activeSources: webAudioEngine.activeSourceCount,
        duckDepth,
      }),
      getEditLabel: () => editLabel,
      getDuration: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        return hit ? hit.durationFrames / FPS : 0;
      },
      getFrame: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        if (!hit) return undefined;
        const frame = hit.keyframe;
        const trans = readCutTransition(frame);
        return {
          id: frame.id,
          sceneId: frame.sceneId,
          mark: frame.mark,
          number: frame.number,
          startFrame: hit.startFrame,
          endFrame: hit.endFrame,
          durationFrames: hit.durationFrames,
          voiceInFrame: hit.voiceInFrame,
          voiceOutFrame: hit.voiceOutFrame,
          duration: hit.durationFrames / FPS,
          gap: Boolean(frame.beat.gap),
          text: frame.text,
          captions: frame.beat.captions,
          effectiveCaptions: effectiveCaptionsForBeat(frame.beat, hit.durationFrames),
          speaker: frame.speaker,
          picture: frame.picture,
          carried: frame.carried,
          cinematic: effectiveFrameCinematic(frame),
          animation: frame.beat.animation,
          transition: trans,
          poseAtStart: evaluate(hit, 0),
          poseAtEnd: evaluate(hit, Math.max(0, hit.durationFrames - 1)),
          audioUrl: frame.beat.audioUrl,
          sfxUrl: frame.beat.sfxUrl,
          musicUrl: frame.scene.musicUrl || frame.scene.sceneAudioUrl,
          ambientAudio: frame.scene.ambientAudio,
        };
      },
      getActiveTransition: () => {
        const current = activeTransitionAtFrame(clips, playheadRef.current);
        return current
          ? {
              kind: current.kind,
              alignment: current.alignment,
              progress: current.progress,
              startFrame: current.startFrame,
              endFrame: current.endFrame,
              durationFrames: current.durationFrames,
              outgoingId: current.outgoingClip.keyframe.id,
              incomingId: current.incomingClip.keyframe.id,
            }
          : undefined;
      },
      getMusicSpans: () =>
        resolveMusicSpans(clips, totalFrames, musicDurations).map((span) => ({
          id: span.id,
          sceneId: span.sceneId,
          url: span.url,
          label: span.label,
          loop: span.loop,
          startFrame: span.startFrame,
          endFrame: span.endFrame,
          naturalEndFrame: span.naturalEndFrame,
        })),
      getTrackMix: () => trackMix,
      getEffectiveTrackLevel: (track: TrackId) => effectiveTrackLevel(trackMix, track),
      getAudioVolumes: () => ({ ...audio.volumes, currentMusicUrl: audioController.currentMusicUrl }),
      getInspectorTab: () => inspectorTabRef.current,
      setInspectorTab: (tab: InspectorTab) => setInspectorTab(tab),
      getMissingCount: () => project?.missing.length ?? 0,
      resolveMedia: (ref: string | undefined) => resolveMedia(ref),
      getCaptionStyle: () => captionStyle,
      getActiveCaption: () =>
        activeTimelineCaption
          ? {
              text: activeTimelineCaption.text,
              inFrame: activeTimelineCaption.inFrame,
              outFrame: activeTimelineCaption.outFrame,
              ...(activeTimelineCaption.free ? { free: true } : {}),
              speaker: activeTimelineCaption.speaker,
              isNarration: activeTimelineCaption.isNarration,
            }
          : undefined,
      getTimelineCaptions: () => resolvedTimelineCaptions,
      getInOutMarks: () => ({
        inFrame: inPointRef.current,
        outFrame: outPointRef.current,
        loop: loopPlaybackRef.current,
      }),
      setInOutMarks: (inF: number | null, outF: number | null) => {
        inPointRef.current = inF;
        outPointRef.current = outF;
        setInPoint(inF);
        setOutPoint(outF);
      },
      setLoopPlayback: (loop: boolean) => {
        loopPlaybackRef.current = loop;
        setLoopPlayback(loop);
      },
      exportSrtText: (sceneId?: string) => {
        const subset = sceneId ? frames.filter((f) => f.sceneId === sceneId) : frames;
        const durs = subset.map((frame) =>
          clipFrames(
            frame,
            frame.beat.audioUrl ? voiceDurations.get(frame.beat.audioUrl) : undefined,
          ),
        );
        return makeCaptionsSrt(subset, durs, FPS);
      },
      exportVttText: (sceneId?: string) => {
        const subset = sceneId ? frames.filter((f) => f.sceneId === sceneId) : frames;
        const durs = subset.map((frame) =>
          clipFrames(
            frame,
            frame.beat.audioUrl ? voiceDurations.get(frame.beat.audioUrl) : undefined,
          ),
        );
        return makeCaptionsVtt(subset, durs, FPS);
      },
    };
    return () => {
      delete window.__frame24;
    };
  }, [
    activeClip,
    activeTimelineCaption,
    activeTransition,
    captionStyle,
    clearAllSelection,
    clips,
    duckDepth,
    editLabel,
    frames,
    musicDurations,
    playback,
    project?.missing.length,
    resolveMedia,
    resolvedAudioClips,
    resolvedTimelineCaptions,
    scrubToFrame,
    setSelection,
    snapEnabled,
    totalFrames,
    trackMix,
    viewerFrame,
    viewerLocalFrame,
    voiceDurations,
  ]);

  useEffect(() => {
    const maxFrameIdx = Math.max(0, totalFrames - 1);
    const resolvedFrom = renderParams
      ? Math.max(0, Math.min(maxFrameIdx, renderParams.from))
      : 0;
    const resolvedTo =
      renderParams && renderParams.to !== null
        ? Math.max(resolvedFrom, Math.min(maxFrameIdx, renderParams.to))
        : maxFrameIdx;
    const ready = !loading && Boolean(project) && clips.length > 0;

    window.__render = {
      ready,
      fps: FPS,
      from: resolvedFrom,
      to: resolvedTo,
      totalFrames,
      getFrame: () => playheadRef.current,
      setFrame: async (n: number) => {
        const clamped = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(n)));
        flushSync(() => {
          playheadRef.current = clamped;
          setPlayheadFrame(clamped);
        });
        await waitForRenderFrameReady(renderShellRef.current ?? previewStageRef.current);
        return clamped;
      },
      setOptions: (opts) => {
        flushSync(() => {
          if (opts.captions !== undefined) setShowCaptions(opts.captions);
          if (opts.marks !== undefined) setShowMarks(opts.marks);
          if (opts.timecode !== undefined) setShowTimecodeOverlay(opts.timecode);
        });
      },
      renderAudioOffline: async (
        fromF: number,
        toF: number,
        sampleRate = 48000,
        normalize = false,
        opticalEqOverride?: boolean,
      ) => {
        const wavBytes = await renderTimelineAudioOfflineWav({
          resolvedClips: resolvedAudioClips,
          resolveMedia,
          trackMix,
          duckDepth,
          fromFrame: fromF,
          toFrame: toF,
          fps: FPS,
          sampleRate,
          normalize,
          opticalPrintEq: opticalEqOverride ?? activeCutOptions.opticalPrintEq,
        });
        return uint8ArrayToBase64(wavBytes);
      },
      getSrt: (fromF: number, toF: number) => makeRangeCaptionsSrt(clips, fromF, toF, FPS),
      getFfmetadataChapters: (fromF: number, toF: number) =>
        buildMp4FfmetadataChapters(clips, project?.story.markers, fromF, toF, FPS),
      getAudioMixSpec: () => ({
        resolvedAudioClips,
        trackMix,
        duckDepth,
        fps: FPS,
        totalFrames,
      }),
    };
    return () => {
      delete window.__render;
    };
  }, [
    activeCutOptions.opticalPrintEq,
    clips,
    duckDepth,
    loading,
    project,
    renderParams,
    resolveMedia,
    resolvedAudioClips,
    totalFrames,
    trackMix,
  ]);

  useEffect(() => {
    const NON_TEXT_INPUT_TYPES = new Set([
      "range",
      "checkbox",
      "radio",
      "button",
      "submit",
      "reset",
      "color",
      "file",
    ]);

    const isTextTypingTarget = (el: HTMLElement | null, allowNumberForSpace = false): boolean => {
      if (!el) return false;
      if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
      if (el.tagName === "INPUT") {
        const inputType = ((el as HTMLInputElement).type || "text").toLowerCase();
        if (NON_TEXT_INPUT_TYPES.has(inputType)) return false;
        if (allowNumberForSpace && inputType === "number") return false;
        return true;
      }
      return false;
    };

    const onKey = (event: KeyboardEvent) => {
      if (switchingProjectRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target as HTMLElement | null;
      const typingText = isTextTypingTarget(target, false);
      const typingSpaceText = isTextTypingTarget(target, true);
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
        return;
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }

      // Space plays/stops from EVERYWHERE in the app except while typing inside an actual text field;
      // Shift+Space triggers Loop In/Out playback!
      if (!typingSpaceText && !mod && !event.altKey && (event.code === "Space" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (
          target &&
          (target.tagName === "BUTTON" ||
            target.tagName === "SELECT" ||
            (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox"))
        ) {
          target.blur();
        }
        if (event.shiftKey) {
          toggleLoopShortcut();
        } else {
          togglePlayback();
        }
        return;
      }

      if (!typingText && mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a" && !target?.closest('[role="dialog"], .modal-backdrop')) {
        event.preventDefault();
        selectAllImages();
        return;
      }

      if (!typingText && mod && event.altKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copyEffectsRef.current();
        return;
      }
      if (!typingText && mod && event.altKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteEffectsRef.current();
        return;
      }
      if (!typingText && mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        handleCopyClips();
        return;
      }
      if (!typingText && mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        handlePasteClips();
        return;
      }
      if (typingText) return;
      if (target?.tagName === "SELECT" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (shortcutsOpenRef.current) {
          setShortcutsOpen(false);
          return;
        }
        if (kenBurnsDrawStep !== null) {
          setKenBurnsDrawStep(null);
          setKenBurnsDraftStart(null);
          return;
        }
        if (isFullscreenRef.current) {
          exitFullscreenPlayback();
          return;
        }
        clearAllSelection();
        return;
      }
      if (!mod && !event.altKey && event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      if (!mod && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreenPlayback();
        return;
      }
      if (!mod && !event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (event.shiftKey) {
          if (inPointRef.current !== null) scrubToFrame(inPointRef.current);
        } else {
          const f = Math.max(0, Math.floor(playheadRef.current));
          setInPoint(f);
          setEditLabel(`In mark set at frame ${f}`);
        }
        return;
      }
      if (!mod && !event.altKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (event.shiftKey) {
          if (outPointRef.current !== null) scrubToFrame(outPointRef.current);
        } else {
          const f = Math.max(0, Math.floor(playheadRef.current));
          setOutPoint(f);
          setEditLabel(`Out mark set at frame ${f}`);
        }
        return;
      }
      if (!mod && event.altKey && (event.code === "KeyX" || event.key.toLowerCase() === "x")) {
        event.preventDefault();
        clearInOutMarks();
        setEditLabel("In/Out marks cleared");
        return;
      }
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        const stepMs = event.shiftKey ? 100 : 10;
        handleNudgeSelectedAudio(event.key === "ArrowLeft" ? -stepMs : stepMs);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrames(event.shiftKey ? -FPS : -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrames(event.shiftKey ? FPS : 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectRelativeClip(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        selectRelativeClip(1);
      } else if (!mod && !event.altKey && event.key === "[") {
        event.preventDefault();
        jumpPrevKeyframe();
      } else if (!mod && !event.altKey && event.key === "]") {
        event.preventDefault();
        jumpNextKeyframe();
      } else if (!mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        splitAtPlayhead();
      } else if (!mod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setSnapEnabled((prev) => !prev);
      } else if (!mod && event.key.toLowerCase() === "m") {
        event.preventDefault();
        handleAddMarkerAtPlayhead();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        executeDelete(event.shiftKey);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        stopPlaybackAndAudio();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        webAudioEngine.stop();
        setDirection(-1);
        setPlayback(true);
      } else if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setDirection(1);
        setPlaySpeed((speed) => {
          const nextSpeed = playback ? (speed >= 4 ? 1 : speed * 2) : 1;
          webAudioEngine.unlock();
          webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
          webAudioEngine.setSoundEnabled(soundOn);
          webAudioEngine.setTrackMix(trackMix);
          webAudioEngine.setDuckDepth(duckDepth);
          if (webAudioEngine.isPlaying) {
            webAudioEngine.seek(webAudioEngine.getCurrentPlayheadMs(), nextSpeed);
          } else {
            webAudioEngine.startPlayback(frameToMs(playheadRef.current), nextSpeed);
          }
          return nextSpeed;
        });
        setPlayback(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !isTextTypingTarget(target, true) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        (event.code === "Space" || event.key === " ")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const focusEditorShellIfNeeded = (target: HTMLElement | null) => {
      const interactiveFormControl = target?.closest(
        "input, textarea, select, [contenteditable='true']",
      ) as HTMLElement | null;
      if (interactiveFormControl) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const isNativeFocusableTrigger = Boolean(target?.closest("button, summary, a[href]"));
      if (active && active !== shellRef.current && active !== document.body && active !== target && !isNativeFocusableTrigger) {
        active.blur();
      }
      if (!isNativeFocusableTrigger) {
        shellRef.current?.focus({ preventScroll: true });
      }
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      focusEditorShellIfNeeded(event.target as HTMLElement | null);
    };
    const onPointerUpCapture = (event: PointerEvent) => {
      focusEditorShellIfNeeded(event.target as HTMLElement | null);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("pointerup", onPointerUpCapture, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("pointerup", onPointerUpCapture, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    clearAllSelection,
    clearInOutMarks,
    duckDepth,
    executeDelete,
    exitFullscreenPlayback,
    handleAddMarkerAtPlayhead,
    handleCopyClips,
    handleNudgeSelectedAudio,
    handlePasteClips,
    kenBurnsDrawStep,
    toggleFullscreenPlayback,
    toggleLoopShortcut,
    jumpNextKeyframe,
    jumpPrevKeyframe,
    playback,
    redo,
    resolveMedia,
    resolvedAudioClips,
    scrubToFrame,
    selectRelativeClip,
    selectAllImages,
    setInPoint,
    setOutPoint,
    soundOn,
    splitAtPlayhead,
    stepFrames,
    stopPlaybackAndAudio,
    togglePlayback,
    trackMix,
    undo,
  ]);

  function saveNow(): void {
    const current = projectRef.current;
    if (!current) return;
    setSaveStatus("SAVING…");
    void saveActiveProject(current)
      .then(() => {
        if (!switchingProjectRef.current && projectRef.current === current) setSaveStatus("SAVED TO THIS BROWSER");
      })
      .catch(() => {
        if (!switchingProjectRef.current && projectRef.current === current) setSaveStatus("AUTOSAVE FAILED");
      });
  }

  function createSnapshot(): void {
    const current = projectRef.current;
    const name =
      snapshotName.trim() || window.prompt("Name this snapshot", `Cut ${new Date().toLocaleDateString()}`)?.trim();
    if (!current || !name) return;
    const snapshot = {
      id: `snapshot-${crypto.randomUUID()}`,
      name,
      createdAt: Date.now(),
      story: cloneProjectStory(current.story),
      audioClips: current.audioClips?.map((c) => ({ ...c })),
    };
    applyProject(
      { ...current, snapshots: [...current.snapshots, snapshot], updatedAt: Date.now() },
      `Snapshot: ${name}`,
    );
    setSnapshotName("");
    setSnapshotModal(false);
  }

  function restoreSnapshot(snapshotId: string): void {
    const current = projectRef.current;
    const snapshot = current?.snapshots.find((item) => item.id === snapshotId);
    if (!current || !snapshot) return;
    applyProject(
      {
        ...current,
        story: cloneProjectStory(snapshot.story),
        audioClips: snapshot.audioClips?.map((c) => ({ ...c })) ?? current.audioClips,
        updatedAt: Date.now(),
      },
      `Restored ${snapshot.name}`,
    );
    const restoredFrames = buildKeyframes(snapshot.story);
    const restoredClips = buildTimelineClips(restoredFrames, voiceDurations).clips;
    if (restoredClips[0]) setSelection([restoredClips[0].keyframe.id], restoredClips[0].keyframe.id, restoredClips[0].startFrame);
  }

  function addKeyframe(afterFrameId = selectedFrame?.id): void {
    if (!afterFrameId || !projectRef.current) return;
    const result = insertKeyframeAfter(projectRef.current, afterFrameId);
    if (!result) return;
    applyProject(result.project, "Clip added and text split");
    const nextClips = buildTimelineClips(buildKeyframes(result.project.story), voiceDurations).clips;
    const inserted = nextClips.find((clip) => clip.keyframe.id === result.insertedId);
    setSelectedFrameId(result.insertedId);
    setSelectedFrameIds([result.insertedId]);
    const nextMulti: MultiLaneSelection = {
      pictureIds: [result.insertedId],
      captions: [],
      audioClipIds: [],
      keyframes: [],
    };
    multiSelectionRef.current = nextMulti;
    setMultiSelection(nextMulti);
    if (inserted) setPlayheadFrame(inserted.startFrame);
    setBrowser({ kind: "image", target: "picture" });
  }

  function duplicateCurrent(): void {
    if (!selectedFrame || !projectRef.current) return;
    const result = duplicateKeyframe(projectRef.current, selectedFrame.id);
    if (!result) return;
    applyProject(result.project, "Clip duplicated");
    const nextClips = buildTimelineClips(buildKeyframes(result.project.story), voiceDurations).clips;
    const inserted = nextClips.find((clip) => clip.keyframe.id === result.insertedId);
    setSelectedFrameId(result.insertedId);
    setSelectedFrameIds([result.insertedId]);
    const nextMulti: MultiLaneSelection = {
      pictureIds: [result.insertedId],
      captions: [],
      audioClipIds: [],
      keyframes: [],
    };
    multiSelectionRef.current = nextMulti;
    setMultiSelection(nextMulti);
    if (inserted) setPlayheadFrame(inserted.startFrame);
  }

  function copyEffects(): void {
    const sourceFrame = selectedFrame ?? viewerFrame;
    if (!sourceFrame) return;
    setCopiedEffects(copyEffectBlock(sourceFrame));
    setEditLabel(`Effects copied from ${sourceFrame.mark}/${sourceFrame.number}`);
  }

  function pasteEffects(): void {
    if (!project || !copiedEffects) return;
    const targets = selectedFrameIds.length
      ? selectedFrameIds
      : multiSelection.pictureIds.length
        ? multiSelection.pictureIds
        : selectedFrame
          ? [selectedFrame.id]
          : [];
    if (!targets.length) return;
    editProject(
      (current) => pasteEffectBlock(current, targets, copiedEffects, voiceDurations),
      targets.length === 1 ? "Effects pasted" : `Effects pasted to ${targets.length} clips`,
    );
  }
  copyEffectsRef.current = copyEffects;
  pasteEffectsRef.current = pasteEffects;

  function copyAnimation(): void {
    if (!selectedFrame?.beat.animation) return;
    setCopiedAnimation(JSON.parse(JSON.stringify(selectedFrame.beat.animation)) as BeatAnimation);
    setEditLabel("Animation copied");
  }

  function pasteAnimation(): void {
    const current = projectRef.current;
    if (!current || !copiedAnimation) return;
    const targetIds = selectedFrameIds.length
      ? selectedFrameIds
      : selectedFrame
        ? [selectedFrame.id]
        : [];
    if (!targetIds.length) return;
    let next = current;
    let totalPasted = 0;
    let totalDropped = 0;
    for (const id of targetIds) {
      const targetClip = clips.find((c) => c.keyframe.id === id);
      if (!targetClip) continue;
      const res = pasteClipAnimationOnto(copiedAnimation, targetClip.durationFrames);
      totalPasted += res.pastedCount;
      totalDropped += res.droppedCount;
      next = setBeatAnimation(next, id, res.animation);
    }
    const msg =
      totalDropped > 0
        ? `Animation pasted (${totalDropped} keyframe${totalDropped === 1 ? "" : "s"} dropped after clip end)`
        : `Animation pasted (${totalPasted} keyframe${totalPasted === 1 ? "" : "s"})`;
    applyProject(next, msg);
  }

  async function exportBundle(): Promise<void> {
    if (!project) return;
    setExportProgress(5);
    setExportMessage("Bundling referenced files from the linked public folder…");
    try {
      const bundle = await buildPortableBundle(project, folderFiles, publicPaths);
      setExportProgress(100);
      downloadText(JSON.stringify(bundle), `${slug(project.title)}.reel.json`, "application/json");
      setExportMessage(
        `${bundle.assets.length} assets embedded · ${bundle.missing.length} unresolved media path(s) retained and listed.`,
      );
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Could not build the PortableStoryBundle.");
    }
  }

  function exportPatch(): void {
    if (!project) return;
    const result = writeStudioPatch(project);
    setPatchReport(result);
    downloadText(JSON.stringify(result.patch, null, 2), "studio-edits.json", "application/json");
  }

  function exportSrt(): void {
    if (!clips.length) return;
    const maxF = Math.max(0, totalFrames - 1);
    const fromF = exportWholeFilm ? 0 : Math.max(0, Math.min(maxF, Math.round(exportFromFrame)));
    const toF = exportWholeFilm ? maxF : Math.max(fromF, Math.min(maxF, Math.round(exportToFrame)));
    const text = makeRangeCaptionsSrt(clips, fromF, toF, FPS);
    downloadText(text, `${slug(project?.title || "animatic")}.srt`, "text/plain");
    setExportMessage(`SRT written for frames ${fromF}..${toF} (${toF - fromF + 1} frames).`);
  }

  function exportVtt(): void {
    if (!frames.length) return;
    const selectedRange =
      rangeEnd === null ? frames : frames.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1);
    const durationFrames = selectedRange.map((frame) =>
      clipFrames(frame, frame.beat.audioUrl ? voiceDurations.get(frame.beat.audioUrl) : undefined),
    );
    const text = makeCaptionsVtt(selectedRange, durationFrames, FPS);
    downloadText(text, `${slug(project?.title || "animatic")}.vtt`, "text/vtt");
    setExportMessage(`WebVTT written for ${selectedRange.length} clips.`);
  }

  function clearMp4Poll(): void {
    if (mp4PollTimerRef.current !== null) {
      window.clearInterval(mp4PollTimerRef.current);
      mp4PollTimerRef.current = null;
    }
  }

  async function startMp4Export(): Promise<void> {
    if (!project || !clips.length) return;
    clearMp4Poll();
    const myToken = ++activeMp4JobTokenRef.current;
    const maxF = Math.max(0, totalFrames - 1);
    const fromF = exportWholeFilm ? 0 : Math.max(0, Math.min(maxF, Math.round(exportFromFrame)));
    const toF = exportWholeFilm ? maxF : Math.max(fromF, Math.min(maxF, Math.round(exportToFrame)));
    const expectedCount = toF - fromF + 1;
    const baseName = slug(project.title || "animatic");

    setMp4Message("");
    setMp4Job({
      id: "starting",
      status: "running",
      completedFrames: 0,
      totalFrames: expectedCount,
      percent: 0,
      phase: exportGpu
        ? "Starting GPU-accelerated Chromium & ffmpeg…"
        : "Starting headless Chromium & ffmpeg (CPU)…",
    });

    try {
      const resp = await fetch("/__api/export/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          trackMix,
          duckDepth,
          fromFrame: fromF,
          toFrame: toF,
          captions: captionsExport,
          srt: srtExport,
          marks: marksExport,
          quality: exportQuality,
          capture: exportCapture,
          workers: exportWorkers,
          gpu: exportGpu,
          normalize: exportLoudnessTarget !== "off" || exportNormalize,
          loudnessTarget: exportLoudnessTarget,
          opticalPrintEq: exportOpticalEq,
          embedChapters: exportEmbedChapters,
          baseName,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(
          resp.status === 404
            ? "MP4 export server requires `npm run dev` (or run `npm run export -- --from ... --to ...` from the terminal)."
            : errText || `Export start failed (${resp.status})`,
        );
      }
      const data = (await resp.json()) as { jobId: string };
      const jobId = data.jobId;
      if (activeMp4JobTokenRef.current !== myToken) {
        void fetch("/__api/export/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: jobId }),
        }).catch(() => undefined);
        return;
      }
      setMp4Job((prev) =>
        prev ? { ...prev, id: jobId, phase: "Opening /?render=1 at 1920×1080…" } : null,
      );

      mp4PollTimerRef.current = window.setInterval(async () => {
        if (activeMp4JobTokenRef.current !== myToken) {
          clearMp4Poll();
          return;
        }
        try {
          const stResp = await fetch(`/__api/export/status?id=${encodeURIComponent(jobId)}`);
          if (!stResp.ok || activeMp4JobTokenRef.current !== myToken) return;
          const st = (await stResp.json()) as Mp4ExportJobState;
          if (activeMp4JobTokenRef.current !== myToken) return;
          setMp4Job(st);
          if (st.status === "done") {
            clearMp4Poll();
            setMp4Message(
              `Rendered ${st.totalFrames} exact frames (${fromF}..${toF}) to ${st.fileName || "MP4"}${st.srtUrl ? " + .srt" : ""}.`,
            );
            if (st.mp4Url) {
              const a = document.createElement("a");
              a.href = st.mp4Url;
              a.download = st.fileName || `${baseName}-${fromF}-${toF}.mp4`;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
            if (st.srtUrl && srtExport) {
              window.setTimeout(() => {
                const aSrt = document.createElement("a");
                aSrt.href = st.srtUrl!;
                aSrt.download = st.srtFileName || `${baseName}-${fromF}-${toF}.srt`;
                document.body.appendChild(aSrt);
                aSrt.click();
                aSrt.remove();
              }, 250);
            }
          } else if (st.status === "error" || st.status === "cancelled") {
            clearMp4Poll();
            if (st.status === "cancelled") {
              setMp4Message("MP4 export cancelled.");
            } else if (st.error) {
              setMp4Message(st.error);
            }
          }
        } catch {
          // transient poll hiccup
        }
      }, 320);
    } catch (err) {
      if (activeMp4JobTokenRef.current !== myToken) return;
      clearMp4Poll();
      const message = err instanceof Error ? err.message : "MP4 export failed to start.";
      setMp4Job((prev) =>
        prev ? { ...prev, status: "error", phase: "Failed", error: message } : null,
      );
      setMp4Message(message);
    }
  }

  async function cancelMp4Export(): Promise<void> {
    activeMp4JobTokenRef.current++;
    clearMp4Poll();
    const job = mp4Job;
    if (!job || job.status !== "running") return;
    setMp4Job({ ...job, status: "cancelled", phase: "Cancelled" });
    setMp4Message("MP4 export cancelled.");
    if (job.id && job.id !== "starting") {
      try {
        await fetch("/__api/export/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id }),
        });
      } catch {
        // ignore network error on cancel
      }
    }
  }

  function saveCrop(): void {
    if (!cropState || !project) return;
    const next = {
      ...project,
      assets: project.assets.map((asset) =>
        asset.id === cropState.assetId
          ? { ...asset, crop: { x: cropState.x, y: cropState.y, width: 100, height: 100 } }
          : asset,
      ),
      updatedAt: Date.now(),
    };
    applyProject(next, "Non-destructive 16:9 crop set");
    setCropState(null);
  }

  useEffect(() => {
    if (!clips.length) return;
    const center = activeClip?.index ?? 0;
    const start = Math.max(0, center - 2);
    const end = Math.min(clips.length - 1, center + 3);
    for (let i = start; i <= end; i += 1) {
      const kf = clips[i].keyframe;
      if (!kf || kf.beat.gap) continue;
      const pic = resolveMedia(kf.picture);
      const rawCin = (effectiveFrameCinematic(kf) || {}) as Record<string, any>;
      const resolvedCin = {
        ...rawCin,
        depthMap: resolveMedia(rawCin.depthMap),
        depthPlate: resolveMedia(rawCin.depthPlate),
        depthCutouts: Array.isArray(rawCin.depthCutouts)
          ? rawCin.depthCutouts.map((c: Record<string, any>) => ({
              ...c,
              image: resolveMedia(c.image) || c.image,
            }))
          : undefined,
      } as any;
      preloadDepthParallaxAssets(resolvedCin, pic);
    }
  }, [activeClip?.index, clips, resolveMedia]);

  const viewerImageSrc = viewerFrame ? resolveMedia(viewerFrame.picture) : undefined;
  const selectedImageSrc = selectedFrame ? resolveMedia(selectedFrame.picture) : undefined;
  const prevOnionSrc = useMemo(() => {
    if (!activeClip || activeClip.index <= 0) return undefined;
    const prevKf = clips[activeClip.index - 1]?.keyframe;
    if (!prevKf || prevKf.beat.gap || !prevKf.picture) return undefined;
    return prevKf.picture.startsWith("gradient:") ? prevKf.picture : resolveMedia(prevKf.picture);
  }, [activeClip, clips, resolveMedia]);
  const nextOnionSrc = useMemo(() => {
    if (!activeClip || activeClip.index + 1 >= clips.length) return undefined;
    const nextKf = clips[activeClip.index + 1]?.keyframe;
    if (!nextKf || nextKf.beat.gap || !nextKf.picture) return undefined;
    return nextKf.picture.startsWith("gradient:") ? nextKf.picture : resolveMedia(nextKf.picture);
  }, [activeClip, clips, resolveMedia]);
  const outgoingImageSrc = activeTransition
    ? resolveMedia(activeTransition.outgoingClip.keyframe.picture)
    : undefined;
  const incomingImageSrc = activeTransition
    ? resolveMedia(activeTransition.incomingClip.keyframe.picture)
    : undefined;
  const outgoingImagePosition = activeTransition
    ? cropPositionForPicture(activeTransition.outgoingClip.keyframe.picture)
    : undefined;
  const incomingImagePosition = activeTransition
    ? cropPositionForPicture(activeTransition.incomingClip.keyframe.picture)
    : undefined;

  const diagnostics = project ? runningOrderDiagnostics(project.story) : [];
  const totalSeconds = totalFrames / FPS;
  const clipProgress = activeClip ? (viewerLocalFrame + 1) / Math.max(1, activeClip.durationFrames) : 0;

  const inheritedMusic = useMemo<InheritedMusicInfo | undefined>(() => {
    if (!selectedClip) return undefined;
    const spans = resolveMusicSpans(clips, totalFrames, musicDurations);
    const active = spans.find(
      (span) => span.startFrame <= selectedClip.startFrame && span.endFrame > selectedClip.startFrame,
    );
    if (!active) return undefined;
    const ownerClip = clips.find((c) => c.keyframe.id === active.id);
    return {
      sceneId: active.sceneId,
      frameId: active.id,
      mark: String(ownerClip?.keyframe.mark ?? active.scene.sceneNumber ?? active.sceneId),
      url: active.url,
      label: active.label,
    };
  }, [clips, musicDurations, selectedClip, totalFrames]);

  const inheritedAmbience = useMemo<InheritedAmbienceInfo | undefined>(() => {
    if (!selectedClip) return undefined;
    const spans = resolveAmbienceSpans(clips, totalFrames);
    const active = spans.find(
      (span) => span.startFrame <= selectedClip.startFrame && span.endFrame > selectedClip.startFrame,
    );
    if (!active) return undefined;
    return {
      sceneId: active.sceneId,
      frameId: active.id,
      mark: active.mark,
      raw: active.title,
      label: active.label,
    };
  }, [clips, selectedClip, totalFrames]);

  const previewSingleAudio = useCallback(
    (refUrl: string | undefined, volume = 0.65) => {
      if (!refUrl) return;
      const src = resolveMedia(refUrl);
      if (!src) return;
      previewPlayerRef.current?.pause();
      const player = new Audio(src);
      player.volume = Math.max(0, Math.min(1, volume));
      previewPlayerRef.current = player;
      void player.play().catch(() => undefined);
    },
    [resolveMedia],
  );

  const activeCutIdResolved: DirectorsCutId = project?.directorsCutId ?? "neo-noir";
  const compareTargetChoices = useMemo(
    () =>
      project?.story.id === "nobodys-witness-film"
        ? DIRECTORS_CUT_OPTIONS.filter((opt) => opt.id !== activeCutIdResolved).map((opt) => ({
            id: opt.id,
            label: opt.shortLabel,
          }))
        : [],
    [project?.story.id, activeCutIdResolved],
  );
  const effectiveCompareTargetId: DirectorsCutId =
    compareTargetChoices.some((c) => c.id === compareTargetId)
      ? compareTargetId
      : (compareTargetChoices[0]?.id ?? "uncut");

  const compareActive =
    !isRenderMode &&
    project?.story.id === "nobodys-witness-film" &&
    compareTargetChoices.length > 0 &&
    (comparePinned || compareKeyHeld);

  const compareBundle = useMemo(() => {
    if (!compareActive || !project) return null;
    const refProj = buildDirectorsCutById(
      project,
      effectiveCompareTargetId,
      voiceDurations,
      musicDurations,
    );
    const refFrames = buildKeyframes(refProj.story);
    const { clips: refClips, totalFrames: refTotal } = buildTimelineClips(
      refFrames,
      voiceDurations,
    );
    const refRuns = computePictureRuns(refClips);
    const refCaptions = resolveTimelineCaptions(refClips);
    const refOptLabel =
      DIRECTORS_CUT_OPTIONS.find((o) => o.id === effectiveCompareTargetId)?.shortLabel ??
      effectiveCompareTargetId;
    return {
      refProj,
      refClips,
      refTotal,
      refRuns,
      refCaptions,
      refOptLabel,
      refCutOpts: normalizeCutOptions(refProj.cutOptions ?? refProj.story.cutOptions),
    };
  }, [compareActive, project, effectiveCompareTargetId, voiceDurations, musicDurations]);

  const comparePreviewState = useMemo(() => {
    if (!compareBundle || !activeClip) return null;
    const progress =
      activeClip.durationFrames > 1
        ? viewerLocalFrame / Math.max(1, activeClip.durationFrames - 1)
        : 0;
    const matched =
      compareBundle.refClips.find((c) => c.keyframe.id === activeClip.keyframe.id) ??
      compareBundle.refClips.find((c) => c.keyframe.sceneId === activeClip.keyframe.sceneId) ??
      clipAtFrame(
        compareBundle.refClips,
        Math.min(Math.max(0, compareBundle.refTotal - 1), playheadFrame),
      ) ??
      compareBundle.refClips[0];
    if (!matched) return null;
    const mappedFrame =
      matched.keyframe.id === activeClip.keyframe.id
        ? matched.startFrame +
          Math.round(Math.max(0, Math.min(1, progress)) * Math.max(0, matched.durationFrames - 1))
        : Math.min(
            matched.endFrame - 1,
            Math.max(matched.startFrame, Math.min(compareBundle.refTotal - 1, playheadFrame)),
          );
    const clampedFrame = Math.max(
      0,
      Math.min(Math.max(0, compareBundle.refTotal - 1), mappedFrame),
    );
    const localF = Math.max(0, Math.min(matched.durationFrames - 1, clampedFrame - matched.startFrame));
    const run = compareBundle.refRuns[matched.index];
    const presetF = run ? Math.max(0, clampedFrame - run.runStartFrame) : localF;
    const shotKeyId = run?.runKeyId ?? matched.keyframe.id;
    const trans = activeTransitionAtFrame(compareBundle.refClips, clampedFrame);
    const outRun = trans ? compareBundle.refRuns[trans.outgoingClip.index] : undefined;
    const inRun = trans ? compareBundle.refRuns[trans.incomingClip.index] : undefined;
    const cap = activeTimelineCaptionAtFrame(compareBundle.refCaptions, clampedFrame);
    return {
      frame: matched.keyframe,
      localFrame: localF,
      presetFrame: presetF,
      shotKeyId,
      carriedStartPose: matched.carriedStartPose,
      clipDurationFrames: matched.durationFrames,
      playheadFrame: clampedFrame,
      totalFrames: compareBundle.refTotal,
      captionStyle: normalizeCaptionStyle(compareBundle.refProj.story.captionStyle),
      activeTimelineCaption: cap,
      imageSrc: resolveMedia(matched.keyframe.picture),
      imagePosition: cropPositionForPicture(matched.keyframe.picture),
      transition: trans,
      outgoingImageSrc: trans ? resolveMedia(trans.outgoingClip.keyframe.picture) : undefined,
      outgoingImagePosition: trans
        ? cropPositionForPicture(trans.outgoingClip.keyframe.picture)
        : undefined,
      outgoingPresetFrame: trans
        ? outRun
          ? Math.max(0, clampedFrame - outRun.runStartFrame)
          : trans.outLocalFrame
        : undefined,
      outgoingShotKeyId: trans
        ? outRun?.runKeyId ?? trans.outgoingClip.keyframe.id
        : undefined,
      incomingImageSrc: trans ? resolveMedia(trans.incomingClip.keyframe.picture) : undefined,
      incomingImagePosition: trans
        ? cropPositionForPicture(trans.incomingClip.keyframe.picture)
        : undefined,
      incomingPresetFrame: trans
        ? inRun
          ? Math.max(0, clampedFrame - inRun.runStartFrame)
          : trans.inLocalFrame
        : undefined,
      incomingShotKeyId: trans
        ? inRun?.runKeyId ?? trans.incomingClip.keyframe.id
        : undefined,
      monochromeFilm: Boolean(compareBundle.refProj.story.monochrome),
      aspectFraming: compareBundle.refCutOpts.aspectFraming,
      compareLabel: compareBundle.refOptLabel.toUpperCase(),
    };
  }, [compareBundle, activeClip, viewerLocalFrame, playheadFrame, resolveMedia, cropPositionForPicture]);

  if (loading) {
    if (isRenderMode) {
      return (
        <div
          ref={renderShellRef}
          className="render-mode-shell"
          data-testid="render-mode-shell"
          data-ready="0"
        />
      );
    }
    return (
      <div className="loading-screen">
        <div className="loading-wordmark">
          FRAME<span>/24</span>
        </div>
        <span>Opening reel…</span>
      </div>
    );
  }
  if (loadError && !project) {
    return (
      <div className="loading-screen">
        <div className="loading-wordmark">
          FRAME<span>/24</span>
        </div>
        <p>{loadError}</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Reload app
        </button>
      </div>
    );
  }
  if (!project || !viewerFrame || !selectedFrame || !selectedClip) {
    return <div className="loading-screen">No keyframes are available in this project.</div>;
  }

  if (isRenderMode) {
    return (
      <div
        ref={renderShellRef}
        className="render-mode-shell"
        data-testid="render-mode-shell"
        data-ready="1"
        data-frame={playheadFrame}
        style={{ width: renderParams.width, height: renderParams.height }}
      >
        <CinematicPreview
          renderMode={true}
          frame={viewerFrame}
          localFrame={viewerLocalFrame}
          presetFrame={viewerPresetFrame}
          shotKeyId={viewerShotKeyId}
          carriedStartPose={activeClip?.carriedStartPose}
          clipDurationFrames={activeClip?.durationFrames}
          playheadFrame={playheadFrame}
          totalFrames={totalFrames}
          captionStyle={captionStyle}
          activeTimelineCaption={activeTimelineCaption}
          imageSrc={viewerImageSrc}
          imagePosition={viewerImagePosition}
          transition={activeTransition}
          outgoingImageSrc={outgoingImageSrc}
          outgoingImagePosition={outgoingImagePosition}
          outgoingPresetFrame={outgoingPresetFrame}
          outgoingShotKeyId={outgoingShotKeyId}
          incomingImageSrc={incomingImageSrc}
          incomingImagePosition={incomingImagePosition}
          incomingPresetFrame={incomingPresetFrame}
          incomingShotKeyId={incomingShotKeyId}
          videoLevel={effectiveTrackLevel(trackMix, "video")}
          resolveMedia={resolveMedia}
          playing={false}
          soundOn={false}
          showCaption={showCaptions}
          showMark={showMarks}
          showTimecodeOverlay={showTimecodeOverlay}
          showSafeGuides={false}
          showOnionSkin={false}
          isFullscreen={false}
          interactiveFraming={false}
          isClipSelected={false}
          monochromeFilm={Boolean(project.story.monochrome)}
          aspectFraming={activeCutOptions.aspectFraming}
        />
      </div>
    );
  }

  const filmChoices = new Map<string, { id: string; title: string }>();
  BUILT_IN_FILMS.forEach((film) => filmChoices.set(film.id, { ...film }));
  savedProjects.forEach((film) => {
    if (!filmChoices.has(film.id)) filmChoices.set(film.id, { id: film.id, title: film.title });
  });
  filmChoices.set(project.id, { id: project.id, title: project.title });

  const effectiveTimelineDockHeight = curveEditor
    ? Math.max(paneSizes.timelineHeight + 140, 440)
    : paneSizes.timelineHeight;
  const upperGridColumns = mediaBinOpen
    ? `${paneSizes.mediaBinWidth}px 6px minmax(260px, 1fr) 6px ${paneSizes.inspectorWidth}px`
    : `minmax(260px, 1fr) 6px ${paneSizes.inspectorWidth}px`;

  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      style={{ outline: "none" }}
      className={`frame24-shell ${project.story.id === "sweet-jesus-film" ? "is-sweet-jesus" : ""} ${dragOver ? "is-drag-over" : ""} ${isFullscreen ? "is-fullscreen-cinema" : ""}`}
      data-fullscreen={isFullscreen ? "true" : "false"}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={importInputRef}
        className="hidden-input"
        type="file"
        accept=".reel.json,.json,.ts,application/json,text/plain"
        onChange={(event) => void handleImportInput(event)}
      />
      <input
        ref={imageInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={(event) => onUploadInput(event, "image")}
      />
      <input
        ref={audioInputRef}
        className="hidden-input"
        type="file"
        accept="audio/*"
        onChange={(event) => onUploadInput(event, "audio")}
      />
      <input ref={folderInputRef} className="hidden-input" type="file" multiple onChange={handleFolderPick} />

      <Topbar
        project={project}
        projectChoices={[...filmChoices.values()]}
        onSelectProject={(id) => void switchFilm(id)}
        switchingProject={switchingProject}
        onDownloadScreenplay={
          project.story.id === "sweet-jesus-film"
            ? () => downloadText(sweetJesusScreenplay, "sweet-jesus-screenplay.fountain")
            : undefined
        }
        onShowCharacterReferences={
          project.story.id === "sweet-jesus-film" ? () => setCharactersOpen(true) : undefined
        }
        onShowLaunderetteReferences={
          project.story.id === "sweet-jesus-film" ? () => setLaunderetteOpen(true) : undefined
        }
        saveStatus={saveStatus}
        historyVersion={historyVersion}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        onImport={() => importInputRef.current?.click()}
        onLinkFolder={() => {
          folderInputRef.current?.setAttribute("webkitdirectory", "");
          folderInputRef.current?.click();
        }}
        folderLabel={folderLabel}
        onSnapshot={() => setSnapshotModal(true)}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onExport={() => {
          if (inPointRef.current !== null || outPointRef.current !== null) {
            const maxIdx = Math.max(0, totalFrames - 1);
            const effIn =
              inPointRef.current !== null ? Math.max(0, Math.min(maxIdx, inPointRef.current)) : 0;
            const effOut =
              outPointRef.current !== null
                ? Math.max(effIn, Math.min(maxIdx, outPointRef.current))
                : maxIdx;
            setExportWholeFilm(false);
            setExportFromFrame(effIn);
            setExportToFrame(effOut);
          }
          setExportOpticalEq(activeCutOptions.opticalPrintEq);
          setExportOpen(true);
          setExportMessage("");
          setPatchReport(null);
        }}
        onSave={saveNow}
        missingCount={project.missing.length}
        onMissing={() => setMissingOpen(true)}
        editLabel={editLabel}
        totalDuration={totalSeconds}
        onConvertAllToKeyframes={handleConvertAllToKeyframes}
        activeCutId={project.directorsCutId ?? "neo-noir"}
        cutOptions={activeCutOptions}
        onChangeCutOptions={
          project.story.id === "nobodys-witness-film"
            ? (patch, label) => {
                editProject((current) => applyCutOptionsToProject(current, patch), label);
              }
            : undefined
        }
        onResetActiveCut={
          project.story.id === "nobodys-witness-film"
            ? () => {
                const current = projectRef.current;
                if (!current) return;
                if (playback) stopPlaybackAndAudio();
                const activeId = current.directorsCutId ?? "neo-noir";
                const fresh = switchDirectorsCutWithState(
                  current,
                  activeId,
                  voiceDurations,
                  musicDurations,
                  { forceRebuild: true },
                );
                applyProject(fresh, `Reset ${getDirectorsCutLabel(activeId)} to factory`);
              }
            : undefined
        }
        onSelectDirectorsCut={
          project.story.id === "nobodys-witness-film"
            ? (cutId: DirectorsCutId) => {
                const current = projectRef.current;
                if (!current) return;
                if (playback) stopPlaybackAndAudio();
                const currentClip = clipAtFrame(clips, playheadRef.current);
                const targetBeatId = currentClip?.keyframe.id;
                const targetSceneId = currentClip?.keyframe.sceneId;
                const progressRatio =
                  currentClip && currentClip.durationFrames > 1
                    ? (playheadRef.current - currentClip.startFrame) /
                      (currentClip.durationFrames - 1)
                    : 0;

                const nextProject = switchDirectorsCutWithState(
                  current,
                  cutId,
                  voiceDurations,
                  musicDurations,
                );
                const label = getDirectorsCutLabel(cutId);
                applyProject(nextProject, `Switched to ${label}`);

                const nextFrames = buildKeyframes(nextProject.story);
                const { clips: nextClips, totalFrames: nextTotal } = buildTimelineClips(
                  nextFrames,
                  voiceDurations,
                );
                const matchedClip =
                  (targetBeatId &&
                    nextClips.find((c) => c.keyframe.id === targetBeatId)) ||
                  (targetSceneId &&
                    nextClips.find((c) => c.keyframe.sceneId === targetSceneId)) ||
                  nextClips[0];
                if (matchedClip) {
                  const mappedFrame =
                    matchedClip.keyframe.id === targetBeatId
                      ? matchedClip.startFrame +
                        Math.round(
                          Math.max(0, Math.min(0.95, progressRatio)) *
                            Math.max(0, matchedClip.durationFrames - 1),
                        )
                      : matchedClip.startFrame;
                  const clamped = Math.max(0, Math.min(Math.max(0, nextTotal - 1), mappedFrame));
                  playheadRef.current = clamped;
                  setPlayheadFrame(clamped);
                  setSelectedFrameId(matchedClip.keyframe.id);
                  setSelectedFrameIds([matchedClip.keyframe.id]);
                }
                if (exportWholeFilm) {
                  setExportToFrame(Math.max(0, nextTotal - 1));
                }
              }
            : undefined
        }
      />

      <div
        className={`editor-body ${curveEditor ? "has-curve-editor" : ""} ${activePaneDrag ? "is-resizing-pane" : ""}`}
        style={{ gridTemplateRows: `minmax(160px, 1fr) 6px ${effectiveTimelineDockHeight}px` }}
      >
        <div
          className={`upper-workspace ${mediaBinOpen ? "has-bin" : ""}`}
          style={{ gridTemplateColumns: upperGridColumns }}
        >
          <MediaBin
            open={mediaBinOpen}
            onClose={() => setMediaBinOpen(false)}
            imageAssets={imageBrowserItems}
            audioAssets={audioBrowserItems}
            onApplyImageToSelection={(ref) => setFramePicture(ref)}
            onInsertAudioAtPlayhead={(ref) =>
              handleAddAudioClipOnLane("sfx", ref, frameToMs(playheadRef.current))
            }
          />
          {mediaBinOpen && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize media bin and viewer"
              data-testid="splitter-media-bin"
              className={`pane-splitter is-vertical ${activePaneDrag === "mediabin" ? "is-dragging" : ""}`}
              title="Drag to resize Media Bin (double-click to reset)"
              onDoubleClick={() => {
                const next = { ...paneSizesRef.current, mediaBinWidth: DEFAULT_MEDIA_BIN_WIDTH };
                setPaneSizes(next);
                writeStoredPaneSizes(next);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                setActivePaneDrag("mediabin");
                paneDragSessionRef.current = {
                  which: "mediabin",
                  pointerId: e.pointerId,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startSize: paneSizes.mediaBinWidth,
                };
              }}
            />
          )}
          <main className="stage-column">
            <header className="stage-heading">
              <div className="stage-title-lockup">
                <span className="scene-index" data-testid="stage-scene-mark">
                  {String(viewerFrame.mark).startsWith("nw_") ? "SCENE" : "SC"} {viewerFrame.mark}
                </span>
                <h1>{viewerFrame.scene.title || project.title}</h1>
                <p>
                  {viewerFrame.speaker}
                  <span>·</span>
                  {viewerFrame.text || viewerFrame.beat.captions?.[0]?.text || "No caption on this beat"}
                </p>
              </div>
              <div className="stage-heading-actions">
                <div className="player-zoom-controls" role="group" aria-label="Player zoom">
                  <button
                    type="button"
                    className="caption-toggle"
                    aria-label="Zoom out player"
                    data-testid="player-zoom-out"
                    onClick={() => setViewerZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                    title="Zoom out viewer"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={`caption-toggle ${viewerZoom !== 1 ? "is-active" : ""}`}
                    data-testid="player-zoom-reset"
                    onClick={() => setViewerZoom(1)}
                    title="Reset viewer zoom to 100%"
                  >
                    {Math.round(viewerZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    className="caption-toggle"
                    aria-label="Zoom in player"
                    data-testid="player-zoom-in"
                    onClick={() => setViewerZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                    title="Zoom in viewer"
                  >
                    +
                  </button>
                </div>
                <span className="render-tag">
                  <i />
                  24 FPS
                </span>
                <div className="cc-menu-anchor">
                  <button
                    type="button"
                    data-testid="cc-style-button"
                    aria-expanded={ccStyleOpen}
                    className={`caption-toggle ${showCaptions || ccStyleOpen ? "is-active" : ""}`}
                    onClick={() => setCcStyleOpen((open) => !open)}
                    title="Caption visibility & project-wide caption style"
                  >
                    CC
                  </button>
                  {ccStyleOpen && (
                    <div
                      className="cc-style-panel"
                      data-testid="cc-style-panel"
                      role="dialog"
                      aria-label="Caption style"
                    >
                      <div className="cc-style-head">
                        <span>CAPTION STYLE</span>
                        <button
                          type="button"
                          className="cc-style-close"
                          onClick={() => setCcStyleOpen(false)}
                          aria-label="Close caption style"
                        >
                          ×
                        </button>
                      </div>

                      <div className="cc-style-row">
                        <span>Captions</span>
                        <button
                          type="button"
                          data-testid="cc-show-toggle"
                          className={`cc-pill-btn ${showCaptions ? "is-active" : ""}`}
                          onClick={() => setShowCaptions((v) => !v)}
                        >
                          {showCaptions ? "On" : "Off"}
                        </button>
                      </div>

                      <div className="cc-style-row">
                        <span>Position</span>
                        <div className="cc-seg-group">
                          <button
                            type="button"
                            data-testid="cc-pos-bottom"
                            className={`cc-seg-btn ${captionStyle.position === "bottom" ? "is-active" : ""}`}
                            onClick={() => handleUpdateCaptionStyle({ position: "bottom" })}
                          >
                            Bottom
                          </button>
                          <button
                            type="button"
                            data-testid="cc-pos-top"
                            className={`cc-seg-btn ${captionStyle.position === "top" ? "is-active" : ""}`}
                            onClick={() => handleUpdateCaptionStyle({ position: "top" })}
                          >
                            Top
                          </button>
                        </div>
                      </div>

                      <div className="cc-style-row">
                        <span>Size</span>
                        <div className="cc-seg-group">
                          {(["S", "M", "L"] as const).map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              data-testid={`cc-size-${sz}`}
                              className={`cc-seg-btn ${captionStyle.size === sz ? "is-active" : ""}`}
                              onClick={() => handleUpdateCaptionStyle({ size: sz })}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="cc-style-row">
                        <span>Dark box</span>
                        <button
                          type="button"
                          data-testid="cc-bg-toggle"
                          className={`cc-pill-btn ${captionStyle.backgroundBox ? "is-active" : ""}`}
                          onClick={() =>
                            handleUpdateCaptionStyle({
                              backgroundBox: !captionStyle.backgroundBox,
                            })
                          }
                        >
                          {captionStyle.backgroundBox ? "On" : "Off"}
                        </button>
                      </div>

                      <div className="cc-style-row">
                        <span>Speaker names</span>
                        <button
                          type="button"
                          data-testid="cc-speaker-toggle"
                          className={`cc-pill-btn ${captionStyle.showSpeaker ? "is-active" : ""}`}
                          onClick={() =>
                            handleUpdateCaptionStyle({
                              showSpeaker: !captionStyle.showSpeaker,
                            })
                          }
                        >
                          {captionStyle.showSpeaker ? "On" : "Off"}
                        </button>
                      </div>

                      <div className="cc-style-row">
                        <span>Narration in italics</span>
                        <button
                          type="button"
                          data-testid="cc-italic-toggle"
                          className={`cc-pill-btn ${captionStyle.italicNarration ? "is-active" : ""}`}
                          onClick={() =>
                            handleUpdateCaptionStyle({
                              italicNarration: !captionStyle.italicNarration,
                            })
                          }
                        >
                          {captionStyle.italicNarration ? "On" : "Off"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className={`caption-toggle ${showMarks ? "is-active" : ""}`}
                  onClick={() => setShowMarks((value) => !value)}
                >
                  MARK
                </button>
              </div>
            </header>

            <div ref={previewStageRef} className="preview-stage">
              <div
                className="preview-inner"
                style={viewerZoom !== 1 ? { transform: `scale(${viewerZoom})` } : undefined}
              >
                <CinematicPreview
                  frame={comparePreviewState ? comparePreviewState.frame : viewerFrame}
                  localFrame={comparePreviewState ? comparePreviewState.localFrame : viewerLocalFrame}
                  presetFrame={comparePreviewState ? comparePreviewState.presetFrame : viewerPresetFrame}
                  shotKeyId={comparePreviewState ? comparePreviewState.shotKeyId : viewerShotKeyId}
                  carriedStartPose={
                    comparePreviewState
                      ? comparePreviewState.carriedStartPose
                      : activeClip?.carriedStartPose
                  }
                  clipDurationFrames={
                    comparePreviewState
                      ? comparePreviewState.clipDurationFrames
                      : activeClip?.durationFrames
                  }
                  playheadFrame={
                    comparePreviewState ? comparePreviewState.playheadFrame : playheadFrame
                  }
                  totalFrames={
                    comparePreviewState ? comparePreviewState.totalFrames : totalFrames
                  }
                  captionStyle={
                    comparePreviewState ? comparePreviewState.captionStyle : captionStyle
                  }
                  activeTimelineCaption={
                    comparePreviewState
                      ? comparePreviewState.activeTimelineCaption
                      : activeTimelineCaption
                  }
                  imageSrc={comparePreviewState ? comparePreviewState.imageSrc : viewerImageSrc}
                  imagePosition={
                    comparePreviewState ? comparePreviewState.imagePosition : viewerImagePosition
                  }
                  prevOnionSrc={comparePreviewState ? undefined : prevOnionSrc}
                  nextOnionSrc={comparePreviewState ? undefined : nextOnionSrc}
                  transition={
                    comparePreviewState ? comparePreviewState.transition : activeTransition
                  }
                  outgoingImageSrc={
                    comparePreviewState
                      ? comparePreviewState.outgoingImageSrc
                      : outgoingImageSrc
                  }
                  outgoingImagePosition={
                    comparePreviewState
                      ? comparePreviewState.outgoingImagePosition
                      : outgoingImagePosition
                  }
                  outgoingPresetFrame={
                    comparePreviewState
                      ? comparePreviewState.outgoingPresetFrame
                      : outgoingPresetFrame
                  }
                  outgoingShotKeyId={
                    comparePreviewState
                      ? comparePreviewState.outgoingShotKeyId
                      : outgoingShotKeyId
                  }
                  incomingImageSrc={
                    comparePreviewState
                      ? comparePreviewState.incomingImageSrc
                      : incomingImageSrc
                  }
                  incomingImagePosition={
                    comparePreviewState
                      ? comparePreviewState.incomingImagePosition
                      : incomingImagePosition
                  }
                  incomingPresetFrame={
                    comparePreviewState
                      ? comparePreviewState.incomingPresetFrame
                      : incomingPresetFrame
                  }
                  incomingShotKeyId={
                    comparePreviewState
                      ? comparePreviewState.incomingShotKeyId
                      : incomingShotKeyId
                  }
                  videoLevel={effectiveTrackLevel(trackMix, "video")}
                  resolveMedia={resolveMedia}
                  playing={playback}
                  soundOn={soundOn}
                  showCaption={showCaptions}
                  showMark={showMarks}
                  showDepthMaps={showDepthMaps}
                  showDepthMapOverlay={showDepthMapOverlay}
                  showCutouts={showCutouts}
                  mutedCutoutLayers={mutedCutoutLayers}
                  showTimecodeOverlay={showTimecodeOverlay}
                  showSafeGuides={showSafeGuides}
                  showOnionSkin={showOnionSkin && !comparePreviewState}
                  isFullscreen={isFullscreen}
                  interactiveFraming={!comparePreviewState}
                  isClipSelected={!comparePreviewState && viewerFrame.id === selectedFrame.id}
                  monochromeFilm={
                    comparePreviewState
                      ? comparePreviewState.monochromeFilm
                      : Boolean(project.story.monochrome)
                  }
                  aspectFraming={
                    comparePreviewState
                      ? comparePreviewState.aspectFraming
                      : activeCutOptions.aspectFraming
                  }
                  compareActive={Boolean(comparePreviewState)}
                  compareLabel={comparePreviewState?.compareLabel}
                  compareTargetId={effectiveCompareTargetId}
                  onToggleCompare={compareTargetChoices.length ? () => setComparePinned((v) => !v) : undefined}
                  onChangeCompareTarget={compareTargetChoices.length ? (id: string) => setCompareTargetId(id as DirectorsCutId) : undefined}
                  kenBurnsSuppressed={kenBurnsSuppressed}
                  kenBurnsDrawStep={kenBurnsDrawStep}
                  kenBurnsDraftStart={kenBurnsDraftStart}
                  externalEdgeWarningToken={edgeWarningToken}
                  onToggleSafeGuides={() => setShowSafeGuides((v) => !v)}
                  onToggleOnionSkin={() => setShowOnionSkin((v) => !v)}
                  onToggleTimecodeOverlay={() => setShowTimecodeOverlay((v) => !v)}
                  onToggleMarkOverlay={() => setShowMarks((v) => !v)}
                  onToggleFullscreen={toggleFullscreenPlayback}
                  onToggleKenBurns={handleToggleKenBurns}
                  onStartKenBurnsRedraw={handleStartKenBurnsRedraw}
                  onClearKenBurns={handleClearKenBurns}
                  onCompleteKenBurnsDraw={handleCompleteKenBurnsDraw}
                  onDragStart={beginDragEdit}
                  onDragEnd={endDragEdit}
                  onPreviewAnimation={(animation) => {
                    if (selectedFrameIdRef.current !== viewerFrame.id) {
                      setSelectedFrameId(viewerFrame.id);
                      setSelectedFrameIds([viewerFrame.id]);
                      const nextMulti: MultiLaneSelection = {
                        pictureIds: [viewerFrame.id],
                        captions: [],
                        audioClipIds: [],
                        keyframes: [],
                      };
                      multiSelectionRef.current = nextMulti;
                      setMultiSelection(nextMulti);
                    }
                    previewProjectEdit((current) =>
                      setBeatAnimation(current, viewerFrame.id, animation),
                    );
                  }}
                  onCommitAnimation={(animation, label) => {
                    if (selectedFrameIdRef.current !== viewerFrame.id) {
                      setSelectedFrameId(viewerFrame.id);
                      setSelectedFrameIds([viewerFrame.id]);
                      const nextMulti: MultiLaneSelection = {
                        pictureIds: [viewerFrame.id],
                        captions: [],
                        audioClipIds: [],
                        keyframes: [],
                      };
                      multiSelectionRef.current = nextMulti;
                      setMultiSelection(nextMulti);
                    }
                    editProject(
                      (current) => setBeatAnimation(current, viewerFrame.id, animation),
                      label,
                    );
                  }}
                  setFocalPoint={setFocalPoint}
                />
              </div>
              {playback && (
                <div className="preview-progress">
                  <span style={{ width: `${clipProgress * 100}%` }} />
                </div>
              )}
              <span className="preview-resolution">
                {activeCutOptions.aspectFraming} <i>·</i> {formatTimecode(playheadFrame)}
              </span>
            </div>

            <div className="transport-bar">
              <div className="transport-primary">
                <button
                  className="transport-button"
                  aria-label="Previous frame"
                  title="Previous frame (←, Shift+← for −1s)"
                  onClick={() => stepFrames(-1)}
                >
                  ‹
                </button>
                <button
                  className={`transport-play ${playback ? "is-playing" : ""}`}
                  aria-label={playback ? "Pause animatic" : "Play animatic"}
                  onClick={togglePlayback}
                >
                  {playback ? "Ⅱ" : "▶"}
                </button>
                <button
                  className="transport-button"
                  aria-label="Next frame"
                  title="Next frame (→, Shift+→ for +1s)"
                  onClick={() => stepFrames(1)}
                >
                  ›
                </button>
                <span className="transport-time" data-testid="transport-timecode">
                  {formatTimecode(playheadFrame)} <i>/</i> {formatTimecode(totalFrames)}
                </span>
              </div>
              <div className="transport-secondary">
                <button
                  onClick={() => {
                    webAudioEngine.stop();
                    setDirection(-1);
                    setPlayback(true);
                  }}
                >
                  J
                </button>
                <button
                  onClick={() => {
                    stopPlaybackAndAudio();
                  }}
                >
                  K
                </button>
                <button
                  onClick={() => {
                    setDirection(1);
                    setPlaySpeed((value) => {
                      const nextSpeed = playback ? (value >= 4 ? 1 : value * 2) : 1;
                      webAudioEngine.unlock();
                      webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
                      webAudioEngine.setSoundEnabled(soundOn);
                      webAudioEngine.setTrackMix(trackMix);
                      webAudioEngine.setDuckDepth(duckDepth);
                      if (webAudioEngine.isPlaying) {
                        webAudioEngine.seek(webAudioEngine.getCurrentPlayheadMs(), nextSpeed);
                      } else {
                        webAudioEngine.startPlayback(frameToMs(playheadRef.current), nextSpeed);
                      }
                      return nextSpeed;
                    });
                    setPlayback(true);
                  }}
                >
                  L
                </button>
                <span>{playSpeed}×</span>
                <button
                  type="button"
                  className={`transport-loop-button ${loopPlayback ? "is-active" : ""}`}
                  data-testid="transport-loop-btn"
                  aria-pressed={loopPlayback}
                  aria-label="Loop playback"
                  title="Loop playback over In/Out range (Shift+Space)"
                  onClick={() => {
                    const next = !loopPlaybackRef.current;
                    loopPlaybackRef.current = next;
                    setLoopPlayback(next);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M11.5 2.5L13.5 4.5L11.5 6.5M2.5 8V6.5C2.5 5.39543 3.39543 4.5 4.5 4.5H13.5M4.5 13.5L2.5 11.5L4.5 9.5M13.5 8V9.5C13.5 10.6046 12.6046 11.5 11.5 11.5H2.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className={`sound-button ${soundOn ? "" : "is-muted"}`}
                  onClick={() => {
                    setSoundOn((value) => {
                      const next = !value;
                      webAudioEngine.setSoundEnabled(next);
                      if (!next) audioController.stopAll();
                      return next;
                    });
                  }}
                >
                  ♫
                </button>
                <StereoPeakMeter playing={playback && direction > 0} soundOn={soundOn} />
              </div>
              <div className="transport-counter">
                SHOT <strong>{String(currentIndex + 1).padStart(4, "0")}</strong>
                <i>/</i>
                {clips.length.toLocaleString()}
              </div>
            </div>
          </main>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize viewer and inspector"
            data-testid="splitter-inspector"
            className={`pane-splitter is-vertical ${activePaneDrag === "inspector" ? "is-dragging" : ""}`}
            title="Drag to resize Inspector width (double-click to reset)"
            onDoubleClick={() => {
              const next = { ...paneSizesRef.current, inspectorWidth: DEFAULT_INSPECTOR_WIDTH };
              setPaneSizes(next);
              writeStoredPaneSizes(next);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              setActivePaneDrag("inspector");
              paneDragSessionRef.current = {
                which: "inspector",
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startSize: paneSizes.inspectorWidth,
              };
            }}
          />

          <Inspector
            project={project}
            frame={selectedFrame}
            localFrame={inspectorLocalFrame}
            clipDurationFrames={selectedClip.durationFrames}
            canSplit={canSplit}
            pictureSrc={selectedImageSrc}
            selectedCount={selectedFrameIds.length}
            copied={!!copiedEffects}
            activeTab={inspectorTab}
            onChangeTab={setInspectorTab}
            inheritedMusic={inheritedMusic}
            inheritedAmbience={inheritedAmbience}
            onSelectFrameId={(fid) => {
              const hit = clips.find((c) => c.keyframe.id === fid);
              if (hit) setSelection([fid], fid, hit.startFrame);
            }}
            onBrowse={openBrowser}
            onUpload={imageInputRefTarget}
            onSetPicture={setFramePicture}
            onSetAnimation={(animation: BeatAnimation | undefined, label: string) =>
              editProject((current) => setBeatAnimation(current, selectedFrame.id, animation), label)
            }
            onPreviewAnimation={(animation: BeatAnimation | undefined) =>
              previewProjectEdit((current) => setBeatAnimation(current, selectedFrame.id, animation))
            }
            onDragStart={beginDragEdit}
            onDragEnd={endDragEdit}
            onJumpToLocalFrame={(local) =>
              scrubToFrame(selectedClip.startFrame + Math.max(0, Math.min(selectedClip.durationFrames - 1, local)))
            }
            onSetEffect={(path, value) =>
              editProject(
                (current) => isImageGradePath(path) && selectedFrameIds.length > 1
                  ? setImageGradeForFrames(current, selectedFrameIds, path, path === "cinematic.colorGrade" && value === undefined ? "" : value)
                  : setEffectField(current, selectedFrame.id, path, path === "cinematic.colorGrade" && value === undefined ? "" : value),
                `${path.replace("cinematic.", "")} changed${isImageGradePath(path) && selectedFrameIds.length > 1 ? ` on ${selectedFrameIds.length} selected frames` : ""}`,
              )
            }
            onResetEffect={(path) =>
              editProject(
                (current) => isImageGradePath(path) && selectedFrameIds.length > 1
                  ? setImageGradeForFrames(current, selectedFrameIds, path, undefined, true)
                  : resetEffectField(current, selectedFrame.id, path),
                `${path.replace("cinematic.", "")} reset`,
              )
            }
            onSetBeat={(path, value) =>
              editProject((current) => setBeatField(current, selectedFrame.id, path, value), `${path} changed`)
            }
            onSetScene={(path, value) =>
              editProject((current) => setSceneField(current, selectedFrame.sceneId, path, value), `${path} changed`)
            }
            onCopyEffects={copyEffects}
            onPasteEffects={pasteEffects}
            copiedAnimation={copiedAnimation}
            onCopyAnimation={copyAnimation}
            onPasteAnimation={pasteAnimation}
            onOpenCurveEditor={(prop) =>
              setCurveEditor({ frameId: selectedFrame.id, prop })
            }
            onJumpPrevKeyframe={jumpPrevKeyframe}
            onJumpNextKeyframe={jumpNextKeyframe}
            carriedStartPose={selectedClip?.carriedStartPose}
            presetOffsetFrames={
              selectedClip && pictureRuns[selectedClip.index]
                ? Math.max(0, selectedClip.startFrame - pictureRuns[selectedClip.index].runStartFrame)
                : 0
            }
            onConvertAllToKeyframes={handleConvertAllToKeyframes}
            onPlayVoice={() => {
              if (activeAudioClip && activeAudioClip.lane === "voice") {
                webAudioEngine.previewClip(activeAudioClip, resolveMedia);
                return;
              }
              if (!selectedFrame.beat.audioUrl) return;
              previewPlayerRef.current?.pause();
              audioController.unlock();
              audioController.playVoice(
                selectedFrame.beat.audioUrl,
                resolveMedia,
                Number(selectedFrame.beat.audioOffsetSeconds || 0),
              );
            }}
            onSplit={splitAtPlayhead}
            onInsert={() => addKeyframe(selectedFrame.id)}
            onDuplicate={duplicateCurrent}
            canMergeFrames={canMergeFrames}
            onMergeFrames={handleMergeFrames}
            onDelete={() => executeDelete(false)}
            onExecuteDelete={executeDelete}
            onDeleteClip={handleDeleteInspectorClip}
            kenBurnsActive={
              kenBurnsDrawStep !== null ||
              (Boolean(selectedFrame.beat.animation?.kenBurns) && !kenBurnsSuppressed)
            }
            onToggleKenBurns={handleToggleKenBurns}
            onEdgeClamped={() => setEdgeWarningToken((t) => t + 1)}
            onMove={(delta) => {
              const ids = selectedIdsRef.current.length ? selectedIdsRef.current : [selectedFrame.id];
              const current = projectRef.current;
              if (!current) return;
              const res = reorderKeyframeWithResult(current, ids, delta);
              if (res.project !== current) {
                applyProject(res.project, delta < 0 ? "Clip moved earlier" : "Clip moved later");
                if (res.resultIds.length) {
                  setSelectedFrameIds(res.resultIds);
                  setSelectedFrameId(res.resultIds[0]);
                  setMultiSelection({
                    pictureIds: res.resultIds,
                    captions: [],
                    audioClipIds: [],
                    keyframes: [],
                  });
                }
              }
            }}
            onPreviewSfx={() => {
              if (activeAudioClip && activeAudioClip.lane === "sfx") {
                webAudioEngine.previewClip(activeAudioClip, resolveMedia);
                return;
              }
              previewPlayerRef.current?.pause();
              audioController.unlock();
              audioController.playSfx(selectedFrame.beat.sfxUrl, selectedFrame.beat.sfxVolume, resolveMedia);
            }}
            onPreviewMusic={() => {
              if (activeAudioClip && activeAudioClip.lane === "music") {
                webAudioEngine.previewClip(activeAudioClip, resolveMedia);
                return;
              }
              const url = String(
                selectedFrame.scene.musicUrl ||
                  selectedFrame.scene.sceneAudioUrl ||
                  inheritedMusic?.url ||
                  "",
              );
              previewSingleAudio(url, Number(selectedFrame.scene.musicLevel ?? 0.7));
            }}
            onPreviewAmbience={(fileUrl) => previewSingleAudio(fileUrl, 0.6)}
            selectedCaptionIndices={
              selectedCaption?.frameId === selectedFrame.id
                ? selectedCaption.indices
                : []
            }
            canMergeCaptions={canMergeCaptions}
            onSelectCaptionIndex={(index, extendNeighbour) =>
              handleSelectCaption(selectedFrame.id, index, extendNeighbour)
            }
            onCommitCaptions={(captions, label, nextSelectedIndices) =>
              handleCommitCaptions(
                selectedFrame.id,
                captions,
                selectedClip.durationFrames,
                label,
                nextSelectedIndices,
              )
            }
            onResetCaptions={() => handleResetCaptions(selectedFrame.id)}
            onMergeCaptions={handleMergeCaptions}
            resolvedAudioClips={resolvedAudioClips}
            selectedAudioClipIds={multiSelection.audioClipIds}
            playheadMs={playback ? webAudioEngine.getCurrentPlayheadMs() : frameToMs(playheadFrame)}
            duckDepth={duckDepth}
            onSetDuckDepth={setDuckDepth}
            onSelectAudioClipId={(clipId: string) => {
              const hit = resolvedAudioClips.find((c) => c.id === clipId);
              if (hit) handleSelectAudioClip(hit, false, Math.round((hit.startMs * FPS) / 1000));
            }}
            onCommitAudioClipPatch={(clipId: string, patch: Partial<AudioClip>, label: string) =>
              editProject((cur) => updateAudioClip(cur, clipId, patch), label)
            }
            onMoveAudioClipStartMs={(clipId: string, newStartMs: number) =>
              editProject(
                (cur) => {
                  const curClips = buildTimelineClips(buildKeyframes(cur.story), voiceDurations).clips;
                  const existing = cur.audioClips?.find((c) => c.id === clipId);
                  if (!existing) return cur;
                  const reanchored = reanchorAudioClipToMs(existing, Math.max(0, newStartMs), curClips);
                  return updateAudioClip(cur, clipId, {
                    anchorId: reanchored.anchorId,
                    offsetMs: reanchored.offsetMs,
                  });
                },
                `Moved sound to ${Math.round(newStartMs)} ms`,
              )
            }
            onAddAudioClipOnLane={(lane: AudioLaneId) => openBrowser("audio", lane)}
            onPreviewAudioClip={(clip: ResolvedAudioClip) =>
              webAudioEngine.previewClip(clip, resolveMedia)
            }
            onRebuildSoundFromFilm={handleRebuildSoundFromFilm}
          />
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize viewer and timeline"
          data-testid="splitter-timeline-height"
          className={`pane-splitter is-horizontal ${activePaneDrag === "timeline" ? "is-dragging" : ""}`}
          title="Drag to resize timeline dock height (double-click to reset)"
          onDoubleClick={() => {
            const next = { ...paneSizesRef.current, timelineHeight: DEFAULT_TIMELINE_HEIGHT };
            setPaneSizes(next);
            writeStoredPaneSizes(next);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            setActivePaneDrag("timeline");
            paneDragSessionRef.current = {
              which: "timeline",
              pointerId: e.pointerId,
              startClientX: e.clientX,
              startClientY: e.clientY,
              startSize: paneSizes.timelineHeight,
            };
          }}
        />

        <div className={`lower-timeline-dock ${curveEditor ? "has-curve-editor" : ""}`}>
          {curveEditor && (() => {
            const curveClip =
              clips.find((c) => c.keyframe.id === curveEditor.frameId) || selectedClip;
            const curveLocal = Math.max(
              0,
              Math.min(curveClip.durationFrames - 1, playheadFrame - curveClip.startFrame),
            );
            return (
              <CurveEditor
                clip={curveClip}
                prop={curveEditor.prop}
                localFrame={curveLocal}
                onChangeProp={(nextProp) =>
                  setCurveEditor({ frameId: curveClip.keyframe.id, prop: nextProp })
                }
                onClose={() => setCurveEditor(null)}
                onScrubLocalFrame={(local) =>
                  scrubToFrame(
                    curveClip.startFrame +
                      Math.max(0, Math.min(curveClip.durationFrames - 1, local)),
                  )
                }
                onSetAnimation={(animation, label) =>
                  editProject(
                    (current) => setBeatAnimation(current, curveClip.keyframe.id, animation),
                    label,
                  )
                }
                onPreviewAnimation={(animation) =>
                  previewProjectEdit((current) =>
                    setBeatAnimation(current, curveClip.keyframe.id, animation),
                  )
                }
                onDragStart={beginDragEdit}
                onDragEnd={endDragEdit}
              />
            );
          })()}

          <Timeline
            clips={clips}
            totalFrames={totalFrames}
            playheadFrame={playheadFrame}
            selectedFrameId={selectedFrame.id}
            selectedFrameIds={selectedFrameIds}
            snapEnabled={snapEnabled}
            noteMarkers={noteMarkers}
            editingMarkerId={editingMarkerId}
            canSplit={canSplit}
            hasClipboard={
              copiedClips.length > 0 ||
              Boolean(multiClipboard) ||
              copiedKeyframes.length > 0
            }
            musicDurations={musicDurations}
            trackMix={trackMix}
            resolveMedia={resolveMedia}
            onToggleTrackMute={handleToggleTrackMute}
            onToggleTrackSolo={handleToggleTrackSolo}
            onSetTrackLevel={handleSetTrackLevel}
            onFocusInspectorTab={setInspectorTab}
            onToggleSnap={() => setSnapEnabled((prev) => !prev)}
            resizeLeaveGaps={resizeLeaveGaps}
            onToggleResizeLeaveGaps={() => setResizeLeaveGaps((prev) => !prev)}
            onNudgeClips={handleNudgeClips}
            onDuplicateFrame={duplicateCurrent}
            onAddNoteMarker={handleAddMarkerAtPlayhead}
            onUpdateNoteMarker={(markerId, name) =>
              editProject((current) => updateNoteMarker(current, markerId, { name }), `Marker renamed to "${name}"`)
            }
            onDeleteNoteMarker={(markerId) =>
              editProject((current) => deleteNoteMarker(current, markerId), "Marker deleted")
            }
            onCloseMarkerEditor={() => setEditingMarkerId(null)}
            onEditMarker={(markerId) => setEditingMarkerId(markerId)}
            onScrub={scrubToFrame}
            onSetSelection={setSelection}
            onSelectAllImages={selectAllImages}
            onDragStart={beginDragEdit}
            onDragEnd={endDragEdit}
            onTrimPreview={(frameId, durationFrames) =>
              previewProjectEdit((current) =>
                trimKeyframe(current, frameId, durationFrames, {
                  leaveGap: resizeLeaveGaps,
                }),
              )
            }
            onRollPreview={(leftId, rightId, leftDur, rightDur) =>
              previewProjectEdit((current) => setRollDurations(current, leftId, rightId, leftDur, rightDur))
            }
            onMoveClips={handleMoveClips}
            onSetTransition={handleSetTransition}
            onAnimationPreview={(frameId, animation) =>
              previewProjectEdit((current) => setBeatAnimation(current, frameId, animation))
            }
            onCommitAnimation={(frameId, animation, label) =>
              editProject((current) => setBeatAnimation(current, frameId, animation), label)
            }
            onOpenCurveEditor={(frameId, prop) => {
              const hit = clips.find((c) => c.keyframe.id === frameId);
              if (hit && selectedFrameId !== frameId) {
                setSelectedFrameId(frameId);
                setSelectedFrameIds([frameId]);
              }
              setCurveEditor({ frameId, prop });
            }}
            onCopy={handleCopyClips}
            onPaste={handlePasteClips}
            onSplit={splitAtPlayhead}
            canMergeFrames={canMergeFrames}
            onMergeFrames={handleMergeFrames}
            onDelete={() => executeDelete(false)}
            onExecuteDelete={executeDelete}
            onMoveCue={moveCue}
            onDropFile={handleTimelineDrop}
            onDropImageAsset={handleDropAssetOnClip}
            onDropAudioAsset={handleAddAudioClipOnLane}
            showCaptions={showCaptions}
            onToggleShowCaptions={() => setShowCaptions((v) => !v)}
            selectedCaption={selectedCaption}
            canMergeCaptions={canMergeCaptions}
            onSelectCaption={handleSelectCaption}
            onClearCaptionSelection={() => setSelectedCaption(null)}
            onCommitCaptions={handleCommitCaptions}
            onCaptionPreview={handleCaptionPreview}
            resolvedCaptions={resolvedTimelineCaptions}
            onBeginFreeCaptionDrag={handleBeginFreeCaptionDrag}
            onPreviewFreeCaptionMove={handlePreviewFreeCaptionMove}
            onCommitFreeCaptionMove={handleCommitFreeCaptionMove}
            onCancelFreeCaptionMove={handleCancelFreeCaptionMove}
            onMergeCaptions={handleMergeCaptions}
            onDeleteCaptions={() => {
              void handleDeleteSelectedCaptions();
            }}
            showDepthMaps={showDepthMaps}
            onToggleShowDepthMaps={() => setShowDepthMaps((v) => !v)}
            showDepthMapOverlay={showDepthMapOverlay}
            onToggleShowDepthMapOverlay={() => setShowDepthMapOverlay((v) => !v)}
            showCutouts={showCutouts}
            onToggleShowCutouts={() => setShowCutouts((v) => !v)}
            mutedCutoutLayers={mutedCutoutLayers}
            onToggleMuteCutoutLayer={toggleMutedCutoutLayer}
            onBrowseMediaForFrame={(frameId, target) => openBrowser("image", target, frameId)}
            onUploadMediaForFrame={(frameId, target) =>
              imageInputRefTarget("image", target, frameId)
            }
            onAssignDepthMap={(frameId, ref, label = "Depth map updated") =>
              editProject((cur) => setFrameDepthMap(cur, frameId, ref), label)
            }
            onAssignDepthPlate={(frameId, ref, label = "Clean plate updated") =>
              editProject((cur) => setFrameDepthPlate(cur, frameId, ref), label)
            }
            onDropDepthFile={(file, frameId) =>
              void saveUploadedFile(file, { kind: "image", target: "depthMap", frameId })
            }
            onAddCutout={(frameId, ref) =>
              editProject(
                (cur) => addFrameCutout(cur, frameId, ref).project,
                "Cutout layer added",
              )
            }
            onSetCutoutLayer={(frameId, layerIndex, cutout, label) =>
              editProject(
                (cur) => setFrameCutoutLayer(cur, frameId, layerIndex, cutout),
                label || `Cutout ${layerIndex + 1} updated`,
              )
            }
            onDropCutoutFile={(file, frameId, layerIndex) =>
              void saveUploadedFile(file, {
                kind: "image",
                target: layerIndex === undefined ? "cutout:add" : `cutout:${layerIndex}`,
                frameId,
              })
            }
            onPreviewCutoutDepth={(frameId, layerIndex, depth) =>
              previewProjectEdit((cur) =>
                updateFrameCutoutDepth(cur, frameId, layerIndex, depth),
              )
            }
            onCommitCutoutDepth={(frameId, layerIndex, depth, label) =>
              editProject(
                (cur) => updateFrameCutoutDepth(cur, frameId, layerIndex, depth),
                label || `Cutout ${layerIndex + 1} depth updated`,
              )
            }
            onMoveCutoutLayer={(frameId, fromLayer, toLayer) =>
              editProject(
                (cur) => moveFrameCutoutLayer(cur, frameId, fromLayer, toLayer),
                `Moved cutout to layer ${toLayer + 1}`,
              )
            }
            onClearCutouts={(frameId) =>
              editProject((cur) => clearFrameCutouts(cur, frameId), "Cutout layers cleared")
            }
            resolvedAudioClips={resolvedAudioClips}
            audioDurations={audioDurationSecondsMap}
            multiSelection={multiSelection}
            mediaBinOpen={mediaBinOpen}
            onToggleMediaBin={() => setMediaBinOpen((v) => !v)}
            onSetMultiSelection={handleSetMultiSelection}
            onClearAllSelection={clearAllSelection}
            onSelectAudioClip={handleSelectAudioClip}
            onSelectKeyframeDiamond={handleSelectKeyframeDiamond}
            onPreviewUpdateAudioClip={(clipId, updated) =>
              previewProjectEdit((cur) => updateAudioClip(cur, clipId, updated))
            }
            onShiftSelectionPreview={handleShiftSelectionPreview}
            onCommitSelectionShift={handleCommitSelectionShift}
            inPointFrame={inPointFrame}
            outPointFrame={outPointFrame}
            loopPlayback={loopPlayback}
            onSetInPoint={(f) => {
              setInPoint(f);
              if (f !== null) setEditLabel(`In mark set at frame ${f}`);
            }}
            onSetOutPoint={(f) => {
              setOutPoint(f);
              if (f !== null) setEditLabel(`Out mark set at frame ${f}`);
            }}
            onClearInOut={() => {
              clearInOutMarks();
              setEditLabel("In/Out marks cleared");
            }}
            onToggleLoop={() => {
              const next = !loopPlaybackRef.current;
              loopPlaybackRef.current = next;
              setLoopPlayback(next);
            }}
          />
        </div>
      </div>

      <footer className="app-footer">
        <span>
          <b>FRAME/24</b> · 24 FPS KEYFRAME ANIMATIC EDITOR
        </span>
        <span>
          {diagnostics.length
            ? `${diagnostics.length} RUN-ORDER NOTE${diagnostics.length === 1 ? "" : "S"}`
            : "RUNNING ORDER VERIFIED"}
        </span>
        <span>SPACE PLAY · ⇧SPACE LOOP · I/O IN/OUT · N SNAP ({snapEnabled ? "ON" : "OFF"}) · M MARKER · ⌘Z UNDO</span>
      </footer>
      {dragOver && (
        <div className="drop-overlay">
          <div>
            <span>＋</span>
            <strong>DROP A STILL</strong>
            <small>Original bytes are stored in this project</small>
          </div>
        </div>
      )}

      {browser && (
        <AssetBrowser
          title={
            browser.target === "depthMap"
              ? "Choose a depth map"
              : browser.target === "depthPlate"
                ? "Choose a clean plate"
                : browser.target.startsWith("cutout:")
                  ? "Choose a cutout layer"
                  : browser.target === "picture" ||
                      browser.target === "scenePicture" ||
                      browser.target === "foregroundImage"
                    ? "Choose a picture"
                    : browser.target === "voice"
                      ? "Choose a voice take"
                      : browser.target === "sfx"
                        ? "Choose a sound effect"
                        : browser.target === "music"
                          ? "Choose a music cue"
                          : "Choose an ambience file"
          }
          kind={browser.kind}
          items={browser.kind === "image" ? imageBrowserItems : audioBrowserItems}
          onSelect={chooseBrowserAsset}
          onClose={() => setBrowser(null)}
        />
      )}
      {charactersOpen && project.story.id === "sweet-jesus-film" && (
        <CharacterReferences onClose={() => setCharactersOpen(false)} />
      )}
      {launderetteOpen && project.story.id === "sweet-jesus-film" && (
        <LaunderetteReferences
          onClose={() => setLaunderetteOpen(false)}
          emptyOpeningCount={countEmptySweetJesusOpeningShots(project)}
          onFillOpening={() => editProject(fillEmptySweetJesusOpeningShots, "Opening references added")}
        />
      )}
      {missingOpen && (
        <MissingMediaModal
          items={project.missing}
          folderLabel={folderLabel}
          onClose={() => setMissingOpen(false)}
          onLink={() => {
            setMissingOpen(false);
            folderInputRef.current?.setAttribute("webkitdirectory", "");
            folderInputRef.current?.click();
          }}
        />
      )}
      {exportOpen && (
        <ExportModal
          project={project}
          frames={frames}
          clips={clips}
          totalFrames={totalFrames}
          playheadFrame={playheadFrame}
          selectedClip={selectedClip}
          inPointFrame={inPointFrame}
          outPointFrame={outPointFrame}
          tab={exportTab}
          setTab={setExportTab}
          progress={exportProgress}
          message={exportMessage}
          patchReport={patchReport}
          mp4Message={mp4Message}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          setRangeStart={setRangeStart}
          setRangeEnd={setRangeEnd}
          wholeFilm={exportWholeFilm}
          setWholeFilm={setExportWholeFilm}
          fromFrame={exportFromFrame}
          toFrame={exportToFrame}
          setFromFrame={setExportFromFrame}
          setToFrame={setExportToFrame}
          captions={captionsExport}
          srt={srtExport}
          marks={marksExport}
          quality={exportQuality}
          capture={exportCapture}
          setCapture={setExportCapture}
          workers={exportWorkers}
          gpu={exportGpu}
          normalizeAudio={exportNormalize}
          loudnessTarget={exportLoudnessTarget}
          opticalPrintEq={exportOpticalEq}
          embedChapters={exportEmbedChapters}
          setCaptions={setCaptionsExport}
          setSrt={setSrtExport}
          setMarks={setMarksExport}
          setQuality={setExportQuality}
          setWorkers={setExportWorkers}
          setGpu={setExportGpu}
          setNormalizeAudio={setExportNormalize}
          setLoudnessTarget={setExportLoudnessTarget}
          setOpticalPrintEq={setExportOpticalEq}
          setEmbedChapters={setExportEmbedChapters}
          mp4Job={mp4Job}
          onBundle={() => void exportBundle()}
          onPatch={exportPatch}
          onSrt={exportSrt}
          onVtt={exportVtt}
          onMp4={() => void startMp4Export()}
          onCancelMp4={() => void cancelMp4Export()}
          onClose={() => setExportOpen(false)}
          onRestoreSnapshot={restoreSnapshot}
        />
      )}
      {snapshotModal && (
        <SnapshotModal
          project={project}
          name={snapshotName}
          setName={setSnapshotName}
          onSave={createSnapshot}
          onClose={() => setSnapshotModal(false)}
          onRestore={restoreSnapshot}
        />
      )}
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {switchingProject && (
        <div className="project-switch-overlay" role="status" aria-live="polite">
          <span>Saving and opening film…</span>
        </div>
      )}
      {cropState && (
        <CropModal
          crop={cropState}
          imageSrc={objectUrls.get(`asset:${cropState.assetId}`)}
          onChange={(x, y) => setCropState((current) => (current ? { ...current, x, y } : current))}
          onSave={saveCrop}
          onSkip={() => setCropState(null)}
        />
      )}
      {loadError && (
        <div className="toast-message" role="status">
          <span>{loadError}</span>
          <button onClick={() => setLoadError("")}>×</button>
        </div>
      )}
    </div>
  );
}
