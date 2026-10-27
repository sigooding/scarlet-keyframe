import type { ProjectState } from "../core/model";
import { timecode } from "../core/timing";

interface TopbarProps {
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
}

export function Topbar(props: TopbarProps) {
  const { project } = props;
  return (
    <header className="topbar" data-history={props.historyVersion}>
      <div className="topbar-brand">
        <span className="wordmark">FRAME<span>/24</span></span>
        <div className="topbar-title">
          <strong>{project.title}</strong>
          <small>{project.sourceName} · {timecode(props.totalDuration)} · 24 fps</small>
        </div>
      </div>

      <div className="topbar-status">
        <span className="status-pill">{props.saveStatus}</span>
        <span className="status-note" title="Last edit">{props.editLabel}</span>
      </div>

      <div className="topbar-actions">
        <div className="button-group">
          <button className="button button-quiet" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (⌘Z / Ctrl+Z)">↶ Undo</button>
          <button className="button button-quiet" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (⇧⌘Z)">↷ Redo</button>
        </div>
        <div className="button-group">
          <button className="button button-quiet" onClick={props.onImport} title="Open a .reel.json film">Import…</button>
          <button className="button button-quiet" onClick={props.onLinkFolder} title={props.folderLabel || "Link the media folder that holds the pictures and voices"}>
            {props.folderLabel ? `Folder: ${props.folderLabel}` : "Link media folder…"}
          </button>
        </div>
        <div className="button-group">
          <button className={`button button-quiet ${props.missingCount ? "has-warning" : ""}`} onClick={props.onMissing} title="Media that is referenced but not linked">
            {props.missingCount ? `${props.missingCount} missing media` : "Media linked"}
          </button>
          <button className="button button-quiet" onClick={props.onSnapshot}>Snapshot</button>
          <button className="button button-quiet" onClick={props.onSave} title="Save to this browser now (⌘S)">Save</button>
          <button className="button button-primary" onClick={props.onExport}>Export…</button>
        </div>
      </div>
    </header>
  );
}
