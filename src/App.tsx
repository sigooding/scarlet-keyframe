import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AssetBrowser, type BrowserAsset } from "./components/AssetBrowser";
import type { SelectedCaptionState } from "./components/CaptionLane";
import { CinematicPreview } from "./components/CinematicPreview";
import { CurveEditor } from "./components/CurveEditor";
import { CropModal, type CropState } from "./components/CropModal";
import { ExportModal, type ExportTab } from "./components/ExportModal";
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
  activeCaptionAtLocalFrame,
  DEFAULT_CAPTION_STYLE,
  deleteCaptionsAtIndices,
  effectiveCaptionsForBeat,
  makeCaptionsSrt,
  makeCaptionsVtt,
  mergeAdjacentCaptions,
  normalizeCaptionStyle,
  type BeatCaption,
  type CaptionStyle,
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
  type ProjectAsset,
  type ProjectState,
} from "./core/model";
import {
  addNoteMarker,
  canMergeKeyframes,
  cloneStory as cloneProjectStory,
  convertProjectCameraMovesToKeyframes,
  copyEffectBlock,
  copyMultiSelection,
  copySelectedBeats,
  deleteNoteMarker,
  duplicateKeyframe,
  executeDeleteSelection,
  insertKeyframeAfter,
  mergeKeyframes,
  moveSfxCue,
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
import { buildPortableBundle } from "./core/exportBundle";
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
import { loadActiveProject, saveActiveProject } from "./core/storage";
import { clipFrames, FPS, formatTimecode } from "./core/timing";
import { writeStudioPatch, type StudioPatchResult } from "./core/patch";
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
import bundledFilm from "./data/nobodys-witness-film.json";
import bundledEdits from "./data/studio-edits.json";

type BrowseTarget = BrowseMediaTarget;
type BrowserState = { kind: "image" | "audio"; target: BrowseTarget };
type UploadIntent = { kind: "image" | "audio"; target: UploadMediaTarget; frameId: string };

const PLAYHEAD_SESSION_KEY = "frame24-playhead";

declare global {
  interface Window {
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
      exportSrtText: (sceneId?: string) => string;
      exportVttText: (sceneId?: string) => string;
    };
  }
}

const history = new UndoHistory<ProjectState>(100);
const audioController = new PreviewAudioController();

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

