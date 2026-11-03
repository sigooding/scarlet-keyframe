import { useEffect } from "react";
import { depthRowView, type DepthMakerState, type DepthRowView } from "../core/depthMaker";

/**
 * The "Make depth map" row in the Clip tab's Picture section. Pressing the button asks the editor's server to run
 * `npm run depth` for this shot's picture; the finished map is put on the shot. What the row shows for each situation
 * is decided by `depthRowView` (src/core/depthMaker.ts); this file only draws it.
 */

export interface MakeDepthMapRowProps {
  view: DepthRowView;
  onMake: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onCheckAgain: () => void;
  onCopy: (text: string) => void;
}

export function MakeDepthMapRow({ view, onMake, onCancel, onDismiss, onCheckAgain, onCopy }: MakeDepthMapRowProps) {
  if (view.kind === "hidden") return null;

  const waiting = view.kind === "checking" || view.kind === "busy" || view.kind === "unavailable";

  return (
    <div className={`depth-make is-${view.kind}`} data-testid="make-depth-row" data-state={view.kind}>
      <div className="depth-make-head">
        <span className="control-label">Depth map</span>
        {(view.kind === "ready" || waiting) && (
          <button
            type="button"
            className="button button-primary depth-make-button"
            data-testid="make-depth-button"
            disabled={waiting}
            onClick={onMake}
            title="Make a depth map from this picture, so it moves in 3D when the camera does"
          >
            Make depth map
          </button>
        )}
        {view.kind === "running" && (
          <button type="button" className="button button-quiet" data-testid="make-depth-cancel" disabled={!view.cancellable} onClick={onCancel}>
            Cancel
          </button>
        )}
        {view.kind === "failed" && (
          <button type="button" className="button button-quiet" data-testid="make-depth-retry" onClick={onMake}>
            Try again
          </button>
        )}
        {view.kind === "done" && (
          <button type="button" className="button button-quiet" data-testid="make-depth-dismiss" onClick={onDismiss}>
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
        <p className="depth-make-note" data-testid="make-depth-unavailable">
          Depth maps are made by the editor&rsquo;s server, and this page has none. Open the app with <code>npm run serve</code> (or{" "}
          <code>npm run dev</code>) to use this button.
        </p>
      )}

      {view.kind === "setup-needed" && (
        <>
          <p className="depth-make-note" data-testid="make-depth-setup">
            One-time setup: run <code>{view.command}</code> in the project folder (it installs what depth maps need), then check again.
          </p>
          <div className="depth-make-actions">
            <button type="button" className="button button-quiet" data-testid="make-depth-copy" onClick={() => onCopy(view.command)}>
              Copy command
            </button>
            <button type="button" className="button button-quiet" data-testid="make-depth-check-again" onClick={onCheckAgain}>
              Check again
            </button>
          </div>
        </>
      )}

      {(view.kind === "ready" || view.kind === "busy") && <p className="depth-make-note">{view.note}</p>}

      {view.kind === "running" && (
        <div role="status" aria-live="polite">
          <div
            className={`depth-make-bar ${view.percent === null ? "is-indeterminate" : ""}`}
            role="progressbar"
            aria-label="Making the depth map"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.percent ?? undefined}
          >
            <span style={view.percent === null ? undefined : { width: `${view.percent}%` }} />
          </div>
          <p className="depth-make-note" data-testid="make-depth-phase">
            {view.phase}
          </p>
        </div>
      )}

      {view.kind === "failed" && (
        <p className="depth-make-error" role="alert" data-testid="make-depth-error">
          {view.message}
        </p>
      )}

      {view.kind === "done" && (
        <div role="status" aria-live="polite">
          <p className="depth-make-note is-ok" data-testid="make-depth-done">
            {view.text}
          </p>
          {view.caution && <p className="depth-make-note">{view.caution}</p>}
          {view.note && <p className="depth-make-note">{view.note}</p>}
        </div>
      )}
    </div>
  );
}

/** What the Inspector gets from the app: the state, and the things the row can ask for. */
export interface DepthMakerBinding {
  state: DepthMakerState;
  onCheck: (fresh?: boolean) => void;
  onMake: (frameId: string, picture: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
}

function copyToClipboard(text: string) {
  try {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  } catch {
    /* no clipboard here */
  }
}

/** The row for one shot: works out what to show and asks what this computer can do the first time it is needed. */
export function MakeDepthMapForShot({
  frameId,
  picture,
  hasDepthMap,
  maker,
}: {
  frameId: string;
  picture: string | undefined;
  hasDepthMap: boolean;
  maker: DepthMakerBinding;
}) {
  const view = depthRowView({ frameId, picture, hasDepthMap, state: maker.state, now: Date.now() });
  const needsCheck = view.kind === "checking";
  const { onCheck } = maker;
  useEffect(() => {
    if (needsCheck) onCheck();
  }, [needsCheck, onCheck]);

  return (
    <MakeDepthMapRow
      view={view}
      onMake={() => picture && maker.onMake(frameId, picture)}
      onCancel={maker.onCancel}
      onDismiss={maker.onDismiss}
      onCheckAgain={() => onCheck(true)}
      onCopy={copyToClipboard}
    />
  );
}

