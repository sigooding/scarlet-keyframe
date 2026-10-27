import type { ProjectState } from "../core/model";
import { FPS, formatTimecode } from "../core/timing";

export interface TopbarProps {
  project: ProjectState;
  saveStatus: string;
  historyVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onLinkFolder: () => void;
  folderLabel: string;
  onSnapshot: () => void;
  onExport: () => void;
  onSave: () => void;
  missingCount: number;
  onMissing: () => void;
  editLabel: string;
  totalDuration: number;
  onConvertAllToKeyframes?: () => void;
}

function formatTotalRuntime(seconds: number): string {
  const frames = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * FPS));
  return formatTimecode(frames);
}

export function Topbar({
  project,
  saveStatus,
  historyVersion,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onLinkFolder,
  folderLabel,
  onSnapshot,
  onExport,
  onSave,
  missingCount,
  onMissing,
  editLabel,
  totalDuration,
  onConvertAllToKeyframes,
}: TopbarProps) {
  const statusTone = saveStatus.includes("FAILED")
    ? "is-danger"
    : saveStatus.includes("UNSAVED") || saveStatus.includes("SAVING")
      ? "is-pending"
      : "is-saved";

  return (
    <header className="topbar" data-history-version={historyVersion}>
      <div className="topbar-left">
        <div className="topbar-wordmark">
          FRAME<span>/24</span>
        </div>
        <div className="topbar-divider" aria-hidden />
        <div className="topbar-project">
          <strong className="topbar-title">{project.title}</strong>
          <span className="topbar-subtitle">
            <span>{formatTotalRuntime(totalDuration)} EST</span>
            <i>·</i>
            <span>{editLabel}</span>
          </span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-history" role="group" aria-label="Edit history">
          <button
            className="icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl/Cmd+Shift+Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <span className={`topbar-save-status ${statusTone}`}>{saveStatus}</span>

        <button
          className={`topbar-missing-pill ${missingCount > 0 ? "has-missing" : "all-linked"}`}
          onClick={onMissing}
          title={missingCount > 0 ? "Inspect unlinked media paths" : "All referenced media is available"}
        >
          <i />
          <span>
            {missingCount > 0
              ? `${missingCount.toLocaleString()} unlinked`
              : "Media linked"}
          </span>
        </button>
      </div>

      <div className="topbar-actions">
        {onConvertAllToKeyframes && (
          <button
            className="button button-quiet"
            data-testid="topbar-convert-all-keyframes-btn"
            onClick={onConvertAllToKeyframes}
            title="Convert all preset and depth moves in this project into editable keyframes (one undo step)"
          >
            Convert all to keyframes
          </button>
        )}
        <button className="button button-quiet" onClick={onImport}>
          Import
        </button>
        <button
          className={`button button-quiet ${folderLabel ? "is-linked" : ""}`}
          onClick={onLinkFolder}
          title="Select Scarlet Reel's public folder to resolve pictures and audio"
        >
          {folderLabel ? `Linked: ${folderLabel}` : "Link folder"}
        </button>
        <button className="button button-quiet" onClick={onSnapshot}>
          Snapshots{project.snapshots.length > 0 ? ` (${project.snapshots.length})` : ""}
        </button>
        <button className="button button-quiet" onClick={onSave} title="Save to browser storage (Ctrl/Cmd+S)">
          Save
        </button>
        <button className="button button-primary" onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}
