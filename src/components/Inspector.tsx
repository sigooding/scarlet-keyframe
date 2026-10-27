import { useState } from "react";
import { CINEMATIC_GROUPS, type CinematicField } from "../core/cinematicSchema";
import { getEffectValue } from "../core/edits";
import type { Keyframe, ProjectState } from "../core/model";

interface InspectorProps {
  project: ProjectState;
  frame: Keyframe;
  pictureSrc?: string;
  selectedCount: number;
  copied: boolean;
  onBrowse: (kind: "image" | "audio", target: "picture" | "scenePicture" | "depthMap" | "foregroundImage" | "voice" | "sfx" | "music") => void;
  onUpload: (kind: "image" | "audio", target: "picture" | "voice" | "sfx" | "music") => void;
  onSetPicture: (picture?: string) => void;
  onSetEffect: (path: string, value: unknown) => void;
  onResetEffect: (path: string) => void;
  onSetBeat: (path: string, value: unknown) => void;
  onSetScene: (path: string, value: unknown) => void;
  onCopyEffects: () => void;
  onPasteEffects: () => void;
  onPlayVoice: () => void;
  onInsert: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onPreviewSfx: () => void;
}

const TRANSITIONS = ["cut", "fade", "crossfade", "fade-black", "slide-left", "slide-right", "iris-in", "iris", "wipe-left", "wipe-right", "wipe-up", "wipe-down", "zoom", "glitch", "burn"];
const PARTICLES = ["none", "rain", "drizzle", "snow", "smoke", "storm", "dust", "fog", "ember", "ash", "fireflies", "motes"];

