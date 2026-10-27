import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AssetBrowser, type BrowserAsset } from "./components/AssetBrowser";
import { CinematicPreview } from "./components/CinematicPreview";
import { Inspector } from "./components/Inspector";
import { CropModal, ExportModal, MissingMediaModal, SnapshotModal } from "./components/Modals";
import { Timeline } from "./components/Timeline";
import { Topbar } from "./components/Topbar";
import { Tracks } from "./components/Tracks";
import { applyStudioMusicSync, buildKeyframes, collectImageReferences, collectMediaReferences, createProjectState, parseImportPayload, runningOrderDiagnostics, type AnyRecord, type ProjectAsset, type ProjectState } from "./core/model";
import {
  cloneStory as cloneProjectStory,
  copyEffectBlock,
  deleteKeyframe,
  duplicateKeyframe,
  insertKeyframeAfter,
  moveAnimationKey,
  moveSfxCue,
  pasteEffectBlock,
  reorderKeyframe,
  resetEffectField,
  setAnimationEasing,
  setAnimationValue,
  setBeatField,
  setClipDuration,
  setEffectField,
  setPicture,
  setSceneField,
  splitClip,
  toggleAnimationKey,
  type EffectBlock,
} from "./core/edits";
import { buildPortableBundle } from "./core/exportBundle";
import { downloadText, slug } from "./core/files";
import { createUploadAsset, dataUrlToBlob, evaluateMissingMedia, folderFilePath, measureAudioDuration, normalizeMediaPath, referencedPath } from "./core/media";
import { GestureHistory } from "./core/gesture";
import { UndoHistory } from "./core/history";
import { loadActiveProject, saveActiveProject } from "./core/storage";
import { clipFrames, FPS, makeSrt, timecode } from "./core/timing";
import { writeStudioPatch } from "./core/patch";
import { PreviewAudioController } from "./core/previewAudio";
import type { StudioPatchResult } from "./core/patch";
import { evaluate, type AnimationProperty, type Easing } from "./sequence/animate";
import { buildSequence, clipAtFrame, clipById, localFrameOf } from "./sequence/sequence";
import { audio } from "../vendor/scarlet-reel/audio";
import bundledFilm from "./data/nobodys-witness-film.json";
import bundledEdits from "./data/studio-edits.json";

type BrowseTarget = "picture" | "scenePicture" | "depthMap" | "foregroundImage" | "voice" | "sfx" | "music";
type BrowserState = { kind: "image" | "audio"; target: BrowseTarget };
type UploadIntent = { kind: "image" | "audio"; target: "picture" | "voice" | "sfx" | "music"; frameId: string };
type CropState = { assetId: string; frameId: string; x: number; y: number };
type ExportTab = "bundle" | "patch" | "mp4";

declare global {
  interface Window {
    __frame24?: {
      frameIds: string[];
      setFrame: (frameId: string) => void;
      getDuration: (frameId: string) => number;
      getFrame: (frameId: string) => AnyRecord | undefined;
      syncAnimations: (seconds: number) => void;
      getPlayhead: () => number;
      getTotalFrames: () => number;
      clipAt: (absoluteFrame: number) => AnyRecord | undefined;
    };
  }
}

const history = new UndoHistory<ProjectState>(100);
const gestures = new GestureHistory<ProjectState>(history);
const audioController = new PreviewAudioController();

