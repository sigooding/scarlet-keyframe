import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_TRACK_FX,
  FX_PRESETS,
  matchingPresetId,
  normalizeTrackFx,
  type EchoFx,
  type ReverbFx,
  type TrackFx,
} from "../core/audioFx";

export interface TrackFxPanelProps {
  trackLabel: string;
  testId: string;
  fx?: TrackFx;
  x: number;
  y: number;
  onChange: (fx: TrackFx) => void;
  onClose: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  testId,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  testId: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`track-fx-row ${disabled ? "is-disabled" : ""}`}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{format(value)}</output>
    </label>
  );
}

/** Reverb and delay / echo for one track. Changes apply live and are part of the export. */
export function TrackFxPanel({ trackLabel, testId, fx, x, y, onChange, onClose }: TrackFxPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const current = normalizeTrackFx(fx);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref.current?.contains(target)) return;
      if (target?.closest?.('[data-testid^="track-fx-"]')) return; // the FX buttons toggle it themselves
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  const setReverb = (patch: Partial<ReverbFx>) => onChange({ ...current, reverb: { ...current.reverb, ...patch } });
  const setEcho = (patch: Partial<EchoFx>) => onChange({ ...current, echo: { ...current.echo, ...patch } });
  const presetId = matchingPresetId(current);
  const left = Math.max(8, Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1600) - 308));
  const top = Math.max(8, Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 900) - 440));

  const panel = (
    <div
      ref={ref}
      className="track-fx-panel"
      data-testid={testId}
      role="dialog"
      aria-label={`${trackLabel} effects`}
      style={{ left, top }}
    >
      <header className="track-fx-head">
        <strong>{trackLabel} · Effects</strong>
        <button type="button" className="small-icon-button" aria-label="Close effects" onClick={onClose}>
          ×
        </button>
      </header>

      <label className="track-fx-preset">
        <span>Preset</span>
        <select
          className="text-control"
          data-testid={`${testId}-preset`}
          value={presetId}
          onChange={(event) => {
            const chosen = FX_PRESETS.find((p) => p.id === event.target.value);
            if (chosen) onChange(chosen.fx);
          }}
        >
          {presetId === "custom" && <option value="custom">Custom</option>}
          {FX_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <section className="track-fx-section">
        <label className="track-fx-toggle">
          <input
            type="checkbox"
            checked={current.reverb.on}
            data-testid={`${testId}-reverb-on`}
            onChange={(event) => setReverb({ on: event.target.checked })}
          />
          <strong>Reverb</strong>
        </label>
        <Slider label="Mix" value={current.reverb.mix} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} testId={`${testId}-reverb-mix`} disabled={!current.reverb.on} onChange={(mix) => setReverb({ mix })} />
        <Slider label="Size" value={current.reverb.seconds} min={0.2} max={8} step={0.1} format={(v) => `${v.toFixed(1)} s`} testId={`${testId}-reverb-size`} disabled={!current.reverb.on} onChange={(seconds) => setReverb({ seconds })} />
        <Slider label="Pre-delay" value={current.reverb.preDelayMs} min={0} max={200} step={1} format={(v) => `${Math.round(v)} ms`} testId={`${testId}-reverb-pre`} disabled={!current.reverb.on} onChange={(preDelayMs) => setReverb({ preDelayMs })} />
        <Slider label="Damping" value={current.reverb.damping} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} testId={`${testId}-reverb-damp`} disabled={!current.reverb.on} onChange={(damping) => setReverb({ damping })} />
      </section>

      <section className="track-fx-section">
        <label className="track-fx-toggle">
          <input
            type="checkbox"
            checked={current.echo.on}
            data-testid={`${testId}-echo-on`}
            onChange={(event) => setEcho({ on: event.target.checked })}
          />
          <strong>Delay / Echo</strong>
        </label>
        <Slider label="Mix" value={current.echo.mix} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} testId={`${testId}-echo-mix`} disabled={!current.echo.on} onChange={(mix) => setEcho({ mix })} />
        <Slider label="Time" value={current.echo.timeMs} min={40} max={1500} step={5} format={(v) => `${Math.round(v)} ms`} testId={`${testId}-echo-time`} disabled={!current.echo.on} onChange={(timeMs) => setEcho({ timeMs })} />
        <Slider label="Repeats" value={current.echo.feedback} min={0} max={0.9} step={0.01} format={(v) => `${Math.round(v * 100)}%`} testId={`${testId}-echo-feedback`} disabled={!current.echo.on} onChange={(feedback) => setEcho({ feedback })} />
        <Slider label="Tone" value={current.echo.tone} min={0} max={1} step={0.01} format={(v) => (v < 0.34 ? "dark" : v > 0.66 ? "bright" : "warm")} testId={`${testId}-echo-tone`} disabled={!current.echo.on} onChange={(tone) => setEcho({ tone })} />
      </section>

      <footer className="track-fx-foot">
        <button type="button" className="field-reset" data-testid={`${testId}-reset`} onClick={() => onChange(normalizeTrackFx(DEFAULT_TRACK_FX))}>
          Reset
        </button>
        <small>Applies to every {trackLabel.toLowerCase()} clip, live and in the export.</small>
      </footer>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(panel, document.body) : panel;
}
