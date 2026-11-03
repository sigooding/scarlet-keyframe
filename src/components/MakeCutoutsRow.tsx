import { formatModelSize, type CutoutsRowView } from "../core/depthMaker";

/**
 * The "Make cutouts" row in the Clip tab's Picture section. For THIS shot only (never a batch): pressing the button asks the
 * editor's server to find the people in this shot's picture, cut each one out, paint in what was behind them and make the
 * depth map that goes with them, so nobody stretches when the camera moves. The layers go on the shot as one undo step, and
 * a review sheet and a list of things to look at say how it went. What the row shows is decided by `cutoutsRowView`.
 */

export interface MakeCutoutsRowProps {
  view: CutoutsRowView;
  onMake: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onCheckAgain: () => void;
  onCopy: (text: string) => void;
  /** Download these models (the ids of the ones that are missing). */
  onDownloadMissing: () => void;
  onCancelDownload: () => void;
}

export function MakeCutoutsRow({ view, onMake, onCancel, onDismiss, onCheckAgain, onCopy, onDownloadMissing, onCancelDownload }: MakeCutoutsRowProps) {
  if (view.kind === "hidden") return null;
  const waiting = view.kind === "checking" || view.kind === "busy" || view.kind === "unavailable";

  return (
    <div className={`depth-make cutouts-make is-${view.kind}`} data-testid="make-cutouts-row" data-state={view.kind}>
      <div className="depth-make-head">
        <span className="control-label">Cutouts</span>
        {(view.kind === "ready" || waiting) && (
          <button
            type="button"
            className="button button-quiet depth-make-button"
            data-testid="make-cutouts-button"
            disabled={waiting}
            onClick={onMake}
            title="Cut the people out of this picture so they do not stretch when the camera moves"
          >
            Make cutouts
          </button>
        )}
        {view.kind === "models-missing" && (
          <button type="button" className="button button-primary depth-make-button" data-testid="make-cutouts-download" onClick={onDownloadMissing}>
            Download models ({formatModelSize(view.bytes)})
          </button>
        )}
        {(view.kind === "running" || view.kind === "downloading") && (
          <button
            type="button"
            className="button button-quiet"
            data-testid="make-cutouts-cancel"
            disabled={!view.cancellable}
            onClick={view.kind === "running" ? onCancel : onCancelDownload}
          >
            Cancel
          </button>
        )}
        {view.kind === "failed" && !view.cancelled && (
          <button type="button" className="button button-quiet" data-testid="make-cutouts-retry" onClick={onMake}>
            Try again
          </button>
        )}
        {view.kind === "failed" && view.cancelled && (
          <button type="button" className="button button-quiet" data-testid="make-cutouts-dismiss" onClick={onDismiss}>
            OK
          </button>
        )}
        {view.kind === "done" && (
          <button type="button" className="button button-quiet" data-testid="make-cutouts-dismiss" onClick={onDismiss}>
            OK
          </button>
        )}
      </div>

      {view.kind === "checking" && (
        <p className="depth-make-note" role="status">
          Checking this computer…
        </p>
      )}

      {view.kind === "unavailable" && (
        <p className="depth-make-note" data-testid="make-cutouts-unavailable">
          Cut-outs are made by the editor&rsquo;s server, and this page has none. Open the app with <code>npm run serve</code> (or <code>npm run dev</code>) to use this button.
        </p>
      )}

      {view.kind === "setup-needed" && (
        <>
          <p className="depth-make-note" data-testid="make-cutouts-setup">
            One-time setup: run <code>{view.command}</code> in the project folder (it installs what depth maps and cut-outs need), then check again.
          </p>
          <div className="depth-make-actions">
            <button type="button" className="button button-quiet" data-testid="make-cutouts-copy" onClick={() => onCopy(view.command)}>
              Copy command
            </button>
            <button type="button" className="button button-quiet" data-testid="make-cutouts-check-again" onClick={onCheckAgain}>
              Check again
            </button>
          </div>
        </>
      )}

      {view.kind === "models-missing" && (
        <p className="depth-make-note" data-testid="make-cutouts-missing">
          Needs {view.missing.length === 1 ? "a model" : `${view.missing.length} models`} that {view.missing.length === 1 ? "is" : "are"} not on this computer yet:{" "}
          {view.missing.map((model) => model.title).join(", ")}. Each is downloaded once; choose which in Models below.
          {view.nonCommercial ? " Depth Anything Large is for non-commercial use only; choose Fast for permissive licences." : ""}
        </p>
      )}

      {view.kind === "downloading" && (
        <div role="status" aria-live="polite">
          <div
            className={`depth-make-bar ${view.percent === null ? "is-indeterminate" : ""}`}
            role="progressbar"
            aria-label="Downloading models"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.percent ?? undefined}
          >
            <span style={view.percent === null ? undefined : { width: `${view.percent}%` }} />
          </div>
          <p className="depth-make-note" data-testid="make-cutouts-phase">
            {view.phase}
          </p>
        </div>
      )}

      {(view.kind === "ready" || view.kind === "busy") && <p className="depth-make-note">{view.note}</p>}

      {view.kind === "running" && (
        <div role="status" aria-live="polite">
          <div
            className={`depth-make-bar ${view.progress === null ? "is-indeterminate" : ""}`}
            role="progressbar"
            aria-label="Making the cut-outs"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.progress ?? undefined}
          >
            <span style={view.progress === null ? undefined : { width: `${Math.max(view.progress, 6)}%` }} />
          </div>
          <p className="depth-make-note" data-testid="make-cutouts-phase">
            {view.phase}
          </p>
        </div>
      )}

      {view.kind === "failed" &&
        (view.cancelled ? (
          // you stopped it yourself: a note, not an error
          <p className="depth-make-note" role="status" data-testid="make-cutouts-cancelled">
            {view.message}
          </p>
        ) : (
          <p className="depth-make-error" role="alert" data-testid="make-cutouts-error">
            {view.message}
          </p>
        ))}

      {view.kind === "done" && (
        <div role="status" aria-live="polite">
          <p className={`depth-make-note ${view.made ? "is-ok" : ""}`} data-testid="make-cutouts-done">
            {view.text}
          </p>
          {view.review && (
            <a className="cutouts-review" href={view.review} target="_blank" rel="noreferrer noopener" data-testid="make-cutouts-review">
              <img src={view.review} alt="Review sheet: the picture with its boxes, the cut-outs on green, the plate, and the depth map" loading="lazy" />
              <span>Review sheet: picture, cut-outs, plate, depth map. Open it full size ↗</span>
            </a>
          )}
          {view.flags.length > 0 && (
            <div className="cutouts-flags" data-testid="make-cutouts-flags">
              <p className="depth-make-note">Worth a look:</p>
              <ul>
                {view.flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          )}
          {view.caution && <p className="depth-make-note">{view.caution}</p>}
          {view.note && <p className="depth-make-note">{view.note}</p>}
        </div>
      )}
    </div>
  );
}
