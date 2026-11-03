import { formatModelSize, type DepthQuality, type ModelsPanelView } from "../core/depthMaker";

/**
 * "Models": the models the depth and cut-out buttons use, at the chosen quality, with whether each is on this computer, its
 * size and licence, a link to where it comes from, and a button to download it. Nothing is downloaded until a button is
 * pressed, and each model can be downloaded on its own.
 */

export interface ModelsPanelProps {
  view: ModelsPanelView;
  onQuality: (quality: DepthQuality) => void;
  /** Download these models (ids from the list). */
  onDownload: (ids: string[]) => void;
  /** Open it (a cut-out button is waiting for models). */
  open?: boolean;
}

const QUALITY_LABEL: Record<DepthQuality, string> = { best: "Best", fast: "Fast" };
const QUALITY_HINT: Record<DepthQuality, string> = {
  best: "The largest models. Best edges and depth; Depth Anything Large is for non-commercial use only.",
  fast: "Small models with permissive licences (Apache-2.0, MIT). Lighter to download and quicker on a CPU.",
};

export function ModelsPanel({ view, onQuality, onDownload, open }: ModelsPanelProps) {
  const here = view.rows.filter((row) => row.model.cached).length;
  return (
    <details className="models-panel" open={open} data-testid="models-panel" data-all-here={view.allHere}>
      <summary>
        <span>Models</span>
        <small data-testid="models-summary">
          {QUALITY_LABEL[view.quality]} · {here} of {view.rows.length} on this computer
        </small>
      </summary>

      <div className="models-quality" role="group" aria-label="Quality">
        {(["best", "fast"] as const).map((quality) => (
          <button
            key={quality}
            type="button"
            className={`button ${view.quality === quality ? "button-primary" : "button-quiet"}`}
            aria-pressed={view.quality === quality}
            data-testid={`models-quality-${quality}`}
            onClick={() => onQuality(quality)}
          >
            {QUALITY_LABEL[quality]}
          </button>
        ))}
      </div>
      <p className="depth-make-note" data-testid="models-quality-hint">
        {QUALITY_HINT[view.quality]}
      </p>

      <ul className="models-list">
        {view.rows.map(({ model, usedFor }) => (
          <li key={model.id} className={`models-item ${model.cached ? "is-here" : "is-missing"}`} data-testid={`model-${model.id}`} data-cached={model.cached}>
            <div className="models-item-head">
              <span className="models-status" aria-hidden="true">
                {model.cached ? "✓" : "○"}
              </span>
              <strong>{model.title}</strong>
              <span className="models-size">{formatModelSize(model.bytes)}</span>
            </div>
            <div className="models-item-meta">
              <span>{usedFor}</span>
              <span className={model.nonCommercial ? "models-licence is-noncommercial" : "models-licence"} title={model.nonCommercial ? "Not for commercial use" : undefined}>
                {model.license}
              </span>
              <a href={model.source} target="_blank" rel="noreferrer noopener" data-testid={`model-source-${model.id}`} title="The project this model comes from: what it is and its licence">
                Source ↗
              </a>
              <a href={model.url} target="_blank" rel="noreferrer noopener" data-testid={`model-file-${model.id}`} title={`The file itself (${model.file}): download it by hand and put it in the models folder`}>
                File ↗
              </a>
            </div>
            {model.overridden ? (
              <p className="depth-make-note">{model.cached ? "You chose a file of your own for this, so it is used instead." : "You chose a file of your own for this, but it was not found."}</p>
            ) : model.cached ? null : (
              <button type="button" className="button button-quiet" disabled={view.busy} data-testid={`model-download-${model.id}`} onClick={() => onDownload([model.id])}>
                Download
              </button>
            )}
          </li>
        ))}
      </ul>

      {view.missingIds.length > 1 && (
        <button type="button" className="button button-primary" disabled={view.busy} data-testid="models-download-all" onClick={() => onDownload(view.missingIds)}>
          Download all that are missing ({formatModelSize(view.missingBytes)})
        </button>
      )}
      {view.allHere && (
        <p className="depth-make-note is-ok" data-testid="models-all-here">
          All {view.rows.length} are on this computer.
        </p>
      )}
      <p className="depth-make-note">
        Kept in <code>{view.modelsDir}</code>. You can also download a model yourself from its <b>File</b> link and put it there under its own name; it is checked once, then used.
      </p>
    </details>
  );
}
