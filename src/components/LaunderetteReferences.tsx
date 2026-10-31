import { useEffect, useRef, useState } from "react";
import "../launderette.css";
import {
  SWEET_JESUS_LAUNDERETTE_REFERENCES,
  SWEET_JESUS_LAUNDERETTE_SHEETS_PDF,
  SWEET_JESUS_OPENING_STORYBOARD_PDF,
} from "../core/sweetJesusLaunderette";

interface LaunderetteReferencesProps {
  onClose: () => void;
  onFillOpening: () => void;
  emptyOpeningCount: number;
}

export function LaunderetteReferences({ onClose, onFillOpening, emptyOpeningCount }: LaunderetteReferencesProps) {
  const [selectedId, setSelectedId] = useState(SWEET_JESUS_LAUNDERETTE_REFERENCES[0].id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const selected = SWEET_JESUS_LAUNDERETTE_REFERENCES.find((item) => item.id === selectedId) ?? SWEET_JESUS_LAUNDERETTE_REFERENCES[0];

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  return (
    <div
      className="modal-backdrop location-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => {
        // Block timeline shortcuts while reference browsing and keep focus inside the dialog.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "Tab" && dialogRef.current) {
          const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }
      }}
    >
      <section ref={dialogRef} className="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
        <header className="location-header">
          <div className="location-title">
            <span className="character-eyebrow">SWEET JESUS / BROOKLYN, 1975</span>
            <h2 id="location-modal-title">Sunny's Wash-n-Dry</h2>
            <p>Voted set, props and opening continuity</p>
          </div>
          <div className="location-header-actions">
            <a className="button button-quiet" href={SWEET_JESUS_LAUNDERETTE_SHEETS_PDF}
              download="sweet-jesus-launderette-sheets.pdf" data-testid="launderette-sheets-pdf">Style sheets ↓</a>
            <a className="button button-quiet" href={SWEET_JESUS_OPENING_STORYBOARD_PDF}
              download="sweet-jesus-opening-storyboard.pdf" data-testid="opening-storyboard-pdf">Opening boards ↓</a>
            <button ref={closeRef} className="icon-button close-button" onClick={onClose} aria-label="Close launderette references">×</button>
          </div>
        </header>
        <div className="location-body">
          <nav className="location-nav" aria-label="Select a launderette reference">
            <span className="location-nav-label">LOCATION FILE <b>04</b></span>
            <div className="location-nav-list">
              {SWEET_JESUS_LAUNDERETTE_REFERENCES.map((ref) => (
                <button type="button" key={ref.id} className={`location-nav-item ${ref.id === selected.id ? "is-selected" : ""}`}
                  aria-pressed={ref.id === selected.id} onClick={() => setSelectedId(ref.id)} data-testid={`launderette-${ref.id}`}>
                  <img src={ref.preview} alt="" loading="lazy" />
                  <span><small>{ref.kicker.split(" /")[0]}</small><strong>{ref.title}</strong></span>
                </button>
              ))}
            </div>
          </nav>
          <article className="location-detail" aria-live="polite">
            <div className="location-visual-column">
              <div className={`location-picture ${selected.id === "cassette-with-mic" ? "is-prop" : ""}`}>
                <img src={selected.preview} alt={selected.alt} data-testid="launderette-reference-image" />
                <span>SELECTED REFERENCE</span>
              </div>
              <div className="location-opening-note">
                <strong>OPENING SCENE / 22 BEATS</strong>
                <p>Seven illustrative stills repeat across the editable beats. The washer two-shot combines the selected image and recorder; the extra-wide newspaper image is letterboxed. Dialogue and sound are captioned, not recorded. The PDF shows the original draft, not later timeline edits.</p>
                <button type="button" className="button button-quiet" onClick={() => { if (emptyOpeningCount > 0) onFillOpening(); }}
                  aria-disabled={emptyOpeningCount === 0} data-testid="fill-opening-shots">
                  {emptyOpeningCount ? `Fill ${emptyOpeningCount} empty opening ${emptyOpeningCount === 1 ? "shot" : "shots"}` : "No empty opening shots to fill"}
                </button>
                <small>Only blank shots are filled. Existing pictures, deliberate gaps, dialogue, timing and captions are left untouched.</small>
              </div>
            </div>
            <div className="location-copy">
              <span className="character-eyebrow">{selected.kicker}</span>
              <h3>{selected.title}</h3>
              <p className="location-subtitle">{selected.subtitle}</p>
              <p className="location-summary">{selected.summary}</p>
              <dl className="character-notes">
                <dt>DESIGN / STAGING</dt><dd>{selected.design}</dd>
                <dt>CONTINUITY LOCK</dt><dd>{selected.continuity}</dd>
              </dl>
              <a className="button button-quiet character-original-link" href={selected.original}
                download={selected.original.split("/").pop()} data-testid="launderette-original"
                title="Download the selected full-size reference from the accompanying assets folder">Original reference ↓</a>
              <small className="character-download-hint">Full-size original when the editor's assets folder is available.</small>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
