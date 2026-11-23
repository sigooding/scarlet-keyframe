import { useState } from "react";
import type { LipSyncLine, LipSyncRowView } from "../core/lipSync";

/**
 * The "Lip sync" row in the Clip tab's Picture section: makes this shot's picture speak one of the voice lines heard
 * during it, on this computer's NVIDIA GPU (LatentSync 1.5), and cuts the clip into the shot on the exact frames of the
 * line, as one undo step. The mouth moves; the head and eyes stay as the picture has them.
 */
export interface MakeLipSyncRowProps {
  view: LipSyncRowView;
  onMake: (line: LipSyncLine) => void;
  onCancel: () => void;
  onDismiss: () => void;
  onCheckAgain: () => void;
}

export function MakeLipSyncRow({ view, onMake, onCancel, onDismiss, onCheckAgain }: MakeLipSyncRowProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  if (view.kind === "hidden") return null;
  const lines = view.kind === "ready" ? view.lines : [];
  const line = lines.find((l) => l.id === chosen) ?? lines[0];

  return (
    <div className={`depth-make lipsync-make is-${view.kind}`} data-testid="make-lipsync-row" data-state={view.kind}>
      <div className="depth-make-head">
        <span className="control-label">Lip sync</span>
        {view.kind === "ready" && line && (
          <button
            type="button"
            className="button button-quiet depth-make-button"
            data-testid="make-lipsync-button"
            disabled={view.busyElsewhere}
            title="Make this shot's picture speak the chosen line, on this computer's GPU, and cut the clip into the shot"
            onClick={() => onMake(line)}
          >
            Make lip sync
          </button>
        )}
        {view.kind === "running" && (
          <button type="button" className="button button-quiet" data-testid="make-lipsync-cancel" disabled={!view.cancellable} onClick={onCancel}>
            Cancel
          </button>
        )}
        {(view.kind === "done" || (view.kind === "failed" && view.cancelled)) && (
          <button type="button" className="button button-quiet" data-testid="make-lipsync-dismiss" onClick={onDismiss}>
            OK
          </button>
        )}
        {view.kind === "failed" && !view.cancelled && (
          <button type="button" className="button button-quiet" data-testid="make-lipsync-dismiss" onClick={onDismiss}>
            Back
          </button>
        )}
        {view.kind === "setup" && (
          <button type="button" className="button button-quiet" data-testid="make-lipsync-check" onClick={onCheckAgain}>
            Check again
          </button>
        )}
      </div>

      {view.kind === "ready" && lines.length > 1 && (
        <select className="inspector-select" data-testid="make-lipsync-line" value={line?.id} onChange={(e) => setChosen(e.target.value)}>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} ({((l.to - l.from) / 24).toFixed(1)} s)
            </option>
          ))}
        </select>
      )}
      {view.kind === "ready" && lines.length === 1 && line && <p className="depth-make-note">{line.label}</p>}
      {view.kind === "ready" && view.busyElsewhere && <p className="depth-make-note">Another lip sync is being made; wait for it to finish.</p>}
      {view.kind === "checking" && <p className="depth-make-note" role="status">Checking whether lip sync is set up…</p>}
      {view.kind === "unavailable" && <p className="depth-make-note">Lip sync needs the editor's own server (npm run dev) on a computer with an NVIDIA GPU.</p>}
      {view.kind === "setup" && (
        <p className="depth-make-note">
          One-time setup on this computer (NVIDIA GPU, 8 GB): run <code>{view.command}</code> in the project folder. Missing: {view.missing.join(", ")}.
        </p>
      )}
      {view.kind === "no-lines" && <p className="depth-make-note">No voice line starts during this shot.</p>}
      {view.kind === "running" && (
        <p className="depth-make-note" role="status" data-testid="make-lipsync-status">
          {view.line.label}: {view.current ?? "working…"}
        </p>
      )}
      {view.kind === "done" && (
        <p className="depth-make-note" role="status">
          {view.applied ? "The clip is in the shot (undo to take it out)." : `${view.note ?? "Not put in the shot."} The clip is saved at public${view.video ?? ""}.`}
        </p>
      )}
      {view.kind === "failed" && (
        <p className="depth-make-note" role="alert">
          {view.message}
        </p>
      )}
    </div>
  );
}
