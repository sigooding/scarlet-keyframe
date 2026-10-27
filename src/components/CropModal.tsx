import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

export interface CropState {
  assetId: string;
  frameId: string;
  x: number;
  y: number;
}

export interface CropModalProps {
  crop: CropState;
  imageSrc?: string;
  onChange: (x: number, y: number) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function CropModal({ crop, imageSrc, onChange, onSave, onSkip }: CropModalProps) {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.round(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)));
    onChange(x, y);
  };

  const previewStyle: CSSProperties = {
    backgroundImage: imageSrc ? `url(${imageSrc})` : undefined,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: `${crop.x}% ${crop.y}%`,
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onSkip()}
    >
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="16:9 picture crop">
        <header className="modal-head">
          <div>
            <span className="eyebrow">NON-DESTRUCTIVE 16:9 FRAMING</span>
            <h2>Position uploaded still</h2>
          </div>
          <button className="icon-button close-button" onClick={onSkip} aria-label="Skip crop">
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="export-copy">
            This image is not 16:9. Drag across the frame or adjust the sliders to set its focal alignment—the original
            uploaded bytes remain untouched.
          </p>

          <div
            className="crop-stage"
            style={previewStyle}
            onPointerDown={(event) => {
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (draggingRef.current) updateFromPointer(event);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
          >
            {!imageSrc && <span className="crop-empty">Preview unavailable</span>}
            <div className="crop-guides" aria-hidden />
            <span
              className="crop-focal-dot"
              style={{ left: `${crop.x}%`, top: `${crop.y}%` }}
              aria-hidden
            />
          </div>

          <div className="crop-controls">
            <div className="field-number">
              <label htmlFor="crop-x">Horizontal ({Math.round(crop.x)}%)</label>
              <div>
                <input
                  id="crop-x"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={crop.x}
                  onChange={(event) => onChange(Number(event.target.value), crop.y)}
                />
                <output>{Math.round(crop.x)}%</output>
              </div>
            </div>
            <div className="field-number">
              <label htmlFor="crop-y">Vertical ({Math.round(crop.y)}%)</label>
              <div>
                <input
                  id="crop-y"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={crop.y}
                  onChange={(event) => onChange(crop.x, Number(event.target.value))}
                />
                <output>{Math.round(crop.y)}%</output>
              </div>
            </div>
            <button className="button button-text" onClick={() => onChange(50, 50)}>
              Center (50% / 50%)
            </button>
          </div>
        </div>

        <footer className="modal-foot">
          <span>16:9 non-destructive crop</span>
          <div className="modal-foot-actions">
            <button className="button button-quiet" onClick={onSkip}>
              Keep default
            </button>
            <button className="button button-primary" onClick={onSave}>
              Save framing
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
