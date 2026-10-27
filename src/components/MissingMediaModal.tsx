import { useEffect, useMemo, useState } from "react";

export interface MissingMediaModalProps {
  items: string[];
  folderLabel: string;
  onClose: () => void;
  onLink: () => void;
}

type MediaKindFilter = "all" | "image" | "audio" | "other";

function classifyRef(ref: string): MediaKindFilter {
  if (/\.(?:jpe?g|png|webp|gif|avif|bmp|svg)(?:[?#].*)?$/i.test(ref)) return "image";
  if (/\.(?:mp3|wav|ogg|m4a|aac|flac)(?:[?#].*)?$/i.test(ref) || /^mp3:/i.test(ref)) return "audio";
  return "other";
}

export function MissingMediaModal({ items, folderLabel, onClose, onLink }: MissingMediaModalProps) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const counts = useMemo(() => {
    let image = 0;
    let audio = 0;
    let other = 0;
    for (const item of items) {
      const category = classifyRef(item);
      if (category === "image") image += 1;
      else if (category === "audio") audio += 1;
      else other += 1;
    }
    return { image, audio, other };
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && classifyRef(item) !== kind) return false;
      if (query && !item.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, kind, search]);

  const visible = showAll ? filtered : filtered.slice(0, 250);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-panel modal-panel-wide" role="dialog" aria-modal="true" aria-label="Missing media">
        <header className="modal-head">
          <div>
            <span className="eyebrow">MEDIA RESOLUTION</span>
            <h2>
              {items.length
                ? `${items.length.toLocaleString()} unlinked media ${items.length === 1 ? "path" : "paths"}`
                : "All referenced media is linked"}
            </h2>
          </div>
          <button className="icon-button close-button" onClick={onClose} aria-label="Close missing media window">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="modal-callout">
            <p>
              Pictures, voice takes, music, and sound effects are sourced from{" "}
              <a href="https://github.com/sigooding/scarlett-witness" target="_blank" rel="noreferrer">
                <code>sigooding/scarlett-witness</code>
              </a>{" "}
              (<code>public/</code>). You can also click <strong>Link folder</strong> and select a local{" "}
              <code>scarlett-witness/public</code> checkout to override or bundle local files.
            </p>
            <small>
              {folderLabel
                ? `Currently linked folder: ${folderLabel}`
                : items.length === 0
                  ? "Resolved from sigooding/scarlett-witness"
                  : "No local public folder is linked in this browser tab yet."}
            </small>
          </div>

          {items.length > 0 ? (
            <>
              <div className="modal-toolbar">
                <label className="search-control">
                  <span>⌕</span>
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setShowAll(false);
                    }}
                    placeholder="Filter unresolved media paths"
                  />
                  <kbd>ESC</kbd>
                </label>
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as MediaKindFilter);
                    setShowAll(false);
                  }}
                  aria-label="Filter missing media type"
                >
                  <option value="all">All ({items.length.toLocaleString()})</option>
                  <option value="image">Pictures ({counts.image.toLocaleString()})</option>
                  <option value="audio">Sound & voice ({counts.audio.toLocaleString()})</option>
                  {counts.other > 0 && <option value="other">Other ({counts.other.toLocaleString()})</option>}
                </select>
                <span className="asset-count">{filtered.length.toLocaleString()} shown</span>
              </div>

              <div className="missing-list" role="list">
                {visible.map((item) => (
                  <div className="missing-row" role="listitem" key={item}>
                    <span className="missing-badge">{classifyRef(item).toUpperCase()}</span>
                    <code>{item}</code>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="modal-empty">No missing media paths match this filter.</div>
                )}
                {!showAll && filtered.length > visible.length && (
                  <button className="button button-quiet button-wide" onClick={() => setShowAll(true)}>
                    Show all {filtered.length.toLocaleString()} paths
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="modal-empty">Every picture, voice line, and sound effect in this project is resolved.</div>
          )}
        </div>

        <footer className="modal-foot">
          <span>Unresolved paths are preserved intact when exporting.</span>
          <div className="modal-foot-actions">
            <button className="button button-quiet" onClick={onClose}>
              Close
            </button>
            <button className="button button-primary" onClick={onLink}>
              Link folder
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
