import { useEffect } from "react";
import type { ProjectState } from "../core/model";

export interface SnapshotModalProps {
  project: ProjectState;
  name: string;
  setName: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
}

export function SnapshotModal({
  project,
  name,
  setName,
  onSave,
  onClose,
  onRestore,
}: SnapshotModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const orderedSnapshots = [...project.snapshots].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Project snapshots">
        <header className="modal-head">
          <div>
            <span className="eyebrow">VERSION HISTORY</span>
            <h2>Snapshots</h2>
          </div>
          <button className="icon-button close-button" onClick={onClose} aria-label="Close snapshots window">
            ×
          </button>
        </header>

        <div className="modal-body">
          <form
            className="snapshot-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <input
              autoFocus
              className="text-control"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Cut ${new Date().toLocaleDateString()}`}
              aria-label="Snapshot name"
            />
            <button type="submit" className="button button-primary">
              Save snapshot
            </button>
          </form>

          <div className="snapshot-list">
            {orderedSnapshots.length > 0 ? (
              orderedSnapshots.map((snapshot) => {
                const beatCount = snapshot.story.scenes.reduce(
                  (sum, scene) => sum + (scene.dialogueBeats?.length ?? 0),
                  0,
                );
                return (
                  <div className="snapshot-row" key={snapshot.id}>
                    <div className="snapshot-row-copy">
                      <strong>{snapshot.name}</strong>
                      <small>
                        {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.story.scenes.length} scenes ·{" "}
                        {beatCount.toLocaleString()} beats
                      </small>
                    </div>
                    <button
                      className="button button-quiet"
                      onClick={() => {
                        onRestore(snapshot.id);
                        onClose();
                      }}
                    >
                      Restore
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="modal-empty">
                No snapshots saved yet. Name a cut above to bookmark the current sequence, pictures, and camera moves.
              </div>
            )}
          </div>
        </div>

        <footer className="modal-foot">
          <span>Snapshots are saved inside this browser project.</span>
          <button className="button button-quiet" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