export default function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const projectRef = useRef<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [publicPaths, setPublicPaths] = useState<Set<string>>(new Set());
  const [folderFiles, setFolderFiles] = useState<Map<string, File>>(new Map());
  const [folderLabel, setFolderLabel] = useState("");
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  // Time is whole frames at 24 fps. The playhead is the single position on the sequence.
  const [playhead, setPlayhead] = useState(0);
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
  const lastSceneRef = useRef("");
  const lastVoiceClipRef = useRef("");
  const voiceDurationCache = useRef(new Map<string, number>());
  const animationClockRef = useRef(new WeakMap<Animation, number>());
  const playheadRef = useRef(0);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    window.__sw_audio = audio;
    return () => { window.__sw_audio = undefined; };
  }, []);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        // The film is built into the app (npm run import:film), so it opens with no server and from any folder; the
        // saved project and the media index are optional, so an unreachable one (a page opened from disk) is empty.
        const [saved, mediaIndex] = await Promise.all([
          loadActiveProject().catch(() => undefined),
          window.location.protocol === "file:"
            ? Promise.resolve([] as string[])
            : fetch("examples/media-index.json")
              .then((response) => (response.ok ? response.json() as Promise<string[]> : []))
              .catch(() => [] as string[]),
        ]);
        const sourceEdits = bundledEdits as AnyRecord;
        const paths = new Set(mediaIndex.map(normalizeMediaPath));
        if (!alive) return;
        setPublicPaths(paths);
        if (saved?.story?.scenes?.length) {
          const repaired = {
            ...saved,
            importedMissing: saved.importedMissing || [],
            assets: saved.assets || [],
            snapshots: saved.snapshots || [],
          };
          repaired.missing = evaluateMissingMedia(repaired, new Map(), paths);
          setProject(repaired);
          setPlayhead(startOfScene(repaired, "77"));
          setSaveStatus("AUTOSAVED PROJECT");
        } else {
          const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json");
          const contextual = { ...imported, story: applyStudioMusicSync(imported.story, sourceEdits) };
          const next = createProjectState(contextual, [], sourceEdits);
          next.missing = evaluateMissingMedia(next, new Map(), paths);
          setProject(next);
          setPlayhead(startOfScene(next, "77"));
          setSaveStatus("FILM READY");
        }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Unable to open this project.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void boot();
    return () => { alive = false; };
  }, []);

  const frames = useMemo(() => project ? buildKeyframes(project.story) : [], [project?.story]);
  const sequence = useMemo(() => buildSequence(frames), [frames]);
  const totalFrames = sequence.totalFrames;
  const currentClip = useMemo(() => clipAtFrame(sequence.clips, playhead), [sequence, playhead]);
  const selectedFrame = currentClip?.frame ?? frames[0];
  const localFrame = currentClip ? localFrameOf(currentClip, playhead) : 0;
  const currentIndex = currentClip?.index ?? 0;
  const currentAssetId = selectedFrame?.picture?.startsWith("asset:") ? selectedFrame.picture.slice(6) : "";
  const currentPictureAsset = project?.assets.find((asset) => asset.id === currentAssetId);
  const currentImagePosition = currentPictureAsset?.crop ? `${currentPictureAsset.crop.x}% ${currentPictureAsset.crop.y}%` : undefined;

  useEffect(() => {
    const next = new Map<string, string>();
    project?.assets.forEach((asset) => {
      if (asset.blob) next.set(`asset:${asset.id}`, URL.createObjectURL(asset.blob));
      else if (asset.dataUrl) next.set(`asset:${asset.id}`, asset.dataUrl);
    });
    folderFiles.forEach((file, path) => next.set(path, URL.createObjectURL(file)));
    setObjectUrls(next);
    return () => {
      next.forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
    };
  }, [project?.assets, folderFiles]);

  const resolveMedia = useCallback((value: string | undefined): string | undefined => {
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
  }, [objectUrls, publicPaths]);

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
      void saveActiveProject(project).then(() => setSaveStatus("SAVED TO THIS BROWSER")).catch(() => setSaveStatus("AUTOSAVE FAILED"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project]);

  // The playhead always stays on a real frame of the sequence.
  useEffect(() => {
    if (totalFrames <= 0) return;
    if (playhead > totalFrames - 1) setPlayhead(totalFrames - 1);
    else if (playhead < 0) setPlayhead(0);
  }, [totalFrames, playhead]);

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

  const editProject = useCallback((update: (current: ProjectState) => ProjectState, label: string) => {
    const current = projectRef.current;
    if (!current) return;
    applyProject(update(current), label);
  }, [applyProject]);

  /* A drag is one undo step: the state before the gesture is recorded once, when the gesture ends. */
  const beginGesture = useCallback(() => {
    gestures.begin(projectRef.current);
  }, []);

  const updateGesture = useCallback((update: (current: ProjectState) => ProjectState) => {
    const current = projectRef.current;
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    projectRef.current = next;
    setProject(next);
    setSaveStatus("UNSAVED CHANGES");
  }, []);

  const endGesture = useCallback((label: string) => {
    if (!gestures.commit(projectRef.current)) return;
    setHistoryVersion((value) => value + 1);
    setEditLabel(label);
  }, []);

  const undo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const previous = history.undo(current);
    if (!previous) return;
    projectRef.current = previous;
    setProject(previous);
    setEditLabel("Undo");
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
    setHistoryVersion((value) => value + 1);
  }, []);

  const seek = useCallback((absoluteFrame: number, pause = true) => {
    const clamped = Math.max(0, Math.min(Math.max(0, totalFrames - 1), Math.round(absoluteFrame)));
    setPlayhead(clamped);
    if (pause && playback) {
      setPlayback(false);
      audioController.stopAll();
      lastVoiceClipRef.current = "";
    }
  }, [playback, totalFrames]);

  const selectRelativeClip = useCallback((delta: number) => {
    if (!sequence.clips.length) return;
    const index = Math.max(0, Math.min(sequence.clips.length - 1, currentIndex + delta));
    seek(sequence.clips[index].start);
  }, [currentIndex, seek, sequence.clips]);

  const setFocalPoint = useCallback((value: string) => {
    if (!selectedFrame) return;
    editProject((current) => setEffectField(current, selectedFrame.id, "cinematic.focalPoint", value), "Focal point changed");
  }, [editProject, selectedFrame]);

  const setFramePicture = useCallback((picture?: string) => {
    if (!selectedFrame) return;
    editProject((current) => setPicture(current, selectedFrame.id, picture), picture ? "Picture changed" : "Picture removed");
  }, [editProject, selectedFrame]);

  const openBrowser = useCallback((kind: "image" | "audio", target: BrowseTarget) => setBrowser({ kind, target }), []);

  const chooseBrowserAsset = useCallback((asset: BrowserAsset) => {
    const target = browser?.target;
    if (!project || !selectedFrame || !target) return;
    if (target === "picture") setFramePicture(asset.ref);
    else if (target === "scenePicture") editProject((current) => setSceneField(current, selectedFrame.sceneId, "background", asset.ref), "Scene plate changed");
    else if (target === "depthMap" || target === "foregroundImage") editProject((current) => setEffectField(current, selectedFrame.id, `cinematic.${target}`, asset.ref), `${target} changed`);
    else if (target === "voice") editProject((current) => setBeatField(current, selectedFrame.id, "audioUrl", asset.ref), "Voice take changed");
    else if (target === "sfx") editProject((current) => setBeatField(current, selectedFrame.id, "sfxUrl", asset.ref), "Sound effect changed");
    else if (target === "music") editProject((current) => {
      let next = setSceneField(current, selectedFrame.sceneId, "musicUrl", asset.ref);
      next = setSceneField(next, selectedFrame.sceneId, "musicMode", "track");
      return next;
    }, "Music cue changed");
    setBrowser(null);
  }, [browser, editProject, project, selectedFrame, setFramePicture]);

  const imageInputRefTarget = useCallback((kind: "image" | "audio", target: UploadIntent["target"]) => {
    if (!selectedFrame) return;
    setUploadIntent({ kind, target, frameId: selectedFrame.id });
    window.setTimeout(() => (kind === "image" ? imageInputRef.current : audioInputRef.current)?.click(), 0);
  }, [selectedFrame]);

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
    const inserted = clipById(buildSequence(buildKeyframes(next.story)).clips, intent.frameId);
    if (inserted) setPlayhead(inserted.start);
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
    const first = (picked[0] as File & { webkitRelativePath?: string } | undefined)?.webkitRelativePath;
    setFolderLabel(first?.split("/")[0] || "public folder");
    setSaveStatus("MEDIA FOLDER LINKED");
    event.target.value = "";
  };

  async function handleImportFile(file: File): Promise<void> {
    const raw = await file.text();
    const imported = parseImportPayload(raw, file.name);
    const sourceEdits = projectRef.current?.sourceEdits;
    const story = imported.story.id === "nobodys-witness-film" && sourceEdits
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
    setPlayhead(startOfScene(next, "77"));
    setPlayback(false);
    audioController.stopAll();
    setBrowser(null);
    setExportOpen(false);
    setEditLabel(`Imported ${file.name}`);
    setSaveStatus("IMPORT COMPLETE");
  }

  async function handleImportInput(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file) {
      try { await handleImportFile(file); }
      catch (error) { setLoadError(error instanceof Error ? error.message : "Import failed."); }
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
      if (!output.has(ref)) output.set(ref, { id: ref, ref, name: file.name, folder: path.split("/").slice(0, -1).join("/"), src: resolveMedia(ref), size: file.size, source: "Linked public folder" });
    }
    return [...output.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  }, [project, resolveMedia, folderFiles]);

  const audioBrowserItems = useMemo<BrowserAsset[]>(() => {
    if (!project) return [];
    const output = new Map<string, BrowserAsset>();
    const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
    const refs = new Set(collectMediaReferences(project.story).filter((value) => /\.(?:mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i.test(value) || value.startsWith("asset:")));
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
      if (!output.has(ref)) output.set(ref, { id: ref, ref, name: file.name, folder: path.split("/").slice(0, -1).join("/"), src: resolveMedia(ref), size: file.size, source: "Linked public folder" });
    }
    return [...output.values()].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  }, [project, resolveMedia, folderFiles]);

  /* ---------------------------------------------------------------- *
   * Playback: the playhead advances at 24 fps; voices and sounds play  *
   * exactly as they did per keyframe before.                           *
   * ---------------------------------------------------------------- */

  const togglePlayback = useCallback(() => {
    if (playback) {
      setPlayback(false);
      audioController.stopAll();
      lastVoiceClipRef.current = "";
      return;
    }
    if (!project || !currentClip) return;
    audioController.unlock();
    setDirection(1);
    setPlaySpeed(1);
    lastSceneRef.current = "";
    lastVoiceClipRef.current = "";
    void audioController.startFrom(project.story, currentClip.frame.sceneId, resolveMedia);
    setPlayback(true);
  }, [currentClip, playback, project, resolveMedia]);

  useEffect(() => {
    if (!playback || totalFrames <= 0) return;
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let position = playheadRef.current;
    const step = (now: number) => {
      const delta = Math.min(250, Math.max(0, now - last));
      last = now;
      accumulator += delta * playSpeed;
      const advance = Math.floor(accumulator / (1000 / FPS));
      if (advance > 0) {
        accumulator -= advance * (1000 / FPS);
        position += advance * direction;
        if (position < 0) {
          setPlayhead(0);
          setPlayback(false);
          audioController.stopAll();
          return;
        }
        if (position > totalFrames - 1) {
          setPlayhead(totalFrames - 1);
          setPlayback(false);
          audioController.stopAll();
          return;
        }
        setPlayhead(position);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playback, playSpeed, direction, totalFrames]);

  // One voice take and one sound effect per clip, started when the playhead enters that clip.
  useEffect(() => {
    if (!playback || !currentClip) return;
    const frame = currentClip.frame;
    let cancelled = false;
    const run = async () => {
      if (lastSceneRef.current !== frame.sceneId) {
        await audioController.enterScene(frame.scene, resolveMedia);
        lastSceneRef.current = frame.sceneId;
      }
      if (cancelled) return;
      if (lastVoiceClipRef.current === frame.id) return;
      lastVoiceClipRef.current = frame.id;
      if (!soundOn || direction < 0) return;
      audioController.playSfx(frame.beat.sfxUrl, frame.beat.sfxVolume, resolveMedia);
      if (frame.beat.audioUrl) {
        audioController.playVoice(frame.beat.audioUrl, resolveMedia, Number(frame.beat.audioOffsetSeconds || 0));
        const src = resolveMedia(frame.beat.audioUrl);
        if (src) void measureAudioDuration(src, voiceDurationCache.current);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [playback, currentClip?.frame.id, direction, resolveMedia, soundOn]);

  const moveCue = useCallback((kind: "music" | "ambience" | "sfx", sourceId: string, targetId: string) => {
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
      for (const key of ["musicUrl", "sceneAudioUrl", "musicMode", "musicLoop", "musicLevel", "musicFadeSeconds", "musicFadeOutSeconds"]) {
        if (sourceScene[key] !== undefined) targetScene[key] = sourceScene[key];
        delete sourceScene[key];
      }
    } else {
      targetScene.ambientAudio = sourceScene.ambientAudio;
      delete sourceScene.ambientAudio;
    }
    applyProject({ ...current, story: next, updatedAt: Date.now() }, kind === "music" ? "Music cue moved" : "Ambience cue moved");
  }, [applyProject]);

  /* ------------------------------ *
   * Timeline editing               *
   * ------------------------------ */

  const trimClip = useCallback((frameId: string, durationFrames: number) => {
    updateGesture((current) => setClipDuration(current, frameId, durationFrames));
  }, [updateGesture]);

  const moveKeyframe = useCallback((frameId: string, property: AnimationProperty, from: number, to: number) => {
    beginGesture();
    updateGesture((current) => moveAnimationKey(current, frameId, property, from, to));
    endGesture("Keyframe moved");
  }, [beginGesture, endGesture, updateGesture]);

  const selectKeyframe = useCallback((frameId: string, keyFrame: number) => {
    const clip = clipById(sequence.clips, frameId);
    if (!clip) return;
    seek(clip.start + Math.min(keyFrame, clip.duration - 1));
  }, [seek, sequence.clips]);

  const splitCurrent = useCallback(() => {
    const current = projectRef.current;
    if (!current || !currentClip) return;
    const at = playhead - currentClip.start;
    const result = splitClip(current, currentClip.frame.id, at);
    if (!result) {
      setEditLabel("Split needs the playhead at least 6 frames inside the clip");
      return;
    }
    applyProject(result.project, `Clip split at ${timecode(playhead)}`);
    setPlayhead(currentClip.start + result.at);
  }, [applyProject, currentClip, playhead]);

  const deleteCurrent = useCallback(() => {
    const current = projectRef.current;
    if (!current || !currentClip) return;
    const index = currentClip.index;
    const next = deleteKeyframe(current, currentClip.frame.id);
    if (next === current) return;
    applyProject(next, "Clip deleted");
    const after = buildSequence(buildKeyframes(next.story));
    const target = after.clips[Math.max(0, Math.min(after.clips.length - 1, index))];
    setPlayhead(target ? target.start : 0);
  }, [applyProject, currentClip]);

  const duplicateCurrent = useCallback(() => {
    const current = projectRef.current;
    if (!current || !currentClip) return;
    const result = duplicateKeyframe(current, currentClip.frame.id);
    if (!result) return;
    applyProject(result.project, "Clip duplicated");
    const after = buildSequence(buildKeyframes(result.project.story));
    const inserted = clipById(after.clips, result.insertedId);
    if (inserted) setPlayhead(inserted.start);
  }, [applyProject, currentClip]);

  const addKeyframe = useCallback(() => {
    const current = projectRef.current;
    if (!current || !currentClip) return;
    const result = insertKeyframeAfter(current, currentClip.frame.id);
    if (!result) return;
    applyProject(result.project, "Clip added and text split");
    const after = buildSequence(buildKeyframes(result.project.story));
    const inserted = clipById(after.clips, result.insertedId);
    if (inserted) setPlayhead(inserted.start);
    setBrowser({ kind: "image", target: "picture" });
  }, [applyProject, currentClip]);

  const setAnimationProperty = useCallback((property: AnimationProperty, value: number) => {
    if (!currentClip) return;
    const frameId = currentClip.frame.id;
    const local = localFrame;
    editProject((current) => setAnimationValue(current, frameId, property, local, value), `${propertyLabel(property)} changed at frame ${local}`);
  }, [currentClip, editProject, localFrame]);

  const toggleAnimationProperty = useCallback((property: AnimationProperty) => {
    if (!currentClip) return;
    const frameId = currentClip.frame.id;
    const value = evaluate(currentClip.frame, localFrame)[property];
    editProject((current) => toggleAnimationKey(current, frameId, property, localFrame, value), `${propertyLabel(property)} keyframe toggled at frame ${localFrame}`);
  }, [currentClip, editProject, localFrame]);

  const setAnimationEasingForProperty = useCallback((property: AnimationProperty, easing: Easing) => {
    if (!currentClip) return;
    const frameId = currentClip.frame.id;
    editProject((current) => setAnimationEasing(current, frameId, property, localFrame, easing), `${propertyLabel(property)} easing: ${easing}`);
  }, [currentClip, editProject, localFrame]);

  const copyEffects = () => {
    if (!selectedFrame) return;
    setCopiedEffects(copyEffectBlock(selectedFrame));
    setEditLabel("Effects copied");
  };

  const pasteEffects = () => {
    if (!project || !copiedEffects || !selectedFrame) return;
    editProject((current) => pasteEffectBlock(current, [selectedFrame.id], copiedEffects), "Effects pasted");
  };

  useEffect(() => {
    if (!selectedFrame) return;
    window.__frame24 = {
      frameIds: frames.map((frame) => frame.id),
      setFrame: (frameId) => {
        const clip = clipById(sequence.clips, frameId);
        if (!clip) return;
        setPlayback(false);
        setPlayhead(clip.start);
      },
      getDuration: (frameId) => {
        const frame = frames.find((item) => item.id === frameId);
        return frame ? clipFrames(frame) / FPS : 0;
      },
      getFrame: (frameId) => {
        const frame = frames.find((item) => item.id === frameId);
        return frame ? {
          id: frame.id, sceneId: frame.sceneId, mark: frame.mark, number: frame.number,
          clipFrames: clipFrames(frame), seconds: clipFrames(frame) / FPS, text: frame.text, speaker: frame.speaker,
          picture: frame.picture, audioUrl: frame.beat.audioUrl, sfxUrl: frame.beat.sfxUrl,
          musicUrl: frame.scene.musicUrl || frame.scene.sceneAudioUrl, ambientAudio: frame.scene.ambientAudio,
          animation: frame.beat.animation,
        } : undefined;
      },
      syncAnimations: (seconds) => {
        const now = seconds * 1000;
        for (const animation of document.getAnimations()) {
          if (!animationClockRef.current.has(animation)) animationClockRef.current.set(animation, now);
          try { animation.pause(); animation.currentTime = now - (animationClockRef.current.get(animation) || 0); } catch { /* finished animation */ }
        }
      },
      getPlayhead: () => playheadRef.current,
      getTotalFrames: () => sequence.totalFrames,
      clipAt: (absoluteFrame) => {
        const clip = clipAtFrame(sequence.clips, absoluteFrame);
        return clip ? { id: clip.frame.id, mark: clip.frame.mark, start: clip.start, duration: clip.duration, text: clip.frame.text } : undefined;
      },
    };
    return () => { delete window.__frame24; };
  }, [frames, selectedFrame, sequence]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const mod = event.ctrlKey || event.metaKey;
      // Sliders and toggles are not text entry: Space and the transport keys still work from them.
      const control = tag === "INPUT" && ["range", "checkbox", "radio", "button", "submit"].includes((target as HTMLInputElement).type);
      const typing = Boolean(target) && !control && (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || Boolean(target?.isContentEditable));
      if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); saveNow(); return; }
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (typing) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(playheadRef.current - (event.shiftKey ? FPS : 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(playheadRef.current + (event.shiftKey ? FPS : 1));
      } else if (event.key === "ArrowUp") { event.preventDefault(); selectRelativeClip(-1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); selectRelativeClip(1); }
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); splitCurrent(); }
      else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteCurrent(); }
      else if (event.key.toLowerCase() === "k") { event.preventDefault(); setPlayback(false); audioController.stopAll(); }
      else if (event.key.toLowerCase() === "j") { event.preventDefault(); setDirection(-1); setPlayback(true); }
      else if (event.key.toLowerCase() === "l") { event.preventDefault(); setDirection(1); setPlaySpeed((speed) => speed >= 4 ? 1 : speed * 2); setPlayback(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteCurrent, redo, seek, selectRelativeClip, splitCurrent, togglePlayback, undo]);

  function saveNow(): void {
    const current = projectRef.current;
    if (!current) return;
    setSaveStatus("SAVING…");
    void saveActiveProject(current).then(() => setSaveStatus("SAVED TO THIS BROWSER")).catch(() => setSaveStatus("AUTOSAVE FAILED"));
  }

  function createSnapshot(): void {
    const current = projectRef.current;
    const name = snapshotName.trim() || window.prompt("Name this snapshot", `Cut ${new Date().toLocaleDateString()}`)?.trim();
    if (!current || !name) return;
    const snapshot = { id: `snapshot-${crypto.randomUUID()}`, name, createdAt: Date.now(), story: cloneProjectStory(current.story) };
    applyProject({ ...current, snapshots: [...current.snapshots, snapshot], updatedAt: Date.now() }, `Snapshot: ${name}`);
    setSnapshotName("");
    setSnapshotModal(false);
  }

  function restoreSnapshot(snapshotId: string): void {
    const current = projectRef.current;
    const snapshot = current?.snapshots.find((item) => item.id === snapshotId);
    if (!current || !snapshot) return;
    applyProject({ ...current, story: cloneProjectStory(snapshot.story), updatedAt: Date.now() }, `Restored ${snapshot.name}`);
    const restored = buildSequence(buildKeyframes(snapshot.story));
    setPlayhead(restored.clips[0]?.start ?? 0);
  }

  async function exportBundle(): Promise<void> {
    if (!project) return;
    setExportProgress(5);
    setExportMessage("Bundling referenced files from the linked public folder…");
    try {
      const bundle = await buildPortableBundle(project, folderFiles, publicPaths);
      setExportProgress(100);
      downloadText(JSON.stringify(bundle), `${slug(project.title)}.reel.json`, "application/json");
      setExportMessage(`${bundle.assets.length} assets embedded · ${bundle.missing.length} unresolved media path(s) retained and listed.`);
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
    const selected = rangeEnd === null ? frames : frames.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1);
    const text = makeSrt(selected, selected.map((frame) => clipFrames(frame) / FPS));
    downloadText(text, `${slug(project?.title || "animatic")}.srt`, "text/plain");
    setExportMessage(`SRT written for ${selected.length} clips.`);
  }

  function saveCrop(): void {
    if (!cropState || !project) return;
    const next = {
      ...project,
      assets: project.assets.map((asset) => asset.id === cropState.assetId
        ? { ...asset, crop: { x: cropState.x, y: cropState.y, width: 100, height: 100 } }
        : asset),
      updatedAt: Date.now(),
    };
    applyProject(next, "Non-destructive 16:9 crop set");
    setCropState(null);
  }

  const currentImageSrc = selectedFrame ? resolveMedia(selectedFrame.picture) : undefined;
  const diagnostics = project ? runningOrderDiagnostics(project.story) : [];
  const clipProgress = currentClip ? Math.min(1, localFrame / Math.max(1, currentClip.duration)) : 0;

  if (loading) return <div className="loading-screen"><div className="loading-wordmark">FRAME<span>/24</span></div><span>Opening reel…</span></div>;
  if (loadError && !project) return <div className="loading-screen"><div className="loading-wordmark">FRAME<span>/24</span></div><p>{loadError}</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload app</button></div>;
  if (!project || !selectedFrame || !currentClip) return <div className="loading-screen">No keyframes are available in this project.</div>;

  return (
    <div
      className={`frame24-shell ${dragOver ? "is-drag-over" : ""}`}
      onDragOver={(event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); setDragOver(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false); }}
      onDrop={handleDrop}
    >
      <input ref={importInputRef} className="hidden-input" type="file" accept=".reel.json,.json,.ts,application/json,text/plain" onChange={(event) => void handleImportInput(event)} />
      <input ref={imageInputRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => onUploadInput(event, "image")} />
      <input ref={audioInputRef} className="hidden-input" type="file" accept="audio/*" onChange={(event) => onUploadInput(event, "audio")} />
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
        onLinkFolder={() => { folderInputRef.current?.setAttribute("webkitdirectory", ""); folderInputRef.current?.click(); }}
        folderLabel={folderLabel}
        onSnapshot={() => setSnapshotModal(true)}
        onExport={() => { setExportOpen(true); setExportMessage(""); setPatchReport(null); }}
        onSave={saveNow}
        missingCount={project.missing.length}
        onMissing={() => setMissingOpen(true)}
        editLabel={editLabel}
        totalDuration={totalFrames}
      />

      <div className="workspace-grid">
        <main className="stage-column">
          <header className="stage-heading">
            <div className="stage-title-lockup">
              <span className="scene-index">{String(selectedFrame.mark).startsWith("nw_") ? "SCENE" : "SC"} {selectedFrame.mark}</span>
              <h1>{selectedFrame.scene.title || project.title}</h1>
              <p>{selectedFrame.speaker}<span>·</span>{selectedFrame.text || "No caption on this beat"}</p>
            </div>
            <div className="stage-heading-actions">
              <span className="render-tag"><i />SCARLET REEL RENDERER</span>
              <button className={`caption-toggle ${showCaptions ? "is-active" : ""}`} onClick={() => setShowCaptions((value) => !value)}>CC</button>
              <button className={`caption-toggle ${showMarks ? "is-active" : ""}`} onClick={() => setShowMarks((value) => !value)}>MARK</button>
            </div>
          </header>
          <div className="preview-stage">
            <div className="preview-inner">
              <CinematicPreview
                key={selectedFrame.id}
                frame={selectedFrame}
                imageSrc={currentImageSrc}
                imagePosition={currentImagePosition}
                resolveMedia={resolveMedia}
                playing={playback}
                soundOn={soundOn}
                showCaption={showCaptions}
                showMark={showMarks}
                localFrame={localFrame}
                setFocalPoint={setFocalPoint}
              />
            </div>
            <div className="preview-progress"><span style={{ width: `${clipProgress * 100}%` }} /></div>
            <span className="preview-resolution">16:9 <i>·</i> PREVIEW <i>·</i> <b data-testid="viewer-timecode">{timecode(playhead)}</b></span>
          </div>
          <div className="transport-bar">
            <div className="transport-primary">
              <button className="transport-button" aria-label="Previous clip" onClick={() => selectRelativeClip(-1)}>‹</button>
              <button className={`transport-play ${playback ? "is-playing" : ""}`} aria-label={playback ? "Pause" : "Play"} onClick={togglePlayback}>{playback ? "Ⅱ" : "▶"}</button>
              <button className="transport-button" aria-label="Next clip" onClick={() => selectRelativeClip(1)}>›</button>
              <span className="transport-time"><strong data-testid="transport-timecode">{timecode(playhead)}</strong> <i>/</i> {timecode(totalFrames)} <em>· {localFrame} / {currentClip.duration}f</em></span>
            </div>
            <div className="transport-secondary">
              <button onClick={() => { setDirection(-1); setPlayback(true); }} title="Play backwards">J</button>
              <button onClick={() => { setPlayback(false); audioController.stopAll(); }} title="Stop">K</button>
              <button onClick={() => { setDirection(1); setPlaySpeed((value) => value >= 4 ? 1 : value * 2); setPlayback(true); }} title="Play forward / faster">L</button>
              <span>{playSpeed}×</span>
              <button className={`sound-button ${soundOn ? "" : "is-muted"}`} onClick={() => { setSoundOn((value) => !value); if (soundOn) audioController.stopAll(); }}>♫</button>
            </div>
            <div className="transport-counter">CLIP <strong>{String(currentIndex + 1).padStart(4, "0")}</strong><i>/</i>{sequence.clips.length.toLocaleString()}</div>
          </div>
          <Tracks frames={frames} selectedFrameId={selectedFrame.id} onSelect={(id) => { const clip = clipById(sequence.clips, id); if (clip) seek(clip.start); }} onMoveCue={moveCue} />
        </main>

        <Inspector
          project={project}
          frame={selectedFrame}
          pictureSrc={currentImageSrc}
          selectedCount={1}
          copied={!!copiedEffects}
          onBrowse={openBrowser}
          onUpload={imageInputRefTarget}
          onSetPicture={setFramePicture}
          onSetEffect={(path, value) => editProject((current) => setEffectField(current, selectedFrame.id, path, value), `${path.replace("cinematic.", "")} changed`)}
          onResetEffect={(path) => editProject((current) => resetEffectField(current, selectedFrame.id, path), `${path.replace("cinematic.", "")} reset`)}
          onSetBeat={(path, value) => editProject((current) => setBeatField(current, selectedFrame.id, path, value), `${path} changed`)}
          onSetScene={(path, value) => editProject((current) => setSceneField(current, selectedFrame.sceneId, path, value), `${path} changed`)}
          onCopyEffects={copyEffects}
          onPasteEffects={pasteEffects}
          onPlayVoice={() => {
            if (!selectedFrame.beat.audioUrl) return;
            audioController.unlock();
            audioController.playVoice(selectedFrame.beat.audioUrl, resolveMedia, Number(selectedFrame.beat.audioOffsetSeconds || 0));
          }}
          onInsert={addKeyframe}
          onDuplicate={duplicateCurrent}
          onDelete={deleteCurrent}
          onMove={(delta) => editProject((current) => reorderKeyframe(current, selectedFrame.id, delta), delta < 0 ? "Clip moved earlier" : "Clip moved later")}
          onPreviewSfx={() => audioController.playSfx(selectedFrame.beat.sfxUrl, selectedFrame.beat.sfxVolume, resolveMedia)}
          localFrame={localFrame}
          clipDuration={currentClip.duration}
          onAnimationValue={setAnimationProperty}
          onAnimationToggle={toggleAnimationProperty}
          onAnimationEasing={setAnimationEasingForProperty}
        />

        <Timeline
          frames={frames}
          selectedFrameId={selectedFrame.id}
          playhead={playhead}
          resolveMedia={resolveMedia}
          onSeek={seek}
          onSelectClip={(frameId, absoluteFrame) => {
            const clip = clipById(sequence.clips, frameId);
            if (!clip) return;
            seek(Math.max(clip.start, Math.min(clip.end - 1, absoluteFrame)));
          }}
          onTrimStart={beginGesture}
          onTrim={trimClip}
          onTrimEnd={endGesture}
          onMoveKeyframe={moveKeyframe}
          onSelectKeyframe={selectKeyframe}
          onDropFile={handleTimelineDrop}
        />
      </div>

      <footer className="app-footer">
        <span><b>FRAME/24</b> · KEYFRAME VIDEO EDITOR</span>
        <span>{diagnostics.length ? `${diagnostics.length} RUN-ORDER NOTE${diagnostics.length === 1 ? "" : "S"}` : "RUNNING ORDER VERIFIED"}</span>
        <span>SPACE PLAY · ←/→ FRAME · S SPLIT · ⌫ DELETE · ⌘Z UNDO</span>
      </footer>
      {dragOver && <div className="drop-overlay"><div><span>＋</span><strong>DROP A STILL</strong><small>Original bytes are stored in this project</small></div></div>}

      {browser && <AssetBrowser title={browser.target === "picture" || browser.target === "scenePicture" || browser.target === "depthMap" || browser.target === "foregroundImage" ? "Choose a picture" : browser.target === "voice" ? "Choose a voice take" : browser.target === "sfx" ? "Choose a sound effect" : "Choose a music cue"} kind={browser.kind} items={browser.kind === "image" ? imageBrowserItems : audioBrowserItems} onSelect={chooseBrowserAsset} onClose={() => setBrowser(null)} />}
      {missingOpen && <MissingMediaModal items={project.missing} folderLabel={folderLabel} onClose={() => setMissingOpen(false)} onLink={() => { setMissingOpen(false); folderInputRef.current?.setAttribute("webkitdirectory", ""); folderInputRef.current?.click(); }} />}
      {exportOpen && <ExportModal
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
        onMp4={() => setMp4Message("Exact MP4 rendering uses tools/export-animatic.mjs with local Playwright Chromium and ffmpeg. This browser-only surface does not substitute a simplified renderer.")}
        onClose={() => setExportOpen(false)}
        onRestoreSnapshot={restoreSnapshot}
      />}
      {snapshotModal && <SnapshotModal project={project} name={snapshotName} setName={setSnapshotName} onSave={createSnapshot} onClose={() => setSnapshotModal(false)} onRestore={restoreSnapshot} />}
      {cropState && <CropModal crop={cropState} imageSrc={objectUrls.get(`asset:${cropState.assetId}`)} onChange={(x, y) => setCropState((current) => current ? { ...current, x, y } : current)} onSave={saveCrop} onSkip={() => setCropState(null)} />}
      {loadError && <div className="toast-message" role="status"><span>{loadError}</span><button onClick={() => setLoadError("")}>×</button></div>}
    </div>
  );
}

function propertyLabel(property: AnimationProperty): string {
  return property === "zoom" ? "Zoom" : property === "x" ? "Position X" : "Position Y";
}

function startOfScene(project: ProjectState, mark: string): number {
  const sequence = buildSequence(buildKeyframes(project.story));
  const clip = sequence.clips.find((candidate) => candidate.frame.mark === mark) ?? sequence.clips[0];
  return clip ? clip.start : 0;
}
