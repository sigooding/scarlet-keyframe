import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveSingleLensFlare } from "../../vendor/scarlet-reel/cinematic";
import type { CinematicSettings, LensFlarePreset, LensFlareSettings, LightPoint } from "../../vendor/scarlet-reel/types";
import { NOIR_LIGHTING_OPTIONS } from "../core/clipTabLayout";
import {
  BREATHING,
  FLARE_PRESET_IDS,
  LIGHT_PRESETS,
  addFlare,
  addLight,
  breathingOf,
  flarePresetHint,
  flarePresetLabel,
  isFollowingLight,
  lightFlarePreset,
  readLightsAndFlares,
  removeFlare,
  removeLight,
  sameTarget,
  setLightFlare,
  updateFlare,
  updateLight,
  type CinematicPatch,
  type PointTarget,
} from "../core/lightsFlares";

/** What the panel is working on: the selected light or flare, and whether the next click on the picture places it. */
export interface PointEditState {
  target: PointTarget | null;
  placing: boolean;
}

export interface LightsFlaresPanelProps {
  /** The shot's effective cinematic settings. */
  cinematic: CinematicSettings | undefined;
  /** No picture (a gap or a gradient): nothing can be lit. */
  disabled?: boolean;
  /** The shot's noir lighting style (eye light, venetian blinds ...), "" for none. */
  noirLighting?: string;
  edit: PointEditState;
  onEditChange: (edit: PointEditState) => void;
  /** The viewer is showing this shot, so a click on it can place a light. */
  canPlaceOnViewer: boolean;
  /** The viewer is still dissolving into this shot from the previous one, so its glows hardly show yet. */
  dissolvingIn?: boolean;
  /** Move the playhead to where the dissolve ends, so the shot is fully on screen. */
  onShowShot?: () => void;
  /** One finished change (one undo step). */
  onApply: (patch: CinematicPatch, label: string) => void;
  /** A change while a slider is being dragged: shown at once, not yet an undo step. */
  onPreview: (patch: CinematicPatch) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}

function toHex(color: string | undefined, fallback = "#e8b23c"): string {
  const text = String(color ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(text);
  if (short) return `#${short[1].split("").map((c) => c + c).join("")}`.toLowerCase();
  return fallback;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A slider that previews while it is dragged and becomes one undo step when it is let go. */
function LfSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  testId,
  onPreview,
  onCommit,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  testId: string;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onDragStart: () => void;
  onDragEnd: (label: string) => void;
}) {
  const dragging = useRef(false);
  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onDragEnd(`${label} changed`);
  };
  return (
    <div className="field-number lf-slider">
      <label>{label}</label>
      <div>
        <input
          type="range"
          data-testid={testId}
          data-owns-arrow-keys="true"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => {
            dragging.current = true;
            onDragStart();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (dragging.current) onPreview(next);
            else onCommit(next);
          }}
        />
        <output>{format(value)}</output>
      </div>
    </div>
  );
}

/** A small "+ Light" style button that opens a list of looks. */
function AddMenu<T extends { id: string; label: string; hint: string }>({
  label,
  items,
  disabled,
  testId,
  onPick,
}: {
  label: string;
  items: readonly T[];
  disabled?: boolean;
  testId: string;
  onPick: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (wrap.current && event.target instanceof Node && !wrap.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="anim-preset-dropdown lf-add" ref={wrap}>
      <button
        type="button"
        className="button button-quiet lf-add-btn"
        data-testid={testId}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2,3.5 L5,6.8 L8,3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="anim-preset-menu lf-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={`${testId}-${item.id}`}
              onClick={() => {
                setOpen(false);
                onPick(item);
              }}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardShell({
  testId,
  name,
  summary,
  swatch,
  selected,
  placing,
  canPlace,
  placeNote,
  onSelect,
  onTogglePlace,
  onRemove,
  children,
}: {
  testId: string;
  name: string;
  summary: string;
  swatch: ReactNode;
  selected: boolean;
  placing: boolean;
  canPlace: boolean;
  placeNote?: string;
  onSelect: () => void;
  onTogglePlace: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`lf-card ${selected ? "is-selected" : ""}`} data-testid={testId}>
      <div
        className="lf-card-top"
        role="button"
        tabIndex={0}
        aria-expanded={selected}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
      >
        {swatch}
        <strong>{name}</strong>
        <small>{summary}</small>
        <button
          type="button"
          className={`field-reset lf-place-btn ${placing ? "is-active-pill" : ""}`}
          data-testid={`${testId}-place`}
          disabled={!canPlace}
          title={placeNote ?? "Then click on the picture to put it there"}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePlace();
          }}
        >
          ⌖ {placing ? "Click picture…" : "Place"}
        </button>
        <button
          type="button"
          className="field-reset lf-remove-btn"
          data-testid={`${testId}-remove`}
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ✕
        </button>
      </div>
      {selected && <div className="lf-card-body">{children}</div>}
    </div>
  );
}

