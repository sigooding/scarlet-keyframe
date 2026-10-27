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
import { applyStudioMusicSync, buildKeyframes, collectImageReferences, collectMediaReferences, createProjectState, parseImportPayload, runningOrderDiagnostics, type AnyRecord, type ProjectAsset, type ProjectState } from "./core/model";
import { cloneStory as cloneProjectStory, copyEffectBlock, deleteKeyframe, duplicateKeyframe, insertKeyframeAfter, moveSfxCue, pasteEffectBlock, reorderKeyframe, resetEffectField, setBeatField, setEffectField, setPicture, setSceneField, type EffectBlock } from "./core/edits";
import { buildPortableBundle } from "./core/exportBundle";
import { downloadText, measureAudioDuration, slug } from "./core/helpers";
import { createUploadAsset, dataUrlToBlob, evaluateMissingMedia, folderFilePath, normalizeMediaPath, referencedPath } from "./core/media";
import { UndoHistory } from "./core/history";
import { loadActiveProject, saveActiveProject } from "./core/storage";
import { formatTime, keyframeDuration, makeSrt, untilNextMusicBeat } from "./core/timing";
import { writeStudioPatch } from "./core/patch";
import { PreviewAudioController } from "./core/previewAudio";
import type { StudioPatchResult } from "./core/patch";
import { audio } from "../vendor/scarlet-reel/audio";
import bundledFilm from "./data/nobodys-witness-film.json";
import bundledEdits from "./data/studio-edits.json";

type BrowseTarget = "picture" | "scenePicture" | "depthMap" | "foregroundImage" | "voice" | "sfx" | "music";
type BrowserState = { kind: "image" | "audio"; target: BrowseTarget };
type UploadIntent = { kind: "image" | "audio"; target: "picture" | "voice" | "sfx" | "music"; frameId: string };

declare global {
  interface Window {
    __frame24?: {
      frameIds: string[];
      setFrame: (frameId: string) => void;
      getDuration: (frameId: string) => number;
      getFrame: (frameId: string) => AnyRecord | undefined;
      syncAnimations: (seconds: number) => void;
    };
  }
}

