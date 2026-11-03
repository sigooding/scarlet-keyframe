import { useEffect } from "react";
import {
  cutoutsRowView,
  depthRowView,
  modelsPanelView,
  type DepthMakerState,
  type DepthQuality,
  type DepthRowView,
} from "../core/depthMaker";
import { MakeCutoutsRow } from "./MakeCutoutsRow";
import { ModelsPanel } from "./ModelsPanel";

/**
 * The "Make depth map" row in the Clip tab's Picture section, and the wrapper that puts it together with the "Make cutouts"
 * row and the models list for the selected shot. Pressing the button asks the editor's server to run `npm run depth` for
 * this shot's picture; the finished map is put on the shot. What each row shows is decided by `depthRowView`
 * (src/core/depthMaker.ts); this file only draws it.
 */

export interface MakeDepthMapRowProps {
  view: DepthRowView;
  onMake: () => void;
  /** Make a new map although the picture has one (the old file is kept beside it). */
  onMakeNew: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onCheckAgain: () => void;
  onCopy: (text: string) => void;
}

export function MakeDepthMapRow({ view, onMake, onMakeNew, onCancel, onDismiss, onCheckAgain, onCopy }: MakeDepthMapRowProps) {
  if (view.kind === "hidden") return null;

  const waiting = view.kind === "checking" || view.kind === "busy" || view.kind === "unavailable";

  return (
    <div className={`depth-make is-${view.kind}`} data-testid="make-depth-row" data-state={view.kind}>
      <div className="depth-make-head">
        <span className="control-label">Depth map</span>
        {view.kind === "ready" && view.existingMap && (
          <span className="depth-make-choices">
            <button type="button" className="button button-quiet depth-make-button" data-testid="make-depth-use" onClick={onMake} title="Use the depth map file that is already there">
              Use it
            </button>
            <button
              type="button"
              className="button button-primary depth-make-button"
              data-testid="make-depth-new"
              onClick={onMakeNew}
              title="Make a new depth map from this picture; the old file is kept beside it"
            >
              Make a new one
            </button>
          </span>
        )}
        {view.kind === "redo" && (
          <button
            type="button"
            className="button button-quiet depth-make-button"
            data-testid="make-depth-redo"
            onClick={onMakeNew}
            title="Make a new depth map from this picture; the old file is kept beside it"
          >
            Make a new one
          </button>
        )}
        {((view.kind === "ready" && !view.existingMap) || waiting) && (
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
        {view.kind === "failed" && !view.cancelled && (
          <button type="button" className="button button-quiet" data-testid="make-depth-retry" onClick={onMake}>
            Try again
          </button>
        )}
        {view.kind === "failed" && view.cancelled && (
          <button type="button" className="button button-quiet" data-testid="make-depth-dismiss" onClick={onDismiss}>
            OK
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

      {(view.kind === "ready" || view.kind === "busy" || view.kind === "redo") && <p className="depth-make-note">{view.note}</p>}

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

      {view.kind === "failed" &&
        (view.cancelled ? (
          // you stopped it yourself: a note, not an error
          <p className="depth-make-note" role="status" data-testid="make-depth-cancelled">
            {view.message}
          </p>
        ) : (
          <p className="depth-make-error" role="alert" data-testid="make-depth-error">
            {view.message}
          </p>
        ))}

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

/** What the Inspector gets from the app: the state, and the things the rows can ask for. */
export interface DepthMakerBinding {
  state: DepthMakerState;
  onCheck: (fresh?: boolean) => void;
  /** `replace`: make a new map although the picture has one (the old file is kept beside it). */
  onMake: (frameId: string, picture: string, options?: { replace?: boolean }) => void;
  /** The picture's own depth map file when it is already on disk (so the row can offer to use it or make a new one). */
  existingMapFor?: (picture: string) => string | undefined;
  /** Cut the people out of this shot's picture; `sourceMap` is a depth map the shot already has, to keep. */
  onMakeCutouts: (frameId: string, picture: string, sourceMap?: string) => void;
  onDownload: (ids: string[]) => void;
  onQuality: (quality: DepthQuality) => void;
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

/** The depth map row, the cut-outs row and the models list for ONE shot: asks what this computer can do the first time it is needed. */
export function DepthToolsForShot({
  frameId,
  picture,
  hasDepthMap,
  hasCutouts,
  keptMap,
  maker,
}: {
  frameId: string;
  picture: string | undefined;
  hasDepthMap: boolean;
  hasCutouts: boolean;
  /** The shot's depth map when the cut-outs can keep it (one of the film's, under /film/depth/). */
  keptMap?: string;
  maker: DepthMakerBinding;
}) {
  const now = Date.now();
  const existingMap = picture && !hasDepthMap ? maker.existingMapFor?.(picture) : undefined;
  const depthView = depthRowView({ frameId, picture, hasDepthMap, hasCutouts, existingMap, state: maker.state, now });
  let cutoutsView = cutoutsRowView({ frameId, picture, hasCutouts, keptMap, state: maker.state, now });
  // One explanation is enough when both rows would say the same thing (no server, no setup, still checking).
  if (cutoutsView.kind === depthView.kind && (cutoutsView.kind === "unavailable" || cutoutsView.kind === "setup-needed" || cutoutsView.kind === "checking")) {
    cutoutsView = { kind: "hidden" };
  }
  const panel = modelsPanelView(maker.state);
  const showPanel = panel !== null && (depthView.kind !== "hidden" || cutoutsView.kind !== "hidden");

  const needsCheck = depthView.kind === "checking" || cutoutsView.kind === "checking";
  const { onCheck } = maker;
  useEffect(() => {
    if (needsCheck) onCheck();
  }, [needsCheck, onCheck]);

  return (
    <>
      <MakeDepthMapRow
        view={depthView}
        onMake={() => picture && maker.onMake(frameId, picture)}
        onMakeNew={() => picture && maker.onMake(frameId, picture, { replace: true })}
        onCancel={maker.onCancel}
        onDismiss={maker.onDismiss}
        onCheckAgain={() => onCheck(true)}
        onCopy={copyToClipboard}
      />
      <MakeCutoutsRow
        view={cutoutsView}
        onMake={() => picture && maker.onMakeCutouts(frameId, picture, keptMap)}
        onCancel={maker.onCancel}
        onDismiss={maker.onDismiss}
        onCheckAgain={() => onCheck(true)}
        onCopy={copyToClipboard}
        onDownloadMissing={() => cutoutsView.kind === "models-missing" && maker.onDownload(cutoutsView.missing.map((model) => model.id))}
        onCancelDownload={maker.onCancel}
      />
      {showPanel && panel && <ModelsPanel view={panel} onQuality={maker.onQuality} onDownload={maker.onDownload} open={cutoutsView.kind === "models-missing" || cutoutsView.kind === "downloading"} />}
    </>
  );
}
