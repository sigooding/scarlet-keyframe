import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AssetBrowser, type BrowserAsset } from "./components/AssetBrowser";
import { CinematicPreview } from "./components/CinematicPreview";
import { CropModal, type CropState } from "./components/CropModal";
import { ExportModal, type ExportTab } from "./components/ExportModal";
import { Inspector } from "./components/Inspector";
import { MissingMediaModal } from "./components/MissingMediaModal";
import { SnapshotModal } from "./components/SnapshotModal";
import { Timeline } from "./components/Timeline";
import { Topbar } from "./components/Topbar";
import { Tracks } from "./components/Tracks";
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
  type ProjectAsset,
  type ProjectState,
} from "./core/model";
import {
  cloneStory as cloneProjectStory,
  copyEffectBlock,
  deleteKeyframe,
  duplicateKeyframe,
  insertKeyframeAfter,
  moveSfxCue,
  pasteEffectBlock,
  reorderKeyframe,
  resetEffectField,
  setBeatAnimation,
  setBeatField,
  setEffectField,
  setPicture,
  setSceneField,
  splitKeyframeAt,
  trimKeyframe,
  type EffectBlock,
} from "./core/edits";
import { buildPortableBundle } from "./core/exportBundle";
import { downloadText, measureAudioDuration, slug } from "./core/helpers";
import { createUploadAsset, dataUrlToBlob, evaluateMissingMedia, folderFilePath, normalizeMediaPath, referencedPath } from "./core/media";
import { UndoHistory } from "./core/history";
import { loadActiveProject, saveActiveProject } from "./core/storage";
import { clipFrames, FPS, formatTimecode, makeSrt } from "./core/timing";
import { writeStudioPatch, type StudioPatchResult } from "./core/patch";
import { PreviewAudioController } from "./core/previewAudio";
import { buildTimelineClips, clipAtFrame, evaluate } from "./sequence/animate";
import { audio } from "../vendor/scarlet-reel/audio";
import bundledFilm from "./data/nobodys-witness-film.json";
import bundledEdits from "./data/studio-edits.json";

type BrowseTarget = "picture" | "scenePicture" | "depthMap" | "foregroundImage" | "voice" | "sfx" | "music";
type BrowserState = { kind: "image" | "audio"; target: BrowseTarget };
type UploadIntent = { kind: "image" | "audio"; target: "picture" | "voice" | "sfx" | "music"; frameId: string };

const PLAYHEAD_SESSION_KEY = "frame24-playhead";