const history = new UndoHistory<ProjectState>(100);
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
  const [frameProgress, setFrameProgress] = useState(0);
  const [frameDuration, setFrameDuration] = useState(0);
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
  const [, setFilterState] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const lastSceneRef = useRef("");
  const voiceDurationCache = useRef(new Map<string, number>());
  const animationClockRef = useRef(new WeakMap<Animation, number>());

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
          const frames = buildKeyframes(repaired.story);
          const start = frames.find((frame) => frame.mark === "77") || frames[0];
          setSelectedFrameId(start?.id || "");
          setSelectedFrameIds(start ? [start.id] : []);
          setSaveStatus("AUTOSAVED PROJECT");
        } else {
          const imported = parseImportPayload(bundledFilm, "nobodys-witness-film.json");
          const contextual = { ...imported, story: applyStudioMusicSync(imported.story, sourceEdits) };
          const next = createProjectState(contextual, [], sourceEdits);
          next.missing = evaluateMissingMedia(next, new Map(), paths);
          setProject(next);
          const frames = buildKeyframes(next.story);
          const start = frames.find((frame) => frame.mark === "77") || frames[0];
          setSelectedFrameId(start?.id || "");
          setSelectedFrameIds(start ? [start.id] : []);
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
  const selectedFrame = useMemo(() => frames.find((frame) => frame.id === selectedFrameId) || frames[0], [frames, selectedFrameId]);
  const currentIndex = selectedFrame ? frames.findIndex((frame) => frame.id === selectedFrame.id) : 0;
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

  const selectFrame = useCallback((frameId: string, extend: boolean) => {
    setSelectedFrameId(frameId);
    setSelectedFrameIds((current) => {
      if (!extend) return [frameId];
      return current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId];
    });
    setFrameProgress(0);
  }, []);

  const selectRelative = useCallback((delta: number) => {
    if (!frames.length) return;
    const next = Math.max(0, Math.min(frames.length - 1, currentIndex + delta));
    selectFrame(frames[next].id, false);
  }, [frames, currentIndex, selectFrame]);

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
    const ordered = buildKeyframes(next.story);
    const start = ordered.find((frame) => frame.mark === "77") || ordered[0];
    setSelectedFrameId(start?.id || "");
    setSelectedFrameIds(start ? [start.id] : []);
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

  const openPlayback = useCallback(() => {
    if (!project || !selectedFrame) return;
    if (playback) {
      setPlayback(false);
      audioController.stopAll();
      return;
    }
    audioController.unlock();
    setDirection(1);
    setPlaySpeed(1);
    setFrameProgress(0);
    lastSceneRef.current = "";
    void audioController.startFrom(project.story, selectedFrame.sceneId, resolveMedia);
    setPlayback(true);
  }, [playback, project, resolveMedia, selectedFrame]);

  useEffect(() => {
    if (!playback || !selectedFrame || !project) return;
    let cancelled = false;
    let timer: number | undefined;
    let animation: number | undefined;
    const frame = selectedFrame;
    const index = frames.findIndex((item) => item.id === frame.id);
    const run = async () => {
      if (lastSceneRef.current !== frame.sceneId) {
        await audioController.enterScene(frame.scene, resolveMedia);
        lastSceneRef.current = frame.sceneId;
      }
      if (cancelled) return;
      audioController.playSfx(frame.beat.sfxUrl, frame.beat.sfxVolume, resolveMedia);
      const voiceSrc = resolveMedia(frame.beat.audioUrl);
      if (frame.beat.audioUrl && soundOn) audioController.playVoice(frame.beat.audioUrl, resolveMedia, Number(frame.beat.audioOffsetSeconds || 0));
      let voiceSeconds: number | undefined;
      if (frame.beat.audioUrl && voiceSrc) voiceSeconds = await measureAudioDuration(voiceSrc, voiceDurationCache.current);
      if (cancelled) return;
      let duration = keyframeDuration(frame, voiceSeconds, 1);
      const nextIndex = index + direction;
      const nextFrame = frames[nextIndex];
      let syncWait = 0;
      const sync = frame.scene.musicSync;
      if (direction > 0 && nextFrame && sync && nextFrame.picture !== frame.picture && nextFrame.sceneId === frame.sceneId) {
        const projected = audioController.musicPosition + duration;
        syncWait = untilNextMusicBeat(projected, audioController.musicDuration, sync);
      }
      duration += syncWait;
      setFrameDuration(duration);
      setFrameProgress(0);
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        setFrameProgress(Math.min(1, (now - start) / (duration * 1000)));
        animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (nextIndex < 0 || nextIndex >= frames.length) {
          setPlayback(false);
          audioController.stopAll();
          return;
        }
        setSelectedFrameId(frames[nextIndex].id);
        setSelectedFrameIds([frames[nextIndex].id]);
      }, Math.max(100, duration * 1000 / playSpeed));
    };
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (animation !== undefined) cancelAnimationFrame(animation);
      audioController.stopVoice();
    };
  }, [playback, selectedFrameId, frames, project, resolveMedia, soundOn, direction, playSpeed]);

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

  useEffect(() => {
    if (!selectedFrame) return;
    window.__frame24 = {
      frameIds: frames.map((frame) => frame.id),
      setFrame: (frameId) => { setPlayback(false); setSelectedFrameId(frameId); setSelectedFrameIds([frameId]); },
      getDuration: (frameId) => {
        const frame = frames.find((item) => item.id === frameId);
        return frame ? keyframeDuration(frame) : 0;
      },
      getFrame: (frameId) => {
        const frame = frames.find((item) => item.id === frameId);
        return frame ? {
          id: frame.id, sceneId: frame.sceneId, mark: frame.mark, number: frame.number,
          duration: keyframeDuration(frame), text: frame.text, speaker: frame.speaker,
          picture: frame.picture, audioUrl: frame.beat.audioUrl, sfxUrl: frame.beat.sfxUrl,
          musicUrl: frame.scene.musicUrl || frame.scene.sceneAudioUrl, ambientAudio: frame.scene.ambientAudio,
        } : undefined;
      },
      syncAnimations: (seconds) => {
        const now = seconds * 1000;
        for (const animation of document.getAnimations()) {
          if (!animationClockRef.current.has(animation)) animationClockRef.current.set(animation, now);
          try { animation.pause(); animation.currentTime = now - (animationClockRef.current.get(animation) || 0); } catch { /* finished animation */ }
        }
      },
    };
    return () => { delete window.__frame24; };
  }, [frames, selectedFrame]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); void saveNow(); return; }
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (typing) return;
      if (event.code === "Space") { event.preventDefault(); openPlayback(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); selectRelative(-1); }
      else if (event.key === "ArrowDown") { event.preventDefault(); selectRelative(1); }
      else if (event.key.toLowerCase() === "k") { event.preventDefault(); setPlayback(false); audioController.stopAll(); }
      else if (event.key.toLowerCase() === "j") { event.preventDefault(); setDirection(-1); setPlayback(true); }
      else if (event.key.toLowerCase() === "l") { event.preventDefault(); setDirection(1); setPlaySpeed((speed) => speed >= 4 ? 1 : speed * 2); setPlayback(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPlayback, redo, selectRelative, undo]);

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
    const restored = buildKeyframes(snapshot.story)[0];
    if (restored) selectFrame(restored.id, false);
  }

  function addKeyframe(afterFrameId = selectedFrame?.id): void {
    if (!afterFrameId || !projectRef.current) return;
    const result = insertKeyframeAfter(projectRef.current, afterFrameId);
    if (!result) return;
    applyProject(result.project, "Keyframe added and text split");
    setSelectedFrameId(result.insertedId);
    setSelectedFrameIds([result.insertedId]);
    setBrowser({ kind: "image", target: "picture" });
  }

  function duplicateCurrent(): void {
    if (!selectedFrame || !projectRef.current) return;
    const result = duplicateKeyframe(projectRef.current, selectedFrame.id);
    if (!result) return;
    applyProject(result.project, "Keyframe duplicated");
    setSelectedFrameId(result.insertedId);
    setSelectedFrameIds([result.insertedId]);
  }

  function deleteCurrent(): void {
    if (!selectedFrame || !projectRef.current) return;
    const oldIndex = currentIndex;
    const next = deleteKeyframe(projectRef.current, selectedFrame.id);
    applyProject(next, "Keyframe deleted");
    const nextFrames = buildKeyframes(next.story);
    const nearest = nextFrames[Math.max(0, Math.min(nextFrames.length - 1, oldIndex))];
    setSelectedFrameId(nearest?.id || "");
    setSelectedFrameIds(nearest ? [nearest.id] : []);
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
    editProject((current) => pasteEffectBlock(current, targets, copiedEffects), `Effects pasted to ${targets.length} keyframes`);
  }

  function reorderDrop(sourceId: string, targetId: string): void {
    const current = projectRef.current;
    if (!current || sourceId === targetId) return;
    const originalFrames = buildKeyframes(current.story);
    const source = originalFrames.find((frame) => frame.id === sourceId);
    const target = originalFrames.find((frame) => frame.id === targetId);
    if (!source || !target || source.sceneId !== target.sceneId) return;
    const story = cloneProjectStory(current.story);
    const scene = story.scenes.find((item) => item.id === source.sceneId);
    if (!scene?.dialogueBeats) return;
    const from = scene.dialogueBeats.findIndex((beat, index) => String(beat.id || `${scene.id}:${index + 1}`) === sourceId);
    const to = scene.dialogueBeats.findIndex((beat, index) => String(beat.id || `${scene.id}:${index + 1}`) === targetId);
    if (from < 0 || to < 0) return;
    const [beat] = scene.dialogueBeats.splice(from, 1);
    scene.dialogueBeats.splice(to, 0, beat);
    applyProject({ ...current, story, updatedAt: Date.now() }, "Keyframe reordered");
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
    const selectedFrames = rangeEnd === null ? frames : frames.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1);
    const text = makeSrt(selectedFrames, selectedFrames.map((frame) => keyframeDuration(frame)));
    downloadText(text, `${slug(project?.title || "animatic")}.srt`, "text/plain");
    setExportMessage(`SRT written for ${selectedFrames.length} keyframes.`);
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
  const totalSeconds = frames.reduce((sum, frame) => sum + keyframeDuration(frame), 0);

  if (loading) return <div className="loading-screen"><div className="loading-wordmark">FRAME<span>/24</span></div><span>Opening reel…</span></div>;
  if (loadError && !project) return <div className="loading-screen"><div className="loading-wordmark">FRAME<span>/24</span></div><p>{loadError}</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload app</button></div>;
  if (!project || !selectedFrame) return <div className="loading-screen">No keyframes are available in this project.</div>;

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
        totalDuration={totalSeconds}
      />

      <div className="workspace-grid">
        <Timeline
          frames={frames}
          selectedFrameId={selectedFrame.id}
          selectedFrameIds={selectedFrameIds}
          resolveMedia={resolveMedia}
          onSelect={selectFrame}
          onAddAfter={(frameId) => addKeyframe(frameId)}
          onDropFile={handleTimelineDrop}
          onReorderDrop={reorderDrop}
          onFoldScene={() => setFilterState((value) => value + 1)}
        />

        <main className="stage-column">
          <header className="stage-heading">
            <div className="stage-title-lockup"><span className="scene-index">{String(selectedFrame.mark).startsWith("nw_") ? "SCENE" : "SC"} {selectedFrame.mark}</span><h1>{selectedFrame.scene.title || project.title}</h1><p>{selectedFrame.speaker}<span>·</span>{selectedFrame.text || "No caption on this beat"}</p></div>
            <div className="stage-heading-actions"><span className="render-tag"><i />SCARLET REEL RENDERER</span><button className={`caption-toggle ${showCaptions ? "is-active" : ""}`} onClick={() => setShowCaptions((value) => !value)}>CC</button><button className={`caption-toggle ${showMarks ? "is-active" : ""}`} onClick={() => setShowMarks((value) => !value)}>MARK</button></div>
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
                setFocalPoint={setFocalPoint}
              />
            </div>
            {playback && <div className="preview-progress"><span style={{ width: `${frameProgress * 100}%` }} /></div>}
            <span className="preview-resolution">16:9 <i>·</i> PREVIEW</span>
          </div>
          <div className="transport-bar">
            <div className="transport-primary">
              <button className="transport-button" aria-label="Previous keyframe" onClick={() => selectRelative(-1)}>‹</button>
              <button className={`transport-play ${playback ? "is-playing" : ""}`} aria-label={playback ? "Pause animatic" : "Play animatic"} onClick={openPlayback}>{playback ? "Ⅱ" : "▶"}</button>
              <button className="transport-button" aria-label="Next keyframe" onClick={() => selectRelative(1)}>›</button>
              <span className="transport-time">{formatTime(frameDuration * frameProgress)} <i>/</i> {formatTime(frameDuration)}</span>
            </div>
            <div className="transport-secondary"><button onClick={() => { setDirection(-1); setPlayback(true); }}>J</button><button onClick={() => { setPlayback(false); audioController.stopAll(); }}>K</button><button onClick={() => { setDirection(1); setPlaySpeed((value) => value >= 4 ? 1 : value * 2); setPlayback(true); }}>L</button><span>{playSpeed}×</span><button className={`sound-button ${soundOn ? "" : "is-muted"}`} onClick={() => { setSoundOn((value) => !value); if (soundOn) audioController.stopAll(); }}>♫</button></div>
            <div className="transport-counter">KF <strong>{String(currentIndex + 1).padStart(4, "0")}</strong><i>/</i>{frames.length.toLocaleString()}</div>
          </div>
          <Tracks frames={frames} selectedFrameId={selectedFrame.id} onSelect={(id) => selectFrame(id, false)} onMoveCue={moveCue} />
        </main>

        <Inspector
          project={project}
          frame={selectedFrame}
          pictureSrc={currentImageSrc}
          selectedCount={selectedFrameIds.length}
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
          onMove={(delta) => editProject((current) => reorderKeyframe(current, selectedFrame.id, delta), delta < 0 ? "Keyframe moved earlier" : "Keyframe moved later")}
          onPreviewSfx={() => audioController.playSfx(selectedFrame.beat.sfxUrl, selectedFrame.beat.sfxVolume, resolveMedia)}
        />
      </div>

      <footer className="app-footer"><span><b>FRAME/24</b> · STRAIGHT-THROUGH ANIMATIC EDITOR</span><span>{diagnostics.length ? `${diagnostics.length} RUN-ORDER NOTE${diagnostics.length === 1 ? "" : "S"}` : "RUNNING ORDER VERIFIED"}</span><span>SPACE PLAY · ↑ / ↓ KEYFRAME · ⌘Z UNDO</span></footer>
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