export default function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [project, setProject] = useState<ProjectState | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
  const [viewerZoom, setViewerZoom] = useState(1);
  const [showCaptions, setShowCaptions] = useState(true);
  const [ccStyleOpen, setCcStyleOpen] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState<SelectedCaptionState | null>(null);
  const selectedCaptionRef = useRef<SelectedCaptionState | null>(null);
  selectedCaptionRef.current = selectedCaption;
  const [showMarks, setShowMarks] = useState(true);
  const [showTimecodeOverlay, setShowTimecodeOverlay] = useState(true);
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState<ExportTab>("bundle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [patchReport, setPatchReport] = useState<StudioPatchResult | null>(null);
  const [mp4Message, setMp4Message] = useState("");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [captionsExport, setCaptionsExport] = useState(true);
  const [marksExport, setMarksExport] = useState(true);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotModal, setSnapshotModal] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
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
        const [saved, mediaIndex] = await Promise.all([
          loadActiveProject().catch(() => undefined),
          window.location.protocol === "file:"
            ? Promise.resolve([] as string[])
            : fetch("examples/media-index.json")
                .then((response) => (response.ok ? (response.json() as Promise<string[]>) : []))
                .catch(() => [] as string[]),
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
        if (saved?.story?.scenes?.length) {
          initialProject = {
            ...saved,
            importedMissing: saved.importedMissing || [],
            assets: saved.assets || [],
            snapshots: saved.snapshots || [],
          };
          statusLabel = "AUTOSAVED PROJECT";
        } else {
          const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json", {
            voiceDurations: initialVoiceDurations,
          });
          const contextual = { ...imported, story: applyStudioMusicSync(imported.story, sourceEdits) };
          initialProject = createProjectState(contextual, [], sourceEdits);
          statusLabel = "FILM READY";
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
        initialProject.missing = evaluateMissingMedia(initialProject, new Map(), paths);

        projectRef.current = initialProject;
        setProject(initialProject);
        const builtFrames = buildKeyframes(initialProject.story);
        const { clips: builtClips, totalFrames: builtTotal } = buildTimelineClips(
          builtFrames,
          initialVoiceDurations,
        );
        const storedFrame = readStoredPlayhead();
        const s77Clip = builtClips.find((clip) => clip.keyframe.mark === "77") || builtClips[0];
        const startPlayhead =
          storedFrame !== null && storedFrame < builtTotal
            ? storedFrame
            : s77Clip?.startFrame ?? 0;
        const startClip = clipAtFrame(builtClips, startPlayhead) || s77Clip;
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
  }, []);

  useEffect(() => {
    if (!loading) writeStoredPlayhead(playheadFrame);
  }, [loading, playheadFrame]);

  const frames = useMemo(() => (project ? buildKeyframes(project.story) : []), [project?.story]);
  const { clips, totalFrames } = useMemo(
    () => buildTimelineClips(frames, voiceDurations),
    [frames, voiceDurations],
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

  useEffect(() => {
    webAudioEngine.setDuckDepth(duckDepth);
  }, [duckDepth]);

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
    if (!project) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("SAVING…");
      void saveActiveProject(project)
        .then(() => setSaveStatus("SAVED TO THIS BROWSER"))
        .catch(() => setSaveStatus("AUTOSAVE FAILED"));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [project]);

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

  const openBrowser = useCallback((kind: "image" | "audio", target: BrowseTarget) => setBrowser({ kind, target }), []);

  const chooseBrowserAsset = useCallback(
    (asset: BrowserAsset) => {
      const target = browser?.target;
      if (!project || !selectedFrame || !target) return;
      if (target === "picture") setFramePicture(asset.ref);
      else if (target === "scenePicture")
        editProject((current) => setSceneField(current, selectedFrame.sceneId, "background", asset.ref), "Scene plate changed");
      else if (target === "depthMap" || target === "foregroundImage")
        editProject(
          (current) => setEffectField(current, selectedFrame.id, `cinematic.${target}`, asset.ref),
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
    (kind: "image" | "audio", target: UploadIntent["target"]) => {
      if (!selectedFrame) return;
      setUploadIntent({ kind, target, frameId: selectedFrame.id });
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
    let next: ProjectState = { ...current, assets: [...current.assets, asset], updatedAt: Date.now() };
    const assetRef = `asset:${asset.id}`;
    if (intent.target === "picture") {
      next = setPicture(next, intent.frameId, assetRef);
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
    applyProject(next, `${intent.kind === "image" ? "Picture" : "Sound"} uploaded`);
    setSelectedFrameId(intent.frameId);
    setSelectedFrameIds([intent.frameId]);
    if (asset.type === "image" && asset.width && asset.height && Math.abs(asset.width / asset.height - 16 / 9) > 0.015) {
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
    const raw = await file.text();
    const imported = parseImportPayload(raw, file.name, { voiceDurations });
    const sourceEdits = projectRef.current?.sourceEdits;
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
    setExportOpen(false);
    setEditLabel(`Imported ${file.name}`);
    setSaveStatus("IMPORT COMPLETE");
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

  const startPlaybackFromCurrent = useCallback(() => {
    if (!project || !clips.length) return;
    webAudioEngine.unlock();
    const startAt = playheadRef.current >= totalFrames - 1 ? 0 : playheadRef.current;
    if (startAt !== playheadRef.current) setPlayheadFrame(startAt);
    webAudioEngine.setClips(resolvedAudioClips, resolveMedia);
    webAudioEngine.setSoundEnabled(soundOn);
    webAudioEngine.setTrackMix(trackMix);
    webAudioEngine.setDuckDepth(duckDepth);
    webAudioEngine.startPlayback(frameToMs(startAt), 1);
    setDirection(1);
    setPlaySpeed(1);
    setPlayback(true);
  }, [
    project,
    clips.length,
    totalFrames,
    resolvedAudioClips,
    resolveMedia,
    soundOn,
    trackMix,
    duckDepth,
  ]);

  const togglePlayback = useCallback(() => {
    if (!project || !clips.length) return;
    if (playback) {
      stopPlaybackAndAudio();
      return;
    }
    startPlaybackFromCurrent();
  }, [playback, project, clips.length, stopPlaybackAndAudio, startPlaybackFromCurrent]);

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

        if (nextFrame >= totalFrames - 1) {
          const end = Math.max(0, totalFrames - 1);
          setPlayheadFrame(end);
          const endClip = clipAtFrame(clips, end);
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

  const canSplit = Boolean(
    selectedClip && playheadFrame > selectedClip.startFrame && playheadFrame < selectedClip.endFrame,
  );

  const splitAtPlayhead = useCallback(() => {
    const current = projectRef.current;
    if (!current || !selectedClip) return;
    const localOffset = playheadRef.current - selectedClip.startFrame;
    if (localOffset <= 0 || localOffset >= selectedClip.durationFrames) return;
    const audioRef = selectedClip.keyframe.beat.audioUrl;
    const voiceSec = audioRef ? voiceDurations.get(audioRef) : undefined;
    const result = splitKeyframeAt(current, selectedClip.keyframe.id, localOffset, voiceSec);
    if (!result) return;
    applyProject(result.project, "Clip split at playhead");
    setSelectedFrameId(result.rightId);
    setSelectedFrameIds([result.rightId]);
    setMultiSelection({
      pictureIds: [result.rightId],
      captions: [],
      audioClipIds: [],
      keyframes: [],
    });
  }, [applyProject, selectedClip, voiceDurations]);

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
        activeClip
          ? activeCaptionAtLocalFrame(
              activeClip.keyframe.beat,
              activeClip.durationFrames,
              viewerLocalFrame,
            )
          : undefined,
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

      // Space plays/stops from EVERYWHERE in the app except while typing inside an actual text field
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
        togglePlayback();
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
      if (!mod && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreenPlayback();
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
    duckDepth,
    executeDelete,
    exitFullscreenPlayback,
    handleAddMarkerAtPlayhead,
    handleCopyClips,
    handleNudgeSelectedAudio,
    handlePasteClips,
    kenBurnsDrawStep,
    toggleFullscreenPlayback,
    jumpNextKeyframe,
    jumpPrevKeyframe,
    playback,
    redo,
    resolveMedia,
    resolvedAudioClips,
    selectRelativeClip,
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
      .then(() => setSaveStatus("SAVED TO THIS BROWSER"))
      .catch(() => setSaveStatus("AUTOSAVE FAILED"));
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
    if (!selectedFrame) return;
    setCopiedEffects(copyEffectBlock(selectedFrame));
    setEditLabel("Effects copied");
  }

  function pasteEffects(): void {
    if (!project || !copiedEffects) return;
    const targets = selectedFrameIds.filter((id) => id !== selectedFrameId);
    if (!targets.length) return;
    editProject(
      (current) => pasteEffectBlock(current, targets, copiedEffects),
      `Effects pasted to ${targets.length} clips`,
    );
  }

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
    if (!frames.length) return;
    const selectedRange =
      rangeEnd === null ? frames : frames.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1);
    const durationFrames = selectedRange.map((frame) =>
      clipFrames(frame, frame.beat.audioUrl ? voiceDurations.get(frame.beat.audioUrl) : undefined),
    );
    const text = makeCaptionsSrt(selectedRange, durationFrames, FPS);
    downloadText(text, `${slug(project?.title || "animatic")}.srt`, "text/plain");
    setExportMessage(`SRT written for ${selectedRange.length} clips.`);
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

  if (loading) {
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

  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      style={{ outline: "none" }}
      className={`frame24-shell ${dragOver ? "is-drag-over" : ""} ${isFullscreen ? "is-fullscreen-cinema" : ""}`}
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
        onExport={() => {
          setExportOpen(true);
          setExportMessage("");
          setPatchReport(null);
        }}
        onSave={saveNow}
        missingCount={project.missing.length}
        onMissing={() => setMissingOpen(true)}
        editLabel={editLabel}
        totalDuration={totalSeconds}
        onConvertAllToKeyframes={() =>
          editProject(
            (current) => convertProjectCameraMovesToKeyframes(current, voiceDurations),
            "Converted all camera moves to keyframes",
          )
        }
      />

      <div className={`editor-body ${curveEditor ? "has-curve-editor" : ""}`}>
        <div className={`upper-workspace ${mediaBinOpen ? "has-bin" : ""}`}>
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
                  {viewerFrame.text || "No caption on this beat"}
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
                  frame={viewerFrame}
                  localFrame={viewerLocalFrame}
                  presetFrame={viewerPresetFrame}
                  shotKeyId={viewerShotKeyId}
                  carriedStartPose={activeClip?.carriedStartPose}
                  clipDurationFrames={activeClip?.durationFrames}
                  playheadFrame={playheadFrame}
                  totalFrames={totalFrames}
                  captionStyle={captionStyle}
                  imageSrc={viewerImageSrc}
                  imagePosition={viewerImagePosition}
                  prevOnionSrc={prevOnionSrc}
                  nextOnionSrc={nextOnionSrc}
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
                  playing={playback}
                  soundOn={soundOn}
                  showCaption={showCaptions}
                  showMark={showMarks}
                  showTimecodeOverlay={showTimecodeOverlay}
                  showSafeGuides={showSafeGuides}
                  showOnionSkin={showOnionSkin}
                  isFullscreen={isFullscreen}
                  interactiveFraming={true}
                  isClipSelected={viewerFrame.id === selectedFrame.id}
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
                  onCommitAnimation={(animation, label) =>
                    editProject(
                      (current) => setBeatAnimation(current, viewerFrame.id, animation),
                      label,
                    )
                  }
                  setFocalPoint={setFocalPoint}
                />
              </div>
              {playback && (
                <div className="preview-progress">
                  <span style={{ width: `${clipProgress * 100}%` }} />
                </div>
              )}
              <span className="preview-resolution">
                16:9 <i>·</i> {formatTimecode(playheadFrame)}
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
              </div>
              <div className="transport-counter">
                SHOT <strong>{String(currentIndex + 1).padStart(4, "0")}</strong>
                <i>/</i>
                {clips.length.toLocaleString()}
              </div>
            </div>
          </main>

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
                (current) => setEffectField(current, selectedFrame.id, path, value),
                `${path.replace("cinematic.", "")} changed`,
              )
            }
            onResetEffect={(path) =>
              editProject(
                (current) => resetEffectField(current, selectedFrame.id, path),
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
            onConvertAllToKeyframes={() =>
              editProject(
                (current) => convertProjectCameraMovesToKeyframes(current, voiceDurations),
                "Converted all camera moves to keyframes",
              )
            }
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
            onDragStart={beginDragEdit}
            onDragEnd={endDragEdit}
            onTrimPreview={(frameId, durationFrames) =>
              previewProjectEdit((current) => trimKeyframe(current, frameId, durationFrames))
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
            onMergeCaptions={handleMergeCaptions}
            onDeleteCaptions={() => {
              void handleDeleteSelectedCaptions();
            }}
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
        <span>SPACE PLAY · N SNAP ({snapEnabled ? "ON" : "OFF"}) · M MARKER · ⌘C/⌘V COPY/PASTE · S SPLIT · ⌘Z UNDO</span>
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
            browser.target === "picture" ||
            browser.target === "scenePicture" ||
            browser.target === "depthMap" ||
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
          captions={captionsExport}
          marks={marksExport}
          setCaptions={setCaptionsExport}
          setMarks={setMarksExport}
          onBundle={() => void exportBundle()}
          onPatch={exportPatch}
          onSrt={exportSrt}
          onVtt={exportVtt}
          onMp4={() =>
            setMp4Message(
              "Exact MP4 rendering uses tools/export-animatic.mjs with local Playwright Chromium and ffmpeg. This browser-only surface does not substitute a simplified renderer.",
            )
          }
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
