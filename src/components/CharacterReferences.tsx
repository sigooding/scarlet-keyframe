import { useEffect, useRef, useState } from "react";
import {
  SWEET_JESUS_CHARACTER_REFERENCES,
  SWEET_JESUS_CHARACTER_SHEETS_PDF,
} from "../core/sweetJesusCharacters";

interface CharacterReferencesProps {
  onClose: () => void;
}

export function CharacterReferences({ onClose }: CharacterReferencesProps) {
  const [selectedId, setSelectedId] = useState(SWEET_JESUS_CHARACTER_REFERENCES[0].id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const selectedIndex = SWEET_JESUS_CHARACTER_REFERENCES.findIndex((item) => item.id === selectedId);
  const selected = SWEET_JESUS_CHARACTER_REFERENCES[Math.max(0, selectedIndex)];

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
      <section ref={dialogRef} className="character-modal" role="dialog" aria-modal="true" aria-labelledby="character-modal-title">
        <header className="character-modal-header">
          <div>
            <span className="character-eyebrow">SWEET JESUS / BROOKLYN, 1975</span>
            <h2 id="character-modal-title">Character references</h2>
            <p>Voted cast looks and continuity notes</p>
          </div>
          <div className="character-header-actions">
            <a
              className="button button-quiet character-pdf-link"
              href={SWEET_JESUS_CHARACTER_SHEETS_PDF}
              download="sweet-jesus-character-sheets.pdf"
              data-testid="character-sheets-pdf"
            >
              Download sheets ↓
            </a>
            <button ref={closeRef} className="icon-button close-button" onClick={onClose} aria-label="Close character references">×</button>
          </div>
        </header>

        <div className="character-modal-body">
          <nav className="character-cast" aria-label="Select a character">
            <div className="character-cast-label">THE CAST <span>{SWEET_JESUS_CHARACTER_REFERENCES.length.toString().padStart(2, "0")}</span></div>
            <div className="character-cast-list">
              {SWEET_JESUS_CHARACTER_REFERENCES.map((character) => (
                <button
                  type="button"
                  className={`character-cast-item ${character.id === selected.id ? "is-selected" : ""}`}
                  key={character.id}
                  aria-pressed={character.id === selected.id}
                  onClick={() => setSelectedId(character.id)}
                  data-testid={`character-${character.id}`}
                >
                  <img src={character.preview} alt="" loading="lazy" />
                  <span><strong>{character.name}</strong><small>{character.role}</small></span>
                </button>
              ))}
            </div>
          </nav>

          <article className="character-detail" aria-live="polite">
            <div className="character-portrait">
              <img src={selected.preview} alt={`Full-body reference portrait of ${selected.name}`} data-testid="character-portrait" />
              <span>SELECTED CHARACTER LOOK</span>
            </div>
            <div className="character-copy">
              <span className="character-eyebrow">CHARACTER {String(selectedIndex + 1).padStart(2, "0")} / {SWEET_JESUS_CHARACTER_REFERENCES.length}</span>
              <h3>{selected.name}</h3>
              <p className="character-role">{selected.role} <i>·</i> {selected.age}</p>
              <p className="character-summary">{selected.summary}</p>
              <dl className="character-notes">
                <dt>WARDROBE / LOOK</dt><dd>{selected.look}</dd>
                <dt>CONTINUITY</dt><dd>{selected.continuity}</dd>
              </dl>
              <a
                className="button button-quiet character-original-link"
                href={selected.original}
                download={`${selected.id}.png`}
                title="Download the original user-selected portrait PNG from the accompanying assets folder"
                data-testid="character-original"
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