export function Inspector(props: InspectorProps) {
  const { project, frame } = props;
  const [jsonError, setJsonError] = useState("");
  const soundSources = project.assets.filter((asset) => asset.type === "audio");
  const beat = frame.beat;
  const scene = frame.scene;

  return (
    <aside className="inspector-panel">
      <div className="inspector-head">
        <div><span className="eyebrow">SHOT INSPECTOR</span><h2>{frame.mark}<span className="inspector-slash">/</span>{String(frame.number).padStart(2, "0")}</h2></div>
        <div className="inspector-head-actions">
          <button className="small-icon-button" onClick={props.onCopyEffects} title="Copy effects">⧉</button>
          <button className={`small-icon-button ${props.copied ? "is-active" : ""}`} onClick={props.onPasteEffects} disabled={!props.copied} title={`Paste effects to ${props.selectedCount} selected keyframes`}>↳</button>
        </div>
      </div>
      <div className="inspector-scroll">
        <section className="inspector-section picture-section">
          <SectionTitle number="01" title="Picture" status={frame.carried ? "CARRIED" : "OWN FRAME"} />
          <div className="picture-current">
            {props.pictureSrc ? <img src={props.pictureSrc} alt="Current keyframe picture" /> : <div className="picture-empty"><span>NO LINKED PICTURE</span></div>}
            <div className="picture-current-meta"><strong>{frame.picture?.split("/").pop() || "No picture"}</strong><small>{frame.pictureSource === "scene" ? "Scene plate" : frame.carried ? "Inherited from previous frame" : "Keyframe picture"}</small></div>
          </div>
          <div className="picture-actions">
            <button className="button button-primary" onClick={() => props.onBrowse("image", "picture")}>Choose…</button>
            <button className="button button-quiet" onClick={() => props.onUpload("image", "picture")}>Upload…</button>
            <button className="button button-text" onClick={() => props.onSetPicture(undefined)} disabled={!beat.background}>Remove picture</button>
          </div>
        </section>

        <section className="inspector-section action-section">
          <SectionTitle number="02" title="Keyframe" />
          <div className="keyframe-actions">
            <button className="button button-quiet" onClick={props.onInsert}>＋ Add keyframe after</button>
            <button className="button button-quiet" onClick={props.onDuplicate}>Duplicate</button>
            <button className="button button-quiet danger-quiet" onClick={props.onDelete}>Delete</button>
          </div>
          <div className="move-actions"><button onClick={() => props.onMove(-1)}>↑ Move earlier</button><button onClick={() => props.onMove(1)}>↓ Move later</button></div>
        </section>

        <details className="inspector-details" open>
          <summary><SectionTitle number="03" title="Camera & effects" status="SCARLET REEL" /></summary>
          <div className="effect-intro">Controls mirror the vendored Scarlet Reel cinematic settings. Click the preview to place the focal point.</div>
          {CINEMATIC_GROUPS.map((group) => (
            <details className="effect-group" key={group.id} open={group.id === "camera" || group.id === "depth"}>
              <summary>{group.label}<span>{group.fields.length} fields</span></summary>
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
            <div className="particle-group-head"><span>Particles</span><small>Beat override</small></div>
            <FieldSelect label="Kind" value={String(beat.particles ?? scene.particles ?? "none")} options={PARTICLES} onChange={(value) => props.onSetBeat("particles", value)} />
            <FieldNumber label="Density" value={Number((beat.particleConfig ?? scene.particleConfig)?.density ?? 1)} min={0} max={2} step={0.05} onChange={(value) => props.onSetBeat("particleConfig.density", value)} />
            <FieldNumber label="Opacity" value={Number((beat.particleConfig ?? scene.particleConfig)?.opacity ?? 1)} min={0} max={1} step={0.01} onChange={(value) => props.onSetBeat("particleConfig.opacity", value)} />
            <FieldNumber label="Wind" value={Number((beat.particleConfig ?? scene.particleConfig)?.wind ?? 1)} min={0} max={3} step={0.05} onChange={(value) => props.onSetBeat("particleConfig.wind", value)} />
          </div>
          <div className="effect-group particle-group">
            <div className="particle-group-head"><span>Transition & hold</span><small>Beat timing</small></div>
            <FieldSelect label="Transition" value={String(beat.backgroundTransition ?? "cut")} options={TRANSITIONS} onChange={(value) => props.onSetBeat("backgroundTransition", value)} />
            <FieldNumber label="Transition speed" value={Number(beat.backgroundTransitionSpeed ?? 0.5)} min={0} max={5} step={0.05} onChange={(value) => props.onSetBeat("backgroundTransitionSpeed", value)} suffix="s" />
            <FieldNumber label="Hold time" value={Number(beat.holdSeconds ?? 0)} min={0} max={90} step={0.1} onChange={(value) => props.onSetBeat("holdSeconds", value)} suffix="s" />
            <FieldToggle label="Hold this picture" checked={beat.backgroundHold !== false} onChange={(value) => props.onSetBeat("backgroundHold", value)} />
            <FieldToggle label="Revert to scene plate" checked={Boolean(beat.backgroundRevert)} onChange={(value) => props.onSetBeat("backgroundRevert", value)} />
          </div>
          <button className="button button-wide button-quiet copy-effects" onClick={props.onCopyEffects}>⧉ Copy complete effects block</button>
          <p className="preview-only-note">Framing extensions, vignette and grain controls are editor-side additions and are marked preview-only in the export report.</p>
        </details>

        <details className="inspector-details">
          <summary><SectionTitle number="04" title="Sound" status={beat.audioUrl ? "VOICE" : "SILENT"} /></summary>
          <div className="sound-control">
            <label className="control-label">Voice take</label>
            <div className="audio-ref-row"><span>{beat.audioUrl?.split("/").pop() || "No voice take"}</span><button onClick={props.onPlayVoice} disabled={!beat.audioUrl}>▶</button></div>
            <div className="button-row"><button className="button button-quiet" onClick={() => props.onBrowse("audio", "voice")}>Choose take…</button><button className="button button-text" onClick={() => props.onUpload("audio", "voice")}>Upload</button></div>
            <FieldNumber label="Trim offset" value={Number(beat.audioOffsetSeconds ?? 0)} min={0} max={30} step={0.05} onChange={(value) => props.onSetBeat("audioOffsetSeconds", value)} suffix="s" />
          </div>
          <div className="sound-control">
            <label className="control-label">Sound effect</label>
            <div className="audio-ref-row"><span>{beat.sfxUrl?.split("/").pop() || "No effect"}</span><button onClick={props.onPreviewSfx} disabled={!beat.sfxUrl}>▶</button></div>
            <div className="button-row"><button className="button button-quiet" onClick={() => props.onBrowse("audio", "sfx")}>Choose sound…</button><button className="button button-text" onClick={() => props.onUpload("audio", "sfx")}>Upload</button></div>
            {beat.sfxUrl && <FieldNumber label="Effect level" value={Number(beat.sfxVolume ?? 1)} min={0} max={1} step={0.01} onChange={(value) => props.onSetBeat("sfxVolume", value)} />}
            {beat.sfxUrl && <button className="button button-text remove-sound" onClick={() => props.onSetBeat("sfxUrl", undefined)}>Remove sound effect</button>}
          </div>
          {soundSources.length > 0 && <p className="inspector-note">{soundSources.length} imported/uploaded sound files in the project library.</p>}
        </details>

        <details className="inspector-details">
          <summary><SectionTitle number="05" title="Scene group" status={frame.mark} /></summary>
          <label className="control-label">Scene heading</label>
          <textarea className="inspector-textarea" value={String(scene.prose || "")} onChange={(event) => props.onSetScene("prose", event.target.value)} rows={3} />
          <div className="control-row"><span className="control-label">Scene plate</span><button className="button button-text" onClick={() => props.onBrowse("image", "scenePicture")}>Choose</button></div>
          <input className="text-control" aria-label="Scene background path" value={String(scene.background || "")} onChange={(event) => props.onSetScene("background", event.target.value)} />
          <SceneMusic project={project} frame={frame} onBrowse={props.onBrowse} onSetScene={props.onSetScene} />
        </details>
      </div>
    </aside>
  );
}

function SectionTitle({ number, title, status }: { number: string; title: string; status?: string }) {
  return <span className="section-title"><i>{number}</i><b>{title}</b>{status && <small>{status}</small>}</span>;
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
  const label = <span className="control-label">{field.label}{field.extension && <small className="field-extension">EXT</small>}</span>;
  const reset = <button className="field-reset" onClick={onReset} title={`Reset ${field.label} to imported value`}>RESET</button>;
  if (field.kind === "boolean") {
    return <div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div><button className={`toggle ${value ? "is-on" : ""}`} onClick={() => onChange(!value)} aria-label={field.label} data-testid={`effect-${field.key}`} /><>{reset}</></div>;
  }
  if (field.kind === "number") {
    return <div className="effect-field"><div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div><output>{value === undefined ? "—" : `${Number(value).toFixed(field.step && field.step < 0.1 ? 2 : 1)}${field.key.toLowerCase().includes("duration") || field.key.toLowerCase().includes("seconds") ? "s" : ""}`}</output>{reset}</div><input data-testid={`effect-${field.key}`} type="range" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 0.1} value={Number(value ?? field.min ?? 0)} onChange={(event) => onChange(Number(event.target.value))} /></div>;
  }
  if (field.kind === "select") {
    return <div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div><select data-testid={`effect-${field.key}`} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)}>{(field.options || []).map((option) => <option key={option} value={option}>{option || "None"}</option>)}</select>{reset}</div>;
  }
  if (field.kind === "json") {
    return <div className="effect-field json-effect-field"><div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div>{reset}</div><textarea data-testid={`effect-${field.key}`} defaultValue={value === undefined ? "" : JSON.stringify(value, null, 2)} key={`${field.key}-${JSON.stringify(value)}`} placeholder="[]" rows={3} onChange={(event) => { try { onChange(event.target.value ? JSON.parse(event.target.value) : undefined); setJsonError(""); } catch { setJsonError(`Invalid JSON in ${field.label}.`); } }} />{jsonError && <small className="field-error">{jsonError}</small>}</div>;
  }
  if (field.kind === "image") {
    return <div className="effect-field"><div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div>{reset}</div><div className="media-field"><input data-testid={`effect-${field.key}`} value={String(value || "")} onChange={(event) => onChange(event.target.value || undefined)} placeholder="No media assigned" /><button onClick={onBrowse}>Browse</button></div></div>;
  }
  if (field.kind === "color") {
    const hex = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#e8a24a";
    return <div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div><input type="color" data-testid={`effect-${field.key}`} value={hex} onChange={(event) => onChange(event.target.value)} />{reset}</div>;
  }
  return <div className="field-line"><div>{label}<small className="field-help">{field.key}</small></div><input className="text-control" data-testid={`effect-${field.key}`} value={String(value || "")} onChange={(event) => onChange(event.target.value || undefined)} />{reset}</div>;
}

