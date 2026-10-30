import { useEffect, useRef, useState } from "react";
import {
  audioLabelFromSrc,
  formatMsTimecode,
  MIN_AUDIO_CLIP_MS,
  type AudioClip,
  type AudioLaneId,
  type ResolvedAudioClip,
} from "../core/audioClips";
import {
  addCaptionInGap,
  captionMetrics,
  captionsDifferFromRecordedLine,
  effectiveCaptionsForBeat,
  hasAuthoredCaptions,
  parseCaptionTimecode,
  setCaptionRange,
  splitCaptionAtCursor,
  updateCaptionText,
  type BeatCaption,
} from "../core/captions";
import { CINEMATIC_GROUPS, type CinematicField } from "../core/cinematicSchema";
import {
  CUTOUT_LAYER_COLORS,
  defaultDepthForCutoutLayer,
  depthAssetLabel,
  extractKeyframeDepthInfo,
  MAX_DEPTH_CUTOUTS,
  serializeCutoutSlots,
} from "../core/depthLanes";
import { getEffectValue } from "../core/edits";
import { pictureLabel } from "../core/helpers";
import type { BeatAnimation, KeyEasing, Keyframe, ProjectState } from "../core/model";
import { formatTimecode, sceneProseFrames } from "../core/timing";
import {
  ANIM_PROP_META,
  ANIM_PROPS,
  applyPoseAtPlayhead,
  buildStarterPresetAnimation,
  clampPoseToPictureEdges,
  describeAuthoredMove,
  effectiveFrameCinematic,
  evaluate,
  hasAnimationKeyframes,
  hasPlainValues,
  setKeyEasingAtFrame,
  setSliderValueAtFrame,
  STARTER_PRESET_OPTIONS,
  toggleKeyAtFrame,
  type AnimProp,
  type EvaluatedPose,
  type StarterPresetId,
} from "../sequence/animate";
import { mapTransitionKind } from "../sequence/transitions";

export type InspectorTab = "clip" | "voice" | "sfx" | "music" | "ambience";

export type BrowseMediaTarget =
  | "picture"
  | "scenePicture"
  | "depthMap"
  | "depthPlate"
  | "foregroundImage"
  | "cutout:add"
  | `cutout:${number}`
  | "voice"
  | "sfx"
  | "music"
  | "ambience"
  | `ambience:${number}`;

export type UploadMediaTarget =
  | "picture"
  | "depthMap"
  | "depthPlate"
  | "cutout:add"
  | `cutout:${number}`
  | "voice"
  | "sfx"
  | "music"
  | "ambience";

export interface InheritedMusicInfo {
  sceneId: string;
  frameId: string;
  mark: string;
  url: string;
  label: string;
}

export interface InheritedAmbienceInfo {
  sceneId: string;
  frameId: string;
  mark: string;
  raw: string;
  label: string;
}

export function parseAmbienceSpec(raw: unknown): {
  mode: "inherit" | "none" | "layers";
  synth: string;
  files: string[];
} {
  if (raw === undefined || raw === null) {
    return { mode: "inherit", synth: "none", files: [] };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { mode: "inherit", synth: "none", files: [] };
  }
  if (trimmed === "none") {
    return { mode: "none", synth: "none", files: [] };
  }
  let synth = "none";
  const files: string[] = [];
  for (const token of trimmed.split("+")) {
    const part = token.trim();
    if (!part || part === "none") continue;
    if (part.startsWith("file:")) {
      const fileRef = part.slice(5).trim();
      if (fileRef) files.push(fileRef);
    } else if (synth === "none") {
      synth = part;
    }
  }
  return { mode: "layers", synth, files };
}

export function serializeAmbienceSpec(synth: string, files: string[]): string {
  const parts: string[] = [];
  if (synth && synth !== "none") parts.push(synth);
  for (const file of files) {
    const clean = file.trim();
    if (clean) parts.push(clean.startsWith("file:") ? clean : `file:${clean}`);
  }
  return parts.length > 0 ? parts.join("+") : "none";
}

interface InspectorProps {
  project: ProjectState;
  frame: Keyframe;
  localFrame: number;
  clipDurationFrames: number;
  canSplit: boolean;
  pictureSrc?: string;
  selectedCount: number;
  copied: boolean;
  activeTab?: InspectorTab;
  onChangeTab?: (tab: InspectorTab) => void;
  inheritedMusic?: InheritedMusicInfo;
  inheritedAmbience?: InheritedAmbienceInfo;
  onSelectFrameId?: (frameId: string) => void;
  onBrowse: (kind: "image" | "audio", target: BrowseMediaTarget) => void;
  onUpload: (kind: "image" | "audio", target: UploadMediaTarget) => void;
  onSetPicture: (picture?: string) => void;
  onSetAnimation: (animation: BeatAnimation | undefined, label: string) => void;
  onPreviewAnimation: (animation: BeatAnimation | undefined) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
  onJumpToLocalFrame: (localFrame: number) => void;
  onSetEffect: (path: string, value: unknown) => void;
  onResetEffect: (path: string) => void;
  onSetBeat: (path: string, value: unknown) => void;
  onSetScene: (path: string, value: unknown) => void;
  onCopyEffects: () => void;
  onPasteEffects: () => void;
  onPlayVoice: () => void;
  onPreviewSfx: () => void;
  onPreviewMusic?: () => void;
  onPreviewAmbience?: (fileUrl?: string) => void;
  onSplit: () => void;
  onInsert: () => void;
  onDuplicate: () => void;
  canMergeFrames?: boolean;
  onMergeFrames?: () => void;
  onDelete: () => void;
  onExecuteDelete?: (ripple: boolean) => void;
  onDeleteClip?: (ripple: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  kenBurnsActive?: boolean;
  onToggleKenBurns?: () => void;
  onEdgeClamped?: () => void;
  resolvedAudioClips?: ResolvedAudioClip[];
  selectedAudioClipIds?: string[];
  playheadMs?: number;
  duckDepth?: number;
  onSetDuckDepth?: (depth: number) => void;
  onSelectAudioClipId?: (clipId: string) => void;
  onCommitAudioClipPatch?: (clipId: string, patch: Partial<AudioClip>, label: string) => void;
  onMoveAudioClipStartMs?: (clipId: string, newStartMs: number) => void;
  onAddAudioClipOnLane?: (lane: AudioLaneId) => void;
  onPreviewAudioClip?: (clip: ResolvedAudioClip) => void;
  onRebuildSoundFromFilm?: () => void;
  selectedCaptionIndices?: number[];
  canMergeCaptions?: boolean;
  onSelectCaptionIndex?: (index: number, extendNeighbour: boolean) => void;
  onCommitCaptions?: (
    captions: BeatCaption[],
    label: string,
    nextSelectedIndices?: number[],
  ) => void;
  onResetCaptions?: () => void;
  onMergeCaptions?: () => void;
  copiedAnimation?: BeatAnimation | null;
  onCopyAnimation?: () => void;
  onPasteAnimation?: () => void;
  onOpenCurveEditor?: (prop: AnimProp) => void;
  onJumpPrevKeyframe?: () => void;
  onJumpNextKeyframe?: () => void;
  carriedStartPose?: Partial<EvaluatedPose>;
  presetOffsetFrames?: number;
  onConvertAllToKeyframes?: () => void;
}

const TRANSITIONS = ["cut", "dissolve", "dip-to-black", "wipe-left", "wipe-right"];
const PARTICLES = [
  "none",
  "rain",
  "drizzle",
  "snow",
  "smoke",
  "storm",
  "dust",
  "fog",
  "ember",
  "ash",
  "fireflies",
  "motes",
];
const SYNTH_BEDS = ["none", "rain", "jazz", "drone", "tension"];
const EASINGS: KeyEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "bezier",
  "hold",
];