declare global {
  interface Window {
    __frame24?: {
      frameIds: string[];
      totalFrames: number;
      getPlayhead: () => number;
      setPlayhead: (frameNumber: number) => void;
      setFrame: (frameId: string) => void;
      getDuration: (frameId: string) => number;
      getFrame: (frameId: string) => AnyRecord | undefined;
      syncAnimations: (seconds: number) => void;
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
  const [project, setProject] = useState<ProjectState | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [publicPaths, setPublicPaths] = useState<Set<string>>(new Set());
  const [folderFiles, setFolderFiles] = useState<Map<string, File>>(new Map());
  const [folderLabel, setFolderLabel] = useState("");
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [voiceDurations, setVoiceDurations] = useState<Map<string, number>>(new Map());

  const [playheadFrame, setPlayheadFrame] = useState(0);
  const playheadRef = useRef(0);
  playheadRef.current = playheadFrame;

  const [selectedFrameId, setSelectedFrameId] = useState("");
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [copiedEffects, setCopiedEffects] = useState<EffectBlock | null>(null);
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
  const [showMarks, setShowMarks] = useState(true);
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
  const lastPlayedClipRef = useRef("");
  const lastPlayedSceneRef = useRef("");
  const animationClockRef = useRef(new WeakMap<Animation, number>());

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
        const paths = new Set(mediaIndex.map(normalizeMediaPath));
        if (!alive) return;
        setPublicPaths(paths);

        let initialProject: ProjectState;
        let statusLabel: string;
        if (saved?.story?.scenes?.length) {
          initialProject = {
            ...saved,
            importedMissing: saved.importedMissing || [],
            assets: saved.assets || [],
            snapshots: saved.snapshots || [],
          };
          initialProject.missing = evaluateMissingMedia(initialProject, new Map(), paths);
          statusLabel = "AUTOSAVED PROJECT";
        } else {
          const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json");
          const contextual = { ...imported, story: applyStudioMusicSync(imported.story, sourceEdits) };
          initialProject = createProjectState(contextual, [], sourceEdits);
          initialProject.missing = evaluateMissingMedia(initialProject, new Map(), paths);
          statusLabel = "FILM READY";
        }

        projectRef.current = initialProject;
        setProject(initialProject);
        const builtFrames = buildKeyframes(initialProject.story);
        const { clips: builtClips, totalFrames: builtTotal } = buildTimelineClips(builtFrames);
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

  // Clamp playhead if totalFrames shrinks after trim/delete
  useEffect(() => {
    if (totalFrames > 0 && playheadFrame >= totalFrames) {
      setPlayheadFrame(totalFrames - 1);
    }
  }, [totalFrames, playheadFrame]);

  const activeClip = useMemo(
    () => clipAtFrame(clips, playheadFrame) || clips[0],
    [clips, playheadFrame],
  );
  const viewerFrame = activeClip?.keyframe;
  const viewerLocalFrame = activeClip
    ? Math.max(0, Math.min(activeClip.durationFrames - 1, playheadFrame - activeClip.startFrame))
    : 0;

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.keyframe.id === selectedFrameId) || activeClip,
    [clips, selectedFrameId, activeClip],
  );
  const selectedFrame = selectedClip?.keyframe;
  const inspectorLocalFrame = selectedClip
    ? Math.max(0, Math.min(selectedClip.durationFrames - 1, playheadFrame - selectedClip.startFrame))
    : 0;
  const currentIndex = activeClip?.index ?? 0;

  const viewerAssetId = viewerFrame?.picture?.startsWith("asset:") ? viewerFrame.picture.slice(6) : "";
  const viewerPictureAsset = project?.assets.find((asset) => asset.id === viewerAssetId);
  const viewerImagePosition = viewerPictureAsset?.crop
    ? `${viewerPictureAsset.crop.x}% ${viewerPictureAsset.crop.y}%`
    : undefined;

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
      if (!value) return undefined;
      if (/^(?:data:|blob:|https?:\/\/|gradient:|emoji:)/i.test(value)) return value;
      const assetId = value.match(/(?:^|:)asset:([^/?#]+)/)?.[1];
      if (assetId) return objectUrls.get(`asset:${assetId}`);
      const path = referencedPath(value);
      if (!path) return undefined;
      const linked = objectUrls.get(path);
      if (linked) return linked;
      if (publicPaths.has(path)) return `/${path}`;
      return undefined;
    },
    [objectUrls, publicPaths],
  );

  // Measure durations of any resolved voice takes so voice bars & clipFrames reflect real audio lengths
  useEffect(() => {
    let cancelled = false;
    const pending: Array<{ ref: string; src: string }> = [];
    for (const frame of frames) {
      const ref = frame.beat.audioUrl;
      if (!ref || voiceDurations.has(ref)) continue;
      const src = resolveMedia(ref);
      if (src) pending.push({ ref, src });
    }
    if (!pending.length) return;
    void (async () => {
      const measured = new Map<string, number>();
      for (const item of pending.slice(0, 80)) {
        if (cancelled) return;
        const sec = await measureAudioDuration(item.src, voiceDurationCache.current);
        if (sec !== undefined && sec > 0) measured.set(item.ref, sec);
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

  // Ctrl/Cmd + wheel on the preview stage zooms the player viewer in/out
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
    if (projectRef.current) history.beginDrag(projectRef.current);
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
  }, []);

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
  }, []);

  const scrubToFrame = useCallback(
    (targetFrame: number) => {
      if (playback) {
        setPlayback(false);
        audioController.stopAll();
      }
      const clamped = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame)));
      setPlayheadFrame(clamped);
      const hit = clipAtFrame(clips, clamped);
      if (hit) {
        setSelectedFrameId(hit.keyframe.id);
        setSelectedFrameIds((prev) => (prev.length > 1 && prev.includes(hit.keyframe.id) ? prev : [hit.keyframe.id]));
      }
    },
    [clips, playback, totalFrames],
  );

  const stepFrames = useCallback(
    (delta: number) => {
      scrubToFrame(playheadRef.current + delta);
    },
    [scrubToFrame],
  );

  const selectClip = useCallback(
    (frameId: string, extend: boolean, targetFrame?: number) => {
      setSelectedFrameId(frameId);
      setSelectedFrameIds((current) => {
        if (!extend) return [frameId];
        return current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId];
      });
      if (targetFrame !== undefined) {
        if (playback) {
          setPlayback(false);
          audioController.stopAll();
        }
        setPlayheadFrame(Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(targetFrame))));
      }
    },
    [playback, totalFrames],
  );

  const selectRelativeClip = useCallback(
    (delta: number) => {
      if (!clips.length) return;
      const baseIndex = selectedClip?.index ?? 0;
      const next = clips[Math.max(0, Math.min(clips.length - 1, baseIndex + delta))];
      if (next) selectClip(next.keyframe.id, false, next.startFrame);
    },
    [clips, selectedClip, selectClip],
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
        editProject((current) => setBeatField(current, selectedFrame.id, "audioUrl", asset.ref), "Voice take changed");
      else if (target === "sfx")
        editProject((current) => setBeatField(current, selectedFrame.id, "sfxUrl", asset.ref), "Sound effect changed");
      else if (target === "music")
        editProject((current) => {
          let next = setSceneField(current, selectedFrame.sceneId, "musicUrl", asset.ref);
          next = setSceneField(next, selectedFrame.sceneId, "musicMode", "track");
          return next;
        }, "Music cue changed");
      setBrowser(null);
    },
    [browser, editProject, project, selectedFrame, setFramePicture],
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
    if (intent.target === "picture") next = setPicture(next, intent.frameId, `asset:${asset.id}`);
    else if (intent.target === "voice") next = setBeatField(next, intent.frameId, "audioUrl", `asset:${asset.id}`);
    else if (intent.target === "sfx") next = setBeatField(next, intent.frameId, "sfxUrl", `asset:${asset.id}`);
    else if (intent.target === "music") {
      const targetFrame = buildKeyframes(next.story).find((frame) => frame.id === intent.frameId);
      if (targetFrame) {
        next = setSceneField(next, targetFrame.sceneId, "musicUrl", `asset:${asset.id}`);
        next = setSceneField(next, targetFrame.sceneId, "musicMode", "track");
      }
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
    const imported = parseImportPayload(raw, file.name);
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
    const next = createProjectState({ ...imported, story }, assets, sourceEdits);
    next.missing = evaluateMissingMedia(next, folderFiles, publicPaths);
    history.clear();
    setHistoryVersion((value) => value + 1);
    projectRef.current = next;
    setProject(next);
    const ordered = buildKeyframes(next.story);
    const built = buildTimelineClips(ordered).clips;
    const start = built.find((clip) => clip.keyframe.mark === "77") || built[0];
    setPlayheadFrame(start?.startFrame ?? 0);
    setSelectedFrameId(start?.keyframe.id || "");
    setSelectedFrameIds(start ? [start.keyframe.id] : []);
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
    return [...output.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  }, [project, resolveMedia, folderFiles]);

  const audioBrowserItems = useMemo<BrowserAsset[]>(() => {
    if (!project) return [];
    const output = new Map<string, BrowserAsset>();
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const refs = new Set(
      collectMediaReferences(project.story).filter(
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
    return [...output.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  }, [project, resolveMedia, folderFiles]);

  const togglePlayback = useCallback(() => {
    if (!project || !clips.length) return;
    if (playback) {
      setPlayback(false);
      audioController.stopAll();
      lastPlayedClipRef.current = "";
      lastPlayedSceneRef.current = "";
      return;
    }
    audioController.unlock();
    setDirection(1);
    setPlaySpeed(1);
    lastPlayedClipRef.current = "";
    lastPlayedSceneRef.current = "";
    const startAt = playheadRef.current >= totalFrames - 1 ? 0 : playheadRef.current;
    if (startAt !== playheadRef.current) setPlayheadFrame(startAt);
    const startClip = clipAtFrame(clips, startAt) || clips[0];
    if (soundOn && startClip) {
      lastPlayedSceneRef.current = startClip.keyframe.sceneId;
      void audioController.startFrom(project.story, startClip.keyframe.sceneId, resolveMedia);
    }
    setPlayback(true);
  }, [playback, project, clips, totalFrames, soundOn, resolveMedia]);

  // Advance playhead at 24 fps while playing
  useEffect(() => {
    if (!playback || !totalFrames) return;
    let rafId = 0;
    const anchorTime = performance.now();
    const anchorFrame = playheadRef.current;

    const tick = (now: number) => {
      const elapsedSeconds = ((now - anchorTime) / 1000) * playSpeed;
      const deltaFrames = Math.floor(elapsedSeconds * FPS) * direction;
      const nextFrame = anchorFrame + deltaFrames;

      if (direction > 0 && nextFrame >= totalFrames - 1) {
        const end = Math.max(0, totalFrames - 1);
        setPlayheadFrame(end);
        const endClip = clipAtFrame(clips, end);
        if (endClip) setSelectedFrameId(endClip.keyframe.id);
        setPlayback(false);
        audioController.stopAll();
        lastPlayedClipRef.current = "";
        lastPlayedSceneRef.current = "";
        return;
      }
      if (direction < 0 && nextFrame <= 0) {
        setPlayheadFrame(0);
        if (clips[0]) setSelectedFrameId(clips[0].keyframe.id);
        setPlayback(false);
        audioController.stopAll();
        lastPlayedClipRef.current = "";
        lastPlayedSceneRef.current = "";
        return;
      }
      if (nextFrame !== playheadRef.current) {
        setPlayheadFrame(nextFrame);
        const hit = clipAtFrame(clips, nextFrame);
        if (hit) {
          setSelectedFrameId(hit.keyframe.id);
          setSelectedFrameIds([hit.keyframe.id]);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playback, direction, playSpeed, totalFrames, clips]);

  // Trigger scene music/ambience, beat SFX, and voice takes as playback crosses clips
  useEffect(() => {
    if (!playback || !activeClip || !project) return;
    if (lastPlayedClipRef.current === activeClip.keyframe.id) return;
    lastPlayedClipRef.current = activeClip.keyframe.id;
    const frame = activeClip.keyframe;

    if (lastPlayedSceneRef.current !== frame.sceneId) {
      lastPlayedSceneRef.current = frame.sceneId;
      if (soundOn) void audioController.enterScene(frame.scene, resolveMedia);
    }
    if (!soundOn) return;
    if (frame.beat.sfxUrl) {
      audioController.playSfx(frame.beat.sfxUrl, frame.beat.sfxVolume, resolveMedia);
    }
    if (frame.beat.audioUrl) {
      const midClipSec = Math.max(0, (playheadRef.current - activeClip.startFrame) / FPS);
      audioController.playVoice(
        frame.beat.audioUrl,
        resolveMedia,
        Number(frame.beat.audioOffsetSeconds || 0) + midClipSec,
      );
    }
  }, [playback, activeClip, project, resolveMedia, soundOn]);

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
  }, [applyProject, selectedClip, voiceDurations]);

  const deleteCurrent = useCallback(() => {
    const current = projectRef.current;
    if (!selectedClip || !current) return;
    const next = deleteKeyframe(current, selectedClip.keyframe.id);
    applyProject(next, "Clip deleted");
    const nextFrames = buildKeyframes(next.story);
    const { clips: nextClips, totalFrames: nextTotal } = buildTimelineClips(nextFrames, voiceDurations);
    const nextPlayhead = Math.max(0, Math.min(Math.max(0, nextTotal - 1), playheadRef.current));
    setPlayheadFrame(nextPlayhead);
    const nearest = clipAtFrame(nextClips, nextPlayhead);
    setSelectedFrameId(nearest?.keyframe.id || "");
    setSelectedFrameIds(nearest ? [nearest.keyframe.id] : []);
  }, [applyProject, selectedClip, voiceDurations]);

  useEffect(() => {
    if (!viewerFrame) return;
    window.__frame24 = {
      frameIds: frames.map((frame) => frame.id),
      totalFrames,
      getPlayhead: () => playheadRef.current,
      setPlayhead: (frameNumber) => scrubToFrame(frameNumber),
      setFrame: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        if (hit) selectClip(frameId, false, hit.startFrame);
      },
      getDuration: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        return hit ? hit.durationFrames / FPS : 0;
      },
      getFrame: (frameId) => {
        const hit = clips.find((clip) => clip.keyframe.id === frameId);
        if (!hit) return undefined;
        const frame = hit.keyframe;
        return {
          id: frame.id,
          sceneId: frame.sceneId,
          mark: frame.mark,
          number: frame.number,
          startFrame: hit.startFrame,
          durationFrames: hit.durationFrames,
          duration: hit.durationFrames / FPS,
          text: frame.text,
          speaker: frame.speaker,
          picture: frame.picture,
          animation: frame.beat.animation,
          poseAtStart: evaluate(frame, 0),
          audioUrl: frame.beat.audioUrl,
          sfxUrl: frame.beat.sfxUrl,
          musicUrl: frame.scene.musicUrl || frame.scene.sceneAudioUrl,
          ambientAudio: frame.scene.ambientAudio,
        };
      },
      syncAnimations: (seconds) => {
        const now = seconds * 1000;
        for (const animation of document.getAnimations()) {
          if (!animationClockRef.current.has(animation)) animationClockRef.current.set(animation, now);
          try {
            animation.pause();
            animation.currentTime = now - (animationClockRef.current.get(animation) || 0);
          } catch {
            /* finished animation */
          }
        }
      },
    };
    return () => {
      delete window.__frame24;
    };
  }, [clips, frames, selectClip, scrubToFrame, totalFrames, viewerFrame]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
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
      if (typing) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft") {
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
      } else if (!mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        splitAtPlayhead();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteCurrent();
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPlayback(false);
        audioController.stopAll();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setDirection(-1);
        setPlayback(true);
      } else if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setDirection(1);
        setPlaySpeed((speed) => (speed >= 4 ? 1 : speed * 2));
        setPlayback(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteCurrent, redo, selectRelativeClip, splitAtPlayhead, stepFrames, togglePlayback, undo]);

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
      { ...current, story: cloneProjectStory(snapshot.story), updatedAt: Date.now() },
      `Restored ${snapshot.name}`,
    );
    const restoredFrames = buildKeyframes(snapshot.story);
    const restoredClips = buildTimelineClips(restoredFrames, voiceDurations).clips;
    if (restoredClips[0]) selectClip(restoredClips[0].keyframe.id, false, restoredClips[0].startFrame);
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
    const text = makeSrt(
      selectedRange,
      selectedRange.map((frame) => clipFrames(frame, frame.beat.audioUrl ? voiceDurations.get(frame.beat.audioUrl) : undefined) / FPS),
    );
    downloadText(text, `${slug(project?.title || "animatic")}.srt`, "text/plain");
    setExportMessage(`SRT written for ${selectedRange.length} clips.`);
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

  const viewerImageSrc = viewerFrame ? resolveMedia(viewerFrame.picture) : undefined;
  const selectedImageSrc = selectedFrame ? resolveMedia(selectedFrame.picture) : undefined;
  const diagnostics = project ? runningOrderDiagnostics(project.story) : [];
  const totalSeconds = totalFrames / FPS;
  const clipProgress = activeClip ? (viewerLocalFrame + 1) / Math.max(1, activeClip.durationFrames) : 0;

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
      className={`frame24-shell ${dragOver ? "is-drag-over" : ""}`}
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
      />

      <div className="editor-body">
        <div className="upper-workspace">
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
                <button
                  className={`caption-toggle ${showCaptions ? "is-active" : ""}`}
                  onClick={() => setShowCaptions((value) => !value)}
                >
                  CC
                </button>
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
                  key={viewerFrame.id}
                  frame={viewerFrame}
                  localFrame={viewerLocalFrame}
                  imageSrc={viewerImageSrc}
                  imagePosition={viewerImagePosition}
                  resolveMedia={resolveMedia}
                  playing={playback}
                  soundOn={soundOn}
                  showCaption={showCaptions}
                  showMark={showMarks}
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
                <button onClick={() => { setDirection(-1); setPlayback(true); }}>J</button>
                <button
                  onClick={() => {
                    setPlayback(false);
                    audioController.stopAll();
                  }}
                >
                  K
                </button>
                <button
                  onClick={() => {
                    setDirection(1);
                    setPlaySpeed((value) => (value >= 4 ? 1 : value * 2));
                    setPlayback(true);
                  }}
                >
                  L
                </button>
                <span>{playSpeed}×</span>
                <button
                  className={`sound-button ${soundOn ? "" : "is-muted"}`}
                  onClick={() => {
                    setSoundOn((value) => !value);
                    if (soundOn) audioController.stopAll();
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
            onPlayVoice={() => {
              if (!selectedFrame.beat.audioUrl) return;
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
            onDelete={deleteCurrent}
            onMove={(delta) =>
              editProject(
                (current) => reorderKeyframe(current, selectedFrame.id, delta),
                delta < 0 ? "Clip moved earlier" : "Clip moved later",
              )
            }
            onPreviewSfx={() =>
              audioController.playSfx(selectedFrame.beat.sfxUrl, selectedFrame.beat.sfxVolume, resolveMedia)
            }
          />
        </div>

        <div className="lower-timeline-dock">
          <Timeline
            clips={clips}
            totalFrames={totalFrames}
            playheadFrame={playheadFrame}
            selectedFrameId={selectedFrame.id}
            selectedFrameIds={selectedFrameIds}
            canSplit={canSplit}
            resolveMedia={resolveMedia}
            onScrub={scrubToFrame}
            onSelectClip={selectClip}
            onDragStart={beginDragEdit}
            onDragEnd={endDragEdit}
            onTrimPreview={(frameId, durationFrames) =>
              previewProjectEdit((current) => trimKeyframe(current, frameId, durationFrames))
            }
            onAnimationPreview={(frameId, animation) =>
              previewProjectEdit((current) => setBeatAnimation(current, frameId, animation))
            }
            onSplit={splitAtPlayhead}
            onDelete={deleteCurrent}
            onDropFile={handleTimelineDrop}
          />
          <Tracks
            frames={frames}
            playheadFrame={playheadFrame}
            selectedFrameId={selectedFrame.id}
            onSelect={(id) => {
              const hit = clips.find((clip) => clip.keyframe.id === id);
              selectClip(id, false, hit?.startFrame);
            }}
            onMoveCue={moveCue}
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
        <span>SPACE PLAY · ← / → 1F · ⇧← / ⇧→ 1S · S SPLIT · ⌘Z UNDO</span>
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
                  : "Choose a music cue"
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
