import { useEffect, useRef, useState } from "react";
import { MIAMI_VICE_CAST_REFERENCES } from "../core/miamiViceCharacters";

interface MiamiViceCastProps {
  onClose: () => void;
}

export function MiamiViceCast({ onClose }: MiamiViceCastProps) {
  const [selectedId, setSelectedId] = useState(MIAMI_VICE_CAST_REFERENCES[0].id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const selectedIndex = MIAMI_VICE_CAST_REFERENCES.findIndex((item) => item.id === selectedId);
  const selected = MIAMI_VICE_CAST_REFERENCES[Math.max(0, selectedIndex)];

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop character-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => {
        // While browsing the cast, editor shortcuts must not change the timeline.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        } else if (event.key === "Tab" && dialogRef.current) {
          const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section ref={dialogRef} className="character-modal" role="dialog" aria-modal="true" aria-labelledby="miami-cast-title">
        <header className="character-modal-header">
          <div>
            <span className="character-eyebrow">MIAMI VICE / SALT WATER</span>
            <h2 id="miami-cast-title">Cast references</h2>
            <p>The squad, the charity and the federal man</p>
          </div>
          <div className="character-header-actions">
            <button ref={closeRef} className="icon-button close-button" onClick={onClose} aria-label="Close cast references">
              ×
            </button>
          </div>
        </header>

        <div className="character-modal-body">
          <nav className="character-cast" aria-label="Select a character">
            <div className="character-cast-label">
              THE CAST <span>{MIAMI_VICE_CAST_REFERENCES.length.toString().padStart(2, "0")}</span>
            </div>
            <div className="character-cast-list">
              {MIAMI_VICE_CAST_REFERENCES.map((character) => (
                <button
                  type="button"
                  className={`character-cast-item ${character.id === selected.id ? "is-selected" : ""}`}
                  key={character.id}
                  aria-pressed={character.id === selected.id}
                  onClick={() => setSelectedId(character.id)}
                  data-testid={`miami-cast-${character.id}`}
                >
                  <img src={character.preview} alt="" loading="lazy" />
                  <span>
                    <strong>{character.name}</strong>
                    <small>{character.role}</small>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <article className="character-detail" aria-live="polite">
            <div className="character-portrait">
              <img src={selected.preview} alt={`Casting portrait of ${selected.name}`} data-testid="miami-cast-portrait" />
              <span>SELECTED CASTING LOOK</span>
            </div>
            <div className="character-copy">
              <span className="character-eyebrow">
                CAST {String(selectedIndex + 1).padStart(2, "0")} / {MIAMI_VICE_CAST_REFERENCES.length}
              </span>
              <h3>{selected.name}</h3>
              <p className="character-role">
                {selected.role} <i>·</i> {selected.age}
              </p>
              <p className="character-summary">{selected.summary}</p>
              <dl className="character-notes">
                <dt>WARDROBE / LOOK</dt>
                <dd>{selected.look}</dd>
                <dt>CONTINUITY</dt>
                <dd>{selected.continuity}</dd>
              </dl>
              <a
                className="button button-quiet character-original-link"
                href={selected.original}
                download={`${selected.id}.png`}
                title="Download the original casting portrait PNG from the accompanying assets folder"
                data-testid="miami-cast-original"
              >
                Original PNG ↓
              </a>
              <small className="character-download-hint">Full-size original when the editor's assets folder is available.</small>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