export function Inspector(props: InspectorProps) {
  const { project, frame, localFrame, clipDurationFrames } = props;
  const [fallbackTab, setFallbackTab] = useState<InspectorTab>("clip");
  const [jsonError, setJsonError] = useState("");
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        presetMenuWrapRef.current &&
        e.target instanceof Node &&
        !presetMenuWrapRef.current.contains(e.target)
      ) {
        setPresetMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [presetMenuOpen]);

  const currentTab = props.activeTab ?? fallbackTab;
  const selectTab = (tab: InspectorTab) => {
    if (props.onChangeTab) props.onChangeTab(tab);
    else setFallbackTab(tab);
  };

  const soundSources = project.assets.filter((asset) => asset.type === "audio");
  const beat = frame.beat;
  const scene = frame.scene;
  const animation = beat.animation;
  const pose = evaluate(frame, localFrame, props.carriedStartPose);
  const animated = hasAnimationKeyframes(frame);
  const hasPlain = hasPlainValues(frame);
  const effectiveCin = effectiveFrameCinematic(frame);
  const hasDepthMap = Boolean(
    effectiveCin?.depthMap &&
      frame.picture &&
      !frame.picture.startsWith("video:") &&
      !frame.picture.startsWith("gradient:") &&
      String(effectiveCin?.mode ?? "pan") !== "dolly",
  );
  const authoredMoveLabel = describeAuthoredMove(effectiveCin, frame.picture);

  const applyStarterPreset = (presetId: StarterPresetId, label: string) => {
    const nextAnim = buildStarterPresetAnimation(presetId, frame, clipDurationFrames, {
      presetOffsetFrames: props.presetOffsetFrames ?? 0,
    });
    props.onSetAnimation(nextAnim, `Started from preset: ${label}`);
    setPresetMenuOpen(false);
  };

  const musicUrl = String(scene.musicUrl || scene.sceneAudioUrl || "");
  const ambParsed = parseAmbienceSpec(scene.ambientAudio);
  const useFreeAudioClips = props.resolvedAudioClips !== undefined;
  const playheadMs = props.playheadMs ?? 0;

  const hasAudioOnLane = (lane: AudioLaneId): boolean => {
    if (!props.resolvedAudioClips) return false;
    return props.resolvedAudioClips.some(
      (rc) =>
        rc.lane === lane &&
        (props.selectedAudioClipIds?.includes(rc.id) ||
          rc.anchorId === frame.id ||
          (playheadMs >= rc.startMs && playheadMs < rc.endMs)),
    );
  };

  const tabs: ReadonlyArray<{ id: InspectorTab; label: string; icon: string; hasItem: boolean }> = [
    {
      id: "clip",
      label: "Clip",
      icon: "▣",
      hasItem: Boolean(!beat.gap && frame.picture && !frame.picture.startsWith("gradient:")),
    },
    {
      id: "voice",
      label: "Voice",
      icon: "◉",
      hasItem: useFreeAudioClips ? hasAudioOnLane("voice") : Boolean(beat.audioUrl),
    },
    {
      id: "sfx",
      label: "SFX",
      icon: "✦",
      hasItem: useFreeAudioClips ? hasAudioOnLane("sfx") : Boolean(beat.sfxUrl),
    },
    {
      id: "music",
      label: "Music",
      icon: "♪",
      hasItem: useFreeAudioClips ? hasAudioOnLane("music") : Boolean(musicUrl || props.inheritedMusic),
    },
    {
      id: "ambience",
      label: "Ambience",
      icon: "≈",
      hasItem: useFreeAudioClips
        ? hasAudioOnLane("ambience")
        : Boolean(
            (scene.ambientAudio && String(scene.ambientAudio) !== "none") || props.inheritedAmbience,
          ),
    },
  ];

  return (
    <aside className="inspector-panel" data-active-tab={currentTab}>
      <div className="inspector-head">
        <div>
          <span className="eyebrow">
            CLIP INSPECTOR · {formatTimecode(clipDurationFrames)} ({clipDurationFrames}f)
          </span>
          <h2>
            {frame.mark}
            <span className="inspector-slash">/</span>
            {String(frame.number).padStart(2, "0")}
          </h2>
        </div>
        <div className="inspector-head-actions">
          <button
            type="button"
            className="button button-quiet danger-quiet inspector-head-delete"
            data-testid="inspector-delete-btn"
            onClick={(e) =>
              props.onExecuteDelete ? props.onExecuteDelete(e.shiftKey) : props.onDelete()
            }
            title="Delete current selection (Shift+Click to ripple-delete shot & anchored sounds)"
          >
            Delete
          </button>
          <button
            type="button"
            className="button button-quiet inspector-head-anim-btn"
            data-testid="copy-effects-btn"
            onClick={props.onCopyEffects}
            title="Copy grade, particles, transition & camera effects from this clip (Alt+Ctrl/Cmd+C)"
          >
            ⧉ Copy effects
          </button>
          <button
            type="button"
            className={`button button-quiet inspector-head-anim-btn ${props.copied ? "is-active" : ""}`}
            data-testid="paste-effects-btn"
            onClick={props.onPasteEffects}
            disabled={!props.copied}
            title={`Paste copied effects onto ${Math.max(1, props.selectedCount)} selected clip${props.selectedCount === 1 ? "" : "s"} (Alt+Ctrl/Cmd+V)`}
          >
            ↳ Paste effects
          </button>
          <button
            type="button"
            className="button button-quiet inspector-head-anim-btn"
            data-testid="copy-animation-btn"
            disabled={!animated}
            onClick={props.onCopyAnimation}
            title="Copy all animation keyframes on this clip"
          >
            Copy animation
          </button>
          <button
            type="button"
            className={`button button-quiet inspector-head-anim-btn ${props.copiedAnimation ? "is-active" : ""}`}
            data-testid="paste-animation-btn"
            disabled={!props.copiedAnimation}
            onClick={props.onPasteAnimation}
            title="Paste copied animation keyframes onto selected clip(s)"
          >
            Paste animation
          </button>
        </div>
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="Inspector settings tabs" data-testid="inspector-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={currentTab === tab.id}
            className={`inspector-tab-btn ${currentTab === tab.id ? "is-active" : ""}`}
            data-testid={`inspector-tab-${tab.id}`}
            onClick={() => selectTab(tab.id)}
          >
            <span className="inspector-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.hasItem && <i className="inspector-tab-dot" aria-hidden />}
          </button>
        ))}
      </div>

      <div className="inspector-scroll">
        {useFreeAudioClips && currentTab !== "clip" && (
          <FreeAudioClipTabPanel
            lane={currentTab}
            frame={frame}
            resolvedAudioClips={props.resolvedAudioClips ?? []}
            selectedAudioClipIds={props.selectedAudioClipIds ?? []}
            playheadMs={playheadMs}
            duckDepth={props.duckDepth ?? 0.65}
            onSetDuckDepth={props.onSetDuckDepth}
            onSelectAudioClipId={props.onSelectAudioClipId}
            onBrowse={props.onBrowse}
            onUpload={props.onUpload}
            onCommitAudioClipPatch={props.onCommitAudioClipPatch}
            onMoveAudioClipStartMs={props.onMoveAudioClipStartMs}
            onAddAudioClipOnLane={props.onAddAudioClipOnLane}
            onPreviewAudioClip={props.onPreviewAudioClip}
            onExecuteDelete={props.onExecuteDelete}
            onRebuildSoundFromFilm={props.onRebuildSoundFromFilm}
          />
        )}

        {!useFreeAudioClips && currentTab === "voice" && (
          <div className="inspector-audio-tab" data-testid="inspector-panel-voice">
            <section className="inspector-section">
              <SectionTitle
                number="01"
                title="Voice file"
                status={beat.audioUrl ? "ASSIGNED" : "NO VOICE"}
              />
              <div className="audio-file-card">
                <div className="audio-file-card-meta">
                  <strong>{beat.audioUrl ? fileNameOnly(beat.audioUrl) : "No voice file selected"}</strong>
                  <small>{beat.audioUrl || "Select a recorded dialogue take or upload an audio file"}</small>
                </div>
                <button
                  type="button"
                  className="audio-preview-btn"
                  onClick={props.onPlayVoice}
                  disabled={!beat.audioUrl}
                  aria-label="Preview voice take"
                  title="Preview voice take"
                >
                  ▶
                </button>
              </div>
              <div className="picture-actions">
                <button
                  type="button"
                  className="button button-primary"
                  data-testid="choose-voice-btn"
                  onClick={() => props.onBrowse("audio", "voice")}
                >
                  Choose voice…
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => props.onUpload("audio", "voice")}
                >
                  Upload…
                </button>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => props.onSetBeat("audioUrl", undefined)}
                  disabled={!beat.audioUrl}
                >
                  Remove
                </button>
              </div>
              <label className="control-label">File path</label>
              <input
                className="text-control"
                aria-label="Voice file path"
                value={String(beat.audioUrl || "")}
                placeholder="/film/voice/..."
                onChange={(event) => props.onSetBeat("audioUrl", event.target.value || undefined)}
              />
            </section>

            <section className="inspector-section">
              <SectionTitle number="02" title="Timing & dialogue" status={frame.speaker || "LINE"} />
              <FieldNumber
                label="Voice start"
                value={
                  Number.isFinite(Number(beat.voiceStartFrame))
                    ? Number(beat.voiceStartFrame)
                    : sceneProseFrames(frame)
                }
                min={0}
                max={Math.max(0, clipDurationFrames - 1)}
                step={1}
                onChange={(value) => props.onSetBeat("voiceStartFrame", Math.max(0, Math.round(value)))}
                suffix="f"
              />
              <FieldNumber
                label="Trim offset"
                value={Number(beat.audioOffsetSeconds ?? 0)}
                min={0}
                max={30}
                step={0.05}
                onChange={(value) => props.onSetBeat("audioOffsetSeconds", value)}
                suffix="s"
              />
              <div className="audio-dialogue-box">
                <span className="eyebrow">{frame.speaker || "NARRATOR"}</span>
                <p>{frame.text || "No dialogue line on this clip."}</p>
              </div>
            </section>
          </div>
        )}

        {!useFreeAudioClips && currentTab === "sfx" && (
          <div className="inspector-audio-tab" data-testid="inspector-panel-sfx">
            <section className="inspector-section">
              <SectionTitle
                number="01"
                title="Sound effect file"
                status={beat.sfxUrl ? "ASSIGNED" : "NO SFX"}
              />
              <div className="audio-file-card">
                <div className="audio-file-card-meta">
                  <strong>{beat.sfxUrl ? fileNameOnly(beat.sfxUrl) : "No sound effect selected"}</strong>
                  <small>{beat.sfxUrl || "Select a foley or sound effect cue from the library"}</small>
                </div>
                <button
                  type="button"
                  className="audio-preview-btn"
                  onClick={props.onPreviewSfx}
                  disabled={!beat.sfxUrl}
                  aria-label="Preview sound effect"
                  title="Preview sound effect"
                >
                  ▶
                </button>
              </div>
              <div className="picture-actions">
                <button
                  type="button"
                  className="button button-primary"
                  data-testid="choose-sfx-btn"
                  onClick={() => props.onBrowse("audio", "sfx")}
                >
                  Choose sound…
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => props.onUpload("audio", "sfx")}
                >
                  Upload…
                </button>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => props.onSetBeat("sfxUrl", undefined)}
                  disabled={!beat.sfxUrl}
                >
                  Remove
                </button>
              </div>
              <label className="control-label">File path</label>
              <input
                className="text-control"
                aria-label="Sound effect file path"
                value={String(beat.sfxUrl || "")}
                placeholder="/film/sfx/..."
                onChange={(event) => props.onSetBeat("sfxUrl", event.target.value || undefined)}
              />
            </section>

            <section className="inspector-section">
              <SectionTitle number="02" title="Effect level" status={`${Math.round(Number(beat.sfxVolume ?? 1) * 100)}%`} />
              <FieldNumber
                label="Effect level"
                value={Number(beat.sfxVolume ?? 1)}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => props.onSetBeat("sfxVolume", value)}
              />
            </section>
          </div>
        )}

        {!useFreeAudioClips && currentTab === "music" && (
          <div className="inspector-audio-tab" data-testid="inspector-panel-music">
            <section className="inspector-section">
              <SectionTitle
                number="01"
                title="Music file"
                status={String(scene.musicMode || "inherit").toUpperCase()}
              />
              {!musicUrl &&
                scene.musicMode !== "none" &&
                props.inheritedMusic &&
                props.inheritedMusic.sceneId !== scene.id && (
                  <div className="audio-inherited-banner">
                    <div>
                      <span className="eyebrow">INHERITED FROM SC {props.inheritedMusic.mark}</span>
                      <strong>{fileNameOnly(props.inheritedMusic.url)}</strong>
                    </div>
                    {props.onSelectFrameId && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => props.onSelectFrameId?.(props.inheritedMusic!.frameId)}
                      >
                        Edit source
                      </button>
                    )}
                  </div>
                )}

              <div className="audio-file-card">
                <div className="audio-file-card-meta">
                  <strong>
                    {musicUrl
                      ? fileNameOnly(musicUrl)
                      : scene.musicMode === "none"
                        ? "Music silenced (none)"
                        : props.inheritedMusic
                          ? `${fileNameOnly(props.inheritedMusic.url)} (inherited)`
                          : "No music track selected"}
                  </strong>
                  <small>
                    {musicUrl ||
                      (props.inheritedMusic
                        ? `Playing from SC ${props.inheritedMusic.mark} · ${props.inheritedMusic.url}`
                        : `Choose a music file to start at SC ${frame.mark}`)}
                  </small>
                </div>
                <button
                  type="button"
                  className="audio-preview-btn"
                  onClick={() => props.onPreviewMusic?.()}
                  disabled={!musicUrl && !props.inheritedMusic}
                  aria-label="Preview music track"
                  title="Preview music track"
                >
                  ▶
                </button>
              </div>

              <div className="picture-actions">
                <button
                  type="button"
                  className="button button-primary"
                  data-testid="choose-music-btn"
                  onClick={() => props.onBrowse("audio", "music")}
                >
                  Choose music…
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => props.onUpload("audio", "music")}
                >
                  Upload…
                </button>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => {
                    props.onSetScene("musicMode", "none");
                    props.onSetScene("musicUrl", undefined);
                  }}
                >
                  Silence
                </button>
              </div>

              <label className="control-label">File path</label>
              <input
                className="text-control"
                value={musicUrl}
                onChange={(event) => {
                  const val = event.target.value || undefined;
                  props.onSetScene("musicUrl", val);
                  if (val && scene.musicMode !== "track") {
                    props.onSetScene("musicMode", "track");
                  }
                }}
                placeholder="Inherit previous cue"
                aria-label="Scene music path"
              />
            </section>

            <section className="inspector-section">
              <SectionTitle number="02" title="Cue & beat sync" status={`SC ${frame.mark}`} />
              <FieldSelect
                label="Mode"
                value={String(scene.musicMode || "inherit")}
                options={["inherit", "track", "none"]}
                onChange={(value) => props.onSetScene("musicMode", value)}
              />
              <FieldToggle
                label="Loop track"
                checked={scene.musicLoop !== false}
                onChange={(value) => props.onSetScene("musicLoop", value)}
              />
              <FieldNumber
                label="Level"
                value={Number(scene.musicLevel ?? 1)}
                min={0}
                max={1.5}
                step={0.01}
                onChange={(value) => props.onSetScene("musicLevel", value)}
              />
              <FieldNumber
                label="Fade in"
                value={Number(scene.musicFadeSeconds ?? 1.4)}
                min={0}
                max={20}
                step={0.1}
                onChange={(value) => props.onSetScene("musicFadeSeconds", value)}
                suffix="s"
              />
              <FieldNumber
                label="Fade out"
                value={Number(scene.musicFadeOutSeconds ?? scene.musicFadeSeconds ?? 1.4)}
                min={0}
                max={30}
                step={0.1}
                onChange={(value) => props.onSetScene("musicFadeOutSeconds", value)}
                suffix="s"
              />
              <FieldNumber
                label="Beat sync BPM"
                value={Number(scene.musicSync?.bpm ?? 0)}
                min={0}
                max={220}
                step={0.01}
                onChange={(value) => props.onSetScene("musicSync.bpm", value || undefined)}
              />
              <FieldNumber
                label="First beat"
                value={Number(scene.musicSync?.firstBeat ?? 0)}
                min={0}
                max={8}
                step={0.01}
                onChange={(value) => props.onSetScene("musicSync.firstBeat", value)}
                suffix="s"
              />
            </section>
          </div>
        )}

        {!useFreeAudioClips && currentTab === "ambience" && (
          <div className="inspector-audio-tab" data-testid="inspector-panel-ambience">
            <section className="inspector-section">
              <SectionTitle
                number="01"
                title="Ambience file"
                status={ambParsed.mode.toUpperCase()}
              />
              {ambParsed.mode === "inherit" &&
                props.inheritedAmbience &&
                props.inheritedAmbience.sceneId !== scene.id && (
                  <div className="audio-inherited-banner">
                    <div>
                      <span className="eyebrow">INHERITED FROM SC {props.inheritedAmbience.mark}</span>
                      <strong>{props.inheritedAmbience.label}</strong>
                    </div>
                    {props.onSelectFrameId && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => props.onSelectFrameId?.(props.inheritedAmbience!.frameId)}
                      >
                        Edit source
                      </button>
                    )}
                  </div>
                )}

              <div className="picture-actions">
                <button
                  type="button"
                  className="button button-primary"
                  data-testid="choose-ambience-btn"
                  onClick={() =>
                    props.onBrowse("audio", ambParsed.files.length > 0 ? "ambience:0" : "ambience")
                  }
                >
                  Choose ambience…
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => props.onBrowse("audio", `ambience:${ambParsed.files.length}`)}
                  title="Add another layered ambience audio loop"
                >
                  ＋ Layer…
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => props.onUpload("audio", "ambience")}
                >
                  Upload…
                </button>
                <button
                  type="button"
                  className="button button-text"
                  onClick={() => props.onSetScene("ambientAudio", "none")}
                >
                  Silence
                </button>
              </div>

              {ambParsed.files.length > 0 ? (
                <div className="ambience-file-list">
                  {ambParsed.files.map((fileRef, idx) => (
                    <div className="audio-file-card" key={`${fileRef}-${idx}`}>
                      <div className="audio-file-card-meta">
                        <strong>{fileNameOnly(fileRef)}</strong>
                        <small>{fileRef}</small>
                      </div>
                      <div className="audio-card-actions">
                        <button
                          type="button"
                          className="audio-preview-btn"
                          onClick={() => props.onPreviewAmbience?.(fileRef)}
                          aria-label={`Preview ${fileNameOnly(fileRef)}`}
                          title="Preview ambience file"
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          className="field-reset"
                          onClick={() => props.onBrowse("audio", `ambience:${idx}`)}
                        >
                          CHANGE
                        </button>
                        <button
                          type="button"
                          className="field-reset"
                          onClick={() => {
                            const nextFiles = ambParsed.files.filter((_, i) => i !== idx);
                            props.onSetScene(
                              "ambientAudio",
                              serializeAmbienceSpec(ambParsed.synth, nextFiles),
                            );
                          }}
                          title="Remove this ambience file layer"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="audio-file-card">
                  <div className="audio-file-card-meta">
                    <strong>
                      {ambParsed.mode === "none"
                        ? "Ambience silenced (none)"
                        : ambParsed.synth !== "none"
                          ? `Synth preset only (${ambParsed.synth})`
                          : props.inheritedAmbience
                            ? `${props.inheritedAmbience.label} (inherited)`
                            : "No recorded ambience file"}
                    </strong>
                    <small>Choose an ambience loop from the library or layer multiple rooms/weather</small>
                  </div>
                </div>
              )}
            </section>

            <section className="inspector-section">
              <SectionTitle number="02" title="Synth bed & raw layers" status={`SC ${frame.mark}`} />
              <FieldSelect
                label="Synth bed"
                value={ambParsed.synth}
                options={SYNTH_BEDS}
                onChange={(nextSynth) =>
                  props.onSetScene(
                    "ambientAudio",
                    serializeAmbienceSpec(nextSynth, ambParsed.files),
                  )
                }
              />
              <label className="control-label ambience-label">Ambience layers</label>
              <input
                className="text-control"
                value={String(scene.ambientAudio || "")}
                placeholder="Inherit previous scene (or none)"
                onChange={(event) =>
                  props.onSetScene("ambientAudio", event.target.value || undefined)
                }
                aria-label="Ambience layers"
              />
              <div className="button-row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="button button-text"
                  disabled={scene.ambientAudio === undefined}
                  onClick={() => props.onSetScene("ambientAudio", undefined)}
                >
                  Inherit from previous scene
                </button>
              </div>
              <small className="inspector-note">
                Combine a synth preset and recorded loops with <code>+</code> (e.g.{" "}
                <code>rain+file:/film/sfx/amb-city-traffic.mp3</code>).
              </small>
            </section>
          </div>
        )}

        {currentTab === "clip" && (
          <>
            <section className="inspector-section picture-section">
              <SectionTitle
                number="01"
                title="Picture"
                status={beat.gap ? "BLACK GAP" : frame.carried ? "CARRIED" : "OWN FRAME"}
              />
              <div className="picture-current">
                {beat.gap ? (
                  <div className="picture-empty is-gap-thumb">
                    <span>GAP · BLACK</span>
                  </div>
                ) : props.pictureSrc && !props.pictureSrc.startsWith("gradient:") && !props.pictureSrc.startsWith("emoji:") ? (
                  <img src={props.pictureSrc} alt="Current keyframe picture" />
                ) : frame.picture?.startsWith("gradient:") ? (
                  <div className="picture-empty" style={{ background: frame.picture.slice(9) }}>
                    <span>NO PICTURE</span>
                  </div>
                ) : (
                  <div className="picture-empty">
                    <span>NO LINKED PICTURE</span>
                  </div>
                )}
                <div className="picture-current-meta">
                  <strong>
                    {beat.gap
                      ? "Gap · drop a picture"
                      : pictureLabel(frame.picture, false, "No picture")}
                  </strong>
                  <small>
                    {beat.gap
                      ? "Black gap — drop from Bin or click Choose… (Delete closes gap)"
                      : frame.pictureSource === "scene"
                        ? "Scene plate"
                        : frame.carried
                          ? "Inherited from previous clip"
                          : "Clip picture"}
                  </small>
                </div>
              </div>
              <div className="picture-actions">
                <button className="button button-primary" onClick={() => props.onBrowse("image", "picture")}>
                  Choose…
                </button>
                <button className="button button-quiet" onClick={() => props.onUpload("image", "picture")}>
                  Upload…
                </button>
                <button
                  className="button button-text"
                  onClick={() => props.onSetPicture(undefined)}
                  disabled={!beat.background}
                >
                  Remove picture
                </button>
              </div>
            </section>

            <section className="inspector-section action-section">
              <SectionTitle number="02" title="Clip" status={`+${localFrame}f / ${clipDurationFrames}f`} />
              <div className="keyframe-actions">
                <button
                  className="button button-quiet"
                  onClick={props.onSplit}
                  disabled={!props.canSplit}
                  title={props.selectedCaptionIndices?.length ? "Split selected caption at playhead (S)" : "Split clip at playhead (S)"}
                >
                  ✂ {props.selectedCaptionIndices?.length ? "Split CC" : "Split"} (S)
                </button>
                <button className="button button-quiet" onClick={props.onInsert}>
                  ＋ Add after
                </button>
                <button className="button button-quiet" onClick={props.onDuplicate}>
                  Duplicate
                </button>
                {props.onMergeFrames && (
                  <button
                    type="button"
                    className="button button-quiet"
                    data-testid="inspector-merge-frames-btn"
                    onClick={props.onMergeFrames}
                    disabled={!props.canMergeFrames}
                    title="Merge frames: keeps first image, removes second image, and makes one clip"
                  >
                    Merge frames
                  </button>
                )}
                <button
                  className="button button-quiet danger-quiet"
                  data-testid="inspector-delete-clip-btn"
                  onClick={(e) =>
                    props.onDeleteClip
                      ? props.onDeleteClip(e.shiftKey)
                      : props.onExecuteDelete
                        ? props.onExecuteDelete(e.shiftKey)
                        : props.onDelete()
                  }
                  title="Delete lifts picture to black gap (or removes gap completely); Shift+Click ripple-deletes shot & anchored sounds"
                >
                  {beat.gap ? "Delete gap" : "Delete"}
                </button>
              </div>
              <div className="move-actions">
                <button onClick={() => props.onMove(-1)}>↑ Move earlier</button>
                <button onClick={() => props.onMove(1)}>↓ Move later</button>
              </div>
            </section>

            <CaptionInspectorSection
              frame={frame}
              clipDurationFrames={clipDurationFrames}
              selectedCaptionIndices={props.selectedCaptionIndices}
              canMergeCaptions={Boolean(props.canMergeCaptions)}
              onSelectCaptionIndex={props.onSelectCaptionIndex}
              onCommitCaptions={props.onCommitCaptions}
              onResetCaptions={props.onResetCaptions}
              onMergeCaptions={props.onMergeCaptions}
            />

            <section className="inspector-section animation-section" data-testid="inspector-animation">
              <SectionTitle
                number="03"
                title="Animation"
                status={animated ? "KEYFRAMED" : hasPlain ? "PLAIN" : "STILL"}
              />
              <div className="anim-preset-toolbar">
                <div className="anim-preset-dropdown" ref={presetMenuWrapRef}>
                  <button
                    type="button"
                    className={`field-reset anim-preset-btn ${presetMenuOpen ? "is-active-pill" : ""}`}
                    data-testid="start-from-preset-btn"
                    disabled={Boolean(beat.gap)}
                    aria-expanded={presetMenuOpen}
                    onClick={() => setPresetMenuOpen((open) => !open)}
                    title="Write a camera preset or depth move's keyframes onto this shot as an editable starting point"
                  >
                    <span>Start from preset</span>
                    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                      <path
                        d="M2,3.5 L5,6.8 L8,3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {presetMenuOpen && (
                    <div
                      className="anim-preset-menu"
                      data-testid="start-from-preset-menu"
                      role="menu"
                    >
                      {authoredMoveLabel && (
                        <button
                          type="button"
                          role="menuitem"
                          data-testid="preset-option-authored"
                          onClick={() =>
                            applyStarterPreset("authored", `Shot move (${authoredMoveLabel})`)
                          }
                        >
                          Shot move: {authoredMoveLabel}
                        </button>
                      )}
                      {STARTER_PRESET_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitem"
                          data-testid={`preset-option-${opt.id}`}
                          onClick={() => applyStarterPreset(opt.id, opt.label)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {props.onConvertAllToKeyframes && (
                  <button
                    type="button"
                    className="field-reset anim-convert-all-btn"
                    data-testid="convert-all-keyframes-btn"
                    onClick={props.onConvertAllToKeyframes}
                    title="Convert every un-keyframed preset or depth move in this project into editable keyframes (single undo step)"
                  >
                    Convert all to keyframes
                  </button>
                )}
              </div>
              <div className="anim-section-bar">
                <span>
                  Clip frame <strong>+{localFrame}f</strong> / {Math.max(0, clipDurationFrames - 1)}f
                </span>
                <div className="anim-jump-btns">
                  {props.onToggleKenBurns && (
                    <button
                      type="button"
                      className={`field-reset ${props.kenBurnsActive ? "is-active-pill" : ""}`}
                      data-testid="inspector-ken-burns-btn"
                      disabled={Boolean(beat.gap || !frame.picture)}
                      onClick={props.onToggleKenBurns}
                      title="Draw or edit 16:9 START and END Ken Burns boxes on the picture"
                    >
                      Ken Burns
                    </button>
                  )}
                  <button
                    type="button"
                    className="field-reset"
                    onClick={() => props.onJumpToLocalFrame(0)}
                    title="Jump playhead to clip start (frame 0)"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="field-reset"
                    data-testid="anim-prev-key-btn"
                    onClick={() => props.onJumpPrevKeyframe?.()}
                    title="Previous keyframe on clip ([)"
                  >
                    [ Prev
                  </button>
                  <button
                    type="button"
                    className="field-reset"
                    data-testid="anim-next-key-btn"
                    onClick={() => props.onJumpNextKeyframe?.()}
                    title="Next keyframe on clip (])"
                  >
                    Next ]
                  </button>
                  <button
                    type="button"
                    className="field-reset"
                    onClick={() => props.onJumpToLocalFrame(Math.max(0, clipDurationFrames - 1))}
                    title="Jump playhead to clip end"
                  >
                    End
                  </button>
                  {(animated || hasPlain || Boolean(animation?.kenBurns)) && (
                    <button
                      type="button"
                      className="field-reset"
                      onClick={() => props.onSetAnimation(undefined, "Animation reset")}
                      title="Clear all animation keyframes and plain framing values on this clip"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>

              {ANIM_PROPS.map((prop) => {
                const meta = ANIM_PROP_META[prop];
                return (
                  <AnimationChannelControl
                    key={prop}
                    prop={prop}
                    label={meta.label}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    decimals={meta.decimals}
                    suffix={meta.suffix}
                    value={pose[prop]}
                    pose={pose}
                    hasPicture={!beat.gap && Boolean(frame.picture)}
                    hasDepthMap={hasDepthMap}
                    localFrame={localFrame}
                    animation={animation}
                    onSetAnimation={props.onSetAnimation}
                    onPreviewAnimation={props.onPreviewAnimation}
                    onOpenCurveEditor={() => props.onOpenCurveEditor?.(prop)}
                    onEdgeClamped={props.onEdgeClamped}
                    onDragStart={props.onDragStart}
                    onDragEnd={props.onDragEnd}
                  />
                );
              })}
              <p className="preview-only-note">
                {animated
                  ? "Keyframes active: evaluated directly by frame. Expand clip lanes or click the curve icon to edit curves."
                  : "Still picture: add keyframes on any channel or choose Start from preset above."}
              </p>
            </section>

            <details className="inspector-details">
              <summary>
                <SectionTitle number="04" title="Camera & effects" status="SCARLET REEL" />
              </summary>
              <div className="effect-intro">
                Controls mirror the vendored Scarlet Reel cinematic settings. Click the preview to place the focal point.
              </div>
              <div className="button-row copy-effects">
                <button
                  type="button"
                  className="button button-quiet"
                  data-testid="effects-section-copy-btn"
                  onClick={props.onCopyEffects}
                >
                  ⧉ Copy effects
                </button>
                <button
                  type="button"
                  className={`button button-quiet ${props.copied ? "is-active" : ""}`}
                  data-testid="effects-section-paste-btn"
                  disabled={!props.copied}
                  onClick={props.onPasteEffects}
                >
                  ↳ Paste effects
                </button>
              </div>
              {CINEMATIC_GROUPS.map((group) => (
                <details className="effect-group" key={group.id} open={group.id === "camera" || group.id === "depth"}>
                  <summary>
                    {group.label}
                    <span>{group.fields.length} fields</span>
                  </summary>
                  {group.id === "look" && props.selectedCount > 1 && (
                    <p className="preview-only-note" data-testid="bulk-grade-hint">
                      Grade and texture changes apply to all selected image frames.
                    </p>
                  )}
                  {group.id === "depth" && (() => {
                    const depthInfo = extractKeyframeDepthInfo(frame);
                    const hasOpenSlot = depthInfo.cutoutSlots.some((s) => !s || !s.image);
                    return (
                      <div className="inspector-cutout-layers" data-testid="inspector-cutout-layers">
                        <div className="inspector-cutout-layers-head">
                          <span>Cutout layers ({depthInfo.activeCutouts.length}/{MAX_DEPTH_CUTOUTS})</span>
                          <div className="inspector-cutout-layers-actions">
                            <button
                              type="button"
                              className="button button-quiet"
                              data-testid="inspector-add-cutout-btn"
                              disabled={!hasOpenSlot}
                              onClick={() => props.onBrowse("image", "cutout:add")}
                            >
                              + Choose
                            </button>
                            <button
                              type="button"
                              className="button button-quiet"
                              data-testid="inspector-upload-cutout-btn"
                              disabled={!hasOpenSlot}
                              onClick={() => props.onUpload("image", "cutout:add")}
                            >
                              ↑ Upload
                            </button>
                          </div>
                        </div>
                        {depthInfo.activeCutouts.length === 0 ? (
                          <p className="inspector-note">
                            No cutout layers on this shot. Drop PNGs onto the Cutouts timeline lane or click + Choose.
                          </p>
                        ) : (
                          depthInfo.cutoutSlots.map((slot, idx) => {
                            if (!slot || !slot.image) return null;
                            const color = CUTOUT_LAYER_COLORS[idx] ?? CUTOUT_LAYER_COLORS[0];
                            return (
                              <div
                                key={`inspector-cutout-${idx}`}
                                className="inspector-cutout-row"
                                data-testid={`inspector-cutout-row-${idx}`}
                              >
                                <div className="inspector-cutout-row-top">
                                  <span className="kf-sublane-dot" style={{ background: color }} />
                                  <strong title={slot.image}>
                                    L{idx + 1} · {depthAssetLabel(slot.image)}
                                  </strong>
                                  <button
                                    type="button"
                                    className="field-reset"
                                    onClick={() => props.onBrowse("image", `cutout:${idx}`)}
                                  >
                                    SWAP
                                  </button>
                                  <button
                                    type="button"
                                    className="field-reset"
                                    data-testid={`inspector-remove-cutout-${idx}`}
                                    onClick={() => {
                                      const nextSlots = [...depthInfo.cutoutSlots];
                                      nextSlots[idx] = null;
                                      props.onSetEffect(
                                        "cinematic.depthCutouts",
                                        serializeCutoutSlots(nextSlots),
                                      );
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="inspector-cutout-depth-line">
                                  <span>Depth</span>
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    aria-label={`Cutout ${idx + 1} depth`}
                                    data-testid={`inspector-cutout-depth-${idx}`}
                                    value={slot.depth ?? defaultDepthForCutoutLayer(idx)}
                                    onChange={(e) => {
                                      const nextSlots = [...depthInfo.cutoutSlots];
                                      nextSlots[idx] = {
                                        ...slot,
                                        depth: Number(e.target.value),
                                      };
                                      props.onSetEffect(
                                        "cinematic.depthCutouts",
                                        serializeCutoutSlots(nextSlots),
                                      );
                                    }}
                                  />
                                  <output>{slot.depth.toFixed(2)}</output>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                  <div className="effect-fields">
                    {group.fields.map((field) => (
                      <EffectField
                        key={field.key}
                        field={field}
                        value={getEffectValue(frame, `cinematic.${field.key}`)}
                        onChange={(value) => props.onSetEffect(`cinematic.${field.key}`, value)}
                        onReset={() => props.onResetEffect(`cinematic.${field.key}`)}
                        onBrowse={() =>
                          props.onBrowse(
                            "image",
                            field.key === "depthMap"
                              ? "depthMap"
                              : field.key === "depthPlate"
                                ? "depthPlate"
                                : "foregroundImage",
                          )
                        }
                        jsonError={jsonError}
                        setJsonError={setJsonError}
                      />
                    ))}
                  </div>
                </details>
              ))}
              <div className="effect-group particle-group">
                <div className="particle-group-head">
                  <span>Particles</span>
                  <small>Beat override</small>
                </div>
                <FieldSelect
                  label="Kind"
                  value={String(beat.particles ?? scene.particles ?? "none")}
                  options={PARTICLES}
                  onChange={(value) => props.onSetBeat("particles", value)}
                />
                <FieldNumber
                  label="Density"
                  value={Number((beat.particleConfig ?? scene.particleConfig)?.density ?? 1)}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={(value) => props.onSetBeat("particleConfig.density", value)}
                />
                <FieldNumber
                  label="Opacity"
                  value={Number((beat.particleConfig ?? scene.particleConfig)?.opacity ?? 1)}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => props.onSetBeat("particleConfig.opacity", value)}
                />
                <FieldNumber
                  label="Wind"
                  value={Number((beat.particleConfig ?? scene.particleConfig)?.wind ?? 1)}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(value) => props.onSetBeat("particleConfig.wind", value)}
                />
              </div>
              <div className="effect-group particle-group">
                <div className="particle-group-head">
                  <span>Transition & hold</span>
                  <small>Beat timing</small>
                </div>
                <FieldSelect
                  label="Transition"
                  value={mapTransitionKind(beat.backgroundTransition)}
                  options={TRANSITIONS}
                  onChange={(value) => {
                    const wasCut = mapTransitionKind(beat.backgroundTransition) === "cut";
                    props.onSetBeat("backgroundTransition", value);
                    if (value === "cut") {
                      props.onSetBeat("transitionUserAdded", undefined);
                      props.onSetBeat("backgroundTransitionAlign", undefined);
                    } else if (wasCut) {
                      props.onSetBeat("transitionUserAdded", true);
                    }
                  }}
                />
                {Boolean(beat.transitionUserAdded) && mapTransitionKind(beat.backgroundTransition) !== "cut" && (
                  <FieldSelect
                    label="Placement"
                    value={beat.backgroundTransitionAlign === "centred" ? "centred" : "at-cut"}
                    options={["at-cut", "centred"]}
                    onChange={(value) =>
                      props.onSetBeat("backgroundTransitionAlign", value === "centred" ? "centred" : undefined)
                    }
                  />
                )}
                <FieldNumber
                  label="Transition speed"
                  value={Number(beat.backgroundTransitionSpeed ?? 0.5)}
                  min={0}
                  max={5}
                  step={0.05}
                  onChange={(value) => props.onSetBeat("backgroundTransitionSpeed", value)}
                  suffix="s"
                />
                <FieldNumber
                  label="Hold time"
                  value={Number(beat.holdSeconds ?? 0)}
                  min={0}
                  max={90}
                  step={0.1}
                  onChange={(value) => props.onSetBeat("holdSeconds", value)}
                  suffix="s"
                />
                <FieldToggle
                  label="Hold this picture"
                  checked={beat.backgroundHold !== false}
                  onChange={(value) => props.onSetBeat("backgroundHold", value)}
                />
                <FieldToggle
                  label="Revert to scene plate"
                  checked={Boolean(beat.backgroundRevert)}
                  onChange={(value) => props.onSetBeat("backgroundRevert", value)}
                />
              </div>
              <div className="button-row copy-effects">
                <button className="button button-quiet" onClick={props.onCopyEffects}>
                  ⧉ Copy effects
                </button>
                <button
                  className="button button-quiet"
                  disabled={!props.copied}
                  onClick={props.onPasteEffects}
                >
                  ↳ Paste effects
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={!animated}
                  onClick={props.onCopyAnimation}
                >
                  Copy animation
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={!props.copiedAnimation}
                  onClick={props.onPasteAnimation}
                >
                  Paste animation
                </button>
              </div>
              <p className="preview-only-note">
                Framing extensions, vignette and grain controls are editor-side additions and are marked preview-only in the
                export report.
              </p>
            </details>

            <details className="inspector-details">
              <summary>
                <SectionTitle number="05" title="Scene group" status={frame.mark} />
              </summary>
              <label className="control-label">Scene heading</label>
              <textarea
                className="inspector-textarea"
                value={String(scene.prose || "")}
                onChange={(event) => props.onSetScene("prose", event.target.value)}
                rows={3}
              />
              <div className="control-row">
                <span className="control-label">Scene plate</span>
                <button className="button button-text" onClick={() => props.onBrowse("image", "scenePicture")}>
                  Choose
                </button>
              </div>
              <input
                className="text-control"
                aria-label="Scene background path"
                value={String(scene.background || "")}
                onChange={(event) => props.onSetScene("background", event.target.value)}
              />
              {soundSources.length > 0 && (
                <p className="inspector-note">
                  {soundSources.length} imported/uploaded sound files in the project library.
                </p>
              )}
            </details>
          </>
        )}
      </div>
    </aside>
  );
}

function fileNameOnly(ref: string): string {
  return ref.split(/[\\/]/).pop() || ref;
}

function AnimationChannelControl({
  prop,
  label,
  min,
  max,
  step,
  decimals,
  suffix,
  value,
  pose,
  hasPicture,
  hasDepthMap,
  localFrame,
  animation,
  onSetAnimation,
  onPreviewAnimation,
  onOpenCurveEditor,
  onEdgeClamped,
  onDragStart,
  onDragEnd,
}: {
  prop: AnimProp;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  suffix: string;
  value: number;
  pose: EvaluatedPose;
  hasPicture: boolean;
  hasDepthMap?: boolean;
  localFrame: number;
  animation: BeatAnimation | undefined;
  onSetAnimation: (animation: BeatAnimation | undefined, label: string) => void;
  onPreviewAnimation: (animation: BeatAnimation | undefined) => void;
  onOpenCurveEditor?: () => void;
  onEdgeClamped?: () => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}) {
  const draggingRef = useRef(false);
  const keys = animation?.[prop] ?? [];
  const keyAtFrame = keys.find((k) => k.frame === localFrame);

  return (
    <div className="anim-channel-row" data-testid={`anim-row-${prop}`}>
      <div className="anim-channel-head">
        <button
          type="button"
          className={`anim-diamond-btn ${keyAtFrame ? "is-active" : ""}`}
          data-testid={`anim-diamond-${prop}`}
          aria-label={
            keyAtFrame
              ? `Remove ${label} keyframe at frame ${localFrame}`
              : `Add ${label} keyframe at frame ${localFrame}`
          }
          title={
            keyAtFrame
              ? `Remove ${label} keyframe at +${localFrame}f`
              : `Add ${label} keyframe at +${localFrame}f`
          }
          onClick={() =>
            onSetAnimation(
              toggleKeyAtFrame(animation, prop, localFrame, value, "linear"),
              keyAtFrame ? `${label} keyframe removed` : `${label} keyframe added`,
            )
          }
        >
          <i className={`diamond-shape ${keyAtFrame ? "is-filled" : "is-hollow"}`} aria-hidden="true" />
        </button>
        <span className="control-label">
          {label}
          {keys.length > 0 && <small className="field-extension">{keys.length}</small>}
        </span>
        <output className="anim-readout">
          {value.toFixed(decimals)}
          {suffix}
        </output>
        <select
          className="anim-easing-select"
          data-testid={`anim-easing-${prop}`}
          aria-label={`${label} easing`}
          disabled={!keyAtFrame}
          value={keyAtFrame?.easing ?? "linear"}
          title={keyAtFrame ? `${label} easing from +${localFrame}f` : "Place playhead on a keyframe to set easing"}
          onChange={(event) => {
            const nextEasing = event.target.value as KeyEasing;
            onSetAnimation(
              setKeyEasingAtFrame(animation, prop, localFrame, nextEasing),
              `${label} easing set to ${nextEasing}`,
            );
            if (nextEasing === "bezier") {
              onOpenCurveEditor?.();
            }
          }}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {easing}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="anim-curve-open-btn"
          data-testid={`inspector-open-curve-${prop}`}
          title={`Open ${label} in Curve Editor`}
          onClick={() => onOpenCurveEditor?.()}
        >
          <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1,8.5 C4,8.5 6,1.5 9,1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <input
        type="range"
        className="anim-slider"
        data-testid={`anim-slider-${prop}`}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => {
          draggingRef.current = true;
          onDragStart();
        }}
        onPointerUp={() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            onDragEnd(`${label} keyframe updated`);
          }
        }}
        onPointerCancel={() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            onDragEnd(`${label} keyframe updated`);
          }
        }}
        onChange={(event) => {
          const rawVal = Number(event.target.value);
          let next: BeatAnimation | undefined;
          if (
            hasPicture &&
            !hasDepthMap &&
            (prop === "zoom" || prop === "x" || prop === "y" || prop === "rotation")
          ) {
            const candidate = {
              zoom: prop === "zoom" ? rawVal : pose.zoom,
              x: prop === "x" ? rawVal : pose.x,
              y: prop === "y" ? rawVal : pose.y,
              rotation: prop === "rotation" ? rawVal : pose.rotation,
            };
            const clamped = clampPoseToPictureEdges(candidate);
            if (clamped.clamped) {
              onEdgeClamped?.();
            }
            const patch: Partial<Pick<EvaluatedPose, "zoom" | "x" | "y" | "rotation">> = {
              [prop]: clamped[prop],
            };
            if (Math.abs(clamped.zoom - pose.zoom) > 1e-6) patch.zoom = clamped.zoom;
            if (Math.abs(clamped.x - pose.x) > 1e-5) patch.x = clamped.x;
            if (Math.abs(clamped.y - pose.y) > 1e-5) patch.y = clamped.y;
            next = applyPoseAtPlayhead(animation, localFrame, patch, "linear");
          } else {
            next = setSliderValueAtFrame(animation, prop, localFrame, rawVal, "linear");
          }
          const commitLabel = keys.length > 0 ? `${label} keyframe updated` : `${label} updated`;
          if (draggingRef.current) onPreviewAnimation(next);
          else onSetAnimation(next, commitLabel);
        }}
      />
    </div>
  );
}

function SectionTitle({ number, title, status }: { number: string; title: string; status?: string }) {
  return (
    <span className="section-title">
      <i>{number}</i>
      <b>{title}</b>
      {status && <small>{status}</small>}
    </span>
  );
}

function EffectField({
  field,
  value,
  onChange,
  onReset,
  onBrowse,
  jsonError,
  setJsonError,
}: {
  field: CinematicField;
  value: unknown;
  onChange: (value: unknown) => void;
  onReset: () => void;
  onBrowse: () => void;
  jsonError: string;
  setJsonError: (value: string) => void;
}) {
  const label = (
    <span className="control-label">
      {field.label}
      {field.extension && <small className="field-extension">EXT</small>}
    </span>
  );
  const reset = (
    <button className="field-reset" onClick={onReset} title={`Reset ${field.label} to imported value`}>
      RESET
    </button>
  );
  if (field.kind === "boolean") {
    return (
      <div className="field-line">
        <div>
          {label}
          <small className="field-help">{field.key}</small>
        </div>
        <button
          className={`toggle ${value ? "is-on" : ""}`}
          onClick={() => onChange(!value)}
          aria-label={field.label}
          data-testid={`effect-${field.key}`}
        />
        <>{reset}</>
      </div>
    );
  }
  if (field.kind === "number") {
    return (
      <div className="effect-field">
        <div className="field-line">
          <div>
            {label}
            <small className="field-help">{field.key}</small>
          </div>
          <output>
            {value === undefined
              ? "—"
              : `${Number(value).toFixed(field.step && field.step < 0.1 ? 2 : 1)}${
                  field.key.toLowerCase().includes("duration") || field.key.toLowerCase().includes("seconds")
                    ? "s"
                    : ""
                }`}
          </output>
          {reset}
        </div>
        <input
          data-testid={`effect-${field.key}`}
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 0.1}
          value={Number(value ?? field.min ?? 0)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <div className="field-line">
        <div>
          {label}
          <small className="field-help">{field.key}</small>
        </div>
        <select
          data-testid={`effect-${field.key}`}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option || "None"}
            </option>
          ))}
        </select>
        {reset}
      </div>
    );
  }
  if (field.kind === "json") {
    return (
      <div className="effect-field json-effect-field">
        <div className="field-line">
          <div>
            {label}
            <small className="field-help">{field.key}</small>
          </div>
          {reset}
        </div>
        <textarea
          data-testid={`effect-${field.key}`}
          defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)}
          key={`${field.key}-${JSON.stringify(value)}`}
          placeholder="[]"
          rows={3}
          onChange={(event) => {
            try {
              onChange(event.target.value ? JSON.parse(event.target.value) : undefined);
              setJsonError("");
            } catch {
              setJsonError(`Invalid JSON in ${field.label}.`);
            }
          }}
        />
        {jsonError && <small className="field-error">{jsonError}</small>}
      </div>
    );
  }
  if (field.kind === "image") {
    return (
      <div className="effect-field">
        <div className="field-line">
          <div>
            {label}
            <small className="field-help">{field.key}</small>
          </div>
          {reset}
        </div>
        <div className="media-field">
          <input
            data-testid={`effect-${field.key}`}
            value={String(value || "")}
            onChange={(event) => onChange(event.target.value || undefined)}
            placeholder="No media assigned"
          />
          <button onClick={onBrowse}>Browse</button>
        </div>
      </div>
    );
  }
  if (field.kind === "color") {
    const hex = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#e8a24a";
    return (
      <div className="field-line">
        <div>
          {label}
          <small className="field-help">{field.key}</small>
        </div>
        <input
          type="color"
          data-testid={`effect-${field.key}`}
          value={hex}
          onChange={(event) => onChange(event.target.value)}
        />
        {reset}
      </div>
    );
  }
  return (
    <div className="field-line">
      <div>
        {label}
        <small className="field-help">{field.key}</small>
      </div>
      <input
        className="text-control"
        data-testid={`effect-${field.key}`}
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {reset}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="field-number">
      <label>{label}</label>
      <div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>
          {value.toFixed(step < 0.1 ? 2 : 1)}
          {suffix}
        </output>
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-line">
      <span className="control-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function FieldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field-line">
      <span className="control-label">{label}</span>
      <button
        className={`toggle ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
        aria-label={label}
      />
    </div>
  );
}

function CaptionInspectorSection({
  frame,
  clipDurationFrames,
  selectedCaptionIndices,
  canMergeCaptions,
  onSelectCaptionIndex,
  onCommitCaptions,
  onResetCaptions,
  onMergeCaptions,
}: {
  frame: Keyframe;
  clipDurationFrames: number;
  selectedCaptionIndices?: number[];
  canMergeCaptions: boolean;
  onSelectCaptionIndex?: (index: number, extendNeighbour: boolean) => void;
  onCommitCaptions?: (
    captions: BeatCaption[],
    label: string,
    nextSelectedIndices?: number[],
  ) => void;
  onResetCaptions?: () => void;
  onMergeCaptions?: () => void;
}) {
  const beat = frame.beat;
  const authored = hasAuthoredCaptions(beat);
  const captions = effectiveCaptionsForBeat(beat, clipDurationFrames);
  const differsFromRecorded = captionsDifferFromRecordedLine(beat, clipDurationFrames);
  const nextGapList = addCaptionInGap(beat, clipDurationFrames);

  return (
    <section
      className="inspector-section caption-inspector-section"
      data-testid="inspector-caption-section"
    >
      <SectionTitle
        number="CC"
        title="Caption"
        status={authored ? "EDITED" : "DEFAULT"}
      />

      <div className="caption-speaker-row">
        <span className="control-label">Speaker</span>
        <output
          className="caption-speaker-readonly"
          data-testid="caption-speaker-readonly"
        >
          {frame.speaker || "Narrator"}
        </output>
      </div>

      {differsFromRecorded && (
        <div
          className="caption-recorded-warning"
          data-testid="caption-recorded-mismatch"
          role="status"
        >
          Differs from the recorded line
        </div>
      )}

      {captions.length === 0 ? (
        <div className="caption-empty-note" data-testid="inspector-caption-empty">
          No caption shown on this shot.
        </div>
      ) : (
        <div className="caption-inspector-list">
          {captions.map((cap, idx) => {
            const metrics = captionMetrics(cap);
            const isSelected = Boolean(selectedCaptionIndices?.includes(idx));
            return (
              <div
                key={`insp-cap-${frame.id}-${idx}`}
                className={`caption-inspector-card ${isSelected ? "is-selected" : ""} ${metrics.tooFast ? "is-too-fast" : ""}`}
                data-testid={`inspector-caption-card-${idx}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("textarea, input, button")) return;
                  onSelectCaptionIndex?.(idx, e.shiftKey || e.ctrlKey || e.metaKey);
                }}
              >
                <div className="caption-card-head">
                  <button
                    type="button"
                    className={`caption-card-select ${isSelected ? "is-selected" : ""}`}
                    onClick={(e) =>
                      onSelectCaptionIndex?.(idx, e.shiftKey || e.ctrlKey || e.metaKey)
                    }
                    title="Click to select caption (Shift+click neighbour to merge)"
                  >
                    #{idx + 1} · {metrics.durationSeconds.toFixed(2)}s
                  </button>
                  <div className="caption-card-badges">
                    {metrics.overTwoLines && (
                      <span className="caption-flag is-lines" title="Needs more than 2 lines (~42 chars/line)">
                        {metrics.lineCount} lines
                      </span>
                    )}
                    {metrics.tooFast && (
                      <span className="caption-flag is-cps" title="More than 17 chars/sec — too fast to read">
                        {metrics.cps.toFixed(1)} c/s
                      </span>
                    )}
                    <button
                      type="button"
                      className="field-reset"
                      data-testid={`inspector-caption-delete-${idx}`}
                      onClick={() => {
                        const remaining = captions.filter((_, i) => i !== idx);
                        onCommitCaptions?.(remaining, "Caption deleted", []);
                      }}
                      title="Delete this caption"
                    >
                      DELETE
                    </button>
                  </div>
                </div>

                <CaptionTextBox
                  index={idx}
                  value={cap.text}
                  onCommit={(nextText) => {
                    const nextCaps = updateCaptionText(
                      beat,
                      clipDurationFrames,
                      idx,
                      nextText,
                    );
                    onCommitCaptions?.(nextCaps, "Caption edited", [idx]);
                  }}
                  onSplit={(cursorOffset, draftText) => {
                    const result = splitCaptionAtCursor(
                      beat,
                      clipDurationFrames,
                      idx,
                      cursorOffset,
                      draftText,
                    );
                    onCommitCaptions?.(
                      result.captions,
                      result.didSplit ? "Caption split" : "Caption edited",
                      result.didSplit ? [idx + 1] : [idx],
                    );
                  }}
                />

                <div className="caption-timecodes-row">
                  <CaptionTimecodeInput
                    label="In"
                    testId={`inspector-caption-in-${idx}`}
                    frames={cap.inFrame}
                    onCommitFrame={(nextIn) => {
                      const nextCaps = setCaptionRange(
                        beat,
                        clipDurationFrames,
                        idx,
                        nextIn,
                        cap.outFrame,
                      );
                      onCommitCaptions?.(nextCaps, "Caption in-point updated", [idx]);
                    }}
                  />
                  <CaptionTimecodeInput
                    label="Out"
                    testId={`inspector-caption-out-${idx}`}
                    frames={cap.outFrame}
                    onCommitFrame={(nextOut) => {
                      const nextCaps = setCaptionRange(
                        beat,
                        clipDurationFrames,
                        idx,
                        cap.inFrame,
                        nextOut,
                      );
                      onCommitCaptions?.(nextCaps, "Caption out-point updated", [idx]);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="caption-inspector-actions">
        {captions.length >= 2 && (
          <button
            type="button"
            className="button button-quiet"
            data-testid="inspector-merge-captions-btn"
            disabled={!canMergeCaptions}
            onClick={() => onMergeCaptions?.()}
            title={
              canMergeCaptions
                ? "Merge the two selected neighbouring captions"
                : "Shift+click two neighbouring captions in this clip to merge"
            }
          >
            Merge
          </button>
        )}
        {nextGapList && (
          <button
            type="button"
            className="button button-quiet"
            data-testid="inspector-add-caption-btn"
            onClick={() =>
              onCommitCaptions?.(nextGapList, "Caption added", [
                Math.max(0, nextGapList.length - 1),
              ])
            }
          >
            ＋ Add caption
          </button>
        )}
        <button
          type="button"
          className="button button-text"
          data-testid="reset-caption-btn"
          disabled={!authored}
          onClick={() => onResetCaptions?.()}
        >
          Reset caption
        </button>
      </div>
    </section>
  );
}

function CaptionTextBox({
  index,
  value,
  onCommit,
  onSplit,
}: {
  index: number;
  value: string;
  onCommit: (nextText: string) => void;
  onSplit: (cursorOffset: number, draftText: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <textarea
      className="inspector-textarea caption-card-textarea"
      aria-label={`Caption ${index + 1} text`}
      data-testid={`inspector-caption-text-${index}`}
      rows={2}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const cursor = e.currentTarget.selectionStart ?? draft.length;
          onSplit(cursor, draft);
        }
      }}
    />
  );
}