export function LightsFlaresPanel(props: LightsFlaresPanelProps) {
  const { cinematic, disabled, edit, canPlaceOnViewer, onApply, onPreview, onDragStart, onDragEnd } = props;
  const { lights, flares } = readLightsAndFlares(cinematic);
  const total = lights.length + flares.length;
  const select = (target: PointTarget | null, placing = false) => props.onEditChange({ target, placing });
  const isSelected = (target: PointTarget) => sameTarget(edit.target, target);
  const isPlacing = (target: PointTarget) => edit.placing && isSelected(target);

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
    testId: string,
    patchFor: (value: number) => CinematicPatch,
  ) => (
    <LfSlider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      format={format}
      testId={testId}
      onPreview={(next) => onPreview(patchFor(next))}
      onCommit={(next) => onApply(patchFor(next), `${label} changed`)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );

  const lightCard = (light: LightPoint, index: number) => {
    const target: PointTarget = { kind: "light", index };
    const name = `Light ${index + 1}`;
    const color = toHex(light.color);
    const breathing = breathingOf(light);
    const flarePreset = lightFlarePreset(light);
    const change = (patch: Partial<LightPoint>) => updateLight(cinematic, index, patch);
    return (
      <CardShell
        key={`light-${index}`}
        testId={`lf-light-${index}`}
        name={name}
        summary={`${percent(light.intensity ?? 0.5)} · ${Math.round(light.size ?? 40)} wide${flarePreset ? " · flare" : ""}`}
        swatch={<i className="lf-swatch" style={{ background: color }} aria-hidden="true" />}
        selected={isSelected(target)}
        placing={isPlacing(target)}
        canPlace={canPlaceOnViewer}
        placeNote={canPlaceOnViewer ? undefined : "Move the playhead onto this shot to place it"}
        onSelect={() => select(isSelected(target) ? null : target)}
        onTogglePlace={() => select(target, !isPlacing(target))}
        onRemove={() => {
          onApply(removeLight(cinematic, index), `${name} removed`);
          select(null);
        }}
      >
        <div className="lf-row">
          <span className="control-label">Colour</span>
          <input
            type="color"
            data-testid={`lf-light-${index}-color`}
            aria-label={`${name} colour`}
            value={color}
            onChange={(event) => onApply(change({ color: event.target.value }), `${name} colour changed`)}
          />
        </div>
        {slider("Brightness", light.intensity ?? 0.5, 0, 1, 0.01, percent, `lf-light-${index}-intensity`, (v) => change({ intensity: v }))}
        {slider("Size", light.size ?? 40, 5, 95, 1, (v) => `${Math.round(v)}%`, `lf-light-${index}-size`, (v) => change({ size: v }))}
        <div className="lf-pair">
          {slider("Across", light.x ?? 50, 0, 100, 0.5, (v) => `${Math.round(v)}%`, `lf-light-${index}-x`, (v) => change({ x: v }))}
          {slider("Down", light.y ?? 30, 0, 100, 0.5, (v) => `${Math.round(v)}%`, `lf-light-${index}-y`, (v) => change({ y: v }))}
        </div>
        <div className="lf-row">
          <span className="control-label">Glow</span>
          <div className="lf-segmented" role="group" aria-label={`${name} glow`}>
            {BREATHING.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={breathing === mode.id ? "is-active" : ""}
                data-testid={`lf-light-${index}-glow-${mode.id}`}
                onClick={() => onApply(change({ pulseSeconds: mode.pulseSeconds, pulseAmount: mode.pulseAmount }), `${name} glow: ${mode.label}`)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        {breathing === "custom" && <small className="lf-hint">Its glow has custom timing; pick one to replace it.</small>}
        <div className="lf-row">
          <span className="control-label">Lens flare on this light</span>
          <button
            type="button"
            className={`toggle ${flarePreset ? "is-on" : ""}`}
            data-testid={`lf-light-${index}-flare-toggle`}
            aria-label={`Lens flare on ${name}`}
            aria-pressed={Boolean(flarePreset)}
            onClick={() => onApply(setLightFlare(cinematic, index, flarePreset ? false : "anamorphic-blue"), flarePreset ? `${name} flare removed` : `${name} flare added`)}
          />
        </div>
        {flarePreset && (
          <div className="lf-row">
            <span className="control-label">Flare look</span>
            <select
              data-testid={`lf-light-${index}-flare-look`}
              aria-label={`${name} flare look`}
              value={flarePreset}
              onChange={(event) => onApply(setLightFlare(cinematic, index, event.target.value as LensFlarePreset), `${name} flare look changed`)}
            >
              {FLARE_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {flarePresetLabel(id)}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardShell>
    );
  };

  const flareCard = (flare: LensFlareSettings, ref: PointTarget & { kind: "flare" }, order: number) => {
    const target: PointTarget = ref;
    const name = `Flare ${order + 1}`;
    const resolved = resolveSingleLensFlare(flare, lights);
    const following = isFollowingLight(flare, lights);
    const change = (patch: Partial<LensFlareSettings>) => updateFlare(cinematic, ref.ref, patch);
    const key = ref.ref.source === "single" ? "single" : String(ref.ref.index);
    const on = flare.enabled !== false;
    return (
      <CardShell
        key={`flare-${key}`}
        testId={`lf-flare-${order}`}
        name={name}
        summary={`${flarePresetLabel(flare.preset)}${on ? "" : " · off"}`}
        swatch={<i className="lf-swatch is-flare" style={{ background: resolved.color }} aria-hidden="true" />}
        selected={isSelected(target)}
        placing={isPlacing(target)}
        canPlace={canPlaceOnViewer && !following}
        placeNote={
          following
            ? `This flare follows Light ${(flare.linkToLight ?? 0) + 1}: move the light instead`
            : canPlaceOnViewer
              ? undefined
              : "Move the playhead onto this shot to place it"
        }
        onSelect={() => select(isSelected(target) ? null : target)}
        onTogglePlace={() => select(target, !isPlacing(target))}
        onRemove={() => {
          onApply(removeFlare(cinematic, ref.ref), `${name} removed`);
          select(null);
        }}
      >
        <div className="lf-row">
          <span className="control-label">On</span>
          <button
            type="button"
            className={`toggle ${on ? "is-on" : ""}`}
            data-testid={`lf-flare-${order}-on`}
            aria-label={`${name} on`}
            aria-pressed={on}
            onClick={() => onApply(change({ enabled: on ? false : undefined }), on ? `${name} switched off` : `${name} switched on`)}
          />
        </div>
        <div className="lf-row">
          <span className="control-label">Look</span>
          <select
            data-testid={`lf-flare-${order}-look`}
            aria-label={`${name} look`}
            value={flare.preset && FLARE_PRESET_IDS.includes(flare.preset as never) ? flare.preset : "anamorphic-blue"}
            onChange={(event) => onApply(change({ preset: event.target.value as LensFlarePreset }), `${name} look changed`)}
          >
            {FLARE_PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {flarePresetLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <small className="lf-hint">{flarePresetHint(flare.preset)}</small>
        {slider("Brightness", resolved.intensity, 0, 1, 0.01, percent, `lf-flare-${order}-intensity`, (v) => change({ intensity: v }))}
        {following ? (
          <small className="lf-hint">Sits on Light {(flare.linkToLight ?? 0) + 1} and moves with it.</small>
        ) : (
          <div className="lf-pair">
            {slider("Across", resolved.x, 0, 100, 0.5, (v) => `${Math.round(v)}%`, `lf-flare-${order}-x`, (v) => change({ x: v }))}
            {slider("Down", resolved.y, 0, 100, 0.5, (v) => `${Math.round(v)}%`, `lf-flare-${order}-y`, (v) => change({ y: v }))}
          </div>
        )}
        {lights.length > 0 && (
          <div className="lf-row">
            <span className="control-label">Position</span>
            <select
              data-testid={`lf-flare-${order}-follow`}
              aria-label={`${name} position`}
              value={following ? String(flare.linkToLight) : "free"}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "free") onApply(change({ linkToLight: undefined, x: resolved.x, y: resolved.y }), `${name} set free`);
                else onApply(change({ linkToLight: Number(value) }), `${name} follows Light ${Number(value) + 1}`);
              }}
            >
              <option value="free">Place it myself</option>
              {lights.map((_, i) => (
                <option key={i} value={String(i)}>
                  Follow Light {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}
        <details className="lf-more">
          <summary>More flare controls</summary>
          {slider("Streak", resolved.streakIntensity, 0, 1, 0.01, percent, `lf-flare-${order}-streak`, (v) => change({ streakIntensity: v }))}
          {slider("Ghosts", resolved.ghostIntensity, 0, 1, 0.01, percent, `lf-flare-${order}-ghosts`, (v) => change({ ghostIntensity: v }))}
          {slider("Starburst", resolved.starburstIntensity, 0, 1, 0.01, percent, `lf-flare-${order}-starburst`, (v) => change({ starburstIntensity: v }))}
        </details>
      </CardShell>
    );
  };

  return (
    <section className="inspector-section lights-panel" data-testid="lights-flares-panel">
      <span className="section-title">
        <b>Lights &amp; flares</b>
        <small>{total === 0 ? "NONE YET" : `${total} ON THIS SHOT`}</small>
      </span>
      <div className="lf-add-row">
        <AddMenu
          label="+ Light"
          items={LIGHT_PRESETS}
          disabled={disabled}
          testId="add-light"
          onPick={(item) => {
            const { patch, target } = addLight(cinematic, item.id);
            onApply(patch, `${item.label} added`);
            if (props.dissolvingIn) props.onShowShot?.();
            select(target, canPlaceOnViewer);
          }}
        />
        <AddMenu
          label="+ Lens flare"
          items={FLARE_PRESET_IDS.map((id) => ({ id, label: flarePresetLabel(id), hint: flarePresetHint(id) }))}
          disabled={disabled}
          testId="add-flare"
          onPick={(item) => {
            const { patch, target } = addFlare(cinematic, item.id as LensFlarePreset);
            onApply(patch, `${item.label} flare added`);
            if (props.dissolvingIn) props.onShowShot?.();
            select(target, canPlaceOnViewer);
          }}
        />
      </div>
      {edit.placing && edit.target && (
        <div className="lf-placing" data-testid="lf-placing-hint" role="status">
          <span>Click on the picture to place it.</span>
          <button type="button" className="field-reset" data-testid="lf-placing-done" onClick={() => select(edit.target, false)}>
            Done
          </button>
        </div>
      )}
      {props.dissolvingIn && total > 0 && !disabled && (
        <p className="lf-dissolve-note" data-testid="lf-dissolve-note" role="status">
          <span>The viewer is still dissolving in from the previous shot, so these glows are hard to see yet.</span>
          <button type="button" className="field-reset" data-testid="lf-show-shot" onClick={() => props.onShowShot?.()}>
            Show the shot
          </button>
        </p>
      )}
      {disabled ? (
        <p className="inspector-note">Choose a picture for this shot first.</p>
      ) : total === 0 ? (
        <p className="inspector-note" data-testid="lf-empty">
          Nothing yet. Add a light for a glow (a lamp, a window, neon) or a lens flare for streaks and ghosts, then click the picture to place it.
        </p>
      ) : (
        <div className="lf-cards">
          {lights.map((light, index) => lightCard(light, index))}
          {flares.map(({ ref, flare }, order) => flareCard(flare, { kind: "flare", ref }, order))}
        </div>
      )}
      <div className="lf-row lf-noir">
        <span className="control-label" title="Lighting looks borrowed from classic noir: a hard eye light, window-blind slats, a key slash or a rim light">
          Noir lighting
        </span>
        <select
          data-testid="lf-noir-lighting"
          aria-label="Noir lighting"
          disabled={disabled}
          value={props.noirLighting ?? ""}
          onChange={(event) => onApply({ hitchcockLighting: event.target.value || undefined }, "Noir lighting changed")}
        >
          {NOIR_LIGHTING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