function FieldNumber({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; suffix?: string }) {
  return <div className="field-number"><label>{label}</label><div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{value.toFixed(step < 0.1 ? 2 : 1)}{suffix}</output></div></div>;
}

function FieldSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="field-line"><span className="control-label">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></div>;
}

function FieldToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="field-line"><span className="control-label">{label}</span><button className={`toggle ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)} aria-label={label} /></div>;
}

function SceneMusic({ project, frame, onBrowse, onSetScene }: {
  project: ProjectState;
  frame: Keyframe;
  onBrowse: InspectorProps["onBrowse"];
  onSetScene: InspectorProps["onSetScene"];
}) {
  const scene = frame.scene;
  const musicUrl = String(scene.musicUrl || scene.sceneAudioUrl || "");
  const sync = scene.musicSync || {};
  return (
    <div className="scene-music-editor">
      <div className="particle-group-head"><span>Music cue</span><small>{scene.musicMode || "inherit"}</small></div>
      <FieldSelect label="Mode" value={String(scene.musicMode || "inherit")} options={["inherit", "track", "none"]} onChange={(value) => onSetScene("musicMode", value)} />
      <div className="media-field"><input value={musicUrl} onChange={(event) => onSetScene("musicUrl", event.target.value || undefined)} placeholder="Inherit previous cue" aria-label="Scene music path" /><button onClick={() => onBrowse("audio", "music")}>Choose</button></div>
      <FieldNumber label="Level" value={Number(scene.musicLevel ?? 1)} min={0} max={1.5} step={0.01} onChange={(value) => onSetScene("musicLevel", value)} />
      <FieldNumber label="Fade in" value={Number(scene.musicFadeSeconds ?? 1.4)} min={0} max={20} step={0.1} onChange={(value) => onSetScene("musicFadeSeconds", value)} suffix="s" />
      <FieldNumber label="Fade out" value={Number(scene.musicFadeOutSeconds ?? scene.musicFadeSeconds ?? 1.4)} min={0} max={30} step={0.1} onChange={(value) => onSetScene("musicFadeOutSeconds", value)} suffix="s" />
      <FieldToggle label="Loop track" checked={scene.musicLoop !== false} onChange={(value) => onSetScene("musicLoop", value)} />
      <FieldNumber label="Beat sync BPM" value={Number(sync.bpm ?? 0)} min={0} max={220} step={0.01} onChange={(value) => onSetScene("musicSync.bpm", value || undefined)} />
      <FieldNumber label="First beat" value={Number(sync.firstBeat ?? 0)} min={0} max={8} step={0.01} onChange={(value) => onSetScene("musicSync.firstBeat", value)} suffix="s" />
      <label className="control-label ambience-label">Ambience layers <small>{project.assets.filter((asset) => asset.type === "audio").length} sounds</small></label>
      <input className="text-control" value={String(scene.ambientAudio || "none")} onChange={(event) => onSetScene("ambientAudio", event.target.value)} aria-label="Ambience layers" />
      <small className="inspector-note">Use <code>rain+file:/film/sfx/loop.mp3</code> for a preset and recorded layer.</small>
    </div>
  );
}