function CaptionTimecodeInput({
  label,
  testId,
  frames,
  onCommitFrame,
}: {
  label: string;
  testId: string;
  frames: number;
  onCommitFrame: (nextFrame: number) => void;
}) {
  const formatted = formatTimecode(frames);
  const [draft, setDraft] = useState(formatted);

  useEffect(() => {
    setDraft(formatTimecode(frames));
  }, [frames]);

  const commit = () => {
    const parsed = parseCaptionTimecode(draft);
    if (parsed === null) {
      setDraft(formatted);
      return;
    }
    if (parsed !== frames) {
      onCommitFrame(parsed);
    } else {
      setDraft(formatted);
    }
  };

  return (
    <label className="caption-tc-field">
      <span>
        {label} <i>({frames}f)</i>
      </span>
      <input
        type="text"
        className="text-control caption-tc-input"
        aria-label={`Caption ${label} timecode`}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(formatted);
          }
        }}
      />
    </label>
  );
}

const LANE_TITLES: Record<AudioLaneId, { title: string; chooseLabel: string }> = {
  voice: { title: "Voice clip", chooseLabel: "Choose voice…" },
  sfx: { title: "Sound effect clip", chooseLabel: "Choose sound…" },
  music: { title: "Music clip", chooseLabel: "Choose music…" },
  ambience: { title: "Ambience clip", chooseLabel: "Choose ambience…" },
};

