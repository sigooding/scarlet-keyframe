import { useRef, useState } from "react";
import { CINEMATIC_GROUPS, type CinematicField } from "../core/cinematicSchema";
import { getEffectValue } from "../core/edits";
import { pictureLabel } from "../core/helpers";
import type { BeatAnimation, KeyEasing, Keyframe, ProjectState } from "../core/model";
import { formatTimecode } from "../core/timing";
import {
  evaluate,
  hasAnimationKeyframes,
  setKeyEasingAtFrame,
  setSliderValueAtFrame,
  toggleKeyAtFrame,
  type AnimProp,
} from "../sequence/animate";
import { mapTransitionKind } from "../sequence/transitions";

export type InspectorTab = "clip" | "voice" | "sfx" | "music" | "ambience";

export type BrowseMediaTarget =
  | "picture"
  | "scenePicture"
  | "depthMap"
  | "foregroundImage"
  | "voice"
  | "sfx"
  | "music"
  | "ambience"
  | `ambience:${number}`;

export type UploadMediaTarget = "picture" | "voice" | "sfx" | "music" | "ambience";

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
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
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
const EASINGS: KeyEasing[] = ["linear", "ease-in-out", "hold"];

export function Inspector(props: InspectorProps) {
  const { project, frame, localFrame, clipDurationFrames } = props;
  const [fallbackTab, setFallbackTab] = useState<InspectorTab>("clip");
  const [jsonError, setJsonError] = useState("");

  const currentTab = props.activeTab ?? fallbackTab;
  const selectTab = (tab: InspectorTab) => {
    if (props.onChangeTab) props.onChangeTab(tab);
    else setFallbackTab(tab);
  };

  const soundSources = project.assets.filter((asset) => asset.type === "audio");
  const beat = frame.beat;
  const scene = frame.scene;
  const animation = beat.animation;
  const pose = evaluate(frame, localFrame);
  const animated = hasAnimationKeyframes(frame);

  const musicUrl = String(scene.musicUrl || scene.sceneAudioUrl || "");
  const ambParsed = parseAmbienceSpec(scene.ambientAudio);

  const tabs: ReadonlyArray<{ id: InspectorTab; label: string; icon: string; hasItem: boolean }> = [
    {
      id: "clip",
      label: "Clip",
      icon: "▣",
      hasItem: Boolean(frame.picture && !frame.picture.startsWith("gradient:")),
    },
    {
      id: "voice",
      label: "Voice",
      icon: "◉",
      hasItem: Boolean(beat.audioUrl),
    },
    {
      id: "sfx",
      label: "SFX",
      icon: "✦",
      hasItem: Boolean(beat.sfxUrl),
    },
    {
      id: "music",
      label: "Music",
      icon: "♪",
      hasItem: Boolean(musicUrl || props.inheritedMusic),
    },
    {
      id: "ambience",
      label: "Ambience",
      icon: "≈",
      hasItem: Boolean(
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
          <button className="small-icon-button" onClick={props.onCopyEffects} title="Copy effects">
            ⧉
          </button>
          <button
            className={`small-icon-button ${props.copied ? "is-active" : ""}`}
            onClick={props.onPasteEffects}
            disabled={!props.copied}
            title={`Paste effects to ${props.selectedCount} selected keyframes`}
          >
            ↳
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
        {currentTab === "voice" && (
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

        {currentTab === "sfx" && (
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

        {currentTab === "music" && (
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

        {currentTab === "ambience" && (
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
              <SectionTitle number="01" title="Picture" status={frame.carried ? "CARRIED" : "OWN FRAME"} />
              <div className="picture-current">
                {props.pictureSrc && !props.pictureSrc.startsWith("gradient:") && !props.pictureSrc.startsWith("emoji:") ? (
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
                  <strong>{pictureLabel(frame.picture, false, "No picture")}</strong>
                  <small>
                    {frame.pictureSource === "scene"
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
                  title="Split clip at playhead (S)"
                >
                  ✂ Split (S)
                </button>
                <button className="button button-quiet" onClick={props.onInsert}>
                  ＋ Add after
                </button>
                <button className="button button-quiet" onClick={props.onDuplicate}>
                  Duplicate
                </button>
                <button className="button button-quiet danger-quiet" onClick={props.onDelete}>
                  Delete
                </button>
              </div>
              <div className="move-actions">
                <button onClick={() => props.onMove(-1)}>↑ Move earlier</button>
                <button onClick={() => props.onMove(1)}>↓ Move later</button>
              </div>
            </section>

            <section className="inspector-section animation-section" data-testid="inspector-animation">
              <SectionTitle number="03" title="Animation" status={animated ? "KEYFRAMED" : "PRESET"} />
              <div className="anim-section-bar">
                <span>
                  Clip frame <strong>+{localFrame}f</strong> / {Math.max(0, clipDurationFrames - 1)}f
                </span>
                <div className="anim-jump-btns">
                  <button
                    type="button"
                    className="field-reset"
                    onClick={() => props.onJumpToLocalFrame(0)}
                    title="Jump playhead to clip start (frame 0)"
                  >
                    ∣◀ Start
                  </button>
                  <button
                    type="button"
                    className="field-reset"
                    onClick={() => props.onJumpToLocalFrame(Math.max(0, clipDurationFrames - 1))}
                    title="Jump playhead to clip end"
                  >
                    End ▶∣
                  </button>
                  {animated && (
                    <button
                      type="button"
                      className="field-reset"
                      onClick={() => props.onSetAnimation(undefined, "Animation keyframes cleared")}
                      title="Clear all animation keyframes on this clip"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>

              <AnimationChannelControl
                prop="zoom"
                label="Zoom"
                min={1}
                max={3}
                step={0.01}
                decimals={2}
                suffix="×"
                value={pose.zoom}
                localFrame={localFrame}
                animation={animation}
                onSetAnimation={props.onSetAnimation}
                onPreviewAnimation={props.onPreviewAnimation}
                onDragStart={props.onDragStart}
                onDragEnd={props.onDragEnd}
              />
              <AnimationChannelControl
                prop="x"
                label="Position X"
                min={-50}
                max={50}
                step={0.5}
                decimals={1}
                suffix="%"
                value={pose.x}
                localFrame={localFrame}
                animation={animation}
                onSetAnimation={props.onSetAnimation}
                onPreviewAnimation={props.onPreviewAnimation}
                onDragStart={props.onDragStart}
                onDragEnd={props.onDragEnd}
              />
              <AnimationChannelControl
                prop="y"
                label="Position Y"
                min={-50}
                max={50}
                step={0.5}
                decimals={1}
                suffix="%"
                value={pose.y}
                localFrame={localFrame}
                animation={animation}
                onSetAnimation={props.onSetAnimation}
                onPreviewAnimation={props.onPreviewAnimation}
                onDragStart={props.onDragStart}
                onDragEnd={props.onDragEnd}
              />
              <p className="preview-only-note">
                {animated
                  ? "Keyframes active: replaces Scarlet Reel camera preset on this clip."
                  : "Add ◆ keyframes on Zoom, X or Y to animate directly by frame."}
              </p>
            </section>

            <details className="inspector-details">
              <summary>
                <SectionTitle number="04" title="Camera & effects" status="SCARLET REEL" />
              </summary>
              <div className="effect-intro">
                Controls mirror the vendored Scarlet Reel cinematic settings. Click the preview to place the focal point.
              </div>
              {CINEMATIC_GROUPS.map((group) => (
                <details className="effect-group" key={group.id} open={group.id === "camera" || group.id === "depth"}>
                  <summary>
                    {group.label}
                    <span>{group.fields.length} fields</span>
                  </summary>
                  <div className="effect-fields">
                    {group.fields.map((field) => (
                      <EffectField
                        key={field.key}
                        field={field}
                        value={getEffectValue(frame, `cinematic.${field.key}`)}
                        onChange={(value) => props.onSetEffect(`cinematic.${field.key}`, value)}
                        onReset={() => props.onResetEffect(`cinematic.${field.key}`)}
                        onBrowse={() => props.onBrowse("image", field.key === "depthMap" ? "depthMap" : "foregroundImage")}
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
              <button className="button button-wide button-quiet copy-effects" onClick={props.onCopyEffects}>
                ⧉ Copy complete effects block
              </button>
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
  localFrame,
  animation,
  onSetAnimation,
  onPreviewAnimation,
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
  localFrame: number;
  animation: BeatAnimation | undefined;
  onSetAnimation: (animation: BeatAnimation | undefined, label: string) => void;
  onPreviewAnimation: (animation: BeatAnimation | undefined) => void;
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
          {keyAtFrame ? "◆" : "◇"}
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
          onChange={(event) =>
            onSetAnimation(
              setKeyEasingAtFrame(animation, prop, localFrame, event.target.value as KeyEasing),
              `${label} easing set to ${event.target.value}`,
            )
          }
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {easing}
            </option>
          ))}
        </select>
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
          const next = setSliderValueAtFrame(animation, prop, localFrame, Number(event.target.value), "linear");
          if (draggingRef.current) onPreviewAnimation(next);
          else onSetAnimation(next, `${label} keyframe updated`);
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
