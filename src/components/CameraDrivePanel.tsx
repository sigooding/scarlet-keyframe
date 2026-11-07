// Driving the camera by hand, and the handheld you do not have to perform. Both write the shot's own keyframes.

import type { CameraDriveBinding } from "../core/useCameraDrive";

export interface HandheldSettings {
  sway: number;
  bob: number;
  roll: number;
  drift: number;
  speed: number;
}

export const DEFAULT_HANDHELD: HandheldSettings = { sway: 0.8, bob: 0.6, roll: 0.5, drift: 0, speed: 1.6 };

export interface CameraDrivePanelProps {
  drive: CameraDriveBinding;
  handheld: HandheldSettings;
  onChangeHandheld: (next: HandheldSettings) => void;
  onApplyHandheld: () => void;
  /** False for a gap or a picture that cannot be moved (a video, a gradient). */
  canDrive: boolean;
  /** How long the shot is, in seconds, for the handheld's note. */
  shotSeconds: number;
}

const SLIDERS: Array<{ key: keyof HandheldSettings; label: string; min: number; max: number; step: number; suffix: string; hint: string }> = [
  { key: "sway", label: "Sway", min: 0, max: 4, step: 0.1, suffix: "%", hint: "side to side" },
  { key: "bob", label: "Bob", min: 0, max: 4, step: 0.1, suffix: "%", hint: "up and down" },
  { key: "roll", label: "Roll", min: 0, max: 3, step: 0.1, suffix: "°", hint: "the horizon tipping" },
  { key: "drift", label: "Drift", min: -8, max: 8, step: 0.5, suffix: "%", hint: "one slow way across the shot" },
  { key: "speed", label: "Speed", min: 0.3, max: 5, step: 0.1, suffix: "/s", hint: "how busy the hand is" },
];

export function CameraDrivePanel({
  drive,
  handheld,
  onChangeHandheld,
  onApplyHandheld,
  canDrive,
  shotSeconds,
}: CameraDrivePanelProps) {
  const take = drive.recorded;
  return (
    <section className="inspector-section" data-testid="camera-drive-panel">
      <div className="audio-tools-head">
        <span className="eyebrow">CAMERA BY HAND</span>
        <small>{drive.armed ? (take.frames ? `${take.frames} frames over ${take.shots} shot${take.shots === 1 ? "" : "s"}` : "armed") : "off"}</small>
      </div>

      <div className="picture-actions">
        <button
          type="button"
          className={`button ${drive.armed ? "button-primary" : "button-quiet"}`}
          data-testid="drive-arm-btn"
          disabled={!canDrive}
          aria-pressed={drive.armed}
          onClick={() => drive.arm(!drive.armed)}
          title="Arm the camera, then press play and move it with the mouse. Stop and the move is written to the shot."
        >
          {drive.armed ? "● Driving — press play" : "Drive the camera"}
        </button>
        {drive.armed && (
          <button
            type="button"
            className="button button-quiet"
            data-testid="drive-cancel-btn"
            onClick={() => drive.arm(false)}
            title="Put the camera down and throw this take away"
          >
            Cancel
          </button>
        )}
      </div>
      <small className="inspector-note" data-testid="drive-note">
        {drive.armed
          ? "Drag the picture to move the camera, Alt-drag to roll it, the wheel to push in. Press play: every frame is recorded, and stopping writes it to the shots you drove. Undo takes it all back."
          : "Arm it, press play, and move the camera while the film runs — the performance becomes keyframes on the shots it touched."}
      </small>

      <div className="audio-preset-row" data-testid="drive-mode">
        <span className="control-label">The shot's own move</span>
        <div className="audio-preset-buttons">
          <button
            type="button"
            className={`audio-preset-btn ${drive.mode === "add" ? "is-active" : ""}`}
            data-testid="drive-mode-add"
            title="Keep it, and put the hand over the top: a zoom keeps zooming while you float"
            onClick={() => drive.setMode("add")}
          >
            keep
          </button>
          <button
            type="button"
            className={`audio-preset-btn ${drive.mode === "replace" ? "is-active" : ""}`}
            data-testid="drive-mode-replace"
            title="Throw it away: the hand is the only camera"
            onClick={() => drive.setMode("replace")}
          >
            replace
          </button>
        </div>
      </div>

      <div className="field-line">
        <span className="control-label" title="How closely the keys follow your hand. Calmer means fewer keys.">
          Smooth
        </span>
        <input
          type="range"
          data-testid="drive-smooth"
          min={0}
          max={1}
          step={0.05}
          value={drive.smooth}
          onChange={(event) => drive.setSmooth(Number(event.target.value))}
        />
        <output>{drive.smooth === 0 ? "exact" : drive.smooth >= 0.95 ? "calm" : drive.smooth.toFixed(2)}</output>
      </div>

      <div className="audio-crossfade" data-testid="handheld-tools">
        <div className="audio-tools-head">
          <span className="eyebrow">HANDHELD, GENERATED</span>
          <small>{shotSeconds.toFixed(1)} s shot</small>
        </div>
        {SLIDERS.map((slider) => (
          <div className="field-line" key={slider.key}>
            <span className="control-label" title={slider.hint}>
              {slider.label}
            </span>
            <input
              type="range"
              data-testid={`handheld-${slider.key}`}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={handheld[slider.key]}
              onChange={(event) => onChangeHandheld({ ...handheld, [slider.key]: Number(event.target.value) })}
            />
            <output>
              {handheld[slider.key]}
              {slider.suffix}
            </output>
          </div>
        ))}
        <button
          type="button"
          className="button button-wide button-quiet"
          data-testid="handheld-apply"
          disabled={!canDrive}
          onClick={onApplyHandheld}
          title="Write a handheld float onto this shot as keyframes. The same settings always give the same move."
        >
          ✥ Put a handheld on this shot
        </button>
        <small className="inspector-note">
          {drive.mode === "add"
            ? "Over whatever the shot already does. The zoom is lifted just enough that the float never shows the edge of the picture."
            : "In place of whatever the shot does now. The zoom is lifted just enough that the float never shows the edge of the picture."}
        </small>
      </div>
    </section>
  );
}