function FreeAudioClipTabPanel({
  lane,
  frame,
  resolvedAudioClips,
  selectedAudioClipIds,
  playheadMs,
  duckDepth,
  onSetDuckDepth,
  onSelectAudioClipId,
  onBrowse,
  onUpload,
  onCommitAudioClipPatch,
  onMoveAudioClipStartMs,
  onAddAudioClipOnLane,
  onPreviewAudioClip,
  onExecuteDelete,
  onRebuildSoundFromFilm,
}: {
  lane: AudioLaneId;
  frame: Keyframe;
  resolvedAudioClips: ResolvedAudioClip[];
  selectedAudioClipIds: string[];
  playheadMs: number;
  duckDepth: number;
  onSetDuckDepth?: (depth: number) => void;
  onSelectAudioClipId?: (clipId: string) => void;
  onBrowse: (kind: "image" | "audio", target: BrowseMediaTarget) => void;
  onUpload: (kind: "image" | "audio", target: UploadMediaTarget) => void;
  onCommitAudioClipPatch?: (clipId: string, patch: Partial<AudioClip>, label: string) => void;
  onMoveAudioClipStartMs?: (clipId: string, newStartMs: number) => void;
  onAddAudioClipOnLane?: (lane: AudioLaneId) => void;
  onPreviewAudioClip?: (clip: ResolvedAudioClip) => void;
  onExecuteDelete?: (ripple: boolean) => void;
  onRebuildSoundFromFilm?: () => void;
}) {
  const laneClips = resolvedAudioClips.filter((rc) => rc.lane === lane);
  const selectedOnLane = laneClips.find((rc) => selectedAudioClipIds.includes(rc.id));
  const atPlayheadOnLane = laneClips.find(
    (rc) => playheadMs >= rc.startMs && playheadMs < rc.endMs,
  );
  const anchoredOnLane = laneClips.find((rc) => rc.anchorId === frame.id);
  const active = selectedOnLane ?? atPlayheadOnLane ?? anchoredOnLane ?? null;
  const meta = LANE_TITLES[lane];

  return (
    <div className="inspector-audio-tab" data-testid={`inspector-panel-${lane}`}>
      <section className="inspector-section">
        <SectionTitle
          number="01"
          title={meta.title}
          status={active ? `${formatMsTimecode(active.startMs)}` : "NONE AT PLAYHEAD"}
        />

        {active ? (
          <>
            <div className="audio-file-card">
              <div className="audio-file-card-meta">
                <strong>{audioLabelFromSrc(active.src)}</strong>
                <small>{active.src}</small>
              </div>
              <button
                type="button"
                className="audio-preview-btn"
                onClick={() => onPreviewAudioClip?.(active)}
                aria-label={`Preview ${meta.title}`}
                title="Preview sound clip"
              >
                ▶
              </button>
            </div>

            <div className="picture-actions">
              <button
                type="button"
                className="button button-primary"
                data-testid={`choose-${lane}-btn`}
                onClick={() => {
                  onSelectAudioClipId?.(active.id);
                  onBrowse("audio", lane);
                }}
              >
                {meta.chooseLabel}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  onSelectAudioClipId?.(active.id);
                  onUpload("audio", lane);
                }}
              >
                Upload…
              </button>
              <button
                type="button"
                className="button button-quiet danger-quiet"
                onClick={() => {
                  onSelectAudioClipId?.(active.id);
                  onExecuteDelete?.(false);
                }}
              >
                Delete
              </button>
            </div>

            <label className="control-label">File path / source</label>
            <input
              className="text-control"
              aria-label={`${meta.title} path`}
              value={active.src}
              onChange={(e) =>
                onCommitAudioClipPatch?.(
                  active.id,
                  { src: e.target.value },
                  `${meta.title} source updated`,
                )
              }
            />
          </>
        ) : (
          <>
            <div className="audio-file-card">
              <div className="audio-file-card-meta">
                <strong>No {lane} clip selected here</strong>
                <small>
                  Click a clip on the {lane.toUpperCase()} lane or add a new {lane} clip at{" "}
                  {formatMsTimecode(playheadMs)}.
                </small>
              </div>
            </div>
            <div className="picture-actions">
              <button
                type="button"
                className="button button-primary"
                data-testid={`choose-${lane}-btn`}
                onClick={() => onBrowse("audio", lane)}
              >
                {meta.chooseLabel}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => onAddAudioClipOnLane?.(lane)}
              >
                ＋ Add clip here
              </button>
            </div>
          </>
        )}
      </section>

      {active && (
        <section className="inspector-section" data-testid="inspector-audio-timing">
          <SectionTitle
            number="02"
            title="Millisecond timing & mix"
            status={`${Math.round(active.startMs)} ms`}
          />

          <div className="audio-ms-readout-row" data-testid="inspector-audio-time-readout">
            <div>
              <span className="eyebrow">START TIME</span>
              <strong>{formatMsTimecode(active.startMs)}</strong>
              <small>{active.startMs.toFixed(1)} ms</small>
            </div>
            <div>
              <span className="eyebrow">ANCHOR SHOT</span>
              <strong>{active.anchorId}</strong>
              <small>
                {active.offsetMs >= 0 ? "+" : ""}
                {Math.round(active.offsetMs)} ms from cut
              </small>
            </div>
          </div>

          <div className="field-line">
            <span className="control-label">Start (ms)</span>
            <input
              type="number"
              className="text-control audio-ms-input"
              data-testid="inspector-audio-start-ms"
              step={1}
              min={0}
              value={Math.round(active.startMs * 100) / 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) {
                  onMoveAudioClipStartMs?.(active.id, v);
                }
              }}
            />
          </div>

          <div className="field-line">
            <span className="control-label">In trim (ms)</span>
            <input
              type="number"
              className="text-control audio-ms-input"
              data-testid="inspector-audio-in-ms"
              step={10}
              min={0}
              value={Math.round(active.inMs)}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value) || 0);
                onCommitAudioClipPatch?.(active.id, { inMs: v }, "Sound in-point updated");
              }}
            />
          </div>

          <div className="field-line">
            <span className="control-label">Duration (ms)</span>
            <input
              type="number"
              className="text-control audio-ms-input"
              data-testid="inspector-audio-duration-ms"
              step={10}
              min={MIN_AUDIO_CLIP_MS}
              value={Math.round(active.durationMs)}
              onChange={(e) => {
                const v = Math.max(MIN_AUDIO_CLIP_MS, Number(e.target.value) || MIN_AUDIO_CLIP_MS);
                onCommitAudioClipPatch?.(active.id, { durationMs: v }, "Sound duration updated");
              }}
            />
          </div>

          <FieldNumber
            label="Gain"
            value={active.gain}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) =>
              onCommitAudioClipPatch?.(active.id, { gain: value }, "Sound gain updated")
            }
          />

          <div className="field-line">
            <span className="control-label">Fade in (ms)</span>
            <input
              type="number"
              className="text-control audio-ms-input"
              data-testid="inspector-audio-fade-in-ms"
              step={50}
              min={0}
              max={Math.round(active.durationMs)}
              value={Math.round(active.fadeInMs)}
              onChange={(e) => {
                const v = Math.max(
                  0,
                  Math.min(active.durationMs - active.fadeOutMs, Number(e.target.value) || 0),
                );
                onCommitAudioClipPatch?.(active.id, { fadeInMs: v }, "Fade-in updated");
              }}
            />
          </div>

          <div className="field-line">
            <span className="control-label">Fade out (ms)</span>
            <input
              type="number"
              className="text-control audio-ms-input"
              data-testid="inspector-audio-fade-out-ms"
              step={50}
              min={0}
              max={Math.round(active.durationMs)}
              value={Math.round(active.fadeOutMs)}
              onChange={(e) => {
                const v = Math.max(
                  0,
                  Math.min(active.durationMs - active.fadeInMs, Number(e.target.value) || 0),
                );
                onCommitAudioClipPatch?.(active.id, { fadeOutMs: v }, "Fade-out updated");
              }}
            />
          </div>

          <FieldToggle
            label="Loop audio"
            checked={Boolean(active.loop)}
            onChange={(checked) =>
              onCommitAudioClipPatch?.(active.id, { loop: checked }, "Loop toggled")
            }
          />

          {lane === "voice" && frame.text && (
            <div className="audio-dialogue-box">
              <span className="eyebrow">{frame.speaker || "NARRATOR"}</span>
              <p>{frame.text}</p>
            </div>
          )}
        </section>
      )}

      {(lane === "music" || lane === "ambience") && onSetDuckDepth && (
        <section className="inspector-section">
          <SectionTitle
            number="03"
            title="Voice ducking"
            status={`-${Math.round(duckDepth * 100)}%`}
          />
          <FieldNumber
            label="Duck under voice"
            value={duckDepth}
            min={0}
            max={0.95}
            step={0.05}
            onChange={onSetDuckDepth}
          />
        </section>
      )}

      <section className="inspector-section">
        <SectionTitle number="04" title="Film audioClips" status={`${resolvedAudioClips.length} CLIPS`} />
        <p className="preview-only-note">
          Sound lanes, waveforms, mixer, and Web Audio playback run from free{" "}
          <code>audioClips</code> in milliseconds while leaving story beat &amp; scene fields untouched.
        </p>
        <button
          type="button"
          className="button button-wide button-quiet"
          data-testid="rebuild-sound-btn"
          onClick={() => onRebuildSoundFromFilm?.()}
        >
          ↻ Rebuild sound from the film…
        </button>
      </section>
    </div>
  );
}

